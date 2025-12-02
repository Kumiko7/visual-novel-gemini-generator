import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Scene, ParsedLine, VisualNovelConcept, CharacterProfile } from '../types';
import * as geminiService from '../services/geminiService';
import { parseDialogue } from '../utils/parser';

interface VisualNovelDisplayProps {
  scene: Scene;
  sceneIndex: number;
  currentLineIndex: number;
  concept: VisualNovelConcept;
  onAdvance: () => void;
  onOpenBacklog: () => void;
  isNextSceneReady: boolean;
  isLoadingNextScene: boolean;
  onVoiceGenerated: (sceneIndex: number, lineIndex: number, url: string) => void;
}

const findCharacter = (name: string, concept: VisualNovelConcept): CharacterProfile | null => {
    if (!name) return null;
    const lowerName = name.toLowerCase();
    // Exact match first
    let found = concept.characters.find(c => c.name.toLowerCase() === lowerName);
    if (found) return found;
    // Then check if full name includes dialogue name (e.g., "Kenji" in "Kenji Tanaka")
    found = concept.characters.find(c => c.name.toLowerCase().includes(lowerName));
    if (found) return found;
    return null;
};


const VisualNovelDisplay: React.FC<VisualNovelDisplayProps> = ({ 
    scene, sceneIndex, currentLineIndex, concept, onAdvance, onOpenBacklog, isNextSceneReady, isLoadingNextScene, onVoiceGenerated 
}) => {
  const [voiceData, setVoiceData] = useState<Record<number, { url: string | null; isLoading: boolean }>>({});
  
  const musicAudioRef = useRef<HTMLAudioElement>(null);
  const dialogueAudioRef = useRef<HTMLAudioElement>(null);
  const isMounted = useRef(true);
  const prevSceneIndexRef = useRef<number | null>(null);

  const parsedLinesRaw = useMemo(() => parseDialogue(scene.text), [scene.text]);
  const lines: ParsedLine[] = useMemo(() => {
    return parsedLinesRaw.map((line, index) => ({
        ...line,
        voiceUrl: voiceData[index]?.url,
        isLoadingVoice: voiceData[index]?.isLoading ?? false,
    }));
  }, [parsedLinesRaw, voiceData]);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Main effect to handle scene changes and updates
  useEffect(() => {
    const isNewScene = prevSceneIndexRef.current !== sceneIndex;

    if (isNewScene) {
      // Full reset of voice data for a new scene
      const initialData: Record<number, { url: string | null; isLoading: boolean }> = {};
      if (scene.voiceUrls) {
        for (const key in scene.voiceUrls) {
          initialData[parseInt(key, 10)] = { url: scene.voiceUrls[key], isLoading: false };
        }
      }
      setVoiceData(initialData);
      
      // Reset music for a new scene
      if (musicAudioRef.current && scene.musicUrl) {
        if (musicAudioRef.current.src !== scene.musicUrl) {
          musicAudioRef.current.src = scene.musicUrl;
          musicAudioRef.current.load();
          musicAudioRef.current.play().catch(e => console.error("Audio playback failed.", e));
        }
      }
    } else {
      // The scene object was updated (e.g., a new voice URL). Merge new data to preserve isLoading flags.
      setVoiceData(prev => {
        const newData = { ...prev };
        let changed = false;
        if (scene.voiceUrls) {
          for (const key in scene.voiceUrls) {
            const index = parseInt(key, 10);
            const url = scene.voiceUrls[key];
            if (!newData[index] || newData[index].url !== url) {
              newData[index] = { url: url, isLoading: false };
              changed = true;
            }
          }
        }
        return changed ? newData : prev;
      });
    }

    prevSceneIndexRef.current = sceneIndex;
  }, [scene, sceneIndex]);

  // Effect to manage voice generation for current and upcoming lines
  useEffect(() => {
    const generateVoiceForLine = async (index: number) => {
        if (index < 0 || index >= parsedLinesRaw.length) return;
        const line = parsedLinesRaw[index];
        const voiceState = voiceData[index];

        // Skip narration, or if voice is already loaded/loading from prop or state.
        // This prevents re-generating voices that were loaded from a save file.
        if (!line.character ||
            (scene.voiceUrls && scene.voiceUrls[index]) ||
            (voiceState && (voiceState.isLoading || voiceState.url))
        ) {
            return;
        }

        setVoiceData(prev => ({ ...prev, [index]: { ...prev[index], isLoading: true } }));

        try {
            const characterProfile = findCharacter(line.character, concept);
            const voiceName = characterProfile?.voice || 'Kore'; // Use assigned voice or fallback to 'Kore'

            const prompt = characterProfile
                ? `Speak this line as ${characterProfile.name}, who is described as: "${characterProfile.description}". The line is: "${line.dialogue}"`
                : `Speak this line as the character "${line.character}". Scene context: "${scene.description}". The line is: "${line.dialogue}"`;

            const url = await geminiService.generateDialogueVoice(prompt, voiceName);

            if (isMounted.current) {
                setVoiceData(prev => ({ ...prev, [index]: { url: url, isLoading: false } }));
                onVoiceGenerated(sceneIndex, index, url);
            }
        } catch (e) {
            console.error(`Failed to generate voice for line ${index}:`, e);
            if (isMounted.current) {
                setVoiceData(prev => ({ ...prev, [index]: { url: null, isLoading: false } }));
            }
        }
    };

    const findNextDialogueLineIndex = (startIndex: number): number => {
        for (let i = startIndex; i < parsedLinesRaw.length; i++) {
            if (parsedLinesRaw[i].character) {
                return i;
            }
        }
        return -1;
    };

    // Generate for current line
    generateVoiceForLine(currentLineIndex);

    // Preload next dialogue line
    const nextDialogueIndex = findNextDialogueLineIndex(currentLineIndex + 1);
    if (nextDialogueIndex !== -1) {
        generateVoiceForLine(nextDialogueIndex);
    }

  }, [currentLineIndex, parsedLinesRaw, concept, scene.description, voiceData, sceneIndex, onVoiceGenerated, scene.voiceUrls]);

  // Effect to play the voice for the current line
  useEffect(() => {
    const currentLine = lines[currentLineIndex];
    const audioEl = dialogueAudioRef.current;
    if (audioEl && currentLine) {
        if (currentLine.voiceUrl) {
            if (audioEl.src !== currentLine.voiceUrl) {
                audioEl.src = currentLine.voiceUrl;
                audioEl.load();
                audioEl.play().catch(e => console.warn("Dialogue audio playback failed.", e));
            }
        } else {
            audioEl.pause();
            audioEl.src = '';
        }
    }
  }, [currentLineIndex, lines]);
  
  const handleAdvance = useCallback(() => {
    // Handle browser autoplay policies: try to play music on the first user interaction.
    if (musicAudioRef.current && musicAudioRef.current.paused) {
        musicAudioRef.current.play().catch(e => console.error("Failed to resume music on interaction.", e));
    }
    // Stop any playing dialogue
    if (dialogueAudioRef.current) {
        dialogueAudioRef.current.pause();
    }
    onAdvance();
  }, [onAdvance]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleAdvance();
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleAdvance]);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY < 0) { // Scrolling up
      e.preventDefault();
      onOpenBacklog();
    }
  };

  const currentLine = lines[currentLineIndex];
  const isLastLine = currentLineIndex >= lines.length - 1;

  return (
    <div 
        className="w-full h-screen bg-contain bg-center bg-no-repeat bg-black flex flex-col justify-end transition-all duration-1000 relative"
        style={{ backgroundImage: `url(${scene.imageUrl})` }}
        onClick={handleAdvance}
        onWheel={handleWheel}
    >
      <audio ref={musicAudioRef} loop />
      <audio ref={dialogueAudioRef} />

      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none"></div>

      <div className="w-full p-4 md:p-8 flex flex-col items-start select-none z-10 cursor-pointer">
        {/* Name Box */}
        <div className="mb-[-1px] ml-4 md:ml-8">
            <div className="bg-black bg-opacity-70 backdrop-blur-sm p-2 px-6 rounded-t-lg border-t-2 border-l-2 border-r-2 border-black min-h-[46px] flex items-center">
                <h2 className="text-2xl font-bold text-pink-400 drop-shadow-lg">{currentLine?.character}</h2>
            </div>
        </div>

        {/* Dialogue Box */}
        <div className="w-full p-6 md:p-8 bg-black bg-opacity-70 backdrop-blur-md border-2 border-black rounded-b-lg rounded-tr-lg relative">
           <div className="min-h-[8rem] flex items-center">
               {currentLine && <p className="text-xl text-white leading-relaxed font-serif drop-shadow-md">{currentLine.dialogue}</p>}
           </div>
           <div className="absolute bottom-4 right-4 text-white">
             {isLastLine && !isNextSceneReady && (
                <span className="text-sm italic opacity-70">Preparing next scene...</span>
             )}
           </div>
        </div>
      </div>
    </div>
  );
};

export default VisualNovelDisplay;
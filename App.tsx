
import React, { useState, useCallback, useEffect } from 'react';
import { GameState } from './types';
import type { VisualNovelConcept, Scene, UserCharacter } from './types';
import InitialScreen from './components/InitialScreen';
import VisualNovelDisplay from './components/VisualNovelDisplay';
import SettingsModal from './components/SettingsModal';
import BacklogModal from './components/BacklogModal';
import { SettingsIcon } from './components/icons/SettingsIcon';
import * as geminiService from './services/geminiService';
import { parseDialogue } from './utils/parser';

// Declare JSZip and saveAs for TypeScript since they are loaded from a script tag
declare const JSZip: any;
declare const saveAs: any;

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.INITIAL);
  const [userConceptInput, setUserConceptInput] = useState('');
  const [concept, setConcept] = useState<VisualNovelConcept | null>(null);
  const [sceneHistory, setSceneHistory] = useState<Scene[]>([]);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [nextSceneBuffer, setNextSceneBuffer] = useState<Scene | null>(null);
  const [isLoadingNextScene, setIsLoadingNextScene] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBacklogOpen, setIsBacklogOpen] = useState(false);
  const [initialSceneDescription, setInitialSceneDescription] = useState<string | null>(null);
  const [userCharacters, setUserCharacters] = useState<UserCharacter[]>([]);

  const generateAndBufferNextScene = useCallback(async () => {
    if (!concept) return;
    setIsLoadingNextScene(true);
    try {
      const sceneDescriptions = sceneHistory.map(s => s.description);
      const sceneDetails = await geminiService.generateSceneDescription(concept, sceneDescriptions);
      const newDescription = sceneDetails.description;
      const charactersInScene = concept.characters.filter(char => 
        sceneDetails.characters.some(name => char.name.toLowerCase() === name.toLowerCase())
      );
      
      const previousSceneText = sceneHistory.length > 0 ? sceneHistory[sceneHistory.length - 1].text : null;
      const [text, imageUrl, musicUrl] = await Promise.all([
        geminiService.generateSceneText(concept, newDescription, previousSceneText),
        geminiService.generateSceneImage(newDescription, charactersInScene),
        geminiService.generateSceneMusic(newDescription),
      ]);
      
      const newScene: Scene = { description: newDescription, text, imageUrl, musicUrl, voiceUrls: {} };
      setNextSceneBuffer(newScene);

    } catch (e) {
      if (e instanceof Error) setError(`Failed to generate next scene: ${e.message}`);
      // Don't set game state to error, allow user to retry or continue
      console.error(e);
    } finally {
        setIsLoadingNextScene(false);
    }
  }, [concept, sceneHistory]);


  useEffect(() => {
    // Pre-load the next scene if we're approaching the end of the last loaded scene.
    const onLastScene = currentSceneIndex === sceneHistory.length - 1;

    // We start preloading if we are on the last scene, a buffer doesn't already exist, and we aren't already loading.
    if (gameState === GameState.DISPLAYING && onLastScene && !nextSceneBuffer && !isLoadingNextScene) {
        const currentScene = sceneHistory[currentSceneIndex];
        const lines = parseDialogue(currentScene.text);
        const totalLines = lines.length;
        
        // Preload when 40 lines are remaining, or on the first line if the scene is very short.
        const preloadThreshold = Math.max(0, totalLines - 40); 

        if (currentLineIndex >= preloadThreshold) {
            generateAndBufferNextScene();
        }
    }
  }, [gameState, currentSceneIndex, currentLineIndex, sceneHistory, nextSceneBuffer, isLoadingNextScene, generateAndBufferNextScene]);

  const handleOpenBacklog = () => setIsBacklogOpen(true);
  const handleCloseBacklog = () => setIsBacklogOpen(false);

  const handleJumpToLine = (sceneIndex: number, lineIndex: number) => {
    setCurrentSceneIndex(sceneIndex);
    setCurrentLineIndex(lineIndex);
    // Invalidate the buffer if we jump away from the absolute last line
    setNextSceneBuffer(null);
    setIsBacklogOpen(false);
  };

  const handleNextScene = () => {
    if (nextSceneBuffer) {
      setSceneHistory(prev => [...prev, nextSceneBuffer]);
      setCurrentSceneIndex(prev => prev + 1);
      setCurrentLineIndex(0);
      setNextSceneBuffer(null);
    }
  };

  const handleAdvanceDialogue = () => {
    const currentScene = sceneHistory[currentSceneIndex];
    if (!currentScene) return;

    const lines = parseDialogue(currentScene.text);

    if (currentLineIndex < lines.length - 1) {
      setCurrentLineIndex(prev => prev + 1);
    } else {
        // Last line. Check for next scene in history first.
        if (currentSceneIndex < sceneHistory.length - 1) {
            setCurrentSceneIndex(prev => prev + 1);
            setCurrentLineIndex(0);
        } else if (nextSceneBuffer) { // Then check for buffered scene.
            handleNextScene();
        }
    }
  };

  const handleGenerate = async () => {
    setGameState(GameState.GENERATING_CONCEPT);
    setLoadingMessage('Crafting your story concept...');
    setError(null);
    setConcept(null);
    setInitialSceneDescription(null);
    setSceneHistory([]);
    setCurrentSceneIndex(0);
    setCurrentLineIndex(0);

    try {
      // 1. Generate Concept
      const newConcept = await geminiService.generateConcept(userConceptInput, userCharacters);
      
      // Merge user-provided images back into the AI-generated concept
      newConcept.characters.forEach(characterProfile => {
        const userChar = userCharacters.find(uc => uc.name.toLowerCase() === characterProfile.name.toLowerCase());
        if (userChar && userChar.imageBase64) {
          characterProfile.imageBase64 = userChar.imageBase64;
        }
      });

      setConcept(newConcept);
      setGameState(GameState.GENERATING_SCENE);
      setLoadingMessage('Imagining the first scene...');

      // 2. Generate Scene Description
      const sceneDetails = await geminiService.generateSceneDescription(newConcept, []);
      const newDescription = sceneDetails.description;
      const charactersInScene = newConcept.characters.filter(char => 
        sceneDetails.characters.some(name => char.name.toLowerCase() === name.toLowerCase())
      );
      setInitialSceneDescription(newDescription);
      setLoadingMessage('Generating scene assets...');

      // 3. Generate Text, Image, and Music
      const [text, imageUrl, musicUrl] = await Promise.all([
        geminiService.generateSceneText(newConcept, newDescription, null),
        geminiService.generateSceneImage(newDescription, charactersInScene),
        geminiService.generateSceneMusic(newDescription)
      ]);
      
      const firstScene: Scene = { description: newDescription, text, imageUrl, musicUrl, voiceUrls: {} };

      // 4. Start the story
      setSceneHistory([firstScene]);
      setCurrentSceneIndex(0);
      setCurrentLineIndex(0);
      setGameState(GameState.DISPLAYING);

    } catch (e) {
      if (e instanceof Error) setError(`Failed to start story: ${e.message}`);
      setGameState(GameState.ERROR);
    }
  };
  
  const handleUpdateConcept = (newConcept: VisualNovelConcept) => {
    setConcept(newConcept);
    // Invalidate buffer as it was based on old concept
    setNextSceneBuffer(null);
  };
  
  const handleReset = () => {
    setGameState(GameState.INITIAL);
    setUserConceptInput('');
    setConcept(null);
    setSceneHistory([]);
    setCurrentSceneIndex(0);
    setCurrentLineIndex(0);
    setNextSceneBuffer(null);
    setError(null);
    setInitialSceneDescription(null);
    setIsBacklogOpen(false);
    setUserCharacters([]);
  }

  const handleUpdateVoiceUrl = useCallback((sceneIndex: number, lineIndex: number, url: string) => {
    setSceneHistory(prev => {
        const newHistory = [...prev];
        const sceneToUpdate = { ...newHistory[sceneIndex] };
        if (!sceneToUpdate.voiceUrls) {
            sceneToUpdate.voiceUrls = {};
        }
        sceneToUpdate.voiceUrls[lineIndex] = url;
        newHistory[sceneIndex] = sceneToUpdate;
        return newHistory;
    });
  }, []);

  const handleSave = async () => {
    if (!concept || sceneHistory.length === 0) {
        alert("There is nothing to save yet!");
        return;
    }

    setLoadingMessage("Saving game...");
    try {
        const zip = new JSZip();
        const assetsFolder = zip.folder("assets");
        
        const savableHistory: any[] = [];
        
        for (let i = 0; i < sceneHistory.length; i++) {
            const scene = sceneHistory[i];
            const savableScene = { ...scene, voiceUrls: {} as Record<number, string> };

            // Handle Image
            const imageBlob = await fetch(scene.imageUrl).then(r => r.blob());
            const imageExtension = imageBlob.type.split('/')[1] || 'png';
            const imagePath = `assets/scene_${i}_image.${imageExtension}`;
            savableScene.imageUrl = imagePath;
            assetsFolder.file(imagePath, imageBlob);

            // Handle Music
            const musicBlob = await fetch(scene.musicUrl).then(r => r.blob());
            const musicPath = `assets/scene_${i}_music.wav`;
            savableScene.musicUrl = musicPath;
            assetsFolder.file(musicPath, musicBlob);
            
            // Handle Voices
            if (scene.voiceUrls) {
                for (const lineIndex in scene.voiceUrls) {
                    const voiceUrl = scene.voiceUrls[lineIndex];
                    const voicePath = `assets/scene_${i}_line_${lineIndex}_voice.wav`;
                    savableScene.voiceUrls[lineIndex] = voicePath;
                    const voiceBlob = await fetch(voiceUrl).then(r => r.blob());
                    assetsFolder.file(voicePath, voiceBlob);
                }
            }
            savableHistory.push(savableScene);
        }

        const sessionData = { concept, sceneHistory: savableHistory };
        zip.file("session.json", JSON.stringify(sessionData, null, 2));

        const zipBlob = await zip.generateAsync({ type: "blob" });
        saveAs(zipBlob, `${concept.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_save.zip`);
    } catch (e) {
        console.error("Failed to save game:", e);
        setError(`Failed to save game: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        setLoadingMessage("");
    }
  };

  const handleLoad = async (file: File, startFrom: 'start' | 'end') => {
    setGameState(GameState.GENERATING_SCENE);
    setLoadingMessage('Loading your story...');
    setError(null);
    try {
        const jszip = new JSZip();
        const zip = await jszip.loadAsync(file);
        
        const sessionFile = zip.file('session.json');
        if (!sessionFile) throw new Error('Save file is invalid: session.json not found.');

        const sessionData = JSON.parse(await sessionFile.async('string'));
        const loadedConcept = sessionData.concept;
        const loadedSceneHistory: Scene[] = [];

        for (const savedScene of sessionData.sceneHistory) {
            const newScene: Scene = { ...savedScene, imageUrl: '', musicUrl: '', voiceUrls: {} };

            const loadImage = async (path: string) => {
                const file = zip.file(path);
                return file ? URL.createObjectURL(await file.async('blob')) : '';
            };

            newScene.imageUrl = await loadImage(savedScene.imageUrl);
            newScene.musicUrl = await loadImage(savedScene.musicUrl);
            
            if (savedScene.voiceUrls) {
                newScene.voiceUrls = {};
                for (const lineIndex in savedScene.voiceUrls) {
                    newScene.voiceUrls[lineIndex] = await loadImage(savedScene.voiceUrls[lineIndex]);
                }
            }
            loadedSceneHistory.push(newScene);
        }

        setConcept(loadedConcept);
        setSceneHistory(loadedSceneHistory);
        setNextSceneBuffer(null);

        const lastSceneIndex = loadedSceneHistory.length - 1;
        setCurrentSceneIndex(startFrom === 'start' ? 0 : lastSceneIndex);
        
        if (startFrom === 'end' && lastSceneIndex >= 0) {
            const lastSceneText = loadedSceneHistory[lastSceneIndex]?.text || '';
            const lastSceneLines = parseDialogue(lastSceneText);
            setCurrentLineIndex(lastSceneLines.length > 0 ? lastSceneLines.length - 1 : 0);
        } else {
            setCurrentLineIndex(0);
        }

        setGameState(GameState.DISPLAYING);
    } catch (e) {
        if (e instanceof Error) setError(`Failed to load save file: ${e.message}`);
        setGameState(GameState.ERROR);
    }
  };


  const renderContent = () => {
    switch (gameState) {
      case GameState.INITIAL:
      case GameState.GENERATING_CONCEPT:
      case GameState.GENERATING_SCENE:
        return (
          <InitialScreen
            userConcept={userConceptInput}
            setUserConcept={setUserConceptInput}
            onGenerate={handleGenerate}
            onLoad={handleLoad}
            isLoading={gameState !== GameState.INITIAL}
            loadingMessage={loadingMessage}
            concept={concept}
            initialSceneDescription={initialSceneDescription}
            userCharacters={userCharacters}
            setUserCharacters={setUserCharacters}
          />
        );
      case GameState.DISPLAYING:
        const currentScene = sceneHistory[currentSceneIndex];
        if (!currentScene || !concept) {
            setGameState(GameState.ERROR);
            setError("Cannot find current scene or concept data.");
            return null;
        }
        return (
          <VisualNovelDisplay
            scene={currentScene}
            sceneIndex={currentSceneIndex}
            currentLineIndex={currentLineIndex}
            concept={concept}
            onAdvance={handleAdvanceDialogue}
            onOpenBacklog={handleOpenBacklog}
            isNextSceneReady={!!nextSceneBuffer || (currentSceneIndex < sceneHistory.length - 1)}
            isLoadingNextScene={isLoadingNextScene}
            onVoiceGenerated={handleUpdateVoiceUrl}
          />
        );
      case GameState.ERROR:
        return (
            <div className="min-h-screen flex flex-col items-center justify-center text-center p-4">
                <h2 className="text-2xl text-red-500 mb-4">An Error Occurred</h2>
                <p className="text-gray-300 mb-6 max-w-md">{error}</p>
                <button onClick={handleReset} className="px-6 py-2 bg-purple-600 rounded-md hover:bg-purple-500">
                    Start Over
                </button>
            </div>
        )
    }
  };

  return (
    <main className="w-full h-full bg-gray-900 text-white font-sans">
      {renderContent()}
      
      <BacklogModal
          isOpen={isBacklogOpen}
          onClose={handleCloseBacklog}
          sceneHistory={sceneHistory}
          currentSceneIndex={currentSceneIndex}
          currentLineIndex={currentLineIndex}
          onJump={handleJumpToLine}
        />

      {gameState === GameState.DISPLAYING && concept && (
        <>
            <button onClick={() => setIsSettingsOpen(true)} className="fixed top-4 right-4 p-3 bg-black bg-opacity-50 rounded-full hover:bg-opacity-75 transition-all z-50">
                <SettingsIcon />
            </button>
            <SettingsModal 
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                concept={concept}
                onUpdateConcept={handleUpdateConcept}
                onSave={handleSave}
                onLoad={handleLoad}
                onReturnToTitle={handleReset}
                onOpenBacklog={handleOpenBacklog}
            />
        </>
      )}
    </main>
  );
};

export default App;

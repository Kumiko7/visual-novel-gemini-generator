import { GoogleGenAI, Modality, Type, type LiveMusicServerMessage, type LiveMusicSession } from "@google/genai";
import { TEXT_MODEL_FLASH, TEXT_MODEL_LITE, IMAGE_MODEL, AUDIO_MODEL, TEXT_MODEL_TTS, MALE_VOICES, FEMALE_VOICES } from "../constants";
import type { VisualNovelConcept, CharacterProfile, UserCharacter } from "../types";
import { logAiInteraction } from "../utils/logger";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
const aiMusic = new GoogleGenAI({ apiKey: process.env.API_KEY as string, apiVersion: 'v1alpha'});

const decodeBase64 = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

// Helper to create a WAV file from raw PCM data returned by the API
const createWavBlob = (pcmData: Uint8Array, sampleRate: number, numChannels: number): Blob => {
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;

  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // "fmt " sub-chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // Sub-chunk size
  view.setUint16(20, 1, true); // Audio format (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // "data" sub-chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);

  const wavHeader = new Uint8Array(buffer);
  return new Blob([wavHeader, pcmData], { type: 'audio/wav' });
};


export const generateConcept = async (prompt: string, userCharacters: UserCharacter[]): Promise<VisualNovelConcept> => {
    const model = TEXT_MODEL_FLASH;
    
    const userCharactersPrompt = userCharacters.length > 0
        ? `
        Please incorporate the following user-defined characters as the primary protagonists. You must include them in the final character list. You can build the story and other characters around them. For any characters with provided images, use that image as a strong visual reference when generating their detailed description.
        ---
        ${userCharacters.map(c => `Name: ${c.name}\nDescription: ${c.description || 'Not specified by user.'}\nImage Provided: ${c.imageBase64 ? 'Yes' : 'No'}`).join('\n---\n')}
        ---
        `
        : '';

    const promptText = `Generate a structured concept for a visual novel based on this user idea: "${prompt}". ${userCharactersPrompt} The concept should include a title, a setting, a plot summary, and a list of 5-6 main characters in total (including any user-defined ones). For each character, their description must include details on their personality, physical appearance (e.g., hair color, eye color, style of dress), and their gender ('male', 'female', or 'non-binary'). If a user-defined character was provided, use their details and especially their image as a strong reference for the full description you generate.`;
    
    const parts: any[] = [{ text: promptText }];

    for (const character of userCharacters) {
        if (character.imageBase64) {
            const base64Data = character.imageBase64.split(',')[1];
            const mimeType = character.imageBase64.match(/data:(.*);base64,/)?.[1] || 'image/png';
            
            parts.push({
                inlineData: {
                    mimeType: mimeType,
                    data: base64Data,
                }
            });
        }
    }

    const contents = { parts };
    
    const config = {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING },
                setting: { type: Type.STRING },
                plotSummary: { type: Type.STRING },
                characters: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            description: { type: Type.STRING },
                            gender: { type: Type.STRING },
                        },
                         required: ['name', 'description', 'gender']
                    }
                }
            },
            required: ['title', 'setting', 'plotSummary', 'characters']
        }
    };
    
    logAiInteraction({ service: 'generateConcept', model, prompt: contents, config });

    const response = await ai.models.generateContent({ model, contents, config });
    const jsonText = response.text.trim();
    try {
        const result = JSON.parse(jsonText) as VisualNovelConcept;

        // Assign a unique random voice to each character based on gender
        const availableMaleVoices = [...MALE_VOICES];
        const availableFemaleVoices = [...FEMALE_VOICES];

        result.characters.forEach(character => {
            if (character.gender?.toLowerCase() === 'male') {
                if (availableMaleVoices.length > 0) {
                    const randomIndex = Math.floor(Math.random() * availableMaleVoices.length);
                    character.voice = availableMaleVoices.splice(randomIndex, 1)[0];
                } else {
                    // Fallback if we run out of unique male voices
                    character.voice = MALE_VOICES[Math.floor(Math.random() * MALE_VOICES.length)];
                }
            } else { // Default to female for 'female', 'non-binary', or undefined gender
                if (availableFemaleVoices.length > 0) {
                    const randomIndex = Math.floor(Math.random() * availableFemaleVoices.length);
                    character.voice = availableFemaleVoices.splice(randomIndex, 1)[0];
                } else {
                    // Fallback if we run out of unique female voices
                    character.voice = FEMALE_VOICES[Math.floor(Math.random() * FEMALE_VOICES.length)];
                }
            }
        });

        logAiInteraction({ service: 'generateConcept', response: result });
        return result;
    } catch (e) {
        logAiInteraction({ service: 'generateConcept', error: "Failed to parse concept JSON", responseBody: jsonText });
        console.error("Failed to parse concept JSON:", jsonText);
        throw new Error("The AI returned an invalid concept structure. Please try again.");
    }
};

export const generateSceneDescription = async (
    concept: VisualNovelConcept,
    sceneHistoryDescriptions: string[]
): Promise<{ description: string; characters: string[] }> => {
    const history = sceneHistoryDescriptions.map((d, i) => `Scene ${i+1}: ${d}`).join('\n');
    const model = TEXT_MODEL_FLASH;

    // Create a version of the concept without image data for the text prompt
    const conceptForPrompt = {
        ...concept,
        characters: concept.characters.map(({ imageBase64, ...rest }) => rest),
    };

    const contents = `
            Visual Novel Concept:
            ${JSON.stringify(conceptForPrompt, null, 2)}
            
            Existing Scene Descriptions:
            ${history || 'N/A'}

            Based on the concept and the story so far, generate a brief, one-sentence description for the *next* scene and list the names of the characters who appear in it. Continue the story logically. Keep it original and avoid repeating previous scenes. Important: Not all characters must appear in every scene; select only the 1-3 characters most relevant to the developing plot for this specific scene.
        `;
    
    const config = {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                description: { 
                    type: Type.STRING,
                    description: 'A one-sentence description of the scene.'
                },
                characters: {
                    type: Type.ARRAY,
                    description: 'An array of names of the characters appearing in this scene.',
                    items: {
                        type: Type.STRING
                    }
                }
            },
            required: ['description', 'characters']
        }
    };

    logAiInteraction({ service: 'generateSceneDescription', model, prompt: contents, config });
    
    const response = await ai.models.generateContent({ model, contents, config });
    const jsonText = response.text.trim();
    
    try {
        const result = JSON.parse(jsonText) as { description: string; characters: string[] };
        logAiInteraction({ service: 'generateSceneDescription', response: result });
        return result;
    } catch (e) {
        logAiInteraction({ service: 'generateSceneDescription', error: "Failed to parse scene description JSON", responseBody: jsonText });
        console.error("Failed to parse scene description JSON:", jsonText);
        throw new Error("The AI returned an invalid scene description structure. Please try again.");
    }
};

export const generateSceneText = async (
    concept: VisualNovelConcept,
    sceneDescription: string,
    previousSceneText: string | null
): Promise<string> => {
    const model = TEXT_MODEL_LITE;

    // Create a version of the concept without image data for the text prompt
    const conceptForPrompt = {
        ...concept,
        characters: concept.characters.map(({ imageBase64, ...rest }) => rest),
    };

    const contents = `
            Visual Novel Concept:
            ${JSON.stringify(conceptForPrompt, null, 2)}

            Current Scene Description: ${sceneDescription}
            ${previousSceneText ? `The previous scene ended with:\n---\n${previousSceneText}\n---` : 'This is the first scene.'}

            Write the dialogue and narration for this scene. Adhere strictly to the following format:
            - For dialogue, use "Character Name: The line they say.". Dialogue lines MUST contain only spoken words.
            - For narration, actions, or descriptive prose, use lines that start with a colon, like ": The sun sets over the city.". These lines must NOT contain any spoken dialogue.
            - Each line must be on a new line.
            - Write a complete, engaging scene with a clear beginning, middle, and end.
        `;

    logAiInteraction({ service: 'generateSceneText', model, prompt: contents });

    const response = await ai.models.generateContent({ model, contents });
    const result = response.text.trim();
    logAiInteraction({ service: 'generateSceneText', response: result });
    return result;
};

export const generateSceneImage = async (sceneDescription: string, charactersInScene: CharacterProfile[]): Promise<string> => {
    const model = IMAGE_MODEL;
    
    const characterDescriptions = charactersInScene.length > 0
        ? `The scene features the following characters:\n` + charactersInScene.map(c => `- ${c.name}: ${c.description}`).join('\n')
        : 'This scene does not feature any specific characters.';

    const characterReferences = charactersInScene
        .filter(c => c.imageBase64)
        .map(c => `- Use the provided image as a reference for the character ${c.name}.`)
        .join('\n');

    const promptText = `
        ${characterDescriptions}
        ${characterReferences ? `\n**Character References:**\n${characterReferences}` : ''}
        
        Generate a beautiful anime visual novel background image for this scene: "${sceneDescription}".
        The image should accurately depict the characters based on their descriptions and any provided reference images.
        Style: vibrant, detailed, high-quality anime art, beautiful lighting.
    `;

    const parts: any[] = [{ text: promptText }];

    for (const character of charactersInScene) {
        if (character.imageBase64) {
            const base64Data = character.imageBase64.split(',')[1];
            const mimeType = character.imageBase64.match(/data:(.*);base64,/)?.[1] || 'image/png';
            
            parts.push({
                inlineData: {
                    mimeType: mimeType,
                    data: base64Data,
                }
            });
        }
    }
    
    const contents = { parts };
    const config = {
        responseModalities: [Modality.IMAGE],
    };

    logAiInteraction({ service: 'generateSceneImage', model, prompt: contents, config });

    const response = await ai.models.generateContent({ model, contents, config });

    const responseParts = response.candidates?.[0]?.content?.parts;

    if (responseParts) {
        for (const part of responseParts) {
            if (part.inlineData) {
                const base64ImageBytes = part.inlineData.data;
                logAiInteraction({ service: 'generateSceneImage', response: 'Successfully generated image.' });
                return `data:image/png;base64,${base64ImageBytes}`;
            }
        }
    }

    // If we get here, no image was returned. Log details for debugging.
    const finishReason = response.candidates?.[0]?.finishReason;
    const safetyRatings = response.candidates?.[0]?.safetyRatings;
    const errorMsg = `No image was generated. Finish reason: ${finishReason || 'N/A'}. Safety ratings: ${JSON.stringify(safetyRatings || 'N/A')}`;
    
    logAiInteraction({ service: 'generateSceneImage', error: errorMsg, responseBody: response });
    throw new Error(errorMsg);
};

export const generateSceneMusic = (sceneDescription: string): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        const MUSIC_GENERATION_DURATION_MS = 25000; // Generate 25 seconds of music
        let session: LiveMusicSession;
        const audioChunks: Uint8Array[] = [];
        let generationTimeout: number;

        const cleanupAndResolve = () => {
            clearTimeout(generationTimeout);
            if (session) {
                session.close();
            }

            if (audioChunks.length === 0) {
                const errorMsg = 'No audio chunks were received from the music generation service.';
                logAiInteraction({ service: 'generateSceneMusic', error: errorMsg });
                return reject(new Error(errorMsg));
            }

            // Concatenate all chunks
            const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of audioChunks) {
                combined.set(chunk, offset);
                offset += chunk.length;
            }

            // Create WAV blob for 48kHz stereo 16-bit PCM
            const audioBlob = createWavBlob(combined, 48000, 2); 
            const url = URL.createObjectURL(audioBlob);
            logAiInteraction({ service: 'generateSceneMusic', response: `Successfully generated audio track (${(totalLength / 1024).toFixed(2)} KB).` });
            resolve(url);
        };

        try {
            const prompt = `instrumental, atmospheric, looping background music for a visual novel scene. Scene: ${sceneDescription}`;
            logAiInteraction({ service: 'generateSceneMusic', model: AUDIO_MODEL, prompt });

            session = await aiMusic.live.music.connect({
                model: AUDIO_MODEL,
                callbacks: {
                    onmessage: (message: LiveMusicServerMessage) => {
                        if (message.serverContent?.audioChunks?.[0]?.data) {
                            const base64Audio = message.serverContent.audioChunks[0].data;
                            audioChunks.push(decodeBase64(base64Audio));
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        logAiInteraction({ service: 'generateSceneMusic', error: e });
                        clearTimeout(generationTimeout);
                        reject(new Error('Music generation failed with a connection error.'));
                    },
                }
            });

            await session.setWeightedPrompts({
                weightedPrompts: [{ text: prompt, weight: 1 }]
            });

            session.play();

            generationTimeout = window.setTimeout(cleanupAndResolve, MUSIC_GENERATION_DURATION_MS);

        } catch (error) {
            logAiInteraction({ service: 'generateSceneMusic', error });
            reject(error);
        }
    });
};

export const generateDialogueVoice = async (prompt: string, voiceName: string): Promise<string> => {
    const model = TEXT_MODEL_TTS;
    const contents = [{ parts: [{ text: prompt }] }];
    const config = {
        responseModalities: [Modality.AUDIO as Modality],
        speechConfig: {
            voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
            },
        },
    };

    logAiInteraction({ service: 'generateDialogueVoice', model, prompt, config });

    try {
        const response = await ai.models.generateContent({ model, contents, config });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

        if (base64Audio) {
            const pcmData = decodeBase64(base64Audio);
            // The TTS model outputs 24kHz single-channel audio.
            const audioBlob = createWavBlob(pcmData, 24000, 1);
            const url = URL.createObjectURL(audioBlob);
            logAiInteraction({ service: 'generateDialogueVoice', response: `Successfully generated voice clip.` });
            return url;
        } else {
            throw new Error("No audio data was returned from the TTS service.");
        }
    } catch (e) {
        logAiInteraction({ service: 'generateDialogueVoice', error: e });
        throw e;
    }
};
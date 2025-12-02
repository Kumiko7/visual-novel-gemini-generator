import React, { useRef } from 'react';
import { SUGGESTION_PROMPTS } from '../constants';
import type { VisualNovelConcept, UserCharacter } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { PlusIcon } from './icons/PlusIcon';
import { TrashIcon } from './icons/TrashIcon';

interface InitialScreenProps {
  userConcept: string;
  setUserConcept: (concept: string) => void;
  onGenerate: () => void;
  onLoad: (file: File, startFrom: 'start' | 'end') => void;
  isLoading: boolean;
  loadingMessage: string;
  concept: VisualNovelConcept | null;
  initialSceneDescription: string | null;
  userCharacters: UserCharacter[];
  setUserCharacters: (characters: UserCharacter[]) => void;
}

const InitialScreen: React.FC<InitialScreenProps> = ({ 
    userConcept, setUserConcept, onGenerate, onLoad, isLoading, 
    loadingMessage, concept, initialSceneDescription, userCharacters, setUserCharacters 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startFromRef = useRef<'start' | 'end'>('start');

  const handleLoadClick = (startFrom: 'start' | 'end') => {
    startFromRef.current = startFrom;
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onLoad(file, startFromRef.current);
    }
    // Reset file input value to allow loading the same file again
    if(fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAddCharacter = () => {
    const newCharacter: UserCharacter = {
      id: Date.now().toString(),
      name: '',
      description: '',
      imageBase64: null,
    };
    setUserCharacters([...userCharacters, newCharacter]);
  };

  const handleRemoveCharacter = (id: string) => {
    setUserCharacters(userCharacters.filter(c => c.id !== id));
  };

  const handleCharacterChange = (id: string, field: keyof Omit<UserCharacter, 'id' | 'imageBase64'>, value: string) => {
    setUserCharacters(userCharacters.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUserCharacters(userCharacters.map(c => 
          c.id === id ? { ...c, imageBase64: reader.result as string } : c
        ));
      };
      reader.readAsDataURL(file);
    }
  };


  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 p-4 text-center">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".zip"
        className="hidden"
      />
      <div className="max-w-3xl w-full">
        <h1 className="text-5xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
          Visual Novel AI
        </h1>
        <p className="text-lg text-gray-300 mb-8">
          Bring your story to life. Just enter a concept and let the AI create your world.
        </p>

        <div className="relative mb-6">
          <textarea
            value={userConcept}
            onChange={(e) => setUserConcept(e.target.value)}
            placeholder="e.g., A lonely lighthouse keeper discovers a mermaid..."
            className="w-full h-28 p-4 bg-gray-800 border-2 border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none"
            disabled={isLoading}
          />
        </div>
        
        <div className="mb-8">
            <p className="text-gray-400 mb-3">Or try one of these ideas:</p>
            <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTION_PROMPTS.map((prompt) => (
                    <button
                        key={prompt}
                        onClick={() => setUserConcept(prompt)}
                        className="bg-gray-700 text-sm text-gray-200 px-3 py-1 rounded-full hover:bg-purple-600 transition-colors disabled:opacity-50"
                        disabled={isLoading}
                    >
                        {prompt}
                    </button>
                ))}
            </div>
        </div>

        {/* Character Creator Section */}
        <div className="my-8 text-left">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-300">Your Characters (Optional)</h2>
            <button
              onClick={handleAddCharacter}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
              disabled={isLoading}
            >
              <PlusIcon className="w-5 h-5" /> Add Character
            </button>
          </div>
          <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
            {userCharacters.map((character) => (
              <div key={character.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex gap-4 items-start">
                <div className="w-1/3 flex-shrink-0">
                  <label htmlFor={`char-img-${character.id}`} className="cursor-pointer block">
                    <div className="aspect-square bg-gray-700 rounded-md flex items-center justify-center text-gray-400 hover:bg-gray-600 overflow-hidden transition-colors">
                      {character.imageBase64 ? (
                        <img src={character.imageBase64} alt={character.name || 'Character preview'} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm p-2 text-center">Click to add image</span>
                      )}
                    </div>
                  </label>
                  <input type="file" id={`char-img-${character.id}`} accept="image/png, image/jpeg" className="hidden" onChange={(e) => handleImageChange(e, character.id)} disabled={isLoading} />
                </div>
                <div className="flex-grow space-y-3">
                  <input
                    type="text"
                    placeholder="Character Name*"
                    value={character.name}
                    onChange={(e) => handleCharacterChange(character.id, 'name', e.target.value)}
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                    required
                    disabled={isLoading}
                  />
                  <textarea
                    placeholder="Character Description (optional)"
                    value={character.description}
                    onChange={(e) => handleCharacterChange(character.id, 'description', e.target.value)}
                    className="w-full h-20 p-2 bg-gray-700 border border-gray-600 rounded-md text-white resize-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                    disabled={isLoading}
                  />
                </div>
                <button 
                  onClick={() => handleRemoveCharacter(character.id)}
                  className="text-gray-500 hover:text-red-500 transition-colors self-start p-1 disabled:opacity-50"
                  aria-label="Remove character"
                  disabled={isLoading}
                >
                  <TrashIcon className="w-6 h-6" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 justify-center">
            <button
              onClick={onGenerate}
              disabled={isLoading || !userConcept}
              className="w-full md:w-auto px-12 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-lg hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105"
            >
              {isLoading ? 'Generating...' : 'Generate Story'}
            </button>
            <div className="flex gap-4">
                 <button 
                    onClick={() => handleLoadClick('start')} 
                    disabled={isLoading}
                    className="w-full md:w-auto px-6 py-4 bg-gray-700 text-white font-bold rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-all"
                 >
                    Load (Start)
                 </button>
                 <button 
                    onClick={() => handleLoadClick('end')} 
                    disabled={isLoading}
                    className="w-full md:w-auto px-6 py-4 bg-gray-700 text-white font-bold rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-all"
                 >
                    Load (End)
                 </button>
            </div>
        </div>


        {isLoading && (
          <div className="mt-8 p-6 bg-gray-800 border border-gray-700 rounded-lg w-full max-w-3xl text-left">
            <div className="flex items-center justify-center gap-4 mb-6">
              <LoadingSpinner />
              <p className="text-lg text-purple-300">{loadingMessage}</p>
            </div>
            {concept && (
              <div className="mb-4">
                <h3 className="font-bold text-pink-400 mb-2">Concept Received:</h3>
                <pre className="text-sm bg-gray-900 p-3 rounded-md overflow-x-auto max-h-48">
                  {JSON.stringify(concept, null, 2)}
                </pre>
              </div>
            )}
            {initialSceneDescription && (
              <div>
                <h3 className="font-bold text-pink-400 mb-2">First Scene Description:</h3>
                <p className="text-sm bg-gray-900 p-3 rounded-md">{initialSceneDescription}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InitialScreen;
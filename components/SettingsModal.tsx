import React, { useState, useEffect, useRef } from 'react';
import type { VisualNovelConcept } from '../types';
import { SettingsIcon } from './icons/SettingsIcon';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  concept: VisualNovelConcept;
  onUpdateConcept: (newConcept: VisualNovelConcept) => void;
  onSave: () => void;
  onLoad: (file: File, startFrom: 'start' | 'end') => void;
  onReturnToTitle: () => void;
  onOpenBacklog: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, concept, onUpdateConcept, onSave, onLoad, onReturnToTitle, onOpenBacklog }) => {
  const [editedConcept, setEditedConcept] = useState(JSON.stringify(concept, null, 2));
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startFromRef = useRef<'start' | 'end'>('start');

  useEffect(() => {
    setEditedConcept(JSON.stringify(concept, null, 2));
  }, [concept, isOpen]);

  const handleSaveConcept = () => {
    try {
      const parsedConcept = JSON.parse(editedConcept);
      onUpdateConcept(parsedConcept);
      setError(null);
      onClose();
    } catch (e) {
      setError("Invalid JSON format. Please correct the errors before saving.");
    }
  };

  const handleReturn = () => {
    onReturnToTitle();
    onClose();
  };
  
  const handleLoadClick = (startFrom: 'start' | 'end') => {
    startFromRef.current = startFrom;
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onLoad(file, startFromRef.current);
      onClose();
    }
    if(fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const handleOpenBacklog = () => {
    onOpenBacklog();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".zip"
        className="hidden"
      />
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-4xl h-[95vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold flex items-center gap-2"><SettingsIcon /> Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl leading-none">&times;</button>
        </div>
        
        {/* Actions Bar */}
        <div className="flex flex-wrap gap-2 mb-4 border-b border-gray-700 pb-4">
            <button onClick={onSave} className="px-4 py-2 bg-blue-600 rounded-md hover:bg-blue-500 text-sm">Save Game</button>
            <button onClick={handleOpenBacklog} className="px-4 py-2 bg-gray-600 rounded-md hover:bg-gray-500 text-sm">Log</button>
            <button onClick={() => handleLoadClick('start')} className="px-4 py-2 bg-gray-600 rounded-md hover:bg-gray-500 text-sm">Load (from Start)</button>
            <button onClick={() => handleLoadClick('end')} className="px-4 py-2 bg-gray-600 rounded-md hover:bg-gray-500 text-sm">Load (from End)</button>
            <button onClick={handleReturn} className="px-4 py-2 bg-red-600 rounded-md hover:bg-red-500 text-sm ml-auto">Return to Title</button>
        </div>

        <label className="text-lg font-bold mb-2" htmlFor="concept-editor">Story Concept Editor</label>
        <textarea
          id="concept-editor"
          value={editedConcept}
          onChange={(e) => setEditedConcept(e.target.value)}
          className="w-full flex-grow bg-gray-900 text-gray-200 p-3 rounded-md font-mono text-sm border border-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        />
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        <div className="mt-4 flex justify-end gap-4">
          <button onClick={onClose} className="px-4 py-2 bg-gray-600 rounded-md hover:bg-gray-500">Cancel</button>
          <button onClick={handleSaveConcept} className="px-4 py-2 bg-purple-600 rounded-md hover:bg-purple-500">Save Concept Edits</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
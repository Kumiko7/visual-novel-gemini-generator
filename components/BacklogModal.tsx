import React, { useEffect, useRef } from 'react';
import type { Scene } from '../types';
import { parseDialogue } from '../utils/parser';

interface BacklogModalProps {
  isOpen: boolean;
  onClose: () => void;
  sceneHistory: Scene[];
  currentSceneIndex: number;
  currentLineIndex: number;
  onJump: (sceneIndex: number, lineIndex: number) => void;
}

const BacklogModal: React.FC<BacklogModalProps> = ({ isOpen, onClose, sceneHistory, currentSceneIndex, currentLineIndex, onJump }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when opened
  useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [isOpen]);

  const handleWheel = (e: React.WheelEvent) => {
    const el = scrollContainerRef.current;
    if (!el) return;

    // Close on scroll down when at the bottom
    if (e.deltaY > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 5) { // -5 for tolerance
      onClose();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onClose();
  };

  if (!isOpen) return null;

  const logEntries: { sceneIndex: number; lineIndex: number; character: string | null; dialogue: string }[] = [];
  sceneHistory.forEach((scene, sIndex) => {
    if (sIndex > currentSceneIndex) return; // Don't show future scenes
    const lines = parseDialogue(scene.text);
    lines.forEach((line, lIndex) => {
      // Don't show future lines in the current scene
      if (sIndex === currentSceneIndex && lIndex > currentLineIndex) return;
      logEntries.push({
        sceneIndex: sIndex,
        lineIndex: lIndex,
        ...line
      });
    });
  });

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 md:p-8"
      onContextMenu={handleContextMenu}
    >
      <div
        className="w-full max-w-4xl h-full bg-gray-900 bg-opacity-90 backdrop-blur-sm rounded-lg flex flex-col p-4 border border-gray-700"
        onClick={(e) => e.stopPropagation()} // Prevent clicks inside from closing
        onContextMenu={(e) => e.stopPropagation()} // Prevent context menu inside from closing
      >
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-700">
          <h2 className="text-3xl font-bold text-purple-400">
            Story Log
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl leading-none">&times;</button>
        </div>
        <div
          ref={scrollContainerRef}
          className="flex-grow overflow-y-auto pr-4 space-y-4"
          onWheel={handleWheel}
        >
          {logEntries.map((entry, index) => (
            <div key={index} className="flex items-start gap-4 group">
              <div className="flex-grow">
                {entry.character && (
                  <p className="font-bold text-pink-400">{entry.character}</p>
                )}
                <p className="text-gray-200">{entry.dialogue}</p>
              </div>
              <button
                onClick={() => onJump(entry.sceneIndex, entry.lineIndex)}
                className="px-3 py-1 bg-gray-700 text-sm rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-purple-600"
              >
                Jump
              </button>
            </div>
          ))}
        </div>
        <div className="text-center text-gray-500 text-sm pt-2">
            Right-click or scroll down to close
        </div>
      </div>
    </div>
  );
};

export default BacklogModal;
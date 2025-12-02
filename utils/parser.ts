import type { ParsedLine } from '../types';

export const parseDialogue = (text: string): Omit<ParsedLine, 'voiceUrl' | 'isLoadingVoice'>[] => {
    if (!text) return [];
    return text.split('\n').map(line => {
        const parts = line.split(/:(.*)/s);
        if (parts.length > 1 && parts[0].trim() !== '') {
            return { character: parts[0].trim(), dialogue: parts[1].trim() };
        }
        return { character: null, dialogue: line.replace(':', '').trim() };
    }).filter(line => line.dialogue.length > 0);
};

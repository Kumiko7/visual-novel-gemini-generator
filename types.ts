export enum GameState {
  INITIAL,
  GENERATING_CONCEPT,
  GENERATING_SCENE,
  DISPLAYING,
  ERROR,
}

export interface UserCharacter {
  id: string;
  name: string;
  description: string;
  imageBase64: string | null;
}

export interface CharacterProfile {
  name: string;
  description: string;
  gender: 'male' | 'female' | 'non-binary';
  voice?: string;
  imageBase64?: string | null;
}

export interface VisualNovelConcept {
  title: string;
  setting: string;
  plotSummary: string;
  characters: CharacterProfile[];
}

export interface Scene {
  description: string;
  text: string;
  imageUrl: string;
  musicUrl: string;
  voiceUrls?: Record<number, string>;
}

export interface ParsedLine {
    character: string | null;
    dialogue: string;
    voiceUrl?: string | null;
    isLoadingVoice?: boolean;
}
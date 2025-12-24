
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface User {
  id: string;
  name: string;
  email: string;
  joinedAt: Date;
  xp: number;
  avatar?: string;
}

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  description: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  topics: string[];
  emoji: string;
}

export interface Module {
  id: string;
  title: string;
  description: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  order: number;
}

export interface LiveSessionRecord {
    id: string;
    title: string;
    date: number;
    transcript: Message[];
}

export interface CoachHistoryItem {
  id: string;
  targetPhrase: {
    patois: string;
    english: string;
  };
  score: number;
  feedback: {
    score: number;
    phonemes: string;
    feedback: string;
    fix: string;
  };
  timestamp: Date;
}

/**
 * Fix: Added missing types for TranslatorView
 */
export type TranslationDirection = 'en-to-pat' | 'pat-to-en';

export interface TranslationHistoryItem {
  id: string;
  original: string;
  translated: string;
  pronunciation?: string;
  timestamp: Date;
  direction: TranslationDirection;
}

export enum AppMode {
  LESSONS = 'lessons',
  CHAT = 'chat',
  LIVE = 'live',
  COACH = 'coach',
  TRANSLATE = 'translate',
  MUSIC = 'music',
  PROFILE = 'profile'
}

import type {
  GameWord as BaseGameWord,
  GameLevelDef as BaseGameLevelDef,
} from '../data/staticVocabulary';

export interface GameWord extends BaseGameWord {
  meaningEn?: string;
}

export interface GameLevelDef extends BaseGameLevelDef {
  titleEn?: string;
  subtitleEn?: string;
  descriptionEn?: string;
  badgeEn?: string;
}

export type GameModeId = 'memory-flip' | 'speed-blitz' | 'balloon-pop' | 'zombie-defender';

export interface GameModeMeta {
  id: GameModeId;
  title: string;
  tagline: string;
  description: string;
  badge: string;
  titleEn?: string;
  taglineEn?: string;
  descriptionEn?: string;
  badgeEn?: string;
  iconName: 'Layers' | 'Zap' | 'Sparkles' | 'ShieldAlert' | 'Flame' | 'Crosshair';
  themeColor: string;
  accentBg: string;
  accentBorder: string;
  accentText: string;
}

export interface GameSessionResult {
  modeId: GameModeId;
  levelId: string;
  score: number;
  stars: 1 | 2 | 3;
  correctCount: number;
  totalQuestions: number;
  accuracy: number;
  timeSpentSeconds: number;
  streakBest?: number;
  isNewRecord?: boolean;
}

export type GameRecordsMap = Record<string, number>;

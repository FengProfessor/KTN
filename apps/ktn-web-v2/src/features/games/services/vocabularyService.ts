import {
  STATIC_VOCABULARY_BY_LEVEL,
  STATIC_VOCABULARY,
  GAME_LEVELS,
} from '../data/staticVocabulary';
import { ENGLISH_VOCAB_BY_ID } from '../data/englishVocabularyMap';
import { getCurrentLang, type AppLanguage } from '@/i18n';
import type { GameWord, GameLevelDef, GameRecordsMap } from '../types/game.types';

const STORAGE_KEY_HIGH_SCORES = 'ktn_games_high_scores';
const STORAGE_KEY_DYNAMIC_VOCAB = 'ktn_games_dynamic_vocab';
const PROXY_WORKER_BASE = 'https://ktn-sw-proxy.hocvienkhongtunhi123.workers.dev';

// In-memory cache for dynamically synced words
const dynamicVocabCache: Record<string, GameWord[]> = {};

/**
 * Fisher-Yates array shuffle (pure, returns new array)
 */
export function shuffleArray<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

const LEVEL_EN_METADATA: Record<
  string,
  { label: string; shortLabel: string; description: string; badge: string }
> = {
  hsk1: {
    label: 'HSK 1 · Beginner Foundation',
    shortLabel: 'HSK 1',
    description: '150 essential daily words, greetings & basic sentence patterns',
    badge: '150 words',
  },
  hsk2: {
    label: 'HSK 2 · Basic Communication',
    shortLabel: 'HSK 2',
    description: '150 practical words for shopping, school & daily situations',
    badge: '150 words',
  },
  hsk3: {
    label: 'HSK 3 · Intermediate Expansion',
    shortLabel: 'HSK 3',
    description: '300 words for emotions, plans & everyday life',
    badge: '300 words',
  },
  hsk4: {
    label: 'HSK 4 · Confident Fluency',
    shortLabel: 'HSK 4',
    description: '600 upper-intermediate words across diverse topics',
    badge: '600 words',
  },
  hsk5: {
    label: 'HSK 5 · News & Reading',
    shortLabel: 'HSK 5',
    description: 'Advanced vocabulary for articles, essays & commentary',
    badge: 'Advanced',
  },
  hsk6: {
    label: 'HSK 6 · Mastery & Idioms',
    shortLabel: 'HSK 6',
    description: 'Idioms, literature & native-level fluency',
    badge: 'Master',
  },
  yct1: {
    label: 'Track 1 · Greetings & Myself',
    shortLabel: 'Track 1',
    description: 'Polite greetings, pronouns & addressing family and teachers',
    badge: 'Pre-K & Primary',
  },
  yct2: {
    label: 'Track 2 · School & Friends',
    shortLabel: 'Track 2',
    description: 'School life, classmates, stationery & numbers 1–10',
    badge: 'Primary',
  },
  yct3: {
    label: 'Track 3 · Colors & Tasty Food',
    shortLabel: 'Track 3',
    description: 'Vibrant colors, favorite dishes & fruits',
    badge: 'Kids',
  },
  yct4: {
    label: 'Track 4 · Time & Sports',
    shortLabel: 'Track 4',
    description: 'Clock time, dates & active sports games',
    badge: 'Kids',
  },
  yct5: {
    label: 'Track 5 · Animals & Nature',
    shortLabel: 'Track 5',
    description: 'Animals, pets, weather & natural scenery',
    badge: 'Juniors',
  },
  yct6: {
    label: 'Track 6 · Jobs & Transport',
    shortLabel: 'Track 6',
    description: 'Extended family, vehicles & everyday professions',
    badge: 'Juniors',
  },
  yct7: {
    label: 'Track 7 · Chatting & Stories',
    shortLabel: 'Track 7',
    description: 'Feelings, Little Confucius stories & fun shopping',
    badge: 'YCT Mastery',
  },
};

function localizeLevelDef(level: GameLevelDef, lang: AppLanguage): GameLevelDef {
  const en = LEVEL_EN_METADATA[level.id];
  if (lang !== 'en') {
    if (!en) return level;
    return {
      ...level,
      titleEn: en.label,
      subtitleEn: en.shortLabel,
      descriptionEn: en.description,
      badgeEn: en.badge,
    };
  }
  if (en) {
    return {
      ...level,
      label: en.label,
      shortLabel: en.shortLabel,
      description: en.description,
      badge: en.badge,
      titleEn: en.label,
      subtitleEn: en.shortLabel,
      descriptionEn: en.description,
      badgeEn: en.badge,
    };
  }
  return {
    ...level,
    label: level.titleEn || level.label.replace(/^Lộ trình\s+/i, 'Track '),
    shortLabel: level.subtitleEn || level.shortLabel.replace(/^Lộ trình\s+/i, 'Track '),
    description: level.descriptionEn || level.description,
    badge: level.badgeEn || level.badge.replace(/\s+từ$/i, ' words'),
  };
}

/**
 * Get display meaning of a vocabulary word in the active language ('vi' or 'en')
 */
export function getWordDisplayMeaning(
  word: Pick<GameWord, 'id' | 'meaning' | 'meaningEn'>,
  lang: AppLanguage = getCurrentLang()
): string {
  if (lang === 'en') {
    const direct = word.meaningEn?.trim();
    if (direct) return direct;
    const mapped = ENGLISH_VOCAB_BY_ID[word.id];
    if (mapped) return mapped;
  }
  return word.meaning;
}

/**
 * Get all available levels (HSK 1-6 and YCT 1-7)
 */
export function getAllGameLevels(): GameLevelDef[] {
  return GAME_LEVELS;
}

/**
 * Get localized list of all available game levels for the given language
 */
export function getLocalizedGameLevels(lang: AppLanguage = getCurrentLang()): GameLevelDef[] {
  return GAME_LEVELS.map((level) => localizeLevelDef(level, lang));
}

/**
 * Get level definition by id (e.g. 'hsk1' or 'yct2')
 */
export function getGameLevelById(levelId: string): GameLevelDef {
  const normalized = (levelId || '').toLowerCase().trim();
  const found = GAME_LEVELS.find((l) => l.id === normalized);
  return found || GAME_LEVELS[0];
}

/**
 * Get localized level definition by id for the given language
 */
export function getLocalizedGameLevelById(
  levelId: string,
  lang: AppLanguage = getCurrentLang()
): GameLevelDef {
  return localizeLevelDef(getGameLevelById(levelId), lang);
}

/**
 * Retrieve all words available for a specific level, merging static + dynamic cached words
 */
export function getWordsForLevel(levelId: string): GameWord[] {
  const normalized = (levelId || 'hsk1').toLowerCase().trim();
  const staticWords = STATIC_VOCABULARY_BY_LEVEL[normalized] || STATIC_VOCABULARY_BY_LEVEL.hsk1 || [];
  const dynamicWords = dynamicVocabCache[normalized] || loadPersistedDynamicVocab(normalized);

  if (!dynamicWords || dynamicWords.length === 0) {
    return staticWords;
  }

  // Merge avoiding duplicates by hanzi
  const seenHanzi = new Set<string>();
  const merged: GameWord[] = [];

  for (const w of [...dynamicWords, ...staticWords]) {
    if (!seenHanzi.has(w.hanzi)) {
      seenHanzi.add(w.hanzi);
      merged.push(w);
    }
  }

  return merged;
}

const DEFAULT_DISTRACTOR_ENTRIES: Array<{
  id: string;
  hanzi: string;
  meaning: string;
  meaningEn: string;
}> = [
  { id: 'def_goodbye', hanzi: '__def_1', meaning: 'Tạm biệt, hẹn gặp lại', meaningEn: 'Goodbye' },
  { id: 'def_hello', hanzi: '__def_2', meaning: 'Xin chào', meaningEn: 'Hello' },
  { id: 'def_thanks', hanzi: '__def_3', meaning: 'Cảm ơn, cảm tạ', meaningEn: 'Thank you' },
  { id: 'def_school', hanzi: '__def_4', meaning: 'Trường học', meaningEn: 'School' },
  { id: 'def_friend', hanzi: '__def_5', meaning: 'Bạn bè', meaningEn: 'Friend' },
  { id: 'def_happy', hanzi: '__def_6', meaning: 'Vui mừng', meaningEn: 'Happy' },
];

function normalizeMeaningKey(text: string): string {
  return (text || '').trim().toLowerCase();
}

/**
 * Pick N random words from a level without duplicates in current round.
 * Prioritizes unseen words (excluding excludeIds) before wrapping around, and avoids
 * picking two words with identical hanzi or normalized display meaning in one batch.
 */
export function getRandomWordsForGame(
  levelId: string,
  count: number,
  excludeIds: string[] = [],
  lang: AppLanguage = getCurrentLang()
): GameWord[] {
  const pool = getWordsForLevel(levelId);
  const targetCount = Math.min(Math.max(0, count), pool.length);
  if (targetCount === 0) return [];

  const excludeSet = new Set(excludeIds);
  const unseen = shuffleArray(pool.filter((w) => !excludeSet.has(w.id)));
  const seen = shuffleArray(pool.filter((w) => excludeSet.has(w.id)));
  const candidates = [...unseen, ...seen];

  const picked: GameWord[] = [];
  const usedIds = new Set<string>();
  const usedHanzi = new Set<string>();
  const usedMeanings = new Set<string>();

  for (const word of candidates) {
    if (picked.length >= targetCount) break;
    const normMeaning = normalizeMeaningKey(getWordDisplayMeaning(word, lang));
    if (
      usedIds.has(word.id) ||
      usedHanzi.has(word.hanzi) ||
      (normMeaning && usedMeanings.has(normMeaning))
    ) {
      continue;
    }
    picked.push(word);
    usedIds.add(word.id);
    usedHanzi.add(word.hanzi);
    if (normMeaning) usedMeanings.add(normMeaning);
  }

  if (picked.length < targetCount) {
    for (const word of candidates) {
      if (picked.length >= targetCount) break;
      if (usedIds.has(word.id)) continue;
      picked.push(word);
      usedIds.add(word.id);
    }
  }

  return picked;
}

/**
 * Record a shown word into a per-level Smart-Bag set and reset once the full pool is covered.
 */
export function markWordSeenInLevel(
  seenIds: Set<string>,
  wordId: string,
  levelPoolSize: number
): void {
  if (!wordId) return;
  seenIds.add(wordId);
  if (levelPoolSize > 0 && seenIds.size >= levelPoolSize) {
    seenIds.clear();
  }
}

/**
 * Swap index 0 with index 1 when a freshly shuffled batch starts with the immediately preceding word.
 */
export function avoidSeamRepeat(batch: GameWord[], lastWordId: string | null): GameWord[] {
  if (!lastWordId || batch.length <= 1 || batch[0]?.id !== lastWordId) {
    return batch;
  }
  const adjusted = [...batch];
  const first = adjusted[0];
  adjusted[0] = adjusted[1];
  adjusted[1] = first;
  return adjusted;
}

/**
 * Pick distractor word objects from the level (or neighboring levels), ensuring no
 * duplicate display meanings in the active language.
 */
export function getDistractorWords(
  correctWord: GameWord,
  count: number,
  levelId: string,
  lang: AppLanguage = getCurrentLang()
): GameWord[] {
  const pool = getWordsForLevel(levelId);
  const seenMeanings = new Set<string>([
    normalizeMeaningKey(getWordDisplayMeaning(correctWord, lang)),
  ]);
  const results: GameWord[] = [];

  const collectFromPool = (candidates: readonly GameWord[]) => {
    for (const cand of shuffleArray(candidates)) {
      if (results.length >= count) break;
      if (cand.hanzi === correctWord.hanzi) continue;
      const normMeaning = normalizeMeaningKey(getWordDisplayMeaning(cand, lang));
      if (!normMeaning || seenMeanings.has(normMeaning)) continue;
      seenMeanings.add(normMeaning);
      results.push(cand);
    }
  };

  // Prefer same-level distractors first, then top up from full catalog
  collectFromPool(pool);
  if (results.length < count) {
    collectFromPool(STATIC_VOCABULARY);
  }

  const normalizedLevel = (levelId || 'hsk1').toLowerCase().trim();
  for (const def of DEFAULT_DISTRACTOR_ENTRIES) {
    if (results.length >= count) break;
    const candidateText = lang === 'en' ? def.meaningEn : def.meaning;
    const normDef = normalizeMeaningKey(candidateText);
    if (!seenMeanings.has(normDef)) {
      seenMeanings.add(normDef);
      results.push({
        id: def.id,
        hanzi: def.hanzi,
        pinyin: '',
        meaning: def.meaning,
        meaningEn: def.meaningEn,
        levelId: normalizedLevel,
        levelType: normalizedLevel.startsWith('yct') ? 'yct' : 'hsk',
      });
    }
  }

  return results;
}

/**
 * Pick distractor meanings from the level (or neighboring levels) in the active language
 */
export function getDistractorMeanings(
  correctWord: GameWord,
  count: number,
  levelId: string,
  lang: AppLanguage = getCurrentLang()
): string[] {
  return getDistractorWords(correctWord, count, levelId, lang).map((w) =>
    getWordDisplayMeaning(w, lang)
  );
}

/**
 * Dynamic vocabulary sync from Cloudflare Worker proxy or izTeach/Supabase endpoint
 */
export async function syncRemoteVocabulary(levelId: string): Promise<GameWord[]> {
  const normalized = (levelId || 'hsk1').toLowerCase().trim();

  try {
    const url = `${PROXY_WORKER_BASE}/api/ktn/vocab?level=${encodeURIComponent(normalized)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const validated: GameWord[] = data
          .filter((item) => item && typeof item.hanzi === 'string' && typeof item.meaning === 'string')
          .map((item, idx) => ({
            id: String(item.id || `remote_${normalized}_${idx}`),
            hanzi: String(item.hanzi),
            pinyin: String(item.pinyin || ''),
            hanViet: item.hanViet ? String(item.hanViet) : undefined,
            meaning: String(item.meaning),
            meaningEn:
              typeof item.meaningEn === 'string' && item.meaningEn.trim()
                ? String(item.meaningEn)
                : undefined,
            levelId: normalized,
            levelType: normalized.startsWith('yct') ? 'yct' : 'hsk',
          }));

        if (validated.length > 0) {
          dynamicVocabCache[normalized] = validated;
          persistDynamicVocab(normalized, validated);
          return validated;
        }
      }
    }
  } catch {
    // Network or proxy error - silent graceful fallback to preloaded catalog
  }

  return getWordsForLevel(normalized);
}

function persistDynamicVocab(levelId: string, words: GameWord[]): void {
  if (typeof window === 'undefined') return;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY_DYNAMIC_VOCAB);
    const parsed = stored ? JSON.parse(stored) : {};
    parsed[levelId] = words;
    window.localStorage.setItem(STORAGE_KEY_DYNAMIC_VOCAB, JSON.stringify(parsed));
  } catch {
    // ignore quota errors
  }
}

function loadPersistedDynamicVocab(levelId: string): GameWord[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY_DYNAMIC_VOCAB);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed[levelId]) ? parsed[levelId] : null;
  } catch {
    return null;
  }
}

// ============================================================================
// High Scores & Records
// ============================================================================

export function getHighScoresMap(): GameRecordsMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_HIGH_SCORES);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getHighScore(modeId: string, levelId: string): number {
  const map = getHighScoresMap();
  const key = `${modeId}_${levelId}`;
  return map[key] || 0;
}

export function saveHighScore(modeId: string, levelId: string, score: number): boolean {
  if (typeof window === 'undefined' || score <= 0) return false;
  try {
    const key = `${modeId}_${levelId}`;
    const map = getHighScoresMap();
    const prev = map[key] || 0;
    if (score > prev) {
      map[key] = score;
      window.localStorage.setItem(STORAGE_KEY_HIGH_SCORES, JSON.stringify(map));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Volume2, Sparkles, Flame } from 'lucide-react';
import { GameHeaderHud } from '../common/GameHeaderHud';
import { GameResultModal } from '../common/GameResultModal';
import {
  getRandomWordsForGame,
  getWordsForLevel,
  markWordSeenInLevel,
  saveHighScore,
  getLocalizedGameLevelById,
  getWordDisplayMeaning,
  shuffleArray,
} from '../../services/vocabularyService';
import { useI18n } from '@/i18n';
import { playSfx, playComboSfx, speakChinese } from '../../services/audioService';
import { STAGE_MEMORY_BG_IMG } from '../../assets/stageArtAssets';
import type { GameWord, GameSessionResult } from '../../types/game.types';

interface MemoryCard {
  uid: string;
  wordId: string;
  kind: 'zh' | 'vi';
  word: GameWord;
  isFlipped: boolean;
  isMatched: boolean;
}

interface FloatingBadgeState {
  id: number;
  text: string;
}

interface MemoryFlipGameProps {
  levelId: string;
  onBack: () => void;
}

export const MemoryFlipGame: React.FC<MemoryFlipGameProps> = ({ levelId, onBack }) => {
  const { lang, isEn, tr } = useI18n();
  const langRef = useRef(lang);
  langRef.current = lang;
  const levelDef = useMemo(() => getLocalizedGameLevelById(levelId, lang), [levelId, lang]);
  const [cards, setCards] = useState<MemoryCard[]>([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [mistakes, setMistakes] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [mismatchIndices, setMismatchIndices] = useState<number[]>([]);
  const [floatingBadge, setFloatingBadge] = useState<FloatingBadgeState | null>(null);
  const [result, setResult] = useState<GameSessionResult | null>(null);

  const PAIR_COUNT = 6; // 12 cards total, ideal for both mobile and desktop
  const pairCountRef = useRef<number>(PAIR_COUNT);
  const cardsRef = useRef<MemoryCard[]>([]);
  const flippedIndicesRef = useRef<number[]>([]);
  const matchedIdsRef = useRef<Set<string>>(new Set());
  const scoreRef = useRef<number>(0);
  const comboRef = useRef<number>(0);
  const bestComboRef = useRef<number>(0);
  const mistakesRef = useRef<number>(0);
  const isLockedRef = useRef<boolean>(false);
  const startTimeRef = useRef<number>(Date.now());
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const seenWordIdsRef = useRef<Set<string>>(new Set());
  const seenLevelRef = useRef<string>(levelId);

  const safeTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach((id) => clearTimeout(id));
    timeoutsRef.current = [];
  }, []);

  const initGame = useCallback(() => {
    clearAllTimeouts();
    if (seenLevelRef.current !== levelId) {
      seenWordIdsRef.current.clear();
      seenLevelRef.current = levelId;
    }
    const pickedWords = getRandomWordsForGame(
      levelId,
      PAIR_COUNT,
      Array.from(seenWordIdsRef.current),
      langRef.current
    );
    const levelPoolSize = getWordsForLevel(levelId).length;
    pickedWords.forEach((word) => {
      markWordSeenInLevel(seenWordIdsRef.current, word.id, levelPoolSize);
    });
    pairCountRef.current = pickedWords.length;
    const newCards: MemoryCard[] = [];

    pickedWords.forEach((word) => {
      newCards.push({
        uid: `${word.id}_zh`,
        wordId: word.id,
        kind: 'zh',
        word,
        isFlipped: false,
        isMatched: false,
      });
      newCards.push({
        uid: `${word.id}_vi`,
        wordId: word.id,
        kind: 'vi',
        word,
        isFlipped: false,
        isMatched: false,
      });
    });

    // Shuffle deck with Fisher-Yates shuffle
    const shuffledCards = shuffleArray(newCards);

    cardsRef.current = shuffledCards;
    flippedIndicesRef.current = [];
    matchedIdsRef.current = new Set();
    scoreRef.current = 0;
    comboRef.current = 0;
    bestComboRef.current = 0;
    mistakesRef.current = 0;
    isLockedRef.current = false;
    startTimeRef.current = Date.now();

    setCards(shuffledCards);
    setFlippedIndices([]);
    setMatchedIds(new Set());
    setMistakes(0);
    setScore(0);
    setCombo(0);
    setMismatchIndices([]);
    setFloatingBadge(null);
    setResult(null);
  }, [levelId, clearAllTimeouts]);

  useEffect(() => {
    initGame();
    return () => {
      clearAllTimeouts();
    };
  }, [initGame, clearAllTimeouts]);

  const handleCardClick = (index: number) => {
    const targetCard = cardsRef.current[index];
    if (
      result ||
      isLockedRef.current ||
      !targetCard ||
      targetCard.isMatched ||
      targetCard.isFlipped ||
      flippedIndicesRef.current.length >= 2 ||
      flippedIndicesRef.current.includes(index)
    ) {
      return;
    }

    playSfx('flip');

    const nextFlipped = [...flippedIndicesRef.current, index];
    flippedIndicesRef.current = nextFlipped;
    setFlippedIndices(nextFlipped);

    if (nextFlipped.length === 1) {
      if (targetCard.kind === 'zh') {
        speakChinese(targetCard.word.hanzi);
      }
      return;
    }

    if (nextFlipped.length === 2) {
      const [firstIdx, secondIdx] = nextFlipped;
      const first = cardsRef.current[firstIdx];
      const second = cardsRef.current[secondIdx];

      if (first && second && first.wordId === second.wordId && first.kind !== second.kind) {
        // MATCH!
        speakChinese(first.word.hanzi);

        const nextCombo = comboRef.current + 1;
        comboRef.current = nextCombo;
        bestComboRef.current = Math.max(bestComboRef.current, nextCombo);
        setCombo(nextCombo);

        const gained = 150 + (nextCombo - 1) * 50;
        scoreRef.current += gained;
        setScore(scoreRef.current);

        if (nextCombo >= 2) {
          playComboSfx(nextCombo);
        } else {
          playSfx('ok');
        }

        setFloatingBadge({
          id: Date.now() + index,
          text: nextCombo >= 2 ? `+${gained} · Combo x${nextCombo}!` : `+${gained}`,
        });
        safeTimeout(() => setFloatingBadge(null), 850);

        const nextMatched = new Set(matchedIdsRef.current);
        nextMatched.add(first.wordId);
        matchedIdsRef.current = nextMatched;
        setMatchedIds(nextMatched);

        const updatedCards = cardsRef.current.map((c) =>
          c.wordId === first.wordId ? { ...c, isMatched: true, isFlipped: true } : c
        );
        cardsRef.current = updatedCards;
        setCards(updatedCards);

        flippedIndicesRef.current = [];
        setFlippedIndices([]);

        // Check if finished
        const totalPairs = pairCountRef.current;
        if (nextMatched.size === totalPairs && totalPairs > 0) {
          const finalScore = Math.max(100, scoreRef.current);
          scoreRef.current = finalScore;
          setScore(finalScore);

          const currentMistakes = mistakesRef.current;
          const duration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
          const stars: 1 | 2 | 3 = currentMistakes <= 2 ? 3 : currentMistakes <= 5 ? 2 : 1;
          const isNew = saveHighScore('memory-flip', levelId, finalScore);

          safeTimeout(() => {
            playSfx('win');
            setResult({
              modeId: 'memory-flip',
              levelId,
              score: finalScore,
              stars,
              correctCount: totalPairs,
              totalQuestions: totalPairs,
              accuracy: Math.max(20, Math.round((totalPairs / (totalPairs + currentMistakes)) * 100)),
              timeSpentSeconds: duration,
              streakBest: bestComboRef.current,
              isNewRecord: isNew,
            });
          }, 600);
        }
      } else {
        // MISMATCH
        if (targetCard.kind === 'zh') {
          speakChinese(targetCard.word.hanzi);
        }
        isLockedRef.current = true;
        comboRef.current = 0;
        setCombo(0);

        mistakesRef.current += 1;
        setMistakes(mistakesRef.current);

        scoreRef.current = Math.max(0, scoreRef.current - 25);
        setScore(scoreRef.current);

        setMismatchIndices([firstIdx, secondIdx]);
        playSfx('err');

        safeTimeout(() => {
          flippedIndicesRef.current = [];
          setFlippedIndices([]);
          setMismatchIndices([]);
          isLockedRef.current = false;
        }, 750);
      }
    }
  };

  return (
    <div
      data-testid="memory-flip-game"
      className="relative overflow-hidden mx-auto flex w-full max-w-4xl flex-col gap-2 rounded-2xl border-2 border-[#6D4221] p-1.5 shadow-xl sm:gap-3 sm:rounded-3xl sm:p-4"
    >
      {/* Painted Rosewood Scholar's Tea-Table Arena */}
      <img
        src={STAGE_MEMORY_BG_IMG}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[#F7EEDC]/35"
        aria-hidden="true"
      />

      <div className="relative z-10">
        <GameHeaderHud
          modeId="memory-flip"
          title={tr('Lật Thẻ Trí Nhớ', 'Memory Card Flip')}
          levelLabel={levelDef.shortLabel}
          score={score}
          waveText={tr(
            `Cặp ${matchedIds.size}/${pairCountRef.current || PAIR_COUNT}`,
            `Pairs ${matchedIds.size}/${pairCountRef.current || PAIR_COUNT}`
          )}
          onBack={onBack}
          onRestart={initGame}
        />
      </div>

      {/* Instructions & Combo Strip */}
      <div className="relative z-10 flex items-center justify-between gap-2 rounded-xl border border-[#B8893E]/70 bg-[#FFFDF7]/[0.92] px-2.5 py-1 text-[11px] font-semibold text-[#4A2B13] shadow-xs sm:px-3 sm:py-1.5 sm:text-xs">
        <div className="flex min-w-0 items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span className="truncate sm:hidden">{tr('Ghép Hán tự & Nghĩa', 'Match Hanzi & Meaning')}</span>
          <span className="hidden sm:inline">
            {tr(
              'Chạm vào thẻ để lật và ghép đúng Hán tự với Nghĩa tiếng Việt',
              'Tap cards to flip and match each Hanzi with its English meaning'
            )}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {combo >= 2 && (
            <span
              data-testid="memory-combo-badge"
              className="inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-2 py-0.5 text-[10px] font-black text-white shadow-xs"
            >
              <Flame className="h-3 w-3 fill-amber-100" />
              <span>Combo x{combo}</span>
            </span>
          )}
          <span className="font-mono text-[11px] font-bold text-[#6E3B16]">
            {tr('Lỗi', 'Misses')}: {mistakes}
          </span>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="relative z-10">
        {floatingBadge && (
          <div
            key={floatingBadge.id}
            data-testid="memory-floating-badge"
            className="animate-score-float pointer-events-none absolute top-2 left-1/2 z-30 rounded-full border border-amber-300 bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-1 text-xs font-black whitespace-nowrap text-white shadow-lg"
          >
            {floatingBadge.text}
          </div>
        )}

        <div
          data-testid="memory-flip-grid"
          className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3.5"
        >
          {cards.map((card, idx) => {
            const isOpen = card.isMatched || flippedIndices.includes(idx);
            const isMismatch = mismatchIndices.includes(idx);

            return (
              <div
                key={card.uid}
                data-testid={`memory-card-${idx}`}
                onClick={() => handleCardClick(idx)}
                className={`perspective-[800px] h-[84px] cursor-pointer select-none sm:h-32 ${
                  isMismatch ? 'animate-shake' : ''
                }`}
              >
                <div
                  className={`relative h-full w-full rounded-xl transition-transform duration-200 transform-style-3d sm:rounded-2xl ${
                    isOpen ? 'rotate-y-180' : ''
                  }`}
                >
                  {/* BACK OF CARD: 3D Crimson-Rosewood Carved Lacquer Tile */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-amber-400/75 border-b-[5px] border-b-[#3F0A0A] bg-gradient-to-br from-[#991B1B] via-[#7F1D1D] to-[#450A0A] p-1.5 shadow-[0_5px_10px_rgba(20,5,0,0.38)] backface-hidden transition-transform hover:scale-[1.02] active:scale-95 sm:rounded-2xl sm:p-2">
                    {/* Top lacquer glossy sheen */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-1 top-0.5 h-1/3 rounded-t-lg bg-gradient-to-b from-white/15 to-transparent"
                    />

                    <div className="relative flex h-full w-full flex-col items-center justify-center rounded-lg border border-amber-300/45 p-1 sm:rounded-xl">
                      {/* Subtle Golden Corner Ruyi SVG Filigree */}
                      {(['top-0.5 left-0.5', 'top-0.5 right-0.5 -scale-x-100', 'bottom-0.5 left-0.5 -scale-y-100', 'bottom-0.5 right-0.5 -scale-x-100 -scale-y-100'] as const).map(
                        (posClass, cornerIdx) => (
                          <svg
                            key={cornerIdx}
                            viewBox="0 0 16 16"
                            aria-hidden="true"
                            className={`pointer-events-none absolute h-2.5 w-2.5 text-amber-300/70 sm:h-3 sm:w-3 ${posClass}`}
                            fill="none"
                          >
                            <path
                              d="M1.5 11V3.5C1.5 2.4 2.4 1.5 3.5 1.5H11"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                            <circle cx="4.8" cy="4.8" r="0.9" fill="currentColor" />
                          </svg>
                        )
                      )}

                      <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-amber-300/70 bg-gradient-to-b from-amber-300/20 to-amber-500/10 font-hanzi text-sm font-bold text-amber-200 shadow-inner sm:h-10 sm:w-10 sm:text-lg">
                        孔
                      </div>
                      <span className="mt-0.5 font-display text-[8.5px] font-bold tracking-widest text-amber-200/90 uppercase sm:mt-1 sm:text-[10px]">
                        {tr('Khổng Tử', 'Confucius')}
                      </span>
                    </div>
                  </div>

                  {/* FRONT OF CARD: 3D Mutton-Fat Jade / Ivory Mahjong Tile -> Celadon Jade when matched */}
                  <div
                    className={`absolute inset-0 flex flex-col items-center justify-center rounded-xl border-2 border-b-[5px] p-1 text-center rotate-y-180 backface-hidden sm:rounded-2xl sm:p-2.5 ${
                      card.isMatched
                        ? 'border-emerald-500 border-b-emerald-800 bg-gradient-to-b from-emerald-50 to-emerald-100/95 text-emerald-950 shadow-[0_5px_10px_rgba(16,60,40,0.22)]'
                        : 'border-[#CFA355] border-b-[#9A6F25] bg-gradient-to-b from-[#FFFDF9] via-[#FCF5E5] to-[#EFE0C0] text-stone-900 shadow-[0_5px_10px_rgba(25,12,4,0.28)]'
                    }`}
                  >
                    {card.kind === 'zh' ? (
                      <div className="flex flex-col items-center justify-center">
                        <span className="font-hanzi text-2xl font-bold leading-none text-red-900 sm:text-3xl">
                          {card.word.hanzi}
                        </span>
                        <span className="mt-0.5 font-mono text-[10px] font-bold leading-tight text-stone-600 sm:mt-1 sm:text-xs">
                          {card.word.pinyin}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            speakChinese(card.word.hanzi);
                          }}
                          aria-label={tr('Nghe đọc', 'Listen')}
                          className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-red-200 bg-red-100 text-red-800 hover:bg-red-200 sm:mt-1 sm:h-5 sm:w-5"
                        >
                          <Volume2 className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center">
                        <span className="max-w-full break-words px-0.5 font-sans text-[11.5px] font-extrabold leading-snug text-stone-950 sm:text-sm">
                          {getWordDisplayMeaning(card.word, lang)}
                        </span>
                        {!isEn && card.word.hanViet && (
                          <span className="mt-0.5 max-w-full break-words font-sans text-[10px] font-bold leading-tight text-[#5C3718] sm:mt-1 sm:text-xs">
                            HV: {card.word.hanViet}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Result Modal */}
      {result && (
        <GameResultModal
          result={result}
          onReplay={initGame}
          onBackToLobby={onBack}
        />
      )}
    </div>
  );
};

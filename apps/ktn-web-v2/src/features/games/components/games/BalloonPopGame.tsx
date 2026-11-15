import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Volume2, Sparkles, Pause, Play, Flame } from 'lucide-react';
import { GameHeaderHud } from '../common/GameHeaderHud';
import { GameResultModal } from '../common/GameResultModal';
import {
  getRandomWordsForGame,
  getWordsForLevel,
  markWordSeenInLevel,
  avoidSeamRepeat,
  getDistractorWords,
  getWordDisplayMeaning,
  shuffleArray,
  saveHighScore,
  getLocalizedGameLevelById,
} from '../../services/vocabularyService';
import { useI18n } from '@/i18n';
import { playSfx, playComboSfx, speakChinese } from '../../services/audioService';
import { STAGE_BALLOON_BG_IMG } from '../../assets/stageArtAssets';
import type { GameWord, GameSessionResult } from '../../types/game.types';

interface BalloonTheme {
  body: string;
  knot: string;
  burstRing: string;
  shardColor: string;
  textShadowClass: string;
}

interface BalloonItem {
  id: string;
  text: string;
  word?: GameWord;
  isCorrect: boolean;
  theme: BalloonTheme;
  isPopping: boolean;
  popType: 'correct' | 'wrong' | null;
  earnedPoints?: number;
  laneIndex: number; // 0..3 corresponding to LANES_X_PERCENT
  yPercent: number; // Vertical position (% of balloon-stage height; decreases as balloon rises)
  swayPhase: number;
}

interface BalloonPopGameProps {
  levelId: string;
  onBack: () => void;
}

interface ShardVector {
  tx: string;
  ty: string;
  rot: string;
  sizeClass: string;
}

const LANES_X_PERCENT = [18, 39, 61, 82] as const;

// Non-adjacent lane launch orders so consecutive rising balloons stay horizontally separated
const LANE_PATTERNS: readonly [number, number, number, number][] = [
  [1, 3, 0, 2],
  [2, 0, 3, 1],
  [0, 2, 1, 3],
  [3, 1, 2, 0],
];

const INITIAL_Y_START = 112;
const STAGGER_Y_GAP = 46;
const SPEED_PERCENT_PER_SEC = 22;
const TOP_EXIT_Y = -22;
const RESPAWN_MIN_Y = 118;

// 8 fixed radial vectors (0°, 45°, ..., 315°) for crisp latex shard burst on pop
const POP_SHARD_VECTORS: readonly ShardVector[] = [
  { tx: '40px', ty: '0px', rot: '24deg', sizeClass: 'h-2.5 w-3.5' },
  { tx: '29px', ty: '29px', rot: '68deg', sizeClass: 'h-2 w-3' },
  { tx: '0px', ty: '40px', rot: '112deg', sizeClass: 'h-2.5 w-3.5' },
  { tx: '-29px', ty: '29px', rot: '154deg', sizeClass: 'h-2 w-3' },
  { tx: '-40px', ty: '0px', rot: '-24deg', sizeClass: 'h-2.5 w-3.5' },
  { tx: '-29px', ty: '-29px', rot: '-68deg', sizeClass: 'h-2 w-3' },
  { tx: '0px', ty: '-40px', rot: '-112deg', sizeClass: 'h-2.5 w-3.5' },
  { tx: '29px', ty: '-29px', rot: '-154deg', sizeClass: 'h-2 w-3' },
];

function getBalloonTextSizeClass(text: string): string {
  const len = text.trim().length;
  if (len <= 14) return 'text-[11.5px] sm:text-[13.5px]';
  if (len <= 22) return 'text-[10.5px] sm:text-[12.5px]';
  return 'text-[10.5px] sm:text-[11.5px]';
}

const BALLOON_THEMES: BalloonTheme[] = [
  {
    body: 'from-rose-400 via-rose-500 to-rose-700 border-rose-200/90 text-white shadow-[inset_-8px_-12px_18px_rgba(0,0,0,0.22),inset_5px_7px_14px_rgba(255,255,255,0.45),0_8px_16px_rgba(30,15,5,0.18)]',
    knot: 'bg-amber-400 border-amber-700',
    burstRing: 'border-rose-400 bg-rose-200/50',
    shardColor: '#F43F5E',
    textShadowClass: 'drop-shadow-[0_1px_1px_rgba(0,0,0,0.32)]',
  },
  {
    body: 'from-amber-300 via-amber-400 to-amber-500 border-amber-100/95 text-amber-950 shadow-[inset_-8px_-12px_18px_rgba(120,53,15,0.22),inset_5px_7px_14px_rgba(255,255,255,0.52),0_8px_16px_rgba(30,15,5,0.18)]',
    knot: 'bg-amber-500 border-amber-700',
    burstRing: 'border-amber-400 bg-amber-200/50',
    shardColor: '#F59E0B',
    textShadowClass: '',
  },
  {
    body: 'from-sky-400 via-sky-500 to-sky-700 border-sky-200/90 text-white shadow-[inset_-8px_-12px_18px_rgba(0,0,0,0.22),inset_5px_7px_14px_rgba(255,255,255,0.45),0_8px_16px_rgba(30,15,5,0.18)]',
    knot: 'bg-amber-400 border-amber-700',
    burstRing: 'border-sky-400 bg-sky-200/50',
    shardColor: '#0EA5E9',
    textShadowClass: 'drop-shadow-[0_1px_1px_rgba(0,0,0,0.32)]',
  },
  {
    body: 'from-emerald-400 via-emerald-500 to-emerald-700 border-emerald-200/90 text-white shadow-[inset_-8px_-12px_18px_rgba(0,0,0,0.22),inset_5px_7px_14px_rgba(255,255,255,0.45),0_8px_16px_rgba(30,15,5,0.18)]',
    knot: 'bg-amber-400 border-amber-700',
    burstRing: 'border-emerald-400 bg-emerald-200/50',
    shardColor: '#10B981',
    textShadowClass: 'drop-shadow-[0_1px_1px_rgba(0,0,0,0.32)]',
  },
  {
    body: 'from-violet-400 via-purple-500 to-purple-700 border-purple-200/90 text-white shadow-[inset_-8px_-12px_18px_rgba(0,0,0,0.22),inset_5px_7px_14px_rgba(255,255,255,0.45),0_8px_16px_rgba(30,15,5,0.18)]',
    knot: 'bg-amber-400 border-amber-700',
    burstRing: 'border-purple-400 bg-purple-200/50',
    shardColor: '#A855F7',
    textShadowClass: 'drop-shadow-[0_1px_1px_rgba(0,0,0,0.32)]',
  },
  {
    body: 'from-pink-400 via-pink-500 to-rose-600 border-pink-200/90 text-white shadow-[inset_-8px_-12px_18px_rgba(0,0,0,0.22),inset_5px_7px_14px_rgba(255,255,255,0.45),0_8px_16px_rgba(30,15,5,0.18)]',
    knot: 'bg-amber-400 border-amber-700',
    burstRing: 'border-pink-400 bg-pink-200/50',
    shardColor: '#EC4899',
    textShadowClass: 'drop-shadow-[0_1px_1px_rgba(0,0,0,0.32)]',
  },
];

const BalloonSkyScenery = React.memo(function BalloonSkyScenery() {
  return (
    <>
      {/* Layer 1: Painted Guilin Sky, Karst Peaks, Pagoda, Meadow & Blossoms */}
      <img
        src={STAGE_BALLOON_BG_IMG}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />

      {/* Layer 1b SVG: Soft Animated Morning Sunbeams & Silk Cloud Wisps */}
      <svg
        viewBox="0 0 800 140"
        preserveAspectRatio="xMidYMin slice"
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-20 w-full select-none sm:h-28"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="guilin-sunbeam" x1="0.8" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor="#FEF3C7" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#FEF3C7" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Warm morning sunbeams fanning subtly from top-right */}
        <polygon points="620,0 740,0 560,140 440,140" fill="url(#guilin-sunbeam)" />
        <polygon points="665,0 785,0 695,140 595,140" fill="url(#guilin-sunbeam)" opacity="0.7" />

        {/* Soft silk cloud wisps */}
        <g opacity="0.55">
          <path
            d="M110 46 Q142 30 184 36 Q216 26 244 42 Q266 44 268 52 Q210 54 110 52 Z"
            fill="#FFFFFF"
          />
          <path
            d="M126 58 Q186 54 250 58"
            stroke="#FFFFFF"
            strokeWidth="2.4"
            strokeLinecap="round"
            opacity="0.7"
          />
        </g>
        <g opacity="0.45">
          <path
            d="M474 70 Q502 58 534 62 Q558 54 580 65 Q598 67 600 73 Q534 74 474 73 Z"
            fill="#FFFFFF"
          />
        </g>
      </svg>

      {/* Layer 2 SVG: Foreground Crisp Painted Grass & Bamboo Blade Silhouette Masking Bottom Spawn */}
      <svg
        viewBox="0 0 800 72"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-8 w-full select-none sm:h-10"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="foreground-grass-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#15803D" stopOpacity="0.82" />
            <stop offset="100%" stopColor="#064E3B" stopOpacity="0.96" />
          </linearGradient>
        </defs>
        <path
          d="M0 72 L0 44 Q24 26 42 46 Q68 20 88 45 Q118 28 142 48 Q184 26 218 46 Q254 22 288 46 Q332 30 374 47 Q414 22 456 46 Q498 28 538 45 Q578 20 618 46 Q664 26 704 45 Q748 18 784 42 L800 36 L800 72 Z"
          fill="url(#foreground-grass-grad)"
        />
        {/* Bamboo blade accents at left & right edges */}
        <path d="M24 72 Q36 38 66 20 Q50 48 40 72 Z" fill="#166534" />
        <path d="M46 72 Q62 42 94 28 Q74 52 60 72 Z" fill="#15803D" opacity="0.9" />
        <path d="M746 72 Q728 40 696 22 Q718 48 730 72 Z" fill="#166534" />
        <path d="M768 72 Q756 44 732 26 Q748 52 756 72 Z" fill="#15803D" opacity="0.9" />
      </svg>
    </>
  );
});

export const BalloonPopGame: React.FC<BalloonPopGameProps> = ({ levelId, onBack }) => {
  const { lang, isEn, tr } = useI18n();
  const langRef = useRef(lang);
  langRef.current = lang;
  const levelDef = useMemo(() => getLocalizedGameLevelById(levelId, lang), [levelId, lang]);
  const [currentWord, setCurrentWord] = useState<GameWord | null>(null);
  const [balloons, setBalloons] = useState<BalloonItem[]>([]);
  const [hearts, setHearts] = useState(3);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [round, setRound] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const [result, setResult] = useState<GameSessionResult | null>(null);

  const TOTAL_ROUNDS = 10;
  const wordsPoolRef = useRef<GameWord[]>([]);
  const poolIdxRef = useRef<number>(0);
  const isRoundTransitioningRef = useRef<boolean>(false);
  const balloonsRef = useRef<BalloonItem[]>([]);
  const roundRef = useRef<number>(1);
  const heartsRef = useRef<number>(3);
  const scoreRef = useRef<number>(0);
  const correctCountRef = useRef<number>(0);
  const streakRef = useRef<number>(0);
  const bestStreakRef = useRef<number>(0);
  const wrongTapsRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());
  const poppedIdsRef = useRef<Set<string>>(new Set());
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(Date.now());
  const seenWordIdsRef = useRef<Set<string>>(new Set());
  const seenLevelRef = useRef<string>(levelId);
  const lastTargetIdRef = useRef<string | null>(null);
  const lastLanePatternIdxRef = useRef<number>(-1);

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

  const setupRound = useCallback(() => {
    isRoundTransitioningRef.current = false;
    poppedIdsRef.current.clear();
    if (seenLevelRef.current !== levelId) {
      seenWordIdsRef.current.clear();
      seenLevelRef.current = levelId;
      lastTargetIdRef.current = null;
    }
    if (wordsPoolRef.current.length === 0 || poolIdxRef.current >= wordsPoolRef.current.length) {
      const batch = getRandomWordsForGame(
        levelId,
        TOTAL_ROUNDS,
        Array.from(seenWordIdsRef.current),
        langRef.current
      );
      wordsPoolRef.current = avoidSeamRepeat(batch, lastTargetIdRef.current);
      poolIdxRef.current = 0;
    }

    const target = wordsPoolRef.current[poolIdxRef.current];
    poolIdxRef.current++;

    if (!target) return;

    markWordSeenInLevel(seenWordIdsRef.current, target.id, getWordsForLevel(levelId).length);
    lastTargetIdRef.current = target.id;
    setCurrentWord(target);
    speakChinese(target.hanzi);

    // Pick 3 distractors -> 4 balloons rising sequentially from bottom to top
    const activeLang = langRef.current;
    const distractors = getDistractorWords(target, 3, levelId, activeLang);
    const rawOptions = [
      { text: getWordDisplayMeaning(target, activeLang), word: target, isCorrect: true },
      ...distractors.map((distWord) => ({
        text: getWordDisplayMeaning(distWord, activeLang),
        word: distWord,
        isCorrect: false,
      })),
    ];

    const shuffled = shuffleArray(rawOptions);
    let patternIdx = Math.floor(Math.random() * LANE_PATTERNS.length);
    if (LANE_PATTERNS.length > 1 && patternIdx === lastLanePatternIdxRef.current) {
      patternIdx =
        (patternIdx + 1 + Math.floor(Math.random() * (LANE_PATTERNS.length - 1))) %
        LANE_PATTERNS.length;
    }
    lastLanePatternIdxRef.current = patternIdx;
    const laneOrder = LANE_PATTERNS[patternIdx];
    const roundThemes = shuffleArray(BALLOON_THEMES);

    const items: BalloonItem[] = shuffled.map((opt, idx) => ({
      id: `balloon_r${roundRef.current}_${idx}_${Date.now()}`,
      text: opt.text,
      word: opt.word,
      isCorrect: opt.isCorrect,
      theme: roundThemes[idx % roundThemes.length],
      isPopping: false,
      popType: null,
      laneIndex: laneOrder[idx],
      yPercent: INITIAL_Y_START + idx * STAGGER_Y_GAP,
      swayPhase: idx * 1.4,
    }));

    balloonsRef.current = items;
    setBalloons(items);
    lastTickTimeRef.current = Date.now();
  }, [levelId]);

  const initGame = useCallback(() => {
    clearAllTimeouts();
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (seenLevelRef.current !== levelId) {
      seenWordIdsRef.current.clear();
      seenLevelRef.current = levelId;
      lastTargetIdRef.current = null;
    }
    const initialBatch = getRandomWordsForGame(
      levelId,
      TOTAL_ROUNDS,
      Array.from(seenWordIdsRef.current),
      langRef.current
    );
    wordsPoolRef.current = avoidSeamRepeat(initialBatch, lastTargetIdRef.current);
    poolIdxRef.current = 0;
    roundRef.current = 1;
    heartsRef.current = 3;
    scoreRef.current = 0;
    correctCountRef.current = 0;
    streakRef.current = 0;
    bestStreakRef.current = 0;
    wrongTapsRef.current = 0;
    startTimeRef.current = Date.now();
    poppedIdsRef.current.clear();
    setHearts(3);
    setScore(0);
    setStreak(0);
    setRound(1);
    setIsPaused(false);
    setResult(null);
    setupRound();
  }, [levelId, setupRound, clearAllTimeouts]);

  useEffect(() => {
    initGame();
    return () => {
      clearAllTimeouts();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [initGame, clearAllTimeouts]);

  // Continuous bottom-to-top sequential flight loop via requestAnimationFrame
  useEffect(() => {
    if (isPaused || result) return;

    let cancelled = false;
    lastTickTimeRef.current = Date.now();

    const tick = () => {
      if (cancelled) return;

      const now = Date.now();
      // Clamp deltaSec so tab switching or pausing never teleports balloons past the sky
      const deltaSec = Math.min(0.08, Math.max(0, (now - lastTickTimeRef.current) / 1000));
      lastTickTimeRef.current = now;

      if (!isRoundTransitioningRef.current && deltaSec > 0) {
        const moved = balloonsRef.current.map((b) => {
          if (b.isPopping) return b;
          return {
            ...b,
            yPercent: b.yPercent - SPEED_PERCENT_PER_SEC * deltaSec,
          };
        });

        const hasExitedTop = moved.some((b) => !b.isPopping && b.yPercent <= TOP_EXIT_Y);
        let nextBalloons = moved;

        if (hasExitedTop) {
          // Re-queue balloons that floated past the top back to the bottom tail in order
          let maxY = Math.max(
            RESPAWN_MIN_Y - STAGGER_Y_GAP,
            ...moved
              .filter((item) => !item.isPopping && item.yPercent > TOP_EXIT_Y)
              .map((item) => item.yPercent)
          );
          nextBalloons = moved.map((item) => {
            if (item.isPopping || item.yPercent > TOP_EXIT_Y) return item;
            const nextY = Math.max(RESPAWN_MIN_Y, maxY + STAGGER_Y_GAP);
            maxY = nextY;
            return { ...item, yPercent: nextY };
          });
        }

        balloonsRef.current = nextBalloons;
        setBalloons(nextBalloons);
      }

      if (!cancelled) {
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPaused, result]);

  const handlePopBalloon = (balloon: BalloonItem) => {
    if (
      isPaused ||
      result ||
      balloon.isPopping ||
      isRoundTransitioningRef.current ||
      poppedIdsRef.current.has(balloon.id)
    ) {
      return;
    }

    poppedIdsRef.current.add(balloon.id);

    if (balloon.isCorrect) {
      // Pop correct balloon! Lock against additional taps during round transition
      isRoundTransitioningRef.current = true;
      if (currentWord) speakChinese(currentWord.hanzi);

      const nextStreak = streakRef.current + 1;
      streakRef.current = nextStreak;
      bestStreakRef.current = Math.max(bestStreakRef.current, nextStreak);
      setStreak(nextStreak);

      // Strict first-hit invariant: streak 1 -> 100, streak >= 2 -> 125, 150, 175...
      const earned = nextStreak === 1 ? 100 : 100 + (nextStreak - 1) * 25;
      if (nextStreak >= 2) {
        playComboSfx(nextStreak);
      } else {
        playSfx('pop');
      }

      const updated = balloonsRef.current.map((b) =>
        b.id === balloon.id
          ? { ...b, isPopping: true, popType: 'correct' as const, earnedPoints: earned }
          : b
      );
      balloonsRef.current = updated;
      setBalloons(updated);

      const nextCorrect = correctCountRef.current + 1;
      const nextScore = scoreRef.current + earned;
      correctCountRef.current = nextCorrect;
      scoreRef.current = nextScore;
      setScore(nextScore);

      if (roundRef.current >= TOTAL_ROUNDS) {
        // Complete game
        safeTimeout(() => {
          playSfx('win');
          const isNew = saveHighScore('balloon-pop', levelId, nextScore);
          const duration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
          const currentHearts = heartsRef.current;
          const stars: 1 | 2 | 3 = currentHearts === 3 ? 3 : currentHearts === 2 ? 2 : 1;

          setResult({
            modeId: 'balloon-pop',
            levelId,
            score: nextScore,
            stars,
            correctCount: nextCorrect,
            totalQuestions: TOTAL_ROUNDS,
            accuracy: Math.round(
              (nextCorrect / Math.max(1, nextCorrect + wrongTapsRef.current)) * 100
            ),
            timeSpentSeconds: duration,
            streakBest: bestStreakRef.current,
            isNewRecord: isNew,
          });
        }, 500);
      } else {
        // Advance round after brief pop animation
        safeTimeout(() => {
          const nextR = roundRef.current + 1;
          roundRef.current = nextR;
          setRound(nextR);
          setupRound();
        }, 420);
      }
    } else {
      // Wrong balloon popped! Reset streak and mark popped so it cannot be tapped repeatedly
      playSfx('err');
      streakRef.current = 0;
      setStreak(0);
      wrongTapsRef.current += 1;

      const updatedWrong = balloonsRef.current.map((b) =>
        b.id === balloon.id ? { ...b, isPopping: true, popType: 'wrong' as const } : b
      );
      balloonsRef.current = updatedWrong;
      setBalloons(updatedWrong);

      const nextHearts = Math.max(0, heartsRef.current - 1);
      heartsRef.current = nextHearts;
      setHearts(nextHearts);

      if (nextHearts <= 0) {
        // Game Over
        isRoundTransitioningRef.current = true;
        playSfx('gameover');
        const duration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
        const finalScore = scoreRef.current;
        const finalCorrect = correctCountRef.current;
        const isNew = finalScore > 0 ? saveHighScore('balloon-pop', levelId, finalScore) : false;
        setResult({
          modeId: 'balloon-pop',
          levelId,
          score: finalScore,
          stars: 1,
          correctCount: finalCorrect,
          totalQuestions: roundRef.current,
          accuracy: Math.round(
            (finalCorrect / Math.max(1, finalCorrect + wrongTapsRef.current)) * 100
          ),
          timeSpentSeconds: duration,
          streakBest: bestStreakRef.current,
          isNewRecord: isNew,
        });
      }
    }
  };

  return (
    <div
      data-testid="balloon-pop-game"
      className="mx-auto flex w-full max-w-2xl flex-col gap-2 rounded-2xl border-2 border-[#8B5E34]/45 bg-gradient-to-b from-[#E7F4FC] via-[#FDFBF5] to-[#E6F4EC] p-1.5 shadow-xl sm:gap-3 sm:rounded-3xl sm:p-3.5"
    >
      <GameHeaderHud
        modeId="balloon-pop"
        title={tr('Bắn Bóng Bay', 'Balloon Pop')}
        levelLabel={levelDef.shortLabel}
        score={score}
        hearts={hearts}
        maxHearts={3}
        waveText={tr(`Màn ${round}/${TOTAL_ROUNDS}`, `Round ${round}/${TOTAL_ROUNDS}`)}
        onBack={onBack}
        onRestart={initGame}
      />

      {/* Target Word Card: Gilded Parchment Scroll Frame */}
      {currentWord && (
        <div className="relative flex flex-col items-center justify-center rounded-2xl border-[2px] border-[#C6923A] bg-gradient-to-b from-[#FFFDF8] to-[#F8EED8] px-3 py-2 text-center shadow-[0_3px_0_rgba(120,74,28,0.22)] sm:px-4 sm:py-3">
          {/* Golden Corner Filigree */}
          {(['top-1 left-1', 'top-1 right-1 -scale-x-100', 'bottom-1 left-1 -scale-y-100', 'bottom-1 right-1 -scale-x-100 -scale-y-100'] as const).map(
            (posClass, cornerIdx) => (
              <svg
                key={cornerIdx}
                viewBox="0 0 24 24"
                aria-hidden="true"
                className={`pointer-events-none absolute h-3.5 w-3.5 text-[#C6923A] sm:h-4 sm:w-4 ${posClass}`}
                fill="none"
              >
                <path
                  d="M2.5 16V5.5C2.5 3.84 3.84 2.5 5.5 2.5H16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" opacity="0.85" />
              </svg>
            )
          )}

          <div className="flex flex-wrap items-center justify-center gap-1.5 px-10 text-[11px] font-extrabold text-[#6E3B16]">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3 shrink-0 text-rose-600" />
              <span>{tr('Chạm bóng đúng nghĩa', 'Tap the matching balloon')}</span>
            </span>

            {!isEn && currentWord.hanViet && (
              <span className="rounded-full border border-[#C6923A]/55 bg-[#FFFDF8]/90 px-2 py-0.5 font-mono text-[10px] font-bold text-[#5C3718]">
                HV: {currentWord.hanViet}
              </span>
            )}

            {streak >= 2 && (
              <span
                data-testid="balloon-combo-badge"
                className="inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-2 py-0.5 text-[10px] font-black text-white shadow-xs"
              >
                <Flame className="h-3 w-3 fill-amber-100" />
                <span>Combo x{streak}</span>
              </span>
            )}
          </div>

          <div className="mt-1 flex w-full items-center justify-center gap-2.5 sm:gap-3">
            <span
              data-testid="balloon-target-hanzi"
              className="font-hanzi text-3xl font-bold leading-none text-rose-950 sm:text-4xl"
            >
              {currentWord.hanzi}
            </span>

            <button
              type="button"
              data-testid="balloon-target-audio-btn"
              onClick={() => speakChinese(currentWord.hanzi)}
              aria-label={tr('Phát âm từ vựng', 'Pronounce word')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-300/60 border-b-[3px] border-b-[#7F1D1D] bg-gradient-to-b from-rose-500 via-rose-600 to-red-800 text-white shadow-md transition-transform hover:scale-105 active:translate-y-[1px] active:scale-95"
            >
              <Volume2 className="h-4 w-4" />
            </button>
          </div>

          <span className="mt-1 font-mono text-xs font-extrabold text-[#5C3718] sm:text-sm">
            {currentWord.pinyin}
          </span>

          <button
            type="button"
            data-testid="balloon-pause-btn"
            onClick={() => setIsPaused((p) => !p)}
            aria-label={isPaused ? tr('Tiếp tục', 'Resume') : tr('Tạm dừng', 'Pause')}
            className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-xl border border-[#B8893E]/65 border-b-[2px] border-b-[#7C4D25] bg-gradient-to-b from-[#FFFDF8] to-[#F4E3C2] text-[#5C3718] shadow-xs transition-all hover:from-amber-50 hover:to-amber-100 active:translate-y-[1px] active:scale-95 sm:top-3 sm:right-3"
          >
            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}

      {/* Balloon Stage (Sequential Bottom-to-Top Rising Eastern Sky Canvas) */}
      <div
        data-testid="balloon-stage"
        className="relative h-[360px] w-full overflow-hidden rounded-2xl border-[3px] border-[#7C4D25]/60 bg-gradient-to-b from-[#BFE3FA] via-[#E5F4FD] to-[#E6F7EE] shadow-xl sm:h-[430px] sm:rounded-3xl"
      >
        <BalloonSkyScenery />

        {/* Rising 3D Glossy Silk Festival Lantern-Balloons */}
        {balloons.map((balloon, idx) => {
          const leftPercent = LANES_X_PERCENT[balloon.laneIndex] ?? LANES_X_PERCENT[idx % 4];
          const phase = balloon.swayPhase + balloon.yPercent * 0.065;
          const swayPx = Math.round(Math.sin(phase) * 9 * 2) / 2;
          const tiltDeg = Math.cos(phase) * 4.2;

          return (
            <button
              type="button"
              key={balloon.id}
              data-testid={`balloon-item-${idx}`}
              onClick={() => handlePopBalloon(balloon)}
              className={`group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 appearance-none flex-col items-center border-0 bg-transparent p-0 focus:outline-none ${
                balloon.isPopping ? 'pointer-events-none' : 'cursor-pointer active:scale-90'
              }`}
              style={{
                top: `${balloon.yPercent}%`,
                left: `${leftPercent}%`,
              }}
            >
              <div
                className="relative flex flex-col items-center"
                style={{
                  transform: `translateX(${swayPx}px) rotate(${tiltDeg.toFixed(2)}deg)`,
                }}
              >
                {/* Pop Burst Ring, 8 Radial Shards & Feedback Badge */}
                {balloon.isPopping && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-[94px] items-center justify-center sm:h-[116px]">
                    <span
                      className={`h-20 w-20 animate-ping rounded-full border-4 sm:h-24 sm:w-24 ${balloon.theme.burstRing}`}
                    />
                    {POP_SHARD_VECTORS.map((shard, shardIdx) => (
                      <span
                        key={shardIdx}
                        className={`animate-balloon-shard absolute rounded-[45%_55%_35%_65%] shadow-xs ${shard.sizeClass}`}
                        style={
                          {
                            '--shard-tx': shard.tx,
                            '--shard-ty': shard.ty,
                            '--shard-rot': shard.rot,
                            backgroundColor:
                              balloon.popType === 'correct' && shardIdx % 2 === 1
                                ? '#FBBF24'
                                : balloon.theme.shardColor,
                          } as React.CSSProperties
                        }
                      />
                    ))}
                    <span
                      className={`animate-balloon-badge absolute -top-2 rounded-full px-2.5 py-0.5 text-xs font-black shadow-sm ${
                        balloon.popType === 'correct'
                          ? 'bg-emerald-600 text-white ring-2 ring-amber-300/80'
                          : 'bg-rose-600 text-white'
                      }`}
                    >
                      {balloon.popType === 'correct' ? `+${balloon.earnedPoints ?? 100}` : '✕'}
                    </span>
                  </div>
                )}

                {/* Golden Filigree Crown Cap */}
                <svg
                  viewBox="0 0 36 14"
                  aria-hidden="true"
                  className={`pointer-events-none relative z-10 -mb-1.5 h-3 w-8 transition-all duration-200 sm:h-3.5 sm:w-9 ${
                    balloon.isPopping ? 'scale-125 opacity-0' : 'opacity-100'
                  }`}
                >
                  <circle cx="18" cy="3" r="2.2" fill="none" stroke="#B45309" strokeWidth="1.6" />
                  <path
                    d="M6 12 Q18 5 30 12 L28 14 L8 14 Z"
                    fill="#F59E0B"
                    stroke="#92400E"
                    strokeWidth="1.2"
                  />
                  <line x1="11" y1="11.5" x2="25" y2="11.5" stroke="#FDE68A" strokeWidth="1.1" />
                </svg>

                {/* Balloon Teardrop Body with Curved Lantern-Rib Overlay */}
                <div
                  className={`relative flex h-[94px] w-[80px] items-center justify-center overflow-hidden rounded-[50%_50%_46%_46%/56%_56%_44%_44%] border-2 bg-gradient-to-br px-2 pt-2 pb-3 text-center transition-all duration-300 group-hover:scale-105 sm:h-[116px] sm:w-[100px] sm:px-2.5 sm:pt-2.5 sm:pb-3.5 ${
                    balloon.theme.body
                  } ${
                    balloon.isPopping
                      ? 'pointer-events-none scale-125 opacity-0'
                      : 'scale-100 opacity-100'
                  }`}
                >
                  {/* Delicate Curved Vertical Lantern-Rib SVG Overlay */}
                  <svg
                    viewBox="0 0 100 116"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-30"
                    fill="none"
                  >
                    <path d="M50 2 V114" stroke="#FFFFFF" strokeWidth="1.2" />
                    <path d="M50 2 C26 24 24 88 50 114" stroke="#FFFFFF" strokeWidth="1.2" />
                    <path d="M50 2 C74 24 76 88 50 114" stroke="#78350F" strokeWidth="1.1" opacity="0.45" />
                    <path d="M50 2 C12 28 12 84 50 114" stroke="#FFFFFF" strokeWidth="1" opacity="0.7" />
                    <path d="M50 2 C88 28 88 84 50 114" stroke="#78350F" strokeWidth="1" opacity="0.4" />
                  </svg>

                  {/* Glossy 3D dual specular reflection highlights */}
                  <div className="pointer-events-none absolute top-2 left-2.5 z-0 h-5 w-2 -rotate-[24deg] rounded-full bg-white/55 blur-[0.3px] sm:top-2.5 sm:left-3 sm:h-6 sm:w-2.5" />
                  <div className="pointer-events-none absolute top-6 left-2 z-0 h-1.5 w-1.5 rounded-full bg-white/40 sm:top-8 sm:left-2.5 sm:h-2" />

                  <span
                    className={`relative z-10 line-clamp-3 break-words font-sans font-extrabold leading-tight ${getBalloonTextSizeClass(
                      balloon.word ? getWordDisplayMeaning(balloon.word, lang) : balloon.text
                    )} ${balloon.theme.textShadowClass}`}
                  >
                    {balloon.word ? getWordDisplayMeaning(balloon.word, lang) : balloon.text}
                  </span>
                </div>

                {/* Carved Gold Collar & Gently Swaying Crimson-and-Gold Silk Lantern Tassel */}
                <div
                  className={`flex flex-col items-center transition-all duration-200 ${
                    balloon.isPopping
                      ? 'pointer-events-none scale-125 opacity-0'
                      : 'opacity-100'
                  }`}
                >
                  <div
                    className={`-mt-0.5 h-2 w-4 rounded-xs border-b ${balloon.theme.knot} shadow-xs`}
                    style={{ clipPath: 'polygon(18% 0%, 82% 0%, 100% 100%, 0% 100%)' }}
                  />
                  <svg
                    viewBox="0 0 24 34"
                    className="pointer-events-none -mt-0.5 h-6 w-4 origin-top sm:h-7 sm:w-5"
                    style={{
                      transform: `rotate(${(-tiltDeg * 0.8).toFixed(2)}deg)`,
                    }}
                    fill="none"
                    aria-hidden="true"
                  >
                    {/* Gold Collar Bead */}
                    <rect x="8" y="0.5" width="8" height="3.5" rx="1.5" fill="#F59E0B" stroke="#92400E" strokeWidth="0.9" />
                    {/* Crimson Knot */}
                    <circle cx="12" cy="7" r="2.6" fill="#B91C1C" stroke="#FBBF24" strokeWidth="0.9" />
                    {/* Swaying Crimson & Gold Silk Tassel Strands */}
                    <path d="M12 9.5 Q10 19 8.5 31" stroke="#DC2626" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M12 9.5 Q12 20 12 32.5" stroke="#B91C1C" strokeWidth="1.9" strokeLinecap="round" />
                    <path d="M12 9.5 Q14 19 15.5 31" stroke="#F59E0B" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            </button>
          );
        })}

        {/* Subtle Pause Notice Pill */}
        {isPaused && !result && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
            <span className="rounded-full border border-[#C6923A] bg-[#FFFDF8]/95 px-3 py-1 text-xs font-extrabold text-[#4A2B13] shadow-sm">
              {tr('Đã tạm dừng — bấm ▶ để bóng bay tiếp', 'Paused — tap ▶ to keep balloons rising')}
            </span>
          </div>
        )}
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

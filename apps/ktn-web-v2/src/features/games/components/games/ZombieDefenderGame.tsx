import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Volume2, Crosshair, Pause, Play, Flame } from 'lucide-react';
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
import {
  ZOMBIE_OUTER_BG_IMG,
  ZOMBIE_COURTYARD_BG_IMG,
} from '../../assets/zombieArtAssets';
import {
  JiangshiPuppet,
  computeJiangshiKinematics,
  applyJiangshiPoseToDom,
  type JiangshiPartHandles,
} from './JiangshiPuppet';
import type { GameWord, GameSessionResult } from '../../types/game.types';

const getNowMs = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

interface ZombieDefenderGameProps {
  levelId: string;
  onBack: () => void;
}

interface ZombieLaneItem {
  id: string;
  laneIndex: number; // 0, 1, 2
  text: string;
  word?: GameWord;
  isCorrect: boolean;
  spawnXPercent: number; // Fixed anchor left% (67..70)
  xPercent: number; // Logical xPercent from 70% down to 18% (bamboo fence)
  isDefeated: boolean;
  isHit: boolean;
}

interface HitBurstEffect {
  id: number;
  laneIndex: number;
  xPercent: number;
  text: string;
}

const HIT_SHARD_OFFSETS = [
  { tx: '-24px', ty: '-22px', color: '#FBBF24' },
  { tx: '24px', ty: '-20px', color: '#EF4444' },
  { tx: '-26px', ty: '18px', color: '#F59E0B' },
  { tx: '26px', ty: '16px', color: '#FCA5A5' },
  { tx: '0px', ty: '-28px', color: '#FDE047' },
  { tx: '0px', ty: '26px', color: '#FB7185' },
] as const;

export const ZombieDefenderGame: React.FC<ZombieDefenderGameProps> = ({ levelId, onBack }) => {
  const { lang, isEn, tr } = useI18n();
  const langRef = useRef(lang);
  langRef.current = lang;
  const levelDef = useMemo(() => getLocalizedGameLevelById(levelId, lang), [levelId, lang]);
  const [wave, setWave] = useState(1);
  const [currentWord, setCurrentWord] = useState<GameWord | null>(null);
  const [zombies, setZombies] = useState<ZombieLaneItem[]>([]);
  const [hearts, setHearts] = useState(3);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [projectile, setProjectile] = useState<{ targetLane: number; targetX: number } | null>(null);
  const [hitBurst, setHitBurst] = useState<HitBurstEffect | null>(null);
  const [bambooDamaged, setBambooDamaged] = useState(false);
  const [result, setResult] = useState<GameSessionResult | null>(null);

  const TOTAL_WAVES = 12;
  const wordsPoolRef = useRef<GameWord[]>([]);
  const poolIdxRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(getNowMs());
  const lastDateTimeRef = useRef<number>(Date.now());
  const elapsedAnimSecRef = useRef<number>(0);
  const waveSeqRef = useRef<number>(0);
  const isWaveResolvedRef = useRef<boolean>(false);
  const zombiesRef = useRef<ZombieLaneItem[]>([]);
  const battlefieldRef = useRef<HTMLDivElement | null>(null);
  const stageWidthRef = useRef<number>(0);
  const unitRefs = useRef<Array<HTMLDivElement | null>>([null, null, null]);
  const partHandlesRef = useRef<Array<JiangshiPartHandles | null>>([null, null, null]);
  const reducedMotionRef = useRef<boolean>(false);
  const waveRef = useRef<number>(1);
  const heartsRef = useRef<number>(3);
  const scoreRef = useRef<number>(0);
  const correctCountRef = useRef<number>(0);
  const streakRef = useRef<number>(0);
  const bestStreakRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const seenWordIdsRef = useRef<Set<string>>(new Set());
  const seenLevelRef = useRef<string>(levelId);
  const lastTargetIdRef = useRef<string | null>(null);

  const registerPuppetHandles = useCallback(
    (laneIndex: number, handles: Partial<JiangshiPartHandles> | null) => {
      const existingScroll = partHandlesRef.current[laneIndex]?.scrollWrap ?? null;
      if (!handles) {
        partHandlesRef.current[laneIndex] = existingScroll
          ? {
              hopper: null,
              shadow: null,
              dust: null,
              backArm: null,
              frontArm: null,
              backLeg: null,
              frontLeg: null,
              head: null,
              talisman: null,
              tassel: null,
              eyelid: null,
              scrollWrap: existingScroll,
            }
          : null;
        return;
      }

      const merged: JiangshiPartHandles = {
        hopper: handles.hopper ?? null,
        shadow: handles.shadow ?? null,
        dust: handles.dust ?? null,
        backArm: handles.backArm ?? null,
        frontArm: handles.frontArm ?? null,
        backLeg: handles.backLeg ?? null,
        frontLeg: handles.frontLeg ?? null,
        head: handles.head ?? null,
        talisman: handles.talisman ?? null,
        tassel: handles.tassel ?? null,
        eyelid: handles.eyelid ?? null,
        scrollWrap: existingScroll,
      };
      partHandlesRef.current[laneIndex] = merged;
      applyJiangshiPoseToDom(
        merged,
        computeJiangshiKinematics(elapsedAnimSecRef.current, laneIndex, reducedMotionRef.current)
      );
    },
    []
  );

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

  // Setup wave with target word and 3 zombies on 3 lanes
  const setupWave = useCallback(
    (waveNumber: number) => {
      isWaveResolvedRef.current = false;
      waveRef.current = waveNumber;
      setWave(waveNumber);

      if (seenLevelRef.current !== levelId) {
        seenWordIdsRef.current.clear();
        seenLevelRef.current = levelId;
        lastTargetIdRef.current = null;
      }
      if (wordsPoolRef.current.length === 0 || poolIdxRef.current >= wordsPoolRef.current.length) {
        const batch = getRandomWordsForGame(
          levelId,
          TOTAL_WAVES,
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

      // Get 2 distractor meanings
      const activeLang = langRef.current;
      const distractors = getDistractorWords(target, 2, levelId, activeLang);
      const rawOptions = [
        { text: getWordDisplayMeaning(target, activeLang), word: target, isCorrect: true },
        ...distractors.slice(0, 2).map((distWord) => ({
          text: getWordDisplayMeaning(distWord, activeLang),
          word: distWord,
          isCorrect: false,
        })),
      ];

      const shuffled = shuffleArray(rawOptions);
      waveSeqRef.current += 1;
      const newZombies: ZombieLaneItem[] = shuffled.map((opt, laneIdx) => {
        const spawnX = 67 + Math.random() * 3;
        return {
          id: `zombie_r${waveSeqRef.current}_w${waveNumber}_lane${laneIdx}`,
          laneIndex: laneIdx,
          text: opt.text,
          word: opt.word,
          isCorrect: opt.isCorrect,
          // Start position fits comfortably inside viewport & breaches <= 18% within 950*16ms
          spawnXPercent: spawnX,
          xPercent: spawnX,
          isDefeated: false,
          isHit: false,
        };
      });

      elapsedAnimSecRef.current = 0;
      zombiesRef.current = newZombies;
      setZombies(newZombies);
      setProjectile(null);
      setHitBurst(null);
      lastTickTimeRef.current = getNowMs();
      lastDateTimeRef.current = Date.now();
    },
    [levelId]
  );

  const initGame = useCallback(() => {
    clearAllTimeouts();
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    isWaveResolvedRef.current = false;
    if (seenLevelRef.current !== levelId) {
      seenWordIdsRef.current.clear();
      seenLevelRef.current = levelId;
      lastTargetIdRef.current = null;
    }
    const initialBatch = getRandomWordsForGame(
      levelId,
      TOTAL_WAVES,
      Array.from(seenWordIdsRef.current),
      langRef.current
    );
    wordsPoolRef.current = avoidSeamRepeat(initialBatch, lastTargetIdRef.current);
    poolIdxRef.current = 0;
    waveRef.current = 1;
    heartsRef.current = 3;
    scoreRef.current = 0;
    correctCountRef.current = 0;
    streakRef.current = 0;
    bestStreakRef.current = 0;
    startTimeRef.current = Date.now();
    setWave(1);
    setHearts(3);
    setScore(0);
    setStreak(0);
    setIsPaused(false);
    setProjectile(null);
    setHitBurst(null);
    setBambooDamaged(false);
    setResult(null);
    setupWave(1);
  }, [levelId, setupWave, clearAllTimeouts]);

  useEffect(() => {
    const mq =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    let cleanupMq: (() => void) | undefined;
    if (mq) {
      reducedMotionRef.current = mq.matches;
      const onMqChange = (e: MediaQueryListEvent) => {
        reducedMotionRef.current = e.matches;
      };
      mq.addEventListener?.('change', onMqChange);
      cleanupMq = () => mq.removeEventListener?.('change', onMqChange);
    }

    const syncStageWidth = () => {
      const widthPx = battlefieldRef.current?.clientWidth || 0;
      stageWidthRef.current = widthPx;
      if (widthPx > 0) {
        zombiesRef.current.forEach((z) => {
          const unitEl = unitRefs.current[z.laneIndex];
          if (unitEl) {
            const dxPx = ((z.xPercent - z.spawnXPercent) / 100) * widthPx;
            unitEl.style.transform = `translate3d(${dxPx.toFixed(2)}px, -50%, 0)`;
          }
        });
      }
    };

    syncStageWidth();
    const ro =
      typeof ResizeObserver !== 'undefined' && battlefieldRef.current
        ? new ResizeObserver(syncStageWidth)
        : null;
    if (ro && battlefieldRef.current) {
      ro.observe(battlefieldRef.current);
    }

    return () => {
      cleanupMq?.();
      ro?.disconnect();
    };
  }, []);

  useEffect(() => {
    initGame();
    return () => {
      clearAllTimeouts();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [initGame, clearAllTimeouts]);

  // Game loop: 60/120fps GPU compositor updates via direct DOM transform + kinematic rig
  useEffect(() => {
    if (isPaused || result) return;

    let cancelled = false;
    lastTickTimeRef.current = getNowMs();
    lastDateTimeRef.current = Date.now();

    const tick = () => {
      if (cancelled || isWaveResolvedRef.current) return;

      const perfNow = getNowMs();
      const dateNow = Date.now();
      const perfDeltaMs = Math.max(0, perfNow - lastTickTimeRef.current);
      const dateDeltaMs = Math.max(0, dateNow - lastDateTimeRef.current);
      // Use sub-ms performance.now() on real 60/120Hz displays; seamlessly follow Date.now() if fake timers advance Date without faking performance
      const effectiveDeltaMs =
        dateDeltaMs >= 4 && perfDeltaMs < dateDeltaMs * 0.4 ? dateDeltaMs : perfDeltaMs;
      // Clamp deltaSec to prevent teleporting when unpausing or lagging
      const deltaSec = Math.min(0.08, Math.max(0, effectiveDeltaMs / 1000));
      lastTickTimeRef.current = perfNow;
      lastDateTimeRef.current = dateNow;
      elapsedAnimSecRef.current += deltaSec;

      // Average movement speed (% per second, gentle and child-friendly)
      const speedPercent = 3.6;
      let breachDetected = false;
      const widthPx = stageWidthRef.current || battlefieldRef.current?.clientWidth || 0;
      if (widthPx > 0) stageWidthRef.current = widthPx;

      const updated = zombiesRef.current.map((z) => {
        if (z.isDefeated) return z;

        const pose = computeJiangshiKinematics(
          elapsedAnimSecRef.current,
          z.laneIndex,
          reducedMotionRef.current
        );
        const nextX = z.xPercent - speedPercent * pose.strideMultiplier * deltaSec;

        const unitEl = unitRefs.current[z.laneIndex];
        if (unitEl) {
          if (widthPx > 0) {
            const dxPx = ((nextX - z.spawnXPercent) / 100) * widthPx;
            unitEl.style.transform = `translate3d(${dxPx.toFixed(2)}px, -50%, 0)`;
          } else {
            // jsdom test environment fallback where clientWidth === 0
            unitEl.style.left = `${nextX}%`;
          }
          unitEl.dataset.xPercent = nextX.toFixed(3);
        }

        applyJiangshiPoseToDom(partHandlesRef.current[z.laneIndex] ?? undefined, pose);

        // Bamboo fence is at ~18% on the left
        if (nextX <= 18) {
          breachDetected = true;
        }
        return nextX === z.xPercent ? z : { ...z, xPercent: nextX };
      });

      zombiesRef.current = updated;

      if (breachDetected && !isWaveResolvedRef.current && !cancelled) {
        // Lock wave immediately so only 1 heart is lost and no multiple triggers fire
        isWaveResolvedRef.current = true;
        setZombies(updated);
        playSfx('err');
        streakRef.current = 0;
        setStreak(0);
        setBambooDamaged(true);
        safeTimeout(() => setBambooDamaged(false), 350);

        const nextHearts = Math.max(0, heartsRef.current - 1);
        heartsRef.current = nextHearts;
        setHearts(nextHearts);

        if (nextHearts <= 0) {
          // Game Over
          safeTimeout(() => {
            playSfx('gameover');
            const currentScore = scoreRef.current;
            const currentCorrect = correctCountRef.current;
            const duration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
            const isNew = currentScore > 0 ? saveHighScore('zombie-defender', levelId, currentScore) : false;
            setResult({
              modeId: 'zombie-defender',
              levelId,
              score: currentScore,
              stars: 1,
              correctCount: currentCorrect,
              totalQuestions: waveRef.current,
              accuracy: Math.round((currentCorrect / waveRef.current) * 100),
              timeSpentSeconds: duration,
              streakBest: bestStreakRef.current,
              isNewRecord: isNew,
            });
          }, 200);
        } else {
          // Advance to next wave so player can continue with remaining hearts
          safeTimeout(() => {
            const nextW = waveRef.current + 1;
            waveRef.current = nextW;
            setWave(nextW);

            if (nextW <= TOTAL_WAVES) {
              setupWave(nextW);
            } else {
              // Reached end of waves
              playSfx('win');
              const currentScore = scoreRef.current;
              const currentCorrect = correctCountRef.current;
              const isNew = saveHighScore('zombie-defender', levelId, currentScore);
              const duration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
              const stars: 1 | 2 | 3 = nextHearts === 3 ? 3 : nextHearts === 2 ? 2 : 1;
              setResult({
                modeId: 'zombie-defender',
                levelId,
                score: currentScore,
                stars,
                correctCount: currentCorrect,
                totalQuestions: TOTAL_WAVES,
                accuracy: Math.round((currentCorrect / TOTAL_WAVES) * 100),
                timeSpentSeconds: duration,
                streakBest: bestStreakRef.current,
                isNewRecord: isNew,
              });
            }
          }, 500);
        }
      }

      if (!cancelled && !isWaveResolvedRef.current) {
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPaused, result, levelId, setupWave, safeTimeout]);

  // Handle tap-to-shoot on a zombie
  const handleShootZombie = (zombie: ZombieLaneItem) => {
    const liveZombie = zombiesRef.current.find((z) => z.id === zombie.id) ?? zombie;
    if (isPaused || result || isWaveResolvedRef.current || liveZombie.isDefeated) return;

    if (liveZombie.isCorrect) {
      // CORRECT SHOT! Lock wave immediately so double taps or extra clicks do not skip waves
      isWaveResolvedRef.current = true;
      playSfx('shoot');
      if (currentWord) speakChinese(currentWord.hanzi);

      // Trigger projectile animation toward live zombie coordinate
      setProjectile({ targetLane: liveZombie.laneIndex, targetX: liveZombie.xPercent });

      safeTimeout(() => {
        setProjectile(null);

        const nextStreak = streakRef.current + 1;
        streakRef.current = nextStreak;
        bestStreakRef.current = Math.max(bestStreakRef.current, nextStreak);
        setStreak(nextStreak);

        // Strict first-hit 120 invariant: 1st hit (or after miss) -> 120; consecutive -> +150, +180...
        const earned = nextStreak === 1 ? 120 : 120 + (nextStreak - 1) * 30;
        if (nextStreak >= 2) {
          playComboSfx(nextStreak);
        } else {
          playSfx('hit');
        }

        const updated = zombiesRef.current.map((z) =>
          z.id === liveZombie.id ? { ...z, isDefeated: true, isHit: true } : z
        );
        zombiesRef.current = updated;
        setZombies(updated);

        const nextScore = scoreRef.current + earned;
        const nextCorrect = correctCountRef.current + 1;
        scoreRef.current = nextScore;
        correctCountRef.current = nextCorrect;
        setScore(nextScore);

        setHitBurst({
          id: Date.now() + liveZombie.laneIndex,
          laneIndex: liveZombie.laneIndex,
          xPercent: liveZombie.xPercent,
          text: nextStreak >= 2 ? `+${earned} x${nextStreak}` : `+${earned}`,
        });

        if (waveRef.current >= TOTAL_WAVES) {
          // VICTORY!
          safeTimeout(() => {
            playSfx('win');
            const isNew = saveHighScore('zombie-defender', levelId, nextScore);
            const duration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
            const currentHearts = heartsRef.current;
            const stars: 1 | 2 | 3 = currentHearts === 3 ? 3 : currentHearts === 2 ? 2 : 1;

            setResult({
              modeId: 'zombie-defender',
              levelId,
              score: nextScore,
              stars,
              correctCount: nextCorrect,
              totalQuestions: TOTAL_WAVES,
              accuracy: Math.round((nextCorrect / (nextCorrect + (3 - currentHearts))) * 100),
              timeSpentSeconds: duration,
              streakBest: bestStreakRef.current,
              isNewRecord: isNew,
            });
          }, 600);
        } else {
          // Advance wave
          safeTimeout(() => {
            const nextW = waveRef.current + 1;
            waveRef.current = nextW;
            setWave(nextW);
            setupWave(nextW);
          }, 650);
        }
      }, 150);
    } else {
      // WRONG ZOMBIE SHOT! Guard against multiple rapid taps on same zombie
      if (liveZombie.isHit) return;

      playSfx('err');
      streakRef.current = 0;
      setStreak(0);

      const updatedWrong = zombiesRef.current.map((z) =>
        z.id === liveZombie.id ? { ...z, isHit: true } : z
      );
      zombiesRef.current = updatedWrong;
      setZombies(updatedWrong);
      safeTimeout(() => {
        const cleared = zombiesRef.current.map((z) =>
          z.id === liveZombie.id ? { ...z, isHit: false } : z
        );
        zombiesRef.current = cleared;
        setZombies(cleared);
      }, 350);

      const nextHearts = Math.max(0, heartsRef.current - 1);
      heartsRef.current = nextHearts;
      setHearts(nextHearts);

      if (nextHearts <= 0) {
        // Game Over
        isWaveResolvedRef.current = true;
        playSfx('gameover');
        const currentScore = scoreRef.current;
        const currentCorrect = correctCountRef.current;
        const duration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
        const isNew = currentScore > 0 ? saveHighScore('zombie-defender', levelId, currentScore) : false;
        setResult({
          modeId: 'zombie-defender',
          levelId,
          score: currentScore,
          stars: 1,
          correctCount: currentCorrect,
          totalQuestions: waveRef.current,
          accuracy: Math.round((currentCorrect / waveRef.current) * 100),
          timeSpentSeconds: duration,
          streakBest: bestStreakRef.current,
          isNewRecord: isNew,
        });
      }
    }
  };

  return (
    <div
      data-testid="zombie-defender-game"
      className="relative overflow-hidden mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-2xl border-2 border-[#8B5E34]/60 p-1.5 shadow-xl sm:gap-2.5 sm:rounded-3xl sm:p-3.5"
    >
      {/* Scenic Oriental Temple-Garden Outer Frame */}
      <img
        src={ZOMBIE_OUTER_BG_IMG}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#FFFDF8]/[0.72] via-[#FAF2E1]/[0.68] to-[#F3E4CA]/[0.78]"
        aria-hidden="true"
      />

      {/* Top HUD */}
      <div className="relative z-10">
        <GameHeaderHud
          modeId="zombie-defender"
          title={tr('Bắn Zombie', 'Zombie Defender')}
          levelLabel={levelDef.shortLabel}
          score={score}
          hearts={hearts}
          maxHearts={3}
          onBack={onBack}
          onRestart={initGame}
        />
      </div>

      {/* Compact Control Strip: Wave + Prompt Pill + Combo + Pause */}
      <div className="relative z-10 flex items-center justify-between gap-1.5 sm:gap-2">
        <div
          data-testid="zombie-wave-badge"
          className="shrink-0 rounded-full border border-[#5C1111] border-b-2 bg-gradient-to-b from-red-700 to-red-900 px-2.5 py-1 text-[11px] font-black text-amber-100 shadow-xs sm:px-3.5 sm:text-xs"
        >
          {tr('Đợt', 'Wave')} {wave}/{TOTAL_WAVES}
        </div>

        <div
          data-testid="zombie-title-pill"
          className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-2xl border-2 border-[#C6923A] bg-gradient-to-r from-[#FFFDF8] via-[#FAF0D8] to-[#FFFDF8] px-2.5 py-1 shadow-xs sm:flex-initial sm:gap-1.5 sm:px-4 sm:py-1.5"
        >
          <Crosshair className="h-3.5 w-3.5 shrink-0 text-red-700 sm:h-4 sm:w-4" />
          <span className="truncate font-display text-[11px] font-black text-[#4A2B13] sm:text-sm">
            {tr('Bắn zombie mang nghĩa đúng', 'Shoot the zombie with the right meaning')}
          </span>
        </div>

        {streak >= 2 && (
          <div
            data-testid="zombie-combo-badge"
            className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-amber-200/60 bg-gradient-to-r from-amber-500 to-orange-600 px-2 py-0.5 text-[10px] font-black text-white shadow-xs sm:px-2.5 sm:py-1 sm:text-xs"
          >
            <Flame className="h-3 w-3 fill-amber-100" />
            <span>Combo x{streak}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsPaused((p) => !p)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#B8893E]/65 border-b-[2.5px] border-b-[#7C4D25] bg-gradient-to-b from-[#FFFDF8] to-[#F3E1BF] text-[#5C3718] shadow-xs transition-all hover:from-amber-50 hover:to-amber-100 active:translate-y-[1px] active:scale-95"
          aria-label={isPaused ? tr('Tiếp tục', 'Resume') : tr('Tạm dừng', 'Pause')}
        >
          {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Question Card: Gilded Imperial Parchment Plaque */}
      {currentWord && (
        <div
          data-testid="zombie-question-card"
          className="relative z-10 mx-auto flex w-full max-w-xl flex-col items-center justify-center rounded-2xl border-[2.5px] border-[#C6923A] bg-gradient-to-b from-[#FFFDF8] to-[#F8EED8] px-3 py-2 shadow-[0_4px_0_rgba(120,74,28,0.28)] sm:rounded-3xl sm:px-4 sm:py-3"
        >
          {/* 4 Golden SVG Corner Cloud Brackets */}
          {(['top-1 left-1', 'top-1 right-1 -scale-x-100', 'bottom-1 left-1 -scale-y-100', 'bottom-1 right-1 -scale-x-100 -scale-y-100'] as const).map(
            (posClass, cornerIdx) => (
              <svg
                key={cornerIdx}
                viewBox="0 0 24 24"
                aria-hidden="true"
                className={`pointer-events-none absolute h-4 w-4 text-[#C6923A] sm:h-5 sm:w-5 ${posClass}`}
                fill="none"
              >
                <path
                  d="M2.5 17V5.5C2.5 3.84 3.84 2.5 5.5 2.5H17"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M5.5 11.5V6.5C5.5 5.95 5.95 5.5 6.5 5.5H11.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  opacity="0.7"
                />
                <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" opacity="0.8" />
              </svg>
            )
          )}

          <div className="flex items-center justify-center gap-2.5 sm:gap-3">
            <span
              data-testid="zombie-target-hanzi"
              className="font-hanzi text-3xl font-bold leading-none text-stone-900 sm:text-5xl"
            >
              {currentWord.hanzi}
            </span>

            {/* 3D Crimson-Lacquer Drum Speaker Button */}
            <button
              type="button"
              data-testid="zombie-audio-btn"
              onClick={() => speakChinese(currentWord.hanzi)}
              aria-label={tr('Nghe phát âm', 'Listen')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-300/60 border-b-[3px] border-b-[#5C1111] bg-gradient-to-b from-red-700 via-red-800 to-red-950 text-amber-100 shadow-md transition-transform hover:scale-105 active:translate-y-[1px] active:scale-95"
            >
              <Volume2 className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <span
              data-testid="zombie-target-pinyin"
              className="font-mono text-xs font-extrabold text-[#5C3718] sm:text-sm"
            >
              {currentWord.pinyin}
            </span>
            {!isEn && currentWord.hanViet && (
              <span className="font-sans text-[10.5px] font-bold text-[#4A2511] sm:text-xs">
                HV: {currentWord.hanViet}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 3-Lane Courtyard Battlefield */}
      <div
        ref={battlefieldRef}
        data-testid="zombie-courtyard-battlefield"
        className="relative z-10 h-[300px] w-full overflow-hidden rounded-2xl border-[3px] border-[#7C4D25] bg-[#E8D8BC] shadow-xl sm:h-[390px] sm:rounded-3xl sm:shadow-2xl"
      >
        {/* Custom Painted 2.5D Sandstone Courtyard Illustration */}
        <img
          src={ZOMBIE_COURTYARD_BG_IMG}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-95"
        />

        {/* Minimal soft warm veil so painted sandstone lanes shine brightly */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#FFFDF8] via-[#FAF2E1] to-[#F3E4CA] opacity-15"
          aria-hidden="true"
        />

        {/* 3 Horizontal Lane Grid Lines */}
        <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex flex-col justify-evenly">
          <div className="border-b border-dashed border-amber-900/20" />
          <div className="border-b border-dashed border-amber-900/20" />
          <div className="border-b border-dashed border-amber-900/20" />
        </div>

        {/* Left Boundary: Multi-Stalk Vertical SVG Bamboo Palisade */}
        <div
          data-testid="zombie-bamboo-fence"
          className={`pointer-events-none absolute top-0 bottom-0 left-0 z-20 w-8 overflow-hidden border-r-2 border-[#33691E]/75 shadow-md transition-all duration-150 sm:w-14 ${
            bambooDamaged ? 'animate-shake ring-2 ring-red-500' : ''
          }`}
        >
          <svg
            viewBox="0 0 60 360"
            preserveAspectRatio="none"
            className="h-full w-full select-none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="bamboo-stalk-main" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#8BC34A" />
                <stop offset="30%" stopColor="#689F38" />
                <stop offset="72%" stopColor="#558B2F" />
                <stop offset="100%" stopColor="#33691E" />
              </linearGradient>
              <linearGradient id="bamboo-stalk-alt" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#9CCC65" />
                <stop offset="35%" stopColor="#558B2F" />
                <stop offset="85%" stopColor="#33691E" />
                <stop offset="100%" stopColor="#1B5E20" />
              </linearGradient>
            </defs>

            {/* Dark shadow backdrop behind stalks */}
            <rect x="0" y="0" width="60" height="360" fill="#283B18" opacity="0.28" />

            {/* Stalk 1 */}
            <rect x="3" y="8" width="14" height="352" rx="3" fill="url(#bamboo-stalk-main)" />
            <rect x="5.5" y="10" width="2.5" height="350" fill="#DCEDC8" opacity="0.35" />

            {/* Stalk 2 */}
            <rect x="22" y="2" width="15" height="358" rx="3" fill="url(#bamboo-stalk-alt)" />
            <rect x="25" y="4" width="2.8" height="356" fill="#DCEDC8" opacity="0.38" />

            {/* Stalk 3 */}
            <rect x="42" y="12" width="14" height="348" rx="3" fill="url(#bamboo-stalk-main)" />
            <rect x="44.5" y="14" width="2.4" height="346" fill="#DCEDC8" opacity="0.34" />

            {/* Dark bamboo node rings across stalks */}
            {[54, 118, 182, 246, 310].map((y) => (
              <g key={y}>
                <rect x="2" y={y} width="16" height="4" rx="1.5" fill="#33691E" />
                <line x1="3" y1={y + 1} x2="17" y2={y + 1} stroke="#AED581" strokeWidth="1" opacity="0.65" />

                <rect x="21" y={y - 12} width="17" height="4" rx="1.5" fill="#1B5E20" />
                <line x1="22" y1={y - 11} x2="37" y2={y - 11} stroke="#C5E1A5" strokeWidth="1" opacity="0.65" />

                <rect x="41" y={y + 6} width="16" height="4" rx="1.5" fill="#33691E" />
                <line x1="42" y1={y + 7} x2="56" y2={y + 7} stroke="#AED581" strokeWidth="1" opacity="0.65" />
              </g>
            ))}

            {/* Woven brown hemp rope horizontal lashings */}
            {[74, 184, 294].map((ry) => (
              <g key={ry}>
                <rect x="0" y={ry} width="59" height="10" rx="3" fill="#6D4C41" stroke="#4E342E" strokeWidth="1.2" />
                <path
                  d={`M4 ${ry + 2} L12 ${ry + 8} M14 ${ry + 2} L22 ${ry + 8} M24 ${ry + 2} L32 ${ry + 8} M34 ${ry + 2} L42 ${ry + 8} M44 ${ry + 2} L52 ${ry + 8}`}
                  stroke="#A1887F"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </g>
            ))}
          </svg>
          {bambooDamaged && (
            <div className="absolute inset-0 bg-red-600/45" aria-hidden="true" />
          )}
        </div>

        {/* Projectile animation (if shooting): preserves exact .bg-gradient-to-r.from-amber-400.to-red-600 */}
        {projectile && (
          <div
            className="animate-zombie-bolt pointer-events-none absolute z-30 flex h-2.5 w-10 items-center justify-end rounded-full bg-gradient-to-r from-amber-400 to-red-600 shadow-[0_0_12px_rgba(245,158,11,0.85)] will-change-transform"
            style={
              {
                top: `${(projectile.targetLane + 0.5) * 33.33}%`,
                left: `${Math.min(Math.max(projectile.targetX, 18), 75)}%`,
                '--bolt-from-x': `${-Math.max(
                  48,
                  ((Math.min(Math.max(projectile.targetX, 18), 75) - 12) / 100) *
                    (stageWidthRef.current || battlefieldRef.current?.clientWidth || 320)
                )}px`,
              } as React.CSSProperties
            }
          >
            <span className="-mr-1 h-3 w-3 rotate-45 rounded-xs border border-amber-100 bg-amber-300 shadow-xs" />
          </div>
        )}

        {/* Impact shards + floating score popup on zombie defeat */}
        {hitBurst && (
          <div
            key={hitBurst.id}
            className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2"
            style={{
              top: `${(hitBurst.laneIndex + 0.5) * 33.33}%`,
              left: `${hitBurst.xPercent}%`,
            }}
          >
            {HIT_SHARD_OFFSETS.map((shard, sIdx) => (
              <span
                key={sIdx}
                className="animate-balloon-shard absolute h-2 w-2 rounded-full shadow-xs"
                style={
                  {
                    '--shard-tx': shard.tx,
                    '--shard-ty': shard.ty,
                    '--shard-rot': '45deg',
                    backgroundColor: shard.color,
                  } as React.CSSProperties
                }
              />
            ))}
            <span className="animate-score-float absolute -top-3 left-1/2 rounded-full border border-amber-300 bg-emerald-600 px-2.5 py-0.5 text-xs font-black whitespace-nowrap text-white shadow-md">
              {hitBurst.text}
            </span>
          </div>
        )}

        {/* Zombies on Lanes */}
        {zombies.map((zombie, idx) => {
          const laneTopPercent = (zombie.laneIndex + 0.5) * 33.33;
          const stageWidthPx = stageWidthRef.current || battlefieldRef.current?.clientWidth || 0;
          const liveZombie = zombiesRef.current.find((rz) => rz.id === zombie.id) ?? zombie;
          const dxPx =
            stageWidthPx > 0 ? ((liveZombie.xPercent - zombie.spawnXPercent) / 100) * stageWidthPx : 0;

          return (
            <div
              key={zombie.id}
              ref={(el) => {
                unitRefs.current[zombie.laneIndex] = el;
              }}
              data-testid={`zombie-unit-${zombie.laneIndex}`}
              data-x-percent={liveZombie.xPercent.toFixed(3)}
              onClick={() => handleShootZombie(zombie)}
              className="group absolute z-20 flex min-h-[48px] cursor-pointer items-center"
              style={{
                top: `${laneTopPercent}%`,
                left: `${stageWidthPx > 0 ? zombie.spawnXPercent : liveZombie.xPercent}%`,
                transform: `translate3d(${dxPx.toFixed(2)}px, -50%, 0)`,
                willChange: 'transform',
              }}
            >
              <div className="-translate-x-[38%] transition-transform duration-150 group-hover:scale-105 group-active:scale-95 sm:-translate-x-[28%] lg:-translate-x-[24%]">
                <div
                  className={`relative flex items-center ${
                    zombie.isDefeated
                      ? 'animate-jiangshi-banish pointer-events-none'
                      : zombie.isHit
                        ? 'animate-shake'
                        : ''
                  }`}
                >
                  {zombie.isDefeated && (
                    <svg
                      viewBox="0 0 80 80"
                      aria-hidden="true"
                      className="pointer-events-none absolute -left-2 top-1/2 h-20 w-20 -translate-y-1/2 opacity-80"
                    >
                      <circle
                        cx="40"
                        cy="40"
                        r="30"
                        fill="none"
                        stroke="#FBBF24"
                        strokeWidth="3"
                        strokeDasharray="8 6"
                      />
                      <circle cx="40" cy="40" r="21" fill="none" stroke="#FEF08A" strokeWidth="1.8" />
                    </svg>
                  )}

                  <JiangshiPuppet
                    laneIndex={zombie.laneIndex}
                    isHit={zombie.isHit}
                    isDefeated={zombie.isDefeated}
                    registerHandles={registerPuppetHandles}
                  />

                  {/* Aged Parchment Scroll Tag beside the Jiangshi */}
                  <div
                    ref={(el) => {
                      const prev = partHandlesRef.current[zombie.laneIndex];
                      if (prev) {
                        prev.scrollWrap = el;
                      } else if (el) {
                        partHandlesRef.current[zombie.laneIndex] = {
                          hopper: null,
                          shadow: null,
                          dust: null,
                          backArm: null,
                          frontArm: null,
                          backLeg: null,
                          frontLeg: null,
                          head: null,
                          talisman: null,
                          tassel: null,
                          eyelid: null,
                          scrollWrap: el,
                        };
                      }
                    }}
                    className="ml-0.5 will-change-transform sm:ml-1.5"
                  >
                    <div
                      data-testid={`zombie-bubble-${idx}`}
                      className="flex min-h-[34px] max-w-[104px] items-center rounded-xl border-2 border-[#B8893E] bg-gradient-to-b from-[#FFFDF8] to-[#F5E6C8] px-2 py-1 shadow-[0_3px_0_rgba(110,70,25,0.25)] transition-colors group-hover:border-amber-600 group-hover:from-amber-50 group-hover:to-amber-100 sm:min-h-[38px] sm:max-w-[176px] sm:rounded-2xl sm:px-3 sm:py-1.5"
                    >
                      <span className="line-clamp-2 font-sans text-[11px] font-black leading-snug text-stone-950 sm:text-sm">
                        {zombie.word ? getWordDisplayMeaning(zombie.word, lang) : zombie.text}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Subtle Pause Notice Pill */}
        {isPaused && !result && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center">
            <span className="rounded-full border border-[#C6923A] bg-[#FFFDF8]/95 px-3 py-1 text-xs font-extrabold text-[#4A2B13] shadow-sm">
              {tr('Đã tạm dừng — bấm ▶ để tiếp tục', 'Paused — tap ▶ to resume')}
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

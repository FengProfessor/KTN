import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Volume2, Flame, Zap, Award } from 'lucide-react';
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
import { STAGE_BLITZ_BG_IMG } from '../../assets/stageArtAssets';
import type { GameWord, GameSessionResult } from '../../types/game.types';

interface SpeedBlitzGameProps {
  levelId: string;
  onBack: () => void;
}

interface QuestionItem {
  target: GameWord;
  options: { id: string; text: string; word?: GameWord; isCorrect: boolean }[];
}

interface FloatingPopupState {
  id: number;
  text: string;
  isBonus: boolean;
}

export const SpeedBlitzGame: React.FC<SpeedBlitzGameProps> = ({ levelId, onBack }) => {
  const { lang, isEn, tr } = useI18n();
  const langRef = useRef(lang);
  langRef.current = lang;
  const levelDef = useMemo(() => getLocalizedGameLevelById(levelId, lang), [levelId, lang]);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);
  const [currentQ, setCurrentQ] = useState<QuestionItem | null>(null);
  const [flashFeedback, setFlashFeedback] = useState<'ok' | 'err' | null>(null);
  const [floatingPopup, setFloatingPopup] = useState<FloatingPopupState | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [result, setResult] = useState<GameSessionResult | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const [questionSeq, setQuestionSeq] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const questionStartTimeRef = useRef<number>(Date.now());
  const startTimeRef = useRef<number>(Date.now());
  const wordsPoolRef = useRef<GameWord[]>([]);
  const poolIndexRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const comboRef = useRef<number>(0);
  const bestComboRef = useRef<number>(0);
  const correctCountRef = useRef<number>(0);
  const totalAnsweredRef = useRef<number>(0);
  const secondsLeftRef = useRef<number>(60);
  const bonusSecondsEarnedRef = useRef<number>(0);
  const questionSeqRef = useRef<number>(0);
  const isFinishedRef = useRef<boolean>(false);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const seenWordIdsRef = useRef<Set<string>>(new Set());
  const seenLevelRef = useRef<string>(levelId);
  const lastTargetIdRef = useRef<string | null>(null);

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

  const finishGame = useCallback(() => {
    if (isFinishedRef.current) return;
    isFinishedRef.current = true;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsFinished(true);
    playSfx('win');

    const finalScore = scoreRef.current;
    const finalCorrect = correctCountRef.current;
    const finalTotal = totalAnsweredRef.current;
    const isNew = saveHighScore('speed-blitz', levelId, finalScore);
    const accuracy = finalTotal > 0 ? (finalCorrect / finalTotal) * 100 : 0;
    const stars: 1 | 2 | 3 = finalScore >= 500 ? 3 : finalScore >= 250 ? 2 : 1;
    const elapsedSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
    const timeSpentSeconds = Math.max(1, elapsedSeconds || 60 + bonusSecondsEarnedRef.current);

    setResult({
      modeId: 'speed-blitz',
      levelId,
      score: finalScore,
      stars,
      correctCount: finalCorrect,
      totalQuestions: finalTotal,
      accuracy,
      timeSpentSeconds,
      streakBest: bestComboRef.current,
      isNewRecord: isNew,
    });
  }, [levelId]);

  const generateNextQuestion = useCallback(() => {
    if (seenLevelRef.current !== levelId) {
      seenWordIdsRef.current.clear();
      seenLevelRef.current = levelId;
      lastTargetIdRef.current = null;
    }
    // If pool empty or exhausted, fetch next Smart-Bag batch avoiding seam repeat
    if (wordsPoolRef.current.length === 0 || poolIndexRef.current >= wordsPoolRef.current.length) {
      const batch = getRandomWordsForGame(
        levelId,
        25,
        Array.from(seenWordIdsRef.current),
        langRef.current
      );
      wordsPoolRef.current = avoidSeamRepeat(batch, lastTargetIdRef.current);
      poolIndexRef.current = 0;
    }

    const target = wordsPoolRef.current[poolIndexRef.current];
    poolIndexRef.current++;

    if (!target) return;

    markWordSeenInLevel(seenWordIdsRef.current, target.id, getWordsForLevel(levelId).length);
    lastTargetIdRef.current = target.id;

    // Distractor words & meanings
    const activeLang = langRef.current;
    const distractors = getDistractorWords(target, 3, levelId, activeLang);
    const opts = [
      { id: 'correct', text: getWordDisplayMeaning(target, activeLang), word: target, isCorrect: true },
      ...distractors.map((distWord, idx) => ({
        id: `dist_${idx}`,
        text: getWordDisplayMeaning(distWord, activeLang),
        word: distWord,
        isCorrect: false,
      })),
    ];

    questionSeqRef.current += 1;
    setQuestionSeq(questionSeqRef.current);
    questionStartTimeRef.current = Date.now();
    setCurrentQ({
      target,
      options: shuffleArray(opts),
    });
  }, [levelId]);

  const initGame = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    clearAllTimeouts();

    if (seenLevelRef.current !== levelId) {
      seenWordIdsRef.current.clear();
      seenLevelRef.current = levelId;
      lastTargetIdRef.current = null;
    }
    const initialBatch = getRandomWordsForGame(
      levelId,
      25,
      Array.from(seenWordIdsRef.current),
      langRef.current
    );
    wordsPoolRef.current = avoidSeamRepeat(initialBatch, lastTargetIdRef.current);
    poolIndexRef.current = 0;
    scoreRef.current = 0;
    comboRef.current = 0;
    bestComboRef.current = 0;
    correctCountRef.current = 0;
    totalAnsweredRef.current = 0;
    secondsLeftRef.current = 60;
    bonusSecondsEarnedRef.current = 0;
    questionSeqRef.current = 0;
    startTimeRef.current = Date.now();
    isFinishedRef.current = false;

    setSecondsLeft(60);
    setScore(0);
    setCombo(0);
    setBestCombo(0);
    setCorrectCount(0);
    setTotalAnswered(0);
    setIsFinished(false);
    setResult(null);
    setFlashFeedback(null);
    setFloatingPopup(null);
    setSessionKey((k) => k + 1);
    generateNextQuestion();
  }, [levelId, generateNextQuestion, clearAllTimeouts]);

  useEffect(() => {
    initGame();
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      clearAllTimeouts();
    };
  }, [initGame, clearAllTimeouts]);

  // 60-second Countdown Timer
  useEffect(() => {
    if (isFinished) return;

    timerRef.current = setInterval(() => {
      if (isFinishedRef.current) return;
      const nextSec = Math.max(0, secondsLeftRef.current - 1);
      secondsLeftRef.current = nextSec;
      setSecondsLeft(nextSec);

      if (nextSec <= 0) {
        finishGame();
      }
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isFinished, sessionKey, finishGame]);

  const handleSelectOption = (isCorrect: boolean) => {
    if (isFinishedRef.current || secondsLeftRef.current <= 0 || !currentQ) return;

    totalAnsweredRef.current += 1;
    setTotalAnswered(totalAnsweredRef.current);
    const answerDuration = (Date.now() - questionStartTimeRef.current) / 1000;

    if (isCorrect) {
      speakChinese(currentQ.target.hanzi);

      const nextCombo = comboRef.current + 1;
      comboRef.current = nextCombo;
      bestComboRef.current = Math.max(bestComboRef.current, nextCombo);
      setCombo(nextCombo);
      setBestCombo(bestComboRef.current);

      const speedBonus = answerDuration < 2.2 ? 30 : 0;
      const earned = 100 + speedBonus + Math.min(nextCombo - 1, 6) * 25;

      scoreRef.current += earned;
      setScore(scoreRef.current);

      correctCountRef.current += 1;
      setCorrectCount(correctCountRef.current);

      if (nextCombo >= 2) {
        playComboSfx(nextCombo);
      } else {
        playSfx('ok');
      }

      let popupText = `+${earned}`;
      let isBonus = false;
      if (nextCombo > 0 && nextCombo % 5 === 0) {
        const actualAdded = Math.min(60, secondsLeftRef.current + 2) - secondsLeftRef.current;
        bonusSecondsEarnedRef.current += actualAdded;
        secondsLeftRef.current = Math.min(60, secondsLeftRef.current + 2);
        setSecondsLeft(secondsLeftRef.current);
        popupText = `+${earned} · +2s!`;
        isBonus = true;
      }

      setFloatingPopup({
        id: questionSeqRef.current + 1,
        text: popupText,
        isBonus,
      });
      safeTimeout(() => setFloatingPopup(null), 820);

      setFlashFeedback('ok');
      safeTimeout(() => setFlashFeedback(null), 180);
      generateNextQuestion();
    } else {
      playSfx('err');
      comboRef.current = 0;
      setCombo(0);
      setFlashFeedback('err');
      safeTimeout(() => setFlashFeedback(null), 250);
      generateNextQuestion();
    }
  };

  const energyPercent = (Math.max(0, Math.min(60, secondsLeft)) / 60) * 100;
  const energyBarColor =
    secondsLeft > 15
      ? 'bg-emerald-500'
      : secondsLeft >= 8
      ? 'bg-amber-500'
      : 'bg-red-600 animate-pulse';

  const cardAuraClass =
    flashFeedback === 'ok'
      ? 'border-emerald-500 border-b-emerald-800 from-emerald-50 via-emerald-50 to-emerald-100'
      : flashFeedback === 'err'
      ? 'border-red-500 border-b-red-800 from-red-50 via-red-50 to-rose-100'
      : combo >= 5
      ? 'border-orange-500 border-b-[#9A3412] from-[#FFFDF8] via-[#FCF4E4] to-[#F4E4C3] ring-2 ring-orange-400/70 shadow-[0_0_28px_rgba(249,115,22,0.45)]'
      : combo >= 3
      ? 'border-amber-500 border-b-[#8C5E1A] from-[#FFFDF8] via-[#FCF4E4] to-[#F4E4C3] ring-2 ring-amber-300/55 shadow-[0_0_20px_rgba(245,158,11,0.28)]'
      : 'border-[#C6923A] border-b-[#8C5E1A] from-[#FFFDF8] via-[#FCF4E4] to-[#F4E4C3]';

  return (
    <div
      data-testid="speed-blitz-game"
      className="relative overflow-hidden mx-auto flex w-full max-w-2xl flex-col gap-2 rounded-2xl border-2 border-[#7C4D25] p-2 shadow-xl sm:gap-3 sm:rounded-3xl sm:p-4"
    >
      {/* Imperial Martial Drum & Lantern Arena */}
      <img
        src={STAGE_BLITZ_BG_IMG}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#FFFDF7]/50 via-[#FAF0DC]/[0.42] to-[#F5E4C8]/[0.58]"
        aria-hidden="true"
      />

      <div className="relative z-10">
        <GameHeaderHud
          modeId="speed-blitz"
          title={tr('Chớp Nhoáng 60s', '60s Speed Blitz')}
          levelLabel={levelDef.shortLabel}
          score={score}
          timerSeconds={secondsLeft}
          onBack={onBack}
          onRestart={initGame}
        />
      </div>

      {/* Progress & Combo Bar */}
      <div className="relative z-10 flex items-center justify-between rounded-xl border border-[#B8893E]/70 bg-[#FFFDF7]/[0.92] px-3 py-1.5 shadow-xs sm:px-3.5 sm:py-2">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Zap className="h-3.5 w-3.5 text-amber-600 sm:h-4 sm:w-4" />
          <span className="text-[11px] font-bold text-[#4A2B13] sm:text-xs">
            {tr('Đã làm:', 'Done:')} <span className="font-mono font-black text-stone-900">{totalAnswered}</span> {tr('từ', 'words')}
          </span>
        </div>

        {combo >= 2 ? (
          <div
            data-testid="speed-blitz-combo"
            className="flex items-center gap-1 rounded-full bg-gradient-to-r from-rose-500 to-red-600 px-2.5 py-0.5 text-[11px] font-black text-white animate-bounce shadow-xs sm:text-xs"
          >
            <Flame className="h-3.5 w-3.5 fill-white" />
            <span>Combo x{combo}!</span>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6E3B16] sm:text-xs">
            <Award className="h-3.5 w-3.5 text-amber-600" />
            <span>{tr('Chuỗi cao nhất', 'Best Streak')}: x{bestCombo}</span>
          </span>
        )}
      </div>

      {/* Carved Rosewood & Brass Dragon-Spirit Energy Gauge */}
      <div className="relative z-10 h-3.5 w-full overflow-hidden rounded-full border-2 border-[#C6923A] bg-[#3B2110] p-0.5 shadow-md">
        <div
          data-testid="speed-blitz-energy-bar"
          className={`h-full rounded-full transition-all duration-300 ${energyBarColor}`}
          style={{ width: `${energyPercent}%` }}
        />
      </div>

      {/* Ornate Gilded Imperial Palace Plaque Question Card */}
      {currentQ && (
        <div
          data-testid="speed-blitz-card"
          className={`relative z-10 flex flex-col items-center justify-center rounded-2xl border-[3px] border-b-[5px] bg-gradient-to-b p-4 text-center shadow-md transition-colors duration-150 sm:rounded-3xl sm:p-6 ${cardAuraClass}`}
        >
          {/* Brass Plaque Crest Ornament */}
          <svg
            viewBox="0 0 80 18"
            aria-hidden="true"
            className="pointer-events-none absolute -top-2.5 left-1/2 h-4 w-16 -translate-x-1/2 text-[#C6923A] drop-shadow-xs sm:h-5 sm:w-20"
            fill="none"
          >
            <path
              d="M6 15 Q20 12 30 6 Q40 1 50 6 Q60 12 74 15 Z"
              fill="#FDE68A"
              stroke="#9A6F25"
              strokeWidth="1.5"
            />
            <circle cx="40" cy="8.5" r="3" fill="#B91C1C" stroke="#9A6F25" strokeWidth="1.2" />
          </svg>

          {/* 4 Golden SVG Corner Cloud Brackets */}
          {(['top-1.5 left-1.5', 'top-1.5 right-1.5 -scale-x-100', 'bottom-1.5 left-1.5 -scale-y-100', 'bottom-1.5 right-1.5 -scale-x-100 -scale-y-100'] as const).map(
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
                <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" opacity="0.85" />
              </svg>
            )
          )}

          {floatingPopup && (
            <div
              key={floatingPopup.id}
              data-testid="speed-blitz-floating-popup"
              className={`animate-score-float pointer-events-none absolute -top-2 left-1/2 z-20 rounded-full px-3 py-0.5 text-xs font-black whitespace-nowrap shadow-md ${
                floatingPopup.isBonus
                  ? 'border border-amber-300 bg-gradient-to-r from-orange-500 to-red-600 text-white'
                  : 'border border-emerald-200 bg-emerald-600 text-white'
              }`}
            >
              {floatingPopup.text}
            </div>
          )}

          {combo >= 5 && (
            <div
              data-testid="speed-blitz-fever-pill"
              className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-500 to-red-600 px-2.5 py-0.5 text-[10.5px] font-black tracking-wide text-white shadow-sm animate-pulse"
            >
              <Flame className="h-3 w-3 fill-amber-200 text-amber-200" />
              <span>FEVER x{combo}</span>
            </div>
          )}

          <div className="flex items-center justify-center gap-3">
            <span
              data-testid="speed-blitz-hanzi"
              className="font-hanzi text-4xl font-bold leading-tight text-stone-900 sm:text-5xl"
            >
              {currentQ.target.hanzi}
            </span>

            <button
              type="button"
              data-testid="speed-blitz-audio-btn"
              onClick={() => speakChinese(currentQ.target.hanzi)}
              aria-label={tr('Phát âm', 'Pronounce')}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-300/60 border-b-[3px] border-b-[#5C1111] bg-gradient-to-b from-red-700 via-red-800 to-red-950 text-amber-100 shadow-md transition-transform hover:scale-105 active:translate-y-[1px] active:scale-95 sm:h-10 sm:w-10"
            >
              <Volume2 className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>

          <span
            data-testid="speed-blitz-pinyin"
            className="mt-1.5 font-mono text-xs font-extrabold text-[#5C3718] sm:text-sm"
          >
            {currentQ.target.pinyin}
          </span>

          {!isEn && currentQ.target.hanViet && (
            <span className="mt-0.5 font-sans text-[10.5px] font-bold text-[#5C3718] sm:text-xs">
              Hán-Việt: {currentQ.target.hanViet}
            </span>
          )}
        </div>
      )}

      {/* 4 Chunky 3D Carved Ivory-Wood Game Tablets */}
      {currentQ && (
        <div className="relative z-10 grid grid-cols-2 gap-2 sm:gap-3">
          {currentQ.options.map((opt, idx) => (
            <button
              key={`q${questionSeq}-${opt.id}-${idx}`}
              type="button"
              data-testid={`speed-blitz-option-${idx}`}
              onClick={() => handleSelectOption(opt.isCorrect)}
              className="relative flex min-h-[54px] items-center justify-center rounded-2xl border-2 border-[#C89B4B] border-b-[4px] border-b-[#8A5A17] bg-gradient-to-b from-[#FFFDF9] via-[#FAF1DE] to-[#EFE0BE] px-3 py-2 text-center text-xs font-bold leading-snug text-stone-900 shadow-md transition-all hover:border-amber-500 active:translate-y-[2px] active:border-b-2 sm:min-h-[62px] sm:p-3 sm:text-sm"
            >
              {/* Pure-SVG Jade-Diamond Corner Filigree (zero text nodes) */}
              <svg
                viewBox="0 0 12 12"
                aria-hidden="true"
                className="pointer-events-none absolute top-1.5 left-1.5 h-2 w-2 text-emerald-700/60"
                fill="currentColor"
              >
                <polygon points="6,1 11,6 6,11 1,6" />
              </svg>
              <svg
                viewBox="0 0 12 12"
                aria-hidden="true"
                className="pointer-events-none absolute bottom-1.5 right-1.5 h-2 w-2 text-emerald-700/60"
                fill="currentColor"
              >
                <polygon points="6,1 11,6 6,11 1,6" />
              </svg>

              <span className="relative z-10 line-clamp-3">
                {opt.word ? getWordDisplayMeaning(opt.word, lang) : opt.text}
              </span>
            </button>
          ))}
        </div>
      )}

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

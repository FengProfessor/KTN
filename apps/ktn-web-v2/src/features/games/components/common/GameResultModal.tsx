import React from 'react';
import {
  Star,
  RotateCcw,
  ArrowLeft,
  Trophy,
  Flame,
  CheckCircle2,
  Clock,
  Crown,
  Sparkles,
  Compass,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import type { GameSessionResult } from '../../types/game.types';

interface GameResultModalProps {
  result: GameSessionResult;
  onReplay: () => void;
  onBackToLobby: () => void;
}

const CONFETTI_PARTICLES = [
  { left: '8%', delay: '0s', duration: '1.9s', color: 'bg-amber-400', shape: 'h-2 w-2 rounded-full' },
  { left: '16%', delay: '0.35s', duration: '2.2s', color: 'bg-rose-500', shape: 'h-2.5 w-1.5 rounded-xs' },
  { left: '24%', delay: '0.15s', duration: '2.0s', color: 'bg-emerald-500', shape: 'h-2 w-2 rounded-xs' },
  { left: '32%', delay: '0.55s', duration: '2.3s', color: 'bg-red-600', shape: 'h-2 w-1.5 rounded-full' },
  { left: '41%', delay: '0.25s', duration: '1.85s', color: 'bg-amber-500', shape: 'h-2.5 w-1.5 rounded-xs' },
  { left: '50%', delay: '0.7s', duration: '2.1s', color: 'bg-sky-500', shape: 'h-2 w-2 rounded-full' },
  { left: '58%', delay: '0.1s', duration: '2.25s', color: 'bg-rose-400', shape: 'h-2.5 w-1.5 rounded-xs' },
  { left: '66%', delay: '0.45s', duration: '1.95s', color: 'bg-amber-300', shape: 'h-2 w-2 rounded-xs' },
  { left: '74%', delay: '0.65s', duration: '2.15s', color: 'bg-emerald-400', shape: 'h-2 w-1.5 rounded-full' },
  { left: '82%', delay: '0.2s', duration: '2.05s', color: 'bg-red-500', shape: 'h-2.5 w-1.5 rounded-xs' },
  { left: '89%', delay: '0.5s', duration: '1.9s', color: 'bg-amber-400', shape: 'h-2 w-2 rounded-full' },
  { left: '94%', delay: '0.3s', duration: '2.2s', color: 'bg-violet-500', shape: 'h-2.5 w-1.5 rounded-xs' },
] as const;

export const GameResultModal: React.FC<GameResultModalProps> = ({
  result,
  onReplay,
  onBackToLobby,
}) => {
  const { tr } = useI18n();
  const { score, stars, correctCount, totalQuestions, accuracy, timeSpentSeconds, isNewRecord, streakBest } =
    result;

  const headerTitle =
    stars === 3
      ? tr('Chiến Thắng Hoàn Hảo!', 'Flawless Victory!')
      : stars === 2
      ? tr('Làm Rất Tốt!', 'Great Job!')
      : tr('Cố Gắng Lên Nào!', 'Keep It Up!');

  const headerIcon =
    stars === 3 ? (
      <Crown className="h-5 w-5 shrink-0 text-amber-500" />
    ) : stars === 2 ? (
      <Sparkles className="h-5 w-5 shrink-0 text-amber-500" />
    ) : (
      <Compass className="h-5 w-5 shrink-0 text-red-700" />
    );

  const headerSubtitle =
    stars === 3
      ? tr('Bé phản xạ siêu nhanh và nhớ trọn vẹn từ vựng!', 'Super-fast reflexes and complete vocabulary mastery!')
      : stars === 2
      ? tr('Chỉ một chút nữa là đạt điểm tối đa rồi!', 'Just a little bit more for a perfect score!')
      : tr('Càng chơi nhiều sẽ càng nhớ mặt chữ thật siêu!', 'The more you play, the faster you remember characters!');

  const showConfetti = stars >= 2 || Boolean(isNewRecord);

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="game-result-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-sm rounded-3xl border-4 border-amber-300 bg-gradient-to-b from-amber-50/90 via-white to-amber-50/50 p-4 pt-5 text-center shadow-2xl animate-fade-in sm:p-6">
        {/* Inner clipped layer for celebratory confetti */}
        {showConfetti && (
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
            aria-hidden="true"
          >
            {CONFETTI_PARTICLES.map((particle, idx) => (
              <span
                key={idx}
                className={`animate-confetti absolute top-2 ${particle.shape} ${particle.color}`}
                style={{
                  left: particle.left,
                  animationDelay: particle.delay,
                  animationDuration: particle.duration,
                }}
              />
            ))}
          </div>
        )}

        {/* Floating Trophy / Badge */}
        <div className="relative z-10 mx-auto -mt-10 flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-white bg-gradient-to-tr from-amber-500 to-amber-300 shadow-xl sm:-mt-12 sm:h-20 sm:w-20 sm:rounded-3xl">
          <Trophy className="h-8 w-8 text-amber-950 sm:h-10 sm:w-10" />
        </div>

        {/* Stars */}
        <div data-testid="game-result-stars" className="relative z-10 mt-3 flex items-center justify-center gap-2 sm:mt-4">
          {[1, 2, 3].map((starIdx) => {
            const isEarned = starIdx <= stars;
            return (
              <Star
                key={starIdx}
                className={`h-8 w-8 transition-transform duration-300 sm:h-9 sm:w-9 ${
                  isEarned
                    ? 'scale-110 fill-amber-400 text-amber-500 drop-shadow-md'
                    : 'scale-90 fill-stone-200 text-stone-300 opacity-60'
                }`}
              />
            );
          })}
        </div>

        {/* Header Title */}
        <h2 className="relative z-10 mt-2.5 flex items-center justify-center gap-1.5 font-display text-lg font-black text-stone-900 sm:mt-3 sm:text-xl">
          {headerIcon}
          <span>{headerTitle}</span>
        </h2>
        <p className="relative z-10 mt-1 hidden text-xs text-stone-600 sm:block">{headerSubtitle}</p>

        {/* New Record Banner */}
        {isNewRecord && (
          <div
            data-testid="game-new-record-badge"
            className="relative z-10 mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-400 bg-amber-100 px-3 py-1 text-xs font-black text-amber-900 shadow-2xs animate-pulse"
          >
            <Trophy className="h-3.5 w-3.5 text-amber-700" />
            <span>{tr('Kỷ lục mới xuất sắc!', 'Awesome New Record!')}</span>
          </div>
        )}

        {/* Stats Grid */}
        <div className="relative z-10 mt-4 grid grid-cols-2 gap-2.5 rounded-2xl border border-stone-200 bg-white/80 p-3 shadow-inner">
          <div className="flex flex-col items-center justify-center rounded-xl bg-amber-50/70 p-2">
            <span className="text-[11px] font-semibold text-stone-500">{tr('Tổng điểm', 'Total Score')}</span>
            <span data-testid="game-result-score" className="font-mono text-xl font-black text-amber-700">
              {score}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center rounded-xl bg-emerald-50/70 p-2">
            <span className="text-[11px] font-semibold text-stone-500">{tr('Độ chính xác', 'Accuracy')}</span>
            <span className="font-mono text-xl font-black text-emerald-700">
              {Math.round(accuracy)}%
            </span>
          </div>

          <div className="flex items-center justify-center gap-1.5 rounded-xl bg-stone-50 p-2 text-xs font-semibold text-stone-700">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>
              {correctCount}/{totalQuestions} {tr('câu', 'qs')}
            </span>
          </div>

          <div className="flex items-center justify-center gap-1.5 rounded-xl bg-stone-50 p-2 text-xs font-semibold text-stone-700">
            {streakBest ? (
              <>
                <Flame className="h-3.5 w-3.5 text-rose-500" />
                <span>{tr(`Chuỗi x${streakBest}`, `Streak x${streakBest}`)}</span>
              </>
            ) : (
              <>
                <Clock className="h-3.5 w-3.5 text-stone-500" />
                <span>{timeSpentSeconds}s</span>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="relative z-10 mt-5 flex flex-col gap-2">
          <button
            type="button"
            data-testid="game-result-replay-btn"
            onClick={onReplay}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-800 to-red-700 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:from-red-900 hover:to-red-800 active:scale-98"
          >
            <RotateCcw className="h-4 w-4" />
            <span>{tr('Chơi lại ván mới', 'Play Again')}</span>
          </button>

          <button
            type="button"
            data-testid="game-result-lobby-btn"
            onClick={onBackToLobby}
            className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-stone-700 shadow-2xs transition-colors hover:bg-stone-50 active:scale-98"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{tr('Về sảnh trò chơi', 'Back to Lobby')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

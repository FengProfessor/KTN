import React, { useState } from 'react';
import {
  ArrowLeft,
  Volume2,
  VolumeX,
  Heart,
  RotateCcw,
  Star,
  Timer as TimerIcon,
  Crosshair,
  Sparkles,
  Zap,
  Layers,
} from 'lucide-react';
import { isSoundMuted, toggleSound } from '../../services/audioService';
import { useAuthStore } from '@/stores/useAuthStore';
import { useI18n } from '@/i18n';
import type { GameModeId } from '../../types/game.types';

interface GameHeaderHudProps {
  modeId: GameModeId;
  title: string;
  levelLabel?: string;
  score: number;
  hearts?: number; // 0 to 3, undefined if game has no hearts
  maxHearts?: number;
  timerSeconds?: number;
  waveText?: string; // e.g. "Đợt 2/12"
  onBack: () => void;
  onRestart?: () => void;
}

const MODE_ICONS: Record<GameModeId, React.ReactNode> = {
  'memory-flip': <Layers className="h-4 w-4" />,
  'speed-blitz': <Zap className="h-4 w-4" />,
  'balloon-pop': <Sparkles className="h-4 w-4" />,
  'zombie-defender': <Crosshair className="h-4 w-4" />,
};

export const GameHeaderHud: React.FC<GameHeaderHudProps> = ({
  modeId,
  title,
  levelLabel,
  score,
  hearts,
  maxHearts = 3,
  timerSeconds,
  waveText,
  onBack,
  onRestart,
}) => {
  const user = useAuthStore((s) => s.user);
  const { tr } = useI18n();
  const [muted, setMuted] = useState(isSoundMuted());

  const handleToggleSound = () => {
    const next = toggleSound();
    setMuted(next);
  };

  const displayName = user?.name
    ? user.name.replace(/^Bé\s+/i, '')
    : tr('Khổng Tử Nhí', 'Little Confucius');

  return (
    <header
      data-testid="game-header-hud"
      className="relative overflow-hidden flex flex-nowrap items-center justify-between gap-1.5 rounded-2xl border-2 border-[#7C4D25] bg-gradient-to-b from-[#FFFDF7] via-[#FCF4E3] to-[#F3E3C3] px-2 py-1.5 shadow-[0_3px_0_#5C3718,0_6px_14px_rgba(45,22,8,0.16)] sm:gap-2 sm:px-4 sm:py-2.5"
    >
      {/* Subtle Golden Brass L-Corner Accents */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1 left-1 h-2 w-2 rounded-tl-xs border-t-2 border-l-2 border-[#C6923A]/85"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1 right-1 h-2 w-2 rounded-tr-xs border-t-2 border-r-2 border-[#C6923A]/85"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-1 left-1 h-2 w-2 rounded-bl-xs border-b-2 border-l-2 border-[#C6923A]/85"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-1 right-1 h-2 w-2 rounded-br-xs border-b-2 border-r-2 border-[#C6923A]/85"
      />

      {/* Left: Back button + Mode Badge + Title & Level */}
      <div className="relative z-10 flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
        <button
          type="button"
          data-testid="game-hud-back-btn"
          onClick={onBack}
          aria-label={tr('Quay lại sảnh trò chơi', 'Back to game lobby')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#B8893E]/70 border-b-[2.5px] border-b-[#7C4D25] bg-gradient-to-b from-[#FFFDF8] to-[#F4E1BF] text-[#5C3718] shadow-xs transition-all hover:from-amber-50 hover:to-amber-100 active:translate-y-[1px] active:scale-95 sm:h-9 sm:w-9"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex min-w-0 items-center gap-2">
          <div
            className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/25 border-b-2 border-b-black/25 shadow-xs sm:flex ${
              modeId === 'zombie-defender'
                ? 'bg-gradient-to-b from-red-700 to-red-900 text-amber-200'
                : modeId === 'balloon-pop'
                ? 'bg-gradient-to-b from-rose-500 to-rose-600 text-white'
                : modeId === 'speed-blitz'
                ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-stone-900'
                : 'bg-gradient-to-b from-emerald-500 to-emerald-700 text-white'
            }`}
          >
            {MODE_ICONS[modeId]}
          </div>

          <div className="flex min-w-0 flex-col">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-display text-xs font-bold text-[#3F230E] sm:text-sm">
                {title}
              </span>
              {levelLabel && (
                <span className="hidden shrink-0 rounded-full border border-[#C6923A]/50 bg-[#FFF8E6] px-2 py-0.5 text-[10px] font-bold text-[#7C4D25] sm:inline">
                  {levelLabel}
                </span>
              )}
            </div>
            {levelLabel && (
              <span className="truncate text-[10px] font-extrabold leading-tight text-[#7C4D25] sm:hidden">
                {levelLabel}
              </span>
            )}
            <div className="hidden items-center gap-1 text-[11px] font-semibold text-stone-600 sm:flex">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="truncate">{displayName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right HUD: Wave/Timer + Hearts + Score + Sound Toggle + Restart */}
      <div className="relative z-10 flex shrink-0 items-center gap-1 sm:gap-2.5">
        {/* Wave indicator if provided */}
        {waveText && (
          <div
            data-testid="game-hud-wave"
            className="flex shrink-0 items-center whitespace-nowrap rounded-full border border-[#C6923A]/75 bg-gradient-to-b from-[#FFFDF8] to-[#F7E7C8] px-1.5 py-0.5 text-[10.5px] font-black text-[#5C3718] shadow-xs sm:px-2.5 sm:py-1 sm:text-xs"
          >
            {waveText}
          </div>
        )}

        {/* Timer if provided */}
        {typeof timerSeconds === 'number' && (
          <div
            data-testid="game-hud-timer"
            className={`flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-black shadow-xs sm:gap-1 sm:px-2.5 sm:py-1 sm:text-xs ${
              timerSeconds <= 10
                ? 'animate-pulse border border-red-400 bg-gradient-to-b from-red-100 to-rose-200 text-red-800'
                : 'border border-[#B8893E]/60 bg-gradient-to-b from-[#FFFDF8] to-[#EFE2CA] text-[#4A2B13]'
            }`}
          >
            <TimerIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span>{timerSeconds}s</span>
          </div>
        )}

        {/* Hearts / Lives */}
        {typeof hearts === 'number' && (
          <div
            data-testid="game-hud-hearts"
            className="flex shrink-0 items-center gap-0.5 rounded-full border border-red-300/80 bg-gradient-to-b from-rose-50 to-red-100/80 px-1.5 py-1 shadow-inner sm:gap-1 sm:px-2.5"
          >
            {Array.from({ length: maxHearts }).map((_, idx) => {
              const isAlive = idx < hearts;
              return (
                <Heart
                  key={idx}
                  className={`h-3 w-3 transition-all duration-300 sm:h-4 sm:w-4 ${
                    isAlive
                      ? 'scale-100 fill-red-600 text-red-600'
                      : 'scale-90 fill-stone-200 text-stone-300 opacity-60'
                  }`}
                />
              );
            })}
          </div>
        )}

        {/* Gilded Ingot Score Pill */}
        <div
          data-testid="game-hud-score"
          className="flex shrink-0 items-center gap-1 rounded-full border border-amber-700/40 border-b-[2.5px] border-b-[#8C5E1A] bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 px-2 py-0.5 font-black text-amber-950 shadow-xs sm:gap-1.5 sm:px-3 sm:py-1"
        >
          <Star className="h-3 w-3 fill-amber-950 sm:h-3.5 sm:w-3.5" />
          <span className="font-mono text-xs tracking-tight sm:text-sm">{score}</span>
        </div>

        {/* Sound Toggle */}
        <button
          type="button"
          data-testid="game-hud-sound-toggle"
          onClick={handleToggleSound}
          aria-label={muted ? tr('Bật âm thanh', 'Unmute sound') : tr('Tắt âm thanh', 'Mute sound')}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-b-[2.5px] shadow-xs transition-all active:translate-y-[1px] active:scale-95 sm:h-9 sm:w-9 ${
            muted
              ? 'border-stone-300 border-b-stone-400 bg-gradient-to-b from-stone-100 to-stone-200 text-stone-500'
              : 'border-red-900/50 border-b-[#5C1111] bg-gradient-to-b from-red-700 to-red-900 text-amber-100 hover:from-red-600 hover:to-red-800'
          }`}
        >
          {muted ? <VolumeX className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Volume2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
        </button>

        {/* Restart Button if supplied */}
        {onRestart && (
          <button
            type="button"
            data-testid="game-hud-restart-btn"
            onClick={onRestart}
            aria-label={tr('Chơi lại ván này', 'Restart game')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#B8893E]/65 border-b-[2.5px] border-b-[#8C5E1A] bg-gradient-to-b from-[#FFFDF8] to-[#F3E1BF] text-[#5C3718] shadow-xs transition-all hover:from-amber-50 hover:to-amber-100 active:translate-y-[1px] active:scale-95 sm:h-9 sm:w-9"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </header>
  );
};

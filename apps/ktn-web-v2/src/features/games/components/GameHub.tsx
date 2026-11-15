import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Volume2,
  VolumeX,
  Trophy,
  Play,
  Layers,
  Zap,
  Sparkles,
  Crosshair,
  GraduationCap,
  Baby,
  Sparkle,
} from 'lucide-react';
import {
  getLocalizedGameLevels,
  getLocalizedGameLevelById,
  getHighScore,
} from '../services/vocabularyService';
import { isSoundMuted, toggleSound } from '../services/audioService';
import { HUB_GAME_ART } from '../assets/gameArtAssets';
import { useAuthStore } from '@/stores/useAuthStore';
import { useI18n } from '@/i18n';
import type { GameModeId, GameModeMeta } from '../types/game.types';

interface GameHubProps {
  onSelectGame: (modeId: GameModeId, levelId: string) => void;
  selectedLevelId: string;
  onSelectLevel: (levelId: string) => void;
}

function getGameModes(tr: (vi: string, en: string) => string): GameModeMeta[] {
  return [
    {
      id: 'memory-flip',
      title: tr('Lật Thẻ Trí Nhớ', 'Memory Card Flip'),
      tagline: tr('Ghép cặp Hán tự & Nghĩa', 'Match Hanzi & Meaning'),
      description: tr(
        'Hiệu ứng lật thẻ 3D trực quan, rèn luyện trí nhớ thị giác và phản xạ mặt chữ.',
        'Crisp 3D card-flip action to train visual memory and character recognition.'
      ),
      badge: tr('Kinh điển', 'Classic'),
      iconName: 'Layers',
      themeColor: 'from-emerald-500 to-teal-700',
      accentBg: 'bg-emerald-50',
      accentBorder: 'border-emerald-200',
      accentText: 'text-emerald-800',
    },
    {
      id: 'speed-blitz',
      title: tr('Chớp Nhoáng 60s', '60s Speed Blitz'),
      tagline: tr('Phản xạ tốc độ', 'Lightning Reflexes'),
      description: tr(
        'Chạy đua với đồng hồ 60 giây, bấm chạm tức thì để tích lũy chuỗi Combo rực lửa.',
        'Race the 60-second clock, tap answers instantly, and stack fiery Combo streaks.'
      ),
      badge: tr('Tốc độ', 'Speed'),
      iconName: 'Zap',
      themeColor: 'from-amber-500 to-orange-600',
      accentBg: 'bg-amber-50',
      accentBorder: 'border-amber-200',
      accentText: 'text-amber-800',
    },
    {
      id: 'balloon-pop',
      title: tr('Bắn Bóng Bay', 'Balloon Pop'),
      tagline: tr('Nghe & nổ bóng', 'Listen & Pop'),
      description: tr(
        'Bóng bay sắc màu bay lượn, chạm đúng từ vựng tương ứng để phát nổ vui nhộn.',
        'Colorful rising balloons — tap the matching meaning to pop them before they float away.'
      ),
      badge: tr('Thính giác', 'Audio'),
      iconName: 'Sparkles',
      themeColor: 'from-rose-500 to-pink-600',
      accentBg: 'bg-rose-50',
      accentBorder: 'border-rose-200',
      accentText: 'text-rose-800',
    },
    {
      id: 'zombie-defender',
      title: tr('Bắn Zombie', 'Zombie Defender'),
      tagline: tr('Phòng thủ 3 làn', '3-Lane Defense'),
      description: tr(
        'Phòng thủ 3 làn trước đợt tiến của zombie mang nghĩa tiếng Việt. Bắn hạ chuẩn xác!',
        'Defend 3 lanes against advancing waves of meaning zombies. Aim sharp and fire!'
      ),
      badge: tr('3 Làn', '3 Lanes'),
      iconName: 'Crosshair',
      themeColor: 'from-red-700 to-amber-900',
      accentBg: 'bg-red-50',
      accentBorder: 'border-red-200',
      accentText: 'text-red-900',
    },
  ];
}

export const GameHub: React.FC<GameHubProps> = ({
  onSelectGame,
  selectedLevelId,
  onSelectLevel,
}) => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { lang, tr } = useI18n();
  const [muted, setMuted] = useState(isSoundMuted());
  const [levelTab, setLevelTab] = useState<'hsk' | 'yct'>(
    selectedLevelId?.toLowerCase().startsWith('yct') ? 'yct' : 'hsk'
  );
  const selectedLevelBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (selectedLevelId?.toLowerCase().startsWith('yct')) {
      setLevelTab('yct');
    } else if (selectedLevelId?.toLowerCase().startsWith('hsk')) {
      setLevelTab('hsk');
    }
  }, [selectedLevelId]);

  useEffect(() => {
    selectedLevelBtnRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [selectedLevelId, levelTab]);

  const allLevels = useMemo(() => getLocalizedGameLevels(lang), [lang]);
  const currentLevelDef = useMemo(
    () => getLocalizedGameLevelById(selectedLevelId, lang),
    [selectedLevelId, lang]
  );
  const gameModes = useMemo(() => getGameModes(tr), [tr]);

  const filteredLevels = useMemo(() => {
    return allLevels.filter((l) => l.type === levelTab);
  }, [allLevels, levelTab]);

  const handleToggleSound = () => {
    const next = toggleSound();
    setMuted(next);
  };

  const getModeIcon = (name: GameModeMeta['iconName']) => {
    switch (name) {
      case 'Layers':
        return <Layers className="h-3 w-3 text-white sm:h-4 sm:w-4" />;
      case 'Zap':
        return <Zap className="h-3 w-3 text-white sm:h-4 sm:w-4" />;
      case 'Sparkles':
        return <Sparkles className="h-3 w-3 text-white sm:h-4 sm:w-4" />;
      case 'Crosshair':
        return <Crosshair className="h-3 w-3 text-white sm:h-4 sm:w-4" />;
      default:
        return <Sparkle className="h-3 w-3 text-white sm:h-4 sm:w-4" />;
    }
  };

  return (
    <div data-testid="game-hub-view" className="mx-auto flex w-full max-w-4xl flex-col gap-2 sm:gap-4">
      {/* Compact 1-Row Lobby Header Bar */}
      <header className="flex items-center justify-between gap-2 rounded-2xl border-2 border-amber-900/10 bg-gradient-to-r from-[#FAF6F0] via-white to-[#FFFDF9] px-2.5 py-1.5 shadow-sm sm:px-5 sm:py-3.5">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            data-testid="game-hub-back-home-btn"
            onClick={() => navigate('/')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 shadow-2xs transition-colors hover:bg-stone-50 active:scale-95"
            aria-label={tr('Về Trang chủ', 'Back to Home')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="truncate font-display text-sm font-black text-stone-900 sm:text-lg">
                {tr('Đấu Trường Tiếng Trung', 'Chinese Arena')}
              </span>
              <span className="hidden shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-extrabold text-red-900 sm:inline-block">
                KTN Games
              </span>
            </div>
            <p className="hidden truncate text-xs text-stone-500 sm:block">
              {user?.name ? `${user.name} · ` : ''}
              {tr('Vừa chơi vừa nhớ từ vựng siêu tốc', 'Play & memorize vocabulary fast')}
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid="game-hub-sound-btn"
          onClick={handleToggleSound}
          aria-label={muted ? tr('Bật âm thanh', 'Unmute sound') : tr('Tắt âm thanh', 'Mute sound')}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-2xs transition-all ${
            muted
              ? 'border-stone-300 bg-stone-100 text-stone-400'
              : 'border-red-800/20 bg-red-800 text-white hover:bg-red-900'
          }`}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </header>

      {/* Level Selector Section (HSK 1-6 & YCT 1-7) */}
      <section
        data-testid="game-level-selector"
        className="rounded-2xl border-2 border-amber-300/80 bg-gradient-to-b from-amber-50/70 to-white p-2 shadow-sm sm:rounded-3xl sm:p-5"
      >
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <div className="flex items-center justify-between gap-2 sm:block">
            <h2 className="font-display text-xs font-black text-stone-900 sm:text-base">
              <span className="sm:hidden">{tr('Cấp độ', 'Level')}</span>
              <span className="hidden sm:inline">{tr('1. Chọn cấp độ từ vựng', '1. Choose Vocabulary Level')}</span>
            </h2>
            <p className="truncate text-[11px] font-semibold text-stone-600 sm:text-xs">
              <span className="hidden sm:inline">{tr('Đang chọn: ', 'Selected: ')}</span>
              <strong className="text-red-900">{currentLevelDef.code}</strong>
              <span className="hidden sm:inline"> · {currentLevelDef.badge}</span>
              <span className="sm:hidden"> · {currentLevelDef.wordCount} {tr('từ', 'words')}</span>
            </p>
          </div>

          {/* Level System Switcher (HSK vs YCT) */}
          <div className="grid w-full grid-cols-2 rounded-xl border border-stone-200 bg-white p-1 shadow-2xs sm:flex sm:w-auto">
            <button
              type="button"
              data-testid="tab-level-hsk"
              onClick={() => setLevelTab('hsk')}
              className={`flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors sm:px-3 sm:py-1.5 ${
                levelTab === 'hsk'
                  ? 'bg-red-800 text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <GraduationCap className="h-3.5 w-3.5 shrink-0" />
              <span>HSK (1-6)</span>
            </button>

            <button
              type="button"
              data-testid="tab-level-yct"
              onClick={() => setLevelTab('yct')}
              className={`flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors sm:px-3 sm:py-1.5 ${
                levelTab === 'yct'
                  ? 'bg-red-800 text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Baby className="h-3.5 w-3.5 shrink-0" />
              <span>YCT (1-7)</span>
            </button>
          </div>
        </div>

        {/* Horizontal swipe pill bar on mobile, wrapping pills on desktop */}
        <div className="mt-1.5 flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mt-3 sm:flex-wrap sm:gap-2 sm:overflow-visible sm:pb-0">
          {filteredLevels.map((lvl) => {
            const isSelected = lvl.id === selectedLevelId;
            return (
              <button
                key={lvl.id}
                ref={isSelected ? selectedLevelBtnRef : undefined}
                type="button"
                data-testid={`level-btn-${lvl.id}`}
                onClick={() => onSelectLevel(lvl.id)}
                className={`flex min-h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-2.5 py-1 text-xs font-bold shadow-2xs transition-all active:scale-95 sm:min-h-[38px] sm:px-3 sm:py-1.5 ${
                  isSelected
                    ? 'border-red-900 bg-red-800 text-white shadow-sm ring-2 ring-red-800/30'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-amber-400 hover:bg-amber-50/50'
                }`}
              >
                <span>{lvl.code}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-black ${
                    isSelected ? 'bg-red-900/60 text-amber-200' : 'bg-stone-100 text-stone-500'
                  }`}
                >
                  {lvl.wordCount}
                  <span className="hidden sm:inline"> {tr('từ', 'words')}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4 Games Cards Grid (2x2 compact thumb-ready layout on Mobile!) */}
      <section className="space-y-1.5 sm:space-y-2.5">
        <h2 className="hidden font-display text-sm font-black text-stone-900 sm:block sm:text-base">
          {tr('2. Chọn trò chơi yêu thích', '2. Choose Your Favorite Game')}
        </h2>

        <div className="grid grid-cols-2 gap-2 sm:gap-3.5">
          {gameModes.map((mode) => {
            const highScore = getHighScore(mode.id, selectedLevelId);

            return (
              <div
                key={mode.id}
                data-testid={`game-mode-card-${mode.id}`}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-stone-200 bg-white p-0 shadow-sm transition-all hover:-translate-y-1 hover:border-amber-400 hover:shadow-md sm:rounded-3xl"
              >
                {/* Oriental Illustrated Banner */}
                <div className="relative h-12 w-full overflow-hidden sm:h-28">
                  <img
                    src={HUB_GAME_ART[mode.id]}
                    alt=""
                    aria-hidden="true"
                    loading="eager"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-stone-950/65 via-stone-950/15 to-transparent"
                    aria-hidden="true"
                  />

                  {/* Top-left badge pill */}
                  <span className="absolute top-1 left-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-extrabold leading-none text-stone-800 shadow-2xs backdrop-blur-xs sm:top-2.5 sm:left-2.5 sm:px-2 sm:py-0.5 sm:text-[10px]">
                    {mode.badge}
                  </span>

                  {/* Top-right high score trophy pill (only when highScore > 0) */}
                  {highScore > 0 && (
                    <div
                      data-testid={`high-score-${mode.id}`}
                      className="absolute top-1 right-1.5 flex items-center gap-0.5 rounded-full bg-amber-100/95 px-1.5 py-0.5 text-[9.5px] font-extrabold leading-none text-amber-800 shadow-2xs backdrop-blur-xs sm:top-2.5 sm:right-2.5 sm:gap-1 sm:px-2 sm:py-0.5 sm:text-[11px]"
                    >
                      <Trophy className="h-2.5 w-2.5 shrink-0 text-amber-600 sm:h-3 sm:w-3" />
                      <span>{highScore}</span>
                    </div>
                  )}

                  {/* Bottom-left compact mode icon chip */}
                  <div
                    className={`absolute bottom-1 left-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-tr shadow-sm ring-1 ring-white/40 sm:bottom-2.5 sm:left-2.5 sm:h-8 sm:w-8 sm:rounded-xl ${mode.themeColor}`}
                  >
                    {getModeIcon(mode.iconName)}
                  </div>
                </div>

                {/* Card Body */}
                <div className="flex flex-1 flex-col justify-between p-2 sm:p-4">
                  <div>
                    <h3 className="font-display text-[13px] leading-tight font-black text-stone-900 sm:text-base">
                      {mode.title}
                    </h3>
                    <p className="mt-0.5 line-clamp-1 text-[10.5px] font-semibold text-amber-800 sm:text-xs">
                      {mode.tagline}
                    </p>
                    <p className="mt-1 hidden text-xs leading-relaxed text-stone-500 sm:block">
                      {mode.description}
                    </p>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between border-t border-stone-100 pt-1.5 sm:mt-3 sm:pt-3">
                    <span className="hidden text-[11px] font-bold text-stone-500 sm:inline">
                      {tr('Độ khó: ', 'Level: ')}<span className="text-stone-800">{currentLevelDef.code}</span>
                    </span>

                    <button
                      type="button"
                      data-testid={`play-btn-${mode.id}`}
                      onClick={() => onSelectGame(mode.id, selectedLevelId)}
                      className="inline-flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-xl bg-red-800 px-3 py-1 text-xs font-black text-white shadow-2xs transition-all hover:bg-red-900 active:scale-95 sm:min-h-[38px] sm:w-auto sm:px-4 sm:py-1.5"
                    >
                      <Play className="h-3.5 w-3.5 fill-white" />
                      <span>{tr('Chơi ngay', 'Play Now')}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

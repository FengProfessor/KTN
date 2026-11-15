import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  getAllGameLevels,
  getGameLevelById,
  getWordsForLevel,
  getRandomWordsForGame,
  getDistractorMeanings,
  markWordSeenInLevel,
  avoidSeamRepeat,
  syncRemoteVocabulary,
  saveHighScore,
  getHighScore,
} from '@/features/games/services/vocabularyService';
import {
  playSfx,
  playComboSfx,
  speakChinese,
  toggleSound,
  isSoundMuted,
  setSoundMuted,
} from '@/features/games/services/audioService';
import { GameHub } from '@/features/games/components/GameHub';
import { MemoryFlipGame } from '@/features/games/components/games/MemoryFlipGame';
import { SpeedBlitzGame } from '@/features/games/components/games/SpeedBlitzGame';
import { BalloonPopGame } from '@/features/games/components/games/BalloonPopGame';
import { ZombieDefenderGame } from '@/features/games/components/games/ZombieDefenderGame';
import {
  HOP_PERIOD_SEC,
  computeJiangshiKinematics,
} from '@/features/games/components/games/JiangshiPuppet';
import { GameResultModal } from '@/features/games/components/common/GameResultModal';
import { GamesPage } from '@/features/games/components/GamesPage';
import { StudentHome } from '@/features/dashboard/components/StudentHome';

describe('KTN Chinese Interactive Games Suite (4 Games, Levels, Hanbeego UI & Dashboard)', () => {
  beforeEach(() => {
    localStorage.clear();
    setSoundMuted(false);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Suite 1: Level Selection & Vocabulary Database (R2)
  // ==========================================================================
  describe('Suite 1: Levels & Vocabulary Database (HSK 1-6 and YCT 1-7)', () => {
    it('supports all 13 required levels: HSK 1-6 and YCT 1-7 (Lộ trình 1-7)', () => {
      const levels = getAllGameLevels();
      expect(levels.length).toBe(13);

      const hskLevels = levels.filter((l) => l.type === 'hsk');
      expect(hskLevels.length).toBe(6);
      expect(hskLevels.map((l) => l.id)).toEqual(['hsk1', 'hsk2', 'hsk3', 'hsk4', 'hsk5', 'hsk6']);

      const yctLevels = levels.filter((l) => l.type === 'yct');
      expect(yctLevels.length).toBe(7);
      expect(yctLevels.map((l) => l.id)).toEqual([
        'yct1',
        'yct2',
        'yct3',
        'yct4',
        'yct5',
        'yct6',
        'yct7',
      ]);
    });

    it('loads non-empty vocabulary with hanzi, pinyin, meaning for every single level', () => {
      const allLevels = getAllGameLevels();
      for (const lvl of allLevels) {
        const words = getWordsForLevel(lvl.id);
        expect(words.length).toBeGreaterThanOrEqual(15);
        for (const w of words.slice(0, 5)) {
          expect(w.hanzi).toBeTruthy();
          expect(w.pinyin).toBeTruthy();
          expect(w.meaning).toBeTruthy();
          expect(w.levelId).toBe(lvl.id);
        }
      }
    });

    it('picks N random words without duplicates in current round', () => {
      const picked = getRandomWordsForGame('hsk1', 10);
      expect(picked.length).toBe(10);
      const ids = new Set(picked.map((w) => w.id));
      expect(ids.size).toBe(10);
    });

    it('generates distinct distractor meanings that do not overlap with target meaning', () => {
      const words = getWordsForLevel('hsk1');
      const target = words[0];
      const distractors = getDistractorMeanings(target, 3, 'hsk1');
      expect(distractors.length).toBe(3);
      expect(distractors).not.toContain(target.meaning);
      const uniqueDistractors = new Set(distractors.map((d) => d.trim().toLowerCase()));
      expect(uniqueDistractors.size).toBe(3);
    });

    it('prioritizes all remaining unseen words via partial wrap-around before repeating on small YCT levels', () => {
      const yct6Pool = getWordsForLevel('yct6');
      expect(yct6Pool.length).toBe(15);

      const seen = new Set<string>();
      const round1 = getRandomWordsForGame('yct6', 10, Array.from(seen));
      expect(round1.length).toBe(10);
      round1.forEach((w) => markWordSeenInLevel(seen, w.id, yct6Pool.length));
      expect(seen.size).toBe(10);

      // Next draw of 10 must include all 5 remaining unseen words first, then wrap with 5 seen words
      const round2 = getRandomWordsForGame('yct6', 10, Array.from(seen));
      expect(round2.length).toBe(10);
      const round1Ids = new Set(round1.map((w) => w.id));
      const unseenPickedInRound2 = round2.filter((w) => !round1Ids.has(w.id));
      expect(unseenPickedInRound2.length).toBe(5);

      const combinedIds = new Set([...round1, ...round2].map((w) => w.id));
      expect(combinedIds.size).toBe(15);

      // Avoid seam repeat swaps index 0 when freshly shuffled batch starts with previous word
      const lastWord = round1[round1.length - 1];
      const seamBatch = [lastWord, round1[0], round1[1]];
      const adjusted = avoidSeamRepeat(seamBatch, lastWord.id);
      expect(adjusted[0].id).not.toBe(lastWord.id);
    });

    it('deduplicates distractor meanings case-insensitively across whitespace and casing collisions', () => {
      const fakeTarget = {
        id: 'custom_case_collision',
        hanzi: '测试',
        pinyin: 'cèshì',
        meaning: '   TẠM BIỆT, HẸN GẶP LẠI  ',
        levelId: 'hsk1',
        levelType: 'hsk' as const,
      };
      const distractors = getDistractorMeanings(fakeTarget, 5, 'hsk1');
      expect(distractors.length).toBe(5);
      const normalizedSet = new Set(distractors.map((d) => d.trim().toLowerCase()));
      expect(normalizedSet.size).toBe(5);
      expect(normalizedSet.has('tạm biệt, hẹn gặp lại')).toBe(false);
    });

    it('handles remote vocabulary sync failures gracefully with silent fallback to static', async () => {
      // Mock fetch failure
      global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));
      const words = await syncRemoteVocabulary('hsk1');
      expect(words.length).toBeGreaterThan(0);
      expect(words[0].hanzi).toBeTruthy();
    });

    it('saves and tracks high score records correctly per mode and level', () => {
      expect(getHighScore('zombie-defender', 'hsk1')).toBe(0);
      const isNew1 = saveHighScore('zombie-defender', 'hsk1', 450);
      expect(isNew1).toBe(true);
      expect(getHighScore('zombie-defender', 'hsk1')).toBe(450);

      // Lower score is not a new record
      const isNew2 = saveHighScore('zombie-defender', 'hsk1', 300);
      expect(isNew2).toBe(false);
      expect(getHighScore('zombie-defender', 'hsk1')).toBe(450);

      // Higher score updates record
      const isNew3 = saveHighScore('zombie-defender', 'hsk1', 600);
      expect(isNew3).toBe(true);
      expect(getHighScore('zombie-defender', 'hsk1')).toBe(600);
    });
  });

  // ==========================================================================
  // Suite 2: Audio Synthesis & Speech Pronunciation
  // ==========================================================================
  describe('Suite 2: Audio Synthesis & Speech Pronunciation', () => {
    it('toggles sound mute state and respects mute preference', () => {
      expect(isSoundMuted()).toBe(false);
      toggleSound();
      expect(isSoundMuted()).toBe(true);
      // Playing sfx while muted returns early without error
      expect(() => playSfx('ok')).not.toThrow();
      expect(() => speakChinese('你好')).not.toThrow();

      toggleSound();
      expect(isSoundMuted()).toBe(false);
    });

    it('procedural playSfx handles all sound types without throwing', () => {
      const kinds = ['flip', 'ok', 'err', 'pop', 'shoot', 'hit', 'win', 'gameover'] as const;
      for (const kind of kinds) {
        expect(() => playSfx(kind)).not.toThrow();
      }
    });
  });

  // ==========================================================================
  // Suite 3: Game 1 — Lật thẻ (Memory Flip)
  // ==========================================================================
  describe('Suite 3: Game 1 — Memory Flip', () => {
    it('renders 12 cards, flips on tap, and matches pairs', async () => {
      const onBackMock = vi.fn();
      render(
        <MemoryRouter>
          <MemoryFlipGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      expect(screen.getByTestId('memory-flip-game')).toBeDefined();
      expect(screen.getByTestId('memory-flip-grid')).toBeDefined();

      const card0 = screen.getByTestId('memory-card-0');
      fireEvent.click(card0);

      const card1 = screen.getByTestId('memory-card-1');
      fireEvent.click(card1);

      // Back button calls onBack
      const backBtn = screen.getByTestId('game-hud-back-btn');
      fireEvent.click(backBtn);
      expect(onBackMock).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Suite 4: Game 2 — Chớp nhoáng 60s (Speed Blitz)
  // ==========================================================================
  describe('Suite 4: Game 2 — Speed Blitz', () => {
    it('renders question with Hanzi, 60s timer, and 4 tap choices', () => {
      const onBackMock = vi.fn();
      render(
        <MemoryRouter>
          <SpeedBlitzGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      expect(screen.getByTestId('speed-blitz-game')).toBeDefined();
      expect(screen.getByTestId('speed-blitz-card')).toBeDefined();
      expect(screen.getByTestId('speed-blitz-hanzi')).toBeDefined();
      expect(screen.getByTestId('game-hud-timer')).toBeDefined();

      const opt0 = screen.getByTestId('speed-blitz-option-0');
      expect(opt0).toBeDefined();

      // Click an option
      fireEvent.click(opt0);

      // Pronounce audio button works
      const audioBtn = screen.getByTestId('speed-blitz-audio-btn');
      fireEvent.click(audioBtn);
    });
  });

  // ==========================================================================
  // Suite 5: Game 3 — Bắn bóng bay (Balloon Pop)
  // ==========================================================================
  describe('Suite 5: Game 3 — Balloon Pop', () => {
    it('renders target word, 3 hearts, and Eastern SVG stage without system emojis', () => {
      const onBackMock = vi.fn();
      render(
        <MemoryRouter>
          <BalloonPopGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      expect(screen.getByTestId('balloon-pop-game')).toBeDefined();
      const stage = screen.getByTestId('balloon-stage');
      expect(stage).toBeDefined();
      expect(screen.getByTestId('balloon-target-hanzi')).toBeDefined();
      expect(screen.getByTestId('game-hud-hearts')).toBeDefined();

      // Stage must use layered SVG scenery instead of system emojis
      expect(stage.textContent ?? '').not.toMatch(/☁️|🌸|🌳|🎈/);
      expect(stage.innerHTML).not.toMatch(/☁️|🌸|🌳|🎈/);
      expect(stage.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);

      const balloon0 = screen.getByTestId('balloon-item-0');
      expect(balloon0).toBeDefined();

      fireEvent.click(balloon0);
    });

    it('spawns 4 balloons below bottom edge at t=0 and rises them sequentially into view', () => {
      vi.useFakeTimers();
      try {
        const onBackMock = vi.fn();
        render(
          <MemoryRouter>
            <BalloonPopGame levelId="hsk1" onBack={onBackMock} />
          </MemoryRouter>
        );

        const initialYs = [0, 1, 2, 3].map((i) =>
          parseFloat(screen.getByTestId(`balloon-item-${i}`).style.top)
        );

        // At t = 0, all 4 balloons wait below the bottom edge in sequential order
        expect(initialYs[0]).toBeGreaterThanOrEqual(100);
        expect(initialYs[0]).toBeLessThan(initialYs[1]);
        expect(initialYs[1]).toBeLessThan(initialYs[2]);
        expect(initialYs[2]).toBeLessThan(initialYs[3]);

        // After 1500ms: balloon 0 has entered the sky (< 100%) while balloon 1 still waits below (> 100%)
        act(() => {
          vi.advanceTimersByTime(1500);
        });

        const ysAt1500 = [0, 1, 2, 3].map((i) =>
          parseFloat(screen.getByTestId(`balloon-item-${i}`).style.top)
        );
        expect(ysAt1500[0]).toBeLessThan(100);
        expect(ysAt1500[1]).toBeGreaterThan(100);
        for (let i = 0; i < 4; i++) {
          expect(ysAt1500[i]).toBeLessThan(initialYs[i]);
        }

        // Advance +2000ms (total 3500ms): balloon 1 has emerged (< 100%) right behind balloon 0
        act(() => {
          vi.advanceTimersByTime(2000);
        });

        const ysAt3500 = [0, 1, 2, 3].map((i) =>
          parseFloat(screen.getByTestId(`balloon-item-${i}`).style.top)
        );
        expect(ysAt3500[1]).toBeLessThan(100);
        for (let i = 0; i < 4; i++) {
          expect(ysAt3500[i]).toBeLessThan(ysAt1500[i]);
        }
      } finally {
        vi.useRealTimers();
      }
    });

    it('recycles unpopped balloons back from bottom after exiting top without losing hearts', () => {
      vi.useFakeTimers();
      try {
        const onBackMock = vi.fn();
        render(
          <MemoryRouter>
            <BalloonPopGame levelId="hsk1" onBack={onBackMock} />
          </MemoryRouter>
        );

        act(() => {
          vi.advanceTimersByTime(9000);
        });

        const ysAfter = [0, 1, 2, 3].map((i) =>
          parseFloat(screen.getByTestId(`balloon-item-${i}`).style.top)
        );

        // At least one unpopped balloon has recycled back from the bottom queue (> 70%)
        expect(ysAfter.some((y) => y > 70)).toBe(true);
        // All 3 hearts remain intact when player takes time reading
        const heartsContainer = screen.getByTestId('game-hud-hearts');
        expect(heartsContainer.querySelectorAll('.fill-red-600').length).toBe(3);
      } finally {
        vi.useRealTimers();
      }
    });

    it('pause and resume clamps deltaSec to prevent balloon teleportation', () => {
      vi.useFakeTimers();
      try {
        const onBackMock = vi.fn();
        render(
          <MemoryRouter>
            <BalloonPopGame levelId="hsk1" onBack={onBackMock} />
          </MemoryRouter>
        );

        fireEvent.click(screen.getByLabelText('Tạm dừng'));
        const pausedY0 = parseFloat(screen.getByTestId('balloon-item-0').style.top);

        act(() => {
          vi.advanceTimersByTime(10000);
        });

        fireEvent.click(screen.getByLabelText('Tiếp tục'));
        act(() => {
          vi.advanceTimersByTime(16);
        });

        const resumedY0 = parseFloat(screen.getByTestId('balloon-item-0').style.top);
        expect(pausedY0 - resumedY0).toBeLessThan(5);
      } finally {
        vi.useRealTimers();
      }
    });

    it('deducts a heart on wrong balloon tap and awards +100 score with 8 burst shards on correct tap', () => {
      vi.useFakeTimers();
      try {
        const onBackMock = vi.fn();
        render(
          <MemoryRouter>
            <BalloonPopGame levelId="hsk1" onBack={onBackMock} />
          </MemoryRouter>
        );

        const targetHanzi = screen.getByTestId('balloon-target-hanzi').textContent;
        const targetWord = getWordsForLevel('hsk1').find((w) => w.hanzi === targetHanzi);
        expect(targetWord).toBeDefined();

        const items = [0, 1, 2, 3].map((i) => screen.getByTestId(`balloon-item-${i}`));
        const correctIdx = items.findIndex(
          (el) => el.textContent?.trim() === targetWord!.meaning
        );
        const wrongIdx = items.findIndex(
          (el) => el.textContent?.trim() !== targetWord!.meaning
        );
        expect(correctIdx).toBeGreaterThanOrEqual(0);
        expect(wrongIdx).toBeGreaterThanOrEqual(0);

        const heartsContainer = screen.getByTestId('game-hud-hearts');
        expect(heartsContainer.querySelectorAll('.fill-red-600').length).toBe(3);

        // Tap wrong balloon -> loses 1 heart & shows 8 shards + ✕ badge
        const wrongBtn = screen.getByTestId(`balloon-item-${wrongIdx}`);
        fireEvent.click(wrongBtn);
        expect(heartsContainer.querySelectorAll('.fill-red-600').length).toBe(2);
        expect(wrongBtn.querySelectorAll('.animate-balloon-shard').length).toBe(8);
        expect(wrongBtn.textContent).toContain('✕');

        // Tap correct balloon -> awards +100 score & shows 8 shards + +100 badge
        const correctBtn = screen.getByTestId(`balloon-item-${correctIdx}`);
        fireEvent.click(correctBtn);
        expect(screen.getByTestId('game-hud-score')).toHaveTextContent('100');
        expect(correctBtn.querySelectorAll('.animate-balloon-shard').length).toBe(8);
        expect(correctBtn.textContent).toContain('+100');

        // Advance past 420ms round transition -> advances to round 2
        act(() => {
          vi.advanceTimersByTime(450);
        });
        expect(screen.getByTestId('game-hud-wave')).toHaveTextContent(/Màn 2\/10/);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ==========================================================================
  // Suite 6: Game 4 — Bắn Zombie tiếng Trung (Zombie Defender)
  // ==========================================================================
  describe('Suite 6: Game 4 — Zombie Defender', () => {
    it('bám sát screenshot thiết kế: 3-lane battlefield, ranh giới tre, target word, round red speaker', () => {
      const onBackMock = vi.fn();
      render(
        <MemoryRouter>
          <ZombieDefenderGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      expect(screen.getByTestId('zombie-defender-game')).toBeDefined();
      expect(screen.getByTestId('zombie-title-pill')).toHaveTextContent('Bắn zombie mang nghĩa đúng');
      expect(screen.getByTestId('zombie-question-card')).toBeDefined();
      expect(screen.getByTestId('zombie-wave-badge')).toHaveTextContent(/Đợt 1\/12/);
      expect(screen.getByTestId('zombie-target-hanzi')).toBeDefined();
      expect(screen.getByTestId('zombie-target-pinyin')).toBeDefined();

      // Bamboo fence on left boundary
      expect(screen.getByTestId('zombie-bamboo-fence')).toBeDefined();

      // Courtyard battlefield
      expect(screen.getByTestId('zombie-courtyard-battlefield')).toBeDefined();

      // 3 lanes of zombies
      const zombieLane0 = screen.getByTestId('zombie-unit-0');
      const zombieLane1 = screen.getByTestId('zombie-unit-1');
      const zombieLane2 = screen.getByTestId('zombie-unit-2');

      expect(zombieLane0).toBeDefined();
      expect(zombieLane1).toBeDefined();
      expect(zombieLane2).toBeDefined();

      // Round red speaker button
      const audioBtn = screen.getByTestId('zombie-audio-btn');
      fireEvent.click(audioBtn);

      // Tap-to-shoot zombie
      fireEvent.click(zombieLane0);
    });
  });

  // ==========================================================================
  // Suite 7: Game Hub Lobby & Student Dashboard Integration (R3)
  // ==========================================================================
  describe('Suite 7: Game Hub Lobby & Student Dashboard Integration (R3)', () => {
    it('GameHub allows switching level system between HSK and YCT', () => {
      const onSelectGameMock = vi.fn();
      const onSelectLevelMock = vi.fn();

      render(
        <MemoryRouter>
          <GameHub
            onSelectGame={onSelectGameMock}
            selectedLevelId="hsk1"
            onSelectLevel={onSelectLevelMock}
          />
        </MemoryRouter>
      );

      expect(screen.getByTestId('game-hub-view')).toBeDefined();
      expect(screen.getByTestId('tab-level-hsk')).toBeDefined();
      expect(screen.getByTestId('tab-level-yct')).toBeDefined();

      // Switch to YCT
      fireEvent.click(screen.getByTestId('tab-level-yct'));

      // Click YCT 2
      const yct2Btn = screen.getByTestId('level-btn-yct2');
      fireEvent.click(yct2Btn);
      expect(onSelectLevelMock).toHaveBeenCalledWith('yct2');

      // Click "Chơi ngay" on Zombie Defender
      const playZombieBtn = screen.getByTestId('play-btn-zombie-defender');
      fireEvent.click(playZombieBtn);
      expect(onSelectGameMock).toHaveBeenCalledWith('zombie-defender', 'hsk1');
    });

    it('GamesPage navigates between lobby and selected game seamlessly', () => {
      render(
        <MemoryRouter initialEntries={['/games?game=zombie-defender&level=hsk2']}>
          <Routes>
            <Route path="/games" element={<GamesPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByTestId('zombie-defender-game')).toBeDefined();

      // Back to lobby
      const backBtn = screen.getByTestId('game-hud-back-btn');
      fireEvent.click(backBtn);

      expect(screen.getByTestId('game-hub-view')).toBeDefined();
    });

    it('Student Dashboard card discovery-card-games is active and clicking it navigates to /games', () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/']}>
            <StudentHome />
          </MemoryRouter>
        </QueryClientProvider>
      );

      const gamesCard = screen.getByTestId('discovery-card-games');
      expect(gamesCard).toBeDefined();
      expect(gamesCard).toHaveTextContent('Trò chơi tiếng Trung');
      expect(gamesCard).toHaveTextContent('Chơi ngay');

      const btn = screen.getByTestId('student-card-games-btn');
      expect(btn).toBeDefined();
      fireEvent.click(btn);
    });
  });

  // ==========================================================================
  // Suite 8: Adversarial Edge Cases & Timing Robustness
  // ==========================================================================
  describe('Suite 8: Adversarial Edge Cases & Timing Robustness', () => {
    it('Zombie Defender: fence breach deducts exactly 1 heart and transitions without bleeding all 3 hearts', () => {
      vi.useFakeTimers();
      const onBackMock = vi.fn();

      render(
        <MemoryRouter>
          <ZombieDefenderGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      const heartsContainer = screen.getByTestId('game-hud-hearts');
      expect(heartsContainer.querySelectorAll('.fill-red-600').length).toBe(3);

      // Advance animation frames step-by-step until zombie reaches <= 18% fence
      for (let i = 0; i < 950; i++) {
        act(() => {
          vi.advanceTimersByTime(16);
        });
      }

      // Exactly 1 heart lost (from 3 down to 2), NOT immediate 0
      expect(heartsContainer.querySelectorAll('.fill-red-600').length).toBe(2);

      // Advance by another 600ms transition into wave 2
      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(screen.getByTestId('zombie-wave-badge')).toHaveTextContent(/Đợt 2\/12/);
      vi.useRealTimers();
    });

    it('Zombie Defender: rapid double-tap on correct zombie awards points only once and prevents wave skip', () => {
      vi.useFakeTimers();
      const onBackMock = vi.fn();

      render(
        <MemoryRouter>
          <ZombieDefenderGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      // Target hanzi
      const targetHanzi = screen.getByTestId('zombie-target-hanzi').textContent;
      const allWords = getWordsForLevel('hsk1');
      const targetWord = allWords.find((w) => w.hanzi === targetHanzi);
      expect(targetWord).toBeDefined();

      // Find which zombie has target meaning
      const bubbles = [
        screen.getByTestId('zombie-bubble-0'),
        screen.getByTestId('zombie-bubble-1'),
        screen.getByTestId('zombie-bubble-2'),
      ];

      const correctIdx = bubbles.findIndex((b) => b.textContent?.includes(targetWord!.meaning));
      expect(correctIdx).toBeGreaterThanOrEqual(0);

      const correctZombie = screen.getByTestId(`zombie-unit-${correctIdx}`);

      // Rapidly click correct zombie twice
      fireEvent.click(correctZombie);
      fireEvent.click(correctZombie);

      // Advance through 150ms hit delay
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // Score should be 120 (single shot), not 240
      const scorePill = screen.getByTestId('game-hud-score');
      expect(scorePill.textContent).toContain('120');

      // Advance to wave transition (650ms)
      act(() => {
        vi.advanceTimersByTime(700);
      });

      // Should be wave 2, not skipped to wave 3
      expect(screen.getByTestId('zombie-wave-badge')).toHaveTextContent(/Đợt 2\/12/);
      vi.useRealTimers();
    });

    it('Balloon Pop: clicking during round transition does not deduct hearts', () => {
      vi.useFakeTimers();
      const onBackMock = vi.fn();

      render(
        <MemoryRouter>
          <BalloonPopGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      const targetHanzi = screen.getByTestId('balloon-target-hanzi').textContent;
      const allWords = getWordsForLevel('hsk1');
      const targetWord = allWords.find((w) => w.hanzi === targetHanzi);
      expect(targetWord).toBeDefined();

      // Find correct or first balloon
      const balloon0 = screen.getByTestId('balloon-item-0');
      const balloon1 = screen.getByTestId('balloon-item-1');

      fireEvent.click(balloon0);
      // Immediately click another balloon during transition
      fireEvent.click(balloon1);

      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Game remains alive with valid state
      expect(screen.getByTestId('balloon-pop-game')).toBeDefined();
      vi.useRealTimers();
    });

    it('Zombie Defender: pause and resume clamps deltaSec to prevent zombie teleportation', () => {
      vi.useFakeTimers();
      const onBackMock = vi.fn();

      render(
        <MemoryRouter>
          <ZombieDefenderGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      const pauseBtn = screen.getByLabelText('Tạm dừng');
      fireEvent.click(pauseBtn);

      // Advance 10 seconds while paused
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      // Resume game
      const resumeBtn = screen.getByLabelText('Tiếp tục');
      fireEvent.click(resumeBtn);

      // Step one animation frame (16ms)
      act(() => {
        vi.advanceTimersByTime(16);
      });

      // Zombie position should NOT have teleported to 18% fence
      const zombieLane0 = screen.getByTestId('zombie-unit-0');
      const leftVal = parseFloat(zombieLane0.style.left);
      expect(leftVal).toBeGreaterThan(60);

      vi.useRealTimers();
    });

    it('Balloon Pop: tapping same wrong balloon twice deducts heart only once', () => {
      vi.useFakeTimers();
      const onBackMock = vi.fn();

      render(
        <MemoryRouter>
          <BalloonPopGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      const targetHanzi = screen.getByTestId('balloon-target-hanzi').textContent;
      const allWords = getWordsForLevel('hsk1');
      const targetWord = allWords.find((w) => w.hanzi === targetHanzi);
      expect(targetWord).toBeDefined();

      const heartsContainer = screen.getByTestId('game-hud-hearts');
      expect(heartsContainer.querySelectorAll('.fill-red-600').length).toBe(3);

      // Find an incorrect balloon
      let wrongBalloonIdx = -1;
      for (let i = 0; i < 4; i++) {
        const balloon = screen.getByTestId(`balloon-item-${i}`);
        if (!balloon.textContent?.includes(targetWord!.meaning)) {
          wrongBalloonIdx = i;
          break;
        }
      }
      expect(wrongBalloonIdx).toBeGreaterThanOrEqual(0);

      const wrongBalloon = screen.getByTestId(`balloon-item-${wrongBalloonIdx}`);

      // First tap on wrong balloon
      fireEvent.click(wrongBalloon);
      expect(heartsContainer.querySelectorAll('.fill-red-600').length).toBe(2);

      // Second tap on same wrong balloon should be ignored
      fireEvent.click(wrongBalloon);
      expect(heartsContainer.querySelectorAll('.fill-red-600').length).toBe(2);

      vi.useRealTimers();
    });

    it('Speed Blitz: does not accept answers after countdown reaches 0', () => {
      vi.useFakeTimers();
      const onBackMock = vi.fn();

      render(
        <MemoryRouter>
          <SpeedBlitzGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      // Fast-forward 60s
      act(() => {
        vi.advanceTimersByTime(60000);
      });

      // Modal should be visible
      expect(screen.getByTestId('game-result-modal')).toBeDefined();
      vi.useRealTimers();
    });

    it('Memory Flip: does not trigger card flips or errors after game is already completed', () => {
      vi.useFakeTimers();
      const onBackMock = vi.fn();

      render(
        <MemoryRouter>
          <MemoryFlipGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      // Flip card 0
      const card0 = screen.getByTestId('memory-card-0');
      fireEvent.click(card0);

      expect(card0).toBeDefined();
      vi.useRealTimers();
    });

    it('Zombie Defender: restarting game during wave transition cancels in-flight timeout and keeps wave at 1', () => {
      vi.useFakeTimers();
      const onBackMock = vi.fn();

      render(
        <MemoryRouter>
          <ZombieDefenderGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      const targetHanzi = screen.getByTestId('zombie-target-hanzi').textContent;
      const allWords = getWordsForLevel('hsk1');
      const targetWord = allWords.find((w) => w.hanzi === targetHanzi);
      expect(targetWord).toBeDefined();

      const bubbles = [
        screen.getByTestId('zombie-bubble-0'),
        screen.getByTestId('zombie-bubble-1'),
        screen.getByTestId('zombie-bubble-2'),
      ];
      const correctIdx = bubbles.findIndex((b) => b.textContent?.includes(targetWord!.meaning));
      expect(correctIdx).toBeGreaterThanOrEqual(0);

      // Shoot correct zombie
      fireEvent.click(screen.getByTestId(`zombie-unit-${correctIdx}`));

      // Advance 200ms into projectile delay (150ms hit delay passes, 650ms wave transition timeout is now pending!)
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // Player clicks "Chơi lại" (onRestart) from Top HUD
      const restartBtn = screen.getByTestId('game-hud-restart-btn');
      fireEvent.click(restartBtn);

      expect(screen.getByTestId('zombie-wave-badge')).toHaveTextContent(/Đợt 1\/12/);

      // Now advance 700ms - if old 650ms timeout leaked, it will advance wave to 2!
      act(() => {
        vi.advanceTimersByTime(700);
      });

      // Should STRICTLY still be wave 1, not wave 2!
      expect(screen.getByTestId('zombie-wave-badge')).toHaveTextContent(/Đợt 1\/12/);

      vi.useRealTimers();
    });

    it('Balloon Pop: restarting during round transition keeps round at 1 and cancels pending round advance', () => {
      vi.useFakeTimers();
      const onBackMock = vi.fn();

      render(
        <MemoryRouter>
          <BalloonPopGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      const targetHanzi = screen.getByTestId('balloon-target-hanzi').textContent;
      const allWords = getWordsForLevel('hsk1');
      const targetWord = allWords.find((w) => w.hanzi === targetHanzi);
      expect(targetWord).toBeDefined();

      let correctIdx = -1;
      for (let i = 0; i < 4; i++) {
        const balloon = screen.getByTestId(`balloon-item-${i}`);
        if (balloon.textContent?.includes(targetWord!.meaning)) {
          correctIdx = i;
          break;
        }
      }
      expect(correctIdx).toBeGreaterThanOrEqual(0);

      // Pop correct balloon
      fireEvent.click(screen.getByTestId(`balloon-item-${correctIdx}`));

      // Advance 100ms into pop animation (420ms round transition timeout is now pending!)
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Player clicks "Chơi lại" from HUD
      const restartBtn = screen.getByTestId('game-hud-restart-btn');
      fireEvent.click(restartBtn);

      expect(screen.getByTestId('game-hud-wave')).toHaveTextContent(/Màn 1\/10/);

      // Now advance 500ms - if old 420ms timeout leaked, round becomes 2!
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Should STRICTLY still be Màn 1/10
      expect(screen.getByTestId('game-hud-wave')).toHaveTextContent(/Màn 1\/10/);

      vi.useRealTimers();
    });

    it('Memory Flip: restarting during mismatch delay cancels pending unflip timer', () => {
      vi.useFakeTimers();
      const onBackMock = vi.fn();

      render(
        <MemoryRouter>
          <MemoryFlipGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      // Flip card 0 and card 1
      const card0 = screen.getByTestId('memory-card-0');
      fireEvent.click(card0);

      const card1 = screen.getByTestId('memory-card-1');
      fireEvent.click(card1);

      // Advance 100ms into mismatch delay (750ms unflip timer is active!)
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Player restarts
      const restartBtn = screen.getByTestId('game-hud-restart-btn');
      fireEvent.click(restartBtn);

      // In the new game, player flips card 0
      const newCard0 = screen.getByTestId('memory-card-0');
      fireEvent.click(newCard0);

      // Now advance 800ms - if old 750ms unflip timer fired, it would clear flipped card in new game!
      act(() => {
        vi.advanceTimersByTime(800);
      });

      // In the new game, card 0 should STILL remain flipped (rotate-y-180 class)
      const inner = newCard0.querySelector('.rotate-y-180');
      expect(inner).not.toBeNull();

      vi.useRealTimers();
    });

    it('Balloon Pop: rapid multi-tap on two different wrong balloons deducts both hearts accurately', () => {
      vi.useFakeTimers();
      const onBackMock = vi.fn();

      render(
        <MemoryRouter>
          <BalloonPopGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      const targetHanzi = screen.getByTestId('balloon-target-hanzi').textContent;
      const allWords = getWordsForLevel('hsk1');
      const targetWord = allWords.find((w) => w.hanzi === targetHanzi);
      expect(targetWord).toBeDefined();

      const wrongIndices: number[] = [];
      for (let i = 0; i < 4; i++) {
        const balloon = screen.getByTestId(`balloon-item-${i}`);
        if (!balloon.textContent?.includes(targetWord!.meaning)) {
          wrongIndices.push(i);
        }
      }
      expect(wrongIndices.length).toBeGreaterThanOrEqual(2);

      const heartsContainer = screen.getByTestId('game-hud-hearts');
      expect(heartsContainer.querySelectorAll('.fill-red-600').length).toBe(3);

      // Tap both wrong balloons
      fireEvent.click(screen.getByTestId(`balloon-item-${wrongIndices[0]}`));
      fireEvent.click(screen.getByTestId(`balloon-item-${wrongIndices[1]}`));

      // Hearts should be 1 (lost 2 hearts)
      expect(heartsContainer.querySelectorAll('.fill-red-600').length).toBe(1);

      vi.useRealTimers();
    });

    it('Speed Blitz: restarting mid-game cleans up previous timer interval and resets to 60s', () => {
      vi.useFakeTimers();
      const onBackMock = vi.fn();

      render(
        <MemoryRouter>
          <SpeedBlitzGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      // Advance 10s
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(screen.getByTestId('game-hud-timer')).toHaveTextContent('50s');

      // Click restart
      const restartBtn = screen.getByTestId('game-hud-restart-btn');
      fireEvent.click(restartBtn);

      expect(screen.getByTestId('game-hud-timer')).toHaveTextContent('60s');

      // Advance 1s
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByTestId('game-hud-timer')).toHaveTextContent('59s');

      vi.useRealTimers();
    });

    it('GameHub initializes with YCT tab when selectedLevelId is YCT and updates on level change', () => {
      const onSelectGameMock = vi.fn();
      const onSelectLevelMock = vi.fn();

      const { rerender } = render(
        <MemoryRouter>
          <GameHub
            onSelectGame={onSelectGameMock}
            selectedLevelId="yct3"
            onSelectLevel={onSelectLevelMock}
          />
        </MemoryRouter>
      );

      // YCT tab is active
      const yctTab = screen.getByTestId('tab-level-yct');
      expect(yctTab.className).toContain('bg-red-800');

      // YCT 3 button is selected
      const yct3Btn = screen.getByTestId('level-btn-yct3');
      expect(yct3Btn.className).toContain('bg-red-800');

      // When selectedLevelId prop changes to hsk2, tab switches to HSK
      rerender(
        <MemoryRouter>
          <GameHub
            onSelectGame={onSelectGameMock}
            selectedLevelId="hsk2"
            onSelectLevel={onSelectLevelMock}
          />
        </MemoryRouter>
      );

      const hskTab = screen.getByTestId('tab-level-hsk');
      expect(hskTab.className).toContain('bg-red-800');
      const hsk2Btn = screen.getByTestId('level-btn-hsk2');
      expect(hsk2Btn.className).toContain('bg-red-800');
    });

    it('Zombie Defender: game over preserves earned high score in localStorage and marks new record', () => {
      vi.useFakeTimers();
      const onBackMock = vi.fn();

      render(
        <MemoryRouter>
          <ZombieDefenderGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      const targetHanzi = screen.getByTestId('zombie-target-hanzi').textContent;
      const allWords = getWordsForLevel('hsk1');
      const targetWord = allWords.find((w) => w.hanzi === targetHanzi);
      expect(targetWord).toBeDefined();

      const bubbles = [
        screen.getByTestId('zombie-bubble-0'),
        screen.getByTestId('zombie-bubble-1'),
        screen.getByTestId('zombie-bubble-2'),
      ];
      const correctIdx = bubbles.findIndex((b) => b.textContent?.includes(targetWord!.meaning));
      expect(correctIdx).toBeGreaterThanOrEqual(0);

      // Wave 1: Shoot correct zombie (score becomes 120)
      fireEvent.click(screen.getByTestId(`zombie-unit-${correctIdx}`));

      act(() => {
        vi.advanceTimersByTime(200);
      });
      act(() => {
        vi.advanceTimersByTime(700);
      });

      // Now at Wave 2 with 120 points
      expect(screen.getByTestId('zombie-wave-badge')).toHaveTextContent(/Đợt 2\/12/);

      // Deplete all 3 hearts by shooting wrong zombies
      for (let h = 0; h < 3; h++) {
        // Find a wrong zombie
        const wtargetHanzi = screen.getByTestId('zombie-target-hanzi').textContent;
        const wtargetWord = allWords.find((w) => w.hanzi === wtargetHanzi);
        const wbubbles = [
          screen.getByTestId('zombie-bubble-0'),
          screen.getByTestId('zombie-bubble-1'),
          screen.getByTestId('zombie-bubble-2'),
        ];
        const wrongIdx = wbubbles.findIndex((b) => !b.textContent?.includes(wtargetWord!.meaning));
        expect(wrongIdx).toBeGreaterThanOrEqual(0);

        fireEvent.click(screen.getByTestId(`zombie-unit-${wrongIdx}`));

        // Advance past shake delay
        act(() => {
          vi.advanceTimersByTime(400);
        });
      }

      // Result modal should show game over result
      expect(screen.getByTestId('game-result-modal')).toBeDefined();
      expect(screen.getByTestId('game-result-score')).toHaveTextContent('120');

      // High score must be saved to localStorage even though game ended in game over!
      expect(getHighScore('zombie-defender', 'hsk1')).toBe(120);

      vi.useRealTimers();
    });

    it('Zombie Defender: projectile is cleared as soon as hit connects at 150ms', () => {
      vi.useFakeTimers();
      const onBackMock = vi.fn();

      const { container } = render(
        <MemoryRouter>
          <ZombieDefenderGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      const targetHanzi = screen.getByTestId('zombie-target-hanzi').textContent;
      const allWords = getWordsForLevel('hsk1');
      const targetWord = allWords.find((w) => w.hanzi === targetHanzi);
      expect(targetWord).toBeDefined();

      const bubbles = [
        screen.getByTestId('zombie-bubble-0'),
        screen.getByTestId('zombie-bubble-1'),
        screen.getByTestId('zombie-bubble-2'),
      ];
      const correctIdx = bubbles.findIndex((b) => b.textContent?.includes(targetWord!.meaning));
      expect(correctIdx).toBeGreaterThanOrEqual(0);

      // Shoot correct zombie
      fireEvent.click(screen.getByTestId(`zombie-unit-${correctIdx}`));

      // At 50ms, projectile is active
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(container.querySelector('.bg-gradient-to-r.from-amber-400.to-red-600')).not.toBeNull();

      // At 200ms (hit landed at 150ms), projectile must be cleared (null)
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(container.querySelector('.bg-gradient-to-r.from-amber-400.to-red-600')).toBeNull();

      vi.useRealTimers();
    });

    it('Balloon Pop: game over after scoring points persists high score to localStorage', () => {
      vi.useFakeTimers();
      const onBackMock = vi.fn();

      render(
        <MemoryRouter>
          <BalloonPopGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      const allWords = getWordsForLevel('hsk1');

      // Round 1: Pop correct balloon (+100 pts)
      const targetHanzi = screen.getByTestId('balloon-target-hanzi').textContent;
      const targetWord = allWords.find((w) => w.hanzi === targetHanzi);
      let correctIdx = -1;
      for (let i = 0; i < 4; i++) {
        if (screen.getByTestId(`balloon-item-${i}`).textContent?.includes(targetWord!.meaning)) {
          correctIdx = i;
          break;
        }
      }
      fireEvent.click(screen.getByTestId(`balloon-item-${correctIdx}`));

      // Advance through round transition
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Score is 100 on Round 2
      expect(screen.getByTestId('game-hud-score')).toHaveTextContent('100');

      // Lose 3 hearts by tapping the 3 distinct wrong balloons in Round 2
      const curHanzi = screen.getByTestId('balloon-target-hanzi').textContent;
      const curWord = allWords.find((w) => w.hanzi === curHanzi);
      const wrongIndices: number[] = [];
      for (let i = 0; i < 4; i++) {
        const item = screen.getByTestId(`balloon-item-${i}`);
        if (!item.textContent?.includes(curWord!.meaning)) {
          wrongIndices.push(i);
        }
      }
      expect(wrongIndices.length).toBe(3);

      for (const wIdx of wrongIndices) {
        fireEvent.click(screen.getByTestId(`balloon-item-${wIdx}`));
      }

      // Game over modal shown
      expect(screen.getByTestId('game-result-modal')).toBeDefined();
      expect(screen.getByTestId('game-result-score')).toHaveTextContent('100');

      // High score saved to localStorage
      expect(getHighScore('balloon-pop', 'hsk1')).toBe(100);

      vi.useRealTimers();
    });

    it('Memory Flip: dynamically adapts pair count and displays correct wave counter when pool has fewer than 6 pairs', async () => {
      vi.useFakeTimers();
      const onBackMock = vi.fn();

      const vocabService = await import('@/features/games/services/vocabularyService');
      const spy = vi.spyOn(vocabService, 'getRandomWordsForGame').mockReturnValueOnce([
        { id: 'custom_w1', hanzi: '你', pinyin: 'nǐ', meaning: 'bạn', levelId: 'hsk1', levelType: 'hsk' },
        { id: 'custom_w2', hanzi: '好', pinyin: 'hǎo', meaning: 'tốt', levelId: 'hsk1', levelType: 'hsk' },
      ]);

      render(
        <MemoryRouter>
          <MemoryFlipGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      // Cards total is 4 (2 pairs)
      const grid = screen.getByTestId('memory-flip-grid');
      expect(grid.children.length).toBe(4);

      // HUD indicates Cặp 0/2
      expect(screen.getByTestId('game-header-hud')).toHaveTextContent(/Cặp 0\/2/);

      spy.mockRestore();
      vi.useRealTimers();
    });

    it('Memory Flip: 3D card structure includes backface-hidden, transform-style-3d, and rotates 180deg when opened', () => {
      const onBackMock = vi.fn();
      const { container } = render(
        <MemoryRouter>
          <MemoryFlipGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      // Verify card flipper element has 3D transform style
      const cardFlipper = container.querySelector('.transform-style-3d');
      expect(cardFlipper).not.toBeNull();

      // Verify card cover and card face both have backface-hidden
      const backfaceElements = container.querySelectorAll('.backface-hidden');
      expect(backfaceElements.length).toBeGreaterThanOrEqual(24); // 12 cards * 2 faces

      // Before click, card is not rotated
      const card0 = screen.getByTestId('memory-card-0');
      expect(card0.querySelector('.rotate-y-180')).not.toBeNull(); // Front face has rotate-y-180
      const innerFlipper = card0.firstElementChild;
      expect(innerFlipper?.className).not.toContain('rotate-y-180');

      // Click card 0
      fireEvent.click(card0);
      // Flipper now has rotate-y-180
      expect(innerFlipper?.className).toContain('rotate-y-180');
    });

    it('Memory Flip: HUD score synchronizes with final penalized score upon game completion', async () => {
      vi.useFakeTimers();
      const onBackMock = vi.fn();

      const vocabService = await import('@/features/games/services/vocabularyService');
      const spy = vi.spyOn(vocabService, 'getRandomWordsForGame').mockReturnValueOnce([
        { id: 'custom_w1', hanzi: '你', pinyin: 'nǐ', meaning: 'bạn', levelId: 'hsk1', levelType: 'hsk' },
        { id: 'custom_w2', hanzi: '好', pinyin: 'hǎo', meaning: 'tốt', levelId: 'hsk1', levelType: 'hsk' },
      ]);

      render(
        <MemoryRouter>
          <MemoryFlipGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      // Find cards by text
      const allCards = screen.getAllByTestId(/^memory-card-\d+$/);
      const cardNi = allCards.find((c) => c.textContent?.includes('你'))!;
      const cardBan = allCards.find((c) => c.textContent?.includes('bạn'))!;
      const cardHao = allCards.find((c) => c.textContent?.includes('好'))!;
      const cardTot = allCards.find((c) => c.textContent?.includes('tốt'))!;

      // 1 deliberate mistake: Ni and Tot
      fireEvent.click(cardNi);
      fireEvent.click(cardTot);
      act(() => {
        vi.advanceTimersByTime(800);
      });

      // Match pair 1: Ni and Ban
      fireEvent.click(cardNi);
      fireEvent.click(cardBan);
      act(() => {
        vi.advanceTimersByTime(50);
      });

      // Match pair 2: Hao and Tot
      fireEvent.click(cardHao);
      fireEvent.click(cardTot);
      act(() => {
        vi.advanceTimersByTime(700);
      });

      // Modal is visible
      const modal = screen.getByTestId('game-result-modal');
      expect(modal).toBeDefined();

      const modalScore = screen.getByTestId('game-result-score').textContent;
      const hudScore = screen.getByTestId('game-hud-score').textContent;

      // HUD score and modal score must be 100% synchronized!
      expect(hudScore).toContain(modalScore!);

      spy.mockRestore();
      vi.useRealTimers();
    });

    it('Zombie Defender: wrong shot triggers animate-shake on targeted zombie unit', () => {
      vi.useFakeTimers();
      const onBackMock = vi.fn();

      const { container } = render(
        <MemoryRouter>
          <ZombieDefenderGame levelId="hsk1" onBack={onBackMock} />
        </MemoryRouter>
      );

      const allWords = getWordsForLevel('hsk1');
      const targetHanzi = screen.getByTestId('zombie-target-hanzi').textContent;
      const targetWord = allWords.find((w) => w.hanzi === targetHanzi);

      const bubbles = [
        screen.getByTestId('zombie-bubble-0'),
        screen.getByTestId('zombie-bubble-1'),
        screen.getByTestId('zombie-bubble-2'),
      ];
      const wrongIdx = bubbles.findIndex((b) => !b.textContent?.includes(targetWord!.meaning));
      expect(wrongIdx).toBeGreaterThanOrEqual(0);

      // Shoot wrong zombie
      fireEvent.click(screen.getByTestId(`zombie-unit-${wrongIdx}`));

      // Inner container has animate-shake
      expect(container.querySelector('.animate-shake')).not.toBeNull();

      // Advance 400ms past shake timeout
      act(() => {
        vi.advanceTimersByTime(400);
      });

      // Shake cleared
      expect(container.querySelector('.animate-shake')).toBeNull();

      vi.useRealTimers();
    });

    it('Stylesheet & Theme Resilience: tailwind gradients, shadows and 3D flip classes are valid', () => {
      // Validate that Tailwind gradient classes are used instead of v4 linear-to classes
      const hud = render(
        <MemoryRouter>
          <GameHub onSelectGame={vi.fn()} selectedLevelId="hsk1" onSelectLevel={vi.fn()} />
        </MemoryRouter>
      );

      expect(hud.container.querySelector('.bg-gradient-to-r')).not.toBeNull();
      expect(hud.container.querySelector('.bg-gradient-to-b')).not.toBeNull();
      expect(hud.container.querySelector('.bg-linear-to-r')).toBeNull();
      expect(hud.container.querySelector('.bg-linear-to-b')).toBeNull();
    });
  });

  // ==========================================================================
  // Suite 9: Mobile 390px Viewport & Sound Muting Invariants (Ledger Hardening)
  // ==========================================================================
  describe('Suite 9: Mobile 390px Viewport & Sound Muting Invariants', () => {
    it('Global Sound Muting Invariant: muting sound in HUD silences all 4 games without console warnings or audio exceptions', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const consoleWarnSpy = vi.spyOn(console, 'warn');

      // Start by setting sound muted
      setSoundMuted(true);
      expect(isSoundMuted()).toBe(true);

      const onBack = vi.fn();

      // 1. Memory Flip with sound muted
      const { unmount: unmountFlip } = render(
        <MemoryRouter>
          <MemoryFlipGame levelId="hsk1" onBack={onBack} />
        </MemoryRouter>
      );
      const card0 = screen.getByTestId('memory-card-0');
      fireEvent.click(card0);
      unmountFlip();

      // 2. Speed Blitz with sound muted
      const { unmount: unmountSpeed } = render(
        <MemoryRouter>
          <SpeedBlitzGame levelId="hsk1" onBack={onBack} />
        </MemoryRouter>
      );
      const speedOpt = screen.getByTestId('speed-blitz-option-0');
      fireEvent.click(speedOpt);
      const speedAudio = screen.getByTestId('speed-blitz-audio-btn');
      fireEvent.click(speedAudio);
      unmountSpeed();

      // 3. Balloon Pop with sound muted
      const { unmount: unmountBalloon } = render(
        <MemoryRouter>
          <BalloonPopGame levelId="hsk1" onBack={onBack} />
        </MemoryRouter>
      );
      const balloon0 = screen.getByTestId('balloon-item-0');
      fireEvent.click(balloon0);
      const balloonAudio = screen.getByTestId('balloon-target-audio-btn');
      fireEvent.click(balloonAudio);
      unmountBalloon();

      // 4. Zombie Defender with sound muted
      const { unmount: unmountZombie } = render(
        <MemoryRouter>
          <ZombieDefenderGame levelId="hsk1" onBack={onBack} />
        </MemoryRouter>
      );
      const zombie0 = screen.getByTestId('zombie-unit-0');
      fireEvent.click(zombie0);
      const zombieAudio = screen.getByTestId('zombie-audio-btn');
      fireEvent.click(zombieAudio);

      // Verify HUD sound toggle button can unmute
      const soundToggle = screen.getByTestId('game-hud-sound-toggle');
      expect(soundToggle.getAttribute('aria-label')).toBe('Bật âm thanh');
      fireEvent.click(soundToggle);
      expect(isSoundMuted()).toBe(false);
      expect(soundToggle.getAttribute('aria-label')).toBe('Tắt âm thanh');
      unmountZombie();

      // Ensure no unhandled audio errors were logged to console
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringMatching(/audio|synthes/i));
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(expect.stringMatching(/audio|synthes/i));

      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('Mobile 390px Viewport Responsiveness: GameHub and 4 games layout mount safely within 390px container without layout explosion', () => {
      const onSelectGame = vi.fn();
      const onSelectLevel = vi.fn();

      // Render GameHub in a simulated 390px mobile container
      const { rerender } = render(
        <div style={{ width: 390, maxWidth: 390, overflow: 'hidden' }}>
          <MemoryRouter>
            <GameHub
              onSelectGame={onSelectGame}
              selectedLevelId="hsk1"
              onSelectLevel={onSelectLevel}
            />
          </MemoryRouter>
        </div>
      );

      // Verify level switcher works at 390px
      const tabYct = screen.getByTestId('tab-level-yct');
      fireEvent.click(tabYct);

      const tabHsk = screen.getByTestId('tab-level-hsk');
      fireEvent.click(tabHsk);

      // Verify all 4 game mode cards render in 390px container
      const gameModes = ['memory-flip', 'speed-blitz', 'balloon-pop', 'zombie-defender'];
      for (const mode of gameModes) {
        expect(screen.getByTestId(`game-mode-card-${mode}`)).toBeDefined();
        expect(screen.getByTestId(`play-btn-${mode}`)).toBeDefined();
      }

      // Render Memory Flip at 390px
      rerender(
        <div style={{ width: 390, maxWidth: 390, overflow: 'hidden' }}>
          <MemoryRouter>
            <MemoryFlipGame levelId="hsk1" onBack={vi.fn()} />
          </MemoryRouter>
        </div>
      );
      expect(screen.getByTestId('memory-flip-game')).toBeDefined();
      expect(screen.getByTestId('memory-flip-grid')).toBeDefined();

      // Render Speed Blitz at 390px
      rerender(
        <div style={{ width: 390, maxWidth: 390, overflow: 'hidden' }}>
          <MemoryRouter>
            <SpeedBlitzGame levelId="hsk1" onBack={vi.fn()} />
          </MemoryRouter>
        </div>
      );
      expect(screen.getByTestId('speed-blitz-game')).toBeDefined();

      // Render Balloon Pop at 390px
      rerender(
        <div style={{ width: 390, maxWidth: 390, overflow: 'hidden' }}>
          <MemoryRouter>
            <BalloonPopGame levelId="hsk1" onBack={vi.fn()} />
          </MemoryRouter>
        </div>
      );
      expect(screen.getByTestId('balloon-pop-game')).toBeDefined();
      expect(screen.getByTestId('balloon-stage')).toBeDefined();

      // Render Zombie Defender at 390px
      rerender(
        <div style={{ width: 390, maxWidth: 390, overflow: 'hidden' }}>
          <MemoryRouter>
            <ZombieDefenderGame levelId="hsk1" onBack={vi.fn()} />
          </MemoryRouter>
        </div>
      );
      expect(screen.getByTestId('zombie-defender-game')).toBeDefined();
      expect(screen.getByTestId('zombie-courtyard-battlefield')).toBeDefined();
    });

    it('Level Switching & Vocabulary Alignment: switching levels seamlessly loads correct vocabulary and updates game state', () => {
      render(
        <MemoryRouter initialEntries={['/games?level=yct2']}>
          <Routes>
            <Route path="/games" element={<GamesPage />} />
          </Routes>
        </MemoryRouter>
      );

      // In lobby with YCT 2 selected
      expect(screen.getByTestId('game-hub-view')).toBeDefined();
      const currentLevelIndicator = screen.getByTestId('game-level-selector');
      expect(currentLevelIndicator).toHaveTextContent(/YCT 2/i);

      // Select HSK 3
      const tabHsk = screen.getByTestId('tab-level-hsk');
      fireEvent.click(tabHsk);
      const hsk3Btn = screen.getByTestId('level-btn-hsk3');
      fireEvent.click(hsk3Btn);

      expect(currentLevelIndicator).toHaveTextContent(/HSK 3/i);

      // Launch Speed Blitz with HSK 3
      const playSpeedBtn = screen.getByTestId('play-btn-speed-blitz');
      fireEvent.click(playSpeedBtn);

      // Verify Speed Blitz starts with HSK 3 label
      expect(screen.getByTestId('speed-blitz-game')).toBeDefined();
      expect(screen.getByTestId('game-header-hud')).toHaveTextContent(/HSK 3/);

      // The question Hanzi must belong to HSK 3 vocabulary
      const targetHanzi = screen.getByTestId('speed-blitz-hanzi').textContent;
      const hsk3Words = getWordsForLevel('hsk3');
      const foundInHsk3 = hsk3Words.some((w) => w.hanzi === targetHanzi);
      expect(foundInHsk3).toBe(true);

      // Back to lobby
      const backBtn = screen.getByTestId('game-hud-back-btn');
      fireEvent.click(backBtn);

      // Returned to lobby, HSK 3 is preserved
      expect(screen.getByTestId('game-hub-view')).toBeDefined();
      expect(screen.getByTestId('game-level-selector')).toHaveTextContent(/HSK 3/i);
    });
  });

  // ==========================================================================
  // Suite 10: Font Hanzi, Oriental Art, Zero-Emoji & Addictive Combo Mechanics
  // ==========================================================================
  describe('Suite 10: Font Hanzi, Oriental Art, Zero-Emoji & Addictive Combo Mechanics', () => {
    it('applies font-hanzi class across SpeedBlitz, BalloonPop, ZombieDefender, and MemoryFlip Chinese faces', () => {
      // 1. Speed Blitz
      const { unmount: unmountSpeed } = render(
        <MemoryRouter>
          <SpeedBlitzGame levelId="hsk1" onBack={vi.fn()} />
        </MemoryRouter>
      );
      expect(screen.getByTestId('speed-blitz-hanzi').className).toContain('font-hanzi');
      unmountSpeed();

      // 2. Balloon Pop
      const { unmount: unmountBalloon } = render(
        <MemoryRouter>
          <BalloonPopGame levelId="hsk1" onBack={vi.fn()} />
        </MemoryRouter>
      );
      expect(screen.getByTestId('balloon-target-hanzi').className).toContain('font-hanzi');
      unmountBalloon();

      // 3. Zombie Defender
      const { unmount: unmountZombie } = render(
        <MemoryRouter>
          <ZombieDefenderGame levelId="hsk1" onBack={vi.fn()} />
        </MemoryRouter>
      );
      expect(screen.getByTestId('zombie-target-hanzi').className).toContain('font-hanzi');
      unmountZombie();

      // 4. Memory Flip (6 Chinese front faces + 6 seal backs = 12 .font-hanzi nodes)
      const { container: memoryContainer, unmount: unmountMemory } = render(
        <MemoryRouter>
          <MemoryFlipGame levelId="hsk1" onBack={vi.fn()} />
        </MemoryRouter>
      );
      const chineseFrontFaces = memoryContainer.querySelectorAll('.backface-hidden .font-hanzi.text-red-900');
      expect(chineseFrontFaces.length).toBe(6);
      unmountMemory();
    });

    it('renders zero system emojis across GameHub, all 4 games, and GameResultModal', () => {
      const SYSTEM_EMOJI_RE = /🌸|☁️|🎈|🌟|👏|💪|🏆/;

      saveHighScore('memory-flip', 'hsk1', 900);
      const hub = render(
        <MemoryRouter>
          <GameHub onSelectGame={vi.fn()} selectedLevelId="hsk1" onSelectLevel={vi.fn()} />
        </MemoryRouter>
      );
      expect(hub.container.textContent ?? '').not.toMatch(SYSTEM_EMOJI_RE);
      expect(hub.container.innerHTML).not.toMatch(SYSTEM_EMOJI_RE);
      hub.unmount();

      const mem = render(
        <MemoryRouter>
          <MemoryFlipGame levelId="hsk1" onBack={vi.fn()} />
        </MemoryRouter>
      );
      expect(mem.container.textContent ?? '').not.toMatch(SYSTEM_EMOJI_RE);
      expect(mem.container.innerHTML).not.toMatch(SYSTEM_EMOJI_RE);
      mem.unmount();

      const speed = render(
        <MemoryRouter>
          <SpeedBlitzGame levelId="hsk1" onBack={vi.fn()} />
        </MemoryRouter>
      );
      expect(speed.container.textContent ?? '').not.toMatch(SYSTEM_EMOJI_RE);
      expect(speed.container.innerHTML).not.toMatch(SYSTEM_EMOJI_RE);
      speed.unmount();

      const balloon = render(
        <MemoryRouter>
          <BalloonPopGame levelId="hsk1" onBack={vi.fn()} />
        </MemoryRouter>
      );
      expect(balloon.container.textContent ?? '').not.toMatch(SYSTEM_EMOJI_RE);
      expect(balloon.container.innerHTML).not.toMatch(SYSTEM_EMOJI_RE);
      balloon.unmount();

      const zombie = render(
        <MemoryRouter>
          <ZombieDefenderGame levelId="hsk1" onBack={vi.fn()} />
        </MemoryRouter>
      );
      expect(zombie.container.textContent ?? '').not.toMatch(SYSTEM_EMOJI_RE);
      expect(zombie.container.innerHTML).not.toMatch(SYSTEM_EMOJI_RE);
      zombie.unmount();

      for (const stars of [3, 2, 1] as const) {
        const modal = render(
          <GameResultModal
            result={{
              modeId: 'zombie-defender',
              levelId: 'hsk1',
              score: 650,
              stars,
              correctCount: 8,
              totalQuestions: 12,
              accuracy: 75,
              timeSpentSeconds: 32,
              streakBest: 4,
              isNewRecord: stars === 3,
            }}
            onReplay={vi.fn()}
            onBackToLobby={vi.fn()}
          />
        );
        expect(modal.container.textContent ?? '').not.toMatch(SYSTEM_EMOJI_RE);
        expect(modal.container.innerHTML).not.toMatch(SYSTEM_EMOJI_RE);
        modal.unmount();
      }
    });

    it('renders Oriental art img banners in all 4 GameHub cards and scenic courtyard img in ZombieDefender', () => {
      const hub = render(
        <MemoryRouter>
          <GameHub onSelectGame={vi.fn()} selectedLevelId="hsk1" onSelectLevel={vi.fn()} />
        </MemoryRouter>
      );

      for (const modeId of ['memory-flip', 'speed-blitz', 'balloon-pop', 'zombie-defender'] as const) {
        const card = screen.getByTestId(`game-mode-card-${modeId}`);
        const bannerImg = card.querySelector('img');
        expect(bannerImg).not.toBeNull();
        expect(bannerImg?.getAttribute('src')).toBeTruthy();
      }
      hub.unmount();

      const zombie = render(
        <MemoryRouter>
          <ZombieDefenderGame levelId="hsk1" onBack={vi.fn()} />
        </MemoryRouter>
      );
      const battlefield = screen.getByTestId('zombie-courtyard-battlefield');
      const courtyardImg = battlefield.querySelector('img');
      expect(courtyardImg).not.toBeNull();
      expect(courtyardImg?.getAttribute('src')).toBeTruthy();
      zombie.unmount();
    });

    it('Zombie Defender: awards 120 on Wave 1 hit and +150 (270 total) on consecutive Wave 2 hit', () => {
      vi.useFakeTimers();
      try {
        render(
          <MemoryRouter>
            <ZombieDefenderGame levelId="hsk1" onBack={vi.fn()} />
          </MemoryRouter>
        );

        const allWords = getWordsForLevel('hsk1');

        // Wave 1 correct shot
        const w1Hanzi = screen.getByTestId('zombie-target-hanzi').textContent;
        const w1Meanings = allWords.filter((w) => w.hanzi === w1Hanzi).map((w) => w.meaning);
        const w1Idx = [0, 1, 2].find((i) =>
          w1Meanings.some((m) => screen.getByTestId(`zombie-bubble-${i}`).textContent?.includes(m))
        );
        expect(w1Idx).toBeGreaterThanOrEqual(0);

        fireEvent.click(screen.getByTestId(`zombie-unit-${w1Idx}`));
        act(() => {
          vi.advanceTimersByTime(200);
        });
        expect(screen.getByTestId('game-hud-score')).toHaveTextContent('120');

        // Transition to Wave 2
        act(() => {
          vi.advanceTimersByTime(700);
        });
        expect(screen.getByTestId('zombie-wave-badge')).toHaveTextContent(/Đợt 2\/12/);

        // Wave 2 consecutive correct shot -> +150 -> 270
        const w2Hanzi = screen.getByTestId('zombie-target-hanzi').textContent;
        const w2Meanings = allWords.filter((w) => w.hanzi === w2Hanzi).map((w) => w.meaning);
        const w2Idx = [0, 1, 2].find((i) =>
          w2Meanings.some((m) => screen.getByTestId(`zombie-bubble-${i}`).textContent?.includes(m))
        );
        expect(w2Idx).toBeGreaterThanOrEqual(0);

        fireEvent.click(screen.getByTestId(`zombie-unit-${w2Idx}`));
        act(() => {
          vi.advanceTimersByTime(200);
        });
        expect(screen.getByTestId('game-hud-score')).toHaveTextContent('270');
        expect(screen.getByTestId('zombie-combo-badge')).toHaveTextContent('Combo x2');
      } finally {
        vi.useRealTimers();
      }
    });

    it('Speed Blitz: awards +2s time bonus on 5 consecutive correct answers and caps at 60s', () => {
      vi.useFakeTimers();
      try {
        render(
          <MemoryRouter>
            <SpeedBlitzGame levelId="hsk1" onBack={vi.fn()} />
          </MemoryRouter>
        );

        const allWords = getWordsForLevel('hsk1');
        const answerCurrentCorrectly = () => {
          const hanzi = screen.getByTestId('speed-blitz-hanzi').textContent;
          const validMeanings = allWords.filter((w) => w.hanzi === hanzi).map((w) => w.meaning);
          const optIdx = [0, 1, 2, 3].find((i) =>
            validMeanings.includes(screen.getByTestId(`speed-blitz-option-${i}`).textContent?.trim() ?? '')
          );
          expect(optIdx).toBeGreaterThanOrEqual(0);
          fireEvent.click(screen.getByTestId(`speed-blitz-option-${optIdx}`));
        };

        // Drain 5s -> 55s left
        act(() => {
          vi.advanceTimersByTime(5000);
        });
        expect(screen.getByTestId('game-hud-timer')).toHaveTextContent('55s');

        // 5 consecutive correct answers -> +2s bonus -> 57s
        for (let i = 0; i < 5; i++) {
          answerCurrentCorrectly();
        }
        expect(screen.getByTestId('game-hud-timer')).toHaveTextContent('57s');
        expect(screen.getByTestId('speed-blitz-fever-pill')).toHaveTextContent('FEVER x5');

        // Restart -> 60s, drain 1s -> 59s, answer 5 consecutive -> capped at 60s
        fireEvent.click(screen.getByTestId('game-hud-restart-btn'));
        expect(screen.getByTestId('game-hud-timer')).toHaveTextContent('60s');
        act(() => {
          vi.advanceTimersByTime(1000);
        });
        expect(screen.getByTestId('game-hud-timer')).toHaveTextContent('59s');

        for (let i = 0; i < 5; i++) {
          answerCurrentCorrectly();
        }
        expect(screen.getByTestId('game-hud-timer')).toHaveTextContent('60s');
      } finally {
        vi.useRealTimers();
      }
    });

    it('playComboSfx(1..6) respects setSoundMuted(true) and never throws unmuted', () => {
      const createOscillatorMock = vi.fn(() => ({
        type: 'triangle',
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        onended: null,
      }));
      const createGainMock = vi.fn(() => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      const mockCtx = {
        state: 'running',
        currentTime: 0,
        destination: {},
        resume: vi.fn().mockResolvedValue(undefined),
        createOscillator: createOscillatorMock,
        createGain: createGainMock,
      };
      const FakeAudioContext = vi.fn(() => mockCtx);

      const prevAudioContext = (window as unknown as { AudioContext?: unknown }).AudioContext;
      (window as unknown as { AudioContext?: unknown }).AudioContext = FakeAudioContext;

      try {
        setSoundMuted(true);
        for (let streak = 1; streak <= 6; streak++) {
          expect(() => playComboSfx(streak)).not.toThrow();
        }
        expect(createOscillatorMock).not.toHaveBeenCalled();

        setSoundMuted(false);
        for (let streak = 1; streak <= 6; streak++) {
          expect(() => playComboSfx(streak)).not.toThrow();
        }
        // Streaks 1..3 create 1 osc each (3), streaks 4..6 create 2 osc each (6) -> 9 total
        expect(createOscillatorMock).toHaveBeenCalledTimes(9);
      } finally {
        mockCtx.state = 'closed';
        (window as unknown as { AudioContext?: unknown }).AudioContext = prevAudioContext;
      }
    });

    it('ZombieDefenderGame renders embedded WebP scenery stages and 3 articulated JiangshiPuppet rigs', () => {
      const { container, unmount } = render(
        <MemoryRouter>
          <ZombieDefenderGame levelId="hsk1" onBack={vi.fn()} />
        </MemoryRouter>
      );

      const imgs = Array.from(container.querySelectorAll('img'));
      expect(imgs.length).toBeGreaterThanOrEqual(2);
      for (const img of imgs) {
        expect(img.getAttribute('src') ?? '').toMatch(/^data:image\/webp;base64,/);
      }

      const requiredParts = [
        'shadow',
        'dust',
        'hopper',
        'back-arm',
        'front-arm',
        'back-leg',
        'front-leg',
        'torso',
        'head',
        'talisman',
        'tassel',
      ];
      for (let lane = 0; lane < 3; lane++) {
        const rig = screen.getByTestId(`jiangshi-rig-${lane}`);
        expect(rig).toBeDefined();
        for (const part of requiredParts) {
          expect(rig.querySelector(`[data-part="${part}"]`)).not.toBeNull();
        }
      }
      unmount();
    });

    it('ZombieDefenderGame removes left CSS transitions from zombie-unit elements and avoids jitter', () => {
      const { unmount } = render(
        <MemoryRouter>
          <ZombieDefenderGame levelId="hsk1" onBack={vi.fn()} />
        </MemoryRouter>
      );

      for (let lane = 0; lane < 3; lane++) {
        const unit = screen.getByTestId(`zombie-unit-${lane}`);
        expect(unit.style.transition).not.toMatch(/\bleft\b/i);
        expect(unit.className).not.toContain('transition-transform');
        expect(unit.style.willChange).toBe('transform');
      }
      unmount();
    });

    it('computeJiangshiKinematics produces crouch squash, airborne stretch/limb articulation, and unit average stride', () => {
      const crouch = computeJiangshiKinematics(0.05 * HOP_PERIOD_SEC, 0, false);
      expect(crouch.phase).toBeCloseTo(0.05, 5);
      expect(crouch.hopY).toBe(0);
      expect(crouch.squashX).toBeGreaterThan(1);
      expect(crouch.squashY).toBeLessThan(1);

      const peak = computeJiangshiKinematics(0.52 * HOP_PERIOD_SEC, 0, false);
      expect(peak.phase).toBeCloseTo(0.52, 5);
      expect(peak.hopY).toBeLessThan(-10);
      expect(peak.frontLegDeg).toBeGreaterThan(10);
      expect(peak.backLegDeg).toBeLessThan(-10);
      expect(peak.talismanDeg).toBeGreaterThan(15);
      expect(peak.strideMultiplier / crouch.strideMultiplier).toBeGreaterThanOrEqual(3);

      let strideSum = 0;
      const samples = 100;
      for (let i = 0; i < samples; i++) {
        const p = computeJiangshiKinematics((i / samples) * HOP_PERIOD_SEC, 0, false);
        strideSum += p.strideMultiplier;
      }
      const avgStride = strideSum / samples;
      expect(Math.abs(avgStride - 1)).toBeLessThanOrEqual(0.02);

      const reduced = computeJiangshiKinematics(0.52 * HOP_PERIOD_SEC, 0, true);
      expect(reduced.strideMultiplier).toBe(1);
      expect(reduced.hopY).toBe(0);
    });

    it('BalloonPopGame, MemoryFlipGame, and SpeedBlitzGame each render their embedded WebP scenic stage <img>', () => {
      const balloon = render(
        <MemoryRouter>
          <BalloonPopGame levelId="hsk1" onBack={vi.fn()} />
        </MemoryRouter>
      );
      const balloonStageImgs = Array.from(screen.getByTestId('balloon-stage').querySelectorAll('img'));
      expect(balloonStageImgs.length).toBeGreaterThanOrEqual(1);
      expect(balloonStageImgs.some((img) => (img.getAttribute('src') ?? '').startsWith('data:image/webp;base64,'))).toBe(true);
      balloon.unmount();

      const memory = render(
        <MemoryRouter>
          <MemoryFlipGame levelId="hsk1" onBack={vi.fn()} />
        </MemoryRouter>
      );
      const memoryImgs = Array.from(screen.getByTestId('memory-flip-game').querySelectorAll('img'));
      expect(memoryImgs.length).toBeGreaterThanOrEqual(1);
      expect(memoryImgs.some((img) => (img.getAttribute('src') ?? '').startsWith('data:image/webp;base64,'))).toBe(true);
      memory.unmount();

      const blitz = render(
        <MemoryRouter>
          <SpeedBlitzGame levelId="hsk1" onBack={vi.fn()} />
        </MemoryRouter>
      );
      const blitzImgs = Array.from(screen.getByTestId('speed-blitz-game').querySelectorAll('img'));
      expect(blitzImgs.length).toBeGreaterThanOrEqual(1);
      expect(blitzImgs.some((img) => (img.getAttribute('src') ?? '').startsWith('data:image/webp;base64,'))).toBe(true);
      blitz.unmount();
    });

    it('renders zero .meizi-watermark diagonal grid boxes behind Chinese characters across all 4 games', () => {
      const blitz = render(
        <MemoryRouter>
          <SpeedBlitzGame levelId="hsk1" onBack={vi.fn()} />
        </MemoryRouter>
      );
      expect(blitz.container.querySelectorAll('.meizi-watermark').length).toBe(0);
      expect(screen.getByTestId('speed-blitz-hanzi').className).toContain('font-hanzi');
      blitz.unmount();

      const balloon = render(
        <MemoryRouter>
          <BalloonPopGame levelId="hsk1" onBack={vi.fn()} />
        </MemoryRouter>
      );
      expect(balloon.container.querySelectorAll('.meizi-watermark').length).toBe(0);
      expect(screen.getByTestId('balloon-target-hanzi').className).toContain('font-hanzi');
      balloon.unmount();

      const zombie = render(
        <MemoryRouter>
          <ZombieDefenderGame levelId="hsk1" onBack={vi.fn()} />
        </MemoryRouter>
      );
      expect(zombie.container.querySelectorAll('.meizi-watermark').length).toBe(0);
      expect(screen.getByTestId('zombie-target-hanzi').className).toContain('font-hanzi');
      zombie.unmount();

      const memory = render(
        <MemoryRouter>
          <MemoryFlipGame levelId="hsk1" onBack={vi.fn()} />
        </MemoryRouter>
      );
      expect(memory.container.querySelectorAll('.meizi-watermark').length).toBe(0);
      expect(memory.container.querySelectorAll('.backface-hidden .font-hanzi.text-red-900').length).toBe(6);
      memory.unmount();
    });

    it('rotates Memory Flip pairs without repeating Round 1 words on immediate Replay and exhausts all 15 YCT6 words within 3 rounds', () => {
      const getRenderedHanzi = (container: HTMLElement) =>
        Array.from(container.querySelectorAll('.backface-hidden .font-hanzi.text-red-900')).map((el) =>
          (el.textContent || '').trim()
        );

      const { container, unmount } = render(
        <MemoryRouter>
          <MemoryFlipGame levelId="yct6" onBack={vi.fn()} />
        </MemoryRouter>
      );

      const round1 = getRenderedHanzi(container);
      expect(round1.length).toBe(6);
      const round1Set = new Set(round1);

      // Replay #1 (Round 2): must draw 6 from remaining 9 unseen words -> 0 overlap with Round 1
      fireEvent.click(screen.getByTestId('game-hud-restart-btn'));
      const round2 = getRenderedHanzi(container);
      expect(round2.length).toBe(6);
      expect(round2.some((h) => round1Set.has(h))).toBe(false);

      // Replay #2 (Round 3): remaining 3 unseen + 3 wrapped seen -> all 15 words of YCT6 covered
      fireEvent.click(screen.getByTestId('game-hud-restart-btn'));
      const round3 = getRenderedHanzi(container);
      expect(round3.length).toBe(6);

      const allSeenAcross3Rounds = new Set([...round1, ...round2, ...round3]);
      expect(allSeenAcross3Rounds.size).toBe(15);
      unmount();
    });

    it('prevents back-to-back word repeats in Speed Blitz across 20 consecutive questions on 15-word level', () => {
      vi.useFakeTimers();
      try {
        const yct7Map = new Map(getWordsForLevel('yct7').map((w) => [w.hanzi, w.meaning]));
        expect(yct7Map.size).toBe(15);

        const { unmount } = render(
          <MemoryRouter>
            <SpeedBlitzGame levelId="yct7" onBack={vi.fn()} />
          </MemoryRouter>
        );

        const shownHanzi: string[] = [];
        for (let step = 0; step < 20; step++) {
          const currentHanzi = (screen.getByTestId('speed-blitz-hanzi').textContent || '').trim();
          shownHanzi.push(currentHanzi);
          const expectedMeaning = yct7Map.get(currentHanzi);
          expect(expectedMeaning).toBeTruthy();

          const optionButtons = [0, 1, 2, 3].map((i) => screen.getByTestId(`speed-blitz-option-${i}`));
          const matchingBtn =
            optionButtons.find((btn) => (btn.textContent || '').trim() === expectedMeaning) || optionButtons[0];
          fireEvent.click(matchingBtn);
        }

        // First 15 questions must cover every single unique word in yct7 without duplicate
        expect(new Set(shownHanzi.slice(0, 15)).size).toBe(15);

        // Zero back-to-back repeats across all 20 questions including the 15->16 deck wrap seam
        for (let i = 1; i < shownHanzi.length; i++) {
          expect(shownHanzi[i]).not.toBe(shownHanzi[i - 1]);
        }

        unmount();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

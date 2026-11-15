import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GameHub } from './GameHub';
import { MemoryFlipGame } from './games/MemoryFlipGame';
import { SpeedBlitzGame } from './games/SpeedBlitzGame';
import { BalloonPopGame } from './games/BalloonPopGame';
import { ZombieDefenderGame } from './games/ZombieDefenderGame';
import { syncRemoteVocabulary } from '../services/vocabularyService';
import type { GameModeId } from '../types/game.types';

export const GamesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const urlGame = searchParams.get('game') as GameModeId | null;
  const urlLevel = searchParams.get('level') || 'hsk1';

  const [activeGame, setActiveGame] = useState<GameModeId | null>(urlGame);
  const [selectedLevelId, setSelectedLevelId] = useState<string>(urlLevel);

  // Sync state with URL params
  useEffect(() => {
    if (urlGame && ['memory-flip', 'speed-blitz', 'balloon-pop', 'zombie-defender'].includes(urlGame)) {
      setActiveGame(urlGame);
    } else {
      setActiveGame(null);
    }
  }, [urlGame]);

  useEffect(() => {
    if (urlLevel) {
      setSelectedLevelId(urlLevel);
      // Background sync dynamic vocabulary for this level
      syncRemoteVocabulary(urlLevel).catch(() => null);
    }
  }, [urlLevel]);

  const handleSelectGame = (modeId: GameModeId, levelId: string) => {
    setActiveGame(modeId);
    setSelectedLevelId(levelId);
    setSearchParams({ game: modeId, level: levelId });
  };

  const handleSelectLevel = (levelId: string) => {
    setSelectedLevelId(levelId);
    const nextParams: Record<string, string> = { level: levelId };
    if (activeGame) nextParams.game = activeGame;
    setSearchParams(nextParams);
    syncRemoteVocabulary(levelId).catch(() => null);
  };

  const handleBackToLobby = () => {
    setActiveGame(null);
    setSearchParams({ level: selectedLevelId });
  };

  return (
    <div
      data-testid="games-container"
      className="mx-auto w-full max-w-5xl px-0 py-0.5 sm:px-4 sm:py-4"
    >
      {!activeGame && (
        <GameHub
          onSelectGame={handleSelectGame}
          selectedLevelId={selectedLevelId}
          onSelectLevel={handleSelectLevel}
        />
      )}

      {activeGame === 'memory-flip' && (
        <MemoryFlipGame levelId={selectedLevelId} onBack={handleBackToLobby} />
      )}

      {activeGame === 'speed-blitz' && (
        <SpeedBlitzGame levelId={selectedLevelId} onBack={handleBackToLobby} />
      )}

      {activeGame === 'balloon-pop' && (
        <BalloonPopGame levelId={selectedLevelId} onBack={handleBackToLobby} />
      )}

      {activeGame === 'zombie-defender' && (
        <ZombieDefenderGame levelId={selectedLevelId} onBack={handleBackToLobby} />
      )}
    </div>
  );
};

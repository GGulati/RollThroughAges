import { createSelector } from '@reduxjs/toolkit';
import { canRoll, getMaxRollsAllowed, isGameOver } from '@/game/engine';
import { RootState } from './store';

const selectGameSlice = (state: RootState) => state.game;

export const selectGame = createSelector(selectGameSlice, (slice) => slice.game);

export const selectLastError = createSelector(
  selectGameSlice,
  (slice) => slice.lastError,
);

export const selectCanUndo = createSelector(
  selectGame,
  (game) => (game ? game.history.length > 0 : false),
);

export const selectCanRedo = createSelector(
  selectGame,
  (game) => (game ? game.future.length > 0 : false),
);

export const selectTurnStatus = createSelector(
  selectGame,
  selectLastError,
  (game, lastError) => {
    if (!game) {
      return {
        isGameActive: false,
        round: 0,
        phase: null,
        activePlayerId: null,
        activePlayerName: null,
        rollsUsed: 0,
        errorMessage: lastError?.message ?? null,
      };
    }

    const activePlayer = game.state.players[game.state.activePlayerIndex];
    const playerConfig = game.settings.players.find(
      (player) => player.id === activePlayer.id,
    );

    return {
      isGameActive: true,
      round: game.state.round,
      phase: game.state.phase,
      activePlayerId: activePlayer.id,
      activePlayerName: playerConfig?.name ?? activePlayer.id,
      rollsUsed: game.state.turn.rollsUsed,
      errorMessage: lastError?.message ?? null,
    };
  },
);

export const selectDicePanelModel = createSelector(selectGame, (game) => {
  if (!game) {
    return {
      isActionAllowed: false,
      reason: 'Start a game before rolling dice.',
      dice: [],
      rollsUsed: 0,
      maxRollsAllowed: 0,
    };
  }

  const activePlayer = game.state.players[game.state.activePlayerIndex];
  const allowed = canRoll(game.state.turn, game.settings, activePlayer);

  return {
    isActionAllowed: allowed,
    reason: allowed ? null : 'No roll is available right now.',
    dice: game.state.turn.dice,
    rollsUsed: game.state.turn.rollsUsed,
    maxRollsAllowed: getMaxRollsAllowed(activePlayer, game.settings),
  };
});

export const selectProductionPanelModel = createSelector(selectGame, (game) => ({
  isActionAllowed: Boolean(game),
  reason: game ? null : 'Start a game to resolve production.',
  pendingProduction: game ? game.state.turn.turnProduction : null,
}));

export const selectBuildPanelModel = createSelector(selectGame, (game) => ({
  isActionAllowed: Boolean(game),
  reason: game ? null : 'Start a game to build cities or monuments.',
  workersAvailable: game ? game.state.turn.turnProduction.workers : 0,
}));

export const selectDevelopmentPanelModel = createSelector(selectGame, (game) => ({
  isActionAllowed: Boolean(game),
  reason: game ? null : 'Start a game to purchase developments.',
  coinsAvailable: game ? game.state.turn.turnProduction.coins : 0,
}));

export const selectDiscardPanelModel = createSelector(selectGame, (game) => ({
  isActionAllowed: Boolean(game),
  reason: game ? null : 'Start a game to discard goods.',
}));

export const selectEndgameStatus = createSelector(selectGame, (game) => ({
  isGameActive: Boolean(game),
  isGameOver: game ? isGameOver(game) : false,
}));

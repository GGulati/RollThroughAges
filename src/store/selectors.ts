import { createSelector } from '@reduxjs/toolkit';
import { GamePhase } from '@/game';
import {
  canRoll,
  countPendingChoices,
  getMaxRollsAllowed,
  isGameOver,
} from '@/game/engine';
import { RootState } from './store';

const selectGameSlice = (state: RootState) => state.game;

function formatProductionEntry(entry: {
  goods: number;
  food: number;
  workers: number;
  coins: number;
  skulls: number;
}): string {
  const parts: string[] = [];
  if (entry.goods > 0) parts.push(`${entry.goods} Goods`);
  if (entry.food > 0) parts.push(`${entry.food} Food`);
  if (entry.workers > 0) parts.push(`${entry.workers} Workers`);
  if (entry.coins > 0) parts.push(`${entry.coins} Coins`);
  if (entry.skulls > 0) parts.push(`${entry.skulls} Skull`);
  return parts.join(' + ');
}

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
      canRoll: false,
      reason: 'Start a game before rolling dice.',
      dice: [],
      diceCards: [],
      rollsUsed: 0,
      maxRollsAllowed: 0,
      rerollsRemaining: 0,
      canKeepDie: false,
      canSelectProduction: false,
    };
  }

  const activePlayer = game.state.players[game.state.activePlayerIndex];
  const canRollNow =
    game.state.phase === GamePhase.RollDice &&
    canRoll(game.state.turn, game.settings, activePlayer);
  const canKeepDie = game.state.phase === GamePhase.RollDice;
  const canSelectProduction =
    game.state.phase === GamePhase.RollDice ||
    game.state.phase === GamePhase.DecideDice;
  const rerollsRemaining = Math.max(
    0,
    getMaxRollsAllowed(activePlayer, game.settings) - game.state.turn.rollsUsed,
  );
  const diceCards = game.state.turn.dice.map((die, index) => {
    const face = game.settings.diceFaces[die.diceFaceIndex];
    const optionCount = face.production.length;
    const selectedOption =
      die.productionIndex >= 0 && die.productionIndex < optionCount
        ? die.productionIndex
        : 0;

    return {
      index,
      label: face.label,
      lockDecision: die.lockDecision,
      optionCount,
      selectedOption,
      optionSummaries: face.production.map((entry) =>
        formatProductionEntry(entry),
      ),
      hasChoice: optionCount > 1,
      canKeep: canKeepDie && die.lockDecision !== 'skull',
      canChooseOption: canSelectProduction && optionCount > 1,
    };
  });

  return {
    canRoll: canRollNow,
    reason: canRollNow ? null : 'No roll is available right now.',
    dice: game.state.turn.dice,
    diceCards,
    rollsUsed: game.state.turn.rollsUsed,
    maxRollsAllowed: getMaxRollsAllowed(activePlayer, game.settings),
    rerollsRemaining,
    canKeepDie,
    canSelectProduction,
  };
});

export const selectProductionPanelModel = createSelector(selectGame, (game) => {
  if (!game) {
    return {
      canResolveProduction: false,
      reason: 'Start a game to resolve production.',
      pendingProductionChoices: 0,
      pendingProduction: null,
    };
  }

  const pendingProductionChoices = countPendingChoices(
    game.state.turn.dice,
    game.settings,
  );
  const canResolveProduction =
    (game.state.phase === GamePhase.DecideDice ||
      game.state.phase === GamePhase.ResolveProduction) &&
    pendingProductionChoices === 0;

  return {
    canResolveProduction,
    reason: canResolveProduction
      ? null
      : 'Choose all pending dice options before resolving production.',
    pendingProductionChoices,
    pendingProduction: game.state.turn.turnProduction,
  };
});

export const selectBuildPanelModel = createSelector(selectGame, (game) => {
  if (!game) {
    return {
      isActionAllowed: false,
      reason: 'Start a game to build cities or monuments.',
      workersAvailable: 0,
      goodsToAllocate: 0,
      goodsTypes: [] as string[],
      canAllocateGoods: false,
    };
  }

  const goodsToAllocate = game.state.turn.turnProduction.goods;
  const canAllocateGoods =
    game.state.phase === GamePhase.Build && goodsToAllocate > 0;

  return {
    isActionAllowed: true,
    reason: null,
    workersAvailable: game.state.turn.turnProduction.workers,
    goodsToAllocate,
    goodsTypes: game.settings.goodsTypes.map((goods) => goods.name),
    canAllocateGoods,
  };
});

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

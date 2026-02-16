import { GamePhase, GameState, GameStateSnapshot, PlayerState } from '../game';
import { getTotalPurchasingPower, getAvailableDevelopments } from './developmentEngine';
import { countPendingChoices, canRoll, getSingleDieRerollsAllowed } from './diceEngine';
import { resolveProduction, getAvailableExchangeEffects, getExchangeResourceAmount } from './productionEngine';
import { getBuildOptions } from './buildEngine';
import { calculateGoodsOverflow } from './goodsEngine';

export function getPostDevelopmentCompletionPhase(
  activePlayer: PlayerState,
  game: GameState,
): GamePhase {
  const overflow = calculateGoodsOverflow(activePlayer.goods, activePlayer, game.settings);
  return overflow > 0 ? GamePhase.DiscardGoods : GamePhase.EndTurn;
}

export function getNextPostDevelopmentPhase(
  game: GameState,
  activePlayer = game.state.players[game.state.activePlayerIndex],
  turn = game.state.turn,
): GamePhase {
  const potentialExchangeCoinGain = getAvailableExchangeEffects(
    activePlayer,
    game.settings,
  ).reduce((sum, exchange) => {
    if (exchange.to.toLowerCase() !== 'coins') {
      return sum;
    }
    const sourceAmount = getExchangeResourceAmount(
      activePlayer,
      turn,
      game.settings,
      exchange.from,
    );
    return sourceAmount > 0 ? sum + sourceAmount * exchange.rate : sum;
  }, 0);

  const potentialPurchasingPower =
    getTotalPurchasingPower(activePlayer, turn) + potentialExchangeCoinGain;
  const canAffordAnyDevelopment = getAvailableDevelopments(
    activePlayer,
    game.settings,
  ).some((development) => potentialPurchasingPower >= development.cost);
  if (canAffordAnyDevelopment || potentialExchangeCoinGain > 0) {
    return GamePhase.Development;
  }

  return getPostDevelopmentCompletionPhase(activePlayer, game);
}

export function resolveProductionPhase(game: GameState): GameState {
  const resolved = resolveProduction(
    game.state,
    game.state.players,
    game.settings,
  );
  const nextPhase =
    resolved.turnProduction.workers > 0
      ? GamePhase.Build
      : getNextPostDevelopmentPhase(
          game,
          resolved.players[game.state.activePlayerIndex],
          {
            ...game.state.turn,
            pendingChoices: 0,
            turnProduction: resolved.turnProduction,
          },
        );

  return {
    ...game,
    state: {
      ...game.state,
      players: resolved.players,
      phase: nextPhase,
      turn: {
        ...game.state.turn,
        pendingChoices: 0,
        foodShortage: resolved.foodShortage,
        turnProduction: resolved.turnProduction,
      },
    },
  };
}

function hasRollPhaseChoices(
  state: GameStateSnapshot,
  player: PlayerState,
  game: GameState,
): boolean {
  if (canRoll(state.turn, game.settings, player)) {
    return true;
  }

  const hasKeepableDie = state.turn.dice.some((die) => die.lockDecision === 'unlocked');
  if (hasKeepableDie) {
    return true;
  }

  const rerollsRemaining =
    getSingleDieRerollsAllowed(player, game.settings) - state.turn.singleDieRerollsUsed;
  const hasSingleRerollTarget =
    rerollsRemaining > 0 &&
    state.turn.dice.some((die) => die.lockDecision !== 'skull');
  if (hasSingleRerollTarget) {
    return true;
  }

  return countPendingChoices(state.turn.dice, game.settings) > 0;
}

function autoAdvanceOneStep(game: GameState): GameState {
  const state = game.state;
  const activePlayer = state.players[state.activePlayerIndex];

  if (state.phase === GamePhase.RollDice) {
    if (!hasRollPhaseChoices(state, activePlayer, game)) {
      return {
        ...game,
        state: {
          ...state,
          phase: GamePhase.DecideDice,
        },
      };
    }
    return game;
  }

  if (state.phase === GamePhase.DecideDice || state.phase === GamePhase.ResolveProduction) {
    const pendingChoices = countPendingChoices(state.turn.dice, game.settings);
    if (pendingChoices === 0) {
      return resolveProductionPhase(game);
    }
    if (pendingChoices !== state.turn.pendingChoices) {
      return {
        ...game,
        state: {
          ...state,
          turn: {
            ...state.turn,
            pendingChoices,
          },
        },
      };
    }
    return game;
  }

  if (state.phase === GamePhase.Build) {
    const workersAvailable = state.turn.turnProduction.workers;
    if (workersAvailable <= 0) {
      return {
        ...game,
        state: {
          ...state,
          phase: getNextPostDevelopmentPhase(game, activePlayer, state.turn),
        },
      };
    }

    const options = getBuildOptions(
      activePlayer,
      state.players,
      workersAvailable,
      game.settings,
    );
    if (options.cities.length === 0 && options.monuments.length === 0) {
      return {
        ...game,
        state: {
          ...state,
          phase: getNextPostDevelopmentPhase(game, activePlayer, state.turn),
        },
      };
    }
    return game;
  }

  if (state.phase === GamePhase.Development) {
    if (state.turn.developmentPurchased) {
      return {
        ...game,
        state: {
          ...state,
          phase: getPostDevelopmentCompletionPhase(activePlayer, game),
        },
      };
    }

    const nextPhase = getNextPostDevelopmentPhase(game, activePlayer, state.turn);
    if (nextPhase !== GamePhase.Development) {
      return {
        ...game,
        state: {
          ...state,
          phase: nextPhase,
        },
      };
    }
    return game;
  }

  if (state.phase === GamePhase.DiscardGoods) {
    const overflow = calculateGoodsOverflow(
      activePlayer.goods,
      activePlayer,
      game.settings,
    );
    if (overflow <= 0) {
      return {
        ...game,
        state: {
          ...state,
          phase: GamePhase.EndTurn,
        },
      };
    }
    return game;
  }

  return game;
}

export function autoAdvanceForcedPhases(game: GameState): GameState {
  let current = game;
  const maxIterations = 20;
  for (let i = 0; i < maxIterations; i += 1) {
    const next = autoAdvanceOneStep(current);
    if (next === current) {
      break;
    }
    current = next;
  }
  return current;
}

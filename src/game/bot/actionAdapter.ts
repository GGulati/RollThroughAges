import { GamePhase, GameState, GameSettings, PlayerState } from '../game';
import {
  allocateWorkersToCity,
  allocateWorkersToMonument,
  areAllDiceLocked,
  calculateGoodsOverflow,
  countPendingChoices,
  endTurn,
  exchangeResources,
  findGoodsTypeByName,
  getAvailableDevelopments,
  getAvailableExchangeEffects,
  getBuildOptions,
  getExchangeResourceAmount,
  getTotalPurchasingPower,
  keepDie as keepDieEngine,
  performRoll,
  performSingleDieReroll,
  purchaseDevelopment,
  resolveDiscardGoods,
  resolveProduction,
  selectProduction,
  spendWorkers,
} from '../engine';
import { BotAction } from './types';

type ApplyBotActionResult = {
  applied: boolean;
  game: GameState;
  error?: string;
};

function getPostDevelopmentCompletionPhase(
  activePlayer: PlayerState,
  settings: GameSettings,
): GamePhase {
  const overflow = calculateGoodsOverflow(activePlayer.goods, activePlayer, settings);
  return overflow > 0 ? GamePhase.DiscardGoods : GamePhase.EndTurn;
}

function getNextPostDevelopmentPhase(
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

  const overflow = calculateGoodsOverflow(
    activePlayer.goods,
    activePlayer,
    game.settings,
  );
  return overflow > 0 ? GamePhase.DiscardGoods : GamePhase.EndTurn;
}

function resolveProductionMutation(game: GameState): GameState {
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

function autoResolveProductionIfReady(game: GameState): GameState {
  if (
    game.state.phase !== GamePhase.DecideDice &&
    game.state.phase !== GamePhase.ResolveProduction
  ) {
    return game;
  }

  const pendingChoices = countPendingChoices(
    game.state.turn.dice,
    game.settings,
  );
  if (pendingChoices > 0) {
    return {
      ...game,
      state: {
        ...game.state,
        turn: {
          ...game.state.turn,
          pendingChoices,
        },
      },
    };
  }

  return resolveProductionMutation(game);
}

export function applyBotAction(game: GameState, action: BotAction): ApplyBotActionResult {
  if (action.type === 'rollDice') {
    const nextGame = autoResolveProductionIfReady(performRoll(game));
    return nextGame === game
      ? { applied: false, game, error: 'Roll not allowed.' }
      : { applied: true, game: nextGame };
  }

  if (action.type === 'rerollSingleDie') {
    const nextGame = performSingleDieReroll(game, action.dieIndex);
    return nextGame === game
      ? { applied: false, game, error: 'Single-die reroll not allowed.' }
      : { applied: true, game: nextGame };
  }

  if (action.type === 'keepDie') {
    if (game.state.phase !== GamePhase.RollDice) {
      return { applied: false, game, error: 'Keep die only allowed in roll phase.' };
    }
    const die = game.state.turn.dice[action.dieIndex];
    if (!die || die.lockDecision === 'skull') {
      return { applied: false, game, error: 'Invalid die index for keep action.' };
    }
    const nextDice = keepDieEngine(game.state.turn.dice, action.dieIndex);
    const shouldAdvance = areAllDiceLocked(nextDice);
    const nextPhase = shouldAdvance ? GamePhase.DecideDice : game.state.phase;
    const nextGame = autoResolveProductionIfReady({
      ...game,
      state: {
        ...game.state,
        phase: nextPhase,
        turn: {
          ...game.state.turn,
          dice: nextDice,
        },
      },
    });
    return { applied: true, game: nextGame };
  }

  if (action.type === 'selectProduction') {
    if (
      game.state.phase !== GamePhase.RollDice &&
      game.state.phase !== GamePhase.DecideDice
    ) {
      return { applied: false, game, error: 'Select production not allowed in phase.' };
    }

    const die = game.state.turn.dice[action.dieIndex];
    if (!die) {
      return { applied: false, game, error: 'Invalid die index for production choice.' };
    }
    const dieFace = game.settings.diceFaces[die.diceFaceIndex];
    if (
      action.productionIndex < 0 ||
      action.productionIndex >= dieFace.production.length
    ) {
      return { applied: false, game, error: 'Invalid production choice index.' };
    }

    const nextDice = selectProduction(
      game.state.turn.dice,
      action.dieIndex,
      action.productionIndex,
      game.settings,
    );
    const pendingChoices = countPendingChoices(nextDice, game.settings);
    const nextPhase =
      pendingChoices === 0 && game.state.phase === GamePhase.DecideDice
        ? GamePhase.ResolveProduction
        : game.state.phase;
    const nextGame = autoResolveProductionIfReady({
      ...game,
      state: {
        ...game.state,
        phase: nextPhase,
        turn: {
          ...game.state.turn,
          dice: nextDice,
          pendingChoices,
        },
      },
    });
    return { applied: true, game: nextGame };
  }

  if (action.type === 'resolveProduction') {
    if (
      game.state.phase !== GamePhase.DecideDice &&
      game.state.phase !== GamePhase.ResolveProduction
    ) {
      return { applied: false, game, error: 'Resolve production not allowed in phase.' };
    }
    const pendingChoices = countPendingChoices(
      game.state.turn.dice,
      game.settings,
    );
    if (pendingChoices > 0) {
      return { applied: false, game, error: 'Production choices are still pending.' };
    }
    return { applied: true, game: resolveProductionMutation(game) };
  }

  if (action.type === 'buildCity') {
    if (game.state.phase !== GamePhase.Build) {
      return { applied: false, game, error: 'Build city not allowed in phase.' };
    }
    const activeIndex = game.state.activePlayerIndex;
    const activePlayer = game.state.players[activeIndex];
    const options = getBuildOptions(
      activePlayer,
      game.state.players,
      game.state.turn.turnProduction.workers,
      game.settings,
    );
    if (!options.cities.includes(action.cityIndex)) {
      return { applied: false, game, error: 'City is not currently buildable.' };
    }

    const { player, workersUsed } = allocateWorkersToCity(
      activePlayer,
      action.cityIndex,
      game.state.turn.turnProduction.workers,
      game.settings,
    );
    if (workersUsed <= 0) {
      return { applied: false, game, error: 'No workers were applied to city.' };
    }

    const players = [...game.state.players];
    players[activeIndex] = player;
    const turn = spendWorkers(game.state.turn, workersUsed);
    const phase =
      turn.turnProduction.workers > 0
        ? game.state.phase
        : getNextPostDevelopmentPhase(game, player, turn);
    return {
      applied: true,
      game: {
        ...game,
        state: {
          ...game.state,
          players,
          turn,
          phase,
        },
      },
    };
  }

  if (action.type === 'buildMonument') {
    if (game.state.phase !== GamePhase.Build) {
      return { applied: false, game, error: 'Build monument not allowed in phase.' };
    }
    const activeIndex = game.state.activePlayerIndex;
    const activePlayer = game.state.players[activeIndex];
    const options = getBuildOptions(
      activePlayer,
      game.state.players,
      game.state.turn.turnProduction.workers,
      game.settings,
    );
    if (!options.monuments.includes(action.monumentId)) {
      return { applied: false, game, error: 'Monument is not currently buildable.' };
    }

    const { player, workersUsed } = allocateWorkersToMonument(
      activePlayer,
      action.monumentId,
      game.state.turn.turnProduction.workers,
      game.state.players,
      game.settings,
    );
    if (workersUsed <= 0) {
      return { applied: false, game, error: 'No workers were applied to monument.' };
    }

    const players = [...game.state.players];
    players[activeIndex] = player;
    const turn = spendWorkers(game.state.turn, workersUsed);
    const phase =
      turn.turnProduction.workers > 0
        ? game.state.phase
        : getNextPostDevelopmentPhase(game, player, turn);
    return {
      applied: true,
      game: {
        ...game,
        state: {
          ...game.state,
          players,
          turn,
          phase,
        },
      },
    };
  }

  if (action.type === 'buyDevelopment') {
    if (
      game.state.phase !== GamePhase.Build &&
      game.state.phase !== GamePhase.Development
    ) {
      return { applied: false, game, error: 'Buy development not allowed in phase.' };
    }
    if (game.state.turn.developmentPurchased) {
      return { applied: false, game, error: 'Development already purchased this turn.' };
    }

    const activeIndex = game.state.activePlayerIndex;
    const activePlayer = game.state.players[activeIndex];
    const availableDevelopmentIds = new Set(
      getAvailableDevelopments(activePlayer, game.settings).map((dev) => dev.id),
    );
    if (!availableDevelopmentIds.has(action.developmentId)) {
      return { applied: false, game, error: 'Development is not currently available.' };
    }

    const goodsTypesToSpend = action.goodsTypeNames
      .map((name) => findGoodsTypeByName(activePlayer.goods, name))
      .filter((goodsType): goodsType is NonNullable<typeof goodsType> => Boolean(goodsType));
    if (goodsTypesToSpend.length !== action.goodsTypeNames.length) {
      return { applied: false, game, error: 'One or more goods types are invalid.' };
    }

    const result = purchaseDevelopment(
      activePlayer,
      game.state.turn,
      action.developmentId,
      goodsTypesToSpend,
      game.settings,
    );
    if ('error' in result) {
      return { applied: false, game, error: result.error };
    }

    const players = [...game.state.players];
    players[activeIndex] = result.player;
    return {
      applied: true,
      game: {
        ...game,
        state: {
          ...game.state,
          players,
          phase: getPostDevelopmentCompletionPhase(result.player, game.settings),
          turn: {
            ...result.turn,
            developmentPurchased: true,
          },
        },
      },
    };
  }

  if (action.type === 'skipDevelopment') {
    if (game.state.phase !== GamePhase.Development) {
      return { applied: false, game, error: 'Skip development not allowed in phase.' };
    }
    const activePlayer = game.state.players[game.state.activePlayerIndex];
    const phase = getPostDevelopmentCompletionPhase(activePlayer, game.settings);
    return {
      applied: true,
      game: {
        ...game,
        state: {
          ...game.state,
          phase,
        },
      },
    };
  }

  if (action.type === 'applyExchange') {
    if (
      game.state.phase !== GamePhase.Build &&
      game.state.phase !== GamePhase.Development
    ) {
      return { applied: false, game, error: 'Exchange not allowed in phase.' };
    }
    const exchangeAmount = Math.max(0, Math.floor(action.amount));
    if (exchangeAmount <= 0) {
      return { applied: false, game, error: 'Exchange amount must be positive.' };
    }
    const activeIndex = game.state.activePlayerIndex;
    const activePlayer = game.state.players[activeIndex];
    const result = exchangeResources(
      activePlayer,
      game.state.turn,
      action.from,
      action.to,
      exchangeAmount,
      game.settings,
    );
    if (!result) {
      return { applied: false, game, error: 'Exchange cannot be applied.' };
    }
    const players = [...game.state.players];
    players[activeIndex] = result.player;
    return {
      applied: true,
      game: {
        ...game,
        state: {
          ...game.state,
          players,
          phase: getNextPostDevelopmentPhase(game, result.player, result.turn),
          turn: result.turn,
        },
      },
    };
  }

  if (action.type === 'discardGoods') {
    if (game.state.phase !== GamePhase.DiscardGoods) {
      return { applied: false, game, error: 'Discard is not allowed in current phase.' };
    }
    const player = game.state.players[game.state.activePlayerIndex];
    const goodsToKeep = new Map(
      Array.from(player.goods.keys()).map((goodsType) => [
        goodsType,
        action.goodsToKeepByType[goodsType.name] ?? 0,
      ]),
    );
    const result = resolveDiscardGoods(game, goodsToKeep);
    if ('error' in result) {
      return { applied: false, game, error: result.error };
    }
    return { applied: true, game: result };
  }

  if (action.type === 'endTurn') {
    if (game.state.phase !== GamePhase.EndTurn) {
      return { applied: false, game, error: 'End turn not allowed in current phase.' };
    }
    return { applied: true, game: endTurn(game) };
  }

  return { applied: false, game, error: 'Unknown bot action.' };
}

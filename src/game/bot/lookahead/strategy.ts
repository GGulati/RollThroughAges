import { ResourceProduction } from '../../dice';
import {
  autoAdvanceForcedPhases,
  getGoodsValue,
  getMaxRollsAllowed,
  getScoreBreakdown,
} from '../../engine';
import { GAME_PHASE_ORDER, GamePhase, GameState } from '../../game';
import { applyBotAction } from '../actionAdapter';
import { botActionKey } from '../actionKey';
import { getLegalBotActions } from '../candidates';
import { chooseHeuristicBotAction } from '../heuristic';
import {
  BotCoreInstrumentation,
  getBotCoreInstrumentation,
  resetBotCoreInstrumentation,
} from '../runner';
import { BotAction, BotContext, BotStrategy } from '../types';
import { LookaheadConfig, LOOKAHEAD_STANDARD_CONFIG } from './config';

type ChanceOutcome = {
  probability: number;
  game: GameState;
};

type EvaluationBudget = {
  remainingByPhase: Record<GamePhase, number>;
};

type SearchMemo = {
  stateSignatureCache: WeakMap<GameState, string>;
  rollOutcomeByKey: Map<string, GameState>;
  utilityByStateAndRoot: Map<string, number>;
  recordMetric?: (metric: string, value?: number) => void;
};

export type LookaheadInstrumentation = {
  core: BotCoreInstrumentation;
  evaluateActionValueCalls: number;
  evaluateChanceActionCalls: number;
  evaluateDeterministicActionCalls: number;
  evaluatedChanceOutcomes: number;
  stateSignatureCacheHits: number;
  stateSignatureCacheMisses: number;
  legalActionsCacheHits: number;
  legalActionsCacheMisses: number;
  actionPreScoreCacheHits: number;
  actionPreScoreCacheMisses: number;
  appliedActionCacheHits: number;
  appliedActionCacheMisses: number;
  rollOutcomeCacheHits: number;
  rollOutcomeCacheMisses: number;
  utilityCacheHits: number;
  utilityCacheMisses: number;
};

function createEmptyInstrumentation(): LookaheadInstrumentation {
  return {
    core: getBotCoreInstrumentation(),
    evaluateActionValueCalls: 0,
    evaluateChanceActionCalls: 0,
    evaluateDeterministicActionCalls: 0,
    evaluatedChanceOutcomes: 0,
    stateSignatureCacheHits: 0,
    stateSignatureCacheMisses: 0,
    legalActionsCacheHits: 0,
    legalActionsCacheMisses: 0,
    actionPreScoreCacheHits: 0,
    actionPreScoreCacheMisses: 0,
    appliedActionCacheHits: 0,
    appliedActionCacheMisses: 0,
    rollOutcomeCacheHits: 0,
    rollOutcomeCacheMisses: 0,
    utilityCacheHits: 0,
    utilityCacheMisses: 0,
  };
}

const lookaheadInstrumentation = createEmptyInstrumentation();

type LookaheadMetricName = Exclude<keyof LookaheadInstrumentation, 'core'>;

function recordLookaheadMetric(
  memo: SearchMemo,
  metric: LookaheadMetricName,
  value = 1,
): void {
  lookaheadInstrumentation[metric] += value;
  memo.recordMetric?.(`lookahead.${metric}`, value);
}

export function resetLookaheadInstrumentation(): void {
  resetBotCoreInstrumentation();
  const reset = createEmptyInstrumentation();
  Object.assign(lookaheadInstrumentation, reset);
}

export function getLookaheadInstrumentation(): LookaheadInstrumentation {
  return {
    ...lookaheadInstrumentation,
    core: getBotCoreInstrumentation(),
  };
}

function createEvaluationBudget(maxEvaluationsPerPhase: number): EvaluationBudget {
  return {
    remainingByPhase: GAME_PHASE_ORDER.reduce(
      (acc, phase) => {
        acc[phase] = maxEvaluationsPerPhase;
        return acc;
      },
      {} as Record<GamePhase, number>,
    ),
  };
}

function createSearchMemo(
  recordMetric?: (metric: string, value?: number) => void,
): SearchMemo {
  return {
    stateSignatureCache: new WeakMap<GameState, string>(),
    rollOutcomeByKey: new Map<string, GameState>(),
    utilityByStateAndRoot: new Map<string, number>(),
    recordMetric,
  };
}

function getStateSignature(game: GameState, memo: SearchMemo): string {
  const cached = memo.stateSignatureCache.get(game);
  if (cached) {
    recordLookaheadMetric(memo, 'stateSignatureCacheHits');
    return cached;
  }
  recordLookaheadMetric(memo, 'stateSignatureCacheMisses');

  const turn = game.state.turn;
  const turnSig = [
    turn.activePlayerId,
    turn.rollsUsed,
    turn.singleDieRerollsUsed,
    turn.pendingChoices,
    turn.foodShortage,
    turn.developmentPurchased ? 1 : 0,
    turn.turnProduction.workers,
    turn.turnProduction.coins,
    turn.turnProduction.food,
    turn.turnProduction.goods,
    turn.turnProduction.skulls,
    turn.dice
      .map((die) => `${die.diceFaceIndex}:${die.productionIndex}:${die.lockDecision}`)
      .join(';'),
  ].join('|');

  const playersSig = game.state.players
    .map((player) => {
      const goodsSig = game.settings.goodsTypes
        .map((goodsType) => `${goodsType.name}:${player.goods.get(goodsType) ?? 0}`)
        .join(',');
      const citiesSig = player.cities
        .map((city) => `${city.completed ? 1 : 0}:${city.workersCommitted}`)
        .join(',');
      const monumentsSig = game.settings.monumentDefinitions
        .map((monument) => {
          const progress = player.monuments[monument.id];
          return `${monument.id}:${progress?.completed ? 1 : 0}:${progress?.workersCommitted ?? 0}`;
        })
        .join(',');
      return [
        player.id,
        player.food,
        player.disasterPenalties,
        player.score,
        [...player.developments].sort((a, b) => a.localeCompare(b)).join(','),
        goodsSig,
        citiesSig,
        monumentsSig,
      ].join('|');
    })
    .join('||');

  const signature = [
    game.state.phase,
    game.state.round,
    game.state.activePlayerIndex,
    turnSig,
    playersSig,
  ].join('#');
  memo.stateSignatureCache.set(game, signature);
  return signature;
}

function scoreProductionChoice(
  production: ResourceProduction,
  weights: LookaheadConfig['heuristicFallbackConfig']['productionWeights'],
  foodWeight: number,
): number {
  return (
    production.workers * weights.workers +
    production.coins * weights.coins +
    production.food * foodWeight +
    production.goods * weights.goods +
    production.skulls * weights.skulls
  );
}

function getCitiesToFeed(game: GameState): number {
  const activePlayer = game.state.players[game.state.activePlayerIndex];
  return activePlayer.cities.filter((city) => city.completed).length;
}

function getFoodUrgencyWeight(game: GameState, config: LookaheadConfig): number {
  const activePlayer = game.state.players[game.state.activePlayerIndex];
  const citiesToFeed = getCitiesToFeed(game);
  const deficit = Math.max(0, citiesToFeed - activePlayer.food);
  return (
    config.heuristicFallbackConfig.productionWeights.food +
    deficit *
      config.heuristicFallbackConfig.foodPolicyWeights.foodDeficitPriorityPerUnit
  );
}

function getBestProductionIndexForFace(
  game: GameState,
  faceIndex: number,
  config: LookaheadConfig,
): number {
  const face = game.settings.diceFaces[faceIndex];
  if (!face || face.production.length <= 1) {
    return 0;
  }

  const foodWeight = getFoodUrgencyWeight(game, config);
  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < face.production.length; i += 1) {
    const score = scoreProductionChoice(
      face.production[i],
      config.heuristicFallbackConfig.productionWeights,
      foodWeight,
    );
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function withBestPendingProductionChoices(
  game: GameState,
  config: LookaheadConfig,
): GameState {
  const nextDice = game.state.turn.dice.map((die) => {
    const face = game.settings.diceFaces[die.diceFaceIndex];
    if (die.productionIndex >= 0 || face.production.length <= 1) {
      return die;
    }
    return {
      ...die,
      productionIndex: getBestProductionIndexForFace(game, die.diceFaceIndex, config),
    };
  });

  return {
    ...game,
    state: {
      ...game.state,
      turn: {
        ...game.state.turn,
        dice: nextDice,
      },
    },
  };
}

function getPlayerPositionValue(
  game: GameState,
  playerId: string,
  config: LookaheadConfig,
): number {
  const playerIndex = game.state.players.findIndex((entry) => entry.id === playerId);
  if (playerIndex < 0) {
    return 0;
  }
  const player = game.state.players[playerIndex];
  const breakdown = getScoreBreakdown(player, game.state.players, game.settings);
  const completedCities = player.cities.filter((city) => city.completed).length;
  const cityProgress = player.cities.reduce((sum, city, cityIndex) => {
    if (city.completed) {
      return sum + 1;
    }
    const cityDefIndex = cityIndex - game.settings.startingCities;
    if (cityDefIndex < 0 || cityDefIndex >= game.settings.cityDefinitions.length) {
      return sum;
    }
    const workerCost = game.settings.cityDefinitions[cityDefIndex].workerCost;
    if (workerCost <= 0) {
      return sum;
    }
    return sum + Math.min(1, city.workersCommitted / workerCost);
  }, 0);

  const monumentProgress = game.settings.monumentDefinitions.reduce((sum, monument) => {
    const progress = player.monuments[monument.id];
    if (!progress) {
      return sum;
    }
    if (progress.completed) {
      return sum + 1;
    }
    const workerCost = monument.requirements.workerCost;
    if (workerCost <= 0) {
      return sum;
    }
    return sum + Math.min(1, progress.workersCommitted / workerCost);
  }, 0);

  const goodsValue = game.settings.goodsTypes.reduce((sum, goodsType) => {
    const quantity = player.goods.get(goodsType) ?? 0;
    return sum + getGoodsValue(goodsType, quantity);
  }, 0);
  const citiesToFeed = completedCities;
  const foodDeficit = Math.max(0, citiesToFeed - player.food);
  const foodRiskPenalty =
    foodDeficit * config.heuristicFallbackConfig.foodPolicyWeights.starvationPenaltyPerUnit;
  const turnResourcePosition =
    game.state.turn.activePlayerId === player.id
      ? scoreProductionChoice(
          game.state.turn.turnProduction,
          config.heuristicFallbackConfig.productionWeights,
          getFoodUrgencyWeight(game, config),
        )
      : 0;

  return (
    breakdown.total * config.utilityWeights.scoreTotal +
    completedCities * config.utilityWeights.completedCities +
    cityProgress * config.utilityWeights.cityProgress +
    monumentProgress * config.utilityWeights.monumentProgress +
    goodsValue * config.utilityWeights.goodsValue +
    player.food * config.utilityWeights.food +
    turnResourcePosition * config.utilityWeights.turnResourcePosition -
    foodRiskPenalty * config.utilityWeights.foodRiskPenalty
  );
}

function evaluateResolvedTurnUtility(
  game: GameState,
  rootPlayerId: string,
  config: LookaheadConfig,
  memo: SearchMemo,
): number {
  if (config.maxEvaluations <= 0) {
    return 0;
  }
  const utilityKey = `${rootPlayerId}|${getStateSignature(game, memo)}`;
  const cached = memo.utilityByStateAndRoot.get(utilityKey);
  if (cached !== undefined) {
    recordLookaheadMetric(memo, 'utilityCacheHits');
    return cached;
  }
  recordLookaheadMetric(memo, 'utilityCacheMisses');
  const normalized = withBestPendingProductionChoices(game, config);
  const rootValue = getPlayerPositionValue(normalized, rootPlayerId, config);
  const opponentValues = normalized.state.players
    .filter((player) => player.id !== rootPlayerId)
    .map((player) => getPlayerPositionValue(normalized, player.id, config));
  const opponentAverage =
    opponentValues.length > 0
      ? opponentValues.reduce((sum, value) => sum + value, 0) / opponentValues.length
      : 0;
  const utility = rootValue - opponentAverage;
  memo.utilityByStateAndRoot.set(utilityKey, utility);
  return utility;
}

function evaluateResolvedTurnUtilityBudgeted(
  game: GameState,
  rootPlayerId: string,
  config: LookaheadConfig,
  budget: EvaluationBudget,
  memo: SearchMemo,
): number {
  const phase = game.state.phase;
  const remaining = budget.remainingByPhase[phase] ?? 0;
  if (remaining <= 0) {
    return 0;
  }
  budget.remainingByPhase[phase] = remaining - 1;
  return evaluateResolvedTurnUtility(game, rootPlayerId, config, memo);
}

function createDieForFace(
  game: GameState,
  faceIndex: number,
  config: LookaheadConfig,
): GameState['state']['turn']['dice'][number] {
  const face = game.settings.diceFaces[faceIndex];
  const hasSkull = face.production.some((production) => production.skulls > 0);
  return {
    diceFaceIndex: faceIndex,
    productionIndex:
      face.production.length > 1
        ? getBestProductionIndexForFace(game, faceIndex, config)
        : 0,
    lockDecision: hasSkull ? 'skull' : 'unlocked',
  };
}

function applyRollOutcome(
  game: GameState,
  rerolledDieIndices: number[],
  faceIndices: number[],
  config: LookaheadConfig,
  actionType: 'rollDice' | 'rerollSingleDie',
  memo: SearchMemo,
): GameState {
  const rollKey = [
    getStateSignature(game, memo),
    actionType,
    rerolledDieIndices.join(','),
    faceIndices.join(','),
  ].join('|');
  const cached = memo.rollOutcomeByKey.get(rollKey);
  if (cached) {
    recordLookaheadMetric(memo, 'rollOutcomeCacheHits');
    return cached;
  }
  recordLookaheadMetric(memo, 'rollOutcomeCacheMisses');
  const nextDice = game.state.turn.dice.map((die, dieIndex) => {
    const rerollIndex = rerolledDieIndices.indexOf(dieIndex);
    if (rerollIndex < 0) {
      return die;
    }
    return createDieForFace(game, faceIndices[rerollIndex], config);
  });

  const nextTurn = {
    ...game.state.turn,
    dice: nextDice,
    rollsUsed:
      actionType === 'rollDice' ? game.state.turn.rollsUsed + 1 : game.state.turn.rollsUsed,
    singleDieRerollsUsed:
      actionType === 'rerollSingleDie'
        ? game.state.turn.singleDieRerollsUsed + 1
        : game.state.turn.singleDieRerollsUsed,
  };

  const activePlayer = game.state.players[game.state.activePlayerIndex];
  const shouldAutoAdvance =
    actionType === 'rollDice' &&
    (nextDice.every((die) => die.lockDecision !== 'unlocked') ||
      nextTurn.rollsUsed >= getMaxRollsAllowed(activePlayer, game.settings));

  const nextState = {
    ...game.state,
    phase: shouldAutoAdvance ? GamePhase.DecideDice : game.state.phase,
    turn: nextTurn,
  };

  const outcome = autoAdvanceForcedPhases({
    ...game,
    state: nextState,
  });
  memo.rollOutcomeByKey.set(rollKey, outcome);
  return outcome;
}

function enumerateFaceCombinations(count: number, faces: number): number[][] {
  if (count <= 0) {
    return [[]];
  }
  const combinations: number[][] = [];
  const current = Array<number>(count).fill(0);

  const walk = (index: number) => {
    if (index >= count) {
      combinations.push([...current]);
      return;
    }
    for (let face = 0; face < faces; face += 1) {
      current[index] = face;
      walk(index + 1);
    }
  };
  walk(0);
  return combinations;
}

function getActionPreScore(
  game: GameState,
  action: BotAction,
  config: LookaheadConfig,
  rootPlayerId: string,
  memo: SearchMemo,
): number {
  let score = Number.NEGATIVE_INFINITY;
  if (action.type === 'rollDice' || action.type === 'rerollSingleDie') {
    const probeBudget = createEvaluationBudget(
      Math.max(1, Math.floor(config.maxEvaluations / 6)),
    );
    score = evaluateChanceAction(
      game,
      action,
      config,
      rootPlayerId,
      1,
      probeBudget,
      memo,
    );
    return score;
  }

  const result = applyBotAction(game, action);
  if (result.applied) {
    score = evaluateResolvedTurnUtility(result.game, rootPlayerId, config, memo);
  }
  return score;
}

function getPrioritizedActions(
  game: GameState,
  actions: BotAction[],
  config: LookaheadConfig,
  rootPlayerId: string,
  maximize: boolean,
  memo: SearchMemo,
): BotAction[] {
  const scored = actions.map((action) => ({
    action,
    preScore: getActionPreScore(game, action, config, rootPlayerId, memo),
  }));
  scored.sort((a, b) => {
    const preScoreDelta = maximize
      ? b.preScore - a.preScore
      : a.preScore - b.preScore;
    if (preScoreDelta !== 0) {
      return preScoreDelta;
    }
    return botActionKey(a.action).localeCompare(botActionKey(b.action));
  });
  return scored.map((entry) => entry.action);
}

function approximateRollUtility(
  game: GameState,
  rerolledDieIndices: number[],
  config: LookaheadConfig,
  rootPlayerId: string,
  depth: number,
  budget: EvaluationBudget,
  memo: SearchMemo,
): number {
  const faceCount = game.settings.diceFaces.length;
  const baseUtility = evaluateResolvedTurnUtilityBudgeted(
    game,
    rootPlayerId,
    config,
    budget,
    memo,
  );
  let totalDelta = 0;

  for (const dieIndex of rerolledDieIndices) {
    if ((budget.remainingByPhase[game.state.phase] ?? 0) <= 0) {
      break;
    }
    let dieUtilitySum = 0;
    for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
      if ((budget.remainingByPhase[game.state.phase] ?? 0) <= 0) {
        break;
      }
      const outcomeGame = applyRollOutcome(
        game,
        [dieIndex],
        [faceIndex],
        config,
        rerolledDieIndices.length === 1 ? 'rerollSingleDie' : 'rollDice',
        memo,
      );
      dieUtilitySum += evaluateActionValue(
        outcomeGame,
        config,
        rootPlayerId,
        depth - 1,
        budget,
        memo,
      );
    }
    totalDelta += dieUtilitySum / faceCount - baseUtility;
  }

  return baseUtility + totalDelta;
}

function evaluateChanceAction(
  game: GameState,
  action: Extract<BotAction, { type: 'rollDice' | 'rerollSingleDie' }>,
  config: LookaheadConfig,
  rootPlayerId: string,
  depth: number,
  budget: EvaluationBudget,
  memo: SearchMemo,
): number {
  recordLookaheadMetric(memo, 'evaluateChanceActionCalls');
  const rerolledDieIndices =
    action.type === 'rollDice'
      ? game.state.turn.dice
          .map((die, index) => ({ die, index }))
          .filter((entry) => entry.die.lockDecision === 'unlocked')
          .map((entry) => entry.index)
      : [action.dieIndex];

  if (rerolledDieIndices.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  if (
    action.type === 'rollDice' &&
    rerolledDieIndices.length > config.maxEnumeratedRollDice
  ) {
    return approximateRollUtility(
      game,
      rerolledDieIndices,
      config,
      rootPlayerId,
      depth,
      budget,
      memo,
    );
  }

  const faceCount = game.settings.diceFaces.length;
  const outcomes = enumerateFaceCombinations(rerolledDieIndices.length, faceCount);
  const probability = 1 / Math.max(1, outcomes.length);
  const chanceOutcomes: ChanceOutcome[] = outcomes.map((faces) => ({
    probability,
    game: applyRollOutcome(
      game,
      rerolledDieIndices,
      faces,
      config,
      action.type,
      memo,
    ),
  }));
  recordLookaheadMetric(memo, 'evaluatedChanceOutcomes', chanceOutcomes.length);

  let total = 0;
  for (const outcome of chanceOutcomes) {
    if ((budget.remainingByPhase[outcome.game.state.phase] ?? 0) <= 0) {
      break;
    }
    total +=
      outcome.probability *
      evaluateActionValue(
        outcome.game,
        config,
        rootPlayerId,
        depth - 1,
        budget,
        memo,
      );
  }
  return total;
}

function evaluateDeterministicAction(
  game: GameState,
  action: BotAction,
  config: LookaheadConfig,
  rootPlayerId: string,
  depth: number,
  budget: EvaluationBudget,
  memo: SearchMemo,
): number {
  recordLookaheadMetric(memo, 'evaluateDeterministicActionCalls');
  const result = applyBotAction(game, action);
  const nextGame = result.applied ? result.game : null;
  if (!nextGame) {
    return Number.NEGATIVE_INFINITY;
  }
  return evaluateActionValue(nextGame, config, rootPlayerId, depth - 1, budget, memo);
}

function evaluateActionValue(
  game: GameState,
  config: LookaheadConfig,
  rootPlayerId: string,
  depth: number,
  budget: EvaluationBudget,
  memo: SearchMemo,
): number {
  recordLookaheadMetric(memo, 'evaluateActionValueCalls');
  if (depth <= 0 || (budget.remainingByPhase[game.state.phase] ?? 0) <= 0) {
    return evaluateResolvedTurnUtilityBudgeted(game, rootPlayerId, config, budget, memo);
  }

  const allLegalActions = getLegalBotActions(game);
  if (allLegalActions.length === 0) {
    return evaluateResolvedTurnUtilityBudgeted(game, rootPlayerId, config, budget, memo);
  }

  const activePlayer = game.state.players[game.state.activePlayerIndex];
  const maximize = activePlayer.id === rootPlayerId;
  const legalActions = getPrioritizedActions(
    game,
    allLegalActions,
    config,
    rootPlayerId,
    maximize,
    memo,
  ).slice(0, config.maxActionsPerNode);
  let best = maximize ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (const action of legalActions) {
    if ((budget.remainingByPhase[game.state.phase] ?? 0) <= 0) {
      break;
    }
    const value =
      action.type === 'rollDice' || action.type === 'rerollSingleDie'
        ? evaluateChanceAction(game, action, config, rootPlayerId, depth, budget, memo)
        : evaluateDeterministicAction(
            game,
            action,
            config,
            rootPlayerId,
            depth,
            budget,
            memo,
          );
    if (maximize && value > best) {
      best = value;
    }
    if (!maximize && value < best) {
      best = value;
    }
  }
  const noActionValue =
    (maximize && best === Number.NEGATIVE_INFINITY) ||
    (!maximize && best === Number.POSITIVE_INFINITY);
  return noActionValue
    ? evaluateResolvedTurnUtilityBudgeted(game, rootPlayerId, config, budget, memo)
    : best;
}

function pickBestLookaheadAction(
  game: GameState,
  config: LookaheadConfig,
  memo: SearchMemo,
): BotAction | null {
  const rootPlayerId = game.state.players[game.state.activePlayerIndex]?.id;
  if (!rootPlayerId) {
    return null;
  }
  const rootLegalActions = getLegalBotActions(game);
  const legalActions = getPrioritizedActions(
    game,
    rootLegalActions,
    config,
    rootPlayerId,
    true,
    memo,
  ).slice(0, config.maxActionsPerNode);
  if (legalActions.length === 0) {
    return null;
  }

  const scored = legalActions.map((action) => {
    const budget = createEvaluationBudget(config.maxEvaluations);
    const value =
      action.type === 'rollDice' || action.type === 'rerollSingleDie'
        ? evaluateChanceAction(
            game,
            action,
            config,
            rootPlayerId,
            config.depth,
            budget,
            memo,
          )
        : evaluateDeterministicAction(
            game,
            action,
            config,
            rootPlayerId,
            config.depth,
            budget,
            memo,
          );
    return { action, value };
  });

  scored.sort(
    (a, b) =>
      b.value - a.value || botActionKey(a.action).localeCompare(botActionKey(b.action)),
  );
  return scored[0]?.action ?? null;
}

export function chooseLookaheadBotAction(
  game: GameState,
  config: LookaheadConfig = LOOKAHEAD_STANDARD_CONFIG,
  recordMetric?: (metric: string, value?: number) => void,
): BotAction | null {
  const memo = createSearchMemo(recordMetric);
  const lookaheadAction = pickBestLookaheadAction(game, config, memo);
  if (lookaheadAction) {
    return lookaheadAction;
  }
  return chooseHeuristicBotAction(game, config.heuristicFallbackConfig);
}

export function createLookaheadBot(
  config: LookaheadConfig = LOOKAHEAD_STANDARD_CONFIG,
  id = 'lookahead-standard',
): BotStrategy {
  return {
    id,
    chooseAction: (context: BotContext) =>
      chooseLookaheadBotAction(
        context.game,
        config,
        context.instrumentation?.addMetric,
      ),
  };
}

export const lookaheadStandardBot: BotStrategy = createLookaheadBot(
  LOOKAHEAD_STANDARD_CONFIG,
  'lookahead-standard',
);

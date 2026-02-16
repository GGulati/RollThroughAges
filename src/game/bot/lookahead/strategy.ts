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
import { BotCoreInstrumentation, getBotCoreInstrumentation, resetBotCoreInstrumentation } from '../runner';
import { BotAction, BotContext, BotStrategy } from '../types';
import { LookaheadConfig, LOOKAHEAD_STANDARD_CONFIG } from './config';

type ChanceOutcome = {
  probability: number;
  game: GameState;
  quickScore: number;
};

type EvaluationBudget = {
  remainingByPhase: Record<GamePhase, number>;
};

type MetricRecorder = ((metric: string, value?: number) => void) | undefined;
type LookaheadMetricName =
  | 'chooseActionMsTotal'
  | 'rootActionPrioritizationMsTotal'
  | 'rootActionEvaluationMsTotal'
  | 'rootChanceActionEvaluationMsTotal'
  | 'rootDeterministicActionEvaluationMsTotal'
  | 'fallbackHeuristicMsTotal';

function recordLookaheadMetric(
  recordMetric: MetricRecorder,
  metric: LookaheadMetricName,
  value = 1,
): void {
  recordMetric?.(`lookahead.${metric}`, value);
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function resetLookaheadInstrumentation(strategy?: BotStrategy): void {
  resetBotCoreInstrumentation(strategy);
}

export function getLookaheadInstrumentation(strategy: BotStrategy): BotCoreInstrumentation {
  return getBotCoreInstrumentation(strategy);
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
): number {
  if (config.maxEvaluations <= 0) {
    return 0;
  }
  const normalized = withBestPendingProductionChoices(game, config);
  const rootValue = getPlayerPositionValue(normalized, rootPlayerId, config);
  const opponentValues = normalized.state.players
    .filter((player) => player.id !== rootPlayerId)
    .map((player) => getPlayerPositionValue(normalized, player.id, config));
  const opponentAverage =
    opponentValues.length > 0
      ? opponentValues.reduce((sum, value) => sum + value, 0) / opponentValues.length
      : 0;
  return rootValue - opponentAverage;
}

function evaluateResolvedTurnUtilityBudgeted(
  game: GameState,
  rootPlayerId: string,
  config: LookaheadConfig,
  budget: EvaluationBudget,
): number {
  const phase = game.state.phase;
  const remaining = budget.remainingByPhase[phase] ?? 0;
  if (remaining <= 0) {
    return 0;
  }
  budget.remainingByPhase[phase] = remaining - 1;
  return evaluateResolvedTurnUtility(game, rootPlayerId, config);
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
): GameState {
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
  return outcome;
}

function getFaceQuickScore(
  game: GameState,
  faceIndex: number,
  config: LookaheadConfig,
): number {
  const face = game.settings.diceFaces[faceIndex];
  if (!face || face.production.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }
  const foodWeight = getFoodUrgencyWeight(game, config);
  let best = Number.NEGATIVE_INFINITY;
  for (const production of face.production) {
    const score = scoreProductionChoice(
      production,
      config.heuristicFallbackConfig.productionWeights,
      foodWeight,
    );
    if (score > best) {
      best = score;
    }
  }
  return best;
}

function getCandidateFacesByDie(
  game: GameState,
  rerolledDieIndices: number[],
  config: LookaheadConfig,
): number[][] {
  const faceCount = game.settings.diceFaces.length;
  const fullFaces = Array.from({ length: faceCount }, (_, faceIndex) => faceIndex);
  if (
    rerolledDieIndices.length < config.chanceTopKMinDice ||
    config.chanceTopKFacesPerDie >= faceCount
  ) {
    return rerolledDieIndices.map(() => fullFaces);
  }

  const topK = Math.max(1, Math.min(faceCount, config.chanceTopKFacesPerDie));
  return rerolledDieIndices.map(() => {
    const scored = fullFaces.map((faceIndex) => ({
      faceIndex,
      score: getFaceQuickScore(game, faceIndex, config),
    }));
    scored.sort(
      (a, b) => b.score - a.score || a.faceIndex - b.faceIndex,
    );
    return scored.slice(0, topK).map((entry) => entry.faceIndex);
  });
}

function enumerateFaceCombinationsFromCandidates(candidateFacesByDie: number[][]): number[][] {
  if (candidateFacesByDie.length === 0) {
    return [[]];
  }
  const combinations: number[][] = [];
  const current: number[] = new Array(candidateFacesByDie.length).fill(0);

  const walk = (index: number) => {
    if (index >= candidateFacesByDie.length) {
      combinations.push([...current]);
      return;
    }
    for (const faceIndex of candidateFacesByDie[index]) {
      current[index] = faceIndex;
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
    );
    return score;
  }

  const result = applyBotAction(game, action);
  if (result.applied) {
    score = evaluateResolvedTurnUtility(result.game, rootPlayerId, config);
  }
  return score;
}

function getPrioritizedActions(
  game: GameState,
  actions: BotAction[],
  config: LookaheadConfig,
  rootPlayerId: string,
  maximize: boolean,
): BotAction[] {
  const scored = actions.map((action) => ({
    action,
    preScore: getActionPreScore(game, action, config, rootPlayerId),
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
): number {
  const faceCount = game.settings.diceFaces.length;
  const baseUtility = evaluateResolvedTurnUtilityBudgeted(
    game,
    rootPlayerId,
    config,
    budget,
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
      );
      dieUtilitySum += evaluateActionValue(
        outcomeGame,
        config,
        rootPlayerId,
        depth - 1,
        budget,
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
  rootBestSoFar?: number,
): number {
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
    );
  }

  const faceCount = game.settings.diceFaces.length;
  const exactOutcomeCount = faceCount ** rerolledDieIndices.length;
  const candidateFacesByDie = getCandidateFacesByDie(game, rerolledDieIndices, config);
  const facesToEvaluate = enumerateFaceCombinationsFromCandidates(candidateFacesByDie);
  const trueOutcomeProbability = 1 / Math.max(1, exactOutcomeCount);
  const chanceOutcomes: ChanceOutcome[] = facesToEvaluate.map((faces) => ({
    probability: trueOutcomeProbability,
    game: applyRollOutcome(
      game,
      rerolledDieIndices,
      faces,
      config,
      action.type,
    ),
    quickScore: faces.reduce(
      (sum, faceIndex) => sum + getFaceQuickScore(game, faceIndex, config),
      0,
    ),
  }));
  chanceOutcomes.sort(
    (a, b) => b.quickScore - a.quickScore,
  );

  let total = 0;
  let evaluatedProbability = 0;
  let bestObserved = Number.NEGATIVE_INFINITY;
  const fallbackUtility = evaluateResolvedTurnUtility(game, rootPlayerId, config);
  let evaluatedOutcomes = 0;

  for (const outcome of chanceOutcomes) {
    if ((budget.remainingByPhase[outcome.game.state.phase] ?? 0) <= 0) {
      break;
    }
    const outcomeValue = evaluateActionValue(
      outcome.game,
      config,
      rootPlayerId,
      depth - 1,
      budget,
    );
    total += outcome.probability * outcomeValue;
    evaluatedProbability += outcome.probability;
    evaluatedOutcomes += 1;
    if (outcomeValue > bestObserved) {
      bestObserved = outcomeValue;
    }

    if (
      rootBestSoFar !== undefined &&
      evaluatedOutcomes >= config.chancePruneMinOutcomes
    ) {
      const remainingProbability = Math.max(0, 1 - evaluatedProbability);
      const optimisticRemainingValue =
        remainingProbability * Math.max(bestObserved, fallbackUtility);
      const optimisticTotal = total + optimisticRemainingValue;
      if (optimisticTotal + config.chancePruneSlack < rootBestSoFar) {
        return optimisticTotal;
      }
    }
  }
  const remainingProbability = Math.max(0, 1 - evaluatedProbability);
  return total + remainingProbability * fallbackUtility;
}

function evaluateDeterministicAction(
  game: GameState,
  action: BotAction,
  config: LookaheadConfig,
  rootPlayerId: string,
  depth: number,
  budget: EvaluationBudget,
): number {
  const result = applyBotAction(game, action);
  const nextGame = result.applied ? result.game : null;
  if (!nextGame) {
    return Number.NEGATIVE_INFINITY;
  }
  return evaluateActionValue(
    nextGame,
    config,
    rootPlayerId,
    depth - 1,
    budget,
  );
}

function evaluateActionValue(
  game: GameState,
  config: LookaheadConfig,
  rootPlayerId: string,
  depth: number,
  budget: EvaluationBudget,
): number {
  if (depth <= 0 || (budget.remainingByPhase[game.state.phase] ?? 0) <= 0) {
    return evaluateResolvedTurnUtilityBudgeted(
      game,
      rootPlayerId,
      config,
      budget,
    );
  }

  const allLegalActions = getLegalBotActions(game);
  if (allLegalActions.length === 0) {
    return evaluateResolvedTurnUtilityBudgeted(
      game,
      rootPlayerId,
      config,
      budget,
    );
  }

  const activePlayer = game.state.players[game.state.activePlayerIndex];
  const maximize = activePlayer.id === rootPlayerId;
  const legalActions = getPrioritizedActions(
    game,
    allLegalActions,
    config,
    rootPlayerId,
    maximize,
  ).slice(0, config.maxActionsPerNode);
  let best = maximize ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (const action of legalActions) {
    if ((budget.remainingByPhase[game.state.phase] ?? 0) <= 0) {
      break;
    }
    const value =
      action.type === 'rollDice' || action.type === 'rerollSingleDie'
        ? evaluateChanceAction(
            game,
            action,
            config,
            rootPlayerId,
            depth,
            budget,
          )
        : evaluateDeterministicAction(
            game,
            action,
            config,
            rootPlayerId,
            depth,
            budget,
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
    ? evaluateResolvedTurnUtilityBudgeted(
        game,
        rootPlayerId,
        config,
        budget,
      )
    : best;
}

function pickBestLookaheadAction(
  game: GameState,
  config: LookaheadConfig,
  recordMetric: MetricRecorder,
): BotAction | null {
  const rootPlayerId = game.state.players[game.state.activePlayerIndex]?.id;
  if (!rootPlayerId) {
    return null;
  }
  const prioritizeStartMs = nowMs();
  const rootLegalActions = getLegalBotActions(game);
  const legalActions = getPrioritizedActions(
    game,
    rootLegalActions,
    config,
    rootPlayerId,
    true,
  ).slice(0, config.maxActionsPerNode);
  recordLookaheadMetric(
    recordMetric,
    'rootActionPrioritizationMsTotal',
    nowMs() - prioritizeStartMs,
  );
  if (legalActions.length === 0) {
    return null;
  }

  let bestAction: BotAction | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  let bestActionKey = '';

  for (const action of legalActions) {
    const actionStartMs = nowMs();
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
            bestValue,
          )
        : evaluateDeterministicAction(
            game,
            action,
            config,
            rootPlayerId,
            config.depth,
            budget,
          );
    const elapsedMs = nowMs() - actionStartMs;
    recordLookaheadMetric(recordMetric, 'rootActionEvaluationMsTotal', elapsedMs);
    if (action.type === 'rollDice' || action.type === 'rerollSingleDie') {
      recordLookaheadMetric(recordMetric, 'rootChanceActionEvaluationMsTotal', elapsedMs);
    } else {
      recordLookaheadMetric(
        recordMetric,
        'rootDeterministicActionEvaluationMsTotal',
        elapsedMs,
      );
    }
    const actionKey = botActionKey(action);
    if (
      value > bestValue ||
      (value === bestValue && (bestAction === null || actionKey.localeCompare(bestActionKey) < 0))
    ) {
      bestValue = value;
      bestAction = action;
      bestActionKey = actionKey;
    }
  }

  return bestAction;
}

export function chooseLookaheadBotAction(
  game: GameState,
  config: LookaheadConfig = LOOKAHEAD_STANDARD_CONFIG,
  recordMetric?: (metric: string, value?: number) => void,
): BotAction | null {
  const chooseStartMs = nowMs();
  const lookaheadAction = pickBestLookaheadAction(game, config, recordMetric);
  recordLookaheadMetric(recordMetric, 'chooseActionMsTotal', nowMs() - chooseStartMs);
  if (lookaheadAction) {
    return lookaheadAction;
  }
  const fallbackStartMs = nowMs();
  const fallbackAction = chooseHeuristicBotAction(game, config.heuristicFallbackConfig);
  recordLookaheadMetric(recordMetric, 'fallbackHeuristicMsTotal', nowMs() - fallbackStartMs);
  return fallbackAction;
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

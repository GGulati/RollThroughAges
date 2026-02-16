import { ResourceProduction } from '../../dice';
import { autoAdvanceForcedPhases, getMaxRollsAllowed, resolveProduction } from '../../engine';
import { GamePhase, GameState } from '../../game';
import { applyBotAction } from '../actionAdapter';
import { botActionKey } from '../actionKey';
import { getLegalBotActions } from '../candidates';
import { chooseHeuristicBotAction } from '../heuristic';
import { BotAction, BotContext, BotStrategy } from '../types';
import { LookaheadConfig, LOOKAHEAD_STANDARD_CONFIG } from './config';

type ChanceOutcome = {
  probability: number;
  game: GameState;
};

type EvaluationBudget = {
  remaining: number;
};

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

function evaluateResolvedTurnUtility(game: GameState, config: LookaheadConfig): number {
  if (config.maxEvaluations <= 0) {
    return 0;
  }
  const normalized = withBestPendingProductionChoices(game, config);
  const resolved = resolveProduction(
    normalized.state,
    normalized.state.players,
    normalized.settings,
  );
  const foodWeight =
    getFoodUrgencyWeight(normalized, config) +
    resolved.foodShortage * 4;
  const productionScore = scoreProductionChoice(
    resolved.turnProduction,
    config.heuristicFallbackConfig.productionWeights,
    foodWeight,
  );
  const starvationPenalty =
    resolved.foodShortage *
    config.heuristicFallbackConfig.foodPolicyWeights.starvationPenaltyPerUnit;
  return productionScore - starvationPenalty;
}

function evaluateResolvedTurnUtilityBudgeted(
  game: GameState,
  config: LookaheadConfig,
  budget: EvaluationBudget,
): number {
  if (budget.remaining <= 0) {
    return 0;
  }
  budget.remaining -= 1;
  return evaluateResolvedTurnUtility(game, config);
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

  return autoAdvanceForcedPhases({
    ...game,
    state: nextState,
  });
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

function limitOutcomesDeterministically<T>(
  outcomes: T[],
  limit: number,
): T[] {
  if (outcomes.length <= limit || limit <= 0) {
    return outcomes;
  }
  const selected: T[] = [];
  const step = outcomes.length / limit;
  for (let i = 0; i < limit; i += 1) {
    selected.push(outcomes[Math.floor(i * step)]);
  }
  return selected;
}

function approximateRollUtility(
  game: GameState,
  rerolledDieIndices: number[],
  config: LookaheadConfig,
  depth: number,
  budget: EvaluationBudget,
): number {
  const faceCount = game.settings.diceFaces.length;
  const baseUtility = evaluateResolvedTurnUtilityBudgeted(game, config, budget);
  let totalDelta = 0;

  for (const dieIndex of rerolledDieIndices) {
    if (budget.remaining <= 0) {
      break;
    }
    let dieUtilitySum = 0;
    for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
      if (budget.remaining <= 0) {
        break;
      }
      const outcomeGame = applyRollOutcome(
        game,
        [dieIndex],
        [faceIndex],
        config,
        rerolledDieIndices.length === 1 ? 'rerollSingleDie' : 'rollDice',
      );
      dieUtilitySum += evaluateActionValue(outcomeGame, config, depth - 1, budget);
    }
    totalDelta += dieUtilitySum / faceCount - baseUtility;
  }

  return baseUtility + totalDelta;
}

function evaluateChanceAction(
  game: GameState,
  action: Extract<BotAction, { type: 'rollDice' | 'rerollSingleDie' }>,
  config: LookaheadConfig,
  depth: number,
  budget: EvaluationBudget,
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
    return approximateRollUtility(game, rerolledDieIndices, config, depth, budget);
  }

  const faceCount = game.settings.diceFaces.length;
  const outcomes = enumerateFaceCombinations(rerolledDieIndices.length, faceCount);
  const boundedOutcomes = limitOutcomesDeterministically(
    outcomes,
    config.maxChanceOutcomesPerAction,
  );
  const probability = 1 / Math.max(1, boundedOutcomes.length);
  const chanceOutcomes: ChanceOutcome[] = boundedOutcomes.map((faces) => ({
    probability,
    game: applyRollOutcome(game, rerolledDieIndices, faces, config, action.type),
  }));

  let total = 0;
  for (const outcome of chanceOutcomes) {
    if (budget.remaining <= 0) {
      break;
    }
    total +=
      outcome.probability *
      evaluateActionValue(outcome.game, config, depth - 1, budget);
  }
  return total;
}

function evaluateDeterministicAction(
  game: GameState,
  action: BotAction,
  config: LookaheadConfig,
  depth: number,
  budget: EvaluationBudget,
): number {
  const result = applyBotAction(game, action);
  if (!result.applied) {
    return Number.NEGATIVE_INFINITY;
  }
  return evaluateActionValue(result.game, config, depth - 1, budget);
}

function evaluateActionValue(
  game: GameState,
  config: LookaheadConfig,
  depth: number,
  budget: EvaluationBudget,
): number {
  if (depth <= 0 || budget.remaining <= 0) {
    return evaluateResolvedTurnUtilityBudgeted(game, config, budget);
  }

  const legalActions = getLegalBotActions(game)
    .sort((a, b) => botActionKey(a).localeCompare(botActionKey(b)))
    .slice(0, config.maxActionsPerNode);
  if (legalActions.length === 0) {
    return evaluateResolvedTurnUtilityBudgeted(game, config, budget);
  }

  let best = Number.NEGATIVE_INFINITY;
  for (const action of legalActions) {
    if (budget.remaining <= 0) {
      break;
    }
    const value =
      action.type === 'rollDice' || action.type === 'rerollSingleDie'
        ? evaluateChanceAction(game, action, config, depth, budget)
        : evaluateDeterministicAction(game, action, config, depth, budget);
    if (value > best) {
      best = value;
    }
  }
  return best === Number.NEGATIVE_INFINITY
    ? evaluateResolvedTurnUtilityBudgeted(game, config, budget)
    : best;
}

function pickBestRollPhaseAction(
  game: GameState,
  config: LookaheadConfig,
): BotAction | null {
  const budget: EvaluationBudget = { remaining: config.maxEvaluations };
  const legalActions = getLegalBotActions(game)
    .sort((a, b) => botActionKey(a).localeCompare(botActionKey(b)))
    .slice(0, config.maxActionsPerNode);
  if (legalActions.length === 0) {
    return null;
  }

  const scored = legalActions.map((action) => {
    const value =
      action.type === 'rollDice' || action.type === 'rerollSingleDie'
        ? evaluateChanceAction(game, action, config, config.depth, budget)
        : evaluateDeterministicAction(game, action, config, config.depth, budget);
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
): BotAction | null {
  if (game.state.phase !== GamePhase.RollDice) {
    return chooseHeuristicBotAction(game, config.heuristicFallbackConfig);
  }
  return pickBestRollPhaseAction(game, config);
}

export function createLookaheadBot(
  config: LookaheadConfig = LOOKAHEAD_STANDARD_CONFIG,
  id = 'lookahead-standard',
): BotStrategy {
  return {
    id,
    chooseAction: (context: BotContext) =>
      chooseLookaheadBotAction(context.game, config),
  };
}

export const lookaheadStandardBot: BotStrategy = createLookaheadBot(
  LOOKAHEAD_STANDARD_CONFIG,
  'lookahead-standard',
);

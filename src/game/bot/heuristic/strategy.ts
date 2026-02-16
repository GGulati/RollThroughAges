import { GamePhase, GameState } from '../../game';
import { ResourceProduction } from '../../dice';
import {
  getCitiesToFeed,
  getGoodsValue,
  getMaxRollsAllowed,
  resolveProduction,
} from '../../engine';
import { BotAction, BotContext, BotStrategy } from '../types';
import { getLegalBotActions } from '../candidates';
import { botActionKey } from '../actionKey';
import {
  HeuristicBuildTarget,
  HeuristicConfig,
  HeuristicProductionWeights,
  HEURISTIC_STANDARD_CONFIG,
} from './config';

function scoreProductionChoice(
  production: ResourceProduction,
  weights: HeuristicProductionWeights,
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

function getFoodUrgencyWeight(game: GameState, config: HeuristicConfig): number {
  const activePlayer = game.state.players[game.state.activePlayerIndex];
  const citiesToFeed = getCitiesToFeed(activePlayer);
  const currentFood = activePlayer.food;
  const deficit = Math.max(0, citiesToFeed - currentFood);
  return config.productionWeights.food + deficit * 3;
}

function evaluateResolvedTurnUtility(game: GameState, config: HeuristicConfig): number {
  const resolved = resolveProduction(game.state, game.state.players, game.settings);
  const foodWeight = getFoodUrgencyWeight(game, config) + resolved.foodShortage * 4;
  const productionScore = scoreProductionChoice(
    resolved.turnProduction,
    config.productionWeights,
    foodWeight,
  );
  const starvationPenalty = resolved.foodShortage * 20;
  return productionScore - starvationPenalty;
}

function applyProductionChoice(
  game: GameState,
  action: Extract<BotAction, { type: 'selectProduction' }>,
): GameState {
  const nextDice = game.state.turn.dice.map((die, index) =>
    index === action.dieIndex ? { ...die, productionIndex: action.productionIndex } : die,
  );
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

function scoreDieProduction(
  production: ResourceProduction,
  config: HeuristicConfig,
  foodWeight: number,
): number {
  return scoreProductionChoice(production, config.productionWeights, foodWeight);
}

function getCurrentDieScore(
  game: GameState,
  dieIndex: number,
  config: HeuristicConfig,
  foodWeight: number,
): number {
  const die = game.state.turn.dice[dieIndex];
  const face = game.settings.diceFaces[die.diceFaceIndex];
  if (!face || face.production.length === 0) {
    return 0;
  }

  const selected = die.productionIndex;
  if (selected >= 0 && selected < face.production.length) {
    return scoreDieProduction(face.production[selected], config, foodWeight);
  }

  return Math.max(
    ...face.production.map((production) =>
      scoreDieProduction(production, config, foodWeight),
    ),
  );
}

function getBestFaceScore(
  game: GameState,
  config: HeuristicConfig,
  foodWeight: number,
): number {
  return Math.max(
    ...game.settings.diceFaces.map((face) =>
      Math.max(
        ...face.production.map((production) =>
          scoreDieProduction(production, config, foodWeight),
        ),
      ),
    ),
  );
}

function estimateExpectedRerollGain(game: GameState, config: HeuristicConfig): number {
  const foodWeight = getFoodUrgencyWeight(game, config);
  const bestFaceScore = getBestFaceScore(game, config, foodWeight);
  let bestCaseGain = 0;

  game.state.turn.dice.forEach((die, index) => {
    if (die.lockDecision !== 'unlocked') {
      return;
    }
    const currentScore = getCurrentDieScore(game, index, config, foodWeight);
    bestCaseGain += Math.max(0, bestFaceScore - currentScore);
  });

  // Convert optimistic gain into expected gain for one reroll.
  return bestCaseGain * 0.35;
}

function shouldRollDice(
  game: GameState,
  legalActions: BotAction[],
  config: HeuristicConfig,
): boolean {
  const hasRollAction = legalActions.some((action) => action.type === 'rollDice');
  if (!hasRollAction) {
    return false;
  }

  const activePlayer = game.state.players[game.state.activePlayerIndex];
  const rerollsRemaining =
    getMaxRollsAllowed(activePlayer, game.settings) - game.state.turn.rollsUsed;
  if (rerollsRemaining <= 0) {
    return false;
  }

  const resolved = resolveProduction(game.state, game.state.players, game.settings);
  if (resolved.foodShortage > 0) {
    return true;
  }

  if (resolved.turnProduction.skulls >= 2) {
    return false;
  }

  const currentUtility = evaluateResolvedTurnUtility(game, config);
  const expectedRerollGain = estimateExpectedRerollGain(game, config);
  if (expectedRerollGain <= 1) {
    return false;
  }

  if (resolved.turnProduction.skulls === 1 && expectedRerollGain < 3) {
    return false;
  }

  // If the current resolved turn is already solid, require stronger upside.
  if (currentUtility >= 0 && expectedRerollGain < 2) {
    return false;
  }

  return true;
}

function pickDeterministic(actions: BotAction[]): BotAction | null {
  if (actions.length === 0) {
    return null;
  }
  return [...actions].sort((a, b) => botActionKey(a).localeCompare(botActionKey(b)))[0];
}

function pickBestProductionChoice(
  game: GameState,
  actions: BotAction[],
  config: HeuristicConfig,
): BotAction | null {
  const choices = actions.filter((action) => action.type === 'selectProduction');
  if (choices.length === 0) {
    return null;
  }

  const scored = choices.map((action) => {
    const hypotheticalGame = applyProductionChoice(game, action);
    return {
      action,
      score: evaluateResolvedTurnUtility(hypotheticalGame, config),
    };
  });
  scored.sort(
    (a, b) =>
      b.score - a.score || botActionKey(a.action).localeCompare(botActionKey(b.action)),
  );
  return scored[0].action;
}

function pickBuildAction(
  legalActions: BotAction[],
  priority: HeuristicBuildTarget[],
): BotAction | null {
  for (const target of priority) {
    if (target === 'city') {
      const city = pickDeterministic(
        legalActions.filter((action) => action.type === 'buildCity'),
      );
      if (city) {
        return city;
      }
      continue;
    }

    const monument = pickDeterministic(
      legalActions.filter((action) => action.type === 'buildMonument'),
    );
    if (monument) {
      return monument;
    }
  }

  return null;
}

function scoreDiscardAction(
  game: GameState,
  action: Extract<BotAction, { type: 'discardGoods' }>,
): number {
  const player = game.state.players[game.state.activePlayerIndex];
  let score = 0;
  for (const goodsType of player.goods.keys()) {
    const keepQuantity = action.goodsToKeepByType[goodsType.name] ?? 0;
    score += getGoodsValue(goodsType, keepQuantity);
  }
  return score;
}

function pickBestDiscardAction(
  game: GameState,
  legalActions: BotAction[],
): BotAction | null {
  const discardActions = legalActions.filter(
    (action): action is Extract<BotAction, { type: 'discardGoods' }> =>
      action.type === 'discardGoods',
  );
  if (discardActions.length === 0) {
    return null;
  }

  const scored = discardActions.map((action) => ({
    action,
    score: scoreDiscardAction(game, action),
  }));
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      botActionKey(a.action).localeCompare(botActionKey(b.action)),
  );
  return scored[0].action;
}

function chooseForPhase(
  game: GameState,
  legalActions: BotAction[],
  config: HeuristicConfig,
): BotAction | null {
  const phase = game.state.phase;

  if (phase === GamePhase.RollDice) {
    const productionChoice = pickBestProductionChoice(game, legalActions, config);
    if (productionChoice) {
      return productionChoice;
    }
    const roll = legalActions.find((action) => action.type === 'rollDice');
    if (roll && shouldRollDice(game, legalActions, config)) {
      return roll;
    }
    const keep = pickDeterministic(
      legalActions.filter((action) => action.type === 'keepDie'),
    );
    if (keep) {
      return keep;
    }
    const singleDieReroll = pickDeterministic(
      legalActions.filter((action) => action.type === 'rerollSingleDie'),
    );
    if (singleDieReroll) {
      return singleDieReroll;
    }
    return pickDeterministic(legalActions);
  }

  if (phase === GamePhase.DecideDice) {
    const productionChoice = pickBestProductionChoice(game, legalActions, config);
    if (productionChoice) {
      return productionChoice;
    }
    const resolve = legalActions.find((action) => action.type === 'resolveProduction');
    if (resolve) {
      return resolve;
    }
    return pickDeterministic(legalActions);
  }

  if (phase === GamePhase.ResolveProduction) {
    return legalActions.find((action) => action.type === 'resolveProduction') ?? null;
  }

  if (phase === GamePhase.Build) {
    const buildAction = pickBuildAction(legalActions, config.buildPriority);
    if (buildAction) {
      return buildAction;
    }
    return null;
  }

  if (phase === GamePhase.Development) {
    if (config.preferExchangeBeforeDevelopment) {
      const exchangeFirst = pickDeterministic(
        legalActions.filter((action) => action.type === 'applyExchange'),
      );
      if (exchangeFirst) {
        return exchangeFirst;
      }
    }

    const developmentActions = legalActions.filter(
      (action): action is Extract<BotAction, { type: 'buyDevelopment' }> =>
        action.type === 'buyDevelopment',
    );
    if (developmentActions.length > 0) {
      const scored = developmentActions.map((action) => {
        const activePlayer = game.state.players[game.state.activePlayerIndex];
        const definition = game.settings.developmentDefinitions.find(
          (development) => development.id === action.developmentId,
        );
        const spendValue = action.goodsTypeNames.reduce((sum, goodsTypeName) => {
          const goodsType = Array.from(activePlayer.goods.keys()).find(
            (entry) => entry.name === goodsTypeName,
          );
          if (!goodsType) {
            return sum;
          }
          const quantity = activePlayer.goods.get(goodsType) ?? 0;
          return sum + getGoodsValue(goodsType, quantity);
        }, 0);
        return {
          action,
          score:
            (definition?.points ?? 0) * config.developmentWeights.points +
            (definition?.cost ?? 0) * config.developmentWeights.cost -
            spendValue * 0.001,
        };
      });
      scored.sort(
        (a, b) =>
          b.score - a.score ||
          botActionKey(a.action).localeCompare(botActionKey(b.action)),
      );
      return scored[0].action;
    }

    const exchange = pickDeterministic(
      legalActions.filter((action) => action.type === 'applyExchange'),
    );
    if (exchange) {
      return exchange;
    }
    return legalActions.find((action) => action.type === 'skipDevelopment') ?? null;
  }

  if (phase === GamePhase.DiscardGoods) {
    return pickBestDiscardAction(game, legalActions);
  }

  if (phase === GamePhase.EndTurn) {
    return legalActions.find((action) => action.type === 'endTurn') ?? null;
  }

  return pickDeterministic(legalActions);
}

export function chooseHeuristicBotAction(
  game: GameState,
  config: HeuristicConfig,
): BotAction | null {
  const legalActions = getLegalBotActions(game);
  return chooseForPhase(game, legalActions, config);
}

export function createHeuristicBot(
  config: HeuristicConfig,
  id = 'heuristic-custom',
): BotStrategy {
  return {
    id,
    chooseAction: (context: BotContext) =>
      chooseHeuristicBotAction(context.game, config),
  };
}

export const heuristicStandardBot: BotStrategy = createHeuristicBot(
  HEURISTIC_STANDARD_CONFIG,
  'heuristic-standard',
);

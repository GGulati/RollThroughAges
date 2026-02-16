import { GamePhase, GameState } from '../../game';
import { ResourceProduction } from '../../dice';
import { getGoodsValue } from '../../engine';
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
): number {
  return (
    production.workers * weights.workers +
    production.coins * weights.coins +
    production.food * weights.food +
    production.goods * weights.goods +
    production.skulls * weights.skulls
  );
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
    const die = game.state.turn.dice[action.dieIndex];
    const production =
      game.settings.diceFaces[die.diceFaceIndex].production[action.productionIndex];
    return {
      action,
      score: scoreProductionChoice(production, config.productionWeights),
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
    const roll = legalActions.find((action) => action.type === 'rollDice');
    if (roll) {
      return roll;
    }
    const productionChoice = pickBestProductionChoice(game, legalActions, config);
    if (productionChoice) {
      return productionChoice;
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

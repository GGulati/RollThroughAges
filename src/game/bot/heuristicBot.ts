import { GamePhase, GameState } from '../game';
import { BotAction, BotContext, BotStrategy } from './types';
import { getLegalBotActions, scoreProductionChoice } from './candidates';
import { botActionKey } from './actionKey';

function pickDeterministic(actions: BotAction[]): BotAction | null {
  if (actions.length === 0) {
    return null;
  }
  return [...actions].sort((a, b) => botActionKey(a).localeCompare(botActionKey(b)))[0];
}

function pickBestProductionChoice(game: GameState, actions: BotAction[]): BotAction | null {
  const choices = actions.filter((action) => action.type === 'selectProduction');
  if (choices.length === 0) {
    return null;
  }

  const scored = choices.map((action) => {
    const die = game.state.turn.dice[action.dieIndex];
    const production =
      game.settings.diceFaces[die.diceFaceIndex].production[action.productionIndex];
    return { action, score: scoreProductionChoice(production) };
  });
  scored.sort(
    (a, b) =>
      b.score - a.score || botActionKey(a.action).localeCompare(botActionKey(b.action)),
  );
  return scored[0].action;
}

function chooseForPhase(game: GameState, legalActions: BotAction[]): BotAction | null {
  const phase = game.state.phase;

  if (phase === GamePhase.RollDice) {
    const roll = legalActions.find((action) => action.type === 'rollDice');
    if (roll) {
      return roll;
    }
    const productionChoice = pickBestProductionChoice(game, legalActions);
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
    const productionChoice = pickBestProductionChoice(game, legalActions);
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
    const city = pickDeterministic(
      legalActions.filter((action) => action.type === 'buildCity'),
    );
    if (city) {
      return city;
    }
    const monument = pickDeterministic(
      legalActions.filter((action) => action.type === 'buildMonument'),
    );
    if (monument) {
      return monument;
    }
    return null;
  }

  if (phase === GamePhase.Development) {
    const developmentActions = legalActions.filter(
      (action): action is Extract<BotAction, { type: 'buyDevelopment' }> =>
        action.type === 'buyDevelopment',
    );
    if (developmentActions.length > 0) {
      const scored = developmentActions.map((action) => {
        const definition = game.settings.developmentDefinitions.find(
          (development) => development.id === action.developmentId,
        );
        return {
          action,
          cost: definition?.cost ?? 0,
          points: definition?.points ?? 0,
        };
      });
      scored.sort(
        (a, b) =>
          b.points - a.points ||
          b.cost - a.cost ||
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
    return legalActions.find((action) => action.type === 'discardGoods') ?? null;
  }

  if (phase === GamePhase.EndTurn) {
    return legalActions.find((action) => action.type === 'endTurn') ?? null;
  }

  return pickDeterministic(legalActions);
}

export function chooseHeuristicBotAction(game: GameState): BotAction | null {
  const legalActions = getLegalBotActions(game);
  return chooseForPhase(game, legalActions);
}

export const heuristicStandardBot: BotStrategy = {
  id: 'heuristic-standard',
  chooseAction: (context: BotContext) => chooseHeuristicBotAction(context.game),
};

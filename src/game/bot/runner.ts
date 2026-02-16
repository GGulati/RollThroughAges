import { isGameOver } from '../engine';
import { GameState } from '../game';
import { BotAction, BotContext, BotStrategy } from './types';
import { getLegalBotActions } from './candidates';
import { botActionKey } from './actionKey';
import { applyBotAction } from './actionAdapter';

export type BotStepTrace = {
  phaseBefore: GameState['state']['phase'];
  phaseAfter: GameState['state']['phase'];
  requestedAction: BotAction | null;
  appliedAction: BotAction | null;
  usedFallback: boolean;
  error?: string;
};

export type RunBotStepResult = {
  game: GameState;
  applied: boolean;
  action: BotAction | null;
  trace: BotStepTrace;
};

export type RunBotTurnOptions = {
  maxSteps?: number;
};

export type RunBotTurnResult = {
  game: GameState;
  completedTurn: boolean;
  steps: number;
  trace: BotStepTrace[];
};

function chooseFallbackAction(legalActions: BotAction[]): BotAction | null {
  if (legalActions.length === 0) {
    return null;
  }
  return [...legalActions].sort((a, b) => botActionKey(a).localeCompare(botActionKey(b)))[0];
}

function findRequestedAction(
  legalActions: BotAction[],
  requestedAction: BotAction | null,
): BotAction | null {
  if (!requestedAction) {
    return null;
  }
  return (
    legalActions.find((action) => botActionKey(action) === botActionKey(requestedAction)) ??
    null
  );
}

export function runBotStep(game: GameState, strategy: BotStrategy): RunBotStepResult {
  const phaseBefore = game.state.phase;
  const legalActions = getLegalBotActions(game);
  if (legalActions.length === 0) {
    return {
      game,
      applied: false,
      action: null,
      trace: {
        phaseBefore,
        phaseAfter: game.state.phase,
        requestedAction: null,
        appliedAction: null,
        usedFallback: false,
        error: 'No legal bot actions available.',
      },
    };
  }

  const context: BotContext = { game };
  const requestedAction = strategy.chooseAction(context);
  const matchedRequestedAction = findRequestedAction(legalActions, requestedAction);
  const primaryAction = matchedRequestedAction ?? chooseFallbackAction(legalActions);
  if (!primaryAction) {
    return {
      game,
      applied: false,
      action: null,
      trace: {
        phaseBefore,
        phaseAfter: game.state.phase,
        requestedAction,
        appliedAction: null,
        usedFallback: matchedRequestedAction === null,
        error: 'No primary bot action selected.',
      },
    };
  }

  const primaryAttempt = applyBotAction(game, primaryAction);
  if (primaryAttempt.applied) {
    return {
      game: primaryAttempt.game,
      applied: true,
      action: primaryAction,
      trace: {
        phaseBefore,
        phaseAfter: primaryAttempt.game.state.phase,
        requestedAction,
        appliedAction: primaryAction,
        usedFallback: matchedRequestedAction === null,
      },
    };
  }

  for (const action of legalActions) {
    if (botActionKey(action) === botActionKey(primaryAction)) {
      continue;
    }
    const fallbackAttempt = applyBotAction(game, action);
    if (fallbackAttempt.applied) {
      return {
        game: fallbackAttempt.game,
        applied: true,
        action,
        trace: {
          phaseBefore,
          phaseAfter: fallbackAttempt.game.state.phase,
          requestedAction,
          appliedAction: action,
          usedFallback: true,
        },
      };
    }
  }

  return {
    game,
    applied: false,
    action: null,
    trace: {
      phaseBefore,
      phaseAfter: game.state.phase,
      requestedAction,
      appliedAction: null,
      usedFallback: matchedRequestedAction === null,
      error: primaryAttempt.error ?? 'All legal bot actions failed to apply.',
    },
  };
}

export function runBotTurn(
  game: GameState,
  strategy: BotStrategy,
  options: RunBotTurnOptions = {},
): RunBotTurnResult {
  const maxSteps = options.maxSteps ?? 200;
  const trace: BotStepTrace[] = [];
  let current = game;
  const startPlayerIndex = game.state.activePlayerIndex;
  const startPlayerId = game.state.turn.activePlayerId;
  const startRound = game.state.round;

  let steps = 0;
  while (
    steps < maxSteps &&
    !isGameOver(current) &&
    current.state.activePlayerIndex === startPlayerIndex &&
    current.state.turn.activePlayerId === startPlayerId &&
    current.state.round === startRound
  ) {
    const stepResult = runBotStep(current, strategy);
    trace.push(stepResult.trace);
    if (!stepResult.applied) {
      break;
    }
    current = stepResult.game;
    steps += 1;
  }

  const completedTurn =
    current.state.activePlayerIndex !== startPlayerIndex ||
    current.state.turn.activePlayerId !== startPlayerId ||
    current.state.round !== startRound;

  return {
    game: current,
    completedTurn,
    steps,
    trace,
  };
}

import { isGameOver } from '../engine';
import { autoAdvanceForcedPhases } from '../engine';
import { GameState } from '../game';
import { BotAction, BotContext, BotStrategy } from './types';
import { getLegalBotActions } from './candidates';
import { botActionKey } from './actionKey';
import { applyBotAction } from './actionAdapter';

export type BotCoreInstrumentation = {
  runBotStepCalls: number;
  runBotStepMsTotal: number;
  runBotTurnCalls: number;
  runBotTurnMsTotal: number;
  runBotTurnStepsTotal: number;
  runBotTurnCompletedTurns: number;
  strategyChooseActionCalls: number;
  strategyChooseActionMsTotal: number;
  applyBotActionAttempts: number;
  applyBotActionSuccesses: number;
  fallbackSelections: number;
  fallbackApplyAttempts: number;
  strategyExtensionMetrics: Record<string, number>;
};

function createEmptyBotCoreInstrumentation(): BotCoreInstrumentation {
  return {
    runBotStepCalls: 0,
    runBotStepMsTotal: 0,
    runBotTurnCalls: 0,
    runBotTurnMsTotal: 0,
    runBotTurnStepsTotal: 0,
    runBotTurnCompletedTurns: 0,
    strategyChooseActionCalls: 0,
    strategyChooseActionMsTotal: 0,
    applyBotActionAttempts: 0,
    applyBotActionSuccesses: 0,
    fallbackSelections: 0,
    fallbackApplyAttempts: 0,
    strategyExtensionMetrics: {},
  };
}

const botCoreInstrumentation = createEmptyBotCoreInstrumentation();

export function resetBotCoreInstrumentation(): void {
  Object.assign(botCoreInstrumentation, createEmptyBotCoreInstrumentation());
}

export function getBotCoreInstrumentation(): BotCoreInstrumentation {
  return { ...botCoreInstrumentation };
}

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
  botCoreInstrumentation.runBotStepCalls += 1;
  const stepStartMs = Date.now();
  const normalizedGame = autoAdvanceForcedPhases(game);
  const phaseBefore = normalizedGame.state.phase;
  const legalActions = getLegalBotActions(normalizedGame);
  if (legalActions.length === 0) {
    botCoreInstrumentation.runBotStepMsTotal += Date.now() - stepStartMs;
    return {
      game: normalizedGame,
      applied: false,
      action: null,
      trace: {
        phaseBefore,
        phaseAfter: normalizedGame.state.phase,
        requestedAction: null,
        appliedAction: null,
        usedFallback: false,
        error: 'No legal bot actions available.',
      },
    };
  }

  const context: BotContext = { game: normalizedGame };
  context.instrumentation = {
    strategyId: strategy.id,
    addMetric: (metric: string, value = 1) => {
      const key = `${strategy.id}.${metric}`;
      botCoreInstrumentation.strategyExtensionMetrics[key] =
        (botCoreInstrumentation.strategyExtensionMetrics[key] ?? 0) + value;
    },
  };
  botCoreInstrumentation.strategyChooseActionCalls += 1;
  const chooseStartMs = Date.now();
  const requestedAction = strategy.chooseAction(context);
  botCoreInstrumentation.strategyChooseActionMsTotal += Date.now() - chooseStartMs;
  const matchedRequestedAction = findRequestedAction(legalActions, requestedAction);
  if (matchedRequestedAction === null) {
    botCoreInstrumentation.fallbackSelections += 1;
  }
  const primaryAction = matchedRequestedAction ?? chooseFallbackAction(legalActions);
  if (!primaryAction) {
    botCoreInstrumentation.runBotStepMsTotal += Date.now() - stepStartMs;
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

  botCoreInstrumentation.applyBotActionAttempts += 1;
  const primaryAttempt = applyBotAction(normalizedGame, primaryAction);
  if (primaryAttempt.applied) {
    botCoreInstrumentation.applyBotActionSuccesses += 1;
    botCoreInstrumentation.runBotStepMsTotal += Date.now() - stepStartMs;
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
    botCoreInstrumentation.fallbackApplyAttempts += 1;
    botCoreInstrumentation.applyBotActionAttempts += 1;
    const fallbackAttempt = applyBotAction(normalizedGame, action);
    if (fallbackAttempt.applied) {
      botCoreInstrumentation.applyBotActionSuccesses += 1;
      botCoreInstrumentation.runBotStepMsTotal += Date.now() - stepStartMs;
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

  botCoreInstrumentation.runBotStepMsTotal += Date.now() - stepStartMs;
  return {
    game: normalizedGame,
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
  botCoreInstrumentation.runBotTurnCalls += 1;
  const turnStartMs = Date.now();
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
  if (completedTurn) {
    botCoreInstrumentation.runBotTurnCompletedTurns += 1;
  }
  botCoreInstrumentation.runBotTurnStepsTotal += steps;
  botCoreInstrumentation.runBotTurnMsTotal += Date.now() - turnStartMs;

  return {
    game: current,
    completedTurn,
    steps,
    trace,
  };
}

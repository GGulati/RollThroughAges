import { isGameOver } from '../engine';
import { autoAdvanceForcedPhases } from '../engine';
import { GameState } from '../game';
import { BotAction, BotContext, BotStrategy } from './types';
import { getLegalBotActions } from './candidates';
import { botActionKey } from './actionKey';
import { applyBotAction } from './actionAdapter';

export type BotActorInstrumentation = {
  strategyId: string;
  runBotStepCalls: number;
  runBotStepMsTotal: number;
  runBotStepOverheadMsTotal: number;
  runBotTurnCalls: number;
  runBotTurnMsTotal: number;
  runBotTurnOverheadMsTotal: number;
  runBotTurnStepsTotal: number;
  runBotTurnCompletedTurns: number;
  strategyChooseActionCalls: number;
  strategyChooseActionMsTotal: number;
  applyBotActionMsTotal: number;
  applyBotActionAttempts: number;
  applyBotActionSuccesses: number;
  fallbackSelections: number;
  fallbackApplyAttempts: number;
  strategyExtensionMetrics: Record<string, number>;
};

export type BotCoreInstrumentation = {
  runBotStepCalls: number;
  runBotStepMsTotal: number;
  runBotStepOverheadMsTotal: number;
  runBotTurnCalls: number;
  runBotTurnMsTotal: number;
  runBotTurnOverheadMsTotal: number;
  runBotTurnStepsTotal: number;
  runBotTurnCompletedTurns: number;
  strategyChooseActionCalls: number;
  strategyChooseActionMsTotal: number;
  applyBotActionMsTotal: number;
  applyBotActionAttempts: number;
  applyBotActionSuccesses: number;
  fallbackSelections: number;
  fallbackApplyAttempts: number;
  byActorId: Record<string, BotActorInstrumentation>;
};

function createEmptyBotActorInstrumentation(strategyId: string): BotActorInstrumentation {
  return {
    strategyId,
    runBotStepCalls: 0,
    runBotStepMsTotal: 0,
    runBotStepOverheadMsTotal: 0,
    runBotTurnCalls: 0,
    runBotTurnMsTotal: 0,
    runBotTurnOverheadMsTotal: 0,
    runBotTurnStepsTotal: 0,
    runBotTurnCompletedTurns: 0,
    strategyChooseActionCalls: 0,
    strategyChooseActionMsTotal: 0,
    applyBotActionMsTotal: 0,
    applyBotActionAttempts: 0,
    applyBotActionSuccesses: 0,
    fallbackSelections: 0,
    fallbackApplyAttempts: 0,
    strategyExtensionMetrics: {},
  };
}

function createEmptyBotCoreInstrumentation(): BotCoreInstrumentation {
  return {
    runBotStepCalls: 0,
    runBotStepMsTotal: 0,
    runBotStepOverheadMsTotal: 0,
    runBotTurnCalls: 0,
    runBotTurnMsTotal: 0,
    runBotTurnOverheadMsTotal: 0,
    runBotTurnStepsTotal: 0,
    runBotTurnCompletedTurns: 0,
    strategyChooseActionCalls: 0,
    strategyChooseActionMsTotal: 0,
    applyBotActionMsTotal: 0,
    applyBotActionAttempts: 0,
    applyBotActionSuccesses: 0,
    fallbackSelections: 0,
    fallbackApplyAttempts: 0,
    byActorId: {},
  };
}

const botCoreInstrumentation = createEmptyBotCoreInstrumentation();

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function resetBotCoreInstrumentation(): void {
  Object.assign(botCoreInstrumentation, createEmptyBotCoreInstrumentation());
}

export function getBotCoreInstrumentation(): BotCoreInstrumentation {
  const byActorId = Object.fromEntries(
    Object.entries(botCoreInstrumentation.byActorId).map(([actorId, stats]) => [
      actorId,
      {
        ...stats,
        strategyExtensionMetrics: { ...stats.strategyExtensionMetrics },
      },
    ]),
  );
  return {
    ...botCoreInstrumentation,
    byActorId,
  };
}

function getActorInstrumentation(
  actorId: string,
  strategyId: string,
): BotActorInstrumentation {
  const existing = botCoreInstrumentation.byActorId[actorId];
  if (existing) {
    if (existing.strategyId !== strategyId) {
      existing.strategyId = strategyId;
    }
    return existing;
  }
  const created = createEmptyBotActorInstrumentation(strategyId);
  botCoreInstrumentation.byActorId[actorId] = created;
  return created;
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
  const stepStartMs = nowMs();
  let chooseElapsedMs = 0;
  let applyElapsedMs = 0;
  const normalizedGame = autoAdvanceForcedPhases(game);
  const actorId = normalizedGame.state.turn.activePlayerId;
  const actorStats = getActorInstrumentation(actorId, strategy.id);
  actorStats.runBotStepCalls += 1;
  const phaseBefore = normalizedGame.state.phase;
  const legalActions = getLegalBotActions(normalizedGame);
  if (legalActions.length === 0) {
    const elapsedMs = nowMs() - stepStartMs;
    botCoreInstrumentation.runBotStepMsTotal += elapsedMs;
    actorStats.runBotStepMsTotal += elapsedMs;
    botCoreInstrumentation.runBotStepOverheadMsTotal += elapsedMs;
    actorStats.runBotStepOverheadMsTotal += elapsedMs;
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
      actorStats.strategyExtensionMetrics[key] =
        (actorStats.strategyExtensionMetrics[key] ?? 0) + value;
    },
  };
  botCoreInstrumentation.strategyChooseActionCalls += 1;
  actorStats.strategyChooseActionCalls += 1;
  const chooseStartMs = nowMs();
  const requestedAction = strategy.chooseAction(context);
  chooseElapsedMs = nowMs() - chooseStartMs;
  botCoreInstrumentation.strategyChooseActionMsTotal += chooseElapsedMs;
  actorStats.strategyChooseActionMsTotal += chooseElapsedMs;
  const matchedRequestedAction = findRequestedAction(legalActions, requestedAction);
  if (matchedRequestedAction === null) {
    botCoreInstrumentation.fallbackSelections += 1;
    actorStats.fallbackSelections += 1;
  }
  const primaryAction = matchedRequestedAction ?? chooseFallbackAction(legalActions);
  if (!primaryAction) {
    const elapsedMs = nowMs() - stepStartMs;
    const overheadMs = Math.max(0, elapsedMs - chooseElapsedMs - applyElapsedMs);
    botCoreInstrumentation.runBotStepMsTotal += elapsedMs;
    actorStats.runBotStepMsTotal += elapsedMs;
    botCoreInstrumentation.runBotStepOverheadMsTotal += overheadMs;
    actorStats.runBotStepOverheadMsTotal += overheadMs;
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
  actorStats.applyBotActionAttempts += 1;
  const applyStartMs = nowMs();
  const primaryAttempt = applyBotAction(normalizedGame, primaryAction);
  const primaryApplyElapsedMs = nowMs() - applyStartMs;
  applyElapsedMs += primaryApplyElapsedMs;
  botCoreInstrumentation.applyBotActionMsTotal += primaryApplyElapsedMs;
  actorStats.applyBotActionMsTotal += primaryApplyElapsedMs;
  if (primaryAttempt.applied) {
    botCoreInstrumentation.applyBotActionSuccesses += 1;
    actorStats.applyBotActionSuccesses += 1;
    const elapsedMs = nowMs() - stepStartMs;
    const overheadMs = Math.max(0, elapsedMs - chooseElapsedMs - applyElapsedMs);
    botCoreInstrumentation.runBotStepMsTotal += elapsedMs;
    actorStats.runBotStepMsTotal += elapsedMs;
    botCoreInstrumentation.runBotStepOverheadMsTotal += overheadMs;
    actorStats.runBotStepOverheadMsTotal += overheadMs;
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
    actorStats.fallbackApplyAttempts += 1;
    botCoreInstrumentation.applyBotActionAttempts += 1;
    actorStats.applyBotActionAttempts += 1;
    const fallbackApplyStartMs = nowMs();
    const fallbackAttempt = applyBotAction(normalizedGame, action);
    const fallbackApplyElapsedMs = nowMs() - fallbackApplyStartMs;
    applyElapsedMs += fallbackApplyElapsedMs;
    botCoreInstrumentation.applyBotActionMsTotal += fallbackApplyElapsedMs;
    actorStats.applyBotActionMsTotal += fallbackApplyElapsedMs;
    if (fallbackAttempt.applied) {
      botCoreInstrumentation.applyBotActionSuccesses += 1;
      actorStats.applyBotActionSuccesses += 1;
      const elapsedMs = nowMs() - stepStartMs;
      const overheadMs = Math.max(0, elapsedMs - chooseElapsedMs - applyElapsedMs);
      botCoreInstrumentation.runBotStepMsTotal += elapsedMs;
      actorStats.runBotStepMsTotal += elapsedMs;
      botCoreInstrumentation.runBotStepOverheadMsTotal += overheadMs;
      actorStats.runBotStepOverheadMsTotal += overheadMs;
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

  const elapsedMs = nowMs() - stepStartMs;
  const overheadMs = Math.max(0, elapsedMs - chooseElapsedMs - applyElapsedMs);
  botCoreInstrumentation.runBotStepMsTotal += elapsedMs;
  actorStats.runBotStepMsTotal += elapsedMs;
  botCoreInstrumentation.runBotStepOverheadMsTotal += overheadMs;
  actorStats.runBotStepOverheadMsTotal += overheadMs;
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
  const actorId = game.state.turn.activePlayerId;
  const actorStats = getActorInstrumentation(actorId, strategy.id);
  actorStats.runBotTurnCalls += 1;
  const turnStartMs = nowMs();
  const maxSteps = options.maxSteps ?? 200;
  const trace: BotStepTrace[] = [];
  let current = game;
  const chooseMsBeforeTurn = actorStats.strategyChooseActionMsTotal;
  const applyMsBeforeTurn = actorStats.applyBotActionMsTotal;
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
    actorStats.runBotTurnCompletedTurns += 1;
  }
  botCoreInstrumentation.runBotTurnStepsTotal += steps;
  actorStats.runBotTurnStepsTotal += steps;
  const elapsedMs = nowMs() - turnStartMs;
  botCoreInstrumentation.runBotTurnMsTotal += elapsedMs;
  actorStats.runBotTurnMsTotal += elapsedMs;
  const chooseMsInTurn = actorStats.strategyChooseActionMsTotal - chooseMsBeforeTurn;
  const applyMsInTurn = actorStats.applyBotActionMsTotal - applyMsBeforeTurn;
  const turnOverheadMs = Math.max(0, elapsedMs - chooseMsInTurn - applyMsInTurn);
  botCoreInstrumentation.runBotTurnOverheadMsTotal += turnOverheadMs;
  actorStats.runBotTurnOverheadMsTotal += turnOverheadMs;

  return {
    game: current,
    completedTurn,
    steps,
    trace,
  };
}

import { isGameOver } from '../engine';
import { autoAdvanceForcedPhases } from '../engine';
import { GameState } from '../game';
import { BotAction, BotContext, BotStrategy } from '../bot/types';
import { getLegalBotActions } from '../bot/candidates';
import { botActionKey } from '../bot/actionKey';
import { applyBotAction } from '../bot/actionAdapter';

export const CORE_BOT_METRIC_KEYS = [
  'runBotStepCalls',
  'runBotStepMsTotal',
  'runBotStepOverheadMsTotal',
  'runBotTurnCalls',
  'runBotTurnMsTotal',
  'runBotTurnOverheadMsTotal',
  'runBotTurnStepsTotal',
  'runBotTurnCompletedTurns',
  'strategyChooseActionCalls',
  'strategyChooseActionMsTotal',
  'applyBotActionMsTotal',
  'applyBotActionAttempts',
  'applyBotActionSuccesses',
  'fallbackSelections',
  'fallbackApplyAttempts',
] as const;

export type CoreBotMetricKey = (typeof CORE_BOT_METRIC_KEYS)[number];
export type BotMetricMap = Record<string, number>;

export type BotActorInstrumentation = {
  strategyId: string;
  metrics: BotMetricMap;
};

export type BotCoreInstrumentation = {
  metrics: BotMetricMap;
  byActorId: Record<string, BotActorInstrumentation>;
};

function createEmptyMetricMap(): BotMetricMap {
  return CORE_BOT_METRIC_KEYS.reduce(
    (acc, key) => {
      acc[key] = 0;
      return acc;
    },
    {} as BotMetricMap,
  );
}

function createEmptyBotActorInstrumentation(strategyId: string): BotActorInstrumentation {
  return {
    strategyId,
    metrics: createEmptyMetricMap(),
  };
}

function createEmptyBotCoreInstrumentation(): BotCoreInstrumentation {
  return {
    metrics: createEmptyMetricMap(),
    byActorId: {},
  };
}

const botCoreInstrumentationByStrategy = new Map<BotStrategy, BotCoreInstrumentation>();

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function incrementMetric(metrics: BotMetricMap, metric: string, value = 1): void {
  metrics[metric] = (metrics[metric] ?? 0) + value;
}

function getOrCreateBotCoreInstrumentation(strategy: BotStrategy): BotCoreInstrumentation {
  const existing = botCoreInstrumentationByStrategy.get(strategy);
  if (existing) {
    return existing;
  }
  const created = createEmptyBotCoreInstrumentation();
  botCoreInstrumentationByStrategy.set(strategy, created);
  return created;
}

function cloneBotCoreInstrumentation(
  instrumentation: BotCoreInstrumentation,
): BotCoreInstrumentation {
  const byActorId = Object.fromEntries(
    Object.entries(instrumentation.byActorId).map(([actorId, stats]) => [
      actorId,
      {
        ...stats,
        metrics: { ...stats.metrics },
      },
    ]),
  );
  return {
    metrics: { ...instrumentation.metrics },
    byActorId,
  };
}

export function resetBotCoreInstrumentation(strategy?: BotStrategy): void {
  if (strategy) {
    botCoreInstrumentationByStrategy.set(strategy, createEmptyBotCoreInstrumentation());
    return;
  }
  botCoreInstrumentationByStrategy.clear();
}

export function getBotCoreInstrumentation(strategy: BotStrategy): BotCoreInstrumentation {
  return cloneBotCoreInstrumentation(getOrCreateBotCoreInstrumentation(strategy));
}

function getActorInstrumentation(
  instrumentation: BotCoreInstrumentation,
  actorId: string,
  strategyId: string,
): BotActorInstrumentation {
  const existing = instrumentation.byActorId[actorId];
  if (existing) {
    if (existing.strategyId !== strategyId) {
      existing.strategyId = strategyId;
    }
    return existing;
  }
  const created = createEmptyBotActorInstrumentation(strategyId);
  instrumentation.byActorId[actorId] = created;
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
  const coreInstrumentation = getOrCreateBotCoreInstrumentation(strategy);
  incrementMetric(coreInstrumentation.metrics, 'runBotStepCalls');
  const stepStartMs = nowMs();
  let chooseElapsedMs = 0;
  let applyElapsedMs = 0;
  const normalizedGame = autoAdvanceForcedPhases(game);
  const actorId = normalizedGame.state.turn.activePlayerId;
  const actorStats = getActorInstrumentation(coreInstrumentation, actorId, strategy.id);
  incrementMetric(actorStats.metrics, 'runBotStepCalls');
  const phaseBefore = normalizedGame.state.phase;
  const legalActions = getLegalBotActions(normalizedGame);
  if (legalActions.length === 0) {
    const elapsedMs = nowMs() - stepStartMs;
    incrementMetric(coreInstrumentation.metrics, 'runBotStepMsTotal', elapsedMs);
    incrementMetric(actorStats.metrics, 'runBotStepMsTotal', elapsedMs);
    incrementMetric(coreInstrumentation.metrics, 'runBotStepOverheadMsTotal', elapsedMs);
    incrementMetric(actorStats.metrics, 'runBotStepOverheadMsTotal', elapsedMs);
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
      incrementMetric(actorStats.metrics, key, value);
    },
  };
  incrementMetric(coreInstrumentation.metrics, 'strategyChooseActionCalls');
  incrementMetric(actorStats.metrics, 'strategyChooseActionCalls');
  const chooseStartMs = nowMs();
  const requestedAction = strategy.chooseAction(context);
  chooseElapsedMs = nowMs() - chooseStartMs;
  incrementMetric(coreInstrumentation.metrics, 'strategyChooseActionMsTotal', chooseElapsedMs);
  incrementMetric(actorStats.metrics, 'strategyChooseActionMsTotal', chooseElapsedMs);
  const matchedRequestedAction = findRequestedAction(legalActions, requestedAction);
  if (matchedRequestedAction === null) {
    incrementMetric(coreInstrumentation.metrics, 'fallbackSelections');
    incrementMetric(actorStats.metrics, 'fallbackSelections');
  }
  const primaryAction = matchedRequestedAction ?? chooseFallbackAction(legalActions);
  if (!primaryAction) {
    const elapsedMs = nowMs() - stepStartMs;
    const overheadMs = Math.max(0, elapsedMs - chooseElapsedMs - applyElapsedMs);
    incrementMetric(coreInstrumentation.metrics, 'runBotStepMsTotal', elapsedMs);
    incrementMetric(actorStats.metrics, 'runBotStepMsTotal', elapsedMs);
    incrementMetric(coreInstrumentation.metrics, 'runBotStepOverheadMsTotal', overheadMs);
    incrementMetric(actorStats.metrics, 'runBotStepOverheadMsTotal', overheadMs);
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

  incrementMetric(coreInstrumentation.metrics, 'applyBotActionAttempts');
  incrementMetric(actorStats.metrics, 'applyBotActionAttempts');
  const applyStartMs = nowMs();
  const primaryAttempt = applyBotAction(normalizedGame, primaryAction);
  const primaryApplyElapsedMs = nowMs() - applyStartMs;
  applyElapsedMs += primaryApplyElapsedMs;
  incrementMetric(coreInstrumentation.metrics, 'applyBotActionMsTotal', primaryApplyElapsedMs);
  incrementMetric(actorStats.metrics, 'applyBotActionMsTotal', primaryApplyElapsedMs);
  if (primaryAttempt.applied) {
    incrementMetric(coreInstrumentation.metrics, 'applyBotActionSuccesses');
    incrementMetric(actorStats.metrics, 'applyBotActionSuccesses');
    const elapsedMs = nowMs() - stepStartMs;
    const overheadMs = Math.max(0, elapsedMs - chooseElapsedMs - applyElapsedMs);
    incrementMetric(coreInstrumentation.metrics, 'runBotStepMsTotal', elapsedMs);
    incrementMetric(actorStats.metrics, 'runBotStepMsTotal', elapsedMs);
    incrementMetric(coreInstrumentation.metrics, 'runBotStepOverheadMsTotal', overheadMs);
    incrementMetric(actorStats.metrics, 'runBotStepOverheadMsTotal', overheadMs);
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
    incrementMetric(coreInstrumentation.metrics, 'fallbackApplyAttempts');
    incrementMetric(actorStats.metrics, 'fallbackApplyAttempts');
    incrementMetric(coreInstrumentation.metrics, 'applyBotActionAttempts');
    incrementMetric(actorStats.metrics, 'applyBotActionAttempts');
    const fallbackApplyStartMs = nowMs();
    const fallbackAttempt = applyBotAction(normalizedGame, action);
    const fallbackApplyElapsedMs = nowMs() - fallbackApplyStartMs;
    applyElapsedMs += fallbackApplyElapsedMs;
    incrementMetric(coreInstrumentation.metrics, 'applyBotActionMsTotal', fallbackApplyElapsedMs);
    incrementMetric(actorStats.metrics, 'applyBotActionMsTotal', fallbackApplyElapsedMs);
    if (fallbackAttempt.applied) {
      incrementMetric(coreInstrumentation.metrics, 'applyBotActionSuccesses');
      incrementMetric(actorStats.metrics, 'applyBotActionSuccesses');
      const elapsedMs = nowMs() - stepStartMs;
      const overheadMs = Math.max(0, elapsedMs - chooseElapsedMs - applyElapsedMs);
      incrementMetric(coreInstrumentation.metrics, 'runBotStepMsTotal', elapsedMs);
      incrementMetric(actorStats.metrics, 'runBotStepMsTotal', elapsedMs);
      incrementMetric(coreInstrumentation.metrics, 'runBotStepOverheadMsTotal', overheadMs);
      incrementMetric(actorStats.metrics, 'runBotStepOverheadMsTotal', overheadMs);
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
  incrementMetric(coreInstrumentation.metrics, 'runBotStepMsTotal', elapsedMs);
  incrementMetric(actorStats.metrics, 'runBotStepMsTotal', elapsedMs);
  incrementMetric(coreInstrumentation.metrics, 'runBotStepOverheadMsTotal', overheadMs);
  incrementMetric(actorStats.metrics, 'runBotStepOverheadMsTotal', overheadMs);
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
  const coreInstrumentation = getOrCreateBotCoreInstrumentation(strategy);
  incrementMetric(coreInstrumentation.metrics, 'runBotTurnCalls');
  const actorId = game.state.turn.activePlayerId;
  const actorStats = getActorInstrumentation(coreInstrumentation, actorId, strategy.id);
  incrementMetric(actorStats.metrics, 'runBotTurnCalls');
  const turnStartMs = nowMs();
  const maxSteps = options.maxSteps ?? 200;
  const trace: BotStepTrace[] = [];
  let current = game;
  const chooseMsBeforeTurn = actorStats.metrics.strategyChooseActionMsTotal ?? 0;
  const applyMsBeforeTurn = actorStats.metrics.applyBotActionMsTotal ?? 0;
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
    incrementMetric(coreInstrumentation.metrics, 'runBotTurnCompletedTurns');
    incrementMetric(actorStats.metrics, 'runBotTurnCompletedTurns');
  }
  incrementMetric(coreInstrumentation.metrics, 'runBotTurnStepsTotal', steps);
  incrementMetric(actorStats.metrics, 'runBotTurnStepsTotal', steps);
  const elapsedMs = nowMs() - turnStartMs;
  incrementMetric(coreInstrumentation.metrics, 'runBotTurnMsTotal', elapsedMs);
  incrementMetric(actorStats.metrics, 'runBotTurnMsTotal', elapsedMs);
  const chooseMsInTurn = (actorStats.metrics.strategyChooseActionMsTotal ?? 0) - chooseMsBeforeTurn;
  const applyMsInTurn = (actorStats.metrics.applyBotActionMsTotal ?? 0) - applyMsBeforeTurn;
  const turnOverheadMs = Math.max(0, elapsedMs - chooseMsInTurn - applyMsInTurn);
  incrementMetric(coreInstrumentation.metrics, 'runBotTurnOverheadMsTotal', turnOverheadMs);
  incrementMetric(actorStats.metrics, 'runBotTurnOverheadMsTotal', turnOverheadMs);

  return {
    game: current,
    completedTurn,
    steps,
    trace,
  };
}

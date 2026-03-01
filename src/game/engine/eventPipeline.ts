import { DomainEvent, DomainEventType, EngineResult, GameState } from '@/game';

type MutableDomainEvent = DomainEvent & {
  _meta?: {
    suppressed?: boolean;
    appliedEffectKeys: string[];
  };
};

type TransformContext = {
  game: GameState;
};

export type EventTransformResult = {
  event?: MutableDomainEvent;
  derivedEvents?: MutableDomainEvent[];
  resolutionEvents?: MutableDomainEvent[];
};

export type EventTransformProcessor = {
  key: string;
  appliesTo: (event: MutableDomainEvent, context: TransformContext) => boolean;
  transform: (
    event: MutableDomainEvent,
    context: TransformContext,
  ) => EventTransformResult;
};

export type PipelineOptions = {
  maxTransformPasses?: number;
  maxDerivedEventsPerCommand?: number;
};

type RunPipelineArgs<TState> = {
  game: GameState;
  emit: (game: GameState) => MutableDomainEvent[];
  processors: EventTransformProcessor[];
  fold: (game: GameState, appliedEvents: DomainEvent[]) => TState;
  finalize?: (
    transformedEvents: MutableDomainEvent[],
    resolutionEvents: MutableDomainEvent[],
  ) => { appliedEvents: DomainEvent[]; resolutionEvents: DomainEvent[] };
  options?: PipelineOptions;
};

const DEFAULT_MAX_TRANSFORM_PASSES = 4;
const DEFAULT_MAX_DERIVED_EVENTS = 200;

function toMutableEvent(event: DomainEvent): MutableDomainEvent {
  return {
    ...event,
    _meta: {
      suppressed: false,
      appliedEffectKeys: [],
    },
  };
}

function stripMeta(event: MutableDomainEvent): DomainEvent {
  const { _meta: _unused, ...base } = event;
  return base;
}

function createDiagnosticEvent(
  game: GameState,
  id: string,
  reason: string,
): MutableDomainEvent {
  return {
    id,
    type: 'diagnostic',
    actorPlayerId: game.state.turn.activePlayerId,
    round: game.state.round,
    phase: game.state.phase,
    payload: { reason },
    _meta: {
      suppressed: false,
      appliedEffectKeys: [],
    },
  };
}

export function runEventPipeline<TState>({
  game,
  emit,
  processors,
  fold,
  finalize,
  options,
}: RunPipelineArgs<TState>): EngineResult<TState> {
  const maxTransformPasses =
    options?.maxTransformPasses ?? DEFAULT_MAX_TRANSFORM_PASSES;
  const maxDerivedEventsPerCommand =
    options?.maxDerivedEventsPerCommand ?? DEFAULT_MAX_DERIVED_EVENTS;
  const context: TransformContext = { game };

  let resolutionEvents: MutableDomainEvent[] = [];
  let transformedEvents: MutableDomainEvent[] = emit(game).map(toMutableEvent);
  let derivedCount = 0;
  let nextSyntheticEventId = 1;

  const nextDiagnosticId = () => `diag-${nextSyntheticEventId++}`;
  const nextDerivedId = () => `drv-${nextSyntheticEventId++}`;

  let hitTransformPassCap = false;
  let hitDerivedCap = false;

  for (let pass = 0; pass < maxTransformPasses; pass += 1) {
    let changed = false;
    const nextEvents: MutableDomainEvent[] = [];

    for (const sourceEvent of transformedEvents) {
      let currentEvent = sourceEvent;
      const passDerivedEvents: MutableDomainEvent[] = [];

      for (const processor of processors) {
        if (currentEvent._meta?.suppressed) {
          break;
        }
        if (
          currentEvent._meta?.appliedEffectKeys.includes(processor.key) ||
          !processor.appliesTo(currentEvent, context)
        ) {
          continue;
        }

        const result = processor.transform(currentEvent, context);
        if (result.resolutionEvents && result.resolutionEvents.length > 0) {
          resolutionEvents = [...resolutionEvents, ...result.resolutionEvents];
        }
        if (result.derivedEvents && result.derivedEvents.length > 0) {
          const normalizedDerived = result.derivedEvents.map((event) =>
            toMutableEvent({
              ...event,
              id: event.id || nextDerivedId(),
            }),
          );
          derivedCount += normalizedDerived.length;
          if (derivedCount > maxDerivedEventsPerCommand) {
            hitDerivedCap = true;
            break;
          }
          passDerivedEvents.push(...normalizedDerived);
          changed = true;
        }

        if (result.event) {
          currentEvent = {
            ...result.event,
            _meta: {
              suppressed: result.event._meta?.suppressed ?? false,
              appliedEffectKeys: [
                ...(result.event._meta?.appliedEffectKeys ?? []),
                processor.key,
              ],
            },
          };
          changed = true;
        } else {
          currentEvent = {
            ...currentEvent,
            _meta: {
              suppressed: currentEvent._meta?.suppressed ?? false,
              appliedEffectKeys: [
                ...(currentEvent._meta?.appliedEffectKeys ?? []),
                processor.key,
              ],
            },
          };
        }
      }

      nextEvents.push(currentEvent, ...passDerivedEvents);
      if (hitDerivedCap) {
        break;
      }
    }

    transformedEvents = nextEvents;
    if (hitDerivedCap) {
      break;
    }
    if (!changed) {
      break;
    }
    if (pass === maxTransformPasses - 1) {
      hitTransformPassCap = true;
    }
  }

  if (hitTransformPassCap) {
    resolutionEvents.push(
      createDiagnosticEvent(
        game,
        nextDiagnosticId(),
        'maxTransformPasses exceeded before convergence',
      ),
    );
  }
  if (hitDerivedCap) {
    resolutionEvents.push(
      createDiagnosticEvent(
        game,
        nextDiagnosticId(),
        'maxDerivedEventsPerCommand exceeded',
      ),
    );
  }

  const defaultFinalized = {
    appliedEvents: transformedEvents
      .filter((event) => !event._meta?.suppressed)
      .map(stripMeta),
    resolutionEvents: resolutionEvents.map(stripMeta),
  };

  const finalized = finalize
    ? finalize(transformedEvents, resolutionEvents)
    : defaultFinalized;

  const nextState = fold(game, finalized.appliedEvents);
  return {
    nextState,
    resolutionEvents: finalized.resolutionEvents,
    appliedEvents: finalized.appliedEvents,
  };
}

export function createEngineEvent(
  game: GameState,
  id: string,
  type: DomainEventType,
  payload: Record<string, unknown>,
  overrides: Partial<Pick<DomainEvent, 'actorPlayerId' | 'round' | 'phase'>> = {},
): DomainEvent {
  return {
    id,
    type,
    actorPlayerId: overrides.actorPlayerId ?? game.state.turn.activePlayerId,
    round: overrides.round ?? game.state.round,
    phase: overrides.phase ?? game.state.phase,
    payload,
  };
}


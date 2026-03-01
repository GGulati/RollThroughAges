import { describe, expect, it } from 'vitest';
import { runEventPipeline, EventTransformProcessor } from '../../game/engine/eventPipeline';
import { createTestGame } from '../testUtils';

describe('eventPipeline', () => {
  it('applies processors once per event key (no transform loop)', () => {
    const game = createTestGame(2);
    const processor: EventTransformProcessor = {
      key: 'toggle',
      appliesTo: (event) => event.type === 'production_resolved',
      transform: (event) => ({
        event: {
          ...event,
          payload: {
            ...event.payload,
            toggled: true,
          },
        },
      }),
    };

    const result = runEventPipeline({
      game,
      emit: () => [
        {
          id: 'evt-1',
          type: 'production_resolved',
          actorPlayerId: game.state.turn.activePlayerId,
          round: game.state.round,
          phase: game.state.phase,
          payload: {},
        },
      ],
      processors: [processor],
      fold: (currentGame) => currentGame,
    });

    expect(result.appliedEvents).toHaveLength(1);
    expect(result.appliedEvents[0].payload.toggled).toBe(true);
    expect(result.resolutionEvents).toEqual([]);
  });

  it('emits deterministic diagnostic event when derived cap is exceeded', () => {
    const game = createTestGame(2);
    const fanoutProcessor: EventTransformProcessor = {
      key: 'fanout',
      appliesTo: (event) => event.type === 'production_resolved',
      transform: (event) => ({
        derivedEvents: [
          {
            ...event,
            id: `${event.id}-child`,
          },
        ],
      }),
    };

    const result = runEventPipeline({
      game,
      emit: () => [
        {
          id: 'evt-1',
          type: 'production_resolved',
          actorPlayerId: game.state.turn.activePlayerId,
          round: game.state.round,
          phase: game.state.phase,
          payload: {},
        },
      ],
      processors: [fanoutProcessor],
      fold: (currentGame) => currentGame,
      options: {
        maxTransformPasses: 10,
        maxDerivedEventsPerCommand: 2,
      },
    });

    expect(
      result.resolutionEvents.some(
        (event) =>
          event.type === 'diagnostic' &&
          String(event.payload.reason).includes('maxDerivedEventsPerCommand'),
      ),
    ).toBe(true);
  });
});


import { DomainEvent, EngineResult, GameState, ImpactedPlayers } from '@/game';
import {
  countSkulls,
  calculateDiceProduction,
} from './diceEngine';
import {
  hasDisasterImmunity,
  getRewrittenDisasterTargeting,
  getTriggeredDisaster,
} from './disasterEngine';
import { resolveProductionPhase } from './phaseTransitionEngine';
import { createEngineEvent, EventTransformProcessor, runEventPipeline } from './eventPipeline';
import { getCitiesToFeed } from './productionEngine';

function targetPlayerIdsFromScope(
  game: GameState,
  activePlayerIndex: number,
  scope: ImpactedPlayers,
): number[] {
  const total = game.state.players.length;
  if (scope === 'self') {
    return [activePlayerIndex];
  }
  if (scope === 'all') {
    return Array.from({ length: total }, (_, index) => index);
  }
  return Array.from({ length: total }, (_, index) => index).filter(
    (index) => index !== activePlayerIndex,
  );
}

function getImmunitySourceName(
  game: GameState,
  playerIndex: number,
  disasterId: string,
): string | null {
  const player = game.state.players[playerIndex];
  const development = game.settings.developmentDefinitions.find(
    (definition) =>
      player.developments.includes(definition.id) &&
      definition.specialEffect.type === 'disasterImmunity' &&
      definition.specialEffect.disasterId === disasterId,
  );
  if (development) {
    return development.name;
  }
  const monument = game.settings.monumentDefinitions.find(
    (definition) =>
      definition.specialEffect?.type === 'disasterImmunity' &&
      definition.specialEffect.disasterId === disasterId &&
      Boolean(player.monuments[definition.id]?.completed),
  );
  return monument?.requirements.name ?? null;
}

const rewriteDisasterTargetingProcessor: EventTransformProcessor = {
  key: 'rewriteDisasterTargeting',
  appliesTo: (event) =>
    event.type === 'penalty_applied' && event.payload.kind === 'disaster',
  transform: (event, context) => {
    const disasterId = event.payload.disasterId;
    if (typeof disasterId !== 'string' || disasterId.length === 0) {
      return { event };
    }
    const activePlayer = context.game.state.players[context.game.state.activePlayerIndex];
    const rewrittenScope = getRewrittenDisasterTargeting(
      activePlayer,
      disasterId,
      context.game.settings,
    );
    if (!rewrittenScope) {
      return { event };
    }

    const targetPlayerIndices = targetPlayerIdsFromScope(
      context.game,
      context.game.state.activePlayerIndex,
      rewrittenScope,
    );
    return {
      event: {
        ...event,
        payload: {
          ...event.payload,
          targetScope: rewrittenScope,
          targetPlayerIndices,
          rewritten: true,
        },
      },
      resolutionEvents: [
        {
          ...event,
          id: `${event.id}:rewrite`,
          payload: {
            ...event.payload,
            rewriteApplied: true,
            targetScope: rewrittenScope,
            targetPlayerIndices,
          },
        },
      ],
    };
  },
};

const disasterImmunityProcessor: EventTransformProcessor = {
  key: 'disasterImmunity',
  appliesTo: (event) =>
    event.type === 'penalty_applied' && event.payload.kind === 'disaster',
  transform: (event, context) => {
    const disasterId = event.payload.disasterId;
    const targetIndices = Array.isArray(event.payload.targetPlayerIndices)
      ? event.payload.targetPlayerIndices
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value))
      : [];
    if (typeof disasterId !== 'string' || disasterId.length === 0 || targetIndices.length === 0) {
      return { event };
    }

    const appliedTargets: number[] = [];
    const immunityEvents: DomainEvent[] = [];
    for (const playerIndex of targetIndices) {
      const targetPlayer = context.game.state.players[playerIndex];
      if (!targetPlayer) {
        continue;
      }
      const hasImmunity = hasDisasterImmunity(
        targetPlayer,
        disasterId,
        context.game.settings,
      );
      if (!hasImmunity) {
        appliedTargets.push(playerIndex);
        continue;
      }

      immunityEvents.push({
        ...event,
        id: `${event.id}:immune:${playerIndex}`,
        actorPlayerId: targetPlayer.id,
        payload: {
          kind: 'disasterImmunity',
          disasterId,
          targetPlayerIndex: playerIndex,
          targetPlayerId: targetPlayer.id,
          prevented: true,
          source: getImmunitySourceName(context.game, playerIndex, disasterId),
        },
      });
    }

    const suppressed = appliedTargets.length === 0;
    return {
      event: {
        ...event,
        payload: {
          ...event.payload,
          targetPlayerIndices: appliedTargets,
        },
        _meta: {
          suppressed,
          appliedEffectKeys: event._meta?.appliedEffectKeys ?? [],
        },
      },
      derivedEvents: immunityEvents,
    };
  },
};

export function resolveProductionWithEvents(
  game: GameState,
): EngineResult<GameState> {
  let nextEventId = 1;
  const makeEventId = (prefix: string) => `${prefix}-${nextEventId++}`;
  const activePlayer = game.state.players[game.state.activePlayerIndex];

  return runEventPipeline<GameState>({
    game,
    emit: (currentGame) => {
      const production = calculateDiceProduction(
        currentGame.state.turn.dice,
        activePlayer,
        currentGame.settings,
      );
      const skulls = countSkulls(currentGame.state.turn.dice, currentGame.settings);
      const events: DomainEvent[] = [
        createEngineEvent(
          currentGame,
          makeEventId('production'),
          'production_resolved',
          {
            food: production.food,
            workers: production.workers,
            coins: production.coins,
            goods: production.goods,
            skulls,
          },
        ),
      ];

      const foodShortage = Math.max(
        0,
        getCitiesToFeed(activePlayer) - (activePlayer.food + production.food),
      );
      if (foodShortage > 0) {
        events.push(
          createEngineEvent(
            currentGame,
            makeEventId('penalty'),
            'penalty_applied',
            {
              kind: 'foodShortage',
              amount: foodShortage,
              targetPlayerIndices: [currentGame.state.activePlayerIndex],
            },
          ),
        );
      }

      const disaster = getTriggeredDisaster(skulls, currentGame.settings);
      if (disaster) {
        events.push(
          createEngineEvent(
            currentGame,
            makeEventId('disaster'),
            'penalty_applied',
            {
              kind: 'disaster',
              disasterId: disaster.id,
              disasterName: disaster.name,
              pointsDelta: disaster.pointsDelta,
              clearsGoods: disaster.clearsGoods,
              targetScope: disaster.affectedPlayers,
              targetPlayerIndices: targetPlayerIdsFromScope(
                currentGame,
                currentGame.state.activePlayerIndex,
                disaster.affectedPlayers,
              ),
            },
          ),
        );
      }
      return events;
    },
    processors: [rewriteDisasterTargetingProcessor, disasterImmunityProcessor],
    fold: (currentGame) => resolveProductionPhase(currentGame),
    finalize: (transformedEvents, resolutionEvents) => ({
      appliedEvents: transformedEvents
        .filter((event) => !event._meta?.suppressed)
        .map((event) => {
          const { _meta: _unused, ...base } = event;
          return base;
        }),
      resolutionEvents: resolutionEvents.map((event) => {
        const { _meta: _unused, ...base } = event;
        return base;
      }),
    }),
    options: {
      maxTransformPasses: 4,
      maxDerivedEventsPerCommand: 200,
    },
  });
}

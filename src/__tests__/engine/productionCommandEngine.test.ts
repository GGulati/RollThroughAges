import { describe, expect, it } from 'vitest';
import { GamePhase } from '../../game/game';
import { resolveProductionWithEvents } from '../../game/engine/productionCommandEngine';
import { createTestDice, createTestGame, DICE_FACE } from '../testUtils';

describe('productionCommandEngine', () => {
  it('records rewrite events for disaster targeting changes', () => {
    const game = createTestGame(2, GamePhase.ResolveProduction);
    game.state.turn.dice = createTestDice([
      DICE_FACE.TWO_GOODS_SKULL,
      DICE_FACE.TWO_GOODS_SKULL,
      DICE_FACE.TWO_GOODS_SKULL,
      DICE_FACE.TWO_GOODS_SKULL,
      DICE_FACE.TWO_GOODS_SKULL,
    ]);
    game.state.turn.pendingChoices = 0;
    game.state.players[0].developments = ['religion']; // rewrite revolt targeting

    const result = resolveProductionWithEvents(game);
    const rewriteEvents = result.resolutionEvents.filter(
      (event) =>
        event.type === 'penalty_applied' &&
        event.payload.rewriteApplied === true,
    );

    expect(rewriteEvents.length).toBeGreaterThan(0);
    expect(String(rewriteEvents[0].payload.targetScope)).toBe('opponents');
    expect(result.nextState.state.phase).not.toBe(GamePhase.ResolveProduction);
  });

  it('records immunity prevention events when disaster penalties are negated', () => {
    const game = createTestGame(2, GamePhase.ResolveProduction);
    game.state.turn.dice = createTestDice([
      DICE_FACE.TWO_GOODS_SKULL,
      DICE_FACE.TWO_GOODS_SKULL,
      DICE_FACE.ONE_GOOD,
    ]);
    game.state.turn.pendingChoices = 0;
    game.state.players[0].developments = ['irrigation']; // drought immunity

    const result = resolveProductionWithEvents(game);
    const immunityEvents = result.appliedEvents.filter(
      (event) =>
        event.type === 'penalty_applied' &&
        event.payload.kind === 'disasterImmunity' &&
        event.payload.prevented === true,
    );

    expect(immunityEvents.length).toBeGreaterThan(0);
    expect(
      result.appliedEvents.some(
        (event) =>
          event.type === 'production_resolved' &&
          Number(event.payload.skulls ?? 0) >= 2,
      ),
    ).toBe(true);
    expect(result.nextState.state.phase).not.toBe(GamePhase.ResolveProduction);
  });
});

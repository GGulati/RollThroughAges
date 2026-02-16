import { describe, expect, it, vi } from 'vitest';
import { createGame } from '@/game/engine';
import {
  botActionKey,
  getBotCoreInstrumentation,
  heuristicStandardBot,
  resetBotCoreInstrumentation,
  runBotTurn,
} from '@/game/bot';

const PLAYERS = [
  { id: 'p1', name: 'Bot 1', controller: 'bot' as const },
  { id: 'p2', name: 'Bot 2', controller: 'bot' as const },
];

describe('bot runner integration', () => {
  it('completes a full bot turn headlessly', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const game = createGame(PLAYERS);

    const result = runBotTurn(game, heuristicStandardBot);

    expect(result.completedTurn).toBe(true);
    expect(result.steps).toBeGreaterThan(0);
    expect(result.game.state.activePlayerIndex).toBe(1);
    expect(result.trace.length).toBe(result.steps);

    randomSpy.mockRestore();
  });

  it('is deterministic for same input state and strategy', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const gameA = createGame(PLAYERS);
    const gameB = createGame(PLAYERS);

    const resultA = runBotTurn(gameA, heuristicStandardBot);
    const resultB = runBotTurn(gameB, heuristicStandardBot);

    expect(resultA.completedTurn).toBe(true);
    expect(resultB.completedTurn).toBe(true);
    expect(resultA.steps).toBe(resultB.steps);

    const traceA = resultA.trace.map((entry) =>
      entry.appliedAction ? botActionKey(entry.appliedAction) : 'none',
    );
    const traceB = resultB.trace.map((entry) =>
      entry.appliedAction ? botActionKey(entry.appliedAction) : 'none',
    );
    expect(traceA).toEqual(traceB);
    expect(resultA.game.state).toEqual(resultB.game.state);

    randomSpy.mockRestore();
  });

  it('does not stall when roll phase has no legal actions', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.2); // all skull dice
    const game = createGame(PLAYERS);

    const result = runBotTurn(game, heuristicStandardBot);

    expect(result.completedTurn).toBe(true);
    expect(result.steps).toBeGreaterThan(0);
    expect(result.game.state.activePlayerIndex).toBe(1);
    randomSpy.mockRestore();
  });

  it('tracks and resets core bot runner instrumentation', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.6);
    resetBotCoreInstrumentation();
    const game = createGame(PLAYERS);

    const result = runBotTurn(game, heuristicStandardBot);
    expect(result.steps).toBeGreaterThan(0);

    const after = getBotCoreInstrumentation(heuristicStandardBot);
    expect(after.metrics.runBotTurnCalls).toBeGreaterThan(0);
    expect(after.metrics.runBotStepCalls).toBeGreaterThan(0);
    expect(after.metrics.strategyChooseActionCalls).toBeGreaterThan(0);
    expect(after.metrics.applyBotActionAttempts).toBeGreaterThan(0);
    expect(after.metrics.runBotTurnMsTotal).toBeGreaterThanOrEqual(0);

    resetBotCoreInstrumentation(heuristicStandardBot);
    const reset = getBotCoreInstrumentation(heuristicStandardBot);
    expect(reset.metrics.runBotTurnCalls).toBe(0);
    expect(reset.metrics.runBotStepCalls).toBe(0);
    expect(reset.metrics.strategyChooseActionCalls).toBe(0);
    randomSpy.mockRestore();
  });
});

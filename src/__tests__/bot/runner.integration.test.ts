import { describe, expect, it, vi } from 'vitest';
import { createGame } from '@/game/engine';
import { botActionKey, heuristicStandardBot, runBotTurn } from '@/game/bot';

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
});

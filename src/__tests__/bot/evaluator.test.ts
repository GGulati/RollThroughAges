import { describe, expect, it, vi } from 'vitest';
import { runHeadlessBotEvaluation } from '@/game/automation';
import { heuristicStandardBot, lookaheadStandardBot } from '@/game/bot';

const PLAYERS = [
  { id: 'p1', name: 'Bot 1', controller: 'bot' as const },
  { id: 'p2', name: 'Bot 2', controller: 'bot' as const },
];

describe('headless bot evaluation runner', () => {
  it('runs rounds with seat rotation using direct strategy parameters', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const result = runHeadlessBotEvaluation(PLAYERS, {
      rounds: 2,
      rotateSeats: true,
      maxTurns: 6,
      maxStepsPerTurn: 60,
      strategyByPlayerId: {
        p1: heuristicStandardBot,
        p2: lookaheadStandardBot,
      },
      participantKeyByPlayerId: {
        p1: 'heuristic',
        p2: 'lookahead',
      },
      participantLabelByKey: {
        heuristic: 'Heuristic',
        lookahead: 'Lookahead',
      },
    });

    expect(result.totalGames).toBe(4);
    expect(result.games).toHaveLength(4);
    expect(result.standings).toHaveLength(2);
    for (const standing of result.standings) {
      expect(standing.appearances).toBe(4);
    }
    expect(result.games[0].seats).toHaveLength(2);
    randomSpy.mockRestore();
  }, 20000);

  it('supports fixed seating when rotation is disabled', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = runHeadlessBotEvaluation(PLAYERS, {
      rounds: 3,
      rotateSeats: false,
      maxTurns: 4,
      maxStepsPerTurn: 40,
      strategyByPlayerId: {
        p1: heuristicStandardBot,
        p2: heuristicStandardBot,
      },
      participantKeyByPlayerId: {
        p1: 'heuristic-a',
        p2: 'heuristic-b',
      },
    });

    expect(result.totalGames).toBe(3);
    expect(result.games).toHaveLength(3);
    expect(result.standings).toHaveLength(2);
    randomSpy.mockRestore();
  });

  it('rejects non-bot players', () => {
    expect(() =>
      runHeadlessBotEvaluation([
        { id: 'p1', name: 'Bot 1', controller: 'bot' },
        { id: 'p2', name: 'Human 1', controller: 'human' },
      ]),
    ).toThrow(/bot-only players/i);
  });
});


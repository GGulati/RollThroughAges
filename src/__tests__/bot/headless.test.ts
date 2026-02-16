import { describe, expect, it, vi } from 'vitest';
import {
  getHeadlessScoreSummary,
  lookaheadStandardBot,
  runHeadlessBotMatch,
} from '@/game/bot';

describe('headless bot match', () => {
  it('runs with bot-only player configs', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = runHeadlessBotMatch([
      { id: 'b1', name: 'Bot 1', controller: 'bot' },
      { id: 'b2', name: 'Bot 2', controller: 'bot' },
    ]);

    expect(result.turnsPlayed).toBeGreaterThan(0);
    expect(result.finalGame.settings.players).toHaveLength(2);
    randomSpy.mockRestore();
  });

  it('rejects non-bot players', () => {
    expect(() =>
      runHeadlessBotMatch([
        { id: 'b1', name: 'Bot 1', controller: 'bot' },
        { id: 'h1', name: 'Human 1', controller: 'human' },
      ]),
    ).toThrow(/bot-only players/i);
  });

  it('returns detailed headless score summaries', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = runHeadlessBotMatch([
      { id: 'b1', name: 'Bot 1', controller: 'bot' },
      { id: 'b2', name: 'Bot 2', controller: 'bot' },
    ]);

    const summary = getHeadlessScoreSummary(result.finalGame);
    expect(summary).toHaveLength(2);
    const first = summary[0];
    expect(typeof first.playerId).toBe('string');
    expect(typeof first.playerName).toBe('string');
    expect(typeof first.total).toBe('number');
    expect(typeof first.breakdown.monuments).toBe('number');
    expect(typeof first.breakdown.developments).toBe('number');
    expect(typeof first.breakdown.bonuses).toBe('number');
    expect(typeof first.breakdown.penalties).toBe('number');
    expect(typeof first.breakdown.total).toBe('number');
    expect(typeof first.resources.food).toBe('number');
    expect(typeof first.resources.totalGoodsValue).toBe('number');
    expect(Array.isArray(first.resources.goods)).toBe(true);
    expect(Array.isArray(first.developments)).toBe(true);
    expect(Array.isArray(first.monuments)).toBe(true);
    randomSpy.mockRestore();
  });

  it('supports lookahead strategy injection in headless matches', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const players = [
      { id: 'b1', name: 'Bot 1', controller: 'bot' as const },
      { id: 'b2', name: 'Bot 2', controller: 'bot' as const },
    ];
    const result = runHeadlessBotMatch(players, {
      maxTurns: 24,
      maxStepsPerTurn: 120,
      strategyByPlayerId: {
        b1: lookaheadStandardBot,
        b2: lookaheadStandardBot,
      },
    });

    expect(result.turnsPlayed).toBeGreaterThan(0);
    expect(result.actionLog.some((line) => line.includes('[Bot 1]'))).toBe(true);
    randomSpy.mockRestore();
  });
});

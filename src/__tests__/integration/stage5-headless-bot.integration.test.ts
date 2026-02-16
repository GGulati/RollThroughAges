import { describe, expect, it, vi } from 'vitest';
import { getHeadlessScoreSummary, runHeadlessBotMatch } from '@/game/automation';
import { PlayerConfig } from '@/game';

const BOT_PLAYERS: PlayerConfig[] = [
  { id: 'b1', name: 'Bot 1', controller: 'bot' },
  { id: 'b2', name: 'Bot 2', controller: 'bot' },
  { id: 'b3', name: 'Bot 3', controller: 'bot' },
];

describe('stage5 headless bot integration', () => {
  it('completes a full bot-only game with legal progression and action attribution', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = runHeadlessBotMatch(BOT_PLAYERS, {
      maxTurns: 300,
      maxStepsPerTurn: 300,
    });

    expect(result.completed).toBe(true);
    expect(result.stallReason).toBeNull();
    expect(result.turnsPlayed).toBeGreaterThan(0);
    expect(result.winners.length).toBeGreaterThan(0);
    expect(result.actionLog.length).toBeGreaterThan(0);
    expect(result.actionLog.some((line) => line.startsWith('[Bot 1]'))).toBe(true);
    expect(result.actionLog.some((line) => line.startsWith('[Bot 2]'))).toBe(true);
    expect(result.actionLog.some((line) => line.startsWith('[Bot 3]'))).toBe(true);
    expect(result.actionLog.some((line) => line.startsWith('[System] Game complete'))).toBe(
      true,
    );
    expect(result.actionLog.some((line) => line.includes('ERROR'))).toBe(false);

    const summary = getHeadlessScoreSummary(result.finalGame);
    expect(summary).toHaveLength(BOT_PLAYERS.length);
    expect(summary.every((entry) => Number.isFinite(entry.total))).toBe(true);

    randomSpy.mockRestore();
  });
});

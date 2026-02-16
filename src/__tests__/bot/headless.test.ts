import { describe, expect, it, vi } from 'vitest';
import { runHeadlessBotMatch } from '@/game/bot';

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
});

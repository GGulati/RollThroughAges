import { describe, expect, it, vi } from 'vitest';
import { createGame } from '@/game/engine';
import { GamePhase } from '@/game';
import { botActionKey, getLegalBotActions, lookaheadStandardBot, runBotTurn } from '@/game/bot';

const PLAYERS = [
  { id: 'p1', name: 'Bot 1', controller: 'bot' as const },
  { id: 'p2', name: 'Bot 2', controller: 'bot' as const },
];

describe('lookahead bot', () => {
  it('chooses a legal action in roll phase', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const game = createGame(PLAYERS);

    const legalActions = getLegalBotActions(game);
    const action = lookaheadStandardBot.chooseAction({ game });

    expect(action).not.toBeNull();
    expect(
      legalActions.some((legal) => botActionKey(legal) === botActionKey(action!)),
    ).toBe(true);
    randomSpy.mockRestore();
  });

  it('is deterministic for same game state', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const gameA = createGame(PLAYERS);
    const gameB = createGame(PLAYERS);

    const actionA = lookaheadStandardBot.chooseAction({ game: gameA });
    const actionB = lookaheadStandardBot.chooseAction({ game: gameB });

    expect(actionA).not.toBeNull();
    expect(actionB).not.toBeNull();
    expect(botActionKey(actionA!)).toBe(botActionKey(actionB!));
    randomSpy.mockRestore();
  });

  it('chooses a legal action in non-roll phases', () => {
    const game = createGame(PLAYERS);
    const nextState = {
      ...game.state,
      phase: GamePhase.Development,
    };
    const developmentGame = { ...game, state: nextState };

    const legalActions = getLegalBotActions(developmentGame);
    const action = lookaheadStandardBot.chooseAction({ game: developmentGame });

    expect(action).not.toBeNull();
    expect(
      legalActions.some((legal) => botActionKey(legal) === botActionKey(action!)),
    ).toBe(true);
  });

  it('can complete a full turn through runner integration', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const game = createGame(PLAYERS);

    const result = runBotTurn(game, lookaheadStandardBot);

    expect(result.completedTurn).toBe(true);
    expect(result.steps).toBeGreaterThan(0);
    expect(result.game.state.activePlayerIndex).toBe(1);
    randomSpy.mockRestore();
  });
});

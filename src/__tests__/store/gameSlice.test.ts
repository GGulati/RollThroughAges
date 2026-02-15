import { describe, expect, it, vi } from 'vitest';
import { gameReducer, startGame, rollDice, endTurn, undo, redo } from '@/store/gameSlice';
import { GameSliceState } from '@/store/gameState';
import { PlayerConfig } from '@/game';

const PLAYERS: PlayerConfig[] = [
  { id: 'p1', name: 'Player 1', controller: 'human' },
  { id: 'p2', name: 'Player 2', controller: 'human' },
];

function reduce(
  state: GameSliceState | undefined,
  action: Parameters<typeof gameReducer>[1],
): GameSliceState {
  return gameReducer(state, action);
}

describe('gameSlice', () => {
  it('caps history at 20 entries', () => {
    let state = reduce(undefined, startGame({ players: PLAYERS }));

    for (let i = 0; i < 25; i += 1) {
      state = reduce(state, endTurn());
    }

    expect(state.game).not.toBeNull();
    expect(state.game!.history).toHaveLength(20);
  });

  it('clears future after a fresh mutation', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    let state = reduce(undefined, startGame({ players: PLAYERS }));

    state = reduce(state, endTurn());
    state = reduce(state, undo());

    expect(state.game).not.toBeNull();
    expect(state.game!.future.length).toBeGreaterThan(0);

    // Random mutations should also clear redo history.
    state = reduce(state, rollDice());
    expect(state.game!.future).toHaveLength(0);

    randomSpy.mockRestore();
  });

  it('supports multi-step undo and redo', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);
    let state = reduce(undefined, startGame({ players: PLAYERS }));

    const roundAtStart = state.game!.state.round;

    state = reduce(state, rollDice());
    state = reduce(state, endTurn());
    const roundAfterEndTurn = state.game!.state.round;
    const playerAfterEndTurn = state.game!.state.turn.activePlayerId;

    state = reduce(state, undo());
    state = reduce(state, undo());

    expect(state.game!.state.round).toBe(roundAtStart);

    state = reduce(state, redo());
    state = reduce(state, redo());

    expect(state.game!.state.round).toBe(roundAfterEndTurn);
    expect(state.game!.state.turn.activePlayerId).toBe(playerAfterEndTurn);

    randomSpy.mockRestore();
  });

  it('does not create undo history for random roll actions', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.3);
    let state = reduce(undefined, startGame({ players: PLAYERS }));

    state = reduce(state, rollDice());

    expect(state.game).not.toBeNull();
    expect(state.game!.history).toHaveLength(0);

    state = reduce(state, undo());
    expect(state.lastError).toEqual({
      code: 'UNDO_NOT_AVAILABLE',
      message: 'There are no moves to undo.',
    });

    randomSpy.mockRestore();
  });

  it('invalid action keeps game state unchanged and sets reducer error', () => {
    const stateBefore = reduce(undefined, startGame({ players: PLAYERS }));
    const gameBefore = stateBefore.game;

    const stateAfter = reduce(stateBefore, undo());

    expect(stateAfter.game).toBe(gameBefore);
    expect(stateAfter.lastError).toEqual({
      code: 'UNDO_NOT_AVAILABLE',
      message: 'There are no moves to undo.',
    });
  });
});

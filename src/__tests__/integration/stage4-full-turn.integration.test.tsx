import { describe, expect, it, vi } from 'vitest';
import {
  buildCity,
  buyDevelopment,
  discardGoods,
  endTurn,
  keepDie,
  redo,
  startGame,
  undo,
} from '@/store/gameSlice';
import { GamePhase } from '@/game';
import { createAppStore } from '@/store/store';

const PLAYERS = [
  { id: 'p1', name: 'Player 1', controller: 'human' as const },
  { id: 'p2', name: 'Player 2', controller: 'human' as const },
];

describe('stage4 full turn integration', () => {
  it('covers stage4 full-turn gates with invalid paths and undo/redo checkpoints', () => {
    const store = createAppStore();

    // Flow A: development path + invalid checks + undo/redo around deterministic mutation.
    const coinsRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.7);
    store.dispatch(startGame({ players: PLAYERS }));

    const beforeInvalidBuild = store.getState().game.game?.state;
    store.dispatch(buildCity({ cityIndex: 3 }));
    expect(store.getState().game.lastError?.code).toBe('INVALID_PHASE');
    expect(store.getState().game.game?.state).toEqual(beforeInvalidBuild);

    const diceCountA = store.getState().game.game!.state.turn.dice.length;
    for (let i = 0; i < diceCountA; i += 1) {
      store.dispatch(keepDie({ dieIndex: i }));
    }
    expect(store.getState().game.game?.state.phase).toBe('development');

    const beforeInvalidDiscard = store.getState().game.game?.state;
    store.dispatch(discardGoods({ goodsToKeepByType: { Wood: 0 } }));
    expect(store.getState().game.lastError?.code).toBe('INVALID_PHASE');
    expect(store.getState().game.game?.state).toEqual(beforeInvalidDiscard);

    store.dispatch(
      buyDevelopment({ developmentId: 'leadership', goodsTypeNames: [] }),
    );
    expect(store.getState().game.game?.state.phase).toBe(GamePhase.EndTurn);
    store.dispatch(
      buyDevelopment({ developmentId: 'irrigation', goodsTypeNames: [] }),
    );
    expect(store.getState().game.game?.state.phase).toBe(GamePhase.EndTurn);
    expect(store.getState().game.lastError?.code).toBe('INVALID_PHASE');

    store.dispatch(endTurn());
    expect(store.getState().game.game?.state.activePlayerIndex).toBe(1);
    store.dispatch(undo());
    expect(store.getState().game.game?.state.activePlayerIndex).toBe(1);
    expect(store.getState().game.lastError?.code).toBe('UNDO_NOT_AVAILABLE');
    store.dispatch(redo());
    expect(store.getState().game.game?.state.activePlayerIndex).toBe(1);
    expect(store.getState().game.lastError?.code).toBe('REDO_NOT_AVAILABLE');

    coinsRandomSpy.mockRestore();
  });
});

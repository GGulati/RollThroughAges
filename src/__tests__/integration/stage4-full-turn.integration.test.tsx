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
    expect(store.getState().game.game?.state.phase).toBe(GamePhase.Development);
    store.dispatch(
      buyDevelopment({ developmentId: 'irrigation', goodsTypeNames: [] }),
    );
    expect(store.getState().game.game?.state.phase).toBe(GamePhase.EndTurn);

    store.dispatch(endTurn());
    expect(store.getState().game.game?.state.activePlayerIndex).toBe(1);
    store.dispatch(undo());
    expect(store.getState().game.game?.state.activePlayerIndex).toBe(0);
    store.dispatch(redo());
    expect(store.getState().game.game?.state.activePlayerIndex).toBe(1);

    coinsRandomSpy.mockRestore();

    // Flow B: overflow -> discard -> end-turn guard.
    const goodsRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.01);
    store.dispatch(startGame({ players: PLAYERS }));

    let reachedDiscard = false;
    for (let cycle = 0; cycle < 4; cycle += 1) {
      const state = store.getState().game.game!;
      const isP1Roll =
        state.state.activePlayerIndex === 0 &&
        state.state.phase === GamePhase.RollDice;
      if (!isP1Roll) {
        break;
      }

      const diceCount = state.state.turn.dice.length;
      for (let i = 0; i < diceCount; i += 1) {
        store.dispatch(keepDie({ dieIndex: i }));
      }

      const afterLockPhase = store.getState().game.game!.state.phase;
      if (afterLockPhase === GamePhase.DiscardGoods) {
        reachedDiscard = true;
        break;
      }

      expect(
        afterLockPhase === GamePhase.EndTurn ||
          afterLockPhase === GamePhase.Development,
      ).toBe(true);
      store.dispatch(endTurn());
      const afterFirstEndTurn = store.getState().game.game!.state;
      if (afterFirstEndTurn.phase === GamePhase.DiscardGoods) {
        reachedDiscard = true;
        break;
      }
      store.dispatch(endTurn()); // p2 -> p1
    }

    expect(reachedDiscard).toBe(true);

    const beforeInvalidEndTurn = store.getState().game.game?.state;
    store.dispatch(endTurn());
    expect(store.getState().game.lastError?.code).toBe('INVALID_PHASE');
    expect(store.getState().game.game?.state).toEqual(beforeInvalidEndTurn);

    const game = store.getState().game.game!;
    const activePlayer = game.state.players[game.state.activePlayerIndex];
    const goodsToKeepByType: Record<string, number> = {};
    let kept = 0;
    for (const goodsType of game.settings.goodsTypes) {
      const quantity = activePlayer.goods.get(goodsType) ?? 0;
      const keep = Math.max(0, Math.min(quantity, game.settings.maxGoods - kept));
      goodsToKeepByType[goodsType.name] = keep;
      kept += keep;
    }

    store.dispatch(discardGoods({ goodsToKeepByType }));
    expect(store.getState().game.lastError).toBeNull();
    expect(store.getState().game.game?.state.phase).toBe(GamePhase.EndTurn);

    goodsRandomSpy.mockRestore();
  });
});

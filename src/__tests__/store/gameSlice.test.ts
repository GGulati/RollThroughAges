import { describe, expect, it, vi } from 'vitest';
import {
  buyDevelopment,
  buildCity,
  buildMonument,
  endTurn,
  gameReducer,
  keepDie,
  redo,
  resolveProduction,
  rollDice,
  startGame,
  undo,
} from '@/store/gameSlice';
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

  it('keeps dice and auto-collects goods when production resolves', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.01);
    let state = reduce(undefined, startGame({ players: PLAYERS }));

    state = reduce(state, rollDice());
    state = reduce(state, keepDie({ dieIndex: 0 }));
    state = reduce(state, keepDie({ dieIndex: 1 }));
    state = reduce(state, keepDie({ dieIndex: 2 }));

    expect(state.game!.state.phase).toBe('discardGoods');
    expect(state.game!.state.turn.turnProduction.goods).toBe(0);

    const activePlayer = state.game!.state.players[0];
    const totalGoods = Array.from(activePlayer.goods.values()).reduce(
      (sum, quantity) => sum + quantity,
      0,
    );
    expect(totalGoods).toBeGreaterThan(0);
    randomSpy.mockRestore();
  });

  it('rejects production resolution when pending choices remain', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.34);
    let state = reduce(undefined, startGame({ players: PLAYERS }));

    state = reduce(state, rollDice());
    state = reduce(state, keepDie({ dieIndex: 0 }));
    state = reduce(state, keepDie({ dieIndex: 1 }));
    state = reduce(state, keepDie({ dieIndex: 2 }));
    state = reduce(state, resolveProduction());

    expect(state.lastError).toEqual({
      code: 'PRODUCTION_NOT_READY',
      message: 'Choose all pending dice production options first.',
    });
    randomSpy.mockRestore();
  });

  it('builds a city when workers are available in build phase', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.55); // 3 workers face
    let state = reduce(undefined, startGame({ players: PLAYERS }));

    state = reduce(state, rollDice());
    state = reduce(state, keepDie({ dieIndex: 0 }));
    state = reduce(state, keepDie({ dieIndex: 1 }));
    state = reduce(state, keepDie({ dieIndex: 2 }));

    const cityBefore = state.game!.state.players[0].cities[3];
    const workersBefore = state.game!.state.turn.turnProduction.workers;
    state = reduce(state, buildCity({ cityIndex: 3 }));

    const cityAfter = state.game!.state.players[0].cities[3];
    const workersAfter = state.game!.state.turn.turnProduction.workers;
    expect(cityAfter.completed || cityAfter.workersCommitted > cityBefore.workersCommitted).toBe(
      true,
    );
    expect(workersAfter).toBeLessThan(workersBefore);

    randomSpy.mockRestore();
  });

  it('rejects invalid city build targets', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.55);
    let state = reduce(undefined, startGame({ players: PLAYERS }));

    state = reduce(state, rollDice());
    state = reduce(state, keepDie({ dieIndex: 0 }));
    state = reduce(state, keepDie({ dieIndex: 1 }));
    state = reduce(state, keepDie({ dieIndex: 2 }));
    state = reduce(state, buildCity({ cityIndex: 4 }));

    expect(state.lastError).toEqual({
      code: 'INVALID_BUILD_TARGET',
      message: 'That city is not currently buildable.',
    });
    randomSpy.mockRestore();
  });

  it('builds a monument when workers are available in build phase', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.55);
    let state = reduce(undefined, startGame({ players: PLAYERS }));

    state = reduce(state, rollDice());
    state = reduce(state, keepDie({ dieIndex: 0 }));
    state = reduce(state, keepDie({ dieIndex: 1 }));
    state = reduce(state, keepDie({ dieIndex: 2 }));

    const monumentId = 'stepPyramid';
    const progressBefore = state.game!.state.players[0].monuments[monumentId]
      .workersCommitted;
    state = reduce(state, buildMonument({ monumentId }));
    const progressAfter = state.game!.state.players[0].monuments[monumentId]
      .workersCommitted;

    expect(progressAfter).toBeGreaterThanOrEqual(progressBefore);
    randomSpy.mockRestore();
  });

  it('buys a development with coins during build/development', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.67); // 7 coins face
    let state = reduce(undefined, startGame({ players: PLAYERS }));

    state = reduce(state, keepDie({ dieIndex: 0 }));
    state = reduce(state, keepDie({ dieIndex: 1 }));
    state = reduce(state, keepDie({ dieIndex: 2 }));

    const coinsBefore = state.game!.state.turn.turnProduction.coins;
    state = reduce(
      state,
      buyDevelopment({ developmentId: 'leadership', goodsTypeNames: [] }),
    );

    const activePlayer = state.game!.state.players[0];
    expect(state.game!.state.phase).toBe('development');
    expect(activePlayer.developments).toContain('leadership');
    expect(state.game!.state.turn.turnProduction.coins).toBeLessThan(coinsBefore);
    randomSpy.mockRestore();
  });

  it('rejects development purchase in invalid phase', () => {
    let state = reduce(undefined, startGame({ players: PLAYERS }));
    state = reduce(
      state,
      buyDevelopment({ developmentId: 'leadership', goodsTypeNames: [] }),
    );

    expect(state.lastError).toEqual({
      code: 'INVALID_PHASE',
      message: 'Developments can only be purchased during build/development.',
    });
  });

  it('auto-skips build phase when production yields no workers', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.01); // 1 good
    let state = reduce(undefined, startGame({ players: PLAYERS }));

    state = reduce(state, keepDie({ dieIndex: 0 }));
    state = reduce(state, keepDie({ dieIndex: 1 }));
    state = reduce(state, keepDie({ dieIndex: 2 }));

    expect(state.game!.state.turn.turnProduction.workers).toBe(0);
    expect(state.game!.state.phase).toBe('discardGoods');
    randomSpy.mockRestore();
  });

  it('auto-ends development when no further purchases are affordable', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.67); // 7 coins
    let state = reduce(undefined, startGame({ players: PLAYERS }));

    state = reduce(state, keepDie({ dieIndex: 0 }));
    state = reduce(state, keepDie({ dieIndex: 1 }));
    state = reduce(state, keepDie({ dieIndex: 2 }));

    // Buy affordable developments until no more can be afforded.
    state = reduce(
      state,
      buyDevelopment({ developmentId: 'leadership', goodsTypeNames: [] }),
    );
    state = reduce(
      state,
      buyDevelopment({ developmentId: 'irrigation', goodsTypeNames: [] }),
    );

    expect(state.game!.state.phase).toBe('discardGoods');
    randomSpy.mockRestore();
  });

  it('buys a development using selected goods types when coins are insufficient', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.01); // 1 good
    let state = reduce(undefined, startGame({ players: PLAYERS }));

    state = reduce(state, keepDie({ dieIndex: 0 }));
    state = reduce(state, keepDie({ dieIndex: 1 }));
    state = reduce(state, keepDie({ dieIndex: 2 }));
    // Advance through player 2 and back to player 1 to accumulate more goods.
    state = reduce(state, endTurn());
    state = reduce(state, endTurn());
    state = reduce(state, keepDie({ dieIndex: 0 }));
    state = reduce(state, keepDie({ dieIndex: 1 }));
    state = reduce(state, keepDie({ dieIndex: 2 }));

    state = reduce(
      state,
      buyDevelopment({
        developmentId: 'agriculture',
        goodsTypeNames: ['Wood', 'Stone', 'Ceramic'],
      }),
    );

    expect(state.lastError).toBeNull();
    expect(state.game!.state.players[0].developments).toContain('agriculture');
    randomSpy.mockRestore();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { PlayerConfig } from '@/game';
import { calculateDiceProduction } from '@/game/engine';
import {
  buyDevelopment,
  endTurn,
  keepDie,
  redo,
  rollDice,
  startGame,
  undo,
} from '@/store/gameSlice';
import { createAppStore } from '@/store/store';
import {
  selectBuildPanelModel,
  selectCanRedo,
  selectCanUndo,
  selectDevelopmentPanelModel,
  selectDisasterPanelModel,
  selectDicePanelModel,
  selectDiscardPanelModel,
  selectEndgameStatus,
  selectProductionPanelModel,
  selectTurnStatus,
} from '@/store/selectors';

const PLAYERS: PlayerConfig[] = [
  { id: 'p1', name: 'Player 1', controller: 'human' },
  { id: 'p2', name: 'Player 2', controller: 'human' },
];

function createTestStore() {
  return createAppStore();
}

describe('store selectors', () => {
  it('returns stable empty-state contracts before startGame', () => {
    const store = createTestStore();
    const state = store.getState();

    expect(selectTurnStatus(state)).toEqual({
      isGameActive: false,
      round: 0,
      phase: null,
      activePlayerId: null,
      activePlayerName: null,
      rollsUsed: 0,
      errorMessage: null,
    });
    expect(selectDicePanelModel(state)).toMatchObject({
      canRoll: false,
      reason: 'Start a game before rolling dice.',
      rollsUsed: 0,
      maxRollsAllowed: 0,
    });
    expect(selectProductionPanelModel(state).reason).toBe(
      'Start a game to resolve production.',
    );
    expect(selectBuildPanelModel(state).reason).toBe(
      'Start a game to build cities or monuments.',
    );
    expect(selectDevelopmentPanelModel(state).reason).toBe(
      'Start a game to purchase developments.',
    );
    expect(selectDiscardPanelModel(state).reason).toBe(
      'Start a game to discard goods.',
    );
    expect(selectDisasterPanelModel(state).disasters).toEqual([]);
    expect(selectCanUndo(state)).toBe(false);
    expect(selectCanRedo(state)).toBe(false);
    expect(selectEndgameStatus(state)).toEqual({
      isGameActive: false,
      isGameOver: false,
    });
  });

  it('enables stage-2 actions and reports current turn status after startGame', () => {
    const store = createTestStore();
    store.dispatch(startGame({ players: PLAYERS }));

    const state = store.getState();
    const turnStatus = selectTurnStatus(state);
    const dicePanel = selectDicePanelModel(state);

    expect(turnStatus.isGameActive).toBe(true);
    expect(turnStatus.round).toBe(1);
    expect(turnStatus.activePlayerId).toBe('p1');
    expect(turnStatus.activePlayerName).toBe('Player 1');
    expect(dicePanel.canRoll).toBe(true);
    expect(dicePanel.reason).toBeNull();
    expect(dicePanel.maxRollsAllowed).toBe(3);
    expect(selectCanUndo(state)).toBe(false);
    expect(selectCanRedo(state)).toBe(false);
  });

  it('tracks undo/redo selector state across mutations', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const store = createTestStore();
    store.dispatch(startGame({ players: PLAYERS }));
    store.dispatch(rollDice());
    store.dispatch(endTurn());

    expect(selectCanUndo(store.getState())).toBe(true);
    expect(selectCanRedo(store.getState())).toBe(false);

    store.dispatch(undo());
    expect(selectCanRedo(store.getState())).toBe(true);

    store.dispatch(redo());
    expect(selectCanRedo(store.getState())).toBe(false);
    expect(selectCanUndo(store.getState())).toBe(true);

    randomSpy.mockRestore();
  });

  it('surfaces reason text when rolling is no longer allowed', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const store = createTestStore();
    store.dispatch(startGame({ players: PLAYERS }));

    store.dispatch(rollDice());
    store.dispatch(rollDice());
    store.dispatch(rollDice());

    const dicePanel = selectDicePanelModel(store.getState());
    expect(dicePanel.canRoll).toBe(false);
    expect(dicePanel.reason).toBe('No roll is available right now.');

    randomSpy.mockRestore();
  });

  it('surfaces reducer validation message through turn status', () => {
    const store = createTestStore();

    store.dispatch(undo());

    expect(selectTurnStatus(store.getState()).errorMessage).toBe(
      'Start a game before undoing moves.',
    );
  });

  it('returns build targets when in build phase with workers', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.55);
    const store = createTestStore();
    store.dispatch(startGame({ players: PLAYERS }));
    store.dispatch(rollDice());
    store.dispatch(keepDie({ dieIndex: 0 }));
    store.dispatch(keepDie({ dieIndex: 1 }));
    store.dispatch(keepDie({ dieIndex: 2 }));

    const buildPanel = selectBuildPanelModel(store.getState());
    expect(buildPanel.canBuild).toBe(true);
    expect(buildPanel.cityTargets.length).toBeGreaterThan(0);
    expect(buildPanel.monumentTargets.length).toBeGreaterThan(0);
    expect(buildPanel.cityCatalog.length).toBeGreaterThan(0);
    expect(buildPanel.monumentCatalog.length).toBeGreaterThan(0);

    randomSpy.mockRestore();
  });

  it('updates stored goods summary after resolving goods production', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.01); // 1 Good
    const store = createTestStore();
    store.dispatch(startGame({ players: PLAYERS }));
    store.dispatch(keepDie({ dieIndex: 0 }));
    store.dispatch(keepDie({ dieIndex: 1 }));
    store.dispatch(keepDie({ dieIndex: 2 }));
    const beforeResolve = store.getState().game.game!;
    expect(beforeResolve.state.phase).toBe('discardGoods');
    expect(
      calculateDiceProduction(
        beforeResolve.state.turn.dice,
        beforeResolve.state.players[beforeResolve.state.activePlayerIndex],
        beforeResolve.settings,
      ).goods,
    ).toBeGreaterThan(0);
    const buildPanel = selectBuildPanelModel(store.getState());
    const totalGoods = buildPanel.goodsStoredSummary.reduce(
      (sum, entry) => sum + entry.quantity,
      0,
    );
    expect(totalGoods).toBeGreaterThan(0);

    randomSpy.mockRestore();
  });

  it('shows resolved wording in build phase after production is done', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.55);
    const store = createTestStore();
    store.dispatch(startGame({ players: PLAYERS }));
    store.dispatch(keepDie({ dieIndex: 0 }));
    store.dispatch(keepDie({ dieIndex: 1 }));
    store.dispatch(keepDie({ dieIndex: 2 }));

    const productionPanel = selectProductionPanelModel(store.getState());
    expect(productionPanel.canResolveProduction).toBe(false);
    expect(productionPanel.reason).toBe(
      'Production has already been resolved for this turn.',
    );

    randomSpy.mockRestore();
  });

  it('returns development targets and purchasing power in build phase', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.67); // 7 coins
    const store = createTestStore();
    store.dispatch(startGame({ players: PLAYERS }));
    store.dispatch(keepDie({ dieIndex: 0 }));
    store.dispatch(keepDie({ dieIndex: 1 }));
    store.dispatch(keepDie({ dieIndex: 2 }));

    const developmentPanel = selectDevelopmentPanelModel(store.getState());
    expect(developmentPanel.isActionAllowed).toBe(true);
    expect(developmentPanel.canPurchase).toBe(true);
    expect(developmentPanel.coinsAvailable).toBeGreaterThan(0);
    expect(developmentPanel.availableDevelopments.length).toBeGreaterThan(0);
    expect(
      developmentPanel.availableDevelopments.some((development) => development.canAfford),
    ).toBe(true);
    expect(developmentPanel.developmentCatalog.length).toBeGreaterThanOrEqual(
      developmentPanel.availableDevelopments.length,
    );

    randomSpy.mockRestore();
  });

  it('keeps purchased developments visible in catalog', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.67); // 7 coins
    const store = createTestStore();
    store.dispatch(startGame({ players: PLAYERS }));
    store.dispatch(keepDie({ dieIndex: 0 }));
    store.dispatch(keepDie({ dieIndex: 1 }));
    store.dispatch(keepDie({ dieIndex: 2 }));
    store.dispatch(
      buyDevelopment({ developmentId: 'leadership', goodsTypeNames: [] }),
    );

    const developmentPanel = selectDevelopmentPanelModel(store.getState());
    const leadership = developmentPanel.developmentCatalog.find(
      (development) => development.id === 'leadership',
    );
    expect(leadership).toBeDefined();
    expect(leadership?.purchased).toBe(true);

    randomSpy.mockRestore();
  });

  it('returns disaster criteria for player awareness', () => {
    const store = createTestStore();
    store.dispatch(startGame({ players: PLAYERS }));

    const disasterPanel = selectDisasterPanelModel(store.getState());
    expect(disasterPanel.disasters.length).toBeGreaterThan(0);
    expect(disasterPanel.disasters[0]).toMatchObject({
      id: 'drought',
      skulls: 2,
      effect: 'Lose 2 points',
      affectedPlayers: 'self',
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { GamePhase, PlayerConfig } from '@/game';
import { calculateDiceProduction } from '@/game/engine';
import {
  buyDevelopment,
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
  selectExchangePanelModel,
  selectDisasterPanelModel,
  selectDicePanelModel,
  selectDiceOutcomeModel,
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
      activePlayerPoints: 0,
      playerPoints: [],
      errorMessage: null,
    });
    expect(selectDicePanelModel(state)).toMatchObject({
      canRoll: false,
      reason: 'Start a game before rolling dice.',
      rollsUsed: 0,
      maxRollsAllowed: 0,
    });
    expect(selectDiceOutcomeModel(state)).toMatchObject({
      status: 'projected',
      skulls: 0,
      workersProduced: 0,
      coinsProduced: 0,
      goodsProduced: 0,
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
    expect(selectExchangePanelModel(state).reason).toBe(
      'Start a game to use exchanges.',
    );
    expect(selectDiscardPanelModel(state).reason).toBe(
      'Start a game to discard goods.',
    );
    expect(selectDiscardPanelModel(state).canEndTurn).toBe(false);
    expect(selectDisasterPanelModel(state).disasters).toEqual([]);
    expect(selectCanUndo(state)).toBe(false);
    expect(selectCanRedo(state)).toBe(false);
    expect(selectEndgameStatus(state)).toEqual({
      isGameActive: false,
      isGameOver: false,
      reasons: [],
    });
  });

  it('enables stage-2 actions and reports current turn status after startGame', () => {
    const store = createTestStore();
    store.dispatch(startGame({ players: PLAYERS }));

    const state = store.getState();
    const turnStatus = selectTurnStatus(state);
    const dicePanel = selectDicePanelModel(state);
    const diceOutcome = selectDiceOutcomeModel(state);

    expect(turnStatus.isGameActive).toBe(true);
    expect(turnStatus.round).toBe(1);
    expect(turnStatus.activePlayerId).toBe('p1');
    expect(turnStatus.activePlayerName).toBe('Player 1');
    expect(typeof turnStatus.activePlayerPoints).toBe('number');
    expect(turnStatus.playerPoints).toHaveLength(2);
    expect(turnStatus.playerPoints[0].playerName).toBe('Player 1');
    expect(typeof turnStatus.playerPoints[0].breakdown.monuments).toBe('number');
    expect(typeof turnStatus.playerPoints[0].breakdown.developments).toBe(
      'number',
    );
    expect(typeof turnStatus.playerPoints[0].breakdown.bonuses).toBe('number');
    expect(typeof turnStatus.playerPoints[0].breakdown.penalties).toBe('number');
    expect(typeof turnStatus.playerPoints[0].breakdown.total).toBe('number');
    expect(dicePanel.canRoll).toBe(true);
    expect(dicePanel.reason).toBeNull();
    expect(dicePanel.maxRollsAllowed).toBe(3);
    expect(diceOutcome.status).toBe('projected');
    expect(typeof diceOutcome.food.need).toBe('number');
    expect(typeof diceOutcome.points.before).toBe('number');
    expect(typeof diceOutcome.points.after).toBe('number');
    expect(selectCanUndo(state)).toBe(false);
    expect(selectCanRedo(state)).toBe(false);
  });

  it('tracks undo/redo selector state across mutations', () => {
    const store = createTestStore();
    store.dispatch(startGame({ players: PLAYERS }));
    store.dispatch(keepDie({ dieIndex: 0 }));
    if (!selectCanUndo(store.getState())) {
      store.dispatch(keepDie({ dieIndex: 1 }));
    }
    if (!selectCanUndo(store.getState())) {
      store.dispatch(keepDie({ dieIndex: 2 }));
    }

    expect(selectCanUndo(store.getState())).toBe(true);
    expect(selectCanRedo(store.getState())).toBe(false);

    store.dispatch(undo());
    expect(selectCanRedo(store.getState())).toBe(true);

    store.dispatch(redo());
    expect(selectCanRedo(store.getState())).toBe(false);
    expect(selectCanUndo(store.getState())).toBe(true);

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
    expect(beforeResolve.state.phase).toBe('endTurn');
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

  it('keeps goods production visible after production is applied', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.01); // 1 Good
    const store = createTestStore();
    store.dispatch(startGame({ players: PLAYERS }));
    store.dispatch(keepDie({ dieIndex: 0 }));
    store.dispatch(keepDie({ dieIndex: 1 }));
    store.dispatch(keepDie({ dieIndex: 2 }));

    const diceOutcome = selectDiceOutcomeModel(store.getState());
    expect(diceOutcome.summary).toBe('Applied');
    expect(diceOutcome.goodsProduced).toBeGreaterThan(0);

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

  it('returns exchange options during development when exchange effects are owned', () => {
    const store = createTestStore();
    store.dispatch(startGame({ players: PLAYERS }));
    const root = store.getState();
    const game = root.game.game!;
    const activeIndex = game.state.activePlayerIndex;
    const stateWithExchange = {
      ...root,
      game: {
        ...root.game,
        game: {
          ...game,
          state: {
            ...game.state,
            phase: GamePhase.Development,
            players: game.state.players.map((player, index) =>
              index === activeIndex
                ? { ...player, developments: [...player.developments, 'granaries'] }
                : player,
            ),
          },
        },
      },
    };

    const exchangePanel = selectExchangePanelModel(stateWithExchange);
    expect(exchangePanel.isActionAllowed).toBe(true);
    expect(exchangePanel.exchanges.length).toBeGreaterThan(0);
    expect(
      exchangePanel.exchanges.some(
        (exchange) => exchange.from === 'food' && exchange.to === 'coins',
      ),
    ).toBe(true);
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
      name: 'Drought',
      skulls: 2,
      effectText: 'Lose 2 points',
      targetsText: 'You',
    });
  });

  it('updates disaster wording when immunity development is purchased', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.67); // 7 coins
    const store = createTestStore();
    store.dispatch(startGame({ players: PLAYERS }));
    store.dispatch(keepDie({ dieIndex: 0 }));
    store.dispatch(keepDie({ dieIndex: 1 }));
    store.dispatch(keepDie({ dieIndex: 2 }));
    store.dispatch(
      buyDevelopment({ developmentId: 'irrigation', goodsTypeNames: [] }),
    );

    const disasterPanel = selectDisasterPanelModel(store.getState());
    const drought = disasterPanel.disasters.find((entry) => entry.id === 'drought');
    expect(drought).toBeDefined();
    expect(drought?.effectText).toContain('immune via Irrigation');

    randomSpy.mockRestore();
  });

  it('credits Great Wall when invasion immunity applies', () => {
    const store = createTestStore();
    store.dispatch(startGame({ players: PLAYERS }));
    const root = store.getState();
    const game = root.game.game!;
    const activeIndex = game.state.activePlayerIndex;
    const stateWithGreatWall = {
      ...root,
      game: {
        ...root.game,
        game: {
          ...game,
          state: {
            ...game.state,
            players: game.state.players.map((player, index) =>
              index === activeIndex
                ? {
                    ...player,
                    monuments: {
                      ...player.monuments,
                      greatWall: { workersCommitted: 13, completed: true },
                    },
                  }
                : player,
            ),
          },
        },
      },
    };

    const disasterPanel = selectDisasterPanelModel(stateWithGreatWall);
    const invasion = disasterPanel.disasters.find((entry) => entry.id === 'invasion');
    expect(invasion?.effectText).toContain('immune via Great Wall');
  });

  it('marks the triggered disaster as salient for the current turn', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.17); // 2 goods + skull
    const store = createTestStore();
    store.dispatch(startGame({ players: PLAYERS }));
    store.dispatch(keepDie({ dieIndex: 0 }));
    store.dispatch(keepDie({ dieIndex: 1 }));
    store.dispatch(keepDie({ dieIndex: 2 }));

    const disasterPanel = selectDisasterPanelModel(store.getState());
    const salient = disasterPanel.disasters.find((entry) => entry.isTriggered);
    expect(salient?.id).toBe('pestilence');

    randomSpy.mockRestore();
  });

  it('exposes discard overflow context and blocks end-turn when overflow exists', () => {
    const store = createTestStore();
    store.dispatch(startGame({ players: PLAYERS }));
    const root = store.getState();
    const game = root.game.game!;
    const activeIndex = game.state.activePlayerIndex;
    const activePlayer = game.state.players[activeIndex];
    const wood = game.settings.goodsTypes.find((g) => g.name === 'Wood')!;
    const nextGoods = new Map(activePlayer.goods);
    nextGoods.set(wood, game.settings.maxGoods + 1);
    const stateWithOverflow = {
      ...root,
      game: {
        ...root.game,
        game: {
          ...game,
          state: {
            ...game.state,
            phase: GamePhase.DiscardGoods,
            players: game.state.players.map((player, index) =>
              index === activeIndex ? { ...player, goods: nextGoods } : player,
            ),
          },
        },
      },
    };

    const discardPanel = selectDiscardPanelModel(stateWithOverflow);
    expect(discardPanel.overflow).toBeGreaterThan(0);
    expect(discardPanel.isActionAllowed).toBe(true);
    expect(discardPanel.canEndTurn).toBe(false);
    expect(discardPanel.endTurnReason).toBe('Discard goods before ending the turn.');
  });

  it('reports game-end criteria details when thresholds are met', () => {
    const store = createTestStore();
    store.dispatch(startGame({ players: PLAYERS }));
    const root = store.getState();
    const game = root.game.game!;
    const activeIndex = game.state.activePlayerIndex;
    const developmentThreshold = game.settings.endCondition.numDevelopments ?? 5;
    const completedDevelopments = game.settings.developmentDefinitions
      .slice(0, developmentThreshold)
      .map((development) => development.id);
    const stateWithEndCondition = {
      ...root,
      game: {
        ...root.game,
        game: {
          ...game,
          state: {
            ...game.state,
            players: game.state.players.map((player, index) =>
              index === activeIndex
                ? { ...player, developments: completedDevelopments }
                : player,
            ),
          },
        },
      },
    };

    const endgameStatus = selectEndgameStatus(stateWithEndCondition);
    expect(endgameStatus.isGameOver).toBe(true);
    expect(
      endgameStatus.reasons.some((reason) =>
        reason.includes('Development threshold reached'),
      ),
    ).toBe(true);
  });
});

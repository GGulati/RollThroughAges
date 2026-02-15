import { describe, it, expect } from 'vitest';
import {
  getCitiesToFeed,
  applyFoodProduction,
  applyCoinsToTurn,
  applyWorkersToTurn,
  allocateGoods,
  allocateSingleGood,
  resolveProduction,
  hasGranaries,
  exchangeFoodForCoins,
  hasEngineering,
  exchangeStoneForWorkers,
} from '../../game/engine/productionEngine';
import { GamePhase } from '../../game/game';
import {
  createTestSettings,
  createTestPlayer,
  createTestTurn,
  createTestDice,
  createTestGame,
  setPlayerGoods,
  getPlayerGoods,
  DICE_FACE,
} from '../testUtils';

describe('productionEngine', () => {
  const settings = createTestSettings(2);

  describe('getCitiesToFeed', () => {
    it('returns number of completed cities', () => {
      const player = createTestPlayer('p1', settings);
      expect(getCitiesToFeed(player)).toBe(settings.startingCities);
    });

    it('increases when more cities completed', () => {
      const player = createTestPlayer('p1', settings);
      player.cities[3] = { workersCommitted: 0, completed: true };

      expect(getCitiesToFeed(player)).toBe(settings.startingCities + 1);
    });
  });

  describe('applyFoodProduction', () => {
    it('adds food after feeding', () => {
      const player = createTestPlayer('p1', settings);
      player.food = 2;

      const { player: newPlayer, shortage } = applyFoodProduction(player, 5, settings);

      // 2 existing + 5 produced - 3 cities = 4 remaining
      expect(newPlayer.food).toBe(4);
      expect(shortage).toBe(0);
    });

    it('handles food shortage', () => {
      const player = createTestPlayer('p1', settings);
      player.food = 0;

      // 0 existing + 1 produced - 3 cities = -2 shortage
      const { player: newPlayer, shortage } = applyFoodProduction(player, 1, settings);

      expect(newPlayer.food).toBe(0);
      expect(shortage).toBe(2);
      expect(newPlayer.disasterPenalties).toBe(2);
    });

    it('caps food at maxFood', () => {
      const player = createTestPlayer('p1', settings);
      player.food = settings.maxFood;

      const { player: newPlayer } = applyFoodProduction(player, 10, settings);
      expect(newPlayer.food).toBeLessThanOrEqual(settings.maxFood);
    });
  });

  describe('applyCoinsToTurn', () => {
    it('adds coins to turn production', () => {
      const turn = createTestTurn('p1');
      const newTurn = applyCoinsToTurn(turn, 7);

      expect(newTurn.turnProduction.coins).toBe(7);
    });

    it('accumulates coins', () => {
      const turn = createTestTurn('p1', {
        turnProduction: { goods: 0, food: 0, workers: 0, coins: 5, skulls: 0 },
      });
      const newTurn = applyCoinsToTurn(turn, 3);

      expect(newTurn.turnProduction.coins).toBe(8);
    });
  });

  describe('applyWorkersToTurn', () => {
    it('adds workers to turn production', () => {
      const turn = createTestTurn('p1');
      const newTurn = applyWorkersToTurn(turn, 4);

      expect(newTurn.turnProduction.workers).toBe(4);
    });
  });

  describe('allocateGoods', () => {
    it('adds goods to player', () => {
      const player = createTestPlayer('p1', settings);
      const woodType = settings.goodsTypes.find((g) => g.name === 'Wood')!;

      const newPlayer = allocateGoods(player, woodType, 3);
      expect(newPlayer.goods.get(woodType)).toBe(3);
    });

    it('accumulates goods', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 2, settings);

      const woodType = settings.goodsTypes.find((g) => g.name === 'Wood')!;
      const newPlayer = allocateGoods(player, woodType, 3);

      expect(newPlayer.goods.get(woodType)).toBe(5);
    });
  });

  describe('allocateSingleGood', () => {
    it('allocates one good from pending', () => {
      const player = createTestPlayer('p1', settings);
      const turn = createTestTurn('p1', {
        turnProduction: { goods: 5, food: 0, workers: 0, coins: 0, skulls: 0 },
      });

      const { player: newPlayer, turn: newTurn } = allocateSingleGood(
        player,
        turn,
        'Wood',
        settings
      );

      expect(getPlayerGoods(newPlayer, 'Wood', settings)).toBe(1);
      expect(newTurn.turnProduction.goods).toBe(4);
    });

    it('does nothing when no goods pending', () => {
      const player = createTestPlayer('p1', settings);
      const turn = createTestTurn('p1');

      const { player: newPlayer, turn: newTurn } = allocateSingleGood(
        player,
        turn,
        'Wood',
        settings
      );

      expect(newPlayer).toEqual(player);
      expect(newTurn).toEqual(turn);
    });

    it('does nothing for unknown goods type', () => {
      const player = createTestPlayer('p1', settings);
      const turn = createTestTurn('p1', {
        turnProduction: { goods: 5, food: 0, workers: 0, coins: 0, skulls: 0 },
      });

      const { turn: newTurn } = allocateSingleGood(player, turn, 'Unknown', settings);
      expect(newTurn.turnProduction.goods).toBe(5);
    });

    it('applies Quarrying bonus when allocating Stone', () => {
      const player = createTestPlayer('p1', settings, { developments: ['quarrying'] });
      const turn = createTestTurn('p1', {
        turnProduction: { goods: 1, food: 0, workers: 0, coins: 0, skulls: 0 },
      });

      const { player: newPlayer, turn: newTurn } = allocateSingleGood(
        player,
        turn,
        'Stone',
        settings
      );

      expect(getPlayerGoods(newPlayer, 'Stone', settings)).toBe(2);
      expect(newTurn.turnProduction.goods).toBe(0);
    });
  });

  describe('resolveProduction', () => {
    it('calculates production from dice', () => {
      const game = createTestGame(2, GamePhase.ResolveProduction);
      const dice = createTestDice([DICE_FACE.THREE_FOOD, DICE_FACE.THREE_WORKERS]);
      game.state.turn.dice = dice;

      const result = resolveProduction(game.state, game.state.players, settings);

      expect(result.turnProduction.food).toBe(3);
      expect(result.turnProduction.workers).toBe(3);
    });

    it('includes skull count', () => {
      const game = createTestGame(2, GamePhase.ResolveProduction);
      const dice = createTestDice([DICE_FACE.TWO_GOODS_SKULL, DICE_FACE.TWO_GOODS_SKULL]);
      game.state.turn.dice = dice;

      const result = resolveProduction(game.state, game.state.players, settings);

      expect(result.skullsRolled).toBe(2);
      expect(result.turnProduction.goods).toBe(0);
      expect(getPlayerGoods(result.activePlayer, 'Wood', settings)).toBe(1);
      expect(getPlayerGoods(result.activePlayer, 'Stone', settings)).toBe(1);
      expect(getPlayerGoods(result.activePlayer, 'Ceramic', settings)).toBe(1);
      expect(getPlayerGoods(result.activePlayer, 'Fabric', settings)).toBe(1);
    });

    it('applies disasters based on skulls', () => {
      const game = createTestGame(2, GamePhase.ResolveProduction);
      // 3 skulls = Pestilence (opponents)
      const dice = createTestDice([
        DICE_FACE.TWO_GOODS_SKULL,
        DICE_FACE.TWO_GOODS_SKULL,
        DICE_FACE.TWO_GOODS_SKULL,
      ]);
      game.state.turn.dice = dice;

      const result = resolveProduction(game.state, game.state.players, settings);

      // Player 2 (opponent) should have penalty
      expect(result.players[1].disasterPenalties).toBeGreaterThan(0);
    });
  });

  describe('hasGranaries', () => {
    it('returns false without development', () => {
      const player = createTestPlayer('p1', settings);
      expect(hasGranaries(player, settings)).toBe(false);
    });

    it('returns true with Granaries', () => {
      const player = createTestPlayer('p1', settings, { developments: ['granaries'] });
      expect(hasGranaries(player, settings)).toBe(true);
    });

    it('returns true for any matching exchange effect', () => {
      const customSettings = createTestSettings(2);
      customSettings.developmentDefinitions = customSettings.developmentDefinitions.map((dev) =>
        dev.id === 'leadership'
          ? {
              ...dev,
              specialEffect: {
                type: 'exchange' as const,
                from: 'food',
                to: 'coins',
                rate: 4,
              },
            }
          : dev,
      );
      const player = createTestPlayer('p1', customSettings, {
        developments: ['leadership'],
      });
      expect(hasGranaries(player, customSettings)).toBe(true);
    });
  });

  describe('exchangeFoodForCoins', () => {
    it('returns null without Granaries', () => {
      const player = createTestPlayer('p1', settings);
      const turn = createTestTurn('p1');

      const result = exchangeFoodForCoins(player, turn, 2, settings);
      expect(result).toBeNull();
    });

    it('exchanges food for coins with Granaries', () => {
      const player = createTestPlayer('p1', settings, { developments: ['granaries'] });
      player.food = 5;
      const turn = createTestTurn('p1');

      const result = exchangeFoodForCoins(player, turn, 2, settings);

      if (result) {
        expect(result.player.food).toBe(3);
        expect(result.turn.turnProduction.coins).toBeGreaterThan(0);
      }
    });

    it('returns null when insufficient food', () => {
      const player = createTestPlayer('p1', settings, { developments: ['granaries'] });
      player.food = 1;
      const turn = createTestTurn('p1');

      const result = exchangeFoodForCoins(player, turn, 5, settings);
      expect(result).toBeNull();
    });

    it('uses exchange effect metadata instead of granaries id', () => {
      const customSettings = createTestSettings(2);
      customSettings.developmentDefinitions = customSettings.developmentDefinitions.map((dev) =>
        dev.id === 'leadership'
          ? {
              ...dev,
              specialEffect: {
                type: 'exchange' as const,
                from: 'food',
                to: 'coins',
                rate: 4,
              },
            }
          : dev,
      );

      const player = createTestPlayer('p1', customSettings, {
        developments: ['leadership'],
      });
      player.food = 5;
      const turn = createTestTurn('p1');
      const result = exchangeFoodForCoins(player, turn, 2, customSettings);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.player.food).toBe(3);
        expect(result.turn.turnProduction.coins).toBe(8);
      }
    });
  });

  describe('hasEngineering', () => {
    it('returns false without development', () => {
      const player = createTestPlayer('p1', settings);
      expect(hasEngineering(player, settings)).toBe(false);
    });

    it('returns true with Engineering', () => {
      const player = createTestPlayer('p1', settings, { developments: ['engineering'] });
      expect(hasEngineering(player, settings)).toBe(true);
    });

    it('returns true for any matching stone->workers exchange effect', () => {
      const customSettings = createTestSettings(2);
      customSettings.developmentDefinitions = customSettings.developmentDefinitions.map((dev) =>
        dev.id === 'leadership'
          ? {
              ...dev,
              specialEffect: {
                type: 'exchange' as const,
                from: 'stone',
                to: 'workers',
                rate: 2,
              },
            }
          : dev,
      );
      const player = createTestPlayer('p1', customSettings, {
        developments: ['leadership'],
      });
      expect(hasEngineering(player, customSettings)).toBe(true);
    });
  });

  describe('exchangeStoneForWorkers', () => {
    it('returns null without Engineering', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Stone', 5, settings);
      const turn = createTestTurn('p1');

      const result = exchangeStoneForWorkers(player, turn, 2, settings);
      expect(result).toBeNull();
    });

    it('exchanges stone for workers with Engineering', () => {
      let player = createTestPlayer('p1', settings, { developments: ['engineering'] });
      player = setPlayerGoods(player, 'Stone', 5, settings);
      const turn = createTestTurn('p1');

      const result = exchangeStoneForWorkers(player, turn, 2, settings);

      if (result) {
        expect(getPlayerGoods(result.player, 'Stone', settings)).toBe(3);
        expect(result.turn.turnProduction.workers).toBeGreaterThan(0);
      }
    });

    it('returns null when insufficient stone', () => {
      let player = createTestPlayer('p1', settings, { developments: ['engineering'] });
      player = setPlayerGoods(player, 'Stone', 1, settings);
      const turn = createTestTurn('p1');

      const result = exchangeStoneForWorkers(player, turn, 5, settings);
      expect(result).toBeNull();
    });

    it('uses exchange effect metadata instead of engineering id', () => {
      const customSettings = createTestSettings(2);
      customSettings.developmentDefinitions = customSettings.developmentDefinitions.map((dev) =>
        dev.id === 'leadership'
          ? {
              ...dev,
              specialEffect: {
                type: 'exchange' as const,
                from: 'stone',
                to: 'workers',
                rate: 2,
              },
            }
          : dev,
      );

      let player = createTestPlayer('p1', customSettings, {
        developments: ['leadership'],
      });
      player = setPlayerGoods(player, 'Stone', 4, customSettings);
      const turn = createTestTurn('p1');
      const result = exchangeStoneForWorkers(player, turn, 2, customSettings);

      expect(result).not.toBeNull();
      if (result) {
        expect(getPlayerGoods(result.player, 'Stone', customSettings)).toBe(2);
        expect(result.turn.turnProduction.workers).toBe(4);
      }
    });
  });
});

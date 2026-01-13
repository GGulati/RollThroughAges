import { describe, it, expect } from 'vitest';
import {
  getDevelopment,
  hasDevelopment,
  getAvailableDevelopments,
  getTotalPurchasingPower,
  canAffordDevelopment,
  purchaseDevelopment,
  getActiveEffects,
  hasEffectType,
  getDevelopmentCount,
  getDevelopmentPoints,
  getScoringEffects,
} from '../../game/engine/developmentEngine';
import {
  createTestSettings,
  createTestPlayer,
  createTestTurn,
  setPlayerGoods,
} from '../testUtils';

describe('developmentEngine', () => {
  const settings = createTestSettings(2);

  describe('getDevelopment', () => {
    it('finds development by id', () => {
      const dev = getDevelopment('agriculture', settings);
      expect(dev).toBeDefined();
      expect(dev?.id).toBe('agriculture');
    });

    it('returns undefined for unknown id', () => {
      const dev = getDevelopment('unknown', settings);
      expect(dev).toBeUndefined();
    });
  });

  describe('hasDevelopment', () => {
    it('returns false when player lacks development', () => {
      const player = createTestPlayer('p1', settings);
      expect(hasDevelopment(player, 'agriculture')).toBe(false);
    });

    it('returns true when player has development', () => {
      const player = createTestPlayer('p1', settings, { developments: ['agriculture'] });
      expect(hasDevelopment(player, 'agriculture')).toBe(true);
    });
  });

  describe('getAvailableDevelopments', () => {
    it('returns all developments for new player', () => {
      const player = createTestPlayer('p1', settings);
      const available = getAvailableDevelopments(player, settings);

      expect(available.length).toBe(settings.developmentDefinitions.length);
    });

    it('excludes already owned developments', () => {
      const player = createTestPlayer('p1', settings, { developments: ['agriculture'] });
      const available = getAvailableDevelopments(player, settings);

      expect(available.find((d) => d.id === 'agriculture')).toBeUndefined();
      expect(available.length).toBe(settings.developmentDefinitions.length - 1);
    });
  });

  describe('getTotalPurchasingPower', () => {
    it('sums coins and goods value', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 2, settings); // Value: 3

      const turn = createTestTurn('p1', {
        turnProduction: { goods: 0, food: 0, workers: 0, coins: 10, skulls: 0 },
      });

      const power = getTotalPurchasingPower(player, turn);
      expect(power).toBe(13); // 10 coins + 3 goods value
    });

    it('handles player with no goods', () => {
      const player = createTestPlayer('p1', settings);
      const turn = createTestTurn('p1', {
        turnProduction: { goods: 0, food: 0, workers: 0, coins: 5, skulls: 0 },
      });

      expect(getTotalPurchasingPower(player, turn)).toBe(5);
    });
  });

  describe('canAffordDevelopment', () => {
    it('returns true when player has enough coins', () => {
      const player = createTestPlayer('p1', settings);
      const cheapDev = settings.developmentDefinitions.find((d) => d.cost <= 10);
      if (!cheapDev) return;

      const turn = createTestTurn('p1', {
        turnProduction: { goods: 0, food: 0, workers: 0, coins: cheapDev.cost, skulls: 0 },
      });

      expect(canAffordDevelopment(player, turn, cheapDev.id, settings)).toBe(true);
    });

    it('returns false when player cannot afford', () => {
      const player = createTestPlayer('p1', settings);
      const expensiveDev = settings.developmentDefinitions.find((d) => d.cost > 50);
      if (!expensiveDev) return;

      const turn = createTestTurn('p1', {
        turnProduction: { goods: 0, food: 0, workers: 0, coins: 0, skulls: 0 },
      });

      expect(canAffordDevelopment(player, turn, expensiveDev.id, settings)).toBe(false);
    });

    it('returns false for already owned development', () => {
      const player = createTestPlayer('p1', settings, { developments: ['agriculture'] });
      const turn = createTestTurn('p1', {
        turnProduction: { goods: 0, food: 0, workers: 0, coins: 100, skulls: 0 },
      });

      expect(canAffordDevelopment(player, turn, 'agriculture', settings)).toBe(false);
    });
  });

  describe('purchaseDevelopment', () => {
    it('purchases development with coins only', () => {
      const player = createTestPlayer('p1', settings);
      const cheapDev = settings.developmentDefinitions.find((d) => d.cost <= 10);
      if (!cheapDev) return;

      const turn = createTestTurn('p1', {
        turnProduction: { goods: 0, food: 0, workers: 0, coins: cheapDev.cost + 5, skulls: 0 },
      });

      // No goods needed when coins cover the cost
      const result = purchaseDevelopment(player, turn, cheapDev.id, [], settings);
      expect(result).not.toHaveProperty('error');
      expect((result as { player: any; turn: any }).player.developments).toContain(cheapDev.id);
      expect((result as { player: any; turn: any }).turn.turnProduction.coins).toBe(5);
    });

    it('spends goods when coins insufficient', () => {
      let player = createTestPlayer('p1', settings);
      const spearhead = settings.goodsTypes.find((g) => g.name === 'Spearhead')!;
      player = setPlayerGoods(player, 'Spearhead', 3, settings); // Value: 30

      const dev = getDevelopment('agriculture', settings)!; // Cost: 15
      const turn = createTestTurn('p1', {
        turnProduction: { goods: 0, food: 0, workers: 0, coins: 5, skulls: 0 },
      });

      // Need 10 more after coins, spearhead x3 is worth 30
      const result = purchaseDevelopment(player, turn, dev.id, [spearhead], settings);

      expect(result).not.toHaveProperty('error');
      const success = result as { player: any; turn: any };
      expect(success.player.developments).toContain(dev.id);
      expect(success.turn.turnProduction.coins).toBe(0); // All coins spent
      expect(success.player.goods.get(spearhead)).toBe(0); // All spearheads spent
    });

    it('returns error for unknown development', () => {
      const player = createTestPlayer('p1', settings);
      const turn = createTestTurn('p1');

      const result = purchaseDevelopment(player, turn, 'unknown', [], settings);
      expect(result).toHaveProperty('error');
    });

    it('returns error for already owned development', () => {
      const player = createTestPlayer('p1', settings, { developments: ['agriculture'] });
      const turn = createTestTurn('p1', {
        turnProduction: { goods: 0, food: 0, workers: 0, coins: 100, skulls: 0 },
      });

      const result = purchaseDevelopment(player, turn, 'agriculture', [], settings);
      expect(result).toHaveProperty('error');
    });

    it('returns error when cannot afford', () => {
      const player = createTestPlayer('p1', settings);
      const expensiveDev = settings.developmentDefinitions.find((d) => d.cost > 100);
      if (!expensiveDev) return;

      const turn = createTestTurn('p1', {
        turnProduction: { goods: 0, food: 0, workers: 0, coins: 0, skulls: 0 },
      });

      const result = purchaseDevelopment(player, turn, expensiveDev.id, [], settings);
      expect(result).toHaveProperty('error');
    });
  });

  describe('getActiveEffects', () => {
    it('returns empty array for player with no developments', () => {
      const player = createTestPlayer('p1', settings);
      const effects = getActiveEffects(player, settings);

      expect(effects).toEqual([]);
    });

    it('returns effects from owned developments', () => {
      const player = createTestPlayer('p1', settings, { developments: ['agriculture'] });
      const effects = getActiveEffects(player, settings);

      expect(effects.length).toBe(1);
    });
  });

  describe('hasEffectType', () => {
    it('returns false when player lacks effect type', () => {
      const player = createTestPlayer('p1', settings);
      expect(hasEffectType(player, 'diceReroll', settings)).toBe(false);
    });

    it('returns true when player has effect type', () => {
      const player = createTestPlayer('p1', settings, { developments: ['leadership'] });
      expect(hasEffectType(player, 'diceReroll', settings)).toBe(true);
    });
  });

  describe('getDevelopmentCount', () => {
    it('returns 0 for new player', () => {
      const player = createTestPlayer('p1', settings);
      expect(getDevelopmentCount(player)).toBe(0);
    });

    it('returns correct count', () => {
      const player = createTestPlayer('p1', settings, {
        developments: ['agriculture', 'masonry', 'leadership'],
      });
      expect(getDevelopmentCount(player)).toBe(3);
    });
  });

  describe('getDevelopmentPoints', () => {
    it('returns 0 for no developments', () => {
      const player = createTestPlayer('p1', settings);
      expect(getDevelopmentPoints(player, settings)).toBe(0);
    });

    it('sums points from developments', () => {
      const devs = settings.developmentDefinitions.slice(0, 2);
      const expectedPoints = devs.reduce((sum, d) => sum + d.points, 0);

      const player = createTestPlayer('p1', settings, {
        developments: devs.map((d) => d.id),
      });

      expect(getDevelopmentPoints(player, settings)).toBe(expectedPoints);
    });
  });

  describe('getScoringEffects', () => {
    it('returns empty for no scoring developments', () => {
      const player = createTestPlayer('p1', settings);
      const effects = getScoringEffects(player, settings);

      expect(effects).toEqual([]);
    });

    it('returns bonusPointsPer effects', () => {
      // Find a development with bonusPointsPer effect
      const bonusDev = settings.developmentDefinitions.find(
        (d) => d.specialEffect.type === 'bonusPointsPer'
      );

      if (bonusDev) {
        const player = createTestPlayer('p1', settings, { developments: [bonusDev.id] });
        const effects = getScoringEffects(player, settings);

        expect(effects.length).toBe(1);
        expect(effects[0]).toHaveProperty('entity');
        expect(effects[0]).toHaveProperty('points');
      }
    });
  });
});

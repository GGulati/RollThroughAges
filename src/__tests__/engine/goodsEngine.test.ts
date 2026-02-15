import { describe, it, expect } from 'vitest';
import {
  getGoodsType,
  getGoodsValue,
  calculateGoodsValue,
  getGoodsQuantity,
  setGoodsQuantity,
  addGoods,
  hasNoGoodsLimit,
  getGoodsLimit,
  calculateGoodsOverflow,
  hasGoodsOverflow,
  validateKeepGoods,
  applyKeepGoods,
  clearAllGoods,
  getTotalGoodsQuantity,
  calculateSpendValue,
  validateSpendGoods,
  spendGoods,
} from '../../game/engine/goodsEngine';
import {
  createTestSettings,
  createTestPlayer,
  setPlayerGoods,
} from '../testUtils';

describe('goodsEngine', () => {
  const settings = createTestSettings(2);

  describe('getGoodsType', () => {
    it('finds goods type by name', () => {
      const wood = getGoodsType('Wood', settings);
      expect(wood).toBeDefined();
      expect(wood?.name).toBe('Wood');
    });

    it('returns undefined for unknown goods', () => {
      const unknown = getGoodsType('Unknown', settings);
      expect(unknown).toBeUndefined();
    });
  });

  describe('getGoodsValue', () => {
    it('returns correct value for Wood', () => {
      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;
      expect(getGoodsValue(wood, 1)).toBe(1);
      expect(getGoodsValue(wood, 2)).toBe(3);
      expect(getGoodsValue(wood, 3)).toBe(6);
    });

    it('returns correct value for Stone', () => {
      const stone = settings.goodsTypes.find((g) => g.name === 'Stone')!;
      expect(getGoodsValue(stone, 1)).toBe(2);
      expect(getGoodsValue(stone, 2)).toBe(6);
    });

    it('returns 0 for 0 quantity', () => {
      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;
      expect(getGoodsValue(wood, 0)).toBe(0);
    });

    it('caps at max value for excess quantity', () => {
      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;
      expect(getGoodsValue(wood, 100)).toBe(36); // Max value
    });
  });

  describe('calculateGoodsValue', () => {
    it('calculates total value of all goods', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 2, settings); // Value: 3
      player = setPlayerGoods(player, 'Stone', 1, settings); // Value: 2

      const total = calculateGoodsValue(player.goods);
      expect(total).toBe(5);
    });

    it('returns 0 for empty goods', () => {
      const player = createTestPlayer('p1', settings);
      expect(calculateGoodsValue(player.goods)).toBe(0);
    });
  });

  describe('getGoodsQuantity / setGoodsQuantity', () => {
    it('gets and sets goods quantity by name', () => {
      const player = createTestPlayer('p1', settings);
      const newGoods = setGoodsQuantity(player.goods, 'Wood', 5);

      expect(getGoodsQuantity(newGoods, 'Wood')).toBe(5);
    });

    it('returns 0 for unknown goods name', () => {
      const player = createTestPlayer('p1', settings);
      expect(getGoodsQuantity(player.goods, 'Unknown')).toBe(0);
    });
  });

  describe('addGoods', () => {
    it('adds goods to existing quantity', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 2, settings);

      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;
      const newGoods = addGoods(player.goods, wood, 3);

      expect(newGoods.get(wood)).toBe(5);
    });
  });

  describe('hasNoGoodsLimit', () => {
    it('returns false without Caravans', () => {
      const player = createTestPlayer('p1', settings);
      expect(hasNoGoodsLimit(player, settings)).toBe(false);
    });

    it('returns true with Caravans', () => {
      const player = createTestPlayer('p1', settings, { developments: ['caravans'] });
      expect(hasNoGoodsLimit(player, settings)).toBe(true);
    });

    it('returns true for any owned noGoodsLimit effect', () => {
      const customSettings = createTestSettings(2);
      customSettings.developmentDefinitions = customSettings.developmentDefinitions.map((dev) =>
        dev.id === 'leadership'
          ? { ...dev, specialEffect: { type: 'noGoodsLimit' as const } }
          : dev,
      );
      const player = createTestPlayer('p1', customSettings, {
        developments: ['leadership'],
      });
      expect(hasNoGoodsLimit(player, customSettings)).toBe(true);
    });
  });

  describe('getGoodsLimit', () => {
    it('returns maxGoods from settings normally', () => {
      const player = createTestPlayer('p1', settings);
      expect(getGoodsLimit(player, settings)).toBe(settings.maxGoods);
    });

    it('returns Infinity with Caravans', () => {
      const player = createTestPlayer('p1', settings, { developments: ['caravans'] });
      expect(getGoodsLimit(player, settings)).toBe(Infinity);
    });
  });

  describe('calculateGoodsOverflow', () => {
    it('returns total overflow amount across all goods', () => {
      let player = createTestPlayer('p1', settings);
      // Total: 4 + 3 + 1 = 8, limit is 6, overflow is 2
      player = setPlayerGoods(player, 'Wood', 4, settings);
      player = setPlayerGoods(player, 'Stone', 3, settings);
      player = setPlayerGoods(player, 'Ceramic', 1, settings);

      const overflow = calculateGoodsOverflow(player.goods, player, settings);
      expect(overflow).toBe(2);
    });

    it('returns 0 when at or under limit', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 3, settings);
      player = setPlayerGoods(player, 'Stone', 3, settings);

      const overflow = calculateGoodsOverflow(player.goods, player, settings);
      expect(overflow).toBe(0);
    });

    it('returns 0 with Caravans (no limit)', () => {
      let player = createTestPlayer('p1', settings, { developments: ['caravans'] });
      player = setPlayerGoods(player, 'Wood', 100, settings);

      const overflow = calculateGoodsOverflow(player.goods, player, settings);
      expect(overflow).toBe(0);
    });
  });

  describe('hasGoodsOverflow', () => {
    it('returns true when total exceeds limit', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 4, settings);
      player = setPlayerGoods(player, 'Stone', 3, settings);

      expect(hasGoodsOverflow(player.goods, player, settings)).toBe(true);
    });

    it('returns false when at or under limit', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 3, settings);
      player = setPlayerGoods(player, 'Stone', 3, settings);

      expect(hasGoodsOverflow(player.goods, player, settings)).toBe(false);
    });
  });

  describe('validateKeepGoods', () => {
    it('valid when keeping goods at limit', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 5, settings);
      player = setPlayerGoods(player, 'Stone', 3, settings);

      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;
      const stone = settings.goodsTypes.find((g) => g.name === 'Stone')!;

      const goodsToKeep = new Map([
        [wood, 4],
        [stone, 2],
      ]);

      const result = validateKeepGoods(player.goods, goodsToKeep, player, settings);
      expect(result.valid).toBe(true);
    });

    it('invalid when keeping more than owned', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 2, settings);

      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;
      const goodsToKeep = new Map([[wood, 5]]);

      const result = validateKeepGoods(player.goods, goodsToKeep, player, settings);
      expect(result.valid).toBe(false);
      expect(result).toHaveProperty('reason');
    });

    it('invalid when keeping more than limit', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 10, settings);

      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;
      const goodsToKeep = new Map([[wood, 8]]);

      const result = validateKeepGoods(player.goods, goodsToKeep, player, settings);
      expect(result.valid).toBe(false);
      expect(result).toHaveProperty('reason');
    });
  });

  describe('applyKeepGoods', () => {
    it('sets goods to kept amounts', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 5, settings);
      player = setPlayerGoods(player, 'Stone', 4, settings);

      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;
      const stone = settings.goodsTypes.find((g) => g.name === 'Stone')!;

      const goodsToKeep = new Map([
        [wood, 3],
        [stone, 2],
      ]);

      const newGoods = applyKeepGoods(player.goods, goodsToKeep);

      expect(newGoods.get(wood)).toBe(3);
      expect(newGoods.get(stone)).toBe(2);
    });

    it('sets unspecified goods to 0', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 5, settings);
      player = setPlayerGoods(player, 'Stone', 4, settings);

      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;
      const stone = settings.goodsTypes.find((g) => g.name === 'Stone')!;

      // Only specify wood, stone should become 0
      const goodsToKeep = new Map([[wood, 3]]);

      const newGoods = applyKeepGoods(player.goods, goodsToKeep);

      expect(newGoods.get(wood)).toBe(3);
      expect(newGoods.get(stone)).toBe(0);
    });
  });

  describe('clearAllGoods', () => {
    it('sets all goods to 0', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 5, settings);
      player = setPlayerGoods(player, 'Stone', 3, settings);

      const cleared = clearAllGoods(player.goods);

      for (const [, quantity] of cleared) {
        expect(quantity).toBe(0);
      }
    });
  });

  describe('getTotalGoodsQuantity', () => {
    it('sums all goods quantities', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 3, settings);
      player = setPlayerGoods(player, 'Stone', 2, settings);
      player = setPlayerGoods(player, 'Ceramic', 1, settings);

      expect(getTotalGoodsQuantity(player.goods)).toBe(6);
    });
  });

  describe('calculateSpendValue', () => {
    it('calculates total value of spending entire goods types', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 3, settings); // Value: 6

      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;

      expect(calculateSpendValue(player.goods, [wood])).toBe(6);
    });

    it('calculates total value for multiple goods types', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 2, settings); // Value: 3
      player = setPlayerGoods(player, 'Stone', 1, settings); // Value: 2

      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;
      const stone = settings.goodsTypes.find((g) => g.name === 'Stone')!;

      expect(calculateSpendValue(player.goods, [wood, stone])).toBe(5);
    });
  });

  describe('validateSpendGoods', () => {
    it('valid when spend value meets requirement', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Spearhead', 2, settings); // Value: 15

      const spearhead = settings.goodsTypes.find((g) => g.name === 'Spearhead')!;

      const result = validateSpendGoods(player.goods, [spearhead], 15);
      expect(result.valid).toBe(true);
    });

    it('invalid when spend value is insufficient', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 2, settings); // Value: 3

      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;

      const result = validateSpendGoods(player.goods, [wood], 10);
      expect(result.valid).toBe(false);
      expect(result).toHaveProperty('reason');
    });

    it('valid when combining multiple goods types', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 3, settings); // Value: 6
      player = setPlayerGoods(player, 'Stone', 2, settings); // Value: 6

      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;
      const stone = settings.goodsTypes.find((g) => g.name === 'Stone')!;

      const result = validateSpendGoods(player.goods, [wood, stone], 12);
      expect(result.valid).toBe(true);
    });
  });

  describe('spendGoods', () => {
    it('spends entire quantity of selected goods types', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 5, settings);
      player = setPlayerGoods(player, 'Stone', 3, settings);
      player = setPlayerGoods(player, 'Ceramic', 2, settings);

      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;
      const stone = settings.goodsTypes.find((g) => g.name === 'Stone')!;
      const ceramic = settings.goodsTypes.find((g) => g.name === 'Ceramic')!;

      const newGoods = spendGoods(player.goods, [wood, stone]);

      expect(newGoods.get(wood)).toBe(0);
      expect(newGoods.get(stone)).toBe(0);
      expect(newGoods.get(ceramic)).toBe(2); // Unchanged
    });

    it('handles spending goods with zero quantity', () => {
      const player = createTestPlayer('p1', settings);

      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;

      const newGoods = spendGoods(player.goods, [wood]);

      expect(newGoods.get(wood)).toBe(0);
    });
  });
});

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
  discardOverflowGoods,
  clearAllGoods,
  getTotalGoodsQuantity,
  spendGoodsForCoins,
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
      expect(hasNoGoodsLimit(player)).toBe(false);
    });

    it('returns true with Caravans', () => {
      const player = createTestPlayer('p1', settings, { developments: ['caravans'] });
      expect(hasNoGoodsLimit(player)).toBe(true);
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
    it('detects overflow goods', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 8, settings); // Over limit of 6

      const overflow = calculateGoodsOverflow(player.goods, player, settings);
      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;

      expect(overflow.get(wood)).toBe(2);
    });

    it('returns empty map when no overflow', () => {
      const player = createTestPlayer('p1', settings);
      const overflow = calculateGoodsOverflow(player.goods, player, settings);

      expect(overflow.size).toBe(0);
    });

    it('returns empty map with Caravans', () => {
      let player = createTestPlayer('p1', settings, { developments: ['caravans'] });
      player = setPlayerGoods(player, 'Wood', 100, settings);

      const overflow = calculateGoodsOverflow(player.goods, player, settings);
      expect(overflow.size).toBe(0);
    });
  });

  describe('hasGoodsOverflow', () => {
    it('returns true when overflow exists', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 10, settings);

      expect(hasGoodsOverflow(player.goods, player, settings)).toBe(true);
    });

    it('returns false when no overflow', () => {
      const player = createTestPlayer('p1', settings);
      expect(hasGoodsOverflow(player.goods, player, settings)).toBe(false);
    });
  });

  describe('discardOverflowGoods', () => {
    it('reduces goods to limit', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 10, settings);
      player = setPlayerGoods(player, 'Stone', 8, settings);

      const newGoods = discardOverflowGoods(player.goods, player, settings);
      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;
      const stone = settings.goodsTypes.find((g) => g.name === 'Stone')!;

      expect(newGoods.get(wood)).toBe(6);
      expect(newGoods.get(stone)).toBe(6);
    });

    it('does not change goods under limit', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 3, settings);

      const newGoods = discardOverflowGoods(player.goods, player, settings);
      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;

      expect(newGoods.get(wood)).toBe(3);
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

  describe('spendGoodsForCoins', () => {
    it('spends goods to meet coin requirement', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Spearhead', 2, settings); // Value: 15

      const result = spendGoodsForCoins(player.goods, 10);
      expect(result).not.toBeNull();

      const spearhead = settings.goodsTypes.find((g) => g.name === 'Spearhead')!;
      expect(result!.get(spearhead)).toBe(1); // Spent 1 Spearhead (10 coins)
    });

    it('returns null when insufficient goods', () => {
      const player = createTestPlayer('p1', settings);
      const result = spendGoodsForCoins(player.goods, 100);

      expect(result).toBeNull();
    });

    it('prefers higher value goods', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 3, settings); // Value: 6
      player = setPlayerGoods(player, 'Spearhead', 1, settings); // Value: 5

      const result = spendGoodsForCoins(player.goods, 5);
      expect(result).not.toBeNull();

      // Should spend Spearhead first (higher per-item value)
      const spearhead = settings.goodsTypes.find((g) => g.name === 'Spearhead')!;
      expect(result!.get(spearhead)).toBe(0);
    });
  });
});

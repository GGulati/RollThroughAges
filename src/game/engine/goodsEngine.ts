import { GoodsTrack, GoodsType } from '../goods';
import { PlayerState, GameSettings } from '../game';

/**
 * Get a goods type by name.
 */
export function getGoodsType(name: string, settings: GameSettings): GoodsType | undefined {
  return settings.goodsTypes.find((g) => g.name === name);
}

/**
 * Get the value of goods at a specific quantity.
 */
export function getGoodsValue(goodsType: GoodsType, quantity: number): number {
  if (quantity <= 0) return 0;
  const index = Math.min(quantity - 1, goodsType.values.length - 1);
  return goodsType.values[index];
}

/**
 * Calculate the total coin value of a player's goods.
 */
export function calculateGoodsValue(goods: GoodsTrack): number {
  let total = 0;
  for (const [goodsType, quantity] of goods.entries()) {
    total += getGoodsValue(goodsType, quantity);
  }
  return total;
}

/**
 * Get the quantity of a specific good by name.
 */
export function getGoodsQuantity(goods: GoodsTrack, name: string): number {
  for (const [goodsType, quantity] of goods.entries()) {
    if (goodsType.name === name) {
      return quantity;
    }
  }
  return 0;
}

/**
 * Set the quantity of a specific good by name.
 */
export function setGoodsQuantity(goods: GoodsTrack, name: string, quantity: number): GoodsTrack {
  const newGoods = new Map(goods);
  for (const [goodsType] of newGoods.entries()) {
    if (goodsType.name === name) {
      newGoods.set(goodsType, Math.max(0, quantity));
      return newGoods;
    }
  }
  return newGoods;
}

/**
 * Add goods to a track. Player chooses which good type to add to.
 */
export function addGoods(goods: GoodsTrack, goodsType: GoodsType, amount: number): GoodsTrack {
  const newGoods = new Map(goods);
  const current = newGoods.get(goodsType) ?? 0;
  newGoods.set(goodsType, current + amount);
  return newGoods;
}

/**
 * Check if a player has the Caravans development (no goods limit).
 */
export function hasNoGoodsLimit(player: PlayerState): boolean {
  return player.developments.includes('caravans');
}

/**
 * Get the maximum goods a player can store per type.
 */
export function getGoodsLimit(player: PlayerState, settings: GameSettings): number {
  return hasNoGoodsLimit(player) ? Infinity : settings.maxGoods;
}

/**
 * Calculate overflow goods that must be discarded.
 * Returns a map of goods type to amount over the limit.
 */
export function calculateGoodsOverflow(
  goods: GoodsTrack,
  player: PlayerState,
  settings: GameSettings
): Map<GoodsType, number> {
  const overflow = new Map<GoodsType, number>();
  const limit = getGoodsLimit(player, settings);

  if (limit === Infinity) return overflow;

  for (const [goodsType, quantity] of goods.entries()) {
    if (quantity > limit) {
      overflow.set(goodsType, quantity - limit);
    }
  }
  return overflow;
}

/**
 * Check if player has goods overflow that needs to be discarded.
 */
export function hasGoodsOverflow(
  goods: GoodsTrack,
  player: PlayerState,
  settings: GameSettings
): boolean {
  const overflow = calculateGoodsOverflow(goods, player, settings);
  return overflow.size > 0;
}

/**
 * Discard goods down to the limit.
 */
export function discardOverflowGoods(
  goods: GoodsTrack,
  player: PlayerState,
  settings: GameSettings
): GoodsTrack {
  const limit = getGoodsLimit(player, settings);
  if (limit === Infinity) return goods;

  const newGoods = new Map(goods);
  for (const [goodsType, quantity] of newGoods.entries()) {
    if (quantity > limit) {
      newGoods.set(goodsType, limit);
    }
  }
  return newGoods;
}

/**
 * Clear all goods (for Revolt disaster).
 */
export function clearAllGoods(goods: GoodsTrack): GoodsTrack {
  const newGoods = new Map(goods);
  for (const [goodsType] of newGoods.entries()) {
    newGoods.set(goodsType, 0);
  }
  return newGoods;
}

/**
 * Copy a goods track immutably.
 */
export function copyGoods(goods: GoodsTrack): GoodsTrack {
  return new Map(goods);
}

/**
 * Get the total quantity of all goods.
 */
export function getTotalGoodsQuantity(goods: GoodsTrack): number {
  let total = 0;
  for (const quantity of goods.values()) {
    total += quantity;
  }
  return total;
}

/**
 * Spend goods to pay for a development.
 * Returns the new goods track after spending, or null if insufficient.
 * Goods are spent from most valuable to least valuable.
 */
export function spendGoodsForCoins(goods: GoodsTrack, coinsNeeded: number): GoodsTrack | null {
  // Sort goods by value per item (descending) to optimize spending
  const entries = Array.from(goods.entries()).sort((a, b) => {
    const valueA = a[0].values[0] ?? 0;
    const valueB = b[0].values[0] ?? 0;
    return valueB - valueA;
  });

  let remaining = coinsNeeded;
  const newGoods = new Map(goods);

  for (const [goodsType, quantity] of entries) {
    if (remaining <= 0) break;
    if (quantity <= 0) continue;

    // Spend one at a time to get exact value
    let toSpend = quantity;
    while (toSpend > 0 && remaining > 0) {
      const currentQty = newGoods.get(goodsType) ?? 0;
      const valueIfSpent = getGoodsValue(goodsType, currentQty);
      const valueAfter = getGoodsValue(goodsType, currentQty - 1);
      const valueGained = valueIfSpent - valueAfter;

      if (valueGained > 0) {
        newGoods.set(goodsType, currentQty - 1);
        remaining -= valueGained;
        toSpend--;
      } else {
        break;
      }
    }
  }

  if (remaining > 0) {
    return null;
  }

  return newGoods;
}

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
 * Resolve the goods-type key stored in a GoodsTrack by name.
 * This avoids reference-mismatch issues when call sites only have the name.
 */
export function findGoodsTypeByName(
  goods: GoodsTrack,
  name: string
): GoodsType | undefined {
  for (const goodsType of goods.keys()) {
    if (goodsType.name === name) {
      return goodsType;
    }
  }
  return undefined;
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
 * Calculate total goods overflow amount.
 * The goods limit applies to the total quantity across all goods types.
 * Returns the number of goods that must be discarded.
 */
export function calculateGoodsOverflow(
  goods: GoodsTrack,
  player: PlayerState,
  settings: GameSettings
): number {
  const limit = getGoodsLimit(player, settings);

  if (limit === Infinity) return 0;

  const total = getTotalGoodsQuantity(goods);
  return Math.max(0, total - limit);
}

/**
 * Check if player has goods overflow that needs to be discarded.
 */
export function hasGoodsOverflow(
  goods: GoodsTrack,
  player: PlayerState,
  settings: GameSettings
): boolean {
  return calculateGoodsOverflow(goods, player, settings) > 0;
}

/**
 * Validation result for goods operations.
 */
export type GoodsValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Validate a player's choice of goods to keep when over the limit.
 * Checks that:
 * 1. Player has enough of each goods type to keep the requested amount
 * 2. Total kept goods is at or under the limit
 */
export function validateKeepGoods(
  goods: GoodsTrack,
  goodsToKeep: GoodsTrack,
  player: PlayerState,
  settings: GameSettings
): GoodsValidationResult {
  const limit = getGoodsLimit(player, settings);

  let totalKeeping = 0;
  for (const [goodsType, keepAmount] of goodsToKeep.entries()) {
    if (keepAmount < 0) {
      return { valid: false, reason: `Cannot keep negative ${goodsType.name}` };
    }
    const owned = goods.get(goodsType) ?? 0;
    if (keepAmount > owned) {
      return { valid: false, reason: `Cannot keep ${keepAmount} ${goodsType.name}, only have ${owned}` };
    }
    totalKeeping += keepAmount;
  }

  if (totalKeeping > limit) {
    return { valid: false, reason: `Cannot keep ${totalKeeping} goods, limit is ${limit}` };
  }

  return { valid: true };
}

/**
 * Apply the player's choice of goods to keep.
 * The goodsToKeep map specifies how many of each type to keep.
 */
export function applyKeepGoods(
  goods: GoodsTrack,
  goodsToKeep: GoodsTrack
): GoodsTrack {
  const newGoods = new Map(goods);

  for (const [goodsType] of newGoods.entries()) {
    const keepAmount = goodsToKeep.get(goodsType) ?? 0;
    newGoods.set(goodsType, keepAmount);
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
 * Calculate the coin value of spending entire goods types.
 * When a goods type is selected to spend, the full quantity is spent.
 */
export function calculateSpendValue(goods: GoodsTrack, goodsTypesToSpend: GoodsType[]): number {
  let totalValue = 0;

  for (const goodsType of goodsTypesToSpend) {
    const quantity = goods.get(goodsType) ?? 0;
    totalValue += getGoodsValue(goodsType, quantity);
  }

  return totalValue;
}

/**
 * Validate a player's choice of goods types to spend for coins.
 * When spending, the entire quantity of each chosen type is spent.
 * Checks that total value meets or exceeds the required coins.
 */
export function validateSpendGoods(
  goods: GoodsTrack,
  goodsTypesToSpend: GoodsType[],
  coinsNeeded: number
): GoodsValidationResult {
  // Check total value meets requirement
  const totalValue = calculateSpendValue(goods, goodsTypesToSpend);
  if (totalValue < coinsNeeded) {
    return { valid: false, reason: `Goods value ${totalValue} is less than required ${coinsNeeded}` };
  }

  return { valid: true };
}

/**
 * Spend entire quantities of selected goods types.
 * When a goods type is chosen to spend, all of it is spent.
 */
export function spendGoods(goods: GoodsTrack, goodsTypesToSpend: GoodsType[]): GoodsTrack {
  const newGoods = new Map(goods);

  for (const goodsType of goodsTypesToSpend) {
    newGoods.set(goodsType, 0);
  }

  return newGoods;
}

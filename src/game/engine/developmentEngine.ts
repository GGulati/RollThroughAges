import { DevelopmentDefinition, SpecialEffect } from '../construction';
import { PlayerState, TurnState, GameSettings } from '../game';
import { GoodsType } from '../goods';
import { calculateGoodsValue, validateSpendGoods, spendGoods, GoodsValidationResult } from './goodsEngine';

/**
 * Get a development definition by ID.
 */
export function getDevelopment(id: string, settings: GameSettings): DevelopmentDefinition | undefined {
  return settings.developmentDefinitions.find((d) => d.id === id);
}

/**
 * Check if a player already has a development.
 */
export function hasDevelopment(player: PlayerState, developmentId: string): boolean {
  return player.developments.includes(developmentId);
}

/**
 * Get all developments a player doesn't have yet.
 */
export function getAvailableDevelopments(
  player: PlayerState,
  settings: GameSettings
): DevelopmentDefinition[] {
  return settings.developmentDefinitions.filter((d) => !player.developments.includes(d.id));
}

/**
 * Calculate the total purchasing power available (coins + goods value).
 */
export function getTotalPurchasingPower(player: PlayerState, turn: TurnState): number {
  const coins = turn.turnProduction.coins;
  const goodsValue = calculateGoodsValue(player.goods);
  return coins + goodsValue;
}

/**
 * Check if a player can afford a development.
 */
export function canAffordDevelopment(
  player: PlayerState,
  turn: TurnState,
  developmentId: string,
  settings: GameSettings
): boolean {
  const development = getDevelopment(developmentId, settings);
  if (!development) return false;
  if (hasDevelopment(player, developmentId)) return false;

  const purchasingPower = getTotalPurchasingPower(player, turn);
  return purchasingPower >= development.cost;
}

/**
 * Validate a development purchase with the player's choice of goods types to spend.
 * When goods types are selected, the entire quantity of each type is spent.
 */
export function validateDevelopmentPurchase(
  player: PlayerState,
  turn: TurnState,
  developmentId: string,
  goodsTypesToSpend: GoodsType[],
  settings: GameSettings
): GoodsValidationResult {
  const development = getDevelopment(developmentId, settings);
  if (!development) {
    return { valid: false, reason: `Development ${developmentId} not found` };
  }
  if (hasDevelopment(player, developmentId)) {
    return { valid: false, reason: `Already have ${development.name}` };
  }

  // Calculate remaining cost after spending coins
  const coinsToSpend = Math.min(turn.turnProduction.coins, development.cost);
  const remainingCost = development.cost - coinsToSpend;

  if (remainingCost <= 0) {
    return { valid: true };
  }

  return validateSpendGoods(player.goods, goodsTypesToSpend, remainingCost);
}

/**
 * Purchase a development.
 * Spends coins first, then the entire quantity of specified goods types if needed.
 * Returns updated player and turn, or an error message if purchase fails.
 */
export function purchaseDevelopment(
  player: PlayerState,
  turn: TurnState,
  developmentId: string,
  goodsTypesToSpend: GoodsType[],
  settings: GameSettings
): { player: PlayerState; turn: TurnState } | { error: string } {
  const validation = validateDevelopmentPurchase(player, turn, developmentId, goodsTypesToSpend, settings);
  if (!validation.valid) {
    return { error: validation.reason };
  }

  const development = getDevelopment(developmentId, settings)!;

  let remainingCost = development.cost;
  let newTurn = { ...turn };
  let newPlayer = { ...player };

  // Spend coins first
  const coinsToSpend = Math.min(turn.turnProduction.coins, remainingCost);
  if (coinsToSpend > 0) {
    newTurn = {
      ...newTurn,
      turnProduction: {
        ...newTurn.turnProduction,
        coins: newTurn.turnProduction.coins - coinsToSpend,
      },
    };
    remainingCost -= coinsToSpend;
  }

  // Spend goods if needed (entire quantities of chosen types)
  if (remainingCost > 0) {
    newPlayer = { ...newPlayer, goods: spendGoods(player.goods, goodsTypesToSpend) };
  }

  // Add development to player
  newPlayer = {
    ...newPlayer,
    developments: [...newPlayer.developments, developmentId],
  };

  return { player: newPlayer, turn: newTurn };
}

/**
 * Get all special effects from a player's developments.
 */
export function getActiveEffects(player: PlayerState, settings: GameSettings): SpecialEffect[] {
  return player.developments
    .map((id) => getDevelopment(id, settings))
    .filter((d): d is DevelopmentDefinition => d !== undefined)
    .map((d) => d.specialEffect);
}

/**
 * Check if player has a specific type of effect.
 */
export function hasEffectType(
  player: PlayerState,
  type: SpecialEffect['type'],
  settings: GameSettings
): boolean {
  return getActiveEffects(player, settings).some((e) => e.type === type);
}

/**
 * Get the development count for a player.
 */
export function getDevelopmentCount(player: PlayerState): number {
  return player.developments.length;
}

/**
 * Calculate total points from developments.
 */
export function getDevelopmentPoints(player: PlayerState, settings: GameSettings): number {
  return player.developments
    .map((id) => getDevelopment(id, settings))
    .filter((d): d is DevelopmentDefinition => d !== undefined)
    .reduce((sum, d) => sum + d.points, 0);
}

/**
 * Get developments that affect scoring (bonusPointsPer effects).
 */
export function getScoringEffects(
  player: PlayerState,
  settings: GameSettings
): Array<{ entity: string; points: number }> {
  return getActiveEffects(player, settings)
    .filter((e): e is Extract<SpecialEffect, { type: 'bonusPointsPer' }> => e.type === 'bonusPointsPer')
    .map((e) => ({ entity: e.entity, points: e.points }));
}

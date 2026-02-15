import { ResourceProduction } from '../dice';
import { PlayerState, TurnState, GameStateSnapshot, GameSettings } from '../game';
import { GoodsType } from '../goods';
import { calculateDiceProduction, countSkulls } from './diceEngine';
import { applyDisasters } from './disasterEngine';
import { addGoods } from './goodsEngine';

/**
 * Result of production resolution including any pending choices.
 */
export interface ProductionResult {
  players: PlayerState[];
  activePlayer: PlayerState;
  foodShortage: number;
  skullsRolled: number;
  goodsToAllocate: number;
  turnProduction: ResourceProduction;
}

/**
 * Get the number of cities a player needs to feed.
 */
export function getCitiesToFeed(player: PlayerState): number {
  return player.cities.filter((city) => city.completed).length;
}

/**
 * Apply food production and feeding.
 * Returns updated player and any food shortage penalty.
 */
export function applyFoodProduction(
  player: PlayerState,
  foodProduced: number,
  settings: GameSettings
): { player: PlayerState; shortage: number } {
  const citiesToFeed = getCitiesToFeed(player);
  const totalFood = player.food + foodProduced;
  const foodAfterFeeding = totalFood - citiesToFeed;

  if (foodAfterFeeding < 0) {
    return {
      player: { ...player, food: 0, disasterPenalties: player.disasterPenalties + Math.abs(foodAfterFeeding) },
      shortage: Math.abs(foodAfterFeeding),
    };
  }

  return {
    player: { ...player, food: Math.min(foodAfterFeeding, settings.maxFood) },
    shortage: 0,
  };
}

/**
 * Apply coin production to turn state.
 */
export function applyCoinsToTurn(turn: TurnState, coins: number): TurnState {
  return {
    ...turn,
    turnProduction: {
      ...turn.turnProduction,
      coins: turn.turnProduction.coins + coins,
    },
  };
}

/**
 * Apply workers to turn state.
 */
export function applyWorkersToTurn(turn: TurnState, workers: number): TurnState {
  return {
    ...turn,
    turnProduction: {
      ...turn.turnProduction,
      workers: turn.turnProduction.workers + workers,
    },
  };
}

/**
 * Allocate goods to a specific goods type.
 */
export function allocateGoods(
  player: PlayerState,
  goodsType: GoodsType,
  amount: number
): PlayerState {
  return {
    ...player,
    goods: addGoods(player.goods, goodsType, amount),
  };
}

/**
 * Allocate a single good to a specific type.
 */
export function allocateSingleGood(
  player: PlayerState,
  turn: TurnState,
  goodsTypeName: string,
  settings: GameSettings
): { player: PlayerState; turn: TurnState } {
  const goodsType = settings.goodsTypes.find((g) => g.name === goodsTypeName);
  if (!goodsType) return { player, turn };

  const pendingGoods = turn.turnProduction.goods;
  if (pendingGoods <= 0) return { player, turn };

  const goodsBonus = getGoodsTypeBonus(player, goodsTypeName, settings);
  const totalToAllocate = 1 + goodsBonus;

  return {
    player: allocateGoods(player, goodsType, totalToAllocate),
    turn: {
      ...turn,
      turnProduction: {
        ...turn.turnProduction,
        goods: pendingGoods - 1,
      },
    },
  };
}

function getGoodsTypeBonus(
  player: PlayerState,
  goodsTypeName: string,
  settings: GameSettings
): number {
  let bonus = 0;

  for (const dev of settings.developmentDefinitions) {
    if (!player.developments.includes(dev.id)) {
      continue;
    }

    if (
      dev.specialEffect.type === 'goodsProductionBonus' &&
      dev.specialEffect.goodsType.name === goodsTypeName
    ) {
      bonus += dev.specialEffect.bonus;
    }
  }

  return bonus;
}

function autoAllocateProducedGoods(
  player: PlayerState,
  goodsProduced: number,
  settings: GameSettings
): PlayerState {
  if (goodsProduced <= 0 || settings.goodsTypes.length === 0) {
    return player;
  }

  let nextPlayer = player;
  for (let i = 0; i < goodsProduced; i += 1) {
    // Yucata/base rules: each produced good is assigned automatically
    // bottom-to-top (Wood, Stone, Ceramic, Fabric, Spearhead), then repeat.
    const goodsTypeName = settings.goodsTypes[i % settings.goodsTypes.length].name;
    const goodsType = Array.from(nextPlayer.goods.keys()).find(
      (goods) => goods.name === goodsTypeName
    );
    if (!goodsType) {
      continue;
    }

    const current = nextPlayer.goods.get(goodsType) ?? 0;
    const maxForType = goodsType.values.length;
    if (current >= maxForType) {
      continue;
    }

    const bonus = getGoodsTypeBonus(nextPlayer, goodsTypeName, settings);
    const amount = Math.min(1 + bonus, maxForType - current);
    nextPlayer = {
      ...nextPlayer,
      goods: addGoods(nextPlayer.goods, goodsType, amount),
    };
  }

  return nextPlayer;
}

/**
 * Resolve all production from dice.
 */
export function resolveProduction(
  snapshot: GameStateSnapshot,
  players: PlayerState[],
  settings: GameSettings
): ProductionResult {
  const activePlayer = players[snapshot.activePlayerIndex];
  const turn = snapshot.turn;

  const production = calculateDiceProduction(turn.dice, activePlayer, settings);

  const { player: playerAfterFood, shortage } = applyFoodProduction(
    activePlayer,
    production.food,
    settings
  );
  const playerAfterGoods = autoAllocateProducedGoods(
    playerAfterFood,
    production.goods,
    settings
  );

  const skullCount = countSkulls(turn.dice, settings);
  const playersAfterDisasters = applyDisasters(
    [
      ...players.slice(0, snapshot.activePlayerIndex),
      playerAfterGoods,
      ...players.slice(snapshot.activePlayerIndex + 1),
    ],
    snapshot.activePlayerIndex,
    skullCount,
    settings
  );

  return {
    players: playersAfterDisasters,
    activePlayer: playersAfterDisasters[snapshot.activePlayerIndex],
    foodShortage: shortage,
    skullsRolled: skullCount,
    goodsToAllocate: production.goods,
    turnProduction: {
      goods: 0,
      food: production.food,
      workers: production.workers,
      coins: production.coins,
      skulls: skullCount,
    },
  };
}

/**
 * Check if player has Granaries development (convert food to coins).
 */
export function hasGranaries(player: PlayerState): boolean {
  return player.developments.includes('granaries');
}

/**
 * Exchange food for coins using Granaries.
 */
export function exchangeFoodForCoins(
  player: PlayerState,
  turn: TurnState,
  foodAmount: number,
  settings: GameSettings
): { player: PlayerState; turn: TurnState } | null {
  if (!hasGranaries(player)) return null;
  if (player.food < foodAmount) return null;

  const granariesDev = settings.developmentDefinitions.find(d => d.id === 'granaries');
  if (!granariesDev || granariesDev.specialEffect.type !== 'exchange') return null;

  const rate = granariesDev.specialEffect.rate;
  const coinsGained = foodAmount * rate;

  return {
    player: { ...player, food: player.food - foodAmount },
    turn: {
      ...turn,
      turnProduction: {
        ...turn.turnProduction,
        coins: turn.turnProduction.coins + coinsGained,
      },
    },
  };
}

/**
 * Check if player has Engineering development (convert stone to workers).
 */
export function hasEngineering(player: PlayerState): boolean {
  return player.developments.includes('engineering');
}

/**
 * Exchange stone for workers using Engineering.
 */
export function exchangeStoneForWorkers(
  player: PlayerState,
  turn: TurnState,
  stoneAmount: number,
  settings: GameSettings
): { player: PlayerState; turn: TurnState } | null {
  if (!hasEngineering(player)) return null;

  const stoneType = settings.goodsTypes.find((g) => g.name === 'Stone');
  if (!stoneType) return null;

  const currentStone = player.goods.get(stoneType) ?? 0;
  if (currentStone < stoneAmount) return null;

  const engineeringDev = settings.developmentDefinitions.find(d => d.id === 'engineering');
  if (!engineeringDev || engineeringDev.specialEffect.type !== 'exchange') return null;

  const rate = engineeringDev.specialEffect.rate;
  const workersGained = stoneAmount * rate;

  const newGoods = new Map(player.goods);
  newGoods.set(stoneType, currentStone - stoneAmount);

  return {
    player: { ...player, goods: newGoods },
    turn: {
      ...turn,
      turnProduction: {
        ...turn.turnProduction,
        workers: turn.turnProduction.workers + workersGained,
      },
    },
  };
}

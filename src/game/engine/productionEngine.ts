import { ResourceProduction } from '../dice';
import { PlayerState, TurnState, GameStateSnapshot, GameSettings } from '../game';
import { GoodsType } from '../goods';
import { calculateDiceProduction, countSkulls } from './diceEngine';
import { applyDisasters } from './disasterEngine';
import { addGoods, findGoodsTypeByName } from './goodsEngine';

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
    const goodsType = findGoodsTypeByName(nextPlayer.goods, goodsTypeName);
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

function normalizeResourceName(resource: string): string {
  return resource.trim().toLowerCase();
}

function getGoodsTypeForResource(
  player: PlayerState,
  settings: GameSettings,
  resource: string
): GoodsType | undefined {
  const normalized = normalizeResourceName(resource);
  const settingsType = settings.goodsTypes.find(
    (goodsType) => normalizeResourceName(goodsType.name) === normalized
  );
  if (!settingsType) {
    return undefined;
  }

  return findGoodsTypeByName(player.goods, settingsType.name) ?? settingsType;
}

function getExchangeEffect(
  player: PlayerState,
  from: string,
  to: string,
  settings: GameSettings
): { from: string; to: string; rate: number } | undefined {
  const normalizedFrom = normalizeResourceName(from);
  const normalizedTo = normalizeResourceName(to);

  for (const development of settings.developmentDefinitions) {
    if (!player.developments.includes(development.id)) {
      continue;
    }
    if (development.specialEffect.type !== 'exchange') {
      continue;
    }
    if (
      normalizeResourceName(development.specialEffect.from) === normalizedFrom &&
      normalizeResourceName(development.specialEffect.to) === normalizedTo
    ) {
      return development.specialEffect;
    }
  }

  return undefined;
}

export type ExchangeEffectRule = {
  from: string;
  to: string;
  rate: number;
  developmentId: string;
  developmentName: string;
};

/**
 * List all exchange effects currently granted by purchased developments.
 */
export function getAvailableExchangeEffects(
  player: PlayerState,
  settings: GameSettings
): ExchangeEffectRule[] {
  return settings.developmentDefinitions.flatMap((development) => {
    if (!player.developments.includes(development.id)) {
      return [];
    }
    if (development.specialEffect.type !== 'exchange') {
      return [];
    }

    return [
      {
        from: development.specialEffect.from,
        to: development.specialEffect.to,
        rate: development.specialEffect.rate,
        developmentId: development.id,
        developmentName: development.name,
      },
    ];
  });
}

function getResourceAmount(
  player: PlayerState,
  turn: TurnState,
  settings: GameSettings,
  resource: string
): number {
  const normalized = normalizeResourceName(resource);
  if (normalized === 'food') {
    return player.food;
  }

  const goodsType = getGoodsTypeForResource(player, settings, resource);
  if (goodsType) {
    return player.goods.get(goodsType) ?? 0;
  }

  if (normalized in turn.turnProduction) {
    const key = normalized as keyof ResourceProduction;
    return turn.turnProduction[key];
  }

  return 0;
}

function setResourceAmount(
  player: PlayerState,
  turn: TurnState,
  settings: GameSettings,
  resource: string,
  amount: number
): { player: PlayerState; turn: TurnState } {
  const nextAmount = Math.max(0, amount);
  const normalized = normalizeResourceName(resource);

  if (normalized === 'food') {
    return {
      player: { ...player, food: Math.min(nextAmount, settings.maxFood) },
      turn,
    };
  }

  const goodsType = getGoodsTypeForResource(player, settings, resource);
  if (goodsType) {
    const nextGoods = new Map(player.goods);
    nextGoods.set(goodsType, nextAmount);
    return {
      player: { ...player, goods: nextGoods },
      turn,
    };
  }

  if (normalized in turn.turnProduction) {
    const key = normalized as keyof ResourceProduction;
    return {
      player,
      turn: {
        ...turn,
        turnProduction: {
          ...turn.turnProduction,
          [key]: nextAmount,
        },
      },
    };
  }

  return { player, turn };
}

/**
 * Check if an exchange rule exists for a resource pair.
 */
export function hasExchange(
  player: PlayerState,
  from: string,
  to: string,
  settings: GameSettings
): boolean {
  return Boolean(getExchangeEffect(player, from, to, settings));
}

/**
 * Apply an exchange rule by spending one resource and gaining another.
 */
export function exchangeResources(
  player: PlayerState,
  turn: TurnState,
  from: string,
  to: string,
  fromAmount: number,
  settings: GameSettings
): { player: PlayerState; turn: TurnState } | null {
  if (fromAmount <= 0) {
    return null;
  }

  const exchangeEffect = getExchangeEffect(player, from, to, settings);
  if (!exchangeEffect) {
    return null;
  }

  const fromCurrent = getResourceAmount(player, turn, settings, from);
  if (fromCurrent < fromAmount) {
    return null;
  }

  const toCurrent = getResourceAmount(player, turn, settings, to);
  const toAmount = fromAmount * exchangeEffect.rate;

  const afterSpend = setResourceAmount(
    player,
    turn,
    settings,
    from,
    fromCurrent - fromAmount
  );
  return setResourceAmount(
    afterSpend.player,
    afterSpend.turn,
    settings,
    to,
    toCurrent + toAmount
  );
}

import { DieState, DiceLockDecision, ResourceProduction, DiceFaceDefinition } from '../dice';
import { PlayerState, TurnState, GameSettings } from '../game';
import { DevelopmentDefinition } from '../construction';

type ResourceKey = keyof ResourceProduction;

const RESOURCE_KEYS: ResourceKey[] = ['goods', 'food', 'workers', 'coins', 'skulls'];

export type ProductionBreakdown = {
  base: ResourceProduction;
  bonus: ResourceProduction;
  total: ResourceProduction;
  bonusSources: Record<ResourceKey, string[]>;
};

/**
 * Get the number of dice a player rolls based on completed cities.
 */
export function getDiceCount(player: PlayerState): number {
  return player.cities.filter((city) => city.completed).length;
}

/**
 * Roll a single die - returns a random face index.
 */
export function rollSingleDie(diceFaces: DiceFaceDefinition[]): number {
  return Math.floor(Math.random() * diceFaces.length);
}

export function createDie(settings: GameSettings): DieState {
  const result = rollSingleDie(settings.diceFaces);
  const face = settings.diceFaces[result];
  const hasSkull = settings.diceFaces[result].production.some(p => p.skulls > 0);
  const needsChoice = face.production.length > 1;

  return {
    diceFaceIndex: result,
    productionIndex: needsChoice ? -1 : 0,
    lockDecision: hasSkull ? 'skull' as DiceLockDecision : 'unlocked' as DiceLockDecision,
  };
}

/**
 * Create initial dice state for a turn.
 */
export function createInitialDice(count: number, settings: GameSettings): DieState[] {
  return Array.from({ length: count }, () => {
    const faceIndex = rollSingleDie(settings.diceFaces);
    const face = settings.diceFaces[faceIndex];
    const hasSkull = face.production.some((production) => production.skulls > 0);
    return {
      diceFaceIndex: faceIndex,
      productionIndex: face.production.length > 1 ? -1 : 0,
      lockDecision: hasSkull ? ('skull' as DiceLockDecision) : ('unlocked' as DiceLockDecision),
    };
  });
}

/**
 * Roll all unlocked dice in the current turn state.
 * Returns new dice array with unlocked dice re-rolled.
 */
export function rollUnlockedDice(dice: DieState[], settings: GameSettings): DieState[] {
  return dice.map((die) => {
    if (die.lockDecision === 'unlocked') {
      return createDie(settings);
    }
    return die;
  });
}


/**
 * Count skulls in the current dice state.
 */
export function countSkulls(dice: DieState[], settings: GameSettings): number {
  return dice.reduce((acc, die) => {
    const face = settings.diceFaces[die.diceFaceIndex];
    const productionIndex = die.productionIndex >= 0 ? die.productionIndex : 0;
    return acc + (face.production[productionIndex]?.skulls ?? 0);
  }, 0);
}

/**
 * Check if all dice are locked
 */
export function areAllDiceLocked(dice: DieState[]): boolean {
  return dice.every(die => die.lockDecision !== 'unlocked');
}

/**
 * Keep a die (lock it so it won't be re-rolled).
 */
export function keepDie(dice: DieState[], dieIndex: number): DieState[] {
  return dice.map((die, idx) => {
    if (idx !== dieIndex) {
      return die;
    }

    if (die.lockDecision === 'skull') {
      return die;
    }

    if (die.lockDecision === 'unlocked') {
      return { ...die, lockDecision: 'kept' as DiceLockDecision };
    }

    return { ...die, lockDecision: 'unlocked' as DiceLockDecision };
  });
}

/**
 * Select which production option to use for a die with multiple choices.
 */
export function selectProduction(
  dice: DieState[],
  dieIndex: number,
  productionIndex: number,
  settings: GameSettings
): DieState[] {
  return dice.map((die, idx) => {
    if (idx === dieIndex) {
      const face = settings.diceFaces[die.diceFaceIndex];
      if (productionIndex >= 0 && productionIndex < face.production.length) {
        return { ...die, productionIndex };
      }
    }
    return die;
  });
}

/**
 * Check if a die face has multiple production options that require a choice.
 */
export function requiresChoice(dieState: DieState, settings: GameSettings): boolean {
  const face = settings.diceFaces[dieState.diceFaceIndex];
  return face.production.length > 1;
}

/**
 * Count how many dice still need production choices.
 * A die needs a choice if it has multiple productions and isn't a skull face.
 */
export function countPendingChoices(dice: DieState[], settings: GameSettings): number {
  return dice.filter((die) => {
    const face = settings.diceFaces[die.diceFaceIndex];
    if (face.production.length <= 1) return false;
    return die.productionIndex < 0 || die.productionIndex >= face.production.length;
  }).length;
}

/**
 * Check if the player can still roll dice.
 */
export function canRoll(
  turn: TurnState,
  settings: GameSettings,
  player?: PlayerState
): boolean {
  if (turn.rollsUsed >= getMaxRollsAllowed(player, settings)) return false;
  if (areAllDiceLocked(turn.dice)) return false;
  return turn.dice.some((die) => die.lockDecision === 'unlocked');
}

/**
 * Get max roll count for this turn, including Leadership bonus.
 */
export function getMaxRollsAllowed(
  player: PlayerState | undefined,
  settings: GameSettings
): number {
  return settings.maxDiceRolls + getDiceRerollBonus(player, settings);
}

/**
 * Check if player has Leadership development.
 */
export function hasLeadership(player: PlayerState): boolean {
  return player.developments.includes('leadership');
}

/**
 * Sum all extra re-rolls granted by owned diceReroll effects.
 */
function getDiceRerollBonus(
  player: PlayerState | undefined,
  settings: GameSettings
): number {
  if (!player) {
    return 0;
  }

  let bonus = 0;
  for (const development of settings.developmentDefinitions) {
    if (!player.developments.includes(development.id)) {
      continue;
    }
    if (development.specialEffect.type === 'diceReroll') {
      bonus += development.specialEffect.count;
    }
  }

  return bonus;
}

/**
 * Get the Leadership development definition.
 */
export function getLeadershipDef(settings: GameSettings): DevelopmentDefinition | undefined {
  return settings.developmentDefinitions.find((d) => d.id === 'leadership');
}

/**
 * Calculate total production from all dice.
 * Handles the special skull face where both goods AND skull apply.
 */
export function calculateDiceProduction(
  dice: DieState[],
  player: PlayerState,
  settings: GameSettings
): ResourceProduction {
  return calculateDiceProductionBreakdown(dice, player, settings).total;
}

/**
 * Calculate per-resource base and bonus totals from dice production.
 */
export function calculateDiceProductionBreakdown(
  dice: DieState[],
  player: PlayerState,
  settings: GameSettings
): ProductionBreakdown {
  const base: ResourceProduction = emptyProduction();
  const bonus: ResourceProduction = emptyProduction();
  const total: ResourceProduction = emptyProduction();
  const bonusSourceSets: Record<ResourceKey, Set<string>> = {
    goods: new Set<string>(),
    food: new Set<string>(),
    workers: new Set<string>(),
    coins: new Set<string>(),
    skulls: new Set<string>(),
  };

  for (const die of dice) {
    const face = settings.diceFaces[die.diceFaceIndex];
    const productionIndex = die.productionIndex >= 0 ? die.productionIndex : 0;
    const baseProduction = { ...face.production[productionIndex] };
    const { totalProduction, bonusProduction, bonusSources } = applyBonuses(
      baseProduction,
      player,
      settings,
    );

    for (const resource of RESOURCE_KEYS) {
      base[resource] += baseProduction[resource];
      bonus[resource] += bonusProduction[resource];
      total[resource] += totalProduction[resource];
      for (const source of bonusSources[resource]) {
        bonusSourceSets[resource].add(source);
      }
    }
  }

  return {
    base,
    bonus,
    total,
    bonusSources: {
      goods: Array.from(bonusSourceSets.goods),
      food: Array.from(bonusSourceSets.food),
      workers: Array.from(bonusSourceSets.workers),
      coins: Array.from(bonusSourceSets.coins),
      skulls: Array.from(bonusSourceSets.skulls),
    },
  };
}

/**
 * Apply production bonuses
 */
function applyBonuses(
  baseProduction: ResourceProduction,
  player: PlayerState,
  settings: GameSettings
): {
  totalProduction: ResourceProduction;
  bonusProduction: ResourceProduction;
  bonusSources: Record<ResourceKey, string[]>;
} {
  const completedBonuses = settings.developmentDefinitions
    .filter((d, _) =>
      d.specialEffect.type == 'resourceProductionBonus' &&
      player.developments.find(playerDev => d.id == playerDev) !== undefined
  );

  const finalProduction = { ...baseProduction };
  const bonusProduction = emptyProduction();
  const bonusSourceSets: Record<ResourceKey, Set<string>> = {
    goods: new Set<string>(),
    food: new Set<string>(),
    workers: new Set<string>(),
    coins: new Set<string>(),
    skulls: new Set<string>(),
  };
  completedBonuses.forEach((bonus) => {
    if (bonus.specialEffect.type === 'resourceProductionBonus') {
      if (baseProduction.coins > 0 && bonus.specialEffect.resourceBonus.coins > 0) {
        finalProduction.coins += bonus.specialEffect.resourceBonus.coins;
        bonusProduction.coins += bonus.specialEffect.resourceBonus.coins;
        bonusSourceSets.coins.add(bonus.name);
      }
      if (baseProduction.food > 0 && bonus.specialEffect.resourceBonus.food > 0) {
        finalProduction.food += bonus.specialEffect.resourceBonus.food;
        bonusProduction.food += bonus.specialEffect.resourceBonus.food;
        bonusSourceSets.food.add(bonus.name);
      }
      if (baseProduction.goods > 0 && bonus.specialEffect.resourceBonus.goods > 0) {
        finalProduction.goods += bonus.specialEffect.resourceBonus.goods;
        bonusProduction.goods += bonus.specialEffect.resourceBonus.goods;
        bonusSourceSets.goods.add(bonus.name);
      }
      if (baseProduction.skulls > 0 && bonus.specialEffect.resourceBonus.skulls > 0) {
        finalProduction.skulls += bonus.specialEffect.resourceBonus.skulls;
        bonusProduction.skulls += bonus.specialEffect.resourceBonus.skulls;
        bonusSourceSets.skulls.add(bonus.name);
      }
      if (baseProduction.workers > 0 && bonus.specialEffect.resourceBonus.workers > 0) {
        finalProduction.workers += bonus.specialEffect.resourceBonus.workers;
        bonusProduction.workers += bonus.specialEffect.resourceBonus.workers;
        bonusSourceSets.workers.add(bonus.name);
      }
    }
  });

  return {
    totalProduction: finalProduction,
    bonusProduction,
    bonusSources: {
      goods: Array.from(bonusSourceSets.goods),
      food: Array.from(bonusSourceSets.food),
      workers: Array.from(bonusSourceSets.workers),
      coins: Array.from(bonusSourceSets.coins),
      skulls: Array.from(bonusSourceSets.skulls),
    },
  };
}

/**
 * Create empty production object.
 */
export function emptyProduction(): ResourceProduction {
  return { goods: 0, food: 0, workers: 0, coins: 0, skulls: 0 };
}

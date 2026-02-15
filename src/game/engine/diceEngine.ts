import { DieState, DiceLockDecision, ResourceProduction, DiceFaceDefinition } from '../dice';
import { PlayerState, TurnState, GameSettings } from '../game';
import { DevelopmentDefinition } from '../construction';

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
    return {
      diceFaceIndex: faceIndex,
      productionIndex: face.production.length > 1 ? -1 : 0,
      lockDecision: 'unlocked' as DiceLockDecision,
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
    if (idx === dieIndex && die.lockDecision === 'unlocked') {
      return { ...die, lockDecision: 'kept' as DiceLockDecision };
    }
    return die;
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
export function canRoll(turn: TurnState, settings: GameSettings): boolean {
  if (turn.rollsUsed >= settings.maxDiceRolls) return false;
  if (areAllDiceLocked(turn.dice)) return false;
  return turn.dice.some((die) => die.lockDecision === 'unlocked');
}

/**
 * Check if player has Leadership development (allows extra re-roll).
 */
export function hasLeadership(player: PlayerState): boolean {
  return player.developments.includes('leadership');
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
  const total: ResourceProduction = {
    goods: 0,
    food: 0,
    workers: 0,
    coins: 0,
    skulls: 0,
  };

  for (const die of dice) {
    const face = settings.diceFaces[die.diceFaceIndex];
    const productionIndex = die.productionIndex >= 0 ? die.productionIndex : 0;

    const baseProduction = {...face.production[productionIndex]};
    const production = applyBonuses(baseProduction, player, settings);
    
    total.goods += production.goods;
    total.food += production.food;
    total.workers += production.workers;
    total.coins += production.coins;
    total.skulls += production.skulls;

    // TODO: goods production bonus special effect
  }

  return total;
}

/**
 * Apply production bonuses
 */
function applyBonuses(baseProduction: ResourceProduction, player: PlayerState, settings: GameSettings): ResourceProduction {
  const completedBonuses = settings.developmentDefinitions
    .filter((d, _) =>
      d.specialEffect.type == 'resourceProductionBonus' &&
      player.developments.find(playerDev => d.id == playerDev) !== undefined
  );
  
  const finalProduction = {...baseProduction}
  completedBonuses.forEach((bonus) => {
    if (bonus.specialEffect.type === 'resourceProductionBonus') {
      if (baseProduction.coins > 0 && bonus.specialEffect.resourceBonus.coins > 0) {
        finalProduction.coins += bonus.specialEffect.resourceBonus.coins
      }
      if (baseProduction.food > 0 && bonus.specialEffect.resourceBonus.food > 0) {
        finalProduction.food += bonus.specialEffect.resourceBonus.food
      }
      if (baseProduction.goods > 0 && bonus.specialEffect.resourceBonus.goods > 0) {
        finalProduction.goods += bonus.specialEffect.resourceBonus.goods
      }
      if (baseProduction.skulls > 0 && bonus.specialEffect.resourceBonus.skulls > 0) {
        finalProduction.skulls += bonus.specialEffect.resourceBonus.skulls
      }
      if (baseProduction.workers > 0 && bonus.specialEffect.resourceBonus.workers > 0) {
        finalProduction.workers += bonus.specialEffect.resourceBonus.workers
      }
    }
  })

  return finalProduction;
}

/**
 * Create empty production object.
 */
export function emptyProduction(): ResourceProduction {
  return { goods: 0, food: 0, workers: 0, coins: 0, skulls: 0 };
}

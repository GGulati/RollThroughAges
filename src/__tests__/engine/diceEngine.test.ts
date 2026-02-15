import { describe, it, expect, vi } from 'vitest';
import {
  getDiceCount,
  rollSingleDie,
  createInitialDice,
  rollUnlockedDice,
  countSkulls,
  areAllDiceLocked,
  keepDie,
  selectProduction,
  requiresChoice,
  countPendingChoices,
  canRoll,
  calculateDiceProduction,
  emptyProduction,
} from '../../game/engine/diceEngine';
import {
  createTestSettings,
  createTestPlayer,
  createTestTurn,
  createTestDice,
  DICE_FACE,
} from '../testUtils';

describe('diceEngine', () => {
  const settings = createTestSettings(2);

  describe('getDiceCount', () => {
    it('returns number of completed cities', () => {
      const player = createTestPlayer('p1', settings);
      // Default has 3 starting cities completed
      expect(getDiceCount(player)).toBe(3);
    });

    it('increases when more cities are built', () => {
      const player = createTestPlayer('p1', settings);
      // Complete the 4th city
      player.cities[3] = { workersCommitted: 0, completed: true };
      expect(getDiceCount(player)).toBe(4);
    });
  });

  describe('rollSingleDie', () => {
    it('returns a valid face index', () => {
      for (let i = 0; i < 100; i++) {
        const result = rollSingleDie(settings.diceFaces);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(settings.diceFaces.length);
      }
    });
  });

  describe('createInitialDice', () => {
    it('creates the correct number of dice', () => {
      const dice = createInitialDice(5, settings);
      expect(dice).toHaveLength(5);
    });

    it('all dice are unlocked initially', () => {
      const dice = createInitialDice(3, settings);
      dice.forEach((die) => {
        expect(die.lockDecision).toBe('unlocked');
      });
    });

    it('all dice have valid face indices', () => {
      const dice = createInitialDice(10, settings);
      dice.forEach((die) => {
        expect(die.diceFaceIndex).toBeGreaterThanOrEqual(0);
        expect(die.diceFaceIndex).toBeLessThan(settings.diceFaces.length);
      });
    });

    it('marks choice dice as unresolved', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.4); // FOOD_OR_WORKERS
      const dice = createInitialDice(1, settings);
      expect(dice[0].productionIndex).toBe(-1);
      vi.restoreAllMocks();
    });
  });

  describe('rollUnlockedDice', () => {
    it('only re-rolls unlocked dice', () => {
      const dice = createTestDice([0, 1, 2], ['kept', 'unlocked', 'skull']);
      const rolled = rollUnlockedDice(dice, settings);

      expect(rolled[0].lockDecision).toBe('kept');
      expect(rolled[0].diceFaceIndex).toBe(0); // Unchanged
      expect(rolled[2].lockDecision).toBe('skull');
      expect(rolled[2].diceFaceIndex).toBe(2); // Unchanged
    });

    it('marks skull face as skull lock', () => {
      // Mock to always return skull face
      vi.spyOn(Math, 'random').mockReturnValue(0.2);

      const dice = createTestDice([0], ['unlocked']);
      const rolled = rollUnlockedDice(dice, settings);

      expect(rolled[0].diceFaceIndex).toBe(DICE_FACE.TWO_GOODS_SKULL);
      expect(rolled[0].lockDecision).toBe('skull');

      vi.restoreAllMocks();
    });
  });

  describe('countSkulls', () => {
    it('counts skulls from dice production', () => {
      const dice = createTestDice([DICE_FACE.TWO_GOODS_SKULL, DICE_FACE.TWO_GOODS_SKULL, DICE_FACE.ONE_GOOD]);
      expect(countSkulls(dice, settings)).toBe(2);
    });

    it('returns 0 when no skulls', () => {
      const dice = createTestDice([DICE_FACE.ONE_GOOD, DICE_FACE.THREE_FOOD, DICE_FACE.THREE_WORKERS]);
      expect(countSkulls(dice, settings)).toBe(0);
    });
  });

  describe('areAllDiceLocked', () => {
    it('returns true when all dice are locked (not unlocked)', () => {
      const dice = createTestDice([0, 1, 2], ['kept', 'skull', 'kept']);
      expect(areAllDiceLocked(dice)).toBe(true);
    });

    it('returns false when any die is unlocked', () => {
      const dice = createTestDice([0, 1, 2], ['kept', 'unlocked', 'skull']);
      expect(areAllDiceLocked(dice)).toBe(false);
    });
  });

  describe('keepDie', () => {
    it('locks an unlocked die', () => {
      const dice = createTestDice([0, 1, 2], ['unlocked', 'unlocked', 'unlocked']);
      const result = keepDie(dice, 1);

      expect(result[0].lockDecision).toBe('unlocked');
      expect(result[1].lockDecision).toBe('kept');
      expect(result[2].lockDecision).toBe('unlocked');
    });

    it('does not change skull or kept dice', () => {
      const dice = createTestDice([0, 1], ['skull', 'kept']);
      const result1 = keepDie(dice, 0);
      const result2 = keepDie(dice, 1);

      expect(result1[0].lockDecision).toBe('skull');
      expect(result2[1].lockDecision).toBe('kept');
    });
  });


  describe('selectProduction', () => {
    it('selects production index for a die', () => {
      const dice = createTestDice([DICE_FACE.FOOD_OR_WORKERS]);
      const result = selectProduction(dice, 0, 1, settings);

      expect(result[0].productionIndex).toBe(1);
    });

    it('ignores invalid production index', () => {
      const dice = createTestDice([DICE_FACE.ONE_GOOD]); // Only 1 production option
      const result = selectProduction(dice, 0, 5, settings);

      expect(result[0].productionIndex).toBe(0); // Unchanged
    });
  });

  describe('requiresChoice', () => {
    it('returns true for multi-production faces', () => {
      const die = { diceFaceIndex: DICE_FACE.FOOD_OR_WORKERS, productionIndex: 0, lockDecision: 'unlocked' as const };
      expect(requiresChoice(die, settings)).toBe(true);
    });

    it('returns false for single-production faces', () => {
      const die = { diceFaceIndex: DICE_FACE.THREE_WORKERS, productionIndex: 0, lockDecision: 'unlocked' as const };
      expect(requiresChoice(die, settings)).toBe(false);
    });
  });

  describe('countPendingChoices', () => {
    it('counts dice needing production choice', () => {
      const dice = [
        { diceFaceIndex: DICE_FACE.FOOD_OR_WORKERS, productionIndex: -1, lockDecision: 'kept' as const },
        { diceFaceIndex: DICE_FACE.FOOD_OR_WORKERS, productionIndex: -1, lockDecision: 'kept' as const },
        { diceFaceIndex: DICE_FACE.THREE_WORKERS, productionIndex: 0, lockDecision: 'kept' as const },
      ];
      expect(countPendingChoices(dice, settings)).toBe(2);
    });

    it('does not count skull face as needing choice', () => {
      const dice = createTestDice([DICE_FACE.TWO_GOODS_SKULL]);
      expect(countPendingChoices(dice, settings)).toBe(0);
    });

    it('does not count resolved choice dice', () => {
      const dice = [
        { diceFaceIndex: DICE_FACE.FOOD_OR_WORKERS, productionIndex: 1, lockDecision: 'kept' as const },
      ];
      expect(countPendingChoices(dice, settings)).toBe(0);
    });
  });

  describe('canRoll', () => {
    it('returns true when rolls available and dice unlocked', () => {
      const turn = createTestTurn('p1', {
        rollsUsed: 1,
        dice: createTestDice([0, 1, 2]),
      });
      expect(canRoll(turn, settings)).toBe(true);
    });

    it('returns false when max rolls used', () => {
      const turn = createTestTurn('p1', {
        rollsUsed: 3,
        dice: createTestDice([0, 1, 2]),
      });
      expect(canRoll(turn, settings)).toBe(false);
    });

    it('returns false when all dice locked with skulls', () => {
      const turn = createTestTurn('p1', {
        rollsUsed: 1,
        dice: createTestDice([1, 1, 1], ['skull', 'skull', 'skull']),
      });
      expect(canRoll(turn, settings)).toBe(false);
    });

    it('returns false when no unlocked dice', () => {
      const turn = createTestTurn('p1', {
        rollsUsed: 1,
        dice: createTestDice([0, 1], ['kept', 'skull']),
      });
      expect(canRoll(turn, settings)).toBe(false);
    });
  });

  describe('calculateDiceProduction', () => {
    it('calculates basic production from dice', () => {
      const player = createTestPlayer('p1', settings);
      const dice = createTestDice([DICE_FACE.THREE_FOOD, DICE_FACE.THREE_WORKERS]);

      const production = calculateDiceProduction(dice, player, settings);

      expect(production.food).toBe(3);
      expect(production.workers).toBe(3);
    });

    it('handles skull face correctly (goods + skull)', () => {
      const player = createTestPlayer('p1', settings);
      const dice = createTestDice([DICE_FACE.TWO_GOODS_SKULL]);

      const production = calculateDiceProduction(dice, player, settings);

      expect(production.goods).toBe(2);
      expect(production.skulls).toBe(1);
    });

    it('respects production choice', () => {
      const player = createTestPlayer('p1', settings);
      const dice = [
        { diceFaceIndex: DICE_FACE.FOOD_OR_WORKERS, productionIndex: 0, lockDecision: 'unlocked' as const }, // Food
        { diceFaceIndex: DICE_FACE.FOOD_OR_WORKERS, productionIndex: 1, lockDecision: 'unlocked' as const }, // Workers
      ];

      const production = calculateDiceProduction(dice, player, settings);

      expect(production.food).toBe(2);
      expect(production.workers).toBe(2);
    });

    it('applies Agriculture bonus', () => {
      const player = createTestPlayer('p1', settings, { developments: ['agriculture'] });
      const dice = createTestDice([DICE_FACE.THREE_FOOD, DICE_FACE.THREE_FOOD]);

      const production = calculateDiceProduction(dice, player, settings);

      // 3 + 3 base + 2 bonus (1 per food die)
      expect(production.food).toBe(8);
    });

    it('applies Masonry bonus', () => {
      const player = createTestPlayer('p1', settings, { developments: ['masonry'] });
      const dice = createTestDice([DICE_FACE.THREE_WORKERS]);

      const production = calculateDiceProduction(dice, player, settings);

      // 3 base + 1 bonus
      expect(production.workers).toBe(4);
    });

    it('applies Coinage bonus', () => {
      const player = createTestPlayer('p1', settings, { developments: ['coinage'] });
      const dice = createTestDice([DICE_FACE.SEVEN_COINS]);

      const production = calculateDiceProduction(dice, player, settings);

      // 12 with coinage instead of 7
      expect(production.coins).toBe(12);
    });
  });

  describe('emptyProduction', () => {
    it('returns all zeros', () => {
      const prod = emptyProduction();
      expect(prod.goods).toBe(0);
      expect(prod.food).toBe(0);
      expect(prod.workers).toBe(0);
      expect(prod.coins).toBe(0);
      expect(prod.skulls).toBe(0);
    });
  });
});

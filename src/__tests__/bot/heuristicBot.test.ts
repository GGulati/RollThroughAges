import { describe, expect, it } from 'vitest';
import { GamePhase } from '@/game';
import {
  HEURISTIC_STANDARD_CONFIG,
  HeuristicConfig,
  chooseHeuristicBotAction,
} from '@/game/bot';
import { createTestGame, createTestDice, DICE_FACE } from '../testUtils';

describe('heuristic bot', () => {
  it('avoids risky rerolls when skull pressure is already high', () => {
    const game = createTestGame(2, GamePhase.RollDice);
    game.state.turn.rollsUsed = 1;
    game.state.turn.dice = createTestDice([
      DICE_FACE.TWO_GOODS_SKULL,
      DICE_FACE.TWO_GOODS_SKULL,
      DICE_FACE.THREE_WORKERS,
    ], [
      'skull',
      'skull',
      'unlocked',
    ]);

    const action = chooseHeuristicBotAction(game, HEURISTIC_STANDARD_CONFIG);
    expect(action?.type).toBe('keepDie');
  });

  it('rerolls when projected food shortage is high', () => {
    const game = createTestGame(2, GamePhase.RollDice);
    game.state.players[0].food = 0;
    game.state.turn.rollsUsed = 1;
    game.state.turn.dice = createTestDice([
      DICE_FACE.ONE_GOOD,
      DICE_FACE.THREE_WORKERS,
      DICE_FACE.SEVEN_COINS,
    ]);

    const action = chooseHeuristicBotAction(game, HEURISTIC_STANDARD_CONFIG);
    expect(action).toEqual({ type: 'rollDice' });
  });

  it('chooses production option in decide phase', () => {
    const game = createTestGame(2, GamePhase.DecideDice);
    game.state.turn.dice = [
      { diceFaceIndex: DICE_FACE.FOOD_OR_WORKERS, productionIndex: -1, lockDecision: 'kept' },
      { diceFaceIndex: DICE_FACE.ONE_GOOD, productionIndex: 0, lockDecision: 'kept' },
      { diceFaceIndex: DICE_FACE.ONE_GOOD, productionIndex: 0, lockDecision: 'kept' },
    ];

    const action = chooseHeuristicBotAction(game, HEURISTIC_STANDARD_CONFIG);
    expect(action?.type).toBe('selectProduction');
    expect(action && 'dieIndex' in action ? action.dieIndex : -1).toBe(0);
  });

  it('falls back to skipDevelopment when no purchase or exchange action exists', () => {
    const game = createTestGame(2, GamePhase.Development);
    game.state.turn.turnProduction.coins = 0;

    const action = chooseHeuristicBotAction(game, HEURISTIC_STANDARD_CONFIG);
    expect(action).toEqual({ type: 'skipDevelopment' });
  });

  it('respects custom production weights', () => {
    const game = createTestGame(2, GamePhase.DecideDice);
    game.state.turn.dice = [
      {
        diceFaceIndex: DICE_FACE.FOOD_OR_WORKERS,
        productionIndex: -1,
        lockDecision: 'kept',
      },
    ];

    const config: HeuristicConfig = {
      ...HEURISTIC_STANDARD_CONFIG,
      productionWeights: {
        ...HEURISTIC_STANDARD_CONFIG.productionWeights,
        workers: 10,
        food: 0,
      },
    };

    const action = chooseHeuristicBotAction(game, config);
    expect(action).toEqual({
      type: 'selectProduction',
      dieIndex: 0,
      productionIndex: 1,
    });
  });

  it('scores build options and prefers high-value monument completion', () => {
    const game = createTestGame(2, GamePhase.Build);
    game.state.turn.turnProduction.workers = 1;
    game.state.players[0].monuments.stepPyramid.workersCommitted = 2;

    const action = chooseHeuristicBotAction(game, HEURISTIC_STANDARD_CONFIG);
    expect(action?.type).toBe('buildMonument');
    expect(action && 'monumentId' in action ? action.monumentId : '').toBe(
      'stepPyramid',
    );
  });

  it('respects custom build weights', () => {
    const game = createTestGame(2, GamePhase.Build);
    game.state.turn.turnProduction.workers = 1;
    game.state.players[0].monuments.stepPyramid.workersCommitted = 2;

    const config: HeuristicConfig = {
      ...HEURISTIC_STANDARD_CONFIG,
      buildWeights: {
        ...HEURISTIC_STANDARD_CONFIG.buildWeights,
        monumentPoints: 0,
        monumentPointEfficiency: 0,
        monumentProgress: 0,
        monumentWorkersUsed: 0,
        monumentSpecialEffect: 0,
        cityProgress: 100,
      },
    };

    const action = chooseHeuristicBotAction(game, config);
    expect(action?.type).toBe('buildCity');
  });

  it('respects custom starvation food policy', () => {
    const game = createTestGame(2, GamePhase.RollDice);
    game.state.players[0].food = 0;
    game.state.turn.rollsUsed = 1;
    game.state.turn.dice = createTestDice(
      [DICE_FACE.TWO_GOODS_SKULL, DICE_FACE.TWO_GOODS_SKULL, DICE_FACE.THREE_WORKERS],
      ['skull', 'skull', 'unlocked'],
    );

    const config: HeuristicConfig = {
      ...HEURISTIC_STANDARD_CONFIG,
      foodPolicyWeights: {
        ...HEURISTIC_STANDARD_CONFIG.foodPolicyWeights,
        forceRerollOnFoodShortage: false,
      },
    };

    const action = chooseHeuristicBotAction(game, config);
    expect(action?.type).toBe('keepDie');
  });
});

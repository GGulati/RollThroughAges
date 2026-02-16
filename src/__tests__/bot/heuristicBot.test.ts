import { describe, expect, it } from 'vitest';
import { GamePhase } from '@/game';
import { chooseHeuristicBotAction } from '@/game/bot';
import { createTestGame, createTestDice, DICE_FACE } from '../testUtils';

describe('heuristic bot', () => {
  it('prefers rollDice in roll phase when available', () => {
    const game = createTestGame(2, GamePhase.RollDice);
    game.state.turn.rollsUsed = 1;
    game.state.turn.dice = createTestDice([
      DICE_FACE.ONE_GOOD,
      DICE_FACE.THREE_FOOD,
      DICE_FACE.THREE_WORKERS,
    ]);

    const action = chooseHeuristicBotAction(game);
    expect(action).toEqual({ type: 'rollDice' });
  });

  it('chooses production option in decide phase', () => {
    const game = createTestGame(2, GamePhase.DecideDice);
    game.state.turn.dice = [
      { diceFaceIndex: DICE_FACE.FOOD_OR_WORKERS, productionIndex: -1, lockDecision: 'kept' },
      { diceFaceIndex: DICE_FACE.ONE_GOOD, productionIndex: 0, lockDecision: 'kept' },
      { diceFaceIndex: DICE_FACE.ONE_GOOD, productionIndex: 0, lockDecision: 'kept' },
    ];

    const action = chooseHeuristicBotAction(game);
    expect(action?.type).toBe('selectProduction');
    expect(action && 'dieIndex' in action ? action.dieIndex : -1).toBe(0);
  });

  it('falls back to skipDevelopment when no purchase or exchange action exists', () => {
    const game = createTestGame(2, GamePhase.Development);
    game.state.turn.turnProduction.coins = 0;

    const action = chooseHeuristicBotAction(game);
    expect(action).toEqual({ type: 'skipDevelopment' });
  });
});

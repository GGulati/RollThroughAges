import { describe, expect, it } from 'vitest';
import { GamePhase } from '@/game';
import { getLegalBotActions } from '@/game/bot';
import { createTestGame, createTestDice, DICE_FACE } from '../testUtils';

describe('bot candidates', () => {
  it('includes roll action during roll phase when rolling is legal', () => {
    const game = createTestGame(2, GamePhase.RollDice);
    game.state.turn.rollsUsed = 1;
    game.state.turn.dice = createTestDice([
      DICE_FACE.ONE_GOOD,
      DICE_FACE.THREE_FOOD,
      DICE_FACE.THREE_WORKERS,
    ]);

    const actions = getLegalBotActions(game);
    expect(actions.some((action) => action.type === 'rollDice')).toBe(true);
  });

  it('includes endTurn action during endTurn phase', () => {
    const game = createTestGame(2, GamePhase.EndTurn);
    const actions = getLegalBotActions(game);
    expect(actions).toEqual([{ type: 'endTurn' }]);
  });

  it('includes skipDevelopment during development', () => {
    const game = createTestGame(2, GamePhase.Development);
    const actions = getLegalBotActions(game);
    expect(actions.some((action) => action.type === 'skipDevelopment')).toBe(true);
  });

  it('includes single-die reroll actions when leadership is owned', () => {
    const game = createTestGame(2, GamePhase.RollDice);
    game.state.players[0].developments = ['leadership'];
    game.state.turn.singleDieRerollsUsed = 0;
    game.state.turn.dice = createTestDice([
      DICE_FACE.ONE_GOOD,
      DICE_FACE.THREE_FOOD,
      DICE_FACE.THREE_WORKERS,
    ]);

    const actions = getLegalBotActions(game);
    const rerolls = actions.filter((action) => action.type === 'rerollSingleDie');
    expect(rerolls.length).toBe(3);
  });
});

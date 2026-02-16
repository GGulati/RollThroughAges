import { describe, expect, it } from 'vitest';
import { GamePhase } from '@/game';
import { BotAction, getLegalBotActions } from '@/game/bot';
import {
  createTestGame,
  createTestDice,
  DICE_FACE,
  setPlayerGoods,
} from '../testUtils';

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

  it('enumerates multiple legal exchange amounts', () => {
    const game = createTestGame(2, GamePhase.Development);
    game.state.players[0].developments = ['granaries'];
    game.state.players[0].food = 3;

    const actions = getLegalBotActions(game);
    const exchanges = actions.filter(
      (action): action is Extract<BotAction, { type: 'applyExchange' }> =>
        action.type === 'applyExchange',
    );

    const amounts = exchanges.map((action) => action.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([1, 2, 3]);
  });

  it('enumerates multiple legal development goods combinations', () => {
    const game = createTestGame(2, GamePhase.Development);
    game.state.turn.turnProduction.coins = 0;
    game.state.players[0] = setPlayerGoods(
      game.state.players[0],
      game.settings.goodsTypes[0].name,
      game.settings.goodsTypes[0].values.length,
      game.settings,
    );
    game.state.players[0] = setPlayerGoods(
      game.state.players[0],
      game.settings.goodsTypes[1].name,
      game.settings.goodsTypes[1].values.length,
      game.settings,
    );
    game.state.players[0] = setPlayerGoods(
      game.state.players[0],
      game.settings.goodsTypes[2].name,
      game.settings.goodsTypes[2].values.length,
      game.settings,
    );

    const actions = getLegalBotActions(game);
    const buyActions = actions.filter(
      (action): action is Extract<BotAction, { type: 'buyDevelopment' }> =>
        action.type === 'buyDevelopment' && action.developmentId === 'leadership',
    );

    const distinctCombos = new Set(
      buyActions.map((action) => action.goodsTypeNames.slice().sort().join(',')),
    );
    expect(distinctCombos.size).toBeGreaterThan(1);
  });

  it('enumerates multiple legal discard choices when overflow exists', () => {
    const game = createTestGame(2, GamePhase.DiscardGoods);
    const firstGoods = game.settings.goodsTypes[0];
    game.state.players[0] = setPlayerGoods(
      game.state.players[0],
      firstGoods.name,
      firstGoods.values.length + 1,
      game.settings,
    );

    const actions = getLegalBotActions(game);
    const discardActions = actions.filter((action) => action.type === 'discardGoods');
    expect(discardActions.length).toBeGreaterThan(1);
  });
});

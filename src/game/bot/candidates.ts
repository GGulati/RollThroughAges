import { GamePhase, GameState } from '../game';
import { ResourceProduction } from '../dice';
import {
  calculateGoodsOverflow,
  canRoll,
  countPendingChoices,
  getAvailableDevelopments,
  getAvailableExchangeEffects,
  getBuildOptions,
  getExchangeResourceAmount,
  getSingleDieRerollsAllowed,
  getTotalPurchasingPower,
  hasNoGoodsLimit,
  validateDevelopmentPurchase,
} from '../engine';
import { BotAction } from './types';

function getActivePlayer(game: GameState) {
  return game.state.players[game.state.activePlayerIndex];
}

function getGoodsSpendCombosForDevelopment(
  game: GameState,
): string[][] {
  const player = getActivePlayer(game);
  const goodsTypes = game.settings.goodsTypes.filter((goodsType) => {
    const quantity = player.goods.get(goodsType) ?? 0;
    return quantity > 0;
  });
  const combos: string[][] = [];
  const total = 1 << goodsTypes.length;
  for (let mask = 1; mask < total; mask += 1) {
    const combo: string[] = [];
    for (let index = 0; index < goodsTypes.length; index += 1) {
      if ((mask & (1 << index)) !== 0) {
        combo.push(goodsTypes[index].name);
      }
    }
    combos.push(combo);
  }

  combos.sort((a, b) => a.length - b.length || a.join(',').localeCompare(b.join(',')));
  return combos;
}

function getDevelopmentCandidates(game: GameState): BotAction[] {
  const player = getActivePlayer(game);
  const turn = game.state.turn;
  const actions: BotAction[] = [];

  if (!turn.developmentPurchased) {
    const available = getAvailableDevelopments(player, game.settings);
    for (const development of available) {
      const coinsToSpend = Math.min(turn.turnProduction.coins, development.cost);
      const remainingCost = development.cost - coinsToSpend;
      if (remainingCost <= 0) {
        actions.push({
          type: 'buyDevelopment',
          developmentId: development.id,
          goodsTypeNames: [],
        });
        continue;
      }

      if (getTotalPurchasingPower(player, turn) < development.cost) {
        continue;
      }

      for (const combo of getGoodsSpendCombosForDevelopment(game)) {
        const goodsTypes = combo
          .map((name) => game.settings.goodsTypes.find((goodsType) => goodsType.name === name))
          .filter((goodsType): goodsType is NonNullable<typeof goodsType> => Boolean(goodsType));
        const validation = validateDevelopmentPurchase(
          player,
          turn,
          development.id,
          goodsTypes,
          game.settings,
        );
        if (validation.valid) {
          actions.push({
            type: 'buyDevelopment',
            developmentId: development.id,
            goodsTypeNames: combo,
          });
          break;
        }
      }
    }
  }

  return actions;
}

function getDiscardCandidate(game: GameState): BotAction | null {
  const player = getActivePlayer(game);
  const overflow = calculateGoodsOverflow(player.goods, player, game.settings);
  if (overflow <= 0) {
    return null;
  }

  const unlimited = hasNoGoodsLimit(player, game.settings);
  const goodsToKeepByType: Record<string, number> = {};
  for (const goodsType of game.settings.goodsTypes) {
    const quantity = player.goods.get(goodsType) ?? 0;
    goodsToKeepByType[goodsType.name] = unlimited
      ? quantity
      : Math.min(quantity, goodsType.values.length);
  }

  return { type: 'discardGoods', goodsToKeepByType };
}

function requiresProductionChoice(productionIndex: number, optionCount: number): boolean {
  return productionIndex < 0 || productionIndex >= optionCount;
}

export function getLegalBotActions(game: GameState): BotAction[] {
  const player = getActivePlayer(game);
  const phase = game.state.phase;
  const actions: BotAction[] = [];

  if (phase === GamePhase.RollDice) {
    if (canRoll(game.state.turn, game.settings, player)) {
      actions.push({ type: 'rollDice' });
    }

    const singleDieRerollsRemaining = Math.max(
      0,
      getSingleDieRerollsAllowed(player, game.settings) -
        game.state.turn.singleDieRerollsUsed,
    );
    if (singleDieRerollsRemaining > 0) {
      for (let dieIndex = 0; dieIndex < game.state.turn.dice.length; dieIndex += 1) {
        const die = game.state.turn.dice[dieIndex];
        if (die.lockDecision !== 'skull') {
          actions.push({ type: 'rerollSingleDie', dieIndex });
        }
      }
    }

    for (let dieIndex = 0; dieIndex < game.state.turn.dice.length; dieIndex += 1) {
      const die = game.state.turn.dice[dieIndex];
      const optionCount = game.settings.diceFaces[die.diceFaceIndex].production.length;
      if (die.lockDecision === 'unlocked') {
        actions.push({ type: 'keepDie', dieIndex });
      }
      if (optionCount > 1 && requiresProductionChoice(die.productionIndex, optionCount)) {
        for (let productionIndex = 0; productionIndex < optionCount; productionIndex += 1) {
          actions.push({ type: 'selectProduction', dieIndex, productionIndex });
        }
      }
    }

    return actions;
  }

  if (phase === GamePhase.DecideDice) {
    for (let dieIndex = 0; dieIndex < game.state.turn.dice.length; dieIndex += 1) {
      const die = game.state.turn.dice[dieIndex];
      const optionCount = game.settings.diceFaces[die.diceFaceIndex].production.length;
      if (optionCount <= 1 || !requiresProductionChoice(die.productionIndex, optionCount)) {
        continue;
      }

      for (let productionIndex = 0; productionIndex < optionCount; productionIndex += 1) {
        actions.push({ type: 'selectProduction', dieIndex, productionIndex });
      }
    }
    if (countPendingChoices(game.state.turn.dice, game.settings) === 0) {
      actions.push({ type: 'resolveProduction' });
    }
    return actions;
  }

  if (phase === GamePhase.ResolveProduction) {
    if (countPendingChoices(game.state.turn.dice, game.settings) === 0) {
      actions.push({ type: 'resolveProduction' });
    }
    return actions;
  }

  if (phase === GamePhase.Build) {
    const buildOptions = getBuildOptions(
      player,
      game.state.players,
      game.state.turn.turnProduction.workers,
      game.settings,
    );
    actions.push(...buildOptions.cities.map((cityIndex) => ({ type: 'buildCity' as const, cityIndex })));
    actions.push(
      ...buildOptions.monuments.map((monumentId) => ({
        type: 'buildMonument' as const,
        monumentId,
      })),
    );
    return actions;
  }

  if (phase === GamePhase.Development) {
    actions.push(...getDevelopmentCandidates(game));

    for (const exchange of getAvailableExchangeEffects(player, game.settings)) {
      const sourceAmount = getExchangeResourceAmount(
        player,
        game.state.turn,
        game.settings,
        exchange.from,
      );
      if (sourceAmount > 0) {
        actions.push({
          type: 'applyExchange',
          from: exchange.from,
          to: exchange.to,
          amount: 1,
        });
      }
    }
    actions.push({ type: 'skipDevelopment' });
    return actions;
  }

  if (phase === GamePhase.DiscardGoods) {
    const discard = getDiscardCandidate(game);
    if (discard) {
      actions.push(discard);
    }
    return actions;
  }

  if (phase === GamePhase.EndTurn) {
    actions.push({ type: 'endTurn' });
  }

  return actions;
}

export function scoreProductionChoice(
  production: ResourceProduction,
): number {
  return (
    production.workers * 2 +
    production.coins +
    production.food * 2 +
    production.goods * 6 -
    production.skulls * 8
  );
}

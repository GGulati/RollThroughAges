import { createSelector } from '@reduxjs/toolkit';
import { GamePhase } from '@/game';
import {
  getBuildOptions,
  getAvailableDevelopments,
  getTotalPurchasingPower,
  getCityWorkerCost,
  getRemainingCityWorkers,
  getRemainingMonumentWorkers,
  calculateDiceProduction,
  canRoll,
  countPendingChoices,
  countSkulls,
  findGoodsTypeByName,
  getCitiesToFeed,
  getDisasterPreview,
  getMaxRollsAllowed,
  getRewrittenDisasterTargeting,
  getGoodsLimit,
  getTotalGoodsQuantity,
  hasDisasterImmunity,
  getScoreBreakdown,
  isGameOver,
  resolveProduction,
} from '@/game/engine';
import { RootState } from './store';

const selectGameSlice = (state: RootState) => state.game;

function formatProductionEntry(entry: {
  goods: number;
  food: number;
  workers: number;
  coins: number;
  skulls: number;
}): string {
  const parts: string[] = [];
  if (entry.goods > 0) parts.push(`${entry.goods} Goods`);
  if (entry.food > 0) parts.push(`${entry.food} Food`);
  if (entry.workers > 0) parts.push(`${entry.workers} Workers`);
  if (entry.coins > 0) parts.push(`${entry.coins} Coins`);
  if (entry.skulls > 0) parts.push(`${entry.skulls} Skull`);
  return parts.join(' + ');
}

export const selectGame = createSelector(selectGameSlice, (slice) => slice.game);

export const selectLastError = createSelector(
  selectGameSlice,
  (slice) => slice.lastError,
);

export const selectCanUndo = createSelector(
  selectGame,
  (game) => (game ? game.history.length > 0 : false),
);

export const selectCanRedo = createSelector(
  selectGame,
  (game) => (game ? game.future.length > 0 : false),
);

export const selectActionLog = createSelector(
  selectGameSlice,
  (slice) => slice.actionLog,
);

export const selectTurnStatus = createSelector(
  selectGame,
  selectLastError,
  (game, lastError) => {
    if (!game) {
      return {
        isGameActive: false,
        round: 0,
        phase: null,
        activePlayerId: null,
        activePlayerName: null,
        rollsUsed: 0,
        activePlayerPoints: 0,
        playerPoints: [] as Array<{
          playerId: string;
          playerName: string;
          points: number;
          breakdown: {
            monuments: number;
            developments: number;
            bonuses: number;
            penalties: number;
            total: number;
          };
        }>,
        errorMessage: lastError?.message ?? null,
      };
    }

    const activePlayer = game.state.players[game.state.activePlayerIndex];
    const playerConfig = game.settings.players.find(
      (player) => player.id === activePlayer.id,
    );

    const playerPoints = game.state.players.map((player) => {
      const config = game.settings.players.find((entry) => entry.id === player.id);
      const breakdown = getScoreBreakdown(player, game.state.players, game.settings);
      const points = breakdown.total;
      return {
        playerId: player.id,
        playerName: config?.name ?? player.id,
        points,
        breakdown,
      };
    });
    const activePlayerPoints =
      playerPoints.find((entry) => entry.playerId === activePlayer.id)?.points ?? 0;

    return {
      isGameActive: true,
      round: game.state.round,
      phase: game.state.phase,
      activePlayerId: activePlayer.id,
      activePlayerName: playerConfig?.name ?? activePlayer.id,
      rollsUsed: game.state.turn.rollsUsed,
      activePlayerPoints,
      playerPoints,
      errorMessage: lastError?.message ?? null,
    };
  },
);

export const selectDicePanelModel = createSelector(selectGame, (game) => {
  if (!game) {
    return {
      canRoll: false,
      reason: 'Start a game before rolling dice.',
      dice: [],
      diceCards: [],
      rollsUsed: 0,
      maxRollsAllowed: 0,
      rerollsRemaining: 0,
      canKeepDie: false,
      canSelectProduction: false,
    };
  }

  const activePlayer = game.state.players[game.state.activePlayerIndex];
  const canRollNow =
    game.state.phase === GamePhase.RollDice &&
    canRoll(game.state.turn, game.settings, activePlayer);
  const canKeepDie = game.state.phase === GamePhase.RollDice;
  const canSelectProduction =
    game.state.phase === GamePhase.RollDice ||
    game.state.phase === GamePhase.DecideDice;
  const rerollsRemaining = Math.max(
    0,
    getMaxRollsAllowed(activePlayer, game.settings) - game.state.turn.rollsUsed,
  );
  const diceCards = game.state.turn.dice.map((die, index) => {
    const face = game.settings.diceFaces[die.diceFaceIndex];
    const optionCount = face.production.length;
    const selectedOption =
      die.productionIndex >= 0 && die.productionIndex < optionCount
        ? die.productionIndex
        : 0;

    return {
      index,
      label: face.label,
      lockDecision: die.lockDecision,
      optionCount,
      selectedOption,
      optionSummaries: face.production.map((entry) =>
        formatProductionEntry(entry),
      ),
      hasChoice: optionCount > 1,
      canKeep: canKeepDie && die.lockDecision !== 'skull',
      canChooseOption: canSelectProduction && optionCount > 1,
    };
  });

  return {
    canRoll: canRollNow,
    reason: canRollNow ? null : 'No roll is available right now.',
    dice: game.state.turn.dice,
    diceCards,
    rollsUsed: game.state.turn.rollsUsed,
    maxRollsAllowed: getMaxRollsAllowed(activePlayer, game.settings),
    rerollsRemaining,
    canKeepDie,
    canSelectProduction,
  };
});

export const selectDiceOutcomeModel = createSelector(selectGame, (game) => {
  if (!game) {
    return {
      status: 'projected' as const,
      summary: null as string | null,
      food: { produced: 0, need: 0, shortage: 0, before: 0, after: 0 },
      workersProduced: 0,
      coinsProduced: 0,
      goodsProduced: 0,
      skulls: 0,
      disaster: null as string | null,
      penalties: { foodPenalty: 0, disasterPenalty: 0 },
      points: { before: 0, after: 0 },
    };
  }

  const phase = game.state.phase;
  const isProjectedPhase =
    phase === GamePhase.RollDice ||
    phase === GamePhase.DecideDice ||
    phase === GamePhase.ResolveProduction;
  const activeIndex = game.state.activePlayerIndex;
  const activePlayer = game.state.players[activeIndex];
  const produced = calculateDiceProduction(
    game.state.turn.dice,
    activePlayer,
    game.settings,
  );
  const foodNeed = getCitiesToFeed(activePlayer);
  const foodBefore = activePlayer.food;
  const foodAfterFeeding = foodBefore + produced.food - foodNeed;
  const foodShortage = Math.max(0, -foodAfterFeeding);
  const foodAfter = Math.max(0, Math.min(game.settings.maxFood, foodAfterFeeding));
  const skulls = countSkulls(game.state.turn.dice, game.settings);
  const disaster = getDisasterPreview(skulls, game.settings);
  const pointsBefore = getScoreBreakdown(
    activePlayer,
    game.state.players,
    game.settings,
  ).total;

  if (isProjectedPhase) {
    const projectedResult = resolveProduction(
      game.state,
      game.state.players,
      game.settings,
    );
    const projectedActive = projectedResult.players[activeIndex];
    const pointsAfter = getScoreBreakdown(
      projectedActive,
      projectedResult.players,
      game.settings,
    ).total;
    const penaltyDelta = Math.max(0, pointsBefore - pointsAfter);

    return {
      status: 'projected' as const,
      summary: 'Projected',
      food: {
        produced: produced.food,
        need: foodNeed,
        shortage: foodShortage,
        before: foodBefore,
        after: foodAfter,
      },
      workersProduced: produced.workers,
      coinsProduced: produced.coins,
      goodsProduced: produced.goods,
      skulls,
      disaster,
      penalties: {
        foodPenalty: foodShortage,
        disasterPenalty: Math.max(0, penaltyDelta - foodShortage),
      },
      points: { before: pointsBefore, after: pointsAfter },
    };
  }

  return {
    status: 'applied' as const,
    summary: 'Applied',
    food: {
      produced: game.state.turn.turnProduction.food,
      need: foodNeed,
      shortage: 0,
      before: activePlayer.food,
      after: activePlayer.food,
    },
    workersProduced: game.state.turn.turnProduction.workers,
    coinsProduced: game.state.turn.turnProduction.coins,
    goodsProduced: 0,
    skulls: game.state.turn.turnProduction.skulls,
    disaster,
    penalties: { foodPenalty: 0, disasterPenalty: 0 },
    points: { before: pointsBefore, after: pointsBefore },
  };
});

export const selectProductionPanelModel = createSelector(selectGame, (game) => {
  if (!game) {
    return {
      canResolveProduction: false,
      reason: 'Start a game to resolve production.',
      pendingProductionChoices: 0,
      pendingProduction: null,
    };
  }

  const pendingProductionChoices = countPendingChoices(
    game.state.turn.dice,
    game.settings,
  );
  const canResolveProduction =
    (game.state.phase === GamePhase.DecideDice ||
      game.state.phase === GamePhase.ResolveProduction) &&
    pendingProductionChoices === 0;
  const reason =
    game.state.phase === GamePhase.Build
      ? 'Production has already been resolved for this turn.'
      : canResolveProduction
        ? null
        : 'Choose all pending dice options before resolving production.';

  return {
    canResolveProduction,
    reason,
    pendingProductionChoices,
    pendingProduction: game.state.turn.turnProduction,
  };
});

export const selectBuildPanelModel = createSelector(selectGame, (game) => {
  if (!game) {
    return {
      isActionAllowed: false,
      reason: 'Start a game to build cities or monuments.',
      workersAvailable: 0,
      storedFood: 0,
      goodsStoredSummary: [] as Array<{ goodsType: string; quantity: number }>,
      canBuild: false,
      cityTargets: [] as Array<{
        cityIndex: number;
        label: string;
        workerCost: number;
        workersCommitted: number;
      }>,
      monumentTargets: [] as Array<{
        monumentId: string;
        label: string;
        workerCost: number;
        workersCommitted: number;
      }>,
      cityCatalog: [] as Array<{
        cityIndex: number;
        label: string;
        workerCost: number;
        workersCommitted: number;
        completed: boolean;
        canBuild: boolean;
      }>,
      monumentCatalog: [] as Array<{
        monumentId: string;
        label: string;
        workerCost: number;
        workersCommitted: number;
        completed: boolean;
        pointsText: string;
        canBuild: boolean;
      }>,
    };
  }

  const workersAvailable = game.state.turn.turnProduction.workers;
  const activePlayer = game.state.players[game.state.activePlayerIndex];
  const storedFood = activePlayer.food;
  const goodsStoredSummary = game.settings.goodsTypes.map((goodsType) => ({
    goodsType: goodsType.name,
    quantity: activePlayer.goods.get(goodsType) ?? 0,
  }));
  const buildOptions =
    game.state.phase === GamePhase.Build
      ? getBuildOptions(
          activePlayer,
          game.state.players,
          workersAvailable,
          game.settings,
        )
      : { cities: [], monuments: [] };

  const cityTargets = buildOptions.cities.map((cityIndex) => ({
    cityIndex,
    label: `City ${cityIndex + 1}`,
    workerCost: getCityWorkerCost(cityIndex, game.settings),
    workersCommitted:
      getCityWorkerCost(cityIndex, game.settings) -
      getRemainingCityWorkers(activePlayer, cityIndex, game.settings),
  }));
  const monumentTargets = buildOptions.monuments.map((monumentId) => {
    const monumentDefinition = game.settings.monumentDefinitions.find(
      (m) => m.id === monumentId,
    );
    return {
      monumentId,
      label: monumentDefinition?.requirements.name ?? monumentId,
      workerCost: monumentDefinition?.requirements.workerCost ?? 0,
      workersCommitted:
        (monumentDefinition?.requirements.workerCost ?? 0) -
        getRemainingMonumentWorkers(
        activePlayer,
        monumentId,
        game.settings,
      ),
    };
  });
  const canBuild =
    game.state.phase === GamePhase.Build &&
    workersAvailable > 0 &&
    (cityTargets.length > 0 || monumentTargets.length > 0);
  const reason =
    game.state.phase !== GamePhase.Build
      ? 'Build actions are only available during the build phase.'
      : workersAvailable <= 0
        ? 'No workers are available for building.'
        : null;
  const cityCatalog = activePlayer.cities.map((city, cityIndex) => {
    const workerCost = getCityWorkerCost(cityIndex, game.settings);
    const workersCommitted = city.completed
      ? workerCost
      : Math.max(0, workerCost - getRemainingCityWorkers(activePlayer, cityIndex, game.settings));
    return {
      cityIndex,
      label: `City ${cityIndex + 1}`,
      workerCost,
      workersCommitted,
      completed: city.completed,
      canBuild: canBuild && cityTargets.some((target) => target.cityIndex === cityIndex),
    };
  });
  const monumentCatalog = game.settings.monumentDefinitions.map((monument) => {
    const progress = activePlayer.monuments[monument.id];
    const workersCommitted = progress?.completed
      ? monument.requirements.workerCost
      : monument.requirements.workerCost -
        getRemainingMonumentWorkers(activePlayer, monument.id, game.settings);
    return {
      monumentId: monument.id,
      label: monument.requirements.name,
      workerCost: monument.requirements.workerCost,
      workersCommitted,
      completed: Boolean(progress?.completed),
      pointsText: `${monument.firstPoints}/${monument.laterPoints} VP`,
      canBuild:
        canBuild && monumentTargets.some((target) => target.monumentId === monument.id),
    };
  });

  return {
    isActionAllowed: Boolean(game),
    reason,
    workersAvailable,
    storedFood,
    goodsStoredSummary,
    canBuild,
    cityTargets,
    monumentTargets,
    cityCatalog,
    monumentCatalog,
  };
});

export const selectDevelopmentPanelModel = createSelector(selectGame, (game) => {
  if (!game) {
    return {
      isActionAllowed: false,
      reason: 'Start a game to purchase developments.',
      canPurchase: false,
      coinsAvailable: 0,
      totalPurchasingPower: 0,
      goodsSpendOptions: [] as Array<{
        goodsType: string;
        quantity: number;
        spendValue: number;
      }>,
      availableDevelopments: [] as Array<{
        id: string;
        name: string;
        cost: number;
        points: number;
        effectDescription: string;
        purchased: boolean;
        canAfford: boolean;
      }>,
      developmentCatalog: [] as Array<{
        id: string;
        name: string;
        cost: number;
        points: number;
        effectDescription: string;
        purchased: boolean;
        canAfford: boolean;
      }>,
      ownedDevelopments: [] as string[],
    };
  }

  const activePlayer = game.state.players[game.state.activePlayerIndex];
  const isActionAllowed =
    game.state.phase === GamePhase.Build || game.state.phase === GamePhase.Development;
  const availableDevelopments = getAvailableDevelopments(activePlayer, game.settings).map(
    (development) => ({
      id: development.id,
      name: development.name,
      cost: development.cost,
      points: development.points,
      effectDescription: development.effectDescription,
      canAfford: getTotalPurchasingPower(activePlayer, game.state.turn) >= development.cost,
    }),
  );
  const developmentCatalog = game.settings.developmentDefinitions.map((development) => ({
    id: development.id,
    name: development.name,
    cost: development.cost,
    points: development.points,
    effectDescription: development.effectDescription,
    purchased: activePlayer.developments.includes(development.id),
    canAfford:
      !activePlayer.developments.includes(development.id) &&
      getTotalPurchasingPower(activePlayer, game.state.turn) >= development.cost,
  }));
  const goodsSpendOptions = game.settings.goodsTypes.map((goodsType) => {
    const playerGoodsType = findGoodsTypeByName(activePlayer.goods, goodsType.name);
    const quantity = playerGoodsType ? (activePlayer.goods.get(playerGoodsType) ?? 0) : 0;
    const spendValue =
      quantity > 0
        ? goodsType.values[Math.min(quantity - 1, goodsType.values.length - 1)]
        : 0;
    return {
      goodsType: goodsType.name,
      quantity,
      spendValue,
    };
  });
  const canPurchase = isActionAllowed && availableDevelopments.length > 0;
  const reason = !isActionAllowed
    ? 'Development purchases are only available during build/development.'
    : availableDevelopments.length === 0
      ? 'All developments purchased.'
      : null;

  return {
    isActionAllowed,
    reason,
    canPurchase,
    coinsAvailable: game.state.turn.turnProduction.coins,
    totalPurchasingPower: getTotalPurchasingPower(activePlayer, game.state.turn),
    goodsSpendOptions,
    availableDevelopments,
    developmentCatalog,
    ownedDevelopments: activePlayer.developments,
  };
});

export const selectDiscardPanelModel = createSelector(selectGame, (game) => {
  if (!game) {
    return {
      isActionAllowed: false,
      reason: 'Start a game to discard goods.',
      overflow: 0,
      goodsLimit: 0,
      totalGoods: 0,
      goodsOptions: [] as Array<{ goodsType: string; quantity: number }>,
      canEndTurn: false,
      endTurnReason: 'Start a game to end turn.',
    };
  }

  const activePlayer = game.state.players[game.state.activePlayerIndex];
  const goodsLimit = getGoodsLimit(activePlayer, game.settings);
  const totalGoods = getTotalGoodsQuantity(activePlayer.goods);
  const overflow =
    goodsLimit === Infinity ? 0 : Math.max(0, totalGoods - goodsLimit);
  const goodsOptions = game.settings.goodsTypes.map((goodsType) => ({
    goodsType: goodsType.name,
    quantity: activePlayer.goods.get(goodsType) ?? 0,
  }));
  const isDiscardPhase = game.state.phase === GamePhase.DiscardGoods;
  const isActionAllowed = isDiscardPhase && overflow > 0;
  const reason = !isDiscardPhase
    ? 'Discard actions are only available during the discard phase.'
    : overflow > 0
      ? null
      : 'No discard is required right now.';
  const canEndTurn = !isDiscardPhase || overflow <= 0;
  const endTurnReason = canEndTurn
    ? null
    : 'Discard goods before ending the turn.';

  return {
    isActionAllowed,
    reason,
    overflow,
    goodsLimit,
    totalGoods,
    goodsOptions,
    canEndTurn,
    endTurnReason,
  };
});

export const selectDisasterPanelModel = createSelector(selectGame, (game) => {
  if (!game) {
    return {
      disasters: [] as Array<{
        id: string;
        name: string;
        skulls: number;
        effectText: string;
        targetsText: string;
      }>,
    };
  }

  const activePlayer = game.state.players[game.state.activePlayerIndex];
  const toTargetsText = (scope: 'self' | 'opponents' | 'all') => {
    if (scope === 'self') return 'You';
    if (scope === 'opponents') return 'Opponents';
    return 'All players';
  };

  return {
    disasters: game.settings.disasterDefinitions.map((disaster) => {
      const rewrittenScope = getRewrittenDisasterTargeting(
        activePlayer,
        disaster.id,
        game.settings,
      );
      const effectiveScope = rewrittenScope ?? disaster.affectedPlayers;
      const appliesToActivePlayer =
        effectiveScope === 'self' || effectiveScope === 'all';
      const immuneToDisaster = hasDisasterImmunity(
        activePlayer,
        disaster.id,
        game.settings,
      );
      const immunityDevelopment = game.settings.developmentDefinitions.find(
        (development) =>
          activePlayer.developments.includes(development.id) &&
          development.specialEffect.type === 'disasterImmunity' &&
          development.specialEffect.disasterId === disaster.id,
      );
      const rewriteDevelopment = game.settings.developmentDefinitions.find(
        (development) =>
          activePlayer.developments.includes(development.id) &&
          development.specialEffect.type === 'rewriteDisasterTargeting' &&
          development.specialEffect.disasterId === disaster.id,
      );
      const effectText =
        appliesToActivePlayer && immuneToDisaster
          ? `No effect on you (immune via ${
              immunityDevelopment?.name ?? 'development'
            }). Base effect: ${disaster.effect}`
          : disaster.effect;
      const targetsText = rewriteDevelopment
        ? `${toTargetsText(effectiveScope)} (via ${rewriteDevelopment.name})`
        : toTargetsText(effectiveScope);

      return {
        id: disaster.id,
        name: disaster.name,
        skulls: disaster.skulls,
        effectText,
        targetsText,
      };
    }),
  };
});

export const selectEndgameStatus = createSelector(selectGame, (game) => ({
  isGameActive: Boolean(game),
  isGameOver: game ? isGameOver(game) : false,
}));

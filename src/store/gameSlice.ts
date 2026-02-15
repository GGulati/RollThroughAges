import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { enableMapSet } from 'immer';
import { ConstructionProgress } from '@/game/construction';
import { GamePhase, PlayerConfig } from '@/game/game';
import {
  allocateWorkersToCity,
  allocateWorkersToMonument,
  canAffordDevelopment,
  getBuildOptions,
  areAllDiceLocked,
  countPendingChoices,
  createGame,
  endTurn as endTurnEngine,
  findGoodsTypeByName,
  getAvailableDevelopments,
  keepDie as keepDieEngine,
  performRoll,
  purchaseDevelopment,
  redo as redoEngine,
  resolveProduction as resolveProductionEngine,
  spendWorkers,
  selectProduction as selectProductionEngine,
  undo as undoEngine,
} from '@/game/engine';
import { GameState, GameStateSnapshot } from '@/game';
import { GameActionErrorCode, GameSliceState } from './gameState';

const MAX_HISTORY_ENTRIES = 20;
enableMapSet();

const initialState: GameSliceState = {
  game: null,
  lastError: null,
};

function setError(state: GameSliceState, code: GameActionErrorCode, message: string): void {
  state.lastError = { code, message };
}

function cloneSnapshot(snapshot: GameStateSnapshot): GameStateSnapshot {
  return {
    players: snapshot.players.map((player) => ({
      ...player,
      goods: new Map(player.goods),
      cities: player.cities.map(
        (city): ConstructionProgress => ({
          workersCommitted: city.workersCommitted,
          completed: city.completed,
        }),
      ),
      developments: [...player.developments],
      monuments: Object.fromEntries(
        Object.entries(player.monuments).map(([id, progress]) => [
          id,
          {
            workersCommitted: progress.workersCommitted,
            completed: progress.completed,
          },
        ]),
      ),
    })),
    activePlayerIndex: snapshot.activePlayerIndex,
    round: snapshot.round,
    phase: snapshot.phase,
    turn: {
      ...snapshot.turn,
      dice: snapshot.turn.dice.map((die) => ({ ...die })),
      turnProduction: { ...snapshot.turn.turnProduction },
    },
  };
}

function pushHistory(game: GameState): Pick<GameState, 'history' | 'future'> {
  const history = [...game.history, { snapshot: cloneSnapshot(game.state) }];
  const overflow = Math.max(0, history.length - MAX_HISTORY_ENTRIES);
  return {
    history: overflow > 0 ? history.slice(overflow) : history,
    future: [],
  };
}

function applyMutationWithHistory(
  game: GameState,
  mutator: (current: GameState) => GameState,
): GameState | null {
  const mutated = mutator(game);
  if (mutated === game) {
    return null;
  }

  const historyState = pushHistory(game);
  return {
    ...mutated,
    history: historyState.history,
    future: historyState.future,
  };
}

function applyMutationWithoutHistory(
  game: GameState,
  mutator: (current: GameState) => GameState,
): GameState | null {
  const mutated = mutator(game);
  if (mutated === game) {
    return null;
  }

  return {
    ...mutated,
    history: game.history,
    future: [],
  };
}

function getNextDevelopmentPhase(
  game: GameState,
  activePlayer = game.state.players[game.state.activePlayerIndex],
  turn = game.state.turn,
): GamePhase {
  const canAffordAnyDevelopment = getAvailableDevelopments(
    activePlayer,
    game.settings,
  ).some((development) =>
    canAffordDevelopment(activePlayer, turn, development.id, game.settings),
  );
  return canAffordAnyDevelopment ? GamePhase.Development : GamePhase.DiscardGoods;
}

function resolveProductionMutation(game: GameState): GameState {
  const resolved = resolveProductionEngine(
    game.state,
    game.state.players,
    game.settings,
  );
  const nextPhase =
    resolved.turnProduction.workers > 0
      ? GamePhase.Build
      : getNextDevelopmentPhase(
          game,
          resolved.players[game.state.activePlayerIndex],
          {
            ...game.state.turn,
            pendingChoices: 0,
            turnProduction: resolved.turnProduction,
          },
        );

  return {
    ...game,
    state: {
      ...game.state,
      players: resolved.players,
      phase: nextPhase,
      turn: {
        ...game.state.turn,
        pendingChoices: 0,
        turnProduction: resolved.turnProduction,
      },
    },
  };
}

function autoResolveProductionIfReady(game: GameState): GameState {
  if (
    game.state.phase !== GamePhase.DecideDice &&
    game.state.phase !== GamePhase.ResolveProduction
  ) {
    return game;
  }

  const pendingChoices = countPendingChoices(
    game.state.turn.dice,
    game.settings,
  );
  if (pendingChoices > 0) {
    return {
      ...game,
      state: {
        ...game.state,
        turn: {
          ...game.state.turn,
          pendingChoices,
        },
      },
    };
  }

  return resolveProductionMutation(game);
}

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    startGame: (state, action: PayloadAction<{ players: PlayerConfig[] }>) => {
      state.game = createGame(action.payload.players);
      state.lastError = null;
    },
    rollDice: (state) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before rolling dice.');
        return;
      }

      // Random outcomes are intentionally non-undoable.
      const nextGame = applyMutationWithoutHistory(state.game, performRoll);
      if (!nextGame) {
        setError(state, 'ROLL_NOT_ALLOWED', 'No roll is available right now.');
        return;
      }

      state.game = autoResolveProductionIfReady(nextGame);
      state.lastError = null;
    },
    endTurn: (state) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before ending a turn.');
        return;
      }

      state.game = applyMutationWithHistory(state.game, endTurnEngine);
      state.lastError = null;
    },
    keepDie: (state, action: PayloadAction<{ dieIndex: number }>) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before keeping dice.');
        return;
      }

      if (state.game.state.phase !== GamePhase.RollDice) {
        setError(
          state,
          'INVALID_PHASE',
          'You can only keep dice during the roll phase.',
        );
        return;
      }

      const { dieIndex } = action.payload;
      const die = state.game.state.turn.dice[dieIndex];
      if (!die) {
        setError(state, 'INVALID_DIE_INDEX', 'That die does not exist.');
        return;
      }
      if (die.lockDecision === 'skull') {
        setError(state, 'INVALID_DIE_INDEX', 'Skull dice are always locked.');
        return;
      }

      const nextGame = applyMutationWithHistory(state.game, (game) => {
        const nextDice = keepDieEngine(game.state.turn.dice, dieIndex);
        const shouldAdvance = areAllDiceLocked(nextDice);

        const nextState = {
          ...game,
          state: {
            ...game.state,
            phase: shouldAdvance ? GamePhase.DecideDice : game.state.phase,
            turn: {
              ...game.state.turn,
              dice: nextDice,
            },
          },
        };

        return autoResolveProductionIfReady(nextState);
      });

      if (!nextGame) {
        setError(
          state,
          'INVALID_DIE_INDEX',
          'Only non-skull dice can be toggled.',
        );
        return;
      }

      state.game = nextGame;
      state.lastError = null;
    },
    selectProduction: (
      state,
      action: PayloadAction<{ dieIndex: number; productionIndex: number }>,
    ) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before choosing production.');
        return;
      }

      if (
        state.game.state.phase !== GamePhase.DecideDice &&
        state.game.state.phase !== GamePhase.RollDice
      ) {
        setError(
          state,
          'INVALID_PHASE',
          'Production choices are only available during dice decision.',
        );
        return;
      }

      const { dieIndex, productionIndex } = action.payload;
      const die = state.game.state.turn.dice[dieIndex];
      if (!die) {
        setError(state, 'INVALID_DIE_INDEX', 'That die does not exist.');
        return;
      }

      const dieFace = state.game.settings.diceFaces[die.diceFaceIndex];
      if (
        productionIndex < 0 ||
        productionIndex >= dieFace.production.length
      ) {
        setError(
          state,
          'INVALID_PRODUCTION_CHOICE',
          'That production choice is not valid for this die.',
        );
        return;
      }

      const nextGame = applyMutationWithHistory(state.game, (game) => {
        const nextDice = selectProductionEngine(
          game.state.turn.dice,
          dieIndex,
          productionIndex,
          game.settings,
        );
        const pendingChoices = countPendingChoices(nextDice, game.settings);
        const nextPhase =
          pendingChoices === 0 && game.state.phase === GamePhase.DecideDice
            ? GamePhase.ResolveProduction
            : game.state.phase;

        const nextState = {
          ...game,
          state: {
            ...game.state,
            phase: nextPhase,
            turn: {
              ...game.state.turn,
              dice: nextDice,
              pendingChoices,
            },
          },
        };

        return autoResolveProductionIfReady(nextState);
      });

      if (!nextGame) {
        setError(
          state,
          'INVALID_PRODUCTION_CHOICE',
          'Unable to apply that production choice.',
        );
        return;
      }

      state.game = nextGame;
      state.lastError = null;
    },
    resolveProduction: (state) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before resolving production.');
        return;
      }

      if (
        state.game.state.phase !== GamePhase.DecideDice &&
        state.game.state.phase !== GamePhase.ResolveProduction
      ) {
        setError(
          state,
          'INVALID_PHASE',
          'Resolve production is only available after dice decisions.',
        );
        return;
      }

      const pendingChoices = countPendingChoices(
        state.game.state.turn.dice,
        state.game.settings,
      );
      if (pendingChoices > 0) {
        setError(
          state,
          'PRODUCTION_NOT_READY',
          'Choose all pending dice production options first.',
        );
        return;
      }

      const nextGame = applyMutationWithHistory(
        state.game,
        resolveProductionMutation,
      );

      if (!nextGame) {
        setError(
          state,
          'PRODUCTION_NOT_READY',
          'Unable to resolve production at this time.',
        );
        return;
      }

      state.game = nextGame;
      state.lastError = null;
    },
    buildCity: (state, action: PayloadAction<{ cityIndex: number }>) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before building cities.');
        return;
      }
      if (state.game.state.phase !== GamePhase.Build) {
        setError(
          state,
          'INVALID_PHASE',
          'Cities can only be built during the build phase.',
        );
        return;
      }
      if (state.game.state.turn.turnProduction.workers <= 0) {
        setError(
          state,
          'NO_WORKERS_AVAILABLE',
          'No workers are available for building.',
        );
        return;
      }

      const nextGame = applyMutationWithHistory(state.game, (game) => {
        const activeIndex = game.state.activePlayerIndex;
        const activePlayer = game.state.players[activeIndex];
        const options = getBuildOptions(
          activePlayer,
          game.state.players,
          game.state.turn.turnProduction.workers,
          game.settings,
        );

        if (!options.cities.includes(action.payload.cityIndex)) {
          return game;
        }

        const { player, workersUsed } = allocateWorkersToCity(
          activePlayer,
          action.payload.cityIndex,
          game.state.turn.turnProduction.workers,
          game.settings,
        );
        if (workersUsed <= 0) {
          return game;
        }

        const players = [...game.state.players];
        players[activeIndex] = player;
        const turn = spendWorkers(game.state.turn, workersUsed);
        const phase =
          turn.turnProduction.workers > 0
            ? game.state.phase
            : getNextDevelopmentPhase(game, player, turn);

        return {
          ...game,
          state: {
            ...game.state,
            phase,
            players,
            turn,
          },
        };
      });

      if (!nextGame) {
        setError(
          state,
          'INVALID_BUILD_TARGET',
          'That city is not currently buildable.',
        );
        return;
      }

      state.game = nextGame;
      state.lastError = null;
    },
    buildMonument: (state, action: PayloadAction<{ monumentId: string }>) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before building monuments.');
        return;
      }
      if (state.game.state.phase !== GamePhase.Build) {
        setError(
          state,
          'INVALID_PHASE',
          'Monuments can only be built during the build phase.',
        );
        return;
      }
      if (state.game.state.turn.turnProduction.workers <= 0) {
        setError(
          state,
          'NO_WORKERS_AVAILABLE',
          'No workers are available for building.',
        );
        return;
      }

      const nextGame = applyMutationWithHistory(state.game, (game) => {
        const activeIndex = game.state.activePlayerIndex;
        const activePlayer = game.state.players[activeIndex];
        const options = getBuildOptions(
          activePlayer,
          game.state.players,
          game.state.turn.turnProduction.workers,
          game.settings,
        );

        if (!options.monuments.includes(action.payload.monumentId)) {
          return game;
        }

        const { player, workersUsed } = allocateWorkersToMonument(
          activePlayer,
          action.payload.monumentId,
          game.state.turn.turnProduction.workers,
          game.state.players,
          game.settings,
        );
        if (workersUsed <= 0) {
          return game;
        }

        const players = [...game.state.players];
        players[activeIndex] = player;
        const turn = spendWorkers(game.state.turn, workersUsed);
        const phase =
          turn.turnProduction.workers > 0
            ? game.state.phase
            : getNextDevelopmentPhase(game, player, turn);

        return {
          ...game,
          state: {
            ...game.state,
            phase,
            players,
            turn,
          },
        };
      });

      if (!nextGame) {
        setError(
          state,
          'INVALID_BUILD_TARGET',
          'That monument is not currently buildable.',
        );
        return;
      }

      state.game = nextGame;
      state.lastError = null;
    },
    buyDevelopment: (
      state,
      action: PayloadAction<{ developmentId: string; goodsTypeNames: string[] }>,
    ) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before buying developments.');
        return;
      }
      if (
        state.game.state.phase !== GamePhase.Build &&
        state.game.state.phase !== GamePhase.Development
      ) {
        setError(
          state,
          'INVALID_PHASE',
          'Developments can only be purchased during build/development.',
        );
        return;
      }

      let failureCode: GameActionErrorCode = 'DEVELOPMENT_NOT_AFFORDABLE';
      let failureMessage =
        'That development purchase is not valid with current coins/goods.';

      const nextGame = applyMutationWithHistory(state.game, (game) => {
        const activeIndex = game.state.activePlayerIndex;
        const activePlayer = game.state.players[activeIndex];
        const availableDevelopmentIds = new Set(
          getAvailableDevelopments(activePlayer, game.settings).map((dev) => dev.id),
        );
        if (!availableDevelopmentIds.has(action.payload.developmentId)) {
          failureCode = 'INVALID_DEVELOPMENT';
          failureMessage = 'That development is not available to purchase.';
          return game;
        }

        const goodsTypesToSpend = action.payload.goodsTypeNames
          .map((name) => findGoodsTypeByName(activePlayer.goods, name))
          .filter((goodsType): goodsType is NonNullable<typeof goodsType> =>
            Boolean(goodsType),
          );
        if (goodsTypesToSpend.length !== action.payload.goodsTypeNames.length) {
          failureCode = 'INVALID_DEVELOPMENT';
          failureMessage = 'One or more selected goods types are invalid.';
          return game;
        }

        const result = purchaseDevelopment(
          activePlayer,
          game.state.turn,
          action.payload.developmentId,
          goodsTypesToSpend,
          game.settings,
        );
        if ('error' in result) {
          failureCode = 'DEVELOPMENT_NOT_AFFORDABLE';
          failureMessage = result.error;
          return game;
        }

        const players = [...game.state.players];
        players[activeIndex] = result.player;
        return {
          ...game,
          state: {
            ...game.state,
            phase: getNextDevelopmentPhase(game, result.player, result.turn),
            players,
            turn: result.turn,
          },
        };
      });

      if (!nextGame) {
        setError(state, failureCode, failureMessage);
        return;
      }

      state.game = nextGame;
      state.lastError = null;
    },
    undo: (state) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before undoing moves.');
        return;
      }

      const nextGame = undoEngine(state.game);
      if (!nextGame) {
        setError(state, 'UNDO_NOT_AVAILABLE', 'There are no moves to undo.');
        return;
      }

      state.game = nextGame;
      state.lastError = null;
    },
    redo: (state) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before redoing moves.');
        return;
      }

      const nextGame = redoEngine(state.game);
      if (!nextGame) {
        setError(state, 'REDO_NOT_AVAILABLE', 'There are no moves to redo.');
        return;
      }

      state.game = nextGame;
      state.lastError = null;
    },
  },
});

export const {
  startGame,
  rollDice,
  endTurn,
  keepDie,
  selectProduction,
  resolveProduction,
  buildCity,
  buildMonument,
  buyDevelopment,
  undo,
  redo,
} = gameSlice.actions;
export const gameReducer = gameSlice.reducer;

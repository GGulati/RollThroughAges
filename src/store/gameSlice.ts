import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { enableMapSet } from 'immer';
import { ConstructionProgress } from '@/game/construction';
import { PlayerConfig } from '@/game/game';
import {
  createGame,
  endTurn as endTurnEngine,
  performRoll,
  redo as redoEngine,
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

      const nextGame = applyMutationWithHistory(state.game, performRoll);
      if (!nextGame) {
        setError(state, 'ROLL_NOT_ALLOWED', 'No roll is available right now.');
        return;
      }

      state.game = nextGame;
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

export const { startGame, rollDice, endTurn, undo, redo } = gameSlice.actions;
export const gameReducer = gameSlice.reducer;

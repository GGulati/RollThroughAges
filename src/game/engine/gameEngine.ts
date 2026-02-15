import {
  GameState,
  GameStateSnapshot,
  GamePhase,
  GameSettings,
  PlayerState,
  TurnState,
  PlayerConfig,
  HistoryEntry,
  GAME_PHASE_ORDER,
} from '../game';
import {
  CreatePlayerState,
  CreateGameSettings,
} from '../gameDefinitionConsts';
import {
  createInitialDice,
  rollUnlockedDice,
  getDiceCount,
  canRoll,
  countPendingChoices,
  emptyProduction,
  areAllDiceLocked,
  getMaxRollsAllowed,
} from './diceEngine';
import { hasGoodsOverflow, validateKeepGoods, applyKeepGoods } from './goodsEngine';
import { GoodsTrack } from '../goods';
import { updateAllScores } from './scoreEngine';
import { getDevelopmentCount } from './developmentEngine';
import { getCompletedMonumentCount } from './buildEngine';
import { ConstructionProgress } from '../construction';

function cloneSnapshot(snapshot: GameStateSnapshot): GameStateSnapshot {
  return {
    players: snapshot.players.map((player) => ({
      ...player,
      goods: new Map(player.goods),
      cities: player.cities.map(
        (city): ConstructionProgress => ({
          workersCommitted: city.workersCommitted,
          completed: city.completed,
        })
      ),
      developments: [...player.developments],
      monuments: Object.fromEntries(
        Object.entries(player.monuments).map(([id, progress]) => [
          id,
          {
            workersCommitted: progress.workersCommitted,
            completed: progress.completed,
          },
        ])
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

/**
 * Create initial game state for a new game.
 */
export function createGame(playerConfigs: PlayerConfig[]): GameState {
  const settings = CreateGameSettings(playerConfigs);
  const players = playerConfigs.map((config) => CreatePlayerState(config.id, settings));

  const initialSnapshot: GameStateSnapshot = {
    players,
    activePlayerIndex: 0,
    round: 1,
    phase: GamePhase.RollDice,
    turn: createInitialTurn(players[0].id, players[0], settings),
  };

  return {
    settings,
    state: initialSnapshot,
    history: [],
    future: [],
  };
}

/**
 * Create initial turn state for a player.
 */
export function createInitialTurn(
  playerId: string,
  player: PlayerState,
  settings: GameSettings
): TurnState {
  const diceCount = getDiceCount(player);
  return {
    activePlayerId: playerId,
    // First roll is automatic at turn start.
    rollsUsed: 1,
    dice: createInitialDice(diceCount, settings),
    pendingChoices: 0,
    turnProduction: emptyProduction(),
  };
}

/**
 * Save current state to history before making changes.
 */
export function saveToHistory(game: GameState): GameState {
  const historyEntry: HistoryEntry = {
    snapshot: cloneSnapshot(game.state),
  };

  return {
    ...game,
    history: [...game.history, historyEntry],
    future: [],
  };
}

/**
 * Undo the last action.
 */
export function undo(game: GameState): GameState | null {
  if (game.history.length === 0) return null;

  const previousHistory = [...game.history];
  const lastEntry = previousHistory.pop()!;

  return {
    ...game,
    state: cloneSnapshot(lastEntry.snapshot),
    history: previousHistory,
    future: [{ snapshot: cloneSnapshot(game.state) }, ...game.future],
  };
}

/**
 * Redo a previously undone action.
 */
export function redo(game: GameState): GameState | null {
  if (game.future.length === 0) return null;

  const [nextEntry, ...remainingFuture] = game.future;

  return {
    ...game,
    state: cloneSnapshot(nextEntry.snapshot),
    history: [...game.history, { snapshot: cloneSnapshot(game.state) }],
    future: remainingFuture,
  };
}

/**
 * Get the next phase in the turn sequence.
 */
export function getNextPhase(currentPhase: GamePhase): GamePhase {
  const currentIndex = GAME_PHASE_ORDER.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex === GAME_PHASE_ORDER.length - 1) {
    return GamePhase.RollDice;
  }

  return GAME_PHASE_ORDER[currentIndex + 1];
}

/**
 * Advance to the next phase.
 */
export function advancePhase(game: GameState): GameState {
  const { state, settings } = game;
  const nextPhase = getNextPhase(state.phase);

  const newState = {
    ...state,
    phase: nextPhase,
  };

  switch (nextPhase) {
    case GamePhase.DiscardGoods: {
      const activePlayer = newState.players[newState.activePlayerIndex];
      if (!hasGoodsOverflow(activePlayer.goods, activePlayer, settings)) {
        newState.phase = GamePhase.EndTurn;
      }
      break;
    }

    case GamePhase.EndTurn:
      break;
  }

  return { ...game, state: newState };
}

/**
 * Check if dice rolling phase is complete.
 */
export function isDicePhaseComplete(turn: TurnState, settings: GameSettings): boolean {
  return !canRoll(turn, settings);
}

/**
 * Check if dice decisions are complete.
 */
export function isDecidePhaseComplete(turn: TurnState, settings: GameSettings): boolean {
  return countPendingChoices(turn.dice, settings) === 0;
}

/**
 * Resolve the DiscardGoods phase with the player's choice of goods to keep.
 * Returns the updated game state, or an error if the choice is invalid.
 */
export function resolveDiscardGoods(
  game: GameState,
  goodsToKeep: GoodsTrack
): GameState | { error: string } {
  const { state, settings } = game;
  const activePlayer = state.players[state.activePlayerIndex];

  const validation = validateKeepGoods(activePlayer.goods, goodsToKeep, activePlayer, settings);
  if (!validation.valid) {
    return { error: validation.reason };
  }

  const newGoods = applyKeepGoods(activePlayer.goods, goodsToKeep);
  const updatedPlayer = { ...activePlayer, goods: newGoods };
  const players = [
    ...state.players.slice(0, state.activePlayerIndex),
    updatedPlayer,
    ...state.players.slice(state.activePlayerIndex + 1),
  ];

  const newState: GameStateSnapshot = {
    ...state,
    players,
    phase: GamePhase.EndTurn,
  };

  return { ...game, state: newState };
}

/**
 * End the current player's turn and move to the next player.
 */
export function endTurn(game: GameState): GameState {
  const { state, settings } = game;
  const totalPlayers = settings.players.length;

  let players = [...state.players];

  players = updateAllScores(players, settings);

  const nextPlayerIndex = (state.activePlayerIndex + 1) % totalPlayers;
  const isNewRound = nextPlayerIndex === 0;
  const newRound = isNewRound ? state.round + 1 : state.round;

  const nextPlayer = players[nextPlayerIndex];
  const newTurn = createInitialTurn(nextPlayer.id, nextPlayer, settings);

  const newState: GameStateSnapshot = {
    players,
    activePlayerIndex: nextPlayerIndex,
    round: newRound,
    phase: GamePhase.RollDice,
    turn: newTurn,
  };

  return { ...game, state: newState };
}

/**
 * Check if the game has ended.
 */
export function isGameOver(game: GameState): boolean {
  if (game.settings.endCondition.numRounds && game.state.round > game.settings.endCondition.numRounds) {
    return true;
  }

  for (const player of game.state.players) {
    if (
      game.settings.endCondition.numDevelopments &&
      getDevelopmentCount(player) >= game.settings.endCondition.numDevelopments
    ) {
      return true;
    }

    if (game.settings.endCondition.numMonuments) {
      const totalMonuments = getCompletedMonumentCount(player);
      if (totalMonuments >= game.settings.endCondition.numMonuments) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get the active player.
 */
export function getActivePlayer(game: GameState): PlayerState {
  return game.state.players[game.state.activePlayerIndex];
}

/**
 * Update the active player.
 */
export function updateActivePlayer(
  game: GameState,
  updater: (player: PlayerState) => PlayerState
): GameState {
  const players = [...game.state.players];
  players[game.state.activePlayerIndex] = updater(players[game.state.activePlayerIndex]);

  return {
    ...game,
    state: {
      ...game.state,
      players,
    },
  };
}

/**
 * Update the turn state.
 */
export function updateTurn(
  game: GameState,
  updater: (turn: TurnState) => TurnState
): GameState {
  return {
    ...game,
    state: {
      ...game.state,
      turn: updater(game.state.turn),
    },
  };
}

/**
 * Perform a dice roll action.
 */
export function performRoll(game: GameState): GameState {
  const { state, settings } = game;
  const activePlayer = state.players[state.activePlayerIndex];

  if (!canRoll(state.turn, settings, activePlayer)) {
    return game;
  }

  const newDice = rollUnlockedDice(state.turn.dice, settings);
  const newTurn: TurnState = {
    ...state.turn,
    dice: newDice,
    rollsUsed: state.turn.rollsUsed + 1,
  };

  const shouldAutoAdvance =
    areAllDiceLocked(newDice) ||
    newTurn.rollsUsed >= getMaxRollsAllowed(activePlayer, settings);

  let newPhase = state.phase;
  if (shouldAutoAdvance) {
    newPhase = GamePhase.DecideDice;
  }

  return {
    ...game,
    state: {
      ...state,
      turn: newTurn,
      phase: newPhase,
    },
  };
}

/**
 * Get current game status summary.
 */
export function getGameStatus(game: GameState): {
  round: number;
  phase: GamePhase;
  activePlayerIndex: number;
  activePlayerId: string;
  isGameOver: boolean;
} {
  return {
    round: game.state.round,
    phase: game.state.phase,
    activePlayerIndex: game.state.activePlayerIndex,
    activePlayerId: game.state.turn.activePlayerId,
    isGameOver: isGameOver(game),
  };
}

import { GameState, GameSettings, PlayerState, TurnState, PlayerConfig, GamePhase } from '../game/game';
import { DieState, DiceLockDecision, ResourceProduction } from '../game/dice';
import { GoodsTrack } from '../game/goods';
import { ConstructionProgress } from '../game/construction';
import { CreateGameSettings } from '../game/gameDefinitionConsts';

/**
 * Create a minimal game settings for testing.
 */
export function createTestSettings(playerCount: number = 2): GameSettings {
  const players: PlayerConfig[] = Array.from({ length: playerCount }, (_, i) => ({
    id: `player${i + 1}`,
    name: `Player ${i + 1}`,
    controller: 'human' as const,
  }));
  return CreateGameSettings(players);
}

/**
 * Create a test player state with optional overrides.
 */
export function createTestPlayer(
  id: string,
  settings: GameSettings,
  overrides: Partial<PlayerState> = {}
): PlayerState {
  const goodsTrack: GoodsTrack = new Map(
    settings.goodsTypes.map((g) => [g, 0])
  );

  const monuments: Record<string, ConstructionProgress> = {};
  for (const m of settings.monumentDefinitions) {
    monuments[m.id] = { workersCommitted: 0, completed: false };
  }

  const cities: ConstructionProgress[] = [
    ...Array.from({ length: settings.startingCities }, () => ({ workersCommitted: 0, completed: true })),
    ...Array.from({ length: settings.maxCities - settings.startingCities }, () => ({ workersCommitted: 0, completed: false })),
  ];

  return {
    id,
    food: settings.startingFood,
    goods: goodsTrack,
    cities,
    developments: [],
    monuments,
    disasterPenalties: 0,
    score: 0,
    ...overrides,
  };
}

/**
 * Create a test turn state with optional overrides.
 */
export function createTestTurn(
  playerId: string,
  overrides: Partial<TurnState> = {}
): TurnState {
  return {
    activePlayerId: playerId,
    rollsUsed: 0,
    dice: [],
    pendingChoices: 0,
    turnProduction: { goods: 0, food: 0, workers: 0, coins: 0, skulls: 0 },
    ...overrides,
  };
}

/**
 * Create a test die state.
 */
export function createTestDie(
  faceIndex: number,
  lockDecision: DiceLockDecision = 'unlocked',
  productionIndex: number = 0
): DieState {
  return {
    diceFaceIndex: faceIndex,
    productionIndex,
    lockDecision,
  };
}

/**
 * Create test dice with specific face indices.
 */
export function createTestDice(faceIndices: number[], lockDecisions?: DiceLockDecision[]): DieState[] {
  return faceIndices.map((faceIndex, i) => ({
    diceFaceIndex: faceIndex,
    productionIndex: 0,
    lockDecision: lockDecisions?.[i] ?? 'unlocked',
  }));
}

/**
 * Create a complete test game state.
 */
export function createTestGame(
  playerCount: number = 2,
  phase: GamePhase = GamePhase.RollDice
): GameState {
  const settings = createTestSettings(playerCount);
  const players = settings.players.map((config) =>
    createTestPlayer(config.id, settings)
  );

  return {
    settings,
    state: {
      players,
      activePlayerIndex: 0,
      round: 1,
      phase,
      turn: createTestTurn(players[0].id),
    },
    history: [],
    future: [],
  };
}

/**
 * Set goods quantity on a player's goods track by name.
 */
export function setPlayerGoods(
  player: PlayerState,
  goodsName: string,
  quantity: number,
  settings: GameSettings
): PlayerState {
  const goodsType = settings.goodsTypes.find((g) => g.name === goodsName);
  if (!goodsType) return player;

  const newGoods = new Map(player.goods);
  newGoods.set(goodsType, quantity);
  return { ...player, goods: newGoods };
}

/**
 * Get goods quantity from a player's goods track by name.
 */
export function getPlayerGoods(
  player: PlayerState,
  goodsName: string,
  settings: GameSettings
): number {
  const goodsType = settings.goodsTypes.find((g) => g.name === goodsName);
  if (!goodsType) return 0;
  return player.goods.get(goodsType) ?? 0;
}

/**
 * Create empty production object.
 */
export function emptyProduction(): ResourceProduction {
  return { goods: 0, food: 0, workers: 0, coins: 0, skulls: 0 };
}

/**
 * Update a specific player in the game state.
 */
export function updatePlayer(
  game: GameState,
  playerIndex: number,
  updater: (player: PlayerState) => PlayerState
): GameState {
  const players = [...game.state.players];
  players[playerIndex] = updater(players[playerIndex]);
  return {
    ...game,
    state: { ...game.state, players },
  };
}

/**
 * Set the turn state in a game.
 */
export function setTurn(game: GameState, turn: TurnState): GameState {
  return {
    ...game,
    state: { ...game.state, turn },
  };
}

/**
 * Set the phase in a game.
 */
export function setPhase(game: GameState, phase: GamePhase): GameState {
  return {
    ...game,
    state: { ...game.state, phase },
  };
}

/**
 * Standard dice face indices for testing (based on DICE_FACES):
 * 0: 1 Good
 * 1: 2 Goods + Skull
 * 2: 2 Food OR 2 Workers (choice)
 * 3: 3 Workers
 * 4: 7 Coins
 * 5: 3 Food
 */
export const DICE_FACE = {
  ONE_GOOD: 0,
  TWO_GOODS_SKULL: 1,
  FOOD_OR_WORKERS: 2,
  THREE_WORKERS: 3,
  SEVEN_COINS: 4,
  THREE_FOOD: 5,
} as const;

import { MonumentDefinition, ConstructionRequirements, ConstructionProgress, DevelopmentDefinition } from './construction';
import { DisasterDefinition } from './disaster';
import { GoodsTrack, GoodsType } from './goods';
import { DieState, DiceFaceDefinition } from './dice';
import { ResourceProduction } from './dice';

/**
 * Six major phases per the ruleset:
 * 1) roll dice
 * 2) choose dice choices (if any)
 * 3) collect + feed + disasters
 * 4) build cities/monuments
 * 5) buy developments
 * 6) discard goods
 */
export enum GamePhase {
  RollDice = 'rollDice',
  DecideDice = 'decideDice',
  ResolveProduction = 'resolveProduction',
  Build = 'build',
  Development = 'development',
  DiscardGoods = 'discardGoods',
  EndTurn = 'endTurn',
}

export const GAME_PHASE_ORDER: GamePhase[] = [
  GamePhase.RollDice,
  GamePhase.DecideDice,
  GamePhase.ResolveProduction,
  GamePhase.Build,
  GamePhase.Development,
  GamePhase.DiscardGoods,
  GamePhase.EndTurn,
];

export interface GameStateSnapshot {
  players: PlayerState[];
  activePlayerIndex: number;
  round: number;
  phase: GamePhase;
  turn: TurnState;
}

export interface HistoryEntry {
  snapshot: GameStateSnapshot;
}

export interface GameState {
  settings: GameSettings;

  state: GameStateSnapshot;

  history: HistoryEntry[];
  future: HistoryEntry[];
}

export interface GameSettings {
  players: PlayerConfig[];

  endCondition: EndCondition;

  diceFaces: DiceFaceDefinition[];
  goodsTypes: GoodsType[];
  monumentDefinitions: MonumentDefinition[];
  cityDefinitions: ConstructionRequirements[];
  developmentDefinitions: DevelopmentDefinition[];
  disasterDefinitions: DisasterDefinition[];

  maxDiceRolls: number;
  maxFood: number;
  maxGoods: number;
  startingFood: number;
  startingCities: number;
  maxCities: number;
}

export type EndCondition = {
  numDevelopments?: number;
  numMonuments?: number;
  numRounds?: number;
};

export interface TurnState {
    activePlayerId: PlayerId;
    rollsUsed: number;
    singleDieRerollsUsed: number;
    dice: DieState[];
    pendingChoices: number;
    foodShortage: number;
    developmentPurchased: boolean;
    turnProduction: ResourceProduction;
  }
  
export type PlayerId = string;

export type PlayerController = 'human' | 'bot';

export interface PlayerConfig {
  id: PlayerId;
  name: string;
  controller: PlayerController;
}

export type PlayerState = {
  id: PlayerId;

  food: number;
  goods: GoodsTrack;

  cities: ConstructionProgress[];
  developments: string[];
  monuments: Record<string, ConstructionProgress>;

  disasterPenalties: number;
  score: number;
};


  

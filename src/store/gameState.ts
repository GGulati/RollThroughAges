import { GameState, PlayerConfig } from '@/game';

export interface RandomSource {
  next(): number;
}

export const defaultRandomSource: RandomSource = {
  next: () => Math.random(),
};

export interface GameActionError {
  code: GameActionErrorCode;
  message: string;
}

export type GameActionErrorCode =
  | 'NO_GAME'
  | 'ROLL_NOT_ALLOWED'
  | 'UNDO_NOT_AVAILABLE'
  | 'REDO_NOT_AVAILABLE';

export interface GameSliceState {
  game: GameState | null;
  lastError: GameActionError | null;
}

export interface StartGamePayload {
  players: PlayerConfig[];
}

import { GameState, PlayerConfig } from '@/game';

export interface RandomSource {
  next(): number;
}

export const defaultRandomSource: RandomSource = {
  next: () => Math.random(),
};

export interface GameActionError {
  code: string;
  message: string;
}

export interface GameSliceState {
  game: GameState | null;
  lastError: GameActionError | null;
}

export interface StartGamePayload {
  players: PlayerConfig[];
}

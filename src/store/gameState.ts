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
  | 'REDO_NOT_AVAILABLE'
  | 'INVALID_PHASE'
  | 'INVALID_DIE_INDEX'
  | 'INVALID_PRODUCTION_CHOICE'
  | 'PRODUCTION_NOT_READY'
  | 'NO_PENDING_GOODS'
  | 'UNKNOWN_GOOD'
  | 'NO_WORKERS_AVAILABLE'
  | 'INVALID_BUILD_TARGET'
  | 'INVALID_DEVELOPMENT'
  | 'DEVELOPMENT_NOT_AFFORDABLE'
  | 'INVALID_EXCHANGE';

export interface GameSliceState {
  game: GameState | null;
  lastError: GameActionError | null;
  actionLog: string[];
  tutorial: {
    active: boolean;
    currentStepIndex: number;
  };
}

export interface StartGamePayload {
  players: PlayerConfig[];
}

export interface TutorialStepDefinition {
  id: string;
  title: string;
  instruction: string;
  hint?: string;
}

export const TUTORIAL_STEPS: TutorialStepDefinition[] = [
  {
    id: 'intro',
    title: 'Welcome',
    instruction: 'This tutorial will walk through one full game turn.',
    hint: 'Use the highlighted panel and follow the instruction text.',
  },
  { id: 'roll', title: 'Roll Dice', instruction: 'Roll your dice to start production.' },
  { id: 'lock', title: 'Lock Dice', instruction: 'Lock dice you want to keep.' },
  { id: 'reroll', title: 'Reroll', instruction: 'Reroll unlocked non-skull dice as needed.' },
  { id: 'choice', title: 'Choose Faces', instruction: 'Resolve any die face choices.' },
  {
    id: 'production',
    title: 'Production',
    instruction: 'Review total production before moving on.',
  },
  { id: 'feeding', title: 'Feeding', instruction: 'Food feeds cities automatically.' },
  {
    id: 'starvation',
    title: 'Starvation',
    instruction: 'Unfed cities cause VP loss.',
    hint: 'Food shortage is -1 VP per unfed city.',
  },
  {
    id: 'disasters',
    title: 'Disasters',
    instruction: 'Skulls trigger one disaster based on total skull count.',
  },
  { id: 'build', title: 'Build', instruction: 'Spend workers to build cities or monuments.' },
  {
    id: 'monument-race',
    title: 'Monuments',
    instruction: 'Monuments score differently for first versus later completion.',
  },
  {
    id: 'development',
    title: 'Development',
    instruction: 'You may buy up to one development each turn.',
  },
  {
    id: 'spending',
    title: 'Spending',
    instruction: 'Use coins and selected goods value to buy developments.',
  },
  {
    id: 'exchange',
    title: 'Exchanges',
    instruction: 'Apply conversion effects when they help this phase.',
  },
  {
    id: 'discard',
    title: 'Discard',
    instruction: 'If over goods limits, discard before ending your turn.',
  },
  {
    id: 'end-turn',
    title: 'End Turn',
    instruction: 'End turn only when all required phases are complete.',
  },
  {
    id: 'handoff',
    title: 'Turn Handoff',
    instruction: 'Play passes to the next player each turn.',
  },
  {
    id: 'endgame-trigger',
    title: 'Endgame Trigger',
    instruction: 'Certain milestones trigger the final round.',
  },
  {
    id: 'equal-turns',
    title: 'Equal Turns',
    instruction: 'All players get equal turns before final scoring.',
  },
  {
    id: 'complete',
    title: 'Tutorial Complete',
    instruction: 'You are ready to play. Continue this game or exit tutorial.',
    hint: 'Full rules: https://www.yucata.de/en/Rules/RollAges',
  },
];

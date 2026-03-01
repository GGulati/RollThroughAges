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

export type TutorialActionKey =
  | 'rollDice'
  | 'rerollSingleDie'
  | 'keepDie'
  | 'selectProduction'
  | 'buildCity'
  | 'buildMonument'
  | 'buyDevelopment'
  | 'skipDevelopment'
  | 'applyExchange'
  | 'discardGoods'
  | 'endTurn'
  | 'continue';

export interface TutorialStepDefinition {
  id: string;
  title: string;
  instruction: string;
  hint?: string;
  highlightTarget?:
    | 'turnStatus'
    | 'production'
    | 'disaster'
    | 'build'
    | 'development'
    | 'discard';
  allowedActions: TutorialActionKey[];
  completionActions?: TutorialActionKey[];
  instructionResolver?: (game: GameState | null) => string;
}

export const TUTORIAL_STEPS: TutorialStepDefinition[] = [
  {
    id: 'intro',
    title: 'Welcome',
    instruction: 'This tutorial will walk through one full game turn.',
    hint: 'Use the highlighted panel and follow the instruction text.',
    highlightTarget: 'production',
    allowedActions: ['continue'],
    completionActions: ['continue'],
  },
  {
    id: 'roll',
    title: 'Roll Dice',
    instruction: 'Click Reroll Dice in the Production panel.',
    highlightTarget: 'production',
    allowedActions: ['rollDice'],
    completionActions: ['rollDice'],
  },
  {
    id: 'lock',
    title: 'Lock Dice',
    instruction: 'Lock one non-skull die.',
    highlightTarget: 'production',
    allowedActions: ['keepDie'],
    completionActions: ['keepDie'],
    instructionResolver: (game) => {
      const dice = game?.state.turn.dice ?? [];
      const lockTarget = dice.findIndex(
        (die) => die.lockDecision !== 'skull' && die.lockDecision === 'unlocked',
      );
      return lockTarget >= 0
        ? `Click "Lock" on Die ${lockTarget + 1}.`
        : 'Lock one non-skull die.';
    },
  },
  {
    id: 'reroll',
    title: 'Reroll',
    instruction: 'Click Reroll Dice. Skull dice stay locked and do not reroll.',
    highlightTarget: 'production',
    allowedActions: ['rollDice'],
    completionActions: ['rollDice'],
    instructionResolver: (game) => {
      const dice = game?.state.turn.dice ?? [];
      const skullTarget = dice.findIndex((die) => die.lockDecision === 'skull');
      return skullTarget >= 0
        ? `Click "Reroll Dice". Confirm Die ${skullTarget + 1} (Skull) stays locked.`
        : 'Click "Reroll Dice".';
    },
  },
  {
    id: 'choice',
    title: 'Choose Faces',
    instruction: 'Select the production option that gives workers.',
    highlightTarget: 'production',
    allowedActions: ['selectProduction'],
    completionActions: ['selectProduction'],
    instructionResolver: (game) => {
      const dice = game?.state.turn.dice ?? [];
      const choiceTarget = dice.findIndex((die) => die.productionIndex < 0);
      if (!game || choiceTarget < 0) {
        return 'Select the production option that gives workers.';
      }

      const die = dice[choiceTarget];
      const face = game.settings.diceFaces[die.diceFaceIndex];
      const workerOptionIndex = face.production.findIndex(
        (production) => production.workers > 0,
      );
      if (workerOptionIndex < 0) {
        return `For Die ${choiceTarget + 1}, choose Option 1 or Option 2.`;
      }

      const workerOption = face.production[workerOptionIndex];
      return `For Die ${choiceTarget + 1}, choose Option ${workerOptionIndex + 1} (${workerOption.workers} Workers).`;
    },
  },
  {
    id: 'production',
    title: 'Production',
    instruction: 'Review total production before moving on.',
    highlightTarget: 'production',
    allowedActions: ['continue'],
    completionActions: ['continue'],
  },
  {
    id: 'feeding',
    title: 'Feeding',
    instruction: 'Food feeds cities automatically.',
    highlightTarget: 'production',
    allowedActions: ['continue'],
    completionActions: ['continue'],
  },
  {
    id: 'starvation',
    title: 'Starvation',
    instruction: 'Unfed cities cause VP loss.',
    hint: 'Food shortage is -1 VP per unfed city.',
    highlightTarget: 'production',
    allowedActions: ['continue'],
    completionActions: ['continue'],
  },
  {
    id: 'disasters',
    title: 'Disasters',
    instruction: 'Skulls trigger one disaster based on total skull count.',
    highlightTarget: 'disaster',
    allowedActions: ['continue'],
    completionActions: ['continue'],
  },
  {
    id: 'build',
    title: 'Build',
    instruction: 'Build either one city or one monument.',
    highlightTarget: 'build',
    allowedActions: ['buildCity', 'buildMonument'],
    completionActions: ['buildCity', 'buildMonument'],
    instructionResolver: () =>
      'In Build, click either "Build City" or "Build Monument".',
  },
  {
    id: 'monument-race',
    title: 'Monuments',
    instruction: 'Monuments score differently for first versus later completion.',
    highlightTarget: 'build',
    allowedActions: ['continue'],
    completionActions: ['continue'],
  },
  {
    id: 'development',
    title: 'Development',
    instruction: 'Development happens after build when you can afford an option.',
    highlightTarget: 'development',
    allowedActions: ['continue'],
    completionActions: ['continue'],
  },
  {
    id: 'spending',
    title: 'Spending',
    instruction: 'Development costs can be paid with coins plus selected goods.',
    highlightTarget: 'development',
    allowedActions: ['continue'],
    completionActions: ['continue'],
  },
  {
    id: 'exchange',
    title: 'Exchanges',
    instruction: 'Some developments add exchange effects usable during relevant phases.',
    highlightTarget: 'development',
    allowedActions: ['continue'],
    completionActions: ['continue'],
  },
  {
    id: 'discard',
    title: 'Discard',
    instruction: 'Discard only happens when goods exceed track limits.',
    highlightTarget: 'discard',
    allowedActions: ['continue'],
    completionActions: ['continue'],
  },
  {
    id: 'end-turn',
    title: 'End Turn',
    instruction: 'End turn only when all required phases are complete.',
    highlightTarget: 'turnStatus',
    allowedActions: ['endTurn'],
    completionActions: ['endTurn'],
    instructionResolver: () => 'Click "End Turn" in Game Status.',
  },
  {
    id: 'handoff',
    title: 'Turn Handoff',
    instruction: 'Play passes to the next player each turn.',
    highlightTarget: 'turnStatus',
    allowedActions: ['continue'],
    completionActions: ['continue'],
  },
  {
    id: 'endgame-trigger',
    title: 'Endgame Trigger',
    instruction: 'Certain milestones trigger the final round.',
    highlightTarget: 'turnStatus',
    allowedActions: ['continue'],
    completionActions: ['continue'],
  },
  {
    id: 'equal-turns',
    title: 'Equal Turns',
    instruction: 'All players get equal turns before final scoring.',
    highlightTarget: 'turnStatus',
    allowedActions: ['continue'],
    completionActions: ['continue'],
  },
  {
    id: 'complete',
    title: 'Tutorial Complete',
    instruction: 'You are ready to play. Continue this game.',
    hint: 'Full rules: https://www.yucata.de/en/Rules/RollAges',
    highlightTarget: 'turnStatus',
    allowedActions: ['continue'],
    completionActions: ['continue'],
  },
];

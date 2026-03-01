import { GameState } from '@/game';
import {
  DomainEvent,
  GameCommandType,
  TUTORIAL_STEPS,
  TutorialActionKey,
  TutorialStepDefinition,
} from '@/store/gameState';

export interface TutorialProgressState {
  active: boolean;
  currentStepIndex: number;
}

const COMMAND_TO_TUTORIAL_ACTION: Partial<
  Record<GameCommandType, TutorialActionKey>
> = {
  rollDice: 'rollDice',
  rerollSingleDie: 'rerollSingleDie',
  keepDie: 'keepDie',
  selectProduction: 'selectProduction',
  buildCity: 'buildCity',
  buildMonument: 'buildMonument',
  buyDevelopment: 'buyDevelopment',
  skipDevelopment: 'skipDevelopment',
  applyExchange: 'applyExchange',
  discardGoods: 'discardGoods',
  endTurn: 'endTurn',
  advanceTutorialStep: 'continue',
};

export function getCurrentTutorialStep(
  tutorial: TutorialProgressState,
): TutorialStepDefinition | null {
  if (!tutorial.active || TUTORIAL_STEPS.length === 0) {
    return null;
  }
  const index = Math.max(
    0,
    Math.min(tutorial.currentStepIndex, TUTORIAL_STEPS.length - 1),
  );
  return TUTORIAL_STEPS[index];
}

export function isTutorialActionAllowed(
  tutorial: TutorialProgressState,
  actionKey: TutorialActionKey,
): boolean {
  const step = getCurrentTutorialStep(tutorial);
  if (!step) {
    return true;
  }
  return step.allowedActions.includes(actionKey);
}

export function advanceTutorialFromEvents(
  tutorial: TutorialProgressState,
  appliedEvents: DomainEvent[],
  resolutionEvents: DomainEvent[],
  game: GameState | null,
  commandType: GameCommandType,
): TutorialProgressState {
  if (!tutorial.active) {
    return tutorial;
  }

  const completedAction = COMMAND_TO_TUTORIAL_ACTION[commandType];
  if (!completedAction) {
    return tutorial;
  }

  const step = getCurrentTutorialStep(tutorial);
  if (!step || !step.allowedActions.includes(completedAction)) {
    return tutorial;
  }

  const completion = step.completion;
  const eventTypes = completion.eventTypes ?? [];
  const eventSatisfied =
    eventTypes.length === 0
      ? true
      : [...appliedEvents, ...resolutionEvents].some((event) =>
          eventTypes.includes(event.type),
        );
  const stateSatisfied = completion.statePredicate
    ? completion.statePredicate(game)
    : true;
  if (!eventSatisfied || !stateSatisfied) {
    return tutorial;
  }

  if (tutorial.currentStepIndex >= TUTORIAL_STEPS.length - 1) {
    return {
      ...tutorial,
      active: false,
    };
  }

  return {
    ...tutorial,
    currentStepIndex: tutorial.currentStepIndex + 1,
  };
}

export function resolveTutorialInstruction(
  tutorial: TutorialProgressState,
  game: GameState | null,
): string {
  const step = getCurrentTutorialStep(tutorial);
  if (!step) {
    return 'Follow the guided steps.';
  }
  return step.instructionResolver?.(game) ?? step.instruction;
}

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { enableMapSet } from 'immer';
import { ConstructionProgress } from '@/game/construction';
import { GamePhase, PlayerConfig } from '@/game/game';
import {
  allocateWorkersToCity,
  allocateWorkersToMonument,
  calculateGoodsOverflow,
  calculateGoodsValue,
  exchangeResources as exchangeResourcesEngine,
  getCityWorkerCost,
  getBuildOptions,
  autoAdvanceForcedPhases,
  getPostDevelopmentCompletionPhase,
  getNextPostDevelopmentPhase,
  resolveProductionPhase,
  areAllDiceLocked,
  countPendingChoices,
  createGame,
  endTurn as endTurnEngine,
  findGoodsTypeByName,
  getExchangeResourceAmount,
  getAffectedPlayerIndices,
  getMaxRollsAllowed,
  getRewrittenDisasterTargeting,
  getSingleDieRerollsAllowed,
  getTriggeredDisaster,
  getAvailableDevelopments,
  hasDisasterImmunity,
  keepDie as keepDieEngine,
  performRoll,
  purchaseDevelopment,
  performSingleDieReroll as performSingleDieRerollEngine,
  redo as redoEngine,
  resolveDiscardGoods,
  spendWorkers,
  selectProduction as selectProductionEngine,
  undo as undoEngine,
} from '@/game/engine';
import { GameSettings, GameState, GameStateSnapshot, PlayerState } from '@/game';
import {
  GameActionErrorCode,
  GameSliceState,
  TUTORIAL_STEPS,
  TutorialActionKey,
} from './gameState';

const MAX_HISTORY_ENTRIES = 20;
const TUTORIAL_PLAYERS: PlayerConfig[] = [
  { id: 'tutorial-p1', name: 'Player 1', controller: 'human' },
  { id: 'tutorial-p2', name: 'Guide Bot', controller: 'bot' },
];
enableMapSet();

const initialState: GameSliceState = {
  game: null,
  lastError: null,
  actionLog: [],
  tutorial: {
    active: false,
    currentStepIndex: 0,
  },
};

function setError(state: GameSliceState, code: GameActionErrorCode, message: string): void {
  state.lastError = { code, message };
  appendLog(state, `Error [${code}]: ${message}`);
}

function getPlayerName(game: GameState, playerId: string): string {
  return game.settings.players.find((player) => player.id === playerId)?.name ?? playerId;
}

function appendLog(
  state: GameSliceState,
  message: string,
  gameForActor: GameState | null = state.game,
  playerIdForActor?: string,
): void {
  const actorName = gameForActor
    ? getPlayerName(
        gameForActor,
        playerIdForActor ?? gameForActor.state.turn.activePlayerId,
      )
    : 'System';
  state.actionLog = [...state.actionLog, `[${actorName}] ${message}`];
}

function countUnlockedDice(snapshot: GameStateSnapshot): number {
  return snapshot.turn.dice.filter((die) => die.lockDecision === 'unlocked').length;
}

function formatTurnLocation(snapshot: GameStateSnapshot, game: GameState): string {
  return `R${snapshot.round} ${getPlayerName(game, snapshot.turn.activePlayerId)} (${snapshot.phase})`;
}

function formatProductionSummary(
  production: GameStateSnapshot['turn']['turnProduction'],
): string {
  return `food +${production.food}, coins +${production.coins}, workers +${production.workers}, goods +${production.goods}, skulls ${production.skulls}`;
}

function getTotalGoods(player: GameStateSnapshot['players'][number]): number {
  let total = 0;
  for (const quantity of player.goods.values()) {
    total += quantity;
  }
  return total;
}

function getDisasterImmunitySource(
  player: PlayerState,
  disasterId: string,
  settings: GameSettings,
): string | null {
  const immunityDevelopment = settings.developmentDefinitions.find(
    (development) =>
      player.developments.includes(development.id) &&
      development.specialEffect.type === 'disasterImmunity' &&
      development.specialEffect.disasterId === disasterId,
  );
  if (immunityDevelopment) {
    return immunityDevelopment.name;
  }

  const immunityMonument = settings.monumentDefinitions.find(
    (monument) =>
      monument.specialEffect?.type === 'disasterImmunity' &&
      monument.specialEffect.disasterId === disasterId &&
      Boolean(player.monuments[monument.id]?.completed),
  );
  return immunityMonument?.requirements.name ?? null;
}

function getDisasterRewriteSource(
  player: PlayerState,
  disasterId: string,
  settings: GameSettings,
): string | null {
  const rewriteDevelopment = settings.developmentDefinitions.find(
    (development) =>
      player.developments.includes(development.id) &&
      development.specialEffect.type === 'rewriteDisasterTargeting' &&
      development.specialEffect.disasterId === disasterId,
  );
  return rewriteDevelopment?.name ?? null;
}

const TUTORIAL_ROLL_FACE_SEQUENCE: number[][] = [
  [1, 2, 3],
  [2, 4, 0],
  [5, 3, 4],
];

const TUTORIAL_SINGLE_REROLL_FACE_SEQUENCE: number[] = [2, 4, 5];

function createScriptedDieState(faceIndex: number, settings: GameSettings) {
  const normalizedFaceIndex =
    ((faceIndex % settings.diceFaces.length) + settings.diceFaces.length) %
    settings.diceFaces.length;
  const face = settings.diceFaces[normalizedFaceIndex];
  const hasSkull = face.production.some((production) => production.skulls > 0);
  const needsChoice = face.production.length > 1;
  return {
    diceFaceIndex: normalizedFaceIndex,
    productionIndex: needsChoice ? -1 : 0,
    lockDecision: hasSkull ? ('skull' as const) : ('unlocked' as const),
  };
}

function applyTutorialDeterministicRoll(
  beforeDice: GameStateSnapshot['turn']['dice'],
  afterDice: GameStateSnapshot['turn']['dice'],
  rollNumber: number,
  settings: GameSettings,
): GameStateSnapshot['turn']['dice'] {
  const rollIndex = Math.max(0, rollNumber - 1) % TUTORIAL_ROLL_FACE_SEQUENCE.length;
  const scriptedFaces = TUTORIAL_ROLL_FACE_SEQUENCE[rollIndex];
  let scriptedCursor = 0;

  return afterDice.map((die, index) => {
    if (beforeDice[index]?.lockDecision !== 'unlocked') {
      return die;
    }
    const scriptedFace = scriptedFaces[scriptedCursor % scriptedFaces.length];
    scriptedCursor += 1;
    return createScriptedDieState(scriptedFace, settings);
  });
}

function applyTutorialDeterministicSingleReroll(
  dice: GameStateSnapshot['turn']['dice'],
  dieIndex: number,
  rerollsUsed: number,
  settings: GameSettings,
): GameStateSnapshot['turn']['dice'] {
  const sequenceIndex =
    Math.max(0, rerollsUsed - 1) % TUTORIAL_SINGLE_REROLL_FACE_SEQUENCE.length;
  const scriptedFace = TUTORIAL_SINGLE_REROLL_FACE_SEQUENCE[sequenceIndex];
  return dice.map((die, index) =>
    index === dieIndex ? createScriptedDieState(scriptedFace, settings) : die,
  );
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
          completedOrder: city.completedOrder,
        }),
      ),
      developments: [...player.developments],
      monuments: Object.fromEntries(
        Object.entries(player.monuments).map(([id, progress]) => [
          id,
          {
            workersCommitted: progress.workersCommitted,
            completed: progress.completed,
            completedOrder: progress.completedOrder,
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

function getCurrentTutorialStep(state: GameSliceState) {
  if (!state.tutorial.active || TUTORIAL_STEPS.length === 0) {
    return null;
  }
  const index = Math.max(
    0,
    Math.min(state.tutorial.currentStepIndex, TUTORIAL_STEPS.length - 1),
  );
  return TUTORIAL_STEPS[index];
}

function isTutorialHumanTurn(state: GameSliceState): boolean {
  if (!state.tutorial.active || !state.game) {
    return false;
  }
  return state.game.state.turn.activePlayerId === 'tutorial-p1';
}

function isTutorialActionAllowed(
  state: GameSliceState,
  actionKey: TutorialActionKey,
): boolean {
  const step = getCurrentTutorialStep(state);
  if (!step) {
    return true;
  }
  return step.allowedActions.includes(actionKey);
}

function blockIfTutorialActionDisallowed(
  state: GameSliceState,
  actionKey: TutorialActionKey,
): boolean {
  if (!isTutorialHumanTurn(state)) {
    return false;
  }
  if (isTutorialActionAllowed(state, actionKey)) {
    return false;
  }
  const step = getCurrentTutorialStep(state);
  setError(
    state,
    'INVALID_PHASE',
    `Tutorial step "${step?.title ?? 'Current Step'}" does not allow that action yet.`,
  );
  return true;
}

function advanceTutorialIfCompleted(
  state: GameSliceState,
  completedAction: TutorialActionKey,
): void {
  if (!state.tutorial.active) {
    return;
  }
  const step = getCurrentTutorialStep(state);
  if (!step || !step.completionActions?.includes(completedAction)) {
    return;
  }
  if (state.tutorial.currentStepIndex >= TUTORIAL_STEPS.length - 1) {
    return;
  }
  state.tutorial.currentStepIndex += 1;
}

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    returnToSetup: (state) => {
      state.game = null;
      state.lastError = null;
      state.actionLog = [];
      state.tutorial = {
        active: false,
        currentStepIndex: 0,
      };
    },
    startGame: (state, action: PayloadAction<{ players: PlayerConfig[] }>) => {
      state.game = autoAdvanceForcedPhases(createGame(action.payload.players));
      state.lastError = null;
      state.tutorial = {
        active: false,
        currentStepIndex: 0,
      };
      state.actionLog = [
        `[System] Game started with ${action.payload.players.length} players: ${action.payload.players
          .map((player) => player.name)
          .join(', ')}.`,
      ];
    },
    startTutorialGame: (state) => {
      const seededGame = autoAdvanceForcedPhases(createGame(TUTORIAL_PLAYERS));
      const scriptedFirstFaces = TUTORIAL_ROLL_FACE_SEQUENCE[0];
      const tutorialDice = seededGame.state.turn.dice.map((_, index) =>
        createScriptedDieState(
          scriptedFirstFaces[index % scriptedFirstFaces.length],
          seededGame.settings,
        ),
      );
      state.game = autoAdvanceForcedPhases({
        ...seededGame,
        state: {
          ...seededGame.state,
          turn: {
            ...seededGame.state.turn,
            dice: tutorialDice,
            pendingChoices: countPendingChoices(tutorialDice, seededGame.settings),
          },
        },
      });
      state.lastError = null;
      state.tutorial = {
        active: true,
        currentStepIndex: 0,
      };
      state.actionLog = [
        '[System] Tutorial game started.',
      ];
    },
    advanceTutorialStep: (state) => {
      if (!state.tutorial.active) {
        return;
      }
      if (blockIfTutorialActionDisallowed(state, 'continue')) {
        return;
      }
      if (state.tutorial.currentStepIndex >= TUTORIAL_STEPS.length - 1) {
        state.tutorial.active = false;
        state.lastError = null;
        appendLog(state, 'Tutorial completed.');
        return;
      }
      advanceTutorialIfCompleted(state, 'continue');
      state.lastError = null;
    },
    exitTutorial: (state) => {
      state.game = null;
      state.lastError = null;
      state.actionLog = [];
      state.tutorial = {
        active: false,
        currentStepIndex: 0,
      };
    },
    rollDice: (state) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before rolling dice.');
        return;
      }
      if (blockIfTutorialActionDisallowed(state, 'rollDice')) {
        return;
      }

      // Random outcomes are intentionally non-undoable.
      const nextGame = applyMutationWithoutHistory(state.game, performRoll);
      if (!nextGame) {
        setError(state, 'ROLL_NOT_ALLOWED', 'No roll is available right now.');
        return;
      }

      const resolvedGame = autoAdvanceForcedPhases(nextGame);
      const beforeSnapshot = state.game.state;
      const deterministicDice =
        state.tutorial.active
          ? applyTutorialDeterministicRoll(
              beforeSnapshot.turn.dice,
              resolvedGame.state.turn.dice,
              resolvedGame.state.turn.rollsUsed,
              resolvedGame.settings,
            )
          : resolvedGame.state.turn.dice;
      const deterministicGame =
        deterministicDice === resolvedGame.state.turn.dice
          ? resolvedGame
          : autoAdvanceForcedPhases({
              ...resolvedGame,
              state: {
                ...resolvedGame.state,
                turn: {
                  ...resolvedGame.state.turn,
                  dice: deterministicDice,
                  pendingChoices: countPendingChoices(
                    deterministicDice,
                    resolvedGame.settings,
                  ),
                },
              },
            });
      const afterSnapshot = deterministicGame.state;
      state.game = deterministicGame;
      state.lastError = null;
      appendLog(
        state,
        `Rolled ${countUnlockedDice(beforeSnapshot)} unlocked dice (roll ${afterSnapshot.turn.rollsUsed}/${getMaxRollsAllowed(
          afterSnapshot.players[afterSnapshot.activePlayerIndex],
          deterministicGame.settings,
        )}) -> phase ${afterSnapshot.phase}.`,
      );
      advanceTutorialIfCompleted(state, 'rollDice');
    },
    rerollSingleDie: (state, action: PayloadAction<{ dieIndex: number }>) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before rerolling a die.');
        return;
      }
      if (blockIfTutorialActionDisallowed(state, 'rerollSingleDie')) {
        return;
      }
      if (state.game.state.phase !== GamePhase.RollDice) {
        setError(
          state,
          'INVALID_PHASE',
          'Single-die rerolls are only available during the roll phase.',
        );
        return;
      }

      const activePlayer = state.game.state.players[state.game.state.activePlayerIndex];
      const rerollsAllowed = getSingleDieRerollsAllowed(activePlayer, state.game.settings);
      if (state.game.state.turn.singleDieRerollsUsed >= rerollsAllowed) {
        setError(
          state,
          'ROLL_NOT_ALLOWED',
          'No single-die rerolls are available right now.',
        );
        return;
      }
      const die = state.game.state.turn.dice[action.payload.dieIndex];
      if (!die || die.lockDecision === 'skull') {
        setError(
          state,
          'INVALID_DIE_INDEX',
          'That die cannot be rerolled.',
        );
        return;
      }

      // Random outcomes are intentionally non-undoable.
      const nextGame = applyMutationWithoutHistory(state.game, (game) =>
        performSingleDieRerollEngine(game, action.payload.dieIndex),
      );
      if (!nextGame) {
        setError(
          state,
          'ROLL_NOT_ALLOWED',
          'No single-die rerolls are available right now.',
        );
        return;
      }

      const deterministicDice =
        state.tutorial.active
          ? applyTutorialDeterministicSingleReroll(
              nextGame.state.turn.dice,
              action.payload.dieIndex,
              nextGame.state.turn.singleDieRerollsUsed,
              nextGame.settings,
            )
          : nextGame.state.turn.dice;
      const deterministicGame =
        deterministicDice === nextGame.state.turn.dice
          ? nextGame
          : {
              ...nextGame,
              state: {
                ...nextGame.state,
                turn: {
                  ...nextGame.state.turn,
                  dice: deterministicDice,
                  pendingChoices: countPendingChoices(
                    deterministicDice,
                    nextGame.settings,
                  ),
                },
              },
            };

      state.game = deterministicGame;
      state.lastError = null;
      const remaining = Math.max(
        0,
        rerollsAllowed - deterministicGame.state.turn.singleDieRerollsUsed,
      );
      appendLog(
        state,
        `Single-die reroll on die ${action.payload.dieIndex + 1} applied; ${remaining} remaining.`,
      );
      advanceTutorialIfCompleted(state, 'rerollSingleDie');
    },
    endTurn: (state) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before ending a turn.');
        return;
      }
      if (blockIfTutorialActionDisallowed(state, 'endTurn')) {
        return;
      }

      const activePlayer = state.game.state.players[state.game.state.activePlayerIndex];
      const overflow = calculateGoodsOverflow(
        activePlayer.goods,
        activePlayer,
        state.game.settings,
      );
      if (state.game.state.phase !== GamePhase.EndTurn) {
        setError(
          state,
          'INVALID_PHASE',
          state.game.state.phase === GamePhase.DiscardGoods && overflow > 0
            ? 'Discard goods before ending the turn.'
            : 'End turn is only available once discard checks are complete.',
        );
        return;
      }

      const beforeSnapshot = state.game.state;
      const endedGame = autoAdvanceForcedPhases(endTurnEngine(state.game));
      state.game = {
        ...endedGame,
        history: [],
        future: [],
      };
      state.lastError = null;
      if (state.game) {
        appendLog(
          state,
          `Ended turn: ${getPlayerName(
            state.game,
            beforeSnapshot.turn.activePlayerId,
          )} -> ${getPlayerName(state.game, state.game.state.turn.activePlayerId)} (${formatTurnLocation(
            state.game.state,
            state.game,
          )}).`,
          state.game,
          beforeSnapshot.turn.activePlayerId,
        );
      }
      advanceTutorialIfCompleted(state, 'endTurn');
    },
    discardGoods: (
      state,
      action: PayloadAction<{ goodsToKeepByType: Record<string, number> }>,
    ) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before discarding goods.');
        return;
      }
      if (blockIfTutorialActionDisallowed(state, 'discardGoods')) {
        return;
      }
      if (state.game.state.phase !== GamePhase.DiscardGoods) {
        setError(
          state,
          'INVALID_PHASE',
          'Goods can only be discarded during the discard phase.',
        );
        return;
      }

      const activePlayer = state.game.state.players[state.game.state.activePlayerIndex];
      const overflow = calculateGoodsOverflow(
        activePlayer.goods,
        activePlayer,
        state.game.settings,
      );
      if (overflow <= 0) {
        setError(state, 'NO_PENDING_GOODS', 'No discard is required right now.');
        return;
      }

      const validGoodsNames = new Set(
        state.game.settings.goodsTypes.map((goodsType) => goodsType.name),
      );
      const hasUnknownType = Object.keys(action.payload.goodsToKeepByType).some(
        (name) => !validGoodsNames.has(name),
      );
      if (hasUnknownType) {
        setError(state, 'UNKNOWN_GOOD', 'One or more goods types are invalid.');
        return;
      }

      let failureMessage = 'Unable to apply goods discard selection.';
      const beforeSnapshot = state.game.state;
      const nextGame = applyMutationWithHistory(state.game, (game) => {
        const player = game.state.players[game.state.activePlayerIndex];
        const goodsToKeep = new Map(
          Array.from(player.goods.keys()).map((goodsType) => [
            goodsType,
            action.payload.goodsToKeepByType[goodsType.name] ?? 0,
          ]),
        );
        const result = resolveDiscardGoods(game, goodsToKeep);
        if ('error' in result) {
          failureMessage = result.error;
          return game;
        }
        return result;
      });

      if (!nextGame) {
        setError(state, 'NO_PENDING_GOODS', failureMessage);
        return;
      }

      state.game = nextGame;
      state.lastError = null;
      const beforePlayer = beforeSnapshot.players[beforeSnapshot.activePlayerIndex];
      const afterPlayer = nextGame.state.players[nextGame.state.activePlayerIndex];
      const totalBefore = getTotalGoods(beforePlayer);
      const totalAfter = getTotalGoods(afterPlayer);
      const discarded = Math.max(0, totalBefore - totalAfter);
      appendLog(
        state,
        `Applied discard: kept ${totalAfter}/${totalBefore} goods (discarded ${discarded}), phase ${nextGame.state.phase}.`,
      );
      advanceTutorialIfCompleted(state, 'discardGoods');
    },
    keepDie: (state, action: PayloadAction<{ dieIndex: number }>) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before keeping dice.');
        return;
      }
      if (blockIfTutorialActionDisallowed(state, 'keepDie')) {
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
      const previousLockState = die?.lockDecision;
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

        return autoAdvanceForcedPhases(nextState);
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
      const currentLockState = nextGame.state.turn.dice[dieIndex]?.lockDecision;
      appendLog(
        state,
        `Die ${dieIndex + 1} lock: ${previousLockState} -> ${currentLockState} (unlocked ${countUnlockedDice(
          nextGame.state,
        )}/${nextGame.state.turn.dice.length}).`,
      );
      advanceTutorialIfCompleted(state, 'keepDie');
    },
    selectProduction: (
      state,
      action: PayloadAction<{ dieIndex: number; productionIndex: number }>,
    ) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before choosing production.');
        return;
      }
      if (blockIfTutorialActionDisallowed(state, 'selectProduction')) {
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
      const selectedProduction = dieFace.production[productionIndex];
      const currentTutorialStep = getCurrentTutorialStep(state);
      if (
        state.tutorial.active &&
        isTutorialHumanTurn(state) &&
        currentTutorialStep?.id === 'choice' &&
        selectedProduction.workers <= 0
      ) {
        setError(
          state,
          'INVALID_PRODUCTION_CHOICE',
          'Tutorial: choose the production option that provides workers.',
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

        return autoAdvanceForcedPhases(nextState);
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
      const selectedFace =
        nextGame.settings.diceFaces[nextGame.state.turn.dice[dieIndex].diceFaceIndex];
      const selectedResult = selectedFace.production[productionIndex];
      appendLog(
        state,
        `Selected die ${dieIndex + 1} option ${productionIndex + 1}: ${formatProductionSummary({
          goods: selectedResult.goods,
          food: selectedResult.food,
          workers: selectedResult.workers,
          coins: selectedResult.coins,
          skulls: selectedResult.skulls,
        })}; pending choices ${nextGame.state.turn.pendingChoices}.`,
      );
      advanceTutorialIfCompleted(state, 'selectProduction');
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

      const beforeGame = state.game;
      const beforeSnapshot = beforeGame.state;
      const beforePlayers = beforeSnapshot.players;
      const activePlayerIndex = beforeSnapshot.activePlayerIndex;
      const nextGame = applyMutationWithHistory(state.game, (game) =>
        autoAdvanceForcedPhases(resolveProductionPhase(game)),
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
      appendLog(
        state,
        `Resolved production (${formatProductionSummary(
          nextGame.state.turn.turnProduction,
        )}, food shortage ${nextGame.state.turn.foodShortage}) -> phase ${nextGame.state.phase}.`,
      );

      if (nextGame.state.turn.foodShortage > 0) {
        appendLog(
          state,
          `Food shortage: -${nextGame.state.turn.foodShortage} VP (${nextGame.state.turn.foodShortage} unfed cities).`,
        );
      }

      const skullCount = nextGame.state.turn.turnProduction.skulls;
      const triggeredDisaster = getTriggeredDisaster(skullCount, nextGame.settings);
      if (!triggeredDisaster) {
        return;
      }

      const activePlayerBefore = beforePlayers[activePlayerIndex];
      const rewrittenTargeting = getRewrittenDisasterTargeting(
        activePlayerBefore,
        triggeredDisaster.id,
        nextGame.settings,
      );
      const rewriteSource = rewrittenTargeting
        ? getDisasterRewriteSource(
            activePlayerBefore,
            triggeredDisaster.id,
            nextGame.settings,
          )
        : null;
      if (rewrittenTargeting && rewrittenTargeting !== triggeredDisaster.affectedPlayers) {
        appendLog(
          state,
          `${triggeredDisaster.name} targeting changed to ${rewrittenTargeting}${
            rewriteSource ? ` (${rewriteSource})` : ''
          }.`,
        );
      }

      const affectedIndices = getAffectedPlayerIndices(
        triggeredDisaster,
        activePlayerIndex,
        beforePlayers.length,
        activePlayerBefore,
        nextGame.settings,
      );
      if (affectedIndices.length === 0) {
        appendLog(state, `${triggeredDisaster.name}: no affected players.`);
        return;
      }

      for (const playerIndex of affectedIndices) {
        const beforePlayer = beforePlayers[playerIndex];
        const afterPlayer = nextGame.state.players[playerIndex];
        const playerName = getPlayerName(nextGame, beforePlayer.id);
        const penaltyDelta = Math.max(
          0,
          afterPlayer.disasterPenalties - beforePlayer.disasterPenalties,
        );
        const goodsLost = Math.max(0, getTotalGoods(beforePlayer) - getTotalGoods(afterPlayer));
        const goodsValueLost = Math.max(
          0,
          calculateGoodsValue(beforePlayer.goods) - calculateGoodsValue(afterPlayer.goods),
        );

        if (penaltyDelta === 0 && goodsLost === 0) {
          const hasImmunity = hasDisasterImmunity(
            beforePlayer,
            triggeredDisaster.id,
            nextGame.settings,
          );
          if (hasImmunity) {
            const immunitySource = getDisasterImmunitySource(
              beforePlayer,
              triggeredDisaster.id,
              nextGame.settings,
            );
            appendLog(
              state,
              `${triggeredDisaster.name} ignored for ${playerName}${
                immunitySource ? ` (${immunitySource})` : ''
              }.`,
            );
          } else {
            appendLog(state, `${triggeredDisaster.name} had no effect on ${playerName}.`);
          }
          continue;
        }

        const effectParts: string[] = [];
        if (penaltyDelta > 0) {
          effectParts.push(`-${penaltyDelta} VP`);
        }
        if (goodsLost > 0) {
          effectParts.push(`goods cleared (${goodsLost} lost, ${goodsValueLost} coin value)`);
        }
        appendLog(
          state,
          `${triggeredDisaster.name} affected ${playerName}: ${effectParts.join(', ')}.`,
        );
      }
    },
    buildCity: (state, action: PayloadAction<{ cityIndex: number }>) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before building cities.');
        return;
      }
      if (blockIfTutorialActionDisallowed(state, 'buildCity')) {
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

      const workersBefore = state.game.state.turn.turnProduction.workers;
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
            : getNextPostDevelopmentPhase(game, player, turn);

        return autoAdvanceForcedPhases({
          ...game,
          state: {
            ...game.state,
            phase,
            players,
            turn,
          },
        });
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
      const activePlayer = nextGame.state.players[nextGame.state.activePlayerIndex];
      const cityIndex = action.payload.cityIndex;
      const cityProgress = activePlayer.cities[cityIndex];
      const workerCost = getCityWorkerCost(cityIndex, nextGame.settings);
      const workersAfter = nextGame.state.turn.turnProduction.workers;
      const workersUsed = Math.max(0, workersBefore - workersAfter);
      const progressText = cityProgress.completed
        ? 'built'
        : `${cityProgress.workersCommitted}/${workerCost}`;
      appendLog(
        state,
        `Built city ${cityIndex + 1}: used ${workersUsed} worker${
          workersUsed === 1 ? '' : 's'
        }, now ${progressText}.`,
      );
      advanceTutorialIfCompleted(state, 'buildCity');
    },
    buildMonument: (state, action: PayloadAction<{ monumentId: string }>) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before building monuments.');
        return;
      }
      if (blockIfTutorialActionDisallowed(state, 'buildMonument')) {
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

      const workersBefore = state.game.state.turn.turnProduction.workers;
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
            : getNextPostDevelopmentPhase(game, player, turn);

        return autoAdvanceForcedPhases({
          ...game,
          state: {
            ...game.state,
            phase,
            players,
            turn,
          },
        });
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
      const activePlayer = nextGame.state.players[nextGame.state.activePlayerIndex];
      const monumentId = action.payload.monumentId;
      const progress = activePlayer.monuments[monumentId];
      const monumentDefinition = nextGame.settings.monumentDefinitions.find(
        (monument) => monument.id === monumentId,
      );
      const workerCost = monumentDefinition?.requirements.workerCost ?? 0;
      const workersAfter = nextGame.state.turn.turnProduction.workers;
      const workersUsed = Math.max(0, workersBefore - workersAfter);
      const progressText = progress.completed
        ? 'completed'
        : `${progress.workersCommitted}/${workerCost}`;
      appendLog(
        state,
        `Built monument ${
          monumentDefinition?.requirements.name ?? monumentId
        }: used ${workersUsed} worker${
          workersUsed === 1 ? '' : 's'
        }, now ${progressText}.`,
      );
      advanceTutorialIfCompleted(state, 'buildMonument');
    },
    buyDevelopment: (
      state,
      action: PayloadAction<{ developmentId: string; goodsTypeNames: string[] }>,
    ) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before buying developments.');
        return;
      }
      if (blockIfTutorialActionDisallowed(state, 'buyDevelopment')) {
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
      if (state.game.state.turn.developmentPurchased) {
        setError(
          state,
          'INVALID_PHASE',
          'Only one development can be purchased each turn.',
        );
        return;
      }

      let failureCode: GameActionErrorCode = 'DEVELOPMENT_NOT_AFFORDABLE';
      let failureMessage =
        'That development purchase is not valid with current coins/goods.';

      const coinsBefore = state.game.state.turn.turnProduction.coins;
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
        return autoAdvanceForcedPhases({
          ...game,
          state: {
            ...game.state,
            phase: getPostDevelopmentCompletionPhase(result.player, game),
            players,
            turn: {
              ...result.turn,
              developmentPurchased: true,
            },
          },
        });
      });

      if (!nextGame) {
        setError(state, failureCode, failureMessage);
        return;
      }

      state.game = nextGame;
      state.lastError = null;
      const activePlayer = nextGame.state.players[nextGame.state.activePlayerIndex];
      const purchasedDevelopment = nextGame.settings.developmentDefinitions.find(
        (development) => development.id === action.payload.developmentId,
      );
      const coinsAfter = nextGame.state.turn.turnProduction.coins;
      const spentGoodsText =
        action.payload.goodsTypeNames.length > 0
          ? action.payload.goodsTypeNames.join(', ')
          : 'none';
      appendLog(
        state,
        `Purchased development ${purchasedDevelopment?.name ?? action.payload.developmentId}: spent ${Math.max(
          0,
          coinsBefore - coinsAfter,
        )} coins, goods spent ${spentGoodsText}; total developments ${activePlayer.developments.length}.`,
      );
      advanceTutorialIfCompleted(state, 'buyDevelopment');
    },
    skipDevelopment: (state) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before skipping development.');
        return;
      }
      if (blockIfTutorialActionDisallowed(state, 'skipDevelopment')) {
        return;
      }
      if (state.game.state.phase !== GamePhase.Development) {
        setError(
          state,
          'INVALID_PHASE',
          'Development can only be skipped during the development phase.',
        );
        return;
      }

      const nextGame = applyMutationWithHistory(state.game, (game) => {
        const activePlayer = game.state.players[game.state.activePlayerIndex];
        const nextPhase = getPostDevelopmentCompletionPhase(activePlayer, game);
        if (nextPhase === game.state.phase) {
          return game;
        }

        return autoAdvanceForcedPhases({
          ...game,
          state: {
            ...game.state,
            phase: nextPhase,
          },
        });
      });

      if (!nextGame) {
        setError(
          state,
          'INVALID_PHASE',
          'Development can only be skipped during the development phase.',
        );
        return;
      }

      state.game = nextGame;
      state.lastError = null;
      appendLog(state, `Skipped development purchases -> phase ${nextGame.state.phase}.`);
      advanceTutorialIfCompleted(state, 'skipDevelopment');
    },
    applyExchange: (
      state,
      action: PayloadAction<{ from: string; to: string; amount: number }>,
    ) => {
      if (!state.game) {
        setError(state, 'NO_GAME', 'Start a game before applying exchanges.');
        return;
      }
      if (blockIfTutorialActionDisallowed(state, 'applyExchange')) {
        return;
      }
      if (
        state.game.state.phase !== GamePhase.Build &&
        state.game.state.phase !== GamePhase.Development
      ) {
        setError(
          state,
          'INVALID_PHASE',
          'Exchanges are only available during build/development.',
        );
        return;
      }
      if (!Number.isFinite(action.payload.amount) || action.payload.amount <= 0) {
        setError(state, 'INVALID_EXCHANGE', 'Exchange amount must be at least 1.');
        return;
      }

      const exchangeAmount = Math.floor(action.payload.amount);
      const beforePlayer = state.game.state.players[state.game.state.activePlayerIndex];
      const beforeTurn = state.game.state.turn;
      const sourceBefore = getExchangeResourceAmount(
        beforePlayer,
        beforeTurn,
        state.game.settings,
        action.payload.from,
      );
      const targetBefore = getExchangeResourceAmount(
        beforePlayer,
        beforeTurn,
        state.game.settings,
        action.payload.to,
      );
      const nextGame = applyMutationWithHistory(state.game, (game) => {
        const activeIndex = game.state.activePlayerIndex;
        const activePlayer = game.state.players[activeIndex];
        const result = exchangeResourcesEngine(
          activePlayer,
          game.state.turn,
          action.payload.from,
          action.payload.to,
          exchangeAmount,
          game.settings,
        );
        if (!result) {
          return game;
        }
        const players = [...game.state.players];
        players[activeIndex] = result.player;
        return autoAdvanceForcedPhases({
          ...game,
          state: {
            ...game.state,
            phase: getNextPostDevelopmentPhase(game, result.player, result.turn),
            players,
            turn: result.turn,
          },
        });
      });

      if (!nextGame) {
        setError(
          state,
          'INVALID_EXCHANGE',
          'That exchange is not valid with current resources.',
        );
        return;
      }

      state.game = nextGame;
      state.lastError = null;
      const activePlayer = nextGame.state.players[nextGame.state.activePlayerIndex];
      const targetAfter = getExchangeResourceAmount(
        activePlayer,
        nextGame.state.turn,
        nextGame.settings,
        action.payload.to,
      );
      const sourceAfter = getExchangeResourceAmount(
        activePlayer,
        nextGame.state.turn,
        nextGame.settings,
        action.payload.from,
      );
      appendLog(
        state,
        `Exchanged ${exchangeAmount} ${action.payload.from} -> ${action.payload.to} (source ${sourceBefore}->${sourceAfter}, target ${targetBefore}->${targetAfter}).`,
      );
      advanceTutorialIfCompleted(state, 'applyExchange');
    },
    addTestingResources: (
      state,
      action: PayloadAction<{ workers?: number; coins?: number }>,
    ) => {
      if (!state.game) {
        setError(
          state,
          'NO_GAME',
          'Start a game before applying testing resources.',
        );
        return;
      }

      const workersToAdd = Math.max(0, Math.floor(action.payload.workers ?? 0));
      const coinsToAdd = Math.max(0, Math.floor(action.payload.coins ?? 0));
      if (workersToAdd <= 0 && coinsToAdd <= 0) {
        return;
      }

      const nextGame = applyMutationWithHistory(state.game, (game) => ({
        ...game,
        state: {
          ...game.state,
          turn: {
            ...game.state.turn,
            turnProduction: {
              ...game.state.turn.turnProduction,
              workers: game.state.turn.turnProduction.workers + workersToAdd,
              coins: game.state.turn.turnProduction.coins + coinsToAdd,
            },
          },
        },
      }));

      if (!nextGame) {
        return;
      }

      state.game = nextGame;
      state.lastError = null;
      appendLog(
        state,
        `Testing resources added: +${workersToAdd} workers, +${coinsToAdd} coins.`,
      );
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

      const beforeSnapshot = state.game.state;
      state.game = nextGame;
      state.lastError = null;
      appendLog(
        state,
        `Undo: ${formatTurnLocation(beforeSnapshot, state.game)} -> ${formatTurnLocation(
          state.game.state,
          state.game,
        )}.`,
      );
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

      const beforeSnapshot = state.game.state;
      state.game = nextGame;
      state.lastError = null;
      appendLog(
        state,
        `Redo: ${formatTurnLocation(beforeSnapshot, state.game)} -> ${formatTurnLocation(
          state.game.state,
          state.game,
        )}.`,
      );
    },
  },
});

export const {
  returnToSetup,
  startGame,
  startTutorialGame,
  advanceTutorialStep,
  exitTutorial,
  rollDice,
  rerollSingleDie,
  endTurn,
  keepDie,
  selectProduction,
  resolveProduction,
  buildCity,
  buildMonument,
  buyDevelopment,
  skipDevelopment,
  applyExchange,
  addTestingResources,
  discardGoods,
  undo,
  redo,
} = gameSlice.actions;
export const gameReducer = gameSlice.reducer;

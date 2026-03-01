import { describe, expect, it } from 'vitest';
import {
  advanceTutorialStep,
  buildCity,
  endTurn,
  keepDie,
  rollDice,
  selectProduction,
  startGame,
  startTutorialGame,
} from '@/store/gameSlice';
import { createAppStore } from '@/store/store';

describe('tutorial single-game integration', () => {
  it('completes the full 20-step scripted tutorial in one run', () => {
    const store = createAppStore();
    store.dispatch(startTutorialGame());

    const getSlice = () => store.getState().game;
    const getGame = () => {
      const game = getSlice().game;
      if (!game) {
        throw new Error('Expected tutorial game to be active.');
      }
      return game;
    };

    // Step 1: intro -> continue
    expect(getSlice().tutorial.currentStepIndex).toBe(0);
    store.dispatch(advanceTutorialStep());
    expect(getSlice().tutorial.currentStepIndex).toBe(1);

    // Step 2: roll
    store.dispatch(rollDice());
    expect(getSlice().tutorial.currentStepIndex).toBe(2);

    // Step 3: lock one non-skull die
    const lockableDieIndex = getGame().state.turn.dice.findIndex(
      (die) => die.lockDecision !== 'skull' && die.lockDecision === 'unlocked',
    );
    expect(lockableDieIndex).toBeGreaterThanOrEqual(0);
    store.dispatch(keepDie({ dieIndex: lockableDieIndex }));
    expect(getSlice().tutorial.currentStepIndex).toBe(3);

    // Step 4: reroll (skull die remains locked)
    store.dispatch(rollDice());
    expect(getSlice().tutorial.currentStepIndex).toBe(4);

    // Step 5: choose worker-producing die face
    const gameForChoice = getGame();
    const pendingDieIndex = gameForChoice.state.turn.dice.findIndex(
      (die) => die.productionIndex < 0,
    );
    expect(pendingDieIndex).toBeGreaterThanOrEqual(0);
    const pendingDie = gameForChoice.state.turn.dice[pendingDieIndex];
    const face = gameForChoice.settings.diceFaces[pendingDie.diceFaceIndex];
    const workerOptionIndex = face.production.findIndex(
      (production) => production.workers > 0,
    );
    expect(workerOptionIndex).toBeGreaterThanOrEqual(0);
    store.dispatch(
      selectProduction({
        dieIndex: pendingDieIndex,
        productionIndex: workerOptionIndex,
      }),
    );
    expect(getSlice().tutorial.currentStepIndex).toBe(5);

    // Steps 6-9: informational continue steps
    store.dispatch(advanceTutorialStep());
    store.dispatch(advanceTutorialStep());
    store.dispatch(advanceTutorialStep());
    store.dispatch(advanceTutorialStep());
    expect(getSlice().tutorial.currentStepIndex).toBe(9);

    // Step 10: build
    const buildGame = getGame();
    const buildCityIndex = buildGame.state.players[
      buildGame.state.activePlayerIndex
    ].cities.findIndex((city) => !city.completed);
    expect(buildCityIndex).toBeGreaterThanOrEqual(0);
    store.dispatch(buildCity({ cityIndex: buildCityIndex }));
    expect(getSlice().tutorial.currentStepIndex).toBe(10);

    // Steps 11-15: informational continue steps
    store.dispatch(advanceTutorialStep());
    store.dispatch(advanceTutorialStep());
    store.dispatch(advanceTutorialStep());
    store.dispatch(advanceTutorialStep());
    store.dispatch(advanceTutorialStep());
    expect(getSlice().tutorial.currentStepIndex).toBe(15);

    // Step 16: end turn
    store.dispatch(endTurn());
    expect(getSlice().tutorial.currentStepIndex).toBe(16);

    // Steps 17-20: informational continue steps
    store.dispatch(advanceTutorialStep());
    store.dispatch(advanceTutorialStep());
    store.dispatch(advanceTutorialStep());
    expect(getSlice().tutorial.currentStepIndex).toBe(19);

    // Final continue dismisses tutorial overlay while keeping the game running.
    store.dispatch(advanceTutorialStep());
    expect(getSlice().tutorial.currentStepIndex).toBe(19);
    expect(getSlice().tutorial.active).toBe(false);
    expect(getSlice().game).not.toBeNull();
    expect(getSlice().lastError).toBeNull();
  });

  it('keeps standard game mode independent from tutorial mode', () => {
    const store = createAppStore();
    store.dispatch(startTutorialGame());
    store.dispatch(advanceTutorialStep());
    expect(store.getState().game.tutorial.active).toBe(true);

    store.dispatch(
      startGame({
        players: [
          { id: 'p1', name: 'Player 1', controller: 'human' },
          { id: 'p2', name: 'Player 2', controller: 'human' },
        ],
      }),
    );

    const slice = store.getState().game;
    expect(slice.tutorial.active).toBe(false);
    expect(slice.tutorial.currentStepIndex).toBe(0);
    expect(slice.game).not.toBeNull();
    expect(slice.game?.settings.players.map((player) => player.id)).toEqual([
      'p1',
      'p2',
    ]);
    expect(slice.game?.state.turn.activePlayerId).toBe('p1');
  });
});

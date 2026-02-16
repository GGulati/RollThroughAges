import { describe, it, expect, vi } from 'vitest';
import { GamePhase } from '../../game/game';
import {
  createGame,
  advancePhase,
  getNextPhase,
  endTurn,
  performRoll,
  isGameOver,
  getGameStatus,
  updateActivePlayer,
  updateTurn,
  saveToHistory,
  undo,
  redo,
} from '../../game/engine/gameEngine';
import { keepDie, selectProduction } from '../../game/engine/diceEngine';
import { allocateWorkersToCity, allocateWorkersToMonument } from '../../game/engine/buildEngine';
import { purchaseDevelopment } from '../../game/engine/developmentEngine';
import { allocateSingleGood } from '../../game/engine/productionEngine';
import { DICE_FACE, getPlayerGoods } from '../testUtils';
import { setGoodsQuantity } from '../../game/engine/goodsEngine';

describe('Game Flow Integration Tests', () => {
  describe('Phase Transitions', () => {
    it('follows correct phase order', () => {
      expect(getNextPhase(GamePhase.RollDice)).toBe(GamePhase.DecideDice);
      expect(getNextPhase(GamePhase.DecideDice)).toBe(GamePhase.ResolveProduction);
      expect(getNextPhase(GamePhase.ResolveProduction)).toBe(GamePhase.Build);
      expect(getNextPhase(GamePhase.Build)).toBe(GamePhase.Development);
      expect(getNextPhase(GamePhase.Development)).toBe(GamePhase.DiscardGoods);
      expect(getNextPhase(GamePhase.DiscardGoods)).toBe(GamePhase.EndTurn);
      expect(getNextPhase(GamePhase.EndTurn)).toBe(GamePhase.RollDice);
    });

    it('advances through all phases', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      expect(game.state.phase).toBe(GamePhase.RollDice);

      game = advancePhase(game);
      expect(game.state.phase).toBe(GamePhase.DecideDice);

      game = advancePhase(game);
      expect(game.state.phase).toBe(GamePhase.ResolveProduction);

      game = advancePhase(game);
      expect(game.state.phase).toBe(GamePhase.Build);

      game = advancePhase(game);
      expect(game.state.phase).toBe(GamePhase.Development);

      // DiscardGoods may be skipped if no overflow
      game = advancePhase(game);
      // Could be DiscardGoods or EndTurn depending on goods
      expect([GamePhase.DiscardGoods, GamePhase.EndTurn]).toContain(game.state.phase);
    });

    it('does not increment rolls when phase cycles to roll dice', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      game = advancePhase(game); // DecideDice
      game = advancePhase(game); // ResolveProduction
      game = advancePhase(game); // Build
      game = advancePhase(game); // Development
      game = advancePhase(game); // DiscardGoods/EndTurn
      if (game.state.phase === GamePhase.DiscardGoods) {
        game = advancePhase(game); // EndTurn
      }
      game = advancePhase(game); // RollDice

      expect(game.state.phase).toBe(GamePhase.RollDice);
      expect(game.state.turn.rollsUsed).toBe(1);
    });
  });

  describe('Two-Player Turn Cycle', () => {
    it('alternates between players', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      expect(game.state.activePlayerIndex).toBe(0);
      expect(game.state.turn.activePlayerId).toBe('p1');

      game = endTurn(game);
      expect(game.state.activePlayerIndex).toBe(1);
      expect(game.state.turn.activePlayerId).toBe('p2');

      game = endTurn(game);
      expect(game.state.activePlayerIndex).toBe(0);
      expect(game.state.turn.activePlayerId).toBe('p1');
      expect(game.state.round).toBe(2);
    });

    it('increments round when returning to first player', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      expect(game.state.round).toBe(1);

      game = endTurn(game); // P2's turn
      expect(game.state.round).toBe(1);

      game = endTurn(game); // Back to P1, new round
      expect(game.state.round).toBe(2);
    });

    it('starts each new turn with one automatic roll used', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      game = performRoll(game);
      expect(game.state.turn.rollsUsed).toBe(2);

      game = endTurn(game);
      expect(game.state.turn.rollsUsed).toBe(1);
    });
  });

  describe('Full Turn Simulation', () => {
    it('simulates a complete player turn with all phases', () => {
      // Mock dice to get predictable results
      vi.spyOn(Math, 'random').mockImplementation(() => 0.6); // Should give food dice

      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      // Phase 1: RollDice - first roll is automatic at turn start
      expect(game.state.phase).toBe(GamePhase.RollDice);
      expect(game.state.turn.rollsUsed).toBe(1);
      expect(game.state.turn.dice.length).toBe(3); // 3 starting cities = 3 dice

      // Perform first reroll
      game = performRoll(game);
      expect(game.state.turn.rollsUsed).toBe(2);

      // Keep all dice (lock them)
      game = updateTurn(game, (turn) => ({
        ...turn,
        dice: turn.dice.map((die) => ({ ...die, lockDecision: 'kept' })),
      }));

      // Phase 2: DecideDice
      game = advancePhase(game);
      expect(game.state.phase).toBe(GamePhase.DecideDice);

      // Phase 3: ResolveProduction
      game = advancePhase(game);
      expect(game.state.phase).toBe(GamePhase.ResolveProduction);

      // Phase 4: Build
      game = advancePhase(game);
      expect(game.state.phase).toBe(GamePhase.Build);

      // Phase 5: Development
      game = advancePhase(game);
      expect(game.state.phase).toBe(GamePhase.Development);

      // Phase 6: DiscardGoods / EndTurn
      game = advancePhase(game);

      // End turn
      if (game.state.phase === GamePhase.DiscardGoods) {
        game = advancePhase(game);
      }

      expect(game.state.phase).toBe(GamePhase.EndTurn);

      vi.restoreAllMocks();
    });

    it('handles dice rolling and locking', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      // First reroll
      game = performRoll(game);
      expect(game.state.turn.rollsUsed).toBe(2);

      // Lock first die
      game = updateTurn(game, (turn) => ({
        ...turn,
        dice: keepDie(turn.dice, 0),
      }));

      expect(game.state.turn.dice[0].lockDecision).toBe('kept');

      // Second reroll
      game = performRoll(game);
      expect(game.state.turn.rollsUsed).toBe(3);

      // First die should still be locked
      expect(game.state.turn.dice[0].lockDecision).toBe('kept');

      vi.restoreAllMocks();
    });

    it('handles production choices for multi-option dice', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      // Set up dice with food/workers choice
      game = updateTurn(game, (turn) => ({
        ...turn,
        dice: [
          { diceFaceIndex: DICE_FACE.FOOD_OR_WORKERS, productionIndex: 0, lockDecision: 'kept' },
        ],
      }));

      // Select workers instead of food (index 1)
      game = updateTurn(game, (turn) => ({
        ...turn,
        dice: selectProduction(turn.dice, 0, 1, game.settings),
      }));

      expect(game.state.turn.dice[0].productionIndex).toBe(1);
    });
  });

  describe('Building and Development', () => {
    it('allows building cities with workers', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      // Give player workers
      game = updateTurn(game, (turn) => ({
        ...turn,
        turnProduction: { ...turn.turnProduction, workers: 10 },
      }));

      const { player: newPlayer, workersUsed } = allocateWorkersToCity(
        game.state.players[0],
        3, // First unbuild city
        10,
        game.settings
      );

      expect(workersUsed).toBeGreaterThan(0);
      expect(newPlayer.cities[3].workersCommitted).toBeGreaterThanOrEqual(0);
    });

    it('allows building monuments', () => {
      const game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      const monument = game.settings.monumentDefinitions[0];
      const { player: newPlayer, workersUsed } = allocateWorkersToMonument(
        game.state.players[0],
        monument.id,
        2,
        game.state.players,
        game.settings
      );

      expect(workersUsed).toBe(2);
      expect(newPlayer.monuments[monument.id].workersCommitted).toBe(2);
    });

    it('allows purchasing developments', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      // Give player enough coins
      game = updateTurn(game, (turn) => ({
        ...turn,
        turnProduction: { ...turn.turnProduction, coins: 100 },
      }));

      const cheapDev = game.settings.developmentDefinitions.find((d) => d.cost <= 20);
      if (cheapDev) {
        // No goods needed when coins cover the cost
        const result = purchaseDevelopment(
          game.state.players[0],
          game.state.turn,
          cheapDev.id,
          [],
          game.settings
        );

        expect(result).not.toHaveProperty('error');
        if ('error' in result) {
          throw new Error(`Expected purchase success, got error: ${result.error}`);
        }
        expect(result.player.developments).toContain(cheapDev.id);
      }
    });
  });

  describe('Game End Conditions', () => {
    it('detects game over by rounds', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      expect(isGameOver(game)).toBe(false);

      // Simulate reaching round limit
      game = {
        ...game,
        state: { ...game.state, round: game.settings.endCondition.numRounds! + 1 },
      };

      expect(isGameOver(game)).toBe(true);
    });

    it('detects game over by development count', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      // Give player enough developments
      const devCount = game.settings.endCondition.numDevelopments!;
      const devIds = game.settings.developmentDefinitions.slice(0, devCount).map((d) => d.id);

      game = updateActivePlayer(game, (player) => ({
        ...player,
        developments: devIds,
      }));

      expect(isGameOver(game)).toBe(true);
    });

    it('detects game over by monument count', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      // Complete enough monuments
      const monumentCount = game.settings.endCondition.numMonuments!;
      const monuments = game.settings.monumentDefinitions.slice(0, monumentCount);
      const completedMonuments: Record<string, { workersCommitted: number; completed: boolean }> = {};

      for (const m of monuments) {
        completedMonuments[m.id] = { workersCommitted: m.requirements.workerCost, completed: true };
      }

      game = updateActivePlayer(game, (player) => ({
        ...player,
        monuments: { ...player.monuments, ...completedMonuments },
      }));

      expect(isGameOver(game)).toBe(true);
    });

    it('waits for turn parity when a mid-round threshold is reached', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
        { id: 'p3', name: 'Player 3', controller: 'human' },
        { id: 'p4', name: 'Player 4', controller: 'human' },
      ]);

      // Move to Player 2 turn start.
      game = endTurn(game);
      expect(game.state.activePlayerIndex).toBe(1);

      const devCount = game.settings.endCondition.numDevelopments!;
      const devIds = game.settings.developmentDefinitions
        .slice(0, devCount)
        .map((d) => d.id);
      game = updateActivePlayer(game, (player) => ({
        ...player,
        developments: devIds,
      }));

      // Trigger reached by Player 2, but Player 3 and 4 still get final turns.
      expect(isGameOver(game)).toBe(false);
      game = endTurn(game); // P2 -> P3
      expect(isGameOver(game)).toBe(false);
      game = endTurn(game); // P3 -> P4
      expect(isGameOver(game)).toBe(false);
      game = endTurn(game); // P4 -> P1 (parity restored)
      expect(isGameOver(game)).toBe(true);
    });
  });

  describe('Score Updates', () => {
    it('updates scores at end of turn', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      // Complete a monument for points
      const monument = game.settings.monumentDefinitions[0];
      game = updateActivePlayer(game, (player) => ({
        ...player,
        monuments: {
          ...player.monuments,
          [monument.id]: { workersCommitted: monument.requirements.workerCost, completed: true },
        },
      }));

      // End turn should update scores
      game = endTurn(game);

      // Check that player 1 has points (they're now at index 0 since we went back)
      const player1 = game.state.players.find((p) => p.id === 'p1');
      expect(player1!.score).toBeGreaterThan(0);
    });
  });

  describe('History and Undo/Redo', () => {
    it('saves state to history', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      expect(game.history.length).toBe(0);

      game = saveToHistory(game);
      expect(game.history.length).toBe(1);
    });

    it('supports undo operation', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      const originalPhase = game.state.phase;
      game = saveToHistory(game);
      game = advancePhase(game);

      expect(game.state.phase).not.toBe(originalPhase);

      const undone = undo(game);
      expect(undone).not.toBeNull();
      expect(undone!.state.phase).toBe(originalPhase);
    });

    it('supports redo operation', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      game = saveToHistory(game);
      const advancedGame = advancePhase(game);
      const newPhase = advancedGame.state.phase;

      const undone = undo(advancedGame);
      expect(undone).not.toBeNull();

      const redone = redo(undone!);
      expect(redone).not.toBeNull();
      expect(redone!.state.phase).toBe(newPhase);
    });

    it('returns null when nothing to undo', () => {
      const game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      expect(undo(game)).toBeNull();
    });

    it('returns null when nothing to redo', () => {
      const game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      expect(redo(game)).toBeNull();
    });

    it('preserves goods Map behavior through undo/redo', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      game = updateActivePlayer(game, (player) => ({
        ...player,
        goods: setGoodsQuantity(player.goods, 'Wood', 3),
      }));

      expect(getPlayerGoods(game.state.players[0], 'Wood', game.settings)).toBe(3);

      game = saveToHistory(game);
      game = updateActivePlayer(game, (player) => ({
        ...player,
        goods: setGoodsQuantity(player.goods, 'Wood', 5),
      }));

      const undone = undo(game)!;
      expect(getPlayerGoods(undone.state.players[0], 'Wood', game.settings)).toBe(3);

      const redone = redo(undone)!;
      expect(getPlayerGoods(redone.state.players[0], 'Wood', game.settings)).toBe(5);
    });
  });

  describe('Multi-Turn Game Flow', () => {
    it('plays multiple turns across both players', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.8); // Predictable dice

      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      // Play 4 complete turns (2 rounds)
      for (let i = 0; i < 4; i++) {
        const startingPlayer = game.state.activePlayerIndex;

        // Lock all dice
        game = updateTurn(game, (turn) => ({
          ...turn,
          dice: turn.dice.map((die) => ({ ...die, lockDecision: 'kept' })),
        }));

        // Advance through phases
        game = advancePhase(game); // DecideDice
        game = advancePhase(game); // ResolveProduction
        game = advancePhase(game); // Build
        game = advancePhase(game); // Development
        game = advancePhase(game); // DiscardGoods or EndTurn

        if (game.state.phase === GamePhase.DiscardGoods) {
          game = advancePhase(game); // EndTurn
        }

        // End turn
        game = endTurn(game);

        // Verify player switched
        expect(game.state.activePlayerIndex).not.toBe(startingPlayer);
      }

      // After 4 turns, should be round 3
      expect(game.state.round).toBe(3);

      vi.restoreAllMocks();
    });
  });

  describe('Game Status', () => {
    it('provides correct status summary', () => {
      const game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      const status = getGameStatus(game);

      expect(status.round).toBe(1);
      expect(status.phase).toBe(GamePhase.RollDice);
      expect(status.activePlayerIndex).toBe(0);
      expect(status.activePlayerId).toBe('p1');
      expect(status.isGameOver).toBe(false);
    });
  });

  describe('Goods Allocation', () => {
    it('allocates goods production correctly', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      // Give pending goods
      game = updateTurn(game, (turn) => ({
        ...turn,
        turnProduction: { ...turn.turnProduction, goods: 5 },
      }));

      const { player, turn } = allocateSingleGood(
        game.state.players[0],
        game.state.turn,
        'Wood',
        game.settings
      );

      const woodType = game.settings.goodsTypes.find((g) => g.name === 'Wood')!;
      expect(player.goods.get(woodType)).toBe(1);
      expect(turn.turnProduction.goods).toBe(4);
    });
  });

  describe('Leadership Roll Limit', () => {
    it('does not allow extra full rolls for players with Leadership', () => {
      let game = createGame([
        { id: 'p1', name: 'Player 1', controller: 'human' },
        { id: 'p2', name: 'Player 2', controller: 'human' },
      ]);

      game = updateActivePlayer(game, (player) => ({
        ...player,
        developments: [...player.developments, 'leadership'],
      }));

      for (let i = 0; i < 4; i++) {
        game = updateTurn(game, (turn) => ({
          ...turn,
          dice: turn.dice.map((die) => ({ ...die, lockDecision: 'unlocked' })),
        }));
        game = performRoll(game);
      }

      expect(game.state.turn.rollsUsed).toBe(game.settings.maxDiceRolls);
    });
  });
});

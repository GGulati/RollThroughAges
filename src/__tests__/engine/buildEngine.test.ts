import { describe, it, expect } from 'vitest';
import {
  getNextCityToBuild,
  getCityWorkerCost,
  getRemainingCityWorkers,
  allocateWorkersToCity,
  getAvailableMonuments,
  canBuildMonument,
  hasStartedMonument,
  getRemainingMonumentWorkers,
  allocateWorkersToMonument,
  isFirstToCompleteMonument,
  getCompletedCityCount,
  getCompletedMonumentCount,
  getCompletedMonuments,
  getBuildOptions,
  spendWorkers,
} from '../../game/engine/buildEngine';
import {
  createTestSettings,
  createTestPlayer,
  createTestTurn,
} from '../testUtils';

describe('buildEngine', () => {
  const settings = createTestSettings(2);

  describe('getNextCityToBuild', () => {
    it('returns first incomplete city index', () => {
      const player = createTestPlayer('p1', settings);
      // Player has 3 completed cities, next is index 3
      expect(getNextCityToBuild(player)).toBe(3);
    });

    it('returns null when all cities are built', () => {
      const player = createTestPlayer('p1', settings);
      // Complete all cities
      player.cities = player.cities.map(() => ({ workersCommitted: 0, completed: true }));
      expect(getNextCityToBuild(player)).toBeNull();
    });
  });

  describe('getCityWorkerCost', () => {
    it('returns 0 for starting cities', () => {
      expect(getCityWorkerCost(0, settings)).toBe(0);
      expect(getCityWorkerCost(1, settings)).toBe(0);
      expect(getCityWorkerCost(2, settings)).toBe(0);
    });

    it('returns correct cost for buildable cities', () => {
      // City index 3 is the first buildable city (index 0 in cityDefinitions)
      const cost = getCityWorkerCost(3, settings);
      expect(cost).toBeGreaterThan(0);
    });
  });

  describe('getRemainingCityWorkers', () => {
    it('returns 0 for completed city', () => {
      const player = createTestPlayer('p1', settings);
      expect(getRemainingCityWorkers(player, 0, settings)).toBe(0);
    });

    it('returns full cost for untouched city', () => {
      const player = createTestPlayer('p1', settings);
      const cityIndex = 3;
      const cost = getCityWorkerCost(cityIndex, settings);
      expect(getRemainingCityWorkers(player, cityIndex, settings)).toBe(cost);
    });

    it('returns remaining after partial progress', () => {
      const player = createTestPlayer('p1', settings);
      const cityIndex = 3;
      player.cities[cityIndex] = { workersCommitted: 2, completed: false };

      const cost = getCityWorkerCost(cityIndex, settings);
      expect(getRemainingCityWorkers(player, cityIndex, settings)).toBe(cost - 2);
    });
  });

  describe('allocateWorkersToCity', () => {
    it('allocates workers to an incomplete city', () => {
      const player = createTestPlayer('p1', settings);
      const cityIndex = 3;

      const { player: newPlayer, workersUsed } = allocateWorkersToCity(
        player,
        cityIndex,
        2,
        settings
      );

      expect(workersUsed).toBe(2);
      expect(newPlayer.cities[cityIndex].workersCommitted).toBe(2);
    });

    it('completes city when enough workers allocated', () => {
      const player = createTestPlayer('p1', settings);
      const cityIndex = 3;
      const cost = getCityWorkerCost(cityIndex, settings);

      const { player: newPlayer, workersUsed } = allocateWorkersToCity(
        player,
        cityIndex,
        cost + 10, // More than needed
        settings
      );

      expect(workersUsed).toBe(cost);
      expect(newPlayer.cities[cityIndex].completed).toBe(true);
      expect(newPlayer.cities[cityIndex].workersCommitted).toBe(0);
    });

    it('does nothing for already completed city', () => {
      const player = createTestPlayer('p1', settings);

      const { player: newPlayer, workersUsed } = allocateWorkersToCity(
        player,
        0, // Already completed
        5,
        settings
      );

      expect(workersUsed).toBe(0);
      expect(newPlayer).toEqual(player);
    });

    it('does not allow allocating to a later city before the next city', () => {
      const player = createTestPlayer('p1', settings);

      const { player: newPlayer, workersUsed } = allocateWorkersToCity(
        player,
        4,
        3,
        settings
      );

      expect(workersUsed).toBe(0);
      expect(newPlayer).toEqual(player);
    });
  });

  describe('getAvailableMonuments', () => {
    it('returns monuments available for player count', () => {
      const monuments = getAvailableMonuments(2, settings);
      expect(monuments.length).toBeGreaterThan(0);
    });

    it('includes player-count-restricted monuments when count is high enough', () => {
      const monuments4 = getAvailableMonuments(4, settings);
      const monuments2 = getAvailableMonuments(2, settings);
      // 4 player games might have more monuments available
      expect(monuments4.length).toBeGreaterThanOrEqual(monuments2.length);
    });
  });

  describe('canBuildMonument', () => {
    it('returns true when no one has built the monument', () => {
      const players = [
        createTestPlayer('p1', settings),
        createTestPlayer('p2', settings),
      ];
      const monumentId = settings.monumentDefinitions[0].id;

      expect(canBuildMonument(monumentId, players[0], players)).toBe(true);
    });

    it('returns true when another player completed the monument', () => {
      const players = [
        createTestPlayer('p1', settings),
        createTestPlayer('p2', settings),
      ];
      const monumentId = settings.monumentDefinitions[0].id;

      // Player 2 completed the monument
      players[1].monuments[monumentId] = { workersCommitted: 10, completed: true };

      expect(canBuildMonument(monumentId, players[0], players)).toBe(true);
    });

    it('returns false when the same player already completed the monument', () => {
      const players = [createTestPlayer('p1', settings)];
      const monumentId = settings.monumentDefinitions[0].id;

      players[0].monuments[monumentId] = { workersCommitted: 10, completed: true };

      expect(canBuildMonument(monumentId, players[0], players)).toBe(false);
    });
  });

  describe('hasStartedMonument', () => {
    it('returns false when no progress', () => {
      const player = createTestPlayer('p1', settings);
      const monumentId = settings.monumentDefinitions[0].id;

      expect(hasStartedMonument(player, monumentId)).toBe(false);
    });

    it('returns true when workers are committed', () => {
      const player = createTestPlayer('p1', settings);
      const monumentId = settings.monumentDefinitions[0].id;
      player.monuments[monumentId] = { workersCommitted: 3, completed: false };

      expect(hasStartedMonument(player, monumentId)).toBe(true);
    });
  });

  describe('getRemainingMonumentWorkers', () => {
    it('returns full cost for new monument', () => {
      const player = createTestPlayer('p1', settings);
      const monument = settings.monumentDefinitions[0];

      const remaining = getRemainingMonumentWorkers(player, monument.id, settings);
      expect(remaining).toBe(monument.requirements.workerCost);
    });

    it('returns remaining after partial progress', () => {
      const player = createTestPlayer('p1', settings);
      // Use a monument with higher cost
      const monument = settings.monumentDefinitions.find((m) => m.requirements.workerCost > 5)!;
      player.monuments[monument.id] = { workersCommitted: 2, completed: false };

      const remaining = getRemainingMonumentWorkers(player, monument.id, settings);
      expect(remaining).toBe(monument.requirements.workerCost - 2);
    });

    it('returns 0 for completed monument', () => {
      const player = createTestPlayer('p1', settings);
      const monument = settings.monumentDefinitions[0];
      player.monuments[monument.id] = { workersCommitted: 10, completed: true };

      expect(getRemainingMonumentWorkers(player, monument.id, settings)).toBe(0);
    });
  });

  describe('allocateWorkersToMonument', () => {
    it('allocates workers to a monument', () => {
      const players = [createTestPlayer('p1', settings)];
      // Use a monument with higher cost for partial allocation
      const monument = settings.monumentDefinitions.find((m) => m.requirements.workerCost > 5)!;

      const { player: newPlayer, workersUsed } = allocateWorkersToMonument(
        players[0],
        monument.id,
        5,
        players,
        settings
      );

      expect(workersUsed).toBe(5);
      expect(newPlayer.monuments[monument.id].workersCommitted).toBe(5);
    });

    it('completes monument when enough workers', () => {
      const players = [createTestPlayer('p1', settings)];
      const monument = settings.monumentDefinitions[0];

      const { player: newPlayer, workersUsed } = allocateWorkersToMonument(
        players[0],
        monument.id,
        monument.requirements.workerCost + 10,
        players,
        settings
      );

      expect(workersUsed).toBe(monument.requirements.workerCost);
      expect(newPlayer.monuments[monument.id].completed).toBe(true);
    });

    it('allows shared build if another player already completed the monument', () => {
      const players = [
        createTestPlayer('p1', settings),
        createTestPlayer('p2', settings),
      ];
      const monument = settings.monumentDefinitions[0];
      players[1].monuments[monument.id] = { workersCommitted: 10, completed: true };

      const { player: newPlayer, workersUsed } = allocateWorkersToMonument(
        players[0],
        monument.id,
        5,
        players,
        settings
      );

      expect(workersUsed).toBe(Math.min(5, monument.requirements.workerCost));
      expect(newPlayer.monuments[monument.id].workersCommitted).toBe(Math.min(5, monument.requirements.workerCost));
    });

    it('assigns completion order when monument is completed', () => {
      const players = [createTestPlayer('p1', settings)];
      const monument = settings.monumentDefinitions[0];

      const { player: newPlayer } = allocateWorkersToMonument(
        players[0],
        monument.id,
        monument.requirements.workerCost,
        players,
        settings
      );

      expect(newPlayer.monuments[monument.id].completed).toBe(true);
      expect(newPlayer.monuments[monument.id].completedOrder).toBe(1);
    });
  });

  describe('isFirstToCompleteMonument', () => {
    it('returns true when player is first to complete', () => {
      const players = [
        createTestPlayer('p1', settings),
        createTestPlayer('p2', settings),
      ];
      const monument = settings.monumentDefinitions[0];
      players[0].monuments[monument.id] = { workersCommitted: 10, completed: true };

      expect(isFirstToCompleteMonument(monument.id, players[0], players)).toBe(true);
    });

    it('returns false when another player completed first', () => {
      const players = [
        createTestPlayer('p1', settings),
        createTestPlayer('p2', settings),
      ];
      const monument = settings.monumentDefinitions[0];
      players[0].monuments[monument.id] = { workersCommitted: 10, completed: true };
      players[1].monuments[monument.id] = { workersCommitted: 10, completed: true };

      expect(isFirstToCompleteMonument(monument.id, players[1], players)).toBe(false);
    });

    it('uses completion order when both players have completed', () => {
      const players = [
        createTestPlayer('p1', settings),
        createTestPlayer('p2', settings),
      ];
      const monument = settings.monumentDefinitions[0];
      players[0].monuments[monument.id] = {
        workersCommitted: monument.requirements.workerCost,
        completed: true,
        completedOrder: 1,
      };
      players[1].monuments[monument.id] = {
        workersCommitted: monument.requirements.workerCost,
        completed: true,
        completedOrder: 2,
      };

      expect(isFirstToCompleteMonument(monument.id, players[0], players)).toBe(true);
      expect(isFirstToCompleteMonument(monument.id, players[1], players)).toBe(false);
    });
  });

  describe('getCompletedCityCount', () => {
    it('returns number of completed cities', () => {
      const player = createTestPlayer('p1', settings);
      expect(getCompletedCityCount(player)).toBe(settings.startingCities);
    });

    it('increases when more cities completed', () => {
      const player = createTestPlayer('p1', settings);
      player.cities[3] = { workersCommitted: 0, completed: true };

      expect(getCompletedCityCount(player)).toBe(settings.startingCities + 1);
    });
  });

  describe('getCompletedMonumentCount', () => {
    it('returns 0 when no monuments completed', () => {
      const player = createTestPlayer('p1', settings);
      expect(getCompletedMonumentCount(player)).toBe(0);
    });

    it('counts completed monuments', () => {
      const player = createTestPlayer('p1', settings);
      const monument1 = settings.monumentDefinitions[0];
      const monument2 = settings.monumentDefinitions[1];

      player.monuments[monument1.id] = { workersCommitted: 10, completed: true };
      player.monuments[monument2.id] = { workersCommitted: 10, completed: true };

      expect(getCompletedMonumentCount(player)).toBe(2);
    });
  });

  describe('getCompletedMonuments', () => {
    it('returns empty array when none completed', () => {
      const player = createTestPlayer('p1', settings);
      expect(getCompletedMonuments(player)).toEqual([]);
    });

    it('returns IDs of completed monuments', () => {
      const player = createTestPlayer('p1', settings);
      const monument = settings.monumentDefinitions[0];
      player.monuments[monument.id] = { workersCommitted: 10, completed: true };

      expect(getCompletedMonuments(player)).toContain(monument.id);
    });
  });

  describe('getBuildOptions', () => {
    it('returns available cities and monuments', () => {
      const players = [createTestPlayer('p1', settings)];
      const options = getBuildOptions(players[0], players, 10, settings);

      // Should have at least one city to build (index 3)
      expect(options.cities).toContain(3);
      // Should have monuments available
      expect(options.monuments.length).toBeGreaterThan(0);
    });

    it('includes monuments completed by opponents when workers are sufficient', () => {
      const players = [
        createTestPlayer('p1', settings),
        createTestPlayer('p2', settings),
      ];
      const monument = settings.monumentDefinitions[0];
      players[1].monuments[monument.id] = { workersCommitted: 10, completed: true };

      const options = getBuildOptions(players[0], players, 10, settings);
      expect(options.monuments).toContain(monument.id);
    });

    it('returns no build options when no workers are available', () => {
      const players = [createTestPlayer('p1', settings)];
      const options = getBuildOptions(players[0], players, 0, settings);
      expect(options.cities).toEqual([]);
      expect(options.monuments).toEqual([]);
    });

    it('allows partial build options when workers are available', () => {
      const players = [createTestPlayer('p1', settings)];
      const options = getBuildOptions(players[0], players, 2, settings);
      expect(options.cities).toEqual([3]);
      expect(options.monuments.length).toBeGreaterThan(0);
    });

    it('only offers the next city in sequence', () => {
      const players = [createTestPlayer('p1', settings)];
      const options = getBuildOptions(players[0], players, 10, settings);
      expect(options.cities).toEqual([3]);
    });
  });

  describe('spendWorkers', () => {
    it('reduces workers in turn production', () => {
      const turn = createTestTurn('p1', {
        turnProduction: { goods: 0, food: 0, workers: 10, coins: 0, skulls: 0 },
      });

      const newTurn = spendWorkers(turn, 3);
      expect(newTurn.turnProduction.workers).toBe(7);
    });

    it('does not go below 0', () => {
      const turn = createTestTurn('p1', {
        turnProduction: { goods: 0, food: 0, workers: 5, coins: 0, skulls: 0 },
      });

      const newTurn = spendWorkers(turn, 10);
      expect(newTurn.turnProduction.workers).toBe(0);
    });
  });
});

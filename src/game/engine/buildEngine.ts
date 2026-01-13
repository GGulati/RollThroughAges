import { MonumentDefinition } from '../construction';
import { PlayerState, TurnState, GameSettings } from '../game';

/**
 * Get the next city that can be built (first incomplete city).
 */
export function getNextCityToBuild(player: PlayerState): number | null {
  const index = player.cities.findIndex((city) => !city.completed);
  return index >= 0 ? index : null;
}

/**
 * Get the worker cost for a city at a specific index.
 */
export function getCityWorkerCost(cityIndex: number, settings: GameSettings): number {
  // Starting cities are already completed
  if (cityIndex < settings.startingCities) return 0;
  const defIndex = cityIndex - settings.startingCities;
  if (defIndex >= settings.cityDefinitions.length) return 0;
  return settings.cityDefinitions[defIndex].workerCost;
}

/**
 * Get the remaining workers needed to complete a city.
 */
export function getRemainingCityWorkers(
  player: PlayerState,
  cityIndex: number,
  settings: GameSettings
): number {
  const city = player.cities[cityIndex];
  if (!city || city.completed) return 0;
  const cost = getCityWorkerCost(cityIndex, settings);
  return Math.max(0, cost - city.workersCommitted);
}

/**
 * Allocate workers to build a city.
 * Returns updated player and remaining workers.
 */
export function allocateWorkersToCity(
  player: PlayerState,
  cityIndex: number,
  workers: number,
  settings: GameSettings
): { player: PlayerState; workersUsed: number } {
  const city = player.cities[cityIndex];
  if (!city || city.completed) {
    return { player, workersUsed: 0 };
  }

  const cost = getCityWorkerCost(cityIndex, settings);
  const needed = cost - city.workersCommitted;
  const toAllocate = Math.min(workers, needed);

  const newCities = [...player.cities];
  const newWorkersCommitted = city.workersCommitted + toAllocate;
  const isComplete = newWorkersCommitted >= cost;

  newCities[cityIndex] = {
    workersCommitted: isComplete ? 0 : newWorkersCommitted,
    completed: isComplete,
  };

  return {
    player: { ...player, cities: newCities },
    workersUsed: toAllocate,
  };
}

/**
 * Get available monuments for a given player count.
 */
export function getAvailableMonuments(
  playerCount: number,
  settings: GameSettings
): MonumentDefinition[] {
  return settings.monumentDefinitions.filter(
    (m) => !m.minPlayerCount || playerCount >= m.minPlayerCount
  );
}

/**
 * Check if a monument can be built by this player.
 * A monument can only be built once per game (by any player).
 */
export function canBuildMonument(
  monumentId: string,
  player: PlayerState,
  allPlayers: PlayerState[]
): boolean {
  for (const p of allPlayers) {
    if (p.monuments[monumentId]?.completed) {
      return false;
    }
  }
  return true;
}

/**
 * Check if player has started building a monument (has workers committed).
 */
export function hasStartedMonument(player: PlayerState, monumentId: string): boolean {
  const progress = player.monuments[monumentId];
  return progress && progress.workersCommitted > 0;
}

/**
 * Get the remaining workers needed to complete a monument.
 */
export function getRemainingMonumentWorkers(
  player: PlayerState,
  monumentId: string,
  settings: GameSettings
): number {
  const monument = settings.monumentDefinitions.find((m) => m.id === monumentId);
  if (!monument) return 0;

  const progress = player.monuments[monumentId];
  if (!progress || progress.completed) return 0;

  return Math.max(0, monument.requirements.workerCost - progress.workersCommitted);
}

/**
 * Allocate workers to build a monument.
 * Returns updated player and workers used.
 */
export function allocateWorkersToMonument(
  player: PlayerState,
  monumentId: string,
  workers: number,
  allPlayers: PlayerState[],
  settings: GameSettings
): { player: PlayerState; workersUsed: number } {
  const monument = settings.monumentDefinitions.find((m) => m.id === monumentId);
  if (!monument) {
    return { player, workersUsed: 0 };
  }

  if (!canBuildMonument(monumentId, player, allPlayers)) {
    return { player, workersUsed: 0 };
  }

  const progress = player.monuments[monumentId] ?? { workersCommitted: 0, completed: false };
  if (progress.completed) {
    return { player, workersUsed: 0 };
  }

  const cost = monument.requirements.workerCost;
  const needed = cost - progress.workersCommitted;
  const toAllocate = Math.min(workers, needed);

  const newWorkersCommitted = progress.workersCommitted + toAllocate;
  const isComplete = newWorkersCommitted >= cost;

  const newMonuments = {
    ...player.monuments,
    [monumentId]: {
      workersCommitted: isComplete ? cost : newWorkersCommitted,
      completed: isComplete,
    },
  };

  return {
    player: { ...player, monuments: newMonuments },
    workersUsed: toAllocate,
  };
}

/**
 * Check if this player is the first to complete a monument.
 */
export function isFirstToCompleteMonument(
  monumentId: string,
  player: PlayerState,
  allPlayers: PlayerState[]
): boolean {
  for (const p of allPlayers) {
    if (p.id !== player.id && p.monuments[monumentId]?.completed) {
      return false;
    }
  }
  return true;
}

/**
 * Get the number of completed cities for a player.
 */
export function getCompletedCityCount(player: PlayerState): number {
  return player.cities.filter((c) => c.completed).length;
}

/**
 * Get the number of completed monuments for a player.
 */
export function getCompletedMonumentCount(player: PlayerState): number {
  return Object.values(player.monuments).filter((m) => m.completed).length;
}

/**
 * Get all monuments a player has completed.
 */
export function getCompletedMonuments(player: PlayerState): string[] {
  return Object.entries(player.monuments)
    .filter(([_, progress]) => progress.completed)
    .map(([id]) => id);
}

/**
 * Get build options available to a player with remaining workers.
 */
export function getBuildOptions(
  player: PlayerState,
  allPlayers: PlayerState[],
  workersAvailable: number,
  settings: GameSettings
): { cities: number[]; monuments: string[] } {
  const cities: number[] = [];
  const monuments: string[] = [];

  // Check cities
  for (let i = 0; i < player.cities.length; i++) {
    const city = player.cities[i];
    if (!city.completed) {
      const remaining = getRemainingCityWorkers(player, i, settings);
      if (remaining > 0) {
        cities.push(i);
      }
    }
  }

  // Check monuments
  const playerCount = settings.players.length;
  const availableMonuments = getAvailableMonuments(playerCount, settings);
  for (const monument of availableMonuments) {
    if (canBuildMonument(monument.id, player, allPlayers)) {
      const progress = player.monuments[monument.id];
      if (!progress?.completed) {
        monuments.push(monument.id);
      }
    }
  }

  return { cities, monuments };
}

/**
 * Spend workers from turn production.
 */
export function spendWorkers(turn: TurnState, amount: number): TurnState {
  return {
    ...turn,
    turnProduction: {
      ...turn.turnProduction,
      workers: Math.max(0, turn.turnProduction.workers - amount),
    },
  };
}

import { DisasterDefinition, ImpactedPlayers } from '../disaster';
import { PlayerState, GameSettings } from '../game';
import { clearAllGoods } from './goodsEngine';

/**
 * Get the single worst disaster that triggers based on skull count.
 * Only the highest-level disaster triggers (not cumulative).
 */
export function getTriggeredDisaster(
  skullCount: number,
  settings: GameSettings
): DisasterDefinition | null {
  let worstDisaster: DisasterDefinition | null = null;
  for (const disaster of settings.disasterDefinitions) {
    if (skullCount >= disaster.skulls) {
      if (!worstDisaster || disaster.skulls > worstDisaster.skulls) {
        worstDisaster = disaster;
      }
    }
  }
  return worstDisaster;
}

/**
 * Check if a player has immunity to a specific disaster.
 */
export function hasDisasterImmunity(
  player: PlayerState,
  disasterId: string,
  settings: GameSettings
): boolean {
  const immunityDevelopments = settings.developmentDefinitions.filter(
    (dev) =>
      dev.specialEffect.type === 'disasterImmunity' &&
      dev.specialEffect.disasterId === disasterId &&
      player.developments.includes(dev.id)
  );

  return immunityDevelopments.length > 0;
}

/**
 * Get the rewritten disaster targeting for a specific disaster, if any.
 * Returns the new target players scope, or null if no rewrite applies.
 */
export function getRewrittenDisasterTargeting(
  player: PlayerState,
  disasterId: string,
  settings: GameSettings
): ImpactedPlayers | null {
  for (const dev of settings.developmentDefinitions) {
    if (
      dev.specialEffect.type === 'rewriteDisasterTargeting' &&
      dev.specialEffect.disasterId === disasterId &&
      player.developments.includes(dev.id)
    ) {
      const effect = dev.specialEffect;
      if (effect.type === 'rewriteDisasterTargeting') {
        return effect.targetPlayers;
      }
    }
  }

  return null;
}

/**
 * Apply a disaster's effects to a single player.
 * Returns the updated player state.
 */
export function applyDisasterToPlayer(
  player: PlayerState,
  disaster: DisasterDefinition
): PlayerState {
  let updatedPlayer = { ...player };

  // Apply point penalty
  if (disaster.pointsDelta !== 0) {
    updatedPlayer.disasterPenalties += Math.abs(disaster.pointsDelta);
  }

  // Clear goods if disaster requires it
  if (disaster.clearsGoods) {
    updatedPlayer = {
      ...updatedPlayer,
      goods: clearAllGoods(player.goods),
    };
  }

  return updatedPlayer;
}

/**
 * Get the players affected by a disaster.
 * Handles special effects that rewrite disaster targeting.
 */
export function getAffectedPlayerIndices(
  disaster: DisasterDefinition,
  activePlayerIndex: number,
  totalPlayers: number,
  activePlayer: PlayerState,
  settings: GameSettings
): number[] {
  const rewrittenScope = getRewrittenDisasterTargeting(activePlayer, disaster.id, settings);
  const scope = rewrittenScope ?? disaster.affectedPlayers;

  switch (scope) {
    case 'self':
      return [activePlayerIndex];
    case 'opponents':
      return Array.from({ length: totalPlayers }, (_, i) => i).filter(
        (i) => i !== activePlayerIndex
      );
    case 'all':
      return Array.from({ length: totalPlayers }, (_, i) => i);
    default:
      return [activePlayerIndex];
  }
}

/**
 * Apply the triggered disaster (if any) to the game state.
 * Returns updated players array.
 */
export function applyDisasters(
  players: PlayerState[],
  activePlayerIndex: number,
  skullCount: number,
  settings: GameSettings
): PlayerState[] {
  const disaster = getTriggeredDisaster(skullCount, settings);
  if (!disaster) return players;

  const activePlayer = players[activePlayerIndex];
  let updatedPlayers = [...players];

  // Check immunity for self-targeting disasters
  if (
    disaster.affectedPlayers === 'self' &&
    hasDisasterImmunity(activePlayer, disaster.id, settings)
  ) {
    return players;
  }

  const affectedIndices = getAffectedPlayerIndices(
    disaster,
    activePlayerIndex,
    players.length,
    activePlayer,
    settings
  );

  for (const playerIndex of affectedIndices) {
    const targetPlayer = updatedPlayers[playerIndex];

    // Check if target has immunity (for opponent-targeting disasters)
    if (
      disaster.affectedPlayers === 'opponents' &&
      hasDisasterImmunity(targetPlayer, disaster.id, settings)
    ) {
      continue;
    }

    updatedPlayers = [
      ...updatedPlayers.slice(0, playerIndex),
      applyDisasterToPlayer(targetPlayer, disaster),
      ...updatedPlayers.slice(playerIndex + 1),
    ];
  }

  return updatedPlayers;
}

/**
 * Get a description of what disaster will trigger at a given skull count.
 */
export function getDisasterPreview(skullCount: number, settings: GameSettings): string | null {
  const disaster = getTriggeredDisaster(skullCount, settings);
  if (!disaster) return null;
  return `${disaster.id}: ${disaster.effect}`;
}

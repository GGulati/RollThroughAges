import { PlayerId, PlayerState, GameSettings } from '../game';
import { getDevelopmentPoints, getScoringEffects } from './developmentEngine';
import { getCompletedCityCount, getCompletedMonumentCount, isFirstToCompleteMonument } from './buildEngine';

/**
 * Calculate monument points for a player.
 * First player to complete gets firstPoints, others get laterPoints.
 */
export function calculateMonumentPoints(
  player: PlayerState,
  allPlayers: PlayerState[],
  settings: GameSettings
): number {
  let total = 0;

  for (const [monumentId, progress] of Object.entries(player.monuments)) {
    if (!progress.completed) continue;

    const monument = settings.monumentDefinitions.find((m) => m.id === monumentId);
    if (!monument) continue;

    const isFirst = isFirstToCompleteMonument(monumentId, player, allPlayers);
    total += isFirst ? monument.firstPoints : monument.laterPoints;
  }

  return total;
}

/**
 * Calculate bonus points from developments (Architecture, Empire).
 */
export function calculateBonusPoints(player: PlayerState, settings: GameSettings): number {
  const effects = getScoringEffects(player, settings);
  let total = 0;

  for (const effect of effects) {
    switch (effect.entity) {
      case 'monument':
        total += getCompletedMonumentCount(player) * effect.points;
        break;
      case 'city':
        total += getCompletedCityCount(player) * effect.points;
        break;
    }
  }

  return total;
}

/**
 * Update scores for all players.
 */
export function updateAllScores(players: PlayerState[], settings: GameSettings): PlayerState[] {
  return players.map((player) => ({
    ...player,
    score: getScoreBreakdown(player, players, settings).total,
  }));
}

/**
 * Get score breakdown for a player.
 */
export function getScoreBreakdown(
  player: PlayerState,
  allPlayers: PlayerState[],
  settings: GameSettings
): {
  monuments: number;
  developments: number;
  bonuses: number;
  penalties: number;
  total: number;
} {
  const monuments = calculateMonumentPoints(player, allPlayers, settings);
  const developments = getDevelopmentPoints(player, settings);
  const bonuses = calculateBonusPoints(player, settings);
  const penalties = player.disasterPenalties;

  return {
    monuments,
    developments,
    bonuses,
    penalties,
    total: monuments + developments + bonuses - penalties,
  };
}

/**
 * Determine the winner(s) of the game.
 * Returns player IDs of winner(s) - ties are possible.
 */
export function determineWinners(players: PlayerState[]): PlayerId[] {
  const maxScore = Math.max(...players.map((p) => p.score));
  return players.filter((p) => p.score === maxScore).map((p) => p.id);
}

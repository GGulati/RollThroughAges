import { GamePhase } from '@/game';
import { PlayerEndStateSummary } from '@/game/reporting';

export type PhasePanel = 'turnStatus' | 'production' | 'build' | 'development' | 'discard';

export function getTopScore(playerEndStateSummaries: PlayerEndStateSummary[]): number {
  return playerEndStateSummaries.reduce(
    (best, entry) => Math.max(best, entry.total),
    Number.NEGATIVE_INFINITY,
  );
}

export function getWinners(
  playerEndStateSummaries: PlayerEndStateSummary[],
  topScore: number,
): PlayerEndStateSummary[] {
  if (topScore === Number.NEGATIVE_INFINITY) {
    return [];
  }
  return playerEndStateSummaries.filter((entry) => entry.total === topScore);
}

export function getActivePhasePanel(phase: GamePhase | null): PhasePanel | null {
  switch (phase) {
    case GamePhase.RollDice:
    case GamePhase.DecideDice:
    case GamePhase.ResolveProduction:
      return 'production';
    case GamePhase.Build:
      return 'build';
    case GamePhase.Development:
      return 'development';
    case GamePhase.DiscardGoods:
      return 'discard';
    case GamePhase.EndTurn:
      return 'turnStatus';
    default:
      return null;
  }
}

export function getPanelClassName(
  activePhasePanel: PhasePanel | null,
  panel: PhasePanel,
): string {
  return activePhasePanel === panel ? 'app-panel is-active-phase' : 'app-panel';
}

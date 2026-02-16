import { ReactNode } from 'react';
import { ScoreBreakdownSummary } from '@/game/reporting';

type PlayerScoreCardProps = {
  playerName: string;
  breakdown: ScoreBreakdownSummary;
  isActive?: boolean;
  children?: ReactNode;
};

export function PlayerScoreCard({
  playerName,
  breakdown,
  isActive = false,
  children,
}: PlayerScoreCardProps) {
  return (
    <article className="scoreboard-card">
      <p className="development-title">
        {playerName} {isActive ? '• Active' : ''}
      </p>
      <p className="scoreboard-row">Monuments: {breakdown.monuments}</p>
      <p className="scoreboard-row">Developments: {breakdown.developments}</p>
      <p className="scoreboard-row">Bonuses: {breakdown.bonuses}</p>
      <p className="scoreboard-row">Penalties: -{breakdown.penalties}</p>
      <p className="scoreboard-row">
        <strong>Total: {breakdown.total}</strong>
      </p>
      {children}
    </article>
  );
}

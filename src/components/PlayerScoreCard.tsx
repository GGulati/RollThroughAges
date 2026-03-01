import { ReactNode } from 'react';
import { ScoreBreakdownSummary } from '@/game/reporting';
import { DataTable } from '@/components/tables/DataTable';
import { formatResourceLabel } from '@/utils/gameUiFormatters';

type PlayerScoreCardProps = {
  playerName: string;
  breakdown: ScoreBreakdownSummary;
  isActive?: boolean;
  showBreakdown?: boolean;
  children?: ReactNode;
};

export function PlayerScoreCard({
  playerName,
  breakdown,
  isActive = false,
  showBreakdown = true,
  children,
}: PlayerScoreCardProps) {
  return (
    <article className="scoreboard-card">
      <p className="development-title">
        {playerName}
        {isActive ? ' • Active' : ''}
      </p>
      {showBreakdown ? (
        <DataTable
          headers={['Scoring', 'Value']}
          rows={[
            ['Monuments', breakdown.monuments],
            ['Developments', breakdown.developments],
            ['Bonuses', breakdown.bonuses],
            ['Penalties', `-${breakdown.penalties}`],
            [
              <strong key="total-label">Total</strong>,
              <strong key="total-value">
                {breakdown.total} {formatResourceLabel('VP')}
              </strong>,
            ],
          ]}
          caption={`${playerName} score breakdown`}
          className="score-breakdown-table"
        />
      ) : null}
      {children}
    </article>
  );
}

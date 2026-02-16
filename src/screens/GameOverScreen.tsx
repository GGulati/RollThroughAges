import { ActionLogPanel } from '@/components/ActionLogPanel';
import { PlayerEndStateCard } from '@/components/PlayerEndStateCard';
import { PlayerEndStateSummary } from '@/game/reporting';

type GameOverScreenProps = {
  winners: PlayerEndStateSummary[];
  topScore: number;
  reasons: string[];
  playerEndStateSummaries: PlayerEndStateSummary[];
  actionLog: string[];
  onPlayAgain: () => void;
};

export function GameOverScreen({
  winners,
  topScore,
  reasons,
  playerEndStateSummaries,
  actionLog,
  onPlayAgain,
}: GameOverScreenProps) {
  return (
    <>
      <section className="app-panel victory-panel">
        <h2>Game Over</h2>
        <p>
          {winners.length > 1
            ? `Tie at ${topScore} VP: ${winners.map((winner) => winner.playerName).join(', ')}`
            : `Winner: ${winners[0]?.playerName ?? 'Unknown'} (${topScore} VP)`}
        </p>
        {reasons.length > 0 ? (
          <div>
            <p className="choice-label">End Criteria Triggered</p>
            <ul className="inline-note">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="scoreboard-list">
          {playerEndStateSummaries.map((entry) => (
            <PlayerEndStateCard
              key={`victory-${entry.playerId}`}
              entry={entry}
              itemKeyPrefix="game-over"
            />
          ))}
        </div>
        <div className="title-actions">
          <button type="button" onClick={onPlayAgain}>
            Play Again
          </button>
        </div>
      </section>
      <ActionLogPanel entries={actionLog} ariaLabel="Action log history" />
    </>
  );
}

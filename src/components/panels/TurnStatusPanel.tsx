import { PlayerScoreCard } from '@/components/PlayerScoreCard';

export type TurnStatusPlayerPoints = {
  playerId: string;
  playerName: string;
  breakdown: {
    monuments: number;
    developments: number;
    bonuses: number;
    penalties: number;
    total: number;
  };
  progress: {
    citiesBuilt: number;
    citiesTotal: number;
    developmentsBuilt: number;
    developmentsGoal: number | null;
    monumentsBuilt: number;
    monumentsTotal: number;
    monumentStatuses: Array<{
      monumentId: string;
      monumentName: string;
      workersCommitted: number;
      workerCost: number;
      completed: boolean;
      completedOrder: number | null;
    }>;
  };
};

export type TurnStatusData = {
  isGameActive: boolean;
  round: number;
  phase: string | null;
  activePlayerId: string | null;
  activePlayerName: string | null;
  activePlayerController: 'human' | 'bot' | null;
  playerPoints: TurnStatusPlayerPoints[];
};

type TurnStatusPanelProps = {
  className: string;
  turnStatus: TurnStatusData;
  controlsLockedByBot: boolean;
  botStepDelayMs: number;
  canEndTurn: boolean;
  endTurnReason: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onEndTurn: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

export function TurnStatusPanel({
  className,
  turnStatus,
  controlsLockedByBot,
  botStepDelayMs,
  canEndTurn,
  endTurnReason,
  canUndo,
  canRedo,
  onEndTurn,
  onUndo,
  onRedo,
}: TurnStatusPanelProps) {
  return (
    <section className={className} aria-live="polite">
      <h2>Game Status</h2>
      <p>
        <strong>Round:</strong> {turnStatus.isGameActive ? turnStatus.round : '-'}
      </p>
      <p>
        <strong>Active Player:</strong> {turnStatus.activePlayerName ?? '-'}
      </p>
      <p>
        <strong>Controller:</strong> {turnStatus.activePlayerController ?? '-'}
      </p>
      {controlsLockedByBot ? (
        <p className="hint-text">
          Bot is taking turn... ({botStepDelayMs / 1000}s per action)
        </p>
      ) : null}
      <p>
        <strong>Phase:</strong> {turnStatus.phase ?? '-'}
      </p>
      <div className="actions">
        <button type="button" onClick={onEndTurn} disabled={!canEndTurn}>
          End Turn
        </button>
        <button type="button" onClick={onUndo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo}>
          Redo
        </button>
      </div>
      {!canEndTurn && endTurnReason ? <p className="hint-text">{endTurnReason}</p> : null}
      {turnStatus.playerPoints.length > 0 ? (
        <div className="scoreboard-list">
          {turnStatus.playerPoints.map((entry) => {
            return (
            <PlayerScoreCard
              key={entry.playerId}
              playerName={entry.playerName}
              breakdown={entry.breakdown}
              isActive={entry.playerId === turnStatus.activePlayerId}
              showBreakdown
            >
              <p className="scoreboard-row">Monuments:</p>
              <div className="monument-status-list">
                {entry.progress.monumentStatuses.map((monument) => {
                  const statusText = monument.completed
                    ? monument.completedOrder === 1
                      ? 'Built (First)'
                      : 'Built'
                    : monument.workersCommitted > 0
                      ? `${monument.workersCommitted}/${monument.workerCost}`
                      : `0/${monument.workerCost}`;
                  return (
                    <span
                      key={`${entry.playerId}-${monument.monumentId}`}
                      className="monument-status-chip"
                    >
                      {monument.monumentName}: {statusText}
                    </span>
                  );
                })}
              </div>
            </PlayerScoreCard>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

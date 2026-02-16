import { PlayerScoreCard } from '@/components/PlayerScoreCard';

type TurnStatusPlayerPoints = {
  playerId: string;
  playerName: string;
  breakdown: {
    monuments: number;
    developments: number;
    bonuses: number;
    penalties: number;
    total: number;
  };
};

type TurnStatusData = {
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
      <h2>Turn Status</h2>
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
          {turnStatus.playerPoints.map((entry) => (
            <PlayerScoreCard
              key={entry.playerId}
              playerName={entry.playerName}
              breakdown={entry.breakdown}
              isActive={entry.playerId === turnStatus.activePlayerId}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

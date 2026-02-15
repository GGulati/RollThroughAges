import './index.css';
import { endTurn, redo, rollDice, startGame, undo } from '@/store/gameSlice';
import {
  selectCanRedo,
  selectCanUndo,
  selectDicePanelModel,
  selectTurnStatus,
} from '@/store/selectors';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

const DEFAULT_PLAYERS = [
  { id: 'p1', name: 'Player 1', controller: 'human' as const },
  { id: 'p2', name: 'Player 2', controller: 'human' as const },
];

function App() {
  const dispatch = useAppDispatch();
  const turnStatus = useAppSelector(selectTurnStatus);
  const dicePanel = useAppSelector(selectDicePanelModel);
  const canUndo = useAppSelector(selectCanUndo);
  const canRedo = useAppSelector(selectCanRedo);

  return (
    <main className="app-shell">
      <section className="app-panel">
        <h1>Roll Through the Ages</h1>
        <p>
          Stage 2 playable loop: start a game, roll dice, end turn, and use
          undo or redo.
        </p>

        <div className="status-grid" aria-live="polite">
          <p>
            <strong>Round:</strong>{' '}
            {turnStatus.isGameActive ? turnStatus.round : '-'}
          </p>
          <p>
            <strong>Active Player:</strong>{' '}
            {turnStatus.activePlayerName ?? '-'}
          </p>
          <p>
            <strong>Phase:</strong> {turnStatus.phase ?? '-'}
          </p>
          <p>
            <strong>Rolls Used:</strong> {dicePanel.rollsUsed}/
            {dicePanel.maxRollsAllowed}
          </p>
        </div>

        <div className="actions">
          <button
            type="button"
            onClick={() => dispatch(startGame({ players: DEFAULT_PLAYERS }))}
          >
            {turnStatus.isGameActive ? 'Restart Game' : 'Start Game'}
          </button>
          <button
            type="button"
            onClick={() => dispatch(rollDice())}
            disabled={!dicePanel.isActionAllowed}
          >
            Roll Dice
          </button>
          <button
            type="button"
            onClick={() => dispatch(endTurn())}
            disabled={!turnStatus.isGameActive}
          >
            End Turn
          </button>
          <button type="button" onClick={() => dispatch(undo())} disabled={!canUndo}>
            Undo
          </button>
          <button type="button" onClick={() => dispatch(redo())} disabled={!canRedo}>
            Redo
          </button>
        </div>

        {turnStatus.errorMessage ? (
          <p className="error-text">{turnStatus.errorMessage}</p>
        ) : null}
        {!dicePanel.isActionAllowed && dicePanel.reason ? (
          <p className="hint-text">{dicePanel.reason}</p>
        ) : null}
      </section>
    </main>
  );
}

export default App;


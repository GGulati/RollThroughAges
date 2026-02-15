import './index.css';
import { endTurn, redo, rollDice, startGame, undo } from '@/store/gameSlice';
import {
  selectBuildPanelModel,
  selectCanRedo,
  selectCanUndo,
  selectDevelopmentPanelModel,
  selectDiscardPanelModel,
  selectDicePanelModel,
  selectEndgameStatus,
  selectProductionPanelModel,
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
  const productionPanel = useAppSelector(selectProductionPanelModel);
  const buildPanel = useAppSelector(selectBuildPanelModel);
  const developmentPanel = useAppSelector(selectDevelopmentPanelModel);
  const discardPanel = useAppSelector(selectDiscardPanelModel);
  const endgameStatus = useAppSelector(selectEndgameStatus);
  const canUndo = useAppSelector(selectCanUndo);
  const canRedo = useAppSelector(selectCanRedo);

  return (
    <main className="app-shell">
      <section className="app-layout">
        <h1>Roll Through the Ages</h1>
        <p>
          Stage 2 playable loop: start a game, roll dice, end turn, and use
          undo or redo.
        </p>

        <div className="board-grid">
          <section className="app-panel" aria-live="polite">
            <h2>Turn Status</h2>
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
            <p>
              <strong>Game Over:</strong> {endgameStatus.isGameOver ? 'Yes' : 'No'}
            </p>
          </section>

          <section className="app-panel">
            <h2>Dice Panel</h2>
            <p>
              {dicePanel.isActionAllowed
                ? 'Ready to roll.'
                : dicePanel.reason ?? 'Roll unavailable.'}
            </p>
            <p>Dice count: {dicePanel.dice.length}</p>
          </section>

          <section className="app-panel">
            <h2>Production Panel</h2>
            <p>
              {productionPanel.isActionAllowed
                ? 'Production flow ready.'
                : productionPanel.reason}
            </p>
          </section>

          <section className="app-panel">
            <h2>Build Panel</h2>
            <p>
              {buildPanel.isActionAllowed ? 'Build flow ready.' : buildPanel.reason}
            </p>
          </section>

          <section className="app-panel">
            <h2>Development Panel</h2>
            <p>
              {developmentPanel.isActionAllowed
                ? 'Development flow ready.'
                : developmentPanel.reason}
            </p>
          </section>

          <section className="app-panel">
            <h2>Discard Panel</h2>
            <p>
              {discardPanel.isActionAllowed
                ? 'Discard flow ready.'
                : discardPanel.reason}
            </p>
          </section>
        </div>

        <div className="actions-log-grid">
          <section className="app-panel">
            <h2>Actions</h2>
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
              <button
                type="button"
                onClick={() => dispatch(undo())}
                disabled={!canUndo}
              >
                Undo
              </button>
              <button
                type="button"
                onClick={() => dispatch(redo())}
                disabled={!canRedo}
              >
                Redo
              </button>
            </div>
          </section>

          <section className="app-panel">
            <h2>Action Log</h2>
            <ul className="log-list">
              <li>Current phase: {turnStatus.phase ?? 'none'}</li>
              <li>
                Active player: {turnStatus.activePlayerName ?? 'no active game'}
              </li>
              <li>
                Undo available: {canUndo ? 'yes' : 'no'} | Redo available:{' '}
                {canRedo ? 'yes' : 'no'}
              </li>
            </ul>
          </section>
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


import './index.css';
import {
  buildCity,
  buildMonument,
  endTurn,
  keepDie,
  redo,
  rollDice,
  selectProduction,
  startGame,
  undo,
} from '@/store/gameSlice';
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

  const rerollEmoji =
    dicePanel.rerollsRemaining > 0
      ? Array.from({ length: dicePanel.rerollsRemaining }, () => '🎲').join(' ')
      : 'None';

  const getLockBadge = (lockDecision: string) => {
    if (lockDecision === 'kept') {
      return '🔒 Locked (Kept)';
    }
    if (lockDecision === 'skull') {
      return '☠️ Locked (Skull)';
    }
    return '🔓 Unlocked';
  };

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
            <h2>Dice Panel 🎲</h2>
            <p>Rerolls available: {rerollEmoji}</p>
            <p>Pending choices: {productionPanel.pendingProductionChoices}</p>
            <button
              type="button"
              onClick={() => dispatch(rollDice())}
              disabled={!dicePanel.canRoll}
            >
              Reroll Dice
            </button>
            {!productionPanel.canResolveProduction && productionPanel.reason ? (
              <p className="hint-text">{productionPanel.reason}</p>
            ) : null}
            <div className="dice-grid">
              {dicePanel.diceCards.map((die) => (
                <article key={die.index} className="die-card">
                  <p className="die-title">Die {die.index + 1}</p>
                  <p className="die-face">{die.label}</p>
                  {die.hasChoice ? (
                    <div className="choice-block">
                      <p className="choice-label">Production choice:</p>
                      <div className="panel-actions">
                        {Array.from({ length: die.optionCount }, (_, optionIndex) => (
                          <button
                            key={`${die.index}-${optionIndex}`}
                            type="button"
                            onClick={() =>
                              dispatch(
                                selectProduction({
                                  dieIndex: die.index,
                                  productionIndex: optionIndex,
                                }),
                              )
                            }
                            disabled={!die.canChooseOption}
                          >
                            {optionIndex === die.selectedOption ? '✅ ' : ''}
                            {die.optionSummaries[optionIndex]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <p className="die-badge">{getLockBadge(die.lockDecision)}</p>
                  <div className="panel-actions">
                    <button
                      type="button"
                      onClick={() => dispatch(keepDie({ dieIndex: die.index }))}
                      disabled={!die.canKeep}
                    >
                      {die.lockDecision === 'kept' ? 'Unlock 🔓' : 'Lock 🔒'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="app-panel">
            <h2>Build Panel</h2>
            <p>
              {buildPanel.canBuild
                ? 'Build targets available.'
                : buildPanel.reason ?? 'Build flow ready.'}
            </p>
            <p>Workers: {buildPanel.workersAvailable}</p>
            <p>
              Stored goods:{' '}
              {buildPanel.goodsStoredSummary
                .map((entry) => `${entry.goodsType} ${entry.quantity}`)
                .join(' | ')}
            </p>
            <div className="build-targets">
              <p className="choice-label">City Targets:</p>
              <div className="panel-actions">
                {buildPanel.cityTargets.length === 0 ? (
                  <span className="inline-note">No city targets</span>
                ) : (
                  buildPanel.cityTargets.map((target) => (
                    <button
                      key={`city-${target.cityIndex}`}
                      type="button"
                      onClick={() =>
                        dispatch(buildCity({ cityIndex: target.cityIndex }))
                      }
                      disabled={!buildPanel.canBuild}
                    >
                      {target.label} ({target.workersCommitted}/{target.workerCost})
                    </button>
                  ))
                )}
              </div>
              <p className="choice-label">Monument Targets:</p>
              <div className="panel-actions">
                {buildPanel.monumentTargets.length === 0 ? (
                  <span className="inline-note">No monument targets</span>
                ) : (
                  buildPanel.monumentTargets.map((target) => (
                    <button
                      key={`monument-${target.monumentId}`}
                      type="button"
                      onClick={() =>
                        dispatch(buildMonument({ monumentId: target.monumentId }))
                      }
                      disabled={!buildPanel.canBuild}
                    >
                      {target.label} ({target.workersCommitted}/{target.workerCost})
                    </button>
                  ))
                )}
              </div>
            </div>
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
      </section>
    </main>
  );
}

export default App;

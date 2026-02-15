import { useMemo, useState } from 'react';
import { GamePhase } from '@/game';
import './index.css';
import {
  buildCity,
  buildMonument,
  buyDevelopment,
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

type ConstructionSection = 'cities' | 'monuments' | 'developments';

type SectionPreferences = Record<ConstructionSection, boolean>;

const DEFAULT_SECTION_PREFERENCES: SectionPreferences = {
  cities: true,
  monuments: true,
  developments: true,
};

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
  const [selectedGoodsToSpend, setSelectedGoodsToSpend] = useState<string[]>([]);
  const [sectionPreferencesByPlayer, setSectionPreferencesByPlayer] = useState<
    Record<string, SectionPreferences>
  >({});

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

  const selectedGoodsLookup = useMemo(
    () => new Set(selectedGoodsToSpend),
    [selectedGoodsToSpend],
  );
  const selectedGoodsCoins = useMemo(
    () =>
      developmentPanel.goodsSpendOptions
        .filter((option) => selectedGoodsLookup.has(option.goodsType))
        .reduce((sum, option) => sum + option.spendValue, 0),
    [developmentPanel.goodsSpendOptions, selectedGoodsLookup],
  );
  const effectiveCoinsAvailable =
    developmentPanel.coinsAvailable + selectedGoodsCoins;
  const activePlayerKey = turnStatus.activePlayerId ?? 'no-game';
  const activePlayerPreferences =
    sectionPreferencesByPlayer[activePlayerKey] ?? DEFAULT_SECTION_PREFERENCES;
  const isBuildStep = turnStatus.phase === GamePhase.Build;
  const isDevelopmentStep = turnStatus.phase === GamePhase.Development;
  const isCitiesExpanded = isBuildStep || activePlayerPreferences.cities;
  const isMonumentsExpanded = isBuildStep || activePlayerPreferences.monuments;
  const isDevelopmentsExpanded =
    isDevelopmentStep || activePlayerPreferences.developments;

  const toggleGoodsSpend = (goodsType: string) => {
    setSelectedGoodsToSpend((current) =>
      current.includes(goodsType)
        ? current.filter((entry) => entry !== goodsType)
        : [...current, goodsType],
    );
  };
  const toggleConstructionSection = (section: ConstructionSection) => {
    setSectionPreferencesByPlayer((current) => {
      const existing =
        current[activePlayerKey] ?? DEFAULT_SECTION_PREFERENCES;
      return {
        ...current,
        [activePlayerKey]: {
          ...existing,
          [section]: !existing[section],
        },
      };
    });
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

          <section className="panel-pair">
            <section className="app-panel">
              <h2>Build Panel</h2>
              <p>
                {buildPanel.canBuild
                  ? 'Build targets available.'
                  : buildPanel.reason ?? 'Build flow ready.'}
              </p>
              <p>Workers: {buildPanel.workersAvailable}</p>
              <p>Stored goods:</p>
              <div className="goods-list">
                {buildPanel.goodsStoredSummary.map((entry) => (
                  <p key={entry.goodsType} className="goods-row">
                    {entry.goodsType}: {entry.quantity}
                  </p>
                ))}
              </div>
              <div className="build-targets">
                <div className="collapsible-header">
                  <p className="choice-label">Cities</p>
                  <button
                    type="button"
                    className="section-toggle"
                    onClick={() => toggleConstructionSection('cities')}
                  >
                    {isCitiesExpanded ? 'Collapse' : 'Expand'}
                  </button>
                </div>
                {isCitiesExpanded ? (
                  <div className="development-list">
                    {buildPanel.cityCatalog.map((city) => (
                      <article key={`city-card-${city.cityIndex}`} className="development-card">
                        <p className="development-title">
                          {city.label} ({city.workersCommitted}/{city.workerCost})
                          {city.completed ? ' • Built' : ''}
                        </p>
                        <p className="development-effect">
                          {city.workerCost > 0
                            ? `Adds 1 die when built. Cost ${city.workerCost} workers.`
                            : 'Starting city.'}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            dispatch(buildCity({ cityIndex: city.cityIndex }))
                          }
                          disabled={!city.canBuild}
                        >
                          {city.completed ? 'Built' : 'Build City'}
                        </button>
                      </article>
                    ))}
                  </div>
                ) : null}
                <div className="collapsible-header">
                  <p className="choice-label">Monuments</p>
                  <button
                    type="button"
                    className="section-toggle"
                    onClick={() => toggleConstructionSection('monuments')}
                  >
                    {isMonumentsExpanded ? 'Collapse' : 'Expand'}
                  </button>
                </div>
                {isMonumentsExpanded ? (
                  <div className="development-list">
                    {buildPanel.monumentCatalog.map((monument) => (
                      <article
                        key={`monument-card-${monument.monumentId}`}
                        className="development-card"
                      >
                        <p className="development-title">
                          {monument.label} ({monument.workersCommitted}/{monument.workerCost})
                          {monument.completed ? ' • Completed' : ''}
                        </p>
                        <p className="development-effect">
                          Points: {monument.pointsText} (first/later completion)
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            dispatch(buildMonument({ monumentId: monument.monumentId }))
                          }
                          disabled={!monument.canBuild}
                        >
                          {monument.completed ? 'Completed' : 'Build Monument'}
                        </button>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="app-panel">
              <h2>Development Panel</h2>
              <p>{developmentPanel.reason ?? 'Choose a development to purchase.'}</p>
              <p>Coins available: {effectiveCoinsAvailable}</p>
              <p className="inline-note">
                Base coins: {developmentPanel.coinsAvailable}
                {selectedGoodsCoins > 0 ? ` + goods value ${selectedGoodsCoins}` : ''}
              </p>
              <p>Total purchasing power: {developmentPanel.totalPurchasingPower}</p>
              <p className="choice-label">Goods To Spend</p>
              <p>
                Selected:{' '}
                {selectedGoodsToSpend.length > 0
                  ? selectedGoodsToSpend.join(', ')
                  : 'none'}
              </p>
              <div className="panel-actions">
                {developmentPanel.goodsSpendOptions.map((option) => (
                  <button
                    key={option.goodsType}
                    type="button"
                    onClick={() => toggleGoodsSpend(option.goodsType)}
                    disabled={option.quantity <= 0 || !developmentPanel.isActionAllowed}
                  >
                    {selectedGoodsLookup.has(option.goodsType) ? '✅ ' : ''}
                    {option.goodsType} ({option.quantity})
                  </button>
                ))}
              </div>
              <div className="collapsible-header">
                <p className="choice-label">Development Options</p>
                <button
                  type="button"
                  className="section-toggle"
                  onClick={() => toggleConstructionSection('developments')}
                >
                  {isDevelopmentsExpanded ? 'Collapse' : 'Expand'}
                </button>
              </div>
              {isDevelopmentsExpanded ? (
                <div className="development-list">
                  {developmentPanel.developmentCatalog.map((development) => {
                    const canAffordWithSelection =
                      effectiveCoinsAvailable >= development.cost;
                    return (
                      <article key={development.id} className="development-card">
                      <p className="development-title">
                        {development.name} ({development.cost}🪙, +{development.points} VP)
                        {development.purchased ? ' • Purchased' : ''}
                      </p>
                      <p className="development-effect">{development.effectDescription}</p>
                      <button
                        type="button"
                        onClick={() =>
                          dispatch(
                            buyDevelopment({
                              developmentId: development.id,
                              goodsTypeNames: selectedGoodsToSpend,
                            }),
                          )
                        }
                        disabled={
                          !developmentPanel.isActionAllowed ||
                          development.purchased ||
                          !canAffordWithSelection
                        }
                      >
                        {development.purchased ? 'Purchased' : 'Buy Development'}
                      </button>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </section>
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


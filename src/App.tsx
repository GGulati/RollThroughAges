import { useEffect, useMemo, useState } from 'react';
import { GamePhase } from '@/game';
import './index.css';
import {
  buildCity,
  buildMonument,
  buyDevelopment,
  skipDevelopment,
  discardGoods,
  endTurn,
  applyExchange,
  keepDie,
  redo,
  rerollSingleDie,
  rollDice,
  selectProduction,
  startGame,
  undo,
} from '@/store/gameSlice';
import {
  selectActionLog,
  selectBuildPanelModel,
  selectCanRedo,
  selectCanUndo,
  selectDevelopmentPanelModel,
  selectExchangePanelModel,
  selectDisasterPanelModel,
  selectDiscardPanelModel,
  selectDicePanelModel,
  selectDiceOutcomeModel,
  selectEndgameStatus,
  selectProductionPanelModel,
  selectTurnStatus,
} from '@/store/selectors';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
type ControllerOption = 'human' | 'bot';

function createPlayers(
  count: number,
  controllers: Record<number, ControllerOption>,
) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    controller: controllers[index + 1] ?? 'human',
  }));
}

type ConstructionSection = 'cities' | 'monuments' | 'developments';
type PhasePanel = 'turnStatus' | 'production' | 'build' | 'development' | 'discard';

type SectionPreferences = Record<ConstructionSection, boolean>;

const DEFAULT_SECTION_PREFERENCES: SectionPreferences = {
  cities: false,
  monuments: false,
  developments: false,
};

function App() {
  const dispatch = useAppDispatch();
  const turnStatus = useAppSelector(selectTurnStatus);
  const actionLog = useAppSelector(selectActionLog);
  const dicePanel = useAppSelector(selectDicePanelModel);
  const diceOutcome = useAppSelector(selectDiceOutcomeModel);
  const productionPanel = useAppSelector(selectProductionPanelModel);
  const buildPanel = useAppSelector(selectBuildPanelModel);
  const developmentPanel = useAppSelector(selectDevelopmentPanelModel);
  const exchangePanel = useAppSelector(selectExchangePanelModel);
  const disasterPanel = useAppSelector(selectDisasterPanelModel);
  const discardPanel = useAppSelector(selectDiscardPanelModel);
  const endgameStatus = useAppSelector(selectEndgameStatus);
  const canUndo = useAppSelector(selectCanUndo);
  const canRedo = useAppSelector(selectCanRedo);
  const [selectedGoodsToSpend, setSelectedGoodsToSpend] = useState<string[]>([]);
  const [playerCount, setPlayerCount] = useState<number>(MIN_PLAYERS);
  const [playerControllers, setPlayerControllers] = useState<
    Record<number, ControllerOption>
  >({
    1: 'human',
    2: 'human',
    3: 'human',
    4: 'human',
  });
  const [isDiceReferenceExpanded, setIsDiceReferenceExpanded] = useState(false);
  const [goodsToKeepByType, setGoodsToKeepByType] = useState<Record<string, number>>(
    {},
  );
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
  const getSkullDenotation = (skulls: number) =>
    Array.from({ length: skulls }, () => '☠️').join(' ');

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
  const cityCatalogSorted = [...buildPanel.cityCatalog].sort((a, b) => {
    if (a.completed === b.completed) {
      return 0;
    }
    return a.completed ? 1 : -1;
  });
  const monumentOrder = new Map(
    buildPanel.monumentCatalog.map((monument, index) => [monument.monumentId, index]),
  );
  const monumentCatalogSorted = [...buildPanel.monumentCatalog].sort((a, b) => {
    if (a.completed === b.completed) {
      return (monumentOrder.get(a.monumentId) ?? 0) - (monumentOrder.get(b.monumentId) ?? 0);
    }
    return a.completed ? 1 : -1;
  });
  const developmentOrder = new Map(
    developmentPanel.developmentCatalog.map((development, index) => [
      development.id,
      index,
    ]),
  );
  const developmentCatalogSorted = [...developmentPanel.developmentCatalog].sort(
    (a, b) => {
      if (a.purchased === b.purchased) {
        return (developmentOrder.get(a.id) ?? 0) - (developmentOrder.get(b.id) ?? 0);
      }
      return a.purchased ? 1 : -1;
    },
  );
  const topScore = turnStatus.playerPoints.reduce(
    (best, entry) => Math.max(best, entry.points),
    Number.NEGATIVE_INFINITY,
  );
  const winners =
    topScore === Number.NEGATIVE_INFINITY
      ? []
      : turnStatus.playerPoints.filter((entry) => entry.points === topScore);
  const activePhasePanel: PhasePanel | null = useMemo(() => {
    switch (turnStatus.phase) {
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
  }, [turnStatus.phase]);
  const getPanelClassName = (panel: PhasePanel) =>
    activePhasePanel === panel ? 'app-panel is-active-phase' : 'app-panel';

  const toggleGoodsSpend = (goodsType: string) => {
    setSelectedGoodsToSpend((current) =>
      current.includes(goodsType)
        ? current.filter((entry) => entry !== goodsType)
        : [...current, goodsType],
    );
  };
  useEffect(() => {
    setGoodsToKeepByType((current) => {
      const next: Record<string, number> = {};
      discardPanel.goodsOptions.forEach((option) => {
        next[option.goodsType] = current[option.goodsType] ?? option.quantity;
      });
      return next;
    });
  }, [discardPanel.goodsOptions]);

  const updateGoodsToKeep = (goodsType: string, value: string) => {
    const parsed = Number(value);
    const sanitized = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
    setGoodsToKeepByType((current) => ({
      ...current,
      [goodsType]: sanitized,
    }));
  };

  const updatePlayerController = (
    playerNumber: number,
    controller: ControllerOption,
  ) => {
    setPlayerControllers((current) => ({
      ...current,
      [playerNumber]: controller,
    }));
  };

  const renderControllerOptions = (idPrefix: string) => (
    <div className="development-list">
      {Array.from({ length: playerCount }, (_, index) => {
        const playerNumber = index + 1;
        const controlId = `${idPrefix}-controller-${playerNumber}`;
        return (
          <label
            key={controlId}
            className="player-count-control"
            htmlFor={controlId}
          >
            <span>Player {playerNumber}</span>
            <select
              id={controlId}
              value={playerControllers[playerNumber] ?? 'human'}
              onChange={(event) =>
                updatePlayerController(
                  playerNumber,
                  event.target.value as ControllerOption,
                )
              }
            >
              <option value="human">Human</option>
              <option value="bot">Bot</option>
            </select>
          </label>
        );
      })}
    </div>
  );

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
        <div className="title-row">
          <h1>Roll Through the Ages</h1>
        </div>
        {!turnStatus.isGameActive ? (
          <section className="app-panel setup-panel">
            <h2>Start New Game</h2>
            <p>Choose the number of players, then begin.</p>
            {renderControllerOptions('setup')}
            <div className="title-actions">
              <label className="player-count-control" htmlFor="player-count-select">
                <span>Players</span>
                <select
                  id="player-count-select"
                  value={playerCount}
                  onChange={(event) => setPlayerCount(Number(event.target.value))}
                >
                  {Array.from(
                    { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
                    (_, index) => MIN_PLAYERS + index,
                  ).map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() =>
                  dispatch(
                    startGame({
                      players: createPlayers(playerCount, playerControllers),
                    }),
                  )
                }
              >
                Start Game
              </button>
            </div>
          </section>
        ) : null}
        {turnStatus.isGameActive && endgameStatus.isGameOver ? (
          <section className="app-panel victory-panel">
            <h2>Game Over</h2>
            <p>
              {winners.length > 1
                ? `Tie at ${topScore} VP: ${winners.map((winner) => winner.playerName).join(', ')}`
                : `Winner: ${winners[0]?.playerName ?? 'Unknown'} (${topScore} VP)`}
            </p>
            {endgameStatus.reasons.length > 0 ? (
              <div>
                <p className="choice-label">End Criteria Triggered</p>
                <ul className="inline-note">
                  {endgameStatus.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="scoreboard-list">
              {turnStatus.playerPoints.map((entry) => (
                <article key={`victory-${entry.playerId}`} className="scoreboard-card">
                  <p className="development-title">{entry.playerName}</p>
                  <p className="scoreboard-row">Monuments: {entry.breakdown.monuments}</p>
                  <p className="scoreboard-row">
                    Developments: {entry.breakdown.developments}
                  </p>
                  <p className="scoreboard-row">Bonuses: {entry.breakdown.bonuses}</p>
                  <p className="scoreboard-row">Penalties: -{entry.breakdown.penalties}</p>
                  <p className="scoreboard-row">
                    <strong>Total: {entry.breakdown.total}</strong>
                  </p>
                </article>
              ))}
            </div>
            <div className="title-actions">
              <label className="player-count-control" htmlFor="player-count-select-end">
                <span>Players</span>
                <select
                  id="player-count-select-end"
                  value={playerCount}
                  onChange={(event) => setPlayerCount(Number(event.target.value))}
                >
                  {Array.from(
                    { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
                    (_, index) => MIN_PLAYERS + index,
                  ).map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() =>
                  dispatch(
                    startGame({
                      players: createPlayers(playerCount, playerControllers),
                    }),
                  )
                }
              >
                Play Again
              </button>
            </div>
          </section>
        ) : null}
        {turnStatus.isGameActive && !endgameStatus.isGameOver ? (
          <>
            <div className="board-grid">
          <section className={getPanelClassName('turnStatus')} aria-live="polite">
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
              <strong>Controller:</strong>{' '}
              {turnStatus.activePlayerController ?? '-'}
            </p>
            <p>
              <strong>Phase:</strong> {turnStatus.phase ?? '-'}
            </p>
            <div className="actions">
              <button
                type="button"
                onClick={() => dispatch(endTurn())}
                disabled={!discardPanel.canEndTurn}
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
            {!discardPanel.canEndTurn && discardPanel.endTurnReason ? (
              <p className="hint-text">{discardPanel.endTurnReason}</p>
            ) : null}
            {turnStatus.playerPoints.length > 0 ? (
              <div className="scoreboard-list">
                {turnStatus.playerPoints.map((entry) => (
                  <article key={entry.playerId} className="scoreboard-card">
                    <p className="development-title">
                      {entry.playerName} {entry.playerId === turnStatus.activePlayerId ? '• Active' : ''}
                    </p>
                    <p className="scoreboard-row">Monuments: {entry.breakdown.monuments}</p>
                    <p className="scoreboard-row">Developments: {entry.breakdown.developments}</p>
                    <p className="scoreboard-row">Bonuses: {entry.breakdown.bonuses}</p>
                    <p className="scoreboard-row">Penalties: -{entry.breakdown.penalties}</p>
                    <p className="scoreboard-row"><strong>Total: {entry.breakdown.total}</strong></p>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <section className={getPanelClassName('production')}>
            <h2>Production</h2>
            <div className="title-actions">
              <p>
                Rerolls available: {rerollEmoji}
                {dicePanel.singleDieRerollsRemaining > 0
                  ? ` • Single-die: ${dicePanel.singleDieRerollsRemaining}`
                  : ''}
              </p>
              <button
                type="button"
                onClick={() => dispatch(rollDice())}
                disabled={!dicePanel.canRoll}
              >
                Reroll Dice
              </button>
            </div>
            <article className="outcome-card">
              <p className="development-title">Total ({diceOutcome.summary ?? 'Projected'})</p>
              <p className="scoreboard-row">🍖 Food: +{diceOutcome.food.produced}</p>
              <p className="scoreboard-row">🪙 Coins: +{diceOutcome.coinsProduced}</p>
              <p className="scoreboard-row">👷 Workers: +{diceOutcome.workersProduced}</p>
              <p className="scoreboard-row">📦 Goods: +{diceOutcome.goodsProduced}</p>
              <p className="scoreboard-row">
                ☠️ Skulls: {diceOutcome.skulls}
              </p>
              {diceOutcome.penalties.foodPenalty > 0 ? (
                <p className="outcome-penalty">
                  ⚠️ Food shortage: -{diceOutcome.penalties.foodPenalty} VP (
                  {diceOutcome.food.shortage} unfed
                  {diceOutcome.food.shortage === 1 ? ' city' : ' cities'})
                </p>
              ) : null}
              {diceOutcome.penalties.disasterPenalty > 0 ? (
                <p className="outcome-penalty">
                  ⚠️ Disaster penalty: -{diceOutcome.penalties.disasterPenalty} VP
                </p>
              ) : null}
            </article>
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
                    {dicePanel.hasSingleDieRerollEffect ? (
                      <button
                        type="button"
                        onClick={() =>
                          dispatch(rerollSingleDie({ dieIndex: die.index }))
                        }
                        disabled={!die.canSingleDieReroll}
                      >
                        Reroll This Die
                      </button>
                    ) : null}
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
            <div className="collapsible-header">
              <p className="choice-label">All Die Faces</p>
              <button
                type="button"
                className="section-toggle"
                onClick={() => setIsDiceReferenceExpanded((current) => !current)}
              >
                {isDiceReferenceExpanded ? 'Collapse' : 'Expand'}
              </button>
            </div>
            {isDiceReferenceExpanded ? (
              <ul className="inline-note">
                {dicePanel.referenceFaces.map((face, index) => (
                  <li key={`face-${index}`}>{face.label}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="app-panel">
            <h2>Disaster Reference</h2>
            <p>Disasters trigger by total skulls rolled this turn.</p>
            <div className="disaster-list">
              {disasterPanel.disasters.map((disaster) => (
                <article
                  key={disaster.id}
                  className={disaster.isTriggered ? 'disaster-card salient-disaster' : 'disaster-card'}
                >
                  <p className="development-title">
                    {getSkullDenotation(disaster.skulls)} {disaster.name}
                  </p>
                  <p className="development-effect">{disaster.effectText}</p>
                  <p className="inline-note">Targets: {disaster.targetsText}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel-pair">
            <section className={getPanelClassName('build')}>
              <h2>Build</h2>
              <p>
                {buildPanel.canBuild
                  ? 'Build targets available.'
                  : buildPanel.reason ?? 'Build flow ready.'}
              </p>
              <p>Workers: {buildPanel.workersAvailable}</p>
              <p>Stored food: {buildPanel.storedFood}</p>
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
                    {cityCatalogSorted.map((city) => (
                      <article key={`city-card-${city.cityIndex}`} className="development-card">
                        <p className="development-title">
                          {city.label} ({city.workersCommitted}/{city.workerCost})
                          {city.completed ? ' • Built' : ''}
                        </p>
                        <p className="development-effect">
                          {city.workerCost > 0
                            ? 'Adds 1 die when built.'
                            : 'Starting city.'}
                        </p>
                        {!city.completed ? (
                          <button
                            type="button"
                            onClick={() =>
                              dispatch(buildCity({ cityIndex: city.cityIndex }))
                            }
                            disabled={!city.canBuild}
                          >
                            Build City
                          </button>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="development-list">
                    {buildPanel.cityCatalog
                      .filter((city) => city.completed)
                      .map((city) => (
                        <article key={`city-collapsed-${city.cityIndex}`} className="development-card">
                          <p className="development-title">
                            {city.label} ({city.workersCommitted}/{city.workerCost}) • Built
                          </p>
                          <p className="development-effect">
                            {city.workerCost > 0
                              ? 'Adds 1 die when built.'
                              : 'Starting city.'}
                          </p>
                        </article>
                      ))}
                  </div>
                )}
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
                    {monumentCatalogSorted.map((monument) => (
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
                        {monument.specialEffectText ? (
                          <p className="development-effect">{monument.specialEffectText}</p>
                        ) : null}
                        {!monument.completed ? (
                          <button
                            type="button"
                            onClick={() =>
                              dispatch(buildMonument({ monumentId: monument.monumentId }))
                            }
                            disabled={!monument.canBuild}
                          >
                            Build Monument
                          </button>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="development-list">
                    {buildPanel.monumentCatalog
                      .filter((monument) => monument.completed)
                      .map((monument) => (
                        <article
                          key={`monument-collapsed-${monument.monumentId}`}
                          className="development-card"
                        >
                          <p className="development-title">
                            {monument.label} ({monument.workersCommitted}/{monument.workerCost}) • Completed
                          </p>
                          <p className="development-effect">
                            Points: {monument.pointsText} (first/later completion)
                          </p>
                          {monument.specialEffectText ? (
                            <p className="development-effect">{monument.specialEffectText}</p>
                          ) : null}
                        </article>
                      ))}
                  </div>
                )}
              </div>
            </section>

            <section className={getPanelClassName('development')}>
              <div className="title-row">
                <h2>Development</h2>
                <button
                  type="button"
                  onClick={() => dispatch(skipDevelopment())}
                  disabled={!developmentPanel.canSkip}
                >
                  Skip Development
                </button>
              </div>
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
              {exchangePanel.exchanges.length > 0 ? (
                <>
                  <p className="choice-label">Exchange Effects</p>
                  <p>{exchangePanel.reason ?? 'Apply exchanges as needed.'}</p>
                  <div className="development-list">
                    {exchangePanel.exchanges.map((exchange) => {
                      return (
                        <article key={exchange.key} className="development-card">
                          <p className="development-title">
                            {exchange.developmentName}: {exchange.from}
                            {' -> '}
                            {exchange.to}
                          </p>
                          <p className="development-effect">
                            Rate: 1 {exchange.from} = {exchange.rate} {exchange.to}
                          </p>
                          <p className="inline-note">Available: {exchange.sourceAmount}</p>
                          <button
                            type="button"
                            onClick={() =>
                              dispatch(
                                applyExchange({
                                  from: exchange.from,
                                  to: exchange.to,
                                  amount: 1,
                                }),
                              )
                            }
                            disabled={!exchange.canApply}
                          >
                            Exchange 1 {exchange.from}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </>
              ) : null}
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
                  {developmentCatalogSorted.map((development) => {
                    const canAffordWithSelection =
                      effectiveCoinsAvailable >= development.cost;
                    return (
                      <article key={development.id} className="development-card">
                      <p className="development-title">
                        {development.name} ({development.cost}🪙, +{development.points} VP)
                        {development.purchased ? ' • Purchased' : ''}
                      </p>
                      <p className="development-effect">{development.effectDescription}</p>
                      {!development.purchased ? (
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
                            !canAffordWithSelection
                          }
                        >
                          Buy Development
                        </button>
                      ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="development-list">
                  {developmentPanel.developmentCatalog
                    .filter((development) => development.purchased)
                    .map((development) => (
                      <article key={`development-collapsed-${development.id}`} className="development-card">
                        <p className="development-title">
                          {development.name} ({development.cost}🪙, +{development.points} VP) • Purchased
                        </p>
                        <p className="development-effect">{development.effectDescription}</p>
                      </article>
                    ))}
                </div>
              )}
            </section>
          </section>

          <section className="panel-pair">
            <section className={getPanelClassName('discard')}>
              <h2>Discard</h2>
              <p>{discardPanel.reason ?? 'Choose goods to keep and apply discard.'}</p>
              <p>
                Goods limit:{' '}
                {discardPanel.goodsLimit === Infinity
                  ? 'No limit'
                  : 'Per-type track limits'}
              </p>
              <p>Total goods: {discardPanel.totalGoods}</p>
              <p>Overflow: {discardPanel.overflow}</p>
              {discardPanel.isActionAllowed ? (
                <div className="development-list">
                  {discardPanel.goodsOptions.map((option) => (
                    <article key={`discard-${option.goodsType}`} className="development-card">
                      <p className="development-title">
                        {option.goodsType} (owned: {option.quantity})
                      </p>
                      <label className="choice-label" htmlFor={`keep-${option.goodsType}`}>
                        Keep quantity
                      </label>
                      <input
                        id={`keep-${option.goodsType}`}
                        type="number"
                        min={0}
                        max={option.quantity}
                        value={goodsToKeepByType[option.goodsType] ?? option.quantity}
                        onChange={(event) =>
                          updateGoodsToKeep(option.goodsType, event.target.value)
                        }
                      />
                    </article>
                  ))}
                  <button
                    type="button"
                    onClick={() => dispatch(discardGoods({ goodsToKeepByType }))}
                    disabled={!discardPanel.isActionAllowed}
                  >
                    Apply Discard
                  </button>
                </div>
              ) : null}
            </section>
            <section className="app-panel">
              <h2>Action Log</h2>
              <textarea
                className="log-textbox"
                readOnly
                value={actionLog.join('\n')}
                aria-label="Action log history"
              />
            </section>
          </section>
            </div>
          </>
        ) : null}

        {turnStatus.errorMessage ? (
          <p className="error-text">{turnStatus.errorMessage}</p>
        ) : null}
      </section>
    </main>
  );
}

export default App;




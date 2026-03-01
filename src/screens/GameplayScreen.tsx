import { ActionLogPanel } from '@/components/ActionLogPanel';
import { ProductionPanel } from '@/components/panels/ProductionPanel';
import { useEventPulse } from '@/hooks/useEventPulse';
import { TurnStatusData, TurnStatusPanel } from '@/components/panels/TurnStatusPanel';
import { formatResourceLabel } from '@/utils/gameUiFormatters';
import { PhasePanel } from '@/viewModels/gameViewModel';
import {
  selectBuildPanelModel,
  selectDevelopmentPanelModel,
  selectDiceOutcomeModel,
  selectDicePanelModel,
  selectDisasterPanelModel,
  selectDiscardPanelModel,
  selectExchangePanelModel,
  selectLatestEvent,
  selectProductionPanelModel,
  selectTutorialViewModel,
  selectTurnOutcomeCallouts,
} from '@/store/selectors';

type ConstructionSection = 'cities' | 'monuments' | 'developments';

type GameplayScreenProps = {
  controlsLockedByBot: boolean;
  botStepDelayMs: number;
  activePhasePanel: PhasePanel | null;
  turnStatus: TurnStatusData;
  tutorial: ReturnType<typeof selectTutorialViewModel>;
  canUndo: boolean;
  canRedo: boolean;
  latestAnnouncement: string | null;
  latestEvent: ReturnType<typeof selectLatestEvent>;
  dicePanel: ReturnType<typeof selectDicePanelModel>;
  diceOutcome: ReturnType<typeof selectDiceOutcomeModel>;
  productionPanel: ReturnType<typeof selectProductionPanelModel>;
  buildPanel: ReturnType<typeof selectBuildPanelModel>;
  developmentPanel: ReturnType<typeof selectDevelopmentPanelModel>;
  exchangePanel: ReturnType<typeof selectExchangePanelModel>;
  disasterPanel: ReturnType<typeof selectDisasterPanelModel>;
  discardPanel: ReturnType<typeof selectDiscardPanelModel>;
  turnOutcomeCallouts: ReturnType<typeof selectTurnOutcomeCallouts>;
  rerollEmoji: string;
  isDiceReferenceExpanded: boolean;
  cityCatalogSorted: ReturnType<typeof selectBuildPanelModel>['cityCatalog'];
  monumentCatalogSorted: ReturnType<typeof selectBuildPanelModel>['monumentCatalog'];
  isCitiesExpanded: boolean;
  isMonumentsExpanded: boolean;
  isDevelopmentsExpanded: boolean;
  effectiveCoinsAvailable: number;
  selectedGoodsCoins: number;
  selectedGoodsToSpend: string[];
  selectedGoodsLookup: Set<string>;
  developmentCatalogSorted: ReturnType<
    typeof selectDevelopmentPanelModel
  >['developmentCatalog'];
  goodsToKeepByType: Record<string, number>;
  actionLog: string[];
  getPanelClassName: (activePhasePanel: PhasePanel | null, panel: PhasePanel) => string;
  getLockBadge: (lockDecision: string) => string;
  getSkullDenotation: (skulls: number) => string;
  onEndTurn: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleDiceReference: () => void;
  onRollDice: () => void;
  onSelectProduction: (dieIndex: number, productionIndex: number) => void;
  onRerollSingleDie: (dieIndex: number) => void;
  onKeepDie: (dieIndex: number) => void;
  onToggleConstructionSection: (section: ConstructionSection) => void;
  onBuildCity: (cityIndex: number) => void;
  onBuildMonument: (monumentId: string) => void;
  onSkipDevelopment: () => void;
  onToggleGoodsSpend: (goodsType: string) => void;
  onApplyExchange: (from: string, to: string, amount: number) => void;
  onBuyDevelopment: (developmentId: string, goodsTypeNames: string[]) => void;
  onUpdateGoodsToKeep: (goodsType: string, value: string) => void;
  onApplyDiscard: (goodsToKeepByType: Record<string, number>) => void;
  onAdvanceTutorialStep: () => void;
};

export function GameplayScreen({
  controlsLockedByBot,
  botStepDelayMs,
  activePhasePanel,
  turnStatus,
  tutorial,
  canUndo,
  canRedo,
  latestAnnouncement,
  latestEvent,
  dicePanel,
  diceOutcome,
  productionPanel,
  buildPanel,
  developmentPanel,
  exchangePanel,
  disasterPanel,
  discardPanel,
  turnOutcomeCallouts,
  rerollEmoji,
  isDiceReferenceExpanded,
  cityCatalogSorted,
  monumentCatalogSorted,
  isCitiesExpanded,
  isMonumentsExpanded,
  isDevelopmentsExpanded,
  effectiveCoinsAvailable,
  selectedGoodsCoins,
  selectedGoodsToSpend,
  selectedGoodsLookup,
  developmentCatalogSorted,
  goodsToKeepByType,
  actionLog,
  getPanelClassName,
  getLockBadge,
  getSkullDenotation,
  onEndTurn,
  onUndo,
  onRedo,
  onToggleDiceReference,
  onRollDice,
  onSelectProduction,
  onRerollSingleDie,
  onKeepDie,
  onToggleConstructionSection,
  onBuildCity,
  onBuildMonument,
  onSkipDevelopment,
  onToggleGoodsSpend,
  onApplyExchange,
  onBuyDevelopment,
  onUpdateGoodsToKeep,
  onApplyDiscard,
  onAdvanceTutorialStep,
}: GameplayScreenProps) {
  const buildExchanges = exchangePanel.exchanges.filter(
    (exchange) => exchange.relevantInBuild,
  );
  const developmentExchanges = exchangePanel.exchanges.filter(
    (exchange) => exchange.relevantInDevelopment,
  );
  const eventPulseMs = Math.max(220, Math.min(900, Math.round(botStepDelayMs * 0.7)));
  const isEventPulsing = useEventPulse(latestEvent?.id ?? null, eventPulseMs);
  const rerolledDieIndices =
    latestEvent &&
    isEventPulsing &&
    latestEvent.type === 'dice_roll_resolved' &&
    Array.isArray(latestEvent.payload.rerolledDieIndices)
      ? latestEvent.payload.rerolledDieIndices
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= 0)
      : [];
  const selectedDieIndices =
    latestEvent &&
    isEventPulsing &&
    latestEvent.type === 'dice_roll_resolved' &&
    Number.isInteger(Number(latestEvent.payload.dieIndex))
      ? [Number(latestEvent.payload.dieIndex)]
      : [];
  const pulsedDieIndices =
    rerolledDieIndices.length > 0 ? rerolledDieIndices : selectedDieIndices;
  const lockChangedDieIndices =
    latestEvent &&
    isEventPulsing &&
    latestEvent.type === 'die_lock_changed' &&
    Number.isInteger(Number(latestEvent.payload.dieIndex))
      ? [Number(latestEvent.payload.dieIndex)]
      : [];
  const pulsePanels =
    latestEvent &&
    isEventPulsing &&
    latestEvent.type === 'phase_transition' &&
    activePhasePanel
      ? new Set<PhasePanel>([activePhasePanel])
      : null;
  const productionOutcomeCallouts = turnOutcomeCallouts.filter(
    (callout) => callout.category === 'production' || callout.category === 'penalty',
  );
  const disasterImmunityCallouts = turnOutcomeCallouts.filter(
    (callout) => callout.category === 'immunity',
  );
  const constructionCallouts = turnOutcomeCallouts.filter(
    (callout) => callout.category === 'construction',
  );
  const getMotionPanelClassName = (panel: PhasePanel): string => {
    const classNames = [getPanelClassName(activePhasePanel, panel)];
    if (pulsePanels?.has(panel)) {
      classNames.push('is-event-pulse');
    }
    return classNames.join(' ');
  };

  return (
    <fieldset
      className="gameplay-shell"
      disabled={controlsLockedByBot}
      style={{ ['--event-motion-ms' as string]: `${eventPulseMs}ms` }}
    >
      <div className="board-grid">
        <TurnStatusPanel
          className={getMotionPanelClassName('turnStatus')}
          turnStatus={turnStatus}
          controlsLockedByBot={controlsLockedByBot}
          botStepDelayMs={botStepDelayMs}
          canEndTurn={discardPanel.canEndTurn}
          endTurnReason={discardPanel.endTurnReason}
          canUndo={canUndo}
          canRedo={canRedo}
          latestAnnouncement={latestAnnouncement}
          onEndTurn={onEndTurn}
          onUndo={onUndo}
          onRedo={onRedo}
        />

        <ProductionPanel
          className={getMotionPanelClassName('production')}
          rerollEmoji={rerollEmoji}
          motionEventType={isEventPulsing ? latestEvent?.type ?? null : null}
          rerolledDieIndices={pulsedDieIndices}
          lockChangedDieIndices={lockChangedDieIndices}
          dicePanel={dicePanel}
          diceOutcome={diceOutcome}
          productionPanel={productionPanel}
          outcomeCallouts={productionOutcomeCallouts}
          isDiceReferenceExpanded={isDiceReferenceExpanded}
          onToggleDiceReference={onToggleDiceReference}
          getLockBadge={getLockBadge}
          onRollDice={onRollDice}
          onSelectProduction={onSelectProduction}
          onRerollSingleDie={onRerollSingleDie}
          onKeepDie={onKeepDie}
        />

        <section className={getMotionPanelClassName('disaster')}>
            <h2>Disaster Reference</h2>
            <p>Disasters trigger by total skulls rolled this turn.</p>
            {disasterImmunityCallouts.length > 0 ? (
              <div className="outcome-callouts">
                {disasterImmunityCallouts.map((callout) => (
                  <article
                    key={callout.id}
                    className="outcome-callout outcome-callout-positive"
                  >
                    <p className="development-title">{callout.title}</p>
                    <p className="scoreboard-row">{callout.detail}</p>
                  </article>
                ))}
              </div>
            ) : null}
            <div className="disaster-list">
            {disasterPanel.disasters.map((disaster) => (
              <article
                key={disaster.id}
                className={
                  disaster.isTriggered ? 'disaster-card salient-disaster' : 'disaster-card'
                }
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
          <section className={getMotionPanelClassName('build')}>
            <h2>Build</h2>
            <p>
              {buildPanel.canBuild
                ? 'Build targets available.'
                : buildPanel.reason ?? 'Build flow ready.'}
            </p>
            <p>{formatResourceLabel('Workers')}: {buildPanel.workersAvailable}</p>
            <p>{formatResourceLabel('Food')}: {buildPanel.storedFood}</p>
            {constructionCallouts.length > 0 ? (
              <div className="outcome-callouts">
                {constructionCallouts.map((callout) => (
                  <article
                    key={callout.id}
                    className={
                      callout.tone === 'positive'
                        ? 'outcome-callout outcome-callout-positive'
                        : 'outcome-callout'
                    }
                  >
                    <p className="development-title">{callout.title}</p>
                    <p className="scoreboard-row">{callout.detail}</p>
                  </article>
                ))}
              </div>
            ) : null}
            <p>{formatResourceLabel('Goods')} stored:</p>
            <div className="goods-list">
              {buildPanel.goodsStoredSummary.map((entry) => (
                <p key={entry.goodsType} className="goods-row">
                  {formatResourceLabel(entry.goodsType)}: {entry.quantity} /{' '}
                  {entry.limit === Infinity ? '∞' : entry.limit}
                </p>
              ))}
            </div>
            {buildExchanges.length > 0 ? (
              <>
                <p className="choice-label">Exchange Effects</p>
                <p>{exchangePanel.reason ?? 'Apply conversions as needed.'}</p>
                <div className="development-list">
                  {buildExchanges.map((exchange) => (
                    <article key={`build-${exchange.key}`} className="development-card">
                      <p className="development-title">
                        {exchange.developmentName}: {formatResourceLabel(exchange.from)}
                        {' -> '}
                        {formatResourceLabel(exchange.to)}
                      </p>
                      <p className="development-effect">
                        Rate: 1 {formatResourceLabel(exchange.from)} = {exchange.rate}{' '}
                        {formatResourceLabel(exchange.to)}
                      </p>
                      <p className="inline-note">Available: {exchange.sourceAmount}</p>
                      <button
                        type="button"
                        onClick={() => onApplyExchange(exchange.from, exchange.to, 1)}
                        disabled={!exchange.canApply}
                      >
                        Exchange 1 {formatResourceLabel(exchange.from)}
                      </button>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
            <div className="build-targets">
              <div className="collapsible-header">
                <p className="choice-label">Cities</p>
                <button
                  type="button"
                  className="section-toggle"
                  onClick={() => onToggleConstructionSection('cities')}
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
                        {city.workerCost > 0 ? 'Adds 1 die when built.' : 'Starting city.'}
                      </p>
                      {!city.completed ? (
                        <button
                          type="button"
                          onClick={() => onBuildCity(city.cityIndex)}
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
                          {city.workerCost > 0 ? 'Adds 1 die when built.' : 'Starting city.'}
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
                  onClick={() => onToggleConstructionSection('monuments')}
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
                          onClick={() => onBuildMonument(monument.monumentId)}
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

          <section className={getMotionPanelClassName('development')}>
            <div className="title-row">
              <h2>Development</h2>
              <button type="button" onClick={onSkipDevelopment} disabled={!developmentPanel.canSkip}>
                Skip Development
              </button>
            </div>
            <p>{developmentPanel.reason ?? 'Choose a development to purchase.'}</p>
            <p>{formatResourceLabel('Coins')} available: {effectiveCoinsAvailable}</p>
            <p className="inline-note">
              Base {formatResourceLabel('Coins')}: {developmentPanel.coinsAvailable}
              {selectedGoodsCoins > 0 ? ` + ${formatResourceLabel('Goods')} value ${selectedGoodsCoins}` : ''}
            </p>
            <p>Total purchasing power: {developmentPanel.totalPurchasingPower} {formatResourceLabel('Coins')}</p>
            <p className="choice-label">{formatResourceLabel('Goods')} To Spend</p>
            <p>
              Selected:{' '}
              {selectedGoodsToSpend.length > 0
                ? selectedGoodsToSpend.map((goodsType) => formatResourceLabel(goodsType)).join(', ')
                : 'none'}
            </p>
            <div className="panel-actions">
              {developmentPanel.goodsSpendOptions.map((option) => (
                <button
                  key={option.goodsType}
                  type="button"
                  onClick={() => onToggleGoodsSpend(option.goodsType)}
                  disabled={option.quantity <= 0 || !developmentPanel.isActionAllowed}
                >
                  {selectedGoodsLookup.has(option.goodsType) ? '✅ ' : ''}
                  {formatResourceLabel(option.goodsType)} ({option.quantity})
                </button>
              ))}
            </div>
            {developmentExchanges.length > 0 ? (
              <>
                <p className="choice-label">Exchange Effects</p>
                <p>{exchangePanel.reason ?? 'Apply exchanges as needed.'}</p>
                <div className="development-list">
                  {developmentExchanges.map((exchange) => (
                    <article key={exchange.key} className="development-card">
                      <p className="development-title">
                        {exchange.developmentName}: {formatResourceLabel(exchange.from)}
                        {' -> '}
                        {formatResourceLabel(exchange.to)}
                      </p>
                      <p className="development-effect">
                        Rate: 1 {formatResourceLabel(exchange.from)} = {exchange.rate}{' '}
                        {formatResourceLabel(exchange.to)}
                      </p>
                      <p className="inline-note">Available: {exchange.sourceAmount}</p>
                      <button
                        type="button"
                        onClick={() => onApplyExchange(exchange.from, exchange.to, 1)}
                        disabled={!exchange.canApply}
                      >
                        Exchange 1 {formatResourceLabel(exchange.from)}
                      </button>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
            <div className="collapsible-header">
              <p className="choice-label">Development Options</p>
              <button
                type="button"
                className="section-toggle"
                onClick={() => onToggleConstructionSection('developments')}
              >
                {isDevelopmentsExpanded ? 'Collapse' : 'Expand'}
              </button>
            </div>
            {isDevelopmentsExpanded ? (
              <div className="development-list">
                {developmentCatalogSorted.map((development) => {
                  const canAffordWithSelection = effectiveCoinsAvailable >= development.cost;
                  return (
                    <article key={development.id} className="development-card">
                      <p className="development-title">
                        {development.name} ({development.cost}🪙, +{development.points} {formatResourceLabel('VP')})
                        {development.purchased ? ' • Purchased' : ''}
                      </p>
                      <p className="development-effect">{development.effectDescription}</p>
                      {!development.purchased ? (
                        <button
                          type="button"
                          onClick={() =>
                            onBuyDevelopment(development.id, selectedGoodsToSpend)
                          }
                          disabled={!developmentPanel.isActionAllowed || !canAffordWithSelection}
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
                        {development.name} ({development.cost}🪙, +{development.points} {formatResourceLabel('VP')}) • Purchased
                      </p>
                      <p className="development-effect">{development.effectDescription}</p>
                    </article>
                  ))}
              </div>
            )}
          </section>
        </section>

        <section className="panel-pair">
          <section className={getMotionPanelClassName('discard')}>
            <h2>Discard</h2>
            <p>{discardPanel.reason ?? 'Choose goods to keep and apply discard.'}</p>
            {discardPanel.isActionAllowed ? (
              <div className="development-list">
                {discardPanel.goodsOptions.map((option) => (
                  <article key={`discard-${option.goodsType}`} className="development-card">
                    <p className="development-title">
                      {formatResourceLabel(option.goodsType)} (owned: {option.quantity})
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
                        onUpdateGoodsToKeep(option.goodsType, event.target.value)
                      }
                    />
                  </article>
                ))}
                <button
                  type="button"
                  onClick={() => onApplyDiscard(goodsToKeepByType)}
                  disabled={!discardPanel.isActionAllowed}
                >
                  Apply Discard
                </button>
              </div>
            ) : null}
          </section>
          <ActionLogPanel entries={actionLog} ariaLabel="Action log history" />
        </section>
      </div>
      {tutorial.isActive ? (
        <section className="app-panel tutorial-panel tutorial-overlay">
          <div className="collapsible-header">
            <h2>Tutorial</h2>
          </div>
          <p className="scoreboard-row">
            Step {Math.min(tutorial.currentStepIndex + 1, tutorial.totalSteps)}/
            {tutorial.totalSteps}
          </p>
          <p className="development-title">{tutorial.step?.title ?? 'Tutorial'}</p>
          <p>{tutorial.instruction ?? 'Follow the guided steps.'}</p>
          {tutorial.step?.hint ? <p className="hint-text">{tutorial.step.hint}</p> : null}
          {tutorial.canContinue ? (
            <button type="button" onClick={onAdvanceTutorialStep}>
              Continue
            </button>
          ) : null}
        </section>
      ) : null}
    </fieldset>
  );
}

import { ActionLogPanel } from '@/components/ActionLogPanel';
import { ProductionPanel } from '@/components/panels/ProductionPanel';
import { TurnStatusData, TurnStatusPanel } from '@/components/panels/TurnStatusPanel';
import { PhasePanel } from '@/viewModels/gameViewModel';
import {
  selectBuildPanelModel,
  selectDevelopmentPanelModel,
  selectDiceOutcomeModel,
  selectDicePanelModel,
  selectDisasterPanelModel,
  selectDiscardPanelModel,
  selectExchangePanelModel,
  selectProductionPanelModel,
} from '@/store/selectors';

type ConstructionSection = 'cities' | 'monuments' | 'developments';

type GameplayScreenProps = {
  controlsLockedByBot: boolean;
  botStepDelayMs: number;
  activePhasePanel: PhasePanel | null;
  turnStatus: TurnStatusData;
  canUndo: boolean;
  canRedo: boolean;
  dicePanel: ReturnType<typeof selectDicePanelModel>;
  diceOutcome: ReturnType<typeof selectDiceOutcomeModel>;
  productionPanel: ReturnType<typeof selectProductionPanelModel>;
  buildPanel: ReturnType<typeof selectBuildPanelModel>;
  developmentPanel: ReturnType<typeof selectDevelopmentPanelModel>;
  exchangePanel: ReturnType<typeof selectExchangePanelModel>;
  disasterPanel: ReturnType<typeof selectDisasterPanelModel>;
  discardPanel: ReturnType<typeof selectDiscardPanelModel>;
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
};

export function GameplayScreen({
  controlsLockedByBot,
  botStepDelayMs,
  activePhasePanel,
  turnStatus,
  canUndo,
  canRedo,
  dicePanel,
  diceOutcome,
  productionPanel,
  buildPanel,
  developmentPanel,
  exchangePanel,
  disasterPanel,
  discardPanel,
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
}: GameplayScreenProps) {
  return (
    <fieldset className="gameplay-shell" disabled={controlsLockedByBot}>
      <div className="board-grid">
        <TurnStatusPanel
          className={getPanelClassName(activePhasePanel, 'turnStatus')}
          turnStatus={turnStatus}
          controlsLockedByBot={controlsLockedByBot}
          botStepDelayMs={botStepDelayMs}
          canEndTurn={discardPanel.canEndTurn}
          endTurnReason={discardPanel.endTurnReason}
          canUndo={canUndo}
          canRedo={canRedo}
          onEndTurn={onEndTurn}
          onUndo={onUndo}
          onRedo={onRedo}
        />

        <ProductionPanel
          className={getPanelClassName(activePhasePanel, 'production')}
          rerollEmoji={rerollEmoji}
          dicePanel={dicePanel}
          diceOutcome={diceOutcome}
          productionPanel={productionPanel}
          isDiceReferenceExpanded={isDiceReferenceExpanded}
          onToggleDiceReference={onToggleDiceReference}
          getLockBadge={getLockBadge}
          onRollDice={onRollDice}
          onSelectProduction={onSelectProduction}
          onRerollSingleDie={onRerollSingleDie}
          onKeepDie={onKeepDie}
        />

        <section className="app-panel">
          <h2>Disaster Reference</h2>
          <p>Disasters trigger by total skulls rolled this turn.</p>
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
          <section className={getPanelClassName(activePhasePanel, 'build')}>
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

          <section className={getPanelClassName(activePhasePanel, 'development')}>
            <div className="title-row">
              <h2>Development</h2>
              <button type="button" onClick={onSkipDevelopment} disabled={!developmentPanel.canSkip}>
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
            <p>Selected: {selectedGoodsToSpend.length > 0 ? selectedGoodsToSpend.join(', ') : 'none'}</p>
            <div className="panel-actions">
              {developmentPanel.goodsSpendOptions.map((option) => (
                <button
                  key={option.goodsType}
                  type="button"
                  onClick={() => onToggleGoodsSpend(option.goodsType)}
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
                  {exchangePanel.exchanges.map((exchange) => (
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
                        onClick={() => onApplyExchange(exchange.from, exchange.to, 1)}
                        disabled={!exchange.canApply}
                      >
                        Exchange 1 {exchange.from}
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
                        {development.name} ({development.cost}🪙, +{development.points} VP)
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
          <section className={getPanelClassName(activePhasePanel, 'discard')}>
            <h2>Discard</h2>
            <p>{discardPanel.reason ?? 'Choose goods to keep and apply discard.'}</p>
            <p>
              Goods limit:{' '}
              {discardPanel.goodsLimit === Infinity ? 'No limit' : 'Per-type track limits'}
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
    </fieldset>
  );
}

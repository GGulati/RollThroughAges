import { formatResourceLabel } from '@/utils/gameUiFormatters';

type DiceCard = {
  index: number;
  label: string;
  rolledSummary: string;
  lockDecision: string;
  canKeep: boolean;
  hasChoice: boolean;
  canChooseOption: boolean;
  optionCount: number;
  selectedOption: number | null;
  optionSummaries: string[];
  canSingleDieReroll: boolean;
};

type DicePanelData = {
  canRoll: boolean;
  hasSingleDieRerollEffect: boolean;
  singleDieRerollsRemaining: number;
  rerollsRemaining: number;
  referenceFaces: Array<{ label: string }>;
  diceCards: DiceCard[];
};

type DiceOutcomeData = {
  summary: string | null;
  food: {
    produced: number;
    shortage: number;
  };
  coinsProduced: number;
  workersProduced: number;
  goodsProduced: number;
  skulls: number;
  penalties: {
    foodPenalty: number;
    disasterPenalty: number;
  };
};

type ProductionPanelData = {
  canResolveProduction: boolean;
  reason: string | null;
};

type OutcomeCalloutData = {
  id: string;
  tone: 'neutral' | 'positive' | 'negative';
  title: string;
  detail: string;
};

type ProductionPanelProps = {
  className: string;
  rerollEmoji: string;
  motionEventType: string | null;
  motionEventId: string | null;
  diceMotionEventId: string | null;
  rerolledDieIndices: number[];
  lockChangedDieIndices: number[];
  dicePanel: DicePanelData;
  diceOutcome: DiceOutcomeData;
  productionPanel: ProductionPanelData;
  outcomeCallouts: OutcomeCalloutData[];
  isDiceReferenceExpanded: boolean;
  onToggleDiceReference: () => void;
  getLockBadge: (lockDecision: string) => string;
  onRollDice: () => void;
  onSelectProduction: (dieIndex: number, productionIndex: number) => void;
  onRerollSingleDie: (dieIndex: number) => void;
  onKeepDie: (dieIndex: number) => void;
};

export function ProductionPanel({
  className,
  rerollEmoji,
  motionEventType,
  motionEventId,
  diceMotionEventId,
  rerolledDieIndices,
  lockChangedDieIndices,
  dicePanel,
  diceOutcome,
  productionPanel,
  outcomeCallouts,
  isDiceReferenceExpanded,
  onToggleDiceReference,
  getLockBadge,
  onRollDice,
  onSelectProduction,
  onRerollSingleDie,
  onKeepDie,
}: ProductionPanelProps) {
  const shouldPulseOutcome =
    motionEventType === 'production_resolved' || motionEventType === 'penalty_applied';
  const shouldPulseDice = diceMotionEventId != null && rerolledDieIndices.length > 0;

  return (
    <section className={className}>
      <h2>Production</h2>
      <div className="title-actions">
        <p>
          Rerolls available: {rerollEmoji}
          {dicePanel.singleDieRerollsRemaining > 0
            ? ` • Single-die: ${dicePanel.singleDieRerollsRemaining}`
            : ''}
        </p>
        <button type="button" onClick={onRollDice} disabled={!dicePanel.canRoll}>
          Reroll Dice
        </button>
      </div>
      <article
        className={shouldPulseOutcome ? 'outcome-card is-outcome-shift' : 'outcome-card'}
      >
        <p className="development-title">Total ({diceOutcome.summary ?? 'Projected'})</p>
        <p className="scoreboard-row">{formatResourceLabel('Food')}: +{diceOutcome.food.produced}</p>
        <p className="scoreboard-row">{formatResourceLabel('Coins')}: +{diceOutcome.coinsProduced}</p>
        <p className="scoreboard-row">
          {formatResourceLabel('Workers')}: +{diceOutcome.workersProduced}
        </p>
        <p className="scoreboard-row">{formatResourceLabel('Goods')}: +{diceOutcome.goodsProduced}</p>
        <p className="scoreboard-row">{formatResourceLabel('Skulls')}: {diceOutcome.skulls}</p>
        {diceOutcome.penalties.foodPenalty > 0 ? (
          <p className="outcome-penalty">
            ⚠️ {formatResourceLabel('Food')} shortage: -{diceOutcome.penalties.foodPenalty}{' '}
            {formatResourceLabel('VP')} ({diceOutcome.food.shortage} unfed
            {diceOutcome.food.shortage === 1 ? ' city' : ' cities'})
          </p>
        ) : null}
        {diceOutcome.penalties.disasterPenalty > 0 ? (
          <p className="outcome-penalty">
            ⚠️ Disaster penalty: -{diceOutcome.penalties.disasterPenalty}{' '}
            {formatResourceLabel('VP')}
          </p>
        ) : null}
      </article>
      {outcomeCallouts.length > 0 ? (
        <div className="outcome-callouts">
          {outcomeCallouts.map((callout) => (
            <article
              key={callout.id}
              className={
                callout.tone === 'negative'
                  ? 'outcome-callout outcome-callout-negative'
                  : callout.tone === 'positive'
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
      {!productionPanel.canResolveProduction && productionPanel.reason ? (
        <p className="hint-text">{productionPanel.reason}</p>
      ) : null}
      <div className="dice-grid dice-grid-3d">
        {dicePanel.diceCards.map((die) => {
          const isLockPulse =
            motionEventType === 'die_lock_changed' &&
            lockChangedDieIndices.includes(die.index);
          const isRerollPulse =
            shouldPulseDice && rerolledDieIndices.includes(die.index);
          const pulseKey = isRerollPulse
            ? diceMotionEventId ?? 'dice-pulse'
            : isLockPulse
              ? motionEventId ?? 'lock-pulse'
              : 'stable';
          return (
            <article
              key={`${die.index}-${pulseKey}`}
            className={[
              'die-card',
              'die-card-3d',
              isLockPulse ? 'is-lock-shift' : '',
              isRerollPulse ? 'is-reroll-settle-3d' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <p className="die-title">Die {die.index + 1}</p>
            <div className="die-cube" aria-hidden="true">
              <span className="die-cube-face die-cube-front">{die.rolledSummary}</span>
              <span className="die-cube-face die-cube-back">🎲</span>
              <span className="die-cube-face die-cube-right">🎲</span>
              <span className="die-cube-face die-cube-left">🎲</span>
              <span className="die-cube-face die-cube-top">{die.index + 1}</span>
              <span className="die-cube-face die-cube-bottom">🎲</span>
            </div>
            {die.hasChoice ? (
              <div className="choice-block">
                <p className="choice-label">Production choice:</p>
                <div className="panel-actions">
                  {Array.from({ length: die.optionCount }, (_, optionIndex) => (
                    <button
                      key={`${die.index}-${optionIndex}`}
                      type="button"
                      onClick={() => onSelectProduction(die.index, optionIndex)}
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
                  onClick={() => onRerollSingleDie(die.index)}
                  disabled={!die.canSingleDieReroll}
                >
                  Reroll This Die
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onKeepDie(die.index)}
                disabled={!die.canKeep}
              >
                {die.lockDecision === 'kept' ? 'Unlock 🔓' : 'Lock 🔒'}
              </button>
            </div>
            </article>
          );
        })}
      </div>
      <div className="collapsible-header">
        <p className="choice-label">All Die Faces</p>
        <button type="button" className="section-toggle" onClick={onToggleDiceReference}>
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
  );
}

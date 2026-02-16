type DiceCard = {
  index: number;
  label: string;
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

type ProductionPanelProps = {
  className: string;
  rerollEmoji: string;
  dicePanel: DicePanelData;
  diceOutcome: DiceOutcomeData;
  productionPanel: ProductionPanelData;
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
  dicePanel,
  diceOutcome,
  productionPanel,
  isDiceReferenceExpanded,
  onToggleDiceReference,
  getLockBadge,
  onRollDice,
  onSelectProduction,
  onRerollSingleDie,
  onKeepDie,
}: ProductionPanelProps) {
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
      <article className="outcome-card">
        <p className="development-title">Total ({diceOutcome.summary ?? 'Projected'})</p>
        <p className="scoreboard-row">🍖 Food: +{diceOutcome.food.produced}</p>
        <p className="scoreboard-row">🪙 Coins: +{diceOutcome.coinsProduced}</p>
        <p className="scoreboard-row">👷 Workers: +{diceOutcome.workersProduced}</p>
        <p className="scoreboard-row">📦 Goods: +{diceOutcome.goodsProduced}</p>
        <p className="scoreboard-row">☠️ Skulls: {diceOutcome.skulls}</p>
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
        ))}
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

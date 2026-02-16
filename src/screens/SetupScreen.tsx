import { HeuristicConfig, LookaheadConfig } from '@/game/bot';
import { PlayerEndStateCard } from '@/components/PlayerEndStateCard';
import {
  BotSpeedOption,
  ControllerOption,
  HeadlessSimulationSummary,
  HeuristicUpdateHandlers,
} from './types';

type SetupScreenProps = {
  minPlayers: number;
  maxPlayers: number;
  playerCount: number;
  playerControllers: Record<number, ControllerOption>;
  onPlayerCountChange: (next: number) => void;
  onPlayerControllerChange: (
    playerNumber: number,
    controller: ControllerOption,
  ) => void;
  onStartGame: () => void;
  botSpeed: BotSpeedOption;
  onBotSpeedChange: (speed: BotSpeedOption) => void;
  isHeuristicSettingsExpanded: boolean;
  onToggleHeuristicSettings: () => void;
  isLookaheadSettingsExpanded: boolean;
  onToggleLookaheadSettings: () => void;
  heuristicConfig: HeuristicConfig;
  heuristicHandlers: HeuristicUpdateHandlers;
  onPreferExchangeFirstChange: (enabled: boolean) => void;
  lookaheadUtilityWeights: LookaheadConfig['utilityWeights'];
  onUpdateLookaheadUtilityWeight: (
    key: keyof LookaheadConfig['utilityWeights'],
    value: string,
  ) => void;
  onResetHeuristicDefaults: () => void;
  onResetLookaheadDefaults: () => void;
  headlessSimulations: HeadlessSimulationSummary[];
};

export function SetupScreen({
  minPlayers,
  maxPlayers,
  playerCount,
  playerControllers,
  onPlayerCountChange,
  onPlayerControllerChange,
  onStartGame,
  botSpeed,
  onBotSpeedChange,
  isHeuristicSettingsExpanded,
  onToggleHeuristicSettings,
  isLookaheadSettingsExpanded,
  onToggleLookaheadSettings,
  heuristicConfig,
  heuristicHandlers,
  onPreferExchangeFirstChange,
  lookaheadUtilityWeights,
  onUpdateLookaheadUtilityWeight,
  onResetHeuristicDefaults,
  onResetLookaheadDefaults,
  headlessSimulations,
}: SetupScreenProps) {
  const renderMetricRows = (metrics: Record<string, number>) =>
    Object.entries(metrics)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => (
        <p key={key} className="scoreboard-row">
          {key}: {value}
        </p>
      ));

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
                onPlayerControllerChange(
                  playerNumber,
                  event.target.value as ControllerOption,
                )
              }
            >
              <option value="human">Human</option>
              <option value="heuristicStandard">Heuristic Bot</option>
              <option value="heuristicCustom">Heuristic Bot (Custom)</option>
              <option value="lookaheadStandard">Lookahead Bot</option>
              <option value="lookaheadCustom">Lookahead Bot (Custom)</option>
            </select>
          </label>
        );
      })}
    </div>
  );

  return (
    <>
      <section className="app-panel setup-panel">
        <h2>Start New Game</h2>
        <label className="player-count-control" htmlFor="player-count-select">
          <span>Players</span>
          <select
            id="player-count-select"
            value={playerCount}
            onChange={(event) => onPlayerCountChange(Number(event.target.value))}
          >
            {Array.from(
              { length: maxPlayers - minPlayers + 1 },
              (_, index) => minPlayers + index,
            ).map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
        {renderControllerOptions('setup')}
        <button className="start-game-button" type="button" onClick={onStartGame}>
          Start Game
        </button>
      </section>
      <section className="app-panel setup-panel">
        <h2>Settings</h2>
        <label className="player-count-control" htmlFor="bot-speed-select">
          <span>Bot Speed</span>
          <select
            id="bot-speed-select"
            value={botSpeed}
            onChange={(event) => onBotSpeedChange(event.target.value as BotSpeedOption)}
          >
            <option value="normal">Normal (1s)</option>
            <option value="fast">Fast (0.5s)</option>
            <option value="veryFast">Very Fast (0.25s)</option>
          </select>
        </label>
        <article className="development-card">
          <div className="collapsible-header">
            <p className="choice-label">Heuristic Bot</p>
            <button
              type="button"
              className="section-toggle"
              onClick={onToggleHeuristicSettings}
            >
              {isHeuristicSettingsExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {isHeuristicSettingsExpanded ? (
            <div className="development-list">
              <p className="choice-label">Production Weights</p>
              <label className="player-count-control" htmlFor="heuristic-food">
                <span>Food</span>
                <input
                  id="heuristic-food"
                  type="number"
                  step="0.1"
                  value={heuristicConfig.productionWeights.food}
                  onChange={(event) =>
                    heuristicHandlers.updateProductionWeight('food', event.target.value)
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="heuristic-workers">
                <span>Workers</span>
                <input
                  id="heuristic-workers"
                  type="number"
                  step="0.1"
                  value={heuristicConfig.productionWeights.workers}
                  onChange={(event) =>
                    heuristicHandlers.updateProductionWeight(
                      'workers',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="heuristic-coins">
                <span>Coins</span>
                <input
                  id="heuristic-coins"
                  type="number"
                  step="0.1"
                  value={heuristicConfig.productionWeights.coins}
                  onChange={(event) =>
                    heuristicHandlers.updateProductionWeight('coins', event.target.value)
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="heuristic-goods">
                <span>Goods</span>
                <input
                  id="heuristic-goods"
                  type="number"
                  step="0.1"
                  value={heuristicConfig.productionWeights.goods}
                  onChange={(event) =>
                    heuristicHandlers.updateProductionWeight('goods', event.target.value)
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="heuristic-skulls">
                <span>Skulls</span>
                <input
                  id="heuristic-skulls"
                  type="number"
                  step="0.1"
                  value={heuristicConfig.productionWeights.skulls}
                  onChange={(event) =>
                    heuristicHandlers.updateProductionWeight('skulls', event.target.value)
                  }
                />
              </label>
              <p className="choice-label">Development Weights</p>
              <label className="player-count-control" htmlFor="heuristic-dev-points">
                <span>Points</span>
                <input
                  id="heuristic-dev-points"
                  type="number"
                  step="0.1"
                  value={heuristicConfig.developmentWeights.points}
                  onChange={(event) =>
                    heuristicHandlers.updateDevelopmentWeight(
                      'points',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="heuristic-dev-cost">
                <span>Cost</span>
                <input
                  id="heuristic-dev-cost"
                  type="number"
                  step="0.01"
                  value={heuristicConfig.developmentWeights.cost}
                  onChange={(event) =>
                    heuristicHandlers.updateDevelopmentWeight('cost', event.target.value)
                  }
                />
              </label>
              <p className="choice-label">Food / Starvation</p>
              <label className="player-count-control" htmlFor="heuristic-food-deficit-priority">
                <span>Food Deficit Priority</span>
                <input
                  id="heuristic-food-deficit-priority"
                  type="number"
                  step="0.1"
                  value={heuristicConfig.foodPolicyWeights.foodDeficitPriorityPerUnit}
                  onChange={(event) =>
                    heuristicHandlers.updateFoodPolicyWeight(
                      'foodDeficitPriorityPerUnit',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="heuristic-starvation-penalty">
                <span>Starvation Penalty</span>
                <input
                  id="heuristic-starvation-penalty"
                  type="number"
                  step="0.1"
                  value={heuristicConfig.foodPolicyWeights.starvationPenaltyPerUnit}
                  onChange={(event) =>
                    heuristicHandlers.updateFoodPolicyWeight(
                      'starvationPenaltyPerUnit',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="heuristic-force-reroll-shortage">
                <span>Force Reroll on Shortage</span>
                <input
                  id="heuristic-force-reroll-shortage"
                  type="checkbox"
                  checked={heuristicConfig.foodPolicyWeights.forceRerollOnFoodShortage}
                  onChange={(event) =>
                    heuristicHandlers.updateFoodPolicyWeight(
                      'forceRerollOnFoodShortage',
                      event.target.checked,
                    )
                  }
                />
              </label>
              <p className="choice-label">Build Weights</p>
              <label className="player-count-control" htmlFor="heuristic-build-city-progress">
                <span>City Progress</span>
                <input
                  id="heuristic-build-city-progress"
                  type="number"
                  step="0.1"
                  value={heuristicConfig.buildWeights.cityProgress}
                  onChange={(event) =>
                    heuristicHandlers.updateBuildWeight('cityProgress', event.target.value)
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="heuristic-build-city-workers">
                <span>City Workers</span>
                <input
                  id="heuristic-build-city-workers"
                  type="number"
                  step="0.1"
                  value={heuristicConfig.buildWeights.cityWorkersUsed}
                  onChange={(event) =>
                    heuristicHandlers.updateBuildWeight(
                      'cityWorkersUsed',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="heuristic-build-city-future-die">
                <span>City Extra Die Value</span>
                <input
                  id="heuristic-build-city-future-die"
                  type="number"
                  step="0.01"
                  value={heuristicConfig.buildWeights.cityExtraDieFutureValue}
                  onChange={(event) =>
                    heuristicHandlers.updateBuildWeight(
                      'cityExtraDieFutureValue',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label
                className="player-count-control"
                htmlFor="heuristic-build-city-deferred-scale"
              >
                <span>City Deferred Completion Scale</span>
                <input
                  id="heuristic-build-city-deferred-scale"
                  type="number"
                  step="0.01"
                  value={heuristicConfig.buildWeights.cityDeferredCompletionValueScale}
                  onChange={(event) =>
                    heuristicHandlers.updateBuildWeight(
                      'cityDeferredCompletionValueScale',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="heuristic-build-monument-points">
                <span>Monument Points</span>
                <input
                  id="heuristic-build-monument-points"
                  type="number"
                  step="0.1"
                  value={heuristicConfig.buildWeights.monumentPoints}
                  onChange={(event) =>
                    heuristicHandlers.updateBuildWeight(
                      'monumentPoints',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="heuristic-build-monument-efficiency">
                <span>Monument Efficiency</span>
                <input
                  id="heuristic-build-monument-efficiency"
                  type="number"
                  step="0.1"
                  value={heuristicConfig.buildWeights.monumentPointEfficiency}
                  onChange={(event) =>
                    heuristicHandlers.updateBuildWeight(
                      'monumentPointEfficiency',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="heuristic-build-monument-progress">
                <span>Monument Progress</span>
                <input
                  id="heuristic-build-monument-progress"
                  type="number"
                  step="0.1"
                  value={heuristicConfig.buildWeights.monumentProgress}
                  onChange={(event) =>
                    heuristicHandlers.updateBuildWeight(
                      'monumentProgress',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="heuristic-build-monument-workers">
                <span>Monument Workers</span>
                <input
                  id="heuristic-build-monument-workers"
                  type="number"
                  step="0.1"
                  value={heuristicConfig.buildWeights.monumentWorkersUsed}
                  onChange={(event) =>
                    heuristicHandlers.updateBuildWeight(
                      'monumentWorkersUsed',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="heuristic-build-monument-effect">
                <span>Monument Effect Bonus</span>
                <input
                  id="heuristic-build-monument-effect"
                  type="number"
                  step="0.1"
                  value={heuristicConfig.buildWeights.monumentSpecialEffect}
                  onChange={(event) =>
                    heuristicHandlers.updateBuildWeight(
                      'monumentSpecialEffect',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label
                className="player-count-control"
                htmlFor="heuristic-build-monument-deferred-scale"
              >
                <span>Monument Deferred Completion Scale</span>
                <input
                  id="heuristic-build-monument-deferred-scale"
                  type="number"
                  step="0.01"
                  value={heuristicConfig.buildWeights.monumentDeferredCompletionValueScale}
                  onChange={(event) =>
                    heuristicHandlers.updateBuildWeight(
                      'monumentDeferredCompletionValueScale',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label
                className="player-count-control"
                htmlFor="heuristic-build-monument-max-turns"
              >
                <span>Monument Deferred Max Turns</span>
                <input
                  id="heuristic-build-monument-max-turns"
                  type="number"
                  step="0.1"
                  value={heuristicConfig.buildWeights.monumentDeferredMaxTurnsToComplete}
                  onChange={(event) =>
                    heuristicHandlers.updateBuildWeight(
                      'monumentDeferredMaxTurnsToComplete',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="heuristic-exchange-first">
                <span>Prefer Exchange First</span>
                <input
                  id="heuristic-exchange-first"
                  type="checkbox"
                  checked={heuristicConfig.preferExchangeBeforeDevelopment}
                  onChange={(event) =>
                    onPreferExchangeFirstChange(event.target.checked)
                  }
                />
              </label>
              <button
                type="button"
                className="start-game-button"
                onClick={onResetHeuristicDefaults}
              >
                Reset Heuristic Defaults
              </button>
            </div>
          ) : null}
        </article>
        <article className="development-card">
          <div className="collapsible-header">
            <p className="choice-label">Lookahead Bot</p>
            <button
              type="button"
              className="section-toggle"
              onClick={onToggleLookaheadSettings}
            >
              {isLookaheadSettingsExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {isLookaheadSettingsExpanded ? (
            <div className="development-list">
              <p className="choice-label">Utility Weights</p>
              <label className="player-count-control" htmlFor="lookahead-score-total">
                <span>Score Total</span>
                <input
                  id="lookahead-score-total"
                  type="number"
                  step="0.1"
                  value={lookaheadUtilityWeights.scoreTotal}
                  onChange={(event) =>
                    onUpdateLookaheadUtilityWeight(
                      'scoreTotal',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="lookahead-completed-cities">
                <span>Completed Cities</span>
                <input
                  id="lookahead-completed-cities"
                  type="number"
                  step="0.1"
                  value={lookaheadUtilityWeights.completedCities}
                  onChange={(event) =>
                    onUpdateLookaheadUtilityWeight(
                      'completedCities',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="lookahead-city-progress">
                <span>City Progress</span>
                <input
                  id="lookahead-city-progress"
                  type="number"
                  step="0.1"
                  value={lookaheadUtilityWeights.cityProgress}
                  onChange={(event) =>
                    onUpdateLookaheadUtilityWeight(
                      'cityProgress',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="lookahead-monument-progress">
                <span>Monument Progress</span>
                <input
                  id="lookahead-monument-progress"
                  type="number"
                  step="0.1"
                  value={lookaheadUtilityWeights.monumentProgress}
                  onChange={(event) =>
                    onUpdateLookaheadUtilityWeight(
                      'monumentProgress',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="lookahead-goods-value">
                <span>Goods Value</span>
                <input
                  id="lookahead-goods-value"
                  type="number"
                  step="0.1"
                  value={lookaheadUtilityWeights.goodsValue}
                  onChange={(event) =>
                    onUpdateLookaheadUtilityWeight(
                      'goodsValue',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="lookahead-food">
                <span>Food</span>
                <input
                  id="lookahead-food"
                  type="number"
                  step="0.1"
                  value={lookaheadUtilityWeights.food}
                  onChange={(event) =>
                    onUpdateLookaheadUtilityWeight('food', event.target.value)
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="lookahead-turn-resource">
                <span>Turn Resource Position</span>
                <input
                  id="lookahead-turn-resource"
                  type="number"
                  step="0.1"
                  value={lookaheadUtilityWeights.turnResourcePosition}
                  onChange={(event) =>
                    onUpdateLookaheadUtilityWeight(
                      'turnResourcePosition',
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className="player-count-control" htmlFor="lookahead-food-risk-penalty">
                <span>Food Risk Penalty</span>
                <input
                  id="lookahead-food-risk-penalty"
                  type="number"
                  step="0.1"
                  value={lookaheadUtilityWeights.foodRiskPenalty}
                  onChange={(event) =>
                    onUpdateLookaheadUtilityWeight(
                      'foodRiskPenalty',
                      event.target.value,
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="start-game-button"
                onClick={onResetLookaheadDefaults}
              >
                Reset Lookahead Defaults
              </button>
            </div>
          ) : null}
        </article>
      </section>
      {headlessSimulations.length > 0 ? (
        <section className="app-panel setup-panel">
          <h2>AI Testing</h2>
          <div className="development-list">
            {headlessSimulations.map((simulation, index) => (
              <article
                key={`headless-result-${index + 1}`}
                className="development-card"
              >
                <p className="development-title">Headless Result {index + 1}</p>
                <p className="scoreboard-row">Bots: {simulation.scores.length}</p>
                <p className="scoreboard-row">
                  Status: {simulation.completed ? 'Completed' : 'Stopped Early'}
                </p>
                <p className="scoreboard-row">Turns played: {simulation.turnsPlayed}</p>
                <p className="scoreboard-row">
                  Winners:{' '}
                  {simulation.winners.length > 0
                    ? simulation.winners.join(', ')
                    : 'None'}
                </p>
                {simulation.stallReason ? (
                  <p className="hint-text">{simulation.stallReason}</p>
                ) : null}
                <p className="choice-label">Final Scores</p>
                <div className="scoreboard-list">
                  {simulation.scores.map((entry) => (
                    <PlayerEndStateCard
                      key={`${entry.playerId}-${index + 1}`}
                      entry={entry}
                      itemKeyPrefix={`headless-result-${index + 1}`}
                    />
                  ))}
                </div>
                <p className="choice-label">Action Log</p>
                <textarea
                  className="log-textbox"
                  readOnly
                  value={simulation.actionLog.join('\n')}
                  aria-label={`Headless action log ${index + 1}`}
                />
                <p className="choice-label">Instrumentation</p>
                <p className="scoreboard-row">
                  Core: runBotTurnCalls={simulation.instrumentation.core.runBotTurnCalls}, steps=
                  {simulation.instrumentation.core.runBotTurnStepsTotal}, chooseActionCalls=
                  {simulation.instrumentation.core.strategyChooseActionCalls}
                </p>
                <p className="scoreboard-row">
                  Core timing: runBotTurnMsTotal=
                  {simulation.instrumentation.core.runBotTurnMsTotal}, runBotStepMsTotal=
                  {simulation.instrumentation.core.runBotStepMsTotal}
                </p>
                <p className="scoreboard-row">
                  Core apply: attempts={simulation.instrumentation.core.applyBotActionAttempts},
                  successes={simulation.instrumentation.core.applyBotActionSuccesses}, fallbackSelections=
                  {simulation.instrumentation.core.fallbackSelections}
                </p>
                <p className="scoreboard-row">
                  Headless: runs={simulation.instrumentation.headless.runHeadlessBotGameCalls},
                  completed={simulation.instrumentation.headless.completedGames}, stalled=
                  {simulation.instrumentation.headless.stalledGames}, turnsTotal=
                  {simulation.instrumentation.headless.turnsPlayedTotal}
                </p>
                <p className="scoreboard-row">
                  Headless timing: runMsTotal=
                  {simulation.instrumentation.headless.runHeadlessBotGameMsTotal}, actionLogEntries=
                  {simulation.instrumentation.headless.actionLogEntriesTotal}
                </p>
                <p className="choice-label">Per Bot Metrics</p>
                {Object.entries(simulation.instrumentation.core.byActorId)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([actorId, actorStats]) => {
                    const playerName =
                      simulation.scores.find((entry) => entry.playerId === actorId)
                        ?.playerName ?? actorId;
                    return (
                      <article
                        key={`instrumentation-${index + 1}-${actorId}`}
                        className="development-card"
                      >
                        <p className="development-title">
                          {playerName} ({actorStats.strategyId})
                        </p>
                        <p className="scoreboard-row">
                          Turns={actorStats.runBotTurnCalls}, Completed=
                          {actorStats.runBotTurnCompletedTurns}, Steps=
                          {actorStats.runBotTurnStepsTotal}
                        </p>
                        <p className="scoreboard-row">
                          Timing: runBotTurnMsTotal={actorStats.runBotTurnMsTotal},
                          runBotStepMsTotal={actorStats.runBotStepMsTotal},
                          chooseMsTotal={actorStats.strategyChooseActionMsTotal},
                          applyMsTotal={actorStats.applyBotActionMsTotal},
                          overheadMsTotal={actorStats.runBotTurnOverheadMsTotal}
                        </p>
                        <p className="scoreboard-row">
                          Apply: attempts={actorStats.applyBotActionAttempts},
                          successes={actorStats.applyBotActionSuccesses}, fallbackSelections=
                          {actorStats.fallbackSelections}, fallbackApplyAttempts=
                          {actorStats.fallbackApplyAttempts}
                        </p>
                        {Object.keys(actorStats.strategyExtensionMetrics).length > 0 ? (
                          <>
                            <p className="choice-label">Extension Metrics</p>
                            {renderMetricRows(actorStats.strategyExtensionMetrics)}
                          </>
                        ) : null}
                      </article>
                    );
                  })}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

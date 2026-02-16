import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GamePhase, PlayerConfig } from '@/game';
import {
  BotAction,
  HeuristicConfig,
  HEURISTIC_STANDARD_CONFIG,
  LookaheadConfig,
  createHeuristicBot,
  createLookaheadBot,
  LOOKAHEAD_STANDARD_CONFIG,
} from '@/game/bot';
import {
  getBotCoreInstrumentation,
  getHeadlessBotInstrumentation,
  getHeadlessScoreSummary,
  resetBotCoreInstrumentation,
  resetHeadlessBotInstrumentation,
  runHeadlessBotEvaluation,
  runHeadlessBotMatch,
} from '@/game/automation';
import { GameOverScreen } from '@/screens/GameOverScreen';
import { GameplayScreen } from '@/screens/GameplayScreen';
import { SetupScreen } from '@/screens/SetupScreen';
import {
  BotEvaluationSummary,
  BotProfile,
  BotSpeedOption,
  ControllerOption,
  HeadlessSimulationSummary,
} from '@/screens/types';
import { BOT_SPEED_DELAY_MS, MAX_PLAYERS, MIN_PLAYERS } from '@/constants/ui';
import {
  getLockBadge,
  getRerollEmoji,
  getSkullDenotation,
} from '@/utils/gameUiFormatters';
import {
  getActivePhasePanel,
  getPanelClassName,
  getTopScore,
  getWinners,
} from '@/viewModels/gameViewModel';
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
  returnToSetup,
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
  selectGame,
  selectProductionPanelModel,
  selectPlayerEndStateSummaries,
  selectTurnStatus,
} from '@/store/selectors';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useAnimatedBotPhase } from '@/hooks/useAnimatedBotPhase';
import { useBotTurnRunner } from '@/hooks/useBotTurnRunner';


function cloneStandardHeuristicConfig(): HeuristicConfig {
  return {
    productionWeights: { ...HEURISTIC_STANDARD_CONFIG.productionWeights },
    developmentWeights: { ...HEURISTIC_STANDARD_CONFIG.developmentWeights },
    foodPolicyWeights: { ...HEURISTIC_STANDARD_CONFIG.foodPolicyWeights },
    buildWeights: { ...HEURISTIC_STANDARD_CONFIG.buildWeights },
    preferExchangeBeforeDevelopment:
      HEURISTIC_STANDARD_CONFIG.preferExchangeBeforeDevelopment,
  };
}

function cloneStandardLookaheadUtilityWeights(): LookaheadConfig['utilityWeights'] {
  return { ...LOOKAHEAD_STANDARD_CONFIG.utilityWeights };
}

function createPlayers(
  count: number,
  controllers: Record<number, ControllerOption>,
): PlayerConfig[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    controller:
      controllers[index + 1] === 'human'
        ? ('human' as const)
        : ('bot' as const),
  }));
}

type ConstructionSection = 'cities' | 'monuments' | 'developments';
type SectionPreferences = Record<ConstructionSection, boolean>;

const DEFAULT_SECTION_PREFERENCES: SectionPreferences = {
  cities: false,
  monuments: false,
  developments: false,
};

function App() {
  const dispatch = useAppDispatch();
  const turnStatus = useAppSelector(selectTurnStatus);
  const playerEndStateSummaries = useAppSelector(selectPlayerEndStateSummaries);
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
  const game = useAppSelector(selectGame);
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
  const [activeGameBotProfilesByPlayerId, setActiveGameBotProfilesByPlayerId] =
    useState<Record<string, BotProfile>>({});
  const [botSpeed, setBotSpeed] = useState<BotSpeedOption>('normal');
  const [isHeuristicSettingsExpanded, setIsHeuristicSettingsExpanded] =
    useState(false);
  const [isLookaheadSettingsExpanded, setIsLookaheadSettingsExpanded] =
    useState(false);
  const [heuristicConfig, setHeuristicConfig] = useState<HeuristicConfig>(
    cloneStandardHeuristicConfig(),
  );
  const [lookaheadUtilityWeights, setLookaheadUtilityWeights] = useState<
    LookaheadConfig['utilityWeights']
  >(cloneStandardLookaheadUtilityWeights());
  const [isDiceReferenceExpanded, setIsDiceReferenceExpanded] = useState(false);
  const [goodsToKeepByType, setGoodsToKeepByType] = useState<Record<string, number>>(
    {},
  );
  const [sectionPreferencesByPlayer, setSectionPreferencesByPlayer] = useState<
    Record<string, SectionPreferences>
  >({});
  const [headlessSimulations, setHeadlessSimulations] = useState<
    HeadlessSimulationSummary[]
  >([]);
  const [botEvalRounds, setBotEvalRounds] = useState<number>(10);
  const [isBotEvalRunning, setIsBotEvalRunning] = useState(false);
  const [botEvaluations, setBotEvaluations] = useState<BotEvaluationSummary[]>([]);
  const previousPhaseRef = useRef<GamePhase | null>(turnStatus.phase);
  const botStepDelayMs = BOT_SPEED_DELAY_MS[botSpeed];
  const configuredHeuristicBot = useMemo(
    () => createHeuristicBot(heuristicConfig, 'heuristic-settings'),
    [heuristicConfig],
  );
  const configuredLookaheadBot = useMemo(
    () =>
      createLookaheadBot(
        {
          ...LOOKAHEAD_STANDARD_CONFIG,
          heuristicFallbackConfig: heuristicConfig,
          utilityWeights: lookaheadUtilityWeights,
        },
        'lookahead-settings',
      ),
    [heuristicConfig, lookaheadUtilityWeights],
  );
  const standardHeuristicBot = useMemo(
    () => createHeuristicBot(HEURISTIC_STANDARD_CONFIG, 'heuristic-standard-fixed'),
    [],
  );
  const standardLookaheadBot = useMemo(
    () => createLookaheadBot(LOOKAHEAD_STANDARD_CONFIG, 'lookahead-standard-fixed'),
    [],
  );
  const selectedPlayersForSetup = useMemo(
    () => createPlayers(playerCount, playerControllers),
    [playerCount, playerControllers],
  );
  const allAiSetup = useMemo(
    () => selectedPlayersForSetup.every((player) => player.controller === 'bot'),
    [selectedPlayersForSetup],
  );

  const rerollEmoji = getRerollEmoji(dicePanel.rerollsRemaining);

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
  const topScore = getTopScore(playerEndStateSummaries);
  const winners = getWinners(playerEndStateSummaries, topScore);
  const isBotTurn =
    turnStatus.isGameActive &&
    !endgameStatus.isGameOver &&
    turnStatus.activePlayerController === 'bot';
  const { displayedPhase, isAnimating: isBotPhaseAnimating } = useAnimatedBotPhase({
    phase: turnStatus.phase,
    enabled: turnStatus.isGameActive && !endgameStatus.isGameOver,
    stepDelayMs: botStepDelayMs,
  });
  const activePhasePanel = useMemo(
    () => getActivePhasePanel(displayedPhase),
    [displayedPhase],
  );

  const dispatchBotAction = useCallback(
    (action: BotAction) => {
      switch (action.type) {
        case 'rollDice':
          dispatch(rollDice());
          return;
        case 'rerollSingleDie':
          dispatch(rerollSingleDie({ dieIndex: action.dieIndex }));
          return;
        case 'keepDie':
          dispatch(keepDie({ dieIndex: action.dieIndex }));
          return;
        case 'selectProduction':
          dispatch(
            selectProduction({
              dieIndex: action.dieIndex,
              productionIndex: action.productionIndex,
            }),
          );
          return;
        case 'resolveProduction':
          return;
        case 'buildCity':
          dispatch(buildCity({ cityIndex: action.cityIndex }));
          return;
        case 'buildMonument':
          dispatch(buildMonument({ monumentId: action.monumentId }));
          return;
        case 'buyDevelopment':
          dispatch(
            buyDevelopment({
              developmentId: action.developmentId,
              goodsTypeNames: action.goodsTypeNames,
            }),
          );
          return;
        case 'skipDevelopment':
          dispatch(skipDevelopment());
          return;
        case 'applyExchange':
          dispatch(
            applyExchange({
              from: action.from,
              to: action.to,
              amount: action.amount,
            }),
          );
          return;
        case 'discardGoods':
          dispatch(discardGoods({ goodsToKeepByType: action.goodsToKeepByType }));
          return;
        case 'endTurn':
          dispatch(endTurn());
          return;
        default:
          return;
      }
    },
    [dispatch],
  );
  const { controlsLockedByBot } = useBotTurnRunner({
    game,
    isGameOver: endgameStatus.isGameOver,
    activePlayerController: turnStatus.activePlayerController,
    pauseBotActions: isBotTurn && isBotPhaseAnimating,
    activeGameBotProfilesByPlayerId,
    configuredHeuristicBot,
    configuredLookaheadBot,
    standardHeuristicBot,
    standardLookaheadBot,
    botStepDelayMs,
    dispatchBotAction,
  });

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

  useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    if (
      previousPhase === GamePhase.Development &&
      turnStatus.phase !== GamePhase.Development &&
      selectedGoodsToSpend.length > 0
    ) {
      setSelectedGoodsToSpend([]);
    }
    previousPhaseRef.current = turnStatus.phase;
  }, [selectedGoodsToSpend.length, turnStatus.phase]);

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

  const getBotProfilesByPlayerId = (
    players: ReturnType<typeof createPlayers>,
    controllers: Record<number, ControllerOption>,
  ): Record<string, BotProfile> => {
    const profiles: Record<string, BotProfile> = {};
    players.forEach((player, index) => {
      const playerNumber = index + 1;
      const selected = controllers[playerNumber] ?? 'human';
      if (selected === 'heuristicStandard') {
        profiles[player.id] = 'heuristicStandard';
      } else if (selected === 'heuristicCustom') {
        profiles[player.id] = 'heuristicCustom';
      } else if (selected === 'lookaheadStandard') {
        profiles[player.id] = 'lookaheadStandard';
      } else if (selected === 'lookaheadCustom') {
        profiles[player.id] = 'lookaheadCustom';
      }
    });
    return profiles;
  };

  const getStrategyByPlayerId = (
    players: ReturnType<typeof createPlayers>,
    botProfilesByPlayerId: Record<string, BotProfile>,
  ) =>
    Object.fromEntries(
      players.map((player) => [
        player.id,
        botProfilesByPlayerId[player.id] === 'heuristicStandard'
          ? standardHeuristicBot
          : botProfilesByPlayerId[player.id] === 'lookaheadCustom'
            ? configuredLookaheadBot
            : botProfilesByPlayerId[player.id] === 'lookaheadStandard'
              ? standardLookaheadBot
              : configuredHeuristicBot,
      ]),
    );

  const updateProductionWeight = (
    key: keyof HeuristicConfig['productionWeights'],
    value: string,
  ) => {
    const parsed = Number(value);
    const nextValue = Number.isFinite(parsed) ? parsed : 0;
    setHeuristicConfig((current) => ({
      ...current,
      productionWeights: {
        ...current.productionWeights,
        [key]: nextValue,
      },
    }));
  };

  const updateDevelopmentWeight = (
    key: keyof HeuristicConfig['developmentWeights'],
    value: string,
  ) => {
    const parsed = Number(value);
    const nextValue = Number.isFinite(parsed) ? parsed : 0;
    setHeuristicConfig((current) => ({
      ...current,
      developmentWeights: {
        ...current.developmentWeights,
        [key]: nextValue,
      },
    }));
  };

  const updateFoodPolicyWeight = (
    key: keyof HeuristicConfig['foodPolicyWeights'],
    value: string | boolean,
  ) => {
    setHeuristicConfig((current) => ({
      ...current,
      foodPolicyWeights: {
        ...current.foodPolicyWeights,
        [key]:
          typeof value === 'boolean'
            ? value
            : Number.isFinite(Number(value))
              ? Number(value)
              : 0,
      },
    }));
  };

  const updateBuildWeight = (
    key: keyof HeuristicConfig['buildWeights'],
    value: string,
  ) => {
    const parsed = Number(value);
    const nextValue = Number.isFinite(parsed) ? parsed : 0;
    setHeuristicConfig((current) => ({
      ...current,
      buildWeights: {
        ...current.buildWeights,
        [key]: nextValue,
      },
    }));
  };

  const updateLookaheadUtilityWeight = (
    key: keyof LookaheadConfig['utilityWeights'],
    value: string,
  ) => {
    const parsed = Number(value);
    const nextValue = Number.isFinite(parsed) ? parsed : 0;
    setLookaheadUtilityWeights((current) => ({
      ...current,
      [key]: nextValue,
    }));
  };

  const runHeadlessSimulation = (
    players: ReturnType<typeof createPlayers>,
    botProfilesByPlayerId: Record<string, BotProfile>,
  ) => {
    resetHeadlessBotInstrumentation();
    const strategyByPlayerId = getStrategyByPlayerId(players, botProfilesByPlayerId);
    Object.values(strategyByPlayerId).forEach((strategy) =>
      resetBotCoreInstrumentation(strategy),
    );
    const result = runHeadlessBotMatch(players, { strategyByPlayerId });
    const coreByActor = Object.values(strategyByPlayerId).reduce(
      (acc, strategy) => {
        const perStrategy = getBotCoreInstrumentation(strategy);
        Object.entries(perStrategy.metrics).forEach(([key, value]) => {
          acc.metrics[key] = (acc.metrics[key] ?? 0) + value;
        });
        Object.entries(perStrategy.byActorId).forEach(([actorId, actorStats]) => {
          const existing = acc.byActorId[actorId] ?? {
            strategyId: actorStats.strategyId,
            metrics: {},
          };
          existing.strategyId = actorStats.strategyId;
          Object.entries(actorStats.metrics).forEach(([key, value]) => {
            existing.metrics[key] = (existing.metrics[key] ?? 0) + value;
          });
          acc.byActorId[actorId] = existing;
        });
        return acc;
      },
      { metrics: {}, byActorId: {} } as ReturnType<typeof getBotCoreInstrumentation>,
    );
    const scores = getHeadlessScoreSummary(result.finalGame).sort(
      (a, b) => b.total - a.total,
    );
    const summary: HeadlessSimulationSummary = {
      completed: result.completed,
      turnsPlayed: result.turnsPlayed,
      winners: result.winners,
      scores,
      stallReason: result.stallReason,
      actionLog: result.actionLog,
      instrumentation: {
        core: coreByActor,
        headless: getHeadlessBotInstrumentation(),
      },
    };
    setHeadlessSimulations((current) => [...current, summary]);
  };

  const runSetupBotEvaluation = async () => {
    const selectedPlayers = createPlayers(playerCount, playerControllers);
    if (!selectedPlayers.every((player) => player.controller === 'bot')) {
      return;
    }
    const rounds = Math.max(1, Math.floor(botEvalRounds));
    const botProfilesByPlayerId = getBotProfilesByPlayerId(
      selectedPlayers,
      playerControllers,
    );
    const strategyByPlayerId = getStrategyByPlayerId(
      selectedPlayers,
      botProfilesByPlayerId,
    );
    const participantKeyByPlayerId = Object.fromEntries(
      selectedPlayers.map((player) => [player.id, botProfilesByPlayerId[player.id]]),
    );
    const participantLabelByKey = {
      heuristicStandard: 'Heuristic Bot',
      heuristicCustom: 'Heuristic Bot (Custom)',
      lookaheadStandard: 'Lookahead Bot',
      lookaheadCustom: 'Lookahead Bot (Custom)',
    };

    setIsBotEvalRunning(true);
    await Promise.resolve();
    try {
      const result = runHeadlessBotEvaluation(selectedPlayers, {
        rounds,
        rotateSeats: true,
        strategyByPlayerId,
        participantKeyByPlayerId,
        participantLabelByKey,
      });
      const stallReasons = result.games
        .filter((gameResult) => !gameResult.completed)
        .reduce<Record<string, number>>((acc, gameResult) => {
          const reason = gameResult.stallReason ?? 'Unknown stall reason';
          acc[reason] = (acc[reason] ?? 0) + 1;
          return acc;
        }, {});
      const summary: BotEvaluationSummary = {
        createdAtLabel: new Date().toLocaleString(),
        playerCount: selectedPlayers.length,
        rounds: result.rounds,
        rotationsPerRound: result.rotationsPerRound,
        totalGames: result.totalGames,
        incompleteGames: result.incompleteGames,
        standings: result.standings,
        stallReasons,
      };
      setBotEvaluations((current) => [...current, summary]);
    } finally {
      setIsBotEvalRunning(false);
    }
  };

  const startConfiguredGame = () => {
    const selectedPlayers = createPlayers(playerCount, playerControllers);
    const botProfilesByPlayerId = getBotProfilesByPlayerId(
      selectedPlayers,
      playerControllers,
    );
    const allBots = selectedPlayers.every((player) => player.controller === 'bot');
    if (allBots) {
      runHeadlessSimulation(selectedPlayers, botProfilesByPlayerId);
      return;
    }

    setActiveGameBotProfilesByPlayerId(botProfilesByPlayerId);
    dispatch(
      startGame({
        players: selectedPlayers,
      }),
    );
  };

  const handlePlayAgain = () => {
    setPlayerCount(MIN_PLAYERS);
    setPlayerControllers({
      1: 'human',
      2: 'human',
      3: 'human',
      4: 'human',
    });
    setActiveGameBotProfilesByPlayerId({});
    setBotSpeed('normal');
    setBotEvalRounds(10);
    setIsHeuristicSettingsExpanded(false);
    setIsLookaheadSettingsExpanded(false);
    setHeuristicConfig(cloneStandardHeuristicConfig());
    setLookaheadUtilityWeights(cloneStandardLookaheadUtilityWeights());
    dispatch(returnToSetup());
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
        <div className="title-row">
          <h1>Roll Through the Ages</h1>
        </div>
        {!turnStatus.isGameActive ? (
          <SetupScreen
            minPlayers={MIN_PLAYERS}
            maxPlayers={MAX_PLAYERS}
            playerCount={playerCount}
            playerControllers={playerControllers}
            onPlayerCountChange={setPlayerCount}
            onPlayerControllerChange={updatePlayerController}
            onStartGame={startConfiguredGame}
            botSpeed={botSpeed}
            onBotSpeedChange={setBotSpeed}
            isHeuristicSettingsExpanded={isHeuristicSettingsExpanded}
            onToggleHeuristicSettings={() =>
              setIsHeuristicSettingsExpanded((current) => !current)
            }
            isLookaheadSettingsExpanded={isLookaheadSettingsExpanded}
            onToggleLookaheadSettings={() =>
              setIsLookaheadSettingsExpanded((current) => !current)
            }
            heuristicConfig={heuristicConfig}
            heuristicHandlers={{
              updateProductionWeight,
              updateDevelopmentWeight,
              updateFoodPolicyWeight,
              updateBuildWeight,
            }}
            onPreferExchangeFirstChange={(enabled) =>
              setHeuristicConfig((current) => ({
                ...current,
                preferExchangeBeforeDevelopment: enabled,
              }))
            }
            lookaheadUtilityWeights={lookaheadUtilityWeights}
            onUpdateLookaheadUtilityWeight={updateLookaheadUtilityWeight}
            onResetHeuristicDefaults={() => {
              setHeuristicConfig(cloneStandardHeuristicConfig());
            }}
            onResetLookaheadDefaults={() => {
              setLookaheadUtilityWeights(cloneStandardLookaheadUtilityWeights());
            }}
            allAiSetup={allAiSetup}
            botEvalRounds={botEvalRounds}
            onBotEvalRoundsChange={(next) => {
              setBotEvalRounds(Number.isFinite(next) ? Math.max(1, Math.floor(next)) : 1);
            }}
            onRunBotEvaluation={() => {
              void runSetupBotEvaluation();
            }}
            isBotEvalRunning={isBotEvalRunning}
            botEvaluations={botEvaluations}
            headlessSimulations={headlessSimulations}
            onClearHeadlessSimulations={() => {
              setHeadlessSimulations([]);
              setBotEvaluations([]);
            }}
          />
        ) : null}
        {turnStatus.isGameActive && endgameStatus.isGameOver ? (
          <GameOverScreen
            winners={winners}
            topScore={topScore}
            reasons={endgameStatus.reasons}
            playerEndStateSummaries={playerEndStateSummaries}
            actionLog={actionLog}
            onPlayAgain={handlePlayAgain}
          />
        ) : null}
        {turnStatus.isGameActive && !endgameStatus.isGameOver ? (
          <GameplayScreen
            controlsLockedByBot={controlsLockedByBot}
            botStepDelayMs={botStepDelayMs}
            activePhasePanel={activePhasePanel}
            turnStatus={{ ...turnStatus, phase: displayedPhase }}
            canUndo={canUndo}
            canRedo={canRedo}
            dicePanel={dicePanel}
            diceOutcome={diceOutcome}
            productionPanel={productionPanel}
            buildPanel={buildPanel}
            developmentPanel={developmentPanel}
            exchangePanel={exchangePanel}
            disasterPanel={disasterPanel}
            discardPanel={discardPanel}
            rerollEmoji={rerollEmoji}
            isDiceReferenceExpanded={isDiceReferenceExpanded}
            cityCatalogSorted={cityCatalogSorted}
            monumentCatalogSorted={monumentCatalogSorted}
            isCitiesExpanded={isCitiesExpanded}
            isMonumentsExpanded={isMonumentsExpanded}
            isDevelopmentsExpanded={isDevelopmentsExpanded}
            effectiveCoinsAvailable={effectiveCoinsAvailable}
            selectedGoodsCoins={selectedGoodsCoins}
            selectedGoodsToSpend={selectedGoodsToSpend}
            selectedGoodsLookup={selectedGoodsLookup}
            developmentCatalogSorted={developmentCatalogSorted}
            goodsToKeepByType={goodsToKeepByType}
            actionLog={actionLog}
            getPanelClassName={getPanelClassName}
            getLockBadge={getLockBadge}
            getSkullDenotation={getSkullDenotation}
            onEndTurn={() => dispatch(endTurn())}
            onUndo={() => dispatch(undo())}
            onRedo={() => dispatch(redo())}
            onToggleDiceReference={() =>
              setIsDiceReferenceExpanded((current) => !current)
            }
            onRollDice={() => dispatch(rollDice())}
            onSelectProduction={(dieIndex, productionIndex) =>
              dispatch(selectProduction({ dieIndex, productionIndex }))
            }
            onRerollSingleDie={(dieIndex) => dispatch(rerollSingleDie({ dieIndex }))}
            onKeepDie={(dieIndex) => dispatch(keepDie({ dieIndex }))}
            onToggleConstructionSection={toggleConstructionSection}
            onBuildCity={(cityIndex) => dispatch(buildCity({ cityIndex }))}
            onBuildMonument={(monumentId) => dispatch(buildMonument({ monumentId }))}
            onSkipDevelopment={() => dispatch(skipDevelopment())}
            onToggleGoodsSpend={toggleGoodsSpend}
            onApplyExchange={(from, to, amount) =>
              dispatch(
                applyExchange({
                  from,
                  to,
                  amount,
                }),
              )
            }
            onBuyDevelopment={(developmentId, goodsTypeNames) =>
              dispatch(
                buyDevelopment({
                  developmentId,
                  goodsTypeNames,
                }),
              )
            }
            onUpdateGoodsToKeep={updateGoodsToKeep}
            onApplyDiscard={(nextGoodsToKeepByType) =>
              dispatch(discardGoods({ goodsToKeepByType: nextGoodsToKeepByType }))
            }
          />
        ) : null}

        {turnStatus.errorMessage ? (
          <p className="error-text">{turnStatus.errorMessage}</p>
        ) : null}
      </section>
    </main>
  );
}

export default App;












import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import {
  HEURISTIC_STANDARD_CONFIG,
} from '../src/game/bot/index.ts';
import {
  CORE_BOT_METRIC_KEYS,
  getBotCoreInstrumentation,
  getHeadlessBotInstrumentation,
  getHeadlessScoreSummary,
  resetBotCoreInstrumentation,
  resetHeadlessBotInstrumentation,
  runHeadlessBotMatch,
} from '../src/game/automation/index.ts';
import { PlayerConfig } from '../src/game/index.ts';
import {
  BotType,
  createBotStrategy,
  formatNum,
  LoadedBotConfig,
  loadConfigEntry,
  parseNumber,
} from './helpers.ts';

type CliOptions = {
  rounds: number;
  players: number;
  configPaths: string[];
  maxTurns: number;
  maxStepsPerTurn: number;
  instrumentationJson: string;
};

type ConfigEntry = {
  key: string;
  id: string;
  label: string;
  botType: BotType;
  config: LoadedBotConfig['config'];
  source: string;
};

type ConfigStats = {
  appearances: number;
  totalVp: number;
  topFinishes: number;
  winShare: number;
};

type Standing = {
  key: string;
  id: string;
  label: string;
  source: string;
  appearances: number;
  avgVp: number;
  topFinishes: number;
  topFinishRate: number;
  winShareRate: number;
};

type StallRecord = {
  round: number;
  rotation: number;
  reason: string;
  seatConfigs: string[];
};

type PerGameConfigInstrumentation = {
  playerId: string;
  playerName: string;
  configKey: string;
  configLabel: string;
  strategyId: string;
  runBotTurnCalls: number;
  runBotTurnMsTotal: number;
  runBotStepCalls: number;
  runBotStepMsTotal: number;
  strategyChooseActionCalls: number;
  strategyChooseActionMsTotal: number;
  applyBotActionAttempts: number;
  applyBotActionSuccesses: number;
  fallbackSelections: number;
  fallbackApplyAttempts: number;
  extensionMetrics: Record<string, number>;
};

type PerGameInstrumentation = {
  round: number;
  rotation: number;
  completed: boolean;
  turnsPlayed: number;
  stallReason: string | null;
  scoresByPlayerId: Record<string, number>;
  byConfig: PerGameConfigInstrumentation[];
  headless: ReturnType<typeof getHeadlessBotInstrumentation>;
  coreByPlayerId: Record<string, ReturnType<typeof getBotCoreInstrumentation>>;
};

const CORE_METRIC_KEY_SET = new Set<string>(CORE_BOT_METRIC_KEYS as readonly string[]);

function getMetric(metrics: Record<string, number>, key: string): number {
  return metrics[key] ?? 0;
}

function getExtensionMetrics(metrics: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(metrics).filter(([key]) => !CORE_METRIC_KEY_SET.has(key)),
  );
}

function printUsage(): void {
  console.log('Usage: npx tsx scripts/bot_evals.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --configs <list>          Comma-separated config paths (up to 4)');
  console.log('                            Example: --configs a.json,b.json,c.json,d.json');
  console.log('                            Supports heuristic and lookahead bot config files.');
  console.log('                            Omit to use standard heuristic config for all players.');
  console.log('  --players <n>             Player count, 2-4 (default: from --configs count, else 2)');
  console.log('  --rounds <n>              Number of seat-rotation rounds (default: 10)');
  console.log('  --max-turns <n>           Max turns per game (default: 500)');
  console.log('  --max-steps-per-turn <n>  Max bot steps per turn (default: 300)');
  console.log(
    '  --instrumentation-json <path>  Write per-game + aggregate instrumentation JSON report',
  );
  console.log('  --help                    Show this help');
  console.log('');
  console.log('Notes:');
  console.log('  - Each round runs one game per seat rotation, so total games = rounds * players.');
  console.log('  - If fewer configs than players are provided, configs repeat cyclically.');
}

function parseArgs(argv: string[]): CliOptions {
  let parsedConfigPaths: string[] = [];
  let playersFromArg: number | undefined;
  const options: CliOptions = {
    rounds: 10,
    players: 2,
    configPaths: [],
    maxTurns: 500,
    maxStepsPerTurn: 300,
    instrumentationJson: 'output/bot-evals-instrumentation-latest.json',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    const next = argv[i + 1];
    if (!next && arg.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }

    switch (arg) {
      case '--configs':
        parsedConfigPaths = next
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0);
        i += 1;
        break;
      case '--players':
        playersFromArg = parseNumber(next, '--players');
        i += 1;
        break;
      case '--rounds':
        options.rounds = parseNumber(next, '--rounds');
        i += 1;
        break;
      case '--max-turns':
        options.maxTurns = parseNumber(next, '--max-turns');
        i += 1;
        break;
      case '--max-steps-per-turn':
        options.maxStepsPerTurn = parseNumber(next, '--max-steps-per-turn');
        i += 1;
        break;
      case '--instrumentation-json':
        options.instrumentationJson = next.trim();
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (parsedConfigPaths.length > 4) {
    throw new Error('--configs supports at most 4 config paths.');
  }
  options.configPaths = parsedConfigPaths;
  options.players = playersFromArg ?? (parsedConfigPaths.length > 0 ? parsedConfigPaths.length : 2);

  if (!Number.isInteger(options.players) || options.players < 2 || options.players > 4) {
    throw new Error('--players must be an integer from 2 to 4.');
  }
  if (!Number.isInteger(options.rounds) || options.rounds <= 0) {
    throw new Error('--rounds must be a positive integer.');
  }
  if (!Number.isInteger(options.maxTurns) || options.maxTurns <= 0) {
    throw new Error('--max-turns must be a positive integer.');
  }
  if (!Number.isInteger(options.maxStepsPerTurn) || options.maxStepsPerTurn <= 0) {
    throw new Error('--max-steps-per-turn must be a positive integer.');
  }

  return options;
}

function buildConfigPool(paths: string[]): ConfigEntry[] {
  if (paths.length === 0) {
    return [
      {
        key: 'builtin:heuristic:standard',
        id: 'standard',
        label: 'standard',
        botType: 'heuristic',
        source: 'HEURISTIC_STANDARD_CONFIG',
        config: HEURISTIC_STANDARD_CONFIG,
      },
    ];
  }

  return paths.map((path, index) => {
    const loaded = loadConfigEntry(path);
    const source = loaded.source ?? resolve(path);
    return {
      key: source,
      id: loaded.id || `cfg${index + 1}`,
      label: loaded.name,
      botType: loaded.botType,
      source,
      config: loaded.config,
    };
  });
}

function createPlayers(
  players: number,
  configPool: ConfigEntry[],
  rotation: number,
): {
  playerConfigs: PlayerConfig[];
  configByPlayerId: Record<string, ConfigEntry>;
} {
  const playerConfigs: PlayerConfig[] = [];
  const configByPlayerId: Record<string, ConfigEntry> = {};

  for (let seat = 0; seat < players; seat += 1) {
    const configIndex = (seat + rotation) % configPool.length;
    const config = configPool[configIndex];
    const playerId = `p${seat + 1}`;
    playerConfigs.push({
      id: playerId,
      name: `${config.label} (P${seat + 1})`,
      controller: 'bot',
    });
    configByPlayerId[playerId] = config;
  }

  return { playerConfigs, configByPlayerId };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const configPool = buildConfigPool(options.configPaths);

  const statsByConfigKey = new Map<string, ConfigStats>();
  for (const config of configPool) {
    statsByConfigKey.set(config.key, {
      appearances: 0,
      totalVp: 0,
      topFinishes: 0,
      winShare: 0,
    });
  }

  let totalGames = 0;
  let incompleteGames = 0;
  const stalls: StallRecord[] = [];
  const perGameInstrumentation: PerGameInstrumentation[] = [];

  for (let round = 0; round < options.rounds; round += 1) {
    for (let rotation = 0; rotation < options.players; rotation += 1) {
      const { playerConfigs, configByPlayerId } = createPlayers(
        options.players,
        configPool,
        rotation,
      );
      const strategyByPlayerId = Object.fromEntries(
        playerConfigs.map((player) => [
          player.id,
          createBotStrategy(
            configByPlayerId[player.id],
            `${configByPlayerId[player.id].botType}-${configByPlayerId[player.id].id}`,
          ),
        ]),
      );
      resetHeadlessBotInstrumentation();
      Object.values(strategyByPlayerId).forEach((strategy) =>
        resetBotCoreInstrumentation(strategy),
      );

      const result = runHeadlessBotMatch(playerConfigs, {
        strategyByPlayerId,
        maxTurns: options.maxTurns,
        maxStepsPerTurn: options.maxStepsPerTurn,
      });
      totalGames += 1;
      if (!result.completed) {
        incompleteGames += 1;
        stalls.push({
          round: round + 1,
          rotation: rotation + 1,
          reason: result.stallReason ?? 'Unknown stall reason',
          seatConfigs: playerConfigs.map((player) => configByPlayerId[player.id].label),
        });
      }

      const summary = getHeadlessScoreSummary(result.finalGame);
      const scoreByPlayerId = Object.fromEntries(
        summary.map((entry) => [entry.playerId, entry.total]),
      );
      const headlessInstrumentation = getHeadlessBotInstrumentation();
      const coreByPlayerId = Object.fromEntries(
        playerConfigs.map((player) => [
          player.id,
          getBotCoreInstrumentation(strategyByPlayerId[player.id]),
        ]),
      );
      const byConfig: PerGameConfigInstrumentation[] = playerConfigs.map((player) => {
        const playerCore = coreByPlayerId[player.id];
        const actorStats = playerCore.byActorId[player.id];
        const actorMetrics = actorStats?.metrics ?? {};
        const config = configByPlayerId[player.id];
        return {
          playerId: player.id,
          playerName: player.name,
          configKey: config.key,
          configLabel: config.label,
          strategyId: actorStats?.strategyId ?? 'unknown',
          runBotTurnCalls: getMetric(actorMetrics, 'runBotTurnCalls'),
          runBotTurnMsTotal: getMetric(actorMetrics, 'runBotTurnMsTotal'),
          runBotStepCalls: getMetric(actorMetrics, 'runBotStepCalls'),
          runBotStepMsTotal: getMetric(actorMetrics, 'runBotStepMsTotal'),
          strategyChooseActionCalls: getMetric(actorMetrics, 'strategyChooseActionCalls'),
          strategyChooseActionMsTotal: getMetric(actorMetrics, 'strategyChooseActionMsTotal'),
          applyBotActionAttempts: getMetric(actorMetrics, 'applyBotActionAttempts'),
          applyBotActionSuccesses: getMetric(actorMetrics, 'applyBotActionSuccesses'),
          fallbackSelections: getMetric(actorMetrics, 'fallbackSelections'),
          fallbackApplyAttempts: getMetric(actorMetrics, 'fallbackApplyAttempts'),
          extensionMetrics: getExtensionMetrics(actorMetrics),
        };
      });
      perGameInstrumentation.push({
        round: round + 1,
        rotation: rotation + 1,
        completed: result.completed,
        turnsPlayed: result.turnsPlayed,
        stallReason: result.stallReason,
        scoresByPlayerId: scoreByPlayerId,
        byConfig,
        headless: headlessInstrumentation,
        coreByPlayerId,
      });

      const topScore = Math.max(...summary.map((entry) => entry.total));
      const topPlayers = summary.filter((entry) => entry.total === topScore);
      const sharedWin = topPlayers.length > 0 ? 1 / topPlayers.length : 0;

      for (const entry of summary) {
        const config = configByPlayerId[entry.playerId];
        const stats = statsByConfigKey.get(config.key);
        if (!stats) {
          continue;
        }
        stats.appearances += 1;
        stats.totalVp += entry.total;
        if (entry.total === topScore) {
          stats.topFinishes += 1;
          stats.winShare += sharedWin;
        }
      }
    }
  }

  const standings: Standing[] = configPool.map((config) => {
    const stats = statsByConfigKey.get(config.key)!;
    const avgVp = stats.appearances > 0 ? stats.totalVp / stats.appearances : 0;
    const topFinishRate =
      stats.appearances > 0 ? stats.topFinishes / stats.appearances : 0;
    const winShareRate = stats.appearances > 0 ? stats.winShare / stats.appearances : 0;
    return {
      key: config.key,
      id: config.id,
      label: config.label,
      source: config.source,
      appearances: stats.appearances,
      avgVp,
      topFinishes: stats.topFinishes,
      topFinishRate,
      winShareRate,
    };
  });

  standings.sort(
    (a, b) =>
      b.avgVp - a.avgVp ||
      b.winShareRate - a.winShareRate ||
      b.topFinishRate - a.topFinishRate ||
      a.label.localeCompare(b.label),
  );

  console.log('=== Bot Config Evaluation ===');
  console.log(`Players: ${options.players}`);
  console.log(`Configs in pool: ${configPool.length}`);
  console.log(`Rounds: ${options.rounds}`);
  console.log(`Seat rotations per round: ${options.players}`);
  console.log(`Total games: ${totalGames}`);
  console.log(`Incomplete games: ${incompleteGames}/${totalGames}`);
  console.log('');
  console.log('Standings');
  console.log('Config                 Avg VP   Win Share   Top Finish Rate   Appearances');
  console.log('--------------------------------------------------------------------------');
  for (const standing of standings) {
    console.log(
      `${standing.label.padEnd(22)} ${formatNum(standing.avgVp).padStart(7)} ${formatNum(
        standing.winShareRate * 100,
      ).padStart(10)}% ${formatNum((standing.topFinishRate * 100)).padStart(15)}% ${String(
        standing.appearances,
      ).padStart(12)}`,
    );
  }
  console.log('');
  console.log('Config Sources');
  for (const standing of standings) {
    console.log(`- ${standing.label}: ${standing.source}`);
  }

  if (stalls.length > 0) {
    const reasonCounts = new Map<string, number>();
    for (const stall of stalls) {
      reasonCounts.set(stall.reason, (reasonCounts.get(stall.reason) ?? 0) + 1);
    }

    console.log('');
    console.log('Stall Reasons (All Occurrences)');
    console.log('--------------------------------');
    stalls.forEach((stall, index) => {
      console.log(
        `${index + 1}. round=${stall.round}, rotation=${stall.rotation}, seats=[${stall.seatConfigs.join(
          ', ',
        )}]`,
      );
      console.log(`   reason: ${stall.reason}`);
    });

    console.log('');
    console.log('Stall Reason Summary');
    console.log('--------------------');
    Array.from(reasonCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .forEach(([reason, count]) => {
        console.log(`${count}x ${reason}`);
      });
  }

  const instrumentationPath = resolve(options.instrumentationJson);
  writeFileSync(
    instrumentationPath,
    JSON.stringify(
      {
        options,
        totalGames,
        incompleteGames,
        standings,
        stalls,
        perGameInstrumentation,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log('');
  console.log(`Instrumentation report written: ${instrumentationPath}`);
}

main();

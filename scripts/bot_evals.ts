import { basename, resolve } from 'node:path';
import {
  createHeuristicBot,
  getHeadlessScoreSummary,
  HEURISTIC_STANDARD_CONFIG,
  HeuristicConfig,
  runHeadlessBotMatch,
} from '../src/game/bot/index.ts';
import { PlayerConfig } from '../src/game/index.ts';
import { formatNum, loadConfig, parseNumber } from './helpers.ts';

type CliOptions = {
  rounds: number;
  players: number;
  configPaths: string[];
  maxTurns: number;
  maxStepsPerTurn: number;
};

type ConfigEntry = {
  id: string;
  label: string;
  config: HeuristicConfig;
  source: string;
};

type ConfigStats = {
  appearances: number;
  totalVp: number;
  topFinishes: number;
  winShare: number;
};

type Standing = {
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

function printUsage(): void {
  console.log('Usage: npx tsx scripts/bot_evals.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --configs <list>          Comma-separated config paths (up to 4)');
  console.log('                            Example: --configs a.json,b.json,c.json,d.json');
  console.log('                            Omit to use standard config for all players.');
  console.log('  --players <n>             Player count, 2-4 (default: from --configs count, else 2)');
  console.log('  --rounds <n>              Number of seat-rotation rounds (default: 10)');
  console.log('  --max-turns <n>           Max turns per game (default: 500)');
  console.log('  --max-steps-per-turn <n>  Max bot steps per turn (default: 300)');
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
        id: 'standard',
        label: 'standard',
        source: 'HEURISTIC_STANDARD_CONFIG',
        config: HEURISTIC_STANDARD_CONFIG,
      },
    ];
  }

  return paths.map((path, index) => ({
    id: `cfg${index + 1}`,
    label: basename(path).replace(/\.json$/i, ''),
    source: resolve(path),
    config: loadConfig(path),
  }));
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

  const statsByConfigId = new Map<string, ConfigStats>();
  for (const config of configPool) {
    statsByConfigId.set(config.id, {
      appearances: 0,
      totalVp: 0,
      topFinishes: 0,
      winShare: 0,
    });
  }

  let totalGames = 0;
  let incompleteGames = 0;
  const stalls: StallRecord[] = [];

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
          createHeuristicBot(configByPlayerId[player.id].config, configByPlayerId[player.id].id),
        ]),
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
      const topScore = Math.max(...summary.map((entry) => entry.total));
      const topPlayers = summary.filter((entry) => entry.total === topScore);
      const sharedWin = topPlayers.length > 0 ? 1 / topPlayers.length : 0;

      for (const entry of summary) {
        const config = configByPlayerId[entry.playerId];
        const stats = statsByConfigId.get(config.id);
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
    const stats = statsByConfigId.get(config.id)!;
    const avgVp = stats.appearances > 0 ? stats.totalVp / stats.appearances : 0;
    const topFinishRate =
      stats.appearances > 0 ? stats.topFinishes / stats.appearances : 0;
    const winShareRate = stats.appearances > 0 ? stats.winShare / stats.appearances : 0;
    return {
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
}

main();

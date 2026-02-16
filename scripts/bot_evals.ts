import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createHeuristicBot,
  getHeadlessScoreSummary,
  HEURISTIC_STANDARD_CONFIG,
  HeuristicConfig,
  runHeadlessBotMatch,
} from '../src/game/bot/index.ts';
import { PlayerConfig } from '../src/game/index.ts';

type StrategyLabel = 'A' | 'B';

type CliOptions = {
  pairs: number;
  players: number;
  configAPath?: string;
  configBPath?: string;
  maxTurns: number;
  maxStepsPerTurn: number;
  minWinRate: number;
  minVpDelta: number;
};

type GameEvaluation = {
  pairIndex: number;
  gameIndex: number;
  averageScoreA: number;
  averageScoreB: number;
  deltaAminusB: number;
  winner: StrategyLabel | 'Tie';
  completed: boolean;
  turnsPlayed: number;
  stallReason: string | null;
};

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function printUsage(): void {
  console.log('Usage: npx tsx scripts/eval-configs.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --pairs <n>               Number of A/B seat-swapped pairs (default: 10)');
  console.log('  --players <n>             Player count, 2-4 (default: 2)');
  console.log('  --config-a <path>         JSON file for Config A (optional)');
  console.log('  --config-b <path>         JSON file for Config B (optional)');
  console.log('  --max-turns <n>           Max turns per game (default: 500)');
  console.log('  --max-steps-per-turn <n>  Max bot steps per turn (default: 300)');
  console.log('  --min-win-rate <0..1>     Clear margin win-rate threshold (default: 0.6)');
  console.log('  --min-vp-delta <n>        Clear margin VP delta threshold (default: 3)');
  console.log('  --help                    Show this help');
  console.log('');
  console.log('Example:');
  console.log(
    '  npx tsx scripts/eval-configs.ts --pairs 10 --players 2 --config-a config/a.json --config-b config/b.json',
  );
}

function parseNumber(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${name}: ${value}`);
  }
  return parsed;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    pairs: 10,
    players: 2,
    maxTurns: 500,
    maxStepsPerTurn: 300,
    minWinRate: 0.6,
    minVpDelta: 3,
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
      case '--pairs':
        options.pairs = parseNumber(next, '--pairs');
        i += 1;
        break;
      case '--players':
        options.players = parseNumber(next, '--players');
        i += 1;
        break;
      case '--config-a':
        options.configAPath = next;
        i += 1;
        break;
      case '--config-b':
        options.configBPath = next;
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
      case '--min-win-rate':
        options.minWinRate = parseNumber(next, '--min-win-rate');
        i += 1;
        break;
      case '--min-vp-delta':
        options.minVpDelta = parseNumber(next, '--min-vp-delta');
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.pairs) || options.pairs <= 0) {
    throw new Error('--pairs must be a positive integer.');
  }
  if (
    !Number.isInteger(options.players) ||
    options.players < 2 ||
    options.players > 4
  ) {
    throw new Error('--players must be an integer from 2 to 4.');
  }
  if (!Number.isInteger(options.maxTurns) || options.maxTurns <= 0) {
    throw new Error('--max-turns must be a positive integer.');
  }
  if (
    !Number.isInteger(options.maxStepsPerTurn) ||
    options.maxStepsPerTurn <= 0
  ) {
    throw new Error('--max-steps-per-turn must be a positive integer.');
  }
  if (options.minWinRate <= 0 || options.minWinRate >= 1) {
    throw new Error('--min-win-rate must be between 0 and 1 (exclusive).');
  }
  if (options.minVpDelta < 0) {
    throw new Error('--min-vp-delta must be >= 0.');
  }

  return options;
}

function mergeConfig(
  base: HeuristicConfig,
  override: DeepPartial<HeuristicConfig>,
): HeuristicConfig {
  return {
    productionWeights: {
      ...base.productionWeights,
      ...override.productionWeights,
    },
    developmentWeights: {
      ...base.developmentWeights,
      ...override.developmentWeights,
    },
    foodPolicyWeights: {
      ...base.foodPolicyWeights,
      ...override.foodPolicyWeights,
    },
    buildWeights: {
      ...base.buildWeights,
      ...override.buildWeights,
    },
    preferExchangeBeforeDevelopment:
      override.preferExchangeBeforeDevelopment ??
      base.preferExchangeBeforeDevelopment,
  };
}

function loadConfig(path: string | undefined): HeuristicConfig {
  if (!path) {
    return HEURISTIC_STANDARD_CONFIG;
  }
  const resolved = resolve(path);
  const raw = readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(raw) as DeepPartial<HeuristicConfig>;
  return mergeConfig(HEURISTIC_STANDARD_CONFIG, parsed);
}

function createPlayersForGame(
  playerCount: number,
  firstSeatStrategy: StrategyLabel,
): {
  players: PlayerConfig[];
  strategyByPlayerId: Record<string, StrategyLabel>;
} {
  const players: PlayerConfig[] = [];
  const strategyByPlayerId: Record<string, StrategyLabel> = {};
  const other: StrategyLabel = firstSeatStrategy === 'A' ? 'B' : 'A';

  for (let i = 0; i < playerCount; i += 1) {
    const strategy = i % 2 === 0 ? firstSeatStrategy : other;
    const id = `${strategy.toLowerCase()}-${i + 1}`;
    players.push({
      id,
      name: `${strategy} Bot ${i + 1}`,
      controller: 'bot',
    });
    strategyByPlayerId[id] = strategy;
  }

  return { players, strategyByPlayerId };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function evaluateGame(
  pairIndex: number,
  gameIndex: number,
  players: PlayerConfig[],
  strategyByPlayerId: Record<string, StrategyLabel>,
  configA: HeuristicConfig,
  configB: HeuristicConfig,
  options: CliOptions,
): GameEvaluation {
  const strategyByPlayer = Object.fromEntries(
    players.map((player) => [
      player.id,
      strategyByPlayerId[player.id] === 'A'
        ? createHeuristicBot(configA, 'heuristic-a')
        : createHeuristicBot(configB, 'heuristic-b'),
    ]),
  );

  const result = runHeadlessBotMatch(players, {
    strategyByPlayerId: strategyByPlayer,
    maxTurns: options.maxTurns,
    maxStepsPerTurn: options.maxStepsPerTurn,
  });
  const summary = getHeadlessScoreSummary(result.finalGame);
  const scoresA: number[] = [];
  const scoresB: number[] = [];
  for (const entry of summary) {
    const strategy = strategyByPlayerId[entry.playerId];
    if (strategy === 'A') {
      scoresA.push(entry.total);
    } else if (strategy === 'B') {
      scoresB.push(entry.total);
    }
  }

  const averageScoreA = average(scoresA);
  const averageScoreB = average(scoresB);
  const delta = averageScoreA - averageScoreB;
  const winner: StrategyLabel | 'Tie' =
    delta > 0 ? 'A' : delta < 0 ? 'B' : 'Tie';

  return {
    pairIndex,
    gameIndex,
    averageScoreA,
    averageScoreB,
    deltaAminusB: delta,
    winner,
    completed: result.completed,
    turnsPlayed: result.turnsPlayed,
    stallReason: result.stallReason,
  };
}

function format(num: number): string {
  return num.toFixed(2);
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const configA = loadConfig(options.configAPath);
  const configB = loadConfig(options.configBPath);

  const evaluations: GameEvaluation[] = [];
  for (let pair = 1; pair <= options.pairs; pair += 1) {
    const game1Setup = createPlayersForGame(options.players, 'A');
    evaluations.push(
      evaluateGame(
        pair,
        1,
        game1Setup.players,
        game1Setup.strategyByPlayerId,
        configA,
        configB,
        options,
      ),
    );

    const game2Setup = createPlayersForGame(options.players, 'B');
    evaluations.push(
      evaluateGame(
        pair,
        2,
        game2Setup.players,
        game2Setup.strategyByPlayerId,
        configA,
        configB,
        options,
      ),
    );
  }

  const winsA = evaluations.filter((evaluation) => evaluation.winner === 'A').length;
  const winsB = evaluations.filter((evaluation) => evaluation.winner === 'B').length;
  const ties = evaluations.filter((evaluation) => evaluation.winner === 'Tie').length;
  const decisiveGames = winsA + winsB;
  const winRateA = decisiveGames > 0 ? winsA / decisiveGames : 0;
  const winRateB = decisiveGames > 0 ? winsB / decisiveGames : 0;
  const meanDelta = average(evaluations.map((evaluation) => evaluation.deltaAminusB));
  const avgScoreA = average(evaluations.map((evaluation) => evaluation.averageScoreA));
  const avgScoreB = average(evaluations.map((evaluation) => evaluation.averageScoreB));
  const avgTurns = average(evaluations.map((evaluation) => evaluation.turnsPlayed));
  const stalled = evaluations.filter((evaluation) => !evaluation.completed).length;

  const aHasClearMargin =
    winRateA >= options.minWinRate && meanDelta >= options.minVpDelta;
  const bHasClearMargin =
    winRateB >= options.minWinRate && meanDelta <= -options.minVpDelta;

  console.log('=== Heuristic Config Evaluation ===');
  console.log(`Pairs: ${options.pairs} (total games: ${evaluations.length})`);
  console.log(`Players per game: ${options.players}`);
  console.log(
    `Config A: ${options.configAPath ? resolve(options.configAPath) : 'HEURISTIC_STANDARD_CONFIG'}`,
  );
  console.log(
    `Config B: ${options.configBPath ? resolve(options.configBPath) : 'HEURISTIC_STANDARD_CONFIG'}`,
  );
  console.log('');
  console.log('Per-game result uses average VP of each strategy seats in that game.');
  console.log('');
  console.log(`Wins A: ${winsA}`);
  console.log(`Wins B: ${winsB}`);
  console.log(`Ties: ${ties}`);
  console.log(`Win rate A (decisive games): ${(winRateA * 100).toFixed(1)}%`);
  console.log(`Win rate B (decisive games): ${(winRateB * 100).toFixed(1)}%`);
  console.log(`Average VP A: ${format(avgScoreA)}`);
  console.log(`Average VP B: ${format(avgScoreB)}`);
  console.log(`Mean VP delta (A - B): ${format(meanDelta)}`);
  console.log(`Average turns: ${format(avgTurns)}`);
  console.log(`Incomplete games: ${stalled}/${evaluations.length}`);
  console.log('');
  console.log(
    `Clear-margin rule: win rate >= ${(options.minWinRate * 100).toFixed(
      1,
    )}% and |mean VP delta| >= ${format(options.minVpDelta)}`,
  );
  if (aHasClearMargin) {
    console.log('Result: Config A wins by a clear margin.');
  } else if (bHasClearMargin) {
    console.log('Result: Config B wins by a clear margin.');
  } else {
    console.log('Result: No clear-margin winner yet.');
  }

  if (stalled > 0) {
    const firstStall = evaluations.find((evaluation) => !evaluation.completed);
    if (firstStall?.stallReason) {
      console.log(`Sample stall reason: ${firstStall.stallReason}`);
    }
  }
}

main();

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  HEURISTIC_STANDARD_CONFIG,
  HeuristicConfig,
  LOOKAHEAD_STANDARD_CONFIG,
} from '../src/game/bot/index.ts';
import {
  BotConfigFile,
  loadConfigEntry,
  parseNumber,
} from './helpers.ts';

type NumericPath =
  | 'productionWeights.food'
  | 'productionWeights.goods'
  | 'productionWeights.workers'
  | 'productionWeights.skulls'
  | 'developmentWeights.points'
  | 'foodPolicyWeights.starvationPenaltyPerUnit'
  | 'foodPolicyWeights.foodDeficitPriorityPerUnit'
  | 'buildWeights.cityExtraDieFutureValue'
  | 'buildWeights.cityDeferredCompletionValueScale'
  | 'buildWeights.monumentPoints'
  | 'buildWeights.monumentPointEfficiency'
  | 'buildWeights.monumentProgress'
  | 'buildWeights.monumentWorkersUsed'
  | 'buildWeights.monumentSpecialEffect'
  | 'buildWeights.monumentDeferredCompletionValueScale'
  | 'buildWeights.monumentDeferredMaxTurnsToComplete';

type BooleanPath =
  | 'preferExchangeBeforeDevelopment'
  | 'foodPolicyWeights.forceRerollOnFoodShortage';

type DimensionDef =
  | {
      id: string;
      type: 'scale';
      path: NumericPath;
      factor: number;
      min: number;
      max: number;
    }
  | {
      id: string;
      type: 'flip';
      path: BooleanPath;
    };

type CliOptions = {
  outDir: string;
  botType: BotConfigFile['botType'];
  iterations: number;
  beamWidth: number;
  childrenPerParent: number;
  players: number;
  games: number;
  finalGames: number;
  workers: number | 'auto';
  maxTurns: number;
  maxStepsPerTurn: number;
};

type BeamCandidate = {
  id: number;
  key: string;
  dimensions: string[];
  path: string;
};

type TournamentResult = {
  name: string;
  path: string;
  quick: {
    winsA: number;
    winsB: number;
    ties: number;
    decisiveGames: number;
    totalGames: number;
    winRateA: number;
    meanDelta: number;
    avgScoreA: number;
    avgScoreB: number;
  };
  final?: {
    winsA: number;
    winsB: number;
    ties: number;
    decisiveGames: number;
    totalGames: number;
    winRateA: number;
    meanDelta: number;
    avgScoreA: number;
    avgScoreB: number;
  };
};

type TournamentJson = {
  results: TournamentResult[];
};

const DIMENSIONS: DimensionDef[] = [
  { id: 'foodAggressive', type: 'scale', path: 'productionWeights.food', factor: 1.6, min: 0, max: 30 },
  { id: 'goodsAggressive', type: 'scale', path: 'productionWeights.goods', factor: 1.4, min: 0, max: 40 },
  { id: 'workerAggressive', type: 'scale', path: 'productionWeights.workers', factor: 1.5, min: 0, max: 30 },
  { id: 'skullAverse', type: 'scale', path: 'productionWeights.skulls', factor: 1.35, min: -40, max: -0.1 },
  { id: 'starvationAverse', type: 'scale', path: 'foodPolicyWeights.starvationPenaltyPerUnit', factor: 1.6, min: 0, max: 200 },
  { id: 'monumentBias', type: 'scale', path: 'buildWeights.monumentPoints', factor: 1.5, min: 0, max: 30 },
  { id: 'monumentProgressBias', type: 'scale', path: 'buildWeights.monumentProgress', factor: 1.6, min: 0, max: 10 },
  { id: 'monumentWorkersBias', type: 'scale', path: 'buildWeights.monumentWorkersUsed', factor: 1.8, min: 0, max: 5 },
  { id: 'monumentEffectBias', type: 'scale', path: 'buildWeights.monumentSpecialEffect', factor: 1.7, min: 0, max: 10 },
  { id: 'cityDieBias', type: 'scale', path: 'buildWeights.cityExtraDieFutureValue', factor: 1.8, min: 0, max: 10 },
  { id: 'cityDeferredBuildBias', type: 'scale', path: 'buildWeights.cityDeferredCompletionValueScale', factor: 1.6, min: 0, max: 3 },
  { id: 'devPointsBias', type: 'scale', path: 'developmentWeights.points', factor: 1.7, min: 0, max: 20 },
  { id: 'exchangeFirst', type: 'flip', path: 'preferExchangeBeforeDevelopment' },
  { id: 'monumentDeferredBias', type: 'scale', path: 'buildWeights.monumentDeferredCompletionValueScale', factor: 1.5, min: 0, max: 3 },
  { id: 'monumentLongHorizon', type: 'scale', path: 'buildWeights.monumentDeferredMaxTurnsToComplete', factor: 1.5, min: 0.5, max: 6 },
  { id: 'forceFoodReroll', type: 'flip', path: 'foodPolicyWeights.forceRerollOnFoodShortage' },
];

function printUsage(): void {
  console.log('Usage: npx tsx scripts/bot_beam_search.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --out-dir <dir>            Output directory (default: output/bot-beam)');
  console.log('  --bot-type <type>          heuristic|lookahead (default: heuristic)');
  console.log('  --iterations <n>           Beam iterations (default: 5)');
  console.log('  --beam-width <n>           Candidates kept per iteration (default: 8)');
  console.log('  --children-per-parent <n>  New expansions per parent (default: 4)');
  console.log('  --players <n>              Tournament player count 2-4 (default: 2)');
  console.log('  --games <n>                Quick games per candidate (default: 20)');
  console.log('  --final-games <n>          Final games for finalists (default: 20)');
  console.log('  --workers <n|auto>         Tournament workers (default: auto)');
  console.log('  --max-turns <n>            Max turns per game (default: 500)');
  console.log('  --max-steps-per-turn <n>   Max bot steps per turn (default: 300)');
  console.log('  --help                     Show help');
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    outDir: 'output/bot-beam',
    botType: 'heuristic',
    iterations: 5,
    beamWidth: 8,
    childrenPerParent: 4,
    players: 2,
    games: 20,
    finalGames: 20,
    workers: 'auto',
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
      case '--out-dir':
        options.outDir = next;
        i += 1;
        break;
      case '--bot-type':
        if (next !== 'heuristic' && next !== 'lookahead') {
          throw new Error('--bot-type must be "heuristic" or "lookahead".');
        }
        options.botType = next;
        i += 1;
        break;
      case '--iterations':
        options.iterations = parseNumber(next, '--iterations');
        i += 1;
        break;
      case '--beam-width':
        options.beamWidth = parseNumber(next, '--beam-width');
        i += 1;
        break;
      case '--children-per-parent':
        options.childrenPerParent = parseNumber(next, '--children-per-parent');
        i += 1;
        break;
      case '--players':
        options.players = parseNumber(next, '--players');
        i += 1;
        break;
      case '--games':
        options.games = parseNumber(next, '--games');
        i += 1;
        break;
      case '--final-games':
        options.finalGames = parseNumber(next, '--final-games');
        i += 1;
        break;
      case '--workers':
        options.workers = next.toLowerCase() === 'auto' ? 'auto' : parseNumber(next, '--workers');
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

  if (!Number.isInteger(options.iterations) || options.iterations <= 0) {
    throw new Error('--iterations must be a positive integer.');
  }
  if (!Number.isInteger(options.beamWidth) || options.beamWidth <= 0) {
    throw new Error('--beam-width must be a positive integer.');
  }
  if (!Number.isInteger(options.childrenPerParent) || options.childrenPerParent <= 0) {
    throw new Error('--children-per-parent must be a positive integer.');
  }
  if (!Number.isInteger(options.players) || options.players < 2 || options.players > 4) {
    throw new Error('--players must be 2..4.');
  }

  return options;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function cloneConfig(config: HeuristicConfig): HeuristicConfig {
  return JSON.parse(JSON.stringify(config)) as HeuristicConfig;
}

function setNumeric(config: HeuristicConfig, path: NumericPath, value: number): void {
  const rounded = round2(value);
  switch (path) {
    case 'productionWeights.food':
      config.productionWeights.food = rounded; break;
    case 'productionWeights.goods':
      config.productionWeights.goods = rounded; break;
    case 'productionWeights.workers':
      config.productionWeights.workers = rounded; break;
    case 'productionWeights.skulls':
      config.productionWeights.skulls = rounded; break;
    case 'developmentWeights.points':
      config.developmentWeights.points = rounded; break;
    case 'foodPolicyWeights.starvationPenaltyPerUnit':
      config.foodPolicyWeights.starvationPenaltyPerUnit = rounded; break;
    case 'foodPolicyWeights.foodDeficitPriorityPerUnit':
      config.foodPolicyWeights.foodDeficitPriorityPerUnit = rounded; break;
    case 'buildWeights.cityExtraDieFutureValue':
      config.buildWeights.cityExtraDieFutureValue = rounded; break;
    case 'buildWeights.cityDeferredCompletionValueScale':
      config.buildWeights.cityDeferredCompletionValueScale = rounded; break;
    case 'buildWeights.monumentPoints':
      config.buildWeights.monumentPoints = rounded; break;
    case 'buildWeights.monumentPointEfficiency':
      config.buildWeights.monumentPointEfficiency = rounded; break;
    case 'buildWeights.monumentProgress':
      config.buildWeights.monumentProgress = rounded; break;
    case 'buildWeights.monumentWorkersUsed':
      config.buildWeights.monumentWorkersUsed = rounded; break;
    case 'buildWeights.monumentSpecialEffect':
      config.buildWeights.monumentSpecialEffect = rounded; break;
    case 'buildWeights.monumentDeferredCompletionValueScale':
      config.buildWeights.monumentDeferredCompletionValueScale = rounded; break;
    case 'buildWeights.monumentDeferredMaxTurnsToComplete':
      config.buildWeights.monumentDeferredMaxTurnsToComplete = rounded; break;
  }
}

function getNumeric(config: HeuristicConfig, path: NumericPath): number {
  switch (path) {
    case 'productionWeights.food': return config.productionWeights.food;
    case 'productionWeights.goods': return config.productionWeights.goods;
    case 'productionWeights.workers': return config.productionWeights.workers;
    case 'productionWeights.skulls': return config.productionWeights.skulls;
    case 'developmentWeights.points': return config.developmentWeights.points;
    case 'foodPolicyWeights.starvationPenaltyPerUnit': return config.foodPolicyWeights.starvationPenaltyPerUnit;
    case 'foodPolicyWeights.foodDeficitPriorityPerUnit': return config.foodPolicyWeights.foodDeficitPriorityPerUnit;
    case 'buildWeights.cityExtraDieFutureValue': return config.buildWeights.cityExtraDieFutureValue;
    case 'buildWeights.cityDeferredCompletionValueScale': return config.buildWeights.cityDeferredCompletionValueScale;
    case 'buildWeights.monumentPoints': return config.buildWeights.monumentPoints;
    case 'buildWeights.monumentPointEfficiency': return config.buildWeights.monumentPointEfficiency;
    case 'buildWeights.monumentProgress': return config.buildWeights.monumentProgress;
    case 'buildWeights.monumentWorkersUsed': return config.buildWeights.monumentWorkersUsed;
    case 'buildWeights.monumentSpecialEffect': return config.buildWeights.monumentSpecialEffect;
    case 'buildWeights.monumentDeferredCompletionValueScale': return config.buildWeights.monumentDeferredCompletionValueScale;
    case 'buildWeights.monumentDeferredMaxTurnsToComplete': return config.buildWeights.monumentDeferredMaxTurnsToComplete;
  }
}

function flipBoolean(config: HeuristicConfig, path: BooleanPath): void {
  switch (path) {
    case 'preferExchangeBeforeDevelopment':
      config.preferExchangeBeforeDevelopment = !config.preferExchangeBeforeDevelopment;
      break;
    case 'foodPolicyWeights.forceRerollOnFoodShortage':
      config.foodPolicyWeights.forceRerollOnFoodShortage =
        !config.foodPolicyWeights.forceRerollOnFoodShortage;
      break;
  }
}

function applyDimension(config: HeuristicConfig, dimensionId: string): void {
  const dimension = DIMENSIONS.find((entry) => entry.id === dimensionId);
  if (!dimension) {
    throw new Error(`Unknown dimension id: ${dimensionId}`);
  }
  if (dimension.type === 'flip') {
    flipBoolean(config, dimension.path);
    return;
  }
  const current = getNumeric(config, dimension.path);
  const next = clamp(current * dimension.factor, dimension.min, dimension.max);
  setNumeric(config, dimension.path, next);
}

function buildConfigFromDimensions(
  dimensionIds: string[],
  botType: BotConfigFile['botType'],
): BotConfigFile['config'] {
  const heuristicConfig = cloneConfig(HEURISTIC_STANDARD_CONFIG);
  for (const dimensionId of dimensionIds) {
    applyDimension(heuristicConfig, dimensionId);
  }
  if (botType === 'lookahead') {
    return {
      ...LOOKAHEAD_STANDARD_CONFIG,
      heuristicFallbackConfig: heuristicConfig,
    };
  }
  return heuristicConfig;
}

function dimensionKey(dimensionIds: string[]): string {
  return [...dimensionIds].sort((a, b) => a.localeCompare(b)).join('+');
}

function writeCandidate(
  dir: string,
  id: number,
  dimensions: string[],
  botType: BotConfigFile['botType'],
): BeamCandidate {
  const key = dimensionKey(dimensions);
  const filePath = join(dir, `${id}.json`);
  const payload: BotConfigFile = {
    id,
    name: dimensions.length > 0 ? dimensions.join('+') : `${botType}-baseline`,
    botType,
    dimensions,
    config: buildConfigFromDimensions(dimensions, botType),
  };
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { id, key, dimensions, path: filePath };
}

function runTournament(
  candidatesDir: string,
  baselinePath: string,
  resultsPath: string,
  options: CliOptions,
): TournamentJson {
  const args = [
    '--import',
    'tsx',
    'scripts/bot_tournament.ts',
    '--candidates-dir',
    candidatesDir,
    '--baseline',
    baselinePath,
    '--players',
    String(options.players),
    '--games',
    String(options.games),
    '--final-games',
    String(options.finalGames),
    '--top',
    String(options.beamWidth),
    '--max-turns',
    String(options.maxTurns),
    '--max-steps-per-turn',
    String(options.maxStepsPerTurn),
    '--workers',
    String(options.workers),
    '--output-json',
    resultsPath,
  ];
  const run = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (run.status !== 0) {
    throw new Error(`Tournament command failed for ${candidatesDir}`);
  }
  const raw = readFileSync(resultsPath, 'utf8');
  return JSON.parse(raw) as TournamentJson;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const outDir = resolve(options.outDir);
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }
  mkdirSync(outDir, { recursive: true });

  const baselineDir = join(outDir, 'baseline');
  mkdirSync(baselineDir, { recursive: true });
  let nextId = 0;
  const baseline = writeCandidate(baselineDir, nextId, [], options.botType);
  nextId += 1;

  let beam: BeamCandidate[] = [baseline];
  const history: Array<{
    iteration: number;
    candidateCount: number;
    winner: {
      name: string;
      path: string;
      gamesWon: number;
      gamesLost: number;
      ties: number;
      decisiveGames: number;
      totalGames: number;
      winRatePct: number;
      winRateDecisivePct: number;
      avgScore: number;
      opponentAvgScore: number;
    } | null;
    beam: Array<{ name: string; path: string }>;
  }> = [];

  for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
    const iterDir = join(outDir, `iter-${iteration}`);
    mkdirSync(iterDir, { recursive: true });
    const byKey = new Map<string, BeamCandidate>();

    const ensureCandidate = (dimensions: string[]) => {
      const key = dimensionKey(dimensions);
      if (byKey.has(key)) {
        return;
      }
      const candidate = writeCandidate(
        iterDir,
        nextId,
        [...dimensions].sort((a, b) => a.localeCompare(b)),
        options.botType,
      );
      nextId += 1;
      byKey.set(key, candidate);
    };

    ensureCandidate([]);
    for (const parent of beam) {
      ensureCandidate(parent.dimensions);
      const available = DIMENSIONS.map((dimension) => dimension.id).filter(
        (id) => !parent.dimensions.includes(id),
      );
      for (const addId of available.slice(0, options.childrenPerParent)) {
        ensureCandidate([...parent.dimensions, addId]);
      }
    }

    const resultsPath = join(iterDir, 'tournament-results.json');
    const tournament = runTournament(iterDir, baseline.path, resultsPath, options);
    const selected = tournament.results.slice(0, options.beamWidth);
    const winner = selected[0];
    const winnerSummary = winner?.final ?? winner?.quick;
    const nextBeam: BeamCandidate[] = [];

    for (const result of selected) {
      const loaded = loadConfigEntry(result.path);
      nextBeam.push({
        id: Number(loaded.id),
        key: dimensionKey(loaded.dimensions ?? []),
        dimensions: loaded.dimensions ?? [],
        path: result.path,
      });
    }

    beam = nextBeam;
    history.push({
      iteration,
      candidateCount: byKey.size,
      winner: winnerSummary
        ? {
            name: winner.name,
            path: winner.path,
            gamesWon: winnerSummary.winsA,
            gamesLost: winnerSummary.winsB,
            ties: winnerSummary.ties,
            decisiveGames: winnerSummary.decisiveGames,
            totalGames: winnerSummary.totalGames,
            winRatePct:
              Math.round(
                (winnerSummary.winsA / Math.max(1, winnerSummary.totalGames)) * 10000,
              ) / 100,
            winRateDecisivePct:
              Math.round(
                (winnerSummary.winsA / Math.max(1, winnerSummary.decisiveGames)) *
                  10000,
              ) / 100,
            avgScore: Math.round(winnerSummary.avgScoreA * 100) / 100,
            opponentAvgScore: Math.round(winnerSummary.avgScoreB * 100) / 100,
          }
        : null,
      beam: selected.map((entry) => ({ name: entry.name, path: entry.path })),
    });

    console.log(
      `Beam iteration ${iteration}: candidates=${byKey.size}, kept=${beam.length}`,
    );
    if (winnerSummary) {
      console.log(
        `  winner=${winner.name}, finalRound=${winnerSummary.winsA}-${winnerSummary.winsB}-${winnerSummary.ties}, ` +
          `winRate=${(
            (winnerSummary.winsA / Math.max(1, winnerSummary.totalGames)) *
            100
          ).toFixed(2)}%, ` +
          `decisiveWinRate=${(winnerSummary.winRateA * 100).toFixed(2)}%`,
      );
    }

    if (beam.length === 0) {
      break;
    }
  }

  const summaryPath = join(outDir, 'beam-summary.json');
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        options,
        generatedAt: new Date().toISOString(),
        baselinePath: baseline.path,
        iterations: history,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`Wrote summary: ${summaryPath}`);
}

main();

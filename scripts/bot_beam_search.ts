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
  LookaheadConfig,
  LOOKAHEAD_STANDARD_CONFIG,
} from '../src/game/bot/index.ts';
import {
  BotConfigFile,
  loadConfigEntry,
  parseNumber,
} from './helpers.ts';

type HeuristicNumericPath =
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

type HeuristicBooleanPath =
  | 'preferExchangeBeforeDevelopment'
  | 'foodPolicyWeights.forceRerollOnFoodShortage';

type LookaheadNumericPath =
  | 'depth'
  | 'maxEnumeratedRollDice'
  | 'maxActionsPerNode'
  | 'maxEvaluations'
  | 'utilityWeights.scoreTotal'
  | 'utilityWeights.completedCities'
  | 'utilityWeights.cityProgress'
  | 'utilityWeights.monumentProgress'
  | 'utilityWeights.goodsValue'
  | 'utilityWeights.food'
  | 'utilityWeights.turnResourcePosition'
  | 'utilityWeights.foodRiskPenalty'
  | `heuristicFallbackConfig.${HeuristicNumericPath}`;

type LookaheadBooleanPath =
  | `heuristicFallbackConfig.${HeuristicBooleanPath}`;

type DimensionDef =
  | {
      id: string;
      type: 'scale';
      heuristicPath?: HeuristicNumericPath;
      lookaheadPath?: LookaheadNumericPath;
      factor: number;
      min: number;
      max: number;
      integer?: boolean;
    }
  | {
      id: string;
      type: 'flip';
      heuristicPath?: HeuristicBooleanPath;
      lookaheadPath?: LookaheadBooleanPath;
    };

type CliOptions = {
  outDir: string;
  botType: BotConfigFile['botType'];
  seed: number;
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
  {
    id: 'foodAggressive',
    type: 'scale',
    heuristicPath: 'productionWeights.food',
    lookaheadPath: 'heuristicFallbackConfig.productionWeights.food',
    factor: 1.6,
    min: 0,
    max: 30,
  },
  {
    id: 'goodsAggressive',
    type: 'scale',
    heuristicPath: 'productionWeights.goods',
    lookaheadPath: 'heuristicFallbackConfig.productionWeights.goods',
    factor: 1.4,
    min: 0,
    max: 40,
  },
  {
    id: 'workerAggressive',
    type: 'scale',
    heuristicPath: 'productionWeights.workers',
    lookaheadPath: 'heuristicFallbackConfig.productionWeights.workers',
    factor: 1.5,
    min: 0,
    max: 30,
  },
  {
    id: 'skullAverse',
    type: 'scale',
    heuristicPath: 'productionWeights.skulls',
    lookaheadPath: 'heuristicFallbackConfig.productionWeights.skulls',
    factor: 1.35,
    min: -40,
    max: -0.1,
  },
  {
    id: 'starvationAverse',
    type: 'scale',
    heuristicPath: 'foodPolicyWeights.starvationPenaltyPerUnit',
    lookaheadPath: 'heuristicFallbackConfig.foodPolicyWeights.starvationPenaltyPerUnit',
    factor: 1.6,
    min: 0,
    max: 200,
  },
  {
    id: 'monumentBias',
    type: 'scale',
    heuristicPath: 'buildWeights.monumentPoints',
    lookaheadPath: 'heuristicFallbackConfig.buildWeights.monumentPoints',
    factor: 1.5,
    min: 0,
    max: 30,
  },
  {
    id: 'monumentProgressBias',
    type: 'scale',
    heuristicPath: 'buildWeights.monumentProgress',
    lookaheadPath: 'heuristicFallbackConfig.buildWeights.monumentProgress',
    factor: 1.6,
    min: 0,
    max: 10,
  },
  {
    id: 'monumentWorkersBias',
    type: 'scale',
    heuristicPath: 'buildWeights.monumentWorkersUsed',
    lookaheadPath: 'heuristicFallbackConfig.buildWeights.monumentWorkersUsed',
    factor: 1.8,
    min: 0,
    max: 5,
  },
  {
    id: 'monumentEffectBias',
    type: 'scale',
    heuristicPath: 'buildWeights.monumentSpecialEffect',
    lookaheadPath: 'heuristicFallbackConfig.buildWeights.monumentSpecialEffect',
    factor: 1.7,
    min: 0,
    max: 10,
  },
  {
    id: 'cityDieBias',
    type: 'scale',
    heuristicPath: 'buildWeights.cityExtraDieFutureValue',
    lookaheadPath: 'heuristicFallbackConfig.buildWeights.cityExtraDieFutureValue',
    factor: 1.8,
    min: 0,
    max: 10,
  },
  {
    id: 'cityDeferredBuildBias',
    type: 'scale',
    heuristicPath: 'buildWeights.cityDeferredCompletionValueScale',
    lookaheadPath: 'heuristicFallbackConfig.buildWeights.cityDeferredCompletionValueScale',
    factor: 1.6,
    min: 0,
    max: 3,
  },
  {
    id: 'devPointsBias',
    type: 'scale',
    heuristicPath: 'developmentWeights.points',
    lookaheadPath: 'heuristicFallbackConfig.developmentWeights.points',
    factor: 1.7,
    min: 0,
    max: 20,
  },
  {
    id: 'exchangeFirst',
    type: 'flip',
    heuristicPath: 'preferExchangeBeforeDevelopment',
    lookaheadPath: 'heuristicFallbackConfig.preferExchangeBeforeDevelopment',
  },
  {
    id: 'monumentDeferredBias',
    type: 'scale',
    heuristicPath: 'buildWeights.monumentDeferredCompletionValueScale',
    lookaheadPath: 'heuristicFallbackConfig.buildWeights.monumentDeferredCompletionValueScale',
    factor: 1.5,
    min: 0,
    max: 3,
  },
  {
    id: 'monumentLongHorizon',
    type: 'scale',
    heuristicPath: 'buildWeights.monumentDeferredMaxTurnsToComplete',
    lookaheadPath: 'heuristicFallbackConfig.buildWeights.monumentDeferredMaxTurnsToComplete',
    factor: 1.5,
    min: 0.5,
    max: 6,
  },
  {
    id: 'forceFoodReroll',
    type: 'flip',
    heuristicPath: 'foodPolicyWeights.forceRerollOnFoodShortage',
    lookaheadPath: 'heuristicFallbackConfig.foodPolicyWeights.forceRerollOnFoodShortage',
  },
  { id: 'lookaheadDeeper', type: 'scale', lookaheadPath: 'depth', factor: 1.5, min: 1, max: 4, integer: true },
  {
    id: 'lookaheadWiderActions',
    type: 'scale',
    lookaheadPath: 'maxActionsPerNode',
    factor: 1.4,
    min: 4,
    max: 20,
    integer: true,
  },
  {
    id: 'lookaheadMoreEvaluations',
    type: 'scale',
    lookaheadPath: 'maxEvaluations',
    factor: 1.5,
    min: 200,
    max: 5000,
    integer: true,
  },
  {
    id: 'lookaheadUtilityVpHeavy',
    type: 'scale',
    lookaheadPath: 'utilityWeights.scoreTotal',
    factor: 1.25,
    min: 1,
    max: 300,
  },
  {
    id: 'lookaheadUtilityFoodSafety',
    type: 'scale',
    lookaheadPath: 'utilityWeights.foodRiskPenalty',
    factor: 1.35,
    min: 0,
    max: 10,
  },
  {
    id: 'lookaheadUtilityResourceNow',
    type: 'scale',
    lookaheadPath: 'utilityWeights.turnResourcePosition',
    factor: 1.25,
    min: 0,
    max: 10,
  },
];

function printUsage(): void {
  console.log('Usage: npx tsx scripts/bot_beam_search.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --out-dir <dir>            Output directory (default: output/bot-beam)');
  console.log('  --bot-type <type>          heuristic|lookahead (default: heuristic)');
  console.log('  --seed <n>                 Seed for expansion randomness (default: 1)');
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
    seed: 1,
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
      case '--seed':
        options.seed = parseNumber(next, '--seed');
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
  if (!Number.isInteger(options.seed) || options.seed < 0) {
    throw new Error('--seed must be a non-negative integer.');
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

function roundScaleValue(value: number, integer: boolean | undefined): number {
  if (integer) {
    return Math.max(1, Math.round(value));
  }
  return round2(value);
}

function cloneHeuristicConfig(config: HeuristicConfig): HeuristicConfig {
  return JSON.parse(JSON.stringify(config)) as HeuristicConfig;
}

function cloneLookaheadConfig(config: LookaheadConfig): LookaheadConfig {
  return JSON.parse(JSON.stringify(config)) as LookaheadConfig;
}

function getPathValue(config: unknown, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = config;
  for (const segment of segments) {
    if (!current || typeof current !== 'object') {
      throw new Error(`Invalid path: ${path}`);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function setPathValue(config: unknown, path: string, value: unknown): void {
  const segments = path.split('.');
  let current: unknown = config;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (!current || typeof current !== 'object') {
      throw new Error(`Invalid path: ${path}`);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  const leaf = segments[segments.length - 1];
  if (!current || typeof current !== 'object') {
    throw new Error(`Invalid path: ${path}`);
  }
  (current as Record<string, unknown>)[leaf] = value;
}

function getApplicablePath(
  dimension: DimensionDef,
  botType: BotConfigFile['botType'],
): string | undefined {
  return botType === 'lookahead'
    ? dimension.lookaheadPath
    : dimension.heuristicPath;
}

function getOrderedDimensionIds(botType: BotConfigFile['botType']): string[] {
  if (botType !== 'lookahead') {
    return DIMENSIONS.map((dimension) => dimension.id);
  }

  const nativeLookahead: string[] = [];
  const heuristicFallback: string[] = [];
  for (const dimension of DIMENSIONS) {
    const path = dimension.lookaheadPath;
    if (!path) {
      continue;
    }
    if (path.startsWith('heuristicFallbackConfig.')) {
      heuristicFallback.push(dimension.id);
    } else {
      nativeLookahead.push(dimension.id);
    }
  }
  return [...nativeLookahead, ...heuristicFallback];
}

function createSeededRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function applyScale(
  config: unknown,
  path: string,
  factor: number,
  min: number,
  max: number,
  integer: boolean | undefined,
): void {
  const current = getPathValue(config, path);
  if (typeof current !== 'number') {
    throw new Error(`Scale path is not numeric: ${path}`);
  }
  const next = clamp(current * factor, min, max);
  setPathValue(config, path, roundScaleValue(next, integer));
}

function applyFlip(config: unknown, path: string): void {
  const current = getPathValue(config, path);
  if (typeof current !== 'boolean') {
    throw new Error(`Flip path is not boolean: ${path}`);
  }
  setPathValue(config, path, !current);
}

function applyDimension(
  config: HeuristicConfig | LookaheadConfig,
  botType: BotConfigFile['botType'],
  dimensionId: string,
): void {
  const dimension = DIMENSIONS.find((entry) => entry.id === dimensionId);
  if (!dimension) {
    throw new Error(`Unknown dimension id: ${dimensionId}`);
  }
  const path = getApplicablePath(dimension, botType);
  if (!path) {
    return;
  }
  if (dimension.type === 'flip') {
    applyFlip(config, path);
    return;
  }
  applyScale(
    config,
    path,
    dimension.factor,
    dimension.min,
    dimension.max,
    dimension.integer,
  );
}

function buildConfigFromDimensions(
  dimensionIds: string[],
  botType: BotConfigFile['botType'],
): BotConfigFile['config'] {
  if (botType === 'lookahead') {
    const lookaheadConfig = cloneLookaheadConfig(LOOKAHEAD_STANDARD_CONFIG);
    for (const dimensionId of dimensionIds) {
      applyDimension(lookaheadConfig, botType, dimensionId);
    }
    return lookaheadConfig;
  }
  const heuristicConfig = cloneHeuristicConfig(HEURISTIC_STANDARD_CONFIG);
  for (const dimensionId of dimensionIds) {
    applyDimension(heuristicConfig, botType, dimensionId);
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
  const orderedDimensionIds = getOrderedDimensionIds(options.botType);
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
      const available = orderedDimensionIds.filter(
        (id) => !parent.dimensions.includes(id),
      );
      const expansionRng = createSeededRng(
        options.seed + iteration * 10007 + parent.id * 7919,
      );
      const randomizedAvailable = shuffleWithRng(available, expansionRng);
      for (const addId of randomizedAvailable.slice(0, options.childrenPerParent)) {
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

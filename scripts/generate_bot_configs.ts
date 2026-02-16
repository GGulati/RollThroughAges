import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { HEURISTIC_STANDARD_CONFIG, HeuristicConfig } from '../src/game/bot/index.ts';
import { parseNumber } from './helpers.ts';

type CliOptions = {
  outDir: string;
  dimensions: string[];
  includeBaseline: boolean;
  overwrite: boolean;
};

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
  | 'buildWeights.monumentDeferredCompletionValueScale'
  | 'buildWeights.monumentDeferredMaxTurnsToComplete';

type BooleanPath =
  | 'preferExchangeBeforeDevelopment'
  | 'foodPolicyWeights.forceRerollOnFoodShortage';

type DimensionDef =
  | {
      id: string;
      label: string;
      type: 'scale';
      path: NumericPath;
      factor: number;
      min: number;
      max: number;
    }
  | {
      id: string;
      label: string;
      type: 'flip';
      path: BooleanPath;
    };

const DIMENSIONS: DimensionDef[] = [
  {
    id: 'foodAggressive',
    label: 'Higher food weight',
    type: 'scale',
    path: 'productionWeights.food',
    factor: 1.6,
    min: 0,
    max: 30,
  },
  {
    id: 'goodsAggressive',
    label: 'Higher goods weight',
    type: 'scale',
    path: 'productionWeights.goods',
    factor: 1.4,
    min: 0,
    max: 40,
  },
  {
    id: 'workerAggressive',
    label: 'Higher worker weight',
    type: 'scale',
    path: 'productionWeights.workers',
    factor: 1.5,
    min: 0,
    max: 30,
  },
  {
    id: 'skullAverse',
    label: 'More skull aversion',
    type: 'scale',
    path: 'productionWeights.skulls',
    factor: 1.35,
    min: -40,
    max: -0.1,
  },
  {
    id: 'starvationAverse',
    label: 'Higher starvation penalty',
    type: 'scale',
    path: 'foodPolicyWeights.starvationPenaltyPerUnit',
    factor: 1.6,
    min: 0,
    max: 200,
  },
  {
    id: 'monumentBias',
    label: 'Higher monument point focus',
    type: 'scale',
    path: 'buildWeights.monumentPoints',
    factor: 1.5,
    min: 0,
    max: 30,
  },
  {
    id: 'cityDieBias',
    label: 'Higher city future die value',
    type: 'scale',
    path: 'buildWeights.cityExtraDieFutureValue',
    factor: 1.8,
    min: 0,
    max: 10,
  },
  {
    id: 'cityDeferredBuildBias',
    label: 'Higher city deferred completion value',
    type: 'scale',
    path: 'buildWeights.cityDeferredCompletionValueScale',
    factor: 1.6,
    min: 0,
    max: 3,
  },
  {
    id: 'devPointsBias',
    label: 'Higher development points bias',
    type: 'scale',
    path: 'developmentWeights.points',
    factor: 1.7,
    min: 0,
    max: 20,
  },
  {
    id: 'exchangeFirst',
    label: 'Prefer exchange before development',
    type: 'flip',
    path: 'preferExchangeBeforeDevelopment',
  },
  {
    id: 'monumentDeferredBias',
    label: 'Higher monument deferred completion value',
    type: 'scale',
    path: 'buildWeights.monumentDeferredCompletionValueScale',
    factor: 1.5,
    min: 0,
    max: 3,
  },
  {
    id: 'monumentLongHorizon',
    label: 'Allow longer monument deferred horizon',
    type: 'scale',
    path: 'buildWeights.monumentDeferredMaxTurnsToComplete',
    factor: 1.5,
    min: 0.5,
    max: 6,
  },
  {
    id: 'forceFoodReroll',
    label: 'Force reroll on food shortage',
    type: 'flip',
    path: 'foodPolicyWeights.forceRerollOnFoodShortage',
  },
];

const DEFAULT_DIMENSIONS = DIMENSIONS.map((dimension) => dimension.id);

function printUsage(): void {
  console.log('Usage: npx tsx scripts/generate_bot_configs.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --out-dir <dir>          Output directory (default: output/bot-candidates)');
  console.log('  --dimensions <ids>       Comma-separated dimension ids to power-set');
  console.log(`                           Default: ${DEFAULT_DIMENSIONS.join(',')}`);
  console.log('  --include-baseline       Also emit baseline config as cfg-000-baseline.json');
  console.log('  --overwrite              Replace existing files');
  console.log('  --help                   Show help');
  console.log('');
  console.log('Available dimensions:');
  DIMENSIONS.forEach((dimension) => {
    console.log(`  - ${dimension.id}: ${dimension.label}`);
  });
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    outDir: 'output/bot-candidates',
    dimensions: [...DEFAULT_DIMENSIONS],
    includeBaseline: true,
    overwrite: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--overwrite') {
      options.overwrite = true;
      continue;
    }
    if (arg === '--include-baseline') {
      options.includeBaseline = true;
      continue;
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
      case '--dimensions':
        options.dimensions = next
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0);
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.dimensions.length === 0) {
    throw new Error('--dimensions must include at least one dimension id.');
  }
  const dimensionSet = new Set(DIMENSIONS.map((dimension) => dimension.id));
  const unknown = options.dimensions.filter((id) => !dimensionSet.has(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown dimensions: ${unknown.join(', ')}`);
  }
  if (options.dimensions.length > 20) {
    throw new Error('Too many dimensions requested; would generate too many configs.');
  }

  return options;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function setNumeric(config: HeuristicConfig, path: NumericPath, value: number): void {
  const rounded = round2(value);
  switch (path) {
    case 'productionWeights.food':
      config.productionWeights.food = rounded;
      break;
    case 'productionWeights.goods':
      config.productionWeights.goods = rounded;
      break;
    case 'productionWeights.workers':
      config.productionWeights.workers = rounded;
      break;
    case 'productionWeights.skulls':
      config.productionWeights.skulls = rounded;
      break;
    case 'developmentWeights.points':
      config.developmentWeights.points = rounded;
      break;
    case 'foodPolicyWeights.starvationPenaltyPerUnit':
      config.foodPolicyWeights.starvationPenaltyPerUnit = rounded;
      break;
    case 'foodPolicyWeights.foodDeficitPriorityPerUnit':
      config.foodPolicyWeights.foodDeficitPriorityPerUnit = rounded;
      break;
    case 'buildWeights.cityExtraDieFutureValue':
      config.buildWeights.cityExtraDieFutureValue = rounded;
      break;
    case 'buildWeights.cityDeferredCompletionValueScale':
      config.buildWeights.cityDeferredCompletionValueScale = rounded;
      break;
    case 'buildWeights.monumentPoints':
      config.buildWeights.monumentPoints = rounded;
      break;
    case 'buildWeights.monumentPointEfficiency':
      config.buildWeights.monumentPointEfficiency = rounded;
      break;
    case 'buildWeights.monumentDeferredCompletionValueScale':
      config.buildWeights.monumentDeferredCompletionValueScale = rounded;
      break;
    case 'buildWeights.monumentDeferredMaxTurnsToComplete':
      config.buildWeights.monumentDeferredMaxTurnsToComplete = rounded;
      break;
  }
}

function getNumeric(config: HeuristicConfig, path: NumericPath): number {
  switch (path) {
    case 'productionWeights.food':
      return config.productionWeights.food;
    case 'productionWeights.goods':
      return config.productionWeights.goods;
    case 'productionWeights.workers':
      return config.productionWeights.workers;
    case 'productionWeights.skulls':
      return config.productionWeights.skulls;
    case 'developmentWeights.points':
      return config.developmentWeights.points;
    case 'foodPolicyWeights.starvationPenaltyPerUnit':
      return config.foodPolicyWeights.starvationPenaltyPerUnit;
    case 'foodPolicyWeights.foodDeficitPriorityPerUnit':
      return config.foodPolicyWeights.foodDeficitPriorityPerUnit;
    case 'buildWeights.cityExtraDieFutureValue':
      return config.buildWeights.cityExtraDieFutureValue;
    case 'buildWeights.cityDeferredCompletionValueScale':
      return config.buildWeights.cityDeferredCompletionValueScale;
    case 'buildWeights.monumentPoints':
      return config.buildWeights.monumentPoints;
    case 'buildWeights.monumentPointEfficiency':
      return config.buildWeights.monumentPointEfficiency;
    case 'buildWeights.monumentDeferredCompletionValueScale':
      return config.buildWeights.monumentDeferredCompletionValueScale;
    case 'buildWeights.monumentDeferredMaxTurnsToComplete':
      return config.buildWeights.monumentDeferredMaxTurnsToComplete;
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

function cloneConfig(config: HeuristicConfig): HeuristicConfig {
  return JSON.parse(JSON.stringify(config)) as HeuristicConfig;
}

function applyDimension(config: HeuristicConfig, dimension: DimensionDef): void {
  if (dimension.type === 'flip') {
    flipBoolean(config, dimension.path);
    return;
  }

  const current = getNumeric(config, dimension.path);
  const next = clamp(current * dimension.factor, dimension.min, dimension.max);
  setNumeric(config, dimension.path, next);
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const outDir = resolve(options.outDir);
  mkdirSync(outDir, { recursive: true });

  const dimensions = options.dimensions.map((id) => {
    const dimension = DIMENSIONS.find((entry) => entry.id === id);
    if (!dimension) {
      throw new Error(`Dimension not found: ${id}`);
    }
    return dimension;
  });

  const totalMasks = 1 << dimensions.length;
  let written = 0;

  if (options.includeBaseline) {
    const baselinePath = join(outDir, 'cfg-000-baseline.json');
    writeFileSync(
      baselinePath,
      JSON.stringify(HEURISTIC_STANDARD_CONFIG, null, 2),
      { encoding: 'utf8', flag: options.overwrite ? 'w' : 'wx' },
    );
    written += 1;
  }

  for (let mask = 1; mask < totalMasks; mask += 1) {
    const config = cloneConfig(HEURISTIC_STANDARD_CONFIG);
    const activeDimensions: string[] = [];

    for (let i = 0; i < dimensions.length; i += 1) {
      if ((mask & (1 << i)) === 0) {
        continue;
      }
      const dimension = dimensions[i];
      applyDimension(config, dimension);
      activeDimensions.push(dimension.id);
    }

    const index = options.includeBaseline ? mask : mask - 1;
    const fileName =
      `cfg-${String(index).padStart(3, '0')}-` +
      `${activeDimensions.join('__')}.json`;
    const path = join(outDir, fileName);
    writeFileSync(path, JSON.stringify(config, null, 2), {
      encoding: 'utf8',
      flag: options.overwrite ? 'w' : 'wx',
    });
    written += 1;
  }

  console.log(`Generated ${written} configs in ${outDir}`);
  console.log(`Dimensions (${dimensions.length}): ${dimensions.map((d) => d.id).join(', ')}`);
  console.log(`Power-set size (non-empty subsets): ${totalMasks - 1}`);
}

main();

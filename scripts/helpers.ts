import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createHeuristicBot,
  createLookaheadBot,
  HEURISTIC_STANDARD_CONFIG,
  HeuristicConfig,
  LOOKAHEAD_STANDARD_CONFIG,
  LookaheadConfig,
  BotStrategy,
} from '../src/game/bot/index.ts';

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export function parseNumber(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${name}: ${value}`);
  }
  return parsed;
}

export function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function formatNum(value: number): string {
  return value.toFixed(2);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function mergeConfig(
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
      override.preferExchangeBeforeDevelopment ?? base.preferExchangeBeforeDevelopment,
  };
}

export type BotConfigFile = {
  id: number;
  name: string;
  botType: BotType;
  config: DeepPartial<HeuristicConfig> | DeepPartial<LookaheadConfig>;
  dimensions?: string[];
};

export type BotType = 'heuristic' | 'lookahead';

export type LoadedBotConfig = {
  id: string;
  name: string;
  source: string;
  botType: BotType;
  config: HeuristicConfig | LookaheadConfig;
  dimensions?: string[];
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function isBotConfigFile(value: unknown): value is BotConfigFile {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    (value.botType === 'heuristic' || value.botType === 'lookahead') &&
    isRecord(value.config)
  );
}

function normalizeBotType(value: unknown): BotType {
  if (value === 'lookahead') {
    return 'lookahead';
  }
  return 'heuristic';
}

export function parseConfigFile(
  json: string,
): {
  metadata: Pick<BotConfigFile, 'id' | 'name' | 'dimensions' | 'botType'> | null;
  config: HeuristicConfig | LookaheadConfig;
} {
  const parsed = JSON.parse(json) as unknown;
  if (!isBotConfigFile(parsed)) {
    throw new Error(
      'Invalid bot config file format: expected { id, name, botType, config }.',
    );
  }

  return {
    metadata: {
      id: parsed.id,
      name: parsed.name,
      dimensions: parsed.dimensions,
      botType: normalizeBotType(parsed.botType),
    },
    config:
      normalizeBotType(parsed.botType) === 'lookahead'
        ? {
            ...LOOKAHEAD_STANDARD_CONFIG,
            ...(parsed.config as DeepPartial<LookaheadConfig>),
            heuristicFallbackConfig: mergeConfig(
              LOOKAHEAD_STANDARD_CONFIG.heuristicFallbackConfig,
              (parsed.config as DeepPartial<LookaheadConfig>).heuristicFallbackConfig ??
                {},
            ),
          }
        : mergeConfig(
            HEURISTIC_STANDARD_CONFIG,
            parsed.config as DeepPartial<HeuristicConfig>,
          ),
  };
}

export function loadConfig(path?: string): HeuristicConfig | LookaheadConfig {
  if (!path) {
    return HEURISTIC_STANDARD_CONFIG;
  }
  const resolved = resolve(path);
  const raw = readFileSync(resolved, 'utf8');
  const parsed = parseConfigFile(raw);
  return parsed.config;
}

export function loadConfigEntry(path: string): LoadedBotConfig {
  const source = resolve(path);
  const raw = readFileSync(source, 'utf8');
  const parsed = parseConfigFile(raw);
  return {
    id: String(parsed.metadata!.id),
    name: parsed.metadata!.name,
    source,
    botType: normalizeBotType(parsed.metadata!.botType),
    config: parsed.config,
    dimensions: parsed.metadata!.dimensions,
  };
}

export function createLookaheadConfigFromHeuristic(
  heuristicConfig: HeuristicConfig,
): LookaheadConfig {
  return {
    ...LOOKAHEAD_STANDARD_CONFIG,
    heuristicFallbackConfig: heuristicConfig,
  };
}

export function createBotStrategy(
  candidate: Pick<LoadedBotConfig, 'botType' | 'config'>,
  id: string,
): BotStrategy {
  if (candidate.botType === 'lookahead') {
    if ('heuristicFallbackConfig' in candidate.config) {
      return createLookaheadBot(candidate.config, id);
    }
    return createLookaheadBot(createLookaheadConfigFromHeuristic(candidate.config), id);
  }
  if ('heuristicFallbackConfig' in candidate.config) {
    return createHeuristicBot(candidate.config.heuristicFallbackConfig, id);
  }
  return createHeuristicBot(candidate.config, id);
}

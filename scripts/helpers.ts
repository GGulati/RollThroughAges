import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import {
  HEURISTIC_STANDARD_CONFIG,
  HeuristicConfig,
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
  config: DeepPartial<HeuristicConfig>;
  dimensions?: string[];
};

export type LoadedBotConfig = {
  id: string;
  name: string;
  source: string;
  config: HeuristicConfig;
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
    isRecord(value.config)
  );
}

export function parseConfigFile(
  json: string,
): { metadata: Pick<BotConfigFile, 'id' | 'name' | 'dimensions'> | null; config: HeuristicConfig } {
  const parsed = JSON.parse(json) as unknown;
  if (isBotConfigFile(parsed)) {
    return {
      metadata: {
        id: parsed.id,
        name: parsed.name,
        dimensions: parsed.dimensions,
      },
      config: mergeConfig(HEURISTIC_STANDARD_CONFIG, parsed.config),
    };
  }

  return {
    metadata: null,
    config: mergeConfig(HEURISTIC_STANDARD_CONFIG, parsed as DeepPartial<HeuristicConfig>),
  };
}

export function loadConfig(path?: string): HeuristicConfig {
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
  const filenameId = basename(path).replace(/\.json$/i, '');

  if (parsed.metadata) {
    return {
      id: String(parsed.metadata.id),
      name: parsed.metadata.name,
      source,
      config: parsed.config,
      dimensions: parsed.metadata.dimensions,
    };
  }

  return {
    id: filenameId,
    name: filenameId,
    source,
    config: parsed.config,
  };
}

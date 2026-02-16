import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

export function loadConfig(path?: string): HeuristicConfig {
  if (!path) {
    return HEURISTIC_STANDARD_CONFIG;
  }
  const resolved = resolve(path);
  const raw = readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(raw) as DeepPartial<HeuristicConfig>;
  return mergeConfig(HEURISTIC_STANDARD_CONFIG, parsed);
}

import { HeuristicConfig, HEURISTIC_STANDARD_CONFIG } from '../heuristic';

export type LookaheadConfig = {
  depth: number;
  maxEnumeratedRollDice: number;
  maxChanceOutcomesPerAction: number;
  maxActionsPerNode: number;
  maxEvaluations: number;
  heuristicFallbackConfig: HeuristicConfig;
};

export const LOOKAHEAD_STANDARD_CONFIG: LookaheadConfig = {
  depth: 2,
  maxEnumeratedRollDice: 4,
  maxChanceOutcomesPerAction: 216,
  maxActionsPerNode: 10,
  maxEvaluations: 1200,
  heuristicFallbackConfig: HEURISTIC_STANDARD_CONFIG,
};

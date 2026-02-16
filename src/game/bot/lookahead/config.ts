import { HeuristicConfig } from '../heuristic';

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
  heuristicFallbackConfig: {
    productionWeights: {
      workers: 10.13,
      coins: 1,
      food: 5.12,
      goods: 11.76,
      skulls: -19.68,
    },
    developmentWeights: {
      points: 1,
      cost: 0.01,
    },
    foodPolicyWeights: {
      foodDeficitPriorityPerUnit: 3,
      starvationPenaltyPerUnit: 51.2,
      forceRerollOnFoodShortage: true,
    },
    buildWeights: {
      cityProgress: 2,
      cityWorkersUsed: 0.1,
      cityExtraDieFutureValue: 0.27,
      cityDeferredCompletionValueScale: 0.51,
      monumentPoints: 4.28,
      monumentPointEfficiency: 3,
      monumentProgress: 2.4,
      monumentWorkersUsed: 0.18,
      monumentSpecialEffect: 1.7,
      monumentDeferredCompletionValueScale: 1.13,
      monumentDeferredMaxTurnsToComplete: 2,
    },
    preferExchangeBeforeDevelopment: true,
  },
};

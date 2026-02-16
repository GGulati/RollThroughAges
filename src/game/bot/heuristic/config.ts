export type HeuristicProductionWeights = {
  workers: number;
  coins: number;
  food: number;
  goods: number;
  skulls: number;
};

export type HeuristicDevelopmentWeights = {
  points: number;
  cost: number;
};

export type HeuristicFoodPolicyWeights = {
  foodDeficitPriorityPerUnit: number;
  starvationPenaltyPerUnit: number;
  forceRerollOnFoodShortage: boolean;
};

export type HeuristicBuildWeights = {
  cityProgress: number;
  cityWorkersUsed: number;
  cityExtraDieFutureValue: number;
  cityDeferredCompletionValueScale: number;
  monumentPoints: number;
  monumentPointEfficiency: number;
  monumentProgress: number;
  monumentWorkersUsed: number;
  monumentSpecialEffect: number;
  monumentDeferredCompletionValueScale: number;
  monumentDeferredMaxTurnsToComplete: number;
};

export type HeuristicConfig = {
  productionWeights: HeuristicProductionWeights;
  developmentWeights: HeuristicDevelopmentWeights;
  foodPolicyWeights: HeuristicFoodPolicyWeights;
  buildWeights: HeuristicBuildWeights;
  preferExchangeBeforeDevelopment: boolean;
};

export const HEURISTIC_STANDARD_CONFIG: HeuristicConfig = {
  productionWeights: {
    workers: 6.75,
    coins: 1,
    food: 5.12,
    goods: 8.4,
    skulls: -14.58,
  },
  developmentWeights: {
    points: 1,
    cost: 0.01,
  },
  foodPolicyWeights: {
    foodDeficitPriorityPerUnit: 3,
    starvationPenaltyPerUnit: 32,
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
};

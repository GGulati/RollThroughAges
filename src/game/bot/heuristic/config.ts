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
  monumentPoints: number;
  monumentPointEfficiency: number;
  monumentProgress: number;
  monumentWorkersUsed: number;
  monumentSpecialEffect: number;
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
    workers: 3,
    coins: 1,
    food: 3.2,
    goods: 6,
    skulls: -8,
  },
  developmentWeights: {
    points: 1,
    cost: 0.01,
  },
  foodPolicyWeights: {
    foodDeficitPriorityPerUnit: 3,
    starvationPenaltyPerUnit: 20,
    forceRerollOnFoodShortage: true,
  },
  buildWeights: {
    cityProgress: 2,
    cityWorkersUsed: 0.1,
    cityExtraDieFutureValue: 0.15,
    monumentPoints: 2.85,
    monumentPointEfficiency: 3,
    monumentProgress: 1.5,
    monumentWorkersUsed: 0.1,
    monumentSpecialEffect: 1,
  },
  preferExchangeBeforeDevelopment: false,
};

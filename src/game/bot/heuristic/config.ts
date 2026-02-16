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

export type HeuristicBuildTarget = 'city' | 'monument';

export type HeuristicConfig = {
  productionWeights: HeuristicProductionWeights;
  developmentWeights: HeuristicDevelopmentWeights;
  buildPriority: HeuristicBuildTarget[];
  preferExchangeBeforeDevelopment: boolean;
};

export const HEURISTIC_STANDARD_CONFIG: HeuristicConfig = {
  productionWeights: {
    workers: 2,
    coins: 1,
    food: 2,
    goods: 6,
    skulls: -8,
  },
  developmentWeights: {
    points: 1,
    cost: 0.01,
  },
  buildPriority: ['city', 'monument'],
  preferExchangeBeforeDevelopment: false,
};

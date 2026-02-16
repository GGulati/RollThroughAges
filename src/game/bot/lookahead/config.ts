import { HEURISTIC_STANDARD_CONFIG, HeuristicConfig } from '../heuristic';

export type LookaheadConfig = {
  depth: number;
  maxEnumeratedRollDice: number;
  maxActionsPerNode: number;
  maxEvaluations: number;
  utilityWeights: {
    scoreTotal: number;
    completedCities: number;
    cityProgress: number;
    monumentProgress: number;
    goodsValue: number;
    food: number;
    turnResourcePosition: number;
    foodRiskPenalty: number;
  };
  heuristicFallbackConfig: HeuristicConfig;
};

export const LOOKAHEAD_STANDARD_CONFIG: LookaheadConfig = {
  depth: 2,
  maxEnumeratedRollDice: 4,
  maxActionsPerNode: 10,
  maxEvaluations: 1200,
  utilityWeights: {
    scoreTotal: 100,
    completedCities: 12,
    cityProgress: 2.5,
    monumentProgress: 3,
    goodsValue: 0.6,
    food: 0.8,
    turnResourcePosition: 1,
    foodRiskPenalty: 1,
  },
  heuristicFallbackConfig: HEURISTIC_STANDARD_CONFIG,
};

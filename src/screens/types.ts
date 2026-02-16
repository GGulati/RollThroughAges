import {
  BotCoreInstrumentation,
  HeadlessBotInstrumentation,
  HeuristicConfig,
} from '@/game/bot';
import { PlayerEndStateSummary } from '@/game/reporting';

export type ControllerOption =
  | 'human'
  | 'heuristicStandard'
  | 'heuristicCustom'
  | 'lookaheadStandard'
  | 'lookaheadCustom';
export type BotSpeedOption = 'normal' | 'fast' | 'veryFast';
export type BotProfile =
  | 'heuristicStandard'
  | 'heuristicCustom'
  | 'lookaheadStandard'
  | 'lookaheadCustom';

export type HeadlessSimulationSummary = {
  completed: boolean;
  turnsPlayed: number;
  winners: string[];
  scores: PlayerEndStateSummary[];
  stallReason: string | null;
  actionLog: string[];
  instrumentation: {
    core: BotCoreInstrumentation;
    headless: HeadlessBotInstrumentation;
  };
};

export type HeuristicUpdateHandlers = {
  updateProductionWeight: (
    key: keyof HeuristicConfig['productionWeights'],
    value: string,
  ) => void;
  updateDevelopmentWeight: (
    key: keyof HeuristicConfig['developmentWeights'],
    value: string,
  ) => void;
  updateFoodPolicyWeight: (
    key: keyof HeuristicConfig['foodPolicyWeights'],
    value: string | boolean,
  ) => void;
  updateBuildWeight: (
    key: keyof HeuristicConfig['buildWeights'],
    value: string,
  ) => void;
};

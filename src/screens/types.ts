import {
  HeuristicConfig,
} from '@/game/bot';
import { BotCoreInstrumentation, HeadlessBotEvaluationStanding, HeadlessBotInstrumentation } from '@/game/automation';
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

export type BotEvaluationSummary = {
  createdAtLabel: string;
  playerCount: number;
  rounds: number;
  rotationsPerRound: number;
  totalGames: number;
  incompleteGames: number;
  standings: HeadlessBotEvaluationStanding[];
  stallReasons: Record<string, number>;
  instrumentation: {
    headless: HeadlessBotInstrumentation;
    byParticipantKey: Record<
      string,
      {
        label: string;
        strategyId: string;
        metrics: Record<string, number>;
      }
    >;
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

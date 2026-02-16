import { HeuristicConfig } from '@/game/bot';
import { PlayerEndStateSummary } from '@/game/reporting';

export type ControllerOption = 'human' | 'heuristicStandard' | 'heuristicCustom';
export type BotSpeedOption = 'normal' | 'fast' | 'veryFast';
export type BotProfile = 'heuristicStandard' | 'heuristicCustom';

export type HeadlessSimulationSummary = {
  completed: boolean;
  turnsPlayed: number;
  winners: string[];
  scores: PlayerEndStateSummary[];
  stallReason: string | null;
  actionLog: string[];
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
  updateBuildPriority: (first: 'city' | 'monument') => void;
};

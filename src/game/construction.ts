export type ConstructionRequirements = {
  name: string;
  workerCost: number;
};

export type ConstructionProgress = {
  workersCommitted: number;
  completed: boolean;
};

export interface MonumentDefinition {
  id: string;
  requirements: ConstructionRequirements;
  firstPoints: number;
  laterPoints: number;
  minPlayerCount?: number;
  // TODO: add invasion immunity or other special effects
}

export type DevelopmentDefinition = {
  id: string;
  name: string;
  cost: number;
  points: number;
  effect: string;
  // TODO: add mechanical effects
};


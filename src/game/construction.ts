export type ConstructionRequirements = {
  name: string;
  workerCost: number;
};

export type ConstructionProgress = {
  workersCommitted: number;
  completed: boolean;
};

// Unified special effects - discriminated union for type safety
// Used by both Monuments and Developments
// String parameters reference IDs/names from their respective definitions
export type SpecialEffect =
  // Re-roll dice during the dice phase
  | { type: 'diceReroll'; count: number }
  // Immunity to a specific disaster (references DisasterDefinition.id)
  | { type: 'disasterImmunity'; disasterId: string }
  // Bonus production for a resource (references GoodsType.name or base resource like 'food', 'workers')
  | { type: 'productionBonus'; resource: string; bonus: number }
  // Modified coin value for money dice
  | { type: 'coinageValue'; amount: number }
  // Remove the goods storage limit
  | { type: 'noGoodsLimit' }
  // Redirect revolt disaster to opponents
  | { type: 'revoltAffectsOpponents' }
  // Exchange one resource for another at a given rate
  | { type: 'exchange'; from: string; to: string; rate: number }
  // Bonus points per completed entity at end of game
  | { type: 'bonusPointsPer'; entity: string; points: number };

export interface MonumentDefinition {
  id: string;
  requirements: ConstructionRequirements;
  firstPoints: number;
  laterPoints: number;
  minPlayerCount?: number;
  specialEffect?: SpecialEffect;
}

export type DevelopmentDefinition = {
  id: string;
  name: string;
  cost: number;
  points: number;
  effectDescription: string;
  specialEffect: SpecialEffect;
};


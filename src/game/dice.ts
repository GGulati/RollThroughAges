export type ResourceProduction = {
  goods: number;
  food: number;
  workers: number;
  coins: number;
  skulls: number;
};

export type DiceFaceDefinition = {
  label: string;
  /**
   * If more than one production entry exists, the player must choose which one to apply.
   */
  production: ResourceProduction[];
};

export type Die = DiceFaceDefinition[];

export type DiceLockDecision = 'unlocked' | 'kept' | 'skull';

export interface DieState {
  diceFaceIndex: number;
  productionIndex: number;
  lockDecision: DiceLockDecision;
}


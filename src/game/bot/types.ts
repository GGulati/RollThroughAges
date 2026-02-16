import { GameState } from '../game';

export type BotAction =
  | { type: 'rollDice' }
  | { type: 'rerollSingleDie'; dieIndex: number }
  | { type: 'keepDie'; dieIndex: number }
  | { type: 'selectProduction'; dieIndex: number; productionIndex: number }
  | { type: 'resolveProduction' }
  | { type: 'buildCity'; cityIndex: number }
  | { type: 'buildMonument'; monumentId: string }
  | { type: 'buyDevelopment'; developmentId: string; goodsTypeNames: string[] }
  | { type: 'skipDevelopment' }
  | { type: 'applyExchange'; from: string; to: string; amount: number }
  | { type: 'discardGoods'; goodsToKeepByType: Record<string, number> }
  | { type: 'endTurn' };

export type BotContext = {
  game: GameState;
  instrumentation?: {
    strategyId: string;
    addMetric: (metric: string, value?: number) => void;
  };
};

export type BotStrategy = {
  id: string;
  chooseAction: (context: BotContext) => BotAction | null;
};

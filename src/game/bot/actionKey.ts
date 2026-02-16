import { BotAction } from './types';

export function botActionKey(action: BotAction): string {
  switch (action.type) {
    case 'rollDice':
    case 'resolveProduction':
    case 'skipDevelopment':
    case 'endTurn':
      return action.type;
    case 'rerollSingleDie':
    case 'keepDie':
      return `${action.type}:${action.dieIndex}`;
    case 'buildCity':
      return `${action.type}:${action.cityIndex}`;
    case 'buildMonument':
      return `${action.type}:${action.monumentId}`;
    case 'selectProduction':
      return `${action.type}:${action.dieIndex}:${action.productionIndex}`;
    case 'buyDevelopment':
      return `${action.type}:${action.developmentId}:${action.goodsTypeNames.join(',')}`;
    case 'applyExchange':
      return `${action.type}:${action.from}:${action.to}:${action.amount}`;
    case 'discardGoods':
      return `${action.type}:${JSON.stringify(action.goodsToKeepByType)}`;
    default:
      return JSON.stringify(action);
  }
}

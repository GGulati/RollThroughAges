import { GoodsType } from './goods';
import { GoodsTrack } from './goods';
import { DiceFaceDefinition } from './dice';
import { MonumentDefinition } from './construction';
import { ConstructionProgress } from './construction';
import { ConstructionRequirements } from './construction';
import { GameSettings } from './game';
import { PlayerConfig } from './game';
import { PlayerId } from './game';
import { PlayerState } from './game';
import { DevelopmentDefinition } from './construction';
import { DisasterDefinition } from './disaster';

export const STARTING_FOOD = 3;
export const STARTING_CITIES = 3;
export const MAX_CITIES = 7;
export const MAX_FOOD = 15;
export const MAX_GOODS = 6;
export const MAX_DICE_ROLLS = 3;

export const GOODS_TYPES: GoodsType[] = [
  { name: 'Wood', values: [1, 3, 6, 10, 15, 21, 28, 36] },
  { name: 'Stone', values: [2, 6, 12, 20, 30, 42, 56] },
  { name: 'Ceramic', values: [3, 9, 18, 30, 45, 63] },
  { name: 'Fabric', values: [4, 12, 24, 40, 60] },
  { name: 'Spearhead', values: [5, 15, 30, 50] },
];

export const EMPTY_GOODS_TRACK: GoodsTrack = new Map(
  GOODS_TYPES.map((goodsType) => [goodsType, 0])
);

export const DICE_FACES: DiceFaceDefinition[] = [
  {
    label: '1 Good',
    production: [{ goods: 1, food: 0, workers: 0, coins: 0, skulls: 0 }],
  },
  {
    label: '2 Goods + Skull',
    production: [{ goods: 2, food: 0, workers: 0, coins: 0, skulls: 1 }],
  },
  {
    label: '2 Food OR 2 Workers',
    production: [{ food: 2, workers: 0, coins: 0, skulls: 0, goods: 0 }, { workers: 2, food: 0, coins: 0, skulls: 0, goods: 0 }],
  },
  {
    label: '3 Workers',
    production: [{ workers: 3, food: 0, coins: 0, skulls: 0, goods: 0 }],
  },
  {
    label: '7 Coins',
    production: [{ coins: 7, food: 0, workers: 0, skulls: 0, goods: 0 }],
  },
  {
    label: '3 Food',
    production: [{ food: 3, workers: 0, coins: 0, skulls: 0, goods: 0 }],
  },
];

export const MONUMENTS: MonumentDefinition[] = [
  {
    id: 'stepPyramid',
    requirements: { name: 'Step Pyramid', workerCost: 3 },
    firstPoints: 1,
    laterPoints: 0,
  },
  {
    id: 'stoneCircle',
    requirements: { name: 'Stone Circle', workerCost: 5 },
    firstPoints: 2,
    laterPoints: 1,
  },
  {
    id: 'temple',
    requirements: { name: 'Temple', workerCost: 7 },
    firstPoints: 4,
    laterPoints: 3,
    minPlayerCount: 2,
  },
  {
    id: 'obelisk',
    requirements: { name: 'Obelisk', workerCost: 9 },
    firstPoints: 6,
    laterPoints: 4,
  },
  {
    id: 'hangingGardens',
    requirements: { name: 'Hanging Gardens', workerCost: 11 },
    firstPoints: 8,
    laterPoints: 5,
    minPlayerCount: 4,
  },
  {
    id: 'greatWall',
    requirements: { name: 'Great Wall', workerCost: 13 },
    firstPoints: 10,
    laterPoints: 6,
  },
  {
    id: 'greatPyramid',
    requirements: { name: 'Great Pyramid', workerCost: 15 },
    firstPoints: 12,
    laterPoints: 8,
    minPlayerCount: 3,
  },
];

export const MONUMENT_IDS = MONUMENTS.map((monument) => monument.id);

export const createEmptyMonumentProgress = (
  monuments: MonumentDefinition[] = MONUMENTS
): Record<string, ConstructionProgress> =>
  monuments.reduce(
    (acc, monument) => {
      acc[monument.id] = { workersCommitted: 0, completed: false };
      return acc;
    },
    {} as Record<string, ConstructionProgress>,
  );

export const createEmptyGoodsTrack = (goodsTypes: GoodsType[] = GOODS_TYPES): GoodsTrack =>
  new Map(goodsTypes.map((goodsType) => [goodsType, 0]));

export const CITY_DEFINITIONS: ConstructionRequirements[] = [
    {
        name: 'City 4',
        workerCost: 3,
    },
    {
        name: 'City 5',
        workerCost: 4,
    },
    {
        name: 'City 6',
        workerCost: 5,
    },
    {
        name: 'City 7',
        workerCost: 6,
    },
];

export const CreatePlayerState = (id: PlayerId, settings: GameSettings): PlayerState => {
  const startingCities = settings.startingCities;
  const maxCities = settings.maxCities;
  const startingFood = settings.startingFood;
  const goodsTypes = settings.goodsTypes;
  const monuments = settings.monumentDefinitions;

  return {
    id,
    cities: [
      ...Array.from({ length: startingCities }, () => ({ workersCommitted: 0, completed: true })),
      ...Array.from({ length: maxCities - startingCities }, () => ({ workersCommitted: 0, completed: false }))
    ],
    food: startingFood,
    goods: createEmptyGoodsTrack(goodsTypes),
    developments: [],
    monuments: createEmptyMonumentProgress(monuments),
    disasterPenalties: 0,
    score: 0,
  };
};

export const DEVELOPMENTS: DevelopmentDefinition[] = [
  {
    id: 'leadership',
    name: 'Leadership',
    cost: 10,
    points: 2,
    effectDescription: 'Re-roll one die',
    specialEffect: { type: 'diceReroll', count: 1 },
  },
  {
    id: 'irrigation',
    name: 'Irrigation',
    cost: 10,
    points: 2,
    effectDescription: 'Drought has no effect',
    specialEffect: { type: 'disasterImmunity', disasterId: 'drought' },
  },
  {
    id: 'agriculture',
    name: 'Agriculture',
    cost: 15,
    points: 3,
    effectDescription: '+1 Food per food die',
    specialEffect: { type: 'resourceProductionBonus', resourceBonus: { goods: 0, food: 1, workers: 0, coins: 0, skulls: 0 } },
  },
  {
    id: 'quarrying',
    name: 'Quarrying',
    cost: 15,
    points: 3,
    effectDescription: '+1 Stone when producing stone',
    specialEffect: { type: 'goodsProductionBonus', goodsType: GOODS_TYPES.find((v, _) => v.name == 'Stone')!, 'bonus': 1 },
  },
  {
    id: 'medicine',
    name: 'Medicine',
    cost: 20,
    points: 4,
    effectDescription: 'Pestilence has no effect',
    specialEffect: { type: 'disasterImmunity', disasterId: 'pestilence' },
  },
  {
    id: 'coinage',
    name: 'Coinage',
    cost: 20,
    points: 4,
    effectDescription: 'Money die is worth +5',
    specialEffect: { type: 'resourceProductionBonus', resourceBonus: { goods: 0, food: 0, workers: 0, coins: 5, skulls: 0 } },
  },
  {
    id: 'caravans',
    name: 'Caravans',
    cost: 20,
    points: 4,
    effectDescription: 'No goods limit',
    specialEffect: { type: 'noGoodsLimit' },
  },
  {
    id: 'religion',
    name: 'Religion',
    cost: 25,
    points: 7,
    effectDescription: 'Revolt affects opponents',
    specialEffect: { type: 'rewriteDisasterTargeting', disasterId: 'revolt', targetPlayers: 'opponents' },
  },
  {
    id: 'granaries',
    name: 'Granaries',
    cost: 30,
    points: 6,
    effectDescription: 'Convert food to 6 coins',
    specialEffect: { type: 'exchange', from: 'food', to: 'coins', rate: 6 },
  },
  {
    id: 'masonry',
    name: 'Masonry',
    cost: 30,
    points: 6,
    effectDescription: '+1 Worker per worker die',
    specialEffect: { type: 'resourceProductionBonus', resourceBonus: { goods: 0, food: 0, workers: 1, coins: 0, skulls: 0 } },
  },
  {
    id: 'engineering',
    name: 'Engineering',
    cost: 40,
    points: 6,
    effectDescription: 'Convert stone to 3 workers',
    specialEffect: { type: 'exchange', from: 'stone', to: 'workers', rate: 3 },
  },
  {
    id: 'architecture',
    name: 'Architecture',
    cost: 60,
    points: 8,
    effectDescription: '+2 points per monument',
    specialEffect: { type: 'bonusPointsPer', entity: 'monument', points: 2 },
  },
  {
    id: 'empire',
    name: 'Empire',
    cost: 70,
    points: 10,
    effectDescription: '+1 point per city',
    specialEffect: { type: 'bonusPointsPer', entity: 'city', points: 1 },
  },
];

export const DISASTERS: DisasterDefinition[] = [
  {
    id: 'drought',
    name: 'Drought',
    skulls: 2,
    effect: 'Lose 2 points',
    pointsDelta: -2,
    clearsGoods: false,
    affectedPlayers: 'self',
  },
  {
    id: 'pestilence',
    name: 'Pestilence',
    skulls: 3,
    effect: 'Opponents lose 3 points',
    pointsDelta: -3,
    clearsGoods: false,
    affectedPlayers: 'opponents',
  },
  {
    id: 'invasion',
    name: 'Invasion',
    skulls: 4,
    effect: 'Lose 4 points',
    pointsDelta: -4,
    clearsGoods: false,
    affectedPlayers: 'self',
  },
  {
    id: 'revolt',
    name: 'Revolt',
    skulls: 5,
    effect: 'Lose all goods',
    pointsDelta: 0,
    clearsGoods: true,
    affectedPlayers: 'self',
  },
];

export const CreateGameSettings = (players: PlayerConfig[]): GameSettings => ({
  players: players,
  endCondition: {
    numDevelopments: 5,
    numMonuments: 7,
    numRounds: 10,
  },
  diceFaces: DICE_FACES,
  goodsTypes: GOODS_TYPES,
  developmentDefinitions: DEVELOPMENTS,
  monumentDefinitions: MONUMENTS,
  cityDefinitions: CITY_DEFINITIONS,
  disasterDefinitions: DISASTERS,

  maxDiceRolls: MAX_DICE_ROLLS,
  maxFood: MAX_FOOD,
  maxGoods: MAX_GOODS,
  startingFood: STARTING_FOOD,
  startingCities: STARTING_CITIES,
  maxCities: MAX_CITIES,
});

export type ScoreBreakdownSummary = {
  monuments: number;
  developments: number;
  bonuses: number;
  penalties: number;
  total: number;
};

export type GoodsSummary = {
  name: string;
  quantity: number;
  value: number;
};

export type ResourceSummary = {
  food: number;
  goods: GoodsSummary[];
  totalGoodsValue: number;
};

export type CitySummary = {
  built: number;
  total: number;
};

export type DevelopmentSummary = {
  id: string;
  name: string;
  points: number;
  effectDescription: string;
};

export type MonumentSummary = {
  id: string;
  name: string;
  points: number;
  firstToComplete: boolean;
};

export type PlayerEndStateSummary = {
  playerId: string;
  playerName: string;
  total: number;
  breakdown: ScoreBreakdownSummary;
  cities: CitySummary;
  resources: ResourceSummary;
  developments: DevelopmentSummary[];
  monuments: MonumentSummary[];
};

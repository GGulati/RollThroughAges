export type ImpactedPlayers = 'all' | 'self' | 'opponents';

export type DisasterDefinition = {
  id: string;
  name: string;
  skulls: number;
  effect: string;

  // TODO: refactor into generic mechanical effects
  pointsDelta: number;
  clearsGoods: boolean;
  affectedPlayers: ImpactedPlayers;
};


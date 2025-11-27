export type GoodsType = {
  name: string;
  /**
   * Value lookup table per stored quantity for this good.
   */
  values: number[];
};

export type GoodsTrack = Map<GoodsType, number>;


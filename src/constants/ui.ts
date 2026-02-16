import { BotSpeedOption } from '@/screens/types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export const BOT_SPEED_DELAY_MS: Record<BotSpeedOption, number> = {
  normal: 1000,
  fast: 500,
  veryFast: 250,
};

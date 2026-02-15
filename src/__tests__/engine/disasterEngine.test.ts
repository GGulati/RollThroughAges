import { describe, it, expect } from 'vitest';
import {
  getTriggeredDisaster,
  hasDisasterImmunity,
  applyDisasterToPlayer,
  getAffectedPlayerIndices,
  applyDisasters,
  getDisasterPreview,
} from '../../game/engine/disasterEngine';
import {
  createTestSettings,
  createTestPlayer,
  setPlayerGoods,
} from '../testUtils';

describe('disasterEngine', () => {
  const settings = createTestSettings(3);

  describe('getTriggeredDisaster', () => {
    it('returns null for 0-1 skulls', () => {
      expect(getTriggeredDisaster(0, settings)).toBeNull();
      expect(getTriggeredDisaster(1, settings)).toBeNull();
    });

    it('returns Drought for 2 skulls', () => {
      const disaster = getTriggeredDisaster(2, settings);
      expect(disaster?.id).toBe('drought');
    });

    it('returns Pestilence for 3 skulls', () => {
      const disaster = getTriggeredDisaster(3, settings);
      expect(disaster?.id).toBe('pestilence');
    });

    it('returns Invasion for 4 skulls', () => {
      const disaster = getTriggeredDisaster(4, settings);
      expect(disaster?.id).toBe('invasion');
    });

    it('returns Revolt for 5+ skulls', () => {
      const disaster = getTriggeredDisaster(5, settings);
      expect(disaster?.id).toBe('revolt');

      const disaster6 = getTriggeredDisaster(6, settings);
      expect(disaster6?.id).toBe('revolt');
    });

    it('returns worst disaster only (not cumulative)', () => {
      // With 5 skulls, only Revolt triggers, not all four
      const disaster = getTriggeredDisaster(5, settings);
      expect(disaster?.id).toBe('revolt');
    });
  });

  describe('hasDisasterImmunity', () => {
    it('returns false without immunity development', () => {
      const player = createTestPlayer('p1', settings);
      expect(hasDisasterImmunity(player, 'drought', settings)).toBe(false);
    });

    it('returns true with Irrigation for Drought', () => {
      const player = createTestPlayer('p1', settings, { developments: ['irrigation'] });
      expect(hasDisasterImmunity(player, 'drought', settings)).toBe(true);
    });

    it('returns true with Medicine for Pestilence', () => {
      const player = createTestPlayer('p1', settings, { developments: ['medicine'] });
      expect(hasDisasterImmunity(player, 'pestilence', settings)).toBe(true);
    });

    it('returns false for wrong disaster type', () => {
      const player = createTestPlayer('p1', settings, { developments: ['irrigation'] });
      expect(hasDisasterImmunity(player, 'invasion', settings)).toBe(false);
    });
  });

  describe('applyDisasterToPlayer', () => {
    it('applies point penalty for Drought', () => {
      const player = createTestPlayer('p1', settings);
      const drought = settings.disasterDefinitions.find((d) => d.id === 'drought')!;

      const result = applyDisasterToPlayer(player, drought);
      expect(result.disasterPenalties).toBe(2);
    });

    it('clears goods for Revolt', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 5, settings);
      player = setPlayerGoods(player, 'Stone', 3, settings);

      const revolt = settings.disasterDefinitions.find((d) => d.id === 'revolt')!;
      const result = applyDisasterToPlayer(player, revolt);

      for (const [, quantity] of result.goods) {
        expect(quantity).toBe(0);
      }
    });

    it('does not clear goods for point-based disasters', () => {
      let player = createTestPlayer('p1', settings);
      player = setPlayerGoods(player, 'Wood', 5, settings);

      const invasion = settings.disasterDefinitions.find((d) => d.id === 'invasion')!;
      const result = applyDisasterToPlayer(player, invasion);

      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;
      expect(result.goods.get(wood)).toBe(5);
    });
  });

  describe('getAffectedPlayerIndices', () => {
    it('returns self for self-targeting disasters', () => {
      const drought = settings.disasterDefinitions.find((d) => d.id === 'drought')!;
      const player = createTestPlayer('p1', settings);

      const affected = getAffectedPlayerIndices(drought, 0, 3, player, settings);
      expect(affected).toEqual([0]);
    });

    it('returns opponents for opponent-targeting disasters', () => {
      const pestilence = settings.disasterDefinitions.find((d) => d.id === 'pestilence')!;
      const player = createTestPlayer('p1', settings);

      const affected = getAffectedPlayerIndices(pestilence, 1, 3, player, settings);
      expect(affected).toEqual([0, 2]); // Everyone except player 1
    });

    it('redirects Revolt to opponents with Religion', () => {
      const revolt = settings.disasterDefinitions.find((d) => d.id === 'revolt')!;
      const player = createTestPlayer('p1', settings, { developments: ['religion'] });

      const affected = getAffectedPlayerIndices(revolt, 0, 3, player, settings);
      expect(affected).toEqual([1, 2]); // Opponents instead of self
    });
  });

  describe('applyDisasters', () => {
    it('applies disaster to correct players', () => {
      const players = [
        createTestPlayer('p1', settings),
        createTestPlayer('p2', settings),
      ];

      // 2 skulls = Drought (self, -2 points)
      const result = applyDisasters(players, 0, 2, settings);

      expect(result[0].disasterPenalties).toBe(2);
      expect(result[1].disasterPenalties).toBe(0);
    });

    it('applies opponent-targeting disaster to all opponents', () => {
      const players = [
        createTestPlayer('p1', settings),
        createTestPlayer('p2', settings),
        createTestPlayer('p3', settings),
      ];

      // 3 skulls = Pestilence (opponents, -3 points)
      const result = applyDisasters(players, 0, 3, settings);

      expect(result[0].disasterPenalties).toBe(0); // Active player unaffected
      expect(result[1].disasterPenalties).toBe(3);
      expect(result[2].disasterPenalties).toBe(3);
    });

    it('respects immunity', () => {
      const players = [
        createTestPlayer('p1', settings, { developments: ['irrigation'] }),
        createTestPlayer('p2', settings),
      ];

      // 2 skulls = Drought, but p1 has Irrigation
      const result = applyDisasters(players, 0, 2, settings);

      expect(result[0].disasterPenalties).toBe(0);
    });

    it('does nothing for 0-1 skulls', () => {
      const players = [
        createTestPlayer('p1', settings),
        createTestPlayer('p2', settings),
      ];

      const result = applyDisasters(players, 0, 1, settings);

      expect(result[0].disasterPenalties).toBe(0);
      expect(result[1].disasterPenalties).toBe(0);
    });

    it('applies Revolt with Religion to opponents', () => {
      const players = [
        createTestPlayer('p1', settings, { developments: ['religion'] }),
        setPlayerGoods(createTestPlayer('p2', settings), 'Wood', 5, settings),
      ];

      // 5 skulls = Revolt, redirected to opponents
      const result = applyDisasters(players, 0, 5, settings);

      // p1's goods should be intact
      // p2's goods should be cleared
      const wood = settings.goodsTypes.find((g) => g.name === 'Wood')!;
      expect(result[1].goods.get(wood)).toBe(0);
    });
  });

  describe('getDisasterPreview', () => {
    it('returns description for triggered disaster', () => {
      const preview = getDisasterPreview(2, settings);
      expect(preview).toContain('Drought');
    });

    it('returns null for no disaster', () => {
      const preview = getDisasterPreview(1, settings);
      expect(preview).toBeNull();
    });
  });
});

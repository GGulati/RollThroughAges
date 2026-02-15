import { describe, it, expect } from 'vitest';
import {
  calculateMonumentPoints,
  calculateBonusPoints,
  updateAllScores,
  getScoreBreakdown,
  determineWinners,
} from '../../game/engine/scoreEngine';
import { createTestSettings, createTestPlayer } from '../testUtils';

describe('scoreEngine', () => {
  const settings = createTestSettings(2);

  describe('calculateMonumentPoints', () => {
    it('returns 0 when no monuments completed', () => {
      const players = [createTestPlayer('p1', settings)];
      expect(calculateMonumentPoints(players[0], players, settings)).toBe(0);
    });

    it('awards first-completion points', () => {
      const players = [
        createTestPlayer('p1', settings),
        createTestPlayer('p2', settings),
      ];
      const monument = settings.monumentDefinitions[0];
      players[0].monuments[monument.id] = { workersCommitted: 10, completed: true };

      const points = calculateMonumentPoints(players[0], players, settings);
      expect(points).toBe(monument.firstPoints);
    });

    it('awards later-completion points when not first', () => {
      const players = [
        createTestPlayer('p1', settings),
        createTestPlayer('p2', settings),
      ];
      const monument = settings.monumentDefinitions[0];
      players[0].monuments[monument.id] = { workersCommitted: 10, completed: true };
      players[1].monuments[monument.id] = { workersCommitted: 10, completed: true };

      const points = calculateMonumentPoints(players[1], players, settings);
      expect(points).toBe(monument.laterPoints);
    });

    it('sums points from multiple monuments', () => {
      const players = [createTestPlayer('p1', settings)];
      const monument1 = settings.monumentDefinitions[0];
      const monument2 = settings.monumentDefinitions[1];

      players[0].monuments[monument1.id] = { workersCommitted: 10, completed: true };
      players[0].monuments[monument2.id] = { workersCommitted: 10, completed: true };

      const points = calculateMonumentPoints(players[0], players, settings);
      expect(points).toBe(monument1.firstPoints + monument2.firstPoints);
    });
  });

  describe('calculateBonusPoints', () => {
    it('returns 0 without bonus developments', () => {
      const player = createTestPlayer('p1', settings);
      expect(calculateBonusPoints(player, settings)).toBe(0);
    });

    it('calculates bonus for Architecture (per monument)', () => {
      // Find Architecture development
      const architectureDev = settings.developmentDefinitions.find(
        (d) => d.specialEffect.type === 'bonusPointsPer' && d.specialEffect.entity === 'monument'
      );

      if (architectureDev) {
        const player = createTestPlayer('p1', settings, {
          developments: [architectureDev.id],
        });
        const monument = settings.monumentDefinitions[0];
        player.monuments[monument.id] = { workersCommitted: 10, completed: true };

        const bonus = calculateBonusPoints(player, settings);
        if (architectureDev.specialEffect.type === 'bonusPointsPer') {
          expect(bonus).toBe(architectureDev.specialEffect.points);
        }
      }
    });

    it('calculates bonus for Empire (per city)', () => {
      const empireDev = settings.developmentDefinitions.find(
        (d) => d.specialEffect.type === 'bonusPointsPer' && d.specialEffect.entity === 'city'
      );

      if (empireDev) {
        const player = createTestPlayer('p1', settings, {
          developments: [empireDev.id],
        });
        // Player has 3 starting cities

        const bonus = calculateBonusPoints(player, settings);
        if (empireDev.specialEffect.type === 'bonusPointsPer') {
          expect(bonus).toBe(settings.startingCities * empireDev.specialEffect.points);
        }
      }
    });
  });

  describe('updateAllScores', () => {
    it('updates scores for all players', () => {
      const players = [
        createTestPlayer('p1', settings),
        createTestPlayer('p2', settings),
      ];
      const monument = settings.monumentDefinitions[0];
      players[0].monuments[monument.id] = { workersCommitted: 10, completed: true };

      const updated = updateAllScores(players, settings);

      expect(updated[0].score).toBe(monument.firstPoints);
      expect(updated[1].score).toBe(0);
    });
  });

  describe('getScoreBreakdown', () => {
    it('returns 0 for new player', () => {
      const players = [createTestPlayer('p1', settings)];
      expect(getScoreBreakdown(players[0], players, settings).total).toBe(0);
    });

    it('sums monument, development, and bonus points', () => {
      const players = [createTestPlayer('p1', settings)];
      const monument = settings.monumentDefinitions[0];
      const dev = settings.developmentDefinitions[0];

      players[0].monuments[monument.id] = { workersCommitted: 10, completed: true };
      players[0].developments.push(dev.id);

      const score = getScoreBreakdown(players[0], players, settings).total;
      expect(score).toBeGreaterThanOrEqual(monument.firstPoints + dev.points);
    });

    it('subtracts disaster penalties', () => {
      const players = [createTestPlayer('p1', settings)];
      players[0].disasterPenalties = 5;

      const score = getScoreBreakdown(players[0], players, settings).total;
      expect(score).toBe(-5);
    });
    it('returns detailed breakdown', () => {
      const players = [createTestPlayer('p1', settings)];
      const monument = settings.monumentDefinitions[0];
      const dev = settings.developmentDefinitions[0];

      players[0].monuments[monument.id] = { workersCommitted: 10, completed: true };
      players[0].developments.push(dev.id);
      players[0].disasterPenalties = 2;

      const breakdown = getScoreBreakdown(players[0], players, settings);

      expect(breakdown.monuments).toBe(monument.firstPoints);
      expect(breakdown.developments).toBe(dev.points);
      expect(breakdown.penalties).toBe(2);
      expect(breakdown.total).toBe(
        breakdown.monuments + breakdown.developments + breakdown.bonuses - breakdown.penalties
      );
    });
  });

  describe('determineWinners', () => {
    it('returns single winner', () => {
      const players = [
        { ...createTestPlayer('p1', settings), score: 50 },
        { ...createTestPlayer('p2', settings), score: 30 },
      ];

      const winners = determineWinners(players);
      expect(winners).toEqual(['p1']);
    });

    it('returns multiple winners on tie', () => {
      const players = [
        { ...createTestPlayer('p1', settings), score: 50 },
        { ...createTestPlayer('p2', settings), score: 50 },
      ];

      const winners = determineWinners(players);
      expect(winners).toContain('p1');
      expect(winners).toContain('p2');
      expect(winners.length).toBe(2);
    });
  });
});

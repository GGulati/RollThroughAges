import { PlayerConfig } from '../game';
import {
  getHeadlessScoreSummary,
  HeadlessBotGameOptions,
  runHeadlessBotMatch,
} from './headless';
import { heuristicStandardBot } from '../bot/heuristic';
import { BotStrategy } from '../bot/types';

export type HeadlessBotEvaluationOptions = Omit<HeadlessBotGameOptions, 'strategyByPlayerId'> & {
  rounds?: number;
  rotateSeats?: boolean;
  strategyByPlayerId?: Record<string, BotStrategy>;
  participantKeyByPlayerId?: Record<string, string>;
  participantLabelByKey?: Record<string, string>;
};

export type HeadlessBotEvaluationStanding = {
  key: string;
  label: string;
  appearances: number;
  totalVp: number;
  avgVp: number;
  topFinishes: number;
  topFinishRate: number;
  winShare: number;
  winShareRate: number;
};

export type HeadlessBotEvaluationSeatResult = {
  playerId: string;
  playerName: string;
  strategyId: string;
  participantKey: string;
  participantLabel: string;
  score: number;
};

export type HeadlessBotEvaluationGameResult = {
  round: number;
  rotation: number;
  completed: boolean;
  turnsPlayed: number;
  stallReason: string | null;
  winners: string[];
  seats: HeadlessBotEvaluationSeatResult[];
  actionLog: string[];
};

export type HeadlessBotEvaluationResult = {
  rounds: number;
  rotationsPerRound: number;
  totalGames: number;
  incompleteGames: number;
  standings: HeadlessBotEvaluationStanding[];
  games: HeadlessBotEvaluationGameResult[];
};

type SeatAssignment = {
  strategy: BotStrategy;
  participantKey: string;
  participantLabel: string;
};

type ParticipantStats = {
  appearances: number;
  totalVp: number;
  topFinishes: number;
  winShare: number;
};

function validateEvaluationPlayers(players: PlayerConfig[]): void {
  if (players.length < 2) {
    throw new Error('Headless bot evaluation requires at least 2 players.');
  }
  const nonBot = players.filter((player) => player.controller !== 'bot');
  if (nonBot.length > 0) {
    throw new Error(
      `Headless bot evaluation requires bot-only players. Found non-bot players: ${nonBot
        .map((player) => `${player.name} (${player.controller})`)
        .join(', ')}`,
    );
  }
}

function buildBaseAssignments(
  players: PlayerConfig[],
  options: HeadlessBotEvaluationOptions,
): SeatAssignment[] {
  return players.map((player) => {
    const strategy = options.strategyByPlayerId?.[player.id] ?? heuristicStandardBot;
    const participantKey =
      options.participantKeyByPlayerId?.[player.id] ?? strategy.id;
    const participantLabel =
      options.participantLabelByKey?.[participantKey] ?? participantKey;
    return {
      strategy,
      participantKey,
      participantLabel,
    };
  });
}

function buildRotatedAssignments(
  players: PlayerConfig[],
  baseAssignments: SeatAssignment[],
  rotation: number,
): {
  strategyByPlayerId: Record<string, BotStrategy>;
  participantByPlayerId: Record<string, { key: string; label: string }>;
} {
  const strategyByPlayerId: Record<string, BotStrategy> = {};
  const participantByPlayerId: Record<string, { key: string; label: string }> = {};

  for (let seat = 0; seat < players.length; seat += 1) {
    const player = players[seat];
    const assignment = baseAssignments[(seat + rotation) % baseAssignments.length];
    strategyByPlayerId[player.id] = assignment.strategy;
    participantByPlayerId[player.id] = {
      key: assignment.participantKey,
      label: assignment.participantLabel,
    };
  }

  return { strategyByPlayerId, participantByPlayerId };
}

function createEmptyStats(): ParticipantStats {
  return {
    appearances: 0,
    totalVp: 0,
    topFinishes: 0,
    winShare: 0,
  };
}

export function runHeadlessBotEvaluation(
  players: PlayerConfig[],
  options: HeadlessBotEvaluationOptions = {},
): HeadlessBotEvaluationResult {
  validateEvaluationPlayers(players);
  const rounds = options.rounds ?? 10;
  const rotateSeats = options.rotateSeats ?? true;
  if (!Number.isInteger(rounds) || rounds <= 0) {
    throw new Error('Headless bot evaluation rounds must be a positive integer.');
  }

  const rotationsPerRound = rotateSeats ? players.length : 1;
  const baseAssignments = buildBaseAssignments(players, options);
  const statsByParticipant = new Map<string, ParticipantStats>();
  const labelByParticipant = new Map<string, string>();
  const games: HeadlessBotEvaluationGameResult[] = [];
  let incompleteGames = 0;

  for (const assignment of baseAssignments) {
    if (!statsByParticipant.has(assignment.participantKey)) {
      statsByParticipant.set(assignment.participantKey, createEmptyStats());
    }
    labelByParticipant.set(assignment.participantKey, assignment.participantLabel);
  }

  for (let round = 0; round < rounds; round += 1) {
    for (let rotation = 0; rotation < rotationsPerRound; rotation += 1) {
      const { strategyByPlayerId, participantByPlayerId } = buildRotatedAssignments(
        players,
        baseAssignments,
        rotation,
      );
      const game = runHeadlessBotMatch(players, {
        maxTurns: options.maxTurns,
        maxStepsPerTurn: options.maxStepsPerTurn,
        strategyByPlayerId,
      });
      if (!game.completed) {
        incompleteGames += 1;
      }

      const summary = getHeadlessScoreSummary(game.finalGame);
      const topScore = Math.max(...summary.map((entry) => entry.total));
      const topEntries = summary.filter((entry) => entry.total === topScore);
      const winShare = topEntries.length > 0 ? 1 / topEntries.length : 0;

      const seats: HeadlessBotEvaluationSeatResult[] = summary.map((entry) => {
        const participant = participantByPlayerId[entry.playerId];
        const strategy = strategyByPlayerId[entry.playerId];
        return {
          playerId: entry.playerId,
          playerName: entry.playerName,
          strategyId: strategy.id,
          participantKey: participant.key,
          participantLabel: participant.label,
          score: entry.total,
        };
      });

      for (const seat of seats) {
        const stats = statsByParticipant.get(seat.participantKey);
        if (!stats) {
          continue;
        }
        stats.appearances += 1;
        stats.totalVp += seat.score;
        if (seat.score === topScore) {
          stats.topFinishes += 1;
          stats.winShare += winShare;
        }
      }

      games.push({
        round: round + 1,
        rotation: rotation + 1,
        completed: game.completed,
        turnsPlayed: game.turnsPlayed,
        stallReason: game.stallReason,
        winners: game.winners,
        seats,
        actionLog: game.actionLog,
      });
    }
  }

  const standings: HeadlessBotEvaluationStanding[] = Array.from(
    statsByParticipant.entries(),
  ).map(([key, stats]) => {
    const appearances = stats.appearances;
    return {
      key,
      label: labelByParticipant.get(key) ?? key,
      appearances,
      totalVp: stats.totalVp,
      avgVp: appearances > 0 ? stats.totalVp / appearances : 0,
      topFinishes: stats.topFinishes,
      topFinishRate: appearances > 0 ? stats.topFinishes / appearances : 0,
      winShare: stats.winShare,
      winShareRate: appearances > 0 ? stats.winShare / appearances : 0,
    };
  });
  standings.sort(
    (a, b) =>
      b.winShareRate - a.winShareRate ||
      b.avgVp - a.avgVp ||
      b.topFinishRate - a.topFinishRate ||
      a.label.localeCompare(b.label),
  );

  return {
    rounds,
    rotationsPerRound,
    totalGames: rounds * rotationsPerRound,
    incompleteGames,
    standings,
    games,
  };
}

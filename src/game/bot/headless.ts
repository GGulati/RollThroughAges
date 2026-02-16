import { determineWinners, getScoreBreakdown, isGameOver } from '../engine';
import { GameState, PlayerConfig } from '../game';
import { createGame } from '../engine/gameEngine';
import { heuristicStandardBot } from './heuristicBot';
import { BotStrategy } from './types';
import { runBotTurn } from './runner';
import { botActionKey } from './actionKey';

export type HeadlessBotGameResult = {
  completed: boolean;
  turnsPlayed: number;
  finalGame: GameState;
  winners: string[];
  stallReason: string | null;
  actionLog: string[];
};

export type HeadlessBotGameOptions = {
  maxTurns?: number;
  maxStepsPerTurn?: number;
  strategyByPlayerId?: Record<string, BotStrategy>;
};

export function createAllBotPlayers(playerCount: number): PlayerConfig[] {
  return Array.from({ length: playerCount }, (_, index) => ({
    id: `b${index + 1}`,
    name: `Bot ${index + 1}`,
    controller: 'bot',
  }));
}

export function runHeadlessBotGame(
  initialGame: GameState,
  options: HeadlessBotGameOptions = {},
): HeadlessBotGameResult {
  const maxTurns = options.maxTurns ?? 500;
  const maxStepsPerTurn = options.maxStepsPerTurn ?? 300;

  let game = initialGame;
  let turnsPlayed = 0;
  let stallReason: string | null = null;
  const actionLog: string[] = [];

  while (!isGameOver(game) && turnsPlayed < maxTurns) {
    const activePlayerId = game.state.turn.activePlayerId;
    const strategy =
      options.strategyByPlayerId?.[activePlayerId] ?? heuristicStandardBot;
    const activePlayerName =
      game.settings.players.find((player) => player.id === activePlayerId)?.name ??
      activePlayerId;
    const turnResult = runBotTurn(game, strategy, { maxSteps: maxStepsPerTurn });
    for (const step of turnResult.trace) {
      if (step.appliedAction) {
        actionLog.push(
          `[${activePlayerName}] ${step.phaseBefore} -> ${step.phaseAfter}: ${botActionKey(
            step.appliedAction,
          )}`,
        );
      } else if (step.error) {
        actionLog.push(
          `[${activePlayerName}] ${step.phaseBefore}: ERROR ${step.error}`,
        );
      }
    }
    if (!turnResult.completedTurn) {
      const lastTrace = turnResult.trace[turnResult.trace.length - 1];
      stallReason =
        lastTrace?.error ??
        `Bot turn did not complete for player ${activePlayerId}.`;
      game = turnResult.game;
      break;
    }

    game = turnResult.game;
    turnsPlayed += 1;
  }

  const completed = isGameOver(game);
  const winnerIds = determineWinners(game.state.players);
  const winners = winnerIds.map((winnerId) => {
    const config = game.settings.players.find((player) => player.id === winnerId);
    return config?.name ?? winnerId;
  });
  if (completed) {
    actionLog.push(
      `[System] Game complete in ${turnsPlayed} turns. Winner(s): ${winners.join(
        ', ',
      )}.`,
    );
  } else if (stallReason) {
    actionLog.push(`[System] Simulation stopped: ${stallReason}`);
  }

  return {
    completed,
    turnsPlayed,
    finalGame: game,
    winners,
    stallReason: completed ? null : stallReason ?? 'Reached turn cap before game over.',
    actionLog,
  };
}

export function runHeadlessBotMatch(
  playerCount: number,
  options: HeadlessBotGameOptions = {},
): HeadlessBotGameResult {
  const players = createAllBotPlayers(playerCount);
  const game = createGame(players);
  return runHeadlessBotGame(game, options);
}

export function getHeadlessScoreSummary(game: GameState): Array<{
  playerId: string;
  playerName: string;
  total: number;
}> {
  return game.state.players.map((player) => {
    const config = game.settings.players.find((entry) => entry.id === player.id);
    const score = getScoreBreakdown(player, game.state.players, game.settings).total;
    return {
      playerId: player.id,
      playerName: config?.name ?? player.id,
      total: score,
    };
  });
}

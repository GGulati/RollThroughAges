import { determineWinners, getPlayerEndStateSummaries, isGameOver } from '../engine';
import { GameState, PlayerConfig } from '../game';
import { PlayerEndStateSummary } from '../reporting';
import { createGame } from '../engine/gameEngine';
import { heuristicStandardBot } from '../bot/heuristic';
import { BotStrategy } from '../bot/types';
import { runBotTurn } from './runner';
import { botActionKey } from '../bot/actionKey';

export type HeadlessBotInstrumentation = {
  runHeadlessBotGameCalls: number;
  runHeadlessBotGameMsTotal: number;
  completedGames: number;
  stalledGames: number;
  turnsPlayedTotal: number;
  actionLogEntriesTotal: number;
};

function createEmptyHeadlessInstrumentation(): HeadlessBotInstrumentation {
  return {
    runHeadlessBotGameCalls: 0,
    runHeadlessBotGameMsTotal: 0,
    completedGames: 0,
    stalledGames: 0,
    turnsPlayedTotal: 0,
    actionLogEntriesTotal: 0,
  };
}

const headlessBotInstrumentation = createEmptyHeadlessInstrumentation();

export function resetHeadlessBotInstrumentation(): void {
  Object.assign(headlessBotInstrumentation, createEmptyHeadlessInstrumentation());
}

export function getHeadlessBotInstrumentation(): HeadlessBotInstrumentation {
  return { ...headlessBotInstrumentation };
}

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

function validateBotOnlyPlayers(players: PlayerConfig[]): void {
  if (players.length < 2) {
    throw new Error('Headless bot match requires at least 2 players.');
  }

  const humanPlayers = players.filter((player) => player.controller !== 'bot');
  if (humanPlayers.length > 0) {
    throw new Error(
      `Headless bot match requires bot-only players. Found non-bot controllers: ${humanPlayers
        .map((player) => `${player.name} (${player.controller})`)
        .join(', ')}`,
    );
  }
}

export function runHeadlessBotGame(
  initialGame: GameState,
  options: HeadlessBotGameOptions = {},
): HeadlessBotGameResult {
  headlessBotInstrumentation.runHeadlessBotGameCalls += 1;
  const runStartMs = Date.now();
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
  if (completed) {
    headlessBotInstrumentation.completedGames += 1;
  } else {
    headlessBotInstrumentation.stalledGames += 1;
  }
  headlessBotInstrumentation.turnsPlayedTotal += turnsPlayed;
  headlessBotInstrumentation.actionLogEntriesTotal += actionLog.length;
  headlessBotInstrumentation.runHeadlessBotGameMsTotal += Date.now() - runStartMs;

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
  players: PlayerConfig[],
  options: HeadlessBotGameOptions = {},
): HeadlessBotGameResult {
  validateBotOnlyPlayers(players);
  const game = createGame(players);
  return runHeadlessBotGame(game, options);
}

export function getHeadlessScoreSummary(game: GameState): PlayerEndStateSummary[] {
  return getPlayerEndStateSummaries(game);
}

import { performance } from 'node:perf_hooks';
import { runHeadlessBotEvaluation } from '../src/game/automation/index.ts';
import { PlayerConfig } from '../src/game/index.ts';
import {
  average,
  createBotStrategy,
  LoadedBotConfig,
  loadConfigEntry,
} from './helpers.ts';

type StrategyLabel = 'A' | 'B';

type CliOptions = {
  players: number;
  games: number;
  maxTurns: number;
  maxStepsPerTurn: number;
  minWinRate: number;
  minVpDelta: number;
};

type GameEvaluation = {
  averageScoreA: number;
  averageScoreB: number;
  deltaAminusB: number;
  winner: StrategyLabel | 'Tie';
  completed: boolean;
  turnsPlayed: number;
  stallReason: string | null;
};

type EvaluationSummary = {
  winsA: number;
  winsB: number;
  ties: number;
  decisiveGames: number;
  winRateA: number;
  meanDelta: number;
  avgScoreA: number;
  avgScoreB: number;
  avgTurns: number;
  incompleteGames: number;
  totalGames: number;
  clearMarginForA: boolean;
  stallReasons: Record<string, number>;
  stallOccurrences: Array<{
    round: number;
    rotation: number;
    reason: string;
  }>;
};

type CandidateResult = {
  name: string;
  path: string;
  quick: EvaluationSummary;
  timingsMs?: {
    quick: number;
  };
};

type TournamentProfile = {
  totalMs: number;
  candidateLoadMs: number;
  runHeadlessMs: number;
  scoreSummaryMs: number;
  postGameProcessingMs: number;
  evaluateSingleGameCalls: number;
  gamesSimulated: number;
  quickRoundMs: number;
  finalRoundMs: number;
};

type WorkerQuickEvalRequest = {
  candidateFiles: string[];
  baselineCandidate: LoadedBotConfig;
  options: CliOptions;
};

type WorkerQuickEvalResponse = {
  results: CandidateResult[];
  profile: TournamentProfile;
};

function createTournamentProfile(): TournamentProfile {
  return {
    totalMs: 0,
    candidateLoadMs: 0,
    runHeadlessMs: 0,
    scoreSummaryMs: 0,
    postGameProcessingMs: 0,
    evaluateSingleGameCalls: 0,
    gamesSimulated: 0,
    quickRoundMs: 0,
    finalRoundMs: 0,
  };
}

function createPlayersForGame(
  playerCount: number,
  rotation: number,
): {
  players: PlayerConfig[];
  strategyByPlayerId: Record<string, StrategyLabel>;
} {
  const players: PlayerConfig[] = [];
  const strategyByPlayerId: Record<string, StrategyLabel> = {};

  for (let i = 0; i < playerCount; i += 1) {
    const strategy: StrategyLabel = (i + rotation) % 2 === 0 ? 'A' : 'B';
    const id = `${strategy.toLowerCase()}-${i + 1}`;
    players.push({
      id,
      name: `${strategy} Bot ${i + 1}`,
      controller: 'bot',
    });
    strategyByPlayerId[id] = strategy;
  }

  return { players, strategyByPlayerId };
}

function summarizeEvaluations(
  evaluations: GameEvaluation[],
  options: CliOptions,
  stallOccurrences: EvaluationSummary['stallOccurrences'],
): EvaluationSummary {
  const winsA = evaluations.filter((evaluation) => evaluation.winner === 'A').length;
  const winsB = evaluations.filter((evaluation) => evaluation.winner === 'B').length;
  const ties = evaluations.filter((evaluation) => evaluation.winner === 'Tie').length;
  const decisiveGames = winsA + winsB;
  const winRateA = decisiveGames > 0 ? winsA / decisiveGames : 0;
  const meanDelta = average(evaluations.map((evaluation) => evaluation.deltaAminusB));
  const avgScoreA = average(evaluations.map((evaluation) => evaluation.averageScoreA));
  const avgScoreB = average(evaluations.map((evaluation) => evaluation.averageScoreB));
  const avgTurns = average(evaluations.map((evaluation) => evaluation.turnsPlayed));
  const incompleteGames = evaluations.filter((evaluation) => !evaluation.completed).length;

  return {
    winsA,
    winsB,
    ties,
    decisiveGames,
    winRateA,
    meanDelta,
    avgScoreA,
    avgScoreB,
    avgTurns,
    incompleteGames,
    totalGames: evaluations.length,
    clearMarginForA: winRateA >= options.minWinRate && meanDelta >= options.minVpDelta,
    stallReasons: Object.fromEntries(
      Array.from(
        stallOccurrences.reduce((acc, stall) => {
          acc.set(stall.reason, (acc.get(stall.reason) ?? 0) + 1);
          return acc;
        }, new Map<string, number>()).entries(),
      ).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    ),
    stallOccurrences,
  };
}

function evaluateConfigVsBaseline(
  candidateA: LoadedBotConfig,
  baselineCandidate: LoadedBotConfig,
  games: number,
  options: CliOptions,
  profile: TournamentProfile,
): EvaluationSummary {
  const baseSetup = createPlayersForGame(options.players, 0);
  const strategyByPlayer = Object.fromEntries(
    baseSetup.players.map((player) => [
      player.id,
      baseSetup.strategyByPlayerId[player.id] === 'A'
        ? createBotStrategy(candidateA, `candidate-a-${candidateA.id}`)
        : createBotStrategy(candidateB, `baseline-b-${candidateB.id}`),
    ]),
  );
  const participantKeyByPlayerId = Object.fromEntries(
    baseSetup.players.map((player) => [player.id, baseSetup.strategyByPlayerId[player.id]]),
  );
  const participantLabelByKey = {
    A: `A:${candidateA.name}`,
    B: `B:${candidateB.name}`,
  };
  const rounds = Math.ceil(games / options.players);
  const headlessStart = performance.now();
  const evaluation = runHeadlessBotEvaluation(baseSetup.players, {
    rounds,
    rotateSeats: true,
    maxTurns: options.maxTurns,
    maxStepsPerTurn: options.maxStepsPerTurn,
    strategyByPlayerId: strategyByPlayer,
    participantKeyByPlayerId,
    participantLabelByKey,
  });
  profile.runHeadlessMs += performance.now() - headlessStart;
  const evaluations: GameEvaluation[] = [];
  const stallOccurrences: EvaluationSummary['stallOccurrences'] = [];
  const gamesToProcess = evaluation.games.slice(0, games);
  const postStart = performance.now();
  for (const game of gamesToProcess) {
    const scoresA = game.seats
      .filter((seat) => seat.participantKey === 'A')
      .map((seat) => seat.score);
    const scoresB = game.seats
      .filter((seat) => seat.participantKey === 'B')
      .map((seat) => seat.score);
    const averageScoreA = average(scoresA);
    const averageScoreB = average(scoresB);
    const delta = averageScoreA - averageScoreB;
    const winner: StrategyLabel | 'Tie' = delta > 0 ? 'A' : delta < 0 ? 'B' : 'Tie';
    const gameEvaluation: GameEvaluation = {
      averageScoreA,
      averageScoreB,
      deltaAminusB: delta,
      winner,
      completed: game.completed,
      turnsPlayed: game.turnsPlayed,
      stallReason: game.stallReason,
    };
    evaluations.push(gameEvaluation);
    if (!game.completed) {
      stallOccurrences.push({
        round: game.round,
        rotation: game.rotation,
        reason: game.stallReason ?? 'Unknown stall reason',
      });
    }
  }
  profile.postGameProcessingMs += performance.now() - postStart;
  profile.evaluateSingleGameCalls += gamesToProcess.length;
  profile.gamesSimulated += gamesToProcess.length;

  return summarizeEvaluations(evaluations, options, stallOccurrences);
}

function evaluateCandidateFile(
  file: string,
  baselineCandidate: LoadedBotConfig,
  options: CliOptions,
  profile: TournamentProfile,
): CandidateResult {
  const candidateStart = performance.now();
  const candidate = loadConfigEntry(file);
  const quick = evaluateConfigVsBaseline(
    candidate,
    baselineCandidate,
    options.games,
    options,
    profile,
  );
  const candidateElapsed = performance.now() - candidateStart;
  return {
    name: candidate.name,
    path: candidate.source,
    quick,
    timingsMs: { quick: candidateElapsed },
  };
}

export default async function runQuickEvalWorker(
  request: WorkerQuickEvalRequest,
): Promise<WorkerQuickEvalResponse> {
  const profile = createTournamentProfile();
  const results = request.candidateFiles.map((file) =>
    evaluateCandidateFile(file, request.baselineCandidate, request.options, profile),
  );
  return { results, profile };
}

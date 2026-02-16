import { readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { availableParallelism, cpus } from 'node:os';
import Piscina from 'piscina';
import {
  HEURISTIC_STANDARD_CONFIG,
} from '../src/game/bot/index.ts';
import { runHeadlessBotEvaluation } from '../src/game/automation/index.ts';
import { PlayerConfig } from '../src/game/index.ts';
import {
  average,
  createBotStrategy,
  formatNum,
  formatPercent,
  LoadedBotConfig,
  loadConfigEntry,
  parseNumber,
} from './helpers.ts';

type StrategyLabel = 'A' | 'B';

type CliOptions = {
  candidatesDir: string;
  baselinePath?: string;
  players: number;
  games: number;
  finalGames: number;
  top: number;
  maxTurns: number;
  maxStepsPerTurn: number;
  minWinRate: number;
  minVpDelta: number;
  outputJson?: string;
  profile: boolean;
  maxCandidates?: number;
  workers: number | 'auto';
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
  final?: EvaluationSummary;
  timingsMs?: {
    quick: number;
    final?: number;
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

function mergeProfile(target: TournamentProfile, source: TournamentProfile): void {
  target.candidateLoadMs += source.candidateLoadMs;
  target.runHeadlessMs += source.runHeadlessMs;
  target.scoreSummaryMs += source.scoreSummaryMs;
  target.postGameProcessingMs += source.postGameProcessingMs;
  target.evaluateSingleGameCalls += source.evaluateSingleGameCalls;
  target.gamesSimulated += source.gamesSimulated;
  target.quickRoundMs += source.quickRoundMs;
  target.finalRoundMs += source.finalRoundMs;
}

function printUsage(): void {
  console.log('Usage: npx tsx scripts/bot_tournament.ts --candidates-dir <dir> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --candidates-dir <dir>    Directory containing candidate *.json config files');
  console.log('                            Supports heuristic and lookahead candidate files.');
  console.log('  --baseline <path>         Baseline candidate JSON (default: heuristic standard)');
  console.log('  --players <n>             Player count 2-4 (default: 2)');
  console.log('  --games <n>               Quick game count per candidate (default: 50)');
  console.log('  --final-games <n>         Final game count for top candidates (default: 50)');
  console.log('  --rounds <n>              Alias: rounds * players = games (deprecated)');
  console.log('  --final-rounds <n>        Alias: final-rounds * players = final-games (deprecated)');
  console.log('  --pairs <n>               Alias for --rounds (deprecated)');
  console.log('  --final-pairs <n>         Alias for --final-rounds (deprecated)');
  console.log('  --top <n>                 Number of candidates in final round (default: 3)');
  console.log('  --max-turns <n>           Max turns per game (default: 500)');
  console.log('  --max-steps-per-turn <n>  Max bot steps per turn (default: 300)');
  console.log('  --min-win-rate <0..1>     Clear margin win-rate threshold (default: 0.6)');
  console.log('  --min-vp-delta <n>        Clear margin VP threshold (default: 1)');
  console.log('  --output-json <path>      Write tournament results JSON');
  console.log('  --profile                 Print detailed timing instrumentation');
  console.log('  --max-candidates <n>      Limit number of candidate configs loaded');
  console.log(
    '  --workers <n|auto>        Parallel workers for quick round (default: auto)',
  );
  console.log('  --help                    Show help');
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    candidatesDir: '',
    players: 2,
    games: 50,
    finalGames: 50,
    top: 3,
    maxTurns: 500,
    maxStepsPerTurn: 300,
    minWinRate: 0.6,
    minVpDelta: 1,
    profile: false,
    workers: 'auto',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--profile') {
      options.profile = true;
      continue;
    }

    const next = argv[i + 1];
    if (!next && arg.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }

    switch (arg) {
      case '--candidates-dir':
        options.candidatesDir = next;
        i += 1;
        break;
      case '--baseline':
        options.baselinePath = next;
        i += 1;
        break;
      case '--players':
        options.players = parseNumber(next, '--players');
        i += 1;
        break;
      case '--games':
        options.games = parseNumber(next, '--games');
        i += 1;
        break;
      case '--rounds':
      case '--pairs':
        options.games = parseNumber(next, arg);
        i += 1;
        break;
      case '--final-games':
        options.finalGames = parseNumber(next, '--final-games');
        i += 1;
        break;
      case '--final-rounds':
      case '--final-pairs':
        options.finalGames = parseNumber(next, arg);
        i += 1;
        break;
      case '--top':
        options.top = parseNumber(next, '--top');
        i += 1;
        break;
      case '--max-turns':
        options.maxTurns = parseNumber(next, '--max-turns');
        i += 1;
        break;
      case '--max-steps-per-turn':
        options.maxStepsPerTurn = parseNumber(next, '--max-steps-per-turn');
        i += 1;
        break;
      case '--min-win-rate':
        options.minWinRate = parseNumber(next, '--min-win-rate');
        i += 1;
        break;
      case '--min-vp-delta':
        options.minVpDelta = parseNumber(next, '--min-vp-delta');
        i += 1;
        break;
      case '--output-json':
        options.outputJson = next;
        i += 1;
        break;
      case '--max-candidates':
        options.maxCandidates = parseNumber(next, '--max-candidates');
        i += 1;
        break;
      case '--workers':
        if (next.toLowerCase() === 'auto') {
          options.workers = 'auto';
        } else {
          options.workers = parseNumber(next, '--workers');
        }
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.candidatesDir) {
    throw new Error('--candidates-dir is required.');
  }
  if (
    !Number.isInteger(options.players) ||
    options.players < 2 ||
    options.players > 4
  ) {
    throw new Error('--players must be an integer from 2 to 4.');
  }
  if (!Number.isInteger(options.games) || options.games <= 0) {
    throw new Error('--games must be a positive integer.');
  }
  if (!Number.isInteger(options.finalGames) || options.finalGames <= 0) {
    throw new Error('--final-games must be a positive integer.');
  }
  if (!Number.isInteger(options.top) || options.top <= 0) {
    throw new Error('--top must be a positive integer.');
  }
  if (!Number.isInteger(options.maxTurns) || options.maxTurns <= 0) {
    throw new Error('--max-turns must be a positive integer.');
  }
  if (
    !Number.isInteger(options.maxStepsPerTurn) ||
    options.maxStepsPerTurn <= 0
  ) {
    throw new Error('--max-steps-per-turn must be a positive integer.');
  }
  if (options.minWinRate <= 0 || options.minWinRate >= 1) {
    throw new Error('--min-win-rate must be between 0 and 1 (exclusive).');
  }
  if (options.minVpDelta < 0) {
    throw new Error('--min-vp-delta must be >= 0.');
  }
  if (
    options.maxCandidates !== undefined &&
    (!Number.isInteger(options.maxCandidates) || options.maxCandidates <= 0)
  ) {
    throw new Error('--max-candidates must be a positive integer when provided.');
  }
  if (
    options.workers !== 'auto' &&
    (!Number.isInteger(options.workers) || options.workers <= 0)
  ) {
    throw new Error('--workers must be a positive integer or "auto".');
  }

  return options;
}

function getDetectedCpuCount(): number {
  if (typeof availableParallelism === 'function') {
    return availableParallelism();
  }
  return cpus().length;
}

function resolveWorkerCount(
  requestedWorkers: number | 'auto',
  maxTasks: number,
): number {
  if (maxTasks <= 0) {
    return 1;
  }
  if (requestedWorkers === 'auto') {
    const detected = getDetectedCpuCount();
    // Cap auto mode to avoid oversubscribing lightweight workloads.
    return Math.max(1, Math.min(maxTasks, detected, 8));
  }
  return Math.max(1, Math.min(maxTasks, requestedWorkers));
}

function getCandidateFiles(dir: string): string[] {
  const resolvedDir = resolve(dir);
  return readdirSync(resolvedDir)
    .filter((entry) => entry.toLowerCase().endsWith('.json'))
    .map((entry) => join(resolvedDir, entry))
    .sort((a, b) => a.localeCompare(b));
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
    clearMarginForA:
      winRateA >= options.minWinRate && meanDelta >= options.minVpDelta,
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
        : createBotStrategy(
            baselineCandidate,
            `baseline-b-${baselineCandidate.id}`,
          ),
    ]),
  );
  const participantKeyByPlayerId = Object.fromEntries(
    baseSetup.players.map((player) => [player.id, baseSetup.strategyByPlayerId[player.id]]),
  );
  const participantLabelByKey = {
    A: `A:${candidateA.name}`,
    B: `B:${baselineCandidate.name}`,
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

type WorkerQuickEvalRequest = {
  candidateFiles: string[];
  baselineCandidate: LoadedBotConfig;
  options: CliOptions;
};

type WorkerQuickEvalResponse = {
  results: CandidateResult[];
  profile: TournamentProfile;
};

async function evaluateQuickRoundParallel(
  candidateFiles: string[],
  baselineCandidate: LoadedBotConfig,
  options: CliOptions,
  profile: TournamentProfile,
  workerCount: number,
): Promise<CandidateResult[]> {
  if (workerCount <= 1) {
    return candidateFiles.map((file) =>
      evaluateCandidateFile(file, baselineCandidate, options, profile),
    );
  }

  const chunks: string[][] = Array.from({ length: workerCount }, () => []);
  candidateFiles.forEach((file, index) => {
    chunks[index % workerCount].push(file);
  });

  const pool = new Piscina({
    filename: new URL('./bot_tournament_worker.ts', import.meta.url).href,
    minThreads: workerCount,
    maxThreads: workerCount,
    execArgv: ['--import', 'tsx'],
  });

  const requests = chunks.filter((chunk) => chunk.length > 0).map((chunk) => ({
    candidateFiles: chunk,
    baselineCandidate,
    options,
  }));

  const responses = (await Promise.all(
    requests.map((request) => pool.run(request)),
  )) as WorkerQuickEvalResponse[];
  await pool.destroy();

  const allResults: CandidateResult[] = [];
  responses.forEach((response) => {
    mergeProfile(profile, response.profile);
    allResults.push(...response.results);
  });
  return allResults;
}

function sortResults(results: CandidateResult[]): CandidateResult[] {
  return [...results].sort(
    (a, b) =>
      (b.final?.winRateA ?? b.quick.winRateA) - (a.final?.winRateA ?? a.quick.winRateA) ||
      (b.final?.meanDelta ?? b.quick.meanDelta) - (a.final?.meanDelta ?? a.quick.meanDelta) ||
      a.name.localeCompare(b.name),
  );
}

function printRound(title: string, results: CandidateResult[], pickFinal: boolean): void {
  console.log('');
  console.log(title);
  console.log('Candidate                        WinRateA   VP Delta   AvgA     AvgB     Incomplete');
  console.log('-------------------------------------------------------------------------------');
  for (const result of results) {
    const summary = pickFinal && result.final ? result.final : result.quick;
    const row =
      `${result.name.padEnd(31)} ` +
      `${formatPercent(summary.winRateA).padStart(8)} ` +
      `${formatNum(summary.meanDelta).padStart(9)} ` +
      `${formatNum(summary.avgScoreA).padStart(8)} ` +
      `${formatNum(summary.avgScoreB).padStart(8)} ` +
      `${`${summary.incompleteGames}/${summary.totalGames}`.padStart(10)}`;
    console.log(row);
  }

  const withStalls = results.filter((result) => {
    const summary = pickFinal && result.final ? result.final : result.quick;
    return summary.stallOccurrences.length > 0;
  });
  if (withStalls.length > 0) {
    console.log('');
    console.log('Stall Reasons (All Occurrences)');
    withStalls.forEach((result) => {
      const summary = pickFinal && result.final ? result.final : result.quick;
      console.log(`- ${result.name}:`);
      summary.stallOccurrences.forEach((stall, index) => {
        console.log(
          `  ${index + 1}. round=${stall.round}, rotation=${stall.rotation}, reason=${stall.reason}`,
        );
      });
      Object.entries(summary.stallReasons).forEach(([reason, count]) => {
        console.log(`  summary: ${count}x ${reason}`);
      });
    });
  }
}

async function main(): Promise<void> {
  const totalStart = performance.now();
  const options = parseArgs(process.argv.slice(2));
  const profile = createTournamentProfile();
  const baselineCandidate = options.baselinePath
    ? loadConfigEntry(options.baselinePath)
    : {
        id: 'baseline-standard',
        name: 'baseline-standard',
        source: 'HEURISTIC_STANDARD_CONFIG',
        botType: 'heuristic' as const,
        config: HEURISTIC_STANDARD_CONFIG,
      };
  const candidateLoadStart = performance.now();
  const candidateFiles = getCandidateFiles(options.candidatesDir);
  profile.candidateLoadMs += performance.now() - candidateLoadStart;
  const limitedCandidateFiles =
    options.maxCandidates !== undefined
      ? candidateFiles.slice(0, options.maxCandidates)
      : candidateFiles;
  const resolvedWorkers = resolveWorkerCount(
    options.workers,
    limitedCandidateFiles.length,
  );
  if (limitedCandidateFiles.length === 0) {
    throw new Error(`No .json candidate files found in ${resolve(options.candidatesDir)}.`);
  }

  console.log('=== Bot Config Tournament ===');
  console.log(`Candidates directory: ${resolve(options.candidatesDir)}`);
  console.log(
    `Baseline: ${options.baselinePath ? resolve(options.baselinePath) : 'HEURISTIC_STANDARD_CONFIG'} (${baselineCandidate.botType})`,
  );
  console.log(`Players: ${options.players}`);
  console.log(`Quick games: ${options.games}`);
  console.log(`Final games: ${options.finalGames}`);
  console.log(`Top finalists: ${options.top}`);
  console.log(`Workers: ${options.workers} (resolved: ${resolvedWorkers})`);
  if (options.maxCandidates !== undefined) {
    console.log(
      `Candidate limit: ${options.maxCandidates} (of ${candidateFiles.length} total)`,
    );
  }

  const quickStart = performance.now();
  const quickResults: CandidateResult[] = await evaluateQuickRoundParallel(
    limitedCandidateFiles,
    baselineCandidate,
    options,
    profile,
    resolvedWorkers,
  );
  profile.quickRoundMs += performance.now() - quickStart;

  const rankedQuick = sortResults(quickResults);
  printRound('Quick Round Ranking', rankedQuick, false);

  const finalists = rankedQuick.slice(0, Math.min(options.top, rankedQuick.length));
  if (options.finalGames > options.games && finalists.length > 0) {
    const finalStart = performance.now();
    for (const finalist of finalists) {
      const finalistStart = performance.now();
      const candidate = loadConfigEntry(finalist.path);
      finalist.final = evaluateConfigVsBaseline(
        candidate,
        baselineCandidate,
        options.finalGames,
        options,
        profile,
      );
      const finalistElapsed = performance.now() - finalistStart;
      finalist.timingsMs = {
        ...finalist.timingsMs,
        final: finalistElapsed,
      };
    }
    profile.finalRoundMs += performance.now() - finalStart;
  }

  const finalRanked = sortResults(rankedQuick);
  const hasFinalRound = finalists.some((result) => Boolean(result.final));
  if (hasFinalRound) {
    printRound('Final Round Ranking', finalRanked, true);
  }

  const winner = finalRanked[0];
  const winnerSummary = winner.final ?? winner.quick;
  console.log('');
  console.log(`Winner: ${winner.name}`);
  console.log(`Clear margin vs baseline: ${winnerSummary.clearMarginForA ? 'Yes' : 'No'}`);
  if (winnerSummary.stallOccurrences.length > 0) {
    console.log('Winner run stall reasons:');
    Object.entries(winnerSummary.stallReasons).forEach(([reason, count]) => {
      console.log(`- ${count}x ${reason}`);
    });
  }

  profile.totalMs = performance.now() - totalStart;
  if (options.outputJson) {
    const outputPath = resolve(options.outputJson);
    writeFileSync(
      outputPath,
      JSON.stringify(
        {
          options,
          generatedAt: new Date().toISOString(),
          results: finalRanked,
          profile,
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log(`Wrote JSON: ${outputPath}`);
  }
  if (options.profile) {
    const gameComputeMs =
      profile.runHeadlessMs + profile.scoreSummaryMs + profile.postGameProcessingMs;
    const nonGameMs = Math.max(0, profile.totalMs - gameComputeMs);
    const pct = (value: number, total: number) =>
      total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';

    console.log('');
    console.log('=== Instrumentation ===');
    console.log(`Total time: ${formatNum(profile.totalMs)} ms`);
    console.log(
      `Games simulated: ${profile.gamesSimulated} (${profile.evaluateSingleGameCalls} evaluateSingleGame calls)`,
    );
    console.log(
      `runHeadlessBotMatch: ${formatNum(profile.runHeadlessMs)} ms (${pct(profile.runHeadlessMs, profile.totalMs)}%)`,
    );
    console.log(
      `getHeadlessScoreSummary: ${formatNum(profile.scoreSummaryMs)} ms (${pct(profile.scoreSummaryMs, profile.totalMs)}%)`,
    );
    console.log(
      `Post-game processing: ${formatNum(profile.postGameProcessingMs)} ms (${pct(profile.postGameProcessingMs, profile.totalMs)}%)`,
    );
    console.log(
      `Candidate file load: ${formatNum(profile.candidateLoadMs)} ms (${pct(profile.candidateLoadMs, profile.totalMs)}%)`,
    );
    console.log(
      `Quick round loop: ${formatNum(profile.quickRoundMs)} ms (${pct(profile.quickRoundMs, profile.totalMs)}%)`,
    );
    if (profile.finalRoundMs > 0) {
      console.log(
        `Final round loop: ${formatNum(profile.finalRoundMs)} ms (${pct(profile.finalRoundMs, profile.totalMs)}%)`,
      );
    }
    console.log(
      `Other/non-game time: ${formatNum(nonGameMs)} ms (${pct(nonGameMs, profile.totalMs)}%)`,
    );
  }
}
void main();

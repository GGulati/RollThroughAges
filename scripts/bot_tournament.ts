import { readdirSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import {
  createHeuristicBot,
  getHeadlessScoreSummary,
  HeuristicConfig,
  runHeadlessBotMatch,
} from '../src/game/bot/index.ts';
import { PlayerConfig } from '../src/game/index.ts';
import {
  average,
  formatNum,
  formatPercent,
  loadConfig,
  parseNumber,
} from './helpers.ts';

type StrategyLabel = 'A' | 'B';

type CliOptions = {
  candidatesDir: string;
  baselinePath?: string;
  players: number;
  rounds: number;
  finalRounds: number;
  top: number;
  maxTurns: number;
  maxStepsPerTurn: number;
  minWinRate: number;
  minVpDelta: number;
  outputJson?: string;
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
};

function printUsage(): void {
  console.log('Usage: npx tsx scripts/bot_tournament.ts --candidates-dir <dir> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --candidates-dir <dir>    Directory containing candidate *.json configs');
  console.log('  --baseline <path>         Baseline config JSON (default: standard config)');
  console.log('  --players <n>             Player count 2-4 (default: 2)');
  console.log('  --rounds <n>              Quick round count per candidate (default: 10)');
  console.log('  --final-rounds <n>        Final round count for top candidates (default: 30)');
  console.log('  --pairs <n>               Alias for --rounds (deprecated)');
  console.log('  --final-pairs <n>         Alias for --final-rounds (deprecated)');
  console.log('  --top <n>                 Number of candidates in final round (default: 3)');
  console.log('  --max-turns <n>           Max turns per game (default: 500)');
  console.log('  --max-steps-per-turn <n>  Max bot steps per turn (default: 300)');
  console.log('  --min-win-rate <0..1>     Clear margin win-rate threshold (default: 0.6)');
  console.log('  --min-vp-delta <n>        Clear margin VP threshold (default: 3)');
  console.log('  --output-json <path>      Write tournament results JSON');
  console.log('  --help                    Show help');
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    candidatesDir: '',
    players: 2,
    rounds: 10,
    finalRounds: 30,
    top: 3,
    maxTurns: 500,
    maxStepsPerTurn: 300,
    minWinRate: 0.6,
    minVpDelta: 3,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
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
      case '--rounds':
      case '--pairs':
        options.rounds = parseNumber(next, arg);
        i += 1;
        break;
      case '--final-rounds':
      case '--final-pairs':
        options.finalRounds = parseNumber(next, arg);
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
  if (!Number.isInteger(options.rounds) || options.rounds <= 0) {
    throw new Error('--rounds must be a positive integer.');
  }
  if (!Number.isInteger(options.finalRounds) || options.finalRounds <= 0) {
    throw new Error('--final-rounds must be a positive integer.');
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

  return options;
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

function evaluateSingleGame(
  players: PlayerConfig[],
  strategyByPlayerId: Record<string, StrategyLabel>,
  configA: HeuristicConfig,
  configB: HeuristicConfig,
  options: CliOptions,
): GameEvaluation {
  const strategyByPlayer = Object.fromEntries(
    players.map((player) => [
      player.id,
      strategyByPlayerId[player.id] === 'A'
        ? createHeuristicBot(configA, 'candidate-a')
        : createHeuristicBot(configB, 'baseline-b'),
    ]),
  );

  const result = runHeadlessBotMatch(players, {
    strategyByPlayerId: strategyByPlayer,
    maxTurns: options.maxTurns,
    maxStepsPerTurn: options.maxStepsPerTurn,
  });
  const summary = getHeadlessScoreSummary(result.finalGame);
  const scoresA: number[] = [];
  const scoresB: number[] = [];
  for (const entry of summary) {
    const strategy = strategyByPlayerId[entry.playerId];
    if (strategy === 'A') {
      scoresA.push(entry.total);
    } else if (strategy === 'B') {
      scoresB.push(entry.total);
    }
  }

  const averageScoreA = average(scoresA);
  const averageScoreB = average(scoresB);
  const delta = averageScoreA - averageScoreB;
  const winner: StrategyLabel | 'Tie' =
    delta > 0 ? 'A' : delta < 0 ? 'B' : 'Tie';

  return {
    averageScoreA,
    averageScoreB,
    deltaAminusB: delta,
    winner,
    completed: result.completed,
    turnsPlayed: result.turnsPlayed,
    stallReason: result.stallReason,
  };
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
  configA: HeuristicConfig,
  configB: HeuristicConfig,
  rounds: number,
  options: CliOptions,
): EvaluationSummary {
  const evaluations: GameEvaluation[] = [];
  const stallOccurrences: EvaluationSummary['stallOccurrences'] = [];
  for (let round = 1; round <= rounds; round += 1) {
    for (let rotation = 1; rotation <= options.players; rotation += 1) {
      const gameSetup = createPlayersForGame(options.players, rotation - 1);
      const evaluation = evaluateSingleGame(
        gameSetup.players,
        gameSetup.strategyByPlayerId,
        configA,
        configB,
        options,
      );
      evaluations.push(evaluation);
      if (!evaluation.completed) {
        stallOccurrences.push({
          round,
          rotation,
          reason: evaluation.stallReason ?? 'Unknown stall reason',
        });
      }
    }
  }

  return summarizeEvaluations(evaluations, options, stallOccurrences);
}

function sortResults(results: CandidateResult[]): CandidateResult[] {
  return [...results].sort(
    (a, b) =>
      (b.final?.meanDelta ?? b.quick.meanDelta) - (a.final?.meanDelta ?? a.quick.meanDelta) ||
      (b.final?.winRateA ?? b.quick.winRateA) - (a.final?.winRateA ?? a.quick.winRateA) ||
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

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const baselineConfig = loadConfig(options.baselinePath);
  const candidateFiles = getCandidateFiles(options.candidatesDir);
  if (candidateFiles.length === 0) {
    throw new Error(`No .json candidate files found in ${resolve(options.candidatesDir)}.`);
  }

  console.log('=== Bot Config Tournament ===');
  console.log(`Candidates directory: ${resolve(options.candidatesDir)}`);
  console.log(`Baseline: ${options.baselinePath ? resolve(options.baselinePath) : 'HEURISTIC_STANDARD_CONFIG'}`);
  console.log(`Players: ${options.players}`);
  console.log(`Quick rounds: ${options.rounds}`);
  console.log(`Final rounds: ${options.finalRounds}`);
  console.log(`Top finalists: ${options.top}`);

  const quickResults: CandidateResult[] = candidateFiles.map((file) => {
    const candidateConfig = loadConfig(file);
    const quick = evaluateConfigVsBaseline(
      candidateConfig,
      baselineConfig,
      options.rounds,
      options,
    );
    return {
      name: basename(file, '.json'),
      path: file,
      quick,
    };
  });

  const rankedQuick = sortResults(quickResults);
  printRound('Quick Round Ranking', rankedQuick, false);

  const finalists = rankedQuick.slice(0, Math.min(options.top, rankedQuick.length));
  if (options.finalRounds > options.rounds && finalists.length > 0) {
    for (const finalist of finalists) {
      const config = loadConfig(finalist.path);
      finalist.final = evaluateConfigVsBaseline(
        config,
        baselineConfig,
        options.finalRounds,
        options,
      );
    }
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

  if (options.outputJson) {
    const outputPath = resolve(options.outputJson);
    writeFileSync(
      outputPath,
      JSON.stringify(
        {
          options,
          generatedAt: new Date().toISOString(),
          results: finalRanked,
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log(`Wrote JSON: ${outputPath}`);
  }
}

main();

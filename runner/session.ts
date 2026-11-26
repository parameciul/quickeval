import type { RunSummary } from '../shared/runner.ts';
import type { RobotApi } from './api.ts';
import { RobotApiError } from './api.ts';
import type { ClaudeRunner } from './claude.ts';
import { log } from './log.ts';
import type { PrintTools } from './printTask.ts';
import type { TaskContext, TaskEnd } from './tasks.ts';
import type { WorkFolderOptions } from './workdir.ts';

// What every robot run shares, the teachers' run (run.ts) and the Quick Try
// run (runTry.ts): the budget, the heartbeat, the counts, the rules that stop
// it taking work, and the release of the lease with its summary.

// New work is taken for 2 hours; the GitHub job may last 180 minutes
// (.github/workflows/evaluate.yml), so the last task can still finish.
export const BUDGET_MS = 120 * 60_000;
export const HEARTBEAT_MS = 60_000;
// Tasks in a row that each counted an attempt before the run stops: when every
// Claude call fails (Claude cannot start its model, an outage), the run must
// not use up the attempts of a whole class, and GitHub must send an email.
export const FAILURES_IN_A_ROW = 3;

export interface RunOptions {
  api: RobotApi;
  claude: ClaudeRunner;
  runId: string;
  // The run's folder: the task folders go in it.
  root: string;
  workdir?: WorkFolderOptions;
  // The container and the site address for the print PDFs; none without it.
  print?: { tools: PrintTools; siteUrl: string };
  now?: () => number;
  budgetMs?: number;
  heartbeatMs?: number;
  // The Quick Try run: how long a free slot waits before it looks for work
  // again while another slot works (runTry.ts).
  idlePollMs?: number;
}

export interface RunReport {
  // Null when another run held the lease.
  summary: RunSummary | null;
  // 1 when someone must look: Claude refused the token, tasks failed in a
  // row, a program is missing, or the API failed.
  exitCode: number;
}

export type RunCounts = Omit<RunSummary, 'stop'>;
export type CountKey = 'exerciseLists' | 'graded' | 'analyses' | 'prints' | 'barems';

export interface RunSession {
  ctx: TaskContext;
  counts: RunCounts;
  // False once the run stops taking work: the budget is over, or a reason to
  // stop came (the first one wins).
  canTake(): boolean;
  stopTaking(reason: RunSummary['stop']): void;
  // Counts the end of a task, and stops the run at a limit, a refused login, a
  // lost lease, or FAILURES_IN_A_ROW tasks that counted an attempt.
  record(end: TaskEnd, done: CountKey): void;
  // Stops the heartbeat and gives the lease back with the summary.
  finish(failure: boolean): Promise<RunReport>;
}

// Starts the heartbeat of a run that holds its lease.
export function openSession(options: RunOptions, maxParallel: number): RunSession {
  const { api, runId } = options;
  const now = options.now ?? Date.now;
  log('run started', { run: runId, maxParallel });

  const ctx: TaskContext = { api, claude: options.claude, runId, root: options.root, workdir: options.workdir, print: options.print };
  const counts: RunCounts = { exerciseLists: 0, graded: 0, failed: 0, analyses: 0, prints: 0, barems: 0 };
  let stop: RunSummary['stop'] | null = null;
  // The first reason to stop wins.
  const stopTaking = (reason: RunSummary['stop']) => {
    if (!stop) {
      stop = reason;
      log('stops taking work', { run: runId, reason });
    }
  };
  const deadline = now() + (options.budgetMs ?? BUDGET_MS);
  const canTake = () => {
    if (!stop && now() >= deadline) stopTaking('budget');
    return !stop;
  };

  const heartbeat = setInterval(() => {
    api.heartbeat(runId).catch((err: unknown) => {
      if (err instanceof RobotApiError && err.code === 'lease_lost') stopTaking('lease_lost');
      else log('heartbeat failed', { run: runId, error: err instanceof RobotApiError ? err.code : 'unknown' });
    });
  }, options.heartbeatMs ?? HEARTBEAT_MS);

  let failuresInARow = 0;
  const record = (end: TaskEnd, done: CountKey) => {
    if (end === 'saved') counts[done] += 1;
    else if (end === 'failed' && done === 'graded') counts.failed += 1;
    else if (end === 'usage_limit' || end === 'claude_login' || end === 'lease_lost') stopTaking(end);
    // The limit guards Claude's attempts: a failed print PDF does not count.
    if (done === 'prints' && (end === 'retry' || end === 'failed')) return;
    failuresInARow = end === 'retry' || end === 'failed' ? failuresInARow + 1 : 0;
    if (failuresInARow >= FAILURES_IN_A_ROW) {
      log('failures in a row', { run: runId, tasks: failuresInARow });
      stopTaking('error');
    }
  };

  const finish = async (failure: boolean): Promise<RunReport> => {
    clearInterval(heartbeat);
    // A run that failed with no other reason to stop (a print image that
    // cannot be built) ends at an error, so no page starts it again every 15
    // minutes to fail the same way (claimRobotRestart).
    const summary: RunSummary = { ...counts, stop: stop ?? (failure ? 'error' : 'done') };
    try {
      await api.release(runId, summary);
    } catch (err) {
      log('release failed', { run: runId, error: err instanceof RobotApiError ? err.code : 'unknown' });
    }
    log('run ended', { run: runId, ...summary });
    return { summary, exitCode: failure || summary.stop === 'error' || summary.stop === 'claude_login' ? 1 : 0 };
  };

  return { ctx, counts, canTake, stopTaking, record, finish };
}

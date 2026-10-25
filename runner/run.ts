import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { RunSummary } from '../shared/runner.ts';
import type { RobotApi, RobotApiOptions } from './api.ts';
import { RobotApiError, robotApiFromEnv } from './api.ts';
import type { ClaudeRunner } from './claude.ts';
import { claudeRunner, claudeSettings } from './claude.ts';
import { log } from './log.ts';
import type { PrintTools } from './printTask.ts';
import { dockerTools, makePrint, PrintSetupError } from './printTask.ts';
import type { TaskContext, TaskEnd } from './tasks.ts';
import { analyzeClass, gradeSubmission, makeExerciseList } from './tasks.ts';
import type { WorkFolderOptions } from './workdir.ts';
import { removeFolder, runFolder } from './workdir.ts';

// One robot run (spec §12.2): take the lease, make the print PDFs and the exercise lists, grade
// the uploads with up to maxParallel Claude runs at once, write the class
// analyses, and give the lease back with a summary of counts.

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
}

export interface RunReport {
  // Null when another run held the lease.
  summary: RunSummary | null;
  // 1 when someone must look: Claude refused the token, tasks failed in a
  // row, a program is missing, or the API failed.
  exitCode: number;
}

export async function runRobot(options: RunOptions): Promise<RunReport> {
  const { api, runId } = options;
  const now = options.now ?? Date.now;
  const lease = await api.lease(runId);
  if (!lease.granted) {
    log('another run holds the lease', { run: runId });
    return { summary: null, exitCode: 0 };
  }
  log('run started', { run: runId, maxParallel: lease.maxParallel });

  const ctx: TaskContext = { api, claude: options.claude, runId, root: options.root, workdir: options.workdir, print: options.print };
  const counts = { exerciseLists: 0, graded: 0, failed: 0, analyses: 0, prints: 0 };
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
  const record = (end: TaskEnd, done: 'exerciseLists' | 'graded' | 'analyses' | 'prints') => {
    if (end === 'saved') counts[done] += 1;
    else if (end === 'failed' && done === 'graded') counts.failed += 1;
    else if (end === 'usage_limit' || end === 'claude_login' || end === 'lease_lost') stopTaking(end);
    // The limit guards Claude's attempts: a print PDF neither counts nor resets it.
    if (done === 'prints') return;
    failuresInARow = end === 'retry' || end === 'failed' ? failuresInARow + 1 : 0;
    if (failuresInARow >= FAILURES_IN_A_ROW) {
      log('failures in a row', { run: runId, tasks: failuresInARow });
      stopTaking('error');
    }
  };

  // Keeps up to maxParallel gradings running; a slot claims again as soon as
  // its grading ends, and stops when nothing is left to claim.
  const gradeAll = async (): Promise<number> => {
    let started = 0;
    const slot = async () => {
      try {
        while (canTake()) {
          const claim = await api.claim(runId);
          if (!claim) return;
          started += 1;
          record(await gradeSubmission(ctx, claim), 'graded');
        }
      } catch (err) {
        // The other slots take no new work either.
        stopTaking(err instanceof RobotApiError && err.code === 'lease_lost' ? 'lease_lost' : 'error');
        throw err;
      }
    };
    const slots = await Promise.allSettled(Array.from({ length: Math.max(1, lease.maxParallel) }, slot));
    // Every slot ended before an error goes up: no grading runs on after the run.
    for (const result of slots) if (result.status === 'rejected') throw result.reason;
    return started;
  };

  let failure = false;
  try {
    // An exercise list is tried once per run: a list that failed waits for
    // the next run, so one broken barem cannot use up the budget.
    const listsTried = new Set<number>();
    // The same for an analysis: one try per test and run.
    const analysesTried = new Set<number>();
    // The same for a print PDF. When the image cannot be built, the run makes
    // no print PDF at all.
    const printsTried = new Set<number>();
    const print = options.print;
    let printsOff = false;
    while (canTake()) {
      const tasks = await api.tasks();
      let started = 0;
      // The print PDFs first: the teacher waits for them, and they are quick.
      for (const testId of tasks.prints) {
        if (!print || printsOff || printsTried.has(testId) || !canTake()) continue;
        printsTried.add(testId);
        started += 1;
        try {
          record(await makePrint(ctx, print, testId), 'prints');
        } catch (err) {
          if (!(err instanceof PrintSetupError)) throw err;
          failure = true;
          printsOff = true;
          log('print setup failed', { run: runId });
        }
      }
      for (const testId of tasks.exerciseLists) {
        if (listsTried.has(testId) || !canTake()) continue;
        listsTried.add(testId);
        started += 1;
        record(await makeExerciseList(ctx, testId), 'exerciseLists');
      }
      if (canTake()) started += await gradeAll();
      // A test whose uploads are all graded now waits for its analysis: the
      // list of tasks is read again, after the gradings.
      if (canTake()) {
        for (const testId of (await api.tasks()).analyses) {
          if (analysesTried.has(testId) || !canTake()) continue;
          analysesTried.add(testId);
          started += 1;
          record(await analyzeClass(ctx, testId), 'analyses');
        }
      }
      // Nothing new to start: the work is done.
      if (started === 0) break;
    }
  } catch (err) {
    if (err instanceof RobotApiError && err.code === 'lease_lost') stopTaking('lease_lost');
    else {
      failure = true;
      stopTaking('error');
      log('run failed', { run: runId, error: err instanceof RobotApiError ? err.code : 'unknown' });
    }
  } finally {
    clearInterval(heartbeat);
  }

  const summary: RunSummary = { ...counts, stop: stop ?? 'done' };
  try {
    await api.release(runId, summary);
  } catch (err) {
    log('release failed', { run: runId, error: err instanceof RobotApiError ? err.code : 'unknown' });
  }
  log('run ended', { run: runId, ...summary });
  return { summary, exitCode: failure || summary.stop === 'error' || summary.stop === 'claude_login' ? 1 : 0 };
}

// A run id that the logs can tie to its GitHub run.
export function newRunId(env: Record<string, string | undefined>): string {
  const random = randomBytes(4).toString('hex');
  return env.GITHUB_RUN_ID ? `gh-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT ?? '1'}-${random}` : `local-${random}`;
}

export interface MainOptions extends RobotApiOptions {
  // Tests replace Claude, the skill folder, and the print container.
  claude?: ClaudeRunner;
  workdir?: WorkFolderOptions;
  printTools?: PrintTools;
}

// The robot step of the GitHub workflow: `node runner/run.ts`.
export async function main(env: Record<string, string | undefined>, options: MainOptions = {}): Promise<number> {
  const api = robotApiFromEnv(env, options);
  if (!api) {
    log('not set up: QUICKEVAL_URL or QUICKEVAL_RUNNER_KEY is missing');
    return 0;
  }
  if (!options.claude && !env.CLAUDE_CODE_OAUTH_TOKEN?.trim()) {
    log('not set up: CLAUDE_CODE_OAUTH_TOKEN is missing');
    return 1;
  }
  const runId = newRunId(env);
  const root = runFolder(env, runId);
  // Claude's settings folder sits next to the task folders, never inside one.
  const configDir = path.join(root, 'claude-config');
  await mkdir(configDir, { recursive: true });
  try {
    const claude = options.claude ?? claudeRunner(claudeSettings(env, configDir));
    // robotApiFromEnv found QUICKEVAL_URL; the image is built only when a print job waits.
    const print = { tools: options.printTools ?? dockerTools(), siteUrl: env.QUICKEVAL_URL!.trim() };
    const report = await runRobot({ api, claude, runId, root, workdir: options.workdir, print });
    return report.exitCode;
  } catch (err) {
    // The lease request failed: the API cannot be reached, or refused the key.
    log('run not started', { run: runId, error: err instanceof RobotApiError ? err.code : 'unknown' });
    return 1;
  } finally {
    await removeFolder(root);
  }
}

if (import.meta.main) {
  process.exitCode = await main(process.env);
}

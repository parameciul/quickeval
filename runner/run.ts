import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { RobotApiOptions } from './api.ts';
import { laneFromEnv, RobotApiError, robotApiFromEnv } from './api.ts';
import type { ClaudeRunner } from './claude.ts';
import { makeBarem } from './baremTask.ts';
import { claudeRunner, claudeSettings } from './claude.ts';
import { log } from './log.ts';
import type { PrintTools } from './printTask.ts';
import { dockerTools, makePrint, PrintSetupError } from './printTask.ts';
import { runTryRobot } from './runTry.ts';
import { openSession, type RunOptions, type RunReport } from './session.ts';
import { analyzeClass, gradeSubmission, makeExerciseList } from './tasks.ts';
import type { WorkFolderOptions } from './workdir.ts';
import { removeFolder, runFolder } from './workdir.ts';

export { BUDGET_MS, FAILURES_IN_A_ROW, HEARTBEAT_MS, type RunOptions, type RunReport } from './session.ts';

// One run of the teachers' robot (spec §12.2): take the lease, make the print
// PDFs, the generated barems and the exercise lists, grade the uploads with up
// to maxParallel Claude runs at once, write the class analyses, and give the
// lease back with a summary of counts. The Quick Try robot's run is runTry.ts.

export async function runRobot(options: RunOptions): Promise<RunReport> {
  const { api, runId } = options;
  const lease = await api.lease(runId);
  if (!lease.granted) {
    log('another run holds the lease', { run: runId });
    return { summary: null, exitCode: 0 };
  }
  const session = openSession(options, lease.maxParallel);
  const { ctx, canTake, stopTaking, record } = session;

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
    // A print PDF that failed but has attempts left is tried again in the next
    // round (the API fails it for good after 3 attempts): a slow first
    // LibreOffice start must not leave the teacher waiting for the next run.
    // Any other end is tried once per run. When the image cannot be built,
    // the run makes no print PDF at all.
    const printsTried = new Set<number>();
    // A barem is tried again in the next round only while it waits for another
    // attempt; any other end is tried once per run.
    const baremsTried = new Set<number>();
    // The CES variants' work, tried by the same rules as the class work.
    const cesPrintsTried = new Set<number>();
    const cesBaremsTried = new Set<number>();
    const cesListsTried = new Set<number>();
    const print = options.print;
    let printsOff = false;
    while (canTake()) {
      const tasks = await api.tasks();
      let started = 0;
      // The print PDFs first: the teacher waits for them, and they are quick.
      // An older API sends no print jobs, and no CES work.
      const prints = [
        ...(tasks.prints ?? []).map((testId) => ({ testId, variant: 'class' as const, tried: printsTried })),
        ...(tasks.cesPrints ?? []).map((testId) => ({ testId, variant: 'ces' as const, tried: cesPrintsTried })),
      ];
      for (const { testId, variant, tried } of prints) {
        if (!print || printsOff || tried.has(testId) || !canTake()) continue;
        started += 1;
        try {
          const end = await makePrint(ctx, print, testId, variant);
          if (end !== 'retry') tried.add(testId);
          record(end, 'prints');
        } catch (err) {
          if (!(err instanceof PrintSetupError)) throw err;
          failure = true;
          printsOff = true;
          log('print setup failed', { run: runId });
        }
      }
      // The generated barems next: the teacher waits for them too.
      const barems = [
        ...(tasks.barems ?? []).map((testId) => ({ testId, variant: 'class' as const, tried: baremsTried })),
        ...(tasks.cesBarems ?? []).map((testId) => ({ testId, variant: 'ces' as const, tried: cesBaremsTried })),
      ];
      for (const { testId, variant, tried } of barems) {
        if (tried.has(testId) || !canTake()) continue;
        started += 1;
        const end = await makeBarem(ctx, testId, variant);
        if (end !== 'retry') tried.add(testId);
        record(end, 'barems');
      }
      const lists = [
        ...tasks.exerciseLists.map((testId) => ({ testId, variant: 'class' as const, tried: listsTried })),
        ...(tasks.cesExerciseLists ?? []).map((testId) => ({ testId, variant: 'ces' as const, tried: cesListsTried })),
      ];
      for (const { testId, variant, tried } of lists) {
        if (tried.has(testId) || !canTake()) continue;
        tried.add(testId);
        started += 1;
        record(await makeExerciseList(ctx, testId, variant), 'exerciseLists');
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
  }
  return session.finish(failure);
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
    // QE_LANE=try: the Quick Try robot's job (its own lease, GitHub job and setting).
    const run = laneFromEnv(env) === 'try' ? runTryRobot : runRobot;
    const report = await run({ api, claude, runId, root, workdir: options.workdir, print });
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

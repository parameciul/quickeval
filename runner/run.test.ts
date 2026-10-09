import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { runIdSchema } from '../shared/runner.ts';
import type { ExerciseList, GradingResult } from '../shared/schemas.ts';
import { robotApi } from './api.ts';
import { main, newRunId, type RunOptions, runRobot } from './run.ts';
import { API_URL, evaluatingTest, fetchFrom, ROBOT_KEY, type RobotWorld } from './test/robotWorld.ts';
import { answer, problem, scriptedClaude, type ScriptedAnswer } from './test/scriptedClaude.ts';

const RUN = 'run-loop-0001';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HOOK = new URL('./test/refusePackages.mjs', import.meta.url).href;

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [{ id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 9, answer: '3/4', scoringNotes: '', topic: 'Fracții' }],
  notes: '',
};

const GRADING: GradingResult = {
  items: [{ exerciseId: 'I.1', points: 8, studentAnswer: '3/4', comment: 'Corect.', confidence: 'high', needsReview: false, reviewReason: '' }],
  unreadable: [],
  summary: 'Ai lucrat bine.',
  strengths: ['Fracții'],
  recommendations: ['Exersează.'],
};

let world: RobotWorld | undefined;
const folders: string[] = [];

afterEach(async () => {
  await world?.api.dispose();
  world = undefined;
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function folder(prefix: string): string {
  const made = mkdtempSync(path.join(tmpdir(), prefix));
  folders.push(made);
  return made;
}

function skill(): string {
  const dir = folder('qe-skill-');
  mkdirSync(path.join(dir, 'references'));
  writeFileSync(path.join(dir, 'SKILL.md'), '# skill');
  writeFileSync(path.join(dir, 'references', 'grading-rules.md'), '# rules');
  return dir;
}

// A test in evaluation with `uploads` uploads, maxParallel set, and the exercise list ready unless `list` is false.
async function setUp(uploads: number, maxParallel = 1, list = true): Promise<RobotWorld> {
  world = await evaluatingTest({ uploads, pages: 1 });
  await world.api.db.prepare("INSERT INTO settings (key, value) VALUES ('max_parallel_agents', ?)").bind(String(maxParallel)).run();
  if (list) {
    await world.api.db
      .prepare("UPDATE tests SET exercise_list_status = 'ready', exercise_list_json = ? WHERE id = ?")
      .bind(JSON.stringify(LIST), world.testId)
      .run();
  }
  return world;
}

function options(claude: ReturnType<typeof scriptedClaude>, extra: Partial<RunOptions> = {}): RunOptions {
  const api = robotApi(API_URL, ROBOT_KEY, { fetch: fetchFrom(world!.api), retryDelayMs: 0 });
  return { api, claude: claude.run, runId: RUN, root: folder('qe-run-'), workdir: { skillDir: skill() }, heartbeatMs: 60_000, ...extra };
}

const uploads = async () =>
  (await world!.api.db.prepare('SELECT status, attempts FROM submissions WHERE test_id = ? ORDER BY id').bind(world!.testId).all<{ status: string; attempts: number }>())
    .results;
const runner = () =>
  world!.api.db.prepare('SELECT run_id, last_run_summary FROM runner_state WHERE id = 1').first<{ run_id: string | null; last_run_summary: string | null }>();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const grades = (count: number): ScriptedAnswer[] => Array.from({ length: count }, () => answer(GRADING));

describe('runRobot', () => {
  it('makes the exercise list, grades every upload, and gives the lease back with the counts', async () => {
    await setUp(3, 2, false);
    const claude = scriptedClaude(answer(LIST), ...grades(3));
    const run = options(claude);
    const report = await runRobot(run);
    const summary = { exerciseLists: 1, graded: 3, failed: 0, analyses: 0, stop: 'done' };
    expect(report).toEqual({ summary, exitCode: 0 });
    expect(claude.calls.map((call) => call.task.mode)).toEqual(['exercise-list', 'grade', 'grade', 'grade']);
    expect((await uploads()).map((row) => row.status)).toEqual(['graded', 'graded', 'graded']);
    expect(await runner()).toEqual({ run_id: null, last_run_summary: JSON.stringify(summary) });
    const test = await world!.api.db.prepare('SELECT status FROM tests WHERE id = ?').bind(world!.testId).first<{ status: string }>();
    expect(test?.status).toBe('done');
    expect(readdirSync(run.root)).toEqual([]);
  });

  it('keeps at most maxParallel gradings running, and a free slot claims again at once', async () => {
    await setUp(4, 2);
    let running = 0;
    let most = 0;
    const waiting: (() => void)[] = [];
    // Each grading waits for a second one to run with it (or 5 s), so two
    // gradings overlap however slow the machine is.
    const paired: ScriptedAnswer = async () => {
      running += 1;
      most = Math.max(most, running);
      if (running >= 2) for (const go of waiting.splice(0)) go();
      else await Promise.race([new Promise<void>((go) => waiting.push(go)), sleep(5_000)]);
      await sleep(10);
      running -= 1;
      return answer(GRADING);
    };
    const claude = scriptedClaude(paired, paired, paired, paired);
    const report = await runRobot(options(claude));
    expect(report.summary).toMatchObject({ graded: 4, stop: 'done' });
    expect(most).toBe(2);
  });

  it('exits at once when another run holds the lease', async () => {
    await setUp(1);
    await world!.api.db.prepare("UPDATE runner_state SET run_id = 'run-loop-other', heartbeat_at = ? WHERE id = 1").bind(new Date().toISOString()).run();
    const claude = scriptedClaude();
    expect(await runRobot(options(claude))).toEqual({ summary: null, exitCode: 0 });
    expect(claude.calls).toHaveLength(0);
    expect((await runner())?.run_id).toBe('run-loop-other');
  });

  it('stops taking work at a usage limit, and the GitHub run does not fail', async () => {
    await setUp(3);
    const claude = scriptedClaude(problem('usage_limit'));
    const report = await runRobot(options(claude));
    expect(report).toEqual({ summary: { exerciseLists: 0, graded: 0, failed: 0, analyses: 0, stop: 'usage_limit' }, exitCode: 0 });
    expect(claude.calls).toHaveLength(1);
    expect(await uploads()).toEqual([
      { status: 'submitted', attempts: 0 },
      { status: 'submitted', attempts: 0 },
      { status: 'submitted', attempts: 0 },
    ]);
  });

  it('stops when Claude refuses the token, sends nothing, and fails the GitHub run', async () => {
    await setUp(1, 1, false);
    const claude = scriptedClaude(problem('not_logged_in'));
    const report = await runRobot(options(claude));
    expect(report).toEqual({ summary: { exerciseLists: 0, graded: 0, failed: 0, analyses: 0, stop: 'claude_login' }, exitCode: 1 });
    const list = await world!.api.db.prepare('SELECT exercise_list_status, exercise_list_attempts FROM tests WHERE id = ?').bind(world!.testId).first();
    expect(list).toEqual({ exercise_list_status: 'none', exercise_list_attempts: 0 });
    expect((await runner())?.run_id).toBeNull();
  });

  it('counts an upload that failed for good', async () => {
    await setUp(2);
    await world!.api.db.prepare('UPDATE submissions SET attempts = 2 WHERE id = ?').bind(world!.submissionIds[0]).run();
    const claude = scriptedClaude(answer(GRADING), problem('crash'));
    const report = await runRobot(options(claude));
    expect(report.summary).toEqual({ exerciseLists: 0, graded: 1, failed: 1, analyses: 0, stop: 'done' });
  });

  it('stops taking work when the heartbeat finds another run', async () => {
    await setUp(2);
    const claude = scriptedClaude(async () => {
      await world!.api.db.prepare("UPDATE runner_state SET run_id = 'run-loop-other' WHERE id = 1").run();
      await sleep(100);
      return answer(GRADING);
    });
    const report = await runRobot(options(claude, { heartbeatMs: 20 }));
    expect(report).toEqual({ summary: { exerciseLists: 0, graded: 1, failed: 0, analyses: 0, stop: 'lease_lost' }, exitCode: 0 });
    expect((await uploads()).map((row) => row.status)).toEqual(['graded', 'submitted']);
  });

  it('stops after three failures in a row, so a broken Claude cannot fail a whole class', async () => {
    await setUp(4);
    const claude = scriptedClaude(problem('crash'), problem('crash'), problem('crash'), problem('crash'));
    const report = await runRobot(options(claude));
    expect(report).toEqual({ summary: { exerciseLists: 0, graded: 0, failed: 0, analyses: 0, stop: 'error' }, exitCode: 1 });
    expect(claude.calls).toHaveLength(3);
    expect((await uploads()).map((row) => row.attempts)).toEqual([1, 1, 1, 0]);
  });

  it('tries an exercise list once per run', async () => {
    await setUp(1, 1, false);
    const claude = scriptedClaude(answer({ broken: true }), answer({ broken: true }));
    const report = await runRobot(options(claude));
    expect(report.summary).toEqual({ exerciseLists: 0, graded: 0, failed: 0, analyses: 0, stop: 'done' });
    expect(claude.calls).toHaveLength(2);
    const list = await world!.api.db.prepare('SELECT exercise_list_status, exercise_list_attempts FROM tests WHERE id = ?').bind(world!.testId).first();
    expect(list).toEqual({ exercise_list_status: 'none', exercise_list_attempts: 1 });
  });

  it('takes no new work after its budget, and ends the gradings that run', async () => {
    await setUp(2);
    let clock = 0;
    const claude = scriptedClaude(() => {
      clock += 2_000;
      return answer(GRADING);
    });
    const report = await runRobot(options(claude, { now: () => clock, budgetMs: 1_000 }));
    expect(report.summary).toEqual({ exerciseLists: 0, graded: 1, failed: 0, analyses: 0, stop: 'budget' });
    expect((await uploads()).map((row) => row.status)).toEqual(['graded', 'submitted']);
  });

  it('stops on an API failure, takes no new work in any slot, and fails the GitHub run', async () => {
    await setUp(3, 2);
    const claude = scriptedClaude(
      async () => {
        await world!.api.db.prepare("UPDATE settings SET value = 'another-hash' WHERE key = 'runner_key_hash'").run();
        return answer(GRADING);
      },
      async () => {
        await sleep(50);
        return answer(GRADING);
      },
    );
    const run = options(claude);
    const report = await runRobot(run);
    expect(report).toEqual({ summary: { exerciseLists: 0, graded: 0, failed: 0, analyses: 0, stop: 'error' }, exitCode: 1 });
    expect(claude.calls).toHaveLength(2);
    expect(readdirSync(run.root)).toEqual([]);
  });
});

describe('main', () => {
  it('does nothing while the robot is not set up', async () => {
    expect(await main({})).toBe(0);
  });

  it('needs the Claude token, and then takes no lease', async () => {
    await setUp(1);
    const env = { QUICKEVAL_URL: API_URL, QUICKEVAL_RUNNER_KEY: ROBOT_KEY };
    expect(await main(env, { fetch: fetchFrom(world!.api) })).toBe(1);
    expect((await runner())?.run_id).toBeNull();
  });

  it('runs in a folder under RUNNER_TEMP and removes it at the end', async () => {
    await setUp(1);
    const temp = folder('qe-runner-temp-');
    const env = { QUICKEVAL_URL: API_URL, QUICKEVAL_RUNNER_KEY: ROBOT_KEY, RUNNER_TEMP: temp, GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '1' };
    const claude = scriptedClaude(answer(GRADING));
    expect(await main(env, { fetch: fetchFrom(world!.api), retryDelayMs: 0, claude: claude.run, workdir: { skillDir: skill() } })).toBe(0);
    expect(claude.calls[0]!.task.cwd.startsWith(path.join(temp, 'qe', 'gh-42-1-'))).toBe(true);
    expect(readdirSync(path.join(temp, 'qe'))).toEqual([]);
    expect(JSON.parse((await runner())!.last_run_summary!)).toMatchObject({ graded: 1, stop: 'done' });
  });

  it('fails when the API cannot be reached', async () => {
    const env = { QUICKEVAL_URL: API_URL, QUICKEVAL_RUNNER_KEY: ROBOT_KEY, RUNNER_TEMP: folder('qe-runner-temp-') };
    const down = async () => {
      throw new TypeError('fetch failed');
    };
    expect(await main(env, { fetch: down, retryDelayMs: 0, claude: scriptedClaude().run })).toBe(1);
  });

  it('makes run ids that the API accepts', () => {
    expect(newRunId({ GITHUB_RUN_ID: '18234567890', GITHUB_RUN_ATTEMPT: '2' })).toMatch(/^gh-18234567890-2-[0-9a-f]{8}$/);
    expect(newRunId({})).toMatch(/^local-[0-9a-f]{8}$/);
    expect(runIdSchema.safeParse(newRunId({ GITHUB_RUN_ID: '18234567890' })).success).toBe(true);
    expect(runIdSchema.safeParse(newRunId({})).success).toBe(true);
  });

  it('runs with Node and zod alone: the workflow installs nothing else', () => {
    const env = { ...process.env, QUICKEVAL_URL: '', QUICKEVAL_RUNNER_KEY: '', QE_ALLOWED_PACKAGES: 'zod' };
    const run = spawnSync(process.execPath, ['--import', HOOK, 'runner/run.ts'], { cwd: ROOT, env, encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('not set up');
  });
});

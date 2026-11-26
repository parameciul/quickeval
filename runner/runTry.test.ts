import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setRobotKey } from '../server/test/fixtures.ts';
import { startTestApi, type TestApi } from '../server/test/testApi.ts';
import type { ExerciseList, GeneratedBarem, GradingResult } from '../shared/schemas.ts';
import { robotApi, robotApiFromEnv } from './api.ts';
import type { ClaudeOutcome } from './claude.ts';
import { runTryRobot } from './runTry.ts';
import type { RunOptions } from './session.ts';
import { addTry, API_URL, evaluatingTest, fetchFrom, ROBOT_KEY } from './test/robotWorld.ts';
import { answer, problem, scriptedClaude } from './test/scriptedClaude.ts';

// The Quick Try robot's run: only Quick Try work, up to "Încercări rapide
// deodată" tries at once, never one barem or list in two slots.

const RUN = 'try-run-0001';

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [{ id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 9, answer: '3/4', scoringNotes: '', topic: 'Fracții' }],
  notes: '',
};

const GRADING: GradingResult = {
  items: [{ exerciseId: 'I.1', points: 8, studentAnswer: '3/4', comment: 'Corect.', confidence: 'high', needsReview: false, reviewReason: '', page: 1, areas: [] }],
  unreadable: [],
  summary: 'Ai lucrat bine.',
  strengths: ['Fracții'],
  recommendations: ['Exersează.'],
};

const BAREM: GeneratedBarem = {
  title: 'Test',
  subtitle: 'Matematică',
  notes: [],
  total: 10,
  officePoints: 1,
  parts: [{ title: '', sections: [{ title: 'SUBIECTUL I', points: 9, items: [{ label: '1.', steps: [{ text: 'Totul.', points: 9 }] }] }] }],
};

let api: TestApi | undefined;
const folders: string[] = [];

afterEach(async () => {
  await api?.dispose();
  api = undefined;
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

const pandoc = async (args: string[], cwd: string) => {
  if (args.includes('docx')) writeFileSync(path.join(cwd, 'barem.docx'), 'PK\u0003\u0004 fake word');
};

async function tryApi(tries: number): Promise<TestApi> {
  api = await startTestApi();
  await setRobotKey(api);
  await api.db.prepare("INSERT INTO settings (key, value) VALUES ('max_parallel_tries', ?)").bind(String(tries)).run();
  return api;
}

function options(claude: ReturnType<typeof scriptedClaude>, requests: string[] = []): RunOptions {
  const inner = fetchFrom(api!);
  const robot = robotApi(API_URL, ROBOT_KEY, {
    fetch: (url, init) => {
      requests.push(`${init.method} ${url.slice(`${API_URL}/api/runner`.length)}`);
      return inner(url, init);
    },
    retryDelayMs: 0,
    lane: 'try',
  });
  return { api: robot, claude: claude.run, runId: RUN, root: folder('qe-try-'), workdir: { skillDir: skill(), pandoc }, heartbeatMs: 60_000, idlePollMs: 10 };
}

// Answers only once `count` Claude calls have started: two slots must be at
// work at the same time, or the test fails after a second.
function together(count: number, outcome: ClaudeOutcome) {
  let started = 0;
  let open: () => void = () => {};
  const all = new Promise<void>((resolve) => {
    open = resolve;
  });
  return async () => {
    started += 1;
    if (started === count) open();
    const late = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('the calls did not run at the same time')), 1000));
    await Promise.race([all, late]);
    return outcome;
  };
}

const paperStatus = (id: number) => api!.db.prepare('SELECT status FROM submissions WHERE id = ?').bind(id).first<{ status: string }>();

describe('runTryRobot', () => {
  it("makes a try's barem, and leaves the rest to the visitor's check", async () => {
    await tryApi(2);
    const made = await addTry(api!, 'requested');
    const claude = scriptedClaude(answer(BAREM));
    const report = await runTryRobot(options(claude));
    expect(report).toEqual({ summary: { exerciseLists: 0, graded: 0, failed: 0, analyses: 0, prints: 0, barems: 1, stop: 'done' }, exitCode: 0 });
    const row = await api!.db.prepare('SELECT barem_request, barem_unchecked FROM tests WHERE id = ?').bind(made.testId).first();
    expect(row).toEqual({ barem_request: 'none', barem_unchecked: 1 });
  });

  it("makes a try's list, then grades its paper", async () => {
    await tryApi(2);
    const made = await addTry(api!, 'own');
    const claude = scriptedClaude(answer(LIST), answer(GRADING));
    const report = await runTryRobot(options(claude));
    expect(report.summary).toEqual({ exerciseLists: 1, graded: 1, failed: 0, analyses: 0, prints: 0, barems: 0, stop: 'done' });
    expect(claude.calls.map((call) => call.task.mode)).toEqual(['exercise-list', 'grade']);
    expect((await paperStatus(made.submissionId))!.status).toBe('graded');
  });

  it('takes no teacher work', async () => {
    const world = await evaluatingTest({ uploads: 2, pages: 1 });
    api = world.api;
    await api.db.prepare("UPDATE tests SET exercise_list_status = 'ready', exercise_list_json = ? WHERE id = ?").bind(JSON.stringify(LIST), world.testId).run();
    await addTry(api, 'own');
    const requests: string[] = [];
    const claude = scriptedClaude(answer(LIST), answer(GRADING));
    const report = await runTryRobot(options(claude, requests));
    expect(report.summary).toMatchObject({ exerciseLists: 1, graded: 1, stop: 'done' });
    for (const id of world.submissionIds) expect((await paperStatus(id))!.status).toBe('submitted');
    expect(requests).toContain('POST /lease?lane=try');
    expect(requests).toContain('GET /tasks?lane=try');
    expect(requests).toContain('POST /claim?lane=try');
  });

  it('works on two tries at the same time with the setting at 2', async () => {
    await tryApi(2);
    await addTry(api!, 'requested');
    await addTry(api!, 'requested');
    const both = together(2, answer(BAREM));
    const claude = scriptedClaude(both, both);
    const report = await runTryRobot(options(claude));
    expect(report.summary).toMatchObject({ barems: 2, stop: 'done' });
  });

  it('takes a try that comes while another slot works, at once', async () => {
    await tryApi(2);
    await addTry(api!, 'requested');
    // The second try comes while the first try's barem is in Claude; its
    // barem must start before the first one ends, on the other slot.
    let secondStarted: () => void = () => {};
    const second = new Promise<void>((resolve) => {
      secondStarted = resolve;
    });
    const first = async () => {
      await addTry(api!, 'requested');
      const late = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('the second try waited for the first')), 1000));
      await Promise.race([second, late]);
      return answer(BAREM);
    };
    const claude = scriptedClaude(first, async () => {
      secondStarted();
      return answer(BAREM);
    });
    const report = await runTryRobot(options(claude));
    expect(report.summary).toMatchObject({ barems: 2, failed: 0, stop: 'done' });
  });

  it('tries a barem that waits for another attempt once more, then leaves it to the next run', async () => {
    await tryApi(2);
    await addTry(api!, 'requested');
    // Two attempts fail; the third (the last one) belongs to a later run, so
    // the run does not reach three failures in a row and stop at an error.
    const claude = scriptedClaude(problem('crash'), problem('crash'));
    const report = await runTryRobot(options(claude));
    expect(claude.calls).toHaveLength(2);
    expect(report).toEqual({ summary: { exerciseLists: 0, graded: 0, failed: 0, analyses: 0, prints: 0, barems: 0, stop: 'done' }, exitCode: 0 });
  });

  it('never gives one barem to two slots', async () => {
    await tryApi(3);
    await addTry(api!, 'requested');
    const claude = scriptedClaude(answer(BAREM));
    const report = await runTryRobot(options(claude));
    expect(report.summary).toMatchObject({ barems: 1, stop: 'done' });
    expect(claude.calls).toHaveLength(1);
  });

  it('never gives one exercise list to two slots', async () => {
    await tryApi(3);
    await addTry(api!, 'own');
    const claude = scriptedClaude(answer(LIST), answer(GRADING));
    const report = await runTryRobot(options(claude));
    expect(report.summary).toMatchObject({ exerciseLists: 1, graded: 1 });
    expect(claude.calls.map((call) => call.task.mode)).toEqual(['exercise-list', 'grade']);
  });

  it('stops all slots at a usage limit', async () => {
    await tryApi(2);
    await addTry(api!, 'requested');
    await addTry(api!, 'requested');
    await addTry(api!, 'requested');
    const limit = together(2, problem('usage_limit'));
    const claude = scriptedClaude(limit, limit);
    const report = await runTryRobot(options(claude));
    expect(report).toEqual({ summary: { exerciseLists: 0, graded: 0, failed: 0, analyses: 0, prints: 0, barems: 0, stop: 'usage_limit' }, exitCode: 0 });
    // The third try is not asked for after the limit.
    expect(claude.calls).toHaveLength(2);
  });

  it('gives the lease back with its summary', async () => {
    await tryApi(1);
    await addTry(api!, 'requested');
    await runTryRobot(options(scriptedClaude(answer(BAREM))));
    const rows = await api!.db.prepare('SELECT id, run_id, last_run_summary FROM runner_state ORDER BY id').all<{ id: number; run_id: string | null; last_run_summary: string | null }>();
    expect(rows.results[0]!.last_run_summary).toBeNull();
    expect(rows.results[1]!.run_id).toBeNull();
    expect(JSON.parse(rows.results[1]!.last_run_summary!)).toMatchObject({ barems: 1, stop: 'done' });
  });

  it('does nothing while another try run holds the lease', async () => {
    await tryApi(1);
    await addTry(api!, 'requested');
    await api!.request('POST', '/api/runner/lease?lane=try', { runId: 'other-try-run-1' }, { Authorization: `Bearer ${ROBOT_KEY}` });
    const claude = scriptedClaude();
    expect(await runTryRobot(options(claude))).toEqual({ summary: null, exitCode: 0 });
    expect(claude.calls).toHaveLength(0);
  });
});

describe('the robot lane from the environment', () => {
  it('names the try lane with QE_LANE=try, and none otherwise', async () => {
    const urls: string[] = [];
    const fetch = async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ granted: false, maxParallel: 1 }), { status: 200 });
    };
    const env = { QUICKEVAL_URL: API_URL, QUICKEVAL_RUNNER_KEY: ROBOT_KEY };
    await robotApiFromEnv({ ...env, QE_LANE: 'try' }, { fetch })!.lease(RUN);
    await robotApiFromEnv(env, { fetch })!.lease(RUN);
    await robotApiFromEnv({ ...env, QE_LANE: 'other' }, { fetch })!.lease(RUN);
    expect(urls).toEqual([`${API_URL}/api/runner/lease?lane=try`, `${API_URL}/api/runner/lease`, `${API_URL}/api/runner/lease`]);
  });
});

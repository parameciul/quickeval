import type { D1Database } from '@cloudflare/workers-types';
import type { Settings, TestDetail } from '../../shared/api.ts';
import { LANE_ROW, LEASE_STALE_MS, MAX_PARALLEL_AGENTS, MAX_PARALLEL_TRIES, runSummarySchema, type RobotLane, type RunSummary } from '../../shared/runner.ts';

// System-wide settings (spec §7.1). v1 has one teacher, so any teacher may
// change them.

const PARALLEL = 'max_parallel_agents';
// "Încercări rapide deodată": how many Quick Tries the try robot works on at once.
const PARALLEL_TRIES = 'max_parallel_tries';
const ROBOT_KEY_HASH = 'runner_key_hash';
const ROBOT_KEY_AT = 'runner_key_at';
const SHOW_MODEL = 'show_model_column';

export const DEFAULT_PARALLEL_AGENTS = 1;
export const DEFAULT_PARALLEL_TRIES = 2;

function parseParallel(raw: string | null): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= MAX_PARALLEL_AGENTS ? value : DEFAULT_PARALLEL_AGENTS;
}

function parseTries(raw: string | null): number {
  const value = Number(raw);
  return raw !== null && Number.isInteger(value) && value >= 1 && value <= MAX_PARALLEL_TRIES ? value : DEFAULT_PARALLEL_TRIES;
}

function parseSummary(raw: string | null): RunSummary | null {
  if (raw === null) return null;
  try {
    const parsed = runSummarySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function setValue(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .bind(key, value)
    .run();
}

export async function getSettings(db: D1Database, teacherId: number, now: string): Promise<Settings> {
  const row = await db
    .prepare(
      `SELECT (SELECT value FROM settings WHERE key = ?) AS parallel,
         (SELECT value FROM settings WHERE key = '${PARALLEL_TRIES}') AS tries,
         q.run_id AS try_run_id, q.heartbeat_at AS try_heartbeat_at, q.last_check_at AS try_last_check_at,
         q.last_run_finished_at AS try_last_run_finished_at, q.last_run_summary AS try_last_run_summary,
         EXISTS (SELECT 1 FROM settings WHERE key = ?) AS has_key,
         (SELECT value FROM settings WHERE key = ?) AS key_at,
         r.run_id, r.heartbeat_at, r.last_check_at, r.last_run_finished_at, r.last_run_summary,
         (SELECT MAX(s.graded_at) FROM submissions s JOIN tests t ON t.id = s.test_id WHERE t.teacher_id = ?) AS last_graded_at,
         (SELECT value FROM settings WHERE key = ?) AS show_model,
         (SELECT ev.model FROM evaluations ev JOIN submissions s ON s.id = ev.submission_id JOIN tests t ON t.id = s.test_id
            WHERE t.teacher_id = ? AND s.status = 'graded' ORDER BY ev.updated_at DESC, ev.id DESC LIMIT 1) AS grading_model,
         (SELECT ev.effort FROM evaluations ev JOIN submissions s ON s.id = ev.submission_id JOIN tests t ON t.id = s.test_id
            WHERE t.teacher_id = ? AND s.status = 'graded' ORDER BY ev.updated_at DESC, ev.id DESC LIMIT 1) AS grading_effort,
         (SELECT t.analysis_model FROM tests t WHERE t.teacher_id = ? AND t.analysis_model IS NOT NULL
            ORDER BY t.updated_at DESC, t.id DESC LIMIT 1) AS analysis_model,
         (SELECT t.analysis_effort FROM tests t WHERE t.teacher_id = ? AND t.analysis_model IS NOT NULL
            ORDER BY t.updated_at DESC, t.id DESC LIMIT 1) AS analysis_effort,
         (SELECT value FROM settings WHERE key = 'last_grading_model') AS kept_grading_model,
         (SELECT value FROM settings WHERE key = 'last_grading_effort') AS kept_grading_effort,
         (SELECT value FROM settings WHERE key = 'last_analysis_model') AS kept_analysis_model,
         (SELECT value FROM settings WHERE key = 'last_analysis_effort') AS kept_analysis_effort,
         (SELECT value FROM settings WHERE key = 'robot_model') AS configured_model,
         (SELECT value FROM settings WHERE key = 'robot_effort') AS configured_effort,
         (SELECT value FROM settings WHERE key = 'robot_settings_at') AS configured_at
       FROM runner_state r LEFT JOIN runner_state q ON q.id = ${LANE_ROW.try} WHERE r.id = ${LANE_ROW.main}`,
    )
    .bind(PARALLEL, ROBOT_KEY_HASH, ROBOT_KEY_AT, teacherId, SHOW_MODEL, teacherId, teacherId, teacherId, teacherId)
    .first<{
      parallel: string | null;
      tries: string | null;
      try_run_id: string | null;
      try_heartbeat_at: string | null;
      try_last_check_at: string | null;
      try_last_run_finished_at: string | null;
      try_last_run_summary: string | null;
      has_key: number;
      key_at: string | null;
      run_id: string | null;
      heartbeat_at: string | null;
      last_check_at: string | null;
      last_run_finished_at: string | null;
      last_run_summary: string | null;
      last_graded_at: string | null;
      show_model: string | null;
      grading_model: string | null;
      grading_effort: string | null;
      analysis_model: string | null;
      analysis_effort: string | null;
      kept_grading_model: string | null;
      kept_grading_effort: string | null;
      kept_analysis_model: string | null;
      kept_analysis_effort: string | null;
      configured_model: string | null;
      configured_effort: string | null;
      configured_at: string | null;
    }>();
  // A run is running while it holds the lease and its heartbeat is fresh.
  const status = (runId: string | null, heartbeatAt: string | null, lastCheckAt: string | null, finishedAt: string | null, summary: string | null) => {
    const heartbeat = heartbeatAt ? Date.parse(heartbeatAt) : Number.NaN;
    return {
      running: Boolean(runId) && Date.parse(now) - heartbeat < LEASE_STALE_MS,
      lastCheckAt,
      lastRunFinishedAt: finishedAt,
      lastRunSummary: parseSummary(summary),
    };
  };
  return {
    maxParallelAgents: parseParallel(row?.parallel ?? null),
    maxParallelTries: parseTries(row?.tries ?? null),
    hasRobotKey: row?.has_key === 1,
    robotKeyAt: row?.has_key === 1 ? (row.key_at ?? null) : null,
    robot: status(row?.run_id ?? null, row?.heartbeat_at ?? null, row?.last_check_at ?? null, row?.last_run_finished_at ?? null, row?.last_run_summary ?? null),
    tryRobot: status(
      row?.try_run_id ?? null,
      row?.try_heartbeat_at ?? null,
      row?.try_last_check_at ?? null,
      row?.try_last_run_finished_at ?? null,
      row?.try_last_run_summary ?? null,
    ),
    lastGradedAt: row?.last_graded_at ?? null,
    lastModels: {
      // The kept values are those of the last save; before they existed, the
      // latest rows stand in.
      gradingModel: row?.kept_grading_model ?? row?.grading_model ?? null,
      gradingEffort: row?.kept_grading_model ? (row.kept_grading_effort ?? null) : (row?.grading_effort ?? null),
      analysisModel: row?.kept_analysis_model ?? row?.analysis_model ?? null,
      analysisEffort: row?.kept_analysis_model ? (row.kept_analysis_effort ?? null) : (row?.analysis_effort ?? null),
    },
    showModelColumn: row?.show_model === '1',
    configuredModel: row?.configured_model ?? null,
    configuredEffort: row?.configured_effort ?? null,
    configuredAt: row?.configured_at ?? null,
  };
}

// The number of tasks a lane's run works on at once: papers for the teachers'
// robot, Quick Tries for the try robot.
export async function getMaxParallel(db: D1Database, lane: RobotLane = 'main'): Promise<number> {
  const key = lane === 'try' ? PARALLEL_TRIES : PARALLEL;
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  return lane === 'try' ? parseTries(row?.value ?? null) : parseParallel(row?.value ?? null);
}

export async function setMaxParallel(db: D1Database, value: number): Promise<void> {
  await setValue(db, PARALLEL, String(value));
}

export async function setMaxParallelTries(db: D1Database, value: number): Promise<void> {
  await setValue(db, PARALLEL_TRIES, String(value));
}

// The model column of the class report: one setting for all tests, off until
// the teacher turns it on.
export async function setShowModel(db: D1Database, show: boolean): Promise<void> {
  await setValue(db, SHOW_MODEL, show ? '1' : '0');
}

export async function getShowModel(db: D1Database): Promise<boolean> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(SHOW_MODEL).first<{ value: string }>();
  return row?.value === '1';
}

export async function getRobotKeyHash(db: D1Database): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(ROBOT_KEY_HASH).first<{ value: string }>();
  return row?.value ?? null;
}

// A new key replaces the old one at once: the old key stops working. Its
// time is kept with it, for "Făcută pe …" in Setări.
export async function setRobotKeyHash(db: D1Database, hash: string, now: string): Promise<void> {
  const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value');
  await db.batch([put.bind(ROBOT_KEY_HASH, hash), put.bind(ROBOT_KEY_AT, now)]);
}

// The robot on the test page. startFailed: GitHub did not take the last
// request to start the robot, no run checked in after it, and no run works now.
export async function testPageRobot(db: D1Database, now: string, lane: RobotLane = 'main'): Promise<TestDetail['robot']> {
  const row = await db
    .prepare('SELECT last_check_at, start_failed_at, run_id, heartbeat_at FROM runner_state WHERE id = ?')
    .bind(LANE_ROW[lane])
    .first<{ last_check_at: string | null; start_failed_at: string | null; run_id: string | null; heartbeat_at: string | null }>();
  const failedAt = row?.start_failed_at ?? null;
  const lastCheckAt = row?.last_check_at ?? null;
  // The same rule as Setări's "Robotul lucrează acum".
  const heartbeat = row?.heartbeat_at ? Date.parse(row.heartbeat_at) : Number.NaN;
  const running = Boolean(row?.run_id) && Date.parse(now) - heartbeat < LEASE_STALE_MS;
  const checkedSince = lastCheckAt !== null && failedAt !== null && lastCheckAt >= failedAt;
  return { lastCheckAt, startFailed: failedAt !== null && !checkedSince && !running };
}

// The time a request to start the robot was sent, when GitHub did not take
// it; null when GitHub took it.
export async function saveRobotStart(db: D1Database, failedAt: string | null, lane: RobotLane = 'main'): Promise<void> {
  await db.prepare('UPDATE runner_state SET start_failed_at = ? WHERE id = ?').bind(failedAt, LANE_ROW[lane]).run();
}

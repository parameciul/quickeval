import type { D1Database } from '@cloudflare/workers-types';
import type { Settings, TestDetail } from '../../shared/api.ts';
import { LEASE_STALE_MS, MAX_PARALLEL_AGENTS, runSummarySchema, type RunSummary } from '../../shared/runner.ts';

// System-wide settings (spec §7.1). v1 has one teacher, so any teacher may
// change them.

const PARALLEL = 'max_parallel_agents';
const ROBOT_KEY_HASH = 'runner_key_hash';
const SHOW_MODEL = 'show_model_column';

export const DEFAULT_PARALLEL_AGENTS = 1;

function parseParallel(raw: string | null): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= MAX_PARALLEL_AGENTS ? value : DEFAULT_PARALLEL_AGENTS;
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
         EXISTS (SELECT 1 FROM settings WHERE key = ?) AS has_key,
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
         (SELECT value FROM settings WHERE key = 'last_analysis_effort') AS kept_analysis_effort
       FROM runner_state r WHERE r.id = 1`,
    )
    .bind(PARALLEL, ROBOT_KEY_HASH, teacherId, SHOW_MODEL, teacherId, teacherId, teacherId, teacherId)
    .first<{
      parallel: string | null;
      has_key: number;
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
    }>();
  const heartbeat = row?.heartbeat_at ? Date.parse(row.heartbeat_at) : Number.NaN;
  return {
    maxParallelAgents: parseParallel(row?.parallel ?? null),
    hasRobotKey: row?.has_key === 1,
    robot: {
      running: Boolean(row?.run_id) && Date.parse(now) - heartbeat < LEASE_STALE_MS,
      lastCheckAt: row?.last_check_at ?? null,
      lastRunFinishedAt: row?.last_run_finished_at ?? null,
      lastRunSummary: parseSummary(row?.last_run_summary ?? null),
    },
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
  };
}

export async function getMaxParallel(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(PARALLEL).first<{ value: string }>();
  return parseParallel(row?.value ?? null);
}

export async function setMaxParallel(db: D1Database, value: number): Promise<void> {
  await setValue(db, PARALLEL, String(value));
}

// The model column of the class report: one setting for all tests, off until
// the teacher turns it on.
export async function setShowModel(db: D1Database, show: boolean): Promise<void> {
  await setValue(db, SHOW_MODEL, show ? '1' : '0');
}

export async function getRobotKeyHash(db: D1Database): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(ROBOT_KEY_HASH).first<{ value: string }>();
  return row?.value ?? null;
}

// A new key replaces the old one at once: the old key stops working.
export async function setRobotKeyHash(db: D1Database, hash: string): Promise<void> {
  await setValue(db, ROBOT_KEY_HASH, hash);
}

// The robot on the test page. startFailed: GitHub did not take the last
// request to start the robot, no run checked in after it, and no run works now.
export async function testPageRobot(db: D1Database, now: string): Promise<TestDetail['robot']> {
  const row = await db
    .prepare('SELECT last_check_at, start_failed_at, run_id, heartbeat_at FROM runner_state WHERE id = 1')
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
export async function saveRobotStart(db: D1Database, failedAt: string | null): Promise<void> {
  await db.prepare('UPDATE runner_state SET start_failed_at = ? WHERE id = 1').bind(failedAt).run();
}

import type { D1Database } from '@cloudflare/workers-types';
import type { Settings } from '../../shared/api.ts';
import { LEASE_STALE_MS, MAX_PARALLEL_AGENTS, runSummarySchema, type RunSummary } from '../../shared/runner.ts';

// System-wide settings (spec §7.1). v1 has one teacher, so any teacher may
// change them.

const PARALLEL = 'max_parallel_agents';
const ROBOT_KEY_HASH = 'runner_key_hash';

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
         (SELECT MAX(s.graded_at) FROM submissions s JOIN tests t ON t.id = s.test_id WHERE t.teacher_id = ?) AS last_graded_at
       FROM runner_state r WHERE r.id = 1`,
    )
    .bind(PARALLEL, ROBOT_KEY_HASH, teacherId)
    .first<{
      parallel: string | null;
      has_key: number;
      run_id: string | null;
      heartbeat_at: string | null;
      last_check_at: string | null;
      last_run_finished_at: string | null;
      last_run_summary: string | null;
      last_graded_at: string | null;
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
  };
}

export async function getMaxParallel(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(PARALLEL).first<{ value: string }>();
  return parseParallel(row?.value ?? null);
}

export async function setMaxParallel(db: D1Database, value: number): Promise<void> {
  await setValue(db, PARALLEL, String(value));
}

export async function getRobotKeyHash(db: D1Database): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(ROBOT_KEY_HASH).first<{ value: string }>();
  return row?.value ?? null;
}

// A new key replaces the old one at once: the old key stops working.
export async function setRobotKeyHash(db: D1Database, hash: string): Promise<void> {
  await setValue(db, ROBOT_KEY_HASH, hash);
}

export async function lastCheckAt(db: D1Database): Promise<string | null> {
  const row = await db.prepare('SELECT last_check_at FROM runner_state WHERE id = 1').first<{ last_check_at: string | null }>();
  return row?.last_check_at ?? null;
}

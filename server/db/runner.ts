import type { D1Database } from '@cloudflare/workers-types';
import type { ExerciseListInfo } from '../../shared/api.ts';
import { LEASE_STALE_MS, type CheckResult, type RobotError, type RobotTest, type RunSummary, type TasksResult } from '../../shared/runner.ts';
import type { CheckedExerciseList, ExerciseList } from '../../shared/schemas.ts';
import type { ExerciseListStatus } from '../../shared/tests.ts';
import { promoteStatements } from './lifecycle.ts';

// Queries of the robot API (spec §11.3). Each write checks its own rules in
// its SQL: runs can overlap, and parallel tasks of one run call at once.

// The time before which a heartbeat is stale.
export function staleBefore(now: string): string {
  return new Date(Date.parse(now) - LEASE_STALE_MS).toISOString();
}

// Work the robot can take now, as SQL conditions.
// A test in evaluation that waits for its exercise list.
export const NEEDS_EXERCISE_LIST = `t.status = 'evaluating' AND t.exercise_list_status = 'none'
  AND EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status = 'submitted')`;
// An upload (s) that can be graded: its test (t) is in evaluation with a usable exercise list.
export const GRADABLE = `s.status = 'submitted' AND t.status = 'evaluating' AND t.exercise_list_status IN ('ready', 'accepted')`;
// A test whose class analysis was asked for, with nothing left to grade.
export const NEEDS_ANALYSIS = `t.status = 'evaluating' AND t.analysis_status = 'requested'
  AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status IN ('submitted', 'grading'))`;

// The robot's regular check, in one transaction:
// - an upload left in grading by a run that died or ended goes back to the
//   queue, so no upload is lost when no new run takes the lease;
// - scheduled evaluations whose time has come start, and finished tests end;
// - the time of the check is saved for the robot line;
// - the counts say whether a run has work.
export async function runCheck(db: D1Database, now: string): Promise<CheckResult> {
  const results = await db.batch<{ exercise_lists: number; pending_grading: number; analyses: number }>([
    db
      .prepare(
        `UPDATE submissions SET status = 'submitted', run_id = NULL
         WHERE status = 'grading' AND NOT EXISTS (
           SELECT 1 FROM runner_state r WHERE r.id = 1 AND r.run_id = submissions.run_id AND r.heartbeat_at >= ?)`,
      )
      .bind(staleBefore(now)),
    ...promoteStatements(db, now),
    db.prepare('UPDATE runner_state SET last_check_at = ? WHERE id = 1').bind(now),
    db.prepare(
      `SELECT (SELECT COUNT(*) FROM tests t WHERE ${NEEDS_EXERCISE_LIST}) AS exercise_lists,
         (SELECT COUNT(*) FROM submissions s JOIN tests t ON t.id = s.test_id WHERE ${GRADABLE}) AS pending_grading,
         (SELECT COUNT(*) FROM tests t WHERE ${NEEDS_ANALYSIS}) AS analyses`,
    ),
  ]);
  const counts = results.at(-1)?.results[0];
  const exerciseLists = counts?.exercise_lists ?? 0;
  const pendingGrading = counts?.pending_grading ?? 0;
  const analyses = counts?.analyses ?? 0;
  return { hasWork: exerciseLists + pendingGrading + analyses > 0, exerciseLists, pendingGrading, analyses };
}

// The run holds the lease.
const HOLDS_LEASE = 'EXISTS (SELECT 1 FROM runner_state r WHERE r.id = 1 AND r.run_id = ?)';

// What the teacher reads when the robot gave up on a task.
export const ROBOT_ERROR_TEXT: Record<RobotError, string> = {
  timeout: 'Robotul nu a terminat la timp.',
  invalid_output: 'Robotul a dat un răspuns care nu poate fi folosit.',
  crash: 'Robotul s-a oprit cu o eroare.',
  usage_limit: 'Robotul a atins limita planului Claude.',
};

// A task fails for good after this many attempts.
export const MAX_ATTEMPTS = 3;

// Takes the lease when it is free, stale, or already this run's. A new lease
// means no other run is alive, so uploads left in grading by another run go
// back to the queue.
export async function takeLease(db: D1Database, runId: string, now: string): Promise<boolean> {
  const [taken] = await db.batch<{ run_id: string }>([
    db
      .prepare(
        `UPDATE runner_state SET run_id = ?, lease_acquired_at = ?, heartbeat_at = ?
         WHERE id = 1 AND (run_id IS NULL OR run_id = ? OR heartbeat_at IS NULL OR heartbeat_at < ?)
         RETURNING run_id`,
      )
      .bind(runId, now, now, runId, staleBefore(now)),
    db
      .prepare(
        `UPDATE submissions SET status = 'submitted', run_id = NULL
         WHERE status = 'grading' AND (run_id IS NULL OR run_id <> ?) AND ${HOLDS_LEASE}`,
      )
      .bind(runId, runId),
  ]);
  return Boolean(taken?.results.length);
}

// False when another run holds the lease now.
export async function heartbeat(db: D1Database, runId: string, now: string): Promise<boolean> {
  const row = await db
    .prepare('UPDATE runner_state SET heartbeat_at = ? WHERE id = 1 AND run_id = ? RETURNING id')
    .bind(now, runId)
    .first<{ id: number }>();
  return row !== null;
}

// Frees the lease and keeps the run's summary. False when the run no longer
// held the lease.
export async function releaseLease(db: D1Database, runId: string, summary: RunSummary, now: string): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE runner_state
       SET run_id = NULL, lease_acquired_at = NULL, heartbeat_at = NULL, last_run_finished_at = ?, last_run_summary = ?
       WHERE id = 1 AND run_id = ?
       RETURNING id`,
    )
    .bind(now, JSON.stringify(summary), runId)
    .first<{ id: number }>();
  return row !== null;
}

export async function listTasks(db: D1Database): Promise<TasksResult> {
  const [lists, grading, analyses] = await db.batch<{ id?: number; count?: number }>([
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_EXERCISE_LIST} ORDER BY t.evaluation_started_at, t.id`),
    db.prepare(`SELECT COUNT(*) AS count FROM submissions s JOIN tests t ON t.id = s.test_id WHERE ${GRADABLE}`),
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_ANALYSIS} ORDER BY t.id`),
  ]);
  const ids = (rows: { id?: number }[] | undefined) => (rows ?? []).map((row) => row.id!);
  return { exerciseLists: ids(lists?.results), pendingGrading: grading?.results[0]?.count ?? 0, analyses: ids(analyses?.results) };
}

export interface RobotTestRecord {
  test: RobotTest;
  // R2 keys: the robot never sees them.
  keys: { test: string | null; barem: string | null };
}

export async function findRobotTest(db: D1Database, testId: number): Promise<RobotTestRecord | null> {
  const row = await db
    .prepare('SELECT id, test_file_key, test_file_type, barem_file_key, barem_file_type, exercise_list_json FROM tests WHERE id = ?')
    .bind(testId)
    .first<{
      id: number;
      test_file_key: string | null;
      test_file_type: string | null;
      barem_file_key: string | null;
      barem_file_type: string | null;
      exercise_list_json: string | null;
    }>();
  if (!row) return null;
  const file = (key: string | null, type: string | null) => (key && type ? { contentType: type } : null);
  return {
    test: {
      id: row.id,
      files: { test: file(row.test_file_key, row.test_file_type), barem: file(row.barem_file_key, row.barem_file_type) },
      exerciseList: row.exercise_list_json ? (JSON.parse(row.exercise_list_json) as ExerciseList) : null,
    },
    keys: { test: row.test_file_key, barem: row.barem_file_key },
  };
}

// The exercise list is saved only for a test in evaluation that waits for
// it, and only from the run that holds the lease.
const WAITS_FOR_LIST = `id = ? AND status = 'evaluating' AND exercise_list_status = 'none' AND ${HOLDS_LEASE}`;

function listInfo(row: { exercise_list_status: ExerciseListStatus; exercise_list_message: string | null } | null): ExerciseListInfo | null {
  return row ? { status: row.exercise_list_status, message: row.exercise_list_message } : null;
}

// Null when the list was not saved.
export async function saveExerciseList(
  db: D1Database,
  testId: number,
  runId: string,
  checked: CheckedExerciseList,
  now: string,
): Promise<ExerciseListInfo | null> {
  const row = await db
    .prepare(
      `UPDATE tests SET exercise_list_json = ?, exercise_list_status = ?, exercise_list_message = ?, updated_at = ?
       WHERE ${WAITS_FOR_LIST}
       RETURNING exercise_list_status, exercise_list_message`,
    )
    .bind(JSON.stringify(checked.list), checked.status, checked.message, now, testId, runId)
    .first<{ exercise_list_status: ExerciseListStatus; exercise_list_message: string | null }>();
  return listInfo(row);
}

// The robot could not make the list: one more attempt is counted (none for a
// usage limit), and at MAX_ATTEMPTS the list fails with a message for the
// teacher. Null when nothing was saved.
export async function failExerciseList(
  db: D1Database,
  testId: number,
  runId: string,
  error: RobotError,
  now: string,
): Promise<ExerciseListInfo | null> {
  const counted = error === 'usage_limit' ? 0 : 1;
  const row = await db
    .prepare(
      `UPDATE tests SET exercise_list_attempts = exercise_list_attempts + ?,
         exercise_list_status = CASE WHEN exercise_list_attempts + ? >= ? THEN 'failed' ELSE 'none' END,
         exercise_list_message = CASE WHEN exercise_list_attempts + ? >= ? THEN ? ELSE NULL END,
         updated_at = ?
       WHERE ${WAITS_FOR_LIST}
       RETURNING exercise_list_status, exercise_list_message`,
    )
    .bind(counted, counted, MAX_ATTEMPTS, counted, MAX_ATTEMPTS, ROBOT_ERROR_TEXT[error], now, testId, runId)
    .first<{ exercise_list_status: ExerciseListStatus; exercise_list_message: string | null }>();
  return listInfo(row);
}

// Whether the run holds the lease now.
export async function holdsLease(db: D1Database, runId: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS held FROM runner_state WHERE id = 1 AND run_id = ?').bind(runId).first<{ held: number }>();
  return row !== null;
}

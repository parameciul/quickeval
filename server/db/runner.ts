import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { ExerciseListInfo } from '../../shared/api.ts';
import {
  LEASE_STALE_MS,
  type CheckResult,
  type ClaimResult,
  type ClassResults,
  type PrintJob,
  type RobotError,
  type RobotTest,
  type RunSummary,
  type TasksResult,
} from '../../shared/runner.ts';
import type { CheckedExerciseList, ClassAnalysis, ExerciseList, Grading } from '../../shared/schemas.ts';
import type { ExerciseListStatus } from '../../shared/tests.ts';
import { finishTests, promoteStatements } from './lifecycle.ts';
import { exerciseColumns, type StoredItem } from './exerciseColumns.ts';

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
// A test whose class analysis was asked for, with nothing left to grade and at
// least one graded upload to analyze.
export const NEEDS_ANALYSIS = `t.status = 'evaluating' AND t.analysis_status = 'requested'
  AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status IN ('submitted', 'grading'))
  AND EXISTS (SELECT 1 FROM submissions g WHERE g.test_id = t.id AND g.status = 'graded')`;
// A started test with a test file whose print PDF (the test with the QR code)
// is not made yet.
export const NEEDS_PRINT = "t.status = 'open' AND t.upload_token IS NOT NULL AND t.test_file_key IS NOT NULL AND t.print_status = 'none'";

// The state of the grades of a test: how many graded results there are and
// when the last one changed (a correction writes `evaluations.updated_at`, a
// regrade makes a new result). The robot reads it with the results and sends
// it back with the analysis, so an analysis made from grades that changed
// meanwhile is saved as out of date.
function gradesVersionSql(test: string): string {
  return `(SELECT COUNT(*) || ':' || COALESCE(MAX(ev.updated_at), '')
     FROM evaluations ev JOIN submissions gs ON gs.id = ev.submission_id
     WHERE gs.test_id = ${test}.id AND gs.status = 'graded')`;
}

// Whether the robot has work in this test, as its regular check counts it.
// An upload left in grading by a run that died counts too: the check sends
// it back to the queue.
export async function testHasRobotWork(db: D1Database, testId: number, now: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS found FROM tests t WHERE t.id = ? AND (
         (${NEEDS_EXERCISE_LIST})
         OR (${NEEDS_ANALYSIS})
         OR (${NEEDS_PRINT})
         OR EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND ${GRADABLE})
         OR EXISTS (
           SELECT 1 FROM submissions s
           WHERE s.test_id = t.id AND s.status = 'grading' AND t.status = 'evaluating'
             AND t.exercise_list_status IN ('ready', 'accepted')
             AND NOT EXISTS (SELECT 1 FROM runner_state r WHERE r.id = 1 AND r.run_id = s.run_id AND r.heartbeat_at >= ?)))`,
    )
    .bind(testId, staleBefore(now))
    .first<{ found: number }>();
  return row !== null;
}

// The robot's regular check, in one transaction:
// - an upload left in grading by a run that died or ended goes back to the
//   queue, so no upload is lost when no new run takes the lease;
// - scheduled evaluations whose time has come start, and finished tests end;
// - the time of the check is saved for the robot line;
// - the counts say whether a run has work.
export async function runCheck(
  db: D1Database,
  now: string,
  configured: { model?: string; effort?: string } = {},
): Promise<CheckResult> {
  const results = await db.batch<{ exercise_lists: number; pending_grading: number; analyses: number; prints: number }>([
    db
      .prepare(
        `UPDATE submissions SET status = 'submitted', run_id = NULL
         WHERE status = 'grading' AND NOT EXISTS (
           SELECT 1 FROM runner_state r WHERE r.id = 1 AND r.run_id = submissions.run_id AND r.heartbeat_at >= ?)`,
      )
      .bind(staleBefore(now)),
    ...promoteStatements(db, now),
    db.prepare('UPDATE runner_state SET last_check_at = ? WHERE id = 1').bind(now),
    ...configuredStatements(db, now, configured),
    db.prepare(
      `SELECT (SELECT COUNT(*) FROM tests t WHERE ${NEEDS_EXERCISE_LIST}) AS exercise_lists,
         (SELECT COUNT(*) FROM submissions s JOIN tests t ON t.id = s.test_id WHERE ${GRADABLE}) AS pending_grading,
         (SELECT COUNT(*) FROM tests t WHERE ${NEEDS_ANALYSIS}) AS analyses,
         (SELECT COUNT(*) FROM tests t WHERE ${NEEDS_PRINT}) AS prints`,
    ),
  ]);
  const counts = results.at(-1)?.results[0];
  const exerciseLists = counts?.exercise_lists ?? 0;
  const pendingGrading = counts?.pending_grading ?? 0;
  const analyses = counts?.analyses ?? 0;
  const prints = counts?.prints ?? 0;
  return { hasWork: exerciseLists + pendingGrading + analyses + prints > 0, exerciseLists, pendingGrading, analyses, prints };
}

// The model and effort the robot is set to use, kept for Setări. A robot that
// names neither (an older one) leaves what is kept; one that names a model
// without an effort removes the old effort.
function configuredStatements(db: D1Database, now: string, configured: { model?: string; effort?: string }) {
  if (configured.model === undefined && configured.effort === undefined) return [];
  const put = (key: string, value: string | undefined) =>
    value === undefined
      ? db.prepare('DELETE FROM settings WHERE key = ?').bind(key)
      : db
          .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
          .bind(key, value);
  return [put('robot_model', configured.model), put('robot_effort', configured.effort), put('robot_settings_at', now)];
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
  const [lists, grading, analyses, prints] = await db.batch<{ id?: number; count?: number }>([
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_EXERCISE_LIST} ORDER BY t.evaluation_started_at, t.id`),
    db.prepare(`SELECT COUNT(*) AS count FROM submissions s JOIN tests t ON t.id = s.test_id WHERE ${GRADABLE}`),
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_ANALYSIS} ORDER BY t.id`),
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_PRINT} ORDER BY t.started_at, t.id`),
  ]);
  const ids = (rows: { id?: number }[] | undefined) => (rows ?? []).map((row) => row.id!);
  return { exerciseLists: ids(lists?.results), pendingGrading: grading?.results[0]?.count ?? 0, analyses: ids(analyses?.results), prints: ids(prints?.results) };
}

export interface RobotTestRecord {
  test: RobotTest;
  // R2 keys: the robot never sees them.
  keys: { test: string | null; barem: string | null };
}

// A test in evaluation, the only kind the robot reads: a leaked robot key
// shows nothing of an open test or of one that is done.
export async function findRobotTest(db: D1Database, testId: number): Promise<RobotTestRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, files_version, test_file_key, test_file_type, barem_file_key, barem_file_type, barem_notes, exercise_list_json
       FROM tests WHERE id = ? AND status = 'evaluating'`,
    )
    .bind(testId)
    .first<{
      id: number;
      files_version: number;
      test_file_key: string | null;
      test_file_type: string | null;
      barem_file_key: string | null;
      barem_file_type: string | null;
      barem_notes: string | null;
      exercise_list_json: string | null;
    }>();
  if (!row) return null;
  const file = (key: string | null, type: string | null) => (key && type ? { contentType: type } : null);
  return {
    test: {
      id: row.id,
      filesVersion: row.files_version,
      files: { test: file(row.test_file_key, row.test_file_type), barem: file(row.barem_file_key, row.barem_file_type) },
      exerciseList: row.exercise_list_json ? (JSON.parse(row.exercise_list_json) as ExerciseList) : null,
      baremNotes: row.barem_notes ?? '',
    },
    keys: { test: row.test_file_key, barem: row.barem_file_key },
  };
}

// The test exists, in any status: tells a deleted test from a lost lease.
export async function testExists(db: D1Database, testId: number): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS found FROM tests WHERE id = ?').bind(testId).first<{ found: number }>();
  return row !== null;
}

// The exercise list is saved only for a test in evaluation that waits for
// it, only from the run that holds the lease, and only when the teacher did
// not replace a file after the robot read the test.
const WAITS_FOR_LIST = `id = ? AND files_version = ? AND status = 'evaluating' AND exercise_list_status = 'none' AND ${HOLDS_LEASE}`;

function listInfo(row: { exercise_list_status: ExerciseListStatus; exercise_list_message: string | null } | null): ExerciseListInfo | null {
  return row ? { status: row.exercise_list_status, message: row.exercise_list_message } : null;
}

// Null when the list was not saved.
export async function saveExerciseList(
  db: D1Database,
  testId: number,
  runId: string,
  filesVersion: number,
  checked: CheckedExerciseList,
  now: string,
): Promise<ExerciseListInfo | null> {
  const row = await db
    .prepare(
      `UPDATE tests SET exercise_list_json = ?, exercise_list_status = ?, exercise_list_message = ?, updated_at = ?
       WHERE ${WAITS_FOR_LIST}
       RETURNING exercise_list_status, exercise_list_message`,
    )
    .bind(JSON.stringify(checked.list), checked.status, checked.message, now, testId, filesVersion, runId)
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
  filesVersion: number,
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
    .bind(counted, counted, MAX_ATTEMPTS, counted, MAX_ATTEMPTS, ROBOT_ERROR_TEXT[error], now, testId, filesVersion, runId)
    .first<{ exercise_list_status: ExerciseListStatus; exercise_list_message: string | null }>();
  return listInfo(row);
}

// The print job of a test that waits for its print PDF, with what the route
// needs to read the test file and name the result. Null for any other test:
// the robot sees an open test only through this job.
export async function findPrintJob(
  db: D1Database,
  testId: number,
): Promise<{ job: PrintJob; testFileKey: string; teacherId: number; schoolYear: number; code: string; testFileName: string } | null> {
  const row = await db
    .prepare(
      `SELECT t.id, t.files_version, t.test_file_key, t.test_file_type, t.test_file_name, t.upload_token, t.teacher_id, t.code, c.school_year
       FROM tests t JOIN classes c ON c.id = t.class_id
       WHERE t.id = ? AND ${NEEDS_PRINT}`,
    )
    .bind(testId)
    .first<{
      id: number;
      files_version: number;
      test_file_key: string;
      test_file_type: string | null;
      test_file_name: string | null;
      upload_token: string;
      teacher_id: number;
      code: string;
      school_year: number;
    }>();
  if (!row || !row.test_file_type || !row.test_file_name) return null;
  return {
    job: { testId: row.id, filesVersion: row.files_version, contentType: row.test_file_type, uploadToken: row.upload_token },
    testFileKey: row.test_file_key,
    teacherId: row.teacher_id,
    schoolYear: row.school_year,
    code: row.code,
    testFileName: row.test_file_name,
  };
}

// A print PDF is saved or failed only for a test that still waits for it,
// only from the run that holds the lease, and only when the teacher did not
// replace the test file after the robot read it.
// The local engine refuses `UPDATE tests AS t`, so the writes name the table:
// the shared condition is used with `tests.` for its `t.`.
const WAITS_FOR_PRINT = `tests.id = ? AND tests.files_version = ? AND ${NEEDS_PRINT.replace(/\bt\./g, 'tests.')} AND ${HOLDS_LEASE}`;

// False when nothing was saved.
export async function savePrint(db: D1Database, testId: number, runId: string, filesVersion: number, key: string, now: string): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE tests SET print_status = 'ready', print_file_key = ?, updated_at = ?
       WHERE ${WAITS_FOR_PRINT}
       RETURNING id`,
    )
    .bind(key, now, testId, filesVersion, runId)
    .first<{ id: number }>();
  return row !== null;
}

// Whether the test's print PDF is stored under this key.
export async function printKeyIs(db: D1Database, testId: number, key: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS found FROM tests WHERE id = ? AND print_file_key = ?').bind(testId, key).first<{ found: number }>();
  return row !== null;
}

// The robot could not make the PDF: one more attempt is counted (none for a
// usage limit), and at MAX_ATTEMPTS the print fails and the teacher can try
// again. Null when nothing was saved.
export async function failPrint(
  db: D1Database,
  testId: number,
  runId: string,
  filesVersion: number,
  error: RobotError,
  now: string,
): Promise<'none' | 'failed' | null> {
  const counted = error === 'usage_limit' ? 0 : 1;
  const row = await db
    .prepare(
      `UPDATE tests SET print_attempts = print_attempts + ?,
         print_status = CASE WHEN print_attempts + ? >= ? THEN 'failed' ELSE 'none' END,
         updated_at = ?
       WHERE ${WAITS_FOR_PRINT}
       RETURNING print_status`,
    )
    .bind(counted, counted, MAX_ATTEMPTS, now, testId, filesVersion, runId)
    .first<{ print_status: 'none' | 'failed' }>();
  return row?.print_status ?? null;
}

// Whether the run holds the lease now.
export async function holdsLease(db: D1Database, runId: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS held FROM runner_state WHERE id = 1 AND run_id = ?').bind(runId).first<{ held: number }>();
  return row !== null;
}

// Takes the upload that waits longest among those with the fewest attempts,
// and marks it as this run's: an upload whose grading just failed waits for
// the others. One statement, so parallel claims never take the same upload. Null when there
// is none, or when the run does not hold the lease. A run never takes back an
// upload that a reopen took from it (reopenTest keeps that run's id): the
// run's old grading of it may still send a result, which must be refused.
export async function claimSubmission(db: D1Database, runId: string): Promise<ClaimResult | null> {
  const claimed = await db
    .prepare(
      `UPDATE submissions SET status = 'grading', run_id = ?
       WHERE id = (
           SELECT s.id FROM submissions s JOIN tests t ON t.id = s.test_id
           WHERE ${GRADABLE} AND (s.run_id IS NULL OR s.run_id <> ?)
           ORDER BY s.attempts, s.submitted_at, s.id LIMIT 1)
         AND status = 'submitted' AND ${HOLDS_LEASE}
       RETURNING id, test_id`,
    )
    .bind(runId, runId, runId)
    .first<{ id: number; test_id: number }>();
  if (!claimed) return null;
  const { results } = await db
    .prepare('SELECT id, content_type, position FROM submission_files WHERE submission_id = ? ORDER BY position, id')
    .bind(claimed.id)
    .all<{ id: number; content_type: string; position: number }>();
  return {
    submissionId: claimed.id,
    testId: claimed.test_id,
    files: results.map((row) => ({ id: row.id, contentType: row.content_type, position: row.position })),
  };
}

// The graded class for the analysis (spec §11.3). Null unless the test is in
// evaluation, like the rest of what the robot reads.
export async function findClassResults(db: D1Database, testId: number): Promise<ClassResults | null> {
  const [test, rows] = await db.batch<{
    exercise_list_json?: string | null;
    version?: string;
    exercise_id?: string;
    label?: string;
    max_points?: number;
    position?: number;
    evaluation_id?: number;
    graded_at?: string;
    max_total?: number;
    office_points?: number;
    submission_id?: number;
    total?: number;
    grade?: number;
    points?: number;
    student_answer?: string;
    comment?: string;
  }>([
    db
      .prepare(`SELECT t.exercise_list_json, ${gradesVersionSql('t')} AS version FROM tests t WHERE t.id = ? AND t.status = 'evaluating'`)
      .bind(testId),
    db
      .prepare(
        `SELECT s.id AS submission_id, ev.total, ev.grade, ev.id AS evaluation_id, ev.created_at AS graded_at,
           ev.max_total, ev.office_points, i.exercise_id, i.label, i.max_points, i.position, i.points,
           i.student_answer, i.comment
         FROM submissions s
         JOIN evaluations ev ON ev.submission_id = s.id
         JOIN evaluation_items i ON i.evaluation_id = ev.id
         WHERE s.test_id = ? AND s.status = 'graded'
         ORDER BY s.graded_at, s.id, i.position`,
      )
      .bind(testId),
  ]);
  const head = test?.results[0];
  if (!head) return null;
  const list = head.exercise_list_json ? (JSON.parse(head.exercise_list_json) as ExerciseList) : null;
  const students: ClassResults['students'] = [];
  const stored: StoredItem[] = [];
  let latest: { gradedAt: string; evaluationId: number; maxTotal: number; officePoints: number } | null = null;
  let current = -1;
  for (const row of rows?.results ?? []) {
    stored.push({
      evaluationId: row.evaluation_id!,
      gradedAt: row.graded_at!,
      exerciseId: row.exercise_id!,
      label: row.label!,
      maxPoints: row.max_points!,
      position: row.position!,
    });
    if (!latest || row.graded_at! > latest.gradedAt || (row.graded_at! === latest.gradedAt && row.evaluation_id! > latest.evaluationId)) {
      latest = { gradedAt: row.graded_at!, evaluationId: row.evaluation_id!, maxTotal: row.max_total!, officePoints: row.office_points! };
    }
    if (row.submission_id !== current) {
      current = row.submission_id!;
      students.push({ label: `Elev ${students.length + 1}`, total: row.total!, grade: row.grade!, items: [] });
    }
    students.at(-1)!.items.push({
      exerciseId: row.exercise_id!,
      points: row.points!,
      studentAnswer: row.student_answer!,
      comment: row.comment!,
    });
  }
  return {
    testId,
    version: head.version!,
    maxTotal: list?.totalPoints ?? latest?.maxTotal ?? 0,
    officePoints: list?.officePoints ?? latest?.officePoints ?? 0,
    exercises: exerciseColumns(list, stored),
    students,
  };
}

// The analysis is saved only for a test in evaluation that waits for it, only
// from the run that holds the lease, and only when every upload is graded: a
// regrade that came meanwhile makes the robot write it again afterwards.
const WAITS_FOR_ANALYSIS = `id = ? AND status = 'evaluating' AND analysis_status = 'requested' AND ${HOLDS_LEASE}`;

// What saveAnalysis checks, as the one condition of its UPDATE and of the
// settings it writes with it.
const ANALYSIS_SAVABLE = `${WAITS_FOR_ANALYSIS}
  AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = tests.id AND s.status IN ('submitted', 'grading'))
  AND EXISTS (SELECT 1 FROM submissions g WHERE g.test_id = tests.id AND g.status = 'graded')`;

// The model and effort of the last grading or analysis the robot saved, kept
// in the settings table for Setări. Written in the same batch as the save and
// under the save's own condition, so a refused save leaves them. No effort (or
// no model) removes its key, so Setări never shows an older one.
export function lastModelStatements(
  db: D1Database,
  prefix: 'grading' | 'analysis',
  condition: string,
  conditionBinds: unknown[],
  robot: { model: string | null; effort: string | null },
): D1PreparedStatement[] {
  const one = (name: 'model' | 'effort', value: string | null) => {
    const key = `last_${prefix}_${name}`;
    return value === null
      ? db.prepare(`DELETE FROM settings WHERE key = ? AND ${condition}`).bind(key, ...conditionBinds)
      : db
          .prepare(`INSERT INTO settings (key, value) SELECT ?, ? WHERE ${condition} ON CONFLICT (key) DO UPDATE SET value = excluded.value`)
          .bind(key, value, ...conditionBinds);
  };
  return [one('model', robot.model), one('effort', robot.effort)];
}

// Saves the analysis and ends the test when nothing else waits, in one batch.
// An analysis made from grades that changed since the robot read them is saved
// as out of date. False when it was not saved.
export async function saveAnalysis(
  db: D1Database,
  testId: number,
  runId: string,
  version: string,
  analysis: ClassAnalysis,
  now: string,
  robot: { model: string | null; effort: string | null } = { model: null, effort: null },
): Promise<boolean> {
  const [, , saved] = await db.batch<{ id: number }>([
    ...lastModelStatements(db, 'analysis', `EXISTS (SELECT 1 FROM tests WHERE ${ANALYSIS_SAVABLE})`, [testId, runId], robot),
    db
      .prepare(
        `UPDATE tests SET analysis_json = ?, analysis_status = 'ready', updated_at = ?,
           analysis_model = ?, analysis_effort = ?,
           analysis_stale = CASE WHEN ? = ${gradesVersionSql('tests')} THEN 0 ELSE 1 END
         WHERE ${ANALYSIS_SAVABLE}
         RETURNING id`,
      )
      .bind(JSON.stringify(analysis), now, robot.model, robot.effort, version, testId, runId),
    finishTests(db, now),
  ]);
  return Boolean(saved?.results.length);
}

// The robot could not write the analysis: one more attempt is counted (none
// for a usage limit), and at MAX_ATTEMPTS the analysis fails and the test
// ends without one. Null when nothing was saved.
export async function failAnalysis(
  db: D1Database,
  testId: number,
  runId: string,
  error: RobotError,
  now: string,
): Promise<'requested' | 'failed' | null> {
  const counted = error === 'usage_limit' ? 0 : 1;
  const [failed] = await db.batch<{ analysis_status: 'requested' | 'failed' }>([
    db
      .prepare(
        `UPDATE tests SET analysis_attempts = analysis_attempts + ?,
           analysis_status = CASE WHEN analysis_attempts + ? >= ? THEN 'failed' ELSE 'requested' END,
           updated_at = ?
         WHERE ${WAITS_FOR_ANALYSIS}
         RETURNING analysis_status`,
      )
      .bind(counted, counted, MAX_ATTEMPTS, now, testId, runId),
    finishTests(db, now),
  ]);
  return failed?.results[0]?.analysis_status ?? null;
}

// A page of an upload that is being graded: its key and type, never its name.
// Pages of any other upload stay out of the robot's reach.
export async function findRobotFile(db: D1Database, submissionId: number, fileId: number): Promise<{ key: string; contentType: string } | null> {
  const row = await db
    .prepare(
      `SELECT f.r2_key, f.content_type FROM submission_files f JOIN submissions s ON s.id = f.submission_id
       WHERE f.id = ? AND f.submission_id = ? AND s.status = 'grading'`,
    )
    .bind(fileId, submissionId)
    .first<{ r2_key: string; content_type: string }>();
  return row ? { key: row.r2_key, contentType: row.content_type } : null;
}

// An upload as the result route sees it, with the exercise list of its test.
export async function findGrading(
  db: D1Database,
  submissionId: number,
): Promise<{ status: string; runId: string | null; exerciseList: ExerciseList | null } | null> {
  const row = await db
    .prepare('SELECT s.status, s.run_id, t.exercise_list_json FROM submissions s JOIN tests t ON t.id = s.test_id WHERE s.id = ?')
    .bind(submissionId)
    .first<{ status: string; run_id: string | null; exercise_list_json: string | null }>();
  if (!row) return null;
  const exerciseList = row.exercise_list_json ? (JSON.parse(row.exercise_list_json) as ExerciseList) : null;
  return { status: row.status, runId: row.run_id, exerciseList };
}

// This run is grading the upload.
const GRADED_BY_RUN = "EXISTS (SELECT 1 FROM submissions s WHERE s.id = ? AND s.status = 'grading' AND s.run_id = ?)";

// Saves the grading, its items, and the graded upload in one transaction,
// with a fixed number of queries whatever the number of items. False when
// the upload is no longer this run's.
export async function saveGrading(
  db: D1Database,
  submissionId: number,
  runId: string,
  grading: Grading,
  raw: unknown,
  model: string,
  now: string,
  effort: string | null = null,
): Promise<boolean> {
  const items = JSON.stringify(
    grading.items.map((item) => ({ ...item, needsReview: item.needsReview ? 1 : 0 })),
  );
  const results = await db.batch([
    db.prepare(`DELETE FROM evaluations WHERE submission_id = ? AND ${GRADED_BY_RUN}`).bind(submissionId, submissionId, runId),
    db
      .prepare(
        `INSERT INTO evaluations (submission_id, max_total, office_points, total, grade, needs_review, summary,
           strengths_json, recommendations_json, unreadable_json, raw_json, model, effort, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${GRADED_BY_RUN}`,
      )
      .bind(
        submissionId,
        grading.maxTotal,
        grading.officePoints,
        grading.total,
        grading.grade,
        grading.needsReview ? 1 : 0,
        grading.summary,
        JSON.stringify(grading.strengths),
        JSON.stringify(grading.recommendations),
        JSON.stringify(grading.unreadable),
        JSON.stringify(raw),
        model,
        effort,
        now,
        now,
        submissionId,
        runId,
      ),
    db
      .prepare(
        `INSERT INTO evaluation_items (evaluation_id, exercise_id, position, label, max_points, ai_points, points,
           student_answer, comment, confidence, needs_review, review_reason)
         SELECT e.id, json_extract(j.value, '$.exerciseId'), json_extract(j.value, '$.position'), json_extract(j.value, '$.label'),
           json_extract(j.value, '$.maxPoints'), json_extract(j.value, '$.points'), json_extract(j.value, '$.points'),
           json_extract(j.value, '$.studentAnswer'), json_extract(j.value, '$.comment'), json_extract(j.value, '$.confidence'),
           json_extract(j.value, '$.needsReview'), json_extract(j.value, '$.reviewReason')
         FROM json_each(?) j JOIN evaluations e ON e.submission_id = ?
         WHERE ${GRADED_BY_RUN}`,
      )
      .bind(items, submissionId, submissionId, runId),
    ...lastModelStatements(db, 'grading', GRADED_BY_RUN, [submissionId, runId], { model, effort }),
    db
      .prepare(
        `UPDATE submissions SET status = 'graded', graded_at = ?, run_id = NULL, last_error = NULL
         WHERE id = ? AND status = 'grading' AND run_id = ?
         RETURNING id`,
      )
      .bind(now, submissionId, runId),
    finishTests(db, now),
  ]);
  return Boolean(results[5]?.results.length);
}

// The robot could not grade: the upload goes back to the queue with one more
// attempt (none for a usage limit), and fails at MAX_ATTEMPTS with a message
// for the teacher. Null when the upload is no longer this run's.
export async function failGrading(
  db: D1Database,
  submissionId: number,
  runId: string,
  error: RobotError,
  now: string,
): Promise<'submitted' | 'failed' | null> {
  const counted = error === 'usage_limit' ? 0 : 1;
  const [updated] = await db.batch<{ status: 'submitted' | 'failed' }>([
    db
      .prepare(
        `UPDATE submissions SET attempts = attempts + ?,
           status = CASE WHEN attempts + ? >= ? THEN 'failed' ELSE 'submitted' END,
           last_error = CASE WHEN attempts + ? >= ? THEN ? ELSE last_error END,
           run_id = NULL
         WHERE id = ? AND status = 'grading' AND run_id = ?
         RETURNING status`,
      )
      .bind(counted, counted, MAX_ATTEMPTS, counted, MAX_ATTEMPTS, ROBOT_ERROR_TEXT[error], submissionId, runId),
    finishTests(db, now),
  ]);
  return updated?.results[0]?.status ?? null;
}

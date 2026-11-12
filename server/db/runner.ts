import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { ExerciseListInfo } from '../../shared/api.ts';
import { DOCX_TYPE } from '../../shared/files.ts';
import {
  LEASE_STALE_MS,
  type CheckResult,
  type ClaimResult,
  type ClassResults,
  type BaremJob,
  type PrintJob,
  type RobotError,
  type RobotTest,
  type RunSummary,
  type TasksResult,
} from '../../shared/runner.ts';
import type { CheckedExerciseList, ClassAnalysis, ExerciseList, FoundSubject, Grading } from '../../shared/schemas.ts';
import type { ExerciseListStatus } from '../../shared/tests.ts';
import { compareStudentNames } from '../../shared/students.ts';
import { type DetectedSubject, unsupportedMessage } from '../../shared/subjects.ts';
import type { TestVariant } from '../../shared/files.ts';
import { askForAnalysis, finishTests, promoteStatements } from './lifecycle.ts';
import { exerciseColumns, type StoredItem } from './exerciseColumns.ts';
import { baremActiveSql, columns, needsBaremSql, needsPrintSql, paperVariantSql } from './variant.ts';

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
// An upload (alias `s`) of test `t` that can be graded: the test is in
// evaluation with a usable exercise list of the paper's variant. A CES paper
// also needs an active CES barem: until then it waits, sent, and the class
// papers are graded meanwhile.
function gradableSql(s: string): string {
  return `${s}.status = 'submitted' AND t.status = 'evaluating' AND CASE ${paperVariantSql(s, 't')}
    WHEN 'ces' THEN (${baremActiveSql('ces')} AND t.ces_exercise_list_status IN ('ready', 'accepted'))
    ELSE t.exercise_list_status IN ('ready', 'accepted') END`;
}
export const GRADABLE = gradableSql('s');
// A test whose class analysis was asked for, with nothing left to grade and at
// least one graded upload to analyze.
export const NEEDS_ANALYSIS = `t.status = 'evaluating' AND t.quick_try = 0 AND t.analysis_status = 'requested'
  AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status IN ('submitted', 'grading'))
  AND EXISTS (SELECT 1 FROM submissions g WHERE g.test_id = t.id AND g.status = 'graded')`;
// A draft or open test with an upload link and a test file whose print PDF
// (the test with the QR code) is not made yet. A test gets its link when it is
// made, so the teacher prints it before the day of the test and starts it on
// that day. Keep it a flat condition on the alias t: the print writes rewrite
// t. to tests.
export const NEEDS_PRINT = needsPrintSql('class');
// A draft or open test with a test file whose barem the teacher asked the robot
// to generate. Keep it a flat condition on the alias t.
export const NEEDS_BAREM = needsBaremSql('class');

// The CES variant's print PDF and generated barem, as NEEDS_PRINT and NEEDS_BAREM.
export const NEEDS_CES_PRINT = needsPrintSql('ces');
export const NEEDS_CES_BAREM = needsBaremSql('ces');
// A test in evaluation whose CES papers wait for the CES exercise list: the
// CES barem is active, and the class list is made (the CES list reuses its
// exercise ids).
export const NEEDS_CES_EXERCISE_LIST = `t.status = 'evaluating' AND t.ces_exercise_list_status = 'none' AND ${baremActiveSql('ces')}
  AND t.exercise_list_status IN ('ready', 'accepted')
  AND EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status = 'submitted' AND ${paperVariantSql('s', 't')} = 'ces')`;

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
         OR (${NEEDS_BAREM})
         OR (${NEEDS_CES_PRINT})
         OR (${NEEDS_CES_BAREM})
         OR (${NEEDS_CES_EXERCISE_LIST})
         OR EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND ${GRADABLE})
         OR EXISTS (
           SELECT 1 FROM submissions s
           WHERE s.test_id = t.id AND s.status = 'grading' AND t.status = 'evaluating'
             AND CASE s.variant WHEN 'ces' THEN t.ces_exercise_list_status ELSE t.exercise_list_status END IN ('ready', 'accepted')
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
  const results = await db.batch<{ exercise_lists: number; pending_grading: number; analyses: number; prints: number; barems: number; ces: number }>([
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
         (SELECT COUNT(*) FROM tests t WHERE ${NEEDS_PRINT}) AS prints,
         (SELECT COUNT(*) FROM tests t WHERE ${NEEDS_BAREM}) AS barems,
         (SELECT COUNT(*) FROM tests t WHERE (${NEEDS_CES_PRINT}) OR (${NEEDS_CES_BAREM}) OR (${NEEDS_CES_EXERCISE_LIST})) AS ces`,
    ),
  ]);
  const counts = results.at(-1)?.results[0];
  const exerciseLists = counts?.exercise_lists ?? 0;
  const pendingGrading = counts?.pending_grading ?? 0;
  const analyses = counts?.analyses ?? 0;
  const prints = counts?.prints ?? 0;
  const barems = counts?.barems ?? 0;
  const ces = counts?.ces ?? 0;
  return {
    hasWork: exerciseLists + pendingGrading + analyses + prints + barems + ces > 0,
    exerciseLists,
    pendingGrading,
    analyses,
    prints,
    barems,
    ces,
  };
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
  const [lists, grading, analyses, prints, barems, cesPrints, cesBarems, cesLists] = await db.batch<{ id?: number; count?: number }>([
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_EXERCISE_LIST} ORDER BY t.evaluation_started_at, t.id`),
    db.prepare(`SELECT COUNT(*) AS count FROM submissions s JOIN tests t ON t.id = s.test_id WHERE ${GRADABLE}`),
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_ANALYSIS} ORDER BY t.id`),
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_PRINT} ORDER BY t.created_at, t.id`),
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_BAREM} ORDER BY t.updated_at, t.id`),
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_CES_PRINT} ORDER BY t.created_at, t.id`),
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_CES_BAREM} ORDER BY t.updated_at, t.id`),
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_CES_EXERCISE_LIST} ORDER BY t.evaluation_started_at, t.id`),
  ]);
  const ids = (rows: { id?: number }[] | undefined) => (rows ?? []).map((row) => row.id!);
  return { exerciseLists: ids(lists?.results), pendingGrading: grading?.results[0]?.count ?? 0, analyses: ids(analyses?.results), prints: ids(prints?.results),
    barems: ids(barems?.results),
    cesPrints: ids(cesPrints?.results),
    cesBarems: ids(cesBarems?.results),
    cesExerciseLists: ids(cesLists?.results),
  };
}

export interface RobotTestRecord {
  test: RobotTest;
  // R2 keys: the robot never sees them.
  keys: { test: string | null; barem: string | null };
}

// A test in evaluation, the only kind the robot reads: a leaked robot key
// shows nothing of an open test or of one that is done. With `variant` "ces":
// the CES variant's files, list and comments, and the class list.
export async function findRobotTest(db: D1Database, testId: number, variant: TestVariant = 'class'): Promise<RobotTestRecord | null> {
  const c = columns(variant);
  const row = await db
    .prepare(
      `SELECT id, created_at, ${c('files_version')} AS files_version, ${c('test_file_key')} AS test_file_key, ${c('test_file_type')} AS test_file_type,
         ${c('barem_file_key')} AS barem_file_key, ${c('barem_file_type')} AS barem_file_type, ${c('barem_notes')} AS barem_notes,
         ${c('exercise_list_json')} AS exercise_list_json, exercise_list_json AS class_list_json, subject
       FROM tests WHERE id = ? AND status = 'evaluating'`,
    )
    .bind(testId)
    .first<{
      id: number;
      created_at: string;
      files_version: number;
      test_file_key: string | null;
      test_file_type: string | null;
      barem_file_key: string | null;
      barem_file_type: string | null;
      barem_notes: string | null;
      exercise_list_json: string | null;
      class_list_json: string | null;
      subject: DetectedSubject | null;
    }>();
  if (!row) return null;
  const file = (key: string | null, type: string | null) => (key && type ? { contentType: type } : null);
  const list = (json: string | null) => (json ? (JSON.parse(json) as ExerciseList) : null);
  return {
    test: {
      id: row.id,
      createdAt: row.created_at,
      filesVersion: row.files_version,
      files: { test: file(row.test_file_key, row.test_file_type), barem: file(row.barem_file_key, row.barem_file_type) },
      exerciseList: list(row.exercise_list_json),
      baremNotes: row.barem_notes ?? '',
      subject: row.subject,
      ...(variant === 'ces' ? { variant, classExerciseList: list(row.class_list_json) } : {}),
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
// not replace a file after the robot read the test. It also names the test by
// the time it was made: ids of deleted tests come back (no AUTOINCREMENT), so
// an answer made for a deleted test must not land in the next one with its id.
// `(? IS NULL OR created_at = ?)` takes the time twice; an older robot sends none.
// The list of the CES variant names its own files version.
// With `first`, the parameters are numbered from it (id, files version,
// creation time once, run id), for a statement that numbers its own.
const waitsForList = (variant: TestVariant, first?: number) => {
  const c = columns(variant);
  if (first !== undefined) {
    const [id, version, made, run] = [first, first + 1, first + 2, first + 3].map((n) => `?${n}`);
    return `id = ${id} AND ${c('files_version')} = ${version} AND (${made} IS NULL OR created_at = ${made}) AND status = 'evaluating'
      AND ${c('exercise_list_status')} = 'none' AND EXISTS (SELECT 1 FROM runner_state r WHERE r.id = 1 AND r.run_id = ${run})`;
  }
  return `id = ? AND ${c('files_version')} = ? AND (? IS NULL OR created_at = ?) AND status = 'evaluating' AND ${c('exercise_list_status')} = 'none' AND ${HOLDS_LEASE}`;
};

function listInfo(row: { exercise_list_status: ExerciseListStatus; exercise_list_message: string | null } | null): ExerciseListInfo | null {
  return row ? { status: row.exercise_list_status, message: row.exercise_list_message } : null;
}

// The robot may write the subject it found while the test has none, or has
// only the `alta` of an earlier look (the teacher then changed a file). A
// subject the teacher set is never overwritten.
export const SUBJECT_OPEN = "(subject IS NULL OR (subject = 'alta' AND subject_by = 'robot'))";

// The SET part that saves the subject `?1` (a value, or NULL for an older
// robot's answer) and its name `?2`, under SUBJECT_OPEN. SQLite reads every
// right side before it writes, so all of them see the old row.
const SAVE_SUBJECT = `subject = CASE WHEN ${SUBJECT_OPEN} AND ?1 IS NOT NULL THEN ?1 ELSE subject END,
  subject_name = CASE WHEN ${SUBJECT_OPEN} AND ?1 IS NOT NULL THEN ?2 ELSE subject_name END,
  subject_by = CASE WHEN ${SUBJECT_OPEN} AND ?1 IS NOT NULL THEN 'robot' ELSE subject_by END`;

// The test's subject after SAVE_SUBJECT is `alta`: nothing is graded.
const ENDS_UNSUPPORTED = `(CASE WHEN ${SUBJECT_OPEN} AND ?1 IS NOT NULL THEN ?1 ELSE subject END) = 'alta'`;

// Null when the list was not saved. The class list also saves the subject
// that the robot found: one that is not graded (`alta`) ends the list as
// failed, with the message that names it, so nothing is graded and a Quick
// Try gives its place back (the column's CHECK has no other state for it).
// The CES list leaves the subject alone.
export async function saveExerciseList(
  db: D1Database,
  testId: number,
  runId: string,
  filesVersion: number,
  createdAt: string | null,
  checked: CheckedExerciseList,
  now: string,
  variant: TestVariant = 'class',
): Promise<ExerciseListInfo | null> {
  const c = columns(variant);
  const found = variant === 'class' ? checked.subject : null;
  const ending =
    variant === 'class'
      ? `${c('exercise_list_status')} = CASE WHEN ${ENDS_UNSUPPORTED} THEN 'failed' ELSE ?3 END,
         ${c('exercise_list_message')} = CASE WHEN ${ENDS_UNSUPPORTED} THEN ?4 ELSE ?5 END,
         ${SAVE_SUBJECT},`
      : `${c('exercise_list_status')} = ?3, ${c('exercise_list_message')} = ?5,`;
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('exercise_list_json')} = ?6, ${ending} updated_at = ?7
       WHERE ${waitsForList(variant, 8)}
       RETURNING ${c('exercise_list_status')} AS exercise_list_status, ${c('exercise_list_message')} AS exercise_list_message`,
    )
    .bind(
      found?.value ?? null,
      found?.name ?? '',
      checked.status,
      unsupportedMessage(found?.name ?? ''),
      checked.message,
      JSON.stringify(checked.list),
      now,
      testId,
      filesVersion,
      createdAt,
      runId,
    )
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
  createdAt: string | null,
  error: RobotError,
  now: string,
  variant: TestVariant = 'class',
): Promise<ExerciseListInfo | null> {
  const counted = error === 'usage_limit' ? 0 : 1;
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('exercise_list_attempts')} = ${c('exercise_list_attempts')} + ?,
         ${c('exercise_list_status')} = CASE WHEN ${c('exercise_list_attempts')} + ? >= ? THEN 'failed' ELSE 'none' END,
         ${c('exercise_list_message')} = CASE WHEN ${c('exercise_list_attempts')} + ? >= ? THEN ? ELSE NULL END,
         updated_at = ?
       WHERE ${waitsForList(variant)}
       RETURNING ${c('exercise_list_status')} AS exercise_list_status, ${c('exercise_list_message')} AS exercise_list_message`,
    )
    .bind(counted, counted, MAX_ATTEMPTS, counted, MAX_ATTEMPTS, ROBOT_ERROR_TEXT[error], now, testId, filesVersion, createdAt, createdAt, runId)
    .first<{ exercise_list_status: ExerciseListStatus; exercise_list_message: string | null }>();
  return listInfo(row);
}

// The print job of a test that waits for its print PDF, with what the route
// needs to read the test file and name the result. Null for any other test:
// the robot sees a draft or open test only through this job. The CES print
// carries the same upload link as the class print.
export async function findPrintJob(
  db: D1Database,
  testId: number,
  variant: TestVariant = 'class',
): Promise<{ job: PrintJob; testFileKey: string; teacherId: number; schoolYear: number; code: string; testFileName: string } | null> {
  const v = columns(variant);
  const row = await db
    .prepare(
      `SELECT t.id, t.created_at, t.${v('files_version')} AS files_version, t.${v('test_file_key')} AS test_file_key,
         t.${v('test_file_type')} AS test_file_type, t.${v('test_file_name')} AS test_file_name, t.upload_token, t.teacher_id, t.code, c.school_year
       FROM tests t JOIN classes c ON c.id = t.class_id
       WHERE t.id = ? AND ${needsPrintSql(variant)}`,
    )
    .bind(testId)
    .first<{
      id: number;
      created_at: string;
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
    job: { testId: row.id, createdAt: row.created_at, filesVersion: row.files_version, contentType: row.test_file_type, uploadToken: row.upload_token },
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
// Like the list, a print names the test by the time it was made.
const waitsForPrint = (variant: TestVariant) =>
  `tests.id = ? AND tests.${columns(variant)('files_version')} = ? AND (? IS NULL OR tests.created_at = ?) AND ${needsPrintSql(variant, 'tests')} AND ${HOLDS_LEASE}`;

// False when nothing was saved.
export async function savePrint(
  db: D1Database,
  testId: number,
  runId: string,
  filesVersion: number,
  createdAt: string | null,
  key: string,
  now: string,
  variant: TestVariant = 'class',
): Promise<boolean> {
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('print_status')} = 'ready', ${c('print_file_key')} = ?, updated_at = ?
       WHERE ${waitsForPrint(variant)}
       RETURNING id`,
    )
    .bind(key, now, testId, filesVersion, createdAt, createdAt, runId)
    .first<{ id: number }>();
  return row !== null;
}

// Whether the variant's print PDF is stored under this key.
export async function printKeyIs(db: D1Database, testId: number, key: string, variant: TestVariant = 'class'): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS found FROM tests WHERE id = ? AND ${columns(variant)('print_file_key')} = ?`)
    .bind(testId, key)
    .first<{ found: number }>();
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
  createdAt: string | null,
  error: RobotError,
  now: string,
  variant: TestVariant = 'class',
): Promise<'none' | 'failed' | null> {
  const counted = error === 'usage_limit' ? 0 : 1;
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('print_attempts')} = ${c('print_attempts')} + ?,
         ${c('print_status')} = CASE WHEN ${c('print_attempts')} + ? >= ? THEN 'failed' ELSE 'none' END,
         updated_at = ?
       WHERE ${waitsForPrint(variant)}
       RETURNING ${c('print_status')} AS print_status`,
    )
    .bind(counted, counted, MAX_ATTEMPTS, now, testId, filesVersion, createdAt, createdAt, runId)
    .first<{ print_status: 'none' | 'failed' }>();
  return row?.print_status ?? null;
}

// The barem job of a test that waits for its generated barem, with what the
// route needs to read the test file. Null for any other test. A CES job also
// names the class barem (its key stays here) and the class exercise list.
export async function findBaremJob(
  db: D1Database,
  testId: number,
  variant: TestVariant = 'class',
): Promise<{ job: BaremJob; testFileKey: string; classBaremKey: string | null; teacherId: number; schoolYear: number; code: string } | null> {
  const v = columns(variant);
  const row = await db
    .prepare(
      `SELECT t.id, t.created_at, t.${v('files_version')} AS files_version, t.${v('test_file_key')} AS test_file_key,
         t.${v('test_file_type')} AS test_file_type, t.${v('barem_notes')} AS barem_notes, t.teacher_id, t.code, c.school_year,
         t.barem_file_key AS class_barem_key, t.barem_file_type AS class_barem_type, t.exercise_list_json AS class_list_json, t.subject
       FROM tests t JOIN classes c ON c.id = t.class_id
       WHERE t.id = ? AND ${needsBaremSql(variant)}`,
    )
    .bind(testId)
    .first<{
      id: number;
      created_at: string;
      files_version: number;
      test_file_key: string;
      test_file_type: string | null;
      barem_notes: string | null;
      teacher_id: number;
      code: string;
      school_year: number;
      class_barem_key: string | null;
      class_barem_type: string | null;
      class_list_json: string | null;
      subject: DetectedSubject | null;
    }>();
  if (!row || !row.test_file_type) return null;
  const job: BaremJob = {
    testId: row.id,
    createdAt: row.created_at,
    filesVersion: row.files_version,
    contentType: row.test_file_type,
    baremNotes: row.barem_notes ?? '',
    subject: row.subject,
  };
  const ces = variant === 'ces';
  if (ces) {
    job.variant = 'ces';
    job.classBarem = row.class_barem_key && row.class_barem_type ? { contentType: row.class_barem_type } : null;
    job.classExerciseList = row.class_list_json ? (JSON.parse(row.class_list_json) as ExerciseList) : null;
  }
  return {
    job,
    testFileKey: row.test_file_key,
    classBaremKey: ces ? row.class_barem_key : null,
    teacherId: row.teacher_id,
    schoolYear: row.school_year,
    code: row.code,
  };
}

// A generated barem is saved or failed only for a test that still waits for it,
// only from the run that holds the lease, and only when no file changed after
// the robot read the test (a barem the teacher uploads meanwhile also moves
// files_version and clears the request).
// With `first`, the parameters are numbered from it, as in waitsForList.
const waitsForBarem = (variant: TestVariant, first?: number) => {
  if (first !== undefined) {
    const [id, version, made, run] = [first, first + 1, first + 2, first + 3].map((n) => `?${n}`);
    return `tests.id = ${id} AND tests.${columns(variant)('files_version')} = ${version} AND (${made} IS NULL OR tests.created_at = ${made})
      AND ${needsBaremSql(variant, 'tests')} AND EXISTS (SELECT 1 FROM runner_state r WHERE r.id = 1 AND r.run_id = ${run})`;
  }
  return `tests.id = ? AND tests.${columns(variant)('files_version')} = ? AND (? IS NULL OR tests.created_at = ?) AND ${needsBaremSql(variant, 'tests')} AND ${HOLDS_LEASE}`;
};

// The new barem waits for the teacher's check (barem_unchecked), and the
// exercise list made from the old barem is cleared. The class barem also
// saves the subject that the robot found (`found`; null from an older robot),
// as the exercise list does; a Quick Try whose subject is not graded ends
// there, its list failed with the message, so the try gives its place back.
// Returns the key of the barem it replaced, or null when nothing was saved.
export async function saveGeneratedBarem(
  db: D1Database,
  testId: number,
  runId: string,
  filesVersion: number,
  createdAt: string | null,
  key: string,
  name: string,
  now: string,
  variant: TestVariant = 'class',
  found: FoundSubject | null = null,
): Promise<{ oldKey: string | null } | null> {
  const c = columns(variant);
  const tryEnds = `quick_try = 1 AND ${ENDS_UNSUPPORTED}`;
  const list =
    variant === 'class'
      ? `exercise_list_status = CASE WHEN ${tryEnds} THEN 'failed' ELSE 'none' END, exercise_list_json = NULL,
           exercise_list_message = CASE WHEN ${tryEnds} THEN ?6 ELSE NULL END, exercise_list_attempts = 0, ${SAVE_SUBJECT},`
      : `${c('exercise_list_status')} = 'none', ${c('exercise_list_json')} = NULL, ${c('exercise_list_message')} = NULL, ${c('exercise_list_attempts')} = 0,`;
  const subject = variant === 'class' ? found : null;
  const [before, written] = await db.batch<{ barem_file_key?: string | null; id?: number }>([
    db.prepare(`SELECT ${c('barem_file_key')} AS barem_file_key FROM tests WHERE id = ?`).bind(testId),
    db
      .prepare(
        `UPDATE tests SET ${c('barem_file_key')} = ?3, ${c('barem_file_name')} = ?4, ${c('barem_file_type')} = ?5, ${c('barem_unchecked')} = 1,
           ${c('barem_request')} = 'none', ${c('barem_request_attempts')} = 0, ${c('files_version')} = ${c('files_version')} + 1,
           ${list}
           updated_at = ?7
         WHERE ${waitsForBarem(variant, 8)}
         RETURNING id`,
      )
      .bind(subject?.value ?? null, subject?.name ?? '', key, name, DOCX_TYPE, unsupportedMessage(subject?.name ?? ''), now, testId, filesVersion, createdAt, runId),
  ]);
  if (!written?.results[0]) return null;
  return { oldKey: before?.results[0]?.barem_file_key ?? null };
}

// Whether the variant's barem is stored under this key.
export async function baremKeyIs(db: D1Database, testId: number, key: string, variant: TestVariant = 'class'): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS found FROM tests WHERE id = ? AND ${columns(variant)('barem_file_key')} = ?`)
    .bind(testId, key)
    .first<{ found: number }>();
  return row !== null;
}

// The robot could not write the barem: one more attempt is counted (none for a
// usage limit), and at MAX_ATTEMPTS the request fails and the teacher can ask
// again. Null when nothing was saved.
export async function failBaremJob(
  db: D1Database,
  testId: number,
  runId: string,
  filesVersion: number,
  createdAt: string | null,
  error: RobotError,
  now: string,
  variant: TestVariant = 'class',
): Promise<'none' | 'failed' | null> {
  const counted = error === 'usage_limit' ? 0 : 1;
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('barem_request_attempts')} = ${c('barem_request_attempts')} + ?,
         ${c('barem_request')} = CASE WHEN ${c('barem_request_attempts')} + ? >= ? THEN 'failed' ELSE 'requested' END,
         updated_at = ?
       WHERE ${waitsForBarem(variant)}
       RETURNING ${c('barem_request')} AS barem_request`,
    )
    .bind(counted, counted, MAX_ATTEMPTS, now, testId, filesVersion, createdAt, createdAt, runId)
    .first<{ barem_request: 'requested' | 'failed' }>();
  if (!row) return null;
  return row.barem_request === 'failed' ? 'failed' : 'none';
}

// Whether the run holds the lease now.
export async function holdsLease(db: D1Database, runId: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS held FROM runner_state WHERE id = 1 AND run_id = ?').bind(runId).first<{ held: number }>();
  return row !== null;
}

// Takes the next upload in line and marks it as this run's: the uploads with
// the fewest attempts first (an upload whose grading just failed waits for the
// others), and among them the students in alphabetical order. Null when there
// is none, or when the run does not hold the lease. The marking is one
// statement that checks the status, so parallel claims never take the same
// upload: one that lost the race looks again. A run never takes back an
// upload that a reopen took from it (reopenTest keeps that run's id): the
// run's old grading of it may still send a result, which must be refused.
// The claim writes the paper's variant (paperVariantSql) when it has none yet:
// from then on the paper keeps it, through a regrade or a retry, whatever
// happens to the student's CES mark. The claim checks GRADABLE again in its
// SQL, so a mark that changed since the look still sends no CES paper to the
// robot before its CES barem is active.
export async function claimSubmission(db: D1Database, runId: string): Promise<ClaimResult | null> {
  let claimed: { id: number; test_id: number; started_at: string; variant: TestVariant } | null = null;
  for (let tries = 0; tries < 5 && !claimed; tries++) {
    const { results: waiting } = await db
      .prepare(
        `SELECT s.id, s.attempts, st.full_name FROM submissions s
         JOIN tests t ON t.id = s.test_id JOIN students st ON st.id = s.student_id
         WHERE ${GRADABLE} AND (s.run_id IS NULL OR s.run_id <> ?)`,
      )
      .bind(runId)
      .all<{ id: number; attempts: number; full_name: string }>();
    const next = waiting.sort((x, y) => x.attempts - y.attempts || compareStudentNames(x.full_name, y.full_name) || x.id - y.id)[0];
    if (!next) return null;
    claimed = await db
      .prepare(
        `UPDATE submissions SET status = 'grading', run_id = ?,
           variant = (SELECT ${paperVariantSql('submissions', 't')} FROM tests t WHERE t.id = submissions.test_id)
         WHERE id = ? AND status = 'submitted' AND ${HOLDS_LEASE}
           AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND ${gradableSql('submissions')})
         RETURNING id, test_id, started_at, variant`,
      )
      .bind(runId, next.id, runId)
      .first<{ id: number; test_id: number; started_at: string; variant: TestVariant }>();
    // No row: another claim took it, or the run lost the lease.
    if (!claimed && !(await holdsLease(db, runId))) return null;
  }
  if (!claimed) return null;
  const { results } = await db
    .prepare('SELECT id, content_type, position FROM submission_files WHERE submission_id = ? ORDER BY position, id')
    .bind(claimed.id)
    .all<{ id: number; content_type: string; position: number }>();
  return {
    submissionId: claimed.id,
    testId: claimed.test_id,
    startedAt: claimed.started_at,
    variant: claimed.variant,
    files: results.map((row) => ({ id: row.id, contentType: row.content_type, position: row.position })),
  };
}

// The graded class for the analysis (spec §11.3). Null unless the test is in
// evaluation, like the rest of what the robot reads. The CES papers come with
// their variant, and their exercises in `cesExercises`, made the same way as
// the class columns from the CES list and the CES papers' items.
export async function findClassResults(db: D1Database, testId: number): Promise<ClassResults | null> {
  const [test, rows] = await db.batch<{
    exercise_list_json?: string | null;
    ces_exercise_list_json?: string | null;
    subject?: DetectedSubject | null;
    variant?: string | null;
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
      .prepare(
        `SELECT t.exercise_list_json, t.ces_exercise_list_json, t.subject, ${gradesVersionSql('t')} AS version FROM tests t WHERE t.id = ? AND t.status = 'evaluating'`,
      )
      .bind(testId),
    db
      .prepare(
        `SELECT s.id AS submission_id, s.variant, ev.total, ev.grade, ev.id AS evaluation_id, ev.created_at AS graded_at,
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
  const cesList = head.ces_exercise_list_json ? (JSON.parse(head.ces_exercise_list_json) as ExerciseList) : null;
  const students: ClassResults['students'] = [];
  const stored: StoredItem[] = [];
  const cesStored: StoredItem[] = [];
  let latest: { gradedAt: string; evaluationId: number; maxTotal: number; officePoints: number } | null = null;
  let current = -1;
  for (const row of rows?.results ?? []) {
    const ces = row.variant === 'ces';
    (ces ? cesStored : stored).push({
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
      students.push({ label: `Elev ${students.length + 1}`, total: row.total!, grade: row.grade!, variant: ces ? 'ces' : 'class', items: [] });
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
    subject: head.subject ?? null,
    maxTotal: list?.totalPoints ?? latest?.maxTotal ?? 0,
    officePoints: list?.officePoints ?? latest?.officePoints ?? 0,
    exercises: exerciseColumns(list, stored),
    cesExercises: cesStored.length > 0 ? exerciseColumns(cesList, cesStored) : null,
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
    askForAnalysis(db),
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
    askForAnalysis(db),
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

// An upload as the result route sees it, with the exercise list of its test,
// the CES variant's for a CES paper.
export async function findGrading(
  db: D1Database,
  submissionId: number,
): Promise<{ status: string; runId: string | null; startedAt: string; exerciseList: ExerciseList | null; subject: DetectedSubject | null } | null> {
  const row = await db
    .prepare(
      `SELECT s.status, s.run_id, s.started_at, t.subject,
         CASE WHEN s.variant = 'ces' THEN t.ces_exercise_list_json ELSE t.exercise_list_json END AS exercise_list_json
       FROM submissions s JOIN tests t ON t.id = s.test_id WHERE s.id = ?`,
    )
    .bind(submissionId)
    .first<{ status: string; run_id: string | null; started_at: string; exercise_list_json: string | null; subject: DetectedSubject | null }>();
  if (!row) return null;
  const exerciseList = row.exercise_list_json ? (JSON.parse(row.exercise_list_json) as ExerciseList) : null;
  return { status: row.status, runId: row.run_id, startedAt: row.started_at, exerciseList, subject: row.subject };
}

// This run is grading this upload: its id, its run, and the time it started.
// Ids of deleted uploads come back (no AUTOINCREMENT), so a grading that the
// robot began before a reset must not land in the next upload with that id.
const GRADED_BY_RUN = "EXISTS (SELECT 1 FROM submissions s WHERE s.id = ? AND s.status = 'grading' AND s.run_id = ? AND s.started_at = ?)";

// Saves the grading, its items, and the graded upload in one transaction,
// with a fixed number of queries whatever the number of items. False when
// the upload is no longer this run's.
export async function saveGrading(
  db: D1Database,
  submissionId: number,
  runId: string,
  startedAt: string,
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
    db.prepare(`DELETE FROM evaluations WHERE submission_id = ? AND ${GRADED_BY_RUN}`).bind(submissionId, submissionId, runId, startedAt),
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
        startedAt,
      ),
    db
      .prepare(
        `INSERT INTO evaluation_items (evaluation_id, exercise_id, position, label, max_points, ai_points, points,
           student_answer, comment, confidence, needs_review, review_reason, page, areas)
         SELECT e.id, json_extract(j.value, '$.exerciseId'), json_extract(j.value, '$.position'), json_extract(j.value, '$.label'),
           json_extract(j.value, '$.maxPoints'), json_extract(j.value, '$.points'), json_extract(j.value, '$.points'),
           json_extract(j.value, '$.studentAnswer'), json_extract(j.value, '$.comment'), json_extract(j.value, '$.confidence'),
           json_extract(j.value, '$.needsReview'), json_extract(j.value, '$.reviewReason'), json_extract(j.value, '$.page'),
           COALESCE(json_extract(j.value, '$.areas'), '[]')
         FROM json_each(?) j JOIN evaluations e ON e.submission_id = ?
         WHERE ${GRADED_BY_RUN}`,
      )
      .bind(items, submissionId, submissionId, runId, startedAt),
    ...lastModelStatements(db, 'grading', GRADED_BY_RUN, [submissionId, runId, startedAt], { model, effort }),
    db
      .prepare(
        `UPDATE submissions SET status = 'graded', graded_at = ?, run_id = NULL, last_error = NULL
         WHERE id = ? AND status = 'grading' AND run_id = ? AND started_at = ?
         RETURNING id`,
      )
      .bind(now, submissionId, runId, startedAt),
    askForAnalysis(db),
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
  startedAt: string,
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
         WHERE id = ? AND status = 'grading' AND run_id = ? AND started_at = ?
         RETURNING status`,
      )
      .bind(counted, counted, MAX_ATTEMPTS, counted, MAX_ATTEMPTS, ROBOT_ERROR_TEXT[error], submissionId, runId, startedAt),
    askForAnalysis(db),
    finishTests(db, now),
  ]);
  return updated?.results[0]?.status ?? null;
}

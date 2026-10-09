import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { TestStatus } from '../../shared/tests.ts';

// The test lifecycle after Start test (spec §8.3-§8.5). Each write checks its
// own rules in its SQL, so two requests at once cannot both pass a check.

// Entering an evaluation asks for a new class analysis when the old one is
// ready or failed (spec §8.5).
const ASK_FOR_ANALYSIS = `
  analysis_status = CASE WHEN analysis_status IN ('ready', 'failed') THEN 'requested' ELSE analysis_status END,
  analysis_attempts = CASE WHEN analysis_status IN ('ready', 'failed') THEN 0 ELSE analysis_attempts END`;

const HAS_FILES = 'EXISTS (SELECT 1 FROM submission_files f WHERE f.submission_id = submissions.id)';

// evaluating → done: no upload waits for grading or is being graded, and no
// class analysis is waiting (spec §8.5). Returns the ids of the finished tests.
export function finishTests(db: D1Database, now: string): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE tests SET status = 'done', updated_at = ?
       WHERE status = 'evaluating' AND analysis_status <> 'requested'
         AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = tests.id AND s.status IN ('submitted', 'grading'))
       RETURNING id`,
    )
    .bind(now);
}

// An open test whose scheduled evaluation time has come.
const DUE = "t.status = 'open' AND t.evaluation_at IS NOT NULL AND t.evaluation_at <= ?";

// Starts the evaluation of every test whose scheduled time has come, so a
// scheduled test closes on time even when the robot is late (spec §8.3). For
// those tests the uploads closed at the scheduled time: uploads with files
// are sent as they are ("Fără confirmare"); uploads without files stay. Also
// finishes the tests that have nothing left to grade. True when this call
// started an evaluation that did not end at once: the robot has work. D1 runs
// writes one at a time, so of two calls at once only one sees that test.
export async function promoteDueTests(db: D1Database, now: string): Promise<boolean> {
  const [, started, finished] = await db.batch<{ id: number }>(promoteStatements(db, now));
  const ended = new Set(finished?.results.map((row) => row.id));
  return Boolean(started?.results.some((row) => !ended.has(row.id)));
}

// The writes of promoteDueTests, for a batch with more writes.
export function promoteStatements(db: D1Database, now: string): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE submissions
         SET status = 'submitted', auto_submitted = 1,
           submitted_at = (SELECT t.evaluation_at FROM tests t WHERE t.id = submissions.test_id)
         WHERE status = 'uploading' AND ${HAS_FILES}
           AND test_id IN (SELECT t.id FROM tests t WHERE ${DUE})`,
      )
      .bind(now),
    db
      .prepare(
        `UPDATE tests
         SET status = 'evaluating', evaluation_started_at = evaluation_at, evaluation_at = NULL, updated_at = ?, ${ASK_FOR_ANALYSIS}
         WHERE id IN (SELECT t.id FROM tests t WHERE ${DUE})
         RETURNING id`,
      )
      .bind(now, now),
    finishTests(db, now),
  ];
}

// An open test of this teacher with the test file, the barem, and at least one
// uploaded file (spec §8.4).
const READY = `t.id = ? AND t.teacher_id = ? AND t.status = 'open'
  AND t.test_file_key IS NOT NULL AND t.barem_file_key IS NOT NULL
  AND EXISTS (SELECT 1 FROM submissions s JOIN submission_files f ON f.submission_id = s.id WHERE s.test_id = t.id)`;

// open → evaluating now. Null when the test is not ready; "done" when it has
// nothing to grade (every upload was graded before).
export async function startEvaluationNow(
  db: D1Database,
  teacherId: number,
  testId: number,
  now: string,
): Promise<'evaluating' | 'done' | null> {
  const [, started, finished] = await db.batch<{ id: number }>([
    db
      .prepare(
        `UPDATE submissions SET status = 'submitted', auto_submitted = 1, submitted_at = ?
         WHERE status = 'uploading' AND ${HAS_FILES}
           AND test_id IN (SELECT t.id FROM tests t WHERE ${READY})`,
      )
      .bind(now, testId, teacherId),
    db
      .prepare(
        `UPDATE tests
         SET status = 'evaluating', evaluation_started_at = ?, evaluation_at = NULL, updated_at = ?, ${ASK_FOR_ANALYSIS}
         WHERE id IN (SELECT t.id FROM tests t WHERE ${READY})
         RETURNING id`,
      )
      .bind(now, now, testId, teacherId),
    finishTests(db, now),
  ]);
  if (!started?.results.length) return null;
  return finished?.results.some((row) => row.id === testId) ? 'done' : 'evaluating';
}

// Schedules the evaluation of an open test that has the test file and the
// barem. The uploads may still come. False when the test is not ready.
export async function scheduleEvaluation(db: D1Database, teacherId: number, testId: number, at: string, now: string): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE tests SET evaluation_at = ?, updated_at = ?
       WHERE id = ? AND teacher_id = ? AND status = 'open' AND test_file_key IS NOT NULL AND barem_file_key IS NOT NULL
       RETURNING id`,
    )
    .bind(at, now, testId, teacherId)
    .first<{ id: number }>();
  return row !== null;
}

// False when the test had no schedule, or its evaluation already started.
export async function cancelSchedule(db: D1Database, teacherId: number, testId: number, now: string): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE tests SET evaluation_at = NULL, updated_at = ?
       WHERE id = ? AND teacher_id = ? AND status = 'open' AND evaluation_at IS NOT NULL
       RETURNING id`,
    )
    .bind(now, testId, teacherId)
    .first<{ id: number }>();
  return row !== null;
}

// Whether any student of the test uploaded a file.
export async function hasUploadedFiles(db: D1Database, testId: number): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS found FROM submissions s JOIN submission_files f ON f.submission_id = s.id WHERE s.test_id = ? LIMIT 1')
    .bind(testId)
    .first<{ found: number }>();
  return row !== null;
}

// "Folosește oricum": the teacher accepts an exercise list whose points do
// not add up. Returns the test's status, or null when the list had no problem.
export async function acceptExerciseList(db: D1Database, teacherId: number, testId: number, now: string): Promise<TestStatus | null> {
  const row = await db
    .prepare(
      `UPDATE tests SET exercise_list_status = 'accepted', updated_at = ?
       WHERE id = ? AND teacher_id = ? AND exercise_list_status = 'problem'
       RETURNING status`,
    )
    .bind(now, testId, teacherId)
    .first<{ status: TestStatus }>();
  return row?.status ?? null;
}

// Lets the robot try again to make an exercise list it failed to make.
// Returns the test's status, or null when the list had not failed.
export async function retryExerciseList(db: D1Database, teacherId: number, testId: number, now: string): Promise<TestStatus | null> {
  const row = await db
    .prepare(
      `UPDATE tests SET exercise_list_status = 'none', exercise_list_message = NULL, exercise_list_attempts = 0, updated_at = ?
       WHERE id = ? AND teacher_id = ? AND exercise_list_status = 'failed'
       RETURNING status`,
    )
    .bind(now, testId, teacherId)
    .first<{ status: TestStatus }>();
  return row?.status ?? null;
}

// failed → submitted with 0 attempts, so the robot grades the upload again. A
// finished test goes back to evaluation (spec §8.5). Returns the test's
// status, or null when the upload had not failed.
export async function retrySubmission(db: D1Database, teacherId: number, submissionId: number, now: string): Promise<TestStatus | null> {
  const [retried, , test] = await db.batch<{ test_id?: number; status?: TestStatus }>([
    db
      .prepare(
        `UPDATE submissions SET status = 'submitted', attempts = 0, last_error = NULL, run_id = NULL
         WHERE id = ? AND status = 'failed'
           AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND t.teacher_id = ?)
         RETURNING test_id`,
      )
      .bind(submissionId, teacherId),
    db
      .prepare(
        `UPDATE tests SET status = 'evaluating', updated_at = ?, ${ASK_FOR_ANALYSIS}
         WHERE status = 'done' AND teacher_id = ?
           AND id = (SELECT test_id FROM submissions WHERE id = ? AND status = 'submitted')`,
      )
      .bind(now, teacherId, submissionId),
    db.prepare('SELECT t.status FROM tests t JOIN submissions s ON s.test_id = t.id WHERE s.id = ?').bind(submissionId),
  ]);
  if (!retried?.results.length) return null;
  return test?.results[0]?.status ?? null;
}

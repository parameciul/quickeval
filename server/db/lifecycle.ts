import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { DEMO_PAPER_LIMIT } from '../../shared/accounts.ts';
import type { AnalysisInfo } from '../../shared/api.ts';
import type { AnalysisStatus, TestStatus } from '../../shared/tests.ts';
import type { TestVariant } from '../../shared/files.ts';
import { flagCountSql, type ShownResult } from './evaluations.ts';
import type { ShownUpload } from './submissions.ts';
import { baremActiveSql, columns } from './variant.ts';

// The test lifecycle after Start test (spec §8.3-§8.5). Each write checks its
// own rules in its SQL, so two requests at once cannot both pass a check.

// Entering an evaluation does not ask for a class analysis: the grades will
// probably change when the teacher checks the papers. An analysis made before
// (ready or failed) is dropped, so a new one is asked for after the checks
// (askForAnalysis, askAnalysisAfterCheck). One already requested stays
// requested. The attempts start again in every case.
const ASK_FOR_ANALYSIS = `
  analysis_status = CASE WHEN analysis_status IN ('ready', 'failed') THEN 'none' ELSE analysis_status END,
  analysis_attempts = 0`;

// The test (alias or table name `t`) is fully checked: no upload waits or has
// failed (the teacher retries it), at least one is graded, and no item or unreadable page waits for the teacher.
const fullyChecked = (t: string) => `NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = ${t}.id AND s.status IN ('submitted', 'grading', 'failed'))
  AND EXISTS (SELECT 1 FROM submissions g WHERE g.test_id = ${t}.id AND g.status = 'graded')
  AND (SELECT COALESCE(SUM(${flagCountSql('ev')}), 0)
         FROM evaluations ev JOIN submissions s ON s.id = ev.submission_id WHERE s.test_id = ${t}.id AND s.status = 'graded') = 0`;

// The class analysis is asked for only when nothing is left for the teacher to
// check or decide, and never for a Quick Try test (one paper, no class). Runs just before finishTests, so a test that is fully
// checked stays in evaluation until the robot writes the analysis.
export function askForAnalysis(db: D1Database): D1PreparedStatement {
  return db.prepare(
    `UPDATE tests SET analysis_status = 'requested', analysis_attempts = 0
     WHERE status = 'evaluating' AND quick_try = 0 AND analysis_status = 'none' AND ${fullyChecked('tests')}`,
  );
}

// After the teacher's check of a paper: when this was the last thing to check,
// the class analysis is asked for. A finished test goes back to evaluation,
// where the robot writes it. True when it was asked for (the robot must start).
export async function askAnalysisAfterCheck(db: D1Database, teacherId: number, submissionId: number, now: string): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE tests SET analysis_status = 'requested', analysis_attempts = 0, updated_at = ?, archived = 0, status = 'evaluating'
       WHERE teacher_id = ? AND id = (SELECT test_id FROM submissions WHERE id = ?)
         AND status IN ('evaluating', 'done') AND archived = 0 AND quick_try = 0 AND analysis_status = 'none' AND ${fullyChecked('tests')}
       RETURNING id`,
    )
    .bind(now, teacherId, submissionId)
    .first<{ id: number }>();
  return row !== null;
}

// The barem of test t can be graded against: it exists, the teacher checked it
// when the robot generated it, and no generation is running.
export const BAREM_ACTIVE = baremActiveSql('class');

const HAS_FILES = 'EXISTS (SELECT 1 FROM submission_files f WHERE f.submission_id = submissions.id)';

// evaluating → done: no upload waits for grading or is being graded, and no
// class analysis is waiting (spec §8.5). A test with no graded upload has
// nothing to analyze: it ends, and its analysis is not asked for. Returns the
// ids of the finished tests.
export function finishTests(db: D1Database, now: string): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE tests SET status = 'done', updated_at = ?,
         analysis_status = CASE WHEN analysis_status = 'requested' THEN 'none' ELSE analysis_status END
       WHERE status = 'evaluating'
         AND (analysis_status <> 'requested'
              OR NOT EXISTS (SELECT 1 FROM submissions g WHERE g.test_id = tests.id AND g.status = 'graded'))
         AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = tests.id AND s.status IN ('submitted', 'grading'))
       RETURNING id`,
    )
    .bind(now);
}

// A paper s that still waits for grading: sent, being graded, or uploaded with
// files and not sent.
const WAITS_FOR_GRADING = `(s.status IN ('submitted', 'grading')
  OR (s.status = 'uploading' AND EXISTS (SELECT 1 FROM submission_files f WHERE f.submission_id = s.id)))`;

// open → done with no robot, for a test that was reopened after its grading:
// at least one paper is graded and none waits. The results stay and the class
// analysis is left as it is (a ready one stays ready, a requested one is not
// asked for). Not an evaluation start, so nothing is counted. False when the
// test is gone, is not the teacher's, is not open, has no graded paper, or has
// a paper that waits; all checked in the write.
export async function finishOpenTest(db: D1Database, teacherId: number, testId: number, now: string): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE tests SET status = 'done', evaluation_at = NULL, updated_at = ?,
         analysis_status = CASE WHEN analysis_status = 'requested' THEN 'none' ELSE analysis_status END
       WHERE id = ? AND teacher_id = ? AND status = 'open'
         AND EXISTS (SELECT 1 FROM submissions g WHERE g.test_id = tests.id AND g.status = 'graded')
         AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = tests.id AND ${WAITS_FOR_GRADING})
       RETURNING id`,
    )
    .bind(now, testId, teacherId)
    .first<{ id: number }>();
  return row !== null;
}

// Why finishOpenTest changed nothing: a papers-waiting test is told apart from
// one with nothing graded. Read after the write.
export async function finishBlocker(db: D1Database, testId: number): Promise<'papers_waiting' | 'nothing_graded' | null> {
  const row = await db
    .prepare(
      `SELECT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = ?1 AND ${WAITS_FOR_GRADING}) AS waiting,
              EXISTS (SELECT 1 FROM submissions g WHERE g.test_id = ?1 AND g.status = 'graded') AS graded`,
    )
    .bind(testId)
    .first<{ waiting: number; graded: number }>();
  if (row?.waiting) return 'papers_waiting';
  if (!row?.graded) return 'nothing_graded';
  return null;
}

// How many papers of a teacher are on their way to the robot, in the tests x
// of `waiting`. The trigger submissions_count_paper (migration 0019) counts a
// paper when its result arrives, so these use the demo limit too.
export const papersWaitingSql = (teacherId: string, waiting = "x.status = 'evaluating'") =>
  `(SELECT COUNT(*) FROM submissions w JOIN tests x ON x.id = w.test_id
    WHERE x.teacher_id = ${teacherId} AND w.status IN ('submitted', 'grading') AND ${waiting})`;

// How many papers the teacher of test t may still send to the robot: no limit
// for a complete account.
const papersLeft = (waiting?: string) => `(SELECT CASE WHEN q.demo = 0 THEN 1000000
    ELSE MAX(0, ${DEMO_PAPER_LIMIT} - q.papers_graded - ${papersWaitingSql('q.id', waiting)}) END
  FROM teachers q WHERE q.id = t.teacher_id)`;

const PAPERS_LEFT = papersLeft();

// A regrade of an open test grades its papers at the next start, so the papers
// that wait in that test use the limit too: a demo account must not lose
// results to a regrade that can never run.
const PAPERS_LEFT_TO_REGRADE = papersLeft("(x.status = 'evaluating' OR x.id = t.id)");

// The test t may send at least one paper to the robot. The trigger
// tests_count_evaluation (migration 0018) counts the test, for every teacher,
// when it moves into 'evaluating' with uploads to grade.
// A demo account grades one test only: no other test of the teacher has been
// sent to the robot (a paper that is sent, being graded, graded or failed, in
// a test whose evaluation started). A test that ended at once with nothing to
// grade does not use the place. The place stays used when the papers are reset
// (teachers.graded_test_id, set when a paper is first graded). A regrade or
// retry is not checked here: its test is the one that was graded.
const ONLY_TEST = `(SELECT CASE WHEN q.demo = 0 THEN 1
    WHEN q.graded_test_id IS NOT NULL AND q.graded_test_id <> t.id THEN 0
    WHEN EXISTS (SELECT 1 FROM tests o JOIN submissions os ON os.test_id = o.id
      WHERE o.teacher_id = q.id AND o.id <> t.id AND o.evaluation_started_at IS NOT NULL
        AND os.status IN ('submitted', 'grading', 'graded', 'failed')) THEN 0
    ELSE 1 END
  FROM teachers q WHERE q.id = t.teacher_id) = 1`;

export const WITHIN_PAPER_LIMIT = `(${PAPERS_LEFT} > 0 AND ${ONLY_TEST})`;

// A regrade or retry of test t sends a paper to the robot: a finished test goes
// back to evaluation (the trigger counts it), and a test in evaluation takes it
// in the evaluation it is in (countGradingAgain counts it). An open test
// grades it at its next start, which counts then.
const MAY_GRADE_AGAIN = `${PAPERS_LEFT_TO_REGRADE} > 0`;

// A paper s of an open test that a start would send to the robot.
const SENDABLE = `(s.status = 'submitted' OR (s.status = 'uploading' AND EXISTS (SELECT 1 FROM submission_files f WHERE f.submission_id = s.id)))`;

// The papers the limit lets start, for the tests t of `scope`: by scheduled
// time and test, then the papers the students confirmed, oldest first. A demo
// account sends the papers of its first test only. The rest wait for a later evaluation, as unselected uploads do.
function papersToSend(scope: string, only = 'TRUE'): string {
  return `SELECT p.id FROM (
    SELECT s.id, ${PAPERS_LEFT} AS allowed,
      (SELECT q.demo FROM teachers q WHERE q.id = t.teacher_id) AS demo,
      DENSE_RANK() OVER (PARTITION BY t.teacher_id ORDER BY t.evaluation_at, t.id) AS test_place,
      ROW_NUMBER() OVER (PARTITION BY t.teacher_id ORDER BY t.evaluation_at, t.id, s.status <> 'submitted', s.submitted_at, s.id) AS place
    FROM submissions s JOIN tests t ON t.id = s.test_id
    WHERE (${scope}) AND ${only} AND ${SENDABLE}) p
  WHERE p.place <= p.allowed AND (p.demo = 0 OR p.test_place = 1)`;
}

// A paper past the limit goes back to uploading (its files stay).
const HOLD_BACK = "status = 'uploading', auto_submitted = 0, submitted_at = NULL";

// The status of the test before the batch, returned by the UPDATE that sent
// the uploads back (its RETURNING runs before the batch's later writes).
const STATUS_BEFORE = '(SELECT t.status FROM tests t WHERE t.id = submissions.test_id) AS test_status';

// Counts a regrade or retry of a test that was in evaluation already (the
// trigger counts only a test that moves into evaluation, as a finished one
// does). Runs after the batch, from what its UPDATE returned; the demo limit
// was checked inside that UPDATE.
async function countGradingAgain(db: D1Database, teacherId: number, regraded: { test_status?: TestStatus }[] | undefined): Promise<void> {
  if (regraded?.[0]?.test_status !== 'evaluating') return;
  await db.prepare('UPDATE teachers SET tests_evaluated = tests_evaluated + 1 WHERE id = ?').bind(teacherId).run();
}

// True when the demo limit keeps this test from starting an evaluation.
export async function blockedByDemoLimit(db: D1Database, testId: number, scheduling = false): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS blocked FROM tests t WHERE t.id = ? AND (NOT ${WITHIN_PAPER_LIMIT}${scheduling ? ` OR ${SCHEDULED_ELSEWHERE}` : ''})`)
    .bind(testId)
    .first();
  return row !== null;
}

// Why a regrade or retry changed nothing, when the demo limit is the reason:
// the test has what the action names (uploads to grade again; this graded
// upload; this failed upload), and only the limit kept it. Read after the
// write, so another reason (nothing to regrade, a changed upload) wins.
export async function regradeBlockedByDemoLimit(
  db: D1Database,
  of: { testId: number } | { submissionId: number; gradedAt: string } | { submissionId: number; startedAt: string },
): Promise<boolean> {
  const blocked = `NOT ${MAY_GRADE_AGAIN}`;
  const statement =
    'testId' in of
      ? db
          .prepare(
            `SELECT 1 AS blocked FROM tests t WHERE t.id = ? AND ${blocked}
               AND EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status IN ('graded', 'failed'))`,
          )
          .bind(of.testId)
      : 'gradedAt' in of
        ? db
            .prepare(
              `SELECT 1 AS blocked FROM tests t JOIN submissions s ON s.test_id = t.id
               WHERE s.id = ? AND s.status = 'graded' AND ${blocked}
                 AND EXISTS (SELECT 1 FROM evaluations ev WHERE ev.submission_id = s.id AND ev.created_at = ?)`,
            )
            .bind(of.submissionId, of.gradedAt)
        : db
            .prepare(
              `SELECT 1 AS blocked FROM tests t JOIN submissions s ON s.test_id = t.id
               WHERE s.id = ? AND s.status = 'failed' AND s.started_at = ? AND ${blocked}`,
            )
            .bind(of.submissionId, of.startedAt);
  return (await statement.first()) !== null;
}

// A demo account has another test scheduled already: only one test can use its
// place, so a second schedule would never run.
const SCHEDULED_ELSEWHERE = `EXISTS (SELECT 1 FROM tests o JOIN teachers q ON q.id = o.teacher_id
  WHERE o.teacher_id = t.teacher_id AND q.demo = 1 AND o.id <> t.id AND o.status = 'open' AND o.evaluation_at IS NOT NULL)`;

// An open test whose scheduled evaluation time has come. A demo account at its
// limit, or a barem that is not active, keeps the test open.
const DUE = `t.status = 'open' AND t.evaluation_at IS NOT NULL AND t.evaluation_at <= ?1 AND ${BAREM_ACTIVE} AND ${WITHIN_PAPER_LIMIT}`;

const DUE_PAPERS = papersToSend(DUE);

// One UPDATE can start several due tests of a teacher, and SQLite reads its
// WHERE before it writes: a test starts when one of its papers is within the
// limit, or when it has no paper to send and ends at once. The rest wait.
const STARTS = `${DUE} AND (NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND ${SENDABLE})
  OR EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.id IN (${DUE_PAPERS})))`;

// Starts the evaluation of every test whose scheduled time has come, so a
// scheduled test closes on time even when the robot is late (spec §8.3). For
// those tests the uploads closed at the scheduled time: uploads with files
// are sent as they are ("Fără confirmare"), within the demo limit; uploads
// without files stay. Also
// finishes the tests that have nothing left to grade. True when this call
// started an evaluation that did not end at once: the robot has work. D1 runs
// writes one at a time, so of two calls at once only one sees that test.
export async function promoteDueTests(db: D1Database, now: string): Promise<boolean> {
  const [, , started, , finished] = await db.batch<{ id: number }>(promoteStatements(db, now));
  const ended = new Set(finished?.results.map((row) => row.id));
  return Boolean(started?.results.some((row) => !ended.has(row.id)));
}

// The writes of promoteDueTests, for a batch with more writes.
export function promoteStatements(db: D1Database, now: string): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE submissions SET ${HOLD_BACK}
         WHERE status = 'submitted' AND test_id IN (SELECT t.id FROM tests t WHERE ${STARTS})
           AND id NOT IN (${DUE_PAPERS})`,
      )
      .bind(now),
    db
      .prepare(
        `UPDATE submissions
         SET status = 'submitted', auto_submitted = 1,
           submitted_at = (SELECT t.evaluation_at FROM tests t WHERE t.id = submissions.test_id)
         WHERE status = 'uploading' AND ${HAS_FILES} AND id IN (${DUE_PAPERS})`,
      )
      .bind(now),
    db
      .prepare(
        `UPDATE tests
         SET status = 'evaluating', evaluation_started_at = evaluation_at, evaluation_at = NULL, updated_at = ?1, ${ASK_FOR_ANALYSIS}
         WHERE id IN (SELECT t.id FROM tests t WHERE ${STARTS})
         RETURNING id`,
      )
      .bind(now),
    askForAnalysis(db),
    finishTests(db, now),
    // A due test that the demo account's one test keeps out has no schedule
    // left, so its students can upload again.
    db
      .prepare(
        `UPDATE tests AS t SET evaluation_at = NULL, updated_at = ?1
         WHERE t.status = 'open' AND t.evaluation_at IS NOT NULL AND t.evaluation_at <= ?1 AND NOT ${ONLY_TEST}`,
      )
      .bind(now),
  ];
}

// An open test of this teacher with the test file, the barem, and at least one
// uploaded file (spec §8.4).
const READY = `t.id = ?1 AND t.teacher_id = ?2 AND t.status = 'open'
  AND t.test_file_key IS NOT NULL AND ${BAREM_ACTIVE} AND ${WITHIN_PAPER_LIMIT}
  AND EXISTS (SELECT 1 FROM submissions s JOIN submission_files f ON f.submission_id = s.id WHERE s.test_id = t.id)`;

// open → evaluating now. Null when the test is not ready; "done" when it has
// nothing to grade (every upload was graded before). With `submissionIds`,
// only the selected uploads are sent to grading: uploads with files that were
// not selected stay uploading, so the robot ignores them until the teacher
// reopens and evaluates them. A demo account sends the papers it has left,
// and the others wait in the same way.
export async function startEvaluationNow(
  db: D1Database,
  teacherId: number,
  testId: number,
  now: string,
  submissionIds?: number[],
): Promise<'evaluating' | 'done' | null> {
  if (submissionIds !== undefined) return startSelectiveEvaluation(db, teacherId, testId, now, submissionIds);
  const [, , started, , finished] = await db.batch<{ id: number }>([
    db
      .prepare(
        `UPDATE submissions SET ${HOLD_BACK}
         WHERE status = 'submitted' AND test_id IN (SELECT t.id FROM tests t WHERE ${READY})
           AND id NOT IN (${papersToSend(READY)})`,
      )
      .bind(testId, teacherId),
    db
      .prepare(
        `UPDATE submissions SET status = 'submitted', auto_submitted = 1, submitted_at = ?3
         WHERE status = 'uploading' AND ${HAS_FILES} AND id IN (${papersToSend(READY)})`,
      )
      .bind(testId, teacherId, now),
    db
      .prepare(
        `UPDATE tests
         SET status = 'evaluating', evaluation_started_at = ?3, evaluation_at = NULL, updated_at = ?3, ${ASK_FOR_ANALYSIS}
         WHERE id IN (SELECT t.id FROM tests t WHERE ${READY})
         RETURNING id`,
      )
      .bind(testId, teacherId, now),
    askForAnalysis(db),
    finishTests(db, now),
  ]);
  if (!started?.results.length) return null;
  return finished?.results.some((row) => row.id === testId) ? 'done' : 'evaluating';
}

// Whether any of the selected uploads has a file.
export async function selectedHaveFiles(db: D1Database, testId: number, submissionIds: number[]): Promise<boolean> {
  if (submissionIds.length === 0) return false;
  const placeholders = submissionIds.map(() => '?').join(',');
  const row = await db
    .prepare(
      `SELECT 1 AS found FROM submissions s JOIN submission_files f ON f.submission_id = s.id
       WHERE s.test_id = ? AND s.id IN (${placeholders}) LIMIT 1`,
    )
    .bind(testId, ...submissionIds)
    .first<{ found: number }>();
  return row !== null;
}

// open → evaluating now for the selected uploads only. Unselected uploads
// that were confirmed go back to uploading (their files stay), so the robot
// grades only the selection. The teacher reopens the test and evaluates the
// rest. A demo account sends the first selected papers it has left. Null when
// the test is not ready.
async function startSelectiveEvaluation(
  db: D1Database,
  teacherId: number,
  testId: number,
  now: string,
  submissionIds: number[],
): Promise<'evaluating' | 'done' | null> {
  if (submissionIds.length === 0) return null;
  const placeholders = submissionIds.map((_, index) => `?${index + 4}`).join(',');
  const params = [testId, teacherId, now, ...submissionIds];
  const READY_SELECTED = `t.id = ?1 AND t.teacher_id = ?2 AND t.status = 'open'
    AND t.test_file_key IS NOT NULL AND ${BAREM_ACTIVE} AND ${WITHIN_PAPER_LIMIT}
    AND EXISTS (SELECT 1 FROM submissions s JOIN submission_files f ON f.submission_id = s.id
      WHERE s.test_id = t.id AND s.id IN (${placeholders}))`;
  const OPEN_WITH_FILES = `t.id = ?1 AND t.teacher_id = ?2 AND t.status = 'open'
    AND t.test_file_key IS NOT NULL AND ${BAREM_ACTIVE} AND ${WITHIN_PAPER_LIMIT}`;
  const TO_SEND = papersToSend(OPEN_WITH_FILES, `s.id IN (${placeholders})`);
  const [, , started, , finished] = await db.batch<{ id: number }>([
    // Unselected confirmed uploads wait for a later evaluation.
    db
      .prepare(
        `UPDATE submissions SET ${HOLD_BACK}
         WHERE status = 'submitted' AND test_id = ?1 AND id NOT IN (${TO_SEND})
           AND EXISTS (SELECT 1 FROM tests t WHERE ${OPEN_WITH_FILES})`,
      )
      .bind(...params),
    db
      .prepare(
        `UPDATE submissions SET status = 'submitted', auto_submitted = 1, submitted_at = ?3
         WHERE status = 'uploading' AND ${HAS_FILES} AND id IN (${TO_SEND})`,
      )
      .bind(...params),
    db
      .prepare(
        `UPDATE tests
         SET status = 'evaluating', evaluation_started_at = ?3, evaluation_at = NULL, updated_at = ?3, ${ASK_FOR_ANALYSIS}
         WHERE id IN (SELECT t.id FROM tests t WHERE ${READY_SELECTED})
         RETURNING id`,
      )
      .bind(...params),
    askForAnalysis(db),
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
      `UPDATE tests AS t SET evaluation_at = ?, updated_at = ?
       WHERE t.id = ? AND t.teacher_id = ? AND t.status = 'open' AND t.test_file_key IS NOT NULL AND ${BAREM_ACTIVE}
         AND ${WITHIN_PAPER_LIMIT} AND NOT ${SCHEDULED_ELSEWHERE}
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
export async function acceptExerciseList(
  db: D1Database,
  teacherId: number,
  testId: number,
  now: string,
  variant: TestVariant = 'class',
): Promise<TestStatus | null> {
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('exercise_list_status')} = 'accepted', updated_at = ?
       WHERE id = ? AND teacher_id = ? AND ${c('exercise_list_status')} = 'problem'
       RETURNING status`,
    )
    .bind(now, testId, teacherId)
    .first<{ status: TestStatus }>();
  return row?.status ?? null;
}

// Lets the robot try again to make an exercise list it failed to make.
// Returns the test's status, or null when the list had not failed.
export async function retryExerciseList(
  db: D1Database,
  teacherId: number,
  testId: number,
  now: string,
  variant: TestVariant = 'class',
): Promise<TestStatus | null> {
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('exercise_list_status')} = 'none', ${c('exercise_list_message')} = NULL, ${c('exercise_list_attempts')} = 0, updated_at = ?
       WHERE id = ? AND teacher_id = ? AND ${c('exercise_list_status')} = 'failed'
       RETURNING status`,
    )
    .bind(now, testId, teacherId)
    .first<{ status: TestStatus }>();
  return row?.status ?? null;
}

// A regraded upload waits for the robot again, as if just sent. It went to
// grading before, so it keeps its variant; a paper graded before the variants
// existed has none written, and was graded as a class paper.
const KEEP_VARIANT = "variant = COALESCE(variant, 'class')";
const GRADE_AGAIN = `status = 'submitted', attempts = 0, last_error = NULL, run_id = NULL, graded_at = NULL, ${KEEP_VARIANT}`;

// The end of a batch that made one upload wait for the robot again: a
// finished test goes back to evaluation (spec §8.5), then the test's status
// is read.
function backToEvaluation(db: D1Database, teacherId: number, submissionId: number, now: string): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE tests SET status = 'evaluating', archived = 0, updated_at = ?, ${ASK_FOR_ANALYSIS}
         WHERE status = 'done' AND teacher_id = ?
           AND id = (SELECT test_id FROM submissions WHERE id = ? AND status = 'submitted')`,
      )
      .bind(now, teacherId, submissionId),
    db.prepare('SELECT t.status FROM tests t JOIN submissions s ON s.test_id = t.id WHERE s.id = ?').bind(submissionId),
  ];
}

// "Recorectează" (spec §8.5): the robot grades a graded upload again. Its
// result goes, with the teacher's corrections. The upload must still hold the
// grading the page shows: ids come back after a reset, so a page opened before
// must not regrade another upload. A finished test goes back to evaluation; an
// open test grades it after Start evaluation. Returns the test's status, or
// null when the upload does not hold that grading, or the demo limit keeps
// the upload from being graded again.
export async function regradeSubmission(db: D1Database, shown: ShownResult, now: string): Promise<TestStatus | null> {
  const { teacherId, submissionId, gradedAt } = shown;
  const [regraded, , , test] = await db.batch<{ test_id?: number; test_status?: TestStatus; status?: TestStatus }>([
    db
      .prepare(
        `UPDATE submissions SET ${GRADE_AGAIN}
         WHERE id = ? AND status = 'graded'
           AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND t.teacher_id = ? AND ${MAY_GRADE_AGAIN})
           AND EXISTS (SELECT 1 FROM evaluations ev WHERE ev.submission_id = submissions.id AND ev.created_at = ?)
         RETURNING test_id, ${STATUS_BEFORE}`,
      )
      .bind(submissionId, teacherId, gradedAt),
    // After the UPDATE, so its check still sees the result. An upload that
    // waits for the robot has no result to keep: its next grading replaces it.
    db
      .prepare(
        `DELETE FROM evaluations WHERE submission_id IN (
           SELECT s.id FROM submissions s JOIN tests t ON t.id = s.test_id
           WHERE s.id = ? AND s.status = 'submitted' AND t.teacher_id = ?)`,
      )
      .bind(submissionId, teacherId),
    ...backToEvaluation(db, teacherId, submissionId, now),
  ]);
  if (!regraded?.results.length) return null;
  await countGradingAgain(db, teacherId, regraded.results);
  return test?.results[0]?.status ?? null;
}

// "Recorectează tot": every graded upload of the test, and every upload whose
// grading failed, waits for the robot again. Results and corrections go. A
// finished test goes back to evaluation. A demo account sends the papers it has
// left, the failed ones first, and the others keep their results. With the
// demo limit reached, nothing changes. Returns how many uploads wait, and the
// test's status; null when the test is gone.
export async function regradeTest(
  db: D1Database,
  teacherId: number,
  testId: number,
  now: string,
): Promise<{ count: number; status: TestStatus } | null> {
  const AGAIN = `SELECT p.id FROM (
    SELECT s.id, ${PAPERS_LEFT_TO_REGRADE} AS allowed, ROW_NUMBER() OVER (ORDER BY s.status <> 'failed', s.id) AS place
    FROM submissions s JOIN tests t ON t.id = s.test_id
    WHERE t.id = ? AND t.teacher_id = ? AND s.status IN ('graded', 'failed')) p
  WHERE p.place <= p.allowed`;
  const [, regraded, , test] = await db.batch<{ id?: number; test_status?: TestStatus; status?: TestStatus }>([
    db.prepare(`DELETE FROM evaluations WHERE submission_id IN (${AGAIN})`).bind(testId, teacherId),
    db.prepare(`UPDATE submissions SET ${GRADE_AGAIN} WHERE id IN (${AGAIN}) RETURNING id, ${STATUS_BEFORE}`).bind(testId, teacherId),
    db
      .prepare(
        `UPDATE tests SET status = 'evaluating', archived = 0, updated_at = ?, ${ASK_FOR_ANALYSIS}
         WHERE id = ? AND teacher_id = ? AND status = 'done'
           AND EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = tests.id AND s.status = 'submitted')`,
      )
      .bind(now, testId, teacherId),
    db.prepare('SELECT status FROM tests WHERE id = ? AND teacher_id = ?').bind(testId, teacherId),
  ]);
  const status = test?.results[0]?.status;
  await countGradingAgain(db, teacherId, regraded?.results);
  return status ? { count: regraded?.results.length ?? 0, status } : null;
}

// "Regenerează": the class analysis is asked for again, from any analysis
// state (also the first one of a test that was graded before analyses
// existed). A finished test goes back to evaluation, where the robot writes it.
// Null when the test is not the teacher's, is not in evaluation or done, or
// has no graded upload.
export async function requestAnalysis(db: D1Database, teacherId: number, testId: number, now: string): Promise<AnalysisInfo | null> {
  const row = await db
    .prepare(
      `UPDATE tests SET analysis_status = 'requested', analysis_attempts = 0, updated_at = ?, archived = 0,
         status = CASE WHEN status = 'done' THEN 'evaluating' ELSE status END
       WHERE id = ? AND teacher_id = ? AND status IN ('evaluating', 'done')
         AND EXISTS (SELECT 1 FROM submissions g WHERE g.test_id = tests.id AND g.status = 'graded')
       RETURNING analysis_status, analysis_stale, analysis_attempts`,
    )
    .bind(now, testId, teacherId)
    .first<{ analysis_status: AnalysisStatus; analysis_stale: number; analysis_attempts: number }>();
  return row ? { status: row.analysis_status, stale: row.analysis_stale === 1, attempts: row.analysis_attempts } : null;
}

// failed → submitted with 0 attempts, so the robot grades the upload again. A
// finished test goes back to evaluation (spec §8.5). Returns the test's
// status, or null when the demo limit keeps the upload from being graded
// again, or the upload the page shows had not failed (or is
// another upload now: ids of deleted rows come back).
export async function retrySubmission(db: D1Database, shown: ShownUpload, now: string): Promise<TestStatus | null> {
  const { teacherId, submissionId, startedAt } = shown;
  const [retried, , test] = await db.batch<{ test_id?: number; test_status?: TestStatus; status?: TestStatus }>([
    db
      .prepare(
        `UPDATE submissions SET status = 'submitted', attempts = 0, last_error = NULL, run_id = NULL, ${KEEP_VARIANT}
         WHERE id = ? AND started_at = ? AND status = 'failed'
           AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND t.teacher_id = ? AND ${MAY_GRADE_AGAIN})
         RETURNING test_id, ${STATUS_BEFORE}`,
      )
      .bind(submissionId, startedAt, teacherId),
    ...backToEvaluation(db, teacherId, submissionId, now),
  ]);
  if (!retried?.results.length) return null;
  await countGradingAgain(db, teacherId, retried.results);
  return test?.results[0]?.status ?? null;
}

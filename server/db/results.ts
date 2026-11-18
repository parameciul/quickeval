import type { D1Database } from '@cloudflare/workers-types';
import type { ResultCodeAnswer, StudentEvaluation, StudentResultView, SubmissionFile, UploadStatus } from '../../shared/api.ts';
import { RESULT_CODE_TRIES, RESULT_CODE_WINDOW_MINUTES } from '../../shared/tests.ts';
import { isUniqueViolation } from '../errors.ts';
import { newResultToken } from '../secrets.ts';
import { getEvaluation } from './evaluations.ts';
import { listSubmissionFiles, publicFile, type ShownUpload } from './submissions.ts';
import type { StoredFile } from './tests.ts';

// Student result pages. Each upload has its own secret link; the teacher opens
// the pages of a test for all students at once (`tests.results_open`).

// Opens or closes the result pages of one of the teacher's tests. Null when
// the test is gone. Closing also takes back the results published for single
// students, so "stop access" closes every page of the test.
export async function setResultsOpen(
  db: D1Database,
  teacherId: number,
  testId: number,
  open: boolean,
  now: string,
): Promise<boolean | null> {
  if (open) {
    const row = await db
      .prepare('UPDATE tests SET results_open = ?, updated_at = ? WHERE id = ? AND teacher_id = ? RETURNING results_open')
      .bind(1, now, testId, teacherId)
      .first<{ results_open: number }>();
    return row ? row.results_open === 1 : null;
  }
  const [test] = await db.batch<{ results_open: number }>([
    db
      .prepare('UPDATE tests SET results_open = ?, updated_at = ? WHERE id = ? AND teacher_id = ? RETURNING results_open')
      .bind(0, now, testId, teacherId),
    db
      .prepare(
        `UPDATE submissions SET results_open = 0 WHERE test_id = ?
          AND EXISTS (SELECT 1 FROM tests t WHERE t.id = ? AND t.teacher_id = ?)`,
      )
      .bind(testId, testId, teacherId),
  ]);
  const row = test?.results[0];
  return row ? row.results_open === 1 : null;
}

// Whether students of a test can read results now: open for all, or some
// upload's result published alone.
export async function resultsPublished(db: D1Database, testId: number): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS published FROM tests t
       WHERE t.id = ? AND (t.results_open = 1 OR EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.results_open = 1))`,
    )
    .bind(testId)
    .first<{ published: number }>();
  return row !== null;
}

// Publishes or takes back the result page of a single upload of one of the
// teacher's tests. Returns whether that student can open the page now (the
// test may keep results open for all), or null when the upload the page shows
// is gone or is another upload now (ids of deleted rows come back, and a
// result page must never open for another student).
export async function setSubmissionResultsOpen(db: D1Database, shown: ShownUpload, open: boolean): Promise<boolean | null> {
  const { teacherId, submissionId, startedAt } = shown;
  const updated = await db
    .prepare(
      `UPDATE submissions SET results_open = ?
        WHERE id = ? AND started_at = ?
          AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND t.teacher_id = ?)
        RETURNING test_id`,
    )
    .bind(open ? 1 : 0, submissionId, startedAt, teacherId)
    .first<{ test_id: number }>();
  if (!updated) return null;
  const row = await db
    .prepare(
      `SELECT t.results_open AS test_open, s.results_open AS submission_open
        FROM submissions s JOIN tests t ON t.id = s.test_id
        WHERE s.id = ?`,
    )
    .bind(submissionId)
    .first<{ test_open: number; submission_open: number }>();
  if (!row) return null;
  return row.test_open === 1 || row.submission_open === 1;
}

// The result link of an upload, making one for older uploads that have none
// yet. Null when the upload the page shows is not in one of the teacher's
// tests, or is another upload now.
export async function teacherResultToken(db: D1Database, shown: ShownUpload): Promise<string | null> {
  const { teacherId, submissionId, startedAt } = shown;
  const row = await db
    .prepare(
      `SELECT s.result_token FROM submissions s JOIN tests t ON t.id = s.test_id
       WHERE s.id = ? AND s.started_at = ? AND t.teacher_id = ?`,
    )
    .bind(submissionId, startedAt, teacherId)
    .first<{ result_token: string | null }>();
  if (!row) return null;
  if (row.result_token) return row.result_token;
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = newResultToken();
    let set: { result_token: string } | null = null;
    try {
      set = await db
        .prepare(
          `UPDATE submissions SET result_token = ?
           WHERE id = ? AND started_at = ? AND result_token IS NULL
             AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND t.teacher_id = ?)
           RETURNING result_token`,
        )
        .bind(token, submissionId, startedAt, teacherId)
        .first<{ result_token: string }>();
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    if (set) return set.result_token;
    const again = await db
      .prepare(
        `SELECT s.result_token FROM submissions s JOIN tests t ON t.id = s.test_id
         WHERE s.id = ? AND s.started_at = ? AND t.teacher_id = ?`,
      )
      .bind(submissionId, startedAt, teacherId)
      .first<{ result_token: string | null }>();
    if (!again) return null;
    if (again.result_token) return again.result_token;
  }
  return null;
}

// The result link of an upload the student just sent, named by its id and the
// hash of the phone's secret: an id that came back for another student's new
// upload gives this phone nothing. Older uploads without a link get one now.
// The link comes with its short code, which the database makes with it (a
// trigger of migration 0034; a code that clashes inside the test fails the
// UPDATE on the unique index, and the next try draws another).
export async function confirmResultToken(
  db: D1Database,
  submissionId: number,
  sessionHash: string,
): Promise<{ resultToken: string; resultCode: string | null } | null> {
  const read = () =>
    db
      .prepare('SELECT result_token, result_code FROM submissions WHERE id = ? AND session_hash = ?')
      .bind(submissionId, sessionHash)
      .first<{ result_token: string | null; result_code: string | null }>();
  const row = await read();
  if (!row) return null;
  if (row.result_token) return { resultToken: row.result_token, resultCode: row.result_code };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db
        .prepare('UPDATE submissions SET result_token = ? WHERE id = ? AND session_hash = ? AND result_token IS NULL')
        .bind(newResultToken(), submissionId, sessionHash)
        .run();
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    // Read after the write: the trigger sets the code after the UPDATE.
    const again = await read();
    if (!again) return null;
    if (again.result_token) return { resultToken: again.result_token, resultCode: again.result_code };
  }
  return null;
}

// A result link by its short code, typed on the page of the test `testId`.
// Wrong codes are counted per test: at most RESULT_CODE_TRIES in a window of
// RESULT_CODE_WINDOW_MINUTES, so the codes of a test cannot be guessed. The
// first statement takes a try, and refuses it when none is left, inside its
// own SQL; a right code gives its try back. `code` is null for a text that is
// not a code: it costs a try like any wrong code.
export async function openResultByCode(
  db: D1Database,
  testId: number,
  code: string | null,
  now: string,
): Promise<ResultCodeAnswer | 'limited' | null> {
  const windowStart = new Date(Date.parse(now) - RESULT_CODE_WINDOW_MINUTES * 60_000).toISOString();
  const [taken, found] = await db.batch<{ tries: number } | CodeRow>([
    db
      .prepare(
        `INSERT INTO result_code_tries (test_id, tries, since) VALUES (?, 1, ?)
         ON CONFLICT (test_id) DO UPDATE SET
           tries = CASE WHEN since <= ? THEN 1 ELSE tries + 1 END,
           since = CASE WHEN since <= ? THEN excluded.since ELSE since END
         WHERE since <= ? OR tries < ?
         RETURNING tries`,
      )
      .bind(testId, now, windowStart, windowStart, windowStart, RESULT_CODE_TRIES),
    db
      .prepare(
        `SELECT s.result_token, s.result_code, s.student_id, st.full_name
         FROM submissions s JOIN students st ON st.id = s.student_id
         WHERE s.test_id = ? AND s.result_code = ? AND s.result_token IS NOT NULL`,
      )
      .bind(testId, code ?? ''),
  ]);
  if ((taken?.results ?? []).length === 0) return 'limited';
  const row = (found?.results ?? [])[0] as CodeRow | undefined;
  if (!row) return null;
  await db.prepare('UPDATE result_code_tries SET tries = tries - 1 WHERE test_id = ? AND tries > 0').bind(testId).run();
  return { resultToken: row.result_token, resultCode: row.result_code, studentId: row.student_id, studentName: row.full_name };
}

interface CodeRow {
  result_token: string;
  result_code: string;
  student_id: number;
  full_name: string;
}

interface ResultRow {
  code: string;
  title: string;
  class_name: string;
  test_open: number;
  submission_open: number;
  archived: number;
  submission_id: number;
  status: Exclude<UploadStatus, 'none'>;
  student_name: string;
  submitted_at: string | null;
  result_code: string | null;
}

// One student's result page by its secret link. Null for an unknown link. The
// caller refuses the page while neither the test nor this upload is published.
// While closed the answer carries no files and no grading, so polling an
// unpublished link costs one query.
const RESULT_SELECT = `SELECT t.code, t.title, c.name AS class_name, t.results_open AS test_open, s.results_open AS submission_open, t.archived,
    s.id AS submission_id, s.status, st.full_name AS student_name, s.submitted_at, s.result_code
  FROM submissions s
  JOIN tests t ON t.id = s.test_id
  JOIN classes c ON c.id = t.class_id
  JOIN students st ON st.id = s.student_id`;

export async function findResultByToken(
  db: D1Database,
  resultToken: string,
): Promise<{ result: StudentResultView; resultsOpen: boolean; archived: boolean } | null> {
  const row = await db.prepare(`${RESULT_SELECT} WHERE s.result_token = ?`).bind(resultToken).first<ResultRow>();
  if (!row) return null;
  const open = row.test_open === 1 || row.submission_open === 1;
  if (!open) {
    const result: StudentResultView = {
      testCode: row.code,
      testTitle: row.title,
      className: row.class_name,
      studentName: row.student_name,
      submittedAt: row.submitted_at,
      status: row.status,
      files: [],
      evaluation: null,
      // The route refuses a closed page, so nothing of it reaches the student.
      resultCode: null,
    };
    return { result, resultsOpen: false, archived: row.archived === 1 };
  }
  return { result: await openResult(db, row), resultsOpen: open, archived: row.archived === 1 };
}

// A Quick Try's student result, by its one paper: the same page as above,
// always open (the try's link is its key).
export async function findResultBySubmission(db: D1Database, submissionId: number): Promise<StudentResultView | null> {
  const row = await db.prepare(`${RESULT_SELECT} WHERE s.id = ?`).bind(submissionId).first<ResultRow>();
  return row ? openResult(db, row) : null;
}

async function openResult(db: D1Database, row: ResultRow): Promise<StudentResultView> {
  const files = (await listSubmissionFiles(db, row.submission_id)).map(publicFile);
  const evaluation = await getEvaluation(db, row.submission_id);
  return {
    testCode: row.code,
    testTitle: row.title,
    className: row.class_name,
    studentName: row.student_name,
    submittedAt: row.submitted_at,
    status: row.status,
    files: files satisfies SubmissionFile[],
    evaluation: evaluation ? toStudentEvaluation(evaluation) : null,
    resultCode: row.result_code,
  };
}

function toStudentEvaluation(evaluation: {
  maxTotal: number;
  officePoints: number;
  total: number;
  grade: number;
  summary: string;
  strengths: string[];
  recommendations: string[];
  items: { exerciseId: string; label: string; maxPoints: number; points: number; studentAnswer: string; comment: string }[];
}): StudentEvaluation {
  return {
    maxTotal: evaluation.maxTotal,
    officePoints: evaluation.officePoints,
    total: evaluation.total,
    grade: evaluation.grade,
    summary: evaluation.summary,
    strengths: evaluation.strengths,
    recommendations: evaluation.recommendations,
    items: evaluation.items.map((item) => ({
      exerciseId: item.exerciseId,
      label: item.label,
      maxPoints: item.maxPoints,
      points: item.points,
      studentAnswer: item.studentAnswer,
      comment: item.comment,
    })),
  };
}

// One file of a student's result page, only while the test or this upload
// keeps results open. Null otherwise: unknown link, unknown file, or closed
// results.
export async function findResultFile(db: D1Database, resultToken: string, fileId: number): Promise<StoredFile | null> {
  const row = await db
    .prepare(
      `SELECT f.r2_key, f.original_name, f.content_type
       FROM submission_files f
       JOIN submissions s ON s.id = f.submission_id
       JOIN tests t ON t.id = s.test_id
       WHERE s.result_token = ? AND f.id = ? AND f.submission_id = s.id AND (t.results_open = 1 OR s.results_open = 1)`,
    )
    .bind(resultToken, fileId)
    .first<{ r2_key: string; original_name: string; content_type: string }>();
  return row ? { key: row.r2_key, name: row.original_name, type: row.content_type } : null;
}

// Whether the student behind a result link can open it: the test keeps results
// open for all, or the teacher published this upload alone. Null for an
// unknown link, so the file route can answer 404 for unknown links and
// unknown files, and 403 only while the results are closed.
export async function resultsOpenByToken(db: D1Database, resultToken: string): Promise<boolean | null> {
  const row = await db
    .prepare(
      `SELECT t.results_open AS test_open, s.results_open AS submission_open
       FROM submissions s JOIN tests t ON t.id = s.test_id
       WHERE s.result_token = ?`,
    )
    .bind(resultToken)
    .first<{ test_open: number; submission_open: number }>();
  return row ? row.test_open === 1 || row.submission_open === 1 : null;
}

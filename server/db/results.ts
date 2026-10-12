import type { D1Database } from '@cloudflare/workers-types';
import type { StudentEvaluation, StudentResultView, SubmissionFile, UploadStatus } from '../../shared/api.ts';
import { newResultToken } from '../secrets.ts';
import { getEvaluation } from './evaluations.ts';
import { listSubmissionFiles, publicFile } from './submissions.ts';
import type { StoredFile } from './tests.ts';

// Student result pages. Each upload has its own secret link; the teacher opens
// the pages of a test for all students at once (`tests.results_open`).

// Opens or closes the result pages of one of the teacher's tests. Null when
// the test is gone.
export async function setResultsOpen(
  db: D1Database,
  teacherId: number,
  testId: number,
  open: boolean,
  now: string,
): Promise<boolean | null> {
  const row = await db
    .prepare('UPDATE tests SET results_open = ?, updated_at = ? WHERE id = ? AND teacher_id = ? RETURNING results_open')
    .bind(open ? 1 : 0, now, testId, teacherId)
    .first<{ results_open: number }>();
  return row ? row.results_open === 1 : null;
}

// The result link of an upload, making one for older uploads that have none
// yet. Null when the upload is not in one of the teacher's tests.
export async function teacherResultToken(db: D1Database, teacherId: number, submissionId: number): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT s.result_token FROM submissions s JOIN tests t ON t.id = s.test_id
       WHERE s.id = ? AND t.teacher_id = ?`,
    )
    .bind(submissionId, teacherId)
    .first<{ result_token: string | null }>();
  if (!row) return null;
  if (row.result_token) return row.result_token;
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = newResultToken();
    const set = await db
      .prepare(
        `UPDATE submissions SET result_token = ?
         WHERE id = ? AND result_token IS NULL
           AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND t.teacher_id = ?)
         RETURNING result_token`,
      )
      .bind(token, submissionId, teacherId)
      .first<{ result_token: string }>();
    if (set) return set.result_token;
    const again = await db
      .prepare(
        `SELECT s.result_token FROM submissions s JOIN tests t ON t.id = s.test_id
         WHERE s.id = ? AND t.teacher_id = ?`,
      )
      .bind(submissionId, teacherId)
      .first<{ result_token: string | null }>();
    if (!again) return null;
    if (again.result_token) return again.result_token;
  }
  return null;
}

// The result link of an upload the student just sent. The caller already
// scoped the upload by the phone's secret; older uploads without a link get
// one now.
export async function confirmResultToken(db: D1Database, submissionId: number): Promise<string | null> {
  const row = await db
    .prepare('SELECT result_token FROM submissions WHERE id = ?')
    .bind(submissionId)
    .first<{ result_token: string | null }>();
  if (!row) return null;
  if (row.result_token) return row.result_token;
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = newResultToken();
    const set = await db
      .prepare('UPDATE submissions SET result_token = ? WHERE id = ? AND result_token IS NULL RETURNING result_token')
      .bind(token, submissionId)
      .first<{ result_token: string }>();
    if (set) return set.result_token;
    const again = await db
      .prepare('SELECT result_token FROM submissions WHERE id = ?')
      .bind(submissionId)
      .first<{ result_token: string | null }>();
    if (again?.result_token) return again.result_token;
    if (!again) return null;
  }
  return null;
}

interface ResultRow {
  code: string;
  title: string;
  class_name: string;
  results_open: number;
  submission_id: number;
  status: Exclude<UploadStatus, 'none'>;
  student_name: string;
}

// One student's result page by its secret link. Null for an unknown link. The
// caller refuses the page while `resultsOpen` is false.
export async function findResultByToken(
  db: D1Database,
  resultToken: string,
): Promise<{ result: StudentResultView; resultsOpen: boolean } | null> {
  const row = await db
    .prepare(
      `SELECT t.code, t.title, c.name AS class_name, t.results_open,
          s.id AS submission_id, s.status, st.full_name AS student_name
       FROM submissions s
       JOIN tests t ON t.id = s.test_id
       JOIN classes c ON c.id = t.class_id
       JOIN students st ON st.id = s.student_id
       WHERE s.result_token = ?`,
    )
    .bind(resultToken)
    .first<ResultRow>();
  if (!row) return null;
  const files = (await listSubmissionFiles(db, row.submission_id)).map(publicFile);
  const evaluation = await getEvaluation(db, row.submission_id);
  const result: StudentResultView = {
    testCode: row.code,
    testTitle: row.title,
    className: row.class_name,
    studentName: row.student_name,
    status: row.status,
    files: files satisfies SubmissionFile[],
    evaluation: evaluation ? toStudentEvaluation(evaluation) : null,
  };
  return { result, resultsOpen: row.results_open === 1 };
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

// One file of a student's result page, only while the test's results are open.
// Null otherwise: unknown link, unknown file, or closed results.
export async function findResultFile(db: D1Database, resultToken: string, fileId: number): Promise<StoredFile | null> {
  const row = await db
    .prepare(
      `SELECT f.r2_key, f.original_name, f.content_type
       FROM submission_files f
       JOIN submissions s ON s.id = f.submission_id
       JOIN tests t ON t.id = s.test_id
       WHERE s.result_token = ? AND f.id = ? AND f.submission_id = s.id AND t.results_open = 1`,
    )
    .bind(resultToken, fileId)
    .first<{ r2_key: string; original_name: string; content_type: string }>();
  return row ? { key: row.r2_key, name: row.original_name, type: row.content_type } : null;
}

// Whether a result link names an upload whose test closed its results. True
// for an unknown link too: the file route then answers 404 either way.
export async function resultLinkExists(db: D1Database, resultToken: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS found FROM submissions WHERE result_token = ?').bind(resultToken).first<{ found: number }>();
  return row !== null;
}

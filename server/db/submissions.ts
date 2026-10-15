import type { D1Database } from '@cloudflare/workers-types';
import type { SubmissionDetail, SubmissionFile, UploadStatus } from '../../shared/api.ts';
import type { TestStatus } from '../../shared/tests.ts';
import { getEvaluation } from './evaluations.ts';
import type { StoredFile } from './tests.ts';

interface FileRow {
  id: number;
  r2_key: string;
  original_name: string;
  content_type: string;
  size: number;
  position: number;
}

export interface SubmissionFileRecord extends SubmissionFile {
  key: string;
}

function toFile(row: FileRow): SubmissionFileRecord {
  return { id: row.id, key: row.r2_key, name: row.original_name, contentType: row.content_type, size: row.size, position: row.position };
}

// What the browser sees of a file: no R2 key.
export function publicFile(file: SubmissionFileRecord): SubmissionFile {
  return { id: file.id, name: file.name, contentType: file.contentType, size: file.size, position: file.position };
}

// The files of one upload, in upload order.
export async function listSubmissionFiles(db: D1Database, submissionId: number): Promise<SubmissionFileRecord[]> {
  const { results } = await db
    .prepare('SELECT id, r2_key, original_name, content_type, size, position FROM submission_files WHERE submission_id = ? ORDER BY position, id')
    .bind(submissionId)
    .all<FileRow>();
  return results.map(toFile);
}

// One upload as the teacher sees it, with its files and its graded result.
// Null when it is not an upload of one of the teacher's tests.
export async function getTeacherSubmission(
  db: D1Database,
  teacherId: number,
  submissionId: number,
): Promise<{ detail: SubmissionDetail; files: SubmissionFileRecord[] } | null> {
  const row = await db
    .prepare(
      `SELECT s.id, s.status, s.auto_submitted, s.started_at, s.submitted_at, s.last_error, s.student_id, st.full_name,
         s.result_token, t.code, t.title, t.status AS test_status, t.results_open AS test_open, s.results_open AS submission_open
       FROM submissions s
       JOIN tests t ON t.id = s.test_id
       JOIN students st ON st.id = s.student_id
       WHERE s.id = ? AND t.teacher_id = ?`,
    )
    .bind(submissionId, teacherId)
    .first<{
      id: number;
      status: Exclude<UploadStatus, 'none'>;
      auto_submitted: number;
      started_at: string;
      submitted_at: string | null;
      last_error: string | null;
      student_id: number;
      full_name: string;
      result_token: string | null;
      code: string;
      title: string;
      test_status: TestStatus;
      test_open: number;
      submission_open: number;
    }>();
  if (!row) return null;
  const files = await listSubmissionFiles(db, row.id);
  return {
    detail: {
      id: row.id,
      testCode: row.code,
      testTitle: row.title,
      testStatus: row.test_status,
      studentId: row.student_id,
      studentName: row.full_name,
      status: row.status,
      autoSubmitted: row.auto_submitted === 1,
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
      lastError: row.last_error,
      files: files.map(publicFile),
      evaluation: await getEvaluation(db, row.id),
      resultToken: row.result_token,
      resultsOpen: row.test_open === 1 || row.submission_open === 1,
    },
    files,
  };
}

// A file of an upload of one of the teacher's tests.
export async function findTeacherFile(db: D1Database, teacherId: number, submissionId: number, fileId: number): Promise<StoredFile | null> {
  const row = await db
    .prepare(
      `SELECT f.r2_key, f.original_name, f.content_type
       FROM submission_files f
       JOIN submissions s ON s.id = f.submission_id
       JOIN tests t ON t.id = s.test_id
       WHERE f.id = ? AND f.submission_id = ? AND t.teacher_id = ?`,
    )
    .bind(fileId, submissionId, teacherId)
    .first<{ r2_key: string; original_name: string; content_type: string }>();
  return row ? { key: row.r2_key, name: row.original_name, type: row.content_type } : null;
}

// The upload a teacher's page shows: its id, and the time it started
// (`submissions.started_at`, written once). Ids of deleted rows come back, so a
// write from a page opened before a reset names both and changes nothing when
// the upload now at that id started at another time.
export interface ShownUpload {
  teacherId: number;
  submissionId: number;
  startedAt: string;
}

// When the upload started, or null when it is not an upload of one of the
// teacher's tests.
export async function uploadStartedAt(db: D1Database, teacherId: number, submissionId: number): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT s.started_at FROM submissions s JOIN tests t ON t.id = s.test_id
       WHERE s.id = ? AND t.teacher_id = ?`,
    )
    .bind(submissionId, teacherId)
    .first<{ started_at: string }>();
  return row?.started_at ?? null;
}

// Deletes the upload the page shows; its file rows go with it (ON DELETE
// CASCADE). False when that upload is gone, or is another one now.
export async function deleteSubmissionRow(db: D1Database, shown: ShownUpload): Promise<boolean> {
  // The guarded UPDATE runs first: its subquery reads the row that the DELETE
  // removes. A graded upload that goes makes a ready analysis out of date.
  const [, deleted] = await db.batch([
    db
      .prepare(
        `UPDATE tests SET analysis_stale = 1
         WHERE analysis_status = 'ready'
           AND id = (SELECT s.test_id FROM submissions s
                     WHERE s.id = ? AND s.started_at = ?
                       AND EXISTS (SELECT 1 FROM evaluations ev WHERE ev.submission_id = s.id))
           AND teacher_id = ?`,
      )
      .bind(shown.submissionId, shown.startedAt, shown.teacherId),
    db
      .prepare(
        `DELETE FROM submissions
         WHERE id = ? AND started_at = ?
           AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND t.teacher_id = ?)
         RETURNING id`,
      )
      .bind(shown.submissionId, shown.startedAt, shown.teacherId),
  ]);
  return (deleted?.results.length ?? 0) > 0;
}

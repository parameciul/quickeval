import type { D1Database } from '@cloudflare/workers-types';
import type { SubmissionDetail, SubmissionFile, UploadStatus } from '../../shared/api.ts';
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

// One upload as the teacher sees it, with its files. Null when it is not an
// upload of one of the teacher's tests.
export async function getTeacherSubmission(
  db: D1Database,
  teacherId: number,
  submissionId: number,
): Promise<{ detail: SubmissionDetail; files: SubmissionFileRecord[] } | null> {
  const row = await db
    .prepare(
      `SELECT s.id, s.status, s.auto_submitted, s.started_at, s.submitted_at, s.student_id, st.full_name, t.code, t.title
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
      student_id: number;
      full_name: string;
      code: string;
      title: string;
    }>();
  if (!row) return null;
  const files = await listSubmissionFiles(db, row.id);
  return {
    detail: {
      id: row.id,
      testCode: row.code,
      testTitle: row.title,
      studentId: row.student_id,
      studentName: row.full_name,
      status: row.status,
      autoSubmitted: row.auto_submitted === 1,
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
      files: files.map(publicFile),
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

// Deletes an upload; its file rows go with it (ON DELETE CASCADE).
export async function deleteSubmissionRow(db: D1Database, submissionId: number): Promise<void> {
  await db.prepare('DELETE FROM submissions WHERE id = ?').bind(submissionId).run();
}

import type { D1Database } from '@cloudflare/workers-types';
import type { LinkStudent, LinkStudentState, UploadStatus } from '../../shared/api.ts';
import { MAX_STUDENT_FILES } from '../../shared/files.ts';
import { compareStudentNames } from '../../shared/students.ts';
import type { TestStatus } from '../../shared/tests.ts';
import type { StoredFile } from './tests.ts';

// Queries of the student app. Every one is scoped by the test that the
// upload link names, or by the upload that the phone's secret names.

export interface LinkTest {
  id: number;
  teacherId: number;
  classId: number;
  code: string;
  title: string;
  status: TestStatus;
  className: string;
  schoolYear: number;
}

// An upload, found by the hash of the phone's secret.
export interface SessionRecord {
  submissionId: number;
  studentId: number;
  studentName: string;
  status: Exclude<UploadStatus, 'none'>;
}

export async function findTestByToken(db: D1Database, token: string): Promise<LinkTest | null> {
  const row = await db
    .prepare(
      `SELECT t.id, t.teacher_id, t.class_id, t.code, t.title, t.status, c.name AS class_name, c.school_year
       FROM tests t JOIN classes c ON c.id = t.class_id
       WHERE t.upload_token = ?`,
    )
    .bind(token)
    .first<{
      id: number;
      teacher_id: number;
      class_id: number;
      code: string;
      title: string;
      status: TestStatus;
      class_name: string;
      school_year: number;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    teacherId: row.teacher_id,
    classId: row.class_id,
    code: row.code,
    title: row.title,
    status: row.status,
    className: row.class_name,
    schoolYear: row.school_year,
  };
}

// The active students of the class with the state of their upload, by name.
export async function listLinkStudents(db: D1Database, test: LinkTest): Promise<LinkStudent[]> {
  const { results } = await db
    .prepare(
      `SELECT st.id, st.full_name, s.status
       FROM enrollments e
       JOIN students st ON st.id = e.student_id
       LEFT JOIN submissions s ON s.test_id = ? AND s.student_id = st.id
       WHERE e.class_id = ? AND e.active = 1`,
    )
    .bind(test.id, test.classId)
    .all<{ id: number; full_name: string; status: UploadStatus | null }>();
  const stateOf = (status: UploadStatus | null): LinkStudentState =>
    status === null ? 'none' : status === 'uploading' ? 'in_progress' : 'done';
  return results
    .map((row) => ({ id: row.id, name: row.full_name, state: stateOf(row.status) }))
    .sort((a, b) => compareStudentNames(a.name, b.name));
}

// A student of the test's class who has not left it.
export async function findActiveStudent(db: D1Database, test: LinkTest, studentId: number): Promise<{ id: number; fullName: string } | null> {
  const row = await db
    .prepare(
      `SELECT st.id, st.full_name FROM enrollments e JOIN students st ON st.id = e.student_id
       WHERE e.class_id = ? AND e.student_id = ? AND e.active = 1`,
    )
    .bind(test.classId, studentId)
    .first<{ id: number; full_name: string }>();
  return row ? { id: row.id, fullName: row.full_name } : null;
}

export async function findStudentSubmission(
  db: D1Database,
  testId: number,
  studentId: number,
): Promise<{ id: number; status: Exclude<UploadStatus, 'none'>; sessionHash: string | null } | null> {
  const row = await db
    .prepare('SELECT id, status, session_hash FROM submissions WHERE test_id = ? AND student_id = ?')
    .bind(testId, studentId)
    .first<{ id: number; status: Exclude<UploadStatus, 'none'>; session_hash: string | null }>();
  return row ? { id: row.id, status: row.status, sessionHash: row.session_hash } : null;
}

// Returns the new upload's id. Throws a UNIQUE error when another phone
// started this student's upload first.
export async function createSubmission(db: D1Database, testId: number, studentId: number, sessionHash: string, now: string): Promise<number> {
  const row = await db
    .prepare("INSERT INTO submissions (test_id, student_id, status, session_hash, started_at) VALUES (?, ?, 'uploading', ?, ?) RETURNING id")
    .bind(testId, studentId, sessionHash, now)
    .first<{ id: number }>();
  return row!.id;
}

export async function findSession(db: D1Database, testId: number, sessionHash: string): Promise<SessionRecord | null> {
  const row = await db
    .prepare(
      `SELECT s.id, s.student_id, s.status, st.full_name
       FROM submissions s JOIN students st ON st.id = s.student_id
       WHERE s.test_id = ? AND s.session_hash = ?`,
    )
    .bind(testId, sessionHash)
    .first<{ id: number; student_id: number; status: Exclude<UploadStatus, 'none'>; full_name: string }>();
  return row ? { submissionId: row.id, studentId: row.student_id, studentName: row.full_name, status: row.status } : null;
}

// How many files the upload has, and the position of the next one.
export async function fileSlots(db: D1Database, submissionId: number): Promise<{ count: number; next: number }> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count, COALESCE(MAX(position), 0) + 1 AS next FROM submission_files WHERE submission_id = ?')
    .bind(submissionId)
    .first<{ count: number; next: number }>();
  return { count: row?.count ?? 0, next: row?.next ?? 1 };
}

// An upload may change only while its test is open, before the test's
// scheduled time, and while it is not yet sent. Each write checks this itself,
// so two requests at once cannot get past it, and a write that ends after the
// scheduled time is refused also before a request promotes the test.
const OPEN_UPLOAD = `EXISTS (SELECT 1 FROM submissions s JOIN tests t ON t.id = s.test_id
  WHERE s.id = ? AND s.status = 'uploading' AND t.status = 'open'
    AND (t.evaluation_at IS NULL OR t.evaluation_at > ?))`;

// The new file's id, or null when the upload is closed, sent, gone, or full.
export async function addSubmissionFile(
  db: D1Database,
  submissionId: number,
  file: StoredFile & { size: number; position: number },
  now: string,
): Promise<number | null> {
  const row = await db
    .prepare(
      `INSERT INTO submission_files (submission_id, r2_key, original_name, content_type, size, position, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?
       WHERE ${OPEN_UPLOAD}
         AND (SELECT COUNT(*) FROM submission_files WHERE submission_id = ?) < ?
       RETURNING id`,
    )
    .bind(submissionId, file.key, file.name, file.type, file.size, file.position, now, submissionId, now, submissionId, MAX_STUDENT_FILES)
    .first<{ id: number }>();
  return row?.id ?? null;
}

export async function findSessionFile(db: D1Database, submissionId: number, fileId: number): Promise<StoredFile | null> {
  const row = await db
    .prepare('SELECT r2_key, original_name, content_type FROM submission_files WHERE id = ? AND submission_id = ?')
    .bind(fileId, submissionId)
    .first<{ r2_key: string; original_name: string; content_type: string }>();
  return row ? { key: row.r2_key, name: row.original_name, type: row.content_type } : null;
}

// False when nothing was deleted: the file is gone, or the upload is closed or sent.
export async function deleteSessionFile(db: D1Database, submissionId: number, fileId: number, now: string): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM submission_files WHERE id = ? AND submission_id = ? AND ${OPEN_UPLOAD}`)
    .bind(fileId, submissionId, submissionId, now)
    .run();
  return result.meta.changes > 0;
}

// uploading → submitted, in one transaction with the file count. Null when
// the upload has no files, was already sent, or its test is closed or its
// scheduled time has come.
export async function confirmSubmission(db: D1Database, submissionId: number, now: string): Promise<number | null> {
  const [updated, counted] = await db.batch<Record<string, number>>([
    db
      .prepare(
        `UPDATE submissions SET status = 'submitted', submitted_at = ?
         WHERE id = ? AND status = 'uploading'
           AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND t.status = 'open'
             AND (t.evaluation_at IS NULL OR t.evaluation_at > ?))
           AND EXISTS (SELECT 1 FROM submission_files f WHERE f.submission_id = submissions.id)
         RETURNING id`,
      )
      .bind(now, submissionId, now),
    db.prepare('SELECT COUNT(*) AS count FROM submission_files WHERE submission_id = ?').bind(submissionId),
  ]);
  if (!updated?.results.length) return null;
  return counted?.results[0]?.count ?? 0;
}

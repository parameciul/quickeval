import type { D1Database } from '@cloudflare/workers-types';
import type { ExerciseListInfo, TestInfo, TestSummary, UploadRow, UploadStatus } from '../../shared/api.ts';
import type { TestFileKind } from '../../shared/files.ts';
import { compareStudentNames } from '../../shared/students.ts';
import { buildTestCode, type ExerciseListStatus, type TestStatus } from '../../shared/tests.ts';
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';

export interface StoredFile {
  key: string;
  name: string;
  type: string;
}

// A test as the API works with it: the summary the browser sees, plus its
// database id and the R2 keys of its files.
export interface TestRecord {
  id: number;
  summary: TestSummary;
  uploadToken: string | null;
  files: Record<TestFileKind, StoredFile | null>;
  exerciseList: ExerciseListInfo;
}

interface TestRow {
  id: number;
  code: string;
  title: string;
  status: TestStatus;
  class_id: number;
  class_name: string;
  school_year: number;
  created_at: string;
  started_at: string | null;
  evaluation_at: string | null;
  evaluation_started_at: string | null;
  upload_token: string | null;
  test_file_key: string | null;
  test_file_name: string | null;
  test_file_type: string | null;
  barem_file_key: string | null;
  barem_file_name: string | null;
  barem_file_type: string | null;
  exercise_list_status: ExerciseListStatus;
  exercise_list_message: string | null;
  student_count: number;
  submitted_count: number;
  graded_count: number;
}

const SELECT_TEST = `
  SELECT t.id, t.code, t.title, t.status, t.class_id, c.name AS class_name, c.school_year,
    t.created_at, t.started_at, t.evaluation_at, t.evaluation_started_at, t.upload_token,
    t.test_file_key, t.test_file_name, t.test_file_type,
    t.barem_file_key, t.barem_file_name, t.barem_file_type, t.exercise_list_status, t.exercise_list_message,
    (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = t.class_id AND e.active = 1) AS student_count,
    (SELECT COUNT(*) FROM submissions s WHERE s.test_id = t.id AND s.status <> 'uploading') AS submitted_count,
    (SELECT COUNT(*) FROM submissions s WHERE s.test_id = t.id AND s.status = 'graded') AS graded_count
  FROM tests t JOIN classes c ON c.id = t.class_id`;

function storedFile(key: string | null, name: string | null, type: string | null): StoredFile | null {
  return key && name && type ? { key, name, type } : null;
}

function toRecord(row: TestRow): TestRecord {
  return {
    id: row.id,
    summary: {
      code: row.code,
      title: row.title,
      status: row.status,
      classId: row.class_id,
      className: row.class_name,
      schoolYear: row.school_year,
      createdAt: row.created_at,
      startedAt: row.started_at,
      evaluationAt: row.evaluation_at,
      evaluationStartedAt: row.evaluation_started_at,
      studentCount: row.student_count,
      submittedCount: row.submitted_count,
      gradedCount: row.graded_count,
    },
    uploadToken: row.upload_token,
    files: {
      test: storedFile(row.test_file_key, row.test_file_name, row.test_file_type),
      barem: storedFile(row.barem_file_key, row.barem_file_name, row.barem_file_type),
    },
    exerciseList: { status: row.exercise_list_status, message: row.exercise_list_message },
  };
}

// What the teacher app sees of a test: no R2 keys.
export function toTestInfo(record: TestRecord): TestInfo {
  const info = (file: StoredFile | null) => (file ? { name: file.name, type: file.type } : null);
  return {
    ...record.summary,
    uploadToken: record.uploadToken,
    files: { test: info(record.files.test), barem: info(record.files.barem) },
    exerciseList: record.exerciseList,
  };
}

// Tests of the teacher's classes in one school year, newest first.
export async function listTests(db: D1Database, teacherId: number, schoolYear: number): Promise<TestSummary[]> {
  const { results } = await db
    .prepare(`${SELECT_TEST} WHERE t.teacher_id = ? AND c.school_year = ? ORDER BY t.created_at DESC, t.id DESC`)
    .bind(teacherId, schoolYear)
    .all<TestRow>();
  return results.map((row) => toRecord(row).summary);
}

// Tests of one class, newest first.
export async function listClassTests(db: D1Database, teacherId: number, classId: number): Promise<TestSummary[]> {
  const { results } = await db
    .prepare(`${SELECT_TEST} WHERE t.teacher_id = ? AND t.class_id = ? ORDER BY t.number DESC`)
    .bind(teacherId, classId)
    .all<TestRow>();
  return results.map((row) => toRecord(row).summary);
}

export async function findTest(db: D1Database, teacherId: number, code: string): Promise<TestRecord | null> {
  const row = await db.prepare(`${SELECT_TEST} WHERE t.teacher_id = ? AND t.code = ?`).bind(teacherId, code).first<TestRow>();
  return row ? toRecord(row) : null;
}

export async function requireTest(db: D1Database, teacherId: number, code: string): Promise<TestRecord> {
  const record = await findTest(db, teacherId, code);
  if (!record) throw notFound();
  return record;
}

// The uploads table in one query: every active student of the class, and any
// student who left the class after starting an upload. Sorted by name.
export async function listUploads(db: D1Database, testId: number, classId: number): Promise<UploadRow[]> {
  const { results } = await db
    .prepare(
      `SELECT st.id AS student_id, st.full_name, e.active,
         s.id AS submission_id, s.status, s.started_at, s.submitted_at, s.auto_submitted, s.last_error, ev.grade,
         (SELECT COUNT(*) FROM submission_files f WHERE f.submission_id = s.id) AS file_count,
         (SELECT COUNT(*) FROM evaluation_items i WHERE i.evaluation_id = ev.id AND i.needs_review = 1 AND i.reviewed_at IS NULL)
           + CASE WHEN json_array_length(ev.unreadable_json) > 0 THEN 1 ELSE 0 END AS flag_count
       FROM enrollments e
       JOIN students st ON st.id = e.student_id
       LEFT JOIN submissions s ON s.test_id = ? AND s.student_id = e.student_id
       LEFT JOIN evaluations ev ON ev.submission_id = s.id
       WHERE e.class_id = ? AND (e.active = 1 OR s.id IS NOT NULL)`,
    )
    .bind(testId, classId)
    .all<{
      student_id: number;
      full_name: string;
      active: number;
      submission_id: number | null;
      status: UploadStatus | null;
      started_at: string | null;
      submitted_at: string | null;
      auto_submitted: number | null;
      last_error: string | null;
      grade: number | null;
      file_count: number;
      flag_count: number;
    }>();
  return results
    .map((row) => ({
      studentId: row.student_id,
      studentName: row.full_name,
      active: row.active === 1,
      submissionId: row.submission_id,
      status: row.status ?? 'none',
      fileCount: row.file_count,
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
      autoSubmitted: row.auto_submitted === 1,
      grade: row.grade,
      flagCount: row.flag_count,
      lastError: row.last_error,
    }))
    .sort((a, b) => compareStudentNames(a.studentName, b.studentName));
}

const MAX_CODE_TRIES = 3;

// Makes a draft test with the class's next number, for example "6E2-26T3".
// The number and the code are unique, so a test made at the same moment, or a
// class that had this name before a rename, can already hold them: the counter
// then moves past that number and the next try takes a new one. At most 12
// queries.
export async function createTest(db: D1Database, teacherId: number, classId: number, title: string, now: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_CODE_TRIES; attempt++) {
    const cls = await db
      .prepare('SELECT name, school_year, next_test_number, archived FROM classes WHERE id = ? AND teacher_id = ?')
      .bind(classId, teacherId)
      .first<{ name: string; school_year: number; next_test_number: number; archived: number }>();
    if (!cls) throw notFound();
    if (cls.archived === 1) {
      throw new ApiError(409, 'class_archived', 'Clasa este arhivată. Scoate-o din arhivă ca să faci un test nou.');
    }
    const number = cls.next_test_number;
    const code = buildTestCode(cls.name, cls.school_year, number);
    try {
      await db.batch([
        db
          .prepare('INSERT INTO tests (teacher_id, class_id, number, code, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(teacherId, classId, number, code, title, now, now),
        db.prepare('UPDATE classes SET next_test_number = ? WHERE id = ? AND teacher_id = ?').bind(number + 1, classId, teacherId),
      ]);
      return code;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      await db
        .prepare('UPDATE classes SET next_test_number = ? WHERE id = ? AND teacher_id = ? AND next_test_number <= ?')
        .bind(number + 1, classId, teacherId, number)
        .run();
    }
  }
  throw new ApiError(409, 'busy', 'Nu am putut alege un cod pentru test. Încearcă din nou.');
}

export async function renameTest(db: D1Database, teacherId: number, code: string, title: string, now: string): Promise<boolean> {
  const row = await db
    .prepare('UPDATE tests SET title = ?, updated_at = ? WHERE teacher_id = ? AND code = ? RETURNING id')
    .bind(title, now, teacherId, code)
    .first<{ id: number }>();
  return row !== null;
}

// draft → open, with a new upload link. Null when the test is no longer a draft.
export async function startTest(
  db: D1Database,
  teacherId: number,
  testId: number,
  uploadToken: string,
  now: string,
): Promise<{ uploadToken: string; startedAt: string } | null> {
  const row = await db
    .prepare(
      `UPDATE tests SET status = 'open', upload_token = ?, started_at = ?, updated_at = ?
       WHERE id = ? AND teacher_id = ? AND status = 'draft'
       RETURNING upload_token, started_at`,
    )
    .bind(uploadToken, now, now, testId, teacherId)
    .first<{ upload_token: string; started_at: string }>();
  return row ? { uploadToken: row.upload_token, startedAt: row.started_at } : null;
}

// evaluating or done → open (spec §8.5). Graded results stay; a scheduled
// evaluation is cancelled; a ready analysis is marked as possibly out of date.
// An upload that a run is grading goes back to the queue: that run's result is
// then refused, and the upload is graded after the next Start evaluation, with
// the files of that time. False when the test was not closed.
export async function reopenTest(db: D1Database, teacherId: number, testId: number, now: string): Promise<boolean> {
  const [reopened] = await db.batch<{ id: number }>([
    db
      .prepare(
        `UPDATE tests SET status = 'open', evaluation_at = NULL, updated_at = ?,
           analysis_stale = CASE WHEN analysis_status = 'ready' THEN 1 ELSE analysis_stale END
         WHERE id = ? AND teacher_id = ? AND status IN ('evaluating', 'done')
         RETURNING id`,
      )
      .bind(now, testId, teacherId),
    // Only an open test of this teacher: no upload is in grading while a test is open, except after a reopen.
    db
      .prepare(
        `UPDATE submissions SET status = 'submitted', run_id = NULL
         WHERE test_id = ? AND status = 'grading'
           AND EXISTS (SELECT 1 FROM tests t WHERE t.id = ? AND t.teacher_id = ? AND t.status = 'open')`,
      )
      .bind(testId, testId, teacherId),
  ]);
  return Boolean(reopened?.results.length);
}

// Points the test at a new test or barem file, and counts the change in
// files_version. A new barem also clears the exercise list, which the robot
// made from the old one (spec §8.5).
export async function saveTestFile(
  db: D1Database,
  teacherId: number,
  testId: number,
  kind: TestFileKind,
  file: StoredFile,
  now: string,
): Promise<void> {
  const sql =
    kind === 'test'
      ? `UPDATE tests SET test_file_key = ?, test_file_name = ?, test_file_type = ?, updated_at = ?, files_version = files_version + 1
         WHERE id = ? AND teacher_id = ?`
      : `UPDATE tests SET barem_file_key = ?, barem_file_name = ?, barem_file_type = ?, updated_at = ?, files_version = files_version + 1,
           exercise_list_status = 'none', exercise_list_json = NULL, exercise_list_message = NULL, exercise_list_attempts = 0
         WHERE id = ? AND teacher_id = ?`;
  await db.prepare(sql).bind(file.key, file.name, file.type, now, testId, teacherId).run();
}

// Every R2 key of a test: its test and barem files and all student files.
export async function listTestKeys(db: D1Database, record: TestRecord): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT f.r2_key FROM submission_files f JOIN submissions s ON s.id = f.submission_id WHERE s.test_id = ?')
    .bind(record.id)
    .all<{ r2_key: string }>();
  const keys = results.map((row) => row.r2_key);
  for (const file of [record.files.test, record.files.barem]) if (file) keys.push(file.key);
  return keys;
}

// Deletes the test row; its uploads and file rows go with it (ON DELETE CASCADE).
export async function deleteTestRow(db: D1Database, teacherId: number, testId: number): Promise<void> {
  await db.prepare('DELETE FROM tests WHERE id = ? AND teacher_id = ?').bind(testId, teacherId).run();
}

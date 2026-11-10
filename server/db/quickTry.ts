import type { D1Database } from '@cloudflare/workers-types';
import type { SubmissionFile, Teacher } from '../../shared/api.ts';
import {
  bucharestDay,
  QUICK_TRY_CLASS,
  QUICK_TRY_DAILY_LIMIT,
  QUICK_TRY_DAYS,
  QUICK_TRY_GUEST,
  QUICK_TRY_IP_LIMIT,
  QUICK_TRY_STUDENT,
  QUICK_TRY_TITLE,
} from '../../shared/quickTry.ts';
import { schoolYearOf } from '../../shared/schoolYear.ts';
import { buildTestCode } from '../../shared/tests.ts';

// Quick Try's rows (spec §7): a hidden guest teacher with one class, one
// student, one open test and one paper, and the quick_tries row that names
// them by the link's token hash.

const DAY_MS = 24 * 60 * 60 * 1000;

// A try (alias q) whose grading failed for good gives its IP place back: its
// barem or exercise list failed, or its paper failed.
const GAVE_BACK = `EXISTS (SELECT 1 FROM tests gt WHERE gt.teacher_id = q.teacher_id
  AND (gt.barem_request = 'failed' OR gt.exercise_list_status = 'failed'
       OR EXISTS (SELECT 1 FROM submissions gs WHERE gs.test_id = gt.id AND gs.status = 'failed')))`;

// ?1 day, ?2 IP hash.
const IP_COUNT = `(SELECT COUNT(*) FROM quick_tries q WHERE q.day = ?1 AND q.ip_hash = ?2 AND q.by_admin = 0 AND NOT ${GAVE_BACK})`;
const DAY_COUNT = '(SELECT COUNT(*) FROM quick_tries q WHERE q.day = ?1 AND q.by_admin = 0)';

export interface NewQuickTry {
  tokenHash: string;
  ipHash: string;
  byAdmin: boolean;
  // The guest teacher's email: unique, never a real address.
  email: string;
  // The hash of the paper's session secret, and the paper's result token.
  sessionHash: string;
  resultToken: string;
  now: string;
}

export type QuickTryRefusal = 'ip_limit' | 'daily_limit';

export interface QuickTryRow {
  teacherId: number;
  testId: number;
  code: string;
  schoolYear: number;
  studentId: number;
  submissionId: number;
  sessionHash: string;
  createdAt: string;
  expiresAt: string;
}

// Makes the try in one batch. The limits are checked in the first INSERT; the
// others read the guest teacher by its email, so when the first one is refused
// they insert nothing. An administrator's try skips the limits and is not counted.
export async function createQuickTry(db: D1Database, input: NewQuickTry): Promise<{ teacherId: number; code: string } | QuickTryRefusal> {
  const day = bucharestDay(new Date(input.now));
  const expiresAt = new Date(Date.parse(input.now) + QUICK_TRY_DAYS * DAY_MS).toISOString();
  const schoolYear = schoolYearOf(new Date(input.now));
  const code = buildTestCode(QUICK_TRY_CLASS, schoolYear, 1);
  const admin = input.byAdmin ? 1 : 0;
  const guest = 'SELECT id FROM teachers WHERE email = ?';
  const results = await db.batch<{ id: number }>([
    db
      .prepare(
        `INSERT INTO teachers (email, name, created_at, email_confirmed_at, status, quick_try)
         SELECT ?3, ?4, ?5, ?5, 'disabled', 1
         WHERE ?6 = 1 OR (${IP_COUNT} < ${QUICK_TRY_IP_LIMIT} AND ${DAY_COUNT} < ${QUICK_TRY_DAILY_LIMIT})
         RETURNING id`,
      )
      .bind(day, input.ipHash, input.email, QUICK_TRY_GUEST, input.now, admin),
    db
      .prepare(
        `INSERT INTO quick_tries (teacher_id, token_hash, day, ip_hash, by_admin, created_at, expires_at)
         SELECT id, ?, ?, ?, ?, ?, ? FROM teachers WHERE email = ?`,
      )
      .bind(input.tokenHash, day, input.ipHash, admin, input.now, expiresAt, input.email),
    db
      .prepare(`INSERT INTO classes (teacher_id, name, school_year, next_test_number, created_at) SELECT id, ?, ?, 2, ? FROM teachers WHERE email = ?`)
      .bind(QUICK_TRY_CLASS, schoolYear, input.now, input.email),
    db
      .prepare('INSERT INTO students (teacher_id, full_name, created_at) SELECT id, ?, ? FROM teachers WHERE email = ?')
      .bind(QUICK_TRY_STUDENT, input.now, input.email),
    db
      .prepare(
        `INSERT INTO enrollments (class_id, student_id)
         SELECT c.id, s.id FROM classes c JOIN students s ON s.teacher_id = c.teacher_id WHERE c.teacher_id = (${guest})`,
      )
      .bind(input.email),
    db
      .prepare(
        `INSERT INTO tests (teacher_id, class_id, number, code, title, status, started_at, quick_try, created_at, updated_at)
         SELECT c.teacher_id, c.id, 1, ?, ?, 'open', ?, 1, ?, ? FROM classes c WHERE c.teacher_id = (${guest})`,
      )
      .bind(code, QUICK_TRY_TITLE, input.now, input.now, input.now, input.email),
    db
      .prepare(
        `INSERT INTO submissions (test_id, student_id, status, session_hash, result_token, started_at)
         SELECT t.id, s.id, 'uploading', ?, ?, ? FROM tests t JOIN students s ON s.teacher_id = t.teacher_id WHERE t.teacher_id = (${guest})`,
      )
      .bind(input.sessionHash, input.resultToken, input.now, input.email),
  ]);
  const teacherId = results[0]?.results[0]?.id;
  if (teacherId !== undefined) return { teacherId, code };
  const full = await db.prepare(`SELECT ${DAY_COUNT} >= ${QUICK_TRY_DAILY_LIMIT} AS full`).bind(day).first<{ full: number }>();
  return full?.full ? 'daily_limit' : 'ip_limit';
}

// Whether the platform has no try left today (administrators skip it).
export async function dailyLimitReached(db: D1Database, now: string): Promise<boolean> {
  const row = await db.prepare(`SELECT ${DAY_COUNT} >= ${QUICK_TRY_DAILY_LIMIT} AS full`).bind(bucharestDay(new Date(now))).first<{ full: number }>();
  return Boolean(row?.full);
}

// The try of a link, by its token's hash.
export async function findQuickTry(db: D1Database, tokenHash: string): Promise<QuickTryRow | null> {
  const row = await db
    .prepare(
      `SELECT q.teacher_id, t.id AS test_id, t.code, c.school_year, s.student_id, s.id AS submission_id, s.session_hash,
         q.created_at, q.expires_at
       FROM quick_tries q JOIN tests t ON t.teacher_id = q.teacher_id JOIN classes c ON c.id = t.class_id
         JOIN submissions s ON s.test_id = t.id
       WHERE q.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<{
      teacher_id: number;
      test_id: number;
      code: string;
      school_year: number;
      student_id: number;
      submission_id: number;
      session_hash: string;
      created_at: string;
      expires_at: string;
    }>();
  if (!row) return null;
  return {
    teacherId: row.teacher_id,
    testId: row.test_id,
    code: row.code,
    schoolYear: row.school_year,
    studentId: row.student_id,
    submissionId: row.submission_id,
    sessionHash: row.session_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

// The guest teacher of a try, as the teacher API's routes read it from
// c.var.teacher: only its id names rows; it is never an administrator and
// never a demo account.
export function guestTeacher(teacherId: number): Teacher {
  return { id: teacherId, email: '', name: QUICK_TRY_GUEST, role: 'teacher', demo: false, testsEvaluated: 0, papersGraded: 0, papersWaiting: 0 };
}

// The pages of the try's paper, in upload order.
export async function listPaperFiles(db: D1Database, submissionId: number): Promise<SubmissionFile[]> {
  const rows = await db
    .prepare('SELECT id, original_name, content_type, size, position FROM submission_files WHERE submission_id = ? ORDER BY position, id')
    .bind(submissionId)
    .all<{ id: number; original_name: string; content_type: string; size: number; position: number }>();
  return rows.results.map((row) => ({ id: row.id, name: row.original_name, contentType: row.content_type, size: row.size, position: row.position }));
}

// The guest teachers of the tries whose days are over, the oldest first.
const EXPIRED = `SELECT q.teacher_id FROM quick_tries q JOIN teachers g ON g.id = q.teacher_id AND g.quick_try = 1
  WHERE q.expires_at <= ? ORDER BY q.expires_at, q.id LIMIT ?`;

// The ids of a JSON list, kept to guest teachers: a cleanup never reaches an account.
const GUESTS = 'SELECT id FROM teachers WHERE quick_try = 1 AND id IN (SELECT value FROM json_each(?1))';

// Up to `limit` tries whose days are over, and the R2 keys of their files,
// read from the rows (never from listing R2).
export async function expiredTries(db: D1Database, now: string, limit: number): Promise<{ teacherIds: number[]; keys: string[] }> {
  const found = await db.prepare(EXPIRED).bind(now, limit).all<{ teacher_id: number }>();
  const teacherIds = found.results.map((row) => row.teacher_id);
  if (teacherIds.length === 0) return { teacherIds, keys: [] };
  // One row per test with its six file keys, and one per page (D1 allows few
  // parts in a compound SELECT).
  const rows = await db
    .prepare(
      `SELECT test_file_key AS a, barem_file_key AS b, print_file_key AS c, ces_test_file_key AS d, ces_barem_file_key AS e, ces_print_file_key AS f
       FROM tests WHERE teacher_id IN (${GUESTS})
       UNION ALL
       SELECT p.r2_key, NULL, NULL, NULL, NULL, NULL FROM submission_files p JOIN submissions s ON s.id = p.submission_id JOIN tests t ON t.id = s.test_id
       WHERE t.teacher_id IN (${GUESTS})`,
    )
    .bind(JSON.stringify(teacherIds))
    .all<Record<string, string | null>>();
  const keys = rows.results.flatMap((row) => Object.values(row).filter((key): key is string => typeof key === 'string'));
  return { teacherIds, keys };
}

// Deletes the tries' rows in one batch, in the order the foreign keys need:
// the test (its paper, pages, grading and points go with it), the class
// list, the student, the class, the try and the guest teacher (its sessions go with it).
export async function deleteTries(db: D1Database, teacherIds: number[]): Promise<void> {
  const list = JSON.stringify(teacherIds);
  await db.batch(
    [
      `DELETE FROM tests WHERE teacher_id IN (${GUESTS})`,
      `DELETE FROM enrollments WHERE class_id IN (SELECT id FROM classes WHERE teacher_id IN (${GUESTS}))`,
      `DELETE FROM students WHERE teacher_id IN (${GUESTS})`,
      `DELETE FROM classes WHERE teacher_id IN (${GUESTS})`,
      `DELETE FROM quick_tries WHERE teacher_id IN (${GUESTS})`,
      `DELETE FROM teachers WHERE id IN (${GUESTS})`,
    ].map((sql) => db.prepare(sql).bind(list)),
  );
}

// Whether the test is a Quick Try test: its refusals have their own messages.
export async function isQuickTryTest(db: D1Database, testId: number): Promise<boolean> {
  const row = await db.prepare('SELECT quick_try FROM tests WHERE id = ?').bind(testId).first<{ quick_try: number }>();
  return row?.quick_try === 1;
}

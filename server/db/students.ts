import type { D1Database } from '@cloudflare/workers-types';
import type { StudentClass, StudentHistory, StudentResult, StudentRow } from '../../shared/api.ts';
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';
import { flagCountSql } from './evaluations.ts';

// Adds new students and enrolls them in the class with a fixed number of
// queries, whatever the number of names: the free plan limits the queries per
// request. The ids are chosen here (one above the current maximum) so the
// enrollment insert can name them. Both inserts run in one batch, which D1 runs
// as one transaction: either every name is added or none is. If another request
// took one of these ids in the meantime, the batch fails on the primary key and
// the teacher is asked to try again. Both inserts also check that the class
// belongs to the teacher, so nothing is added to another teacher's class.
export async function addStudentsToClass(
  db: D1Database,
  teacherId: number,
  classId: number,
  names: string[],
  now: string,
): Promise<StudentRow[]> {
  const top = await db.prepare('SELECT COALESCE(MAX(id), 0) AS max FROM students').first<{ max: number }>();
  const rows = names.map((fullName, index) => ({ id: (top?.max ?? 0) + index + 1, fullName }));
  const json = JSON.stringify(rows);
  const ownsClass = 'EXISTS (SELECT 1 FROM classes WHERE id = ? AND teacher_id = ?)';
  let inserted: number;
  try {
    const [students] = await db.batch([
      db
        .prepare(
          `INSERT INTO students (id, teacher_id, full_name, created_at)
           SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.fullName'), ? FROM json_each(?)
           WHERE ${ownsClass}`,
        )
        .bind(teacherId, now, json, classId, teacherId),
      db
        .prepare(`INSERT INTO enrollments (class_id, student_id) SELECT ?, json_extract(value, '$.id') FROM json_each(?) WHERE ${ownsClass}`)
        .bind(classId, json, classId, teacherId),
    ]);
    inserted = students?.meta.changes ?? 0;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, 'busy', 'Altcineva a adăugat elevi în același timp. Încearcă din nou.');
    }
    throw err;
  }
  if (inserted === 0) throw notFound();
  return rows.map((row) => ({ id: row.id, fullName: row.fullName, active: true }));
}

// Marks a student as left (active = false) or back in the class. The class must
// belong to the teacher. Returns null when the student is not in that class.
export async function setEnrollmentActive(
  db: D1Database,
  teacherId: number,
  classId: number,
  studentId: number,
  active: boolean,
): Promise<StudentRow | null> {
  const row = await db
    .prepare(
      `UPDATE enrollments SET active = ?
       WHERE class_id = ? AND student_id = ?
         AND class_id IN (SELECT id FROM classes WHERE teacher_id = ?)
       RETURNING student_id`,
    )
    .bind(active ? 1 : 0, classId, studentId, teacherId)
    .first<{ student_id: number }>();
  if (!row) return null;
  const student = await db
    .prepare('SELECT full_name FROM students WHERE id = ? AND teacher_id = ?')
    .bind(studentId, teacherId)
    .first<{ full_name: string }>();
  return { id: studentId, fullName: student!.full_name, active };
}

export async function renameStudent(
  db: D1Database,
  teacherId: number,
  studentId: number,
  fullName: string,
): Promise<{ id: number; fullName: string } | null> {
  const row = await db
    .prepare('UPDATE students SET full_name = ? WHERE id = ? AND teacher_id = ? RETURNING id')
    .bind(fullName, studentId, teacherId)
    .first<{ id: number }>();
  return row ? { id: row.id, fullName } : null;
}

// The student page: the student, the student's classes, and every graded test,
// newest first. Null when the student is not the teacher's.
export async function getStudentHistory(db: D1Database, teacherId: number, studentId: number): Promise<StudentHistory | null> {
  const [student, classes, results] = await db.batch<Record<string, unknown>>([
    db.prepare('SELECT id, full_name FROM students WHERE id = ? AND teacher_id = ?').bind(studentId, teacherId),
    db
      .prepare(
        `SELECT c.id, c.name, c.school_year, e.active FROM enrollments e JOIN classes c ON c.id = e.class_id
         WHERE e.student_id = ? AND c.teacher_id = ?
         ORDER BY c.school_year DESC, c.name`,
      )
      .bind(studentId, teacherId),
    db
      .prepare(
        `SELECT s.id AS submission_id, t.code, t.title, c.name AS class_name, c.school_year,
           COALESCE(t.started_at, t.created_at) AS date, ev.grade, ${flagCountSql('ev')} AS flag_count
         FROM submissions s
         JOIN tests t ON t.id = s.test_id
         JOIN classes c ON c.id = t.class_id
         JOIN evaluations ev ON ev.submission_id = s.id
         WHERE s.student_id = ? AND t.teacher_id = ? AND s.status = 'graded'
         ORDER BY date DESC, t.id DESC`,
      )
      .bind(studentId, teacherId),
  ]);
  const row = student?.results[0] as { id: number; full_name: string } | undefined;
  if (!row) return null;
  return {
    student: { id: row.id, fullName: row.full_name },
    classes: ((classes?.results ?? []) as { id: number; name: string; school_year: number; active: number }[]).map(
      (cls): StudentClass => ({ id: cls.id, name: cls.name, schoolYear: cls.school_year, active: cls.active === 1 }),
    ),
    results: (
      (results?.results ?? []) as {
        submission_id: number;
        code: string;
        title: string;
        class_name: string;
        school_year: number;
        date: string;
        grade: number;
        flag_count: number;
      }[]
    ).map(
      (result): StudentResult => ({
        submissionId: result.submission_id,
        testCode: result.code,
        testTitle: result.title,
        className: result.class_name,
        schoolYear: result.school_year,
        date: result.date,
        grade: result.grade,
        flagCount: result.flag_count,
      }),
    ),
  };
}

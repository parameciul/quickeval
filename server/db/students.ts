import type { D1Database } from '@cloudflare/workers-types';
import type { StudentRow } from '../../shared/api.ts';
import { ApiError, isUniqueViolation } from '../errors.ts';

// Adds new students and enrolls them in the class with a fixed number of
// queries, whatever the number of names: the free plan limits the queries per
// request. The ids are chosen here (one above the current maximum) so the
// enrollment insert can name them. Both inserts run in one batch, which D1 runs
// as one transaction: either every name is added or none is. If another request
// took one of these ids in the meantime, the batch fails on the primary key and
// the teacher is asked to try again.
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
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO students (id, teacher_id, full_name, created_at)
           SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.fullName'), ? FROM json_each(?)`,
        )
        .bind(teacherId, now, json),
      db
        .prepare('INSERT INTO enrollments (class_id, student_id) SELECT ?, json_extract(value, \'$.id\') FROM json_each(?)')
        .bind(classId, json),
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, 'busy', 'Altcineva a adăugat elevi în același timp. Încearcă din nou.');
    }
    throw err;
  }
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

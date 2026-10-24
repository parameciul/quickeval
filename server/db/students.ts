import type { D1Database } from '@cloudflare/workers-types';
import type { StudentClass, StudentHistory, StudentResult, StudentRow } from '../../shared/api.ts';
import { studentNameKey, studentNameKeySql } from '../../shared/students.ts';
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';
import { flagCountSql } from './evaluations.ts';

// Adds new students and enrolls them in the class with a fixed number of
// queries, whatever the number of names: the free plan limits the queries per
// request. The ids are chosen here (one above the current maximum) so the
// enrollment insert can name them. Both inserts run in one batch, which D1 runs
// as one transaction: either every name is added or none is. If another request
// took one of these ids in the meantime, the batch fails on the primary key and
// the teacher is asked to try again. Both inserts also check that the class
// belongs to the teacher, so nothing is added to another teacher's class. Both
// also carry the same name guard: when any name of the list is already in the
// class (same name key, students who left included), neither inserts, so
// nothing is added. The read after a refused write only builds the message.
export async function addStudentsToClass(
  db: D1Database,
  teacherId: number,
  classId: number,
  names: string[],
  now: string,
): Promise<StudentRow[]> {
  const top = await db.prepare('SELECT COALESCE(MAX(id), 0) AS max FROM students').first<{ max: number }>();
  const rows = names.map((fullName, index) => ({
    id: (top?.max ?? 0) + index + 1,
    fullName,
    key: studentNameKey(fullName),
  }));
  const json = JSON.stringify(rows);
  const ownsClass = 'EXISTS (SELECT 1 FROM classes WHERE id = ? AND teacher_id = ?)';
  const noClash = `NOT EXISTS (
    SELECT 1 FROM json_each(?) n
    JOIN enrollments e ON e.class_id = ?
    JOIN students s ON s.id = e.student_id
    WHERE ${studentNameKeySql('s.full_name')} = json_extract(n.value, '$.key'))`;
  let inserted: number;
  try {
    const [students] = await db.batch([
      db
        .prepare(
          `INSERT INTO students (id, teacher_id, full_name, created_at)
           SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.fullName'), ? FROM json_each(?)
           WHERE ${ownsClass} AND ${noClash}`,
        )
        .bind(teacherId, now, json, classId, teacherId, json, classId),
      db
        .prepare(
          `INSERT INTO enrollments (class_id, student_id)
           SELECT ?, json_extract(value, '$.id') FROM json_each(?)
           WHERE ${ownsClass} AND ${noClash}`,
        )
        .bind(classId, json, classId, teacherId, json, classId),
    ]);
    inserted = students?.meta.changes ?? 0;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, 'busy', 'Altcineva a adăugat elevi în același timp. Încearcă din nou.');
    }
    throw err;
  }
  if (inserted === 0) throw await refusedAdd(db, teacherId, classId, names);
  return rows.map((row) => ({ id: row.id, fullName: row.fullName, active: true, canDelete: true }));
}

// Why an add changed nothing: the class is not the teacher's (404), or names of
// the list are already in it (409). This read never decides whether to write.
async function refusedAdd(db: D1Database, teacherId: number, classId: number, names: string[]): Promise<ApiError> {
  const [owned, existing] = await db.batch<{ full_name: string }>([
    db.prepare('SELECT id AS full_name FROM classes WHERE id = ? AND teacher_id = ?').bind(classId, teacherId),
    db.prepare('SELECT s.full_name FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.class_id = ?').bind(classId),
  ]);
  if (!owned || owned.results.length === 0) return notFound();
  const taken = new Set((existing?.results ?? []).map((row) => studentNameKey(row.full_name)));
  const clashes = names.filter((name) => taken.has(studentNameKey(name)));
  if (clashes.length === 0) return new ApiError(409, 'busy', 'Altcineva a adăugat elevi în același timp. Încearcă din nou.');
  const quoted = clashes.slice(0, 3).map((name) => `„${name}”`);
  if (clashes.length === 1) return new ApiError(409, 'student_exists', `Elevul ${quoted[0]} este deja în clasă.`);
  const rest = clashes.length > 3 ? ` și încă ${clashes.length - 3}` : '';
  return new ApiError(409, 'student_exists', `Elevii ${quoted.join(', ')}${rest} sunt deja în clasă.`);
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
    .prepare(`SELECT st.full_name, ${noWorkSql('st.id', '?')} AS can_delete FROM students st WHERE st.id = ? AND st.teacher_id = ?`)
    .bind(classId, studentId, teacherId)
    .first<{ full_name: string; can_delete: number }>();
  return { id: studentId, fullName: student!.full_name, active, canDelete: student!.can_delete === 1 };
}

// True when the student has no sent, grading or graded upload in the tests of
// the class: the two arguments are SQL expressions for the student id and the
// class id.
export function noWorkSql(studentId: string, classId: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM submissions sw JOIN tests tw ON tw.id = sw.test_id
    WHERE sw.student_id = ${studentId} AND tw.class_id = ${classId}
      AND sw.status IN ('submitted', 'grading', 'graded'))`;
}

// Deletes a student from a class: this class's enrollment and the student's
// unsent and failed uploads in this class's tests. The students row stays:
// ids come from MAX(id) + 1, so a deleted row would hand its id to the next
// student, and a page that still shows the old student would act on the new
// one. Both statements carry the same guard (the class is the teacher's and
// the student has no sent, grading or graded upload there), and the uploads go
// first because the guard of the enrollment statement reads uploads the first
// one never deletes. Returns the R2 keys of the deleted files, to remove after
// the batch. The read after a refused delete only tells 404 from 409.
export async function deleteStudentFromClass(
  db: D1Database,
  teacherId: number,
  classId: number,
  studentId: number,
): Promise<{ keys: string[] } | 'not_found' | 'has_work'> {
  const { results: files } = await db
    .prepare(
      `SELECT f.r2_key FROM submission_files f
       JOIN submissions s ON s.id = f.submission_id
       JOIN tests t ON t.id = s.test_id
       WHERE s.student_id = ? AND t.class_id = ? AND t.teacher_id = ?`,
    )
    .bind(studentId, classId, teacherId)
    .all<{ r2_key: string }>();
  const guard = `EXISTS (SELECT 1 FROM classes WHERE id = ? AND teacher_id = ?)
    AND ${noWorkSql('?', '?')}`;
  const guardBinds = [classId, teacherId, studentId, classId];
  const [, enrollment] = await db.batch<{ student_id: number }>([
    db
      .prepare(
        `DELETE FROM submissions
         WHERE student_id = ? AND test_id IN (SELECT id FROM tests WHERE class_id = ?) AND ${guard}`,
      )
      .bind(studentId, classId, ...guardBinds),
    db
      .prepare(`DELETE FROM enrollments WHERE class_id = ? AND student_id = ? AND ${guard} RETURNING student_id`)
      .bind(classId, studentId, ...guardBinds),
  ]);
  if (enrollment && enrollment.results.length > 0) return { keys: files.map((file) => file.r2_key) };
  const enrolled = await db
    .prepare(
      `SELECT 1 AS found FROM enrollments e JOIN classes c ON c.id = e.class_id AND c.teacher_id = ?
       WHERE e.class_id = ? AND e.student_id = ?`,
    )
    .bind(teacherId, classId, studentId)
    .first<{ found: number }>();
  return enrolled ? 'has_work' : 'not_found';
}

// Renames a student unless another student of one of the same classes has the
// same name key (the student's own name may change case). Returns null when the
// student is not the teacher's, and 'duplicate' when the name is taken.
export async function renameStudent(
  db: D1Database,
  teacherId: number,
  studentId: number,
  fullName: string,
): Promise<{ id: number; fullName: string } | null | 'duplicate'> {
  const row = await db
    .prepare(
      `UPDATE students SET full_name = ?
       WHERE id = ? AND teacher_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM enrollments mine
           JOIN enrollments other ON other.class_id = mine.class_id
           JOIN students s ON s.id = other.student_id
           WHERE mine.student_id = ? AND s.id <> ? AND ${studentNameKeySql('s.full_name')} = ?)
       RETURNING id`,
    )
    .bind(fullName, studentId, teacherId, studentId, studentId, studentNameKey(fullName))
    .first<{ id: number }>();
  if (row) return { id: row.id, fullName };
  const exists = await db
    .prepare('SELECT id FROM students WHERE id = ? AND teacher_id = ?')
    .bind(studentId, teacherId)
    .first<{ id: number }>();
  return exists ? 'duplicate' : null;
}

// The message for a refused rename: it names the first class that holds the name.
export async function renameClashMessage(
  db: D1Database,
  teacherId: number,
  studentId: number,
  fullName: string,
): Promise<string> {
  const cls = await db
    .prepare(
      `SELECT c.name FROM enrollments mine
       JOIN classes c ON c.id = mine.class_id AND c.teacher_id = ?
       JOIN enrollments other ON other.class_id = mine.class_id
       JOIN students s ON s.id = other.student_id
       WHERE mine.student_id = ? AND s.id <> ? AND ${studentNameKeySql('s.full_name')} = ?
       ORDER BY c.school_year DESC, c.name
       LIMIT 1`,
    )
    .bind(teacherId, studentId, studentId, studentNameKey(fullName))
    .first<{ name: string }>();
  return cls
    ? `Există deja un elev cu numele „${fullName}” în clasa ${cls.name}.`
    : `Există deja un elev cu numele „${fullName}” în clasă.`;
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

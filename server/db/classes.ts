import type { D1Database } from '@cloudflare/workers-types';
import type { ClassGrade, ClassSummary, StudentRow } from '../../shared/api.ts';
import { compareClassNames, displayClassName } from '../../shared/classes.ts';
import { formatSchoolYear } from '../../shared/schoolYear.ts';
import { compareStudentNames } from '../../shared/students.ts';
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';
import { GRADE_COLUMNS, gradeOf, noWorkSql, type GradeRow } from './students.ts';

interface ClassRow {
  id: number;
  name: string;
  school_year: number;
  archived: number;
  student_count: number;
}

const SELECT_CLASS = `
  SELECT c.id, c.name, c.school_year, c.archived,
    (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.active = 1) AS student_count
  FROM classes c`;

function toSummary(row: ClassRow): ClassSummary {
  return {
    id: row.id,
    name: row.name,
    schoolYear: row.school_year,
    archived: row.archived === 1,
    studentCount: row.student_count,
  };
}

function duplicateClass(name: string, schoolYear: number): ApiError {
  return new ApiError(409, 'class_exists', `${displayClassName(name)} există deja în anul școlar ${formatSchoolYear(schoolYear)}.`);
}

// Active classes first, then archived ones; "6E2" before "11R1".
export async function listClasses(db: D1Database, teacherId: number, schoolYear: number): Promise<ClassSummary[]> {
  const { results } = await db
    .prepare(`${SELECT_CLASS} WHERE c.teacher_id = ? AND c.school_year = ?`)
    .bind(teacherId, schoolYear)
    .all<ClassRow>();
  return results
    .map(toSummary)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || compareClassNames(a.name, b.name));
}

export async function getClass(db: D1Database, teacherId: number, classId: number): Promise<ClassSummary | null> {
  const row = await db
    .prepare(`${SELECT_CLASS} WHERE c.teacher_id = ? AND c.id = ?`)
    .bind(teacherId, classId)
    .first<ClassRow>();
  return row ? toSummary(row) : null;
}

export async function createClass(
  db: D1Database,
  teacherId: number,
  name: string,
  schoolYear: number,
  now: string,
): Promise<ClassSummary> {
  try {
    const row = await db
      .prepare('INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, ?, ?, ?) RETURNING id')
      .bind(teacherId, name, schoolYear, now)
      .first<{ id: number }>();
    return { id: row!.id, name, schoolYear, archived: false, studentCount: 0 };
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateClass(name, schoolYear);
    throw err;
  }
}

export async function updateClass(
  db: D1Database,
  teacherId: number,
  classId: number,
  changes: { name?: string | undefined; archived?: boolean | undefined },
): Promise<ClassSummary> {
  const current = await getClass(db, teacherId, classId);
  if (!current) throw notFound();
  const name = changes.name ?? current.name;
  const archived = changes.archived ?? current.archived;
  const update = db
    .prepare('UPDATE classes SET name = ?, archived = ? WHERE id = ? AND teacher_id = ?')
    .bind(name, archived ? 1 : 0, classId, teacherId);
  // Archiving the class closes every result page of its tests (for all, and
  // for single students); the tests stay as they are. A rename or taking the
  // class out of the archive opens nothing.
  const ARCHIVED_CLASS = 'SELECT 1 FROM classes c WHERE c.id = ? AND c.teacher_id = ? AND c.archived = 1';
  try {
    if (changes.archived === true) {
      await db.batch([
        update,
        db
          .prepare(`UPDATE tests SET results_open = 0 WHERE class_id = ? AND teacher_id = ? AND results_open = 1 AND EXISTS (${ARCHIVED_CLASS})`)
          .bind(classId, teacherId, classId, teacherId),
        db
          .prepare(
            `UPDATE submissions SET results_open = 0 WHERE results_open = 1
              AND test_id IN (SELECT t.id FROM tests t WHERE t.class_id = ? AND t.teacher_id = ?)
              AND EXISTS (${ARCHIVED_CLASS})`,
          )
          .bind(classId, teacherId, classId, teacherId),
      ]);
    } else {
      await update.run();
    }
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateClass(name, current.schoolYear);
    throw err;
  }
  return { ...current, name, archived };
}

// All students ever enrolled in the class; students who left have active = false.
// The class must belong to the teacher; for any other class the list is empty.
export async function listClassStudents(db: D1Database, teacherId: number, classId: number): Promise<StudentRow[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.full_name, e.active, s.ces,
         ${noWorkSql('s.id', 'e.class_id')} AS can_delete
       FROM enrollments e
       JOIN classes c ON c.id = e.class_id AND c.teacher_id = ?
       JOIN students s ON s.id = e.student_id
       WHERE e.class_id = ?`,
    )
    .bind(teacherId, classId)
    .all<{ id: number; full_name: string; active: number; ces: number; can_delete: number }>();
  return results
    .map((row) => ({ id: row.id, fullName: row.full_name, active: row.active === 1, canDelete: row.can_delete === 1, ces: row.ces === 1 }))
    .sort((a, b) => compareStudentNames(a.fullName, b.fullName));
}

// Every upload in the tests of the class, archived tests included, in one
// query. The class must belong to the teacher; for any other class the list is
// empty.
export async function listClassGrades(db: D1Database, teacherId: number, classId: number): Promise<ClassGrade[]> {
  const { results } = await db
    .prepare(
      `SELECT ${GRADE_COLUMNS}
       FROM submissions s
       JOIN tests t ON t.id = s.test_id AND t.class_id = ? AND t.teacher_id = ?
       LEFT JOIN evaluations ev ON ev.submission_id = s.id AND s.status = 'graded'`,
    )
    .bind(classId, teacherId)
    .all<GradeRow>();
  return results.map(gradeOf);
}

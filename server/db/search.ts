import type { D1Database } from '@cloudflare/workers-types';
import type { SearchResults, SearchStudent } from '../../shared/api.ts';
import { compareClassNames } from '../../shared/classes.ts';
import { searchMatcher } from '../../shared/search.ts';
import { compareStudentNames } from '../../shared/students.ts';
import { listClasses } from './classes.ts';
import { listTests } from './tests.ts';

interface EnrolledRow {
  id: number;
  full_name: string;
  class_id: number;
  class_name: string;
  active: number;
}

// The students of the teacher's classes of one school year whose name
// matches, with their classes, and the grade of each one's latest graded
// paper of the year, in one batch. A student in two classes of the year is
// one student.
async function findYearStudents(
  db: D1Database,
  teacherId: number,
  schoolYear: number,
  matches: (text: string) => boolean,
): Promise<SearchStudent[]> {
  const [enrolled, latest] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT s.id, s.full_name, c.id AS class_id, c.name AS class_name, e.active
         FROM enrollments e
         JOIN classes c ON c.id = e.class_id AND c.teacher_id = ? AND c.school_year = ?
         JOIN students s ON s.id = e.student_id AND s.teacher_id = c.teacher_id`,
      )
      .bind(teacherId, schoolYear),
    db
      .prepare(
        `SELECT student_id, grade FROM (
           SELECT s.student_id, ev.grade,
             ROW_NUMBER() OVER (PARTITION BY s.student_id ORDER BY t.started_at DESC, t.id DESC) AS n
           FROM submissions s
           JOIN tests t ON t.id = s.test_id AND t.teacher_id = ?
           JOIN classes c ON c.id = t.class_id AND c.school_year = ?
           JOIN evaluations ev ON ev.submission_id = s.id
           WHERE s.status = 'graded' AND ev.grade IS NOT NULL
         ) WHERE n = 1`,
      )
      .bind(teacherId, schoolYear),
  ]);
  const grades = new Map(((latest?.results ?? []) as { student_id: number; grade: number }[]).map((row) => [row.student_id, row.grade]));
  const students = new Map<number, { fullName: string; active: SearchStudent['classes']; left: SearchStudent['classes'] }>();
  for (const row of (enrolled?.results ?? []) as unknown as EnrolledRow[]) {
    if (!students.has(row.id) && !matches(row.full_name)) continue;
    const student = students.get(row.id) ?? { fullName: row.full_name, active: [], left: [] };
    (row.active === 1 ? student.active : student.left).push({ id: row.class_id, name: row.class_name });
    students.set(row.id, student);
  }
  return [...students]
    .map(([id, student]) => ({
      id,
      fullName: student.fullName,
      classes: (student.active.length > 0 ? student.active : student.left).sort((a, b) => compareClassNames(a.name, b.name)),
      lastGrade: grades.get(id) ?? null,
    }))
    .sort((a, b) => compareStudentNames(a.fullName, b.fullName));
}

// The students, classes and tests of the school year whose name holds the
// search, diacritics aside. One teacher has a few hundred names in a year, so
// they are read whole and matched here: SQLite's LIKE folds only ASCII letters.
export async function search(db: D1Database, teacherId: number, schoolYear: number, query: string): Promise<SearchResults> {
  const matches = searchMatcher(query);
  const [students, classes, tests] = await Promise.all([
    findYearStudents(db, teacherId, schoolYear, matches),
    listClasses(db, teacherId, schoolYear),
    listTests(db, teacherId, schoolYear),
  ]);
  return {
    students,
    classes: classes.filter((cls) => matches(cls.name)),
    tests: tests.filter((test) => matches(test.title)),
  };
}

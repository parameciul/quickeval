import type { D1Database } from '@cloudflare/workers-types';
import type { ClassReport, ReportMissing, ReportRow, UploadStatus } from '../../shared/api.ts';
import type { ClassAnalysis, ExerciseList } from '../../shared/schemas.ts';
import { compareStudentNames } from '../../shared/students.ts';
import type { AnalysisStatus, TestStatus } from '../../shared/tests.ts';
import { flagCountSql } from './evaluations.ts';
import { exerciseColumns, type StoredItem } from './exerciseColumns.ts';

// The rows of the class report (spec §14.2), in four queries whatever the size
// of the class: the test, the graded results, their items, and the active
// students that have no graded result.
export async function getClassReport(db: D1Database, teacherId: number, testId: number): Promise<ClassReport | null> {
  const [test, graded, items, missing] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT t.code, t.title, t.status, t.started_at, t.class_id, c.name AS class_name, t.exercise_list_json,
           t.analysis_status, t.analysis_stale, t.analysis_json
         FROM tests t JOIN classes c ON c.id = t.class_id WHERE t.id = ? AND t.teacher_id = ?`,
      )
      .bind(testId, teacherId),
    db
      .prepare(
        `SELECT s.id AS submission_id, st.id AS student_id, st.full_name, ev.total, ev.max_total, ev.grade,
           ${flagCountSql('ev')} AS flag_count
         FROM submissions s
         JOIN tests t ON t.id = s.test_id
         JOIN students st ON st.id = s.student_id
         JOIN evaluations ev ON ev.submission_id = s.id
         WHERE s.test_id = ? AND s.status = 'graded' AND t.teacher_id = ?`,
      )
      .bind(testId, teacherId),
    db
      .prepare(
        `SELECT s.id AS submission_id, i.exercise_id, i.points, i.max_points, i.label, i.position,
           ev.id AS evaluation_id, ev.created_at AS graded_at,
           CASE WHEN i.needs_review = 1 AND i.reviewed_at IS NULL THEN 1 ELSE 0 END AS flagged
         FROM submissions s
         JOIN tests t ON t.id = s.test_id
         JOIN evaluations ev ON ev.submission_id = s.id
         JOIN evaluation_items i ON i.evaluation_id = ev.id
         WHERE s.test_id = ? AND s.status = 'graded' AND t.teacher_id = ?
         ORDER BY s.id, i.position`,
      )
      .bind(testId, teacherId),
    db
      .prepare(
        `SELECT st.id AS student_id, st.full_name, s.status
         FROM tests t
         JOIN enrollments e ON e.class_id = t.class_id AND e.active = 1
         JOIN students st ON st.id = e.student_id
         LEFT JOIN submissions s ON s.test_id = t.id AND s.student_id = st.id
         WHERE t.id = ? AND t.teacher_id = ? AND (s.status IS NULL OR s.status <> 'graded')`,
      )
      .bind(testId, teacherId),
  ]);
  const head = test?.results[0] as
    | {
        code: string;
        title: string;
        status: TestStatus;
        started_at: string | null;
        class_name: string;
        exercise_list_json: string | null;
        analysis_status: AnalysisStatus;
        analysis_stale: number;
        analysis_json: string | null;
      }
    | undefined;
  if (!head) return null;
  const list = head.exercise_list_json ? (JSON.parse(head.exercise_list_json) as ExerciseList) : null;

  const itemsBySubmission = new Map<number, ReportRow['items']>();
  const storedItems: StoredItem[] = [];
  for (const row of (items?.results ?? []) as {
    submission_id: number;
    exercise_id: string;
    points: number;
    max_points: number;
    label: string;
    position: number;
    evaluation_id: number;
    graded_at: string;
    flagged: number;
  }[]) {
    storedItems.push({
      evaluationId: row.evaluation_id,
      gradedAt: row.graded_at,
      exerciseId: row.exercise_id,
      label: row.label,
      maxPoints: row.max_points,
      position: row.position,
    });
    const own = itemsBySubmission.get(row.submission_id) ?? [];
    own.push({ exerciseId: row.exercise_id, points: row.points, maxPoints: row.max_points, flagged: row.flagged === 1 });
    itemsBySubmission.set(row.submission_id, own);
  }
  const rows = ((graded?.results ?? []) as {
    submission_id: number;
    student_id: number;
    full_name: string;
    total: number;
    max_total: number;
    grade: number;
    flag_count: number;
  }[])
    .map(
      (row): ReportRow => ({
        submissionId: row.submission_id,
        studentId: row.student_id,
        studentName: row.full_name,
        total: row.total,
        maxTotal: row.max_total,
        grade: row.grade,
        flagCount: row.flag_count,
        items: itemsBySubmission.get(row.submission_id) ?? [],
      }),
    )
    .sort((a, b) => compareStudentNames(a.studentName, b.studentName));
  const notGraded = ((missing?.results ?? []) as { student_id: number; full_name: string; status: UploadStatus | null }[])
    .map((row): ReportMissing => ({ studentId: row.student_id, studentName: row.full_name, status: row.status ?? 'none' }))
    .sort((a, b) => compareStudentNames(a.studentName, b.studentName));

  return {
    test: { code: head.code, title: head.title, className: head.class_name, status: head.status, startedAt: head.started_at },
    exercises: exerciseColumns(list, storedItems).map(({ id, label, maxPoints }) => ({ id, label, maxPoints })),
    rows,
    missing: notGraded,
    analysis: {
      status: head.analysis_status,
      stale: head.analysis_stale === 1,
      content: head.analysis_status === 'ready' && head.analysis_json ? (JSON.parse(head.analysis_json) as ClassAnalysis) : null,
    },
  };
}

import type { D1Database } from '@cloudflare/workers-types';
import type { EvaluationInfo, EvaluationItemInfo, ItemChange } from '../../shared/api.ts';
import type { Confidence } from '../../shared/schemas.ts';
import { round2 } from '../../shared/scoring.ts';

// Graded results and the teacher's checks of them (spec §14.1). Each write
// checks in its SQL that it changes the result the teacher's page shows: a
// regrade or a reset can delete a result at any time, and SQLite gives the
// ids of deleted rows to new rows (no AUTOINCREMENT), so an upload id or an
// item id from an old page can name another student's result.

// The result that the teacher's page shows.
export interface ShownResult {
  teacherId: number;
  submissionId: number;
  // EvaluationInfo.gradedAt: when the robot wrote the result.
  gradedAt: string;
}

// The evaluation of that result, while its upload is graded. Binds the
// upload, the grading time, and the teacher (shownBinds).
const SHOWN = `SELECT ev.id FROM evaluations ev
  JOIN submissions s ON s.id = ev.submission_id JOIN tests t ON t.id = s.test_id
  WHERE ev.submission_id = ? AND ev.created_at = ? AND s.status = 'graded' AND t.teacher_id = ?`;

const shownBinds = (shown: ShownResult) => [shown.submissionId, shown.gradedAt, shown.teacherId];

// The grade in SQL, for amounts in cents: total * 10 / maximum in whole
// hundredths, rounded half up, as gradeOf() does.
export function gradeSql(total: string, maxTotal: string): string {
  return `((CAST(ROUND(${total} * 100) AS INTEGER) * 2000 + CAST(ROUND(${maxTotal} * 100) AS INTEGER))
    / (2 * CAST(ROUND(${maxTotal} * 100) AS INTEGER)) / 100.0)`;
}

// Items to check of the evaluation `ev` that the teacher has not checked yet,
// plus one while pages that the robot could not read are not checked. The
// uploads table, the test list, and the result page count the same way.
export function flagCountSql(ev: string): string {
  return `((SELECT COUNT(*) FROM evaluation_items i WHERE i.evaluation_id = ${ev}.id AND i.needs_review = 1 AND i.reviewed_at IS NULL)
    + CASE WHEN json_array_length(${ev}.unreadable_json) > 0 AND ${ev}.pages_reviewed_at IS NULL THEN 1 ELSE 0 END)`;
}

interface EvaluationRow {
  id: number;
  created_at: string;
  max_total: number;
  office_points: number;
  total: number;
  grade: number;
  summary: string;
  strengths_json: string;
  recommendations_json: string;
  unreadable_json: string;
  pages_reviewed_at: string | null;
  flag_count: number;
}

interface ItemRow {
  id: number;
  exercise_id: string;
  label: string;
  max_points: number;
  ai_points: number;
  points: number;
  student_answer: string;
  comment: string;
  confidence: Confidence;
  needs_review: number;
  review_reason: string;
  reviewed_at: string | null;
  changed_by_teacher: number;
}

function toItem(row: ItemRow): EvaluationItemInfo {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    label: row.label,
    maxPoints: row.max_points,
    aiPoints: row.ai_points,
    points: row.points,
    studentAnswer: row.student_answer,
    comment: row.comment,
    confidence: row.confidence,
    needsReview: row.needs_review === 1,
    reviewReason: row.review_reason,
    reviewed: row.reviewed_at !== null,
    changedByTeacher: row.changed_by_teacher === 1,
  };
}

// The evaluation of an upload with its items in barem order. Null when the
// upload has none. The caller checks that the upload is the teacher's.
export async function getEvaluation(db: D1Database, submissionId: number): Promise<EvaluationInfo | null> {
  const [evaluations, items] = await db.batch<EvaluationRow | ItemRow>([
    db
      .prepare(
        `SELECT ev.id, ev.created_at, ev.max_total, ev.office_points, ev.total, ev.grade, ev.summary, ev.strengths_json,
           ev.recommendations_json, ev.unreadable_json, ev.pages_reviewed_at, ${flagCountSql('ev')} AS flag_count
         FROM evaluations ev WHERE ev.submission_id = ?`,
      )
      .bind(submissionId),
    db
      .prepare(
        `SELECT i.id, i.exercise_id, i.label, i.max_points, i.ai_points, i.points, i.student_answer, i.comment, i.confidence,
           i.needs_review, i.review_reason, i.reviewed_at, i.changed_by_teacher
         FROM evaluation_items i JOIN evaluations ev ON ev.id = i.evaluation_id
         WHERE ev.submission_id = ?
         ORDER BY i.position, i.id`,
      )
      .bind(submissionId),
  ]);
  const row = evaluations?.results[0] as EvaluationRow | undefined;
  if (!row) return null;
  return {
    gradedAt: row.created_at,
    maxTotal: row.max_total,
    officePoints: row.office_points,
    total: row.total,
    grade: row.grade,
    summary: row.summary,
    strengths: JSON.parse(row.strengths_json) as string[],
    recommendations: JSON.parse(row.recommendations_json) as string[],
    unreadable: JSON.parse(row.unreadable_json) as string[],
    pagesReviewed: row.pages_reviewed_at !== null,
    flagCount: row.flag_count,
    items: ((items?.results ?? []) as ItemRow[]).map(toItem),
  };
}

// An item of the result the page shows, with its maximum, which never
// changes. Null when the item is not in that result, or the result is gone.
// correctItem() checks the same again in its write.
export async function findTeacherItem(db: D1Database, shown: ShownResult, itemId: number): Promise<{ maxPoints: number } | null> {
  const row = await db
    .prepare(`SELECT max_points FROM evaluation_items WHERE id = ? AND evaluation_id IN (${SHOWN})`)
    .bind(itemId, ...shownBinds(shown))
    .first<{ max_points: number }>();
  return row ? { maxPoints: row.max_points } : null;
}

// The teacher's correction: new points or a new comment, and the check mark.
// New points or a new comment mark the item as changed by the teacher, and
// the total, the grade, and the freshness of the class analysis follow. The
// total is summed again from the items, so two corrections at once still
// leave the right total. The points must be checked first with
// isValidCorrection(). False when the item is not in the result the page
// shows, or that result is gone or no longer graded.
export async function correctItem(db: D1Database, shown: ShownResult, itemId: number, change: ItemChange, now: string): Promise<boolean> {
  const changed = change.points !== undefined || change.comment !== undefined;
  const reviewed = change.reviewed === undefined ? null : change.reviewed ? 1 : 0;
  const item = await db
    .prepare(
      `UPDATE evaluation_items SET points = COALESCE(?, points), comment = COALESCE(?, comment),
         changed_by_teacher = CASE WHEN ? = 1 THEN 1 ELSE changed_by_teacher END,
         reviewed_at = CASE WHEN ? IS NULL THEN reviewed_at WHEN ? = 1 THEN COALESCE(reviewed_at, ?) ELSE NULL END
       WHERE id = ? AND evaluation_id IN (${SHOWN})
       RETURNING evaluation_id`,
    )
    .bind(
      change.points === undefined ? null : round2(change.points),
      change.comment ?? null,
      changed ? 1 : 0,
      reviewed,
      reviewed,
      now,
      itemId,
      ...shownBinds(shown),
    )
    .first<{ evaluation_id: number }>();
  if (!item) return false;
  if (!changed) return true;
  await db.batch([
    db
      .prepare(
        `UPDATE evaluations
         SET total = ROUND((SELECT SUM(i.points) FROM evaluation_items i WHERE i.evaluation_id = evaluations.id) + office_points, 2),
           updated_at = ?
         WHERE id = ?`,
      )
      .bind(now, item.evaluation_id),
    db.prepare(`UPDATE evaluations SET grade = ${gradeSql('total', 'max_total')} WHERE id = ?`).bind(item.evaluation_id),
    db
      .prepare(
        `UPDATE tests SET analysis_stale = 1
         WHERE analysis_status = 'ready'
           AND id = (SELECT s.test_id FROM evaluations ev JOIN submissions s ON s.id = ev.submission_id WHERE ev.id = ?)`,
      )
      .bind(item.evaluation_id),
  ]);
  return true;
}

// The teacher checked the pages that the robot could not read: they no
// longer count as an item to check. False when the result the page shows is
// gone or no longer graded.
export async function reviewPages(db: D1Database, shown: ShownResult, reviewed: boolean, now: string): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE evaluations SET pages_reviewed_at = CASE WHEN ? = 1 THEN COALESCE(pages_reviewed_at, ?) ELSE NULL END
       WHERE id IN (${SHOWN})
       RETURNING id`,
    )
    .bind(reviewed ? 1 : 0, now, ...shownBinds(shown))
    .first<{ id: number }>();
  return row !== null;
}

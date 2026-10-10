import type { D1Database } from '@cloudflare/workers-types';
import type { EvaluationInfo, EvaluationItemInfo } from '../../shared/api.ts';
import type { Confidence } from '../../shared/schemas.ts';

// Graded results and the teacher's checks of them (spec §14.1).

// Items to check of the evaluation `ev` that the teacher has not checked yet,
// plus one while pages that the robot could not read are not checked. The
// uploads table, the test list, and the result page count the same way.
export function flagCountSql(ev: string): string {
  return `((SELECT COUNT(*) FROM evaluation_items i WHERE i.evaluation_id = ${ev}.id AND i.needs_review = 1 AND i.reviewed_at IS NULL)
    + CASE WHEN json_array_length(${ev}.unreadable_json) > 0 AND ${ev}.pages_reviewed_at IS NULL THEN 1 ELSE 0 END)`;
}

interface EvaluationRow {
  id: number;
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
        `SELECT ev.id, ev.max_total, ev.office_points, ev.total, ev.grade, ev.summary, ev.strengths_json,
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

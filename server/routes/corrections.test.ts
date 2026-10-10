import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EvaluationItemInfo } from '../../shared/api.ts';
import { gradeOf } from '../../shared/scoring.ts';
import { gradeSql } from '../db/evaluations.ts';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let code: string;
let submissionId: number;
let items: Record<string, number>;

const GRADED_AT = '2026-10-07T09:00:00.000Z';

// A graded upload of a test out of 10 with 1 point "din oficiu": I.1 is worth
// 4.5 (the robot gave 4), II.1 4.17 (gave 2, and asks the teacher to check
// it), III.1 0.33 (gave 0). Total 7, grade 7.
async function gradedUpload(studentId: number): Promise<{ submissionId: number; items: Record<string, number> }> {
  const id = await addSubmission(api, code, studentId, { status: 'graded', files: 1 });
  const evaluation = await api.db
    .prepare(
      `INSERT INTO evaluations (submission_id, max_total, office_points, total, grade, needs_review, summary,
         strengths_json, recommendations_json, unreadable_json, raw_json, created_at, updated_at)
       VALUES (?, 10, 1, 7, 7, 1, 'Rezumat.', '[]', '[]', '[]', '{}', ?, ?) RETURNING id`,
    )
    .bind(id, GRADED_AT, GRADED_AT)
    .first<{ id: number }>();
  const rows: [string, number, number, number, string][] = [
    ['I.1', 4.5, 4, 0, ''],
    ['II.1', 4.17, 2, 1, 'Scrisul nu se citește.'],
    ['III.1', 0.33, 0, 0, ''],
  ];
  const ids: Record<string, number> = {};
  for (const [position, [exerciseId, maxPoints, points, needsReview, reason]] of rows.entries()) {
    const item = await api.db
      .prepare(
        `INSERT INTO evaluation_items (evaluation_id, exercise_id, position, label, max_points, ai_points, points,
           student_answer, comment, confidence, needs_review, review_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'r', 'Comentariu.', 'high', ?, ?) RETURNING id`,
      )
      .bind(evaluation!.id, exerciseId, position + 1, `Exercițiul ${exerciseId}`, maxPoints, points, points, needsReview, reason)
      .first<{ id: number }>();
    ids[exerciseId] = item!.id;
  }
  return { submissionId: id, items: ids };
}

const correct = (itemId: number, body: unknown) => api.request('PATCH', `/api/admin/evaluation-items/${itemId}`, body);
const itemOf = (body: { submission: { evaluation: { items: EvaluationItemInfo[] } } }, exerciseId: string) =>
  body.submission.evaluation.items.find((item) => item.exerciseId === exerciseId)!;
const evaluationRow = () =>
  api.db.prepare('SELECT total, grade, updated_at FROM evaluations WHERE submission_id = ?').bind(submissionId).first<{
    total: number;
    grade: number;
    updated_at: string;
  }>();

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Stan Eva']);
  code = await makeTest(api, cls.id, 'Fracții');
  ({ submissionId, items } = await gradedUpload(cls.studentIds[0]!));
});

afterEach(async () => {
  await api.dispose();
});

describe('PATCH /api/admin/evaluation-items/:id', () => {
  it('changes the points, and the total and the grade follow', async () => {
    const res = await correct(items['II.1']!, { points: 3.5 });
    expect(res.status).toBe(200);
    expect(res.body.submission.evaluation).toMatchObject({ total: 8.5, grade: 8.5 });
    expect(itemOf(res.body, 'II.1')).toMatchObject({ aiPoints: 2, points: 3.5, changedByTeacher: true, reviewed: false });
    expect(itemOf(res.body, 'I.1')).toMatchObject({ points: 4, changedByTeacher: false });
    expect((await evaluationRow())!.updated_at).not.toBe(GRADED_AT);

    const second = await correct(items['I.1']!, { points: 2.35 });
    expect(second.body.submission.evaluation).toMatchObject({ total: 6.85, grade: 6.85 });
  });

  it('gives the full points of a maximum that is off the 0.05 steps', async () => {
    const res = await correct(items['III.1']!, { points: 0.33 });
    expect(res.status).toBe(200);
    expect(res.body.submission.evaluation).toMatchObject({ total: 7.33, grade: 7.33 });
  });

  it('changes the comment without changing the points', async () => {
    const res = await correct(items['I.1']!, { comment: '  Calcul bun, dar lipsește unitatea de măsură.  ' });
    expect(res.status).toBe(200);
    expect(itemOf(res.body, 'I.1')).toMatchObject({
      points: 4,
      comment: 'Calcul bun, dar lipsește unitatea de măsură.',
      changedByTeacher: true,
    });
    expect(res.body.submission.evaluation).toMatchObject({ total: 7, grade: 7 });
  });

  it('marks an item as checked, keeps the first time, and takes the check back', async () => {
    const res = await correct(items['II.1']!, { reviewed: true });
    expect(res.status).toBe(200);
    expect(itemOf(res.body, 'II.1')).toMatchObject({ points: 2, reviewed: true, changedByTeacher: false });
    expect(res.body.submission.evaluation.flagCount).toBe(0);
    // A check changes no points: the result keeps its time.
    expect((await evaluationRow())!.updated_at).toBe(GRADED_AT);

    await api.db.prepare("UPDATE evaluation_items SET reviewed_at = '2026-10-08T07:00:00.000Z' WHERE id = ?").bind(items['II.1']).run();
    await correct(items['II.1']!, { reviewed: true });
    const row = await api.db.prepare('SELECT reviewed_at FROM evaluation_items WHERE id = ?').bind(items['II.1']).first<{ reviewed_at: string }>();
    expect(row!.reviewed_at).toBe('2026-10-08T07:00:00.000Z');

    const back = await correct(items['II.1']!, { reviewed: false });
    expect(itemOf(back.body, 'II.1').reviewed).toBe(false);
    expect(back.body.submission.evaluation.flagCount).toBe(1);
  });

  it('saves new points and the check in one request', async () => {
    const res = await correct(items['II.1']!, { points: 4.15, reviewed: true });
    expect(itemOf(res.body, 'II.1')).toMatchObject({ points: 4.15, reviewed: true, changedByTeacher: true });
    expect(res.body.submission.evaluation).toMatchObject({ total: 9.15, grade: 9.15, flagCount: 0 });
  });

  it('refuses points off the 0.05 steps, below 0, or above the maximum, and changes nothing', async () => {
    for (const points of [2.53, 2.555, -0.05, 4.2]) {
      const res = await correct(items['II.1']!, { points });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid_points', message: 'Punctajul este între 0 și 4,17, din 0,05 în 0,05.' });
    }
    const row = await api.db.prepare('SELECT points, changed_by_teacher FROM evaluation_items WHERE id = ?').bind(items['II.1']).first();
    expect(row).toEqual({ points: 2, changed_by_teacher: 0 });
    expect(await evaluationRow()).toMatchObject({ total: 7, grade: 7 });
  });

  it('refuses a body that changes nothing or is not valid', async () => {
    expect((await correct(items['I.1']!, {})).body).toEqual({ error: 'invalid', message: 'Nu ai schimbat nimic.' });
    expect((await correct(items['I.1']!, { points: '3' })).body).toEqual({
      error: 'invalid',
      message: 'Scrie punctajul ca număr, de exemplu 2,5.',
    });
    expect((await correct(items['I.1']!, { comment: 'x'.repeat(1001) })).body).toEqual({
      error: 'invalid',
      message: 'Comentariul are cel mult 1000 de caractere.',
    });
  });

  it('answers 404 for an unknown item and for an item of another teacher', async () => {
    expect((await correct(99999, { points: 1 })).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    const foreignUpload = await addSubmission(api, foreign.code, foreign.studentId, { status: 'graded', files: 1 });
    const foreignEvaluation = await addEvaluation(api, foreignUpload);
    const foreignItem = await api.db
      .prepare('SELECT id FROM evaluation_items WHERE evaluation_id = ?')
      .bind(foreignEvaluation)
      .first<{ id: number }>();
    expect((await correct(foreignItem!.id, { points: 0 })).status).toBe(404);
    const row = await api.db.prepare('SELECT points FROM evaluation_items WHERE id = ?').bind(foreignItem!.id).first();
    expect(row).toEqual({ points: 1 });
  });

  it('answers 409 when the upload is not graded any more', async () => {
    await api.db.prepare("UPDATE submissions SET status = 'submitted' WHERE id = ?").bind(submissionId).run();
    const res = await correct(items['I.1']!, { points: 3 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'not_graded', message: 'Lucrarea se corectează din nou. Reîncarcă pagina.' });
    const row = await api.db.prepare('SELECT points FROM evaluation_items WHERE id = ?').bind(items['I.1']).first();
    expect(row).toEqual({ points: 4 });
  });

  it('marks a ready class analysis as out of date when points or comments change', async () => {
    await api.db.prepare("UPDATE tests SET analysis_status = 'ready' WHERE code = ?").bind(code).run();
    const stale = async () =>
      (await api.db.prepare('SELECT analysis_stale FROM tests WHERE code = ?').bind(code).first<{ analysis_stale: number }>())!.analysis_stale;
    await correct(items['II.1']!, { reviewed: true });
    expect(await stale()).toBe(0);
    await correct(items['I.1']!, { comment: 'Alt comentariu.' });
    expect(await stale()).toBe(1);
  });

  it('computes the grade in SQL like gradeOf, for every amount in cents', async () => {
    const cases: [number, number][] = [];
    for (const maxTotal of [10, 9, 100, 4.5, 30]) {
      for (let cents = 0; cents <= Math.round(maxTotal * 100); cents += 1) cases.push([cents / 100, maxTotal]);
    }
    const { results } = await api.db
      .prepare(`SELECT ${gradeSql("json_extract(value, '$[0]')", "json_extract(value, '$[1]')")} AS grade FROM json_each(?) ORDER BY key`)
      .bind(JSON.stringify(cases))
      .all<{ grade: number }>();
    expect(results.map((row) => row.grade)).toEqual(cases.map(([total, maxTotal]) => gradeOf(total, maxTotal)));
  });
});

describe('PATCH /api/admin/submissions/:id/evaluation', () => {
  const reviewPages = (id: number, body: unknown) => api.request('PATCH', `/api/admin/submissions/${id}/evaluation`, body);

  it('marks the unreadable pages as checked, and takes the check back', async () => {
    await api.db.prepare(`UPDATE evaluations SET unreadable_json = '["student/page-01.jpg"]' WHERE submission_id = ?`).bind(submissionId).run();
    const res = await reviewPages(submissionId, { pagesReviewed: true });
    expect(res.status).toBe(200);
    // II.1 still waits for a check.
    expect(res.body.submission.evaluation).toMatchObject({ pagesReviewed: true, flagCount: 1 });
    const back = await reviewPages(submissionId, { pagesReviewed: false });
    expect(back.body.submission.evaluation).toMatchObject({ pagesReviewed: false, flagCount: 2 });
  });

  it('refuses a bad body, an upload that is not graded, and uploads of other teachers', async () => {
    expect((await reviewPages(submissionId, { pagesReviewed: 'da' })).status).toBe(400);
    const cls = await makeClass(api, '7E2', ['Marin Dan']);
    const otherCode = await makeTest(api, cls.id);
    const waiting = await addSubmission(api, otherCode, cls.studentIds[0]!, { status: 'submitted', files: 1 });
    expect((await reviewPages(waiting, { pagesReviewed: true })).body).toEqual({
      error: 'not_graded',
      message: 'Lucrarea se corectează din nou. Reîncarcă pagina.',
    });
    expect((await reviewPages(99999, { pagesReviewed: true })).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    const foreignUpload = await addSubmission(api, foreign.code, foreign.studentId, { status: 'graded', files: 1 });
    await addEvaluation(api, foreignUpload, { unreadable: ['student/page-01.jpg'] });
    expect((await reviewPages(foreignUpload, { pagesReviewed: true })).status).toBe(404);
    const row = await api.db.prepare('SELECT pages_reviewed_at FROM evaluations WHERE submission_id = ?').bind(foreignUpload).first();
    expect(row).toEqual({ pages_reviewed_at: null });
  });
});

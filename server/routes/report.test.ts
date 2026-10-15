import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExerciseList } from '../../shared/schemas.ts';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let code: string;
let testId: number;
let studentIds: number[];

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [
    { id: 'E1', label: 'Exercițiul 1', maxPoints: 4.5, answer: '3/4', scoringNotes: '', topic: 'Fracții' },
    { id: 'E2', label: 'Exercițiul 2', maxPoints: 4.5, answer: 'x = 2', scoringNotes: '', topic: 'Ecuații' },
  ],
  notes: '',
};

const report = (target = code) => api.request('GET', `/api/admin/tests/${target}/report`);

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2', ['Stan Eva', 'Avram Dan', 'Pop Ion', 'Ionescu Ana']);
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id, 'Fracții');
  testId = await testIdOf(api, code);
  await api.db.prepare('UPDATE tests SET exercise_list_json = ?, exercise_list_status = ? WHERE id = ?').bind(JSON.stringify(LIST), 'ready', testId).run();
});

afterEach(async () => {
  await api.dispose();
});

describe('GET /api/admin/tests/:code/report', () => {
  it('lists the graded students by name with their items, and the others below', async () => {
    const pop = await addSubmission(api, code, studentIds[2]!, { status: 'graded', files: 1 });
    await addEvaluation(api, pop, { grade: 8, items: [{ needsReview: true }, { needsReview: true, reviewed: true }] });
    const avram = await addSubmission(api, code, studentIds[1]!, { status: 'graded', files: 1 });
    await addEvaluation(api, avram, { grade: 9.5, items: [{}, {}], unreadable: ['student/page-02.jpg'] });
    await addSubmission(api, code, studentIds[0]!, { status: 'failed', files: 1 });

    const res = await report();
    expect(res.status).toBe(200);
    const { report: body } = res.body;
    expect(body.test).toMatchObject({ code, title: 'Fracții', className: '6E2', status: 'draft' });
    expect(body.exercises).toEqual([
      { id: 'E1', label: 'Exercițiul 1', maxPoints: 4.5 },
      { id: 'E2', label: 'Exercițiul 2', maxPoints: 4.5 },
    ]);
    expect(body.rows.map((row: { studentName: string }) => row.studentName)).toEqual(['Avram Dan', 'Pop Ion']);
    expect(body.rows[1]).toMatchObject({ submissionId: pop, grade: 8, maxTotal: 10, flagCount: 1 });
    expect(body.rows[1].items).toEqual([
      { exerciseId: 'E1', points: 1, maxPoints: 1, flagged: true },
      { exerciseId: 'E2', points: 1, maxPoints: 1, flagged: false },
    ]);
    // Pages that were not checked count as one item to check.
    expect(body.rows[0]).toMatchObject({ grade: 9.5, flagCount: 1 });
    expect(body.missing).toEqual([
      { studentId: studentIds[3], studentName: 'Ionescu Ana', status: 'none' },
      { studentId: studentIds[0], studentName: 'Stan Eva', status: 'failed' },
    ]);
  });

  it('carries no model, effort, or Model setting, even when the setting is on', async () => {
    const avram = await addSubmission(api, code, studentIds[1]!, { status: 'graded', files: 1 });
    await addEvaluation(api, avram, { grade: 9, items: [{}, {}] });
    await api.db.prepare("UPDATE evaluations SET model = 'claude-opus-5-5', effort = 'high' WHERE submission_id = ?").bind(avram).run();
    await api.request('PATCH', '/api/admin/settings', { showModelColumn: true });
    const body = (await report()).body.report;
    expect(body).not.toHaveProperty('showModel');
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).not.toHaveProperty('model');
    expect(body.rows[0]).not.toHaveProperty('effort');
  });

  it('marks a graded student who left the class as not active', async () => {
    const pop = await addSubmission(api, code, studentIds[2]!, { status: 'graded', files: 1 });
    await addEvaluation(api, pop, { grade: 8, items: [{}, {}] });
    const avram = await addSubmission(api, code, studentIds[1]!, { status: 'graded', files: 1 });
    await addEvaluation(api, avram, { grade: 9, items: [{}, {}] });
    await api.db.prepare('UPDATE enrollments SET active = 0 WHERE student_id = ?').bind(studentIds[1]).run();
    const res = await report();
    expect(res.body.report.rows.map((row: { studentName: string; active: boolean }) => [row.studentName, row.active])).toEqual([
      ['Avram Dan', false],
      ['Pop Ion', true],
    ]);
  });

  it('has no rows for a test without a graded upload', async () => {
    const res = await report();
    expect(res.status).toBe(200);
    expect(res.body.report.rows).toEqual([]);
    expect(res.body.report.missing).toHaveLength(4);
    expect(res.body.report.analysis).toEqual({ status: 'none', stale: false, attempts: 0, content: null });
  });

  it('carries the analysis and whether it is out of date', async () => {
    const analysis = { overview: 'Bine.', strengths: [], weaknesses: [], commonMistakes: [], recommendations: [] };
    await api.db
      .prepare("UPDATE tests SET analysis_status = 'ready', analysis_stale = 1, analysis_json = ? WHERE id = ?")
      .bind(JSON.stringify(analysis), testId)
      .run();
    const res = await report();
    expect(res.body.report.analysis).toEqual({ status: 'ready', stale: true, attempts: 0, content: analysis });
  });

  it('carries the failed attempts of the analysis', async () => {
    await api.db.prepare("UPDATE tests SET analysis_status = 'requested', analysis_attempts = 2 WHERE id = ?").bind(testId).run();
    const res = await report();
    expect(res.body.report.analysis).toEqual({ status: 'requested', stale: false, attempts: 2, content: null });
  });

  it('carries no analysis content unless the analysis is ready', async () => {
    const analysis = { overview: 'Veche.', strengths: [], weaknesses: [], commonMistakes: [], recommendations: [] };
    for (const status of ['requested', 'failed']) {
      await api.db
        .prepare('UPDATE tests SET analysis_status = ?, analysis_json = ? WHERE id = ?')
        .bind(status, JSON.stringify(analysis), testId)
        .run();
      const res = await report();
      expect(res.body.report.analysis).toEqual({ status, stale: false, attempts: 0, content: null });
    }
  });

  it('leaves out a student who left the class, unless a result exists', async () => {
    await api.db.prepare('UPDATE enrollments SET active = 0 WHERE student_id = ?').bind(studentIds[0]).run();
    const left = await addSubmission(api, code, studentIds[0]!, { status: 'graded', files: 1 });
    await addEvaluation(api, left, { grade: 7 });
    const res = await report();
    expect(res.body.report.rows.map((row: { studentName: string }) => row.studentName)).toEqual(['Stan Eva']);
    expect(res.body.report.missing.map((row: { studentName: string }) => row.studentName)).toEqual(['Avram Dan', 'Ionescu Ana', 'Pop Ion']);
  });

  it('answers 404 for a test of another teacher or an unknown code', async () => {
    const foreign = await otherTeacherTest(api);
    expect((await report(foreign.code)).status).toBe(404);
    expect((await report('9Z-26T99')).status).toBe(404);
    expect((await report('x')).status).toBe(404);
  });
  describe('after a barem change cleared the exercise list', () => {
    beforeEach(async () => {
      await api.db.prepare('UPDATE tests SET exercise_list_json = NULL WHERE id = ?').bind(testId).run();
    });

    it('builds the exercise columns from the stored items', async () => {
      const pop = await addSubmission(api, code, studentIds[2]!, { status: 'graded', files: 1 });
      await addEvaluation(api, pop, { grade: 8, items: [{}, {}] });
      await api.db.prepare("UPDATE evaluation_items SET label = 'Exercițiul 2', max_points = 4.5 WHERE exercise_id = 'E2'").run();
      const res = await report();
      expect(res.body.report.exercises).toEqual([
        { id: 'E1', label: 'Exercițiu', maxPoints: 1 },
        { id: 'E2', label: 'Exercițiul 2', maxPoints: 4.5 },
      ]);
      expect(res.body.report.rows[0].items).toHaveLength(2);
    });

    it('lets the newest evaluation name an exercise and keeps every item of older ones', async () => {
      const old = await addSubmission(api, code, studentIds[2]!, { status: 'graded', files: 1 });
      await addEvaluation(api, old, { grade: 8, items: [{}, {}] });
      const fresh = await addSubmission(api, code, studentIds[1]!, { status: 'graded', files: 1 });
      const evaluation = await addEvaluation(api, fresh, { grade: 9, items: [{}, {}] });
      await api.db.prepare("UPDATE evaluations SET created_at = '2026-10-08T09:00:00.000Z' WHERE id = ?").bind(evaluation).run();
      await api.db
        .prepare("UPDATE evaluation_items SET label = 'Nou 1', max_points = 2 WHERE evaluation_id = ? AND exercise_id = 'E1'")
        .bind(evaluation)
        .run();
      await api.db
        .prepare("UPDATE evaluation_items SET exercise_id = 'E3', label = 'Nou 3', max_points = 3, position = 2 WHERE evaluation_id = ? AND exercise_id = 'E2'")
        .bind(evaluation)
        .run();
      const res = await report();
      expect(res.body.report.exercises).toEqual([
        { id: 'E1', label: 'Nou 1', maxPoints: 2 },
        { id: 'E3', label: 'Nou 3', maxPoints: 3 },
        { id: 'E2', label: 'Exercițiu', maxPoints: 1 },
      ]);
    });
  });
});

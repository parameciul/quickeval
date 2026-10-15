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

  it('has no rows for a test without a graded upload', async () => {
    const res = await report();
    expect(res.status).toBe(200);
    expect(res.body.report.rows).toEqual([]);
    expect(res.body.report.missing).toHaveLength(4);
    expect(res.body.report.analysis).toEqual({ status: 'none', stale: false, content: null });
  });

  it('carries the analysis and whether it is out of date', async () => {
    const analysis = { overview: 'Bine.', strengths: [], weaknesses: [], commonMistakes: [], recommendations: [] };
    await api.db
      .prepare("UPDATE tests SET analysis_status = 'ready', analysis_stale = 1, analysis_json = ? WHERE id = ?")
      .bind(JSON.stringify(analysis), testId)
      .run();
    const res = await report();
    expect(res.body.report.analysis).toEqual({ status: 'ready', stale: true, content: analysis });
  });

  it('carries no analysis content unless the analysis is ready', async () => {
    const analysis = { overview: 'Veche.', strengths: [], weaknesses: [], commonMistakes: [], recommendations: [] };
    for (const status of ['requested', 'failed']) {
      await api.db
        .prepare('UPDATE tests SET analysis_status = ?, analysis_json = ? WHERE id = ?')
        .bind(status, JSON.stringify(analysis), testId)
        .run();
      const res = await report();
      expect(res.body.report.analysis).toEqual({ status, stale: false, content: null });
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
});

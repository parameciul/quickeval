import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let studentId: number;
let classmateId: number;
let classId: number;

const started = (code: string, at: string) => api.db.prepare('UPDATE tests SET started_at = ? WHERE code = ?').bind(at, code).run();

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana']);
  classId = cls.id;
  [studentId, classmateId] = cls.studentIds as [number, number];
});

afterEach(async () => {
  await api.dispose();
});

describe('GET /api/admin/students/:id/history', () => {
  it('lists every graded test of the student in every class and year, newest first', async () => {
    // The student moves on to 7E2 in the next school year.
    const next = await makeClass(api, '7E2', [], 2027);
    await api.db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').bind(next.id, studentId).run();
    await api.request('PATCH', `/api/admin/classes/${classId}/students/${studentId}`, { active: false });

    const first = await makeTest(api, classId, 'Fracții');
    const second = await makeTest(api, classId, 'Ecuații');
    const later = await makeTest(api, next.id, 'Funcții');
    await started(first, '2026-10-06T07:15:00.000Z');
    await started(second, '2026-11-10T08:00:00.000Z');
    await started(later, '2027-10-05T07:00:00.000Z');
    const firstUpload = await addSubmission(api, first, studentId, { status: 'graded', files: 1 });
    await addEvaluation(api, firstUpload, { grade: 7.5, items: [{ needsReview: true }, {}] });
    const laterUpload = await addSubmission(api, later, studentId, { status: 'graded', files: 1 });
    await addEvaluation(api, laterUpload, { grade: 9.25 });
    // Not graded yet: not in the history.
    await addSubmission(api, second, studentId, { status: 'submitted', files: 1 });
    // A classmate's grade stays out.
    const other = await addSubmission(api, first, classmateId, { status: 'graded', files: 1 });
    await addEvaluation(api, other, { grade: 4 });

    const res = await api.request('GET', `/api/admin/students/${studentId}/history`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      student: { id: studentId, fullName: 'Pop Ion' },
      classes: [
        { id: next.id, name: '7E2', schoolYear: 2027, active: true },
        { id: classId, name: '6E2', schoolYear: 2026, active: false },
      ],
      results: [
        {
          submissionId: laterUpload,
          testCode: '7E2-27T1',
          testTitle: 'Funcții',
          className: '7E2',
          schoolYear: 2027,
          date: '2027-10-05T07:00:00.000Z',
          grade: 9.25,
          flagCount: 0,
        },
        {
          submissionId: firstUpload,
          testCode: '6E2-26T1',
          testTitle: 'Fracții',
          className: '6E2',
          schoolYear: 2026,
          date: '2026-10-06T07:15:00.000Z',
          grade: 7.5,
          flagCount: 1,
        },
      ],
    });
  });

  it('returns an empty list for a student without grades', async () => {
    const res = await api.request('GET', `/api/admin/students/${classmateId}/history`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ student: { fullName: 'Ionescu Ana' }, results: [] });
  });

  it('answers 404 for an unknown student and for a student of another teacher', async () => {
    expect((await api.request('GET', '/api/admin/students/99999/history')).status).toBe(404);
    expect((await api.request('GET', '/api/admin/students/abc/history')).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    expect((await api.request('GET', `/api/admin/students/${foreign.studentId}/history`)).status).toBe(404);
  });
});

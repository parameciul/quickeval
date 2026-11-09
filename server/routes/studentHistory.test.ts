import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let studentId: number;
let classmateId: number;
let classId: number;

const started = (code: string, at: string) => api.db.prepare('UPDATE tests SET started_at = ? WHERE code = ?').bind(at, code).run();
const history = async (id = studentId) => (await api.request('GET', `/api/admin/students/${id}/history`)).body;

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
  it('lists the classes, their started tests newest first, and the papers of the student', async () => {
    // The student moves on to 7E2 in the next school year.
    const next = await makeClass(api, '7E2', [], 2027);
    await api.db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').bind(next.id, studentId).run();
    await api.request('PATCH', `/api/admin/classes/${classId}/students/${studentId}`, { active: false });

    const first = await makeTest(api, classId, 'Fracții');
    const second = await makeTest(api, classId, 'Ecuații');
    const later = await makeTest(api, next.id, 'Funcții');
    const unsent = await makeTest(api, next.id, 'Logaritmi');
    await started(first, '2026-10-06T07:15:00.000Z');
    await started(second, '2026-11-10T08:00:00.000Z');
    await started(later, '2027-10-05T07:00:00.000Z');
    await started(unsent, '2027-11-02T07:00:00.000Z');
    const firstUpload = await addSubmission(api, first, studentId, { status: 'graded', files: 1 });
    await addEvaluation(api, firstUpload, { grade: 7.5, items: [{ needsReview: true }, {}] });
    const laterUpload = await addSubmission(api, later, studentId, { status: 'graded', files: 1 });
    await addEvaluation(api, laterUpload, { grade: 9.25 });
    const secondUpload = await addSubmission(api, second, studentId, { status: 'submitted', files: 1 });
    // A classmate's paper stays out.
    const other = await addSubmission(api, first, classmateId, { status: 'graded', files: 1 });
    await addEvaluation(api, other, { grade: 4 });

    const res = await api.request('GET', `/api/admin/students/${studentId}/history`);
    expect(res.status).toBe(200);
    expect(res.body.student).toEqual({ id: studentId, fullName: 'Pop Ion', ces: false });
    expect(res.body.classes).toEqual([
      { id: next.id, name: '7E2', schoolYear: 2027, active: true },
      { id: classId, name: '6E2', schoolYear: 2026, active: false },
    ]);
    // A test of the class the student is in shows with no paper ("—").
    expect(res.body.tests).toEqual([
      { classId: next.id, code: unsent, title: 'Logaritmi', startedAt: '2027-11-02T07:00:00.000Z' },
      { classId: next.id, code: later, title: 'Funcții', startedAt: '2027-10-05T07:00:00.000Z' },
      { classId, code: second, title: 'Ecuații', startedAt: '2026-11-10T08:00:00.000Z' },
      { classId, code: first, title: 'Fracții', startedAt: '2026-10-06T07:15:00.000Z' },
    ]);
    const grades = [...res.body.grades].sort((a, b) => a.submissionId - b.submissionId);
    expect(grades).toMatchObject([
      { studentId, testCode: first, submissionId: firstUpload, status: 'graded', grade: 7.5, flagCount: 1 },
      { studentId, testCode: later, submissionId: laterUpload, status: 'graded', grade: 9.25, flagCount: 0 },
      { studentId, testCode: second, submissionId: secondUpload, status: 'submitted', grade: null, flagCount: 0 },
    ]);
  });

  it('leaves out drafts, and archived tests or tests of a class left with no paper of the student', async () => {
    const draft = await makeTest(api, classId, 'Ciornă');
    const archived = await makeTest(api, classId, 'Arhivat');
    const archivedSent = await makeTest(api, classId, 'Arhivat, trimis');
    await started(archived, '2026-10-06T07:15:00.000Z');
    await started(archivedSent, '2026-10-07T07:15:00.000Z');
    await api.db.prepare('UPDATE tests SET archived = 1 WHERE code IN (?, ?)').bind(archived, archivedSent).run();
    await addSubmission(api, archivedSent, studentId, { status: 'submitted', files: 1 });
    // A name tapped on the student page, with nothing sent: not a paper.
    await addSubmission(api, archived, studentId, { status: 'uploading' });
    expect((await history()).tests.map((test: { code: string }) => test.code)).toEqual([archivedSent]);
    expect(draft).toBeTruthy();

    // After the student leaves, a new test of that class is not the student's.
    await api.request('PATCH', `/api/admin/classes/${classId}/students/${studentId}`, { active: false });
    const after = await makeTest(api, classId, 'După plecare');
    await started(after, '2026-12-01T07:00:00.000Z');
    expect((await history()).tests.map((test: { code: string }) => test.code)).toEqual([archivedSent]);
    // The classmate still in the class sees it.
    expect((await history(classmateId)).tests.map((test: { code: string }) => test.code)).toEqual([after]);
  });

  it('gives the result link and the published state of each paper', async () => {
    const code = await makeTest(api, classId, 'Fracții');
    await started(code, '2026-10-06T07:15:00.000Z');
    const upload = await addSubmission(api, code, studentId, { status: 'graded', files: 1 });
    await addEvaluation(api, upload, { grade: 8 });
    await api.db.prepare("UPDATE submissions SET result_token = 'tok-pop', results_open = 1 WHERE id = ?").bind(upload).run();
    expect((await history()).grades).toMatchObject([{ submissionId: upload, resultsOpen: true, resultToken: 'tok-pop' }]);
  });

  it('returns empty lists for a student with no test', async () => {
    const res = await api.request('GET', `/api/admin/students/${classmateId}/history`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ student: { fullName: 'Ionescu Ana' }, tests: [], grades: [] });
  });

  it('answers 404 for an unknown student and for a student of another teacher', async () => {
    expect((await api.request('GET', '/api/admin/students/99999/history')).status).toBe(404);
    expect((await api.request('GET', '/api/admin/students/abc/history')).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    expect((await api.request('GET', `/api/admin/students/${foreign.studentId}/history`)).status).toBe(404);
  });
});

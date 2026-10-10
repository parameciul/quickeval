import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let code: string;
let studentId: number;
let submissionId: number;

const fileIds = async (id: number) =>
  (await api.db.prepare('SELECT id FROM submission_files WHERE submission_id = ? ORDER BY position').bind(id).all<{ id: number }>()).results.map(
    (row) => row.id,
  );

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2', ['Pop Ion']);
  studentId = cls.studentIds[0]!;
  code = await makeTest(api, cls.id, 'Fracții');
  submissionId = await addSubmission(api, code, studentId, { status: 'submitted', files: 2 });
  await api.env.FILES.put(`fixture/${submissionId}/1.jpg`, 'first page');
  await api.env.FILES.put(`fixture/${submissionId}/2.jpg`, 'second page');
});

afterEach(async () => {
  await api.dispose();
});

describe('GET /api/admin/submissions/:id', () => {
  it('returns the upload with its files in upload order', async () => {
    const [first, second] = await fileIds(submissionId);
    const res = await api.request('GET', `/api/admin/submissions/${submissionId}`);
    expect(res.status).toBe(200);
    expect(res.body.submission).toEqual({
      id: submissionId,
      testCode: code,
      testTitle: 'Fracții',
      testStatus: 'draft',
      studentId,
      studentName: 'Pop Ion',
      status: 'submitted',
      autoSubmitted: false,
      startedAt: '2026-10-06T08:00:00.000Z',
      submittedAt: '2026-10-06T08:30:00.000Z',
      lastError: null,
      files: [
        { id: first, name: 'poza1.jpg', contentType: 'image/jpeg', size: 100, position: 1 },
        { id: second, name: 'poza2.jpg', contentType: 'image/jpeg', size: 100, position: 2 },
      ],
      evaluation: null,
    });
  });

  it('returns the graded result with its items in barem order', async () => {
    await api.db.prepare("UPDATE submissions SET status = 'graded' WHERE id = ?").bind(submissionId).run();
    const evaluationId = await addEvaluation(api, submissionId, {
      grade: 8.5,
      items: [{ needsReview: true }, { needsReview: true, reviewed: true }, {}],
      unreadable: ['student/page-02.jpg'],
    });
    await api.db
      .prepare(`UPDATE evaluations SET strengths_json = '["Fracții"]', recommendations_json = '["Exersează ecuațiile."]' WHERE id = ?`)
      .bind(evaluationId)
      .run();
    // The first item moves to the end of the barem.
    await api.db
      .prepare("UPDATE evaluation_items SET position = 9, points = 0.5, changed_by_teacher = 1 WHERE evaluation_id = ? AND exercise_id = 'E1'")
      .bind(evaluationId)
      .run();
    const itemId = async (exerciseId: string) =>
      (await api.db.prepare('SELECT id FROM evaluation_items WHERE exercise_id = ?').bind(exerciseId).first<{ id: number }>())!.id;
    const item = { label: 'Exercițiu', maxPoints: 1, aiPoints: 1, points: 1, studentAnswer: 'r', comment: 'c', confidence: 'high' };

    const res = await api.request('GET', `/api/admin/submissions/${submissionId}`);
    expect(res.body.submission.status).toBe('graded');
    expect(res.body.submission.evaluation).toEqual({
      maxTotal: 10,
      officePoints: 1,
      total: 8.5,
      grade: 8.5,
      summary: 'Rezumat.',
      strengths: ['Fracții'],
      recommendations: ['Exersează ecuațiile.'],
      unreadable: ['student/page-02.jpg'],
      pagesReviewed: false,
      // E1 is not checked yet, and the unreadable page counts once.
      flagCount: 2,
      items: [
        { ...item, id: await itemId('E2'), exerciseId: 'E2', needsReview: true, reviewReason: 'Verifică', reviewed: true, changedByTeacher: false },
        { ...item, id: await itemId('E3'), exerciseId: 'E3', needsReview: false, reviewReason: '', reviewed: false, changedByTeacher: false },
        {
          ...item,
          id: await itemId('E1'),
          exerciseId: 'E1',
          points: 0.5,
          needsReview: true,
          reviewReason: 'Verifică',
          reviewed: false,
          changedByTeacher: true,
        },
      ],
    });
  });

  it('stops counting the unreadable pages once the teacher checked them', async () => {
    await api.db.prepare("UPDATE submissions SET status = 'graded' WHERE id = ?").bind(submissionId).run();
    const evaluationId = await addEvaluation(api, submissionId, { unreadable: ['student/page-01.jpg'] });
    await api.db.prepare("UPDATE evaluations SET pages_reviewed_at = '2026-10-08T10:00:00.000Z' WHERE id = ?").bind(evaluationId).run();
    const res = await api.request('GET', `/api/admin/submissions/${submissionId}`);
    expect(res.body.submission.evaluation).toMatchObject({ pagesReviewed: true, flagCount: 0 });
  });

  it('gives the test status and the error of a failed grading', async () => {
    await api.db
      .prepare("UPDATE submissions SET status = 'failed', last_error = 'Robotul nu a terminat la timp.' WHERE id = ?")
      .bind(submissionId)
      .run();
    await api.db.prepare("UPDATE tests SET status = 'done' WHERE code = ?").bind(code).run();
    const res = await api.request('GET', `/api/admin/submissions/${submissionId}`);
    expect(res.body.submission).toMatchObject({
      status: 'failed',
      testStatus: 'done',
      lastError: 'Robotul nu a terminat la timp.',
      evaluation: null,
    });
  });

  it('answers 404 for an unknown upload and for an upload of another teacher', async () => {
    expect((await api.request('GET', '/api/admin/submissions/99999')).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    const foreignId = await addSubmission(api, foreign.code, foreign.studentId);
    expect((await api.request('GET', `/api/admin/submissions/${foreignId}`)).status).toBe(404);
  });
});

describe('GET /api/admin/submissions/:id/files/:fileId', () => {
  it('streams a file of the upload', async () => {
    const [first] = await fileIds(submissionId);
    const res = await api.fetch(`/api/admin/submissions/${submissionId}/files/${first}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(await res.text()).toBe('first page');
  });

  it('answers 404 for a file of another upload and for files of another teacher', async () => {
    const cls = await makeClass(api, '7E2', ['Stan Eva']);
    const otherCode = await makeTest(api, cls.id);
    const otherSubmission = await addSubmission(api, otherCode, cls.studentIds[0]!, { files: 1 });
    const [otherFile] = await fileIds(otherSubmission);
    expect((await api.fetch(`/api/admin/submissions/${submissionId}/files/${otherFile}`)).status).toBe(404);

    const foreign = await otherTeacherTest(api);
    const foreignId = await addSubmission(api, foreign.code, foreign.studentId, { files: 1 });
    const [foreignFile] = await fileIds(foreignId);
    await api.env.FILES.put(`fixture/${foreignId}/1.jpg`, 'secret');
    expect((await api.fetch(`/api/admin/submissions/${foreignId}/files/${foreignFile}`)).status).toBe(404);
  });
});

describe('POST /api/admin/submissions/:id/reset', () => {
  it('deletes the upload and its files, so the student can start again', async () => {
    const res = await api.request('POST', `/api/admin/submissions/${submissionId}/reset`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reset: true });

    expect((await api.request('GET', `/api/admin/submissions/${submissionId}`)).status).toBe(404);
    expect((await api.env.FILES.list({ prefix: 'fixture/' })).objects).toEqual([]);
    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.uploads[0]).toMatchObject({ studentName: 'Pop Ion', status: 'none', submissionId: null, fileCount: 0 });
  });

  it('answers 404 for an upload of another teacher and keeps it', async () => {
    const foreign = await otherTeacherTest(api);
    const foreignId = await addSubmission(api, foreign.code, foreign.studentId, { files: 1 });
    expect((await api.request('POST', `/api/admin/submissions/${foreignId}/reset`)).status).toBe(404);
    const row = await api.db.prepare('SELECT COUNT(*) AS n FROM submission_files WHERE submission_id = ?').bind(foreignId).first<{ n: number }>();
    expect(row?.n).toBe(1);
  });
});

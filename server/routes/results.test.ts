import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest, startTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let code: string;
let token: string;
let pop: number;
let ana: number;

const jpeg = (text = 'photo') => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(text)]);
const RESULT_TOKEN = /^[a-z2-7]{24}$/;

async function uploadAndConfirm(studentId: number): Promise<{ secret: string; resultToken: string }> {
  const started = await api.request('POST', `/api/u/${token}/sessions`, { studentId });
  expect(started.status).toBe(201);
  const secret = started.body.secret as string;
  const put = await api.fetch(`/api/u/${token}/files`, {
    method: 'PUT',
    body: jpeg(),
    headers: { 'Content-Type': 'image/jpeg', 'X-File-Name': encodeURIComponent('pagina.jpg'), 'X-Upload-Session': secret },
  });
  expect(put.status).toBe(201);
  const confirmed = await api.request('POST', `/api/u/${token}/confirm`, undefined, { 'X-Upload-Session': secret });
  expect(confirmed.status).toBe(200);
  expect(confirmed.body.resultToken).toMatch(RESULT_TOKEN);
  return { secret, resultToken: confirmed.body.resultToken as string };
}

async function submissionIdOf(studentId: number): Promise<number> {
  const row = await api.db.prepare('SELECT id FROM submissions WHERE student_id = ?').bind(studentId).first<{ id: number }>();
  return row!.id;
}

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana']);
  [pop, ana] = cls.studentIds as [number, number];
  code = await makeTest(api, cls.id, 'Fracții');
  token = await startTest(api, code);
});

afterEach(async () => {
  await api.dispose();
});

describe('student result links', () => {
  it('gives every sent upload a secret result link that the teacher also sees', async () => {
    const { resultToken } = await uploadAndConfirm(pop);
    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    const row = detail.body.uploads.find((u: { studentId: number }) => u.studentId === pop);
    expect(row.resultToken).toBe(resultToken);
    const submission = await api.request('GET', `/api/admin/submissions/${await submissionIdOf(pop)}`);
    expect(submission.body.submission.resultToken).toBe(resultToken);
    expect(submission.body.submission.resultsOpen).toBe(false);
  });

  it('keeps the results closed until the teacher opens them, then closes them again', async () => {
    const { resultToken } = await uploadAndConfirm(pop);
    const closed = await api.request('GET', `/api/u/rezultat/${resultToken}`);
    expect(closed.status).toBe(403);
    expect(closed.body).toEqual({ error: 'results_closed', message: 'Rezultatele nu sunt disponibile încă. Întreabă profesorul.' });

    const opened = await api.request('POST', `/api/admin/tests/${code}/results/open`);
    expect(opened.status).toBe(200);
    expect(opened.body).toEqual({ resultsOpen: true });
    expect((await api.request('GET', `/api/admin/tests/${code}`)).body.test.resultsOpen).toBe(true);

    const result = await api.request('GET', `/api/u/rezultat/${resultToken}`);
    expect(result.status).toBe(200);
    expect(result.body.result).toMatchObject({ testCode: code, testTitle: 'Fracții', studentName: 'Pop Ion', evaluation: null });

    const shut = await api.request('POST', `/api/admin/tests/${code}/results/close`);
    expect(shut.body).toEqual({ resultsOpen: false });
    expect((await api.request('GET', `/api/u/rezultat/${resultToken}`)).status).toBe(403);
  });

  it('shows the graded result without grading internals', async () => {
    const { resultToken } = await uploadAndConfirm(pop);
    const submissionId = await submissionIdOf(pop);
    await addEvaluation(api, submissionId, { grade: 8.5 });
    await api.db.prepare("UPDATE submissions SET status = 'graded' WHERE id = ?").bind(submissionId).run();
    await api.request('POST', `/api/admin/tests/${code}/results/open`);

    const res = await api.request('GET', `/api/u/rezultat/${resultToken}`);
    expect(res.status).toBe(200);
    const evaluation = res.body.result.evaluation;
    expect(evaluation).toMatchObject({ grade: 8.5, summary: 'Rezumat.' });
    expect(evaluation.items).toHaveLength(1);
    expect(evaluation.items[0]).toEqual({
      exerciseId: 'E1',
      label: 'Exercițiu',
      maxPoints: 1,
      points: 1,
      studentAnswer: 'r',
      comment: 'c',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/confidence|needsReview|reviewReason|aiPoints|robot/i);
  });

  it('streams the files only while the results are open', async () => {
    const { resultToken } = await uploadAndConfirm(pop);
    const submissionId = await submissionIdOf(pop);
    const fileRow = await api.db
      .prepare('SELECT id FROM submission_files WHERE submission_id = ?')
      .bind(submissionId)
      .first<{ id: number }>();
    const fileId = fileRow!.id;

    expect((await api.fetch(`/api/u/rezultat/${resultToken}/files/${fileId}`)).status).toBe(403);
    await api.request('POST', `/api/admin/tests/${code}/results/open`);
    const open = await api.fetch(`/api/u/rezultat/${resultToken}/files/${fileId}`);
    expect(open.status).toBe(200);
    expect(new Uint8Array(await open.arrayBuffer()).slice(0, 4)).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));
    const missing = await api.fetch(`/api/u/rezultat/${resultToken}/files/${fileId + 999999}`);
    expect(missing.status).toBe(404);
    expect((await missing.json()).error).toBe('unknown_link');
    await api.request('POST', `/api/admin/tests/${code}/results/close`);
    const shut = await api.fetch(`/api/u/rezultat/${resultToken}/files/${fileId}`);
    expect(shut.status).toBe(403);
    expect((await shut.json()).error).toBe('results_closed');
  });

  it('answers 404 for unknown or malformed result links', async () => {
    for (const bad of ['abcdefghijkmnop2abcdefcd', 'short', 'REZULTAT-INVALID-LINK-12']) {
      expect((await api.request('GET', `/api/u/rezultat/${bad}`)).body).toEqual({
        error: 'unknown_link',
        message: 'Link greșit. Cere profesorului linkul nou.',
      });
      expect((await api.fetch(`/api/u/rezultat/${bad}/files/1`)).status).toBe(404);
    }
  });
});

describe('teacher result links', () => {
  it('returns the same link twice, and makes one for older uploads', async () => {
    const { resultToken } = await uploadAndConfirm(pop);
    const submissionId = await submissionIdOf(pop);
    const first = await api.request('GET', `/api/admin/submissions/${submissionId}/result-link`);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ resultToken });
    expect((await api.request('GET', `/api/admin/submissions/${submissionId}/result-link`)).body).toEqual({ resultToken });

    // An upload from before result links existed has none yet.
    await api.db.prepare('UPDATE submissions SET result_token = NULL WHERE id = ?').bind(submissionId).run();
    const made = await api.request('GET', `/api/admin/submissions/${submissionId}/result-link`);
    expect(made.body.resultToken).toMatch(RESULT_TOKEN);
    expect((await api.request('GET', `/api/admin/submissions/${submissionId}/result-link`)).body).toEqual(made.body);
  });

  it('hides the links and the results switch of other teachers', async () => {
    const { resultToken } = await uploadAndConfirm(pop);
    const submissionId = await submissionIdOf(pop);
    const foreign = await otherTeacherTest(api);
    expect((await api.request('GET', `/api/admin/submissions/${submissionId}/result-link`)).status).toBe(200);
    // The foreign teacher's own upload is unknown to this teacher.
    const otherSubmission = await api.db
      .prepare('SELECT id FROM submissions WHERE test_id = (SELECT id FROM tests WHERE code = ?)')
      .bind(foreign.code)
      .first<{ id: number }>();
    expect(otherSubmission).toBeNull();
    expect((await api.request('POST', `/api/admin/tests/${foreign.code}/results/open`)).status).toBe(404);
    expect((await api.request('GET', `/api/u/rezultat/${resultToken}`)).status).toBe(403);
  });
});

describe('individual result publishing', () => {
  it('publishes one student while the rest stays unpublished, then takes it back', async () => {
    const popLink = await uploadAndConfirm(pop);
    const anaLink = await uploadAndConfirm(ana);
    const popSubmission = await submissionIdOf(pop);
    const anaSubmission = await submissionIdOf(ana);

    expect((await api.request('GET', `/api/u/rezultat/${popLink.resultToken}`)).status).toBe(403);
    expect((await api.request('GET', `/api/u/rezultat/${anaLink.resultToken}`)).status).toBe(403);

    const opened = await api.request('POST', `/api/admin/submissions/${popSubmission}/results/open`);
    expect(opened.status).toBe(200);
    expect(opened.body).toEqual({ resultsOpen: true });

    expect((await api.request('GET', `/api/u/rezultat/${popLink.resultToken}`)).status).toBe(200);
    expect((await api.request('GET', `/api/u/rezultat/${anaLink.resultToken}`)).status).toBe(403);

    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    const rowOf = (studentId: number) => detail.body.uploads.find((u: { studentId: number }) => u.studentId === studentId);
    expect(rowOf(pop).resultsOpen).toBe(true);
    expect(rowOf(ana).resultsOpen).toBe(false);
    expect((await api.request('GET', `/api/admin/submissions/${popSubmission}`)).body.submission.resultsOpen).toBe(true);
    expect((await api.request('GET', `/api/admin/submissions/${anaSubmission}`)).body.submission.resultsOpen).toBe(false);

    const popFile = await api.db
      .prepare('SELECT id FROM submission_files WHERE submission_id = ?')
      .bind(popSubmission)
      .first<{ id: number }>();
    const anaFile = await api.db
      .prepare('SELECT id FROM submission_files WHERE submission_id = ?')
      .bind(anaSubmission)
      .first<{ id: number }>();
    expect((await api.fetch(`/api/u/rezultat/${popLink.resultToken}/files/${popFile!.id}`)).status).toBe(200);
    expect((await api.fetch(`/api/u/rezultat/${anaLink.resultToken}/files/${anaFile!.id}`)).status).toBe(403);

    const closed = await api.request('POST', `/api/admin/submissions/${popSubmission}/results/close`);
    expect(closed.status).toBe(200);
    expect(closed.body).toEqual({ resultsOpen: false });
    expect((await api.request('GET', `/api/u/rezultat/${popLink.resultToken}`)).status).toBe(403);
  });

  it('keeps every page open after a global publish, and stopping access takes back single pages too', async () => {
    const popLink = await uploadAndConfirm(pop);
    const anaLink = await uploadAndConfirm(ana);
    const popSubmission = await submissionIdOf(pop);

    await api.request('POST', `/api/admin/submissions/${popSubmission}/results/open`);
    await api.request('POST', `/api/admin/tests/${code}/results/open`);
    expect((await api.request('GET', `/api/u/rezultat/${popLink.resultToken}`)).status).toBe(200);
    expect((await api.request('GET', `/api/u/rezultat/${anaLink.resultToken}`)).status).toBe(200);

    // Taking back one page changes nothing while the test publishes all.
    expect((await api.request('POST', `/api/admin/submissions/${popSubmission}/results/close`)).body).toEqual({ resultsOpen: true });
    expect((await api.request('GET', `/api/u/rezultat/${popLink.resultToken}`)).status).toBe(200);

    await api.request('POST', `/api/admin/tests/${code}/results/close`);
    expect((await api.request('GET', `/api/u/rezultat/${popLink.resultToken}`)).status).toBe(403);
    expect((await api.request('GET', `/api/u/rezultat/${anaLink.resultToken}`)).status).toBe(403);
    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.uploads.every((u: { resultsOpen: boolean }) => u.resultsOpen === false)).toBe(true);
  });

  it('answers 404 for unknown uploads and for uploads of another teacher', async () => {
    expect((await api.request('POST', '/api/admin/submissions/99999/results/open')).status).toBe(404);
    expect((await api.request('POST', '/api/admin/submissions/99999/results/close')).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    const foreignSubmission = await addSubmission(api, foreign.code, foreign.studentId, { status: 'submitted' });
    expect((await api.request('POST', `/api/admin/submissions/${foreignSubmission}/results/open`)).status).toBe(404);
    expect((await api.request('POST', `/api/admin/submissions/${foreignSubmission}/results/close`)).status).toBe(404);
  });
});

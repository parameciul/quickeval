import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeClass, makeTest, startTest, startedAtOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let code: string;
let token: string;
let pop: number;
let ana: number;

const jpeg = (text = 'photo') => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(text)]);
const RESULT_CODE = /^[2-9A-HJKMNP-Z]{6}$/;

async function uploadAndConfirm(studentId: number, link = token): Promise<{ resultToken: string; resultCode: string }> {
  const started = await api.request('POST', `/api/u/${link}/sessions`, { studentId });
  expect(started.status).toBe(201);
  const secret = started.body.secret as string;
  const put = await api.fetch(`/api/u/${link}/files`, {
    method: 'PUT',
    body: jpeg(),
    headers: { 'Content-Type': 'image/jpeg', 'X-File-Name': encodeURIComponent('pagina.jpg'), 'X-Upload-Session': secret },
  });
  expect(put.status).toBe(201);
  const confirmed = await api.request('POST', `/api/u/${link}/confirm`, undefined, { 'X-Upload-Session': secret });
  expect(confirmed.status).toBe(200);
  return { resultToken: confirmed.body.resultToken as string, resultCode: confirmed.body.resultCode as string };
}

async function submissionIdOf(studentId: number): Promise<number> {
  const row = await api.db.prepare('SELECT id FROM submissions WHERE student_id = ?').bind(studentId).first<{ id: number }>();
  return row!.id;
}

async function uploadRow(studentId: number): Promise<{ resultToken: string | null; resultCode: string | null }> {
  const detail = await api.request('GET', `/api/admin/tests/${code}`);
  return detail.body.uploads.find((u: { studentId: number }) => u.studentId === studentId);
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

describe('result codes', () => {
  it('gives every result link a short code that the teacher and the result page also show', async () => {
    const { resultToken, resultCode } = await uploadAndConfirm(pop);
    expect(resultCode).toMatch(RESULT_CODE);
    expect((await uploadRow(pop)).resultCode).toBe(resultCode);
    // A student who sent nothing has no code.
    expect((await uploadRow(ana)).resultCode).toBeNull();

    await api.request('POST', `/api/admin/tests/${code}/close`);
    await api.request('POST', `/api/admin/tests/${code}/results/open`);
    const result = await api.request('GET', `/api/u/rezultat/${resultToken}`);
    expect(result.status).toBe(200);
    expect(result.body.result.resultCode).toBe(resultCode);
  });

  it('has the code from the moment the upload starts', async () => {
    await api.request('POST', `/api/u/${token}/sessions`, { studentId: pop });
    const row = await api.db.prepare('SELECT result_code FROM submissions WHERE student_id = ?').bind(pop).first<{ result_code: string | null }>();
    expect(row!.result_code).toMatch(RESULT_CODE);
  });

  it('makes the code with the link for an older upload that has neither', async () => {
    await uploadAndConfirm(pop);
    const submissionId = await submissionIdOf(pop);
    await api.db.prepare('UPDATE submissions SET result_token = NULL, result_code = NULL WHERE id = ?').bind(submissionId).run();
    expect((await uploadRow(pop)).resultCode).toBeNull();
    const made = await api.request('GET', `/api/admin/submissions/${submissionId}/result-link?startedAt=${encodeURIComponent(await startedAtOf(api, submissionId))}`);
    expect(made.status).toBe(200);
    const row = await uploadRow(pop);
    expect(row.resultToken).toBe(made.body.resultToken);
    expect(row.resultCode).toMatch(RESULT_CODE);
  });

  it('keeps the code of a paper whose link is made again', async () => {
    const { resultCode } = await uploadAndConfirm(pop);
    const submissionId = await submissionIdOf(pop);
    await api.db.prepare('UPDATE submissions SET result_token = NULL WHERE id = ?').bind(submissionId).run();
    await api.request('GET', `/api/admin/submissions/${submissionId}/result-link?startedAt=${encodeURIComponent(await startedAtOf(api, submissionId))}`);
    expect((await uploadRow(pop)).resultCode).toBe(resultCode);
  });

  it("gives no code to a Quick Try's paper", async () => {
    await api.db.prepare('UPDATE tests SET quick_try = 1 WHERE code = ?').bind(code).run();
    await api.db
      .prepare(
        `INSERT INTO submissions (test_id, student_id, status, session_hash, result_token, started_at)
         SELECT id, ?, 'uploading', 'hash', 'abcdefghijkmnop2abcdefcd', '2026-11-17T08:00:00.000Z' FROM tests WHERE code = ?`,
      )
      .bind(pop, code)
      .run();
    const row = await api.db.prepare('SELECT result_code FROM submissions WHERE student_id = ?').bind(pop).first<{ result_code: string | null }>();
    expect(row!.result_code).toBeNull();
  });

  it('never lets two papers of one test share a code', async () => {
    const first = await uploadAndConfirm(pop);
    await uploadAndConfirm(ana);
    await expect(
      api.db.prepare('UPDATE submissions SET result_code = ? WHERE student_id = ?').bind(first.resultCode, ana).run(),
    ).rejects.toThrow(/UNIQUE/);
  });
});

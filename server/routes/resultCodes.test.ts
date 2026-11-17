import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    const result = await api.request('GET', `/api/u/result/${resultToken}`);
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

describe('opening a result by its code', () => {
  const typeCode = (typed: string, link = token) => api.request('POST', `/api/u/${link}/code`, { code: typed });
  const wrongCode = (right: string) => (right.startsWith('2') ? '3' : '2') + right.slice(1);

  it('gives the result link for the right code, through either link of the test', async () => {
    const { resultToken, resultCode } = await uploadAndConfirm(pop);
    const res = await typeCode(resultCode);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ resultToken, resultCode, studentId: pop, studentName: 'Pop Ion' });

    const multi = (await api.request('POST', `/api/admin/tests/${code}/multi-link`)).body.token as string;
    expect((await typeCode(resultCode, multi)).body.resultToken).toBe(resultToken);

    // The first name of the path, for pages opened before the rename.
    const old = await api.request('POST', `/api/u/${token}/cod`, { code: resultCode });
    expect(old.status).toBe(200);
    expect(old.body).toEqual(res.body);
  });

  it('reads the code as the student types it, before and after the uploads close', async () => {
    const { resultToken, resultCode } = await uploadAndConfirm(pop);
    const typed = `${resultCode.slice(0, 3).toLowerCase()} - ${resultCode.slice(3).toLowerCase()} `;
    expect((await typeCode(typed)).body.resultToken).toBe(resultToken);
    await api.request('POST', `/api/admin/tests/${code}/close`);
    expect((await typeCode(resultCode)).body.resultToken).toBe(resultToken);
  });

  it('refuses a wrong code, a text that is not a code, and the code of another test', async () => {
    const { resultCode } = await uploadAndConfirm(pop);
    const wrong = await typeCode(wrongCode(resultCode));
    expect(wrong.status).toBe(404);
    expect(wrong.body).toEqual({ error: 'unknown_code', message: 'Codul nu este bun. Verifică fiecare literă și încearcă din nou.' });
    expect((await typeCode('')).status).toBe(404);
    expect((await typeCode('nu știu')).status).toBe(404);

    const cls = await makeClass(api, '7A', ['Alt Elev']);
    const otherCode = await makeTest(api, cls.id, 'Ecuații');
    const otherToken = await startTest(api, otherCode);
    expect((await typeCode(resultCode, otherToken)).status).toBe(404);
  });

  it('refuses a body with no code, an unknown link and a test that has not started', async () => {
    expect((await api.request('POST', `/api/u/${token}/code`, {})).status).toBe(400);
    expect((await typeCode('K7M92P', 'abcdefghijkmnop2')).status).toBe(404);
    const cls = await makeClass(api, '7A', ['Alt Elev']);
    const draft = await makeTest(api, cls.id, 'Ecuații');
    const draftToken = (await api.db.prepare('SELECT upload_token FROM tests WHERE code = ?').bind(draft).first<{ upload_token: string }>())!.upload_token;
    const res = await typeCode('K7M92P', draftToken);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('not_started');
  });

  it('stops after 10 wrong codes in 10 minutes, for the right code too, then opens again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-17T08:00:00.000Z'));
      const { resultToken, resultCode } = await uploadAndConfirm(pop);
      for (let attempt = 0; attempt < 10; attempt++) expect((await typeCode(wrongCode(resultCode))).status).toBe(404);
      const stopped = await typeCode(resultCode);
      expect(stopped.status).toBe(429);
      expect(stopped.body).toEqual({ error: 'too_many_tries', message: 'Prea multe încercări. Încearcă din nou peste câteva minute.' });
      // Refused tries do not push the window forward.
      vi.setSystemTime(new Date('2026-11-17T08:09:59.000Z'));
      expect((await typeCode(resultCode)).status).toBe(429);
      vi.setSystemTime(new Date('2026-11-17T08:10:00.000Z'));
      expect((await typeCode(resultCode)).body.resultToken).toBe(resultToken);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not count a right code, and counts a text that is not a code', async () => {
    const { resultCode } = await uploadAndConfirm(pop);
    for (let attempt = 0; attempt < 9; attempt++) expect((await typeCode('nu știu')).status).toBe(404);
    for (let attempt = 0; attempt < 5; attempt++) expect((await typeCode(resultCode)).status).toBe(200);
    expect((await typeCode(wrongCode(resultCode))).status).toBe(404);
    expect((await typeCode(resultCode)).status).toBe(429);
  });

  it('counts the wrong codes of each test apart', async () => {
    const { resultCode } = await uploadAndConfirm(pop);
    const cls = await makeClass(api, '7A', ['Alt Elev']);
    const otherCode = await makeTest(api, cls.id, 'Ecuații');
    const otherToken = await startTest(api, otherCode);
    for (let attempt = 0; attempt < 10; attempt++) await typeCode('nu știu', otherToken);
    expect((await typeCode('nu știu', otherToken)).status).toBe(429);
    expect((await typeCode(resultCode)).status).toBe(200);
  });

  it('forgets the code of a paper the teacher reset', async () => {
    const { resultCode } = await uploadAndConfirm(pop);
    const submissionId = await submissionIdOf(pop);
    const reset = await api.request('POST', `/api/admin/submissions/${submissionId}/reset`, { startedAt: await startedAtOf(api, submissionId) });
    expect(reset.status).toBe(200);
    expect((await typeCode(resultCode)).status).toBe(404);
  });

  it('refuses a cross-site request', async () => {
    const res = await api.fetch(`/api/u/${token}/code`, {
      method: 'POST',
      body: JSON.stringify({ code: 'K7M92P' }),
      headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
    });
    expect(res.status).toBe(403);
  });

  it('stays within 15 D1 queries, for a right and for a wrong code', async () => {
    const { resultCode } = await uploadAndConfirm(pop);
    const db = api.env.DB;
    for (const typed of [resultCode, wrongCode(resultCode)]) {
      let queries = 0;
      api.env.DB = new Proxy(db, {
        get(target, key) {
          const value = Reflect.get(target, key) as unknown;
          if (key === 'prepare') return (sql: string) => ((queries += 1), target.prepare(sql));
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      try {
        expect((await typeCode(typed)).status).toBe(typed === resultCode ? 200 : 404);
      } finally {
        api.env.DB = db;
      }
      expect(queries).toBeGreaterThan(2);
      expect(queries).toBeLessThanOrEqual(15);
    }
  });
});

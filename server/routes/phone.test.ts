import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { sha256Hex } from '../secrets.ts';
import { makeClass, makeTest, markCes, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let code: string;
let otherCode: string;
let studentId: number;

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7 ${text}`);

async function newLink(testCode = code): Promise<string> {
  const res = await api.request('POST', `/api/admin/tests/${testCode}/phone-link`);
  expect(res.status).toBe(201);
  return res.body.token as string;
}

function phonePut(token: string, path: string, name = 'Testul.pdf') {
  return api.fetch(`/api/phone/${token}${path}`, {
    method: 'PUT',
    body: pdf(name),
    headers: { 'Content-Type': PDF_TYPE, 'X-File-Name': encodeURIComponent(name) },
  });
}

const fileName = async (testCode: string, column: string) =>
  (await api.db.prepare(`SELECT ${column} AS name FROM tests WHERE code = ?`).bind(testCode).first<{ name: string | null }>())!.name;

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => false);
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana']);
  studentId = cls.studentIds[0]!;
  code = await makeTest(api, cls.id);
  otherCode = await makeTest(api, cls.id, 'Alt test');
});

afterEach(async () => {
  await api.dispose();
});

describe('POST /api/admin/tests/:code/phone-link', () => {
  it('makes a link of 40 characters for 24 hours, and keeps only its hash', async () => {
    const res = await api.request('POST', `/api/admin/tests/${code}/phone-link`);
    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^[a-z2-7]{40}$/);
    const hours = (Date.parse(res.body.expiresAt) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    const rows = await api.db.prepare('SELECT token_hash FROM test_phone_links').all<{ token_hash: string }>();
    expect(rows.results.map((row) => row.token_hash)).toEqual([await sha256Hex(res.body.token)]);
  });

  it('answers 404 for another teacher’s test, and 409 for a Quick Try’s', async () => {
    const foreign = await otherTeacherTest(api);
    expect((await api.request('POST', `/api/admin/tests/${foreign.code}/phone-link`)).status).toBe(404);
    await api.db.prepare('UPDATE tests SET quick_try = 1 WHERE code = ?').bind(code).run();
    const res = await api.request('POST', `/api/admin/tests/${code}/phone-link`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('phone_link');
  });

  it('deletes every expired link when it makes a new one', async () => {
    await newLink(otherCode);
    const old = await newLink();
    await api.db.prepare("UPDATE test_phone_links SET expires_at = '2020-01-01T00:00:00.000Z'").run();
    await newLink();
    const rows = await api.db.prepare('SELECT token_hash FROM test_phone_links').all<{ token_hash: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]!.token_hash).not.toBe(await sha256Hex(old));
  });
});

describe('/api/phone/:token', () => {
  it('tells the phone which files the test has, and nothing about its students', async () => {
    const token = await newLink();
    const res = await api.request('GET', `/api/phone/${token}/info`);
    expect(res.status).toBe(200);
    expect(res.body.info).toEqual({
      code,
      title: 'Test de evaluare',
      className: '6E2',
      expiresAt: expect.any(String),
      ces: false,
      files: { test: false, barem: false, cesTest: false, cesBarem: false },
      barem: { request: 'none', unchecked: false },
      cesBarem: { request: 'none', unchecked: false },
    });
    expect(JSON.stringify(res.body)).not.toContain('Pop Ion');
  });

  it('says a CES variant is to fill while the class has a CES student and the switch is on', async () => {
    await markCes(api, studentId);
    const token = await newLink();
    expect((await api.request('GET', `/api/phone/${token}/info`)).body.info.ces).toBe(true);
    await api.db.prepare('UPDATE tests SET ces_off = 1 WHERE code = ?').bind(code).run();
    expect((await api.request('GET', `/api/phone/${token}/info`)).body.info.ces).toBe(false);
  });

  it('takes the test file for its own test and starts the robot for the print PDF', async () => {
    const token = await newLink();
    const res = await phonePut(token, `/tests/${code}/files/test`, 'Testul.pdf');
    expect(res.status).toBe(200);
    expect(await fileName(code, 'test_file_name')).toBe('Testul.pdf');
    expect(dispatchRobot).toHaveBeenCalledWith(expect.anything(), 'main');
    expect((await api.request('GET', `/api/phone/${token}/info`)).body.info.files.test).toBe(true);
  });

  it('takes the barem and the CES files, and asks for a barem made from the test', async () => {
    await markCes(api, studentId);
    const token = await newLink();
    expect((await phonePut(token, `/tests/${code}/files/test`)).status).toBe(200);
    const generate = await api.fetch(`/api/phone/${token}/tests/${code}/marking-scheme/generate`, { method: 'POST' });
    expect(generate.status).toBe(200);
    expect((await phonePut(token, `/tests/${code}/sen/files/test`, 'CES.pdf')).status).toBe(200);
    expect((await phonePut(token, `/tests/${code}/sen/files/marking-scheme`, 'Barem CES.pdf')).status).toBe(200);
    const info = (await api.request('GET', `/api/phone/${token}/info`)).body.info;
    expect(info.barem.request).toBe('requested');
    expect(info.files).toEqual({ test: true, barem: false, cesTest: true, cesBarem: true });
  });

  it('refuses another test of the same teacher, and leaves it as it was', async () => {
    const token = await newLink();
    const res = await phonePut(token, `/tests/${otherCode}/files/test`);
    expect(res.status).toBe(404);
    expect(await fileName(otherCode, 'test_file_name')).toBeNull();
    const generate = await api.fetch(`/api/phone/${token}/tests/${otherCode}/marking-scheme/generate`, { method: 'POST' });
    expect(generate.status).toBe(404);
  });

  it.each([
    ['GET', ''],
    ['GET', '/files/test'],
    ['PATCH', ''],
    ['DELETE', ''],
    ['POST', '/start'],
    ['POST', '/multi-link'],
    ['POST', '/phone-link'],
    ['GET', '/report'],
    ['PUT', '/sen/off'],
  ])('answers 404 to every other call of the teacher API: %s %s', async (method, rest) => {
    const token = await newLink();
    const res = await api.request(method, `/api/phone/${token}/tests/${code}${rest}`, method === 'GET' || method === 'DELETE' ? undefined : {});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
    expect(await api.db.prepare('SELECT COUNT(*) AS n FROM tests').first<{ n: number }>()).toEqual({ n: 2 });
  });

  it.each([
    ['GET', '/tests'],
    ['GET', '/tests?year=2026'],
    ['GET', '/tests/'],
    ['POST', '/tests'],
  ])('never lists or makes the teacher’s tests: %s %s', async (method, path) => {
    const token = await newLink();
    const res = await api.request(method, `/api/phone/${token}${path}`, method === 'POST' ? { classId: 1, title: 'Nou' } : undefined);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('Alt test');
    expect(await api.db.prepare('SELECT COUNT(*) AS n FROM tests').first<{ n: number }>()).toEqual({ n: 2 });
  });

  it('answers 404 to a token it does not know, and to one of another shape', async () => {
    for (const token of ['a'.repeat(40), 'a'.repeat(32), 'NOT-A-TOKEN']) {
      const res = await api.request('GET', `/api/phone/${token}/info`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('unknown_phone_link');
    }
  });

  it('answers 410 once the link expired, and writes nothing', async () => {
    const token = await newLink();
    await api.db.prepare("UPDATE test_phone_links SET expires_at = '2020-01-01T00:00:00.000Z'").run();
    expect((await api.request('GET', `/api/phone/${token}/info`)).status).toBe(410);
    const res = await phonePut(token, `/tests/${code}/files/test`);
    expect(res.status).toBe(410);
    expect(await fileName(code, 'test_file_name')).toBeNull();
  });

  it('stops working when the teacher’s account is closed', async () => {
    const token = await newLink();
    await api.db.prepare("UPDATE teachers SET status = 'disabled' WHERE id = ?").bind(api.teacherId).run();
    expect((await api.request('GET', `/api/phone/${token}/info`)).status).toBe(404);
    expect((await phonePut(token, `/tests/${code}/files/test`)).status).toBe(404);
  });

  it('dies with its test', async () => {
    const token = await newLink();
    expect((await api.request('DELETE', `/api/admin/tests/${code}`)).status).toBe(200);
    expect((await api.request('GET', `/api/phone/${token}/info`)).status).toBe(404);
  });
});

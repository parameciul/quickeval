import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { addTestFiles, makeClass, makeTest, otherTeacherTest, startTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let code: string;

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7 ${text}`);
const row = () =>
  api.db
    .prepare('SELECT status, barem_request, barem_request_attempts, barem_unchecked, evaluation_at, files_version FROM tests WHERE code = ?')
    .bind(code)
    .first<{
      status: string;
      barem_request: string;
      barem_request_attempts: number;
      barem_unchecked: number;
      evaluation_at: string | null;
      files_version: number;
    }>();
const setTest = (sql: string, ...params: unknown[]) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(...params, code).run();
const putTestFile = (name: string, text: string, kind = 'test') =>
  api.fetch(`/api/admin/tests/${code}/files/${kind}`, {
    method: 'PUT',
    body: pdf(text),
    headers: { 'Content-Type': PDF_TYPE, 'X-File-Name': encodeURIComponent(name) },
  });
const generate = (target = code) => api.request('POST', `/api/admin/tests/${target}/barem/generate`);
const checked = (filesVersion: number, target = code) => api.request('POST', `/api/admin/tests/${target}/barem/checked`, { filesVersion });

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => true);
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '6E2', ['Pop Ion']);
  code = await makeTest(api, cls.id);
});

afterEach(async () => {
  await api.dispose();
});

describe('POST /barem/generate', () => {
  it('requests a barem, clears the schedule, and starts the robot', async () => {
    await startTest(api, code);
    await addTestFiles(api, code, ['test']);
    await setTest("evaluation_at = '2099-01-01T10:00:00.000Z', barem_request_attempts = 2");
    const res = await generate();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ barem: { request: 'requested', unchecked: false }, robot: 'dispatched' });
    expect(await row()).toMatchObject({ barem_request: 'requested', barem_request_attempts: 0, evaluation_at: null });
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('allows a draft test', async () => {
    await addTestFiles(api, code, ['test']);
    const res = await generate();
    expect(res.status).toBe(200);
    expect(res.body.barem.request).toBe('requested');
    expect((await row())!.barem_request).toBe('requested');
  });

  it('refuses without a test file', async () => {
    const res = await generate();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'missing_test_file', message: 'Încarcă testul înainte să generezi baremul.' });
    expect((await row())!.barem_request).toBe('none');
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it.each(['evaluating', 'done'])('refuses in %s', async (status) => {
    await startTest(api, code);
    await addTestFiles(api, code, ['test']);
    await setTest('status = ?', status);
    const res = await generate();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'not_editable', message: 'Baremul se poate genera doar înainte de evaluare.' });
    expect((await row())!.barem_request).toBe('none');
  });

  it('refuses a test of another teacher', async () => {
    const other = await otherTeacherTest(api);
    expect((await generate(other.code)).status).toBe(404);
  });
});

describe('POST /barem/checked', () => {
  it('confirms an unchecked barem with the shown filesVersion', async () => {
    await addTestFiles(api, code, ['test', 'barem']);
    await setTest('barem_unchecked = 1');
    const res = await checked((await row())!.files_version);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ barem: { request: 'none', unchecked: false } });
    expect((await row())!.barem_unchecked).toBe(0);
  });

  it('refuses a confirm with an old filesVersion', async () => {
    await addTestFiles(api, code, ['test', 'barem']);
    await setTest('barem_unchecked = 1');
    const res = await checked((await row())!.files_version + 1);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'stale', message: 'Baremul s-a schimbat. Reîncarcă pagina.' });
    expect((await row())!.barem_unchecked).toBe(1);
  });

  it('refuses a confirm while a new barem is being generated', async () => {
    await addTestFiles(api, code, ['test', 'barem']);
    await setTest("barem_unchecked = 1, barem_request = 'requested'");
    expect((await checked((await row())!.files_version)).status).toBe(409);
    expect((await row())!.barem_unchecked).toBe(1);
  });

  it('refuses a body without a filesVersion', async () => {
    const res = await api.request('POST', `/api/admin/tests/${code}/barem/checked`, {});
    expect(res.status).toBe(400);
  });

  it('refuses a test of another teacher', async () => {
    const other = await otherTeacherTest(api);
    expect((await checked(0, other.code)).status).toBe(404);
  });
});

describe('file uploads and the generated barem', () => {
  it('a teacher barem upload clears unchecked and a waiting request', async () => {
    await addTestFiles(api, code, ['test']);
    await setTest("barem_unchecked = 1, barem_request = 'requested', barem_request_attempts = 1");
    const res = await putTestFile('barem.pdf', 'barem', 'barem');
    expect(res.status).toBe(200);
    expect(await row()).toMatchObject({ barem_unchecked: 0, barem_request: 'none', barem_request_attempts: 0 });
  });

  it('a new test file asks for a new barem when the barem is unchecked', async () => {
    await setTest('barem_unchecked = 1, barem_request_attempts = 2');
    const res = await putTestFile('test2.pdf', 'enunț nou');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ robot: 'dispatched' });
    expect(await row()).toMatchObject({ barem_request: 'requested', barem_request_attempts: 0, barem_unchecked: 1 });
    expect(dispatchRobot).toHaveBeenCalled();
  });

  it('a new test file leaves a checked barem alone', async () => {
    const res = await putTestFile('test2.pdf', 'enunț nou');
    expect(res.status).toBe(200);
    expect(await row()).toMatchObject({ barem_request: 'none', barem_unchecked: 0 });
  });

  it('a new test file does not ask for a barem once the test is done', async () => {
    await startTest(api, code);
    await setTest("barem_unchecked = 1, status = 'done'");
    await putTestFile('test2.pdf', 'enunț nou');
    expect((await row())!.barem_request).toBe('none');
  });
});

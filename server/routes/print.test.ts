import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_TYPE, printFileKey } from '../../shared/files.ts';
import { addSubmission, addTestFiles, makeClass, makeTest, otherTeacherTest, startTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let code: string;
let studentId: number;

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7 ${text}`);

const printRow = () =>
  api.db
    .prepare('SELECT print_status, print_file_key, print_attempts, files_version FROM tests WHERE code = ?')
    .bind(code)
    .first<{ print_status: string; print_file_key: string | null; print_attempts: number; files_version: number }>();
const setTest = (sql: string, ...params: unknown[]) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(...params, code).run();
const putTestFile = (name: string, text: string, kind = 'test') =>
  api.fetch(`/api/admin/tests/${code}/files/${kind}`, {
    method: 'PUT',
    body: pdf(text),
    headers: { 'Content-Type': PDF_TYPE, 'X-File-Name': encodeURIComponent(name) },
  });

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => true);
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '6E2', ['Pop Ion']);
  studentId = cls.studentIds[0]!;
  code = await makeTest(api, cls.id);
});

afterEach(async () => {
  await api.dispose();
});

describe('starting the robot for the print PDF', () => {
  it('starts the robot when a started test has a test file', async () => {
    await addTestFiles(api, code, ['test']);
    const res = await api.request('POST', `/api/admin/tests/${code}/start`);
    expect(res.status).toBe(200);
    expect(res.body.robot).toBe('dispatched');
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('does not start the robot when the started test has no test file', async () => {
    const res = await api.request('POST', `/api/admin/tests/${code}/start`);
    expect(res.body.robot).toBeNull();
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('starts the robot when an open test gets its test file', async () => {
    await startTest(api, code);
    const res = await putTestFile('test.pdf', 'enunț');
    expect(res.status).toBe(200);
    expect((await res.json()) as { robot: string }).toMatchObject({ robot: 'dispatched' });
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('starts the robot on reopen when the print PDF is missing', async () => {
    await startTest(api, code);
    await addTestFiles(api, code);
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating', exercise_list_status = 'ready'");
    const res = await api.request('POST', `/api/admin/tests/${code}/reopen`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'open', robot: 'dispatched' });
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('does not start the robot on reopen when the print PDF is ready', async () => {
    await startTest(api, code);
    await addTestFiles(api, code);
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating', exercise_list_status = 'ready', print_status = 'ready', print_file_key = 'k.pdf'");
    const res = await api.request('POST', `/api/admin/tests/${code}/reopen`);
    expect(res.body).toEqual({ status: 'open', robot: null });
    expect(dispatchRobot).not.toHaveBeenCalled();
  });
});

describe('a new test or barem file and the print PDF', () => {
  it('a new test file resets the print PDF and deletes the old one', async () => {
    await startTest(api, code);
    await api.env.FILES.put('old-key', pdf('vechi'));
    await setTest("print_status = 'ready', print_file_key = 'old-key', print_attempts = 2");
    const res = await putTestFile('test.pdf', 'nou');
    expect(res.status).toBe(200);
    expect(await printRow()).toMatchObject({ print_status: 'none', print_file_key: null, print_attempts: 0 });
    expect(await api.env.FILES.get('old-key')).toBeNull();
  });

  it('a new test file with the same name keeps no old print', async () => {
    await startTest(api, code);
    await putTestFile('test.pdf', 'unu');
    const before = (await printRow())!.files_version;
    const key = printFileKey(api.teacherId, 2026, code, 'test.pdf', before);
    await api.env.FILES.put(key, pdf('qr'));
    await setTest("print_status = 'ready', print_file_key = ?", key);

    await putTestFile('test.pdf', 'doi');
    const after = await printRow();
    expect(after).toMatchObject({ print_status: 'none', print_file_key: null, files_version: before + 1 });
    expect(await api.env.FILES.get(key)).toBeNull();
  });

  it('a new barem does not touch the print PDF', async () => {
    await startTest(api, code);
    await api.env.FILES.put('keep-key', pdf('qr'));
    await setTest("print_status = 'ready', print_file_key = 'keep-key'");
    await putTestFile('barem.pdf', 'barem', 'barem');
    expect(await printRow()).toMatchObject({ print_status: 'ready', print_file_key: 'keep-key' });
    expect(await api.env.FILES.get('keep-key')).not.toBeNull();
  });
});

describe('GET /api/admin/tests/:code/print', () => {
  it('serves the print PDF only when it is ready', async () => {
    await startTest(api, code);
    expect((await api.fetch(`/api/admin/tests/${code}/print`)).status).toBe(404);

    await api.env.FILES.put('print-key', pdf('cu cod'));
    await setTest("print_status = 'ready', print_file_key = 'print-key'");
    const res = await api.fetch(`/api/admin/tests/${code}/print`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe(PDF_TYPE);
    expect(res.headers.get('Content-Disposition')).toContain(`${code}-cu-cod-qr.pdf`);
    expect(await res.text()).toBe('%PDF-1.7 cu cod');
  });

  it('answers 404 when the object is missing', async () => {
    await setTest("print_status = 'ready', print_file_key = 'gone'");
    expect((await api.fetch(`/api/admin/tests/${code}/print`)).status).toBe(404);
  });
});

describe('POST /api/admin/tests/:code/print/retry', () => {
  it('retries a failed print and starts the robot', async () => {
    await startTest(api, code);
    await setTest("print_status = 'failed', print_attempts = 3");
    const res = await api.request('POST', `/api/admin/tests/${code}/print/retry`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ print: { status: 'none', fromWord: false }, robot: 'dispatched' });
    expect(await printRow()).toMatchObject({ print_status: 'none', print_attempts: 0 });
  });

  it('refuses a print that did not fail', async () => {
    await startTest(api, code);
    await setTest("print_status = 'ready', print_file_key = 'k'");
    const res = await api.request('POST', `/api/admin/tests/${code}/print/retry`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('not_failed');
    expect(dispatchRobot).not.toHaveBeenCalled();
  });
});

describe('print routes and other teachers', () => {
  it("keeps another teacher's test out", async () => {
    const foreign = await otherTeacherTest(api);
    await api.db.prepare("UPDATE tests SET print_status = 'failed' WHERE code = ?").bind(foreign.code).run();
    expect((await api.fetch(`/api/admin/tests/${foreign.code}/print`)).status).toBe(404);
    expect((await api.request('POST', `/api/admin/tests/${foreign.code}/print/retry`)).status).toBe(404);
    const row = await api.db.prepare('SELECT print_status FROM tests WHERE code = ?').bind(foreign.code).first();
    expect(row).toEqual({ print_status: 'failed' });
  });
});

describe('DELETE /api/admin/tests/:code', () => {
  it('deletes the print PDF with the test', async () => {
    await api.env.FILES.put('print-key', pdf('qr'));
    await setTest("print_status = 'ready', print_file_key = 'print-key'");
    const res = await api.request('DELETE', `/api/admin/tests/${code}`);
    expect(res.status).toBe(200);
    expect(await api.env.FILES.get('print-key')).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PDF_TYPE, printFileKey } from '../../shared/files.ts';
import { addSubmission, addTestFiles, makeClass, makeTest, ROBOT_KEY, robotRequest, setRobotKey, startTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let robot: ReturnType<typeof robotRequest>;
let code: string;
let testId: number;
let teacherId: number;
let studentId: number;

const RUN = 'run-print-0001';
const OTHER_RUN = 'run-print-0002';
const SOURCE = new TextEncoder().encode('%PDF-1.7 enunț');

const setTest = (sql: string, ...params: unknown[]) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(...params, code).run();
const row = () =>
  api.db
    .prepare('SELECT print_status, print_file_key, print_attempts, files_version, upload_token FROM tests WHERE code = ?')
    .bind(code)
    .first<{ print_status: string; print_file_key: string | null; print_attempts: number; files_version: number; upload_token: string }>();
const lease = (runId = RUN) => robot('POST', '/lease', { runId });
const putPrint = (body: BodyInit, headers: Record<string, string> = {}) =>
  api.fetch(`/api/runner/tests/${testId}/print`, {
    method: 'PUT',
    body,
    headers: { Authorization: `Bearer ${ROBOT_KEY}`, 'Content-Type': PDF_TYPE, 'X-Run-Id': RUN, 'X-Files-Version': '0', ...headers },
  });
const pdfBody = (text = 'cu cod') => new TextEncoder().encode(`%PDF-1.7 ${text}`);

beforeEach(async () => {
  api = await startTestApi();
  await setRobotKey(api);
  robot = robotRequest(api);
  const cls = await makeClass(api, '6E2', ['Pop Ion']);
  studentId = cls.studentIds[0]!;
  code = await makeTest(api, cls.id);
  await startTest(api, code);
  await addTestFiles(api, code, ['test']);
  await api.env.FILES.put(`fixture/${code}/test.pdf`, SOURCE);
  testId = await testIdOf(api, code);
  teacherId = api.teacherId;
});

afterEach(async () => {
  await api.dispose();
});

describe('print jobs in /check and /tasks', () => {
  it('lists an open test with a test file as a print job', async () => {
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 0, pendingGrading: 0, analyses: 0, prints: 1 });
    expect((await robot('GET', '/tasks')).body).toEqual({ exerciseLists: [], pendingGrading: 0, analyses: [], prints: [testId] });
  });

  it('lists no print job for a draft, an evaluating, a done, a ready, or a failed test', async () => {
    const states = [
      "status = 'draft', upload_token = NULL",
      "status = 'evaluating'",
      "status = 'done'",
      "print_status = 'ready', print_file_key = 'k'",
      "print_status = 'failed'",
      'test_file_key = NULL',
    ];
    for (const state of states) {
      await setTest(state);
      // A waiting upload keeps an evaluating test from ending on its own.
      if (state.includes('evaluating')) await addSubmission(api, code, studentId, { status: 'submitted' });
      const check = (await robot('POST', '/check')).body;
      expect(check.prints, state).toBe(0);
      expect((await robot('GET', '/tasks')).body.prints, state).toEqual([]);
      await api.db.prepare('DELETE FROM submissions').run();
      await setTest("status = 'open', upload_token = 'tttttttttttttttt', print_status = 'none', print_file_key = NULL, test_file_key = 'fixture/x/test.pdf'");
    }
  });

  it('counts the test as robot work only through its print job', async () => {
    await setTest("print_status = 'ready', print_file_key = 'k'");
    expect((await robot('POST', '/check')).body.hasWork).toBe(false);
  });
});

describe('GET /tests/:id/print-job', () => {
  it('gives the print job and its file only while the job waits', async () => {
    const job = await robot('GET', `/tests/${testId}/print-job`);
    expect(job.status).toBe(200);
    const stored = (await row())!;
    expect(job.body).toEqual({ job: { testId, filesVersion: stored.files_version, contentType: PDF_TYPE, uploadToken: stored.upload_token } });
    expect(JSON.stringify(job.body)).not.toContain('fixture/');

    const file = await api.fetch(`/api/runner/tests/${testId}/print-job/file`, { headers: { Authorization: `Bearer ${ROBOT_KEY}` } });
    expect(file.status).toBe(200);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(SOURCE);

    await setTest("print_status = 'ready', print_file_key = 'k'");
    expect((await robot('GET', `/tests/${testId}/print-job`)).status).toBe(404);
    expect((await api.fetch(`/api/runner/tests/${testId}/print-job/file`, { headers: { Authorization: `Bearer ${ROBOT_KEY}` } })).status).toBe(404);
  });

  it('shows nothing of a test in evaluation', async () => {
    await setTest("status = 'evaluating'");
    expect((await robot('GET', `/tests/${testId}/print-job`)).status).toBe(404);
    expect((await api.fetch(`/api/runner/tests/${testId}/print-job/file`, { headers: { Authorization: `Bearer ${ROBOT_KEY}` } })).status).toBe(404);
  });

  it('needs the robot key', async () => {
    expect((await api.request('GET', `/api/runner/tests/${testId}/print-job`)).status).toBe(401);
  });
});

describe('PUT /tests/:id/print', () => {
  beforeEach(async () => {
    await lease();
  });

  it('saves the print PDF from the run that holds the lease', async () => {
    const res = await putPrint(pdfBody());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ready' });
    const stored = (await row())!;
    const key = printFileKey(teacherId, 2026, code, 'test.pdf', stored.files_version);
    expect(stored).toMatchObject({ print_status: 'ready', print_file_key: key });
    const object = await api.env.FILES.get(key);
    expect(new Uint8Array(await object!.arrayBuffer())).toEqual(pdfBody());
  });

  it('refuses a print made from an older files_version', async () => {
    await setTest('files_version = files_version + 1');
    const res = await putPrint(pdfBody(), { 'X-Files-Version': '0' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'not_needed' });
    expect(await api.env.FILES.get(printFileKey(teacherId, 2026, code, 'test.pdf', 0))).toBeNull();
    expect(await row()).toMatchObject({ print_status: 'none', print_file_key: null });
  });

  it('refuses a print from a run without the lease', async () => {
    const res = await putPrint(pdfBody(), { 'X-Run-Id': OTHER_RUN });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'lease_lost' });
    expect(await api.env.FILES.get(printFileKey(teacherId, 2026, code, 'test.pdf', 0))).toBeNull();
    expect(await row()).toMatchObject({ print_status: 'none' });
  });

  it('refuses a second print and keeps the first object', async () => {
    expect((await putPrint(pdfBody('first'))).status).toBe(200);
    const res = await putPrint(pdfBody('second'));
    expect(res.status).toBe(409);
    const stored = (await row())!;
    const object = await api.env.FILES.get(stored.print_file_key!);
    expect(new Uint8Array(await object!.arrayBuffer())).toEqual(pdfBody('first'));
  });

  it('refuses a print for a test that is gone', async () => {
    await api.db.prepare('DELETE FROM tests WHERE id = ?').bind(testId).run();
    expect((await putPrint(pdfBody())).status).toBe(404);
  });

  it('refuses a body that is not a PDF', async () => {
    expect((await putPrint('hello')).status).toBe(415);
    expect((await putPrint(pdfBody(), { 'Content-Type': 'image/png' })).status).toBe(415);
    expect(await row()).toMatchObject({ print_status: 'none' });
  });

  it('refuses a bad run id or files version', async () => {
    expect((await putPrint(pdfBody(), { 'X-Run-Id': 'x' })).status).toBe(400);
    expect((await putPrint(pdfBody(), { 'X-Files-Version': 'abc' })).status).toBe(400);
  });
});

describe('POST /tests/:id/print-failed', () => {
  const failed = (runId = RUN, error = 'crash') => robot('POST', `/tests/${testId}/print-failed`, { runId, filesVersion: 0, error });

  beforeEach(async () => {
    await lease();
  });

  it('counts a failed print and fails it at the third attempt', async () => {
    expect((await failed()).body).toEqual({ status: 'none' });
    expect((await failed()).body).toEqual({ status: 'none' });
    expect((await failed()).body).toEqual({ status: 'failed' });
    expect(await row()).toMatchObject({ print_status: 'failed', print_attempts: 3 });
    const again = await failed();
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ error: 'not_needed' });
  });

  it('does not count a usage limit', async () => {
    expect((await failed(RUN, 'usage_limit')).body).toEqual({ status: 'none' });
    expect(await row()).toMatchObject({ print_attempts: 0 });
  });

  it('refuses a run without the lease and an older files_version', async () => {
    const other = await failed(OTHER_RUN);
    expect(other.status).toBe(409);
    expect(other.body).toMatchObject({ error: 'lease_lost' });
    await setTest('files_version = files_version + 1');
    const stale = await failed();
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: 'not_needed' });
    expect(await row()).toMatchObject({ print_attempts: 0 });
  });
});

describe('the robot key and the teacher routes', () => {
  it('keeps the robot key away from the teacher routes', async () => {
    const res = await api.request('GET', `/api/admin/tests/${code}/print`, undefined, { Authorization: `Bearer ${ROBOT_KEY}` });
    expect(res.status).toBe(404);
    const outside = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined } });
    try {
      await setRobotKey(outside);
      const denied = await outside.request('GET', `/api/admin/tests/${code}/print`, undefined, { Authorization: `Bearer ${ROBOT_KEY}` });
      expect(denied.status).toBeGreaterThanOrEqual(401);
      expect(denied.status).not.toBe(200);
    } finally {
      await outside.dispose();
    }
  });
});

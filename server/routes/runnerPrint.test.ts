import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PDF_TYPE, printFileKey } from '../../shared/files.ts';
import { createApp } from '../app.ts';
import { printKeyIs, savePrint } from '../db/runner.ts';
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
const createdAt = async () => (await api.db.prepare('SELECT created_at FROM tests WHERE code = ?').bind(code).first<{ created_at: string }>())!.created_at;
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
    expect(job.body).toEqual({
      job: { testId, createdAt: await createdAt(), filesVersion: stored.files_version, contentType: PDF_TYPE, uploadToken: stored.upload_token },
    });
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

  it('refuses a print made for a deleted test whose id another test took', async () => {
    await lease();
    const made = await createdAt();
    await api.db.prepare('UPDATE tests SET created_at = ? WHERE code = ?').bind('2026-10-30T10:00:00.000Z', code).run();
    const res = await putPrint(pdfBody(), { 'X-Created-At': made });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'not_needed' });
    expect(await row()).toMatchObject({ print_status: 'none', print_file_key: null });
    const failed = await robot('POST', `/tests/${testId}/print-failed`, { runId: RUN, filesVersion: 0, createdAt: made, error: 'crash' });
    expect(failed.status).toBe(409);
    expect(await row()).toMatchObject({ print_attempts: 0 });

    expect((await putPrint(pdfBody(), { 'X-Created-At': '2026-10-30T10:00:00.000Z' })).status).toBe(200);
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

describe('the shared print object', () => {
  it('leaves the object of the lease holder untouched when a run without the lease writes', async () => {
    await lease();
    const key = printFileKey(teacherId, 2026, code, 'test.pdf', 0);
    await api.env.FILES.put(key, pdfBody('holder'));
    const loser = await putPrint(pdfBody('loser'), { 'X-Run-Id': OTHER_RUN });
    expect(loser.status).toBe(409);
    expect(new Uint8Array(await (await api.env.FILES.get(key))!.arrayBuffer())).toEqual(pdfBody('holder'));
    const stale = await putPrint(pdfBody('stale'), { 'X-Files-Version': '5' });
    expect(stale.status).toBe(409);
    expect(new Uint8Array(await (await api.env.FILES.get(key))!.arrayBuffer())).toEqual(pdfBody('holder'));
    expect((await putPrint(pdfBody('holder'))).status).toBe(200);
    expect(await api.env.FILES.get(key)).not.toBeNull();
    expect(await row()).toMatchObject({ print_status: 'ready', print_file_key: key });
  });

  it('refuses a missing or non-numeric files version with 400', async () => {
    await lease();
    for (const value of ['', 'abc', '-1', '1.5']) {
      expect((await putPrint(pdfBody(), { 'X-Files-Version': value })).status, value).toBe(400);
    }
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
      // No teacher login: admin auth answers 401 whatever the key (as in runner.test.ts).
      expect(denied.status).toBe(401);
    } finally {
      await outside.dispose();
    }
  });

  it('answers 401 to the robot key on a real host', async () => {
    const guarded = await startTestApi();
    try {
      await setRobotKey(guarded);
      const denied = await createApp().request(
        `https://quickeval.pages.dev/api/admin/tests/${code}/print`,
        { headers: { Authorization: `Bearer ${ROBOT_KEY}` } },
        guarded.env,
      );
      expect(denied.status).toBe(401);
    } finally {
      await guarded.dispose();
    }
  });
});

describe('savePrint and printKeyIs', () => {
  it('saves nothing for a print that is already ready, and then names the stored key', async () => {
    await lease();
    const key = printFileKey(teacherId, 2026, code, 'test.pdf', 0);
    expect(await savePrint(api.db, testId, RUN, 0, null, key, '2026-10-25T08:00:00.000Z')).toBe(true);
    expect(await printKeyIs(api.db, testId, key)).toBe(true);
    // The route keeps the object in this case: a second run made the same version.
    expect(await savePrint(api.db, testId, RUN, 0, null, key, '2026-10-25T08:01:00.000Z')).toBe(false);
    expect(await printKeyIs(api.db, testId, key)).toBe(true);
    expect(await printKeyIs(api.db, testId, 'other-key')).toBe(false);
  });
});

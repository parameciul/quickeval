import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DOCX_TYPE, generatedBaremKey } from '../../shared/files.ts';
import { saveTestFile } from '../db/tests.ts';
import { addTestFiles, makeClass, makeTest, ROBOT_KEY, robotRequest, setRobotKey, startTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let robot: ReturnType<typeof robotRequest>;
let code: string;
let testId: number;
let teacherId: number;
let oldKey: string;

const RUN = 'run-barem-0001';
const OTHER_RUN = 'run-barem-0002';

const setTest = (sql: string, ...params: unknown[]) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(...params, code).run();
const row = () =>
  api.db
    .prepare(
      'SELECT barem_file_key, barem_file_name, barem_file_type, barem_unchecked, barem_request, barem_request_attempts, files_version, exercise_list_status FROM tests WHERE code = ?',
    )
    .bind(code)
    .first<{
      barem_file_key: string | null;
      barem_file_name: string | null;
      barem_file_type: string | null;
      barem_unchecked: number;
      barem_request: string;
      barem_request_attempts: number;
      files_version: number;
      exercise_list_status: string;
    }>();
const createdAt = async () => (await api.db.prepare('SELECT created_at FROM tests WHERE code = ?').bind(code).first<{ created_at: string }>())!.created_at;
const version = async () => (await row())!.files_version;
const lease = (runId = RUN) => robot('POST', '/lease', { runId });
const auth = { Authorization: `Bearer ${ROBOT_KEY}` };
const docx = (text = 'barem') => new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode(text)]);
const putBarem = async (body: BodyInit, headers: Record<string, string> = {}) => {
  const filesVersion = headers['X-Files-Version'] ?? String(await version());
  return api.fetch(`/api/runner/tests/${testId}/barem`, {
    method: 'PUT',
    body,
    headers: { ...auth, 'Content-Type': DOCX_TYPE, 'X-Run-Id': RUN, ...headers, 'X-Files-Version': filesVersion },
  });
};
const jobPath = () => `/tests/${testId}/barem-job`;

beforeEach(async () => {
  api = await startTestApi();
  await setRobotKey(api);
  robot = robotRequest(api);
  const cls = await makeClass(api, '6E2', ['Pop Ion']);
  code = await makeTest(api, cls.id);
  await startTest(api, code);
  await addTestFiles(api, code, ['test']);
  testId = await testIdOf(api, code);
  teacherId = api.teacherId;
  await api.env.FILES.put(`fixture/${code}/test.pdf`, new TextEncoder().encode('%PDF-1.7 enunț'));
  oldKey = `fixture/${code}/barem.pdf`;
  await setTest("barem_request = 'requested', barem_notes = 'Acordă punct parțial.'");
});

afterEach(async () => {
  await api.dispose();
});

describe('GET /tests/:id/barem-job', () => {
  it('shows the job only while it waits', async () => {
    const job = await robot('GET', jobPath());
    expect(job.status).toBe(200);
    expect(job.body).toEqual({
      job: { testId, createdAt: await createdAt(), filesVersion: await version(), contentType: 'application/pdf', baremNotes: 'Acordă punct parțial.' },
    });
    expect(JSON.stringify(job.body)).not.toContain('fixture/');
    const file = await api.fetch(`/api/runner/tests/${testId}/barem-job/file`, { headers: auth });
    expect(file.status).toBe(200);
    expect(new TextDecoder().decode(await file.arrayBuffer())).toBe('%PDF-1.7 enunț');

    const states = ["barem_request = 'none'", "barem_request = 'failed'", "status = 'evaluating'", 'test_file_key = NULL'];
    for (const state of states) {
      await setTest(state);
      expect((await robot('GET', jobPath())).status, state).toBe(404);
      expect((await api.fetch(`/api/runner/tests/${testId}/barem-job/file`, { headers: auth })).status, state).toBe(404);
      await setTest("barem_request = 'requested', status = 'open', test_file_key = ?", `fixture/${code}/test.pdf`);
    }
  });

  it('needs the robot key', async () => {
    expect((await api.request('GET', `/api/runner${jobPath()}`)).status).toBe(401);
  });
});

describe('PUT /tests/:id/barem', () => {
  beforeEach(async () => {
    await lease();
  });

  it('saves the barem as unchecked and deletes the old barem', async () => {
    await addTestFiles(api, code, ['barem']);
    await api.env.FILES.put(oldKey, new TextEncoder().encode('%PDF-1.7 vechi'));
    await setTest("exercise_list_status = 'ready', exercise_list_json = '{}'");
    const v = await version();
    const res = await putBarem(docx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ready' });
    const key = generatedBaremKey(teacherId, 2026, code, v);
    expect(await row()).toMatchObject({
      barem_file_key: key,
      barem_unchecked: 1,
      barem_request: 'none',
      barem_request_attempts: 0,
      barem_file_name: `${code} - barem generat.docx`,
      barem_file_type: DOCX_TYPE,
      files_version: v + 1,
      exercise_list_status: 'none',
    });
    expect(new Uint8Array(await (await api.env.FILES.get(key))!.arrayBuffer())).toEqual(docx());
    expect(await api.env.FILES.get(oldKey)).toBeNull();
  });

  it('keeps the object when the old barem has the same key', async () => {
    const v = await version();
    const key = generatedBaremKey(teacherId, 2026, code, v);
    await setTest('barem_file_key = ?', key);
    expect((await putBarem(docx())).status).toBe(200);
    expect(await api.env.FILES.get(key)).not.toBeNull();
  });

  it('refuses a barem made from an older file version', async () => {
    const v = await version();
    await setTest('files_version = files_version + 1');
    const res = await putBarem(docx(), { 'X-Files-Version': String(v) });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'not_needed' });
    expect(await api.env.FILES.get(generatedBaremKey(teacherId, 2026, code, v))).toBeNull();
    expect(await row()).toMatchObject({ barem_unchecked: 0, barem_request: 'requested' });
  });

  it('refuses after the teacher uploaded her own barem', async () => {
    const v = await version();
    const own = { key: `fixture/${code}/own.pdf`, name: 'barem.pdf', type: 'application/pdf' };
    await saveTestFile(api.db, teacherId, testId, 'barem', own as never, '2026-11-03T08:00:00.000Z');
    const res = await putBarem(docx(), { 'X-Files-Version': String(v) });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'not_needed' });
    expect(await api.env.FILES.get(generatedBaremKey(teacherId, 2026, code, v))).toBeNull();
    expect(await row()).toMatchObject({ barem_file_key: own.key, barem_unchecked: 0, barem_request: 'none' });
  });

  it('refuses a body that is not a Word file', async () => {
    expect((await putBarem('hello')).status).toBe(415);
    expect((await putBarem(docx(), { 'Content-Type': 'application/pdf' })).status).toBe(415);
    expect(await row()).toMatchObject({ barem_unchecked: 0, barem_request: 'requested' });
  });

  it('refuses without the lease', async () => {
    const v = await version();
    const res = await putBarem(docx(), { 'X-Run-Id': OTHER_RUN });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'lease_lost' });
    expect(await api.env.FILES.get(generatedBaremKey(teacherId, 2026, code, v))).toBeNull();
  });

  it('refuses a barem made for a deleted test whose id another test took', async () => {
    const made = await createdAt();
    await setTest('created_at = ?', '2026-10-30T10:00:00.000Z');
    const res = await putBarem(docx(), { 'X-Created-At': made });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'not_needed' });
    expect(await row()).toMatchObject({ barem_unchecked: 0 });
  });

  it('refuses a second save and keeps the first object', async () => {
    const v = await version();
    expect((await putBarem(docx('first'))).status).toBe(200);
    const stored = (await row())!;
    expect((await putBarem(docx('second'), { 'X-Files-Version': String(v) })).status).toBe(409);
    expect(new Uint8Array(await (await api.env.FILES.get(stored.barem_file_key!))!.arrayBuffer())).toEqual(docx('first'));
  });

  it('answers 404 for a test that is gone', async () => {
    await api.db.prepare('DELETE FROM tests WHERE id = ?').bind(testId).run();
    expect((await putBarem(docx(), { 'X-Files-Version': '0' })).status).toBe(404);
  });
});

describe('POST /tests/:id/barem-failed', () => {
  const failed = (runId = RUN, error = 'crash') => robot('POST', `/tests/${testId}/barem-failed`, { runId, filesVersion: 0, error });

  beforeEach(async () => {
    await lease();
  });

  it('counts failures and fails at the third', async () => {
    expect((await failed()).body).toEqual({ status: 'none' });
    expect((await failed()).body).toEqual({ status: 'none' });
    expect((await failed()).body).toEqual({ status: 'failed' });
    expect(await row()).toMatchObject({ barem_request: 'failed', barem_request_attempts: 3 });
    const again = await failed();
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ error: 'not_needed' });
  });

  it('does not count a usage limit', async () => {
    expect((await failed(RUN, 'usage_limit')).body).toEqual({ status: 'none' });
    expect(await row()).toMatchObject({ barem_request: 'requested', barem_request_attempts: 0 });
  });

  it('refuses a run without the lease and an older files_version', async () => {
    const other = await failed(OTHER_RUN);
    expect(other.status).toBe(409);
    expect(other.body).toMatchObject({ error: 'lease_lost' });
    await setTest('files_version = files_version + 1');
    const stale = await failed();
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: 'not_needed' });
    expect(await row()).toMatchObject({ barem_request_attempts: 0 });
  });
});

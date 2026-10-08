import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addSubmission, addTestFiles, makeClass, makeTest, robotRequest, setRobotKey, startTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let robot: ReturnType<typeof robotRequest>;
let code: string;
let studentIds: number[];

const PAST = '2026-10-06T08:00:00.000Z';

const setTest = (sql: string, ...params: unknown[]) =>
  api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(...params, code).run();
const setRunner = (sql: string, ...params: unknown[]) =>
  api.db.prepare(`UPDATE runner_state SET ${sql} WHERE id = 1`).bind(...params).run();
const uploadStatus = async (id: number) =>
  (await api.db.prepare('SELECT status, run_id FROM submissions WHERE id = ?').bind(id).first()) as { status: string; run_id: string | null };

beforeEach(async () => {
  api = await startTestApi();
  await setRobotKey(api);
  robot = robotRequest(api);
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva']);
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
  await startTest(api, code);
  await addTestFiles(api, code);
});

afterEach(async () => {
  await api.dispose();
});

describe('robot key', () => {
  it('refuses a request without a key, with a wrong key, or with an old key', async () => {
    const attempts: Record<string, string>[] = [{}, { Authorization: 'Bearer wrong-key-0123456789abcdef' }, { Authorization: 'Basic abc' }];
    for (const headers of attempts) {
      const res = await api.request('POST', '/api/runner/check', undefined, headers);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'robot_denied', message: 'Cheia robotului lipsește sau este greșită.' });
    }
    await setRobotKey(api, 'a-newer-robot-key-0123456789');
    expect((await robot('POST', '/check')).status).toBe(401);
    expect((await robotRequest(api, 'a-newer-robot-key-0123456789')('POST', '/check')).status).toBe(200);
  });

  it('refuses every key while none is stored', async () => {
    await api.db.prepare('DELETE FROM settings').run();
    expect((await robot('POST', '/check')).status).toBe(401);
  });

  it('needs no teacher login', async () => {
    const outside = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined } });
    try {
      await setRobotKey(outside);
      expect((await robotRequest(outside)('POST', '/check')).status).toBe(200);
      expect((await outside.request('GET', '/api/admin/me')).status).toBe(500);
    } finally {
      await outside.dispose();
    }
  });
});

describe('POST /api/runner/check', () => {
  it('says there is no work and saves the time of the check', async () => {
    const res = await robot('POST', '/check');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasWork: false, exerciseLists: 0, pendingGrading: 0, analyses: 0 });
    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(Date.parse(detail.body.robot.lastCheckAt)).not.toBeNaN();
  });

  it('counts the exercise lists, the uploads to grade, and the analyses that wait', async () => {
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating'");
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 1, pendingGrading: 0, analyses: 0 });

    await setTest("exercise_list_status = 'ready'");
    await addSubmission(api, code, studentIds[1]!, { status: 'submitted', files: 1 });
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 0, pendingGrading: 2, analyses: 0 });

    await api.db.prepare("UPDATE submissions SET status = 'graded'").run();
    await setTest("analysis_status = 'requested'");
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 0, pendingGrading: 0, analyses: 1 });
  });

  it('gives no work from a test whose exercise list has a problem or failed', async () => {
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    for (const list of ['problem', 'failed']) {
      await setTest("status = 'evaluating', exercise_list_status = ?", list);
      expect((await robot('POST', '/check')).body.hasWork).toBe(false);
    }
  });

  it('starts a scheduled evaluation whose time has come', async () => {
    const id = await addSubmission(api, code, studentIds[0]!, { files: 1 });
    await setTest('evaluation_at = ?', PAST);
    expect((await robot('POST', '/check')).body).toMatchObject({ hasWork: true, exerciseLists: 1 });
    expect((await uploadStatus(id)).status).toBe('submitted');
  });

  it('sends back to the queue an upload left in grading by a run that died', async () => {
    await setTest("status = 'evaluating', exercise_list_status = 'ready'");
    const id = await addSubmission(api, code, studentIds[0]!, { status: 'grading', files: 1 });
    await api.db.prepare("UPDATE submissions SET run_id = 'run-1' WHERE id = ?").bind(id).run();
    await setRunner("run_id = 'run-1', heartbeat_at = ?", PAST);
    expect((await robot('POST', '/check')).body).toMatchObject({ hasWork: true, pendingGrading: 1 });
    expect(await uploadStatus(id)).toEqual({ status: 'submitted', run_id: null });
  });

  it('sends back to the queue an upload left in grading after its run ended', async () => {
    await setTest("status = 'evaluating', exercise_list_status = 'ready'");
    const id = await addSubmission(api, code, studentIds[0]!, { status: 'grading', files: 1 });
    await api.db.prepare("UPDATE submissions SET run_id = 'run-1' WHERE id = ?").bind(id).run();
    await robot('POST', '/check');
    expect(await uploadStatus(id)).toEqual({ status: 'submitted', run_id: null });
  });

  it('leaves alone the uploads that a live run is grading', async () => {
    await setTest("status = 'evaluating', exercise_list_status = 'ready'");
    const id = await addSubmission(api, code, studentIds[0]!, { status: 'grading', files: 1 });
    await api.db.prepare("UPDATE submissions SET run_id = 'run-1' WHERE id = ?").bind(id).run();
    await setRunner("run_id = 'run-1', heartbeat_at = ?", new Date().toISOString());
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: false, exerciseLists: 0, pendingGrading: 0, analyses: 0 });
    expect(await uploadStatus(id)).toEqual({ status: 'grading', run_id: 'run-1' });
  });

  it('ends a test with nothing left to grade', async () => {
    await addSubmission(api, code, studentIds[0]!, { status: 'graded', files: 1 });
    await setTest("status = 'evaluating', exercise_list_status = 'ready'");
    await robot('POST', '/check');
    const row = await api.db.prepare('SELECT status FROM tests WHERE code = ?').bind(code).first();
    expect(row).toEqual({ status: 'done' });
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addSubmission, addTestFiles, makeClass, makeTest, ROBOT_KEY, robotRequest, setRobotKey, startTest, testIdOf } from '../test/fixtures.ts';
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

const RUN = 'run-0001';
const OTHER_RUN = 'run-0002';
const SUMMARY = { exerciseLists: 1, graded: 3, failed: 0, analyses: 0, stop: 'done' };

const LIST = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [
    { id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 4.5, answer: '3/4', scoringNotes: '', topic: 'Fracții' },
    { id: 'II.1', label: 'Subiectul II, exercițiul 1', maxPoints: 4.5, answer: 'x = 2', scoringNotes: '', topic: 'Ecuații' },
  ],
  notes: '',
};

const runner = () =>
  api.db.prepare('SELECT run_id, lease_acquired_at, heartbeat_at, last_run_finished_at, last_run_summary FROM runner_state').first<{
    run_id: string | null;
    lease_acquired_at: string | null;
    heartbeat_at: string | null;
    last_run_finished_at: string | null;
    last_run_summary: string | null;
  }>();

describe('POST /api/runner/lease', () => {
  it('gives a free lease with the number of parallel gradings', async () => {
    await api.request('PATCH', '/api/admin/settings', { maxParallelAgents: 2 });
    const res = await robot('POST', '/lease', { runId: RUN });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ granted: true, maxParallel: 2 });
    expect(await runner()).toMatchObject({ run_id: RUN });
  });

  it('refuses while another run is alive, and gives it again to the same run', async () => {
    await robot('POST', '/lease', { runId: RUN });
    expect((await robot('POST', '/lease', { runId: OTHER_RUN })).body).toEqual({ granted: false, maxParallel: 1 });
    expect((await robot('POST', '/lease', { runId: RUN })).body.granted).toBe(true);
    expect((await runner())?.run_id).toBe(RUN);
  });

  it('takes over a stale lease and sends its uploads back to the queue', async () => {
    await setTest("status = 'evaluating', exercise_list_status = 'ready'");
    const id = await addSubmission(api, code, studentIds[0]!, { status: 'grading', files: 1 });
    await api.db.prepare('UPDATE submissions SET run_id = ? WHERE id = ?').bind(RUN, id).run();
    await setRunner('run_id = ?, heartbeat_at = ?', RUN, PAST);
    expect((await robot('POST', '/lease', { runId: OTHER_RUN })).body.granted).toBe(true);
    expect(await uploadStatus(id)).toEqual({ status: 'submitted', run_id: null });
  });

  it('refuses a bad run id', async () => {
    const res = await robot('POST', '/lease', { runId: 'a b' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Id-ul rulării nu este valid.');
  });
});

describe('POST /api/runner/heartbeat and /release', () => {
  it('keeps the lease alive', async () => {
    await robot('POST', '/lease', { runId: RUN });
    await setRunner('heartbeat_at = ?', PAST);
    expect((await robot('POST', '/heartbeat', { runId: RUN })).status).toBe(200);
    expect((await runner())!.heartbeat_at! > PAST).toBe(true);
  });

  it('answers 409 to a run that lost the lease', async () => {
    await robot('POST', '/lease', { runId: RUN });
    const res = await robot('POST', '/heartbeat', { runId: OTHER_RUN });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('lease_lost');
    expect((await robot('POST', '/release', { runId: OTHER_RUN, summary: SUMMARY })).status).toBe(409);
    expect((await runner())?.run_id).toBe(RUN);
  });

  it('frees the lease and keeps the summary', async () => {
    await robot('POST', '/lease', { runId: RUN });
    const res = await robot('POST', '/release', { runId: RUN, summary: SUMMARY });
    expect(res.status).toBe(200);
    const row = await runner();
    expect(row).toMatchObject({ run_id: null, lease_acquired_at: null, heartbeat_at: null, last_run_summary: JSON.stringify(SUMMARY) });
    expect(Date.parse(row!.last_run_finished_at!)).not.toBeNaN();
    expect((await robot('POST', '/lease', { runId: OTHER_RUN })).body.granted).toBe(true);
  });

  it('refuses a summary with more than counts', async () => {
    await robot('POST', '/lease', { runId: RUN });
    const res = await robot('POST', '/release', { runId: RUN, summary: { ...SUMMARY, stop: 'tired' } });
    expect(res.status).toBe(400);
    expect((await runner())?.run_id).toBe(RUN);
  });
});

describe('GET /api/runner/tasks', () => {
  it('lists the tests that wait for an exercise list and counts the uploads to grade', async () => {
    const cls = await makeClass(api, '7A', ['Elev Unu']);
    const second = await makeTest(api, cls.id);
    await addSubmission(api, second, cls.studentIds[0]!, { status: 'submitted', files: 1 });
    await api.db.prepare("UPDATE tests SET status = 'evaluating', exercise_list_status = 'ready' WHERE code = ?").bind(second).run();
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating'");
    const res = await robot('GET', '/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exerciseLists: [await testIdOf(api, code)], pendingGrading: 1, analyses: [] });
  });
});

describe('GET /api/runner/tests/:id', () => {
  it('gives the file types and the exercise list, without names or keys', async () => {
    const testId = await testIdOf(api, code);
    await setTest("exercise_list_json = ?, exercise_list_status = 'ready'", JSON.stringify(LIST));
    const res = await robot('GET', `/tests/${testId}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      test: { id: testId, files: { test: { contentType: 'application/pdf' }, barem: { contentType: 'application/pdf' } }, exerciseList: LIST },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/Pop Ion|fixture|\.pdf"/);
  });

  it('streams the test and the barem files', async () => {
    const testId = await testIdOf(api, code);
    await api.env.FILES.put(`fixture/${code}/barem.pdf`, '%PDF-1.7 barem');
    const res = await api.fetch(`/api/runner/tests/${testId}/files/barem`, { headers: { Authorization: `Bearer ${ROBOT_KEY}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(await res.text()).toBe('%PDF-1.7 barem');
  });

  it('answers 404 for an unknown test, kind, or missing file', async () => {
    const testId = await testIdOf(api, code);
    expect((await robot('GET', '/tests/99999')).status).toBe(404);
    expect((await robot('GET', `/tests/${testId}/files/answers`)).status).toBe(404);
    expect((await robot('GET', `/tests/${testId}/files/test`)).status).toBe(404);
  });
});

describe('POST /api/runner/tests/:id/exercise-list', () => {
  let testId: number;
  const saveList = (body: object) => robot('POST', `/tests/${testId}/exercise-list`, { runId: RUN, ...body });
  const listRow = () =>
    api.db.prepare('SELECT exercise_list_status, exercise_list_message, exercise_list_attempts, exercise_list_json FROM tests WHERE id = ?').bind(testId).first<{
      exercise_list_status: string;
      exercise_list_message: string | null;
      exercise_list_attempts: number;
      exercise_list_json: string | null;
    }>();

  beforeEach(async () => {
    testId = await testIdOf(api, code);
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating'");
    await robot('POST', '/lease', { runId: RUN });
  });

  it('saves a list whose points add up as ready', async () => {
    const res = await saveList({ ok: true, exerciseList: LIST });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exerciseList: { status: 'ready', message: null } });
    const row = await listRow();
    expect(JSON.parse(row!.exercise_list_json!)).toEqual(LIST);
    expect((await robot('POST', '/check')).body).toMatchObject({ exerciseLists: 0, pendingGrading: 1 });
  });

  it('saves a list whose points do not add up as a problem for the teacher', async () => {
    const res = await saveList({ ok: true, exerciseList: { ...LIST, totalPoints: 12 } });
    expect(res.body).toEqual({ exerciseList: { status: 'problem', message: 'Punctajele din barem dau 10, dar totalul este 12.' } });
    expect((await robot('POST', '/check')).body.pendingGrading).toBe(0);
  });

  it('refuses a broken list and changes nothing', async () => {
    const res = await saveList({ ok: true, exerciseList: { ...LIST, exercises: [] } });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid_result');
    expect(await listRow()).toMatchObject({ exercise_list_status: 'none', exercise_list_attempts: 0 });
  });

  it('counts failed attempts and fails the list at the third', async () => {
    for (const expected of ['none', 'none', 'failed']) {
      const res = await saveList({ ok: false, error: 'timeout' });
      expect(res.body.exerciseList.status).toBe(expected);
    }
    expect(await listRow()).toMatchObject({
      exercise_list_status: 'failed',
      exercise_list_attempts: 3,
      exercise_list_message: 'Robotul nu a terminat la timp.',
    });
  });

  it('counts no attempt for a usage limit', async () => {
    await saveList({ ok: false, error: 'usage_limit' });
    expect(await listRow()).toMatchObject({ exercise_list_status: 'none', exercise_list_attempts: 0 });
  });

  it('refuses a run without the lease, a list no longer needed, and a deleted test', async () => {
    const other = await robot('POST', `/tests/${testId}/exercise-list`, { runId: OTHER_RUN, ok: true, exerciseList: LIST });
    expect(other.status).toBe(409);
    expect(other.body.error).toBe('lease_lost');

    await setTest("exercise_list_status = 'accepted'");
    const late = await saveList({ ok: true, exerciseList: LIST });
    expect(late.status).toBe(409);
    expect(late.body.error).toBe('not_needed');

    await api.request('DELETE', `/api/admin/tests/${code}`);
    expect((await saveList({ ok: true, exerciseList: LIST })).status).toBe(404);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// The teacher's answers to what the robot reports: an exercise list with a
// problem or an error, and an upload whose grading failed.

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let code: string;
let studentId: number;
let classmateId: number;

const setTest = (sql: string) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(code).run();
const testRow = () =>
  api.db
    .prepare('SELECT status, exercise_list_status, exercise_list_message, exercise_list_attempts, analysis_status FROM tests WHERE code = ?')
    .bind(code)
    .first();

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => false);
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana']);
  studentId = cls.studentIds[0]!;
  classmateId = cls.studentIds[1]!;
  code = await makeTest(api, cls.id);
});

afterEach(async () => {
  await api.dispose();
});

describe('POST /api/admin/tests/:code/exercise-list/accept', () => {
  it('accepts a list whose points do not add up, keeps the message, and starts the robot', async () => {
    await setTest("status = 'evaluating', exercise_list_status = 'problem', exercise_list_message = 'Punctajele din barem dau 9, dar totalul este 10.'");
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    dispatchRobot.mockResolvedValueOnce(true);
    const res = await api.request('POST', `/api/admin/tests/${code}/exercise-list/accept`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      exerciseList: { status: 'accepted', message: 'Punctajele din barem dau 9, dar totalul este 10.' },
      robot: 'dispatched',
    });
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
    expect(await testRow()).toMatchObject({ exercise_list_status: 'accepted' });
  });

  it('says the robot did not start when GitHub does not take the request', async () => {
    await setTest("status = 'evaluating', exercise_list_status = 'problem'");
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    const res = await api.request('POST', `/api/admin/tests/${code}/exercise-list/accept`);
    expect(res.status).toBe(200);
    expect(res.body.robot).toBe('next_check');
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('does not start the robot for a test whose uploads are open', async () => {
    await setTest("status = 'open', exercise_list_status = 'problem'");
    const res = await api.request('POST', `/api/admin/tests/${code}/exercise-list/accept`);
    expect(res.status).toBe(200);
    expect(res.body.robot).toBeNull();
    expect(dispatchRobot).not.toHaveBeenCalled();
    expect(await testRow()).toMatchObject({ status: 'open', exercise_list_status: 'accepted' });
  });

  it('refuses a list without a problem', async () => {
    await setTest("exercise_list_status = 'ready'");
    const res = await api.request('POST', `/api/admin/tests/${code}/exercise-list/accept`);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Lista de exerciții nu are nicio problemă.');
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('answers 404 for a test of another teacher and keeps it', async () => {
    const foreign = await otherTeacherTest(api);
    await api.db
      .prepare("UPDATE tests SET status = 'evaluating', exercise_list_status = 'problem' WHERE code = ?")
      .bind(foreign.code)
      .run();
    expect((await api.request('POST', `/api/admin/tests/${foreign.code}/exercise-list/accept`)).status).toBe(404);
    const row = await api.db.prepare('SELECT exercise_list_status FROM tests WHERE code = ?').bind(foreign.code).first();
    expect(row).toEqual({ exercise_list_status: 'problem' });
    expect(dispatchRobot).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/tests/:code/exercise-list/retry', () => {
  it('lets the robot make the list again and starts it', async () => {
    await setTest("status = 'evaluating', exercise_list_status = 'failed', exercise_list_message = 'Eroare', exercise_list_attempts = 3");
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    dispatchRobot.mockResolvedValueOnce(true);
    const res = await api.request('POST', `/api/admin/tests/${code}/exercise-list/retry`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exerciseList: { status: 'none', message: null }, robot: 'dispatched' });
    expect(await testRow()).toMatchObject({ exercise_list_status: 'none', exercise_list_message: null, exercise_list_attempts: 0 });
  });

  it('does not start the robot for a test whose uploads are open', async () => {
    await setTest("status = 'open', exercise_list_status = 'failed'");
    const res = await api.request('POST', `/api/admin/tests/${code}/exercise-list/retry`);
    expect(res.body.robot).toBeNull();
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('refuses a list that did not fail, and a test of another teacher', async () => {
    const res = await api.request('POST', `/api/admin/tests/${code}/exercise-list/retry`);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Lista de exerciții nu a eșuat.');
    const foreign = await otherTeacherTest(api);
    await api.db.prepare("UPDATE tests SET exercise_list_status = 'failed' WHERE code = ?").bind(foreign.code).run();
    expect((await api.request('POST', `/api/admin/tests/${foreign.code}/exercise-list/retry`)).status).toBe(404);
  });
});

describe('POST /api/admin/submissions/:id/retry', () => {
  const uploadRow = (id: number) =>
    api.db.prepare('SELECT status, attempts, last_error, run_id FROM submissions WHERE id = ?').bind(id).first();

  async function failedUpload(): Promise<number> {
    const id = await addSubmission(api, code, studentId, { status: 'failed', files: 1 });
    await api.db.prepare("UPDATE submissions SET attempts = 3, last_error = 'Eroare', run_id = 'run-1' WHERE id = ?").bind(id).run();
    return id;
  }

  it('sends a failed upload back to grading and starts the robot', async () => {
    await setTest("status = 'evaluating'");
    const id = await failedUpload();
    await addSubmission(api, code, classmateId, { status: 'submitted', files: 1 });
    const res = await api.request('POST', `/api/admin/submissions/${id}/retry`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'submitted', robot: 'next_check' });
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
    expect(await uploadRow(id)).toEqual({ status: 'submitted', attempts: 0, last_error: null, run_id: null });
  });

  it('takes a finished test back to evaluation and asks again for its class analysis', async () => {
    await setTest("status = 'done', analysis_status = 'ready'");
    const id = await failedUpload();
    const res = await api.request('POST', `/api/admin/submissions/${id}/retry`);
    expect(res.body.status).toBe('submitted');
    expect(await testRow()).toMatchObject({ status: 'evaluating', analysis_status: 'requested' });
  });

  it('leaves an open test open and does not start the robot', async () => {
    await setTest("status = 'open'");
    const id = await failedUpload();
    const res = await api.request('POST', `/api/admin/submissions/${id}/retry`);
    expect(res.body).toEqual({ status: 'submitted', robot: null });
    expect(await testRow()).toMatchObject({ status: 'open' });
  });

  it('refuses an upload that did not fail', async () => {
    const id = await addSubmission(api, code, studentId, { status: 'graded', files: 1 });
    const res = await api.request('POST', `/api/admin/submissions/${id}/retry`);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Corectarea acestei lucrări nu a eșuat.');
    expect(await uploadRow(id)).toMatchObject({ status: 'graded' });
  });

  it('answers 404 for an upload of another teacher and keeps it', async () => {
    const foreign = await otherTeacherTest(api);
    const id = await addSubmission(api, foreign.code, foreign.studentId, { status: 'failed', files: 1 });
    expect((await api.request('POST', `/api/admin/submissions/${id}/retry`)).status).toBe(404);
    expect(await uploadRow(id)).toMatchObject({ status: 'failed' });
  });
});

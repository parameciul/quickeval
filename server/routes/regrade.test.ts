import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest, robotRequest, setRobotKey } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// "Recorectează" (spec §8.5): one graded upload, or all of a test.

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let code: string;
let studentIds: number[];

const setTest = (sql: string) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(code).run();
const testRow = () => api.db.prepare('SELECT status, analysis_status, analysis_attempts FROM tests WHERE code = ?').bind(code).first();
const uploadRow = (id: number) =>
  api.db.prepare('SELECT status, attempts, last_error, run_id, graded_at FROM submissions WHERE id = ?').bind(id).first();
const evaluationCount = async (id: number) =>
  (await api.db.prepare('SELECT COUNT(*) AS n FROM evaluations WHERE submission_id = ?').bind(id).first<{ n: number }>())!.n;

// A graded upload with a result that the teacher checked.
async function graded(index: number): Promise<number> {
  const id = await addSubmission(api, code, studentIds[index]!, { status: 'graded', files: 1 });
  await api.db.prepare("UPDATE submissions SET attempts = 1, graded_at = '2026-10-07T09:00:00.000Z' WHERE id = ?").bind(id).run();
  await addEvaluation(api, id, { items: [{ needsReview: true, reviewed: true }, {}] });
  return id;
}

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => false);
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva', 'Marin Dan']);
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
});

afterEach(async () => {
  await api.dispose();
});

describe('POST /api/admin/submissions/:id/regrade', () => {
  it('deletes the result, takes a finished test back to evaluation, and starts the robot', async () => {
    const id = await graded(0);
    await setTest("status = 'done', exercise_list_status = 'ready', analysis_status = 'ready'");
    dispatchRobot.mockResolvedValueOnce(true);

    const res = await api.request('POST', `/api/admin/submissions/${id}/regrade`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 1, testStatus: 'evaluating', robot: 'dispatched' });
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
    expect(await uploadRow(id)).toEqual({ status: 'submitted', attempts: 0, last_error: null, run_id: null, graded_at: null });
    expect(await evaluationCount(id)).toBe(0);
    const items = await api.db.prepare('SELECT COUNT(*) AS n FROM evaluation_items').first<{ n: number }>();
    expect(items!.n).toBe(0);
    // The class analysis is asked for again, after the new grades.
    expect(await testRow()).toEqual({ status: 'evaluating', analysis_status: 'requested', analysis_attempts: 0 });

    // The robot finds the upload at its next check.
    await setRobotKey(api);
    const check = await robotRequest(api)('POST', '/check');
    expect(check.body).toMatchObject({ hasWork: true, pendingGrading: 1 });
  });

  it('says so when GitHub does not take the request to start the robot', async () => {
    const id = await graded(0);
    await addSubmission(api, code, studentIds[1]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating'");
    const res = await api.request('POST', `/api/admin/submissions/${id}/regrade`);
    expect(res.body).toEqual({ count: 1, testStatus: 'evaluating', robot: 'next_check' });
  });

  it('leaves an open test open: the upload is graded after Start evaluation', async () => {
    const id = await graded(0);
    await setTest("status = 'open'");
    const res = await api.request('POST', `/api/admin/submissions/${id}/regrade`);
    expect(res.body).toEqual({ count: 1, testStatus: 'open', robot: null });
    expect(dispatchRobot).not.toHaveBeenCalled();
    expect(await uploadRow(id)).toMatchObject({ status: 'submitted' });
  });

  it('answers 409 for an upload that is not graded, and changes nothing', async () => {
    await setTest("status = 'done'");
    const failed = await addSubmission(api, code, studentIds[0]!, { status: 'failed', files: 1 });
    await api.db.prepare("UPDATE submissions SET attempts = 3, last_error = 'Robotul s-a oprit cu o eroare.' WHERE id = ?").bind(failed).run();
    const res = await api.request('POST', `/api/admin/submissions/${failed}/regrade`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'not_graded', message: 'Lucrarea nu este corectată acum.' });
    expect(await uploadRow(failed)).toMatchObject({ status: 'failed', attempts: 3 });
    expect(await testRow()).toMatchObject({ status: 'done' });
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown upload and for an upload of another teacher', async () => {
    expect((await api.request('POST', '/api/admin/submissions/99999/regrade')).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    const foreignId = await addSubmission(api, foreign.code, foreign.studentId, { status: 'graded', files: 1 });
    await addEvaluation(api, foreignId);
    expect((await api.request('POST', `/api/admin/submissions/${foreignId}/regrade`)).status).toBe(404);
    expect(await uploadRow(foreignId)).toMatchObject({ status: 'graded' });
    expect(await evaluationCount(foreignId)).toBe(1);
  });
});

describe('POST /api/admin/tests/:code/regrade', () => {
  it('regrades every graded upload and every failed one, and leaves the others', async () => {
    const first = await graded(0);
    const second = await graded(1);
    const failed = await addSubmission(api, code, studentIds[2]!, { status: 'failed', files: 1 });
    await api.db.prepare("UPDATE submissions SET attempts = 3, last_error = 'Robotul nu a terminat la timp.' WHERE id = ?").bind(failed).run();
    const empty = await addSubmission(api, code, studentIds[3]!, { status: 'uploading' });
    await setTest("status = 'done', exercise_list_status = 'ready'");
    dispatchRobot.mockResolvedValueOnce(true);

    const res = await api.request('POST', `/api/admin/tests/${code}/regrade`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 3, testStatus: 'evaluating', robot: 'dispatched' });
    for (const id of [first, second, failed]) {
      expect(await uploadRow(id)).toEqual({ status: 'submitted', attempts: 0, last_error: null, run_id: null, graded_at: null });
      expect(await evaluationCount(id)).toBe(0);
    }
    expect(await uploadRow(empty)).toMatchObject({ status: 'uploading' });
  });

  it('leaves an upload that the robot is grading now', async () => {
    const id = await graded(0);
    const busy = await addSubmission(api, code, studentIds[1]!, { status: 'grading', files: 1 });
    await api.db.prepare("UPDATE submissions SET run_id = 'run-1' WHERE id = ?").bind(busy).run();
    await setTest("status = 'evaluating'");
    const res = await api.request('POST', `/api/admin/tests/${code}/regrade`);
    expect(res.body).toMatchObject({ count: 1, testStatus: 'evaluating' });
    expect(await uploadRow(id)).toMatchObject({ status: 'submitted' });
    expect(await uploadRow(busy)).toMatchObject({ status: 'grading', run_id: 'run-1' });
  });

  it('leaves an open test open and does not start the robot', async () => {
    await graded(0);
    await setTest("status = 'open'");
    const res = await api.request('POST', `/api/admin/tests/${code}/regrade`);
    expect(res.body).toEqual({ count: 1, testStatus: 'open', robot: null });
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('answers 409 when no upload is graded', async () => {
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'open'");
    const res = await api.request('POST', `/api/admin/tests/${code}/regrade`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'nothing_to_regrade', message: 'Testul nu are lucrări corectate.' });
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('answers 404 for a test of another teacher and changes nothing', async () => {
    const foreign = await otherTeacherTest(api);
    const foreignId = await addSubmission(api, foreign.code, foreign.studentId, { status: 'graded', files: 1 });
    await addEvaluation(api, foreignId);
    expect((await api.request('POST', `/api/admin/tests/${foreign.code}/regrade`)).status).toBe(404);
    expect(await uploadRow(foreignId)).toMatchObject({ status: 'graded' });
    expect(await evaluationCount(foreignId)).toBe(1);
  });
});

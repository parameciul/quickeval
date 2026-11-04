import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addEvaluation, addSubmission, addTestFiles, makeClass, makeTest, otherTeacherTest, startTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// "Marchează ca terminat": an open test whose sent papers are all graded (a
// finished test that was reopened by mistake) becomes done again, with no robot.

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let code: string;
let studentIds: number[];

const finish = (target = code) => api.request('POST', `/api/admin/tests/${target}/finish`);
const testRow = () =>
  api.db
    .prepare('SELECT status, evaluation_at, analysis_status FROM tests WHERE code = ?')
    .bind(code)
    .first<{ status: string; evaluation_at: string | null; analysis_status: string }>();
const setTest = (sql: string) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(code).run();
const testsEvaluated = async () =>
  (await api.db.prepare('SELECT tests_evaluated FROM teachers WHERE id = ?').bind(api.teacherId).first<{ tests_evaluated: number }>())!
    .tests_evaluated;

async function gradedUpload(index = 0): Promise<number> {
  const id = await addSubmission(api, code, studentIds[index]!, { status: 'graded', files: 1 });
  await addEvaluation(api, id);
  return id;
}

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => false);
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '7E2', ['Pop Ion', 'Ionescu Maria', 'Avram Dan']);
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
  await startTest(api, code);
  await addTestFiles(api, code);
});

afterEach(async () => {
  await api.dispose();
});

describe('POST /api/admin/tests/:code/finish', () => {
  it('makes an open test with only graded papers done, without the robot', async () => {
    await gradedUpload(0);
    await gradedUpload(1);
    await setTest("analysis_status = 'ready'");
    const before = await testsEvaluated();
    const res = await finish();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'done' });
    expect(await testRow()).toMatchObject({ status: 'done', evaluation_at: null, analysis_status: 'ready' });
    expect(dispatchRobot).not.toHaveBeenCalled();
    expect(await testsEvaluated()).toBe(before);
  });

  it('keeps every graded result', async () => {
    const id = await gradedUpload(0);
    await finish();
    const upload = await api.db.prepare('SELECT status FROM submissions WHERE id = ?').bind(id).first<{ status: string }>();
    const results = await api.db.prepare('SELECT COUNT(*) AS n FROM evaluations WHERE submission_id = ?').bind(id).first<{ n: number }>();
    expect(upload?.status).toBe('graded');
    expect(results?.n).toBe(1);
  });

  it('does not ask for a class analysis that was never made', async () => {
    await gradedUpload(0);
    await setTest("analysis_status = 'requested'");
    await finish();
    expect((await testRow())?.analysis_status).toBe('none');
  });

  it('is not stopped by a failed paper or an upload with no file', async () => {
    await gradedUpload(0);
    await addSubmission(api, code, studentIds[1]!, { status: 'failed', files: 1 });
    await addSubmission(api, code, studentIds[2]!, { status: 'uploading' });
    expect((await finish()).status).toBe(200);
    expect((await testRow())?.status).toBe('done');
  });

  it.each([
    ['a sent paper', { status: 'submitted', files: 1 }],
    ['a paper in grading', { status: 'grading', files: 1 }],
    ['an upload with files that was not sent', { status: 'uploading', files: 1 }],
  ] as const)('refuses while %s waits', async (_name, waiting) => {
    await gradedUpload(0);
    await addSubmission(api, code, studentIds[1]!, waiting);
    const res = await finish();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'papers_waiting', message: 'Mai sunt lucrări trimise care nu au fost corectate.' });
    expect((await testRow())?.status).toBe('open');
  });

  it('refuses a test with no graded paper', async () => {
    await addSubmission(api, code, studentIds[0]!, { status: 'failed', files: 1 });
    const res = await finish();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'nothing_graded', message: 'Testul nu are nicio lucrare corectată.' });
    expect((await testRow())?.status).toBe('open');
  });

  it('refuses a draft, a test in evaluation and a test that is done', async () => {
    const draft = await makeTest(api, (await api.db.prepare('SELECT class_id FROM tests WHERE code = ?').bind(code).first<{ class_id: number }>())!.class_id);
    const notStarted = await finish(draft);
    expect(notStarted.status).toBe(409);
    expect(notStarted.body.error).toBe('not_started');

    await gradedUpload(0);
    await addSubmission(api, code, studentIds[1]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating'");
    const evaluating = await finish();
    expect(evaluating.status).toBe(409);
    expect(evaluating.body.error).toBe('already_evaluating');

    await api.db.prepare("UPDATE submissions SET status = 'graded' WHERE status = 'submitted'").run();
    await setTest("status = 'done'");
    const done = await finish();
    expect(done.status).toBe(409);
    expect(done.body.error).toBe('already_done');
  });

  it('answers 404 for a test of another teacher and leaves it alone', async () => {
    const foreign = await otherTeacherTest(api);
    expect((await finish(foreign.code)).status).toBe(404);
  });
});

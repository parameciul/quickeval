import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_TEST_LIMIT } from '../../shared/accounts.ts';
import { addSubmission, addTestFiles, makeClass, makeTest, startTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// A demo account sends at most DEMO_TEST_LIMIT tests to evaluation. The
// teacher of these tests is a demo account with one test left.

let api: TestApi;
let classId: number;
let studentIds: number[];

const PAST = '2026-10-06T08:00:00.000Z';

const testsEvaluated = async () =>
  (await api.db.prepare('SELECT tests_evaluated FROM teachers WHERE id = ?').bind(api.teacherId).first<{ tests_evaluated: number }>())!
    .tests_evaluated;
const statusOf = async (code: string) =>
  (await api.db.prepare('SELECT status FROM tests WHERE code = ?').bind(code).first<{ status: string }>())!.status;
const evaluate = (code: string, body: object = {}) => api.request('POST', `/api/admin/tests/${code}/evaluate`, body);

// An open test with its files and one student's uploaded file.
async function readyTest(title: string): Promise<{ code: string; submissionId: number }> {
  const code = await makeTest(api, classId, title);
  await startTest(api, code);
  await addTestFiles(api, code);
  const submissionId = await addSubmission(api, code, studentIds[0]!, { files: 1 });
  return { code, submissionId };
}

beforeEach(async () => {
  api = await startTestApi({ app: { dispatchRobot: vi.fn(async () => false) } });
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Maria']);
  classId = cls.id;
  studentIds = cls.studentIds;
  await api.db
    .prepare("UPDATE teachers SET role = 'teacher', demo = 1, tests_evaluated = ? WHERE id = ?")
    .bind(DEMO_TEST_LIMIT - 1, api.teacherId)
    .run();
});

afterEach(async () => {
  vi.useRealTimers();
  await api.dispose();
});

describe('the demo limit', () => {
  it('counts each test sent to evaluation, and refuses one more past the limit', async () => {
    const first = await readyTest('Primul');
    expect((await evaluate(first.code)).status).toBe(200);
    expect(await testsEvaluated()).toBe(DEMO_TEST_LIMIT);
    expect((await api.request('GET', '/api/admin/me')).body.teacher).toMatchObject({ demo: true, testsEvaluated: DEMO_TEST_LIMIT });

    const second = await readyTest('Al doilea');
    const refused = await evaluate(second.code);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe('demo_limit');
    expect(refused.body.message).toContain(`cel mult ${DEMO_TEST_LIMIT} teste`);
    expect(await statusOf(second.code)).toBe('open');
    // The upload stays as the student left it.
    const upload = await api.db.prepare('SELECT status FROM submissions WHERE id = ?').bind(second.submissionId).first<{ status: string }>();
    expect(upload!.status).toBe('uploading');
    expect(await testsEvaluated()).toBe(DEMO_TEST_LIMIT);
  });

  it('lets a counted test be evaluated again after a reopen, without counting it twice', async () => {
    const first = await readyTest('Primul');
    await evaluate(first.code);
    expect((await api.request('POST', `/api/admin/tests/${first.code}/reopen`)).status).toBe(200);
    expect(await statusOf(first.code)).toBe('open');
    expect((await evaluate(first.code)).status).toBe(200);
    expect(await testsEvaluated()).toBe(DEMO_TEST_LIMIT);
  });

  it('counts a reopened test again when it starts with new files, so one test cannot grade test after test', async () => {
    const first = await readyTest('Primul');
    await evaluate(first.code);
    await api.request('POST', `/api/admin/tests/${first.code}/reopen`);
    expect((await api.request('PUT', `/api/admin/tests/${first.code}/barem-notes`, { notes: 'Alt test, alt barem.' })).status).toBe(200);
    const refused = await evaluate(first.code);
    expect(refused.body.error).toBe('demo_limit');
    expect(await statusOf(first.code)).toBe('open');
    await api.db.prepare('UPDATE teachers SET tests_evaluated = ? WHERE id = ?').bind(DEMO_TEST_LIMIT - 1, api.teacherId).run();
    expect((await evaluate(first.code)).status).toBe(200);
    expect(await testsEvaluated()).toBe(DEMO_TEST_LIMIT);
  });

  it('does not count a regrade, also with new files, since it grades the same uploads', async () => {
    const first = await readyTest('Primul');
    await evaluate(first.code);
    await api.db.prepare("UPDATE submissions SET status = 'graded', graded_at = ?").bind(PAST).run();
    await api.db.prepare("UPDATE tests SET status = 'done' WHERE code = ?").bind(first.code).run();
    await addTestFiles(api, first.code);
    await api.db.prepare('UPDATE tests SET files_version = files_version + 1 WHERE code = ?').bind(first.code).run();
    expect((await api.request('POST', `/api/admin/tests/${first.code}/regrade`)).status).toBe(200);
    expect(await statusOf(first.code)).toBe('evaluating');
    expect(await testsEvaluated()).toBe(DEMO_TEST_LIMIT);
  });

  it('starts only the earliest of several scheduled tests that come due at once', async () => {
    const tests = [await readyTest('Primul'), await readyTest('Al doilea'), await readyTest('Al treilea')];
    // The same time for the first two (the lower id goes first), an earlier one for the third.
    await api.db.prepare('UPDATE tests SET evaluation_at = ? WHERE code IN (?, ?)').bind(PAST, tests[0]!.code, tests[1]!.code).run();
    await api.db.prepare('UPDATE tests SET evaluation_at = ? WHERE code = ?').bind('2026-10-05T08:00:00.000Z', tests[2]!.code).run();
    await api.request('GET', '/api/admin/me');
    expect(await Promise.all(tests.map((test) => statusOf(test.code)))).toEqual(['open', 'open', 'evaluating']);
    expect(await testsEvaluated()).toBe(DEMO_TEST_LIMIT);
    // With one more test allowed, the next earliest starts.
    await api.db.prepare('UPDATE teachers SET tests_evaluated = ? WHERE id = ?').bind(DEMO_TEST_LIMIT - 1, api.teacherId).run();
    await api.request('GET', '/api/admin/me');
    expect(await Promise.all(tests.map((test) => statusOf(test.code)))).toEqual(['evaluating', 'open', 'evaluating']);
  });

  it('still counts a test that was deleted after its evaluation', async () => {
    const first = await readyTest('Primul');
    await evaluate(first.code);
    await api.db.prepare("UPDATE submissions SET status = 'graded'").run();
    await api.request('GET', '/api/admin/me');
    expect((await api.request('DELETE', `/api/admin/tests/${first.code}`)).status).toBe(200);
    const second = await readyTest('Al doilea');
    expect((await evaluate(second.code)).body.error).toBe('demo_limit');
  });

  it('refuses the evaluation of selected uploads past the limit', async () => {
    await api.db.prepare('UPDATE teachers SET tests_evaluated = ? WHERE id = ?').bind(DEMO_TEST_LIMIT, api.teacherId).run();
    const test = await readyTest('Primul');
    const res = await evaluate(test.code, { submissionIds: [test.submissionId] });
    expect(res.body.error).toBe('demo_limit');
    expect(await statusOf(test.code)).toBe('open');
  });

  it('refuses to schedule an evaluation past the limit', async () => {
    await api.db.prepare('UPDATE teachers SET tests_evaluated = ? WHERE id = ?').bind(DEMO_TEST_LIMIT, api.teacherId).run();
    const test = await readyTest('Primul');
    const res = await evaluate(test.code, { at: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    expect(res.body.error).toBe('demo_limit');
  });

  it('keeps a scheduled test open when its time comes past the limit', async () => {
    const test = await readyTest('Primul');
    const other = await readyTest('Al doilea');
    await api.db.prepare('UPDATE tests SET evaluation_at = ? WHERE code IN (?, ?)').bind(PAST, test.code, other.code).run();
    await api.db.prepare('UPDATE submissions SET status = ? WHERE id = ?').bind('submitted', other.submissionId).run();
    await evaluate(test.code);
    await api.request('GET', '/api/admin/me');
    expect(await statusOf(test.code)).toBe('evaluating');
    expect(await statusOf(other.code)).toBe('open');
    expect(await testsEvaluated()).toBe(DEMO_TEST_LIMIT);
  });

  it('does not limit a complete account', async () => {
    await api.db.prepare('UPDATE teachers SET demo = 0, tests_evaluated = 50 WHERE id = ?').bind(api.teacherId).run();
    const test = await readyTest('Primul');
    expect((await evaluate(test.code)).status).toBe(200);
    expect(await testsEvaluated()).toBe(51);
  });
});

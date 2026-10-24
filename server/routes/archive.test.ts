import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest, startedAtOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// Archiving a finished test, and the mark's end when the test leaves "done".

let api: TestApi;
let code: string;
let studentIds: number[];

const setTest = (sql: string) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(code).run();
const archive = (target = code) => api.request('POST', `/api/admin/tests/${target}/archive`);
const unarchive = (target = code) => api.request('POST', `/api/admin/tests/${target}/unarchive`);
const summary = async () => {
  const res = await api.request('GET', '/api/admin/tests?year=2026');
  return res.body.tests.find((t: { code: string }) => t.code === code);
};

// A graded upload, and a finished test that is archived.
async function archivedWithGraded(): Promise<number> {
  const id = await addSubmission(api, code, studentIds[0]!, { status: 'graded', files: 1 });
  await addEvaluation(api, id);
  await setTest("status = 'done', exercise_list_status = 'ready', analysis_status = 'ready'");
  expect((await archive()).status).toBe(200);
  return id;
}

beforeEach(async () => {
  api = await startTestApi({ app: { dispatchRobot: vi.fn(async () => false) } });
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana']);
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
});

afterEach(async () => {
  await api.dispose();
});

describe('POST /api/admin/tests/:code/archive', () => {
  it('archives a done test', async () => {
    await setTest("status = 'done'");
    expect((await summary()).archived).toBe(false);
    const res = await archive();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ archived: true });
    expect((await summary()).archived).toBe(true);
    expect((await api.request('GET', `/api/admin/tests/${code}`)).body.test.archived).toBe(true);
  });

  it('archives a done test twice without a change', async () => {
    await setTest("status = 'done'");
    await archive();
    expect((await archive()).body).toEqual({ archived: true });
  });

  it.each(['draft', 'open', 'evaluating'])('refuses to archive a %s test', async (status) => {
    // A waiting upload keeps an evaluating test from finishing at once.
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest(`status = '${status}'`);
    const res = await archive();
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'not_done', message: 'Poți arhiva un test după ce s-a terminat corectarea.' });
    expect((await summary()).archived).toBe(false);
  });

  it('answers 404 for a test of another teacher and leaves it alone', async () => {
    const foreign = await otherTeacherTest(api);
    await api.db.prepare("UPDATE tests SET status = 'done' WHERE code = ?").bind(foreign.code).run();
    expect((await archive(foreign.code)).status).toBe(404);
    expect((await unarchive(foreign.code)).status).toBe(404);
    const row = await api.db.prepare('SELECT archived FROM tests WHERE code = ?').bind(foreign.code).first<{ archived: number }>();
    expect(row!.archived).toBe(0);
  });

  it('answers 404 for an unknown test', async () => {
    expect((await archive('6E2-26T99')).status).toBe(404);
  });
});

describe('POST /api/admin/tests/:code/unarchive', () => {
  it('takes a test out of the archive', async () => {
    await setTest("status = 'done'");
    await archive();
    const res = await unarchive();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ archived: false });
    expect((await summary()).archived).toBe(false);
  });

  it('answers ok for a test that is not archived', async () => {
    expect((await unarchive()).body).toEqual({ archived: false });
  });
});

describe('the archive mark when a test leaves done', () => {
  it('is cleared by reopening the uploads', async () => {
    await setTest("status = 'done'");
    await archive();
    expect((await api.request('POST', `/api/admin/tests/${code}/reopen`)).status).toBe(200);
    expect(await summary()).toMatchObject({ status: 'open', archived: false });
  });

  it('is cleared by Recorectează tot', async () => {
    await archivedWithGraded();
    const res = await api.request('POST', `/api/admin/tests/${code}/regrade`);
    expect(res.status).toBe(200);
    expect(await summary()).toMatchObject({ status: 'evaluating', archived: false });
  });

  it('is cleared by regrading one upload', async () => {
    const id = await archivedWithGraded();
    await api.db.prepare("UPDATE submissions SET graded_at = '2026-10-07T09:00:00.000Z' WHERE id = ?").bind(id).run();
    const res = await api.request('POST', `/api/admin/submissions/${id}/regrade`, { gradedAt: '2026-10-07T09:00:00.000Z' });
    expect(res.status).toBe(200);
    expect(await summary()).toMatchObject({ status: 'evaluating', archived: false });
  });

  it('is cleared by retrying a failed upload', async () => {
    await archivedWithGraded();
    const failed = await addSubmission(api, code, studentIds[1]!, { status: 'failed', files: 1 });
    const res = await api.request('POST', `/api/admin/submissions/${failed}/retry`, { startedAt: await startedAtOf(api, failed) });
    expect(res.status).toBe(200);
    expect(await summary()).toMatchObject({ status: 'evaluating', archived: false });
  });

  it('is cleared by Regenerează', async () => {
    await archivedWithGraded();
    const res = await api.request('POST', `/api/admin/tests/${code}/analysis/regenerate`);
    expect(res.status).toBe(200);
    expect(await summary()).toMatchObject({ status: 'evaluating', archived: false });
  });
});

describe('publishedCount', () => {
  it('counts the results published one by one', async () => {
    const pop = await addSubmission(api, code, studentIds[0]!, { status: 'graded', files: 1 });
    await addSubmission(api, code, studentIds[1]!, { status: 'graded', files: 1 });
    expect((await summary()).publishedCount).toBe(0);
    const opened = await api.request('POST', `/api/admin/submissions/${pop}/results/open`, { startedAt: await startedAtOf(api, pop) });
    expect(opened.status).toBe(200);
    expect((await summary()).publishedCount).toBe(1);
    expect((await api.request('GET', `/api/admin/tests/${code}`)).body.test.publishedCount).toBe(1);
  });
});

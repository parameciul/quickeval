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

describe('the result pages of an archived test', () => {
  const pages = async () => {
    const test = await api.db.prepare('SELECT results_open FROM tests WHERE code = ?').bind(code).first<{ results_open: number }>();
    const { results } = await api.db
      .prepare('SELECT s.results_open FROM submissions s JOIN tests t ON t.id = s.test_id WHERE t.code = ? ORDER BY s.id')
      .bind(code)
      .all<{ results_open: number }>();
    return { test: test!.results_open, students: results.map((row) => row.results_open) };
  };

  async function publishedDone(): Promise<number[]> {
    const pop = await addSubmission(api, code, studentIds[0]!, { status: 'graded', files: 1 });
    const ana = await addSubmission(api, code, studentIds[1]!, { status: 'graded', files: 1 });
    await setTest("status = 'done', results_open = 1");
    await api.db.prepare('UPDATE submissions SET results_open = 1 WHERE id IN (?, ?)').bind(pop, ana).run();
    return [pop, ana];
  }

  it('closes the pages for all and for single students', async () => {
    await publishedDone();
    expect((await archive()).status).toBe(200);
    expect(await pages()).toEqual({ test: 0, students: [0, 0] });
    expect(await summary()).toMatchObject({ archived: true, resultsOpen: false, publishedCount: 0 });
  });

  it('closes nothing when the archive is refused', async () => {
    await publishedDone();
    await setTest("status = 'open'");
    expect((await archive()).status).toBe(409);
    expect(await pages()).toEqual({ test: 1, students: [1, 1] });
  });

  it('closes nothing of a test of another teacher', async () => {
    const foreign = await otherTeacherTest(api);
    await api.db.prepare("UPDATE tests SET status = 'done', results_open = 1 WHERE code = ?").bind(foreign.code).run();
    expect((await archive(foreign.code)).status).toBe(404);
    const row = await api.db.prepare('SELECT results_open FROM tests WHERE code = ?').bind(foreign.code).first<{ results_open: number }>();
    expect(row!.results_open).toBe(1);
  });

  it('opens nothing when the test leaves the archive', async () => {
    await publishedDone();
    await archive();
    expect((await unarchive()).status).toBe(200);
    expect(await pages()).toEqual({ test: 0, students: [0, 0] });
  });

  it('lets the teacher publish on an archived test, for all and for one student', async () => {
    const [pop] = await publishedDone();
    await archive();
    expect((await api.request('POST', `/api/admin/submissions/${pop}/results/open`, { startedAt: await startedAtOf(api, pop!) })).status).toBe(200);
    expect(await summary()).toMatchObject({ archived: true, resultsOpen: false, publishedCount: 1 });
    expect((await api.request('POST', `/api/admin/tests/${code}/results/open`)).status).toBe(200);
    expect(await summary()).toMatchObject({ archived: true, resultsOpen: true });
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

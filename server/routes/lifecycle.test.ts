import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isUploadToken } from '../../shared/tests.ts';
import { makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let code: string;

const setState = (sql: string) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(code).run();
const state = () =>
  api.db.prepare('SELECT status, evaluation_at, analysis_stale FROM tests WHERE code = ?').bind(code).first();

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2');
  code = await makeTest(api, cls.id);
});

afterEach(async () => {
  await api.dispose();
});

describe('POST /api/admin/tests/:code/start', () => {
  it('opens the uploads and makes the upload link', async () => {
    const res = await api.request('POST', `/api/admin/tests/${code}/start`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('open');
    expect(isUploadToken(res.body.uploadToken)).toBe(true);
    expect(Date.parse(res.body.startedAt)).not.toBeNaN();

    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.test).toMatchObject({ status: 'open', uploadToken: res.body.uploadToken, startedAt: res.body.startedAt });
  });

  it('refuses to start a test twice and keeps the first link', async () => {
    const first = await api.request('POST', `/api/admin/tests/${code}/start`);
    const second = await api.request('POST', `/api/admin/tests/${code}/start`);
    expect(second.status).toBe(409);
    expect(second.body.message).toBe('Testul a început deja.');
    expect((await api.request('GET', `/api/admin/tests/${code}`)).body.test.uploadToken).toBe(first.body.uploadToken);
  });

  it('answers 404 for a test of another teacher', async () => {
    const foreign = await otherTeacherTest(api);
    await api.db.prepare("UPDATE tests SET status = 'draft' WHERE code = ?").bind(foreign.code).run();
    expect((await api.request('POST', `/api/admin/tests/${foreign.code}/start`)).status).toBe(404);
  });
});

describe('POST /api/admin/tests/:code/reopen', () => {
  it('refuses a draft and an open test', async () => {
    const draft = await api.request('POST', `/api/admin/tests/${code}/reopen`);
    expect(draft.status).toBe(409);
    expect(draft.body.message).toBe('Testul nu a început încă.');
    await api.request('POST', `/api/admin/tests/${code}/start`);
    const open = await api.request('POST', `/api/admin/tests/${code}/reopen`);
    expect(open.status).toBe(409);
    expect(open.body.message).toBe('Încărcarea este deja deschisă.');
  });

  it('reopens a test that is being graded and cancels its schedule', async () => {
    await setState("status = 'evaluating', evaluation_at = '2026-10-07T08:00:00.000Z'");
    const res = await api.request('POST', `/api/admin/tests/${code}/reopen`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'open' });
    expect(await state()).toEqual({ status: 'open', evaluation_at: null, analysis_stale: 0 });
  });

  it('marks a ready class analysis as possibly out of date', async () => {
    await setState("status = 'done', analysis_status = 'ready'");
    await api.request('POST', `/api/admin/tests/${code}/reopen`);
    expect(await state()).toEqual({ status: 'open', evaluation_at: null, analysis_stale: 1 });
  });

  it('answers 404 for a test of another teacher', async () => {
    const foreign = await otherTeacherTest(api);
    await api.db.prepare("UPDATE tests SET status = 'done' WHERE code = ?").bind(foreign.code).run();
    expect((await api.request('POST', `/api/admin/tests/${foreign.code}/reopen`)).status).toBe(404);
    const row = await api.db.prepare('SELECT status FROM tests WHERE code = ?').bind(foreign.code).first<{ status: string }>();
    expect(row?.status).toBe('done');
  });
});

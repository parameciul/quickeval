import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isUploadToken } from '../../shared/tests.ts';
import { addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let code: string;

const setState = (sql: string) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(code).run();
const state = () =>
  api.db.prepare('SELECT status, evaluation_at, analysis_stale FROM tests WHERE code = ?').bind(code).first();
const testRow = () =>
  api.db
    .prepare('SELECT status, upload_token, started_at, evaluation_at, print_status, print_file_key FROM tests WHERE code = ?')
    .bind(code)
    .first<{ status: string; upload_token: string | null; started_at: string | null; evaluation_at: string | null; print_status: string; print_file_key: string | null }>();
const classIdOf = async () =>
  (await api.db.prepare('SELECT class_id FROM tests WHERE code = ?').bind(code).first<{ class_id: number }>())!.class_id;
const addStudent = async (name: string) =>
  (await api.request('POST', `/api/admin/classes/${await classIdOf()}/students`, { names: [name] })).body.students[0].id as number;

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2');
  code = await makeTest(api, cls.id);
});

afterEach(async () => {
  await api.dispose();
});

describe('POST /api/admin/tests/:code/start', () => {
  it('opens the uploads with the link the test got when it was made, and dates the test', async () => {
    // The draft already has its link: the printed QR code holds it.
    const draft = (await api.request('GET', `/api/admin/tests/${code}`)).body.test;
    expect(draft).toMatchObject({ status: 'draft', startedAt: null });
    expect(isUploadToken(draft.uploadToken)).toBe(true);

    const res = await api.request('POST', `/api/admin/tests/${code}/start`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'open', uploadToken: draft.uploadToken, robot: null });
    expect(Date.parse(res.body.startedAt)).not.toBeNaN();

    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.test).toMatchObject({ status: 'open', uploadToken: draft.uploadToken, startedAt: res.body.startedAt });
  });

  it('gives its link to a draft made before tests got their link at once', async () => {
    await api.db.prepare('UPDATE tests SET upload_token = NULL WHERE code = ?').bind(code).run();
    const res = await api.request('POST', `/api/admin/tests/${code}/start`);
    expect(res.status).toBe(200);
    expect(isUploadToken(res.body.uploadToken)).toBe(true);
    expect((await testRow())!.upload_token).toBe(res.body.uploadToken);
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

describe('POST /api/admin/tests/:code/stop', () => {
  it('makes a test started by mistake a draft again: no date, no schedule, the same link and print PDF', async () => {
    const started = await api.request('POST', `/api/admin/tests/${code}/start`);
    await setState("evaluation_at = '2099-01-01T08:00:00.000Z', print_status = 'ready', print_file_key = 'print-key'");
    const res = await api.request('POST', `/api/admin/tests/${code}/stop`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'draft' });
    expect(await testRow()).toEqual({
      status: 'draft',
      upload_token: started.body.uploadToken,
      started_at: null,
      evaluation_at: null,
      print_status: 'ready',
      print_file_key: 'print-key',
    });

    // Started again on the right day: the same link, a new date.
    const again = await api.request('POST', `/api/admin/tests/${code}/start`);
    expect(again.status).toBe(200);
    expect(again.body.uploadToken).toBe(started.body.uploadToken);
    expect((await testRow())!.started_at).toBe(again.body.startedAt);
  });

  it('stops while a student only picked a name, and keeps that upload for the next start', async () => {
    await api.request('POST', `/api/admin/tests/${code}/start`);
    const empty = await addSubmission(api, code, await addStudent('Pop Ion'), { files: 0 });
    const res = await api.request('POST', `/api/admin/tests/${code}/stop`);
    expect(res.status).toBe(200);
    const upload = await api.db.prepare('SELECT status FROM submissions WHERE id = ?').bind(empty).first();
    expect(upload).toEqual({ status: 'uploading' });
  });

  it('refuses once a student uploaded a file, sent or not', async () => {
    await api.request('POST', `/api/admin/tests/${code}/start`);
    const upload = await addSubmission(api, code, await addStudent('Pop Ion'), { files: 1 });
    const res = await api.request('POST', `/api/admin/tests/${code}/stop`);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'has_uploads', message: 'Un elev a încărcat deja lucrarea, așa că testul nu mai poate fi oprit.' });
    expect((await testRow())!.status).toBe('open');

    await api.db.prepare("UPDATE submissions SET status = 'submitted' WHERE id = ?").bind(upload).run();
    expect((await api.request('POST', `/api/admin/tests/${code}/stop`)).body.error).toBe('has_uploads');
    expect((await testRow())!.status).toBe('open');
  });

  it('refuses a draft and a test whose uploads closed', async () => {
    const draft = await api.request('POST', `/api/admin/tests/${code}/stop`);
    expect(draft.status).toBe(409);
    expect(draft.body.error).toBe('not_started');

    await api.request('POST', `/api/admin/tests/${code}/start`);
    await setState("status = 'done'");
    const done = await api.request('POST', `/api/admin/tests/${code}/stop`);
    expect(done.status).toBe(409);
    expect(done.body.error).toBe('closed');
    expect((await testRow())!.status).toBe('done');
  });

  it('answers 404 for a test of another teacher and leaves it open', async () => {
    const foreign = await otherTeacherTest(api);
    expect((await api.request('POST', `/api/admin/tests/${foreign.code}/stop`)).status).toBe(404);
    const row = await api.db.prepare('SELECT status FROM tests WHERE code = ?').bind(foreign.code).first<{ status: string }>();
    expect(row?.status).toBe('open');
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
    // An upload still to grade keeps the test in evaluation: the next request ends a test with none.
    const test = await api.db.prepare('SELECT class_id FROM tests WHERE code = ?').bind(code).first<{ class_id: number }>();
    const added = await api.request('POST', `/api/admin/classes/${test!.class_id}/students`, { names: ['Pop Ion'] });
    await addSubmission(api, code, added.body.students[0].id as number, { status: 'submitted', files: 1 });
    await setState("status = 'evaluating', evaluation_at = '2026-10-07T08:00:00.000Z'");
    const res = await api.request('POST', `/api/admin/tests/${code}/reopen`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'open', robot: null });
    expect(await state()).toEqual({ status: 'open', evaluation_at: null, analysis_stale: 0 });
  });

  it('marks a ready class analysis as possibly out of date', async () => {
    await setState("status = 'done', analysis_status = 'ready'");
    await api.request('POST', `/api/admin/tests/${code}/reopen`);
    expect(await state()).toEqual({ status: 'open', evaluation_at: null, analysis_stale: 1 });
  });

  it('answers 404 for a test of another teacher', async () => {
    const foreign = await otherTeacherTest(api);
    await api.db.prepare("UPDATE tests SET status = 'evaluating' WHERE code = ?").bind(foreign.code).run();
    const grading = await addSubmission(api, foreign.code, foreign.studentId, { status: 'grading', files: 1 });
    expect((await api.request('POST', `/api/admin/tests/${foreign.code}/reopen`)).status).toBe(404);
    const row = await api.db.prepare('SELECT status FROM tests WHERE code = ?').bind(foreign.code).first<{ status: string }>();
    expect(row?.status).toBe('evaluating');
    const upload = await api.db.prepare('SELECT status FROM submissions WHERE id = ?').bind(grading).first<{ status: string }>();
    expect(upload?.status).toBe('grading');
  });
});

describe('POST /api/admin/tests/:code/multi-link', () => {
  it('refuses a test that did not start yet', async () => {
    const res = await api.request('POST', `/api/admin/tests/${code}/multi-link`);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Testul nu a început încă.');
  });

  it('makes the multi-upload link on demand and keeps it on the second call', async () => {
    await api.request('POST', `/api/admin/tests/${code}/start`);
    const first = await api.request('POST', `/api/admin/tests/${code}/multi-link`);
    expect(first.status).toBe(201);
    expect(isUploadToken(first.body.multiUploadToken)).toBe(true);

    const second = await api.request('POST', `/api/admin/tests/${code}/multi-link`);
    expect(second.status).toBe(200);
    expect(second.body.multiUploadToken).toBe(first.body.multiUploadToken);

    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.test.multiUploadToken).toBe(first.body.multiUploadToken);
    expect(detail.body.test.multiUploadToken).not.toBe(detail.body.test.uploadToken);
  });

  it('makes the link while the uploads are closed', async () => {
    await api.request('POST', `/api/admin/tests/${code}/start`);
    await setState("status = 'evaluating'");
    const res = await api.request('POST', `/api/admin/tests/${code}/multi-link`);
    expect(res.status).toBe(201);
    expect(isUploadToken(res.body.multiUploadToken)).toBe(true);
  });

  it('answers 404 for a test of another teacher', async () => {
    const foreign = await otherTeacherTest(api);
    expect((await api.request('POST', `/api/admin/tests/${foreign.code}/multi-link`)).status).toBe(404);
  });
});

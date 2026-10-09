import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addSubmission, addTestFiles, makeClass, makeTest, otherTeacherTest, startTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let code: string;
let token: string;
let classId: number;
let studentIds: number[];

const PAST = '2026-10-06T08:00:00.000Z';

const testRow = () =>
  api.db
    .prepare('SELECT status, evaluation_at, evaluation_started_at, analysis_status, analysis_attempts FROM tests WHERE code = ?')
    .bind(code)
    .first<{ status: string; evaluation_at: string | null; evaluation_started_at: string | null; analysis_status: string; analysis_attempts: number }>();
const uploadRow = (id: number) =>
  api.db
    .prepare('SELECT status, auto_submitted, submitted_at FROM submissions WHERE id = ?')
    .bind(id)
    .first<{ status: string; auto_submitted: number; submitted_at: string | null }>();
const setTest = (sql: string, ...params: unknown[]) =>
  api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(...params, code).run();
const evaluate = (body: object = {}) => api.request('POST', `/api/admin/tests/${code}/evaluate`, body);

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => false);
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Maria', 'Avram Dan']);
  classId = cls.id;
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
  token = await startTest(api, code);
});

afterEach(async () => {
  vi.useRealTimers();
  await api.dispose();
});

describe('POST /api/admin/tests/:code/evaluate (now)', () => {
  it('closes the uploads, sends the uploads that have files, and starts the robot', async () => {
    await addTestFiles(api, code);
    const sent = await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 2 });
    const withFiles = await addSubmission(api, code, studentIds[1]!, { files: 1 });
    const empty = await addSubmission(api, code, studentIds[2]!);
    dispatchRobot.mockResolvedValueOnce(true);

    const res = await evaluate();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'evaluating', evaluationAt: null, robot: 'dispatched' });
    expect(dispatchRobot).toHaveBeenCalledTimes(1);

    const row = await testRow();
    expect(row).toMatchObject({ status: 'evaluating', evaluation_at: null });
    expect(Date.parse(row!.evaluation_started_at!)).not.toBeNaN();
    expect(await uploadRow(sent)).toMatchObject({ status: 'submitted', auto_submitted: 0 });
    expect(await uploadRow(withFiles)).toEqual({ status: 'submitted', auto_submitted: 1, submitted_at: row!.evaluation_started_at });
    expect(await uploadRow(empty)).toMatchObject({ status: 'uploading', auto_submitted: 0, submitted_at: null });

    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.test).toMatchObject({ status: 'evaluating', evaluationAt: null, evaluationStartedAt: row!.evaluation_started_at });
  });

  it('says when GitHub does not start the robot', async () => {
    await addTestFiles(api, code);
    await addSubmission(api, code, studentIds[0]!, { files: 1 });
    const res = await evaluate();
    expect(res.body).toEqual({ status: 'evaluating', evaluationAt: null, robot: 'next_check' });
  });

  it('starts now when the chosen time has passed', async () => {
    await addTestFiles(api, code);
    await addSubmission(api, code, studentIds[0]!, { files: 1 });
    const res = await evaluate({ at: PAST });
    expect(res.body.status).toBe('evaluating');
    expect((await testRow())?.evaluation_at).toBeNull();
  });

  it('ends at once a test with nothing new to grade', async () => {
    await addTestFiles(api, code);
    await addSubmission(api, code, studentIds[0]!, { status: 'graded', files: 1 });
    const res = await evaluate();
    expect(res.body).toEqual({ status: 'done', evaluationAt: null, robot: null });
    expect(dispatchRobot).not.toHaveBeenCalled();
    expect((await testRow())?.status).toBe('done');
  });

  it('asks again for a class analysis that was ready', async () => {
    await addTestFiles(api, code);
    await addSubmission(api, code, studentIds[0]!, { files: 1 });
    await setTest("analysis_status = 'ready', analysis_attempts = 2");
    await evaluate();
    expect(await testRow()).toMatchObject({ status: 'evaluating', analysis_status: 'requested', analysis_attempts: 0 });
  });

  it.each([
    ['the test file', ['barem'] as const, 'Încarcă testul înainte de evaluare.'],
    ['the barem', ['test'] as const, 'Încarcă baremul înainte de evaluare.'],
  ])('refuses without %s and changes nothing', async (_name, kinds, message) => {
    await addTestFiles(api, code, [...kinds]);
    const upload = await addSubmission(api, code, studentIds[0]!, { files: 1 });
    const res = await evaluate();
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(message);
    expect((await testRow())?.status).toBe('open');
    expect((await uploadRow(upload))?.status).toBe('uploading');
  });

  it('refuses while no student uploaded a file', async () => {
    await addTestFiles(api, code);
    await addSubmission(api, code, studentIds[0]!);
    const res = await evaluate();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'no_uploads', message: 'Niciun elev nu a încărcat încă fișiere.' });
  });

  it('refuses a draft and a test that is already being graded', async () => {
    const draft = await makeTest(api, classId);
    const res = await api.request('POST', `/api/admin/tests/${draft}/evaluate`, {});
    expect(res.body).toEqual({ error: 'not_started', message: 'Testul nu a început încă.' });
    // An upload still to grade keeps the test in evaluation: the next request ends a test with none.
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating'");
    expect((await evaluate()).body).toEqual({ error: 'already_evaluating', message: 'Evaluarea a pornit deja.' });
    expect((await testRow())?.status).toBe('evaluating');
  });

  it('answers 404 for a test of another teacher', async () => {
    const foreign = await otherTeacherTest(api);
    expect((await api.request('POST', `/api/admin/tests/${foreign.code}/evaluate`, {})).status).toBe(404);
  });
});

describe('POST /api/admin/tests/:code/evaluate (scheduled)', () => {
  it('schedules a later time and keeps the uploads open', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T07:00:00.000Z'));
    await addTestFiles(api, code);
    const res = await evaluate({ at: '2026-10-07T08:30:00Z' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'open', evaluationAt: '2026-10-07T08:30:00.000Z', robot: null });
    expect(dispatchRobot).not.toHaveBeenCalled();
    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.test).toMatchObject({ status: 'open', evaluationAt: '2026-10-07T08:30:00.000Z' });
  });

  it('schedules before any student uploaded', async () => {
    await addTestFiles(api, code);
    const res = await evaluate({ at: new Date(Date.now() + 3_600_000).toISOString() });
    expect(res.body.status).toBe('open');
  });

  it('refuses a time more than 60 days ahead, and a time that is not one', async () => {
    await addTestFiles(api, code);
    const far = await evaluate({ at: new Date(Date.now() + 61 * 86_400_000).toISOString() });
    expect(far.status).toBe(400);
    expect(far.body.message).toBe('Alege o oră din următoarele 60 de zile.');
    const wrong = await evaluate({ at: 'mâine' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toBe('Ora aleasă nu este validă.');
  });

  it('refuses a schedule without the barem', async () => {
    await addTestFiles(api, code, ['test']);
    const res = await evaluate({ at: new Date(Date.now() + 3_600_000).toISOString() });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Încarcă baremul înainte de evaluare.');
    expect((await testRow())?.evaluation_at).toBeNull();
  });
});

describe('DELETE /api/admin/tests/:code/schedule', () => {
  it('cancels the schedule', async () => {
    await addTestFiles(api, code);
    await evaluate({ at: new Date(Date.now() + 3_600_000).toISOString() });
    const res = await api.request('DELETE', `/api/admin/tests/${code}/schedule`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'open', evaluationAt: null });
    expect((await testRow())?.evaluation_at).toBeNull();
  });

  it('refuses when nothing is scheduled', async () => {
    const res = await api.request('DELETE', `/api/admin/tests/${code}/schedule`);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Evaluarea nu este programată.');
  });

  it('answers 404 for a test of another teacher', async () => {
    const foreign = await otherTeacherTest(api);
    await api.db.prepare('UPDATE tests SET evaluation_at = ? WHERE code = ?').bind('2026-12-01T08:00:00.000Z', foreign.code).run();
    expect((await api.request('DELETE', `/api/admin/tests/${foreign.code}/schedule`)).status).toBe(404);
  });
});

describe('a scheduled evaluation', () => {
  it('starts exactly at its time, also for a time sent without milliseconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T07:00:00.000Z'));
    await addTestFiles(api, code);
    const upload = await addSubmission(api, code, studentIds[0]!, { files: 1 });
    await evaluate({ at: '2026-10-07T08:30:00Z' });

    vi.setSystemTime(new Date('2026-10-07T08:29:59.999Z'));
    expect((await api.request('GET', `/api/admin/tests/${code}`)).body.test.status).toBe('open');
    expect(dispatchRobot).not.toHaveBeenCalled();
    vi.setSystemTime(new Date('2026-10-07T08:30:00.000Z'));
    expect((await api.request('GET', `/api/admin/tests/${code}`)).body.test).toMatchObject({
      status: 'evaluating',
      evaluationAt: null,
      evaluationStartedAt: '2026-10-07T08:30:00.000Z',
    });
    expect(await uploadRow(upload)).toEqual({ status: 'submitted', auto_submitted: 1, submitted_at: '2026-10-07T08:30:00.000Z' });
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the tests list', () => api.request('GET', '/api/admin/tests?year=2026')],
    ['the class page', () => api.request('GET', `/api/admin/classes/${classId}`)],
    ['the student page', () => api.request('GET', `/api/u/${token}`)],
  ])('has started, and the robot was asked to start, when %s is read', async (_name, read) => {
    await addTestFiles(api, code);
    await addSubmission(api, code, studentIds[0]!, { files: 1 });
    await setTest('evaluation_at = ?', PAST);
    await read();
    expect(await testRow()).toMatchObject({ status: 'evaluating', evaluation_at: null, evaluation_started_at: PAST });
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('asks for the robot only in the request that starts the evaluation', async () => {
    await addTestFiles(api, code);
    await addSubmission(api, code, studentIds[0]!, { files: 1 });
    await setTest('evaluation_at = ?', PAST);
    await Promise.all([api.request('GET', `/api/admin/tests/${code}`), api.request('GET', `/api/u/${token}`)]);
    await api.request('GET', '/api/admin/tests?year=2026');
    expect((await testRow())?.status).toBe('evaluating');
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('asks for the robot for a due test of another teacher too', async () => {
    // One robot grades for every teacher: any request starts the due evaluations.
    const foreign = await otherTeacherTest(api);
    await addTestFiles(api, foreign.code);
    await addSubmission(api, foreign.code, foreign.studentId, { files: 1 });
    await api.db.prepare('UPDATE tests SET evaluation_at = ? WHERE code = ?').bind(PAST, foreign.code).run();
    await api.request('GET', `/api/u/${token}`);
    const row = await api.db.prepare('SELECT status FROM tests WHERE code = ?').bind(foreign.code).first();
    expect(row).toEqual({ status: 'evaluating' });
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('asks for the robot when the time comes while a student sends a file', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T08:29:59.000Z'));
    await addTestFiles(api, code);
    const secret = (await api.request('POST', `/api/u/${token}/sessions`, { studentId: studentIds[0] })).body.secret as string;
    const sendFile = () =>
      api.fetch(`/api/u/${token}/files`, {
        method: 'PUT',
        body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x01]),
        headers: { 'Content-Type': 'image/jpeg', 'X-File-Name': 'pagina.jpg', 'X-Upload-Session': secret },
      });
    expect((await sendFile()).status).toBe(201);
    await setTest('evaluation_at = ?', '2026-10-07T08:30:00.000Z');
    // The scheduled time comes while the second file is on its way to R2.
    const bucket = api.env.FILES;
    api.env.FILES = new Proxy(bucket, {
      get(target, prop) {
        if (prop === 'put') {
          return (...args: Parameters<typeof bucket.put>) => {
            vi.setSystemTime(new Date('2026-10-07T08:30:00.000Z'));
            return target.put(...args);
          };
        }
        const value: unknown = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const res = await sendFile();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('closed');
    expect(await testRow()).toMatchObject({ status: 'evaluating', evaluation_started_at: '2026-10-07T08:30:00.000Z' });
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('closes the uploads before a student write', async () => {
    await addTestFiles(api, code);
    await setTest('evaluation_at = ?', PAST);
    const res = await api.request('POST', `/api/u/${token}/sessions`, { studentId: studentIds[0] });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'closed', message: 'Încărcarea s-a închis.' });
  });

  it('closes a test with no uploads and ends it, since nothing waits for grading', async () => {
    await addTestFiles(api, code);
    await setTest('evaluation_at = ?', PAST);
    await api.request('GET', `/api/admin/tests/${code}`);
    expect((await testRow())?.status).toBe('done');
    expect(dispatchRobot).not.toHaveBeenCalled();
  });
});

describe('the end of an evaluation', () => {
  it('comes when no upload waits for grading and no class analysis waits', async () => {
    const graded = await addSubmission(api, code, studentIds[0]!, { status: 'graded', files: 1 });
    await addSubmission(api, code, studentIds[1]!, { status: 'failed', files: 1 });
    await setTest("status = 'evaluating'");
    await api.db.prepare("UPDATE submissions SET status = 'grading' WHERE id = ?").bind(graded).run();
    await api.request('GET', '/api/admin/tests?year=2026');
    expect((await testRow())?.status).toBe('evaluating');

    await api.db.prepare("UPDATE submissions SET status = 'graded' WHERE id = ?").bind(graded).run();
    await setTest("analysis_status = 'requested'");
    await api.request('GET', '/api/admin/tests?year=2026');
    expect((await testRow())?.status).toBe('evaluating');

    await setTest("analysis_status = 'ready'");
    await api.request('GET', '/api/admin/tests?year=2026');
    expect((await testRow())?.status).toBe('done');
  });
});

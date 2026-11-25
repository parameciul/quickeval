import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BAREM_GENERATIONS_PER_DAY } from '../../shared/accounts.ts';
import { PDF_TYPE, TEST_FILE_PATHS, type TestFileKind } from '../../shared/files.ts';
import { bucharestDay } from '../../shared/quickTry.ts';
import { addSubmission, addTestFiles, makeClass, makeTest, otherTeacherTest, startTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let code: string;
let studentId: number;

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7 ${text}`);
const row = () =>
  api.db
    .prepare('SELECT status, barem_request, barem_request_attempts, barem_unchecked, evaluation_at, files_version FROM tests WHERE code = ?')
    .bind(code)
    .first<{
      status: string;
      barem_request: string;
      barem_request_attempts: number;
      barem_unchecked: number;
      evaluation_at: string | null;
      files_version: number;
    }>();
const otherRow = (otherCode: string) =>
  api.db
    .prepare('SELECT barem_request, barem_unchecked, evaluation_at FROM tests WHERE code = ?')
    .bind(otherCode)
    .first<{ barem_request: string; barem_unchecked: number; evaluation_at: string | null }>();
const setTest = (sql: string, ...params: unknown[]) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(...params, code).run();
const putTestFile = (name: string, text: string, kind: TestFileKind = 'test') =>
  api.fetch(`/api/admin/tests/${code}/files/${TEST_FILE_PATHS[kind]}`, {
    method: 'PUT',
    body: pdf(text),
    headers: { 'Content-Type': PDF_TYPE, 'X-File-Name': encodeURIComponent(name) },
  });
const generate = (target = code) => api.request('POST', `/api/admin/tests/${target}/marking-scheme/generate`);
const checked = (filesVersion: number, target = code) => api.request('POST', `/api/admin/tests/${target}/marking-scheme/checked`, { filesVersion });

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => true);
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '6E2', ['Pop Ion']);
  studentId = cls.studentIds[0]!;
  code = await makeTest(api, cls.id);
});

afterEach(async () => {
  await api.dispose();
});

describe('POST /marking-scheme/generate', () => {
  it('requests a barem, clears the schedule, and starts the robot', async () => {
    await startTest(api, code);
    await addTestFiles(api, code, ['test']);
    await setTest("evaluation_at = '2099-01-01T10:00:00.000Z', barem_request_attempts = 2");
    const res = await generate();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ barem: { request: 'requested', unchecked: false }, robot: 'dispatched' });
    expect(await row()).toMatchObject({ barem_request: 'requested', barem_request_attempts: 0, evaluation_at: null });
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('allows a draft test', async () => {
    await addTestFiles(api, code, ['test']);
    const res = await generate();
    expect(res.status).toBe(200);
    expect(res.body.barem.request).toBe('requested');
    expect((await row())!.barem_request).toBe('requested');
  });

  it('refuses without a test file', async () => {
    const res = await generate();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'missing_test_file', message: 'Încarcă testul înainte să generezi baremul.' });
    expect((await row())!.barem_request).toBe('none');
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('refuses while the robot grades with the barem', async () => {
    await startTest(api, code);
    await addTestFiles(api, code, ['test', 'barem']);
    // A paper waits, so the test stays in evaluation.
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating', exercise_list_status = 'ready'");
    const res = await generate();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'evaluating', message: 'Testul se corectează acum. Poți genera baremul după ce se termină corectarea.' });
    expect((await row())!.barem_request).toBe('none');
  });

  // The barem can be generated whenever its file can be replaced.
  it.each([
    ['done', "status = 'done', exercise_list_status = 'ready'"],
    ['evaluating with a list problem', "status = 'evaluating', exercise_list_status = 'problem'"],
    ['evaluating with a failed list', "status = 'evaluating', exercise_list_status = 'failed'"],
  ])('allows a test that is %s', async (_, state) => {
    await startTest(api, code);
    await addTestFiles(api, code, ['test', 'barem']);
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    await setTest(state);
    const res = await generate();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ barem: { request: 'requested', unchecked: false }, robot: 'dispatched' });
    expect((await row())!.barem_request).toBe('requested');
  });

  // The robot waits for a barem made during the evaluation, so she must be
  // able to make it again or replace it, or the papers would wait for ever.
  it.each([
    ['unchecked', "barem_unchecked = 1, barem_request = 'none'"],
    ['unchecked after a failed new generation', "barem_unchecked = 1, barem_request = 'failed'"],
  ])('allows a test in evaluation whose barem is %s', async (_, state) => {
    await startTest(api, code);
    await addTestFiles(api, code, ['test', 'barem']);
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    await setTest(`status = 'evaluating', exercise_list_status = 'none', ${state}`);
    expect((await generate()).status).toBe(200);
    await setTest("barem_request = 'requested'");
    const upload = await putTestFile('barem.pdf', 'baremul meu', 'barem');
    expect(upload.status).toBe(200);
    expect(await upload.json()).toMatchObject({ robot: 'dispatched' });
    expect(await row()).toMatchObject({ status: 'evaluating', barem_unchecked: 0, barem_request: 'none' });
  });

  it('refuses a second request while one is being made', async () => {
    await addTestFiles(api, code, ['test']);
    await setTest("barem_request = 'requested', barem_request_attempts = 2");
    const res = await generate();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'barem_requested', message: 'Baremul se generează deja.' });
    expect((await row())!.barem_request_attempts).toBe(2);
  });

  it('refuses a test of another teacher and leaves it unchanged', async () => {
    const other = await otherTeacherTest(api);
    await api.db
      .prepare("UPDATE tests SET test_file_key = 'fixture/x.pdf', test_file_name = 'x.pdf', test_file_type = 'application/pdf', evaluation_at = '2099-01-01T10:00:00.000Z' WHERE code = ?")
      .bind(other.code)
      .run();
    expect((await generate(other.code)).status).toBe(404);
    expect(await otherRow(other.code)).toEqual({ barem_request: 'none', barem_unchecked: 0, evaluation_at: '2099-01-01T10:00:00.000Z' });
  });
});

describe('POST /marking-scheme/checked', () => {
  it('confirms an unchecked barem with the shown filesVersion', async () => {
    await addTestFiles(api, code, ['test', 'barem']);
    await setTest('barem_unchecked = 1');
    const res = await checked((await row())!.files_version);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ barem: { request: 'none', unchecked: false }, robot: null });
    expect((await row())!.barem_unchecked).toBe(0);
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('starts the robot when the papers of a test in evaluation waited for the barem', async () => {
    await startTest(api, code);
    await addTestFiles(api, code, ['test', 'barem']);
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating', barem_unchecked = 1");
    const res = await checked((await row())!.files_version);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ barem: { request: 'none', unchecked: false }, robot: 'dispatched' });
  });

  it('refuses a confirm with an old filesVersion', async () => {
    await addTestFiles(api, code, ['test', 'barem']);
    await setTest('barem_unchecked = 1');
    const res = await checked((await row())!.files_version + 1);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'stale', message: 'Baremul s-a schimbat. Reîncarcă pagina.' });
    expect((await row())!.barem_unchecked).toBe(1);
  });

  it('refuses a confirm while a new barem is being generated', async () => {
    await addTestFiles(api, code, ['test', 'barem']);
    await setTest("barem_unchecked = 1, barem_request = 'requested'");
    expect((await checked((await row())!.files_version)).status).toBe(409);
    expect((await row())!.barem_unchecked).toBe(1);
  });

  it('refuses a confirm after the regeneration failed', async () => {
    await addTestFiles(api, code, ['test', 'barem']);
    await setTest("barem_unchecked = 1, barem_request = 'failed', barem_request_attempts = 3");
    const res = await checked((await row())!.files_version);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('stale');
    expect((await row())!.barem_unchecked).toBe(1);
  });

  it('refuses a body without a filesVersion', async () => {
    const res = await api.request('POST', `/api/admin/tests/${code}/marking-scheme/checked`, {});
    expect(res.status).toBe(400);
  });

  it('refuses a test of another teacher and leaves it unchanged', async () => {
    const other = await otherTeacherTest(api);
    await api.db.prepare('UPDATE tests SET barem_unchecked = 1 WHERE code = ?').bind(other.code).run();
    const version = (await api.db.prepare('SELECT files_version FROM tests WHERE code = ?').bind(other.code).first<{ files_version: number }>())!.files_version;
    expect((await checked(version, other.code)).status).toBe(404);
    expect(await otherRow(other.code)).toMatchObject({ barem_request: 'none', barem_unchecked: 1 });
  });
});

describe('file uploads and the generated barem', () => {
  it('a teacher barem upload clears unchecked and a waiting request', async () => {
    await addTestFiles(api, code, ['test']);
    await setTest("barem_unchecked = 1, barem_request = 'requested', barem_request_attempts = 1");
    const res = await putTestFile('barem.pdf', 'barem', 'barem');
    expect(res.status).toBe(200);
    expect(await row()).toMatchObject({ barem_unchecked: 0, barem_request: 'none', barem_request_attempts: 0 });
  });

  it('a new test file asks for a new barem when the barem is unchecked', async () => {
    await setTest('barem_unchecked = 1, barem_request_attempts = 2');
    const res = await putTestFile('test2.pdf', 'enunț nou');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ robot: 'dispatched' });
    expect(await row()).toMatchObject({ barem_request: 'requested', barem_request_attempts: 0, barem_unchecked: 1 });
    expect(dispatchRobot).toHaveBeenCalled();
  });

  it('a new test file leaves a checked barem alone', async () => {
    await setTest("barem_request = 'failed', barem_request_attempts = 3, barem_unchecked = 0");
    const res = await putTestFile('test2.pdf', 'enunț nou');
    expect(res.status).toBe(200);
    expect(await row()).toMatchObject({ barem_request: 'failed', barem_request_attempts: 3, barem_unchecked: 0 });
    // The robot starts only for the print PDF of the new test file.
    expect(await res.json()).toMatchObject({ robot: 'dispatched' });
    expect(await api.db.prepare('SELECT print_status FROM tests WHERE code = ?').bind(code).first()).toEqual({ print_status: 'none' });
  });

  it('a new test file asks for a new barem in a done test too', async () => {
    await startTest(api, code);
    await setTest("barem_unchecked = 1, status = 'done'");
    const res = await putTestFile('test2.pdf', 'enunț nou');
    expect(await res.json()).toMatchObject({ robot: 'dispatched' });
    expect(await row()).toMatchObject({ barem_request: 'requested', barem_unchecked: 1 });
  });
});

describe('the day limit of generated barems', () => {
  const today = () => bucharestDay(new Date());
  const madeToday = (barems: number, failed = 0) =>
    api.db
      .prepare('INSERT INTO usage_days (day, quick_try, teacher_id, barems, failed) VALUES (?, 0, ?, ?, ?)')
      .bind(today(), api.teacherId, barems, failed)
      .run();
  const asTeacher = () => api.db.prepare("UPDATE teachers SET role = 'teacher' WHERE id = ?").bind(api.teacherId).run();
  const secondTest = async () => {
    const other = await makeTest(api, (await makeClass(api, '7A', ['Ana'])).id);
    await addTestFiles(api, other, ['test']);
    return other;
  };

  beforeEach(async () => {
    await asTeacher();
    await addTestFiles(api, code, ['test']);
  });

  it('counts the barems made today and the requests that wait, class and CES', async () => {
    await madeToday(BAREM_GENERATIONS_PER_DAY - 2);
    const other = await secondTest();
    await api.db.prepare("UPDATE tests SET ces_barem_request = 'requested' WHERE code = ?").bind(other).run();
    // One left: this request takes it. Then the two that wait fill the day.
    expect((await generate()).status).toBe(200);
    const res = await generate(other);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: 'barem_limit',
      message: `Poți genera cel mult ${BAREM_GENERATIONS_PER_DAY} bareme pe zi, cu tot cu cele care se generează acum. Poți genera din nou mâine sau poți încărca baremul tău.`,
    });
    expect((await otherRow(other))!.barem_request).toBe('none');
  });

  it('does not count the failed jobs, nor the barems of another day', async () => {
    await madeToday(BAREM_GENERATIONS_PER_DAY - 1, 20);
    await api.db
      .prepare("INSERT INTO usage_days (day, quick_try, teacher_id, barems) VALUES ('2020-01-01', 0, ?, 50)")
      .bind(api.teacherId)
      .run();
    expect((await generate()).status).toBe(200);
  });

  it('has no limit for an administrator', async () => {
    await api.db.prepare("UPDATE teachers SET role = 'admin' WHERE id = ?").bind(api.teacherId).run();
    await madeToday(BAREM_GENERATIONS_PER_DAY * 3);
    expect((await generate()).status).toBe(200);
  });

  it('keeps a new test file from asking for a barem past the limit', async () => {
    await madeToday(BAREM_GENERATIONS_PER_DAY);
    await setTest('barem_unchecked = 1');
    expect((await putTestFile('test2.pdf', 'enunț nou')).status).toBe(200);
    expect(await row()).toMatchObject({ barem_request: 'none', barem_unchecked: 1 });
  });
});

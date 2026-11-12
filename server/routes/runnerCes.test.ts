import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { addCesFiles, addSubmission, addTestFiles, makeClass, makeTest, markCes, ROBOT_KEY, robotRequest, setRobotKey, startTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// The robot API's side of the CES variant: which CES work waits, and the jobs
// and answers named with ?variant=ces.

const RUN = 'run-ces-api-0001';
let api: TestApi;
let robot: ReturnType<typeof robotRequest>;
let code: string;
let testId: number;
let students: number[];

const CLASS_LIST = { totalPoints: 10, officePoints: 1, exercises: [{ id: 'I.1', label: 'Ex. 1', maxPoints: 9, answer: '1', scoringNotes: '', topic: 'T' }], notes: '' };
const setTest = (sql: string, ...params: unknown[]) => api.db.prepare(`UPDATE tests SET ${sql} WHERE id = ?`).bind(...params, testId).run();
const tasks = async () => (await robot('GET', '/tasks')).body;

beforeEach(async () => {
  api = await startTestApi();
  await setRobotKey(api);
  robot = robotRequest(api, ROBOT_KEY);
  const cls = await makeClass(api, '9R2', ['Bursașiu Teodor', 'Ene Ana']);
  students = cls.studentIds;
  code = await makeTest(api, cls.id);
  testId = await testIdOf(api, code);
  expect((await robot('POST', '/lease', { runId: RUN })).body.granted).toBe(true);
});

afterEach(async () => {
  await api.dispose();
});

describe('CES print and barem jobs', () => {
  it('lists the CES print PDF of a draft with a CES test file, apart from the class print', async () => {
    await addCesFiles(api, code, ['test']);
    expect(await tasks()).toMatchObject({ prints: [], cesPrints: [testId] });
    expect((await robot('POST', '/check')).body).toMatchObject({ hasWork: true, prints: 0, ces: 1 });
    const job = await robot('GET', `/tests/${testId}/print-job?variant=ces`);
    expect(job.body.job).toMatchObject({ testId, filesVersion: 0, contentType: PDF_TYPE });
    // The class test has no file: no class print job.
    expect((await robot('GET', `/tests/${testId}/print-job`)).status).toBe(404);
  });

  it('refuses a variant it does not know', async () => {
    await addCesFiles(api, code, ['test']);
    expect((await robot('GET', `/tests/${testId}/print-job?variant=altceva`)).status).toBe(404);
  });

  it('saves a CES print failure on the CES columns only', async () => {
    await addCesFiles(api, code, ['test']);
    const res = await robot('POST', `/tests/${testId}/print-failed?variant=ces`, { runId: RUN, filesVersion: 0, error: 'crash' });
    expect(res.body).toEqual({ status: 'none' });
    const row = await api.db.prepare('SELECT print_attempts, ces_print_attempts FROM tests WHERE id = ?').bind(testId).first();
    expect(row).toEqual({ print_attempts: 0, ces_print_attempts: 1 });
    // An answer made from an older CES file is refused.
    const stale = await robot('POST', `/tests/${testId}/print-failed?variant=ces`, { runId: RUN, filesVersion: 5, error: 'crash' });
    expect(stale.status).toBe(409);
  });

  it('gives a CES barem job with the class barem and the class list, during the evaluation too', async () => {
    await startTest(api, code);
    await addTestFiles(api, code);
    await api.env.FILES.put(`fixture/${code}/barem.pdf`, '%PDF-1.7 barem');
    await addCesFiles(api, code, ['test']);
    await addSubmission(api, code, students[1]!, { status: 'submitted', files: 1 });
    await setTest(`status = 'evaluating', exercise_list_json = ?, ces_barem_request = 'requested', ces_barem_notes = 'N'`, JSON.stringify(CLASS_LIST));
    expect(await tasks()).toMatchObject({ barems: [], cesBarems: [testId] });
    const job = await robot('GET', `/tests/${testId}/barem-job?variant=ces`);
    expect(job.body.job).toEqual({
      testId,
      createdAt: expect.any(String),
      filesVersion: 0,
      contentType: PDF_TYPE,
      baremNotes: 'N',
      subject: null,
      variant: 'ces',
      classBarem: { contentType: PDF_TYPE },
      classExerciseList: CLASS_LIST,
    });
    const classBarem = await api.fetch(`/api/runner/tests/${testId}/barem-job/class-barem`, { headers: { Authorization: `Bearer ${ROBOT_KEY}` } });
    expect(await classBarem.text()).toBe('%PDF-1.7 barem');
    // The class barem job, which does not wait, shows nothing.
    expect((await robot('GET', `/tests/${testId}/barem-job`)).status).toBe(404);
  });

  it('gives no class barem to a job of the class test', async () => {
    await addTestFiles(api, code, ['test', 'barem']);
    await setTest("barem_request = 'requested'");
    expect((await robot('GET', `/tests/${testId}/barem-job/class-barem`)).status).toBe(404);
  });
});

describe('the CES exercise list', () => {
  // A test in evaluation with a CES paper waiting.
  async function evaluating(): Promise<void> {
    await startTest(api, code);
    await addTestFiles(api, code);
    await addCesFiles(api, code);
    await markCes(api, students[0]!);
    await addSubmission(api, code, students[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating', exercise_list_status = 'ready', exercise_list_json = ?", JSON.stringify(CLASS_LIST));
  }

  it('waits for the CES papers, an active CES barem and the class list', async () => {
    await evaluating();
    expect((await tasks()).cesExerciseLists).toEqual([testId]);
    expect((await robot('POST', '/check')).body).toMatchObject({ hasWork: true, ces: 1 });

    await setTest('ces_barem_unchecked = 1');
    expect((await tasks()).cesExerciseLists).toEqual([]);
    await setTest("ces_barem_unchecked = 0, exercise_list_status = 'none'");
    expect((await tasks()).cesExerciseLists).toEqual([]);
    await setTest("exercise_list_status = 'accepted'");
    expect((await tasks()).cesExerciseLists).toEqual([testId]);
    // A paper fixed as a class paper when it went to grading does not wait for it.
    await api.db.prepare("UPDATE submissions SET variant = 'class'").run();
    expect((await tasks()).cesExerciseLists).toEqual([]);
  });

  it('gives the CES files and the class list, and saves the CES list on its own columns', async () => {
    await evaluating();
    const read = await robot('GET', `/tests/${testId}?variant=ces`);
    expect(read.body.test).toMatchObject({
      id: testId,
      filesVersion: 0,
      files: { test: { contentType: PDF_TYPE }, barem: { contentType: PDF_TYPE } },
      exerciseList: null,
      variant: 'ces',
      classExerciseList: CLASS_LIST,
    });
    await api.env.FILES.put(`fixture/${code}/ces/test.pdf`, '%PDF-1.7 ces');
    const file = await api.fetch(`/api/runner/tests/${testId}/files/test?variant=ces`, { headers: { Authorization: `Bearer ${ROBOT_KEY}` } });
    expect(await file.text()).toBe('%PDF-1.7 ces');

    const saved = await robot('POST', `/tests/${testId}/exercise-list?variant=ces`, { runId: RUN, filesVersion: 0, ok: true, exerciseList: CLASS_LIST });
    expect(saved.body.exerciseList).toEqual({ status: 'ready', message: null });
    const row = await api.db.prepare('SELECT exercise_list_status, ces_exercise_list_status, ces_exercise_list_json FROM tests WHERE id = ?').bind(testId).first<Record<string, string>>();
    expect(row).toMatchObject({ exercise_list_status: 'ready', ces_exercise_list_status: 'ready' });
    expect(JSON.parse(row!.ces_exercise_list_json!)).toEqual(CLASS_LIST);
    // Saved once: a second answer is no longer needed.
    const again = await robot('POST', `/tests/${testId}/exercise-list?variant=ces`, { runId: RUN, filesVersion: 0, ok: true, exerciseList: CLASS_LIST });
    expect(again.status).toBe(409);
  });

  it('refuses a CES list made from older CES files', async () => {
    await evaluating();
    await setTest('ces_files_version = 2');
    const res = await robot('POST', `/tests/${testId}/exercise-list?variant=ces`, { runId: RUN, filesVersion: 1, ok: false, error: 'crash' });
    expect(res.status).toBe(409);
  });
});

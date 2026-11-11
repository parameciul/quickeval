import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addSubmission, addTestFiles, makeClass, makeTest, robotRequest, setRobotKey, startTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// The subject of a test (spec: any subject): what the teacher app and the
// robot read of it, and when it is forgotten.

let api: TestApi;
let robot: ReturnType<typeof robotRequest>;
let code: string;
let testId: number;
let studentIds: number[];

const setTest = (sql: string, ...params: unknown[]) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(...params, code).run();
const subjectRow = () =>
  api.db.prepare('SELECT subject, subject_name, subject_by FROM tests WHERE code = ?').bind(code).first<{
    subject: string | null;
    subject_name: string;
    subject_by: string | null;
  }>();
const detail = async () => (await api.request('GET', `/api/admin/tests/${code}`)).body.test;
const putFile = (kind: string, text: string) =>
  api.fetch(`/api/admin/tests/${code}/files/${kind}`, {
    method: 'PUT',
    body: new TextEncoder().encode(`%PDF-1.7 ${text}`),
    headers: { 'Content-Type': 'application/pdf', 'X-File-Name': `${kind}.pdf` },
  });

beforeEach(async () => {
  api = await startTestApi();
  await setRobotKey(api);
  robot = robotRequest(api);
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana']);
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
  await startTest(api, code);
  await addTestFiles(api, code);
  testId = await testIdOf(api, code);
});

afterEach(async () => {
  await api.dispose();
});

describe('the subject of a test', () => {
  it('is unknown on a new test, then shows what the robot found or the teacher set', async () => {
    expect(await subjectRow()).toEqual({ subject: null, subject_name: '', subject_by: null });
    expect((await detail()).subject).toBeNull();
    await setTest("subject = 'fizica', subject_by = 'robot'");
    expect((await detail()).subject).toEqual({ value: 'fizica', name: '', by: 'robot' });
    await setTest("subject = 'alta', subject_name = 'istorie', subject_by = 'robot'");
    expect((await detail()).subject).toEqual({ value: 'alta', name: 'istorie', by: 'robot' });
  });

  it('refuses a value outside the list in the database', async () => {
    await expect(setTest("subject = 'istorie'")).rejects.toThrow();
    await expect(setTest("subject_by = 'elev'")).rejects.toThrow();
  });

  it('goes to the robot with the test in evaluation, and with the class results', async () => {
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating', subject = 'chimie', subject_by = 'teacher'");
    expect((await robot('GET', `/tests/${testId}`)).body.test.subject).toBe('chimie');
    expect((await robot('GET', `/tests/${testId}?variant=ces`)).body.test.subject).toBe('chimie');
    expect((await robot('GET', `/tests/${testId}/results`)).body.results.subject).toBe('chimie');
  });

  it('goes to the robot with a barem job, null while it is not known', async () => {
    await setTest("barem_file_key = NULL, barem_file_name = NULL, barem_file_type = NULL, barem_request = 'requested'");
    expect((await robot('GET', `/tests/${testId}/barem-job`)).body.job.subject).toBeNull();
    await setTest("subject = 'biologie', subject_by = 'robot'");
    expect((await robot('GET', `/tests/${testId}/barem-job`)).body.job.subject).toBe('biologie');
  });

  it('is forgotten when the teacher replaces the test file, if the robot found it', async () => {
    await setTest("subject = 'alta', subject_name = 'istorie', subject_by = 'robot'");
    expect((await putFile('test', 'alt test')).status).toBe(200);
    expect(await subjectRow()).toEqual({ subject: null, subject_name: '', subject_by: null });
  });

  it('stays when the teacher set it, and when only the barem changes', async () => {
    await setTest("subject = 'romana', subject_by = 'teacher'");
    expect((await putFile('test', 'alt test')).status).toBe(200);
    expect(await subjectRow()).toEqual({ subject: 'romana', subject_name: '', subject_by: 'teacher' });
    await setTest("subject = 'fizica', subject_by = 'robot'");
    expect((await putFile('barem', 'alt barem')).status).toBe(200);
    expect(await subjectRow()).toEqual({ subject: 'fizica', subject_name: '', subject_by: 'robot' });
  });
});

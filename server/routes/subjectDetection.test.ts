import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_PAPER_LIMIT } from '../../shared/accounts.ts';
import { DOCX_TYPE } from '../../shared/files.ts';
import { unsupportedMessage } from '../../shared/subjects.ts';
import { addSubmission, addTestFiles, makeClass, makeTest, ROBOT_KEY, robotRequest, setRobotKey, startTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// The subject that the robot finds (spec: any subject): saved with the
// exercise list or a generated barem, and a subject it does not grade, which
// stops the grading before any paper.

const RUN = 'run-subject-0001';
const PAST = '2026-10-06T08:00:00.000Z';
const LIST = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [{ id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 9, answer: '3', scoringNotes: '', topic: 'Ecuații' }],
  notes: '',
};
const HISTORY = unsupportedMessage('istorie');

let api: TestApi;
let robot: ReturnType<typeof robotRequest>;
const dispatchRobot = vi.fn(async () => true);
let code: string;
let testId: number;
let classId: number;
let studentIds: number[];

const setTest = (sql: string, ...params: unknown[]) => api.db.prepare(`UPDATE tests SET ${sql} WHERE id = ?`).bind(...params, testId).run();
const row = () =>
  api.db
    .prepare('SELECT subject, subject_name, subject_by, exercise_list_status, exercise_list_message, status, evaluation_at FROM tests WHERE id = ?')
    .bind(testId)
    .first<Record<string, unknown>>();
const saveList = (extra: object) => robot('POST', `/tests/${testId}/exercise-list`, { runId: RUN, filesVersion: 0, ok: true, exerciseList: { ...LIST, ...extra } });
const putBarem = (headers: Record<string, string> = {}) =>
  api.fetch(`/api/runner/tests/${testId}/barem`, {
    method: 'PUT',
    body: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]),
    headers: { Authorization: `Bearer ${ROBOT_KEY}`, 'Content-Type': DOCX_TYPE, 'X-Run-Id': RUN, 'X-Files-Version': '0', ...headers },
  });
const evaluate = (testCode: string, body: object = {}) => api.request('POST', `/api/admin/tests/${testCode}/evaluate`, body);
const putFile = (kind: 'test' | 'barem') =>
  api.fetch(`/api/admin/tests/${code}/files/${kind}`, {
    method: 'PUT',
    body: new TextEncoder().encode(`%PDF-1.7 ${kind} bun`),
    headers: { 'Content-Type': 'application/pdf', 'X-File-Name': `${kind}.pdf` },
  });
const putTestFile = () => putFile('test');

beforeEach(async () => {
  dispatchRobot.mockClear();
  api = await startTestApi({ app: { dispatchRobot } });
  await setRobotKey(api);
  robot = robotRequest(api);
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana']);
  classId = cls.id;
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
  await startTest(api, code);
  await addTestFiles(api, code);
  testId = await testIdOf(api, code);
});

afterEach(async () => {
  await api.dispose();
});

describe('the subject found with the exercise list', () => {
  beforeEach(async () => {
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating'");
    await robot('POST', '/lease', { runId: RUN });
  });

  it('is saved as the robot found it, and the papers are graded', async () => {
    const res = await saveList({ subject: 'fizica', subjectName: '' });
    expect(res.body).toEqual({ exerciseList: { status: 'ready', message: null } });
    expect(await row()).toMatchObject({ subject: 'fizica', subject_name: '', subject_by: 'robot' });
    expect((await robot('POST', '/claim', { runId: RUN })).status).toBe(200);
  });

  it('stops the grading at a subject that is not graded, and says which', async () => {
    const res = await saveList({ subject: 'alta', subjectName: 'istorie' });
    expect(res.body).toEqual({ exerciseList: { status: 'failed', message: HISTORY } });
    expect(await row()).toMatchObject({ subject: 'alta', subject_name: 'istorie', subject_by: 'robot', status: 'evaluating' });
    expect((await robot('POST', '/claim', { runId: RUN })).status).toBe(204);
    expect((await robot('POST', '/check')).body).toMatchObject({ hasWork: false, exerciseLists: 0, pendingGrading: 0 });
  });

  it('keeps the subject the teacher set, whatever the robot found', async () => {
    await setTest("subject = 'romana', subject_by = 'teacher'");
    const res = await saveList({ subject: 'alta', subjectName: 'istorie' });
    expect(res.body.exerciseList.status).toBe('ready');
    expect(await row()).toMatchObject({ subject: 'romana', subject_name: '', subject_by: 'teacher' });
  });

  it('changes nothing about the subject in an older robot’s list', async () => {
    expect((await saveList({})).body.exerciseList.status).toBe('ready');
    expect(await row()).toMatchObject({ subject: null, subject_by: null });
  });

  it('takes a new answer of the robot after a list that ended at a subject not graded', async () => {
    await setTest("subject = 'alta', subject_name = 'istorie', subject_by = 'robot'");
    expect((await saveList({ subject: 'matematica', subjectName: '' })).body.exerciseList.status).toBe('ready');
    expect(await row()).toMatchObject({ subject: 'matematica', subject_name: '', subject_by: 'robot' });
  });

  it('ends a Quick Try whose subject is not graded as failed, with the message', async () => {
    await setTest('quick_try = 1');
    expect((await saveList({ subject: 'alta', subjectName: 'istorie' })).body).toEqual({ exerciseList: { status: 'failed', message: HISTORY } });
  });
});

describe('the subject found with a generated barem', () => {
  beforeEach(async () => {
    await setTest("barem_file_key = NULL, barem_file_name = NULL, barem_file_type = NULL, barem_request = 'requested'");
    await robot('POST', '/lease', { runId: RUN });
  });

  it('is saved with the barem, also a subject that is not graded', async () => {
    expect((await putBarem({ 'X-Subject': 'alta', 'X-Subject-Name': encodeURIComponent('istorie') })).status).toBe(200);
    expect(await row()).toMatchObject({ subject: 'alta', subject_name: 'istorie', subject_by: 'robot', exercise_list_status: 'none' });
  });

  it('is not saved from an older robot or from headers that cannot be read, and the barem is', async () => {
    expect((await putBarem({ 'X-Subject': 'istorie' })).status).toBe(200);
    expect(await row()).toMatchObject({ subject: null, subject_by: null });
  });

  it('cannot be read from a broken name', async () => {
    expect((await putBarem({ 'X-Subject': 'alta', 'X-Subject-Name': '%E0%A4%A' })).status).toBe(200);
    expect(await row()).toMatchObject({ subject: null });
  });

  it('ends a Quick Try whose subject is not graded', async () => {
    await setTest('quick_try = 1');
    expect((await putBarem({ 'X-Subject': 'alta', 'X-Subject-Name': encodeURIComponent('istorie') })).status).toBe(200);
    expect(await row()).toMatchObject({ subject: 'alta', exercise_list_status: 'failed', exercise_list_message: HISTORY });
  });
});

describe('a test whose subject is not graded', () => {
  beforeEach(async () => {
    await setTest("subject = 'alta', subject_name = 'istorie', subject_by = 'robot'");
    await addSubmission(api, code, studentIds[0]!, { files: 1 });
  });

  it('does not start or get a schedule, and says why', async () => {
    for (const body of [{}, { at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }]) {
      const res = await evaluate(code, body);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'subject_unsupported', message: HISTORY });
    }
    expect(await row()).toMatchObject({ status: 'open', evaluation_at: null });
  });

  it('loses a schedule that comes due, so its students can upload again', async () => {
    await setTest('evaluation_at = ?', PAST);
    await api.request('GET', `/api/admin/tests/${code}`);
    expect(await row()).toMatchObject({ status: 'open', evaluation_at: null });
  });

  it('takes a new test file during its evaluation, and the robot reads it again', async () => {
    // A sent paper keeps the test in evaluation.
    await addSubmission(api, code, studentIds[1]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating', exercise_list_status = 'failed', exercise_list_message = ?", HISTORY);
    const res = await putTestFile();
    expect(res.status).toBe(200);
    expect((await res.json()).robot).not.toBeNull();
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
    expect(await row()).toMatchObject({ subject: null, subject_by: null, exercise_list_status: 'none', exercise_list_message: null });
  });
});

describe('a demo account', () => {
  it('keeps neither its one test nor its papers for a test whose subject is not graded', async () => {
    await api.db.prepare("UPDATE teachers SET role = 'teacher', demo = 1, papers_graded = ? WHERE id = ?").bind(DEMO_PAPER_LIMIT - 1, api.teacherId).run();
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest(
      "status = 'evaluating', evaluation_started_at = ?, subject = 'alta', subject_name = 'istorie', subject_by = 'robot', exercise_list_status = 'failed'",
      PAST,
    );
    const other = await makeTest(api, classId, 'Alt test');
    await startTest(api, other);
    await addTestFiles(api, other);
    await addSubmission(api, other, studentIds[1]!, { files: 1 });
    expect((await evaluate(other)).status).toBe(200);
  });

  it('cannot bring back the papers of that test once another test holds its one place', async () => {
    await api.db.prepare("UPDATE teachers SET role = 'teacher', demo = 1 WHERE id = ?").bind(api.teacherId).run();
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest(
      "status = 'evaluating', evaluation_started_at = ?, subject = 'alta', subject_name = 'istorie', subject_by = 'robot', exercise_list_status = 'failed', exercise_list_message = ?",
      PAST,
      HISTORY,
    );
    const other = await makeTest(api, classId, 'Alt test');
    await startTest(api, other);
    await addTestFiles(api, other);
    await addSubmission(api, other, studentIds[1]!, { files: 1 });
    expect((await evaluate(other)).status).toBe(200);
    expect((await putTestFile()).status).toBe(200);
    await putFile('barem');
    expect((await api.request('POST', `/api/admin/tests/${code}/exercise-list/retry`)).status).toBe(409);
    expect(await row()).toMatchObject({ subject: 'alta', subject_by: 'robot', exercise_list_status: 'failed', exercise_list_message: HISTORY });
  });
});

describe('a list that ended at a subject not graded', () => {
  it('is not tried again: only a new test file reads the test again', async () => {
    await setTest("subject = 'alta', subject_name = 'istorie', subject_by = 'robot', exercise_list_status = 'failed', exercise_list_message = ?", HISTORY);
    const res = await api.request('POST', `/api/admin/tests/${code}/exercise-list/retry`);
    expect(res.status).toBe(409);
    expect(await row()).toMatchObject({ subject: 'alta', exercise_list_status: 'failed', exercise_list_message: HISTORY });
  });
});

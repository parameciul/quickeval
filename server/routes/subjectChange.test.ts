import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_PAPER_LIMIT } from '../../shared/accounts.ts';
import { unsupportedMessage } from '../../shared/subjects.ts';
import { addEvaluation, addSubmission, addTestFiles, makeClass, makeTest, startTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// "Schimbă" (spec: any subject, "The teacher can fix it"): the teacher sets the
// subject of a test; after the exercise list exists, the list is made again
// and the graded papers are graded again, once for free in a demo account.

const PAST = '2026-10-06T08:00:00.000Z';
const HISTORY = unsupportedMessage('istorie');

let api: TestApi;
const dispatchRobot = vi.fn(async () => true);
let code: string;
let testId: number;
let classId: number;
let studentIds: number[];

const setTest = (sql: string, ...params: unknown[]) => api.db.prepare(`UPDATE tests SET ${sql} WHERE id = ?`).bind(...params, testId).run();
const row = () =>
  api.db
    .prepare(
      `SELECT subject, subject_name, subject_by, subject_regraded, status, exercise_list_status, exercise_list_message, ces_exercise_list_status,
         ces_files_version
       FROM tests WHERE id = ?`,
    )
    .bind(testId)
    .first<Record<string, unknown>>();
const papers = async () =>
  (await api.db.prepare('SELECT status, free_regrade FROM submissions WHERE test_id = ? ORDER BY id').bind(testId).all<{ status: string; free_regrade: number }>())
    .results;
const papersGraded = async () =>
  (await api.db.prepare('SELECT papers_graded FROM teachers WHERE id = ?').bind(api.teacherId).first<{ papers_graded: number }>())!.papers_graded;
const change = (subject: string, testCode = code) => api.request('PUT', `/api/admin/tests/${testCode}/subject`, { subject });
// The robot's results arrive: every waiting paper of the test is graded, and
// the test is done with its new list.
async function graded(): Promise<void> {
  await api.db.prepare("UPDATE submissions SET status = 'graded' WHERE test_id = ? AND status = 'submitted'").bind(testId).run();
  await setTest("status = 'done', exercise_list_status = 'ready', exercise_list_json = '{}'");
}
const demo = (used: number) =>
  api.db.prepare("UPDATE teachers SET role = 'teacher', demo = 1, papers_graded = ? WHERE id = ?").bind(used, api.teacherId).run();

// A finished math test with two graded papers.
async function finished(): Promise<void> {
  for (const studentId of studentIds) await addEvaluation(api, await addSubmission(api, code, studentId, { status: 'graded', files: 1 }));
  await setTest(
    "status = 'done', evaluation_started_at = ?, exercise_list_status = 'ready', exercise_list_json = '{}', subject = 'matematica', subject_by = 'robot'",
    PAST,
  );
}

// A test in evaluation whose list ended at a subject not graded, with sent papers.
async function endedAtHistory(sent = 1): Promise<void> {
  for (const studentId of studentIds.slice(0, sent)) await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
  await setTest(
    "status = 'evaluating', evaluation_started_at = ?, subject = 'alta', subject_name = 'istorie', subject_by = 'robot', exercise_list_status = 'failed', exercise_list_message = ?",
    PAST,
    HISTORY,
  );
}

beforeEach(async () => {
  dispatchRobot.mockClear();
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana']);
  classId = cls.id;
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
  await addTestFiles(api, code);
  testId = await testIdOf(api, code);
});

afterEach(async () => {
  await api.dispose();
});

describe('the teacher sets the subject', () => {
  it('saves it on a draft or open test as the teacher’s, and starts nothing', async () => {
    const res = await change('fizica');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ subject: { value: 'fizica', name: '', by: 'teacher' }, count: 0, testStatus: 'draft', robot: null });
    await startTest(api, code);
    // Starting the test asks for its print PDF.
    dispatchRobot.mockClear();
    expect((await change('chimie')).body).toMatchObject({ subject: { value: 'chimie', by: 'teacher' }, testStatus: 'open', robot: null });
    expect(await row()).toMatchObject({ subject: 'chimie', subject_by: 'teacher', exercise_list_status: 'none' });
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('takes only a subject the robot grades', async () => {
    for (const subject of ['istorie', 'alta', '']) {
      const res = await change(subject);
      expect(res.status).toBe(400);
    }
    expect(await row()).toMatchObject({ subject: null, subject_by: null });
  });

  it('waits while the robot reads the test and the barem', async () => {
    await startTest(api, code);
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating', exercise_list_status = 'ready', exercise_list_json = '{}', subject = 'matematica', subject_by = 'robot'");
    const res = await change('fizica');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('evaluating');
    // A list with a problem leaves the files to the teacher, but not while a paper is being graded.
    await api.db.prepare("UPDATE submissions SET status = 'grading' WHERE test_id = ?").bind(testId).run();
    await setTest("exercise_list_status = 'problem'");
    expect((await change('fizica')).status).toBe(409);
    expect(await row()).toMatchObject({ subject: 'matematica', subject_by: 'robot' });
  });

  it('waits while the robot generates a barem', async () => {
    for (const column of ['barem_request', 'ces_barem_request']) {
      await setTest(`${column} = 'requested'`);
      const res = await change('fizica');
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ error: 'barem_generating', message: 'Baremul se generează acum. Poți schimba materia după ce este gata.' });
      expect(await row()).toMatchObject({ subject: null });
      await setTest(`${column} = 'none'`);
    }
    expect((await change('fizica')).status).toBe(200);
  });

  it('makes the list again for a test that ended at a subject not graded, and its papers are graded', async () => {
    await startTest(api, code);
    await endedAtHistory();
    dispatchRobot.mockClear();
    const res = await change('fizica');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ subject: { value: 'fizica', by: 'teacher' }, count: 0, testStatus: 'evaluating' });
    expect(res.body.robot).not.toBeNull();
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
    expect(await row()).toMatchObject({ subject: 'fizica', subject_name: '', exercise_list_status: 'none', exercise_list_message: null });
    expect(await papers()).toEqual([{ status: 'submitted', free_regrade: 0 }]);
  });

  it('makes both lists again on a finished test, and grades every paper again', async () => {
    await finished();
    await setTest("ces_exercise_list_status = 'ready', ces_exercise_list_json = '{}'");
    const res = await change('fizica');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ count: 2, testStatus: 'evaluating' });
    expect(res.body.robot).not.toBeNull();
    // A CES list being made with the old subject is not saved.
    expect(await row()).toMatchObject({ subject: 'fizica', status: 'evaluating', exercise_list_status: 'none', ces_exercise_list_status: 'none', ces_files_version: 1 });
    expect((await papers()).map((paper) => paper.status)).toEqual(['submitted', 'submitted']);
    const left = await api.db.prepare('SELECT COUNT(*) AS n FROM evaluations e JOIN submissions s ON s.id = e.submission_id WHERE s.test_id = ?').bind(testId).first<{ n: number }>();
    expect(left!.n).toBe(0);
  });

  it('makes the lists again on a reopened test, and its papers are graded at the next start', async () => {
    await finished();
    expect((await api.request('POST', `/api/admin/tests/${code}/reopen`, {})).status).toBe(200);
    dispatchRobot.mockClear();
    const res = await change('fizica');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ count: 2, testStatus: 'open', robot: null });
    expect(dispatchRobot).not.toHaveBeenCalled();
    expect(await row()).toMatchObject({ subject: 'fizica', status: 'open', exercise_list_status: 'none' });
    expect((await papers()).map((paper) => paper.status)).toEqual(['submitted', 'submitted']);
    expect((await api.request('POST', `/api/admin/tests/${code}/evaluate`, {})).body).toMatchObject({ status: 'evaluating' });
  });

  it('makes the list again on a reopened test that ended at a subject not graded', async () => {
    await startTest(api, code);
    await endedAtHistory();
    expect((await api.request('POST', `/api/admin/tests/${code}/reopen`, {})).status).toBe(200);
    expect((await change('fizica')).status).toBe(200);
    expect(await row()).toMatchObject({ subject: 'fizica', status: 'open', exercise_list_status: 'none', exercise_list_message: null });
  });

  it('changes nothing for the subject the test already has, only who set it', async () => {
    await finished();
    const res = await change('matematica');
    expect(res.body).toEqual({ subject: { value: 'matematica', name: '', by: 'teacher' }, count: 0, testStatus: 'done', robot: null });
    expect(await row()).toMatchObject({ status: 'done', exercise_list_status: 'ready', subject_regraded: 0 });
    expect((await papers()).map((paper) => paper.status)).toEqual(['graded', 'graded']);
  });

  it('grades again on every change in a complete account', async () => {
    await finished();
    expect((await change('fizica')).body.count).toBe(2);
    // Every paper the robot grades counts: the free regrade is a demo account's only.
    expect((await papers()).map((paper) => paper.free_regrade)).toEqual([0, 0]);
    await graded();
    expect(await papersGraded()).toBe(2);
    expect((await change('chimie')).body.count).toBe(2);
    await graded();
    expect(await papersGraded()).toBe(4);
  });

  it('is not for a Quick Try', async () => {
    await setTest('quick_try = 1');
    expect((await change('fizica')).status).toBe(404);
    expect(await row()).toMatchObject({ subject: null });
  });

  it('is not for another teacher’s test', async () => {
    expect((await change('fizica', '6E2-26T9')).status).toBe(404);
  });
});

describe('a demo account', () => {
  it('grades the papers again once for free after a change of subject, even at its limit', async () => {
    await finished();
    await demo(DEMO_PAPER_LIMIT);
    expect((await change('fizica')).body).toMatchObject({ count: 2, testStatus: 'evaluating' });
    expect(await papers()).toEqual([
      { status: 'submitted', free_regrade: 1 },
      { status: 'submitted', free_regrade: 1 },
    ]);
    await graded();
    expect(await papersGraded()).toBe(DEMO_PAPER_LIMIT);
    expect(await papers()).toEqual([
      { status: 'graded', free_regrade: 0 },
      { status: 'graded', free_regrade: 0 },
    ]);
    // The second change is a normal regrade: the limit is reached.
    const res = await change('chimie');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('demo_limit');
    expect(await row()).toMatchObject({ subject: 'fizica', status: 'done', exercise_list_status: 'ready', subject_regraded: 1 });
  });

  it('grades for free only the papers that were graded: a failed one keeps to the limit', async () => {
    await finished();
    await api.db.prepare("UPDATE submissions SET status = 'failed' WHERE id = (SELECT MAX(id) FROM submissions WHERE test_id = ?)").bind(testId).run();
    await demo(DEMO_PAPER_LIMIT);
    expect((await change('fizica')).body).toMatchObject({ count: 1, testStatus: 'evaluating' });
    expect(await papers()).toEqual([
      { status: 'submitted', free_regrade: 1 },
      { status: 'failed', free_regrade: 0 },
    ]);
    await graded();
    expect(await papersGraded()).toBe(DEMO_PAPER_LIMIT);
  });

  it('refuses a change that would grade nothing again at its limit', async () => {
    await finished();
    await api.db.prepare("UPDATE submissions SET status = 'failed' WHERE test_id = ?").bind(testId).run();
    await demo(DEMO_PAPER_LIMIT);
    const res = await change('fizica');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('demo_limit');
    expect(await row()).toMatchObject({ subject: 'matematica', status: 'done', exercise_list_status: 'ready', subject_regraded: 0 });
  });

  it('does not count the papers of the free regrade among those on their way to the robot', async () => {
    await finished();
    await demo(DEMO_PAPER_LIMIT - 1);
    await change('fizica');
    // One grading fails; the paper left of the limit lets it be tried again.
    const [failed] = (await api.db.prepare('SELECT id, started_at FROM submissions WHERE test_id = ? ORDER BY id').bind(testId).all<{ id: number; started_at: string }>()).results;
    await api.db.prepare("UPDATE submissions SET status = 'failed' WHERE id = ?").bind(failed!.id).run();
    const res = await api.request('POST', `/api/admin/submissions/${failed!.id}/retry`, { startedAt: failed!.started_at });
    expect(res.status).toBe(200);
  });

  it('cannot read again a test of a subject not graded once another test holds its one place', async () => {
    await demo(0);
    await startTest(api, code);
    await endedAtHistory();
    const other = await makeTest(api, classId, 'Alt test');
    await startTest(api, other);
    await addTestFiles(api, other);
    await addSubmission(api, other, studentIds[1]!, { files: 1 });
    expect((await api.request('POST', `/api/admin/tests/${other}/evaluate`, {})).status).toBe(200);
    const res = await change('fizica');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('demo_limit');
    expect(await row()).toMatchObject({ subject: 'alta', exercise_list_status: 'failed', exercise_list_message: HISTORY });
  });

  it('holds back the papers past its limit when a test of a subject not graded is read again', async () => {
    await demo(DEMO_PAPER_LIMIT - 1);
    await startTest(api, code);
    await endedAtHistory(2);
    expect((await change('fizica')).status).toBe(200);
    expect((await papers()).map((paper) => paper.status)).toEqual(['submitted', 'uploading']);
  });

  it('sends the papers of the free regrade at the next start of a reopened test, even at its limit', async () => {
    const added = await api.request('POST', `/api/admin/classes/${classId}/students`, { names: ['Marin Dan'] });
    const late = added.body.students[0].id as number;
    await finished();
    await demo(DEMO_PAPER_LIMIT);
    expect((await change('fizica')).status).toBe(200);
    expect((await api.request('POST', `/api/admin/tests/${code}/reopen`, {})).status).toBe(200);
    // A new paper keeps to the limit.
    await addSubmission(api, code, late, { status: 'submitted', files: 1 });
    const res = await api.request('POST', `/api/admin/tests/${code}/evaluate`, {});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'evaluating' });
    expect(await papers()).toEqual([
      { status: 'submitted', free_regrade: 1 },
      { status: 'submitted', free_regrade: 1 },
      { status: 'uploading', free_regrade: 0 },
    ]);
  });

  it('sends the papers of the free regrade when the teacher starts only some papers', async () => {
    const added = await api.request('POST', `/api/admin/classes/${classId}/students`, { names: ['Marin Dan'] });
    const late = added.body.students[0].id as number;
    await finished();
    await demo(DEMO_PAPER_LIMIT - 1);
    await change('fizica');
    await api.request('POST', `/api/admin/tests/${code}/reopen`, {});
    const lateId = await addSubmission(api, code, late, { files: 1 });
    const res = await api.request('POST', `/api/admin/tests/${code}/evaluate`, { submissionIds: [lateId] });
    expect(res.status).toBe(200);
    expect((await papers()).map((paper) => paper.status)).toEqual(['submitted', 'submitted', 'submitted']);
  });
});

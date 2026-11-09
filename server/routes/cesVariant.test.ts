import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { requestBarem, saveBaremNotes, saveTestFile } from '../db/tests.ts';
import { addCesFiles, addSubmission, addTestFiles, makeClass, makeTest, markCes, otherTeacherTest, startTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// The CES variant of a test, as the teacher sees and changes it (spec: CES
// variant). The robot's side is in runnerCes.test.ts.

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let code: string;
let students: number[];

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7 ${text}`);
const putCesFile = async (kind: 'test' | 'barem', name: string, text: string, target = code) => {
  const res = await api.fetch(`/api/admin/tests/${target}/ces/files/${kind}`, {
    method: 'PUT',
    body: pdf(text),
    headers: { 'Content-Type': PDF_TYPE, 'X-File-Name': encodeURIComponent(name) },
  });
  return { status: res.status, body: await res.json() };
};
const setTest = (sql: string, ...params: unknown[]) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(...params, code).run();
const row = () =>
  api.db
    .prepare(
      `SELECT files_version, ces_files_version, ces_test_file_key, ces_barem_file_key, ces_barem_request, ces_barem_unchecked,
         ces_exercise_list_status, exercise_list_status, ces_print_status, evaluation_at, test_file_key
       FROM tests WHERE code = ?`,
    )
    .bind(code)
    .first<Record<string, string | number | null>>();
const info = async () => (await api.request('GET', `/api/admin/tests/${code}`)).body.test.ces;

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => true);
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '9R2', ['Bursașiu Teodor', 'Ene Ana']);
  students = cls.studentIds;
  code = await makeTest(api, cls.id);
});

afterEach(async () => {
  await api.dispose();
});

describe('the CES variant of a test page', () => {
  it('is empty on a new test, and counts the active CES students of the class', async () => {
    expect(await info()).toEqual({
      studentCount: 0,
      off: false,
      files: { test: null, barem: null },
      baremNotes: '',
      barem: { request: 'none', unchecked: false },
      filesVersion: 0,
      exerciseList: { status: 'none', message: null },
      print: { status: 'none', fromWord: false },
      papers: 0,
      waiting: 0,
      totalPoints: null,
      classTotalPoints: null,
    });
    await markCes(api, students[0]!);
    expect((await info()).studentCount).toBe(1);
    // A CES student who left the class does not count.
    await api.db.prepare('UPDATE enrollments SET active = 0 WHERE student_id = ?').bind(students[0]).run();
    expect((await info()).studentCount).toBe(0);
  });

  it('counts the CES papers that wait for grading, by the student mark until a paper goes to grading', async () => {
    await startTest(api, code);
    await addCesFiles(api, code, ['test']);
    await markCes(api, students[0]!);
    await addSubmission(api, code, students[0]!, { status: 'submitted', files: 1 });
    await addSubmission(api, code, students[1]!, { status: 'submitted', files: 1 });
    expect(await info()).toMatchObject({ waiting: 1, papers: 0 });
    // Fixed as a class paper when it went to grading: the mark no longer moves it.
    await api.db.prepare("UPDATE submissions SET variant = 'class' WHERE student_id = ?").bind(students[0]).run();
    expect(await info()).toMatchObject({ waiting: 0, papers: 0 });
  });

  it('marks the CES students in the uploads table, with the variant their paper went to grading with', async () => {
    await markCes(api, students[0]!);
    const id = await addSubmission(api, code, students[0]!, { status: 'graded', files: 1 });
    await api.db.prepare("UPDATE submissions SET variant = 'ces' WHERE id = ?").bind(id).run();
    const rows = (await api.request('GET', `/api/admin/tests/${code}`)).body.uploads as { studentName: string; ces: boolean; variant: string | null }[];
    expect(rows.map((r) => [r.studentName, r.ces, r.variant])).toEqual([
      ['Bursașiu Teodor', true, 'ces'],
      ['Ene Ana', false, null],
    ]);
  });

  it('gives the CES barem to the tests list once the test has a CES test file, and the CES mark to search and history', async () => {
    const list = async () => (await api.request('GET', '/api/admin/tests?year=2026')).body.tests[0].cesBarem;
    expect(await list()).toBeNull();
    await addCesFiles(api, code, ['test', 'barem']);
    await setTest("ces_barem_unchecked = 1");
    expect(await list()).toEqual({ request: 'none', unchecked: true, missing: false });

    await markCes(api, students[0]!);
    const search = await api.request('GET', '/api/admin/search?q=burs&year=2026');
    expect(search.body.students.map((s: { fullName: string; ces: boolean }) => [s.fullName, s.ces])).toEqual([['Bursașiu Teodor', true]]);
    const history = await api.request('GET', `/api/admin/students/${students[0]}/history`);
    expect(history.body.student).toMatchObject({ fullName: 'Bursașiu Teodor', ces: true });
  });

  it('says in the tests list when CES papers wait for a missing CES barem', async () => {
    const list = async () => (await api.request('GET', '/api/admin/tests?year=2026')).body.tests[0].cesBarem;
    await startTest(api, code);
    await addCesFiles(api, code, ['test']);
    await markCes(api, students[0]!);
    await addSubmission(api, code, students[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating'");
    expect(await list()).toEqual({ request: 'none', unchecked: false, missing: true });
    await addCesFiles(api, code, ['barem']);
    expect((await list()).missing).toBe(false);
  });

  it('gives the totals of the CES and the class exercise lists', async () => {
    await setTest(
      `exercise_list_json = '{"totalPoints":100}', ces_exercise_list_json = '{"totalPoints":90}'`,
    );
    expect(await info()).toMatchObject({ totalPoints: 90, classTotalPoints: 100 });
  });
});

describe('PUT /ces/files/:kind', () => {
  it('stores the CES test under ces/, apart from the class files, and starts the robot for its print PDF', async () => {
    await addTestFiles(api, code, ['test']);
    const before = await row();
    const res = await putCesFile('test', 'Test adaptat.pdf', 'ces');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ file: { name: 'Test adaptat.pdf', type: PDF_TYPE }, robot: 'dispatched' });
    const after = await row();
    expect(after).toMatchObject({ ces_test_file_key: `t/1/2026/${code}/ces/test/test-adaptat.pdf`, ces_files_version: 1, ces_print_status: 'none' });
    // The class test is not touched.
    expect(after!.files_version).toBe(before!.files_version);
    expect(after!.test_file_key).toBe(before!.test_file_key);
    expect((await info()).files.test).toEqual({ name: 'Test adaptat.pdf', type: PDF_TYPE });

    const file = await api.fetch(`/api/admin/tests/${code}/ces/files/test`);
    expect(file.status).toBe(200);
    expect(await file.text()).toBe('%PDF-1.7 ces');
  });

  it('clears the CES exercise list for a new CES barem, and keeps the class list', async () => {
    await setTest("exercise_list_status = 'ready', ces_exercise_list_status = 'ready', ces_barem_unchecked = 1");
    const res = await putCesFile('barem', 'barem CES.pdf', 'b');
    expect(res.status).toBe(200);
    // A draft: no exercise list to make yet.
    expect(res.body.robot).toBeNull();
    expect(await row()).toMatchObject({ ces_exercise_list_status: 'none', exercise_list_status: 'ready', ces_barem_unchecked: 0 });
  });

  it('starts the robot for a CES barem during the evaluation: the CES papers wait for it', async () => {
    await startTest(api, code);
    await setTest("status = 'evaluating'");
    await addSubmission(api, code, students[0]!, { status: 'submitted', files: 1 });
    const res = await putCesFile('barem', 'barem CES.pdf', 'b');
    expect(res.status).toBe(200);
    expect(res.body.robot).toBe('dispatched');
  });

  it('refuses a new CES file while the robot grades a CES paper', async () => {
    await startTest(api, code);
    await setTest("status = 'evaluating'");
    const id = await addSubmission(api, code, students[0]!, { status: 'grading', files: 1 });
    await api.db.prepare("UPDATE submissions SET variant = 'ces' WHERE id = ?").bind(id).run();
    const res = await putCesFile('barem', 'barem CES.pdf', 'b');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ces_grading');
    const notes = await api.request('PUT', `/api/admin/tests/${code}/ces/barem-notes`, { notes: 'Altfel.' });
    expect(notes.body.error).toBe('ces_grading');
    await addCesFiles(api, code, ['test']);
    const generate = await api.request('POST', `/api/admin/tests/${code}/ces/barem/generate`);
    expect(generate.status).toBe(409);
    expect(generate.body.error).toBe('ces_grading');
    expect((await row())!.ces_barem_request).toBe('none');
  });

  it('checks that no CES paper is in grading inside the write itself', async () => {
    // A paper the robot takes between the route's look and its write.
    await startTest(api, code);
    await addCesFiles(api, code, ['test']);
    await setTest("status = 'evaluating'");
    const id = await addSubmission(api, code, students[0]!, { status: 'grading', files: 1 });
    await api.db.prepare("UPDATE submissions SET variant = 'ces' WHERE id = ?").bind(id).run();
    const testId = await testIdOf(api, code);
    const now = '2026-11-09T10:00:00.000Z';
    const file = { key: 'k/ces-barem.pdf', name: 'b.pdf', type: PDF_TYPE };
    expect(await saveTestFile(api.db, 1, testId, 'barem', file, now, 'tokentokentoken2', 'ces')).toBeNull();
    expect(await saveBaremNotes(api.db, 1, testId, 'Altfel.', now, 'ces')).toBeNull();
    expect(await requestBarem(api.db, 1, testId, now, 'ces')).toBe(false);
    // The class files keep their own rule.
    expect(await saveBaremNotes(api.db, 1, testId, 'Clasa.', now)).toBe('evaluating');
    // Once the robot ends, the CES files may change again.
    await api.db.prepare("UPDATE submissions SET status = 'graded' WHERE id = ?").bind(id).run();
    expect(await saveBaremNotes(api.db, 1, testId, 'Altfel.', now, 'ces')).toBe('evaluating');
  });

  it('answers 404 for the test of another teacher', async () => {
    const other = await otherTeacherTest(api);
    const res = await putCesFile('test', 't.pdf', 'x', other.code);
    expect(res.status).toBe(404);
  });
});

describe('PUT /ces/barem-notes', () => {
  it('saves the CES notes, counts a new CES files version and clears the CES list only', async () => {
    await setTest("exercise_list_status = 'ready', ces_exercise_list_status = 'ready'");
    const res = await api.request('PUT', `/api/admin/tests/${code}/ces/barem-notes`, { notes: 'Punctează pe pași.' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ baremNotes: 'Punctează pe pași.', robot: null });
    expect(await row()).toMatchObject({ ces_files_version: 1, files_version: 0, ces_exercise_list_status: 'none', exercise_list_status: 'ready' });
    expect((await info()).baremNotes).toBe('Punctează pe pași.');
  });
});

describe('POST /ces/barem/generate and /ces/barem/checked', () => {
  it('refuses without a CES test file', async () => {
    const res = await api.request('POST', `/api/admin/tests/${code}/ces/barem/generate`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('missing_test_file');
  });

  it('generates the CES barem during the evaluation and keeps the schedule of an open test', async () => {
    await startTest(api, code);
    await addCesFiles(api, code, ['test']);
    await setTest("evaluation_at = '2099-01-01T10:00:00.000Z'");
    const open = await api.request('POST', `/api/admin/tests/${code}/ces/barem/generate`);
    expect(open.status).toBe(200);
    expect(open.body).toEqual({ barem: { request: 'requested', unchecked: false }, robot: 'dispatched' });
    expect(await row()).toMatchObject({ ces_barem_request: 'requested', evaluation_at: '2099-01-01T10:00:00.000Z' });

    // A test in evaluation with nothing to grade would end at the next request.
    await addSubmission(api, code, students[1]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating', ces_barem_request = 'none'");
    const evaluating = await api.request('POST', `/api/admin/tests/${code}/ces/barem/generate`);
    expect(evaluating.status).toBe(200);
    // The class barem cannot be generated then.
    await addTestFiles(api, code, ['test']);
    expect((await api.request('POST', `/api/admin/tests/${code}/barem/generate`)).status).toBe(409);
  });

  it('refuses a CES barem once the test is done', async () => {
    await addCesFiles(api, code, ['test']);
    await setTest("status = 'done'");
    const res = await api.request('POST', `/api/admin/tests/${code}/ces/barem/generate`);
    expect(res.body.error).toBe('not_editable');
  });

  it('confirms the CES barem as the page showed it, and starts the robot during the evaluation', async () => {
    await addCesFiles(api, code, ['test', 'barem']);
    await setTest("ces_barem_unchecked = 1, ces_files_version = 3");
    const stale = await api.request('POST', `/api/admin/tests/${code}/ces/barem/checked`, { filesVersion: 2 });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('stale');

    const draft = await api.request('POST', `/api/admin/tests/${code}/ces/barem/checked`, { filesVersion: 3 });
    expect(draft.body).toEqual({ barem: { request: 'none', unchecked: false }, robot: null });
    expect(dispatchRobot).not.toHaveBeenCalled();

    await setTest("status = 'evaluating', ces_barem_unchecked = 1");
    await addSubmission(api, code, students[0]!, { status: 'submitted', files: 1 });
    const evaluating = await api.request('POST', `/api/admin/tests/${code}/ces/barem/checked`, { filesVersion: 3 });
    expect(evaluating.body.robot).toBe('dispatched');
    // The class barem's check is apart.
    expect((await api.request('POST', `/api/admin/tests/${code}/barem/checked`, { filesVersion: 0 })).status).toBe(409);
  });
});

describe('DELETE /ces', () => {
  it('removes the CES files, from the database and from R2', async () => {
    await putCesFile('test', 'Test adaptat.pdf', 'ces');
    await putCesFile('barem', 'Barem adaptat.pdf', 'b');
    await setTest("ces_print_status = 'ready', ces_print_file_key = 'x/ces-print.pdf', ces_barem_notes = 'N'");
    await api.env.FILES.put('x/ces-print.pdf', 'p');
    const res = await api.request('DELETE', `/api/admin/tests/${code}/ces`);
    expect(res.status).toBe(200);
    expect(res.body.ces).toMatchObject({ files: { test: null, barem: null }, baremNotes: '', filesVersion: 3, print: { status: 'none', fromWord: false } });
    expect(await api.env.FILES.get(`t/1/2026/${code}/ces/test/test-adaptat.pdf`)).toBeNull();
    expect(await api.env.FILES.get(`t/1/2026/${code}/ces/barem/barem-adaptat.pdf`)).toBeNull();
    expect(await api.env.FILES.get('x/ces-print.pdf')).toBeNull();
  });

  it('refuses once a paper went to grading with the CES variant', async () => {
    await addCesFiles(api, code);
    const id = await addSubmission(api, code, students[0]!, { status: 'graded', files: 1 });
    await api.db.prepare("UPDATE submissions SET variant = 'ces' WHERE id = ?").bind(id).run();
    const res = await api.request('DELETE', `/api/admin/tests/${code}/ces`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ces_papers');
    expect((await row())!.ces_test_file_key).not.toBeNull();
  });

  it('allows it while the CES papers only wait, and says when there is nothing to remove', async () => {
    await addCesFiles(api, code, ['test']);
    await markCes(api, students[0]!);
    await addSubmission(api, code, students[0]!, { status: 'submitted', files: 1 });
    expect((await api.request('DELETE', `/api/admin/tests/${code}/ces`)).status).toBe(200);
    const again = await api.request('DELETE', `/api/admin/tests/${code}/ces`);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('no_ces');
  });

  it('starts the robot during the evaluation: the CES papers that waited go as class papers', async () => {
    await addCesFiles(api, code, ['test']);
    await markCes(api, students[0]!);
    expect((await api.request('DELETE', `/api/admin/tests/${code}/ces`)).body.robot).toBeNull();
    expect(dispatchRobot).not.toHaveBeenCalled();

    await startTest(api, code);
    await addCesFiles(api, code, ['test']);
    await addSubmission(api, code, students[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating'");
    const res = await api.request('DELETE', `/api/admin/tests/${code}/ces`);
    expect(res.status).toBe(200);
    expect(res.body.robot).toBe('dispatched');
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });
});

describe('PUT /students/:id/ces', () => {
  it('starts the robot when a test of the student is in evaluation with a CES variant', async () => {
    const mark = (ces: boolean) => api.request('PUT', `/api/admin/students/${students[0]}/ces`, { ces });
    expect((await mark(true)).body).toEqual({ student: { id: students[0], ces: true } });
    await startTest(api, code);
    // A sent paper keeps the test in evaluation.
    await addSubmission(api, code, students[1]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating'");
    // No CES variant: the mark changes nothing for the robot.
    await mark(false);
    expect(dispatchRobot).not.toHaveBeenCalled();

    await addCesFiles(api, code, ['test']);
    expect((await mark(true)).body).toEqual({ student: { id: students[0], ces: true } });
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
    await mark(false);
    expect(dispatchRobot).toHaveBeenCalledTimes(2);
  });
});

describe('the CES print PDF and exercise list', () => {
  it('tries a failed CES print PDF again', async () => {
    await addCesFiles(api, code, ['test']);
    await setTest("ces_print_status = 'failed', ces_print_attempts = 3");
    const res = await api.request('POST', `/api/admin/tests/${code}/ces/print/retry`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ print: { status: 'none', fromWord: false }, robot: 'dispatched' });
    expect((await row())!.ces_print_status).toBe('none');
    expect((await api.request('POST', `/api/admin/tests/${code}/ces/print/retry`)).status).toBe(409);
  });

  it('serves the CES print PDF once it is ready', async () => {
    expect((await api.fetch(`/api/admin/tests/${code}/ces/print`)).status).toBe(404);
    await setTest("ces_print_status = 'ready', ces_print_file_key = 'x/ces-print.pdf'");
    await api.env.FILES.put('x/ces-print.pdf', '%PDF-1.7 qr');
    const res = await api.fetch(`/api/admin/tests/${code}/ces/print`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('-CES-cu-cod-qr.pdf');
  });

  it('accepts a CES list with a problem and tries a failed one again, apart from the class list', async () => {
    await setTest("status = 'evaluating', exercise_list_status = 'problem', ces_exercise_list_status = 'problem'");
    await addSubmission(api, code, students[0]!, { status: 'submitted', files: 1 });
    const accepted = await api.request('POST', `/api/admin/tests/${code}/ces/exercise-list/accept`);
    expect(accepted.body).toMatchObject({ exerciseList: { status: 'accepted' }, robot: 'dispatched' });
    expect(await row()).toMatchObject({ ces_exercise_list_status: 'accepted', exercise_list_status: 'problem' });
    await setTest("ces_exercise_list_status = 'failed'");
    const retried = await api.request('POST', `/api/admin/tests/${code}/ces/exercise-list/retry`);
    expect(retried.body).toMatchObject({ exerciseList: { status: 'none', message: null } });
    expect((await api.request('POST', `/api/admin/tests/${code}/ces/exercise-list/retry`)).status).toBe(409);
  });
});

describe('deleting a test', () => {
  it('deletes the CES files too', async () => {
    await putCesFile('test', 'Test adaptat.pdf', 'ces');
    expect((await api.request('DELETE', `/api/admin/tests/${code}`)).status).toBe(200);
    expect(await api.env.FILES.get(`t/1/2026/${code}/ces/test/test-adaptat.pdf`)).toBeNull();
  });
});

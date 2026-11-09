import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCesFiles, addSubmission, addTestFiles, makeClass, makeTest, markCes, ROBOT_KEY, robotRequest, setRobotKey, startTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// Grading a CES paper (spec: CES variant): the paper's variant is fixed when
// it first goes to grading, it is graded with the CES list, and it waits while
// the CES barem is not active.

const RUN = 'run-ces-grading-01';
let api: TestApi;
let robot: ReturnType<typeof robotRequest>;
let code: string;
let testId: number;
let ces: number;
let other: number;
let cesPaper: number;
let classPaper: number;

const CLASS_LIST = { totalPoints: 10, officePoints: 1, exercises: [{ id: 'I.1', label: 'Ex. 1', maxPoints: 9, answer: '1', scoringNotes: '', topic: 'T' }], notes: '' };
const CES_LIST = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [
    { id: 'I.1', label: 'Ex. 1', maxPoints: 5, answer: '1', scoringNotes: '', topic: 'T' },
    { id: 'I.2', label: 'Ex. 2', maxPoints: 4, answer: '2', scoringNotes: '', topic: 'T' },
  ],
  notes: '',
};
const item = (exerciseId: string, points: number) => ({
  exerciseId,
  points,
  studentAnswer: 'r',
  comment: 'Bine.',
  confidence: 'high',
  needsReview: false,
  reviewReason: '',
  page: 1,
});
const grading = (items: ReturnType<typeof item>[]) => ({ items, unreadable: [], summary: 'Bine.', strengths: [], recommendations: ['Exersează.'] });

const setTest = (sql: string, ...params: unknown[]) => api.db.prepare(`UPDATE tests SET ${sql} WHERE id = ?`).bind(...params, testId).run();
const variantOf = async (id: number) =>
  (await api.db.prepare('SELECT variant, status FROM submissions WHERE id = ?').bind(id).first<{ variant: string | null; status: string }>())!;
const claim = async () => (await robot('POST', '/claim', { runId: RUN })).body as { submissionId: number; variant: string; startedAt: string } | '';
const testStatus = async () => (await api.db.prepare('SELECT status, analysis_status FROM tests WHERE id = ?').bind(testId).first<{ status: string; analysis_status: string }>())!;

beforeEach(async () => {
  api = await startTestApi();
  await setRobotKey(api);
  robot = robotRequest(api, ROBOT_KEY);
  const cls = await makeClass(api, '9R2', ['Bursașiu Teodor', 'Ene Ana']);
  [ces, other] = cls.studentIds as [number, number];
  code = await makeTest(api, cls.id);
  testId = await testIdOf(api, code);
  await startTest(api, code);
  await addTestFiles(api, code);
  await addCesFiles(api, code);
  await markCes(api, ces);
  cesPaper = await addSubmission(api, code, ces, { status: 'submitted', files: 1 });
  classPaper = await addSubmission(api, code, other, { status: 'submitted', files: 1 });
  await setTest(
    "status = 'evaluating', exercise_list_status = 'ready', exercise_list_json = ?, ces_exercise_list_status = 'ready', ces_exercise_list_json = ?",
    JSON.stringify(CLASS_LIST),
    JSON.stringify(CES_LIST),
  );
  expect((await robot('POST', '/lease', { runId: RUN })).body.granted).toBe(true);
});

afterEach(async () => {
  await api.dispose();
});

describe('a CES paper', () => {
  it('goes to grading as a CES paper and is saved against the CES list', async () => {
    // Alphabetical: Bursașiu (CES) first.
    const claimed = await claim();
    expect(claimed).toMatchObject({ submissionId: cesPaper, variant: 'ces' });
    expect(await variantOf(cesPaper)).toEqual({ variant: 'ces', status: 'grading' });

    const read = await robot('GET', `/tests/${testId}?variant=ces`);
    expect(read.body.test.exerciseList).toEqual(CES_LIST);

    // A grading made against the class list is refused for a CES paper.
    const wrong = await robot('POST', `/submissions/${cesPaper}/result`, {
      runId: RUN,
      startedAt: (claimed as { startedAt: string }).startedAt,
      ok: true,
      result: grading([item('I.1', 9)]),
      model: 'claude-test',
    });
    expect(wrong.status).toBe(422);
    const saved = await robot('POST', `/submissions/${cesPaper}/result`, {
      runId: RUN,
      startedAt: (claimed as { startedAt: string }).startedAt,
      ok: true,
      result: grading([item('I.1', 5), item('I.2', 3)]),
      model: 'claude-test',
    });
    expect(saved.status).toBe(200);
    const evaluation = await api.db.prepare('SELECT total, max_total, grade FROM evaluations WHERE submission_id = ?').bind(cesPaper).first();
    expect(evaluation).toEqual({ total: 9, max_total: 10, grade: 9 });

    // The class paper goes with the class variant.
    expect(await claim()).toMatchObject({ submissionId: classPaper, variant: 'class' });
  });

  it('waits while the CES barem is not active, and the test stays in evaluation', async () => {
    await setTest('ces_barem_unchecked = 1');
    expect((await robot('GET', '/tasks')).body.pendingGrading).toBe(1);
    expect(await claim()).toMatchObject({ submissionId: classPaper, variant: 'class' });
    const res = await robot('POST', '/claim', { runId: RUN });
    expect(res.status).toBe(204);
    expect(await variantOf(cesPaper)).toEqual({ variant: null, status: 'submitted' });

    await robot('POST', `/submissions/${classPaper}/result`, {
      runId: RUN,
      ok: true,
      result: grading([item('I.1', 8)]),
      model: 'claude-test',
    });
    // The CES paper still waits: no end, no class analysis yet.
    expect(await testStatus()).toEqual({ status: 'evaluating', analysis_status: 'none' });
    const page = await api.request('GET', `/api/admin/tests/${code}`);
    expect(page.body.test.ces).toMatchObject({ waiting: 1, papers: 0 });

    // The teacher checks the CES barem: the paper goes.
    await setTest('ces_barem_unchecked = 0');
    expect(await claim()).toMatchObject({ submissionId: cesPaper, variant: 'ces' });
  });

  it('waits for its CES exercise list, not for the class one', async () => {
    await setTest("ces_exercise_list_status = 'none', ces_exercise_list_json = NULL");
    expect((await robot('GET', '/tasks')).body).toMatchObject({ pendingGrading: 1, cesExerciseLists: [testId] });
    expect(await claim()).toMatchObject({ submissionId: classPaper, variant: 'class' });
    expect((await robot('POST', '/claim', { runId: RUN })).status).toBe(204);
  });

  it('is a class paper when the mark goes before the paper goes to grading', async () => {
    await api.db.prepare('UPDATE students SET ces = 0 WHERE id = ?').bind(ces).run();
    expect(await claim()).toMatchObject({ submissionId: cesPaper, variant: 'class' });
  });

  it('is a class paper when the test has no CES test file', async () => {
    await setTest('ces_test_file_key = NULL');
    expect(await claim()).toMatchObject({ submissionId: cesPaper, variant: 'class' });
  });

  it('keeps its variant through a regrade, whatever happens to the mark', async () => {
    await claim();
    await robot('POST', `/submissions/${cesPaper}/result`, { runId: RUN, ok: true, result: grading([item('I.1', 5), item('I.2', 4)]), model: 'claude-test' });
    await api.db.prepare('UPDATE students SET ces = 0 WHERE id = ?').bind(ces).run();
    const gradedAt = (await api.db.prepare('SELECT created_at FROM evaluations WHERE submission_id = ?').bind(cesPaper).first<{ created_at: string }>())!.created_at;
    const regraded = await api.request('POST', `/api/admin/submissions/${cesPaper}/regrade`, { gradedAt });
    expect(regraded.status).toBe(200);
    expect(await variantOf(cesPaper)).toEqual({ variant: 'ces', status: 'submitted' });
    expect(await claim()).toMatchObject({ submissionId: cesPaper, variant: 'ces' });
    // Its variant blocks the removal of the CES variant.
    expect((await api.request('DELETE', `/api/admin/tests/${code}/ces`)).body.error).toBe('ces_papers');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addEvaluation, addSubmission, addTestFiles, makeClass, makeTest, startTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// The class analysis is asked for only when the teacher has nothing left to
// check or decide.

let api: TestApi;
let code: string;
let submissionId: number;
const GRADED_AT = '2026-10-07T09:00:00.000Z';
const dispatchRobot = vi.fn(async () => false);

const test = () =>
  api.db.prepare('SELECT status, analysis_status FROM tests WHERE code = ?').bind(code).first<{ status: string; analysis_status: string }>();
const itemIds = async () =>
  (await api.db.prepare('SELECT id FROM evaluation_items ORDER BY id').all<{ id: number }>()).results.map((row) => row.id);
const patchItem = (itemId: number) =>
  api.request('PATCH', `/api/admin/submissions/${submissionId}/items/${itemId}`, { gradedAt: GRADED_AT, reviewed: true });

// The robot finished the paper and the test ended: what is left is the teacher's.
async function graded(items: { needsReview?: boolean }[], status: 'evaluating' | 'done') {
  await api.db.prepare("UPDATE submissions SET status = 'graded', graded_at = ? WHERE id = ?").bind(GRADED_AT, submissionId).run();
  await addEvaluation(api, submissionId, { items });
  await api.db.prepare('UPDATE tests SET status = ? WHERE code = ?').bind(status, code).run();
}

beforeEach(async () => {
  dispatchRobot.mockClear();
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '6E2', ['Pop Ion']);
  code = await makeTest(api, cls.id, 'Test');
  await startTest(api, code);
  await addTestFiles(api, code);
  submissionId = await addSubmission(api, code, cls.studentIds[0]!, { files: 1 });
  expect((await api.request('POST', `/api/admin/tests/${code}/evaluate`, {})).status).toBe(200);
});

afterEach(async () => {
  await api.dispose();
});

describe('the class analysis after the checks', () => {
  it('is not asked for when the evaluation starts', async () => {
    expect(await test()).toEqual({ status: 'evaluating', analysis_status: 'none' });
  });

  it('is asked for after the teacher checks the last item, and a finished test goes back to evaluation', async () => {
    await graded([{ needsReview: true }], 'done');
    dispatchRobot.mockClear();
    expect((await patchItem((await itemIds())[0]!)).status).toBe(200);
    expect(await test()).toEqual({ status: 'evaluating', analysis_status: 'requested' });
    expect(dispatchRobot).toHaveBeenCalled();
  });

  it('is not asked for while another item still waits', async () => {
    await graded([{ needsReview: true }, { needsReview: true }], 'done');
    expect((await patchItem((await itemIds())[0]!)).status).toBe(200);
    expect(await test()).toEqual({ status: 'done', analysis_status: 'none' });
  });

  it('is not asked for again when the teacher edits a paper after the analysis is ready', async () => {
    await graded([{}], 'done');
    await api.db.prepare("UPDATE tests SET analysis_status = 'ready' WHERE code = ?").bind(code).run();
    expect((await patchItem((await itemIds())[0]!)).status).toBe(200);
    expect(await test()).toEqual({ status: 'done', analysis_status: 'ready' });
  });

  it('is asked for when the robot finishes the last paper and nothing needs checking', async () => {
    const claimed = await api.db.prepare("UPDATE submissions SET status = 'graded', graded_at = ? WHERE id = ?").bind(GRADED_AT, submissionId).run();
    expect(claimed.success).toBe(true);
    await addEvaluation(api, submissionId, { items: [{}] });
    // Any robot write ends the tests that have nothing left to grade.
    const { askForAnalysis, finishTests } = await import('../db/lifecycle.ts');
    await api.db.batch([askForAnalysis(api.db), finishTests(api.db, GRADED_AT)]);
    expect(await test()).toEqual({ status: 'evaluating', analysis_status: 'requested' });
  });

  it('lets the test end without an analysis when an item waits for the teacher', async () => {
    await api.db.prepare("UPDATE submissions SET status = 'graded', graded_at = ? WHERE id = ?").bind(GRADED_AT, submissionId).run();
    await addEvaluation(api, submissionId, { items: [{ needsReview: true }] });
    const { askForAnalysis, finishTests } = await import('../db/lifecycle.ts');
    await api.db.batch([askForAnalysis(api.db), finishTests(api.db, GRADED_AT)]);
    expect(await test()).toEqual({ status: 'done', analysis_status: 'none' });
  });

  it('drops an old analysis when a regrade sends the test back to evaluation', async () => {
    await graded([{}], 'done');
    await api.db.prepare("UPDATE tests SET analysis_status = 'ready' WHERE code = ?").bind(code).run();
    expect((await api.request('POST', `/api/admin/tests/${code}/regrade`)).status).toBe(200);
    expect(await test()).toEqual({ status: 'evaluating', analysis_status: 'none' });
  });
});

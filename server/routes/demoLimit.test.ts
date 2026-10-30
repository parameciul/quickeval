import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_PAPER_LIMIT } from '../../shared/accounts.ts';
import { addEvaluation, addSubmission, addTestFiles, makeClass, makeTest, startTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// Every test sent to the robot and every paper it grades count, for every
// teacher; a demo account may grade DEMO_PAPER_LIMIT papers. The teacher of
// these tests is a demo account with one paper left.

let api: TestApi;
let classId: number;
let studentIds: number[];

const PAST = '2026-10-06T08:00:00.000Z';
// The time of a grading made by addEvaluation.
const GRADED_AT = '2026-10-07T09:00:00.000Z';

const testsEvaluated = async () =>
  (await api.db.prepare('SELECT tests_evaluated FROM teachers WHERE id = ?').bind(api.teacherId).first<{ tests_evaluated: number }>())!
    .tests_evaluated;
const papersGraded = async () =>
  (await api.db.prepare('SELECT papers_graded FROM teachers WHERE id = ?').bind(api.teacherId).first<{ papers_graded: number }>())!.papers_graded;
const setPapers = (count: number) => api.db.prepare('UPDATE teachers SET papers_graded = ? WHERE id = ?').bind(count, api.teacherId).run();
const statusOf = async (code: string) =>
  (await api.db.prepare('SELECT status FROM tests WHERE code = ?').bind(code).first<{ status: string }>())!.status;
const uploadStatus = async (id: number) =>
  (await api.db.prepare('SELECT status FROM submissions WHERE id = ?').bind(id).first<{ status: string }>())!.status;
const evaluate = (code: string, body: object = {}) => api.request('POST', `/api/admin/tests/${code}/evaluate`, body);

// An open test with its files and one student's uploaded file.
async function readyTest(title: string): Promise<{ code: string; submissionId: number }> {
  const code = await makeTest(api, classId, title);
  await startTest(api, code);
  await addTestFiles(api, code);
  const submissionId = await addSubmission(api, code, studentIds[0]!, { files: 1 });
  return { code, submissionId };
}

beforeEach(async () => {
  api = await startTestApi({ app: { dispatchRobot: vi.fn(async () => false) } });
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Maria', 'Stan Eva', 'Marin Dan']);
  classId = cls.id;
  studentIds = cls.studentIds;
  await api.db
    .prepare("UPDATE teachers SET role = 'teacher', demo = 1, papers_graded = ? WHERE id = ?")
    .bind(DEMO_PAPER_LIMIT - 1, api.teacherId)
    .run();
});

afterEach(async () => {
  vi.useRealTimers();
  await api.dispose();
});

describe('the demo limit', () => {
  it('counts each test sent to evaluation, and refuses one more past the limit', async () => {
    const first = await readyTest('Primul');
    expect((await evaluate(first.code)).status).toBe(200);
    expect(await testsEvaluated()).toBe(1);
    expect((await api.request('GET', '/api/admin/me')).body.teacher).toMatchObject({ demo: true, testsEvaluated: 1, papersGraded: DEMO_PAPER_LIMIT - 1, papersWaiting: 1 });

    // The paper on its way to the robot uses the last place.
    const second = await readyTest('Al doilea');
    const refused = await evaluate(second.code);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe('demo_limit');
    expect(refused.body.message).toContain(`cel mult ${DEMO_PAPER_LIMIT} lucrări`);
    expect(await statusOf(second.code)).toBe('open');
    // The upload stays as the student left it.
    const upload = await api.db.prepare('SELECT status FROM submissions WHERE id = ?').bind(second.submissionId).first<{ status: string }>();
    expect(upload!.status).toBe('uploading');
    expect(await testsEvaluated()).toBe(1);
  });

  // A test that went to the robot once, made done with its uploads graded.
  async function finishedTest(title: string): Promise<{ code: string; submissionId: number }> {
    const test = await readyTest(title);
    expect((await evaluate(test.code)).status).toBe(200);
    await api.db.prepare("UPDATE submissions SET status = 'graded', graded_at = ? WHERE id = ?").bind(PAST, test.submissionId).run();
    await api.db.prepare("UPDATE tests SET status = 'done' WHERE code = ?").bind(test.code).run();
    return test;
  }

  it('counts a reopened test again at its next start, and refuses it past the limit', async () => {
    const first = await finishedTest('Primul');
    expect((await api.request('POST', `/api/admin/tests/${first.code}/reopen`)).status).toBe(200);
    await api.db.prepare("UPDATE submissions SET status = 'uploading', submitted_at = NULL WHERE id = ?").bind(first.submissionId).run();
    expect((await evaluate(first.code)).body.error).toBe('demo_limit');
    expect(await statusOf(first.code)).toBe('open');
    await setPapers(DEMO_PAPER_LIMIT - 1);
    expect((await evaluate(first.code)).status).toBe(200);
    expect(await testsEvaluated()).toBe(2);
  });

  it('counts "Recorectează tot" of a finished test, and refuses it past the limit without touching the results', async () => {
    const test = await finishedTest('Primul');
    const refused = await api.request('POST', `/api/admin/tests/${test.code}/regrade`);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe('demo_limit');
    expect(await statusOf(test.code)).toBe('done');
    expect(await uploadStatus(test.submissionId)).toBe('graded');
    await setPapers(DEMO_PAPER_LIMIT - 1);
    expect((await api.request('POST', `/api/admin/tests/${test.code}/regrade`)).status).toBe(200);
    expect(await statusOf(test.code)).toBe('evaluating');
    expect(await testsEvaluated()).toBe(2);
  });

  it('counts a regrade of a test still in evaluation, and refuses it past the limit, also after "Regenerează"', async () => {
    const test = await finishedTest('Primul');
    // "Regenerează" puts the finished test back in evaluation, for the analysis only.
    expect((await api.request('POST', `/api/admin/tests/${test.code}/analysis/regenerate`)).status).toBe(200);
    expect(await statusOf(test.code)).toBe('evaluating');
    expect((await api.request('POST', `/api/admin/tests/${test.code}/regrade`)).body.error).toBe('demo_limit');
    expect(await uploadStatus(test.submissionId)).toBe('graded');
    expect(await testsEvaluated()).toBe(1);
    await setPapers(DEMO_PAPER_LIMIT - 1);
    expect((await api.request('POST', `/api/admin/tests/${test.code}/regrade`)).status).toBe(200);
    expect(await uploadStatus(test.submissionId)).toBe('submitted');
    expect(await testsEvaluated()).toBe(2);
  });

  it('counts a retry of a test still in evaluation once', async () => {
    await api.db.prepare("UPDATE teachers SET demo = 0 WHERE id = ?").bind(api.teacherId).run();
    const test = await readyTest('Primul');
    await evaluate(test.code);
    const before = await testsEvaluated();
    await api.db.prepare("UPDATE submissions SET status = 'failed' WHERE id = ?").bind(test.submissionId).run();
    const startedAt = (await api.db.prepare('SELECT started_at FROM submissions WHERE id = ?').bind(test.submissionId).first<{ started_at: string }>())!
      .started_at;
    expect((await api.request('POST', `/api/admin/submissions/${test.submissionId}/retry`, { startedAt })).status).toBe(200);
    expect(await testsEvaluated()).toBe(before + 1);
    // A retry of an upload that did not fail changes nothing and counts nothing.
    expect((await api.request('POST', `/api/admin/submissions/${test.submissionId}/retry`, { startedAt })).body.error).toBe('not_failed');
    expect(await testsEvaluated()).toBe(before + 1);
  });

  // "Recorectează" of one upload, with the grading the page shows.
  async function regradeUpload(submissionId: number) {
    const graded = await api.db.prepare('SELECT 1 FROM evaluations WHERE submission_id = ?').bind(submissionId).first();
    if (!graded) await addEvaluation(api, submissionId);
    return api.request('POST', `/api/admin/submissions/${submissionId}/regrade`, { gradedAt: GRADED_AT });
  }

  it('counts a regrade of one upload once, on a finished test and on a test in evaluation', async () => {
    await api.db.prepare('UPDATE teachers SET demo = 0 WHERE id = ?').bind(api.teacherId).run();
    const test = await finishedTest('Primul');
    const before = await testsEvaluated();
    expect((await regradeUpload(test.submissionId)).status).toBe(200);
    expect(await statusOf(test.code)).toBe('evaluating');
    expect(await testsEvaluated()).toBe(before + 1);
    await api.db.prepare("UPDATE submissions SET status = 'graded', graded_at = ? WHERE id = ?").bind(PAST, test.submissionId).run();
    expect((await regradeUpload(test.submissionId)).status).toBe(200);
    expect(await statusOf(test.code)).toBe('evaluating');
    expect(await testsEvaluated()).toBe(before + 2);
  });

  it('counts a regrade of an open test once, at its next start', async () => {
    await api.db.prepare('UPDATE teachers SET demo = 0 WHERE id = ?').bind(api.teacherId).run();
    const test = await finishedTest('Primul');
    const before = await testsEvaluated();
    expect((await api.request('POST', `/api/admin/tests/${test.code}/reopen`)).status).toBe(200);
    expect((await api.request('POST', `/api/admin/tests/${test.code}/regrade`)).status).toBe(200);
    expect(await testsEvaluated()).toBe(before);
    expect((await evaluate(test.code)).status).toBe(200);
    expect(await testsEvaluated()).toBe(before + 1);
  });

  it('keeps the results of an open test at the limit: a regrade that could never run is refused', async () => {
    const test = await finishedTest('Primul');
    expect((await api.request('POST', `/api/admin/tests/${test.code}/reopen`)).status).toBe(200);
    expect((await api.request('POST', `/api/admin/tests/${test.code}/regrade`)).body.error).toBe('demo_limit');
    expect((await regradeUpload(test.submissionId)).body.error).toBe('demo_limit');
    expect(await uploadStatus(test.submissionId)).toBe('graded');
    const evaluations = await api.db.prepare('SELECT COUNT(*) AS n FROM evaluations WHERE submission_id = ?').bind(test.submissionId).first();
    expect(evaluations).toEqual({ n: 1 });
  });

  it('says what really kept a regrade from happening, also at the limit', async () => {
    const test = await finishedTest('Primul');
    await api.db.prepare("UPDATE submissions SET status = 'uploading' WHERE id = ?").bind(test.submissionId).run();
    expect((await api.request('POST', `/api/admin/tests/${test.code}/regrade`)).body.error).toBe('nothing_to_regrade');
    const startedAt = (await api.db.prepare('SELECT started_at FROM submissions WHERE id = ?').bind(test.submissionId).first<{ started_at: string }>())!
      .started_at;
    expect((await api.request('POST', `/api/admin/submissions/${test.submissionId}/retry`, { startedAt })).body.error).toBe('not_failed');
  });

  it('refuses a retry that sends a finished test back past the limit', async () => {
    const test = await finishedTest('Primul');
    await api.db.prepare("UPDATE submissions SET status = 'failed' WHERE id = ?").bind(test.submissionId).run();
    const startedAt = (await api.db.prepare('SELECT started_at FROM submissions WHERE id = ?').bind(test.submissionId).first<{ started_at: string }>())!
      .started_at;
    const refused = await api.request('POST', `/api/admin/submissions/${test.submissionId}/retry`, { startedAt });
    expect(refused.body.error).toBe('demo_limit');
    expect(await uploadStatus(test.submissionId)).toBe('failed');
    expect(await statusOf(test.code)).toBe('done');
  });

  it('does not count "Regenerează", which only asks for the class analysis', async () => {
    const test = await finishedTest('Primul');
    expect((await api.request('POST', `/api/admin/tests/${test.code}/analysis/regenerate`)).status).toBe(200);
    expect(await statusOf(test.code)).toBe('evaluating');
    expect(await testsEvaluated()).toBe(1);
    expect(await papersGraded()).toBe(DEMO_PAPER_LIMIT);
  });

  it('does not count a scheduled test that nobody uploaded to', async () => {
    const code = await makeTest(api, classId, 'Gol');
    await startTest(api, code);
    await addTestFiles(api, code);
    await api.db.prepare('UPDATE tests SET evaluation_at = ? WHERE code = ?').bind(PAST, code).run();
    await api.request('GET', '/api/admin/me');
    expect(await statusOf(code)).toBe('done');
    expect(await testsEvaluated()).toBe(0);
  });

  it('counts the evaluations of administrators and complete accounts too, without a limit', async () => {
    await api.db.prepare("UPDATE teachers SET role = 'admin', demo = 0, tests_evaluated = 50, papers_graded = 900 WHERE id = ?").bind(api.teacherId).run();
    const test = await finishedTest('Primul');
    expect(await testsEvaluated()).toBe(51);
    expect((await api.request('POST', `/api/admin/tests/${test.code}/regrade`)).status).toBe(200);
    expect(await testsEvaluated()).toBe(52);
    expect(await papersGraded()).toBe(901);
  });

  it('starts only the earliest of several scheduled tests that come due at once', async () => {
    const tests = [await readyTest('Primul'), await readyTest('Al doilea'), await readyTest('Al treilea')];
    // The same time for the first two (the lower id goes first), an earlier one for the third.
    await api.db.prepare('UPDATE tests SET evaluation_at = ? WHERE code IN (?, ?)').bind(PAST, tests[0]!.code, tests[1]!.code).run();
    await api.db.prepare('UPDATE tests SET evaluation_at = ? WHERE code = ?').bind('2026-10-05T08:00:00.000Z', tests[2]!.code).run();
    await api.request('GET', '/api/admin/me');
    expect(await Promise.all(tests.map((test) => statusOf(test.code)))).toEqual(['open', 'open', 'evaluating']);
    expect(await testsEvaluated()).toBe(1);
    // With one more paper allowed, the next earliest starts.
    await setPapers(DEMO_PAPER_LIMIT - 2);
    await api.request('GET', '/api/admin/me');
    expect(await Promise.all(tests.map((test) => statusOf(test.code)))).toEqual(['evaluating', 'open', 'evaluating']);
  });

  it('still counts a test that was deleted after its evaluation', async () => {
    const first = await readyTest('Primul');
    await evaluate(first.code);
    await api.db.prepare("UPDATE submissions SET status = 'graded'").run();
    await api.request('GET', '/api/admin/me');
    expect((await api.request('DELETE', `/api/admin/tests/${first.code}`)).status).toBe(200);
    const second = await readyTest('Al doilea');
    expect((await evaluate(second.code)).body.error).toBe('demo_limit');
  });

  it('refuses the evaluation of selected uploads past the limit', async () => {
    await setPapers(DEMO_PAPER_LIMIT);
    const test = await readyTest('Primul');
    const res = await evaluate(test.code, { submissionIds: [test.submissionId] });
    expect(res.body.error).toBe('demo_limit');
    expect(await statusOf(test.code)).toBe('open');
  });

  it('refuses to schedule an evaluation past the limit', async () => {
    await setPapers(DEMO_PAPER_LIMIT);
    const test = await readyTest('Primul');
    const res = await evaluate(test.code, { at: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    expect(res.body.error).toBe('demo_limit');
  });

  it('keeps a scheduled test open when its time comes past the limit', async () => {
    const test = await readyTest('Primul');
    const other = await readyTest('Al doilea');
    await api.db.prepare('UPDATE tests SET evaluation_at = ? WHERE code IN (?, ?)').bind(PAST, test.code, other.code).run();
    await api.db.prepare('UPDATE submissions SET status = ? WHERE id = ?').bind('submitted', other.submissionId).run();
    await evaluate(test.code);
    await api.request('GET', '/api/admin/me');
    expect(await statusOf(test.code)).toBe('evaluating');
    expect(await statusOf(other.code)).toBe('open');
    expect(await uploadStatus(other.submissionId)).toBe('submitted');
    expect(await testsEvaluated()).toBe(1);
  });

  // An open test with one uploaded file from each of the first students.
  async function testWithPapers(title: string, count: number): Promise<{ code: string; ids: number[] }> {
    const code = await makeTest(api, classId, title);
    await startTest(api, code);
    await addTestFiles(api, code);
    const ids: number[] = [];
    for (const studentId of studentIds.slice(0, count)) ids.push(await addSubmission(api, code, studentId, { files: 1 }));
    return { code, ids };
  }
  const statuses = (ids: number[]) => Promise.all(ids.map(uploadStatus));

  it('sends only the papers left, and the rest stay out of the evaluation', async () => {
    await setPapers(DEMO_PAPER_LIMIT - 2);
    const test = await testWithPapers('Primul', 4);
    expect((await evaluate(test.code)).status).toBe(200);
    expect(await statusOf(test.code)).toBe('evaluating');
    expect(await statuses(test.ids)).toEqual(['submitted', 'submitted', 'uploading', 'uploading']);
    expect(await testsEvaluated()).toBe(1);
  });

  it('sends the papers the students confirmed first', async () => {
    await setPapers(DEMO_PAPER_LIMIT - 2);
    const test = await testWithPapers('Primul', 4);
    await api.db.prepare("UPDATE submissions SET status = 'submitted', submitted_at = ? WHERE id IN (?, ?, ?)").bind(PAST, test.ids[1], test.ids[2], test.ids[3]).run();
    expect((await evaluate(test.code)).status).toBe(200);
    expect(await statuses(test.ids)).toEqual(['uploading', 'submitted', 'submitted', 'uploading']);
    const held = await api.db.prepare('SELECT submitted_at FROM submissions WHERE id = ?').bind(test.ids[3]).first<{ submitted_at: string | null }>();
    expect(held!.submitted_at).toBeNull();
  });

  it('sends only the first selected papers the limit allows', async () => {
    await setPapers(DEMO_PAPER_LIMIT - 1);
    const test = await testWithPapers('Primul', 3);
    expect((await evaluate(test.code, { submissionIds: [test.ids[1], test.ids[2]] })).status).toBe(200);
    expect(await statuses(test.ids)).toEqual(['uploading', 'submitted', 'uploading']);
  });

  it('shares the papers left between scheduled tests that come due at once, in order', async () => {
    await setPapers(DEMO_PAPER_LIMIT - 3);
    const first = await testWithPapers('Primul', 2);
    const second = await testWithPapers('Al doilea', 3);
    const third = await testWithPapers('Al treilea', 1);
    await api.db.prepare("UPDATE submissions SET status = 'submitted', submitted_at = ? WHERE id = ?").bind(PAST, third.ids[0]).run();
    await api.db.prepare('UPDATE tests SET evaluation_at = ? WHERE code IN (?, ?, ?)').bind(PAST, first.code, second.code, third.code).run();
    await api.request('GET', '/api/admin/me');
    expect(await statuses(first.ids)).toEqual(['submitted', 'submitted']);
    expect(await statuses(second.ids)).toEqual(['submitted', 'uploading', 'uploading']);
    expect(await statusOf(second.code)).toBe('evaluating');
    // No place left: the test stays open, as its students left it.
    expect(await statusOf(third.code)).toBe('open');
    expect(await statuses(third.ids)).toEqual(['submitted']);
  });

  it('keeps the papers past the limit graded in "Recorectează tot"', async () => {
    await setPapers(0);
    const test = await testWithPapers('Primul', 3);
    await evaluate(test.code);
    for (const id of test.ids) {
      await api.db.prepare("UPDATE submissions SET status = 'graded', graded_at = ? WHERE id = ?").bind(PAST, id).run();
      await addEvaluation(api, id);
    }
    await api.db.prepare("UPDATE tests SET status = 'done' WHERE code = ?").bind(test.code).run();
    await setPapers(DEMO_PAPER_LIMIT - 2);
    const regraded = await api.request('POST', `/api/admin/tests/${test.code}/regrade`);
    expect(regraded.body.count).toBe(2);
    expect(await statuses(test.ids)).toEqual(['submitted', 'submitted', 'graded']);
    const kept = await api.db.prepare('SELECT COUNT(*) AS n FROM evaluations WHERE submission_id = ?').bind(test.ids[2]).first();
    expect(kept).toEqual({ n: 1 });
    const gone = await api.db.prepare('SELECT COUNT(*) AS n FROM evaluations WHERE submission_id = ?').bind(test.ids[0]).first();
    expect(gone).toEqual({ n: 0 });
  });

  it('sends the failed papers first in "Recorectează tot"', async () => {
    await setPapers(0);
    const test = await testWithPapers('Primul', 2);
    await evaluate(test.code);
    await api.db.prepare("UPDATE submissions SET status = 'graded', graded_at = ? WHERE id = ?").bind(PAST, test.ids[0]).run();
    await api.db.prepare("UPDATE submissions SET status = 'failed' WHERE id = ?").bind(test.ids[1]).run();
    await api.db.prepare("UPDATE tests SET status = 'done' WHERE code = ?").bind(test.code).run();
    await setPapers(DEMO_PAPER_LIMIT - 1);
    expect((await api.request('POST', `/api/admin/tests/${test.code}/regrade`)).body.count).toBe(1);
    expect(await statuses(test.ids)).toEqual(['graded', 'submitted']);
  });

  it('counts a paper when the robot finishes it, and a regrade as one more', async () => {
    await setPapers(0);
    const test = await testWithPapers('Primul', 1);
    await evaluate(test.code);
    expect(await papersGraded()).toBe(0);
    await api.db.prepare("UPDATE submissions SET status = 'grading' WHERE id = ?").bind(test.ids[0]).run();
    expect(await papersGraded()).toBe(0);
    await api.db.prepare("UPDATE submissions SET status = 'graded', graded_at = ? WHERE id = ?").bind(PAST, test.ids[0]).run();
    expect(await papersGraded()).toBe(1);
    expect((await regradeUpload(test.ids[0]!)).status).toBe(200);
    await api.db.prepare("UPDATE submissions SET status = 'graded', graded_at = ? WHERE id = ?").bind(PAST, test.ids[0]).run();
    expect(await papersGraded()).toBe(2);
  });

  it('does not count a paper whose grading failed', async () => {
    await setPapers(0);
    const test = await testWithPapers('Primul', 1);
    await evaluate(test.code);
    await api.db.prepare("UPDATE submissions SET status = 'failed' WHERE id = ?").bind(test.ids[0]).run();
    expect(await papersGraded()).toBe(0);
  });

  it('counts the papers of an open test that wait, so a regrade cannot lose results', async () => {
    const test = await testWithPapers('Primul', 2);
    await api.db.prepare("UPDATE submissions SET status = 'graded', graded_at = ? WHERE id = ?").bind(PAST, test.ids[0]).run();
    await addEvaluation(api, test.ids[0]!);
    await api.db.prepare("UPDATE submissions SET status = 'submitted', submitted_at = ? WHERE id = ?").bind(PAST, test.ids[1]).run();
    await setPapers(DEMO_PAPER_LIMIT - 1);
    expect((await regradeUpload(test.ids[0]!)).body.error).toBe('demo_limit');
    expect(await uploadStatus(test.ids[0]!)).toBe('graded');
  });

  it('does not limit a complete account', async () => {
    await api.db.prepare('UPDATE teachers SET demo = 0, tests_evaluated = 50, papers_graded = 900 WHERE id = ?').bind(api.teacherId).run();
    const test = await readyTest('Primul');
    expect((await evaluate(test.code)).status).toBe(200);
    expect(await testsEvaluated()).toBe(51);
  });

  it('sends every paper of a complete account', async () => {
    await api.db.prepare('UPDATE teachers SET demo = 0, papers_graded = 900 WHERE id = ?').bind(api.teacherId).run();
    const test = await testWithPapers('Primul', 4);
    expect((await evaluate(test.code)).status).toBe(200);
    expect(await statuses(test.ids)).toEqual(['submitted', 'submitted', 'submitted', 'submitted']);
  });
});

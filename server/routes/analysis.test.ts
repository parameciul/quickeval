import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExerciseList } from '../../shared/schemas.ts';
import {
  addEvaluation,
  addSubmission,
  addTestFiles,
  makeClass,
  makeTest,
  otherTeacherTest,
  robotRequest,
  setRobotKey,
  startTest,
  testIdOf,
} from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let robot: ReturnType<typeof robotRequest>;
let code: string;
let testId: number;
let studentIds: number[];

const RUN = 'run-0001';

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [
    { id: 'E1', label: 'Exercițiul 1', maxPoints: 4.5, answer: '3/4', scoringNotes: 'Pas 1: 1p', topic: 'Fracții' },
    { id: 'E2', label: 'Exercițiul 2', maxPoints: 4.5, answer: 'x = 2', scoringNotes: '', topic: 'Ecuații' },
  ],
  notes: '',
};

const ANALYSIS = {
  overview: 'Clasa a lucrat bine la fracții.',
  strengths: ['Fracții'],
  weaknesses: ['Ecuații'],
  commonMistakes: ['Semnul la mutarea termenilor.'],
  recommendations: ['Exersați ecuațiile.'],
};

const testRow = () =>
  api.db
    .prepare('SELECT status, analysis_status, analysis_stale, analysis_attempts, analysis_json FROM tests WHERE id = ?')
    .bind(testId)
    .first<{ status: string; analysis_status: string; analysis_stale: number; analysis_attempts: number; analysis_json: string | null }>();
const setTest = (sql: string) => api.db.prepare(`UPDATE tests SET ${sql} WHERE id = ?`).bind(testId).run();

async function graded(index: number, grade = 9): Promise<number> {
  const id = await addSubmission(api, code, studentIds[index]!, { status: 'graded', files: 1 });
  await api.db.prepare("UPDATE submissions SET graded_at = ? WHERE id = ?").bind(`2026-10-07T09:0${index}:00.000Z`, id).run();
  await addEvaluation(api, id, { grade, items: [{}, {}] });
  return id;
}

const saveAnalysis = (version: string, runId = RUN) =>
  robot('POST', `/tests/${testId}/analysis`, { runId, ok: true, version, analysis: ANALYSIS });
const resultsVersion = async () => (await robot('GET', `/tests/${testId}/results`)).body.results.version as string;

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => false);
  api = await startTestApi({ app: { dispatchRobot } });
  await setRobotKey(api);
  robot = robotRequest(api);
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva']);
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
  testId = await testIdOf(api, code);
  await startTest(api, code);
  await addTestFiles(api, code);
  await setTest(`status = 'evaluating', exercise_list_status = 'ready', analysis_status = 'requested', exercise_list_json = '${JSON.stringify(LIST)}'`);
  await robot('POST', '/lease', { runId: RUN });
});

afterEach(async () => {
  vi.useRealTimers();
  await api.dispose();
});

describe('GET /api/runner/tests/:id/results', () => {
  it('gives the graded class without names, in grading order, with the final points', async () => {
    const first = await graded(0, 8);
    await graded(1, 6);
    await addSubmission(api, code, studentIds[2]!, { status: 'failed', files: 1 });
    await api.db.prepare("UPDATE evaluation_items SET points = 0.5, comment = 'Corectat.' WHERE evaluation_id = (SELECT id FROM evaluations WHERE submission_id = ?) AND exercise_id = 'E2'").bind(first).run();
    const res = await robot('GET', `/tests/${testId}/results`);
    expect(res.status).toBe(200);
    const { results } = res.body;
    expect(results).toMatchObject({ testId, maxTotal: 10, officePoints: 1 });
    expect(results.exercises).toEqual([
      { id: 'E1', label: 'Exercițiul 1', maxPoints: 4.5, topic: 'Fracții', answer: '3/4', scoringNotes: 'Pas 1: 1p' },
      { id: 'E2', label: 'Exercițiul 2', maxPoints: 4.5, topic: 'Ecuații', answer: 'x = 2', scoringNotes: '' },
    ]);
    expect(results.students).toHaveLength(2);
    expect(results.students[0]).toMatchObject({ label: 'Elev 1', grade: 8 });
    expect(results.students[0].items).toEqual([
      { exerciseId: 'E1', points: 1, studentAnswer: 'r', comment: 'c' },
      { exerciseId: 'E2', points: 0.5, studentAnswer: 'r', comment: 'Corectat.' },
    ]);
    expect(results.students[1].label).toBe('Elev 2');
    expect(JSON.stringify(res.body)).not.toMatch(/Pop|Ionescu|Stan|poza/);
  });

  it('still gives the exercises and the maximum after the exercise list was cleared', async () => {
    await graded(0, 8);
    await setTest('exercise_list_json = NULL');
    const res = await robot('GET', `/tests/${testId}/results`);
    expect(res.status).toBe(200);
    expect(res.body.results).toMatchObject({ maxTotal: 10, officePoints: 1 });
    expect(res.body.results.exercises).toEqual([
      { id: 'E1', label: 'Exercițiu', maxPoints: 1, topic: '', answer: '', scoringNotes: '' },
      { id: 'E2', label: 'Exercițiu', maxPoints: 1, topic: '', answer: '', scoringNotes: '' },
    ]);
    expect(res.body.results.students[0].items).toHaveLength(2);
  });

  it('answers 404 for a test that is not in evaluation', async () => {
    await graded(0);
    await setTest("status = 'done'");
    expect((await robot('GET', `/tests/${testId}/results`)).status).toBe(404);
    expect((await robot('GET', '/tests/99999/results')).status).toBe(404);
  });

  it('answers 401 without the robot key', async () => {
    const res = await api.request('GET', `/api/runner/tests/${testId}/results`);
    expect(res.status).toBe(401);
  });

  it('changes its version when a grade is corrected', async () => {
    const id = await graded(0);
    const before = await resultsVersion();
    const evaluation = await api.db.prepare('SELECT id FROM evaluations WHERE submission_id = ?').bind(id).first<{ id: number }>();
    await api.db.prepare("UPDATE evaluations SET updated_at = '2026-10-08T10:00:00.000Z' WHERE id = ?").bind(evaluation!.id).run();
    expect(await resultsVersion()).not.toBe(before);
    await graded(1);
    expect(await resultsVersion()).toMatch(/^2:/);
  });
});

describe('the work the robot is told about', () => {
  it('counts an analysis only for a test with a graded upload and no upload left to grade', async () => {
    expect((await robot('GET', '/tasks')).body.analyses).toEqual([]);
    await graded(0);
    expect((await robot('GET', '/tasks')).body.analyses).toEqual([testId]);
    expect((await robot('POST', '/check')).body).toMatchObject({ hasWork: true, analyses: 1 });
    await addSubmission(api, code, studentIds[1]!, { status: 'submitted', files: 1 });
    expect((await robot('GET', '/tasks')).body.analyses).toEqual([]);
  });
});

describe('a check of a test that has nothing graded', () => {
  it('ends the test without an analysis', async () => {
    await addSubmission(api, code, studentIds[0]!, { status: 'failed', files: 1 });
    expect((await robot('POST', '/check')).body).toMatchObject({ hasWork: false, analyses: 0 });
    expect(await testRow()).toMatchObject({ status: 'done', analysis_status: 'none' });
  });
});

describe('POST /api/runner/tests/:id/analysis', () => {
  it('saves the analysis, ends the test, and keeps it fresh when the grades did not change', async () => {
    await graded(0);
    const res = await saveAnalysis(await resultsVersion());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
    const row = await testRow();
    expect(row).toMatchObject({ status: 'done', analysis_status: 'ready', analysis_stale: 0 });
    expect(JSON.parse(row!.analysis_json!)).toEqual(ANALYSIS);
  });

  it('keeps the model and effort of the analysis, and shows them on Setări', async () => {
    await graded(0);
    const version = await resultsVersion();
    const res = await robot('POST', `/tests/${testId}/analysis`, { runId: RUN, ok: true, version, analysis: ANALYSIS, model: 'claude-opus', effort: 'high' });
    expect(res.status).toBe(200);
    const detail = await api.request('GET', '/api/admin/settings');
    expect(detail.body.settings.lastModels).toMatchObject({ analysisModel: 'claude-opus', analysisEffort: 'high' });
  });

  describe('the model of the last analysis kept for Setări', () => {
    const kept = async () => {
      const rows = await api.db.prepare("SELECT key, value FROM settings WHERE key LIKE 'last_analysis_%' ORDER BY key").all<{ key: string; value: string }>();
      return Object.fromEntries(rows.results.map((row) => [row.key, row.value]));
    };
    const sendWith = (version: string, extra: object, runId = RUN) =>
      robot('POST', `/tests/${testId}/analysis`, { runId, ok: true, version, analysis: ANALYSIS, ...extra });

    it('follows the last analysis save and drops the effort when there is none', async () => {
      await graded(0);
      expect((await sendWith(await resultsVersion(), { model: 'first', effort: 'high' })).status).toBe(200);
      expect(await kept()).toEqual({ last_analysis_model: 'first', last_analysis_effort: 'high' });
      await setTest("status = 'evaluating', analysis_status = 'requested'");
      expect((await sendWith(await resultsVersion(), { model: 'second' })).status).toBe(200);
      expect(await kept()).toEqual({ last_analysis_model: 'second' });
    });

    it('is not moved by a test that was only touched, and stays after a refused save', async () => {
      await graded(0);
      await sendWith(await resultsVersion(), { model: 'real', effort: 'low' });
      const foreign = await otherTeacherTest(api);
      await api.db
        .prepare("UPDATE tests SET analysis_model = 'touched', analysis_effort = 'max', updated_at = '2099-01-01T00:00:00.000Z' WHERE code = ?")
        .bind(foreign.code)
        .run();
      await setTest("updated_at = '2098-01-01T00:00:00.000Z', analysis_model = 'touched-too'");
      let settings = await api.request('GET', '/api/admin/settings');
      expect(settings.body.settings.lastModels).toMatchObject({ analysisModel: 'real', analysisEffort: 'low' });

      await setTest("status = 'evaluating', analysis_status = 'requested'");
      const stale = await sendWith('1:x', { model: 'lost', effort: 'max' }, 'run-0002');
      expect(stale.body.error).toBe('lease_lost');
      await addSubmission(api, code, studentIds[1]!, { status: 'submitted', files: 1 });
      const notNeeded = await sendWith(await resultsVersion(), { model: 'not-needed', effort: 'max' });
      expect(notNeeded.body.error).toBe('not_needed');
      expect(await kept()).toEqual({ last_analysis_model: 'real', last_analysis_effort: 'low' });
      settings = await api.request('GET', '/api/admin/settings');
      expect(settings.body.settings.lastModels).toMatchObject({ analysisModel: 'real', analysisEffort: 'low' });
    });

    it('falls back to the latest analysed test when no key exists', async () => {
      await graded(0);
      await sendWith(await resultsVersion(), { model: 'row-model', effort: 'medium' });
      await api.db.prepare("DELETE FROM settings WHERE key LIKE 'last_analysis_%'").run();
      const settings = await api.request('GET', '/api/admin/settings');
      expect(settings.body.settings.lastModels).toMatchObject({ analysisModel: 'row-model', analysisEffort: 'medium' });
    });
  });

  it('saves an analysis of an older robot with no model or effort', async () => {
    await graded(0);
    expect((await saveAnalysis(await resultsVersion())).status).toBe(200);
    const detail = await api.request('GET', '/api/admin/settings');
    expect(detail.body.settings.lastModels).toMatchObject({ analysisModel: null, analysisEffort: null });
  });

  it('saves it as out of date when a grade changed after the robot read the results', async () => {
    const id = await graded(0);
    const version = await resultsVersion();
    await api.db.prepare("UPDATE evaluations SET updated_at = '2026-10-08T10:00:00.000Z' WHERE submission_id = ?").bind(id).run();
    expect((await saveAnalysis(version)).status).toBe(200);
    expect(await testRow()).toMatchObject({ analysis_status: 'ready', analysis_stale: 1 });
  });

  it('refuses it while an upload waits for grading, and keeps the analysis requested', async () => {
    await graded(0);
    const version = await resultsVersion();
    await addSubmission(api, code, studentIds[1]!, { status: 'submitted', files: 1 });
    const res = await saveAnalysis(version);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('not_needed');
    expect(await testRow()).toMatchObject({ status: 'evaluating', analysis_status: 'requested' });
  });

  it('refuses a robot that does not hold the lease', async () => {
    await graded(0);
    const res = await saveAnalysis('1:x', 'run-0002');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('lease_lost');
    expect(await testRow()).toMatchObject({ analysis_status: 'requested', analysis_json: null });
  });

  it('refuses it when the analysis is no longer requested', async () => {
    await graded(0);
    await setTest("analysis_status = 'ready'");
    const res = await saveAnalysis('1:x');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('not_needed');
  });

  it('answers 404 for a deleted test', async () => {
    const res = await robot('POST', '/tests/99999/analysis', { runId: RUN, ok: true, version: 'x', analysis: ANALYSIS });
    expect(res.status).toBe(404);
  });

  it('refuses an analysis the checks cannot use', async () => {
    await graded(0);
    for (const analysis of [{ overview: '   ', strengths: [], weaknesses: [], commonMistakes: [], recommendations: [] }, { overview: 'x' }, 'text']) {
      const res = await robot('POST', `/tests/${testId}/analysis`, { runId: RUN, ok: true, version: '1:x', analysis });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('invalid_result');
    }
    expect(await testRow()).toMatchObject({ analysis_status: 'requested' });
  });

  it('cuts long lists and texts instead of refusing the analysis', async () => {
    await graded(0);
    const long = {
      overview: 'a'.repeat(5000),
      strengths: Array.from({ length: 20 }, (_, index) => `punct ${index}`),
      weaknesses: [],
      commonMistakes: ['b'.repeat(900)],
      recommendations: [],
    };
    const res = await robot('POST', `/tests/${testId}/analysis`, { runId: RUN, ok: true, version: await resultsVersion(), analysis: long });
    expect(res.status).toBe(200);
    const saved = JSON.parse((await testRow())!.analysis_json!);
    expect(saved.overview.length).toBeLessThanOrEqual(2000);
    expect(saved.strengths).toHaveLength(8);
    expect(saved.commonMistakes[0].length).toBeLessThanOrEqual(300);
  });

  it('counts a failed attempt, tries again, and fails the analysis at the third attempt while the test ends', async () => {
    await graded(0);
    const fail = (error = 'crash') => robot('POST', `/tests/${testId}/analysis`, { runId: RUN, ok: false, error });
    const first = await fail();
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ status: 'requested' });
    expect(await testRow()).toMatchObject({ status: 'evaluating', analysis_status: 'requested', analysis_attempts: 1 });
    await fail('usage_limit');
    expect(await testRow()).toMatchObject({ analysis_attempts: 1 });
    await fail('timeout');
    expect((await fail('invalid_output')).body).toEqual({ status: 'failed' });
    expect(await testRow()).toMatchObject({ status: 'done', analysis_status: 'failed', analysis_attempts: 3 });
  });
});

describe('POST /api/admin/tests/:code/analysis/regenerate', () => {
  const regenerate = (target = code) => api.request('POST', `/api/admin/tests/${target}/analysis/regenerate`);

  it('asks again for the analysis of a finished test, takes it back to evaluation, and starts the robot', async () => {
    await graded(0);
    await setTest("status = 'done', analysis_status = 'ready', analysis_stale = 1, analysis_attempts = 2");
    dispatchRobot.mockResolvedValueOnce(true);
    const res = await regenerate();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ analysis: { status: 'requested', stale: true, attempts: 0 }, robot: 'dispatched' });
    expect(await testRow()).toMatchObject({ status: 'evaluating', analysis_status: 'requested', analysis_attempts: 0 });
  });

  it('makes the first analysis of a test that was graded before analyses existed', async () => {
    await graded(0);
    await setTest("status = 'done', analysis_status = 'none'");
    const res = await regenerate();
    expect(res.status).toBe(200);
    expect(res.body.analysis.status).toBe('requested');
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('shows the analysis state in the test detail', async () => {
    await graded(0);
    await setTest("status = 'done', analysis_status = 'ready', analysis_stale = 1");
    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.test.analysis).toEqual({ status: 'ready', stale: true, attempts: 0 });
  });

  it('refuses a test that is open or has nothing graded', async () => {
    await setTest("status = 'open'");
    expect((await regenerate()).body.error).toBe('not_evaluated');
    await setTest("status = 'done'");
    const res = await regenerate();
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('no_results');
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('answers 404 for a test of another teacher and changes nothing', async () => {
    const foreign = await otherTeacherTest(api);
    expect((await regenerate(foreign.code)).status).toBe(404);
  });

  it('is counted as work for "Pornește robotul"', async () => {
    await graded(0);
    await api.db.prepare("UPDATE runner_state SET run_id = NULL").run();
    const res = await api.request('POST', `/api/admin/tests/${code}/robot`);
    expect(res.status).toBe(200);
  });
});

describe('a test with nothing to analyze', () => {
  it('ends without waiting for an analysis when its only upload fails for good', async () => {
    const id = await addSubmission(api, code, studentIds[0]!, { status: 'grading', files: 1 });
    await api.db.prepare("UPDATE submissions SET run_id = ?, attempts = 2 WHERE id = ?").bind(RUN, id).run();
    const res = await robot('POST', `/submissions/${id}/result`, { runId: RUN, ok: false, error: 'crash' });
    expect(res.status).toBe(200);
    expect(await testRow()).toMatchObject({ status: 'done', analysis_status: 'none' });
  });
});

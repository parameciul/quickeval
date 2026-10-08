import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExerciseList } from '../../shared/schemas.ts';
import { addSubmission, addTestFiles, makeClass, makeTest, ROBOT_KEY, robotRequest, setRobotKey, startTest, testIdOf } from '../test/fixtures.ts';
import { sha256Hex } from '../secrets.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let robot: ReturnType<typeof robotRequest>;
let code: string;
let testId: number;
let studentIds: number[];

const RUN = 'run-0001';
const OTHER_RUN = 'run-0002';

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [
    { id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 4.5, answer: '3/4', scoringNotes: '', topic: 'Fracții' },
    { id: 'II.1', label: 'Subiectul II, exercițiul 1', maxPoints: 4.5, answer: 'x = 2', scoringNotes: '', topic: 'Ecuații' },
  ],
  notes: '',
};

function result(points: [number, number], extra: object = {}) {
  return {
    items: [
      { exerciseId: 'I.1', points: points[0], studentAnswer: '3/4', comment: 'Corect.', confidence: 'high', needsReview: false, reviewReason: '' },
      { exerciseId: 'II.1', points: points[1], studentAnswer: 'x = 3', comment: 'Verifică semnul.', confidence: 'low', needsReview: false, reviewReason: '' },
    ],
    unreadable: [],
    summary: 'Ai lucrat bine.',
    strengths: ['Fracții'],
    recommendations: ['Exersează ecuațiile.'],
    ...extra,
  };
}

const uploadRow = (id: number) =>
  api.db.prepare('SELECT status, run_id, attempts, last_error, graded_at FROM submissions WHERE id = ?').bind(id).first<{
    status: string;
    run_id: string | null;
    attempts: number;
    last_error: string | null;
    graded_at: string | null;
  }>();
const testStatus = async () =>
  (await api.db.prepare('SELECT status FROM tests WHERE id = ?').bind(testId).first<{ status: string }>())?.status;
const claim = (runId = RUN) => robot('POST', '/claim', { runId });
const sendResult = (id: number, body: object) => robot('POST', `/submissions/${id}/result`, { runId: RUN, ...body });

async function upload(index: number, submittedAt: string, files = 1): Promise<number> {
  const id = await addSubmission(api, code, studentIds[index]!, { status: 'submitted', files });
  await api.db.prepare('UPDATE submissions SET submitted_at = ? WHERE id = ?').bind(submittedAt, id).run();
  return id;
}

beforeEach(async () => {
  api = await startTestApi();
  await setRobotKey(api);
  robot = robotRequest(api);
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva']);
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
  testId = await testIdOf(api, code);
  await startTest(api, code);
  await addTestFiles(api, code);
  await api.db
    .prepare("UPDATE tests SET status = 'evaluating', exercise_list_status = 'ready', exercise_list_json = ? WHERE id = ?")
    .bind(JSON.stringify(LIST), testId)
    .run();
  await robot('POST', '/lease', { runId: RUN });
});

afterEach(async () => {
  await api.dispose();
});

describe('POST /api/runner/claim', () => {
  it('takes the oldest upload and gives its files in upload order, without names', async () => {
    await upload(0, '2026-10-07T08:20:00.000Z');
    const oldest = await upload(1, '2026-10-07T08:10:00.000Z', 2);
    const res = await claim();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      submissionId: oldest,
      testId,
      files: [
        { id: expect.any(Number), contentType: 'image/jpeg', position: 1 },
        { id: expect.any(Number), contentType: 'image/jpeg', position: 2 },
      ],
    });
    expect(JSON.stringify(res.body)).not.toMatch(/Ionescu|poza/);
    expect(await uploadRow(oldest)).toMatchObject({ status: 'grading', run_id: RUN });
  });

  it('never gives one upload to two parallel claims', async () => {
    const ids = [await upload(0, '2026-10-07T08:10:00.000Z'), await upload(1, '2026-10-07T08:11:00.000Z')];
    const answers = await Promise.all([claim(), claim(), claim()]);
    const claimed = answers.filter((res) => res.status === 200).map((res) => res.body.submissionId);
    expect(claimed.sort()).toEqual(ids.sort());
    expect(answers.filter((res) => res.status === 204)).toHaveLength(1);
  });

  it('takes an upload whose grading failed only after the others', async () => {
    const failing = await upload(0, '2026-10-07T08:10:00.000Z');
    const later = await upload(1, '2026-10-07T08:20:00.000Z');
    expect((await claim()).body.submissionId).toBe(failing);
    await sendResult(failing, { ok: false, error: 'crash' });
    expect((await claim()).body.submissionId).toBe(later);
    expect((await claim()).body.submissionId).toBe(failing);
  });

  it('answers 204 when nothing can be graded', async () => {
    await upload(0, '2026-10-07T08:10:00.000Z');
    await api.db.prepare("UPDATE tests SET exercise_list_status = 'problem' WHERE id = ?").bind(testId).run();
    const res = await claim();
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it('refuses a run without the lease', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    const res = await claim(OTHER_RUN);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('lease_lost');
    expect(await uploadRow(id)).toMatchObject({ status: 'submitted', run_id: null });
  });
});

describe('GET /api/runner/submissions/:id/files/:fileId', () => {
  it("streams a student's page without its name", async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    await api.env.FILES.put(`fixture/${id}/1.jpg`, 'page one');
    const { files } = (await claim()).body;
    const res = await api.fetch(`/api/runner/submissions/${id}/files/${files[0].id}`, { headers: { Authorization: `Bearer ${ROBOT_KEY}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Content-Disposition')).toBe(`inline; filename*=UTF-8''file-${files[0].id}`);
    expect(await res.text()).toBe('page one');
  });

  it('serves a page only while its upload is in grading, and answers like a missing file otherwise', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    await api.env.FILES.put(`fixture/${id}/1.jpg`, 'page one');
    const row = await api.db.prepare('SELECT id FROM submission_files WHERE submission_id = ?').bind(id).first<{ id: number }>();
    const path = `/api/runner/submissions/${id}/files/${row!.id}`;
    const get = (url: string) => api.fetch(url, { headers: { Authorization: `Bearer ${ROBOT_KEY}` } });
    const missing = await get(`/api/runner/submissions/${id}/files/99999`);
    expect(missing.status).toBe(404);
    const missingBody = await missing.json();
    const expectMissing = async () => {
      const res = await get(path);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(missingBody);
    };
    for (const status of ['uploading', 'submitted', 'failed']) {
      await api.db.prepare('UPDATE submissions SET status = ? WHERE id = ?').bind(status, id).run();
      await expectMissing();
    }

    await api.db.prepare("UPDATE submissions SET status = 'submitted' WHERE id = ?").bind(id).run();
    await claim();
    expect((await get(path)).status).toBe(200);
    await sendResult(id, { ok: true, result: result([4, 2.5]), model: 'm' });
    expect(await uploadRow(id)).toMatchObject({ status: 'graded' });
    await expectMissing();
  });

  it('answers 404 for a file of another upload', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    const other = await upload(1, '2026-10-07T08:11:00.000Z');
    const row = await api.db.prepare('SELECT id FROM submission_files WHERE submission_id = ?').bind(other).first<{ id: number }>();
    expect((await robot('GET', `/submissions/${id}/files/${row!.id}`)).status).toBe(404);
  });
});

describe('POST /api/runner/submissions/:id/result', () => {
  it('saves the grading, computes the grade, and shows it to the teacher', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    await claim();
    const res = await sendResult(id, { ok: true, result: result([4, 2.5]), model: 'claude-opus' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'graded' });

    expect(await uploadRow(id)).toMatchObject({ status: 'graded', run_id: null, last_error: null });
    const evaluation = await api.db
      .prepare('SELECT max_total, office_points, total, grade, needs_review, summary, model, raw_json FROM evaluations WHERE submission_id = ?')
      .bind(id)
      .first<Record<string, unknown>>();
    expect(evaluation).toMatchObject({ max_total: 10, office_points: 1, total: 7.5, grade: 7.5, needs_review: 1, summary: 'Ai lucrat bine.', model: 'claude-opus' });
    expect(JSON.parse(evaluation!.raw_json as string)).toEqual(result([4, 2.5]));
    const items = await api.db
      .prepare(
        `SELECT exercise_id, position, label, max_points, ai_points, points, confidence, needs_review, review_reason
         FROM evaluation_items ORDER BY position`,
      )
      .all();
    expect(items.results).toEqual([
      { exercise_id: 'I.1', position: 1, label: 'Subiectul I, exercițiul 1', max_points: 4.5, ai_points: 4, points: 4, confidence: 'high', needs_review: 0, review_reason: '' },
      {
        exercise_id: 'II.1',
        position: 2,
        label: 'Subiectul II, exercițiul 1',
        max_points: 4.5,
        ai_points: 2.5,
        points: 2.5,
        confidence: 'low',
        needs_review: 1,
        review_reason: 'Robotul nu este sigur de acest punctaj.',
      },
    ]);

    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.test).toMatchObject({ status: 'done', gradedCount: 1 });
    expect(detail.body.uploads.find((row: { submissionId: number }) => row.submissionId === id)).toMatchObject({ grade: 7.5, flagCount: 1 });
  });

  it('saves a grading of 60 exercises', async () => {
    const exercises = Array.from({ length: 60 }, (_, i) => ({ id: `E${i + 1}`, label: `Ex ${i + 1}`, maxPoints: 0.15, answer: '', scoringNotes: '', topic: '' }));
    await api.db
      .prepare('UPDATE tests SET exercise_list_json = ? WHERE id = ?')
      .bind(JSON.stringify({ totalPoints: 10, officePoints: 1, exercises, notes: '' }), testId)
      .run();
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    await claim();
    const items = exercises.map((exercise) => ({
      exerciseId: exercise.id,
      points: 0.15,
      studentAnswer: '',
      comment: '',
      confidence: 'high',
      needsReview: false,
      reviewReason: '',
    }));
    const res = await sendResult(id, { ok: true, result: { ...result([0, 0]), items }, model: 'm' });
    expect(res.body).toEqual({ status: 'graded' });
    const count = await api.db.prepare('SELECT COUNT(*) AS n FROM evaluation_items').first<{ n: number }>();
    expect(count?.n).toBe(60);
    const grade = await api.db.prepare('SELECT grade FROM evaluations WHERE submission_id = ?').bind(id).first<{ grade: number }>();
    expect(grade?.grade).toBe(10);
  });

  it('refuses a broken grading and keeps the upload in grading', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    await claim();
    const res = await sendResult(id, { ok: true, result: { ...result([4, 4]), items: [] }, model: 'm' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid_result');
    expect(await uploadRow(id)).toMatchObject({ status: 'grading', run_id: RUN });
    expect(await api.db.prepare('SELECT COUNT(*) AS n FROM evaluations').first()).toEqual({ n: 0 });
  });

  it('refuses a result over 1 MB and keeps the upload in grading', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    await claim();
    const res = await sendResult(id, { ok: true, result: result([4, 4], { summary: 's'.repeat(1_000_000) }), model: 'm' });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('too_large');
    expect(await uploadRow(id)).toMatchObject({ status: 'grading', run_id: RUN });
  });

  it('refuses the result of an upload whose test the teacher reopened, and grades it after the next start', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    const graded = await upload(1, '2026-10-07T08:20:00.000Z');
    await claim();
    await claim();
    await sendResult(graded, { ok: true, result: result([4, 4]), model: 'm' });
    expect((await api.request('POST', `/api/admin/tests/${code}/reopen`)).status).toBe(200);
    expect(await uploadRow(id)).toMatchObject({ status: 'submitted', run_id: null, attempts: 0 });
    expect(await uploadRow(graded)).toMatchObject({ status: 'graded' });

    const late = await sendResult(id, { ok: true, result: result([4, 4]), model: 'm' });
    expect(late.status).toBe(409);
    expect(late.body.error).toBe('taken_over');
    expect((await claim()).status).toBe(204);

    expect((await api.request('POST', `/api/admin/tests/${code}/evaluate`, {})).status).toBe(200);
    expect((await claim()).body.submissionId).toBe(id);
  });

  it('refuses a result from another run, for an upload not in grading, and for a deleted upload', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    const waiting = await upload(1, '2026-10-07T08:20:00.000Z');
    await claim();
    const other = await robot('POST', `/submissions/${id}/result`, { runId: OTHER_RUN, ok: true, result: result([4, 4]), model: 'm' });
    expect(other.status).toBe(409);
    expect(other.body.error).toBe('taken_over');
    expect((await sendResult(waiting, { ok: true, result: result([4, 4]), model: 'm' })).status).toBe(409);

    await api.request('POST', `/api/admin/submissions/${id}/reset`);
    expect((await sendResult(id, { ok: true, result: result([4, 4]), model: 'm' })).status).toBe(404);
  });

  it('refuses the result of a run whose uploads a new run took over', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    await claim();
    await api.db.prepare("UPDATE runner_state SET heartbeat_at = '2026-10-06T08:00:00.000Z' WHERE id = 1").run();
    expect((await robot('POST', '/lease', { runId: OTHER_RUN })).body.granted).toBe(true);
    const res = await sendResult(id, { ok: true, result: result([4, 4]), model: 'm' });
    expect(res.status).toBe(409);
    expect(await uploadRow(id)).toMatchObject({ status: 'submitted', run_id: null });
  });

  it('counts failed attempts, fails the upload at the third, and then ends the test', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    for (const expected of ['submitted', 'submitted', 'failed']) {
      expect((await claim()).body.submissionId).toBe(id);
      const res = await sendResult(id, { ok: false, error: 'crash' });
      expect(res.body).toEqual({ status: expected });
    }
    expect(await uploadRow(id)).toMatchObject({ status: 'failed', attempts: 3, last_error: 'Robotul s-a oprit cu o eroare.', run_id: null });
    expect(await testStatus()).toBe('done');
  });

  it('counts no attempt for a usage limit', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    await claim();
    expect((await sendResult(id, { ok: false, error: 'usage_limit' })).body).toEqual({ status: 'submitted' });
    expect(await uploadRow(id)).toMatchObject({ status: 'submitted', attempts: 0, last_error: null });
    expect(await testStatus()).toBe('evaluating');
  });
});

describe('the student app after grading', () => {
  it('shows a graded student as done and tells the phone nothing of the grading', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    await api.db.prepare('UPDATE submissions SET session_hash = ? WHERE id = ?').bind(await sha256Hex('phone-secret'), id).run();
    await claim();
    await sendResult(id, { ok: true, result: result([4, 2.5]), model: 'm' });
    await api.request('POST', `/api/admin/tests/${code}/reopen`);
    const token = (await api.db.prepare('SELECT upload_token FROM tests WHERE id = ?').bind(testId).first<{ upload_token: string }>())!.upload_token;

    const link = await api.request('GET', `/api/u/${token}`);
    expect(link.body.students.find((student: { id: number }) => student.id === studentIds[0])).toEqual({
      id: studentIds[0],
      name: 'Pop Ion',
      state: 'done',
    });
    const again = await api.request('POST', `/api/u/${token}/sessions`, { studentId: studentIds[0] }, { 'X-Upload-Session': 'phone-secret' });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('already_submitted');
    const files = await api.request('GET', `/api/u/${token}/files`, undefined, { 'X-Upload-Session': 'phone-secret' });
    expect(files.status).toBe(200);
    expect(files.body.session.status).toBe('submitted');
    for (const answer of [link.body, again.body, files.body]) {
      expect(JSON.stringify(answer)).not.toMatch(/grad(e|ed|ing)|failed|Corect\.|Verifică semnul|Ai lucrat bine|Robotul|Exersează|reviewReason|needsReview/);
    }
  });

  it('shows an upload that is being graded, or that failed, as sent', async () => {
    await api.request('POST', `/api/admin/tests/${code}/reopen`);
    const token = (await api.db.prepare('SELECT upload_token FROM tests WHERE id = ?').bind(testId).first<{ upload_token: string }>())!.upload_token;
    for (const [index, status] of (['grading', 'failed'] as const).entries()) {
      const id = await addSubmission(api, code, studentIds[index + 1]!, { status, files: 1 });
      await api.db.prepare('UPDATE submissions SET session_hash = ? WHERE id = ?').bind(await sha256Hex(`phone-${status}`), id).run();
      const files = await api.request('GET', `/api/u/${token}/files`, undefined, { 'X-Upload-Session': `phone-${status}` });
      expect(files.status).toBe(200);
      expect(files.body.session.status).toBe('submitted');
      expect(JSON.stringify(files.body)).not.toMatch(/grad(e|ed|ing)|failed/);
    }
  });
});

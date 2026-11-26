import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCX_TYPE, generatedBaremKey, PDF_TYPE, TEST_FILE_PATHS } from '../../shared/files.ts';
import type { ExerciseList } from '../../shared/schemas.ts';
import { addSubmission, addTestFiles, makeClass, makeTest, ROBOT_KEY, robotRequest, setRobotKey, startTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// Two robots share the robot API: the teachers' robot (lane main, row 1 of
// runner_state) and the Quick Try robot (lane try, row 2). Each sees and saves
// only the work of its own lane.

let api: TestApi;
let robot: ReturnType<typeof robotRequest>;
let classTestId: number;
let tryTestId: number;
let classPapers: number[];
let tryPaper: number;

const MAIN_RUN = 'main-run-0001';
const TRY_RUN = 'try-run-00001';
const OTHER_RUN = 'other-run-0001';

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [{ id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 9, answer: '3/4', scoringNotes: '', topic: 'Fracții' }],
  notes: '',
};

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7 ${text}`);
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const put = (path: string, bytes: BodyInit, type: string, name: string) =>
  api.fetch(path, { method: 'PUT', body: bytes, headers: { 'Content-Type': type, 'X-File-Name': name } });
const paper = (id: number) =>
  api.db.prepare('SELECT status, run_id FROM submissions WHERE id = ?').bind(id).first<{ status: string; run_id: string | null }>();
const leaseRow = (id: number) => api.db.prepare('SELECT run_id FROM runner_state WHERE id = ?').bind(id).first<{ run_id: string | null }>();

// A try sent to grading through its own link: its paper waits, its list is ready.
async function makeTry(): Promise<number> {
  const made = await api.request('POST', '/api/try', { turnstileToken: 'ok' }, { 'CF-Connecting-IP': '203.0.113.5' });
  const { token, code } = made.body as { token: string; code: string };
  for (const kind of ['test', 'barem'] as const) {
    await put(`/api/try/${token}/tests/${code}/files/${TEST_FILE_PATHS[kind]}`, pdf(kind), PDF_TYPE, `${kind}.pdf`);
  }
  await put(`/api/try/${token}/paper`, jpeg(), 'image/jpeg', 'pagina1.jpg');
  const started = await api.request('POST', `/api/try/${token}/start`, {});
  if (started.status !== 200) throw new Error(JSON.stringify(started.body));
  const id = (await api.db.prepare('SELECT id FROM tests WHERE quick_try = 1').first<{ id: number }>())!.id;
  await api.db.prepare("UPDATE tests SET exercise_list_status = 'ready', exercise_list_json = ? WHERE id = ?").bind(JSON.stringify(LIST), id).run();
  return id;
}

beforeEach(async () => {
  api = await startTestApi({ app: { dispatchRobot: async () => true, verifyTurnstile: async () => true } });
  await setRobotKey(api);
  robot = robotRequest(api);
  const cls = await makeClass(api, '6E2', ['Ionescu Ana', 'Pop Ion']);
  const code = await makeTest(api, cls.id);
  classTestId = await testIdOf(api, code);
  await startTest(api, code);
  await addTestFiles(api, code);
  classPapers = [];
  for (const studentId of cls.studentIds) classPapers.push(await addSubmission(api, code, studentId, { status: 'submitted', files: 1 }));
  await api.db
    .prepare("UPDATE tests SET status = 'evaluating', exercise_list_status = 'ready', exercise_list_json = ? WHERE id = ?")
    .bind(JSON.stringify(LIST), classTestId)
    .run();
  tryTestId = await makeTry();
  tryPaper = (await api.db.prepare('SELECT id FROM submissions WHERE test_id = ?').bind(tryTestId).first<{ id: number }>())!.id;
});

afterEach(async () => {
  await api.dispose();
});

describe('robot lanes', () => {
  it('gives each lane its own lease', async () => {
    expect((await robot('POST', '/lease', { runId: MAIN_RUN })).body.granted).toBe(true);
    expect((await robot('POST', '/lease?lane=try', { runId: TRY_RUN })).body.granted).toBe(true);
    expect((await robot('POST', '/lease?lane=try', { runId: OTHER_RUN })).body.granted).toBe(false);
    expect((await robot('POST', '/lease', { runId: OTHER_RUN })).body.granted).toBe(false);
    expect((await leaseRow(1))!.run_id).toBe(MAIN_RUN);
    expect((await leaseRow(2))!.run_id).toBe(TRY_RUN);
  });

  it('answers 404 for an unknown lane', async () => {
    expect((await robot('POST', '/lease?lane=x', { runId: MAIN_RUN })).status).toBe(404);
    expect((await robot('POST', '/check?lane=quick')).status).toBe(404);
    expect((await robot('GET', '/tasks?lane=')).status).toBe(404);
  });

  it("lists and counts only the lane's own work", async () => {
    expect((await robot('GET', '/tasks')).body.pendingGrading).toBe(2);
    expect((await robot('GET', '/tasks?lane=try')).body.pendingGrading).toBe(1);
    expect((await robot('POST', '/check')).body.pendingGrading).toBe(2);
    expect((await robot('POST', '/check?lane=try')).body.pendingGrading).toBe(1);
  });

  it("lists only the lane's own exercise lists", async () => {
    await api.db.prepare("UPDATE tests SET exercise_list_status = 'none', exercise_list_json = NULL").run();
    expect((await robot('GET', '/tasks')).body.exerciseLists).toEqual([classTestId]);
    expect((await robot('GET', '/tasks?lane=try')).body.exerciseLists).toEqual([tryTestId]);
  });

  it('writes the time of the check on the lane\'s own row', async () => {
    await robot('POST', '/check?lane=try');
    const rows = await api.db.prepare('SELECT id, last_check_at FROM runner_state ORDER BY id').all<{ id: number; last_check_at: string | null }>();
    expect(rows.results[0]!.last_check_at).toBeNull();
    expect(rows.results[1]!.last_check_at).not.toBeNull();
  });

  it("claims only the lane's own papers", async () => {
    await robot('POST', '/lease', { runId: MAIN_RUN });
    await robot('POST', '/lease?lane=try', { runId: TRY_RUN });
    const first = await robot('POST', '/claim', { runId: MAIN_RUN });
    const second = await robot('POST', '/claim', { runId: MAIN_RUN });
    expect([first.body.submissionId, second.body.submissionId].sort()).toEqual([...classPapers].sort());
    expect((await robot('POST', '/claim', { runId: MAIN_RUN })).status).toBe(204);
    const tried = await robot('POST', '/claim?lane=try', { runId: TRY_RUN });
    expect(tried.body.submissionId).toBe(tryPaper);
    expect((await robot('POST', '/claim?lane=try', { runId: TRY_RUN })).status).toBe(204);
  });

  it('does not let a run claim the papers of the other lane', async () => {
    await robot('POST', '/lease?lane=try', { runId: TRY_RUN });
    // A try run asking without its lane gets no class paper: it holds no main lease.
    expect((await robot('POST', '/claim', { runId: TRY_RUN })).status).toBe(409);
    expect((await paper(classPapers[0]!))!.status).toBe('submitted');
  });

  it("a try lease leaves the main run's papers in grading", async () => {
    await robot('POST', '/lease', { runId: MAIN_RUN });
    const claimed = await robot('POST', '/claim', { runId: MAIN_RUN });
    await robot('POST', '/lease?lane=try', { runId: TRY_RUN });
    expect(await paper(claimed.body.submissionId as number)).toEqual({ status: 'grading', run_id: MAIN_RUN });
  });

  it("a main lease leaves the try run's paper in grading", async () => {
    await robot('POST', '/lease?lane=try', { runId: TRY_RUN });
    await robot('POST', '/claim?lane=try', { runId: TRY_RUN });
    await robot('POST', '/lease', { runId: MAIN_RUN });
    expect(await paper(tryPaper)).toEqual({ status: 'grading', run_id: TRY_RUN });
  });

  it("a check of one lane leaves the live run of the other lane's paper in grading", async () => {
    await robot('POST', '/lease?lane=try', { runId: TRY_RUN });
    await robot('POST', '/claim?lane=try', { runId: TRY_RUN });
    await robot('POST', '/check');
    expect(await paper(tryPaper)).toEqual({ status: 'grading', run_id: TRY_RUN });
  });

  it('refuses a save from a run of the other lane', async () => {
    await api.db.prepare("UPDATE tests SET exercise_list_status = 'none', exercise_list_json = NULL WHERE id = ?").bind(tryTestId).run();
    await robot('POST', '/lease', { runId: MAIN_RUN });
    const version = (await api.db.prepare('SELECT files_version FROM tests WHERE id = ?').bind(tryTestId).first<{ files_version: number }>())!.files_version;
    const res = await robot('POST', `/tests/${tryTestId}/exercise-list`, { runId: MAIN_RUN, filesVersion: version, ok: true, exerciseList: LIST });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('lease_lost');
    const row = await api.db.prepare('SELECT exercise_list_status FROM tests WHERE id = ?').bind(tryTestId).first<{ exercise_list_status: string }>();
    expect(row!.exercise_list_status).toBe('none');
    await robot('POST', '/lease?lane=try', { runId: TRY_RUN });
    const saved = await robot('POST', `/tests/${tryTestId}/exercise-list`, { runId: TRY_RUN, filesVersion: version, ok: true, exerciseList: LIST });
    expect(saved.status).toBe(200);
  });

  it("does not let a run of the other lane write a try's barem file", async () => {
    await api.db.prepare("UPDATE tests SET barem_request = 'requested' WHERE id = ?").bind(tryTestId).run();
    await robot('POST', '/lease', { runId: MAIN_RUN });
    const test = (await api.db
      .prepare('SELECT t.teacher_id, t.code, t.files_version, c.school_year FROM tests t JOIN classes c ON c.id = t.class_id WHERE t.id = ?')
      .bind(tryTestId)
      .first<{ teacher_id: number; code: string; files_version: number; school_year: number }>())!;
    const put = vi.spyOn(api.env.FILES, 'put');
    const res = await api.fetch(`/api/runner/tests/${tryTestId}/barem`, {
      method: 'PUT',
      body: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]),
      headers: { Authorization: `Bearer ${ROBOT_KEY}`, 'Content-Type': DOCX_TYPE, 'X-Run-Id': MAIN_RUN, 'X-Files-Version': String(test.files_version) },
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('lease_lost');
    // Refused before the object is written: the key is shared with the try run's own upload.
    expect(put).not.toHaveBeenCalled();
    expect(await api.env.FILES.get(generatedBaremKey(test.teacher_id, test.school_year, test.code, test.files_version))).toBeNull();
    put.mockRestore();
  });

  it('heartbeats and releases each lane by its run id', async () => {
    await robot('POST', '/lease', { runId: MAIN_RUN });
    await robot('POST', '/lease?lane=try', { runId: TRY_RUN });
    expect((await robot('POST', '/heartbeat', { runId: TRY_RUN })).status).toBe(200);
    expect((await robot('POST', '/heartbeat', { runId: MAIN_RUN })).status).toBe(200);
    expect((await robot('POST', '/heartbeat', { runId: OTHER_RUN })).status).toBe(409);
    const summary = { exerciseLists: 0, graded: 0, failed: 0, analyses: 0, prints: 0, barems: 0, stop: 'done' };
    expect((await robot('POST', '/release', { runId: TRY_RUN, summary })).status).toBe(200);
    expect((await leaseRow(2))!.run_id).toBeNull();
    expect((await leaseRow(1))!.run_id).toBe(MAIN_RUN);
    const kept = await api.db.prepare('SELECT last_run_summary FROM runner_state WHERE id = 2').first<{ last_run_summary: string }>();
    expect(JSON.parse(kept!.last_run_summary).stop).toBe('done');
  });

  it('sends the try lane its own number at once', async () => {
    await api.db.prepare("INSERT INTO settings (key, value) VALUES ('max_parallel_agents', '3')").run();
    expect((await robot('POST', '/lease?lane=try', { runId: TRY_RUN })).body.maxParallel).toBe(2);
    expect((await robot('POST', '/lease', { runId: MAIN_RUN })).body.maxParallel).toBe(3);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_TYPE, TEST_FILE_PATHS } from '../../shared/files.ts';
import { makeClass, makeTest, addTestFiles } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// The Quick Try robot is the try lane's: every path that makes work for a try
// starts it, and an open try page starts it again after a stop.

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<(env: unknown, lane: string) => Promise<boolean>>>;
let token: string;
let code: string;

const T0 = new Date('2026-11-26T10:00:00.000Z');
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);
const ago = (n: number) => new Date(T0.getTime() - n * 60_000).toISOString();

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7 ${text}`);
const put = (path: string, bytes: BodyInit, type: string, name: string) =>
  api.fetch(path, { method: 'PUT', body: bytes, headers: { 'Content-Type': type, 'X-File-Name': name } });
const putTestFile = (kind: 'test' | 'barem') => put(`/api/try/${token}/tests/${code}/files/${TEST_FILE_PATHS[kind]}`, pdf(kind), PDF_TYPE, `${kind}.pdf`);
const readTry = () => api.request('GET', `/api/try/${token}/tests/${code}`);
const setRow = (id: number, sql: string, ...params: unknown[]) =>
  api.db.prepare(`UPDATE runner_state SET ${sql} WHERE id = ?`).bind(...params, id).run();

// A try sent to grading: its paper waits for its exercise list.
async function tryInGrading(): Promise<void> {
  await putTestFile('test');
  await putTestFile('barem');
  await put(`/api/try/${token}/paper`, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]), 'image/jpeg', 'pagina1.jpg');
  expect((await api.request('POST', `/api/try/${token}/start`, {})).status).toBe(200);
}

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => true);
  api = await startTestApi({ app: { dispatchRobot, verifyTurnstile: async () => true } });
  const made = await api.request('POST', '/api/try', { turnstileToken: 'ok' });
  ({ token, code } = made.body);
});

afterEach(async () => {
  vi.useRealTimers();
  await api.dispose();
});

describe('the robot of a try', () => {
  it("starts the try lane for a try's barem", async () => {
    await putTestFile('test');
    await api.request('POST', `/api/try/${token}/tests/${code}/marking-scheme/generate`);
    expect(dispatchRobot).toHaveBeenLastCalledWith(expect.anything(), 'try');
  });

  it('starts the try lane when a try goes to grading', async () => {
    await tryInGrading();
    expect(dispatchRobot).toHaveBeenLastCalledWith(expect.anything(), 'try');
  });

  it("starts the main lane for a teacher's test", async () => {
    const cls = await makeClass(api, '6E2', ['Pop Ion']);
    const own = await makeTest(api, cls.id);
    await addTestFiles(api, own, ['test']);
    await api.request('POST', `/api/admin/tests/${own}/marking-scheme/generate`);
    expect(dispatchRobot).toHaveBeenLastCalledWith(expect.anything(), 'main');
  });

  it('keeps the failed start of each lane apart', async () => {
    dispatchRobot.mockResolvedValue(false);
    await tryInGrading();
    const rows = await api.db.prepare('SELECT id, start_failed_at FROM runner_state ORDER BY id').all<{ id: number; start_failed_at: string | null }>();
    expect(rows.results[0]!.start_failed_at).toBeNull();
    expect(rows.results[1]!.start_failed_at).not.toBeNull();
    // The try page tells of its own robot's failed start.
    expect((await readTry()).body.robot.startFailed).toBe(true);
  });
});

describe('the try robot starts again', () => {
  beforeEach(async () => {
    await tryInGrading();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    await setRow(2, 'last_check_at = ?, restart_at = NULL', ago(20));
    dispatchRobot.mockClear();
  });

  it('starts the try robot at most once in 15 minutes', async () => {
    await readTry();
    await readTry();
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
    expect(dispatchRobot).toHaveBeenLastCalledWith(expect.anything(), 'try');
    vi.setSystemTime(minutes(10));
    await readTry();
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
    vi.setSystemTime(minutes(16));
    await readTry();
    expect(dispatchRobot).toHaveBeenCalledTimes(2);
  });

  it('does not start the try robot while a try run is alive', async () => {
    await setRow(2, "run_id = 'try-run-00001', heartbeat_at = ?", ago(1));
    await readTry();
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('does not start the try robot within 15 minutes of a check', async () => {
    await setRow(2, 'last_check_at = ?', ago(5));
    await readTry();
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('starts the try robot 15 minutes after a usage limit', async () => {
    const limit = JSON.stringify({ exerciseLists: 0, graded: 0, failed: 0, analyses: 0, prints: 0, barems: 0, stop: 'usage_limit' });
    await setRow(2, 'last_check_at = ?, last_run_finished_at = ?, last_run_summary = ?', ago(40), ago(10), limit);
    await readTry();
    expect(dispatchRobot).not.toHaveBeenCalled();
    vi.setSystemTime(minutes(6));
    await readTry();
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
    expect(dispatchRobot).toHaveBeenLastCalledWith(expect.anything(), 'try');
  });

  it('does not start the try robot again after a refused Claude login', async () => {
    const login = JSON.stringify({ exerciseLists: 0, graded: 0, failed: 0, analyses: 0, prints: 0, barems: 0, stop: 'claude_login' });
    await setRow(2, 'last_check_at = ?, last_run_finished_at = ?, last_run_summary = ?', ago(300), ago(240), login);
    await readTry();
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('starts the try robot again an hour after a run that stopped at an error', async () => {
    // A waiting visitor has no button: the try lane waits an hour, then tries.
    const error = JSON.stringify({ exerciseLists: 0, graded: 0, failed: 3, analyses: 0, prints: 0, barems: 0, stop: 'error' });
    await setRow(2, 'last_check_at = ?, last_run_finished_at = ?, last_run_summary = ?', ago(300), ago(30), error);
    await readTry();
    expect(dispatchRobot).not.toHaveBeenCalled();
    vi.setSystemTime(minutes(31));
    await readTry();
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
    expect(dispatchRobot).toHaveBeenLastCalledWith(expect.anything(), 'try');
  });

  it('does not start the try robot for a try with no robot work', async () => {
    await api.db.prepare("UPDATE submissions SET status = 'graded', graded_at = ? WHERE test_id = (SELECT id FROM tests WHERE quick_try = 1)").bind(ago(1)).run();
    await api.db.prepare("UPDATE tests SET exercise_list_status = 'ready' WHERE quick_try = 1").run();
    await readTry();
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it("does not start the teachers' robot from a try page", async () => {
    await setRow(1, 'last_check_at = ?, restart_at = NULL', ago(20));
    await readTry();
    expect(dispatchRobot.mock.calls.map((call) => call[1])).toEqual(['try']);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../passwords.ts';
import { addSubmission, addTestFiles, makeClass, makeTest, otherTeacherTest, startTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// The teachers' robot starts again from the teacher app's version read
// (GET /api/admin/version, every minute) when a run stopped and work waits.

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<(env: unknown, lane: string) => Promise<boolean>>>;
let testId: number;

const T0 = new Date('2026-11-26T10:00:00.000Z');
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);
const ago = (n: number) => new Date(T0.getTime() - n * 60_000).toISOString();
const summary = (stop: string) => JSON.stringify({ exerciseLists: 0, graded: 0, failed: 0, analyses: 0, prints: 0, barems: 0, stop });

const version = () => api.request('GET', '/api/admin/version');
const setRow = (sql: string, ...params: unknown[]) => api.db.prepare(`UPDATE runner_state SET ${sql} WHERE id = 1`).bind(...params).run();

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => true);
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '6E2', ['Pop Ion']);
  const code = await makeTest(api, cls.id);
  testId = await testIdOf(api, code);
  await startTest(api, code);
  await addTestFiles(api, code);
  // A paper waits for the class's exercise list.
  await addSubmission(api, code, cls.studentIds[0]!, { status: 'submitted', files: 1 });
  await api.db.prepare("UPDATE tests SET status = 'evaluating' WHERE id = ?").bind(testId).run();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  await setRow('last_check_at = ?, restart_at = NULL', ago(20));
  dispatchRobot.mockClear();
});

afterEach(async () => {
  vi.useRealTimers();
  await api.dispose();
});

describe("the teachers' robot starts again", () => {
  it('starts the main robot from the version read when a class paper waits', async () => {
    await version();
    await version();
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
    expect(dispatchRobot).toHaveBeenLastCalledWith(expect.anything(), 'main');
    vi.setSystemTime(minutes(16));
    await version();
    expect(dispatchRobot).toHaveBeenCalledTimes(2);
  });

  it('does not start while a main run is alive', async () => {
    await setRow("run_id = 'main-run-0001', heartbeat_at = ?", ago(2));
    await version();
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('starts when the live run stopped sending heartbeats 15 minutes ago', async () => {
    await setRow("run_id = 'main-run-0001', heartbeat_at = ?", ago(16));
    await version();
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('waits an hour after a usage limit', async () => {
    await setRow('last_check_at = ?, last_run_finished_at = ?, last_run_summary = ?', ago(90), ago(30), summary('usage_limit'));
    await version();
    expect(dispatchRobot).not.toHaveBeenCalled();
    vi.setSystemTime(minutes(31));
    await version();
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('waits no hour for a usage limit that a later run already left behind', async () => {
    // A run checked in after the stop: the stop is not the last thing that happened.
    await setRow('last_check_at = ?, last_run_finished_at = ?, last_run_summary = ?', ago(20), ago(30), summary('usage_limit'));
    await version();
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('does not start again after a refused Claude login', async () => {
    await setRow('last_check_at = ?, last_run_finished_at = ?, last_run_summary = ?', ago(240), ago(180), summary('claude_login'));
    await version();
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('starts again after a run that ran out of time with work left', async () => {
    await setRow('last_check_at = ?, last_run_finished_at = ?, last_run_summary = ?', ago(120), ago(1), summary('budget'));
    await version();
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('does not start for a teacher with no robot work', async () => {
    await api.db.prepare("UPDATE tests SET status = 'done' WHERE id = ?").bind(testId).run();
    await version();
    expect(dispatchRobot).not.toHaveBeenCalled();
    // The look took the 15 minutes: the next reads skip the work check.
    const row = await api.db.prepare('SELECT restart_at FROM runner_state WHERE id = 1').first<{ restart_at: string | null }>();
    expect(row!.restart_at).toBe(T0.toISOString());
  });

  it("does not start for another teacher's work", async () => {
    await api.db.prepare("UPDATE tests SET status = 'done' WHERE id = ?").bind(testId).run();
    const other = await otherTeacherTest(api, 'ana@example.com');
    await addSubmission(api, other.code, other.studentId, { status: 'submitted', files: 1 });
    await api.db.prepare("UPDATE tests SET status = 'evaluating' WHERE code = ?").bind(other.code).run();
    await version();
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it("does not start the try robot from a teacher's page", async () => {
    await api.db.prepare('UPDATE runner_state SET last_check_at = ?, restart_at = NULL WHERE id = 2').bind(ago(20)).run();
    await version();
    expect(dispatchRobot.mock.calls.map((call) => call[1])).toEqual(['main']);
  });
});

describe("an administrator's view of a teacher", () => {
  it('starts the robot from the view\'s version read too', async () => {
    vi.useRealTimers();
    const view = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined }, app: { dispatchRobot } });
    try {
      const password = 'parola-lunga-1';
      await view.db.prepare('UPDATE teachers SET password_hash = ? WHERE email = ?').bind(await hashPassword(password), 'profesor@example.com').run();
      const other = await otherTeacherTest(view, 'ana@example.com');
      await addSubmission(view, other.code, other.studentId, { status: 'submitted', files: 1 });
      await view.db.prepare("UPDATE tests SET status = 'evaluating' WHERE code = ?").bind(other.code).run();
      const anaId = (await view.db.prepare("SELECT id FROM teachers WHERE email = 'ana@example.com'").first<{ id: number }>())!.id;
      const login = await view.request('POST', '/api/auth/login', { email: 'profesor@example.com', password });
      const cookie = (res: { headers: Headers }, name: string) =>
        res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))!.split(';')[0]!;
      const session = cookie(login, 'qe_session');
      const started = await view.request('POST', `/api/admin/accounts/${anaId}/impersonation`, { mode: 'view', password }, { Cookie: session });
      const viewCookie = cookie(started, 'qe_view');
      await view.db.prepare('UPDATE runner_state SET last_check_at = NULL, restart_at = NULL WHERE id = 1').run();
      dispatchRobot.mockClear();
      const res = await view.request('GET', '/api/admin/version', undefined, { Cookie: `${session}; ${viewCookie}` });
      expect(res.status).toBe(200);
      expect(dispatchRobot).toHaveBeenCalledTimes(1);
      expect(dispatchRobot).toHaveBeenLastCalledWith(expect.anything(), 'main');
    } finally {
      await view.dispose();
    }
  });
});

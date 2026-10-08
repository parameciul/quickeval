import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../secrets.ts';
import { addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;

const setRunner = (sql: string, ...params: unknown[]) =>
  api.db.prepare(`UPDATE runner_state SET ${sql} WHERE id = 1`).bind(...params).run();

beforeEach(async () => {
  api = await startTestApi();
});

afterEach(async () => {
  await api.dispose();
});

describe('GET /api/admin/settings', () => {
  it('starts with one upload at a time, no robot key, and a robot that never ran', async () => {
    const res = await api.request('GET', '/api/admin/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      settings: {
        maxParallelAgents: 1,
        hasRobotKey: false,
        robot: { running: false, lastCheckAt: null, lastRunFinishedAt: null, lastRunSummary: null },
        lastGradedAt: null,
      },
    });
  });

  it('shows a run as running only while its heartbeat is fresh', async () => {
    const fresh = new Date(Date.now() - 60_000).toISOString();
    await setRunner("run_id = 'run-1', heartbeat_at = ?, last_check_at = ?", fresh, fresh);
    expect((await api.request('GET', '/api/admin/settings')).body.settings.robot).toMatchObject({ running: true, lastCheckAt: fresh });
    await setRunner("heartbeat_at = '2026-10-06T08:00:00.000Z'");
    expect((await api.request('GET', '/api/admin/settings')).body.settings.robot.running).toBe(false);
  });

  it('shows the summary of the last run, and none for a broken one', async () => {
    const summary = { exerciseLists: 1, graded: 25, failed: 2, analyses: 0, stop: 'done' };
    await setRunner("last_run_finished_at = '2026-10-07T09:00:00.000Z', last_run_summary = ?", JSON.stringify(summary));
    const robot = (await api.request('GET', '/api/admin/settings')).body.settings.robot;
    expect(robot).toMatchObject({ lastRunFinishedAt: '2026-10-07T09:00:00.000Z', lastRunSummary: summary });
    await setRunner("last_run_summary = '{nu'");
    expect((await api.request('GET', '/api/admin/settings')).body.settings.robot.lastRunSummary).toBeNull();
  });

  it("shows when one of this teacher's uploads was last graded", async () => {
    const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana']);
    const code = await makeTest(api, cls.id);
    for (const [index, studentId] of cls.studentIds.entries()) {
      const id = await addSubmission(api, code, studentId, { status: 'graded', files: 1 });
      await api.db.prepare('UPDATE submissions SET graded_at = ? WHERE id = ?').bind(`2026-10-0${index + 7}T09:00:00.000Z`, id).run();
    }
    const foreign = await otherTeacherTest(api);
    const foreignId = await addSubmission(api, foreign.code, foreign.studentId, { status: 'graded', files: 1 });
    await api.db.prepare("UPDATE submissions SET graded_at = '2026-12-01T09:00:00.000Z' WHERE id = ?").bind(foreignId).run();
    expect((await api.request('GET', '/api/admin/settings')).body.settings.lastGradedAt).toBe('2026-10-08T09:00:00.000Z');
  });
});

describe('PATCH /api/admin/settings', () => {
  it('sets how many uploads the robot grades at the same time', async () => {
    const res = await api.request('PATCH', '/api/admin/settings', { maxParallelAgents: 3 });
    expect(res.status).toBe(200);
    expect(res.body.settings.maxParallelAgents).toBe(3);
    expect((await api.request('GET', '/api/admin/settings')).body.settings.maxParallelAgents).toBe(3);
  });

  it.each([0, 5, 1.5, '2'])('refuses %j', async (value) => {
    const res = await api.request('PATCH', '/api/admin/settings', { maxParallelAgents: value });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Alege între 1 și 4 lucrări corectate deodată.');
  });
});

describe('POST /api/admin/settings/robot-key', () => {
  it('shows a new key once and keeps only its hash', async () => {
    const res = await api.request('POST', '/api/admin/settings/robot-key');
    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await api.db.prepare("SELECT value FROM settings WHERE key = 'runner_key_hash'").first<{ value: string }>();
    expect(stored?.value).toBe(await sha256Hex(res.body.key));
    expect((await api.request('GET', '/api/admin/settings')).body.settings.hasRobotKey).toBe(true);
  });

  it('replaces the old key', async () => {
    const first = (await api.request('POST', '/api/admin/settings/robot-key')).body.key;
    const second = (await api.request('POST', '/api/admin/settings/robot-key')).body.key;
    expect(second).not.toBe(first);
    const rows = await api.db.prepare("SELECT value FROM settings WHERE key = 'runner_key_hash'").all<{ value: string }>();
    expect(rows.results).toEqual([{ value: await sha256Hex(second) }]);
  });
});

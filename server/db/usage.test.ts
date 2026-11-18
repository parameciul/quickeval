import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QUICK_TRY_IP_LIMIT } from '../../shared/quickTry.ts';
import { cleanUpTries } from '../quickTryCleanup.ts';
import { makeClass, makeTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
import { logRobotWork } from './runner.ts';

// The robot's work per Bucharest day (usage_days), written with every job the
// robot logs and with every Quick Try that is made.

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi({ app: { verifyTurnstile: async () => true } });
});

afterEach(async () => {
  await api.dispose();
});

const days = async () =>
  (
    await api.db
      .prepare(
        `SELECT day, quick_try, teacher_id, papers, barems, exercise_lists, analyses, prints, failed, tokens, tries
         FROM usage_days ORDER BY day, quick_try, teacher_id`,
      )
      .all()
  ).results;

const zero = { papers: 0, barems: 0, exercise_lists: 0, analyses: 0, prints: 0, failed: 0, tokens: 0, tries: 0 };

async function classTest(): Promise<number> {
  const { id } = await makeClass(api, '9A', ['Ana Pop']);
  return testIdOf(api, await makeTest(api, id));
}

describe('the robot work of a day', () => {
  it('counts each kind that worked in its own column, a failure in failed, and adds the tokens', async () => {
    const testId = await classTest();
    const at = '2026-11-18T09:00:00.000Z';
    await logRobotWork(api.db, { testId, kind: 'grading', variant: 'class', ok: true, tokens: 1000, at });
    await logRobotWork(api.db, { testId, kind: 'grading', variant: 'ces', ok: true, tokens: 500, at });
    await logRobotWork(api.db, { testId, kind: 'barem', variant: 'class', ok: true, tokens: 300, at });
    await logRobotWork(api.db, { testId, kind: 'exercise_list', variant: 'class', ok: true, tokens: 200, at });
    await logRobotWork(api.db, { testId, kind: 'analysis', variant: 'class', ok: true, tokens: 100, at });
    await logRobotWork(api.db, { testId, kind: 'print', variant: 'class', ok: true, at });
    await logRobotWork(api.db, { testId, kind: 'grading', variant: 'class', ok: false, tokens: 999, at });
    expect(await days()).toEqual([
      { ...zero, day: '2026-11-18', quick_try: 0, teacher_id: api.teacherId, papers: 2, barems: 1, exercise_lists: 1, analyses: 1, prints: 1, failed: 1, tokens: 2100 },
    ]);
  });

  it('keeps one row per teacher', async () => {
    const mine = await classTest();
    const otherId = await api.addTeacher('alt@example.com', 'Alt Profesor');
    const { id: classId } = await makeClass(api, '9B', ['Ion Pop']);
    const other = await testIdOf(api, await makeTest(api, classId));
    await api.db.prepare('UPDATE tests SET teacher_id = ? WHERE id = ?').bind(otherId, other).run();
    const at = '2026-11-18T09:00:00.000Z';
    await logRobotWork(api.db, { testId: mine, kind: 'grading', variant: 'class', ok: true, tokens: 10, at });
    await logRobotWork(api.db, { testId: other, kind: 'grading', variant: 'class', ok: true, tokens: 20, at });
    expect((await days()).map((row) => [row.teacher_id, row.papers, row.tokens])).toEqual([
      [api.teacherId, 1, 10],
      [otherId, 1, 20],
    ]);
  });

  it('starts a new day at Bucharest midnight, not at UTC midnight', async () => {
    const testId = await classTest();
    await logRobotWork(api.db, { testId, kind: 'grading', variant: 'class', ok: true, at: '2026-11-17T21:59:00.000Z' });
    await logRobotWork(api.db, { testId, kind: 'grading', variant: 'class', ok: true, at: '2026-11-17T22:01:00.000Z' });
    expect((await days()).map((row) => [row.day, row.papers])).toEqual([
      ['2026-11-17', 1],
      ['2026-11-18', 1],
    ]);
  });

  it('counts nothing for a test that no longer exists', async () => {
    await logRobotWork(api.db, { testId: 99999, kind: 'grading', variant: 'class', ok: true, at: '2026-11-18T09:00:00.000Z' });
    expect(await days()).toEqual([]);
  });
});

describe('the Quick Try work of a day', () => {
  // A visitor who is not logged in: an administrator's try skips the limits.
  beforeEach(async () => {
    await api.dispose();
    api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined }, app: { verifyTurnstile: async () => true } });
  });

  const makeTry = async (ip = '203.0.113.7') => (await api.request('POST', '/api/try', { turnstileToken: 'ok' }, { 'CF-Connecting-IP': ip })).status;

  it('counts a made try, and its robot work in the day\'s Quick Try row, not on its guest teacher', async () => {
    expect(await makeTry()).toBe(201);
    const test = await api.db.prepare('SELECT id FROM tests WHERE quick_try = 1').first<{ id: number }>();
    await logRobotWork(api.db, { testId: test!.id, kind: 'barem', variant: 'class', ok: true, tokens: 70, at: new Date().toISOString() });
    await logRobotWork(api.db, { testId: test!.id, kind: 'grading', variant: 'class', ok: true, tokens: 30, at: new Date().toISOString() });
    const rows = await days();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ quick_try: 1, teacher_id: 0, tries: 1, barems: 1, papers: 1, tokens: 100 });
  });

  it('does not count a try refused by the limit', async () => {
    for (let i = 0; i < QUICK_TRY_IP_LIMIT; i++) expect(await makeTry()).toBe(201);
    expect(await makeTry()).toBe(429);
    expect((await days())[0]).toMatchObject({ quick_try: 1, tries: QUICK_TRY_IP_LIMIT });
  });

  it('keeps the counts after the try is deleted', async () => {
    expect(await makeTry()).toBe(201);
    const test = await api.db.prepare('SELECT id FROM tests WHERE quick_try = 1').first<{ id: number }>();
    await logRobotWork(api.db, { testId: test!.id, kind: 'grading', variant: 'class', ok: true, tokens: 5, at: new Date().toISOString() });
    expect(await cleanUpTries(api.env, '2099-01-01T00:00:00.000Z')).toBe(1);
    expect(await api.db.prepare('SELECT COUNT(*) AS n FROM teachers WHERE quick_try = 1').first()).toEqual({ n: 0 });
    expect((await days())[0]).toMatchObject({ quick_try: 1, tries: 1, papers: 1, tokens: 5 });
  });
});

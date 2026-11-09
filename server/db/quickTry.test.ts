import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bucharestDay, QUICK_TRY_DAILY_LIMIT, QUICK_TRY_IP_LIMIT } from '../../shared/quickTry.ts';
import { createQuickTry, dailyLimitReached, findQuickTry, type NewQuickTry } from './quickTry.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let made = 0;

beforeEach(async () => {
  api = await startTestApi();
});

afterEach(async () => {
  await api.dispose();
});

const NOW = '2026-11-09T10:00:00.000Z';

// A new try's input; each call gets its own token and email.
function input(overrides: Partial<NewQuickTry> = {}): NewQuickTry {
  made += 1;
  return {
    tokenHash: `token-hash-${made}`,
    ipHash: 'ip-a',
    byAdmin: false,
    email: `try-${made}@quick-try.invalid`,
    sessionHash: `session-hash-${made}`,
    resultToken: `result${String(made).padStart(18, 'a')}`,
    now: NOW,
    ...overrides,
  };
}

async function fill(count: number, overrides: Partial<NewQuickTry> = {}): Promise<void> {
  for (let i = 0; i < count; i++) {
    const made = await createQuickTry(api.db, input(overrides));
    if (typeof made === 'string') throw new Error(`refused: ${made}`);
  }
}

// Marks the paper of the most recent try as failed for good.
const failLastPaper = () =>
  api.db
    .prepare("UPDATE submissions SET status = 'failed' WHERE test_id = (SELECT MAX(t.id) FROM tests t WHERE t.quick_try = 1)")
    .run();

describe('bucharestDay', () => {
  it('names the day in Romania, which starts before UTC midnight', () => {
    expect(bucharestDay(new Date('2026-11-09T21:59:59.000Z'))).toBe('2026-11-09');
    expect(bucharestDay(new Date('2026-11-09T22:00:00.000Z'))).toBe('2026-11-10');
    expect(bucharestDay(new Date('2026-07-09T20:59:59.000Z'))).toBe('2026-07-09');
    expect(bucharestDay(new Date('2026-07-09T21:00:00.000Z'))).toBe('2026-07-10');
  });
});

describe('createQuickTry', () => {
  it('makes a hidden guest teacher with one class, student, open test and paper', async () => {
    const created = await createQuickTry(api.db, input({ tokenHash: 'th-1', sessionHash: 'sh-1' }));
    expect(created).toEqual({ teacherId: expect.any(Number), code: 'PROBA-26T1' });
    const { teacherId } = created as { teacherId: number };
    const teacher = await api.db.prepare('SELECT name, status, quick_try, demo, role FROM teachers WHERE id = ?').bind(teacherId).first();
    expect(teacher).toEqual({ name: 'Încercare', status: 'disabled', quick_try: 1, demo: 0, role: 'teacher' });
    const test = await api.db
      .prepare(
        `SELECT t.status, t.quick_try, t.title, t.started_at, t.upload_token, c.name AS class_name, c.school_year
         FROM tests t JOIN classes c ON c.id = t.class_id WHERE t.teacher_id = ?`,
      )
      .bind(teacherId)
      .first();
    expect(test).toEqual({
      status: 'open',
      quick_try: 1,
      title: 'Încercare rapidă',
      started_at: NOW,
      upload_token: null,
      class_name: 'PROBA',
      school_year: 2026,
    });
    const paper = await api.db
      .prepare(
        `SELECT s.status, st.full_name, e.active FROM submissions s JOIN students st ON st.id = s.student_id
         JOIN enrollments e ON e.student_id = st.id WHERE st.teacher_id = ?`,
      )
      .bind(teacherId)
      .first();
    expect(paper).toEqual({ status: 'uploading', full_name: 'Elev', active: 1 });
    expect(await findQuickTry(api.db, 'th-1')).toEqual({
      teacherId,
      testId: expect.any(Number),
      code: 'PROBA-26T1',
      schoolYear: 2026,
      studentId: expect.any(Number),
      submissionId: expect.any(Number),
      sessionHash: 'sh-1',
      createdAt: NOW,
      expiresAt: '2026-11-16T10:00:00.000Z',
    });
  });

  it('finds no try for an unknown token', async () => {
    expect(await findQuickTry(api.db, 'nothing')).toBeNull();
  });

  it(`refuses the ${QUICK_TRY_IP_LIMIT + 1}th try of one IP on one day, and inserts nothing`, async () => {
    await fill(QUICK_TRY_IP_LIMIT);
    const before = await api.db.prepare('SELECT COUNT(*) AS n FROM teachers').first<{ n: number }>();
    expect(await createQuickTry(api.db, input())).toBe('ip_limit');
    const after = await api.db.prepare('SELECT COUNT(*) AS n FROM teachers').first<{ n: number }>();
    expect(after!.n).toBe(before!.n);
    expect(await createQuickTry(api.db, input({ ipHash: 'ip-b' }))).toEqual(expect.objectContaining({ code: 'PROBA-26T1' }));
  });

  it('counts the IP limit per Bucharest day', async () => {
    await fill(QUICK_TRY_IP_LIMIT, { now: '2026-11-09T21:30:00.000Z' });
    expect(await createQuickTry(api.db, input({ now: '2026-11-09T21:45:00.000Z' }))).toBe('ip_limit');
    expect(typeof (await createQuickTry(api.db, input({ now: '2026-11-09T22:30:00.000Z' })))).toBe('object');
  });

  it('gives the IP its place back when a try failed', async () => {
    await fill(QUICK_TRY_IP_LIMIT);
    await failLastPaper();
    expect(typeof (await createQuickTry(api.db, input()))).toBe('object');
    expect(await createQuickTry(api.db, input())).toBe('ip_limit');
  });

  it(`refuses the ${QUICK_TRY_DAILY_LIMIT + 1}th try of the day, even after failures`, async () => {
    for (let i = 0; i < QUICK_TRY_DAILY_LIMIT; i++) await fill(1, { ipHash: `ip-${i}` });
    await failLastPaper();
    expect(await dailyLimitReached(api.db, NOW)).toBe(true);
    expect(await createQuickTry(api.db, input({ ipHash: 'ip-new' }))).toBe('daily_limit');
    expect(await dailyLimitReached(api.db, '2026-11-10T10:00:00.000Z')).toBe(false);
  });

  it('lets an administrator skip both limits without being counted', async () => {
    await fill(QUICK_TRY_IP_LIMIT);
    expect(typeof (await createQuickTry(api.db, input({ byAdmin: true })))).toBe('object');
    for (let i = 1; i < QUICK_TRY_DAILY_LIMIT - QUICK_TRY_IP_LIMIT; i++) await fill(1, { ipHash: `ip-${i}` });
    expect(await dailyLimitReached(api.db, NOW)).toBe(false);
    await fill(5, { byAdmin: true });
    expect(await dailyLimitReached(api.db, NOW)).toBe(false);
    await fill(1, { ipHash: 'ip-last' });
    expect(await dailyLimitReached(api.db, NOW)).toBe(true);
    expect(typeof (await createQuickTry(api.db, input({ byAdmin: true })))).toBe('object');
  });
});

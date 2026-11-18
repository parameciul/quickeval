import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_USAGE } from '../../shared/usage.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// GET /api/admin/stats: the usage statistics on Setări.

let api: TestApi;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 18 November 2026, 01:30 in Bucharest: still 17 November in UTC.
  vi.setSystemTime(new Date('2026-11-17T23:30:00.000Z'));
  api = await startTestApi();
});

afterEach(async () => {
  await api.dispose();
  vi.useRealTimers();
});

const addDay = (day: string, quickTry: number, teacherId: number, counts: Record<string, number>) => {
  const names = Object.keys(counts);
  return api.db
    .prepare(`INSERT INTO usage_days (day, quick_try, teacher_id, ${names.join(', ')}) VALUES (?, ?, ?, ${names.map(() => '?').join(', ')})`)
    .bind(day, quickTry, teacherId, ...Object.values(counts))
    .run();
};

const stats = async (source: string, period: string) => {
  const res = await api.request('GET', `/api/admin/stats?source=${source}&period=${period}`);
  expect(res.status).toBe(200);
  return res.body.stats;
};

describe('GET /api/admin/stats', () => {
  beforeEach(async () => {
    await addDay('2026-11-18', 0, api.teacherId, { papers: 5, barems: 1, tokens: 500 });
    await addDay('2026-11-18', 0, 777, { papers: 2, exercise_lists: 1, failed: 1, tokens: 200 });
    await addDay('2026-11-18', 1, 0, { papers: 1, barems: 1, tries: 3, tokens: 90 });
    await addDay('2026-11-16', 0, api.teacherId, { analyses: 1, prints: 2, tokens: 40 });
    await addDay('2026-11-12', 0, api.teacherId, { papers: 9 });
    await addDay('2026-10-20', 1, 0, { tries: 4 });
    await addDay('2025-11-30', 0, api.teacherId, { papers: 100 });
  });

  it('adds every teacher and Quick Try for each of the last 7 Bucharest days, today first, with zeros for a day with no work', async () => {
    const body = await stats('all', '7d');
    expect(body.rows.map((row: { key: string }) => row.key)).toEqual(['2026-11-18', '2026-11-17', '2026-11-16', '2026-11-15', '2026-11-14', '2026-11-13', '2026-11-12']);
    expect(body.rows[0]).toEqual({ key: '2026-11-18', papers: 8, barems: 2, exerciseLists: 1, analyses: 0, prints: 0, failed: 1, tokens: 790, tries: 3 });
    expect(body.rows[1]).toEqual({ key: '2026-11-17', ...EMPTY_USAGE });
    expect(body.totals).toEqual({ papers: 17, barems: 2, exerciseLists: 1, analyses: 1, prints: 2, failed: 1, tokens: 830, tries: 3 });
    expect(body).toMatchObject({ source: 'all', period: '7d' });
  });

  it('keeps Quick Try and the teachers apart', async () => {
    expect((await stats('quick-try', '7d')).totals).toEqual({ ...EMPTY_USAGE, papers: 1, barems: 1, tries: 3, tokens: 90 });
    expect((await stats('teachers', '7d')).totals).toEqual({ ...EMPTY_USAGE, papers: 16, barems: 1, exerciseLists: 1, analyses: 1, prints: 2, failed: 1, tokens: 740 });
  });

  it('gives 30 days', async () => {
    const body = await stats('quick-try', '30d');
    expect(body.rows).toHaveLength(30);
    expect(body.rows.at(-1).key).toBe('2026-10-20');
    expect(body.totals.tries).toBe(7);
  });

  it('gives the last 12 calendar months, and leaves out the month before them', async () => {
    const body = await stats('all', '12m');
    expect(body.rows).toHaveLength(12);
    expect(body.rows[0]).toMatchObject({ key: '2026-11', papers: 17, tries: 3 });
    expect(body.rows[1]).toMatchObject({ key: '2026-10', tries: 4 });
    expect(body.rows.at(-1)).toEqual({ key: '2025-12', ...EMPTY_USAGE });
    expect(body.totals.papers).toBe(17);
  });

  it('refuses a source or a period it does not know', async () => {
    for (const query of ['source=toate&period=7d', 'source=all&period=1y', 'source=all', '']) {
      const res = await api.request('GET', `/api/admin/stats?${query}`);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Statistica cerută nu este validă.');
    }
  });

  it('is only for administrators', async () => {
    await api.addTeacher('bogdan@example.com', 'Bogdan');
    api.env.DEV_TEACHER_EMAIL = 'bogdan@example.com';
    const res = await api.request('GET', '/api/admin/stats?source=all&period=7d');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('admin_only');
  });
});

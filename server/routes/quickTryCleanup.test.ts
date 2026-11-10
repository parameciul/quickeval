import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { QUICK_TRY_CLEANUP_BATCH } from '../../shared/quickTry.ts';
import { sha256Hex } from '../secrets.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// Each visit of the landing page (GET /api/try/availability) deletes a few
// tries whose 7 days are over: their files, then their rows (spec §5).

let api: TestApi;

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7 ${text}`);
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

beforeEach(async () => {
  api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined }, app: { verifyTurnstile: async () => true } });
});

afterEach(async () => {
  await api.dispose();
});

const put = (path: string, bytes: BodyInit, type: string, name: string) =>
  api.fetch(path, { method: 'PUT', body: bytes, headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(name) } });

// A try with its test, its barem and one page of the paper.
async function fullTry(ip = '203.0.113.5'): Promise<{ token: string; teacherId: number }> {
  const res = await api.request('POST', '/api/try', { turnstileToken: 'ok' }, { 'CF-Connecting-IP': ip });
  const { token, code } = res.body as { token: string; code: string };
  for (const kind of ['test', 'barem'] as const) {
    expect((await put(`/api/try/${token}/tests/${code}/files/${kind}`, pdf(kind), PDF_TYPE, `${kind}.pdf`)).status).toBe(200);
  }
  expect((await put(`/api/try/${token}/paper`, jpeg(), 'image/jpeg', 'pagina1.jpg')).status).toBe(201);
  const row = await api.db.prepare('SELECT teacher_id FROM quick_tries WHERE token_hash = ?').bind(await sha256Hex(token)).first<{ teacher_id: number }>();
  return { token, teacherId: row!.teacher_id };
}

const expire = (teacherId: number, at = '2020-01-01T00:00:00.000Z') =>
  api.db.prepare('UPDATE quick_tries SET expires_at = ? WHERE teacher_id = ?').bind(at, teacherId).run();

// The R2 keys of a try's files, from its rows.
async function keysOf(teacherId: number): Promise<string[]> {
  const rows = await api.db
    .prepare(
      `SELECT test_file_key AS k FROM tests WHERE teacher_id = ?1 UNION ALL SELECT barem_file_key FROM tests WHERE teacher_id = ?1
       UNION ALL SELECT f.r2_key FROM submission_files f JOIN submissions s ON s.id = f.submission_id JOIN tests t ON t.id = s.test_id WHERE t.teacher_id = ?1`,
    )
    .bind(teacherId)
    .all<{ k: string | null }>();
  return rows.results.map((row) => row.k).filter((key): key is string => key !== null);
}

// The rows a try has in every table it writes.
async function rowsOf(teacherId: number): Promise<number> {
  const row = await api.db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM teachers WHERE id = ?1) + (SELECT COUNT(*) FROM quick_tries WHERE teacher_id = ?1)
         + (SELECT COUNT(*) FROM classes WHERE teacher_id = ?1) + (SELECT COUNT(*) FROM students WHERE teacher_id = ?1)
         + (SELECT COUNT(*) FROM enrollments e JOIN students s ON s.id = e.student_id WHERE s.teacher_id = ?1)
         + (SELECT COUNT(*) FROM tests WHERE teacher_id = ?1) AS n`,
    )
    .bind(teacherId)
    .first<{ n: number }>();
  return row!.n;
}

const visit = () => api.request('GET', '/api/try/availability');

describe('deleting tries whose 7 days are over', () => {
  it("deletes an expired try's files and rows when the landing page is visited", async () => {
    const old = await fullTry();
    const keys = await keysOf(old.teacherId);
    expect(keys).toHaveLength(3);
    await expire(old.teacherId);
    expect((await visit()).status).toBe(200);
    expect(await rowsOf(old.teacherId)).toBe(0);
    expect((await api.db.prepare('SELECT COUNT(*) AS n FROM submission_files').first<{ n: number }>())!.n).toBe(0);
    for (const key of keys) expect(await api.env.FILES.head(key)).toBeNull();
    expect((await api.request('GET', `/api/try/${old.token}`)).body.error).toBe('unknown_try');
  });

  it('keeps a try whose 7 days are not over', async () => {
    const fresh = await fullTry();
    const rows = await rowsOf(fresh.teacherId);
    await visit();
    expect(await rowsOf(fresh.teacherId)).toBe(rows);
    for (const key of await keysOf(fresh.teacherId)) expect(await api.env.FILES.head(key)).not.toBeNull();
  });

  it(`deletes at most ${QUICK_TRY_CLEANUP_BATCH} tries per visit, the oldest first`, async () => {
    const tries = [];
    for (let i = 0; i <= QUICK_TRY_CLEANUP_BATCH; i++) tries.push(await fullTry(`198.51.100.${i}`));
    for (const [i, one] of tries.entries()) await expire(one.teacherId, `2020-01-0${i + 1}T00:00:00.000Z`);
    await visit();
    const left = await Promise.all(tries.map(async (one) => (await rowsOf(one.teacherId)) > 0));
    expect(left).toEqual([...Array<boolean>(QUICK_TRY_CLEANUP_BATCH).fill(false), true]);
    await visit();
    expect(await rowsOf(tries[QUICK_TRY_CLEANUP_BATCH]!.teacherId)).toBe(0);
  });

  it("never touches a teacher's own classes, students and tests", async () => {
    const before = await rowsOf(api.teacherId);
    const old = await fullTry();
    await expire(old.teacherId);
    await visit();
    expect(await rowsOf(api.teacherId)).toBe(before);
  });

  it('keeps the rows when the files could not be deleted, so the next visit finds them again', async () => {
    const old = await fullTry();
    await expire(old.teacherId);
    const files = api.env.FILES;
    api.env.FILES = new Proxy(files, {
      get: (target, name) =>
        name === 'delete'
          ? async () => {
              throw new Error('R2 is down');
            }
          : (Reflect.get(target, name) as (...args: unknown[]) => unknown).bind(target),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await visit()).status).toBe(200);
    expect(await rowsOf(old.teacherId)).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalled();
    api.env.FILES = files;
    await visit();
    expect(await rowsOf(old.teacherId)).toBe(0);
  });
});

describe('GET /api/try/availability', () => {
  it("gives the form the Turnstile site key, or null when it is not set", async () => {
    expect((await visit()).body.siteKey).toBeNull();
    await api.dispose();
    api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined, TURNSTILE_SITE_KEY: '1x00000000000000000000AA' } });
    expect((await visit()).body).toEqual({ dailyLimitReached: false, admin: false, siteKey: '1x00000000000000000000AA' });
  });
});

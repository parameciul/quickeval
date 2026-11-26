import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../passwords.ts';
import { splitSql, startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi();
});

afterEach(async () => {
  vi.useRealTimers();
  await api.dispose();
});

const seen = async (id: number) =>
  (await api.db.prepare('SELECT last_seen_at, last_login_at FROM teachers WHERE id = ?').bind(id).first<{ last_seen_at: string | null; last_login_at: string | null }>())!;

const at = (iso: string) => vi.setSystemTime(new Date(iso));

describe("the account's last use", () => {
  it('is written when the app loads, at most once an hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at('2026-11-26T08:00:00.000Z');
    expect((await api.request('GET', '/api/admin/me')).status).toBe(200);
    expect((await seen(api.teacherId)).last_seen_at).toBe('2026-11-26T08:00:00.000Z');

    at('2026-11-26T08:59:59.000Z');
    await api.request('GET', '/api/admin/me');
    expect((await seen(api.teacherId)).last_seen_at).toBe('2026-11-26T08:00:00.000Z');

    at('2026-11-26T09:00:00.000Z');
    await api.request('GET', '/api/admin/me');
    expect((await seen(api.teacherId)).last_seen_at).toBe('2026-11-26T09:00:00.000Z');
  });

  it('is not written by other reads, such as the version check', async () => {
    await api.request('GET', '/api/admin/version');
    expect((await seen(api.teacherId)).last_seen_at).toBeNull();
  });

  it('is written by a login, with the last login', async () => {
    api.env.DEV_TEACHER_EMAIL = undefined;
    const id = await api.addTeacher('ana@example.com', 'Ana');
    await api.db.prepare('UPDATE teachers SET password_hash = ? WHERE id = ?').bind(await hashPassword('parola-lunga-1'), id).run();
    expect((await api.request('POST', '/api/auth/login', { email: 'ana@example.com', password: 'parola-lunga-1' })).status).toBe(200);
    const row = await seen(id);
    expect(row.last_login_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(row.last_seen_at).toBe(row.last_login_at);
  });

  it('shows on the account in Setări', async () => {
    await api.request('GET', '/api/admin/me');
    const res = await api.request('GET', `/api/admin/accounts/${api.teacherId}`);
    expect(res.body.account.lastSeenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('leaves the history of the account alone', async () => {
    const before = await api.db.prepare('SELECT COUNT(*) AS n FROM account_events').first<{ n: number }>();
    await api.request('GET', '/api/admin/me');
    const after = await api.db.prepare('SELECT COUNT(*) AS n FROM account_events').first<{ n: number }>();
    expect(after!.n).toBe(before!.n);
  });
});

// Migration 0040 fills the last login of the accounts that logged in before
// it was kept, from the logins the database remembers.
describe('the last login filled by the migration', () => {
  const backfill = splitSql(readFileSync(new URL('../../migrations/0040_last_seen.sql', import.meta.url), 'utf8')).filter(
    (statement) => !statement.startsWith('ALTER'),
  );
  const run = () => api.db.batch(backfill.map((statement) => api.db.prepare(statement)));

  it('takes the newest session or logged-in browser, and keeps a login already kept', async () => {
    const ana = await api.addTeacher('ana@example.com', 'Ana');
    const bogdan = await api.addTeacher('bogdan@example.com', 'Bogdan');
    const dan = await api.addTeacher('dan@example.com', 'Dan');
    const kept = await api.addTeacher('kept@example.com', 'Kept');
    await api.db.batch([
      api.db.prepare('UPDATE teachers SET last_login_at = NULL, last_seen_at = NULL'),
      api.db.prepare("UPDATE teachers SET last_login_at = '2026-11-20T10:00:00.000Z' WHERE id = ?").bind(kept),
      // Ana: a session and an older browser.
      api.db.prepare("INSERT INTO sessions (token_hash, teacher_id, created_at, expires_at) VALUES ('s1', ?, '2026-11-10T09:55:21.723Z', '2026-12-10T09:55:21.723Z')").bind(ana),
      api.db.prepare("INSERT INTO trusted_devices (token_hash, teacher_id, created_at, last_used_at) VALUES ('d1', ?, '2026-11-09T08:19:21.774Z', '2026-11-25T00:00:00.000Z')").bind(ana),
      // Bogdan: only a browser (he logged out); its last use was a wrong password.
      api.db.prepare("INSERT INTO trusted_devices (token_hash, teacher_id, created_at, last_used_at) VALUES ('d2', ?, '2026-11-05T12:00:00.000Z', '2026-11-07T21:34:50.427Z')").bind(bogdan),
      // Kept: an older session than the login it has.
      api.db.prepare("INSERT INTO sessions (token_hash, teacher_id, created_at, expires_at) VALUES ('s2', ?, '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z')").bind(kept),
    ]);
    await run();
    expect(await seen(ana)).toEqual({ last_login_at: '2026-11-10T09:55:21.723Z', last_seen_at: '2026-11-10T09:55:21.723Z' });
    expect(await seen(bogdan)).toEqual({ last_login_at: '2026-11-05T12:00:00.000Z', last_seen_at: '2026-11-05T12:00:00.000Z' });
    expect(await seen(dan)).toEqual({ last_login_at: null, last_seen_at: null });
    expect(await seen(kept)).toEqual({ last_login_at: '2026-11-20T10:00:00.000Z', last_seen_at: '2026-11-20T10:00:00.000Z' });
  });
});

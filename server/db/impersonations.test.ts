import type { D1Database } from '@cloudflare/workers-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startTestApi, type TestApi } from '../test/testApi.ts';
import { closeDeadView, endView, findView, listAccountViews, startView, VIEW_KEEP_DAYS, VIEW_MS } from './impersonations.ts';

const NOW = '2026-11-25T10:00:00.000Z';
const LATER = '2026-11-25T10:30:00.000Z';
const AFTER_HOUR = '2026-11-25T11:00:01.000Z';
const FUTURE = '2027-01-01T00:00:00.000Z';
const SESSION = 'session-hash';
const TOKEN = 'view-token-hash';

let api: TestApi;
let db: D1Database;
let anaId: number;

async function addSession(hash: string, teacherId: number, expiresAt = FUTURE) {
  await db
    .prepare('INSERT INTO sessions (token_hash, teacher_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(hash, teacherId, NOW, expiresAt)
    .run();
}

const count = async () => (await db.prepare('SELECT COUNT(*) AS n FROM impersonations').first<{ n: number }>())!.n;
const view = (over: Partial<Parameters<typeof startView>[1]> = {}) => ({
  adminId: api.teacherId,
  teacherId: anaId,
  sessionHash: SESSION,
  tokenHash: TOKEN,
  mode: 'view' as const,
  ...over,
});
const row = (token = TOKEN) =>
  db.prepare('SELECT * FROM impersonations WHERE token_hash = ?').bind(token).first<Record<string, any>>();

beforeEach(async () => {
  api = await startTestApi();
  db = api.db;
  anaId = await api.addTeacher('ana@example.com', 'Ana Pop');
  await addSession(SESSION, api.teacherId);
});
afterEach(() => api.dispose());

describe('startView', () => {
  it('closes open views past their time when a new one starts', async () => {
    await startView(db, view({ tokenHash: 'old', sessionHash: 'so' }), NOW);
    await startView(db, view(), AFTER_HOUR);
    expect(await row('old')).toMatchObject({ ended_at: '2026-11-25T11:00:00.000Z', end_reason: 'expired' });
    expect(await row()).toMatchObject({ ended_at: null, end_reason: null });
  });

  it("leaves the session's live view live when the new start is refused", async () => {
    await startView(db, view(), NOW);
    const boss = await api.addTeacher('boss@example.com', 'Boss', { role: 'admin' });
    expect(await startView(db, view({ teacherId: boss, tokenHash: 'second' }), LATER)).toBeNull();
    expect(await row()).toMatchObject({ ended_at: null, end_reason: null });
  });

  it('makes a live view of an active teacher', async () => {
    const viewing = await startView(db, view(), NOW);
    expect(viewing).toMatchObject({ teacher: { id: anaId, name: 'Ana Pop' }, mode: 'view', expiresAt: new Date(Date.parse(NOW) + VIEW_MS).toISOString() });
    expect(viewing!.expiresAt).toBe('2026-11-25T11:00:00.000Z');
    expect(await count()).toBe(1);
  });

  it.each([
    ['an administrator', async () => api.addTeacher('boss@example.com', 'Boss', { role: 'admin' })],
    ['a closed account', async () => setOn(await api.addTeacher('c@example.com', 'C'), "status = 'disabled'")],
    ['a pending account', async () => setOn(await api.addTeacher('p@example.com', 'P'), "status = 'pending'")],
    ['a Quick Try guest', async () => setOn(await api.addTeacher('g@example.com', 'G'), 'quick_try = 1')],
  ])('refuses %s', async (_name, make) => {
    const target = await make();
    expect(await startView(db, view({ teacherId: target }), NOW)).toBeNull();
    expect(await count()).toBe(0);
  });

  it('refuses a caller who is not an active admin', async () => {
    await addSession('ana-session', anaId);
    const other = await api.addTeacher('bea@example.com', 'Bea');
    expect(await startView(db, view({ adminId: anaId, teacherId: other, sessionHash: 'ana-session' }), NOW)).toBeNull();
    await setOn(api.teacherId, "status = 'disabled'");
    expect(await startView(db, view(), NOW)).toBeNull();
    expect(await count()).toBe(0);
  });

  it('ends the older live view of the same session', async () => {
    await startView(db, view(), NOW);
    await startView(db, view({ tokenHash: 'second' }), LATER);
    expect(await row()).toMatchObject({ end_reason: 'replaced', ended_at: LATER });
    expect(await row('second')).toMatchObject({ ended_at: null, end_reason: null });
  });

  it('deletes rows started more than 365 days ago', async () => {
    const old = new Date(Date.parse(NOW) - (VIEW_KEEP_DAYS + 1) * 86_400_000).toISOString();
    await db
      .prepare("INSERT INTO impersonations (token_hash, session_hash, admin_id, teacher_id, mode, started_at, expires_at) VALUES ('old', 'x', ?, ?, 'view', ?, ?)")
      .bind(api.teacherId, anaId, old, old)
      .run();
    await startView(db, view(), NOW);
    expect(await row('old')).toBeNull();
    expect(await count()).toBe(1);
  });

  it("starts the admin's count of wrong passwords again", async () => {
    await db.prepare("UPDATE teachers SET failed_logins = 3, locked_until = ? WHERE id = ?").bind(FUTURE, api.teacherId).run();
    await startView(db, view(), NOW);
    const admin = await db.prepare('SELECT failed_logins, locked_until FROM teachers WHERE id = ?').bind(api.teacherId).first();
    expect(admin).toEqual({ failed_logins: 0, locked_until: null });
  });
});

async function setOn(id: number, assignment: string): Promise<number> {
  await db.prepare(`UPDATE teachers SET ${assignment} WHERE id = ?`).bind(id).run();
  return id;
}

describe('findView', () => {
  it('returns the teacher only for the same session', async () => {
    await startView(db, view(), NOW);
    const found = await findView(db, TOKEN, SESSION, LATER);
    expect(found).toMatchObject({ adminId: api.teacherId, viewing: { teacher: { id: anaId, name: 'Ana Pop' }, mode: 'view' }, teacher: { id: anaId, email: 'ana@example.com', role: 'teacher' } });
    expect(await findView(db, TOKEN, 'other-session', LATER)).toBeNull();
    expect(await findView(db, 'other-token', SESSION, LATER)).toBeNull();
  });

  it.each([
    ['expired', async () => undefined, AFTER_HOUR],
    ['ended', async () => endView(db, TOKEN, NOW), LATER],
    ['the session gone', async () => void (await db.prepare('DELETE FROM sessions').run()), LATER],
    ['the session expired', async () => void (await db.prepare('UPDATE sessions SET expires_at = ?').bind(NOW).run()), LATER],
    ['the admin demoted', async () => void (await setOn(api.teacherId, "role = 'teacher'")), LATER],
    ['the admin closed', async () => void (await setOn(api.teacherId, "status = 'disabled'")), LATER],
    ['the teacher closed', async () => void (await setOn(anaId, "status = 'disabled'")), LATER],
    ['the teacher made admin', async () => void (await setOn(anaId, "role = 'admin'")), LATER],
  ])('returns null when %s', async (_name, change, at) => {
    await startView(db, view(), NOW);
    await change();
    expect(await findView(db, TOKEN, SESSION, at)).toBeNull();
  });
});

describe('closeDeadView', () => {
  it('writes expired after the time, session_gone otherwise, and keeps an ended row as it was', async () => {
    await startView(db, view(), NOW);
    await closeDeadView(db, TOKEN, LATER);
    expect(await row()).toMatchObject({ ended_at: LATER, end_reason: 'session_gone' });

    await startView(db, view({ tokenHash: 'b', sessionHash: 'sb' }), NOW);
    await closeDeadView(db, 'b', AFTER_HOUR);
    expect(await row('b')).toMatchObject({ ended_at: AFTER_HOUR, end_reason: 'expired' });

    await startView(db, view({ tokenHash: 'c', sessionHash: 'sc' }), NOW);
    await endView(db, 'c', LATER);
    await closeDeadView(db, 'c', AFTER_HOUR);
    expect(await row('c')).toMatchObject({ ended_at: LATER, end_reason: 'exit' });
  });
});

describe('listAccountViews', () => {
  it("lists the newest first with the admin's name", async () => {
    const boss = await api.addTeacher('boss@example.com', 'Boss', { role: 'admin' });
    await addSession('boss-session', boss);
    await startView(db, view(), NOW);
    await endView(db, TOKEN, LATER);
    await startView(db, view({ adminId: boss, sessionHash: 'boss-session', tokenHash: 'second' }), LATER);

    const views = await listAccountViews(db, anaId, LATER);
    expect(views).toEqual([
      { admin: { id: boss, name: 'Boss' }, startedAt: LATER, endedAt: null, endReason: null },
      { admin: { id: api.teacherId, name: 'Laura Miron' }, startedAt: NOW, endedAt: LATER, endReason: 'exit' },
    ]);
    expect(await listAccountViews(db, boss, LATER)).toEqual([]);
  });

  it('gives a null admin once the admin row is gone', async () => {
    await startView(db, view(), NOW);
    await db.prepare('UPDATE impersonations SET admin_id = NULL').run();
    expect(await listAccountViews(db, anaId, LATER)).toEqual([{ admin: null, startedAt: NOW, endedAt: null, endReason: null }]);
  });

  it('lists an open row past its time as expired at its expiry', async () => {
    await startView(db, view(), NOW);
    expect(await listAccountViews(db, anaId, AFTER_HOUR)).toEqual([
      { admin: { id: api.teacherId, name: 'Laura Miron' }, startedAt: NOW, endedAt: '2026-11-25T11:00:00.000Z', endReason: 'expired' },
    ]);
  });

  it('lists at most 50', async () => {
    for (let i = 0; i < 52; i++) {
      await db
        .prepare("INSERT INTO impersonations (token_hash, session_hash, admin_id, teacher_id, mode, started_at, expires_at) VALUES (?, 'x', ?, ?, 'view', ?, ?)")
        .bind(`t${i}`, api.teacherId, anaId, NOW, NOW)
        .run();
    }
    expect(await listAccountViews(db, anaId, LATER)).toHaveLength(50);
  });
});

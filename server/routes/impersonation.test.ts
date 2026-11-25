import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_FAILED_LOGINS } from '../db/accounts.ts';
import { hashPassword } from '../passwords.ts';
import { otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

const ADMIN = 'profesor@example.com';
const PASSWORD = 'parola-lunga-1';

let api: TestApi;
let anaId: number;

async function setPasswordOf(email: string, password: string): Promise<void> {
  await api.db.prepare('UPDATE teachers SET password_hash = ? WHERE email = ?').bind(await hashPassword(password), email).run();
}

function cookieOf(res: { headers: Headers }, name: string): string {
  const found = res.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));
  return found ? found.split(';')[0]! : '';
}

// The Cookie header that sends back the named cookies of the given answers.
function cookies(...parts: string[]): { Cookie: string } {
  return { Cookie: parts.filter(Boolean).join('; ') };
}

async function loginAs(email: string, password = PASSWORD): Promise<string> {
  const res = await api.request('POST', '/api/auth/login', { email, password });
  expect(res.status).toBe(200);
  return cookieOf(res, 'qe_session');
}

const start = (session: string, body: Record<string, unknown> = { mode: 'view', password: PASSWORD }, extra: string[] = []) =>
  api.request('POST', `/api/admin/accounts/${anaId}/impersonation`, body, cookies(session, ...extra));

const viewRows = () =>
  api.db.prepare('SELECT id, end_reason, ended_at FROM impersonations ORDER BY id').all<{ id: number; end_reason: string | null; ended_at: string | null }>();

let session: string;

beforeEach(async () => {
  api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined } });
  await setPasswordOf(ADMIN, PASSWORD);
  await otherTeacherTest(api, 'ana@example.com');
  anaId = (await api.db.prepare("SELECT id FROM teachers WHERE email = 'ana@example.com'").first<{ id: number }>())!.id;
  await setPasswordOf('ana@example.com', PASSWORD);
  session = await loginAs(ADMIN);
});

afterEach(async () => {
  await api.dispose();
});

describe('starting a view', () => {
  it("starts a view and reads the teacher's data", async () => {
    const res = await start(session);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ viewing: { teacher: { id: anaId, name: 'Alt Profesor' }, mode: 'view' } });
    const setCookie = res.headers.getSetCookie().find((cookie) => cookie.startsWith('qe_view='))!;
    expect(setCookie).toMatch(/^qe_view=[A-Za-z0-9_-]{43};/);
    expect(setCookie).toContain('Max-Age=7200');
    expect(setCookie).toContain('Path=/api/admin');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    const view = cookieOf(res, 'qe_view');
    const me = await api.request('GET', '/api/admin/me', undefined, cookies(session, view));
    expect(me.body.teacher.id).toBe(anaId);
    expect(me.body.viewing.teacher.id).toBe(anaId);
    expect((await api.request('GET', '/api/admin/tests/9Z-26T1', undefined, cookies(session, view))).status).toBe(200);
    expect((await api.request('GET', '/api/admin/tests/9Z-26T1', undefined, cookies(session))).status).toBe(404);
  });

  it('without the view cookie nothing changes', async () => {
    await start(session);
    const me = await api.request('GET', '/api/admin/me', undefined, cookies(session));
    expect(me.body.teacher.email).toBe(ADMIN);
    expect(me.body.viewing).toBeNull();
  });

  it('refuses a wrong password', async () => {
    const res = await start(session, { mode: 'view', password: 'alta-parola-1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('wrong_password');
    expect((await viewRows()).results).toHaveLength(0);
  });

  it('counts wrong passwords and stops at the limit', async () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      expect((await start(session, { mode: 'view', password: 'alta-parola-1' })).body.error).toBe('wrong_password');
    }
    const res = await start(session);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('too_many_tries');
  });

  it('refuses a teacher who is not an administrator', async () => {
    const ana = await loginAs('ana@example.com');
    const res = await api.request('POST', `/api/admin/accounts/${anaId}/impersonation`, { mode: 'view', password: PASSWORD }, cookies(ana));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('admin_only');
  });

  it('refuses an account that cannot be viewed', async () => {
    const adminId = api.teacherId;
    const closedId = await api.addTeacher('inchis@example.com', 'Inchis');
    await api.db.prepare("UPDATE teachers SET status = 'disabled' WHERE id = ?").bind(closedId).run();
    const pendingId = await api.addTeacher('asteapta@example.com', 'Asteapta');
    await api.db.prepare("UPDATE teachers SET status = 'pending' WHERE id = ?").bind(pendingId).run();
    const otherAdminId = await api.addTeacher('admin2@example.com', 'Admin Doi', { role: 'admin' });
    for (const id of [adminId, closedId, pendingId, otherAdminId]) {
      const res = await api.request('POST', `/api/admin/accounts/${id}/impersonation`, { mode: 'view', password: PASSWORD }, cookies(session));
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('cannot_view');
    }
    expect((await viewRows()).results).toHaveLength(0);
  });

  it('refuses the development login', async () => {
    await api.dispose();
    api = await startTestApi();
    const teacherId = await api.addTeacher('ana@example.com', 'Ana');
    const res = await api.request('POST', `/api/admin/accounts/${teacherId}/impersonation`, { mode: 'view', password: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('view_needs_login');
  });

  it('refuses to start a view while viewing', async () => {
    const view = cookieOf(await start(session), 'qe_view');
    const res = await start(session, { mode: 'view', password: PASSWORD }, [view]);
    expect(res.status).toBe(403);
  });

  it('good starts do not lock the account', async () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) expect((await start(session)).status).toBe(201);
    expect((await start(session)).status).toBe(201);
    const row = await api.db.prepare('SELECT failed_logins FROM teachers WHERE id = ?').bind(api.teacherId).first<{ failed_logins: number }>();
    expect(row!.failed_logins).toBe(0);
  });
});

describe('ending a view', () => {
  it('ends the view on exit', async () => {
    const view = cookieOf(await start(session), 'qe_view');
    const res = await api.request('DELETE', '/api/admin/impersonation', undefined, cookies(session, view));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ended: true });
    const cleared = res.headers.getSetCookie().find((cookie) => cookie.startsWith('qe_view='))!;
    expect(cleared).toContain('Path=/api/admin');
    expect(cleared).toMatch(/^qe_view=;|Max-Age=0|Expires=/);
    expect((await viewRows()).results[0]!.end_reason).toBe('exit');
    const again = await api.request('GET', '/api/admin/me', undefined, cookies(session, view));
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('impersonation_ended');
  });

  it('ends after one hour', async () => {
    const view = cookieOf(await start(session), 'qe_view');
    await api.db.prepare("UPDATE impersonations SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    const res = await api.request('GET', '/api/admin/me', undefined, cookies(session, view));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('impersonation_ended');
    expect(res.headers.getSetCookie().some((cookie) => cookie.startsWith('qe_view='))).toBe(true);
    expect((await viewRows()).results[0]!.end_reason).toBe('expired');
  });

  it('clears a stale view cookie for a teacher and carries on as that teacher', async () => {
    const view = cookieOf(await start(session), 'qe_view');
    const ana = await loginAs('ana@example.com');
    const res = await api.request('GET', '/api/admin/me', undefined, cookies(ana, view));
    expect(res.status).toBe(200);
    expect(res.body.teacher.id).toBe(anaId);
    expect(res.body.viewing).toBeNull();
    const cleared = res.headers.getSetCookie().find((cookie) => cookie.startsWith('qe_view='))!;
    expect(cleared).toMatch(/^qe_view=;|Max-Age=0|Expires=/);
    expect((await viewRows()).results[0]!.end_reason).toBe('session_gone');
  });

  it("ends with the administrator's login", async () => {
    const view = cookieOf(await start(session), 'qe_view');
    await api.request('POST', '/api/auth/logout', undefined, cookies(session));
    const second = await loginAs(ADMIN);
    const res = await api.request('GET', '/api/admin/me', undefined, cookies(second, view));
    expect(res.status).toBe(409);
    expect((await viewRows()).results[0]!.end_reason).toBe('session_gone');
  });

  it('ends when the administrator is no longer an administrator', async () => {
    const view = cookieOf(await start(session), 'qe_view');
    await api.db.prepare("UPDATE teachers SET role = 'teacher' WHERE id = ?").bind(api.teacherId).run();
    const res = await api.request('GET', '/api/admin/me', undefined, cookies(session, view));
    expect(res.status).toBe(200);
    expect(res.body.teacher.id).toBe(api.teacherId);
    expect(res.body.viewing).toBeNull();
    expect(res.headers.getSetCookie().some((cookie) => cookie.startsWith('qe_view='))).toBe(true);
  });

  it("ends when the teacher's account closes", async () => {
    const view = cookieOf(await start(session), 'qe_view');
    await api.db.prepare("UPDATE teachers SET status = 'disabled' WHERE id = ?").bind(anaId).run();
    const res = await api.request('GET', '/api/admin/me', undefined, cookies(session, view));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('impersonation_ended');
  });

  it('answers the end of a view in English', async () => {
    const view = cookieOf(await start(session), 'qe_view');
    await api.request('DELETE', '/api/admin/impersonation', undefined, cookies(session, view));
    const res = await api.request('GET', '/api/admin/me', undefined, { ...cookies(session, view), 'X-MQ-Lang': 'en' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('The account view has ended.');
  });
});

describe('the data version', () => {
  it('carries the view', async () => {
    const plain = await api.request('GET', '/api/admin/version', undefined, cookies(session));
    expect(plain.body.version.split('|')).toHaveLength(3);
    const started = await start(session);
    const view = cookieOf(started, 'qe_view');
    const res = await api.request('GET', '/api/admin/version', undefined, cookies(session, view));
    const parts = res.body.version.split('|');
    expect(parts).toHaveLength(4);
    expect(parts[3]).toBe(`v${started.body.viewing.id}`);
  });
});

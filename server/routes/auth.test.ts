import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { LOCK_MS, MAX_FAILED_LOGINS, MAX_PENDING_ACCOUNTS } from '../db/accounts.ts';
import type { EmailMessage } from '../email.ts';
import { hashPassword } from '../passwords.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let emails: EmailMessage[];

beforeEach(async () => {
  emails = [];
  // No development login: every teacher request needs the cookie.
  api = await startTestApi({
    env: { DEV_TEACHER_EMAIL: undefined },
    app: {
      sendEmail: async (_env, message) => {
        emails.push(message);
        return true;
      },
    },
  });
});

afterEach(async () => {
  vi.useRealTimers();
  await api.dispose();
});

const signup = (body: Record<string, unknown>) => api.request('POST', '/api/auth/signup', body);
const login = (email: string, password: string) => api.request('POST', '/api/auth/login', { email, password });

// The Cookie header that sends back the login cookie of an answer.
function cookieOf(res: { headers: Headers }): string {
  const setCookie = res.headers.get('Set-Cookie') ?? '';
  return setCookie.split(';')[0]!;
}

async function setPasswordOf(email: string, password: string): Promise<void> {
  await api.db.prepare('UPDATE teachers SET password_hash = ? WHERE email = ?').bind(await hashPassword(password), email).run();
}

describe('POST /api/auth/signup', () => {
  it('makes a pending demo account and tells the administrators', async () => {
    await api.addTeacher('admin2@example.com', 'Admin Doi', { role: 'admin' });
    await api.addTeacher('profesor2@example.com', 'Profesor Doi');
    const res = await signup({ name: '  Ana   Pop ', email: ' Ana.Pop@Example.com ', password: 'parola-lunga' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ status: 'pending' });
    const row = await api.db
      .prepare("SELECT name, role, status, demo, password_hash FROM teachers WHERE email = 'ana.pop@example.com'")
      .first<{ name: string; role: string; status: string; demo: number; password_hash: string }>();
    expect(row).toMatchObject({ name: 'Ana Pop', role: 'teacher', status: 'pending', demo: 1 });
    expect(row!.password_hash).not.toContain('parola-lunga');
    expect(emails).toHaveLength(1);
    expect(emails[0]!.to).toEqual(['profesor@example.com', 'admin2@example.com']);
    expect(emails[0]!.text).toContain('ana.pop@example.com');
    expect(emails[0]!.text).toContain('http://localhost/admin/setari');
  });

  it('refuses an email that already has an account', async () => {
    const res = await signup({ name: 'Laura', email: 'Profesor@example.com', password: 'parola-lunga' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('email_taken');
    expect(emails).toHaveLength(0);
  });

  it.each([
    [{ name: '', email: 'a@example.com', password: 'parola-lunga' }, 'Scrie numele tău.'],
    [{ name: 'Ana', email: 'nu-e-email', password: 'parola-lunga' }, 'Scrie o adresă de email validă.'],
    [{ name: 'Ana', email: 'a@example.com', password: 'scurta' }, 'Parola are între 8 și 200 de caractere.'],
  ])('refuses %j', async (body, message) => {
    const res = await signup(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
  });

  it('keeps at most a fixed number of accounts waiting', async () => {
    const statements = Array.from({ length: MAX_PENDING_ACCOUNTS }, (_, i) =>
      api.db
        .prepare("INSERT INTO teachers (email, name, created_at, status, demo) VALUES (?, 'X', '2026-10-06', 'pending', 1)")
        .bind(`p${i}@example.com`),
    );
    await api.db.batch(statements);
    const res = await signup({ name: 'Ana', email: 'ana@example.com', password: 'parola-lunga' });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('too_many_pending');
  });

  it('refuses a sign-up from another site', async () => {
    const res = await api.request('POST', '/api/auth/signup', { name: 'Ana', email: 'a@example.com', password: 'parola-lunga' }, { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with the right password and opens the teacher API with the cookie', async () => {
    await setPasswordOf('profesor@example.com', 'parola-buna');
    const res = await login('Profesor@Example.com', 'parola-buna');
    expect(res.status).toBe(200);
    expect(res.body.teacher).toMatchObject({ id: api.teacherId, role: 'admin', demo: false });
    const setCookie = res.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toMatch(/^qe_session=[A-Za-z0-9_-]{43};/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/api');
    expect(setCookie).toContain('SameSite=Lax');
    const me = await api.request('GET', '/api/admin/me', undefined, { Cookie: cookieOf(res) });
    expect(me.status).toBe(200);
    expect(me.body.teacher.email).toBe('profesor@example.com');
    const token = cookieOf(res).split('=')[1]!;
    const stored = await api.db.prepare('SELECT token_hash FROM sessions').all<{ token_hash: string }>();
    expect(stored.results).toHaveLength(1);
    expect(stored.results[0]!.token_hash).not.toBe(token);
  });

  it('sets a Secure cookie on https', async () => {
    await setPasswordOf('profesor@example.com', 'parola-buna');
    const res = await createApp().request(
      'https://quickeval.pages.dev/api/auth/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'profesor@example.com', password: 'parola-buna' }) },
      api.env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toContain('Secure');
  });

  it('refuses a wrong password and an unknown email with the same answer', async () => {
    await setPasswordOf('profesor@example.com', 'parola-buna');
    const wrong = await login('profesor@example.com', 'parola-rea');
    const unknown = await login('nimeni@example.com', 'parola-buna');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.headers.get('Set-Cookie')).toBeNull();
  });

  it('refuses an account without a password', async () => {
    expect((await login('profesor@example.com', 'orice-parola')).status).toBe(401);
  });

  it('tells a pending account to wait, but only with the right password', async () => {
    await signup({ name: 'Ana', email: 'ana@example.com', password: 'parola-lunga' });
    expect((await login('ana@example.com', 'alta-parola')).body.error).toBe('wrong_login');
    const res = await login('ana@example.com', 'parola-lunga');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('account_pending');
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('refuses a closed account', async () => {
    await setPasswordOf('profesor@example.com', 'parola-buna');
    await api.db.prepare("UPDATE teachers SET status = 'disabled'").run();
    expect((await login('profesor@example.com', 'parola-buna')).body.error).toBe('account_disabled');
  });

  it('locks the account for 15 minutes after ten wrong passwords in a row', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T10:00:00.000Z'));
    await setPasswordOf('profesor@example.com', 'parola-buna');
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) expect((await login('profesor@example.com', 'gresita')).status).toBe(401);
    const locked = await login('profesor@example.com', 'parola-buna');
    expect(locked.status).toBe(429);
    expect(locked.body.error).toBe('locked');
    vi.setSystemTime(new Date(Date.parse('2026-10-28T10:00:00.000Z') + LOCK_MS + 1000));
    expect((await login('profesor@example.com', 'parola-buna')).status).toBe(200);
  });

  it('starts the count of wrong passwords again after a good login', async () => {
    await setPasswordOf('profesor@example.com', 'parola-buna');
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) await login('profesor@example.com', 'gresita');
    expect((await login('profesor@example.com', 'parola-buna')).status).toBe(200);
    expect((await login('profesor@example.com', 'gresita')).status).toBe(401);
    expect((await login('profesor@example.com', 'parola-buna')).status).toBe(200);
  });
});

describe('sessions', () => {
  it('ends with the logout', async () => {
    await setPasswordOf('profesor@example.com', 'parola-buna');
    const cookie = cookieOf(await login('profesor@example.com', 'parola-buna'));
    const out = await api.request('POST', '/api/auth/logout', undefined, { Cookie: cookie });
    expect(out.status).toBe(200);
    expect(out.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect((await api.request('GET', '/api/admin/me', undefined, { Cookie: cookie })).status).toBe(401);
  });

  it('expires after 30 days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T10:00:00.000Z'));
    await setPasswordOf('profesor@example.com', 'parola-buna');
    const cookie = cookieOf(await login('profesor@example.com', 'parola-buna'));
    vi.setSystemTime(new Date('2026-11-27T09:59:00.000Z'));
    expect((await api.request('GET', '/api/admin/me', undefined, { Cookie: cookie })).status).toBe(200);
    vi.setSystemTime(new Date('2026-11-27T10:00:01.000Z'));
    expect((await api.request('GET', '/api/admin/me', undefined, { Cookie: cookie })).status).toBe(401);
  });

  it('stops working when an administrator closes the account', async () => {
    const teacherId = await api.addTeacher('ana@example.com', 'Ana');
    await setPasswordOf('ana@example.com', 'parola-buna');
    const cookie = cookieOf(await login('ana@example.com', 'parola-buna'));
    expect((await api.request('GET', '/api/admin/me', undefined, { Cookie: cookie })).status).toBe(200);
    await api.db.prepare("UPDATE teachers SET status = 'disabled' WHERE id = ?").bind(teacherId).run();
    expect((await api.request('GET', '/api/admin/me', undefined, { Cookie: cookie })).status).toBe(401);
  });

  it('refuses a made-up cookie', async () => {
    expect((await api.request('GET', '/api/admin/me', undefined, { Cookie: 'qe_session=made-up' })).status).toBe(401);
  });
});

describe('POST /api/admin/account/password', () => {
  it('changes the password, keeps this login, and ends the others', async () => {
    await setPasswordOf('profesor@example.com', 'parola-veche');
    const here = cookieOf(await login('profesor@example.com', 'parola-veche'));
    const elsewhere = cookieOf(await login('profesor@example.com', 'parola-veche'));
    const res = await api.request('POST', '/api/admin/account/password', { currentPassword: 'parola-veche', newPassword: 'parola-noua' }, { Cookie: here });
    expect(res.status).toBe(200);
    expect((await api.request('GET', '/api/admin/me', undefined, { Cookie: here })).status).toBe(200);
    expect((await api.request('GET', '/api/admin/me', undefined, { Cookie: elsewhere })).status).toBe(401);
    expect((await login('profesor@example.com', 'parola-veche')).status).toBe(401);
    expect((await login('profesor@example.com', 'parola-noua')).status).toBe(200);
  });

  it('refuses a wrong current password', async () => {
    await setPasswordOf('profesor@example.com', 'parola-veche');
    const cookie = cookieOf(await login('profesor@example.com', 'parola-veche'));
    const res = await api.request('POST', '/api/admin/account/password', { currentPassword: 'gresita', newPassword: 'parola-noua' }, { Cookie: cookie });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('wrong_password');
  });
});

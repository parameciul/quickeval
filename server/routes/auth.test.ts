import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { LOCK_MS, MAX_FAILED_LOGINS, MAX_PENDING_ACCOUNTS, MAX_SIGNUPS_PER_IP, PENDING_DAYS } from '../db/accounts.ts';
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

// The Cookie header part that sends back a cookie of an answer: the login
// cookie, or the browser's mark (qe_device).
function cookieOf(res: { headers: Headers }, name = 'qe_session'): string {
  const found = res.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));
  return found ? found.split(';')[0]! : '';
}

const loginWith = (cookie: string, email: string, password: string) =>
  api.request('POST', '/api/auth/login', { email, password }, { Cookie: cookie });
const wrongBody = async () => (await login('nimeni@example.com', 'orice-parola')).body;

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
    expect(emails[0]!.text).toContain('Ana Pop');
    expect(emails[0]!.text).toContain('ana.pop@example.com');
    expect(emails[0]!.text).toContain('http://localhost/admin/setari');
  });

  it('answers an email that already has an account as any other, and changes nothing', async () => {
    const before = await api.db.prepare('SELECT * FROM teachers').all();
    const res = await signup({ name: 'Laura', email: 'Profesor@example.com', password: 'parola-lunga' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ status: 'pending' });
    expect((await api.db.prepare('SELECT * FROM teachers').all()).results).toEqual(before.results);
    expect(emails).toHaveLength(0);
  });

  it('takes at most a few sign-ups from one IP in a day', async () => {
    const from = (ip: string, i: number) =>
      api.request('POST', '/api/auth/signup', { name: 'Ana', email: `a${ip}${i}@example.com`, password: 'parola-lunga' }, { 'CF-Connecting-IP': ip });
    for (let i = 0; i < MAX_SIGNUPS_PER_IP; i++) expect((await from('1', i)).status).toBe(201);
    const refused = await from('1', 99);
    expect(refused.status).toBe(429);
    expect(refused.body.error).toBe('too_many_pending');
    expect((await from('2', 0)).status).toBe(201);
    const stored = await api.db.prepare("SELECT signup_ip_hash FROM teachers WHERE email = 'a10@example.com'").first<{ signup_ip_hash: string }>();
    expect(stored!.signup_ip_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('deletes accounts that waited too long, so they free their places', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T10:00:00.000Z'));
    expect((await signup({ name: 'Vechi', email: 'vechi@example.com', password: 'parola-lunga' })).status).toBe(201);
    vi.setSystemTime(new Date(Date.parse('2026-10-01T10:00:00.000Z') + (PENDING_DAYS + 1) * 24 * 60 * 60 * 1000));
    expect((await signup({ name: 'Nou', email: 'nou@example.com', password: 'parola-lunga' })).status).toBe(201);
    const rows = await api.db.prepare("SELECT email FROM teachers WHERE status = 'pending'").all<{ email: string }>();
    expect(rows.results.map((row) => row.email)).toEqual(['nou@example.com']);
  });

  it.each([
    [{ name: '', email: 'a@example.com', password: 'parola-lunga' }, 'Scrie numele tău.'],
    [{ name: 'Ana', email: 'nu-e-email', password: 'parola-lunga' }, 'Scrie o adresă de email validă.'],
    [{ name: 'Ana', email: 'a@example.com', password: 'scurta' }, 'Parola are între 8 și 200 de caractere.'],
    [{ name: 'Vezi https://evil.example', email: 'a@example.com', password: 'parola-lunga' }, 'Numele are doar litere, spații, puncte, apostrofuri și cratime.'],
    [{ name: '-Ana', email: 'a@example.com', password: 'parola-lunga' }, 'Numele are doar litere, spații, puncte, apostrofuri și cratime.'],
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

  it('takes Romanian names with diacritics, hyphens and apostrophes', async () => {
    expect((await signup({ name: "Ioana-Ștefania D'Ângelo Țurcanu", email: 'ioana@example.com', password: 'parola-lunga' })).status).toBe(201);
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

  it('locks the account for 15 minutes after ten wrong passwords in a row, with the same answer as a wrong password', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T10:00:00.000Z'));
    await setPasswordOf('profesor@example.com', 'parola-buna');
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) expect((await login('profesor@example.com', 'gresita')).status).toBe(401);
    const locked = await login('profesor@example.com', 'parola-buna');
    expect(locked.status).toBe(401);
    expect(locked.body).toEqual(await wrongBody());
    expect(locked.headers.get('Set-Cookie')).toBeNull();
    vi.setSystemTime(new Date(Date.parse('2026-10-28T10:00:00.000Z') + LOCK_MS + 1000));
    expect((await login('profesor@example.com', 'parola-buna')).status).toBe(200);
  });

  it('lets no burst of attempts sent at once past the lock', async () => {
    await setPasswordOf('profesor@example.com', 'parola-buna');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T10:00:00.000Z'));
    await Promise.all(Array.from({ length: 30 }, () => login('profesor@example.com', 'gresita')));
    // Exactly MAX_FAILED_LOGINS attempts were taken; the tenth set the lock.
    const row = await api.db
      .prepare("SELECT failed_logins, locked_until FROM teachers WHERE email = 'profesor@example.com'")
      .first<{ failed_logins: number; locked_until: string }>();
    expect(row).toEqual({ failed_logins: MAX_FAILED_LOGINS, locked_until: new Date(Date.parse('2026-10-28T10:00:00.000Z') + LOCK_MS).toISOString() });
    expect((await login('profesor@example.com', 'parola-buna')).status).toBe(401);
  });

  it('starts the count again when a lock ends', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T10:00:00.000Z'));
    await setPasswordOf('profesor@example.com', 'parola-buna');
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await login('profesor@example.com', 'gresita');
    vi.setSystemTime(new Date(Date.parse('2026-10-28T10:00:00.000Z') + LOCK_MS + 1000));
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) expect((await login('profesor@example.com', 'gresita')).status).toBe(401);
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

describe('a browser that logged in before', () => {
  async function knownBrowser(email = 'profesor@example.com', password = 'parola-buna'): Promise<string> {
    await setPasswordOf(email, password);
    const res = await login(email, password);
    expect(res.headers.getSetCookie().find((cookie) => cookie.startsWith('qe_device='))).toContain('Path=/api/auth');
    return cookieOf(res, 'qe_device');
  }
  const lockOut = async () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await login('profesor@example.com', 'gresita');
  };

  it('still logs in while someone else has locked the account, and leaves the lock for the others', async () => {
    const device = await knownBrowser();
    await lockOut();
    expect((await login('profesor@example.com', 'parola-buna')).status).toBe(401);
    const res = await loginWith(device, 'profesor@example.com', 'parola-buna');
    expect(res.status).toBe(200);
    // The known browser keeps its mark; no new one.
    expect(cookieOf(res, 'qe_device')).toBe('');
    expect((await login('profesor@example.com', 'parola-buna')).status).toBe(401);
  });

  it('counts its own wrong passwords, and then logs in only through the account', async () => {
    const device = await knownBrowser();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) expect((await loginWith(device, 'profesor@example.com', 'gresita')).status).toBe(401);
    // The account itself was not locked by them.
    const row = await api.db.prepare("SELECT locked_until FROM teachers WHERE email = 'profesor@example.com'").first<{ locked_until: string | null }>();
    expect(row!.locked_until).toBeNull();
    await lockOut();
    expect((await loginWith(device, 'profesor@example.com', 'parola-buna')).status).toBe(401);
  });

  it('opens nothing for another account', async () => {
    const device = await knownBrowser();
    await api.addTeacher('ana@example.com', 'Ana');
    await setPasswordOf('ana@example.com', 'parola-ana');
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await login('ana@example.com', 'gresita');
    expect((await loginWith(device, 'ana@example.com', 'parola-ana')).status).toBe(401);
  });

  it('opens nothing by itself', async () => {
    const device = await knownBrowser();
    expect((await api.request('GET', '/api/admin/me', undefined, { Cookie: device })).status).toBe(401);
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

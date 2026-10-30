import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EmailMessage } from '../email.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// The test teacher is an administrator (development login).

let api: TestApi;
let emails: EmailMessage[];

beforeEach(async () => {
  emails = [];
  api = await startTestApi({
    app: {
      sendEmail: async (_env, message) => {
        emails.push(message);
        return true;
      },
    },
  });
});

afterEach(async () => {
  await api.dispose();
});

// A sign-up whose email is confirmed with the link it got: the account waits for an administrator.
async function signup(email = 'ana@example.com', options: { confirm?: boolean } = {}): Promise<number> {
  const res = await api.request('POST', '/api/auth/signup', { name: 'Ana Pop', email, password: 'parola-lunga' });
  expect(res.status).toBe(201);
  if (options.confirm !== false) {
    const token = /confirma-email#([\w-]+)/.exec(emails.at(-1)!.text)![1];
    expect((await api.request('POST', '/api/auth/confirm', { token, password: 'parola-lunga' })).status).toBe(200);
  }
  const row = await api.db.prepare('SELECT id FROM teachers WHERE email = ?').bind(email).first<{ id: number }>();
  emails = [];
  return row!.id;
}

const createdAtOf = async (id: number) =>
  (await api.db.prepare('SELECT created_at FROM teachers WHERE id = ?').bind(id).first<{ created_at: string }>())!.created_at;
const approve = async (id: number) => api.request('POST', `/api/admin/accounts/${id}/approve`, { createdAt: await createdAtOf(id) });
const reject = async (id: number) => api.request('POST', `/api/admin/accounts/${id}/reject`, { createdAt: await createdAtOf(id) });

const login = (email: string, password: string) => api.request('POST', '/api/auth/login', { email, password });
const accountOf = async (id: number) =>
  ((await api.request('GET', '/api/admin/accounts')).body.accounts as { id: number }[]).find((account) => account.id === id);

describe('GET /api/admin/accounts', () => {
  it('lists the accounts, the ones that wait first', async () => {
    await api.addTeacher('bogdan@example.com', 'Bogdan');
    const pending = await signup();
    const res = await api.request('GET', '/api/admin/accounts');
    expect(res.status).toBe(200);
    expect(res.body.accounts[0]).toMatchObject({ id: pending, name: 'Ana Pop', status: 'pending', demo: true, role: 'teacher' });
    expect(res.body.accounts.map((a: { email: string }) => a.email)).toEqual(['ana@example.com', 'bogdan@example.com', 'profesor@example.com']);
    expect(JSON.stringify(res.body)).not.toContain('pbkdf2');
  });

  it('is only for administrators', async () => {
    await api.addTeacher('bogdan@example.com', 'Bogdan');
    api.env.DEV_TEACHER_EMAIL = 'bogdan@example.com';
    const res = await api.request('GET', '/api/admin/accounts');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('admin_only');
    expect((await api.request('POST', '/api/admin/accounts/1/approve', { createdAt: 'x' })).status).toBe(403);
  });
});

describe('approving and refusing', () => {
  it('approves a pending account, which can then log in, and tells the teacher', async () => {
    const id = await signup();
    expect((await login('ana@example.com', 'parola-lunga')).body.error).toBe('account_pending');
    const res = await approve(id);
    expect(res.status).toBe(200);
    expect(await accountOf(id)).toMatchObject({ status: 'active', demo: true });
    expect(emails).toEqual([expect.objectContaining({ to: ['ana@example.com'], subject: 'QuickEval: contul tău a fost aprobat' })]);
    expect((await login('ana@example.com', 'parola-lunga')).status).toBe(200);
    expect((await approve(id)).body.error).toBe('not_pending');
  });

  it('refuses a pending account by deleting it, so the email can sign up again', async () => {
    const id = await signup();
    expect((await reject(id)).status).toBe(200);
    expect(await accountOf(id)).toBeUndefined();
    await signup();
  });

  it('neither shows nor approves an account whose email is not confirmed', async () => {
    const id = await signup('ana@example.com', { confirm: false });
    expect(await accountOf(id)).toBeUndefined();
    expect((await approve(id)).body.error).toBe('not_pending');
  });

  it('refuses every account the page shows as waiting at once', async () => {
    const first = await signup('ana@example.com');
    const second = await signup('bianca@example.com');
    const third = await signup('carmen@example.com');
    const shown = await Promise.all([first, second].map(async (id) => ({ id, createdAt: await createdAtOf(id) })));
    await approve(second);
    const res = await api.request('POST', '/api/admin/accounts/reject-all', { accounts: shown });
    expect(res.status).toBe(200);
    // The account approved meanwhile stays, and so does the one the page did not show.
    expect(res.body).toEqual({ deleted: 1 });
    expect(await accountOf(first)).toBeUndefined();
    expect(await accountOf(second)).toMatchObject({ status: 'active' });
    expect(await accountOf(third)).toMatchObject({ status: 'pending' });
  });

  it('refuses all only for administrators', async () => {
    const id = await signup();
    await api.addTeacher('bogdan@example.com', 'Bogdan');
    api.env.DEV_TEACHER_EMAIL = 'bogdan@example.com';
    const res = await api.request('POST', '/api/admin/accounts/reject-all', { accounts: [{ id, createdAt: await createdAtOf(id) }] });
    expect(res.status).toBe(403);
    api.env.DEV_TEACHER_EMAIL = 'profesor@example.com';
    expect(await accountOf(id)).toBeDefined();
  });

  it('never deletes an active account', async () => {
    const id = await api.addTeacher('bogdan@example.com', 'Bogdan');
    const shown = { createdAt: await createdAtOf(id) };
    expect((await api.request('POST', `/api/admin/accounts/${id}/reject`, shown)).body.error).toBe('not_pending');
    expect(await accountOf(id)).toBeDefined();
  });
});

describe('a page opened before an account was refused', () => {
  it('approves or refuses nothing of the next account that got the same id', async () => {
    const first = await signup('ana@example.com');
    const shown = { createdAt: await createdAtOf(first) };
    expect((await reject(first)).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const next = await signup('mallory@example.com');
    expect(next).toBe(first);
    expect((await api.request('POST', `/api/admin/accounts/${first}/approve`, shown)).body.error).toBe('not_pending');
    expect((await api.request('POST', `/api/admin/accounts/${first}/reject`, shown)).body.error).toBe('not_pending');
    expect(await accountOf(next)).toMatchObject({ email: 'mallory@example.com', status: 'pending' });
  });
});

describe('PATCH /api/admin/accounts/:id', () => {
  it('turns a demo account into a complete one', async () => {
    const id = await signup();
    await approve(id);
    const res = await api.request('PATCH', `/api/admin/accounts/${id}`, { demo: false });
    expect(res.status).toBe(200);
    expect(res.body.accounts.find((a: { id: number }) => a.id === id)).toMatchObject({ demo: false });
  });

  it('closes an account and ends its logins, and opens it again', async () => {
    const id = await signup();
    await approve(id);
    expect((await login('ana@example.com', 'parola-lunga')).status).toBe(200);
    expect((await api.request('PATCH', `/api/admin/accounts/${id}`, { status: 'disabled' })).status).toBe(200);
    const sessions = await api.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE teacher_id = ?').bind(id).first<{ n: number }>();
    expect(sessions!.n).toBe(0);
    expect((await login('ana@example.com', 'parola-lunga')).body.error).toBe('account_disabled');
    await api.request('PATCH', `/api/admin/accounts/${id}`, { status: 'active' });
    expect((await login('ana@example.com', 'parola-lunga')).status).toBe(200);
  });

  it('changes no administrator and no pending account', async () => {
    const adminId = await api.addTeacher('admin2@example.com', 'Admin Doi', { role: 'admin' });
    const pending = await signup();
    expect((await api.request('PATCH', `/api/admin/accounts/${adminId}`, { status: 'disabled' })).status).toBe(404);
    expect((await api.request('PATCH', `/api/admin/accounts/${api.teacherId}`, { status: 'disabled' })).status).toBe(404);
    expect((await api.request('PATCH', `/api/admin/accounts/${pending}`, { demo: false })).status).toBe(404);
    expect(await accountOf(pending)).toMatchObject({ status: 'pending', demo: true });
  });

  it('refuses an empty change', async () => {
    const id = await api.addTeacher('bogdan@example.com', 'Bogdan');
    expect((await api.request('PATCH', `/api/admin/accounts/${id}`, {})).status).toBe(400);
  });
});

describe('POST /api/admin/accounts/:id/password', () => {
  it('makes a new password, shown once, that replaces the old one', async () => {
    const id = await signup();
    await approve(id);
    const res = await api.request('POST', `/api/admin/accounts/${id}/password`);
    expect(res.status).toBe(201);
    expect(res.body.password).toMatch(/^[a-z2-7]{12}$/);
    expect((await login('ana@example.com', 'parola-lunga')).status).toBe(401);
    expect((await login('ana@example.com', res.body.password)).status).toBe(200);
  });

  it('tells the teacher by email', async () => {
    const id = await api.addTeacher('bogdan@example.com', 'Bogdan');
    await api.request('POST', `/api/admin/accounts/${id}/password`);
    expect(emails).toEqual([expect.objectContaining({ to: ['bogdan@example.com'], subject: 'QuickEval: parola ta a fost schimbată' })]);
    expect(emails[0]!.text).toContain('Laura Miron');
  });

  it("never changes another administrator's password, nor ends their logins", async () => {
    const id = await api.addTeacher('admin2@example.com', 'Admin Doi', { role: 'admin' });
    await api.db
      .prepare("INSERT INTO sessions (token_hash, teacher_id, created_at, expires_at) VALUES ('h', ?, '2026-10-01', '2099-01-01')")
      .bind(id)
      .run();
    expect((await api.request('POST', `/api/admin/accounts/${id}/password`)).status).toBe(404);
    const row = await api.db.prepare('SELECT password_hash FROM teachers WHERE id = ?').bind(id).first<{ password_hash: string | null }>();
    expect(row!.password_hash).toBeNull();
    expect((await api.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE teacher_id = ?').bind(id).first<{ n: number }>())!.n).toBe(1);
    expect(emails).toHaveLength(0);
  });

  it('does not approve a pending account by giving it a password', async () => {
    const id = await signup();
    expect((await api.request('POST', `/api/admin/accounts/${id}/password`)).status).toBe(404);
  });

  it('sends the administrator to Contul meu for their own password', async () => {
    expect((await api.request('POST', `/api/admin/accounts/${api.teacherId}/password`)).body.error).toBe('own_account');
  });
});

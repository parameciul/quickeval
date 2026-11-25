import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../passwords.ts';
import { newSessionToken, sha256Hex } from '../secrets.ts';
import { addSubmission, otherTeacherTest, startedAtOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

const ADMIN = 'profesor@example.com';
const PASSWORD = 'parola-lunga-1';

let api: TestApi;
let anaId: number;
let session: string;
let view: string;

async function setPasswordOf(email: string, password: string): Promise<void> {
  await api.db.prepare('UPDATE teachers SET password_hash = ? WHERE email = ?').bind(await hashPassword(password), email).run();
}

function cookieOf(res: { headers: Headers }, name: string): string {
  const found = res.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));
  return found ? found.split(';')[0]! : '';
}

function cookies(...parts: string[]): { Cookie: string } {
  return { Cookie: parts.filter(Boolean).join('; ') };
}

async function loginAs(email: string): Promise<string> {
  const res = await api.request('POST', '/api/auth/login', { email, password: PASSWORD });
  expect(res.status).toBe(200);
  return cookieOf(res, 'qe_session');
}

const startView = (sessionCookie: string, id = anaId) =>
  api.request('POST', `/api/admin/accounts/${id}/impersonation`, { mode: 'view', password: PASSWORD }, cookies(sessionCookie));

const viewed = (method: string, path: string, body?: unknown, extra: Record<string, string> = {}) =>
  api.request(method, path, body, { ...cookies(session, view), ...extra });

const count = async (sql: string) => (await api.db.prepare(sql).first<{ n: number }>())!.n;

beforeEach(async () => {
  api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined } });
  await setPasswordOf(ADMIN, PASSWORD);
  await otherTeacherTest(api, 'ana@example.com');
  anaId = (await api.db.prepare("SELECT id FROM teachers WHERE email = 'ana@example.com'").first<{ id: number }>())!.id;
  await setPasswordOf('ana@example.com', PASSWORD);
  session = await loginAs(ADMIN);
  view = cookieOf(await startView(session), 'qe_view');
});

afterEach(async () => {
  await api.dispose();
});

describe('a view is read only', () => {
  it.each([
    ['POST', '/api/admin/classes', { name: '10A', schoolYear: 2026 }],
    ['PATCH', '/api/admin/tests/9Z-26T1', { title: 'Altul' }],
    ['PUT', '/api/admin/accounts/1/marking-scheme-notes', { show: false }],
    ['DELETE', '/api/admin/tests/9Z-26T1', undefined],
  ])('refuses every write method: %s %s', async (method, path, body) => {
    const res = await viewed(method, path, body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('impersonation_read_only');
    expect(await count('SELECT COUNT(*) AS n FROM classes')).toBe(1);
    const test = await api.db.prepare("SELECT title FROM tests WHERE code = '9Z-26T1'").first<{ title: string }>();
    expect(test!.title).toBe('Test străin');
  });

  it('lets reads through', async () => {
    const res = await viewed('GET', '/api/admin/tests?year=2026');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain('9Z-26T1');
  });

  it('lets the exit through', async () => {
    const res = await viewed('DELETE', '/api/admin/impersonation');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ended: true });
  });

  it('refuses the password change of the teacher without counting a try', async () => {
    const res = await viewed('POST', '/api/admin/account/password', { currentPassword: 'gresita-parola-1', newPassword: 'alta-parola-lunga-2' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('impersonation_read_only');
    const row = await api.db.prepare('SELECT failed_logins FROM teachers WHERE id = ?').bind(anaId).first<{ failed_logins: number }>();
    expect(row!.failed_logins).toBe(0);
  });

  it('answers the refusal in English', async () => {
    const res = await viewed('POST', '/api/admin/classes', { name: '10A', schoolYear: 2026 }, { 'X-MQ-Lang': 'en' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Read only: you cannot change anything in another teacher's account.");
  });

  it('refuses to start another view with the read only error', async () => {
    const res = await viewed('POST', `/api/admin/accounts/${anaId}/impersonation`, { mode: 'view', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('impersonation_read_only');
  });
});

describe('the result link in a view', () => {
  let submissionId: number;
  let linkPath: string;

  beforeEach(async () => {
    const studentId = (await api.db.prepare("SELECT id FROM students WHERE full_name = 'Elev Străin'").first<{ id: number }>())!.id;
    submissionId = await addSubmission(api, '9Z-26T1', studentId, { status: 'submitted', files: 1 });
    await api.db.prepare('UPDATE submissions SET result_token = NULL WHERE id = ?').bind(submissionId).run();
    linkPath = `/api/admin/submissions/${submissionId}/result-link?startedAt=${encodeURIComponent(await startedAtOf(api, submissionId))}`;
  });

  it('refuses to make a link', async () => {
    const res = await viewed('GET', linkPath);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('impersonation_read_only');
    const row = await api.db.prepare('SELECT result_token FROM submissions WHERE id = ?').bind(submissionId).first<{ result_token: string | null }>();
    expect(row!.result_token).toBeNull();
  });

  it('gives a link that exists', async () => {
    await api.db.prepare("UPDATE submissions SET result_token = 'tokenexistent0123456789abcdefghijklmnopqrs' WHERE id = ?").bind(submissionId).run();
    const res = await viewed('GET', linkPath);
    expect(res.status).toBe(200);
    expect(res.body.resultToken).toBe('tokenexistent0123456789abcdefghijklmnopqrs');
  });

  it('makes a link without a view', async () => {
    const ana = await loginAs('ana@example.com');
    const res = await api.request('GET', linkPath, undefined, cookies(ana));
    expect(res.status).toBe(200);
    expect(typeof res.body.resultToken).toBe('string');
  });
});

describe('a view of another administrator', () => {
  it('ends when the view belongs to another administrator than the one logged in', async () => {
    await api.dispose();
    api = await startTestApi();
    await otherTeacherTest(api, 'ana@example.com');
    anaId = (await api.db.prepare("SELECT id FROM teachers WHERE email = 'ana@example.com'").first<{ id: number }>())!.id;
    await api.addTeacher('admin2@example.com', 'Admin Doi', { role: 'admin' });
    await setPasswordOf('admin2@example.com', PASSWORD);
    const other = await loginAs('admin2@example.com');
    const admin2 = (await api.db.prepare("SELECT id FROM teachers WHERE email = 'admin2@example.com'").first<{ id: number }>())!.id;
    const token = newSessionToken();
    const now = new Date();
    await api.db
      .prepare(
        `INSERT INTO impersonations (token_hash, session_hash, admin_id, teacher_id, mode, started_at, expires_at)
         VALUES (?, ?, ?, ?, 'view', ?, ?)`,
      )
      .bind(
        await sha256Hex(token),
        await sha256Hex(other.slice('qe_session='.length)),
        admin2,
        anaId,
        now.toISOString(),
        new Date(now.getTime() + 3_600_000).toISOString(),
      )
      .run();
    const otherView = `qe_view=${token}`;
    const res = await api.request('GET', '/api/admin/me', undefined, cookies(other, otherView));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('impersonation_ended');
    expect(res.headers.getSetCookie().some((cookie) => cookie.startsWith('qe_view='))).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EmailMessage } from '../email.ts';
import { addEvaluation, addSubmission, makeClass, makeTest, testIdOf } from '../test/fixtures.ts';
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
    expect(emails).toEqual([expect.objectContaining({ to: ['ana@example.com'], subject: 'MQGrader: contul tău a fost aprobat' })]);
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
    expect(emails).toEqual([expect.objectContaining({ to: ['bogdan@example.com'], subject: 'MQGrader: parola ta a fost schimbată' })]);
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

describe('GET /api/admin/accounts/:id', () => {
  it('shows one account, its history and what it made', async () => {
    const id = await signup();
    const res = await api.request('GET', `/api/admin/accounts/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.account).toMatchObject({
      id,
      name: 'Ana Pop',
      email: 'ana@example.com',
      role: 'teacher',
      status: 'pending',
      demo: true,
      lastLoginAt: null,
      baremsGenerated: 0,
      exerciseListsMade: 0,
      analysesMade: 0,
      printsMade: 0,
    });
    expect(res.body.events.map((event: { kind: string }) => event.kind)).toEqual(['created', 'email_confirmed']);
    expect(res.body.counts).toEqual({ classes: 0, students: 0, tests: 0 });
  });

  it('counts the classes, students and tests the account made', async () => {
    const { id: classId } = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana']);
    await makeTest(api, classId);
    const res = await api.request('GET', `/api/admin/accounts/${api.teacherId}`);
    expect(res.body.counts).toEqual({ classes: 1, students: 2, tests: 1 });
  });

  it('keeps the history of the account from its creation to its last change', async () => {
    const id = await signup();
    await approve(id);
    expect((await login('ana@example.com', 'parola-lunga')).status).toBe(200);
    await api.request('PATCH', `/api/admin/accounts/${id}`, { demo: false });
    await api.request('PATCH', `/api/admin/accounts/${id}`, { status: 'disabled' });
    await api.request('PATCH', `/api/admin/accounts/${id}`, { status: 'active' });
    await api.request('POST', `/api/admin/accounts/${id}/password`);

    const res = await api.request('GET', `/api/admin/accounts/${id}`);
    expect(res.body.events.map((event: { kind: string }) => event.kind)).toEqual([
      'created',
      'email_confirmed',
      'approved',
      'complete',
      'closed',
      'reopened',
      'password',
    ]);
    for (const event of res.body.events) expect(event.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(res.body.account.lastLoginAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('is only for administrators', async () => {
    const id = await api.addTeacher('bogdan@example.com', 'Bogdan');
    api.env.DEV_TEACHER_EMAIL = 'bogdan@example.com';
    const res = await api.request('GET', `/api/admin/accounts/${id}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('admin_only');
  });

  it('answers 404 for an unknown account and for a Quick Try guest teacher', async () => {
    expect((await api.request('GET', '/api/admin/accounts/9999')).status).toBe(404);
    const guest = await api.addTeacher('guest@example.com', 'O încercare');
    await api.db.prepare('UPDATE teachers SET quick_try = 1 WHERE id = ?').bind(guest).run();
    expect((await api.request('GET', `/api/admin/accounts/${guest}`)).status).toBe(404);
    expect(await accountOf(guest)).toBeUndefined();
  });
});

describe('the robot work outside the grading of papers', () => {
  const countsOf = async () =>
    (await api.db
      .prepare('SELECT barems_generated, exercise_lists_made, analyses_made, prints_made FROM teachers WHERE id = ?')
      .bind(api.teacherId)
      .first<Record<string, number>>())!;

  it('counts a generated barem, an exercise list, an analysis and a print PDF', async () => {
    const { id: classId } = await makeClass(api, '6E2', ['Pop Ion']);
    const code = await makeTest(api, classId);
    const run = (sql: string) => api.db.prepare(sql).bind(code).run();

    await run("UPDATE tests SET barem_request = 'requested' WHERE code = ?");
    expect(await countsOf()).toMatchObject({ barems_generated: 0 });
    await run("UPDATE tests SET barem_request = 'none', barem_unchecked = 1 WHERE code = ?");
    await run("UPDATE tests SET exercise_list_status = 'ready' WHERE code = ?");
    await run("UPDATE tests SET analysis_status = 'requested' WHERE code = ?");
    await run("UPDATE tests SET analysis_status = 'ready' WHERE code = ?");
    await run("UPDATE tests SET print_status = 'ready' WHERE code = ?");

    expect(await countsOf()).toEqual({ barems_generated: 1, exercise_lists_made: 1, analyses_made: 1, prints_made: 1 });
  });

  it('counts the CES variant apart, from its own columns', async () => {
    const { id: classId } = await makeClass(api, '6E2', ['Pop Ion']);
    const code = await makeTest(api, classId);
    const run = (sql: string) => api.db.prepare(sql).bind(code).run();

    await run("UPDATE tests SET ces_barem_request = 'requested' WHERE code = ?");
    await run("UPDATE tests SET ces_barem_request = 'none', ces_barem_unchecked = 1 WHERE code = ?");
    await run("UPDATE tests SET ces_exercise_list_status = 'ready' WHERE code = ?");
    await run("UPDATE tests SET ces_print_status = 'ready' WHERE code = ?");

    expect(await countsOf()).toEqual({ barems_generated: 1, exercise_lists_made: 1, analyses_made: 0, prints_made: 1 });
  });

  it('counts nothing for a work the robot gave up on, nor for a second look at one it made', async () => {
    const { id: classId } = await makeClass(api, '6E2', ['Pop Ion']);
    const code = await makeTest(api, classId);
    const run = (sql: string) => api.db.prepare(sql).bind(code).run();

    await run("UPDATE tests SET barem_request = 'requested' WHERE code = ?");
    await run("UPDATE tests SET barem_request = 'failed' WHERE code = ?");
    await run("UPDATE tests SET exercise_list_status = 'ready' WHERE code = ?");
    await run("UPDATE tests SET exercise_list_status = 'accepted' WHERE code = ?");

    expect(await countsOf()).toEqual({ barems_generated: 0, exercise_lists_made: 1, analyses_made: 0, prints_made: 0 });
  });
});

describe('who made each change', () => {
  // Every event with its actor, by kind: a change made without a login has
  // none, as the command line's and the reset link's do.
  const actorsOf = async (id: number) => {
    const events = (await api.request('GET', `/api/admin/accounts/${id}`)).body.events as { kind: string; by: unknown }[];
    return Object.fromEntries(events.map((event) => [event.kind, event.by]));
  };

  it('names the administrator who approved, closed, reopened or gave a password', async () => {
    const id = await signup();
    await approve(id);
    await api.request('PATCH', `/api/admin/accounts/${id}`, { status: 'disabled' });
    await api.request('PATCH', `/api/admin/accounts/${id}`, { status: 'active' });
    await api.request('POST', `/api/admin/accounts/${id}/password`);

    const actors = await actorsOf(id);
    expect(actors.created).toBeNull();
    expect(actors.email_confirmed).toBeNull();
    for (const kind of ['approved', 'closed', 'reopened', 'password']) {
      expect(actors[kind]).toEqual({ id: api.teacherId, name: 'Laura Miron' });
    }
  });

  it('records the teacher as the actor of their own new password', async () => {
    const id = await signup();
    await approve(id);
    api.env.DEV_TEACHER_EMAIL = 'ana@example.com';
    const res = await api.request('POST', '/api/admin/account/password', { currentPassword: 'parola-lunga', newPassword: 'alta-parola-lunga' });
    expect(res.status).toBe(200);
    const row = await api.db
      .prepare("SELECT by_teacher_id FROM account_events WHERE teacher_id = ? AND kind = 'password'")
      .bind(id)
      .first<{ by_teacher_id: number | null }>();
    expect(row!.by_teacher_id).toBe(id);
  });

  it('names no one for a password set from the command line', async () => {
    const id = await signup();
    await approve(id);
    // The CLI's statement, as `scripts/setPassword.ts` writes it.
    await api.db
      .prepare("UPDATE teachers SET password_hash = 'pbkdf2-sha256$1$AA$AA', failed_logins = 0, locked_until = NULL, changed_by = NULL WHERE id = ?")
      .bind(id)
      .run();
    expect((await actorsOf(id)).password).toBeNull();
  });
});

describe('the requests that were refused', () => {
  it('keeps who asked and who said no, and shows it on Setări', async () => {
    const id = await signup();
    expect((await reject(id)).status).toBe(200);
    const res = await api.request('GET', '/api/admin/accounts/refused');
    expect(res.status).toBe(200);
    expect(res.body.refused).toEqual([
      { name: 'Ana Pop', email: 'ana@example.com', askedAt: expect.any(String), refusedAt: expect.any(String), by: 'Laura Miron' },
    ]);
    expect(res.body.refused[0].askedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('writes one row for each account refused at once, and none for one that stopped waiting', async () => {
    const first = await signup('ana@example.com');
    const second = await signup('bogdan@example.com');
    const approved = await signup('cezar@example.com');
    expect((await approve(approved)).status).toBe(200);
    const shown = [
      { id: first, createdAt: await createdAtOf(first) },
      { id: second, createdAt: await createdAtOf(second) },
      { id: approved, createdAt: await createdAtOf(approved) },
    ];
    const res = await api.request('POST', '/api/admin/accounts/reject-all', { accounts: shown });
    expect(res.body).toEqual({ deleted: 2 });
    const refused = (await api.request('GET', '/api/admin/accounts/refused')).body.refused as { email: string }[];
    expect(refused.map((request) => request.email).sort()).toEqual(['ana@example.com', 'bogdan@example.com']);
  });

  it('writes nothing when the account was approved meanwhile', async () => {
    const id = await signup();
    const createdAt = await createdAtOf(id);
    await approve(id);
    const res = await api.request('POST', `/api/admin/accounts/${id}/reject`, { createdAt });
    expect(res.status).toBe(409);
    expect((await api.request('GET', '/api/admin/accounts/refused')).body.refused).toEqual([]);
  });
});

describe('the numbers of an account', () => {
  it('counts the last 30 days, the room of the pages, and the work of each test', async () => {
    const { id: classId, studentIds } = await makeClass(api, '10B', ['Pop Ion', 'Ionescu Ana']);
    const first = await makeTest(api, classId, 'Testul 1');
    const second = await makeTest(api, classId, 'Testul 2');
    const firstId = await testIdOf(api, first);
    const secondId = await testIdOf(api, second);

    // One paper graded a week ago, another forty days ago.
    const graded = await addSubmission(api, first, studentIds[0]!, { status: 'graded', files: 2 });
    const older = await addSubmission(api, first, studentIds[1]!, { status: 'graded', files: 1 });
    const now = new Date();
    await api.db.prepare('UPDATE submissions SET graded_at = ? WHERE id = ?').bind(now.toISOString(), graded).run();
    await api.db
      .prepare('UPDATE submissions SET graded_at = ? WHERE id = ?')
      .bind(new Date(now.getTime() - 40 * 86_400_000).toISOString(), older)
      .run();
    const evaluation = await addEvaluation(api, graded, { items: [{}, {}] });
    await api.db.prepare('UPDATE evaluation_items SET changed_by_teacher = 1 WHERE evaluation_id = ? AND position = 1').bind(evaluation).run();

    const work = api.db.prepare('INSERT INTO robot_work (teacher_id, test_id, kind, variant, ok, tokens, at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const at = now.toISOString();
    await work.bind(api.teacherId, firstId, 'exercise_list', 'class', 1, 200, at).run();
    await work.bind(api.teacherId, firstId, 'print', 'class', 1, null, at).run();
    await work.bind(api.teacherId, firstId, 'grading', 'class', 1, 1000, at).run();
    await work.bind(api.teacherId, firstId, 'barem', 'class', 0, null, at).run();
    await work.bind(api.teacherId, secondId, 'analysis', 'class', 1, 500, at).run();

    const res = await api.request('GET', `/api/admin/accounts/${api.teacherId}`);
    expect(res.status).toBe(200);
    expect(res.body.activity).toEqual({ testsLast30Days: 1, papersLast30Days: 1, r2Bytes: 300 });
    expect(res.body.robot).toEqual({
      grading: { done: 1, failed: 0, tokens: 1000 },
      exercise_list: { done: 1, failed: 0, tokens: 200 },
      analysis: { done: 1, failed: 0, tokens: 500 },
      barem: { done: 0, failed: 1, tokens: 0 },
      print: { done: 1, failed: 0, tokens: 0 },
    });

    const tests = res.body.tests as { title: string; papers: number; pointsChanged: number; robot: Record<string, number> }[];
    expect(tests.map((test) => [test.title, test.papers, test.pointsChanged])).toEqual([
      ['Testul 2', 0, 0],
      ['Testul 1', 2, 1],
    ]);
    expect(tests[0]!.robot).toEqual({ barems: 0, exerciseLists: 0, analyses: 1, prints: 0, gradings: 0, failures: 0, tokens: 500 });
    expect(tests[1]!.robot).toEqual({ barems: 0, exerciseLists: 1, analyses: 0, prints: 1, gradings: 1, failures: 1, tokens: 1200 });
  });

  it('stays within 15 D1 queries', async () => {
    const db = api.env.DB;
    let queries = 0;
    api.env.DB = new Proxy(db, {
      get(target, key) {
        const value = Reflect.get(target, key) as unknown;
        if (key === 'prepare') return (sql: string) => ((queries += 1), target.prepare(sql));
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    try {
      expect((await api.request('GET', `/api/admin/accounts/${api.teacherId}`)).status).toBe(200);
    } finally {
      api.env.DB = db;
    }
    expect(queries).toBeGreaterThan(3);
    expect(queries).toBeLessThanOrEqual(15);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PaidFeatures } from '../../shared/payments.ts';
import { hasPaid } from '../db/payments.ts';
import type { CheckoutSessionInput, CreateCheckoutSession } from '../payments/stripe.ts';
import { stripeSignatureHeader } from '../payments/stripe.ts';
import { featureFor, requirePaid } from './payments.ts';
import { makeClass, makeTest, otherTeacherTest, startTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

const KEYS = { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test_x' };

const FEATURES: PaidFeatures = {
  pro: { name: 'Cont Pro', amount: 4900, currency: 'ron', payer: 'teacher', scope: 'account' },
  extra: { name: 'Extra profesor', amount: 700, currency: 'ron', payer: 'teacher', scope: 'account' },
  test_report: { name: 'Raport', amount: 1500, currency: 'ron', payer: 'teacher', scope: 'test' },
  student_extra: { name: 'Extra', amount: 500, currency: 'ron', payer: 'student', scope: 'test' },
  // Never on sale: students have no login.
  student_account: { name: 'Cont elev', amount: 900, currency: 'ron', payer: 'student', scope: 'account' },
};
const options = { paidFeatures: FEATURES };

let api: TestApi;
let sessions: CheckoutSessionInput[];

async function start(env: Record<string, string> = KEYS, fail = false): Promise<void> {
  sessions = [];
  const createCheckoutSession: CreateCheckoutSession = vi.fn(async (_key, input) => {
    if (fail) throw new Error('down');
    sessions.push(input);
    return { id: `cs_test_${input.paymentId}`, url: `https://checkout.stripe.com/c/${input.paymentId}` };
  });
  api = await startTestApi({ env, app: { paidFeatures: FEATURES, createCheckoutSession } });
}

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await api.dispose();
});

const checkout = (body: Record<string, unknown>) => api.request('POST', '/api/admin/payments/checkout', body);
const teacherPayer = () => ({ teacherId: api.teacherId, studentId: null });
const sessionOf = (index: number) => `cs_test_${sessions[index]!.paymentId}`;

async function webhookRaw(body: string, secret = KEYS.STRIPE_WEBHOOK_SECRET, headers: Record<string, string> = {}) {
  const signature = await stripeSignatureHeader(body, secret, Math.floor(Date.now() / 1000));
  const res = await api.fetch('/api/payments/webhook', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature, ...headers },
  });
  return { status: res.status, body: await res.json() };
}

const webhook = (event: unknown, secret?: string) => webhookRaw(JSON.stringify(event), secret);

const completed = (sessionId: string, amount: number, extra: Record<string, unknown> = {}) => ({
  type: 'checkout.session.completed',
  data: { object: { id: sessionId, payment_status: 'paid', amount_total: amount, currency: 'ron', ...extra } },
});

const statusOf = async (sessionId: string) =>
  (await api.db.prepare('SELECT status FROM payments WHERE stripe_session_id = ?').bind(sessionId).first<{ status: string }>())?.status;

const countPayments = async () => api.db.prepare('SELECT COUNT(*) AS n FROM payments').first<number>('n');

describe('payments before the Stripe account', () => {
  it('answer 503 payments_off for a checkout and for the webhook', async () => {
    await start({});
    const res = await checkout({ feature: 'pro', returnPath: '/admin/' });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'payments_off', message: 'Plățile nu sunt încă active.' });
    expect((await webhook(completed('cs_x', 1))).status).toBe(503);
    expect(await countPayments()).toBe(0);
  });
});

describe('POST /api/admin/payments/checkout', () => {
  it('makes a pending payment with the catalog price and returns the Stripe page', async () => {
    await start();
    const res = await checkout({ feature: 'pro', returnPath: '/admin/setari' });
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^https:\/\/checkout\.stripe\.com\/c\/\d+$/);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      amount: 4900,
      currency: 'ron',
      name: 'Cont Pro',
      successUrl: 'http://localhost/admin/setari?plata=reusita&session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'http://localhost/admin/setari?plata=anulata',
    });
    const row = await api.db.prepare('SELECT * FROM payments').first<Record<string, unknown>>();
    expect(row).toMatchObject({ teacher_id: api.teacherId, student_id: null, feature: 'pro', amount: 4900, status: 'pending' });
    expect(row!.stripe_session_id).toBe(`cs_test_${row!.id}`);
    expect(row!.checkout_url).toBe(res.body.url);
    // The page stays open one hour; Stripe gets the same time.
    const expires = Date.parse(row!.checkout_expires_at as string);
    expect(expires - Date.parse(row!.created_at as string)).toBe(60 * 60_000);
    expect(sessions[0]!.expiresAtS).toBe(Math.floor(expires / 1000));
  });

  it('gives a unique idempotency key to each payment', async () => {
    await start();
    await checkout({ feature: 'pro', returnPath: '/admin/' });
    await checkout({ feature: 'extra', returnPath: '/admin/' });
    expect(new Set(sessions.map((s) => s.idempotencyKey)).size).toBe(2);
  });

  it('ignores an amount sent by the browser', async () => {
    await start();
    await checkout({ feature: 'pro', returnPath: '/admin/', amount: 1 });
    expect(sessions[0]!.amount).toBe(4900);
  });

  it('refuses an unknown feature, a student feature, and an inherited key', async () => {
    await start();
    for (const feature of ['nope', 'student_extra', 'constructor']) {
      const res = await checkout({ feature, returnPath: '/admin/' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('unknown_feature');
    }
    expect(sessions).toHaveLength(0);
  });

  it('refuses return addresses outside the teacher app', async () => {
    await start();
    for (const returnPath of ['//evil.test/admin/', '/admin/../u/x', '/admin/%2e%2e/u/x', '/admin/%2F%2Fevil.test', '/u/abc', 'https://evil.test/admin/']) {
      expect((await checkout({ feature: 'pro', returnPath })).status).toBe(400);
    }
    expect(sessions).toHaveLength(0);
  });

  it("needs the teacher's own test for a test feature", async () => {
    await start();
    const cls = await makeClass(api, '6E2');
    const code = await makeTest(api, cls.id);
    expect((await checkout({ feature: 'test_report', returnPath: '/admin/' })).status).toBe(400);
    const foreign = await otherTeacherTest(api);
    expect((await checkout({ feature: 'test_report', returnPath: '/admin/', testCode: foreign.code })).status).toBe(404);
    const res = await checkout({ feature: 'test_report', returnPath: '/admin/', testCode: code.toLowerCase() });
    expect(res.status).toBe(201);
    const row = await api.db.prepare('SELECT test_id, test_code, test_created_at FROM payments').first<Record<string, unknown>>();
    expect(row).toMatchObject({ test_id: await testIdOf(api, code), test_code: code });
    expect(row!.test_created_at).toEqual(expect.any(String));
  });

  it('does not read a test for an account feature', async () => {
    await start();
    const res = await checkout({ feature: 'pro', returnPath: '/admin/', testCode: 'NU-EXISTA' });
    expect(res.status).toBe(201);
    expect(await api.db.prepare('SELECT test_id FROM payments').first('test_id')).toBeNull();
  });

  it('marks the payment failed when Stripe makes no page, and lets the user try again', async () => {
    await start(KEYS, true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await checkout({ feature: 'pro', returnPath: '/admin/' });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('payment_page');
    expect(await api.db.prepare('SELECT status FROM payments').first('status')).toBe('failed');
    expect((await checkout({ feature: 'pro', returnPath: '/admin/' })).status).toBe(502);
    expect(await countPayments()).toBe(2);
  });
});

describe('a second checkout of the same feature', () => {
  it('gives the page that is still open, with no second charge', async () => {
    await start();
    const first = await checkout({ feature: 'pro', returnPath: '/admin/' });
    const again = await checkout({ feature: 'pro', returnPath: '/admin/' });
    expect(again.status).toBe(200);
    expect(again.body.url).toBe(first.body.url);
    expect(sessions).toHaveLength(1);
    expect(await countPayments()).toBe(1);
  });

  it('makes one row for two clicks at once', async () => {
    await start();
    const answers = await Promise.all([checkout({ feature: 'pro', returnPath: '/admin/' }), checkout({ feature: 'pro', returnPath: '/admin/' })]);
    expect(await countPayments()).toBe(1);
    expect(sessions).toHaveLength(1);
    for (const res of answers) expect([200, 201, 409]).toContain(res.status);
  });

  it('answers 409 payment_busy while the first request makes the page', async () => {
    await start();
    await api.db
      .prepare("INSERT INTO payments (teacher_id, feature, amount, currency, status, created_at) VALUES (?, 'pro', 4900, 'ron', 'pending', ?)")
      .bind(api.teacherId, new Date().toISOString())
      .run();
    const res = await checkout({ feature: 'pro', returnPath: '/admin/' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('payment_busy');
  });

  it('makes a new page when the open one is about to close, or a request died', async () => {
    await start();
    await checkout({ feature: 'pro', returnPath: '/admin/' });
    await api.db.prepare('UPDATE payments SET checkout_expires_at = ?').bind(new Date(Date.now() + 5 * 60_000).toISOString()).run();
    expect((await checkout({ feature: 'pro', returnPath: '/admin/' })).status).toBe(201);
    await api.db
      .prepare("INSERT INTO payments (teacher_id, feature, amount, currency, status, created_at) VALUES (?, 'extra', 700, 'ron', 'pending', '2026-01-01T00:00:00.000Z')")
      .bind(api.teacherId)
      .run();
    expect((await checkout({ feature: 'extra', returnPath: '/admin/' })).status).toBe(201);
  });

  it('answers 409 already_paid once the feature is paid', async () => {
    await start();
    await checkout({ feature: 'pro', returnPath: '/admin/' });
    await webhook(completed(sessionOf(0), 4900));
    const res = await checkout({ feature: 'pro', returnPath: '/admin/' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_paid');
    expect(sessions).toHaveLength(1);
  });

  it('is a separate payment for another test', async () => {
    await start();
    const cls = await makeClass(api, '6E2');
    const one = await makeTest(api, cls.id);
    const two = await makeTest(api, cls.id, 'Alt test');
    expect((await checkout({ feature: 'test_report', returnPath: '/admin/', testCode: one })).status).toBe(201);
    expect((await checkout({ feature: 'test_report', returnPath: '/admin/', testCode: two })).status).toBe(201);
  });
});

describe('POST /api/payments/webhook', () => {
  it('marks the payment paid once, and the gate opens', async () => {
    await start();
    await checkout({ feature: 'pro', returnPath: '/admin/' });
    await expect(requirePaid(api.env, options, teacherPayer(), 'pro')).rejects.toMatchObject({ status: 402, code: 'payment_required' });

    expect(await webhook(completed(sessionOf(0), 4900))).toEqual({ status: 200, body: { received: true } });
    expect(await statusOf(sessionOf(0))).toBe('paid');
    await expect(requirePaid(api.env, options, teacherPayer(), 'pro')).resolves.toBeUndefined();

    const paidAt = await api.db.prepare('SELECT paid_at FROM payments').first('paid_at');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await webhook(completed(sessionOf(0), 4900))).status).toBe(200);
    expect(await api.db.prepare('SELECT paid_at FROM payments').first('paid_at')).toBe(paidAt);
    // A repeated event is no problem to report.
    expect(errors).not.toHaveBeenCalled();
    const list = await api.request('GET', '/api/admin/payments');
    expect(list.body.payments).toEqual([expect.objectContaining({ feature: 'pro', status: 'paid', testCode: null })]);
  });

  it('refuses a bad signature and changes nothing', async () => {
    await start();
    await checkout({ feature: 'pro', returnPath: '/admin/' });
    const res = await webhook(completed(sessionOf(0), 4900), 'whsec_wrong');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad_signature');
    expect(await statusOf(sessionOf(0))).toBe('pending');
  });

  it('refuses a body over 256 KB, by its length header and by its bytes', async () => {
    await start();
    const big = JSON.stringify({ type: 'x', pad: 'a'.repeat(300 * 1024) });
    expect((await webhookRaw(big)).status).toBe(413);
    const res = await api.fetch('/api/payments/webhook', {
      method: 'POST',
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(big));
          controller.close();
        },
      }),
      // @ts-expect-error Node's fetch needs this for a stream body.
      duplex: 'half',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=1,v1=00' },
    });
    expect(res.status).toBe(413);
  });

  it('does not mark paid a wrong amount or an unpaid session, and logs the lost payment', async () => {
    await start();
    await checkout({ feature: 'pro', returnPath: '/admin/' });
    await checkout({ feature: 'extra', returnPath: '/admin/' });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await webhook(completed(sessionOf(0), 100));
    expect(errors).toHaveBeenCalledWith('Stripe paid session matches no payment:', sessionOf(0), 100, 'ron');
    await webhook(completed(sessionOf(0), 4900, { payment_status: 'unpaid' }));
    expect(await statusOf(sessionOf(0))).toBe('pending');
    await webhook({ type: 'checkout.session.expired', data: { object: { id: sessionOf(1) } } });
    expect(await statusOf(sessionOf(1))).toBe('expired');
    await webhook({ type: 'checkout.session.async_payment_failed', data: { object: { id: sessionOf(0) } } });
    expect(await statusOf(sessionOf(0))).toBe('failed');
  });

  it('keeps a paid payment paid when an expiry comes late', async () => {
    await start();
    await checkout({ feature: 'pro', returnPath: '/admin/' });
    const sessionId = sessionOf(0);
    await webhook({ type: 'checkout.session.async_payment_succeeded', data: { object: { id: sessionId, payment_status: 'paid', amount_total: 4900, currency: 'RON' } } });
    await webhook({ type: 'checkout.session.expired', data: { object: { id: sessionId } } });
    expect(await statusOf(sessionId)).toBe('paid');
  });

  it('marks paid a session Stripe says is paid, after it was marked expired or failed', async () => {
    await start();
    await checkout({ feature: 'pro', returnPath: '/admin/' });
    await checkout({ feature: 'extra', returnPath: '/admin/' });
    await webhook({ type: 'checkout.session.expired', data: { object: { id: sessionOf(0) } } });
    await webhook({ type: 'checkout.session.async_payment_failed', data: { object: { id: sessionOf(1) } } });
    await webhook(completed(sessionOf(0), 4900));
    await webhook(completed(sessionOf(1), 700));
    expect(await statusOf(sessionOf(0))).toBe('paid');
    expect(await statusOf(sessionOf(1))).toBe('paid');
  });

  it('answers 200 to events it does not handle', async () => {
    await start();
    expect((await webhook({ type: 'customer.created', data: { object: { id: 'cus_1' } } })).status).toBe(200);
    expect((await webhook({ type: 'ping' })).status).toBe(200);
  });

  it('opens a test feature only for that test', async () => {
    await start();
    const cls = await makeClass(api, '6E2');
    const code = await makeTest(api, cls.id);
    const other = await makeTest(api, cls.id, 'Alt test');
    await checkout({ feature: 'test_report', returnPath: '/admin/', testCode: code });
    await webhook(completed(sessionOf(0), 1500));
    const testOf = async (c: string) =>
      (await api.db.prepare('SELECT id, created_at AS createdAt, code FROM tests WHERE code = ?').bind(c).first<{ id: number; createdAt: string; code: string }>())!;
    expect(await hasPaid(api.db, teacherPayer(), 'test_report', await testOf(code))).toBe(true);
    expect(await hasPaid(api.db, teacherPayer(), 'test_report', await testOf(other))).toBe(false);
    // A deleted test whose id comes back is another test.
    expect(await hasPaid(api.db, teacherPayer(), 'test_report', { ...(await testOf(code)), createdAt: '2030-01-01T00:00:00.000Z' })).toBe(false);
    await expect(requirePaid(api.env, options, teacherPayer(), 'test_report', await testOf(code))).resolves.toBeUndefined();
    await expect(requirePaid(api.env, options, teacherPayer(), 'test_report', await testOf(other))).rejects.toMatchObject({ status: 402 });
  });
});

describe('requirePaid', () => {
  it('uses the scope of the catalog, whatever test the route passes', async () => {
    await start();
    const cls = await makeClass(api, '6E2');
    const code = await makeTest(api, cls.id);
    const test = (await api.db.prepare('SELECT id, created_at AS createdAt, code FROM tests WHERE code = ?').bind(code).first<{ id: number; createdAt: string; code: string }>())!;
    await checkout({ feature: 'pro', returnPath: '/admin/' });
    await webhook(completed(sessionOf(0), 4900));
    // An account feature opens on every test.
    await expect(requirePaid(api.env, options, teacherPayer(), 'pro', test)).resolves.toBeUndefined();
  });

  it('throws for a feature that is not in the catalog, and for a test feature without its test', async () => {
    await start();
    await expect(requirePaid(api.env, options, teacherPayer(), 'nope')).rejects.toThrow(/not in the catalog/);
    await expect(requirePaid(api.env, options, teacherPayer(), 'test_report')).rejects.toThrow(/name the test/);
  });
});

describe('GET /api/admin/payments', () => {
  it("shows only this teacher's own payments", async () => {
    await start();
    const otherId = await api.addTeacher('alt@example.com', 'Alt');
    await api.db
      .prepare("INSERT INTO payments (teacher_id, feature, amount, currency, status, created_at) VALUES (?, 'pro', 1, 'ron', 'paid', '2026-10-06')")
      .bind(otherId)
      .run();
    expect((await api.request('GET', '/api/admin/payments')).body.payments).toEqual([]);
  });
});

describe('student payments', () => {
  async function studentSetup(names = ['Pop Ion', 'Ionescu Ana']) {
    await start();
    const cls = await makeClass(api, '6E2', names);
    const code = await makeTest(api, cls.id);
    const token = await startTest(api, code);
    const secrets: string[] = [];
    for (const studentId of cls.studentIds) {
      const started = await api.request('POST', `/api/u/${token}/sessions`, { studentId });
      secrets.push(started.body.secret as string);
    }
    const pay = (secret: string | null, body: Record<string, unknown>, linkToken = token) =>
      api.request('POST', `/api/u/${linkToken}/payments/checkout`, body, secret ? { 'X-Upload-Session': secret } : {});
    const list = (secret: string, linkToken = token) => api.request('GET', `/api/u/${linkToken}/payments`, undefined, { 'X-Upload-Session': secret });
    return { cls, code, token, secrets, pay, list };
  }

  it("are bought by the student of this phone's upload, for the test of the link", async () => {
    const { cls, code, token, secrets, pay, list } = await studentSetup();
    const body = { feature: 'student_extra', returnPath: `/u/${token}` };

    expect((await pay(null, body)).status).toBe(401);
    expect((await pay(secrets[0]!, { feature: 'pro', returnPath: `/u/${token}` })).status).toBe(404);
    expect((await pay(secrets[0]!, { feature: 'student_extra', returnPath: '/admin/' })).status).toBe(400);

    const res = await pay(secrets[0]!, body);
    expect(res.status).toBe(201);
    const row = await api.db.prepare('SELECT teacher_id, student_id, test_id, amount FROM payments').first<Record<string, unknown>>();
    expect(row).toEqual({ teacher_id: api.teacherId, student_id: cls.studentIds[0], test_id: await testIdOf(api, code), amount: 500 });

    await webhook(completed(sessionOf(0), 500));
    const mine = await list(secrets[0]!);
    expect(mine.status).toBe(200);
    expect(mine.body.payments).toEqual([expect.objectContaining({ feature: 'student_extra', status: 'paid', testCode: code })]);
    // The teacher's list holds only the teacher's own payments.
    expect((await api.request('GET', '/api/admin/payments')).body.payments).toEqual([]);
    const payer = { teacherId: api.teacherId, studentId: cls.studentIds[0]! };
    const test = { id: await testIdOf(api, code), createdAt: (await api.db.prepare('SELECT created_at FROM tests').first<string>('created_at'))!, code };
    await expect(requirePaid(api.env, options, payer, 'student_extra', test)).resolves.toBeUndefined();
    await expect(requirePaid(api.env, options, { ...payer, studentId: cls.studentIds[1]! }, 'student_extra', test)).rejects.toMatchObject({ status: 402 });
  });

  it('never sells a student a feature for the whole account', async () => {
    const { token, secrets, pay } = await studentSetup();
    const res = await pay(secrets[0]!, { feature: 'student_account', returnPath: `/u/${token}` });
    expect(res.status).toBe(404);
    expect(() => featureFor(options, 'student_account', 'student')).toThrow();
  });

  it("does not show or pay one student's payments with another student's secret", async () => {
    const { token, secrets, pay, list } = await studentSetup();
    await pay(secrets[0]!, { feature: 'student_extra', returnPath: `/u/${token}` });
    await webhook(completed(sessionOf(0), 500));
    expect((await list(secrets[1]!)).body.payments).toEqual([]);
    // The second student pays for themself, not as the first.
    expect((await pay(secrets[1]!, { feature: 'student_extra', returnPath: `/u/${token}` })).status).toBe(201);
  });

  it("does not take a secret from another test's link", async () => {
    const { cls, secrets, list, pay } = await studentSetup();
    const otherCode = await makeTest(api, cls.id, 'Alt test');
    const otherToken = await startTest(api, otherCode);
    expect((await list(secrets[0]!, otherToken)).status).toBe(401);
    expect((await pay(secrets[0]!, { feature: 'student_extra', returnPath: `/u/${otherToken}` }, otherToken)).status).toBe(401);
  });

  it("keeps a student's payment after the teacher resets the upload", async () => {
    const { cls, token, secrets, pay, list } = await studentSetup(['Pop Ion']);
    await pay(secrets[0]!, { feature: 'student_extra', returnPath: `/u/${token}` });
    await webhook(completed(sessionOf(0), 500));
    const submission = await api.db.prepare('SELECT id, started_at FROM submissions').first<{ id: number; started_at: string }>();
    expect((await api.request('POST', `/api/admin/submissions/${submission!.id}/reset`, { startedAt: submission!.started_at })).status).toBe(200);
    // The old phone's secret is gone.
    expect((await list(secrets[0]!)).status).toBe(401);
    const again = await api.request('POST', `/api/u/${token}/sessions`, { studentId: cls.studentIds[0] });
    const mine = await list(again.body.secret as string);
    expect(mine.body.payments).toEqual([expect.objectContaining({ feature: 'student_extra', status: 'paid' })]);
  });
});

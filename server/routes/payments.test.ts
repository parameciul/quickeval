import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PaidFeatures } from '../../shared/payments.ts';
import { hasPaid } from '../db/payments.ts';
import type { CheckoutSessionInput, CreateCheckoutSession } from '../payments/stripe.ts';
import { stripeSignatureHeader } from '../payments/stripe.ts';
import { requirePaid } from './payments.ts';
import { makeClass, makeTest, otherTeacherTest, startTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

const KEYS = { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test_x' };

const FEATURES: PaidFeatures = {
  pro: { name: 'Cont Pro', amount: 4900, currency: 'ron', payer: 'teacher', scope: 'account' },
  test_report: { name: 'Raport', amount: 1500, currency: 'ron', payer: 'teacher', scope: 'test' },
  student_extra: { name: 'Extra', amount: 500, currency: 'ron', payer: 'student', scope: 'test' },
  student_account: { name: 'Cont elev', amount: 900, currency: 'ron', payer: 'student', scope: 'account' },
};

let api: TestApi;
let sessions: CheckoutSessionInput[];

async function start(env: Record<string, string> = KEYS, fail = false): Promise<void> {
  sessions = [];
  const createCheckoutSession: CreateCheckoutSession = vi.fn(async (_key, input) => {
    if (fail) throw new Error('down');
    sessions.push(input);
    return { id: `cs_test_${input.paymentId}`, url: `https://checkout.stripe.test/${input.paymentId}` };
  });
  api = await startTestApi({ env, app: { paidFeatures: FEATURES, createCheckoutSession } });
}

afterEach(async () => {
  await api.dispose();
});

const checkout = (body: Record<string, unknown>) => api.request('POST', '/api/admin/payments/checkout', body);

async function webhook(event: unknown, secret = KEYS.STRIPE_WEBHOOK_SECRET) {
  const body = JSON.stringify(event);
  const signature = await stripeSignatureHeader(body, secret, Math.floor(Date.now() / 1000));
  const res = await api.fetch('/api/payments/webhook', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
  });
  return { status: res.status, body: await res.json() };
}

const completed = (sessionId: string, amount: number, extra: Record<string, unknown> = {}) => ({
  type: 'checkout.session.completed',
  data: { object: { id: sessionId, payment_status: 'paid', amount_total: amount, currency: 'ron', ...extra } },
});

const statusOf = async (sessionId: string) =>
  (await api.db.prepare('SELECT status FROM payments WHERE stripe_session_id = ?').bind(sessionId).first<{ status: string }>())?.status;

describe('payments before the Stripe account', () => {
  it('answer 503 payments_off for a checkout and for the webhook', async () => {
    await start({});
    const res = await checkout({ feature: 'pro', returnPath: '/admin/' });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'payments_off', message: 'Plățile nu sunt încă active.' });
    expect((await webhook(completed('cs_x', 1))).status).toBe(503);
    expect(await api.db.prepare('SELECT COUNT(*) AS n FROM payments').first('n')).toBe(0);
  });
});

describe('POST /api/admin/payments/checkout', () => {
  it('makes a pending payment with the catalog price and returns the Stripe page', async () => {
    await start();
    const res = await checkout({ feature: 'pro', returnPath: '/admin/setari' });
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^https:\/\/checkout\.stripe\.test\/\d+$/);
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

  it('refuses a return address on another site', async () => {
    await start();
    const res = await checkout({ feature: 'pro', returnPath: '//evil.test/admin/' });
    expect(res.status).toBe(400);
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

  it('marks the payment failed when Stripe makes no page', async () => {
    await start(KEYS, true);
    const res = await checkout({ feature: 'pro', returnPath: '/admin/' });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('payment_page');
    expect(await api.db.prepare('SELECT status FROM payments').first('status')).toBe('failed');
  });
});

describe('POST /api/payments/webhook', () => {
  it('marks the payment paid once, and the gate opens', async () => {
    await start();
    await checkout({ feature: 'pro', returnPath: '/admin/' });
    const payer = { teacherId: api.teacherId, studentId: null };
    await expect(requirePaid(api.env, payer, 'pro')).rejects.toMatchObject({ status: 402, code: 'payment_required' });

    const sessionId = `cs_test_${sessions[0]!.paymentId}`;
    expect(await webhook(completed(sessionId, 4900))).toEqual({ status: 200, body: { received: true } });
    expect(await statusOf(sessionId)).toBe('paid');
    await expect(requirePaid(api.env, payer, 'pro')).resolves.toBeUndefined();

    const paidAt = await api.db.prepare('SELECT paid_at FROM payments').first('paid_at');
    expect((await webhook(completed(sessionId, 4900))).status).toBe(200);
    expect(await api.db.prepare('SELECT paid_at FROM payments').first('paid_at')).toBe(paidAt);
    const list = await api.request('GET', '/api/admin/payments');
    expect(list.body.payments).toEqual([expect.objectContaining({ feature: 'pro', status: 'paid', testCode: null })]);
  });

  it('refuses a bad signature and changes nothing', async () => {
    await start();
    await checkout({ feature: 'pro', returnPath: '/admin/' });
    const sessionId = `cs_test_${sessions[0]!.paymentId}`;
    const res = await webhook(completed(sessionId, 4900), 'whsec_wrong');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad_signature');
    expect(await statusOf(sessionId)).toBe('pending');
  });

  it('does not mark paid a wrong amount, an unpaid session, or after it expired', async () => {
    await start();
    await checkout({ feature: 'pro', returnPath: '/admin/' });
    await checkout({ feature: 'pro', returnPath: '/admin/' });
    const [first, second] = sessions.map((s) => `cs_test_${s.paymentId}`);
    await webhook(completed(first!, 100));
    await webhook(completed(first!, 4900, { payment_status: 'unpaid' }));
    expect(await statusOf(first!)).toBe('pending');
    await webhook({ type: 'checkout.session.expired', data: { object: { id: second } } });
    expect(await statusOf(second!)).toBe('expired');
    await webhook({ type: 'checkout.session.async_payment_failed', data: { object: { id: first } } });
    expect(await statusOf(first!)).toBe('failed');
  });

  it('keeps a paid payment paid when an expiry comes late', async () => {
    await start();
    await checkout({ feature: 'pro', returnPath: '/admin/' });
    const sessionId = `cs_test_${sessions[0]!.paymentId}`;
    await webhook({ type: 'checkout.session.async_payment_succeeded', data: { object: { id: sessionId, payment_status: 'paid', amount_total: 4900, currency: 'RON' } } });
    await webhook({ type: 'checkout.session.expired', data: { object: { id: sessionId } } });
    expect(await statusOf(sessionId)).toBe('paid');
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
    await webhook(completed(`cs_test_${sessions[0]!.paymentId}`, 1500));
    const payer = { teacherId: api.teacherId, studentId: null };
    const testOf = async (c: string) => ({
      ...(await api.db.prepare('SELECT id, created_at AS createdAt, code FROM tests WHERE code = ?').bind(c).first<{ id: number; createdAt: string; code: string }>())!,
    });
    expect(await hasPaid(api.db, payer, 'test_report', await testOf(code))).toBe(true);
    expect(await hasPaid(api.db, payer, 'test_report', await testOf(other))).toBe(false);
    // A deleted test whose id comes back is another test.
    expect(await hasPaid(api.db, payer, 'test_report', { ...(await testOf(code)), createdAt: '2030-01-01T00:00:00.000Z' })).toBe(false);
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
  it("are bought by the student of this phone's upload, for the test of the link", async () => {
    await start();
    const cls = await makeClass(api, '6E2', ['Pop Ion']);
    const code = await makeTest(api, cls.id);
    const token = await startTest(api, code);
    const started = await api.request('POST', `/api/u/${token}/sessions`, { studentId: cls.studentIds[0] });
    const secret = started.body.secret as string;

    const noSession = await api.request('POST', `/api/u/${token}/payments/checkout`, { feature: 'student_extra', returnPath: `/u/${token}` });
    expect(noSession.status).toBe(401);
    const headers = { 'X-Upload-Session': secret };
    const teacherFeature = await api.request('POST', `/api/u/${token}/payments/checkout`, { feature: 'pro', returnPath: `/u/${token}` }, headers);
    expect(teacherFeature.status).toBe(404);
    const adminReturn = await api.request('POST', `/api/u/${token}/payments/checkout`, { feature: 'student_extra', returnPath: '/admin/' }, headers);
    expect(adminReturn.status).toBe(400);

    const res = await api.request('POST', `/api/u/${token}/payments/checkout`, { feature: 'student_extra', returnPath: `/u/${token}` }, headers);
    expect(res.status).toBe(201);
    const row = await api.db.prepare('SELECT teacher_id, student_id, test_id, amount FROM payments').first<Record<string, unknown>>();
    expect(row).toEqual({ teacher_id: api.teacherId, student_id: cls.studentIds[0], test_id: await testIdOf(api, code), amount: 500 });

    await webhook(completed(`cs_test_${sessions[0]!.paymentId}`, 500));
    const list = await api.request('GET', `/api/u/${token}/payments`, undefined, headers);
    expect(list.status).toBe(200);
    expect(list.body.payments).toEqual([expect.objectContaining({ feature: 'student_extra', status: 'paid', testCode: code })]);
    // The teacher's list holds only the teacher's own payments.
    expect((await api.request('GET', '/api/admin/payments')).body.payments).toEqual([]);

    // A feature for the whole account shows in the list of every test.
    await api.request('POST', `/api/u/${token}/payments/checkout`, { feature: 'student_account', returnPath: `/u/${token}` }, headers);
    expect(await api.db.prepare("SELECT test_id FROM payments WHERE feature = 'student_account'").first('test_id')).toBeNull();
    await webhook(completed(`cs_test_${sessions[1]!.paymentId}`, 900));
    const both = await api.request('GET', `/api/u/${token}/payments`, undefined, headers);
    expect(both.body.payments.map((p: { feature: string }) => p.feature).sort()).toEqual(['student_account', 'student_extra']);
  });
});

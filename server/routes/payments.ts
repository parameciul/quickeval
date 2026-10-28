import { type Context, Hono } from 'hono';
import { checkoutBody, isReturnPath, PAID_FEATURES, returnUrl, type CheckoutAnswer, type PaidFeature, type PaidFeatures, type Payer } from '../../shared/payments.ts';
import { normalizeTestCode } from '../../shared/tests.ts';
import {
  closeUnpaid,
  createPayment,
  failPayment,
  findTeacherTest,
  hasPaid,
  listPayments,
  markPaid,
  setStripeSession,
  type PaidTest,
  type PaymentPayer,
} from '../db/payments.ts';
import type { AppEnv, AppOptions, Env } from '../env.ts';
import { ApiError } from '../errors.ts';
import { nowIso, readJson } from '../http.ts';
import { createCheckoutSession, verifyStripeSignature } from '../payments/stripe.ts';

const paymentsOff = () => new ApiError(503, 'payments_off', 'Plățile nu sunt încă active.');
const unknownFeature = () => new ApiError(404, 'unknown_feature', 'Funcția aleasă nu există.');

// A Stripe event body is a few kilobytes; anything far larger is not Stripe.
const MAX_WEBHOOK_BYTES = 256 * 1024;

// Both keys come from the Stripe account. Without them the app sells nothing.
function stripeKeys(env: Env): { secretKey: string; webhookSecret: string } | null {
  return env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET
    ? { secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET }
    : null;
}

// The feature on sale to this payer, from the server's catalog only.
export function featureFor(options: AppOptions, key: string, payer: Payer): PaidFeature {
  const catalog: PaidFeatures = options.paidFeatures ?? PAID_FEATURES;
  const feature = Object.hasOwn(catalog, key) ? catalog[key] : undefined;
  if (!feature || feature.payer !== payer) throw unknownFeature();
  return feature;
}

// The gate of a paid feature, for any route of any flow: 402 until the
// webhook has seen the payment. A feature with scope "test" needs the test.
export async function requirePaid(env: Env, payer: PaymentPayer, feature: string, test: PaidTest | null = null): Promise<void> {
  if (!(await hasPaid(env.DB, payer, feature, test))) {
    throw new ApiError(402, 'payment_required', 'Această funcție trebuie plătită înainte.');
  }
}

export interface CheckoutRequest {
  payer: PaymentPayer;
  feature: string;
  returnPath: string;
  test: PaidTest | null;
}

// Makes a pending payment and its Stripe payment page. Only the webhook marks it paid:
// coming back to the success address proves nothing.
export async function startCheckout(c: Context<AppEnv>, options: AppOptions, request: CheckoutRequest): Promise<CheckoutAnswer> {
  const keys = stripeKeys(c.env);
  if (!keys) throw paymentsOff();
  const kind: Payer = request.payer.studentId === null ? 'teacher' : 'student';
  const feature = featureFor(options, request.feature, kind);
  if (!isReturnPath(request.returnPath, kind)) throw new ApiError(400, 'invalid', 'Pagina de întoarcere nu este validă.');
  if (feature.scope === 'test' && !request.test) throw new ApiError(400, 'invalid', 'Alege testul pentru care plătești.');
  const test = feature.scope === 'test' ? request.test : null;

  const createdAt = nowIso();
  const paymentId = await createPayment(c.env.DB, {
    payer: request.payer,
    feature: request.feature,
    test,
    amount: feature.amount,
    currency: feature.currency,
    createdAt,
  });
  const origin = new URL(c.req.url).origin;
  const create = options.createCheckoutSession ?? createCheckoutSession;
  let session;
  try {
    session = await create(keys.secretKey, {
      paymentId,
      idempotencyKey: `payment-${paymentId}-${createdAt}`,
      name: feature.name,
      amount: feature.amount,
      currency: feature.currency,
      successUrl: returnUrl(origin, request.returnPath, 'reusita'),
      cancelUrl: returnUrl(origin, request.returnPath, 'anulata'),
    });
  } catch (err) {
    console.error('Stripe checkout:', err instanceof Error ? err.message : String(err));
    await failPayment(c.env.DB, paymentId);
    throw new ApiError(502, 'payment_page', 'Pagina de plată nu a putut fi deschisă. Încearcă din nou.');
  }
  await setStripeSession(c.env.DB, paymentId, session.id);
  return { url: session.url };
}

// /api/admin/payments: the teacher's own payments. Behind teacherAuth.
export function adminPaymentRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const payerOf = (c: Context<AppEnv>): PaymentPayer => ({ teacherId: c.var.teacher.id, studentId: null });

  routes.get('/', async (c) => c.json({ payments: await listPayments(c.env.DB, payerOf(c)) }));

  routes.post('/checkout', async (c) => {
    const body = await readJson(c, checkoutBody, 4096);
    let test: PaidTest | null = null;
    if (body.testCode !== undefined) {
      const code = normalizeTestCode(body.testCode);
      test = code === null ? null : await findTeacherTest(c.env.DB, c.var.teacher.id, code);
      if (!test) throw new ApiError(404, 'not_found', 'Nu am găsit ce cauți.');
    }
    const answer = await startCheckout(c, options, { payer: payerOf(c), feature: body.feature, returnPath: body.returnPath, test });
    return c.json(answer, 201);
  });

  return routes;
}

interface StripeEvent {
  type?: unknown;
  data?: { object?: { id?: unknown; payment_status?: unknown; amount_total?: unknown; currency?: unknown } };
}

// /api/payments/webhook: Stripe tells the app about a payment. No login and no
// same-origin rule: the signature on the exact body is the key.
export function paymentWebhookRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post('/webhook', async (c) => {
    const keys = stripeKeys(c.env);
    if (!keys) throw paymentsOff();
    if (Number(c.req.header('Content-Length') ?? 0) > MAX_WEBHOOK_BYTES) throw new ApiError(413, 'too_large', 'Cererea este prea mare.');
    const body = await c.req.text();
    if (body.length > MAX_WEBHOOK_BYTES) throw new ApiError(413, 'too_large', 'Cererea este prea mare.');
    if (!(await verifyStripeSignature(body, c.req.header('Stripe-Signature'), keys.webhookSecret))) {
      throw new ApiError(400, 'bad_signature', 'Semnătura nu este validă.');
    }

    let event: StripeEvent;
    try {
      event = JSON.parse(body) as StripeEvent;
    } catch {
      throw new ApiError(400, 'bad_json', 'Cererea nu este JSON valid.');
    }
    const session = event.data?.object;
    const sessionId = typeof session?.id === 'string' ? session.id : null;
    // Other events are welcome and ignored: Stripe stops sending them only after a 2xx.
    if (!sessionId) return c.json({ received: true });

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        if (session?.payment_status === 'paid' && typeof session.amount_total === 'number' && typeof session.currency === 'string') {
          await markPaid(c.env.DB, sessionId, session.amount_total, session.currency, nowIso());
        }
        break;
      case 'checkout.session.async_payment_failed':
        await closeUnpaid(c.env.DB, sessionId, 'failed');
        break;
      case 'checkout.session.expired':
        await closeUnpaid(c.env.DB, sessionId, 'expired');
        break;
    }
    return c.json({ received: true });
  });

  return routes;
}

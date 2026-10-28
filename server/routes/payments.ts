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
  type SessionGuard,
} from '../db/payments.ts';
import type { AppEnv, AppOptions, Env } from '../env.ts';
import { ApiError } from '../errors.ts';
import { nowIso, readJson } from '../http.ts';
import { createCheckoutSession, verifyStripeSignature } from '../payments/stripe.ts';

const paymentsOff = () => new ApiError(503, 'payments_off', 'Plățile nu sunt încă active.');
const unknownFeature = () => new ApiError(404, 'unknown_feature', 'Funcția aleasă nu există.');

// A Stripe event body is a few kilobytes; anything far larger is not Stripe.
const MAX_WEBHOOK_BYTES = 256 * 1024;

// How long Stripe keeps a payment page open (its minimum is 30 minutes).
const CHECKOUT_OPEN_MS = 60 * 60_000;

// Both keys come from the Stripe account. Without them the app sells nothing.
function stripeKeys(env: Env): { secretKey: string; webhookSecret: string } | null {
  return env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET
    ? { secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET }
    : null;
}

function catalogOf(options: AppOptions): PaidFeatures {
  return options.paidFeatures ?? PAID_FEATURES;
}

function lookUp(catalog: PaidFeatures, key: string): PaidFeature | undefined {
  return Object.hasOwn(catalog, key) ? catalog[key] : undefined;
}

// The feature on sale to this payer, from the server's catalog only. Students
// have no login (anyone with the link may pick a name), so a student buys a
// feature for one test only, never for the whole account.
export function featureFor(options: AppOptions, key: string, payer: Payer): PaidFeature {
  const feature = lookUp(catalogOf(options), key);
  if (!feature || feature.payer !== payer) throw unknownFeature();
  if (payer === 'student' && feature.scope !== 'test') throw unknownFeature();
  return feature;
}

// The gate of a paid feature, for any route of any flow: 402 until the
// webhook has seen the payment. The feature's scope picks what counts: a
// payment for the account, or one for `test` (which a test feature needs).
export async function requirePaid(
  env: Env,
  options: AppOptions,
  payer: PaymentPayer,
  feature: string,
  test: PaidTest | null = null,
): Promise<void> {
  const found = lookUp(catalogOf(options), feature);
  if (!found) throw new Error(`requirePaid: "${feature}" is not in the catalog`);
  if (found.scope === 'test' && !test) throw new Error(`requirePaid: "${feature}" is bought for one test; name the test`);
  if (!(await hasPaid(env.DB, payer, feature, found.scope === 'test' ? test : null))) {
    throw new ApiError(402, 'payment_required', 'Această funcție trebuie plătită înainte.');
  }
}

export interface CheckoutRequest {
  payer: PaymentPayer;
  feature: string;
  returnPath: string;
  test: PaidTest | null;
  // Students only: the phone's upload, checked inside the insert.
  guard?: SessionGuard;
}

// Makes a pending payment and its Stripe payment page, or gives the page that
// is still open. Only the webhook marks it paid: coming back to the success
// address proves nothing.
export async function startCheckout(
  c: Context<AppEnv>,
  options: AppOptions,
  request: CheckoutRequest,
): Promise<{ answer: CheckoutAnswer; status: 200 | 201 }> {
  const keys = stripeKeys(c.env);
  if (!keys) throw paymentsOff();
  const kind: Payer = request.payer.studentId === null ? 'teacher' : 'student';
  const feature = featureFor(options, request.feature, kind);
  if (!isReturnPath(request.returnPath, kind)) throw new ApiError(400, 'invalid', 'Pagina de întoarcere nu este validă.');
  if (feature.scope === 'test' && !request.test) throw new ApiError(400, 'invalid', 'Alege testul pentru care plătești.');
  const test = feature.scope === 'test' ? request.test : null;

  const createdAt = nowIso();
  const made = await createPayment(
    c.env.DB,
    { payer: request.payer, feature: request.feature, test, amount: feature.amount, currency: feature.currency, createdAt },
    request.guard ?? null,
  );
  if (made.kind === 'paid') throw new ApiError(409, 'already_paid', 'Ai plătit deja această funcție.');
  if (made.kind === 'open') return { answer: { url: made.url }, status: 200 };
  if (made.kind === 'busy') throw new ApiError(409, 'payment_busy', 'Pagina de plată se deschide deja. Încearcă din nou peste un minut.');
  if (made.kind === 'refused') throw new ApiError(401, 'no_session', 'Încărcarea nu mai este valabilă. Alege-ți din nou numele.');

  const paymentId = made.id;
  const expiresAt = new Date(Date.parse(createdAt) + CHECKOUT_OPEN_MS);
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
      expiresAtS: Math.floor(expiresAt.getTime() / 1000),
      successUrl: returnUrl(origin, request.returnPath, 'reusita'),
      cancelUrl: returnUrl(origin, request.returnPath, 'anulata'),
    });
  } catch (err) {
    console.error('Stripe checkout:', err instanceof Error ? err.message : String(err));
    await failPayment(c.env.DB, paymentId);
    throw new ApiError(502, 'payment_page', 'Pagina de plată nu a putut fi deschisă. Încearcă din nou.');
  }
  await setStripeSession(c.env.DB, paymentId, session.id, session.url, expiresAt.toISOString());
  return { answer: { url: session.url }, status: 201 };
}

// /api/admin/payments: the teacher's own payments. Behind teacherAuth.
export function adminPaymentRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const payerOf = (c: Context<AppEnv>): PaymentPayer => ({ teacherId: c.var.teacher.id, studentId: null });

  routes.get('/', async (c) => c.json({ payments: await listPayments(c.env.DB, payerOf(c)) }));

  routes.post('/checkout', async (c) => {
    const body = await readJson(c, checkoutBody, 4096);
    // The test is read only for a feature bought for one test.
    const feature = featureFor(options, body.feature, 'teacher');
    let test: PaidTest | null = null;
    if (feature.scope === 'test' && body.testCode !== undefined) {
      const code = normalizeTestCode(body.testCode);
      test = code === null ? null : await findTeacherTest(c.env.DB, c.var.teacher.id, code);
      if (!test) throw new ApiError(404, 'not_found', 'Nu am găsit ce cauți.');
    }
    const { answer, status } = await startCheckout(c, options, { payer: payerOf(c), feature: body.feature, returnPath: body.returnPath, test });
    return c.json(answer, status);
  });

  return routes;
}

interface StripeEvent {
  type?: unknown;
  data?: { object?: { id?: unknown; payment_status?: unknown; amount_total?: unknown; currency?: unknown } };
}

const tooLarge = () => new ApiError(413, 'too_large', 'Cererea este prea mare.');

// /api/payments/webhook: Stripe tells the app about a payment. No login and no
// same-origin rule: the signature on the exact body is the key.
export function paymentWebhookRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post('/webhook', async (c) => {
    const keys = stripeKeys(c.env);
    if (!keys) throw paymentsOff();
    if (Number(c.req.header('Content-Length') ?? 0) > MAX_WEBHOOK_BYTES) throw tooLarge();
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength > MAX_WEBHOOK_BYTES) throw tooLarge();
    if (!(await verifyStripeSignature(bytes, c.req.header('Stripe-Signature'), keys.webhookSecret))) {
      throw new ApiError(400, 'bad_signature', 'Semnătura nu este validă.');
    }

    let event: StripeEvent;
    try {
      event = JSON.parse(new TextDecoder().decode(bytes)) as StripeEvent;
    } catch {
      throw new ApiError(400, 'bad_json', 'Cererea nu este JSON valid.');
    }
    const session = event.data?.object;
    const sessionId = typeof session?.id === 'string' ? session.id : null;
    // Other events are welcome and ignored: Stripe stops sending them only after a 2xx.
    if (!sessionId) return c.json({ received: true });

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        if (session?.payment_status !== 'paid') break;
        // Stripe is the truth about money: a paid session turns its row paid
        // even after the row was marked expired or failed.
        const marked =
          typeof session.amount_total === 'number' &&
          typeof session.currency === 'string' &&
          (await markPaid(c.env.DB, sessionId, session.amount_total, session.currency, nowIso()));
        // A repeat of an event already seen changes nothing either; a payment
        // that matches no row needs a person to look at it.
        if (!marked && !(await hasPaidSession(c.env, sessionId))) {
          console.error('Stripe paid session matches no payment:', sessionId, session.amount_total, session.currency);
        }
        break;
      }
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

async function hasPaidSession(env: Env, sessionId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT 1 AS paid FROM payments WHERE stripe_session_id = ? AND status = 'paid'").bind(sessionId).first();
  return row !== null;
}

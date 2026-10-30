import type { D1Database } from '@cloudflare/workers-types';
import type { PaymentRow, PaymentStatus } from '../../shared/payments.ts';

// Payments (migrations 0015, 0016 and 0017). A teacher's payment has student_id NULL. A
// payment for one test names it by id and created_at: ids of deleted tests come back.
// Refunds and disputes are kept in stripe_charges by payment intent, and joined
// at read time: Stripe may tell them before the paid session.

export interface PaymentPayer {
  teacherId: number;
  // Null for the teacher.
  studentId: number | null;
}

// A test as a payment names it.
export interface PaidTest {
  id: number;
  createdAt: string;
  code: string;
}

export interface NewPayment {
  payer: PaymentPayer;
  feature: string;
  test: PaidTest | null;
  amount: number;
  currency: string;
  createdAt: string;
}

// A student's payment is made only while this phone's upload exists in the test.
export interface SessionGuard {
  testId: number;
  sessionHash: string;
}

export type NewPaymentAnswer =
  | { kind: 'created'; id: number }
  | { kind: 'paid' }
  // A pending payment whose Stripe page is still open: the same page again.
  | { kind: 'open'; url: string }
  // Another request is making the page right now.
  | { kind: 'busy' }
  // A paid payment whose dispute is still open: the feature is closed, and no second payment is made.
  | { kind: 'disputed' }
  // The guard's upload is gone (a reset, another phone).
  | { kind: 'refused' };

// A page that closes sooner than this is not given again.
const REUSE_MARGIN_MS = 10 * 60_000;
// A pending row without a page is another request in progress for this long;
// after it, the request is taken as dead.
const BUSY_MS = 2 * 60_000;

// The same payer, feature and test, for a payments row named p.
const SAME = 'p.teacher_id = ? AND p.student_id IS ? AND p.feature = ? AND p.test_id IS ? AND p.test_created_at IS ?';

// Dispute statuses that do not change again.
const DISPUTE_CLOSED = "('won', 'lost', 'warning_closed', 'prevented')";

// What Stripe said about the payment intent of the row p, in the currency of
// p: a charge event in another currency is not about this payment.
const chargeOf = (condition: string) =>
  `EXISTS (SELECT 1 FROM stripe_charges ch
    WHERE ch.payment_intent = p.stripe_payment_intent AND ch.currency = p.currency AND (${condition}))`;

// A paid payment p that opens its feature: not refunded in full, and not
// disputed unless the seller won the dispute. A partial refund keeps the feature.
const HELD = `(p.status = 'paid' AND NOT ${chargeOf("ch.amount_refunded >= p.amount OR (ch.dispute_status IS NOT NULL AND ch.dispute_status <> 'won')")})`;

// The money of a paid payment p went back to the payer: a full refund, or a
// dispute closed other than won. The payer may then buy again.
const GIVEN_BACK = chargeOf("ch.amount_refunded >= p.amount OR ch.dispute_status IN ('lost', 'warning_closed', 'prevented')");

// A payment that a new one would repeat: paid and not given back (an open
// dispute included), or a page that is still open or being made.
const BLOCKING = `((p.status = 'paid' AND NOT ${GIVEN_BACK}) OR (p.status = 'pending' AND (
  (p.checkout_url IS NOT NULL AND p.checkout_expires_at > ?) OR (p.checkout_url IS NULL AND p.created_at > ?))))`;

// A new pending payment, unless the payer already paid or has an open page.
// The check is inside the INSERT: two clicks at once make one row.
export async function createPayment(db: D1Database, payment: NewPayment, guard: SessionGuard | null = null): Promise<NewPaymentAnswer> {
  const now = Date.parse(payment.createdAt);
  const reuseUntil = new Date(now + REUSE_MARGIN_MS).toISOString();
  const busySince = new Date(now - BUSY_MS).toISOString();
  const same = [payment.payer.teacherId, payment.payer.studentId, payment.feature, payment.test?.id ?? null, payment.test?.createdAt ?? null];
  const guardSql = guard ? 'AND EXISTS (SELECT 1 FROM submissions WHERE test_id = ? AND student_id = ? AND session_hash = ?)' : '';
  const row = await db
    .prepare(
      `INSERT INTO payments (teacher_id, student_id, feature, test_id, test_created_at, test_code, amount, currency, status, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?
       WHERE NOT EXISTS (SELECT 1 FROM payments p WHERE ${SAME} AND ${BLOCKING}) ${guardSql}
       RETURNING id`,
    )
    .bind(
      ...same,
      payment.test?.code ?? null,
      payment.amount,
      payment.currency,
      payment.createdAt,
      ...same,
      reuseUntil,
      busySince,
      ...(guard ? [guard.testId, payment.payer.studentId, guard.sessionHash] : []),
    )
    .first<{ id: number }>();
  if (row) return { kind: 'created', id: row.id };

  const found = await db
    .prepare(
      `SELECT p.status, p.checkout_url, ${HELD} AS held FROM payments p WHERE ${SAME} AND ${BLOCKING}
       ORDER BY p.status = 'paid' DESC, held DESC, p.created_at DESC, p.id DESC LIMIT 1`,
    )
    .bind(...same, reuseUntil, busySince)
    .first<{ status: PaymentStatus; checkout_url: string | null; held: number }>();
  if (!found) return { kind: 'refused' };
  if (found.status === 'paid') return found.held === 1 ? { kind: 'paid' } : { kind: 'disputed' };
  return found.checkout_url ? { kind: 'open', url: found.checkout_url } : { kind: 'busy' };
}

export async function setStripeSession(db: D1Database, paymentId: number, sessionId: string, url: string, expiresAt: string): Promise<void> {
  await db
    .prepare("UPDATE payments SET stripe_session_id = ?, checkout_url = ?, checkout_expires_at = ? WHERE id = ? AND status = 'pending'")
    .bind(sessionId, url, expiresAt, paymentId)
    .run();
}

// Stripe did not make a payment page: the row can never be paid.
export async function failPayment(db: D1Database, paymentId: number): Promise<void> {
  await db.prepare("UPDATE payments SET status = 'failed' WHERE id = ? AND status = 'pending'").bind(paymentId).run();
}

// The webhook's write. Stripe sends an event again until it gets a 2xx, so a
// payment turns paid once only, and only for the amount and currency the row
// asked for. A paid payment then keeps the session's payment intent, which
// charge and dispute events name; a repeated event fills it in when it is
// missing. True when this call marked the payment paid.
export async function markPaid(
  db: D1Database,
  sessionId: string,
  amount: number,
  currency: string,
  paymentIntent: string | null,
  now: string,
): Promise<boolean> {
  const [marked] = await db.batch([
    db
      .prepare(
        `UPDATE payments SET status = 'paid', paid_at = ?
         WHERE stripe_session_id = ? AND status <> 'paid' AND amount = ? AND currency = ?`,
      )
      .bind(now, sessionId, amount, currency.toLowerCase()),
    db
      .prepare(
        `UPDATE payments SET stripe_payment_intent = ?
         WHERE stripe_session_id = ? AND status = 'paid' AND stripe_payment_intent IS NULL AND ? IS NOT NULL`,
      )
      .bind(paymentIntent, sessionId, paymentIntent),
  ]);
  return (marked?.meta.changes ?? 0) > 0;
}

// What a charge or dispute event says about a payment intent.
export interface ChargeNews {
  paymentIntent: string;
  currency: string;
  // charge.refunded: the charge's total of refunds so far, and whether it is refunded in full.
  amountRefunded?: number;
  refunded?: boolean;
  // charge.dispute.created and charge.dispute.closed.
  dispute?: { id: string; status: string };
}

// The payment a charge event is about, when a row has its payment intent already.
export type ChargeMatch =
  | { kind: 'matched'; paymentId: number }
  | { kind: 'unmatched' }
  | { kind: 'wrong_currency'; paymentId: number; currency: string };

// The webhook's write for a refund or a dispute. It is kept by payment intent,
// with or without a payment row yet (the paid session may come later). Every
// write is safe to repeat and to get in any order: the refunded total only
// grows, the time of the full refund is the first one, and a closed dispute
// does not open again. News in another currency than the payment's is not kept.
export async function saveChargeNews(db: D1Database, news: ChargeNews, now: string): Promise<ChargeMatch> {
  const currency = news.currency.toLowerCase();
  const [, found] = await db.batch([
    db
      .prepare(
        `INSERT INTO stripe_charges (payment_intent, currency, amount_refunded, refunded_at, dispute_id, dispute_status, disputed_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM payments WHERE stripe_payment_intent = ? AND currency <> ?)
         ON CONFLICT (payment_intent) DO UPDATE SET
           amount_refunded = MAX(stripe_charges.amount_refunded, excluded.amount_refunded),
           refunded_at = COALESCE(stripe_charges.refunded_at, excluded.refunded_at),
           dispute_id = COALESCE(excluded.dispute_id, stripe_charges.dispute_id),
           dispute_status = CASE
             WHEN excluded.dispute_status IS NULL THEN stripe_charges.dispute_status
             WHEN stripe_charges.dispute_status IN ${DISPUTE_CLOSED} AND excluded.dispute_status NOT IN ${DISPUTE_CLOSED}
               THEN stripe_charges.dispute_status
             ELSE excluded.dispute_status END,
           disputed_at = COALESCE(stripe_charges.disputed_at, excluded.disputed_at),
           updated_at = excluded.updated_at
         WHERE stripe_charges.currency = excluded.currency`,
      )
      .bind(
        news.paymentIntent,
        currency,
        news.amountRefunded ?? 0,
        news.refunded ? now : null,
        news.dispute?.id ?? null,
        news.dispute?.status ?? null,
        news.dispute ? now : null,
        now,
        news.paymentIntent,
        currency,
      ),
    db.prepare('SELECT id, currency FROM payments WHERE stripe_payment_intent = ?').bind(news.paymentIntent),
  ]);
  const row = (found?.results as { id: number; currency: string }[] | undefined)?.[0];
  if (!row) return { kind: 'unmatched' };
  return row.currency === currency ? { kind: 'matched', paymentId: row.id } : { kind: 'wrong_currency', paymentId: row.id, currency: row.currency };
}

// An expired page or a failed bank transfer. A paid payment stays paid.
export async function closeUnpaid(db: D1Database, sessionId: string, status: Extract<PaymentStatus, 'failed' | 'expired'>): Promise<void> {
  await db.prepare("UPDATE payments SET status = ? WHERE stripe_session_id = ? AND status = 'pending'").bind(status, sessionId).run();
}

// Whether the payer bought the feature, for the account or for this test, and
// still holds it: not refunded in full and not disputed.
export async function hasPaid(db: D1Database, payer: PaymentPayer, feature: string, test: PaidTest | null = null): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT EXISTS (
         SELECT 1 FROM payments p
         WHERE p.teacher_id = ? AND p.student_id IS ? AND p.feature = ? AND p.test_id IS ? AND p.test_created_at IS ?
           AND ${HELD}
       ) AS paid`,
    )
    .bind(payer.teacherId, payer.studentId, feature, test?.id ?? null, test?.createdAt ?? null)
    .first<{ paid: number }>();
  return row?.paid === 1;
}

// The payer's payments, newest first, with their refunds and disputes. `test` limits them to one test.
export async function listPayments(db: D1Database, payer: PaymentPayer, test: PaidTest | null = null): Promise<PaymentRow[]> {
  const testFilter = test ? 'AND p.test_id = ? AND p.test_created_at = ?' : '';
  const params: unknown[] = [payer.teacherId, payer.studentId, ...(test ? [test.id, test.createdAt] : [])];
  const { results } = await db
    .prepare(
      `SELECT p.id, p.feature, p.test_code, p.amount, p.currency, p.status, p.created_at, p.paid_at,
         COALESCE(ch.amount_refunded, 0) AS amount_refunded, ch.refunded_at, ch.dispute_status, ${HELD} AS held
       FROM payments p
       LEFT JOIN stripe_charges ch ON ch.payment_intent = p.stripe_payment_intent AND ch.currency = p.currency
       WHERE p.teacher_id = ? AND p.student_id IS ? ${testFilter}
       ORDER BY p.created_at DESC, p.id DESC LIMIT 100`,
    )
    .bind(...params)
    .all<{
      id: number;
      feature: string;
      test_code: string | null;
      amount: number;
      currency: string;
      status: PaymentStatus;
      created_at: string;
      paid_at: string | null;
      amount_refunded: number;
      refunded_at: string | null;
      dispute_status: string | null;
      held: number;
    }>();
  return results.map((row) => ({
    id: row.id,
    feature: row.feature,
    testCode: row.test_code,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    amountRefunded: row.amount_refunded,
    refundedAt: row.refunded_at,
    disputeStatus: row.dispute_status,
    active: row.held === 1,
  }));
}

// The teacher's own test, as a payment names it.
export async function findTeacherTest(db: D1Database, teacherId: number, code: string): Promise<PaidTest | null> {
  const row = await db
    .prepare('SELECT id, created_at, code FROM tests WHERE teacher_id = ? AND code = ?')
    .bind(teacherId, code)
    .first<{ id: number; created_at: string; code: string }>();
  return row ? { id: row.id, createdAt: row.created_at, code: row.code } : null;
}

import type { D1Database } from '@cloudflare/workers-types';
import type { PaymentRow, PaymentStatus } from '../../shared/payments.ts';

// Payments (migrations 0015 and 0016). A teacher's payment has student_id NULL. A
// payment for one test names it by id and created_at: ids of deleted tests come back.

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
  // The guard's upload is gone (a reset, another phone).
  | { kind: 'refused' };

// A page that closes sooner than this is not given again.
const REUSE_MARGIN_MS = 10 * 60_000;
// A pending row without a page is another request in progress for this long;
// after it, the request is taken as dead.
const BUSY_MS = 2 * 60_000;

// The same payer, feature and test.
const SAME = 'teacher_id = ? AND student_id IS ? AND feature = ? AND test_id IS ? AND test_created_at IS ?';
// A payment that a new one would repeat: paid, or a page that is still open or being made.
const BLOCKING = `(status = 'paid' OR (status = 'pending' AND (
  (checkout_url IS NOT NULL AND checkout_expires_at > ?) OR (checkout_url IS NULL AND created_at > ?))))`;

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
       WHERE NOT EXISTS (SELECT 1 FROM payments WHERE ${SAME} AND ${BLOCKING}) ${guardSql}
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
      `SELECT status, checkout_url FROM payments WHERE ${SAME} AND ${BLOCKING}
       ORDER BY status = 'paid' DESC, created_at DESC, id DESC LIMIT 1`,
    )
    .bind(...same, reuseUntil, busySince)
    .first<{ status: PaymentStatus; checkout_url: string | null }>();
  if (!found) return { kind: 'refused' };
  if (found.status === 'paid') return { kind: 'paid' };
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
// asked for. True when this call marked it.
export async function markPaid(db: D1Database, sessionId: string, amount: number, currency: string, now: string): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE payments SET status = 'paid', paid_at = ?
       WHERE stripe_session_id = ? AND status <> 'paid' AND amount = ? AND currency = ?`,
    )
    .bind(now, sessionId, amount, currency.toLowerCase())
    .run();
  return result.meta.changes > 0;
}

// An expired page or a failed bank transfer. A paid payment stays paid.
export async function closeUnpaid(db: D1Database, sessionId: string, status: Extract<PaymentStatus, 'failed' | 'expired'>): Promise<void> {
  await db.prepare("UPDATE payments SET status = ? WHERE stripe_session_id = ? AND status = 'pending'").bind(status, sessionId).run();
}

// Whether the payer bought the feature: for the account, or for this test.
export async function hasPaid(db: D1Database, payer: PaymentPayer, feature: string, test: PaidTest | null = null): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT EXISTS (
         SELECT 1 FROM payments
         WHERE teacher_id = ? AND student_id IS ? AND feature = ? AND status = 'paid'
           AND test_id IS ? AND test_created_at IS ?
       ) AS paid`,
    )
    .bind(payer.teacherId, payer.studentId, feature, test?.id ?? null, test?.createdAt ?? null)
    .first<{ paid: number }>();
  return row?.paid === 1;
}

// The payer's payments, newest first. `test` limits them to one test.
export async function listPayments(db: D1Database, payer: PaymentPayer, test: PaidTest | null = null): Promise<PaymentRow[]> {
  const testFilter = test ? 'AND test_id = ? AND test_created_at = ?' : '';
  const params: unknown[] = [payer.teacherId, payer.studentId, ...(test ? [test.id, test.createdAt] : [])];
  const { results } = await db
    .prepare(
      `SELECT id, feature, test_code, amount, currency, status, created_at, paid_at FROM payments
       WHERE teacher_id = ? AND student_id IS ? ${testFilter}
       ORDER BY created_at DESC, id DESC LIMIT 100`,
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

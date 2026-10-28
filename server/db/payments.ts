import type { D1Database } from '@cloudflare/workers-types';
import type { PaymentRow, PaymentStatus } from '../../shared/payments.ts';

// Payments (migration 0015). A teacher's payment has student_id NULL. A
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

export async function createPayment(db: D1Database, payment: NewPayment): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO payments (teacher_id, student_id, feature, test_id, test_created_at, test_code, amount, currency, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?) RETURNING id`,
    )
    .bind(
      payment.payer.teacherId,
      payment.payer.studentId,
      payment.feature,
      payment.test?.id ?? null,
      payment.test?.createdAt ?? null,
      payment.test?.code ?? null,
      payment.amount,
      payment.currency,
      payment.createdAt,
    )
    .first<{ id: number }>();
  return row!.id;
}

export async function setStripeSession(db: D1Database, paymentId: number, sessionId: string): Promise<void> {
  await db.prepare("UPDATE payments SET stripe_session_id = ? WHERE id = ? AND status = 'pending'").bind(sessionId, paymentId).run();
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

// The payer's payments, newest first. With `test`: those for the whole account
// and those for this test.
export async function listPayments(db: D1Database, payer: PaymentPayer, test: PaidTest | null = null): Promise<PaymentRow[]> {
  const testFilter = test ? 'AND (test_id IS NULL OR (test_id = ? AND test_created_at = ?))' : '';
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

export async function findTestById(db: D1Database, testId: number): Promise<PaidTest | null> {
  const row = await db
    .prepare('SELECT id, created_at, code FROM tests WHERE id = ?')
    .bind(testId)
    .first<{ id: number; created_at: string; code: string }>();
  return row ? { id: row.id, createdAt: row.created_at, code: row.code } : null;
}

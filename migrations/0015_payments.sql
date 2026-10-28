-- Payments through Stripe Checkout. One row for each payment page made.
-- A teacher's payment has no student_id. A payment for one test names the
-- test by its id and its created_at, because ids of deleted tests come back.
-- Only the Stripe webhook sets status to paid.

CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  student_id INTEGER REFERENCES students(id),
  feature TEXT NOT NULL,
  test_id INTEGER,
  test_created_at TEXT,
  test_code TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  stripe_session_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE INDEX payments_by_payer ON payments (teacher_id, student_id, feature);

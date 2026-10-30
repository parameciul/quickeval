-- Refunds and disputes, made in the Stripe dashboard and told by the webhook.
-- A paid payment keeps the Stripe payment intent of its Checkout session: charge
-- and dispute events name the payment intent, never the session.
-- What Stripe says about a payment intent is kept in stripe_charges, whether or
-- not a payment row has that payment intent yet, so the events may come in any
-- order. The reads join the two tables.

ALTER TABLE payments ADD COLUMN stripe_payment_intent TEXT;

CREATE UNIQUE INDEX payments_by_payment_intent ON payments (stripe_payment_intent);

CREATE TABLE stripe_charges (
  payment_intent TEXT PRIMARY KEY,
  currency TEXT NOT NULL,
  -- In the smallest unit of the currency, the total of all refunds so far.
  amount_refunded INTEGER NOT NULL DEFAULT 0,
  -- When Stripe first said the charge was refunded in full.
  refunded_at TEXT,
  dispute_id TEXT,
  -- Stripe's dispute status. Once won, lost, warning_closed or prevented, it does not go back.
  dispute_status TEXT,
  disputed_at TEXT,
  updated_at TEXT NOT NULL
);

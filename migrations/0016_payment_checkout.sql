-- The Stripe payment page of a pending payment, and when Stripe closes it.
-- A second click on the same feature gets this page again instead of a second charge.
ALTER TABLE payments ADD COLUMN checkout_url TEXT;
ALTER TABLE payments ADD COLUMN checkout_expires_at TEXT;

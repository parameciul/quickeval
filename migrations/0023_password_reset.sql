-- A teacher who forgot the password asks for a link by email. Only the SHA-256
-- of the link's token is kept; the link works for one hour and once.
-- reset_requested_at limits an account to one link every few minutes, and
-- reset_count to a few a day (reset_window_start starts the day), so nobody
-- can flood an inbox or keep replacing the link.
ALTER TABLE teachers ADD COLUMN reset_token_hash TEXT;
ALTER TABLE teachers ADD COLUMN reset_expires_at TEXT;
ALTER TABLE teachers ADD COLUMN reset_requested_at TEXT;
ALTER TABLE teachers ADD COLUMN reset_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teachers ADD COLUMN reset_window_start TEXT;

-- Link requests from one IP (as login_ips) in the current one-day window,
-- whatever their outcome and whatever the email.
CREATE TABLE reset_ips (
  ip_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_start TEXT NOT NULL
);

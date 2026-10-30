-- Teacher accounts: a login with email and password, roles, approval, and the
-- demo limit. Teachers who exist now stay active and complete (not demo); the
-- two emails below become the administrators. A new account starts pending
-- and demo (server/db/accounts.ts sets that on insert). One statement per ";"
-- line end (the test helper splits on that), and no ";" inside strings.

ALTER TABLE teachers ADD COLUMN role TEXT NOT NULL DEFAULT 'teacher' CHECK (role IN ('admin', 'teacher'));
ALTER TABLE teachers ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'disabled'));
ALTER TABLE teachers ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teachers ADD COLUMN tests_evaluated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teachers ADD COLUMN password_hash TEXT;
ALTER TABLE teachers ADD COLUMN failed_logins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teachers ADD COLUMN locked_until TEXT;
ALTER TABLE teachers ADD COLUMN approved_at TEXT;
-- SHA-256 of the IP that asked for the account, while it waits: limits sign-ups per IP.
ALTER TABLE teachers ADD COLUMN signup_ip_hash TEXT;
-- A new account proves its email with a link (only the SHA-256 of the link's
-- token is kept). Accounts that exist now count as confirmed.
ALTER TABLE teachers ADD COLUMN email_confirmed_at TEXT;
ALTER TABLE teachers ADD COLUMN confirm_token_hash TEXT;

UPDATE teachers SET email_confirmed_at = created_at;

UPDATE teachers SET role = 'admin' WHERE email IN ('plesalaura@yahoo.com', 'mg1497_miron@yahoo.com');

-- Should neither email have a row, the first teacher (who ran the app until
-- now) stays the one who may open Setări.
UPDATE teachers SET role = 'admin' WHERE id = (SELECT MIN(id) FROM teachers) AND NOT EXISTS (SELECT 1 FROM teachers WHERE role = 'admin');

-- The files_version of the test when it last counted against the demo limit;
-- NULL until it first does. A test counts once for the same files (a reopen
-- and a new start with the same test and barem is free), and again when it
-- starts with new files: one test row cannot grade test after new test.
ALTER TABLE tests ADD COLUMN counted_files_version INTEGER;

UPDATE tests SET counted_files_version = files_version WHERE status IN ('evaluating', 'done') OR evaluation_started_at IS NOT NULL;

-- Every path that grades new uploads moves the test from 'open' to
-- 'evaluating', so the count lives here instead of in each of them. A regrade
-- (done to evaluating) grades the same uploads again and does not count. The
-- statements inside the trigger share one line: the test helper splits on ";"
-- at a line end.
CREATE TRIGGER tests_count_evaluation AFTER UPDATE OF status ON tests
WHEN OLD.status = 'open' AND NEW.status = 'evaluating' AND NEW.counted_files_version IS NOT NEW.files_version
BEGIN
  UPDATE teachers SET tests_evaluated = tests_evaluated + 1 WHERE id = NEW.teacher_id; UPDATE tests SET counted_files_version = NEW.files_version WHERE id = NEW.id; END;

-- A login. Only the SHA-256 of the cookie's token is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX sessions_by_teacher ON sessions (teacher_id);

-- A browser that logged in to the account before (the qe_device cookie; only
-- its SHA-256 is stored). Its logins skip the account's lock, so wrong
-- passwords typed by someone else cannot lock the teacher out; it counts its
-- own wrong passwords instead.
CREATE TABLE trusted_devices (
  token_hash TEXT PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);

CREATE INDEX trusted_devices_by_teacher ON trusted_devices (teacher_id);

-- Wrong passwords from one IP (SHA-256 of a /64 for IPv6) in the current
-- window, across all accounts: someone guessing many accounts at once.
CREATE TABLE login_ips (
  ip_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_start TEXT NOT NULL
);

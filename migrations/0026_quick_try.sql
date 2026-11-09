-- Quick Try (spec: docs/superpowers/specs/2026-11-09-quick-try-design.md).
-- Each try is a hidden guest teacher (teachers.quick_try = 1) with its own
-- class, student, test (tests.quick_try = 1) and paper. tests.quick_try is a
-- flat flag so the robot's conditions keep tries out of the print job and the
-- class analysis. quick_tries holds one row per try: the link token's hash,
-- the Bucharest day and the IP hash that the daily limits count, and whether
-- an administrator made it.
ALTER TABLE teachers ADD COLUMN quick_try INTEGER NOT NULL DEFAULT 0 CHECK (quick_try IN (0, 1));
ALTER TABLE tests ADD COLUMN quick_try INTEGER NOT NULL DEFAULT 0 CHECK (quick_try IN (0, 1));
CREATE TABLE quick_tries (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL UNIQUE REFERENCES teachers(id),
  token_hash TEXT NOT NULL UNIQUE,
  day TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  by_admin INTEGER NOT NULL DEFAULT 0 CHECK (by_admin IN (0, 1)),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX quick_tries_by_day_ip ON quick_tries (day, ip_hash);

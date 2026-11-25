-- An administrator's read-only view of a teacher's account (Setări, "Vezi ca").
-- The row is also the log: no cascade from sessions, and a deleted account
-- leaves the row with a null id.
CREATE TABLE impersonations (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  session_hash TEXT NOT NULL,
  admin_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK (mode IN ('view', 'act')),
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ended_at TEXT,
  end_reason TEXT CHECK (end_reason IN ('exit', 'expired', 'replaced', 'session_gone'))
);

CREATE INDEX impersonations_by_teacher ON impersonations (teacher_id, started_at);
CREATE INDEX impersonations_by_admin ON impersonations (admin_id);

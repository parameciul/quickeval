-- When an account last used the teacher app (`last_seen_at`): written when the
-- app loads (GET /api/admin/me), at most once an hour. A login lasts 30 days,
-- so the last login alone says little about a teacher who stays logged in.
-- The last login (`last_login_at`, migration 0029) was only written by logins
-- after that migration: an account that logged in before it shows none. It is
-- filled from the logins the database still remembers: the sessions and the
-- browsers that logged in (`trusted_devices.created_at`, written only by a
-- good login; its `last_used_at` also moves on a wrong password, so it is not
-- used).
-- One statement per ";" line end (the test helper splits on that), and no ";"
-- inside strings.

ALTER TABLE teachers ADD COLUMN last_seen_at TEXT;

UPDATE teachers SET last_login_at = NULLIF(MAX(
    COALESCE((SELECT MAX(s.created_at) FROM sessions s WHERE s.teacher_id = teachers.id), ''),
    COALESCE((SELECT MAX(d.created_at) FROM trusted_devices d WHERE d.teacher_id = teachers.id), '')
  ), '')
  WHERE last_login_at IS NULL;

UPDATE teachers SET last_seen_at = last_login_at;

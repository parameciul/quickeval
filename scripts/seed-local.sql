-- The local development teacher, an administrator. Matches DEV_TEACHER_EMAIL
-- in .dev.vars.example. To try the login page locally, leave DEV_TEACHER_EMAIL
-- out of .dev.vars and set a password with `npm run set-password -- profesor@example.com --local`.
INSERT OR IGNORE INTO teachers (email, name, created_at)
VALUES ('profesor@example.com', 'Laura Miron', '2026-10-06T08:00:00.000Z');
UPDATE teachers SET role = 'admin' WHERE email = 'profesor@example.com';

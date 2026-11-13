-- Statistics of a teacher's account, on Setări: the history of its status
-- changes (created, email confirmed, approved, demo or complete, closed or
-- reopened, password changed) and the robot work that is not part of grading
-- papers (a generated barem, an exercise list, a class analysis, a print PDF
-- with the QR code). The last login is kept too, so an administrator sees when
-- an account was last used. One statement per ";" line end (the test helper
-- splits on that), and no ";" inside strings.

CREATE TABLE account_events (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('created', 'email_confirmed', 'approved', 'demo', 'complete', 'password', 'closed', 'reopened')),
  at TEXT NOT NULL
);

CREATE INDEX account_events_by_teacher ON account_events (teacher_id, at);

-- The last good login. Kept on the account, so it outlives its sessions (a
-- closed account ends them).
ALTER TABLE teachers ADD COLUMN last_login_at TEXT;

-- Robot work outside the grading of papers, counted like tests_evaluated and
-- papers_graded: the class and CES variants together.
ALTER TABLE teachers ADD COLUMN barems_generated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teachers ADD COLUMN exercise_lists_made INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teachers ADD COLUMN analyses_made INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teachers ADD COLUMN prints_made INTEGER NOT NULL DEFAULT 0;

-- The history of the accounts that exist now: what their own times tell. The
-- demo, complete, closed and reopened changes of the past were not kept.
INSERT INTO account_events (teacher_id, kind, at)
  SELECT id, 'created', created_at FROM teachers WHERE quick_try = 0;
INSERT INTO account_events (teacher_id, kind, at)
  SELECT id, 'email_confirmed', email_confirmed_at FROM teachers WHERE quick_try = 0 AND email_confirmed_at IS NOT NULL;
INSERT INTO account_events (teacher_id, kind, at)
  SELECT id, 'approved', approved_at FROM teachers WHERE quick_try = 0 AND approved_at IS NOT NULL;

-- The robot work that left a trace on a test: a list, an analysis, a print PDF,
-- and a barem whose generated name shows it was the robot's. Regenerations and
-- deleted tests are not counted: the counts are exact from this migration on.
UPDATE teachers SET
  barems_generated = (SELECT COUNT(*) FROM tests t WHERE t.teacher_id = teachers.id AND t.barem_file_name LIKE '%- barem generat.docx')
    + (SELECT COUNT(*) FROM tests t WHERE t.teacher_id = teachers.id AND t.ces_barem_file_name LIKE '%- barem CES generat.docx'),
  exercise_lists_made = (SELECT COUNT(*) FROM tests t WHERE t.teacher_id = teachers.id AND t.exercise_list_status IN ('ready', 'problem', 'accepted'))
    + (SELECT COUNT(*) FROM tests t WHERE t.teacher_id = teachers.id AND t.ces_exercise_list_status IN ('ready', 'problem', 'accepted')),
  analyses_made = (SELECT COUNT(*) FROM tests t WHERE t.teacher_id = teachers.id AND t.analysis_status = 'ready'),
  prints_made = (SELECT COUNT(*) FROM tests t WHERE t.teacher_id = teachers.id AND t.print_file_key IS NOT NULL)
    + (SELECT COUNT(*) FROM tests t WHERE t.teacher_id = teachers.id AND t.ces_print_file_key IS NOT NULL);

-- The history writes itself from the account's own changes, whatever the path:
-- a sign-up, the confirmation link, an approval, an administrator's change or a
-- new password (the command line included). A Quick Try's guest teacher has no
-- history: it is deleted after its days and is no account. A change keeps the
-- time of the change with SQLite's clock, in the same ISO 8601 UTC form.
CREATE TRIGGER teachers_log_created AFTER INSERT ON teachers
WHEN NEW.quick_try = 0
BEGIN
  INSERT INTO account_events (teacher_id, kind, at) VALUES (NEW.id, 'created', NEW.created_at); END;

CREATE TRIGGER teachers_log_email_confirmed AFTER UPDATE OF email_confirmed_at ON teachers
WHEN NEW.quick_try = 0 AND NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL
BEGIN
  INSERT INTO account_events (teacher_id, kind, at) VALUES (NEW.id, 'email_confirmed', NEW.email_confirmed_at); END;

CREATE TRIGGER teachers_log_approved AFTER UPDATE OF approved_at ON teachers
WHEN NEW.quick_try = 0 AND NEW.approved_at IS NOT NULL AND OLD.approved_at IS NULL
BEGIN
  INSERT INTO account_events (teacher_id, kind, at) VALUES (NEW.id, 'approved', NEW.approved_at); END;

CREATE TRIGGER teachers_log_demo AFTER UPDATE OF demo ON teachers
WHEN NEW.quick_try = 0 AND NEW.demo <> OLD.demo
BEGIN
  INSERT INTO account_events (teacher_id, kind, at)
    VALUES (NEW.id, CASE WHEN NEW.demo = 1 THEN 'demo' ELSE 'complete' END, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')); END;

CREATE TRIGGER teachers_log_status AFTER UPDATE OF status ON teachers
WHEN NEW.quick_try = 0 AND NEW.status <> OLD.status AND (NEW.status = 'disabled' OR OLD.status = 'disabled')
BEGIN
  INSERT INTO account_events (teacher_id, kind, at)
    VALUES (NEW.id, CASE WHEN NEW.status = 'disabled' THEN 'closed' ELSE 'reopened' END, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')); END;

CREATE TRIGGER teachers_log_password AFTER UPDATE OF password_hash ON teachers
WHEN NEW.quick_try = 0 AND NEW.password_hash IS NOT NULL AND (OLD.password_hash IS NULL OR OLD.password_hash <> NEW.password_hash)
BEGIN
  INSERT INTO account_events (teacher_id, kind, at) VALUES (NEW.id, 'password', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')); END;

-- The robot's work outside grading, counted when its result is saved (only the
-- run that holds the lease writes the result). The class and CES variants of
-- one operation count once each; a work the robot gives up on counts nothing.
CREATE TRIGGER tests_count_barem AFTER UPDATE OF barem_request, ces_barem_request ON tests
WHEN (OLD.barem_request = 'requested' AND NEW.barem_request = 'none' AND NEW.barem_unchecked = 1)
  OR (OLD.ces_barem_request = 'requested' AND NEW.ces_barem_request = 'none' AND NEW.ces_barem_unchecked = 1)
BEGIN
  UPDATE teachers SET barems_generated = barems_generated
      + (CASE WHEN OLD.barem_request = 'requested' AND NEW.barem_request = 'none' AND NEW.barem_unchecked = 1 THEN 1 ELSE 0 END)
      + (CASE WHEN OLD.ces_barem_request = 'requested' AND NEW.ces_barem_request = 'none' AND NEW.ces_barem_unchecked = 1 THEN 1 ELSE 0 END)
    WHERE id = NEW.teacher_id; END;

CREATE TRIGGER tests_count_exercise_list AFTER UPDATE OF exercise_list_status, ces_exercise_list_status ON tests
WHEN (OLD.exercise_list_status = 'none' AND NEW.exercise_list_status IN ('ready', 'problem'))
  OR (OLD.ces_exercise_list_status = 'none' AND NEW.ces_exercise_list_status IN ('ready', 'problem'))
BEGIN
  UPDATE teachers SET exercise_lists_made = exercise_lists_made
      + (CASE WHEN OLD.exercise_list_status = 'none' AND NEW.exercise_list_status IN ('ready', 'problem') THEN 1 ELSE 0 END)
      + (CASE WHEN OLD.ces_exercise_list_status = 'none' AND NEW.ces_exercise_list_status IN ('ready', 'problem') THEN 1 ELSE 0 END)
    WHERE id = NEW.teacher_id; END;

CREATE TRIGGER tests_count_analysis AFTER UPDATE OF analysis_status ON tests
WHEN OLD.analysis_status = 'requested' AND NEW.analysis_status = 'ready'
BEGIN
  UPDATE teachers SET analyses_made = analyses_made + 1 WHERE id = NEW.teacher_id; END;

CREATE TRIGGER tests_count_print AFTER UPDATE OF print_status, ces_print_status ON tests
WHEN (OLD.print_status <> 'ready' AND NEW.print_status = 'ready')
  OR (OLD.ces_print_status <> 'ready' AND NEW.ces_print_status = 'ready')
BEGIN
  UPDATE teachers SET prints_made = prints_made
      + (CASE WHEN OLD.print_status <> 'ready' AND NEW.print_status = 'ready' THEN 1 ELSE 0 END)
      + (CASE WHEN OLD.ces_print_status <> 'ready' AND NEW.ces_print_status = 'ready' THEN 1 ELSE 0 END)
    WHERE id = NEW.teacher_id; END;

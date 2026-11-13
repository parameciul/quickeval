-- More of an account's statistics, on Setări: who made each change of the
-- account, the requests that were refused, and the robot work with the tokens
-- it used and the failures it had. One statement per ";" line end (the test
-- helper splits on that), and no ";" inside strings.

-- The administrator (or the teacher on "Contul meu") who made a change that a
-- trigger of migration 0029 logs. Every write that changes a logged column
-- sets it, and one that has no actor (the console, the email link) clears it.
ALTER TABLE account_events ADD COLUMN by_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL;

ALTER TABLE teachers ADD COLUMN changed_by INTEGER;

-- The triggers that record a change record its actor too: the account itself,
-- or the administrator who made it on Setări. Created, confirmed and approved
-- keep no actor: nobody is logged in when they happen (an approval names the
-- administrator in changed_by, so it has one).
DROP TRIGGER teachers_log_approved;
CREATE TRIGGER teachers_log_approved AFTER UPDATE OF approved_at ON teachers
WHEN NEW.quick_try = 0 AND NEW.approved_at IS NOT NULL AND OLD.approved_at IS NULL
BEGIN
  INSERT INTO account_events (teacher_id, kind, at, by_teacher_id) VALUES (NEW.id, 'approved', NEW.approved_at, NEW.changed_by); END;

DROP TRIGGER teachers_log_demo;
CREATE TRIGGER teachers_log_demo AFTER UPDATE OF demo ON teachers
WHEN NEW.quick_try = 0 AND NEW.demo <> OLD.demo
BEGIN
  INSERT INTO account_events (teacher_id, kind, at, by_teacher_id)
    VALUES (NEW.id, CASE WHEN NEW.demo = 1 THEN 'demo' ELSE 'complete' END, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NEW.changed_by); END;

DROP TRIGGER teachers_log_status;
CREATE TRIGGER teachers_log_status AFTER UPDATE OF status ON teachers
WHEN NEW.quick_try = 0 AND NEW.status <> OLD.status AND (NEW.status = 'disabled' OR OLD.status = 'disabled')
BEGIN
  INSERT INTO account_events (teacher_id, kind, at, by_teacher_id)
    VALUES (NEW.id, CASE WHEN NEW.status = 'disabled' THEN 'closed' ELSE 'reopened' END, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NEW.changed_by); END;

DROP TRIGGER teachers_log_password;
CREATE TRIGGER teachers_log_password AFTER UPDATE OF password_hash ON teachers
WHEN NEW.quick_try = 0 AND NEW.password_hash IS NOT NULL AND (OLD.password_hash IS NULL OR OLD.password_hash <> NEW.password_hash)
BEGIN
  INSERT INTO account_events (teacher_id, kind, at, by_teacher_id) VALUES (NEW.id, 'password', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NEW.changed_by); END;

-- The requests that an administrator refused. A refusal deletes the account,
-- so this row is all that is left of it: who asked, when, and who said no. A
-- deleted administrator leaves the refusal with no name.
CREATE TABLE refused_accounts (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  asked_at TEXT NOT NULL,
  refused_at TEXT NOT NULL,
  by_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE INDEX refused_accounts_by_time ON refused_accounts (refused_at);

-- The robot's work, one row for each operation it made or gave up on: the
-- kind, the test, the variant, whether it worked, and the tokens Claude
-- reported for it (none for a print PDF, which is made without Claude, and for
-- a failure). A test that is deleted keeps its rows for the account, with no
-- test. The counters of migration 0029 stay: they are what the list of
-- accounts reads, and they go back further than this table.
CREATE TABLE robot_work (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  test_id INTEGER REFERENCES tests(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('grading', 'exercise_list', 'analysis', 'barem', 'print')),
  variant TEXT NOT NULL DEFAULT 'class' CHECK (variant IN ('class', 'ces')),
  ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
  tokens INTEGER,
  at TEXT NOT NULL
);

CREATE INDEX robot_work_by_teacher ON robot_work (teacher_id, at);

CREATE INDEX robot_work_by_test ON robot_work (test_id, kind);

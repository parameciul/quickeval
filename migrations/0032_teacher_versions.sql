-- A number per teacher that grows with every change the teacher pages show:
-- a test, an upload, its files, a grading and its points. The teacher app
-- reads only this number on a timer (GET /api/admin/version) and reads its
-- pages again when it changed: D1 bills every row read, and the pages stay
-- open for hours. Triggers write it, so every path counts (the robot, the
-- students, a scheduled start, the teacher, the command line). One statement
-- per ";" line end (the test helper splits on that), and no ";" inside strings.

CREATE TABLE teacher_versions (
  teacher_id INTEGER PRIMARY KEY REFERENCES teachers(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 0
);

INSERT INTO teacher_versions (teacher_id) SELECT id FROM teachers;

CREATE TRIGGER teachers_add_version AFTER INSERT ON teachers
BEGIN
  INSERT OR IGNORE INTO teacher_versions (teacher_id) VALUES (NEW.id); END;

CREATE TRIGGER tests_version_insert AFTER INSERT ON tests
BEGIN
  UPDATE teacher_versions SET version = version + 1 WHERE teacher_id = NEW.teacher_id; END;

CREATE TRIGGER tests_version_update AFTER UPDATE ON tests
BEGIN
  UPDATE teacher_versions SET version = version + 1 WHERE teacher_id = NEW.teacher_id; END;

CREATE TRIGGER tests_version_delete AFTER DELETE ON tests
BEGIN
  UPDATE teacher_versions SET version = version + 1 WHERE teacher_id = OLD.teacher_id; END;

CREATE TRIGGER submissions_version_insert AFTER INSERT ON submissions
BEGIN
  UPDATE teacher_versions SET version = version + 1 WHERE teacher_id = (SELECT teacher_id FROM tests WHERE id = NEW.test_id); END;

CREATE TRIGGER submissions_version_update AFTER UPDATE ON submissions
BEGIN
  UPDATE teacher_versions SET version = version + 1 WHERE teacher_id = (SELECT teacher_id FROM tests WHERE id = NEW.test_id); END;

CREATE TRIGGER submissions_version_delete AFTER DELETE ON submissions
BEGIN
  UPDATE teacher_versions SET version = version + 1 WHERE teacher_id = (SELECT teacher_id FROM tests WHERE id = OLD.test_id); END;

CREATE TRIGGER submission_files_version_insert AFTER INSERT ON submission_files
BEGIN
  UPDATE teacher_versions SET version = version + 1 WHERE teacher_id =
    (SELECT t.teacher_id FROM submissions s JOIN tests t ON t.id = s.test_id WHERE s.id = NEW.submission_id); END;

CREATE TRIGGER submission_files_version_delete AFTER DELETE ON submission_files
BEGIN
  UPDATE teacher_versions SET version = version + 1 WHERE teacher_id =
    (SELECT t.teacher_id FROM submissions s JOIN tests t ON t.id = s.test_id WHERE s.id = OLD.submission_id); END;

CREATE TRIGGER evaluations_version_insert AFTER INSERT ON evaluations
BEGIN
  UPDATE teacher_versions SET version = version + 1 WHERE teacher_id =
    (SELECT t.teacher_id FROM submissions s JOIN tests t ON t.id = s.test_id WHERE s.id = NEW.submission_id); END;

CREATE TRIGGER evaluations_version_update AFTER UPDATE ON evaluations
BEGIN
  UPDATE teacher_versions SET version = version + 1 WHERE teacher_id =
    (SELECT t.teacher_id FROM submissions s JOIN tests t ON t.id = s.test_id WHERE s.id = NEW.submission_id); END;

CREATE TRIGGER evaluations_version_delete AFTER DELETE ON evaluations
BEGIN
  UPDATE teacher_versions SET version = version + 1 WHERE teacher_id =
    (SELECT t.teacher_id FROM submissions s JOIN tests t ON t.id = s.test_id WHERE s.id = OLD.submission_id); END;

-- A grading's items are written with it (the grading's own row counts that),
-- so only a change of an item counts: a correction or a check.
CREATE TRIGGER evaluation_items_version_update AFTER UPDATE ON evaluation_items
BEGIN
  UPDATE teacher_versions SET version = version + 1 WHERE teacher_id =
    (SELECT t.teacher_id FROM evaluations ev JOIN submissions s ON s.id = ev.submission_id JOIN tests t ON t.id = s.test_id
     WHERE ev.id = NEW.evaluation_id); END;

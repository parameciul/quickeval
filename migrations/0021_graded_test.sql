-- The one test of a teacher that the robot has graded a paper of. A demo
-- account may have one test graded (a reset or a deleted paper does not give
-- the place back). Until now: the lowest test id that holds a graded paper.
-- One statement per ";" line end (the test helper splits on that), and no ";"
-- inside strings.

ALTER TABLE teachers ADD COLUMN graded_test_id INTEGER;

UPDATE teachers SET graded_test_id = (SELECT MIN(t.id) FROM tests t JOIN submissions s ON s.test_id = t.id WHERE t.teacher_id = teachers.id AND s.status = 'graded');

CREATE TRIGGER submissions_mark_graded_test AFTER UPDATE OF status ON submissions
WHEN NEW.status = 'graded' AND OLD.status <> 'graded'
BEGIN
  UPDATE teachers SET graded_test_id = NEW.test_id WHERE graded_test_id IS NULL AND id = (SELECT teacher_id FROM tests WHERE id = NEW.test_id); END;

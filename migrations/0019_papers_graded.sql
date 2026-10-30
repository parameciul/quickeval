-- How many papers the teacher's tests had graded by the robot: one for each
-- result, so a regrade counts as one more and a failed grading as none. Kept
-- for every teacher; a demo account may reach DEMO_PAPER_LIMIT. Until now: the
-- papers that hold a result. One statement per ";" line end (the test helper
-- splits on that), and no ";" inside strings.

ALTER TABLE teachers ADD COLUMN papers_graded INTEGER NOT NULL DEFAULT 0;

UPDATE teachers SET papers_graded = (SELECT COUNT(*) FROM submissions s JOIN tests t ON t.id = s.test_id WHERE t.teacher_id = teachers.id AND s.status = 'graded');

CREATE TRIGGER submissions_count_paper AFTER UPDATE OF status ON submissions
WHEN NEW.status = 'graded' AND OLD.status <> 'graded'
BEGIN
  UPDATE teachers SET papers_graded = papers_graded + 1 WHERE id = (SELECT teacher_id FROM tests WHERE id = NEW.test_id); END;

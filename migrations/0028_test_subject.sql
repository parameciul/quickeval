-- The subject of a test (spec: any subject). The robot finds it once, with
-- the exercise list or a generated barem, and saves it only while the test
-- has none; the teacher may set it. NULL: not found yet. 'alta': a subject
-- the robot does not grade, with its Romanian name in subject_name.
-- subject_by: who set it, 'robot' or 'teacher'. Every test made before this
-- migration is a math test that the teacher set, so the robot never looks for
-- its subject again. One statement per ";" line end, and no ";" inside strings.

ALTER TABLE tests ADD COLUMN subject TEXT CHECK (subject IS NULL OR subject IN ('matematica', 'fizica', 'chimie', 'biologie', 'stiinte', 'romana', 'engleza', 'alta'));

ALTER TABLE tests ADD COLUMN subject_name TEXT NOT NULL DEFAULT '';

ALTER TABLE tests ADD COLUMN subject_by TEXT CHECK (subject_by IS NULL OR subject_by IN ('robot', 'teacher'));

UPDATE tests SET subject = 'matematica', subject_by = 'teacher';

-- The first change of subject after the exercise list exists grades the test's
-- graded papers again for free (spec: "The demo account"): subject_regraded
-- marks the test that used it, free_regrade each paper of it until its new
-- result arrives. Such a paper does not count in papers_graded: the trigger of
-- migration 0019 is made again with that condition, and a second trigger
-- clears the mark once the paper is graded.
ALTER TABLE tests ADD COLUMN subject_regraded INTEGER NOT NULL DEFAULT 0;

ALTER TABLE submissions ADD COLUMN free_regrade INTEGER NOT NULL DEFAULT 0;

DROP TRIGGER submissions_count_paper;

CREATE TRIGGER submissions_count_paper AFTER UPDATE OF status ON submissions
WHEN NEW.status = 'graded' AND OLD.status <> 'graded' AND NEW.free_regrade = 0
BEGIN
  UPDATE teachers SET papers_graded = papers_graded + 1 WHERE id = (SELECT teacher_id FROM tests WHERE id = NEW.test_id); END;

CREATE TRIGGER submissions_free_regrade_done AFTER UPDATE OF status ON submissions
WHEN NEW.status = 'graded' AND NEW.free_regrade = 1
BEGIN
  UPDATE submissions SET free_regrade = 0 WHERE id = NEW.id; END;

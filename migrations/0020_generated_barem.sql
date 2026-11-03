-- A barem the robot generates from the test file (spec: generated barem).
-- barem_request: whether a generation was asked for, is running, or failed.
-- barem_unchecked: the generated barem waits for the teacher's check, and no
-- evaluation may start until then. One statement per ";" line end (the test
-- helper splits on that), and no ";" inside strings.

ALTER TABLE tests ADD COLUMN barem_request TEXT NOT NULL DEFAULT 'none' CHECK (barem_request IN ('none', 'requested', 'failed'));
ALTER TABLE tests ADD COLUMN barem_request_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN barem_unchecked INTEGER NOT NULL DEFAULT 0;

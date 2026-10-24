-- Archive of finished tests: an archived test leaves the class table and the
-- test list, and shows again when the teacher asks for archived tests.
-- One statement per ";" line end (the test helper splits on that),
-- and no ";" inside strings.

ALTER TABLE tests ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

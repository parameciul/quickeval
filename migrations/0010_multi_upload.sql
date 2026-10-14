-- A second upload link per test for many students on one phone (a student
-- without a device, or the teacher). Made only when the teacher asks for it.
-- One statement per ";" line end (the test helper splits on that),
-- and no ";" inside strings.

ALTER TABLE tests ADD COLUMN multi_upload_token TEXT;

CREATE UNIQUE INDEX tests_by_multi_upload_token ON tests (multi_upload_token);

-- Student result pages (teacher opens them per test, each upload has its own
-- secret link). One statement per ";" line end (the test helper splits on that),
-- and no ";" inside strings.

ALTER TABLE tests ADD COLUMN results_open INTEGER NOT NULL DEFAULT 0;

ALTER TABLE submissions ADD COLUMN result_token TEXT;

CREATE UNIQUE INDEX submissions_by_result_token ON submissions (result_token);

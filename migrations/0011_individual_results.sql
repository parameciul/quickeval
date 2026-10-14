-- Per-student result publishing: the teacher can publish one or more results
-- while the rest of the class stays unpublished. A result page opens when the
-- test keeps results open for all, or its own upload is published.
-- One statement per ";" line end (the test helper splits on that),
-- and no ";" inside strings.

ALTER TABLE submissions ADD COLUMN results_open INTEGER NOT NULL DEFAULT 0;

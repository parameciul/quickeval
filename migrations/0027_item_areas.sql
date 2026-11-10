-- Where the student's answer to an exercise is on the pages, as the robot saw
-- it: a JSON list of { page, x0, y0, x1, y1 } (shared/schemas.ts), so the
-- review frames the answer. '[]' when the robot gave none.

ALTER TABLE evaluation_items ADD COLUMN areas TEXT NOT NULL DEFAULT '[]';

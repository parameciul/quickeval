-- When the teacher checked the pages that the robot could not read. Until
-- then those pages count as one item to check. A new grading starts unchecked.

ALTER TABLE evaluations ADD COLUMN pages_reviewed_at TEXT;

-- The page of the student's work where an exercise's answer is (counted from 1,
-- 0 when the robot did not say), so the review opens that page.

ALTER TABLE evaluation_items ADD COLUMN page INTEGER NOT NULL DEFAULT 0;

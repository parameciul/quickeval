-- The items the teacher already checked, by grading. The test page counts them
-- for every graded paper (the progress of Verificare); D1 bills every row read,
-- and without it each count reads all items of a paper.
CREATE INDEX evaluation_items_checked ON evaluation_items (evaluation_id) WHERE needs_review = 1 AND reviewed_at IS NOT NULL;

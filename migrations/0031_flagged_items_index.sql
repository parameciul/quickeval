-- The items that wait for the teacher's check, by grading. The tests list,
-- the test page and the uploads table count them for every graded paper, and
-- D1 bills every row read: without it each count reads all items of a paper.
CREATE INDEX evaluation_items_to_check ON evaluation_items (evaluation_id) WHERE needs_review = 1 AND reviewed_at IS NULL;

-- The teacher closes the uploads of an open test without starting its grading
-- ("Închide încărcarea", for example at the end of the hour), and may open
-- them again. Null: the students may upload. Only an open test uses it; every
-- path into or out of `open` (start, stop, reopen) clears it. The student
-- writes check it in their SQL. The teacher_versions trigger on tests already
-- counts the change.
-- One statement per ";" line end (the test helper splits on that), and no ";"
-- inside strings.

ALTER TABLE tests ADD COLUMN uploads_closed_at TEXT;

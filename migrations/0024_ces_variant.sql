-- The CES variant (spec: docs/superpowers/specs/2026-11-09-ces-variant-design.md).
-- students.ces: the teacher marked the student as CES ("cerințe educaționale
-- speciale"); the mark goes with the student, not with one test.
-- tests.ces_*: the CES variant of a test, with its own copy of every column
-- that the test file, the barem, the exercise list and the print PDF use. A
-- test has a CES variant while ces_test_file_key is set.
-- submissions.variant: the barem a paper is graded with, written when the
-- paper first goes to grading (NULL until then); a regrade keeps it.
-- One statement per ";" line end (the test helper splits on that), and no ";"
-- inside strings.

ALTER TABLE students ADD COLUMN ces INTEGER NOT NULL DEFAULT 0;

ALTER TABLE tests ADD COLUMN ces_test_file_key TEXT;
ALTER TABLE tests ADD COLUMN ces_test_file_name TEXT;
ALTER TABLE tests ADD COLUMN ces_test_file_type TEXT;
ALTER TABLE tests ADD COLUMN ces_barem_file_key TEXT;
ALTER TABLE tests ADD COLUMN ces_barem_file_name TEXT;
ALTER TABLE tests ADD COLUMN ces_barem_file_type TEXT;
ALTER TABLE tests ADD COLUMN ces_barem_notes TEXT;
ALTER TABLE tests ADD COLUMN ces_barem_request TEXT NOT NULL DEFAULT 'none' CHECK (ces_barem_request IN ('none', 'requested', 'failed'));
ALTER TABLE tests ADD COLUMN ces_barem_request_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN ces_barem_unchecked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN ces_exercise_list_json TEXT;
ALTER TABLE tests ADD COLUMN ces_exercise_list_status TEXT NOT NULL DEFAULT 'none' CHECK (ces_exercise_list_status IN ('none', 'ready', 'problem', 'accepted', 'failed'));
ALTER TABLE tests ADD COLUMN ces_exercise_list_message TEXT;
ALTER TABLE tests ADD COLUMN ces_exercise_list_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN ces_print_status TEXT NOT NULL DEFAULT 'none' CHECK (ces_print_status IN ('none', 'ready', 'failed'));
ALTER TABLE tests ADD COLUMN ces_print_file_key TEXT;
ALTER TABLE tests ADD COLUMN ces_print_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN ces_files_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE submissions ADD COLUMN variant TEXT CHECK (variant IN ('class', 'ces'));

-- Papers that went to grading before this migration were graded as class
-- papers: they keep that variant.
UPDATE submissions SET variant = 'class' WHERE status IN ('grading', 'graded', 'failed');

-- The subject of a test (spec: any subject). The robot finds it once, with
-- the exercise list or a generated barem, and saves it only while the test
-- has none; the teacher may set it. NULL: not found yet. 'alta': a subject
-- the robot does not grade, with its Romanian name in subject_name.
-- subject_by: who set it, 'robot' or 'teacher'. Every test made before this
-- migration is a math test that the teacher set, so the robot never looks for
-- its subject again. One statement per ";" line end, and no ";" inside strings.

ALTER TABLE tests ADD COLUMN subject TEXT CHECK (subject IS NULL OR subject IN ('matematica', 'fizica', 'chimie', 'biologie', 'stiinte', 'romana', 'engleza', 'alta'));

ALTER TABLE tests ADD COLUMN subject_name TEXT NOT NULL DEFAULT '';

ALTER TABLE tests ADD COLUMN subject_by TEXT CHECK (subject_by IS NULL OR subject_by IN ('robot', 'teacher'));

UPDATE tests SET subject = 'matematica', subject_by = 'teacher';

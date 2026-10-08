-- A counter that goes up by 1 each time the teacher replaces the test file or
-- the barem. The robot reads it with the test and sends it back with the
-- exercise list: a list made from files that changed meanwhile is refused.

ALTER TABLE tests ADD COLUMN files_version INTEGER NOT NULL DEFAULT 0;

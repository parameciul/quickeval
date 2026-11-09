-- The CES switch (spec: docs/superpowers/specs/2026-11-09-ces-switch-and-missing-warnings-design.md).
-- tests.ces_off: the teacher said "no separate test for the CES students" for
-- this test. Stored as "off", so every test, also one whose class gets a CES
-- student later, asks for the CES files until the teacher says no.
ALTER TABLE tests ADD COLUMN ces_off INTEGER NOT NULL DEFAULT 0 CHECK (ces_off IN (0, 1));

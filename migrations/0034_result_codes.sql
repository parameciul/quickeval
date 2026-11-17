-- A short code for each result link: six characters a student can read from a
-- picture or write in a notebook, typed on the test's own page to open the
-- result (the link itself is too long to type). Unique inside one test: the
-- code is always used together with the test's link. The database makes it,
-- in a trigger, whenever a paper gets its result link, so every path that
-- makes a link makes a code (a clash fails the statement on the unique index,
-- and the caller tries again as it does for the link). The alphabet has no
-- 0, O, 1, I or L. A Quick Try's paper gets none: its page is its own link.
-- One statement per ";" line end (the test helper splits on that), and no ";"
-- inside strings.

ALTER TABLE submissions ADD COLUMN result_code TEXT;

UPDATE submissions SET result_code =
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1)
WHERE result_token IS NOT NULL AND test_id NOT IN (SELECT id FROM tests WHERE quick_try = 1);

-- Two papers of one test that drew the same code draw again, before the index.
UPDATE submissions SET result_code =
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1)
WHERE result_code IS NOT NULL
  AND EXISTS (SELECT 1 FROM submissions o WHERE o.test_id = submissions.test_id AND o.result_code = submissions.result_code AND o.id <> submissions.id);

CREATE UNIQUE INDEX submissions_result_code ON submissions (test_id, result_code) WHERE result_code IS NOT NULL;

CREATE TRIGGER submissions_result_code_insert AFTER INSERT ON submissions
WHEN NEW.result_token IS NOT NULL AND NEW.result_code IS NULL
  AND NOT EXISTS (SELECT 1 FROM tests WHERE id = NEW.test_id AND quick_try = 1)
BEGIN
  UPDATE submissions SET result_code =
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1)
  WHERE id = NEW.id; END;

CREATE TRIGGER submissions_result_code_update AFTER UPDATE OF result_token ON submissions
WHEN NEW.result_token IS NOT NULL AND NEW.result_code IS NULL
  AND NOT EXISTS (SELECT 1 FROM tests WHERE id = NEW.test_id AND quick_try = 1)
BEGIN
  UPDATE submissions SET result_code =
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1)
  WHERE id = NEW.id; END;

-- Wrong codes typed on a test's page, counted per test in a window of time.
-- No teacher page shows this table, so it raises no teacher version.
CREATE TABLE result_code_tries (
  test_id INTEGER PRIMARY KEY REFERENCES tests(id) ON DELETE CASCADE,
  tries INTEGER NOT NULL,
  since TEXT NOT NULL
);

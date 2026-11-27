-- The phone links of a teacher's test (`/phone/<token>`): a phone that is not
-- logged in sends the test and the barem (the class ones and the CES ones)
-- through it, for PHONE_LINK_HOURS. Only the token's hash is stored. A link
-- names one test; its teacher is the test's. Expired links are deleted when
-- the test gets a new one.
-- One statement per ";" line end (the test helper splits on that), and no ";"
-- inside strings.

CREATE TABLE test_phone_links (
  token_hash TEXT PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX test_phone_links_test ON test_phone_links (test_id);

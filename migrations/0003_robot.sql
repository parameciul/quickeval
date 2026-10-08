-- Grading results, the system settings, and the robot's lease (spec §7.1).
-- Times are ISO 8601 UTC strings. One statement per ";" line end (the test
-- helper splits on that), and no ";" inside strings.

CREATE TABLE evaluations (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  max_total REAL NOT NULL,
  office_points REAL NOT NULL,
  total REAL NOT NULL,
  grade REAL NOT NULL,
  needs_review INTEGER NOT NULL,
  summary TEXT NOT NULL,
  strengths_json TEXT NOT NULL,
  recommendations_json TEXT NOT NULL,
  unreadable_json TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE evaluation_items (
  id INTEGER PRIMARY KEY,
  evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  label TEXT NOT NULL,
  max_points REAL NOT NULL,
  ai_points REAL NOT NULL,
  points REAL NOT NULL,
  student_answer TEXT NOT NULL,
  comment TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  needs_review INTEGER NOT NULL,
  review_reason TEXT NOT NULL,
  reviewed_at TEXT,
  changed_by_teacher INTEGER NOT NULL DEFAULT 0,
  UNIQUE (evaluation_id, exercise_id)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE runner_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  run_id TEXT,
  lease_acquired_at TEXT,
  heartbeat_at TEXT,
  last_check_at TEXT,
  last_run_finished_at TEXT,
  last_run_summary TEXT
);

INSERT INTO runner_state (id) VALUES (1);

CREATE INDEX tests_by_status ON tests (status, evaluation_at);

CREATE INDEX submissions_by_status ON submissions (status, submitted_at);

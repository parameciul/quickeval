-- Tests, the students' uploads, and the uploaded files (spec §7.1). The
-- exercise-list and analysis columns of tests are used from Plan 3 on. Times
-- are ISO 8601 UTC strings. One statement per ";" line end (the test helper
-- splits on that), and no ";" inside strings.

CREATE TABLE tests (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  class_id INTEGER NOT NULL REFERENCES classes(id),
  number INTEGER NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'evaluating', 'done')),
  upload_token TEXT UNIQUE,
  started_at TEXT,
  evaluation_at TEXT,
  evaluation_started_at TEXT,
  test_file_key TEXT,
  test_file_name TEXT,
  test_file_type TEXT,
  barem_file_key TEXT,
  barem_file_name TEXT,
  barem_file_type TEXT,
  exercise_list_json TEXT,
  exercise_list_status TEXT NOT NULL DEFAULT 'none' CHECK (exercise_list_status IN ('none', 'ready', 'problem', 'accepted', 'failed')),
  exercise_list_message TEXT,
  exercise_list_attempts INTEGER NOT NULL DEFAULT 0,
  analysis_json TEXT,
  analysis_status TEXT NOT NULL DEFAULT 'none' CHECK (analysis_status IN ('none', 'requested', 'ready', 'failed')),
  analysis_stale INTEGER NOT NULL DEFAULT 0,
  analysis_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (teacher_id, code),
  UNIQUE (class_id, number)
);

CREATE TABLE submissions (
  id INTEGER PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id),
  status TEXT NOT NULL CHECK (status IN ('uploading', 'submitted', 'grading', 'graded', 'failed')),
  session_hash TEXT UNIQUE,
  auto_submitted INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  run_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  graded_at TEXT,
  UNIQUE (test_id, student_id)
);

CREATE INDEX submissions_by_student ON submissions (student_id);

CREATE TABLE submission_files (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX submission_files_by_submission ON submission_files (submission_id, position);

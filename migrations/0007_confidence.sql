-- The robot's confidence in 5 steps instead of 3 (spec §14.1): very_low and
-- very_high join high, medium, and low. Old rows keep working: their values
-- are still valid. One statement per ";" line end, and no ";" inside strings.

CREATE TABLE evaluation_items_new (
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
  confidence TEXT NOT NULL CHECK (confidence IN ('very_low', 'low', 'medium', 'high', 'very_high')),
  needs_review INTEGER NOT NULL,
  review_reason TEXT NOT NULL,
  reviewed_at TEXT,
  changed_by_teacher INTEGER NOT NULL DEFAULT 0,
  UNIQUE (evaluation_id, exercise_id)
);

INSERT INTO evaluation_items_new (id, evaluation_id, exercise_id, position, label, max_points, ai_points, points, student_answer, comment, confidence, needs_review, review_reason, reviewed_at, changed_by_teacher)
  SELECT id, evaluation_id, exercise_id, position, label, max_points, ai_points, points, student_answer, comment, confidence, needs_review, review_reason, reviewed_at, changed_by_teacher FROM evaluation_items;

DROP TABLE evaluation_items;

ALTER TABLE evaluation_items_new RENAME TO evaluation_items;

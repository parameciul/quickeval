-- The robot's work per Bucharest day, for the statistics on Setări: one row
-- per teacher per day, and one row per day for all the Quick Try work
-- (quick_try = 1, teacher_id 0: the guest teachers are deleted after their
-- days, and their work must stay counted). teacher_id has no foreign key, so a
-- refused or deleted account keeps its days. A job counts in its own column
-- only when it worked, a failed one in failed, and tokens adds the tokens
-- Claude reported. tries counts the Quick Tries made that day. One statement
-- per ";" line end (the test helper splits on that), and no ";" inside strings.

CREATE TABLE usage_days (
  day TEXT NOT NULL,
  quick_try INTEGER NOT NULL CHECK (quick_try IN (0, 1)),
  teacher_id INTEGER NOT NULL,
  papers INTEGER NOT NULL DEFAULT 0,
  barems INTEGER NOT NULL DEFAULT 0,
  exercise_lists INTEGER NOT NULL DEFAULT 0,
  analyses INTEGER NOT NULL DEFAULT 0,
  prints INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  tries INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, quick_try, teacher_id)
);

-- The days before this migration, from the robot's log (it starts with
-- migration 0030) and the tries that still exist. Every logged row is from
-- after 25 October 2026, when Bucharest is UTC+2, so two hours give its day.
INSERT INTO usage_days (day, quick_try, teacher_id, papers, barems, exercise_lists, analyses, prints, failed, tokens)
  SELECT date(w.at, '+2 hours'), t.quick_try, CASE WHEN t.quick_try = 1 THEN 0 ELSE w.teacher_id END,
    SUM(w.ok = 1 AND w.kind = 'grading'), SUM(w.ok = 1 AND w.kind = 'barem'), SUM(w.ok = 1 AND w.kind = 'exercise_list'),
    SUM(w.ok = 1 AND w.kind = 'analysis'), SUM(w.ok = 1 AND w.kind = 'print'), SUM(w.ok = 0), COALESCE(SUM(w.tokens), 0)
  FROM robot_work w JOIN teachers t ON t.id = w.teacher_id
  GROUP BY 1, 2, 3;

INSERT INTO usage_days (day, quick_try, teacher_id, tries)
  SELECT day, 1, 0, COUNT(*) FROM quick_tries WHERE 1 GROUP BY day
  ON CONFLICT (day, quick_try, teacher_id) DO UPDATE SET tries = excluded.tries;

-- Teachers, classes, students, and which student is in which class.
-- Times are ISO 8601 UTC strings. One statement per ";" line end (the test
-- helper splits on that), and no ";" inside strings.

CREATE TABLE teachers (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE classes (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  name TEXT NOT NULL,
  school_year INTEGER NOT NULL,
  next_test_number INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (teacher_id, school_year, name)
);

CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  full_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX students_by_teacher ON students (teacher_id);

CREATE TABLE enrollments (
  class_id INTEGER NOT NULL REFERENCES classes(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (class_id, student_id)
);

CREATE INDEX enrollments_by_student ON enrollments (student_id);

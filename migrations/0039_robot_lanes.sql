-- Two robots (lanes), each with its own lease row: row 1 is the teachers'
-- robot, row 2 the Quick Try robot. A test's lane is tests.quick_try. SQLite
-- cannot change a CHECK, so the table is built again with the same columns.
-- restart_at is the lane's last automatic start, asked by an open page (the
-- teacher app's version read, or a try page's status read). backup_jobs counts
-- the jobs that the backup Claude account did (only Quick Try work).
-- One statement per ";" line end (the test helper splits on that), and no ";"
-- inside strings.

CREATE TABLE runner_state_new (
  id INTEGER PRIMARY KEY CHECK (id IN (1, 2)),
  run_id TEXT,
  lease_acquired_at TEXT,
  heartbeat_at TEXT,
  last_check_at TEXT,
  last_run_finished_at TEXT,
  last_run_summary TEXT,
  start_failed_at TEXT,
  restart_at TEXT
);

INSERT INTO runner_state_new (id, run_id, lease_acquired_at, heartbeat_at, last_check_at, last_run_finished_at, last_run_summary, start_failed_at)
  SELECT id, run_id, lease_acquired_at, heartbeat_at, last_check_at, last_run_finished_at, last_run_summary, start_failed_at FROM runner_state;

DROP TABLE runner_state;

ALTER TABLE runner_state_new RENAME TO runner_state;

INSERT INTO runner_state (id) VALUES (2);

ALTER TABLE usage_days ADD COLUMN backup_jobs INTEGER NOT NULL DEFAULT 0;

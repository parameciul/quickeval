-- When GitHub last did not take a request to start the robot. A start that
-- works clears it. The test page tells the teacher that the robot did not
-- start until a run checks in after this time.

ALTER TABLE runner_state ADD COLUMN start_failed_at TEXT;

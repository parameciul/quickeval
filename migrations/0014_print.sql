-- The printable test: a PDF of the test file with a QR code to the student
-- upload page, made by the robot. "none": not made yet, "ready": the file at
-- print_file_key is current, "failed": the robot gave up. print_attempts counts
-- the failed tries for the current files_version.

ALTER TABLE tests ADD COLUMN print_status TEXT NOT NULL DEFAULT 'none' CHECK (print_status IN ('none', 'ready', 'failed'));
ALTER TABLE tests ADD COLUMN print_file_key TEXT;
ALTER TABLE tests ADD COLUMN print_attempts INTEGER NOT NULL DEFAULT 0;

-- The model and effort the robot used, shown to the teacher on the test page.
ALTER TABLE evaluations ADD COLUMN effort TEXT;
ALTER TABLE tests ADD COLUMN analysis_model TEXT;
ALTER TABLE tests ADD COLUMN analysis_effort TEXT;

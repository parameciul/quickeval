-- Extra teacher comments for the barem (spec: teacher notes that the robot
-- reads as part of the barem). One statement per ";" line end, no ";" inside strings.

ALTER TABLE tests ADD COLUMN barem_notes TEXT NOT NULL DEFAULT '';

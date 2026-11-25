-- Whether the test page shows the section "Indicații suplimentare pentru
-- corectare" (the teacher's notes for the barem) to this account. An
-- administrator sets it per account on Setări. Null: the account's role
-- decides (shown to administrators, hidden from teachers), so a new account
-- and the accounts made before need no value. Hiding the section does not
-- drop notes already saved: the robot still reads them.
-- One statement per ";" line end (the test helper splits on that), and no ";"
-- inside strings.

ALTER TABLE teachers ADD COLUMN show_barem_notes INTEGER CHECK (show_barem_notes IN (0, 1));

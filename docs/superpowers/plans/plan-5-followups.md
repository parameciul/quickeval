# Plan 5 follow-ups

Plan 5 built the class grade table, the "Elevii clasei" page (add, rename, "A plecat", delete), the case-insensitive duplicate-name check, the test archive (migration 0013), the report column order (Elev, Nota, Total, …), the "Raportul clasei" button in the test page head, and the Teste page filter, colours and publishing. Older open points are in `plan-4b-followups.md` and the earlier follow-up files.

## Go-live

- Run `npx wrangler d1 migrations list quickeval --remote` and check that only 0013 is pending. Then `npx wrangler d1 migrations apply quickeval --remote`. Only then merge: `SELECT_TEST` reads `tests.archived`, so the new code fails on a database without 0013. The column has a default, so the code that is live now keeps working after the migration.
- After the merge: delete the duplicate "a plecat" students of 8E2 from "Elevii clasei". A duplicate that has sent or graded work cannot be deleted (409); leave it as "a plecat". While such a twin stays, a rename of the active student that only changes letter case is refused.
- Optional: look for stored names with combining marks (U+0326, U+0327, U+0306, U+0302, U+0303). Names stored that way before Plan 5 get a different name key, so a duplicate of them is not found.

## Still open

- An upload can start for a student who was just removed from the class: `routes/upload.ts` checks `findActiveStudent`, then `createSubmission` inserts. The upload then shows nowhere, but the robot grades it once sent. The same window exists for "A plecat". Fix: check the enrollment inside the `createSubmission` INSERT … SELECT.
- On a phone (375 px), the test page is 438 px wide while the test or barem file is missing: the file inputs in `TestFiles` are wider than the screen. Older than Plan 5.
- A student's `failed` uploads in the class are deleted with the student. The confirm text does not say so.
- Capital letters outside the Romanian fold table (É, Ö, …) are not folded, so "Éva" and "éva" count as two names.
- When every test of a class is archived and the toggle is off, the grade table shows only the Elev column, with no hint.
- The archived column header fades its link and chip together (`opacity: 0.7`); a muted text colour would keep the contrast.
- On the Teste page, every card's publish button has the same accessible name; an old `?clasa=` stays in the address after a change of school year (it counts as all classes).
- On "Elevii clasei": a name already in the class pasted twice is listed twice in "Sunt deja în clasă"; the row buttons have no per-student accessible name.
- Tests not written: R2 deletion on a student delete, the `['test', code]` invalidation after a publish from the list, the body order of the report table.

## Rulings made during the build

- The archive API tests are in `server/routes/archive.test.ts`.
- `GradesTable` takes a `classId` prop for the empty-state link.
- Every way out of `done` clears the archive: Start, Reopen, Recorectează tot, regrade of one upload, Retry of one upload, Regenerează (the plan named only four).
- The duplicate rename message reads "… în clasa 6E2." (lowercase "clasa", the stored class name).
- The grades endpoint has no separate other-teacher test; the existing `GET /classes/:id` other-teacher test covers it.

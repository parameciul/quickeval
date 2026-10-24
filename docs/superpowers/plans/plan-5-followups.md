# Plan 5 follow-ups

Plan 5 built the class grade table, the "Elevii clasei" page (add, rename, "A plecat", delete), the case-insensitive duplicate-name check, the test archive (migration 0013), the report column order (Elev, Nota, Total, …), the "Raportul clasei" button in the test page head, and the Teste page filter, colours and publishing. Older open points are in `plan-4b-followups.md` and the earlier follow-up files.

## Go-live

- Run `npx wrangler d1 migrations list quickeval --remote` and check that only 0013 is pending. Then `npx wrangler d1 migrations apply quickeval --remote`. Only then merge: `SELECT_TEST` reads `tests.archived`, so the new code fails on a database without 0013. The column has a default, so the code that is live now keeps working after the migration.
- After the merge: delete the duplicate "a plecat" students of 8E2 from "Elevii clasei". A duplicate that has sent or graded work cannot be deleted (409); leave it as "a plecat". While such a twin stays, a rename of the active student that only changes letter case is refused.
- Optional: look for stored names with combining marks (U+0326, U+0327, U+0306, U+0302, U+0303). Names stored that way before Plan 5 get a different name key, so a duplicate of them is not found.

## Still open

Nothing from Plan 5.

## Done after the build

- The class page's archived toggle sits with the other actions at the top; when every test is archived, the table says so.
- Cards: a label is a flat tinted block (`.tag`, `.status`, `.class-badge`); "Publică rezultatele" and "Raportul clasei" are both outlined buttons in `.card-actions`. The publish button's accessible name ends with the test code.
- Class colours: one hue for each class id (golden angle), with three lightness levels.
- `createSubmission` checks the active enrollment inside its INSERT.
- Phone width of the test page: the file inputs no longer widen the grid.
- The student delete confirm says that unfinished and failed uploads go too.
- Capitals outside the Romanian letters (É, Ö, Ł, ...) fold in the name key.
- The archived grade column header uses the muted text colour, not `opacity`.
- The three missing tests are written (R2 deletion on a student delete, the `['test', code]` invalidation after a publish, the report row cells). An unknown `?clasa=` leaves the address.
- "Elevii clasei": a name already in the class is listed once; the row buttons name the student.

## Rulings made during the build

- The archive API tests are in `server/routes/archive.test.ts`.
- `GradesTable` takes a `classId` prop for the empty-state link.
- Every way out of `done` clears the archive: Start, Reopen, Recorectează tot, regrade of one upload, Retry of one upload, Regenerează (the plan named only four).
- The duplicate rename message reads "… în clasa 6E2." (lowercase "clasa", the stored class name).
- The grades endpoint has no separate other-teacher test; the existing `GET /classes/:id` other-teacher test covers it.

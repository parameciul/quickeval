# Plan 4a follow-ups

Plan 4a built the review of the grades: the result page (corrections, Verificat, the check of unreadable pages, Recorectează), Recorectează tot, the student history page, and the items to check on Teste. Plan 4 is cut in two (spec §19). Older open points are in `plan-3b-followups.md`. Plan 4b is built.

## Done in Plan 4b

The class analysis (the robot's third task, the `class-report` mode, its API, and Regenerează), the class report with `shared/stats.ts`, the PDFs, the CSV, Trimite, the operations notes in `docs/deploy.md`, and the Resetează fix (Reset, Retry, publishing a result page, and the result link name the upload by `startedAt`). What Plan 4b leaves open is in `plan-4b-followups.md`.

## Still open

- The API can take a check back (`reviewed: false`, `pagesReviewed: false`); the page has no button for it.
- "Recorectează" on a row of the uploads table says nothing when the test is open; the row shows "Trimis". The result page and "Recorectează tot" say that the grading waits for Start evaluation.
- On a phone, the test page is a little wider than the screen: the file field of the test files list does not shrink (from Plan 2).
- The item form on the result page: the focus does not move to the form or to its error, the error is not tied to the field, and a save says nothing to a screen reader.
- The teacher app loads zod: `GradedResult.tsx` imports `TEXT_LIMITS` from `shared/schemas.ts`.
- A correction is two writes: the item, then the total and the grade. If the second fails, the total and the grade wait for the next change of points or comment.

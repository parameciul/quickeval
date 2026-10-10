# Plan 4a follow-ups

Plan 4a built the review of the grades: the result page (corrections, Verificat, the check of unreadable pages, Recorectează), Recorectează tot, the student history page, and the items to check on Teste. Plan 4 is cut in two (spec §19). Older open points are in `plan-3b-followups.md`. Write Plan 4b from the repo and the spec.

## For Plan 4b

- The class analysis: the `ClassAnalysis` contract, the robot's third task (`runner/tasks.ts`), the `class-report` mode of the skill, `GET /api/runner/tests/:id/results`, `POST /api/runner/tests/:id/analysis`, Regenerează, and when the first analysis is asked for. Today only a `ready` or `failed` analysis is asked for again, and nothing makes one: `analysis_status` stays `none`.
- The GitHub schedule does not fire (`docs/deploy.md`): every new path that makes work for the robot must start it, and "Pornește robotul" (`testHasRobotWork`) must count a waiting analysis. The test page must show the analysis state, or a test waits in "Se corectează" with every upload graded and no reason shown.
- The class report (spec §14.2) with `shared/stats.ts`, and its link from the test page.
- PDFs (student and class), CSV, Share. The student PDF never names the robot or AI, and never shows review reasons. CSV cells that start with `=`, `+`, `-`, or `@` are escaped: the texts come from Claude.
- The operations notes in `docs/deploy.md`.

## Still open

- The API can take a check back (`reviewed: false`, `pagesReviewed: false`); the page has no button for it.
- "Recorectează" on a row of the uploads table says nothing when the test is open; the row shows "Trimis". The result page and "Recorectează tot" say that the grading waits for Start evaluation.
- On a phone, the test page is a little wider than the screen: the file field of the test files list does not shrink (from Plan 2).
- An old page's "Resetează" acts by the upload id alone. Ids of deleted rows come back (no `AUTOINCREMENT`): after a reset of the newest upload, the next upload (of any student) can get its id, and a Resetează from a page opened before deletes that upload and its files. Fix it first in Plan 4b: the page names what it showed, as Recorectează names `gradedAt`, or the tables get `AUTOINCREMENT` (a table rebuild). "Reîncearcă" acts by the id too; it only sends a failed upload to the robot again.
- The item form on the result page: the focus does not move to the form or to its error, the error is not tied to the field, and a save says nothing to a screen reader.
- The teacher app loads zod: `GradedResult.tsx` imports `TEXT_LIMITS` from `shared/schemas.ts`.
- A correction is two writes: the item, then the total and the grade. If the second fails, the total and the grade wait for the next change of points or comment.

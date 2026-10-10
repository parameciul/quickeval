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
- A result page stays as it was loaded (the teacher app does not refetch on window focus). After a regrade of the same upload, its new items can get the same ids again, so a correction from a page opened before lands on the new grading of that upload. It is the same student, and the answer shows the new result at once. A correction can never reach another upload.

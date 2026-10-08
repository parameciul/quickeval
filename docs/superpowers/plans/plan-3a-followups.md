# Plan 3a follow-ups

Plan 3a built the closing of tests (now or at a set time), the robot API, and Setări. The robot itself comes with Plan 3b. Write Plan 3b from the repo and the spec (the spec has Plan 3a's changes).

## For Plan 3b

- Tests that the teacher closed during Plan 3a sit in `evaluating` with `submitted` uploads. The robot grades them all as soon as it runs. Before the robot's secrets are set, list the `evaluating` tests and ask the user which ones to grade; reopen or delete the others.
- The robot checks every output with `checkExerciseList` and `checkGrading` (`shared/schemas.ts`) before it sends it, and gives Claude `z.toJSONSchema()` of `exerciseListSchema` and `gradingResultSchema`. The API answers 422 `invalid_result` to an output those checks refuse: the robot then sends `{ ok: false, error: 'invalid_output' }` for the same work, so the attempt counts. Otherwise an output that is always broken is tried again by every run and never fails.
- Error codes the robot handles: 409 `lease_lost` (stop taking work), 409 `taken_over` and 404 (drop the result), 409 `not_needed` (drop the exercise list), 401 `robot_denied` (stop the run).
- A page goes to the robot as `file-<id>`; the robot names its work files by upload order.
- `GET /api/runner/tests/:id` also returns a stored exercise list that is `problem`, or one the teacher asked to make again. The robot decides what to make from `GET /tasks`, never from a non-null `exerciseList`.
- `/check` puts back the uploads of a run that died without counting an attempt. The robot's per-task timeout must end well before the job's timeout, so that one upload that hangs cannot stop every run.
- Set the Pages settings `GITHUB_REPO` and `GITHUB_DISPATCH_TOKEN`, and the GitHub secrets `QUICKEVAL_RUNNER_KEY` (Setări) and `CLAUDE_CODE_OAUTH_TOKEN`.
- Then check "Evaluate now" on the live site: GitHub must answer 204 to the dispatch. Until then the dispatch code ran only in tests, never with the real `fetch` and `AbortSignal.timeout` in workerd.

## For Plan 4

- The class analysis: the `ClassAnalysis` contract, `GET /api/runner/tests/:id/results`, `POST /api/runner/tests/:id/analysis`, Regenerează, and when the first analysis is asked for (today only a ready or failed analysis is asked for again).
- The result page: the items, corrections, Verificat, and Regrade (one upload, or all of a test).
- The flag count on the Teste list (spec §9: "uploaded/class size, graded, flags"). Plan 3a shows the graded count there; the flags show per upload in the uploads table.

## Still open

- An exercise list made from a barem that the teacher replaced while the robot worked is still saved, when the replace set the list back to `none` in between. Fix: send the barem's key hash with the list, and save only if it matches.
- Every `/api/u` request runs the promotion writes, also one with an unknown token. They change nothing when nothing is due.
- A student who is still uploading when a scheduled evaluation starts gets "Încărcarea s-a închis." with a retry button that cannot work; after a reload the phone says "Dacă nu ai trimis lucrarea, spune-i profesorului", although the pages with files were sent without a confirm. Fix in the student app: say that the pages were sent.
- The robot line counts minutes from the browser's clock.
- `runner_state.last_run_summary` keeps only the last run.

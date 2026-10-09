# Plan 3b follow-ups

Plan 3b built the grading robot: `runner/`, the grading skill, `npm run try:skill`, and `evaluate.yml`. Older open points are in `plan-3a-followups.md`. Write Plan 4 from the repo and the spec.

## For Plan 4

- The class analysis in the robot: a third task in `runner/tasks.ts`, a `class-report` mode in the skill, and `claudeJsonSchema()` of the `ClassAnalysis` contract. Today `runner/run.ts` ignores `tasks.analyses`: a round that starts nothing else ends the run.
- The summary of a run counts `analyses: 0` until then.

## Still open

- The usage-limit output was never seen: the spike could not reach the plan's limit. `isUsageLimit` (`runner/claude.ts`) follows Claude Code's documented messages and HTTP 429. When a real one shows in a run, replace `runner/fixtures/claude-usage-limit.json` with it and check its test.
- Claude's `--restricted` mode was never tried on Linux: only Windows ran it. The first real run shows whether Claude starts with it.
- The signals at the time limit go to Claude's process group on Linux. Only a fake process tested them (Windows has no signals).
- Every grading downloads the test and the barem again. Keep them per test and `filesVersion` in the run if large files make runs slow.
- One run can try a failing upload up to 3 times, after the other uploads: three time limits use an hour of the run. A fix: `failGrading` keeps the run's id on the upload. The claim already skips uploads with the run's id, so the next run tries it again.
- An upload whose run died waits in grading until the lease is stale (15 minutes) and the next check sends it back.
- Every run with work installs the robot again (`npm ci --omit=dev`, Claude Code, pandoc): about a minute.

## From the Plan 3b reviews

Small points that the reviews found and left for later. None stops the robot from working.

- pandoc gets the robot's whole environment, robot key included. Give it only what it needs, like Claude (`claudeEnv`). A Word file that links pictures (`file://…`) may copy them into the work folder.
- A page missing from R2 (404) is left out of the grading on every run, and no attempt is counted.
- If the API refuses the `usage_limit` error itself (422, 413), the run counts an invalid output and keeps taking work.
- During a usage limit, every 10-minute check that finds work installs the robot and asks Claude again, until the limit ends.
- Machine faults other than a missing program (a full disk, a missing skill folder) use up attempts. The Node error code (`ENOSPC`, `EACCES`) is safe to log; today a missing program logs `error=unknown`.
- The robot API tries a POST again when its answer was lost (claim, result, exercise list, release). A claim tried again takes a second upload; the next check sends it back.
- `/lease`, `/heartbeat`, `/release`, and `/claim` accept bodies of any size. Only the robot key can call them.
- `runner/run.test.ts` is sensitive to load: a local engine per test, 20-second time limits. It timed out when two test suites ran at the same time. Watch it on CI.
- Windows: `spawn('claude')` finds `claude.exe`, but not an npm `claude.cmd`.
- `try:skill` prints no comments and no summary, writes over `exercises.json` without a question, and leaves its temp folder after Ctrl+C.
- The skill does not give the code's length limits (label 120, answer 500, comment 1000, id 20, 60 exercises), or the points for an answer it cannot read.
- `runner/workflow.test.ts` reads the raw text of `evaluate.yml`: a line in a comment also passes.
- "The robot needs only zod" means what loads: `npm ci --omit=dev` installs every production package.
- Small code notes: the header comment of `shared/schemas.ts` still names `z.toJSONSchema` (the code uses `claudeJsonSchema`); `runner/check.ts` imports `./api.ts` twice; a `maxPoints` near 1e307 rounds to Infinity.
- Tests not written yet: the 5 MB output cap, the kill of a grandchild process, a failing pandoc, a Word barem, a 404 while a page downloads, the upload size cap, a request that hangs, `stop: 'error'` saved in the run summary, a `checkGrading` failure in `try:skill`.

# Plan 3b follow-ups

Plan 3b built the grading robot: `runner/`, the grading skill, `npm run try:skill`, and `evaluate.yml`. Older open points are in `plan-3a-followups.md`. Write Plan 4 from the repo and the spec.

## For Plan 4

- The class analysis in the robot: a third task in `runner/tasks.ts`, a `class-report` mode in the skill, and `claudeJsonSchema()` of the `ClassAnalysis` contract. Today `runner/run.ts` ignores `tasks.analyses`: a round that starts nothing else ends the run.
- The summary of a run counts `analyses: 0` until then.

## Still open

- The usage-limit output was never seen: the spike could not reach the plan's limit. `isUsageLimit` (`runner/claude.ts`) follows Claude Code's documented messages and HTTP 429. When a real one shows in a run, replace `runner/fixtures/claude-usage-limit.json` with it and check its test.
- The signals at the time limit go to Claude's process group on Linux. Only a fake process tested them (Windows has no signals).
- Every grading downloads the test and the barem again. Keep them per test and `filesVersion` in the run if large files make runs slow.
- One run can try a failing upload up to 3 times, after the other uploads: three time limits use an hour of the run. When it is the only work, its 3 failures are 3 in a row: the run stops with `error` and GitHub sends an email. A fix: `failGrading` keeps the run's id on the upload. The claim already skips uploads with the run's id, so the next run tries it again.
- An upload whose run died waits in grading until the lease is stale (15 minutes) and the next check sends it back.
- Every run with work installs the robot again (`npm ci --omit=dev`, Claude Code, pandoc): about a minute.

## From the go-live (2026-10-09)

- The first real run graded one upload of a real test on Linux: the exercise list took 115 seconds and the grading 114 (`opus`, `high`). Claude started with `--restricted`. The log held only ids, counts, and durations.
- GitHub's 10-minute schedule never started a run: no `schedule` run came after the merge, after a disable and an enable of the workflow, or after the push of 834df6e (13:38 UTC), whose author was the account's noreply address. Manual and `repository_dispatch` runs work. For now there is no timer: only a request to GitHub starts the robot. "Pornește evaluarea acum", "Reîncearcă" (one upload), "Încearcă din nou", "Folosește oricum" (the exercise list), a new barem during evaluation, and the first request after a scheduled evaluation's time send one (`docs/deploy.md`). When GitHub does not take it, the test waits in "Se corectează" for the next run: another request, or `gh workflow run evaluate.yml`. The test page then tells Laura that the robot did not start, also after a scheduled start or "Programează" with a time already past: the API keeps the failure (`runner_state.start_failed_at`, migration 0005) until a run checks in, or a later request starts the robot. While a run works, the page does not show it. The work left by a run stopped after 2 hours (`budget`) also waits for the next run; Setări says so. To get the timer back, ask GitHub Support (the repo, `.github/workflows/evaluate.yml`, both cron lines) or start the robot from another timer.
- Without the timer, a scheduled evaluation ("Programează") starts the robot at the first teacher or student request after its time. The uploads close on time, but the grading waits until someone opens the site.
- Still written for the timer: Setări's text after a usage limit ("continuă mai târziu"; the run that continues starts by hand), and the comments in `RobotLine.tsx` and `SettingsPage.tsx` that say the robot checks every 10 minutes.
- npm 11 warns that Claude Code's install script did not run (`npm warn install-scripts`). Claude started anyway. If a newer pinned version needs it, install it with `--allow-scripts=@anthropic-ai/claude-code`.

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
- `claudeRunner` calls every `ENOENT` at the start a missing program. Node also says `ENOENT` when the work folder is missing; the pandoc check also looks at `syscall`. `try:skill` prints "program missing" for every rejection of the runner.
- `try:skill` prints no comments and no summary, writes over `exercises.json` without a question, and leaves its temp folder after Ctrl+C.
- The skill does not give the code's length limits (label 120, answer 500, comment 1000, id 20, 60 exercises), or the points for an answer it cannot read.
- `runner/workflow.test.ts` reads the raw text of `evaluate.yml`: a line in a comment also passes.
- "The robot needs only zod" means what loads: `npm ci --omit=dev` installs every production package.
- Small code notes: the header comment of `shared/schemas.ts` still names `z.toJSONSchema` (the code uses `claudeJsonSchema`); `runner/check.ts` imports `./api.ts` twice; a `maxPoints` near 1e307 rounds to Infinity.
- Tests not written yet: the 5 MB output cap, the kill of a grandchild process, a failing pandoc, a Word barem, a 404 while a page downloads, the upload size cap, a request that hangs, `stop: 'error'` saved in the run summary, a `checkGrading` failure in `try:skill`.

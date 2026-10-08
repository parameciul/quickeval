# Plan 3b follow-ups

Plan 3b built the grading robot: `runner/`, the grading skill, `npm run try:skill`, and `evaluate.yml`. Older open points are in `plan-3a-followups.md`. Write Plan 4 from the repo and the spec.

## For Plan 4

- The class analysis in the robot: a third task in `runner/tasks.ts`, a `class-report` mode in the skill, and `claudeJsonSchema()` of the `ClassAnalysis` contract. Today `runner/run.ts` ignores `tasks.analyses`: a round that starts nothing else ends the run.
- The summary of a run counts `analyses: 0` until then.

## Still open

- The usage-limit output was never seen: the spike could not reach the plan's limit. `isUsageLimit` (`runner/claude.ts`) follows Claude Code's documented messages and HTTP 429. When a real one shows in a run, put its shape in `runner/fixtures/claude-usage-limit.json` and its test.
- The signals at the time limit go to Claude's process group on Linux. Only a fake process tested them (Windows has no signals).
- Every grading downloads the test and the barem again. Keep them per test and `filesVersion` in the run if large files make runs slow.
- One run can try a failing upload up to 3 times, after the other uploads: three time limits use an hour of the run.
- An upload whose run died waits in grading until the lease is stale (15 minutes) and the next check sends it back.
- Every run with work installs the robot again (`npm ci --omit=dev`, Claude Code, pandoc): about a minute.

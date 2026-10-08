# Claude outputs for the robot's tests

What `claude -p … --output-format json` printed in the Plan 3b spike (Claude Code 2.1.294), cut to the fields
that the robot reads. The test, the barem, and the student's pages were made up: no real student.

- `claude-exercise-list.json`: an exercise list (`structured_output` filled, exit code 0).
- `claude-grade.json`: a grading of three pages (exit code 0).
- `claude-max-turns.json`: a run stopped by `--max-turns` (exit code 1).
- `claude-not-logged-in.json`: a run without a login (exit code 1).
- `claude-usage-limit.json`: **made by hand**, in the shape of the login error: the spike could not reach the
  plan's limit. If a real usage-limit output looks different, change `isUsageLimit` in `runner/claude.ts` and
  this file.

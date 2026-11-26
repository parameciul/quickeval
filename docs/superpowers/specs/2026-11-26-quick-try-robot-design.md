# Quick Try robot: its own robot and a backup Claude account

Date: 2026-11-26. Status: draft, for approval.

## Why

Quick Try (`docs/superpowers/specs/2026-11-09-quick-try-design.md`) is how a possible client sees MQGrader work. That person wants the answer fast. Today a try can wait hours, or days:

1. One robot runs at a time. It has one lease (`runner_state`, row 1) and one GitHub concurrency group (`quickeval-robot`).
2. A run grades papers until none is left (`gradeAll` in `runner/run.ts`). Claims are ordered by attempts, then by student name. A Quick Try paper does not go first.
3. The robot makes barems and exercise lists only between rounds. A try that comes in during a class's grading waits until the whole class is graded.
4. A run takes new work for 2 hours (`BUDGET_MS`). A new run waits for the old one, up to 180 minutes.
5. When the Claude plan is at its limit (`usage_limit`), the run stops. Nothing starts it again until a teacher clicks "Pornește robotul". The GitHub schedule does not fire.

## Goals

- A Quick Try never waits for the teachers' work: not for a class in grading, not for the main run's budget, not for a stopped main run.
- Quick Try work runs on its own robot, with its own lease and its own GitHub job.
- The Quick Try robot uses the main Claude account first. When the main account is at its limit, it uses a backup account: a second Claude subscription.
- The backup account does only Quick Try work.
- An administrator sets how many tries the Quick Try robot works on at the same time.
- Both robots start again by themselves after a run stopped and work still waits. No person must click "Pornește robotul" for it.

## Non-goals

- No change to how the main robot works for teachers, except that it no longer takes Quick Try work.
- The main robot never uses the backup account.
- No other model or effort for Quick Try: both robots use `QE_MODEL` and `QE_EFFORT`.
- No new text on the try page (`/try/<token>`) for a long wait.

## Anti-goals (a failure even if it works)

- The two robots undo each other's work. For example, one robot's lease sends the other robot's papers back to the queue.
- The backup token reaches Claude's text, a log, or a student page.
- The Quick Try robot uses the backup account while the main account still has tokens.
- A try is graded twice, or two slots make the same try's barem at once.

## Constraints

- The lease row is checked in many places: `takeLease` (it sends other runs' papers in grading back to the queue), `/check` (it resets a dead run's papers), `HOLDS_LEASE` in the claim and in every save of a list, barem, print or analysis (a grading checks the run that claimed the paper, and the claim is already lane-scoped), and Setări's "running" status and "Pornește robotul". Each one must name its robot.
- `runner_state` has `CHECK (id = 1)`. SQLite cannot change a CHECK, so a second row needs a rebuilt table or a new table. A new migration runs on the live database before the code reaches `main`.
- Functions: at most 10 ms of CPU and 15 D1 queries per request. A new read on the try page's timer counts against the 5 million rows a day.
- The robot's Claude gets only the variables it needs (`claudeEnv`), with exactly one Claude token per call. Each account gets its own `CLAUDE_CONFIG_DIR`, next to the work folders, never inside one.
- `leaksSecret` (`runner/tasks.ts`) must refuse an answer that holds the backup token, the same as the main token.
- `check.ts` loads no package. `run.ts` loads only zod.
- Every address is English. Every visible text is in Romanian and English.
- Every robot job counts in `usage_days`.
- Robot logs are public: ids, counts, durations and error categories only. A log may say "backup account", never the token.

## Approaches

- **A. Quick Try gets its own robot (picked).** A second GitHub job, its own lease, its own concurrency group. It takes only Quick Try work. The main robot takes none. Good: a try never waits behind teacher work. Bad: every place that uses the lease must name its robot, with tests for each one.
- **B. One robot, Quick Try work first.** The one robot looks for Quick Try work between tasks and does it first, and changes to the backup account for Quick Try tasks. Good: less work. Bad: a try still waits for a Claude call that is running (up to 20 minutes), for the end of the 2-hour budget, and for a stopped run. Every limit stops the run.
- **C. The backup account always does Quick Try.** Dropped: the backup must be used only when the main account is at its limit.

The user picked A. They also asked for a separate "at the same time" setting for the Quick Try robot.

## The design

### Two robots, one API

- The robot has two lanes: `main` (the teachers) and `try` (Quick Try). "Lane" is the internal name. The text people read says "robotul pentru încercări rapide" / "the Quick Try robot".
- Each lane has its own lease row, with the same columns as `runner_state` today. *(Builder's call: rebuild `runner_state` with a `lane` key, or add a second table.)*
- Every robot request names its lane. An absent lane means `main`, so an older robot still works. *(Builder's call: a query parameter `lane=try` or a header. It must be English.)*
- Both lanes use the same robot key (`QUICKEVAL_RUNNER_KEY`).
- The work a lane sees is filtered in SQL by `tests.quick_try`. `main` sees only `quick_try = 0`. `try` sees only `quick_try = 1`. This holds for `/check`, the task list, the claim, and every save but a grading (it checks the run that claimed the paper). *(Built:)* a job read is not filtered: the robot reads only tests from its own lane's task list.
- A lane's `takeLease` and `/check` send back to the queue only the papers in grading of a dead run of the same lane.
- `HOLDS_LEASE` checks the lane's own row.

### Start

- Every path that starts the robot for a Quick Try test starts the `try` lane. All other paths start the `main` lane. *(My call: `startRobot` gets the lane from the test's or the teacher's `quick_try`.)*
- The `try` lane is a GitHub `repository_dispatch` with the event type `evaluate-try`.
- `evaluate.yml` gets a second job, for example `try-robot`, with the concurrency group `quickeval-robot-try`. It runs on `evaluate-try` and by hand. The `robot` job no longer runs on `evaluate-try`.
- `start_failed_at` is kept per lane.

### Restart after a stop (both robots)

Today a stopped run stays stopped. GitHub's 10-minute schedule never fires for this repo (`docs/superpowers/plans/plan-3b-followups.md`), so only a new robot path or "Pornește robotul" starts the robot. The user asked for an automatic restart of both robots.

- An open page is the clock. The try page's status read (every 10 seconds) can start the `try` robot. The teacher app's version read (`GET /api/admin/version`, every minute, any teacher tab) can start the `main` robot.
- When both accounts are at their limit, the `try` run ends with `stop: 'usage_limit'`, like a `main` run at its limit.
- A lane starts again only when all of these hold, checked in one SQL statement on its own `runner_state` row:
  - no run of the lane is alive (no heartbeat for `LEASE_STALE_MS`, 15 minutes);
  - no run of the lane checked in, and no automatic start happened, in the last 15 minutes;
  - the last run did not end with `usage_limit` less than 60 minutes ago (`main`) or 15 minutes ago (`try`);
  - the last run did not end with `claude_login`. A token that Claude refuses needs a person: a start would only fail again and send GitHub's failure email.
  - the last run did not end with `error` either (three tasks in a row used an attempt, or the API failed). *(My call, after the final review:)* a person looks first; a start every 15 minutes would use three more attempts of the waiting papers each time, until a class is all failed.
- Only after that statement wins does the server look for work: the waiting try's own test, or every teacher's class tests. *(Changed after the final review:)* the main look is lane-wide, because the look takes the lane's 15 minutes: an idle tab (Setări, "Vezi ca") must not use them for nothing while another teacher's class waits. With no work, nothing starts, and the next look is 15 minutes later. New work starts the robot at once anyway, so this wait touches only work that a stopped run left.
- *(The user asked for the restart; the numbers are my call.)* 15 minutes is the floor: a run counts as dead only after 15 minutes without a heartbeat. It is under the 30 minutes after which the test page shows "Pornește robotul", so the button shows only when the automatic start did not work. After a usage limit, the teachers' robot waits 60 minutes, because a Claude plan's limit comes back after hours, not minutes: a start every 15 minutes would mostly hit the limit again. *(The user's choice:)* the Quick Try robot waits only 15 minutes, because a person waits for that answer; its extra runs are short, free on this public repo, and happen only while a try waits and its page is open. If the real limit output (below) names the time the limit ends, the 60 minutes can follow it.
- A start while an older `main` job still runs (the 2-hour budget in a 180-minute job) waits in the concurrency group. GitHub keeps one waiting run per group, so starts do not pile up.
- An administrator's view of a teacher ("Vezi ca") reads the version too, and starts the robot the same way. A start changes no teacher data.
- A page with no start due reads one more row per read.
- A new Quick Try still starts the `try` lane, every other robot path starts its lane, and "Pornește robotul" stays, as today.

### The work of one try

- The `try` robot runs up to N slots at the same time (N is the setting below). Each slot takes the next piece of Quick Try work that no other slot has: a barem, an exercise list, or a paper. A try's own steps come in order by themselves: its list waits for its barem, and its paper waits for its list.
- Only one `try` run works at a time (its lease). So the slots of that run share one list in memory of the tests they work on, and two slots never take the same barem or list. A paper is claimed in SQL, as today. *(Plan's call: this needs no new column.)*
- The rules of today stay: a barem that ends other than `retry` is tried once per run; a list once per run; a paper by `MAX_ATTEMPTS`. A Quick Try has no print and no class analysis.
- `FAILURES_IN_A_ROW` stays per run.

### The setting

- Setări, "Corectarea", a new row under "Lucrări corectate deodată".
- Romanian label: "Încercări rapide deodată". English: "Quick Tries at once".
- Romanian sentence: "Câte încercări rapide face robotul lor în același timp. Mai multe deodată răspund mai repede, dar ajung mai repede la limita planului Claude." English: "How many Quick Tries their robot works on at the same time. More at once answer sooner, but reach the Claude plan's limit sooner."
- Values 1 to 4. *(My call: default 2.)* Administrators only. It saves when it is chosen, then says "Salvat." / "Saved.", the same as the setting above it.
- It goes in `settings` with its own key. The `try` lane's lease answer sends it as `maxParallel`.
- "Lucrări corectate deodată" stays for the `main` lane only. Its sentence does not change.

### The backup account

- A new GitHub secret: `CLAUDE_CODE_OAUTH_TOKEN_BACKUP` (from `claude setup-token` on the second subscription). Only the `try-robot` job gets it.
- The `try` robot calls Claude with the main token first.
- When the main account answers `usage_limit`, the slot does the same task again at once with the backup token. The first call counts no attempt (as today for `usage_limit`).
- *(My call:)* `claude_login` on the main token also changes to the backup, because an expired main token must not stop Quick Try.
- After the first change, the run uses the backup for the rest of the run. It does not ask the main account again until the next run.
- When the backup also answers `usage_limit`, the run takes no new work and ends with `stop: 'usage_limit'`. A backup `claude_login` ends the run with `claude_login` and exit code 1.
- No backup secret: the `try` robot works with the main token only, and stops at its limit.
- Each token has its own `CLAUDE_CONFIG_DIR`. `claudeEnv` passes exactly one token per call.
- `leaksSecret` refuses an answer that holds either token.
- The answer's model and tokens are reported as today. *(My call:)* Each job done with the backup counts in a new `usage_days` column, `backup_jobs`, on the Quick Try day row. Setări, "Statistici", shows it.

### Before we trust the change to the backup

- `isUsageLimit` (`runner/claude.ts`) was written from a sample made by hand (`runner/fixtures/README.md`). The change to the backup works only if that check matches a real limit answer.
- Before the `try` robot goes live, get a real limit output of the pinned Claude Code (2.1.294), save it in `runner/fixtures/`, and make `isUsageLimit` match it. Also check how long Claude Code waits and retries on a 429 before it exits. If it waits long, the change to the backup is slow.

### Setări

- The robot status shows both robots: running or not, the last run and its summary. "Pornește robotul" stays for the `main` lane. *(My call: no button for the `try` lane; the restart above covers it.)*

### Deploy order

1. The migration on the live database.
2. The GitHub secret `CLAUDE_CODE_OAUTH_TOKEN_BACKUP`.
3. The code, with the new workflow job, to `main`. GitHub runs `repository_dispatch` only from the workflow file on `main`.
4. `docs/deploy.md`: the new secret, the new job, the new event type, the restart.

A Quick Try paper that a `main` run holds in grading at the deploy: the `main` run's save is refused (the save checks the lane), and the `try` lane's next lease sends the paper back to its queue. *(My call: accepted, no special step.)*

## Tests

- Server: each lane sees only its own work in `/check`, the task list, the claim, the job reads and the saves. A `try` lease does not reset `main` papers, and the opposite. A save with the other lane's run is refused. Two `try` slots never claim the same try. The setting's range, default and admin-only rule. The restart rule, for both lanes: at most one start in 15 minutes, none with a live run, none for 60 minutes (`main`) or 15 minutes (`try`) after `usage_limit`, none after `claude_login`, only with waiting work; from an administrator's view too; the version read stays at a few rows.
- Robot: main `usage_limit` changes to the backup and does the task again; the backup is kept for the rest of the run; backup `usage_limit` ends the run; no backup secret; `claude_login` changes to the backup; one token per call; `leaksSecret` refuses the backup token; N tries run at the same time with the setting at N.
- `check.test.ts` and `run.test.ts` still prove the package rules.
- Web: the new setting row in both languages; Statistici shows `backup_jobs`; the robot status shows both robots.
- i18n scans pass.

## Left to the builder

- The table shape for the second lease, the lane's name in robot requests, the try-claim column.
- How `run.ts` is split between the two lanes (one file with a lane option, or two entry points).
- The exact Setări layout for two robots' status.

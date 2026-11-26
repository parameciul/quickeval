# Quick Try robot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quick Try work runs on its own robot (its own lease, GitHub job and "at the same time" setting), and that robot changes to a backup Claude subscription when the main account is at its limit. Both robots start again by themselves when a run stopped and work still waits.

**Architecture:** The robot gets two lanes, `main` (row 1 of `runner_state`) and `try` (row 2). A test's lane is `tests.quick_try`; every robot read of work filters by it, and every robot save checks the lease row of the test's own lane. The robot names its lane with `?lane=try` on `/check`, `/lease`, `/tasks` and `/claim`; heartbeat and release find the lease by the run's id. A new `runTryRobot` keeps N slots busy with Quick Try barems, lists and papers. A `failoverRunner` wraps the main Claude runner and the backup one. An open page is the restart clock: the try page's status read starts the `try` robot again, and the teacher app's version read (`GET /api/admin/version`) starts the `main` robot again, through one rule (`claimRobotRestart`, then `laneHasWork`).

**Tech Stack:** Hono on Cloudflare Pages Functions, D1 (SQLite), zod, React 19 + TanStack Query, Node robot on GitHub Actions, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-quick-try-robot-design.md`

## Global Constraints

- Lanes: `ROBOT_LANES = ['main', 'try']`; row ids `main` = 1, `try` = 2. An absent `lane` is `main` (an older robot keeps working). Any other `lane` value answers 404.
- The new setting: key `max_parallel_tries`, values 1 to `MAX_PARALLEL_TRIES` = 4, default `DEFAULT_PARALLEL_TRIES` = 2. "Lucrări corectate deodată" (`max_parallel_agents`) applies to `main` only.
- The restart, one rule for both lanes: `ROBOT_RESTART_MS = LEASE_STALE_MS` (15 minutes) since the last heartbeat, the last check and the last automatic start; after a run that ended with `usage_limit`, `RESTART_AFTER_LIMIT_MS[lane]`: `main` 60 minutes, `try` 15 minutes (the user's choice: a waiting try matters more than a few empty runs); never by itself after a run that ended with `claude_login` (a person must renew the token). "Pornește robotul" stays.
- GitHub: event type `evaluate-try`, job `try-robot`, concurrency group `quickeval-robot-try`, variable `QE_LANE=try`, secret `CLAUDE_CODE_OAUTH_TOKEN_BACKUP` (only in the `try-robot` job's Grade step).
- The main robot never uses the backup token. The `try` robot uses it only after the main token answered `usage_limit` or `not_logged_in`.
- Each Claude call gets exactly one token, in `CLAUDE_CODE_OAUTH_TOKEN`; the backup has its own `CLAUDE_CONFIG_DIR` (`<run root>/claude-config-backup`).
- `leaksSecret` refuses an answer that holds the main token, the backup token or the robot key.
- Rules are checked inside the SQL of each write, never only before it.
- Every visible text through `t()` with its English in `src/i18n/en/admin.ts`; every API message Romanian with its English in `shared/i18n/messages.ts`.
- English addresses; ISO UTC times; relative imports name the `.ts`/`.tsx` file; no enums.
- At most 15 D1 queries per request. The try page's timed read and the teacher app's version read each get one more statement on one `runner_state` row; the work check (scoped to the try's test or the teacher's tests) runs only after that statement won a start, so at most once per 15 minutes per lane.
- `runner/check.ts` loads no package; `runner/run.ts` and what it imports load only zod (`import type` from `shared/`).
- Robot logs: ids, counts, durations, error categories, and the word `backup`; never a token or Claude's text.
- The migration runs on the live database before the code reaches `main` (`docs/deploy.md`).
- Commits: no AI attribution, no ticket numbers in code comments; stage files by path.

## Review Focus

1. **A `try` lease must not undo the main robot's work.** Taking the `try` lease while a main run grades a class must leave every class paper in `grading` (Task 1 test `a try lease leaves the main run's papers in grading`).
2. **A save from the wrong lane.** A main run that read a Quick Try test before the deploy sends its list: refused with 409 `lease_lost` (Task 1 test `refuses a save from a run of the other lane`).
3. **The main account comes back during a run.** After the change to the backup, the run stays on the backup to its end (Task 5 test `stays on the backup for the rest of the run`); the next run tries the main token first (Task 5 test `a new runner starts on the main token`).
4. **No backup secret set.** The `try` robot works with the main token and ends at its limit with `stop: 'usage_limit'`, exit code 0 (Task 5 test `without a backup token stops at the main limit`).
5. **A page open for hours while the robot cannot work.** The try page or a teacher tab open all day: at most one start per 15 minutes per lane, none while a run of the lane is alive, none for 60 minutes (`main`) or 15 minutes (`try`) after a `usage_limit` stop, none after a `claude_login` stop, and the version read stays at a few rows (Task 2 tests `starts the try robot at most once in 15 minutes`, `waits an hour after a usage limit`, `starts the try robot 15 minutes after a usage limit`, `does not start again after a refused Claude login`, `reads one row when no restart is due`).

---

## File map

| File | Responsibility |
|---|---|
| `migrations/0039_robot_lanes.sql` (create) | `runner_state` rebuilt with `CHECK (id IN (1, 2))`, the column `restart_at`, row 2; `usage_days.backup_jobs`. |
| `shared/runner.ts` (modify) | `ROBOT_LANES`, `RobotLane`, `LANE_ROW`, `parseLane`, `MAX_PARALLEL_TRIES`, `ROBOT_RESTART_MS`, `RESTART_AFTER_LIMIT_MS`; `backup` in the answer bodies. |
| `server/db/runner.ts` (modify) | Lane filters and the test's lane lease check; `claimRobotRestart`, `laneHasWork`; `backup` in `logRobotWork`. |
| `server/routes/runner.ts` (modify) | `?lane=` on `/check`, `/lease`, `/tasks`, `/claim`; `backup` to `logRobotWork`. |
| `server/db/settings.ts`, `server/routes/settings.ts`, `shared/api.ts` (modify) | `maxParallelTries`, `tryRobot` status, lane in `getMaxParallel`, `testPageRobot`, `saveRobotStart`. |
| `server/dispatch.ts`, `server/env.ts` (modify) | `dispatchRobot(env, lane)`, `AppOptions.robotLane`, `robotStarter` by lane, `restartIfStopped`. |
| `server/routes/quickTry.ts`, `server/routes/tests.ts`, `server/routes/admin.ts` (modify) | Mount the teacher routes with `robotLane: 'try'`; the restart after the try page's read and after the teacher app's version read; `testPageRobot` by lane. |
| `server/db/usage.ts`, `shared/usage.ts` (modify) | `backupJobs` counted and read. |
| `runner/api.ts` (modify) | `lane` option; `backup` in bodies and `X-Backup`. |
| `runner/session.ts` (create) | Lease, heartbeat, counts, `record`, stop reasons, release: shared by both run loops. |
| `runner/run.ts` (modify) | Uses `session.ts`; `main()` picks the lane and the runners. |
| `runner/runTry.ts` (create) | `runTryRobot`: N slots over Quick Try barems, lists and papers. |
| `runner/failover.ts` (create) | `failoverRunner`. |
| `runner/claude.ts`, `runner/tasks.ts`, `runner/baremTask.ts` (modify) | `backup` on the outcome; `sendOutcome` passes it; backup token in `SECRET_NAMES`. |
| `.github/workflows/evaluate.yml`, `runner/workflow.test.ts` (modify) | The `try-robot` job. |
| `src/admin/pages/SettingsPage.tsx`, `src/admin/settingsPage/UsageSection.tsx`, `src/i18n/en/admin.ts`, `shared/i18n/messages.ts` (modify) | The new setting row, the try robot's status, the backup column. |
| `docs/deploy.md`, `server/AGENTS.md`, `runner/AGENTS.md`, `AGENTS.md` (modify) | Short paragraphs. |

---

### Task 1: Two lanes in the robot API

**Files:**
- Create: `migrations/0039_robot_lanes.sql`, `server/routes/runnerLanes.test.ts`
- Modify: `shared/runner.ts`, `server/db/runner.ts`, `server/routes/runner.ts`, `server/db/settings.ts` (only `getMaxParallel`)

**Interfaces:**
- Produces: `ROBOT_LANES`, `type RobotLane = 'main' | 'try'`, `LANE_ROW: Record<RobotLane, 1 | 2>`, `parseLane(raw: string | undefined): RobotLane | null` (undefined → `'main'`, `'try'` → `'try'`, else null), `MAX_PARALLEL_TRIES = 4`, `ROBOT_RESTART_MS = LEASE_STALE_MS`, `RESTART_AFTER_LIMIT_MS: Record<RobotLane, number>` = `{ main: 60 * 60_000, try: ROBOT_RESTART_MS }` in `shared/runner.ts`.
- Produces in `server/db/runner.ts`: `laneRowSql(test: string): string` (`CASE WHEN ${test}.quick_try = 1 THEN 2 ELSE 1 END`), `laneWorkSql(lane: RobotLane, test: string): string`, and a `lane: RobotLane = 'main'` last parameter on `runCheck`, `takeLease`, `listTasks`, `claimSubmission`.
- Produces in `server/db/settings.ts`: `getMaxParallel(db, lane: RobotLane = 'main')`, `DEFAULT_PARALLEL_TRIES = 2`.

- [ ] **Step 1: Write the migration**

`migrations/0039_robot_lanes.sql`: a header comment (two lanes: row 1 the teachers' robot, row 2 the Quick Try robot; `restart_at` is the lane's last automatic start, asked by an open page; `backup_jobs` counts the jobs that the backup Claude account did). Then, one statement per `;` line end:
`CREATE TABLE runner_state_new` with the same columns as today plus `start_failed_at TEXT` and `restart_at TEXT`, `id INTEGER PRIMARY KEY CHECK (id IN (1, 2))`; `INSERT INTO runner_state_new (…) SELECT … FROM runner_state`; `DROP TABLE runner_state`; `ALTER TABLE runner_state_new RENAME TO runner_state`; `INSERT INTO runner_state (id) VALUES (2)`; `ALTER TABLE usage_days ADD COLUMN backup_jobs INTEGER NOT NULL DEFAULT 0`.

Read every column that migrations 0003 to 0038 added to `runner_state` (`grep -n runner_state migrations/*.sql`) and copy them all.

- [ ] **Step 2: Write the failing tests** in `server/routes/runnerLanes.test.ts`

Use `startTestApi`, `setRobotKey`, `robotRequest` (`server/test/fixtures.ts`) and make a try as `server/routes/quickTryRobotWork.test.ts` does. Make one class test in evaluation with two papers waiting, and one try in evaluation with a ready list and its paper waiting.

```ts
describe('robot lanes', () => {
  it('gives each lane its own lease', async () => {
    expect((await robot('POST', '/lease', { runId: MAIN_RUN })).body.granted).toBe(true);
    expect((await robot('POST', '/lease?lane=try', { runId: TRY_RUN })).body.granted).toBe(true);
    expect((await robot('POST', '/lease?lane=try', { runId: OTHER_RUN })).body.granted).toBe(false);
  });
  it('answers 404 for an unknown lane', async () => {
    expect((await robot('POST', '/lease?lane=x', { runId: MAIN_RUN })).status).toBe(404);
  });
  it('lists and counts only the lane\'s own work', async () => {
    expect((await robot('GET', '/tasks')).body.pendingGrading).toBe(2);
    expect((await robot('GET', '/tasks?lane=try')).body.pendingGrading).toBe(1);
    expect((await robot('POST', '/check?lane=try')).body.pendingGrading).toBe(1);
  });
  it('claims only the lane\'s own papers', async () => {
    // main claims twice: the two class papers, then 204; try claims the try's paper.
  });
  it('a try lease leaves the main run\'s papers in grading', async () => {
    // main leases and claims one class paper; try leases; the paper is still 'grading' with MAIN_RUN.
  });
  it('refuses a save from a run of the other lane', async () => {
    // a main run (lease held) posts an exercise list for the try's test: 409 lease_lost.
  });
  it('heartbeats and releases each lane by its run id', async () => {
    // both lease; heartbeat TRY_RUN → 200; release TRY_RUN → 200; row 1 still holds MAIN_RUN.
  });
  it('sends the try lane its own number at once', async () => {
    expect((await robot('POST', '/lease?lane=try', { runId: TRY_RUN })).body.maxParallel).toBe(2);
  });
});
```

Write each commented test fully, with its asserts on the rows (`api.db`).

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run server/routes/runnerLanes.test.ts`
Expected: FAIL (the migration's row 2 exists, but `?lane=try` is ignored: the second lease is refused, the counts are 3).

- [ ] **Step 4: Implement the lanes**

In `server/db/runner.ts`:
- `HOLDS_LEASE` becomes `holdsLeaseSql(laneRow: string)`: `EXISTS (SELECT 1 FROM runner_state r WHERE r.id = ${laneRow} AND r.run_id = ?)`. The test writes pass `laneRowSql('tests')`; the submission writes (claim, `takeLease`'s reset) pass `(SELECT ${laneRowSql('lt')} FROM tests lt WHERE lt.id = submissions.test_id)`. Lines 329 and 605 (`r.id = 1 AND r.run_id = ${run}`) use the test's lane row the same way.
- `runCheck`, `listTasks`: every count and list adds `AND ${laneWorkSql(lane, 't')}`; `last_check_at` is written on `LANE_ROW[lane]`. The reset of dead runs' papers checks any row: `NOT EXISTS (SELECT 1 FROM runner_state r WHERE r.run_id = submissions.run_id AND r.heartbeat_at >= ?)`.
- `takeLease`: updates row `LANE_ROW[lane]`; its reset touches only papers of the lane's tests.
- `heartbeat`, `releaseLease`, `holdsLease`: `WHERE run_id = ?` (run ids are random: a run holds at most one row).
- `claimSubmission`: the look and the UPDATE add the lane's test filter.
- `testHasRobotWork`: its dead-run check reads any row, as `runCheck`.

In `server/routes/runner.ts`: `laneOf(c)` = `parseLane(c.req.query('lane'))`, 404 on null; pass it to `runCheck`, `takeLease`, `getMaxParallel`, `listTasks`, `claimSubmission`.

- [ ] **Step 5: Run the robot API tests**

Run: `npx vitest run server/routes/runnerLanes.test.ts server/routes/runner*.test.ts server/routes/quickTry*.test.ts`
Expected: PASS, the old tests unchanged.

- [ ] **Step 6: Run on the real engine and commit**

Run: `QE_TEST_DB=workerd npx vitest run --project server` (the migration rebuilds a table). Expected: PASS.

```bash
git add migrations/0039_robot_lanes.sql shared/runner.ts server/db/runner.ts server/routes/runner.ts server/db/settings.ts server/routes/runnerLanes.test.ts
git commit -m "Give the robot API a lane for Quick Try work"
```

---

### Task 2: Start the robot of the right lane, and again after a stop

**Files:**
- Modify: `server/dispatch.ts`, `server/env.ts`, `server/db/settings.ts`, `server/db/runner.ts`, `server/routes/quickTry.ts`, `server/routes/tests.ts`, `server/routes/admin.ts`
- Test: `server/dispatch.test.ts`, `server/routes/quickTryRobotStart.test.ts` (create), `server/routes/robotRestart.test.ts` (create)

**Interfaces:**
- Consumes: `RobotLane`, `LANE_ROW`, `ROBOT_RESTART_MS`, `RESTART_AFTER_LIMIT_MS`, `LEASE_STALE_MS` (Task 1).
- Produces: `dispatchRobot(env: Env, lane?: RobotLane, fetchImpl?)` (event `evaluate-now` or `evaluate-try`); `AppOptions.dispatchRobot?: (env: Env, lane: RobotLane) => Promise<boolean>`; `AppOptions.robotLane?: RobotLane`; `robotStarter(options)` starts `options.robotLane ?? 'main'`; `saveRobotStart(db, failedAt, lane = 'main')`; `testPageRobot(db, now, lane = 'main')`; in `server/db/runner.ts`: `claimRobotRestart(db: D1Database, lane: RobotLane, now: string): Promise<boolean>` and `laneHasWork(db: D1Database, scope: RestartScope, now: string): Promise<boolean>` with `type RestartScope = { lane: 'try'; testId: number } | { lane: 'main'; teacherId: number }`; in `server/dispatch.ts`: `restartIfStopped(env: Env, options: AppOptions, scope: RestartScope, now: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

In `server/dispatch.test.ts`: `it('sends evaluate-try for the try lane')`: the fetch body is `{ event_type: 'evaluate-try' }`.

In `server/routes/quickTryRobotStart.test.ts` (with `dispatchRobot = vi.fn(async () => true)`):

```ts
it('starts the try lane for a try\'s barem', async () => {
  // put the test file, generate the barem
  expect(dispatchRobot).toHaveBeenLastCalledWith(expect.anything(), 'try');
});
it('starts the main lane for a teacher\'s test', async () => {
  // a teacher's barem generation
  expect(dispatchRobot).toHaveBeenLastCalledWith(expect.anything(), 'main');
});
it('keeps the failed start of each lane apart', async () => {
  // dispatchRobot returns false for a try: runner_state row 2 has start_failed_at, row 1 has none
});
it('starts the try robot at most once in 15 minutes', async () => {
  // a try in evaluation with its paper waiting, no try run, last_check_at 20 min ago (fake Date)
  // GET /api/try/<token>/tests/<code> twice: dispatchRobot called once with 'try'
  // 16 minutes later: called a second time
});
it('does not start the try robot while a try run is alive', async () => {
  // row 2 holds a run with a fresh heartbeat: GET the test, no call
});
it('does not start the try robot for a try with no robot work', async () => {
  // a try still in prepare with no barem request: no call
});
it('starts the try robot 15 minutes after a usage limit', async () => {
  // row 2: stop 'usage_limit', finished 10 min ago, after the last check, the try's paper waiting: no call
  // 16 min after the finish: one call with 'try'
});
```

In `server/routes/robotRestart.test.ts` (same `dispatchRobot` mock; times set on row 1 of `runner_state` with a fake `Date`):

```ts
describe('the teachers\' robot starts again', () => {
  it('starts the main robot from the version read when a class paper waits', async () => {
    // a test in evaluation with a paper waiting, no main run, last_check_at 20 min ago
    // GET /api/admin/version twice: dispatchRobot called once, with 'main'
  });
  it('waits an hour after a usage limit', async () => {
    // last_run_summary.stop 'usage_limit', finished 30 min ago, after the last check: no call
    // 61 min after the finish: one call
  });
  it('does not start again after a refused Claude login', async () => {
    // stop 'claude_login', finished 3 hours ago, after the last check: no call
  });
  it('starts again after a run that ran out of time with work left', async () => {
    // stop 'budget', finished 1 min ago, last check 2 hours ago, a paper waiting: one call
  });
  it('does not start for a teacher with no robot work', async () => {
    // no call; row 1 restart_at is now, so the next 15 minutes skip the work check
  });
  it('starts from an administrator\'s view of a teacher', async () => {
    // "Vezi ca" on the teacher with a waiting paper: the view's version read makes one call
  });
  it('reads one row when no restart is due', async () => {
    // countingRows (server/test/rowsRead.ts): restart_at 1 min ago; the version read reads
    // the version's rows plus at most 1
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run server/dispatch.test.ts server/routes/quickTryRobotStart.test.ts server/routes/robotRestart.test.ts`
Expected: FAIL (`dispatchRobot` is called with one argument; no restart).

- [ ] **Step 3: Implement**

- `dispatch.ts`: the lane picks the event type; `robotStarter` passes `options.robotLane ?? 'main'` to `dispatch` and to `saveRobotStart`.
- `settings.ts`: `saveRobotStart` and `testPageRobot` use `LANE_ROW[lane]`.
- `tests.ts`: `testPageRobot(c.env.DB, nowIso(), options.robotLane ?? 'main')`.
- `quickTry.ts`: `const tryOptions: AppOptions = { ...options, robotLane: 'try' }` for `robotStarter`, `testRoutes` and `submissionRoutes`.
- `runner.ts`: extract the OR list of `testHasRobotWork` into `robotWorkSql(t: string)` (the dead-run part keeps its bound time) and use it in both.
- `claimRobotRestart`: one statement on one row, so a page with no restart due reads one row: `UPDATE runner_state SET restart_at = ?now WHERE id = ?row AND (run_id IS NULL OR heartbeat_at < ?stale) AND (last_check_at IS NULL OR last_check_at < ?window) AND (restart_at IS NULL OR restart_at < ?window) AND NOT (last_run_finished_at IS NOT NULL AND last_run_finished_at >= COALESCE(last_check_at, '') AND (json_extract(last_run_summary, '$.stop') = 'claude_login' OR (json_extract(last_run_summary, '$.stop') = 'usage_limit' AND last_run_finished_at >= ?limitWindow))) RETURNING id`, with `?row` = `LANE_ROW[lane]`, `?stale` = now − `LEASE_STALE_MS`, `?window` = now − `ROBOT_RESTART_MS`, `?limitWindow` = now − `RESTART_AFTER_LIMIT_MS[lane]`. "The last run's end is newer than the last check" means no run started after it.
- `laneHasWork`: `SELECT 1 FROM tests t WHERE t.id = ? AND t.quick_try = 1 AND (${robotWorkSql('t')}) LIMIT 1` for `try`; `WHERE t.teacher_id = ? AND t.quick_try = 0 AND (…) LIMIT 1` for `main`.
- `dispatch.ts`: `restartIfStopped`: `claimRobotRestart`, then `laneHasWork` only when it won, then the lane's starter (`robotStarter` with `robotLane: scope.lane`) only when there is work.
- `quickTry.ts`: a middleware on `GET /:token/tests/:code` that, after `next()` and a 200, runs `inBackground(c, restartIfStopped(c.env, tryOptions, { lane: 'try', testId: c.var.quickTry.testId }, nowIso()))`.
- `admin.ts`: `GET /version`, after it read the version: `inBackground(c, restartIfStopped(c.env, options, { lane: 'main', teacherId: c.var.teacher.id }, nowIso()))`. The answer does not wait for it.

- [ ] **Step 4: Run the server tests**

Run: `npm run test:server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/dispatch.ts server/env.ts server/db/settings.ts server/db/runner.ts server/routes/quickTry.ts server/routes/tests.ts server/routes/admin.ts server/dispatch.test.ts server/routes/quickTryRobotStart.test.ts server/routes/robotRestart.test.ts
git commit -m "Start each lane's robot for its own work, and again after a stop"
```

---

### Task 3: The setting and the try robot's status on Setări

**Files:**
- Modify: `shared/api.ts`, `server/db/settings.ts`, `server/routes/settings.ts`, `src/admin/pages/SettingsPage.tsx`, `src/i18n/en/admin.ts`, `shared/i18n/messages.ts`, `src/test/fakeApi.ts` (the fake settings)
- Test: `server/routes/settings.test.ts`, `src/admin/pages/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: `getMaxParallel(db, lane)`, `MAX_PARALLEL_TRIES` (Task 1).
- Produces: `Settings.maxParallelTries: number`, `Settings.tryRobot: RobotStatus`; the PATCH body field `maxParallelTries` (1…4); `setMaxParallelTries(db, value)`.

- [ ] **Step 1: Write the failing tests**

`server/routes/settings.test.ts`:
- `it('reads 2 Quick Tries at once by default')`: `GET /api/admin/settings` → `maxParallelTries: 2`.
- `it('saves the Quick Tries at once')`: PATCH `{ maxParallelTries: 3 }` → 3, and `maxParallelAgents` unchanged.
- `it.each([0, 5, 1.5, '2'])('refuses %s Quick Tries at once')`: 400 with the message `Alege între 1 și 4 încercări rapide deodată.`
- `it('shows the try robot\'s own state')`: row 2 holds a fresh run → `tryRobot.running` true, `robot.running` false.

`src/admin/pages/SettingsPage.test.tsx`:
- `it('saves the Quick Tries at once when chosen')`: `findByLabelText('Încercări rapide deodată')`, choose 3, the PATCH sent `{ maxParallelTries: 3 }`, then "Salvat.".
- `it('shows both robots')`: the texts "Robotul pentru profesori" and "Robotul pentru încercări rapide", each with its state.
- The same two tests in English (`quickeval.lang = en`): "Quick Tries at once", "The teachers' robot", "The Quick Try robot".

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run server/routes/settings.test.ts src/admin/pages/SettingsPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `getSettings`: read `max_parallel_tries` and row 2 (`LEFT JOIN runner_state q ON q.id = 2`) in the same statement.
- The PATCH body's `refine` accepts a body with any one of the three fields.
- `SettingsPage.tsx`: a row under "Lucrări corectate deodată", the same `useSettingSave` pattern. Label "Încercări rapide deodată"; sentence "Câte încercări rapide face robotul lor în același timp. Mai multe deodată răspund mai repede, dar ajung mai repede la limita planului Claude."
- `RobotState` shows two blocks: "Robotul pentru profesori" (today's content) and "Robotul pentru încercări rapide" (state and `lastRunText(settings.tryRobot)`; no start button).
- English in `src/i18n/en/admin.ts`: "Quick Tries at once"; "How many Quick Tries their robot works on at the same time. More at once answer sooner, but reach the Claude plan's limit sooner."; "The teachers' robot"; "The Quick Try robot". The API message's English in `shared/i18n/messages.ts`: "Choose between 1 and 4 Quick Tries at once."

- [ ] **Step 4: Run the tests and the scans**

Run: `npx vitest run server/routes/settings.test.ts src/admin/pages/SettingsPage.test.tsx scripts/i18n` and `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/api.ts server/db/settings.ts server/routes/settings.ts src/admin/pages/SettingsPage.tsx src/i18n/en/admin.ts shared/i18n/messages.ts src/test/fakeApi.ts server/routes/settings.test.ts src/admin/pages/SettingsPage.test.tsx
git commit -m "Set how many Quick Tries their robot does at once, and show both robots"
```

---

### Task 4: The Quick Try run

**Files:**
- Create: `runner/session.ts`, `runner/runTry.ts`, `runner/runTry.test.ts`
- Modify: `runner/api.ts`, `runner/run.ts`, `runner/test/robotWorld.ts` (a helper that makes a try)

**Interfaces:**
- Consumes: the `?lane=` API (Task 1).
- Produces: `RobotApiOptions.lane?: RobotLane` (adds `?lane=try` to `check`, `lease`, `tasks`, `claim` only); `robotApiFromEnv` reads `QE_LANE` (`'try'`, else main).
- Produces in `runner/session.ts`: `openSession(options: RunOptions, maxParallel: number): RunSession` with `{ ctx, counts, canTake(): boolean, stopTaking(reason), record(end: TaskEnd, done), finish(failure: boolean): Promise<RunReport> }` — exactly today's logic of `runRobot` lines 63–98 and 213–223, moved.
- Produces: `runTryRobot(options: RunOptions): Promise<RunReport>` in `runner/runTry.ts`.

- [ ] **Step 1: Move the session out of `run.ts`**

`runRobot` takes the lease, calls `openSession`, runs its rounds and calls `finish`. No behavior change.

Run: `npx vitest run runner/run.test.ts runner/check.test.ts`
Expected: PASS unchanged (also the package rule tests).

- [ ] **Step 2: Write the failing tests** in `runner/runTry.test.ts`

Use `robotWorld.ts` and `scriptedClaude`, with the API in-process and `lane: 'try'`.

```ts
it('makes a try\'s barem, then its list, then grades its paper', async () => { /* counts: barems 1, exerciseLists 1, graded 1, stop 'done' */ });
it('takes no teacher work', async () => { /* a class test waits too: its papers stay 'submitted' */ });
it('works on two tries at the same time with the setting at 2', async () => {
  // two tries with a barem request; Claude answers only after both barem calls started
  // (a scripted answer that waits on a promise both calls resolve): both barems saved
});
it('never gives one barem to two slots', async () => { /* one try, setting 3: Claude is asked for its barem once */ });
it('stops all slots at a usage limit', async () => { /* stop 'usage_limit'; no new task starts after it */ });
it('gives the lease back with its summary', async () => { /* runner_state row 2 has last_run_summary, row 1 none */ });
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run runner/runTry.test.ts`
Expected: FAIL (`runTryRobot` does not exist).

- [ ] **Step 4: Implement `runTryRobot`**

Take the `try` lease (`maxParallel` from its answer), `openSession`, then start `maxParallel` slots with `Promise.allSettled`. A slot loops while `canTake()`:
1. `api.tasks()`; the first test id of `barems`, then of `exerciseLists`, that is not in the run's `busy` set and not in its `tried` set (the same "tried" rules as `runRobot`: a barem that ends `retry` may be taken again, a list once per run). Put it in `busy`, run `makeBarem` / `makeExerciseList`, `record`, take it out of `busy`.
2. Else `api.claim(runId)`; a claim runs `gradeSubmission`.
3. Else the slot ends.

A slot that throws stops the others (as `gradeAll`). The CES lists, prints and analyses are not read: a Quick Try has none.

In `run.ts`, `main()` calls `runTryRobot` when `env.QE_LANE === 'try'`, else `runRobot`.

- [ ] **Step 5: Run the robot tests**

Run: `npm run test:runner`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add runner/session.ts runner/runTry.ts runner/runTry.test.ts runner/api.ts runner/run.ts runner/test/robotWorld.ts
git commit -m "Run Quick Try work on its own robot, several tries at once"
```

---

### Task 5: The backup Claude account

**Files:**
- Create: `runner/failover.ts`, `runner/failover.test.ts`
- Modify: `runner/claude.ts`, `runner/tasks.ts`, `runner/baremTask.ts`, `runner/api.ts`, `runner/run.ts`, `shared/runner.ts`, `server/routes/runner.ts`, `server/db/runner.ts`, `server/db/usage.ts`, `shared/usage.ts`, `src/admin/settingsPage/UsageSection.tsx`, `src/i18n/en/admin.ts`
- Test: `runner/tasks.test.ts`, `runner/run.test.ts`, `server/routes/runnerLanes.test.ts`, `src/admin/settingsPage/UsageSection.test.tsx`

**Interfaces:**
- Consumes: `runTryRobot`, `QE_LANE` (Task 4); `usage_days.backup_jobs` (Task 1).
- Produces: `ClaudeOutcome` (ok) gets `backup?: true`; `failoverRunner(primary: ClaudeRunner, backup: ClaudeRunner | null): ClaudeRunner`; `sendOutcome`'s `sendAnswer` gets a fifth parameter `backup: boolean`; the bodies `exerciseListBody`, `resultBody`, `analysisBody` get `backup: z.literal(true).optional()`; the barem upload sends `X-Backup: 1`; `logRobotWork` work gets `backup?: boolean`; `UsageCounts.backupJobs`.

- [ ] **Step 1: Write the failing tests**

`runner/failover.test.ts` (scripted runners that count their calls):

```ts
it('uses the main runner while it works', /* backup never called; outcome has no backup flag */);
it('does the same task again on the backup after a main usage limit', /* main 1 call, backup 1 call, outcome.backup === true */);
it('changes to the backup after a refused main login', /* problem not_logged_in → backup */);
it('stays on the backup for the rest of the run', /* second task: main not called */);
it('a new runner starts on the main token', /* a new failoverRunner calls main first */);
it('gives the main outcome when there is no backup', /* failoverRunner(main, null): usage_limit returned */);
it('gives the backup\'s usage limit when both are at their limit', /* problem usage_limit */);
it('gives the backup\'s refused login as it is', /* problem not_logged_in: the run then stops with claude_login, exit 1 */);
```

`runner/tasks.test.ts`: `it('refuses an answer that holds the backup token')` (`leaksSecret` with `CLAUDE_CODE_OAUTH_TOKEN_BACKUP` in env).

`runner/claude.test.ts` (or where `claudeEnv` is tested): `it('never passes the backup variable to Claude')`: `claudeEnv(settings, { CLAUDE_CODE_OAUTH_TOKEN_BACKUP: 'x'.repeat(20), PATH: '/bin' })` has no such key, and `CLAUDE_CODE_OAUTH_TOKEN` is `settings.token`.

`runner/run.test.ts`, with `main()` and `QE_LANE: 'try'`:
- `it('without a backup token stops at the main limit')`: exit 0, summary `stop: 'usage_limit'`.
- `it('the main robot never uses the backup token')`: `QE_LANE` unset, backup set, main answers usage_limit: the backup runner is never made (inject the runner factory through `MainOptions`).
- `it('needs one of the two tokens for the try lane')`: `QE_LANE: 'try'`, only the backup set → it runs.

`server/routes/runnerLanes.test.ts`: `it('counts the backup\'s jobs of the day')`: a grading result with `backup: true` → `usage_days.backup_jobs` 1 on the Quick Try row; without it → 0.

`src/admin/settingsPage/UsageSection.test.tsx`: the column "Cont de rezervă" (English "Backup account") shows `backupJobs` for the Quick Try source and the "all" source, never for "teachers".

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run runner/failover.test.ts runner/tasks.test.ts runner/run.test.ts server/routes/runnerLanes.test.ts src/admin/settingsPage/UsageSection.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `failover.ts`: one `usingBackup` flag per runner. A main outcome with `usage_limit` or `not_logged_in`, and a backup present: set the flag, `log('claude account', { account: 'backup' })`, run the same task on the backup. Every backup outcome that is ok gets `backup: true`.
- `claude.ts`: `claudeSettings` stays; `main()` makes the backup settings with `token: env.CLAUDE_CODE_OAUTH_TOKEN_BACKUP?.trim()` and `configDir: path.join(root, 'claude-config-backup')`.
- `run.ts` `main()`: for `QE_LANE === 'try'`, `failoverRunner(mainRunner, backupToken ? backupRunner : null)`, and it needs at least one of the two tokens (with only the backup, the backup runner is the main one). For `main`, today's code.
- `tasks.ts`: `SECRET_NAMES` adds `'CLAUDE_CODE_OAUTH_TOKEN_BACKUP'`; `sendOutcome` passes `outcome.backup === true`; each `sendAnswer` puts `backup: true` in its body only when true. `baremTask.ts` and `api.ts` `sendBarem` send `X-Backup: 1` only when true.
- Server: each ok `logRobotWork` call passes `backup: body.backup === true` (barem: the header). `countRobotWorkDay` adds `backup_jobs = backup_jobs + 1` (and `1` in the INSERT) when `ok && backup`. `readUsage` sums `backup_jobs AS backupJobs`; `EMPTY_USAGE.backupJobs = 0`.
- `UsageSection.tsx`: a column `{ name: 'backupJobs', label: t('Cont de rezervă') }`, hidden for the "teachers" source like `tries`.

- [ ] **Step 4: Run everything**

Run: `npm test` and `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add runner/failover.ts runner/failover.test.ts runner/claude.ts runner/tasks.ts runner/baremTask.ts runner/api.ts runner/run.ts shared/runner.ts server/routes/runner.ts server/db/runner.ts server/db/usage.ts shared/usage.ts src/admin/settingsPage/UsageSection.tsx src/i18n/en/admin.ts runner/tasks.test.ts runner/run.test.ts server/routes/runnerLanes.test.ts src/admin/settingsPage/UsageSection.test.tsx
git commit -m "Use the backup Claude account for Quick Try when the main one is at its limit"
```

---

### Task 6: The GitHub job and the docs

**Files:**
- Modify: `.github/workflows/evaluate.yml`, `runner/workflow.test.ts`, `docs/deploy.md`, `server/AGENTS.md`, `runner/AGENTS.md`, `AGENTS.md`, `docs/superpowers/plans/plan-3b-followups.md`

- [ ] **Step 1: Write the failing workflow tests** in `runner/workflow.test.ts`

- `it('runs the Quick Try robot on evaluate-try, in its own group')`: `repository_dispatch.types` holds `evaluate-try`; job `try-robot` has `concurrency.group: quickeval-robot-try`, `cancel-in-progress: false`, and `QE_LANE: try` in its Check and Grade steps.
- `it('keeps the teachers\' robot off evaluate-try')`: the `robot` job's `if` excludes `github.event.action == 'evaluate-try'`.
- `it('gives the backup token only to the Quick Try robot\'s Grade step')`: `CLAUDE_CODE_OAUTH_TOKEN_BACKUP` appears once, there.
- `it('lets a run by hand pick the lane')`: `workflow_dispatch.inputs.lane` with the options `main` and `try`.

Run: `npx vitest run runner/workflow.test.ts`
Expected: FAIL.

- [ ] **Step 2: Write the job**

`try-robot` copies the `robot` job's steps (checkout without credentials, setup-node, Check for work, Install, Grade) with `QE_LANE: try`, the same `timeout-minutes: 180`, and `CLAUDE_CODE_OAUTH_TOKEN_BACKUP: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN_BACKUP }}` in Grade only. Its `if`: `github.event.action == 'evaluate-try' || (github.event_name == 'workflow_dispatch' && inputs.lane == 'try')`. The `robot` job's `if`: not the weekly keep-on schedule (as today), not `evaluate-try`, and not a by-hand run with `lane == 'try'`.

Run: `npx vitest run runner/workflow.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the docs**

- `docs/deploy.md`, "The robot": the second job, the event `evaluate-try`, the secret `CLAUDE_CODE_OAUTH_TOKEN_BACKUP` (`claude setup-token` on the second subscription; it lasts a year), and the deploy order: migration 0039 first, then the secret, then the code. The restart: an open teacher page or try page starts its lane's robot again 15 minutes after a stop, after a usage limit 60 minutes for the teachers' robot and 15 for the Quick Try robot, and never after a refused login; "Pornește robotul" stays for when that did not work.
- `docs/superpowers/plans/plan-3b-followups.md`, "Still written for the timer": drop Setări's usage-limit text ("continuă mai târziu" is true again).
- `server/AGENTS.md`: one paragraph: the lanes (`LANE_ROW`, `laneRowSql`, `laneWorkSql`), the save check by the test's lane, `?lane=try`, `claimRobotRestart`, `laneHasWork`, `restartIfStopped`.
- `runner/AGENTS.md`: `runTry.ts`, `session.ts`, `failover.ts`, `QE_LANE`, and the backup rules.
- `AGENTS.md` Rules: one line: Quick Try work runs only on the `try` lane's robot; a new robot path for a Quick Try test starts that lane. In the line "Every path that makes work for the robot starts it": an open teacher or try page also starts its lane again after a stop (`restartIfStopped`).

- [ ] **Step 4: Run the whole suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add .github/workflows/evaluate.yml runner/workflow.test.ts docs/deploy.md server/AGENTS.md runner/AGENTS.md AGENTS.md docs/superpowers/plans/plan-3b-followups.md
git commit -m "Add the Quick Try robot's GitHub job and its docs"
```

---

### Task 7: A real usage-limit output (with the user)

This task needs a person: it cannot run in CI.

- [ ] **Step 1:** Ask the user for a moment when one Claude account is at its limit (or a token of a used-up plan). Run the pinned Claude Code (2.1.294) once with that token, exactly as `claudeArgs` builds the call, and save its stdout and exit code.
- [ ] **Step 2:** Replace `runner/fixtures/claude-usage-limit.json` with the real output (no token in it), and fix `runner/fixtures/README.md` ("made by hand" becomes the date and the version). Note how long the call took before it exited, and whether the output names the time the limit ends: if it does, tell the user, since `RESTART_AFTER_LIMIT_MS.main` could then follow it.
- [ ] **Step 3:** Run `npx vitest run runner/claude.test.ts`. If `isUsageLimit` does not match, change it so the real output matches, with a test.
- [ ] **Step 4:** Commit by path: `runner/fixtures/claude-usage-limit.json runner/fixtures/README.md runner/claude.ts runner/claude.test.ts`.

The `try-robot` job goes live only after this task.

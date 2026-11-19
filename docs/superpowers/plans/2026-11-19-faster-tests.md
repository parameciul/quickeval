# Faster Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `npm test` from about 237 s down to about 50 s on the development PC, and stop it from growing again with each new migration, table and test file.

**Architecture:** The server and runner tests run against an in-process SQLite (`node:sqlite`) that acts as D1, and a `Map` that acts as R2, in place of the workerd engine that `getPlatformProxy` starts. A small "d1" Vitest project keeps the real workerd engine for the tests that depend on D1 itself (rows read, migrations) and for a parity test that runs the same checks on both engines. The web project moves to the `vmThreads` pool, and the two longest web test files are split so no single file sets the floor of the run.

**Tech Stack:** Vitest 5, Node 24 (`node:sqlite`, SQLite 3.53.3), wrangler `getPlatformProxy` (workerd), jsdom, React Testing Library.

**Spec:** none. The analysis below is the spec.

---

## Analysis (measured 2026-11-19, Windows 11, 16 cores, `maxWorkers: 8`)

### Baseline

| Measure | Value |
|---|---|
| `npm test` wall time | **237 s** |
| Test files / tests | 214 / 3329 |
| Sum of all test times | 1377 s |
| jsdom created | 116 times, 176 s (33 % of tracked time) |

Sum of test time by area:

| Area | Files | Tests | Test time | Tests > 1 s |
|---|---|---|---|---|
| server | 61 | 1074 | **914 s** | 279 |
| src/admin | 57 | 1114 | 222 s | 13 |
| runner | 18 | 255 | **198 s** | 90 |
| src/upload, src/try, src/landing, src/ui | 57 | 642 | 42 s | 0 |
| shared, scripts | 19 | 230 | < 1 s | 0 |

The server and runner tests are 81 % of all test time. The runner tests reach the server through `runner/test/robotWorld.ts`, so they pay the same cost.

### Why one server test is slow

One server file alone (`server/routes/upload.test.ts`, 47 tests): 21 s, about 400 ms per test. A bench of the test engine (`startTestApi` in `server/test/testApi.ts`):

| Step | Time |
|---|---|
| First `startTestApi()` of a file: start workerd + apply 36 migrations | 1160 ms |
| Each next `startTestApi()`: reset every table and the bucket | 57 ms |
| One D1 call (`SELECT 1`), through the proxy to workerd | **5 ms** |
| One API request (`GET /api/admin/classes`) | 33 ms |
| `makeClass` with 3 students / `makeTest` / `startTest` | 84 / 44 / 46 ms |

Every D1 call is an HTTP round trip to a separate workerd process. A test makes 50 to 100 calls (fixtures, the request, the checks), so it costs 300 to 500 ms alone, and twice that while the whole suite runs.

### Why the time keeps growing

The time grows faster than the number of tests, because three fixed costs grow with the code:

1. **Per file, about 1.2 s:** every server and runner file starts its own workerd and applies all migrations. Each new migration and each new file adds to it.
2. **Per test, about 57 ms:** the reset reads `sqlite_master` twice and runs a `DELETE` on every table. Each new table adds to it.
3. **Per test, 150 to 250 ms:** fixtures go through the HTTP API, 5 ms per D1 call. New features add queries (triggers, `promoteDue`, version rows) to the same fixtures.

The `maxWorkers: 8` limit (workerd memory) also stops the suite from using all 16 cores.

### The spike (not on the branch)

An in-process D1 on `node:sqlite` and an R2 on a `Map` (about 200 lines), switched on in `platformOfFile()`. The spike code is kept outside git in `.superpowers/tools/fastertests/` (`fastPlatform.spike.ts`, `spike-testApi.diff`, and `analyze.cjs`, the timing script Task 1 starts from):

| Run | Before | Spike | Result |
|---|---|---|---|
| `server/routes/upload.test.ts` | 21 s | **0.7 s** | 47/47 pass |
| server + runner + shared projects | 158 s | **27 s** | 1556/1556 pass |
| whole suite | 237 s | **92 s** | 3326/3326 pass |
| whole suite, 14 workers | – | 90 s | 3326/3326 pass |

Two warnings from the spike:

- `server/db/testsCost.test.ts` and `server/db/version.test.ts` pass on the fake, but the pass means nothing: they count `meta.rows_read`, which only D1 reports. They must stay on workerd.
- After the fake, the web project is the slowest part (about 66 s alone).

### Web tests

| Run of `--project web` | Wall | Result |
|---|---|---|
| default (`forks`, a new jsdom per file) | 66 s | all pass |
| `--no-isolate` | 45 s | 26 fail in 4 files (shared state) |
| `--pool=vmThreads` | **38 s** | 2 fail: `Cannot redefine property: location` |

`vmThreads` cannot run the server files: workerd's `main.js` fails with `module is not defined` in a VM. So only the web project moves to `vmThreads`.

The two longest files run their tests one after the other in one worker, so each sets a floor under the wall time: `src/admin/pages/PaperCheck.test.tsx` (100 tests, 38 s) and `src/admin/pages/TestPage.test.tsx` (153 tests, 35 s). With about 270 s of web test time over 8 workers (about 34 s each), a 38 s file is the critical path.

### Expected result

| Step | `npm test` wall (estimate) |
|---|---|
| Today | 237 s |
| Task 2 (fast D1/R2) | about 92 s (measured with the spike) |
| Task 4 (web on `vmThreads`) | about 55 s |
| Task 5 (split the two long files) | about 45 to 50 s |

Times on Linux CI will differ. Measure there after Task 4 (the CI log of `npm test`).

---

## Global Constraints

- Relative imports name the `.ts` or `.tsx` file. TypeScript runs with `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties.
- Code comments name no ticket or issue numbers. Commits have no AI attribution lines.
- Stage files by path, never `git add -A`.
- `npm test` must keep running every test, the real-engine ones included. No test is deleted to save time.
- Migration files keep one statement per `;` at a line end (`splitSql` depends on it).
- Run `npm run typecheck` and the whole suite before each commit of a task.

## Review Focus

1. **`batch()` atomicity:** in D1 a batch is one transaction. A batch whose third statement fails must leave the first two undone on the fake as on D1. (Task 2, test `rolls back a batch whose statement fails`.)
2. **A query that works on SQLite 3.53 but not on workerd's SQLite:** the fake hides it. The parity file runs every migration on both engines, and the d1 lane runs on every `npm test`. (Task 3.)
3. **Bound values D1 handles in its own way:** `true`/`false` become `1`/`0`, `undefined` is refused, a blob comes back as an array of numbers. (Task 2 tests, and the same checks in the Task 3 parity file.)
4. **Work a route leaves running (`waitUntil`) after a test:** with the fake, the next test's reset runs in the same tick. `dispose()` must still wait for it. (Task 2, keep `dispose()` as it is; test `a write left running does not reach the next test`.)
5. **jsdom state that leaks between files under `vmThreads`** (`localStorage`, `window.location` spies, fake timers). Run the web project three times after Task 4; all three must pass.

---

## File Structure

- `scripts/testTimes.mjs` (new): reads a Vitest JSON report and prints time per area, the slowest files and tests, and checks a budget.
- `server/test/fastD1.ts` (new): `fastD1(): D1Database` on `node:sqlite`.
- `server/test/fastR2.ts` (new): `fastR2(): R2Bucket` on a `Map`.
- `server/test/fastPlatform.test.ts` (new): the behaviour of the fake D1 and R2.
- `server/test/testApi.ts` (modify): picks the engine; lazy `wrangler` import; cached table list for the reset.
- `server/test/d1Parity.test.ts` (new): the same checks on both engines.
- `vitest.config.ts` (modify): the "d1" project, `vmThreads` for web, `maxWorkers`.
- `src/admin/Layout.test.tsx`, `src/admin/pages/AccountPage.test.tsx` (modify): the `window.location` spy.
- `src/admin/pages/PaperCheck.test.tsx`, `src/admin/pages/TestPage.test.tsx` (split into several files).
- `package.json` (modify): `test:times`, `test:d1`.
- `AGENTS.md`, `server/AGENTS.md` (modify): the two engines and the budget.

---

### Task 1: A timing report and a budget

**Files:**
- Create: `scripts/testTimes.mjs`
- Create: `scripts/testTimes.test.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `summarize(report: VitestJsonReport, root: string): { areas: AreaRow[]; files: FileRow[]; tests: TestRow[] }` and `overBudget(files: FileRow[], budgetSeconds: number): FileRow[]`, exported from `scripts/testTimes.mjs`. `AreaRow = { area: string; files: number; tests: number; seconds: number }`, `FileRow = { file: string; tests: number; seconds: number }`, `TestRow = { name: string; seconds: number }`. Area is the first path part, plus the second for `src/`.
- npm script `test:times`: `vitest run --reporter=default --reporter=json --outputFile.json=.vitest-times.json && node scripts/testTimes.mjs .vitest-times.json`. Add `.vitest-times.json` to `.gitignore`.

- [ ] **Step 1: Write the failing tests** in `scripts/testTimes.test.ts` (the "shared" project already includes `scripts/**/*.test.ts`):
  - `groups the time by area`: a report with `src/admin/a.test.tsx` (2 tests, 1000 ms + 500 ms) and `server/b.test.ts` (1 test, 2000 ms) gives areas `server` 2 s and `src/admin` 1.5 s, in that order.
  - `turns Windows paths into paths from the root`: a test file named `D:\\x\\server\\b.test.ts` with root `D:/x` gives file `server/b.test.ts`.
  - `names the files over the budget`: `overBudget` with budget 1.6 s returns only `server/b.test.ts`.
- [ ] **Step 2: Run** `npx vitest run scripts/testTimes.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `scripts/testTimes.mjs`. When run as a script it prints the area table, the 20 slowest files and the 20 slowest tests, then exits with 1 when a file is over the budget. The budget: 15 s per file (`TEST_FILE_BUDGET_SECONDS`, env var overrides it). Do not wire the budget into `npm test` or CI yet; Task 6 decides that.
- [ ] **Step 4: Run** `npx vitest run scripts/testTimes.test.ts`. Expected: PASS.
- [ ] **Step 5: Run** `npm run test:times` once and save the printed tables in the PR description as the "before" numbers.
- [ ] **Step 6: Commit** `scripts/testTimes.mjs scripts/testTimes.test.ts package.json .gitignore`: "Add a report of the test times".

### Task 2: An in-process D1 and R2 for the server and runner tests

**Files:**
- Create: `server/test/fastD1.ts`, `server/test/fastR2.ts`, `server/test/fastPlatform.test.ts`
- Modify: `server/test/testApi.ts:1-80` (engine choice, lazy import, reset)

**Interfaces:**
- Produces: `fastD1(): D1Database` and `fastR2(): R2Bucket` (cast through `unknown`; implement only what the code uses: `prepare`, `bind`, `first(column?)`, `all`, `run`, `raw({ columnNames? })`, `batch`, `exec`; R2 `put`, `get`, `head`, `list({ prefix, cursor, limit })`, `delete(key | keys)`).
- Produces: the env var `QE_TEST_DB`. `workerd` uses `getPlatformProxy` as today. Anything else (and unset) uses the fake. `startTestApi()` keeps its signature.

Decisions the fake must follow (all seen in the spike, which passed 1556/1556):

- One `DatabaseSync(':memory:')` per test file, `PRAGMA foreign_keys = ON` (D1 always enforces foreign keys).
- Cache prepared statements by SQL text.
- Bind: `true`/`false` to `1`/`0`; `undefined` throws an `Error` whose message starts with `D1_TYPE_ERROR`; `ArrayBuffer` and typed arrays to `Uint8Array`.
- Results: a `Uint8Array` column comes back as `number[]` (as D1 gives it).
- A statement with result columns uses `all()`, else `run()`. After it, `SELECT changes(), last_insert_rowid()` fills `meta.changes` and `meta.last_row_id`. `meta.rows_read` is `NaN`, so a test that counts rows on the fake fails loudly instead of passing for nothing.
- Every SQLite error is rethrown as `Error('D1_ERROR: ' + message)`.
- `batch()` runs `BEGIN`, every statement, `COMMIT`; on an error `ROLLBACK` and rethrow.
- `first(column)` on a missing column throws `D1_COLUMN_NOTFOUND`.
- R2 stores a copy of the bytes. `get()` gives `body` (a new `ReadableStream` each time), `arrayBuffer()`, `text()`, `json()`, `size`, `httpMetadata`, `customMetadata`, `writeHttpMetadata(headers)`. `list()` sorts by key and never truncates.

Changes in `server/test/testApi.ts`:

- Import `wrangler` only inside the `workerd` branch (`await import('wrangler')`), so the fake path does not load workerd at all.
- The reset keeps its logic, but reads the table list once after the migrations and keeps it (`tables: string[]`), instead of two `sqlite_master` reads per test.
- `dispose()` stays as it is.

- [ ] **Step 1: Write the failing tests** in `server/test/fastPlatform.test.ts`, on `fastD1()` and `fastR2()` directly:
  - `rolls back a batch whose statement fails`: create table `t (id INTEGER PRIMARY KEY, v TEXT UNIQUE)`; `batch([insert 'a', insert 'b', insert 'a'])` rejects with a message containing `UNIQUE constraint failed`; `SELECT COUNT(*) AS n FROM t` gives `0`.
  - `stores true as 1 and refuses undefined`: `bind(true).run()` stores `1`; `bind(undefined).run()` rejects with `/D1_TYPE_ERROR/`.
  - `gives a blob as an array of numbers`: insert `new Uint8Array([1, 2])`, `first('b')` gives `[1, 2]`.
  - `fills changes and last_row_id`: two inserts then `UPDATE t SET v = v` gives `meta.changes === 2`; an insert gives `meta.last_row_id` equal to the new id.
  - `enforces foreign keys`: an insert into a child table with a missing parent rejects with `/FOREIGN KEY constraint failed/`.
  - `reports no rows_read`: `Number.isNaN((await stmt.run()).meta.rows_read)` is `true`.
  - `first(column) of a missing column throws`.
  - R2 `keeps the bytes and the content type`: `put('k', new Uint8Array([1]), { httpMetadata: { contentType: 'image/jpeg' } })`; `get('k')` gives `size 1`, `httpMetadata.contentType 'image/jpeg'`, and `arrayBuffer()` twice gives the same bytes.
  - R2 `lists by prefix and deletes many keys`.
  - In an existing server route file, a test `a write left running does not reach the next test`: a route that writes in `waitUntil` is called with `api.fetch` (which does not wait); after `dispose()` and a new `startTestApi()`, the table is empty.
- [ ] **Step 2: Run** `npx vitest run server/test/fastPlatform.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `fastD1` and `fastR2` with the decisions above.
- [ ] **Step 4: Run** `npx vitest run server/test/fastPlatform.test.ts`. Expected: PASS.
- [ ] **Step 5: Change** `server/test/testApi.ts` as above.
- [ ] **Step 6: Run** `npx vitest run --project server --project runner --project shared`. Expected: every test passes except `server/db/testsCost.test.ts` and `server/db/version.test.ts` (they read `rows_read`, now `NaN`). Task 3 moves them. Expected wall time: under 35 s.
- [ ] **Step 7: Run** `QE_TEST_DB=workerd npx vitest run --project server --project runner --project shared`. Expected: all pass, as today.
- [ ] **Step 8: Commit** the five files: "Run the server tests on an in-process database".

### Task 3: A real-engine lane ("d1" project) and a parity test

**Files:**
- Modify: `vitest.config.ts`
- Create: `server/test/d1Parity.test.ts`
- Modify: `package.json` (`test:d1`)

**Interfaces:**
- Consumes: `fastD1()` (Task 2), `applyMigrations(db)` and `splitSql` (`server/test/testApi.ts`), `QE_TEST_DB`.
- Produces: a Vitest project named `d1`, `environment: 'node'`, `test.env: { QE_TEST_DB: 'workerd' }`, include `D1_FILES`. `D1_FILES` is one constant in `vitest.config.ts`: `server/db/testsCost.test.ts`, `server/db/version.test.ts`, `server/migrations.test.ts`, `server/usageMigration.test.ts`, `server/test/d1Parity.test.ts`. The `server` project excludes `D1_FILES`. `npm test` runs every project, so the lane runs on every `npm test` and in CI. `npm run test:d1` runs `vitest run --project d1`.

- [ ] **Step 1: Write** `server/test/d1Parity.test.ts`. It builds both engines (the workerd one through `getPlatformProxy` as `testApi.ts` does; the fake through `fastD1()`) and runs each check on both, with `describe.each([['workerd', ...], ['fast', ...]])`:
  - `applies every migration`: `applyMigrations(db)` resolves, and the table list from `sqlite_master` is the same on both engines.
  - `rolls back a failed batch`, `stores true as 1`, `refuses undefined`, `gives a blob as an array of numbers`, `fills changes`: the same assertions as in Task 2, so a difference between the engines fails here.
- [ ] **Step 2: Change** `vitest.config.ts` as in Interfaces.
- [ ] **Step 3: Run** `npm run test:d1`. Expected: PASS; `testsCost` and `version` pass again.
- [ ] **Step 4: Run** `npm test`. Expected: all pass. Note the wall time (expected about 90 s).
- [ ] **Step 5: Commit** `vitest.config.ts server/test/d1Parity.test.ts package.json`: "Keep a real D1 lane for the tests that need it".

### Task 4: The web tests on `vmThreads`

**Files:**
- Modify: `vitest.config.ts` (web project only)
- Modify: `src/admin/Layout.test.tsx:181`, `src/admin/pages/AccountPage.test.tsx:81`

**Interfaces:**
- Produces: the web project gets `pool: 'vmThreads'` and `vmMemoryLimit: '1024MB'` (check the option name and where it goes in the Vitest 5 docs first). The node projects keep the default pool: workerd cannot load in a VM.

- [ ] **Step 1: Change** the web project in `vitest.config.ts`.
- [ ] **Step 2: Run** `npx vitest run --project web`. Expected: 2 fail with `Cannot redefine property: location` (`Layout.test.tsx` "logs out from the account menu", `AccountPage.test.tsx` "logs out").
- [ ] **Step 3: Fix** the two tests: in place of `vi.spyOn(window, 'location', 'get')`, use `vi.stubGlobal('location', { ...window.location, assign })` and `vi.unstubAllGlobals()` after the test. If the page reads `window.location` and not `location`, stub that one the same way. The assertions stay as they are.
- [ ] **Step 4: Run** `npx vitest run --project web` three times. Expected: all pass each time; wall about 38 s.
- [ ] **Step 5: Run** `npm test`. Expected: all pass, wall about 55 s.
- [ ] **Step 6: Commit** the three files: "Run the web tests on vmThreads".

### Task 5: Split the two longest web test files

**Files:**
- Split `src/admin/pages/PaperCheck.test.tsx` (100 tests, 38 s) by its top-level `describe` blocks: `PaperCheck.points.test.tsx` (line 118, "the points to check on the paper page"), `PaperCheck.zoom.test.tsx` ("the zoom of a page" and "the border of the answer to check"), `PaperCheck.phone.test.tsx` (the three phone and box blocks).
- Split `src/admin/pages/TestPage.test.tsx` (153 tests, 35 s): `TestPage.test.tsx` keeps `describe('TestPage')`; `TestPage.stages.test.tsx` ("stages", "Verificare", "started by mistake"); `TestPage.evaluation.test.tsx` ("evaluation"); `TestPage.subject.test.tsx` ("subject", "uploads switch").
- Shared helpers and fixtures at the top of each file move to `src/admin/pages/paperCheckTestKit.tsx` and `src/admin/pages/testPageTestKit.tsx`.

- [ ] **Step 1: Move** the blocks and their helpers. No test is changed, added or removed.
- [ ] **Step 2: Check** the test count: `npx vitest run src/admin/pages/PaperCheck src/admin/pages/TestPage` gives 253 tests, as before.
- [ ] **Step 3: Run** `npm run test:times`. Expected: no web file over 15 s.
- [ ] **Step 4: Run** `npm test`. Expected: all pass; wall under 50 s.
- [ ] **Step 5: Commit** the new and changed files: "Split the two longest page tests".

### Task 6: Workers, budget and docs

**Files:**
- Modify: `vitest.config.ts` (`maxWorkers` and its comment)
- Modify: `AGENTS.md` (Commands), `server/AGENTS.md` (tests)
- Optional: `.github/workflows/ci.yml`

- [ ] **Step 1: Measure** `npm test` with `--maxWorkers=8`, `12` and `16`, twice each. Keep the lowest number that is within 5 % of the best. Write in the comment why (the old reason, workerd memory, now applies only to the d1 lane).
- [ ] **Step 2: Docs.** In `AGENTS.md` Commands: `npm run test:times` (the time report) and `npm run test:d1` (the real-engine lane). In `server/AGENTS.md`: the server tests run on an in-process SQLite by default; `QE_TEST_DB=workerd` runs them on the real engine; a test that counts `rows_read` or depends on D1 itself goes in `D1_FILES`; run `QE_TEST_DB=workerd npm run test:server` before a push that adds a migration or a new kind of SQL.
- [ ] **Step 3: Decide** with the user whether CI runs `node scripts/testTimes.mjs` with the budget (a slow file then fails CI) or only prints the report.
- [ ] **Step 4: Run** `npm run typecheck` and `npm test`. Expected: all pass.
- [ ] **Step 5: Commit**: "Set the test workers and document the two engines".

---

## Later, not in this plan

- Build the schema once per worker (a migrated template), not once per file. With the fake, applying 36 migrations takes milliseconds, so this is worth it only if `npm run test:times` shows it.
- Fixtures straight in SQL in place of HTTP calls (`makeClass`, `makeTest`, `startTest`). With the fake, a call costs microseconds, so the gain is small now.
- Profile the slow web pages (`PaperPage`, `ClassPage`, `NewTestPage`, `Layout`): each test renders a whole page through React Query.

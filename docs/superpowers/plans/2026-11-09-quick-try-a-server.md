# MQGrader: Quick Try, part A (the server) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **The last task (Check, live database, push) must run in the main session, not in a subagent:** every outward step (the live migration, the push) needs the user's explicit yes.

**Goal:** The server side of Quick Try: a visitor with no account makes a try (`POST /api/try`, Turnstile, the daily limits), uploads the test, the barem (or asks the robot for one) and the student's pages through the try's link, starts the grading, and reads and corrects the graded paper through the same link. No page changes yet: part B (the try's page) and part C (the landing page and the cleanup) build on this.

**Architecture:** Migration 0026 adds `teachers.quick_try`, `tests.quick_try` and the `quick_tries` table. Each try is a hidden guest teacher (disabled, never an account) with one class `PROBA`, one student `Elev`, one open test and one paper, made in one D1 batch whose first INSERT checks the limits in its SQL (`createQuickTry`). `/api/try/<token>` finds the try by its token's hash, puts the guest teacher in `c.var.teacher`, and mounts the teacher API's own `testRoutes` and `submissionRoutes` behind an allow-list (`ALLOWED`), plus the try's own routes for the paper and the start. A Quick Try test is never a print job and never asks for a class analysis, and one try makes bounded robot work: one barem generation and at most `QUICK_TRY_FILE_CHANGES` (6) file changes, checked in the writes' SQL.

**Tech Stack:** Node 24, TypeScript, Hono on Cloudflare Pages with D1 and R2, zod, Vitest 5. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-09-quick-try-design.md` (approved by the user on 2026-11-09; §7 "Build phases and data model" was added while planning). Root `AGENTS.md`, `server/AGENTS.md` and `runner/AGENTS.md` hold the project rules.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English. The API reports errors as `{ error, message }`.
- One migration, `migrations/0026_quick_try.sql` (one statement per `;` at a line end, no `;` inside strings or comments). It runs on the live database **before** the code reaches `main` (`docs/deploy.md`): the last task asks the user first.
- Every teacher query is scoped by the teacher's id; the try's routes reach only the try's guest teacher. A write checks its own rules inside its SQL (the limits too). Every path that makes robot work starts the robot. At most 15 D1 queries and 10 ms of CPU per request.
- The limits, copied from the spec: `QUICK_TRY_IP_LIMIT = 10` tries per IP per Bucharest day, `QUICK_TRY_DAILY_LIMIT = 30` tries per Bucharest day in total, a try's link works `QUICK_TRY_DAYS = 7` days. An administrator skips Turnstile and the limits and is not counted. A try whose barem, exercise list or paper failed gives its IP place back, not its daily place. The limit message promises one free class test with an account, never "unlimited".
- Do not run Prettier or any formatter.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A`.
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root, on the branch `feature/quick-try` (made from `main` in "Before Task 1"). Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy. If only tests of those three files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts runner/api.test.ts` alone; the full run then counts as passed when its failed and passed tests add up to the expected passed number.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; write exactly the content given in its place.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/protoqt/q1` … `refs/protoqt/q5`, one per task, on `refs/protoqt/qbase` (the same files as `main` at `f8c2d14`). After Task N, `git diff --stat refs/protoqt/qN HEAD -- . ':!docs'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`).

## Rulings made while planning

Settled while building the prototype on 2026-11-09.

1. **A guest teacher per try** (spec §7): the app's own test, review and results code serves the try unchanged. The guest is `status = 'disabled'` (no login), `demo = 0` (the demo limits do not apply), with an email that cannot be real (`try-<random>@quick-try.invalid`). Its counters (`tests_evaluated`, `papers_graded`) grow and are deleted with it.
2. **The class is `PROBA`, not "Încercare":** a test code takes the class name and allows only `A-Z0-9` (`PROBA-26T1`). The guest teacher is named "Încercare"; the test is "Încercare rapidă".
3. **No print job:** `saveTestFile` gives the test an upload token (`COALESCE(upload_token, ?)`), so `needsPrintSql` checks `quick_try = 0` instead of relying on the token. The token is harmless: the try's one paper already has a session, so the student app answers "other device".
4. **No class analysis:** `askForAnalysis`, `askAnalysisAfterCheck` and `NEEDS_ANALYSIS` check `quick_try = 0`; a graded try then ends as `done` by `finishTests`, like a test with no analysis asked.
5. **The IP hash is `sha256Hex(clientIpKey(c))`**, the hash the sign-up limit already uses (the spec first said an HMAC; §4 was corrected).
6. **The give-back is read, not written:** the IP count leaves out tries whose barem request, exercise list or paper failed (`GAVE_BACK`), so no robot path needs a refund write. The daily count keeps them.
7. **"Pornește corectarea" is the try's own route** (`POST /api/try/<token>/start`), not the teacher API's `evaluate` (which can schedule): it marks a robot barem checked when the page names its `filesVersion`, then runs `startEvaluationNow`. `evaluationBlocker` (exported from `server/routes/tests.ts`) says what is missing.
8. **The allow-list** is GET the test and its files, PUT the test or barem file, POST `barem/generate`, POST `exercise-list/accept`, GET the paper and its files, PATCH an item, PATCH the evaluation. Everything else of the teacher API answers 404 through a try's link (regrade, retry, reset, results links, the class report, print, CES, archive, delete, schedule).
9. **An expired try** answers 410 `expired` on every route but `GET /api/try/<token>`, which says `expired: true` so the page can say so.
10. **Administrator** means the logged-in teacher's role (the session cookie, or `DEV_TEACHER_EMAIL` on localhost), read by `optionalTeacher`; never a value from the browser.
11. **Bounded robot work per try** (the spec's anti-goal "unbounded robot work from anonymous visitors"): the daily cap counts tries, not robot runs, and three loops inside one try would each start Claude again (a new barem request, a new test file while a robot barem waits for its check, a new barem while the exercise list has a problem). So `requestBarem` takes a Quick Try test only with no barem and no request before (once per try), and `saveTestFile` takes at most `QUICK_TRY_FILE_CHANGES = 6` file changes per Quick Try test (`files_version`), both in their UPDATE's WHERE. The routes answer 409 `quick_try_barem` and `quick_try_files`; a refused file is removed from R2.
12. **The test's upload token is visible through the link** (`GET /tests/:code` returns `uploadToken`): harmless (ruling 3), but part B's page must never show a student QR code or upload link.

## Review Focus

1. Two tries at the same moment from one IP cannot both pass the 10th place: the count is inside the INSERT's SQL in one batch (`createQuickTry`); tested by the refusal tests in Task 2 (a batch is one transaction in D1).
2. The day boundary is Bucharest midnight, not UTC midnight: Task 2's "counts the IP limit per Bucharest day" makes 10 tries at 21:30 UTC and one at 22:30 UTC on 2026-11-09.
3. An expired try refuses writes, not only shows "expired": Task 4's "refuses everything else with 410".
4. A try's link never reaches a real teacher's test or another try's paper: Task 4's "never reaches a real teacher's test", "is not another try's", and the review test's last line.
5. A try never changes what a real account sees: no print job, no class analysis, not in the accounts list (Task 1), and its robot run makes no print and no analysis (Task 4's robot test).
6. One try cannot make the robot work without end: Task 5's "runs once" and "stop after 6"; a real teacher's test keeps its unlimited file changes ("do not limit a real teacher's test").

---

### Before Task 1: The branch

- [ ] **Step 1: Make the branch and check the prototype**

Run: `git switch -c feature/quick-try main` and `git log --oneline -1`
Expected: HEAD `f8c2d14 Merge pull request #58 from parameciul/feature/ces-variant` (or a later `main`; then the prototype comparisons below may also show the files `main` changed since).

Run: `git rev-parse --verify refs/protoqt/q4`
Expected: a commit id. If the ref does not exist, stop and ask: the prototype's refs come with this plan.

- [ ] **Step 2: Bring the design and this plan onto the branch**

Run: `git checkout claude/quick-try-project-031890 -- docs/superpowers/specs/2026-11-09-quick-try-design.md docs/superpowers/plans/2026-11-09-quick-try-a-server.md`
Then: `git commit -m "Add the Quick Try design and the plan for its server part" -- docs/superpowers/specs/2026-11-09-quick-try-design.md docs/superpowers/plans/2026-11-09-quick-try-a-server.md`
Expected: one commit with the two files.

### Task 1: Keep tries out of print jobs, class analyses and the accounts list

Migration 0026, and the four places that must leave a Quick Try test or guest teacher out.

**Files:**
- Create: `migrations/0026_quick_try.sql`, `server/db/quickTryRules.test.ts`
- Modify: `server/db/variant.ts`, `server/db/runner.ts`, `server/db/lifecycle.ts`, `server/db/accounts.ts`
- Test: `server/db/quickTryRules.test.ts`

**Interfaces:**
- Consumes: `NEEDS_PRINT`, `NEEDS_ANALYSIS`, `askForAnalysis`, `askAnalysisAfterCheck`, `listAccounts`; the fixtures `addEvaluation`, `addSubmission`, `addTestFiles`, `makeClass`, `makeTest`, `testIdOf`.
- Produces: the columns `teachers.quick_try`, `tests.quick_try` (0 or 1) and the table `quick_tries (id, teacher_id UNIQUE, token_hash UNIQUE, day, ip_hash, by_admin, created_at, expires_at)` with the index `quick_tries_by_day_ip`.

- [ ] **Step 1: Create `server/db/quickTryRules.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listAccounts } from './accounts.ts';
import { askAnalysisAfterCheck, askForAnalysis } from './lifecycle.ts';
import { NEEDS_ANALYSIS, NEEDS_PRINT } from './runner.ts';
import { addEvaluation, addSubmission, addTestFiles, makeClass, makeTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// A Quick Try test (tests.quick_try = 1) is never a print job and never asks
// for a class analysis; a guest teacher (teachers.quick_try = 1) is not an account.

let api: TestApi;
let code: string;
let studentId: number;

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2', ['Pop Ion']);
  studentId = cls.studentIds[0]!;
  code = await makeTest(api, cls.id);
});

afterEach(async () => {
  await api.dispose();
});

const markQuickTry = () => api.db.prepare('UPDATE tests SET quick_try = 1 WHERE code = ?').bind(code).run();
const ids = async (condition: string) =>
  (await api.db.prepare(`SELECT t.id FROM tests t WHERE ${condition}`).all<{ id: number }>()).results.map((row) => row.id);
const analysisStatus = async () =>
  (await api.db.prepare('SELECT analysis_status FROM tests WHERE code = ?').bind(code).first<{ analysis_status: string }>())!.analysis_status;

// The test in evaluation with one graded paper and nothing left to check.
async function gradedAndChecked(): Promise<number> {
  await addTestFiles(api, code);
  await api.db.prepare("UPDATE tests SET status = 'evaluating' WHERE code = ?").bind(code).run();
  const submissionId = await addSubmission(api, code, studentId, { status: 'graded', files: 1 });
  await addEvaluation(api, submissionId);
  return submissionId;
}

describe('the print job', () => {
  it('is made for a class test with a test file', async () => {
    await addTestFiles(api, code, ['test']);
    expect(await ids(NEEDS_PRINT)).toEqual([await testIdOf(api, code)]);
  });

  it('is never made for a Quick Try test', async () => {
    await addTestFiles(api, code, ['test']);
    await markQuickTry();
    expect(await ids(NEEDS_PRINT)).toEqual([]);
  });
});

describe('the class analysis', () => {
  it('is asked for a class test that is fully checked', async () => {
    await gradedAndChecked();
    await askForAnalysis(api.db).run();
    expect(await analysisStatus()).toBe('requested');
  });

  it('is not asked for a Quick Try test that is fully checked', async () => {
    await gradedAndChecked();
    await markQuickTry();
    await askForAnalysis(api.db).run();
    expect(await analysisStatus()).toBe('none');
  });

  it('is not asked after the last check of a Quick Try paper', async () => {
    const submissionId = await gradedAndChecked();
    await markQuickTry();
    expect(await askAnalysisAfterCheck(api.db, api.teacherId, submissionId, '2026-11-09T10:00:00.000Z')).toBe(false);
    expect(await analysisStatus()).toBe('none');
  });

  it('is not robot work for a Quick Try test, even when requested', async () => {
    await gradedAndChecked();
    await api.db.prepare("UPDATE tests SET analysis_status = 'requested' WHERE code = ?").bind(code).run();
    expect(await ids(NEEDS_ANALYSIS)).toEqual([await testIdOf(api, code)]);
    await markQuickTry();
    expect(await ids(NEEDS_ANALYSIS)).toEqual([]);
  });
});

describe('the accounts list', () => {
  it('leaves out guest teachers', async () => {
    const guest = await api.addTeacher('try-abc@quick-try.invalid', 'Încercare');
    await api.db.prepare("UPDATE teachers SET quick_try = 1, status = 'disabled' WHERE id = ?").bind(guest).run();
    const accounts = await listAccounts(api.db);
    expect(accounts.map((account) => account.id)).toEqual([api.teacherId]);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run server/db/quickTryRules.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  5 failed | 2 passed (7)`: `D1_ERROR: no such column: quick_try`. The two tests that pass at RED are guards: a class test is still a print job and still asks for its analysis.

- [ ] **Step 3: Create `migrations/0026_quick_try.sql`**

```sql
-- Quick Try (spec: docs/superpowers/specs/2026-11-09-quick-try-design.md).
-- Each try is a hidden guest teacher (teachers.quick_try = 1) with its own
-- class, student, test (tests.quick_try = 1) and paper. tests.quick_try is a
-- flat flag so the robot's conditions keep tries out of the print job and the
-- class analysis. quick_tries holds one row per try: the link token's hash,
-- the Bucharest day and the IP hash that the daily limits count, and whether
-- an administrator made it.
ALTER TABLE teachers ADD COLUMN quick_try INTEGER NOT NULL DEFAULT 0 CHECK (quick_try IN (0, 1));
ALTER TABLE tests ADD COLUMN quick_try INTEGER NOT NULL DEFAULT 0 CHECK (quick_try IN (0, 1));
CREATE TABLE quick_tries (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL UNIQUE REFERENCES teachers(id),
  token_hash TEXT NOT NULL UNIQUE,
  day TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  by_admin INTEGER NOT NULL DEFAULT 0 CHECK (by_admin IN (0, 1)),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX quick_tries_by_day_ip ON quick_tries (day, ip_hash);
```

- [ ] **Step 4: Edit `server/db/variant.ts`**

Find this block:

```ts
// A draft or open test (alias `t`) with an upload link and a test file of the
// variant whose print PDF is not made yet. A flat condition: the print writes
// pass the table name for `t`.
```

Replace it with:

```ts
// A draft or open test (alias `t`) with an upload link and a test file of the
// variant whose print PDF is not made yet. A Quick Try test is never printed. A flat condition: the print writes
// pass the table name for `t`.
```

- [ ] **Step 5: Edit `server/db/variant.ts`**

Find this block:

```ts
  const c = columns(variant);
  return `${t}.status IN ('draft', 'open') AND ${t}.upload_token IS NOT NULL AND ${t}.${c('test_file_key')} IS NOT NULL AND ${t}.${c('print_status')} = 'none'`;
}
```

Replace it with:

```ts
  const c = columns(variant);
  return `${t}.status IN ('draft', 'open') AND ${t}.quick_try = 0 AND ${t}.upload_token IS NOT NULL AND ${t}.${c('test_file_key')} IS NOT NULL AND ${t}.${c('print_status')} = 'none'`;
}
```

- [ ] **Step 6: Edit `server/db/runner.ts`**

Find this block:

```ts
// least one graded upload to analyze.
export const NEEDS_ANALYSIS = `t.status = 'evaluating' AND t.analysis_status = 'requested'
  AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status IN ('submitted', 'grading'))
```

Replace it with:

```ts
// least one graded upload to analyze.
export const NEEDS_ANALYSIS = `t.status = 'evaluating' AND t.quick_try = 0 AND t.analysis_status = 'requested'
  AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status IN ('submitted', 'grading'))
```

- [ ] **Step 7: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
// The class analysis is asked for only when nothing is left for the teacher to
// check or decide. Runs just before finishTests, so a test that is fully
// checked stays in evaluation until the robot writes the analysis.
```

Replace it with:

```ts
// The class analysis is asked for only when nothing is left for the teacher to
// check or decide, and never for a Quick Try test (one paper, no class). Runs just before finishTests, so a test that is fully
// checked stays in evaluation until the robot writes the analysis.
```

- [ ] **Step 8: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
    `UPDATE tests SET analysis_status = 'requested', analysis_attempts = 0
     WHERE status = 'evaluating' AND analysis_status = 'none' AND ${fullyChecked('tests')}`,
  );
```

Replace it with:

```ts
    `UPDATE tests SET analysis_status = 'requested', analysis_attempts = 0
     WHERE status = 'evaluating' AND quick_try = 0 AND analysis_status = 'none' AND ${fullyChecked('tests')}`,
  );
```

- [ ] **Step 9: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
       WHERE teacher_id = ? AND id = (SELECT test_id FROM submissions WHERE id = ?)
         AND status IN ('evaluating', 'done') AND archived = 0 AND analysis_status = 'none' AND ${fullyChecked('tests')}
       RETURNING id`,
```

Replace it with:

```ts
       WHERE teacher_id = ? AND id = (SELECT test_id FROM submissions WHERE id = ?)
         AND status IN ('evaluating', 'done') AND archived = 0 AND quick_try = 0 AND analysis_status = 'none' AND ${fullyChecked('tests')}
       RETURNING id`,
```

- [ ] **Step 10: Edit `server/db/accounts.ts`**

Find this block:

```ts
// Pending accounts first, then by name. A pending account whose email is not
// confirmed yet is not shown: nobody may approve it.
export async function listAccounts(db: D1Database): Promise<Account[]> {
```

Replace it with:

```ts
// Pending accounts first, then by name. A pending account whose email is not
// confirmed yet is not shown: nobody may approve it. Quick Try's guest teachers
// are not accounts.
export async function listAccounts(db: D1Database): Promise<Account[]> {
```

- [ ] **Step 11: Edit `server/db/accounts.ts`**

Find this block:

```ts
      `SELECT ${TEACHER_COLUMNS}, t.status, t.created_at, t.approved_at FROM teachers t
       WHERE t.status <> 'pending' OR t.email_confirmed_at IS NOT NULL
       ORDER BY CASE t.status WHEN 'pending' THEN 0 ELSE 1 END, t.name COLLATE NOCASE, t.id`,
```

Replace it with:

```ts
      `SELECT ${TEACHER_COLUMNS}, t.status, t.created_at, t.approved_at FROM teachers t
       WHERE t.quick_try = 0 AND (t.status <> 'pending' OR t.email_confirmed_at IS NOT NULL)
       ORDER BY CASE t.status WHEN 'pending' THEN 0 ELSE 1 END, t.name COLLATE NOCASE, t.id`,
```

- [ ] **Step 12: Run the test to see it pass**

Run: `npx vitest run server/db/quickTryRules.test.ts`
Expected: PASS, `Tests  7 passed (7)`.

- [ ] **Step 13: Typecheck and run all tests**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  140 passed | 1 skipped (141)`, `Tests  2204 passed | 3 skipped (2207)`.

- [ ] **Step 14: Commit**

```bash
git add migrations/0026_quick_try.sql server/db/quickTryRules.test.ts server/db/variant.ts server/db/runner.ts server/db/lifecycle.ts server/db/accounts.ts
git commit -m "Keep Quick Try tests out of print jobs, class analyses and the accounts list"
```

Check: `git diff --stat refs/protoqt/q1 HEAD -- . ':!docs'` prints nothing.

### Task 2: Make a try in one batch, with the limits in its SQL

**Files:**
- Create: `shared/quickTry.ts`, `server/db/quickTry.ts`, `server/db/quickTry.test.ts`
- Test: `server/db/quickTry.test.ts`

**Interfaces:**
- Consumes: Task 1's tables; `schoolYearOf` (`shared/schoolYear.ts`), `buildTestCode` (`shared/tests.ts`).
- Produces: in `shared/quickTry.ts`: `QUICK_TRY_IP_LIMIT = 10`, `QUICK_TRY_DAILY_LIMIT = 30`, `QUICK_TRY_DAYS = 7`, `QUICK_TRY_GUEST = 'Încercare'`, `QUICK_TRY_CLASS = 'PROBA'`, `QUICK_TRY_STUDENT = 'Elev'`, `QUICK_TRY_TITLE = 'Încercare rapidă'`, `isQuickTryToken(raw: string): boolean` (32 characters of a-z2-7), `bucharestDay(date: Date): string` ("YYYY-MM-DD"). In `server/db/quickTry.ts`: `NewQuickTry { tokenHash; ipHash; byAdmin: boolean; email; sessionHash; resultToken; now }`, `QuickTryRefusal = 'ip_limit' | 'daily_limit'`, `QuickTryRow { teacherId; code; submissionId; sessionHash; createdAt; expiresAt }` (Task 4 adds `testId`, `schoolYear`, `studentId`), `createQuickTry(db, input): Promise<{ teacherId: number; code: string } | QuickTryRefusal>`, `dailyLimitReached(db, now: string): Promise<boolean>`, `findQuickTry(db, tokenHash): Promise<QuickTryRow | null>`.

- [ ] **Step 1: Create `server/db/quickTry.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bucharestDay, QUICK_TRY_DAILY_LIMIT, QUICK_TRY_IP_LIMIT } from '../../shared/quickTry.ts';
import { createQuickTry, dailyLimitReached, findQuickTry, type NewQuickTry } from './quickTry.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let made = 0;

beforeEach(async () => {
  api = await startTestApi();
});

afterEach(async () => {
  await api.dispose();
});

const NOW = '2026-11-09T10:00:00.000Z';

// A new try's input; each call gets its own token and email.
function input(overrides: Partial<NewQuickTry> = {}): NewQuickTry {
  made += 1;
  return {
    tokenHash: `token-hash-${made}`,
    ipHash: 'ip-a',
    byAdmin: false,
    email: `try-${made}@quick-try.invalid`,
    sessionHash: `session-hash-${made}`,
    resultToken: `result${String(made).padStart(18, 'a')}`,
    now: NOW,
    ...overrides,
  };
}

async function fill(count: number, overrides: Partial<NewQuickTry> = {}): Promise<void> {
  for (let i = 0; i < count; i++) {
    const made = await createQuickTry(api.db, input(overrides));
    if (typeof made === 'string') throw new Error(`refused: ${made}`);
  }
}

// Marks the paper of the most recent try as failed for good.
const failLastPaper = () =>
  api.db
    .prepare("UPDATE submissions SET status = 'failed' WHERE test_id = (SELECT MAX(t.id) FROM tests t WHERE t.quick_try = 1)")
    .run();

describe('bucharestDay', () => {
  it('names the day in Romania, which starts before UTC midnight', () => {
    expect(bucharestDay(new Date('2026-11-09T21:59:59.000Z'))).toBe('2026-11-09');
    expect(bucharestDay(new Date('2026-11-09T22:00:00.000Z'))).toBe('2026-11-10');
    expect(bucharestDay(new Date('2026-07-09T20:59:59.000Z'))).toBe('2026-07-09');
    expect(bucharestDay(new Date('2026-07-09T21:00:00.000Z'))).toBe('2026-07-10');
  });
});

describe('createQuickTry', () => {
  it('makes a hidden guest teacher with one class, student, open test and paper', async () => {
    const created = await createQuickTry(api.db, input({ tokenHash: 'th-1', sessionHash: 'sh-1' }));
    expect(created).toEqual({ teacherId: expect.any(Number), code: 'PROBA-26T1' });
    const { teacherId } = created as { teacherId: number };
    const teacher = await api.db.prepare('SELECT name, status, quick_try, demo, role FROM teachers WHERE id = ?').bind(teacherId).first();
    expect(teacher).toEqual({ name: 'Încercare', status: 'disabled', quick_try: 1, demo: 0, role: 'teacher' });
    const test = await api.db
      .prepare(
        `SELECT t.status, t.quick_try, t.title, t.started_at, t.upload_token, c.name AS class_name, c.school_year
         FROM tests t JOIN classes c ON c.id = t.class_id WHERE t.teacher_id = ?`,
      )
      .bind(teacherId)
      .first();
    expect(test).toEqual({
      status: 'open',
      quick_try: 1,
      title: 'Încercare rapidă',
      started_at: NOW,
      upload_token: null,
      class_name: 'PROBA',
      school_year: 2026,
    });
    const paper = await api.db
      .prepare(
        `SELECT s.status, st.full_name, e.active FROM submissions s JOIN students st ON st.id = s.student_id
         JOIN enrollments e ON e.student_id = st.id WHERE st.teacher_id = ?`,
      )
      .bind(teacherId)
      .first();
    expect(paper).toEqual({ status: 'uploading', full_name: 'Elev', active: 1 });
    expect(await findQuickTry(api.db, 'th-1')).toEqual({
      teacherId,
      code: 'PROBA-26T1',
      submissionId: expect.any(Number),
      sessionHash: 'sh-1',
      createdAt: NOW,
      expiresAt: '2026-11-16T10:00:00.000Z',
    });
  });

  it('finds no try for an unknown token', async () => {
    expect(await findQuickTry(api.db, 'nothing')).toBeNull();
  });

  it(`refuses the ${QUICK_TRY_IP_LIMIT + 1}th try of one IP on one day, and inserts nothing`, async () => {
    await fill(QUICK_TRY_IP_LIMIT);
    const before = await api.db.prepare('SELECT COUNT(*) AS n FROM teachers').first<{ n: number }>();
    expect(await createQuickTry(api.db, input())).toBe('ip_limit');
    const after = await api.db.prepare('SELECT COUNT(*) AS n FROM teachers').first<{ n: number }>();
    expect(after!.n).toBe(before!.n);
    expect(await createQuickTry(api.db, input({ ipHash: 'ip-b' }))).toEqual(expect.objectContaining({ code: 'PROBA-26T1' }));
  });

  it('counts the IP limit per Bucharest day', async () => {
    await fill(QUICK_TRY_IP_LIMIT, { now: '2026-11-09T21:30:00.000Z' });
    expect(await createQuickTry(api.db, input({ now: '2026-11-09T21:45:00.000Z' }))).toBe('ip_limit');
    expect(typeof (await createQuickTry(api.db, input({ now: '2026-11-09T22:30:00.000Z' })))).toBe('object');
  });

  it('gives the IP its place back when a try failed', async () => {
    await fill(QUICK_TRY_IP_LIMIT);
    await failLastPaper();
    expect(typeof (await createQuickTry(api.db, input()))).toBe('object');
    expect(await createQuickTry(api.db, input())).toBe('ip_limit');
  });

  it(`refuses the ${QUICK_TRY_DAILY_LIMIT + 1}th try of the day, even after failures`, async () => {
    for (let i = 0; i < QUICK_TRY_DAILY_LIMIT; i++) await fill(1, { ipHash: `ip-${i}` });
    await failLastPaper();
    expect(await dailyLimitReached(api.db, NOW)).toBe(true);
    expect(await createQuickTry(api.db, input({ ipHash: 'ip-new' }))).toBe('daily_limit');
    expect(await dailyLimitReached(api.db, '2026-11-10T10:00:00.000Z')).toBe(false);
  });

  it('lets an administrator skip both limits without being counted', async () => {
    await fill(QUICK_TRY_IP_LIMIT);
    expect(typeof (await createQuickTry(api.db, input({ byAdmin: true })))).toBe('object');
    for (let i = 1; i < QUICK_TRY_DAILY_LIMIT - QUICK_TRY_IP_LIMIT; i++) await fill(1, { ipHash: `ip-${i}` });
    expect(await dailyLimitReached(api.db, NOW)).toBe(false);
    await fill(5, { byAdmin: true });
    expect(await dailyLimitReached(api.db, NOW)).toBe(false);
    await fill(1, { ipHash: 'ip-last' });
    expect(await dailyLimitReached(api.db, NOW)).toBe(true);
    expect(typeof (await createQuickTry(api.db, input({ byAdmin: true })))).toBe('object');
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run server/db/quickTry.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  no tests`: `Cannot find module '../../shared/quickTry.ts'`.

- [ ] **Step 3: Create `shared/quickTry.ts`**

```ts
// Quick Try: one free grading without an account (spec
// docs/superpowers/specs/2026-11-09-quick-try-design.md).

// Tries per IP address per Bucharest day (administrators are not counted).
export const QUICK_TRY_IP_LIMIT = 10;
// Tries per Bucharest day on the whole platform (administrators are not counted).
export const QUICK_TRY_DAILY_LIMIT = 30;
// A try's link works this many days.
export const QUICK_TRY_DAYS = 7;

// The guest teacher's name, class and student, and the test's title.
export const QUICK_TRY_GUEST = 'Încercare';
export const QUICK_TRY_CLASS = 'PROBA';
export const QUICK_TRY_STUDENT = 'Elev';
export const QUICK_TRY_TITLE = 'Încercare rapidă';

const QUICK_TRY_TOKEN = /^[a-z2-7]{32}$/;

// The secret part of a try's link: 32 characters from a-z and 2-7, longer than
// an upload or result token so the three cannot be confused.
export function isQuickTryToken(raw: string): boolean {
  return QUICK_TRY_TOKEN.test(raw);
}

// The calendar day in Romania, "YYYY-MM-DD": the daily limits start again at
// Bucharest midnight.
export function bucharestDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
```

- [ ] **Step 4: Create `server/db/quickTry.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import {
  bucharestDay,
  QUICK_TRY_CLASS,
  QUICK_TRY_DAILY_LIMIT,
  QUICK_TRY_DAYS,
  QUICK_TRY_GUEST,
  QUICK_TRY_IP_LIMIT,
  QUICK_TRY_STUDENT,
  QUICK_TRY_TITLE,
} from '../../shared/quickTry.ts';
import { schoolYearOf } from '../../shared/schoolYear.ts';
import { buildTestCode } from '../../shared/tests.ts';

// Quick Try's rows (spec §7): a hidden guest teacher with one class, one
// student, one open test and one paper, and the quick_tries row that names
// them by the link's token hash.

const DAY_MS = 24 * 60 * 60 * 1000;

// A try (alias q) whose grading failed for good gives its IP place back: its
// barem or exercise list failed, or its paper failed.
const GAVE_BACK = `EXISTS (SELECT 1 FROM tests gt WHERE gt.teacher_id = q.teacher_id
  AND (gt.barem_request = 'failed' OR gt.exercise_list_status = 'failed'
       OR EXISTS (SELECT 1 FROM submissions gs WHERE gs.test_id = gt.id AND gs.status = 'failed')))`;

// ?1 day, ?2 IP hash.
const IP_COUNT = `(SELECT COUNT(*) FROM quick_tries q WHERE q.day = ?1 AND q.ip_hash = ?2 AND q.by_admin = 0 AND NOT ${GAVE_BACK})`;
const DAY_COUNT = '(SELECT COUNT(*) FROM quick_tries q WHERE q.day = ?1 AND q.by_admin = 0)';

export interface NewQuickTry {
  tokenHash: string;
  ipHash: string;
  byAdmin: boolean;
  // The guest teacher's email: unique, never a real address.
  email: string;
  // The hash of the paper's session secret, and the paper's result token.
  sessionHash: string;
  resultToken: string;
  now: string;
}

export type QuickTryRefusal = 'ip_limit' | 'daily_limit';

export interface QuickTryRow {
  teacherId: number;
  code: string;
  submissionId: number;
  sessionHash: string;
  createdAt: string;
  expiresAt: string;
}

// Makes the try in one batch. The limits are checked in the first INSERT; the
// others read the guest teacher by its email, so when the first one is refused
// they insert nothing. An administrator's try skips the limits and is not counted.
export async function createQuickTry(db: D1Database, input: NewQuickTry): Promise<{ teacherId: number; code: string } | QuickTryRefusal> {
  const day = bucharestDay(new Date(input.now));
  const expiresAt = new Date(Date.parse(input.now) + QUICK_TRY_DAYS * DAY_MS).toISOString();
  const schoolYear = schoolYearOf(new Date(input.now));
  const code = buildTestCode(QUICK_TRY_CLASS, schoolYear, 1);
  const admin = input.byAdmin ? 1 : 0;
  const guest = 'SELECT id FROM teachers WHERE email = ?';
  const results = await db.batch<{ id: number }>([
    db
      .prepare(
        `INSERT INTO teachers (email, name, created_at, email_confirmed_at, status, quick_try)
         SELECT ?3, ?4, ?5, ?5, 'disabled', 1
         WHERE ?6 = 1 OR (${IP_COUNT} < ${QUICK_TRY_IP_LIMIT} AND ${DAY_COUNT} < ${QUICK_TRY_DAILY_LIMIT})
         RETURNING id`,
      )
      .bind(day, input.ipHash, input.email, QUICK_TRY_GUEST, input.now, admin),
    db
      .prepare(
        `INSERT INTO quick_tries (teacher_id, token_hash, day, ip_hash, by_admin, created_at, expires_at)
         SELECT id, ?, ?, ?, ?, ?, ? FROM teachers WHERE email = ?`,
      )
      .bind(input.tokenHash, day, input.ipHash, admin, input.now, expiresAt, input.email),
    db
      .prepare(`INSERT INTO classes (teacher_id, name, school_year, next_test_number, created_at) SELECT id, ?, ?, 2, ? FROM teachers WHERE email = ?`)
      .bind(QUICK_TRY_CLASS, schoolYear, input.now, input.email),
    db
      .prepare('INSERT INTO students (teacher_id, full_name, created_at) SELECT id, ?, ? FROM teachers WHERE email = ?')
      .bind(QUICK_TRY_STUDENT, input.now, input.email),
    db
      .prepare(
        `INSERT INTO enrollments (class_id, student_id)
         SELECT c.id, s.id FROM classes c JOIN students s ON s.teacher_id = c.teacher_id WHERE c.teacher_id = (${guest})`,
      )
      .bind(input.email),
    db
      .prepare(
        `INSERT INTO tests (teacher_id, class_id, number, code, title, status, started_at, quick_try, created_at, updated_at)
         SELECT c.teacher_id, c.id, 1, ?, ?, 'open', ?, 1, ?, ? FROM classes c WHERE c.teacher_id = (${guest})`,
      )
      .bind(code, QUICK_TRY_TITLE, input.now, input.now, input.now, input.email),
    db
      .prepare(
        `INSERT INTO submissions (test_id, student_id, status, session_hash, result_token, started_at)
         SELECT t.id, s.id, 'uploading', ?, ?, ? FROM tests t JOIN students s ON s.teacher_id = t.teacher_id WHERE t.teacher_id = (${guest})`,
      )
      .bind(input.sessionHash, input.resultToken, input.now, input.email),
  ]);
  const teacherId = results[0]?.results[0]?.id;
  if (teacherId !== undefined) return { teacherId, code };
  const full = await db.prepare(`SELECT ${DAY_COUNT} >= ${QUICK_TRY_DAILY_LIMIT} AS full`).bind(day).first<{ full: number }>();
  return full?.full ? 'daily_limit' : 'ip_limit';
}

// Whether the platform has no try left today (administrators skip it).
export async function dailyLimitReached(db: D1Database, now: string): Promise<boolean> {
  const row = await db.prepare(`SELECT ${DAY_COUNT} >= ${QUICK_TRY_DAILY_LIMIT} AS full`).bind(bucharestDay(new Date(now))).first<{ full: number }>();
  return Boolean(row?.full);
}

// The try of a link, by its token's hash.
export async function findQuickTry(db: D1Database, tokenHash: string): Promise<QuickTryRow | null> {
  const row = await db
    .prepare(
      `SELECT q.teacher_id, t.code, s.id AS submission_id, s.session_hash, q.created_at, q.expires_at
       FROM quick_tries q JOIN tests t ON t.teacher_id = q.teacher_id JOIN submissions s ON s.test_id = t.id
       WHERE q.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<{ teacher_id: number; code: string; submission_id: number; session_hash: string; created_at: string; expires_at: string }>();
  if (!row) return null;
  return {
    teacherId: row.teacher_id,
    code: row.code,
    submissionId: row.submission_id,
    sessionHash: row.session_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `npx vitest run server/db/quickTry.test.ts`
Expected: PASS, `Tests  8 passed (8)`.

- [ ] **Step 6: Typecheck and run all tests**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  141 passed | 1 skipped (142)`, `Tests  2212 passed | 3 skipped (2215)`.

- [ ] **Step 7: Commit**

```bash
git add shared/quickTry.ts server/db/quickTry.ts server/db/quickTry.test.ts
git commit -m "Make a Quick Try in one batch, with the daily limits in its SQL"
```

Check: `git diff --stat refs/protoqt/q2 HEAD -- . ':!docs'` prints nothing.

### Task 3: POST /api/try with Turnstile, and the availability

**Files:**
- Create: `server/turnstile.ts`, `server/routes/quickTry.ts`, `server/routes/quickTry.test.ts`
- Modify: `server/env.ts`, `server/auth/teacherAuth.ts`, `shared/api.ts`, `server/app.ts`
- Test: `server/routes/quickTry.test.ts`

**Interfaces:**
- Consumes: Task 2's `createQuickTry`, `dailyLimitReached`; `clientIpKey`, `sameOriginWrites`, `readJson`, `nowIso` (`server/http.ts`); `randomBase32`, `newDeviceSecret`, `newResultToken`, `sha256Hex` (`server/secrets.ts`).
- Produces: `Env.TURNSTILE_SECRET_KEY?: string`; `AppOptions.verifyTurnstile?: (env, token, ip) => Promise<boolean>`; `verifyTurnstile(env, token, ip, fetchImpl = fetch): Promise<boolean>` in `server/turnstile.ts`; `optionalTeacher(c): Promise<Teacher | null>` in `server/auth/teacherAuth.ts`; in `shared/api.ts`: `quickTryCreateBody = { turnstileToken?: string }`, `QuickTryCreated { token; code }`, `QuickTryAvailability { dailyLimitReached; admin }`; `quickTryRoutes(options): Hono<AppEnv>` mounted at `/api/try` with `GET /availability` and `POST /` (201 `{ token, code }`; 403 `not_human`; 429 `quick_try_ip_limit` or `quick_try_daily_limit`).

- [ ] **Step 1: Create `server/routes/quickTry.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUICK_TRY_DAILY_LIMIT, QUICK_TRY_IP_LIMIT, isQuickTryToken } from '../../shared/quickTry.ts';
import { sha256Hex } from '../secrets.ts';
import { verifyTurnstile } from '../turnstile.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;

afterEach(async () => {
  await api.dispose();
});

// A visitor who is not logged in (no DEV_TEACHER_EMAIL), with a Turnstile
// check that accepts the answer "ok".
async function visitorApi() {
  const verify = vi.fn(async (_env: unknown, token: string) => token === 'ok');
  api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined }, app: { verifyTurnstile: verify } });
  return verify;
}

const create = (body: unknown = { turnstileToken: 'ok' }, ip = '203.0.113.5') =>
  api.request('POST', '/api/try', body, { 'CF-Connecting-IP': ip });

describe('POST /api/try', () => {
  it('makes a try and answers with its link token and test code', async () => {
    const verify = await visitorApi();
    const res = await create();
    expect(res.status).toBe(201);
    expect(isQuickTryToken(res.body.token)).toBe(true);
    expect(res.body.code).toMatch(/^PROBA-\d{2}T1$/);
    expect(verify).toHaveBeenCalledWith(expect.anything(), 'ok', '203.0.113.5');
    const row = await api.db
      .prepare('SELECT ip_hash, by_admin FROM quick_tries WHERE token_hash = ?')
      .bind(await sha256Hex(res.body.token))
      .first();
    expect(row).toEqual({ ip_hash: await sha256Hex('203.0.113.5'), by_admin: 0 });
  });

  it('refuses a visitor without a Turnstile answer, or with one Cloudflare refuses', async () => {
    await visitorApi();
    for (const body of [{}, { turnstileToken: 'bot' }]) {
      const res = await create(body);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('not_human');
    }
    expect((await api.db.prepare('SELECT COUNT(*) AS n FROM quick_tries').first<{ n: number }>())!.n).toBe(0);
  });

  it('refuses a cross-site request', async () => {
    await visitorApi();
    const res = await api.request('POST', '/api/try', { turnstileToken: 'ok' }, { 'Sec-Fetch-Site': 'cross-site' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('cross_site');
  });

  it(`refuses the ${QUICK_TRY_IP_LIMIT + 1}th try of one IP with the account message`, async () => {
    await visitorApi();
    for (let i = 0; i < QUICK_TRY_IP_LIMIT; i++) expect((await create()).status).toBe(201);
    const res = await create();
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('quick_try_ip_limit');
    expect(res.body.message).toContain('creează un cont: corectezi gratuit un test pentru toată clasa');
    expect(res.body.message).not.toMatch(/nelimitat/i);
    expect((await create(undefined, '203.0.113.6')).status).toBe(201);
  });

  it('refuses every visitor once the day is full', async () => {
    await visitorApi();
    for (let i = 0; i < QUICK_TRY_DAILY_LIMIT; i++) expect((await create(undefined, `198.51.100.${i}`)).status).toBe(201);
    const res = await create(undefined, '192.0.2.1');
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('quick_try_daily_limit');
    expect((await api.request('GET', '/api/try/availability')).body).toEqual({ dailyLimitReached: true, admin: false });
  });

  it('lets an administrator skip Turnstile and the limits', async () => {
    const verify = vi.fn(async () => false);
    api = await startTestApi({ app: { verifyTurnstile: verify } });
    for (let i = 0; i < QUICK_TRY_IP_LIMIT + 1; i++) expect((await create({})).status).toBe(201);
    expect(verify).not.toHaveBeenCalled();
    const counted = await api.db.prepare('SELECT COUNT(*) AS n FROM quick_tries WHERE by_admin = 0').first<{ n: number }>();
    expect(counted!.n).toBe(0);
    expect((await api.request('GET', '/api/try/availability')).body).toEqual({ dailyLimitReached: false, admin: true });
  });

  it('does not count a teacher who is not an administrator as one', async () => {
    api = await startTestApi({ env: { DEV_TEACHER_EMAIL: 'altul@example.com' }, app: { verifyTurnstile: async () => false } });
    await api.addTeacher('altul@example.com', 'Alt Profesor');
    expect((await create({})).status).toBe(403);
    expect((await api.request('GET', '/api/try/availability')).body).toEqual({ dailyLimitReached: false, admin: false });
  });
});

describe('verifyTurnstile', () => {
  const env = (secret?: string) => ({ TURNSTILE_SECRET_KEY: secret }) as Parameters<typeof verifyTurnstile>[0];

  it('asks Cloudflare with the secret, the answer and the IP', async () => {
    const fetchImpl = vi.fn(async (_url: unknown, _init?: RequestInit) => Response.json({ success: true }));
    expect(await verifyTurnstile(env('secret'), 'answer', '203.0.113.5', fetchImpl as unknown as typeof fetch)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const form = init!.body as FormData;
    expect([form.get('secret'), form.get('response'), form.get('remoteip')]).toEqual(['secret', 'answer', '203.0.113.5']);
  });

  it('says no without a secret, for a refused answer, an error status, or a failed request', async () => {
    const answer = (body: unknown, status = 200) => (async () => Response.json(body, { status })) as unknown as typeof fetch;
    expect(await verifyTurnstile(env(), 'a', '', answer({ success: true }))).toBe(false);
    expect(await verifyTurnstile(env('s'), 'a', '', answer({ success: false }))).toBe(false);
    expect(await verifyTurnstile(env('s'), 'a', '', answer({ success: true }, 500))).toBe(false);
    const failing = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile(env('s'), 'a', '', failing)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run server/routes/quickTry.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  no tests`: `Cannot find module '../turnstile.ts'`.

- [ ] **Step 3: Create `server/turnstile.ts`**

```ts
import type { Env } from './env.ts';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Checks a Cloudflare Turnstile answer from the Quick Try form with Cloudflare.
// False for a refused answer, a missing secret, or a check that could not run:
// the try is then not made.
export async function verifyTurnstile(env: Env, token: string, ip: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;
  const form = new FormData();
  form.set('secret', secret);
  form.set('response', token);
  if (ip) form.set('remoteip', ip);
  try {
    const res = await fetchImpl(SITEVERIFY, { method: 'POST', body: form });
    if (!res.ok) return false;
    const answer = (await res.json()) as { success?: unknown };
    return answer.success === true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Edit `server/env.ts`**

Find this block:

```ts
  STRIPE_WEBHOOK_SECRET?: string;
}
```

Replace it with:

```ts
  STRIPE_WEBHOOK_SECRET?: string;
  // Quick Try's Cloudflare Turnstile secret key. Without it, only an
  // administrator can make a try.
  TURNSTILE_SECRET_KEY?: string;
}
```

- [ ] **Step 5: Edit `server/env.ts`**

Find this block:

```ts
  createCheckoutSession?: CreateCheckoutSession;
}
```

Replace it with:

```ts
  createCheckoutSession?: CreateCheckoutSession;
  // Checks a Quick Try form's Turnstile answer (default verifyTurnstile).
  verifyTurnstile?: (env: Env, token: string, ip: string) => Promise<boolean>;
}
```

- [ ] **Step 6: Edit `server/auth/teacherAuth.ts`**

Find this block:

```ts

// Puts the logged-in teacher in c.var.teacher, or refuses the request.
```

Replace it with:

```ts

// The logged-in teacher, or null for a visitor who is not logged in.
export async function optionalTeacher(c: Context<AppEnv>): Promise<Teacher | null> {
  try {
    return await loggedInTeacher(c);
  } catch (err) {
    if (err instanceof ApiError) return null;
    throw err;
  }
}

// Puts the logged-in teacher in c.var.teacher, or refuses the request.
```

- [ ] **Step 7: Edit `shared/api.ts`**

Find this block:

```ts
export const baremCheckedBody = z.object({ filesVersion: z.number().int().min(0) });

```

Replace it with:

```ts
export const baremCheckedBody = z.object({ filesVersion: z.number().int().min(0) });

// Quick Try (spec docs/superpowers/specs/2026-11-09-quick-try-design.md): the
// form's Turnstile answer. An administrator may send none.
export const quickTryCreateBody = z.object({ turnstileToken: z.string().max(4096).optional() });

// A new try: the secret part of its link, and its test's code.
export interface QuickTryCreated {
  token: string;
  code: string;
}

// What the landing page reads before the form: whether today's tries are all
// used, and whether the visitor is an administrator (who skips the limits).
export interface QuickTryAvailability {
  dailyLimitReached: boolean;
  admin: boolean;
}

```

- [ ] **Step 8: Create `server/routes/quickTry.ts`**

```ts
import { Hono } from 'hono';
import { quickTryCreateBody, type QuickTryAvailability, type QuickTryCreated } from '../../shared/api.ts';
import { optionalTeacher } from '../auth/teacherAuth.ts';
import { createQuickTry, dailyLimitReached } from '../db/quickTry.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { ApiError } from '../errors.ts';
import { clientIpKey, nowIso, readJson, sameOriginWrites } from '../http.ts';
import { newDeviceSecret, newResultToken, randomBase32, sha256Hex } from '../secrets.ts';
import { verifyTurnstile } from '../turnstile.ts';

// The message for every used-up limit: a new account grades a whole class
// test for free, so that is the way on (never "unlimited").
const LIMIT_MESSAGE =
  'Limita de încercări gratuite pentru azi a fost atinsă. Încearcă din nou mâine sau creează un cont: corectezi gratuit un test pentru toată clasa.';

// /api/try: Quick Try, one free grading without an account (spec
// docs/superpowers/specs/2026-11-09-quick-try-design.md).
export function quickTryRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const verify = options.verifyTurnstile ?? ((env, token, ip) => verifyTurnstile(env, token, ip));
  routes.use('*', sameOriginWrites);

  routes.get('/availability', async (c) => {
    const teacher = await optionalTeacher(c);
    const admin = teacher?.role === 'admin';
    const answer: QuickTryAvailability = { dailyLimitReached: !admin && (await dailyLimitReached(c.env.DB, nowIso())), admin };
    return c.json(answer);
  });

  // A new try. An administrator skips Turnstile and the limits; everyone else
  // needs a Turnstile answer that Cloudflare accepts.
  routes.post('/', async (c) => {
    const body = await readJson(c, quickTryCreateBody, 8192);
    const teacher = await optionalTeacher(c);
    const admin = teacher?.role === 'admin';
    const ip = c.req.header('CF-Connecting-IP') ?? '';
    if (!admin && !(body.turnstileToken && (await verify(c.env, body.turnstileToken, ip)))) {
      throw new ApiError(403, 'not_human', 'Nu am putut verifica încercarea. Reîncarcă pagina și încearcă din nou.');
    }
    const token = randomBase32(32);
    const made = await createQuickTry(c.env.DB, {
      tokenHash: await sha256Hex(token),
      ipHash: await sha256Hex(clientIpKey(c)),
      byAdmin: admin,
      email: `try-${randomBase32(20)}@quick-try.invalid`,
      sessionHash: await sha256Hex(newDeviceSecret()),
      resultToken: newResultToken(),
      now: nowIso(),
    });
    if (made === 'ip_limit') throw new ApiError(429, 'quick_try_ip_limit', LIMIT_MESSAGE);
    if (made === 'daily_limit') throw new ApiError(429, 'quick_try_daily_limit', LIMIT_MESSAGE);
    return c.json({ token, code: made.code } satisfies QuickTryCreated, 201);
  });

  return routes;
}
```

- [ ] **Step 9: Edit `server/app.ts`**

Find this block:

```ts
import { paymentWebhookRoutes } from './routes/payments.ts';
import { runnerRoutes } from './routes/runner.ts';
```

Replace it with:

```ts
import { paymentWebhookRoutes } from './routes/payments.ts';
import { quickTryRoutes } from './routes/quickTry.ts';
import { runnerRoutes } from './routes/runner.ts';
```

- [ ] **Step 10: Edit `server/app.ts`**

Find this block:

```ts
  app.route('/payments', paymentWebhookRoutes());

```

Replace it with:

```ts
  app.route('/payments', paymentWebhookRoutes());
  app.route('/try', quickTryRoutes(options));

```

- [ ] **Step 11: Run the test to see it pass**

Run: `npx vitest run server/routes/quickTry.test.ts`
Expected: PASS, `Tests  9 passed (9)`.

- [ ] **Step 12: Typecheck and run all tests**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  142 passed | 1 skipped (143)`, `Tests  2221 passed | 3 skipped (2224)`.

- [ ] **Step 13: Commit**

```bash
git add server/turnstile.ts server/routes/quickTry.ts server/routes/quickTry.test.ts server/env.ts server/auth/teacherAuth.ts shared/api.ts server/app.ts
git commit -m "Make a Quick Try at POST /api/try, behind Turnstile and the limits"
```

Check: `git diff --stat refs/protoqt/q3 HEAD -- . ':!docs'` prints nothing.

### Task 4: The try's link: the paper, the start, and the teacher API behind an allow-list

**Files:**
- Create: `server/routes/quickTryLink.test.ts`, `runner/quickTry.test.ts`
- Replace: `server/routes/quickTry.ts`
- Modify: `server/db/quickTry.ts`, `server/db/quickTry.test.ts`, `server/env.ts`, `server/routes/tests.ts`, `shared/api.ts`, `AGENTS.md`, `server/AGENTS.md`
- Test: `server/routes/quickTryLink.test.ts`, `runner/quickTry.test.ts`, `server/db/quickTry.test.ts`

**Interfaces:**
- Consumes: Tasks 2-3; `testRoutes`, `submissionRoutes`, `requireTest`, `confirmBarem`, `startEvaluationNow`, `fileSlots`, `addSubmissionFile`, `findSessionFile`, `deleteSessionFile`, `studentFileKey`, `readUpload`, `fileResponse`, `deleteFilesQuietly`, `robotStarter`.
- Produces: `QuickTryRow` gains `testId`, `schoolYear`, `studentId`; `guestTeacher(teacherId): Teacher` and `listPaperFiles(db, submissionId): Promise<SubmissionFile[]>` in `server/db/quickTry.ts`; `AppEnv.Variables.quickTry: QuickTryRow`; `evaluationBlocker` exported from `server/routes/tests.ts`; in `shared/api.ts`: `QuickTryInfo { code; submissionId; expiresAt; expired }`, `quickTryStartBody = { filesVersion?: number }`. Routes under `/api/try/<token>`: `GET /` (`QuickTryInfo`), `GET /paper` (`{ files }`), `PUT /paper` (201 `{ file }`), `GET /paper/:fileId`, `DELETE /paper/:fileId`, `POST /start` (`EvaluationStart`), and `/tests/*`, `/submissions/*` from the teacher API, only as `ALLOWED` lists. Part B's page calls these with `src/admin/api.ts`'s `base` set to `/api/try/<token>`.

- [ ] **Step 1: Create `server/routes/quickTryLink.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { NEEDS_PRINT } from '../db/runner.ts';
import { addEvaluation } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// /api/try/<token>: the try's own link, which serves the teacher API's routes
// for its guest teacher behind an allow-list.

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let token: string;
let code: string;

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7 ${text}`);
const jpeg = (text = 'photo') => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(text)]);

async function newTry(): Promise<{ token: string; code: string }> {
  const res = await api.request('POST', '/api/try', { turnstileToken: 'ok' }, { 'CF-Connecting-IP': '203.0.113.5' });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body;
}

const put = (path: string, bytes: BodyInit, type: string, name = 'fisier') =>
  api.fetch(path, { method: 'PUT', body: bytes, headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(name) } });
const putPaper = (bytes: BodyInit = jpeg()) => put(`/api/try/${token}/paper`, bytes, 'image/jpeg', 'pagina1.jpg');
const putTestFile = (kind: 'test' | 'barem') => put(`/api/try/${token}/tests/${code}/files/${kind}`, pdf(kind), PDF_TYPE, `${kind}.pdf`);
const start = (body: unknown = {}) => api.request('POST', `/api/try/${token}/start`, body);
const paperStatus = async () =>
  (await api.db.prepare("SELECT s.status FROM submissions s JOIN tests t ON t.id = s.test_id WHERE t.quick_try = 1").first<{ status: string }>())!.status;

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => true);
  api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined }, app: { dispatchRobot, verifyTurnstile: async () => true } });
  ({ token, code } = await newTry());
});

afterEach(async () => {
  await api.dispose();
});

describe('GET /api/try/<token>', () => {
  it('answers with the code, the paper and the expiry', async () => {
    const res = await api.request('GET', `/api/try/${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code, submissionId: expect.any(Number), expiresAt: expect.any(String), expired: false });
  });

  it('answers 404 for an unknown or malformed token', async () => {
    expect((await api.request('GET', `/api/try/${'a'.repeat(32)}`)).body.error).toBe('unknown_try');
    expect((await api.request('GET', '/api/try/abc')).body.error).toBe('unknown_try');
    expect((await api.request('GET', `/api/try/abc/paper`)).status).toBe(404);
  });

  it('says an expired try expired, and refuses everything else with 410', async () => {
    await api.db.prepare("UPDATE quick_tries SET expires_at = '2020-01-01T00:00:00.000Z'").run();
    expect((await api.request('GET', `/api/try/${token}`)).body.expired).toBe(true);
    for (const res of [
      await api.request('GET', `/api/try/${token}/paper`),
      await api.request('GET', `/api/try/${token}/tests/${code}`),
      await start(),
      await putPaper(),
    ]) {
      expect(res.status).toBe(410);
    }
  });
});

describe('the paper', () => {
  it('takes pages, lists them, serves them and deletes them', async () => {
    const added = await putPaper(jpeg('one'));
    expect(added.status).toBe(201);
    const file = ((await added.json()) as { file: { id: number } }).file;
    const listed = await api.request('GET', `/api/try/${token}/paper`);
    expect(listed.body.files).toEqual([{ id: file.id, name: 'pagina1.jpg', contentType: 'image/jpeg', size: 7, position: 1 }]);
    const served = await api.fetch(`/api/try/${token}/paper/${file.id}`);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(jpeg('one'));
    expect((await api.request('DELETE', `/api/try/${token}/paper/${file.id}`)).body).toEqual({ deleted: true });
    expect((await api.request('GET', `/api/try/${token}/paper`)).body.files).toEqual([]);
  });

  it('refuses a file that is not a photo or a PDF', async () => {
    const res = await put(`/api/try/${token}/paper`, new TextEncoder().encode('text'), 'text/plain');
    expect(res.status).toBe(415);
  });

  it('is closed once the paper went to grading', async () => {
    await putTestFile('test');
    await putTestFile('barem');
    await putPaper();
    expect((await start()).status).toBe(200);
    const res = await putPaper();
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('paper_sent');
  });

  it("is not another try's", async () => {
    const added = (await (await putPaper()).json()) as { file: { id: number } };
    const other = await newTry();
    expect((await api.fetch(`/api/try/${other.token}/paper/${added.file.id}`)).status).toBe(404);
  });
});

describe('the teacher API through the link', () => {
  it("reads and changes the try's test, and makes no print job", async () => {
    const res = await api.request('GET', `/api/try/${token}/tests/${code}`);
    expect(res.status).toBe(200);
    expect(res.body.test).toMatchObject({ code, title: 'Încercare rapidă', status: 'open' });
    const saved = await putTestFile('test');
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as { robot: unknown }).robot).toBeNull();
    expect((await api.db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_PRINT}`).all()).results).toEqual([]);
    expect((await api.fetch(`/api/try/${token}/tests/${code}/files/test`)).status).toBe(200);
  });

  it("never reaches a real teacher's test", async () => {
    const other = await realTeacherTest();
    expect((await api.request('GET', `/api/try/${token}/tests/${other}`)).status).toBe(404);
  });

  it('refuses every route that is not on the allow-list', async () => {
    const submissionId = (await api.request('GET', `/api/try/${token}`)).body.submissionId as number;
    const refused: [string, string][] = [
      ['GET', `/tests`],
      ['POST', `/tests`],
      ['DELETE', `/tests/${code}`],
      ['PATCH', `/tests/${code}`],
      ['POST', `/tests/${code}/evaluate`],
      ['POST', `/tests/${code}/regrade`],
      ['POST', `/tests/${code}/exercise-list/retry`],
      ['POST', `/tests/${code}/analysis/regenerate`],
      ['POST', `/tests/${code}/results/open`],
      ['GET', `/tests/${code}/report`],
      ['GET', `/tests/${code}/print`],
      ['PUT', `/tests/${code}/barem-notes`],
      ['POST', `/tests/${code}/finish`],
      ['POST', `/tests/${code}/archive`],
      ['GET', `/tests/${code}/ces/files/test`],
      ['GET', `/submissions/${submissionId}/result-link`],
      ['POST', `/submissions/${submissionId}/reset`],
      ['POST', `/submissions/${submissionId}/regrade`],
      ['POST', `/submissions/${submissionId}/retry`],
      ['POST', `/submissions/${submissionId}/results/open`],
    ];
    for (const [method, path] of refused) {
      const res = await api.request(method, `/api/try/${token}${path}`, method === 'GET' ? undefined : {});
      expect([method, path, res.status]).toEqual([method, path, 404]);
    }
  });
});

describe('the review through the link', () => {
  it('reads the graded paper and takes a correction, without asking for a class analysis', async () => {
    const submissionId = (await api.request('GET', `/api/try/${token}`)).body.submissionId as number;
    await api.db.prepare("UPDATE tests SET status = 'evaluating' WHERE quick_try = 1").run();
    await api.db.prepare("UPDATE submissions SET status = 'graded', graded_at = '2026-10-07T09:00:00.000Z' WHERE id = ?").bind(submissionId).run();
    await addEvaluation(api, submissionId, { items: [{ needsReview: true }] });
    const read = await api.request('GET', `/api/try/${token}/submissions/${submissionId}`);
    expect(read.status).toBe(200);
    const itemId = read.body.submission.evaluation.items[0].id as number;
    const corrected = await api.request('PATCH', `/api/try/${token}/submissions/${submissionId}/items/${itemId}`, {
      gradedAt: '2026-10-07T09:00:00.000Z',
      points: 0.5,
      reviewed: true,
    });
    expect(corrected.status).toBe(200);
    expect(corrected.body.submission.evaluation.items[0].points).toBe(0.5);
    const analysis = await api.db.prepare('SELECT analysis_status FROM tests WHERE quick_try = 1').first<{ analysis_status: string }>();
    expect(analysis!.analysis_status).toBe('none');
    expect(dispatchRobot).not.toHaveBeenCalled();
    const other = await newTry();
    expect((await api.request('GET', `/api/try/${other.token}/submissions/${submissionId}`)).status).toBe(404);
  });
});

describe('POST /api/try/<token>/start', () => {
  it('sends the paper to grading and starts the robot', async () => {
    await putTestFile('test');
    await putTestFile('barem');
    await putPaper();
    const res = await start();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'evaluating', evaluationAt: null, robot: 'dispatched' });
    expect(await paperStatus()).toBe('submitted');
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('says what is missing', async () => {
    expect((await start()).body.error).toBe('missing_test_file');
    await putTestFile('test');
    expect((await start()).body.error).toBe('missing_barem');
    await putTestFile('barem');
    expect((await start()).body.error).toBe('no_uploads');
  });

  it("counts a robot's barem as checked when the page names its version", async () => {
    await putTestFile('test');
    const asked = await api.request('POST', `/api/try/${token}/tests/${code}/barem/generate`);
    expect(asked.body.barem.request).toBe('requested');
    // The robot saves its barem (as saveGeneratedBarem does): unchecked.
    await api.db
      .prepare(
        `UPDATE tests SET barem_file_key = 'k', barem_file_name = 'barem.docx', barem_file_type = 'application/pdf',
           barem_unchecked = 1, barem_request = 'none', files_version = files_version + 1 WHERE quick_try = 1`,
      )
      .run();
    await putPaper();
    expect((await start()).body.error).toBe('barem_unchecked');
    const version = (await api.request('GET', `/api/try/${token}/tests/${code}`)).body.test.filesVersion as number;
    expect((await start({ filesVersion: version + 5 })).body.error).toBe('barem_unchecked');
    const res = await start({ filesVersion: version });
    expect(res.body.status).toBe('evaluating');
  });
});

// The code of a test of the real teacher of the test database.
async function realTeacherTest(): Promise<string> {
  const cls = await api.db
    .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, '6E2', 2026, '2026-10-06T08:00:00.000Z') RETURNING id")
    .bind(api.teacherId)
    .first<{ id: number }>();
  await api.db
    .prepare(
      `INSERT INTO tests (teacher_id, class_id, number, code, title, created_at, updated_at)
       VALUES (?, ?, 1, '6E2-26T1', 'Test', '2026-10-06T08:00:00.000Z', '2026-10-06T08:00:00.000Z')`,
    )
    .bind(api.teacherId, cls!.id)
    .run();
  return '6E2-26T1';
}
```

- [ ] **Step 2: Create `runner/quickTry.test.ts`**

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExerciseList, GradingResult } from '../shared/schemas.ts';
import { PDF_TYPE } from '../shared/files.ts';
import { setRobotKey } from '../server/test/fixtures.ts';
import { startTestApi, type TestApi } from '../server/test/testApi.ts';
import { robotApi } from './api.ts';
import { runRobot } from './run.ts';
import { API_URL, fetchFrom, ROBOT_KEY } from './test/robotWorld.ts';
import { answer, scriptedClaude } from './test/scriptedClaude.ts';

// A Quick Try paper goes through the robot as a class paper does: exercise
// list, then grading. The robot makes no print PDF and no class analysis for it.

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [{ id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 9, answer: '3/4', scoringNotes: '', topic: 'Fracții' }],
  notes: '',
};

const GRADING: GradingResult = {
  items: [{ exerciseId: 'I.1', points: 8, studentAnswer: '3/4', comment: 'Corect.', confidence: 'high', needsReview: false, reviewReason: '', page: 1 }],
  unreadable: [],
  summary: 'Ai lucrat bine.',
  strengths: ['Fracții'],
  recommendations: ['Exersează.'],
};

let api: TestApi | undefined;
const folders: string[] = [];

afterEach(async () => {
  await api?.dispose();
  api = undefined;
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function folder(prefix: string): string {
  const made = mkdtempSync(path.join(tmpdir(), prefix));
  folders.push(made);
  return made;
}

function skill(): string {
  const dir = folder('qe-skill-');
  mkdirSync(path.join(dir, 'references'));
  writeFileSync(path.join(dir, 'SKILL.md'), '# skill');
  writeFileSync(path.join(dir, 'references', 'grading-rules.md'), '# rules');
  return dir;
}

describe('a Quick Try paper', () => {
  it('gets its exercise list and its grading, and no print or analysis', async () => {
    api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined }, app: { dispatchRobot: async () => true, verifyTurnstile: async () => true } });
    await setRobotKey(api);
    const made = await api.request('POST', '/api/try', { turnstileToken: 'ok' });
    const { token, code } = made.body as { token: string; code: string };
    const put = (url: string, body: BodyInit, type: string) =>
      api!.fetch(url, { method: 'PUT', body, headers: { 'Content-Type': type, 'X-File-Name': 'f' } });
    expect((await put(`/api/try/${token}/tests/${code}/files/test`, '%PDF-1.7 test', PDF_TYPE)).status).toBe(200);
    expect((await put(`/api/try/${token}/tests/${code}/files/barem`, '%PDF-1.7 barem', PDF_TYPE)).status).toBe(200);
    expect((await put(`/api/try/${token}/paper`, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x70]), 'image/jpeg')).status).toBe(201);
    expect((await api.request('POST', `/api/try/${token}/start`, {})).body.status).toBe('evaluating');

    const claude = scriptedClaude(answer(LIST), answer(GRADING));
    const robot = robotApi(API_URL, ROBOT_KEY, { fetch: fetchFrom(api), retryDelayMs: 0 });
    const report = await runRobot({ api: robot, claude: claude.run, runId: 'run-quick-try-1', root: folder('qe-run-'), workdir: { skillDir: skill() }, heartbeatMs: 60_000 });
    expect(report.summary).toMatchObject({ exerciseLists: 1, graded: 1, failed: 0, analyses: 0, prints: 0, stop: 'done' });
    expect(claude.calls.map((call) => call.task.mode)).toEqual(['exercise-list', 'grade']);
    const test = await api.db.prepare('SELECT status, analysis_status, print_status FROM tests WHERE quick_try = 1').first();
    expect(test).toEqual({ status: 'done', analysis_status: 'none', print_status: 'none' });
    const paper = await api.request('GET', `/api/try/${token}/submissions/${(await api.request('GET', `/api/try/${token}`)).body.submissionId}`);
    expect(paper.body.submission.evaluation.total).toBe(9);
  });
});
```

- [ ] **Step 3: Edit `server/db/quickTry.test.ts`**

Find this block:

```ts
      teacherId,
      code: 'PROBA-26T1',
      submissionId: expect.any(Number),
```

Replace it with:

```ts
      teacherId,
      testId: expect.any(Number),
      code: 'PROBA-26T1',
      schoolYear: 2026,
      studentId: expect.any(Number),
      submissionId: expect.any(Number),
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx vitest run server/routes/quickTryLink.test.ts runner/quickTry.test.ts server/db/quickTry.test.ts`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  14 failed | 9 passed (23)`: the link's routes do not exist (`expected 404 to be 200`, `expected 'not_found' to be 'unknown_try'`), `findQuickTry` has no `testId`, `schoolYear`, `studentId`, and the robot test cannot start the try. The tests that pass at RED are guards: the other seven tests of `server/db/quickTry.test.ts`, "never reaches a real teacher's test" and "refuses every route that is not on the allow-list" (404 already, and must stay so).

- [ ] **Step 5: Edit `server/db/quickTry.ts`**

Find this block:

```ts
import type { D1Database } from '@cloudflare/workers-types';
import {
```

Replace it with:

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { SubmissionFile, Teacher } from '../../shared/api.ts';
import {
```

- [ ] **Step 6: Edit `server/db/quickTry.ts`**

Find this block:

```ts
  teacherId: number;
  code: string;
  submissionId: number;
```

Replace it with:

```ts
  teacherId: number;
  testId: number;
  code: string;
  schoolYear: number;
  studentId: number;
  submissionId: number;
```

- [ ] **Step 7: Edit `server/db/quickTry.ts`**

Find this block:

```ts
    .prepare(
      `SELECT q.teacher_id, t.code, s.id AS submission_id, s.session_hash, q.created_at, q.expires_at
       FROM quick_tries q JOIN tests t ON t.teacher_id = q.teacher_id JOIN submissions s ON s.test_id = t.id
       WHERE q.token_hash = ?`,
```

Replace it with:

```ts
    .prepare(
      `SELECT q.teacher_id, t.id AS test_id, t.code, c.school_year, s.student_id, s.id AS submission_id, s.session_hash,
         q.created_at, q.expires_at
       FROM quick_tries q JOIN tests t ON t.teacher_id = q.teacher_id JOIN classes c ON c.id = t.class_id
         JOIN submissions s ON s.test_id = t.id
       WHERE q.token_hash = ?`,
```

- [ ] **Step 8: Edit `server/db/quickTry.ts`**

Find this block:

```ts
    .bind(tokenHash)
    .first<{ teacher_id: number; code: string; submission_id: number; session_hash: string; created_at: string; expires_at: string }>();
  if (!row) return null;
```

Replace it with:

```ts
    .bind(tokenHash)
    .first<{
      teacher_id: number;
      test_id: number;
      code: string;
      school_year: number;
      student_id: number;
      submission_id: number;
      session_hash: string;
      created_at: string;
      expires_at: string;
    }>();
  if (!row) return null;
```

- [ ] **Step 9: Edit `server/db/quickTry.ts`**

Find this block:

```ts
    teacherId: row.teacher_id,
    code: row.code,
    submissionId: row.submission_id,
```

Replace it with:

```ts
    teacherId: row.teacher_id,
    testId: row.test_id,
    code: row.code,
    schoolYear: row.school_year,
    studentId: row.student_id,
    submissionId: row.submission_id,
```

- [ ] **Step 10: Edit `server/db/quickTry.ts`**

Find this block:

```ts
  };
}
```

Replace it with:

```ts
  };
}

// The guest teacher of a try, as the teacher API's routes read it from
// c.var.teacher: only its id names rows; it is never an administrator and
// never a demo account.
export function guestTeacher(teacherId: number): Teacher {
  return { id: teacherId, email: '', name: QUICK_TRY_GUEST, role: 'teacher', demo: false, testsEvaluated: 0, papersGraded: 0, papersWaiting: 0 };
}

// The pages of the try's paper, in upload order.
export async function listPaperFiles(db: D1Database, submissionId: number): Promise<SubmissionFile[]> {
  const rows = await db
    .prepare('SELECT id, original_name, content_type, size, position FROM submission_files WHERE submission_id = ? ORDER BY position, id')
    .bind(submissionId)
    .all<{ id: number; original_name: string; content_type: string; size: number; position: number }>();
  return rows.results.map((row) => ({ id: row.id, name: row.original_name, contentType: row.content_type, size: row.size, position: row.position }));
}
```

- [ ] **Step 11: Edit `server/env.ts`**

Find this block:

```ts
import type { Teacher } from '../shared/api.ts';
import type { EmailMessage } from './email.ts';
```

Replace it with:

```ts
import type { Teacher } from '../shared/api.ts';
import type { QuickTryRow } from './db/quickTry.ts';
import type { EmailMessage } from './email.ts';
```

- [ ] **Step 12: Edit `server/env.ts`**

Find this block:

```ts
  Bindings: Env;
  Variables: { teacher: Teacher };
}
```

Replace it with:

```ts
  Bindings: Env;
  // quickTry: the try of a /api/try/<token> request (routes/quickTry.ts).
  Variables: { teacher: Teacher; quickTry: QuickTryRow };
}
```

- [ ] **Step 13: Edit `server/routes/tests.ts`**

Find this block:

```ts
// changed nothing, so it describes the test as it is now.
async function evaluationBlocker(db: D1Database, teacherId: number, code: string, needsUploads: boolean, scheduling = false): Promise<ApiError> {
  const test = await requireTest(db, teacherId, code);
```

Replace it with:

```ts
// changed nothing, so it describes the test as it is now.
export async function evaluationBlocker(db: D1Database, teacherId: number, code: string, needsUploads: boolean, scheduling = false): Promise<ApiError> {
  const test = await requireTest(db, teacherId, code);
```

- [ ] **Step 14: Edit `shared/api.ts`**

Find this block:

```ts
  admin: boolean;
}

export const baremNotesBody = z.object({
```

Replace it with:

```ts
  admin: boolean;
}

// GET /api/try/<token>: the try's test code and paper, and until when its link works.
export interface QuickTryInfo {
  code: string;
  submissionId: number;
  expiresAt: string;
  expired: boolean;
}

// "Pornește corectarea": the files version of the barem the page showed, when
// the robot made it (the barem then counts as checked).
export const quickTryStartBody = z.object({ filesVersion: z.number().int().min(0).optional() });

export const baremNotesBody = z.object({
```

- [ ] **Step 15: Replace `server/routes/quickTry.ts`**

```ts
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import {
  quickTryCreateBody,
  quickTryStartBody,
  type EvaluationStart,
  type QuickTryAvailability,
  type QuickTryCreated,
  type QuickTryInfo,
  type SubmissionFile,
} from '../../shared/api.ts';
import { MAX_STUDENT_FILES, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE, studentFileKey } from '../../shared/files.ts';
import { isQuickTryToken, QUICK_TRY_STUDENT } from '../../shared/quickTry.ts';
import { optionalTeacher } from '../auth/teacherAuth.ts';
import { startEvaluationNow } from '../db/lifecycle.ts';
import { addSubmissionFile, deleteSessionFile, fileSlots, findSessionFile } from '../db/links.ts';
import { createQuickTry, dailyLimitReached, findQuickTry, guestTeacher, listPaperFiles } from '../db/quickTry.ts';
import { confirmBarem, requireTest } from '../db/tests.ts';
import { robotStarter } from '../dispatch.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { ApiError } from '../errors.ts';
import { clientIpKey, nowIso, parseId, readJson, sameOriginWrites } from '../http.ts';
import { newDeviceSecret, newResultToken, randomBase32, sha256Hex } from '../secrets.ts';
import { verifyTurnstile } from '../turnstile.ts';
import { deleteFilesQuietly, fileResponse, readUpload } from '../uploads.ts';
import { submissionRoutes } from './submissions.ts';
import { evaluationBlocker, testRoutes } from './tests.ts';

// The message for every used-up limit: a new account grades a whole class
// test for free, so that is the way on (never "unlimited").
const LIMIT_MESSAGE =
  'Limita de încercări gratuite pentru azi a fost atinsă. Încearcă din nou mâine sau creează un cont: corectezi gratuit un test pentru toată clasa.';

const unknownTry = () => new ApiError(404, 'unknown_try', 'Linkul nu este bun. Verifică dacă l-ai copiat întreg.');
const expiredTry = () => new ApiError(410, 'expired', 'Încercarea a expirat. Poți face o încercare nouă de pe pagina principală.');
const tooManyFiles = () => new ApiError(409, 'too_many_files', `Poți trimite cel mult ${MAX_STUDENT_FILES} de fișiere.`);
const paperClosed = () => new ApiError(409, 'paper_sent', 'Lucrarea a plecat deja la corectare.');
const fileNotFound = () => new ApiError(404, 'not_found', 'Nu am găsit fișierul.');

// What a try's link may call of the teacher API, after /api/try/<token>:
// reading the test and its files, replacing the test or the barem, asking for
// a barem, "Folosește oricum", and the review of the one paper. Everything
// else of the teacher API answers 404.
const ALLOWED: readonly [string, RegExp][] = [
  ['GET', /^\/tests\/[^/]+$/],
  ['GET', /^\/tests\/[^/]+\/files\/(test|barem)$/],
  ['PUT', /^\/tests\/[^/]+\/files\/(test|barem)$/],
  ['POST', /^\/tests\/[^/]+\/barem\/generate$/],
  ['POST', /^\/tests\/[^/]+\/exercise-list\/accept$/],
  ['GET', /^\/submissions\/\d+$/],
  ['GET', /^\/submissions\/\d+\/files\/\d+$/],
  ['PATCH', /^\/submissions\/\d+\/items\/\d+$/],
  ['PATCH', /^\/submissions\/\d+\/evaluation$/],
];

// The try of the link: c.var.quickTry, and its guest teacher in c.var.teacher,
// so the teacher API's own routes serve it. An expired try answers 410.
async function loadTry(c: Context<AppEnv>): Promise<{ expired: boolean }> {
  const token = c.req.param('token') ?? '';
  const found = isQuickTryToken(token) ? await findQuickTry(c.env.DB, await sha256Hex(token)) : null;
  if (!found) throw unknownTry();
  c.set('quickTry', found);
  c.set('teacher', guestTeacher(found.teacherId));
  return { expired: nowIso() >= found.expiresAt };
}

const tryAccess: MiddlewareHandler<AppEnv> = async (c, next) => {
  if ((await loadTry(c)).expired) throw expiredTry();
  await next();
};

const allowList: MiddlewareHandler<AppEnv> = async (c, next) => {
  const rest = c.req.path.replace(/^\/api\/try\/[^/]+/, '');
  if (!ALLOWED.some(([method, path]) => method === c.req.method && path.test(rest))) {
    throw new ApiError(404, 'not_found', 'Nu am găsit ce cauți.');
  }
  await next();
};

// /api/try: Quick Try, one free grading without an account (spec
// docs/superpowers/specs/2026-11-09-quick-try-design.md).
export function quickTryRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const verify = options.verifyTurnstile ?? ((env, token, ip) => verifyTurnstile(env, token, ip));
  const startRobot = robotStarter(options);
  routes.use('*', sameOriginWrites);

  routes.get('/availability', async (c) => {
    const teacher = await optionalTeacher(c);
    const admin = teacher?.role === 'admin';
    const answer: QuickTryAvailability = { dailyLimitReached: !admin && (await dailyLimitReached(c.env.DB, nowIso())), admin };
    return c.json(answer);
  });

  // A new try. An administrator skips Turnstile and the limits; everyone else
  // needs a Turnstile answer that Cloudflare accepts.
  routes.post('/', async (c) => {
    const body = await readJson(c, quickTryCreateBody, 8192);
    const teacher = await optionalTeacher(c);
    const admin = teacher?.role === 'admin';
    const ip = c.req.header('CF-Connecting-IP') ?? '';
    if (!admin && !(body.turnstileToken && (await verify(c.env, body.turnstileToken, ip)))) {
      throw new ApiError(403, 'not_human', 'Nu am putut verifica încercarea. Reîncarcă pagina și încearcă din nou.');
    }
    const token = randomBase32(32);
    const made = await createQuickTry(c.env.DB, {
      tokenHash: await sha256Hex(token),
      ipHash: await sha256Hex(clientIpKey(c)),
      byAdmin: admin,
      email: `try-${randomBase32(20)}@quick-try.invalid`,
      sessionHash: await sha256Hex(newDeviceSecret()),
      resultToken: newResultToken(),
      now: nowIso(),
    });
    if (made === 'ip_limit') throw new ApiError(429, 'quick_try_ip_limit', LIMIT_MESSAGE);
    if (made === 'daily_limit') throw new ApiError(429, 'quick_try_daily_limit', LIMIT_MESSAGE);
    return c.json({ token, code: made.code } satisfies QuickTryCreated, 201);
  });

  // The try's page reads this first. An expired try still answers here, so
  // the page can say so.
  routes.get('/:token', async (c) => {
    const { expired } = await loadTry(c);
    const found = c.var.quickTry;
    const answer: QuickTryInfo = { code: found.code, submissionId: found.submissionId, expiresAt: found.expiresAt, expired };
    return c.json(answer);
  });

  routes.use('/:token/*', tryAccess);

  // The student's pages, as the student app takes them: one photo or PDF per
  // request, at most MAX_STUDENT_FILES, only before the paper goes to grading.
  routes.get('/:token/paper', async (c) => {
    const files: SubmissionFile[] = await listPaperFiles(c.env.DB, c.var.quickTry.submissionId);
    return c.json({ files });
  });

  routes.put('/:token/paper', async (c) => {
    const found = c.var.quickTry;
    const slots = await fileSlots(c.env.DB, found.submissionId);
    if (slots.count >= MAX_STUDENT_FILES) throw tooManyFiles();
    const file = await readUpload(c, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE);
    const key = studentFileKey(
      found.teacherId,
      found.schoolYear,
      found.code,
      found.studentId,
      QUICK_TRY_STUDENT,
      slots.next,
      randomBase32(8),
      file.contentType,
    );
    await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: file.contentType } });
    const stored = { key, name: file.name, type: file.contentType, size: file.bytes.byteLength, position: slots.next };
    let id: number | null;
    try {
      id = await addSubmissionFile(c.env.DB, found.submissionId, found.sessionHash, stored, nowIso());
    } catch (err) {
      await deleteFilesQuietly(c.env.FILES, [key]);
      throw err;
    }
    if (id === null) {
      await deleteFilesQuietly(c.env.FILES, [key]);
      throw (await fileSlots(c.env.DB, found.submissionId)).count >= MAX_STUDENT_FILES ? tooManyFiles() : paperClosed();
    }
    const answer: SubmissionFile = { id, name: stored.name, contentType: stored.type, size: stored.size, position: stored.position };
    return c.json({ file: answer }, 201);
  });

  routes.get('/:token/paper/:fileId', async (c) => {
    const file = await findSessionFile(c.env.DB, c.var.quickTry.submissionId, parseId(c.req.param('fileId')));
    const object = file ? await c.env.FILES.get(file.key) : null;
    if (!file || !object) throw fileNotFound();
    return fileResponse(object, file.name, file.type);
  });

  routes.delete('/:token/paper/:fileId', async (c) => {
    const found = c.var.quickTry;
    const fileId = parseId(c.req.param('fileId'));
    const file = await findSessionFile(c.env.DB, found.submissionId, fileId);
    if (!file) throw fileNotFound();
    if (!(await deleteSessionFile(c.env.DB, found.submissionId, found.sessionHash, fileId, nowIso()))) throw paperClosed();
    await deleteFilesQuietly(c.env.FILES, [file.key]);
    return c.json({ deleted: true });
  });

  // "Pornește corectarea": a barem the robot made counts as checked (she
  // downloaded and read it), then the paper goes to grading.
  routes.post('/:token/start', async (c) => {
    const found = c.var.quickTry;
    const body = await readJson(c, quickTryStartBody);
    const test = await requireTest(c.env.DB, found.teacherId, found.code);
    const now = nowIso();
    if (test.barem.unchecked && body.filesVersion !== undefined) {
      await confirmBarem(c.env.DB, found.teacherId, found.testId, body.filesVersion, now);
    }
    const status = await startEvaluationNow(c.env.DB, found.teacherId, found.testId, now);
    if (status === null) throw await evaluationBlocker(c.env.DB, found.teacherId, found.code, true);
    const robot = status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ status, evaluationAt: null, robot } satisfies EvaluationStart);
  });

  routes.use('/:token/tests/*', allowList);
  routes.use('/:token/submissions/*', allowList);
  routes.route('/:token/tests', testRoutes(options));
  routes.route('/:token/submissions', submissionRoutes(options));

  return routes;
}
```

- [ ] **Step 16: Edit `AGENTS.md`**

Find this block:

```markdown
- Every `/api/admin` and `/api/u` request first runs the `promoteDue` middleware. A router added under them keeps it.
- R2 is private: every file goes through the API with an ownership check. R2 keys come from rows, never from listing R2.
```

Replace it with:

```markdown
- Every `/api/admin` and `/api/u` request first runs the `promoteDue` middleware. A router added under them keeps it.
- Quick Try (`docs/superpowers/specs/2026-11-09-quick-try-design.md`, migration 0026): one free grading without an account, at `/api/try`. Each try is a hidden guest teacher (`teachers.quick_try`, disabled, never an account) with its own class, student, test (`tests.quick_try`) and paper; its link `/api/try/<token>` serves the teacher API's own routes for that guest teacher behind an allow-list (`ALLOWED` in `server/routes/quickTry.ts`). A Quick Try test never gets a print job or a class analysis. The limits (`QUICK_TRY_IP_LIMIT` per IP and `QUICK_TRY_DAILY_LIMIT` in total per Bucharest day, `shared/quickTry.ts`) are checked in the SQL of the try's first INSERT (`createQuickTry`); a failed try gives its IP place back, not its daily place. An administrator skips Turnstile and the limits and is not counted.
- R2 is private: every file goes through the API with an ownership check. R2 keys come from rows, never from listing R2.
```

- [ ] **Step 17: Edit `server/AGENTS.md`**

Find this block:

```markdown

- `routes/`: HTTP. `admin.ts` and its parts, `upload.ts` for students, `runner.ts` for the robot.
- `db/`: D1 queries. `lifecycle.ts` starts, schedules, promotes, and ends evaluations, and regrades; `links.ts` holds the student writes; `runner.ts` holds the robot's queries; `evaluations.ts` reads graded results and holds the teacher's corrections (`flagCountSql` counts the items to check the same way everywhere; `listUploads` in `tests.ts` lists them per paper as `reviewPoints` by the same rule, in the same batch as the uploads).
```

Replace it with:

```markdown

- `routes/`: HTTP. `admin.ts` and its parts, `upload.ts` for students, `runner.ts` for the robot, `quickTry.ts` for Quick Try (`/api/try`: a new try with Turnstile and the limits, and the try's link, which mounts `testRoutes` and `submissionRoutes` for the try's guest teacher behind the `ALLOWED` list; `db/quickTry.ts` holds its queries, `turnstile.ts` the Turnstile check).
- `db/`: D1 queries. `lifecycle.ts` starts, schedules, promotes, and ends evaluations, and regrades; `links.ts` holds the student writes; `runner.ts` holds the robot's queries; `evaluations.ts` reads graded results and holds the teacher's corrections (`flagCountSql` counts the items to check the same way everywhere; `listUploads` in `tests.ts` lists them per paper as `reviewPoints` by the same rule, in the same batch as the uploads).
```

- [ ] **Step 18: Run the tests to see them pass**

Run: `npx vitest run server/routes/quickTryLink.test.ts runner/quickTry.test.ts server/db/quickTry.test.ts`
Expected: PASS, `Tests  23 passed (23)`.

- [ ] **Step 19: Typecheck and run all tests**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  144 passed | 1 skipped (145)`, `Tests  2236 passed | 3 skipped (2239)`.

- [ ] **Step 20: Commit**

```bash
git add server/routes/quickTryLink.test.ts runner/quickTry.test.ts server/routes/quickTry.ts server/db/quickTry.ts server/db/quickTry.test.ts server/env.ts server/routes/tests.ts shared/api.ts AGENTS.md server/AGENTS.md
git commit -m "Serve a Quick Try's paper, start and review through its link"
```

Check: `git diff --stat refs/protoqt/q4 HEAD -- . ':!docs'` prints nothing.

### Task 5: Bound the robot work of one try

**Files:**
- Create: `server/routes/quickTryRobotWork.test.ts`
- Modify: `shared/quickTry.ts`, `server/db/tests.ts`, `server/db/quickTry.ts`, `server/routes/tests.ts`, `AGENTS.md`
- Test: `server/routes/quickTryRobotWork.test.ts`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: `QUICK_TRY_FILE_CHANGES = 6` in `shared/quickTry.ts`; `isQuickTryTest(db, testId): Promise<boolean>` in `server/db/quickTry.ts`; the 409 errors `quick_try_barem` (POST `barem/generate`) and `quick_try_files` (PUT `files/:kind`).

- [ ] **Step 1: Create `server/routes/quickTryRobotWork.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { QUICK_TRY_FILE_CHANGES } from '../../shared/quickTry.ts';
import { addTestFiles, makeClass, makeTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// One try makes a bounded amount of robot work: one barem generation, and at
// most QUICK_TRY_FILE_CHANGES changes of the test and barem files.

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let token: string;
let code: string;

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7 ${text}`);
const putFile = (kind: 'test' | 'barem', base = `/api/try/${token}`, target = code) =>
  api.fetch(`${base}/tests/${target}/files/${kind}`, {
    method: 'PUT',
    body: pdf(kind),
    headers: { 'Content-Type': PDF_TYPE, 'X-File-Name': `${kind}.pdf` },
  });
const generate = () => api.request('POST', `/api/try/${token}/tests/${code}/barem/generate`);
const row = () =>
  api.db.prepare('SELECT files_version, barem_request FROM tests WHERE quick_try = 1').first<{ files_version: number; barem_request: string }>();

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => true);
  api = await startTestApi({ app: { dispatchRobot, verifyTurnstile: async () => true } });
  const made = await api.request('POST', '/api/try', { turnstileToken: 'ok' });
  ({ token, code } = made.body);
});

afterEach(async () => {
  await api.dispose();
});

describe('the barem generation of a try', () => {
  it('runs once', async () => {
    await putFile('test');
    expect((await generate()).status).toBe(200);
    await api.db.prepare("UPDATE tests SET barem_request = 'none', barem_unchecked = 1, barem_file_key = 'k' WHERE quick_try = 1").run();
    const again = await generate();
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('quick_try_barem');
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('is refused once the try has its own barem', async () => {
    await putFile('test');
    await putFile('barem');
    const res = await generate();
    expect(res.body.error).toBe('quick_try_barem');
    expect((await row())!.barem_request).toBe('none');
  });
});

describe('the file changes of a try', () => {
  it(`stop after ${QUICK_TRY_FILE_CHANGES}`, async () => {
    for (let i = 0; i < QUICK_TRY_FILE_CHANGES; i++) expect((await putFile(i % 2 === 0 ? 'test' : 'barem')).status).toBe(200);
    const res = await putFile('barem');
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('quick_try_files');
    expect((await row())!.files_version).toBe(QUICK_TRY_FILE_CHANGES);
  });

  it("do not limit a real teacher's test", async () => {
    const cls = await makeClass(api, '6E2', ['Pop Ion']);
    const own = await makeTest(api, cls.id);
    await addTestFiles(api, own, ['test']);
    for (let i = 0; i <= QUICK_TRY_FILE_CHANGES; i++) expect((await putFile('barem', '/api/admin', own)).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run server/routes/quickTryRobotWork.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  3 failed | 1 passed (4)`: a second barem generation and a generation after an uploaded barem are taken (`expected 200 to be 409`), and the file-change test is named "stop after undefined" (`QUICK_TRY_FILE_CHANGES` does not exist yet). The test that passes at RED is a guard: a real teacher's test takes more than six file changes.

- [ ] **Step 3: Edit `shared/quickTry.ts`**

Find this block:

```ts
export const QUICK_TRY_DAYS = 7;

```

Replace it with:

```ts
export const QUICK_TRY_DAYS = 7;
// A try may change its test and barem files this many times in all (each
// change can make robot work), and ask the robot for a barem once.
export const QUICK_TRY_FILE_CHANGES = 6;

```

- [ ] **Step 4: Edit `server/db/tests.ts`**

Find this block:

```ts
import { DOCX_TYPE, type TestFileKind, type TestVariant } from '../../shared/files.ts';
import { averageGrade } from '../../shared/stats.ts';
```

Replace it with:

```ts
import { DOCX_TYPE, type TestFileKind, type TestVariant } from '../../shared/files.ts';
import { QUICK_TRY_FILE_CHANGES } from '../../shared/quickTry.ts';
import { averageGrade } from '../../shared/stats.ts';
```

- [ ] **Step 5: Edit `server/db/tests.ts`**

Find this block:

```ts
// robot saves meanwhile is not left in R2.
export async function saveTestFile(
```

Replace it with:

```ts
// robot saves meanwhile is not left in R2.
// A Quick Try test (table tests) changes its files at most
// QUICK_TRY_FILE_CHANGES times: each change can make robot work.
const QUICK_TRY_FILES_LEFT = `(quick_try = 0 OR files_version < ${QUICK_TRY_FILE_CHANGES})`;

export async function saveTestFile(
```

- [ ] **Step 6: Edit `server/db/tests.ts`**

Find this block:

```ts
           ${c('barem_request_attempts')} = CASE WHEN ${c('barem_unchecked')} = 1 AND status IN (${statuses}) THEN 0 ELSE ${c('barem_request_attempts')} END
         WHERE id = ? AND teacher_id = ? ${noCesGradingSql(variant)}
         RETURNING status`
```

Replace it with:

```ts
           ${c('barem_request_attempts')} = CASE WHEN ${c('barem_unchecked')} = 1 AND status IN (${statuses}) THEN 0 ELSE ${c('barem_request_attempts')} END
         WHERE id = ? AND teacher_id = ? ${noCesGradingSql(variant)} AND ${QUICK_TRY_FILES_LEFT}
         RETURNING status`
```

- [ ] **Step 7: Edit `server/db/tests.ts`**

Find this block:

```ts
           ${c('barem_unchecked')} = 0, ${c('barem_request')} = 'none', ${c('barem_request_attempts')} = 0
         WHERE id = ? AND teacher_id = ? ${noCesGradingSql(variant)}
         RETURNING status`;
```

Replace it with:

```ts
           ${c('barem_unchecked')} = 0, ${c('barem_request')} = 'none', ${c('barem_request_attempts')} = 0
         WHERE id = ? AND teacher_id = ? ${noCesGradingSql(variant)} AND ${QUICK_TRY_FILES_LEFT}
         RETURNING status`;
```

- [ ] **Step 8: Edit `server/db/tests.ts`**

Find this block:

```ts
// teacher's, is past the statuses of baremStatuses, or has no test file of the
// variant.
export async function requestBarem(db: D1Database, teacherId: number, testId: number, now: string, variant: TestVariant = 'class'): Promise<boolean> {
```

Replace it with:

```ts
// teacher's, is past the statuses of baremStatuses, or has no test file of the
// variant. A Quick Try test asks once, and only when it has no barem.
export async function requestBarem(db: D1Database, teacherId: number, testId: number, now: string, variant: TestVariant = 'class'): Promise<boolean> {
```

- [ ] **Step 9: Edit `server/db/tests.ts`**

Find this block:

```ts
       WHERE id = ? AND teacher_id = ? AND status IN (${baremStatuses(variant)}) AND ${c('test_file_key')} IS NOT NULL ${noCesGradingSql(variant)}
       RETURNING id`,
```

Replace it with:

```ts
       WHERE id = ? AND teacher_id = ? AND status IN (${baremStatuses(variant)}) AND ${c('test_file_key')} IS NOT NULL ${noCesGradingSql(variant)}
         AND (quick_try = 0 OR (barem_request = 'none' AND barem_unchecked = 0 AND barem_file_key IS NULL))
       RETURNING id`,
```

- [ ] **Step 10: Edit `server/db/quickTry.ts`**

Find this block:

```ts
  return rows.results.map((row) => ({ id: row.id, name: row.original_name, contentType: row.content_type, size: row.size, position: row.position }));
}
```

Replace it with:

```ts
  return rows.results.map((row) => ({ id: row.id, name: row.original_name, contentType: row.content_type, size: row.size, position: row.position }));
}

// Whether the test is a Quick Try test: its refusals have their own messages.
export async function isQuickTryTest(db: D1Database, testId: number): Promise<boolean> {
  const row = await db.prepare('SELECT quick_try FROM tests WHERE id = ?').bind(testId).first<{ quick_try: number }>();
  return row?.quick_try === 1;
}
```

- [ ] **Step 11: Edit `server/routes/tests.ts`**

Find this block:

```ts
import { isTestFileKind, PDF_TYPE, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE, testFileKey, type TestFileKind } from '../../shared/files.ts';
import { MAX_SCHEDULE_DAYS } from '../../shared/tests.ts';
```

Replace it with:

```ts
import { isTestFileKind, PDF_TYPE, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE, testFileKey, type TestFileKind } from '../../shared/files.ts';
import { QUICK_TRY_FILE_CHANGES } from '../../shared/quickTry.ts';
import { MAX_SCHEDULE_DAYS } from '../../shared/tests.ts';
```

- [ ] **Step 12: Edit `server/routes/tests.ts`**

Find this block:

```ts
} from '../db/lifecycle.ts';
import { getClassReport } from '../db/report.ts';
```

Replace it with:

```ts
} from '../db/lifecycle.ts';
import { isQuickTryTest } from '../db/quickTry.ts';
import { getClassReport } from '../db/report.ts';
```

- [ ] **Step 13: Edit `server/routes/tests.ts`**

Find this block:

```ts
      if (!test.files.test) throw new ApiError(409, 'missing_test_file', 'Încarcă testul înainte să generezi baremul.');
      throw new ApiError(409, 'not_editable', 'Baremul se poate genera doar înainte de evaluare.');
```

Replace it with:

```ts
      if (!test.files.test) throw new ApiError(409, 'missing_test_file', 'Încarcă testul înainte să generezi baremul.');
      if (await isQuickTryTest(c.env.DB, test.id)) {
        throw new ApiError(409, 'quick_try_barem', 'Într-o încercare rapidă, baremul se generează o singură dată și doar dacă nu ai încărcat unul.');
      }
      throw new ApiError(409, 'not_editable', 'Baremul se poate genera doar înainte de evaluare.');
```

- [ ] **Step 14: Edit `server/routes/tests.ts`**

Find this block:

```ts
    const saved = await saveTestFile(c.env.DB, teacherId, test.id, kind, stored, nowIso(), newUploadToken());
    // The replaced file is read in the write's own batch: the robot may have
```

Replace it with:

```ts
    const saved = await saveTestFile(c.env.DB, teacherId, test.id, kind, stored, nowIso(), newUploadToken());
    if (saved === null && (await isQuickTryTest(c.env.DB, test.id))) {
      await deleteFilesQuietly(c.env.FILES, [key]);
      throw new ApiError(409, 'quick_try_files', `Într-o încercare rapidă poți încărca testul și baremul de cel mult ${QUICK_TRY_FILE_CHANGES} ori în total.`);
    }
    // The replaced file is read in the write's own batch: the robot may have
```

- [ ] **Step 15: Edit `AGENTS.md`**

Find this block:

```markdown
- Every `/api/admin` and `/api/u` request first runs the `promoteDue` middleware. A router added under them keeps it.
- Quick Try (`docs/superpowers/specs/2026-11-09-quick-try-design.md`, migration 0026): one free grading without an account, at `/api/try`. Each try is a hidden guest teacher (`teachers.quick_try`, disabled, never an account) with its own class, student, test (`tests.quick_try`) and paper; its link `/api/try/<token>` serves the teacher API's own routes for that guest teacher behind an allow-list (`ALLOWED` in `server/routes/quickTry.ts`). A Quick Try test never gets a print job or a class analysis. The limits (`QUICK_TRY_IP_LIMIT` per IP and `QUICK_TRY_DAILY_LIMIT` in total per Bucharest day, `shared/quickTry.ts`) are checked in the SQL of the try's first INSERT (`createQuickTry`); a failed try gives its IP place back, not its daily place. An administrator skips Turnstile and the limits and is not counted.
- R2 is private: every file goes through the API with an ownership check. R2 keys come from rows, never from listing R2.
```

Replace it with:

```markdown
- Every `/api/admin` and `/api/u` request first runs the `promoteDue` middleware. A router added under them keeps it.
- Quick Try (`docs/superpowers/specs/2026-11-09-quick-try-design.md`, migration 0026): one free grading without an account, at `/api/try`. Each try is a hidden guest teacher (`teachers.quick_try`, disabled, never an account) with its own class, student, test (`tests.quick_try`) and paper; its link `/api/try/<token>` serves the teacher API's own routes for that guest teacher behind an allow-list (`ALLOWED` in `server/routes/quickTry.ts`). A Quick Try test never gets a print job or a class analysis. The limits (`QUICK_TRY_IP_LIMIT` per IP and `QUICK_TRY_DAILY_LIMIT` in total per Bucharest day, `shared/quickTry.ts`) are checked in the SQL of the try's first INSERT (`createQuickTry`); a failed try gives its IP place back, not its daily place. An administrator skips Turnstile and the limits and is not counted. One try makes bounded robot work, checked in the writes' SQL: one barem generation, only with no barem (`requestBarem`), and at most `QUICK_TRY_FILE_CHANGES` changes of its test and barem files (`saveTestFile`).
- R2 is private: every file goes through the API with an ownership check. R2 keys come from rows, never from listing R2.
```

- [ ] **Step 16: Run the test to see it pass**

Run: `npx vitest run server/routes/quickTryRobotWork.test.ts`
Expected: PASS, `Tests  4 passed (4)`.

- [ ] **Step 17: Typecheck and run all tests**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  145 passed | 1 skipped (146)`, `Tests  2240 passed | 3 skipped (2243)`.

- [ ] **Step 18: Commit**

```bash
git add server/routes/quickTryRobotWork.test.ts shared/quickTry.ts server/db/tests.ts server/db/quickTry.ts server/routes/tests.ts AGENTS.md
git commit -m "Bound the robot work of one Quick Try"
```

Check: `git diff --stat refs/protoqt/q5 HEAD -- . ':!docs'` prints nothing.

### Task 6: Check, live database, push

Runs in the main session. Each outward step waits for the user's yes.

- [ ] **Step 1: Run everything once more, also in UTC**

Run: `npm run typecheck`, `npm test`, then in Git Bash `TZ=UTC npm test` (PowerShell: `$env:TZ='UTC'; npm test; Remove-Item Env:TZ`)
Expected: no type errors; `Test Files  145 passed | 1 skipped (146)`, `Tests  2240 passed | 3 skipped (2243)`. both times.

- [ ] **Step 2: Ask the user, then apply migration 0026 to the live database**

Ask the user first. Then, from the repo root: `npx wrangler d1 migrations apply quickeval --remote`
Expected: `0026_quick_try.sql` applied, and no other migration pending before it.

- [ ] **Step 3: Ask the user, then push and open the pull request**

Ask the user first. Then: `git push -u origin feature/quick-try` and open a pull request to `main` titled "Quick Try, part A: the server". The body says: no page changes; the migration is applied live; `TURNSTILE_SECRET_KEY` is not needed until part C (without it only an administrator can make a try).

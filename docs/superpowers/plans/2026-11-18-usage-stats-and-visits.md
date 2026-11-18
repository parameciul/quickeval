# MQGrader: usage statistics and more visit counts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An administrator sees, on a new "Statistici" tab of Setări, how much the robot worked each day (papers, barems, exercise lists, class analyses, print PDFs, failures, tokens, and Quick Tries) for Quick Try, the teachers, or both, over the last 7 days, 30 days or 12 months; and Rybbit counts the student pages, the Quick Try pages and the teacher login screen without ever receiving a token.

**Architecture:** Migration 0035 adds `usage_days` (one row per teacher per Bucharest day, one per day for all Quick Try work, never deleted) and fills it from `robot_work` and `quick_tries`. Task 1 makes `logRobotWork` and `createQuickTry` add to it in their own batches (`server/db/usage.ts`). Task 2 adds `GET /api/admin/stats` (`readUsage`, one grouped query; `shared/usage.ts` holds the types and the period's days). Task 3 adds the tab (`UsageSection.tsx`), which reads only on "Generează". Task 4 adds the Rybbit script to `u/index.html` and `try/index.html` with masked paths and no referrer, loads it on the teacher login screen only (`src/ui/visits.ts`), counts two events, and updates the notes.

**Tech Stack:** Node 24, TypeScript, Hono on Cloudflare Pages Functions, D1 (SQLite), React 19, TanStack Query, Vitest, Testing Library, Rybbit (self-hosted, https://stats.mqgrader.ro). No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-18-usage-stats-and-visits-design.md` (approved by the user on 2026-11-18; Tasks 2 and 4 settle it to the prototype). Root `AGENTS.md`, `src/AGENTS.md` and `server/AGENTS.md` hold the project rules.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics. Code, comments and docs are English. Every address is English: `/api/admin/stats?source=all|quick-try|teachers&period=7d|30d|12m`, `?tab=stats`. No student page says how the work is graded.
- Migrations: one statement per `;` at a line end (the test helper splits on that), no `;` inside strings. Migration 0035 must run on the live database before this branch reaches `main` (`docs/deploy.md`).
- At most 15 D1 queries per request. The teacher pages read no data on a timer: the stats read only when "Generează" is pressed.
- The brand is flat: `src/ui/brand.css` has no `gradient(`. This plan adds no colour token.
- No token reaches Rybbit: not in a path, after `#`, in a query string, in a page title or in a referrer.
- Do not run Prettier or any formatter.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A`.
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root, on the branch that holds this plan. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy. If only tests of those files time out, or of `server/routes/evaluation.test.ts`, `server/routes/runner.test.ts` and `runner/tasks.test.ts` (an `ECONNRESET` or an `internal` answer from the local worker on a busy PC), run the failed files alone with `npx vitest run <files>`; the full run then counts as passed when its failed and passed tests add up to the expected numbers.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact for the branch alone. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/protous/us1` … `refs/protous/us4`, one per task, on `refs/protous/usbase` (`241be95`, the commit with the approved spec). After Task N, `git diff --stat refs/protous/usN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`).

## Rulings made while planning

Settled while building the prototype and looking at the tab on 2026-11-18 (desktop and 375 px, a local build with a year of sample rows). Tasks 2 and 4 write them into the spec; they are listed here so the user can check them while reading.

1. **A Quick Try's work goes in one row per day** (`quick_try = 1`, `teacher_id` 0), so it outlives the deleted guest teachers. A try counts in `tries` when its first INSERT made it; a refused try counts nothing.
2. **The past days** come from `robot_work` (since migration 0030) with a fixed `+2 hours` (every row is after 25 October 2026, when Bucharest is UTC+2), and the tries from `quick_tries.day`. Robot work done between the migration and the deploy (minutes) is not counted: accepted.
3. **The answer always has `tries`** (0 for the teachers); the screen hides the column for "Profesori". The rows come newest first, a day with no work as zeros.
4. **Rybbit's own rules** (read in its source, `server/src/analytics-script/`): the first mask that matches wins, `*` needs one character at least, and the path, the query string, the title and the referrer are sent as they are. So the student list is `/u/`, `/u/result/*`, `/u/rezultat/*`, `/u/*`, `/u/**`, and the Quick Try list `/try/*/phone`, `/try/*/telefon`, `/try/*`, `/try/**`; the catch-all at the end covers any other path and a `#` part.
5. **The teacher app loads the counter on the login screen only, in the built site only**, skipping every teacher path but `/teacher/` and `/teacher/#new-account` (`re:^/teacher/(?!$|#new-account$)`): the email links hold a token after `#`. After a login, a tab that loaded it reloads, so it never sees a logged-in teacher's page. A signed-out deep link is not counted, and the in-page "Cere un cont de profesor" button does not change the hash.
6. **The events** are `account-request-sent` and `quick-try-sent`, with no properties; the Quick Try one goes before a phone leaves for the try's phone page.

## Review Focus

1. A Quick Try is deleted after its 7 days: its day keeps its tries and its robot work (Task 1: "keeps the counts after the try is deleted").
2. Work just after Bucharest midnight belongs to the new day, not to the UTC day (Task 1: "starts a new day at Bucharest midnight, not at UTC midnight"; Task 2's tests run at 01:30 Bucharest time, still the day before in UTC).
3. A student's link with an extra folder or a `#` part still sends no token (Task 4: "never send a token in the path", for every form of each path).
4. The email links `confirm-email#<token>` and `new-password#<token>` are never counted (Task 4: "skip every other page, and the links of the emails with their token").
5. A teacher who logs in on the tab that counted the login screen is not counted afterwards (Task 4: "starts the tab again after a login when the counter was loaded").

---

### Task 1: Count the robot work and the Quick Tries per day

**Files:**
- Create: `migrations/0035_usage_days.sql`, `server/db/usage.ts`, `server/db/usage.test.ts`, `server/usageMigration.test.ts`
- Modify: `server/db/runner.ts`, `server/db/quickTry.ts`

**Interfaces:**
- Produces: table `usage_days (day, quick_try, teacher_id, papers, barems, exercise_lists, analyses, prints, failed, tokens, tries)`, primary key `(day, quick_try, teacher_id)`; `countRobotWorkDay(db, work: { testId; kind: RobotWorkKind; ok; tokens?; at }): D1PreparedStatement` and `countQuickTryDay(db, day: string, tokenHash: string): D1PreparedStatement` in `server/db/usage.ts`.

- [ ] **Step 1: Create `server/db/usage.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QUICK_TRY_IP_LIMIT } from '../../shared/quickTry.ts';
import { cleanUpTries } from '../quickTryCleanup.ts';
import { makeClass, makeTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
import { logRobotWork } from './runner.ts';

// The robot's work per Bucharest day (usage_days), written with every job the
// robot logs and with every Quick Try that is made.

let api: TestApi;

beforeEach(async () => {
  api = await startTestApi({ app: { verifyTurnstile: async () => true } });
});

afterEach(async () => {
  await api.dispose();
});

const days = async () =>
  (
    await api.db
      .prepare(
        `SELECT day, quick_try, teacher_id, papers, barems, exercise_lists, analyses, prints, failed, tokens, tries
         FROM usage_days ORDER BY day, quick_try, teacher_id`,
      )
      .all()
  ).results;

const zero = { papers: 0, barems: 0, exercise_lists: 0, analyses: 0, prints: 0, failed: 0, tokens: 0, tries: 0 };

async function classTest(): Promise<number> {
  const { id } = await makeClass(api, '9A', ['Ana Pop']);
  return testIdOf(api, await makeTest(api, id));
}

describe('the robot work of a day', () => {
  it('counts each kind that worked in its own column, a failure in failed, and adds the tokens', async () => {
    const testId = await classTest();
    const at = '2026-11-18T09:00:00.000Z';
    await logRobotWork(api.db, { testId, kind: 'grading', variant: 'class', ok: true, tokens: 1000, at });
    await logRobotWork(api.db, { testId, kind: 'grading', variant: 'ces', ok: true, tokens: 500, at });
    await logRobotWork(api.db, { testId, kind: 'barem', variant: 'class', ok: true, tokens: 300, at });
    await logRobotWork(api.db, { testId, kind: 'exercise_list', variant: 'class', ok: true, tokens: 200, at });
    await logRobotWork(api.db, { testId, kind: 'analysis', variant: 'class', ok: true, tokens: 100, at });
    await logRobotWork(api.db, { testId, kind: 'print', variant: 'class', ok: true, at });
    await logRobotWork(api.db, { testId, kind: 'grading', variant: 'class', ok: false, tokens: 999, at });
    expect(await days()).toEqual([
      { ...zero, day: '2026-11-18', quick_try: 0, teacher_id: api.teacherId, papers: 2, barems: 1, exercise_lists: 1, analyses: 1, prints: 1, failed: 1, tokens: 2100 },
    ]);
  });

  it('keeps one row per teacher', async () => {
    const mine = await classTest();
    const otherId = await api.addTeacher('alt@example.com', 'Alt Profesor');
    const { id: classId } = await makeClass(api, '9B', ['Ion Pop']);
    const other = await testIdOf(api, await makeTest(api, classId));
    await api.db.prepare('UPDATE tests SET teacher_id = ? WHERE id = ?').bind(otherId, other).run();
    const at = '2026-11-18T09:00:00.000Z';
    await logRobotWork(api.db, { testId: mine, kind: 'grading', variant: 'class', ok: true, tokens: 10, at });
    await logRobotWork(api.db, { testId: other, kind: 'grading', variant: 'class', ok: true, tokens: 20, at });
    expect((await days()).map((row) => [row.teacher_id, row.papers, row.tokens])).toEqual([
      [api.teacherId, 1, 10],
      [otherId, 1, 20],
    ]);
  });

  it('starts a new day at Bucharest midnight, not at UTC midnight', async () => {
    const testId = await classTest();
    await logRobotWork(api.db, { testId, kind: 'grading', variant: 'class', ok: true, at: '2026-11-17T21:59:00.000Z' });
    await logRobotWork(api.db, { testId, kind: 'grading', variant: 'class', ok: true, at: '2026-11-17T22:01:00.000Z' });
    expect((await days()).map((row) => [row.day, row.papers])).toEqual([
      ['2026-11-17', 1],
      ['2026-11-18', 1],
    ]);
  });

  it('counts nothing for a test that no longer exists', async () => {
    await logRobotWork(api.db, { testId: 99999, kind: 'grading', variant: 'class', ok: true, at: '2026-11-18T09:00:00.000Z' });
    expect(await days()).toEqual([]);
  });
});

describe('the Quick Try work of a day', () => {
  // A visitor who is not logged in: an administrator's try skips the limits.
  beforeEach(async () => {
    await api.dispose();
    api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined }, app: { verifyTurnstile: async () => true } });
  });

  const makeTry = async (ip = '203.0.113.7') => (await api.request('POST', '/api/try', { turnstileToken: 'ok' }, { 'CF-Connecting-IP': ip })).status;

  it('counts a made try, and its robot work in the day\'s Quick Try row, not on its guest teacher', async () => {
    expect(await makeTry()).toBe(201);
    const test = await api.db.prepare('SELECT id FROM tests WHERE quick_try = 1').first<{ id: number }>();
    await logRobotWork(api.db, { testId: test!.id, kind: 'barem', variant: 'class', ok: true, tokens: 70, at: new Date().toISOString() });
    await logRobotWork(api.db, { testId: test!.id, kind: 'grading', variant: 'class', ok: true, tokens: 30, at: new Date().toISOString() });
    const rows = await days();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ quick_try: 1, teacher_id: 0, tries: 1, barems: 1, papers: 1, tokens: 100 });
  });

  it('does not count a try refused by the limit', async () => {
    for (let i = 0; i < QUICK_TRY_IP_LIMIT; i++) expect(await makeTry()).toBe(201);
    expect(await makeTry()).toBe(429);
    expect((await days())[0]).toMatchObject({ quick_try: 1, tries: QUICK_TRY_IP_LIMIT });
  });

  it('keeps the counts after the try is deleted', async () => {
    expect(await makeTry()).toBe(201);
    const test = await api.db.prepare('SELECT id FROM tests WHERE quick_try = 1').first<{ id: number }>();
    await logRobotWork(api.db, { testId: test!.id, kind: 'grading', variant: 'class', ok: true, tokens: 5, at: new Date().toISOString() });
    expect(await cleanUpTries(api.env, '2099-01-01T00:00:00.000Z')).toBe(1);
    expect(await api.db.prepare('SELECT COUNT(*) AS n FROM teachers WHERE quick_try = 1').first()).toEqual({ n: 0 });
    expect((await days())[0]).toMatchObject({ quick_try: 1, tries: 1, papers: 1, tokens: 5 });
  });
});
```

- [ ] **Step 2: Create `server/usageMigration.test.ts`**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { D1Database } from '@cloudflare/workers-types';
import { afterEach, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { splitSql } from './test/testApi.ts';

// Migration 0035 on a database that already has robot work and Quick Tries,
// as the live one does.

const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url);
let dispose: (() => Promise<void>) | undefined;

afterEach(async () => {
  await dispose?.();
  dispose = undefined;
});

async function databaseBefore0035(): Promise<{ db: D1Database; apply0035: () => Promise<void> }> {
  const platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: fileURLToPath(new URL('../wrangler.toml', import.meta.url)),
    persist: false,
    remoteBindings: false,
  });
  dispose = () => platform.dispose();
  const db = platform.env.DB;
  const files = readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.sql')).sort();
  const run = async (file: string) => {
    const sql = readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8');
    await db.batch(splitSql(sql).map((statement) => db.prepare(statement)));
  };
  for (const file of files.filter((name) => name < '0035')) await run(file);
  return { db, apply0035: () => run(files.find((name) => name.startsWith('0035'))!) };
}

describe('migration 0035', () => {
  it('fills the past days from the robot log and the tries that still exist', async () => {
    const { db, apply0035 } = await databaseBefore0035();
    const teacher = (email: string, quickTry: number) =>
      db
        .prepare("INSERT INTO teachers (email, name, created_at, quick_try) VALUES (?, 'X', '2026-11-14T08:00:00.000Z', ?) RETURNING id")
        .bind(email, quickTry)
        .first<{ id: number }>();
    const laura = (await teacher('laura@example.com', 0))!.id;
    const guest1 = (await teacher('guest1@example.com', 1))!.id;
    const guest2 = (await teacher('guest2@example.com', 1))!.id;
    const work = (teacherId: number, kind: string, ok: number, tokens: number | null, at: string) =>
      db
        .prepare('INSERT INTO robot_work (teacher_id, test_id, kind, variant, ok, tokens, at) VALUES (?, NULL, ?, ?, ?, ?, ?)')
        .bind(teacherId, kind, 'class', ok, tokens, at)
        .run();
    await work(laura, 'grading', 1, 100, '2026-11-14T10:00:00.000Z');
    await work(laura, 'grading', 1, 50, '2026-11-14T21:59:00.000Z');
    await work(laura, 'grading', 0, null, '2026-11-14T22:30:00.000Z');
    await work(laura, 'print', 1, null, '2026-11-14T22:30:00.000Z');
    await work(laura, 'analysis', 1, 40, '2026-11-15T09:00:00.000Z');
    await work(guest1, 'barem', 1, 7, '2026-11-15T09:00:00.000Z');
    await work(guest2, 'grading', 1, 3, '2026-11-15T10:00:00.000Z');
    const tryRow = (teacherId: number, token: string, day: string) =>
      db
        .prepare("INSERT INTO quick_tries (teacher_id, token_hash, day, ip_hash, created_at, expires_at) VALUES (?, ?, ?, 'ip', '2026-11-15T08:00:00.000Z', '2026-11-22T08:00:00.000Z')")
        .bind(teacherId, token, day)
        .run();
    await tryRow(guest1, 'a', '2026-11-15');
    await tryRow(guest2, 'b', '2026-11-15');

    await apply0035();

    const rows = await db
      .prepare('SELECT day, quick_try, teacher_id, papers, barems, exercise_lists, analyses, prints, failed, tokens, tries FROM usage_days ORDER BY day, quick_try, teacher_id')
      .all();
    expect(rows.results).toEqual([
      { day: '2026-11-14', quick_try: 0, teacher_id: laura, papers: 2, barems: 0, exercise_lists: 0, analyses: 0, prints: 0, failed: 0, tokens: 150, tries: 0 },
      { day: '2026-11-15', quick_try: 0, teacher_id: laura, papers: 0, barems: 0, exercise_lists: 0, analyses: 1, prints: 1, failed: 1, tokens: 40, tries: 0 },
      { day: '2026-11-15', quick_try: 1, teacher_id: 0, papers: 1, barems: 1, exercise_lists: 0, analyses: 0, prints: 0, failed: 0, tokens: 10, tries: 2 },
    ]);
  });

  it('makes a Quick Try row for a day with tries and no robot work', async () => {
    const { db, apply0035 } = await databaseBefore0035();
    const guest = await db
      .prepare("INSERT INTO teachers (email, name, created_at, quick_try) VALUES ('g@example.com', 'X', '2026-11-16T08:00:00.000Z', 1) RETURNING id")
      .first<{ id: number }>();
    await db
      .prepare("INSERT INTO quick_tries (teacher_id, token_hash, day, ip_hash, created_at, expires_at) VALUES (?, 'a', '2026-11-16', 'ip', '2026-11-16T08:00:00.000Z', '2026-11-23T08:00:00.000Z')")
      .bind(guest!.id)
      .run();
    await apply0035();
    const rows = await db.prepare('SELECT day, quick_try, teacher_id, papers, tries FROM usage_days').all();
    expect(rows.results).toEqual([{ day: '2026-11-16', quick_try: 1, teacher_id: 0, papers: 0, tries: 1 }]);
  });
});
```

- [ ] **Step 3: Run the new tests to see them fail**

Run: `npx vitest run server/db/usage.test.ts server/usageMigration.test.ts`

Expected: FAIL. `Test Files  2 failed (2)`, `Tests  9 failed (9)`: the seven tests of `server/db/usage.test.ts` fail with `D1_ERROR: no such table: usage_days`, and the two of `server/usageMigration.test.ts` with `ENOENT: no such file or directory, open '…migrations\undefined'` (there is no migration 0035 yet).

- [ ] **Step 4: Create `migrations/0035_usage_days.sql`**

```sql
-- The robot's work per Bucharest day, for the statistics on Setări: one row
-- per teacher per day, and one row per day for all the Quick Try work
-- (quick_try = 1, teacher_id 0: the guest teachers are deleted after their
-- days, and their work must stay counted). teacher_id has no foreign key, so a
-- refused or deleted account keeps its days. A job counts in its own column
-- only when it worked, a failed one in failed, and tokens adds the tokens
-- Claude reported. tries counts the Quick Tries made that day. One statement
-- per ";" line end (the test helper splits on that), and no ";" inside strings.

CREATE TABLE usage_days (
  day TEXT NOT NULL,
  quick_try INTEGER NOT NULL CHECK (quick_try IN (0, 1)),
  teacher_id INTEGER NOT NULL,
  papers INTEGER NOT NULL DEFAULT 0,
  barems INTEGER NOT NULL DEFAULT 0,
  exercise_lists INTEGER NOT NULL DEFAULT 0,
  analyses INTEGER NOT NULL DEFAULT 0,
  prints INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  tries INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, quick_try, teacher_id)
);

-- The days before this migration, from the robot's log (it starts with
-- migration 0030) and the tries that still exist. Every logged row is from
-- after 25 October 2026, when Bucharest is UTC+2, so two hours give its day.
INSERT INTO usage_days (day, quick_try, teacher_id, papers, barems, exercise_lists, analyses, prints, failed, tokens)
  SELECT date(w.at, '+2 hours'), t.quick_try, CASE WHEN t.quick_try = 1 THEN 0 ELSE w.teacher_id END,
    SUM(w.ok = 1 AND w.kind = 'grading'), SUM(w.ok = 1 AND w.kind = 'barem'), SUM(w.ok = 1 AND w.kind = 'exercise_list'),
    SUM(w.ok = 1 AND w.kind = 'analysis'), SUM(w.ok = 1 AND w.kind = 'print'), SUM(w.ok = 0), COALESCE(SUM(w.tokens), 0)
  FROM robot_work w JOIN teachers t ON t.id = w.teacher_id
  GROUP BY 1, 2, 3;

INSERT INTO usage_days (day, quick_try, teacher_id, tries)
  SELECT day, 1, 0, COUNT(*) FROM quick_tries WHERE 1 GROUP BY day
  ON CONFLICT (day, quick_try, teacher_id) DO UPDATE SET tries = excluded.tries;
```

- [ ] **Step 5: Create `server/db/usage.ts`**

```ts
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { RobotWorkKind } from '../../shared/accounts.ts';
import { bucharestDay } from '../../shared/quickTry.ts';

// The column of usage_days that counts a job of each kind when it worked.
const COLUMN: Record<RobotWorkKind, string> = {
  grading: 'papers',
  barem: 'barems',
  exercise_list: 'exercise_lists',
  analysis: 'analyses',
  print: 'prints',
};

// Adds one robot job to its day's row (migration 0035): the teacher's own row,
// or the day's Quick Try row when the test is a try. The teacher and the kind
// of test come from the test row, so a test deleted in the same moment counts
// nothing, as in robot_work.
export function countRobotWorkDay(
  db: D1Database,
  work: { testId: number; kind: RobotWorkKind; ok: boolean; tokens?: number | null; at: string },
): D1PreparedStatement {
  const column = work.ok ? COLUMN[work.kind] : 'failed';
  const tokens = work.ok ? (work.tokens ?? 0) : 0;
  return db
    .prepare(
      `INSERT INTO usage_days (day, quick_try, teacher_id, ${column}, tokens)
       SELECT ?1, quick_try, CASE WHEN quick_try = 1 THEN 0 ELSE teacher_id END, 1, ?2 FROM tests WHERE id = ?3
       ON CONFLICT (day, quick_try, teacher_id) DO UPDATE SET ${column} = ${column} + 1, tokens = tokens + excluded.tokens`,
    )
    .bind(bucharestDay(new Date(work.at)), tokens, work.testId);
}

// Adds one Quick Try to its day's row, when the try of this token exists: put
// in the batch that makes the try, after its INSERT, it counts only a try that
// was made.
export function countQuickTryDay(db: D1Database, day: string, tokenHash: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO usage_days (day, quick_try, teacher_id, tries)
       SELECT ?1, 1, 0, 1 FROM quick_tries WHERE token_hash = ?2
       ON CONFLICT (day, quick_try, teacher_id) DO UPDATE SET tries = tries + 1`,
    )
    .bind(day, tokenHash);
}
```

- [ ] **Step 6: Edit `server/db/runner.ts`**

Find this block:

```ts
import { exerciseColumns, type StoredItem } from './exerciseColumns.ts';
import { baremActiveSql, columns, needsBaremSql, needsPrintSql, paperVariantSql } from './variant.ts';
```

Replace it with:

```ts
import { exerciseColumns, type StoredItem } from './exerciseColumns.ts';
import { countRobotWorkDay } from './usage.ts';
import { baremActiveSql, columns, needsBaremSql, needsPrintSql, paperVariantSql } from './variant.ts';
```

- [ ] **Step 7: Edit `server/db/runner.ts`**

Find this block:

```ts
// moment logs nothing: there is no account to put it on. A failed attempt has
// no tokens, and a print PDF is made without Claude.
export async function logRobotWork(
```

Replace it with:

```ts
// moment logs nothing: there is no account to put it on. A failed attempt has
// no tokens, and a print PDF is made without Claude. The same batch adds the
// job to its day, for the usage statistics.
export async function logRobotWork(
```

- [ ] **Step 8: Edit `server/db/runner.ts`**

Find this block:

```ts
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO robot_work (teacher_id, test_id, kind, variant, ok, tokens, at)
       SELECT teacher_id, id, ?, ?, ?, ?, ? FROM tests WHERE id = ?`,
    )
    .bind(work.kind, work.variant, work.ok ? 1 : 0, work.ok ? (work.tokens ?? null) : null, work.at, work.testId)
    .run();
}
```

Replace it with:

```ts
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO robot_work (teacher_id, test_id, kind, variant, ok, tokens, at)
         SELECT teacher_id, id, ?, ?, ?, ?, ? FROM tests WHERE id = ?`,
      )
      .bind(work.kind, work.variant, work.ok ? 1 : 0, work.ok ? (work.tokens ?? null) : null, work.at, work.testId),
    countRobotWorkDay(db, work),
  ]);
}
```

- [ ] **Step 9: Edit `server/db/quickTry.ts`**

Find this block:

```ts
import { buildTestCode } from '../../shared/tests.ts';

```

Replace it with:

```ts
import { buildTestCode } from '../../shared/tests.ts';
import { countQuickTryDay } from './usage.ts';

```

- [ ] **Step 10: Edit `server/db/quickTry.ts`**

Find this block:

```ts
      .bind(input.sessionHash, input.resultToken, input.now, input.email),
  ]);
```

Replace it with:

```ts
      .bind(input.sessionHash, input.resultToken, input.now, input.email),
    countQuickTryDay(db, day, input.tokenHash),
  ]);
```

- [ ] **Step 11: Typecheck and run the whole suite**

Run: `npm run typecheck`, then `npm test`

Expected: no type error; `Test Files  208 passed | 1 skipped (209)`, `Tests  3207 passed | 3 skipped (3210)`.

- [ ] **Step 12: Check against the prototype and commit**

```bash
git add migrations/0035_usage_days.sql server/db/usage.ts server/db/usage.test.ts server/usageMigration.test.ts server/db/runner.ts server/db/quickTry.ts
git diff --cached --stat refs/protous/us1 -- . ':!docs/superpowers/plans'
git commit -m "Count the robot work and the Quick Tries per day"
```

The `git diff` line prints nothing.

---

### Task 2: The statistics of a period (the API)

**Files:**
- Create: `shared/usage.ts`, `shared/usage.test.ts`, `server/routes/usage.ts`, `server/routes/usage.test.ts`
- Modify: `server/db/usage.ts`, `server/routes/admin.ts`, `AGENTS.md`, `docs/superpowers/specs/2026-11-18-usage-stats-and-visits-design.md`

**Interfaces:**
- Consumes: Task 1's `usage_days`.
- Produces: in `shared/usage.ts`: `USAGE_SOURCES`, `UsageSource` (`'all' | 'quick-try' | 'teachers'`), `USAGE_PERIODS`, `UsagePeriod` (`'7d' | '30d' | '12m'`), `UsageCounts { papers; barems; exerciseLists; analyses; prints; failed; tokens; tries }`, `UsageRow extends UsageCounts { key }`, `UsageStats { source; period; totals; rows }`, `EMPTY_USAGE`, `isUsageSource`, `isUsagePeriod`, `usageKeys(period, today): string[]`; `readUsage(db, source, period, now): Promise<UsageStats>` in `server/db/usage.ts`; `GET /api/admin/stats` answers `{ stats: UsageStats }`, 400 `invalid` "Statistica cerută nu este validă.", 403 `admin_only`.

- [ ] **Step 1: Create `shared/usage.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { isUsagePeriod, isUsageSource, usageKeys } from './usage.ts';

describe('usageKeys', () => {
  it('gives the last 7 days, today first', () => {
    expect(usageKeys('7d', '2026-11-18')).toEqual(['2026-11-18', '2026-11-17', '2026-11-16', '2026-11-15', '2026-11-14', '2026-11-13', '2026-11-12']);
  });

  it('crosses the start of a month and of a year', () => {
    expect(usageKeys('7d', '2027-01-02')).toEqual(['2027-01-02', '2027-01-01', '2026-12-31', '2026-12-30', '2026-12-29', '2026-12-28', '2026-12-27']);
  });

  it('gives 30 days, the oldest 29 days before today, across a leap day', () => {
    const keys = usageKeys('30d', '2028-03-10');
    expect(keys).toHaveLength(30);
    expect(keys[0]).toBe('2028-03-10');
    expect(keys).toContain('2028-02-29');
    expect(keys[29]).toBe('2028-02-10');
  });

  it('gives the last 12 calendar months, this month first', () => {
    expect(usageKeys('12m', '2026-11-30')).toEqual([
      '2026-11', '2026-10', '2026-09', '2026-08', '2026-07', '2026-06',
      '2026-05', '2026-04', '2026-03', '2026-02', '2026-01', '2025-12',
    ]);
  });
});

describe('the address values', () => {
  it('accept only the English sources and periods', () => {
    expect(['all', 'quick-try', 'teachers', 'toate', undefined].map(isUsageSource)).toEqual([true, true, true, false, false]);
    expect(['7d', '30d', '12m', '1y', undefined].map(isUsagePeriod)).toEqual([true, true, true, false, false]);
  });
});
```

- [ ] **Step 2: Create `server/routes/usage.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_USAGE } from '../../shared/usage.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// GET /api/admin/stats: the usage statistics on Setări.

let api: TestApi;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 18 November 2026, 01:30 in Bucharest: still 17 November in UTC.
  vi.setSystemTime(new Date('2026-11-17T23:30:00.000Z'));
  api = await startTestApi();
});

afterEach(async () => {
  await api.dispose();
  vi.useRealTimers();
});

const addDay = (day: string, quickTry: number, teacherId: number, counts: Record<string, number>) => {
  const names = Object.keys(counts);
  return api.db
    .prepare(`INSERT INTO usage_days (day, quick_try, teacher_id, ${names.join(', ')}) VALUES (?, ?, ?, ${names.map(() => '?').join(', ')})`)
    .bind(day, quickTry, teacherId, ...Object.values(counts))
    .run();
};

const stats = async (source: string, period: string) => {
  const res = await api.request('GET', `/api/admin/stats?source=${source}&period=${period}`);
  expect(res.status).toBe(200);
  return res.body.stats;
};

describe('GET /api/admin/stats', () => {
  beforeEach(async () => {
    await addDay('2026-11-18', 0, api.teacherId, { papers: 5, barems: 1, tokens: 500 });
    await addDay('2026-11-18', 0, 777, { papers: 2, exercise_lists: 1, failed: 1, tokens: 200 });
    await addDay('2026-11-18', 1, 0, { papers: 1, barems: 1, tries: 3, tokens: 90 });
    await addDay('2026-11-16', 0, api.teacherId, { analyses: 1, prints: 2, tokens: 40 });
    await addDay('2026-11-12', 0, api.teacherId, { papers: 9 });
    await addDay('2026-10-20', 1, 0, { tries: 4 });
    await addDay('2025-11-30', 0, api.teacherId, { papers: 100 });
  });

  it('adds every teacher and Quick Try for each of the last 7 Bucharest days, today first, with zeros for a day with no work', async () => {
    const body = await stats('all', '7d');
    expect(body.rows.map((row: { key: string }) => row.key)).toEqual(['2026-11-18', '2026-11-17', '2026-11-16', '2026-11-15', '2026-11-14', '2026-11-13', '2026-11-12']);
    expect(body.rows[0]).toEqual({ key: '2026-11-18', papers: 8, barems: 2, exerciseLists: 1, analyses: 0, prints: 0, failed: 1, tokens: 790, tries: 3 });
    expect(body.rows[1]).toEqual({ key: '2026-11-17', ...EMPTY_USAGE });
    expect(body.totals).toEqual({ papers: 17, barems: 2, exerciseLists: 1, analyses: 1, prints: 2, failed: 1, tokens: 830, tries: 3 });
    expect(body).toMatchObject({ source: 'all', period: '7d' });
  });

  it('keeps Quick Try and the teachers apart', async () => {
    expect((await stats('quick-try', '7d')).totals).toEqual({ ...EMPTY_USAGE, papers: 1, barems: 1, tries: 3, tokens: 90 });
    expect((await stats('teachers', '7d')).totals).toEqual({ ...EMPTY_USAGE, papers: 16, barems: 1, exerciseLists: 1, analyses: 1, prints: 2, failed: 1, tokens: 740 });
  });

  it('gives 30 days', async () => {
    const body = await stats('quick-try', '30d');
    expect(body.rows).toHaveLength(30);
    expect(body.rows.at(-1).key).toBe('2026-10-20');
    expect(body.totals.tries).toBe(7);
  });

  it('gives the last 12 calendar months, and leaves out the month before them', async () => {
    const body = await stats('all', '12m');
    expect(body.rows).toHaveLength(12);
    expect(body.rows[0]).toMatchObject({ key: '2026-11', papers: 17, tries: 3 });
    expect(body.rows[1]).toMatchObject({ key: '2026-10', tries: 4 });
    expect(body.rows.at(-1)).toEqual({ key: '2025-12', ...EMPTY_USAGE });
    expect(body.totals.papers).toBe(17);
  });

  it('refuses a source or a period it does not know', async () => {
    for (const query of ['source=toate&period=7d', 'source=all&period=1y', 'source=all', '']) {
      const res = await api.request('GET', `/api/admin/stats?${query}`);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Statistica cerută nu este validă.');
    }
  });

  it('is only for administrators', async () => {
    await api.addTeacher('bogdan@example.com', 'Bogdan');
    api.env.DEV_TEACHER_EMAIL = 'bogdan@example.com';
    const res = await api.request('GET', '/api/admin/stats?source=all&period=7d');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('admin_only');
  });
});
```

- [ ] **Step 3: Run the new tests to see them fail**

Run: `npx vitest run shared/usage.test.ts server/routes/usage.test.ts`

Expected: FAIL. `Test Files  2 failed (2)`, `Tests  no tests`: `shared/usage.test.ts` fails with `Cannot find module './usage.ts'`, and `server/routes/usage.test.ts` with `Cannot find module '../../shared/usage.ts'`.

- [ ] **Step 4: Create `shared/usage.ts`**

```ts
// The usage statistics on Setări (spec
// docs/superpowers/specs/2026-11-18-usage-stats-and-visits-design.md): the
// robot's work per Bucharest day, for Quick Try, for the teachers, or both.

export const USAGE_SOURCES = ['all', 'quick-try', 'teachers'] as const;
export type UsageSource = (typeof USAGE_SOURCES)[number];

// The last 7 days, the last 30 days (one entry per day), or the last 12
// calendar months (one entry per month), today and this month included.
export const USAGE_PERIODS = ['7d', '30d', '12m'] as const;
export type UsagePeriod = (typeof USAGE_PERIODS)[number];

export interface UsageCounts {
  papers: number;
  barems: number;
  exerciseLists: number;
  analyses: number;
  prints: number;
  failed: number;
  tokens: number;
  tries: number;
}

// One day ("YYYY-MM-DD") or one month ("YYYY-MM") of a period.
export interface UsageRow extends UsageCounts {
  key: string;
}

// The newest day or month first. `tries` is always 0 for the teachers.
export interface UsageStats {
  source: UsageSource;
  period: UsagePeriod;
  totals: UsageCounts;
  rows: UsageRow[];
}

export const EMPTY_USAGE: UsageCounts = { papers: 0, barems: 0, exerciseLists: 0, analyses: 0, prints: 0, failed: 0, tokens: 0, tries: 0 };

export function isUsageSource(raw: string | undefined): raw is UsageSource {
  return (USAGE_SOURCES as readonly string[]).includes(raw ?? '');
}

export function isUsagePeriod(raw: string | undefined): raw is UsagePeriod {
  return (USAGE_PERIODS as readonly string[]).includes(raw ?? '');
}

// The days or months of a period that ends on `today` (a Bucharest day,
// "YYYY-MM-DD"), the newest first.
export function usageKeys(period: UsagePeriod, today: string): string[] {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  if (period === '12m') {
    return Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(year, month - 1 - i, 1)).toISOString().slice(0, 7));
  }
  const count = period === '7d' ? 7 : 30;
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(year, month - 1, day - i)).toISOString().slice(0, 10));
}
```

- [ ] **Step 5: Edit `server/db/usage.ts`**

Find this block:

```ts
import { bucharestDay } from '../../shared/quickTry.ts';

```

Replace it with:

```ts
import { bucharestDay } from '../../shared/quickTry.ts';
import { EMPTY_USAGE, type UsageCounts, type UsagePeriod, type UsageSource, type UsageStats, usageKeys } from '../../shared/usage.ts';

```

- [ ] **Step 6: Edit `server/db/usage.ts`**

Find this block:

```ts
    .bind(day, tokenHash);
}
```

Replace it with:

```ts
    .bind(day, tokenHash);
}

const SOURCE_FILTER: Record<UsageSource, string> = { all: '', 'quick-try': 'AND quick_try = 1', teachers: 'AND quick_try = 0' };

// The usage statistics of a period ending today (Bucharest): one query that
// adds the rows of each day (or month) in SQL. A day with no row shows zeros.
export async function readUsage(db: D1Database, source: UsageSource, period: UsagePeriod, now: string): Promise<UsageStats> {
  const keys = usageKeys(period, bucharestDay(new Date(now)));
  const length = period === '12m' ? 7 : 10;
  const from = period === '12m' ? `${keys.at(-1)}-01` : keys.at(-1)!;
  const { results } = await db
    .prepare(
      `SELECT substr(day, 1, ?1) AS key, SUM(papers) AS papers, SUM(barems) AS barems, SUM(exercise_lists) AS exerciseLists,
         SUM(analyses) AS analyses, SUM(prints) AS prints, SUM(failed) AS failed, SUM(tokens) AS tokens, SUM(tries) AS tries
       FROM usage_days WHERE day >= ?2 ${SOURCE_FILTER[source]} GROUP BY key`,
    )
    .bind(length, from)
    .all<UsageCounts & { key: string }>();
  const byKey = new Map(results.map((row) => [row.key, row]));
  const rows = keys.map((key) => {
    const { key: _, ...counts } = byKey.get(key) ?? { key, ...EMPTY_USAGE };
    return { key, ...counts };
  });
  const totals = { ...EMPTY_USAGE };
  for (const row of rows) for (const name of Object.keys(totals) as (keyof UsageCounts)[]) totals[name] += row[name];
  return { source, period, totals, rows };
}
```

- [ ] **Step 7: Create `server/routes/usage.ts`**

```ts
import { Hono } from 'hono';
import { isUsagePeriod, isUsageSource } from '../../shared/usage.ts';
import { adminOnly } from '../auth/teacherAuth.ts';
import { readUsage } from '../db/usage.ts';
import type { AppEnv } from '../env.ts';
import { ApiError } from '../errors.ts';
import { nowIso } from '../http.ts';

// /api/admin/stats: the usage statistics on Setări, for administrators only.
// The page asks only when the administrator presses "Generează".
export function usageRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', adminOnly);

  routes.get('/', async (c) => {
    const source = c.req.query('source');
    const period = c.req.query('period');
    if (!isUsageSource(source) || !isUsagePeriod(period)) throw new ApiError(400, 'invalid', 'Statistica cerută nu este validă.');
    return c.json({ stats: await readUsage(c.env.DB, source, period, nowIso()) });
  });

  return routes;
}
```

- [ ] **Step 8: Edit `server/routes/admin.ts`**

Find this block:

```ts
import { testRoutes } from './tests.ts';
import { dataVersion } from '../db/version.ts';
```

Replace it with:

```ts
import { testRoutes } from './tests.ts';
import { usageRoutes } from './usage.ts';
import { dataVersion } from '../db/version.ts';
```

- [ ] **Step 9: Edit `server/routes/admin.ts`**

Find this block:

```ts
  routes.route('/settings', settingsRoutes());
  routes.route('/account', ownAccountRoutes());
```

Replace it with:

```ts
  routes.route('/settings', settingsRoutes());
  routes.route('/stats', usageRoutes());
  routes.route('/account', ownAccountRoutes());
```

- [ ] **Step 10: Edit `AGENTS.md`**

Find this block:

```markdown
- The robot's Claude reads only its work folder and gets no robot key and no API key. Robot answers and logs carry no names.
- The PDFs and the CSV are made in the browser (`src/admin/pdf/`, `shared/csv.ts`). The student's PDF is made from `StudentPdfInput`, which has no confidence and no review reason; the CSV guards every text cell against formulas.
```

Replace it with:

```markdown
- The robot's Claude reads only its work folder and gets no robot key and no API key. Robot answers and logs carry no names.
- The usage statistics (Setări, "Statistici", `GET /api/admin/stats`): every robot job counts in `usage_days` (migration 0035), one row per teacher per Bucharest day and one per day for all Quick Try work, written in the batch of `logRobotWork` (`server/db/usage.ts`); a made Quick Try counts in `tries` in the batch of `createQuickTry`. These rows are never deleted, so a deleted try or account keeps its days. A new kind of robot work gets its column there too.
- The PDFs and the CSV are made in the browser (`src/admin/pdf/`, `shared/csv.ts`). The student's PDF is made from `StudentPdfInput`, which has no confidence and no review reason; the CSV guards every text cell against formulas.
```

- [ ] **Step 11: Edit `docs/superpowers/specs/2026-11-18-usage-stats-and-visits-design.md`**

Find this block:

```markdown
- `12m`: the last 12 calendar months, this month included; one entry per month.
- The answer has the totals of the period and the list of days or months. `tries` is in the answer only for `all` and `quick-try`.
- One query, summing the rows in SQL (`GROUP BY day` or by month). At most a few thousand small rows a year.
```

Replace it with:

```markdown
- `12m`: the last 12 calendar months, this month included; one entry per month.
- The answer has the totals of the period and the list of days or months, the newest first (`UsageStats` in `shared/usage.ts`). `tries` is always in it, 0 for `teachers`.
- One query, summing the rows in SQL (`GROUP BY day` or by month). At most a few thousand small rows a year.
```

- [ ] **Step 12: Typecheck and run the whole suite**

Run: `npm run typecheck`, then `npm test`

Expected: no type error; `Test Files  210 passed | 1 skipped (211)`, `Tests  3218 passed | 3 skipped (3221)`.

- [ ] **Step 13: Check against the prototype and commit**

```bash
git add shared/usage.ts shared/usage.test.ts server/db/usage.ts server/routes/usage.ts server/routes/usage.test.ts server/routes/admin.ts AGENTS.md docs/superpowers/specs/2026-11-18-usage-stats-and-visits-design.md
git diff --cached --stat refs/protous/us2 -- . ':!docs/superpowers/plans'
git commit -m "Give the administrators the usage statistics of a period"
```

The `git diff` line prints nothing.

---

### Task 3: The Statistici tab of Setări

**Files:**
- Create: `src/admin/settingsPage/UsageSection.tsx`, `src/admin/settingsPage/UsageSection.test.tsx`
- Modify: `src/admin/pages/SettingsPage.tsx`, `src/admin/pages/SettingsPage.test.tsx`, `src/admin/api.ts`, `src/test/fakeApi.ts`, `src/ui/brand.css`

**Interfaces:**
- Consumes: Task 2's `UsageSource`, `UsagePeriod`, `UsageStats`, `UsageCounts`, `EMPTY_USAGE`, and `GET /api/admin/stats`.
- Produces: `AdminApi.getUsage(source, period): Promise<UsageStats>`; `FakeData.usage?: Pick<UsageStats, 'totals' | 'rows'>`; `UsageSection` and `usageKeyLabel(key: string): string` in `UsageSection.tsx`; the tab `stats` ("Statistici") of Setări.

- [ ] **Step 1: Create `src/admin/settingsPage/UsageSection.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EMPTY_USAGE } from '../../../shared/usage.ts';
import { ApiError } from '../../ui/ApiError.ts';
import { createFakeApi } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { usageKeyLabel } from './UsageSection.tsx';

const usage = {
  totals: { ...EMPTY_USAGE, papers: 12, barems: 2, tokens: 1234567, tries: 3, failed: 1 },
  rows: [
    { key: '2026-11-18', ...EMPTY_USAGE, papers: 8, barems: 2, tokens: 1000000, tries: 3 },
    { key: '2026-11-17', ...EMPTY_USAGE },
    { key: '2026-11-16', ...EMPTY_USAGE, papers: 4, failed: 1, tokens: 234567 },
  ],
};

const open = async (api = createFakeApi({ classes: [], students: {}, usage })) => {
  renderAdmin('/settings?tab=stats', api);
  await screen.findByRole('heading', { name: 'Statistici de utilizare' });
  return api;
};

const generate = () => userEvent.click(screen.getByRole('button', { name: 'Generează' }));

describe('Statistici on Setări', () => {
  it('reads nothing until Generează, then asks for all the work of the last 7 days', async () => {
    const api = await open();
    expect(api.getUsage).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Toate' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Perioada' })).toHaveValue('7d');
    await generate();
    expect(api.getUsage).toHaveBeenCalledWith('all', '7d');
    expect(await screen.findByRole('heading', { name: 'Ultimele 7 zile · Toate' })).toBeInTheDocument();
  });

  it('shows the totals and one row per day, with a dash for nothing', async () => {
    await open();
    await generate();
    const totals = await screen.findByLabelText('Totaluri');
    expect(totals).toHaveTextContent('Lucrări12');
    expect(totals).toHaveTextContent('Tokeni1.234.567');
    expect(totals).toHaveTextContent('Încercări3');
    const table = screen.getByRole('table', { name: 'Ultimele 7 zile · Toate' });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Ziua', 'Lucrări', 'Bareme', 'Liste', 'Analize', 'Tipar', 'Eșuate', 'Tokeni', 'Încercări',
    ]);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['18 nov.', '17 nov.', '16 nov.']);
    expect(within(rows[0]!).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['8', '2', '—', '—', '—', '—', '1.000.000', '3']);
    expect(within(rows[1]!).getAllByRole('cell').every((cell) => cell.textContent === '—')).toBe(true);
  });

  it('draws the papers of each day as a bar, the busiest day full width', async () => {
    await open();
    await generate();
    const table = await screen.findByRole('table');
    const bars = [...table.querySelectorAll<HTMLElement>('.usage-bar')];
    expect(bars.map((bar) => bar.style.inlineSize)).toEqual(['100%', '0%', '50%']);
    expect(bars.every((bar) => bar.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('leaves out the tries for the teachers, and asks for the year by month', async () => {
    const api = await open();
    await userEvent.click(screen.getByRole('radio', { name: 'Profesori' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Perioada' }), 'Ultimul an');
    await generate();
    expect(api.getUsage).toHaveBeenCalledWith('teachers', '12m');
    const table = await screen.findByRole('table', { name: 'Ultimul an · Profesori' });
    const headers = within(table).getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers[0]).toBe('Luna');
    expect(headers).not.toContain('Încercări');
    expect(screen.getByLabelText('Totaluri')).not.toHaveTextContent('Încercări');
  });

  it('asks again on each Generează, also for the same choice', async () => {
    const api = await open();
    await generate();
    await screen.findByRole('table');
    await generate();
    await screen.findByRole('table');
    expect(api.getUsage).toHaveBeenCalledTimes(2);
  });

  it('shows the message of a refusal', async () => {
    const api = createFakeApi({ classes: [], students: {} });
    api.getUsage.mockRejectedValueOnce(new ApiError(400, 'invalid', 'Statistica cerută nu este validă.'));
    await open(api);
    await generate();
    expect(await screen.findByText('Statistica cerută nu este validă.')).toBeInTheDocument();
  });
});

describe('usageKeyLabel', () => {
  it('names a day and a month in Romanian', () => {
    expect(usageKeyLabel('2026-11-18')).toBe('18 nov.');
    expect(usageKeyLabel('2026-01-01')).toBe('1 ian.');
    expect(usageKeyLabel('2026-11')).toBe('nov. 2026');
  });
});
```

- [ ] **Step 2: Edit `src/admin/pages/SettingsPage.test.tsx`**

Find this block:

```tsx
    const tabs = await screen.findByRole('tablist', { name: 'Setări' });
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Conturi', 'Corectarea', 'Robotul']);
    expect(within(tabs).getByRole('tab', { name: 'Conturi' })).toHaveAttribute('aria-selected', 'true');
```

Replace it with:

```tsx
    const tabs = await screen.findByRole('tablist', { name: 'Setări' });
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Conturi', 'Corectarea', 'Robotul', 'Statistici']);
    expect(within(tabs).getByRole('tab', { name: 'Conturi' })).toHaveAttribute('aria-selected', 'true');
```

- [ ] **Step 3: Edit `src/admin/pages/SettingsPage.test.tsx`**

Find this block:

```tsx
    const tabs = await screen.findByRole('tablist', { name: 'Setări' });
    const [accounts, grading, robot] = within(tabs).getAllByRole('tab');
    expect(accounts).toHaveAttribute('tabindex', '0');
```

Replace it with:

```tsx
    const tabs = await screen.findByRole('tablist', { name: 'Setări' });
    const [accounts, grading, , stats] = within(tabs).getAllByRole('tab');
    expect(accounts).toHaveAttribute('tabindex', '0');
```

- [ ] **Step 4: Edit `src/admin/pages/SettingsPage.test.tsx`**

Find this block:

```tsx
    await userEvent.keyboard('{End}');
    expect(robot).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
```

Replace it with:

```tsx
    await userEvent.keyboard('{End}');
    expect(stats).toHaveFocus();
    await expectLocation('/settings?tab=stats');
    await userEvent.keyboard('{ArrowRight}');
```

- [ ] **Step 5: Edit `src/admin/pages/SettingsPage.test.tsx`**

Find this block:

```tsx
    await userEvent.keyboard('{ArrowLeft}');
    expect(robot).toHaveFocus();
    await userEvent.keyboard('{Home}');
```

Replace it with:

```tsx
    await userEvent.keyboard('{ArrowLeft}');
    expect(stats).toHaveFocus();
    await userEvent.keyboard('{Home}');
```

- [ ] **Step 6: Run the new tests to see them fail**

Run: `npx vitest run src/admin/settingsPage/UsageSection.test.tsx src/admin/pages/SettingsPage.test.tsx`

Expected: FAIL. `Test Files  2 failed (2)`, `Tests  2 failed | 23 passed (25)`: `UsageSection.test.tsx` does not load (`Failed to resolve import "./UsageSection.tsx"`); in `SettingsPage.test.tsx`, "opens on Conturi, and keeps the chosen tab in the address" fails with `expected [ 'Conturi', 'Corectarea', 'Robotul' ] to deeply equal [ 'Conturi', 'Corectarea', …(2) ]` and "moves between the tabs with the arrow keys, Home and End" with `expect(received).toHaveFocus()`.

- [ ] **Step 7: Edit `src/admin/api.ts`**

Find this block:

```ts
import type { Subject } from '../../shared/subjects.ts';
import { studentResultPath } from '../../shared/api.ts';
```

Replace it with:

```ts
import type { Subject } from '../../shared/subjects.ts';
import type { UsagePeriod, UsageSource, UsageStats } from '../../shared/usage.ts';
import { studentResultPath } from '../../shared/api.ts';
```

- [ ] **Step 8: Edit `src/admin/api.ts`**

Find this block:

```ts
  getSettings(): Promise<Settings>;
  updateSettings(maxParallelAgents: number): Promise<Settings>;
```

Replace it with:

```ts
  getSettings(): Promise<Settings>;
  // The usage statistics of a period (administrators only).
  getUsage(source: UsageSource, period: UsagePeriod): Promise<UsageStats>;
  updateSettings(maxParallelAgents: number): Promise<Settings>;
```

- [ ] **Step 9: Edit `src/admin/api.ts`**

Find this block:

```ts
    getSettings: async () => (await request<{ settings: Settings }>('GET', '/settings')).settings,
    updateSettings: async (maxParallelAgents) =>
```

Replace it with:

```ts
    getSettings: async () => (await request<{ settings: Settings }>('GET', '/settings')).settings,
    getUsage: async (source, period) => (await request<{ stats: UsageStats }>('GET', `/stats?source=${source}&period=${period}`)).stats,
    updateSettings: async (maxParallelAgents) =>
```

- [ ] **Step 10: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
import { DOCX_TYPE, uploadTypeOf, type TestFileKind, type TestVariant } from '../../shared/files.ts';
import type { CheckoutInput, PaymentRow } from '../../shared/payments.ts';
```

Replace it with:

```ts
import { DOCX_TYPE, uploadTypeOf, type TestFileKind, type TestVariant } from '../../shared/files.ts';
import { EMPTY_USAGE, type UsagePeriod, type UsageSource, type UsageStats } from '../../shared/usage.ts';
import type { CheckoutInput, PaymentRow } from '../../shared/payments.ts';
```

- [ ] **Step 11: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  refusedAccounts?: RefusedAccount[];
}
```

Replace it with:

```ts
  refusedAccounts?: RefusedAccount[];
  // The usage statistics on Setări, whatever source and period are asked.
  usage?: Pick<UsageStats, 'totals' | 'rows'>;
}
```

- [ ] **Step 12: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    getSettings: vi.fn(async () => structuredClone(settings)),
    updateSettings: vi.fn(async (maxParallelAgents: number) => {
```

Replace it with:

```ts
    getSettings: vi.fn(async () => structuredClone(settings)),
    getUsage: vi.fn(async (source: UsageSource, period: UsagePeriod): Promise<UsageStats> => ({
      source,
      period,
      ...structuredClone(data.usage ?? { totals: { ...EMPTY_USAGE }, rows: [] }),
    })),
    updateSettings: vi.fn(async (maxParallelAgents: number) => {
```

- [ ] **Step 13: Create `src/admin/settingsPage/UsageSection.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import type { UsageCounts, UsagePeriod, UsageSource, UsageStats } from '../../../shared/usage.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

const SOURCES: { value: UsageSource; label: string }[] = [
  { value: 'all', label: 'Toate' },
  { value: 'quick-try', label: 'Teste rapide' },
  { value: 'teachers', label: 'Profesori' },
];

const PERIODS: { value: UsagePeriod; label: string }[] = [
  { value: '7d', label: 'Ultimele 7 zile' },
  { value: '30d', label: 'Ultima lună' },
  { value: '12m', label: 'Ultimul an' },
];

// The columns, in the order of the work a test goes through; tries only for
// the sources that have Quick Try.
const COLUMNS: { name: keyof UsageCounts; label: string }[] = [
  { name: 'papers', label: 'Lucrări' },
  { name: 'barems', label: 'Bareme' },
  { name: 'exerciseLists', label: 'Liste' },
  { name: 'analyses', label: 'Analize' },
  { name: 'prints', label: 'Tipar' },
  { name: 'failed', label: 'Eșuate' },
  { name: 'tokens', label: 'Tokeni' },
  { name: 'tries', label: 'Încercări' },
];

const NUMBER = new Intl.NumberFormat('ro-RO');
const DAY = new Intl.DateTimeFormat('ro-RO', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const MONTH = new Intl.DateTimeFormat('ro-RO', { timeZone: 'UTC', month: 'short', year: 'numeric' });

// "18 nov." for a day, "nov. 2026" for a month.
export function usageKeyLabel(key: string): string {
  return key.length === 7 ? MONTH.format(new Date(`${key}-01T00:00:00Z`)) : DAY.format(new Date(`${key}T00:00:00Z`));
}

const columnsOf = (source: UsageSource) => COLUMNS.filter((column) => column.name !== 'tries' || source !== 'teachers');

// "Statistici" on Setări: the robot's work per day (or month) of a period, for
// Quick Try, the teachers, or both. Nothing is read until the administrator
// presses "Generează", and nothing is read again by itself.
export function UsageSection() {
  const api = useApi();
  const [source, setSource] = useState<UsageSource>('all');
  const [period, setPeriod] = useState<UsagePeriod>('7d');
  const generate = useMutation({ mutationFn: (asked: { source: UsageSource; period: UsagePeriod }) => api.getUsage(asked.source, asked.period) });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    generate.mutate({ source, period });
  };

  return (
    <section className="class-card" aria-labelledby="usage-title">
      <div className="class-card-head">
        <h2 id="usage-title">Statistici de utilizare</h2>
      </div>
      <form className="usage-form" onSubmit={submit}>
        <fieldset>
          <legend>Sursa</legend>
          {SOURCES.map((option) => (
            <label key={option.value} className="check-label">
              <input type="radio" name="usage-source" value={option.value} checked={source === option.value} onChange={() => setSource(option.value)} />
              {option.label}
            </label>
          ))}
        </fieldset>
        <label className="usage-period">
          Perioada
          <select value={period} onChange={(event) => setPeriod(event.target.value as UsagePeriod)}>
            {PERIODS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="button" disabled={generate.isPending}>
          Generează
        </button>
      </form>
      <div aria-live="polite">{generate.isPending && <p className="usage-note">Se generează…</p>}</div>
      {generate.error && <ErrorMessage error={generate.error} />}
      {generate.data && !generate.isPending && <UsageResult stats={generate.data} />}
    </section>
  );
}

function UsageResult({ stats }: { stats: UsageStats }) {
  const columns = columnsOf(stats.source);
  const most = Math.max(1, ...stats.rows.map((row) => row.papers));
  const sourceLabel = SOURCES.find((option) => option.value === stats.source)!.label;
  const periodLabel = PERIODS.find((option) => option.value === stats.period)!.label;
  return (
    <div className="usage-result">
      <h3 id="usage-result-title">
        {periodLabel} · {sourceLabel}
      </h3>
      <dl className="usage-totals" aria-label="Totaluri">
        {columns.map((column) => (
          <div key={column.name}>
            <dt>{column.label}</dt>
            <dd>{NUMBER.format(stats.totals[column.name])}</dd>
          </div>
        ))}
      </dl>
      <div className="table-wrap">
        <table className="usage-table" aria-labelledby="usage-result-title">
          <thead>
            <tr>
              <th scope="col">{stats.period === '12m' ? 'Luna' : 'Ziua'}</th>
              {columns.map((column) => (
                <th key={column.name} scope="col">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{usageKeyLabel(row.key)}</th>
                {columns.map((column) => (
                  <td key={column.name}>
                    {column.name === 'papers' && (
                      <span className="usage-bar" aria-hidden="true" style={{ inlineSize: `${(100 * row.papers) / most}%` }} />
                    )}
                    {row[column.name] > 0 ? NUMBER.format(row[column.name]) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 14: Edit `src/admin/pages/SettingsPage.tsx`**

Find this block:

```tsx
import { AccountsSection } from '../settingsPage/AccountsSection.tsx';
import { agoText, RobotLine } from '../testPage/RobotLine.tsx';
```

Replace it with:

```tsx
import { AccountsSection } from '../settingsPage/AccountsSection.tsx';
import { UsageSection } from '../settingsPage/UsageSection.tsx';
import { agoText, RobotLine } from '../testPage/RobotLine.tsx';
```

- [ ] **Step 15: Edit `src/admin/pages/SettingsPage.tsx`**

Find this block:

```tsx

type Tab = 'accounts' | 'grading' | 'robot';
const TABS: { id: Tab; label: string }[] = [
```

Replace it with:

```tsx

type Tab = 'accounts' | 'grading' | 'robot' | 'stats';
const TABS: { id: Tab; label: string }[] = [
```

- [ ] **Step 16: Edit `src/admin/pages/SettingsPage.tsx`**

Find this block:

```tsx
  { id: 'robot', label: 'Robotul' },
];
```

Replace it with:

```tsx
  { id: 'robot', label: 'Robotul' },
  { id: 'stats', label: 'Statistici' },
];
```

- [ ] **Step 17: Edit `src/admin/pages/SettingsPage.tsx`**

Find this block:

```tsx

// The tab in the address: `?tab=grading` or `?tab=robot`; none (or one it
// does not know) is "Conturi".
function tabOf(value: string | null): Tab {
  return value === 'grading' || value === 'robot' ? value : 'accounts';
}

// Setări (redesign spec §11.8), for the administrators only: three tabs, the
// teachers' accounts first (with a red count of those that wait), how the
// robot grades, and the robot's state and key. The three panels stay drawn
// (the others hidden), so a new key or password shown once survives a look at
// another tab.
export function SettingsPage() {
```

Replace it with:

```tsx

// The tab in the address: `?tab=grading`, `?tab=robot` or `?tab=stats`; none
// (or one it does not know) is "Conturi".
function tabOf(value: string | null): Tab {
  return value === 'grading' || value === 'robot' || value === 'stats' ? value : 'accounts';
}

// Setări (redesign spec §11.8), for the administrators only: four tabs, the
// teachers' accounts first (with a red count of those that wait), how the
// robot grades, the robot's state and key, and the usage statistics. The
// panels stay drawn (the others hidden), so a new key or password shown once,
// or a statistic made, survives a look at another tab.
export function SettingsPage() {
```

- [ ] **Step 18: Edit `src/admin/pages/SettingsPage.tsx`**

Find this block:

```tsx
          {isAdmin && id === 'accounts' && <AccountsSection />}
          {isAdmin && id !== 'accounts' && (
            <>
```

Replace it with:

```tsx
          {isAdmin && id === 'accounts' && <AccountsSection />}
          {isAdmin && id === 'stats' && <UsageSection />}
          {isAdmin && (id === 'grading' || id === 'robot') && (
            <>
```

- [ ] **Step 19: Edit `src/ui/brand.css`**

Find this block:

```css
}

@media (max-width: 56.25rem) {
  .account-detail {
```

Replace it with:

```css
}

/* Statistici on Setări: the source, the period and "Generează" on one line
   (wrapping on a phone), the totals, then one row per day or month. The
   table scrolls sideways inside its own box on a narrow screen. */
.usage-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem 1.5rem;
  padding: 0 1.25rem 1rem;
}

.usage-form fieldset {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  margin: 0;
  padding: 0;
  border: 0;
}

.usage-form legend,
.usage-period {
  color: var(--muted);
  font-size: 0.8125rem;
}

/* A floated legend sits inside the fieldset, level with "Perioada". */
.usage-form legend {
  float: left;
  width: 100%;
  margin-bottom: 0.25rem;
  padding: 0;
}

.usage-form .check-label {
  color: var(--text);
  font-size: 0.875rem;
}

.usage-period {
  display: grid;
  gap: 0.25rem;
}

.usage-note,
.usage-result {
  padding: 0 1.25rem 1.25rem;
}

.usage-note {
  margin: 0;
  color: var(--muted);
}

.usage-result h3 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
}

.usage-totals {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  margin: 0 0 1rem;
}

.usage-totals dt {
  color: var(--muted);
  font-size: 0.8125rem;
}

.usage-totals dd {
  margin: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.usage-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.usage-table th,
.usage-table td {
  padding: 0.375rem 0 0.375rem 0.75rem;
  border-top: 1px solid var(--line);
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.usage-table th:first-child {
  padding-left: 0;
  text-align: left;
}

.usage-table thead th {
  border-top: 0;
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 500;
}

.usage-table tbody th {
  font-weight: 400;
}

/* The papers of each row as a thin bar under its number, the busiest row
   full width. */
.usage-table td:first-of-type {
  position: relative;
  min-width: 4.5rem;
}

.usage-bar {
  position: absolute;
  right: 0;
  bottom: 0.125rem;
  block-size: 3px;
  max-inline-size: calc(100% - 0.75rem);
  border-radius: 2px;
  background: var(--ink);
}

@media (max-width: 56.25rem) {
  .account-detail {
```

- [ ] **Step 20: Typecheck and run the whole suite**

Run: `npm run typecheck`, then `npm test`

Expected: no type error; `Test Files  211 passed | 1 skipped (212)`, `Tests  3225 passed | 3 skipped (3228)`.

- [ ] **Step 21: Check against the prototype and commit**

```bash
git add src/admin/settingsPage/UsageSection.tsx src/admin/settingsPage/UsageSection.test.tsx src/admin/pages/SettingsPage.tsx src/admin/pages/SettingsPage.test.tsx src/admin/api.ts src/test/fakeApi.ts src/ui/brand.css
git diff --cached --stat refs/protous/us3 -- . ':!docs/superpowers/plans'
git commit -m "Show the usage statistics in a Statistici tab of Setari"
```

The `git diff` line prints nothing.

---

### Task 4: Count the student, Quick Try and login pages with their tokens hidden

**Files:**
- Create: `src/ui/visits.ts`, `src/ui/visits.test.ts`
- Modify: `u/index.html`, `try/index.html`, `src/landing/pages.test.ts`, `src/admin/pages/LoginPage.tsx`, `src/admin/pages/LoginPage.test.tsx`, `src/landing/quickTry/ui.ts`, `src/landing/quickTry/ui.test.ts`, `AGENTS.md`, `docs/analytics.md`, `docs/superpowers/specs/2026-11-18-usage-stats-and-visits-design.md`

**Interfaces:**
- Produces: in `src/ui/visits.ts`: `STATS_SCRIPT`, `TEACHER_SKIP_PATTERNS`, `VisitEvent` (`'account-request-sent' | 'quick-try-sent'`), `countVisitEvent(name)`, `visitTab.reload()`, `teacherCounterLoaded(doc?)`, `loadTeacherCounter(doc?, enabled = import.meta.env.PROD)`, and the global `window.rybbit?.event(name, properties?)`.

- [ ] **Step 1: Create `src/ui/visits.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import tryRaw from '../../try/index.html?raw';
import studentRaw from '../../u/index.html?raw';
import { countVisitEvent, loadTeacherCounter, STATS_SCRIPT, TEACHER_SKIP_PATTERNS, teacherCounterLoaded } from './visits.ts';

// The visit counter must never send a token: not in a path, not after "#",
// not in a query string, not in a page title, not in a referrer.

// Rybbit's own rule (server/src/analytics-script/utils.ts, patternToRegex and
// findMatchingPattern): "re:" is a raw regex, "/**/" any folders, "**" any
// text, "*" one folder name of at least one character; the first match wins.
function patternToRegex(pattern: string): RegExp {
  if (pattern.startsWith('re:')) return new RegExp(pattern.slice(3));
  const marked = pattern.replace(/\*\*/g, '__DOUBLE__').replace(/\*/g, '__SINGLE__');
  const escaped = marked
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\/__DOUBLE__\//g, '/(?:.+/)?')
    .replace(/__DOUBLE__/g, '.*')
    .replace(/\//g, '\\/')
    .replace(/__SINGLE__/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
}

const firstMatch = (path: string, patterns: string[]) => patterns.find((pattern) => patternToRegex(pattern).test(path)) ?? null;

// What the counter sends as the path: the pattern that matched, or the path.
const sentPath = (path: string, patterns: string[]) => firstMatch(path, patterns) ?? path;

const counterOf = (html: string) => new DOMParser().parseFromString(html, 'text/html').querySelector<HTMLScriptElement>(`script[src="${STATS_SCRIPT}"]`);
const maskOf = (html: string) => JSON.parse(counterOf(html)!.dataset.maskPatterns!) as string[];
const referrerOf = (html: string) => new DOMParser().parseFromString(html, 'text/html').querySelector('meta[name="referrer"]')?.getAttribute('content');

const UPLOAD = 'abcdefghijkmnop3';
const RESULT = 'qrstuvwxyz234567qrstuvwxyz';
const TRY = 'abcdefghijklmnopqrstuvwxyz234567';

// Every form a path can take: with "#" when the counter tracks fragments.
const variants = (path: string) => [path, `${path}/`, `${path}/extra`, `${path}#x`, `${path}/#x`, `${path}/extra#x`];

describe('the student pages', () => {
  const mask = maskOf(studentRaw);

  it('load the counter, deferred, and send no referrer', () => {
    expect(counterOf(studentRaw)!.defer).toBe(true);
    expect(referrerOf(studentRaw)).toBe('no-referrer');
  });

  it('never send a token in the path', () => {
    for (const path of [`/u/${UPLOAD}`, `/u/result/${RESULT}`, `/u/rezultat/${RESULT}`].flatMap(variants)) {
      const sent = sentPath(path, mask);
      expect(sent, path).not.toContain(UPLOAD);
      expect(sent, path).not.toContain(RESULT);
    }
  });

  it('keep the test link and the result link apart', () => {
    expect(sentPath(`/u/${UPLOAD}`, mask)).toBe('/u/*');
    expect(sentPath(`/u/result/${RESULT}`, mask)).toBe('/u/result/*');
    expect(sentPath(`/u/rezultat/${RESULT}`, mask)).toBe('/u/rezultat/*');
    expect(sentPath('/u/', mask)).toBe('/u/');
  });
});

describe('the Quick Try pages', () => {
  const mask = maskOf(tryRaw);

  it('load the counter, deferred, and send no referrer', () => {
    expect(counterOf(tryRaw)!.defer).toBe(true);
    expect(referrerOf(tryRaw)).toBe('no-referrer');
  });

  it('never send a token in the path', () => {
    for (const path of [`/try/${TRY}`, `/try/${TRY}/phone`, `/try/${TRY}/telefon`].flatMap(variants)) {
      expect(sentPath(path, mask), path).not.toContain(TRY);
    }
  });

  it('keep the try and its phone page apart', () => {
    expect(sentPath(`/try/${TRY}`, mask)).toBe('/try/*');
    expect(sentPath(`/try/${TRY}/phone`, mask)).toBe('/try/*/phone');
  });
});

describe('the teacher pages', () => {
  const skipped = (path: string) => firstMatch(path, TEACHER_SKIP_PATTERNS) !== null;

  it('count only the login screen and the sign-up', () => {
    expect(skipped('/teacher/')).toBe(false);
    expect(skipped('/teacher/#new-account')).toBe(false);
  });

  it('skip every other page, and the links of the emails with their token', () => {
    for (const path of [
      '/teacher/tests',
      '/teacher/tests/9A-2026-1',
      '/teacher/settings',
      '/teacher/confirm-email',
      '/teacher/confirm-email#secret-token',
      '/teacher/new-password#secret-token',
      '/teacher/#cont-nou',
      '/teacher/#anything',
    ]) {
      expect(skipped(path), path).toBe(true);
    }
  });
});

describe('the student and Quick Try apps', () => {
  const sources = import.meta.glob(['../upload/**/*.{ts,tsx}', '../try/**/*.{ts,tsx}', '../admin/**/*.{ts,tsx}', '!**/*.test.*'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  it('never put a name or a token in the page title', () => {
    for (const [file, source] of Object.entries(sources)) expect(source, file).not.toMatch(/document\.title/);
  });

  it('read no query string but the phone page\'s "here"', () => {
    const readers = Object.entries(sources)
      .filter(([file]) => !file.startsWith('../admin/'))
      .filter(([, source]) => /useSearchParams|URLSearchParams|location\.search/.test(source))
      .map(([file]) => file);
    expect(readers).toEqual(['../try/PhonePage.tsx']);
    expect(sources['../try/PhonePage.tsx']!.match(/params\.get\('([^']+)'\)/g)).toEqual(["params.get('here')"]);
  });
});

describe('the counter of the login screen', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    delete window.rybbit;
  });

  it('loads once, with the teacher paths it skips', () => {
    loadTeacherCounter(document, true);
    loadTeacherCounter(document, true);
    const scripts = document.head.querySelectorAll<HTMLScriptElement>(`script[src="${STATS_SCRIPT}"]`);
    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0]!.dataset.skipPatterns!)).toEqual(TEACHER_SKIP_PATTERNS);
    expect(teacherCounterLoaded()).toBe(true);
  });

  it('loads nothing outside the built site', () => {
    loadTeacherCounter(document, false);
    loadTeacherCounter();
    expect(document.head.querySelector('script')).toBeNull();
    expect(teacherCounterLoaded()).toBe(false);
  });
});

describe('countVisitEvent', () => {
  afterEach(() => {
    delete window.rybbit;
  });

  it('sends the event, with nothing else', () => {
    const event = vi.fn();
    window.rybbit = { event };
    countVisitEvent('quick-try-sent');
    expect(event).toHaveBeenCalledWith('quick-try-sent');
  });

  it('does nothing without the counter, and goes on when it breaks', () => {
    expect(() => countVisitEvent('account-request-sent')).not.toThrow();
    window.rybbit = {
      event: () => {
        throw new Error('blocked');
      },
    };
    expect(() => countVisitEvent('account-request-sent')).not.toThrow();
  });
});
```

- [ ] **Step 2: Edit `src/landing/pages.test.ts`**

Find this block:

```ts

  it('counts visits on the five public pages only, never on the private ones', () => {
    // The private pages' addresses hold tokens and ids, and students use them.
    const counter = (html: string) =>
      all(parse(html), 'script[src]').filter((s) => s.getAttribute('src')!.includes('stats.mqgrader.ro'));
    for (const html of [...PAGES.map((p) => p.html), landing]) {
      const found = counter(html);
```

Replace it with:

```ts

  it('counts visits on the public pages, and on the student and Quick Try pages with their tokens hidden', () => {
    // The private pages' addresses hold tokens: src/ui/visits.test.ts checks
    // their masks. The teacher app loads the counter on its login screen only.
    const counter = (html: string) =>
      all(parse(html), 'script[src]').filter((s) => s.getAttribute('src')!.includes('stats.mqgrader.ro'));
    for (const html of [...PAGES.map((p) => p.html), landing, studentRaw, tryRaw]) {
      const found = counter(html);
```

- [ ] **Step 3: Edit `src/landing/pages.test.ts`**

Find this block:

```ts
    }
    for (const html of [teacherRaw, studentRaw, tryRaw]) {
      expect(html).not.toContain('stats.mqgrader.ro');
    }
  });
```

Replace it with:

```ts
    }
    for (const html of [studentRaw, tryRaw]) expect(counter(html)[0]!.hasAttribute('data-mask-patterns')).toBe(true);
    expect(teacherRaw).not.toContain('stats.mqgrader.ro');
  });
```

- [ ] **Step 4: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeApi, fakeTeacher } from '../../test/fakeApi.ts';
```

Replace it with:

```tsx
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, fakeTeacher } from '../../test/fakeApi.ts';
```

- [ ] **Step 5: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx
import { ApiError } from '../api.ts';

```

Replace it with:

```tsx
import { ApiError } from '../api.ts';
import { visitTab } from '../../ui/visits.ts';

```

- [ ] **Step 6: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx
    expect(screen.getByRole('heading', { name: 'Intră în cont' })).toBeInTheDocument();
  });
});
```

Replace it with:

```tsx
    expect(screen.getByRole('heading', { name: 'Intră în cont' })).toBeInTheDocument();
  });
});

describe('the visit counter of the login screen', () => {
  afterEach(() => {
    document.getElementById('visit-counter')?.remove();
    delete window.rybbit;
    vi.restoreAllMocks();
  });

  async function signUp(api: ReturnType<typeof createFakeApi>) {
    api.me.mockRejectedValueOnce(loginRequired());
    renderAdmin('/#new-account', api);
    await userEvent.type(await screen.findByLabelText('Numele tău'), 'Ana Pop');
    await userEvent.type(screen.getByLabelText('Adresa de email'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText(/^Parola/), 'parola-lunga');
    await userEvent.click(screen.getByRole('button', { name: 'Cere contul' }));
  }

  it('counts an account request that was sent, with no name or email', async () => {
    const event = vi.fn();
    window.rybbit = { event };
    await signUp(createFakeApi());
    await screen.findByRole('heading', { name: 'Verifică-ți emailul' });
    expect(event.mock.calls).toEqual([['account-request-sent']]);
  });

  it('counts no refused request', async () => {
    const event = vi.fn();
    window.rybbit = { event };
    const api = createFakeApi();
    api.signup.mockRejectedValueOnce(new ApiError(409, 'email_taken', 'Există deja un cont cu această adresă.'));
    await signUp(api);
    await screen.findByText('Există deja un cont cu această adresă.');
    expect(event).not.toHaveBeenCalled();
  });

  async function logIn(api: ReturnType<typeof createFakeApi>) {
    api.me.mockRejectedValueOnce(loginRequired());
    renderAdmin('/', api);
    await userEvent.type(await screen.findByLabelText('Adresa de email'), 'profesor@example.com');
    await userEvent.type(screen.getByLabelText('Parola'), 'parola-buna');
    await userEvent.click(screen.getByRole('button', { name: 'Intră' }));
  }

  it('starts the tab again after a login when the counter was loaded, so it never sees a teacher page', async () => {
    const reload = vi.spyOn(visitTab, 'reload').mockImplementation(() => {});
    const script = document.createElement('script');
    script.id = 'visit-counter';
    document.head.append(script);
    const api = createFakeApi();
    await logIn(api);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(api.listClasses).not.toHaveBeenCalled();
  });

  it('opens the page in place after a login when the counter was not loaded', async () => {
    const reload = vi.spyOn(visitTab, 'reload').mockImplementation(() => {});
    await logIn(createFakeApi());
    expect(await screen.findByRole('navigation', { name: 'Meniu' })).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Edit `src/landing/quickTry/ui.test.ts`**

Find this block:

```ts
  });
});
```

Replace it with:

```ts
  });
});

describe('the count of a Quick Try that was sent', () => {
  afterEach(() => {
    delete window.rybbit;
  });

  it('counts a try once its files are sent', async () => {
    const event = vi.fn();
    window.rybbit = { event };
    await mount();
    button()!.click();
    fillForm();
    send();
    await waitFor(() => expect(dialog().hasAttribute('open')).toBe(false));
    expect(event.mock.calls).toEqual([['quick-try-sent']]);
  });

  it('counts no try the server refused, and none that broke half-way', async () => {
    const event = vi.fn();
    window.rybbit = { event };
    const api = fakeLandingApi();
    api.create.mockRejectedValueOnce(new ApiError(429, 'quick_try_ip_limit', 'Limita de încercări gratuite pentru azi a fost atinsă.'));
    api.addPage.mockRejectedValueOnce(new ApiError(0, 'network', 'Nu mă pot conecta la server.'));
    await mount(api);
    button()!.click();
    fillForm();
    send();
    await waitFor(() => expect(within(dialog()).getByRole('alert')).toHaveTextContent('Limita de încercări'));
    send();
    await waitFor(() => expect(within(dialog()).getByRole('alert')).toHaveTextContent('Nu mă pot conecta la server.'));
    expect(event).not.toHaveBeenCalled();
  });

  it('on a phone, counts the try before it leaves for the phone page', async () => {
    const order: string[] = [];
    window.rybbit = { event: (name: string) => order.push(name) };
    await mount(undefined, undefined, { isPhone: () => true, go: (path) => order.push(path) });
    button()!.click();
    pick(/^Testul/, pdf('test.pdf'));
    pick(/^Baremul/, pdf('barem.pdf'));
    within(pagesRow()).getByRole('button', { name: 'Fă poze' }).click();
    send();
    await waitFor(() => expect(order).toEqual(['quick-try-sent', `/try/${TOKEN}/phone?here=1`]));
  });
});
```

- [ ] **Step 8: Run the new tests to see them fail**

Run: `npx vitest run src/ui/visits.test.ts src/landing/pages.test.ts src/admin/pages/LoginPage.test.tsx src/landing/quickTry/ui.test.ts`

Expected: FAIL. `Test Files  4 failed (4)`, `Tests  3 failed | 96 passed (99)`: `src/ui/visits.test.ts` and `LoginPage.test.tsx` do not load (`Failed to resolve import "./visits.ts"`, `"../../ui/visits.ts"`); `pages.test.ts` › "counts visits on the public pages, and on the student and Quick Try pages with their tokens hidden" fails with `expected [] to have a length of 1 but got +0`; in `ui.test.ts`, "counts a try once its files are sent" fails with `expected [] to deeply equal [ [ 'quick-try-sent' ] ]` and "on a phone, counts the try before it leaves for the phone page" with `expected [ Array(1) ] to deeply equal [ 'quick-try-sent', …(1) ]`. The other tests of `ui.test.ts` and `pages.test.ts` pass already.

- [ ] **Step 9: Create `src/ui/visits.ts`**

```ts
// The visit counter (Rybbit, docs/analytics.md). The public pages, the
// student pages and the Quick Try pages load its script from their HTML; the
// teacher app loads it here, only while the login screen shows.

export const STATS_SCRIPT = 'https://stats.mqgrader.ro/api/script.js?siteId=b5be2803e8ab';

// The teacher paths the counter skips (it sends nothing on them): every one but
// the login screen at /teacher/ and the sign-up at /teacher/#new-account. The
// links of the emails (confirm-email, new-password) hold a token after "#".
export const TEACHER_SKIP_PATTERNS = ['re:^/teacher/(?!$|#new-account$)'];

// The actions counted beside the visits. No name, email or token goes with them.
export type VisitEvent = 'account-request-sent' | 'quick-try-sent';

declare global {
  interface Window {
    rybbit?: { event(name: string, properties?: Record<string, unknown>): void };
  }
}

// Counts an action, when the page has the counter. A blocked or missing
// counter changes nothing for the visitor.
export function countVisitEvent(name: VisitEvent): void {
  try {
    window.rybbit?.event(name);
  } catch {
    // The count is lost; the page goes on.
  }
}

const TEACHER_SCRIPT_ID = 'visit-counter';

// The tab's reload, apart so the tests can watch it.
export const visitTab = { reload: () => window.location.reload() };

// Whether this tab loaded the counter for the login screen.
export function teacherCounterLoaded(doc: Document = document): boolean {
  return doc.getElementById(TEACHER_SCRIPT_ID) !== null;
}

// Loads the counter for the login screen, once per tab, and only in the built
// site (`enabled`): the development server and the tests count nothing.
export function loadTeacherCounter(doc: Document = document, enabled: boolean = import.meta.env.PROD): void {
  if (!enabled || teacherCounterLoaded(doc)) return;
  const script = doc.createElement('script');
  script.id = TEACHER_SCRIPT_ID;
  script.src = STATS_SCRIPT;
  script.defer = true;
  script.dataset.skipPatterns = JSON.stringify(TEACHER_SKIP_PATTERNS);
  doc.head.append(script);
}
```

- [ ] **Step 10: Edit `u/index.html`**

Find this block:

```html
    <meta name="robots" content="noindex, nofollow" />
    <title>MQGrader · Trimite lucrarea</title>
```

Replace it with:

```html
    <meta name="robots" content="noindex, nofollow" />
    <meta name="referrer" content="no-referrer" />
    <title>MQGrader · Trimite lucrarea</title>
```

- [ ] **Step 11: Edit `u/index.html`**

Find this block:

```html
    <script src="/theme.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
```

Replace it with:

```html
    <script src="/theme.js"></script>
    <script
      src="https://stats.mqgrader.ro/api/script.js?siteId=b5be2803e8ab"
      data-mask-patterns='["/u/", "/u/result/*", "/u/rezultat/*", "/u/*", "/u/**"]'
      defer
    ></script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
```

- [ ] **Step 12: Edit `try/index.html`**

Find this block:

```html
    <meta name="robots" content="noindex, nofollow" />
    <title>MQGrader · Încercare rapidă</title>
```

Replace it with:

```html
    <meta name="robots" content="noindex, nofollow" />
    <meta name="referrer" content="no-referrer" />
    <title>MQGrader · Încercare rapidă</title>
```

- [ ] **Step 13: Edit `try/index.html`**

Find this block:

```html
    <script src="/theme.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
```

Replace it with:

```html
    <script src="/theme.js"></script>
    <script
      src="https://stats.mqgrader.ro/api/script.js?siteId=b5be2803e8ab"
      data-mask-patterns='["/try/*/phone", "/try/*/telefon", "/try/*", "/try/**"]'
      defer
    ></script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
```

- [ ] **Step 14: Edit `src/admin/pages/LoginPage.tsx`**

Find this block:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
```

Replace it with:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
```

- [ ] **Step 15: Edit `src/admin/pages/LoginPage.tsx`**

Find this block:

```tsx
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
```

Replace it with:

```tsx
import { countLabel } from '../../ui/format.ts';
import { countVisitEvent, loadTeacherCounter, teacherCounterLoaded, visitTab } from '../../ui/visits.ts';
import { useApi } from '../ApiContext.tsx';
```

- [ ] **Step 16: Edit `src/admin/pages/LoginPage.tsx`**

Find this block:

```tsx
// "Intră în cont", "Cont nou de profesor", "Am uitat parola", and the state
// after each. A new state moves the focus to its heading.
export function LoginPage() {
```

Replace it with:

```tsx
// "Intră în cont", "Cont nou de profesor", "Am uitat parola", and the state
// after each. A new state moves the focus to its heading. The login screen is
// the only teacher page the visit counter sees (docs/analytics.md).
export function LoginPage() {
```

- [ ] **Step 17: Edit `src/admin/pages/LoginPage.tsx`**

Find this block:

```tsx
  const heading = useStateHeading(mode.name);

```

Replace it with:

```tsx
  const heading = useStateHeading(mode.name);
  useEffect(() => loadTeacherCounter(), []);

```

- [ ] **Step 18: Edit `src/admin/pages/LoginPage.tsx`**

Find this block:

```tsx
    mutationFn: () => api.login(email, password),
    // Every page reads its data again, now with the login.
    onSuccess: async (teacher) => {
      queryClient.setQueryData(['me'], teacher);
```

Replace it with:

```tsx
    mutationFn: () => api.login(email, password),
    // Every page reads its data again, now with the login. A tab that loaded
    // the visit counter starts again instead, so the counter never sees a
    // page of a logged-in teacher.
    onSuccess: async (teacher) => {
      if (teacherCounterLoaded()) {
        visitTab.reload();
        return;
      }
      queryClient.setQueryData(['me'], teacher);
```

- [ ] **Step 19: Edit `src/admin/pages/LoginPage.tsx`**

Find this block:

```tsx
  const [password, setPassword] = useState('');
  const signup = useMutation({ mutationFn: () => api.signup({ name, email, password }), onSuccess: onSent });

```

Replace it with:

```tsx
  const [password, setPassword] = useState('');
  const signup = useMutation({
    mutationFn: () => api.signup({ name, email, password }),
    onSuccess: () => {
      countVisitEvent('account-request-sent');
      onSent();
    },
  });

```

- [ ] **Step 20: Edit `src/landing/quickTry/ui.ts`**

Find this block:

```ts
import { countLabel, formatDate, formatDateTime, formatFileSize } from '../../ui/format.ts';
import type { LandingApi } from './api.ts';
```

Replace it with:

```ts
import { countLabel, formatDate, formatDateTime, formatFileSize } from '../../ui/format.ts';
import { countVisitEvent } from '../../ui/visits.ts';
import type { LandingApi } from './api.ts';
```

- [ ] **Step 21: Edit `src/landing/quickTry/ui.ts`**

Find this block:

```ts
      );
      sending = false;
```

Replace it with:

```ts
      );
      // Before a phone leaves for the try's phone page: the count goes out first.
      countVisitEvent('quick-try-sent');
      sending = false;
```

- [ ] **Step 22: Edit `AGENTS.md`**

Find this block:

```markdown
- Payments with Stripe Checkout: `docs/payments.md`.
- Visit counts: a self-hosted Rybbit at https://stats.mqgrader.ro, loaded by the five public pages only (`docs/analytics.md`).
- `migrations/`: D1 SQL migrations, numbered. One statement per `;` at a line end (the test helper splits on that), and no `;` inside strings.
```

Replace it with:

```markdown
- Payments with Stripe Checkout: `docs/payments.md`.
- Visit counts: a self-hosted Rybbit at https://stats.mqgrader.ro, loaded by the five public pages, the student pages and the Quick Try pages (their tokens masked, no referrer), and by the teacher app on its login screen only (`src/ui/visits.ts`, `docs/analytics.md`).
- `migrations/`: D1 SQL migrations, numbered. One statement per `;` at a line end (the test helper splits on that), and no `;` inside strings.
```

- [ ] **Step 23: Edit `docs/analytics.md`**

Find this block:

```markdown
- Dashboard: https://stats.mqgrader.ro (sign-up is off; the first account is the administrator).
- Only the five public pages load the script (`index.html`, `ghid/`, `barem/`, `despre/`, `preturi/`), in their `<head>`, after `theme.js`. The teacher, student and Quick Try pages never load it: their addresses hold tokens and ids, and students use them. `src/landing/pages.test.ts` checks both.
- `public/_headers` allows `https://stats.mqgrader.ro` in `script-src` (the script) and `connect-src` (the events it sends). Nothing else is allowed from there.
```

Replace it with:

```markdown
- Dashboard: https://stats.mqgrader.ro (sign-up is off; the first account is the administrator).
- The five public pages load the script (`index.html`, `guide/`, `marking-scheme/`, `about/`, `pricing/`), in their `<head>`, after `theme.js`.
- The student pages (`u/index.html`) and the Quick Try pages (`try/index.html`) load it too. Their addresses hold tokens, so:
  - `data-mask-patterns` sends a pattern in place of each path with a token: `/u/*` (the test link), `/u/result/*` and `/u/rezultat/*` (the result link), `/try/*` and `/try/*/phone`. The first pattern that matches wins, and a catch-all at the end (`/u/**`, `/try/**`) covers any other path.
  - `<meta name="referrer" content="no-referrer">`: the next page never learns the address with the token.
  - Rybbit masks the path only. The query string, the page title and the referrer go as they are, so no page puts a token in a query string or in its title. `src/ui/visits.test.ts` checks all of it with Rybbit's own matching rule.
- The teacher app loads it only while the login screen shows (`loadTeacherCounter` in `src/ui/visits.ts`, in the built site only). It skips every teacher path but `/teacher/` and `/teacher/#new-account` (the email links hold a token after `#`). After a login, a tab that loaded it starts again, so the counter never sees a logged-in teacher's page. A signed-out deep link (`/teacher/tests/...`) is not counted. The button "Cere un cont de profesor" does not change the address, so `#new-account` counts only the visitors who came from the landing page's link.
- Two events: `account-request-sent` (a sent sign-up) and `quick-try-sent` (a Quick Try whose files were sent), with no name, email or token.
- The dashboard settings of the site: "Track URL fragments" on (for `#new-account`), "URL Parameters" on (campaign tags), "Session Replay" off. Session Replay records the full address, token included, and what the page shows: it must stay off while the student pages share the site. To record the public pages one day, give the private pages a Rybbit site of their own first.
- `public/_headers` allows `https://stats.mqgrader.ro` in `script-src` (the script) and `connect-src` (the events it sends). Nothing else is allowed from there.
```

- [ ] **Step 24: Edit `docs/superpowers/specs/2026-11-18-usage-stats-and-visits-design.md`**

Find this block:

```markdown

Past data, in the migration: teacher rows from `robot_work` (it starts at migration 0030), Quick Try rows from the `robot_work` of the guest teachers that still exist and their `teachers.created_at` (tries). Older Quick Try days stay empty. The migration turns UTC times into Bucharest days with a fixed `+2 hours`: every row is from after 25 October 2026, when Bucharest is UTC+2. The live D1 gets this migration before the code (`docs/deploy.md`).
```

Replace it with:

```markdown

The live D1 gets migration 0035 before the code, and the code follows at once: robot work done between the two (minutes) is in `robot_work` but not in `usage_days`, a gap that is accepted.

Past data, in the migration: teacher rows from `robot_work` (it starts at migration 0030), Quick Try rows from the `robot_work` of the guest teachers that still exist and their `teachers.created_at` (tries). Older Quick Try days stay empty. The migration turns UTC times into Bucharest days with a fixed `+2 hours`: every row is from after 25 October 2026, when Bucharest is UTC+2. The live D1 gets this migration before the code (`docs/deploy.md`).
```

- [ ] **Step 25: Edit `docs/superpowers/specs/2026-11-18-usage-stats-and-visits-design.md`**

Find this block:

```markdown
- Those pages send **no referrer** (`<meta name="referrer" content="no-referrer">` in `u/index.html` and `try/index.html`, or a `Referrer-Policy` in `_headers` that wins over the `/*` one): a same-origin referrer would carry the token of the page before.
- The teacher app loads Rybbit only while the login screen shows (the login screen has no address of its own: it shows at any `/teacher/...` address when signed out). After login nothing more is recorded: no page view of a teacher page reaches Rybbit, also after a sign-in in the same tab. The builder picks how (load the script from the login screen and skip every other teacher path with `data-skip-patterns`, or record the two views by hand) and proves it with a test.
- Two events (Rybbit custom events): "account request sent" after a successful sign-up request, "Quick Try sent" after a successful Quick Try form send. No names, emails or tokens in them. The builder checks Rybbit's event API in its docs.
- No change to what a student sees. The script shows nothing.
```

Replace it with:

```markdown
- Those pages send **no referrer** (`<meta name="referrer" content="no-referrer">` in `u/index.html` and `try/index.html`, or a `Referrer-Policy` in `_headers` that wins over the `/*` one): a same-origin referrer would carry the token of the page before.
- The teacher app loads Rybbit only while the login screen shows (the login screen has no address of its own: it shows at any `/teacher/...` address when signed out), and only in the built site. It skips every teacher path but `/teacher/` and `/teacher/#new-account` (`data-skip-patterns`; the email links `confirm-email` and `new-password` hold a token after `#`). After a login, a tab that loaded it reloads, so no page view of a logged-in teacher's page reaches Rybbit (`/teacher/` is also the logged-in home).
- Two limits of that: a signed-out deep link (`/teacher/tests/...`) is not counted, and the in-page button "Cere un cont de profesor" does not change the hash, so `#new-account` counts only the visitors who came from the landing page's link. The "account request sent" event counts the real requests.
- Rybbit masks the path only: the query string, the page title and the referrer are sent as they are. The first mask that matches wins, so each list has its specific patterns first and a catch-all last (`/u/**`, `/try/**`). With "Track URL fragments" on, the path it matches includes the `#` part.
- Two events (Rybbit custom events, `window.rybbit.event(name)`): `account-request-sent` after a successful sign-up request, `quick-try-sent` after a successful Quick Try form send, before a phone leaves for the try's phone page. No names, emails or tokens in them.
- No change to what a student sees. The script shows nothing.
```

- [ ] **Step 26: Edit `docs/superpowers/specs/2026-11-18-usage-stats-and-visits-design.md`**

Find this block:

```markdown
- Turn on "Track URL fragments" (needed for `#new-account`).
- Keep "Session Replay" off: it records the full address, token included, and what the page shows.
- Keep "URL Parameters" on (query strings, for campaign tags such as `utm_source`). The masks do not cover a query string, so no page may put a token, a code or a name in one: a test checks the query strings each student and Quick Try page sets.
```

Replace it with:

```markdown
- Turn on "Track URL fragments" (needed for `#new-account`).
- Keep "Session Replay" off: it records the full address, token included, and what the page shows. "Track URL fragments" and "Session Replay" are settings of the whole site: fragments also split the public pages' anchors, and replay would also record the student pages. To record replays of the public pages one day, give the private pages a Rybbit site of their own first.
- Keep "URL Parameters" on (query strings, for campaign tags such as `utm_source`). The masks do not cover a query string, so no page may put a token, a code or a name in one: a test checks the query strings each student and Quick Try page sets.
```

- [ ] **Step 27: Typecheck, build, and run the whole suite**

Run: `npm run build` (it typechecks first), then `npm test`

Expected: the build ends with `✓ built in`, and `dist/u/index.html` and `dist/try/index.html` carry their `data-mask-patterns`; `Test Files  212 passed | 1 skipped (213)`, `Tests  3246 passed | 3 skipped (3249)`; the same in UTC (`TZ=UTC npm test`).

- [ ] **Step 28: Check against the prototype and commit**

```bash
git add src/ui/visits.ts src/ui/visits.test.ts u/index.html try/index.html src/landing/pages.test.ts src/admin/pages/LoginPage.tsx src/admin/pages/LoginPage.test.tsx src/landing/quickTry/ui.ts src/landing/quickTry/ui.test.ts AGENTS.md docs/analytics.md docs/superpowers/specs/2026-11-18-usage-stats-and-visits-design.md
git diff --cached --stat refs/protous/us4 -- . ':!docs/superpowers/plans'
git commit -m "Count the visits of the student, Quick Try and login pages with their tokens hidden"
```

The `git diff` line prints nothing.

---

## After Task 4

The user does these, in this order:

1. Run migration 0035 on the live database, from the branch's folder:

   ```bash
   npx wrangler d1 migrations apply quickeval --remote
   ```

2. Merge the branch to `main` right after, so the deploy follows the migration within minutes.
3. In the Rybbit dashboard (https://stats.mqgrader.ro), site settings: turn on "Track URL fragments", keep "URL Parameters" on, keep "Session Replay" off.
4. Check on the live site: Setări › Statistici › Generează shows today's work; a visit of a student link shows in Rybbit as `/u/*`.

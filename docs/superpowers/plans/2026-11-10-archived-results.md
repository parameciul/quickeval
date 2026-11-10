# MQGrader: archived tests close their results — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **The last task (Check in the browser, push) must run in the main session, not in a subagent:** the push and the pull request need the user.

**Goal:** Archiving a test, or a whole class, closes its students' result pages; the app asks first when some are open; closed is the normal end of an archived test (Rezultate done, "închise · test arhivat"); the teacher may still publish on an archived test, and then "De făcut" shows it until she closes the results or takes the test out of the archive.

**Architecture:** The server closes the pages in the archive's own write: one `db.batch()` that archives and then sets `results_open = 0` on the test and its uploads, each closing statement checking in its SQL that the test (or the class) is the teacher's and now archived. The teacher app decides everything else from the tests list it already reads: `todoOf()` gets one case for an archived test with an open result (`archivedPublished`), so the stage bar, the bar's count, the Teste row and the class page follow by the existing rule; a small `ArchiveDialog` asks before an archive that would close open pages.

**Tech Stack:** Node 24, TypeScript, Vite, React, TanStack Query, Hono on Cloudflare Pages with D1, Vitest 5 with Testing Library. No new npm dependencies. No migration.

**Spec:** `docs/superpowers/specs/2026-11-10-archived-results-design.md`. Root `AGENTS.md`, `src/AGENTS.md` and `server/AGENTS.md` hold the project rules.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`. No migration.
- One strict `tsconfig.json`. Relative imports name the `.ts` or `.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- Exact texts (spec §3, §4, §5): "Arhivezi testul?", "Arhivezi clasa?", "Elevii nu își vor mai putea vedea rezultatele. Le poți publica din nou oricând.", "Elevii nu își vor mai putea vedea rezultatele testelor acestei clase. Le poți publica din nou oricând.", "Arhivează", "Renunță", "închise · test arhivat", "Rezultate publicate pe un test arhivat", "Elevii își văd rezultatele. Oprește accesul sau scoate testul din arhivă.", "publicate · test arhivat", "Oprește accesul".
- Every write checks its own rules inside its SQL statement, never in a check before the write. Every teacher query is scoped by the teacher's id.
- Functions: at most 15 D1 queries per request. The test archive is one batch of 2 statements; the class archive one batch of 3.
- Do not run Prettier or any formatter.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A`.
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root, on the branch `feature/archived-results-closed` (made from `main` in "Before Task 1"). Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy. If only tests of those three files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts runner/api.test.ts` alone; the full run then counts as passed when its failed and passed tests add up to the expected passed number.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/protoarc/a1` … `refs/protoarc/a3`, one per task, on `refs/protoarc/abase` (the same files as `main` at `b843a69`). After Task N, `git diff --stat refs/protoarc/aN HEAD -- . ':!docs/superpowers'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`).

## Rulings made while planning

Settled with the owner on 2026-11-10 (the spec), and while building the prototype the same day.

1. **The archive closes every result page of the test (owner):** the class-wide publish and the results published for single students, like "Oprește accesul la rezultate". Taking the test out of the archive opens nothing.
2. **Archiving a class closes the pages of all its tests and archives none of them (owner).** A rename or taking the class out of the archive touches no result.
3. **The app asks first only when the archive would close an open page (owner):** `resultsOpen` or `publishedCount > 0` (`hasOpenResults`), for the test, or for any test of the class. With nothing open it archives at once, as today. The dialog closes before the archive is sent; a refusal shows where it shows today (Fișa testului, the class page).
4. **Tests already archived with open results are not changed when this goes live (owner):** they show in "De făcut" from the first load. No migration.
5. **An archived test with open results waits even on an archived class's read-only page (owner):** orange, the step "Oprește accesul", and the class's dot in "Schimbă clasa" (which already follows `todoOf`). Every other test of an archived class stays calm.
6. **On an archived test only the open results wait.** Its unsure points stay "now" in Verificare, as today; the archive check comes first in `todoOf()`.
7. **`todoPath()` does not change.** The item goes to `/teste/<code>`, and the test page opens on its current stage, which is the waiting Rezultate: the spec's `#rezultate`.
8. **A second archive of an archived test closes its pages again.** The archive write accepts an archived `done` test, as it does today; the page never offers it (it shows "Scoate din arhivă"), so this only matters for two requests at once.
9. **The class archive's closing statements leave `tests.updated_at` alone:** the class is what changed.
10. **The Teste page keeps an archived test in the archive.** `inWork()` stays false for it: the row shows only with "Arată și testele arhivate", while the bar's "De făcut" count and "N lucruri te așteaptă" include it. Its row has one "Oprește accesul", the link of its next step: the row's own button for open results stays off on an archived test.
11. **The search results page shows the new stage.** A test of `SearchPage.test.tsx`'s sample is archived with open results, so its stage text becomes "Rezultate · publicate · test arhivat" (Task 2).

## Review Focus

1. A refused archive (the test is not `done`): no page closes (Task 1, "closes nothing when the archive is refused").
2. Archiving one class leaves the pages of the teacher's other classes open (Task 1, "leaves the pages of the other classes open").
3. A rename of a class, or taking a test or a class out of the archive, opens and closes nothing (Task 1, "closes nothing on a rename, and opens nothing when the class leaves the archive", "opens nothing when the test leaves the archive").
4. An archived test with open results and unsure points: one item, at Rezultate (Task 2, "asks only that, even while points still wait", and the stages case "an archived test with open results whose points still wait").
5. An archived test with open results on the Teste page (with "Arată și testele arhivate"): one "Oprește accesul", not the link and the row's button (Task 2, "gives an archived test with open results one way to close them: its next step").
6. "Renunță" in the dialog changes nothing and gives the focus back to the button that opened it (Task 3, "asks before an archive that closes open results, and changes nothing on "Renunță"", "asks first, and changes nothing on "Renunță"").

---

### Before Task 1: The branch

- [ ] **Step 1: Make the branch and check the prototype**

Run: `git switch -c feature/archived-results-closed main` and `git log --oneline -1`
Expected: HEAD `b843a69 Merge pull request #61 from parameciul/feature/quick-try-landing` (or a later `main`; then the prototype comparisons below may also show the files `main` changed since).

Run: `git rev-parse --verify refs/protoarc/a3`
Expected: a commit id. If the ref does not exist, stop and ask: the prototype's refs come with this plan.

- [ ] **Step 2: Bring the spec and this plan onto the branch**

Run: `git checkout claude/archived-test-publishing-520dd0 -- docs/superpowers/specs/2026-11-10-archived-results-design.md docs/superpowers/plans/2026-11-10-archived-results.md`
Then: `git commit -m "Add the spec and the plan for closing the results of archived tests" -- docs/superpowers/specs/2026-11-10-archived-results-design.md docs/superpowers/plans/2026-11-10-archived-results.md`
Expected: one commit with the two files.

### Task 1: The archive of a test or a class closes the result pages

**Files:**
- Modify: `server/db/tests.ts` (`setTestArchived`)
- Modify: `server/db/classes.ts` (`updateClass`)
- Modify: `server/AGENTS.md` (the archive rule)
- Test: `server/routes/archive.test.ts`, `server/routes/classes.test.ts`

**Interfaces:**
- Produces: `setTestArchived(db, teacherId, testId, archived, now): Promise<boolean | null>` keeps its signature; with `archived = true` it is one batch of two statements. `updateClass(db, teacherId, classId, changes)` keeps its signature; with `changes.archived === true` it is one batch of three statements. No route changes.

- [ ] **Step 1: Write the failing tests**

- [ ] **Step 2: Edit `server/routes/archive.test.ts`**

Find this block:

```ts

describe('POST /api/admin/tests/:code/unarchive', () => {
```

Replace it with:

```ts

describe('the result pages of an archived test', () => {
  const pages = async () => {
    const test = await api.db.prepare('SELECT results_open FROM tests WHERE code = ?').bind(code).first<{ results_open: number }>();
    const { results } = await api.db
      .prepare('SELECT s.results_open FROM submissions s JOIN tests t ON t.id = s.test_id WHERE t.code = ? ORDER BY s.id')
      .bind(code)
      .all<{ results_open: number }>();
    return { test: test!.results_open, students: results.map((row) => row.results_open) };
  };

  async function publishedDone(): Promise<number[]> {
    const pop = await addSubmission(api, code, studentIds[0]!, { status: 'graded', files: 1 });
    const ana = await addSubmission(api, code, studentIds[1]!, { status: 'graded', files: 1 });
    await setTest("status = 'done', results_open = 1");
    await api.db.prepare('UPDATE submissions SET results_open = 1 WHERE id IN (?, ?)').bind(pop, ana).run();
    return [pop, ana];
  }

  it('closes the pages for all and for single students', async () => {
    await publishedDone();
    expect((await archive()).status).toBe(200);
    expect(await pages()).toEqual({ test: 0, students: [0, 0] });
    expect(await summary()).toMatchObject({ archived: true, resultsOpen: false, publishedCount: 0 });
  });

  it('closes nothing when the archive is refused', async () => {
    await publishedDone();
    await setTest("status = 'open'");
    expect((await archive()).status).toBe(409);
    expect(await pages()).toEqual({ test: 1, students: [1, 1] });
  });

  it('closes nothing of a test of another teacher', async () => {
    const foreign = await otherTeacherTest(api);
    await api.db.prepare("UPDATE tests SET status = 'done', results_open = 1 WHERE code = ?").bind(foreign.code).run();
    expect((await archive(foreign.code)).status).toBe(404);
    const row = await api.db.prepare('SELECT results_open FROM tests WHERE code = ?').bind(foreign.code).first<{ results_open: number }>();
    expect(row!.results_open).toBe(1);
  });

  it('opens nothing when the test leaves the archive', async () => {
    await publishedDone();
    await archive();
    expect((await unarchive()).status).toBe(200);
    expect(await pages()).toEqual({ test: 0, students: [0, 0] });
  });

  it('lets the teacher publish on an archived test, for all and for one student', async () => {
    const [pop] = await publishedDone();
    await archive();
    expect((await api.request('POST', `/api/admin/submissions/${pop}/results/open`, { startedAt: await startedAtOf(api, pop!) })).status).toBe(200);
    expect(await summary()).toMatchObject({ archived: true, resultsOpen: false, publishedCount: 1 });
    expect((await api.request('POST', `/api/admin/tests/${code}/results/open`)).status).toBe(200);
    expect(await summary()).toMatchObject({ archived: true, resultsOpen: true });
  });
});

describe('POST /api/admin/tests/:code/unarchive', () => {
```

- [ ] **Step 3: Edit `server/routes/classes.test.ts`**

Find this block:

```ts
    expect(historyTwo.body.grades).toMatchObject([{ submissionId: subTwo, grade: 9 }]);
  });
});
```

Replace it with:

```ts
    expect(historyTwo.body.grades).toMatchObject([{ submissionId: subTwo, grade: 9 }]);
  });
});

describe('the result pages of an archived class', () => {
  // A test with a graded paper, published for all and for its one student.
  async function publishedTest(classId: number, studentId: number): Promise<string> {
    const code = await makeTest(api, classId);
    const id = await addSubmission(api, code, studentId, { status: 'graded', files: 1 });
    await api.db.prepare("UPDATE tests SET status = 'done', results_open = 1 WHERE code = ?").bind(code).run();
    await api.db.prepare('UPDATE submissions SET results_open = 1 WHERE id = ?').bind(id).run();
    return code;
  }

  const pagesOf = async (code: string) => {
    const row = await api.db
      .prepare(
        `SELECT t.results_open AS test, t.archived AS archived, s.results_open AS student
          FROM tests t JOIN submissions s ON s.test_id = t.id WHERE t.code = ?`,
      )
      .bind(code)
      .first<{ test: number; archived: number; student: number }>();
    return row!;
  };

  it('closes the pages of every test of the class, and archives none of them', async () => {
    const cls = await makeClass(api, 'H7A', ['Pop Ion']);
    const first = await publishedTest(cls.id, cls.studentIds[0]!);
    const second = await publishedTest(cls.id, cls.studentIds[0]!);
    const res = await api.request('PATCH', `/api/admin/classes/${cls.id}`, { archived: true });
    expect(res.status).toBe(200);
    expect(await pagesOf(first)).toEqual({ test: 0, archived: 0, student: 0 });
    expect(await pagesOf(second)).toEqual({ test: 0, archived: 0, student: 0 });
  });

  it('leaves the pages of the other classes open', async () => {
    const cls = await makeClass(api, 'H7B', ['Pop Ion']);
    const other = await makeClass(api, 'H7C', ['Ionescu Ana']);
    const kept = await publishedTest(other.id, other.studentIds[0]!);
    await api.request('PATCH', `/api/admin/classes/${cls.id}`, { archived: true });
    expect(await pagesOf(kept)).toEqual({ test: 1, archived: 0, student: 1 });
  });

  it('closes nothing on a rename, and opens nothing when the class leaves the archive', async () => {
    const cls = await makeClass(api, 'H7D', ['Pop Ion']);
    const code = await publishedTest(cls.id, cls.studentIds[0]!);
    expect((await api.request('PATCH', `/api/admin/classes/${cls.id}`, { name: 'H7E' })).status).toBe(200);
    expect(await pagesOf(code)).toEqual({ test: 1, archived: 0, student: 1 });
    await api.request('PATCH', `/api/admin/classes/${cls.id}`, { archived: true });
    expect((await api.request('PATCH', `/api/admin/classes/${cls.id}`, { archived: false })).status).toBe(200);
    expect(await pagesOf(code)).toEqual({ test: 0, archived: 0, student: 0 });
  });

});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx vitest run server/routes/archive.test.ts server/routes/classes.test.ts`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  5 failed | 65 passed (70)`: the archive closes no page (`expected { test: 1, students: [ 1, 1 ] } to deeply equal { test: +0, students: [ +0, +0 ] }`, also in "opens nothing when the test leaves the archive"), so "lets the teacher publish on an archived test …" still finds the single publish at 2, and the class archive closes nothing (`expected { test: 1, archived: +0, student: 1 } to deeply equal { test: +0, archived: +0, student: +0 }`, twice). The 65 that pass are the other tests of the two files, and "closes nothing when the archive is refused", "closes nothing of a test of another teacher" and "leaves the pages of the other classes open", which guard what must not change.

- [ ] **Step 5: Close the pages in the test's archive**

- [ ] **Step 6: Edit `server/db/tests.ts`**

Find this block:

```ts
// Archives a finished test, or takes any test out of the archive. The archive
// accepts only a done test, checked in the statement itself. Returns the new
// mark, or null when nothing changed: the test is gone, is not the teacher's,
// or (to archive) is not done.
export async function setTestArchived(
```

Replace it with:

```ts
// Archives a finished test, or takes any test out of the archive. The archive
// accepts only a done test, checked in the statement itself, and closes every
// result page of the test (for all, and for single students): an archived
// test's results are closed unless the teacher publishes them again. Taking a
// test out of the archive opens nothing. Returns the new mark, or null when
// nothing changed: the test is gone, is not the teacher's, or (to archive) is
// not done.
export async function setTestArchived(
```

- [ ] **Step 7: Edit `server/db/tests.ts`**

Find this block:

```ts
): Promise<boolean | null> {
  const sql = archived
    ? "UPDATE tests SET archived = 1, updated_at = ? WHERE id = ? AND teacher_id = ? AND status = 'done' RETURNING archived"
    : 'UPDATE tests SET archived = 0, updated_at = ? WHERE id = ? AND teacher_id = ? RETURNING archived';
  const row = await db.prepare(sql).bind(now, testId, teacherId).first<{ archived: number }>();
  return row ? row.archived === 1 : null;
```

Replace it with:

```ts
): Promise<boolean | null> {
  if (!archived) {
    const row = await db
      .prepare('UPDATE tests SET archived = 0, updated_at = ? WHERE id = ? AND teacher_id = ? RETURNING archived')
      .bind(now, testId, teacherId)
      .first<{ archived: number }>();
    return row ? row.archived === 1 : null;
  }
  // The pages close only once the test is archived, so a refused archive
  // closes nothing.
  const [test] = await db.batch<{ archived: number }>([
    db
      .prepare(
        "UPDATE tests SET archived = 1, results_open = 0, updated_at = ? WHERE id = ? AND teacher_id = ? AND status = 'done' RETURNING archived",
      )
      .bind(now, testId, teacherId),
    db
      .prepare(
        `UPDATE submissions SET results_open = 0 WHERE test_id = ? AND results_open = 1
          AND EXISTS (SELECT 1 FROM tests t WHERE t.id = ? AND t.teacher_id = ? AND t.archived = 1)`,
      )
      .bind(testId, testId, teacherId),
  ]);
  const row = test?.results[0];
  return row ? row.archived === 1 : null;
```

- [ ] **Step 8: Close the pages in the class's archive**

- [ ] **Step 9: Edit `server/db/classes.ts`**

Find this block:

```ts
  const archived = changes.archived ?? current.archived;
  try {
    await db
      .prepare('UPDATE classes SET name = ?, archived = ? WHERE id = ? AND teacher_id = ?')
      .bind(name, archived ? 1 : 0, classId, teacherId)
      .run();
  } catch (err) {
```

Replace it with:

```ts
  const archived = changes.archived ?? current.archived;
  const update = db
    .prepare('UPDATE classes SET name = ?, archived = ? WHERE id = ? AND teacher_id = ?')
    .bind(name, archived ? 1 : 0, classId, teacherId);
  // Archiving the class closes every result page of its tests (for all, and
  // for single students); the tests stay as they are. A rename or taking the
  // class out of the archive opens nothing.
  const ARCHIVED_CLASS = 'SELECT 1 FROM classes c WHERE c.id = ? AND c.teacher_id = ? AND c.archived = 1';
  try {
    if (changes.archived === true) {
      await db.batch([
        update,
        db
          .prepare(`UPDATE tests SET results_open = 0 WHERE class_id = ? AND teacher_id = ? AND results_open = 1 AND EXISTS (${ARCHIVED_CLASS})`)
          .bind(classId, teacherId, classId, teacherId),
        db
          .prepare(
            `UPDATE submissions SET results_open = 0 WHERE results_open = 1
              AND test_id IN (SELECT t.id FROM tests t WHERE t.class_id = ? AND t.teacher_id = ?)
              AND EXISTS (${ARCHIVED_CLASS})`,
          )
          .bind(classId, teacherId, classId, teacherId),
      ]);
    } else {
      await update.run();
    }
  } catch (err) {
```

- [ ] **Step 10: Say it in the rules**

- [ ] **Step 11: Edit `server/AGENTS.md`**

Find this block:

```markdown
- Deleting a student from a class (`DELETE /classes/:id/students/:studentId`) checks in its SQL that no upload of the student in this class's tests is `submitted`, `grading` or `graded`. It deletes this class's enrollment and the student's `uploading` and `failed` uploads there (and their R2 files), never the `students` row: `addStudentsToClass` takes `MAX(id) + 1`, so a deleted row would hand its id to the next student, and a stale page names a student by id. When a guard `EXISTS` reads a row that the same batch deletes, the guarded statement runs first.
- A test is archived (`tests.archived`, migration 0013) only while it is `done`. The archive write checks `status = 'done'` in its SQL, and every status change away from `done` (Start, Reopen, Recorectează tot, the regrade or retry of one upload, Regenerează) sets `archived = 0` in its own UPDATE. Archiving does not touch published results.
- Payments (`routes/payments.ts`, `db/payments.ts`, `payments/stripe.ts`, `docs/payments.md`): the price comes only from `PAID_FEATURES`, never from the browser. Only the signed webhook marks a payment paid, in one UPDATE that checks the status, the amount and the currency. A paid row keeps the session's `stripe_payment_intent`. Refunds and disputes (`charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`) go into `stripe_charges` by payment intent, also before the paid session arrives, with writes that are safe to repeat and to get in any order (the refunded total only grows, a closed dispute stays closed, another currency is not kept); the reads join it by payment intent and currency (`HELD` and `GIVEN_BACK` in `db/payments.ts`). A full refund or an open or lost dispute closes the feature; a partial refund keeps it; a won dispute opens it again. A new payment's INSERT checks in its SQL that the payer has no paid payment that was not given back (a full refund, a dispute closed other than won) and no open page for the same feature and test (and, for a student, that the phone's upload exists). A paid feature's route calls `requirePaid`, which takes the scope from the catalog. A student payer is named by `student_id`, a test by its id and `created_at`; student features are for one test only, because students have no login.
```

Replace it with:

```markdown
- Deleting a student from a class (`DELETE /classes/:id/students/:studentId`) checks in its SQL that no upload of the student in this class's tests is `submitted`, `grading` or `graded`. It deletes this class's enrollment and the student's `uploading` and `failed` uploads there (and their R2 files), never the `students` row: `addStudentsToClass` takes `MAX(id) + 1`, so a deleted row would hand its id to the next student, and a stale page names a student by id. When a guard `EXISTS` reads a row that the same batch deletes, the guarded statement runs first.
- A test is archived (`tests.archived`, migration 0013) only while it is `done`. The archive write checks `status = 'done'` in its SQL, and every status change away from `done` (Start, Reopen, Recorectează tot, the regrade or retry of one upload, Regenerează) sets `archived = 0` in its own UPDATE. Archiving closes every result page of the test (`tests.results_open` and `submissions.results_open`, in the same batch, after the archive's UPDATE, checked by `archived = 1`, so a refused archive closes nothing); taking it out of the archive opens nothing. The teacher may publish on an archived test ("De făcut" then shows it). Archiving a class (`updateClass` with `archived: true`) closes the result pages of all its tests the same way, and archives none of them.
- Payments (`routes/payments.ts`, `db/payments.ts`, `payments/stripe.ts`, `docs/payments.md`): the price comes only from `PAID_FEATURES`, never from the browser. Only the signed webhook marks a payment paid, in one UPDATE that checks the status, the amount and the currency. A paid row keeps the session's `stripe_payment_intent`. Refunds and disputes (`charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`) go into `stripe_charges` by payment intent, also before the paid session arrives, with writes that are safe to repeat and to get in any order (the refunded total only grows, a closed dispute stays closed, another currency is not kept); the reads join it by payment intent and currency (`HELD` and `GIVEN_BACK` in `db/payments.ts`). A full refund or an open or lost dispute closes the feature; a partial refund keeps it; a won dispute opens it again. A new payment's INSERT checks in its SQL that the payer has no paid payment that was not given back (a full refund, a dispute closed other than won) and no open page for the same feature and test (and, for a student, that the phone's upload exists). A paid feature's route calls `requirePaid`, which takes the scope from the catalog. A student payer is named by `student_id`, a test by its id and `created_at`; student features are for one test only, because students have no login.
```

- [ ] **Step 12: Run the type check and the whole suite**

Run: `npm run typecheck`
Expected: no output after the `tsc` line.

Run: `npm test`
Expected: `Test Files  162 passed | 1 skipped (163)`, `Tests  2359 passed | 3 skipped (2362)`.

- [ ] **Step 13: Commit and compare with the prototype**

```bash
git add server/db/tests.ts server/db/classes.ts server/AGENTS.md server/routes/archive.test.ts server/routes/classes.test.ts
git commit -m "Close the result pages when a test or a class is archived"
git diff --stat refs/protoarc/a1 HEAD -- . ':!docs/superpowers'
```

Expected: the diff prints nothing.

### Task 2: An archived test with open results waits; closed is its normal end

**Files:**
- Modify: `src/admin/shell/todo.ts` (`archivedPublished`, `todoOf`)
- Modify: `src/admin/stages.ts` (Rezultate of an archived test)
- Modify: `src/admin/testsPage/nextStep.ts` ("Oprește accesul")
- Modify: `src/admin/testsPage/TestGroup.tsx` (no second "Oprește accesul" on the row)
- Modify: `src/admin/classPage/ClassTests.tsx`, `src/admin/classPage/GradesTable.tsx` (the archived class's one exception)
- Modify: `src/AGENTS.md`
- Test: `src/admin/shell/todo.test.ts`, `src/admin/stages.test.ts`, `src/admin/testsPage/nextStep.test.ts`, `src/admin/pages/TestsPage.test.tsx`, `src/admin/pages/ClassPage.test.tsx`, `src/admin/pages/SearchPage.test.tsx`

**Interfaces:**
- Consumes: Task 1 for real data; the page tests use the fake API, which keeps the results open until Task 3 (the new page test archives the class, then the test, then publishes, so it holds either way).
- Produces: `export function archivedPublished(test: TestSummary): boolean` in `src/admin/shell/todo.ts` (`test.archived && (test.resultsOpen || test.publishedCount > 0)`). `todoOf()` returns for such a test `{ stage: 'Rezultate', task: 'Rezultate publicate pe un test arhivat', text: 'Elevii își văd rezultatele. Oprește accesul sau scoate testul din arhivă.', action: 'Deschide', short: 'publicate · test arhivat' }`, and null for any other archived test. `nextStep()` returns `{ kind: 'link', label: 'Oprește accesul', to: '/teste/<code>#rezultate' }` for it.

- [ ] **Step 1: Write the failing tests**

- [ ] **Step 2: Edit `src/admin/shell/todo.test.ts`**

Find this block:

```ts
import { stagesOf } from '../stages.ts';
import { inWork, todoList, todoOf, todoPath } from './todo.ts';

```

Replace it with:

```ts
import { stagesOf } from '../stages.ts';
import { archivedPublished, inWork, todoList, todoOf, todoPath } from './todo.ts';

```

- [ ] **Step 3: Edit `src/admin/shell/todo.test.ts`**

Find this block:

```ts
    expect(todoOf(summary({ ...graded, flagCount: 2, archived: true }))).toBeNull();
  });
```

Replace it with:

```ts
    expect(todoOf(summary({ ...graded, flagCount: 2, archived: true }))).toBeNull();
  });
});

describe('an archived test with open results, in "De făcut"', () => {
  const item = {
    stage: 'Rezultate',
    task: 'Rezultate publicate pe un test arhivat',
    text: 'Elevii își văd rezultatele. Oprește accesul sau scoate testul din arhivă.',
    action: 'Deschide',
    short: 'publicate · test arhivat',
  };

  it('asks to close the results open for all, or for some students', () => {
    expect(todoOf(summary({ ...graded, archived: true, resultsOpen: true }))).toMatchObject(item);
    expect(todoOf(summary({ ...graded, archived: true, publishedCount: 1 }))).toMatchObject(item);
    expect(archivedPublished(summary({ ...graded, archived: true, publishedCount: 24 }))).toBe(true);
  });

  it('asks only that, even while points still wait', () => {
    expect(todoOf(summary({ ...graded, archived: true, resultsOpen: true, flagCount: 2 }))).toMatchObject(item);
  });

  it('asks nothing once the results are closed, or of a test that is not archived', () => {
    expect(todoOf(summary({ ...graded, archived: true }))).toBeNull();
    expect(archivedPublished(summary({ ...graded, archived: true }))).toBe(false);
    expect(archivedPublished(summary({ ...graded, resultsOpen: true }))).toBe(false);
  });

  it('opens the test page, and keeps the test out of "În lucru"', () => {
    const test = summary({ ...graded, archived: true, resultsOpen: true });
    expect(todoPath(todoOf(test)!)).toBe('/teste/6E2-26T1');
    expect(stagesOf(test).current).toEqual({ name: 'Rezultate', state: 'wait', note: 'publicate · test arhivat' });
    expect(inWork(test)).toBe(false);
  });
```

- [ ] **Step 4: Edit `src/admin/stages.test.ts`**

Find this block:

```ts
  ['a draft whose first barem generation failed', summary({ barem: { request: 'failed', unchecked: false }, prepared: { testFile: true, baremFile: false, print: 'ready' } }), 'wdllll', 'Pregătire · lipsește baremul'],
  ['an archived test with unpublished results', summary({ status: 'done', ...graded, archived: true }), 'dddddl', 'Rezultate · nepublicate'],
  ['an archived test published for some students', summary({ status: 'done', ...graded, archived: true, publishedCount: 3 }), 'dddddl', 'Rezultate · publicate pentru 3 elevi'],
  ['an archived test whose points still wait', summary({ status: 'done', ...graded, flagCount: 2, archived: true }), 'ddddnl', 'Verificare · 2 puncte nesigure'],
];
```

Replace it with:

```ts
  ['a draft whose first barem generation failed', summary({ barem: { request: 'failed', unchecked: false }, prepared: { testFile: true, baremFile: false, print: 'ready' } }), 'wdllll', 'Pregătire · lipsește baremul'],
  ['an archived test with its results closed', summary({ status: 'done', ...graded, archived: true }), 'dddddd', 'Rezultate · închise · test arhivat'],
  ['an archived test without a graded paper', summary({ status: 'done', ...started, submittedCount: 2, archived: true }), 'dddddl', 'Rezultate · nicio lucrare corectată'],
  ['an archived test with its results open', summary({ status: 'done', ...graded, archived: true, resultsOpen: true }), 'dddddw', 'Rezultate · publicate · test arhivat'],
  ['an archived test published for some students', summary({ status: 'done', ...graded, archived: true, publishedCount: 3 }), 'dddddw', 'Rezultate · publicate · test arhivat'],
  ['an archived test whose points still wait', summary({ status: 'done', ...graded, flagCount: 2, archived: true }), 'ddddnd', 'Verificare · 2 puncte nesigure'],
  [
    'an archived test with open results whose points still wait',
    summary({ status: 'done', ...graded, flagCount: 2, archived: true, publishedCount: 3 }),
    'ddddnw',
    'Rezultate · publicate · test arhivat',
  ],
];
```

- [ ] **Step 5: Edit `src/admin/testsPage/nextStep.test.ts`**

Find this block:

```ts
  ['opens the class report of published results', fakeSummary({ status: 'done', ...graded, resultsOpen: true }), { kind: 'link', label: 'Raportul clasei', to: '/teste/6E2-26T1/raport' }],
  ['has nothing for a done test without a graded paper', fakeSummary({ status: 'done', ...started, submittedCount: 2 }), null],
```

Replace it with:

```ts
  ['opens the class report of published results', fakeSummary({ status: 'done', ...graded, resultsOpen: true }), { kind: 'link', label: 'Raportul clasei', to: '/teste/6E2-26T1/raport' }],
  [
    'closes the open results of an archived test',
    fakeSummary({ status: 'done', ...graded, archived: true, publishedCount: 2 }),
    { kind: 'link', label: 'Oprește accesul', to: '/teste/6E2-26T1#rezultate' },
  ],
  ['opens the class report of an archived test with closed results', fakeSummary({ status: 'done', ...graded, archived: true }), { kind: 'link', label: 'Raportul clasei', to: '/teste/6E2-26T1/raport' }],
  ['has nothing for a done test without a graded paper', fakeSummary({ status: 'done', ...started, submittedCount: 2 }), null],
```

- [ ] **Step 6: Edit `src/admin/pages/TestsPage.test.tsx`**

Find this block:

```tsx

  it('shows results published for some students, and publishes for all', async () => {
```

Replace it with:

```tsx

  it('gives an archived test with open results one way to close them: its next step', async () => {
    for (const open of [{ resultsOpen: true }, { publishedCount: 1 }]) {
      const view = renderAdmin('/?arhivate=1', withPublishing({ archived: true, ...open }));
      const row = await findRow('Fracții');
      expect(stageText(row)).toHaveTextContent('Rezultate · publicate · test arhivat');
      expect(within(row).getAllByRole('link', { name: /^Oprește accesul/ })).toHaveLength(1);
      expect(within(row).getByRole('link', { name: 'Oprește accesul: Fracții, Clasa 6E2' })).toHaveAttribute('href', '/teste/6E2-26T1#rezultate');
      expect(within(row).queryByRole('button', { name: /Oprește accesul|Publică/ })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('shows results published for some students, and publishes for all', async () => {
```

- [ ] **Step 7: Edit `src/admin/pages/ClassPage.test.tsx`**

Find this block:

```tsx

  it('shows the students read only, with the link to all their grades', async () => {
```

Replace it with:

```tsx

  it('warns of an archived test with open results, as "De făcut" does', async () => {
    const api = await archivedClass();
    await api.setTestArchived('6E2-26T1', true);
    await api.setResultsOpen('6E2-26T1', true);
    renderAdmin('/clase/1', api);
    const aside = await screen.findByRole('complementary', { name: 'Testele clasei' });
    await userEvent.click(within(aside).getByRole('button', { name: /Arată și testele arhivate/ }));
    const items = within(aside).getAllByRole('listitem');
    // T2 stays calm; T1 waits, with its link to close the results.
    expect(within(items[0]!).queryByRole('link', { name: 'Oprește accesul' })).not.toBeInTheDocument();
    expect(within(items[1]!).getByText('Rezultate · publicate · test arhivat')).toHaveClass('is-waiting');
    const stop = within(items[1]!).getByRole('link', { name: 'Oprește accesul' });
    expect(stop).toHaveAttribute('href', '/teste/6E2-26T1#rezultate');
    expect(stop).toHaveClass('button');
    expect(aside.querySelectorAll('.is-waiting')).toHaveLength(1);
    const heads = screen.getByRole('table', { name: 'Notele elevilor la teste' }).querySelectorAll('.grade-head-note.is-waiting');
    expect(heads).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Schimbă clasa' }));
    const current = screen.getByRole('link', { name: /Clasa 6E2/ });
    expect(within(current).getByRole('img', { name: 'te așteaptă' })).toBeInTheDocument();
  });

  it('shows the students read only, with the link to all their grades', async () => {
```

- [ ] **Step 8: Edit `src/admin/pages/SearchPage.test.tsx`**

Find this block:

```tsx
    expect(within(tests).getAllByRole('row').map((row) => row.textContent)).toEqual([
      'Teorema lui StewartClasa 9A · arhivatRezultate · publicate',
      'Ștergerea fracțiilorClasa 10B · ciornăPregătire · lipsesc testul și baremul',
```

Replace it with:

```tsx
    expect(within(tests).getAllByRole('row').map((row) => row.textContent)).toEqual([
      'Teorema lui StewartClasa 9A · arhivatRezultate · publicate · test arhivat',
      'Ștergerea fracțiilorClasa 10B · ciornăPregătire · lipsesc testul și baremul',
```

- [ ] **Step 9: Run the tests to see them fail**

Run: `npx vitest run src/admin/shell/todo.test.ts src/admin/stages.test.ts src/admin/testsPage/nextStep.test.ts src/admin/pages/TestsPage.test.tsx src/admin/pages/ClassPage.test.tsx src/admin/pages/SearchPage.test.tsx`
Expected: FAIL. `Test Files  6 failed (6)`, `Tests  14 failed | 167 passed (181)`: `archivedPublished is not a function` and `expected null to match object { stage: 'Rezultate', …(4) }` (todo), five stage bars (`expected 'dddddl' to be 'dddddd'`, `expected 'dddddd' to be 'dddddw'`, `expected 'dddddl' to be 'dddddw'`, `expected 'ddddnl' to be 'ddddnd'`, `expected 'ddddnl' to be 'ddddnw'`), two next steps (`expected null to deeply equal { kind: 'link', …(2) }`), the search row (`expected [ …(2) ] to deeply equal [ …(2) ]`), the Teste row (`expect(element).toHaveTextContent()`: its stage is not yet "Rezultate · publicate · test arhivat"), and the class page (`Unable to find an element with the text: Rezultate · publicate · test arhivat`).

- [ ] **Step 10: Add the case to "De făcut"**

- [ ] **Step 11: Edit `src/admin/shell/todo.ts`**

Find this block:

```ts

// What a test waits for from the teacher, if anything (redesign spec §5, and
// the CES switch spec): four cases, checked in this order. The first has two forms: the
// generated barem waits to be checked, or its new generation failed (it can
```

Replace it with:

```ts

// An archived test with a result page open (for all, or for some students).
// The archive closes them, so this is an exception the teacher made, and
// "De făcut" keeps it until she closes them or takes the test out of the archive.
export function archivedPublished(test: TestSummary): boolean {
  return test.archived && (test.resultsOpen || test.publishedCount > 0);
}

// What a test waits for from the teacher, if anything (redesign spec §5, and
// the CES switch spec): an archived test waits only when its results are open
// (archivedPublished), and nothing else of it waits. Then four cases, checked
// in this order. The first has two forms: the
// generated barem waits to be checked, or its new generation failed (it can
```

- [ ] **Step 12: Edit `src/admin/shell/todo.ts`**

Find this block:

```ts
export function todoOf(test: TestSummary): TodoItem | null {
  if (test.archived) return null;
  const item = { code: test.code, testTitle: test.title, className: test.className };
  const preparing = (test.status === 'draft' || test.status === 'open') && test.barem.unchecked;
```

Replace it with:

```ts
export function todoOf(test: TestSummary): TodoItem | null {
  const item = { code: test.code, testTitle: test.title, className: test.className };
  if (test.archived) {
    if (!archivedPublished(test)) return null;
    return {
      ...item,
      stage: 'Rezultate',
      task: 'Rezultate publicate pe un test arhivat',
      text: 'Elevii își văd rezultatele. Oprește accesul sau scoate testul din arhivă.',
      action: 'Deschide',
      short: 'publicate · test arhivat',
    };
  }
  const preparing = (test.status === 'draft' || test.status === 'open') && test.barem.unchecked;
```

- [ ] **Step 13: Draw closed results as the end of an archived test**

- [ ] **Step 14: Edit `src/admin/stages.ts`**

Find this block:

```ts
    if (done && test.flagCount === 0) return stage('Verificare', 'done');
    // An archived test has no "De făcut", but its points still wait.
    if (test.flagCount > 0) return stage('Verificare', 'now', countLabel(test.flagCount, 'punct nesigur', 'puncte nesigure'));
```

Replace it with:

```ts
    if (done && test.flagCount === 0) return stage('Verificare', 'done');
    // An archived test's points are not in "De făcut", but they still wait.
    if (test.flagCount > 0) return stage('Verificare', 'now', countLabel(test.flagCount, 'punct nesigur', 'puncte nesigure'));
```

- [ ] **Step 15: Edit `src/admin/stages.ts`**

Find this block:

```ts
    if (done && test.gradedCount === 0) return stage('Rezultate', 'later', 'nicio lucrare corectată');
    // An archived test has no "De făcut", but its results are still not out.
    if (done && test.archived) {
      return stage('Rezultate', 'later', test.publishedCount > 0 ? `publicate pentru ${countLabel(test.publishedCount, 'elev', 'elevi')}` : 'nepublicate');
    }
    return stage('Rezultate', 'later');
```

Replace it with:

```ts
    if (done && test.gradedCount === 0) return stage('Rezultate', 'later', 'nicio lucrare corectată');
    // The archive closes the results: closed is the normal end of an archived
    // test (open ones wait, above).
    if (done && test.archived) return stage('Rezultate', 'done', 'închise · test arhivat');
    return stage('Rezultate', 'later');
```

- [ ] **Step 16: Give the row its link to close the results**

- [ ] **Step 17: Edit `src/admin/testsPage/nextStep.ts`**

Find this block:

```ts
    case 'Rezultate':
      if (current.state === 'wait') return { kind: 'publish', label: test.publishedCount > 0 ? 'Publică pentru toți' : 'Publică rezultatele' };
```

Replace it with:

```ts
    case 'Rezultate':
      // An archived test waits only for its open results to close.
      if (current.state === 'wait' && test.archived) return link('Oprește accesul', `${page}${stageHash('Rezultate')}`);
      if (current.state === 'wait') return { kind: 'publish', label: test.publishedCount > 0 ? 'Publică pentru toți' : 'Publică rezultatele' };
```

- [ ] **Step 18: Keep one "Oprește accesul" on the row**

The row of a test with open results has its own "Oprește accesul" button. For an archived test the next step is already that link, so the button stays off.

- [ ] **Step 19: Edit `src/admin/testsPage/TestGroup.tsx`**

Find this block:

```tsx
          )}
          {test.resultsOpen && (
            <button
```

Replace it with:

```tsx
          )}
          {/* An archived test's next step is already the way to close them. */}
          {test.resultsOpen && !test.archived && (
            <button
```

- [ ] **Step 20: Let that test wait on an archived class's page**

- [ ] **Step 21: Edit `src/admin/classPage/ClassTests.tsx`**

Find this block:

```tsx
import { stagesOf } from '../stages.ts';
import { todoOf } from '../shell/todo.ts';
import { nextStep, type NextStep } from '../testsPage/nextStep.ts';
```

Replace it with:

```tsx
import { stagesOf } from '../stages.ts';
import { archivedPublished, todoOf } from '../shell/todo.ts';
import { nextStep, type NextStep } from '../testsPage/nextStep.ts';
```

- [ ] **Step 22: Edit `src/admin/classPage/ClassTests.tsx`**

Find this block:

```tsx
// teacher asks, here and in the table. In an archived class (`readOnly`) the
// one step of a test is its report, once a paper is graded.
export function ClassTests({
```

Replace it with:

```tsx
// teacher asks, here and in the table. In an archived class (`readOnly`) the
// one step of a test is its report, once a paper is graded, and nothing waits;
// only an archived test with open results waits there too, as in "De făcut".
export function ClassTests({
```

- [ ] **Step 23: Edit `src/admin/classPage/ClassTests.tsx`**

Find this block:

```tsx
            const { current } = stagesOf(test);
            const step: NextStep = !readOnly
              ? nextStep(test, current)
```

Replace it with:

```tsx
            const { current } = stagesOf(test);
            const live = !readOnly || archivedPublished(test);
            const step: NextStep = live
              ? nextStep(test, current)
```

- [ ] **Step 24: Edit `src/admin/classPage/ClassTests.tsx`**

Find this block:

```tsx
                : null;
            const waits = !readOnly && todoOf(test) !== null;
            return (
```

Replace it with:

```tsx
                : null;
            const waits = live && todoOf(test) !== null;
            return (
```

- [ ] **Step 25: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
import { stagesOf } from '../stages.ts';
import { todoOf } from '../shell/todo.ts';
import type { StudentLinkState } from '../pages/StudentPage.tsx';
```

Replace it with:

```tsx
import { stagesOf } from '../stages.ts';
import { archivedPublished, todoOf } from '../shell/todo.ts';
import type { StudentLinkState } from '../pages/StudentPage.tsx';
```

- [ ] **Step 26: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
// The line under a test's name: its date (or "ciornă") and where it stands,
// in orange when it waits on the teacher (never in an archived class).
function headNote(test: TestSummary, readOnly: boolean): { text: string; waits: boolean } {
  const date = test.startedAt === null ? 'ciornă' : formatDayMonth(test.startedAt);
  const waits = !readOnly && todoOf(test) !== null;
  if (test.flagCount > 0) return { text: `${date} · de verificat`, waits };
```

Replace it with:

```tsx
// The line under a test's name: its date (or "ciornă") and where it stands,
// in orange when it waits on the teacher (in an archived class, only an
// archived test with open results).
function headNote(test: TestSummary, readOnly: boolean): { text: string; waits: boolean } {
  const date = test.startedAt === null ? 'ciornă' : formatDayMonth(test.startedAt);
  const waits = (!readOnly || archivedPublished(test)) && todoOf(test) !== null;
  if (test.flagCount > 0) return { text: `${date} · de verificat`, waits };
```

- [ ] **Step 27: Say it in the rules**

- [ ] **Step 28: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the files, the students' link while the test is a draft or open, rename, archive, delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table (`UploadsTable.tsx`: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off), "Recorectează tot"). `pages/ReviewPage.tsx` and `reviewPage/` are the review of the points to check (redesign spec §7, `/teste/:code/verificare`): the papers and their points (`ReviewQueue.tsx`), one page of the paper at a time (`ReviewPhoto.tsx`; no marks on the photo, because the robot does not say where an answer is), and the decision (`ReviewDecision.tsx`: "Accept", the stepper and "Salvează", "Am verificat paginile", the paper's exercises). `points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first), steps between them, and writes the address (`?lucrare=&punct=`, replaced, never a new step in the history). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point; a refused one reads the paper and the test again. An address that names no paper of the test is rewritten first (`ReviewLoader` draws `<Navigate replace>` to `firstSpot()`), before any paper is drawn: a refresh never moves the spot, and no decision is made on a spot the address does not hold. The next point opens only if the teacher is still at the decided one (a call-level `onSuccess` of `mutate`, which does not run once the page is gone), and its heading takes the focus (`focus({ preventScroll: true })`). An address of a paper with no result now (graded again) shows that paper with the reason (`submissionPage/waitingText.ts`, shared with the paper page); when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A, J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
- `pages/TestsPage.tsx` is the start page, the Teste page of the redesign (spec §5): the greeting and today's date in Romania's time (`testsPage/greeting.ts`), "N lucruri te așteaptă ˅", which opens the list of what waits in place (`testsPage/TodoRows.tsx`: "De făcut" of every class of the year, as the bar counts it, whatever chip is chosen), the class chips and the box "Arată și testele arhivate", and the groups "În lucru" and "Terminate" (`testsPage/TestGroup.tsx`; `inWork()` in `shell/todo.ts` is the rule of the panel "Clasele tale" too). A row shows the test, the stage bar and the current stage, the papers, and one next step (`testsPage/nextStep.ts`): a link to the test (to the review for "Verifică 3 puncte"), or the button that publishes the results on the row; "Oprește accesul" stays on a row whose results are open. Below 768px each row is a block.
- `stages.ts`: the six stages of a test (Pregătire, Tipărire, În clasă, Corectare, Verificare, Rezultate), each done, waiting on the teacher, in progress or later, and the current one, from the tests list (`TestSummary.prepared`, `barem`, the counts and `averageGrade`). A stage waits on the teacher (orange) exactly when `todoOf()` has the test, at that stage. The test page uses it too: it opens on the current stage (from data read for this visit, not data cached from an earlier one), and `stageHash()` and `stageFromHash()` give each stage's panel its address (`#pregatire` … `#rezultate`). After the first load only the teacher changes the panel: a refresh or a button that moves the test to another stage keeps it. The Teste page's "Pornește corectarea" opens `#corectare`.
- `classPage/GradesTable.tsx` is the class page's grade table, in a card (students by tests, the oldest test on the left, a 156px column per test headed by its name and "date · state", orange when the test waits; a cell shows the grade, orange with a dot when points wait, the upload's state, or "—" when no paper was sent; the last row is "Media testului", no per-student average; draft and open tests keep a column; archived tests show only when asked). `classPage/ClassTests.tsx` is "Testele clasei", beside the table (under it below 1180px): the newest test first, each with its date, the papers sent, its stage (orange when it waits) and its one next step (from `testsPage/nextStep.ts`, the button that publishes the results included; filled blue when it waits), and the toggle "Arată și testele arhivate (n)" that reveals the archived tests in the table too. `classPage/ClassStudents.tsx` is the "Elevi" tab, one card split in two (stacked below 760px): the students on the left (search that ignores case and diacritics, orange dot when points wait, "+ Adaugă elevi"), the chosen student on the right (the first one at first; "Redenumește", "A plecat din clasă", "Șterge"; a table of the class's tests with the date, the points, the grade and "N puncte de verificat", the result ("Publicat", "Nepublicat" with "Copiază linkul", "După verificare", "Nu a trimis lucrarea."), and "Lucrarea"; link "Toate notele elevului, din toate clasele"). An archived class is the same page, read only (`readOnly` on `GradesTable`, `ClassTests` and `ClassStudents`): a strip "Clasă arhivată." with "Scoate din arhivă" above the head (one write with ⋯'s item), the tag "Arhivată" first in the facts, no "Test nou pentru această clasă", no "+ Adaugă elevi", no "Redenumește", "A plecat din clasă" or "Șterge" for a student, nothing orange, and "Raportul clasei" as each test's one step once a paper is graded. `classPage/ClassDialogs.tsx` holds the class page's dialogs: "Clasă nouă" (the name and the students, one per line, in one step; a class made before its students failed is not made twice), "Adaugă elevi" (early warnings for names already in the class or pasted twice), and the rename of a class or a student. They use `Modal.tsx`, the app's dialog: a title, ×, a dimmed backdrop, the focus on the first field and kept inside, Esc (in the capture phase, before a panel), and the focus back to the opener (or to `returnFocus` when the opener closed with its menu). `pages/ClassPage.tsx` is the class page (`/clase/:id`): the top line (the name, "Schimbă clasa" with the classes of the year, the current one marked, a dot for one that waits, the archived classes last in their muted group "Arhivate" (the only list that leads to them; an archived class's ⋯ has "Scoate din arhivă"), and "+ Clasă nouă"; the facts; "Test nou pentru această clasă"; ⋯ with "Redenumește clasa"/"Arhivează clasa") and the two tabs ("Elevi" with its count). `pages/LastClassPage.tsx` is `/clase`: it opens the last class the teacher saw (kept in `localStorage` as `quickeval:lastClass`, else the first active one of the year), or, with no active class, offers "+ Clasă nouă" and links the archived classes. A link's state (`ClassLinkState`) goes on to that class page: `{ newClass: true }` (the panel's "+ Clasă nouă") opens that dialog on arrival, `{ archived: true }` (the panel's "Arhivate (n)") opens "Schimbă clasa" at "Arhivate". The old "page with all classes" (`ClassesPage`) and `ClassStudentsPage` no longer exist.
- The CES variant: `CesTag.tsx` is the mark next to a CES student's name in every teacher table that lists students (the class page's two tabs, the papers table, the links table, the class report, the review queue, the search, the student page's heading); Fișa testului lists the CES files; "De făcut" (`shell/todo.ts`) also asks to check a generated CES barem, or to generate it again (`TestSummary.cesBarem`), after the class barem's case and until the test is done; `testPage/CesVariant.tsx` holds "Varianta CES" in Pregătire (shown while the class has a CES student or the variant has a file: the CES students and the switch "Test separat pentru elevii cu CES" (`CesSwitch.tsx`, also on Test nou; off asks first when there are CES files, then removes them through `setCesOff`), its own `TestFiles` with `variant="ces"` while the switch is on, the total warning, and "Șterge varianta CES" only once the class has no CES student left) and the notice of the CES papers that wait for their barem in Corectare (`CesWaiting`); `testPage/variant.ts` picks a variant's parts of a test. What a draft or open test misses (`missing.ts`) is said in the stages, in "De făcut", as orange "lipsește" (and green "gata") marks in `TestFiles`, and as `MissingList.tsx` under "Începe testul" (with why each part matters) and under "Creează testul". `TestFiles`, `useGeneratedBarem`, `PrintTest` and `ExerciseListBanner` take `variant`. The class report, its CSV and the class PDF draw the tables of `reportTables` (`shared/stats.ts`): one, or the class papers then the CES papers with their own exercises; the CSV never names CES.
```

Replace it with:

```markdown
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the files, the students' link while the test is a draft or open, rename, archive, delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table (`UploadsTable.tsx`: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off), "Recorectează tot"). `pages/ReviewPage.tsx` and `reviewPage/` are the review of the points to check (redesign spec §7, `/teste/:code/verificare`): the papers and their points (`ReviewQueue.tsx`), one page of the paper at a time (`ReviewPhoto.tsx`; no marks on the photo, because the robot does not say where an answer is), and the decision (`ReviewDecision.tsx`: "Accept", the stepper and "Salvează", "Am verificat paginile", the paper's exercises). `points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first), steps between them, and writes the address (`?lucrare=&punct=`, replaced, never a new step in the history). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point; a refused one reads the paper and the test again. An address that names no paper of the test is rewritten first (`ReviewLoader` draws `<Navigate replace>` to `firstSpot()`), before any paper is drawn: a refresh never moves the spot, and no decision is made on a spot the address does not hold. The next point opens only if the teacher is still at the decided one (a call-level `onSuccess` of `mutate`, which does not run once the page is gone), and its heading takes the focus (`focus({ preventScroll: true })`). An address of a paper with no result now (graded again) shows that paper with the reason (`submissionPage/waitingText.ts`, shared with the paper page); when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A, J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
- `pages/TestsPage.tsx` is the start page, the Teste page of the redesign (spec §5): the greeting and today's date in Romania's time (`testsPage/greeting.ts`), "N lucruri te așteaptă ˅", which opens the list of what waits in place (`testsPage/TodoRows.tsx`: "De făcut" of every class of the year, as the bar counts it, whatever chip is chosen), the class chips and the box "Arată și testele arhivate", and the groups "În lucru" and "Terminate" (`testsPage/TestGroup.tsx`; `inWork()` in `shell/todo.ts` is the rule of the panel "Clasele tale" too). A row shows the test, the stage bar and the current stage, the papers, and one next step (`testsPage/nextStep.ts`): a link to the test (to the review for "Verifică 3 puncte"), or the button that publishes the results on the row; "Oprește accesul" stays on a row whose results are open (not on an archived test: its next step is already the link "Oprește accesul"). Below 768px each row is a block.
- `stages.ts`: the six stages of a test (Pregătire, Tipărire, În clasă, Corectare, Verificare, Rezultate), each done, waiting on the teacher, in progress or later, and the current one, from the tests list (`TestSummary.prepared`, `barem`, the counts and `averageGrade`). A stage waits on the teacher (orange) exactly when `todoOf()` has the test, at that stage. An archived test's closed results are its normal end: Rezultate is done, "închise · test arhivat". The test page uses it too: it opens on the current stage (from data read for this visit, not data cached from an earlier one), and `stageHash()` and `stageFromHash()` give each stage's panel its address (`#pregatire` … `#rezultate`). After the first load only the teacher changes the panel: a refresh or a button that moves the test to another stage keeps it. The Teste page's "Pornește corectarea" opens `#corectare`.
- `classPage/GradesTable.tsx` is the class page's grade table, in a card (students by tests, the oldest test on the left, a 156px column per test headed by its name and "date · state", orange when the test waits; a cell shows the grade, orange with a dot when points wait, the upload's state, or "—" when no paper was sent; the last row is "Media testului", no per-student average; draft and open tests keep a column; archived tests show only when asked). `classPage/ClassTests.tsx` is "Testele clasei", beside the table (under it below 1180px): the newest test first, each with its date, the papers sent, its stage (orange when it waits) and its one next step (from `testsPage/nextStep.ts`, the button that publishes the results included; filled blue when it waits), and the toggle "Arată și testele arhivate (n)" that reveals the archived tests in the table too. `classPage/ClassStudents.tsx` is the "Elevi" tab, one card split in two (stacked below 760px): the students on the left (search that ignores case and diacritics, orange dot when points wait, "+ Adaugă elevi"), the chosen student on the right (the first one at first; "Redenumește", "A plecat din clasă", "Șterge"; a table of the class's tests with the date, the points, the grade and "N puncte de verificat", the result ("Publicat", "Nepublicat" with "Copiază linkul", "După verificare", "Nu a trimis lucrarea."), and "Lucrarea"; link "Toate notele elevului, din toate clasele"). An archived class is the same page, read only (`readOnly` on `GradesTable`, `ClassTests` and `ClassStudents`): a strip "Clasă arhivată." with "Scoate din arhivă" above the head (one write with ⋯'s item), the tag "Arhivată" first in the facts, no "Test nou pentru această clasă", no "+ Adaugă elevi", no "Redenumește", "A plecat din clasă" or "Șterge" for a student, nothing orange, and "Raportul clasei" as each test's one step once a paper is graded; the one exception is an archived test with open results, which waits there as in "De făcut" (orange, "Oprește accesul", and the class's dot in "Schimbă clasa"). `classPage/ClassDialogs.tsx` holds the class page's dialogs: "Clasă nouă" (the name and the students, one per line, in one step; a class made before its students failed is not made twice), "Adaugă elevi" (early warnings for names already in the class or pasted twice), and the rename of a class or a student. They use `Modal.tsx`, the app's dialog: a title, ×, a dimmed backdrop, the focus on the first field and kept inside, Esc (in the capture phase, before a panel), and the focus back to the opener (or to `returnFocus` when the opener closed with its menu). `pages/ClassPage.tsx` is the class page (`/clase/:id`): the top line (the name, "Schimbă clasa" with the classes of the year, the current one marked, a dot for one that waits, the archived classes last in their muted group "Arhivate" (the only list that leads to them; an archived class's ⋯ has "Scoate din arhivă"), and "+ Clasă nouă"; the facts; "Test nou pentru această clasă"; ⋯ with "Redenumește clasa"/"Arhivează clasa") and the two tabs ("Elevi" with its count). `pages/LastClassPage.tsx` is `/clase`: it opens the last class the teacher saw (kept in `localStorage` as `quickeval:lastClass`, else the first active one of the year), or, with no active class, offers "+ Clasă nouă" and links the archived classes. A link's state (`ClassLinkState`) goes on to that class page: `{ newClass: true }` (the panel's "+ Clasă nouă") opens that dialog on arrival, `{ archived: true }` (the panel's "Arhivate (n)") opens "Schimbă clasa" at "Arhivate". The old "page with all classes" (`ClassesPage`) and `ClassStudentsPage` no longer exist.
- The CES variant: `CesTag.tsx` is the mark next to a CES student's name in every teacher table that lists students (the class page's two tabs, the papers table, the links table, the class report, the review queue, the search, the student page's heading); Fișa testului lists the CES files; "De făcut" (`shell/todo.ts`) also asks to check a generated CES barem, or to generate it again (`TestSummary.cesBarem`), after the class barem's case and until the test is done; `testPage/CesVariant.tsx` holds "Varianta CES" in Pregătire (shown while the class has a CES student or the variant has a file: the CES students and the switch "Test separat pentru elevii cu CES" (`CesSwitch.tsx`, also on Test nou; off asks first when there are CES files, then removes them through `setCesOff`), its own `TestFiles` with `variant="ces"` while the switch is on, the total warning, and "Șterge varianta CES" only once the class has no CES student left) and the notice of the CES papers that wait for their barem in Corectare (`CesWaiting`); `testPage/variant.ts` picks a variant's parts of a test. What a draft or open test misses (`missing.ts`) is said in the stages, in "De făcut", as orange "lipsește" (and green "gata") marks in `TestFiles`, and as `MissingList.tsx` under "Începe testul" (with why each part matters) and under "Creează testul". `TestFiles`, `useGeneratedBarem`, `PrintTest` and `ExerciseListBanner` take `variant`. The class report, its CSV and the class PDF draw the tables of `reportTables` (`shared/stats.ts`): one, or the class papers then the CES papers with their own exercises; the CSV never names CES.
```

- [ ] **Step 29: Run the type check and the whole suite**

Run: `npm run typecheck`
Expected: no output after the `tsc` line.

Run: `npm test`
Expected: `Test Files  162 passed | 1 skipped (163)`, `Tests  2370 passed | 3 skipped (2373)`.

- [ ] **Step 30: Commit and compare with the prototype**

```bash
git add src/admin/shell/todo.ts src/admin/stages.ts src/admin/testsPage/nextStep.ts src/admin/testsPage/TestGroup.tsx src/admin/classPage/ClassTests.tsx src/admin/classPage/GradesTable.tsx src/AGENTS.md src/admin/shell/todo.test.ts src/admin/stages.test.ts src/admin/testsPage/nextStep.test.ts src/admin/pages/TestsPage.test.tsx src/admin/pages/ClassPage.test.tsx src/admin/pages/SearchPage.test.tsx
git commit -m "Show an archived test with open results in De făcut, and closed results as its normal end"
git diff --stat refs/protoarc/a2 HEAD -- . ':!docs/superpowers'
```

Expected: the diff prints nothing.

### Task 3: Ask before an archive that closes open results

**Files:**
- Create: `src/admin/ArchiveDialog.tsx`
- Modify: `src/ui/brand.css` (`.modal-text`, `.modal-actions`)
- Modify: `src/admin/testPage/TestSheet.tsx`, `src/admin/pages/ClassPage.tsx`
- Modify: `src/test/fakeApi.ts` (the fake closes the pages like the server)
- Modify: `src/AGENTS.md`
- Test: `src/admin/pages/TestPage.test.tsx`, `src/admin/pages/ClassPage.test.tsx`

**Interfaces:**
- Consumes: nothing new from Tasks 1 and 2.
- Produces: `src/admin/ArchiveDialog.tsx` exports `hasOpenResults(test: { resultsOpen: boolean; publishedCount: number }): boolean` and `ArchiveDialog({ title, text, onConfirm, onClose }: { title: string; text: string; onConfirm(): void; onClose(): void })`, a `Modal` with the text, "Renunță" and "Arhivează" (which closes the dialog, then calls `onConfirm`).

- [ ] **Step 1: Make the fake API close the pages like the server**

- [ ] **Step 2: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  };

```

Replace it with:

```ts
  };
  // Like the server: closes every result page of a test, the ones published
  // alone included.
  const closeResults = (detail: TestDetail) => {
    detail.test.resultsOpen = false;
    detail.test.publishedCount = 0;
    for (const row of detail.uploads) {
      if (row.submissionId !== null) row.resultsOpen = false;
    }
    for (const sub of submissions) {
      if (sub.testCode === detail.test.code) sub.resultsOpen = false;
    }
  };

```

- [ ] **Step 3: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
      if (input.archived !== undefined) found.archived = input.archived;
      return { ...found };
```

Replace it with:

```ts
      if (input.archived !== undefined) found.archived = input.archived;
      // Like the server: archiving the class closes the result pages of its tests.
      if (input.archived === true) {
        for (const detail of tests) if (detail.test.classId === classId) closeResults(detail);
      }
      return { ...found };
```

- [ ] **Step 4: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
      found.archived = archived;
      return archived;
```

Replace it with:

```ts
      found.archived = archived;
      // Like the server: the archive closes the result pages.
      if (archived) closeResults(findTest(code));
      return archived;
```

- [ ] **Step 5: Write the failing tests**

- [ ] **Step 6: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Arhivează testul' }));
    expect(api.setTestArchived).toHaveBeenCalledWith('6E2-26T1', true);
```

Replace it with:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Arhivează testul' }));
    // Nothing published: no question.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.setTestArchived).toHaveBeenCalledWith('6E2-26T1', true);
```

- [ ] **Step 7: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(screen.queryByText('Arhivat')).not.toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(screen.queryByText('Arhivat')).not.toBeInTheDocument();
  });

  it('asks before an archive that closes open results, and changes nothing on "Renunță"', async () => {
    const api = apiWith({ status: 'done', resultsOpen: true });
    renderAdmin(PAGE, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Arhivează testul' }));
    const dialog = screen.getByRole('dialog', { name: 'Arhivezi testul?' });
    expect(within(dialog).getByText('Elevii nu își vor mai putea vedea rezultatele. Le poți publica din nou oricând.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Renunță' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.setTestArchived).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Arhivează testul' })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Arhivează testul' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Arhivezi testul?' })).getByRole('button', { name: 'Arhivează' }));
    expect(api.setTestArchived).toHaveBeenCalledWith('6E2-26T1', true);
    expect(await within(sheet()).findByText('Arhivat')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks also when the results are published for some students only', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done', publishedCount: 1 }));
    await userEvent.click(await screen.findByRole('button', { name: 'Arhivează testul' }));
    expect(screen.getByRole('dialog', { name: 'Arhivezi testul?' })).toBeInTheDocument();
  });
```

- [ ] **Step 8: Edit `src/admin/pages/ClassPage.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByRole('dialog', { name: 'Clasă nouă' })).toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(await screen.findByRole('dialog', { name: 'Clasă nouă' })).toBeInTheDocument();
  });
});

describe('ClassPage, archiving a class with open results', () => {
  const archiveFromMenu = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Mai multe pentru Clasa 6E2' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Arhivează clasa' }));
  };

  it('asks first, and changes nothing on "Renunță"', async () => {
    // T1 is published for Pop Ion.
    const data = classData();
    data.tests[1]!.test.publishedCount = 1;
    const api = createFakeApi(data);
    renderAdmin('/clase/1', api);
    await archiveFromMenu();
    const dialog = screen.getByRole('dialog', { name: 'Arhivezi clasa?' });
    expect(
      within(dialog).getByText('Elevii nu își vor mai putea vedea rezultatele testelor acestei clase. Le poți publica din nou oricând.'),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Renunță' }));
    expect(api.updateClass).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Mai multe pentru Clasa 6E2' })).toHaveFocus();

    await archiveFromMenu();
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Arhivezi clasa?' })).getByRole('button', { name: 'Arhivează' }));
    expect(api.updateClass).toHaveBeenCalledWith(1, { archived: true });
    expect(await screen.findByText('Clasă arhivată.')).toBeInTheDocument();
  });

  it('archives at once when no result is open', async () => {
    const data = classData();
    for (const detail of data.tests) detail.test.publishedCount = 0;
    const api = createFakeApi(data);
    renderAdmin('/clase/1', api);
    await archiveFromMenu();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.updateClass).toHaveBeenCalledWith(1, { archived: true });
  });
```

- [ ] **Step 9: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/TestPage.test.tsx src/admin/pages/ClassPage.test.tsx`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  3 failed | 160 passed (163)`: `Unable to find an accessible element with the role "dialog" and name "Arhivezi testul?"` (twice) and `… name "Arhivezi clasa?"`. "archives at once when no result is open" passes at RED: it guards that nothing asks when nothing is open.

- [ ] **Step 10: Create `src/admin/ArchiveDialog.tsx`**

```tsx
import { Modal } from './Modal.tsx';

// What a test's or a class's archive would close: the result pages students
// can open now (for all, or for some students).
export function hasOpenResults(test: { resultsOpen: boolean; publishedCount: number }): boolean {
  return test.resultsOpen || test.publishedCount > 0;
}

// Asks before an archive that closes result pages students can open now.
// "Arhivează" closes the dialog and archives; "Renunță", Esc, × and the
// backdrop change nothing.
export function ArchiveDialog({ title, text, onConfirm, onClose }: { title: string; text: string; onConfirm(): void; onClose(): void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="modal-body">
        <p className="modal-text">{text}</p>
        <div className="modal-actions">
          <button type="button" className="button-quiet" onClick={onClose}>
            Renunță
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            Arhivează
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 11: Lay out the dialog's text and buttons**

- [ ] **Step 12: Edit `src/ui/brand.css`**

Find this block:

```css

@media (max-width: 1180px) {
```

Replace it with:

```css

.modal-text {
  margin: 0;
}

.modal-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem;
}

@media (max-width: 1180px) {
```

- [ ] **Step 13: Ask in Fișa testului**

- [ ] **Step 14: Edit `src/admin/testPage/TestSheet.tsx`**

Find this block:

```tsx
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
```

Replace it with:

```tsx
import { useApi } from '../ApiContext.tsx';
import { ArchiveDialog, hasOpenResults } from '../ArchiveDialog.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
```

- [ ] **Step 15: Edit `src/admin/testPage/TestSheet.tsx`**

Find this block:

```tsx
  const [renameOpen, setRenameOpen] = useState(false);
  const remove = useMutation({
```

Replace it with:

```tsx
  const [renameOpen, setRenameOpen] = useState(false);
  // The archive closes the result pages: it asks first while some are open.
  const [askArchive, setAskArchive] = useState(false);
  const remove = useMutation({
```

- [ ] **Step 16: Edit `src/admin/testPage/TestSheet.tsx`**

Find this block:

```tsx
            <>
              <button type="button" className="button-quiet button-small" disabled={archive.isPending} onClick={() => archive.mutate(true)}>
                Arhivează testul
```

Replace it with:

```tsx
            <>
              <button
                type="button"
                className="button-quiet button-small"
                disabled={archive.isPending}
                onClick={() => (hasOpenResults(test) ? setAskArchive(true) : archive.mutate(true))}
              >
                Arhivează testul
```

- [ ] **Step 17: Edit `src/admin/testPage/TestSheet.tsx`**

Find this block:

```tsx
          )
        )}
```

Replace it with:

```tsx
          )
        )}
        {askArchive && (
          <ArchiveDialog
            title="Arhivezi testul?"
            text="Elevii nu își vor mai putea vedea rezultatele. Le poți publica din nou oricând."
            onConfirm={() => archive.mutate(true)}
            onClose={() => setAskArchive(false)}
          />
        )}
```

- [ ] **Step 18: Ask on the class page**

- [ ] **Step 19: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
```

Replace it with:

```tsx
import { useApi } from '../ApiContext.tsx';
import { ArchiveDialog, hasOpenResults } from '../ArchiveDialog.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
```

- [ ] **Step 20: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
  });

```

Replace it with:

```tsx
  });
  // Archiving the class closes the result pages of its tests: it asks first
  // while some are open.
  const [askArchive, setAskArchive] = useState(false);

```

- [ ] **Step 21: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
            archiving={archive.isPending}
            onArchive={() => archive.mutate(!info.archived)}
            onDone={refresh}
```

Replace it with:

```tsx
            archiving={archive.isPending}
            onArchive={() => (!info.archived && tests.some(hasOpenResults) ? setAskArchive(true) : archive.mutate(!info.archived))}
            onDone={refresh}
```

- [ ] **Step 22: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
      </div>
      {archive.error && <ErrorMessage error={archive.error} />}
```

Replace it with:

```tsx
      </div>
      {askArchive && (
        <ArchiveDialog
          title="Arhivezi clasa?"
          text="Elevii nu își vor mai putea vedea rezultatele testelor acestei clase. Le poți publica din nou oricând."
          onConfirm={() => archive.mutate(true)}
          onClose={() => setAskArchive(false)}
        />
      )}
      {archive.error && <ErrorMessage error={archive.error} />}
```

- [ ] **Step 23: Say it in the rules**

- [ ] **Step 24: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the files, the students' link while the test is a draft or open, rename, archive, delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table (`UploadsTable.tsx`: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off), "Recorectează tot"). `pages/ReviewPage.tsx` and `reviewPage/` are the review of the points to check (redesign spec §7, `/teste/:code/verificare`): the papers and their points (`ReviewQueue.tsx`), one page of the paper at a time (`ReviewPhoto.tsx`; no marks on the photo, because the robot does not say where an answer is), and the decision (`ReviewDecision.tsx`: "Accept", the stepper and "Salvează", "Am verificat paginile", the paper's exercises). `points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first), steps between them, and writes the address (`?lucrare=&punct=`, replaced, never a new step in the history). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point; a refused one reads the paper and the test again. An address that names no paper of the test is rewritten first (`ReviewLoader` draws `<Navigate replace>` to `firstSpot()`), before any paper is drawn: a refresh never moves the spot, and no decision is made on a spot the address does not hold. The next point opens only if the teacher is still at the decided one (a call-level `onSuccess` of `mutate`, which does not run once the page is gone), and its heading takes the focus (`focus({ preventScroll: true })`). An address of a paper with no result now (graded again) shows that paper with the reason (`submissionPage/waitingText.ts`, shared with the paper page); when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A, J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

Replace it with:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the files, the students' link while the test is a draft or open, rename, archive (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`), delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table (`UploadsTable.tsx`: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off), "Recorectează tot"). `pages/ReviewPage.tsx` and `reviewPage/` are the review of the points to check (redesign spec §7, `/teste/:code/verificare`): the papers and their points (`ReviewQueue.tsx`), one page of the paper at a time (`ReviewPhoto.tsx`; no marks on the photo, because the robot does not say where an answer is), and the decision (`ReviewDecision.tsx`: "Accept", the stepper and "Salvează", "Am verificat paginile", the paper's exercises). `points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first), steps between them, and writes the address (`?lucrare=&punct=`, replaced, never a new step in the history). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point; a refused one reads the paper and the test again. An address that names no paper of the test is rewritten first (`ReviewLoader` draws `<Navigate replace>` to `firstSpot()`), before any paper is drawn: a refresh never moves the spot, and no decision is made on a spot the address does not hold. The next point opens only if the teacher is still at the decided one (a call-level `onSuccess` of `mutate`, which does not run once the page is gone), and its heading takes the focus (`focus({ preventScroll: true })`). An address of a paper with no result now (graded again) shows that paper with the reason (`submissionPage/waitingText.ts`, shared with the paper page); when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A, J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

- [ ] **Step 25: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `stages.ts`: the six stages of a test (Pregătire, Tipărire, În clasă, Corectare, Verificare, Rezultate), each done, waiting on the teacher, in progress or later, and the current one, from the tests list (`TestSummary.prepared`, `barem`, the counts and `averageGrade`). A stage waits on the teacher (orange) exactly when `todoOf()` has the test, at that stage. An archived test's closed results are its normal end: Rezultate is done, "închise · test arhivat". The test page uses it too: it opens on the current stage (from data read for this visit, not data cached from an earlier one), and `stageHash()` and `stageFromHash()` give each stage's panel its address (`#pregatire` … `#rezultate`). After the first load only the teacher changes the panel: a refresh or a button that moves the test to another stage keeps it. The Teste page's "Pornește corectarea" opens `#corectare`.
- `classPage/GradesTable.tsx` is the class page's grade table, in a card (students by tests, the oldest test on the left, a 156px column per test headed by its name and "date · state", orange when the test waits; a cell shows the grade, orange with a dot when points wait, the upload's state, or "—" when no paper was sent; the last row is "Media testului", no per-student average; draft and open tests keep a column; archived tests show only when asked). `classPage/ClassTests.tsx` is "Testele clasei", beside the table (under it below 1180px): the newest test first, each with its date, the papers sent, its stage (orange when it waits) and its one next step (from `testsPage/nextStep.ts`, the button that publishes the results included; filled blue when it waits), and the toggle "Arată și testele arhivate (n)" that reveals the archived tests in the table too. `classPage/ClassStudents.tsx` is the "Elevi" tab, one card split in two (stacked below 760px): the students on the left (search that ignores case and diacritics, orange dot when points wait, "+ Adaugă elevi"), the chosen student on the right (the first one at first; "Redenumește", "A plecat din clasă", "Șterge"; a table of the class's tests with the date, the points, the grade and "N puncte de verificat", the result ("Publicat", "Nepublicat" with "Copiază linkul", "După verificare", "Nu a trimis lucrarea."), and "Lucrarea"; link "Toate notele elevului, din toate clasele"). An archived class is the same page, read only (`readOnly` on `GradesTable`, `ClassTests` and `ClassStudents`): a strip "Clasă arhivată." with "Scoate din arhivă" above the head (one write with ⋯'s item), the tag "Arhivată" first in the facts, no "Test nou pentru această clasă", no "+ Adaugă elevi", no "Redenumește", "A plecat din clasă" or "Șterge" for a student, nothing orange, and "Raportul clasei" as each test's one step once a paper is graded; the one exception is an archived test with open results, which waits there as in "De făcut" (orange, "Oprește accesul", and the class's dot in "Schimbă clasa"). `classPage/ClassDialogs.tsx` holds the class page's dialogs: "Clasă nouă" (the name and the students, one per line, in one step; a class made before its students failed is not made twice), "Adaugă elevi" (early warnings for names already in the class or pasted twice), and the rename of a class or a student. They use `Modal.tsx`, the app's dialog: a title, ×, a dimmed backdrop, the focus on the first field and kept inside, Esc (in the capture phase, before a panel), and the focus back to the opener (or to `returnFocus` when the opener closed with its menu). `pages/ClassPage.tsx` is the class page (`/clase/:id`): the top line (the name, "Schimbă clasa" with the classes of the year, the current one marked, a dot for one that waits, the archived classes last in their muted group "Arhivate" (the only list that leads to them; an archived class's ⋯ has "Scoate din arhivă"), and "+ Clasă nouă"; the facts; "Test nou pentru această clasă"; ⋯ with "Redenumește clasa"/"Arhivează clasa") and the two tabs ("Elevi" with its count). `pages/LastClassPage.tsx` is `/clase`: it opens the last class the teacher saw (kept in `localStorage` as `quickeval:lastClass`, else the first active one of the year), or, with no active class, offers "+ Clasă nouă" and links the archived classes. A link's state (`ClassLinkState`) goes on to that class page: `{ newClass: true }` (the panel's "+ Clasă nouă") opens that dialog on arrival, `{ archived: true }` (the panel's "Arhivate (n)") opens "Schimbă clasa" at "Arhivate". The old "page with all classes" (`ClassesPage`) and `ClassStudentsPage` no longer exist.
- The CES variant: `CesTag.tsx` is the mark next to a CES student's name in every teacher table that lists students (the class page's two tabs, the papers table, the links table, the class report, the review queue, the search, the student page's heading); Fișa testului lists the CES files; "De făcut" (`shell/todo.ts`) also asks to check a generated CES barem, or to generate it again (`TestSummary.cesBarem`), after the class barem's case and until the test is done; `testPage/CesVariant.tsx` holds "Varianta CES" in Pregătire (shown while the class has a CES student or the variant has a file: the CES students and the switch "Test separat pentru elevii cu CES" (`CesSwitch.tsx`, also on Test nou; off asks first when there are CES files, then removes them through `setCesOff`), its own `TestFiles` with `variant="ces"` while the switch is on, the total warning, and "Șterge varianta CES" only once the class has no CES student left) and the notice of the CES papers that wait for their barem in Corectare (`CesWaiting`); `testPage/variant.ts` picks a variant's parts of a test. What a draft or open test misses (`missing.ts`) is said in the stages, in "De făcut", as orange "lipsește" (and green "gata") marks in `TestFiles`, and as `MissingList.tsx` under "Începe testul" (with why each part matters) and under "Creează testul". `TestFiles`, `useGeneratedBarem`, `PrintTest` and `ExerciseListBanner` take `variant`. The class report, its CSV and the class PDF draw the tables of `reportTables` (`shared/stats.ts`): one, or the class papers then the CES papers with their own exercises; the CSV never names CES.
```

Replace it with:

```markdown
- `stages.ts`: the six stages of a test (Pregătire, Tipărire, În clasă, Corectare, Verificare, Rezultate), each done, waiting on the teacher, in progress or later, and the current one, from the tests list (`TestSummary.prepared`, `barem`, the counts and `averageGrade`). A stage waits on the teacher (orange) exactly when `todoOf()` has the test, at that stage. An archived test's closed results are its normal end: Rezultate is done, "închise · test arhivat". The test page uses it too: it opens on the current stage (from data read for this visit, not data cached from an earlier one), and `stageHash()` and `stageFromHash()` give each stage's panel its address (`#pregatire` … `#rezultate`). After the first load only the teacher changes the panel: a refresh or a button that moves the test to another stage keeps it. The Teste page's "Pornește corectarea" opens `#corectare`.
- `classPage/GradesTable.tsx` is the class page's grade table, in a card (students by tests, the oldest test on the left, a 156px column per test headed by its name and "date · state", orange when the test waits; a cell shows the grade, orange with a dot when points wait, the upload's state, or "—" when no paper was sent; the last row is "Media testului", no per-student average; draft and open tests keep a column; archived tests show only when asked). `classPage/ClassTests.tsx` is "Testele clasei", beside the table (under it below 1180px): the newest test first, each with its date, the papers sent, its stage (orange when it waits) and its one next step (from `testsPage/nextStep.ts`, the button that publishes the results included; filled blue when it waits), and the toggle "Arată și testele arhivate (n)" that reveals the archived tests in the table too. `classPage/ClassStudents.tsx` is the "Elevi" tab, one card split in two (stacked below 760px): the students on the left (search that ignores case and diacritics, orange dot when points wait, "+ Adaugă elevi"), the chosen student on the right (the first one at first; "Redenumește", "A plecat din clasă", "Șterge"; a table of the class's tests with the date, the points, the grade and "N puncte de verificat", the result ("Publicat", "Nepublicat" with "Copiază linkul", "După verificare", "Nu a trimis lucrarea."), and "Lucrarea"; link "Toate notele elevului, din toate clasele"). An archived class is the same page, read only (`readOnly` on `GradesTable`, `ClassTests` and `ClassStudents`): a strip "Clasă arhivată." with "Scoate din arhivă" above the head (one write with ⋯'s item), the tag "Arhivată" first in the facts, no "Test nou pentru această clasă", no "+ Adaugă elevi", no "Redenumește", "A plecat din clasă" or "Șterge" for a student, nothing orange, and "Raportul clasei" as each test's one step once a paper is graded; the one exception is an archived test with open results, which waits there as in "De făcut" (orange, "Oprește accesul", and the class's dot in "Schimbă clasa"). `classPage/ClassDialogs.tsx` holds the class page's dialogs: "Clasă nouă" (the name and the students, one per line, in one step; a class made before its students failed is not made twice), "Adaugă elevi" (early warnings for names already in the class or pasted twice), and the rename of a class or a student. They use `Modal.tsx`, the app's dialog: a title, ×, a dimmed backdrop, the focus on the first field and kept inside, Esc (in the capture phase, before a panel), and the focus back to the opener (or to `returnFocus` when the opener closed with its menu). `pages/ClassPage.tsx` is the class page (`/clase/:id`): the top line (the name, "Schimbă clasa" with the classes of the year, the current one marked, a dot for one that waits, the archived classes last in their muted group "Arhivate" (the only list that leads to them; an archived class's ⋯ has "Scoate din arhivă"), and "+ Clasă nouă"; the facts; "Test nou pentru această clasă"; ⋯ with "Redenumește clasa"/"Arhivează clasa", which asks first through `ArchiveDialog` when a test of the class has open results) and the two tabs ("Elevi" with its count). `pages/LastClassPage.tsx` is `/clase`: it opens the last class the teacher saw (kept in `localStorage` as `quickeval:lastClass`, else the first active one of the year), or, with no active class, offers "+ Clasă nouă" and links the archived classes. A link's state (`ClassLinkState`) goes on to that class page: `{ newClass: true }` (the panel's "+ Clasă nouă") opens that dialog on arrival, `{ archived: true }` (the panel's "Arhivate (n)") opens "Schimbă clasa" at "Arhivate". The old "page with all classes" (`ClassesPage`) and `ClassStudentsPage` no longer exist.
- The CES variant: `CesTag.tsx` is the mark next to a CES student's name in every teacher table that lists students (the class page's two tabs, the papers table, the links table, the class report, the review queue, the search, the student page's heading); Fișa testului lists the CES files; "De făcut" (`shell/todo.ts`) also asks to check a generated CES barem, or to generate it again (`TestSummary.cesBarem`), after the class barem's case and until the test is done; `testPage/CesVariant.tsx` holds "Varianta CES" in Pregătire (shown while the class has a CES student or the variant has a file: the CES students and the switch "Test separat pentru elevii cu CES" (`CesSwitch.tsx`, also on Test nou; off asks first when there are CES files, then removes them through `setCesOff`), its own `TestFiles` with `variant="ces"` while the switch is on, the total warning, and "Șterge varianta CES" only once the class has no CES student left) and the notice of the CES papers that wait for their barem in Corectare (`CesWaiting`); `testPage/variant.ts` picks a variant's parts of a test. What a draft or open test misses (`missing.ts`) is said in the stages, in "De făcut", as orange "lipsește" (and green "gata") marks in `TestFiles`, and as `MissingList.tsx` under "Începe testul" (with why each part matters) and under "Creează testul". `TestFiles`, `useGeneratedBarem`, `PrintTest` and `ExerciseListBanner` take `variant`. The class report, its CSV and the class PDF draw the tables of `reportTables` (`shared/stats.ts`): one, or the class papers then the CES papers with their own exercises; the CSV never names CES.
```

- [ ] **Step 26: Run the type check and the whole suite**

Run: `npm run typecheck`
Expected: no output after the `tsc` line.

Run: `npm test`
Expected: `Test Files  162 passed | 1 skipped (163)`, `Tests  2374 passed | 3 skipped (2377)`.

- [ ] **Step 27: Commit and compare with the prototype**

```bash
git add src/admin/ArchiveDialog.tsx src/ui/brand.css src/admin/testPage/TestSheet.tsx src/admin/pages/ClassPage.tsx src/test/fakeApi.ts src/AGENTS.md src/admin/pages/TestPage.test.tsx src/admin/pages/ClassPage.test.tsx
git commit -m "Ask before an archive that closes open results"
git diff --stat refs/protoarc/a3 HEAD -- . ':!docs/superpowers'
```

Expected: the diff prints nothing.

### Task 4: Check in the browser, push (main session)

- [ ] **Step 1: Run the whole suite in UTC**

Run (Git Bash): `TZ=UTC npm test`
Expected: `Test Files  162 passed | 1 skipped (163)`, `Tests  2374 passed | 3 skipped (2377)`.

- [ ] **Step 2: Look at the change in the browser**

Start the `api` and `web` preview servers (`.claude/launch.json`) after `npm run db:local`. With a finished test whose results are published: "Arhivează testul" asks "Arhivezi testul?"; "Arhivează" archives it and the stage Rezultate is blue with "închise · test arhivat". Publish again from Rezultate: the bar's "De făcut" count goes up by one, the item reads "Rezultate publicate pe un test arhivat", and Rezultate is orange. Archive the class from ⋯ with a published test: "Arhivezi clasa?" shows. At 375 px wide the dialog's two buttons fit, with no sideways scroll.

- [ ] **Step 3: Push and open the pull request (ask the user first)**

```bash
git push -u origin feature/archived-results-closed
gh pr create --base main --title "Archived tests close their results" --body "Archiving a test or a class closes the students' result pages, asking first when some are open. An archived test with open results shows in De făcut until they close or the test leaves the archive. Spec: docs/superpowers/specs/2026-11-10-archived-results-design.md. No migration."
```

Expected: the pull request's address.

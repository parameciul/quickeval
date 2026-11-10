# MQGrader: Quick Try, design review (the landing button, the form, the card, the try's page) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **The last task (Check in the browser, push) must run in the main session, not in a subagent:** the push needs the user.

**Goal:** Make Quick Try look like the rest of MQGrader and say more: the button under "Intră în cont", a name and styled file rows in the form, a card of her try on the landing page (name, when, state, grade), and a try's page with one head in every view (name she can change, times, the test and barem to download), the grade and the points to check above tabs that stay at the top, and one page width in every view. Also: one try that cannot be deleted no longer blocks the cleanup of the others.

**Architecture:** The server takes an optional `title` in `POST /api/try` and lets the try's link rename its test (`PATCH /tests/<code>` joins the allow-list). The landing page stays without React: the file inputs stay real but out of sight inside styled labels, and the status line becomes a card filled by `ui.ts` from `statusOf` (now with a tag and a tone) and `scoreOf` (in `src/try/phase.ts`, shared with the try's page). The try's page gets `TryHead.tsx` for every state; `Graded.tsx` gets the grade and the points to check above its own tabs (`try-tabs`, sticky), and a list of the points, each opening the app's review at it. The teacher's result and the student's result are not changed. The cleanup picks expired tries in random order and deletes each one in its own batch.

**Tech Stack:** Node 24, TypeScript, Vite, React, Hono on Cloudflare Pages with D1 and R2, Vitest 5 with Testing Library. No new npm dependencies. No migration.

**Spec:** `docs/superpowers/specs/2026-11-09-quick-try-design.md` (§3.1 the landing page, §3.2 the form, §3.3 the try's page, §5 deleting old tries). Task 1 and Task 6 write this plan's decisions into it. Parts A, B and C are `docs/superpowers/plans/2026-11-09-quick-try-a-server.md`, `2026-11-10-quick-try-b-page.md` and `2026-11-10-quick-try-c-landing.md`. The mockup the owner approved on 2026-11-10 is described in "Rulings made while planning". Root `AGENTS.md`, `src/AGENTS.md` and `server/AGENTS.md` hold the project rules.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`. No migration.
- One strict `tsconfig.json`. Relative imports name the `.ts` or `.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English. The API reports errors as `{ error, message }`; the UI shows `message`.
- The landing page has no React and no inline script or style (`src/landing/landing.test.ts` checks it). Inline SVG markup is allowed.
- Do not change the look of "Rezultatul profesorului" (`GradedResult`, `PageFiles`) or "Rezultatul elevului" (`StudentResult`), nor any CSS of the teacher app (`src/ui/brand.css`): the try's page styles live in `src/try/try.css`, under `try-` class names. The owner reviews those two views in a separate task.
- Orange is only for what is the teacher's to do; green for done; blue for the robot's work and for data (redesign spec §2).
- A try's name is a test title: `cleanTitle`, at most `MAX_TITLE_LENGTH` (120) characters.
- Do not run Prettier or any formatter.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A`.
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root, on the branch `feature/quick-try-design`. Run `npm test` alone, in the foreground: server and runner tests may fail with `fetch failed`, a 500 `internal` answer or a 20 s timeout when the machine is busy. If only such tests fail, run their files alone with `npx vitest run <files>`; the full run then counts as passed when they pass alone and its failed and passed tests add up to the expected passed number.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/protoqtd/d1` … `refs/protoqtd/d6`, one per task, on `refs/protoqtd/dbase` (`main` at `b843a69`). After Task N, `git diff --stat refs/protoqtd/dN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`).

## Rulings made while planning

Settled with the owner on 2026-11-10 (the design review and its mockup), and while building the prototype.

1. **The cleanup picks expired tries in random order and deletes each in its own batch.** A D1 batch is one transaction: before, one try whose rows could not be deleted (a row the cleanup does not know) failed the whole batch, and, being the oldest, came first on every visit. Now it fails alone and takes a slot only sometimes. No migration (a "failed at" column would need one). `expires_at` is never moved: that would open the expired try again.
2. **The button sits under "Intră în cont" (owner),** as wide as it, with one line under it: "Gratuit: trimiți lucrarea unui elev și o primești corectată în câteva minute." The line hides with the button. "Cere un cont de profesor" stays beside "Intră în cont".
3. **A try has a name (owner): an optional field in the form, else the test file's name.** "Numele testului (opțional)"; empty gives the test file's name without its extension (`tryTitle`); neither gives the default "Încercare rapidă" on the server. The name is the test's `title`, so every teacher-app view that shows a title shows it. The try's page renames it (pencil button), through the teacher route `PATCH /tests/<code>`, now on the allow-list.
4. **The file rows are the app's look (owner),** not the browser's button: what to choose and its types, then the chosen file's name and size (the pages: their count and names) with a green tick and "Schimbă". The real `<input type="file">` stays in each label, out of sight but focusable, so the form's reading of `files` and the tests' `getByLabelText` work as before. After a send, the rows go back to empty.
5. **The landing card replaces the status line (owner).** It shows "Încercarea ta", the name, "Trimisă <time> · Linkul merge până pe <day>" (from the stored `madeAt` and `QUICK_TRY_DAYS`), a tag (blue: the robot works; orange: hers to do, also "N puncte de verificat" on a graded paper with points to check; green: "Corectată"; grey: "Nu a reușit"), the line, the grade once graded, and "Deschide încercarea" (a filled button once the robot does not work).
6. **The try's page has one head in every state (owner):** "Încercare rapidă" above the name (not when the name is the default one), the name with its pencil, "Trimisă la corectare <time>" (or "Începută <time>" before the paper was sent) and "Linkul merge până pe <day>", the test and the barem to download (not while she prepares the try: that part has them), and "Distribuie".
7. **A graded try shows its grade and the points to check above the views (owner):** the grade box ("Nota", the grade, "67 din 100 de puncte") and an orange box "N puncte nesigure" with "Verifică N puncte", or a green box "Toate punctele sunt verificate."
8. **The Verificare view lists the points to check,** each with its points and the robot's reason and a "Verifică" link that opens the app's review at that point (`reviewPath(code, { submissionId, key: pointKey(point) })`). Unreadable pages are one row, "Pagini greu de citit". The tab counts the points left.
9. **The tabs are the try page's own (`try-tabs`), not the class page's,** underlined, sticky at the top while she scrolls; on a phone they show "Profesor" and "Elev" (the full name stays for screen readers). The page keeps one width in every view and the scrollbar's room always (`scrollbar-gutter: stable` on the try page): the views no longer move sideways. Measured in the prototype: the head and the view are at the same x and width in all three views.
10. **The grade's text helper is `scoreOf` in `src/try/phase.ts`,** used by both the landing card and the try's page.
11. **White text on orange becomes the theme's own button text (`--on-ink`)**: in dark mode white on light orange was hard to read.

## Review Focus

1. A test file name that is only an extension (".pdf"), very long, or with extra spaces: the name is empty (the server's default) or cut to 120 characters (Task 3, "the try's name").
2. A name the server refuses on rename (empty after trimming): the message shows and the form stays open with her text (Task 5, "shows the server's refusal of a name").
3. A try whose paper is graded with no point to check: the card is green "Corectată", the try's page says "Toate punctele sunt verificate." and the Verificare tab has no count (Task 4, Task 5).
4. A phone (375 px): the tabs fit with their short names, "Distribuie" goes on the left under the name, nothing scrolls sideways (Task 7, browser check).
5. Several tries that can never be deleted: a try behind them is still deleted after some visits, and those tries keep only their own rows (Task 1, "reaches the tries behind tries that cannot be deleted").

---

### Before Task 1: The branch

- [ ] **Step 1: Make the branch and check the prototype**

Run: `git switch -c feature/quick-try-design main` and `git log --oneline -1`
Expected: HEAD `b843a69 Merge pull request #61 from parameciul/feature/quick-try-landing` (or a later `main`; then the prototype comparisons below may also show the files `main` changed since).

Run: `git rev-parse --verify refs/protoqtd/d6`
Expected: a commit id. If the ref does not exist, stop and ask: the prototype's refs come with this plan.

- [ ] **Step 2: Bring this plan onto the branch**

Copy this plan to `docs/superpowers/plans/2026-11-10-quick-try-design.md` if it is not there, then:
`git commit -m "Add the plan for the Quick Try design review" -- docs/superpowers/plans/2026-11-10-quick-try-design.md`
Expected: one commit with the one file.

### Task 1: One try that cannot be deleted no longer blocks the cleanup

**Files:**
- Modify: `server/routes/quickTryCleanup.test.ts`, `server/db/quickTry.ts`, `server/quickTryCleanup.ts`, `docs/superpowers/specs/2026-11-09-quick-try-design.md`, `AGENTS.md`
- Test: `server/routes/quickTryCleanup.test.ts`

**Interfaces:**
- Consumes: `expiredTries(db, now, limit)` and `deleteTries(db, teacherIds)` in `server/db/quickTry.ts` (part C).
- Produces: `cleanUpTries(env, now): Promise<number>` answers the number of tries deleted; it calls `deleteTries` once per try.

- [ ] **Step 1: Edit `server/routes/quickTryCleanup.test.ts`**

Find this block:

```ts

  it(`deletes at most ${QUICK_TRY_CLEANUP_BATCH} tries per visit, the oldest first`, async () => {
    const tries = [];
```

Replace it with:

```ts

  it(`deletes at most ${QUICK_TRY_CLEANUP_BATCH} tries per visit`, async () => {
    const tries = [];
```

- [ ] **Step 2: Edit `server/routes/quickTryCleanup.test.ts`**

Find this block:

```ts
    const left = await Promise.all(tries.map(async (one) => (await rowsOf(one.teacherId)) > 0));
    expect(left).toEqual([...Array<boolean>(QUICK_TRY_CLEANUP_BATCH).fill(false), true]);
    await visit();
    expect(await rowsOf(tries[QUICK_TRY_CLEANUP_BATCH]!.teacherId)).toBe(0);
  });
```

Replace it with:

```ts
    const left = await Promise.all(tries.map(async (one) => (await rowsOf(one.teacherId)) > 0));
    expect(left.filter(Boolean)).toHaveLength(1);
    await visit();
    for (const one of tries) expect(await rowsOf(one.teacherId)).toBe(0);
  });
```

- [ ] **Step 3: Edit `server/routes/quickTryCleanup.test.ts`**

Find this block:

```ts
    expect(await rowsOf(api.teacherId)).toBe(before);
  });
```

Replace it with:

```ts
    expect(await rowsOf(api.teacherId)).toBe(before);
  });

  // A row the cleanup does not know (here a payment of the guest teacher)
  // makes that one try's delete fail every time.
  const stick = (teacherId: number) =>
    api.db
      .prepare("INSERT INTO payments (teacher_id, feature, amount, currency, created_at) VALUES (?, 'x', 1, 'ron', '2020-01-01T00:00:00.000Z')")
      .bind(teacherId)
      .run();

  it('deletes the other tries of a visit when one try cannot be deleted', async () => {
    const tries = [];
    for (let i = 0; i < QUICK_TRY_CLEANUP_BATCH; i++) tries.push(await fullTry(`198.51.100.${i}`));
    for (const [i, one] of tries.entries()) await expire(one.teacherId, `2020-01-0${i + 1}T00:00:00.000Z`);
    await stick(tries[0]!.teacherId);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await visit()).status).toBe(200);
    const left = await Promise.all(tries.map(async (one) => (await rowsOf(one.teacherId)) > 0));
    expect(left).toEqual([true, ...Array<boolean>(QUICK_TRY_CLEANUP_BATCH - 1).fill(false)]);
    expect(warn).toHaveBeenCalled();
  });

  it('reaches the tries behind tries that cannot be deleted', async () => {
    const stuck = [];
    for (let i = 0; i < QUICK_TRY_CLEANUP_BATCH; i++) stuck.push(await fullTry(`198.51.100.${i}`));
    for (const [i, one] of stuck.entries()) {
      await expire(one.teacherId, `2020-01-0${i + 1}T00:00:00.000Z`);
      await stick(one.teacherId);
    }
    const last = await fullTry('198.51.100.9');
    await expire(last.teacherId, '2020-02-01T00:00:00.000Z');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < 30 && (await rowsOf(last.teacherId)) > 0; i++) await visit();
    expect(await rowsOf(last.teacherId)).toBe(0);
    for (const one of stuck) expect(await rowsOf(one.teacherId)).toBeGreaterThan(0);
  });
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx vitest run server/routes/quickTryCleanup.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  2 failed | 7 passed (9)`: "deletes the other tries of a visit when one try cannot be deleted" (`expected [ true, true, true ] to deeply equal [ true, false, false ]`: the one batch fails for all three) and "reaches the tries behind tries that cannot be deleted" (`expected 6 to be +0`: the stuck tries come first on every visit). The 7 tests that pass are the file's older tests.

- [ ] **Step 5: Edit `server/db/quickTry.ts`**

Find this block:

```ts

// The guest teachers of the tries whose days are over, the oldest first.
const EXPIRED = `SELECT q.teacher_id FROM quick_tries q JOIN teachers g ON g.id = q.teacher_id AND g.quick_try = 1
  WHERE q.expires_at <= ? ORDER BY q.expires_at, q.id LIMIT ?`;

```

Replace it with:

```ts

// The guest teachers of the tries whose days are over, in random order: a try
// that cannot be deleted then never keeps the others waiting behind it.
const EXPIRED = `SELECT q.teacher_id FROM quick_tries q JOIN teachers g ON g.id = q.teacher_id AND g.quick_try = 1
  WHERE q.expires_at <= ? ORDER BY random() LIMIT ?`;

```

- [ ] **Step 6: Edit `server/quickTryCleanup.ts`**

Find this block:

```ts
// then their rows. When R2 fails, the rows stay and the next call finds the
// files again. Answers how many tries it deleted.
export async function cleanUpTries(env: Env, now: string): Promise<number> {
```

Replace it with:

```ts
// then their rows. When R2 fails, the rows stay and the next call finds the
// files again. Each try's rows go in their own batch, so a try that cannot be
// deleted keeps only its own rows. Answers how many tries it deleted.
export async function cleanUpTries(env: Env, now: string): Promise<number> {
```

- [ ] **Step 7: Edit `server/quickTryCleanup.ts`**

Find this block:

```ts
  if (keys.length > 0) await env.FILES.delete(keys);
  await deleteTries(env.DB, teacherIds);
  return teacherIds.length;
}
```

Replace it with:

```ts
  if (keys.length > 0) await env.FILES.delete(keys);
  const done = await Promise.allSettled(teacherIds.map((id) => deleteTries(env.DB, [id])));
  for (const one of done) {
    if (one.status === 'rejected') console.warn('A Quick Try could not be deleted.', one.reason);
  }
  return done.filter((one) => one.status === 'fulfilled').length;
}
```

- [ ] **Step 8: Edit `docs/superpowers/specs/2026-11-09-quick-try-design.md`**

Find this block:

```markdown
- A try is deleted once its 7 days are over: its rows and its R2 files (test, barem, photos, generated files) **(owner, 2026-11-10; this replaces the monthly cleanup, option B)**.
- The trigger: Pages runs no timer and the GitHub schedule does not fire reliably, so each visit of the landing page (`GET /api/try/availability`) deletes, after its answer, up to `QUICK_TRY_CLEANUP_BATCH` (3) tries whose days are over, the oldest first: their R2 files, then their rows. When R2 fails, the rows stay and a later visit tries again **(builder call, made while planning part C)**.
- R2 keys come from rows, never from listing R2 (project rule).
```

Replace it with:

```markdown
- A try is deleted once its 7 days are over: its rows and its R2 files (test, barem, photos, generated files) **(owner, 2026-11-10; this replaces the monthly cleanup, option B)**.
- The trigger: Pages runs no timer and the GitHub schedule does not fire reliably, so each visit of the landing page (`GET /api/try/availability`) deletes, after its answer, up to `QUICK_TRY_CLEANUP_BATCH` (3) tries whose days are over, picked in random order: their R2 files, then the rows of each try in its own batch, so a try that cannot be deleted never blocks the others. When R2 fails, the rows stay and a later visit tries again **(builder call, made while planning part C)**.
- R2 keys come from rows, never from listing R2 (project rule).
```

- [ ] **Step 9: Edit `AGENTS.md`**

Find this block:

```markdown
- Every `/api/admin` and `/api/u` request first runs the `promoteDue` middleware. A router added under them keeps it.
- Quick Try (`docs/superpowers/specs/2026-11-09-quick-try-design.md`, migration 0026): one free grading without an account, at `/api/try`. Each try is a hidden guest teacher (`teachers.quick_try`, disabled, never an account) with its own class, student, test (`tests.quick_try`) and paper; its link `/api/try/<token>` serves the teacher API's own routes for that guest teacher behind an allow-list (`ALLOWED` in `server/routes/quickTry.ts`). A Quick Try test never gets a print job or a class analysis. The limits (`QUICK_TRY_IP_LIMIT` per IP and `QUICK_TRY_DAILY_LIMIT` in total per Bucharest day, `shared/quickTry.ts`) are checked in the SQL of the try's first INSERT (`createQuickTry`); a failed try gives its IP place back, not its daily place. An administrator skips Turnstile and the limits and is not counted. One try makes bounded robot work, checked in the writes' SQL: one barem generation, only with no barem (`requestBarem`), and at most `QUICK_TRY_FILE_CHANGES` changes of its test and barem files (`saveTestFile`). The try's page is `/try/<token>` (`src/try/`), private like a student link: `_headers` gives it noindex and `robots.txt` closes `/try/` in every group. A try is deleted once its 7 days are over: each visit of the landing page (`GET /api/try/availability`) deletes, after its answer, up to `QUICK_TRY_CLEANUP_BATCH` such tries, their R2 files first, then their rows (`cleanUpTries`, `server/quickTryCleanup.ts`).
- R2 is private: every file goes through the API with an ownership check. R2 keys come from rows, never from listing R2.
```

Replace it with:

```markdown
- Every `/api/admin` and `/api/u` request first runs the `promoteDue` middleware. A router added under them keeps it.
- Quick Try (`docs/superpowers/specs/2026-11-09-quick-try-design.md`, migration 0026): one free grading without an account, at `/api/try`. Each try is a hidden guest teacher (`teachers.quick_try`, disabled, never an account) with its own class, student, test (`tests.quick_try`) and paper; its link `/api/try/<token>` serves the teacher API's own routes for that guest teacher behind an allow-list (`ALLOWED` in `server/routes/quickTry.ts`). A Quick Try test never gets a print job or a class analysis. The limits (`QUICK_TRY_IP_LIMIT` per IP and `QUICK_TRY_DAILY_LIMIT` in total per Bucharest day, `shared/quickTry.ts`) are checked in the SQL of the try's first INSERT (`createQuickTry`); a failed try gives its IP place back, not its daily place. An administrator skips Turnstile and the limits and is not counted. One try makes bounded robot work, checked in the writes' SQL: one barem generation, only with no barem (`requestBarem`), and at most `QUICK_TRY_FILE_CHANGES` changes of its test and barem files (`saveTestFile`). The try's page is `/try/<token>` (`src/try/`), private like a student link: `_headers` gives it noindex and `robots.txt` closes `/try/` in every group. A try is deleted once its 7 days are over: each visit of the landing page (`GET /api/try/availability`) deletes, after its answer, up to `QUICK_TRY_CLEANUP_BATCH` such tries picked in random order, their R2 files first, then the rows of each try in its own batch (`cleanUpTries`, `server/quickTryCleanup.ts`).
- R2 is private: every file goes through the API with an ownership check. R2 keys come from rows, never from listing R2.
```

- [ ] **Step 10: Run the tests to see them pass**

Run: `npx vitest run server/routes/quickTryCleanup.test.ts`
Expected: PASS, `Tests  9 passed (9)`.

- [ ] **Step 11: Typecheck and run all tests**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  162 passed | 1 skipped (163)`, `Tests  2353 passed | 3 skipped (2356)`.

- [ ] **Step 12: Commit**

```bash
git add server/routes/quickTryCleanup.test.ts server/db/quickTry.ts server/quickTryCleanup.ts docs/superpowers/specs/2026-11-09-quick-try-design.md AGENTS.md
git commit -m "Delete each expired Quick Try on its own, in random order, so one that cannot be deleted blocks no other"
```

Check: `git diff --stat refs/protoqtd/d1 HEAD -- . ':!docs/superpowers/plans'` prints nothing.

### Task 2: The try's name, and its rename from the try's link

**Files:**
- Modify: `server/routes/quickTry.test.ts`, `server/routes/quickTryLink.test.ts`, `shared/api.ts`, `server/db/quickTry.ts`, `server/routes/quickTry.ts`
- Test: `server/routes/quickTry.test.ts`, `server/routes/quickTryLink.test.ts`

**Interfaces:**
- Consumes: `cleanTitle` and `MAX_TITLE_LENGTH` (`shared/tests.ts`); the teacher route `PATCH /api/admin/tests/:code` (`renameTest`, body `{ title }`).
- Produces: `quickTryCreateBody.title?: string` (cleaned, at most 120 characters, may be empty); `NewQuickTry.title?: string` (empty or missing: `QUICK_TRY_TITLE`); `['PATCH', /^\/tests\/[^/]+$/]` in `ALLOWED`.

- [ ] **Step 1: Edit `server/routes/quickTry.test.ts`**

Find this block:

```ts
    expect(row).toEqual({ ip_hash: await sha256Hex('203.0.113.5'), by_admin: 0 });
  });
```

Replace it with:

```ts
    expect(row).toEqual({ ip_hash: await sha256Hex('203.0.113.5'), by_admin: 0 });
  });

  it("names the try's test with the name it gets, or with the default name", async () => {
    await visitorApi();
    const title = async (token: string) =>
      (
        await api.db
          .prepare('SELECT t.title FROM tests t JOIN quick_tries q ON q.teacher_id = t.teacher_id WHERE q.token_hash = ?')
          .bind(await sha256Hex(token))
          .first<{ title: string }>()
      )!.title;
    const named = await create({ turnstileToken: 'ok', title: '  Test   funcții 9B ' });
    expect(named.status).toBe(201);
    expect(await title(named.body.token)).toBe('Test funcții 9B');
    expect(await title((await create({ turnstileToken: 'ok', title: '   ' }, '203.0.113.6')).body.token)).toBe('Încercare rapidă');
    expect(await title((await create({ turnstileToken: 'ok' }, '203.0.113.7')).body.token)).toBe('Încercare rapidă');
    const long = await create({ turnstileToken: 'ok', title: 'x'.repeat(500) }, '203.0.113.8');
    expect(long.status).toBe(400);
  });
```

- [ ] **Step 2: Edit `server/routes/quickTryLink.test.ts`**

Find this block:

```ts

  it("never reaches a real teacher's test", async () => {
```

Replace it with:

```ts

  it("renames the try's test", async () => {
    const res = await api.request('PATCH', `/api/try/${token}/tests/${code}`, { title: 'Test funcții 9B' });
    expect(res.status).toBe(200);
    expect((await api.request('GET', `/api/try/${token}/tests/${code}`)).body.test.title).toBe('Test funcții 9B');
  });

  it("never reaches a real teacher's test", async () => {
```

- [ ] **Step 3: Edit `server/routes/quickTryLink.test.ts`**

Find this block:

```ts
      ['DELETE', `/tests/${code}`],
      ['PATCH', `/tests/${code}`],
      ['POST', `/tests/${code}/evaluate`],
```

Replace it with:

```ts
      ['DELETE', `/tests/${code}`],
      ['POST', `/tests/${code}/evaluate`],
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx vitest run server/routes/quickTry.test.ts server/routes/quickTryLink.test.ts`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  2 failed | 23 passed (25)`: "names the try's test with the name it gets, or with the default name" (`expected 'Încercare rapidă' to be 'Test funcții 9B'`) and "renames the try's test" (`expected 404 to be 200`: the route is not on the allow-list). The 23 tests that pass are the two files' older tests.

- [ ] **Step 5: Edit `shared/api.ts`**

Find this block:

```ts
// form's Turnstile answer. An administrator may send none.
export const quickTryCreateBody = z.object({ turnstileToken: z.string().max(4096).optional() });

```

Replace it with:

```ts
// form's Turnstile answer. An administrator may send none.
// The try's name is optional: an empty one gives the default name.
export const quickTryCreateBody = z.object({
  turnstileToken: z.string().max(4096).optional(),
  title: z
    .string()
    .transform(cleanTitle)
    .pipe(z.string().max(MAX_TITLE_LENGTH, { message: `Numele are cel mult ${MAX_TITLE_LENGTH} de caractere.` }))
    .optional(),
});

```

- [ ] **Step 6: Edit `server/db/quickTry.ts`**

Find this block:

```ts
  resultToken: string;
  now: string;
```

Replace it with:

```ts
  resultToken: string;
  // The test's name; empty for the default name.
  title?: string;
  now: string;
```

- [ ] **Step 7: Edit `server/db/quickTry.ts`**

Find this block:

```ts
      )
      .bind(code, QUICK_TRY_TITLE, input.now, input.now, input.now, input.email),
    db
```

Replace it with:

```ts
      )
      .bind(code, input.title || QUICK_TRY_TITLE, input.now, input.now, input.now, input.email),
    db
```

- [ ] **Step 8: Edit `server/routes/quickTry.ts`**

Find this block:

```ts
  ['GET', /^\/tests\/[^/]+$/],
  ['GET', /^\/tests\/[^/]+\/files\/(test|barem)$/],
```

Replace it with:

```ts
  ['GET', /^\/tests\/[^/]+$/],
  ['PATCH', /^\/tests\/[^/]+$/],
  ['GET', /^\/tests\/[^/]+\/files\/(test|barem)$/],
```

- [ ] **Step 9: Edit `server/routes/quickTry.ts`**

Find this block:

```ts
      resultToken: newResultToken(),
      now: nowIso(),
```

Replace it with:

```ts
      resultToken: newResultToken(),
      title: body.title,
      now: nowIso(),
```

- [ ] **Step 10: Run the tests to see them pass**

Run: `npx vitest run server/routes/quickTry.test.ts server/routes/quickTryLink.test.ts`
Expected: PASS, `Tests  25 passed (25)`.

- [ ] **Step 11: Typecheck and run all tests**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  162 passed | 1 skipped (163)`, `Tests  2355 passed | 3 skipped (2358)`.

- [ ] **Step 12: Commit**

```bash
git add server/routes/quickTry.test.ts server/routes/quickTryLink.test.ts shared/api.ts server/db/quickTry.ts server/routes/quickTry.ts
git commit -m "Name a Quick Try when it is made, and let its link rename it"
```

Check: `git diff --stat refs/protoqtd/d2 HEAD -- . ':!docs/superpowers/plans'` prints nothing.

### Task 3: The form: the try's name and file rows in the app's look

**Files:**
- Modify: `src/landing/quickTry/send.test.ts`, `src/landing/quickTry/ui.test.ts`, `src/landing/quickTry/api.test.ts`, `src/landing/quickTry/send.ts`, `src/landing/quickTry/api.ts`, `src/landing/quickTry/ui.ts`, `index.html`, `src/landing/landing.css`
- Test: `src/landing/quickTry/send.test.ts`, `src/landing/quickTry/ui.test.ts`, `src/landing/quickTry/api.test.ts`

**Interfaces:**
- Consumes: Task 2's `title` in `POST /api/try`; `countLabel`, `formatFileSize` (`src/ui/format.ts`).
- Produces: `TryForm.title: string`; `tryTitle(form: TryForm): string` in `send.ts`; `LandingApi.create(turnstileToken: string | undefined, title: string)`; the file rows `label.try-pick[data-try-pick][data-empty][data-hint]` with `[data-try-pick-name]`, `[data-try-pick-hint]`, `[data-try-pick-action]`; `--ok-bg`, `--ok-fg` and `.btn-small` in `landing.css`.

- [ ] **Step 1: Edit `src/landing/quickTry/send.test.ts`**

Find this block:

```ts
import type { LandingApi } from './api.ts';
import { formProblem, sendTry, type TryForm } from './send.ts';

```

Replace it with:

```ts
import type { LandingApi } from './api.ts';
import { formProblem, sendTry, tryTitle, type TryForm } from './send.ts';

```

- [ ] **Step 2: Edit `src/landing/quickTry/send.test.ts`**

Find this block:

```ts
    availability: vi.fn(async () => ({ dailyLimitReached: false, admin: false, siteKey: 'site' })),
    create: vi.fn(async (_turnstileToken?: string) => {
      calls.push('create');
```

Replace it with:

```ts
    availability: vi.fn(async () => ({ dailyLimitReached: false, admin: false, siteKey: 'site' })),
    create: vi.fn(async (_turnstileToken?: string, _title?: string) => {
      calls.push('create');
```

- [ ] **Step 3: Edit `src/landing/quickTry/send.test.ts`**

Find this block:

```ts

const full: TryForm = { test: pdf('test.pdf'), barem: pdf('barem.pdf'), robotBarem: false, pages: [photo('p1.jpg'), photo('p2.jpg')] };

```

Replace it with:

```ts

const full: TryForm = { title: '', test: pdf('test.pdf'), barem: pdf('barem.pdf'), robotBarem: false, pages: [photo('p1.jpg'), photo('p2.jpg')] };

```

- [ ] **Step 4: Edit `src/landing/quickTry/send.test.ts`**

Find this block:

```ts

describe('sending a try', () => {
```

Replace it with:

```ts

describe("the try's name", () => {
  it('is the name she writes, else the name of the test file', () => {
    expect(tryTitle({ ...full, title: '  Test   funcții 9B ' })).toBe('Test funcții 9B');
    expect(tryTitle(full)).toBe('test');
    expect(tryTitle({ ...full, test: pdf('Teză  semestrul I.final.docx') })).toBe('Teză semestrul I.final');
    expect(tryTitle({ ...full, test: pdf('.pdf') })).toBe('');
    expect(tryTitle({ ...full, test: null })).toBe('');
  });

  it('is cut to the length a test title may have', () => {
    expect(tryTitle({ ...full, title: 'x'.repeat(200) })).toHaveLength(120);
    expect(tryTitle({ ...full, test: pdf(`${'y'.repeat(200)}.pdf`) })).toHaveLength(120);
  });
});

describe('sending a try', () => {
```

- [ ] **Step 5: Edit `src/landing/quickTry/send.test.ts`**

Find this block:

```ts
    expect(calls).toEqual(['create', 'test:test.pdf', 'barem:barem.pdf', 'page:p1.jpg', 'page:p2.jpg', 'start']);
    expect(api.create).toHaveBeenCalledWith('raspuns');
    expect(stored).toEqual({ token: TOKEN, code: 'PROBA-26T1', madeAt: NOW.toISOString() });
```

Replace it with:

```ts
    expect(calls).toEqual(['create', 'test:test.pdf', 'barem:barem.pdf', 'page:p1.jpg', 'page:p2.jpg', 'start']);
    expect(api.create).toHaveBeenCalledWith('raspuns', 'test');
    expect(stored).toEqual({ token: TOKEN, code: 'PROBA-26T1', madeAt: NOW.toISOString() });
```

- [ ] **Step 6: Edit `src/landing/quickTry/send.test.ts`**

Find this block:

```ts
    expect(calls).toEqual(['create', 'test:test.pdf', 'generate', 'page:p1.jpg', 'page:p2.jpg']);
    expect(api.create).toHaveBeenCalledWith(undefined);
  });
```

Replace it with:

```ts
    expect(calls).toEqual(['create', 'test:test.pdf', 'generate', 'page:p1.jpg', 'page:p2.jpg']);
    expect(api.create).toHaveBeenCalledWith(undefined, 'test');
  });
```

- [ ] **Step 7: Edit `src/landing/quickTry/ui.test.ts`**

Find this block:

```ts
    availability: vi.fn(async () => ({ dailyLimitReached: false, admin: false, siteKey: 'site-key', ...availability })),
    create: vi.fn(async (_turnstileToken?: string) => ({ token: TOKEN, code: CODE })),
    uploadTestFile: vi.fn(async () => {}),
```

Replace it with:

```ts
    availability: vi.fn(async () => ({ dailyLimitReached: false, admin: false, siteKey: 'site-key', ...availability })),
    create: vi.fn(async (_turnstileToken?: string, _title?: string) => ({ token: TOKEN, code: CODE })),
    uploadTestFile: vi.fn(async () => {}),
```

- [ ] **Step 8: Edit `src/landing/quickTry/ui.test.ts`**

Find this block:

```ts
    await waitFor(() => expect(dialog().hasAttribute('open')).toBe(false));
    expect(api.create).toHaveBeenCalledWith('turnstile-ok');
    expect(api.start).toHaveBeenCalledWith(TOKEN);
```

Replace it with:

```ts
    await waitFor(() => expect(dialog().hasAttribute('open')).toBe(false));
    expect(api.create).toHaveBeenCalledWith('turnstile-ok', 'test');
    expect(api.start).toHaveBeenCalledWith(TOKEN);
```

- [ ] **Step 9: Edit `src/landing/quickTry/ui.test.ts`**

Find this block:

```ts
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Se corectează… Durează câteva minute.'));
    expect(button()).toBeNull();
  });

```

Replace it with:

```ts
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Se corectează… Durează câteva minute.'));
    expect(button()).toBeNull();
  });

  it('sends the name she writes for the try', async () => {
    const { api } = await mount();
    button()!.click();
    const name = within(dialog()).getByRole('textbox', { name: /Numele testului/ }) as HTMLInputElement;
    name.value = 'Test funcții 9B';
    fillForm();
    send();
    await waitFor(() => expect(api.create).toHaveBeenCalledWith('turnstile-ok', 'Test funcții 9B'));
  });

  it('shows each chosen file in its row, and empties the rows once the form is sent', async () => {
    await mount();
    button()!.click();
    const row = (label: RegExp) => within(dialog()).getByLabelText(label).closest('label')!;
    expect(row(/^Testul/)).toHaveTextContent('Alege testul');
    expect(row(/^Testul/)).not.toHaveClass('is-chosen');
    fillForm();
    expect(row(/^Testul/)).toHaveTextContent('test.pdf');
    expect(row(/^Testul/)).toHaveTextContent('Schimbă');
    expect(row(/^Testul/)).toHaveClass('is-chosen');
    expect(row(/^Lucrarea elevului/)).toHaveTextContent('2 pagini');
    expect(row(/^Lucrarea elevului/)).toHaveTextContent('p1.jpg, p2.jpg');
    send();
    await waitFor(() => expect(dialog().hasAttribute('open')).toBe(false));
    expect(row(/^Testul/)).toHaveTextContent('Alege testul');
    expect(row(/^Lucrarea elevului/)).not.toHaveClass('is-chosen');
  });

```

- [ ] **Step 10: Edit `src/landing/quickTry/ui.test.ts`**

Find this block:

```ts
    send();
    await waitFor(() => expect(api.create).toHaveBeenCalledWith(undefined));
    expect(turnstile.load).not.toHaveBeenCalled();
```

Replace it with:

```ts
    send();
    await waitFor(() => expect(api.create).toHaveBeenCalledWith(undefined, 'test'));
    expect(turnstile.load).not.toHaveBeenCalled();
```

- [ ] **Step 11: Edit `src/landing/quickTry/api.test.ts`**

Find this block:

```ts
describe("the landing page's client", () => {
  it('reads the availability and makes a try with the Turnstile answer', async () => {
    const fetchImpl = fakeFetch({ token: TOKEN, code: 'PROBA-26T1' });
```

Replace it with:

```ts
describe("the landing page's client", () => {
  it("reads the availability and makes a try with the Turnstile answer and the try's name", async () => {
    const fetchImpl = fakeFetch({ token: TOKEN, code: 'PROBA-26T1' });
```

- [ ] **Step 12: Edit `src/landing/quickTry/api.test.ts`**

Find this block:

```ts
    await api.availability();
    expect(await api.create('raspuns')).toEqual({ token: TOKEN, code: 'PROBA-26T1' });
    expect(fetchImpl.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
```

Replace it with:

```ts
    await api.availability();
    expect(await api.create('raspuns', 'Test 9B')).toEqual({ token: TOKEN, code: 'PROBA-26T1' });
    expect(fetchImpl.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
```

- [ ] **Step 13: Edit `src/landing/quickTry/api.test.ts`**

Find this block:

```ts
    ]);
    expect(JSON.parse(fetchImpl.mock.calls[1]![1]!.body as string)).toEqual({ turnstileToken: 'raspuns' });
  });
```

Replace it with:

```ts
    ]);
    expect(JSON.parse(fetchImpl.mock.calls[1]![1]!.body as string)).toEqual({ turnstileToken: 'raspuns', title: 'Test 9B' });
  });
```

- [ ] **Step 14: Edit `src/landing/quickTry/api.test.ts`**

Find this block:

```ts
    const api = createLandingApi(fakeFetch({ error: 'quick_try_daily_limit', message: 'Limita de încercări gratuite pentru azi a fost atinsă.' }, 429));
    await expect(api.create('x')).rejects.toEqual(new ApiError(429, 'quick_try_daily_limit', 'Limita de încercări gratuite pentru azi a fost atinsă.'));
  });
```

Replace it with:

```ts
    const api = createLandingApi(fakeFetch({ error: 'quick_try_daily_limit', message: 'Limita de încercări gratuite pentru azi a fost atinsă.' }, 429));
    await expect(api.create('x', '')).rejects.toEqual(new ApiError(429, 'quick_try_daily_limit', 'Limita de încercări gratuite pentru azi a fost atinsă.'));
  });
```

- [ ] **Step 15: Run the tests to see them fail**

Run: `npx vitest run src/landing/quickTry/send.test.ts src/landing/quickTry/ui.test.ts src/landing/quickTry/api.test.ts`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  9 failed | 27 passed (36)`: `tryTitle is not a function` (2 tests); `create` is called without the name (`expected "vi.fn()" to be called with arguments: [ 'raspuns', 'test' ]`, and the same for the robot's barem, the form and the administrator; the client sends `{ turnstileToken: 'raspuns' }` alone); no textbox "Numele testului"; the test's row has no "Alege testul" (`expect(element).toHaveTextContent()`). The 27 tests that pass are the three files' older tests.

- [ ] **Step 16: Edit `src/landing/quickTry/send.ts`**

Find this block:

```ts
} from '../../../shared/files.ts';
import type { LandingApi } from './api.ts';
```

Replace it with:

```ts
} from '../../../shared/files.ts';
import { cleanTitle, MAX_TITLE_LENGTH } from '../../../shared/tests.ts';
import type { LandingApi } from './api.ts';
```

- [ ] **Step 17: Edit `src/landing/quickTry/send.ts`**

Find this block:

```ts

// What the form holds (spec §3.2): the test, her barem or the robot's, and
// the student's pages.
export interface TryForm {
  test: File | null;
```

Replace it with:

```ts

// What the form holds (spec §3.2): the try's name, the test, her barem or
// the robot's, and the student's pages.
export interface TryForm {
  // The name she writes; may be empty.
  title: string;
  test: File | null;
```

- [ ] **Step 18: Edit `src/landing/quickTry/send.ts`**

Find this block:

```ts

export interface SendEvents {
```

Replace it with:

```ts

// The try's name: the one she writes, else the test file's name without its
// extension, cut to a test title's length. Empty when neither has one: the
// server then gives the default name.
export function tryTitle(form: TryForm): string {
  const own = cleanTitle(form.title);
  const name = own || cleanTitle((form.test?.name ?? '').replace(/\.[^.]*$/, ''));
  return name.slice(0, MAX_TITLE_LENGTH).trim();
}

export interface SendEvents {
```

- [ ] **Step 19: Edit `src/landing/quickTry/send.ts`**

Find this block:

```ts
  events.onProgress('Se pregătește încercarea…');
  const { token, code } = await api.create(turnstileToken);
  const stored: StoredTry = { token, code, madeAt: now().toISOString() };
```

Replace it with:

```ts
  events.onProgress('Se pregătește încercarea…');
  const { token, code } = await api.create(turnstileToken, tryTitle(form));
  const stored: StoredTry = { token, code, madeAt: now().toISOString() };
```

- [ ] **Step 20: Edit `src/landing/quickTry/api.ts`**

Find this block:

```ts
  availability(): Promise<QuickTryAvailability>;
  create(turnstileToken: string | undefined): Promise<QuickTryCreated>;
  uploadTestFile(token: string, code: string, kind: TestFileKind, file: File): Promise<void>;
```

Replace it with:

```ts
  availability(): Promise<QuickTryAvailability>;
  create(turnstileToken: string | undefined, title: string): Promise<QuickTryCreated>;
  uploadTestFile(token: string, code: string, kind: TestFileKind, file: File): Promise<void>;
```

- [ ] **Step 21: Edit `src/landing/quickTry/api.ts`**

Find this block:

```ts
    availability: () => call<QuickTryAvailability>('/api/try/availability', 'GET'),
    create: (turnstileToken) => call<QuickTryCreated>('/api/try', 'POST', turnstileToken === undefined ? {} : { turnstileToken }),
    uploadTestFile: async (token, code, kind, file) => {
```

Replace it with:

```ts
    availability: () => call<QuickTryAvailability>('/api/try/availability', 'GET'),
    create: (turnstileToken, title) => call<QuickTryCreated>('/api/try', 'POST', turnstileToken === undefined ? { title } : { turnstileToken, title }),
    uploadTestFile: async (token, code, kind, file) => {
```

- [ ] **Step 22: Edit `src/landing/quickTry/ui.ts`**

Find this block:

```ts
import { phaseOf, type TryPhase } from '../../try/phase.ts';
import type { LandingApi } from './api.ts';
```

Replace it with:

```ts
import { phaseOf, type TryPhase } from '../../try/phase.ts';
import { countLabel, formatFileSize } from '../../ui/format.ts';
import type { LandingApi } from './api.ts';
```

- [ ] **Step 23: Edit `src/landing/quickTry/ui.ts`**

Find this block:

```ts
  el.hidden = false;
}
```

Replace it with:

```ts
  el.hidden = false;
}

// A file row of the form: what to choose (its data-empty and data-hint), or
// the chosen file with its size, or the count and names of the chosen pages.
function showPick(input: HTMLInputElement, chosen: File[]): void {
  const row = input.closest<HTMLElement>('[data-try-pick]');
  if (!row) return;
  const name = row.querySelector<HTMLElement>('[data-try-pick-name]')!;
  const hint = row.querySelector<HTMLElement>('[data-try-pick-hint]')!;
  const action = row.querySelector<HTMLElement>('[data-try-pick-action]')!;
  row.classList.toggle('is-chosen', chosen.length > 0);
  if (chosen.length === 0) {
    name.textContent = row.dataset.empty ?? '';
    hint.textContent = row.dataset.hint ?? '';
    action.textContent = input.multiple ? 'Alege fișierele' : 'Alege fișierul';
    return;
  }
  name.textContent = input.multiple ? countLabel(chosen.length, 'pagină', 'pagini') : chosen[0]!.name;
  hint.textContent = input.multiple ? chosen.map((file) => file.name).join(', ') : formatFileSize(chosen[0]!.size);
  action.textContent = 'Schimbă';
}
```

- [ ] **Step 24: Edit `src/landing/quickTry/ui.ts`**

Find this block:

```ts
    return {
      test: files('test')[0] ?? null,
```

Replace it with:

```ts
    return {
      title: (form!.elements.namedItem('title') as HTMLInputElement).value,
      test: files('test')[0] ?? null,
```

- [ ] **Step 25: Edit `src/landing/quickTry/ui.ts`**

Find this block:

```ts
  closeButton.addEventListener('click', () => closeDialog(dialog));
  // Esc and a phone's back button close a dialog: not while it sends, so the
```

Replace it with:

```ts
  closeButton.addEventListener('click', () => closeDialog(dialog));

  const pickInputs = Array.from(form.querySelectorAll<HTMLInputElement>('[data-try-pick] input[type="file"]'));
  for (const input of pickInputs) input.addEventListener('change', () => showPick(input, Array.from(input.files ?? [])));
  // Esc and a phone's back button close a dialog: not while it sends, so the
```

- [ ] **Step 26: Edit `src/landing/quickTry/ui.ts`**

Find this block:

```ts
      form!.reset();
      await follow(done);
```

Replace it with:

```ts
      form!.reset();
      for (const input of pickInputs) showPick(input, []);
      await follow(done);
```

- [ ] **Step 27: Edit `index.html`**

Find this block:

```html
        <label class="try-field">
          <span>Testul (PDF sau Word)</span>
          <input type="file" name="test" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
        </label>
        <label class="try-field">
          <span>Baremul (PDF sau Word)</span>
          <input type="file" name="barem" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
        </label>
        <label class="try-check"><input type="checkbox" name="robotBarem" /> Nu am barem: fă-l din test</label>
        <label class="try-field">
          <span>Lucrarea elevului (poze sau PDF, cel mult 20)</span>
          <input type="file" name="pages" multiple accept="image/jpeg,image/png,image/webp,application/pdf" />
        </label>
```

Replace it with:

```html
        <label class="try-field">
          <span>Numele testului <small>(opțional)</small></span>
          <input class="try-input" type="text" name="title" maxlength="120" autocomplete="off" placeholder="De exemplu: Test funcții, clasa a 9-a" />
        </label>
        <label class="try-pick" data-try-pick data-empty="Alege testul" data-hint="PDF sau Word">
          <span class="try-pick-label">Testul</span>
          <input class="try-pick-input" type="file" name="test" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
          <span class="try-pick-box">
            <span class="try-pick-icon"><svg class="try-pick-file" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false"><path d="M5 2.75h7l3 3v11.5H5z" /><path d="M8 9h4.5M8 12h4.5" /></svg><svg class="try-pick-done" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg></span>
            <span class="try-pick-text"><span class="try-pick-name" data-try-pick-name>Alege testul</span><span class="try-pick-hint" data-try-pick-hint>PDF sau Word</span></span>
            <span class="btn btn-small try-pick-action" aria-hidden="true" data-try-pick-action>Alege fișierul</span>
          </span>
        </label>
        <label class="try-pick" data-try-pick data-empty="Alege baremul" data-hint="PDF sau Word">
          <span class="try-pick-label">Baremul</span>
          <input class="try-pick-input" type="file" name="barem" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
          <span class="try-pick-box">
            <span class="try-pick-icon"><svg class="try-pick-file" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false"><path d="M5 2.75h7l3 3v11.5H5z" /><path d="M8 9h4.5M8 12h4.5" /></svg><svg class="try-pick-done" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg></span>
            <span class="try-pick-text"><span class="try-pick-name" data-try-pick-name>Alege baremul</span><span class="try-pick-hint" data-try-pick-hint>PDF sau Word</span></span>
            <span class="btn btn-small try-pick-action" aria-hidden="true" data-try-pick-action>Alege fișierul</span>
          </span>
        </label>
        <label class="try-check"><input type="checkbox" name="robotBarem" /> Nu am barem: fă-l din test</label>
        <label class="try-pick" data-try-pick data-empty="Alege paginile" data-hint="Poze sau PDF, cel mult 20 de fișiere">
          <span class="try-pick-label">Lucrarea elevului</span>
          <input class="try-pick-input" type="file" name="pages" multiple accept="image/jpeg,image/png,image/webp,application/pdf" />
          <span class="try-pick-box">
            <span class="try-pick-icon"><svg class="try-pick-file" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false"><rect x="2.75" y="4.5" width="14.5" height="11" rx="2" /><circle cx="10" cy="10" r="2.6" /></svg><svg class="try-pick-done" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg></span>
            <span class="try-pick-text"><span class="try-pick-name" data-try-pick-name>Alege paginile</span><span class="try-pick-hint" data-try-pick-hint>Poze sau PDF, cel mult 20 de fișiere</span></span>
            <span class="btn btn-small try-pick-action" aria-hidden="true" data-try-pick-action>Alege fișierele</span>
          </span>
        </label>
```

- [ ] **Step 28: Edit `src/landing/landing.css`**

Find this block:

```css
  --orange-tint: #fdeee3;
  --active: #e7ecf3;
```

Replace it with:

```css
  --orange-tint: #fdeee3;
  --ok-bg: #e1f3e9;
  --ok-fg: #1d7a4c;
  --active: #e7ecf3;
```

- [ ] **Step 29: Edit `src/landing/landing.css`**

Find this block:

```css
    --text: #eef1f5; --muted: #a9b2c0; --blue: #80b1ff; --blue-hover: #a3c6ff; --on-blue: #0c1524;
    --blue-tint: #1a2740; --orange: #ff9a57; --orange-mark: #ff8a3d; --orange-tint: #33200f;
    --active: #252b36; --band: #05070a; --on-band: #eef1f5;
```

Replace it with:

```css
    --text: #eef1f5; --muted: #a9b2c0; --blue: #80b1ff; --blue-hover: #a3c6ff; --on-blue: #0c1524;
    --blue-tint: #1a2740; --orange: #ff9a57; --orange-mark: #ff8a3d; --orange-tint: #33200f; --ok-bg: #13291e; --ok-fg: #5fd39a;
    --active: #252b36; --band: #05070a; --on-band: #eef1f5;
```

- [ ] **Step 30: Edit `src/landing/landing.css`**

Find this block:

```css
  --text: #eef1f5; --muted: #a9b2c0; --blue: #80b1ff; --blue-hover: #a3c6ff; --on-blue: #0c1524;
  --blue-tint: #1a2740; --orange: #ff9a57; --orange-mark: #ff8a3d; --orange-tint: #33200f;
  --active: #252b36; --band: #05070a; --on-band: #eef1f5;
```

Replace it with:

```css
  --text: #eef1f5; --muted: #a9b2c0; --blue: #80b1ff; --blue-hover: #a3c6ff; --on-blue: #0c1524;
  --blue-tint: #1a2740; --orange: #ff9a57; --orange-mark: #ff8a3d; --orange-tint: #33200f; --ok-bg: #13291e; --ok-fg: #5fd39a;
  --active: #252b36; --band: #05070a; --on-band: #eef1f5;
```

- [ ] **Step 31: Edit `src/landing/landing.css`**

Find this block:

```css
.btn-large { height: 48px; padding: 0 22px; font-size: 16px; }
.link { color: var(--blue); font-weight: 600; text-decoration: none; }
```

Replace it with:

```css
.btn-large { height: 48px; padding: 0 22px; font-size: 16px; }
.btn-small { height: 32px; padding: 0 12px; font-size: 14px; }
.link { color: var(--blue); font-weight: 600; text-decoration: none; }
```

- [ ] **Step 32: Edit `src/landing/landing.css`**

Find this block:

```css
.try-field { display: flex; flex-direction: column; gap: 6px; font-size: 15px; font-weight: 600; }
.try-field input { min-width: 0; max-width: 100%; font: 400 14px var(--font); color: var(--text); }
.try-check { display: flex; gap: 8px; align-items: center; font-size: 15px; }
```

Replace it with:

```css
.try-field { display: flex; flex-direction: column; gap: 6px; font-size: 15px; font-weight: 600; }
.try-field small { color: var(--muted); font-weight: 400; }
.try-input { height: 42px; min-width: 0; padding: 0 12px; border: 1px solid var(--control); border-radius: var(--r-sm); background: var(--surface); color: var(--text); font: 400 15px var(--font); }
.try-input::placeholder { color: var(--muted); opacity: 0.8; }
/* A file row: the real input stays in the label, out of sight but focusable;
   the box shows what to choose or what was chosen. */
.try-pick { position: relative; display: flex; flex-direction: column; gap: 6px; font-size: 15px; cursor: pointer; }
.try-pick-label { font-weight: 600; }
.try-pick-input { position: absolute; top: 0; left: 0; width: 1px; height: 1px; opacity: 0; }
.try-pick-box { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1.5px dashed var(--control); border-radius: var(--r); background: var(--ground); }
.try-pick:hover .try-pick-box { border-color: var(--blue); }
.try-pick-input:focus-visible + .try-pick-box { outline: 2px solid var(--blue); outline-offset: 2px; }
.try-pick-icon { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: var(--r-sm); background: var(--blue-tint); color: var(--blue); }
.try-pick-icon svg { width: 20px; height: 20px; }
.try-pick-done, .try-pick.is-chosen .try-pick-file { display: none; }
.try-pick.is-chosen .try-pick-done { display: block; }
.try-pick-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.try-pick-name, .try-pick-hint { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.try-pick-name { font-weight: 600; }
.try-pick-hint { color: var(--muted); font-size: 13px; }
.try-pick-action { flex: none; pointer-events: none; }
.try-pick.is-chosen .try-pick-box { border-style: solid; border-color: var(--border); background: var(--surface); }
.try-pick.is-chosen .try-pick-icon { background: var(--ok-bg); color: var(--ok-fg); }
.try-check { display: flex; gap: 8px; align-items: center; font-size: 15px; }
```

- [ ] **Step 33: Run the tests to see them pass**

Run: `npx vitest run src/landing`
Expected: PASS, `Tests  72 passed (72)`.

- [ ] **Step 34: Typecheck and run all tests**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  162 passed | 1 skipped (163)`, `Tests  2359 passed | 3 skipped (2362)`.

- [ ] **Step 35: Commit**

```bash
git add src/landing/quickTry/send.test.ts src/landing/quickTry/ui.test.ts src/landing/quickTry/api.test.ts src/landing/quickTry/send.ts src/landing/quickTry/api.ts src/landing/quickTry/ui.ts index.html src/landing/landing.css
git commit -m "Give the Quick Try form a name for the try and file rows in the app's look"
```

Check: `git diff --stat refs/protoqtd/d3 HEAD -- . ':!docs/superpowers/plans'` prints nothing.

### Task 4: The landing page: the button under the login, and the card of her try

**Files:**
- Modify: `src/landing/quickTry/status.test.ts`, `src/landing/quickTry/ui.test.ts`, `src/try/phase.test.ts`, `src/landing/quickTry/status.ts`, `src/try/phase.ts`, `src/landing/quickTry/ui.ts`, `index.html`, `src/landing/landing.css`
- Test: `src/landing/quickTry/status.test.ts`, `src/landing/quickTry/ui.test.ts`, `src/try/phase.test.ts`

**Interfaces:**
- Consumes: `UploadRow.grade`, `total`, `maxTotal`, `flagCount`; `formatPoints` (`shared/scoring.ts`); `formatDate`, `formatDateTime`, `countLabel` (`src/ui/format.ts`); `QUICK_TRY_DAYS`.
- Produces: `TryTone = 'work' | 'you' | 'ok' | 'off'`; `TryStatus { text; working; tone; label }` from `statusOf(detail)`; `scoreOf(detail: TestDetail): { grade: string; points: string } | null` in `src/try/phase.ts` (Task 5 uses it); the card `[data-try-status]` with `[data-try-title]`, `[data-try-chip]` (`try-chip is-<tone>`), `[data-try-meta]`, `[data-try-status-text]`, `[data-try-score]`, `[data-try-grade]`, `[data-try-points]`, `[data-try-link]`; the line `[data-try-hint]`.

- [ ] **Step 1: Edit `src/landing/quickTry/status.test.ts`**

Find this block:

```ts
      working: true,
    });
```

Replace it with:

```ts
      working: true,
      tone: 'work',
      label: 'Se face baremul',
    });
```

- [ ] **Step 2: Edit `src/landing/quickTry/status.test.ts`**

Find this block:

```ts
      text: 'Baremul este gata. Deschide încercarea ca să-l citești și să pornești corectarea.',
      working: false,
    });
  });
```

Replace it with:

```ts
      text: 'Baremul este gata. Deschide încercarea ca să-l citești și să pornești corectarea.',
      working: false,
      tone: 'you',
      label: 'Baremul e gata',
    });
  });
```

- [ ] **Step 3: Edit `src/landing/quickTry/status.test.ts`**

Find this block:

```ts
  it('follows the grading to the graded paper', () => {
    expect(statusOf(tryTest({ status: 'evaluating', files }, { status: 'submitted' }))).toEqual({ text: 'Se corectează… Durează câteva minute.', working: true });
    expect(statusOf(tryTest({ status: 'done', files }, { status: 'graded' }))).toEqual({ text: 'Lucrarea este corectată.', working: false });
  });
```

Replace it with:

```ts
  it('follows the grading to the graded paper', () => {
    expect(statusOf(tryTest({ status: 'evaluating', files }, { status: 'submitted' }))).toEqual({
      text: 'Se corectează… Durează câteva minute.',
      working: true,
      tone: 'work',
      label: 'Se corectează',
    });
    expect(statusOf(tryTest({ status: 'done', files }, { status: 'graded' }))).toEqual({
      text: 'Lucrarea este corectată.',
      working: false,
      tone: 'ok',
      label: 'Corectată',
    });
  });

  it('says how many points of the graded paper wait for her check', () => {
    expect(statusOf(tryTest({ status: 'done', files }, { status: 'graded', flagCount: 2 }))).toEqual({
      text: 'Lucrarea este corectată. Robotul nu a fost sigur de câteva puncte: verifică-le.',
      working: false,
      tone: 'you',
      label: '2 puncte de verificat',
    });
    expect(statusOf(tryTest({ status: 'done', files }, { status: 'graded', flagCount: 1 })).label).toBe('1 punct de verificat');
  });
```

- [ ] **Step 4: Edit `src/landing/quickTry/status.test.ts`**

Find this block:

```ts
    const problem = tryTest({ status: 'evaluating', files, exerciseList: { status: 'problem', message: 'Punctajele dau 9.' } }, { status: 'submitted' });
    expect(statusOf(problem)).toEqual({ text: 'Baremul are o problemă. Deschide încercarea ca să alegi ce faci.', working: false });
    expect(statusOf(tryTest({ files: { ...files, barem: null } }))).toEqual({
```

Replace it with:

```ts
    const problem = tryTest({ status: 'evaluating', files, exerciseList: { status: 'problem', message: 'Punctajele dau 9.' } }, { status: 'submitted' });
    expect(statusOf(problem)).toEqual({
      text: 'Baremul are o problemă. Deschide încercarea ca să alegi ce faci.',
      working: false,
      tone: 'you',
      label: 'Ai de ales',
    });
    expect(statusOf(tryTest({ files: { ...files, barem: null } }))).toEqual({
```

- [ ] **Step 5: Edit `src/landing/quickTry/status.test.ts`**

Find this block:

```ts
      text: 'Corectarea nu a pornit încă. Deschide încercarea ca să trimiți ce lipsește și s-o pornești.',
      working: false,
    });
  });
```

Replace it with:

```ts
      text: 'Corectarea nu a pornit încă. Deschide încercarea ca să trimiți ce lipsește și s-o pornești.',
      working: false,
      tone: 'you',
      label: 'Nu a pornit',
    });
  });
```

- [ ] **Step 6: Edit `src/landing/quickTry/status.test.ts`**

Find this block:

```ts
      working: false,
    });
```

Replace it with:

```ts
      working: false,
      tone: 'off',
      label: 'Nu a reușit',
    });
```

- [ ] **Step 7: Edit `src/landing/quickTry/ui.test.ts`**

Find this block:

```ts
describe("the landing page's Quick Try", () => {
  it('shows the button beside the account links when a try can be made', async () => {
    await mount();
```

Replace it with:

```ts
describe("the landing page's Quick Try", () => {
  it('shows the button under the login, with a line on what she gets, when a try can be made', async () => {
    await mount();
```

- [ ] **Step 8: Edit `src/landing/quickTry/ui.test.ts`**

Find this block:

```ts
    expect(button()!.closest('.cta')).not.toBeNull();
  });
```

Replace it with:

```ts
    expect(button()!.closest('.cta')).not.toBeNull();
    expect(screen.getByText('Gratuit: trimiți lucrarea unui elev și o primești corectată în câteva minute.')).toBeVisible();
  });

  it('hides the line with the button', async () => {
    await mount(fakeLandingApi({ dailyLimitReached: true }));
    expect(screen.getByText(/^Gratuit: trimiți lucrarea/)).not.toBeVisible();
  });

  it('shows her try as a card: its name, when she sent it, its state and its grade', async () => {
    store('2026-11-10T07:30:00.000Z');
    const api = fakeLandingApi();
    api.getTest.mockResolvedValue(
      tryTest({ status: 'done', files, title: 'Test funcții 9B' }, { status: 'graded', grade: 6.7, total: 67, maxTotal: 100, flagCount: 2 }),
    );
    await mount(api);
    const card = screen.getByRole('status');
    expect(within(card).getByText('Test funcții 9B')).toBeVisible();
    expect(card).toHaveTextContent('Trimisă 10 nov. 2026, 09:30 · Linkul merge până pe 17 noiembrie 2026');
    expect(within(card).getByText('2 puncte de verificat')).toHaveClass('try-chip', 'is-you');
    expect(within(card).getByText('6,7')).toBeVisible();
    expect(card).toHaveTextContent('67 din 100 de puncte');
  });

  it('shows no grade on the card while the paper is not graded', async () => {
    store();
    await mount();
    expect(within(screen.getByRole('status')).getByText('Se corectează')).toHaveClass('try-chip', 'is-work');
    expect(document.querySelector('[data-try-score]')).not.toBeVisible();
  });
```

- [ ] **Step 9: Edit `src/try/phase.test.ts`**

Find this block:

```ts
import { describe, expect, it } from 'vitest';
import { tryTest } from '../test/fakeTryApi.tsx';
import { fileChangesLeft, phaseOf, refreshOf } from './phase.ts';

```

Replace it with:

```ts
import { describe, expect, it } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { tryTest } from '../test/fakeTryApi.tsx';
import { fileChangesLeft, phaseOf, refreshOf, scoreOf } from './phase.ts';

const files = { test: { name: 'test.pdf', type: PDF_TYPE }, barem: { name: 'barem.pdf', type: PDF_TYPE } };

```

- [ ] **Step 10: Edit `src/try/phase.test.ts`**

Find this block:

```ts
    expect(fileChangesLeft(tryTest({ filesVersion: 7 }))).toBe(0);
  });
});
```

Replace it with:

```ts
    expect(fileChangesLeft(tryTest({ filesVersion: 7 }))).toBe(0);
  });
});

describe("the graded paper's grade", () => {
  it('gives the grade and the points, in Romanian', () => {
    expect(scoreOf(tryTest({ status: 'done', files }, { status: 'graded', grade: 6.7, total: 67, maxTotal: 100 }))).toEqual({
      grade: '6,7',
      points: '67 din 100 de puncte',
    });
    expect(scoreOf(tryTest({ status: 'done', files }, { status: 'graded', grade: 9.5, total: 9.5, maxTotal: 10 }))!.points).toBe('9,5 din 10 puncte');
  });

  it('has none before the paper is graded', () => {
    expect(scoreOf(tryTest({ status: 'evaluating', files }, { status: 'submitted' }))).toBeNull();
  });
});
```

- [ ] **Step 11: Run the tests to see them fail**

Run: `npx vitest run src/landing/quickTry/status.test.ts src/landing/quickTry/ui.test.ts src/try/phase.test.ts`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  11 failed | 33 passed (44)`: `scoreOf is not a function` (2 tests); the five `statusOf` tests (`expected { …(2) } to deeply equal { …(4) }`: no `tone` and `label`); no line "Gratuit: trimiți lucrarea unui elev …" (2 tests); no card text "Test funcții 9B" and no tag "Se corectează". The 33 tests that pass are the three files' older tests.

- [ ] **Step 12: Edit `src/try/phase.ts`**

Find this block:

```ts
import { QUICK_TRY_FILE_CHANGES } from '../../shared/quickTry.ts';

```

Replace it with:

```ts
import { QUICK_TRY_FILE_CHANGES } from '../../shared/quickTry.ts';
import { formatPoints } from '../../shared/scoring.ts';
import { countLabel } from '../ui/format.ts';

```

- [ ] **Step 13: Edit `src/try/phase.ts`**

Find this block:

```ts
  return Math.max(0, QUICK_TRY_FILE_CHANGES - detail.test.filesVersion);
}
```

Replace it with:

```ts
  return Math.max(0, QUICK_TRY_FILE_CHANGES - detail.test.filesVersion);
}

// The graded paper's grade and points ("6,7", "67 din 100 de puncte"); null
// before it is graded.
export function scoreOf(detail: TestDetail): { grade: string; points: string } | null {
  const paper = paperOf(detail);
  if (phaseOf(detail) !== 'graded' || paper?.grade == null || paper.total == null || paper.maxTotal == null) return null;
  return { grade: formatPoints(paper.grade), points: `${formatPoints(paper.total)} din ${countLabel(paper.maxTotal, 'punct', 'puncte')}` };
}
```

- [ ] **Step 14: Edit `src/landing/quickTry/status.ts`**

Find this block:

```ts
import type { QuickTryAvailability, TestDetail } from '../../../shared/api.ts';
import { phaseOf, type TryPhase } from '../../try/phase.ts';
import { usedToday, type StoredTry } from './storage.ts';

// The status line under the button (spec §3.1): what the try waits for, and
// whether the robot works for it (the line then reads the test again).
export function statusOf(detail: TestDetail): { text: string; working: boolean } {
  const phase = phaseOf(detail);
  const { barem, files } = detail.test;
  if (phase === 'failed') return { text: 'Încercarea nu a reușit. Nu se numără: poți face alta azi.', working: false };
  if (phase === 'graded') return { text: 'Lucrarea este corectată.', working: false };
  if (phase === 'grading') return { text: 'Se corectează… Durează câteva minute.', working: true };
  if (phase === 'problem') return { text: 'Baremul are o problemă. Deschide încercarea ca să alegi ce faci.', working: false };
  if (barem.request === 'requested') return { text: 'Se face baremul…', working: true };
  if (barem.unchecked && files.barem) {
    return { text: 'Baremul este gata. Deschide încercarea ca să-l citești și să pornești corectarea.', working: false };
  }
  return { text: 'Corectarea nu a pornit încă. Deschide încercarea ca să trimiți ce lipsește și s-o pornești.', working: false };
}
```

Replace it with:

```ts
import type { QuickTryAvailability, TestDetail } from '../../../shared/api.ts';
import { paperOf, phaseOf, type TryPhase } from '../../try/phase.ts';
import { countLabel } from '../../ui/format.ts';
import { usedToday, type StoredTry } from './storage.ts';

// The colour of the card's tag: the robot works (blue), she has something to
// do (orange), the paper is graded and checked (green), the try failed (grey).
export type TryTone = 'work' | 'you' | 'ok' | 'off';

export interface TryStatus {
  // The line under the card's title.
  text: string;
  // The robot works for the try: the card reads the test again.
  working: boolean;
  tone: TryTone;
  // The card's tag.
  label: string;
}

// The card of her try (spec §3.1): what the try waits for, and whether the
// robot works for it.
export function statusOf(detail: TestDetail): TryStatus {
  const phase = phaseOf(detail);
  const { barem, files } = detail.test;
  if (phase === 'failed') return { text: 'Încercarea nu a reușit. Nu se numără: poți face alta azi.', working: false, tone: 'off', label: 'Nu a reușit' };
  if (phase === 'graded') {
    const flags = paperOf(detail)?.flagCount ?? 0;
    if (flags === 0) return { text: 'Lucrarea este corectată.', working: false, tone: 'ok', label: 'Corectată' };
    return {
      text: 'Lucrarea este corectată. Robotul nu a fost sigur de câteva puncte: verifică-le.',
      working: false,
      tone: 'you',
      label: countLabel(flags, 'punct de verificat', 'puncte de verificat'),
    };
  }
  if (phase === 'grading') return { text: 'Se corectează… Durează câteva minute.', working: true, tone: 'work', label: 'Se corectează' };
  if (phase === 'problem') {
    return { text: 'Baremul are o problemă. Deschide încercarea ca să alegi ce faci.', working: false, tone: 'you', label: 'Ai de ales' };
  }
  if (barem.request === 'requested') return { text: 'Se face baremul…', working: true, tone: 'work', label: 'Se face baremul' };
  if (barem.unchecked && files.barem) {
    return {
      text: 'Baremul este gata. Deschide încercarea ca să-l citești și să pornești corectarea.',
      working: false,
      tone: 'you',
      label: 'Baremul e gata',
    };
  }
  return {
    text: 'Corectarea nu a pornit încă. Deschide încercarea ca să trimiți ce lipsește și s-o pornești.',
    working: false,
    tone: 'you',
    label: 'Nu a pornit',
  };
}
```

- [ ] **Step 15: Edit `src/landing/quickTry/ui.ts`**

Find this block:

```ts
import type { QuickTryAvailability } from '../../../shared/api.ts';
import { ApiError, messageOf } from '../../ui/ApiError.ts';
import { phaseOf, type TryPhase } from '../../try/phase.ts';
import { countLabel, formatFileSize } from '../../ui/format.ts';
import type { LandingApi } from './api.ts';
```

Replace it with:

```ts
import type { QuickTryAvailability } from '../../../shared/api.ts';
import { QUICK_TRY_DAYS } from '../../../shared/quickTry.ts';
import { ApiError, messageOf } from '../../ui/ApiError.ts';
import { phaseOf, scoreOf, type TryPhase } from '../../try/phase.ts';
import { countLabel, formatDate, formatDateTime, formatFileSize } from '../../ui/format.ts';
import type { LandingApi } from './api.ts';
```

- [ ] **Step 16: Edit `src/landing/quickTry/ui.ts`**

Find this block:

```ts
const tryPath = (token: string) => `/try/${token}`;

```

Replace it with:

```ts
const tryPath = (token: string) => `/try/${token}`;
const DAY_MS = 24 * 60 * 60 * 1000;

```

- [ ] **Step 17: Edit `src/landing/quickTry/ui.ts`**

Find this block:

```ts
  const note = box.querySelector<HTMLElement>('[data-try-note]')!;
  const status = box.querySelector<HTMLElement>('[data-try-status]')!;
  const statusText = box.querySelector<HTMLElement>('[data-try-status-text]')!;
  const statusLink = box.querySelector<HTMLAnchorElement>('[data-try-link]')!;
```

Replace it with:

```ts
  const note = box.querySelector<HTMLElement>('[data-try-note]')!;
  const hint = root.querySelector<HTMLElement>('[data-try-hint]');
  const status = box.querySelector<HTMLElement>('[data-try-status]')!;
  const statusTitle = box.querySelector<HTMLElement>('[data-try-title]')!;
  const statusChip = box.querySelector<HTMLElement>('[data-try-chip]')!;
  const statusMeta = box.querySelector<HTMLElement>('[data-try-meta]')!;
  const statusText = box.querySelector<HTMLElement>('[data-try-status-text]')!;
  const statusScore = box.querySelector<HTMLElement>('[data-try-score]')!;
  const statusGrade = box.querySelector<HTMLElement>('[data-try-grade]')!;
  const statusPoints = box.querySelector<HTMLElement>('[data-try-points]')!;
  const statusLink = box.querySelector<HTMLAnchorElement>('[data-try-link]')!;
```

- [ ] **Step 18: Edit `src/landing/quickTry/ui.ts`**

Find this block:

```ts
    openButton!.hidden = answer !== 'yes';
    note.hidden = true;
```

Replace it with:

```ts
    openButton!.hidden = answer !== 'yes';
    if (hint) hint.hidden = openButton!.hidden;
    note.hidden = true;
```

- [ ] **Step 19: Edit `src/landing/quickTry/ui.ts`**

Find this block:

```ts
    statusLink.href = tryPath(current.token);
    try {
```

Replace it with:

```ts
    statusLink.href = tryPath(current.token);
    const expires = new Date(Date.parse(current.madeAt) + QUICK_TRY_DAYS * DAY_MS).toISOString();
    statusMeta.textContent = `Trimisă ${formatDateTime(current.madeAt)} · Linkul merge până pe ${formatDate(expires)}`;
    try {
```

- [ ] **Step 20: Edit `src/landing/quickTry/ui.ts`**

Find this block:

```ts
      const line = statusOf(detail);
      phase = phaseOf(detail);
      show(status);
      statusText.textContent = line.text;
      if (line.working) timer = setTimeout(() => void follow(current), refreshMs);
```

Replace it with:

```ts
      const line = statusOf(detail);
      const score = scoreOf(detail);
      phase = phaseOf(detail);
      show(status);
      statusTitle.textContent = detail.test.title;
      statusChip.textContent = line.label;
      statusChip.className = `try-chip is-${line.tone}`;
      statusText.textContent = line.text;
      statusScore.hidden = score === null;
      statusGrade.textContent = score?.grade ?? '';
      statusPoints.textContent = score?.points ?? '';
      statusLink.classList.toggle('btn-primary', !line.working);
      if (line.working) timer = setTimeout(() => void follow(current), refreshMs);
```

- [ ] **Step 21: Edit `src/landing/quickTry/ui.ts`**

Find this block:

```ts
        show(status);
        statusText.textContent = 'Nu am putut citi încercarea acum.';
```

Replace it with:

```ts
        show(status);
        statusChip.textContent = '';
        statusChip.className = 'try-chip';
        statusText.textContent = 'Nu am putut citi încercarea acum.';
```

- [ ] **Step 22: Edit `index.html`**

Find this block:

```html
            <div class="cta">
              <a class="btn btn-primary btn-large" href="/teacher/">Intră în cont</a>
              <a class="link" href="/teacher/#cont-nou">Cere un cont de profesor</a>
              <button class="btn btn-large btn-try" type="button" data-try-open hidden>Încearcă acum, fără cont</button>
            </div>
```

Replace it with:

```html
            <div class="cta">
              <div class="cta-row">
                <a class="btn btn-primary btn-large" href="/teacher/">Intră în cont</a>
                <a class="link" href="/teacher/#cont-nou">Cere un cont de profesor</a>
              </div>
              <button class="btn btn-large btn-try" type="button" data-try-open hidden>Încearcă acum, fără cont</button>
              <p class="cta-hint" data-try-hint hidden>Gratuit: trimiți lucrarea unui elev și o primești corectată în câteva minute.</p>
            </div>
```

- [ ] **Step 23: Edit `index.html`**

Find this block:

```html
              <p class="try-note" data-try-note hidden></p>
              <p class="try-status" data-try-status role="status" hidden>
                <span data-try-status-text></span>
                <a class="link" data-try-link href="/">Deschide încercarea</a>
              </p>
            </div>
```

Replace it with:

```html
              <p class="try-note" data-try-note hidden></p>
              <div class="try-card" data-try-status role="status" hidden>
                <div class="try-card-top">
                  <div class="try-card-head">
                    <p class="try-card-kicker">Încercarea ta</p>
                    <p class="try-card-title" data-try-title></p>
                  </div>
                  <span class="try-chip" data-try-chip></span>
                </div>
                <p class="try-card-meta" data-try-meta></p>
                <p class="try-card-text" data-try-status-text></p>
                <div class="try-card-bottom">
                  <p class="try-score" data-try-score hidden><span class="try-grade" data-try-grade></span> <span class="try-points" data-try-points></span></p>
                  <a class="btn btn-small" data-try-link href="/">Deschide încercarea</a>
                </div>
              </div>
            </div>
```

- [ ] **Step 24: Edit `src/landing/landing.css`**

Find this block:

```css
.l-intro { margin-top: 20px; }
.cta { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; }

```

Replace it with:

```css
.l-intro { margin-top: 20px; }
.cta { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
.cta-row { display: flex; gap: 12px 20px; align-items: center; flex-wrap: wrap; }
.cta .btn-large { min-width: 264px; }
.cta-hint { color: var(--muted); font-size: 14px; }
.cta-hint[hidden] { display: none; }

```

- [ ] **Step 25: Edit `src/landing/landing.css`**

Find this block:

```css
.try-note { color: var(--muted); max-width: 52ch; }
.try-status { display: flex; gap: 4px 12px; flex-wrap: wrap; align-items: baseline; font-weight: 600; }
.try-dialog { width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); padding: 0; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); color: var(--text); }
```

Replace it with:

```css
.try-note { color: var(--muted); max-width: 52ch; }
/* The card of her try: its name, when she sent it, its state and grade. */
.try-card { display: flex; flex-direction: column; gap: 10px; max-width: 460px; padding: 16px 18px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.try-card[hidden] { display: none; }
.try-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.try-card-head { min-width: 0; }
.try-card-kicker { color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.try-card-title { font-size: 18px; font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
.try-card-meta { color: var(--muted); font-size: 14px; }
.try-card-text { font-size: 15px; }
.try-card-bottom { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.try-card-bottom .btn { margin-left: auto; }
.try-chip { flex: none; display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 999px; font-size: 13px; font-weight: 600; white-space: nowrap; background: var(--active); color: var(--muted); }
.try-chip:empty { display: none; }
.try-chip.is-work { background: var(--blue-tint); color: var(--blue); }
.try-chip.is-you { background: var(--orange-tint); color: var(--orange); }
.try-chip.is-ok { background: var(--ok-bg); color: var(--ok-fg); }
.try-score { display: flex; align-items: baseline; gap: 8px; }
.try-score[hidden] { display: none; }
.try-grade { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; color: var(--blue); }
.try-points { color: var(--muted); font-size: 14px; }
.try-dialog { width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); padding: 0; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); color: var(--text); }
```

- [ ] **Step 26: Edit `src/landing/landing.css`**

Find this block:

```css
@media (max-width: 420px) {
  .try-dialog { width: calc(100vw - 16px); max-width: calc(100vw - 16px); }
```

Replace it with:

```css
@media (max-width: 420px) {
  .cta, .cta .btn-large { width: 100%; }
  .try-dialog { width: calc(100vw - 16px); max-width: calc(100vw - 16px); }
```

- [ ] **Step 27: Run the tests to see them pass**

Run: `npx vitest run src/landing src/try/phase.test.ts`
Expected: PASS, `Tests  84 passed (84)`.

- [ ] **Step 28: Typecheck and run all tests**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  162 passed | 1 skipped (163)`, `Tests  2365 passed | 3 skipped (2368)`.

- [ ] **Step 29: Commit**

```bash
git add src/landing/quickTry/status.test.ts src/landing/quickTry/ui.test.ts src/try/phase.test.ts src/landing/quickTry/status.ts src/try/phase.ts src/landing/quickTry/ui.ts index.html src/landing/landing.css
git commit -m "Put the Quick Try button under the login, and show the visitor's try as a card with its name, time, state and grade"
```

Check: `git diff --stat refs/protoqtd/d4 HEAD -- . ':!docs/superpowers/plans'` prints nothing.

### Task 5: The try's page: its head, the grade and the points to check, its own tabs

**Files:**
- Create: `src/try/TryHead.test.tsx`, `src/try/TryHead.tsx`
- Modify: `src/test/fakeTryApi.tsx`, `src/try/Graded.test.tsx`, `src/try/TryApp.test.tsx`, `src/try/TryHome.tsx`, `src/try/Graded.tsx`, `src/try/try.css`
- Test: `src/try/TryHead.test.tsx`, `src/try/Graded.test.tsx`, `src/try/TryApp.test.tsx`

**Interfaces:**
- Consumes: Task 2's rename route; Task 4's `scoreOf`; `AdminApi.renameTest(code, title)`; `testFileUrl(code, kind, undefined, api.base)`; `pointKey`, `reviewPath` (`src/admin/reviewPage/points.ts`); `ShareButton`.
- Produces: `TryHead({ detail, info, token })`; `'renameTest'` in `TRY_ADMIN_CALLS`; the classes `try-head`, `try-summary`, `try-todo`, `try-tabs`, `try-tab`, `try-tab-count`, `try-panel`, `try-points` in `try.css`.

- [ ] **Step 1: Edit `src/test/fakeTryApi.tsx`**

Find this block:

```tsx
// server/routes/quickTry.ts). A page test that reaches any other call fails.
export const TRY_ADMIN_CALLS = ['getTest', 'uploadTestFile', 'generateBarem', 'acceptExerciseList', 'getSubmission', 'correctItem', 'reviewPages'] as const;

```

Replace it with:

```tsx
// server/routes/quickTry.ts). A page test that reaches any other call fails.
export const TRY_ADMIN_CALLS = ['getTest', 'renameTest', 'uploadTestFile', 'generateBarem', 'acceptExerciseList', 'getSubmission', 'correctItem', 'reviewPages'] as const;

```

- [ ] **Step 2: Create `src/try/TryHead.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { QUICK_TRY_TITLE } from '../../shared/quickTry.ts';
import { createFakeApi } from '../test/fakeApi.ts';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeTryApi, renderTry, TRY_CODE, TRY_TOKEN, tryTest } from '../test/fakeTryApi.tsx';

const files = { test: { name: 'test.pdf', type: PDF_TYPE }, barem: { name: 'barem.pdf', type: PDF_TYPE } };

// A try in grading, sent at 09:30 Bucharest time; its link works until 17 November.
function setup(title = 'Test funcții 9B') {
  const test = tryTest(
    { status: 'evaluating', files, title },
    { status: 'submitted', startedAt: '2026-11-10T07:20:00.000Z', submittedAt: '2026-11-10T07:30:00.000Z' },
  );
  const api = createFakeApi({ classes: [], students: {}, tests: [test] });
  renderTry('/', api, createFakeTryApi());
  return api;
}

describe("the try's header", () => {
  it("names the try, and says when it was sent and until when its link works", async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'Test funcții 9B', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Încercare rapidă')).toBeInTheDocument();
    expect(screen.getByText('Trimisă la corectare 10 nov. 2026, 09:30 · Linkul merge până pe 17 noiembrie 2026')).toBeInTheDocument();
  });

  it('says only once that it is a quick try when the try has the default name', async () => {
    setup(QUICK_TRY_TITLE);
    expect(await screen.findByRole('heading', { name: QUICK_TRY_TITLE, level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText(QUICK_TRY_TITLE)).toHaveLength(1);
  });

  it('lets her download the test and the barem the try used', async () => {
    setup();
    expect(await screen.findByRole('link', { name: 'Descarcă testul' })).toHaveAttribute('href', `/api/try/${TRY_TOKEN}/tests/${TRY_CODE}/files/test`);
    expect(screen.getByRole('link', { name: 'Descarcă baremul' })).toHaveAttribute('href', `/api/try/${TRY_TOKEN}/tests/${TRY_CODE}/files/barem`);
  });

  it('renames the try', async () => {
    const api = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Schimbă numele' }));
    const name = screen.getByRole('textbox', { name: 'Numele testului' });
    expect(name).toHaveValue('Test funcții 9B');
    await userEvent.clear(name);
    await userEvent.type(name, 'Teză semestrul I');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(await screen.findByRole('heading', { name: 'Teză semestrul I', level: 1 })).toBeInTheDocument();
    expect(api.renameTest).toHaveBeenCalledWith(TRY_CODE, 'Teză semestrul I');
  });

  it('keeps the name when she gives up the rename', async () => {
    const api = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Schimbă numele' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Numele testului' }), ' nou');
    await userEvent.click(screen.getByRole('button', { name: 'Renunță' }));
    expect(screen.getByRole('heading', { name: 'Test funcții 9B', level: 1 })).toBeInTheDocument();
    expect(api.renameTest).not.toHaveBeenCalled();
  });

  it("shows the server's refusal of a name and keeps the form open", async () => {
    const api = setup();
    api.renameTest.mockRejectedValueOnce(new ApiError(400, 'invalid_body', 'Scrie titlul testului.'));
    await userEvent.click(await screen.findByRole('button', { name: 'Schimbă numele' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(await screen.findByText('Scrie titlul testului.')).toBeInTheDocument();
    expect(within(screen.getByRole('form', { name: 'Schimbă numele' })).getByRole('textbox')).toHaveValue('Test funcții 9B');
  });
});
```

- [ ] **Step 3: Edit `src/try/Graded.test.tsx`**

Find this block:

```tsx
import { QUICK_TRY_STUDENT, QUICK_TRY_TITLE } from '../../shared/quickTry.ts';
import { createFakeApi, fakeEvaluation, fakeItem, fakeSubmission, reviewPointsOf } from '../test/fakeApi.ts';
```

Replace it with:

```tsx
import { QUICK_TRY_STUDENT, QUICK_TRY_TITLE } from '../../shared/quickTry.ts';
import { formatPoints } from '../../shared/scoring.ts';
import { createFakeApi, fakeEvaluation, fakeItem, fakeSubmission, reviewPointsOf } from '../test/fakeApi.ts';
```

- [ ] **Step 4: Edit `src/try/Graded.test.tsx`**

Find this block:

```tsx

  it("says when nothing is left to check", async () => {
    setup('/', true);
    expect(await screen.findByText(/Toate punctele sunt verificate/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Verifică/ })).not.toBeInTheDocument();
  });
```

Replace it with:

```tsx

  it('shows the grade and the points to check above the views', async () => {
    const { api } = setup();
    const paper = (await api.getTest(TRY_CODE)).uploads[0]!;
    const summary = await screen.findByRole('region', { name: 'Rezultatul încercării' });
    expect(within(summary).getByText('Nota')).toBeInTheDocument();
    expect(within(summary).getByText(formatPoints(paper.grade!))).toBeInTheDocument();
    expect(within(summary).getByText(`${formatPoints(paper.total!)} din 10 puncte`)).toBeInTheDocument();
    expect(within(summary).getByText('1 punct nesigur')).toBeInTheDocument();
    expect(within(summary).getByRole('link', { name: 'Verifică 1 punct' })).toHaveAttribute('href', '/teste/PROBA-26T1/verificare');
  });

  it('lists each point to check with its reason, and opens the review at it', async () => {
    setup();
    const panel = await screen.findByRole('tabpanel');
    expect(within(panel).getByText('Subiectul I, ex. 1')).toBeInTheDocument();
    expect(within(panel).getByText('Scrisul se citește greu.')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('link', { name: 'Verifică Subiectul I, ex. 1' }));
    expect(await screen.findByRole('heading', { name: 'Verificare', level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(`/teste/PROBA-26T1/verificare?lucrare=${TRY_SUBMISSION}&punct=71`);
  });

  it('gives the result tabs a short name for a phone, and keeps their full name', async () => {
    setup();
    const tab = await screen.findByRole('tab', { name: 'Rezultatul profesorului' });
    expect(within(tab).getByText('Profesor')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('tab', { name: 'Rezultatul elevului' })).toHaveTextContent('Elev');
  });

  it('counts the points to check on the Verificare tab', async () => {
    setup();
    const tab = await screen.findByRole('tab', { name: 'Verificare' });
    expect(tab).toHaveTextContent('Verificare1');
  });

  it("says when nothing is left to check", async () => {
    setup('/', true);
    expect(await screen.findByText('Toate punctele sunt verificate.')).toBeInTheDocument();
    expect(screen.getByText('Nu mai ai puncte de verificat. Rezultatul profesorului și cel al elevului sunt gata.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Verifică/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Verificare' })).toHaveTextContent(/^Verificare$/);
  });
```

- [ ] **Step 5: Edit `src/try/TryApp.test.tsx`**

Find this block:

```tsx
    expect(screen.getByRole('link', { name: 'MQGrader by Laura Miron' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Corectezi o lucrare, fără cont. Linkul acestei pagini merge 7 zile.')).toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(screen.getByRole('link', { name: 'MQGrader by Laura Miron' })).toHaveAttribute('href', '/');
    expect(screen.getByText(/Linkul merge până pe 17 noiembrie 2026/)).toBeInTheDocument();
  });
```

- [ ] **Step 6: Run the tests to see them fail**

Run: `npx vitest run src/try/TryHead.test.tsx src/try/Graded.test.tsx src/try/TryApp.test.tsx`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  11 failed | 16 passed (27)`: no region "Rezultatul încercării", no point "Subiectul I, ex. 1" in the view, no "Profesor", no count on the tab, no "Toate punctele sunt verificate.", no "Linkul merge până pe 17 noiembrie 2026", no heading "Test funcții 9B", no link "Descarcă testul", no button "Schimbă numele" (3 tests). The 16 tests that pass include the guard "says only once that it is a quick try when the try has the default name" and the files' older tests.

- [ ] **Step 7: Create `src/try/TryHead.tsx`**

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { QuickTryInfo, TestDetail } from '../../shared/api.ts';
import type { TestFileKind } from '../../shared/files.ts';
import { QUICK_TRY_TITLE } from '../../shared/quickTry.ts';
import { MAX_TITLE_LENGTH } from '../../shared/tests.ts';
import { testFileUrl } from '../admin/api.ts';
import { useApi } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { formatDate, formatDateTime } from '../ui/format.ts';
import { paperOf, phaseOf } from './phase.ts';
import { ShareButton } from './Share.tsx';

// The head of the try's page, the same in every state and view: the try's
// name (which she may change), when it was sent, until when its link works,
// the test and barem it uses (not while she prepares them: that part of the
// page has them), and "Distribuie".
export function TryHead({ detail, info, token }: { detail: TestDetail; info: QuickTryInfo; token: string }) {
  const { test } = detail;
  const paper = paperOf(detail);
  const sent = paper?.submittedAt ? `Trimisă la corectare ${formatDateTime(paper.submittedAt)} · ` : paper?.startedAt ? `Începută ${formatDateTime(paper.startedAt)} · ` : '';
  return (
    <header className="try-head">
      <div className="try-head-main">
        {test.title !== QUICK_TRY_TITLE && <p className="try-kicker">{QUICK_TRY_TITLE}</p>}
        <TryTitle code={test.code} title={test.title} />
        <p className="try-meta">
          {sent}Linkul merge până pe {formatDate(info.expiresAt)}
        </p>
        {phaseOf(detail) !== 'prepare' && (
          <div className="try-files">
            {test.files.test && <FileLink code={test.code} kind="test" label="Testul" name="Descarcă testul" />}
            {test.files.barem && <FileLink code={test.code} kind="barem" label="Baremul" name="Descarcă baremul" />}
          </div>
        )}
      </div>
      <ShareButton token={token} />
    </header>
  );
}

function FileLink({ code, kind, label, name }: { code: string; kind: TestFileKind; label: string; name: string }) {
  const api = useApi();
  return (
    <a className="try-file" href={testFileUrl(code, kind, undefined, api.base)} target="_blank" rel="noopener" aria-label={name}>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 3v10M5.5 8.5 10 13l4.5-4.5M4 16.5h12" />
      </svg>
      {label}
    </a>
  );
}

// The try's name as the page's title, and the form that changes it.
function TryTitle({ code, title }: { code: string; title: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const rename = useMutation({
    mutationFn: (next: string) => api.renameTest(code, next),
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['test', code] });
    },
  });
  if (draft === null) {
    return (
      <div className="try-title">
        <h1>{title}</h1>
        <button type="button" className="try-title-edit" aria-label="Schimbă numele" title="Schimbă numele" onClick={() => setDraft(title)}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
            <path d="M13.5 3.5l3 3-9 9H4.5v-3z" />
          </svg>
        </button>
      </div>
    );
  }
  const save = (event: FormEvent) => {
    event.preventDefault();
    rename.mutate(draft);
  };
  return (
    <form className="try-rename" aria-label="Schimbă numele" onSubmit={save}>
      <label className="sr-only" htmlFor="try-name">
        Numele testului
      </label>
      <input
        id="try-name"
        type="text"
        value={draft}
        maxLength={MAX_TITLE_LENGTH}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="try-rename-actions">
        <button type="submit" className="button" disabled={rename.isPending}>
          Salvează
        </button>
        <button
          type="button"
          className="button-quiet"
          onClick={() => {
            rename.reset();
            setDraft(null);
          }}
        >
          Renunță
        </button>
      </div>
      {rename.error && <ErrorMessage error={rename.error} />}
    </form>
  );
}
```

- [ ] **Step 8: Edit `src/try/TryHome.tsx`**

Find this block:

```tsx
import { Prepare } from './Prepare.tsx';
import { ShareButton } from './Share.tsx';
import { Expired, isExpired } from './TryNotice.tsx';
```

Replace it with:

```tsx
import { Prepare } from './Prepare.tsx';
import { TryHead } from './TryHead.tsx';
import { Expired, isExpired } from './TryNotice.tsx';
```

- [ ] **Step 9: Edit `src/try/TryHome.tsx`**

Find this block:

```tsx
    <section className="try-home">
      <div className="try-head">
        <div>
          <h1>Încercare rapidă</h1>
          <p className="test-sub">Corectezi o lucrare, fără cont. Linkul acestei pagini merge 7 zile.</p>
        </div>
        <ShareButton token={token} />
      </div>
      {phase === 'prepare' && <Prepare detail={detail.data} tryApi={tryApi} />}
```

Replace it with:

```tsx
    <section className="try-home">
      <TryHead detail={detail.data} info={info} token={token} />
      {phase === 'prepare' && <Prepare detail={detail.data} tryApi={tryApi} />}
```

- [ ] **Step 10: Edit `src/try/Graded.tsx`**

Find this block:

```tsx
import { Link, useLocation } from 'react-router';
import type { SubmissionDetail, TestDetail } from '../../shared/api.ts';
import { useApi } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { reviewPath } from '../admin/reviewPage/points.ts';
import { GradedResult } from '../admin/submissionPage/GradedResult.tsx';
```

Replace it with:

```tsx
import { Link, useLocation } from 'react-router';
import type { ReviewPoint, SubmissionDetail, TestDetail } from '../../shared/api.ts';
import { formatPoints } from '../../shared/scoring.ts';
import { useApi } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { pointKey, reviewPath } from '../admin/reviewPage/points.ts';
import { GradedResult } from '../admin/submissionPage/GradedResult.tsx';
```

- [ ] **Step 11: Edit `src/try/Graded.tsx`**

Find this block:

```tsx
import { countLabel } from '../ui/format.ts';
import { onTabKeyDown } from '../ui/tabKeys.ts';
import { pageFileUrl, type TryApi } from './api.ts';
import { paperOf } from './phase.ts';

type View = 'verificare' | 'profesor' | 'elev';
const VIEWS: { id: View; label: string }[] = [
  { id: 'verificare', label: 'Verificare' },
  { id: 'profesor', label: 'Rezultatul profesorului' },
  { id: 'elev', label: 'Rezultatul elevului' },
];
```

Replace it with:

```tsx
import { countLabel } from '../ui/format.ts';
import { MathText } from '../ui/MathText.tsx';
import { onTabKeyDown } from '../ui/tabKeys.ts';
import { pageFileUrl, type TryApi } from './api.ts';
import { paperOf, scoreOf } from './phase.ts';

type View = 'verificare' | 'profesor' | 'elev';
// Each view's name, and the short one a phone shows.
const VIEWS: { id: View; label: string; short: string | null }[] = [
  { id: 'verificare', label: 'Verificare', short: null },
  { id: 'profesor', label: 'Rezultatul profesorului', short: 'Profesor' },
  { id: 'elev', label: 'Rezultatul elevului', short: 'Elev' },
];
```

- [ ] **Step 12: Edit `src/try/Graded.tsx`**

Find this block:

```tsx

// The graded paper (spec §3.3, state 4), in the app's three views: the points
// to check (the app's own review), the teacher's result with its corrections,
// and the page the student would see.
export function Graded({ detail, token, tryApi }: { detail: TestDetail; token: string; tryApi: TryApi }) {
```

Replace it with:

```tsx

// The graded paper (spec §3.3, state 4): its grade and the points to check,
// then the app's three views: the points to check (each opens the app's own
// review), the teacher's result with its corrections, and the page the
// student would see. The tabs stay at the top while she scrolls.
export function Graded({ detail, token, tryApi }: { detail: TestDetail; token: string; tryApi: TryApi }) {
```

- [ ] **Step 13: Edit `src/try/Graded.tsx`**

Find this block:

```tsx
    <>
      <div className="class-tabs" role="tablist" aria-label="Lucrarea corectată" onKeyDown={(event) => onTabKeyDown(event, VIEW_IDS, view, setView, (id) => `try-tab-${id}`)}>
        {VIEWS.map(({ id, label }) => (
          <button
```

Replace it with:

```tsx
    <>
      <Summary detail={detail} />
      <div className="try-tabs" role="tablist" aria-label="Lucrarea corectată" onKeyDown={(event) => onTabKeyDown(event, VIEW_IDS, view, setView, (id) => `try-tab-${id}`)}>
        {VIEWS.map(({ id, label, short }) => (
          <button
```

- [ ] **Step 14: Edit `src/try/Graded.tsx`**

Find this block:

```tsx
            aria-controls={`try-panel-${id}`}
            className="class-tab"
            onClick={() => setView(id)}
          >
            {label}
          </button>
```

Replace it with:

```tsx
            aria-controls={`try-panel-${id}`}
            className="try-tab"
            onClick={() => setView(id)}
          >
            {short ? (
              <>
                <span className="try-tab-full">{label}</span>
                <span className="try-tab-short" aria-hidden="true">
                  {short}
                </span>
              </>
            ) : (
              label
            )}
            {id === 'verificare' && paper.flagCount > 0 && (
              <span className="try-tab-count" aria-hidden="true">
                {paper.flagCount}
              </span>
            )}
          </button>
```

- [ ] **Step 15: Edit `src/try/Graded.tsx`**

Find this block:

```tsx
      </div>
      <div role="tabpanel" id={`try-panel-${view}`} aria-labelledby={`try-tab-${view}`}>
        {view === 'verificare' && <Checking code={detail.test.code} flagCount={paper.flagCount} />}
        {view === 'profesor' && <TeacherResult code={detail.test.code} submissionId={paper.submissionId!} />}
```

Replace it with:

```tsx
      </div>
      <div className="try-panel" role="tabpanel" id={`try-panel-${view}`} aria-labelledby={`try-tab-${view}`}>
        {view === 'verificare' && <Checking code={detail.test.code} submissionId={paper.submissionId!} points={paper.reviewPoints} />}
        {view === 'profesor' && <TeacherResult code={detail.test.code} submissionId={paper.submissionId!} />}
```

- [ ] **Step 16: Edit `src/try/Graded.tsx`**

Find this block:

```tsx

// The review opens on its first point (the app's review picks it).
function Checking({ code, flagCount }: { code: string; flagCount: number }) {
  if (flagCount === 0) {
    return <p className="review-done">Toate punctele sunt verificate. Rezultatul profesorului și cel al elevului sunt gata.</p>;
  }
  return (
    <div className="try-state">
      <p>
        Robotul nu a fost sigur de {countLabel(flagCount, 'punct', 'puncte')}. Le verifici una câte una, cu pagina lucrării alături, și schimbi punctajul
        dacă e nevoie.
      </p>
      <Link className="button" to={reviewPath(code)}>
        Verifică {countLabel(flagCount, 'punct', 'puncte')}
      </Link>
    </div>
  );
```

Replace it with:

```tsx

// The grade, and what waits for her: the points the robot was not sure of
// (orange: hers to do), or nothing (green).
function Summary({ detail }: { detail: TestDetail }) {
  const paper = paperOf(detail)!;
  const score = scoreOf(detail);
  return (
    <section className="try-summary" aria-label="Rezultatul încercării">
      {score && (
        <div className="try-score">
          <span className="try-score-label">Nota</span>
          <span className="try-grade">{score.grade}</span>
          <span className="try-score-points">{score.points}</span>
        </div>
      )}
      {paper.flagCount > 0 ? (
        <div className="try-todo">
          <div>
            <p className="try-todo-title">{countLabel(paper.flagCount, 'punct nesigur', 'puncte nesigure')}</p>
            <p>Robotul nu a fost sigur de ele. Le verifici cu pagina lucrării alături și schimbi punctajul dacă e nevoie.</p>
          </div>
          <Link className="button" to={reviewPath(detail.test.code)}>
            Verifică {countLabel(paper.flagCount, 'punct', 'puncte')}
          </Link>
        </div>
      ) : (
        <div className="try-todo is-done">
          <div>
            <p className="try-todo-title">Toate punctele sunt verificate.</p>
            <p>Rezultatul profesorului și cel al elevului sunt gata.</p>
          </div>
        </div>
      )}
    </section>
  );
}

// The points to check, each with its reason; each opens the app's review at it.
function Checking({ code, submissionId, points }: { code: string; submissionId: number; points: ReviewPoint[] }) {
  if (points.length === 0) {
    return <p className="try-empty">Nu mai ai puncte de verificat. Rezultatul profesorului și cel al elevului sunt gata.</p>;
  }
  return (
    <ul className="try-points">
      {points.map((point) => {
        const name = point.kind === 'item' ? point.label : 'Pagini greu de citit';
        return (
          <li key={pointKey(point)} className="try-point">
            <span className="try-point-name">{name}</span>
            {point.kind === 'item' ? (
              <span className="try-point-score">
                {formatPoints(point.points)} din {formatPoints(point.maxPoints)}
              </span>
            ) : (
              <span className="try-point-score">{point.pages.join(', ')}</span>
            )}
            <span className="try-point-why">
              {point.kind === 'item' ? <MathText text={point.reason} /> : 'Robotul nu a putut citi aceste pagini.'}
            </span>
            <Link className="button-quiet" to={reviewPath(code, { submissionId, key: pointKey(point) })} aria-label={`Verifică ${name}`}>
              Verifică
            </Link>
          </li>
        );
      })}
    </ul>
  );
```

- [ ] **Step 17: Edit `src/try/try.css`**

Find this block:

```css
/* A Quick Try's page: the teacher app's top bar and look, in one column. */
.try-topbar {
```

Replace it with:

```css
/* A Quick Try's page: the teacher app's top bar and look, in one column of
   one width, whatever the view shows. The scrollbar's room is always kept,
   so a short view and a long one start at the same place. */
html {
  scrollbar-gutter: stable;
}

.try-topbar {
```

- [ ] **Step 18: Edit `src/try/try.css`**

Find this block:

```css
.try-page {
  max-width: 72rem;
```

Replace it with:

```css
.try-page {
  width: 100%;
  max-width: 72rem;
```

- [ ] **Step 19: Edit `src/try/try.css`**

Find this block:

```css

.try-head {
```

Replace it with:

```css

/* The head: the try's name, its times, its files and "Distribuie". */
.try-head {
```

- [ ] **Step 20: Edit `src/try/try.css`**

Find this block:

```css
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
```

Replace it with:

```css
  justify-content: space-between;
  gap: 1rem 1.5rem;
  margin-bottom: 1rem;
  padding: 1.25rem 1.5rem;
  border: 1px solid var(--rule);
  border-radius: 14px;
  background: var(--sheet);
}

.try-head-main {
  flex: 1 1 24rem;
  min-width: 0;
}

.try-kicker {
  margin: 0;
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.try-title {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.try-title h1 {
  margin: 0;
  overflow-wrap: anywhere;
}

.try-title-edit {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--muted);
  cursor: pointer;
}

.try-title-edit:hover {
  background: var(--active);
  color: var(--text);
}

.try-title-edit svg,
.try-file svg {
  width: 1.125rem;
  height: 1.125rem;
}

.try-rename {
  display: grid;
  gap: 0.5rem;
  max-width: 32rem;
}

.try-rename-actions {
  display: flex;
  gap: 0.5rem;
}

.try-meta {
  margin: 0.25rem 0 0;
  color: var(--muted);
  font-size: 0.875rem;
}

.try-files {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.try-files:empty {
  display: none;
}

.try-file {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: 2rem;
  padding: 0 0.75rem;
  border: 1px solid var(--rule);
  border-radius: 999px;
  color: var(--text);
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
}

.try-file svg {
  color: var(--ink);
}

.try-file:hover {
  border-color: var(--control);
  background: var(--raised);
}

/* The grade, and the points to check: orange is hers to do. */
.try-summary {
  display: grid;
  grid-template-columns: minmax(10rem, auto) 1fr;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.try-score {
  display: grid;
  align-content: center;
  padding: 0.75rem 1.25rem;
  border: 1px solid var(--rule);
  border-radius: 14px;
  background: var(--sheet);
}

.try-score-label,
.try-score-points {
  color: var(--muted);
  font-size: 0.875rem;
}

.try-grade {
  color: var(--ink);
  font-size: 2.5rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.try-todo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  padding: 1rem 1.25rem;
  border-radius: 14px;
  background: var(--marker);
}

.try-todo p {
  margin: 0.125rem 0 0;
  max-width: 60ch;
  font-size: 0.875rem;
}

.try-todo .try-todo-title {
  margin: 0;
  color: var(--orange);
  font-size: 1.0625rem;
  font-weight: 700;
}

.try-todo .button {
  border-color: var(--orange-mark);
  background: var(--orange-mark);
  color: var(--on-ink);
}

.try-todo.is-done {
  background: var(--ok-bg);
}

.try-todo.is-done .try-todo-title {
  color: var(--ok-fg);
}

/* The three views: tabs that stay at the top while she scrolls. */
.try-tabs {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1.25rem;
  overflow-x: auto;
  scrollbar-width: none;
  background: var(--paper);
  box-shadow: inset 0 -1px 0 var(--rule);
}

.try-tab {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.5rem;
  height: 2.75rem;
  padding: 0 0.875rem;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.try-tab:hover {
  color: var(--text);
}

.try-tab[aria-selected="true"] {
  border-bottom-color: var(--ink);
  color: var(--text);
}

.try-tab-short {
  display: none;
}

.try-tab-count {
  display: inline-grid;
  place-items: center;
  min-width: 1.375rem;
  height: 1.375rem;
  padding: 0 0.375rem;
  border-radius: 999px;
  background: var(--orange-mark);
  color: var(--on-ink);
  font-size: 0.75rem;
  font-weight: 700;
}

.try-panel {
  min-height: 24rem;
}

/* The points to check, one row each. */
.try-points {
  display: grid;
  gap: 0.625rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.try-point {
  display: grid;
  grid-template-columns: minmax(6rem, 12rem) 6rem 1fr auto;
  align-items: center;
  gap: 0.5rem 1rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--rule);
  border-left: 4px solid var(--orange-mark);
  border-radius: 10px;
  background: var(--sheet);
}

.try-point-name {
  font-weight: 700;
}

.try-point-score {
  color: var(--orange);
  font-weight: 700;
}

.try-point-why {
  color: var(--muted);
  font-size: 0.875rem;
}

.try-empty {
  color: var(--muted);
}

/* Narrow: "Distribuie" goes under the name, on the left. */
@media (max-width: 48rem) {
  .try-head .try-share {
    justify-items: start;
    max-width: none;
    text-align: left;
  }
}

@media (max-width: 40rem) {
  .try-head {
    padding: 1rem;
  }

  .try-summary {
    grid-template-columns: 1fr;
  }

  .try-point {
    grid-template-columns: 1fr auto;
  }

  /* The tabs' short names, so the three fit on a phone; the full name stays for screen readers. */
  .try-tab-full {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .try-tab-short {
    display: inline;
  }

  .try-point-why {
    grid-column: 1 / -1;
  }
}
```

- [ ] **Step 21: Edit `src/try/try.css`**

Find this block:

```css
  gap: 0.25rem;
  max-width: 22rem;
  text-align: right;
```

Replace it with:

```css
  gap: 0.25rem;
  max-width: 16rem;
  text-align: right;
```

- [ ] **Step 22: Run the tests to see them pass**

Run: `npx vitest run src/try`
Expected: PASS, `Tests  60 passed (60)`.

- [ ] **Step 23: Typecheck and run all tests**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  163 passed | 1 skipped (164)`, `Tests  2375 passed | 3 skipped (2378)`.

- [ ] **Step 24: Commit**

```bash
git add src/test/fakeTryApi.tsx src/try/TryHead.test.tsx src/try/Graded.test.tsx src/try/TryApp.test.tsx src/try/TryHead.tsx src/try/TryHome.tsx src/try/Graded.tsx src/try/try.css
git commit -m "Give the Quick Try page one head with the try's name, times and files, the grade and the points to check, and tabs that stay at the top"
```

Check: `git diff --stat refs/protoqtd/d5 HEAD -- . ':!docs/superpowers/plans'` prints nothing.

### Task 6: The spec and the notes

**Files:**
- Modify: `docs/superpowers/specs/2026-11-09-quick-try-design.md`, `AGENTS.md`, `src/AGENTS.md`

- [ ] **Step 1: Edit `docs/superpowers/specs/2026-11-09-quick-try-design.md`**

Find this block:

```markdown
- A prominent button next to the existing calls to action, for example "Încearcă acum, fără cont" **(builder call: exact words)**. The landing page has no React today; keep it that way if practical (the form can be a small script or a separate page; see "Left to the builder").
- After she sends a try, the visitor stays on the landing page **(owner)**. Under the button: a live status ("Se corectează…", "Baremul este gata", "Lucrarea este corectată") and a link to the try's page. She may open the link at any time, or wait.
- The link and the time it was made are kept in `localStorage` on her device for 7 days **(owner)**. A new try on a later day replaces the stored link. After 7 days the landing page stops showing it.
```

Replace it with:

```markdown
- A prominent button next to the existing calls to action, for example "Încearcă acum, fără cont" **(builder call: exact words)**. The landing page has no React today; keep it that way if practical (the form can be a small script or a separate page; see "Left to the builder").
- The button sits under "Intră în cont", as wide as it, with one line under it: "Gratuit: trimiți lucrarea unui elev și o primești corectată în câteva minute." **(owner, design review 2026-11-10)**. The line hides with the button.
- After she sends a try, the visitor stays on the landing page **(owner)**. Under the button: a card of her try **(owner, design review 2026-11-10)** with its name, when she sent it and until when its link works, a tag of its state (blue while the robot works, orange when she has something to do, green when it is graded and checked, grey when it failed), a line on the state ("Se corectează…", "Baremul este gata", "Lucrarea este corectată"), the grade once the paper is graded, and "Deschide încercarea". She may open the link at any time, or wait.
- The link and the time it was made are kept in `localStorage` on her device for 7 days **(owner)**. A new try on a later day replaces the stored link. After 7 days the landing page stops showing it.
```

- [ ] **Step 2: Edit `docs/superpowers/specs/2026-11-09-quick-try-design.md`**

Find this block:

```markdown

A window (modal) over the landing page **(builder call, made in design)** with three inputs:

1. The test file. **Required (owner).**
```

Replace it with:

```markdown

A window (modal) over the landing page **(builder call, made in design)** with an optional name and three files:

0. "Numele testului (opțional)" **(owner, design review 2026-11-10)**. Empty: the test file's name without its extension. Neither: the default name "Încercare rapidă". At most 120 characters, like a test title.
1. The test file. **Required (owner).**
```

- [ ] **Step 3: Edit `docs/superpowers/specs/2026-11-09-quick-try-design.md`**

Find this block:

```markdown
The student may have written on the test sheet itself; that is fine, because the clean test file tells the robot what was printed.

```

Replace it with:

```markdown
The student may have written on the test sheet itself; that is fine, because the clean test file tells the robot what was printed.

Each file is a row in the app's style, not the browser's file button **(owner, design review 2026-11-10)**: what to choose, then the chosen file's name and size (the pages: their count and names). The real file inputs stay in the form, out of sight but reachable with the keyboard.

```

- [ ] **Step 4: Edit `docs/superpowers/specs/2026-11-09-quick-try-design.md`**

Find this block:

```markdown

1. **Robot barem in progress** (only when she asked for one).
```

Replace it with:

```markdown

Its head is the same in every state and view **(owner, design review 2026-11-10)**: the try's name (a pencil button renames it), when it was sent to grading (or started, before that), until when its link works, the test and the barem to download (once the grading started; before, the files part of the page has them), and "Distribuie". The page keeps one width in every view, so changing views moves nothing sideways.

1. **Robot barem in progress** (only when she asked for one).
```

- [ ] **Step 5: Edit `docs/superpowers/specs/2026-11-09-quick-try-design.md`**

Find this block:

```markdown
3. **Grading in progress.** Expect a few minutes: the robot starts in about a minute, then makes the exercise list and grades.
4. **Graded.** Three views **(owner)**:
   - **Verification:** the unsure points and unreadable pages to check, with the photos beside the points, and points she can change. It mirrors the app's review page.
   - **Teacher result:** the paper's full result as the teacher sees it in the app (points per exercise, explanations, notes).
```

Replace it with:

```markdown
3. **Grading in progress.** Expect a few minutes: the robot starts in about a minute, then makes the exercise list and grades.
4. **Graded.** Above the views, the grade and the points to check **(owner, design review 2026-11-10)**: "N puncte nesigure" with "Verifică N puncte" in orange (hers to do), or, in green, that every point is checked. Then three views, whose tabs stay at the top while she scrolls; the Verificare tab counts the points left **(owner)**:
   - **Verification:** the unsure points and unreadable pages to check, one row each with its points and the robot's reason; each row opens the app's review page at that point, with the photos beside the points, and points she can change.
   - **Teacher result:** the paper's full result as the teacher sees it in the app (points per exercise, explanations, notes).
```

- [ ] **Step 6: Edit `AGENTS.md`**

Find this block:

```markdown
- Every `/api/admin` and `/api/u` request first runs the `promoteDue` middleware. A router added under them keeps it.
- Quick Try (`docs/superpowers/specs/2026-11-09-quick-try-design.md`, migration 0026): one free grading without an account, at `/api/try`. Each try is a hidden guest teacher (`teachers.quick_try`, disabled, never an account) with its own class, student, test (`tests.quick_try`) and paper; its link `/api/try/<token>` serves the teacher API's own routes for that guest teacher behind an allow-list (`ALLOWED` in `server/routes/quickTry.ts`). A Quick Try test never gets a print job or a class analysis. The limits (`QUICK_TRY_IP_LIMIT` per IP and `QUICK_TRY_DAILY_LIMIT` in total per Bucharest day, `shared/quickTry.ts`) are checked in the SQL of the try's first INSERT (`createQuickTry`); a failed try gives its IP place back, not its daily place. An administrator skips Turnstile and the limits and is not counted. One try makes bounded robot work, checked in the writes' SQL: one barem generation, only with no barem (`requestBarem`), and at most `QUICK_TRY_FILE_CHANGES` changes of its test and barem files (`saveTestFile`). The try's page is `/try/<token>` (`src/try/`), private like a student link: `_headers` gives it noindex and `robots.txt` closes `/try/` in every group. A try is deleted once its 7 days are over: each visit of the landing page (`GET /api/try/availability`) deletes, after its answer, up to `QUICK_TRY_CLEANUP_BATCH` such tries picked in random order, their R2 files first, then the rows of each try in its own batch (`cleanUpTries`, `server/quickTryCleanup.ts`).
- R2 is private: every file goes through the API with an ownership check. R2 keys come from rows, never from listing R2.
```

Replace it with:

```markdown
- Every `/api/admin` and `/api/u` request first runs the `promoteDue` middleware. A router added under them keeps it.
- Quick Try (`docs/superpowers/specs/2026-11-09-quick-try-design.md`, migration 0026): one free grading without an account, at `/api/try`. Each try is a hidden guest teacher (`teachers.quick_try`, disabled, never an account) with its own class, student, test (`tests.quick_try`) and paper; its link `/api/try/<token>` serves the teacher API's own routes for that guest teacher behind an allow-list (`ALLOWED` in `server/routes/quickTry.ts`). A Quick Try test never gets a print job or a class analysis. The limits (`QUICK_TRY_IP_LIMIT` per IP and `QUICK_TRY_DAILY_LIMIT` in total per Bucharest day, `shared/quickTry.ts`) are checked in the SQL of the try's first INSERT (`createQuickTry`); a failed try gives its IP place back, not its daily place. An administrator skips Turnstile and the limits and is not counted. A try has a name (`title` of `POST /api/try`, the form's name or the test file's name; empty gives `QUICK_TRY_TITLE`), and its page may rename it (`PATCH /tests/<code>` is on the allow-list). One try makes bounded robot work, checked in the writes' SQL: one barem generation, only with no barem (`requestBarem`), and at most `QUICK_TRY_FILE_CHANGES` changes of its test and barem files (`saveTestFile`). The try's page is `/try/<token>` (`src/try/`), private like a student link: `_headers` gives it noindex and `robots.txt` closes `/try/` in every group. A try is deleted once its 7 days are over: each visit of the landing page (`GET /api/try/availability`) deletes, after its answer, up to `QUICK_TRY_CLEANUP_BATCH` such tries picked in random order, their R2 files first, then the rows of each try in its own batch (`cleanUpTries`, `server/quickTryCleanup.ts`).
- R2 is private: every file goes through the API with an ownership check. R2 keys come from rows, never from listing R2.
```

- [ ] **Step 7: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/GradingProgress.tsx` is the grading bar (blue graded, pale blue waiting, empty track not sent) under the test page's uploads heading only (the Teste page shows the stage bar instead); "✓ Corectat complet" shows when every sent paper is graded. The bar is `aria-hidden`: the counts stay in words. `EvaluationControls` shows "Marchează ca terminat" in place of the start button when a paper is graded and none waits.
- `landing/`: the landing page (`index.html`) in the look of the redesign, with its own tokens (`landing.css`) and one script (`landing.ts`): the theme button and Quick Try. `landing/quickTry/` is the Quick Try button, its form in a `<dialog>` and the status line of the visitor's try, with no React: `ui.ts` works on the page's own elements, `send.ts` checks and sends the form (with her barem the grading starts at once; with the robot's she starts it on the try's page), `status.ts` says where the try stands and whether the button shows (one try per device per Bucharest day in `localStorage`, `storage.ts`, unless it failed; an administrator always), and `turnstile.ts` loads Cloudflare's check. The page's security policy allows no inline script or style, and only Turnstile's script and frame from elsewhere; `landing.test.ts` checks that, and Laura Miron's texts word for word. "Cere un cont de profesor" opens `/teacher/#cont-nou`, which `LoginPage` shows as "Cont nou de profesor". The login page repeats the heading, the line and the six stages: a change to them in `index.html` goes into `admin/wayIn/WayIn.tsx` too.
- Light is the default theme on every page: `public/theme.js` and `currentTheme()` follow only a saved choice, never the system setting.
- `upload/`: the student app. `api.ts` (the only code that calls `/api/u`, with XMLHttpRequest for upload progress), `session.ts` (the phone's secret in localStorage), `shrink.ts` (photos made smaller on the phone). `StudentResult.tsx` takes `fileUrl`, so a Quick Try's page shows the same student result.
- `try/`: a Quick Try's page (`/try/<token>`, spec `docs/superpowers/specs/2026-11-09-quick-try-design.md` §3.3). It reuses the teacher app through `createApiClient({ base: '/api/try/<token>' })`: the calls and the file links (`AdminApi.base`) go to the try's link, and only the calls of the server's allow-list are used (`TRY_ADMIN_CALLS` in `test/fakeTryApi.tsx`, whose `tryAdminApi()` makes a page test fail on any other call). `api.ts` is the try's own client (`info`, the student's pages, `start`, the student `result`). `phase.ts` says where the try stands from its test (`prepare`, `grading`, `problem`, `failed` as the server's give-back, `graded`) and reads it again every 10 s while the robot works. `Prepare.tsx` holds the test, the barem (her own, or the robot's to download, then "Pornește corectarea" with its `filesVersion`), the student's pages and the file changes left; `Working.tsx` the grading, the barem's problem ("Folosește oricum" or another barem) and the failure (no retry); `Graded.tsx` the three views: "Verificare" (the teacher app's own `ReviewPage`, at `/teste/<code>/verificare` inside the try's router; its links to `/teste/<code>` come back to the try, `#rezultate` opens the teacher's result), "Rezultatul profesorului" (`GradedResult` and `PageFiles`) and "Rezultatul elevului" (`StudentResult`, checked with `expectNoGradingWords()`). "Distribuie" (`Share.tsx`) shares or copies the try's link. The page never shows the test's upload link or a QR code.
- `test/`: test setup, the fake APIs (`fakeApi.ts`, `fakeUploadApi.ts`; `createFakeApi({ me, accounts })` sets the logged-in teacher, an administrator by default), `renderAdmin()`, `expectNoGradingWords()`.
```

Replace it with:

```markdown
- `ui/GradingProgress.tsx` is the grading bar (blue graded, pale blue waiting, empty track not sent) under the test page's uploads heading only (the Teste page shows the stage bar instead); "✓ Corectat complet" shows when every sent paper is graded. The bar is `aria-hidden`: the counts stay in words. `EvaluationControls` shows "Marchează ca terminat" in place of the start button when a paper is graded and none waits.
- `landing/`: the landing page (`index.html`) in the look of the redesign, with its own tokens (`landing.css`) and one script (`landing.ts`): the theme button and Quick Try. `landing/quickTry/` is the Quick Try button (under "Intră în cont"), its form in a `<dialog>` and the card of the visitor's try, with no React: `ui.ts` works on the page's own elements (the file rows: a hidden real input in each `[data-try-pick]` label, filled by `showPick`), `send.ts` checks and sends the form and names the try (`tryTitle`; with her barem the grading starts at once; with the robot's she starts it on the try's page), `status.ts` says where the try stands (the card's line, tag and tone) and whether the button shows (one try per device per Bucharest day in `localStorage`, `storage.ts`, unless it failed; an administrator always), and `turnstile.ts` loads Cloudflare's check. The page's security policy allows no inline script or style, and only Turnstile's script and frame from elsewhere; `landing.test.ts` checks that, and Laura Miron's texts word for word. "Cere un cont de profesor" opens `/teacher/#cont-nou`, which `LoginPage` shows as "Cont nou de profesor". The login page repeats the heading, the line and the six stages: a change to them in `index.html` goes into `admin/wayIn/WayIn.tsx` too.
- Light is the default theme on every page: `public/theme.js` and `currentTheme()` follow only a saved choice, never the system setting.
- `upload/`: the student app. `api.ts` (the only code that calls `/api/u`, with XMLHttpRequest for upload progress), `session.ts` (the phone's secret in localStorage), `shrink.ts` (photos made smaller on the phone). `StudentResult.tsx` takes `fileUrl`, so a Quick Try's page shows the same student result.
- `try/`: a Quick Try's page (`/try/<token>`, spec `docs/superpowers/specs/2026-11-09-quick-try-design.md` §3.3). It reuses the teacher app through `createApiClient({ base: '/api/try/<token>' })`: the calls and the file links (`AdminApi.base`) go to the try's link, and only the calls of the server's allow-list are used (`TRY_ADMIN_CALLS` in `test/fakeTryApi.tsx`, whose `tryAdminApi()` makes a page test fail on any other call). `api.ts` is the try's own client (`info`, the student's pages, `start`, the student `result`). `phase.ts` says where the try stands from its test (`prepare`, `grading`, `problem`, `failed` as the server's give-back, `graded`), reads it again every 10 s while the robot works, and gives the graded paper's grade (`scoreOf`, also used by the landing card). `TryHead.tsx` is the head of every state: the name with its rename, the times, the test and barem to download, "Distribuie". `Prepare.tsx` holds the test, the barem (her own, or the robot's to download, then "Pornește corectarea" with its `filesVersion`), the student's pages and the file changes left; `Working.tsx` the grading, the barem's problem ("Folosește oricum" or another barem) and the failure (no retry); `Graded.tsx` the grade and the points to check, then the three views under tabs that stay at the top (`try-tabs`, the page's own; `try.css` keeps the scrollbar's room so views of any height start at the same place): "Verificare" (the points to check, each opening the teacher app's own `ReviewPage` at `/teste/<code>/verificare` inside the try's router; its links to `/teste/<code>` come back to the try, `#rezultate` opens the teacher's result), "Rezultatul profesorului" (`GradedResult` and `PageFiles`) and "Rezultatul elevului" (`StudentResult`, checked with `expectNoGradingWords()`). "Distribuie" (`Share.tsx`) shares or copies the try's link. The page never shows the test's upload link or a QR code.
- `test/`: test setup, the fake APIs (`fakeApi.ts`, `fakeUploadApi.ts`; `createFakeApi({ me, accounts })` sets the logged-in teacher, an administrator by default), `renderAdmin()`, `expectNoGradingWords()`.
```

- [ ] **Step 8: Build and run all tests**

Run: `npm run build`, then `npm test`
Expected: no type errors, the build ends without errors; `Test Files  163 passed | 1 skipped (164)`, `Tests  2375 passed | 3 skipped (2378)`.

- [ ] **Step 9: Commit**

```bash
git add docs/superpowers/specs/2026-11-09-quick-try-design.md AGENTS.md src/AGENTS.md
git commit -m "Write the Quick Try design review into the spec and the notes"
```

Check: `git diff --stat refs/protoqtd/d6 HEAD -- . ':!docs/superpowers/plans'` prints nothing.

### Task 7: Check in the browser, push

Runs in the main session. The push waits for the user.

- [ ] **Step 1: Run everything once more, also in UTC**

Run: `npm run build`, `npm test`, then in Git Bash `TZ=UTC npm test` (PowerShell: `$env:TZ='UTC'; npm test; Remove-Item Env:TZ`)
Expected: no type errors; `Test Files  163 passed | 1 skipped (164)`, `Tests  2375 passed | 3 skipped (2378)`. both times.

- [ ] **Step 2: Look at both pages in the browser**

Run `npm run db:local`, then the `preview` server of `.claude/launch.json` (http://127.0.0.1:8788; if port 8788 is taken by an old `workerd.exe`, see root `AGENTS.md`, "Gotchas"). As the local administrator (`DEV_TEACHER_EMAIL`), open http://127.0.0.1:8788/ at 375 px and at 1280 px, in light and dark.
Expected: "Încearcă acum, fără cont" under "Intră în cont", as wide, with the line under it. In the form, the name field and three file rows; files set with a `DataTransfer` in the console show their names, sizes and a green tick. After "Trimite", the card shows the name (the test file's, without its extension), "Trimisă …", the blue tag "Se corectează" and "Deschide încercarea". Grade the paper by hand in the local D1 (an `evaluations` row of 100 points with a grade of 6.7 and two `evaluation_items` with `needs_review = 1`; the submission `graded`, the test `done`). The card then has the orange tag "2 puncte de verificat" and "6,7". The try's page shows the head (name, pencil, times, "Testul", "Baremul", "Distribuie"), the grade box, the orange box with "Verifică 2 puncte", the tabs with the count 2, and the two points with their reasons. Switching tabs moves nothing sideways (`.try-panel` keeps its `left` and `width`); scrolling the teacher's result keeps the tabs at the top. At 375 px, the tabs read "Verificare", "Profesor", "Elev", "Distribuie" is on the left, and `document.documentElement.scrollWidth` equals `clientWidth` on both pages. Fix what is broken as its own commit, with a test where the fault is in code, and say so in the PR.

- [ ] **Step 3: Ask the user, then push and open the pull request**

Ask the user first. Then: `git push -u origin feature/quick-try-design` and open a pull request to `main` titled "Quick Try: design review". The body says: no migration and no new secret; the try now has a name (the form's field or the test file's name) and its page renames it; the landing button moved under "Intră în cont"; the landing card and the try page's head, grade and points; the teacher's and the student's result views are unchanged; one try that cannot be deleted no longer blocks the cleanup.

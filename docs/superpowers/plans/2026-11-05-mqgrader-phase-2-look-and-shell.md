# MQGrader Phase 2: Look and Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 8 must run in the main session, not in a subagent:** it looks at the app in a browser, and every outward step (push, pull request) needs the user's explicit yes.

**Goal:** The teacher app and the student pages take the look of the redesign (Schibsted Grotesk, flat cool-grey and white surfaces, one blue, orange only for what waits, the mark "Trei subiecte"), and the teacher app gets its new shell: the 80px bar on the left (Test nou, Teste, Clase, De făcut, Setări), the top bar (the lockup "MQGrader by Laura Miron", the school year, the theme, the initials menu), the panels "Clasele tale" and "Ce ai de făcut", and on a phone a bar at the bottom with a ☰ menu for the rest.

**Architecture:** The look lives in `src/ui/brand.css`: the token values change, the token names stay (pages of later phases still read them), and the dark values stay written twice. The shell lives in `src/admin/shell/` and is drawn by `src/admin/Layout.tsx`, which keeps one panel open at a time (a panel closes on Esc, on ×, and on a new page). "De făcut" is a pure function of the tests list (`src/admin/shell/todo.ts`); the API adds one field to that list, `barem`, so the first of its three cases can be known. The phone layout is CSS on the same elements, plus one menu component under ☰. No page content changes: Phases 3 to 7 redesign the pages.

**Tech Stack:** Node 24, TypeScript, React 19, TanStack Query, React Router, Vitest 5, Testing Library, Hono 4, Cloudflare D1. No new npm dependencies, no migration.

**Spec:** `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md` (§1 decisions 16-19, §2 look, §4 shell, §5 "De făcut", §10 student pages, §13 phase 2). Task 1 writes the decisions of 2026-11-04 into it. Root `AGENTS.md`, `src/AGENTS.md` and `server/AGENTS.md` hold the project rules. The approved prototypes: round 5 (Z3.1, the desktop shell) https://claude.ai/artifact/JfoJqXjZVryZCHebhG8QHw and round 6 (M2, the phone) https://claude.ai/artifact/9L44SEwAxWb7Fxe1Hra4S9.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- Student pages show only the mark and "MQGrader" in their header: no byline, no other brand text, no link, and no word that says how the work is graded (`expectNoGradingWords()`).
- The pages' security policy (`public/_headers`): `script-src 'self'`; `style-src 'self' https://fonts.googleapis.com`; `font-src https://fonts.gstatic.com`. No inline `<script>` and no `<style>` in the HTML files.
- Light is the default theme on every page; the choice is kept in `localStorage` under `quickeval.theme` (`public/theme.js`, unchanged).
- Flat colours only: no gradient anywhere in `brand.css`; a shadow only on what floats (panels, menus). The dark values are written twice (`:root[data-theme="dark"]` and `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`), equal.
- No search box in the top bar (spec §11: search is not designed yet).
- Every teacher query is scoped by the teacher's id (the one server change here only adds a column to a scoped query).
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A` (the checkout holds local files that must not be committed: a `.gitignore` line, `.claude/launch.json` entries).
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root `D:\Projects\QuickEval`, on the branch `feature/mqgrader-look-and-shell`. Run `npm test` alone, in the foreground: `runner/run.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy, on `main` too. If only those time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts` alone: `Test Files  2 passed (2)`, `Tests  84 passed (84)`; then run `npm test` again with nothing else running. Before Task 4 sets Testing Library's waits to 3 s, a page test (`findBy…`, 1 s) can time out the same way under load, on `main` too (seen: `AccountsSection.test.tsx`, "Așteaptă aprobarea"): run that file alone, then the whole suite again with nothing else running.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; overwrite all of it with exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/proto6/s1` … `refs/proto6/s7`, one per task, on `refs/proto6/sbase` (the same files as `main` at `8f3e7b1`). After Task N, `git diff --stat refs/proto6/sN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`). Four tests run the real pandoc (`runner/baremDocx.test.ts`, `runner/baremTask.test.ts`, `runner/workdir.test.ts`): without pandoc they skip too, so every total shows 4 fewer passed and 4 more skipped.

## Rulings made while planning

These were decided with the user on 2026-11-04 or while building the prototype; Task 1 writes the first four into the spec.

1. The app and the student pages take the mark "Trei subiecte" too (the user: "for now"), and the favicon draws it. The byline stays "by Laura Miron".
2. The phone layout is round 6, design M2: the four items of the bar at the bottom of the screen, ☰ for Setări, the school year, the theme and the account.
3. "De făcut" ships in Phase 2 with its three cases. `TestSummary` gains `barem` (it was on `TestInfo` only), so the tests list says when a generated barem waits.
4. No search box until search is designed.
5. The token names stay and only their values change: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits. New tokens: `--raised`, `--active`, `--line`, `--control`, `--on-ink`, `--ink-tint`, `--orange`, `--orange-mark`, `--mk-a`, `--mk-b`, `--float`, `--radius`, `--radius-panel`. Gone: `--grid`, `--cell`, `--margin-x`, `--marker-edge`, `--mark-from`, `--mark-to`, `--mark-tick`, `--hand` (and with it the Caveat font, which drew only the old menu).
6. `.tag` is grey by default; `.tag-wait` (orange) marks only what waits on the teacher ("de verificat" on Teste and on the class report).
7. The old footer goes. The demo line stays at the top of the page, under the top bar.
8. "Clasele tale" lists the classes that are not archived; "+ Clasă nouă" and "Arhivate (n)" open the page Clase (`/clase`), which stays until Phase 7. A test in "De făcut" shows in it in orange, with its stage and what waits ("Logaritmi · Rezultate · nepublicate").
9. The tests list is read again after every change the teacher makes (the mutation cache, as for the demo line) and every minute while a page is open (the robot ends a grading on its own).
10. Body text is 15px, and 16px below 900px (the phone layout): a phone zooms into a field under 16px.
11. Testing Library's waits last 3 s (`src/test/setup.ts`): with the whole suite running, the first render of a test page took close to the old 1 s limit, and the shell pushed it over.
12. The theme button and the phone menu's switch share one state (`src/ui/useTheme.ts`), so a change in one shows in the other.

## Review Focus

1. A class or test with a long name in the panels and in the phone menu: the text wraps inside its card; the panel scrolls, the page never scrolls sideways (checked in Task 8 at 390px).
2. On a phone, the last control of every page stays above the bottom bar (`main` keeps the bar's height as padding; checked in Task 8 with a measurement on each page).
3. The keyboard: Esc closes the open panel or menu, and the focus goes back to the button that opened the panel (test in Task 4).
4. The robot finishes a grading while the teacher looks at another page: the number on "De făcut" follows within a minute, and right after any change the teacher makes (test in Task 5).
5. A teacher who is not an administrator sees no Setări, on a desktop and in the phone menu (tests in Tasks 4 and 6).

---

### Task 1: The decisions of 2026-11-04 in the spec

The redesign spec gets the Phase 2 choices: the mark and byline, the phone layout (M2), "De făcut" in Phase 2 with its API field, no search box; and §4 and §5 say exactly what the shell and "De făcut" do.

**Files:**
- Modify: `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`

**Interfaces:**
- Produces: the spec text the later tasks build (§4 shell, §5 the three cases of "De făcut").

- [ ] **Step 1: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown

Date: 2026-11-04. Status: agreed with the user after five rounds of prototypes. Phase 1 (landing page and light theme) is being built; the other phases are not.

```

Replace it with:

```markdown

Date: 2026-11-04. Status: agreed with the user after six rounds of prototypes. Phase 1 (landing page and light theme) is live; Phase 2 (look and shell) is being built; the other phases are not.

```

- [ ] **Step 2: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown

The prototypes are static HTML in `docs/design-proposals/round-1` to `round-5` (git-ignored, on the developer's PC) and online as private pages: round 3 https://claude.ai/artifact/Qr3qcjNTTqk43rJqRBa6m5, round 4 https://claude.ai/artifact/WGhwJYiScewGpZpnXM3fGk, round 5 https://claude.ai/artifact/JfoJqXjZVryZCHebhG8QHw. This document holds every decision, so the build does not depend on them.

```

Replace it with:

```markdown

The prototypes are static HTML in `docs/design-proposals/round-1` to `round-5` (git-ignored, on the developer's PC) and online as private pages: round 3 https://claude.ai/artifact/Qr3qcjNTTqk43rJqRBa6m5, round 4 https://claude.ai/artifact/WGhwJYiScewGpZpnXM3fGk, round 5 https://claude.ai/artifact/JfoJqXjZVryZCHebhG8QHw, round 6 (the phone menu) https://claude.ai/artifact/9L44SEwAxWb7Fxe1Hra4S9. This document holds every decision, so the build does not depend on them.

```

- [ ] **Step 3: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
15. The landing page keeps the dark band behind Laura's text (round 3 version).

```

Replace it with:

```markdown
15. The landing page keeps the dark band behind Laura's text (round 3 version).
16. The app and the student pages take the mark "Trei subiecte" too, for now; the byline stays "by Laura Miron" (Phase 2).
17. On a phone, a bar at the bottom of the screen holds the four items of the 80 px bar, and ☰ holds the rest (round 6, design M2).
18. "De făcut" comes with the shell, in Phase 2, with all three of its cases; the tests list of the API says when a generated barem waits.
19. No search box until search is designed (§11).

```

- [ ] **Step 4: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown

`--mk-a` is blue and `--mk-b` is orange-mark; on the dark band they are #80b1ff and #ff8a3d. The user has not confirmed it as the final mark (see §12). The current ring-and-tick mark stays in the app until the shell is rebuilt (Phase 2).

```

Replace it with:

```markdown

`--mk-a` is blue and `--mk-b` is orange-mark; on the dark band they are #80b1ff and #ff8a3d. From Phase 2 it is also the mark of the teacher app and the student pages (`src/ui/BrandMark.tsx`) and the favicon (`public/favicon.svg`). It may still change (§12); those files and the landing page are the only places that draw it.

```

- [ ] **Step 5: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown

- A bar of 80 px on the left, from top to bottom: "Test nou" (a blue square with +, the word under it), "Teste" (link), "Clase" (opens the panel "Clasele tale"), "De făcut" (opens the panel "Ce ai de făcut"; a number shows how many things wait), and at the bottom "Setări" (only for an administrator, as `adminOnly` is today). Each item has its icon and a short word under it.
- A top bar over the page: the lockup, search, the school year, the theme button, and the user's initials, which open "Contul meu" and "Ieși din cont".
- The panels open beside the bar, over the page, 384 px wide. Only one is open at a time; Esc and × close it. Small menus (Schimbă clasa, ⋯) close on a click outside them.
- On a phone the bars hide behind a ☰ menu (not designed yet, §11). A panel then covers the screen.

```

Replace it with:

```markdown

- A bar of 80 px on the left (the menu "Meniu"), from top to bottom: "Test nou" (a blue square with +, the word under it; to `/teste/nou`), "Teste" (link; current on every `/teste` page), "Clase" (opens the panel "Clasele tale"; marked on every `/clase` page), "De făcut" (opens the panel "Ce ai de făcut"; a number shows how many things wait), and at the bottom "Setări" (only for an administrator, as `adminOnly` is today). Each item has its icon and a short word under it.
- A top bar over the page: the lockup (the mark sits at the top of the 80 px bar, "MQGrader" and "by Laura Miron" start the top bar), the school year, the theme button, and the user's initials, which open a small menu with the name and email, "Contul meu" and "Ieși din cont". No search box until search is designed (§11). The old footer goes.
- The panels open beside the bar, over the page, 384 px wide. Only one is open at a time; Esc and × close it, and so does opening a page. Small menus (the initials, Schimbă clasa, ⋯) close on a click outside them and on Esc.
- "Clasele tale": the classes of the chosen school year that are not archived, each with its number of students and its tests in work (draft, open, in evaluation, or done with a thing in "De făcut"); a test in "De făcut" is orange; the class of the page is marked. "+ Clasă nouă" and "Arhivate (n)" open the page Clase (`/clase`) until Phase 7 replaces it.
- "Ce ai de făcut": one card per thing in "De făcut" (§5): the stage as a pill, the test and its class, what to do, one sentence, and one button to the test; the first card's button is the filled one. Under them, how many other tests of the year are in work. With nothing: "Nimic nu te așteaptă acum."
- The demo line stays at the top of the page, under the top bar.
- On a phone (below 900 px; round 6, design M2): the top bar holds the lockup and ☰. The 80 px bar becomes a bar at the bottom of the screen with the same four items in the same order (Test nou, Teste, Clase, De făcut with its number); Setări leaves it. ☰ drops a menu from the top bar: Setări (administrators), the school year, "Temă întunecată" (a switch), the user's name and email, "Contul meu" and "Ieși din cont". The panels cover the screen between the two bars.

```

- [ ] **Step 6: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
- "În lucru" and "Terminate" (archived ones with `?arhivate=1`, as today): a table with the test (name, class, start), the stage (a bar of six segments: blue done, orange waits on the teacher, pale in progress, grey later; the stage name and its state), the papers (sent of students), and the next step (one button, or "Nimic de făcut acum").
- "De făcut" counts exactly three cases: a generated barem waiting for "Am verificat baremul"; points to check after the grading; checked results that are not published. Phase 3 checks that the tests list of the API returns what these need.

```

Replace it with:

```markdown
- "În lucru" and "Terminate" (archived ones with `?arhivate=1`, as today): a table with the test (name, class, start), the stage (a bar of six segments: blue done, orange waits on the teacher, pale in progress, grey later; the stage name and its state), the papers (sent of students), and the next step (one button, or "Nimic de făcut acum").
- "De făcut" counts exactly three cases, from the tests of the chosen school year that are not archived (`src/admin/shell/todo.ts`, Phase 2):
  - Pregătire, "Verifică baremul generat": a draft or open test whose generated barem waits for "Am verificat baremul" (`barem.unchecked`, no request running). The tests list carries `barem` from Phase 2.
  - Verificare, "Decide N puncte nesigure": a test with points to check (`flagCount` above 0).
  - Rezultate, "Publică rezultatele": a done test with nothing to check, at least one graded paper, the results not open, and not every graded paper published one by one.

```

- [ ] **Step 7: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown

The phone ☰ menu; the "Test nou" form; Setări; login and sign-up; Contul meu; the first visit of a new teacher and the empty states; an archived class; the student's history page; the class report page; search and its results; where the demo account line goes.

```

Replace it with:

```markdown

Search and its results (no box in the top bar until then); the "Test nou" form; Setări; login and sign-up; Contul meu; the first visit of a new teacher and the empty states; an archived class; the student's history page; the class report page; where the demo account line goes (Phase 2 keeps it at the top of the page).

```

- [ ] **Step 8: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown

- "by Laura Miron" (the user's words) or "de Laura Miron" (Romanian).
- The final mark: the user found the current ring-and-tick mark too common and liked "Score ring" and "Ring and tick" in the brand study; the prototypes use "Trei subiecte" (§2.4), not confirmed.
- "Use Z2 design for tests" was read as the Teste page of Z2 (§5), not the blocks per test inside a class.
```

Replace it with:

```markdown

- The final mark: the user found the old ring-and-tick mark too common and liked "Score ring" and "Ring and tick" in the brand study; the prototypes use "Trei subiecte" (§2.4), which the user chose for Phase 2 "for now".
- Settled: the byline stays "by Laura Miron" (asked on 2026-11-04).
- "Use Z2 design for tests" was read as the Teste page of Z2 (§5), not the blocks per test inside a class.
```

- [ ] **Step 9: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
1. Landing page and the light default theme. The app keeps its current look.
2. Look and shell: tokens, type, mark and lockup in `src/ui/brand.css`; the bar, the top bar, the two panels, the phone menu; the student pages' new look.
3. Teste page and "De făcut".
4. Test page: the stages and Fișa testului.
```

Replace it with:

```markdown
1. Landing page and the light default theme. The app keeps its current look.
2. Look and shell: tokens, type, mark and lockup in `src/ui/brand.css`; the bar, the top bar, the two panels with "De făcut" and its three cases, the phone bar and menu; the student pages' new look.
3. Teste page, with the list "Ce ai de făcut" in place.
4. Test page: the stages and Fișa testului.
```

- [ ] **Step 10: Commit**

```bash
git add docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md
git commit -m "Write the Phase 2 decisions into the redesign spec"
```

### Task 2: The tests list says when a generated barem waits

`GET /api/admin/tests` and `GET /api/admin/classes/:id` answer each test with `barem: { request, unchecked }`, the same object `GET /api/admin/tests/:code` already gives.

**Files:**
- Modify: `shared/api.ts` (`TestSummary`, `TestInfo`), `server/db/tests.ts` (`toRecord`)
- Test: `server/routes/tests.test.ts`

**Interfaces:**
- Produces: `TestSummary.barem: { request: BaremRequest; unchecked: boolean }` (moved from `TestInfo`, which extends `TestSummary` and keeps it). `TestRecord.barem` stays for the routes.

- [ ] **Step 1: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
    expect(res.body.tests[0]).toMatchObject({ code, gradedCount: 2, flagCount: 3 });
  });
```

Replace it with:

```ts
    expect(res.body.tests[0]).toMatchObject({ code, gradedCount: 2, flagCount: 3 });
  });

  it('says when a generated barem waits for the teacher', async () => {
    const cls = await makeClass(api, '6E2');
    const generated = await makeTest(api, cls.id, 'Generat');
    const asked = await makeTest(api, cls.id, 'Cerut');
    await makeTest(api, cls.id, 'Fără');
    await api.db.prepare('UPDATE tests SET barem_unchecked = 1 WHERE code = ?').bind(generated).run();
    await api.db.prepare("UPDATE tests SET barem_request = 'requested' WHERE code = ?").bind(asked).run();

    const res = await api.request('GET', '/api/admin/tests?year=2026');
    const barem = Object.fromEntries(res.body.tests.map((t: { title: string; barem: unknown }) => [t.title, t.barem]));
    expect(barem).toEqual({
      Generat: { request: 'none', unchecked: true },
      Cerut: { request: 'requested', unchecked: false },
      Fără: { request: 'none', unchecked: false },
    });
  });
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run server/routes/tests.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  1 failed | 19 passed (20)`: "says when a generated barem waits for the teacher" (the tests list has no `barem` yet).

- [ ] **Step 3: Edit `shared/api.ts`**

Find this block:

```ts
  archived: boolean;
}
```

Replace it with:

```ts
  archived: boolean;
  // unchecked: a generated barem waits for the teacher's check, and no
  // evaluation starts until then. The list needs it for "De făcut".
  barem: { request: BaremRequest; unchecked: boolean };
}
```

- [ ] **Step 4: Edit `shared/api.ts`**

Find this block:

```ts
  baremNotes: string;
  // unchecked: a generated barem waits for the teacher's check, and no
  // evaluation starts until then.
  barem: { request: BaremRequest; unchecked: boolean };
  // Goes up with every new test file, barem, or barem comments.
```

Replace it with:

```ts
  baremNotes: string;
  // Goes up with every new test file, barem, or barem comments.
```

- [ ] **Step 5: Edit `server/db/tests.ts`**

Find this block:

```ts
function toRecord(row: TestRow): TestRecord {
  return {
```

Replace it with:

```ts
function toRecord(row: TestRow): TestRecord {
  const barem = { request: row.barem_request, unchecked: row.barem_unchecked === 1 };
  return {
```

- [ ] **Step 6: Edit `server/db/tests.ts`**

Find this block:

```ts
      archived: row.archived === 1,
    },
```

Replace it with:

```ts
      archived: row.archived === 1,
      barem,
    },
```

- [ ] **Step 7: Edit `server/db/tests.ts`**

Find this block:

```ts
    baremNotes: row.barem_notes ?? '',
    barem: { request: row.barem_request, unchecked: row.barem_unchecked === 1 },
    filesVersion: row.files_version,
```

Replace it with:

```ts
    baremNotes: row.barem_notes ?? '',
    barem,
    filesVersion: row.files_version,
```

- [ ] **Step 8: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  107 passed | 1 skipped (108)`, `Tests  1686 passed | 3 skipped (1689)`.

- [ ] **Step 9: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 10: Commit**

```bash
git add shared/api.ts server/db/tests.ts server/routes/tests.test.ts
git commit -m "Say in the tests list when a generated barem waits for the teacher"
```

### Task 3: The look of the redesign and the mark

The tokens take the values of spec §2.2 (light and dark), the text is set in Schibsted Grotesk, the notebook grid and the red margin line go, buttons, fields, labels and cards become flat and 8-10px rounded, and the mark becomes "Trei subiecte" in the app, on the student pages and in the favicon.

**Files:**
- Create: `src/ui/brand.test.ts`, `src/ui/BrandMark.test.tsx`
- Replace: `src/ui/BrandMark.tsx`, `public/favicon.svg`
- Modify: `src/ui/brand.css`, `admin/index.html`, `u/index.html`, `src/admin/pages/TestsPage.tsx` (the "de verificat" label), `src/admin/reportPage/ReportTables.tsx` (the "de verificat" label)

**Interfaces:**
- Produces: the tokens of ruling 5; the classes `.tag-wait`, `.button` (filled blue), `.button-quiet` (outline); `BrandMark()` drawing three arcs with `--mk-a`, `--mk-b`.

- [ ] **Step 1: Create `src/ui/brand.test.ts`**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import adminPage from '../../admin/index.html?raw';
import uploadPage from '../../u/index.html?raw';

// Read from the disk (Vitest runs in the project's root): Vitest hands a
// test an empty string for any CSS import.
const css = readFileSync('src/ui/brand.css', 'utf8');

// The declarations of the first block that opens with `head {`, sorted.
function declarations(head: string): string[] {
  const start = css.indexOf(`${head} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const body = css.slice(start + head.length + 2, css.indexOf('}', start));
  return body
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .sort();
}

const value = (decls: string[], name: string) => decls.find((d) => d.startsWith(`${name}:`))?.slice(name.length + 1).trim();

describe('brand.css', () => {
  it('writes the dark colours twice, the same both times', () => {
    const chosen = declarations(':root[data-theme="dark"]');
    expect(chosen.length).toBeGreaterThan(20);
    expect(declarations('  :root:not([data-theme="light"])')).toEqual(chosen);
  });

  it('gives every colour of the dark theme a light value', () => {
    const light = declarations(':root').map((d) => d.slice(0, d.indexOf(':')));
    for (const decl of declarations(':root[data-theme="dark"]')) {
      const name = decl.slice(0, decl.indexOf(':'));
      if (name.startsWith('--')) expect(light).toContain(name);
    }
  });

  it('uses the colours of the redesign', () => {
    const light = declarations(':root');
    const dark = declarations(':root[data-theme="dark"]');
    expect([value(light, '--paper'), value(light, '--sheet'), value(light, '--text'), value(light, '--ink'), value(light, '--marker')]).toEqual([
      '#f3f5f8',
      '#ffffff',
      '#0c1524',
      '#1b5cc8',
      '#fdeee3',
    ]);
    expect([value(dark, '--paper'), value(dark, '--sheet'), value(dark, '--text'), value(dark, '--ink'), value(dark, '--marker')]).toEqual([
      '#0e1116',
      '#161a21',
      '#eef1f5',
      '#80b1ff',
      '#33200f',
    ]);
  });

  it('is flat: no gradient, no notebook grid', () => {
    expect(css).not.toMatch(/gradient\(/);
    expect(css).not.toContain('--grid');
  });

  it('sets the text in Schibsted Grotesk, loaded by the teacher and the student pages', () => {
    expect(value(declarations(':root'), '--font')).toMatch(/^"Schibsted Grotesk",/);
    for (const page of [adminPage, uploadPage]) {
      expect(page).toContain('https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800');
      expect(page).not.toContain('Atkinson');
    }
  });
});
```

- [ ] **Step 2: Create `src/ui/BrandMark.test.tsx`**

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import favicon from '../../public/favicon.svg?raw';
import { BrandMark } from './BrandMark.tsx';

const ARCS = ['M35.74 14.39A18 18 0 0 1 49.12 37.56', 'M45.38 44.04A18 18 0 0 1 18.62 44.04', 'M14.88 37.56A18 18 0 0 1 28.26 14.39'];

describe('BrandMark', () => {
  it('draws the three arcs, two in the first colour and one in the second', () => {
    const { container } = render(<BrandMark />);
    const paths = Array.from(container.querySelectorAll('path'));
    expect(paths.map((path) => path.getAttribute('d'))).toEqual(ARCS);
    expect(paths.map((path) => path.getAttribute('stroke'))).toEqual(['var(--mk-a)', 'var(--mk-a)', 'var(--mk-b)']);
  });

  it('is flat and hidden from screen readers', () => {
    const { container } = render(<BrandMark />);
    expect(container.querySelector('linearGradient')).toBeNull();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('is the mark of the favicon too', () => {
    for (const arc of ARCS) expect(favicon).toContain(arc);
    expect(favicon).not.toContain('Gradient');
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/ui/brand.test.ts src/ui/BrandMark.test.tsx`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  6 failed | 2 passed (8)`: the old colours, a gradient, "Atkinson Hyperlegible Next", and the old mark (no three arcs, and none in the favicon).

- [ ] **Step 4: Edit `src/ui/brand.css`**

Find this block:

```css
/* MQGrader look, taken from the "Matematică cu Laura Miron" site
   (D:\Projects\Website\assets\css\style.css): a Romanian squared math notebook
   in light mode, a green chalkboard in dark mode. The dark colours are written
   twice because CSS cannot share one block across a media query; keep the two
   copies equal. */

:root {
  --paper: #fbfcfe;
  --grid: #e3eaf4;
  --sheet: #ffffff;
  --text: #24272d;
  --muted: #586070;
  --ink: #1d3c8f;
  --ink-hover: #132a69;
  --red: #cf3a2f;
  --marker: #fff0a0;
  --marker-edge: #ffd94a;
  --rule: #d4dce8;
  --mark-from: #0891b2;
  --mark-to: #2563eb;
  --mark-tick: #ea580c;
  --ok-bg: #e1f2e8;
  --ok-fg: #1b6b43;
  --error-bg: #fbe5e2;
  --error-fg: #a52a20;
  --conf-5: #1b6b43;
```

Replace it with:

```css
/* MQGrader look (redesign spec §2): one sans-serif face, a cool grey ground,
   white surfaces, one blue for actions and data, orange only for what waits on
   the teacher. Flat colours: no gradients; shadows only on what floats. The
   dark colours are written twice because CSS cannot share one block across a
   media query; keep the two copies equal (brand.test.ts checks it).

   The names are older than the redesign: --paper is the ground, --sheet a
   surface, --rule a border, --ink the blue, --marker the tint of what waits. */

:root {
  --paper: #f3f5f8;
  --sheet: #ffffff;
  --raised: #f7f9fb;
  --active: #e7ecf3;
  --rule: #e0e5ec;
  --line: #edf0f4;
  --control: #c5cedb;
  --text: #0c1524;
  --muted: #4a566a;
  --ink: #1b5cc8;
  --ink-hover: #154ba6;
  --on-ink: #ffffff;
  --ink-tint: #e6eefb;
  --orange: #b9480a;
  --orange-mark: #e2590b;
  --marker: #fdeee3;
  --red: #b42318;
  --ok-bg: #e1f3e9;
  --ok-fg: #1d7a4c;
  --error-bg: #fbe9e7;
  --error-fg: #b42318;
  --mk-a: #1b5cc8;
  --mk-b: #e2590b;
  --conf-5: #1b6b43;
```

- [ ] **Step 5: Edit `src/ui/brand.css`**

Find this block:

```css
  --tone-fill: 1;
  --cell: 24px;
  --margin-x: 3rem;
  --font: "Atkinson Hyperlegible Next", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif;
  --hand: "Caveat", "Segoe Print", "Bradley Hand", cursive;
```

Replace it with:

```css
  --tone-fill: 1;
  --float: 0 18px 48px rgb(10 20 40 / 0.16);
  --radius: 8px;
  --radius-panel: 10px;
  --font: "Schibsted Grotesk", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif;
  --hand: "Caveat", "Segoe Print", "Bradley Hand", cursive;
```

- [ ] **Step 6: Edit `src/ui/brand.css`**

Find this block:

```css
:root[data-theme="dark"] {
  --paper: #1d2925;
  --grid: rgba(255, 255, 255, 0.045);
  --sheet: #22302b;
  --text: #e8ece7;
  --muted: #b1bab3;
  --ink: #a9c5ff;
  --ink-hover: #d2e0ff;
  --red: #ff8b80;
  --marker: rgba(255, 226, 110, 0.16);
  --marker-edge: rgba(255, 217, 74, 0.75);
  --rule: rgba(255, 255, 255, 0.14);
  --mark-from: #22e8ee;
  --mark-to: #3b7cf4;
  --mark-tick: #fb923c;
  --ok-bg: rgba(120, 210, 160, 0.16);
  --ok-fg: #a8e6c1;
  --error-bg: rgba(255, 139, 128, 0.16);
  --error-fg: #ffb3ab;
  --conf-5: #7ddba3;
```

Replace it with:

```css
:root[data-theme="dark"] {
  --paper: #0e1116;
  --sheet: #161a21;
  --raised: #1b2028;
  --active: #252b36;
  --rule: #272d38;
  --line: #1f242d;
  --control: #3b4351;
  --text: #eef1f5;
  --muted: #a9b2c0;
  --ink: #80b1ff;
  --ink-hover: #a3c6ff;
  --on-ink: #0c1524;
  --ink-tint: #1a2740;
  --orange: #ff9a57;
  --orange-mark: #ff8a3d;
  --marker: #33200f;
  --red: #ff8b80;
  --ok-bg: #13291e;
  --ok-fg: #5fd39a;
  --error-bg: #3a1a17;
  --error-fg: #ff8b80;
  --mk-a: #80b1ff;
  --mk-b: #ff8a3d;
  --conf-5: #7ddba3;
```

- [ ] **Step 7: Edit `src/ui/brand.css`**

Find this block:

```css
  --tone-fill: 0.3;
  color-scheme: dark;
```

Replace it with:

```css
  --tone-fill: 0.3;
  --float: 0 18px 48px rgb(0 0 0 / 0.5);
  color-scheme: dark;
```

- [ ] **Step 8: Edit `src/ui/brand.css`**

Find this block:

```css
  :root:not([data-theme="light"]) {
    --paper: #1d2925;
    --grid: rgba(255, 255, 255, 0.045);
    --sheet: #22302b;
    --text: #e8ece7;
    --muted: #b1bab3;
    --ink: #a9c5ff;
    --ink-hover: #d2e0ff;
    --red: #ff8b80;
    --marker: rgba(255, 226, 110, 0.16);
    --marker-edge: rgba(255, 217, 74, 0.75);
    --rule: rgba(255, 255, 255, 0.14);
    --mark-from: #22e8ee;
    --mark-to: #3b7cf4;
    --mark-tick: #fb923c;
    --ok-bg: rgba(120, 210, 160, 0.16);
    --ok-fg: #a8e6c1;
    --error-bg: rgba(255, 139, 128, 0.16);
    --error-fg: #ffb3ab;
    --conf-5: #7ddba3;
```

Replace it with:

```css
  :root:not([data-theme="light"]) {
    --paper: #0e1116;
    --sheet: #161a21;
    --raised: #1b2028;
    --active: #252b36;
    --rule: #272d38;
    --line: #1f242d;
    --control: #3b4351;
    --text: #eef1f5;
    --muted: #a9b2c0;
    --ink: #80b1ff;
    --ink-hover: #a3c6ff;
    --on-ink: #0c1524;
    --ink-tint: #1a2740;
    --orange: #ff9a57;
    --orange-mark: #ff8a3d;
    --marker: #33200f;
    --red: #ff8b80;
    --ok-bg: #13291e;
    --ok-fg: #5fd39a;
    --error-bg: #3a1a17;
    --error-fg: #ff8b80;
    --mk-a: #80b1ff;
    --mk-b: #ff8a3d;
    --conf-5: #7ddba3;
```

- [ ] **Step 9: Edit `src/ui/brand.css`**

Find this block:

```css
    --tone-fill: 0.3;
    color-scheme: dark;
```

Replace it with:

```css
    --tone-fill: 0.3;
    --float: 0 18px 48px rgb(0 0 0 / 0.5);
    color-scheme: dark;
```

- [ ] **Step 10: Edit `src/ui/brand.css`**

Find this block:

```css
  font-family: var(--font);
  font-size: 1.0625rem;
  line-height: 1.6;
  color: var(--text);
  background-color: var(--paper);
  background-image:
    linear-gradient(var(--grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: var(--cell) var(--cell);
}
```

Replace it with:

```css
  font-family: var(--font);
  font-size: 0.9375rem;
  line-height: 1.55;
  color: var(--text);
  background-color: var(--paper);
}

/* On a phone (the phone layout, below 900px) the text is one step larger:
   the student pages are read there, and a phone zooms into a field whose text
   is under 16px. */
@media (max-width: 56.25rem) {
  body {
    font-size: 1rem;
  }
}
```

- [ ] **Step 11: Edit `src/ui/brand.css`**

Find this block:

```css
  color: var(--ink-hover);
  text-decoration-thickness: 2px;
}
```

Replace it with:

```css
  color: var(--ink-hover);
}
```

- [ ] **Step 12: Edit `src/ui/brand.css`**

Find this block:

```css
:focus-visible {
  outline: 3px solid var(--ink);
  outline-offset: 3px;
  border-radius: 2px;
```

Replace it with:

```css
:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
  border-radius: 2px;
```

- [ ] **Step 13: Edit `src/ui/brand.css`**

Find this block:

```css
  margin: 0 0 0.75rem;
  font-size: clamp(1.5rem, 1rem + 2vw, 2.2rem);
  font-weight: 800;
  line-height: 1.2;
}
```

Replace it with:

```css
  margin: 0 0 0.75rem;
  font-size: clamp(1.375rem, 1.1rem + 1vw, 1.75rem);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.01em;
  text-wrap: balance;
}
```

- [ ] **Step 14: Edit `src/ui/brand.css`**

Find this block:

```css
  margin: 1.75rem 0 0.5rem;
  font-size: 1.3rem;
  font-weight: 800;
}
```

Replace it with:

```css
  margin: 1.75rem 0 0.5rem;
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.3;
  text-wrap: balance;
}
```

- [ ] **Step 15: Edit `src/ui/brand.css`**

Find this block:

```css
.brand-name {
  font-size: 1.15rem;
  font-weight: 800;
}
```

Replace it with:

```css
.brand-name {
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
}
```

- [ ] **Step 16: Edit `src/ui/brand.css`**

Find this block:

```css

/* Page body with the notebook's red margin line */

.page {
  position: relative;
  padding-block: 0.75rem 2.5rem;
  padding-left: var(--margin-x);
}

.page::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--margin-x) - 1.25rem);
  width: 2px;
  background: var(--red);
  opacity: 0.7;
}

@media (max-width: 40rem) {
  :root {
    --margin-x: 1.75rem;
  }
}
```

Replace it with:

```css

/* Page body */

.page {
  padding-block: 1.25rem 2.5rem;
}
```

- [ ] **Step 17: Edit `src/ui/brand.css`**

Find this block:

```css

.button,
```

Replace it with:

```css

/* Buttons are 8px rounded: an outline by default, filled blue for the one
   main action of a screen. */
.button,
```

- [ ] **Step 18: Edit `src/ui/brand.css`**

Find this block:

```css
  justify-content: center;
  min-height: 2.75rem;
  padding: 0.45rem 1.15rem;
  border-radius: 999px;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
}
```

Replace it with:

```css
  justify-content: center;
  gap: 0.5rem;
  min-height: 2.5rem;
  padding: 0.4rem 1rem;
  border-radius: var(--radius);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.2;
  text-decoration: none;
  cursor: pointer;
  transition: background-color 120ms, border-color 120ms;
}
```

- [ ] **Step 19: Edit `src/ui/brand.css`**

Find this block:

```css
.button {
  border: 0;
  background: var(--ink);
  color: var(--sheet);
}
```

Replace it with:

```css
.button {
  border: 1px solid var(--ink);
  background: var(--ink);
  color: var(--on-ink);
}
```

- [ ] **Step 20: Edit `src/ui/brand.css`**

Find this block:

```css
.button:hover {
  background: var(--ink-hover);
  color: var(--sheet);
}
```

Replace it with:

```css
.button:hover {
  border-color: var(--ink-hover);
  background: var(--ink-hover);
  color: var(--on-ink);
}
```

- [ ] **Step 21: Edit `src/ui/brand.css`**

Find this block:

```css
.button-quiet {
  border: 1.5px solid var(--rule);
  background: var(--sheet);
  color: var(--ink);
}
```

Replace it with:

```css
.button-quiet {
  border: 1px solid var(--control);
  background: var(--sheet);
  color: var(--text);
}
```

- [ ] **Step 22: Edit `src/ui/brand.css`**

Find this block:

```css
.button-quiet:hover {
  border-color: var(--ink);
}
```

Replace it with:

```css
.button-quiet:hover {
  border-color: var(--muted);
  color: var(--text);
}
```

- [ ] **Step 23: Edit `src/ui/brand.css`**

Find this block:

```css
.button-small {
  min-height: 2.25rem;
  padding: 0.2rem 0.85rem;
  font-size: 0.9rem;
}
```

Replace it with:

```css
.button-small {
  min-height: 2rem;
  padding: 0.2rem 0.75rem;
  font-size: 0.8125rem;
}

@media (prefers-reduced-motion: reduce) {
  .button,
  .button-quiet {
    transition: none;
  }
}
```

- [ ] **Step 24: Edit `src/ui/brand.css`**

Find this block:

```css
label {
  font-weight: 700;
}
```

Replace it with:

```css
label {
  font-weight: 600;
}
```

- [ ] **Step 25: Edit `src/ui/brand.css`**

Find this block:

```css
select {
  min-height: 2.75rem;
  padding: 0.45rem 0.75rem;
  border: 1.5px solid var(--rule);
  border-radius: 0.5rem;
  background: var(--sheet);
```

Replace it with:

```css
select {
  min-height: 2.5rem;
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--control);
  border-radius: var(--radius);
  background: var(--sheet);
```

- [ ] **Step 26: Edit `src/ui/brand.css`**

Find this block:

```css
  border-color: var(--ink);
  outline: 3px solid var(--ink);
  outline-offset: 1px;
```

Replace it with:

```css
  border-color: var(--ink);
  outline: 2px solid var(--ink);
  outline-offset: 1px;
```

- [ ] **Step 27: Edit `src/ui/brand.css`**

Find this block:

```css
  padding: 0.6rem 0.9rem;
  border-left: 4px solid var(--error-fg);
  border-radius: 0.35rem;
  background: var(--error-bg);
```

Replace it with:

```css
  padding: 0.6rem 0.9rem;
  border-radius: var(--radius);
  background: var(--error-bg);
```

- [ ] **Step 28: Edit `src/ui/brand.css`**

Find this block:

```css

.tag {
  display: inline-block;
  padding: 0 0.55rem;
  border-radius: 0.3rem;
  background: var(--marker);
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 700;
}

/* Quiet and positive labels: "Rezultate nepublicate" is grey, "Rezultate
   publicate" green. */
.tag-muted {
  background: color-mix(in srgb, var(--muted) 16%, transparent);
  color: var(--muted);
```

Replace it with:

```css

/* A label: a small flat tinted block. Grey by default; orange (.tag-wait)
   only for what waits on the teacher, green for what is done and shown. */
.tag {
  display: inline-block;
  padding: 0 0.5rem;
  border-radius: 6px;
  background: var(--active);
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.6;
}

.tag-wait {
  background: var(--marker);
  color: var(--orange);
}

.tag-muted {
  background: var(--active);
  color: var(--muted);
```

- [ ] **Step 29: Edit `src/ui/brand.css`**

Find this block:

```css
  padding: 0.9rem 1rem;
  border: 1.5px solid var(--rule);
  border-radius: 0.75rem;
  background: var(--sheet);
```

Replace it with:

```css
  padding: 0.9rem 1rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-panel);
  background: var(--sheet);
```

- [ ] **Step 30: Edit `src/ui/brand.css`**

Find this block:

```css
  display: flex;
  height: 0.6rem;
  overflow: hidden;
  border-radius: 0.3rem;
  background: color-mix(in srgb, var(--muted) 22%, transparent);
}
```

Replace it with:

```css
  display: flex;
  height: 0.5rem;
  overflow: hidden;
  border-radius: 4px;
  background: var(--active);
}
```

- [ ] **Step 31: Edit `src/ui/brand.css`**

Find this block:

```css
.grading-progress-graded {
  background: var(--ok-fg);
}
```

Replace it with:

```css
.grading-progress-graded {
  background: var(--ink);
}
```

- [ ] **Step 32: Edit `src/ui/brand.css`**

Find this block:

```css
.grading-progress-waiting {
  background: var(--marker);
}
```

Replace it with:

```css
.grading-progress-waiting {
  background: color-mix(in srgb, var(--ink) 35%, var(--sheet));
}
```

- [ ] **Step 33: Edit `src/ui/brand.css`**

Find this block:

```css
.card-title {
  font-size: 1.2rem;
  font-weight: 800;
}
```

Replace it with:

```css
.card-title {
  font-size: 1.0625rem;
  font-weight: 700;
}
```

- [ ] **Step 34: Edit `src/ui/brand.css`**

Find this block:

```css
.file-field input:focus-visible + .file-pick {
  outline: 3px solid var(--ink);
  outline-offset: 3px;
}
```

Replace it with:

```css
.file-field input:focus-visible + .file-pick {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
```

- [ ] **Step 35: Edit `src/ui/brand.css`**

Find this block:

```css

/* A test's state: draft is plain, open is green, being graded is
   highlighted, graded is blue ink. */
.status {
  display: inline-block;
  padding: 0 0.6rem;
  border-radius: 0.3rem;
  background: color-mix(in srgb, var(--muted) 16%, transparent);
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 700;
  white-space: nowrap;
```

Replace it with:

```css

/* A test's state: draft is plain, open is green, being graded is pale blue,
   graded is blue. */
.status {
  display: inline-block;
  padding: 0 0.5rem;
  border-radius: 6px;
  background: var(--active);
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.6;
  white-space: nowrap;
```

- [ ] **Step 36: Edit `src/ui/brand.css`**

Find this block:

```css
.status-evaluating {
  background: var(--marker);
  color: var(--text);
}
```

Replace it with:

```css
.status-evaluating {
  background: var(--ink-tint);
  color: var(--ink);
}
```

- [ ] **Step 37: Edit `src/ui/brand.css`**

Find this block:

```css
.status-done {
  background: color-mix(in srgb, var(--ink) 12%, transparent);
  color: var(--ink);
}
```

Replace it with:

```css
.status-done {
  background: var(--ink-tint);
  color: var(--text);
}
```

- [ ] **Step 38: Edit `src/ui/brand.css`**

Find this block:

```css
  margin-block: 0.75rem;
  padding: 0.6rem 0.9rem;
  border-left: 4px solid var(--marker-edge);
  border-radius: 0.35rem;
  background: var(--marker);
}
```

Replace it with:

```css
  margin-block: 0.75rem;
  padding: 0.6rem 0.9rem;
  border-radius: var(--radius);
  background: var(--marker);
}
```

- [ ] **Step 39: Edit `src/ui/brand.css`**

Find this block:

```css
.pick-button:focus-within {
  outline: 3px solid var(--ink);
  outline-offset: 3px;
}
```

Replace it with:

```css
.pick-button:focus-within {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
```

- [ ] **Step 40: Edit `src/ui/brand.css`**

Find this block:

```css
  padding: 0.6rem 0.9rem;
  border-left: 4px solid var(--marker-edge);
  border-radius: 0.35rem;
  background: var(--marker);
```

Replace it with:

```css
  padding: 0.6rem 0.9rem;
  border-radius: var(--radius);
  background: var(--marker);
```

- [ ] **Step 41: Edit `admin/index.html`**

Find this block:

```html
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:ital,wght@0,400;0,700;0,800;1,400&family=Caveat:wght@600&display=swap"
    />
```

Replace it with:

```html
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&family=Caveat:wght@600&display=swap"
    />
```

- [ ] **Step 42: Edit `u/index.html`**

Find this block:

```html
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:ital,wght@0,400;0,700;0,800;1,400&family=Caveat:wght@600&display=swap"
    />
  </head>
```

Replace it with:

```html
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&display=swap" />
  </head>
```

- [ ] **Step 43: Replace `src/ui/BrandMark.tsx`**

```tsx
// The MQGrader mark, "Trei subiecte" (redesign spec §2.4): three arcs of one
// ring, two blue and one orange, coloured by --mk-a and --mk-b so both themes
// work. The landing page and public/favicon.svg draw the same arcs.
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g fill="none" strokeWidth="7">
        <path d="M35.74 14.39A18 18 0 0 1 49.12 37.56" stroke="var(--mk-a)" />
        <path d="M45.38 44.04A18 18 0 0 1 18.62 44.04" stroke="var(--mk-a)" />
        <path d="M14.88 37.56A18 18 0 0 1 28.26 14.39" stroke="var(--mk-b)" />
      </g>
    </svg>
  );
}
```

- [ ] **Step 44: Replace `public/favicon.svg`**

```text
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <title>MQGrader</title>
  <rect width="64" height="64" rx="14" fill="#0c1524"/>
  <g fill="none" stroke-width="7">
    <path d="M35.74 14.39A18 18 0 0 1 49.12 37.56" stroke="#80b1ff"/>
    <path d="M45.38 44.04A18 18 0 0 1 18.62 44.04" stroke="#80b1ff"/>
    <path d="M14.88 37.56A18 18 0 0 1 28.26 14.39" stroke="#ff8a3d"/>
  </g>
</svg>
```

- [ ] **Step 45: Edit `src/admin/pages/TestsPage.tsx`**

Find this block:

```tsx
        <StatusChip status={test.status} />
        {test.flagCount > 0 && <span className="tag">de verificat</span>}
        {test.archived && <span className="tag">Arhivat</span>}
```

Replace it with:

```tsx
        <StatusChip status={test.status} />
        {test.flagCount > 0 && <span className="tag tag-wait">de verificat</span>}
        {test.archived && <span className="tag">Arhivat</span>}
```

- [ ] **Step 46: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
                <strong>{formatPoints(row.grade)}</strong>
                {row.flagCount > 0 && <span className="tag">de verificat {row.flagCount}</span>}
              </td>
```

Replace it with:

```tsx
                <strong>{formatPoints(row.grade)}</strong>
                {row.flagCount > 0 && <span className="tag tag-wait">de verificat {row.flagCount}</span>}
              </td>
```

- [ ] **Step 47: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  109 passed | 1 skipped (110)`, `Tests  1694 passed | 3 skipped (1697)`.

- [ ] **Step 48: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 49: Commit**

```bash
git add src/ui/brand.css src/ui/brand.test.ts src/ui/BrandMark.tsx src/ui/BrandMark.test.tsx public/favicon.svg admin/index.html u/index.html src/admin/pages/TestsPage.tsx src/admin/reportPage/ReportTables.tsx
git commit -m "Give the app and the student pages the look of the redesign and the new mark"
```

### Task 4: The shell: the bar, the top bar, the account menu, Clasele tale

`Layout.tsx` draws the new shell. The 80px bar (`nav` "Meniu"): "Test nou", "Teste", "Clase" (a button that opens the panel "Clasele tale"; marked on every `/clase` page) and, at the bottom, "Setări" for an administrator. The top bar: the lockup, the school year, the theme, and the initials, which open "Contul meu" and "Ieși din cont". The old menu, the footer and the Caveat font go. Testing Library's waits become 3 s (ruling 11).

**Files:**
- Create: `src/admin/shell/icons.tsx`, `src/admin/shell/initials.ts`, `src/admin/shell/initials.test.ts`, `src/admin/shell/Panel.tsx`, `src/admin/shell/ClassesPanel.tsx`, `src/admin/shell/UserMenu.tsx`, `src/admin/shell/Rail.tsx`, `src/admin/Layout.test.tsx`
- Replace: `src/admin/Layout.tsx`
- Modify: `src/ui/brand.css`, `admin/index.html`, `src/test/setup.ts`
- Test (changed for the new menu): `src/admin/pages/LoginPage.test.tsx`, `src/admin/pages/TestsPage.test.tsx`, `src/admin/pages/ClassesPage.test.tsx`, `src/admin/settingsPage/AccountsSection.test.tsx`

**Interfaces:**
- Consumes: `BrandMark` (Task 3); `ThemeButton`, `useSchoolYear`, `schoolYearOptions`, `studentCountLabel`, `testStatusLabel`, `api.listClasses`, `api.listTests`, `api.logout`.
- Produces:
  - `type PanelName = 'clase'` and `Rail({ admin, onTests, onClasses, panel, onToggle })` in `shell/Rail.tsx` (Task 5 adds `'todo'` and `todoCount`, Task 6 adds `'menu'`).
  - `Panel({ id, title, onClose, children })`: an `aside` labelled by its `h2`, with × named "Închide"; it focuses × when it opens and gives the focus back when it closes.
  - `ClassesPanel({ year, currentClassId, onClose })` (Task 5 adds `todo`), `UserMenu({ teacher })`, `initials(name): string`, and the icons `IconPlus`, `IconTests`, `IconClasses`, `IconTodo`, `IconSettings`, `IconClose`.
  - In `Layout`: the open panel is kept with the `location.key` it was opened on, so a new page closes it; Esc closes it.

- [ ] **Step 1: Create `src/admin/shell/initials.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { initials } from './initials.ts';

describe('initials', () => {
  it('takes the first letters of the first and the last word', () => {
    expect(initials('Laura Miron')).toBe('LM');
    expect(initials('  ana  maria   pop ')).toBe('AP');
  });

  it('keeps Romanian letters and one word', () => {
    expect(initials('ștefan țurcanu')).toBe('ȘȚ');
    expect(initials('Laura')).toBe('L');
  });

  it('shows a question mark for an empty name', () => {
    expect(initials('   ')).toBe('?');
  });
});
```

- [ ] **Step 2: Create `src/admin/Layout.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createFakeApi, fakeTeacher, fakeTest } from '../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../test/renderAdmin.tsx';

const withClasses = () =>
  createFakeApi({
    classes: [
      { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 2, name: '6E3', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 3, name: '5A', schoolYear: 2026, archived: true, studentCount: 0 },
    ],
    students: { 1: [{ id: 10, fullName: 'Pop Ion', active: true, canDelete: true }] },
    tests: [
      fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'open' }),
      fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'done' }),
    ],
  });

const menu = () => screen.findByRole('navigation', { name: 'Meniu' });

describe('the shell', () => {
  it('shows the lockup in the top bar, and no footer', async () => {
    renderAdmin('/', withClasses());
    await menu();
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('link', { name: 'MQGrader by Laura Miron' })).toHaveAttribute('href', '/');
    expect(banner).toHaveTextContent('MQGraderby Laura Miron');
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('has Test nou, Teste and Clase in the bar', async () => {
    renderAdmin('/', withClasses());
    const bar = await menu();
    expect(within(bar).getByRole('link', { name: 'Test nou' })).toHaveAttribute('href', '/teste/nou');
    expect(within(bar).getByRole('link', { name: 'Teste' })).toHaveAttribute('aria-current', 'page');
    expect(within(bar).getByRole('button', { name: 'Clase' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the account menu from the initials, with Contul meu', async () => {
    renderAdmin('/', withClasses(), <LocationProbe />);
    await userEvent.click(await screen.findByRole('button', { name: 'Contul tău: Laura Miron' }));
    expect(screen.getByText('profesor@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Contul meu' }));
    await expectLocation('/cont');
    expect(screen.queryByText('profesor@example.com')).not.toBeInTheDocument();
  });

  it('logs out from the account menu', async () => {
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign });
    const api = withClasses();
    renderAdmin('/', api);
    await userEvent.click(await screen.findByRole('button', { name: /^Contul tău/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Ieși din cont' }));
    expect(api.logout).toHaveBeenCalled();
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/admin/'));
    vi.restoreAllMocks();
  });

  it('closes the account menu on Esc and on a click outside it', async () => {
    renderAdmin('/', withClasses());
    const button = await screen.findByRole('button', { name: /^Contul tău/ });
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    await userEvent.click(screen.getByRole('main'));
    expect(screen.queryByRole('link', { name: 'Contul meu' })).not.toBeInTheDocument();
  });
});

describe('the panel Clasele tale', () => {
  it('opens from Clase with the classes of the year and their tests in work', async () => {
    renderAdmin('/', withClasses());
    const clase = within(await menu()).getByRole('button', { name: 'Clase' });
    await userEvent.click(clase);
    expect(clase).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('complementary', { name: 'Clasele tale' });
    const list = within(panel).getByRole('navigation', { name: 'Clasele tale' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/clase/1', '/clase/2']);
    expect(links[0]).toHaveTextContent('6E21 elevEcuații · Deschis');
    expect(links[1]).toHaveTextContent('Nimic în lucru');
    expect(within(panel).getByRole('link', { name: '+ Clasă nouă' })).toHaveAttribute('href', '/clase');
    expect(within(panel).getByRole('link', { name: 'Arhivate (1)' })).toHaveAttribute('href', '/clase');
    expect(within(panel).getByRole('button', { name: 'Închide' })).toHaveFocus();
  });

  it('opens a class, closes, and marks Clase on the class page', async () => {
    renderAdmin('/', withClasses(), <LocationProbe />);
    const bar = await menu();
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    await userEvent.click(screen.getByRole('link', { name: /^6E3/ }));
    await expectLocation('/clase/2');
    expect(screen.queryByRole('complementary', { name: 'Clasele tale' })).not.toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Clase' })).toHaveAttribute('aria-current', 'page');
    expect(within(bar).getByRole('link', { name: 'Teste' })).not.toHaveAttribute('aria-current');

    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    expect(screen.getByRole('link', { name: /^6E3/ })).toHaveAttribute('aria-current', 'page');
  });

  it('closes on ×, on Esc and on Clase again, and gives the focus back', async () => {
    renderAdmin('/', withClasses());
    const clase = within(await menu()).getByRole('button', { name: 'Clase' });
    await userEvent.click(clase);
    await userEvent.click(screen.getByRole('button', { name: 'Închide' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(clase).toHaveFocus();
    await userEvent.click(clase);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    await userEvent.click(clase);
    await userEvent.click(clase);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('says so when the year has no class', async () => {
    renderAdmin('/', createFakeApi({ classes: [], students: {}, me: fakeTeacher() }));
    await userEvent.click(within(await menu()).getByRole('button', { name: 'Clase' }));
    expect(screen.getByText('Nu ai nicio clasă în acest an școlar.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx
    const menu = await screen.findByRole('navigation', { name: 'Meniu' });
    expect(within(menu).getByRole('link', { name: 'Setări' })).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: 'Contul meu' })).toBeInTheDocument();
  });
```

Replace it with:

```tsx
    const menu = await screen.findByRole('navigation', { name: 'Meniu' });
    expect(within(menu).getByRole('link', { name: 'Setări' })).toHaveAttribute('href', '/setari');
  });
```

- [ ] **Step 4: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx
    expect(within(menu).getByRole('link', { name: 'Teste' })).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: 'Clase' })).toBeInTheDocument();
    expect(await screen.findByText('Doar administratorii au acces la Setări.')).toBeInTheDocument();
```

Replace it with:

```tsx
    expect(within(menu).getByRole('link', { name: 'Teste' })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'Clase' })).toBeInTheDocument();
    expect(await screen.findByText('Doar administratorii au acces la Setări.')).toBeInTheDocument();
```

- [ ] **Step 5: Edit `src/admin/pages/TestsPage.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByRole('link', { name: '6E2-26T2' })).toHaveAttribute('href', '/teste/6E2-26T2');
    expect(screen.getByRole('link', { name: 'Test nou' })).toHaveAttribute('href', '/teste/nou');
  });
```

Replace it with:

```tsx
    expect(await screen.findByRole('link', { name: '6E2-26T2' })).toHaveAttribute('href', '/teste/6E2-26T2');
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Test nou' })).toHaveAttribute('href', '/teste/nou');
  });
```

- [ ] **Step 6: Edit `src/admin/pages/TestsPage.test.tsx`**

Find this block:

```tsx

  it('marks Teste in the menu on test pages and Clase on class pages', async () => {
    renderAdmin('/', withTests());
    const menu = await screen.findByRole('navigation', { name: 'Meniu' });
    expect(within(menu).getByRole('link', { name: 'Teste' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(within(menu).getByRole('link', { name: 'Clase' }));
    expect(within(menu).getByRole('link', { name: 'Clase' })).toHaveAttribute('aria-current', 'page');
    expect(within(menu).getByRole('link', { name: 'Teste' })).not.toHaveAttribute('aria-current');
  });
```

Replace it with:

```tsx

  it('marks Teste in the menu on test pages', async () => {
    renderAdmin('/teste/6E2-26T2', withTests());
    const menu = await screen.findByRole('navigation', { name: 'Meniu' });
    expect(within(menu).getByRole('link', { name: 'Teste' })).toHaveAttribute('aria-current', 'page');
    expect(within(menu).getByRole('button', { name: 'Clase' })).not.toHaveAttribute('aria-current');
  });
```

- [ ] **Step 7: Edit `src/admin/pages/ClassesPage.test.tsx`**

Find this block:

```tsx

  it('shows the teacher name in the footer', async () => {
    renderAdmin('/clase', twoClasses());
    expect(await screen.findByText('MQGrader · Laura Miron')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toHaveTextContent('MQGrader');
    expect(screen.queryByText('Matematică cu Laura Miron')).not.toBeInTheDocument();
```

Replace it with:

```tsx

  it('shows the MQGrader lockup in the top bar', async () => {
    renderAdmin('/clase', twoClasses());
    await screen.findByRole('heading', { name: 'Clase 2026-2027' });
    expect(screen.getByRole('banner')).toHaveTextContent('MQGraderby Laura Miron');
    expect(screen.queryByText('Matematică cu Laura Miron')).not.toBeInTheDocument();
```

- [ ] **Step 8: Edit `src/admin/settingsPage/AccountsSection.test.tsx`**

Find this block:

```tsx
    expect(screen.getByText('Mihai (mihai@example.com)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Laura Miron/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mihai/ })).not.toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(screen.getByText('Mihai (mihai@example.com)')).toBeInTheDocument();
    // The page only: the account menu in the top bar names Laura too.
    const page = screen.getByRole('main');
    expect(within(page).queryByRole('button', { name: /Laura Miron/ })).not.toBeInTheDocument();
    expect(within(page).queryByRole('button', { name: /Mihai/ })).not.toBeInTheDocument();
  });
```

- [ ] **Step 9: Edit `src/test/setup.ts`**

Find this block:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

```

Replace it with:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// A page's first render in a file loads its modules: with the whole suite
// running at once it can take about a second, the default wait of findBy and
// waitFor. Three seconds keeps those waits from failing under load.
configure({ asyncUtilTimeout: 3000 });

```

- [ ] **Step 10: Run the tests to see them fail**

Run: `npx vitest run src/admin/shell/initials.test.ts src/admin/Layout.test.tsx src/admin/pages/LoginPage.test.tsx src/admin/pages/TestsPage.test.tsx src/admin/pages/ClassesPage.test.tsx src/admin/settingsPage/AccountsSection.test.tsx`
Expected: FAIL. `Test Files  5 failed | 1 passed (6)`, `Tests  12 failed | 57 passed (69)`: `./initials.ts` does not exist, and the old header has no link "MQGrader by Laura Miron", no link "Test nou", no button "Clase" and no button "Contul tău: Laura Miron".

- [ ] **Step 11: Create `src/admin/shell/icons.tsx`**

```tsx
// The shell's line icons: 1.5px strokes on a 20px grid, in the text colour.
// They sit beside a visible word, so screen readers skip them.
const LINE = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

export function IconPlus() {
  return (
    <svg {...LINE} strokeWidth={2}>
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

export function IconTests() {
  return (
    <svg {...LINE}>
      <path d="M5 2.75h7l3 3v11.5H5z" />
      <path d="M8 9h4.5M8 12h4.5" />
    </svg>
  );
}

export function IconClasses() {
  return (
    <svg {...LINE}>
      <circle cx="7.5" cy="7" r="2.75" />
      <path d="M2.75 16c.6-2.6 2.5-4 4.75-4s4.15 1.4 4.75 4" />
      <path d="M13 4.6a2.6 2.6 0 0 1 0 5M14.5 12.2c1.4.5 2.4 1.8 2.75 3.8" />
    </svg>
  );
}

export function IconTodo() {
  return (
    <svg {...LINE}>
      <path d="M3.25 5.5l1.5 1.5 2.5-2.75M3.25 12.5l1.5 1.5 2.5-2.75" />
      <path d="M10.5 6h6.25M10.5 13h6.25" />
    </svg>
  );
}

export function IconSettings() {
  return (
    <svg {...LINE}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
    </svg>
  );
}

export function IconClose() {
  return (
    <svg {...LINE} strokeWidth={1.6}>
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}
```

- [ ] **Step 12: Create `src/admin/shell/initials.ts`**

```ts
// Up to two letters for the account button: the first letters of the first
// and the last word of the name ("Laura Miron" gives "LM").
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = Array.from(words[0]!)[0]!;
  const last = words.length > 1 ? Array.from(words[words.length - 1]!)[0]! : '';
  return (first + last).toLocaleUpperCase('ro-RO');
}
```

- [ ] **Step 13: Create `src/admin/shell/Panel.tsx`**

```tsx
import { useEffect, useRef, type ReactNode } from 'react';
import { IconClose } from './icons.tsx';

// A side panel beside the 80px bar (redesign spec §4): a title, × and its
// content. It takes the focus when it opens and gives it back when it closes.
// The Layout keeps one panel open at a time and closes it on Esc.
export function Panel({ id, title, onClose, children }: { id: string; title: string; onClose(): void; children: ReactNode }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <aside className="panel" id={id} aria-labelledby={`${id}-title`}>
      <div className="panel-head">
        <h2 id={`${id}-title`}>{title}</h2>
        <button ref={close} type="button" className="panel-close" aria-label="Închide" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      {children}
    </aside>
  );
}
```

- [ ] **Step 14: Create `src/admin/shell/ClassesPanel.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { TestSummary } from '../../../shared/api.ts';
import { studentCountLabel, testStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { Panel } from './Panel.tsx';

// A test still in work: not finished yet.
function inWork(test: TestSummary): boolean {
  return !test.archived && test.status !== 'done';
}

// "Clasele tale" (redesign spec §4): the classes of the school year that are
// not archived, each with its students and its tests in work; the class of
// the page is marked.
export function ClassesPanel({ year, currentClassId, onClose }: { year: number; currentClassId: number | null; onClose(): void }) {
  const api = useApi();
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });
  const tests = useQuery({ queryKey: ['tests', year], queryFn: () => api.listTests(year) });
  const active = classes.data?.filter((item) => !item.archived) ?? [];
  const archived = classes.data?.filter((item) => item.archived).length ?? 0;

  return (
    <Panel id="panel-clase" title="Clasele tale" onClose={onClose}>
      {classes.error ? (
        <div className="panel-body">
          <ErrorMessage error={classes.error} />
        </div>
      ) : !classes.data ? (
        <p className="panel-body hint">Se încarcă…</p>
      ) : active.length === 0 ? (
        <p className="panel-body hint">Nu ai nicio clasă în acest an școlar.</p>
      ) : (
        <nav className="class-list" aria-label="Clasele tale">
          {active.map((item) => {
            const work = (tests.data ?? []).filter((test) => test.classId === item.id && inWork(test));
            return (
              <Link
                key={item.id}
                className="class-item"
                to={`/clase/${item.id}`}
                aria-current={item.id === currentClassId ? 'page' : undefined}
              >
                <span className="class-item-head">
                  <b>{item.name}</b>
                  <span>{studentCountLabel(item.studentCount)}</span>
                </span>
                {work.length === 0 ? (
                  <span className="class-item-test">Nimic în lucru</span>
                ) : (
                  work.map((test) => (
                    <span key={test.code} className="class-item-test">
                      {test.title} · {testStatusLabel(test.status)}
                    </span>
                  ))
                )}
              </Link>
            );
          })}
        </nav>
      )}
      <div className="panel-actions">
        <Link className="button-quiet button-small" to="/clase">
          + Clasă nouă
        </Link>
        {archived > 0 && <Link to="/clase">Arhivate ({archived})</Link>}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 15: Create `src/admin/shell/UserMenu.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import type { Teacher } from '../../../shared/api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { initials } from './initials.ts';

// The teacher's initials in the top bar open a small menu: who is logged in,
// "Contul meu" and "Ieși din cont". It closes on Esc, on a click outside it,
// and when a page opens.
export function UserMenu({ teacher }: { teacher: Teacher }) {
  const api = useApi();
  const location = useLocation();
  // The page the menu was opened on: another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === location.key;
  const box = useRef<HTMLDivElement>(null);
  const logout = useMutation({
    mutationFn: () => api.logout(),
    // A new page load shows the login form.
    onSuccess: () => window.location.assign('/admin/'),
  });

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpenOn(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenOn(null);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="user" ref={box}>
      <button
        type="button"
        className="user-button"
        aria-label={`Contul tău: ${teacher.name}`}
        aria-expanded={open}
        aria-controls={open ? 'user-menu' : undefined}
        onClick={() => setOpenOn(open ? null : location.key)}
      >
        {initials(teacher.name)}
      </button>
      {open && (
        <div className="user-menu" id="user-menu">
          <p className="user-who">
            <b>{teacher.name}</b>
            <span>{teacher.email}</span>
          </p>
          <Link to="/cont">Contul meu</Link>
          <button type="button" disabled={logout.isPending} onClick={() => logout.mutate()}>
            Ieși din cont
          </button>
          {logout.error && <ErrorMessage error={logout.error} />}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 16: Create `src/admin/shell/Rail.tsx`**

```tsx
import { Link, NavLink } from 'react-router';
import { IconClasses, IconPlus, IconSettings, IconTests } from './icons.tsx';

export type PanelName = 'clase';

// The 80px bar on the left (redesign spec §4): Test nou, Teste, Clase (opens
// its panel) and, at the bottom, Setări for an administrator. Each item has
// its icon and a short word under it.
export function Rail({
  admin,
  onTests,
  onClasses,
  panel,
  onToggle,
}: {
  admin: boolean;
  onTests: boolean;
  onClasses: boolean;
  panel: PanelName | null;
  onToggle(name: PanelName): void;
}) {
  return (
    <nav className="rail" aria-label="Meniu">
      <Link className="rail-new" to="/teste/nou">
        <span className="rail-square">
          <IconPlus />
        </span>
        <span className="rail-word">Test nou</span>
      </Link>
      <Link className="rail-item" to="/" aria-current={onTests ? 'page' : undefined}>
        <IconTests />
        <span className="rail-word">Teste</span>
      </Link>
      <button
        type="button"
        className="rail-item"
        aria-current={onClasses ? 'page' : undefined}
        aria-expanded={panel === 'clase'}
        aria-controls={panel === 'clase' ? 'panel-clase' : undefined}
        onClick={() => onToggle('clase')}
      >
        <IconClasses />
        <span className="rail-word">Clase</span>
      </button>
      {admin && (
        <NavLink className="rail-item rail-foot" to="/setari">
          <IconSettings />
          <span className="rail-word">Setări</span>
        </NavLink>
      )}
    </nav>
  );
}
```

- [ ] **Step 17: Replace `src/admin/Layout.tsx`**

```tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, matchPath, Outlet, useLocation } from 'react-router';
import { demoPapersLeft, DEMO_PAPER_LIMIT } from '../../shared/accounts.ts';
import type { Teacher } from '../../shared/api.ts';
import { formatSchoolYear, schoolYearOf } from '../../shared/schoolYear.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import { ThemeButton } from '../ui/ThemeButton.tsx';
import { useApi } from './ApiContext.tsx';
import { ErrorMessage, isLoginRequired } from './ErrorMessage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { schoolYearOptions, useSchoolYear } from './SchoolYearContext.tsx';
import { ClassesPanel } from './shell/ClassesPanel.tsx';
import { Rail, type PanelName } from './shell/Rail.tsx';
import { UserMenu } from './shell/UserMenu.tsx';

// The line a demo account sees on every page.
export function demoText(teacher: Teacher): string {
  const left = demoPapersLeft(teacher.papersGraded + teacher.papersWaiting);
  if (left === 0) {
    return `Cont demo: ai folosit toate cele ${DEMO_PAPER_LIMIT} lucrări ale contului. Cere unui administrator un cont complet.`;
  }
  return `Cont demo: mai ai ${left} din ${DEMO_PAPER_LIMIT} lucrări. Fiecare lucrare corectată se numără, și o recorectare.`;
}

// The class of a /clase/:id page, for the panel to mark it.
function classOfPath(pathname: string): number | null {
  const match = matchPath({ path: '/clase/:id', end: false }, pathname);
  const id = Number(match?.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// The shell of the teacher app (redesign spec §4): the top bar, the 80px bar
// on the left, the page, and one side panel at a time.
export function Layout() {
  const api = useApi();
  const location = useLocation();
  const onTests = location.pathname === '/' || (location.pathname.startsWith('/teste') && location.pathname !== '/teste/nou');
  const onClasses = location.pathname.startsWith('/clase');
  const { year, setYear } = useSchoolYear();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
  // The open panel and the page it was opened on: another page closes it.
  const [panel, setPanel] = useState<{ name: PanelName; on: string } | null>(null);
  const open = panel?.on === location.key ? panel.name : null;
  const toggle = (name: PanelName) => setPanel(open === name ? null : { name, on: location.key });

  // A start, a regrade or a retry changes the papers the demo line shows:
  // every change a logged-in teacher makes reads the account again.
  const queryClient = useQueryClient();
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        const changed = event.type === 'updated' && event.action.type === 'success';
        if (changed && queryClient.getQueryData(['me'])) void queryClient.invalidateQueries({ queryKey: ['me'] });
      }),
    [queryClient],
  );
  // Esc closes the open panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  // Nobody logged in: the login form takes the place of every page. The pages
  // wait for the login, so they never ask the API without it. The page that
  // confirms a new account's email needs no login.
  const loggedOut = isLoginRequired(me.error);
  const openPage = location.pathname === '/confirma-email';

  return (
    <div className={me.data ? 'shell' : 'shell shell-bare'}>
      <header className="topbar">
        <Link className="brand" to="/" aria-label="MQGrader by Laura Miron">
          <BrandMark />
          <span className="brand-text">
            <span className="brand-name">MQGrader</span>
            <span className="brand-by">by Laura Miron</span>
          </span>
        </Link>
        <div className="topbar-tools">
          <label className="sr-only" htmlFor="school-year">
            Anul școlar
          </label>
          <select id="school-year" value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {schoolYearOptions(schoolYearOf(new Date())).map((option) => (
              <option key={option} value={option}>
                {formatSchoolYear(option)}
              </option>
            ))}
          </select>
          <ThemeButton />
          {me.data && <UserMenu teacher={me.data} />}
        </div>
      </header>
      {me.data && <Rail admin={me.data.role === 'admin'} onTests={onTests} onClasses={onClasses} panel={open} onToggle={toggle} />}
      <main className="page">
        {me.data?.demo && <p className="warning">{demoText(me.data)}</p>}
        {openPage ? (
          <Outlet />
        ) : loggedOut ? (
          <LoginPage />
        ) : me.error ? (
          <ErrorMessage error={me.error} />
        ) : !me.data ? (
          <p>Se încarcă…</p>
        ) : (
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        )}
      </main>
      {me.data && open === 'clase' && <ClassesPanel year={year} currentClassId={classOfPath(location.pathname)} onClose={() => setPanel(null)} />}
    </div>
  );
}
```

- [ ] **Step 18: Edit `src/ui/brand.css`**

Find this block:

```css
  --font: "Schibsted Grotesk", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif;
  --hand: "Caveat", "Segoe Print", "Bradley Hand", cursive;
  color-scheme: light;
```

Replace it with:

```css
  --font: "Schibsted Grotesk", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif;
  color-scheme: light;
```

- [ ] **Step 19: Edit `src/ui/brand.css`**

Find this block:

```css

/* Header */

```

Replace it with:

```css

/* The student pages' header: the mark and the name, nothing else. */

```

- [ ] **Step 20: Edit `src/ui/brand.css`**

Find this block:

```css
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.25rem;
  padding-block: 0.55rem;
}
```

Replace it with:

```css
  display: flex;
  align-items: center;
  min-height: 3.5rem;
  padding-block: 0.5rem;
}
```

- [ ] **Step 21: Edit `src/ui/brand.css`**

Find this block:

```css
  align-items: center;
  gap: 0.55rem;
  margin-right: auto;
  line-height: 1.2;
  text-decoration: none;
  color: var(--ink);
}
```

Replace it with:

```css
  align-items: center;
  gap: 0.6rem;
  line-height: 1.15;
  text-decoration: none;
  color: var(--text);
}

.brand:hover {
  color: var(--text);
}
```

- [ ] **Step 22: Edit `src/ui/brand.css`**

Find this block:

```css
  flex: none;
  width: 2.25rem;
  height: 2.25rem;
}
```

Replace it with:

```css
  flex: none;
  width: 1.75rem;
  height: 1.75rem;
}
```

- [ ] **Step 23: Edit `src/ui/brand.css`**

Find this block:

```css
.brand-name {
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
}

.main-nav {
  display: flex;
  gap: 0.25rem;
}

.main-nav a {
  padding: 0.35rem 0.75rem;
  border: 2px solid transparent;
  border-radius: 999px;
  font-family: var(--hand);
  font-size: 1.45rem;
  font-weight: 600;
  line-height: 1.2;
  text-decoration: none;
}

.main-nav a[aria-current="page"] {
  border-color: var(--red);
}

.header-tools {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.theme-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.5rem;
  min-height: 2.5rem;
  padding: 0;
  border: 1.5px solid var(--rule);
  border-radius: 999px;
  background: var(--sheet);
  color: var(--ink);
  cursor: pointer;
```

Replace it with:

```css
.brand-name {
  font-size: 1.0625rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.brand-by {
  font-size: 0.75rem;
  color: var(--muted);
}

/* The theme button: a moon in light mode, a sun in dark mode. */
.theme-btn {
  display: inline-grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 1px solid var(--control);
  border-radius: var(--radius);
  background: var(--sheet);
  color: var(--muted);
  cursor: pointer;
```

- [ ] **Step 24: Edit `src/ui/brand.css`**

Find this block:

```css
.theme-btn:hover {
  border-color: var(--ink);
}
```

Replace it with:

```css
.theme-btn:hover {
  border-color: var(--muted);
  color: var(--text);
}
```

- [ ] **Step 25: Edit `src/ui/brand.css`**

Find this block:

```css
.theme-icon {
  width: 1.2rem;
  height: 1.2rem;
}
```

Replace it with:

```css
.theme-icon {
  width: 1rem;
  height: 1rem;
}

/* The teacher app's shell (redesign spec §4): the top bar over everything,
   the 80px bar on the left, the page on the ground beside it, and one side
   panel at a time over the page, beside the bar. */

.shell {
  --bar: 80px;
  --top: 60px;
  display: grid;
  flex: 1;
  grid-template-columns: var(--bar) minmax(0, 1fr);
  grid-template-rows: var(--top) auto;
}

.shell-bare {
  grid-template-columns: minmax(0, 1fr);
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 30;
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 1rem;
  height: var(--top);
  padding-right: 1.5rem;
  border-bottom: 1px solid var(--rule);
  background: var(--sheet);
}

/* The mark sits over the 80px bar; the words start the top bar. */
.topbar .brand {
  gap: 0;
}

.topbar .brand-mark {
  box-sizing: content-box;
  padding-inline: calc((var(--bar) - 1.75rem) / 2);
}

.topbar-tools {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-left: auto;
}

.topbar-tools select {
  min-height: 2.25rem;
  padding-block: 0.25rem;
  font-size: 0.875rem;
}

.rail {
  position: sticky;
  top: var(--top);
  z-index: 20;
  grid-column: 1;
  grid-row: 2;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  height: calc(100vh - var(--top));
  padding: 0.75rem 0.5rem;
  border-right: 1px solid var(--rule);
  background: var(--sheet);
}

.rail-new,
.rail-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  min-height: 3.625rem;
  padding: 0.5rem 0.125rem;
  border: 0;
  border-radius: var(--radius);
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: 0.71875rem;
  font-weight: 600;
  line-height: 1.15;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
}

.rail-item svg {
  width: 1.375rem;
  height: 1.375rem;
}

.rail-item:hover {
  background: var(--raised);
  color: var(--text);
}

.rail-item[aria-current="page"],
.rail-item[aria-expanded="true"] {
  background: var(--active);
  color: var(--text);
}

.rail-new {
  padding-bottom: 0.625rem;
  color: var(--text);
}

.rail-new:hover {
  color: var(--text);
}

.rail-square {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 10px;
  background: var(--ink);
  color: var(--on-ink);
}

.rail-new:hover .rail-square {
  background: var(--ink-hover);
}

.rail-square svg {
  width: 1.125rem;
  height: 1.125rem;
}

.rail-foot {
  margin-top: auto;
}

.shell > .page {
  grid-column: 2;
  grid-row: 2;
  min-width: 0;
  padding: 1.5rem 2rem 3rem;
}

.shell-bare > .page {
  grid-column: 1;
  width: 100%;
  max-width: 70rem;
  margin-inline: auto;
  padding-inline: 1rem;
}

/* The account menu under the initials. */
.user {
  position: relative;
}

.user-button {
  width: 2.25rem;
  height: 2.25rem;
  border: 0;
  border-radius: 50%;
  background: var(--active);
  color: var(--text);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 700;
  cursor: pointer;
}

.user-button:hover,
.user-button[aria-expanded="true"] {
  background: var(--control);
}

.user-menu {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  width: 15rem;
  padding: 0.375rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-panel);
  background: var(--sheet);
  box-shadow: var(--float);
}

.user-who {
  display: flex;
  flex-direction: column;
  margin: 0 0 0.25rem;
  padding: 0.5rem 0.625rem 0.625rem;
  border-bottom: 1px solid var(--line);
  overflow-wrap: anywhere;
}

.user-who span {
  font-size: 0.8125rem;
  color: var(--muted);
}

.user-menu a,
.user-menu button {
  display: flex;
  align-items: center;
  min-height: 2.25rem;
  padding: 0 0.625rem;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 500;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}

.user-menu a:hover,
.user-menu button:hover {
  background: var(--raised);
  color: var(--text);
}

/* A side panel: beside the bar, over the page, 384px wide. */
.panel {
  position: fixed;
  top: var(--top);
  bottom: 0;
  left: var(--bar);
  z-index: 25;
  display: flex;
  flex-direction: column;
  width: 24rem;
  max-width: calc(100vw - var(--bar));
  overflow-y: auto;
  border-right: 1px solid var(--rule);
  background: var(--sheet);
  box-shadow: var(--float);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.125rem 1rem 0.75rem 1.25rem;
}

.panel-head h2 {
  margin: 0;
  font-size: 1.125rem;
}

.panel-close {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  background: none;
  color: var(--muted);
  cursor: pointer;
}

.panel-close:hover {
  background: var(--raised);
  color: var(--text);
}

.panel-close svg {
  width: 1.125rem;
  height: 1.125rem;
}

.panel-body {
  margin: 0;
  padding: 0 1.25rem;
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin-top: auto;
  padding: 1rem 1.25rem 1.25rem;
}

/* The classes in the panel: each one a link with its tests in work. */
.class-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0 1rem;
}

.class-item {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-panel);
  color: var(--text);
  text-decoration: none;
}

.class-item:hover {
  border-color: var(--control);
  background: var(--raised);
  color: var(--text);
}

.class-item[aria-current="page"] {
  border-color: var(--ink);
  background: var(--ink-tint);
}

.class-item-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.125rem;
}

.class-item-head span,
.class-item-test {
  font-size: 0.8125rem;
  color: var(--muted);
}
```

- [ ] **Step 26: Edit `src/ui/brand.css`**

Find this block:

```css
  padding-block: 1.25rem 2.5rem;
}

.site-footer {
  border-top: 1px solid var(--rule);
  background: var(--sheet);
  color: var(--muted);
  font-size: 0.9rem;
}

.site-footer p {
  margin: 0;
  padding-block: 0.75rem;
}
```

Replace it with:

```css
  padding-block: 1.25rem 2.5rem;
}
```

- [ ] **Step 27: Edit `src/ui/brand.css`**

Find this block:

```css

  .result-files {
    position: sticky;
    top: 0.75rem;
    max-height: calc(100vh - 1.5rem);
    display: flex;
```

Replace it with:

```css

  /* Under the teacher app's top bar (--top), which also stays on screen. */
  .result-files {
    position: sticky;
    top: calc(var(--top, 0px) + 0.75rem);
    max-height: calc(100vh - var(--top, 0px) - 1.5rem);
    display: flex;
```

- [ ] **Step 28: Edit `admin/index.html`**

Find this block:

```html
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&family=Caveat:wght@600&display=swap"
    />
```

Replace it with:

```html
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&display=swap"
    />
```

- [ ] **Step 29: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  111 passed | 1 skipped (112)`, `Tests  1706 passed | 3 skipped (1709)`.

- [ ] **Step 30: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 31: Commit**

```bash
git add src/admin/Layout.tsx src/admin/Layout.test.tsx src/admin/shell src/ui/brand.css admin/index.html src/test/setup.ts src/admin/pages/LoginPage.test.tsx src/admin/pages/TestsPage.test.tsx src/admin/pages/ClassesPage.test.tsx src/admin/settingsPage/AccountsSection.test.tsx
git commit -m "Add the new shell: the 80px bar, the top bar, the account menu and Clasele tale"
```

### Task 5: De făcut

"De făcut" in the bar shows how many things wait and opens "Ce ai de făcut": one card per thing, with one button to its test. `todo.ts` holds the three cases of spec §5. "Clasele tale" shows a waiting test in orange, with its stage and what waits. The tests of the year are read again after every change and every minute (ruling 9).

**Files:**
- Create: `src/admin/shell/todo.ts`, `src/admin/shell/todo.test.ts`, `src/admin/shell/TodoPanel.tsx`
- Modify: `src/admin/shell/Rail.tsx`, `src/admin/shell/ClassesPanel.tsx`, `src/admin/Layout.tsx`, `src/ui/brand.css`
- Test: `src/admin/Layout.test.tsx`

**Interfaces:**
- Consumes: `TestSummary.barem` (Task 2); `Panel`, `Rail`, `ClassesPanel` (Task 4); `countLabel`.
- Produces:
  - `type TodoStage = 'Pregătire' | 'Verificare' | 'Rezultate'`; `interface TodoItem { code; testTitle; className; stage; task; text; action; short }`; `todoOf(test: TestSummary): TodoItem | null`; `todoList(tests: TestSummary[]): TodoItem[]` (by stage, then in list order).
  - `TodoPanel({ items, others, onClose })`; `PanelName = 'clase' | 'todo'`; `Rail` gains `todoCount: number` (the button is named "De făcut: N lucruri" when N > 0); `ClassesPanel` gains `todo: TodoItem[]`.

- [ ] **Step 1: Create `src/admin/shell/todo.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { TestSummary } from '../../../shared/api.ts';
import { fakeTest } from '../../test/fakeApi.ts';
import { todoList, todoOf } from './todo.ts';

const summary = (overrides: Partial<TestSummary>): TestSummary => fakeTest({ title: 'Ecuații', ...overrides }).test;
const generated = { request: 'none', unchecked: true } as const;
const graded = { status: 'done', gradedCount: 24, submittedCount: 24 } as const;

describe('todoOf', () => {
  it('asks to check a generated barem of a draft or open test', () => {
    for (const status of ['draft', 'open'] as const) {
      expect(todoOf(summary({ status, barem: generated }))).toMatchObject({
        stage: 'Pregătire',
        task: 'Verifică baremul generat',
        text: 'Până îl confirmi, baremul nu se folosește la corectare.',
        action: 'Deschide',
        short: 'baremul de verificat',
        testTitle: 'Ecuații',
        className: '6E2',
        code: '6E2-26T1',
      });
    }
  });

  it('waits while a new barem is generated, and needs nothing for a checked barem', () => {
    expect(todoOf(summary({ status: 'draft', barem: { request: 'requested', unchecked: true } }))).toBeNull();
    expect(todoOf(summary({ status: 'draft', barem: { request: 'none', unchecked: false } }))).toBeNull();
  });

  it('asks to decide the points to check', () => {
    expect(todoOf(summary({ ...graded, flagCount: 3 }))).toMatchObject({
      stage: 'Verificare',
      task: 'Decide 3 puncte nesigure',
      text: '24 de lucrări corectate. Punctele nesigure te așteaptă pe tine.',
      action: 'Începe',
      short: '3 puncte nesigure',
    });
    expect(todoOf(summary({ status: 'evaluating', gradedCount: 1, flagCount: 1 }))).toMatchObject({
      task: 'Decide 1 punct nesigur',
      text: '1 lucrare corectată. Punctele nesigure te așteaptă pe tine.',
      short: '1 punct nesigur',
    });
  });

  it('asks to publish checked results that are not published', () => {
    expect(todoOf(summary({ ...graded }))).toMatchObject({
      stage: 'Rezultate',
      task: 'Publică rezultatele',
      text: '24 de lucrări verificate. Fiecare elev primește linkul lui după ce publici.',
      short: 'nepublicate',
    });
    expect(todoOf(summary({ ...graded, publishedCount: 10 }))?.stage).toBe('Rezultate');
  });

  it('needs nothing once the results are open or every paper is published', () => {
    expect(todoOf(summary({ ...graded, resultsOpen: true }))).toBeNull();
    expect(todoOf(summary({ ...graded, publishedCount: 24 }))).toBeNull();
  });

  it('needs nothing for a test without graded papers, a test in work, or an archived test', () => {
    expect(todoOf(summary({ status: 'done', gradedCount: 0 }))).toBeNull();
    expect(todoOf(summary({ status: 'open' }))).toBeNull();
    expect(todoOf(summary({ status: 'evaluating', gradedCount: 3 }))).toBeNull();
    expect(todoOf(summary({ ...graded, flagCount: 2, archived: true }))).toBeNull();
  });
});

describe('todoList', () => {
  it('lists Pregătire, then Verificare, then Rezultate, newest first within each', () => {
    const items = todoList([
      summary({ code: 'A', ...graded }),
      summary({ code: 'B', ...graded, flagCount: 1 }),
      summary({ code: 'C', status: 'open' }),
      summary({ code: 'D', status: 'draft', barem: generated }),
      summary({ code: 'E', ...graded, flagCount: 2 }),
    ]);
    expect(items.map((item) => `${item.stage} ${item.code}`)).toEqual(['Pregătire D', 'Verificare B', 'Verificare E', 'Rezultate A']);
  });
});
```

- [ ] **Step 2: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createFakeApi, fakeTeacher, fakeTest } from '../test/fakeApi.ts';
```

Replace it with:

```tsx
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, fakeTeacher, fakeTest } from '../test/fakeApi.ts';
```

- [ ] **Step 3: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx

const menu = () => screen.findByRole('navigation', { name: 'Meniu' });

```

Replace it with:

```tsx

// Three things wait: a generated barem, points to check, results to publish.
const withTodo = () =>
  createFakeApi({
    classes: [
      { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 2, name: '6E3', schoolYear: 2026, archived: false, studentCount: 0 },
    ],
    students: {},
    tests: [
      fakeTest({ code: '6E2-26T3', title: 'Logaritmi', status: 'done', gradedCount: 20 }),
      fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'done', gradedCount: 24, flagCount: 3 }),
      fakeTest({ code: '6E3-26T1', title: 'Inducție', classId: 2, className: '6E3', barem: { request: 'none', unchecked: true } }),
      fakeTest({ code: '6E3-26T2', title: 'Mulțimi', classId: 2, className: '6E3', status: 'open' }),
      fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'done', gradedCount: 20, resultsOpen: true }),
    ],
  });

const menu = () => screen.findByRole('navigation', { name: 'Meniu' });

afterEach(() => {
  vi.useRealTimers();
});

```

- [ ] **Step 4: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx

  it('has Test nou, Teste and Clase in the bar', async () => {
    renderAdmin('/', withClasses());
```

Replace it with:

```tsx

  it('has Test nou, Teste, Clase and De făcut in the bar', async () => {
    renderAdmin('/', withClasses());
```

- [ ] **Step 5: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
    expect(within(bar).getByRole('button', { name: 'Clase' })).toHaveAttribute('aria-expanded', 'false');
  });
```

Replace it with:

```tsx
    expect(within(bar).getByRole('button', { name: 'Clase' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(bar).getByRole('button', { name: 'De făcut' })).toHaveAttribute('aria-expanded', 'false');
  });
```

- [ ] **Step 6: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
    expect(screen.queryByRole('link', { name: 'Contul meu' })).not.toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(screen.queryByRole('link', { name: 'Contul meu' })).not.toBeInTheDocument();
  });
});

describe('De făcut', () => {
  it('shows in the bar how many things wait', async () => {
    renderAdmin('/', withTodo());
    expect(await within(await menu()).findByRole('button', { name: 'De făcut: 3 lucruri' })).toHaveTextContent('De făcut3');
  });

  it('lists the three things in its panel, each with a button to its test', async () => {
    renderAdmin('/', withTodo(), <LocationProbe />);
    await userEvent.click(await within(await menu()).findByRole('button', { name: /^De făcut/ }));
    const panel = screen.getByRole('complementary', { name: 'Ce ai de făcut' });
    const cards = within(panel).getAllByRole('listitem');
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      'Verifică baremul generat',
      'Decide 3 puncte nesigure',
      'Publică rezultatele',
    ]);
    expect(cards[0]).toHaveTextContent('PregătireInducție · 6E3');
    expect(within(panel).getByText('Celălalt test în lucru nu are nevoie de tine acum.')).toBeInTheDocument();
    const start = within(cards[1]!).getByRole('link', { name: 'Începe: Ecuații, 6E2' });
    expect(start).toHaveAttribute('href', '/teste/6E2-26T2');
    await userEvent.click(start);
    await expectLocation('/teste/6E2-26T2');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('reads the tests of the year again after a change and every minute', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const api = withTodo();
    renderAdmin('/cont', api);
    await userEvent.type(await screen.findByLabelText('Parola de acum'), 'parola-veche');
    await userEvent.type(screen.getByLabelText(/^Parola nouă/), 'parola-noua');
    expect(api.listTests).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Schimbă parola' }));
    await vi.waitFor(() => expect(api.listTests).toHaveBeenCalledTimes(2));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(api.listTests).toHaveBeenCalledTimes(3);
  });

  it('says so when nothing waits', async () => {
    renderAdmin('/', withClasses());
    await userEvent.click(within(await menu()).getByRole('button', { name: 'De făcut' }));
    expect(screen.getByText('Nimic nu te așteaptă acum.')).toBeInTheDocument();
  });

  it('is open alone: Clase closes it, and it closes Clase', async () => {
    renderAdmin('/', withTodo());
    const bar = await menu();
    await userEvent.click(await within(bar).findByRole('button', { name: /^De făcut/ }));
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    expect(screen.getAllByRole('complementary').map((panel) => panel.getAttribute('aria-labelledby'))).toEqual(['panel-clase-title']);
    await userEvent.click(within(bar).getByRole('button', { name: /^De făcut/ }));
    expect(screen.getAllByRole('complementary').map((panel) => panel.getAttribute('aria-labelledby'))).toEqual(['panel-todo-title']);
  });
```

- [ ] **Step 7: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx

  it('says so when the year has no class', async () => {
```

Replace it with:

```tsx

  it('says what waits in a test, in orange', async () => {
    renderAdmin('/', withTodo());
    const bar = await menu();
    await within(bar).findByRole('button', { name: /^De făcut: / });
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    const list = screen.getByRole('navigation', { name: 'Clasele tale' });
    const first = within(list).getByRole('link', { name: /^6E2/ });
    expect(Array.from(first.querySelectorAll('.class-item-test')).map((line) => [line.textContent, line.className])).toEqual([
      ['Logaritmi · Rezultate · nepublicate', 'class-item-test is-waiting'],
      ['Ecuații · Verificare · 3 puncte nesigure', 'class-item-test is-waiting'],
    ]);
    expect(within(list).getByRole('link', { name: /^6E3/ })).toHaveTextContent('Inducție · Pregătire · baremul de verificatMulțimi · Deschis');
  });

  it('says so when the year has no class', async () => {
```

- [ ] **Step 8: Run the tests to see them fail**

Run: `npx vitest run src/admin/shell/todo.test.ts src/admin/Layout.test.tsx`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  7 failed | 8 passed (15)`: `./todo.ts` does not exist, and the bar has no button "De făcut".

- [ ] **Step 9: Create `src/admin/shell/todo.ts`**

```ts
import type { TestSummary } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';

export type TodoStage = 'Pregătire' | 'Verificare' | 'Rezultate';

// One thing that waits on the teacher, and the test it is in.
export interface TodoItem {
  code: string;
  testTitle: string;
  className: string;
  stage: TodoStage;
  task: string;
  text: string;
  action: string;
  // What waits, in a few words, after the stage ("Rezultate · nepublicate").
  short: string;
}

// What a test waits for from the teacher, if anything (redesign spec §5):
// exactly three cases, checked in this order.
export function todoOf(test: TestSummary): TodoItem | null {
  if (test.archived) return null;
  const item = { code: test.code, testTitle: test.title, className: test.className };
  if ((test.status === 'draft' || test.status === 'open') && test.barem.unchecked && test.barem.request === 'none') {
    return {
      ...item,
      stage: 'Pregătire',
      task: 'Verifică baremul generat',
      text: 'Până îl confirmi, baremul nu se folosește la corectare.',
      action: 'Deschide',
      short: 'baremul de verificat',
    };
  }
  if (test.flagCount > 0) {
    return {
      ...item,
      stage: 'Verificare',
      task: `Decide ${countLabel(test.flagCount, 'punct nesigur', 'puncte nesigure')}`,
      text: `${countLabel(test.gradedCount, 'lucrare corectată', 'lucrări corectate')}. Punctele nesigure te așteaptă pe tine.`,
      action: 'Începe',
      short: countLabel(test.flagCount, 'punct nesigur', 'puncte nesigure'),
    };
  }
  if (test.status === 'done' && test.gradedCount > 0 && !test.resultsOpen && test.publishedCount < test.gradedCount) {
    return {
      ...item,
      stage: 'Rezultate',
      task: 'Publică rezultatele',
      text: `${countLabel(test.gradedCount, 'lucrare verificată', 'lucrări verificate')}. Fiecare elev primește linkul lui după ce publici.`,
      action: 'Deschide',
      short: 'nepublicate',
    };
  }
  return null;
}

const STAGE_ORDER: TodoStage[] = ['Pregătire', 'Verificare', 'Rezultate'];

// "De făcut" for a list of tests: by stage, in the order of the list
// (newest first) within a stage.
export function todoList(tests: TestSummary[]): TodoItem[] {
  const items = tests.map(todoOf).filter((item): item is TodoItem => item !== null);
  return items.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
}
```

- [ ] **Step 10: Create `src/admin/shell/TodoPanel.tsx`**

```tsx
import { Link } from 'react-router';
import { countLabel } from '../../ui/format.ts';
import { Panel } from './Panel.tsx';
import type { TodoItem } from './todo.ts';

// "Ce ai de făcut" (redesign spec §4): one card per thing that waits on the
// teacher, with one button to its test; the first button is the filled one.
// `others` counts the tests of the year in work that need nothing now.
export function TodoPanel({ items, others, onClose }: { items: TodoItem[]; others: number; onClose(): void }) {
  return (
    <Panel id="panel-todo" title="Ce ai de făcut" onClose={onClose}>
      {items.length === 0 ? (
        <p className="panel-body hint">Nimic nu te așteaptă acum.</p>
      ) : (
        <ol className="todo-list">
          {items.map((item, index) => (
            <li key={item.code} className="todo-card">
              <p className="todo-test">
                <span className="tag tag-wait">{item.stage}</span>
                {item.testTitle} · {item.className}
              </p>
              <h3>{item.task}</h3>
              <p className="todo-text">{item.text}</p>
              <Link
                className={index === 0 ? 'button button-small' : 'button-quiet button-small'}
                to={`/teste/${item.code}`}
                aria-label={`${item.action}: ${item.testTitle}, ${item.className}`}
              >
                {item.action}
              </Link>
            </li>
          ))}
        </ol>
      )}
      {others > 0 && (
        <p className="panel-foot">
          {others === 1
            ? 'Celălalt test în lucru nu are nevoie de tine acum.'
            : `Celelalte ${countLabel(others, 'test', 'teste')} în lucru nu au nevoie de tine acum.`}
        </p>
      )}
    </Panel>
  );
}
```

- [ ] **Step 11: Edit `src/admin/shell/Rail.tsx`**

Find this block:

```tsx
import { Link, NavLink } from 'react-router';
import { IconClasses, IconPlus, IconSettings, IconTests } from './icons.tsx';

export type PanelName = 'clase';

// The 80px bar on the left (redesign spec §4): Test nou, Teste, Clase (opens
// its panel) and, at the bottom, Setări for an administrator. Each item has
// its icon and a short word under it.
export function Rail({
```

Replace it with:

```tsx
import { Link, NavLink } from 'react-router';
import { countLabel } from '../../ui/format.ts';
import { IconClasses, IconPlus, IconSettings, IconTests, IconTodo } from './icons.tsx';

export type PanelName = 'clase' | 'todo';

// The 80px bar on the left (redesign spec §4): Test nou, Teste, Clase and De
// făcut (each opens its panel; De făcut shows how many things wait) and, at
// the bottom, Setări for an administrator. Each item has its icon and a short
// word under it.
export function Rail({
```

- [ ] **Step 12: Edit `src/admin/shell/Rail.tsx`**

Find this block:

```tsx
  onClasses,
  panel,
```

Replace it with:

```tsx
  onClasses,
  todoCount,
  panel,
```

- [ ] **Step 13: Edit `src/admin/shell/Rail.tsx`**

Find this block:

```tsx
  onClasses: boolean;
  panel: PanelName | null;
```

Replace it with:

```tsx
  onClasses: boolean;
  todoCount: number;
  panel: PanelName | null;
```

- [ ] **Step 14: Edit `src/admin/shell/Rail.tsx`**

Find this block:

```tsx
      </button>
      {admin && (
```

Replace it with:

```tsx
      </button>
      <button
        type="button"
        className="rail-item"
        aria-label={todoCount > 0 ? `De făcut: ${countLabel(todoCount, 'lucru', 'lucruri')}` : 'De făcut'}
        aria-expanded={panel === 'todo'}
        aria-controls={panel === 'todo' ? 'panel-todo' : undefined}
        onClick={() => onToggle('todo')}
      >
        <IconTodo />
        <span className="rail-word">De făcut</span>
        {todoCount > 0 && (
          <span className="rail-badge" aria-hidden="true">
            {todoCount}
          </span>
        )}
      </button>
      {admin && (
```

- [ ] **Step 15: Edit `src/admin/shell/ClassesPanel.tsx`**

Find this block:

```tsx
import { Panel } from './Panel.tsx';

// A test still in work: not finished yet.
function inWork(test: TestSummary): boolean {
  return !test.archived && test.status !== 'done';
}
```

Replace it with:

```tsx
import { Panel } from './Panel.tsx';
import type { TodoItem } from './todo.ts';

// A test still in work: not finished yet, or finished with a thing to do.
function inWork(test: TestSummary, waits: boolean): boolean {
  return !test.archived && (test.status !== 'done' || waits);
}
```

- [ ] **Step 16: Edit `src/admin/shell/ClassesPanel.tsx`**

Find this block:

```tsx
// "Clasele tale" (redesign spec §4): the classes of the school year that are
// not archived, each with its students and its tests in work; the class of
// the page is marked.
export function ClassesPanel({ year, currentClassId, onClose }: { year: number; currentClassId: number | null; onClose(): void }) {
  const api = useApi();
```

Replace it with:

```tsx
// "Clasele tale" (redesign spec §4): the classes of the school year that are
// not archived, each with its students and its tests in work; a test that
// waits on the teacher is orange and says what waits ("Logaritmi · Rezultate ·
// nepublicate"). The class of the page is marked.
export function ClassesPanel({
  year,
  todo,
  currentClassId,
  onClose,
}: {
  year: number;
  todo: TodoItem[];
  currentClassId: number | null;
  onClose(): void;
}) {
  const api = useApi();
```

- [ ] **Step 17: Edit `src/admin/shell/ClassesPanel.tsx`**

Find this block:

```tsx
  const archived = classes.data?.filter((item) => item.archived).length ?? 0;

```

Replace it with:

```tsx
  const archived = classes.data?.filter((item) => item.archived).length ?? 0;
  const todoOf = (test: TestSummary) => todo.find((item) => item.code === test.code);

```

- [ ] **Step 18: Edit `src/admin/shell/ClassesPanel.tsx`**

Find this block:

```tsx
          {active.map((item) => {
            const work = (tests.data ?? []).filter((test) => test.classId === item.id && inWork(test));
            return (
```

Replace it with:

```tsx
          {active.map((item) => {
            const work = (tests.data ?? []).filter((test) => test.classId === item.id && inWork(test, todoOf(test) !== undefined));
            return (
```

- [ ] **Step 19: Edit `src/admin/shell/ClassesPanel.tsx`**

Find this block:

```tsx
                ) : (
                  work.map((test) => (
                    <span key={test.code} className="class-item-test">
                      {test.title} · {testStatusLabel(test.status)}
                    </span>
                  ))
                )}
```

Replace it with:

```tsx
                ) : (
                  work.map((test) => {
                    const waiting = todoOf(test);
                    return (
                      <span key={test.code} className={waiting ? 'class-item-test is-waiting' : 'class-item-test'}>
                        {test.title} · {waiting ? `${waiting.stage} · ${waiting.short}` : testStatusLabel(test.status)}
                      </span>
                    );
                  })
                )}
```

- [ ] **Step 20: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
import { Rail, type PanelName } from './shell/Rail.tsx';
import { UserMenu } from './shell/UserMenu.tsx';
```

Replace it with:

```tsx
import { Rail, type PanelName } from './shell/Rail.tsx';
import { TodoPanel } from './shell/TodoPanel.tsx';
import { todoList } from './shell/todo.ts';
import { UserMenu } from './shell/UserMenu.tsx';
```

- [ ] **Step 21: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
  // The open panel and the page it was opened on: another page closes it.
```

Replace it with:

```tsx
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
  // The tests of the year: "De făcut" and the panel of the classes read them.
  // They are read again every minute while the page is open (the robot ends a
  // grading on its own) and after every change (below).
  const tests = useQuery({
    queryKey: ['tests', year],
    queryFn: () => api.listTests(year),
    enabled: Boolean(me.data),
    refetchInterval: 60_000,
  });
  const todo = todoList(tests.data ?? []);
  const others = (tests.data ?? []).filter((test) => !test.archived && test.status !== 'done' && !todo.some((item) => item.code === test.code)).length;
  // The open panel and the page it was opened on: another page closes it.
```

- [ ] **Step 22: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx

  // A start, a regrade or a retry changes the papers the demo line shows:
  // every change a logged-in teacher makes reads the account again.
  const queryClient = useQueryClient();
```

Replace it with:

```tsx

  // A start, a regrade or a retry changes the papers the demo line shows, and
  // a change can end or add a thing in "De făcut": every change a logged-in
  // teacher makes reads the account and the tests of the year again.
  const queryClient = useQueryClient();
```

- [ ] **Step 23: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
        const changed = event.type === 'updated' && event.action.type === 'success';
        if (changed && queryClient.getQueryData(['me'])) void queryClient.invalidateQueries({ queryKey: ['me'] });
      }),
```

Replace it with:

```tsx
        const changed = event.type === 'updated' && event.action.type === 'success';
        if (changed && queryClient.getQueryData(['me'])) {
          void queryClient.invalidateQueries({ queryKey: ['me'] });
          void queryClient.invalidateQueries({ queryKey: ['tests'] });
        }
      }),
```

- [ ] **Step 24: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
      </header>
      {me.data && <Rail admin={me.data.role === 'admin'} onTests={onTests} onClasses={onClasses} panel={open} onToggle={toggle} />}
      <main className="page">
```

Replace it with:

```tsx
      </header>
      {me.data && (
        <Rail admin={me.data.role === 'admin'} onTests={onTests} onClasses={onClasses} todoCount={todo.length} panel={open} onToggle={toggle} />
      )}
      <main className="page">
```

- [ ] **Step 25: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
      </main>
      {me.data && open === 'clase' && <ClassesPanel year={year} currentClassId={classOfPath(location.pathname)} onClose={() => setPanel(null)} />}
    </div>
```

Replace it with:

```tsx
      </main>
      {me.data && open === 'clase' && (
        <ClassesPanel year={year} todo={todo} currentClassId={classOfPath(location.pathname)} onClose={() => setPanel(null)} />
      )}
      {me.data && open === 'todo' && <TodoPanel items={todo} others={others} onClose={() => setPanel(null)} />}
    </div>
```

- [ ] **Step 26: Edit `src/ui/brand.css`**

Find this block:

```css

.shell > .page {
```

Replace it with:

```css

.rail-badge {
  position: absolute;
  top: 0.25rem;
  right: 0.5rem;
  display: grid;
  place-items: center;
  min-width: 1.125rem;
  height: 1.125rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--orange);
  color: var(--sheet);
  font-size: 0.6875rem;
  font-weight: 700;
}

.shell > .page {
```

- [ ] **Step 27: Edit `src/ui/brand.css`**

Find this block:

```css
.class-item-test {
  font-size: 0.8125rem;
```

Replace it with:

```css
.class-item-test {
  font-size: 0.8125rem;
  color: var(--muted);
}

.class-item-test.is-waiting {
  color: var(--orange);
  font-weight: 600;
}

/* "Ce ai de făcut": one card per thing that waits. */
.todo-list {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  margin: 0;
  padding: 0 1rem;
  list-style: none;
}

.todo-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.375rem;
  padding: 1rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-panel);
}

.todo-card:first-child {
  border-color: var(--orange-mark);
}

.todo-test {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.5rem;
  margin: 0;
  font-size: 0.8125rem;
  color: var(--muted);
}

.todo-card h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.todo-text {
  margin: 0 0 0.25rem;
  font-size: 0.875rem;
  color: var(--muted);
}

.panel-foot {
  margin: 0;
  padding: 1rem 1.25rem 1.25rem;
  font-size: 0.8125rem;
```

- [ ] **Step 28: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  112 passed | 1 skipped (113)`, `Tests  1719 passed | 3 skipped (1722)`.

- [ ] **Step 29: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 30: Commit**

```bash
git add src/admin/shell src/admin/Layout.tsx src/admin/Layout.test.tsx src/ui/brand.css
git commit -m "Add De făcut: its three cases, its number in the bar and its panel"
```

### Task 6: The phone: the bottom bar and the ☰ menu

Below 900px the bar moves to the bottom of the screen (Test nou, Teste, Clase, De făcut; Setări leaves it), the top bar keeps the lockup and ☰, and ☰ drops a menu with Setări (administrators), the school year, "Temă întunecată" (a switch), the account, "Contul meu" and "Ieși din cont". The panels cover the screen between the two bars. The theme controls share one state; logout has one hook.

**Files:**
- Create: `src/ui/useTheme.ts`, `src/admin/shell/useLogout.ts`, `src/admin/shell/YearSelect.tsx`, `src/admin/shell/PhoneMenu.tsx`
- Modify: `src/ui/ThemeButton.tsx`, `src/admin/pages/AccountPage.tsx`, `src/admin/shell/UserMenu.tsx`, `src/admin/shell/icons.tsx`, `src/admin/shell/Rail.tsx`, `src/admin/Layout.tsx`, `src/ui/brand.css`
- Test: `src/ui/ThemeButton.test.tsx`, `src/admin/Layout.test.tsx`

**Interfaces:**
- Consumes: `Rail`, `PanelName`, `UserMenu`, the icons (Tasks 4-5); `ErrorMessage`; `saveTheme`, `otherTheme`, `storedTheme`, `currentTheme`.
- Produces:
  - `useTheme(): { theme: Theme; toggle(): void }` (the page's `data-theme`, else the saved choice); `ThemeSwitch()` (`role="switch"`, named "Temă întunecată") beside `ThemeButton` in `ThemeButton.tsx`.
  - `useLogout()` (the mutation of "Ieși din cont"), `YearSelect({ id, labelClassName? })`, `PhoneMenu({ teacher, onClose })` (a `section` named "Mai mult", id `phone-menu`), `IconMenu`; `PanelName = 'clase' | 'todo' | 'menu'`; in the top bar a button named "Meniu" (class `menu-button`).

- [ ] **Step 1: Edit `src/ui/ThemeButton.test.tsx`**

Find this block:

```tsx
import { THEME_KEY } from './theme.ts';
import { ThemeButton } from './ThemeButton.tsx';

```

Replace it with:

```tsx
import { THEME_KEY } from './theme.ts';
import { ThemeButton, ThemeSwitch } from './ThemeButton.tsx';

```

- [ ] **Step 2: Edit `src/ui/ThemeButton.test.tsx`**

Find this block:

```tsx
  });
});
```

Replace it with:

```tsx
  });

  it('follows the theme the page shows', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<ThemeButton />);
    expect(screen.getByRole('button', { name: 'Temă luminoasă' })).toBeInTheDocument();
  });
});

describe('the theme switch', () => {
  it('switches the theme, and the button shows the change', async () => {
    render(
      <>
        <ThemeButton />
        <ThemeSwitch />
      </>,
    );
    const toggle = screen.getByRole('switch', { name: 'Temă întunecată' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: 'Temă luminoasă' }));
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });
});
```

- [ ] **Step 3: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
    expect(screen.queryByRole('link', { name: 'Contul meu' })).not.toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(screen.queryByRole('link', { name: 'Contul meu' })).not.toBeInTheDocument();
  });
});

describe('the phone menu', () => {
  it('opens from ☰ with Setări, the school year, the theme and the account', async () => {
    renderAdmin('/', withClasses());
    await menu();
    const burger = screen.getByRole('button', { name: 'Meniu' });
    await userEvent.click(burger);
    expect(burger).toHaveAttribute('aria-expanded', 'true');
    const more = screen.getByRole('region', { name: 'Mai mult' });
    expect(within(more).getByRole('link', { name: 'Setări' })).toHaveAttribute('href', '/setari');
    expect(within(more).getByLabelText('Anul școlar')).toHaveValue('2026');
    expect(within(more).getByText('profesor@example.com')).toBeInTheDocument();
    expect(within(more).getByRole('link', { name: 'Contul meu' })).toHaveAttribute('href', '/cont');
    expect(within(more).getByRole('button', { name: 'Ieși din cont' })).toBeInTheDocument();

    await userEvent.click(within(more).getByRole('switch', { name: 'Temă întunecată' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Temă luminoasă' })).toBeInTheDocument();
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
  });

  it('changes the school year for every page', async () => {
    renderAdmin('/', withClasses());
    await menu();
    await userEvent.click(screen.getByRole('button', { name: 'Meniu' }));
    await userEvent.selectOptions(within(screen.getByRole('region', { name: 'Mai mult' })).getByLabelText('Anul școlar'), '2027');
    expect(await screen.findByRole('heading', { name: 'Teste 2027-2028' })).toBeInTheDocument();
  });

  it('shows no Setări to a teacher', async () => {
    renderAdmin('/', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher' }) }));
    await menu();
    await userEvent.click(screen.getByRole('button', { name: 'Meniu' }));
    expect(within(screen.getByRole('region', { name: 'Mai mult' })).queryByRole('link', { name: 'Setări' })).not.toBeInTheDocument();
  });

  it('closes on ☰, on Esc, on a tap outside it, on a page, and when a panel opens', async () => {
    renderAdmin('/', withClasses(), <LocationProbe />);
    const bar = await menu();
    const burger = screen.getByRole('button', { name: 'Meniu' });
    const isOpen = () => screen.queryByRole('region', { name: 'Mai mult' }) !== null;
    await userEvent.click(burger);
    await userEvent.click(burger);
    expect(isOpen()).toBe(false);
    await userEvent.click(burger);
    await userEvent.keyboard('{Escape}');
    expect(isOpen()).toBe(false);
    await userEvent.click(burger);
    await userEvent.click(screen.getByRole('main'));
    expect(isOpen()).toBe(false);
    await userEvent.click(burger);
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    expect(isOpen()).toBe(false);
    await userEvent.click(burger);
    await userEvent.click(within(screen.getByRole('region', { name: 'Mai mult' })).getByRole('link', { name: 'Contul meu' }));
    await expectLocation('/cont');
    expect(isOpen()).toBe(false);
  });
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx vitest run src/ui/ThemeButton.test.tsx src/admin/Layout.test.tsx`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  6 failed | 18 passed (24)`: there is no button "Meniu", `ThemeSwitch` does not exist, and the theme button does not follow a theme the page changes.

- [ ] **Step 5: Create `src/ui/useTheme.ts`**

```ts
import { useSyncExternalStore } from 'react';
import { currentTheme, otherTheme, saveTheme, storedTheme, type Theme } from './theme.ts';

const listeners = new Set<() => void>();

// The theme on screen: the page's data-theme (public/theme.js sets it before
// the page paints), else the saved choice.
function shownTheme(): Theme {
  const shown = document.documentElement.getAttribute('data-theme');
  return shown === 'dark' || shown === 'light' ? shown : currentTheme(storedTheme());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// The theme for every theme control of the page (the top bar's button, the
// phone menu's switch): a change in one shows in the others.
export function useTheme(): { theme: Theme; toggle(): void } {
  const theme = useSyncExternalStore(subscribe, shownTheme);
  const toggle = () => {
    saveTheme(otherTheme(shownTheme()));
    for (const listener of listeners) listener();
  };
  return { theme, toggle };
}
```

- [ ] **Step 6: Edit `src/ui/ThemeButton.tsx`**

Find this block:

```tsx
import { useState } from 'react';
import { currentTheme, otherTheme, saveTheme, storedTheme } from './theme.ts';

```

Replace it with:

```tsx
import { otherTheme } from './theme.ts';
import { useTheme } from './useTheme.ts';

```

- [ ] **Step 7: Edit `src/ui/ThemeButton.tsx`**

Find this block:

```tsx
export function ThemeButton() {
  const [theme, setTheme] = useState(() => currentTheme(storedTheme()));
  const next = otherTheme(theme);
  return (
    <button
      type="button"
      className="theme-btn"
      aria-label={next === 'dark' ? 'Temă întunecată' : 'Temă luminoasă'}
      onClick={() => {
        saveTheme(next);
        setTheme(next);
      }}
    >
      {next === 'dark' ? (
```

Replace it with:

```tsx
export function ThemeButton() {
  const { theme, toggle } = useTheme();
  const next = otherTheme(theme);
  return (
    <button type="button" className="theme-btn" aria-label={next === 'dark' ? 'Temă întunecată' : 'Temă luminoasă'} onClick={toggle}>
      {next === 'dark' ? (
```

- [ ] **Step 8: Edit `src/ui/ThemeButton.tsx`**

Find this block:

```tsx
  );
}
```

Replace it with:

```tsx
  );
}

// The phone menu's row: "Temă întunecată" with a switch.
export function ThemeSwitch() {
  const { theme, toggle } = useTheme();
  return (
    <button type="button" role="switch" aria-checked={theme === 'dark'} className="menu-row" onClick={toggle}>
      <span>Temă întunecată</span>
      <span className="switch" aria-hidden="true" />
    </button>
  );
}
```

- [ ] **Step 9: Create `src/admin/shell/useLogout.ts`**

```ts
import { useMutation } from '@tanstack/react-query';
import { useApi } from '../ApiContext.tsx';

// "Ieși din cont": a new page load then shows the login form.
export function useLogout() {
  const api = useApi();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => window.location.assign('/admin/'),
  });
}
```

- [ ] **Step 10: Edit `src/admin/pages/AccountPage.tsx`**

Find this block:

```tsx
import { ErrorMessage } from '../ErrorMessage.tsx';

```

Replace it with:

```tsx
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useLogout } from '../shell/useLogout.ts';

```

- [ ] **Step 11: Edit `src/admin/pages/AccountPage.tsx`**

Find this block:

```tsx
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
  const logout = useMutation({
    mutationFn: () => api.logout(),
    // A new page load shows the login form.
    onSuccess: () => window.location.assign('/admin/'),
  });

```

Replace it with:

```tsx
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
  const logout = useLogout();

```

- [ ] **Step 12: Edit `src/admin/shell/UserMenu.tsx`**

Find this block:

```tsx
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
```

Replace it with:

```tsx
import { useEffect, useRef, useState } from 'react';
```

- [ ] **Step 13: Edit `src/admin/shell/UserMenu.tsx`**

Find this block:

```tsx
import type { Teacher } from '../../../shared/api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { initials } from './initials.ts';

```

Replace it with:

```tsx
import type { Teacher } from '../../../shared/api.ts';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { initials } from './initials.ts';
import { useLogout } from './useLogout.ts';

```

- [ ] **Step 14: Edit `src/admin/shell/UserMenu.tsx`**

Find this block:

```tsx
export function UserMenu({ teacher }: { teacher: Teacher }) {
  const api = useApi();
  const location = useLocation();
```

Replace it with:

```tsx
export function UserMenu({ teacher }: { teacher: Teacher }) {
  const location = useLocation();
```

- [ ] **Step 15: Edit `src/admin/shell/UserMenu.tsx`**

Find this block:

```tsx
  const box = useRef<HTMLDivElement>(null);
  const logout = useMutation({
    mutationFn: () => api.logout(),
    // A new page load shows the login form.
    onSuccess: () => window.location.assign('/admin/'),
  });

```

Replace it with:

```tsx
  const box = useRef<HTMLDivElement>(null);
  const logout = useLogout();

```

- [ ] **Step 16: Create `src/admin/shell/YearSelect.tsx`**

```tsx
import { formatSchoolYear, schoolYearOf } from '../../../shared/schoolYear.ts';
import { schoolYearOptions, useSchoolYear } from '../SchoolYearContext.tsx';

// The school year switch, in the top bar and in the phone menu.
export function YearSelect({ id, labelClassName }: { id: string; labelClassName?: string }) {
  const { year, setYear } = useSchoolYear();
  return (
    <>
      <label className={labelClassName} htmlFor={id}>
        Anul școlar
      </label>
      <select id={id} value={year} onChange={(event) => setYear(Number(event.target.value))}>
        {schoolYearOptions(schoolYearOf(new Date())).map((option) => (
          <option key={option} value={option}>
            {formatSchoolYear(option)}
          </option>
        ))}
      </select>
    </>
  );
}
```

- [ ] **Step 17: Create `src/admin/shell/PhoneMenu.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import type { Teacher } from '../../../shared/api.ts';
import { ThemeSwitch } from '../../ui/ThemeButton.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { IconSettings } from './icons.tsx';
import { useLogout } from './useLogout.ts';
import { YearSelect } from './YearSelect.tsx';

// The menu under ☰ on a phone (redesign spec §4, round 6 design M2): what the
// bottom bar has no room for. It drops from the top bar; a tap outside it or
// on ☰ again closes it, and so do Esc and a new page (the Layout).
export function PhoneMenu({ teacher, onClose }: { teacher: Teacher; onClose(): void }) {
  const box = useRef<HTMLElement>(null);
  const logout = useLogout();
  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!box.current?.contains(target) && !target.closest?.('.menu-button')) onClose();
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [onClose]);
  return (
    <section ref={box} className="phone-menu" id="phone-menu" aria-label="Mai mult">
      {teacher.role === 'admin' && (
        <Link className="menu-row menu-link" to="/setari">
          <IconSettings />
          <span>Setări</span>
        </Link>
      )}
      <div className="menu-row">
        <YearSelect id="school-year-phone" />
      </div>
      <ThemeSwitch />
      <p className="user-who">
        <b>{teacher.name}</b>
        <span>{teacher.email}</span>
      </p>
      <Link className="menu-row menu-link" to="/cont">
        Contul meu
      </Link>
      <button type="button" className="menu-row menu-link menu-quiet" disabled={logout.isPending} onClick={() => logout.mutate()}>
        Ieși din cont
      </button>
      {logout.error && <ErrorMessage error={logout.error} />}
    </section>
  );
}
```

- [ ] **Step 18: Edit `src/admin/shell/icons.tsx`**

Find this block:

```tsx

export function IconClose() {
```

Replace it with:

```tsx

export function IconMenu() {
  return (
    <svg {...LINE} strokeWidth={1.6}>
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  );
}

export function IconClose() {
```

- [ ] **Step 19: Edit `src/admin/shell/Rail.tsx`**

Find this block:

```tsx

export type PanelName = 'clase' | 'todo';

```

Replace it with:

```tsx

// The side panels, and the phone menu under ☰: one open at a time.
export type PanelName = 'clase' | 'todo' | 'menu';

```

- [ ] **Step 20: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, matchPath, Outlet, useLocation } from 'react-router';
```

Replace it with:

```tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Link, matchPath, Outlet, useLocation } from 'react-router';
```

- [ ] **Step 21: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
import type { Teacher } from '../../shared/api.ts';
import { formatSchoolYear, schoolYearOf } from '../../shared/schoolYear.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
```

Replace it with:

```tsx
import type { Teacher } from '../../shared/api.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
```

- [ ] **Step 22: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
import { LoginPage } from './pages/LoginPage.tsx';
import { schoolYearOptions, useSchoolYear } from './SchoolYearContext.tsx';
import { ClassesPanel } from './shell/ClassesPanel.tsx';
import { Rail, type PanelName } from './shell/Rail.tsx';
```

Replace it with:

```tsx
import { LoginPage } from './pages/LoginPage.tsx';
import { useSchoolYear } from './SchoolYearContext.tsx';
import { ClassesPanel } from './shell/ClassesPanel.tsx';
import { IconClose, IconMenu } from './shell/icons.tsx';
import { PhoneMenu } from './shell/PhoneMenu.tsx';
import { Rail, type PanelName } from './shell/Rail.tsx';
```

- [ ] **Step 23: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
import { UserMenu } from './shell/UserMenu.tsx';

```

Replace it with:

```tsx
import { UserMenu } from './shell/UserMenu.tsx';
import { YearSelect } from './shell/YearSelect.tsx';

```

- [ ] **Step 24: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
// The shell of the teacher app (redesign spec §4): the top bar, the 80px bar
// on the left, the page, and one side panel at a time.
export function Layout() {
```

Replace it with:

```tsx
// The shell of the teacher app (redesign spec §4): the top bar, the 80px bar
// on the left, the page, and one side panel at a time. On a phone the bar
// moves to the bottom of the screen and ☰ opens the rest (brand.css).
export function Layout() {
```

- [ ] **Step 25: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
  const onClasses = location.pathname.startsWith('/clase');
  const { year, setYear } = useSchoolYear();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
```

Replace it with:

```tsx
  const onClasses = location.pathname.startsWith('/clase');
  const { year } = useSchoolYear();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
```

- [ ] **Step 26: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
  const toggle = (name: PanelName) => setPanel(open === name ? null : { name, on: location.key });

```

Replace it with:

```tsx
  const toggle = (name: PanelName) => setPanel(open === name ? null : { name, on: location.key });
  const close = useCallback(() => setPanel(null), []);

```

- [ ] **Step 27: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
        <div className="topbar-tools">
          <label className="sr-only" htmlFor="school-year">
            Anul școlar
          </label>
          <select id="school-year" value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {schoolYearOptions(schoolYearOf(new Date())).map((option) => (
              <option key={option} value={option}>
                {formatSchoolYear(option)}
              </option>
            ))}
          </select>
          <ThemeButton />
```

Replace it with:

```tsx
        <div className="topbar-tools">
          <YearSelect id="school-year" labelClassName="sr-only" />
          <ThemeButton />
```

- [ ] **Step 28: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
        </div>
      </header>
```

Replace it with:

```tsx
        </div>
        {me.data && (
          <button
            type="button"
            className="menu-button"
            aria-label="Meniu"
            aria-expanded={open === 'menu'}
            aria-controls={open === 'menu' ? 'phone-menu' : undefined}
            onClick={() => toggle('menu')}
          >
            {open === 'menu' ? <IconClose /> : <IconMenu />}
          </button>
        )}
      </header>
```

- [ ] **Step 29: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
      {me.data && open === 'todo' && <TodoPanel items={todo} others={others} onClose={() => setPanel(null)} />}
    </div>
```

Replace it with:

```tsx
      {me.data && open === 'todo' && <TodoPanel items={todo} others={others} onClose={() => setPanel(null)} />}
      {me.data && open === 'menu' && <PhoneMenu teacher={me.data} onClose={close} />}
    </div>
```

- [ ] **Step 30: Edit `src/ui/brand.css`**

Find this block:

```css

/* A side panel: beside the bar, over the page, 384px wide. */
```

Replace it with:

```css

/* ☰ and its menu show on a phone only (the media query below). */
.menu-button {
  display: none;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  margin-left: auto;
  padding: 0;
  border: 1px solid var(--control);
  border-radius: var(--radius);
  background: var(--sheet);
  color: var(--text);
  cursor: pointer;
}

.menu-button svg {
  width: 1.125rem;
  height: 1.125rem;
}

.menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  min-height: 3.25rem;
  padding: 0 0.25rem;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 500;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}

.menu-row label {
  font-weight: 500;
}

.menu-link {
  justify-content: flex-start;
  font-weight: 600;
}

.menu-link:hover {
  color: var(--text);
}

.menu-link svg {
  width: 1.375rem;
  height: 1.375rem;
  color: var(--muted);
}

.menu-quiet {
  border-bottom: 0;
  color: var(--muted);
  font-weight: 500;
}

/* The switch of "Temă întunecată". */
.switch {
  position: relative;
  flex: none;
  width: 2.75rem;
  height: 1.625rem;
  border: 1px solid var(--control);
  border-radius: 999px;
  background: var(--active);
}

.switch::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 50%;
  background: var(--muted);
  transition: transform 120ms;
}

[aria-checked="true"] > .switch {
  border-color: var(--ink);
  background: var(--ink);
}

[aria-checked="true"] > .switch::after {
  background: var(--on-ink);
  transform: translateX(1.125rem);
}

@media (prefers-reduced-motion: reduce) {
  .switch::after {
    transition: none;
  }
}

.phone-menu .user-who {
  margin: 0;
  padding: 1rem 0.25rem 0.25rem;
  border-bottom: 0;
}

/* A side panel: beside the bar, over the page, 384px wide. */
```

- [ ] **Step 31: Edit `src/ui/brand.css`**

Find this block:

```css
.class-item-test {
  font-size: 0.8125rem;
  color: var(--muted);
}

.class-item-test.is-waiting {
```

Replace it with:

```css
.class-item-test {
  font-size: 0.8125rem;
  color: var(--muted);
}

/* The phone (redesign spec §4, round 6 design M2): the top bar holds the
   lockup and ☰; the bar moves to the bottom of the screen with Test nou,
   Teste, Clase and De făcut; the panels cover the screen between the two. */
@media (max-width: 56.25rem) {
  .shell {
    --top: 56px;
    --bottom: calc(4rem + env(safe-area-inset-bottom, 0px));
    grid-template-columns: minmax(0, 1fr);
  }

  .topbar {
    padding-right: max(1rem, env(safe-area-inset-right, 0px));
  }

  .topbar .brand-mark {
    padding-inline: max(1rem, env(safe-area-inset-left, 0px)) 0.625rem;
  }

  .shell:not(.shell-bare) .topbar-tools {
    display: none;
  }

  .menu-button {
    display: grid;
  }

  .rail {
    position: fixed;
    top: auto;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 30;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0;
    height: var(--bottom);
    padding: 0 env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
    border-top: 1px solid var(--rule);
    border-right: 0;
  }

  .rail-foot {
    display: none;
  }

  .rail-new,
  .rail-item {
    min-height: 0;
    padding: 0.375rem 0;
    border-radius: 0;
  }

  .rail-item:hover {
    background: none;
  }

  .rail-item[aria-current="page"],
  .rail-item[aria-expanded="true"] {
    background: none;
    color: var(--ink);
  }

  .rail-square {
    width: 1.875rem;
    height: 1.875rem;
    border-radius: var(--radius);
  }

  .rail-badge {
    top: 0.375rem;
    right: calc(50% - 1.375rem);
  }

  .shell > .page {
    grid-column: 1;
    padding: 1.25rem max(1rem, env(safe-area-inset-right, 0px)) calc(var(--bottom) + 1.5rem) max(1rem, env(safe-area-inset-left, 0px));
  }

  .panel {
    bottom: var(--bottom);
    left: 0;
    width: 100%;
    max-width: none;
    border-right: 0;
    box-shadow: none;
  }

  .phone-menu {
    position: fixed;
    top: var(--top);
    right: 0;
    left: 0;
    z-index: 35;
    max-height: calc(100vh - var(--top) - var(--bottom));
    overflow-y: auto;
    padding: 0.25rem max(1rem, env(safe-area-inset-right, 0px)) 0.75rem max(1rem, env(safe-area-inset-left, 0px));
    border-bottom: 1px solid var(--rule);
    background: var(--sheet);
    box-shadow: var(--float);
  }
}

@media (min-width: 56.3125rem) {
  .phone-menu {
    display: none;
  }
}

.class-item-test.is-waiting {
```

- [ ] **Step 32: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  112 passed | 1 skipped (113)`, `Tests  1725 passed | 3 skipped (1728)`.

- [ ] **Step 33: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 34: Commit**

```bash
git add src/ui/useTheme.ts src/ui/ThemeButton.tsx src/ui/ThemeButton.test.tsx src/admin/shell src/admin/pages/AccountPage.tsx src/admin/Layout.tsx src/admin/Layout.test.tsx src/ui/brand.css
git commit -m "Move the bar to the bottom on a phone and put the rest under ☰"
```

### Task 7: The notes for the next sessions

`src/AGENTS.md` describes the new look, the shell folder and the test gotchas of the new shell.

**Files:**
- Modify: `src/AGENTS.md`

- [ ] **Step 1: Edit `src/AGENTS.md`**

Find this block:

```markdown

- `ui/`: brand CSS (colours from the Laura Miron site), the MQGrader mark (`BrandMark.tsx`: a score ring and an orange tick, coloured by `--mark-from`, `--mark-to` and `--mark-tick`), theme switch, Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Teste cards, the Clase cards and the test page's class link). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block; a button or link that acts is a rounded outline (`.button-quiet`), and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (files, link, evaluation controls, the barem warning (`ExerciseListBanner.tsx`), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table, "Recorectează tot"). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `classPage/GradesTable.tsx` is the class page's grade table (students by tests, newest test on the left; it hides archived tests unless asked, and keeps a column for draft and open tests). `pages/ClassStudentsPage.tsx` is "Elevii clasei" (add, rename, "A plecat", "Șterge"). `pages/StudentPage.tsx` is a student's history. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `pages/LoginPage.tsx` is the login and sign-up form: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. `pages/AccountPage.tsx` is Contul meu (password, "Ieși din cont"). `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). The menu shows Setări only to an administrator, and a demo account sees how many papers it may still have graded. `pages/ReportPage.tsx` and `reportPage/` are the class report (`shared/stats.ts` makes its numbers). `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `pages/TestPage.tsx` holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
```

Replace it with:

```markdown

- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Teste cards, the Clase cards and the test page's class link). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (files, link, evaluation controls, the barem warning (`ExerciseListBanner.tsx`), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table, "Recorectează tot"). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `classPage/GradesTable.tsx` is the class page's grade table (students by tests, newest test on the left; it hides archived tests unless asked, and keeps a column for draft and open tests). `pages/ClassStudentsPage.tsx` is "Elevii clasei" (add, rename, "A plecat", "Șterge"). `pages/StudentPage.tsx` is a student's history. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `pages/LoginPage.tsx` is the login and sign-up form: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. `pages/AccountPage.tsx` is Contul meu (password, "Ieși din cont"). `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). A demo account sees, at the top of every page, how many papers it may still have graded. `pages/ReportPage.tsx` and `reportPage/` are the class report (`shared/stats.ts` makes its numbers). `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`)); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page. `todo.ts` decides "De făcut" from the tests list: exactly the three cases of spec §5. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme and the account move under ☰ (CSS and `PhoneMenu.tsx`).
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `pages/TestPage.tsx` holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
```

- [ ] **Step 2: Edit `src/AGENTS.md`**

Find this block:

```markdown
- The class PDF and the report page have one column for each exercise (up to 60): the page table scrolls in its `.table-wrap` and uses `report-table`, not the `uploads` table that turns into cards on a phone. The grade table of the class page does the same. Only the page table puts Elev, Nota, Total first; the class PDF and the CSV keep their order.
- Dark colours in `ui/brand.css` are written twice (the `[data-theme="dark"]` block and the `prefers-color-scheme` block): keep both copies equal, the class colours included.
- The Teste filters live in the address: `?clasa=<id>` and `?arhivate=1`. A `clasa` that is not a class of the year counts as all classes.
```

Replace it with:

```markdown
- The class PDF and the report page have one column for each exercise (up to 60): the page table scrolls in its `.table-wrap` and uses `report-table`, not the `uploads` table that turns into cards on a phone. The grade table of the class page does the same. Only the page table puts Elev, Nota, Total first; the class PDF and the CSV keep their order.
- Dark colours in `ui/brand.css` are written twice (the `[data-theme="dark"]` block and the `prefers-color-scheme` block): keep both copies equal, the class colours included (`ui/brand.test.ts` checks it). The styles are flat: no gradients, and a shadow (`--float`) only on what floats (panels, menus).
- The top bar's account button is named "Contul tău: <name>", and the phone menu repeats Setări, the school year, "Contul meu" and "Ieși din cont" while it is open: a page test that looks for one of these, or for a button by the teacher's name, looks inside `screen.getByRole('main')`.
- Testing Library's waits (`findBy…`, `waitFor`) last 3 s (`src/test/setup.ts`): while the whole suite runs, the first render of a page in a file can take about a second.
- The Teste filters live in the address: `?clasa=<id>` and `?arhivate=1`. A `clasa` that is not a class of the year counts as all classes.
```

- [ ] **Step 3: Commit**

```bash
git add src/AGENTS.md
git commit -m "Describe the new look and the shell in the notes"
```

### Task 8: Look at it, then the pull request (main session)

Not a subagent task. Nothing here changes code unless a check fails; a fix found here is prototyped, tested and committed like the tasks above, and named to the user.

- [ ] **Step 1: Check the exactness of the branch**

Run: `git diff --stat refs/proto6/s7 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

- [ ] **Step 2: Run the whole suite three times, and once in UTC**

Run `npm test` three times, then once with `TZ=UTC` (Git Bash: `TZ=UTC npm test`).
Expected: PASS every time. `Test Files  112 passed | 1 skipped (113)`, `Tests  1725 passed | 3 skipped (1728)`.

- [ ] **Step 3: Build and start the production build**

Check port 8788 first (`netstat -ano | findstr :8788`; end a leftover `workerd.exe` as `AGENTS.md` says). Then `npm run db:local` and the Claude Code preview server `preview` (`npm run preview`, http://127.0.0.1:8788).
Expected: `Ready on http://127.0.0.1:8788`.

- [ ] **Step 4: Look at every page at 1440px and at 390px, light and dark**

The pages: `/admin/` (Teste), `/admin/teste/nou`, a test, a student's result, a class report, `/admin/clase`, a class, its students, a student's history, `/admin/setari`, `/admin/cont`, the login page (logged out), a student upload link and a student result link. With the panels "Clasele tale" and "Ce ai de făcut" open, the account menu open, and on the phone the ☰ menu open. On each page measure in the browser: `document.documentElement.scrollWidth <= innerWidth`, and on the phone, after scrolling to the end, the bottom of `main`'s last child is above the top of `.rail`.
Expected: the look of round 5 (Z3.1) and round 6 (M2); no sideways scroll; nothing hidden behind the bars; the student pages show only the mark and "MQGrader".

- [ ] **Step 5: Run the design checker on the shell**

Run: `node .claude/skills/design-taste-frontend/scripts/inspect.mjs --app http://localhost:8788/admin/ --out .taste-skill/phase2`
Expected: `0 FAIL`, and its report names the headline "Teste 2026-2027" (the page Teste, not the login page). Warnings about the cards of the Teste page are Phase 3's.

- [ ] **Step 6: Run the smoke test**

Run: `npm run smoke` (second terminal, while the preview runs).
Expected: every check passes.

- [ ] **Step 7: Ask the user, then push and open the pull request**

Ask the user before pushing. On a yes: `git push -u origin feature/mqgrader-look-and-shell`, then a ready pull request into `main` that lists what changed, the rulings above, and what was checked.

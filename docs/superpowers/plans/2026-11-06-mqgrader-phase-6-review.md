# MQGrader Phase 6: Verificarea punctelor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 6 must run in the main session, not in a subagent:** it looks at the app in a browser, and every outward step (push, pull request) needs the user's explicit yes.

**Goal:** The review of the redesign: a page of its own, `/admin/teste/:code/verificare`, with the papers and their points to check on the left, one page of the paper in the middle, and the decision on the right ("Accept 1p", a stepper with "Salvează", "Am verificat paginile"), with the keys A, J, K and 1–9. The panel Verificare lists each point with its reason, and every way to the points to check opens the review.

**Architecture:** One API change: each row of the uploads list (`UploadRow`) gets its points to check (`reviewPoints`: the pages the robot could not read as one point, then the exercises), read in the same batch as the uploads (`listUploads` in `server/db/tests.ts`) and counted as `flagCountSql` counts them. The page (`src/admin/pages/ReviewPage.tsx`) reads the test (the same query as the test page) and the paper it shows (the same query as the paper's page); `src/admin/reviewPage/` holds the three panes and `points.ts` (the order of the points, the address, the step to the next one). A decision uses the existing corrections API (`correctItem`, `reviewPages`). No migration, no new write.

**Tech Stack:** Node 24, TypeScript, React 19, TanStack Query, React Router, Hono on Cloudflare Pages with D1, Vitest 5, Testing Library. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md` (§1 decisions 27-28, §6 the panel Verificare, §7 Verificarea punctelor, §13 phase 6). Task 1 writes the decisions of 2026-11-06 into it. Root `AGENTS.md`, `src/AGENTS.md` and `server/AGENTS.md` hold the project rules. The approved prototype: round 5 (Z3.1) https://claude.ai/artifact/JfoJqXjZVryZCHebhG8QHw, page "Verificare".

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- Every teacher query is scoped by the teacher's id: the new query of `listUploads` reads only the test that `requireTest` found for the teacher. A request stays within 15 D1 queries: the two statements of `listUploads` go in one `db.batch()`.
- The teacher's corrections check their rules inside their SQL (`server/db/evaluations.ts`): this plan writes nothing new; every decision names the grading it was made on (`gradedAt`), so a decision from an old page never reaches a newer result.
- Every grading text a page shows (answers, comments, review reasons) goes through `MathText`.
- Flat colours only: no gradient anywhere in `brand.css`; a shadow only on what floats. Orange only for what waits on the teacher. One filled button for the main action of a pane ("Accept 1p"; "Următorul punct" in the title row).
- No page tells students that AI grades their work; this plan changes no student page.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A` (the checkout holds local files that must not be committed: a `.gitignore` line, `.claude/launch.json` entries).
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root `D:\Projects\QuickEval`, on the branch `feature/mqgrader-review`. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy, on `main` too. If only tests of those three files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts runner/api.test.ts` alone: `Test Files  3 passed (3)`, `Tests  96 passed (96)`. Then the full run counts as passed when its failed and passed tests add up to the expected passed number; say so in the task report.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; overwrite all of it with exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/proto10/v1` … `refs/proto10/v5`, one per task, on `refs/proto10/vbase` (the same files as `main` at `8b9823a`). After Task N, `git diff --stat refs/proto10/vN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`). Four tests run the real pandoc (`runner/baremDocx.test.ts`, `runner/baremTask.test.ts`, `runner/workdir.test.ts`): without pandoc they skip too, so every total shows 4 fewer passed and 4 more skipped.

## Rulings made while planning

Decided with the user on 2026-11-06 or while building the prototype; Task 1 writes them into the spec.

1. No marks on the photo (the user): the robot's result has no page and no place for an exercise (`gradingResultSchema` in `shared/schemas.ts`), so the middle pane shows the paper's pages one at a time, with the page switch (1 · 2 · 3). Set aside for later: the robot could name the page of each exercise; that needs a schema field, a migration that runs on the live database first, a change of the grading skill, and it would work only for papers graded after it.
2. The review is a page of its own, not a panel of the test page: §7's title row has "Înapoi la test". "Începe verificarea" and "Decide" (the panel Verificare), "Verifică 3 puncte" (a row of the Teste page) and "Începe" (the Verificare card of "De făcut", in the bar's panel and in the list of the Teste page) open it. The class page's links (Phase 7) do not change now.
3. The right pane lists the paper's exercises: the robot grades each exercise of the barem as one item, so there are no smaller items inside an exercise (the round 5 picture shows three inside "Subiectul al II-lea, 3)").
4. The pages the robot could not read are one point, as `flagCountSql` and the counts of the papers say: first in their paper, opening on the first of those pages; its decision is "Am verificat paginile" (`reviewPages` with `pagesReviewed`).
5. The stepper moves by 0,5 between 0 and the maximum; any value in steps of 0,05 can be typed (`isValidCorrection`, the rule of the paper's page); Enter in the field saves. "Salvează" with the robot's value is the same as "Accept". While the field shows another valid value, a line says what the grade becomes (`gradeOf(total − points + value, maxTotal)`; `total` already has the office points).
6. After a decision the next point opens (the one after it, going round the list). With none left, the page stays on the paper and says "Toate punctele sunt verificate." with "Mergi la Rezultate". The point leaves the cached test at once (`withoutPoint`), so the list and the next point never show a decided point; the test is read again after.
7. The address keeps the paper and the point (`?lucrare=12&punct=34`, `punct=pagini`), replaced and never pushed: Back leaves the review. An address of a paper that is not a graded paper of the test opens the first point; an old point of a known paper shows that paper with no point.
8. The keys act only while the focus is on the page (the body, or inside the review) and not in a field, and never with Ctrl, Alt or Meta: an open panel of the bar holds the focus, so A there does nothing. A key or a button does nothing while a decision is on its way (one write for a double press).
9. The panel Verificare lists each point with its reason and "propus 1p din 2p" (the round 5 picture; decision 22 said this list comes with Phase 6). "Toate punctele sunt verificate." gets "Vezi lucrările", which opens the review.
10. "Celelalte lucrări" lists only graded papers: a paper not graded yet has no grade and nothing to decide; it stays on the test page.
11. "Deschide lucrarea" (the paper's page) is under every view of the right pane, not only for a paper with no point: an exercise's comment, the summary and "Recorectează" change there.
12. While another paper loads, the photo pane says "Se încarcă lucrarea…" and the decision pane is empty: the page never shows one paper's data with another paper's point. Found while testing: a page test that moves to another paper finds the right pane again through `screen`.
13. Points in the review are written as the round 5 picture and §7 write them, "1p", "0,5p" ("4p din 5p"), not "1 din 2" as on the paper's page.
14. The stepper's buttons are named "Scade 0,5p" and "Adaugă 0,5p", not "Mai puțin" and "Mai mult" as in the round 5 picture: the bar's phone menu button is "Mai mult" (found in the browser).
15. The layout: three columns from 1280px (240px, the page, 360px); from 900px to 1280px the papers go under the page, so the page keeps its width (found in the browser: at 1024px the three columns left the page 193px); below 900px one column, the page, the decision, then the papers, without the line of the keys. The review's styles come after the test page's phone block in `brand.css`: a style test reads the first phone block after `.test-sheet {` (found while measuring).

## Review Focus

1. A double press of A, or a click while a decision is on its way, makes one write (test in Task 3: "writes once when A is pressed twice, and no key acts while it saves").
2. A key typed in the stepper field is text; Ctrl, Alt or Meta with a key does nothing, and so does a key while a panel of the bar is open (tests in Task 3: "ignores the keys in the stepper field and with Ctrl, Alt or Meta", "ignores the keys while a panel of the bar is open").
3. A paper graded again after the page loaded: the decision is refused and the page reads the paper again, never writing to the new grading (test in Task 3: "reads the paper again when it was graded again in the meantime").
4. After the last point the page says so and offers Rezultate, with no empty pane (test in Task 3: "says when every point is checked, with the way to Rezultate").
5. The review's points of a paper are exactly the ones its count counts, for the pages and for the exercises, and another test's points never come in (tests in Task 2: "lists the points to check of each paper, as many as its count", "keeps the points of another test out of the list").

---

### Before Task 1: The branch

- [ ] **Step 1: Start the branch from `main`**

No other Claude Code session may work in this checkout meanwhile (in the desktop app: `list_sessions {"linked": true}` shows none running). The branch was made while planning, with no commits, at `8b9823a`: if `git rev-parse --verify --quiet refs/heads/feature/mqgrader-review` prints `8b9823a…`, run `git switch feature/mqgrader-review`. Otherwise:

```bash
git fetch origin
git switch -c feature/mqgrader-review origin/main
git branch --unset-upstream
```

Expected: `Switched to branch 'feature/mqgrader-review'` (or `… a new branch …`); `git log --oneline -1` shows `8b9823a` (or a later `main`: then the exactness checks below compare only the files this plan changes). The untracked plan file and the local changes of `.claude/launch.json` and `.gitignore` come along; they are never committed (the plan is committed in Task 6).

### Task 1: The decisions of 2026-11-06 in the spec

The redesign spec gets the user's answer and says exactly what the review shows.

**Files:**
- Modify: `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`

**Interfaces:**
- Produces: the spec text the later tasks build (§6 Verificare, §7).

- [ ] **Step 1: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown

Date: 2026-11-04. Status: agreed with the user after six rounds of prototypes. Phases 1 to 4 (landing page and light theme, look and shell, Teste page, test page) are live; Phase 5 (Rezultate) is being built; the other phases are not.

```

Replace it with:

```markdown

Date: 2026-11-04. Status: agreed with the user after six rounds of prototypes. Phases 1 to 5 (landing page and light theme, look and shell, Teste page, test page, Rezultate) are live; Phase 6 (the review of the points to check) is being built; the other phases are not.

```

- [ ] **Step 2: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
26. "Publică toate rezultatele" opens the link of every student, and "Oprește accesul la rezultate" closes every link, also the ones published alone. While all are published, one result cannot be stopped alone (Phase 5).

```

Replace it with:

```markdown
26. "Publică toate rezultatele" opens the link of every student, and "Oprește accesul la rezultate" closes every link, also the ones published alone. While all are published, one result cannot be stopped alone (Phase 5).
27. The review has no marks on the photo: the robot does not say where an answer is on a page, nor on which page. The middle pane shows the student's pages with the page switch (Phase 6).
28. The review is a page of its own, `/admin/teste/:code/verificare`. "Începe verificarea" and "Decide" in the panel Verificare, "Verifică 3 puncte" on the Teste page, and the button of "Decide 3 puncte nesigure" in "De făcut" open it (Phase 6).

```

- [ ] **Step 3: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
- "Clasele tale": the classes of the chosen school year that are not archived, each with its number of students and its tests in work (draft, open, in evaluation, or done with a thing in "De făcut"); a test in "De făcut" is orange; the class of the page is marked. "+ Clasă nouă" and "Arhivate (n)" open the page Clase (`/clase`) until Phase 7 replaces it.
- "Ce ai de făcut": one card per thing in "De făcut" (§5): the stage as a pill, the test and its class, what to do, one sentence, and one button to the test; the first card's button is the filled one. Under them, how many other tests of the year are in work. With nothing: "Nimic nu te așteaptă acum."
- The demo line stays at the top of the page, under the top bar.
```

Replace it with:

```markdown
- "Clasele tale": the classes of the chosen school year that are not archived, each with its number of students and its tests in work (draft, open, in evaluation, or done with a thing in "De făcut"); a test in "De făcut" is orange; the class of the page is marked. "+ Clasă nouă" and "Arhivate (n)" open the page Clase (`/clase`) until Phase 7 replaces it.
- "Ce ai de făcut": one card per thing in "De făcut" (§5): the stage as a pill, the test and its class, what to do, one sentence, and one button to the test (to the review for Verificare, §7); the first card's button is the filled one. Under them, how many other tests of the year are in work. With nothing: "Nimic nu te așteaptă acum."
- The demo line stays at the top of the page, under the top bar.
```

- [ ] **Step 4: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown

- "Bună dimineața, Laura." and a line with the date and "**3 lucruri te așteaptă ˅** în 3 teste." The bold part is a button: it opens and closes the list "Ce ai de făcut" right under it (closed when the page opens). Each row: the stage as a pill, the task, the test and class, one button to the test (the first one filled).
  - The greeting follows Romania's time: "Bună dimineața" from 5:00, "Bună ziua" from 11:00, "Bună seara" from 18:00. The name is the first word of the teacher's name; without a name the greeting is "Bună ziua." alone.
```

Replace it with:

```markdown

- "Bună dimineața, Laura." and a line with the date and "**3 lucruri te așteaptă ˅** în 3 teste." The bold part is a button: it opens and closes the list "Ce ai de făcut" right under it (closed when the page opens). Each row: the stage as a pill, the task, the test and class, one button to the test (to the review for Verificare, §7; the first one filled).
  - The greeting follows Romania's time: "Bună dimineața" from 5:00, "Bună ziua" from 11:00, "Bună seara" from 18:00. The name is the first word of the teacher's name; without a name the greeting is "Bună ziua." alone.
```

- [ ] **Step 5: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
    - Nothing: "Nimic de făcut acum".
    - Every other step is a link to the test page. A test whose results are open also has "Oprește accesul" on its row. The button of the first thing in "De făcut" is filled; the others are outlines.
  - On a phone (below 768 px) each row becomes a block: the test, the stage, the papers and the next step, one under the other.
```

Replace it with:

```markdown
    - Nothing: "Nimic de făcut acum".
    - Every other step is a link to the test page; "Verifică 3 puncte" opens the review (§7). A test whose results are open also has "Oprește accesul" on its row. The button of the first thing in "De făcut" is filled; the others are outlines.
  - On a phone (below 768 px) each row becomes a block: the test, the stage, the papers and the next step, one under the other.
```

- [ ] **Step 6: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
  - Corectare: before the start, one line. While open: start now for the chosen papers or at a time, or "Marchează ca terminat", and the papers table with its checkboxes (only in this panel). After: the state of the grading, a partial grading, a problem of the barem (with a link to Pregătire, where the barem is replaced), the robot line, "Recorectează tot", the line of the class analysis, and the papers table.
  - Verificare: "Lucrări cu puncte de verificat", a row per paper with points to check (the student, the grade, "2 puncte de verificat", and "Decide", which opens the paper's page), and "Începe verificarea", which opens the first of them. "Toate punctele sunt verificate." when graded papers have none; one line before any paper is graded. Then the papers table. The list of each point with its reason comes with the review (§7, Phase 6): the API gives only a count per paper.
  - Rezultate: the students' result links and "Pentru tine" (§8, Phase 5). The papers table of the other panels has no result link and no publish button: they are in Rezultate.
```

Replace it with:

```markdown
  - Corectare: before the start, one line. While open: start now for the chosen papers or at a time, or "Marchează ca terminat", and the papers table with its checkboxes (only in this panel). After: the state of the grading, a partial grading, a problem of the barem (with a link to Pregătire, where the barem is replaced), the robot line, "Recorectează tot", the line of the class analysis, and the papers table.
  - Verificare: "Începe verificarea", which opens the review (§7) at the first point, and "Puncte de verificat", a row per point: the student and the exercise ("Ioana Marin · Subiectul al II-lea, 3)"), the reason, "propus 1p din 1p", and "Decide", which opens the review at that point. The pages the robot could not read are one point: "Paginile necitite" and the pages. "Toate punctele sunt verificate." and "Vezi lucrările" (the review) when graded papers have none; one line before any paper is graded. Then the papers table.
  - Rezultate: the students' result links and "Pentru tine" (§8, Phase 5). The papers table of the other panels has no result link and no publish button: they are in Rezultate.
```

- [ ] **Step 7: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown

Three panes in one panel:

- Left: "Cu puncte de verificat" (each paper with its grade and its points to check, the current one marked), then "Celelalte lucrări" (every other paper with its grade).
- Middle: the photo of the page with the marked zones (green checked, orange dashed to check) and the page switch (1 · 2 · 3).
- Right: the exercise of the barem, its items with points; the doubtful item on orange with its reason, "Accept Np", a stepper for another value and "Salvează"; the total, what the grade becomes with the other value, the grade; the keys: A accept, J/K next or previous point, 1–3 page.
- The title row: "Verificare", the test, "Înapoi la test", "Următorul punct".

```

Replace it with:

```markdown

The page `/admin/teste/:code/verificare` (decision 28): three panes in one panel.

- A point to check is an exercise the robot was not sure of, with its reason, or the pages the robot could not read: those pages are one point, as the papers' counts say. The points go in the order of the papers (by the student's name); in a paper, the pages first, then the exercises in the barem's order. The API lists them with each paper (`reviewPoints` in the uploads list), counted as `flagCount` counts.
- The address names the paper and the point (`?lucrare=12&punct=34`; `punct=pagini` for the pages) without a new step in the history, so a reload comes back to it. Without them, the page opens on the first point.
- The title row: "Verificare", under it the test, its class and "3 puncte în 2 lucrări"; "Înapoi la test" (to the panel Verificare) and "Următorul punct" (the filled button, while a point waits).
- Left: "Cu puncte de verificat": each paper with its grade and "2 puncte de verificat", and under it its points (the exercise and "1p din 1p", or "Paginile necitite"), the current point marked. Then "Celelalte lucrări": every other graded paper with its grade. A click on a point opens it; a click on a paper of "Celelalte lucrări" shows that paper, with no point.
- Middle: the paper's pages, one at a time: "Ioana Marin · pagina 2 din 3" and the page switch (1 · 2 · 3). A click on a photo opens it full size in a new tab; a PDF shows in a frame. No marks on the photo (decision 27). A point opens on page 1; the pages point opens on the first page the robot could not read.
- Right, for an exercise: its name and "5p în barem"; the points ("1p din 1p"), the student's answer, the robot's comment, and on orange "De verificat:" with the reason; "Accept 1p" (the filled button), a stepper for another value (− and + by 0,5, from 0 to the maximum; any value in steps of 0,05 can be typed) and "Salvează". Under them, the total ("Total: 75 din 100, cu 10 din oficiu"), what the grade becomes while the stepper shows another value ("Cu 0p aici, nota devine 8,40"), and the grade. Then the paper's exercises with their points, the ones to check marked; a click on one to check opens it.
- Right, for the pages point: "Robotul nu a putut citi: Pagina 2. Verifică pozele și punctajele exercițiilor de pe ele." and "Am verificat paginile".
- Right, for a paper with no point open: its total and grade, and its exercises. Under every view, "Deschide lucrarea": the paper's page, where the rest changes (the comments, "Recorectează", the student's PDF).
- After "Accept", "Salvează" or "Am verificat paginile", the next point opens. While the answer is on its way, the buttons and the keys do nothing. When no point is left: "Toate punctele sunt verificate." and "Mergi la Rezultate".
- The keys: A accept, J and K the next or the previous point, 1–9 the page. A line under the decision names them (not on a phone). They do nothing while the cursor is in a field or in a panel of the bar, or with Ctrl, Alt or Meta.
- A change names the grading it was made on: when the paper was graded again in the meantime, the change is refused and the page reads the paper again.
- On a phone (below 900 px): one column: the page, the decision, then the papers.

```

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md
git commit -m "Write the Phase 6 decisions into the redesign spec"
```

### Task 2: The points to check of each paper in the uploads list

`GET /api/admin/tests/:code` gives, for each row of `uploads`, its points to check.

**Files:**
- Modify: `shared/api.ts` (`ReviewPoint`, `UploadRow`), `server/db/tests.ts` (`listUploads`), `src/test/fakeApi.ts` (`fakeUpload`, `fakePoint`)
- Test: `server/routes/tests.test.ts`

**Interfaces:**
- Produces: `type ReviewPoint = { kind: 'item'; itemId: number; exerciseId: string; label: string; points: number; maxPoints: number; reason: string } | { kind: 'pages'; pages: string[] }`; `UploadRow.reviewPoints: ReviewPoint[]` (the pages first, then the items in the barem's order; empty without a grading). `fakeUpload()` makes one made-up item point (`fakePoint(1000 + i)`) for each point of its `flagCount`, unless the test names `reviewPoints`; `fakePoint(itemId, overrides?)`.

- [ ] **Step 1: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
        maxTotal: null,
        gradedAt: null,
        resultToken: null,
        resultsOpen: false,
        flagCount: 0,
        model: null,
        effort: null,
        lastError: null,
      },
      {
```

Replace it with:

```ts
        maxTotal: null,
        gradedAt: null,
        resultToken: null,
        resultsOpen: false,
        flagCount: 0,
        reviewPoints: [],
        model: null,
        effort: null,
        lastError: null,
      },
      {
```

- [ ] **Step 2: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
        flagCount: 0,
        model: null,
```

Replace it with:

```ts
        flagCount: 0,
        reviewPoints: [],
        model: null,
```

- [ ] **Step 3: Edit `server/routes/tests.test.ts`**

Find this block:

```ts

  it('reads the code in any letter case and answers 404 for unknown or foreign codes', async () => {
```

Replace it with:

```ts

  it('lists the points to check of each paper, as many as its count', async () => {
    const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva']);
    const [pop, ionescu, stan] = cls.studentIds as [number, number, number];
    const code = await makeTest(api, cls.id);
    const first = await addSubmission(api, code, pop, { status: 'graded', files: 2 });
    const firstEvaluation = await addEvaluation(api, first, {
      items: [{ needsReview: true }, {}, { needsReview: true, reviewed: true }, { needsReview: true }],
      unreadable: ['student/page-02.jpg'],
    });
    const second = await addSubmission(api, code, ionescu, { status: 'graded', files: 1 });
    const secondEvaluation = await addEvaluation(api, second, { items: [{}, { needsReview: true }] });
    await addSubmission(api, code, stan, { status: 'submitted', files: 1 });
    await api.db
      .prepare("UPDATE evaluation_items SET label = 'Subiectul I, 3)', points = 0.5, max_points = 2, review_reason = 'Cifra se citește greu.' WHERE evaluation_id = ? AND exercise_id = 'E4'")
      .bind(firstEvaluation)
      .run();
    const itemId = async (evaluationId: number, exerciseId: string) =>
      (await api.db.prepare('SELECT id FROM evaluation_items WHERE evaluation_id = ? AND exercise_id = ?').bind(evaluationId, exerciseId).first<{ id: number }>())!.id;

    const res = await api.request('GET', `/api/admin/tests/${code}`);
    const byName = Object.fromEntries(res.body.uploads.map((row: { studentName: string }) => [row.studentName, row]));
    expect(byName['Pop Ion'].reviewPoints).toEqual([
      { kind: 'pages', pages: ['student/page-02.jpg'] },
      { kind: 'item', itemId: await itemId(firstEvaluation, 'E1'), exerciseId: 'E1', label: 'Exercițiu', points: 1, maxPoints: 1, reason: 'Verifică' },
      { kind: 'item', itemId: await itemId(firstEvaluation, 'E4'), exerciseId: 'E4', label: 'Subiectul I, 3)', points: 0.5, maxPoints: 2, reason: 'Cifra se citește greu.' },
    ]);
    expect(byName['Ionescu Ana'].reviewPoints).toEqual([
      { kind: 'item', itemId: await itemId(secondEvaluation, 'E2'), exerciseId: 'E2', label: 'Exercițiu', points: 1, maxPoints: 1, reason: 'Verifică' },
    ]);
    expect(byName['Stan Eva'].reviewPoints).toEqual([]);
    for (const row of res.body.uploads) expect(row.reviewPoints).toHaveLength(row.flagCount);

    // A checked point leaves the list, and the count goes down with it.
    await api.db.prepare("UPDATE evaluations SET pages_reviewed_at = '2026-10-08T10:00:00.000Z' WHERE id = ?").bind(firstEvaluation).run();
    await api.db.prepare("UPDATE evaluation_items SET reviewed_at = '2026-10-08T10:00:00.000Z' WHERE evaluation_id = ? AND exercise_id = 'E1'").bind(firstEvaluation).run();
    const after = await api.request('GET', `/api/admin/tests/${code}`);
    const pop2 = after.body.uploads.find((row: { studentName: string }) => row.studentName === 'Pop Ion');
    expect(pop2.reviewPoints.map((point: { exerciseId?: string }) => point.exerciseId)).toEqual(['E4']);
    expect(pop2.flagCount).toBe(1);
  });

  it('keeps the points of another test out of the list', async () => {
    const cls = await makeClass(api, '6E2', ['Pop Ion']);
    const [pop] = cls.studentIds as [number];
    const code = await makeTest(api, cls.id);
    const other = await makeTest(api, cls.id);
    const mine = await addSubmission(api, code, pop, { status: 'graded', files: 1 });
    await addEvaluation(api, mine, { items: [{}] });
    const theirs = await addSubmission(api, other, pop, { status: 'graded', files: 1 });
    await addEvaluation(api, theirs, { items: [{ needsReview: true }], unreadable: ['student/page-01.jpg'] });

    const res = await api.request('GET', `/api/admin/tests/${code}`);
    expect(res.body.uploads[0]).toMatchObject({ studentName: 'Pop Ion', flagCount: 0, reviewPoints: [] });
  });

  it('reads the code in any letter case and answers 404 for unknown or foreign codes', async () => {
```

- [ ] **Step 4: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  RegradeAnswer,
  FinishedTest,
```

Replace it with:

```ts
  RegradeAnswer,
  ReviewPoint,
  FinishedTest,
```

- [ ] **Step 5: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    flagCount: 0,
    model: null,
```

Replace it with:

```ts
    flagCount: 0,
    // One made-up item for every point counted, unless the test names them.
    reviewPoints: Array.from({ length: overrides.flagCount ?? 0 }, (_, index) => fakePoint(1000 + index)),
    model: null,
```

- [ ] **Step 6: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    lastError: null,
    ...overrides,
```

Replace it with:

```ts
    lastError: null,
    ...overrides,
  };
}

// One point to check, for building fake data in tests.
export function fakePoint(itemId: number, overrides: Partial<Extract<ReviewPoint, { kind: 'item' }>> = {}): ReviewPoint {
  return {
    kind: 'item',
    itemId,
    exerciseId: `E${itemId}`,
    label: `Exercițiul ${itemId}`,
    points: 1,
    maxPoints: 2,
    reason: 'Scrisul se citește greu.',
    ...overrides,
```

- [ ] **Step 7: Run the tests to see them fail**

Run: `npx vitest run server/routes/tests.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  3 failed | 21 passed (24)`: the rows have no `reviewPoints` yet ("returns the test and one upload row per active student, by name": `AssertionError: expected [ { studentId: 2, …(18) }, …(2) ] to deeply equal [ { studentId: 2, …(19) }, …(2) ]`; "lists the points to check of each paper, as many as its count": `AssertionError: expected undefined to deeply equal [ { kind: 'pages', …(1) }, …(2) ]`; "keeps the points of another test out of the list": `AssertionError: expected { studentId: 1, …(18) } to match object { studentName: 'Pop Ion', …(2) }`).

- [ ] **Step 8: Edit `shared/api.ts`**

Find this block:

```ts

// One row of the uploads table: an active student of the class, or a student
```

Replace it with:

```ts

// A point the teacher still has to check on a graded paper (redesign spec
// §7): an exercise the robot was not sure of, with its reason, or the pages
// the robot could not read, which count as one point.
export type ReviewPoint =
  | { kind: 'item'; itemId: number; exerciseId: string; label: string; points: number; maxPoints: number; reason: string }
  | { kind: 'pages'; pages: string[] };

// One row of the uploads table: an active student of the class, or a student
```

- [ ] **Step 9: Edit `shared/api.ts`**

Find this block:

```ts
  flagCount: number;
  // The model and effort of this upload's grading; null while it has none.
```

Replace it with:

```ts
  flagCount: number;
  // Those points: the pages first, then the items in the barem's order.
  reviewPoints: ReviewPoint[];
  // The model and effort of this upload's grading; null while it has none.
```

- [ ] **Step 10: Edit `server/db/tests.ts`**

Find this block:

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { AnalysisInfo, BaremRequest, ExerciseListInfo, PrintStatus, TestInfo, TestSummary, UploadRow, UploadStatus } from '../../shared/api.ts';
import { DOCX_TYPE, type TestFileKind } from '../../shared/files.ts';
```

Replace it with:

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type {
  AnalysisInfo,
  BaremRequest,
  ExerciseListInfo,
  PrintStatus,
  ReviewPoint,
  TestInfo,
  TestSummary,
  UploadRow,
  UploadStatus,
} from '../../shared/api.ts';
import { DOCX_TYPE, type TestFileKind } from '../../shared/files.ts';
```

- [ ] **Step 11: Edit `server/db/tests.ts`**

Find this block:

```ts

// The uploads table in one query: every active student of the class, and any
// student who left the class after starting an upload. Sorted by name.
export async function listUploads(db: D1Database, testId: number, classId: number): Promise<UploadRow[]> {
  const { results } = await db
    .prepare(
      `SELECT st.id AS student_id, st.full_name, e.active,
         s.id AS submission_id, s.status, s.started_at, s.submitted_at, s.auto_submitted, s.last_error, ev.grade, ev.total, ev.max_total, ev.created_at AS graded_at, ev.model, ev.effort,
         s.result_token, s.results_open AS submission_open, (SELECT t.results_open FROM tests t WHERE t.id = ?) AS test_open,
         (SELECT COUNT(*) FROM submission_files f WHERE f.submission_id = s.id) AS file_count,
         ${flagCountSql('ev')} AS flag_count
       FROM enrollments e
       JOIN students st ON st.id = e.student_id
       LEFT JOIN submissions s ON s.test_id = ? AND s.student_id = e.student_id
       LEFT JOIN evaluations ev ON ev.submission_id = s.id
       WHERE e.class_id = ? AND (e.active = 1 OR s.id IS NOT NULL)`,
    )
    .bind(testId, testId, classId)
    .all<{
      student_id: number;
      full_name: string;
      active: number;
      submission_id: number | null;
      status: UploadStatus | null;
      started_at: string | null;
      submitted_at: string | null;
      auto_submitted: number | null;
      last_error: string | null;
      grade: number | null;
      total: number | null;
      max_total: number | null;
      graded_at: string | null;
      model: string | null;
      effort: string | null;
      result_token: string | null;
      submission_open: number | null;
      test_open: number;
      file_count: number;
      flag_count: number;
    }>();
  return results
    .map((row) => ({
```

Replace it with:

```ts

interface UploadSqlRow {
  student_id: number;
  full_name: string;
  active: number;
  submission_id: number | null;
  status: UploadStatus | null;
  started_at: string | null;
  submitted_at: string | null;
  auto_submitted: number | null;
  last_error: string | null;
  grade: number | null;
  total: number | null;
  max_total: number | null;
  graded_at: string | null;
  model: string | null;
  effort: string | null;
  result_token: string | null;
  submission_open: number | null;
  test_open: number;
  file_count: number;
  unreadable_json: string | null;
  pages_reviewed_at: string | null;
  flag_count: number;
}

interface PointSqlRow {
  submission_id: number;
  id: number;
  exercise_id: string;
  label: string;
  points: number;
  max_points: number;
  review_reason: string;
}

// The uploads table in one round trip: every active student of the class, and
// any student who left the class after starting an upload, sorted by name;
// and the points to check of each paper, counted as flagCountSql counts them.
export async function listUploads(db: D1Database, testId: number, classId: number): Promise<UploadRow[]> {
  const [uploads, points] = await db.batch<UploadSqlRow | PointSqlRow>([
    db
      .prepare(
        `SELECT st.id AS student_id, st.full_name, e.active,
           s.id AS submission_id, s.status, s.started_at, s.submitted_at, s.auto_submitted, s.last_error, ev.grade, ev.total, ev.max_total, ev.created_at AS graded_at, ev.model, ev.effort,
           s.result_token, s.results_open AS submission_open, (SELECT t.results_open FROM tests t WHERE t.id = ?) AS test_open,
           (SELECT COUNT(*) FROM submission_files f WHERE f.submission_id = s.id) AS file_count,
           ev.unreadable_json, ev.pages_reviewed_at,
           ${flagCountSql('ev')} AS flag_count
         FROM enrollments e
         JOIN students st ON st.id = e.student_id
         LEFT JOIN submissions s ON s.test_id = ? AND s.student_id = e.student_id
         LEFT JOIN evaluations ev ON ev.submission_id = s.id
         WHERE e.class_id = ? AND (e.active = 1 OR s.id IS NOT NULL)`,
      )
      .bind(testId, testId, classId),
    db
      .prepare(
        `SELECT ev.submission_id, i.id, i.exercise_id, i.label, i.points, i.max_points, i.review_reason
         FROM evaluation_items i
         JOIN evaluations ev ON ev.id = i.evaluation_id
         JOIN submissions s ON s.id = ev.submission_id
         WHERE s.test_id = ? AND i.needs_review = 1 AND i.reviewed_at IS NULL
         ORDER BY i.position, i.id`,
      )
      .bind(testId),
  ]);
  const itemsOf = new Map<number, ReviewPoint[]>();
  for (const row of (points?.results ?? []) as PointSqlRow[]) {
    const list = itemsOf.get(row.submission_id) ?? [];
    list.push({
      kind: 'item',
      itemId: row.id,
      exerciseId: row.exercise_id,
      label: row.label,
      points: row.points,
      maxPoints: row.max_points,
      reason: row.review_reason,
    });
    itemsOf.set(row.submission_id, list);
  }
  const pointsOf = (row: UploadSqlRow): ReviewPoint[] => {
    if (row.submission_id === null) return [];
    const pages = row.unreadable_json === null ? [] : (JSON.parse(row.unreadable_json) as string[]);
    const items = itemsOf.get(row.submission_id) ?? [];
    return pages.length > 0 && row.pages_reviewed_at === null ? [{ kind: 'pages', pages }, ...items] : items;
  };
  return ((uploads?.results ?? []) as UploadSqlRow[])
    .map((row) => ({
```

- [ ] **Step 12: Edit `server/db/tests.ts`**

Find this block:

```ts
      flagCount: row.flag_count,
      lastError: row.last_error,
```

Replace it with:

```ts
      flagCount: row.flag_count,
      reviewPoints: pointsOf(row),
      lastError: row.last_error,
```

- [ ] **Step 13: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  116 passed | 1 skipped (117)`, `Tests  1840 passed | 3 skipped (1843)`.

- [ ] **Step 14: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 15: Commit**

```bash
git add shared/api.ts server/db/tests.ts server/routes/tests.test.ts src/test/fakeApi.ts
git commit -m "Send the points to check of each paper with the uploads list"
```

### Task 3: The review page

`/admin/teste/:code/verificare`: the papers and their points, one page of the paper, the decision, and the keys.

**Files:**
- Create: `src/admin/reviewPage/points.ts`, `src/admin/reviewPage/ReviewQueue.tsx`, `src/admin/reviewPage/ReviewPhoto.tsx`, `src/admin/reviewPage/ReviewDecision.tsx`, `src/admin/pages/ReviewPage.tsx`
- Modify: `src/admin/AppRoutes.tsx`, `src/ui/brand.css`, `src/test/fakeApi.ts` (`reviewPointsOf`, `fakeSubmission`, and the fake API keeps a row's points in step after a correction)
- Test: `src/admin/reviewPage/points.test.ts`, `src/admin/pages/ReviewPage.test.tsx`

**Interfaces:**
- Consumes: `UploadRow.reviewPoints`, `ReviewPoint`, `fakePoint` (Task 2); `api.getTest`, `api.getSubmission`, `api.correctItem`, `api.reviewPages`, `submissionFileUrl` (`src/admin/api.ts`); `refreshInterval` (`pages/TestPage.tsx`); `stageHash` (`stages.ts`).
- Produces (`reviewPage/points.ts`): `pointKey(point): string`; `papersToCheck(uploads)` and `otherPapers(uploads)`: `GradedRow[]`; `pointQueue(uploads): QueuedPoint[]`; `stepPoint(queue, spot, 1 | -1): QueuedPoint | null`; `reviewPath(code, spot?): string`; `pageIndex(name): number | null`; `pointsText(value)`, `pointName(point)`; `withoutPoint(detail, saved, point): TestDetail`. `ReviewPage` on the route `teste/:code/verificare`. In `test/fakeApi.ts`: `reviewPointsOf(evaluation)`, `fakeSubmission(overrides)`.

- [ ] **Step 1: Create `src/admin/reviewPage/points.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { ReviewPoint } from '../../../shared/api.ts';
import { fakeEvaluation, fakeItem, fakePoint, fakeSubmission, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import {
  otherPapers,
  pageIndex,
  papersToCheck,
  pointKey,
  pointName,
  pointQueue,
  reviewPath,
  stepPoint,
  withoutPoint,
  type QueuedPoint,
} from './points.ts';

const pages: ReviewPoint = { kind: 'pages', pages: ['student/page-02.jpg'] };

// Ana has the pages and one item to check, Ion one item; Eva has none, Dan
// was not graded yet, and Mara sent nothing.
const uploads = () => [
  fakeUpload({ studentId: 1, studentName: 'Ana Pop', submissionId: 11, status: 'graded', grade: 8, flagCount: 2, reviewPoints: [pages, fakePoint(5)] }),
  fakeUpload({ studentId: 2, studentName: 'Dan Marin', submissionId: 12, status: 'submitted' }),
  fakeUpload({ studentId: 3, studentName: 'Eva Stan', submissionId: 13, status: 'graded', grade: 9 }),
  fakeUpload({ studentId: 4, studentName: 'Ion Popa', submissionId: 14, status: 'graded', grade: 7, flagCount: 1, reviewPoints: [fakePoint(9)] }),
  fakeUpload({ studentId: 5, studentName: 'Mara Ilie' }),
];

const keys = (queue: (QueuedPoint | null)[]) => queue.map((entry) => (entry ? `${entry.submissionId}:${pointKey(entry.point)}` : null));

describe('the points of the review', () => {
  it('names a point by its item, or "pagini" for the pages', () => {
    expect(pointKey(fakePoint(5))).toBe('5');
    expect(pointKey(pages)).toBe('pagini');
  });

  it('splits the graded papers into those with points to check and the others', () => {
    expect(papersToCheck(uploads()).map((row) => row.studentName)).toEqual(['Ana Pop', 'Ion Popa']);
    expect(otherPapers(uploads()).map((row) => row.studentName)).toEqual(['Eva Stan']);
  });

  it('queues the points paper by paper, the pages first', () => {
    expect(keys(pointQueue(uploads()))).toEqual(['11:pagini', '11:5', '14:9']);
  });

  it('steps to the next or the previous point, going round', () => {
    const queue = pointQueue(uploads());
    expect(keys([stepPoint(queue, { submissionId: 11, key: 'pagini' }, 1)])).toEqual(['11:5']);
    expect(keys([stepPoint(queue, { submissionId: 14, key: '9' }, 1)])).toEqual(['11:pagini']);
    expect(keys([stepPoint(queue, { submissionId: 11, key: 'pagini' }, -1)])).toEqual(['14:9']);
    // From a paper with no point open: the first or the last point.
    expect(keys([stepPoint(queue, { submissionId: 13, key: null }, 1)])).toEqual(['11:pagini']);
    expect(keys([stepPoint(queue, { submissionId: 13, key: null }, -1)])).toEqual(['14:9']);
    expect(keys([stepPoint(queue, null, 1)])).toEqual(['11:pagini']);
  });

  it('has no next point when the current one is the last, or none waits', () => {
    const last = pointQueue(uploads()).slice(2);
    expect(stepPoint(last, { submissionId: 14, key: '9' }, 1)).toBeNull();
    expect(stepPoint([], { submissionId: 14, key: '9' }, 1)).toBeNull();
    expect(stepPoint([], null, -1)).toBeNull();
  });

  it('writes the address of a paper and its point', () => {
    expect(reviewPath('6E2-26T1')).toBe('/teste/6E2-26T1/verificare');
    expect(reviewPath('6E2-26T1', { submissionId: 11 })).toBe('/teste/6E2-26T1/verificare?lucrare=11');
    expect(reviewPath('6E2-26T1', { submissionId: 11, key: 'pagini' })).toBe('/teste/6E2-26T1/verificare?lucrare=11&punct=pagini');
  });

  it('finds the page the robot names, counting from 0', () => {
    expect(pageIndex('student/page-02.jpg')).toBe(1);
    expect(pageIndex('student/page-10.pdf')).toBe(9);
    expect(pageIndex('poza.jpg')).toBeNull();
  });

  it('says a point in a few words', () => {
    expect(pointName(fakePoint(5, { label: 'Subiectul I, 3)', points: 0.5, maxPoints: 2 }))).toBe('Subiectul I, 3) · 0,5p din 2p');
    expect(pointName(pages)).toBe('Paginile necitite');
  });

  it('takes a decided point out of its paper, with the paper\'s new grade', () => {
    const detail = fakeTest({ status: 'done' }, uploads());
    const saved = fakeSubmission({
      id: 11,
      status: 'graded',
      evaluation: fakeEvaluation([fakeItem({ id: 5, exerciseId: 'E5', points: 2, needsReview: true })], {
        unreadable: ['student/page-02.jpg'],
        pagesReviewed: true,
      }),
    });
    const after = withoutPoint(detail, saved, pages);
    const ana = after.uploads.find((row) => row.submissionId === 11)!;
    expect(ana.reviewPoints).toEqual([fakePoint(5)]);
    expect(ana).toMatchObject({ grade: saved.evaluation!.grade, total: saved.evaluation!.total, flagCount: 1 });
    expect(after.uploads.find((row) => row.submissionId === 14)!.reviewPoints).toEqual([fakePoint(9)]);
    // The test kept in the cache is not changed in place.
    expect(detail.uploads[0]!.reviewPoints).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Create `src/admin/pages/ReviewPage.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { SubmissionDetail, UploadRow } from '../../../shared/api.ts';
import { ApiError, submissionFileUrl } from '../api.ts';
import { createFakeApi, fakeEvaluation, fakeItem, fakeSubmission, fakeTest, fakeUpload, reviewPointsOf } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';

// The review of the points to check (redesign spec §7).
const PAGE = '/teste/6E2-26T1/verificare';
const GRADED_AT = '2026-10-07T09:00:00.000Z';

const photo = (id: number, name: string) => ({ id, name, contentType: 'image/jpeg', size: 1000, position: id });

// Ana: the second page could not be read, and II.1 waits (1p of 2p). Ion:
// I.3 waits (3p of 5p). Eva: nothing to check, a PDF. Dan: not graded yet.
function papers(): SubmissionDetail[] {
  return [
    fakeSubmission({
      id: 11,
      studentId: 1,
      studentName: 'Ana Pop',
      files: [photo(101, 'a1.jpg'), photo(102, 'a2.jpg'), { id: 103, name: 'a3.pdf', contentType: 'application/pdf', size: 1000, position: 3 }],
      evaluation: fakeEvaluation(
        [
          fakeItem({ id: 31, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 4.5 }),
          fakeItem({
            id: 32,
            exerciseId: 'II.1',
            label: 'Subiectul II, ex. 1',
            points: 1,
            maxPoints: 2,
            studentAnswer: 'x = 3',
            comment: 'Verifică semnul.',
            needsReview: true,
            reviewReason: 'Scrisul nu se citește.',
          }),
        ],
        { unreadable: ['student/page-02.jpg'] },
      ),
    }),
    fakeSubmission({
      id: 14,
      studentId: 4,
      studentName: 'Ion Popa',
      files: [photo(141, 'i1.jpg')],
      evaluation: fakeEvaluation([
        fakeItem({ id: 41, exerciseId: 'I.3', label: 'Subiectul I, ex. 3', points: 3, maxPoints: 5, needsReview: true, reviewReason: 'Răspunsul e tăiat.' }),
      ]),
    }),
    fakeSubmission({
      id: 13,
      studentId: 3,
      studentName: 'Eva Stan',
      files: [{ id: 131, name: 'e.pdf', contentType: 'application/pdf', size: 1000, position: 1 }],
      evaluation: fakeEvaluation([fakeItem({ id: 51, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 4 })]),
    }),
  ];
}

// The uploads table of the same papers, sorted by name, and Dan's upload.
function rowsOf(submissions: SubmissionDetail[]): UploadRow[] {
  const rows = submissions.map((paper) =>
    fakeUpload({
      studentId: paper.studentId,
      studentName: paper.studentName,
      submissionId: paper.id,
      status: 'graded',
      fileCount: paper.files.length,
      grade: paper.evaluation!.grade,
      total: paper.evaluation!.total,
      maxTotal: paper.evaluation!.maxTotal,
      flagCount: paper.evaluation!.flagCount,
      reviewPoints: reviewPointsOf(paper.evaluation),
    }),
  );
  rows.push(fakeUpload({ studentId: 2, studentName: 'Dan Marin', submissionId: 12, status: 'submitted', fileCount: 1 }));
  return rows.sort((a, b) => a.studentName.localeCompare(b.studentName));
}

function apiWith(submissions = papers()) {
  return createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 4 }],
    students: {},
    tests: [fakeTest({ status: 'done', startedAt: '2026-10-06T07:00:00.000Z' }, rowsOf(submissions))],
    submissions,
  });
}

// The whole address, so a shorter one does not match a longer one.
const at = (search: string) => new RegExp(`^${(PAGE + search).replace(/[?.]/g, '\\$&')}$`);

const queue = () => screen.getByRole('navigation', { name: 'Lucrările' });
const decision = () => screen.getByRole('region', { name: 'Decizia' });

describe('the review of the points to check', () => {
  it('lists the papers with points to check, their points, and the other graded papers', async () => {
    renderAdmin(PAGE, apiWith());
    expect(await screen.findByRole('heading', { level: 1, name: 'Verificare' })).toBeInTheDocument();
    expect(screen.getByText('Fracții · Clasa 6E2 · 3 puncte în 2 lucrări')).toBeInTheDocument();
    const list = queue();
    expect(within(list).getByRole('heading', { name: 'Cu puncte de verificat 2' })).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Ana Pop 6,5 2 puncte de verificat' })).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Paginile necitite' })).toHaveAttribute('aria-current', 'true');
    expect(within(list).getByRole('link', { name: 'Subiectul II, ex. 1 · 1p din 2p' })).not.toHaveAttribute('aria-current');
    expect(within(list).getByRole('link', { name: 'Subiectul I, ex. 3 · 3p din 5p' })).toHaveAttribute('href', `${PAGE}?lucrare=14&punct=41`);
    expect(within(list).getByRole('heading', { name: 'Celelalte lucrări 1' })).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Eva Stan 5' })).toHaveAttribute('href', `${PAGE}?lucrare=13`);
    expect(within(list).queryByText(/Dan Marin/)).not.toBeInTheDocument();
  });

  it('opens on the first point: the pages Ana could not read, on the first of them', async () => {
    const api = apiWith();
    renderAdmin(PAGE, api, <LocationProbe />);
    expect(await screen.findByText('Ana Pop · pagina 2 din 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagina 2' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('img', { name: 'Pagina 2 a lucrării' })).toHaveAttribute('src', submissionFileUrl(11, 102));
    expect(within(decision()).getByRole('heading', { name: 'Ana Pop · Paginile necitite' })).toBeInTheDocument();
    expect(
      within(decision()).getByText('Robotul nu a putut citi: Pagina 2. Verifică pozele și punctajele exercițiilor de pe ele.'),
    ).toBeInTheDocument();

    await userEvent.click(within(decision()).getByRole('button', { name: 'Am verificat paginile' }));
    expect(api.reviewPages).toHaveBeenCalledWith(11, { pagesReviewed: true, gradedAt: GRADED_AT });
    expect(await within(decision()).findByRole('heading', { name: 'Ana Pop · Subiectul II, ex. 1' })).toBeInTheDocument();
    await expectLocation(at(`?lucrare=11&punct=32`));
    expect(within(queue()).queryByRole('link', { name: 'Paginile necitite' })).not.toBeInTheDocument();
  });

  it("accepts the robot's points, and the next point opens", async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    expect(within(panel).getByText('x = 3')).toBeInTheDocument();
    expect(within(panel).getByText('Verifică semnul.')).toBeInTheDocument();
    expect(within(panel).getByText('De verificat: Scrisul nu se citește.')).toBeInTheDocument();
    expect(within(panel).getByText('2p în barem')).toBeInTheDocument();
    expect(screen.getByText('Ana Pop · pagina 1 din 3')).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 1p' }));
    expect(api.correctItem).toHaveBeenCalledWith(11, 32, { reviewed: true, gradedAt: GRADED_AT });
    expect(await screen.findByRole('heading', { name: 'Ion Popa · Subiectul I, ex. 3' })).toBeInTheDocument();
    await expectLocation(at(`?lucrare=14&punct=41`));
    expect(screen.getByText('Fracții · Clasa 6E2 · 2 puncte în 2 lucrări')).toBeInTheDocument();
  });

  it('says what the grade becomes with another value, and saves it', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    const input = within(panel).getByRole('textbox', { name: 'Alt punctaj, din 2' });
    expect(within(panel).getByText('Total: 6,5 din 10, cu 1 din oficiu')).toBeInTheDocument();
    expect(within(panel).queryByText(/nota devine/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Scade 0,5p' }));
    expect(input).toHaveValue('0,5');
    expect(within(panel).getByText('Cu 0,5p aici, nota devine 6.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Scade 0,5p' }));
    await userEvent.click(screen.getByRole('button', { name: 'Scade 0,5p' }));
    expect(input).toHaveValue('0');
    expect(within(panel).getByText('Cu 0p aici, nota devine 5,5.')).toBeInTheDocument();
    for (let press = 0; press < 5; press += 1) await userEvent.click(screen.getByRole('button', { name: 'Adaugă 0,5p' }));
    expect(input).toHaveValue('2');

    await userEvent.clear(input);
    await userEvent.type(input, '1,25');
    expect(within(panel).getByText('Cu 1,25p aici, nota devine 6,75.')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Salvează' }));
    expect(api.correctItem).toHaveBeenCalledWith(11, 32, { points: 1.25, reviewed: true, gradedAt: GRADED_AT });
    expect(await screen.findByRole('heading', { name: 'Ion Popa · Subiectul I, ex. 3' })).toBeInTheDocument();
  });

  it('refuses a value off the steps of 0,05', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    const input = within(panel).getByRole('textbox', { name: 'Alt punctaj, din 2' });
    await userEvent.clear(input);
    await userEvent.type(input, '0,03{Enter}');
    expect(within(panel).getByRole('alert')).toHaveTextContent('Punctajul este între 0 și 2, din 0,05 în 0,05.');
    expect(within(panel).queryByText(/nota devine/)).not.toBeInTheDocument();
    expect(api.correctItem).not.toHaveBeenCalled();
  });

  it('moves with J and K, changes the page with the numbers, and accepts with A', async () => {
    const api = apiWith();
    renderAdmin(PAGE, api, <LocationProbe />);
    await screen.findByText('Ana Pop · pagina 2 din 3');
    await userEvent.keyboard('j');
    await expectLocation(at(`?lucrare=11&punct=32`));
    await userEvent.keyboard('k');
    await expectLocation(at(`?lucrare=11&punct=pagini`));
    await userEvent.keyboard('k');
    await expectLocation(at(`?lucrare=14&punct=41`));
    await userEvent.keyboard('j');
    await expectLocation(at(`?lucrare=11&punct=pagini`));
    await userEvent.keyboard('3');
    expect(screen.getByText('Ana Pop · pagina 3 din 3')).toBeInTheDocument();
    expect(screen.getByTitle('Pagina 3 a lucrării')).toHaveAttribute('src', submissionFileUrl(11, 103));
    await userEvent.keyboard('9');
    expect(screen.getByText('Ana Pop · pagina 3 din 3')).toBeInTheDocument();
    await userEvent.keyboard('1');
    expect(screen.getByText('Ana Pop · pagina 1 din 3')).toBeInTheDocument();
    await userEvent.keyboard('a');
    expect(api.reviewPages).toHaveBeenCalledWith(11, { pagesReviewed: true, gradedAt: GRADED_AT });
    expect(await within(decision()).findByRole('heading', { name: 'Ana Pop · Subiectul II, ex. 1' })).toBeInTheDocument();
  });

  it('ignores the keys in the stepper field and with Ctrl, Alt or Meta', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    const input = within(panel).getByRole('textbox', { name: 'Alt punctaj, din 2' });
    await userEvent.type(input, 'ajk2');
    expect(input).toHaveValue('1ajk2');
    input.blur();
    await userEvent.keyboard('{Control>}a{/Control}{Alt>}j{/Alt}{Meta>}k{/Meta}');
    expect(api.correctItem).not.toHaveBeenCalled();
    await expectLocation(at(`?lucrare=11&punct=32`));
  });

  it('ignores the keys while a panel of the bar is open', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(await screen.findByRole('button', { name: /^De făcut/ }));
    expect(screen.getByRole('complementary', { name: 'Ce ai de făcut' })).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard('aj');
    expect(api.correctItem).not.toHaveBeenCalled();
    await expectLocation(at(`?lucrare=11&punct=32`));
  });

  it('writes once when A is pressed twice, and no key acts while it saves', async () => {
    const api = apiWith();
    api.correctItem.mockReturnValueOnce(new Promise<never>(() => {}));
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.keyboard('aa');
    expect(api.correctItem).toHaveBeenCalledTimes(1);
    expect(within(panel).getByRole('button', { name: 'Accept 1p' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Următorul punct' })).toBeDisabled();
    await userEvent.keyboard('jk2');
    await expectLocation(at(`?lucrare=11&punct=32`));
    expect(screen.getByText('Ana Pop · pagina 1 din 3')).toBeInTheDocument();
  });

  it('says when every point is checked, with the way to Rezultate', async () => {
    const [ana, ion, eva] = papers();
    ana!.evaluation = fakeEvaluation([fakeItem({ id: 31, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 4.5 })]);
    const api = apiWith([ana!, ion!, eva!]);
    renderAdmin(PAGE, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    expect(within(panel).getByRole('heading', { name: 'Ion Popa · Subiectul I, ex. 3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Următorul punct' })).not.toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 3p' }));
    expect(await screen.findByText(/Toate punctele sunt verificate\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mergi la Rezultate' })).toHaveAttribute('href', '/teste/6E2-26T1#rezultate');
    await expectLocation(at(`?lucrare=14`));
    expect(within(decision()).getByRole('heading', { name: 'Ion Popa' })).toBeInTheDocument();
    expect(within(queue()).getByText('Niciuna.')).toBeInTheDocument();
  });

  it('reads the paper again when it was graded again in the meantime', async () => {
    const api = apiWith();
    api.correctItem.mockRejectedValueOnce(new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.'));
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    expect(api.getSubmission).toHaveBeenCalledTimes(1);
    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 1p' }));
    expect(await within(decision()).findByText('Lucrarea se corectează din nou. Reîncarcă pagina.')).toBeInTheDocument();
    expect(api.getSubmission).toHaveBeenCalledTimes(2);
    await expectLocation(at(`?lucrare=11&punct=32`));
  });

  it('shows a paper with no point to check: its total, its exercises and its page', async () => {
    renderAdmin(`${PAGE}?lucrare=13`, apiWith());
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    expect(within(panel).getByRole('heading', { name: 'Eva Stan' })).toBeInTheDocument();
    expect(within(panel).getByText('Total: 5 din 10, cu 1 din oficiu')).toBeInTheDocument();
    expect(within(panel).getByText('Subiectul I, ex. 1 · 4p din 4,5p')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Deschide lucrarea' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/13');
    expect(within(panel).queryByRole('button', { name: /^Accept/ })).not.toBeInTheDocument();
    expect(screen.getByTitle('Pagina 1 a lucrării')).toHaveAttribute('src', submissionFileUrl(13, 131));
    expect(within(queue()).getByRole('link', { name: 'Eva Stan 5' })).toHaveAttribute('aria-current', 'true');
  });

  it('opens a point from the exercises of the paper', async () => {
    renderAdmin(PAGE, apiWith(), <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('link', { name: 'Subiectul II, ex. 1 · 1p din 2p' }));
    await expectLocation(at(`?lucrare=11&punct=32`));
    expect(await within(decision()).findByRole('heading', { name: 'Ana Pop · Subiectul II, ex. 1' })).toBeInTheDocument();
  });

  it('says when a paper has no files', async () => {
    const [ana, ion, eva] = papers();
    ion!.files = [];
    renderAdmin(`${PAGE}?lucrare=14&punct=41`, apiWith([ana!, ion!, eva!]));
    expect(await screen.findByText('Elevul nu a încărcat niciun fișier.')).toBeInTheDocument();
  });

  it('has one line before any paper is graded, and the way back to the test', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 1 }],
      students: {},
      tests: [fakeTest({ status: 'evaluating' }, [fakeUpload({ studentId: 2, studentName: 'Dan Marin', submissionId: 12, status: 'submitted' })])],
    });
    renderAdmin(PAGE, api);
    expect(await screen.findByText('Nicio lucrare nu este corectată încă.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Înapoi la test' })).toHaveAttribute('href', '/teste/6E2-26T1#verificare');
    expect(screen.queryByRole('navigation', { name: 'Lucrările' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Edit `src/test/fakeApi.ts`**

Find this block:

```ts

// A graded result out of 10 with 1 point "din oficiu", for building fake data in tests.
```

Replace it with:

```ts

// The points to check of a graded result, as the uploads list sends them:
// the pages first, then the items in order.
export function reviewPointsOf(evaluation: EvaluationInfo | null): ReviewPoint[] {
  if (!evaluation) return [];
  const items: ReviewPoint[] = evaluation.items
    .filter((item) => item.needsReview && !item.reviewed)
    .map((item) => ({
      kind: 'item',
      itemId: item.id,
      exerciseId: item.exerciseId,
      label: item.label,
      points: item.points,
      maxPoints: item.maxPoints,
      reason: item.reviewReason,
    }));
  return evaluation.unreadable.length > 0 && !evaluation.pagesReviewed ? [{ kind: 'pages', pages: [...evaluation.unreadable] }, ...items] : items;
}

// One student's upload of the test 6E2-26T1, graded unless told, for building fake data in tests.
export function fakeSubmission(overrides: Partial<SubmissionDetail> & Pick<SubmissionDetail, 'id'>): SubmissionDetail {
  return {
    testCode: '6E2-26T1',
    testTitle: 'Fracții',
    testStatus: 'done',
    studentId: 10,
    studentName: 'Pop Ion',
    status: 'graded',
    autoSubmitted: false,
    startedAt: FAKE_STARTED_AT,
    submittedAt: '2026-10-06T08:30:00.000Z',
    lastError: null,
    files: [],
    evaluation: null,
    resultToken: null,
    resultsOpen: false,
    ...overrides,
  };
}

// A graded result out of 10 with 1 point "din oficiu", for building fake data in tests.
```

- [ ] **Step 4: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  };
  // The uploads table shows the grade and the items to check of the upload.
  const syncRow = (submission: SubmissionDetail) => {
```

Replace it with:

```ts
  };
  // The uploads table shows the grade and the points to check of the upload.
  const syncRow = (submission: SubmissionDetail) => {
```

- [ ] **Step 5: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
          grade: submission.evaluation?.grade ?? null,
          flagCount: submission.evaluation?.flagCount ?? 0,
        });
```

Replace it with:

```ts
          grade: submission.evaluation?.grade ?? null,
          total: submission.evaluation?.total ?? null,
          flagCount: submission.evaluation?.flagCount ?? 0,
          reviewPoints: reviewPointsOf(submission.evaluation),
        });
```

- [ ] **Step 6: Run the tests to see them fail**

Run: `npx vitest run src/admin/reviewPage/points.test.ts src/admin/pages/ReviewPage.test.tsx`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  15 failed (15)`: `points.test.ts` does not load (`Error: Failed to resolve import "./points.ts" from "src/admin/reviewPage/points.test.ts". Does the file exist?`), and the 15 tests of `ReviewPage.test.tsx` find no review page (the address shows the page "not found": `Unable to find role="heading" and name "Verificare"`, `Unable to find role="region" and name "Decizia"`, `Unable to find an element with the text: Ana Pop · pagina 2 din 3`, `… Elevul nu a încărcat niciun fișier.`, `… Nicio lucrare nu este corectată încă.`).

- [ ] **Step 7: Create `src/admin/reviewPage/points.ts`**

```ts
import type { ReviewPoint, SubmissionDetail, TestDetail, UploadRow } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';

// The review of the points to check (redesign spec §7): which points wait, in
// which order, and the address of each.

// A graded paper, which always has its upload.
export type GradedRow = UploadRow & { submissionId: number };

// A point to check and the paper it is on.
export interface QueuedPoint {
  submissionId: number;
  studentName: string;
  point: ReviewPoint;
}

// Where the review stands: a paper, and one of its points or none.
export interface ReviewSpot {
  submissionId: number;
  key: string | null;
}

// The point's name in the address: the item's id, or "pagini" for the pages
// the robot could not read.
export function pointKey(point: ReviewPoint): string {
  return point.kind === 'pages' ? 'pagini' : String(point.itemId);
}

function isGraded(row: UploadRow): row is GradedRow {
  return row.status === 'graded' && row.submissionId !== null;
}

// The graded papers with points to check, in the order of the uploads list
// (by the student's name).
export function papersToCheck(uploads: UploadRow[]): GradedRow[] {
  return uploads.filter(isGraded).filter((row) => row.reviewPoints.length > 0);
}

// Every other graded paper.
export function otherPapers(uploads: UploadRow[]): GradedRow[] {
  return uploads.filter(isGraded).filter((row) => row.reviewPoints.length === 0);
}

// Every point to check: paper by paper, and in a paper as the API lists them
// (the pages first, then the exercises in the barem's order).
export function pointQueue(uploads: UploadRow[]): QueuedPoint[] {
  return papersToCheck(uploads).flatMap((row) =>
    row.reviewPoints.map((point) => ({ submissionId: row.submissionId, studentName: row.studentName, point })),
  );
}

export function isSpotOf(entry: QueuedPoint, spot: ReviewSpot | null): boolean {
  return spot !== null && entry.submissionId === spot.submissionId && pointKey(entry.point) === spot.key;
}

// The point after (1) or before (-1) the spot, going round the queue. From a
// spot that is not a point of the queue: the first or the last point. Null
// when no other point waits.
export function stepPoint(queue: QueuedPoint[], spot: ReviewSpot | null, step: 1 | -1): QueuedPoint | null {
  const index = queue.findIndex((entry) => isSpotOf(entry, spot));
  if (index === -1) return (step === 1 ? queue[0] : queue[queue.length - 1]) ?? null;
  if (queue.length === 1) return null;
  return queue[(index + step + queue.length) % queue.length] ?? null;
}

// The address of the review, on a paper and maybe one of its points.
export function reviewPath(code: string, spot?: { submissionId: number; key?: string | null }): string {
  const base = `/teste/${code}/verificare`;
  if (spot === undefined) return base;
  return spot.key ? `${base}?lucrare=${spot.submissionId}&punct=${spot.key}` : `${base}?lucrare=${spot.submissionId}`;
}

// The page of an upload that the robot names "student/page-02.jpg": the
// upload's files in order, from 0. Null for a name without a number.
export function pageIndex(name: string): number | null {
  const match = /page-(\d+)\.[a-z]+$/.exec(name);
  return match ? Number(match[1]) - 1 : null;
}

// Points as the review writes them: "1p", "0,5p".
export function pointsText(value: number): string {
  return `${formatPoints(value)}p`;
}

// "Subiectul I, 3) · 1p din 2p", or "Paginile necitite".
export function pointName(point: ReviewPoint): string {
  return point.kind === 'pages' ? 'Paginile necitite' : `${point.label} · ${pointsText(point.points)} din ${pointsText(point.maxPoints)}`;
}

// The test after a decision on one of its points, before the API is read
// again: the point leaves the paper's list, and the paper shows its new grade.
export function withoutPoint(detail: TestDetail, saved: SubmissionDetail, point: ReviewPoint): TestDetail {
  const key = pointKey(point);
  return {
    ...detail,
    uploads: detail.uploads.map((row) =>
      row.submissionId === saved.id
        ? {
            ...row,
            grade: saved.evaluation?.grade ?? row.grade,
            total: saved.evaluation?.total ?? row.total,
            flagCount: saved.evaluation?.flagCount ?? row.flagCount,
            reviewPoints: row.reviewPoints.filter((other) => pointKey(other) !== key),
          }
        : row,
    ),
  };
}
```

- [ ] **Step 8: Create `src/admin/reviewPage/ReviewQueue.tsx`**

```tsx
import { Link } from 'react-router';
import { formatPoints } from '../../../shared/scoring.ts';
import { countLabel } from '../../ui/format.ts';
import { pointKey, pointName, reviewPath, type GradedRow, type ReviewSpot } from './points.ts';

// The left pane of the review (redesign spec §7): the papers with points to
// check, each with its points, then the other graded papers. The links
// replace the address, so Back leaves the review.
export function ReviewQueue({ code, papers, others, spot }: { code: string; papers: GradedRow[]; others: GradedRow[]; spot: ReviewSpot }) {
  return (
    <nav className="review-queue" aria-label="Lucrările">
      <h2 className="review-queue-head">
        Cu puncte de verificat <span className="review-count">{papers.length}</span>
      </h2>
      {papers.length === 0 ? (
        <p className="hint">Niciuna.</p>
      ) : (
        <ul className="review-papers">
          {papers.map((row) => (
            <li key={row.submissionId}>
              <Link replace to={reviewPath(code, { submissionId: row.submissionId, key: pointKey(row.reviewPoints[0]!) })} className="review-paper">
                <span className="review-paper-name">
                  {row.studentName} {row.grade !== null && <span className="review-grade">{formatPoints(row.grade)}</span>}
                </span>{' '}
                <span className="hint">{countLabel(row.reviewPoints.length, 'punct de verificat', 'puncte de verificat')}</span>
              </Link>
              <ul className="review-points">
                {row.reviewPoints.map((point) => {
                  const key = pointKey(point);
                  const current = spot.submissionId === row.submissionId && spot.key === key;
                  return (
                    <li key={key}>
                      <Link replace to={reviewPath(code, { submissionId: row.submissionId, key })} aria-current={current ? 'true' : undefined}>
                        {pointName(point)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <>
          <h2 className="review-queue-head">
            Celelalte lucrări <span className="review-count">{others.length}</span>
          </h2>
          <ul className="review-others">
            {others.map((row) => (
              <li key={row.submissionId}>
                <Link
                  replace
                  to={reviewPath(code, { submissionId: row.submissionId })}
                  className="review-paper"
                  aria-current={spot.submissionId === row.submissionId ? 'true' : undefined}
                >
                  <span className="review-paper-name">
                    {row.studentName} {row.grade !== null && <span className="review-grade">{formatPoints(row.grade)}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  );
}
```

- [ ] **Step 9: Create `src/admin/reviewPage/ReviewPhoto.tsx`**

```tsx
import type { SubmissionDetail } from '../../../shared/api.ts';
import { submissionFileUrl } from '../api.ts';

// The middle pane of the review: one page of the paper at a time, with the
// page switch. No marks on the photo: the robot does not say where an answer
// is (redesign spec §7, decision 27). A photo opens full size on a click.
export function ReviewPhoto({ submission, page, onPage }: { submission: SubmissionDetail; page: number; onPage: (page: number) => void }) {
  const files = submission.files;
  if (files.length === 0) {
    return (
      <div className="review-photo">
        <p className="hint">Elevul nu a încărcat niciun fișier.</p>
      </div>
    );
  }
  const index = Math.min(Math.max(page, 0), files.length - 1);
  const file = files[index]!;
  const url = submissionFileUrl(submission.id, file.id);
  const caption = `${submission.studentName} · pagina ${index + 1} din ${files.length}`;
  return (
    <figure className="review-photo">
      <div className="review-photo-top">
        <figcaption>{caption}</figcaption>
        {files.length > 1 && (
          <span className="page-switch" role="group" aria-label="Paginile lucrării">
            {files.map((other, number) => (
              <button
                key={other.id}
                type="button"
                className="page-switch-button"
                aria-label={`Pagina ${number + 1}`}
                aria-current={number === index ? 'true' : undefined}
                onClick={() => onPage(number)}
              >
                {number + 1}
              </button>
            ))}
          </span>
        )}
      </div>
      {file.contentType.startsWith('image/') ? (
        <a href={url} target="_blank" rel="noopener" title="Deschide poza mare">
          <img src={url} alt={`Pagina ${index + 1} a lucrării`} />
        </a>
      ) : (
        <>
          <iframe className="pdf-frame" src={url} title={`Pagina ${index + 1} a lucrării`} />
          <a href={url} target="_blank" rel="noopener">
            Deschide PDF-ul
          </a>
        </>
      )}
    </figure>
  );
}
```

- [ ] **Step 10: Create `src/admin/reviewPage/ReviewDecision.tsx`**

```tsx
import { useId, useState } from 'react';
import { Link } from 'react-router';
import type { EvaluationInfo, EvaluationItemInfo, ItemChange, SubmissionDetail } from '../../../shared/api.ts';
import { formatPoints, gradeOf, isValidCorrection, round2 } from '../../../shared/scoring.ts';
import { pageLabel, parsePoints } from '../../ui/format.ts';
import { MathText } from '../../ui/MathText.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { pointsText, reviewPath } from './points.ts';

// What the right pane shows: an exercise to check, the pages the robot could
// not read, or the paper with no point open.
export type ReviewView = { kind: 'item'; item: EvaluationItemInfo } | { kind: 'pages'; pages: string[] } | { kind: 'paper' };

// − and + move the points by half a point; any value in steps of 0,05 can be
// typed. Their names say the step: the bar's phone menu is "Mai mult".
const STEP = 0.5;

// The right pane of the review (redesign spec §7). `onDecide` accepts the
// point with a change of points, or none.
export function ReviewDecision({
  code,
  submission,
  view,
  pending,
  error,
  onDecide,
}: {
  code: string;
  submission: SubmissionDetail;
  view: ReviewView;
  pending: boolean;
  error: Error | null;
  onDecide: (change: ItemChange) => void;
}) {
  const evaluation = submission.status === 'graded' ? submission.evaluation : null;
  return (
    <section className="review-decision" aria-label="Decizia">
      {evaluation === null ? (
        <>
          <h2>{submission.studentName}</h2>
          <p className="hint">Lucrarea se corectează din nou.</p>
        </>
      ) : view.kind === 'item' ? (
        <ItemPoint key={view.item.id} submission={submission} evaluation={evaluation} item={view.item} pending={pending} onDecide={onDecide} />
      ) : view.kind === 'pages' ? (
        <>
          <h2>{submission.studentName} · Paginile necitite</h2>
          <div className="review-doubt">
            <p>Robotul nu a putut citi: {view.pages.map(pageLabel).join(', ')}. Verifică pozele și punctajele exercițiilor de pe ele.</p>
            <div className="review-decide">
              <button type="button" className="button" disabled={pending} onClick={() => onDecide({})}>
                Am verificat paginile
              </button>
            </div>
          </div>
          <Total evaluation={evaluation} />
        </>
      ) : (
        <>
          <h2>{submission.studentName}</h2>
          <Total evaluation={evaluation} />
        </>
      )}
      {error && <ErrorMessage error={error} />}
      {evaluation !== null && view.kind !== 'paper' && (
        <p className="review-keys hint">
          <span>
            <kbd>A</kbd> accept
          </span>
          <span>
            <kbd>J</kbd> <kbd>K</kbd> punctul următor sau anterior
          </span>
          {submission.files.length > 1 && (
            <span>
              <kbd>1</kbd>–<kbd>{Math.min(9, submission.files.length)}</kbd> pagina
            </span>
          )}
        </p>
      )}
      {evaluation !== null && <Exercises code={code} submissionId={submission.id} items={evaluation.items} current={view.kind === 'item' ? view.item.id : null} />}
      <p>
        <Link to={`/teste/${code}/elevi/${submission.id}`}>Deschide lucrarea</Link>
      </p>
    </section>
  );
}

// One exercise to check: "Accept", or another value with the stepper and "Salvează".
function ItemPoint({
  submission,
  evaluation,
  item,
  pending,
  onDecide,
}: {
  submission: SubmissionDetail;
  evaluation: EvaluationInfo;
  item: EvaluationItemInfo;
  pending: boolean;
  onDecide: (change: ItemChange) => void;
}) {
  const id = useId();
  const [value, setValue] = useState(formatPoints(item.points));
  const [problem, setProblem] = useState<string | null>(null);
  const typed = parsePoints(value);
  const valid = typed !== null && isValidCorrection(typed, item.maxPoints);
  const other = valid && typed !== item.points ? typed : null;

  const move = (delta: number) => {
    const from = typed ?? item.points;
    setValue(formatPoints(round2(Math.min(item.maxPoints, Math.max(0, from + delta)))));
    setProblem(null);
  };
  const save = () => {
    if (!valid) {
      setProblem(`Punctajul este între 0 și ${formatPoints(item.maxPoints)}, din 0,05 în 0,05.`);
      return;
    }
    setProblem(null);
    onDecide(typed === item.points ? {} : { points: typed });
  };

  return (
    <>
      <div className="review-item-head">
        <h2>
          {submission.studentName} · {item.label}
        </h2>
        <span className="hint">{pointsText(item.maxPoints)} în barem</span>
      </div>
      <div className="review-doubt">
        <p className="review-item-points">
          <strong>{pointsText(item.points)}</strong> din {pointsText(item.maxPoints)}
        </p>
        <p>
          <span className="hint">Răspunsul elevului: </span>
          <MathText text={item.studentAnswer} />
        </p>
        <p>
          <span className="hint">Comentariul: </span>
          <MathText text={item.comment} />
        </p>
        <p className="review-why">
          De verificat: <MathText text={item.reviewReason} />
        </p>
        <div className="review-decide">
          <button type="button" className="button" disabled={pending} onClick={() => onDecide({})}>
            Accept {pointsText(item.points)}
          </button>
          <span className="stepper" role="group" aria-label="Alt punctaj">
            <button type="button" className="button-quiet" aria-label={`Scade ${pointsText(STEP)}`} disabled={pending} onClick={() => move(-STEP)}>
              −
            </button>
            <label className="sr-only" htmlFor={id}>
              Alt punctaj, din {formatPoints(item.maxPoints)}
            </label>
            <input
              id={id}
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setProblem(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !pending) save();
              }}
            />
            <button type="button" className="button-quiet" aria-label={`Adaugă ${pointsText(STEP)}`} disabled={pending} onClick={() => move(STEP)}>
              +
            </button>
          </span>
          <button type="button" className="button-quiet" disabled={pending} onClick={save}>
            Salvează
          </button>
        </div>
        {problem && (
          <p className="cell-error" role="alert">
            {problem}
          </p>
        )}
      </div>
      <Total evaluation={evaluation} />
      {other !== null && (
        <p className="review-preview" role="status">
          Cu {pointsText(other)} aici, nota devine {formatPoints(gradeOf(round2(evaluation.total - item.points + other), evaluation.maxTotal))}.
        </p>
      )}
    </>
  );
}

// "Total: 75 din 100, cu 10 din oficiu", and the grade.
function Total({ evaluation }: { evaluation: EvaluationInfo }) {
  return (
    <p className="review-total">
      <span>
        Total: {formatPoints(evaluation.total)} din {formatPoints(evaluation.maxTotal)}
        {evaluation.officePoints > 0 && `, cu ${formatPoints(evaluation.officePoints)} din oficiu`}
      </span>
      <span>
        Nota <strong className="review-total-grade">{formatPoints(evaluation.grade)}</strong>
      </span>
    </p>
  );
}

// The paper's exercises with their points: the open one marked, the others
// to check open on a click.
function Exercises({ code, submissionId, items, current }: { code: string; submissionId: number; items: EvaluationItemInfo[]; current: number | null }) {
  return (
    <>
      <h3>Exercițiile lucrării</h3>
      <ul className="review-exercises">
        {items.map((item) => {
          const toCheck = item.needsReview && !item.reviewed;
          const text = `${item.label} · ${pointsText(item.points)} din ${pointsText(item.maxPoints)}`;
          return (
            <li key={item.id} className={item.id === current ? 'is-current' : toCheck ? 'is-doubt' : undefined}>
              {toCheck && item.id !== current ? (
                <Link replace to={reviewPath(code, { submissionId, key: String(item.id) })}>
                  {text}
                </Link>
              ) : (
                <span aria-current={item.id === current ? 'true' : undefined}>{text}</span>
              )}
              {toCheck && <span className="tag tag-wait">de verificat</span>}
              {item.needsReview && item.reviewed && <span className="tag tag-ok">verificat</span>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
```

- [ ] **Step 11: Create `src/admin/pages/ReviewPage.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import type { ItemChange, ReviewPoint, SubmissionDetail, TestDetail } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { normalizeTestCode } from '../../../shared/tests.ts';
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { ReviewDecision, type ReviewView } from '../reviewPage/ReviewDecision.tsx';
import { ReviewPhoto } from '../reviewPage/ReviewPhoto.tsx';
import { ReviewQueue } from '../reviewPage/ReviewQueue.tsx';
import {
  otherPapers,
  pageIndex,
  papersToCheck,
  pointKey,
  pointQueue,
  stepPoint,
  withoutPoint,
  type QueuedPoint,
  type ReviewSpot,
} from '../reviewPage/points.ts';
import { stageHash } from '../stages.ts';
import { NotFoundPage } from './NotFoundPage.tsx';
import { refreshInterval } from './TestPage.tsx';

// /teste/:code/verificare: the review of the points to check (redesign spec
// §7). The papers and their points on the left, the page of the paper in the
// middle, the decision on the right.
export function ReviewPage() {
  const code = normalizeTestCode(useParams().code ?? '');
  if (code === null) return <NotFoundPage />;
  return <ReviewLoader key={code} code={code} />;
}

function ReviewLoader({ code }: { code: string }) {
  const api = useApi();
  // The test page's data: while the robot grades, new papers come in.
  const detail = useQuery({
    queryKey: ['test', code],
    queryFn: () => api.getTest(code),
    refetchInterval: (query) => refreshInterval(query.state.data?.test.status),
  });
  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.data === undefined) return <ErrorMessage error={detail.error} />;
  return <Review code={code} detail={detail.data} refreshError={detail.isRefetchError ? detail.error : null} />;
}

interface Decision {
  submission: SubmissionDetail;
  point: ReviewPoint;
  change: ItemChange;
  // The point that opens after this one; null when none is left.
  next: QueuedPoint | null;
}

// A key typed in a field is text, not a command.
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function Review({ code, detail, refreshError }: { code: string; detail: TestDetail; refreshError: Error | null }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const page = useRef<HTMLElement | null>(null);
  const { test, uploads } = detail;
  const papers = papersToCheck(uploads);
  const others = otherPapers(uploads);
  const queue = pointQueue(uploads);

  // The spot the address names. Without one, or for a paper that is not a
  // graded paper of this test: the first point, else the first paper.
  const asked = parsePositiveId(params.get('lucrare') ?? undefined);
  const askedRow = [...papers, ...others].find((row) => row.submissionId === asked);
  const first = queue[0];
  const spot: ReviewSpot | null = askedRow
    ? { submissionId: askedRow.submissionId, key: params.get('punct') }
    : first
      ? { submissionId: first.submissionId, key: pointKey(first.point) }
      : others[0]
        ? { submissionId: others[0].submissionId, key: null }
        : null;
  const row = [...papers, ...others].find((other) => other.submissionId === spot?.submissionId);
  const point = row?.reviewPoints.find((other) => pointKey(other) === spot?.key) ?? null;

  const paper = useQuery({
    queryKey: ['submission', spot?.submissionId],
    queryFn: () => api.getSubmission(spot!.submissionId),
    enabled: spot !== null,
  });
  const submission = paper.data;
  const evaluation = submission?.status === 'graded' ? submission.evaluation : null;

  // What the right pane shows: the point, while the paper still has it to
  // check, else the paper.
  const item = point?.kind === 'item' ? evaluation?.items.find((other) => other.id === point.itemId && other.needsReview && !other.reviewed) : undefined;
  const pagesWait = point?.kind === 'pages' && evaluation !== null && evaluation !== undefined && evaluation.unreadable.length > 0 && !evaluation.pagesReviewed;
  const view: ReviewView = item ? { kind: 'item', item } : pagesWait && evaluation ? { kind: 'pages', pages: evaluation.unreadable } : { kind: 'paper' };

  // The page of the paper: page 1, or the first page the robot could not read.
  const viewKey = `${spot?.submissionId}:${spot?.key ?? ''}`;
  const [pageChoice, setPageChoice] = useState<{ view: string; page: number } | null>(null);
  const firstPage = view.kind === 'pages' ? (pageIndex(view.pages[0] ?? '') ?? 0) : 0;
  const shownPage = pageChoice?.view === viewKey ? pageChoice.page : firstPage;

  const go = (target: { submissionId: number; key: string | null } | null) => {
    if (target === null) return;
    const next = new URLSearchParams({ lucrare: String(target.submissionId) });
    if (target.key !== null) next.set('punct', target.key);
    setParams(next, { replace: true });
  };
  const goPoint = (entry: QueuedPoint | null) => go(entry && { submissionId: entry.submissionId, key: pointKey(entry.point) });

  const decide = useMutation({
    mutationFn: ({ submission: shown, point: chosen, change }: Decision) => {
      const gradedAt = shown.evaluation!.gradedAt;
      return chosen.kind === 'pages'
        ? api.reviewPages(shown.id, { pagesReviewed: true, gradedAt })
        : api.correctItem(shown.id, chosen.itemId, { ...change, reviewed: true, gradedAt });
    },
    onSuccess: (saved, { point: chosen, next }) => {
      queryClient.setQueryData(['submission', saved.id], saved);
      // The point leaves the list at once; the API is read again after.
      queryClient.setQueryData<TestDetail>(['test', code], (old) => old && withoutPoint(old, saved, chosen));
      if (next) goPoint(next);
      else go({ submissionId: saved.id, key: null });
      void queryClient.invalidateQueries({ queryKey: ['tests'] });
      void queryClient.invalidateQueries({ queryKey: ['test', code] });
    },
    // A paper graded again in the meantime refuses the change: read it again.
    onError: (_error, { submission: shown }) => {
      void queryClient.invalidateQueries({ queryKey: ['submission', shown.id] });
      void queryClient.invalidateQueries({ queryKey: ['test', code] });
    },
  });
  const failed = decide.variables;
  const decideError =
    decide.isError && failed && failed.submission.id === spot?.submissionId && pointKey(failed.point) === spot.key ? decide.error : null;

  const onDecide = (change: ItemChange) => {
    if (!point || !submission || view.kind === 'paper' || decide.isPending) return;
    decide.mutate({ submission, point, change, next: stepPoint(queue, spot, 1) });
  };
  const nextPoint = stepPoint(queue, spot, 1);

  // A, J, K and 1–9, while the cursor is on the page and not in a field, and
  // no decision is on its way.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || isTyping(event.target)) return;
      if (event.target instanceof Node && event.target !== document.body && !page.current?.contains(event.target)) return;
      // While a decision is on its way, no key acts: the next point opens after it.
      if (decide.isPending) return;
      const key = event.key.toLowerCase();
      if (key === 'a') onDecide({});
      else if (key === 'j') goPoint(stepPoint(queue, spot, 1));
      else if (key === 'k') goPoint(stepPoint(queue, spot, -1));
      else if (/^[1-9]$/.test(key) && submission && Number(key) <= submission.files.length) setPageChoice({ view: viewKey, page: Number(key) - 1 });
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <section className="review-page" ref={page}>
      <div className="review-head">
        <div>
          <h1>Verificare</h1>
          <p className="test-sub">
            {test.title} · {displayClassName(test.className)}
            {queue.length > 0 && ` · ${countLabel(queue.length, 'punct', 'puncte')} în ${countLabel(papers.length, 'lucrare', 'lucrări')}`}
          </p>
        </div>
        <div className="review-actions">
          <Link className="button-quiet" to={`/teste/${code}${stageHash('Verificare')}`}>
            Înapoi la test
          </Link>
          {nextPoint && (
            <button type="button" className="button" disabled={decide.isPending} onClick={() => goPoint(nextPoint)}>
              Următorul punct
            </button>
          )}
        </div>
      </div>
      {refreshError && <ErrorMessage error={refreshError} />}
      {spot === null ? (
        <p className="hint">Nicio lucrare nu este corectată încă.</p>
      ) : (
        <>
          {queue.length === 0 && (
            <p className="review-done" role="status">
              Toate punctele sunt verificate. <Link to={`/teste/${code}${stageHash('Rezultate')}`}>Mergi la Rezultate</Link>
            </p>
          )}
          <div className="review-panes">
            <ReviewQueue code={code} papers={papers} others={others} spot={spot} />
            {submission === undefined ? (
              <div className="review-loading">{paper.isError ? <ErrorMessage error={paper.error} /> : <p className="hint">Se încarcă lucrarea…</p>}</div>
            ) : (
              <>
                <ReviewPhoto submission={submission} page={shownPage} onPage={(index) => setPageChoice({ view: viewKey, page: index })} />
                <ReviewDecision
                  code={code}
                  submission={submission}
                  view={view}
                  pending={decide.isPending}
                  error={decideError}
                  onDecide={onDecide}
                />
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 12: Edit `src/admin/AppRoutes.tsx`**

Find this block:

```tsx
import { ReportPage } from './pages/ReportPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
```

Replace it with:

```tsx
import { ReportPage } from './pages/ReportPage.tsx';
import { ReviewPage } from './pages/ReviewPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
```

- [ ] **Step 13: Edit `src/admin/AppRoutes.tsx`**

Find this block:

```tsx
        <Route path="teste/:code/raport" element={<ReportPage />} />
        <Route path="clase" element={<ClassesPage />} />
```

Replace it with:

```tsx
        <Route path="teste/:code/raport" element={<ReportPage />} />
        <Route path="teste/:code/verificare" element={<ReviewPage />} />
        <Route path="clase" element={<ClassesPage />} />
```

- [ ] **Step 14: Edit `src/ui/brand.css`**

Find this block:

```css

/* The back link at the top of a page: tight, so the page starts higher. */
```

Replace it with:

```css

/* The review of the points to check (redesign spec §7): the papers, the page
   of the paper and the decision side by side; below 1280px the papers go under
   the page, which keeps its width; on a phone one column, the page first and
   the papers last. */
.review-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
  margin-bottom: 1rem;
}

.review-head h1 {
  margin: 0;
}

.review-actions,
.review-decide {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.review-page > .alert,
.review-done {
  margin: 0 0 1rem;
}

.review-panes {
  display: grid;
  grid-template-columns: minmax(200px, 240px) minmax(0, 1fr) minmax(300px, 360px);
  grid-template-areas: "queue photo decision";
  gap: 1rem;
  align-items: start;
}

.review-queue,
.review-photo,
.review-decision,
.review-loading {
  min-width: 0;
  margin: 0;
  padding: 1rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-panel);
  background: var(--sheet);
}

.review-queue {
  grid-area: queue;
  padding: 0.75rem 0.5rem;
}

.review-photo {
  grid-area: photo;
}

.review-decision {
  grid-area: decision;
  overflow-wrap: anywhere;
}

.review-loading {
  grid-area: photo;
}

.review-queue-head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0 0.5rem 0.25rem;
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 700;
}

.review-queue > p,
.review-papers + .review-queue-head,
.review-queue > .hint + .review-queue-head {
  margin-top: 1rem;
}

.review-queue > p {
  margin: 0 0.5rem;
}

.review-papers,
.review-points,
.review-others,
.review-exercises {
  margin: 0;
  padding: 0;
  list-style: none;
}

.review-papers > li + li,
.review-others > li + li {
  border-top: 1px solid var(--line);
}

.review-queue a {
  display: block;
  border-radius: var(--radius);
  color: var(--text);
  text-decoration: none;
}

.review-queue a:hover {
  background: var(--raised);
}

.review-paper {
  padding: 0.375rem 0.5rem;
}

.review-paper-name {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-weight: 600;
}

.review-grade {
  font-variant-numeric: tabular-nums;
}

.review-points a {
  padding: 0.25rem 0.5rem 0.25rem 1rem;
  color: var(--orange);
  font-size: 0.875rem;
}

.review-queue a[aria-current="true"] {
  background: var(--marker);
  font-weight: 700;
}

.review-others a[aria-current="true"] {
  background: var(--active);
}

.review-photo-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.review-photo figcaption {
  font-weight: 600;
}

.page-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.page-switch-button {
  min-width: 2rem;
  min-height: 2rem;
  padding: 0 0.5rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--sheet);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}

.page-switch-button[aria-current="true"] {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--on-ink);
}

.review-photo img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius);
}

.review-photo .pdf-frame {
  height: 70vh;
}

.review-decision h2 {
  margin: 0;
  font-size: 1.125rem;
}

.review-decision h3 {
  margin: 1.25rem 0 0.5rem;
  font-size: 0.9375rem;
}

.review-item-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.25rem 1rem;
}

.review-doubt {
  margin: 0.75rem 0;
  padding: 0.75rem;
  border-left: 3px solid var(--orange-mark);
  border-radius: var(--radius);
  background: var(--marker);
}

.review-doubt > p {
  margin: 0 0 0.5rem;
}

.review-why {
  color: var(--orange);
  font-weight: 700;
}

.stepper {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.stepper input {
  width: 4.5rem;
  text-align: center;
}

.review-total {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.25rem 1rem;
  margin: 0.75rem 0 0;
}

.review-total-grade {
  font-size: 1.25rem;
}

.review-preview {
  margin: 0.25rem 0 0;
  color: var(--muted);
}

.review-keys {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  margin: 0.75rem 0 0;
  font-size: 0.8125rem;
}

.review-keys kbd {
  padding: 0 0.3em;
  border: 1px solid var(--control);
  border-radius: 4px;
  background: var(--raised);
  font: inherit;
}

.review-exercises li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.5rem;
  padding: 0.25rem 0;
  border-bottom: 1px solid var(--line);
  font-size: 0.875rem;
}

.review-exercises li.is-current {
  color: var(--orange);
  font-weight: 700;
}

@media (max-width: 80rem) {
  .review-panes {
    grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
    grid-template-areas:
      "photo decision"
      "queue decision";
  }
}

@media (max-width: 56.25rem) {
  .review-panes {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "photo"
      "decision"
      "queue";
  }

  .review-keys {
    display: none;
  }
}

/* The back link at the top of a page: tight, so the page starts higher. */
```

- [ ] **Step 15: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  118 passed | 1 skipped (119)`, `Tests  1864 passed | 3 skipped (1867)`.

- [ ] **Step 16: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 17: Commit**

```bash
git add src/admin/reviewPage/points.ts src/admin/reviewPage/points.test.ts src/admin/reviewPage/ReviewQueue.tsx src/admin/reviewPage/ReviewPhoto.tsx src/admin/reviewPage/ReviewDecision.tsx src/admin/pages/ReviewPage.tsx src/admin/pages/ReviewPage.test.tsx src/admin/AppRoutes.tsx src/ui/brand.css src/test/fakeApi.ts
git commit -m "Make the review page: the papers, one page of the paper, and the decision"
```

### Task 4: Every way to the points to check opens the review

The panel Verificare lists each point with its reason; its buttons, the Teste row's "Verifică 3 puncte" and the Verificare card of "De făcut" open the review.

**Files:**
- Replace: `src/admin/testPage/ReviewList.tsx`
- Modify: `src/admin/shell/todo.ts` (`todoPath`), `src/admin/shell/TodoPanel.tsx`, `src/admin/testsPage/TodoRows.tsx`, `src/admin/testsPage/nextStep.ts`, `src/ui/brand.css`
- Test: `src/admin/pages/TestPage.test.tsx`, `src/admin/pages/TestsPage.test.tsx`, `src/admin/Layout.test.tsx`, `src/admin/shell/todo.test.ts`, `src/admin/testsPage/nextStep.test.ts`

**Interfaces:**
- Consumes: `pointQueue`, `pointKey`, `pointsText`, `reviewPath` (Task 3); `fakePoint` (Task 2).
- Produces: `todoPath(item: TodoItem): string` (`/teste/<code>/verificare` for Verificare, `/teste/<code>` for the rest).

- [ ] **Step 1: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
import { robotStartMessage } from '../../ui/format.ts';
import { createFakeApi, FAKE_MULTI_TOKEN, FAKE_STARTED_AT, FAKE_TOKEN, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
```

Replace it with:

```tsx
import { robotStartMessage } from '../../ui/format.ts';
import { createFakeApi, FAKE_MULTI_TOKEN, FAKE_STARTED_AT, FAKE_TOKEN, fakePoint, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
```

- [ ] **Step 2: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx

  it('lists the papers with points to check, each opening its page, and starts with the first', async () => {
    renderAdmin(
```

Replace it with:

```tsx

  it('lists each point with its reason, each opening the review at it, and starts with the first', async () => {
    renderAdmin(
```

- [ ] **Step 3: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
      reviewApi([
        fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 8.75, flagCount: 1 }),
        fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
        fakeUpload({ studentId: 12, studentName: 'Marin Dan', submissionId: 7, status: 'graded', fileCount: 1, grade: 6.5, flagCount: 3 }),
      ]),
```

Replace it with:

```tsx
      reviewApi([
        fakeUpload({
          studentId: 10,
          studentName: 'Pop Ion',
          submissionId: 5,
          status: 'graded',
          fileCount: 2,
          grade: 8.75,
          flagCount: 1,
          reviewPoints: [fakePoint(31, { label: 'Subiectul I, 3)', points: 0.5, maxPoints: 2, reason: 'Cifra se citește greu.' })],
        }),
        fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
        fakeUpload({
          studentId: 12,
          studentName: 'Marin Dan',
          submissionId: 7,
          status: 'graded',
          fileCount: 1,
          grade: 6.5,
          flagCount: 2,
          reviewPoints: [
            { kind: 'pages', pages: ['student/page-02.jpg'] },
            fakePoint(41, { label: 'Subiectul II, 1)', points: 3, maxPoints: 5, reason: 'Răspunsul e tăiat.' }),
          ],
        }),
      ]),
```

- [ ] **Step 4: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    const panel = await screen.findByRole('region', { name: 'Verificare' });
    expect(within(panel).getByRole('link', { name: 'Începe verificarea' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/5');
    expect(within(panel).getByRole('link', { name: 'Începe verificarea' })).toHaveClass('button');
    const papers = within(panel).getAllByRole('listitem');
    expect(within(panel).getByRole('list', { name: 'Lucrări cu puncte de verificat' })).toBeInTheDocument();
    expect(papers.map((paper) => paper.textContent)).toEqual([
      'Pop Ionnota 8,751 punct de verificatDecide',
      'Marin Dannota 6,53 puncte de verificatDecide',
    ]);
    expect(within(papers[1]!).getByText('3 puncte de verificat')).toHaveClass('tag', 'tag-wait');
    expect(within(panel).getByRole('link', { name: 'Decide: Marin Dan' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/7');
    // The table of every paper follows.
```

Replace it with:

```tsx
    const panel = await screen.findByRole('region', { name: 'Verificare' });
    expect(within(panel).getByRole('link', { name: 'Începe verificarea' })).toHaveAttribute('href', '/teste/6E2-26T1/verificare');
    expect(within(panel).getByRole('link', { name: 'Începe verificarea' })).toHaveClass('button');
    const points = within(within(panel).getByRole('list', { name: 'Puncte de verificat' })).getAllByRole('listitem');
    expect(points.map((point) => point.textContent)).toEqual([
      'Pop Ion · Subiectul I, 3)Cifra se citește greu.propus 0,5p din 2pDecide',
      'Marin Dan · Paginile necititeRobotul nu a putut citi: Pagina 2.Decide',
      'Marin Dan · Subiectul II, 1)Răspunsul e tăiat.propus 3p din 5pDecide',
    ]);
    expect(within(points[2]!).getByText('propus 3p din 5p')).toHaveClass('tag', 'tag-wait');
    expect(within(panel).getByRole('link', { name: 'Decide: Pop Ion, Subiectul I, 3)' })).toHaveAttribute(
      'href',
      '/teste/6E2-26T1/verificare?lucrare=5&punct=31',
    );
    expect(within(panel).getByRole('link', { name: 'Decide: Marin Dan, Paginile necitite' })).toHaveAttribute(
      'href',
      '/teste/6E2-26T1/verificare?lucrare=7&punct=pagini',
    );
    // The table of every paper follows.
```

- [ ] **Step 5: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx

  it('says when every point is checked', async () => {
    renderAdmin(
```

Replace it with:

```tsx

  it('says when every point is checked, and still opens the papers in the review', async () => {
    renderAdmin(
```

- [ ] **Step 6: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    );
    expect(await screen.findByText('Toate punctele sunt verificate.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Începe verificarea' })).not.toBeInTheDocument();
```

Replace it with:

```tsx
    );
    expect(await screen.findByText(/^Toate punctele sunt verificate\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vezi lucrările' })).toHaveAttribute('href', '/teste/6E2-26T1/verificare');
    expect(screen.queryByRole('link', { name: 'Începe verificarea' })).not.toBeInTheDocument();
```

- [ ] **Step 7: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByText('Punctele nesigure apar după ce se corectează lucrările.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Lucrări cu puncte de verificat' })).not.toBeInTheDocument();
    expect(screen.queryByText('Toate punctele sunt verificate.')).not.toBeInTheDocument();
```

Replace it with:

```tsx
    expect(await screen.findByText('Punctele nesigure apar după ce se corectează lucrările.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Puncte de verificat' })).not.toBeInTheDocument();
    expect(screen.queryByText('Toate punctele sunt verificate.')).not.toBeInTheDocument();
```

- [ ] **Step 8: Edit `src/admin/pages/TestsPage.test.tsx`**

Find this block:

```tsx
    expect(first).toHaveClass('button');
    expect(first).toHaveAttribute('href', '/teste/6E2-26T1');
    expect(within(list).getByRole('link', { name: 'Deschide: Logaritmi, Clasa 6E2' })).toHaveClass('button-quiet');
```

Replace it with:

```tsx
    expect(first).toHaveClass('button');
    expect(first).toHaveAttribute('href', '/teste/6E2-26T1/verificare');
    expect(within(list).getByRole('link', { name: 'Deschide: Logaritmi, Clasa 6E2' })).toHaveClass('button-quiet');
```

- [ ] **Step 9: Edit `src/admin/pages/TestsPage.test.tsx`**

Find this block:

```tsx
    expect(check).toHaveClass('button');
    expect(check).toHaveAttribute('href', '/teste/6E2-26T1');
    expect(screen.getByRole('link', { name: 'Pornește corectarea: Mulțimi, Clasa 6E2' })).toHaveClass('button-quiet');
```

Replace it with:

```tsx
    expect(check).toHaveClass('button');
    expect(check).toHaveAttribute('href', '/teste/6E2-26T1/verificare');
    expect(screen.getByRole('link', { name: 'Pornește corectarea: Mulțimi, Clasa 6E2' })).toHaveClass('button-quiet');
```

- [ ] **Step 10: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
    expect(within(panel).getByText('Celălalt test în lucru nu are nevoie de tine acum.')).toBeInTheDocument();
    const start = within(cards[1]!).getByRole('link', { name: 'Începe: Ecuații, 6E2' });
    expect(start).toHaveAttribute('href', '/teste/6E2-26T2');
    await userEvent.click(start);
    await expectLocation('/teste/6E2-26T2');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
```

Replace it with:

```tsx
    expect(within(panel).getByText('Celălalt test în lucru nu are nevoie de tine acum.')).toBeInTheDocument();
    expect(within(cards[0]!).getByRole('link')).toHaveAttribute('href', expect.not.stringContaining('verificare'));
    const start = within(cards[1]!).getByRole('link', { name: 'Începe: Ecuații, 6E2' });
    expect(start).toHaveAttribute('href', '/teste/6E2-26T2/verificare');
    await userEvent.click(start);
    await expectLocation('/teste/6E2-26T2/verificare');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
```

- [ ] **Step 11: Edit `src/admin/shell/todo.test.ts`**

Find this block:

```ts
import { fakeTest } from '../../test/fakeApi.ts';
import { inWork, todoList, todoOf } from './todo.ts';

```

Replace it with:

```ts
import { fakeTest } from '../../test/fakeApi.ts';
import { inWork, todoList, todoOf, todoPath } from './todo.ts';

```

- [ ] **Step 12: Edit `src/admin/shell/todo.test.ts`**

Find this block:

```ts

  it('asks to publish checked results that are not published', () => {
```

Replace it with:

```ts

  it('opens the review for the points to check, and the test page for the rest', () => {
    expect(todoPath(todoOf(summary({ ...graded, flagCount: 3 }))!)).toBe('/teste/6E2-26T1/verificare');
    expect(todoPath(todoOf(summary({ ...graded }))!)).toBe('/teste/6E2-26T1');
    expect(todoPath(todoOf(summary({ status: 'draft', barem: generated }))!)).toBe('/teste/6E2-26T1');
  });

  it('asks to publish checked results that are not published', () => {
```

- [ ] **Step 13: Edit `src/admin/testsPage/nextStep.test.ts`**

Find this block:

```ts
const page = (label: string): NextStep => ({ kind: 'link', label, to: '/teste/6E2-26T1' });

```

Replace it with:

```ts
const page = (label: string): NextStep => ({ kind: 'link', label, to: '/teste/6E2-26T1' });
const review = (label: string): NextStep => ({ kind: 'link', label, to: '/teste/6E2-26T1/verificare' });

```

- [ ] **Step 14: Edit `src/admin/testsPage/nextStep.test.ts`**

Find this block:

```ts
  ['waits while the papers are graded', fakeSummary({ status: 'evaluating', ...started, submittedCount: 22, gradedCount: 15 }), null],
  ['checks the points that wait', fakeSummary({ status: 'done', ...graded, flagCount: 3 }), page('Verifică 3 puncte')],
  ['checks one point', fakeSummary({ status: 'evaluating', ...graded, flagCount: 1 }), page('Verifică 1 punct')],
  ['publishes the results on the row', fakeSummary({ status: 'done', ...graded }), { kind: 'publish', label: 'Publică rezultatele' }],
```

Replace it with:

```ts
  ['waits while the papers are graded', fakeSummary({ status: 'evaluating', ...started, submittedCount: 22, gradedCount: 15 }), null],
  ['checks the points that wait in the review', fakeSummary({ status: 'done', ...graded, flagCount: 3 }), review('Verifică 3 puncte')],
  ['checks one point', fakeSummary({ status: 'evaluating', ...graded, flagCount: 1 }), review('Verifică 1 punct')],
  ['publishes the results on the row', fakeSummary({ status: 'done', ...graded }), { kind: 'publish', label: 'Publică rezultatele' }],
```

- [ ] **Step 15: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/TestPage.test.tsx src/admin/pages/TestsPage.test.tsx src/admin/Layout.test.tsx src/admin/shell/todo.test.ts src/admin/testsPage/nextStep.test.ts`
Expected: FAIL. `Test Files  5 failed (5)`, `Tests  8 failed | 189 passed (197)`: the buttons still open the test page or the paper's page (`expect(element).toHaveAttribute("href", "/teste/6E2-26T1/verificare")` in "lists each point with its reason, each opening the review at it, and starts with the first", "opens the list of what waits in place, for every class, the first button filled" and "gives each test one next step, the first thing in "De făcut" filled"; `"/teste/6E2-26T2/verificare"` in "lists the three things in its panel, each with a button to its test"), the panel has no "Vezi lucrările" (`Unable to find an accessible element with the role "link" and name "Vezi lucrările"`), `todoPath` does not exist yet (`TypeError: todoPath is not a function`), and `nextStep` gives the old address ("checks the points that wait in the review", "checks one point": `AssertionError: expected { kind: 'link', …(2) } to deeply equal { kind: 'link', …(2) }`).

- [ ] **Step 16: Replace `src/admin/testPage/ReviewList.tsx`**

```tsx
import { useId } from 'react';
import { Link } from 'react-router';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { pageLabel } from '../../ui/format.ts';
import { MathText } from '../../ui/MathText.tsx';
import { pointKey, pointQueue, pointsText, reviewPath } from '../reviewPage/points.ts';

// The points to check, in the panel Verificare (redesign spec §6): a row per
// point with its reason, each opening the review (§7) at that point.
export function ReviewList({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }) {
  const id = useId();
  const queue = pointQueue(uploads);
  if (queue.length === 0) {
    return (
      <p>
        Toate punctele sunt verificate. <Link to={reviewPath(test.code)}>Vezi lucrările</Link>
      </p>
    );
  }
  return (
    <>
      <p>
        <Link className="button" to={reviewPath(test.code)}>
          Începe verificarea
        </Link>
      </p>
      <h3 id={id}>Puncte de verificat</h3>
      <ul className="review-list" aria-labelledby={id}>
        {queue.map(({ submissionId, studentName, point }) => {
          const key = pointKey(point);
          const what = point.kind === 'pages' ? 'Paginile necitite' : point.label;
          return (
            <li key={`${submissionId}:${key}`}>
              <span className="review-name">
                {studentName} · {what}
                <span className="review-list-reason">
                  {point.kind === 'pages' ? `Robotul nu a putut citi: ${point.pages.map(pageLabel).join(', ')}.` : <MathText text={point.reason} />}
                </span>
              </span>
              {point.kind === 'item' && (
                <span className="tag tag-wait">
                  propus {pointsText(point.points)} din {pointsText(point.maxPoints)}
                </span>
              )}
              <Link className="button-quiet button-small" to={reviewPath(test.code, { submissionId, key })} aria-label={`Decide: ${studentName}, ${what}`}>
                Decide
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
```

- [ ] **Step 17: Edit `src/admin/shell/todo.ts`**

Find this block:

```ts
import { countLabel } from '../../ui/format.ts';

```

Replace it with:

```ts
import { countLabel } from '../../ui/format.ts';
import { reviewPath } from '../reviewPage/points.ts';

```

- [ ] **Step 18: Edit `src/admin/shell/todo.ts`**

Find this block:

```ts
  short: string;
}
```

Replace it with:

```ts
  short: string;
}

// Where the button of a thing to do goes: the review for the points to check
// (redesign spec §7), the test page for the rest.
export function todoPath(item: TodoItem): string {
  return item.stage === 'Verificare' ? reviewPath(item.code) : `/teste/${item.code}`;
}
```

- [ ] **Step 19: Edit `src/admin/shell/TodoPanel.tsx`**

Find this block:

```tsx
import { Panel } from './Panel.tsx';
import type { TodoItem } from './todo.ts';

```

Replace it with:

```tsx
import { Panel } from './Panel.tsx';
import { todoPath, type TodoItem } from './todo.ts';

```

- [ ] **Step 20: Edit `src/admin/shell/TodoPanel.tsx`**

Find this block:

```tsx
                className={index === 0 ? 'button button-small' : 'button-quiet button-small'}
                to={`/teste/${item.code}`}
                aria-label={`${item.action}: ${item.testTitle}, ${item.className}`}
```

Replace it with:

```tsx
                className={index === 0 ? 'button button-small' : 'button-quiet button-small'}
                to={todoPath(item)}
                aria-label={`${item.action}: ${item.testTitle}, ${item.className}`}
```

- [ ] **Step 21: Edit `src/admin/testsPage/TodoRows.tsx`**

Find this block:

```tsx
import { displayClassName } from '../../../shared/classes.ts';
import type { TodoItem } from '../shell/todo.ts';

```

Replace it with:

```tsx
import { displayClassName } from '../../../shared/classes.ts';
import { todoPath, type TodoItem } from '../shell/todo.ts';

```

- [ ] **Step 22: Edit `src/admin/testsPage/TodoRows.tsx`**

Find this block:

```tsx
                className={index === 0 ? 'button button-small' : 'button-quiet button-small'}
                to={`/teste/${item.code}`}
                aria-label={`${item.action}: ${where}`}
```

Replace it with:

```tsx
                className={index === 0 ? 'button button-small' : 'button-quiet button-small'}
                to={todoPath(item)}
                aria-label={`${item.action}: ${where}`}
```

- [ ] **Step 23: Edit `src/admin/testsPage/nextStep.ts`**

Find this block:

```ts
import { countLabel } from '../../ui/format.ts';
import { stageHash, type Stage } from '../stages.ts';
```

Replace it with:

```ts
import { countLabel } from '../../ui/format.ts';
import { reviewPath } from '../reviewPage/points.ts';
import { stageHash, type Stage } from '../stages.ts';
```

- [ ] **Step 24: Edit `src/admin/testsPage/nextStep.ts`**

Find this block:

```ts
// The one thing to do next on a row of the Teste page (redesign spec §5): a
// link, or the button that publishes the results on the row. Null: nothing
// to do now. The grading of an open test starts in the panel Corectare of the
```

Replace it with:

```ts
// The one thing to do next on a row of the Teste page (redesign spec §5): a
// link (to the review for the points to check), or the button that publishes
// the results on the row. Null: nothing
// to do now. The grading of an open test starts in the panel Corectare of the
```

- [ ] **Step 25: Edit `src/admin/testsPage/nextStep.ts`**

Find this block:

```ts
    case 'Verificare':
      return link(`Verifică ${countLabel(test.flagCount, 'punct', 'puncte')}`);
    case 'Rezultate':
```

Replace it with:

```ts
    case 'Verificare':
      return link(`Verifică ${countLabel(test.flagCount, 'punct', 'puncte')}`, reviewPath(test.code));
    case 'Rezultate':
```

- [ ] **Step 26: Edit `src/ui/brand.css`**

Find this block:

```css
  min-width: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.test-sheet {
```

Replace it with:

```css
  min-width: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.review-list-reason {
  display: block;
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 400;
}

.test-sheet {
```

- [ ] **Step 27: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  118 passed | 1 skipped (119)`, `Tests  1865 passed | 3 skipped (1868)`.

- [ ] **Step 28: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 29: Commit**

```bash
git add src/admin/testPage/ReviewList.tsx src/admin/shell/todo.ts src/admin/shell/TodoPanel.tsx src/admin/testsPage/TodoRows.tsx src/admin/testsPage/nextStep.ts src/ui/brand.css src/admin/pages/TestPage.test.tsx src/admin/pages/TestsPage.test.tsx src/admin/Layout.test.tsx src/admin/shell/todo.test.ts src/admin/testsPage/nextStep.test.ts
git commit -m "Open the review from the panel Verificare, the Teste page and De făcut"
```

### Task 5: The notes for the next sessions

`src/AGENTS.md` describes the review; `server/AGENTS.md` names the points of the uploads list.

**Files:**
- Modify: `src/AGENTS.md`, `server/AGENTS.md`

- [ ] **Step 1: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the files, the students' link while the test is a draft or open, rename, archive, delete), the papers to check in Verificare (`ReviewList.tsx`), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table, "Recorectează tot"). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `classPage/GradesTable.tsx` is the class page's grade table (students by tests, newest test on the left; it hides archived tests unless asked, and keeps a column for draft and open tests). `pages/ClassStudentsPage.tsx` is "Elevii clasei" (add, rename, "A plecat", "Șterge"). `pages/StudentPage.tsx` is a student's history. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `pages/LoginPage.tsx` is the login and sign-up form: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. `pages/AccountPage.tsx` is Contul meu (password, "Ieși din cont"). `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). A demo account sees, at the top of every page, how many papers it may still have graded. `pages/ReportPage.tsx` and `reportPage/` are the class report (`shared/stats.ts` makes its numbers). `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`)); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (the account menu, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. `todo.ts` decides "De făcut" from the tests list: exactly the three cases of spec §5. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme and the account move under ☰ (CSS and `PhoneMenu.tsx`).
- `pages/TestsPage.tsx` is the start page, the Teste page of the redesign (spec §5): the greeting and today's date in Romania's time (`testsPage/greeting.ts`), "N lucruri te așteaptă ˅", which opens the list of what waits in place (`testsPage/TodoRows.tsx`: "De făcut" of every class of the year, as the bar counts it, whatever chip is chosen), the class chips and the box "Arată și testele arhivate", and the groups "În lucru" and "Terminate" (`testsPage/TestGroup.tsx`; `inWork()` in `shell/todo.ts` is the rule of the panel "Clasele tale" too). A row shows the test, the stage bar and the current stage, the papers, and one next step (`testsPage/nextStep.ts`): a link to the test, or the button that publishes the results on the row; "Oprește accesul" stays on a row whose results are open. Below 768px each row is a block.
- `stages.ts`: the six stages of a test (Pregătire, Tipărire, În clasă, Corectare, Verificare, Rezultate), each done, waiting on the teacher, in progress or later, and the current one, from the tests list (`TestSummary.prepared`, `barem`, the counts and `averageGrade`). A stage waits on the teacher (orange) exactly when `todoOf()` has the test, at that stage. The test page uses it too: it opens on the current stage (from data read for this visit, not data cached from an earlier one), and `stageHash()` and `stageFromHash()` give each stage's panel its address (`#pregatire` … `#rezultate`). After the first load only the teacher changes the panel: a refresh or a button that moves the test to another stage keeps it. The Teste page's "Pornește corectarea" opens `#corectare`.
```

Replace it with:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the files, the students' link while the test is a draft or open, rename, archive, delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table, "Recorectează tot"). `pages/ReviewPage.tsx` and `reviewPage/` are the review of the points to check (redesign spec §7, `/teste/:code/verificare`): the papers and their points (`ReviewQueue.tsx`), one page of the paper at a time (`ReviewPhoto.tsx`; no marks on the photo, because the robot does not say where an answer is), and the decision (`ReviewDecision.tsx`: "Accept", the stepper and "Salvează", "Am verificat paginile", the paper's exercises). `points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first), steps between them, and writes the address (`?lucrare=&punct=`, replaced, never a new step in the history). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point; a refused one reads the paper and the test again. The keys A, J, K and 1–9 act only while the focus is on the page and not in a field, and never with Ctrl, Alt or Meta. `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `classPage/GradesTable.tsx` is the class page's grade table (students by tests, newest test on the left; it hides archived tests unless asked, and keeps a column for draft and open tests). `pages/ClassStudentsPage.tsx` is "Elevii clasei" (add, rename, "A plecat", "Șterge"). `pages/StudentPage.tsx` is a student's history. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `pages/LoginPage.tsx` is the login and sign-up form: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. `pages/AccountPage.tsx` is Contul meu (password, "Ieși din cont"). `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). A demo account sees, at the top of every page, how many papers it may still have graded. `pages/ReportPage.tsx` and `reportPage/` are the class report (`shared/stats.ts` makes its numbers). `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`)); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (the account menu, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. `todo.ts` decides "De făcut" from the tests list: exactly the three cases of spec §5; `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme and the account move under ☰ (CSS and `PhoneMenu.tsx`).
- `pages/TestsPage.tsx` is the start page, the Teste page of the redesign (spec §5): the greeting and today's date in Romania's time (`testsPage/greeting.ts`), "N lucruri te așteaptă ˅", which opens the list of what waits in place (`testsPage/TodoRows.tsx`: "De făcut" of every class of the year, as the bar counts it, whatever chip is chosen), the class chips and the box "Arată și testele arhivate", and the groups "În lucru" and "Terminate" (`testsPage/TestGroup.tsx`; `inWork()` in `shell/todo.ts` is the rule of the panel "Clasele tale" too). A row shows the test, the stage bar and the current stage, the papers, and one next step (`testsPage/nextStep.ts`): a link to the test (to the review for "Verifică 3 puncte"), or the button that publishes the results on the row; "Oprește accesul" stays on a row whose results are open. Below 768px each row is a block.
- `stages.ts`: the six stages of a test (Pregătire, Tipărire, În clasă, Corectare, Verificare, Rezultate), each done, waiting on the teacher, in progress or later, and the current one, from the tests list (`TestSummary.prepared`, `barem`, the counts and `averageGrade`). A stage waits on the teacher (orange) exactly when `todoOf()` has the test, at that stage. The test page uses it too: it opens on the current stage (from data read for this visit, not data cached from an earlier one), and `stageHash()` and `stageFromHash()` give each stage's panel its address (`#pregatire` … `#rezultate`). After the first load only the teacher changes the panel: a refresh or a button that moves the test to another stage keeps it. The Teste page's "Pornește corectarea" opens `#corectare`.
```

- [ ] **Step 2: Edit `src/AGENTS.md`**

Find this block:

```markdown
- Page tests that check a navigation use `expectLocation()`: it waits, because the navigation follows the API answer. `LocationProbe` shows the path, the search and the hash.
- The test page draws only the panel of the chosen stage. Its page tests open a stage by its address (`/teste/6E2-26T1#corectare`) or by its link in the list of stages (`openStage()` in `TestPage.test.tsx`). Without an address the page opens on the current stage of `stagesOf()`: fake data with no test file opens on Pregătire, an open test with its files on În clasă, a done test with points to check on Verificare, a done test with none on Rezultate (which has the links table, not the papers table: a test of the papers table opens `#corectare`). Fișa testului is a region beside every panel: its students' link, its "Copiază linkul" and its buttons are found from any stage.
```

Replace it with:

```markdown
- Page tests that check a navigation use `expectLocation()`: it waits, because the navigation follows the API answer. `LocationProbe` shows the path, the search and the hash.
- The review draws its right pane anew while another paper loads: after a move to another paper, its tests find the pane again through `screen`, not through an element found before the move. `reviewPointsOf()` in `test/fakeApi.ts` makes an upload row's `reviewPoints` from a fake evaluation, and the fake API keeps them in step after every correction.
- The test page draws only the panel of the chosen stage. Its page tests open a stage by its address (`/teste/6E2-26T1#corectare`) or by its link in the list of stages (`openStage()` in `TestPage.test.tsx`). Without an address the page opens on the current stage of `stagesOf()`: fake data with no test file opens on Pregătire, an open test with its files on În clasă, a done test with points to check on Verificare, a done test with none on Rezultate (which has the links table, not the papers table: a test of the papers table opens `#corectare`). Fișa testului is a region beside every panel: its students' link, its "Copiază linkul" and its buttons are found from any stage.
```

- [ ] **Step 3: Edit `server/AGENTS.md`**

Find this block:

```markdown
- `routes/`: HTTP. `admin.ts` and its parts, `upload.ts` for students, `runner.ts` for the robot.
- `db/`: D1 queries. `lifecycle.ts` starts, schedules, promotes, and ends evaluations, and regrades; `links.ts` holds the student writes; `runner.ts` holds the robot's queries; `evaluations.ts` reads graded results and holds the teacher's corrections (`flagCountSql` counts the items to check the same way everywhere).
- `auth/`: the teacher login (`teacherAuth.ts`: the session cookie of `session.ts`, the development login, `adminOnly`), and `robotAuth.ts` for the robot key. `routes/auth.ts` is `/api/auth` (sign-up, the email confirmation, login, logout: no login needed, same-origin writes). `routes/accounts.ts` holds the teacher's own password and the administrators' accounts list. `db/accounts.ts` holds their queries; `passwords.ts` the password hashes; `email.ts` the emails (Brevo).
```

Replace it with:

```markdown
- `routes/`: HTTP. `admin.ts` and its parts, `upload.ts` for students, `runner.ts` for the robot.
- `db/`: D1 queries. `lifecycle.ts` starts, schedules, promotes, and ends evaluations, and regrades; `links.ts` holds the student writes; `runner.ts` holds the robot's queries; `evaluations.ts` reads graded results and holds the teacher's corrections (`flagCountSql` counts the items to check the same way everywhere; `listUploads` in `tests.ts` lists them per paper as `reviewPoints` by the same rule, in the same batch as the uploads).
- `auth/`: the teacher login (`teacherAuth.ts`: the session cookie of `session.ts`, the development login, `adminOnly`), and `robotAuth.ts` for the robot key. `routes/auth.ts` is `/api/auth` (sign-up, the email confirmation, login, logout: no login needed, same-origin writes). `routes/accounts.ts` holds the teacher's own password and the administrators' accounts list. `db/accounts.ts` holds their queries; `passwords.ts` the password hashes; `email.ts` the emails (Brevo).
```

- [ ] **Step 4: Commit**

```bash
git add src/AGENTS.md server/AGENTS.md
git commit -m "Describe the review in the notes"
```

### Task 6: Look at it, then the pull request (main session)

Not a subagent task. Nothing here changes code unless a check fails; a fix found here is prototyped, tested and committed like the tasks above, and named to the user.

- [ ] **Step 1: Check the exactness of the branch**

Run: `git diff --stat refs/proto10/v5 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

- [ ] **Step 2: Run the whole suite three times, and once in UTC**

Run `npm test` three times, then once with `TZ=UTC` (Git Bash: `TZ=UTC npm test`).
Expected: PASS every time. `Test Files  118 passed | 1 skipped (119)`, `Tests  1865 passed | 3 skipped (1868)`.

- [ ] **Step 3: Build and start the production build with sample papers**

Check port 8788 first (`netstat -ano | findstr :8788`; end a leftover `workerd.exe` as `AGENTS.md` says). Then `npm run db:local`, and once the Phase 6 sample (git-ignored, on this PC): `npx wrangler d1 execute quickeval --local --file .superpowers/tools/phase6/sample10/sample10.sql` (SQLite reads `||` and `->>` at the same level, so the SQL puts brackets around a `->>`) (class `11R`, test `11R-26T1`, six students who carry one made-up creation time, so the students of the older samples with the same names stay apart: Ioana Marin with three photos and one exercise to check; Vlad Dumitru with a photo, a PDF page the robot could not read and two exercises to check; Ana Pop and Bogdan Ilie with nothing to check, Bogdan with no files; Carla Dinu not graded; Dan Marin sent nothing), and its pages: for each file `f` of `.superpowers/tools/phase6/sample10/` named in the SQL, `npx wrangler r2 object put quickeval-files/sample10/<f> --local --file .superpowers/tools/phase6/sample10/<f>` (`carla-1.png` is a copy of `ana-1.png`). Then the Claude Code preview server `preview` (`npm run preview`, http://127.0.0.1:8788).
Expected: `Ready on http://127.0.0.1:8788`.

- [ ] **Step 4: Look at the review at 1440px, 1024px and 390px, light and dark**

Open `/admin/teste/11R-26T1#verificare`: each point with its reason; "Începe verificarea". Open the review: accept a point with "Accept" and with A; save another value with the stepper and check the line "nota devine"; J, K, 1–3; "Am verificat paginile" on Vlad's PDF page; a paper of "Celelalte lucrări"; Bogdan's paper (no files); the last point ("Toate punctele sunt verificate.", "Mergi la Rezultate"). From the Teste page, "Verifică N puncte" and the card in "De făcut" open the review. Measure in the browser `document.documentElement.scrollWidth <= innerWidth` on each width.
Expected: the look of round 5 (Z3.1), page "Verificare", without the marks on the photo; no sideways scroll; one column on the phone, the page first.

- [ ] **Step 5: Run the smoke test**

Run: `npm run smoke` (second terminal, while the preview runs).
Expected: every check passes.

- [ ] **Step 6: Commit the plan**

```bash
git add docs/superpowers/plans/2026-11-06-mqgrader-phase-6-review.md
git commit -m "Add the Phase 6 plan"
```

- [ ] **Step 7: Ask the user, then push and open the pull request**

Ask the user before pushing. On a yes: `git push -u origin feature/mqgrader-review`, then a ready pull request into `main` that lists what changed, the rulings above, and what was checked.

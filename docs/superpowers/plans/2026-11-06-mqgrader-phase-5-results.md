# MQGrader Phase 5: Rezultate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 6 must run in the main session, not in a subagent:** it looks at the app in a browser, and every outward step (push, pull request) needs the user's explicit yes.

**Goal:** The panel Rezultate of the test page becomes the Rezultate of the redesign: one line on what the link shows, "Publică toate rezultatele" (or "Oprește accesul la rezultate"), the table "Linkurile elevilor" (a row per student: the points, the grade, "Copiază linkul", and the state with "Publică" or "Oprește publicarea"), and "Pentru tine" (the class report and the CSV for the catalog). The result link and the publish button leave the papers table of the other panels.

**Architecture:** One small API change: each row of the uploads list (`UploadRow`) gets the points of its graded result and their maximum (`total`, `maxTotal`), read in the same query (`listUploads` in `server/db/tests.ts`). The panel (`ResultsPanel` in `src/admin/testPage/StagePanel.tsx`) draws three parts: `ResultsAccess.tsx` (publish or stop for all), `ResultLinksTable.tsx` (the links table, with `CopyResultLink`) and `ResultFiles.tsx` ("Pentru tine"; the CSV is `classCsv` of the class report, read when the button is pressed). The student's PDF stays on the paper's page. No migration.

**Tech Stack:** Node 24, TypeScript, React 19, TanStack Query, React Router, Hono on Cloudflare Pages with D1, Vitest 5, Testing Library. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md` (§1 decisions 24-26, §6 the panel Rezultate, §8 Rezultate, §13 phase 5). Task 1 writes the decisions of 2026-11-05 into it. Root `AGENTS.md`, `src/AGENTS.md` and `server/AGENTS.md` hold the project rules. The approved prototype: round 5 (Z3.1) https://claude.ai/artifact/JfoJqXjZVryZCHebhG8QHw, page "Test · Rezultate".

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- Every teacher query is scoped by the teacher's id; this plan adds no query, only two columns to `listUploads`.
- The student's PDF is made only from `studentPdfInput()`, on the paper's page; this plan makes no PDF. The CSV goes through `classCsv()` (`shared/csv.ts`), which guards every text cell against formulas.
- Flat colours only: no gradient anywhere in `brand.css`; a shadow only on what floats. Orange only for what waits on the teacher. One filled button for the main action of a panel ("Publică toate rezultatele").
- No page tells students that AI grades their work; this plan changes no student page.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A` (the checkout holds local files that must not be committed: a `.gitignore` line, `.claude/launch.json` entries).
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root `D:\Projects\QuickEval`, on the branch `feature/mqgrader-results`. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy, on `main` too (while this plan was measured, 1 to 6 of them timed out in most full runs). If only tests of those three files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts runner/api.test.ts` alone: `Test Files  3 passed (3)`, `Tests  96 passed (96)`. Then the full run counts as passed when its failed and passed tests add up to the expected passed number (for example `Tests  2 failed | 1835 passed | 3 skipped (1840)` for 1837); say so in the task report.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; overwrite all of it with exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/proto9/r1` … `refs/proto9/r5`, one per task, on `refs/proto9/rbase` (the same files as `main` at `cf5323c`). After Task N, `git diff --stat refs/proto9/rN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`). Four tests run the real pandoc (`runner/baremDocx.test.ts`, `runner/baremTask.test.ts`, `runner/workdir.test.ts`): without pandoc they skip too, so every total shows 4 fewer passed and 4 more skipped.

## Rulings made while planning

Decided with the user on 2026-11-05 or while building the prototype; Task 1 writes them into the spec.

1. The student's PDF stays on the paper's page, one student at a time: the teacher gives it to a student who has no link (the user). "Pentru tine" has no download of every student's PDF; it says where the PDF is, and each name in the links table opens the paper's page.
2. "CSV pentru catalog" is the CSV of the class report page (`classCsv`: each exercise, the total, the grade, the notes), not a file with the name and the grade only (the user). It is made from the report read when the button is pressed, with the report page's file name (`<code>-raport.csv`).
3. While every result is published, one result cannot be stopped alone (the user): the rows show "Publicat" without a button, and "Oprește accesul la rezultate" closes every link, also the ones published alone (the API already does that). No server change.
4. "Punctaj" shows the total and its maximum as the class report does ("72 / 100"; `total` includes the office points). `UploadRow` gets `total` and `maxTotal` from the same `listUploads` query (null while not graded).
5. Every student of the class is a row, and a student who left after starting a paper (as in the papers table), sorted by name: no "Arată toți elevii". A student without a sent paper (no upload, or one still on the phone) has no link: "Nu a trimis lucrarea." and an empty state. A sent paper not graded yet (sent, in grading, failed) has its link, "Nepublicat" without a button, and "—" for the points and the grade.
6. "Copiază linkul" copies at once. A paper sent before links were made with the upload has no token: its button is "Fă linkul", which asks the API for the link; the copy is then a second tap, because a browser may refuse a copy that comes after waiting for an answer. When the browser refuses, the link shows in a read-only field, to copy by hand.
7. The panel does not repeat the stage head's sentence ("Fiecare elev primește un link cu rezultatul lui. …", the landing page's words): its first line says what the link shows.
8. Before publishing, while points wait in Verificare: "Mai ai N puncte de verificat. Dacă publici acum, elevii văd punctajul de acum." The button stays: the teacher decides.
9. Only a graded paper has "Publică" on its row (the user): before, every sent paper had it, also a failed one, under the line "Rezultatele se publică după corectare.". A paper already published keeps "Oprește publicarea", also while it is graded again.
10. The result link and the publish button leave the papers table (În clasă, Corectare, Verificare): they are only in Rezultate. The paper's page keeps its own result link (with "Deschide" and WhatsApp). The papers table keeps the tag "Publicat".
11. The links table reuses the papers table's look (`table.uploads` in `.table-wrap.uploads-wrap`): one card per student on a phone. "Publicat" is the green tag (`.tag-ok`), "Nepublicat" plain muted text. Found in the browser check: the cards of the papers table, with a caption over each cell, were about 300 px high each (a class of 28 is over 8000 px), so a card of this table puts "Punctaj" and "Nota" side by side and gives the link and the state no caption (their buttons say what they are): about 200 px. The tag "Publicat" starts its cell without the gap a tag after a name has.
12. "Pentru tine" reuses the file rows of Pregătire (`.file-list`): "Raportul clasei" with "Media testului 8,5 · rezultatele pe exerciții · analiza clasei" and "Deschide raportul"; "CSV pentru catalog" with "Fiecare elev cu punctele pe exerciții, totalul și nota." and "Descarcă CSV". Before the first graded paper: "Raportul clasei și CSV-ul apar după prima corectare."

## Review Focus

1. While every result is published, no row offers "Publică" or "Oprește publicarea", and stopping for all makes each row "Nepublicat" with "Publică" again (test in Task 3: "publishes every result, and stops every link again").
2. A paper with no token yet: "Fă linkul" asks the API for the upload the row shows, then "Copiază linkul" copies the new link (test in Task 3: "makes the link of an older paper first, then copies it").
3. A browser that refuses the copy (Safari without a fresh tap, a page not in focus) still gives the teacher the link (test in Task 3: "shows the link in a field when the browser refuses to copy it").
4. The CSV is the report's file, byte for byte with its BOM, and a failed read of the report says why instead of saving nothing in silence (tests in Task 3: "downloads the CSV of the class report", "says why the CSV could not be made").
5. A done test with no points to check opens on Rezultate, so a page test that looks for the papers table opens `#corectare` (Task 3 changes "shows the model and effort of each grading after Nota when the setting is on"); the links table and the papers table never show on one panel.

---

### Before Task 1: The branch

- [ ] **Step 1: Start the branch from `main`**

No other Claude Code session may work in this checkout meanwhile (in the desktop app: `list_sessions {"linked": true}` shows none running). Then:

```bash
git fetch origin
git switch -c feature/mqgrader-results origin/main
```

Expected: `Switched to a new branch 'feature/mqgrader-results'`; `git log --oneline -1` shows `cf5323c` (or a later `main`: then the exactness checks below compare only the files this plan changes). The untracked plan file and the local changes of `.claude/launch.json` and `.gitignore` come along; they are never committed (the plan is committed in Task 6).

### Task 1: The decisions of 2026-11-05 in the spec

The redesign spec gets the three answers of the user and says exactly what the panel Rezultate shows.

**Files:**
- Modify: `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`

**Interfaces:**
- Produces: the spec text the later tasks build (§8).

- [ ] **Step 1: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown

Date: 2026-11-04. Status: agreed with the user after six rounds of prototypes. Phases 1 to 3 (landing page and light theme, look and shell, Teste page) are live; Phase 4 (test page) is being built; the other phases are not.

```

Replace it with:

```markdown

Date: 2026-11-04. Status: agreed with the user after six rounds of prototypes. Phases 1 to 4 (landing page and light theme, look and shell, Teste page, test page) are live; Phase 5 (Rezultate) is being built; the other phases are not.

```

- [ ] **Step 2: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
23. The students' link and its QR code are always in "Fișa testului": the button "Arată linkurile" goes (Phase 4).

```

Replace it with:

```markdown
23. The students' link and its QR code are always in "Fișa testului": the button "Arată linkurile" goes (Phase 4).
24. The student's PDF stays on the paper's page, one student at a time: the teacher gives it to a student who has no link. Rezultate has no download of every student's PDF (Phase 5).
25. "CSV pentru catalog" in Rezultate is the CSV of the class report: each exercise, the total, the grade and the notes (Phase 5).
26. "Publică toate rezultatele" opens the link of every student, and "Oprește accesul la rezultate" closes every link, also the ones published alone. While all are published, one result cannot be stopped alone (Phase 5).

```

- [ ] **Step 3: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
  - Verificare: "Lucrări cu puncte de verificat", a row per paper with points to check (the student, the grade, "2 puncte de verificat", and "Decide", which opens the paper's page), and "Începe verificarea", which opens the first of them. "Toate punctele sunt verificate." when graded papers have none; one line before any paper is graded. Then the papers table. The list of each point with its reason comes with the review (§7, Phase 6): the API gives only a count per paper.
  - Rezultate: the controls of today: "Publică rezultatele" or "Oprește accesul la rezultate", "Raportul clasei" once a paper is graded, and the papers table, where a result is published alone and has its link. §8 (Phase 5) replaces it.
  - Every stage can be opened at any time. A panel whose stage has not come yet says so in one line, and still shows what can be read or changed.
```

Replace it with:

```markdown
  - Verificare: "Lucrări cu puncte de verificat", a row per paper with points to check (the student, the grade, "2 puncte de verificat", and "Decide", which opens the paper's page), and "Începe verificarea", which opens the first of them. "Toate punctele sunt verificate." when graded papers have none; one line before any paper is graded. Then the papers table. The list of each point with its reason comes with the review (§7, Phase 6): the API gives only a count per paper.
  - Rezultate: the students' result links and "Pentru tine" (§8, Phase 5). The papers table of the other panels has no result link and no publish button: they are in Rezultate.
  - Every stage can be opened at any time. A panel whose stage has not come yet says so in one line, and still shows what can be read or changed.
```

- [ ] **Step 4: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown

The stage panel starts with the student links: "Fiecare elev primește un link cu rezultatul lui: nota, punctajul pe fiecare exercițiu și comentariile." and "Publică toate rezultatele". A table: student, points, grade, "Copiază linkul", and the state ("Publicat" with "Oprește publicarea", or "Nepublicat" with "Publică"); a student without a paper has no link. Under it, "Pentru tine": the class report, a PDF for each student, the CSV for the catalog.

```

Replace it with:

```markdown

The panel of the stage Rezultate (§6). A draft has one line: "Rezultatele se publică după corectare." Every other test:

- Under the stage's sentence, one line: "Linkul arată nota, punctajul pe fiecare exercițiu și comentariile. Elevul îl vede după ce îl publici."
- Publishing:
  - Before any paper is graded, while no result is published: "Rezultatele se publică după corectare.", and no button.
  - While the results are not published for all: "Publică toate rezultatele", the panel's filled button. While points wait in Verificare, a line before it: "Mai ai 3 puncte de verificat. Dacă publici acum, elevii văd punctajul de acum."
  - While they are: "Rezultatele sunt publicate. Elevii le văd pe linkurile lor.", "Oprește accesul la rezultate" (outline), and "Linkurile cu rezultate și pozele lor nu se mai deschid până publici din nou rezultatele." It closes every link, also the ones published alone (decision 26).
- "Linkurile elevilor", with the count of the links ("1 publicat · 26 nepublicate", or "toate publicate"), and a table with a row for each student of the class, and for a student who left the class after starting a paper, sorted by name:
  - "Elev": the name, a link to the paper's page (where the student's PDF is), and "a plecat" for a student who left.
  - "Punctaj": the total and its maximum, as in the class report ("72 / 100"); "Nota". A paper not graded yet has "—" for both.
  - "Linkul cu rezultatul": "Copiază linkul" ("Copiat!" after it). An older paper with no link yet first has "Fă linkul". When the browser refuses to copy, the link shows in a field, to copy by hand. A student who did not send a paper has no link: "Nu a trimis lucrarea."
  - "Stare": "Publicat" with "Oprește publicarea", or "Nepublicat" with "Publică". Only a graded paper has "Publică": a paper not graded yet is "Nepublicat" alone. While all results are published, "Publicat" alone.
  - On a phone each row is a card, like the papers table.
- "Pentru tine":
  - "Raportul clasei": "Media testului 7,18 · rezultatele pe exerciții · analiza clasei", and "Deschide raportul".
  - "CSV pentru catalog": "Fiecare elev cu punctele pe exerciții, totalul și nota.", and "Descarcă CSV" (decision 25).
  - The line "PDF-ul cu rezultatul unui elev este pe pagina lucrării lui: apasă pe numele lui în tabel." (decision 24).
  - Before the first graded paper, one line in their place: "Raportul clasei și CSV-ul apar după prima corectare."

```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md
git commit -m "Write the Phase 5 decisions into the redesign spec"
```

### Task 2: The points of each paper in the uploads list

`GET /api/admin/tests/:code` gives, for each row of `uploads`, the total and the maximum of its graded result.

**Files:**
- Modify: `shared/api.ts` (`UploadRow`), `server/db/tests.ts` (`listUploads`), `src/test/fakeApi.ts` (`fakeUpload`)
- Test: `server/routes/tests.test.ts`

**Interfaces:**
- Produces: `UploadRow.total: number | null` and `UploadRow.maxTotal: number | null` (the office points included; null while the row has no graded result). `fakeUpload()` gives both null unless overridden.

- [ ] **Step 1: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
        autoSubmitted: false,
        grade: null,
        gradedAt: null,
        resultToken: null,
```

Replace it with:

```ts
        autoSubmitted: false,
        grade: null,
        total: null,
        maxTotal: null,
        gradedAt: null,
        resultToken: null,
```

- [ ] **Step 2: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
        grade: null,
        gradedAt: null,
```

Replace it with:

```ts
        grade: null,
        total: null,
        maxTotal: null,
        gradedAt: null,
```

- [ ] **Step 3: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
    const byName = Object.fromEntries(res.body.uploads.map((row: { studentName: string }) => [row.studentName, row]));
    expect(byName['Pop Ion']).toMatchObject({ status: 'graded', grade: 8.75, gradedAt: '2026-10-07T09:00:00.000Z', flagCount: 3, lastError: null });
    expect(byName['Ionescu Ana']).toMatchObject({ status: 'graded', grade: 10, flagCount: 0 });
    expect(byName['Stan Eva']).toMatchObject({ status: 'failed', grade: null, gradedAt: null, flagCount: 0, lastError: 'Corectarea a durat prea mult.' });

```

Replace it with:

```ts
    const byName = Object.fromEntries(res.body.uploads.map((row: { studentName: string }) => [row.studentName, row]));
    expect(byName['Pop Ion']).toMatchObject({
      status: 'graded',
      grade: 8.75,
      total: 8.75,
      maxTotal: 10,
      gradedAt: '2026-10-07T09:00:00.000Z',
      flagCount: 3,
      lastError: null,
    });
    expect(byName['Ionescu Ana']).toMatchObject({ status: 'graded', grade: 10, flagCount: 0 });
    expect(byName['Stan Eva']).toMatchObject({
      status: 'failed',
      grade: null,
      total: null,
      maxTotal: null,
      gradedAt: null,
      flagCount: 0,
      lastError: 'Corectarea a durat prea mult.',
    });

```

- [ ] **Step 4: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    grade: null,
    gradedAt: overrides.status === 'graded' ? '2026-10-07T09:00:00.000Z' : null,
```

Replace it with:

```ts
    grade: null,
    total: null,
    maxTotal: null,
    gradedAt: overrides.status === 'graded' ? '2026-10-07T09:00:00.000Z' : null,
```

- [ ] **Step 5: Run the tests to see them fail**

Run: `npx vitest run server/routes/tests.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  2 failed | 20 passed (22)`: the rows have no `total` and `maxTotal` yet ("returns the test and one upload row per active student, by name": `AssertionError: expected [ { studentId: 2, …(16) }, …(2) ] to deeply equal [ { studentId: 2, …(18) }, …(2) ]`; "shows grades, the items to check, and grading errors": `AssertionError: expected { studentId: 1, …(16) } to match object { status: 'graded', grade: 8.75, …(5) }`).

- [ ] **Step 6: Edit `shared/api.ts`**

Find this block:

```ts
  grade: number | null;
  // The grading the row shows (`EvaluationInfo.gradedAt`), once graded.
```

Replace it with:

```ts
  grade: number | null;
  // The points and their maximum, the office points included, once graded.
  total: number | null;
  maxTotal: number | null;
  // The grading the row shows (`EvaluationInfo.gradedAt`), once graded.
```

- [ ] **Step 7: Edit `server/db/tests.ts`**

Find this block:

```ts
      `SELECT st.id AS student_id, st.full_name, e.active,
         s.id AS submission_id, s.status, s.started_at, s.submitted_at, s.auto_submitted, s.last_error, ev.grade, ev.created_at AS graded_at, ev.model, ev.effort,
         s.result_token, s.results_open AS submission_open, (SELECT t.results_open FROM tests t WHERE t.id = ?) AS test_open,
```

Replace it with:

```ts
      `SELECT st.id AS student_id, st.full_name, e.active,
         s.id AS submission_id, s.status, s.started_at, s.submitted_at, s.auto_submitted, s.last_error, ev.grade, ev.total, ev.max_total, ev.created_at AS graded_at, ev.model, ev.effort,
         s.result_token, s.results_open AS submission_open, (SELECT t.results_open FROM tests t WHERE t.id = ?) AS test_open,
```

- [ ] **Step 8: Edit `server/db/tests.ts`**

Find this block:

```ts
      grade: number | null;
      graded_at: string | null;
```

Replace it with:

```ts
      grade: number | null;
      total: number | null;
      max_total: number | null;
      graded_at: string | null;
```

- [ ] **Step 9: Edit `server/db/tests.ts`**

Find this block:

```ts
      grade: row.grade,
      gradedAt: row.graded_at,
```

Replace it with:

```ts
      grade: row.grade,
      total: row.total,
      maxTotal: row.max_total,
      gradedAt: row.graded_at,
```

- [ ] **Step 10: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  115 passed | 1 skipped (116)`, `Tests  1828 passed | 3 skipped (1831)`.

- [ ] **Step 11: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 12: Commit**

```bash
git add shared/api.ts server/db/tests.ts server/routes/tests.test.ts src/test/fakeApi.ts
git commit -m "Send the points of each graded paper with the uploads list"
```

### Task 3: The panel Rezultate

The panel of the redesign: what the link shows, publishing for all, the students' links, and "Pentru tine".

The page tests: the six results tests of `TestPage.test.tsx` move to the new `ResultsPanel.test.tsx` and change with the panel ("shows no publish button before anything is graded, and keeps the stop button once results are open", "publishes the student results and stops them again", "publishes one result while the rest stays unpublished", "hides the single publish buttons once every result is published", "shows a result link per upload, with copy and WhatsApp share", "hides the result link while the upload is still on the phone"). The class report link is now "Deschide raportul" (six tests). "shows the model and effort of each grading after Nota when the setting is on" opens `#corectare`: the done test opens on Rezultate, which has no papers table. So `TestPage.test.tsx` has 103 tests (`it.each` rows counted) and `ResultsPanel.test.tsx` 14.

**Files:**
- Create: `src/admin/testPage/ResultLinksTable.tsx`, `src/admin/testPage/ResultFiles.tsx`
- Replace: `src/admin/testPage/ResultsAccess.tsx`
- Modify: `src/admin/testPage/StagePanel.tsx` (`ResultsPanel`), `src/ui/brand.css`
- Test: `src/admin/testPage/ResultsPanel.test.tsx` (new), `src/admin/pages/TestPage.test.tsx`

**Interfaces:**
- Consumes: `UploadRow.total`, `UploadRow.maxTotal` (Task 2); `api.setResultsOpen`, `api.setSubmissionResultsOpen`, `api.getResultLink`, `api.getReport`, `studentResultUrl` (`src/admin/api.ts`); `classCsv` (`shared/csv.ts`); `saveFile` (`src/admin/pdf/share.ts`).
- Produces: `ResultsAccess({ test, onChanged })` and `hasResultsToManage(test)`; `ResultLinksTable({ code, uploads, resultsOpen, onChanged })` and `linksCount(uploads): string | null`; `ResultFiles({ test })`.

- [ ] **Step 1: Create `src/admin/testPage/ResultsPanel.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClassReport, TestInfo, UploadRow } from '../../../shared/api.ts';
import { classCsv } from '../../../shared/csv.ts';
import { uploadStatusLabel } from '../../ui/format.ts';
import { createFakeApi, FAKE_STARTED_AT, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import * as share from '../pdf/share.ts';

vi.mock('../pdf/share.ts', () => ({ saveFile: vi.fn(), shareFile: vi.fn() }));

const saveFile = vi.mocked(share.saveFile);

// The panel Rezultate of the test page (redesign spec §8).
const PAGE = '/teste/6E2-26T1#rezultate';

// Pop Ion and Stan Eva sent graded papers; Marin Dan sent none.
const graded = () => [
  fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, total: 90, maxTotal: 100 }),
  fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8, total: 80, maxTotal: 100 }),
  fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
];

function apiWith(overrides: Partial<TestInfo>, rows: UploadRow[], reports: Record<string, ClassReport> = {}) {
  return createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: rows.length }],
    students: {},
    tests: [fakeTest(overrides, rows)],
    reports,
  });
}

const row = (name: string) => screen.getByRole('rowheader', { name: new RegExp(`^${name}`) }).closest('tr')!;

afterEach(() => {
  vi.restoreAllMocks();
  saveFile.mockReset();
});

describe('the panel Rezultate', () => {
  it('has one line for a draft', async () => {
    renderAdmin(PAGE, apiWith({}, graded()));
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toBeInTheDocument();
    expect(screen.getByText('Rezultatele se publică după corectare.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Linkurile cu rezultatele elevilor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pentru tine' })).not.toBeInTheDocument();
  });

  it('says what the link shows, and offers no publish button before anything is graded', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 2 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
    ];
    renderAdmin(PAGE, apiWith({ status: 'evaluating' }, rows));
    expect(
      await screen.findByText('Linkul arată nota, punctajul pe fiecare exercițiu și comentariile. Elevul îl vede după ce îl publici.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Rezultatele se publică după corectare.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publică toate rezultatele' })).not.toBeInTheDocument();
    // A sent paper has its link before the grading; one still on the phone has none.
    expect(within(row('Pop Ion')).getByRole('button', { name: 'Fă linkul' })).toBeInTheDocument();
    expect(within(row('Pop Ion')).getByText('Nepublicat')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publică' })).not.toBeInTheDocument();
    expect(within(row('Stan Eva')).getByText('Nu a trimis lucrarea.')).toBeInTheDocument();
    expect(within(row('Marin Dan')).getByText('Nu a trimis lucrarea.')).toBeInTheDocument();
    expect(screen.getByText('0 publicate · 1 nepublicat')).toBeInTheDocument();
    expect(screen.getByText('Raportul clasei și CSV-ul apar după prima corectare.')).toBeInTheDocument();
  });

  it('shows the points and the grade of a graded paper, and dashes for a paper not graded yet', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 7.25, total: 72.5, maxTotal: 100 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'failed', fileCount: 1 }),
    ];
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    await screen.findByRole('table', { name: 'Linkurile cu rezultatele elevilor' });
    expect(within(row('Pop Ion')).getByText('72,5 / 100')).toBeInTheDocument();
    expect(within(row('Pop Ion')).getByText('7,25')).toBeInTheDocument();
    expect(within(row('Stan Eva')).getAllByText('—')).toHaveLength(2);
  });

  it("links each name to the paper's page, and marks a student who left", async () => {
    const rows = [...graded(), fakeUpload({ studentId: 13, studentName: 'Vlad Ana', active: false, submissionId: 7, status: 'graded', grade: 6 })];
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    await screen.findByRole('table', { name: 'Linkurile cu rezultatele elevilor' });
    expect(within(row('Pop Ion')).getByRole('link', { name: 'Pop Ion' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/5');
    expect(within(row('Marin Dan')).queryByRole('link')).not.toBeInTheDocument();
    expect(within(row('Vlad Ana')).getByText('a plecat')).toBeInTheDocument();
  });

  it('publishes every result, and stops every link again', async () => {
    const api = apiWith({ status: 'done' }, graded());
    renderAdmin(PAGE, api);
    expect(await screen.findByText('0 publicate · 2 nepublicate')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publică toate rezultatele' }));
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', true);
    expect(await screen.findByText('Rezultatele sunt publicate. Elevii le văd pe linkurile lor.')).toBeInTheDocument();
    expect(screen.getByText('toate publicate')).toBeInTheDocument();
    // While all are published, a row cannot be stopped alone.
    expect(within(row('Pop Ion')).getByText('Publicat')).toHaveClass('tag', 'tag-ok');
    expect(screen.queryByRole('button', { name: 'Publică' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Oprește publicarea' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Oprește accesul la rezultate' }));
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', false);
    expect(await screen.findByRole('button', { name: 'Publică toate rezultatele' })).toBeInTheDocument();
    expect(within(row('Pop Ion')).getByText('Nepublicat')).toBeInTheDocument();
    expect(within(row('Pop Ion')).getByRole('button', { name: 'Publică' })).toBeInTheDocument();
  });

  it('publishes one result while the rest stays unpublished, and stops it again', async () => {
    const api = apiWith({ status: 'done' }, graded());
    renderAdmin(PAGE, api);
    await userEvent.click(within(await screen.findByRole('row', { name: /^Pop Ion/ })).getByRole('button', { name: 'Publică' }));
    expect(api.setSubmissionResultsOpen).toHaveBeenCalledWith(5, FAKE_STARTED_AT, true);
    expect(await within(row('Pop Ion')).findByRole('button', { name: 'Oprește publicarea' })).toBeInTheDocument();
    expect(within(row('Pop Ion')).getByText('Publicat')).toBeInTheDocument();
    expect(within(row('Stan Eva')).getByText('Nepublicat')).toBeInTheDocument();
    expect(screen.getByText('1 publicat · 1 nepublicat')).toBeInTheDocument();

    await userEvent.click(within(row('Pop Ion')).getByRole('button', { name: 'Oprește publicarea' }));
    expect(api.setSubmissionResultsOpen).toHaveBeenCalledWith(5, FAKE_STARTED_AT, false);
    expect(await within(row('Pop Ion')).findByRole('button', { name: 'Publică' })).toBeInTheDocument();
  });

  it('publishes a paper alone only once it is graded, and still stops one published before a new grading', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, total: 90, maxTotal: 100 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'failed', fileCount: 1 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan', submissionId: 7, status: 'grading', fileCount: 1, resultsOpen: true }),
    ];
    renderAdmin(PAGE, apiWith({ status: 'evaluating' }, rows));
    await screen.findByRole('table', { name: 'Linkurile cu rezultatele elevilor' });
    expect(within(row('Pop Ion')).getByRole('button', { name: 'Publică' })).toBeInTheDocument();
    expect(within(row('Stan Eva')).getByText('Nepublicat')).toBeInTheDocument();
    expect(within(row('Stan Eva')).queryByRole('button', { name: 'Publică' })).not.toBeInTheDocument();
    expect(within(row('Marin Dan')).getByText('Publicat')).toBeInTheDocument();
    expect(within(row('Marin Dan')).getByRole('button', { name: 'Oprește publicarea' })).toBeInTheDocument();
  });

  it('says how many points still wait before the teacher publishes', async () => {
    const rows = graded().map((upload) => (upload.studentId === 10 ? { ...upload, flagCount: 3 } : upload));
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    expect(await screen.findByText('Mai ai 3 puncte de verificat. Dacă publici acum, elevii văd punctajul de acum.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publică toate rezultatele' })).toHaveClass('button');
  });

  it('copies the result link of a paper', async () => {
    const user = userEvent.setup();
    const rows = graded().map((upload) => (upload.studentId === 10 ? { ...upload, resultToken: 'result-token-5' } : upload));
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    await user.click(within(await screen.findByRole('row', { name: /^Pop Ion/ })).getByRole('button', { name: 'Copiază linkul' }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/u/rezultat/result-token-5`);
    expect(within(row('Pop Ion')).getByRole('button', { name: 'Copiat!' })).toBeInTheDocument();
  });

  it('makes the link of an older paper first, then copies it', async () => {
    const user = userEvent.setup();
    const api = apiWith({ status: 'done' }, graded());
    renderAdmin(PAGE, api);
    await user.click(within(await screen.findByRole('row', { name: /^Pop Ion/ })).getByRole('button', { name: 'Fă linkul' }));
    expect(api.getResultLink).toHaveBeenCalledWith(5, FAKE_STARTED_AT);
    await user.click(await within(row('Pop Ion')).findByRole('button', { name: 'Copiază linkul' }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/u/rezultat/result-token-5`);
  });

  it('shows the link in a field when the browser refuses to copy it', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('Refuzat', 'NotAllowedError'));
    const rows = graded().map((upload) => (upload.studentId === 10 ? { ...upload, resultToken: 'result-token-5' } : upload));
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    await user.click(within(await screen.findByRole('row', { name: /^Pop Ion/ })).getByRole('button', { name: 'Copiază linkul' }));
    expect(await screen.findByLabelText('Linkul cu rezultatul elevului Pop Ion')).toHaveValue(
      `${window.location.origin}/u/rezultat/result-token-5`,
    );
  });

  it('offers the class report and the CSV once a paper is graded', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done' }, graded()));
    expect(await screen.findByRole('heading', { level: 3, name: 'Pentru tine' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Deschide raportul' })).toHaveAttribute('href', '/teste/6E2-26T1/raport');
    expect(screen.getByText('Media testului 8,5 · rezultatele pe exerciții · analiza clasei')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descarcă CSV' })).toBeInTheDocument();
    expect(screen.getByText('PDF-ul cu rezultatul unui elev este pe pagina lucrării lui: apasă pe numele lui în tabel.')).toBeInTheDocument();
  });

  it('downloads the CSV of the class report', async () => {
    const report: ClassReport = {
      test: { code: '6E2-26T1', title: 'Fracții', className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
      exercises: [{ id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 4.5 }],
      rows: [
        {
          submissionId: 5,
          studentId: 10,
          studentName: 'Pop Ion',
          active: true,
          total: 9,
          maxTotal: 10,
          grade: 9,
          flagCount: 0,
          items: [{ exerciseId: 'I.1', points: 4.5, maxPoints: 4.5, flagged: false }],
        },
      ],
      missing: [{ studentId: 12, studentName: 'Marin Dan', status: 'none' }],
      analysis: { status: 'none', stale: false, attempts: 0, content: null },
    };
    const api = apiWith({ status: 'done' }, graded(), { '6E2-26T1': report });
    renderAdmin(PAGE, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Descarcă CSV' }));
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    expect(api.getReport).toHaveBeenCalledWith('6E2-26T1');
    const [blob, fileName] = saveFile.mock.calls[0]!;
    expect(fileName).toBe('6E2-26T1-raport.csv');
    // The BOM stays: Excel reads the diacritics by it.
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(await blob.arrayBuffer())).toBe(classCsv(report, uploadStatusLabel));
  });

  it('says why the CSV could not be made', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done' }, graded()));
    await userEvent.click(await screen.findByRole('button', { name: 'Descarcă CSV' }));
    expect(await screen.findByText('Nu am găsit ce cauți.')).toBeInTheDocument();
    expect(saveFile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    const detail = fakeTest({ status: 'done' }, rows);
    renderAdmin(PAGE, createFakeApi({ classes: [], students: {}, tests: [{ ...detail, showModel: true }] }));
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
```

Replace it with:

```tsx
    const detail = fakeTest({ status: 'done' }, rows);
    // A done test opens on Rezultate, which has no papers table.
    renderAdmin(`${PAGE}#corectare`, createFakeApi({ classes: [], students: {}, tests: [{ ...detail, showModel: true }] }));
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
```

- [ ] **Step 3: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    await openStage('Rezultate');
    expect(screen.getByRole('link', { name: 'Raportul clasei' })).toHaveAttribute('href', '/teste/6E2-26T1/raport');
  });
```

Replace it with:

```tsx
    await openStage('Rezultate');
    expect(screen.getByRole('link', { name: 'Deschide raportul' })).toHaveAttribute('href', '/teste/6E2-26T1/raport');
  });
```

- [ ] **Step 4: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(screen.queryByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).not.toBeInTheDocument();
    await openStage('Rezultate');
    expect(screen.getByRole('link', { name: 'Raportul clasei' })).toBeInTheDocument();
  });

```

Replace it with:

```tsx
    expect(screen.queryByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).not.toBeInTheDocument();
    await openStage('Rezultate');
    expect(screen.getByRole('link', { name: 'Deschide raportul' })).toBeInTheDocument();
  });

```

- [ ] **Step 5: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Raportul clasei' })).not.toBeInTheDocument();
    await openStage('Corectare');
```

Replace it with:

```tsx
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Deschide raportul' })).not.toBeInTheDocument();
    await openStage('Corectare');
```

- [ ] **Step 6: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    const panel = await screen.findByRole('region', { name: 'Rezultate' });
    const link = within(panel).getByRole('link', { name: 'Raportul clasei' });
    expect(link).toHaveAttribute('href', '/teste/6E2-26T1/raport');
    expect(link).toHaveClass('button-quiet', 'button-small');
    expect(screen.getAllByRole('link', { name: 'Raportul clasei' })).toHaveLength(1);
  });
```

Replace it with:

```tsx
    const panel = await screen.findByRole('region', { name: 'Rezultate' });
    const link = within(panel).getByRole('link', { name: 'Deschide raportul' });
    expect(link).toHaveAttribute('href', '/teste/6E2-26T1/raport');
    expect(link).toHaveClass('button-quiet', 'button-small');
    expect(screen.getAllByRole('link', { name: 'Deschide raportul' })).toHaveLength(1);
  });
```

- [ ] **Step 7: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Raportul clasei' })).not.toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Deschide raportul' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 8: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    await openStage('Rezultate');
    expect(screen.getByRole('link', { name: 'Raportul clasei' })).toBeInTheDocument();
  });

  it('shows no publish button before anything is graded, and keeps the stop button once results are open', async () => {
    const { unmount } = renderAdmin(`${PAGE}#rezultate`, apiWith({ status: 'done' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publică rezultatele' })).not.toBeInTheDocument();
    unmount();
    renderAdmin(`${PAGE}#rezultate`, apiWith({ status: 'done', resultsOpen: true }));
    expect(await screen.findByRole('button', { name: 'Oprește accesul la rezultate' })).toBeInTheDocument();
  });

  it('publishes the student results and stops them again', async () => {
    const api = apiWith({ status: 'done', gradedCount: 1 });
    renderAdmin(`${PAGE}#rezultate`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Publică rezultatele' }));
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', true);
    expect(await screen.findByRole('button', { name: 'Oprește accesul la rezultate' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Oprește accesul la rezultate' }));
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', false);
    expect(await screen.findByRole('button', { name: 'Publică rezultatele' })).toBeInTheDocument();
  });

  it('publishes one result while the rest stays unpublished', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
    ];
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [fakeTest({ status: 'done' }, rows)],
    });
    renderAdmin(`${PAGE}#rezultate`, api);
    expect(await screen.findAllByRole('button', { name: 'Publică' })).toHaveLength(2);
    expect(screen.queryByText(/publicat individual/)).not.toBeInTheDocument();

    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    await userEvent.click(within(pop).getByRole('button', { name: 'Publică' }));
    expect(api.setSubmissionResultsOpen).toHaveBeenCalledWith(5, FAKE_STARTED_AT, true);
    expect(await within(pop).findByRole('button', { name: 'Oprește publicarea' })).toBeInTheDocument();
    expect(within(pop).getByText('Publicat')).toBeInTheDocument();
    expect(screen.getByText('1 rezultat publicat individual.')).toBeInTheDocument();
    const stan = screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    expect(within(stan).getByRole('button', { name: 'Publică' })).toBeInTheDocument();

    await userEvent.click(within(pop).getByRole('button', { name: 'Oprește publicarea' }));
    expect(api.setSubmissionResultsOpen).toHaveBeenCalledWith(5, FAKE_STARTED_AT, false);
    expect(await within(pop).findByRole('button', { name: 'Publică' })).toBeInTheDocument();
    expect(screen.queryByText(/publicat individual/)).not.toBeInTheDocument();
  });

  it('hides the single publish buttons once every result is published', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, resultsOpen: true }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8, resultsOpen: true }),
    ];
    renderAdmin(
      `${PAGE}#rezultate`,
      createFakeApi({
        classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
        students: {},
        tests: [fakeTest({ status: 'done', resultsOpen: true }, rows)],
      }),
    );
    expect(await screen.findByRole('button', { name: 'Oprește accesul la rezultate' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publică' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Oprește publicarea' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Publicat')).toHaveLength(2);
  });

  it('shows a result link per upload, with copy and WhatsApp share', async () => {
    // Fresh rows: earlier tests reset the shared uploads above.
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
    ];
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [fakeTest({ status: 'done' }, rows)],
    });
    renderAdmin(`${PAGE}#rezultate`, api);
    const links = await screen.findAllByRole('button', { name: 'Link rezultat' });
    expect(links).toHaveLength(2);
    await userEvent.click(links[0]!);
    expect(api.getResultLink).toHaveBeenCalledWith(5, FAKE_STARTED_AT);
    const url = `${window.location.origin}/u/rezultat/result-token-5`;
    expect(await screen.findByDisplayValue(url)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      `https://wa.me/?text=${encodeURIComponent(`Rezultatul la testul 6E2-26T1: ${url}`)}`,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Copiază' }));
    expect(await navigator.clipboard.readText()).toBe(url);
  });

  it('hides the result link while the upload is still on the phone', async () => {
    // Pop Ion sent the upload, Stan Eva still uploads, Marin Dan did not start.
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [fakeTest({ status: 'done' }, uploads)],
    });
    renderAdmin(`${PAGE}#rezultate`, api);
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Link rezultat' })).toHaveLength(1);
  });
```

Replace it with:

```tsx
    await openStage('Rezultate');
    expect(screen.getByRole('link', { name: 'Deschide raportul' })).toBeInTheDocument();
  });
```

- [ ] **Step 9: Run the tests to see them fail**

Run: `npx vitest run src/admin/testPage/ResultsPanel.test.tsx src/admin/pages/TestPage.test.tsx`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  17 failed | 100 passed (117)`. The old panel has none of the new parts: 13 of the 14 tests of `ResultsPanel.test.tsx` fail (`Unable to find role="table" and name "Linkurile cu rezultatele elevilor"`, `Unable to find an element with the text: 0 publicate · 2 nepublicate`, `Unable to find an accessible element with the role "button" and name "Copiază linkul"`, the same for "Fă linkul", `Unable to find role="heading" and name "Pentru tine"`, `Unable to find role="button" and name "Descarcă CSV"`, and the new lines of text), and four tests of `TestPage.test.tsx` find no link "Deschide raportul". The others pass already, as guards: "has one line for a draft" (the draft's line is the same), "shows the link to the class report only when something is graded" and "has no report button before any grading" (they look for no link), "shows the model and effort of each grading after Nota when the setting is on" (the old Corectare has the papers table too), and the rest of the page tests.

- [ ] **Step 10: Create `src/admin/testPage/ResultLinksTable.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { UploadRow } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { countLabel } from '../../ui/format.ts';
import { studentResultUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// A paper the student sent has a result link; a student who did not send one
// (no upload, or one still on the phone) has none.
function hasLink(row: UploadRow): row is UploadRow & { submissionId: number; startedAt: string } {
  return row.submissionId !== null && row.startedAt !== null && row.status !== 'none' && row.status !== 'uploading';
}

// "1 publicat · 26 nepublicate", or "toate publicate"; nothing while no
// student has a link.
export function linksCount(uploads: UploadRow[]): string | null {
  const links = uploads.filter(hasLink);
  if (links.length === 0) return null;
  const published = links.filter((row) => row.resultsOpen).length;
  if (published === links.length) return 'toate publicate';
  return `${countLabel(published, 'publicat', 'publicate')} · ${countLabel(links.length - published, 'nepublicat', 'nepublicate')}`;
}

// The students' result links in the panel Rezultate (redesign spec §8): a row
// for each student, with the points, the grade, the link to copy, and whether
// the result is published. Only a graded paper can be published alone; one
// already published can be stopped, also while it is graded again. While the
// test publishes every result, a row cannot be stopped alone: "Oprește
// accesul la rezultate" stops them all.
export function ResultLinksTable({
  code,
  uploads,
  resultsOpen,
  onChanged,
}: {
  code: string;
  uploads: UploadRow[];
  // Whether the test keeps results open for all students.
  resultsOpen: boolean;
  onChanged: () => Promise<void>;
}) {
  if (uploads.length === 0) return <p className="hint">Clasa nu are elevi. Adaugă-i din pagina clasei.</p>;
  return (
    <div className="table-wrap uploads-wrap">
      <table className="uploads result-links">
        <caption className="sr-only">Linkurile cu rezultatele elevilor</caption>
        <thead>
          <tr>
            <th scope="col">Elev</th>
            <th scope="col">Punctaj</th>
            <th scope="col">Nota</th>
            <th scope="col">Linkul cu rezultatul</th>
            <th scope="col">Stare</th>
          </tr>
        </thead>
        <tbody>
          {uploads.map((row) => (
            <ResultLinkRow key={row.studentId} code={code} row={row} testResultsOpen={resultsOpen} onChanged={onChanged} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultLinkRow({
  code,
  row,
  testResultsOpen,
  onChanged,
}: {
  code: string;
  row: UploadRow;
  testResultsOpen: boolean;
  onChanged: () => Promise<void>;
}) {
  const api = useApi();
  // Each action names the upload the row shows (`startedAt`).
  const publish = useMutation({
    mutationFn: ({ submissionId, startedAt, open }: { submissionId: number; startedAt: string; open: boolean }) =>
      api.setSubmissionResultsOpen(submissionId, startedAt, open),
    onSuccess: onChanged,
  });
  const points =
    row.status === 'graded' && row.total !== null && row.maxTotal !== null ? `${formatPoints(row.total)} / ${formatPoints(row.maxTotal)}` : '—';
  return (
    <tr className={hasLink(row) ? undefined : 'is-muted'}>
      <th scope="row">
        {row.submissionId === null ? row.studentName : <Link to={`/teste/${code}/elevi/${row.submissionId}`}>{row.studentName}</Link>}
        {!row.active && <span className="tag">a plecat</span>}
      </th>
      <td data-label="Punctaj">{points}</td>
      <td data-label="Nota">{row.grade === null ? '—' : <strong>{formatPoints(row.grade)}</strong>}</td>
      <td className="result-link-cell">
        {hasLink(row) ? (
          <CopyResultLink
            key={row.submissionId}
            submissionId={row.submissionId}
            startedAt={row.startedAt}
            resultToken={row.resultToken}
            studentName={row.studentName}
          />
        ) : (
          'Nu a trimis lucrarea.'
        )}
      </td>
      <td className="result-state-cell">
        {hasLink(row) && (
          <span className="row-actions">
            {row.resultsOpen ? <span className="tag tag-ok">Publicat</span> : <span className="hint">Nepublicat</span>}
            {!testResultsOpen && (row.status === 'graded' || row.resultsOpen) && (
              <button
                type="button"
                className="button-quiet button-small"
                disabled={publish.isPending}
                onClick={() => publish.mutate({ submissionId: row.submissionId, startedAt: row.startedAt, open: !row.resultsOpen })}
              >
                {row.resultsOpen ? 'Oprește publicarea' : 'Publică'}
              </button>
            )}
          </span>
        )}
        {publish.error && <ErrorMessage error={publish.error} />}
      </td>
    </tr>
  );
}

// "Copiază linkul". A paper sent before the links were made with the upload
// has none yet: "Fă linkul" makes it first, so the copy runs in its own tap
// (a browser may refuse a copy that comes after waiting for the API). When the
// browser refuses to copy, the link shows in a field, to copy by hand.
function CopyResultLink({
  submissionId,
  startedAt,
  resultToken,
  studentName,
}: {
  submissionId: number;
  startedAt: string;
  resultToken: string | null;
  studentName: string;
}) {
  const api = useApi();
  const [made, setMade] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refused, setRefused] = useState(false);
  const make = useMutation({
    mutationFn: () => api.getResultLink(submissionId, startedAt),
    onSuccess: setMade,
  });
  const token = resultToken ?? made;

  if (token === null) {
    return (
      <span className="result-share">
        <button type="button" className="button-quiet button-small" disabled={make.isPending} onClick={() => make.mutate()}>
          Fă linkul
        </button>
        {make.error && <ErrorMessage error={make.error} />}
      </span>
    );
  }
  const url = studentResultUrl(token);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setRefused(true);
    }
  };
  return (
    <span className="result-share">
      <button type="button" className="button-quiet button-small" onClick={copy}>
        {copied ? 'Copiat!' : 'Copiază linkul'}
      </button>
      {refused && (
        <span className="result-share-box">
          <input
            type="text"
            readOnly
            value={url}
            aria-label={`Linkul cu rezultatul elevului ${studentName}`}
            onFocus={(event) => event.target.select()}
          />
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 11: Create `src/admin/testPage/ResultFiles.tsx`**

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { TestInfo } from '../../../shared/api.ts';
import { classCsv } from '../../../shared/csv.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { saveFile } from '../pdf/share.ts';

// "Pentru tine" in the panel Rezultate (redesign spec §8): the class report
// and the CSV for the catalog, once a paper is graded. The CSV is the one of
// the class report page, made from the report read when the button is
// pressed. Each student's PDF stays on the paper's page.
export function ResultFiles({ test }: { test: TestInfo }) {
  if (test.gradedCount === 0) return <p className="hint">Raportul clasei și CSV-ul apar după prima corectare.</p>;
  const average = test.averageGrade === null ? '' : `Media testului ${formatPoints(test.averageGrade)} · `;
  return (
    <>
      <ul className="file-list">
        <li>
          <p className="file-title">
            <strong>Raportul clasei</strong>
          </p>
          <p className="hint">{average}rezultatele pe exerciții · analiza clasei</p>
          <Link className="button-quiet button-small" to={`/teste/${test.code}/raport`}>
            Deschide raportul
          </Link>
        </li>
        <CsvRow code={test.code} />
      </ul>
      <p className="hint">PDF-ul cu rezultatul unui elev este pe pagina lucrării lui: apasă pe numele lui în tabel.</p>
    </>
  );
}

function CsvRow({ code }: { code: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const csv = useMutation({
    mutationFn: async () => {
      const report = await queryClient.fetchQuery({ queryKey: ['report', code], queryFn: () => api.getReport(code) });
      saveFile(new Blob([classCsv(report, uploadStatusLabel)], { type: 'text/csv;charset=utf-8' }), `${report.test.code}-raport.csv`);
    },
  });
  return (
    <li>
      <p className="file-title">
        <strong>CSV pentru catalog</strong>
      </p>
      <p className="hint">Fiecare elev cu punctele pe exerciții, totalul și nota.</p>
      <button type="button" className="button-quiet button-small" disabled={csv.isPending} onClick={() => csv.mutate()}>
        Descarcă CSV
      </button>
      {csv.error && <ErrorMessage error={csv.error} />}
    </li>
  );
}
```

- [ ] **Step 12: Replace `src/admin/testPage/ResultsAccess.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import type { TestInfo } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// Whether a test has results to publish or to stop: something is graded, or
// results are already open (for all, or for single uploads). Before that the
// teacher has nothing to decide, so the panel shows no button.
export function hasResultsToManage(test: Pick<TestInfo, 'status' | 'gradedCount' | 'resultsOpen' | 'publishedCount'>): boolean {
  return test.status !== 'draft' && (test.gradedCount > 0 || test.resultsOpen || test.publishedCount > 0);
}

// Opening and closing the students' result pages of a test for all students
// at once (redesign spec §8). While open, each student reads their own page
// from the link kept after sending (or shared by the teacher); while closed,
// those pages and their files do not open. Closing also takes back the
// results published alone (the API does it), so it closes every link.
export function ResultsAccess({ test, onChanged }: { test: TestInfo; onChanged: () => Promise<void> }) {
  const api = useApi();
  const toggle = useMutation({
    mutationFn: () => api.setResultsOpen(test.code, !test.resultsOpen),
    onSuccess: onChanged,
  });
  if (!hasResultsToManage(test)) return <p className="hint">Rezultatele se publică după corectare.</p>;
  return (
    <div className="results-access">
      {test.resultsOpen ? (
        <>
          <p>Rezultatele sunt publicate. Elevii le văd pe linkurile lor.</p>
          <p>
            <button type="button" className="button-quiet" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
              Oprește accesul la rezultate
            </button>
          </p>
          <p className="hint">Linkurile cu rezultate și pozele lor nu se mai deschid până publici din nou rezultatele.</p>
        </>
      ) : (
        <>
          {test.flagCount > 0 && (
            <p className="hint">
              Mai ai {countLabel(test.flagCount, 'punct de verificat', 'puncte de verificat')}. Dacă publici acum, elevii văd punctajul de
              acum.
            </p>
          )}
          <p>
            <button type="button" className="button" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
              Publică toate rezultatele
            </button>
          </p>
        </>
      )}
      {toggle.error && <ErrorMessage error={toggle.error} />}
    </div>
  );
}
```

- [ ] **Step 13: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
import { useEffect, useId, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import type { RobotStart, TestDetail, TestInfo, UploadRow } from '../../../shared/api.ts';
```

Replace it with:

```tsx
import { useEffect, useId, useRef } from 'react';
import { useLocation } from 'react-router';
import type { RobotStart, TestDetail, TestInfo, UploadRow } from '../../../shared/api.ts';
```

- [ ] **Step 14: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
import { isMoveOn, MoveOnLink } from './MoveOnLink.tsx';
import { hasResultsToManage, ResultsAccess } from './ResultsAccess.tsx';
import { ReviewList } from './ReviewList.tsx';
```

Replace it with:

```tsx
import { isMoveOn, MoveOnLink } from './MoveOnLink.tsx';
import { ResultFiles } from './ResultFiles.tsx';
import { linksCount, ResultLinksTable } from './ResultLinksTable.tsx';
import { ResultsAccess } from './ResultsAccess.tsx';
import { ReviewList } from './ReviewList.tsx';
```

- [ ] **Step 15: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx

function ResultsPanel(props: PanelProps) {
  const { test, uploads, onChanged } = props;
  if (test.status === 'draft') return <p className="hint">Rezultatele se publică după corectare.</p>;
  return (
    <>
      {test.gradedCount > 0 && (
        <p>
          <Link className="button-quiet button-small" to={`/teste/${test.code}/raport`}>
            Raportul clasei
          </Link>
        </p>
      )}
      {hasResultsToManage(test) ? (
        <ResultsAccess test={test} uploads={uploads} onChanged={onChanged} />
      ) : (
        <p className="hint">Rezultatele se publică după corectare.</p>
      )}
      <Papers {...props} selectable={false} />
    </>
```

Replace it with:

```tsx

// The results (redesign spec §8): publishing, the students' links, and
// "Pentru tine". The links table takes the place of the papers table here.
function ResultsPanel({ test, uploads, onChanged }: PanelProps) {
  if (test.status === 'draft') return <p className="hint">Rezultatele se publică după corectare.</p>;
  const count = linksCount(uploads);
  return (
    <>
      <p>Linkul arată nota, punctajul pe fiecare exercițiu și comentariile. Elevul îl vede după ce îl publici.</p>
      <ResultsAccess test={test} onChanged={onChanged} />
      <h3>Linkurile elevilor</h3>
      {count && <p className="hint">{count}</p>}
      <ResultLinksTable code={test.code} uploads={uploads} resultsOpen={test.resultsOpen} onChanged={onChanged} />
      <h3>Pentru tine</h3>
      <ResultFiles test={test} />
    </>
```

- [ ] **Step 16: Edit `src/ui/brand.css`**

Find this block:

```css

.row-actions {
```

Replace it with:

```css

/* "Publicat" starts the state cell of "Linkurile elevilor": no gap before it. */
table.uploads .result-state-cell .tag {
  margin-left: 0;
}

.row-actions {
```

- [ ] **Step 17: Edit `src/ui/brand.css`**

Find this block:

```css
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 700;
  }

  table.uploads.is-selectable thead {
```

Replace it with:

```css
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 700;
  }

  /* "Linkurile elevilor" in short cards: the points and the grade side by
     side, then the link and the state, whose buttons need no caption. */
  table.uploads.result-links tbody tr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    column-gap: 1rem;
  }

  table.uploads.result-links tbody th[scope="row"],
  table.uploads.result-links tbody td.result-link-cell,
  table.uploads.result-links tbody td.result-state-cell {
    grid-column: 1 / -1;
  }

  table.uploads.is-selectable thead {
```

- [ ] **Step 18: Edit `src/ui/brand.css`**

Find this block:

```css
.print-test > button,
.file-list > li > button {
  justify-self: start;
```

Replace it with:

```css
.print-test > button,
.file-list > li > button,
.file-list > li > a.button-quiet {
  justify-self: start;
```

- [ ] **Step 19: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  116 passed | 1 skipped (117)`, `Tests  1836 passed | 3 skipped (1839)`.

- [ ] **Step 20: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 21: Commit**

```bash
git add src/admin/testPage/ResultLinksTable.tsx src/admin/testPage/ResultFiles.tsx src/admin/testPage/ResultsAccess.tsx src/admin/testPage/StagePanel.tsx src/admin/testPage/ResultsPanel.test.tsx src/admin/pages/TestPage.test.tsx src/ui/brand.css
git commit -m "Make the panel Rezultate: publish all, the students' links, and Pentru tine"
```

### Task 4: No result links in the papers table

The papers table of În clasă, Corectare and Verificare loses "Link rezultat" and "Publică" / "Oprește publicarea": they are in Rezultate.

**Files:**
- Modify: `src/admin/testPage/UploadsTable.tsx`, `src/admin/testPage/StagePanel.tsx`
- Test: `src/admin/pages/TestPage.test.tsx`

**Interfaces:**
- Produces: `UploadsTable` without its `resultsOpen` prop.

- [ ] **Step 1: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(marin.querySelector('[data-label="Model"]')).toHaveTextContent('—');
  });
```

Replace it with:

```tsx
    expect(marin.querySelector('[data-label="Model"]')).toHaveTextContent('—');
  });

  it('keeps the result links and the publish buttons out of the papers table', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, resultsOpen: true }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
    ];
    renderAdmin(`${PAGE}#corectare`, createFakeApi({ classes: [], students: {}, tests: [fakeTest({ status: 'done' }, rows)] }));
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    expect(within(pop).getByText('Publicat')).toBeInTheDocument();
    expect(within(pop).getByRole('link', { name: 'Vezi lucrarea' })).toBeInTheDocument();
    for (const name of ['Link rezultat', 'Copiază linkul', 'Publică', 'Oprește publicarea']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/TestPage.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  1 failed | 103 passed (104)`: "keeps the result links and the publish buttons out of the papers table" finds the old buttons (`Found multiple elements with the role "button" and name "Link rezultat"`).

- [ ] **Step 3: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
import { ErrorMessage } from '../ErrorMessage.tsx';
import { ResultLink } from './ResultLink.tsx';

```

Replace it with:

```tsx
import { ErrorMessage } from '../ErrorMessage.tsx';

```

- [ ] **Step 4: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
// uploads to grade now: one checkbox per row with files, and one in the header
// for all of them. While the results stay unpublished for the class, the
// teacher publishes them one upload at a time.
export function UploadsTable({
```

Replace it with:

```tsx
// uploads to grade now: one checkbox per row with files, and one in the header
// for all of them. The result links and their publishing are in the panel
// Rezultate (ResultLinksTable), not here.
export function UploadsTable({
```

- [ ] **Step 5: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
  onRobot,
  resultsOpen,
}: {
```

Replace it with:

```tsx
  onRobot,
}: {
```

- [ ] **Step 6: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
  onRobot: (robot: RobotStart | null) => void;
  // Whether the test keeps results open for all students.
  resultsOpen: boolean;
}) {
```

Replace it with:

```tsx
  onRobot: (robot: RobotStart | null) => void;
}) {
```

- [ ] **Step 7: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
              onRobot={onRobot}
              testResultsOpen={resultsOpen}
            />
```

Replace it with:

```tsx
              onRobot={onRobot}
            />
```

- [ ] **Step 8: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
  onRobot,
  testResultsOpen,
}: {
```

Replace it with:

```tsx
  onRobot,
}: {
```

- [ ] **Step 9: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
  onRobot: (robot: RobotStart | null) => void;
  testResultsOpen: boolean;
}) {
```

Replace it with:

```tsx
  onRobot: (robot: RobotStart | null) => void;
}) {
```

- [ ] **Step 10: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
    },
  });
  // One student's result page, while the class stays unpublished. Hidden once
  // the test publishes every result: then every page is open anyway.
  const publish = useMutation({
    mutationFn: ({ submissionId, startedAt, open }: { submissionId: number; startedAt: string; open: boolean }) =>
      api.setSubmissionResultsOpen(submissionId, startedAt, open),
    onSuccess: onChanged,
  });
```

Replace it with:

```tsx
    },
  });
```

- [ ] **Step 11: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
            <Link to={`/teste/${code}/elevi/${submissionId}`}>Vezi lucrarea</Link>
            {row.status !== 'uploading' && (
              <ResultLink
                submissionId={submissionId}
                startedAt={startedAt}
                resultToken={row.resultToken}
                testCode={code}
                studentName={row.studentName}
              />
            )}
            {row.status === 'failed' && (
```

Replace it with:

```tsx
            <Link to={`/teste/${code}/elevi/${submissionId}`}>Vezi lucrarea</Link>
            {row.status === 'failed' && (
```

- [ ] **Step 12: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
            )}
            {!testResultsOpen && row.status !== 'uploading' && (
              <button
                type="button"
                className="button-quiet button-small"
                disabled={publish.isPending}
                onClick={() => publish.mutate({ submissionId, startedAt, open: !row.resultsOpen })}
              >
                {row.resultsOpen ? 'Oprește publicarea' : 'Publică'}
              </button>
            )}
            <button
```

Replace it with:

```tsx
            )}
            <button
```

- [ ] **Step 13: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
        {regrade.error && <ErrorMessage error={regrade.error} />}
        {publish.error && <ErrorMessage error={publish.error} />}
      </td>
```

Replace it with:

```tsx
        {regrade.error && <ErrorMessage error={regrade.error} />}
      </td>
```

- [ ] **Step 14: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
        onRobot={onRobot}
        resultsOpen={test.resultsOpen}
      />
```

Replace it with:

```tsx
        onRobot={onRobot}
      />
```

- [ ] **Step 15: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  116 passed | 1 skipped (117)`, `Tests  1837 passed | 3 skipped (1840)`.

- [ ] **Step 16: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 17: Commit**

```bash
git add src/admin/testPage/UploadsTable.tsx src/admin/testPage/StagePanel.tsx src/admin/pages/TestPage.test.tsx
git commit -m "Keep the result links and their publishing in Rezultate only"
```

### Task 5: The notes for the next sessions

`src/AGENTS.md` describes the panel Rezultate and where the student's PDF is.

**Files:**
- Modify: `src/AGENTS.md`

- [ ] **Step 1: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table, with its checkboxes only in Corectare), Fișa testului (`TestSheet.tsx`: the facts, the files, the students' link while the test is a draft or open, rename, archive, delete), the papers to check in Verificare (`ReviewList.tsx`), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table, "Recorectează tot"). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `classPage/GradesTable.tsx` is the class page's grade table (students by tests, newest test on the left; it hides archived tests unless asked, and keeps a column for draft and open tests). `pages/ClassStudentsPage.tsx` is "Elevii clasei" (add, rename, "A plecat", "Șterge"). `pages/StudentPage.tsx` is a student's history. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `pages/LoginPage.tsx` is the login and sign-up form: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. `pages/AccountPage.tsx` is Contul meu (password, "Ieși din cont"). `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). A demo account sees, at the top of every page, how many papers it may still have graded. `pages/ReportPage.tsx` and `reportPage/` are the class report (`shared/stats.ts` makes its numbers). `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`)); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (the account menu, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. `todo.ts` decides "De făcut" from the tests list: exactly the three cases of spec §5. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

Replace it with:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the files, the students' link while the test is a draft or open, rename, archive, delete), the papers to check in Verificare (`ReviewList.tsx`), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table, "Recorectează tot"). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `classPage/GradesTable.tsx` is the class page's grade table (students by tests, newest test on the left; it hides archived tests unless asked, and keeps a column for draft and open tests). `pages/ClassStudentsPage.tsx` is "Elevii clasei" (add, rename, "A plecat", "Șterge"). `pages/StudentPage.tsx` is a student's history. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `pages/LoginPage.tsx` is the login and sign-up form: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. `pages/AccountPage.tsx` is Contul meu (password, "Ieși din cont"). `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). A demo account sees, at the top of every page, how many papers it may still have graded. `pages/ReportPage.tsx` and `reportPage/` are the class report (`shared/stats.ts` makes its numbers). `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`)); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (the account menu, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. `todo.ts` decides "De făcut" from the tests list: exactly the three cases of spec §5. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

- [ ] **Step 2: Edit `src/AGENTS.md`**

Find this block:

```markdown
- Page tests that check a navigation use `expectLocation()`: it waits, because the navigation follows the API answer. `LocationProbe` shows the path, the search and the hash.
- The test page draws only the panel of the chosen stage. Its page tests open a stage by its address (`/teste/6E2-26T1#corectare`) or by its link in the list of stages (`openStage()` in `TestPage.test.tsx`). Without an address the page opens on the current stage of `stagesOf()`: fake data with no test file opens on Pregătire, an open test with its files on În clasă, a done test with points to check on Verificare. Fișa testului is a region beside every panel: its students' link, its "Copiază linkul" and its buttons are found from any stage.
```

Replace it with:

```markdown
- Page tests that check a navigation use `expectLocation()`: it waits, because the navigation follows the API answer. `LocationProbe` shows the path, the search and the hash.
- The test page draws only the panel of the chosen stage. Its page tests open a stage by its address (`/teste/6E2-26T1#corectare`) or by its link in the list of stages (`openStage()` in `TestPage.test.tsx`). Without an address the page opens on the current stage of `stagesOf()`: fake data with no test file opens on Pregătire, an open test with its files on În clasă, a done test with points to check on Verificare, a done test with none on Rezultate (which has the links table, not the papers table: a test of the papers table opens `#corectare`). Fișa testului is a region beside every panel: its students' link, its "Copiază linkul" and its buttons are found from any stage.
```

- [ ] **Step 3: Commit**

```bash
git add src/AGENTS.md
git commit -m "Describe the panel Rezultate in the notes"
```

### Task 6: Look at it, then the pull request (main session)

Not a subagent task. Nothing here changes code unless a check fails; a fix found here is prototyped, tested and committed like the tasks above, and named to the user.

- [ ] **Step 1: Check the exactness of the branch**

Run: `git diff --stat refs/proto9/r5 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

- [ ] **Step 2: Run the whole suite three times, and once in UTC**

Run `npm test` three times, then once with `TZ=UTC` (Git Bash: `TZ=UTC npm test`).
Expected: PASS every time. `Test Files  116 passed | 1 skipped (117)`, `Tests  1837 passed | 3 skipped (1840)`.

- [ ] **Step 3: Build and start the production build**

Check port 8788 first (`netstat -ano | findstr :8788`; end a leftover `workerd.exe` as `AGENTS.md` says). Then `npm run db:local`. The local database needs the Phase 4 sample tests (`10B-26T2` and the others; `.superpowers/tools/phase4/sample8.sql`, git-ignored, on this PC; it fails on a database that has a class `9B` already: then load a copy with that class renamed) and, once, the Phase 5 cases: `npx wrangler d1 execute quickeval --local --file .superpowers/tools/phase5/sample9-extra.sql` (points out of 100, links made with the upload but one, a result published alone, a failed paper, a student who sent nothing, a student who left, a long name). Then the Claude Code preview server `preview` (`npm run preview`, http://127.0.0.1:8788).
Expected: `Ready on http://127.0.0.1:8788`.

- [ ] **Step 4: Look at the panel Rezultate at 1440px and at 390px, light and dark**

Open `/admin/teste/10B-26T2#rezultate` (not published for all, every case), `10B-26T1#rezultate` (published for all), `10B-26T3#rezultate` (points still to check) and `9A-26T1#rezultate` (open, nothing graded: no row has "Publică"). Click "Copiază linkul", "Fă linkul", "Publică" and "Oprește publicarea" on a row, "Publică toate rezultatele" and "Oprește accesul la rezultate", "Deschide raportul" and "Descarcă CSV". Open `#corectare`: the papers table has no result link and no publish button. The green "Publicat" starts its cell with no gap, on a desktop and on a phone. Measure in the browser `document.documentElement.scrollWidth <= innerWidth` on each page.
Expected: the look of round 5 (Z3.1), page "Test · Rezultate"; no sideways scroll; each row a card on the phone; one filled button in the panel at most.

- [ ] **Step 5: Run the smoke test**

Run: `npm run smoke` (second terminal, while the preview runs).
Expected: every check passes.

- [ ] **Step 6: Commit the plan**

```bash
git add docs/superpowers/plans/2026-11-06-mqgrader-phase-5-results.md
git commit -m "Add the Phase 5 plan"
```

- [ ] **Step 7: Ask the user, then push and open the pull request**

Ask the user before pushing. On a yes: `git push -u origin feature/mqgrader-results`, then a ready pull request into `main` that lists what changed, the rulings above, and what was checked.

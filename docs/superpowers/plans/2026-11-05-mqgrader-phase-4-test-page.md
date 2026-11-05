# MQGrader Phase 4: The Test Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 6 must run in the main session, not in a subagent:** it looks at the app in a browser, and every outward step (push, pull request) needs the user's explicit yes.

**Goal:** The test page (`/admin/teste/:code`) becomes the test page of the redesign: the test's name with its class, students and start; on the left the six stages of the test as a vertical list and, under it, "Fișa testului" (the facts, the files, the students' link, rename, archive, delete); on the right only the panel of the chosen stage, with the controls of today moved into it. Verificare lists the papers with points to check.

**Architecture:** No API change. The six stages come from `stagesOf()` (`src/admin/stages.ts`, Phase 3), which takes a `TestSummary` and so also the `TestInfo` of the test page. Each stage's panel has an address (`#pregatire` … `#rezultate`, `stageHash()` and `stageFromHash()`); the page reads the chosen stage from the address, and without one opens the stage the test was at when the page first loaded. The page (`src/admin/pages/TestPage.tsx`) draws the title, the list of stages (`testPage/StageList.tsx`), the chosen panel (`testPage/StagePanel.tsx`, which holds the controls of each stage and the papers table) and Fișa testului (`testPage/TestSheet.tsx`). The parts of today's page keep their code and their tests; they move into the panels.

**Tech Stack:** Node 24, TypeScript, React 19, TanStack Query, React Router, Vitest 5, Testing Library. No new npm dependencies, no migration, no server change.

**Spec:** `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md` (§1 decisions 22-23, §6 the test page, §13 phase 4). Task 1 writes the decisions of 2026-11-05 into it. Root `AGENTS.md` and `src/AGENTS.md` hold the project rules. The approved prototype: round 5 (Z3.1) https://claude.ai/artifact/JfoJqXjZVryZCHebhG8QHw, pages "Test · Pregătire", "Test · Verificare" and "Test · Rezultate".

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- Times on screen are Romania's time (`Europe/Bucharest`), whatever the PC's time zone.
- Flat colours only: no gradient anywhere in `brand.css`; a shadow only on what floats. Orange only for what waits on the teacher. One filled button for the main action of a panel; Fișa testului has outline buttons only (its rename form's "Salvează" is the one filled button of that form).
- No page tells students that AI grades their work; this plan changes no student page.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A` (the checkout holds local files that must not be committed: a `.gitignore` line, `.claude/launch.json` entries).
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root `D:\Projects\QuickEval`, on the branch `feature/mqgrader-test-page`. Run `npm test` alone, in the foreground: `runner/run.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy, on `main` too. On 2026-11-05 the login test "gives an IP its attempt back for a good password" took about 22 s in most full runs on this PC. If only tests of those two files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts` alone: `Test Files  2 passed (2)`, `Tests  84 passed (84)`. Then the full run counts as passed when its failed and passed tests add up to the expected passed number (for example `Tests  1 failed | 1821 passed | 3 skipped (1825)` for 1822); say so in the task report.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; overwrite all of it with exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/proto8/w1` … `refs/proto8/w5`, one per task, on `refs/proto8/wbase` (the same files as `main` at `d61455d`). After Task N, `git diff --stat refs/proto8/wN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`). Four tests run the real pandoc (`runner/baremDocx.test.ts`, `runner/baremTask.test.ts`, `runner/workdir.test.ts`): without pandoc they skip too, so every total shows 4 fewer passed and 4 more skipped.

## Rulings made while planning

Decided with the user on 2026-11-05 or while building the prototype; Task 1 writes them into the spec.

1. Verificare lists the papers with points to check, each with "Decide", which opens the paper's page, and "Începe verificarea" for the first (the user). The API counts the points of each paper but does not list them with their reasons; the list of points comes with the review of Phase 6.
2. The students' link and its QR code are always in Fișa testului while the test is a draft or open (the user). The button "Arată linkurile" and its memory in `localStorage` go. The link for many uploads stays in the panel În clasă while the test is open.
3. Fișa testului gives the barem's state ("activ", "de verificat", "se generează", "lipsește", "nu s-a putut genera"), not its points: the API knows the points only after the grading starts.
4. The papers table shows in the panels În clasă, Corectare, Verificare and Rezultate, not for a draft. Its checkboxes are only in Corectare, while the test is open; the choice is kept by the page, so another panel does not lose it.
5. A stage in progress has a pale blue dot; the words of each stage also say its state to a screen reader ("gata", "te așteaptă", "în lucru", "urmează").
6. Each stage is a link to `#pregatire`, `#tiparire`, `#in-clasa`, `#corectare`, `#verificare` or `#rezultate`, without a new step in the history. Without an address the page opens on the stage the test was at when it first loaded; after that only the teacher changes the panel (a refresh or a button that moves the test on keeps it). The Teste page's "Pornește corectarea" opens `#corectare`, because the test page of an open test opens on În clasă. A panel ends with "Următoarea etapă: X →"; after it, the page scrolls to the top of the new panel (clear of the sticky top bar: `scroll-margin-top`) and its heading takes the focus, so a screen reader names it (a click in the list of stages keeps the focus on its link). Found by the review of the plan: a long panel left the page scrolled to its end. In Chrome `focus()` alone did not scroll there, so the panel is scrolled into view first; jsdom has no `scrollIntoView`, so the tests check the focus, and Task 6 checks the scroll.
7. Each panel starts with the landing page's sentence for its stage (spec §3).
8. The robot line shows in the panel of the robot's work: Pregătire while a barem is generated, Tipărire while the print PDF is made, Corectare during the grading or with a time set for it. What the robot answered to the last button shows above the panels, so it is seen from any stage.
9. A problem of the barem shows in Corectare, where the grading waits, with "Folosește oricum" and a link "Înlocuiește baremul" to Pregătire.
10. "Raportul clasei" moves from the title row to the panel Rezultate (an outline button). The state ("Ciornă", "Deschis" …) and "Arhivat" move to Fișa testului; the code moves from the title to Fișa testului, and the title is the test's name.
11. Fișa testului is a region (`section`), not a `complementary` landmark: the shell's panels are the complementary ones, and its tests look for them by that role.
12. On a phone (below 900 px, the width of the shell) the page is one column: the stages, the panel, then Fișa testului. The DOM has that order too.
13. The copy button of a students' link becomes an outline button, and a button alone on its line in the print block or the file rows keeps its own width (seen in the browser check).

## Review Focus

1. The chosen panel never changes by itself: a refresh every 10 s, a start, a stop or a confirmed barem keep it (test in Task 3: "keeps the panel open when a button moves the test to another stage").
2. Every control of today's page has a home: the robot line, the robot's answer, the barem problem, the partial grading, the class analysis line, rename, archive, unarchive, delete, the multi-upload link, the full-screen QR code (tests in Task 3).
3. The selection of papers in Corectare survives a visit to another panel, and only that table has checkboxes (tests in Task 3).
4. A long test title, a long file name and the students' link in Fișa testului wrap; the page never scrolls sideways at 390 px (checked in Task 6).
5. The stage links say their state in words, and the chosen one has `aria-current="step"`; a stage link replaces the address (Back leaves the page), and "Următoarea etapă" gives the focus to the new panel's heading (tests in Task 3).

---

### Task 1: The decisions of 2026-11-05 in the spec

The redesign spec gets the two answers of the user and says exactly what the test page shows: the title, the stages and their addresses, each panel, Fișa testului and the phone.

**Files:**
- Modify: `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`

**Interfaces:**
- Produces: the spec text the later tasks build (§6).

- [ ] **Step 1: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown

Date: 2026-11-04. Status: agreed with the user after six rounds of prototypes. Phase 1 (landing page and light theme) and Phase 2 (look and shell) are live; Phase 3 (Teste page) is being built; the other phases are not.

```

Replace it with:

```markdown

Date: 2026-11-04. Status: agreed with the user after six rounds of prototypes. Phases 1 to 3 (landing page and light theme, look and shell, Teste page) are live; Phase 4 (test page) is being built; the other phases are not.

```

- [ ] **Step 2: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
21. A finished test shows "media testului" on the Teste page, the same number as its class report (Phase 3).

```

Replace it with:

```markdown
21. A finished test shows "media testului" on the Teste page, the same number as its class report (Phase 3).
22. The test page's Verificare lists the papers with points to check, each opening the paper's page. The list of each point with its reason comes with the review of Phase 6: the API gives only a count per paper (Phase 4).
23. The students' link and its QR code are always in "Fișa testului": the button "Arată linkurile" goes (Phase 4).

```

- [ ] **Step 3: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown

- Title: the test's name; under it the class, the students and the start.
- Left column, 300 px: the six stages as a vertical list (a dot per stage: blue with a tick when done, orange when it waits on the teacher, empty when later; the stage name and its state) and, under it, "Fișa testului".
- Right: only the panel of the chosen stage. The current stage opens first; every other stage can be opened at any time to read or change it.
- The stages and the controls that exist today:
  - Pregătire: the test file, the barem (uploaded, or generated and confirmed with "Am verificat baremul"), comments to the barem, "Încarcă-l în locul propunerii". Done when the barem is active.
  - Tipărire: the test with the QR code (`PrintTest`), its failure and retry. Done when the print PDF exists.
  - În clasă: "Începe testul" and "Oprește testul" (`TestActions`), the upload link and QR, who sent and who did not, "Redeschide încărcarea".
  - Corectare: start now or at a time, the choice of papers, the grading bar (`GradingProgress`), the robot line, "Recorectează tot".
  - Verificare: the doubtful points (student, exercise, reason, proposed points, "Decide") and "Începe verificarea"; the graded papers, the ones to check first.
  - Rezultate: §8.
- Fișa testului: class and students, code, start, sent, barem (points + 10 from office), the files (test, barem, test with QR code), the students' link with its QR code and "Copiază linkul", and "Redenumește", "Arhivează", "Șterge testul".

```

Replace it with:

```markdown

- Above the title, the link "← Toate testele". Title: the test's name. Under it: the class (a link to its page), its students ("3 elevi") and the start ("început 6 oct. 2026, 10:15"), or "ciornă" for a draft. Under that, for every stage: the notice of the page before (a new test whose file did not upload), a failed refresh, and what the robot answered to the last button.
- Left column, 300 px: the six stages of `stagesOf()` (§5) as a vertical list and, under it, "Fișa testului". Each stage is a link: a dot (blue with a tick when done, orange when it waits on the teacher, pale blue when in progress, empty when later), the stage name and its note ("lipsește baremul"; "gata" or "urmează" when the stage has none). The words also say the state to a screen reader ("în lucru", "te așteaptă").
- Right: only the panel of the chosen stage: its name, the landing page's sentence for that stage (§3), and its controls.
  - The page opens on the current stage (§5). A click on a stage opens its panel. The address keeps it (`#pregatire`, `#tiparire`, `#in-clasa`, `#corectare`, `#verificare`, `#rezultate`) without a new step in the history, so a reload and Back come back to it. The Teste page opens a stage this way: "Pornește corectarea" opens `#corectare`.
  - The page never changes the panel by itself: after a refresh or a button, the same panel stays open, also when the current stage moved on. A panel may end with a link to the next stage ("Următoarea etapă: Corectare →").
- The panels. Phase 4 moves the controls that exist today; Phase 5 changes Rezultate, and Phase 6 Verificare.
  - Pregătire: the test file, the barem (uploaded, or generated and confirmed with "Am verificat baremul"), the comments to the barem; the robot line while a barem is generated. Done when the barem is active.
  - Tipărire: the test with the QR code (`PrintTest`), its failure and retry, "Pregătește testul cu cod QR"; the robot line while it is made. After the uploads closed, one line: the file stays in Fișa testului. Done when the print PDF exists.
  - În clasă: "Începe testul" and "Oprește testul" (`TestActions`), "Redeschide încărcarea", the link for many uploads (while open), and the papers table: who sent and who did not.
  - Corectare: before the start, one line. While open: start now for the chosen papers or at a time, or "Marchează ca terminat", and the papers table with its checkboxes (only in this panel). After: the state of the grading, a partial grading, a problem of the barem (with a link to Pregătire, where the barem is replaced), the robot line, "Recorectează tot", the line of the class analysis, and the papers table.
  - Verificare: "Lucrări cu puncte de verificat", a row per paper with points to check (the student, the grade, "2 puncte de verificat", and "Decide", which opens the paper's page), and "Începe verificarea", which opens the first of them. "Toate punctele sunt verificate." when graded papers have none; one line before any paper is graded. Then the papers table. The list of each point with its reason comes with the review (§7, Phase 6): the API gives only a count per paper.
  - Rezultate: the controls of today: "Publică rezultatele" or "Oprește accesul la rezultate", "Raportul clasei" once a paper is graded, and the papers table, where a result is published alone and has its link. §8 (Phase 5) replaces it.
  - Every stage can be opened at any time. A panel whose stage has not come yet says so in one line, and still shows what can be read or changed.
- Fișa testului:
  - The facts: the class and its students, the code, the state, the start, the papers sent, the barem's state ("activ", "de verificat", "se generează", "lipsește"; not its points, which the API knows only after the grading starts), and "Media testului" once a paper is graded.
  - The files: the test, the barem, the test with the QR code.
  - While the test is a draft or open and has its link: the students' link, always shown: a small QR code, the address with "Copiază linkul", and "Arată codul QR pe tot ecranul".
  - "Redenumește testul"; "Arhivează testul" or "Scoate din arhivă" (a finished test); "Șterge testul".
- On a phone (below 900 px): one column; the stages, then the panel, then Fișa testului.

```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md
git commit -m "Write the Phase 4 decisions into the redesign spec"
```

### Task 2: The address of each stage

Each stage's panel on the test page gets an address, and the Teste page's "Pornește corectarea" opens the panel Corectare.

**Files:**
- Modify: `src/admin/stages.ts` (`stageHash`, `stageFromHash`), `src/admin/testsPage/nextStep.ts`
- Test: `src/admin/stages.test.ts`, `src/admin/testsPage/nextStep.test.ts`

**Interfaces:**
- Consumes: `StageName` (`src/admin/stages.ts`).
- Produces: `stageHash(name: StageName): string` ("#corectare"), `stageFromHash(hash: string): StageName | null` (`src/admin/stages.ts`).

- [ ] **Step 1: Edit `src/admin/stages.test.ts`**

Find this block:

```ts
import { todoOf } from './shell/todo.ts';
import { stagesOf } from './stages.ts';

```

Replace it with:

```ts
import { todoOf } from './shell/todo.ts';
import { stageFromHash, stageHash, stagesOf } from './stages.ts';

```

- [ ] **Step 2: Edit `src/admin/stages.test.ts`**

Find this block:

```ts
  });
});
```

Replace it with:

```ts
  });
});

describe('stageHash and stageFromHash', () => {
  it('give each stage its own address, and read it back', () => {
    const names = stagesOf(summary()).stages.map((stage) => stage.name);
    expect(names.map(stageHash)).toEqual(['#pregatire', '#tiparire', '#in-clasa', '#corectare', '#verificare', '#rezultate']);
    for (const name of names) expect(stageFromHash(stageHash(name))).toBe(name);
  });

  it('reads no stage from an empty or unknown address', () => {
    expect(stageFromHash('')).toBeNull();
    expect(stageFromHash('#')).toBeNull();
    expect(stageFromHash('#Corectare')).toBeNull();
    expect(stageFromHash('corectare')).toBeNull();
    expect(stageFromHash('#toString')).toBeNull();
  });
});
```

- [ ] **Step 3: Edit `src/admin/testsPage/nextStep.test.ts`**

Find this block:

```ts
  ['starts a draft ready for the class', fakeSummary(), page('Începe testul')],
  ['starts the grading of an open test', fakeSummary({ status: 'open', ...started }), page('Pornește corectarea')],
  ['waits for the time set for the grading', fakeSummary({ status: 'open', ...started, evaluationAt: '2026-10-06T12:00:00.000Z' }), null],
```

Replace it with:

```ts
  ['starts a draft ready for the class', fakeSummary(), page('Începe testul')],
  [
    'starts the grading of an open test in the panel Corectare',
    fakeSummary({ status: 'open', ...started }),
    { kind: 'link', label: 'Pornește corectarea', to: '/teste/6E2-26T1#corectare' },
  ],
  ['waits for the time set for the grading', fakeSummary({ status: 'open', ...started, evaluationAt: '2026-10-06T12:00:00.000Z' }), null],
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx vitest run src/admin/stages.test.ts src/admin/testsPage/nextStep.test.ts`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  3 failed | 41 passed (44)`: `stageHash` and `stageFromHash` do not exist yet (`TypeError: undefined is not a function`, `TypeError: stageFromHash is not a function`), and "starts the grading of an open test in the panel Corectare" still gets the link without `#corectare` (`AssertionError: expected { kind: 'link', …(2) } to deeply equal { kind: 'link', …(2) }`).

- [ ] **Step 5: Edit `src/admin/stages.ts`**

Find this block:

```ts
  current: Stage;
}
```

Replace it with:

```ts
  current: Stage;
}

// The address of each stage's panel on the test page (redesign spec §6):
// "#corectare".
const STAGE_HASHES: Record<StageName, string> = {
  Pregătire: '#pregatire',
  Tipărire: '#tiparire',
  'În clasă': '#in-clasa',
  Corectare: '#corectare',
  Verificare: '#verificare',
  Rezultate: '#rezultate',
};

export function stageHash(name: StageName): string {
  return STAGE_HASHES[name];
}

// The stage an address names; null for no stage or an unknown one.
export function stageFromHash(hash: string): StageName | null {
  const found = Object.entries(STAGE_HASHES).find(([, value]) => value === hash);
  return found ? (found[0] as StageName) : null;
}
```

- [ ] **Step 6: Edit `src/admin/testsPage/nextStep.ts`**

Find this block:

```ts
import { countLabel } from '../../ui/format.ts';
import type { Stage } from '../stages.ts';

```

Replace it with:

```ts
import { countLabel } from '../../ui/format.ts';
import { stageHash, type Stage } from '../stages.ts';

```

- [ ] **Step 7: Edit `src/admin/testsPage/nextStep.ts`**

Find this block:

```ts
// link, or the button that publishes the results on the row. Null: nothing
// to do now.
export type NextStep = { kind: 'link'; label: string; to: string } | { kind: 'publish'; label: string } | null;
```

Replace it with:

```ts
// link, or the button that publishes the results on the row. Null: nothing
// to do now. The grading of an open test starts in the panel Corectare of the
// test page, while the page opens on În clasă (spec §6).
export type NextStep = { kind: 'link'; label: string; to: string } | { kind: 'publish'; label: string } | null;
```

- [ ] **Step 8: Edit `src/admin/testsPage/nextStep.ts`**

Find this block:

```ts
      if (test.status === 'draft') return link('Începe testul');
      return test.evaluationAt === null ? link('Pornește corectarea') : null;
    case 'Corectare':
```

Replace it with:

```ts
      if (test.status === 'draft') return link('Începe testul');
      return test.evaluationAt === null ? link('Pornește corectarea', `${page}${stageHash('Corectare')}`) : null;
    case 'Corectare':
```

- [ ] **Step 9: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  115 passed | 1 skipped (116)`, `Tests  1811 passed | 3 skipped (1814)`.

- [ ] **Step 10: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 11: Commit**

```bash
git add src/admin/stages.ts src/admin/stages.test.ts src/admin/testsPage/nextStep.ts src/admin/testsPage/nextStep.test.ts
git commit -m "Give each stage of a test the address of its panel"
```

### Task 3: The test page in stages

The page of the redesign: the title, the list of the six stages, the panel of the chosen stage with the controls of today moved into it, and Fișa testului.

The old page tests (94, `it.each` rows counted): most keep their words and open their stage by its address (`/teste/6E2-26T1#corectare`), or go to it with `openStage()`; a test that looked for the code as the page heading looks for the title "Fracții". Rewritten (7): "shows the code, state, title, class, and start time" (now "shows the title, its class, its students and its start, and the code and state in Fișa testului"), "starts a draft test and then shows the link and the QR code" (now "… and its link and QR code stay in Fișa testului"), "marks the uploads table selectable only while the test is open" (now "puts checkboxes in the table of Corectare only, while the test is open"), "starts with the upload links hidden, shows them on request, and keeps the choice after a reload" (ruling 2; now "shows the students link only while the test is a draft or open"), "shows a problem of the barem, takes a new barem, and grades anyway" (now "… in Corectare, takes a new barem in Pregătire …"), "says that the robot writes the class analysis, and links to the class report" (now "… in Corectare …, and links to the class report in Rezultate"), "shows the class report button in the head once a result is graded" (now "puts the class report in Rezultate once a result is graded"). New (8): two tests of Fișa testului, "keeps the selection while the teacher looks at another stage", and five in "TestPage stages" (the list and its states; a stage link, which replaces the address, and the next-stage link, which gives the focus to the new heading; an address; a panel kept after a button; the panels of stages that have not come). So the file has 102 tests. In the other files the names stay: the print block tests open `#tiparire`, and "shows the block in the files section, under the test file, whatever the links do" becomes "shows the block in the panel Tipărire, and not with the files of Pregătire"; six GeneratedBarem tests open `#pregatire` or `#corectare`; six tests of the robot line in `TestPagePrint.test.tsx` open `#pregatire`, `#tiparire` or `#in-clasa` (the two after a reopen then go to Tipărire); the Layout test of the QR view no longer clicks "Arată linkurile". `LocationProbe` shows the hash too.

**Files:**
- Create: `src/admin/testPage/StageList.tsx`, `src/admin/testPage/StagePanel.tsx` (the panels, and `TestActions`, `EvaluationState`, `PartialEvaluationNotice` moved from `TestPage.tsx`), `src/admin/testPage/TestSheet.tsx` (Fișa testului, with `RenameTestForm` moved from `TestPage.tsx`)
- Replace: `src/admin/pages/TestPage.tsx`, `src/admin/pages/TestPage.test.tsx`
- Modify: `src/admin/testPage/TestFiles.tsx` (no print block, no heading), `src/admin/testPage/ExerciseListBanner.tsx` (link to Pregătire), `src/admin/testPage/ResultsAccess.tsx` (`h3`), `src/admin/testPage/UploadLink.tsx` (outline copy button), `src/ui/brand.css`, `src/test/renderAdmin.tsx` (`LocationProbe` shows the hash)
- Test: `src/admin/pages/TestPage.test.tsx`, `src/admin/pages/TestPagePrint.test.tsx`, `src/admin/testPage/GeneratedBarem.test.tsx`, `src/admin/testPage/PrintTest.test.tsx`, `src/admin/Layout.test.tsx`

**Interfaces:**
- Consumes: `stagesOf(test: TestSummary): { stages: Stage[]; current: Stage }`, `stageHash`, `stageFromHash` (Task 2); the components of `src/admin/testPage/` as they are.
- Produces: `StageList({ stages, chosen })`, `StagePanel({ stage, test, uploads, robot, showModel, selected, onSelect, onChanged, onRobot })` with `PanelProps`, `TestSheet({ test, onChanged })` and `baremState(test): string`.

- [ ] **Step 1: Edit `src/test/renderAdmin.tsx`**

Find this block:

```tsx

// Shows where the app is, for tests that check a navigation: the path, and
// the notice that a page passed along in the navigation state.
export function LocationProbe() {
```

Replace it with:

```tsx

// Shows where the app is, for tests that check a navigation: the path with its
// search and hash, and the notice that a page passed along in the navigation
// state.
export function LocationProbe() {
```

- [ ] **Step 2: Edit `src/test/renderAdmin.tsx`**

Find this block:

```tsx
      {location.search}
      {state?.notice ? ` | ${state.notice}` : ''}
```

Replace it with:

```tsx
      {location.search}
      {location.hash}
      {state?.notice ? ` | ${state.notice}` : ''}
```

- [ ] **Step 3: Replace `src/admin/pages/TestPage.test.tsx`**

```tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigationType } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api.ts';
import { PDF_TYPE } from '../../../shared/files.ts';
import type { UploadRow } from '../../../shared/api.ts';
import { robotStartMessage } from '../../ui/format.ts';
import { createFakeApi, FAKE_MULTI_TOKEN, FAKE_STARTED_AT, FAKE_TOKEN, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
import { refreshInterval } from './TestPage.tsx';

const uploads = [
  fakeUpload({
    studentId: 10,
    studentName: 'Pop Ion',
    submissionId: 5,
    status: 'submitted',
    fileCount: 3,
    startedAt: '2026-10-06T07:20:00.000Z',
    submittedAt: '2026-10-06T07:40:00.000Z',
    autoSubmitted: true,
  }),
  fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1, startedAt: '2026-10-06T07:25:00.000Z' }),
  fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
];

function apiWith(overrides: Parameters<typeof fakeTest>[0] = {}) {
  return createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
    students: {},
    tests: [fakeTest(overrides, uploads)],
  });
}

// The test page, and the address of each stage's panel (redesign spec §6).
const PAGE = '/teste/6E2-26T1';

// Opens the panel of a stage with its link in the list of stages.
async function openStage(name: string) {
  const stages = await screen.findByRole('navigation', { name: 'Etapele testului' });
  await userEvent.click(within(stages).getByRole('link', { name: new RegExp(`^${name} `) }));
  await screen.findByRole('heading', { level: 2, name });
}

const sheet = () => screen.getByRole('region', { name: 'Fișa testului' });

// How the app came to this address: a stage link replaces it, so Back leaves the page.
function NavigationProbe() {
  return <p data-testid="navigation">{useNavigationType()}</p>;
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('TestPage', () => {
  it('shows the title, its class, its students and its start, and the code and state in Fișa testului', async () => {
    renderAdmin(PAGE, apiWith({ status: 'open', uploadToken: FAKE_TOKEN, startedAt: '2026-10-06T07:15:00.000Z' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Fracții' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
    expect(screen.getByRole('link', { name: 'Clasa 6E2' })).toHaveClass('class-badge', 'class-tone');
    expect(screen.getByText(/3 elevi · început 6 oct\. 2026, 10:15/)).toBeInTheDocument();
    expect(within(sheet()).getByText('6E2-26T1')).toBeInTheDocument();
    expect(within(sheet()).getByText('Deschis')).toBeInTheDocument();
  });

  it('reads the code in any letter case and refuses something else', async () => {
    renderAdmin('/teste/6e2-26t1', apiWith());
    expect(await screen.findByRole('heading', { level: 1, name: 'Fracții' })).toBeInTheDocument();
  });

  it('shows the not-found page for a path that is not a test code', async () => {
    renderAdmin('/teste/abc', apiWith());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('starts a draft test, and its link and QR code stay in Fișa testului', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}#in-clasa`, api);
    expect(await within(await screen.findByRole('region', { name: 'Fișa testului' })).findByLabelText('Linkul pentru elevi')).toHaveValue(
      `${window.location.origin}/u/${FAKE_TOKEN}`,
    );
    expect(screen.getByText('Codul e pe testul tipărit. Elevii trimit lucrările după ce începi testul.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Începe testul' }));
    expect(api.startTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByText('Pentru un elev fără testul tipărit.')).toBeInTheDocument();
    expect(within(sheet()).getByLabelText('Linkul pentru elevi')).toHaveValue(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(within(sheet()).getByTitle('Codul QR al linkului')).toBeInTheDocument();
  });

  it('shows the students link only while the test is a draft or open', async () => {
    for (const status of ['draft', 'open'] as const) {
      const view = renderAdmin(PAGE, apiWith({ status }));
      expect(await screen.findByLabelText('Linkul pentru elevi')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Arată linkurile' })).not.toBeInTheDocument();
      view.unmount();
    }
    for (const status of ['evaluating', 'done'] as const) {
      const view = renderAdmin(PAGE, apiWith({ status }));
      await screen.findByRole('region', { name: 'Fișa testului' });
      expect(screen.queryByLabelText('Linkul pentru elevi')).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('shows the print block on a draft and an open test, and not once the uploads closed', async () => {
    const { unmount } = renderAdmin(`${PAGE}#tiparire`, apiWith());
    await screen.findByRole('heading', { level: 2, name: 'Tipărire' });
    expect(screen.getByText('Testul pentru tipărit:')).toBeInTheDocument();
    unmount();
    const open = renderAdmin(`${PAGE}#tiparire`, apiWith({ status: 'open' }));
    await screen.findByRole('heading', { level: 2, name: 'Tipărire' });
    expect(screen.getByText('Testul pentru tipărit:')).toBeInTheDocument();
    open.unmount();
    renderAdmin(`${PAGE}#tiparire`, apiWith({ status: 'evaluating' }));
    expect(await screen.findByText('Testul s-a dat în clasă.')).toBeInTheDocument();
    expect(screen.queryByText('Testul pentru tipărit:')).not.toBeInTheDocument();
  });

  it('lets the teacher download the test with the QR code before she starts it', async () => {
    renderAdmin(
      `${PAGE}#tiparire`,
      apiWith({ files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null }, print: { status: 'ready', fromWord: false } }),
    );
    expect(await screen.findByRole('link', { name: 'Descarcă testul cu cod QR' })).toBeInTheDocument();
    expect(screen.getByText('Poți tipări testul de acum. Elevii încarcă lucrările după ce începi testul.')).toBeInTheDocument();
    expect(within(sheet()).getByRole('link', { name: 'Testul cu cod QR' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/print');
    await openStage('În clasă');
    expect(screen.getByText(/Începe-l în ziua testului/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Începe testul' })).toBeInTheDocument();
  });

  it('starts no robot at Start when the print PDF is made already', async () => {
    const api = apiWith({ files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null }, print: { status: 'ready', fromWord: false } });
    renderAdmin(`${PAGE}#in-clasa`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Începe testul' }));
    expect(await screen.findByText('Deschis')).toBeInTheDocument();
    expect(screen.queryByText(robotStartMessage('dispatched'))).not.toBeInTheDocument();
  });

  it('says the robot started after Start test when the print PDF still waits', async () => {
    renderAdmin(`${PAGE}#in-clasa`, apiWith({ files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null } }));
    await userEvent.click(await screen.findByRole('button', { name: 'Începe testul' }));
    expect(await screen.findByText(robotStartMessage('dispatched'))).toBeInTheDocument();
  });

  it('gives an old draft its link with its test file, so its QR test is made without another click', async () => {
    const api = apiWith({ uploadToken: null });
    renderAdmin(`${PAGE}#tiparire`, api);
    expect(await screen.findByText('Încarcă testul ca să primești varianta cu cod QR.')).toBeInTheDocument();
    await openStage('Pregătire');
    const file = new File(['%PDF-1.7'], 'Test.pdf', { type: PDF_TYPE });
    await userEvent.upload(screen.getByLabelText('Încarcă testul'), file);
    expect(await screen.findByRole('link', { name: 'Test.pdf' })).toBeInTheDocument();
    await openStage('Tipărire');
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pregătește testul cu cod QR' })).not.toBeInTheDocument();
  });

  it('says the robot started after Start test of a draft made before tests got their link', async () => {
    renderAdmin(`${PAGE}#in-clasa`, apiWith({ uploadToken: null, files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null } }));
    await userEvent.click(await screen.findByRole('button', { name: 'Începe testul' }));
    expect(await screen.findByText(robotStartMessage('dispatched'))).toBeInTheDocument();
  });

  it('prepares the test with the QR code of a draft made before tests got their link', async () => {
    const api = apiWith({ uploadToken: null, files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null } });
    renderAdmin(`${PAGE}#tiparire`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Pregătește testul cu cod QR' }));
    expect(api.retryPrint).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
    expect(screen.getByText(robotStartMessage('dispatched'))).toBeInTheDocument();
  });

  it('copies the link', async () => {
    const user = userEvent.setup();
    renderAdmin(PAGE, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    await user.click(await screen.findByRole('button', { name: 'Copiază linkul' }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(screen.getByRole('status')).toHaveTextContent('Copiat!');
  });

  it('shows the QR code on the whole screen and closes it with Escape', async () => {
    renderAdmin(PAGE, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    await userEvent.click(await screen.findByRole('button', { name: 'Arată codul QR pe tot ecranul' }));
    const dialog = screen.getByRole('dialog', { name: 'Codul QR pentru elevi' });
    expect(within(dialog).getByText(`${window.location.origin}/u/${FAKE_TOKEN}`)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Închide' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('uploads the test file and links to it', async () => {
    const api = apiWith();
    renderAdmin(PAGE, api);
    const file = new File(['%PDF-1.7'], 'Test.pdf', { type: PDF_TYPE });
    await userEvent.upload(await screen.findByLabelText('Încarcă testul'), file);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'test', file);
    expect(await screen.findByRole('link', { name: 'Test.pdf' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/files/test');
    expect(screen.getByLabelText('Înlocuiește testul')).toBeInTheDocument();
    expect(within(sheet()).getByRole('link', { name: 'Testul' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/files/test');
  });

  it('drops "Fără confirmare" once the upload is graded', async () => {
    const graded = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', grade: 8, autoSubmitted: true })];
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 1 }],
      students: {},
      tests: [fakeTest({ status: 'done' }, graded)],
    });
    renderAdmin(PAGE, api);
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    expect(within(pop).queryByText('Fără confirmare')).not.toBeInTheDocument();
  });

  it('locks the files while the test is being graded', async () => {
    renderAdmin(`${PAGE}#pregatire`, apiWith({ status: 'evaluating' }));
    expect(await screen.findByLabelText('Încarcă baremul')).toBeDisabled();
  });

  it('lists the uploads of the students', async () => {
    renderAdmin(`${PAGE}#in-clasa`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN, submittedCount: 1, studentCount: 3 }));
    expect(await screen.findByRole('heading', { name: 'Încărcări · trimise 1 din 3' })).toBeInTheDocument();
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    expect(within(pop).getByText('Trimis')).toBeInTheDocument();
    expect(within(pop).getByText('Fără confirmare')).toBeInTheDocument();
    expect(within(pop).getByText('6 oct. 2026, 10:40')).toBeInTheDocument();
    expect(within(pop).getByRole('link', { name: 'Vezi lucrarea' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/5');
    const marin = screen.getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
    expect(within(marin).getByText('Nu a trimis')).toBeInTheDocument();
    expect(within(marin).queryByRole('button', { name: 'Resetează' })).not.toBeInTheDocument();
  });

  it('puts checkboxes in the table of Corectare only, while the test is open', async () => {
    const { unmount } = renderAdmin(`${PAGE}#corectare`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    const openTable = await screen.findByRole('table', { name: 'Încărcările elevilor' });
    expect(openTable).toHaveClass('uploads', 'is-selectable');
    await openStage('În clasă');
    expect(screen.getByRole('table', { name: 'Încărcările elevilor' })).not.toHaveClass('is-selectable');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    unmount();
    renderAdmin(`${PAGE}#corectare`, apiWith({ status: 'done' }));
    const doneTable = await screen.findByRole('table', { name: 'Încărcările elevilor' });
    expect(doneTable).toHaveClass('uploads');
    expect(doneTable).not.toHaveClass('is-selectable');
  });

  it('labels the upload cells with the column names for narrow screens', async () => {
    renderAdmin(`${PAGE}#corectare`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    const labels = within(pop)
      .getAllByRole('cell')
      .map((cell) => cell.getAttribute('data-label'));
    expect(labels).toEqual([null, 'Stare', 'Fișiere', 'Ora', 'Nota', 'De verificat', null]);
  });

  it('has no Model column unless the setting is on', async () => {
    renderAdmin(`${PAGE}#in-clasa`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    await screen.findByRole('rowheader', { name: 'Pop Ion' });
    expect(screen.queryByRole('columnheader', { name: 'Model' })).not.toBeInTheDocument();
  });

  it('shows the model and effort of each grading after Nota when the setting is on', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, model: 'claude-opus-5-5', effort: 'medium' }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 2, grade: 7, model: 'sonnet', effort: null }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
    ];
    const detail = fakeTest({ status: 'done' }, rows);
    renderAdmin(PAGE, createFakeApi({ classes: [], students: {}, tests: [{ ...detail, showModel: true }] }));
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers.indexOf('Model')).toBe(headers.indexOf('Nota') + 1);
    expect(headers.indexOf('De verificat')).toBe(headers.indexOf('Model') + 1);
    const cell = within(pop).getByText('claude-opus-5-5 · medium');
    expect(cell).toHaveAttribute('data-label', 'Model');
    const stan = screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    expect(within(stan).getByText('sonnet')).toHaveAttribute('data-label', 'Model');
    const marin = screen.getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
    expect(marin.querySelector('[data-label="Model"]')).toHaveTextContent('—');
  });

  it('marks only the selectable rows for the narrow-screen layout', async () => {
    renderAdmin(`${PAGE}#corectare`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    expect(pop).toHaveClass('has-select');
    const stan = screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    expect(stan).toHaveClass('has-select');
    const marin = screen.getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
    expect(marin).not.toHaveClass('has-select');
  });

  it('resets an upload only after the teacher confirms', async () => {
    const api = apiWith({ status: 'open', uploadToken: FAKE_TOKEN });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAdmin(`${PAGE}#in-clasa`, api);
    const stan = (await screen.findByRole('rowheader', { name: 'Stan Eva' })).closest('tr')!;
    await userEvent.click(within(stan).getByRole('button', { name: 'Resetează' }));
    expect(api.resetSubmission).not.toHaveBeenCalled();
    await userEvent.click(within(stan).getByRole('button', { name: 'Resetează' }));
    expect(confirm).toHaveBeenLastCalledWith('Ștergi încărcarea elevului Stan Eva? Elevul o poate lua de la capăt.');
    expect(api.resetSubmission).toHaveBeenCalledWith(6, '2026-10-06T07:25:00.000Z');
    expect(await within(stan).findByText('Nu a trimis')).toBeInTheDocument();
  });

  it('keeps the page when a refresh fails, and says why', async () => {
    // Its own rows: the shared rows above were already reset by the test before.
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [
        fakeTest({ status: 'open', uploadToken: FAKE_TOKEN }, [
          fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1, startedAt: '2026-10-06T07:25:00.000Z' }),
        ]),
      ],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#in-clasa`, api);
    const stan = (await screen.findByRole('rowheader', { name: 'Stan Eva' })).closest('tr')!;
    vi.mocked(api.getTest).mockRejectedValue(new ApiError(503, 'unavailable', 'Serverul nu răspunde. Încearcă din nou.'));
    await userEvent.click(within(stan).getByRole('button', { name: 'Resetează' }));
    expect(await screen.findByText('Serverul nu răspunde. Încearcă din nou.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Fracții' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'În clasă' })).toBeInTheDocument();
    expect(screen.getByLabelText('Linkul pentru elevi')).toBeInTheDocument();
  });

  it('reopens the uploads of a closed test', async () => {
    const api = apiWith({ status: 'done' });
    renderAdmin(`${PAGE}#in-clasa`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redeschide încărcarea' }));
    expect(api.reopenTest).toHaveBeenCalledWith('6E2-26T1');
  });

  it('archives a finished test and offers to take it out of the archive', async () => {
    const api = apiWith({ status: 'done' });
    renderAdmin(PAGE, api);
    expect(await screen.findByText('Testul nu mai apare în lista clasei și în Teste. Îl găsești cu „Arată și testele arhivate”.')).toBeInTheDocument();
    expect(screen.queryByText('Arhivat')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Arhivează testul' }));
    expect(api.setTestArchived).toHaveBeenCalledWith('6E2-26T1', true);
    expect(await within(sheet()).findByText('Arhivat')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arhivează testul' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Scoate din arhivă' }));
    expect(api.setTestArchived).toHaveBeenLastCalledWith('6E2-26T1', false);
    expect(await screen.findByRole('button', { name: 'Arhivează testul' })).toBeInTheDocument();
    expect(screen.queryByText('Arhivat')).not.toBeInTheDocument();
  });

  it('offers no archive while the test is not finished', async () => {
    for (const status of ['draft', 'open', 'evaluating'] as const) {
      const view = renderAdmin(PAGE, apiWith({ status }));
      expect(await screen.findByRole('button', { name: 'Șterge testul' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Arhivează testul' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Scoate din arhivă' })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('says why the archive was refused', async () => {
    const api = apiWith({ status: 'done' });
    vi.mocked(api.setTestArchived).mockRejectedValueOnce(new ApiError(409, 'not_done', 'Poți arhiva un test după ce s-a terminat corectarea.'));
    renderAdmin(PAGE, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Arhivează testul' }));
    expect(await screen.findByText('Poți arhiva un test după ce s-a terminat corectarea.')).toBeInTheDocument();
  });

  it('renames the test', async () => {
    const api = apiWith();
    renderAdmin(PAGE, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redenumește testul' }));
    const input = within(sheet()).getByLabelText('Titlu nou');
    await userEvent.clear(input);
    await userEvent.type(input, 'Teză');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.renameTest).toHaveBeenCalledWith('6E2-26T1', 'Teză');
    expect(await screen.findByRole('heading', { level: 1, name: 'Teză' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redenumește testul' })).toBeInTheDocument();
  });

  it('deletes the test after the teacher confirms and goes to the test list', async () => {
    const api = apiWith();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(PAGE, api, <LocationProbe />);
    await userEvent.click(await screen.findByRole('button', { name: 'Șterge testul' }));
    expect(api.deleteTest).toHaveBeenCalledWith('6E2-26T1');
    await expectLocation(/^\/$/);
  });

  it('warns before deleting a test whose QR code may be printed already', async () => {
    const api = apiWith({ files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null }, print: { status: 'ready', fromWord: false } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin(PAGE, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Șterge testul' }));
    expect(confirm).toHaveBeenCalledWith(
      'Ștergi testul 6E2-26T1? Se șterg și toate lucrările încărcate. Codurile QR de pe testele tipărite nu vor mai funcționa.',
    );
    expect(api.deleteTest).not.toHaveBeenCalled();
  });

  it('shows the notice that the new-test page passed along', async () => {
    renderAdmin({ pathname: PAGE, state: { notice: 'Testul a fost creat, dar fișierul Test.pdf nu s-a încărcat.' } }, apiWith());
    expect(await screen.findByRole('alert')).toHaveTextContent('Testul a fost creat, dar fișierul Test.pdf nu s-a încărcat.');
  });

  it('creates the multi-upload link on demand and then shows it', async () => {
    const api = apiWith({ status: 'open', uploadToken: FAKE_TOKEN });
    renderAdmin(`${PAGE}#in-clasa`, api);
    expect(await screen.findByLabelText('Linkul pentru elevi')).toHaveValue(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(screen.queryByLabelText('Linkul pentru mai multe încărcări')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Creează linkul pentru mai multe încărcări' }));
    expect(api.createMultiUploadLink).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByLabelText('Linkul pentru mai multe încărcări')).toHaveValue(
      `${window.location.origin}/u/${FAKE_MULTI_TOKEN}`,
    );
  });

  it('shows both upload links when the multi-upload link already exists', async () => {
    renderAdmin(`${PAGE}#in-clasa`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN, multiUploadToken: FAKE_MULTI_TOKEN }));
    expect(await screen.findByLabelText('Linkul pentru elevi')).toHaveValue(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(screen.getByLabelText('Linkul pentru mai multe încărcări')).toHaveValue(`${window.location.origin}/u/${FAKE_MULTI_TOKEN}`);
    expect(screen.queryByRole('button', { name: 'Creează linkul pentru mai multe încărcări' })).not.toBeInTheDocument();
  });

  it('shows the facts and files of the test in Fișa testului', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
    ];
    const test = fakeTest(
      {
        status: 'done',
        startedAt: '2026-10-06T07:15:00.000Z',
        files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: { name: 'Barem.pdf', type: PDF_TYPE } },
        print: { status: 'ready', fromWord: false },
      },
      rows,
    );
    renderAdmin(PAGE, createFakeApi({ classes: [], students: {}, tests: [test] }));
    const card = await screen.findByRole('region', { name: 'Fișa testului' });
    const fact = (name: string) => within(card).getByText(name, { selector: 'dt' }).nextElementSibling;
    expect(fact('Clasa')).toHaveTextContent('Clasa 6E2 · 2 elevi');
    expect(fact('Codul')).toHaveTextContent('6E2-26T1');
    expect(fact('Starea')).toHaveTextContent('Corectat');
    expect(fact('Început')).toHaveTextContent('6 oct. 2026, 10:15');
    expect(fact('Au trimis')).toHaveTextContent('2 din 2');
    expect(fact('Baremul')).toHaveTextContent('activ');
    expect(fact('Media testului')).toHaveTextContent('8,5');
    expect(within(card).getByRole('link', { name: 'Testul' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/files/test');
    expect(within(card).getByRole('link', { name: 'Baremul' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/files/barem');
    expect(within(card).getByRole('link', { name: 'Testul cu cod QR' })).toHaveAttribute('download');
  });

  it('says in Fișa testului what a draft does not have yet', async () => {
    renderAdmin(PAGE, apiWith());
    const card = await screen.findByRole('region', { name: 'Fișa testului' });
    const fact = (name: string) => within(card).getByText(name, { selector: 'dt' }).nextElementSibling;
    expect(fact('Început')).toHaveTextContent('neînceput');
    expect(fact('Baremul')).toHaveTextContent('lipsește');
    expect(within(card).queryByText('Au trimis')).not.toBeInTheDocument();
    expect(within(card).queryByText('Media testului')).not.toBeInTheDocument();
    expect(within(card).getAllByText('lipsește')).toHaveLength(3);
    expect(within(card).queryByRole('link', { name: 'Testul cu cod QR' })).not.toBeInTheDocument();
    expect(screen.getByText(/3 elevi · ciornă/)).toBeInTheDocument();
  });
});

describe('TestPage stages', () => {
  const flagged = [
    fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, flagCount: 2 }),
    fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
  ];

  function doneApi() {
    return createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [fakeTest({ status: 'done', startedAt: '2026-10-06T07:15:00.000Z', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, structuredClone(flagged))],
    });
  }

  it('lists the six stages with their state, and opens the current one', async () => {
    renderAdmin(PAGE, doneApi());
    const stages = await screen.findByRole('navigation', { name: 'Etapele testului' });
    const links = within(stages).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Pregătire gata',
      'Tipărire gata',
      'În clasă gata',
      'Corectare gata',
      'Verificare te așteaptă: 2 puncte nesigure',
      'Rezultate urmează',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/teste/6E2-26T1#pregatire',
      '/teste/6E2-26T1#tiparire',
      '/teste/6E2-26T1#in-clasa',
      '/teste/6E2-26T1#corectare',
      '/teste/6E2-26T1#verificare',
      '/teste/6E2-26T1#rezultate',
    ]);
    expect(links.map((link) => link.closest('li')!.className)).toEqual(['is-done', 'is-done', 'is-done', 'is-done', 'is-wait', 'is-later']);
    expect(links[4]).toHaveAttribute('aria-current', 'step');
    expect(links.filter((link) => link.hasAttribute('aria-current'))).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Verificare' })).toBeInTheDocument();
    expect(screen.getByText('Punctele nesigure te așteaptă pe tine. Accepți sau schimbi punctajul.')).toBeInTheDocument();
  });

  it('opens the stage a link names, keeps it in the address, and moves on with the next-stage link', async () => {
    renderAdmin(
      PAGE,
      doneApi(),
      <>
        <LocationProbe />
        <NavigationProbe />
      </>,
    );
    await openStage('Pregătire');
    await expectLocation('/teste/6E2-26T1#pregatire');
    // The stage replaces the address: Back leaves the test page.
    expect(screen.getByTestId('navigation')).toHaveTextContent('REPLACE');
    const stages = screen.getByRole('navigation', { name: 'Etapele testului' });
    expect(within(stages).getByRole('link', { name: /^Pregătire / })).toHaveAttribute('aria-current', 'step');
    expect(within(stages).getByRole('link', { name: /^Verificare / })).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('heading', { level: 2, name: 'Verificare' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Următoarea etapă: Tipărire →' }));
    // The new panel's heading takes the focus, so the page shows its top.
    expect(await screen.findByRole('heading', { level: 2, name: 'Tipărire' })).toHaveFocus();
    await expectLocation('/teste/6E2-26T1#tiparire');
    // A click on the list of stages keeps the focus on its link.
    const corectare = within(stages).getByRole('link', { name: /^Corectare / });
    await userEvent.click(corectare);
    expect(await screen.findByRole('heading', { level: 2, name: 'Corectare' })).not.toHaveFocus();
    expect(corectare).toHaveFocus();
  });

  it('opens the stage the address names, and the current stage for an unknown address', async () => {
    const { unmount } = renderAdmin(`${PAGE}#in-clasa`, doneApi());
    expect(await screen.findByRole('heading', { level: 2, name: 'În clasă' })).toBeInTheDocument();
    unmount();
    renderAdmin(`${PAGE}#nimic`, doneApi());
    expect(await screen.findByRole('heading', { level: 2, name: 'Verificare' })).toBeInTheDocument();
  });

  it('keeps the panel open when a button moves the test to another stage', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
      students: {},
      tests: [
        fakeTest({
          files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: { name: 'Barem.docx', type: PDF_TYPE } },
          barem: { request: 'none', unchecked: true },
          print: { status: 'ready', fromWord: false },
        }),
      ],
    });
    renderAdmin(PAGE, api);
    const stages = await screen.findByRole('navigation', { name: 'Etapele testului' });
    expect(within(stages).getByRole('link', { name: 'Pregătire te așteaptă: baremul de verificat' })).toHaveAttribute('aria-current', 'step');
    await userEvent.click(screen.getByRole('button', { name: 'Am verificat baremul' }));
    // The test is ready for the class now, and its current stage is În clasă.
    expect(await within(stages).findByRole('link', { name: 'Pregătire gata' })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('heading', { level: 2, name: 'Pregătire' })).toBeInTheDocument();
  });

  it('says what a stage that has not come yet will hold', async () => {
    renderAdmin(`${PAGE}#corectare`, apiWith());
    expect(await screen.findByText(/^Corectarea începe după ce elevii trimit lucrările\./)).toBeInTheDocument();
    await openStage('Verificare');
    expect(screen.getByText('Punctele nesigure apar după ce se corectează lucrările.')).toBeInTheDocument();
    await openStage('Rezultate');
    expect(screen.getByText('Rezultatele se publică după corectare.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('TestPage and a test started by mistake', () => {
  const noFiles = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'uploading', fileCount: 0 }), fakeUpload({ studentId: 12, studentName: 'Marin Dan' })];

  function openApi(rows: UploadRow[]) {
    return createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [fakeTest({ status: 'open', startedAt: '2026-10-05T17:30:00.000Z' }, structuredClone(rows))],
    });
  }

  it('stops an open test while no student has uploaded a file, after a confirmation', async () => {
    const api = openApi(noFiles);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#in-clasa`, api);
    expect(await screen.findByText(/început 5 oct\. 2026, 20:30/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Oprește testul' }));
    expect(confirm).toHaveBeenCalledWith(
      'Oprești testul? Elevii nu mai pot încărca lucrările până îl începi din nou, iar data testului se șterge.',
    );
    expect(api.stopTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('button', { name: 'Începe testul' })).toBeInTheDocument();
    expect(screen.getByText('Ciornă')).toBeInTheDocument();
    expect(screen.queryByText(/început 5 oct/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Oprește testul' })).not.toBeInTheDocument();
  });

  it('keeps the test open when the teacher says no', async () => {
    const api = openApi(noFiles);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin(`${PAGE}#in-clasa`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Oprește testul' }));
    expect(api.stopTest).not.toHaveBeenCalled();
  });

  it('says in the confirmation that a scheduled evaluation is cancelled too', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [fakeTest({ status: 'open', evaluationAt: '2026-10-06T09:00:00.000Z' }, structuredClone(noFiles))],
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin(`${PAGE}#in-clasa`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Oprește testul' }));
    expect(confirm).toHaveBeenCalledWith(
      'Oprești testul? Elevii nu mai pot încărca lucrările până îl începi din nou, iar data testului se șterge. Evaluarea programată se anulează.',
    );
  });

  it('offers no stop on a test reopened after an evaluation', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [fakeTest({ status: 'open', evaluationStartedAt: '2026-10-06T09:00:00.000Z' }, structuredClone(noFiles))],
    });
    renderAdmin(`${PAGE}#in-clasa`, api);
    expect(await screen.findByText(/^Elevii trimit lucrările\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Oprește testul' })).not.toBeInTheDocument();
  });

  it('offers no stop once a student has uploaded a file', async () => {
    renderAdmin(`${PAGE}#in-clasa`, openApi(uploads));
    expect(await screen.findByText(/^Elevii trimit lucrările\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Oprește testul' })).not.toBeInTheDocument();
  });

  it('says why the API refused the stop', async () => {
    const api = openApi(noFiles);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.stopTest.mockRejectedValueOnce(
      new ApiError(409, 'has_uploads', 'Un elev a încărcat deja lucrarea, așa că testul nu mai poate fi oprit.'),
    );
    renderAdmin(`${PAGE}#in-clasa`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Oprește testul' }));
    expect(await screen.findByText('Un elev a încărcat deja lucrarea, așa că testul nu mai poate fi oprit.')).toBeInTheDocument();
  });
});

describe('refreshInterval', () => {
  it('asks for news every 10 seconds only while uploads or grading go on', () => {
    expect(refreshInterval('open')).toBe(10_000);
    expect(refreshInterval('evaluating')).toBe(10_000);
    expect(refreshInterval('draft')).toBe(false);
    expect(refreshInterval('done')).toBe(false);
    expect(refreshInterval(undefined)).toBe(false);
    expect(refreshInterval('draft', 'requested')).toBe(10_000);
    expect(refreshInterval('draft', 'failed')).toBe(false);
    // A draft whose print PDF the robot is making.
    expect(refreshInterval('draft', 'none', true)).toBe(10_000);
  });
});

describe('TestPage evaluation', () => {
  const FILES = { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: { name: 'Barem.pdf', type: PDF_TYPE } };
  const NOW = new Date('2026-10-08T07:00:00.000Z');

  function evaluationApi(overrides: Parameters<typeof fakeTest>[0], rows = uploads, lastCheckAt: string | null = null) {
    const detail = fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, files: FILES, print: { status: 'ready', fromWord: false }, ...overrides }, structuredClone(rows));
    detail.robot.lastCheckAt = lastCheckAt;
    return createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [detail],
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts the evaluation now for the selected uploads, after the teacher confirms', async () => {
    const api = evaluationApi({});
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAdmin(`${PAGE}#corectare`, api);
    const start = await screen.findByRole('button', { name: 'Pornește evaluarea acum' });
    // Nothing selected yet: the button stays off.
    expect(start).toBeDisabled();
    expect(screen.getByText('Selectează cel puțin o lucrare cu fișiere din tabel.')).toBeInTheDocument();
    // Select one upload with files (its row checkbox, not the shared header).
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    await userEvent.click(within(pop).getByLabelText('Selectează lucrarea elevului Pop Ion'));
    expect(start).toBeEnabled();
    await userEvent.click(start);
    expect(api.evaluateTest).not.toHaveBeenCalled();
    await userEvent.click(start);
    expect(confirm).toHaveBeenLastCalledWith(
      'Pornești evaluarea acum pentru 1 lucrare? Elevii nu mai pot încărca după asta. Lucrările neselectate cu fișiere așteaptă o evaluare ulterioară.',
    );
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', undefined, [5]);
    expect(await screen.findByText('Se corectează', { selector: '.status' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.');
    expect(screen.getByText(/^Robotul corectează lucrările trimise\. Evaluarea a pornit la 8 oct\. 2026, 10:00\.$/)).toBeInTheDocument();
    expect(screen.getByText('Robotul nu a verificat încă dacă are lucrări de corectat.')).toBeInTheDocument();
    expect(screen.getByText('Corectarea poate întârzia.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Linkul pentru elevi')).not.toBeInTheDocument();
  });

  it('keeps the selection while the teacher looks at another stage', async () => {
    const api = evaluationApi({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#corectare`, api);
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    await userEvent.click(within(pop).getByLabelText('Selectează lucrarea elevului Pop Ion'));
    await openStage('În clasă');
    await openStage('Corectare');
    expect(screen.getByLabelText('Selectează lucrarea elevului Pop Ion')).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Pornește evaluarea acum' }));
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', undefined, [5]);
  });

  it('selects only the uploads with files for the evaluation', async () => {
    const rows = [
      fakeUpload({
        studentId: 10,
        studentName: 'Pop Ion',
        submissionId: 5,
        status: 'submitted',
        fileCount: 3,
        startedAt: '2026-10-06T07:20:00.000Z',
        submittedAt: '2026-10-06T07:40:00.000Z',
      }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1, startedAt: '2026-10-06T07:25:00.000Z' }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
    ];
    renderAdmin(`${PAGE}#corectare`, evaluationApi({}, rows));
    const start = await screen.findByRole('button', { name: 'Pornește evaluarea acum' });
    expect(start).toBeDisabled();
    // The student without files has no checkbox; the graded one cannot be picked.
    const marin = screen.getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
    expect(within(marin).queryByRole('checkbox')).not.toBeInTheDocument();
    // The header checkbox selects every upload with files, and clears them again.
    await userEvent.click(screen.getByLabelText('Selectează toate lucrările cu fișiere'));
    expect(start).toBeEnabled();
    await userEvent.click(screen.getByLabelText('Selectează toate lucrările cu fișiere'));
    expect(start).toBeDisabled();
    // One row at a time works too.
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    await userEvent.click(within(pop).getByLabelText('Selectează lucrarea elevului Pop Ion'));
    expect(start).toBeEnabled();
  });

  it('leaves the graded uploads out of the selection', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'submitted', fileCount: 1 }),
    ];
    const api = evaluationApi({ status: 'open' }, rows);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#corectare`, api);
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    expect(within(pop).queryByRole('checkbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Selectează toate lucrările cu fișiere'));
    await userEvent.click(screen.getByRole('button', { name: 'Pornește evaluarea acum' }));
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', undefined, [6]);
  });

  it('offers "Marchează ca terminat" in place of the start button when every sent paper is graded', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
    ];
    const api = evaluationApi({ evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, rows);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAdmin(`${PAGE}#corectare`, api);
    expect(await screen.findByText('✓ Corectat complet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pornește evaluarea acum' })).not.toBeInTheDocument();
    expect(screen.queryByText('Selectează cel puțin o lucrare cu fișiere din tabel.')).not.toBeInTheDocument();
    const finish = screen.getByRole('button', { name: 'Marchează ca terminat' });
    await userEvent.click(finish);
    expect(api.finishTest).not.toHaveBeenCalled();
    await userEvent.click(finish);
    expect(api.finishTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByText(/^Corectarea s-a terminat\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marchează ca terminat' })).not.toBeInTheDocument();
  });

  it('keeps the start button while a sent paper waits for grading', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'submitted', fileCount: 1 }),
    ];
    renderAdmin(`${PAGE}#corectare`, evaluationApi({}, rows));
    expect(await screen.findByRole('button', { name: 'Pornește evaluarea acum' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Marchează ca terminat' })).not.toBeInTheDocument();
    expect(screen.queryByText('✓ Corectat complet')).not.toBeInTheDocument();
  });

  it('saves extra comments for the barem', async () => {
    const api = evaluationApi({});
    renderAdmin(`${PAGE}#pregatire`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Adaugă comentarii' }));
    expect(screen.getByText('Robotul le citește ca parte din barem.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Comentarii la barem'), 'Acceptă și metoda cu proporții.');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează comentariile' }));
    expect(api.saveBaremNotes).toHaveBeenCalledWith('6E2-26T1', 'Acceptă și metoda cu proporții.');
    expect(await screen.findByText(/Acceptă și metoda cu proporții/)).toBeInTheDocument();
  });

  it('says when the finished evaluation was partial', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'submitted', fileCount: 1 }),
    ];
    renderAdmin(`${PAGE}#corectare`, evaluationApi({ status: 'done', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, rows));
    expect(await screen.findByText('Corectarea s-a terminat. Evaluarea a pornit la 7 oct. 2026, 11:00.')).toBeInTheDocument();
    expect(screen.getByText('Evaluare parțială.')).toBeInTheDocument();
    expect(screen.getByText(/1 lucrare cu fișiere nu a fost corectată/)).toBeInTheDocument();
  });

  it('says nothing partial when every upload with files was graded', async () => {
    const rows = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 })];
    renderAdmin(`${PAGE}#corectare`, evaluationApi({ status: 'done', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, rows));
    expect(await screen.findByText('Corectarea s-a terminat. Evaluarea a pornit la 7 oct. 2026, 11:00.')).toBeInTheDocument();
    expect(screen.queryByText('Evaluare parțială.')).not.toBeInTheDocument();
  });

  it('says what the evaluation still needs', async () => {
    const empty = [fakeUpload({ studentId: 12, studentName: 'Marin Dan' })];
    renderAdmin(`${PAGE}#corectare`, evaluationApi({ files: { test: FILES.test, barem: null } }, empty));
    expect(await screen.findByRole('button', { name: 'Pornește evaluarea acum' })).toBeDisabled();
    expect(screen.getByText('Ca să pornești evaluarea: Încarcă baremul. Niciun elev nu a încărcat încă fișiere.')).toBeInTheDocument();
    expect(screen.getByLabelText('Sau pornește evaluarea automat la')).toBeDisabled();
  });

  it("schedules the evaluation in Romania's time, and cancels the schedule", async () => {
    const api = evaluationApi({});
    renderAdmin(`${PAGE}#corectare`, api);
    const input = await screen.findByLabelText('Sau pornește evaluarea automat la');
    expect(input).toHaveAttribute('min', '2026-10-08T10:00');
    expect(input).toHaveAttribute('max', '2026-12-07T09:00');
    fireEvent.change(input, { target: { value: '2026-10-20T10:15' } });
    await userEvent.click(screen.getByRole('button', { name: 'Programează' }));
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', '2026-10-20T07:15:00.000Z');
    expect(await screen.findByText(/^Evaluarea pornește automat la 20 oct\. 2026, 10:15\./)).toBeInTheDocument();
    expect(screen.getByText('Robotul nu a verificat încă dacă are lucrări de corectat.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Anulează programarea' }));
    expect(api.cancelSchedule).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByLabelText('Sau pornește evaluarea automat la')).toHaveValue('');
    expect(screen.queryByText(/Robotul nu a verificat/)).not.toBeInTheDocument();
  });

  it('shows a problem of the barem in Corectare, takes a new barem in Pregătire, and grades anyway', async () => {
    const message = 'Punctajele din barem dau 9, dar totalul este 10.';
    const api = evaluationApi({ status: 'evaluating', exerciseList: { status: 'problem', message } });
    renderAdmin(`${PAGE}#corectare`, api);
    expect(await screen.findByText(message)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Înlocuiește baremul' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Pregătire' })).toBeInTheDocument();
    expect(screen.getByLabelText('Înlocuiește baremul')).toBeEnabled();
    await openStage('Corectare');
    await userEvent.click(screen.getByRole('button', { name: 'Folosește oricum' }));
    expect(api.acceptExerciseList).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.');
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument());
    await openStage('Pregătire');
    expect(screen.getByLabelText('Înlocuiește baremul')).toBeDisabled();
  });

  it('asks before replacing the barem and keeps it on Renunță', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const api = evaluationApi({});
    renderAdmin(`${PAGE}#pregatire`, api);
    const input = await screen.findByLabelText('Înlocuiește baremul');
    await userEvent.upload(input, new File(['%PDF-1.7'], 'nou.pdf', { type: PDF_TYPE }));
    expect(window.confirm).toHaveBeenCalledWith('Înlocuiești baremul existent cu nou.pdf?');
    expect(api.uploadTestFile).not.toHaveBeenCalled();
    expect(input).toHaveValue('');
    expect(screen.getByRole('link', { name: 'Barem.pdf' })).toBeInTheDocument();
  });

  it('replaces the barem when the teacher confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = evaluationApi({});
    renderAdmin(`${PAGE}#pregatire`, api);
    const file = new File(['%PDF-1.7'], 'nou.pdf', { type: PDF_TYPE });
    await userEvent.upload(await screen.findByLabelText('Înlocuiește baremul'), file);
    expect(api.uploadTestFile).toHaveBeenCalledTimes(1);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'barem', file);
  });

  it('does not ask for the first barem', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const api = evaluationApi({ files: { test: FILES.test, barem: null } });
    renderAdmin(`${PAGE}#pregatire`, api);
    await userEvent.upload(await screen.findByLabelText('Încarcă baremul'), new File(['%PDF-1.7'], 'nou.pdf', { type: PDF_TYPE }));
    expect(confirm).not.toHaveBeenCalled();
    expect(api.uploadTestFile).toHaveBeenCalledTimes(1);
  });

  it('does not ask before replacing the test file', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const api = evaluationApi({});
    renderAdmin(`${PAGE}#pregatire`, api);
    await userEvent.upload(await screen.findByLabelText('Înlocuiește testul'), new File(['%PDF-1.7'], 'nou.pdf', { type: PDF_TYPE }));
    expect(confirm).not.toHaveBeenCalled();
    expect(api.uploadTestFile).toHaveBeenCalledTimes(1);
  });

  it('takes a new barem during evaluation and says when the robot starts', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const message = 'Punctajele din barem dau 9, dar totalul este 10.';
    const api = evaluationApi({ status: 'evaluating', exerciseList: { status: 'problem', message } });
    renderAdmin(`${PAGE}#pregatire`, api);
    const file = new File(['%PDF-1.7'], 'Barem nou.pdf', { type: PDF_TYPE });
    await userEvent.upload(await screen.findByLabelText('Înlocuiește baremul'), file);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'barem', file);
    expect(await screen.findByText('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Înlocuiește baremul')).toBeDisabled());
    await openStage('Corectare');
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it('takes a new barem on an open test without a robot message', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const message = 'Punctajele din barem dau 9, dar totalul este 10.';
    const api = evaluationApi({ exerciseList: { status: 'problem', message } });
    renderAdmin(`${PAGE}#pregatire`, api);
    const file = new File(['%PDF-1.7'], 'Barem nou.pdf', { type: PDF_TYPE });
    await userEvent.upload(await screen.findByLabelText('Înlocuiește baremul'), file);
    expect(await screen.findByRole('link', { name: 'Barem nou.pdf' })).toBeInTheDocument();
    expect(screen.queryByText(/^Robotul pornește/)).not.toBeInTheDocument();
    await openStage('Corectare');
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it('accepts a problem of the barem on an open test without a robot message', async () => {
    const message = 'Punctajele din barem dau 9, dar totalul este 10.';
    const api = evaluationApi({ exerciseList: { status: 'problem', message } });
    renderAdmin(`${PAGE}#corectare`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Folosește oricum' }));
    expect(api.acceptExerciseList).toHaveBeenCalledWith('6E2-26T1');
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('lets the robot try the barem again', async () => {
    const api = evaluationApi({ status: 'evaluating', exerciseList: { status: 'failed', message: 'Robotul nu a terminat la timp.' } });
    renderAdmin(`${PAGE}#corectare`, api);
    expect(await screen.findByText('Robotul nu a terminat la timp.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(api.retryExerciseList).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.');
  });

  it('shows the grades, the items to check, and a failed grading to try again', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 4, grade: 8.75, flagCount: 2 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'failed', fileCount: 1, lastError: 'Robotul nu a terminat la timp.' }),
    ];
    const api = evaluationApi({ status: 'done', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, rows);
    renderAdmin(`${PAGE}#corectare`, api);
    expect(await screen.findByRole('heading', { name: 'Încărcări · trimise 2 din 2 · corectate 1 · de verificat 2' })).toBeInTheDocument();
    expect(screen.getByText('Corectarea s-a terminat. Evaluarea a pornit la 7 oct. 2026, 11:00.')).toBeInTheDocument();
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    expect(within(pop).getByText('8,75')).toBeInTheDocument();
    expect(within(pop).getByText('2')).toBeInTheDocument();
    expect(within(pop).queryByRole('button', { name: 'Reîncearcă' })).not.toBeInTheDocument();
    const stan = screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    expect(within(stan).getByText('Robotul nu a terminat la timp.')).toBeInTheDocument();
    await userEvent.click(within(stan).getByRole('button', { name: 'Reîncearcă' }));
    expect(api.retrySubmission).toHaveBeenCalledWith(6, FAKE_STARTED_AT);
    expect(await within(stan).findByText('Trimis')).toBeInTheDocument();
    expect(screen.getByText('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.')).toBeInTheDocument();
    expect(screen.getByText('Evaluare parțială.')).toBeInTheDocument();
    expect(screen.getByText(/1 lucrare cu fișiere nu a fost corectată/)).toBeInTheDocument();
  });

  const gradedAndFailed = () => [
    fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 4, grade: 8.75, flagCount: 2 }),
    fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'failed', fileCount: 1, lastError: 'Robotul nu a terminat la timp.' }),
    fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
  ];

  it('regrades every graded and failed upload after the teacher confirms', async () => {
    const api = evaluationApi({ status: 'done' }, gradedAndFailed());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAdmin(`${PAGE}#corectare`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Recorectează tot' }));
    expect(api.regradeTest).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Recorectează tot' }));
    expect(confirm).toHaveBeenLastCalledWith('Recorectezi 2 lucrări? Punctajele și comentariile schimbate de tine se pierd.');
    expect(api.regradeTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('status')).toHaveTextContent(robotStartMessage('next_check'));
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    expect(await within(pop).findByText('Trimis')).toBeInTheDocument();
    expect(within(screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!).getByText('Trimis')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recorectează tot' })).not.toBeInTheDocument();
  });

  it('says how many papers the demo limit let go to a regrade', async () => {
    const api = evaluationApi({ status: 'done' }, gradedAndFailed());
    api.regradeTest.mockResolvedValueOnce({ count: 1, testStatus: 'evaluating', robot: 'next_check' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#corectare`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Recorectează tot' }));
    expect(await screen.findByText('Limita contului demo: se corectează din nou 1 din cele 2 lucrări. Celelalte își păstrează rezultatele.')).toBeInTheDocument();
  });

  it('counts only the papers that stayed out, while the robot grades the others', async () => {
    const api = evaluationApi({ status: 'evaluating' }, [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 1 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan', submissionId: 7, status: 'uploading', fileCount: 0 }),
    ]);
    renderAdmin(`${PAGE}#corectare`, api);
    expect(await screen.findByText('Evaluare parțială.')).toBeInTheDocument();
    expect(screen.getByText(/1 lucrare cu fișiere nu a fost corectată/)).toBeInTheDocument();
  });

  it('says that an open test grades the uploads again after Start evaluation', async () => {
    const api = evaluationApi({ status: 'open' }, gradedAndFailed());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#corectare`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Recorectează tot' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Lucrările se corectează din nou după ce pornești evaluarea.');
    // The regraded uploads wait for grading: select them first.
    await userEvent.click(screen.getByLabelText('Selectează toate lucrările cu fișiere'));
    // Once the evaluation starts, the words are not true any more.
    await userEvent.click(screen.getByRole('button', { name: 'Pornește evaluarea acum' }));
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', undefined, [5, 6]);
    expect(await screen.findByText('Se corectează', { selector: '.status' })).toBeInTheDocument();
    expect(screen.queryByText('Lucrările se corectează din nou după ce pornești evaluarea.')).not.toBeInTheDocument();
    // Nor after the uploads open again.
    await openStage('În clasă');
    await userEvent.click(screen.getByRole('button', { name: 'Redeschide încărcarea' }));
    expect(await screen.findByText(/^Elevii trimit lucrările\./)).toBeInTheDocument();
    await openStage('Corectare');
    expect(screen.getByRole('button', { name: 'Pornește evaluarea acum' })).toBeInTheDocument();
    expect(screen.queryByText('Lucrările se corectează din nou după ce pornești evaluarea.')).not.toBeInTheDocument();
  });

  it('offers no regrade while nothing is graded', async () => {
    renderAdmin(`${PAGE}#corectare`, evaluationApi({ status: 'evaluating' }));
    expect(await screen.findByText(/^Robotul corectează lucrările trimise\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recorectează tot' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recorectează' })).not.toBeInTheDocument();
  });

  it('regrades one graded upload from its row', async () => {
    const api = evaluationApi({ status: 'done' }, gradedAndFailed());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#corectare`, api);
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    expect(within(screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!).queryByRole('button', { name: 'Recorectează' })).toBeNull();
    await userEvent.click(within(pop).getByRole('button', { name: 'Recorectează' }));
    expect(confirm).toHaveBeenCalledWith('Recorectezi lucrarea elevului Pop Ion? Corecturile tale se pierd.');
    expect(api.regradeSubmission).toHaveBeenCalledWith(5, '2026-10-07T09:00:00.000Z');
    expect(await within(pop).findByText('Trimis')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(robotStartMessage('next_check'));
  });

  const NOT_STARTED = 'Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.';

  // The API says that GitHub did not take the last request to start the robot.
  function failedStartApi(overrides: Parameters<typeof fakeTest>[0]) {
    const detail = fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, files: FILES, ...overrides }, structuredClone(uploads));
    detail.robot.startFailed = true;
    return createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [detail],
    });
  }

  it('starts at once a schedule whose time passed before the click, and says when the robot did not start', async () => {
    const api = evaluationApi({});
    renderAdmin(`${PAGE}#corectare`, api);
    fireEvent.change(await screen.findByLabelText('Sau pornește evaluarea automat la'), { target: { value: '2026-10-08T10:05' } });
    vi.setSystemTime(new Date('2026-10-08T07:06:00.000Z'));
    await userEvent.click(screen.getByRole('button', { name: 'Programează' }));
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', '2026-10-08T07:05:00.000Z');
    expect(await screen.findByText('Se corectează', { selector: '.status' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(NOT_STARTED);
  });

  it('says that the robot did not start for a test in evaluation, also after a reload', async () => {
    renderAdmin(PAGE, failedStartApi({ status: 'evaluating' }));
    expect(await screen.findByRole('status')).toHaveTextContent(NOT_STARTED);
  });

  it('says it once after a button could not start the robot either', async () => {
    const failed = 'Robotul nu a terminat la timp.';
    const api = failedStartApi({ status: 'evaluating', exerciseList: { status: 'failed', message: failed } });
    renderAdmin(`${PAGE}#corectare`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Încearcă din nou' }));
    expect(api.retryExerciseList).toHaveBeenCalledWith('6E2-26T1');
    await waitFor(() => expect(screen.queryByText(failed)).not.toBeInTheDocument());
    expect(screen.getAllByText(NOT_STARTED)).toHaveLength(1);
  });

  it.each([
    // The print PDF is ready: a print PDF that waits would be robot work on an open test.
    ['open', /^Evaluarea pornește automat la/, { evaluationAt: '2026-10-20T07:15:00.000Z', print: { status: 'ready', fromWord: false } }],
    ['done', /^Corectarea s-a terminat\./, {}],
  ] as const)('says nothing about a robot start on a test that is %s', async (status, line, overrides) => {
    renderAdmin(`${PAGE}#corectare`, failedStartApi({ status, ...overrides }));
    expect(await screen.findByText(line)).toBeInTheDocument();
    expect(screen.queryByText(NOT_STARTED)).not.toBeInTheDocument();
  });

  it('starts the robot again when grading is late and work waits', async () => {
    const api = evaluationApi({ status: 'evaluating' });
    renderAdmin(`${PAGE}#corectare`, api);
    expect(await screen.findByText('Corectarea poate întârzia.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pornește robotul' }));
    expect(api.startRobot).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('status')).toHaveTextContent(robotStartMessage('next_check'));
  });

  it('says why the robot did not start', async () => {
    const api = evaluationApi({ status: 'evaluating' });
    api.startRobot.mockRejectedValueOnce(new ApiError(409, 'no_work', 'Nicio lucrare a acestui test nu așteaptă robotul.'));
    renderAdmin(`${PAGE}#corectare`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Pornește robotul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nicio lucrare a acestui test nu așteaptă robotul.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  const graded = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 })];
  const leftInGrading = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'grading', fileCount: 2 })];
  const problem = { status: 'problem', message: 'Punctajele din barem dau 9, dar totalul este 10.' } as const;
  const robotButtonCases: [string, Parameters<typeof fakeTest>[0], UploadRow[], string | null, boolean][] = [
    ['an upload left in grading', { status: 'evaluating' }, leftInGrading, null, true],
    ['a robot that checked 5 minutes ago', { status: 'evaluating' }, uploads, '2026-10-08T06:55:00.000Z', false],
    ['a test with nothing left to grade', { status: 'evaluating' }, graded, null, false],
    ['a class analysis that waits', { status: 'evaluating', analysis: { status: 'requested', stale: false, attempts: 0 } }, graded, null, true],
    ['a barem that waits for the teacher', { status: 'evaluating', exerciseList: problem }, uploads, null, false],
    ['a scheduled evaluation', { evaluationAt: '2026-10-09T07:00:00.000Z' }, uploads, null, false],
  ];

  it.each(robotButtonCases)('offers to start the robot for %s', async (_name, overrides, rows, lastCheckAt, shown) => {
    renderAdmin(`${PAGE}#corectare`, evaluationApi(overrides, rows, lastCheckAt));
    expect(await screen.findByText(/^Robotul (nu )?a verificat/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pornește robotul' }) !== null).toBe(shown);
  });

  it('says in Corectare that the robot writes the class analysis, and links to the class report in Rezultate', async () => {
    renderAdmin(`${PAGE}#corectare`, evaluationApi({ status: 'evaluating', analysis: { status: 'requested', stale: false, attempts: 0 } }, graded));
    expect(await screen.findByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).toBeInTheDocument();
    await openStage('Rezultate');
    expect(screen.getByRole('link', { name: 'Raportul clasei' })).toHaveAttribute('href', '/teste/6E2-26T1/raport');
  });

  it('says that the last attempt failed instead of saying that the robot writes, after a failed attempt', async () => {
    renderAdmin(`${PAGE}#corectare`, evaluationApi({ status: 'evaluating', analysis: { status: 'requested', stale: false, attempts: 1 } }, graded));
    expect(
      await screen.findByText('Ultima încercare a eșuat. Robotul va încerca din nou la următoarea rulare.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).not.toBeInTheDocument();
  });

  it('does not say that the work is graded while an upload still waits', async () => {
    const mixed = [...graded, fakeUpload({ studentId: 11, studentName: 'Avram Dan', submissionId: 6, status: 'submitted', fileCount: 1 })];
    renderAdmin(
      `${PAGE}#corectare`,
      evaluationApi({ status: 'evaluating', gradedCount: 1, analysis: { status: 'requested', stale: false, attempts: 0 } }, mixed),
    );
    expect(await screen.findByText(/^Robotul corectează lucrările trimise\./)).toBeInTheDocument();
    expect(screen.queryByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).not.toBeInTheDocument();
    await openStage('Rezultate');
    expect(screen.getByRole('link', { name: 'Raportul clasei' })).toBeInTheDocument();
  });

  it('shows the link to the class report only when something is graded', async () => {
    renderAdmin(`${PAGE}#rezultate`, evaluationApi({ status: 'evaluating' }, leftInGrading));
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Raportul clasei' })).not.toBeInTheDocument();
    await openStage('Corectare');
    expect(await screen.findByText(/^Robotul (nu )?a verificat/)).toBeInTheDocument();
    expect(screen.queryByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).not.toBeInTheDocument();
  });

  it('puts the class report in Rezultate once a result is graded', async () => {
    renderAdmin(PAGE, evaluationApi({ status: 'done' }, graded));
    const panel = await screen.findByRole('region', { name: 'Rezultate' });
    const link = within(panel).getByRole('link', { name: 'Raportul clasei' });
    expect(link).toHaveAttribute('href', '/teste/6E2-26T1/raport');
    expect(link).toHaveClass('button-quiet', 'button-small');
    expect(screen.getAllByRole('link', { name: 'Raportul clasei' })).toHaveLength(1);
  });

  it('has no report button before any grading', async () => {
    renderAdmin(`${PAGE}#rezultate`, evaluationApi({ status: 'evaluating' }, leftInGrading));
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Raportul clasei' })).not.toBeInTheDocument();
  });

  it('says when the class analysis failed', async () => {
    renderAdmin(`${PAGE}#corectare`, evaluationApi({ status: 'done', analysis: { status: 'failed', stale: false, attempts: 0 } }, graded));
    expect(await screen.findByText('Robotul nu a putut scrie analiza clasei.')).toBeInTheDocument();
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
});
```

- [ ] **Step 4: Edit `src/admin/pages/TestPagePrint.test.tsx`**

Find this block:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

Replace it with:

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

- [ ] **Step 5: Edit `src/admin/pages/TestPagePrint.test.tsx`**

Find this block:

```tsx

afterEach(() => {
```

Replace it with:

```tsx

// Opens the panel of a stage with its link in the list of stages.
async function openStage(name: string) {
  const stages = screen.getByRole('navigation', { name: 'Etapele testului' });
  await userEvent.click(within(stages).getByRole('link', { name: new RegExp(`^${name} `) }));
}

afterEach(() => {
```

- [ ] **Step 6: Edit `src/admin/pages/TestPagePrint.test.tsx`**

Find this block:

```tsx
  it('shows no robot line on a draft test without a waiting request', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'draft', uploadToken: null, barem: { request: 'failed', unchecked: false } }, true));
    expect(await screen.findByText('Nu am putut genera baremul.')).toBeInTheDocument();
```

Replace it with:

```tsx
  it('shows no robot line on a draft test without a waiting request', async () => {
    renderAdmin('/teste/6E2-26T1#pregatire', apiWith({ status: 'draft', uploadToken: null, barem: { request: 'failed', unchecked: false } }, true));
    expect(await screen.findByText('Nu am putut genera baremul.')).toBeInTheDocument();
```

- [ ] **Step 7: Edit `src/admin/pages/TestPagePrint.test.tsx`**

Find this block:

```tsx
    const api = apiWith({});
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
```

Replace it with:

```tsx
    const api = apiWith({});
    renderAdmin('/teste/6E2-26T1#tiparire', api);
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
```

- [ ] **Step 8: Edit `src/admin/pages/TestPagePrint.test.tsx`**

Find this block:

```tsx
  ] as const)('shows no robot line while the print PDF %s', async (_name, overrides) => {
    renderAdmin('/teste/6E2-26T1', apiWith(overrides, true));
    expect(await screen.findByText('Testul pentru tipărit:')).toBeInTheDocument();
```

Replace it with:

```tsx
  ] as const)('shows no robot line while the print PDF %s', async (_name, overrides) => {
    renderAdmin('/teste/6E2-26T1#tiparire', apiWith(overrides, true));
    expect(await screen.findByText('Testul pentru tipărit:')).toBeInTheDocument();
```

- [ ] **Step 9: Edit `src/admin/pages/TestPagePrint.test.tsx`**

Find this block:

```tsx
  it('says that the robot did not start for the print PDF, also after a reload', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({}, true));
    expect(await screen.findByText(robotStartMessage('next_check'))).toBeInTheDocument();
```

Replace it with:

```tsx
  it('says that the robot did not start for the print PDF, also after a reload', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', apiWith({}, true));
    expect(await screen.findByText(robotStartMessage('next_check'))).toBeInTheDocument();
```

- [ ] **Step 10: Edit `src/admin/pages/TestPagePrint.test.tsx`**

Find this block:

```tsx
    const api = apiWith({ status: 'done' });
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redeschide încărcarea' }));
```

Replace it with:

```tsx
    const api = apiWith({ status: 'done' });
    renderAdmin('/teste/6E2-26T1#in-clasa', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redeschide încărcarea' }));
```

- [ ] **Step 11: Edit `src/admin/pages/TestPagePrint.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByText(robotStartMessage('dispatched'))).toBeInTheDocument();
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
```

Replace it with:

```tsx
    expect(await screen.findByText(robotStartMessage('dispatched'))).toBeInTheDocument();
    await openStage('Tipărire');
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
```

- [ ] **Step 12: Edit `src/admin/pages/TestPagePrint.test.tsx`**

Find this block:

```tsx
    const api = apiWith({ status: 'done', print: { status: 'ready', fromWord: false } });
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redeschide încărcarea' }));
    expect(await screen.findByRole('link', { name: 'Descarcă testul cu cod QR' })).toBeInTheDocument();
```

Replace it with:

```tsx
    const api = apiWith({ status: 'done', print: { status: 'ready', fromWord: false } });
    renderAdmin('/teste/6E2-26T1#in-clasa', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redeschide încărcarea' }));
    expect(await screen.findByText(/^Elevii trimit lucrările\./)).toBeInTheDocument();
    await openStage('Tipărire');
    expect(await screen.findByRole('link', { name: 'Descarcă testul cu cod QR' })).toBeInTheDocument();
```

- [ ] **Step 13: Edit `src/admin/testPage/GeneratedBarem.test.tsx`**

Find this block:

```tsx
    const api = apiWith({ files: { test: TEST_FILE, barem: { name: 'Barem.pdf', type: PDF_TYPE } } });
    renderAdmin('/teste/6E2-26T1', api);
    const button = await screen.findByRole('button', { name: 'Generează baremul' });
```

Replace it with:

```tsx
    const api = apiWith({ files: { test: TEST_FILE, barem: { name: 'Barem.pdf', type: PDF_TYPE } } });
    renderAdmin('/teste/6E2-26T1#pregatire', api);
    const button = await screen.findByRole('button', { name: 'Generează baremul' });
```

- [ ] **Step 14: Edit `src/admin/testPage/GeneratedBarem.test.tsx`**

Find this block:

```tsx
    const at = '2099-01-01T10:00:00.000Z';
    const { unmount } = renderAdmin('/teste/6E2-26T1', apiWith({ evaluationAt: at }));
    await userEvent.click(await screen.findByRole('button', { name: 'Generează baremul' }));
```

Replace it with:

```tsx
    const at = '2099-01-01T10:00:00.000Z';
    const { unmount } = renderAdmin('/teste/6E2-26T1#pregatire', apiWith({ evaluationAt: at }));
    await userEvent.click(await screen.findByRole('button', { name: 'Generează baremul' }));
```

- [ ] **Step 15: Edit `src/admin/testPage/GeneratedBarem.test.tsx`**

Find this block:

```tsx
    const api = apiWith({ evaluationAt: at, files: { test: TEST_FILE, barem: { name: 'Barem.pdf', type: PDF_TYPE } } });
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Generează baremul' }));
```

Replace it with:

```tsx
    const api = apiWith({ evaluationAt: at, files: { test: TEST_FILE, barem: { name: 'Barem.pdf', type: PDF_TYPE } } });
    renderAdmin('/teste/6E2-26T1#pregatire', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Generează baremul' }));
```

- [ ] **Step 16: Edit `src/admin/testPage/GeneratedBarem.test.tsx`**

Find this block:

```tsx
  it('is hidden in evaluation and done', async () => {
    const { unmount } = renderAdmin('/teste/6E2-26T1', apiWith({ status: 'evaluating' }));
    await screen.findByText('Baremul:');
```

Replace it with:

```tsx
  it('is hidden in evaluation and done', async () => {
    const { unmount } = renderAdmin('/teste/6E2-26T1#pregatire', apiWith({ status: 'evaluating' }));
    await screen.findByText('Baremul:');
```

- [ ] **Step 17: Edit `src/admin/testPage/GeneratedBarem.test.tsx`**

Find this block:

```tsx
    unmount();
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'done' }));
    await screen.findByText('Baremul:');
```

Replace it with:

```tsx
    unmount();
    renderAdmin('/teste/6E2-26T1#pregatire', apiWith({ status: 'done' }));
    await screen.findByText('Baremul:');
```

- [ ] **Step 18: Edit `src/admin/testPage/GeneratedBarem.test.tsx`**

Find this block:

```tsx
  it('disables the evaluation buttons while the barem is unchecked', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, barem: { request: 'none', unchecked: true } }));
    expect(await screen.findByRole('button', { name: 'Pornește evaluarea acum' })).toBeDisabled();
```

Replace it with:

```tsx
  it('disables the evaluation buttons while the barem is unchecked', async () => {
    renderAdmin('/teste/6E2-26T1#corectare', apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, barem: { request: 'none', unchecked: true } }));
    expect(await screen.findByRole('button', { name: 'Pornește evaluarea acum' })).toBeDisabled();
```

- [ ] **Step 19: Edit `src/admin/testPage/GeneratedBarem.test.tsx`**

Find this block:

```tsx
  it('disables the evaluation buttons while the barem is generating', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, barem: { request: 'requested', unchecked: false } }));
    expect(await screen.findByRole('button', { name: 'Pornește evaluarea acum' })).toBeDisabled();
```

Replace it with:

```tsx
  it('disables the evaluation buttons while the barem is generating', async () => {
    renderAdmin('/teste/6E2-26T1#corectare', apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, barem: { request: 'requested', unchecked: false } }));
    expect(await screen.findByRole('button', { name: 'Pornește evaluarea acum' })).toBeDisabled();
```

- [ ] **Step 20: Edit `src/admin/testPage/GeneratedBarem.test.tsx`**

Find this block:

```tsx
  it('does not ask to upload the barem during a first generation', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ barem: { request: 'requested', unchecked: false } }));
    expect(await screen.findByText(/Baremul se generează încă\./)).toBeInTheDocument();
```

Replace it with:

```tsx
  it('does not ask to upload the barem during a first generation', async () => {
    renderAdmin('/teste/6E2-26T1#corectare', apiWith({ barem: { request: 'requested', unchecked: false } }));
    expect(await screen.findByText(/Baremul se generează încă\./)).toBeInTheDocument();
```

- [ ] **Step 21: Edit `src/admin/testPage/PrintTest.test.tsx`**

Find this block:

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

Replace it with:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

- [ ] **Step 22: Edit `src/admin/testPage/PrintTest.test.tsx`**

Find this block:

```tsx
  it('asks for the test file first', async () => {
    renderAdmin('/teste/6E2-26T1', openApi({ files: { test: null, barem: null } }));
    expect(await screen.findByText('Testul pentru tipărit:')).toBeInTheDocument();
```

Replace it with:

```tsx
  it('asks for the test file first', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ files: { test: null, barem: null } }));
    expect(await screen.findByText('Testul pentru tipărit:')).toBeInTheDocument();
```

- [ ] **Step 23: Edit `src/admin/testPage/PrintTest.test.tsx`**

Find this block:

```tsx
  it('says the PDF is being made', async () => {
    renderAdmin('/teste/6E2-26T1', openApi());
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toHaveAttribute('role', 'status');
```

Replace it with:

```tsx
  it('says the PDF is being made', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', openApi());
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toHaveAttribute('role', 'status');
```

- [ ] **Step 24: Edit `src/admin/testPage/PrintTest.test.tsx`**

Find this block:

```tsx
  it('offers the download when ready', async () => {
    renderAdmin('/teste/6E2-26T1', openApi({ print: { status: 'ready', fromWord: false } }));
    const link = await screen.findByRole('link', { name: 'Descarcă testul cu cod QR' });
```

Replace it with:

```tsx
  it('offers the download when ready', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false } }));
    const link = await screen.findByRole('link', { name: 'Descarcă testul cu cod QR' });
```

- [ ] **Step 25: Edit `src/admin/testPage/PrintTest.test.tsx`**

Find this block:

```tsx
    const word = /PDF-ul a fost făcut din fișierul Word/;
    const { unmount } = renderAdmin('/teste/6E2-26T1', openApi({ print: { status: 'ready', fromWord: true } }));
    expect(await screen.findByText(word)).toHaveTextContent('Pentru o copie exactă, încarcă testul ca PDF.');
    unmount();
    renderAdmin('/teste/6E2-26T1', openApi({ print: { status: 'ready', fromWord: false } }));
    await screen.findByRole('link', { name: 'Descarcă testul cu cod QR' });
```

Replace it with:

```tsx
    const word = /PDF-ul a fost făcut din fișierul Word/;
    const { unmount } = renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: true } }));
    expect(await screen.findByText(word)).toHaveTextContent('Pentru o copie exactă, încarcă testul ca PDF.');
    unmount();
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false } }));
    await screen.findByRole('link', { name: 'Descarcă testul cu cod QR' });
```

- [ ] **Step 26: Edit `src/admin/testPage/PrintTest.test.tsx`**

Find this block:

```tsx
    const api = openApi({ print: { status: 'failed', fromWord: false } });
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByText('Nu am putut pregăti testul cu cod QR.')).toBeInTheDocument();
```

Replace it with:

```tsx
    const api = openApi({ print: { status: 'failed', fromWord: false } });
    renderAdmin('/teste/6E2-26T1#tiparire', api);
    expect(await screen.findByText('Nu am putut pregăti testul cu cod QR.')).toBeInTheDocument();
```

- [ ] **Step 27: Edit `src/admin/testPage/PrintTest.test.tsx`**

Find this block:

```tsx

  it('shows the block in the files section, under the test file, whatever the links do', async () => {
    renderAdmin('/teste/6E2-26T1', openApi());
    const block = (await screen.findByText('Testul pentru tipărit:')).closest('.print-test')!;
    const row = block.closest('li')!;
    expect(row).toHaveTextContent('Testul:');
    expect(row).toContainElement(screen.getByRole('link', { name: 'Test.pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Arată linkurile' }));
    expect(screen.getByText('Testul pentru tipărit:')).toBeInTheDocument();
  });
```

Replace it with:

```tsx

  it('shows the block in the panel Tipărire, and not with the files of Pregătire', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', openApi());
    const panel = await screen.findByRole('region', { name: 'Tipărire' });
    expect(within(panel).getByText('Testul pentru tipărit:')).toBeInTheDocument();
    const stages = screen.getByRole('navigation', { name: 'Etapele testului' });
    await userEvent.click(within(stages).getByRole('link', { name: /^Pregătire / }));
    expect(await screen.findByRole('link', { name: 'Test.pdf' })).toBeInTheDocument();
    expect(screen.queryByText('Testul pentru tipărit:')).not.toBeInTheDocument();
  });
```

- [ ] **Step 28: Edit `src/admin/testPage/PrintTest.test.tsx`**

Find this block:

```tsx
  it('turns a spinner while the PDF is being made, and not after', async () => {
    const { unmount } = renderAdmin('/teste/6E2-26T1', openApi());
    const status = await screen.findByRole('status');
```

Replace it with:

```tsx
  it('turns a spinner while the PDF is being made, and not after', async () => {
    const { unmount } = renderAdmin('/teste/6E2-26T1#tiparire', openApi());
    const status = await screen.findByRole('status');
```

- [ ] **Step 29: Edit `src/admin/testPage/PrintTest.test.tsx`**

Find this block:

```tsx
    unmount();
    renderAdmin('/teste/6E2-26T1', openApi({ print: { status: 'ready', fromWord: false } }));
    await screen.findByRole('link', { name: 'Descarcă testul cu cod QR' });
```

Replace it with:

```tsx
    unmount();
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false } }));
    await screen.findByRole('link', { name: 'Descarcă testul cu cod QR' });
```

- [ ] **Step 30: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Arată linkurile' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Arată codul QR pe tot ecranul' }));
```

Replace it with:

```tsx
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Arată codul QR pe tot ecranul' }));
```

- [ ] **Step 31: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/TestPage.test.tsx src/admin/pages/TestPagePrint.test.tsx src/admin/testPage/GeneratedBarem.test.tsx src/admin/testPage/PrintTest.test.tsx src/admin/Layout.test.tsx`
Expected: FAIL. `Test Files  4 failed | 1 passed (5)`, `Tests  42 failed | 126 passed (168)`. The old page has no list of stages (`Unable to find role="navigation" and name "Etapele testului"`, 13 tests), no region "Fișa testului" (7), no stage panels (`Unable to find role="heading" and name "Rezultate"`, and the same for Tipărire and În clasă: 8), no title heading "Fracții" (3), none of the new panels' words (`/^Elevii trimit lucrările\./` 3, `/^Corectarea începe după ce elevii trimit lucrările\./` 1, the link "Înlocuiește baremul" 1), and the students' link hidden behind "Arată linkurile" (`Unable to find a label with the text of: Linkul pentru elevi` 3, "Arată codul QR pe tot ecranul" 2, "Copiază linkul" 1; one of them is the Layout test "closes only the QR view on Esc when a panel is open too"). The other tests pass already, as guards: the old page draws every control at once, so a test that opens a stage by its address finds its control there too (64 of the 102 page tests, the 15 GeneratedBarem tests, 6 of 7 PrintTest tests, 6 of 8 TestPagePrint tests, and 35 of 36 Layout tests).

- [ ] **Step 32: Create `src/admin/testPage/StageList.tsx`**

```tsx
import { Link } from 'react-router';
import { stageHash, type Stage, type StageName, type StageState } from '../stages.ts';

// What the dot of a stage says, for a screen reader.
const STATE_WORDS: Record<StageState, string> = {
  done: 'gata',
  wait: 'te așteaptă',
  now: 'în lucru',
  later: 'urmează',
};

// The six stages of the test page as a vertical list (redesign spec §6): a dot
// per stage, its name, and its note. Each stage is a link to its panel, kept in
// the address without a new step in the history; the chosen one is marked.
export function StageList({ stages, chosen }: { stages: Stage[]; chosen: StageName }) {
  return (
    <nav className="stage-list" aria-label="Etapele testului">
      <ol>
        {stages.map((stage) => (
          <li key={stage.name} className={`is-${stage.state}`}>
            <Link to={{ hash: stageHash(stage.name) }} replace aria-current={stage.name === chosen ? 'step' : undefined}>
              <span className="stage-dot" aria-hidden="true">
                {stage.state === 'done' && <TickIcon />}
              </span>
              <span className="stage-name">{stage.name}</span>{' '}
              <span className="stage-note">
                {stage.note === '' ? (
                  STATE_WORDS[stage.state]
                ) : (
                  <>
                    <span className="sr-only">{STATE_WORDS[stage.state]}:</span> {stage.note}
                  </>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function TickIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5l3 3 6-6.5" />
    </svg>
  );
}
```

- [ ] **Step 33: Create `src/admin/testPage/TestSheet.tsx`**

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import type { TestInfo } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { MAX_TITLE_LENGTH } from '../../../shared/tests.ts';
import { formatDateTime, studentCountLabel } from '../../ui/format.ts';
import { printFileUrl, testFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { StatusChip } from '../StatusChip.tsx';
import { UploadLink } from './UploadLink.tsx';

// The barem in a few words. Not its points: the API knows them only after the
// grading starts.
export function baremState(test: Pick<TestInfo, 'files' | 'barem'>): string {
  const { request, unchecked } = test.barem;
  if (request === 'requested') return 'se generează';
  if (test.files.barem === null || unchecked) {
    if (request === 'failed') return 'nu s-a putut genera';
    return test.files.barem === null ? 'lipsește' : 'de verificat';
  }
  return 'activ';
}

// "Fișa testului" (redesign spec §6): the facts and files of the test, the
// students' link while they may still need it, and renaming, archiving and
// deleting the test. It shows beside every stage.
export function TestSheet({ test, onChanged }: { test: TestInfo; onChanged: () => Promise<void> }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const id = useId();
  // The rename form opens in place of its button.
  const [renameOpen, setRenameOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deleteTest(test.code),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tests'] });
      navigate('/');
    },
  });
  const archive = useMutation({
    mutationFn: (archived: boolean) => api.setTestArchived(test.code, archived),
    onSuccess: onChanged,
  });
  // The printed QR code is the usual way in; the link here is for a student
  // without the printed test. It goes once the uploads have closed.
  const link = (test.status === 'draft' || test.status === 'open') && test.uploadToken !== null ? test.uploadToken : null;

  return (
    <section className="test-sheet" aria-labelledby={id}>
      <h2 id={id}>Fișa testului</h2>
      <dl className="sheet-facts">
        <dt>Clasa</dt>
        <dd>
          {displayClassName(test.className)} · {studentCountLabel(test.studentCount)}
        </dd>
        <dt>Codul</dt>
        <dd>{test.code}</dd>
        <dt>Starea</dt>
        <dd>
          <StatusChip status={test.status} />
          {test.archived && <span className="tag">Arhivat</span>}
        </dd>
        <dt>Început</dt>
        <dd>{test.startedAt ? formatDateTime(test.startedAt) : 'neînceput'}</dd>
        {test.status !== 'draft' && (
          <>
            <dt>Au trimis</dt>
            <dd>
              {test.submittedCount} din {test.studentCount}
            </dd>
          </>
        )}
        <dt>Baremul</dt>
        <dd>{baremState(test)}</dd>
        {test.averageGrade !== null && (
          <>
            <dt>Media testului</dt>
            <dd>{formatPoints(test.averageGrade)}</dd>
          </>
        )}
      </dl>

      <div className="sheet-part">
        <h3>Fișiere</h3>
        <ul className="sheet-files">
          <SheetFile title="Testul" name={test.files.test?.name ?? null} href={testFileUrl(test.code, 'test')} />
          <SheetFile title="Baremul" name={test.files.barem?.name ?? null} href={testFileUrl(test.code, 'barem')} />
          {test.print.status === 'ready' && (
            <li>
              <a href={printFileUrl(test.code)} download>
                Testul cu cod QR
              </a>
              <span className="hint">PDF de tipărit</span>
            </li>
          )}
        </ul>
      </div>

      {link !== null && (
        <div className="sheet-part">
          <UploadLink token={link} />
          <p className="hint">
            {test.status === 'draft'
              ? 'Codul e pe testul tipărit. Elevii trimit lucrările după ce începi testul.'
              : 'Pentru un elev fără testul tipărit.'}
          </p>
        </div>
      )}

      <div className="sheet-part sheet-actions">
        {renameOpen ? (
          <RenameTestForm code={test.code} currentTitle={test.title} onDone={onChanged} onClose={() => setRenameOpen(false)} />
        ) : (
          <button type="button" className="button-quiet button-small" onClick={() => setRenameOpen(true)}>
            Redenumește testul
          </button>
        )}
        {test.archived ? (
          <button type="button" className="button-quiet button-small" disabled={archive.isPending} onClick={() => archive.mutate(false)}>
            Scoate din arhivă
          </button>
        ) : (
          test.status === 'done' && (
            <>
              <button type="button" className="button-quiet button-small" disabled={archive.isPending} onClick={() => archive.mutate(true)}>
                Arhivează testul
              </button>
              <p className="hint">Testul nu mai apare în lista clasei și în Teste. Îl găsești cu „Arată și testele arhivate”.</p>
            </>
          )
        )}
        {archive.error && <ErrorMessage error={archive.error} />}
        <button
          type="button"
          className="button-quiet button-small button-danger"
          disabled={remove.isPending}
          onClick={() => {
            // A printed test keeps its QR code: after a delete, the code leads nowhere.
            const printed = test.print.status === 'ready' ? ' Codurile QR de pe testele tipărite nu vor mai funcționa.' : '';
            if (window.confirm(`Ștergi testul ${test.code}? Se șterg și toate lucrările încărcate.${printed}`)) remove.mutate();
          }}
        >
          Șterge testul
        </button>
        <p className="hint">Se șterg și toate lucrările încărcate de elevi.</p>
        {remove.error && <ErrorMessage error={remove.error} />}
      </div>
    </section>
  );
}

function SheetFile({ title, name, href }: { title: string; name: string | null; href: string }) {
  return (
    <li>
      {name === null ? (
        <>
          <span>{title}</span>
          <span className="hint">lipsește</span>
        </>
      ) : (
        <>
          <a href={href} target="_blank" rel="noopener">
            {title}
          </a>
          <span className="hint">{name}</span>
        </>
      )}
    </li>
  );
}

function RenameTestForm({
  code,
  currentTitle,
  onDone,
  onClose,
}: {
  code: string;
  currentTitle: string;
  onDone: () => Promise<void>;
  onClose: () => void;
}) {
  const api = useApi();
  const [title, setTitle] = useState(currentTitle);
  const rename = useMutation({
    mutationFn: () => api.renameTest(code, title),
    onSuccess: async () => {
      onClose();
      await onDone();
    },
  });

  return (
    <form
      className="rename-form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        rename.mutate();
      }}
    >
      <label htmlFor="rename-test">Titlu nou</label>
      <input id="rename-test" type="text" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={MAX_TITLE_LENGTH} required />
      <span className="row-actions">
        <button className="button button-small" type="submit" disabled={rename.isPending}>
          Salvează
        </button>
        <button type="button" className="button-quiet button-small" onClick={onClose}>
          Renunță
        </button>
      </span>
      {rename.error && <ErrorMessage error={rename.error} />}
    </form>
  );
}
```

- [ ] **Step 34: Create `src/admin/testPage/StagePanel.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router';
import type { RobotStart, TestDetail, TestInfo, UploadRow } from '../../../shared/api.ts';
import type { TestStatus } from '../../../shared/tests.ts';
import { formatDateTime } from '../../ui/format.ts';
import { GradingProgress } from '../../ui/GradingProgress.tsx';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { stageHash, type StageName } from '../stages.ts';
import { AnalysisState } from './AnalysisState.tsx';
import { EvaluationControls } from './EvaluationControls.tsx';
import { ExerciseListBanner } from './ExerciseListBanner.tsx';
import { PrintTest } from './PrintTest.tsx';
import { RegradeAllButton } from './RegradeAllButton.tsx';
import { hasResultsToManage, ResultsAccess } from './ResultsAccess.tsx';
import { RobotLine } from './RobotLine.tsx';
import { StartRobotButton, waitsForBarem, waitsForPrint, waitsForRobot } from './StartRobotButton.tsx';
import { TestFiles } from './TestFiles.tsx';
import { MultiUploadLink } from './UploadLink.tsx';
import { UploadsTable } from './UploadsTable.tsx';

export interface PanelProps {
  test: TestInfo;
  uploads: UploadRow[];
  robot: TestDetail['robot'];
  showModel: boolean;
  // The uploads to grade at the next start (submission ids), chosen in the
  // table of Corectare. Kept by the page, so another panel does not lose them.
  selected: number[];
  onSelect: (ids: number[]) => void;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}

// The landing page's sentence for each stage (redesign spec §3).
const SENTENCES: Record<StageName, string> = {
  Pregătire: 'Încarci testul și baremul. Nu ai barem? Primești o propunere pe care o verifici tu.',
  Tipărire: 'Tipărești testul. Fiecare pagină are un cod QR.',
  'În clasă': 'Elevii scanează codul și trimit pozele lucrării. Fără cont și fără aplicație.',
  Corectare: 'Fiecare lucrare primește punctaj conform baremului, pas cu pas, cu 10 puncte din oficiu.',
  Verificare: 'Punctele nesigure te așteaptă pe tine. Accepți sau schimbi punctajul.',
  Rezultate: 'Fiecare elev primește un link cu rezultatul lui. Raportul clasei, un PDF pentru fiecare elev și CSV pentru catalog.',
};

const NEXT: Partial<Record<StageName, StageName>> = {
  Pregătire: 'Tipărire',
  Tipărire: 'În clasă',
  'În clasă': 'Corectare',
  Corectare: 'Verificare',
  Verificare: 'Rezultate',
};

// The panel of one stage of the test page (redesign spec §6): its name, its
// sentence, and the controls of that stage.
export function StagePanel({ stage, ...props }: PanelProps & { stage: StageName }) {
  const id = useId();
  const next = NEXT[stage];
  // The link to the next stage sits at the end of a panel that can be long:
  // after it, the page shows the top of the new panel, and its heading takes
  // the focus, so a screen reader names it. Chrome does not always scroll to
  // an element that takes the focus right after a click, so the panel is
  // scrolled into view first (jsdom has no scrollIntoView). A click on the
  // list of stages keeps the focus on its link.
  const panel = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const movedOn = useRef(false);
  useEffect(() => {
    if (!movedOn.current) return;
    movedOn.current = false;
    panel.current?.scrollIntoView?.({ block: 'start' });
    heading.current?.focus({ preventScroll: true });
  }, [stage]);
  return (
    <section className="stage-panel" aria-labelledby={id} ref={panel}>
      <div className="stage-head">
        <h2 id={id} ref={heading} tabIndex={-1}>
          {stage}
        </h2>
        <p>{SENTENCES[stage]}</p>
      </div>
      <div className="stage-body">
        {stage === 'Pregătire' && <PreparePanel {...props} />}
        {stage === 'Tipărire' && <PrintPanel {...props} />}
        {stage === 'În clasă' && <ClassPanel {...props} />}
        {stage === 'Corectare' && <GradingPanel {...props} />}
        {stage === 'Verificare' && <ReviewPanel {...props} />}
        {stage === 'Rezultate' && <ResultsPanel {...props} />}
        {next && (
          <p className="next-stage">
            <Link
              to={{ hash: stageHash(next) }}
              replace
              onClick={() => {
                movedOn.current = true;
              }}
            >
              Următoarea etapă: {next} →
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}

function PreparePanel({ test, robot, onChanged, onRobot }: PanelProps) {
  return (
    <>
      <TestFiles test={test} onChanged={onChanged} onRobot={onRobot} />
      {waitsForBarem(test) && (
        <RobotLine lastCheckAt={robot.lastCheckAt} lateText="Baremul poate întârzia.">
          <StartRobotButton code={test.code} onChanged={onChanged} onRobot={onRobot} />
        </RobotLine>
      )}
    </>
  );
}

function PrintPanel({ test, robot, onChanged, onRobot }: PanelProps) {
  if (test.status !== 'draft' && test.status !== 'open') {
    const kept = test.print.status === 'ready' ? ' Testul cu cod QR rămâne în Fișa testului.' : '';
    return <p className="hint">Testul s-a dat în clasă.{kept}</p>;
  }
  return (
    <>
      <PrintTest test={test} onChanged={onChanged} onRobot={onRobot} />
      {waitsForPrint(test) && (
        <RobotLine lastCheckAt={robot.lastCheckAt} lateText="Testul cu cod QR poate întârzia.">
          <StartRobotButton code={test.code} onChanged={onChanged} onRobot={onRobot} />
        </RobotLine>
      )}
    </>
  );
}

function ClassPanel(props: PanelProps) {
  const { test, onChanged } = props;
  return (
    <>
      <TestActions {...props} />
      {test.status === 'open' && <MultiUploadLink code={test.code} token={test.multiUploadToken} onChanged={onChanged} />}
      {test.status !== 'draft' && <Papers {...props} selectable={false} />}
    </>
  );
}

function GradingPanel(props: PanelProps) {
  const { test, uploads, robot, selected, onChanged, onRobot } = props;
  if (test.status === 'draft') {
    return <p className="hint">Corectarea începe după ce elevii trimit lucrările. Atunci alegi lucrările și pornești corectarea, acum sau la o oră aleasă.</p>;
  }
  return (
    <>
      <ExerciseListBanner test={test} onChanged={onChanged} onRobot={onRobot} />
      {test.status === 'open' ? (
        <EvaluationControls
          test={test}
          uploads={uploads}
          selected={selected}
          onChanged={onChanged}
          onStarted={() => props.onSelect([])}
          onRobot={onRobot}
        />
      ) : (
        <EvaluationState test={test} />
      )}
      {test.status !== 'open' && <PartialEvaluationNotice status={test.status} uploads={uploads} />}
      {(test.status === 'evaluating' || test.evaluationAt) && (
        <RobotLine lastCheckAt={robot.lastCheckAt}>
          {test.status === 'evaluating' && waitsForRobot(test, uploads) && (
            <StartRobotButton code={test.code} onChanged={onChanged} onRobot={onRobot} />
          )}
        </RobotLine>
      )}
      <RegradeAllButton code={test.code} testStatus={test.status} uploads={uploads} onChanged={onChanged} onRobot={onRobot} />
      <AnalysisState test={test} uploads={uploads} />
      <Papers {...props} selectable={test.status === 'open'} />
    </>
  );
}

function ReviewPanel(props: PanelProps) {
  const { test } = props;
  if (test.status === 'draft') return <p className="hint">Punctele nesigure apar după ce se corectează lucrările.</p>;
  return (
    <>
      {test.gradedCount === 0 && <p className="hint">Punctele nesigure apar după ce se corectează lucrările.</p>}
      <Papers {...props} selectable={false} />
    </>
  );
}

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
  );
}

// The papers of the class: who sent, the grades, and what waits. Only the
// table of Corectare has checkboxes, while the test is open.
function Papers({ test, uploads, showModel, selected, onSelect, onChanged, onRobot, selectable }: PanelProps & { selectable: boolean }) {
  return (
    <>
      <h3>
        Încărcări · trimise {test.submittedCount} din {test.studentCount}
        {test.gradedCount > 0 && ` · corectate ${test.gradedCount}`}
        {test.flagCount > 0 && ` · de verificat ${test.flagCount}`}
      </h3>
      <GradingProgress studentCount={test.studentCount} submittedCount={test.submittedCount} gradedCount={test.gradedCount} />
      <UploadsTable
        code={test.code}
        uploads={uploads}
        showModel={showModel}
        selectable={selectable}
        selected={selected}
        onSelect={onSelect}
        onChanged={onChanged}
        onRobot={onRobot}
        resultsOpen={test.resultsOpen}
      />
    </>
  );
}

// What the teacher can do in class, by the state of the test. The test is
// printed before the day of the test (its QR code is ready from the start) and
// started on that day: starting it opens the uploads and gives the test its
// date. A test started by mistake can be stopped while no student has uploaded
// a file.
function TestActions({ test, uploads, onChanged, onRobot }: PanelProps) {
  const api = useApi();
  const start = useMutation({
    mutationFn: () => api.startTest(test.code),
    onSuccess: async (started) => {
      onRobot(started.robot);
      await onChanged();
    },
  });
  const stop = useMutation({
    mutationFn: () => api.stopTest(test.code),
    onSuccess: async () => {
      onRobot(null);
      await onChanged();
    },
  });
  const reopen = useMutation({
    mutationFn: () => api.reopenTest(test.code),
    onSuccess: async (reopened) => {
      onRobot(reopened.robot);
      await onChanged();
    },
  });

  if (test.status === 'draft') {
    return (
      <>
        <p className="hint">
          Elevii pot încărca lucrările după ce începi testul. Începe-l în ziua testului, când le dai foile: data testului este ziua
          în care îl începi.
        </p>
        <p>
          <button type="button" className="button" disabled={start.isPending} onClick={() => start.mutate()}>
            Începe testul
          </button>
        </p>
        {start.error && <ErrorMessage error={start.error} />}
      </>
    );
  }
  // Stopping is refused once a student has uploaded a file, or once the test
  // was evaluated (a reopened test): the API checks it too.
  const canStop = test.evaluationStartedAt === null && uploads.every((row) => row.fileCount === 0);
  if (test.status === 'open')
    return (
      <>
        <p className="hint">Elevii trimit lucrările. Corectarea pornește la etapa Corectare, acum sau la o oră aleasă.</p>
        {canStop && (
          <>
            <p className="hint">Ai început testul din greșeală? Îl poți opri cât timp niciun elev nu a încărcat lucrarea.</p>
            <p>
              <button
                type="button"
                className="button-quiet button-small"
                disabled={stop.isPending}
                onClick={() => {
                  const schedule = test.evaluationAt ? ' Evaluarea programată se anulează.' : '';
                  const question = `Oprești testul? Elevii nu mai pot încărca lucrările până îl începi din nou, iar data testului se șterge.${schedule}`;
                  if (window.confirm(question)) stop.mutate();
                }}
              >
                Oprește testul
              </button>
            </p>
          </>
        )}
        {stop.error && <ErrorMessage error={stop.error} />}
      </>
    );
  return (
    <>
      <p className="hint">Încărcarea este închisă. Dacă o redeschizi, elevii care nu au trimis pot încărca acum.</p>
      <p>
        <button type="button" className="button-quiet" disabled={reopen.isPending} onClick={() => reopen.mutate()}>
          Redeschide încărcarea
        </button>
      </p>
      {reopen.error && <ErrorMessage error={reopen.error} />}
    </>
  );
}

// A test whose uploads closed: grading goes on, or has ended.
function EvaluationState({ test }: { test: TestInfo }) {
  const since = test.evaluationStartedAt ? ` Evaluarea a pornit la ${formatDateTime(test.evaluationStartedAt)}.` : '';
  return <p>{test.status === 'done' ? `Corectarea s-a terminat.${since}` : `Robotul corectează lucrările trimise.${since}`}</p>;
}

// An evaluation with uploads that stayed out of it: the teacher selected others,
// or a demo account had no more papers left. During the evaluation, a sent
// upload still waits for its turn.
function PartialEvaluationNotice({ status, uploads }: { status: TestStatus; uploads: UploadRow[] }) {
  const pending = uploads.filter(
    (row) => row.fileCount > 0 && (row.status === 'uploading' || (status === 'done' && row.status === 'submitted')),
  );
  if (pending.length === 0) return null;
  const what = pending.length === 1 ? '1 lucrare cu fișiere nu a fost corectată' : `${pending.length} lucrări cu fișiere nu au fost corectate`;
  return (
    <div className="warning" role="status">
      <p>
        <strong>Evaluare parțială.</strong> {what}. Redeschide încărcarea și pornește evaluarea pentru ele.
      </p>
    </div>
  );
}
```

- [ ] **Step 35: Replace `src/admin/pages/TestPage.tsx`**

```tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import type { BaremRequest, RobotStart, TestDetail } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { normalizeTestCode, type TestStatus } from '../../../shared/tests.ts';
import { classToneClass, classToneStyle } from '../../ui/classTone.ts';
import { formatDateTime, robotStartMessage, studentCountLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { stageFromHash, stagesOf } from '../stages.ts';
import { StageList } from '../testPage/StageList.tsx';
import { StagePanel } from '../testPage/StagePanel.tsx';
import { waitsForBarem, waitsForPrint } from '../testPage/StartRobotButton.tsx';
import { TestSheet } from '../testPage/TestSheet.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

// While students upload (and later while the robot grades), the page asks for
// news every 10 seconds, and also while a generated barem or the print PDF of
// a draft is awaited.
export function refreshInterval(status: TestStatus | undefined, baremRequest?: BaremRequest, printWaits = false): number | false {
  return status === 'open' || status === 'evaluating' || baremRequest === 'requested' || printWaits ? 10_000 : false;
}

export function TestPage() {
  const code = normalizeTestCode(useParams().code ?? '');
  if (code === null) return <NotFoundPage />;
  return <TestDetails key={code} code={code} />;
}

function TestDetails({ code }: { code: string }) {
  const api = useApi();
  const detail = useQuery({
    queryKey: ['test', code],
    queryFn: () => api.getTest(code),
    refetchInterval: (query) => {
      const shown = query.state.data?.test;
      return refreshInterval(shown?.status, shown?.barem.request, shown ? waitsForPrint(shown) : false);
    },
  });

  if (detail.isPending) return <p>Se încarcă…</p>;
  // A failed first load has nothing to show. A failed refresh keeps the page,
  // and an open QR view with it, and says why above it.
  if (detail.data === undefined) return <ErrorMessage error={detail.error} />;
  return <TestView code={code} detail={detail.data} refreshError={detail.isRefetchError ? detail.error : null} />;
}

// The test page of the redesign (spec §6): the six stages and Fișa testului,
// and the panel of the chosen stage.
function TestView({ code, detail, refreshError }: { code: string; detail: TestDetail; refreshError: Error | null }) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  // When the robot starts, after the teacher started or restarted grading.
  const [robotNotice, setRobotNotice] = useState<string | null>(null);
  const onRobot = (robot: RobotStart | null) => setRobotNotice(robot ? robotStartMessage(robot) : null);
  // The uploads to grade at the next Start evaluation (submission ids).
  // Empty at first, so the start button stays off until the teacher selects.
  const [selected, setSelected] = useState<number[]>([]);
  const { test, uploads, robot, showModel } = detail;
  const { stages, current } = stagesOf(test);
  // The page opens on the stage the test is at when it first loads. After
  // that only the teacher changes the panel: a refresh or a button that moves
  // the test on keeps it.
  const [opened] = useState(current.name);
  const chosen = stageFromHash(location.hash) ?? opened;

  // The list of the year is read on every page (the shell): read it again,
  // but do not wait for it.
  const refresh = async () => {
    void queryClient.invalidateQueries({ queryKey: ['tests'] });
    await queryClient.invalidateQueries({ queryKey: ['test', code] });
  };

  // A failed robot start that the API kept: a scheduled start happens in any
  // request, so only the API knows of it. A button's answer says the same.
  // A draft or open test waits for the robot only for its print PDF or its barem.
  const robotWork = test.status === 'evaluating' || waitsForPrint(test) || waitsForBarem(test);
  const robotText = robotWork && robot.startFailed ? robotStartMessage('next_check') : robotNotice;

  return (
    <section className="test-page">
      <p className="back-link">
        <Link to="/">← Toate testele</Link>
      </p>
      <div className="test-head">
        <h1>{test.title}</h1>
        <p className="test-sub">
          <Link className={`class-badge ${classToneClass()}`} style={classToneStyle(test.classId)} to={`/clase/${test.classId}`}>
            {displayClassName(test.className)}
          </Link>{' '}
          · {studentCountLabel(test.studentCount)} · {test.startedAt ? `început ${formatDateTime(test.startedAt)}` : 'ciornă'}
        </p>
      </div>
      {refreshError && <ErrorMessage error={refreshError} />}
      {notice && (
        <p className="alert" role="alert">
          {notice}
        </p>
      )}
      {robotText && <p role="status">{robotText}</p>}
      <div className="test-grid">
        <StageList stages={stages} chosen={chosen} />
        <StagePanel
          stage={chosen}
          test={test}
          uploads={uploads}
          robot={robot}
          showModel={showModel}
          selected={selected}
          onSelect={setSelected}
          onChanged={refresh}
          onRobot={onRobot}
        />
        <TestSheet test={test} onChanged={refresh} />
      </div>
    </section>
  );
}
```

- [ ] **Step 36: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
import { useGeneratedBarem } from './GeneratedBarem.tsx';
import { PrintTest } from './PrintTest.tsx';

```

Replace it with:

```tsx
import { useGeneratedBarem } from './GeneratedBarem.tsx';

```

- [ ] **Step 37: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx

// The test and the barem: open them, upload them, or replace them. Not while
// the robot grades with them; while their exercise list has a problem or
// failed, the robot uses neither, and the teacher may fix them. A new barem
// during evaluation starts the robot, which makes the exercise list again.
// Before the uploads close, the test with the QR code shows under the test
// file: the teacher prints it before the day of the test.
export function TestFiles({
```

Replace it with:

```tsx

// The test and the barem (the panel Pregătire of the test page): open them,
// upload them, or replace them. Not while the robot grades with them; while
// their exercise list has a problem or failed, the robot uses neither, and the
// teacher may fix them. A new barem during evaluation starts the robot, which
// makes the exercise list again.
export function TestFiles({
```

- [ ] **Step 38: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
  const generated = useGeneratedBarem({ test, onChanged, onRobot });
  // Before the uploads close: the barem can be generated, and the test printed.
  const beforeClose = test.status === 'draft' || test.status === 'open';
```

Replace it with:

```tsx
  const generated = useGeneratedBarem({ test, onChanged, onRobot });
  // Before the uploads close: the barem can be generated.
  const beforeClose = test.status === 'draft' || test.status === 'open';
```

- [ ] **Step 39: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
    <>
      <h2>Fișiere</h2>
      {locked && <p className="hint">Testul se corectează acum. Poți schimba fișierele după ce se termină corectarea.</p>}
      <ul className="file-list">
        <TestFileRow code={test.code} kind="test" file={test.files.test} locked={locked} onChanged={onChanged} onRobot={onRobot}>
          {beforeClose && <PrintTest test={test} onChanged={onChanged} onRobot={onRobot} />}
        </TestFileRow>
        <TestFileRow
```

Replace it with:

```tsx
    <>
      {locked && <p className="hint">Testul se corectează acum. Poți schimba fișierele după ce se termină corectarea.</p>}
      <ul className="file-list">
        <TestFileRow code={test.code} kind="test" file={test.files.test} locked={locked} onChanged={onChanged} onRobot={onRobot} />
        <TestFileRow
```

- [ ] **Step 40: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
  status,
  children,
}: {
```

Replace it with:

```tsx
  status,
}: {
```

- [ ] **Step 41: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
  status?: ReactNode;
  children?: ReactNode;
}) {
```

Replace it with:

```tsx
  status?: ReactNode;
}) {
```

- [ ] **Step 42: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
      )}
      {children}
    </li>
```

Replace it with:

```tsx
      )}
    </li>
```

- [ ] **Step 43: Edit `src/admin/testPage/ExerciseListBanner.tsx`**

Find this block:

```tsx
import { useMutation } from '@tanstack/react-query';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
```

Replace it with:

```tsx
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
```

- [ ] **Step 44: Edit `src/admin/testPage/ExerciseListBanner.tsx`**

Find this block:

```tsx
import { ErrorMessage } from '../ErrorMessage.tsx';

```

Replace it with:

```tsx
import { ErrorMessage } from '../ErrorMessage.tsx';
import { stageHash } from '../stages.ts';

```

- [ ] **Step 45: Edit `src/admin/testPage/ExerciseListBanner.tsx`**

Find this block:

```tsx
// exercises (spec §9). Shown only when that list needs the teacher: its
// points do not add up, or the robot could not make it.
export function ExerciseListBanner({
```

Replace it with:

```tsx
// exercises (spec §9). Shown only when that list needs the teacher: its
// points do not add up, or the robot could not make it. It shows in the panel
// Corectare; the barem is replaced in the panel Pregătire.
export function ExerciseListBanner({
```

- [ ] **Step 46: Edit `src/admin/testPage/ExerciseListBanner.tsx`**

Find this block:

```tsx
        </p>
        <p>Înlocuiește baremul mai sus, sau corectează cu baremul așa cum este.</p>
        <button type="button" className="button-quiet button-small" disabled={accept.isPending} onClick={() => accept.mutate()}>
          Folosește oricum
        </button>
        {accept.error && <ErrorMessage error={accept.error} />}
```

Replace it with:

```tsx
        </p>
        <p>Înlocuiește baremul la Pregătire, sau corectează cu baremul așa cum este.</p>
        <span className="row-actions">
          <button type="button" className="button-quiet button-small" disabled={accept.isPending} onClick={() => accept.mutate()}>
            Folosește oricum
          </button>
          <Link className="button-quiet button-small" to={{ hash: stageHash('Pregătire') }} replace>
            Înlocuiește baremul
          </Link>
        </span>
        {accept.error && <ErrorMessage error={accept.error} />}
```

- [ ] **Step 47: Edit `src/admin/testPage/ResultsAccess.tsx`**

Find this block:

```tsx
    <section aria-label="Rezultatele elevilor">
      <h2>Rezultatele elevilor</h2>
      {test.resultsOpen ? (
```

Replace it with:

```tsx
    <section aria-label="Rezultatele elevilor">
      <h3>Rezultatele elevilor</h3>
      {test.resultsOpen ? (
```

- [ ] **Step 48: Edit `src/admin/testPage/UploadLink.tsx`**

Find this block:

```tsx
        <input id={inputId} type="text" value={url} readOnly onFocus={(event) => event.target.select()} />
        <button type="button" className="button button-small" onClick={copy}>
          Copiază linkul
```

Replace it with:

```tsx
        <input id={inputId} type="text" value={url} readOnly onFocus={(event) => event.target.select()} />
        <button type="button" className="button-quiet button-small" onClick={copy}>
          Copiază linkul
```

- [ ] **Step 49: Edit `src/ui/brand.css`**

Find this block:

```css

/* The back link at the top of a page: tight, so the page starts higher. */
```

Replace it with:

```css

/* The test page (redesign spec §6): the six stages and Fișa testului on the
   left, the panel of the chosen stage on the right. On a phone: the stages,
   the panel, then Fișa testului. */
.test-head {
  margin-bottom: 1rem;
}

.test-head h1 {
  margin: 0;
}

.test-sub {
  margin: 0.25rem 0 0;
  color: var(--muted);
}

.test-page > .alert,
.test-page > [role="status"] {
  margin: 0 0 1rem;
}

.test-grid {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  grid-template-rows: auto 1fr;
  grid-template-areas:
    "stages panel"
    "sheet panel";
  gap: 1rem 1.5rem;
  align-items: start;
}

.stage-list,
.stage-panel,
.test-sheet {
  min-width: 0;
  border: 1px solid var(--rule);
  border-radius: var(--radius-panel);
  background: var(--sheet);
}

.stage-list {
  grid-area: stages;
  padding: 0.5rem;
}

.stage-list ol {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.stage-list li {
  position: relative;
}

/* The line from one dot to the next: blue after a done stage. */
.stage-list li:not(:last-child)::after {
  content: "";
  position: absolute;
  top: 36px;
  bottom: -8px;
  left: 21px;
  width: 2px;
  background: var(--active);
}

.stage-list li.is-done:not(:last-child)::after {
  background: var(--ink);
}

.stage-list a {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  column-gap: 12px;
  align-items: start;
  padding: 10px;
  border-radius: var(--radius);
  color: var(--text);
  text-decoration: none;
}

.stage-list a:hover {
  background: var(--raised);
}

.stage-list a[aria-current="step"] {
  background: var(--ink-tint);
}

.stage-dot {
  grid-row: span 2;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 2px solid var(--control);
  border-radius: 50%;
  background: var(--sheet);
}

.stage-dot svg {
  width: 12px;
  height: 12px;
}

.stage-list .is-done .stage-dot {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--on-ink);
}

.stage-list .is-wait .stage-dot {
  border-color: var(--orange-mark);
  background: var(--orange-mark);
  box-shadow: inset 0 0 0 4px var(--sheet);
}

.stage-list .is-now .stage-dot {
  border-color: var(--ink);
  background: var(--ink-tint);
}

.stage-name {
  font-weight: 700;
  line-height: 1.3;
}

.stage-list .is-later .stage-name {
  color: var(--muted);
  font-weight: 600;
}

.stage-note {
  color: var(--muted);
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}

.stage-list .is-wait .stage-note {
  color: var(--orange);
  font-weight: 600;
}

/* Scrolled to after "Următoarea etapă": it stays clear of the sticky top bar. */
.stage-panel {
  grid-area: panel;
  scroll-margin-top: 6rem;
}

.stage-head {
  padding: 1.25rem 1.5rem 1rem;
  border-bottom: 1px solid var(--line);
}

.stage-head h2 {
  margin: 0;
  font-size: 1.25rem;
}

/* The heading takes the focus after "Următoarea etapă"; it is not a control. */
.stage-head h2:focus {
  outline: none;
}

.stage-head p {
  max-width: 62ch;
  margin: 0.25rem 0 0;
  color: var(--muted);
}

.stage-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
  padding: 1.25rem 1.5rem 1.5rem;
}

.stage-body > * {
  margin-block: 0;
}

.stage-body > h3 {
  margin-top: 0.75rem;
  font-size: 1rem;
}

.next-stage {
  padding-top: 0.75rem;
  border-top: 1px solid var(--line);
  text-align: right;
}

.test-sheet {
  grid-area: sheet;
  font-size: 0.875rem;
}

.test-sheet h2 {
  margin: 0;
  padding: 1rem 1.25rem 0.25rem;
  font-size: 1rem;
}

.sheet-facts {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.5rem 1rem;
  margin: 0;
  padding: 0.5rem 1.25rem 1rem;
}

.sheet-facts dt {
  color: var(--muted);
}

.sheet-facts dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
  overflow-wrap: anywhere;
}

.sheet-facts dd .tag {
  margin-left: 0.4rem;
}

.sheet-part {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--line);
}

.sheet-part > * {
  margin: 0;
}

.sheet-part h3 {
  font-size: 0.875rem;
}

.sheet-files {
  display: grid;
  gap: 0.5rem;
  padding: 0;
  list-style: none;
}

.sheet-files li {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0 0.75rem;
}

.sheet-files .hint {
  min-width: 0;
  overflow-wrap: anywhere;
}

.test-sheet .upload-link label {
  font-weight: 700;
}

.test-sheet .qr-row .qr {
  width: 120px;
  height: 120px;
}

.test-sheet .qr-row .qr-full {
  margin-left: 0;
}

.sheet-actions {
  justify-items: start;
}

.rename-form {
  display: grid;
  gap: 0.5rem;
  width: 100%;
}

.rename-form input {
  width: 100%;
}

@media (max-width: 56.25rem) {
  .test-grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
    grid-template-areas:
      "stages"
      "panel"
      "sheet";
  }

  .stage-head,
  .stage-body {
    padding-right: 1rem;
    padding-left: 1rem;
  }
}

/* The back link at the top of a page: tight, so the page starts higher. */
```

- [ ] **Step 50: Edit `src/ui/brand.css`**

Find this block:

```css

/* A heading with one small button on its row (Încărcarea lucrărilor). */
.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin: 1.75rem 0 0.5rem;
}

.section-head h2 {
  margin: 0;
}

/* The next section follows closer when this row has nothing under it. */
.section-head + h2 {
  margin-top: 1rem;
}

.file-title {
```

Replace it with:

```css

.file-title {
```

- [ ] **Step 51: Edit `src/ui/brand.css`**

Find this block:

```css

/* The test with the QR code: its own part of the test's card, set off by a rule. */
.print-test {
```

Replace it with:

```css

/* The test with the QR code, in the panel Tipărire of the test page. */
.print-test {
```

- [ ] **Step 52: Edit `src/ui/brand.css`**

Find this block:

```css
  gap: 0.4rem;
  margin-top: 0.4rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--rule);
}
```

Replace it with:

```css
  gap: 0.4rem;
}
```

- [ ] **Step 53: Edit `src/ui/brand.css`**

Find this block:

```css
.print-test > * {
  margin: 0;
}

```

Replace it with:

```css
.print-test > * {
  margin: 0;
}

/* A button alone on its line keeps its own width. */
.print-test > button,
.file-list > li > button {
  justify-self: start;
}

```

- [ ] **Step 54: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  115 passed | 1 skipped (116)`, `Tests  1819 passed | 3 skipped (1822)`.

- [ ] **Step 55: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 56: Commit**

```bash
git add src/admin/pages/TestPage.tsx src/admin/pages/TestPage.test.tsx src/admin/pages/TestPagePrint.test.tsx src/admin/testPage/StageList.tsx src/admin/testPage/StagePanel.tsx src/admin/testPage/TestSheet.tsx src/admin/testPage/TestFiles.tsx src/admin/testPage/ExerciseListBanner.tsx src/admin/testPage/ResultsAccess.tsx src/admin/testPage/UploadLink.tsx src/admin/testPage/GeneratedBarem.test.tsx src/admin/testPage/PrintTest.test.tsx src/admin/Layout.test.tsx src/test/renderAdmin.tsx src/ui/brand.css
git commit -m "Make the test page six stages with a panel each, and Fișa testului"
```

### Task 4: The papers to check in Verificare

The panel Verificare lists the papers with points to check, each with "Decide", and starts with "Începe verificarea".

**Files:**
- Create: `src/admin/testPage/ReviewList.tsx`
- Modify: `src/admin/testPage/StagePanel.tsx`, `src/ui/brand.css`
- Test: `src/admin/pages/TestPage.test.tsx`

**Interfaces:**
- Consumes: `UploadRow.flagCount`, `UploadRow.submissionId`, the paper's page `/teste/:code/elevi/:submissionId`.
- Produces: `ReviewList({ test, uploads })`.

- [ ] **Step 1: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('TestPage Verificare', () => {
  function reviewApi(rows: UploadRow[]) {
    return createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [fakeTest({ status: 'done', startedAt: '2026-10-06T07:15:00.000Z' }, rows)],
    });
  }

  it('lists the papers with points to check, each opening its page, and starts with the first', async () => {
    renderAdmin(
      PAGE,
      reviewApi([
        fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 8.75, flagCount: 1 }),
        fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
        fakeUpload({ studentId: 12, studentName: 'Marin Dan', submissionId: 7, status: 'graded', fileCount: 1, grade: 6.5, flagCount: 3 }),
      ]),
    );
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
    expect(within(panel).getByRole('rowheader', { name: 'Stan Eva' })).toBeInTheDocument();
  });

  it('says when every point is checked', async () => {
    renderAdmin(
      `${PAGE}#verificare`,
      reviewApi([fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 })]),
    );
    expect(await screen.findByText('Toate punctele sunt verificate.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Începe verificarea' })).not.toBeInTheDocument();
  });

  it('waits for the grading before it lists anything', async () => {
    renderAdmin(`${PAGE}#verificare`, apiWith({ status: 'evaluating' }));
    expect(await screen.findByText('Punctele nesigure apar după ce se corectează lucrările.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Lucrări cu puncte de verificat' })).not.toBeInTheDocument();
    expect(screen.queryByText('Toate punctele sunt verificate.')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/TestPage.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  2 failed | 103 passed (105)`: the panel Verificare has no papers to check yet (`Unable to find an accessible element with the role "link" and name "Începe verificarea"`, and `Unable to find an element with the text: Toate punctele sunt verificate.`). "waits for the grading before it lists anything" passes already, as a guard: the panel of Task 3 says the same line before the grading.

- [ ] **Step 3: Create `src/admin/testPage/ReviewList.tsx`**

```tsx
import { useId } from 'react';
import { Link } from 'react-router';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { countLabel } from '../../ui/format.ts';

// The papers with points to check, in the panel Verificare (redesign spec §6):
// each opens the paper's page, where the teacher decides. The API counts the
// points of each paper but does not list them: the list of each point with
// its reason comes with the review of Phase 6.
export function ReviewList({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }) {
  const id = useId();
  const papers = uploads.filter((row) => row.status === 'graded' && row.flagCount > 0 && row.submissionId !== null);
  const first = papers[0];
  if (first === undefined) return <p>Toate punctele sunt verificate.</p>;
  const paperPage = (row: UploadRow) => `/teste/${test.code}/elevi/${row.submissionId}`;
  return (
    <>
      <p>
        <Link className="button" to={paperPage(first)}>
          Începe verificarea
        </Link>
      </p>
      <h3 id={id}>Lucrări cu puncte de verificat</h3>
      <ul className="review-list" aria-labelledby={id}>
        {papers.map((row) => (
          <li key={row.studentId}>
            <span className="review-name">{row.studentName}</span>
            {row.grade !== null && <span>nota {formatPoints(row.grade)}</span>}
            <span className="tag tag-wait">{countLabel(row.flagCount, 'punct de verificat', 'puncte de verificat')}</span>
            <Link className="button-quiet button-small" to={paperPage(row)} aria-label={`Decide: ${row.studentName}`}>
              Decide
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
```

- [ ] **Step 4: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
import { hasResultsToManage, ResultsAccess } from './ResultsAccess.tsx';
import { RobotLine } from './RobotLine.tsx';
```

Replace it with:

```tsx
import { hasResultsToManage, ResultsAccess } from './ResultsAccess.tsx';
import { ReviewList } from './ReviewList.tsx';
import { RobotLine } from './RobotLine.tsx';
```

- [ ] **Step 5: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
function ReviewPanel(props: PanelProps) {
  const { test } = props;
  if (test.status === 'draft') return <p className="hint">Punctele nesigure apar după ce se corectează lucrările.</p>;
```

Replace it with:

```tsx
function ReviewPanel(props: PanelProps) {
  const { test, uploads } = props;
  if (test.status === 'draft') return <p className="hint">Punctele nesigure apar după ce se corectează lucrările.</p>;
```

- [ ] **Step 6: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
    <>
      {test.gradedCount === 0 && <p className="hint">Punctele nesigure apar după ce se corectează lucrările.</p>}
      <Papers {...props} selectable={false} />
```

Replace it with:

```tsx
    <>
      {test.gradedCount === 0 ? (
        <p className="hint">Punctele nesigure apar după ce se corectează lucrările.</p>
      ) : (
        <ReviewList test={test} uploads={uploads} />
      )}
      <Papers {...props} selectable={false} />
```

- [ ] **Step 7: Edit `src/ui/brand.css`**

Find this block:

```css
}

.test-sheet {
  grid-area: sheet;
```

Replace it with:

```css
}

/* The papers with points to check, in the panel Verificare. */
.review-list {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--line);
}

.review-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  padding: 0.625rem 0;
  border-bottom: 1px solid var(--line);
}

.review-name {
  flex: 1 1 12rem;
  min-width: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.test-sheet {
  grid-area: sheet;
```

- [ ] **Step 8: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  115 passed | 1 skipped (116)`, `Tests  1822 passed | 3 skipped (1825)`.

- [ ] **Step 9: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 10: Commit**

```bash
git add src/admin/testPage/ReviewList.tsx src/admin/testPage/StagePanel.tsx src/admin/pages/TestPage.test.tsx src/ui/brand.css
git commit -m "List the papers with points to check in the panel Verificare"
```

### Task 5: The notes for the next sessions

`src/AGENTS.md` describes the test page, its stage addresses, and how its page tests open a stage.

**Files:**
- Modify: `src/AGENTS.md`

- [ ] **Step 1: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (files, link, evaluation controls, the barem warning (`ExerciseListBanner.tsx`), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table, "Recorectează tot"). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `classPage/GradesTable.tsx` is the class page's grade table (students by tests, newest test on the left; it hides archived tests unless asked, and keeps a column for draft and open tests). `pages/ClassStudentsPage.tsx` is "Elevii clasei" (add, rename, "A plecat", "Șterge"). `pages/StudentPage.tsx` is a student's history. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `pages/LoginPage.tsx` is the login and sign-up form: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. `pages/AccountPage.tsx` is Contul meu (password, "Ieși din cont"). `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). A demo account sees, at the top of every page, how many papers it may still have graded. `pages/ReportPage.tsx` and `reportPage/` are the class report (`shared/stats.ts` makes its numbers). `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`)); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (the account menu, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. `todo.ts` decides "De făcut" from the tests list: exactly the three cases of spec §5. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme and the account move under ☰ (CSS and `PhoneMenu.tsx`).
- `pages/TestsPage.tsx` is the start page, the Teste page of the redesign (spec §5): the greeting and today's date in Romania's time (`testsPage/greeting.ts`), "N lucruri te așteaptă ˅", which opens the list of what waits in place (`testsPage/TodoRows.tsx`: "De făcut" of every class of the year, as the bar counts it, whatever chip is chosen), the class chips and the box "Arată și testele arhivate", and the groups "În lucru" and "Terminate" (`testsPage/TestGroup.tsx`; `inWork()` in `shell/todo.ts` is the rule of the panel "Clasele tale" too). A row shows the test, the stage bar and the current stage, the papers, and one next step (`testsPage/nextStep.ts`): a link to the test, or the button that publishes the results on the row; "Oprește accesul" stays on a row whose results are open. Below 768px each row is a block.
- `stages.ts`: the six stages of a test (Pregătire, Tipărire, În clasă, Corectare, Verificare, Rezultate), each done, waiting on the teacher, in progress or later, and the current one, from the tests list (`TestSummary.prepared`, `barem`, the counts and `averageGrade`). A stage waits on the teacher (orange) exactly when `todoOf()` has the test, at that stage. The test page of Phase 4 uses it too.
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `pages/TestPage.tsx` holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
- `ui/GradingProgress.tsx` is the grading bar (blue graded, pale blue waiting, empty track not sent) under the test page's uploads heading only (the Teste page shows the stage bar instead); "✓ Corectat complet" shows when every sent paper is graded. The bar is `aria-hidden`: the counts stay in words. `EvaluationControls` shows "Marchează ca terminat" in place of the start button when a paper is graded and none waits.
```

Replace it with:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table, with its checkboxes only in Corectare), Fișa testului (`TestSheet.tsx`: the facts, the files, the students' link while the test is a draft or open, rename, archive, delete), the papers to check in Verificare (`ReviewList.tsx`), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table, "Recorectează tot"). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `classPage/GradesTable.tsx` is the class page's grade table (students by tests, newest test on the left; it hides archived tests unless asked, and keeps a column for draft and open tests). `pages/ClassStudentsPage.tsx` is "Elevii clasei" (add, rename, "A plecat", "Șterge"). `pages/StudentPage.tsx` is a student's history. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `pages/LoginPage.tsx` is the login and sign-up form: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. `pages/AccountPage.tsx` is Contul meu (password, "Ieși din cont"). `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). A demo account sees, at the top of every page, how many papers it may still have graded. `pages/ReportPage.tsx` and `reportPage/` are the class report (`shared/stats.ts` makes its numbers). `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`)); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (the account menu, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. `todo.ts` decides "De făcut" from the tests list: exactly the three cases of spec §5. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme and the account move under ☰ (CSS and `PhoneMenu.tsx`).
- `pages/TestsPage.tsx` is the start page, the Teste page of the redesign (spec §5): the greeting and today's date in Romania's time (`testsPage/greeting.ts`), "N lucruri te așteaptă ˅", which opens the list of what waits in place (`testsPage/TodoRows.tsx`: "De făcut" of every class of the year, as the bar counts it, whatever chip is chosen), the class chips and the box "Arată și testele arhivate", and the groups "În lucru" and "Terminate" (`testsPage/TestGroup.tsx`; `inWork()` in `shell/todo.ts` is the rule of the panel "Clasele tale" too). A row shows the test, the stage bar and the current stage, the papers, and one next step (`testsPage/nextStep.ts`): a link to the test, or the button that publishes the results on the row; "Oprește accesul" stays on a row whose results are open. Below 768px each row is a block.
- `stages.ts`: the six stages of a test (Pregătire, Tipărire, În clasă, Corectare, Verificare, Rezultate), each done, waiting on the teacher, in progress or later, and the current one, from the tests list (`TestSummary.prepared`, `barem`, the counts and `averageGrade`). A stage waits on the teacher (orange) exactly when `todoOf()` has the test, at that stage. The test page uses it too: it opens on the current stage, and `stageHash()` and `stageFromHash()` give each stage's panel its address (`#pregatire` … `#rezultate`). After the first load only the teacher changes the panel: a refresh or a button that moves the test to another stage keeps it. The Teste page's "Pornește corectarea" opens `#corectare`.
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `testPage/StagePanel.tsx` (the panel În clasă) holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
- `ui/GradingProgress.tsx` is the grading bar (blue graded, pale blue waiting, empty track not sent) under the test page's uploads heading only (the Teste page shows the stage bar instead); "✓ Corectat complet" shows when every sent paper is graded. The bar is `aria-hidden`: the counts stay in words. `EvaluationControls` shows "Marchează ca terminat" in place of the start button when a paper is graded and none waits.
```

- [ ] **Step 2: Edit `src/AGENTS.md`**

Find this block:

```markdown
- The Vite dev proxy keeps the Host header (`changeOrigin: false`). Otherwise the API refuses every write as cross-site.
- Page tests that check a navigation use `expectLocation()`: it waits, because the navigation follows the API answer.
```

Replace it with:

```markdown
- The Vite dev proxy keeps the Host header (`changeOrigin: false`). Otherwise the API refuses every write as cross-site.
- Page tests that check a navigation use `expectLocation()`: it waits, because the navigation follows the API answer. `LocationProbe` shows the path, the search and the hash.
- The test page draws only the panel of the chosen stage. Its page tests open a stage by its address (`/teste/6E2-26T1#corectare`) or by its link in the list of stages (`openStage()` in `TestPage.test.tsx`). Without an address the page opens on the current stage of `stagesOf()`: fake data with no test file opens on Pregătire, an open test with its files on În clasă, a done test with points to check on Verificare. Fișa testului is a region beside every panel: its students' link, its "Copiază linkul" and its buttons are found from any stage.
```

- [ ] **Step 3: Commit**

```bash
git add src/AGENTS.md
git commit -m "Describe the test page and its stages in the notes"
```

### Task 6: Look at it, then the pull request (main session)

Not a subagent task. Nothing here changes code unless a check fails; a fix found here is prototyped, tested and committed like the tasks above, and named to the user.

- [ ] **Step 1: Check the exactness of the branch**

Run: `git diff --stat refs/proto8/w5 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

- [ ] **Step 2: Run the whole suite three times, and once in UTC**

Run `npm test` three times, then once with `TZ=UTC` (Git Bash: `TZ=UTC npm test`).
Expected: PASS every time. `Test Files  115 passed | 1 skipped (116)`, `Tests  1822 passed | 3 skipped (1825)`.

- [ ] **Step 3: Build and start the production build**

Check port 8788 first (`netstat -ano | findstr :8788`; end a leftover `workerd.exe` as `AGENTS.md` says). Then `npm run db:local`. If `npx wrangler d1 execute quickeval --local --command "SELECT code FROM tests WHERE code = '11C-26T2'"` finds no row, load the sample tests once: `npx wrangler d1 execute quickeval --local --file .superpowers/tools/phase4/sample8.sql` (git-ignored, on this PC: one test at each stage, a draft whose print PDF failed, an archived test). Then the Claude Code preview server `preview` (`npm run preview`, http://127.0.0.1:8788).
Expected: `Ready on http://127.0.0.1:8788`.

- [ ] **Step 4: Look at the test page at 1440px and at 390px, light and dark**

Open `/admin/teste/11C-26T1` (Pregătire waits), `11C-26T2` (Tipărire failed), `9A-26T1` (În clasă, then `#corectare`), `12D-26T1` (Corectare), `10B-26T3` (Verificare), `10B-26T2` (Rezultate) and `9B-26T1` (archived). Click each stage link and the next-stage link: the address changes, Back leaves the page, the panel stays after a refresh, and after "Următoarea etapă" at the end of a long panel (Corectare of `12D-26T1`) the new panel's heading is in view. On each test and stage measure in the browser `document.documentElement.scrollWidth <= innerWidth`, and on the phone, after scrolling to the end, that the bottom of `.test-sheet` is above the top of `.rail`.
Expected: the look of round 5 (Z3.1), pages "Test · …"; no sideways scroll; nothing hidden behind the bars; one filled button per panel at most.

- [ ] **Step 5: Run the smoke test**

Run: `npm run smoke` (second terminal, while the preview runs).
Expected: every check passes.

- [ ] **Step 6: Commit the plan**

```bash
git add docs/superpowers/plans/2026-11-05-mqgrader-phase-4-test-page.md
git commit -m "Add the Phase 4 plan"
```

- [ ] **Step 7: Ask the user, then push and open the pull request**

Ask the user before pushing. On a yes: `git push -u origin feature/mqgrader-test-page`, then a ready pull request into `main` that lists what changed, the rulings above, and what was checked.

# MQGrader Phase 3: The Teste Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 6 must run in the main session, not in a subagent:** it looks at the app in a browser, and every outward step (push, pull request) needs the user's explicit yes.

**Goal:** The start page of the teacher app becomes the Teste page of the redesign: "Bună dimineața, Laura." with the date and "N lucruri te așteaptă ˅", which opens the list of what waits in place; the class chips; and the tests of the year in two tables, "În lucru" and "Terminate", where each test shows a bar of its six stages, its papers and one next step.

**Architecture:** The API adds two fields to each test of the tests list: `prepared` (the test file, a barem file, the print PDF) and `averageGrade` (the class report's average, made by the same function). The six stages of a test are a pure function of the tests list (`src/admin/stages.ts`, for the test page of Phase 4 too); it uses "De făcut" (`todoOf`), so a stage is orange exactly when "De făcut" has the test. The next step of a row, the greeting and the date are pure functions too (`src/admin/testsPage/`). The page (`src/admin/pages/TestsPage.tsx`) draws them; a row still publishes the results or stops them in place, as the old cards did.

**Tech Stack:** Node 24, TypeScript, React 19, TanStack Query, React Router, Vitest 5, Testing Library, Hono 4, Cloudflare D1. No new npm dependencies, no migration.

**Spec:** `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md` (§1 decisions 20-21, §5 the Teste page, §13 phase 3). Task 1 writes the decisions of 2026-11-05 into it. Root `AGENTS.md`, `src/AGENTS.md` and `server/AGENTS.md` hold the project rules. The approved prototype: round 5 (Z3.1) https://claude.ai/artifact/JfoJqXjZVryZCHebhG8QHw, page "Teste".

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- Times on screen are Romania's time (`Europe/Bucharest`), whatever the PC's time zone.
- Flat colours only: no gradient anywhere in `brand.css`; a shadow only on what floats. Orange only for what waits on the teacher.
- Every teacher query is scoped by the teacher's id (the one server change here only adds columns to a scoped query). The browser never sees an R2 key.
- Functions: at most 10 ms of CPU and 15 D1 queries per request (the list keeps its one query).
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A` (the checkout holds local files that must not be committed: a `.gitignore` line, `.claude/launch.json` entries).
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root `D:\Projects\QuickEval`, on the branch `feature/mqgrader-teste-page`. Run `npm test` alone, in the foreground: `runner/run.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy, on `main` too. On 2026-11-05 the login test "gives an IP its attempt back for a good password" took about 22 s in most full runs of the prototype, on every task. If only tests of those two files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts` alone: `Test Files  2 passed (2)`, `Tests  84 passed (84)`. Then the full run counts as passed when its failed and passed tests add up to the expected passed number (for example `Tests  1 failed | 1805 passed | 3 skipped (1809)` for 1806); say so in the task report.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; overwrite all of it with exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/proto7/v1` … `refs/proto7/v5`, one per task, on `refs/proto7/vbase` (the same files as `main` at `1ec3e8e`). After Task N, `git diff --stat refs/proto7/vN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`). Four tests run the real pandoc (`runner/baremDocx.test.ts`, `runner/baremTask.test.ts`, `runner/workdir.test.ts`): without pandoc they skip too, so every total shows 4 fewer passed and 4 more skipped.

## Rulings made while planning

Decided with the user on 2026-11-05 or while building the prototype; Task 1 writes them into the spec.

1. The rows keep the results buttons of the old cards (the user): "Publică rezultatele", or "Publică pentru toți" after some single publishes, publishes on the row; "Oprește accesul" is on every row whose results are open.
2. A finished test shows "media testului" (the user). The API gives `averageGrade` in the tests list, made by `averageGrade()` of `shared/stats.ts`, the function the class report's statistics use, from the grades the list's own query reads (`json_group_array`): the same number by construction, and still one query.
3. The tests list also gives `prepared: { testFile, baremFile, print }` (booleans and the print status, never a key): without it a draft with no barem and a draft ready for the class look the same.
4. The six stages are one pure function, `stagesOf()` in `src/admin/stages.ts`. A stage is orange exactly when `todoOf()` has the test, at that stage (a test checks every case). Tipărire counts as done once the test has started (tests made before the print PDF have none). Rezultate is done only for a done test.
5. "In work" is one rule, `inWork()` in `src/admin/shell/todo.ts`, for the panel "Clasele tale" and the Teste page.
6. The greeting changes at 5:00, 11:00 and 18:00, Romania's time; the name is the first word of the teacher's name.
7. The list of what waits and its count cover every class of the year, whatever chip is chosen: they are "De făcut" in the bar. Its buttons open the test, as in the panel; only a row of the table publishes in place.
8. The chips list every class of the year, as the old select did (archived classes too). The archived tests keep the old box "Arată și testele arhivate".
9. A row names its class in words ("Clasa 6E2 · început 6 oct."). The class colour stripe and the class link of the old cards go.
10. A row's publish waits until the list is read again, because the row's buttons come from the list (the saves of other pages do not wait for it).
11. On a narrow screen (below 768 px, as the uploads table) each row becomes a block.
12. "Terminate" keeps its column heads (the prototype hid them): a table without heads is harder to follow with a screen reader.
13. A test published for some students says so in its stage ("publicate pentru 2 elevi"), as the old card did. The words are the Rezultate `short` of `todoOf()`, so the panel "Clasele tale" says the same.

## Review Focus

1. The number on "De făcut", the count in the greeting and the orange segments always agree: one `todoList()`, and `stagesOf()` takes its orange from `todoOf()` (test in Task 3).
2. A long test title or class name, in a row and in the list of what waits: it wraps; the page never scrolls sideways (checked in Task 6 at 390px).
3. A publish from a row: the button cannot act twice while the list is read again, and the test moves to "Terminate" (tests in Task 4).
4. The greeting and "azi" near midnight and across the summer time change, whatever the PC's time zone (tests in Task 3).
5. A class chip chosen while other classes have things that wait: the count and the list still show them (test in Task 4).

---

### Task 1: The decisions of 2026-11-05 in the spec

The redesign spec gets the two answers of the user and says exactly what the Teste page shows: the greeting, the list of what waits, the chips, the groups, each stage and the next step.

**Files:**
- Modify: `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`

**Interfaces:**
- Produces: the spec text the later tasks build (§5).

- [ ] **Step 1: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown

Date: 2026-11-04. Status: agreed with the user after six rounds of prototypes. Phase 1 (landing page and light theme) is live; Phase 2 (look and shell) is being built; the other phases are not.

```

Replace it with:

```markdown

Date: 2026-11-04. Status: agreed with the user after six rounds of prototypes. Phase 1 (landing page and light theme) and Phase 2 (look and shell) are live; Phase 3 (Teste page) is being built; the other phases are not.

```

- [ ] **Step 2: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
19. No search box until search is designed (§11).

```

Replace it with:

```markdown
19. No search box until search is designed (§11).
20. The rows of the Teste page keep the results buttons of the old cards: "Publică rezultatele" publishes from the list, and "Oprește accesul" stays on a test whose results are open (Phase 3).
21. A finished test shows "media testului" on the Teste page, the same number as its class report (Phase 3).

```

- [ ] **Step 3: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown

- "Bună dimineața, Laura." and a line with the date and "**3 lucruri te așteaptă ˅** în 3 teste." The bold part is a button: it opens and closes the list "Ce ai de făcut" right under it (closed when the page opens). Each row: the stage as a pill, the task, the test and class, one button.
- The class filter as chips ("Toate clasele", one chip per class), kept in the address as today (`?clasa=`).
- "În lucru" and "Terminate" (archived ones with `?arhivate=1`, as today): a table with the test (name, class, start), the stage (a bar of six segments: blue done, orange waits on the teacher, pale in progress, grey later; the stage name and its state), the papers (sent of students), and the next step (one button, or "Nimic de făcut acum").
- "De făcut" counts exactly three cases, from the tests of the chosen school year that are not archived (`src/admin/shell/todo.ts`, Phase 2):
```

Replace it with:

```markdown

- "Bună dimineața, Laura." and a line with the date and "**3 lucruri te așteaptă ˅** în 3 teste." The bold part is a button: it opens and closes the list "Ce ai de făcut" right under it (closed when the page opens). Each row: the stage as a pill, the task, the test and class, one button to the test (the first one filled).
  - The greeting follows Romania's time: "Bună dimineața" from 5:00, "Bună ziua" from 11:00, "Bună seara" from 18:00. The name is the first word of the teacher's name; without a name the greeting is "Bună ziua." alone.
  - The date is today in Romania's time, the weekday first, with a capital letter: "Miercuri, 4 noiembrie".
  - The count and the list are those of "De făcut" in the bar: every class of the year, whatever chip is chosen. One thing: "1 lucru te așteaptă în 1 test."; none: "Nimic nu te așteaptă acum.", with no button.
- The class filter as chips ("Toate clasele", one chip per class of the year), kept in the address as today (`?clasa=`). After them, the box "Arată și testele arhivate" (`?arhivate=1`), as today.
- "În lucru" and "Terminate": a table with the test (its name as a link; the class and the start, or "ciornă"), the stage, the papers (sent of students; "—" for a draft), and the next step.
  - "În lucru" holds the tests in work, as the panel "Clasele tale" counts them: not archived, and not done, or done with a thing in "De făcut". "Terminate" holds the other done tests, and the archived ones with `?arhivate=1`, marked "Arhivat". A group with no test is left out.
  - The stage: a bar of six segments, one per stage (blue done, orange waits on the teacher, pale in progress, grey later), then the current stage's name and its state. The bar is for the eye only; the words say the same.
  - The stages of a test (`src/admin/stages.ts`, for the test page of Phase 4 too). A segment is orange exactly when "De făcut" has the test, at that stage.
    - Pregătire: orange with the case of "De făcut". Done when the test file is there and the barem is active, and always once the test is in evaluation or done. Else in progress: "lipsește testul", "baremul se generează", "lipsește baremul".
    - Tipărire: done when the print PDF exists, and once the test has started. In progress while the print PDF is made ("se pregătește") or after it failed ("nu s-a putut pregăti"). Later without a test file.
    - În clasă: later for a draft ("testul nu a început"), in progress while open ("elevii trimit lucrările"), done after.
    - Corectare: later before the evaluation, in progress during it ("15 din 22 corectate"), done when the test is done.
    - Verificare: orange while points wait ("3 puncte nesigure"), during the grading too. Done when a done test has none. In progress for an archived test that still has some. Later otherwise.
    - Rezultate: orange with the case of "De făcut" ("nepublicate", or "publicate pentru 2 elevi" after some results were published one by one; the panel "Clasele tale" says the same). Done when the test is done and its results are open, or every graded paper is published: "publicate · media testului 7,72", the average of the class report. Later otherwise; a done test with no graded paper says "nicio lucrare corectată".
    - The current stage is the first orange one, else the first in progress, else the first later one, else Rezultate.
  - The next step, from the current stage:
    - Pregătire: "Verifică baremul" or "Generează din nou baremul" when orange; "Încarcă testul" or "Încarcă baremul" in progress; nothing while the barem is generated.
    - Tipărire: nothing while the print PDF is made; "Deschide" after it failed.
    - În clasă: "Începe testul" for a draft; "Pornește corectarea" while open, and nothing when a time is set for it.
    - Corectare: nothing.
    - Verificare: "Verifică 3 puncte".
    - Rezultate: "Publică rezultatele" when orange, or "Publică pentru toți" after some results were published one by one; it publishes on the row (§1, decision 20). When done: "Raportul clasei", if a paper is graded.
    - Nothing: "Nimic de făcut acum".
    - Every other step is a link to the test page. A test whose results are open also has "Oprește accesul" on its row. The button of the first thing in "De făcut" is filled; the others are outlines.
  - On a phone (below 768 px) each row becomes a block: the test, the stage, the papers and the next step, one under the other.
- "De făcut" counts exactly three cases, from the tests of the chosen school year that are not archived (`src/admin/shell/todo.ts`, Phase 2):
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md
git commit -m "Write the Phase 3 decisions into the redesign spec"
```

### Task 2: The tests list says what each test has, and its average

`GET /api/admin/tests` and `GET /api/admin/classes/:id` answer each test with `prepared` and `averageGrade`; `GET /api/admin/tests/:code` gives them too (`TestInfo` extends `TestSummary`).

**Files:**
- Modify: `shared/api.ts` (`TestSummary`), `shared/stats.ts` (`averageGrade`, used by `classStats`), `server/db/tests.ts` (`SELECT_TEST`, `toRecord`), `src/test/fakeApi.ts` (the fake list makes both fields like the server)
- Test: `shared/stats.test.ts`, `server/routes/tests.test.ts`

**Interfaces:**
- Produces: `TestSummary.prepared: { testFile: boolean; baremFile: boolean; print: PrintStatus }`, `TestSummary.averageGrade: number | null`, `averageGrade(grades: number[]): number | null` in `shared/stats.ts`.

- [ ] **Step 1: Edit `shared/stats.test.ts`**

Find this block:

```ts
import type { ReportRow } from './api.ts';
import { classStats, GRADE_GROUPS } from './stats.ts';

```

Replace it with:

```ts
import type { ReportRow } from './api.ts';
import { averageGrade, classStats, GRADE_GROUPS } from './stats.ts';

```

- [ ] **Step 2: Edit `shared/stats.test.ts`**

Find this block:

```ts
}

```

Replace it with:

```ts
}

describe('averageGrade', () => {
  it('gives the average of the class report, in any order of the grades', () => {
    const grades = [7.5, 7.67, 9.13, 4.99];
    const rows = grades.map((grade, index) => row(index + 1, grade, [0, 0]));
    expect(averageGrade(grades)).toBe(classStats({ exercises, rows, missing: [] }).average);
    expect(averageGrade([...grades].reverse())).toBe(averageGrade(grades));
  });

  it('rounds a half cent up', () => {
    expect(averageGrade([7.5, 7.67])).toBe(7.59);
  });

  it('has none without grades', () => {
    expect(averageGrade([])).toBeNull();
  });
});

```

- [ ] **Step 3: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
import { DOCX_TYPE } from '../../shared/files.ts';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest, testIdOf } from '../test/fixtures.ts';
```

Replace it with:

```ts
import { DOCX_TYPE } from '../../shared/files.ts';
import { classStats } from '../../shared/stats.ts';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest, testIdOf } from '../test/fixtures.ts';
```

- [ ] **Step 4: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
      Fără: { request: 'none', unchecked: false },
    });
  });

```

Replace it with:

```ts
      Fără: { request: 'none', unchecked: false },
    });
  });

  it('says what each test has for the class: its file, a barem file and the print PDF', async () => {
    const cls = await makeClass(api, '6E2');
    await makeTest(api, cls.id, 'Gol');
    const ready = await makeTest(api, cls.id, 'Gata');
    await api.db
      .prepare(
        `UPDATE tests SET test_file_key = 'fixture/test.pdf', test_file_name = 'test.pdf', test_file_type = 'application/pdf',
           barem_file_key = 'fixture/barem.pdf', barem_file_name = 'barem.pdf', barem_file_type = 'application/pdf',
           print_status = 'ready', print_file_key = 'fixture/print.pdf'
         WHERE code = ?`,
      )
      .bind(ready)
      .run();

    const res = await api.request('GET', '/api/admin/tests?year=2026');
    const prepared = Object.fromEntries(res.body.tests.map((t: { title: string; prepared: unknown }) => [t.title, t.prepared]));
    expect(prepared).toEqual({
      Gol: { testFile: false, baremFile: false, print: 'none' },
      Gata: { testFile: true, baremFile: true, print: 'ready' },
    });
  });

  it('gives the average grade of the class report, and none before a paper is graded', async () => {
    const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva']);
    await makeTest(api, cls.id, 'Fără note');
    const code = await makeTest(api, cls.id, 'Cu note');
    for (const [index, grade] of [7.5, 7.67].entries()) {
      const submission = await addSubmission(api, code, cls.studentIds[index]!, { status: 'graded', files: 1 });
      await addEvaluation(api, submission, { grade });
    }
    await addSubmission(api, code, cls.studentIds[2]!, { status: 'submitted', files: 1 });

    const res = await api.request('GET', '/api/admin/tests?year=2026');
    const average = Object.fromEntries(res.body.tests.map((t: { title: string; averageGrade: number | null }) => [t.title, t.averageGrade]));
    expect(average).toEqual({ 'Fără note': null, 'Cu note': 7.59 });
    const report = await api.request('GET', `/api/admin/tests/${code}/report`);
    expect(average['Cu note']).toBe(classStats(report.body.report).average);
  });

```

- [ ] **Step 5: Run the tests to see them fail**

Run: `npx vitest run shared/stats.test.ts server/routes/tests.test.ts`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  5 failed | 29 passed (34)`: `averageGrade is not a function`, and the tests list has no `prepared` and no `averageGrade` yet (`expected { Gata: undefined, Gol: undefined } to deeply equal …`).

- [ ] **Step 6: Edit `shared/api.ts`**

Find this block:

```ts
  barem: { request: BaremRequest; unchecked: boolean };
}
```

Replace it with:

```ts
  barem: { request: BaremRequest; unchecked: boolean };
  // What the test has for the class: its file, a barem file (`barem` says
  // whether it is active), and the print PDF with the QR code. The Teste page
  // draws the stages from it.
  prepared: { testFile: boolean; baremFile: boolean; print: PrintStatus };
  // The average of the graded papers, as the class report gives it; null
  // while no paper is graded.
  averageGrade: number | null;
}
```

- [ ] **Step 7: Edit `shared/stats.ts`**

Find this block:

```ts

function median(sorted: number[]): number | null {
```

Replace it with:

```ts

// The average grade of a test, as the class report and the Teste page show
// it: the grades added from the lowest, then 2 decimals. Null with no grade.
export function averageGrade(grades: number[]): number | null {
  if (grades.length === 0) return null;
  const sorted = [...grades].sort((a, b) => a - b);
  return round2(sorted.reduce((total, grade) => total + grade, 0) / sorted.length);
}

function median(sorted: number[]): number | null {
```

- [ ] **Step 8: Edit `shared/stats.ts`**

Find this block:

```ts
  const grades = report.rows.map((row) => row.grade).sort((a, b) => a - b);
  const sum = grades.reduce((total, grade) => total + grade, 0);
  const groups = GRADE_GROUPS.map((group, index) => {
```

Replace it with:

```ts
  const grades = report.rows.map((row) => row.grade).sort((a, b) => a - b);
  const groups = GRADE_GROUPS.map((group, index) => {
```

- [ ] **Step 9: Edit `shared/stats.ts`**

Find this block:

```ts
    activeCount: activeGraded + report.missing.length,
    average: grades.length === 0 ? null : round2(sum / grades.length),
    median: median(grades),
```

Replace it with:

```ts
    activeCount: activeGraded + report.missing.length,
    average: averageGrade(grades),
    median: median(grades),
```

- [ ] **Step 10: Edit `server/db/tests.ts`**

Find this block:

```ts
import { DOCX_TYPE, type TestFileKind } from '../../shared/files.ts';
import { compareStudentNames } from '../../shared/students.ts';
```

Replace it with:

```ts
import { DOCX_TYPE, type TestFileKind } from '../../shared/files.ts';
import { averageGrade } from '../../shared/stats.ts';
import { compareStudentNames } from '../../shared/students.ts';
```

- [ ] **Step 11: Edit `server/db/tests.ts`**

Find this block:

```ts
  flag_count: number;
}
```

Replace it with:

```ts
  flag_count: number;
  grades_json: string;
}
```

- [ ] **Step 12: Edit `server/db/tests.ts`**

Find this block:

```ts
    (SELECT COALESCE(SUM(${flagCountSql('ev')}), 0)
       FROM evaluations ev JOIN submissions s ON s.id = ev.submission_id WHERE s.test_id = t.id) AS flag_count
  FROM tests t JOIN classes c ON c.id = t.class_id`;
```

Replace it with:

```ts
    (SELECT COALESCE(SUM(${flagCountSql('ev')}), 0)
       FROM evaluations ev JOIN submissions s ON s.id = ev.submission_id WHERE s.test_id = t.id) AS flag_count,
    (SELECT json_group_array(ev.grade)
       FROM evaluations ev JOIN submissions s ON s.id = ev.submission_id WHERE s.test_id = t.id AND s.status = 'graded') AS grades_json
  FROM tests t JOIN classes c ON c.id = t.class_id`;
```

- [ ] **Step 13: Edit `server/db/tests.ts`**

Find this block:

```ts
      barem,
    },
```

Replace it with:

```ts
      barem,
      prepared: { testFile: row.test_file_key !== null, baremFile: row.barem_file_key !== null, print: row.print_status },
      // The grades of the class report's rows, averaged the same way.
      averageGrade: averageGrade(JSON.parse(row.grades_json) as number[]),
    },
```

- [ ] **Step 14: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
import { formatPoints, gradeOf, isValidCorrection, round2 } from '../../shared/scoring.ts';
import { studentNameKey } from '../../shared/students.ts';
```

Replace it with:

```ts
import { formatPoints, gradeOf, isValidCorrection, round2 } from '../../shared/scoring.ts';
import { averageGrade } from '../../shared/stats.ts';
import { studentNameKey } from '../../shared/students.ts';
```

- [ ] **Step 15: Edit `src/test/fakeApi.ts`**

Find this block:

```ts

function summaryOf(test: TestInfo): TestSummary {
  const { uploadToken: _token, multiUploadToken: _multi, files: _files, ...summary } = test;
  return summary;
```

Replace it with:

```ts

// Like the server: what the test has for the class, and the average of its
// graded papers, follow its files and its uploads.
function withDerived({ test, ...detail }: TestDetail): TestDetail {
  const grades = detail.uploads.flatMap((row) => (row.status === 'graded' && row.grade !== null ? [row.grade] : []));
  return {
    ...detail,
    test: {
      ...test,
      prepared: { testFile: test.files.test !== null, baremFile: test.files.barem !== null, print: test.print.status },
      averageGrade: averageGrade(grades),
    },
  };
}

function summaryOf(detail: TestDetail): TestSummary {
  const { uploadToken: _token, multiUploadToken: _multi, files: _files, ...summary } = withDerived(detail).test;
  return summary;
```

- [ ] **Step 16: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
export function fakeTest(overrides: Partial<TestInfo> = {}, uploads: UploadRow[] = []): TestDetail {
  return {
    test: {
```

Replace it with:

```ts
export function fakeTest(overrides: Partial<TestInfo> = {}, uploads: UploadRow[] = []): TestDetail {
  return withDerived({
    test: {
```

- [ ] **Step 17: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
      print: { status: 'none', fromWord: false },
      ...overrides,
```

Replace it with:

```ts
      print: { status: 'none', fromWord: false },
      // Made again from the files and the uploads (withDerived).
      prepared: { testFile: false, baremFile: false, print: 'none' },
      averageGrade: null,
      ...overrides,
```

- [ ] **Step 18: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    robot: { lastCheckAt: null, startFailed: false },
  };
}
```

Replace it with:

```ts
    robot: { lastCheckAt: null, startFailed: false },
  });
}
```

- [ ] **Step 19: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
        students: [...(data.students[classId] ?? [])],
        tests: tests.filter((t) => t.test.classId === classId).map((t) => summaryOf(t.test)),
        // One entry for each upload of the class's tests, like the server.
```

Replace it with:

```ts
        students: [...(data.students[classId] ?? [])],
        tests: tests.filter((t) => t.test.classId === classId).map(summaryOf),
        // One entry for each upload of the class's tests, like the server.
```

- [ ] **Step 20: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    listTests: vi.fn(async (schoolYear: number) =>
      tests.filter((t) => t.test.schoolYear === schoolYear).map((t) => summaryOf(t.test)),
    ),
```

Replace it with:

```ts
    listTests: vi.fn(async (schoolYear: number) =>
      tests.filter((t) => t.test.schoolYear === schoolYear).map(summaryOf),
    ),
```

- [ ] **Step 21: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    }),
    getTest: vi.fn(async (code: string) => structuredClone(findTest(code))),
    renameTest: vi.fn(async (code: string, title: string) => {
```

Replace it with:

```ts
    }),
    getTest: vi.fn(async (code: string) => structuredClone(withDerived(findTest(code)))),
    renameTest: vi.fn(async (code: string, title: string) => {
```

- [ ] **Step 22: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  112 passed | 1 skipped (113)`, `Tests  1749 passed | 3 skipped (1752)`.

- [ ] **Step 23: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 24: Commit**

```bash
git add shared/api.ts shared/stats.ts shared/stats.test.ts server/db/tests.ts server/routes/tests.test.ts src/test/fakeApi.ts
git commit -m "Give each test of the tests list what it has for the class and its average"
```

### Task 3: The six stages, the next step and the greeting

Pure functions, tested without a page: the six stages of a test and its current one, a row's next step, the greeting, today's date and when a test started; and one rule for a test in work.

**Files:**
- Create: `src/admin/stages.ts`, `src/admin/testsPage/nextStep.ts`, `src/admin/testsPage/greeting.ts`
- Modify: `src/admin/shell/todo.ts` (`inWork`; the Rezultate `short` says for how many students the results are published), `src/admin/shell/ClassesPanel.tsx` (uses `inWork`), `src/test/fakeApi.ts` (`fakeSummary`)
- Test: `src/admin/stages.test.ts`, `src/admin/testsPage/nextStep.test.ts`, `src/admin/testsPage/greeting.test.ts`, `src/admin/shell/todo.test.ts`

**Interfaces:**
- Consumes: `todoOf(test: TestSummary): TodoItem | null` (`src/admin/shell/todo.ts`), `TestSummary.prepared`, `TestSummary.averageGrade` (Task 2).
- Produces:
  - `stagesOf(test: TestSummary): { stages: Stage[]; current: Stage }`, `Stage = { name: StageName; state: 'done' | 'wait' | 'now' | 'later'; note: string }` (`src/admin/stages.ts`);
  - `nextStep(test: TestSummary, current: Stage): { kind: 'link'; label; to } | { kind: 'publish'; label } | null` (`src/admin/testsPage/nextStep.ts`);
  - `greeting(now: Date, name: string): string`, `todayLine(now: Date): string`, `startedLabel(iso: string, now: Date): string` (`src/admin/testsPage/greeting.ts`);
  - `inWork(test: TestSummary): boolean` (`src/admin/shell/todo.ts`);
  - `fakeSummary(overrides?: Partial<TestSummary>): TestSummary` (`src/test/fakeApi.ts`).

- [ ] **Step 1: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    robot: { lastCheckAt: null, startFailed: false },
  });
}

```

Replace it with:

```ts
    robot: { lastCheckAt: null, startFailed: false },
  });
}

// One test of the tests list, for building fake data in tests: a draft with
// its test file, an active barem and the print PDF.
export function fakeSummary(overrides: Partial<TestSummary> = {}): TestSummary {
  return {
    code: '6E2-26T1',
    title: 'Fracții',
    status: 'draft',
    classId: 1,
    className: '6E2',
    schoolYear: 2026,
    createdAt: '2026-10-05T08:00:00.000Z',
    startedAt: null,
    evaluationAt: null,
    evaluationStartedAt: null,
    studentCount: 24,
    submittedCount: 0,
    gradedCount: 0,
    flagCount: 0,
    resultsOpen: false,
    publishedCount: 0,
    archived: false,
    barem: { request: 'none', unchecked: false },
    prepared: { testFile: true, baremFile: true, print: 'ready' },
    averageGrade: null,
    ...overrides,
  };
}

```

- [ ] **Step 2: Create `src/admin/stages.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { TestSummary } from '../../shared/api.ts';
import { fakeSummary as summary } from '../test/fakeApi.ts';
import { todoOf } from './shell/todo.ts';
import { stagesOf } from './stages.ts';

const started = { startedAt: '2026-10-06T07:15:00.000Z' };
const graded = { ...started, evaluationStartedAt: '2026-10-07T07:15:00.000Z', submittedCount: 22, gradedCount: 22 };

// Each case: the test, its bar (d done, w waits on the teacher, n in
// progress, l later) and its current stage with its state.
const CASES: [string, TestSummary, string, string][] = [
  ['a draft without its test file', summary({ prepared: { testFile: false, baremFile: false, print: 'none' } }), 'nlllll', 'Pregătire · lipsește testul'],
  [
    'a draft whose barem is generated',
    summary({ barem: { request: 'requested', unchecked: false }, prepared: { testFile: true, baremFile: false, print: 'none' } }),
    'nnllll',
    'Pregătire · baremul se generează',
  ],
  ['a draft without a barem, printed', summary({ prepared: { testFile: true, baremFile: false, print: 'ready' } }), 'ndllll', 'Pregătire · lipsește baremul'],
  ['a draft whose generated barem waits', summary({ barem: { request: 'none', unchecked: true } }), 'wdllll', 'Pregătire · baremul de verificat'],
  ['a draft whose new barem failed', summary({ barem: { request: 'failed', unchecked: true } }), 'wdllll', 'Pregătire · baremul nu s-a generat'],
  ['a draft whose print PDF failed', summary({ prepared: { testFile: true, baremFile: true, print: 'failed' } }), 'dnllll', 'Tipărire · nu s-a putut pregăti'],
  ['a draft whose print PDF is made', summary({ prepared: { testFile: true, baremFile: true, print: 'none' } }), 'dnllll', 'Tipărire · se pregătește'],
  ['a draft ready for the class', summary(), 'ddllll', 'În clasă · testul nu a început'],
  ['an open test', summary({ status: 'open', ...started, submittedCount: 19 }), 'ddnlll', 'În clasă · elevii trimit lucrările'],
  ['an open test before its print PDF', summary({ status: 'open', ...started, prepared: { testFile: true, baremFile: true, print: 'none' } }), 'ddnlll', 'În clasă · elevii trimit lucrările'],
  [
    'a test opened again after its grading, with points to check',
    summary({ status: 'open', ...graded, flagCount: 1 }),
    'ddnlwl',
    'Verificare · 1 punct nesigur',
  ],
  ['a test in evaluation', summary({ status: 'evaluating', ...started, submittedCount: 22, gradedCount: 15 }), 'dddnll', 'Corectare · 15 din 22 corectate'],
  [
    'a test in evaluation with points to check',
    summary({ status: 'evaluating', ...started, submittedCount: 22, gradedCount: 15, flagCount: 3 }),
    'dddnwl',
    'Verificare · 3 puncte nesigure',
  ],
  ['a done test with points to check', summary({ status: 'done', ...graded, flagCount: 3 }), 'ddddwl', 'Verificare · 3 puncte nesigure'],
  ['a done test with its results to publish', summary({ status: 'done', ...graded }), 'dddddw', 'Rezultate · nepublicate'],
  ['a done test published for some students', summary({ status: 'done', ...graded, publishedCount: 3 }), 'dddddw', 'Rezultate · publicate pentru 3 elevi'],
  ['a done test published for one student', summary({ status: 'done', ...graded, publishedCount: 1 }), 'dddddw', 'Rezultate · publicate pentru 1 elev'],
  [
    'a done test with its results open',
    summary({ status: 'done', ...graded, resultsOpen: true, averageGrade: 7.72 }),
    'dddddd',
    'Rezultate · publicate · media testului 7,72',
  ],
  ['a done test whose papers were all published one by one', summary({ status: 'done', ...graded, publishedCount: 22 }), 'dddddd', 'Rezultate · publicate'],
  ['a done test without a graded paper', summary({ status: 'done', ...started, submittedCount: 2 }), 'dddddl', 'Rezultate · nicio lucrare corectată'],
  ['an archived test whose points still wait', summary({ status: 'done', ...graded, flagCount: 2, archived: true }), 'ddddnl', 'Verificare · 2 puncte nesigure'],
];

const bar = (test: TestSummary) =>
  stagesOf(test)
    .stages.map((stage) => stage.state[0])
    .join('');

const currentText = (test: TestSummary) => {
  const { current } = stagesOf(test);
  return current.note ? `${current.name} · ${current.note}` : current.name;
};

describe('stagesOf', () => {
  it.each(CASES)('draws %s', (_name, test, expectedBar, expectedCurrent) => {
    expect(bar(test)).toBe(expectedBar);
    expect(currentText(test)).toBe(expectedCurrent);
  });

  it('names the six stages in order', () => {
    expect(stagesOf(summary()).stages.map((stage) => stage.name)).toEqual(['Pregătire', 'Tipărire', 'În clasă', 'Corectare', 'Verificare', 'Rezultate']);
  });

  it('waits on the teacher exactly when "De făcut" has the test, at the same stage', () => {
    for (const [name, test] of CASES) {
      const waiting = stagesOf(test).stages.filter((stage) => stage.state === 'wait');
      const todo = todoOf(test);
      expect(waiting.map((stage) => stage.name), name).toEqual(todo ? [todo.stage] : []);
    }
  });
});
```

- [ ] **Step 3: Create `src/admin/testsPage/nextStep.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { TestSummary } from '../../../shared/api.ts';
import { fakeSummary } from '../../test/fakeApi.ts';
import { stagesOf } from '../stages.ts';
import { nextStep, type NextStep } from './nextStep.ts';

const started = { startedAt: '2026-10-06T07:15:00.000Z' };
const graded = { ...started, evaluationStartedAt: '2026-10-07T07:15:00.000Z', submittedCount: 22, gradedCount: 22 };
const page = (label: string): NextStep => ({ kind: 'link', label, to: '/teste/6E2-26T1' });

const CASES: [string, TestSummary, NextStep][] = [
  ['checks the generated barem', fakeSummary({ barem: { request: 'none', unchecked: true } }), page('Verifică baremul')],
  ['asks for the barem again after it failed', fakeSummary({ barem: { request: 'failed', unchecked: true } }), page('Generează din nou baremul')],
  ['uploads the missing test file', fakeSummary({ prepared: { testFile: false, baremFile: false, print: 'none' } }), page('Încarcă testul')],
  ['uploads the missing barem', fakeSummary({ prepared: { testFile: true, baremFile: false, print: 'ready' } }), page('Încarcă baremul')],
  [
    'waits while the barem is generated',
    fakeSummary({ barem: { request: 'requested', unchecked: false }, prepared: { testFile: true, baremFile: false, print: 'ready' } }),
    null,
  ],
  ['waits while the print PDF is made', fakeSummary({ prepared: { testFile: true, baremFile: true, print: 'none' } }), null],
  ['opens the test when the print PDF failed', fakeSummary({ prepared: { testFile: true, baremFile: true, print: 'failed' } }), page('Deschide')],
  ['starts a draft ready for the class', fakeSummary(), page('Începe testul')],
  ['starts the grading of an open test', fakeSummary({ status: 'open', ...started }), page('Pornește corectarea')],
  ['waits for the time set for the grading', fakeSummary({ status: 'open', ...started, evaluationAt: '2026-10-06T12:00:00.000Z' }), null],
  ['waits while the papers are graded', fakeSummary({ status: 'evaluating', ...started, submittedCount: 22, gradedCount: 15 }), null],
  ['checks the points that wait', fakeSummary({ status: 'done', ...graded, flagCount: 3 }), page('Verifică 3 puncte')],
  ['checks one point', fakeSummary({ status: 'evaluating', ...graded, flagCount: 1 }), page('Verifică 1 punct')],
  ['publishes the results on the row', fakeSummary({ status: 'done', ...graded }), { kind: 'publish', label: 'Publică rezultatele' }],
  ['publishes for everyone after some students', fakeSummary({ status: 'done', ...graded, publishedCount: 2 }), { kind: 'publish', label: 'Publică pentru toți' }],
  ['opens the class report of published results', fakeSummary({ status: 'done', ...graded, resultsOpen: true }), { kind: 'link', label: 'Raportul clasei', to: '/teste/6E2-26T1/raport' }],
  ['has nothing for a done test without a graded paper', fakeSummary({ status: 'done', ...started, submittedCount: 2 }), null],
];

describe('nextStep', () => {
  it.each(CASES)('%s', (_name, test, expected) => {
    expect(nextStep(test, stagesOf(test).current)).toEqual(expected);
  });
});
```

- [ ] **Step 4: Create `src/admin/testsPage/greeting.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { greeting, startedLabel, todayLine } from './greeting.ts';

describe('greeting', () => {
  // November: Romania is 2 hours ahead of UTC.
  it.each([
    ['2026-11-04T02:59:00.000Z', 'Bună seara, Laura.'],
    ['2026-11-04T03:00:00.000Z', 'Bună dimineața, Laura.'],
    ['2026-11-04T08:59:00.000Z', 'Bună dimineața, Laura.'],
    ['2026-11-04T09:00:00.000Z', 'Bună ziua, Laura.'],
    ['2026-11-04T15:59:00.000Z', 'Bună ziua, Laura.'],
    ['2026-11-04T16:00:00.000Z', 'Bună seara, Laura.'],
    ['2026-11-04T21:30:00.000Z', 'Bună seara, Laura.'],
  ])('at %s says "%s"', (iso, expected) => {
    expect(greeting(new Date(iso), 'Laura Miron')).toBe(expected);
  });

  it("follows Romania's summer time", () => {
    expect(greeting(new Date('2026-06-10T07:59:00.000Z'), 'Laura Miron')).toBe('Bună dimineața, Laura.');
    expect(greeting(new Date('2026-06-10T08:00:00.000Z'), 'Laura Miron')).toBe('Bună ziua, Laura.');
  });

  it('takes the first word of the name, and none without a name', () => {
    expect(greeting(new Date('2026-11-04T10:00:00.000Z'), '  Ana  Maria Pop ')).toBe('Bună ziua, Ana.');
    expect(greeting(new Date('2026-11-04T10:00:00.000Z'), ' ')).toBe('Bună ziua.');
  });
});

describe('todayLine', () => {
  it("writes today in Romania's time, the weekday first, with a capital letter", () => {
    expect(todayLine(new Date('2026-11-04T07:30:00.000Z'))).toBe('Miercuri, 4 noiembrie');
    expect(todayLine(new Date('2026-11-04T22:30:00.000Z'))).toBe('Joi, 5 noiembrie');
  });
});

describe('startedLabel', () => {
  const now = new Date('2026-11-04T10:00:00.000Z');

  it('gives the time of a test that started today', () => {
    expect(startedLabel('2026-11-04T07:10:00.000Z', now)).toBe('azi, 09:10');
  });

  it('gives the day of an older test', () => {
    expect(startedLabel('2026-10-28T07:10:00.000Z', now)).toBe('28 oct.');
  });

  it("counts the day in Romania's time", () => {
    expect(startedLabel('2026-11-03T22:30:00.000Z', now)).toBe('azi, 00:30');
  });
});
```

- [ ] **Step 5: Edit `src/admin/shell/todo.test.ts`**

Find this block:

```ts
import { fakeTest } from '../../test/fakeApi.ts';
import { todoList, todoOf } from './todo.ts';

```

Replace it with:

```ts
import { fakeTest } from '../../test/fakeApi.ts';
import { inWork, todoList, todoOf } from './todo.ts';

```

- [ ] **Step 6: Edit `src/admin/shell/todo.test.ts`**

Find this block:

```ts
    });
    expect(todoOf(summary({ ...graded, publishedCount: 10 }))?.stage).toBe('Rezultate');
  });
```

Replace it with:

```ts
    });
    expect(todoOf(summary({ ...graded, publishedCount: 10 }))).toMatchObject({ stage: 'Rezultate', short: 'publicate pentru 10 elevi' });
    expect(todoOf(summary({ ...graded, publishedCount: 1 }))?.short).toBe('publicate pentru 1 elev');
  });
```

- [ ] **Step 7: Edit `src/admin/shell/todo.test.ts`**

Find this block:

```ts
    expect(items.map((item) => `${item.stage} ${item.code}`)).toEqual(['Pregătire D', 'Verificare B', 'Verificare E', 'Rezultate A']);
  });
});
```

Replace it with:

```ts
    expect(items.map((item) => `${item.stage} ${item.code}`)).toEqual(['Pregătire D', 'Verificare B', 'Verificare E', 'Rezultate A']);
  });
});

describe('inWork', () => {
  it('keeps a test in work until it is done and needs nothing, or archived', () => {
    expect(inWork(summary({ status: 'draft' }))).toBe(true);
    expect(inWork(summary({ status: 'open' }))).toBe(true);
    expect(inWork(summary({ status: 'evaluating', gradedCount: 3 }))).toBe(true);
    expect(inWork(summary({ ...graded }))).toBe(true);
    expect(inWork(summary({ ...graded, flagCount: 2 }))).toBe(true);
    expect(inWork(summary({ ...graded, resultsOpen: true }))).toBe(false);
    expect(inWork(summary({ status: 'done', gradedCount: 0 }))).toBe(false);
    expect(inWork(summary({ ...graded, flagCount: 2, archived: true }))).toBe(false);
  });
});
```

- [ ] **Step 8: Run the tests to see them fail**

Run: `npx vitest run src/admin/stages.test.ts src/admin/testsPage src/admin/shell/todo.test.ts`
Expected: FAIL. `Test Files  4 failed (4)`, `Tests  2 failed | 7 passed (9)`: `./stages.ts`, `./greeting.ts` and `../stages.ts` do not exist; `inWork is not a function`; and a test published for 10 students still says "nepublicate" ("asks to publish checked results that are not published").

- [ ] **Step 9: Create `src/admin/stages.ts`**

```ts
import type { TestSummary } from '../../shared/api.ts';
import { formatPoints } from '../../shared/scoring.ts';
import { countLabel } from '../ui/format.ts';
import { todoOf } from './shell/todo.ts';

export type StageName = 'Pregătire' | 'Tipărire' | 'În clasă' | 'Corectare' | 'Verificare' | 'Rezultate';

// done: blue; wait: waits on the teacher (orange); now: in progress (pale
// blue); later: not yet (grey).
export type StageState = 'done' | 'wait' | 'now' | 'later';

export interface Stage {
  name: StageName;
  state: StageState;
  // The state in a few words ("3 puncte nesigure"); empty when the stage
  // has nothing to say.
  note: string;
}

export interface TestStages {
  // The six stages, in order.
  stages: Stage[];
  // The stage the test is at: the first that waits on the teacher, else the
  // first in progress, else the first not reached, else Rezultate.
  current: Stage;
}

// The six stages of a test (redesign spec §5). A stage waits on the teacher
// exactly when "De făcut" has the test, at that stage, so the bar and the
// count in the menu always agree.
export function stagesOf(test: TestSummary): TestStages {
  const todo = todoOf(test);
  const waits = (name: StageName) => (todo?.stage === name ? todo.short : null);
  const evaluated = test.status === 'evaluating' || test.status === 'done';
  const done = test.status === 'done';
  const { testFile, baremFile, print } = test.prepared;
  const baremActive = baremFile && !test.barem.unchecked && test.barem.request !== 'requested';

  const stage = (name: StageName, state: StageState, note = ''): Stage => ({ name, state, note });

  const pregatire = (): Stage => {
    const wait = waits('Pregătire');
    if (wait !== null) return stage('Pregătire', 'wait', wait);
    if (evaluated || (testFile && baremActive)) return stage('Pregătire', 'done');
    if (!testFile) return stage('Pregătire', 'now', 'lipsește testul');
    if (test.barem.request === 'requested') return stage('Pregătire', 'now', 'baremul se generează');
    return stage('Pregătire', 'now', 'lipsește baremul');
  };

  const tiparire = (): Stage => {
    if (test.status !== 'draft' || print === 'ready') return stage('Tipărire', 'done');
    if (!testFile) return stage('Tipărire', 'later');
    return print === 'failed' ? stage('Tipărire', 'now', 'nu s-a putut pregăti') : stage('Tipărire', 'now', 'se pregătește');
  };

  const clasa = (): Stage => {
    if (test.status === 'draft') return stage('În clasă', 'later', 'testul nu a început');
    if (test.status === 'open') return stage('În clasă', 'now', 'elevii trimit lucrările');
    return stage('În clasă', 'done');
  };

  const corectare = (): Stage => {
    if (test.status === 'evaluating') return stage('Corectare', 'now', `${test.gradedCount} din ${test.submittedCount} corectate`);
    return done ? stage('Corectare', 'done') : stage('Corectare', 'later');
  };

  const verificare = (): Stage => {
    const wait = waits('Verificare');
    if (wait !== null) return stage('Verificare', 'wait', wait);
    if (done && test.flagCount === 0) return stage('Verificare', 'done');
    // An archived test has no "De făcut", but its points still wait.
    if (test.flagCount > 0) return stage('Verificare', 'now', countLabel(test.flagCount, 'punct nesigur', 'puncte nesigure'));
    return stage('Verificare', 'later');
  };

  const rezultate = (): Stage => {
    const wait = waits('Rezultate');
    if (wait !== null) return stage('Rezultate', 'wait', wait);
    const published = test.resultsOpen || (test.gradedCount > 0 && test.publishedCount >= test.gradedCount);
    if (done && published) {
      const average = test.averageGrade === null ? '' : ` · media testului ${formatPoints(test.averageGrade)}`;
      return stage('Rezultate', 'done', `publicate${average}`);
    }
    if (done && test.gradedCount === 0) return stage('Rezultate', 'later', 'nicio lucrare corectată');
    return stage('Rezultate', 'later');
  };

  const stages = [pregatire(), tiparire(), clasa(), corectare(), verificare(), rezultate()];
  const current =
    stages.find((item) => item.state === 'wait') ??
    stages.find((item) => item.state === 'now') ??
    stages.find((item) => item.state === 'later') ??
    stages[5]!;
  return { stages, current };
}
```

- [ ] **Step 10: Create `src/admin/testsPage/nextStep.ts`**

```ts
import type { TestSummary } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import type { Stage } from '../stages.ts';

// The one thing to do next on a row of the Teste page (redesign spec §5): a
// link, or the button that publishes the results on the row. Null: nothing
// to do now.
export type NextStep = { kind: 'link'; label: string; to: string } | { kind: 'publish'; label: string } | null;

export function nextStep(test: TestSummary, current: Stage): NextStep {
  const page = `/teste/${test.code}`;
  const link = (label: string, to = page): NextStep => ({ kind: 'link', label, to });
  switch (current.name) {
    case 'Pregătire':
      if (current.state === 'wait') return link(test.barem.request === 'failed' ? 'Generează din nou baremul' : 'Verifică baremul');
      if (!test.prepared.testFile) return link('Încarcă testul');
      return test.barem.request === 'requested' ? null : link('Încarcă baremul');
    case 'Tipărire':
      return test.prepared.print === 'failed' ? link('Deschide') : null;
    case 'În clasă':
      if (test.status === 'draft') return link('Începe testul');
      return test.evaluationAt === null ? link('Pornește corectarea') : null;
    case 'Corectare':
      return null;
    case 'Verificare':
      return link(`Verifică ${countLabel(test.flagCount, 'punct', 'puncte')}`);
    case 'Rezultate':
      if (current.state === 'wait') return { kind: 'publish', label: test.publishedCount > 0 ? 'Publică pentru toți' : 'Publică rezultatele' };
      return current.state === 'done' && test.gradedCount > 0 ? link('Raportul clasei', `${page}/raport`) : null;
  }
}
```

- [ ] **Step 11: Create `src/admin/testsPage/greeting.ts`**

```ts
// The top of the Teste page (redesign spec §5), in Romania's time.

const HOUR = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: 'numeric', hourCycle: 'h23' });
const TODAY = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', weekday: 'long', day: 'numeric', month: 'long' });
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' });
const SHORT_DAY = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'short' });
const TIME = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' });

// "Bună dimineața, Laura." from 5:00, "Bună ziua" from 11:00, "Bună seara"
// from 18:00; the first word of the teacher's name, or none.
export function greeting(now: Date, name: string): string {
  const hour = Number(HOUR.format(now));
  const words = hour >= 5 && hour < 11 ? 'Bună dimineața' : hour >= 11 && hour < 18 ? 'Bună ziua' : 'Bună seara';
  const first = name.trim().split(/\s+/)[0];
  return first ? `${words}, ${first}.` : `${words}.`;
}

// "Miercuri, 4 noiembrie".
export function todayLine(now: Date): string {
  const text = TODAY.format(now);
  return text.charAt(0).toLocaleUpperCase('ro-RO') + text.slice(1);
}

// When a test started, short: "azi, 09:10" or "28 oct.".
export function startedLabel(iso: string, now: Date): string {
  const started = new Date(iso);
  return DAY_KEY.format(started) === DAY_KEY.format(now) ? `azi, ${TIME.format(started)}` : SHORT_DAY.format(started);
}
```

- [ ] **Step 12: Edit `src/admin/shell/todo.ts`**

Find this block:

```ts
      action: 'Deschide',
      short: 'nepublicate',
    };
```

Replace it with:

```ts
      action: 'Deschide',
      // Published one by one for some students: say for how many.
      short: test.publishedCount > 0 ? `publicate pentru ${countLabel(test.publishedCount, 'elev', 'elevi')}` : 'nepublicate',
    };
```

- [ ] **Step 13: Edit `src/admin/shell/todo.ts`**

Find this block:

```ts
  return null;
}
```

Replace it with:

```ts
  return null;
}

// A test still in work (redesign spec §4, §5): not archived, and not done,
// or done with a thing in "De făcut". The panel "Clasele tale" and the Teste
// page count it the same way.
export function inWork(test: TestSummary): boolean {
  return !test.archived && (test.status !== 'done' || todoOf(test) !== null);
}
```

- [ ] **Step 14: Edit `src/admin/shell/ClassesPanel.tsx`**

Find this block:

```tsx
import { Panel } from './Panel.tsx';
import type { TodoItem } from './todo.ts';

// A test still in work: not finished yet, or finished with a thing to do.
function inWork(test: TestSummary, waits: boolean): boolean {
  return !test.archived && (test.status !== 'done' || waits);
}

```

Replace it with:

```tsx
import { Panel } from './Panel.tsx';
import { inWork, type TodoItem } from './todo.ts';

```

- [ ] **Step 15: Edit `src/admin/shell/ClassesPanel.tsx`**

Find this block:

```tsx
            {active.map((item) => {
              const work = (tests.data ?? []).filter((test) => test.classId === item.id && inWork(test, todoOf(test) !== undefined));
              return (
```

Replace it with:

```tsx
            {active.map((item) => {
              const work = (tests.data ?? []).filter((test) => test.classId === item.id && inWork(test));
              return (
```

- [ ] **Step 16: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  115 passed | 1 skipped (116)`, `Tests  1803 passed | 3 skipped (1806)`.

- [ ] **Step 17: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 18: Commit**

```bash
git add src/admin/stages.ts src/admin/stages.test.ts src/admin/testsPage/nextStep.ts src/admin/testsPage/nextStep.test.ts src/admin/testsPage/greeting.ts src/admin/testsPage/greeting.test.ts src/admin/shell/todo.ts src/admin/shell/todo.test.ts src/admin/shell/ClassesPanel.tsx src/test/fakeApi.ts
git commit -m "Draw the six stages of a test, its next step and the greeting of the Teste page"
```

### Task 4: The Teste page

The page of the redesign: the greeting with what waits and its list in place, the class chips and the archived box, and the groups "În lucru" and "Terminate", each a table with the stage bar, the papers and the next step; a row publishes or stops the results in place.

The old page tests, one by one (28). Kept word for word (2): "marks Teste in the menu on test pages", "says so when the choice leaves no test". The same test, changed for the rows, the chips and the stage text, some with a longer name (19): "is the start page and lists the tests of the selected school year", "links each test to its page and offers a new test", "says so when the year has no tests", the other six filter tests, "shows no publish button on a test with nothing graded, as the test page does", "publishes results from the list", "refreshes the test page data after a publish from the list", "stops access from the list", "shows results published for some students", "counts a single published student in the singular", "shows the whole test as published even when single publishes are counted", "offers no results control for a draft or an ungraded test", "shows the server message under the card when publishing fails" (now "under the row"), "links the class report when a result is graded" (now "of published results"). Renamed (3): "keeps the card small" (now "draws the six stages … for the eye only, and says them in words"), the two "de verificat" tests (now "shows the points that wait in the stage, with their next step" and "shows no points to check when none wait"). Folded into other tests (2): "shows the publish state as a label …" (into "publishes results from the list"), "shows published results as a green label" (the average, in "puts the tests in work first and the finished ones under "Terminate""). Dropped (ruling 9, 2): "colours each card by its class" and "puts the class on the first line, next to the code, as a link to the class". New (7): the greeting, the list of what waits (three tests), the next step, and the two groups (two tests). So the file has 31 tests. The Layout test "changes the school year for every page" looked for the old heading "Teste 2027-2028"; it now looks for the link of a test and for the empty year.

**Files:**
- Replace: `src/admin/pages/TestsPage.tsx`, `src/admin/pages/TestsPage.test.tsx`
- Create: `src/admin/testsPage/TodoRows.tsx`, `src/admin/testsPage/TestGroup.tsx`
- Modify: `src/ui/brand.css`, `src/admin/Layout.test.tsx` (its school year test looked for the old page's heading)

**Interfaces:**
- Consumes: everything Task 3 produces; `todoList()` (`src/admin/shell/todo.ts`); `api.setResultsOpen(code, open)`.

- [ ] **Step 1: Replace `src/admin/pages/TestsPage.test.tsx`**

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api.ts';
import { createFakeApi, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';

// A test file, an active barem and the print PDF.
const ready = {
  files: { test: { name: 'test.pdf', type: 'application/pdf' }, barem: { name: 'barem.pdf', type: 'application/pdf' } },
  print: { status: 'ready', fromWord: false },
} as const;
const started = { startedAt: '2026-10-06T07:15:00.000Z' };
const oneClass = [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }];

const findRow = async (title: string) => (await screen.findByRole('link', { name: title })).closest('tr')!;
const rowOf = (title: string) => screen.getByRole('link', { name: title }).closest('tr')!;
const stageText = (row: HTMLElement) => row.querySelector('.stage-text');

const withTests = () =>
  createFakeApi({
    classes: [
      { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 2, name: '6E3', schoolYear: 2026, archived: false, studentCount: 0 },
    ],
    students: {},
    tests: [
      fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'open', ...ready, ...started }, [
        fakeUpload({ studentId: 10, studentName: 'Pop Ion', status: 'graded', submissionId: 5, grade: 9, flagCount: 2 }),
        fakeUpload({ studentId: 11, studentName: 'Stan Eva' }),
      ]),
      fakeTest({ code: '6E2-26T1', title: 'Fracții' }),
      fakeTest({ code: '6E2-27T1', title: 'Anul viitor', schoolYear: 2027 }),
    ],
  });

afterEach(() => {
  vi.useRealTimers();
});

describe('TestsPage', () => {
  it('is the start page and lists the tests of the selected school year', async () => {
    const api = withTests();
    renderAdmin('/', api);
    expect(await screen.findByRole('heading', { level: 1, name: /^Bună (dimineața|ziua|seara), Laura\.$/ })).toBeInTheDocument();
    const row = await findRow('Ecuații');
    expect(within(row).getByText('Clasa 6E2 · început 6 oct.')).toBeInTheDocument();
    expect(stageText(row)).toHaveTextContent('Verificare · 2 puncte nesigure');
    expect(within(row).getByText('1 din 2')).toBeInTheDocument();

    const draft = rowOf('Fracții');
    expect(within(draft).getByText('Clasa 6E2 · ciornă')).toBeInTheDocument();
    expect(stageText(draft)).toHaveTextContent('Pregătire · lipsește testul');
    expect(within(draft).getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('Anul viitor')).not.toBeInTheDocument();
    expect(api.listTests).toHaveBeenCalledWith(2026);
    expect(api.listClasses).toHaveBeenCalledWith(2026);
  });

  it("greets the teacher by the first name, with today's date in Romania", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T07:30:00.000Z'));
    renderAdmin('/', withTests());
    expect(await screen.findByRole('heading', { level: 1, name: 'Bună dimineața, Laura.' })).toBeInTheDocument();
    expect(screen.getByText(/^Miercuri, 4 noiembrie/)).toBeInTheDocument();
  });

  it('draws the six stages of each test for the eye only, and says them in words', async () => {
    renderAdmin('/', withTests());
    const row = await findRow('Ecuații');
    const bars = row.querySelector('.stage-bars')!;
    expect(bars).toHaveAttribute('aria-hidden', 'true');
    expect([...bars.children].map((bar) => bar.className)).toEqual(['is-done', 'is-done', 'is-now', 'is-later', 'is-wait', 'is-later']);
    expect(row.querySelector('.grading-progress')).toBeNull();
  });

  it('links each test to its page and offers a new test', async () => {
    renderAdmin('/', withTests());
    expect(await screen.findByRole('link', { name: 'Ecuații' })).toHaveAttribute('href', '/teste/6E2-26T2');
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Test nou' })).toHaveAttribute('href', '/teste/nou');
  });

  it('says so when the year has no tests', async () => {
    renderAdmin('/', createFakeApi());
    expect(await screen.findByText('Nu ai niciun test în acest an școlar.')).toBeInTheDocument();
    expect(screen.getByText(/Nimic nu te așteaptă acum\./)).toBeInTheDocument();
  });

  it('marks Teste in the menu on test pages', async () => {
    renderAdmin('/teste/6E2-26T2', withTests());
    const menu = await screen.findByRole('navigation', { name: 'Meniu' });
    expect(within(menu).getByRole('link', { name: 'Teste' })).toHaveAttribute('aria-current', 'page');
    expect(within(menu).getByRole('button', { name: 'Clase' })).not.toHaveAttribute('aria-current');
  });
});

const withWaiting = () =>
  createFakeApi({
    classes: [
      { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 2, name: '6E3', schoolYear: 2026, archived: false, studentCount: 0 },
    ],
    students: {},
    tests: [
      fakeTest({ code: '6E2-26T2', title: 'Logaritmi', status: 'done', ...ready, ...started }, [
        fakeUpload({ studentId: 10, studentName: 'Pop Ion', status: 'graded', submissionId: 5, grade: 9 }),
      ]),
      fakeTest({ code: '6E2-26T1', title: 'Ecuații', status: 'done', ...ready, ...started }, [
        fakeUpload({ studentId: 11, studentName: 'Stan Eva', status: 'graded', submissionId: 6, grade: 7, flagCount: 3 }),
      ]),
      fakeTest({ code: '6E3-26T1', title: 'Pătrate', classId: 2, className: '6E3', status: 'open', ...ready, ...started }),
    ],
  });

describe('TestsPage, what waits', () => {
  it('opens the list of what waits in place, for every class, the first button filled', async () => {
    renderAdmin('/?clasa=2', withWaiting());
    const toggle = await screen.findByRole('button', { name: '2 lucruri te așteaptă' });
    expect(screen.getByText(/în 2 teste\.$/)).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'todo-inline');
    expect(document.getElementById('todo-inline')).not.toBeVisible();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('region', { name: 'Ce ai de făcut' });
    expect(list).toHaveAttribute('id', 'todo-inline');
    expect(list).toBeVisible();
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'VerificareDecide 3 puncte nesigureEcuații · Clasa 6E2Începe',
      'RezultatePublică rezultateleLogaritmi · Clasa 6E2Deschide',
    ]);
    const first = within(list).getByRole('link', { name: 'Începe: Ecuații, Clasa 6E2' });
    expect(first).toHaveClass('button');
    expect(first).toHaveAttribute('href', '/teste/6E2-26T1');
    expect(within(list).getByRole('link', { name: 'Deschide: Logaritmi, Clasa 6E2' })).toHaveClass('button-quiet');

    await userEvent.click(toggle);
    expect(list).not.toBeVisible();
  });

  it('counts one thing in the singular', async () => {
    renderAdmin(
      '/',
      createFakeApi({
        classes: oneClass,
        students: {},
        tests: [fakeTest({ code: '6E2-26T1', title: 'Ecuații', status: 'draft', ...ready, barem: { request: 'none', unchecked: true } })],
      }),
    );
    expect(await screen.findByRole('button', { name: '1 lucru te așteaptă' })).toBeInTheDocument();
    expect(screen.getByText(/în 1 test\.$/)).toBeInTheDocument();
  });

  it('says so when nothing waits, with no button', async () => {
    renderAdmin('/', createFakeApi({ classes: oneClass, students: {}, tests: [fakeTest({ code: '6E2-26T1', title: 'Fracții' })] }));
    expect(await screen.findByText(/Nimic nu te așteaptă acum\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /te așteaptă/ })).not.toBeInTheDocument();
  });

  it('gives each test one next step, the first thing in "De făcut" filled', async () => {
    renderAdmin(
      '/',
      createFakeApi({
        classes: oneClass,
        students: {},
        tests: [
          fakeTest({ code: '6E2-26T3', title: 'Simulare', status: 'evaluating', ...ready, ...started }),
          fakeTest({ code: '6E2-26T2', title: 'Mulțimi', status: 'open', ...ready, ...started }),
          fakeTest({ code: '6E2-26T1', title: 'Ecuații', status: 'done', ...ready, ...started }, [
            fakeUpload({ studentId: 11, studentName: 'Stan Eva', status: 'graded', submissionId: 6, grade: 7, flagCount: 3 }),
          ]),
        ],
      }),
    );
    const check = await screen.findByRole('link', { name: 'Verifică 3 puncte: Ecuații, Clasa 6E2' });
    expect(check).toHaveClass('button');
    expect(check).toHaveAttribute('href', '/teste/6E2-26T1');
    expect(screen.getByRole('link', { name: 'Pornește corectarea: Mulțimi, Clasa 6E2' })).toHaveClass('button-quiet');
    expect(within(rowOf('Simulare')).getByText('Nimic de făcut acum')).toBeInTheDocument();
  });

  it('puts the tests in work first and the finished ones under "Terminate"', async () => {
    renderAdmin(
      '/',
      createFakeApi({
        classes: oneClass,
        students: {},
        tests: [
          fakeTest({ code: '6E2-26T3', title: 'Logaritmi', status: 'done', resultsOpen: true, ...ready, ...started }, [
            fakeUpload({ studentId: 10, studentName: 'Pop Ion', status: 'graded', submissionId: 5, grade: 9 }),
          ]),
          fakeTest({ code: '6E2-26T2', title: 'Fracții', status: 'done', ...ready, ...started }, [
            fakeUpload({ studentId: 11, studentName: 'Stan Eva', status: 'graded', submissionId: 6, grade: 7 }),
          ]),
          fakeTest({ code: '6E2-26T1', title: 'Ecuații', status: 'open', ...ready, ...started }),
        ],
      }),
    );
    const working = await screen.findByRole('region', { name: 'În lucru' });
    const finished = screen.getByRole('region', { name: 'Terminate' });
    expect(within(working).getAllByRole('link', { name: /^(Ecuații|Fracții)$/ })).toHaveLength(2);
    expect(within(finished).getByRole('link', { name: 'Logaritmi' })).toBeInTheDocument();
    expect(stageText(rowOf('Logaritmi'))).toHaveTextContent('Rezultate · publicate · media testului 9');
    expect(working.compareDocumentPosition(finished) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leaves out a group with no test', async () => {
    renderAdmin('/', createFakeApi({ classes: oneClass, students: {}, tests: [fakeTest({ code: '6E2-26T1', title: 'Fracții' })] }));
    expect(await screen.findByRole('region', { name: 'În lucru' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Terminate' })).not.toBeInTheDocument();
  });
});

const withManyClasses = () =>
  createFakeApi({
    classes: [
      { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 2, name: '6E3', schoolYear: 2026, archived: false, studentCount: 0 },
    ],
    students: {},
    tests: [
      fakeTest({ code: '6E2-26T1', title: 'Fracții' }),
      fakeTest({ code: '6E3-26T1', title: 'Pătrate', classId: 2, className: '6E3' }),
      fakeTest({ code: '6E3-26T2', title: 'Vechi', classId: 2, className: '6E3', status: 'done', archived: true }),
    ],
  });

const chip = (name: string) => within(screen.getByRole('group', { name: 'Clasa' })).getByRole('button', { name });

describe('TestsPage filters', () => {
  it('filters the tests by class and keeps the choice in the address', async () => {
    renderAdmin('/', withManyClasses(), <LocationProbe />);
    expect(await screen.findByRole('link', { name: 'Fracții' })).toBeInTheDocument();
    expect(chip('Toate clasele')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(chip('Clasa 6E3'));
    expect(screen.queryByRole('link', { name: 'Fracții' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pătrate' })).toBeInTheDocument();
    expect(chip('Clasa 6E3')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Toate clasele')).toHaveAttribute('aria-pressed', 'false');
    await expectLocation('/?clasa=2');
    await userEvent.click(chip('Toate clasele'));
    expect(await screen.findByRole('link', { name: 'Fracții' })).toBeInTheDocument();
    await expectLocation(/^\/$/);
  });

  it('opens with the class from the address', async () => {
    renderAdmin('/?clasa=2', withManyClasses());
    expect(await screen.findByRole('link', { name: 'Pătrate' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Fracții' })).not.toBeInTheDocument();
    expect(chip('Clasa 6E3')).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows all tests when the class in the address is not a class of the year', async () => {
    renderAdmin('/?clasa=99&arhivate=1', withManyClasses(), <LocationProbe />);
    expect(await screen.findByRole('link', { name: 'Fracții' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pătrate' })).toBeInTheDocument();
    expect(chip('Toate clasele')).toHaveAttribute('aria-pressed', 'true');
    await expectLocation('/?arhivate=1');
  });

  it('hides archived tests until asked, then shows them finished and marked', async () => {
    renderAdmin('/', withManyClasses(), <LocationProbe />);
    expect(await screen.findByRole('link', { name: 'Pătrate' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Vechi' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Arată și testele arhivate'));
    const row = await findRow('Vechi');
    expect(within(row).getByText('Arhivat')).toHaveClass('tag');
    expect(row).toHaveClass('is-muted');
    expect(within(screen.getByRole('region', { name: 'Terminate' })).getByRole('link', { name: 'Vechi' })).toBeInTheDocument();
    await expectLocation('/?arhivate=1');
    await userEvent.click(screen.getByLabelText('Arată și testele arhivate'));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Vechi' })).not.toBeInTheDocument());
    await expectLocation(/^\/$/);
  });

  it('opens with the archived tests when the address asks', async () => {
    renderAdmin('/?arhivate=1', withManyClasses());
    expect(await screen.findByRole('link', { name: 'Vechi' })).toBeInTheDocument();
    expect(screen.getByLabelText('Arată și testele arhivate')).toBeChecked();
  });

  it('keeps the other choice when one changes', async () => {
    renderAdmin('/?arhivate=1', withManyClasses(), <LocationProbe />);
    await screen.findByRole('link', { name: 'Vechi' });
    await userEvent.click(chip('Clasa 6E3'));
    await expectLocation('/?arhivate=1&clasa=2');
  });

  it('says so when the choice leaves no test', async () => {
    renderAdmin(
      '/?clasa=1',
      createFakeApi({
        classes: [
          { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
          { id: 2, name: '6E3', schoolYear: 2026, archived: false, studentCount: 0 },
        ],
        students: {},
        tests: [fakeTest({ code: '6E3-26T1', classId: 2, className: '6E3' })],
      }),
    );
    expect(await screen.findByText('Nu ai teste pentru această alegere.')).toBeInTheDocument();
  });
});

const gradedUpload = () => fakeUpload({ studentId: 10, studentName: 'Pop Ion', status: 'graded', submissionId: 5, grade: 9 });

const withPublishing = (overrides: Parameters<typeof fakeTest>[0] = {}) =>
  createFakeApi({
    classes: oneClass,
    students: {},
    tests: [fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'done', ...ready, ...started, ...overrides }, [gradedUpload()])],
  });

describe('TestsPage results', () => {
  it('shows no publish button on a test with nothing graded, as the test page does', async () => {
    renderAdmin('/', createFakeApi({ classes: oneClass, students: {}, tests: [fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'open', ...ready })] }));
    const row = await findRow('Fracții');
    expect(within(row).queryByRole('button', { name: /^Publică/ })).not.toBeInTheDocument();
  });

  it('publishes results from the list, and the test moves to "Terminate"', async () => {
    const api = withPublishing();
    renderAdmin('/', api);
    const row = await findRow('Fracții');
    expect(stageText(row)).toHaveTextContent('Rezultate · nepublicate');
    expect([...row.querySelector('.stage-bars')!.children].at(-1)).toHaveClass('is-wait');
    await userEvent.click(within(row).getByRole('button', { name: 'Publică rezultatele: Fracții, Clasa 6E2' }));
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', true);
    const finished = await screen.findByRole('region', { name: 'Terminate' });
    const moved = within(finished).getByRole('link', { name: 'Fracții' }).closest('tr')!;
    expect(stageText(moved)).toHaveTextContent('Rezultate · publicate · media testului 9');
    expect(within(moved).getByRole('button', { name: 'Oprește accesul: Fracții, Clasa 6E2' })).toBeInTheDocument();
  });

  it('refreshes the test page data after a publish from the list', async () => {
    const api = withPublishing();
    const { queryClient } = renderAdmin('/', api);
    const row = await findRow('Fracții');
    queryClient.setQueryData(['test', '6E2-26T1'], { stale: true });
    await userEvent.click(within(row).getByRole('button', { name: /^Publică rezultatele/ }));
    await screen.findByRole('region', { name: 'Terminate' });
    expect(queryClient.getQueryState(['test', '6E2-26T1'])?.isInvalidated).toBe(true);
  });

  it('shows the points that wait in the stage, with their next step', async () => {
    renderAdmin('/', withPublishing({ flagCount: 3 }));
    const row = await findRow('Fracții');
    expect(stageText(row)).toHaveTextContent('Verificare · 3 puncte nesigure');
    expect(within(row).getByRole('link', { name: 'Verifică 3 puncte: Fracții, Clasa 6E2' })).toBeInTheDocument();
  });

  it('shows no points to check when none wait', async () => {
    renderAdmin('/', withPublishing({ flagCount: 0 }));
    const row = await findRow('Fracții');
    expect(stageText(row)).not.toHaveTextContent('Verificare');
    expect(within(row).queryByRole('link', { name: /^Verifică/ })).not.toBeInTheDocument();
  });

  it('stops access from the list, and the test waits again', async () => {
    const api = withPublishing({ resultsOpen: true });
    renderAdmin('/', api);
    const row = await findRow('Fracții');
    expect(stageText(row)).toHaveTextContent('Rezultate · publicate');
    await userEvent.click(within(row).getByRole('button', { name: 'Oprește accesul: Fracții, Clasa 6E2' }));
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', false);
    const working = await screen.findByRole('region', { name: 'În lucru' });
    expect(stageText(within(working).getByRole('link', { name: 'Fracții' }).closest('tr')!)).toHaveTextContent('Rezultate · nepublicate');
  });

  it('shows results published for some students, and publishes for all', async () => {
    const api = withPublishing({ gradedCount: 3, publishedCount: 2 });
    renderAdmin('/', api);
    const row = await findRow('Fracții');
    expect(stageText(row)).toHaveTextContent('Rezultate · publicate pentru 2 elevi');
    await userEvent.click(within(row).getByRole('button', { name: 'Publică pentru toți: Fracții, Clasa 6E2' }));
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', true);
    const finished = await screen.findByRole('region', { name: 'Terminate' });
    expect(stageText(within(finished).getByRole('link', { name: 'Fracții' }).closest('tr')!)).toHaveTextContent('Rezultate · publicate · media testului 9');
  });

  it('counts a single published student in the singular', async () => {
    renderAdmin('/', withPublishing({ gradedCount: 3, publishedCount: 1 }));
    expect(stageText(await findRow('Fracții'))).toHaveTextContent('Rezultate · publicate pentru 1 elev');
  });

  it('shows the whole test as published even when single publishes are counted', async () => {
    renderAdmin('/', withPublishing({ resultsOpen: true, publishedCount: 3 }));
    const row = await findRow('Fracții');
    expect(stageText(row)).toHaveTextContent('Rezultate · publicate · media testului 9');
    expect(stageText(row)).not.toHaveTextContent('pentru');
  });

  it('offers no results control for a draft or an ungraded test', async () => {
    renderAdmin(
      '/',
      createFakeApi({
        classes: oneClass,
        students: {},
        tests: [
          fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'draft', gradedCount: 2 }),
          fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'open', ...ready }, [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted' })]),
        ],
      }),
    );
    expect(await screen.findByRole('link', { name: 'Ecuații' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fracții' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Publică|Oprește accesul/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/publicate/)).not.toBeInTheDocument();
  });

  it('shows the server message under the row when publishing fails', async () => {
    const api = withPublishing();
    api.setResultsOpen.mockRejectedValueOnce(new ApiError(409, 'busy', 'Nu am putut publica rezultatele.'));
    renderAdmin('/', api);
    const row = await findRow('Fracții');
    await userEvent.click(within(row).getByRole('button', { name: /^Publică rezultatele/ }));
    expect(await within(row).findByRole('alert')).toHaveTextContent('Nu am putut publica rezultatele.');
    expect(stageText(row)).toHaveTextContent('Rezultate · nepublicate');
  });

  it('links the class report of published results', async () => {
    renderAdmin(
      '/',
      createFakeApi({
        classes: oneClass,
        students: {},
        tests: [
          fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'done', resultsOpen: true, ...ready, ...started }, [gradedUpload()]),
          fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'open', ...ready, ...started }, [fakeUpload({ studentId: 10, studentName: 'Pop Ion' })]),
        ],
      }),
    );
    const graded = await findRow('Fracții');
    expect(within(graded).getByRole('link', { name: 'Raportul clasei: Fracții, Clasa 6E2' })).toHaveAttribute('href', '/teste/6E2-26T1/raport');
    expect(within(rowOf('Ecuații')).queryByRole('link', { name: /^Raportul clasei/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
  it('changes the school year for every page', async () => {
    renderAdmin('/', withClasses());
    await menu();
    await userEvent.click(screen.getByRole('button', { name: 'Mai mult' }));
    await userEvent.selectOptions(within(screen.getByRole('region', { name: 'Mai mult' })).getByLabelText('Anul școlar'), '2027');
    expect(await screen.findByRole('heading', { name: 'Teste 2027-2028' })).toBeInTheDocument();
  });
```

Replace it with:

```tsx
  it('changes the school year for every page', async () => {
    const api = withClasses();
    renderAdmin('/', api);
    await menu();
    expect(await within(screen.getByRole('main')).findByRole('link', { name: 'Ecuații' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mai mult' }));
    await userEvent.selectOptions(within(screen.getByRole('region', { name: 'Mai mult' })).getByLabelText('Anul școlar'), '2027');
    // The Teste page shows the tests of the new year: none.
    expect(await within(screen.getByRole('main')).findByText('Nu ai niciun test în acest an școlar.')).toBeInTheDocument();
    expect(api.listTests).toHaveBeenCalledWith(2027);
  });
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/admin/Layout.test.tsx src/admin/pages/TestsPage.test.tsx`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  30 failed | 34 passed (64)`: the old page has no greeting (`Unable to find role="heading" and name "Bună dimineața, Laura."`), no button "2 lucruri te așteaptă", no regions "În lucru" and "Terminate", and no link named only by the title (`Unable to find role="link" and name "Ecuații"`). In `Layout.test.tsx` only "changes the school year for every page" fails. Two page tests pass already, because the old page does the same: "marks Teste in the menu on test pages" and "says so when the choice leaves no test".

- [ ] **Step 4: Create `src/admin/testsPage/TodoRows.tsx`**

```tsx
import { Link } from 'react-router';
import { displayClassName } from '../../../shared/classes.ts';
import type { TodoItem } from '../shell/todo.ts';

// "Ce ai de făcut" in place on the Teste page (redesign spec §5): one row per
// thing that waits, with one button to its test; the first is the filled one.
export function TodoRows({ id, items, hidden }: { id: string; items: TodoItem[]; hidden: boolean }) {
  return (
    <section id={id} className="todo-inline" aria-label="Ce ai de făcut" hidden={hidden}>
      <ol className="todo-rows">
        {items.map((item, index) => {
          const where = `${item.testTitle}, ${displayClassName(item.className)}`;
          return (
            <li key={item.code}>
              <div className="what">
                <b>
                  <span className="tag tag-wait">{item.stage}</span>
                  {item.task}
                </b>
                <span>
                  {item.testTitle} · {displayClassName(item.className)}
                </span>
              </div>
              <Link
                className={index === 0 ? 'button button-small' : 'button-quiet button-small'}
                to={`/teste/${item.code}`}
                aria-label={`${item.action}: ${where}`}
              >
                {item.action}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
```

- [ ] **Step 5: Create `src/admin/testsPage/TestGroup.tsx`**

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { Link } from 'react-router';
import type { TestSummary } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { stagesOf } from '../stages.ts';
import { startedLabel } from './greeting.ts';
import { nextStep } from './nextStep.ts';

// "În lucru" or "Terminate" on the Teste page (redesign spec §5): a table
// with the test, its stage, its papers and the next step. `first` is the
// test of the first thing in "De făcut": its button is the filled one.
export function TestGroup({ title, tests, first }: { title: string; tests: TestSummary[]; first: string | null }) {
  const id = useId();
  return (
    <section className="test-group" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <div className="table-wrap">
        <table className="tests">
          <thead>
            <tr>
              <th scope="col">Test</th>
              <th scope="col">Etapa</th>
              <th scope="col" className="num">
                Lucrări
              </th>
              <th scope="col" className="next-col">
                Următorul pas
              </th>
            </tr>
          </thead>
          <tbody>
            {tests.map((test) => (
              <TestRow key={test.code} test={test} primary={test.code === first} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TestRow({ test, primary }: { test: TestSummary; primary: boolean }) {
  const api = useApi();
  const queryClient = useQueryClient();
  // Publishing or stopping the results on the row (§1, decision 20). The row
  // waits for the list again: its buttons come from it.
  const results = useMutation({
    mutationFn: (open: boolean) => api.setResultsOpen(test.code, open),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tests'] }),
        queryClient.invalidateQueries({ queryKey: ['test', test.code] }),
      ]);
    },
  });

  const { stages, current } = stagesOf(test);
  const step = nextStep(test, current);
  const className = displayClassName(test.className);
  const where = `${test.title}, ${className}`;
  const buttonClass = primary ? 'button button-small' : 'button-quiet button-small';

  return (
    <tr className={test.archived ? 'is-muted' : undefined}>
      <th scope="row" className="test-name">
        <Link to={`/teste/${test.code}`}>{test.title}</Link>
        {test.archived && <span className="tag">Arhivat</span>}
        <span className="test-sub">
          {className} · {test.startedAt ? `început ${startedLabel(test.startedAt, new Date())}` : 'ciornă'}
        </span>
      </th>
      <td>
        <div className="stage-mini">
          <span className="stage-bars" aria-hidden="true">
            {stages.map((stage) => (
              <i key={stage.name} className={`is-${stage.state}`} />
            ))}
          </span>
          <span className="stage-text">
            <b>{current.name}</b>
            {current.note && ` · ${current.note}`}
          </span>
        </div>
      </td>
      <td className="num" data-label="Lucrări">
        {test.status === 'draft' ? '—' : `${test.submittedCount} din ${test.studentCount}`}
      </td>
      <td className="next-col">
        <span className="row-actions">
          {step === null ? (
            <span className="waiting">Nimic de făcut acum</span>
          ) : step.kind === 'link' ? (
            <Link className={buttonClass} to={step.to} aria-label={`${step.label}: ${where}`}>
              {step.label}
            </Link>
          ) : (
            <button
              type="button"
              className={buttonClass}
              disabled={results.isPending}
              aria-label={`${step.label}: ${where}`}
              onClick={() => results.mutate(true)}
            >
              {step.label}
            </button>
          )}
          {test.resultsOpen && (
            <button
              type="button"
              className="button-quiet button-small"
              disabled={results.isPending}
              aria-label={`Oprește accesul: ${where}`}
              onClick={() => results.mutate(false)}
            >
              Oprește accesul
            </button>
          )}
        </span>
        {results.error && <ErrorMessage error={results.error} />}
      </td>
    </tr>
  );
}
```

- [ ] **Step 6: Replace `src/admin/pages/TestsPage.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { displayClassName } from '../../../shared/classes.ts';
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';
import { inWork, todoList } from '../shell/todo.ts';
import { greeting, todayLine } from '../testsPage/greeting.ts';
import { TestGroup } from '../testsPage/TestGroup.tsx';
import { TodoRows } from '../testsPage/TodoRows.tsx';

// The start page (redesign spec §5): a greeting with what waits on the
// teacher, the class chips, and the tests of the selected school year in two
// groups, newest first. The class and the archived choice live in the
// address, so a link or a reload keeps them.
export function TestsPage() {
  const api = useApi();
  const { year } = useSchoolYear();
  const [params, setParams] = useSearchParams();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
  const tests = useQuery({ queryKey: ['tests', year], queryFn: () => api.listTests(year) });
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });
  const [todoOpen, setTodoOpen] = useState(false);
  const now = new Date();

  const requested = Number(params.get('clasa'));
  const chosenClass = classes.data?.find((item) => item.id === requested)?.id ?? null;
  const showArchived = params.get('arhivate') === '1';

  // A class that is not one of the year's (an old link, or another school year)
  // leaves the address, so the chips and the address agree.
  const staleClass = classes.data !== undefined && params.has('clasa') && chosenClass === null;
  useEffect(() => {
    if (!staleClass) return;
    const next = new URLSearchParams(params);
    next.delete('clasa');
    setParams(next, { replace: true });
  }, [staleClass, params, setParams]);

  const change = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  // What waits covers every class of the year, as "De făcut" in the bar.
  const todo = todoList(tests.data ?? []);
  const visible = tests.data?.filter((test) => (chosenClass === null || test.classId === chosenClass) && (showArchived || !test.archived));
  const working = visible?.filter(inWork) ?? [];
  const finished = visible?.filter((test) => !inWork(test)) ?? [];
  const first = todo[0]?.code ?? null;

  return (
    <section className="tests-page">
      <div className="page-head">
        <div className="greet">
          <h1>{greeting(now, me.data?.name ?? '')}</h1>
          <p>
            {todayLine(now)}
            {tests.data && todo.length === 0 && ' · Nimic nu te așteaptă acum.'}
            {todo.length > 0 && (
              <>
                {' · '}
                <button
                  type="button"
                  className="todo-link"
                  aria-expanded={todoOpen}
                  aria-controls="todo-inline"
                  onClick={() => setTodoOpen(!todoOpen)}
                >
                  {countLabel(todo.length, 'lucru', 'lucruri')} te așteaptă
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </button>{' '}
                în {countLabel(todo.length, 'test', 'teste')}.
              </>
            )}
          </p>
        </div>
        <Link className="button" to="/teste/nou">
          Test nou
        </Link>
      </div>
      {todo.length > 0 && <TodoRows id="todo-inline" items={todo} hidden={!todoOpen} />}

      <div className="filters">
        <div className="chips" role="group" aria-label="Clasa">
          <button type="button" className="chip" aria-pressed={chosenClass === null} onClick={() => change('clasa', null)}>
            Toate clasele
          </button>
          {classes.data?.map((item) => (
            <button key={item.id} type="button" className="chip" aria-pressed={item.id === chosenClass} onClick={() => change('clasa', String(item.id))}>
              {displayClassName(item.name)}
            </button>
          ))}
        </div>
        <label className="check-label">
          <input type="checkbox" checked={showArchived} onChange={(event) => change('arhivate', event.target.checked ? '1' : null)} />
          Arată și testele arhivate
        </label>
      </div>
      {classes.error && <ErrorMessage error={classes.error} />}

      {tests.isPending && <p>Se încarcă…</p>}
      {tests.error && <ErrorMessage error={tests.error} />}
      {tests.data && tests.data.length === 0 && <p className="hint">Nu ai niciun test în acest an școlar.</p>}
      {tests.data && tests.data.length > 0 && visible?.length === 0 && !classes.isPending && (
        <p className="hint">Nu ai teste pentru această alegere.</p>
      )}
      {!classes.isPending && working.length > 0 && <TestGroup title="În lucru" tests={working} first={first} />}
      {!classes.isPending && finished.length > 0 && <TestGroup title="Terminate" tests={finished} first={first} />}
    </section>
  );
}
```

- [ ] **Step 7: Edit `src/ui/brand.css`**

Find this block:

```css
.page-head h1 {
  margin: 0;
}

```

Replace it with:

```css
.page-head h1 {
  margin: 0;
}

/* The Teste page (redesign spec §5): the greeting with what waits, the list
   of it in place, the class chips, and the tests in two groups, each row
   with a bar of the six stages. */
.tests-page .page-head {
  margin-bottom: 1.25rem;
}

.greet h1 {
  font-size: 1.625rem;
}

.greet p {
  margin: 0.25rem 0 0;
  color: var(--muted);
}

.todo-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--orange);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.todo-link:hover {
  text-decoration: underline;
}

.todo-link svg {
  width: 0.875rem;
  height: 0.875rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  transition: transform 0.15s;
}

.todo-link[aria-expanded="true"] svg {
  transform: rotate(180deg);
}

.todo-inline {
  margin: 0 0 1rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-panel);
  background: var(--sheet);
}

.todo-rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.todo-rows li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.5rem 1rem;
  align-items: center;
  padding: 0.875rem 1.5rem;
  border-top: 1px solid var(--line);
}

.todo-rows li:first-child {
  border-top: 0;
}

.todo-rows .what b {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.625rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.todo-rows .what > span {
  display: block;
  color: var(--muted);
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin: 0 0 1rem;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.chip {
  min-height: 2rem;
  padding: 0 0.75rem;
  border: 1px solid var(--control);
  border-radius: 999px;
  background: var(--sheet);
  color: var(--muted);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
}

.chip[aria-pressed="true"] {
  border-color: var(--text);
  background: var(--text);
  color: var(--paper);
}

.test-group {
  margin: 0 0 1.5rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-panel);
  background: var(--sheet);
}

.test-group h2 {
  margin: 0;
  padding: 1.125rem 1.5rem 0.25rem;
  font-size: 0.9375rem;
}

table.tests {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}

table.tests th,
table.tests td {
  padding: 0.875rem 0.75rem;
  border-top: 1px solid var(--line);
  text-align: left;
  vertical-align: middle;
}

table.tests th:first-child,
table.tests td:first-child {
  padding-left: 1.5rem;
}

table.tests th:last-child,
table.tests td:last-child {
  padding-right: 1.5rem;
}

table.tests thead th {
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  border-top: 0;
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 500;
}

table.tests thead th:nth-child(1) {
  width: 34%;
}

table.tests thead th:nth-child(2) {
  width: 28%;
}

table.tests thead th:nth-child(3) {
  width: 10%;
}

table.tests .num,
table.tests .next-col {
  text-align: right;
}

table.tests tbody th {
  font-weight: 400;
  overflow-wrap: anywhere;
}

.test-name a {
  color: var(--text);
  font-weight: 700;
  text-decoration: none;
}

.test-name a:hover {
  color: var(--ink);
  text-decoration: underline;
}

.test-name .tag {
  margin-left: 0.5rem;
}

.test-sub {
  display: block;
  color: var(--muted);
  font-size: 0.8125rem;
}

table.tests tr.is-muted .test-name a {
  color: var(--muted);
}

.stage-mini {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

/* One segment per stage: blue done, pale blue in progress, orange waits on
   the teacher, grey later. The words beside it say the same. */
.stage-bars {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 3px;
  width: 10.5rem;
  max-width: 100%;
}

.stage-bars i {
  height: 5px;
  border-radius: 3px;
  background: var(--active);
}

.stage-bars i.is-done {
  background: var(--ink);
}

.stage-bars i.is-now {
  background: var(--ink);
  opacity: 0.45;
}

.stage-bars i.is-wait {
  background: var(--orange-mark);
}

.stage-text {
  color: var(--muted);
  font-size: 0.8125rem;
}

.stage-text b {
  color: var(--text);
  font-weight: 600;
}

table.tests .row-actions {
  justify-content: flex-end;
}

.waiting {
  color: var(--muted);
  font-size: 0.8125rem;
}

/* On a narrow screen each test is a block: the test, the stage, the papers
   and the next step, one under the other. */
@media (max-width: 48rem) {
  table.tests,
  table.tests tbody,
  table.tests tr,
  table.tests th,
  table.tests td {
    display: block;
    width: 100%;
  }

  table.tests thead {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  table.tests tbody tr {
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--line);
  }

  table.tests tbody th,
  table.tests tbody td,
  table.tests tbody th:first-child,
  table.tests tbody td:last-child {
    padding: 0.25rem 0;
    border-top: 0;
    text-align: left;
  }

  table.tests .num,
  table.tests .next-col {
    text-align: left;
  }

  table.tests td[data-label]::before {
    content: attr(data-label) ": ";
    color: var(--muted);
  }

  table.tests .row-actions {
    justify-content: flex-start;
  }

  .test-group h2 {
    padding: 1rem 1.25rem 0.25rem;
  }

  .todo-rows li {
    grid-template-columns: minmax(0, 1fr);
    padding: 0.75rem 1.25rem;
  }

  .todo-rows li > a {
    justify-self: start;
  }
}

```

- [ ] **Step 8: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  115 passed | 1 skipped (116)`, `Tests  1806 passed | 3 skipped (1809)`.

- [ ] **Step 9: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 10: Commit**

```bash
git add src/admin/Layout.test.tsx src/admin/pages/TestsPage.tsx src/admin/pages/TestsPage.test.tsx src/admin/testsPage/TodoRows.tsx src/admin/testsPage/TestGroup.tsx src/ui/brand.css
git commit -m "Make the start page the Teste page of the redesign"
```

### Task 5: The notes for the next sessions

`src/AGENTS.md` describes the Teste page, the stages and the new fields of the tests list.

**Files:**
- Modify: `src/AGENTS.md`

- [ ] **Step 1: Edit `src/AGENTS.md`**

Find this block:

```markdown

- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Teste cards, the Clase cards and the test page's class link). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (files, link, evaluation controls, the barem warning (`ExerciseListBanner.tsx`), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table, "Recorectează tot"). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `classPage/GradesTable.tsx` is the class page's grade table (students by tests, newest test on the left; it hides archived tests unless asked, and keeps a column for draft and open tests). `pages/ClassStudentsPage.tsx` is "Elevii clasei" (add, rename, "A plecat", "Șterge"). `pages/StudentPage.tsx` is a student's history. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `pages/LoginPage.tsx` is the login and sign-up form: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. `pages/AccountPage.tsx` is Contul meu (password, "Ieși din cont"). `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). A demo account sees, at the top of every page, how many papers it may still have graded. `pages/ReportPage.tsx` and `reportPage/` are the class report (`shared/stats.ts` makes its numbers). `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`)); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (the account menu, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down. `todo.ts` decides "De făcut" from the tests list: exactly the three cases of spec §5. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme and the account move under ☰ (CSS and `PhoneMenu.tsx`).
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `pages/TestPage.tsx` holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
- `ui/GradingProgress.tsx` is the grading bar (blue graded, pale blue waiting, empty track not sent) under the test page's uploads heading only (the Teste cards stay small); "✓ Corectat complet" shows when every sent paper is graded. The bar is `aria-hidden`: the counts stay in words. `EvaluationControls` shows "Marchează ca terminat" in place of the start button when a paper is graded and none waits.
- `landing/`: the landing page (`index.html`) in the look of the redesign, with its own tokens (`landing.css`) and one script, the theme button (`landing.ts`). The page's security policy allows no inline script or style; `landing.test.ts` checks that, and Laura Miron's texts word for word. "Cere un cont de profesor" opens `/admin/#cont-nou`, which `LoginPage` shows as "Cont nou".
```

Replace it with:

```markdown

- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (files, link, evaluation controls, the barem warning (`ExerciseListBanner.tsx`), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table, "Recorectează tot"). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `classPage/GradesTable.tsx` is the class page's grade table (students by tests, newest test on the left; it hides archived tests unless asked, and keeps a column for draft and open tests). `pages/ClassStudentsPage.tsx` is "Elevii clasei" (add, rename, "A plecat", "Șterge"). `pages/StudentPage.tsx` is a student's history. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `pages/LoginPage.tsx` is the login and sign-up form: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. `pages/AccountPage.tsx` is Contul meu (password, "Ieși din cont"). `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). A demo account sees, at the top of every page, how many papers it may still have graded. `pages/ReportPage.tsx` and `reportPage/` are the class report (`shared/stats.ts` makes its numbers). `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`)); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (the account menu, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. `todo.ts` decides "De făcut" from the tests list: exactly the three cases of spec §5. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme and the account move under ☰ (CSS and `PhoneMenu.tsx`).
- `pages/TestsPage.tsx` is the start page, the Teste page of the redesign (spec §5): the greeting and today's date in Romania's time (`testsPage/greeting.ts`), "N lucruri te așteaptă ˅", which opens the list of what waits in place (`testsPage/TodoRows.tsx`: "De făcut" of every class of the year, as the bar counts it, whatever chip is chosen), the class chips and the box "Arată și testele arhivate", and the groups "În lucru" and "Terminate" (`testsPage/TestGroup.tsx`; `inWork()` in `shell/todo.ts` is the rule of the panel "Clasele tale" too). A row shows the test, the stage bar and the current stage, the papers, and one next step (`testsPage/nextStep.ts`): a link to the test, or the button that publishes the results on the row; "Oprește accesul" stays on a row whose results are open. Below 768px each row is a block.
- `stages.ts`: the six stages of a test (Pregătire, Tipărire, În clasă, Corectare, Verificare, Rezultate), each done, waiting on the teacher, in progress or later, and the current one, from the tests list (`TestSummary.prepared`, `barem`, the counts and `averageGrade`). A stage waits on the teacher (orange) exactly when `todoOf()` has the test, at that stage. The test page of Phase 4 uses it too.
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `pages/TestPage.tsx` holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
- `ui/GradingProgress.tsx` is the grading bar (blue graded, pale blue waiting, empty track not sent) under the test page's uploads heading only (the Teste page shows the stage bar instead); "✓ Corectat complet" shows when every sent paper is graded. The bar is `aria-hidden`: the counts stay in words. `EvaluationControls` shows "Marchează ca terminat" in place of the start button when a paper is graded and none waits.
- `landing/`: the landing page (`index.html`) in the look of the redesign, with its own tokens (`landing.css`) and one script, the theme button (`landing.ts`). The page's security policy allows no inline script or style; `landing.test.ts` checks that, and Laura Miron's texts word for word. "Cere un cont de profesor" opens `/admin/#cont-nou`, which `LoginPage` shows as "Cont nou".
```

- [ ] **Step 2: Edit `src/AGENTS.md`**

Find this block:

```markdown
- The Teste filters live in the address: `?clasa=<id>` and `?arhivate=1`. A `clasa` that is not a class of the year counts as all classes.

```

Replace it with:

```markdown
- The Teste filters live in the address: `?clasa=<id>` and `?arhivate=1`. A `clasa` that is not a class of the year counts as all classes.
- `TestSummary.averageGrade` is made by `averageGrade()` of `shared/stats.ts`, the function of the class report's statistics: keep both on it, so the Teste page and the report show the same number.
- In page tests, the fake tests list makes `prepared` from a test's `files` and `print`, and `averageGrade` from its graded uploads, as the server does: a test that must be at a later stage gives them (an open test without a test file is still at Pregătire). `fakeSummary()` builds one entry of the list for the pure functions.

```

- [ ] **Step 3: Commit**

```bash
git add src/AGENTS.md
git commit -m "Describe the Teste page and the stages in the notes"
```

### Task 6: Look at it, then the pull request (main session)

Not a subagent task. Nothing here changes code unless a check fails; a fix found here is prototyped, tested and committed like the tasks above, and named to the user.

- [ ] **Step 1: Check the exactness of the branch**

Run: `git diff --stat refs/proto7/v5 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

- [ ] **Step 2: Run the whole suite three times, and once in UTC**

Run `npm test` three times, then once with `TZ=UTC` (Git Bash: `TZ=UTC npm test`).
Expected: PASS every time. `Test Files  115 passed | 1 skipped (116)`, `Tests  1806 passed | 3 skipped (1809)`.

- [ ] **Step 3: Build and start the production build**

Check port 8788 first (`netstat -ano | findstr :8788`; end a leftover `workerd.exe` as `AGENTS.md` says). Then `npm run db:local` and the Claude Code preview server `preview` (`npm run preview`, http://127.0.0.1:8788).
Expected: `Ready on http://127.0.0.1:8788`.

- [ ] **Step 4: Look at the Teste page at 1440px and at 390px, light and dark**

`/admin/` with all classes and with one chip, with the list of what waits open and closed, and with `?arhivate=1`; then the panels "Clasele tale" and "Ce ai de făcut" over it. On each view measure in the browser `document.documentElement.scrollWidth <= innerWidth`, and on the phone, after scrolling to the end, that the bottom of `main`'s last child is above the top of `.rail`.
Expected: the look of round 5 (Z3.1), page "Teste"; no sideways scroll; nothing hidden behind the bars.

- [ ] **Step 5: Run the smoke test**

Run: `npm run smoke` (second terminal, while the preview runs).
Expected: every check passes.

- [ ] **Step 6: Commit the plan**

```bash
git add docs/superpowers/plans/2026-11-05-mqgrader-phase-3-teste-page.md
git commit -m "Add the Phase 3 plan"
```

- [ ] **Step 7: Ask the user, then push and open the pull request**

Ask the user before pushing. On a yes: `git push -u origin feature/mqgrader-teste-page`, then a ready pull request into `main` that lists what changed, the rulings above, and what was checked.

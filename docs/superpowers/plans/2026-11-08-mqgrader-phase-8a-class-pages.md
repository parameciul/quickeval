# MQGrader Phase 8a: An archived class, the student's history, the class report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 6 must run in the main session, not in a subagent:** it looks at the app in a browser, and every outward step (push, pull request) needs the user's explicit yes.

**Goal:** The three pages next to the class page, as the user picked them in round 7 (spec §11.1–11.3): an archived class is the class page, read only, with a strip "Clasă arhivată." and "Scoate din arhivă"; the student's history (`/admin/elevi/:id`) is one card per school year and class, with the cells of the grades table; the class report (`/admin/teste/:code/raport`) is one page, with the list of its parts and the grade groups on the left.

**Architecture:** Three API changes, no migration. (1) An archived class takes no new students: the rule is in the INSERT's own SQL (`addStudentsToClass` in `server/db/students.ts`), as for a new test (`createTest` already refuses one). (2) The class report names its class id (`ClassReport.test.classId`), for the link under its title. (3) The student's history (`StudentHistory`) changes shape: the classes, their started tests (`StudentHistoryTest`) and the student's papers as the grades table reads them (`ClassGrade`), in one batch of four statements; the paper columns (`GRADE_COLUMNS`, `GradeRow`, `gradeOf`) move to `server/db/students.ts` and `listClassGrades` uses them too. The pages reuse the cells of the class page: `GradeCell` (exported from `classPage/GradesTable.tsx`) and `ResultCell` (exported from `classPage/ClassStudents.tsx`). The report's PDF and CSV do not change.

**Tech Stack:** Node 24, TypeScript, React 19, TanStack Query, React Router, Hono on Cloudflare Pages with D1, Vitest 5, Testing Library. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md` (§1 decisions 29–32, §11.1–11.3, §13 item 8). The round 7 picks were committed before this plan (`00ecabd`, "Write the round 7 picks into the redesign spec"); Task 4 adds what the prototype settled. Root `AGENTS.md`, `src/AGENTS.md` and `server/AGENTS.md` hold the project rules. The approved prototypes: round 7 https://claude.ai/artifact/NTc1cfWBhUF4EkkCZN2uNm, pages "Clasă arhivată" A, "Notele elevului" A, "Raportul clasei" B.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- Every teacher query is scoped by the teacher's id: each statement of the history batch names the teacher (`students.teacher_id`, `classes.teacher_id`, `tests.teacher_id`). A request stays within 15 D1 queries: the history is one `db.batch()` of four statements.
- A write checks its rules inside its SQL statement: the archived class's refusal is in the INSERT (`archived = 0` in its `EXISTS`), and the read after a refused add (`refusedAdd`) only names the reason.
- Flat colours only: no gradient anywhere in `brand.css`; a shadow only on what floats. Orange only for what waits on the teacher: nothing waits in an archived class.
- No page tells students that AI grades their work; this plan changes no student page.
- Do not run Prettier or any formatter: the repo has no formatter configuration, and its defaults rewrite the quotes of whole files.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A` (the checkout holds local files that must not be committed: `.claude/launch.json` entries, untracked plan files).
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root `D:\Projects\QuickEval`, on the branch `feature/mqgrader-class-pages`. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy, on `main` too. If only tests of those three files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts runner/api.test.ts` alone. Then the full run counts as passed when its failed and passed tests add up to the expected passed number; say so in the task report.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; overwrite all of it with exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/proto11/a1` … `refs/proto11/a5`, one per task, on `refs/proto11/abase` (the same files as the branch at `00ecabd`). After Task N, `git diff --stat refs/proto11/aN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`). Four tests run the real pandoc (`runner/baremDocx.test.ts`, `runner/baremTask.test.ts`, `runner/workdir.test.ts`): without pandoc they skip too, so every total shows 4 fewer passed and 4 more skipped.

## Rulings made while planning

Settled while building the prototype on 2026-11-08; Task 4 writes the ones the spec needs into it.

1. "Nu poți adăuga elevi" is a rule of the API, not only of the page: `addStudentsToClass` refuses an archived class in its INSERT, with 409 `class_archived` and "Clasa este arhivată. Scoate-o din arhivă ca să adaugi elevi." A new test was already refused (`createTest`, 409 `class_archived`), and the "Test nou" form already lists only active classes.
2. The archived class's strip says "**Clasă arhivată.**" with no date: the app stores no archive date, and 8a needs no migration (spec §11.1 already says so).
3. "Scoate din arhivă" in the strip and in ⋯ share one write (`archive` in `ClassDetails`), and its error shows once, under the head. ⋯ lists "Scoate din arhivă" first, then "Redenumește clasa"; for an active class it stays "Redenumește clasa", then "Arhivează clasa". The menu closes as soon as its item is pressed.
4. Read only (`readOnly`, passed to `GradesTable`, `ClassTests` and `ClassStudents`): no "Test nou pentru această clasă", no "+ Adaugă elevi" (also in both empty states, which say "Clasa nu are elevi."), and no "Redenumește", "A plecat din clasă" or "Șterge" for a student. The renames of the class (⋯) and of a student (on the student page) stay: a name is not new work.
5. In an archived class nothing waits on the teacher: no orange stage in "Testele clasei" and no orange line under a test's name in the grades table. A test's one step is "Raportul clasei" (`/teste/:code/raport`) once a paper is graded, and nothing otherwise, so "Publică rezultatele" is not offered there.
6. The student's history lists the started tests of each class (`started_at` set): a draft is not listed. An archived test, or a test of a class the student left, is listed only when the student sent a paper to it (any upload row), so a student who left does not collect "—" for every later test.
7. The history's "Nota" is the class page's `GradeCell` (the grade with the orange dot, the state of a paper not graded yet, "—" with the title "Nu a trimis lucrarea"), and its "Rezultatul" is the "Elevi" tab's `ResultCell` ("Publicat" with "Copiază linkul", "Nepublicat", "După verificare", "Nu a trimis lucrarea."). The date under a test is the long one ("3 noiembrie 2027", `formatDate`). On a phone the table keeps its five columns and scrolls inside its card (`min-width: 40rem`), as spec §11.2 says, unlike the "Elevi" tab, which hides "Punctaj".
8. "←" on the student page leads to the class the teacher came from: the grades table's names and "Toate notele elevului, din toate clasele" pass `{ fromClass }` (`StudentLinkState`). Without it (a reload, a link from elsewhere), it leads to the student's active class, else to the newest class. The line under the name names the newest class with its year, then "înainte în" the others, each a link, a class the student left tagged "a plecat".
9. "Redenumește" on the student page is the class page's rename dialog (`RenameDialog`); after a rename the history and every class page are read again.
10. The report: the results table shows the points of each exercise first (its short name with its maximum under it, "4,5p"), then "Total" and "Nota" (spec §11.3; until now the page put "Nota" and "Total" first). The class PDF and the CSV keep their order. An active student with no graded paper gets a row: "Nu a trimis lucrarea." for no paper, else the paper's state (`uploadStatusLabel`, as "Trimis"); the list "Fără rezultat" goes.
11. The report's head: "← <the test's title>", "Raportul clasei", then the test's title, its class (a link, from `test.classId`) and its date. "Descarcă PDF", "Descarcă CSV" and "Trimite" (`PdfActions`, unchanged) sit on the right, only when a paper is graded.
12. The list of parts marks the part being read with an `IntersectionObserver` (the last part whose top has passed the upper third of the screen); where there is none (the tests), "Pe scurt" stays marked. The left column is sticky under the top bar (`top: calc(var(--top) + 1.5rem)`), found working in the browser. On a phone (below 56.25rem) the list goes and "Notele pe grupe" comes first, as in the prototype.
13. "Corectate" keeps the count of the points to check ("de verificat 2", orange), which the old "Statistici" line had. The grade groups keep their labels (`GRADE_GROUPS` in `shared/stats.ts`, "1-4,99" with a hyphen): the PDF and the CSV read them too.
14. "Analiza clasei" has "Regenerează" in its card's head when the analysis is ready and up to date; in its other states the button stays where it was. No date: the app does not store when the analysis was written (spec §11.3 is changed to say so).

## Review Focus

1. The archived class refuses new students in the INSERT's own SQL, and adds them again once it is out of the archive (test in Task 1: "refuses to add students to an archived class, and adds them once it is out of the archive").
2. The history lists the right tests: no draft; an archived test or a test of a class the student left only with a paper; a classmate's paper never (tests in Task 3: "leaves out drafts, and archived tests or tests of a class left with no paper of the student", "lists the classes, their started tests newest first, and the papers of the student").
3. An archived class offers nothing new and nothing waits in it (tests in Task 2: "says it is archived in a strip and in the facts, and offers no new test", "gives each test with a graded paper its report as the one step, and nothing to publish", "shows the students read only, with the link to all their grades", "offers no "Adaugă elevi" when the archived class has no students").
4. The student page draws the cells of the grades table, and leads back to the class the teacher came from (tests in Task 3: "shows the points, the grade as the grades table draws it, the result and the paper", "leads back to the class the teacher came from, else to the class the student is in now"; in Task 2's file: "opens the student page from a name, which leads back to this class").
5. The report's students with no paper are rows of the results table, and its columns are in the spec's order (tests in Task 4: "shows a row per student, the items to check marked, and the students with no paper", "puts the points of each exercise first, with its maximum, then the total and the grade").

---

### Before Task 1: The branch

- [ ] **Step 1: Check the branch**

No other Claude Code session may work in this checkout meanwhile (in the desktop app: `list_sessions {"linked": true}` shows none running). The branch `feature/mqgrader-class-pages` was made while planning, from `main` at `a99732c`, and holds one commit, the round 7 picks in the spec (`00ecabd`). Run `git switch feature/mqgrader-class-pages`, then `git log --oneline -2`.

Expected: `00ecabd Write the round 7 picks into the redesign spec: …`, then `a99732c Merge pull request #47 …`. The untracked plan files and the local changes of `.claude/launch.json` come along; they are never committed (this plan is committed in Task 6).

### Task 1: An archived class takes no new students; the report names its class

`POST /api/admin/classes/:id/students` refuses an archived class; `GET /api/admin/tests/:code/report` gives `test.classId`.

**Files:**
- Modify: `server/db/students.ts` (`addStudentsToClass`, `refusedAdd`), `shared/api.ts` (`ClassReport`), `server/db/report.ts`
- Test: `server/routes/classes.test.ts`, `server/routes/report.test.ts`, and the report fixtures of `shared/csv.test.ts`, `src/admin/pages/ReportPage.test.tsx`, `src/admin/pdf/pdf.test.ts`, `src/admin/testPage/ResultsPanel.test.tsx`

**Interfaces:**
- Produces: `ClassReport.test.classId: number`; 409 `class_archived` for an add to an archived class.

- [ ] **Step 1: Edit `server/routes/classes.test.ts`**

Find this block:

```ts
    expect(back.body.student.active).toBe(true);
  });
```

Replace it with:

```ts
    expect(back.body.student.active).toBe(true);
  });

  it('refuses to add students to an archived class, and adds them once it is out of the archive', async () => {
    const created = await createClass('10E');
    await api.request('PATCH', `/api/admin/classes/${created.id}`, { archived: true });
    const refused = await api.request('POST', `/api/admin/classes/${created.id}/students`, { names: ['Pop Ion'] });
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({
      error: 'class_archived',
      message: 'Clasa este arhivată. Scoate-o din arhivă ca să adaugi elevi.',
    });
    expect((await api.request('GET', `/api/admin/classes/${created.id}`)).body.students).toEqual([]);

    await api.request('PATCH', `/api/admin/classes/${created.id}`, { archived: false });
    const added = await api.request('POST', `/api/admin/classes/${created.id}/students`, { names: ['Pop Ion'] });
    expect(added.status).toBe(201);
  });
```

- [ ] **Step 2: Edit `server/routes/report.test.ts`**

Find this block:

```ts
let testId: number;
let studentIds: number[];
```

Replace it with:

```ts
let testId: number;
let classId: number;
let studentIds: number[];
```

- [ ] **Step 3: Edit `server/routes/report.test.ts`**

Find this block:

```ts
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id, 'Fracții');
```

Replace it with:

```ts
  studentIds = cls.studentIds;
  classId = cls.id;
  code = await makeTest(api, cls.id, 'Fracții');
```

- [ ] **Step 4: Edit `server/routes/report.test.ts`**

Find this block:

```ts
    const { report: body } = res.body;
    expect(body.test).toMatchObject({ code, title: 'Fracții', className: '6E2', status: 'draft' });
    expect(body.exercises).toEqual([
```

Replace it with:

```ts
    const { report: body } = res.body;
    expect(body.test).toMatchObject({ code, title: 'Fracții', classId, className: '6E2', status: 'draft' });
    expect(body.exercises).toEqual([
```

- [ ] **Step 5: Run the tests to see them fail**

Run: `npx vitest run server/routes/classes.test.ts server/routes/report.test.ts`
Expected: FAIL. `Test Files  2 failed | 4 passed (6)`, `Tests  2 failed | 119 passed (121)`: an archived class still takes students ("refuses to add students to an archived class, and adds them once it is out of the archive": `AssertionError: expected 201 to be 409 // Object.is equality`), and the report has no `classId` yet ("lists the graded students by name with their items, and the others below": `AssertionError: expected { code: '6E2-26T1', …(4) } to match object { code: '6E2-26T1', …(4) }`). The four fixture files pass: they only gain `classId: 1`.

- [ ] **Step 6: Edit `server/db/students.ts`**

Find this block:

```ts
  const json = JSON.stringify(rows);
  const ownsClass = 'EXISTS (SELECT 1 FROM classes WHERE id = ? AND teacher_id = ?)';
  const noClash = `NOT EXISTS (
```

Replace it with:

```ts
  const json = JSON.stringify(rows);
  // The class is the teacher's and not archived: an archived class is read only.
  const ownsClass = 'EXISTS (SELECT 1 FROM classes WHERE id = ? AND teacher_id = ? AND archived = 0)';
  const noClash = `NOT EXISTS (
```

- [ ] **Step 7: Edit `server/db/students.ts`**

Find this block:

```ts

// Why an add changed nothing: the class is not the teacher's (404), or names of
// the list are already in it (409). This read never decides whether to write.
async function refusedAdd(db: D1Database, teacherId: number, classId: number, names: string[]): Promise<ApiError> {
  const [owned, existing] = await db.batch<{ full_name: string }>([
    db.prepare('SELECT id AS full_name FROM classes WHERE id = ? AND teacher_id = ?').bind(classId, teacherId),
    db.prepare('SELECT s.full_name FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.class_id = ?').bind(classId),
  ]);
  if (!owned || owned.results.length === 0) return notFound();
  const taken = new Set((existing?.results ?? []).map((row) => studentNameKey(row.full_name)));
  const clashes = names.filter((name) => taken.has(studentNameKey(name)));
```

Replace it with:

```ts

// Why an add changed nothing: the class is not the teacher's (404), it is
// archived (409), or names of the list are already in it (409). This read never
// decides whether to write.
async function refusedAdd(db: D1Database, teacherId: number, classId: number, names: string[]): Promise<ApiError> {
  const [owned, existing] = await db.batch<Record<string, unknown>>([
    db.prepare('SELECT archived FROM classes WHERE id = ? AND teacher_id = ?').bind(classId, teacherId),
    db.prepare('SELECT s.full_name FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.class_id = ?').bind(classId),
  ]);
  const cls = owned?.results[0] as { archived: number } | undefined;
  if (!cls) return notFound();
  if (cls.archived === 1) {
    return new ApiError(409, 'class_archived', 'Clasa este arhivată. Scoate-o din arhivă ca să adaugi elevi.');
  }
  const rows = (existing?.results ?? []) as { full_name: string }[];
  const taken = new Set(rows.map((row) => studentNameKey(row.full_name)));
  const clashes = names.filter((name) => taken.has(studentNameKey(name)));
```

- [ ] **Step 8: Edit `shared/api.ts`**

Find this block:

```ts
export interface ClassReport {
  test: { code: string; title: string; className: string; status: TestStatus; startedAt: string | null };
  // The exercises of the test, in barem order.
```

Replace it with:

```ts
export interface ClassReport {
  test: { code: string; title: string; classId: number; className: string; status: TestStatus; startedAt: string | null };
  // The exercises of the test, in barem order.
```

- [ ] **Step 9: Edit `server/db/report.ts`**

Find this block:

```ts
        started_at: string | null;
        class_name: string;
```

Replace it with:

```ts
        started_at: string | null;
        class_id: number;
        class_name: string;
```

- [ ] **Step 10: Edit `server/db/report.ts`**

Find this block:

```ts
  return {
    test: { code: head.code, title: head.title, className: head.class_name, status: head.status, startedAt: head.started_at },
    exercises: exerciseColumns(list, storedItems).map(({ id, label, maxPoints }) => ({ id, label, maxPoints })),
```

Replace it with:

```ts
  return {
    test: {
      code: head.code,
      title: head.title,
      classId: head.class_id,
      className: head.class_name,
      status: head.status,
      startedAt: head.started_at,
    },
    exercises: exerciseColumns(list, storedItems).map(({ id, label, maxPoints }) => ({ id, label, maxPoints })),
```

- [ ] **Step 11: Edit `shared/csv.test.ts`**

Find this block:

```ts
  return {
    test: { code: '6E2-26T1', title: 'Fracții', className: '6E2', status: 'done', startedAt: null },
    exercises: [
```

Replace it with:

```ts
  return {
    test: { code: '6E2-26T1', title: 'Fracții', classId: 1, className: '6E2', status: 'done', startedAt: null },
    exercises: [
```

- [ ] **Step 12: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
  return {
    test: { code: '6E2-26T1', title: 'Fracții', className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
    exercises: [
```

Replace it with:

```tsx
  return {
    test: { code: '6E2-26T1', title: 'Fracții', classId: 1, className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
    exercises: [
```

- [ ] **Step 13: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
    const reopened = report({
      test: { code: '6E2-26T1', title: 'Fracții', className: '6E2', status: 'open', startedAt: '2026-10-06T07:15:00.000Z' },
      analysis: { status: 'requested', stale: false, attempts: 0, content: null },
```

Replace it with:

```tsx
    const reopened = report({
      test: { code: '6E2-26T1', title: 'Fracții', classId: 1, className: '6E2', status: 'open', startedAt: '2026-10-06T07:15:00.000Z' },
      analysis: { status: 'requested', stale: false, attempts: 0, content: null },
```

- [ ] **Step 14: Edit `src/admin/pdf/pdf.test.ts`**

Find this block:

```ts
  return {
    test: { code: '6E2-26T1', title: 'Fracții și ecuații', className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
    exercises,
```

Replace it with:

```ts
  return {
    test: { code: '6E2-26T1', title: 'Fracții și ecuații', classId: 1, className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
    exercises,
```

- [ ] **Step 15: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx
    const report: ClassReport = {
      test: { code: '6E2-26T1', title: 'Fracții', className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
      exercises: [{ id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 4.5 }],
```

Replace it with:

```tsx
    const report: ClassReport = {
      test: { code: '6E2-26T1', title: 'Fracții', classId: 1, className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
      exercises: [{ id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 4.5 }],
```

- [ ] **Step 16: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  121 passed | 1 skipped (122)`, `Tests  1944 passed | 3 skipped (1947)`.

- [ ] **Step 17: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 18: Commit**

```bash
git add server/db/students.ts shared/api.ts server/db/report.ts server/routes/classes.test.ts server/routes/report.test.ts shared/csv.test.ts src/admin/pages/ReportPage.test.tsx src/admin/pdf/pdf.test.ts src/admin/testPage/ResultsPanel.test.tsx
git commit -m "Refuse new students in an archived class, and name the class in the report"
```

### Task 2: An archived class, read only

The class page of an archived class: the strip, the tag first in the facts, ⋯ with "Scoate din arhivă" first, nothing new to add, and "Raportul clasei" as each test's step.

**Files:**
- Modify: `src/admin/pages/ClassPage.tsx`, `src/admin/classPage/GradesTable.tsx`, `src/admin/classPage/ClassTests.tsx`, `src/admin/classPage/ClassStudents.tsx`, `src/ui/brand.css`
- Test: `src/admin/pages/ClassPage.test.tsx`

**Interfaces:**
- Produces: `readOnly?: boolean` on `GradesTable`, `ClassTests` and `ClassStudents` (default `false`); `ClassMenu` takes `archiving` and `onArchive()` from its page.

- [ ] **Step 1: Edit `src/admin/pages/ClassPage.test.tsx`**

Find this block:

```tsx

describe('ClassPage grade table', () => {
```

Replace it with:

```tsx

describe('ClassPage, an archived class', () => {
  const archivedClass = async (data = classData()) => {
    const api = createFakeApi(data);
    await api.updateClass(1, { archived: true });
    return api;
  };

  it('says it is archived in a strip and in the facts, and offers no new test', async () => {
    renderAdmin('/clase/1', await archivedClass());
    expect(await screen.findByText('Clasă arhivată.')).toBeInTheDocument();
    expect(
      screen.getByText('Notele și testele rămân aici. Nu poți face un test nou și nu poți adăuga elevi.', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 elevi · 2 teste · anul școlar 2026-2027/).textContent).toMatch(/^Arhivată 3 elevi/);
    expect(screen.queryByRole('link', { name: 'Test nou pentru această clasă' })).not.toBeInTheDocument();
  });

  it('takes the class out of the archive from its strip', async () => {
    const api = await archivedClass();
    renderAdmin('/clase/1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Scoate din arhivă' }));
    expect(api.updateClass).toHaveBeenLastCalledWith(1, { archived: false });
    expect(await screen.findByRole('link', { name: 'Test nou pentru această clasă' })).toBeInTheDocument();
    expect(screen.queryByText('Clasă arhivată.')).not.toBeInTheDocument();
    expect(screen.queryByText('Arhivată')).not.toBeInTheDocument();
  });

  it('lists "Scoate din arhivă" first in ⋯, then "Redenumește clasa"', async () => {
    renderAdmin('/clase/1', await archivedClass());
    await userEvent.click(await screen.findByRole('button', { name: 'Mai multe pentru Clasa 6E2' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Scoate din arhivă',
      'Redenumește clasa',
    ]);
  });

  it('gives each test with a graded paper its report as the one step, and nothing to publish', async () => {
    renderAdmin('/clase/1', await archivedClass());
    const list = within(await screen.findByRole('complementary', { name: 'Testele clasei' }));
    const items = list.getAllByRole('listitem');
    // T2 (newest, nothing graded) has no step; T1 leads to its report.
    expect(within(items[0]!).queryByRole('link', { name: 'Raportul clasei' })).not.toBeInTheDocument();
    expect(within(items[0]!).queryByRole('button')).not.toBeInTheDocument();
    expect(within(items[1]!).getByRole('link', { name: 'Raportul clasei' })).toHaveAttribute('href', '/teste/6E2-26T1/raport');
    // Nothing waits on the teacher in an archived class: no orange stage.
    expect(screen.getByRole('complementary', { name: 'Testele clasei' }).querySelectorAll('.is-waiting')).toHaveLength(0);
    const heads = screen.getByRole('table', { name: 'Notele elevilor la teste' }).querySelectorAll('.grade-head-note.is-waiting');
    expect(heads).toHaveLength(0);
    expect(list.queryByRole('button', { name: /Publică/ })).not.toBeInTheDocument();
  });

  it('shows the students read only, with the link to all their grades', async () => {
    renderAdmin('/clase/1', await archivedClass());
    await openStudents();
    const chosen = await detail();
    expect(chosen.getByRole('link', { name: 'Toate notele elevului, din toate clasele' })).toBeInTheDocument();
    expect(chosen.queryByRole('button', { name: 'Redenumește' })).not.toBeInTheDocument();
    expect(chosen.queryByRole('button', { name: 'A plecat din clasă' })).not.toBeInTheDocument();
    expect(chosen.queryByRole('button', { name: 'Șterge' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Adaugă elevi' })).not.toBeInTheDocument();
  });

  it('offers no "Adaugă elevi" when the archived class has no students', async () => {
    renderAdmin('/clase/1', await archivedClass({ ...classData(), students: { 1: [] } }));
    expect(await screen.findByText('Clasa nu are elevi.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adaugă elevi/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /^Elevi/ }));
    expect(await screen.findByText('Clasa nu are elevi.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adaugă elevi/ })).not.toBeInTheDocument();
  });
});

describe('ClassPage grade table', () => {
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/ClassPage.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  6 failed | 38 passed (44)`: the six tests of "ClassPage, an archived class" fail (`Unable to find an element with the text: Clasă arhivată.`, `Unable to find role="button" and name "Scoate din arhivă"`, `AssertionError: expected [ 'Redenumește clasa', …(1) ] to deeply equal [ 'Scoate din arhivă', …(1) ]`, `Unable to find an accessible element with the role "link" and name "Raportul clasei"`, `expect(element).not.toBeInTheDocument()` for the student's buttons, `Unable to find an element with the text: Clasa nu are elevi.`).

- [ ] **Step 3: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
  };

```

Replace it with:

```tsx
  };
  // "Arhivează clasa" and "Scoate din arhivă", from ⋯ and from the strip of an
  // archived class.
  const archive = useMutation({
    mutationFn: (archived: boolean) => api.updateClass(classId, { archived }),
    onSuccess: refresh,
  });

```

- [ ] **Step 4: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
  const activeTests = tests.filter((test) => !test.archived).length;
  return (
    <section className="class-page">
      <div className="class-head">
```

Replace it with:

```tsx
  const activeTests = tests.filter((test) => !test.archived).length;
  // An archived class is read only: its grades and tests stay, and nothing new
  // is added to it until it is out of the archive.
  const readOnly = info.archived;
  return (
    <section className="class-page">
      {readOnly && (
        <div className="class-archived">
          <p>
            <b>Clasă arhivată.</b> Notele și testele rămân aici. Nu poți face un test nou și nu poți adăuga elevi.
          </p>
          <button
            type="button"
            className="button-quiet"
            disabled={archive.isPending}
            onClick={() => archive.mutate(false)}
          >
            Scoate din arhivă
          </button>
        </div>
      )}
      <div className="class-head">
```

- [ ] **Step 5: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
          <h1>{displayClassName(info.name)}</h1>
          {info.archived && <span className="tag">Arhivată</span>}
          <ClassSwitcher
```

Replace it with:

```tsx
          <h1>{displayClassName(info.name)}</h1>
          <ClassSwitcher
```

- [ ] **Step 6: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
          <p className="class-head-facts">
            {studentCountLabel(students.length)} · {testCountLabel(activeTests)} · anul școlar{' '}
```

Replace it with:

```tsx
          <p className="class-head-facts">
            {readOnly && (
              <>
                <span className="tag">Arhivată</span>{' '}
              </>
            )}
            {studentCountLabel(students.length)} · {testCountLabel(activeTests)} · anul școlar{' '}
```

- [ ] **Step 7: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
          )}
          <ClassMenu api={api} classId={classId} name={info.name} archived={info.archived} onDone={refresh} />
        </div>
      </div>

```

Replace it with:

```tsx
          )}
          <ClassMenu
            api={api}
            classId={classId}
            name={info.name}
            archived={info.archived}
            archiving={archive.isPending}
            onArchive={() => archive.mutate(!info.archived)}
            onDone={refresh}
          />
        </div>
      </div>
      {archive.error && <ErrorMessage error={archive.error} />}

```

- [ ] **Step 8: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
              showArchived={showArchived}
              onShowStudents={() => setTab('elevi')}
```

Replace it with:

```tsx
              showArchived={showArchived}
              readOnly={readOnly}
              onShowStudents={() => setTab('elevi')}
```

- [ ] **Step 9: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
              schoolYear={info.schoolYear}
              showArchived={showArchived}
```

Replace it with:

```tsx
              schoolYear={info.schoolYear}
              readOnly={readOnly}
              showArchived={showArchived}
```

- [ ] **Step 10: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
            grades={grades}
            onChanged={refresh}
```

Replace it with:

```tsx
            grades={grades}
            readOnly={readOnly}
            onChanged={refresh}
```

- [ ] **Step 11: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx

// "⋯": "Redenumește clasa" (a dialog) and "Arhivează clasa".
function ClassMenu({
```

Replace it with:

```tsx

// "⋯": "Redenumește clasa" (a dialog) and "Arhivează clasa"; for an archived
// class, "Scoate din arhivă" first.
function ClassMenu({
```

- [ ] **Step 12: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
  archived,
  onDone,
```

Replace it with:

```tsx
  archived,
  archiving,
  onArchive,
  onDone,
```

- [ ] **Step 13: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
  archived: boolean;
  onDone: () => Promise<void>;
```

Replace it with:

```tsx
  archived: boolean;
  archiving: boolean;
  onArchive(): void;
  onDone: () => Promise<void>;
```

- [ ] **Step 14: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
  const [renameOpen, setRenameOpen] = useState(false);
  const archive = useMutation({
    mutationFn: () => api.updateClass(classId, { archived: !archived }),
    onSuccess: async () => {
      setOpen(false);
      await onDone();
    },
  });
  return (
```

Replace it with:

```tsx
  const [renameOpen, setRenameOpen] = useState(false);
  const archiveItem = (
    <button
      type="button"
      role="menuitem"
      className="class-menu-item"
      disabled={archiving}
      onClick={() => {
        setOpen(false);
        onArchive();
      }}
    >
      {archived ? 'Scoate din arhivă' : 'Arhivează clasa'}
    </button>
  );
  return (
```

- [ ] **Step 15: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
        <div className="class-menu class-more-menu" id="class-more-menu" role="menu">
          <button
```

Replace it with:

```tsx
        <div className="class-menu class-more-menu" id="class-more-menu" role="menu">
          {archived && archiveItem}
          <button
```

- [ ] **Step 16: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
          </button>
          <button
            type="button"
            role="menuitem"
            className="class-menu-item"
            disabled={archive.isPending}
            onClick={() => archive.mutate()}
          >
            {archived ? 'Scoate din arhivă' : 'Arhivează clasa'}
          </button>
          {archive.error && <ErrorMessage error={archive.error} />}
        </div>
```

Replace it with:

```tsx
          </button>
          {!archived && archiveItem}
        </div>
```

- [ ] **Step 17: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
// The line under a test's name: its date (or "ciornă") and where it stands,
// in orange when it waits on the teacher.
function headNote(test: TestSummary): { text: string; waits: boolean } {
  const date = test.startedAt === null ? 'ciornă' : formatDayMonth(test.startedAt);
  const waits = todoOf(test) !== null;
  if (test.flagCount > 0) return { text: `${date} · de verificat`, waits };
```

Replace it with:

```tsx
// The line under a test's name: its date (or "ciornă") and where it stands,
// in orange when it waits on the teacher (never in an archived class).
function headNote(test: TestSummary, readOnly: boolean): { text: string; waits: boolean } {
  const date = test.startedAt === null ? 'ciornă' : formatDayMonth(test.startedAt);
  const waits = !readOnly && todoOf(test) !== null;
  if (test.flagCount > 0) return { text: `${date} · de verificat`, waits };
```

- [ ] **Step 18: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx

function TestHeader({ test }: { test: TestSummary }) {
  const note = headNote(test);
  return (
```

Replace it with:

```tsx

function TestHeader({ test, readOnly }: { test: TestSummary; readOnly: boolean }) {
  const note = headNote(test, readOnly);
  return (
```

- [ ] **Step 19: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
// row "Media testului", and no average per student. Draft and open tests keep a
// column, so the page still leads to them.
export function GradesTable({
```

Replace it with:

```tsx
// row "Media testului", and no average per student. Draft and open tests keep a
// column, so the page still leads to them. `readOnly` (an archived class)
// offers no "Adaugă elevi".
export function GradesTable({
```

- [ ] **Step 20: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
  showArchived,
  onShowStudents,
```

Replace it with:

```tsx
  showArchived,
  readOnly = false,
  onShowStudents,
```

- [ ] **Step 21: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
  showArchived: boolean;
  onShowStudents(): void;
```

Replace it with:

```tsx
  showArchived: boolean;
  readOnly?: boolean;
  onShowStudents(): void;
```

- [ ] **Step 22: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
  let empty: ReactNode = null;
  if (students.length === 0) {
    empty = (
```

Replace it with:

```tsx
  let empty: ReactNode = null;
  if (students.length === 0 && readOnly) {
    empty = <p>Clasa nu are elevi.</p>;
  } else if (students.length === 0) {
    empty = (
```

- [ ] **Step 23: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
              {shown.map((test) => (
                <TestHeader key={test.code} test={test} />
              ))}
```

Replace it with:

```tsx
              {shown.map((test) => (
                <TestHeader key={test.code} test={test} readOnly={readOnly} />
              ))}
```

- [ ] **Step 24: Edit `src/admin/classPage/ClassTests.tsx`**

Find this block:

```tsx
import { todoOf } from '../shell/todo.ts';
import { nextStep } from '../testsPage/nextStep.ts';

```

Replace it with:

```tsx
import { todoOf } from '../shell/todo.ts';
import { nextStep, type NextStep } from '../testsPage/nextStep.ts';

```

- [ ] **Step 25: Edit `src/admin/classPage/ClassTests.tsx`**

Find this block:

```tsx
// teacher) and the one thing to do next. The archived tests show only when the
// teacher asks, here and in the table.
export function ClassTests({
```

Replace it with:

```tsx
// teacher) and the one thing to do next. The archived tests show only when the
// teacher asks, here and in the table. In an archived class (`readOnly`) the
// one step of a test is its report, once a paper is graded.
export function ClassTests({
```

- [ ] **Step 26: Edit `src/admin/classPage/ClassTests.tsx`**

Find this block:

```tsx
  schoolYear,
  showArchived,
```

Replace it with:

```tsx
  schoolYear,
  readOnly = false,
  showArchived,
```

- [ ] **Step 27: Edit `src/admin/classPage/ClassTests.tsx`**

Find this block:

```tsx
  schoolYear: number;
  showArchived: boolean;
```

Replace it with:

```tsx
  schoolYear: number;
  readOnly?: boolean;
  showArchived: boolean;
```

- [ ] **Step 28: Edit `src/admin/classPage/ClassTests.tsx`**

Find this block:

```tsx
            const { current } = stagesOf(test);
            const step = nextStep(test, current);
            const waits = todoOf(test) !== null;
            return (
```

Replace it with:

```tsx
            const { current } = stagesOf(test);
            const step: NextStep = !readOnly
              ? nextStep(test, current)
              : test.gradedCount > 0
                ? { kind: 'link', label: 'Raportul clasei', to: `/teste/${test.code}/raport` }
                : null;
            const waits = !readOnly && todoOf(test) !== null;
            return (
```

- [ ] **Step 29: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
// right with each test of the class. The first student is chosen at first.
export function ClassStudents({
```

Replace it with:

```tsx
// right with each test of the class. The first student is chosen at first.
// `readOnly` (an archived class): no adding, renaming, leaving or deleting.
export function ClassStudents({
```

- [ ] **Step 30: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
  tests,
  grades,
  onChanged,
}: {
```

Replace it with:

```tsx
  tests,
  grades,
  readOnly = false,
  onChanged,
}: {
```

- [ ] **Step 31: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
  tests: TestSummary[];
  grades: ClassGrade[];
  onChanged: () => Promise<void>;
}) {
```

Replace it with:

```tsx
  tests: TestSummary[];
  grades: ClassGrade[];
  readOnly?: boolean;
  onChanged: () => Promise<void>;
}) {
```

- [ ] **Step 32: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx

  if (students.length === 0) {
```

Replace it with:

```tsx

  if (students.length === 0 && readOnly) {
    return (
      <div className="class-card class-empty">
        <p>Clasa nu are elevi.</p>
      </div>
    );
  }
  if (students.length === 0) {
```

- [ ] **Step 33: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
        )}
        <button type="button" className="text-button student-add" onClick={() => setAddOpen(true)}>
          + Adaugă elevi
        </button>
        {addDialog}
```

Replace it with:

```tsx
        )}
        {!readOnly && (
          <button type="button" className="text-button student-add" onClick={() => setAddOpen(true)}>
            + Adaugă elevi
          </button>
        )}
        {addDialog}
```

- [ ] **Step 34: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
          grades={grades}
          onChanged={onChanged}
```

Replace it with:

```tsx
          grades={grades}
          readOnly={readOnly}
          onChanged={onChanged}
```

- [ ] **Step 35: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
  grades,
  onChanged,
```

Replace it with:

```tsx
  grades,
  readOnly,
  onChanged,
```

- [ ] **Step 36: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
  grades: ClassGrade[];
  onChanged: () => Promise<void>;
```

Replace it with:

```tsx
  grades: ClassGrade[];
  readOnly: boolean;
  onChanged: () => Promise<void>;
```

- [ ] **Step 37: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
        </div>
        <div className="student-detail-actions">
          <button type="button" className="text-button is-quiet" onClick={() => setRenameOpen(true)}>
            Redenumește
          </button>
          <button
            type="button"
            className="text-button is-quiet"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate()}
          >
            {student.active ? 'A plecat din clasă' : 'Revine în clasă'}
          </button>
          {student.canDelete && (
            <button type="button" className="text-button is-danger" disabled={remove.isPending} onClick={askRemove}>
              Șterge
            </button>
          )}
        </div>
      </div>
```

Replace it with:

```tsx
        </div>
        {!readOnly && (
          <div className="student-detail-actions">
            <button type="button" className="text-button is-quiet" onClick={() => setRenameOpen(true)}>
              Redenumește
            </button>
            <button
              type="button"
              className="text-button is-quiet"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate()}
            >
              {student.active ? 'A plecat din clasă' : 'Revine în clasă'}
            </button>
            {student.canDelete && (
              <button type="button" className="text-button is-danger" disabled={remove.isPending} onClick={askRemove}>
                Șterge
              </button>
            )}
          </div>
        )}
      </div>
```

- [ ] **Step 38: Edit `src/ui/brand.css`**

Find this block:

```css

/* The top line: the name, "Schimbă clasa" and the facts on the left; "Test nou
```

Replace it with:

```css

/* The strip above the head of an archived class. */
.class-archived {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
  margin: 0 0 1.25rem;
  padding: 0.875rem 1.25rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-panel);
  background: var(--raised);
}

.class-archived p {
  margin: 0;
}

.class-archived b {
  display: block;
}

/* The top line: the name, "Schimbă clasa" and the facts on the left; "Test nou
```

- [ ] **Step 39: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  121 passed | 1 skipped (122)`, `Tests  1950 passed | 3 skipped (1953)`.

- [ ] **Step 40: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 41: Commit**

```bash
git add src/admin/pages/ClassPage.tsx src/admin/classPage/GradesTable.tsx src/admin/classPage/ClassTests.tsx src/admin/classPage/ClassStudents.tsx src/ui/brand.css src/admin/pages/ClassPage.test.tsx
git commit -m "Show an archived class read only, with a strip to take it out of the archive"
```

### Task 3: The student's history

`GET /api/admin/students/:id/history` gives the classes, their started tests and the student's papers; `/admin/elevi/:id` draws one card per school year and class.

**Files:**
- Modify: `shared/api.ts` (`StudentHistoryTest`, `StudentHistory`; `StudentResult` goes), `server/db/students.ts` (`GRADE_COLUMNS`, `GradeRow`, `gradeOf`, `getStudentHistory`), `server/db/classes.ts` (`listClassGrades`), `src/admin/classPage/GradesTable.tsx` (`GradeCell` exported, `classId`, the names' link state), `src/admin/classPage/ClassStudents.tsx` (`ResultCell` exported, the link state), `src/admin/pages/ClassPage.tsx`, `src/ui/brand.css`
- Replace: `src/admin/pages/StudentPage.tsx`, `src/admin/pages/StudentPage.test.tsx`, `server/routes/studentHistory.test.ts`
- Test: `server/routes/classes.test.ts`, `src/admin/pages/ClassPage.test.tsx`

**Interfaces:**
- Produces: `interface StudentHistoryTest { classId: number; code: string; title: string; startedAt: string }`; `interface StudentHistory { student: { id: number; fullName: string }; classes: StudentClass[]; tests: StudentHistoryTest[]; grades: ClassGrade[] }`; `type StudentLinkState = { fromClass?: number } | null` (from `pages/StudentPage.tsx`); `GradesTable` takes `classId: number`.

- [ ] **Step 1: Replace `server/routes/studentHistory.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let studentId: number;
let classmateId: number;
let classId: number;

const started = (code: string, at: string) => api.db.prepare('UPDATE tests SET started_at = ? WHERE code = ?').bind(at, code).run();
const history = async (id = studentId) => (await api.request('GET', `/api/admin/students/${id}/history`)).body;

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana']);
  classId = cls.id;
  [studentId, classmateId] = cls.studentIds as [number, number];
});

afterEach(async () => {
  await api.dispose();
});

describe('GET /api/admin/students/:id/history', () => {
  it('lists the classes, their started tests newest first, and the papers of the student', async () => {
    // The student moves on to 7E2 in the next school year.
    const next = await makeClass(api, '7E2', [], 2027);
    await api.db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').bind(next.id, studentId).run();
    await api.request('PATCH', `/api/admin/classes/${classId}/students/${studentId}`, { active: false });

    const first = await makeTest(api, classId, 'Fracții');
    const second = await makeTest(api, classId, 'Ecuații');
    const later = await makeTest(api, next.id, 'Funcții');
    const unsent = await makeTest(api, next.id, 'Logaritmi');
    await started(first, '2026-10-06T07:15:00.000Z');
    await started(second, '2026-11-10T08:00:00.000Z');
    await started(later, '2027-10-05T07:00:00.000Z');
    await started(unsent, '2027-11-02T07:00:00.000Z');
    const firstUpload = await addSubmission(api, first, studentId, { status: 'graded', files: 1 });
    await addEvaluation(api, firstUpload, { grade: 7.5, items: [{ needsReview: true }, {}] });
    const laterUpload = await addSubmission(api, later, studentId, { status: 'graded', files: 1 });
    await addEvaluation(api, laterUpload, { grade: 9.25 });
    const secondUpload = await addSubmission(api, second, studentId, { status: 'submitted', files: 1 });
    // A classmate's paper stays out.
    const other = await addSubmission(api, first, classmateId, { status: 'graded', files: 1 });
    await addEvaluation(api, other, { grade: 4 });

    const res = await api.request('GET', `/api/admin/students/${studentId}/history`);
    expect(res.status).toBe(200);
    expect(res.body.student).toEqual({ id: studentId, fullName: 'Pop Ion' });
    expect(res.body.classes).toEqual([
      { id: next.id, name: '7E2', schoolYear: 2027, active: true },
      { id: classId, name: '6E2', schoolYear: 2026, active: false },
    ]);
    // A test of the class the student is in shows with no paper ("—").
    expect(res.body.tests).toEqual([
      { classId: next.id, code: unsent, title: 'Logaritmi', startedAt: '2027-11-02T07:00:00.000Z' },
      { classId: next.id, code: later, title: 'Funcții', startedAt: '2027-10-05T07:00:00.000Z' },
      { classId, code: second, title: 'Ecuații', startedAt: '2026-11-10T08:00:00.000Z' },
      { classId, code: first, title: 'Fracții', startedAt: '2026-10-06T07:15:00.000Z' },
    ]);
    const grades = [...res.body.grades].sort((a, b) => a.submissionId - b.submissionId);
    expect(grades).toMatchObject([
      { studentId, testCode: first, submissionId: firstUpload, status: 'graded', grade: 7.5, flagCount: 1 },
      { studentId, testCode: later, submissionId: laterUpload, status: 'graded', grade: 9.25, flagCount: 0 },
      { studentId, testCode: second, submissionId: secondUpload, status: 'submitted', grade: null, flagCount: 0 },
    ]);
  });

  it('leaves out drafts, and archived tests or tests of a class left with no paper of the student', async () => {
    const draft = await makeTest(api, classId, 'Ciornă');
    const archived = await makeTest(api, classId, 'Arhivat');
    const archivedSent = await makeTest(api, classId, 'Arhivat, trimis');
    await started(archived, '2026-10-06T07:15:00.000Z');
    await started(archivedSent, '2026-10-07T07:15:00.000Z');
    await api.db.prepare('UPDATE tests SET archived = 1 WHERE code IN (?, ?)').bind(archived, archivedSent).run();
    await addSubmission(api, archivedSent, studentId, { status: 'submitted', files: 1 });
    expect((await history()).tests.map((test: { code: string }) => test.code)).toEqual([archivedSent]);
    expect(draft).toBeTruthy();

    // After the student leaves, a new test of that class is not the student's.
    await api.request('PATCH', `/api/admin/classes/${classId}/students/${studentId}`, { active: false });
    const after = await makeTest(api, classId, 'După plecare');
    await started(after, '2026-12-01T07:00:00.000Z');
    expect((await history()).tests.map((test: { code: string }) => test.code)).toEqual([archivedSent]);
    // The classmate still in the class sees it.
    expect((await history(classmateId)).tests.map((test: { code: string }) => test.code)).toEqual([after]);
  });

  it('gives the result link and the published state of each paper', async () => {
    const code = await makeTest(api, classId, 'Fracții');
    await started(code, '2026-10-06T07:15:00.000Z');
    const upload = await addSubmission(api, code, studentId, { status: 'graded', files: 1 });
    await addEvaluation(api, upload, { grade: 8 });
    await api.db.prepare("UPDATE submissions SET result_token = 'tok-pop', results_open = 1 WHERE id = ?").bind(upload).run();
    expect((await history()).grades).toMatchObject([{ submissionId: upload, resultsOpen: true, resultToken: 'tok-pop' }]);
  });

  it('returns empty lists for a student with no test', async () => {
    const res = await api.request('GET', `/api/admin/students/${classmateId}/history`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ student: { fullName: 'Ionescu Ana' }, tests: [], grades: [] });
  });

  it('answers 404 for an unknown student and for a student of another teacher', async () => {
    expect((await api.request('GET', '/api/admin/students/99999/history')).status).toBe(404);
    expect((await api.request('GET', '/api/admin/students/abc/history')).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    expect((await api.request('GET', `/api/admin/students/${foreign.studentId}/history`)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Replace `src/admin/pages/StudentPage.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ClassGrade, StudentHistory } from '../../../shared/api.ts';
import { createFakeApi } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

const paper = (overrides: Partial<ClassGrade>): ClassGrade => ({
  studentId: 10,
  testCode: '7E2-27T1',
  submissionId: 1,
  status: 'graded',
  grade: 8,
  flagCount: 0,
  total: 80,
  maxTotal: 100,
  resultsOpen: false,
  resultToken: null,
  startedAt: '2027-10-05T08:00:00.000Z',
  ...overrides,
});

// Pop Ion is in 7E2 now (2027-2028) and was in 6E2 (2026-2027).
const history: StudentHistory = {
  student: { id: 10, fullName: 'Pop Ion' },
  classes: [
    { id: 2, name: '7E2', schoolYear: 2027, active: true },
    { id: 1, name: '6E2', schoolYear: 2026, active: false },
  ],
  tests: [
    { classId: 2, code: '7E2-27T3', title: 'Ecuații', startedAt: '2027-11-03T08:00:00.000Z' },
    { classId: 2, code: '7E2-27T2', title: 'Logaritmi', startedAt: '2027-10-06T08:00:00.000Z' },
    { classId: 2, code: '7E2-27T1', title: 'Test inițial', startedAt: '2027-09-15T08:00:00.000Z' },
    { classId: 1, code: '6E2-26T2', title: 'Funcții', startedAt: '2026-11-10T08:00:00.000Z' },
    { classId: 1, code: '6E2-26T1', title: 'Fracții', startedAt: '2026-10-06T07:15:00.000Z' },
  ],
  grades: [
    paper({ testCode: '7E2-27T3', submissionId: 31, grade: 7.64, total: 76.4, flagCount: 1 }),
    paper({ testCode: '7E2-27T2', submissionId: 21, grade: 8.2, total: 82, resultsOpen: true, resultToken: 'tok-21' }),
    paper({ testCode: '6E2-26T2', submissionId: 12, status: 'submitted', grade: null, total: null, maxTotal: null }),
    paper({ testCode: '6E2-26T1', submissionId: 11, grade: 7.5, total: 75 }),
  ],
};

const apiWith = (histories: StudentHistory[] = [history]) => createFakeApi({ classes: [], students: {}, histories });
const card = (name: RegExp) => within(screen.getByRole('region', { name }));
const rowOf = (region: ReturnType<typeof card>, test: string) => region.getByRole('rowheader', { name: new RegExp(`^${test}`) }).closest('tr')!;

describe('StudentPage', () => {
  it('shows the name, the class now and the earlier ones, each a link', async () => {
    const api = apiWith();
    renderAdmin('/elevi/10', api);
    expect(await screen.findByRole('heading', { level: 1, name: 'Pop Ion' })).toBeInTheDocument();
    expect(api.getStudentHistory).toHaveBeenCalledWith(10);
    const line = screen.getByText(/înainte în/);
    expect(line).toHaveTextContent('Clasa 7E2 în 2027-2028 · înainte în Clasa 6E2 a plecat (2026-2027)');
    expect(within(line).getByRole('link', { name: 'Clasa 7E2' })).toHaveAttribute('href', '/clase/2');
    expect(within(line).getByRole('link', { name: 'Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
  });

  it('shows one card per school year and class, newest first, a row per test', async () => {
    renderAdmin('/elevi/10', apiWith());
    await screen.findByRole('heading', { level: 1, name: 'Pop Ion' });
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      '2027-2028 · Clasa 7E2',
      '2026-2027 · Clasa 6E2',
    ]);
    const now = card(/^2027-2028/);
    expect(now.getAllByRole('rowheader').map((cell) => within(cell).getByRole('link').textContent)).toEqual([
      'Ecuații',
      'Logaritmi',
      'Test inițial',
    ]);
    expect(now.getByRole('link', { name: 'Ecuații' })).toHaveAttribute('href', '/teste/7E2-27T3');
    expect(within(rowOf(now, 'Ecuații')).getByText('3 noiembrie 2027')).toBeInTheDocument();
  });

  it('shows the points, the grade as the grades table draws it, the result and the paper', async () => {
    renderAdmin('/elevi/10', apiWith());
    await screen.findByRole('heading', { level: 1, name: 'Pop Ion' });
    const now = card(/^2027-2028/);

    // Points wait: orange with a dot, and the result waits for the check.
    const waiting = within(rowOf(now, 'Ecuații'));
    expect(waiting.getByText('76,4 / 100')).toBeInTheDocument();
    expect(waiting.getByRole('img', { name: '1 punct de verificat' }).closest('td')).toHaveClass('grade-flag');
    expect(waiting.getByRole('link', { name: /7,64/ })).toHaveAttribute('href', '/teste/7E2-27T3/elevi/31');
    expect(waiting.getByText('După verificare')).toBeInTheDocument();
    expect(waiting.getByRole('link', { name: 'Lucrarea' })).toHaveAttribute('href', '/teste/7E2-27T3/elevi/31');

    const published = within(rowOf(now, 'Logaritmi'));
    expect(published.getByText('Publicat')).toBeInTheDocument();
    expect(published.getByRole('button', { name: /Copiază linkul/ })).toBeInTheDocument();

    // No paper: "—" and "Nu a trimis lucrarea.", no paper link.
    const none = within(rowOf(now, 'Test inițial'));
    expect(none.getByTitle('Nu a trimis lucrarea')).toHaveTextContent('—');
    expect(none.getByText('Nu a trimis lucrarea.')).toBeInTheDocument();
    expect(none.queryByRole('link', { name: 'Lucrarea' })).not.toBeInTheDocument();

    const before = card(/^2026-2027/);
    expect(within(rowOf(before, 'Fracții')).getByText('Nepublicat')).toBeInTheDocument();
    // Sent, not graded yet: its state, as in the grades table.
    expect(within(rowOf(before, 'Funcții')).getAllByText('Trimis').length).toBeGreaterThan(0);
  });

  it('puts the legend of the grades table under each card', async () => {
    renderAdmin('/elevi/10', apiWith());
    await screen.findByRole('heading', { level: 1, name: 'Pop Ion' });
    expect(card(/^2027-2028/).getByText(/Nota se poate schimba după verificare/)).toHaveTextContent(
      'Nota se poate schimba după verificare. „—”: elevul nu a trimis lucrarea.',
    );
    expect(card(/^2026-2027/).getByText(/Nota se poate schimba după verificare/)).toBeInTheDocument();
  });

  it('leads back to the class the teacher came from, else to the class the student is in now', async () => {
    renderAdmin({ pathname: '/elevi/10', state: { fromClass: 1 } }, apiWith());
    expect(await screen.findByRole('link', { name: '← Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
  });

  it('leads back to the class the student is in now when no class is named', async () => {
    renderAdmin('/elevi/10', apiWith());
    expect(await screen.findByRole('link', { name: '← Clasa 7E2' })).toHaveAttribute('href', '/clase/2');
  });

  it('says so in a class with no started test', async () => {
    renderAdmin('/elevi/10', apiWith([{ ...history, tests: history.tests.filter((test) => test.classId === 1) }]));
    await screen.findByRole('heading', { level: 1, name: 'Pop Ion' });
    expect(card(/^2027-2028/).getByText('Niciun test început în această clasă.')).toBeInTheDocument();
  });

  it('renames the student in a dialog', async () => {
    const api = apiWith();
    renderAdmin('/elevi/10', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redenumește' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Redenumește Pop Ion' }));
    const field = dialog.getByLabelText('Numele elevului');
    await userEvent.clear(field);
    await userEvent.type(field, 'Pop Ioan');
    await userEvent.click(dialog.getByRole('button', { name: /Salvează/ }));
    expect(api.renameStudent).toHaveBeenCalledWith(10, 'Pop Ioan');
  });

  it('shows the not-found page for an id that is not a number', async () => {
    renderAdmin('/elevi/abc', apiWith());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('shows the server message for a student that does not exist', async () => {
    renderAdmin('/elevi/99', apiWith());
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am găsit ce cauți.');
  });
});
```

- [ ] **Step 3: Edit `server/routes/classes.test.ts`**

Find this block:

```ts
    expect(historyOne.body.classes).toHaveLength(1);
    expect(historyOne.body.results).toMatchObject([{ submissionId: subOne, grade: 6 }]);
    const historyTwo = await api.request('GET', `/api/admin/students/${two.studentIds[0]}/history`);
    expect(historyTwo.body.classes).toHaveLength(1);
    expect(historyTwo.body.results).toMatchObject([{ submissionId: subTwo, grade: 9 }]);
  });
```

Replace it with:

```ts
    expect(historyOne.body.classes).toHaveLength(1);
    expect(historyOne.body.grades).toMatchObject([{ submissionId: subOne, grade: 6 }]);
    const historyTwo = await api.request('GET', `/api/admin/students/${two.studentIds[0]}/history`);
    expect(historyTwo.body.classes).toHaveLength(1);
    expect(historyTwo.body.grades).toMatchObject([{ submissionId: subTwo, grade: 9 }]);
  });
```

- [ ] **Step 4: Edit `src/admin/pages/ClassPage.test.tsx`**

Find this block:

```tsx

  it('links a grade to the result of the student', async () => {
```

Replace it with:

```tsx

  it('opens the student page from a name, which leads back to this class', async () => {
    const histories = [
      {
        student: { id: 10, fullName: 'Pop Ion' },
        classes: [
          { id: 3, name: '7E2', schoolYear: 2027, active: true },
          { id: 1, name: '6E2', schoolYear: 2026, active: true },
        ],
        tests: [],
        grades: [],
      },
    ];
    renderAdmin('/clase/1', createFakeApi({ ...classData(), histories }));
    const table = within(await screen.findByRole('table', { name: 'Notele elevilor la teste' }));
    await userEvent.click(table.getByRole('link', { name: 'Pop Ion' }));
    expect(await screen.findByRole('link', { name: '← Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
  });

  it('links a grade to the result of the student', async () => {
```

- [ ] **Step 5: Run the tests to see them fail**

Run: `npx vitest run server/routes/studentHistory.test.ts server/routes/classes.test.ts src/admin/pages/StudentPage.test.tsx src/admin/pages/ClassPage.test.tsx`
Expected: FAIL. `Test Files  4 failed (4)`, `Tests  14 failed | 93 passed (107)`: the API still answers the old history (`expected undefined to deeply equal [ { classId: 2, …(3) }, …(3) ]`, `TypeError: Cannot read properties of undefined (reading 'map')`, `expected undefined to match object [ { submissionId: 20, grade: 6 } ]` in "treats two students with the same name in different classes as different students"), and the old page cannot read the new fake history (`Unable to find role="heading" and name "Pop Ion"`, `Unable to find role="link" and name "← Clasa 6E2"`, `Unable to find role="button" and name "Redenumește"`). The typecheck fails too until the code steps are done.

- [ ] **Step 6: Edit `shared/api.ts`**

Find this block:

```ts

// One graded test of a student.
export interface StudentResult {
  submissionId: number;
  testCode: string;
  testTitle: string;
  className: string;
  schoolYear: number;
  // The date and hour of the test.
  date: string;
  // Out of 10.
  grade: number;
  // Items of the result that the teacher has not checked yet.
  flagCount: number;
}

// The student page (spec §9): every graded test of the student, in every
// class and school year, newest first.
export interface StudentHistory {
```

Replace it with:

```ts

// One started test of a class the student is in, or was in.
export interface StudentHistoryTest {
  classId: number;
  code: string;
  title: string;
  // When Start test opened the uploads: the date of the test.
  startedAt: string;
}

// The student page (spec §11.2): the student's classes, the newest school year
// first; their started tests, newest first; and the student's papers in them,
// as the grades table of the class page reads them. An archived test, or a test
// of a class the student left, is listed only when the student sent a paper.
export interface StudentHistory {
```

- [ ] **Step 7: Edit `shared/api.ts`**

Find this block:

```ts
  classes: StudentClass[];
  results: StudentResult[];
}
```

Replace it with:

```ts
  classes: StudentClass[];
  tests: StudentHistoryTest[];
  grades: ClassGrade[];
}
```

- [ ] **Step 8: Edit `server/db/students.ts`**

Find this block:

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { StudentClass, StudentHistory, StudentResult, StudentRow } from '../../shared/api.ts';
import { studentNameKey, studentNameKeySql } from '../../shared/students.ts';
```

Replace it with:

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { ClassGrade, StudentClass, StudentHistory, StudentHistoryTest, StudentRow, UploadStatus } from '../../shared/api.ts';
import { studentNameKey, studentNameKeySql } from '../../shared/students.ts';
```

- [ ] **Step 9: Edit `server/db/students.ts`**

Find this block:

```ts

// The student page: the student, the student's classes, and every graded test,
// newest first. Null when the student is not the teacher's.
export async function getStudentHistory(db: D1Database, teacherId: number, studentId: number): Promise<StudentHistory | null> {
  const [student, classes, results] = await db.batch<Record<string, unknown>>([
    db.prepare('SELECT id, full_name FROM students WHERE id = ? AND teacher_id = ?').bind(studentId, teacherId),
```

Replace it with:

```ts

// The columns of a paper as the grades table reads it, over `submissions s`,
// `tests t` and `evaluations ev` (left-joined on graded papers). The flag count
// is 0 until the upload is graded. A result is open when the whole test is
// published or this one alone, as the student's page reads it.
export const GRADE_COLUMNS = `s.student_id, t.code AS test_code, s.id AS submission_id, s.status, ev.grade,
  ev.total, ev.max_total, s.result_token, s.started_at,
  CASE WHEN t.results_open = 1 OR s.results_open = 1 THEN 1 ELSE 0 END AS results_open,
  CASE WHEN ev.id IS NULL THEN 0 ELSE ${flagCountSql('ev')} END AS flag_count`;

export interface GradeRow {
  student_id: number;
  test_code: string;
  submission_id: number;
  status: Exclude<UploadStatus, 'none'>;
  grade: number | null;
  total: number | null;
  max_total: number | null;
  results_open: number | null;
  result_token: string | null;
  started_at: string | null;
  flag_count: number;
}

export function gradeOf(row: GradeRow): ClassGrade {
  return {
    studentId: row.student_id,
    testCode: row.test_code,
    submissionId: row.submission_id,
    status: row.status,
    grade: row.grade,
    flagCount: row.flag_count,
    total: row.total,
    maxTotal: row.max_total,
    resultsOpen: row.results_open === 1,
    resultToken: row.result_token,
    startedAt: row.started_at,
  };
}

// The student page: the student, the student's classes, their started tests and
// the student's papers in them, in one batch. A test that is archived, or of a
// class the student left, is listed only when the student sent a paper to it.
// Null when the student is not the teacher's.
export async function getStudentHistory(db: D1Database, teacherId: number, studentId: number): Promise<StudentHistory | null> {
  const [student, classes, tests, grades] = await db.batch<Record<string, unknown>>([
    db.prepare('SELECT id, full_name FROM students WHERE id = ? AND teacher_id = ?').bind(studentId, teacherId),
```

- [ ] **Step 10: Edit `server/db/students.ts`**

Find this block:

```ts
      .prepare(
        `SELECT s.id AS submission_id, t.code, t.title, c.name AS class_name, c.school_year,
           COALESCE(t.started_at, t.created_at) AS date, ev.grade, ${flagCountSql('ev')} AS flag_count
         FROM submissions s
         JOIN tests t ON t.id = s.test_id
         JOIN classes c ON c.id = t.class_id
         JOIN evaluations ev ON ev.submission_id = s.id
         WHERE s.student_id = ? AND t.teacher_id = ? AND s.status = 'graded'
         ORDER BY date DESC, t.id DESC`,
      )
      .bind(studentId, teacherId),
  ]);
```

Replace it with:

```ts
      .prepare(
        `SELECT t.class_id, t.code, t.title, t.started_at FROM tests t
         JOIN enrollments e ON e.class_id = t.class_id AND e.student_id = ?
         WHERE t.teacher_id = ? AND t.started_at IS NOT NULL
           AND ((e.active = 1 AND t.archived = 0)
             OR EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.student_id = e.student_id))
         ORDER BY t.started_at DESC, t.id DESC`,
      )
      .bind(studentId, teacherId),
    db
      .prepare(
        `SELECT ${GRADE_COLUMNS}
         FROM submissions s
         JOIN tests t ON t.id = s.test_id AND t.teacher_id = ?
         LEFT JOIN evaluations ev ON ev.submission_id = s.id AND s.status = 'graded'
         WHERE s.student_id = ?`,
      )
      .bind(teacherId, studentId),
  ]);
```

- [ ] **Step 11: Edit `server/db/students.ts`**

Find this block:

```ts
    ),
    results: (
      (results?.results ?? []) as {
        submission_id: number;
        code: string;
        title: string;
        class_name: string;
        school_year: number;
        date: string;
        grade: number;
        flag_count: number;
      }[]
    ).map(
      (result): StudentResult => ({
        submissionId: result.submission_id,
        testCode: result.code,
        testTitle: result.title,
        className: result.class_name,
        schoolYear: result.school_year,
        date: result.date,
        grade: result.grade,
        flagCount: result.flag_count,
      }),
    ),
  };
```

Replace it with:

```ts
    ),
    tests: ((tests?.results ?? []) as { class_id: number; code: string; title: string; started_at: string }[]).map(
      (test): StudentHistoryTest => ({ classId: test.class_id, code: test.code, title: test.title, startedAt: test.started_at }),
    ),
    grades: ((grades?.results ?? []) as unknown as GradeRow[]).map(gradeOf),
  };
```

- [ ] **Step 12: Edit `server/db/classes.ts`**

Find this block:

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { ClassGrade, ClassSummary, StudentRow, UploadStatus } from '../../shared/api.ts';
import { compareClassNames, displayClassName } from '../../shared/classes.ts';
```

Replace it with:

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { ClassGrade, ClassSummary, StudentRow } from '../../shared/api.ts';
import { compareClassNames, displayClassName } from '../../shared/classes.ts';
```

- [ ] **Step 13: Edit `server/db/classes.ts`**

Find this block:

```ts
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';
import { flagCountSql } from './evaluations.ts';
import { noWorkSql } from './students.ts';

```

Replace it with:

```ts
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';
import { GRADE_COLUMNS, gradeOf, noWorkSql, type GradeRow } from './students.ts';

```

- [ ] **Step 14: Edit `server/db/classes.ts`**

Find this block:

```ts
// query. The class must belong to the teacher; for any other class the list is
// empty. The flag count is 0 until the upload is graded. A result is open when
// the whole test is published or this one alone, as the student's page reads it.
export async function listClassGrades(db: D1Database, teacherId: number, classId: number): Promise<ClassGrade[]> {
```

Replace it with:

```ts
// query. The class must belong to the teacher; for any other class the list is
// empty.
export async function listClassGrades(db: D1Database, teacherId: number, classId: number): Promise<ClassGrade[]> {
```

- [ ] **Step 15: Edit `server/db/classes.ts`**

Find this block:

```ts
    .prepare(
      `SELECT s.student_id, t.code AS test_code, s.id AS submission_id, s.status, ev.grade,
         ev.total, ev.max_total, s.result_token, s.started_at,
         CASE WHEN t.results_open = 1 OR s.results_open = 1 THEN 1 ELSE 0 END AS results_open,
         CASE WHEN ev.id IS NULL THEN 0 ELSE ${flagCountSql('ev')} END AS flag_count
       FROM submissions s
```

Replace it with:

```ts
    .prepare(
      `SELECT ${GRADE_COLUMNS}
       FROM submissions s
```

- [ ] **Step 16: Edit `server/db/classes.ts`**

Find this block:

```ts
    .bind(classId, teacherId)
    .all<{
      student_id: number;
      test_code: string;
      submission_id: number;
      status: Exclude<UploadStatus, 'none'>;
      grade: number | null;
      total: number | null;
      max_total: number | null;
      results_open: number | null;
      result_token: string | null;
      started_at: string | null;
      flag_count: number;
    }>();
  return results.map((row) => ({
    studentId: row.student_id,
    testCode: row.test_code,
    submissionId: row.submission_id,
    status: row.status,
    grade: row.grade,
    flagCount: row.flag_count,
    total: row.total,
    maxTotal: row.max_total,
    resultsOpen: row.results_open === 1,
    resultToken: row.result_token,
    startedAt: row.started_at,
  }));
}
```

Replace it with:

```ts
    .bind(classId, teacherId)
    .all<GradeRow>();
  return results.map(gradeOf);
}
```

- [ ] **Step 17: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
import { todoOf } from '../shell/todo.ts';

```

Replace it with:

```tsx
import { todoOf } from '../shell/todo.ts';
import type { StudentLinkState } from '../pages/StudentPage.tsx';

```

- [ ] **Step 18: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx

function GradeCell({ grade }: { grade: ClassGrade | undefined }) {
  if (!grade) {
```

Replace it with:

```tsx

// A grade cell: the grade (orange with a dot when points wait), the state of an
// upload not graded yet, or "—" for no paper. The student page draws it too.
export function GradeCell({ grade }: { grade: ClassGrade | undefined }) {
  if (!grade) {
```

- [ ] **Step 19: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
export function GradesTable({
  students,
```

Replace it with:

```tsx
export function GradesTable({
  classId,
  students,
```

- [ ] **Step 20: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
}: {
  students: StudentRow[];
```

Replace it with:

```tsx
}: {
  classId: number;
  students: StudentRow[];
```

- [ ] **Step 21: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
                <th scope="row">
                  <Link to={`/elevi/${student.id}`}>{student.fullName}</Link>
                  {!student.active && (
```

Replace it with:

```tsx
                <th scope="row">
                  <Link to={`/elevi/${student.id}`} state={{ fromClass: classId } satisfies StudentLinkState}>
                    {student.fullName}
                  </Link>
                  {!student.active && (
```

- [ ] **Step 22: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
import { orderedStudents } from './GradesTable.tsx';

```

Replace it with:

```tsx
import { orderedStudents } from './GradesTable.tsx';
import type { StudentLinkState } from '../pages/StudentPage.tsx';

```

- [ ] **Step 23: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
// The result of one paper for the student: published, not yet (with the link
// to copy), after the check, or no paper.
function ResultCell({ grade, studentName }: { grade: ClassGrade | undefined; studentName: string }) {
  if (grade === undefined) return <span className="hint">Nu a trimis lucrarea.</span>;
```

Replace it with:

```tsx
// The result of one paper for the student: published, not yet (with the link
// to copy), after the check, or no paper. The student page shows it too.
export function ResultCell({ grade, studentName }: { grade: ClassGrade | undefined; studentName: string }) {
  if (grade === undefined) return <span className="hint">Nu a trimis lucrarea.</span>;
```

- [ ] **Step 24: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
        <span>Elevul vede rezultatul pe linkul lui, după ce îl publici.</span>
        <Link to={`/elevi/${student.id}`}>Toate notele elevului, din toate clasele</Link>
      </p>
```

Replace it with:

```tsx
        <span>Elevul vede rezultatul pe linkul lui, după ce îl publici.</span>
        <Link to={`/elevi/${student.id}`} state={{ fromClass: classId } satisfies StudentLinkState}>
          Toate notele elevului, din toate clasele
        </Link>
      </p>
```

- [ ] **Step 25: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
            <GradesTable
              students={students}
```

Replace it with:

```tsx
            <GradesTable
              classId={classId}
              students={students}
```

- [ ] **Step 26: Replace `src/admin/pages/StudentPage.tsx`**

```tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import type { ClassGrade, StudentClass, StudentHistory, StudentHistoryTest } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatDate } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { RenameDialog } from '../classPage/ClassDialogs.tsx';
import { ResultCell } from '../classPage/ClassStudents.tsx';
import { GradeCell } from '../classPage/GradesTable.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

// The state a link to the student page passes: the class the teacher came
// from, for "←".
export type StudentLinkState = { fromClass?: number } | null;

// /elevi/:id: a student's history (spec §11.2): one card per class and school
// year, newest first, with a row per started test of that class.
export function StudentPage() {
  const studentId = parsePositiveId(useParams().id);
  if (studentId === null) return <NotFoundPage />;
  return <StudentHistoryView key={studentId} studentId={studentId} />;
}

// "←" leads to the class the teacher came from, else to the class the student
// is in now (the newest one), else to the newest class.
function backClass(classes: StudentClass[], fromClass: number | undefined): StudentClass | undefined {
  return classes.find((cls) => cls.id === fromClass) ?? classes.find((cls) => cls.active) ?? classes[0];
}

function StudentHistoryView({ studentId }: { studentId: number }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [fromClass] = useState(() => (location.state as StudentLinkState)?.fromClass);
  const [renameOpen, setRenameOpen] = useState(false);
  const renameButton = useRef<HTMLButtonElement>(null);
  const history = useQuery({ queryKey: ['student', studentId], queryFn: () => api.getStudentHistory(studentId) });

  if (history.isPending) return <p>Se încarcă…</p>;
  if (history.error) return <ErrorMessage error={history.error} />;
  const { student, classes } = history.data;
  const back = backClass(classes, fromClass);
  const [now, ...before] = classes;
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['student', studentId] });
    await queryClient.invalidateQueries({ queryKey: ['class'] });
  };

  return (
    <section className="history-page">
      {back && (
        <p className="back-link">
          <Link to={`/clase/${back.id}`}>← {displayClassName(back.name)}</Link>
        </p>
      )}
      <div className="history-head">
        <div>
          <h1>{student.fullName}</h1>
          {now && (
            <p className="lead-line">
              <ClassLink cls={now} /> în {formatSchoolYear(now.schoolYear)}
              {before.length > 0 && ' · înainte în '}
              {before.map((cls, index) => (
                <span key={cls.id}>
                  {index > 0 && ', '}
                  <ClassLink cls={cls} /> ({formatSchoolYear(cls.schoolYear)})
                </span>
              ))}
            </p>
          )}
        </div>
        <button ref={renameButton} type="button" className="button-quiet" onClick={() => setRenameOpen(true)}>
          Redenumește
        </button>
      </div>

      {classes.length === 0 ? (
        <p className="hint">Elevul nu este în nicio clasă.</p>
      ) : (
        classes.map((cls) => <YearCard key={cls.id} cls={cls} history={history.data} />)
      )}

      {renameOpen && (
        <RenameDialog
          title={`Redenumește ${student.fullName}`}
          label="Numele elevului"
          initial={student.fullName}
          maxLength={80}
          save={(next) => api.renameStudent(student.id, next)}
          onSaved={refresh}
          onClose={() => setRenameOpen(false)}
          returnFocus={renameButton}
        />
      )}
    </section>
  );
}

function ClassLink({ cls }: { cls: StudentClass }) {
  return (
    <>
      <Link to={`/clase/${cls.id}`}>{displayClassName(cls.name)}</Link>
      {!cls.active && (
        <>
          {' '}
          <span className="tag">a plecat</span>
        </>
      )}
    </>
  );
}

// One school year and class: a row per test, newest first, with the points,
// the grade as the grades table draws it, the result and the paper.
function YearCard({ cls, history }: { cls: StudentClass; history: StudentHistory }) {
  const tests = history.tests.filter((test) => test.classId === cls.id);
  const gradeOf = (test: StudentHistoryTest): ClassGrade | undefined =>
    history.grades.find((grade) => grade.testCode === test.code);
  const titleId = `history-${cls.id}`;
  const title = `${formatSchoolYear(cls.schoolYear)} · ${displayClassName(cls.name)}`;
  return (
    <section className="class-card history-card" aria-labelledby={titleId}>
      <div className="class-card-head">
        <h2 id={titleId}>{title}</h2>
      </div>
      {tests.length === 0 ? (
        <p className="hint history-empty">Niciun test început în această clasă.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="student-results history-table">
              <caption className="sr-only">Testele din {title}</caption>
              <thead>
                <tr>
                  <th scope="col">Test</th>
                  <th scope="col" className="num">
                    Punctaj
                  </th>
                  <th scope="col" className="num">
                    Nota
                  </th>
                  <th scope="col">Rezultatul</th>
                  <th scope="col">
                    <span className="sr-only">Lucrarea</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tests.map((test) => {
                  const grade = gradeOf(test);
                  const graded = grade?.status === 'graded';
                  return (
                    <tr key={test.code}>
                      <th scope="row">
                        <Link to={`/teste/${test.code}`}>{test.title}</Link>
                        <span>{formatDate(test.startedAt)}</span>
                      </th>
                      <td className="num">
                        {graded && grade.total !== null && grade.maxTotal !== null
                          ? `${formatPoints(grade.total)} / ${formatPoints(grade.maxTotal)}`
                          : '—'}
                      </td>
                      <GradeCell grade={grade} />
                      <td className="student-result">
                        <ResultCell grade={grade} studentName={history.student.fullName} />
                      </td>
                      <td className="student-paper">
                        {grade !== undefined && (
                          <Link to={`/teste/${test.code}/elevi/${grade.submissionId}`}>Lucrarea</Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="class-card-foot">
            <span>
              <span className="flag-dot" aria-hidden="true"></span> Nota se poate schimba după verificare. „—”: elevul nu
              a trimis lucrarea.
            </span>
          </p>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 27: Edit `src/ui/brand.css`**

Find this block:

```css

td.student-result {
```

Replace it with:

```css

/* The student page: one card per class and school year, with the table of the
   "Elevi" tab and the grade cells of the grades table. On a phone the table
   scrolls inside its card. */
.history-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  margin-bottom: 1.25rem;
}

.history-head h1 {
  margin: 0 0 0.25rem;
}

.history-head .lead-line {
  margin: 0;
}

.history-card + .history-card {
  margin-top: 1.25rem;
}

.history-empty {
  margin: 0;
  padding: 0 1.25rem 1.125rem;
}

table.history-table {
  min-width: 40rem;
}

table.history-table td:nth-child(3) {
  text-align: right;
  white-space: nowrap;
}

table.history-table td a {
  color: inherit;
}

table.history-table td:nth-child(3) a {
  text-decoration: none;
}

table.history-table td:nth-child(3) a:hover {
  color: var(--ink);
  text-decoration: underline;
}

table.history-table td.grade-none,
table.history-table td.grade-state {
  color: var(--muted);
}

table.history-table td.grade-state {
  font-size: 0.8125rem;
}

table.history-table td.grade-flag {
  color: var(--orange);
  font-weight: 700;
}

table.history-table td.grade-flag .flag-dot {
  margin-right: 0.4375rem;
}

td.student-result {
```

- [ ] **Step 28: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  121 passed | 1 skipped (122)`, `Tests  1958 passed | 3 skipped (1961)`.

- [ ] **Step 29: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 30: Commit**

```bash
git add shared/api.ts server/db/students.ts server/db/classes.ts src/admin/classPage/GradesTable.tsx src/admin/classPage/ClassStudents.tsx src/admin/pages/ClassPage.tsx src/admin/pages/StudentPage.tsx src/ui/brand.css server/routes/studentHistory.test.ts server/routes/classes.test.ts src/admin/pages/StudentPage.test.tsx src/admin/pages/ClassPage.test.tsx
git commit -m "Show the student's history as one card per school year and class"
```

### Task 4: The class report on one page

`/admin/teste/:code/raport`: the list of its parts and "Notele pe grupe" on the left; "Pe scurt", "Rezultatele elevilor", "Pe exerciții" and "Analiza clasei" on the right. The spec gets what the prototype settled for §11.2 and §11.3.

**Files:**
- Replace: `src/admin/pages/ReportPage.tsx`, `src/admin/reportPage/ReportTables.tsx`
- Modify: `src/admin/reportPage/AnalysisSection.tsx`, `src/ui/brand.css`, `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`
- Test: `src/admin/pages/ReportPage.test.tsx`

**Interfaces:**
- Produces: `ReportTiles`, `GradeGroups`, `ResultsTable`, `ExerciseStatsTable` (from `reportPage/ReportTables.tsx`; `StatsSummary` and `MissingList` go). `AnalysisSection` is the part `#analiza`.

- [ ] **Step 1: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
describe('ReportPage', () => {
  it('shows the statistics, the table with the items to check marked, and who has no result', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    expect(await screen.findByRole('heading', { name: 'Raportul clasei' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← 6E2-26T1' })).toHaveAttribute('href', '/teste/6E2-26T1');
    expect(screen.getByText('Corectate 2 din 3 elevi · de verificat 2')).toBeInTheDocument();
    const stats = screen.getByRole('region', { name: 'Statistici' });
    expect(within(stats).getByText('Media').nextSibling).toHaveTextContent('7,75');
    expect(within(stats).getByText('Mediana').nextSibling).toHaveTextContent('7,75');
    expect(within(stats).getByText('Cea mai mică notă').nextSibling).toHaveTextContent('5,5');
    expect(within(stats).getByText('Cea mai mare notă').nextSibling).toHaveTextContent('10');

    const table = screen.getByRole('table', { name: 'Punctajele elevilor pe exerciții' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['Avram Dan', 'Pop Ion']);
    expect(within(rows[1]!).getByRole('link', { name: 'Pop Ion' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/6');
```

Replace it with:

```tsx
describe('ReportPage', () => {
  it('names the test, its class and its date, and leads back to the test', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    expect(await screen.findByRole('heading', { level: 1, name: 'Raportul clasei' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Fracții' })).toHaveAttribute('href', '/teste/6E2-26T1');
    const line = screen.getByText(/^Fracții ·/);
    expect(line).toHaveTextContent('Fracții · Clasa 6E2 · 6 octombrie 2026');
    expect(within(line).getByRole('link', { name: 'Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
  });

  it('lists the parts of the report with their counts, the first one marked', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    const parts = within(await screen.findByRole('navigation', { name: 'Părțile raportului' }));
    const links = parts.getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Pe scurt', '#pe-scurt'],
      ['Rezultatele elevilor2', '#rezultate'],
      ['Pe exerciții2', '#exercitii'],
      ['Analiza clasei', '#analiza'],
    ]);
    expect(links[0]).toHaveAttribute('aria-current', 'true');
    for (const id of ['pe-scurt', 'rezultate', 'exercitii', 'analiza']) expect(document.getElementById(id)).not.toBeNull();
  });

  it('shows the numbers of the class in "Pe scurt"', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    const tiles = within(await screen.findByRole('region', { name: 'Pe scurt' }));
    expect(tiles.getByText('Media testului').nextSibling).toHaveTextContent('7,75');
    expect(tiles.getByText('Mediana').nextSibling).toHaveTextContent('7,75');
    expect(tiles.getByText('Cea mai mică notă').nextSibling).toHaveTextContent('5,5');
    expect(tiles.getByText('Cea mai mare notă').nextSibling).toHaveTextContent('10');
    expect(tiles.getByText('Corectate').nextSibling).toHaveTextContent('2 din 3 elevide verificat 2');
  });

  it('shows a row per student, the items to check marked, and the students with no paper', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    const results = within(await screen.findByRole('region', { name: 'Rezultatele elevilor' }));
    expect(results.getByText('2 din 3 elevi')).toBeInTheDocument();
    const table = results.getByRole('table', { name: 'Punctajele elevilor pe exerciții' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['Avram Dan', 'Pop Ion', 'Stan Eva']);
    expect(within(rows[1]!).getByRole('link', { name: 'Pop Ion' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/6');
```

- [ ] **Step 2: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
    expect(within(rows[0]!).queryByText('(de verificat)')).not.toBeInTheDocument();
    expect(within(rows[1]!).getByText('5,5 / 10')).toBeInTheDocument();

    const missing = screen.getByRole('region', { name: 'Fără rezultat' });
    expect(within(missing).getByText('Stan Eva')).toBeInTheDocument();
    expect(within(missing).getByText('· Nu a trimis')).toBeInTheDocument();
  });

  it('puts the grade right after the name', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    const table = await screen.findByRole('table', { name: 'Punctajele elevilor pe exerciții' });
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Elev', 'Nota', 'Total', 'I.1', 'II.1']);
    const row = within(table).getAllByRole('row')[2]!;
    const cells = within(row).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('5,5');
    expect(cells[0]).toHaveTextContent('de verificat 2');
    expect(cells[1]).toHaveTextContent('5,5 / 10');
    expect(cells).toHaveLength(4);
  });
```

Replace it with:

```tsx
    expect(within(rows[0]!).queryByText('(de verificat)')).not.toBeInTheDocument();
    expect(within(rows[2]!).getByRole('cell')).toHaveTextContent('Nu a trimis lucrarea.');
    expect(within(rows[2]!).getByRole('cell')).toHaveAttribute('colspan', '4');
    expect(screen.queryByRole('region', { name: 'Fără rezultat' })).not.toBeInTheDocument();
  });

  it('says why a student with a paper has no result yet', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith(report({ missing: [{ studentId: 12, studentName: 'Stan Eva', status: 'submitted' }] })));
    const table = await screen.findByRole('table', { name: 'Punctajele elevilor pe exerciții' });
    const row = within(table).getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    expect(within(row).getByRole('cell')).toHaveTextContent('Trimis');
  });

  it('puts the points of each exercise first, with its maximum, then the total and the grade', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    const table = await screen.findByRole('table', { name: 'Punctajele elevilor pe exerciții' });
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Elev',
      'I.14,5p',
      'II.14,5p',
      'Total',
      'Nota',
    ]);
    const row = within(table).getAllByRole('row')[2]!;
    const cells = within(row).getAllByRole('cell');
    expect(cells).toHaveLength(4);
    expect(cells[2]).toHaveTextContent('5,5 / 10');
    expect(cells[3]).toHaveTextContent('5,5');
    expect(cells[3]).toHaveTextContent('de verificat 2');
  });
```

- [ ] **Step 3: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    const groups = await screen.findByRole('table', { name: 'Notele pe grupe' });
    const counts = within(groups)
      .getAllByRole('row')
      .slice(1)
      .map((row) => [within(row).getByRole('rowheader').textContent, within(row).getAllByRole('cell')[0]!.textContent]);
    expect(counts).toEqual([
```

Replace it with:

```tsx
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    const groups = await screen.findByRole('list', { name: 'Notele pe grupe' });
    const counts = within(groups)
      .getAllByRole('listitem')
      .map((item) => [item.firstChild!.textContent, item.lastChild!.textContent]);
    expect(counts).toEqual([
```

- [ ] **Step 4: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
    ]);
    const exercises = screen.getByRole('table', { name: 'Statistici pe exerciții' });
    const second = within(exercises).getAllByRole('row')[2]!;
    expect(within(second).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['2,25 din 4,5', '50%', '1', '0', '1']);
```

Replace it with:

```tsx
    ]);
    const exercises = within(screen.getByRole('region', { name: 'Pe exerciții' }));
    expect(exercises.getByText('2 exerciții')).toBeInTheDocument();
    const second = exercises.getAllByRole('row')[2]!;
    expect(within(second).getByRole('rowheader')).toHaveTextContent('Subiectul II, exercițiul 1');
    expect(within(second).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['2,25 din 4,5', '50%', '1', '0', '1']);
```

- [ ] **Step 5: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/ReportPage.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  7 failed | 14 passed (21)`: the old page has no head link to the test's title (`Unable to find an accessible element with the role "link" and name "← Fracții"`), no list of parts (`Unable to find role="navigation" and name "Părțile raportului"`), no parts (`Unable to find role="region" and name "Pe scurt"`, `… "Rezultatele elevilor"`), no row for a student with no result (`… role "rowheader" and name "Stan Eva"`), the old column order (`AssertionError: expected [ Array(5) ] to deeply equal [ 'Elev', 'I.14,5p', 'II.14,5p', …(2) ]`) and no list of grade groups (`Unable to find role="list" and name "Notele pe grupe"`).

- [ ] **Step 6: Replace `src/admin/reportPage/ReportTables.tsx`**

```tsx
import { Link } from 'react-router';
import type { ClassReport } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import type { ClassStats } from '../../../shared/stats.ts';
import { pointsLevel, uploadStatusLabel } from '../../ui/format.ts';

const dash = '—';
const grade = (value: number | null) => (value === null ? dash : formatPoints(value));

// "Pe scurt" (spec §11.3): the average, the median, the lowest and the highest
// grade, and how many active students were graded.
export function ReportTiles({ stats }: { stats: ClassStats }) {
  const tiles: [string, string][] = [
    ['Media testului', grade(stats.average)],
    ['Mediana', grade(stats.median)],
    ['Cea mai mică notă', grade(stats.min)],
    ['Cea mai mare notă', grade(stats.max)],
  ];
  return (
    <dl className="report-tiles">
      {tiles.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      <div>
        <dt>Corectate</dt>
        <dd>
          {stats.gradedCount} <small>din {stats.activeCount} elevi</small>
          {stats.flaggedCount > 0 && <small className="is-waiting">de verificat {stats.flaggedCount}</small>}
        </dd>
      </div>
    </dl>
  );
}

// "Notele pe grupe": a bar per group of grades, with its count.
export function GradeGroups({ stats }: { stats: ClassStats }) {
  const most = Math.max(1, ...stats.groups.map((group) => group.count));
  return (
    <section className="class-card report-groups" aria-labelledby="report-groups-title">
      <div className="class-card-head">
        <h2 id="report-groups-title">Notele pe grupe</h2>
      </div>
      <ul className="report-bars" aria-labelledby="report-groups-title">
        {stats.groups.map((group) => (
          <li key={group.label}>
            <span>{group.label}</span>
            <span className="report-bar" aria-hidden="true">
              <span style={{ width: `${(group.count / most) * 100}%` }}></span>
            </span>
            <b>{group.count}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

// One row for each graded student: the points of each exercise (an item that
// waits for the teacher's check is marked), the total and the grade. An active
// student with no graded paper has a row that says why.
export function ResultsTable({ code, report }: { code: string; report: ClassReport }) {
  return (
    <div className="table-wrap">
      <table className="report-table results-table">
        <caption className="sr-only">Punctajele elevilor pe exerciții</caption>
        <thead>
          <tr>
            <th scope="col">Elev</th>
            {report.exercises.map((exercise) => (
              <th key={exercise.id} scope="col" className="num" title={exercise.label}>
                {exercise.id}
                <span className="report-max">{formatPoints(exercise.maxPoints)}p</span>
              </th>
            ))}
            <th scope="col" className="num">
              Total
            </th>
            <th scope="col" className="num">
              Nota
            </th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <tr key={row.submissionId}>
              <th scope="row">
                <Link to={`/teste/${code}/elevi/${row.submissionId}`}>{row.studentName}</Link>
              </th>
              {report.exercises.map((exercise) => {
                const item = row.items.find((candidate) => candidate.exerciseId === exercise.id);
                if (!item) {
                  return (
                    <td key={exercise.id} className="num">
                      {dash}
                    </td>
                  );
                }
                return (
                  <td key={exercise.id} className={item.flagged ? 'num flagged-cell' : 'num'}>
                    <span className={`points points-${pointsLevel(item.points, item.maxPoints)}`}>{formatPoints(item.points)}</span>
                    {item.flagged && <span className="sr-only"> (de verificat)</span>}
                  </td>
                );
              })}
              <td className="num">
                {formatPoints(row.total)} / {formatPoints(row.maxTotal)}
              </td>
              <td className="num report-grade">
                <strong className={row.flagCount > 0 ? 'is-waiting' : undefined}>{formatPoints(row.grade)}</strong>
                {row.flagCount > 0 && <span className="tag tag-wait">de verificat {row.flagCount}</span>}
              </td>
            </tr>
          ))}
          {report.missing.map((student) => (
            <tr key={`missing-${student.studentId}`} className="is-muted">
              <th scope="row">{student.studentName}</th>
              <td colSpan={report.exercises.length + 2}>
                {student.status === 'none' ? 'Nu a trimis lucrarea.' : uploadStatusLabel(student.status)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Average points, the share of the maximum (with a bar), and how many students
// got all, some, and none of the points.
export function ExerciseStatsTable({ stats }: { stats: ClassStats }) {
  return (
    <div className="table-wrap">
      <table className="report-table">
        <caption className="sr-only">Statistici pe exerciții</caption>
        <thead>
          <tr>
            <th scope="col">Exercițiul</th>
            <th scope="col" className="num">
              Media
            </th>
            <th scope="col" className="report-share">
              % din maxim
            </th>
            <th scope="col" className="num">
              Tot
            </th>
            <th scope="col" className="num">
              Parțial
            </th>
            <th scope="col" className="num">
              Nimic
            </th>
          </tr>
        </thead>
        <tbody>
          {stats.perExercise.map((exercise) => (
            <tr key={exercise.exerciseId}>
              <th scope="row">{exercise.label}</th>
              <td className="num">
                {exercise.averagePoints === null ? dash : `${formatPoints(exercise.averagePoints)} din ${formatPoints(exercise.maxPoints)}`}
              </td>
              <td className="report-share">
                {exercise.averagePercent === null ? (
                  dash
                ) : (
                  <span className="report-share-line">
                    <span className="report-bar" aria-hidden="true">
                      <span style={{ width: `${exercise.averagePercent}%` }}></span>
                    </span>
                    <b>{exercise.averagePercent}%</b>
                  </span>
                )}
              </td>
              <td className="num">{exercise.full}</td>
              <td className="num">{exercise.partial}</td>
              <td className="num">{exercise.zero}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 7: Replace `src/admin/pages/ReportPage.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { ClassReport } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { classStats } from '../../../shared/stats.ts';
import { normalizeTestCode } from '../../../shared/tests.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { classCsv } from '../../../shared/csv.ts';
import { countLabel, formatDate, uploadStatusLabel } from '../../ui/format.ts';
import { classPdf, classPdfFileName } from '../pdf/classPdf.ts';
import { PdfActions } from '../pdf/PdfActions.tsx';
import { AnalysisSection } from '../reportPage/AnalysisSection.tsx';
import { ExerciseStatsTable, GradeGroups, ReportTiles, ResultsTable } from '../reportPage/ReportTables.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

// While the robot writes the analysis, the page asks for news every 10 seconds.
export function reportRefreshInterval(report: ClassReport | undefined): number | false {
  if (report === undefined) return false;
  const robotCanWrite = report.test.status === 'evaluating' || report.test.status === 'done';
  return report.analysis.status === 'requested' && robotCanWrite ? 10_000 : false;
}

// /teste/:code/raport: the class report (spec §11.3): one page, with the list
// of its parts on the left.
export function ReportPage() {
  const code = normalizeTestCode(useParams().code ?? '');
  if (code === null) return <NotFoundPage />;
  return <ReportView key={code} code={code} />;
}

const PARTS = [
  { id: 'pe-scurt', name: 'Pe scurt' },
  { id: 'rezultate', name: 'Rezultatele elevilor' },
  { id: 'exercitii', name: 'Pe exerciții' },
  { id: 'analiza', name: 'Analiza clasei' },
] as const;
type PartId = (typeof PARTS)[number]['id'];

// The part the teacher reads: the last one whose top has passed the upper third
// of the screen. Without IntersectionObserver the first part stays marked.
function useCurrentPart(ready: boolean): PartId {
  const [current, setCurrent] = useState<PartId>('pe-scurt');
  useEffect(() => {
    if (!ready || typeof IntersectionObserver === 'undefined') return;
    const passed = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) passed.set(entry.target.id, entry.boundingClientRect.top < window.innerHeight / 3);
        const read = PARTS.filter((part) => passed.get(part.id));
        setCurrent(read.length > 0 ? read[read.length - 1]!.id : 'pe-scurt');
      },
      { threshold: [0, 1], rootMargin: '0px 0px -66% 0px' },
    );
    for (const part of PARTS) {
      const element = document.getElementById(part.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [ready]);
  return current;
}

function ReportView({ code }: { code: string }) {
  const api = useApi();
  const query = useQuery({
    queryKey: ['report', code],
    queryFn: () => api.getReport(code),
    refetchInterval: (state) => reportRefreshInterval(state.state.data),
  });
  const graded = (query.data?.rows.length ?? 0) > 0;
  const current = useCurrentPart(graded);

  if (query.isPending) return <p>Se încarcă…</p>;
  if (query.data === undefined) return <ErrorMessage error={query.error} />;
  const report = query.data;
  const stats = classStats(report);
  const counts: Partial<Record<PartId, string>> = {
    rezultate: String(report.rows.length),
    exercitii: String(report.exercises.length),
  };

  return (
    <section className="report-page">
      <p className="back-link">
        <Link to={`/teste/${code}`}>← {report.test.title}</Link>
      </p>
      {query.isRefetchError && <ErrorMessage error={query.error} />}
      <div className="report-head">
        <div>
          <h1>Raportul clasei</h1>
          <p className="lead-line">
            {report.test.title} · <Link to={`/clase/${report.test.classId}`}>{displayClassName(report.test.className)}</Link>
            {report.test.startedAt !== null && ` · ${formatDate(report.test.startedAt)}`}
          </p>
        </div>
        {graded && (
          <PdfActions
            pdf={{ build: () => classPdf(report), fileName: classPdfFileName(report), title: `Raportul clasei · ${report.test.code}` }}
            csv={{ build: () => classCsv(report, uploadStatusLabel), fileName: `${report.test.code}-raport.csv` }}
          />
        )}
      </div>

      {!graded ? (
        <p className="hint">Nicio lucrare nu este corectată încă. Raportul apare după prima corectare.</p>
      ) : (
        <div className="report-layout">
          <aside className="report-side">
            <nav className="report-toc" aria-label="Părțile raportului">
              <ul>
                {PARTS.map((part) => (
                  <li key={part.id}>
                    <a href={`#${part.id}`} aria-current={part.id === current ? 'true' : undefined}>
                      {part.name}
                      {counts[part.id] !== undefined && <span>{counts[part.id]}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <GradeGroups stats={stats} />
          </aside>
          <div className="report-main">
            <section id="pe-scurt" className="report-part" aria-label="Pe scurt">
              <ReportTiles stats={stats} />
            </section>
            <section id="rezultate" className="report-part class-card" aria-labelledby="rezultate-title">
              <div className="class-card-head">
                <h2 id="rezultate-title">Rezultatele elevilor</h2>
                <span>
                  {stats.gradedCount} din {stats.activeCount} elevi
                </span>
              </div>
              <ResultsTable code={code} report={report} />
            </section>
            <section id="exercitii" className="report-part class-card" aria-labelledby="exercitii-title">
              <div className="class-card-head">
                <h2 id="exercitii-title">Pe exerciții</h2>
                <span>{countLabel(report.exercises.length, 'exercițiu', 'exerciții')}</span>
              </div>
              <ExerciseStatsTable stats={stats} />
            </section>
            <AnalysisSection code={code} report={report} />
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 8: Edit `src/admin/reportPage/AnalysisSection.tsx`**

Find this block:

```tsx

// The analysis of the class (spec §14.2): written by the robot after the
// grading. Out of date after corrections; the teacher asks for a new one.
```

Replace it with:

```tsx

// The analysis of the class (spec §11.3, §14.2): written by the robot after the
// grading. Out of date after corrections; the teacher asks for a new one.
```

- [ ] **Step 9: Edit `src/admin/reportPage/AnalysisSection.tsx`**

Find this block:

```tsx
  return (
    <section aria-label="Analiza clasei">
      <h2>Analiza clasei</h2>
      {status === 'requested' && canAsk && !retrying && <p role="status">Robotul scrie analiza clasei. Pagina se reînnoiește singură.</p>}
      {retrying && canAsk && (
        <div className="warning" role="status">
          <p>Ultima încercare a eșuat. Robotul va încerca din nou la următoarea rulare.</p>
          {button('Regenerează')}
        </div>
      )}
      {status === 'requested' && !canAsk && <p className="hint">Analiza se scrie după ce testul este corectat din nou.</p>}
      {status === 'none' && (
        <>
          <p className="hint">Analiza clasei nu a fost făcută încă.</p>
          {button('Fă analiza clasei')}
        </>
      )}
      {status === 'failed' && (
        <div className="warning">
          <p>
            <strong>Robotul nu a putut scrie analiza clasei.</strong>
          </p>
          {button('Regenerează')}
        </div>
      )}
      {status === 'ready' && content && (
        <>
          {stale && (
            <div className="warning" role="status">
              <p>Analiza poate fi depășită: notele s-au schimbat după ce a fost scrisă.</p>
              {button('Regenerează')}
            </div>
          )}
          <p>
            <MathText text={content.overview} />
          </p>
          {SECTIONS.map(({ key, title }) =>
            content[key].length > 0 ? (
              <section key={key} aria-label={title}>
                <h3>{title}</h3>
                <ul>
                  {content[key].map((text, index) => (
                    <li key={index}>
                      <MathText text={text} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
          {!stale && button('Regenerează')}
        </>
      )}
      {robot && <p role="status">{robotStartMessage(robot)}</p>}
      {regenerate.error && <ErrorMessage error={regenerate.error} />}
    </section>
```

Replace it with:

```tsx
  return (
    <section id="analiza" className="report-part class-card" aria-labelledby="analiza-title">
      <div className="class-card-head">
        <h2 id="analiza-title">Analiza clasei</h2>
        {status === 'ready' && content && !stale && button('Regenerează')}
      </div>
      <div className="report-analysis">
        {status === 'requested' && canAsk && !retrying && <p role="status">Robotul scrie analiza clasei. Pagina se reînnoiește singură.</p>}
        {retrying && canAsk && (
          <div className="warning" role="status">
            <p>Ultima încercare a eșuat. Robotul va încerca din nou la următoarea rulare.</p>
            {button('Regenerează')}
          </div>
        )}
        {status === 'requested' && !canAsk && <p className="hint">Analiza se scrie după ce testul este corectat din nou.</p>}
        {status === 'none' && (
          <>
            <p className="hint">Analiza clasei nu a fost făcută încă.</p>
            {button('Fă analiza clasei')}
          </>
        )}
        {status === 'failed' && (
          <div className="warning">
            <p>
              <strong>Robotul nu a putut scrie analiza clasei.</strong>
            </p>
            {button('Regenerează')}
          </div>
        )}
        {status === 'ready' && content && (
          <>
            {stale && (
              <div className="warning" role="status">
                <p>Analiza poate fi depășită: notele s-au schimbat după ce a fost scrisă.</p>
                {button('Regenerează')}
              </div>
            )}
            <p>
              <MathText text={content.overview} />
            </p>
            {SECTIONS.map(({ key, title }) =>
              content[key].length > 0 ? (
                <section key={key} aria-label={title}>
                  <h3>{title}</h3>
                  <ul>
                    {content[key].map((text, index) => (
                      <li key={index}>
                        <MathText text={text} />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null,
            )}
          </>
        )}
        {robot && <p role="status">{robotStartMessage(robot)}</p>}
        {regenerate.error && <ErrorMessage error={regenerate.error} />}
      </div>
    </section>
```

- [ ] **Step 10: Edit `src/ui/brand.css`**

Find this block:

```css

/* The class report (spec §14.2) */

.stats-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  margin: 0.5rem 0 1rem;
}

.stats-grid > div {
  min-width: 7rem;
}

.stats-grid dt {
  color: var(--muted);
  font-size: 0.9rem;
}

.stats-grid dd {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}
```

Replace it with:

```css

/* The class report (spec §11.3): the list of its parts and the grade groups on
   the left, sticky under the top bar; the parts one after the other on the
   right. On a phone: one column, and the list of parts goes. */

.report-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
  margin-bottom: 1.25rem;
}

.report-head h1 {
  margin: 0 0 0.25rem;
}

.report-head .lead-line {
  margin: 0;
}

.report-head .pdf-actions {
  margin: 0;
}

.report-layout {
  display: grid;
  grid-template-columns: 17rem minmax(0, 1fr);
  gap: 1.5rem;
  align-items: start;
}

.report-side {
  position: sticky;
  top: calc(var(--top, 0px) + 1.5rem);
  display: grid;
  gap: 1rem;
}

.report-toc ul {
  margin: 0;
  padding: 0.5rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-panel);
  background: var(--sheet);
  list-style: none;
}

.report-toc a {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius);
  color: var(--text);
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
}

.report-toc a:hover {
  background: var(--raised);
}

.report-toc a[aria-current='true'] {
  background: var(--ink-tint);
  color: var(--ink);
}

.report-toc a span {
  color: var(--muted);
  font-weight: 500;
}

.report-bars {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0 1.25rem 1.125rem;
  list-style: none;
}

.report-bars li {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr) 2rem;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.875rem;
}

.report-bars b {
  text-align: right;
}

.report-bar {
  display: block;
  height: 0.75rem;
  overflow: hidden;
  border-radius: 4px;
  background: var(--active);
}

.report-bar > span {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: var(--ink);
}

.report-part {
  scroll-margin-top: calc(var(--top, 0px) + 1rem);
}

.report-part + .report-part {
  margin-top: 1.5rem;
}

.report-tiles {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 0;
}

.report-tiles > div {
  padding: 0.875rem 1rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-panel);
  background: var(--sheet);
}

.report-tiles dt {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.report-tiles dd {
  margin: 0.125rem 0 0;
  font-size: 1.625rem;
  font-weight: 700;
  line-height: 1.2;
}

.report-tiles dd small {
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 500;
}

.report-tiles dd small.is-waiting {
  display: block;
  color: var(--orange);
}

.report-part .table-wrap {
  padding: 0 0 0.5rem;
}

.report-part table.report-table {
  width: 100%;
  background: none;
}

table.report-table .num {
  text-align: right;
  white-space: nowrap;
}

table.results-table tr.is-muted td {
  text-align: left;
}

.report-max {
  display: block;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 500;
}

td.report-grade .is-waiting {
  color: var(--orange);
}

td.report-grade .tag {
  margin-left: 0.4rem;
  font-size: 0.75rem;
}

table.report-table tr.is-muted th,
table.report-table tr.is-muted td {
  color: var(--muted);
  font-weight: 400;
}

.report-share {
  min-width: 9rem;
}

.report-share-line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 2.75rem;
  align-items: center;
  gap: 0.5rem;
}

.report-share-line .report-bar {
  height: 0.5rem;
}

.report-share-line b {
  font-size: 0.8125rem;
  text-align: right;
}

.report-analysis {
  padding: 0 1.25rem 1.25rem;
}

.report-analysis > p:first-child {
  margin-top: 0;
}

.report-analysis h3 {
  margin: 1rem 0 0.5rem;
  font-size: 0.9375rem;
}

.report-analysis ul {
  margin: 0;
  padding-left: 1.25rem;
}

@media (max-width: 64rem) {
  .report-tiles {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 56.25rem) {
  .report-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .report-side {
    position: static;
  }

  .report-toc {
    display: none;
  }
}

@media (max-width: 30rem) {
  .report-tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

- [ ] **Step 11: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
- One card per school year and class, newest first, under the heading "2026-2027 · Clasa 10B". A row per test, newest first: the test (a link) with its date; "Punctaj" ("76,4 / 100"); "Nota" as the grades table draws it (the grade; orange with a dot when points wait; "—" when no paper); "Rezultatul" ("Publicat" with "Copiază linkul", "Nepublicat", "După verificare", "Nu a trimis lucrarea."); and "Lucrarea" (a link to the paper's page).
- Under each card, the legend of the grades table. No average per student (decision 12).
```

Replace it with:

```markdown
- One card per school year and class, newest first, under the heading "2026-2027 · Clasa 10B". A row per test, newest first: the test (a link) with its date; "Punctaj" ("76,4 / 100"); "Nota" as the grades table draws it (the grade; orange with a dot when points wait; "—" when no paper); "Rezultatul" ("Publicat" with "Copiază linkul", "Nepublicat", "După verificare", "Nu a trimis lucrarea."); and "Lucrarea" (a link to the paper's page).
- The rows are the started tests of that class. A draft is not listed. An archived test, or a test of a class the student left, is listed only when the student sent a paper to it. A class with no started test says "Niciun test început în această clasă."
- Under each card, the legend of the grades table. No average per student (decision 12).
```

- [ ] **Step 12: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
- Left, 17 rem, sticky: a list of the parts ("Pe scurt", "Rezultatele elevilor" with its count, "Pe exerciții" with its count, "Analiza clasei"), the current one marked; under it the card "Notele pe grupe": 1–4,99, 5–6,99, 7–8,99, 9–10, each a blue bar with its count.
- Right, one after the other: the tiles "Media testului", "Mediana", "Cea mai mică notă", "Cea mai mare notă" and "Corectate 8 din 9 elevi"; the card "Rezultatele elevilor" (a row per student: the points of each exercise, with the exercise's maximum under its short name, "Total", "Nota"; a student with no paper says "Nu a trimis lucrarea."); the card "Pe exerciții" ("Media", "% din maxim" with a bar, "Tot", "Parțial", "Nimic"); the card "Analiza clasei" with "Regenerează" (starts the robot), the date it was written, "Greșeli frecvente" and "Ce exersați în continuare". Its other states keep today's texts.
- On a phone: one column, and the list of parts goes.
```

Replace it with:

```markdown
- Left, 17 rem, sticky: a list of the parts ("Pe scurt", "Rezultatele elevilor" with its count, "Pe exerciții" with its count, "Analiza clasei"), the current one marked; under it the card "Notele pe grupe": 1–4,99, 5–6,99, 7–8,99, 9–10, each a blue bar with its count.
- Right, one after the other: the tiles "Media testului", "Mediana", "Cea mai mică notă", "Cea mai mare notă" and "Corectate 8 din 9 elevi"; the card "Rezultatele elevilor" (a row per student: the points of each exercise, with the exercise's maximum under its short name, "Total", "Nota"; a student with no paper says "Nu a trimis lucrarea.", one whose paper is not graded yet says its state; the list "Fără rezultat" goes); the card "Pe exerciții" ("Media", "% din maxim" with a bar, "Tot", "Parțial", "Nimic"); the card "Analiza clasei" with "Regenerează" (starts the robot) and its sections ("Greșeli frecvente", "Ce exersați în continuare" and the others). No date: the app does not store when the analysis was written. Its other states keep today's texts.
- On a phone: one column, and the list of parts goes.
```

- [ ] **Step 13: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  121 passed | 1 skipped (122)`, `Tests  1962 passed | 3 skipped (1965)`.

- [ ] **Step 14: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 15: Commit**

```bash
git add src/admin/pages/ReportPage.tsx src/admin/reportPage/ReportTables.tsx src/admin/reportPage/AnalysisSection.tsx src/ui/brand.css docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md src/admin/pages/ReportPage.test.tsx
git commit -m "Show the class report on one page, with the list of its parts on the left"
```

### Task 5: The notes for the next sessions

`src/AGENTS.md` describes the three pages; `server/AGENTS.md` names the archived class's rule and the history's tests.

**Files:**
- Modify: `src/AGENTS.md`, `server/AGENTS.md`

- [ ] **Step 1: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the files, the students' link while the test is a draft or open, rename, archive, delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table, "Recorectează tot"). `pages/ReviewPage.tsx` and `reviewPage/` are the review of the points to check (redesign spec §7, `/teste/:code/verificare`): the papers and their points (`ReviewQueue.tsx`), one page of the paper at a time (`ReviewPhoto.tsx`; no marks on the photo, because the robot does not say where an answer is), and the decision (`ReviewDecision.tsx`: "Accept", the stepper and "Salvează", "Am verificat paginile", the paper's exercises). `points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first), steps between them, and writes the address (`?lucrare=&punct=`, replaced, never a new step in the history). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point; a refused one reads the paper and the test again. An address that names no paper of the test is rewritten first (`ReviewLoader` draws `<Navigate replace>` to `firstSpot()`), before any paper is drawn: a refresh never moves the spot, and no decision is made on a spot the address does not hold. The next point opens only if the teacher is still at the decided one (a call-level `onSuccess` of `mutate`, which does not run once the page is gone), and its heading takes the focus (`focus({ preventScroll: true })`). An address of a paper with no result now (graded again) shows that paper with the reason (`submissionPage/waitingText.ts`, shared with the paper page); when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A, J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `pages/StudentPage.tsx` is a student's history. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `pages/LoginPage.tsx` is the login and sign-up form: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. `LoginPage` also has "Am uitat parola" (asks for the link by email); `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/AccountPage.tsx` is Contul meu (password, "Ieși din cont"). `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). A demo account sees, at the top of every page, how many papers it may still have graded. `pages/ReportPage.tsx` and `reportPage/` are the class report (`shared/stats.ts` makes its numbers). `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`)); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (the account menu, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: exactly the three cases of spec §5; `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

Replace it with:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the files, the students' link while the test is a draft or open, rename, archive, delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table, "Recorectează tot"). `pages/ReviewPage.tsx` and `reviewPage/` are the review of the points to check (redesign spec §7, `/teste/:code/verificare`): the papers and their points (`ReviewQueue.tsx`), one page of the paper at a time (`ReviewPhoto.tsx`; no marks on the photo, because the robot does not say where an answer is), and the decision (`ReviewDecision.tsx`: "Accept", the stepper and "Salvează", "Am verificat paginile", the paper's exercises). `points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first), steps between them, and writes the address (`?lucrare=&punct=`, replaced, never a new step in the history). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point; a refused one reads the paper and the test again. An address that names no paper of the test is rewritten first (`ReviewLoader` draws `<Navigate replace>` to `firstSpot()`), before any paper is drawn: a refresh never moves the spot, and no decision is made on a spot the address does not hold. The next point opens only if the teacher is still at the decided one (a call-level `onSuccess` of `mutate`, which does not run once the page is gone), and its heading takes the focus (`focus({ preventScroll: true })`). An address of a paper with no result now (graded again) shows that paper with the reason (`submissionPage/waitingText.ts`, shared with the paper page); when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A, J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `pages/LoginPage.tsx` is the login and sign-up form: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. `LoginPage` also has "Am uitat parola" (asks for the link by email); `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/AccountPage.tsx` is Contul meu (password, "Ieși din cont"). `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). A demo account sees, at the top of every page, how many papers it may still have graded. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls, by an `IntersectionObserver`; "Pe scurt" stays marked without one) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`)); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (the account menu, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: exactly the three cases of spec §5; `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

- [ ] **Step 2: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `stages.ts`: the six stages of a test (Pregătire, Tipărire, În clasă, Corectare, Verificare, Rezultate), each done, waiting on the teacher, in progress or later, and the current one, from the tests list (`TestSummary.prepared`, `barem`, the counts and `averageGrade`). A stage waits on the teacher (orange) exactly when `todoOf()` has the test, at that stage. The test page uses it too: it opens on the current stage (from data read for this visit, not data cached from an earlier one), and `stageHash()` and `stageFromHash()` give each stage's panel its address (`#pregatire` … `#rezultate`). After the first load only the teacher changes the panel: a refresh or a button that moves the test to another stage keeps it. The Teste page's "Pornește corectarea" opens `#corectare`.
- `classPage/GradesTable.tsx` is the class page's grade table, in a card (students by tests, the oldest test on the left, a 156px column per test headed by its name and "date · state", orange when the test waits; a cell shows the grade, orange with a dot when points wait, the upload's state, or "—" when no paper was sent; the last row is "Media testului", no per-student average; draft and open tests keep a column; archived tests show only when asked). `classPage/ClassTests.tsx` is "Testele clasei", beside the table (under it below 1180px): the newest test first, each with its date, the papers sent, its stage (orange when it waits) and its one next step (from `testsPage/nextStep.ts`, the button that publishes the results included; filled blue when it waits), and the toggle "Arată și testele arhivate (n)" that reveals the archived tests in the table too. `classPage/ClassStudents.tsx` is the "Elevi" tab, one card split in two (stacked below 760px): the students on the left (search that ignores case and diacritics, orange dot when points wait, "+ Adaugă elevi"), the chosen student on the right (the first one at first; "Redenumește", "A plecat din clasă", "Șterge"; a table of the class's tests with the date, the points, the grade and "N puncte de verificat", the result ("Publicat", "Nepublicat" with "Copiază linkul", "După verificare", "Nu a trimis lucrarea."), and "Lucrarea"; link "Toate notele elevului, din toate clasele"). `classPage/ClassDialogs.tsx` holds the class page's dialogs: "Clasă nouă" (the name and the students, one per line, in one step; a class made before its students failed is not made twice), "Adaugă elevi" (early warnings for names already in the class or pasted twice), and the rename of a class or a student. They use `Modal.tsx`, the app's dialog: a title, ×, a dimmed backdrop, the focus on the first field and kept inside, Esc (in the capture phase, before a panel), and the focus back to the opener (or to `returnFocus` when the opener closed with its menu). `pages/ClassPage.tsx` is the class page (`/clase/:id`): the top line (the name, "Schimbă clasa" with the classes of the year, the current one marked, a dot for one that waits, the archived classes last in their muted group "Arhivate" (the only list that leads to them; an archived class's ⋯ has "Scoate din arhivă"), and "+ Clasă nouă"; the facts; "Test nou pentru această clasă"; ⋯ with "Redenumește clasa"/"Arhivează clasa") and the two tabs ("Elevi" with its count). `pages/LastClassPage.tsx` is `/clase`: it opens the last class the teacher saw (kept in `localStorage` as `quickeval:lastClass`, else the first active one of the year), or, with no active class, offers "+ Clasă nouă" and links the archived classes. A link's state (`ClassLinkState`) goes on to that class page: `{ newClass: true }` (the panel's "+ Clasă nouă") opens that dialog on arrival, `{ archived: true }` (the panel's "Arhivate (n)") opens "Schimbă clasa" at "Arhivate". The old "page with all classes" (`ClassesPage`) and `ClassStudentsPage` no longer exist.
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `testPage/StagePanel.tsx` (the panel În clasă) holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
```

Replace it with:

```markdown
- `stages.ts`: the six stages of a test (Pregătire, Tipărire, În clasă, Corectare, Verificare, Rezultate), each done, waiting on the teacher, in progress or later, and the current one, from the tests list (`TestSummary.prepared`, `barem`, the counts and `averageGrade`). A stage waits on the teacher (orange) exactly when `todoOf()` has the test, at that stage. The test page uses it too: it opens on the current stage (from data read for this visit, not data cached from an earlier one), and `stageHash()` and `stageFromHash()` give each stage's panel its address (`#pregatire` … `#rezultate`). After the first load only the teacher changes the panel: a refresh or a button that moves the test to another stage keeps it. The Teste page's "Pornește corectarea" opens `#corectare`.
- `classPage/GradesTable.tsx` is the class page's grade table, in a card (students by tests, the oldest test on the left, a 156px column per test headed by its name and "date · state", orange when the test waits; a cell shows the grade, orange with a dot when points wait, the upload's state, or "—" when no paper was sent; the last row is "Media testului", no per-student average; draft and open tests keep a column; archived tests show only when asked). `classPage/ClassTests.tsx` is "Testele clasei", beside the table (under it below 1180px): the newest test first, each with its date, the papers sent, its stage (orange when it waits) and its one next step (from `testsPage/nextStep.ts`, the button that publishes the results included; filled blue when it waits), and the toggle "Arată și testele arhivate (n)" that reveals the archived tests in the table too. `classPage/ClassStudents.tsx` is the "Elevi" tab, one card split in two (stacked below 760px): the students on the left (search that ignores case and diacritics, orange dot when points wait, "+ Adaugă elevi"), the chosen student on the right (the first one at first; "Redenumește", "A plecat din clasă", "Șterge"; a table of the class's tests with the date, the points, the grade and "N puncte de verificat", the result ("Publicat", "Nepublicat" with "Copiază linkul", "După verificare", "Nu a trimis lucrarea."), and "Lucrarea"; link "Toate notele elevului, din toate clasele"). An archived class is the same page, read only (`readOnly` on `GradesTable`, `ClassTests` and `ClassStudents`): a strip "Clasă arhivată." with "Scoate din arhivă" above the head (one write with ⋯'s item), the tag "Arhivată" first in the facts, no "Test nou pentru această clasă", no "+ Adaugă elevi", no "Redenumește", "A plecat din clasă" or "Șterge" for a student, nothing orange, and "Raportul clasei" as each test's one step once a paper is graded. `classPage/ClassDialogs.tsx` holds the class page's dialogs: "Clasă nouă" (the name and the students, one per line, in one step; a class made before its students failed is not made twice), "Adaugă elevi" (early warnings for names already in the class or pasted twice), and the rename of a class or a student. They use `Modal.tsx`, the app's dialog: a title, ×, a dimmed backdrop, the focus on the first field and kept inside, Esc (in the capture phase, before a panel), and the focus back to the opener (or to `returnFocus` when the opener closed with its menu). `pages/ClassPage.tsx` is the class page (`/clase/:id`): the top line (the name, "Schimbă clasa" with the classes of the year, the current one marked, a dot for one that waits, the archived classes last in their muted group "Arhivate" (the only list that leads to them; an archived class's ⋯ has "Scoate din arhivă"), and "+ Clasă nouă"; the facts; "Test nou pentru această clasă"; ⋯ with "Redenumește clasa"/"Arhivează clasa") and the two tabs ("Elevi" with its count). `pages/LastClassPage.tsx` is `/clase`: it opens the last class the teacher saw (kept in `localStorage` as `quickeval:lastClass`, else the first active one of the year), or, with no active class, offers "+ Clasă nouă" and links the archived classes. A link's state (`ClassLinkState`) goes on to that class page: `{ newClass: true }` (the panel's "+ Clasă nouă") opens that dialog on arrival, `{ archived: true }` (the panel's "Arhivate (n)") opens "Schimbă clasa" at "Arhivate". The old "page with all classes" (`ClassesPage`) and `ClassStudentsPage` no longer exist.
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `testPage/StagePanel.tsx` (the panel În clasă) holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
```

- [ ] **Step 3: Edit `src/AGENTS.md`**

Find this block:

```markdown
- A PDF never carries what is for the teacher only: `studentPdfInput()` is the only way into the student's PDF, and its type has no confidence and no review reason. Keep it so, and keep no word about how the work was graded in it. CSV cells that hold text go through `csvText()` (`shared/csv.ts`), which guards against formulas.
- The class PDF and the report page have one column for each exercise (up to 60): the page table scrolls in its `.table-wrap` and uses `report-table`, not the `uploads` table that turns into cards on a phone. The grade table of the class page does the same. Only the page table puts Elev, Nota, Total first; the class PDF and the CSV keep their order.
- Dark colours in `ui/brand.css` are written twice (the `[data-theme="dark"]` block and the `prefers-color-scheme` block): keep both copies equal, the class colours included (`ui/brand.test.ts` checks it). The styles are flat: no gradients, and a shadow (`--float`) only on what floats (panels, menus).
```

Replace it with:

```markdown
- A PDF never carries what is for the teacher only: `studentPdfInput()` is the only way into the student's PDF, and its type has no confidence and no review reason. Keep it so, and keep no word about how the work was graded in it. CSV cells that hold text go through `csvText()` (`shared/csv.ts`), which guards against formulas.
- The class PDF and the report page have one column for each exercise (up to 60): the page table scrolls in its `.table-wrap` and uses `report-table`, not the `uploads` table that turns into cards on a phone. The grade table of the class page does the same. The page table puts the exercises first, then Total and Nota (each exercise's maximum under its short name); the class PDF and the CSV keep their order.
- Dark colours in `ui/brand.css` are written twice (the `[data-theme="dark"]` block and the `prefers-color-scheme` block): keep both copies equal, the class colours included (`ui/brand.test.ts` checks it). The styles are flat: no gradients, and a shadow (`--float`) only on what floats (panels, menus).
```

- [ ] **Step 4: Edit `server/AGENTS.md`**

Find this block:

```markdown
- The class analysis follows the same rules (`db/runner.ts`: `saveAnalysis`, `failAnalysis`). The robot reads the grades with a `version` (`gradesVersionSql`: the number of graded results and the time of the last change) and sends it back; the save computes the version again in its SQL, so an analysis made from grades that a correction changed meanwhile is saved with `analysis_stale = 1`. It is saved only while no upload waits for grading. Every path that makes work for the robot must start it (the schedule does not fire): "Regenerează" does, and `finishTests` waits for a requested analysis only when a graded upload exists.
- Student names are unique in a class by one key: the cleaned name (`cleanStudentName`) with letters folded to one case, the Romanian letters Ă Â Î Ș Ț included (SQLite `lower()` folds ASCII only) and the cedilla forms Ş Ţ read as Ș Ț. The JS and SQL keys must agree on every letter. Adding and renaming check the key inside their SQL statement (409 `student_exists`); students who left count; diacritics count. A list with one duplicate adds nothing. There is no UNIQUE index: the live database already holds duplicates.
- Deleting a student from a class (`DELETE /classes/:id/students/:studentId`) checks in its SQL that no upload of the student in this class's tests is `submitted`, `grading` or `graded`. It deletes this class's enrollment and the student's `uploading` and `failed` uploads there (and their R2 files), never the `students` row: `addStudentsToClass` takes `MAX(id) + 1`, so a deleted row would hand its id to the next student, and a stale page names a student by id. When a guard `EXISTS` reads a row that the same batch deletes, the guarded statement runs first.
```

Replace it with:

```markdown
- The class analysis follows the same rules (`db/runner.ts`: `saveAnalysis`, `failAnalysis`). The robot reads the grades with a `version` (`gradesVersionSql`: the number of graded results and the time of the last change) and sends it back; the save computes the version again in its SQL, so an analysis made from grades that a correction changed meanwhile is saved with `analysis_stale = 1`. It is saved only while no upload waits for grading. Every path that makes work for the robot must start it (the schedule does not fire): "Regenerează" does, and `finishTests` waits for a requested analysis only when a graded upload exists.
- Student names are unique in a class by one key: the cleaned name (`cleanStudentName`) with letters folded to one case, the Romanian letters Ă Â Î Ș Ț included (SQLite `lower()` folds ASCII only) and the cedilla forms Ş Ţ read as Ș Ț. The JS and SQL keys must agree on every letter. Adding and renaming check the key inside their SQL statement (409 `student_exists`); students who left count; diacritics count. A list with one duplicate adds nothing. There is no UNIQUE index: the live database already holds duplicates. An archived class takes no new students (409 `class_archived`, `archived = 0` in the INSERT's `EXISTS`) and no new test (`createTest`).
- The student's history (`getStudentHistory`, one batch of four statements) lists the started tests of the student's classes; an archived test, or a test of a class the student left, only when the student sent a paper to it. Its papers use the grades table's columns (`GRADE_COLUMNS` and `gradeOf` in `db/students.ts`, shared with `listClassGrades`).
- Deleting a student from a class (`DELETE /classes/:id/students/:studentId`) checks in its SQL that no upload of the student in this class's tests is `submitted`, `grading` or `graded`. It deletes this class's enrollment and the student's `uploading` and `failed` uploads there (and their R2 files), never the `students` row: `addStudentsToClass` takes `MAX(id) + 1`, so a deleted row would hand its id to the next student, and a stale page names a student by id. When a guard `EXISTS` reads a row that the same batch deletes, the guarded statement runs first.
```

- [ ] **Step 5: Commit**

```bash
git add src/AGENTS.md server/AGENTS.md
git commit -m "Describe the archived class, the student's history and the report in the notes"
```

### Task 6: Look at it, then the pull request (main session)

Not a subagent task. Nothing here changes code unless a check fails; a fix found here is prototyped, tested and committed like the tasks above, and named to the user.

- [ ] **Step 1: Check the exactness of the branch**

Run: `git diff --stat refs/proto11/a5 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

- [ ] **Step 2: Run the whole suite three times, and once in UTC**

Run `npm test` three times, then once with `TZ=UTC` (Git Bash: `TZ=UTC npm test`).
Expected: PASS every time. `Test Files  121 passed | 1 skipped (122)`, `Tests  1962 passed | 3 skipped (1965)` (also in UTC).

- [ ] **Step 3: Build and start the production build with the sample**

Check port 8788 first (`netstat -ano | findstr :8788`; end a leftover `workerd.exe` as `AGENTS.md` says). The sample (git-ignored, on this PC) fixes its ids (901, 902, 9001–9006, 9101–9104, 9201–9209, 9301–9309): on a local database that already holds rows with those ids, run it on a fresh one (`.wrangler/state` moved aside) or skip the rows that clash. Run `npm run db:local`, then `npx wrangler d1 execute quickeval --local --file .superpowers/tools/phase8a/sample11.sql` (class `9B` of 2025-2026, archived, with tests `9B-25T1` (published) and `9B-25T2` (Daria Matei sent nothing); class `10B` of 2026-2027 with `10B-26T1` (Ana Pop with a point to check, Ștefan Radu published, Mihai Ionescu sent nothing, an analysis) and `10B-26T2` (open, nothing sent); Ana Pop is in both classes). Then the Claude Code preview server `preview` (`npm run preview`, http://127.0.0.1:8788).
Expected: `Ready on http://127.0.0.1:8788`.

- [ ] **Step 4: Look at the three pages at 1440px, 1024px and 390px, light and dark**

Open `/admin/clase/901`: the strip, "Arhivată" first in the facts, no "Test nou pentru această clasă", ⋯ with "Scoate din arhivă" first, nothing orange, "Raportul clasei" on both tests, the "Elevi" tab with no buttons for the student. Open `/admin/elevi/9001` from a name: "← Clasa 9B", the line "Clasa 10B în 2026-2027 · înainte în Clasa 9B (2025-2026)", two cards, the orange 7,64 with its dot, "Nu a trimis lucrarea." on `Logaritmi`, "Copiază linkul". Open `/admin/teste/10B-26T1/raport`: the list of parts follows the scroll and stays in view; Mihai Ionescu's row says "Nu a trimis lucrarea."; "Regenerează" is in the head of "Analiza clasei". Measure in the browser `document.documentElement.scrollWidth <= innerWidth` on each width. Take the class back out of the archive and in again: the strip comes and goes.
Expected: the look of round 7, pages "Clasă arhivată" A, "Notele elevului" A, "Raportul clasei" B; no sideways scroll; on a phone the history's tables scroll inside their cards, and the report's list of parts is gone.

- [ ] **Step 5: Run the smoke test**

Run: `npm run smoke` (second terminal, while the preview runs).
Expected: every check passes.

- [ ] **Step 6: Commit the plan**

```bash
git add docs/superpowers/plans/2026-11-08-mqgrader-phase-8a-class-pages.md
git commit -m "Add the Phase 8a plan"
```

- [ ] **Step 7: Ask the user, then push and open the pull request**

Ask the user before pushing. On a yes: `git push -u origin feature/mqgrader-class-pages`, then a ready pull request into `main` that lists what changed, the rulings above, and what was checked.

## After the build (2026-11-08)

Built Native: tasks 1–5 exact against `refs/proto11/a1` … `a5`. The Opus whole-branch review found 1 Important and 8 Minor; three commits after Task 5 fix them, so the branch no longer matches `refs/proto11/a5`:

- `Fix the review findings of the class pages`: the report marks the part being read by measuring the parts (and "Analiza clasei" at the end of the page; `currentPart`, tested), the parts list counts the table's rows, "Corectate" keeps a space before "de verificat", the results table pads Total and Nota (not the first exercises), "Lucrarea" keeps its link colour on the student page, taking a class out of the archive keeps the focus (the class name from the strip, ⋯ from its menu), and the history does not count an upload still under way (`uploading`) as a sent paper.
- `Mark the report's part on every scroll, without an animation frame`: found in the browser pane, which runs no animation frames.
- `Check the new shape of the student's history in the smoke test`: `scripts/smoke.mjs` read the old `results`.

Left for the user: in an archived class the grade cells, the "Elevi" dots and `todoOf` (the shell's "De făcut") can still show orange for its tests (review M8).

Checks: `npm test` 1963 passed, 3 skipped (also in UTC); typecheck clean; browser at 1024px and 375px (no sideways scroll; strip in and out; "← Clasa 9Z"; the parts list follows a real scroll); smoke passed.

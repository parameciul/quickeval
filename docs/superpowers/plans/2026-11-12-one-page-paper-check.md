# MQGrader: one page to check a paper, and a clearer test page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The teacher checks a paper on one page: the students, all the exercises of one student (or only the points to check) and the paper side by side, any exercise opening its answer on the paper; and the test page says plainly who took part, what is graded and what waits.

**Architecture:** Front end only: no API, database or robot change, no migration. Task 1 puts a path ("Teste › Clasa 7E2 › <test>", `Crumbs.tsx`) above the test page's title and stretches the papers table, whose model goes into the row's ⋯ menu and whose states after the uploads close say "Nu a participat" and "Așteaptă corectarea". Task 2 replaces the grading bar with `PapersProgress.tsx`, one bar of the students in parts counted by `paperCounts.ts` from the uploads list, and the points to check on a line of their own. Task 3 replaces the paper's page (`SubmissionPage.tsx`) and the review (`ReviewPage.tsx`) with one page, `PaperPage.tsx`, at the paper's old address: `GradedResult` gets an optional hold on its rows (`check`) so a row opens, shows its answer on the paper (`ReviewPhoto`, unchanged) and, when it waits for a check, the decision (`PointDecision.tsx`) under it; the old review address redirects to the page with only the points to check; a Quick Try's review shows the same page without the parts its allow-list does not have.

**Tech Stack:** Node 24, TypeScript, React 19, React Router, TanStack Query, Vitest, Testing Library. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md` (approved by the user on 2026-11-12). The tasks change it where building it settled a builder's call (listed under "Rulings made while planning"). Root `AGENTS.md` and `src/AGENTS.md` hold the project rules.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- The brand is flat: `src/ui/brand.css` has no `gradient(` (`src/ui/brand.test.ts` checks it). A label is a flat tinted block; a button that acts is an 8 px rounded outline, filled blue for the one main action.
- These pages are the teacher's only. No student page, student PDF or CSV changes. A Quick Try's page calls only the routes of its allow-list (`ALLOWED` in `server/routes/quickTry.ts`, unchanged; `tryAdminApi()` fails a test on any other call).
- Do not run Prettier or any formatter.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A`.
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root, on the branch that holds this plan. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy. If only tests of those three files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts runner/api.test.ts` alone; the full run then counts as passed when its failed and passed tests add up to the expected passed number.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- **Delete** `path`: run `git rm <path>`.
- **Move** `a` **to** `b`: run `git mv <a> <b>`; the Edit steps after it change the moved file.
- The expected test totals are exact for the branch alone. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/protopc/p1` to `refs/protopc/p3`, one per task, on `refs/protopc/pcbase` (the same files as the commit that adds the spec, `13552a6`). After Task N, `git diff --stat refs/protopc/pN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`).

## Rulings made while planning

Settled while building and looking at the prototype on 2026-11-12. The tasks write them into the spec; the user checks them when reading.

1. **The view is in the address, not kept in the browser.** `vedere=verificare` on the paper page (`vedere=toate` in a Quick Try, whose own view is the points to check). It stays when she moves to another student and after a reload; each link decides how the page opens: "Vezi lucrarea" with all the exercises, "Verifică", the points' "Decide" and De făcut with only the points to check. A choice kept in the browser would have made "Vezi lucrarea" open with only the points to check, against spec §5.3.
2. **"Nu au participat" is a hollow segment with a grey outline**, not striped: the brand has no gradient.
3. **The papers table says what the bar counts.** Once the uploads are closed, a paper held back from grading (`uploading` with files: not chosen, or past the demo limit) is "Așteaptă corectarea" with "Lucrarea nu a fost trimisă la corectare. Redeschide încărcarea și pornește evaluarea pentru ea.", and an upload with no file is "Nu a participat".
4. **The model** (only with the Setări setting) is the first line of the row's ⋯ menu, "Model: claude-opus-5-5 · medium"; the table has no Model column.
5. **The widths.** The exercises get three fifths of the room the students leave, the paper two fifths (it zooms): on a 1366 px laptop the comments read without breaking words. Below 1200 px the students go under the exercises; below 900 px one column: the exercises, the paper, the students.
6. **The file of each page.** The paper's page listed each page as "Pagina 1: IMG_0001.jpg · 820 KB"; the paper pane now shows the file's name and size under its caption, one page at a time.
7. **The decision's heading is "Decide: <exercise>"** ("Decide: Paginile necitite"), in the region "Decizia" under the open row; its answer and comment are the row's own, above it. The open pages' decision says what the robot could not read; the note above the exercises then does not repeat it.
8. **The head keeps the paper's page's line** "<code> · <test> · <state>": the grade and the total are in the grade strip right under it.
9. **The page is drawn anew for another student.** The shell keys its error boundary by the path (`ErrorBoundary key={location.pathname}`), so a move to another student mounts the page again and reads the test again. Where the focus goes after a decision rides in the navigation state (`paperFocus`: `point` or `student`), given once per address. Leave the shell's key as it is.
10. **"Elevul anterior" and "Elevul următor"** follow the list as it shows: all the students by name, or, with only the points to check, the students with points first. With only the points to check a student opens on its first point.

## Review Focus

1. A paper held back from grading after the uploads close counts as one that took part and waits for the teacher, in the bar and in the table, never as a student who did not take part (Task 1, "names a held-back paper and an upload with no file as the papers bar does…"; Task 2, `paperCounts` "says who did not take part once the uploads are closed, and counts a held-back paper as waiting").
2. A reopened test with failed papers and papers the students can change again shows them as such (Task 2, `paperCounts` "shows a reopened test with failed papers…").
3. A decision that comes back after the teacher moved on never moves her: not after she opened another student, not after she left the page (Task 3, "stays on the paper the teacher opened while a decision saved", "stays on the test page when the teacher went back while a decision saved").
4. After a decision the focus lands on the point that opens, also on another student's paper, whose page is drawn anew (Task 3, "puts the focus on the point that opens after a decision"; "opens the next point of the same student after a decision in all the exercises, and never another student").
5. A Quick Try's review calls no route outside its allow-list and shows none of the class paper's actions (Task 3, `src/try/Graded.test.tsx` "shows the paper page in the review, without the students, the path or the actions of a class paper"; `tryAdminApi()` fails on any other call).

---

### Before Task 1: The branch

- [ ] **Step 1: Check the branch and the prototype**

Run: `git status --short` and `git log --oneline -3`
Expected: nothing changed; HEAD is the commit that adds this plan, on top of the spec's commits (`13552a6 Count held-back papers and settle the Quick Try route in the paper check design`).

Run: `git rev-parse --verify refs/protopc/p3`
Expected: a commit id. If the ref does not exist, stop and ask: the prototype's refs come with this plan.

### Task 1: The path above the title, and the papers table across its card

The test page's "← Toate testele" and coloured class tag become the path "Teste › Clasa 6E2 › Fracții"; the papers table takes the full width; the model leaves the table for the row's ⋯ menu; once the uploads are closed the State cell says "Nu a participat" and "Așteaptă corectarea".

**Files:**
- Create: `src/admin/Crumbs.tsx`
- Modify: `src/admin/pages/TestPage.tsx`, `src/admin/testPage/StagePanel.tsx`, `src/admin/testPage/UploadsTable.tsx`, `src/ui/brand.css`, `src/AGENTS.md`, `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`
- Test: `src/admin/pages/TestPage.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `export interface Crumb { label: string; to?: string }` and `export function Crumbs({ items }: { items: Crumb[] })` in `src/admin/Crumbs.tsx` (a `nav` named "Unde ești"; the last step is the page itself, `aria-current="page"`, not a link). `UploadsTable` gets the prop `uploadsClosed: boolean` (the test is in evaluation or done).

- [ ] **Step 1: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
describe('TestPage', () => {
  it('shows the title, its class, its students and its start, and the code and state in Fișa testului', async () => {
    renderAdmin(PAGE, apiWith({ status: 'open', uploadToken: FAKE_TOKEN, startedAt: '2026-10-06T07:15:00.000Z' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Fracții' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
    expect(screen.getByRole('link', { name: 'Clasa 6E2' })).toHaveClass('class-badge', 'class-tone');
    expect(screen.getByText(/3 elevi · început 6 oct\. 2026, 10:15/)).toBeInTheDocument();
    expect(within(sheet()).getByText('6E2-26T1')).toBeInTheDocument();
```

Replace it with:

```tsx
describe('TestPage', () => {
  it('shows the path, the title, its students and its start, and the code and state in Fișa testului', async () => {
    renderAdmin(PAGE, apiWith({ status: 'open', uploadToken: FAKE_TOKEN, startedAt: '2026-10-06T07:15:00.000Z' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Fracții' })).toBeInTheDocument();
    const path = screen.getByRole('navigation', { name: 'Unde ești' });
    expect(within(path).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Teste', 'Clasa 6E2', 'Fracții']);
    expect(within(path).getByRole('link', { name: 'Teste' })).toHaveAttribute('href', '/');
    expect(within(path).getByRole('link', { name: 'Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
    expect(within(path).getByText('Fracții')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: '← Toate testele' })).not.toBeInTheDocument();
    expect(screen.getByText('3 elevi · început 6 oct. 2026, 10:15')).toBeInTheDocument();
    expect(within(sheet()).getByText('6E2-26T1')).toBeInTheDocument();
```

- [ ] **Step 2: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx

  it('puts checkboxes in the table of Corectare only, while the test is open', async () => {
```

Replace it with:

```tsx

  it('names a held-back paper and an upload with no file as the papers bar does, once the uploads are closed', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 2, startedAt: '2026-10-06T07:25:00.000Z' }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan', submissionId: 7, status: 'uploading', fileCount: 0, startedAt: '2026-10-06T07:26:00.000Z' }),
    ];
    renderAdmin(`${PAGE}#corectare`, createFakeApi({ classes: [], students: {}, tests: [fakeTest({ status: 'done' }, rows)] }));
    const stan = (await screen.findByRole('rowheader', { name: 'Stan Eva' })).closest('tr')!;
    expect(within(stan).getByText('Așteaptă corectarea')).toBeInTheDocument();
    expect(within(stan).getByText('Lucrarea nu a fost trimisă la corectare. Redeschide încărcarea și pornește evaluarea pentru ea.')).toBeInTheDocument();
    expect(within(stan).queryByText('Deschis, cu fișiere')).not.toBeInTheDocument();
    const marin = screen.getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
    expect(within(marin).getByText('Nu a participat')).toBeInTheDocument();
    expect(within(marin).queryByText(/Elevul a ales numele/)).not.toBeInTheDocument();
  });

  it('says that a student who sent nothing did not take part once the uploads are closed', async () => {
    renderAdmin(`${PAGE}#corectare`, apiWith({ status: 'evaluating', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }));
    const marin = (await screen.findByRole('rowheader', { name: 'Marin Dan' })).closest('tr')!;
    expect(within(marin).getByText('Nu a participat')).toBeInTheDocument();
    expect(within(marin).queryByText('Nu a trimis')).not.toBeInTheDocument();
  });

  it('puts checkboxes in the table of Corectare only, while the test is open', async () => {
```

- [ ] **Step 3: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx

  it('shows the model and effort of each grading after Nota when the setting is on', async () => {
    const rows = [
```

Replace it with:

```tsx

  it('shows the model and effort of each grading in the row menu when the setting is on', async () => {
    const rows = [
```

- [ ] **Step 4: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
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
```

Replace it with:

```tsx
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    expect(screen.queryByRole('columnheader', { name: 'Model' })).not.toBeInTheDocument();
    expect(within(pop).queryByText('claude-opus-5-5 · medium')).not.toBeInTheDocument();
    await userEvent.click(within(pop).getByRole('button', { name: 'Mai multe pentru Pop Ion' }));
    expect(within(screen.getByRole('menu')).getByText('Model: claude-opus-5-5 · medium')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    const stan = screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    await userEvent.click(within(stan).getByRole('button', { name: 'Mai multe pentru Stan Eva' }));
    expect(within(screen.getByRole('menu')).getByText('Model: sonnet')).toBeInTheDocument();
  });

  it('leaves the model out of the row menu when the setting is off', async () => {
    const rows = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, model: 'claude-opus-5-5', effort: 'medium' })];
    renderAdmin(`${PAGE}#corectare`, createFakeApi({ classes: [], students: {}, tests: [fakeTest({ status: 'done' }, rows)] }));
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    await userEvent.click(within(pop).getByRole('button', { name: 'Mai multe pentru Pop Ion' }));
    expect(within(screen.getByRole('menu')).queryByText(/Model:/)).not.toBeInTheDocument();
  });
```

- [ ] **Step 5: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByRole('heading', { level: 2, name: 'Corectare' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: '← Toate testele' }));
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Etapele testului' })).not.toBeInTheDocument());
```

Replace it with:

```tsx
    expect(await screen.findByRole('heading', { level: 2, name: 'Corectare' })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Unde ești' })).getByRole('link', { name: 'Teste' }));
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Etapele testului' })).not.toBeInTheDocument());
```

- [ ] **Step 6: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/TestPage.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  5 failed | 118 passed (123)`: the page has no path (`Unable to find an accessible element with the role "navigation" and name "Unde ești"`, in the first test and in "opens the stage the test is at now…", which leaves the page by the path's "Teste"), a closed test's rows have no "Așteaptă corectarea" and no "Nu a participat" (`Unable to find an element with the text: Așteaptă corectarea`, `… Nu a participat`), and the model is still a column (`expect(element).not.toBeInTheDocument()`). The other tests of the file pass.

- [ ] **Step 7: Create `src/admin/Crumbs.tsx`**

```tsx
import { Link } from 'react-router';

export interface Crumb {
  label: string;
  // The page of this step; the last step, the page itself, has none.
  to?: string;
}

// The path at the top of a page: "Teste › Clasa 7E2 › <test>", each step but
// the last a link. It replaces the old "← Toate testele" and the class tag.
export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="crumbs" aria-label="Unde ești">
      <ol>
        {items.map((item, index) => (
          <li key={`${index}:${item.label}`}>
            {item.to !== undefined ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 8: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import type { BaremRequest, RobotStart, TestDetail } from '../../../shared/api.ts';
```

Replace it with:

```tsx
import { useState } from 'react';
import { useLocation, useParams } from 'react-router';
import type { BaremRequest, RobotStart, TestDetail } from '../../../shared/api.ts';
```

- [ ] **Step 9: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx
import { normalizeTestCode, type TestStatus } from '../../../shared/tests.ts';
import { classToneClass, classToneStyle } from '../../ui/classTone.ts';
import { formatDateTime, robotStartMessage, studentCountLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
```

Replace it with:

```tsx
import { normalizeTestCode, type TestStatus } from '../../../shared/tests.ts';
import { formatDateTime, robotStartMessage, studentCountLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { Crumbs } from '../Crumbs.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
```

- [ ] **Step 10: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx
    <section className="test-page">
      <p className="back-link">
        <Link to="/">← Toate testele</Link>
      </p>
      <div className="test-head">
```

Replace it with:

```tsx
    <section className="test-page">
      <Crumbs items={[{ label: 'Teste', to: '/' }, { label: displayClassName(test.className), to: `/clase/${test.classId}` }, { label: test.title }]} />
      <div className="test-head">
```

- [ ] **Step 11: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx
        <p className="test-sub">
          <Link className={`class-badge ${classToneClass()}`} style={classToneStyle(test.classId)} to={`/clase/${test.classId}`}>
            {displayClassName(test.className)}
          </Link>{' '}
          · {studentCountLabel(test.studentCount)} · {test.startedAt ? `început ${formatDateTime(test.startedAt)}` : 'ciornă'}
        </p>
```

Replace it with:

```tsx
        <p className="test-sub">
          {studentCountLabel(test.studentCount)} · {test.startedAt ? `început ${formatDateTime(test.startedAt)}` : 'ciornă'}
        </p>
```

- [ ] **Step 12: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
        showModel={showModel}
        selectable={selectable}
```

Replace it with:

```tsx
        showModel={showModel}
        uploadsClosed={test.status === 'evaluating' || test.status === 'done'}
        selectable={selectable}
```

- [ ] **Step 13: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
// Who uploaded what: one row per student of the class, with the grade once
// the robot graded it. While the uploads are open, the teacher selects the
// uploads to grade now: one checkbox per row with files, and one in the header
```

Replace it with:

```tsx
// Who uploaded what: one row per student of the class, with the grade once
// the robot graded it. The table takes the full width of its card; the model
// of a grading, when the setting shows it, is one line of the row's ⋯ menu. While the uploads are open, the teacher selects the
// uploads to grade now: one checkbox per row with files, and one in the header
```

- [ ] **Step 14: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
  uploads,
  showModel,
  selectable,
  selected,
```

Replace it with:

```tsx
  uploads,
  showModel,
  uploadsClosed,
  selectable,
  selected,
```

- [ ] **Step 15: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
  showModel: boolean;
  // True while the test is open: the checkboxes choose the next evaluation.
```

Replace it with:

```tsx
  showModel: boolean;
  // The uploads are closed (the test is in evaluation or done): a student who
  // sent nothing did not take part.
  uploadsClosed: boolean;
  // True while the test is open: the checkboxes choose the next evaluation.
```

- [ ] **Step 16: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
            <th scope="col">Nota</th>
            {showModel && <th scope="col">Model</th>}
            <th scope="col">De verificat</th>
```

Replace it with:

```tsx
            <th scope="col">Nota</th>
            <th scope="col">De verificat</th>
```

- [ ] **Step 17: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
              showModel={showModel}
              selectable={selectable}
```

Replace it with:

```tsx
              showModel={showModel}
              uploadsClosed={uploadsClosed}
              selectable={selectable}
```

- [ ] **Step 18: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx

function UploadTableRow({
```

Replace it with:

```tsx

// The State cell, once the uploads are closed: a paper held back from
// grading (`uploading`, with its files) waits for the teacher, and a
// student with no file did not take part.
function stateOf(row: UploadRow, uploadsClosed: boolean): { label: string; hint: string | null } {
  if (row.status === 'uploading') {
    if (uploadsClosed) {
      return row.fileCount > 0
        ? { label: 'Așteaptă corectarea', hint: 'Lucrarea nu a fost trimisă la corectare. Redeschide încărcarea și pornește evaluarea pentru ea.' }
        : { label: 'Nu a participat', hint: null };
    }
    return row.fileCount > 0
      ? {
          label: 'Deschis, cu fișiere',
          hint: 'Elevul a adăugat poze, dar nu a apăsat „Am trimis tot”. Numele rămâne blocat până termină sau până îl deblochezi.',
        }
      : { label: 'Deschis, fără fișiere', hint: 'Elevul a ales numele, dar nu a adăugat nimic. Dacă a ales numele greșit, deblochează-l.' };
  }
  if (row.status === 'none' && uploadsClosed) return { label: 'Nu a participat', hint: null };
  return { label: uploadStatusLabel(row.status), hint: null };
}

function UploadTableRow({
```

- [ ] **Step 19: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
  showModel,
  selectable,
```

Replace it with:

```tsx
  showModel,
  uploadsClosed,
  selectable,
```

- [ ] **Step 20: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
  showModel: boolean;
  selectable: boolean;
```

Replace it with:

```tsx
  showModel: boolean;
  uploadsClosed: boolean;
  selectable: boolean;
```

- [ ] **Step 21: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
  const time = row.submittedAt ?? row.startedAt;
  const submissionId = row.submissionId;
```

Replace it with:

```tsx
  const time = row.submittedAt ?? row.startedAt;
  const state = stateOf(row, uploadsClosed);
  const submissionId = row.submissionId;
```

- [ ] **Step 22: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
      <td data-label="Stare">
        {row.status === 'uploading' ? (row.fileCount > 0 ? 'Deschis, cu fișiere' : 'Deschis, fără fișiere') : uploadStatusLabel(row.status)}
        {row.status === 'uploading' && (
          <p className="hint">
            {row.fileCount > 0
              ? 'Elevul a adăugat poze, dar nu a apăsat „Am trimis tot”. Numele rămâne blocat până termină sau până îl deblochezi.'
              : 'Elevul a ales numele, dar nu a adăugat nimic. Dacă a ales numele greșit, deblochează-l.'}
          </p>
        )}
        {row.autoSubmitted && row.status !== 'graded' && <span className="tag">Fără confirmare</span>}
```

Replace it with:

```tsx
      <td data-label="Stare">
        {state.label}
        {state.hint !== null && <p className="hint">{state.hint}</p>}
        {row.autoSubmitted && row.status !== 'graded' && <span className="tag">Fără confirmare</span>}
```

- [ ] **Step 23: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
      <td data-label="Nota">{row.grade === null ? '—' : formatPoints(row.grade)}</td>
      {showModel && <td data-label="Model">{modelCell(row.model, row.effort)}</td>}
      <td data-label="De verificat">{row.flagCount > 0 ? row.flagCount : '—'}</td>
```

Replace it with:

```tsx
      <td data-label="Nota">{row.grade === null ? '—' : formatPoints(row.grade)}</td>
      <td data-label="De verificat">{row.flagCount > 0 ? row.flagCount : '—'}</td>
```

- [ ] **Step 24: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
                menuId={`upload-menu-${submissionId}`}
                items={[
```

Replace it with:

```tsx
                menuId={`upload-menu-${submissionId}`}
                note={showModel && row.model ? `Model: ${modelCell(row.model, row.effort)}` : undefined}
                items={[
```

- [ ] **Step 25: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
// A row's rarer actions under ⋯ (the link to the paper and "Reîncearcă" stay
// on the row, so a row fits on one line). The table scrolls sideways in its
// box, which would cut off a menu inside it: the menu is fixed to the screen,
```

Replace it with:

```tsx
// A row's rarer actions under ⋯ (the link to the paper and "Reîncearcă" stay
// on the row, so a row fits on one line), with `note` (the model) above them. The table scrolls sideways in its
// box, which would cut off a menu inside it: the menu is fixed to the screen,
```

- [ ] **Step 26: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
// focus back to ⋯ before it asks or acts.
function RowMenu({ studentName, menuId, items }: { studentName: string; menuId: string; items: RowMenuItem[] }) {
  const { open, toggle, box, button } = useSmallMenu<HTMLSpanElement>();
```

Replace it with:

```tsx
// focus back to ⋯ before it asks or acts.
function RowMenu({ studentName, menuId, note, items }: { studentName: string; menuId: string; note?: string; items: RowMenuItem[] }) {
  const { open, toggle, box, button } = useSmallMenu<HTMLSpanElement>();
```

- [ ] **Step 27: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
        <div ref={menu} className="class-menu row-menu" id={menuId} role="menu" style={place}>
          {items.map((item) => (
```

Replace it with:

```tsx
        <div ref={menu} className="class-menu row-menu" id={menuId} role="menu" style={place}>
          {note !== undefined && (
            <p className="row-menu-note" role="none">
              {note}
            </p>
          )}
          {items.map((item) => (
```

- [ ] **Step 28: Edit `src/ui/brand.css`**

Find this block:

```css

/* The back link at the top of a page: tight, so the page starts higher. */
```

Replace it with:

```css

/* The path at the top of a page ("Teste › Clasa 7E2 › <test>"): small and
   muted, the steps links, the page itself plain. */
.crumbs {
  margin: 0 0 0.5rem;
  font-size: 0.875rem;
}

.crumbs ol {
  display: flex;
  flex-wrap: wrap;
  margin: 0;
  padding: 0;
  list-style: none;
}

.crumbs li {
  min-width: 0;
  color: var(--muted);
}

.crumbs li + li::before {
  content: '›';
  margin: 0 0.45rem;
  color: var(--muted);
}

.crumbs a {
  color: var(--ink);
}

.crumbs [aria-current='page'] {
  overflow-wrap: anywhere;
}

/* The back link at the top of a page: tight, so the page starts higher. */
```

- [ ] **Step 29: Edit `src/ui/brand.css`**

Find this block:

```css
table.uploads {
  min-width: 36rem;
```

Replace it with:

```css
table.uploads {
  width: 100%;
  min-width: 36rem;
```

- [ ] **Step 30: Edit `src/ui/brand.css`**

Find this block:

```css
  min-width: 10rem;
}
```

Replace it with:

```css
  min-width: 10rem;
}

/* The model of the grading, above the row's actions: a quiet line. */
.row-menu-note {
  margin: 0;
  padding: 0.375rem 0.625rem 0.5rem;
  border-bottom: 1px solid var(--rule);
  color: var(--muted);
  font-size: 0.8125rem;
}
```

- [ ] **Step 31: Edit `src/AGENTS.md`**

Find this block:

```markdown

- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; once results are published (for all, or one alone), `StudentAccessCard.tsx`: where students find their results (the students' link with its QR code and "Descarcă codul QR", a PNG; the multi-upload link named "Doar pentru profesor", with no QR code; and the help text); the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the subject (`SubjectForm.tsx`: "Se stabilește la corectare" until the robot finds it, "Alege materia" or "Schimbă materia" opening the seven subjects in place (while the robot reads the test, only a line that says when the subject can change), with a line when the list is made again and the papers graded again), the files, the students' link while the test is a draft or open, rename, archive (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`), delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table (`UploadsTable.tsx`: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off), "Recorectează tot"). `pages/ReviewPage.tsx` and `reviewPage/` are the review of the points to check (redesign spec §7, `/teste/:code/verificare`): the papers and their points (`ReviewQueue.tsx`), one page of the paper at a time (`ReviewPhoto.tsx`: a photo zooms inside the pane (a left click, a right click and the two buttons over the photo take one small step, out and in; two fingers pinch on a touch screen, and the wheel scrolls the page), a line over the page says what a click does until she zooms, in the words of the pointer at hand (a phone has no right button), and the point picked draws an orange border around the robot's area of its answer, on the whole page, because the page never zooms by itself; the border's arrows step through the parts of an answer, each part opening on its page, whole), and the decision (`ReviewDecision.tsx`: "Accept", the stepper and "Salvează", "Am verificat paginile", the paper's exercises). `points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first), steps between them, and writes the address (`?lucrare=&punct=`, replaced, never a new step in the history). The title row's "Punctul anterior" and "Următorul punct" step the queue both ways, each while a point waits in that direction. A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point; a refused one reads the paper and the test again. An address that names no paper of the test is rewritten first (`ReviewLoader` draws `<Navigate replace>` to `firstSpot()`), before any paper is drawn: a refresh never moves the spot, and no decision is made on a spot the address does not hold. The next point opens only if the teacher is still at the decided one (a call-level `onSuccess` of `mutate`, which does not run once the page is gone), and its heading takes the focus (`focus({ preventScroll: true })`). An address of a paper with no result now (graded again) shows that paper with the reason (`submissionPage/waitingText.ts`, shared with the paper page); when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A, J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). The page (`pages/SubmissionPage.tsx`) has a head (`.submission-head`: the name, the test and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right), then the strips of the result link and of the files, and the result. "Alte acțiuni" (`PaperActions`, `useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. An exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds only the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

Replace it with:

```markdown

- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `Crumbs.tsx` is the path at the top of the test page and of the paper page ("Teste › Clasa 7E2 › <test>", a `nav` "Unde ești"; the last step is the page itself, not a link). `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; once results are published (for all, or one alone), `StudentAccessCard.tsx`: where students find their results (the students' link with its QR code and "Descarcă codul QR", a PNG; the multi-upload link named "Doar pentru profesor", with no QR code; and the help text); the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the subject (`SubjectForm.tsx`: "Se stabilește la corectare" until the robot finds it, "Alege materia" or "Schimbă materia" opening the seven subjects in place (while the robot reads the test, only a line that says when the subject can change), with a line when the list is made again and the papers graded again), the files, the students' link while the test is a draft or open, rename, archive (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`), delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table (`UploadsTable.tsx`, the full width of its card: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off; a student who sent nothing is "Nu a trimis" while the uploads are open and "Nu a participat" after; after, an upload left open with files is "Așteaptă corectarea" and one with no file "Nu a participat"), "Recorectează tot"). `pages/ReviewPage.tsx` and `reviewPage/` are the review of the points to check (redesign spec §7, `/teste/:code/verificare`): the papers and their points (`ReviewQueue.tsx`), one page of the paper at a time (`ReviewPhoto.tsx`: a photo zooms inside the pane (a left click, a right click and the two buttons over the photo take one small step, out and in; two fingers pinch on a touch screen, and the wheel scrolls the page), a line over the page says what a click does until she zooms, in the words of the pointer at hand (a phone has no right button), and the point picked draws an orange border around the robot's area of its answer, on the whole page, because the page never zooms by itself; the border's arrows step through the parts of an answer, each part opening on its page, whole), and the decision (`ReviewDecision.tsx`: "Accept", the stepper and "Salvează", "Am verificat paginile", the paper's exercises). `points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first), steps between them, and writes the address (`?lucrare=&punct=`, replaced, never a new step in the history). The title row's "Punctul anterior" and "Următorul punct" step the queue both ways, each while a point waits in that direction. A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point; a refused one reads the paper and the test again. An address that names no paper of the test is rewritten first (`ReviewLoader` draws `<Navigate replace>` to `firstSpot()`), before any paper is drawn: a refresh never moves the spot, and no decision is made on a spot the address does not hold. The next point opens only if the teacher is still at the decided one (a call-level `onSuccess` of `mutate`, which does not run once the page is gone), and its heading takes the focus (`focus({ preventScroll: true })`). An address of a paper with no result now (graded again) shows that paper with the reason (`submissionPage/waitingText.ts`, shared with the paper page); when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A, J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). The page (`pages/SubmissionPage.tsx`) has a head (`.submission-head`: the name, the test and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right), then the strips of the result link and of the files, and the result. "Alte acțiuni" (`PaperActions`, `useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. An exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds only the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

- [ ] **Step 32: Edit `src/AGENTS.md`**

Find this block:

```markdown

- The Model column of the uploads table on the test page (`TestDetail.showModel`; the class report has none), and the model lines on Setări, are for the teacher only: the global setting `show_model_column` (the `settings` table, off by default) turns the column on. Student PDFs, the CSV, the class PDF and student pages never carry the model or effort.
- The schedule input takes Romania's time (`ui/bucharestTime.ts`).
```

Replace it with:

```markdown

- The model line of the uploads table on the test page ("Model: …" at the top of the row's ⋯ menu, `TestDetail.showModel`; the class report has none), and the model lines on Setări, are for the teacher only: the global setting `show_model_column` (the `settings` table, off by default) turns the line on. Student PDFs, the CSV, the class PDF and student pages never carry the model or effort.
- The schedule input takes Romania's time (`ui/bucharestTime.ts`).
```

- [ ] **Step 33: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown

- Above the title, the link "← Toate testele". Title: the test's name. Under it: the class (a link to its page), its students ("3 elevi") and the start ("început 6 oct. 2026, 10:15"), or "ciornă" for a draft. Under that, for every stage: the notice of the page before (a new test whose file did not upload), a failed refresh, and what the robot answered to the last button.
```

Replace it with:

```markdown

The path above the title, the progress of the papers and the papers table are replaced by `2026-11-12-one-page-paper-check-design.md` §5.

- Above the title, the link "← Toate testele". Title: the test's name. Under it: the class (a link to its page), its students ("3 elevi") and the start ("început 6 oct. 2026, 10:15"), or "ciornă" for a draft. Under that, for every stage: the notice of the page before (a new test whose file did not upload), a failed refresh, and what the robot answered to the last button.
```

- [ ] **Step 34: Run the typecheck and the whole suite**

Run: `npm run typecheck`
Expected: no output after the command line (exit code 0).

Run: `npm test`
Expected: `Test Files  178 passed | 1 skipped (179)`, `Tests  2674 passed | 3 skipped (2677)`.

- [ ] **Step 35: Commit**

```bash
git add src/admin/Crumbs.tsx src/admin/pages/TestPage.tsx src/admin/pages/TestPage.test.tsx src/admin/testPage/StagePanel.tsx src/admin/testPage/UploadsTable.tsx src/ui/brand.css src/AGENTS.md docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md
git commit -m "Put the path above the test page title and stretch the papers table"
```

Run: `git diff --stat refs/protopc/p1 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

### Task 2: The papers bar of the students, and the points to check apart

`GradingProgress` (graded and waiting out of the class) becomes `PapersProgress`: "Lucrări: 18 din 23 de elevi au trimis" while the uploads are open, "… au participat" after, one bar in parts with a legend that names each part, "✓ Corectat complet", and apart "47 de puncte de verificat în 12 lucrări" with "Verifică".

**Files:**
- Create: `src/admin/testPage/paperCounts.ts`, `src/admin/testPage/paperCounts.test.ts`, `src/admin/testPage/PapersProgress.tsx`
- Delete: `src/ui/GradingProgress.tsx`, `src/ui/GradingProgress.test.tsx`
- Modify: `src/admin/testPage/StagePanel.tsx`, `src/ui/brand.css`, `src/AGENTS.md`, `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md`
- Test: `src/admin/testPage/paperCounts.test.ts`, `src/admin/pages/TestPage.test.tsx`, `src/admin/pages/TestsPage.test.tsx`

**Interfaces:**
- Consumes: `UploadRow` (`shared/api.ts`), `TestStatus` (`shared/tests.ts`), `reviewPath(code)` (`src/admin/reviewPage/points.ts`), `countLabel` (`src/ui/format.ts`).
- Produces: in `src/admin/testPage/paperCounts.ts`: `export type PaperPart = 'graded' | 'grading' | 'waiting' | 'failed' | 'uploading' | 'notYet' | 'absent'`, `PAPER_PARTS` (that order), `PAPER_PART_LABEL: Record<PaperPart, string>`, `export interface PaperCounts { open: boolean; parts: { part: PaperPart; count: number }[]; took: number; total: number; complete: boolean }` and `export function paperCounts(status: TestStatus, studentCount: number, uploads: UploadRow[]): PaperCounts`. `export function PapersProgress({ test, uploads }: { test: TestInfo; uploads: UploadRow[] })` in `src/admin/testPage/PapersProgress.tsx`.

- [ ] **Step 1: Create `src/admin/testPage/paperCounts.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { UploadRow } from '../../../shared/api.ts';
import { fakeUpload } from '../../test/fakeApi.ts';
import { paperCounts } from './paperCounts.ts';

let next = 1;
const row = (overrides: Partial<UploadRow>): UploadRow => {
  const id = next++;
  return fakeUpload({ studentId: id, studentName: `Elev ${id}`, submissionId: overrides.status && overrides.status !== 'none' ? id : null, ...overrides });
};

describe('paperCounts', () => {
  it('counts the sent papers and those still to come while the uploads are open', () => {
    const counts = paperCounts('open', 6, [
      row({ status: 'submitted', fileCount: 2 }),
      row({ status: 'submitted', fileCount: 1 }),
      row({ status: 'uploading', fileCount: 1 }),
      row({ status: 'none' }),
    ]);
    expect(counts.open).toBe(true);
    expect(counts.parts).toEqual([
      { part: 'waiting', count: 2 },
      { part: 'uploading', count: 1 },
      { part: 'notYet', count: 3 },
    ]);
    expect(counts.took).toBe(2);
    expect(counts.total).toBe(6);
    expect(counts.complete).toBe(false);
  });

  it('says who did not take part once the uploads are closed, and counts a held-back paper as waiting', () => {
    const counts = paperCounts('evaluating', 8, [
      row({ status: 'graded', fileCount: 3 }),
      row({ status: 'grading', fileCount: 2 }),
      row({ status: 'submitted', fileCount: 2 }),
      row({ status: 'uploading', fileCount: 4 }),
      row({ status: 'uploading', fileCount: 0 }),
      row({ status: 'failed', fileCount: 1 }),
      row({ status: 'none' }),
    ]);
    expect(counts.open).toBe(false);
    expect(counts.parts).toEqual([
      { part: 'graded', count: 1 },
      { part: 'grading', count: 2 },
      { part: 'waiting', count: 1 },
      { part: 'failed', count: 1 },
      { part: 'absent', count: 3 },
    ]);
    expect(counts.took).toBe(5);
  });

  it('keeps a sent paper of a done test (a CES paper waiting for its barem) as waiting', () => {
    const counts = paperCounts('done', 2, [row({ status: 'graded', fileCount: 1 }), row({ status: 'submitted', fileCount: 1 })]);
    expect(counts.parts).toEqual([
      { part: 'graded', count: 1 },
      { part: 'waiting', count: 1 },
    ]);
    expect(counts.complete).toBe(false);
  });

  it('shows a reopened test with failed papers and papers the students can change again', () => {
    const counts = paperCounts('open', 3, [row({ status: 'failed', fileCount: 1 }), row({ status: 'uploading', fileCount: 2 }), row({ status: 'graded', fileCount: 1 })]);
    expect(counts.parts).toEqual([
      { part: 'graded', count: 1 },
      { part: 'failed', count: 1 },
      { part: 'uploading', count: 1 },
    ]);
    expect(counts.took).toBe(2);
  });

  it('is complete when every paper that took part is graded, whoever did not take part', () => {
    const counts = paperCounts('done', 23, [row({ status: 'graded', fileCount: 2 }), row({ status: 'graded', fileCount: 1 }), row({ status: 'none' })]);
    expect(counts.complete).toBe(true);
    expect(counts.took).toBe(2);
    expect(counts.parts.at(-1)).toEqual({ part: 'absent', count: 21 });
  });

  it('is not complete when nothing took part', () => {
    expect(paperCounts('done', 2, [row({ status: 'none' }), row({ status: 'none' })]).complete).toBe(false);
  });

  it('counts every upload when there are more uploads than students (a student who left)', () => {
    const counts = paperCounts('done', 1, [row({ status: 'graded', fileCount: 1 }), row({ status: 'graded', fileCount: 1, active: false })]);
    expect(counts.total).toBe(2);
    expect(counts.parts).toEqual([{ part: 'graded', count: 2 }]);
  });
});
```

- [ ] **Step 2: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    renderAdmin(`${PAGE}#in-clasa`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN, submittedCount: 1, studentCount: 3 }));
    expect(await screen.findByRole('heading', { name: 'Încărcări · trimise 1 din 3' })).toBeInTheDocument();
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
```

Replace it with:

```tsx
    renderAdmin(`${PAGE}#in-clasa`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN, submittedCount: 1, studentCount: 3 }));
    expect(await screen.findByRole('heading', { name: 'Lucrări: 1 din 3 elevi au trimis' })).toBeInTheDocument();
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
```

- [ ] **Step 3: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(within(marin).queryByText(/Elevul a ales numele/)).not.toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(within(marin).queryByText(/Elevul a ales numele/)).not.toBeInTheDocument();
  });

  it('shows the papers bar with each part named, and no points line when none waits', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 2 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
    ];
    renderAdmin(`${PAGE}#corectare`, createFakeApi({ classes: [], students: {}, tests: [fakeTest({ status: 'done', studentCount: 3 }, rows)] }));
    expect(await screen.findByRole('heading', { name: 'Lucrări: 2 din 3 elevi au participat' })).toBeInTheDocument();
    const box = document.querySelector<HTMLElement>('.papers-progress')!;
    expect(within(box).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Corectate 1', 'Așteaptă corectarea 1', 'Nu au participat 1']);
    expect(box.querySelector('.papers-bar')).toHaveAttribute('aria-hidden', 'true');
    expect(within(box).queryByText('✓ Corectat complet')).not.toBeInTheDocument();
    expect(within(box).queryByRole('link', { name: 'Verifică' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 4: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    renderAdmin(`${PAGE}#corectare`, api);
    expect(await screen.findByRole('heading', { name: 'Încărcări · trimise 2 din 2 · corectate 1 · de verificat 2' })).toBeInTheDocument();
    expect(screen.getByText('Corectarea s-a terminat. Evaluarea a pornit la 7 oct. 2026, 11:00.')).toBeInTheDocument();
```

Replace it with:

```tsx
    renderAdmin(`${PAGE}#corectare`, api);
    expect(await screen.findByRole('heading', { name: 'Lucrări: 2 din 2 elevi au participat' })).toBeInTheDocument();
    const legend = document.querySelector<HTMLElement>('.papers-progress')!;
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Corectate 1', 'Eșuate 1']);
    expect(within(legend).getByText('2 puncte de verificat')).toBeInTheDocument();
    expect(within(legend).getByRole('link', { name: 'Verifică' })).toHaveAttribute('href', '/teste/6E2-26T1/verificare');
    expect(screen.getByText('Corectarea s-a terminat. Evaluarea a pornit la 7 oct. 2026, 11:00.')).toBeInTheDocument();
```

- [ ] **Step 5: Edit `src/admin/pages/TestsPage.test.tsx`**

Find this block:

```tsx
    expect([...bars.children].map((bar) => bar.className)).toEqual(['is-done', 'is-done', 'is-now', 'is-later', 'is-wait', 'is-later']);
    expect(row.querySelector('.grading-progress')).toBeNull();
  });
```

Replace it with:

```tsx
    expect([...bars.children].map((bar) => bar.className)).toEqual(['is-done', 'is-done', 'is-now', 'is-later', 'is-wait', 'is-later']);
    expect(row.querySelector('.papers-progress')).toBeNull();
  });
```

- [ ] **Step 6: Run the tests to see them fail**

Run: `npx vitest run src/admin/testPage/paperCounts.test.ts src/admin/pages/TestPage.test.tsx src/admin/pages/TestsPage.test.tsx`
Expected: FAIL. `Test Files  2 failed | 1 passed (3)`, `Tests  3 failed | 164 passed (167)`: `paperCounts.test.ts` does not load (`Failed to resolve import "./paperCounts.ts"`), and the papers heading is still the old one (`Unable to find role="heading" and name "Lucrări: 1 din 3 elevi au trimis"`, `… "Lucrări: 2 din 3 elevi au participat"`, `… "Lucrări: 2 din 2 elevi au participat"`). `TestsPage.test.tsx` passes: its change only renames the class it looks for, which the Teste page never has.

- [ ] **Step 7: Create `src/admin/testPage/paperCounts.ts`**

```ts
import type { UploadRow } from '../../../shared/api.ts';
import type { TestStatus } from '../../../shared/tests.ts';

// The parts of the papers bar, in the order they are drawn.
export type PaperPart = 'graded' | 'grading' | 'waiting' | 'failed' | 'uploading' | 'notYet' | 'absent';

export const PAPER_PARTS: readonly PaperPart[] = ['graded', 'grading', 'waiting', 'failed', 'uploading', 'notYet', 'absent'];

export const PAPER_PART_LABEL: Record<PaperPart, string> = {
  graded: 'Corectate',
  grading: 'Se corectează',
  waiting: 'Așteaptă corectarea',
  failed: 'Eșuate',
  uploading: 'Încarcă acum',
  notYet: 'Încă nu au trimis',
  absent: 'Nu au participat',
};

export interface PaperCounts {
  // The uploads are open: a student who sent nothing can still send.
  open: boolean;
  // Every part with at least one student, in drawing order.
  parts: { part: PaperPart; count: number }[];
  // The students who sent (open) or took part (closed): every part but the
  // grey ones and, while open, "Încarcă acum".
  took: number;
  // The students of the bar: the class, or the uploads when more.
  total: number;
  // Every paper that took part is graded.
  complete: boolean;
}

// One student's part. A paper held back from grading (not chosen, or past the
// demo limit) goes back to `uploading` with its files; when the uploads close,
// every other `uploading` row with files is sent. So, once closed, an
// `uploading` row with files waits for the teacher and one without files is a
// student who sent nothing. A CES paper waiting for its barem stays `submitted`.
function partOf(row: UploadRow, status: TestStatus, open: boolean): PaperPart {
  switch (row.status) {
    case 'graded':
      return 'graded';
    case 'grading':
      return 'grading';
    case 'submitted':
      return status === 'evaluating' ? 'grading' : 'waiting';
    case 'failed':
      return 'failed';
    case 'uploading':
      return open ? 'uploading' : row.fileCount > 0 ? 'waiting' : 'absent';
    case 'none':
      return open ? 'notYet' : 'absent';
  }
}

// The papers bar of the test page (spec 2026-11-12 §5.2), from the uploads
// list alone. A student of the class with no row counts as one who sent nothing.
export function paperCounts(status: TestStatus, studentCount: number, uploads: UploadRow[]): PaperCounts {
  const open = status !== 'evaluating' && status !== 'done';
  const counts = new Map<PaperPart, number>();
  const add = (part: PaperPart, count: number) => counts.set(part, (counts.get(part) ?? 0) + count);
  for (const row of uploads) add(partOf(row, status, open), 1);
  const total = Math.max(studentCount, uploads.length);
  add(open ? 'notYet' : 'absent', total - uploads.length);
  const parts = PAPER_PARTS.filter((part) => (counts.get(part) ?? 0) > 0).map((part) => ({ part, count: counts.get(part)! }));
  const count = (part: PaperPart) => counts.get(part) ?? 0;
  const took = count('graded') + count('grading') + count('waiting') + count('failed');
  return { open, parts, took, total, complete: took > 0 && count('graded') === took };
}
```

- [ ] **Step 8: Create `src/admin/testPage/PapersProgress.tsx`**

```tsx
import { Link } from 'react-router';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import { reviewPath } from '../reviewPage/points.ts';
import { PAPER_PART_LABEL, paperCounts } from './paperCounts.ts';

// The progress of the papers above the papers table (spec 2026-11-12 §5.2):
// one bar of the students, each part named in the legend under it, and apart
// the points that wait to be checked. The bar is hidden from screen readers:
// the legend says the same in words.
export function PapersProgress({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }) {
  const counts = paperCounts(test.status, test.studentCount, uploads);
  const papers = uploads.filter((row) => row.flagCount > 0).length;
  const points = uploads.reduce((sum, row) => sum + row.flagCount, 0);
  return (
    <div className="papers-progress">
      <h3>
        Lucrări: {counts.took} din {countLabel(counts.total, 'elev', 'elevi')} {counts.open ? 'au trimis' : 'au participat'}
      </h3>
      {counts.total > 0 && (
        <>
          <span className="papers-bar" aria-hidden="true">
            {counts.parts.map(({ part, count }) => (
              <span key={part} className={`papers-bar-part is-${part}`} style={{ width: `${(count / counts.total) * 100}%` }} />
            ))}
          </span>
          <ul className="papers-legend">
            {counts.parts.map(({ part, count }) => (
              <li key={part}>
                <span className={`papers-key is-${part}`} aria-hidden="true" />
                {PAPER_PART_LABEL[part]} <strong>{count}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
      {counts.complete && <p className="papers-complete">✓ Corectat complet</p>}
      {points > 0 && (
        <p className="papers-points">
          <span className="papers-points-count">{countLabel(points, 'punct de verificat', 'puncte de verificat')}</span>{' '}
          <span className="hint">în {countLabel(papers, 'lucrare', 'lucrări')}</span>{' '}
          <Link className="button button-small" to={reviewPath(test.code)}>
            Verifică
          </Link>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
import { formatDateTime } from '../../ui/format.ts';
import { GradingProgress } from '../../ui/GradingProgress.tsx';
import { useApi } from '../ApiContext.tsx';
```

Replace it with:

```tsx
import { formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
```

- [ ] **Step 10: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
import { TestFiles } from './TestFiles.tsx';
import { MultiUploadLink, QrOverlay, uploadLink } from './UploadLink.tsx';
```

Replace it with:

```tsx
import { TestFiles } from './TestFiles.tsx';
import { PapersProgress } from './PapersProgress.tsx';
import { MultiUploadLink, QrOverlay, uploadLink } from './UploadLink.tsx';
```

- [ ] **Step 11: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx

// The papers of the class: who sent, the grades, and what waits. Only the
// table of Corectare has checkboxes, while the test is open.
function Papers({ test, uploads, showModel, selected, onSelect, onChanged, onRobot, selectable }: PanelProps & { selectable: boolean }) {
```

Replace it with:

```tsx

// The papers of the class: who sent or took part, the grades, and what waits.
// Only the table of Corectare has checkboxes, while the test is open.
function Papers({ test, uploads, showModel, selected, onSelect, onChanged, onRobot, selectable }: PanelProps & { selectable: boolean }) {
```

- [ ] **Step 12: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
    <>
      <h3>
        Încărcări · trimise {test.submittedCount} din {test.studentCount}
        {test.gradedCount > 0 && ` · corectate ${test.gradedCount}`}
        {test.flagCount > 0 && ` · de verificat ${test.flagCount}`}
      </h3>
      <GradingProgress studentCount={test.studentCount} submittedCount={test.submittedCount} gradedCount={test.gradedCount} />
      <UploadsTable
```

Replace it with:

```tsx
    <>
      <PapersProgress test={test} uploads={uploads} />
      <UploadsTable
```

- [ ] **Step 13: Delete `src/ui/GradingProgress.tsx`**

Run: `git rm src/ui/GradingProgress.tsx`

- [ ] **Step 14: Delete `src/ui/GradingProgress.test.tsx`**

Run: `git rm src/ui/GradingProgress.test.tsx`

- [ ] **Step 15: Edit `src/ui/brand.css`**

Find this block:

```css
   values already. */
.grading-progress {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.grading-progress-bar {
  display: flex;
  height: 0.5rem;
  overflow: hidden;
  border-radius: 4px;
  background: var(--active);
```

Replace it with:

```css
   values already. */
/* The papers bar of the test page: one part per kind of paper, out of the
   students of the class; "nu au participat" hollow with a grey outline,
   "încă nu au trimis" plain grey. The legend names each part. */
.papers-progress {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-bottom: 0.75rem;
}

.papers-progress h3 {
  margin: 0;
}

.papers-bar {
  display: flex;
  height: 0.625rem;
  overflow: hidden;
  border-radius: 5px;
  background: var(--active);
```

- [ ] **Step 16: Edit `src/ui/brand.css`**

Find this block:

```css

.grading-progress-graded {
  background: var(--ink);
```

Replace it with:

```css

.papers-bar-part,
.papers-key {
  display: block;
  background: var(--active);
}

.papers-key {
  display: inline-block;
  width: 0.625rem;
  height: 0.625rem;
  margin-right: 0.375rem;
  border-radius: 2px;
  vertical-align: -0.05rem;
}

.papers-bar-part.is-graded,
.papers-key.is-graded {
  background: var(--ok-fg);
}

.papers-bar-part.is-grading,
.papers-key.is-grading {
  background: var(--ink);
```

- [ ] **Step 17: Edit `src/ui/brand.css`**

Find this block:

```css

.grading-progress-waiting {
  background: color-mix(in srgb, var(--ink) 35%, var(--sheet));
}

.grading-progress-label {
  color: var(--ok-fg);
```

Replace it with:

```css

.papers-bar-part.is-waiting,
.papers-key.is-waiting {
  background: color-mix(in srgb, var(--ink) 40%, var(--sheet));
}

.papers-bar-part.is-failed,
.papers-key.is-failed {
  background: var(--red);
}

.papers-bar-part.is-uploading,
.papers-key.is-uploading {
  background: color-mix(in srgb, var(--ink) 18%, var(--sheet));
}

.papers-bar-part.is-notYet,
.papers-key.is-notYet {
  background: var(--active);
}

.papers-bar-part.is-absent,
.papers-key.is-absent {
  background: var(--sheet);
  box-shadow: inset 0 0 0 1px var(--muted);
}

.papers-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.875rem;
}

.papers-complete {
  margin: 0;
  color: var(--ok-fg);
```

- [ ] **Step 18: Edit `src/ui/brand.css`**

Find this block:

```css
  font-weight: 700;
  font-size: 0.9rem;
}

```

Replace it with:

```css
  font-weight: 700;
  font-size: 0.9rem;
}

.papers-points {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0.25rem 0 0;
  padding-top: 0.625rem;
  border-top: 1px solid var(--rule);
}

.papers-points-count {
  color: var(--orange);
  font-weight: 700;
}

```

- [ ] **Step 19: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `EmptyState.tsx` is an empty place of the teacher app (redesign spec §11.9): an icon (`shell/icons.tsx`), a heading at the level of its place (`level`: an h3 under a panel's or a card's title, an h2 in a card with none, an h1 on a page with no other heading), one sentence, and at most one button, its one next step. It is used by "Clasele tale" with no class (its "+ Clasă nouă", and "Nu ai nicio clasă activă" when archived ones exist; the panel's own foot then shows only "Arhivate (n)"), "Ce ai de făcut" with nothing, `/clase` with no active class, a class with no students or no tests (`NoStudents` in `classPage/GradesTable.tsx`, on both tabs; an archived class gets the same headings and no button), În clasă while the test is open and no student has started an upload (`submissionId` null on every row; the QR code on the whole screen, `QrOverlay` of `UploadLink.tsx`, belongs to the panel, so it stays open when the first paper arrives; closing it gives the focus to its button, or to the panel's heading), and Rezultate with nothing to publish (`NoResultsYet` in `ResultsAccess.tsx`, "Mergi la Corectare"; the students' links stay under it). A new teacher (no test in the year, and `testsEvaluated` 0) sees on the Teste page (after "Se încarcă…" while the tests load, not the other greeting) "Bun venit, …" and `testsPage/FirstSteps.tsx` ("Primii pași": a class, a test, the print) in place of the filters and the lists; the card goes once a test exists.
- `ui/GradingProgress.tsx` is the grading bar (blue graded, pale blue waiting, empty track not sent) under the test page's uploads heading only (the Teste page shows the stage bar instead); "✓ Corectat complet" shows when every sent paper is graded. The bar is `aria-hidden`: the counts stay in words. `EvaluationControls` shows "Marchează ca terminat" in place of the start button when a paper is graded and none waits.
- `landing/`: the landing page (`index.html`) in the look of the redesign, with its own tokens (`landing.css`) and one script (`landing.ts`): the theme button, the header's menu and Quick Try. The four pages that answer a search (`ghid/index.html`, `barem/index.html`, `despre/index.html`, `preturi/index.html`) share `landing.css` and `pages.css`, and load `pages.ts` (`themeButton.ts` and `siteMenu.ts`, also used by `landing.ts`), so the Quick Try code stays on the landing page. The five pages' header keeps the same four pages one tap away on a phone: below 900px the links wait in `.nav-links` and the ☰ button (`siteMenu.ts`) opens them under the header, closed by Esc (which gives the focus back), a click elsewhere, a link, or a wider screen; the content pages mark their own link with `aria-current="page"`. `pages.test.ts` checks each one's canonical, its one `h1`, its own share card (`public/og-ghid.png` and the three beside it), the trail (`nav.crumbs`) against its `BreadcrumbList`, the byline and `dateModified` against the sitemap's `lastmod`, its header menu and footer links, its closing `#citeste-si` list, its JSON-LD and the words Laura Miron's own pages repeat. The two long pages (`/ghid/`, `/barem/`) open with a `nav.toc` whose links go to `id`s on their `h2`s, and `/ghid/` shows the review screen (`public/app-verificare.png`, 1600×1000) in a `.prose .shot` figure, the picture its `primaryImageOfPage` names. The landing page links the four pages from its own text: one link in the account section and the `#mai-multe` cards at the end. The five public pages share their footer: each has `<!--#include site-foot -->`, which Vite replaces with the part in `partials.ts` (the `publicPagePartials` plugin in `vite.config.ts`); a test that reads a page's raw HTML runs `expandPartials` on it first. `landing/quickTry/` is the Quick Try button (under "Intră în cont"), its form in a `<dialog>` and the card of the visitor's try, with no React: `ui.ts` works on the page's own elements (the file rows: a hidden real input in each `[data-try-pick]` label, filled by `showPick`), `send.ts` checks and sends the form and names the try (`tryTitle`; with her barem the grading starts at once; with the robot's she starts it on the try's page), `status.ts` says where the try stands (the card's line, tag and tone) and whether the button shows (one try per device per Bucharest day in `localStorage`, `storage.ts`, unless it failed; an administrator always), and `turnstile.ts` loads Cloudflare's check. The page's security policy allows no inline script or style, and only Turnstile's script and frame from elsewhere; `landing.test.ts` checks that, and Laura Miron's texts word for word. "Cere un cont de profesor" opens `/teacher/#cont-nou`, which `LoginPage` shows as "Cont nou de profesor". The login page repeats the heading, the line and the six stages: a change to them in `index.html` goes into `admin/wayIn/WayIn.tsx` too.
```

Replace it with:

```markdown
- `EmptyState.tsx` is an empty place of the teacher app (redesign spec §11.9): an icon (`shell/icons.tsx`), a heading at the level of its place (`level`: an h3 under a panel's or a card's title, an h2 in a card with none, an h1 on a page with no other heading), one sentence, and at most one button, its one next step. It is used by "Clasele tale" with no class (its "+ Clasă nouă", and "Nu ai nicio clasă activă" when archived ones exist; the panel's own foot then shows only "Arhivate (n)"), "Ce ai de făcut" with nothing, `/clase` with no active class, a class with no students or no tests (`NoStudents` in `classPage/GradesTable.tsx`, on both tabs; an archived class gets the same headings and no button), În clasă while the test is open and no student has started an upload (`submissionId` null on every row; the QR code on the whole screen, `QrOverlay` of `UploadLink.tsx`, belongs to the panel, so it stays open when the first paper arrives; closing it gives the focus to its button, or to the panel's heading), and Rezultate with nothing to publish (`NoResultsYet` in `ResultsAccess.tsx`, "Mergi la Corectare"; the students' links stay under it). A new teacher (no test in the year, and `testsEvaluated` 0) sees on the Teste page (after "Se încarcă…" while the tests load, not the other greeting) "Bun venit, …" and `testsPage/FirstSteps.tsx` ("Primii pași": a class, a test, the print) in place of the filters and the lists; the card goes once a test exists.
- `admin/testPage/PapersProgress.tsx` is the papers bar above the test page's papers table only (the Teste page shows the stage bar instead): "Lucrări: 18 din 23 de elevi au trimis" while the uploads are open, "… au participat" after, one bar of the students in parts (`paperCounts.ts`: corectate, se corectează, așteaptă corectarea, eșuate, încarcă acum, încă nu au trimis, nu au participat hollow with a grey outline: the brand has no gradient), a legend naming each part that has a student, "✓ Corectat complet" when every paper that took part is graded, and apart the points to check with "Verifică". A held-back paper (not chosen, past the demo limit) is `uploading` with files: once the uploads close it waits, it did take part. The bar is `aria-hidden`: the legend says it in words. `EvaluationControls` shows "Marchează ca terminat" in place of the start button when a paper is graded and none waits.
- `landing/`: the landing page (`index.html`) in the look of the redesign, with its own tokens (`landing.css`) and one script (`landing.ts`): the theme button, the header's menu and Quick Try. The four pages that answer a search (`ghid/index.html`, `barem/index.html`, `despre/index.html`, `preturi/index.html`) share `landing.css` and `pages.css`, and load `pages.ts` (`themeButton.ts` and `siteMenu.ts`, also used by `landing.ts`), so the Quick Try code stays on the landing page. The five pages' header keeps the same four pages one tap away on a phone: below 900px the links wait in `.nav-links` and the ☰ button (`siteMenu.ts`) opens them under the header, closed by Esc (which gives the focus back), a click elsewhere, a link, or a wider screen; the content pages mark their own link with `aria-current="page"`. `pages.test.ts` checks each one's canonical, its one `h1`, its own share card (`public/og-ghid.png` and the three beside it), the trail (`nav.crumbs`) against its `BreadcrumbList`, the byline and `dateModified` against the sitemap's `lastmod`, its header menu and footer links, its closing `#citeste-si` list, its JSON-LD and the words Laura Miron's own pages repeat. The two long pages (`/ghid/`, `/barem/`) open with a `nav.toc` whose links go to `id`s on their `h2`s, and `/ghid/` shows the review screen (`public/app-verificare.png`, 1600×1000) in a `.prose .shot` figure, the picture its `primaryImageOfPage` names. The landing page links the four pages from its own text: one link in the account section and the `#mai-multe` cards at the end. The five public pages share their footer: each has `<!--#include site-foot -->`, which Vite replaces with the part in `partials.ts` (the `publicPagePartials` plugin in `vite.config.ts`); a test that reads a page's raw HTML runs `expandPartials` on it first. `landing/quickTry/` is the Quick Try button (under "Intră în cont"), its form in a `<dialog>` and the card of the visitor's try, with no React: `ui.ts` works on the page's own elements (the file rows: a hidden real input in each `[data-try-pick]` label, filled by `showPick`), `send.ts` checks and sends the form and names the try (`tryTitle`; with her barem the grading starts at once; with the robot's she starts it on the try's page), `status.ts` says where the try stands (the card's line, tag and tone) and whether the button shows (one try per device per Bucharest day in `localStorage`, `storage.ts`, unless it failed; an administrator always), and `turnstile.ts` loads Cloudflare's check. The page's security policy allows no inline script or style, and only Turnstile's script and frame from elsewhere; `landing.test.ts` checks that, and Laura Miron's texts word for word. "Cere un cont de profesor" opens `/teacher/#cont-nou`, which `LoginPage` shows as "Cont nou de profesor". The login page repeats the heading, the line and the six stages: a change to them in `index.html` goes into `admin/wayIn/WayIn.tsx` too.
```

- [ ] **Step 20: Edit `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md`**

Find this block:

```markdown
- încă nu au trimis (grey, plain): `none` while uploads are open.
- nu au participat (grey, striped): `none`, and `uploading` with no files, after uploads closed.

```

Replace it with:

```markdown
- încă nu au trimis (grey, plain): `none` while uploads are open.
- nu au participat (hollow, a grey outline: the brand has no gradient): `none`, and `uploading` with no files, after uploads closed.

```

- [ ] **Step 21: Run the typecheck and the whole suite**

Run: `npm run typecheck`
Expected: no output after the command line (exit code 0).

Run: `npm test`
Expected: `Test Files  178 passed | 1 skipped (179)`, `Tests  2677 passed | 3 skipped (2680)`.

- [ ] **Step 22: Commit**

```bash
git add src/admin/testPage/paperCounts.ts src/admin/testPage/paperCounts.test.ts src/admin/testPage/PapersProgress.tsx src/admin/testPage/StagePanel.tsx src/admin/pages/TestPage.test.tsx src/admin/pages/TestsPage.test.tsx src/ui/brand.css src/AGENTS.md docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md
git commit -m "Show the papers of a test as one bar of the students, with the points to check apart"
```

(`git rm` already staged the two deleted files.)

Run: `git diff --stat refs/protopc/p2 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

### Task 3: One page to check a paper

The paper's page and the review become one page at `/teste/:code/elevi/:submissionId`: the path and the paper's head, the switch "Toate exercițiile" / "Doar de verificat (N)", the moves to another point or student, and three columns: "Elevii", the exercises (a click opens any row; an open row to check has its decision under it), and the paper (one page at a time, zoom, the answer's border). `/teste/:code/verificare` opens it with only the points to check. A Quick Try's review is the same page without the students, the path and the class paper's actions.

**Files:**
- Move: `src/admin/pages/SubmissionPage.test.tsx` to `src/admin/pages/PaperPage.test.tsx`; `src/admin/pages/ReviewPage.test.tsx` to `src/admin/pages/PaperCheck.test.tsx`
- Create: `src/admin/paperPage/paths.ts`, `src/admin/paperPage/PointDecision.tsx`, `src/admin/paperPage/StudentList.tsx`, `src/admin/paperPage/PaperHead.tsx`, `src/admin/pages/PaperPage.tsx`
- Delete: `src/admin/pages/SubmissionPage.tsx`, `src/admin/pages/ReviewPage.tsx`, `src/admin/reviewPage/ReviewQueue.tsx`, `src/admin/reviewPage/ReviewDecision.tsx`
- Modify: `src/admin/submissionPage/GradedResult.tsx`, `src/admin/reviewPage/ReviewPhoto.tsx`, `src/admin/AppRoutes.tsx`, `src/try/TryApp.tsx`, `src/ui/brand.css`, `src/AGENTS.md`, both specs
- Test: `src/admin/pages/PaperPage.test.tsx`, `src/admin/pages/PaperCheck.test.tsx`, `src/admin/cesMarks.test.tsx`, `src/try/Graded.test.tsx`

**Interfaces:**
- Consumes: `Crumbs` (Task 1); `pointKey`, `pointQueue`, `papersToCheck`, `firstSpot`, `stepPoint`, `withoutPoint`, `pageIndex`, `pointsText`, `reviewPath`, `QueuedPoint` (`src/admin/reviewPage/points.ts`, unchanged); `ReviewPhoto`, `ReviewFocus` (`src/admin/reviewPage/ReviewPhoto.tsx`); `drawnAreas`, `savedFrames`, `saveFrames` (`areas.ts`); `isReviewKey` (`keys.ts`); `refreshInterval` (`pages/TestPage.tsx`); `waitingText`; `ResultLink`; `PdfActions`; `studentPdf*`.
- Produces:
  - `src/admin/paperPage/paths.ts`: `export type PaperMode = 'toate' | 'verificare'`, `export interface PaperSpot { submissionId: number; key: string | null }`, `export type PaperPlace = 'app' | 'try'`, `defaultMode(place)`, `modeOf(params: URLSearchParams, place): PaperMode`, `paperPath(code: string, place: PaperPlace, spot: PaperSpot, mode: PaperMode): string`, `listedPapers(uploads, mode)`, `walkedPoints(uploads, mode, submissionId): QueuedPoint[]`, `studentSpot(row, mode): PaperSpot`.
  - `src/admin/paperPage/PointDecision.tsx`: `export type DecisionView = { kind: 'item'; item: EvaluationItemInfo } | { kind: 'pages'; pages: string[] }` and `PointDecision({ evaluation, view, pending, error, pageCount, onDecide })`.
  - `src/admin/paperPage/StudentList.tsx`: `StudentList({ uploads, mode, current, folded, onFold, pathOf })`.
  - `src/admin/paperPage/PaperHead.tsx`: `usePaperActions(code: string, submissionId: number)` (`reset`, `regrade`, `retry`, `notice`) and `PaperHead({ submission, actions })`.
  - `src/admin/pages/PaperPage.tsx`: `resultRefreshInterval` (moved from `SubmissionPage.tsx`), `PaperPage` (the app's route), `ReviewRedirect` (the app's `/teste/:code/verificare`), `TryPaperPage` (a Quick Try's `/teste/:code/verificare`).
  - `GradedResult` gets the optional prop `check?: ItemsCheck` (`export interface ItemsCheck { openKey: string | null; onOpen: (key: string) => void; onlyToCheck: boolean; decision: ReactNode }`); without it the result is as before (the Quick Try's "Rezultatul profesorului").

- [ ] **Step 1: Move `src/admin/pages/SubmissionPage.test.tsx` to `src/admin/pages/PaperPage.test.tsx`**

Run: `git mv src/admin/pages/SubmissionPage.test.tsx src/admin/pages/PaperPage.test.tsx`

- [ ] **Step 2: Edit `src/admin/pages/PaperPage.test.tsx`**

Find this block:

```tsx
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
import { resultRefreshInterval } from './SubmissionPage.tsx';

```

Replace it with:

```tsx
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
import { resultRefreshInterval } from './PaperPage.tsx';

```

- [ ] **Step 3: Edit `src/admin/pages/PaperPage.test.tsx`**

Find this block:

```tsx

describe('SubmissionPage', () => {
  it('shows the student, the upload state, and the times', async () => {
    renderAdmin(page, apiWith());
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.getByText(/6E2-26T1 · Fracții · Trimis/)).toBeInTheDocument();
    expect(screen.getByText('Început 6 oct. 2026, 10:20 · trimis 6 oct. 2026, 10:40')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← 6E2-26T1' })).toHaveAttribute('href', '/teste/6E2-26T1');
    expect(screen.getByRole('link', { name: 'Toate notele elevului' })).toHaveAttribute('href', '/elevi/10');
```

Replace it with:

```tsx

describe('the paper page', () => {
  it('shows the path, the student, the upload state, and the times', async () => {
    renderAdmin(page, apiWith());
    expect(await screen.findByRole('heading', { level: 1, name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.getByText(/6E2-26T1 · Fracții · Trimis/)).toBeInTheDocument();
    expect(screen.getByText('Început 6 oct. 2026, 10:20 · trimis 6 oct. 2026, 10:40')).toBeInTheDocument();
    const path = screen.getByRole('navigation', { name: 'Unde ești' });
    expect(within(path).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Teste', 'Clasa 6E2', 'Fracții', 'Pop Ion']);
    expect(within(path).getByRole('link', { name: 'Fracții' })).toHaveAttribute('href', '/teste/6E2-26T1');
    expect(within(path).getByRole('link', { name: 'Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
    expect(screen.getByRole('link', { name: 'Toate notele elevului' })).toHaveAttribute('href', '/elevi/10');
```

- [ ] **Step 4: Edit `src/admin/pages/PaperPage.test.tsx`**

Find this block:

```tsx

  it('shows photos inline and PDFs in a frame with a link, in upload order', async () => {
    renderAdmin(page, apiWith());
    await userEvent.click(await screen.findByRole('button', { name: 'Arată fișierele' }));
    const photo = await screen.findByRole('img', { name: 'Pagina 1' });
    expect(photo).toHaveAttribute('src', '/api/admin/submissions/5/files/21');
    expect(screen.getByText('Pagina 1: IMG_0001.jpg · 820 KB')).toBeInTheDocument();
    expect(screen.getByTitle('Pagina 2')).toHaveAttribute('src', '/api/admin/submissions/5/files/22');
    expect(screen.getByRole('link', { name: 'Deschide PDF-ul' })).toHaveAttribute('href', '/api/admin/submissions/5/files/22');
    expect(screen.getByText('Pagina 2: scan.pdf · 1,5 MB')).toBeInTheDocument();
  });
```

Replace it with:

```tsx

  it('shows the paper beside the exercises, one page at a time with its file, and a PDF in a frame with a link', async () => {
    renderAdmin(page, apiWith());
    expect(await screen.findByText('Pop Ion · pagina 1 din 2')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Pagina 1 a lucrării' })).toHaveAttribute('src', '/api/admin/submissions/5/files/21');
    // Each page names its file, as the student sent it.
    expect(screen.getByText('IMG_0001.jpg · 820 KB')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pagina 2' }));
    expect(screen.getByTitle('Pagina 2 a lucrării')).toHaveAttribute('src', '/api/admin/submissions/5/files/22');
    expect(screen.getByText('scan.pdf · 1,5 MB')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Deschide PDF-ul' })).toHaveAttribute('href', '/api/admin/submissions/5/files/22');
    expect(screen.queryByRole('button', { name: 'Arată fișierele' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 5: Edit `src/admin/pages/PaperPage.test.tsx`**

Find this block:

```tsx
    renderAdmin(page, apiWith({ ...submission, files }));
    await userEvent.click(await screen.findByRole('button', { name: 'Arată fișierele' }));
    expect(await screen.findByRole('img', { name: 'Pagina 2' })).toHaveAttribute('src', '/api/admin/submissions/5/files/23');
    expect(screen.getByText('Pagina 2: IMG_0003.jpg · 820 KB')).toBeInTheDocument();
  });
```

Replace it with:

```tsx
    renderAdmin(page, apiWith({ ...submission, files }));
    await userEvent.click(await screen.findByRole('button', { name: 'Pagina 2' }));
    expect(screen.getByRole('img', { name: 'Pagina 2 a lucrării' })).toHaveAttribute('src', '/api/admin/submissions/5/files/23');
  });
```

- [ ] **Step 6: Edit `src/admin/pages/PaperPage.test.tsx`**

Find this block:

```tsx
    const { unmount } = renderAdmin(page, apiWith({ ...submission, status: 'uploading', submittedAt: null, files: [] }));
    await userEvent.click(await screen.findByRole('button', { name: 'Arată fișierele' }));
    expect(await screen.findByText('Elevul nu a încărcat încă niciun fișier.')).toBeInTheDocument();
    expect(screen.getByText('Elevul nu a trimis încă lucrarea.')).toBeInTheDocument();
```

Replace it with:

```tsx
    const { unmount } = renderAdmin(page, apiWith({ ...submission, status: 'uploading', submittedAt: null, files: [] }));
    expect(await screen.findByText('Elevul nu a încărcat niciun fișier.')).toBeInTheDocument();
    expect(screen.getByText('Elevul nu a trimis încă lucrarea.')).toBeInTheDocument();
```

- [ ] **Step 7: Edit `src/admin/pages/PaperPage.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByText(/Robotul nu a putut citi: Pagina 2\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Am verificat paginile' }));
```

Replace it with:

```tsx
    expect(await screen.findByText(/Robotul nu a putut citi: Pagina 2\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Am verificat paginile' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Arată paginile' }));
    expect(screen.getByRole('button', { name: 'Pagina 2' })).toHaveAttribute('aria-current', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Am verificat paginile' }));
```

- [ ] **Step 8: Edit `src/admin/pages/PaperPage.test.tsx`**

Find this block:

```tsx

  it('hides the files by default and starts their scroll at the top when opened', async () => {
    renderAdmin(page, apiWith(graded));
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Pagina 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arată fișierele' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Arată fișierele' }));
    expect(await screen.findByRole('img', { name: 'Pagina 1' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ascunde fișierele' }));
    expect(screen.queryByRole('img', { name: 'Pagina 1' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Arată fișierele' }));
    expect(await screen.findByRole('img', { name: 'Pagina 1' })).toBeInTheDocument();
  });

  it('shows the robot confidence as 5 bars with colours, and points coloured by ratio', async () => {
```

Replace it with:

```tsx

  it('shows the robot confidence as 5 bars with colours, and points coloured by ratio', async () => {
```

- [ ] **Step 9: Move `src/admin/pages/ReviewPage.test.tsx` to `src/admin/pages/PaperCheck.test.tsx`**

Run: `git mv src/admin/pages/ReviewPage.test.tsx src/admin/pages/PaperCheck.test.tsx`

- [ ] **Step 10: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx

// The review of the points to check (redesign spec §7).
const PAGE = '/teste/6E2-26T1/verificare';
```

Replace it with:

```tsx

// The points to check on the paper page (spec 2026-11-12 §4): the old address
// of the review opens the page with only the points to check.
const PAGE = '/teste/6E2-26T1/verificare';
```

- [ ] **Step 11: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx

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
    expect(within(list).getByRole('link', { name: 'Ana Pop nota 6,5 2 puncte de verificat' })).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Paginile necitite' })).toHaveAttribute('aria-current', 'true');
    expect(within(list).getByRole('link', { name: 'Subiectul II, ex. 1 · 1p din 2p' })).not.toHaveAttribute('aria-current');
    expect(within(list).getByRole('link', { name: 'Subiectul I, ex. 3 · 3p din 5p' })).toHaveAttribute('href', `${PAGE}?lucrare=14&punct=41`);
    expect(within(list).getByRole('heading', { name: 'Celelalte lucrări 1' })).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Eva Stan nota 5' })).toHaveAttribute('href', `${PAGE}?lucrare=13`);
    expect(within(list).queryByText(/Dan Marin/)).not.toBeInTheDocument();
  });

  it('opens on the first point: the pages Ana could not read, on the first of them', async () => {
    const api = apiWith();
```

Replace it with:

```tsx

// The paper page of one paper, with an open point and a view.
function paperAt(id: number, key: string | null = null, mode: 'toate' | 'verificare' = 'verificare'): string {
  const params = new URLSearchParams();
  if (key !== null) params.set('punct', key);
  if (mode === 'verificare') params.set('vedere', 'verificare');
  const search = params.toString();
  return `/teste/6E2-26T1/elevi/${id}${search ? `?${search}` : ''}`;
}

// The whole address, so a shorter one does not match a longer one.
const at = (id: number, key: string | null = null, mode: 'toate' | 'verificare' = 'verificare') =>
  new RegExp(`^${paperAt(id, key, mode).replace(/[?.]/g, '\\$&')}$`);

const students = () => screen.getByRole('navigation', { name: 'Elevii' });
const decision = () => screen.getByRole('region', { name: 'Decizia' });
const row = (label: string) => screen.getByRole('row', { name: new RegExp(label) });

describe('the points to check on the paper page', () => {
  it('opens the address of the review on the first point, the students with points first', async () => {
    renderAdmin(PAGE, apiWith(), <LocationProbe />);
    await expectLocation(at(11, 'pagini'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Pop' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Doar de verificat (3)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Toate exercițiile' })).toHaveAttribute('aria-pressed', 'false');
    const list = students();
    expect(within(list).getByRole('heading', { name: 'Cu puncte de verificat 2' })).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Ana Pop 2 puncte de verificat' })).toHaveAttribute('aria-current', 'true');
    expect(within(list).getByRole('link', { name: 'Ion Popa 1 punct de verificat' })).toHaveAttribute('href', paperAt(14, '41'));
    expect(within(list).getByRole('heading', { name: 'Celelalte lucrări 2' })).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Eva Stan nota 5' })).toHaveAttribute('href', paperAt(13));
    expect(within(list).getByRole('link', { name: 'Dan Marin trimis' })).toHaveAttribute('href', paperAt(12));
    expect(within(list).queryByText(/Mara Ilie/)).not.toBeInTheDocument();
  });

  it('opens on the pages Ana could not read, on the first of them, and the next point opens after them', async () => {
    const api = apiWith();
```

- [ ] **Step 12: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    expect(screen.getByRole('img', { name: 'Pagina 2 a lucrării' })).toHaveAttribute('src', submissionFileUrl(11, 102));
    expect(within(decision()).getByRole('heading', { name: 'Ana Pop · Paginile necitite' })).toBeInTheDocument();
    expect(
```

Replace it with:

```tsx
    expect(screen.getByRole('img', { name: 'Pagina 2 a lucrării' })).toHaveAttribute('src', submissionFileUrl(11, 102));
    expect(within(decision()).getByRole('heading', { name: 'Decide: Paginile necitite' })).toBeInTheDocument();
    expect(
```

- [ ] **Step 13: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    ).toBeInTheDocument();

```

Replace it with:

```tsx
    ).toBeInTheDocument();
    // The note above the exercises does not say it a second time.
    expect(screen.getAllByText(/^Robotul nu a putut citi/)).toHaveLength(1);
    // Only the points to check show: I.1 waits for nothing.
    expect(screen.queryByRole('row', { name: /Subiectul I, ex\. 1/ })).not.toBeInTheDocument();

```

- [ ] **Step 14: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    expect(api.reviewPages).toHaveBeenCalledWith(11, { pagesReviewed: true, gradedAt: GRADED_AT });
    expect(await within(decision()).findByRole('heading', { name: 'Ana Pop · Subiectul II, ex. 1' })).toBeInTheDocument();
    await expectLocation(at(`?lucrare=11&punct=32`));
    expect(within(queue()).queryByRole('link', { name: 'Paginile necitite' })).not.toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(api.reviewPages).toHaveBeenCalledWith(11, { pagesReviewed: true, gradedAt: GRADED_AT });
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
    await expectLocation(at(11, '32'));
    expect(within(students()).getByRole('link', { name: 'Ana Pop 1 punct de verificat' })).toBeInTheDocument();
  });
```

- [ ] **Step 15: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    await userEvent.keyboard('j');
    await expectLocation(at(`?lucrare=11&punct=32`));
    expect(screen.getByText('Ana Pop · pagina 3 din 3')).toBeInTheDocument();
```

Replace it with:

```tsx
    await userEvent.keyboard('j');
    await expectLocation(at(11, '32'));
    expect(screen.getByText('Ana Pop · pagina 3 din 3')).toBeInTheDocument();
```

- [ ] **Step 16: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    await userEvent.keyboard('k');
    await expectLocation(at(`?lucrare=14&punct=41`));
    expect(await screen.findByText('Ion Popa · pagina 1 din 1')).toBeInTheDocument();
```

Replace it with:

```tsx
    await userEvent.keyboard('k');
    await expectLocation(at(14, '41'));
    expect(await screen.findByText('Ion Popa · pagina 1 din 1')).toBeInTheDocument();
```

- [ ] **Step 17: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx

  it("accepts the robot's points, and the next point opens", async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    expect(within(panel).getByText('x = 3')).toBeInTheDocument();
    expect(within(panel).getByText('Verifică semnul.')).toBeInTheDocument();
    expect(within(panel).getByText('De verificat: Scrisul nu se citește.')).toBeInTheDocument();
    expect(within(panel).getByText('2p în barem')).toBeInTheDocument();
```

Replace it with:

```tsx

  it("accepts the robot's points under the row, and the next point opens", async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    // The row above the decision has the answer, the comment and the reason.
    const flagged = row('Subiectul II, ex. 1');
    expect(flagged).toHaveClass('is-open');
    expect(within(flagged).getByText('x = 3')).toBeInTheDocument();
    expect(within(flagged).getByText('Verifică semnul.')).toBeInTheDocument();
    expect(within(flagged).getByText('De verificat: Scrisul nu se citește.')).toBeInTheDocument();
    expect(within(flagged).queryByRole('button', { name: 'Verificat Subiectul II, ex. 1' })).not.toBeInTheDocument();
    expect(within(panel).getByText('2p în barem')).toBeInTheDocument();
```

- [ ] **Step 18: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    expect(api.correctItem).toHaveBeenCalledWith(11, 32, { reviewed: true, gradedAt: GRADED_AT });
    expect(await screen.findByRole('heading', { name: 'Ion Popa · Subiectul I, ex. 3' })).toBeInTheDocument();
    await expectLocation(at(`?lucrare=14&punct=41`));
    expect(screen.getByText('Fracții · Clasa 6E2 · 2 puncte în 2 lucrări')).toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(api.correctItem).toHaveBeenCalledWith(11, 32, { reviewed: true, gradedAt: GRADED_AT });
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul I, ex. 3' })).toBeInTheDocument();
    await expectLocation(at(14, '41'));
    expect(screen.getByRole('button', { name: 'Doar de verificat (2)' })).toBeInTheDocument();
  });
```

- [ ] **Step 19: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
  it('says what the grade becomes with another value, and saves it', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    const input = within(panel).getByRole('textbox', { name: 'Alt punctaj, din 2' });
```

Replace it with:

```tsx
  it('says what the grade becomes with another value, and saves it', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, '32'), api);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    const input = within(panel).getByRole('textbox', { name: 'Alt punctaj, din 2' });
```

- [ ] **Step 20: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    expect(api.correctItem).toHaveBeenCalledWith(11, 32, { points: 1.25, reviewed: true, gradedAt: GRADED_AT });
    expect(await screen.findByRole('heading', { name: 'Ion Popa · Subiectul I, ex. 3' })).toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(api.correctItem).toHaveBeenCalledWith(11, 32, { points: 1.25, reviewed: true, gradedAt: GRADED_AT });
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul I, ex. 3' })).toBeInTheDocument();
  });
```

- [ ] **Step 21: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
```

Replace it with:

```tsx
    const api = apiWith();
    renderAdmin(paperAt(11, '32'), api);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
```

- [ ] **Step 22: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    await userEvent.keyboard('j');
    await expectLocation(at(`?lucrare=11&punct=32`));
    await userEvent.keyboard('k');
    await expectLocation(at(`?lucrare=11&punct=pagini`));
    await userEvent.keyboard('k');
    await expectLocation(at(`?lucrare=14&punct=41`));
    await userEvent.keyboard('j');
    await expectLocation(at(`?lucrare=11&punct=pagini`));
    await userEvent.keyboard('3');
```

Replace it with:

```tsx
    await userEvent.keyboard('j');
    await expectLocation(at(11, '32'));
    await userEvent.keyboard('k');
    await expectLocation(at(11, 'pagini'));
    await userEvent.keyboard('k');
    await expectLocation(at(14, '41'));
    await userEvent.keyboard('j');
    await expectLocation(at(11, 'pagini'));
    await userEvent.keyboard('3');
```

- [ ] **Step 23: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    expect(api.reviewPages).toHaveBeenCalledWith(11, { pagesReviewed: true, gradedAt: GRADED_AT });
    expect(await within(decision()).findByRole('heading', { name: 'Ana Pop · Subiectul II, ex. 1' })).toBeInTheDocument();
  });

  it('goes to the next point and back with the buttons of the title row', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    await screen.findByRole('heading', { name: 'Ana Pop · Subiectul II, ex. 1' });
    await userEvent.click(screen.getByRole('button', { name: 'Următorul punct' }));
    await expectLocation(at('?lucrare=14&punct=41'));
    expect(await within(decision()).findByRole('heading', { name: 'Ion Popa · Subiectul I, ex. 3' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Punctul anterior' }));
    await expectLocation(at('?lucrare=11&punct=32'));
    expect(await within(decision()).findByRole('heading', { name: 'Ana Pop · Subiectul II, ex. 1' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Punctul anterior' }));
    await expectLocation(at('?lucrare=11&punct=pagini'));
    // The buttons go round the queue: before the first point comes the last one.
    await userEvent.click(screen.getByRole('button', { name: 'Punctul anterior' }));
    await expectLocation(at('?lucrare=14&punct=41'));
  });
```

Replace it with:

```tsx
    expect(api.reviewPages).toHaveBeenCalledWith(11, { pagesReviewed: true, gradedAt: GRADED_AT });
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
  });

  it('goes to the next point and back with the buttons above the panes', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' });
    await userEvent.click(screen.getByRole('button', { name: 'Următorul punct' }));
    await expectLocation(at(14, '41'));
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul I, ex. 3' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Punctul anterior' }));
    await expectLocation(at(11, '32'));
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Punctul anterior' }));
    await expectLocation(at(11, 'pagini'));
    // The buttons go round the queue: before the first point comes the last one.
    await userEvent.click(screen.getByRole('button', { name: 'Punctul anterior' }));
    await expectLocation(at(14, '41'));
  });
```

- [ ] **Step 24: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
  it('ignores the keys in the stepper field and with Ctrl, Alt or Meta', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    const input = within(panel).getByRole('textbox', { name: 'Alt punctaj, din 2' });
```

Replace it with:

```tsx
  it('ignores the keys in the stepper field and with Ctrl, Alt or Meta', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    const input = within(panel).getByRole('textbox', { name: 'Alt punctaj, din 2' });
```

- [ ] **Step 25: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    await userEvent.keyboard('{Control>}a{/Control}{Alt>}j{/Alt}{Meta>}k{/Meta}');
    expect(api.correctItem).not.toHaveBeenCalled();
    await expectLocation(at(`?lucrare=11&punct=32`));
  });

```

Replace it with:

```tsx
    await userEvent.keyboard('{Control>}a{/Control}{Alt>}j{/Alt}{Meta>}k{/Meta}');
    expect(api.correctItem).not.toHaveBeenCalled();
    await expectLocation(at(11, '32'));
  });

```

- [ ] **Step 26: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
  it('ignores the keys while a panel of the bar is open', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(await screen.findByRole('button', { name: /^De făcut/ }));
```

Replace it with:

```tsx
  it('ignores the keys while a panel of the bar is open', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(await screen.findByRole('button', { name: /^De făcut/ }));
```

- [ ] **Step 27: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    expect(api.correctItem).not.toHaveBeenCalled();
    await expectLocation(at(`?lucrare=11&punct=32`));
  });
```

Replace it with:

```tsx
    expect(api.correctItem).not.toHaveBeenCalled();
    await expectLocation(at(11, '32'));
  });
```

- [ ] **Step 28: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    api.correctItem.mockReturnValueOnce(new Promise<never>(() => {}));
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
```

Replace it with:

```tsx
    api.correctItem.mockReturnValueOnce(new Promise<never>(() => {}));
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
```

- [ ] **Step 29: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    await userEvent.keyboard('jk2');
    await expectLocation(at(`?lucrare=11&punct=32`));
    expect(screen.getByText('Ana Pop · pagina 3 din 3')).toBeInTheDocument();
```

Replace it with:

```tsx
    await userEvent.keyboard('jk2');
    await expectLocation(at(11, '32'));
    expect(screen.getByText('Ana Pop · pagina 3 din 3')).toBeInTheDocument();
```

- [ ] **Step 30: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    expect(within(panel).getByRole('heading', { name: 'Ion Popa · Subiectul I, ex. 3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Următorul punct' })).not.toBeInTheDocument();
```

Replace it with:

```tsx
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    expect(within(panel).getByRole('heading', { name: 'Decide: Subiectul I, ex. 3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Următorul punct' })).not.toBeInTheDocument();
```

- [ ] **Step 31: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    expect(screen.getByRole('link', { name: 'Mergi la Rezultate' })).toHaveAttribute('href', '/teste/6E2-26T1#rezultate');
    await expectLocation(at(`?lucrare=14`));
    expect(within(decision()).getByRole('heading', { name: 'Ion Popa' })).toBeInTheDocument();
    expect(within(queue()).getByText('Niciuna.')).toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(screen.getByRole('link', { name: 'Mergi la Rezultate' })).toHaveAttribute('href', '/teste/6E2-26T1#rezultate');
    await expectLocation(at(14));
    expect(screen.queryByRole('region', { name: 'Decizia' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Doar de verificat (0)' })).toBeInTheDocument();
    expect(within(students()).queryByRole('heading', { name: /Cu puncte de verificat/ })).not.toBeInTheDocument();
  });
```

- [ ] **Step 32: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    const api = apiWith();
    api.correctItem.mockRejectedValueOnce(new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.'));
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    expect(api.getSubmission).toHaveBeenCalledTimes(1);
```

Replace it with:

```tsx
    const api = apiWith();
    api.correctItem.mockRejectedValueOnce(new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.'));
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    expect(api.getSubmission).toHaveBeenCalledTimes(1);
```

- [ ] **Step 33: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
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
    expect(within(queue()).getByRole('link', { name: 'Eva Stan nota 5' })).toHaveAttribute('aria-current', 'true');
  });

  it('opens a point from the exercises of the paper', async () => {
    renderAdmin(PAGE, apiWith(), <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('link', { name: 'Subiectul II, ex. 1 · 1p din 2p' }));
    await expectLocation(at(`?lucrare=11&punct=32`));
    expect(await within(decision()).findByRole('heading', { name: 'Ana Pop · Subiectul II, ex. 1' })).toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(api.getSubmission).toHaveBeenCalledTimes(2);
    await expectLocation(at(11, '32'));
  });

  it('shows a paper with no point to check with all its exercises, its grade and its page', async () => {
    renderAdmin(paperAt(13, null, 'toate'), apiWith());
    expect(await screen.findByText(/^Nota/)).toHaveTextContent('Nota 5 · 5 puncte din 10, cu 1 din oficiu');
    expect(within(row('Subiectul I, ex. 1')).getByText('4 din 4,5')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Decizia' })).not.toBeInTheDocument();
    expect(screen.getByTitle('Pagina 1 a lucrării')).toHaveAttribute('src', submissionFileUrl(13, 131));
    expect(within(students()).getByRole('link', { name: 'Eva Stan nota 5' })).toHaveAttribute('aria-current', 'true');
  });

  it('says so when only the points to check show and the paper has none', async () => {
    renderAdmin(paperAt(13), apiWith());
    expect(await screen.findByText('Niciun exercițiu de verificat în această lucrare.')).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Subiectul I, ex\. 1/ })).not.toBeInTheDocument();
  });

  it('opens any exercise on the paper: its page, and a decision only for one to check', async () => {
    renderAdmin(paperAt(11, null, 'toate'), apiWith(), <LocationProbe />);
    await screen.findByText('Ana Pop · pagina 1 din 3');
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, '32', 'toate'));
    expect(screen.getByText('Ana Pop · pagina 3 din 3')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' }));
    await expectLocation(at(11, '31', 'toate'));
    expect(row('Subiectul I, ex. 1')).toHaveClass('is-open');
    expect(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Ana Pop · pagina 1 din 3')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Decizia' })).not.toBeInTheDocument();
    // II.1 still waits: its own "Verificat" is back while it is not open.
    expect(within(row('Subiectul II, ex. 1')).getByRole('button', { name: 'Verificat Subiectul II, ex. 1' })).toBeInTheDocument();
  });

  it('switches between all the exercises and only the points to check, in the address', async () => {
    renderAdmin(paperAt(11, null, 'toate'), apiWith(), <LocationProbe />);
    expect(await screen.findByRole('row', { name: /Subiectul I, ex\. 1/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ce a lucrat bine' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Doar de verificat (3)' }));
    await expectLocation(at(11));
    expect(screen.queryByRole('row', { name: /Subiectul I, ex\. 1/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Subiectul II, ex\. 1/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ce a lucrat bine' })).not.toBeInTheDocument();
    // Another student keeps the view.
    await userEvent.click(within(students()).getByRole('link', { name: 'Ion Popa 1 punct de verificat' }));
    await expectLocation(at(14, '41'));
    await userEvent.click(screen.getByRole('button', { name: 'Toate exercițiile' }));
    await expectLocation(at(14, '41', 'toate'));
  });

  it('opens the next point of the same student after a decision in all the exercises, and never another student', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, 'pagini', 'toate'), api, <LocationProbe />);
    await userEvent.click(await within(await screen.findByRole('region', { name: 'Decizia' })).findByRole('button', { name: 'Am verificat paginile' }));
    await expectLocation(at(11, '32', 'toate'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toHaveFocus());
    await userEvent.click(within(decision()).getByRole('button', { name: 'Accept 1p' }));
    // No point of Ana is left: the row stays open, and "Elevul următor" waits.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Elevul următor' })).toHaveFocus());
    await expectLocation(at(11, '32', 'toate'));
    expect(screen.queryByRole('region', { name: 'Decizia' })).not.toBeInTheDocument();
    expect(within(row('Subiectul II, ex. 1')).getByText('Verificat')).toBeInTheDocument();
  });

  it('walks only the points of the open student with J and K in all the exercises', async () => {
    renderAdmin(paperAt(11, null, 'toate'), apiWith(), <LocationProbe />);
    await screen.findByText('Ana Pop · pagina 1 din 3');
    await userEvent.keyboard('j');
    await expectLocation(at(11, 'pagini', 'toate'));
    await userEvent.keyboard('j');
    await expectLocation(at(11, '32', 'toate'));
    await userEvent.keyboard('j');
    await expectLocation(at(11, 'pagini', 'toate'));
    expect(screen.queryByRole('button', { name: 'Următorul punct' })).not.toBeInTheDocument();
  });

  it('moves to the student before or after, in the order of the list', async () => {
    renderAdmin(paperAt(11, null, 'toate'), apiWith(), <LocationProbe />);
    await screen.findByText('Ana Pop · pagina 1 din 3');
    expect(screen.queryByRole('button', { name: 'Elevul anterior' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Elevul următor' }));
    await expectLocation(at(12, null, 'toate'));
    await userEvent.click(screen.getByRole('button', { name: 'Elevul anterior' }));
    await expectLocation(at(11, null, 'toate'));
    // With only the points to check, the students with points come first and
    // each opens on its first point.
    await userEvent.click(screen.getByRole('button', { name: 'Doar de verificat (3)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Elevul următor' }));
    await expectLocation(at(14, '41'));
  });

  it('folds the students and keeps the choice in this browser', async () => {
    const first = renderAdmin(paperAt(11), apiWith());
    await userEvent.click(await within(await screen.findByRole('navigation', { name: 'Elevii' })).findByRole('button', { name: 'Ascunde' }));
    expect(within(students()).queryByRole('link')).not.toBeInTheDocument();
    expect(localStorage.getItem('quickeval:paperStudentsFolded')).toBe('on');
    first.unmount();
    renderAdmin(paperAt(11), apiWith());
    await userEvent.click(await within(await screen.findByRole('navigation', { name: 'Elevii' })).findByRole('button', { name: 'Arată elevii' }));
    expect(within(students()).getByRole('link', { name: 'Ana Pop 2 puncte de verificat' })).toBeInTheDocument();
    expect(localStorage.getItem('quickeval:paperStudentsFolded')).toBe('off');
  });
```

- [ ] **Step 34: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    ion!.files = [];
    renderAdmin(`${PAGE}?lucrare=14&punct=41`, apiWith([ana!, ion!, eva!]));
    expect(await screen.findByText('Elevul nu a încărcat niciun fișier.')).toBeInTheDocument();
```

Replace it with:

```tsx
    ion!.files = [];
    renderAdmin(paperAt(14, '41'), apiWith([ana!, ion!, eva!]));
    expect(await screen.findByText('Elevul nu a încărcat niciun fișier.')).toBeInTheDocument();
```

- [ ] **Step 35: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx

  it('has one line before any paper is graded, and the way back to the test', async () => {
    const api = createFakeApi({
```

Replace it with:

```tsx

  it("opens the test's Verificare before any paper is graded", async () => {
    const api = createFakeApi({
```

- [ ] **Step 36: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    });
    renderAdmin(PAGE, api);
    expect(await screen.findByText('Nicio lucrare nu este corectată încă.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Înapoi la test' })).toHaveAttribute('href', '/teste/6E2-26T1#verificare');
    expect(screen.queryByRole('navigation', { name: 'Lucrările' })).not.toBeInTheDocument();
  });
```

Replace it with:

```tsx
    });
    renderAdmin(PAGE, api, <LocationProbe />);
    await expectLocation(/^\/teste\/6E2-26T1#verificare$/);
  });
```

- [ ] **Step 37: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=pagini`, api, <LocationProbe />);
    await screen.findByText('Ana Pop · pagina 2 din 3');
    await userEvent.keyboard('a');
    expect(await within(decision()).findByRole('heading', { name: 'Ana Pop · Subiectul II, ex. 1' })).toBeInTheDocument();
    // The key is still down: the browser repeats it, and the repeats do nothing.
```

Replace it with:

```tsx
    const api = apiWith();
    renderAdmin(paperAt(11, 'pagini'), api, <LocationProbe />);
    await screen.findByText('Ana Pop · pagina 2 din 3');
    await userEvent.keyboard('a');
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
    // The key is still down: the browser repeats it, and the repeats do nothing.
```

- [ ] **Step 38: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    expect(api.correctItem).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent(at('?lucrare=11&punct=32'));
    fireEvent.keyDown(document.body, { key: 'a' });
```

Replace it with:

```tsx
    expect(api.correctItem).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent(at(11, '32'));
    fireEvent.keyDown(document.body, { key: 'a' });
```

- [ ] **Step 39: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    const held = heldSave(api);
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 1p' }));
    await userEvent.click(screen.getByRole('link', { name: 'Înapoi la test' }));
    await screen.findByRole('link', { name: 'Decide: Ana Pop, Subiectul II, ex. 1' });
```

Replace it with:

```tsx
    const held = heldSave(api);
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 1p' }));
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Unde ești' })).getByRole('link', { name: 'Fracții' }));
    await screen.findByRole('link', { name: 'Decide: Ana Pop, Subiectul II, ex. 1' });
```

- [ ] **Step 40: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    expect(screen.queryByRole('link', { name: 'Decide: Ana Pop, Subiectul II, ex. 1' })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/teste\/6E2-26T1#verificare$/);
  });
```

Replace it with:

```tsx
    expect(screen.queryByRole('link', { name: 'Decide: Ana Pop, Subiectul II, ex. 1' })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/teste\/6E2-26T1$/);
  });
```

- [ ] **Step 41: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    const held = heldSave(api);
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 1p' }));
    await userEvent.click(within(queue()).getByRole('link', { name: 'Eva Stan nota 5' }));
    await expectLocation(at('?lucrare=13'));
    await held.done();
    expect(within(queue()).queryByRole('link', { name: 'Subiectul II, ex. 1 · 1p din 2p' })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(at('?lucrare=13'));
  });
```

Replace it with:

```tsx
    const held = heldSave(api);
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 1p' }));
    await userEvent.click(within(students()).getByRole('link', { name: 'Eva Stan nota 5' }));
    await expectLocation(at(13));
    await held.done();
    expect(within(students()).getByRole('link', { name: 'Ana Pop 1 punct de verificat' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(at(13));
  });
```

- [ ] **Step 42: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    await userEvent.keyboard('j');
    await expectLocation(at('?lucrare=11&punct=32'));
  });
```

Replace it with:

```tsx
    await userEvent.keyboard('j');
    await expectLocation(at(11, '32'));
  });
```

- [ ] **Step 43: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    await screen.findByRole('region', { name: 'Decizia' });
```

Replace it with:

```tsx
    const api = apiWith();
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    await screen.findByRole('region', { name: 'Decizia' });
```

- [ ] **Step 44: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    await userEvent.keyboard('j');
    await expectLocation(at('?lucrare=14&punct=41'));
  });
```

Replace it with:

```tsx
    await userEvent.keyboard('j');
    await expectLocation(at(14, '41'));
  });
```

- [ ] **Step 45: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
```

Replace it with:

```tsx
    const api = apiWith();
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
```

- [ ] **Step 46: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    fireEvent.keyDown(document.body, { key: 'a' });
    // Ion's paper loads in a new right pane: found through the screen.
    expect(await screen.findByRole('heading', { name: 'Ion Popa · Subiectul I, ex. 3' })).toBeInTheDocument();
    expect(api.correctItem).toHaveBeenCalledTimes(1);
```

Replace it with:

```tsx
    fireEvent.keyDown(document.body, { key: 'a' });
    // Ion's paper loads in a new middle pane: found through the screen.
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul I, ex. 3' })).toBeInTheDocument();
    expect(api.correctItem).toHaveBeenCalledTimes(1);
```

- [ ] **Step 47: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    api.correctItem.mockRejectedValueOnce(new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.'));
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
```

Replace it with:

```tsx
    api.correctItem.mockRejectedValueOnce(new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.'));
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
```

- [ ] **Step 48: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx

  it('names the point it opens on in the address', async () => {
    renderAdmin(PAGE, apiWith(), <LocationProbe />);
    await expectLocation(at('?lucrare=11&punct=pagini'));
  });

  it('writes the address before it shows a paper', async () => {
    renderAdmin(PAGE, apiWith(), <LocationProbe />);
    // The first moment the papers show, the address already names the point:
    // a decision is never made on a point the address does not hold.
    await screen.findByRole('navigation', { name: 'Lucrările' });
    expect(screen.getByTestId('location')).toHaveTextContent(at('?lucrare=11&punct=pagini'));
  });
```

Replace it with:

```tsx

  it('names the point it opens on in the address before it shows a paper', async () => {
    renderAdmin(PAGE, apiWith(), <LocationProbe />);
    // The first moment the paper shows, the address already names the point:
    // a decision is never made on a point the address does not hold.
    await screen.findByRole('navigation', { name: 'Elevii' });
    expect(screen.getByTestId('location')).toHaveTextContent(at(11, 'pagini'));
  });
```

- [ ] **Step 49: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    expect(await within(panel).findByRole('heading', { name: 'Ana Pop' })).toBeInTheDocument();
    expect(within(panel).getByText('Robotul corectează acum lucrarea. Când are rezultatul, apare aici.')).toBeInTheDocument();
    expect(screen.getByText('Ana Pop · pagina 1 din 3')).toBeInTheDocument();
    expect(within(queue()).getByRole('link', { name: 'Subiectul I, ex. 3 · 3p din 5p' })).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('location')).toHaveTextContent(at('?lucrare=11&punct=32'));
  });
```

Replace it with:

```tsx
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Pop' })).toBeInTheDocument();
    expect(await screen.findByText('Robotul corectează acum lucrarea.')).toBeInTheDocument();
    expect(screen.getByText('Ana Pop · pagina 1 din 3')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Decizia' })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(at(11, '32'));
  });
```

- [ ] **Step 50: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    api.getSubmission.mockResolvedValueOnce(before);
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Ana Pop · Subiectul II, ex. 1' })).toBeInTheDocument();
    expect(api.getSubmission).toHaveBeenCalledTimes(2);
```

Replace it with:

```tsx
    api.getSubmission.mockResolvedValueOnce(before);
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
    expect(api.getSubmission).toHaveBeenCalledTimes(2);
```

- [ ] **Step 51: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=pagini`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Am verificat paginile' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ana Pop · Subiectul II, ex. 1' })).toHaveFocus());
    await userEvent.click(screen.getByRole('button', { name: 'Accept 1p' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ion Popa · Subiectul I, ex. 3' })).toHaveFocus());
    // The keys still act from there.
    await userEvent.keyboard('k');
    await expectLocation(at('?lucrare=14&punct=41'));
  });
```

Replace it with:

```tsx
    const api = apiWith();
    renderAdmin(paperAt(11, 'pagini'), api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Am verificat paginile' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toHaveFocus());
    await userEvent.click(screen.getByRole('button', { name: 'Accept 1p' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Decide: Subiectul I, ex. 3' })).toHaveFocus());
    // The keys still act from there.
    await userEvent.keyboard('k');
    await expectLocation(at(14, '41'));
  });
```

- [ ] **Step 52: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    expect(within(pane).getByRole('button', { name: 'Partea următoare' })).toBeInTheDocument();
    expect(screen.getByText('1 din 2')).toBeInTheDocument();
    // Not beside the label, where the pane's edge would cut them off.
```

Replace it with:

```tsx
    expect(within(pane).getByRole('button', { name: 'Partea următoare' })).toBeInTheDocument();
    expect(within(pane).getByText('1 din 2')).toBeInTheDocument();
    // Not beside the label, where the pane's edge would cut them off.
```

- [ ] **Step 53: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    expect(screen.getByText('Ion Popa · pagina 2 din 2')).toBeInTheDocument();
    expect(screen.getByText('2 din 2')).toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Partea următoare' })).toBeDisabled();
```

Replace it with:

```tsx
    expect(screen.getByText('Ion Popa · pagina 2 din 2')).toBeInTheDocument();
    expect(within(pane).getByText('2 din 2')).toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Partea următoare' })).toBeDisabled();
```

- [ ] **Step 54: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    await userEvent.click(within(decision()).getByRole('button', { name: 'Accept 3p' }));
    expect(await within(decision()).findByRole('heading', { name: 'Ion Popa · Subiectul II, ex. 4' })).toBeInTheDocument();
    expect(within(frame()).getByText('II.4')).toBeInTheDocument();
```

Replace it with:

```tsx
    await userEvent.click(within(decision()).getByRole('button', { name: 'Accept 3p' }));
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 4' })).toBeInTheDocument();
    expect(within(frame()).getByText('II.4')).toBeInTheDocument();
```

- [ ] **Step 55: Edit `src/admin/pages/PaperCheck.test.tsx`**

Find this block:

```tsx
    await userEvent.click(within(decision()).getByRole('button', { name: 'Accept 3p' }));
    expect(await within(decision()).findByRole('heading', { name: 'Ion Popa · Subiectul II, ex. 4' })).toBeInTheDocument();
    expect(screen.getByText('Ion Popa · pagina 1 din 2')).toBeInTheDocument();
```

Replace it with:

```tsx
    await userEvent.click(within(decision()).getByRole('button', { name: 'Accept 3p' }));
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 4' })).toBeInTheDocument();
    expect(screen.getByText('Ion Popa · pagina 1 din 2')).toBeInTheDocument();
```

- [ ] **Step 56: Edit `src/admin/cesMarks.test.tsx`**

Find this block:

```tsx
describe('the CES mark', () => {
  it('shows in the review queue', async () => {
    const uploads = [
```

Replace it with:

```tsx
describe('the CES mark', () => {
  it('shows in the students of the paper page', async () => {
    const uploads = [
```

- [ ] **Step 57: Edit `src/admin/cesMarks.test.tsx`**

Find this block:

```tsx
    renderAdmin('/teste/6E2-26T1/verificare', createFakeApi({ classes: [], students: {}, tests: [fakeTest({ status: 'done' }, uploads)] }));
    const queue = within(await screen.findByRole('navigation', { name: 'Lucrările' }));
    expect(within(queue.getByRole('link', { name: /^Bursașiu Teodor/ })).getByText('CES')).toBeInTheDocument();
```

Replace it with:

```tsx
    renderAdmin('/teste/6E2-26T1/verificare', createFakeApi({ classes: [], students: {}, tests: [fakeTest({ status: 'done' }, uploads)] }));
    const queue = within(await screen.findByRole('navigation', { name: 'Elevii' }));
    expect(within(queue.getByRole('link', { name: /^Bursașiu Teodor/ })).getByText('CES')).toBeInTheDocument();
```

- [ ] **Step 58: Edit `src/try/Graded.test.tsx`**

Find this block:

```tsx
    expect(screen.getByRole('checkbox', { name: 'Arată chenarul' })).toBeChecked();
  });
```

Replace it with:

```tsx
    expect(screen.getByRole('checkbox', { name: 'Arată chenarul' })).toBeChecked();
  });

  it('shows the paper page in the review, without the students, the path or the actions of a class paper', async () => {
    setup();
    await userEvent.click(await screen.findByRole('link', { name: 'Verifică 1 punct' }));
    expect(await screen.findByRole('region', { name: 'Decizia' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Doar de verificat (1)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('navigation', { name: 'Elevii' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Unde ești' })).not.toBeInTheDocument();
    for (const name of ['Alte acțiuni', 'Elevul anterior', 'Elevul următor']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'Toate notele elevului' })).not.toBeInTheDocument();
    expect(screen.queryByText('Linkul cu rezultatul elevului')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Toate exercițiile' }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/teste/PROBA-26T1/verificare?lucrare=${TRY_SUBMISSION}&punct=71&vedere=toate`);
    expect(await screen.findByRole('heading', { name: 'Ce a lucrat bine' })).toBeInTheDocument();
  });
```

- [ ] **Step 59: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/PaperPage.test.tsx src/admin/pages/PaperCheck.test.tsx src/admin/cesMarks.test.tsx src/try/Graded.test.tsx`
Expected: FAIL. `Test Files  4 failed (4)`, `Tests  38 failed | 40 passed (78)`: `PaperPage.test.tsx` does not load (`Failed to resolve import "./PaperPage.tsx"`); in `PaperCheck.test.tsx` the old review is still there, so the page has no "Elevii", no "Decizia" under a row, no "Decide: …" headings, no switch and no paper addresses (`Unable to find role="region" and name "Decizia"`, `Unable to find role="navigation" and name "Elevii"`, `Unable to find an accessible element with the role "button" and name "Doar de verificat (3)"`, `expect(element).toHaveTextContent()` on the address); `cesMarks.test.tsx` finds no "Elevii"; the try's new test finds no "Doar de verificat (1)". The 40 that pass are the zoom and border tests and the try's other tests: the old review's photo pane is the same pane, which this task keeps.

- [ ] **Step 60: Create `src/admin/paperPage/paths.ts`**

```ts
import type { UploadRow } from '../../../shared/api.ts';
import { papersToCheck, pointKey, pointQueue, reviewPath, type QueuedPoint } from '../reviewPage/points.ts';

// The paper page (spec 2026-11-12 §4): one student's exercises beside the
// paper. "toate" shows every exercise, "verificare" only the points to check.
export type PaperMode = 'toate' | 'verificare';

// A spot of the page: a paper, and its open exercise ("pagini" for the pages
// the robot could not read) or none.
export interface PaperSpot {
  submissionId: number;
  key: string | null;
}

// Where the page is: in the teacher app (`/teste/:code/elevi/:id`, all the
// exercises by default) or in a Quick Try (`/teste/:code/verificare`, the try's
// own route, only the points to check by default).
export type PaperPlace = 'app' | 'try';

export function defaultMode(place: PaperPlace): PaperMode {
  return place === 'app' ? 'toate' : 'verificare';
}

// The view the address names, else the place's own.
export function modeOf(params: URLSearchParams, place: PaperPlace): PaperMode {
  const asked = params.get('vedere');
  return asked === 'toate' || asked === 'verificare' ? asked : defaultMode(place);
}

// The address of a spot. The place's own view is left out of it.
export function paperPath(code: string, place: PaperPlace, spot: PaperSpot, mode: PaperMode): string {
  const params = new URLSearchParams();
  if (place === 'try') params.set('lucrare', String(spot.submissionId));
  if (spot.key !== null) params.set('punct', spot.key);
  if (mode !== defaultMode(place)) params.set('vedere', mode);
  const base = place === 'app' ? `/teste/${code}/elevi/${spot.submissionId}` : reviewPath(code);
  const search = params.toString();
  return search ? `${base}?${search}` : base;
}

// The students of the list: every upload with a paper. Only the points to
// check: the papers with points first, then the others, each group by name.
export function listedPapers(uploads: UploadRow[], mode: PaperMode): (UploadRow & { submissionId: number })[] {
  const papers = uploads.filter((row): row is UploadRow & { submissionId: number } => row.submissionId !== null);
  if (mode === 'toate') return papers;
  const withPoints = new Set(papersToCheck(uploads).map((row) => row.submissionId));
  return [...papers.filter((row) => withPoints.has(row.submissionId)), ...papers.filter((row) => !withPoints.has(row.submissionId))];
}

// The points J and K walk through: every point of the test while only the
// points to check show, else the points of the open paper.
export function walkedPoints(uploads: UploadRow[], mode: PaperMode, submissionId: number): QueuedPoint[] {
  const queue = pointQueue(uploads);
  return mode === 'verificare' ? queue : queue.filter((entry) => entry.submissionId === submissionId);
}

// Where a student opens from the list: on the first point while only the
// points to check show, else with no exercise open.
export function studentSpot(row: UploadRow & { submissionId: number }, mode: PaperMode): PaperSpot {
  const first = row.reviewPoints[0];
  return { submissionId: row.submissionId, key: mode === 'verificare' && first ? pointKey(first) : null };
}
```

- [ ] **Step 61: Create `src/admin/paperPage/PointDecision.tsx`**

```tsx
import { useId, useState } from 'react';
import type { EvaluationInfo, EvaluationItemInfo, ItemChange } from '../../../shared/api.ts';
import { formatPoints, gradeOf, isValidCorrection, round2 } from '../../../shared/scoring.ts';
import { pageLabel, parsePoints } from '../../ui/format.ts';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { pointsText } from '../reviewPage/points.ts';

// − and + move the points by half a point; any value in steps of 0,05 can be
// typed. Their names say the step.
const STEP = 0.5;

// What waits for the teacher's decision on the open row: an exercise to check,
// or the pages the robot could not read.
export type DecisionView = { kind: 'item'; item: EvaluationItemInfo } | { kind: 'pages'; pages: string[] };

// The decision on the open point to check, under its row (spec 2026-11-12
// §4.4): "Accept", or another value with the stepper and "Salvează", with the
// total and what the grade becomes. Its heading takes the focus after the
// decision before it. `onDecide` takes the change of points, or none.
export function PointDecision({
  evaluation,
  view,
  pending,
  error,
  pageCount,
  onDecide,
}: {
  evaluation: EvaluationInfo;
  view: DecisionView;
  pending: boolean;
  error: Error | null;
  pageCount: number;
  onDecide: (change: ItemChange) => void;
}) {
  return (
    <section className="point-decision" aria-label="Decizia">
      {view.kind === 'item' ? (
        // A new grading of the paper starts the stepper again: a value typed
        // on the old one is not for it.
        <ItemDecision key={`${evaluation.gradedAt}:${view.item.id}`} evaluation={evaluation} item={view.item} pending={pending} onDecide={onDecide} />
      ) : (
        <>
          <h2 tabIndex={-1}>Decide: Paginile necitite</h2>
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
      )}
      {error && <ErrorMessage error={error} />}
      <p className="review-keys hint">
        <span>
          <kbd>A</kbd> accept
        </span>
        <span>
          <kbd>J</kbd> <kbd>K</kbd> punctul următor sau anterior
        </span>
        {pageCount > 1 && (
          <span>
            <kbd>1</kbd>–<kbd>{Math.min(9, pageCount)}</kbd> pagina
          </span>
        )}
      </p>
    </section>
  );
}

function ItemDecision({
  evaluation,
  item,
  pending,
  onDecide,
}: {
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
        <h2 tabIndex={-1}>Decide: {item.label}</h2>
        <span className="hint">{pointsText(item.maxPoints)} în barem</span>
      </div>
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
```

- [ ] **Step 62: Create `src/admin/paperPage/StudentList.tsx`**

```tsx
import { Link } from 'react-router';
import type { UploadRow } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { countLabel, uploadStatusLabel } from '../../ui/format.ts';
import { CesTag } from '../CesTag.tsx';
import { listedPapers, type PaperMode } from './paths.ts';

// "Elevii" (spec 2026-11-12 §4.3): every student with a paper, the open one
// marked, each with the grade, or the points to check in orange, or the state.
// While only the points to check show: the papers with points first, then the
// others. It folds to a thin strip with one button. The links replace the
// address, so Back leaves the page.
export function StudentList({
  uploads,
  mode,
  current,
  folded,
  onFold,
  pathOf,
}: {
  uploads: UploadRow[];
  mode: PaperMode;
  current: number;
  folded: boolean;
  onFold: (folded: boolean) => void;
  pathOf: (row: UploadRow & { submissionId: number }) => string;
}) {
  const papers = listedPapers(uploads, mode);
  const withPoints = papers.filter((row) => row.status === 'graded' && row.reviewPoints.length > 0);
  const groups =
    mode === 'verificare'
      ? [
          { title: 'Cu puncte de verificat', rows: withPoints },
          { title: 'Celelalte lucrări', rows: papers.slice(withPoints.length) },
        ]
      : [{ title: null, rows: papers }];
  return (
    <nav className={folded ? 'paper-students is-folded' : 'paper-students'} aria-label="Elevii">
      <div className="paper-students-head">
        {!folded && <h2>Elevii</h2>}
        <button type="button" className="button-quiet button-small" aria-expanded={!folded} onClick={() => onFold(!folded)}>
          {folded ? <span aria-hidden="true">»</span> : 'Ascunde'}
          {folded && <span className="sr-only">Arată elevii</span>}
        </button>
      </div>
      {!folded &&
        groups.map(
          (group) =>
            (group.title === null || group.rows.length > 0) && (
              <div key={group.title ?? 'all'}>
                {group.title !== null && (
                  <h3 className="review-queue-head">
                    {group.title} <span className="review-count">{group.rows.length}</span>
                  </h3>
                )}
                <ul className="paper-student-list">
                  {group.rows.map((row) => (
                    <li key={row.submissionId}>
                      <Link replace to={pathOf(row)} aria-current={row.submissionId === current ? 'true' : undefined}>
                        <span className="paper-student-name">
                          {row.studentName}
                          {(row.ces || row.variant === 'ces') && <CesTag />}
                        </span>{' '}
                        <StudentState row={row} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ),
        )}
    </nav>
  );
}

function StudentState({ row }: { row: UploadRow }) {
  if (row.status === 'graded' && row.flagCount > 0) {
    return (
      <span className="paper-student-flags">
        <span aria-hidden="true">{row.flagCount}</span>
        <span className="sr-only">{countLabel(row.flagCount, 'punct de verificat', 'puncte de verificat')}</span>
      </span>
    );
  }
  if (row.status === 'graded' && row.grade !== null) {
    return (
      <span className="paper-student-grade">
        <span className="sr-only">nota</span> {formatPoints(row.grade)}
      </span>
    );
  }
  return <span className="hint">{uploadStatusLabel(row.status).toLowerCase()}</span>;
}
```

- [ ] **Step 63: Create `src/admin/paperPage/PaperHead.tsx`**

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { formatDateTime, robotStartMessage, uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { PdfActions } from '../pdf/PdfActions.tsx';
import { studentPdf, studentPdfFileName, studentPdfInput } from '../pdf/studentPdf.ts';
import { useSmallMenu } from '../shell/useSmallMenu.ts';
import { ResultLink } from '../testPage/ResultLink.tsx';

// Recorectează, Resetează and Reîncearcă of the paper page, and the news after
// the first and the last. The test page and the test list count grades and
// items to check: they are read again after each. The list of the year is
// read on every page (the shell): read it again, but do not wait for it.
export function usePaperActions(code: string, submissionId: number) {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const refreshLists = async () => {
    void queryClient.invalidateQueries({ queryKey: ['tests'] });
    await queryClient.invalidateQueries({ queryKey: ['test', code] });
  };
  const gradeAgain = async (message: string | null) => {
    setNotice(message);
    await queryClient.invalidateQueries({ queryKey: ['submission', submissionId] });
    await refreshLists();
  };
  // Resetează and Reîncearcă name the upload the page shows (`startedAt`).
  const reset = useMutation({
    mutationFn: (startedAt: string) => api.resetSubmission(submissionId, startedAt),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['submission', submissionId] });
      await refreshLists();
      navigate(`/teste/${code}`);
    },
  });
  const regrade = useMutation({
    mutationFn: (gradedAt: string) => api.regradeSubmission(submissionId, gradedAt),
    onSuccess: (answer) =>
      gradeAgain(answer.robot ? robotStartMessage(answer.robot) : 'Lucrarea se corectează din nou după ce pornești evaluarea.'),
  });
  const retry = useMutation({
    mutationFn: (startedAt: string) => api.retrySubmission(submissionId, startedAt),
    onSuccess: (robot) => gradeAgain(robot ? robotStartMessage(robot) : null),
  });
  return { reset, regrade, retry, notice };
}

type PaperActions = ReturnType<typeof usePaperActions>;

// The head of the paper page (from the paper's page before it): the student,
// the test and the state, and the times; on the right what the
// teacher takes away (all the student's grades, the PDF) and "Alte acțiuni";
// under it the student's result link, once the upload is sent.
export function PaperHead({ submission, actions }: { submission: SubmissionDetail; actions: PaperActions }) {
  const { regrade, reset } = actions;
  // The student's PDF, only for a graded result.
  const pdfInput = studentPdfInput(submission);
  // Recorectează names the grading the page shows.
  const gradedAt = submission.status === 'graded' ? (submission.evaluation?.gradedAt ?? null) : null;

  const paperActions: PaperAction[] = [];
  if (gradedAt !== null) {
    paperActions.push({
      label: 'Recorectează',
      hint: 'Robotul corectează lucrarea din nou. Punctajele și comentariile schimbate de tine se pierd.',
      busy: regrade.isPending,
      onChoose: () => {
        if (window.confirm(`Recorectezi lucrarea elevului ${submission.studentName}? Corecturile tale se pierd.`)) regrade.mutate(gradedAt);
      },
    });
  }
  paperActions.push({
    label: 'Resetează',
    hint: 'Se șterg fișierele, iar elevul poate lua încărcarea de la capăt, și de pe alt telefon.',
    danger: true,
    busy: reset.isPending,
    onChoose: () => {
      if (window.confirm(`Ștergi încărcarea elevului ${submission.studentName}? Elevul o poate lua de la capăt.`)) reset.mutate(submission.startedAt);
    },
  });

  return (
    <>
      <header className="submission-head">
        <div className="submission-title">
          <h1>{submission.studentName}</h1>
          <p className="submission-sub">
            <span>
              {submission.testCode} · {submission.testTitle} · {uploadStatusLabel(submission.status)}
            </span>
            {submission.autoSubmitted && submission.status !== 'graded' && <span className="tag">Fără confirmare</span>}
          </p>
          <p className="hint">
            Început {formatDateTime(submission.startedAt)}
            {submission.submittedAt && ` · trimis ${formatDateTime(submission.submittedAt)}`}
          </p>
        </div>
        <div className="submission-tools">
          <Link className="button-quiet button-small" to={`/elevi/${submission.studentId}`}>
            Toate notele elevului
          </Link>
          {pdfInput && (
            <PdfActions
              pdf={{
                build: () => studentPdf(pdfInput),
                fileName: studentPdfFileName(pdfInput),
                title: `${pdfInput.testCode} · ${pdfInput.studentName}`,
              }}
            />
          )}
          <PaperActionsMenu actions={paperActions} />
        </div>
      </header>
      {regrade.error && <ErrorMessage error={regrade.error} />}
      {reset.error && <ErrorMessage error={reset.error} />}
      {/* The result link only once the student sent the upload, like the
          uploads table: while uploading there is nothing to share yet. */}
      {submission.status !== 'uploading' && (
        <div className="result-link-row">
          <span className="result-link-label">Linkul cu rezultatul elevului</span>
          <span className={submission.resultsOpen ? 'tag tag-ok' : 'tag'}>
            {submission.resultsOpen ? 'Rezultatele sunt publicate.' : 'Rezultatele nu sunt publicate încă.'}
          </span>
          <ResultLink
            submissionId={submission.id}
            startedAt={submission.startedAt}
            resultToken={submission.resultToken}
            testCode={submission.testCode}
            studentName={submission.studentName}
          />
        </div>
      )}
      {/* The news after Recorectează or Reîncearcă holds only until the result is back. */}
      {actions.notice !== null && (submission.status === 'submitted' || submission.status === 'grading') && <p role="status">{actions.notice}</p>}
    </>
  );
}

type PaperAction = { label: string; hint: string; danger?: boolean; busy: boolean; onChoose: () => void };

// "Alte acțiuni": the rare actions that undo the teacher's work (Recorectează,
// Resetează), in a menu at the top of the page. Each item says what it
// deletes before it is chosen; choosing it still asks for a confirmation.
function PaperActionsMenu({ actions }: { actions: PaperAction[] }) {
  const { open, toggle, box, button } = useSmallMenu<HTMLDivElement>();
  const run = (action: PaperAction) => () => {
    toggle();
    button.current?.focus();
    action.onChoose();
  };
  return (
    <div className="paper-actions" ref={box}>
      <button
        ref={button}
        type="button"
        className="button-quiet button-small"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'paper-actions-menu' : undefined}
        onClick={toggle}
      >
        Alte acțiuni
        <svg className="paper-actions-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="class-menu paper-actions-menu" id="paper-actions-menu" role="menu" aria-label="Alte acțiuni">
          {actions.map((action, index) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={action.danger ? 'paper-action is-danger' : 'paper-action'}
              aria-label={action.label}
              aria-describedby={`paper-action-hint-${index}`}
              disabled={action.busy}
              onClick={run(action)}
            >
              <span className="paper-action-label">{action.label}</span>
              <span className="paper-action-hint" id={`paper-action-hint-${index}`}>
                {action.hint}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 64: Edit `src/admin/submissionPage/GradedResult.tsx`**

Find this block:

```tsx
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { EvaluationInfo, EvaluationItemInfo, ItemChange, SubmissionDetail } from '../../../shared/api.ts';
```

Replace it with:

```tsx
import { useMutation } from '@tanstack/react-query';
import { useState, type MouseEvent, type ReactNode } from 'react';
import type { EvaluationInfo, EvaluationItemInfo, ItemChange, SubmissionDetail } from '../../../shared/api.ts';
```

- [ ] **Step 65: Edit `src/admin/submissionPage/GradedResult.tsx`**

Find this block:

```tsx
type Correct = (itemId: number, change: ItemChange) => Promise<SubmissionDetail>;

```

Replace it with:

```tsx
type Correct = (itemId: number, change: ItemChange) => Promise<SubmissionDetail>;

// The paper page's hold on the rows (spec 2026-11-12 §4.4): the open row
// (an item's id, or "pagini" for the pages the robot could not read), a click
// that opens a row, only the rows to check, and the decision shown under the
// open row while it waits for a check. Without it the result is a plain list
// (the Quick Try's "Rezultatul profesorului").
export interface ItemsCheck {
  openKey: string | null;
  onOpen: (key: string) => void;
  onlyToCheck: boolean;
  decision: ReactNode;
}

// A click on a row opens it, unless it was on something of its own.
function rowClick(onOpen: (() => void) | undefined) {
  if (!onOpen) return undefined;
  return (event: MouseEvent<HTMLTableRowElement>) => {
    if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, label')) return;
    onOpen();
  };
}

```

- [ ] **Step 66: Edit `src/admin/submissionPage/GradedResult.tsx`**

Find this block:

```tsx
// result.
export function GradedResult({ submissionId, evaluation, onSaved }: { submissionId: number; evaluation: EvaluationInfo; onSaved: Saved }) {
  const api = useApi();
  const correct: Correct = (itemId, change) => api.correctItem(submissionId, itemId, { ...change, gradedAt: evaluation.gradedAt });
  return (
```

Replace it with:

```tsx
// result.
export function GradedResult({
  submissionId,
  evaluation,
  onSaved,
  check,
}: {
  submissionId: number;
  evaluation: EvaluationInfo;
  onSaved: Saved;
  check?: ItemsCheck;
}) {
  const api = useApi();
  const correct: Correct = (itemId, change) => api.correctItem(submissionId, itemId, { ...change, gradedAt: evaluation.gradedAt });
  const shown = check?.onlyToCheck
    ? evaluation.items.filter((item) => (item.needsReview && !item.reviewed) || String(item.id) === check.openKey)
    : evaluation.items;
  return (
```

- [ ] **Step 67: Edit `src/admin/submissionPage/GradedResult.tsx`**

Find this block:

```tsx
      </div>
      <UnreadablePages submissionId={submissionId} evaluation={evaluation} onSaved={onSaved} />

      <div className="table-wrap">
```

Replace it with:

```tsx
      </div>
      <UnreadablePages submissionId={submissionId} evaluation={evaluation} onSaved={onSaved} check={check} />

      {shown.length === 0 ? (
        <p className="hint">Niciun exercițiu de verificat în această lucrare.</p>
      ) : (
      <div className="table-wrap">
```

- [ ] **Step 68: Edit `src/admin/submissionPage/GradedResult.tsx`**

Find this block:

```tsx
          <tbody>
            {evaluation.items.map((item) => (
              <ItemRow key={item.id} item={item} correct={correct} onSaved={onSaved} />
            ))}
          </tbody>
```

Replace it with:

```tsx
          <tbody>
            {shown.map((item) => {
              const open = check !== undefined && String(item.id) === check.openKey;
              const deciding = open && item.needsReview && !item.reviewed && check.decision !== null;
              return (
                <ItemRows
                  key={item.id}
                  item={item}
                  correct={correct}
                  onSaved={onSaved}
                  open={open}
                  onOpen={check ? () => check.onOpen(String(item.id)) : undefined}
                  decision={deciding ? check.decision : null}
                />
              );
            })}
          </tbody>
```

- [ ] **Step 69: Edit `src/admin/submissionPage/GradedResult.tsx`**

Find this block:

```tsx
      </div>

      <FeedbackSections submissionId={submissionId} evaluation={evaluation} onSaved={onSaved} />
    </div>
```

Replace it with:

```tsx
      </div>
      )}

      {!check?.onlyToCheck && <FeedbackSections submissionId={submissionId} evaluation={evaluation} onSaved={onSaved} />}
    </div>
```

- [ ] **Step 70: Edit `src/admin/submissionPage/GradedResult.tsx`**

Find this block:

```tsx
// Pages that the robot could not read count as one item to check, until the
// teacher has looked at them.
function UnreadablePages({ submissionId, evaluation, onSaved }: { submissionId: number; evaluation: EvaluationInfo; onSaved: Saved }) {
  const api = useApi();
```

Replace it with:

```tsx
// Pages that the robot could not read count as one item to check, until the
// teacher has looked at them. On the paper page they open as a row does, and
// the open pages show the page's decision.
function UnreadablePages({
  submissionId,
  evaluation,
  onSaved,
  check,
}: {
  submissionId: number;
  evaluation: EvaluationInfo;
  onSaved: Saved;
  check?: ItemsCheck;
}) {
  const api = useApi();
```

- [ ] **Step 71: Edit `src/admin/submissionPage/GradedResult.tsx`**

Find this block:

```tsx
  const pages = evaluation.unreadable.map(pageLabel).join(', ');
  if (evaluation.pagesReviewed) return <p className="hint">Robotul nu a putut citi: {pages}. Ai verificat aceste pagini.</p>;
  return (
    <div className="warning">
      <p>Robotul nu a putut citi: {pages}. Verifică pozele și punctajele exercițiilor de pe ele.</p>
      <button type="button" className="button-quiet button-small" disabled={review.isPending} onClick={() => review.mutate()}>
        Am verificat paginile
      </button>
      {review.error && <ErrorMessage error={review.error} />}
```

Replace it with:

```tsx
  const pages = evaluation.unreadable.map(pageLabel).join(', ');
  if (evaluation.pagesReviewed) return check?.onlyToCheck ? null : <p className="hint">Robotul nu a putut citi: {pages}. Ai verificat aceste pagini.</p>;
  const open = check?.openKey === 'pagini';
  // The open pages' decision says the same words itself.
  const deciding = open && Boolean(check?.decision);
  return (
    <div className={open ? 'warning is-open' : 'warning'}>
      {!deciding && <p>Robotul nu a putut citi: {pages}. Verifică pozele și punctajele exercițiilor de pe ele.</p>}
      {check && !open && (
        <button type="button" className="button-quiet button-small" onClick={() => check.onOpen('pagini')}>
          Arată paginile
        </button>
      )}
      {check ? (
        open && check.decision
      ) : (
        <button type="button" className="button-quiet button-small" disabled={review.isPending} onClick={() => review.mutate()}>
          Am verificat paginile
        </button>
      )}
      {review.error && <ErrorMessage error={review.error} />}
```

- [ ] **Step 72: Edit `src/admin/submissionPage/GradedResult.tsx`**

Find this block:

```tsx

// One row of the exercises table. Modifică turns the points and the comment
```

Replace it with:

```tsx

// An exercise's row and, while it is open and waits for a check, the
// decision under it, across the whole table.
function ItemRows({
  item,
  correct,
  onSaved,
  open,
  onOpen,
  decision,
}: {
  item: EvaluationItemInfo;
  correct: Correct;
  onSaved: Saved;
  open: boolean;
  onOpen?: () => void;
  decision: ReactNode;
}) {
  return (
    <>
      <ItemRow item={item} correct={correct} onSaved={onSaved} open={open} onOpen={onOpen} deciding={decision !== null} />
      {decision !== null && (
        <tr className="item-decision">
          <td colSpan={6}>{decision}</td>
        </tr>
      )}
    </>
  );
}

// One row of the exercises table. Modifică turns the points and the comment
```

- [ ] **Step 73: Edit `src/admin/submissionPage/GradedResult.tsx`**

Find this block:

```tsx
// student's answer, and the robot's confidence while typing. Saving an item
// that waits for a check also checks it: the teacher has looked at it.
function ItemRow({ item, correct, onSaved }: { item: EvaluationItemInfo; correct: Correct; onSaved: Saved }) {
  const [editing, setEditing] = useState(false);
```

Replace it with:

```tsx
// student's answer, and the robot's confidence while typing. Saving an item
// that waits for a check also checks it: the teacher has looked at it. On the
// paper page a click on the row, or its "Arată pe lucrare", opens it: the
// paper shows its answer. While the open row's decision shows under it, the
// row has no "Verificat" of its own.
function ItemRow({
  item,
  correct,
  onSaved,
  open = false,
  onOpen,
  deciding = false,
}: {
  item: EvaluationItemInfo;
  correct: Correct;
  onSaved: Saved;
  open?: boolean;
  onOpen?: () => void;
  deciding?: boolean;
}) {
  const [editing, setEditing] = useState(false);
```

- [ ] **Step 74: Edit `src/admin/submissionPage/GradedResult.tsx`**

Find this block:

```tsx
  return (
    <tr className={toCheck ? 'is-flagged' : undefined}>
      <th scope="row" title={item.label}>
```

Replace it with:

```tsx
  return (
    <tr className={[toCheck ? 'is-flagged' : '', open ? 'is-open' : '', onOpen ? 'is-openable' : ''].filter(Boolean).join(' ') || undefined} onClick={rowClick(onOpen)}>
      <th scope="row" title={item.label}>
```

- [ ] **Step 75: Edit `src/admin/submissionPage/GradedResult.tsx`**

Find this block:

```tsx
                </p>
                <button
```

Replace it with:

```tsx
                </p>
                {!deciding && (
                <button
```

- [ ] **Step 76: Edit `src/admin/submissionPage/GradedResult.tsx`**

Find this block:

```tsx
                </button>
                {check.error && <ErrorMessage error={check.error} />}
```

Replace it with:

```tsx
                </button>
                )}
                {check.error && <ErrorMessage error={check.error} />}
```

- [ ] **Step 77: Edit `src/admin/submissionPage/GradedResult.tsx`**

Find this block:

```tsx
        ) : (
          <span className="row-actions">
            <button
              type="button"
```

Replace it with:

```tsx
        ) : (
          <span className="row-actions">
            {onOpen && (
              <button
                type="button"
                className="button-quiet button-small icon-button"
                aria-label={`Arată pe lucrare ${item.label}`}
                aria-pressed={open}
                title="Arată pe lucrare"
                onClick={onOpen}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
            )}
            <button
              type="button"
```

- [ ] **Step 78: Edit `src/admin/reviewPage/ReviewPhoto.tsx`**

Find this block:

```tsx
import type { AnswerArea } from '../../../shared/schemas.ts';
import { useMediaQuery } from '../../ui/useMediaQuery.ts';
```

Replace it with:

```tsx
import type { AnswerArea } from '../../../shared/schemas.ts';
import { formatFileSize } from '../../ui/format.ts';
import { useMediaQuery } from '../../ui/useMediaQuery.ts';
```

- [ ] **Step 79: Edit `src/admin/reviewPage/ReviewPhoto.tsx`**

Find this block:

```tsx
      <div className="review-photo-top">
        <figcaption>{caption}</figcaption>
        <div className="review-photo-actions">
```

Replace it with:

```tsx
      <div className="review-photo-top">
        <div className="review-photo-name">
          <figcaption>{caption}</figcaption>
          {/* The page's own file, as the student sent it. */}
          {file && (
            <span className="hint">
              {file.name} · {formatFileSize(file.size)}
            </span>
          )}
        </div>
        <div className="review-photo-actions">
```

- [ ] **Step 80: Create `src/admin/pages/PaperPage.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import type { ItemChange, ReviewPoint, SubmissionDetail, TestDetail } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { normalizeTestCode } from '../../../shared/tests.ts';
import { ApiError } from '../../ui/ApiError.ts';
import { useApi } from '../ApiContext.tsx';
import { Crumbs } from '../Crumbs.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { PaperHead, usePaperActions } from '../paperPage/PaperHead.tsx';
import { listedPapers, modeOf, paperPath, studentSpot, walkedPoints, type PaperMode, type PaperPlace, type PaperSpot } from '../paperPage/paths.ts';
import { PointDecision, type DecisionView } from '../paperPage/PointDecision.tsx';
import { StudentList } from '../paperPage/StudentList.tsx';
import { drawnAreas, saveFrames, savedFrames } from '../reviewPage/areas.ts';
import { isReviewKey } from '../reviewPage/keys.ts';
import { firstSpot, pageIndex, pointKey, pointQueue, stepPoint, withoutPoint, type QueuedPoint } from '../reviewPage/points.ts';
import { type ReviewFocus, ReviewPhoto } from '../reviewPage/ReviewPhoto.tsx';
import { stageHash } from '../stages.ts';
import { GradedResult } from '../submissionPage/GradedResult.tsx';
import { waitingText } from '../submissionPage/waitingText.ts';
import { NotFoundPage } from './NotFoundPage.tsx';
import { refreshInterval } from './TestPage.tsx';

// While the robot grades the upload, the page asks for news every 10 seconds.
export function resultRefreshInterval(submission: SubmissionDetail | undefined): number | false {
  if (!submission) return false;
  const waits = submission.status === 'grading' || (submission.status === 'submitted' && submission.testStatus === 'evaluating');
  return waits ? 10_000 : false;
}

// /teste/:code/elevi/:submissionId: the paper page (spec 2026-11-12 §4): the
// students, all the exercises of one student (or only the points to check),
// and the paper, side by side.
export function PaperPage() {
  const params = useParams();
  const code = normalizeTestCode(params.code ?? '');
  const submissionId = parsePositiveId(params.submissionId);
  if (code === null || submissionId === null) return <NotFoundPage />;
  return <PaperLoader key={code} code={code} place="app" submissionId={submissionId} />;
}

// /teste/:code/verificare in the teacher app: the paper page with only the
// points to check, at the paper and point the address names (`?lucrare=12&punct=34`),
// else at the first point. Before any paper is graded: the test's Verificare.
export function ReviewRedirect() {
  const code = normalizeTestCode(useParams().code ?? '');
  if (code === null) return <NotFoundPage />;
  return <RedirectLoader key={code} code={code} />;
}

function useTestDetail(code: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['test', code],
    queryFn: () => api.getTest(code),
    refetchInterval: (query) => refreshInterval(query.state.data?.test.status),
  });
}

// The spot an address of the review names, when the paper is of this test,
// else the first point (or the first graded paper).
function askedSpot(detail: TestDetail, params: URLSearchParams): PaperSpot | null {
  const asked = parsePositiveId(params.get('lucrare') ?? undefined);
  // (A student who sent nothing has no paper id: no address names that row.)
  const named = asked !== null && detail.uploads.some((row) => row.submissionId === asked);
  return named ? { submissionId: asked, key: params.get('punct') } : null;
}

function RedirectLoader({ code }: { code: string }) {
  const detail = useTestDetail(code);
  const [params] = useSearchParams();
  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.data === undefined) return <ErrorMessage error={detail.error} />;
  const spot = askedSpot(detail.data, params) ?? firstSpot(detail.data.uploads);
  if (spot === null) return <Navigate replace to={`/teste/${code}${stageHash('Verificare')}`} />;
  return <Navigate replace to={paperPath(code, 'app', spot, 'verificare')} />;
}

// A Quick Try's review (`/teste/:code/verificare` inside the try's router): the
// same page, for the try's one paper. An address that names no paper of this
// test is first written with the spot the page opens on, and only then is the
// paper drawn: no decision is made on a spot the address does not hold.
export function TryPaperPage() {
  const code = normalizeTestCode(useParams().code ?? '');
  if (code === null) return <NotFoundPage />;
  return <TryPaperLoader key={code} code={code} />;
}

function TryPaperLoader({ code }: { code: string }) {
  const detail = useTestDetail(code);
  const [params] = useSearchParams();
  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.data === undefined) return <ErrorMessage error={detail.error} />;
  const asked = askedSpot(detail.data, params);
  if (asked === null) {
    const opening = firstSpot(detail.data.uploads);
    if (opening !== null) return <Navigate replace to={paperPath(code, 'try', opening, modeOf(params, 'try'))} />;
    return (
      <section className="paper-page">
        <p className="hint">Nicio lucrare nu este corectată încă.</p>
        <Link to={`/teste/${code}${stageHash('Verificare')}`}>Înapoi la test</Link>
      </section>
    );
  }
  return <Paper code={code} place="try" submissionId={asked.submissionId} detail={detail.data} refreshError={detail.isRefetchError ? detail.error : null} />;
}

function PaperLoader({ code, place, submissionId }: { code: string; place: PaperPlace; submissionId: number }) {
  const detail = useTestDetail(code);
  if (detail.isPending) return <p>Se încarcă…</p>;
  // The address names a test the teacher does not have.
  if (detail.error instanceof ApiError && detail.error.status === 404) return <NotFoundPage />;
  // A failed first load has nothing to show; a failed refresh keeps the page.
  if (detail.data === undefined) return <ErrorMessage error={detail.error} />;
  return <Paper code={code} place={place} submissionId={submissionId} detail={detail.data} refreshError={detail.isRefetchError ? detail.error : null} />;
}

interface Decision {
  submission: SubmissionDetail;
  view: DecisionView;
  point: ReviewPoint | null;
  change: ItemChange;
}

// After a decision: the point that opens takes the focus on its heading, or,
// when the student has no point left, "Elevul următor". The address carries
// it: the page is drawn anew for another student.
type FocusTarget = 'point' | 'student';

function focusTargetOf(state: unknown): FocusTarget | null {
  const target = (state as { paperFocus?: unknown } | null)?.paperFocus;
  return target === 'point' || target === 'student' ? target : null;
}

// "Elevii" folded or not: the teacher's choice, kept in this browser.
const FOLD_KEY = 'quickeval:paperStudentsFolded';

function savedFold(): boolean {
  try {
    return localStorage.getItem(FOLD_KEY) === 'on';
  } catch {
    return false;
  }
}

function saveFold(folded: boolean): void {
  try {
    localStorage.setItem(FOLD_KEY, folded ? 'on' : 'off');
  } catch {
    // Storage can be blocked; the choice then lasts until the page reloads.
  }
}

function Paper({
  code,
  place,
  submissionId,
  detail,
  refreshError,
}: {
  code: string;
  place: PaperPlace;
  submissionId: number;
  detail: TestDetail;
  refreshError: Error | null;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const mode = modeOf(params, place);
  const key = params.get('punct');
  const spot: PaperSpot = { submissionId, key };
  const { test, uploads } = detail;
  const row = uploads.find((other) => other.submissionId === submissionId);
  const queue = pointQueue(uploads);
  const walked = walkedPoints(uploads, mode, submissionId);
  // The spot on the screen now, for a decision that comes back later.
  const shown = useRef(spot);
  useEffect(() => {
    shown.current = spot;
  });

  const paper = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => api.getSubmission(submissionId),
    refetchInterval: (query) => resultRefreshInterval(query.state.data),
  });
  const submission = paper.data;
  const evaluation = submission?.status === 'graded' ? (submission.evaluation ?? null) : null;

  // The list has another grading of the paper than the one read (it was graded
  // again; the list is read every 10 s while the robot works): read the paper
  // again, so its new result shows.
  const listGradedAt = row?.gradedAt ?? null;
  const stale = submission !== undefined && row !== undefined && listGradedAt !== (evaluation?.gradedAt ?? null);
  useEffect(() => {
    if (stale) void queryClient.invalidateQueries({ queryKey: ['submission', submissionId] }, { cancelRefetch: false });
  }, [stale, listGradedAt, submissionId, queryClient]);

  const actions = usePaperActions(code, submissionId);

  // The open row and what waits on it: an exercise to check, or the pages the
  // robot could not read.
  const item = key !== null && key !== 'pagini' ? evaluation?.items.find((other) => String(other.id) === key) : undefined;
  const decisionView: DecisionView | null =
    item && item.needsReview && !item.reviewed
      ? { kind: 'item', item }
      : key === 'pagini' && evaluation && evaluation.unreadable.length > 0 && !evaluation.pagesReviewed
        ? { kind: 'pages', pages: evaluation.unreadable }
        : null;

  // The answer of the open row, with the areas the page can draw.
  const [frames, setFrames] = useState(savedFrames);
  const focus: ReviewFocus | null =
    item && submission ? { key: `${submission.id}:${item.id}`, label: item.exerciseId, areas: drawnAreas(item.areas, submission.files) } : null;
  const onFrames = (on: boolean) => {
    setFrames(on);
    saveFrames(on);
  };

  // The page of the paper: the page of the first area of the open answer
  // (while its border shows), else the page of the answer, or the first page
  // the robot could not read, else page 1; a page the teacher chose stays
  // until the open row changes.
  const viewKey = `${submissionId}:${key ?? ''}`;
  const [pageChoice, setPageChoice] = useState<{ view: string; page: number } | null>(null);
  const pageCount = submission?.files.length ?? 0;
  const firstArea = frames ? focus?.areas[0] : undefined;
  const firstPage =
    key === 'pagini' && evaluation
      ? (pageIndex(evaluation.unreadable[0] ?? '') ?? 0)
      : firstArea
        ? firstArea.page - 1
        : item && item.page >= 1 && item.page <= pageCount
          ? item.page - 1
          : 0;
  const shownPage = pageChoice?.view === viewKey ? pageChoice.page : firstPage;

  const [folded, setFolded] = useState(savedFold);
  const onFold = (on: boolean) => {
    setFolded(on);
    saveFold(on);
  };

  // After a decision, the point that opens takes the focus on its heading,
  // without a scroll, once its paper shows; a move of the teacher's own is a
  // new address, without it. Each address gives the focus once.
  const main = useRef<HTMLDivElement>(null);
  const nextStudentButton = useRef<HTMLButtonElement>(null);
  const focused = useRef<string | null>(null);
  const focusTarget = focusTargetOf(location.state);
  useEffect(() => {
    if (focusTarget === null || focused.current === location.key) return;
    const target =
      focusTarget === 'point'
        ? submission?.id === submissionId
          ? main.current?.querySelector<HTMLElement>('.point-decision h2')
          : null
        : nextStudentButton.current;
    if (!target) return;
    focused.current = location.key;
    target.focus({ preventScroll: true });
  });

  const pathOf = (target: PaperSpot, toMode: PaperMode = mode) => paperPath(code, place, target, toMode);
  const go = (target: PaperSpot | null, toMode: PaperMode = mode, focus: FocusTarget | null = null) => {
    if (target === null) return;
    navigate(pathOf(target, toMode), { replace: true, state: focus === null ? null : { paperFocus: focus } });
  };
  const goPoint = (entry: QueuedPoint | null) => go(entry && { submissionId: entry.submissionId, key: pointKey(entry.point) });

  const refreshLists = async () => {
    void queryClient.invalidateQueries({ queryKey: ['tests'] });
    await queryClient.invalidateQueries({ queryKey: ['test', code] });
  };
  const saved = async (changed: SubmissionDetail) => {
    queryClient.setQueryData(['submission', changed.id], changed);
    await refreshLists();
  };

  // A decision on its way, known at once: `decide.isPending` changes only
  // with the next render, after a second press in the same moment.
  const deciding = useRef(false);
  const decide = useMutation({
    mutationFn: ({ submission: on, view, change }: Decision) => {
      const gradedAt = on.evaluation!.gradedAt;
      return view.kind === 'pages'
        ? api.reviewPages(on.id, { pagesReviewed: true, gradedAt })
        : api.correctItem(on.id, view.item.id, { ...change, reviewed: true, gradedAt });
    },
    onSuccess: (changed, { point }) => {
      queryClient.setQueryData(['submission', changed.id], changed);
      // The point leaves the list at once; the API is read again after.
      if (point) queryClient.setQueryData<TestDetail>(['test', code], (old) => old && withoutPoint(old, changed, point));
      void queryClient.invalidateQueries({ queryKey: ['tests'] });
      void queryClient.invalidateQueries({ queryKey: ['test', code] });
    },
    // A paper graded again in the meantime refuses the change: read it again.
    onError: (_error, { submission: on }) => {
      void queryClient.invalidateQueries({ queryKey: ['submission', on.id] });
      void queryClient.invalidateQueries({ queryKey: ['test', code] });
    },
    onSettled: () => {
      deciding.current = false;
    },
  });
  const failed = decide.variables;
  const decideError =
    decide.isError && failed && failed.submission.id === submissionId && (failed.view.kind === 'pages' ? key === 'pagini' : String(failed.view.item.id) === key)
      ? decide.error
      : null;

  // While only the points to check show, the next point opens, also on the
  // next student; with all the exercises, the next point of this student, and
  // when none is left the row stays open and "Elevul următor" takes the focus.
  const onDecide = (change: ItemChange) => {
    if (!submission || decisionView === null || decide.isPending || deciding.current) return;
    deciding.current = true;
    const from = spot;
    const fromMode = mode;
    const next = stepPoint(walked, spot, 1);
    const point = row?.reviewPoints.find((other) => pointKey(other) === key) ?? null;
    decide.mutate(
      { submission, view: decisionView, point, change },
      {
        // The next point opens only if the teacher is still at this one: not
        // after she opened another paper, and not after she left the page
        // (this call's own callbacks do not run once the page is gone).
        onSuccess: (changed) => {
          if (shown.current.submissionId !== from.submissionId || shown.current.key !== from.key) return;
          if (next) go({ submissionId: next.submissionId, key: pointKey(next.point) }, fromMode, 'point');
          else if (fromMode === 'verificare') go({ submissionId: changed.id, key: null });
          else go(from, fromMode, 'student');
        },
      },
    );
  };
  const nextPoint = stepPoint(walked, spot, 1);
  const previousPoint = stepPoint(walked, spot, -1);

  const students = listedPapers(uploads, mode);
  const at = students.findIndex((other) => other.submissionId === submissionId);
  const previousStudent = at > 0 ? students[at - 1] : undefined;
  const nextStudent = at >= 0 ? students[at + 1] : undefined;

  // A, J, K and 1–9, while the cursor is not in a field or in what opened from
  // the bars, and no decision is on its way. A key held down acts once: its
  // repeats would accept points the teacher never saw.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || !isReviewKey(event)) return;
      // While a decision is on its way, no key acts: the next point opens after it.
      if (decide.isPending) return;
      const pressed = event.key.toLowerCase();
      if (pressed === 'a' && decisionView !== null) onDecide({});
      else if (pressed === 'j') goPoint(stepPoint(walked, spot, 1));
      else if (pressed === 'k') goPoint(stepPoint(walked, spot, -1));
      else if (/^[1-9]$/.test(pressed) && submission && Number(pressed) <= submission.files.length) setPageChoice({ view: viewKey, page: Number(pressed) - 1 });
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The address names a paper of another test.
  if (submission !== undefined && submission.testCode !== code) return <NotFoundPage />;

  const decision =
    decisionView !== null && evaluation ? (
      <PointDecision evaluation={evaluation} view={decisionView} pending={decide.isPending} error={decideError} pageCount={pageCount} onDecide={onDecide} />
    ) : null;

  return (
    <section className={place === 'try' ? 'paper-page is-try' : 'paper-page'}>
      {place === 'app' ? (
        <Crumbs
          items={[
            { label: 'Teste', to: '/' },
            { label: displayClassName(test.className), to: `/clase/${test.classId}` },
            { label: test.title, to: `/teste/${code}` },
            { label: submission?.studentName ?? row?.studentName ?? 'Lucrarea' },
          ]}
        />
      ) : (
        <div className="review-head">
          <div>
            <h1>Verificare</h1>
            <p className="test-sub">
              {test.title}
              {submission && ` · ${submission.studentName}`}
            </p>
          </div>
          <Link className="button-quiet" to={`/teste/${code}${stageHash('Verificare')}`}>
            Înapoi la test
          </Link>
        </div>
      )}
      {refreshError && <ErrorMessage error={refreshError} />}
      {paper.isRefetchError && <ErrorMessage error={paper.error} />}
      {place === 'app' && submission !== undefined && <PaperHead submission={submission} actions={actions} />}
      <div className="paper-bar">
        <div className="paper-switch" role="group" aria-label="Exercițiile arătate">
          <button type="button" aria-pressed={mode === 'toate'} onClick={() => go(spot, 'toate')}>
            Toate exercițiile
          </button>
          <button type="button" aria-pressed={mode === 'verificare'} onClick={() => go(spot, 'verificare')}>
            Doar de verificat ({queue.length})
          </button>
        </div>
        <div className="review-actions">
          {mode === 'verificare' && previousPoint && (
            <button type="button" className="button-quiet" disabled={decide.isPending} onClick={() => goPoint(previousPoint)}>
              Punctul anterior
            </button>
          )}
          {mode === 'verificare' && nextPoint && (
            <button type="button" className="button" disabled={decide.isPending} onClick={() => goPoint(nextPoint)}>
              Următorul punct
            </button>
          )}
          {place === 'app' && previousStudent && (
            <button type="button" className="button-quiet" onClick={() => go(studentSpot(previousStudent, mode))}>
              Elevul anterior
            </button>
          )}
          {place === 'app' && nextStudent && (
            <button ref={nextStudentButton} type="button" className="button-quiet" onClick={() => go(studentSpot(nextStudent, mode))}>
              Elevul următor
            </button>
          )}
        </div>
      </div>
      {mode === 'verificare' && queue.length === 0 && (
        <p className="review-done" role="status">
          Toate punctele sunt verificate. <Link to={`/teste/${code}${stageHash('Rezultate')}`}>Mergi la Rezultate</Link>
        </p>
      )}
      <div className={place === 'try' ? 'paper-panes is-single' : folded ? 'paper-panes is-folded' : 'paper-panes'}>
        {place === 'app' && (
          <StudentList uploads={uploads} mode={mode} current={submissionId} folded={folded} onFold={onFold} pathOf={(other) => pathOf(studentSpot(other, mode))} />
        )}
        <div className="paper-main" ref={main}>
          <h2 className="sr-only">Exercițiile</h2>
          {submission === undefined ? (
            paper.isError ? (
              <ErrorMessage error={paper.error} />
            ) : (
              <p className="hint">Se încarcă lucrarea…</p>
            )
          ) : evaluation ? (
            <GradedResult
              submissionId={submission.id}
              evaluation={evaluation}
              onSaved={saved}
              check={{ openKey: key, onOpen: (open) => go({ submissionId, key: open }), onlyToCheck: mode === 'verificare', decision }}
            />
          ) : submission.status === 'failed' ? (
            <div className="warning">
              <p>Corectarea a eșuat. {submission.lastError}</p>
              {place === 'app' && (
                <button
                  type="button"
                  className="button-quiet button-small"
                  disabled={actions.retry.isPending}
                  onClick={() => actions.retry.mutate(submission.startedAt)}
                >
                  Reîncearcă
                </button>
              )}
              {actions.retry.error && <ErrorMessage error={actions.retry.error} />}
            </div>
          ) : (
            <p className="hint">{waitingText(submission)}</p>
          )}
        </div>
        {submission !== undefined && (
          <ReviewPhoto
            submission={submission}
            page={shownPage}
            onPage={(index) => setPageChoice({ view: viewKey, page: index })}
            focus={focus}
            frames={frames}
            onFrames={onFrames}
          />
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 81: Edit `src/admin/AppRoutes.tsx`**

Find this block:

```tsx
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { ReportPage } from './pages/ReportPage.tsx';
import { ReviewPage } from './pages/ReviewPage.tsx';
import { SearchPage } from './pages/SearchPage.tsx';
```

Replace it with:

```tsx
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { PaperPage, ReviewRedirect } from './pages/PaperPage.tsx';
import { ReportPage } from './pages/ReportPage.tsx';
import { SearchPage } from './pages/SearchPage.tsx';
```

- [ ] **Step 82: Edit `src/admin/AppRoutes.tsx`**

Find this block:

```tsx
import { StudentPage } from './pages/StudentPage.tsx';
import { SubmissionPage } from './pages/SubmissionPage.tsx';
import { TestPage } from './pages/TestPage.tsx';
```

Replace it with:

```tsx
import { StudentPage } from './pages/StudentPage.tsx';
import { TestPage } from './pages/TestPage.tsx';
```

- [ ] **Step 83: Edit `src/admin/AppRoutes.tsx`**

Find this block:

```tsx
        <Route path="teste/:code" element={<TestPage />} />
        <Route path="teste/:code/elevi/:submissionId" element={<SubmissionPage />} />
        <Route path="teste/:code/raport" element={<ReportPage />} />
        <Route path="teste/:code/verificare" element={<ReviewPage />} />
        <Route path="clase" element={<LastClassPage />} />
```

Replace it with:

```tsx
        <Route path="teste/:code" element={<TestPage />} />
        <Route path="teste/:code/elevi/:submissionId" element={<PaperPage />} />
        <Route path="teste/:code/raport" element={<ReportPage />} />
        <Route path="teste/:code/verificare" element={<ReviewRedirect />} />
        <Route path="clase" element={<LastClassPage />} />
```

- [ ] **Step 84: Edit `src/try/TryApp.tsx`**

Find this block:

```tsx
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { ReviewPage } from '../admin/pages/ReviewPage.tsx';
import { ApiError } from '../ui/ApiError.ts';
```

Replace it with:

```tsx
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { TryPaperPage } from '../admin/pages/PaperPage.tsx';
import { ApiError } from '../ui/ApiError.ts';
```

- [ ] **Step 85: Edit `src/try/TryApp.tsx`**

Find this block:

```tsx
// A Quick Try's page at /try/<token>: the try's states, and the teacher app's
// own review at /teste/<code>/verificare (its links to /teste/<code> come back
// here, and its link to the paper opens the teacher's result). `token` is null
// for an address that is not a try's link.
```

Replace it with:

```tsx
// A Quick Try's page at /try/<token>: the try's states, and the teacher app's
// own paper page at /teste/<code>/verificare (its links to /teste/<code> come
// back here; the try's own address for the page, which stays there). `token` is null
// for an address that is not a try's link.
```

- [ ] **Step 86: Edit `src/try/TryApp.tsx`**

Find this block:

```tsx
      <Route path="/teste/:code" element={home} />
      <Route path="/teste/:code/verificare" element={<ReviewPage />} />
      <Route path="/teste/:code/elevi/:id" element={<Navigate replace to={{ pathname: '/', hash: '#rezultate' }} />} />
```

Replace it with:

```tsx
      <Route path="/teste/:code" element={home} />
      <Route path="/teste/:code/verificare" element={<TryPaperPage />} />
      <Route path="/teste/:code/elevi/:id" element={<Navigate replace to={{ pathname: '/', hash: '#rezultate' }} />} />
```

- [ ] **Step 87: Delete `src/admin/pages/SubmissionPage.tsx`**

Run: `git rm src/admin/pages/SubmissionPage.tsx`

- [ ] **Step 88: Delete `src/admin/pages/ReviewPage.tsx`**

Run: `git rm src/admin/pages/ReviewPage.tsx`

- [ ] **Step 89: Delete `src/admin/reviewPage/ReviewQueue.tsx`**

Run: `git rm src/admin/reviewPage/ReviewQueue.tsx`

- [ ] **Step 90: Delete `src/admin/reviewPage/ReviewDecision.tsx`**

Run: `git rm src/admin/reviewPage/ReviewDecision.tsx`

- [ ] **Step 91: Edit `src/ui/brand.css`**

Find this block:

```css

/* The review of the points to check (redesign spec §7): the papers, the page
   of the paper and the decision side by side; below 1280px the papers go under
   the page, which keeps its width; on a phone one column, the decision first,
   then the page, and the papers last. */
.review-head {
```

Replace it with:

```css

/* The paper page (spec 2026-11-12 §4): the students, the exercises of one
   student and the paper side by side, the paper staying in view while the
   exercises scroll. The exercises get three fifths of the room left by the
   students, so the comments read on a laptop; the paper zooms. The students
   fold to a thin strip; a Quick Try's page has no students. Below 1200px the
   students go under the exercises; on a phone one column: the exercises, the
   paper, the students. */
.review-head {
```

- [ ] **Step 92: Edit `src/ui/brand.css`**

Find this block:

```css

.review-page > .alert,
.review-done {
```

Replace it with:

```css

.paper-page > .alert,
.review-done {
```

- [ ] **Step 93: Edit `src/ui/brand.css`**

Find this block:

```css

.review-panes {
  display: grid;
  grid-template-columns: minmax(200px, 240px) minmax(0, 1fr) minmax(360px, 432px);
  grid-template-areas: "queue photo decision";
  gap: 1rem;
```

Replace it with:

```css

/* The switch of the exercises shown, and the moves to another point or student. */
.paper-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
  margin: 1rem 0;
}

.paper-switch {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--control);
  border-radius: var(--radius);
}

.paper-switch button {
  padding: 0.4rem 0.9rem;
  border: 0;
  background: var(--sheet);
  color: var(--text);
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}

.paper-switch button + button {
  border-left: 1px solid var(--control);
}

.paper-switch button[aria-pressed="true"] {
  background: var(--ink);
  color: var(--on-ink);
  font-weight: 700;
}

.paper-panes {
  display: grid;
  grid-template-columns: 13rem minmax(0, 3fr) minmax(0, 2fr);
  grid-template-areas: "students main photo";
  gap: 1rem;
```

- [ ] **Step 94: Edit `src/ui/brand.css`**

Find this block:

```css

.review-queue,
.review-photo,
.review-decision,
.review-loading {
  min-width: 0;
```

Replace it with:

```css

.paper-panes.is-folded {
  grid-template-columns: 2.75rem minmax(0, 3fr) minmax(0, 2fr);
}

.paper-panes.is-single {
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  grid-template-areas: "main photo";
}

.paper-students,
.review-photo {
  min-width: 0;
```

- [ ] **Step 95: Edit `src/ui/brand.css`**

Find this block:

```css

.review-queue {
  grid-area: queue;
  padding: 0.75rem 0.5rem;
```

Replace it with:

```css

.paper-students {
  grid-area: students;
  padding: 0.75rem 0.5rem;
```

- [ ] **Step 96: Edit `src/ui/brand.css`**

Find this block:

```css

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
```

Replace it with:

```css

.paper-students.is-folded {
  padding: 0.5rem 0.25rem;
}

.paper-students-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0 0.5rem 0.5rem;
}

.paper-students.is-folded .paper-students-head {
  justify-content: center;
  margin: 0;
}

.paper-students-head h2 {
  margin: 0;
  font-size: 1rem;
}

.paper-main {
  grid-area: main;
  min-width: 0;
}

.paper-main .graded-result .table-wrap {
  overflow-x: auto;
}

/* The table fits its column: the comment takes the room left. */
.paper-main table.items {
  min-width: 0;
}

/* Under the teacher app's top bar (--top), which also stays on screen. */
.review-photo {
  grid-area: photo;
  position: sticky;
  top: calc(var(--top, 0px) + 0.75rem);
}
```

- [ ] **Step 97: Edit `src/ui/brand.css`**

Find this block:

```css
  gap: 0.5rem;
  margin: 0 0.5rem 0.25rem;
  color: var(--muted);
```

Replace it with:

```css
  gap: 0.5rem;
  margin: 0.75rem 0.5rem 0.25rem;
  color: var(--muted);
```

- [ ] **Step 98: Edit `src/ui/brand.css`**

Find this block:

```css

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
```

Replace it with:

```css

.paper-student-list {
  margin: 0;
```

- [ ] **Step 99: Edit `src/ui/brand.css`**

Find this block:

```css

.review-papers > li + li,
.review-others > li + li {
  border-top: 1px solid var(--line);
}

.review-queue a {
  display: block;
  border-radius: var(--radius);
  color: var(--text);
  text-decoration: none;
```

Replace it with:

```css

.paper-student-list a {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border-radius: var(--radius);
  color: var(--text);
  font-size: 0.875rem;
  text-decoration: none;
```

- [ ] **Step 100: Edit `src/ui/brand.css`**

Find this block:

```css

.review-queue a:hover {
  background: var(--raised);
```

Replace it with:

```css

.paper-student-list a:hover {
  background: var(--raised);
```

- [ ] **Step 101: Edit `src/ui/brand.css`**

Find this block:

```css

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
```

Replace it with:

```css

.paper-student-list a[aria-current="true"] {
  background: var(--active);
  font-weight: 700;
}

.paper-student-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.paper-student-flags {
  color: var(--orange);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
```

- [ ] **Step 102: Edit `src/ui/brand.css`**

Find this block:

```css

.review-points a {
  padding: 0.25rem 0.5rem 0.25rem 1rem;
  color: var(--orange);
  font-size: 0.875rem;
}

/* The points of a point to check, apart from its exercise: a grey label. */
.review-point-score {
  display: inline-block;
  padding: 0 0.3rem;
  border-radius: 4px;
  background: var(--active);
  color: var(--text);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 1.6;
  white-space: nowrap;
}

.review-queue a[aria-current="true"] {
  background: var(--marker);
  font-weight: 700;
}

.review-others a[aria-current="true"] {
  background: var(--active);
}
```

Replace it with:

```css

.paper-student-grade {
  font-variant-numeric: tabular-nums;
}

/* A row of the exercises opens with a click: the open row is marked blue, and
   its decision, while it waits for a check, sits under it across the table. */
table.items tr.is-openable {
  cursor: pointer;
}

table.items tr.is-open > * {
  box-shadow: inset 0 2px 0 var(--ink), inset 0 -2px 0 var(--ink);
}

table.items tr.is-open > th {
  box-shadow: inset 3px 0 0 var(--ink), inset 0 2px 0 var(--ink), inset 0 -2px 0 var(--ink);
}

table.items tr.item-decision > td {
  padding: 0.5rem 0.75rem 0.75rem;
  background: var(--marker);
}

.warning.is-open {
  box-shadow: inset 3px 0 0 var(--ink);
}
```

- [ ] **Step 103: Edit `src/ui/brand.css`**

Find this block:

```css
.review-photo figcaption {
  font-weight: 600;
}

```

Replace it with:

```css
.review-photo figcaption {
  font-weight: 600;
}

.review-photo-name {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-wrap: anywhere;
}

.review-photo-name .hint {
  font-size: 0.8125rem;
}

```

- [ ] **Step 104: Edit `src/ui/brand.css`**

Find this block:

```css

.review-decision h2 {
  margin: 0;
  font-size: 1.125rem;
}

.review-decision h3 {
  margin: 1.25rem 0 0.5rem;
  font-size: 0.9375rem;
}

/* The exercises' heading and "Deschide lucrarea" on one row. */
.review-exercises-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.25rem 1rem;
  margin: 1.25rem 0 0.5rem;
}

.review-exercises-head h3 {
  margin: 0;
}
```

Replace it with:

```css

.point-decision h2 {
  margin: 0;
  font-size: 1rem;
}
```

- [ ] **Step 105: Edit `src/ui/brand.css`**

Find this block:

```css
  gap: 0.25rem 1rem;
}
```

Replace it with:

```css
  gap: 0.25rem 1rem;
  margin-bottom: 0.5rem;
}
```

- [ ] **Step 106: Edit `src/ui/brand.css`**

Find this block:

```css
  margin: 0 0 0.5rem;
}

.review-why {
  color: var(--orange);
  font-weight: 700;
}
```

Replace it with:

```css
  margin: 0 0 0.5rem;
}
```

- [ ] **Step 107: Edit `src/ui/brand.css`**

Find this block:

```css

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
    grid-template-columns: minmax(0, 1fr) minmax(336px, 408px);
    grid-template-areas:
      "photo decision"
      "queue decision";
  }
```

Replace it with:

```css

@media (max-width: 75rem) {
  .paper-panes,
  .paper-panes.is-folded {
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    grid-template-areas:
      "main photo"
      "students photo";
  }
```

- [ ] **Step 108: Edit `src/ui/brand.css`**

Find this block:

```css
@media (max-width: 56.25rem) {
  .review-panes {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "decision"
      "photo"
      "queue";
  }
```

Replace it with:

```css
@media (max-width: 56.25rem) {
  .paper-panes,
  .paper-panes.is-folded,
  .paper-panes.is-single {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "main"
      "photo"
      "students";
  }

  .review-photo {
    position: static;
  }
```

- [ ] **Step 109: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `Crumbs.tsx` is the path at the top of the test page and of the paper page ("Teste › Clasa 7E2 › <test>", a `nav` "Unde ești"; the last step is the page itself, not a link). `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; once results are published (for all, or one alone), `StudentAccessCard.tsx`: where students find their results (the students' link with its QR code and "Descarcă codul QR", a PNG; the multi-upload link named "Doar pentru profesor", with no QR code; and the help text); the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the subject (`SubjectForm.tsx`: "Se stabilește la corectare" until the robot finds it, "Alege materia" or "Schimbă materia" opening the seven subjects in place (while the robot reads the test, only a line that says when the subject can change), with a line when the list is made again and the papers graded again), the files, the students' link while the test is a draft or open, rename, archive (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`), delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table (`UploadsTable.tsx`, the full width of its card: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off; a student who sent nothing is "Nu a trimis" while the uploads are open and "Nu a participat" after; after, an upload left open with files is "Așteaptă corectarea" and one with no file "Nu a participat"), "Recorectează tot"). `pages/ReviewPage.tsx` and `reviewPage/` are the review of the points to check (redesign spec §7, `/teste/:code/verificare`): the papers and their points (`ReviewQueue.tsx`), one page of the paper at a time (`ReviewPhoto.tsx`: a photo zooms inside the pane (a left click, a right click and the two buttons over the photo take one small step, out and in; two fingers pinch on a touch screen, and the wheel scrolls the page), a line over the page says what a click does until she zooms, in the words of the pointer at hand (a phone has no right button), and the point picked draws an orange border around the robot's area of its answer, on the whole page, because the page never zooms by itself; the border's arrows step through the parts of an answer, each part opening on its page, whole), and the decision (`ReviewDecision.tsx`: "Accept", the stepper and "Salvează", "Am verificat paginile", the paper's exercises). `points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first), steps between them, and writes the address (`?lucrare=&punct=`, replaced, never a new step in the history). The title row's "Punctul anterior" and "Următorul punct" step the queue both ways, each while a point waits in that direction. A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point; a refused one reads the paper and the test again. An address that names no paper of the test is rewritten first (`ReviewLoader` draws `<Navigate replace>` to `firstSpot()`), before any paper is drawn: a refresh never moves the spot, and no decision is made on a spot the address does not hold. The next point opens only if the teacher is still at the decided one (a call-level `onSuccess` of `mutate`, which does not run once the page is gone), and its heading takes the focus (`focus({ preventScroll: true })`). An address of a paper with no result now (graded again) shows that paper with the reason (`submissionPage/waitingText.ts`, shared with the paper page); when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A, J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). The page (`pages/SubmissionPage.tsx`) has a head (`.submission-head`: the name, the test and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right), then the strips of the result link and of the files, and the result. "Alte acțiuni" (`PaperActions`, `useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. An exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds only the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

Replace it with:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `Crumbs.tsx` is the path at the top of the test page and of the paper page ("Teste › Clasa 7E2 › <test>", a `nav` "Unde ești"; the last step is the page itself, not a link). `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; once results are published (for all, or one alone), `StudentAccessCard.tsx`: where students find their results (the students' link with its QR code and "Descarcă codul QR", a PNG; the multi-upload link named "Doar pentru profesor", with no QR code; and the help text); the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the subject (`SubjectForm.tsx`: "Se stabilește la corectare" until the robot finds it, "Alege materia" or "Schimbă materia" opening the seven subjects in place (while the robot reads the test, only a line that says when the subject can change), with a line when the list is made again and the papers graded again), the files, the students' link while the test is a draft or open, rename, archive (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`), delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table (`UploadsTable.tsx`, the full width of its card: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off; a student who sent nothing is "Nu a trimis" while the uploads are open and "Nu a participat" after; after, an upload left open with files is "Așteaptă corectarea" and one with no file "Nu a participat"), "Recorectează tot"). `pages/PaperPage.tsx` and `paperPage/` are the paper page (spec `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md` §4, `/teste/:code/elevi/:submissionId`): the path (`Crumbs`), the head (`PaperHead.tsx`: `.submission-head`, the name, the test, the state and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right; then the result link row; `usePaperActions` holds Recorectează, Resetează and Reîncearcă and the news after them), the switch "Toate exercițiile" / "Doar de verificat (N)" (N the points of the whole test; the view is in the address, `vedere=verificare`, and stays when she moves), "Punctul anterior" and "Următorul punct" (only the points to check), "Elevul anterior" and "Elevul următor", then three columns: "Elevii" (`StudentList.tsx`: every upload with a paper, the grade, the points to check in orange or the state; only the points to check: the papers with points first; it folds to a strip, kept in this browser as `quickeval:paperStudentsFolded`), the exercises (`GradedResult` with `check`: a click on a row or its "Arată pe lucrare" opens it, `?punct=<item id>` or `pagini`; "Doar de verificat" keeps only the rows to check and the open one, without the texts for the student; the open row to check shows `PointDecision.tsx` under it, region "Decizia": "Accept", the stepper and "Salvează", "Am verificat paginile", the total and what the grade becomes), and the paper (`reviewPage/ReviewPhoto.tsx`, staying in view: each page with its file's name and size, as the student sent it; a photo zooms inside the pane (a left click, a right click and the two buttons over the photo take one small step, out and in; two fingers pinch on a touch screen, and the wheel scrolls the page), a line over the page says what a click does until she zooms, in the words of the pointer at hand (a phone has no right button), and the open exercise draws an orange border around the robot's area of its answer, on the whole page, because the page never zooms by itself; the border's arrows step through the parts of an answer, each part opening on its page, whole). The exercises get three fifths of the room the students leave, the paper two; below 1200px the students go under the exercises, and below 900px one column: the exercises, the paper, the students. `paperPage/paths.ts` writes the addresses (replaced, never a new step in the history) and picks the students' order and the points J and K walk: every point of the test while only the points to check show, else the open student's. `reviewPage/points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first) and steps between them. The old address of the review, `/teste/:code/verificare?lucrare=&punct=`, opens the page with only the points to check (`ReviewRedirect`: the named paper and point, else `firstSpot()`, else the test's Verificare); every link to the points to check uses it (`reviewPath`). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point: with only the points to check, also on the next student; with all the exercises, the next point of the same student, and when none is left the row stays open and "Elevul următor" takes the focus. It moves only if the teacher is still at the decided point (a call-level `onSuccess` of `mutate`, which does not run once the page is gone). The shell draws the page anew for another address path (`ErrorBoundary key={location.pathname}`), so where the focus goes after a decision rides in the navigation state (`paperFocus`), given once per address. A refused decision reads the paper and the test again. A paper with no result now (uploading, sent, graded again) shows its pages and why (`submissionPage/waitingText.ts`), a failed one "Reîncearcă"; when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A (only on an open row to check), J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). "Alte acțiuni" (`useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. An exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell (not while its decision shows under it); the actions cell holds "Arată pe lucrare" (paper page only) and the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

- [ ] **Step 110: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `classPage/GradesTable.tsx` is the class page's grade table, in a card (students by tests, the oldest test on the left, a 156px column per test headed by its name and "date · state", orange when the test waits; a cell shows the grade, orange with a dot when points wait, the upload's state, or "—" when no paper was sent; the last row is "Media testului", no per-student average; draft and open tests keep a column; archived tests show only when asked). `classPage/ClassTests.tsx` is "Testele clasei", beside the table (under it below 1180px): the newest test first, each with its date, the papers sent, its stage (orange when it waits) and its one next step (from `testsPage/nextStep.ts`, the button that publishes the results included; filled blue when it waits), and the toggle "Arată și testele arhivate (n)" that reveals the archived tests in the table too. `classPage/ClassStudents.tsx` is the "Elevi" tab, one card split in two (stacked below 760px): the students on the left (search that ignores case and diacritics, orange dot when points wait, "+ Adaugă elevi"), the chosen student on the right (the first one at first; "Redenumește", "A plecat din clasă", "Șterge"; a table of the class's tests with the date, the points, the grade and "N puncte de verificat", the result ("Publicat", "Nepublicat" with "Copiază linkul", "După verificare", "Nu a trimis lucrarea."), and "Lucrarea"; link "Toate notele elevului, din toate clasele"). An archived class is the same page, read only (`readOnly` on `GradesTable`, `ClassTests` and `ClassStudents`): a strip "Clasă arhivată." with "Scoate din arhivă" above the head (one write with ⋯'s item), the tag "Arhivată" first in the facts, no "Test nou pentru această clasă", no "+ Adaugă elevi", no "Redenumește", "A plecat din clasă" or "Șterge" for a student, nothing orange, and "Raportul clasei" as each test's one step once a paper is graded; the one exception is an archived test with open results, which waits there as in "De făcut" (orange, "Oprește accesul", and the class's dot in "Schimbă clasa"). `classPage/ClassDialogs.tsx` holds the class page's dialogs: "Clasă nouă" (the name and the students, one per line, in one step; a class made before its students failed is not made twice), "Adaugă elevi" (early warnings for names already in the class or pasted twice), and the rename of a class or a student. They use `Modal.tsx`, the app's dialog: a title, ×, a dimmed backdrop, the focus on the first field and kept inside, Esc (in the capture phase, before a panel), and the focus back to the opener (or to `returnFocus` when the opener closed with its menu). `pages/ClassPage.tsx` is the class page (`/clase/:id`): the top line (the name, "Schimbă clasa" with the classes of the year, the current one marked, a dot for one that waits, the archived classes last in their muted group "Arhivate" (the only list that leads to them; an archived class's ⋯ has "Scoate din arhivă"), and "+ Clasă nouă"; the facts; "Test nou pentru această clasă"; ⋯ with "Redenumește clasa"/"Arhivează clasa", which asks first through `ArchiveDialog` when a test of the class has open results) and the two tabs ("Elevi" with its count). `pages/LastClassPage.tsx` is `/clase`: it opens the last class the teacher saw (kept in `localStorage` as `quickeval:lastClass`, else the first active one of the year), or, with no active class, offers "+ Clasă nouă" and links the archived classes. A link's state (`ClassLinkState`) goes on to that class page: `{ newClass: true }` (the panel's "+ Clasă nouă") opens that dialog on arrival, `{ archived: true }` (the panel's "Arhivate (n)") opens "Schimbă clasa" at "Arhivate". The old "page with all classes" (`ClassesPage`) and `ClassStudentsPage` no longer exist.
- The CES variant: `CesTag.tsx` is the mark next to a CES student's name in every teacher table that lists students (the class page's two tabs, the papers table, the links table, the class report, the review queue, the search, the student page's heading); Fișa testului lists the CES files; "De făcut" (`shell/todo.ts`) also asks to check a generated CES barem, or to generate it again (`TestSummary.cesBarem`), after the class barem's case and until the test is done; `testPage/CesVariant.tsx` holds "Varianta CES" in Pregătire (shown while the class has a CES student or the variant has a file: the CES students and the switch "Test separat pentru elevii cu CES" (`CesSwitch.tsx`, also on Test nou; off asks first when there are CES files, then removes them through `setCesOff`), its own `TestFiles` with `variant="ces"` while the switch is on, the total warning, and "Șterge varianta CES" only once the class has no CES student left) and the notice of the CES papers that wait for their barem in Corectare (`CesWaiting`); `testPage/variant.ts` picks a variant's parts of a test. What a draft or open test misses (`missing.ts`) is said in the stages, in "De făcut", as orange "lipsește" (and green "gata") marks in `TestFiles`, and as `MissingList.tsx` under "Începe testul" (with why each part matters) and under "Creează testul". `TestFiles`, `useGeneratedBarem`, `PrintTest` and `ExerciseListBanner` take `variant`. The class report, its CSV and the class PDF draw the tables of `reportTables` (`shared/stats.ts`): one, or the class papers then the CES papers with their own exercises; the CSV never names CES.
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `testPage/StagePanel.tsx` (the panel În clasă) holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
```

Replace it with:

```markdown
- `classPage/GradesTable.tsx` is the class page's grade table, in a card (students by tests, the oldest test on the left, a 156px column per test headed by its name and "date · state", orange when the test waits; a cell shows the grade, orange with a dot when points wait, the upload's state, or "—" when no paper was sent; the last row is "Media testului", no per-student average; draft and open tests keep a column; archived tests show only when asked). `classPage/ClassTests.tsx` is "Testele clasei", beside the table (under it below 1180px): the newest test first, each with its date, the papers sent, its stage (orange when it waits) and its one next step (from `testsPage/nextStep.ts`, the button that publishes the results included; filled blue when it waits), and the toggle "Arată și testele arhivate (n)" that reveals the archived tests in the table too. `classPage/ClassStudents.tsx` is the "Elevi" tab, one card split in two (stacked below 760px): the students on the left (search that ignores case and diacritics, orange dot when points wait, "+ Adaugă elevi"), the chosen student on the right (the first one at first; "Redenumește", "A plecat din clasă", "Șterge"; a table of the class's tests with the date, the points, the grade and "N puncte de verificat", the result ("Publicat", "Nepublicat" with "Copiază linkul", "După verificare", "Nu a trimis lucrarea."), and "Lucrarea"; link "Toate notele elevului, din toate clasele"). An archived class is the same page, read only (`readOnly` on `GradesTable`, `ClassTests` and `ClassStudents`): a strip "Clasă arhivată." with "Scoate din arhivă" above the head (one write with ⋯'s item), the tag "Arhivată" first in the facts, no "Test nou pentru această clasă", no "+ Adaugă elevi", no "Redenumește", "A plecat din clasă" or "Șterge" for a student, nothing orange, and "Raportul clasei" as each test's one step once a paper is graded; the one exception is an archived test with open results, which waits there as in "De făcut" (orange, "Oprește accesul", and the class's dot in "Schimbă clasa"). `classPage/ClassDialogs.tsx` holds the class page's dialogs: "Clasă nouă" (the name and the students, one per line, in one step; a class made before its students failed is not made twice), "Adaugă elevi" (early warnings for names already in the class or pasted twice), and the rename of a class or a student. They use `Modal.tsx`, the app's dialog: a title, ×, a dimmed backdrop, the focus on the first field and kept inside, Esc (in the capture phase, before a panel), and the focus back to the opener (or to `returnFocus` when the opener closed with its menu). `pages/ClassPage.tsx` is the class page (`/clase/:id`): the top line (the name, "Schimbă clasa" with the classes of the year, the current one marked, a dot for one that waits, the archived classes last in their muted group "Arhivate" (the only list that leads to them; an archived class's ⋯ has "Scoate din arhivă"), and "+ Clasă nouă"; the facts; "Test nou pentru această clasă"; ⋯ with "Redenumește clasa"/"Arhivează clasa", which asks first through `ArchiveDialog` when a test of the class has open results) and the two tabs ("Elevi" with its count). `pages/LastClassPage.tsx` is `/clase`: it opens the last class the teacher saw (kept in `localStorage` as `quickeval:lastClass`, else the first active one of the year), or, with no active class, offers "+ Clasă nouă" and links the archived classes. A link's state (`ClassLinkState`) goes on to that class page: `{ newClass: true }` (the panel's "+ Clasă nouă") opens that dialog on arrival, `{ archived: true }` (the panel's "Arhivate (n)") opens "Schimbă clasa" at "Arhivate". The old "page with all classes" (`ClassesPage`) and `ClassStudentsPage` no longer exist.
- The CES variant: `CesTag.tsx` is the mark next to a CES student's name in every teacher table that lists students (the class page's two tabs, the papers table, the links table, the class report, the paper page's students, the search, the student page's heading); Fișa testului lists the CES files; "De făcut" (`shell/todo.ts`) also asks to check a generated CES barem, or to generate it again (`TestSummary.cesBarem`), after the class barem's case and until the test is done; `testPage/CesVariant.tsx` holds "Varianta CES" in Pregătire (shown while the class has a CES student or the variant has a file: the CES students and the switch "Test separat pentru elevii cu CES" (`CesSwitch.tsx`, also on Test nou; off asks first when there are CES files, then removes them through `setCesOff`), its own `TestFiles` with `variant="ces"` while the switch is on, the total warning, and "Șterge varianta CES" only once the class has no CES student left) and the notice of the CES papers that wait for their barem in Corectare (`CesWaiting`); `testPage/variant.ts` picks a variant's parts of a test. What a draft or open test misses (`missing.ts`) is said in the stages, in "De făcut", as orange "lipsește" (and green "gata") marks in `TestFiles`, and as `MissingList.tsx` under "Începe testul" (with why each part matters) and under "Creează testul". `TestFiles`, `useGeneratedBarem`, `PrintTest` and `ExerciseListBanner` take `variant`. The class report, its CSV and the class PDF draw the tables of `reportTables` (`shared/stats.ts`): one, or the class papers then the CES papers with their own exercises; the CSV never names CES.
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `testPage/StagePanel.tsx` (the panel În clasă) holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
```

- [ ] **Step 111: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `upload/`: the student app. A kept result link (`ResultLinkBox`) shows its whole address as text that wraps, never in a field that cuts it off: students keep it as a screenshot. `api.ts` (the only code that calls `/api/u`, with XMLHttpRequest for upload progress), `session.ts` (the phone's secret in localStorage), `shrink.ts` (photos made smaller on the phone). `StudentResult.tsx` takes `fileUrl`, so a Quick Try's page shows the same student result. `StudentHeader.tsx` is the header of both student pages (the site's lockup linking to mqgrader.ro, "Despre", the theme button). `ResultActions.tsx`: "Trimite linkul" (share sheet, else copy, else the link as text) and "Descarcă PDF" (the teacher's student PDF, from `studentPdfInputFromResult`; pdfmake stays a lazy import).
- `try/`: a Quick Try's page (`/try/<token>`, spec `docs/superpowers/specs/2026-11-09-quick-try-design.md` §3.3). It reuses the teacher app through `createApiClient({ base: '/api/try/<token>' })`: the calls and the file links (`AdminApi.base`) go to the try's link, and only the calls of the server's allow-list are used (`TRY_ADMIN_CALLS` in `test/fakeTryApi.tsx`, whose `tryAdminApi()` makes a page test fail on any other call). `api.ts` is the try's own client (`info`, the student's pages, `start`, the student `result`). `phase.ts` says where the try stands from its test (`prepare`, `grading`, `problem`, `failed` as the server's give-back, `graded`), reads it again every 10 s while the robot works, and gives the graded paper's grade (`scoreOf`, also used by the landing card). `TryHead.tsx` is the head of every state: the name with its rename, the times, the subject ("Materia: …", read only: a try has no "Schimbă"), the test and barem to download, "Distribuie". `Prepare.tsx` holds the test, the barem (her own, or the robot's to download, then "Pornește corectarea" with its `filesVersion`), the student's pages and the file changes left; `Working.tsx` the grading, the barem's problem ("Folosește oricum" or another barem) and the failure (no retry); `Graded.tsx` the grade and the points to check, then the three views under tabs that stay at the top (`try-tabs`, the page's own; `try.css` keeps the scrollbar's room so views of any height start at the same place): "Verificare" (the points to check, each opening the teacher app's own `ReviewPage` at `/teste/<code>/verificare` inside the try's router; its links to `/teste/<code>` come back to the try, `#rezultate` opens the teacher's result), "Rezultatul profesorului" (`GradedResult`, with `PageFiles` in `FilesBeside`) and "Rezultatul elevului" (`StudentResult`, checked with `expectNoGradingWords()`). `ui/FilesBeside.tsx` is the paper's files strip that opens them left of the result, first on the teacher's paper page, on both try results and on the student's result; `try.css` gives the try's top bar the shell's `--bar` and `--top`, and `--top` on `.try-panel` sticks the shown files under the tabs. "Distribuie" (`Share.tsx`) shares or copies the try's link. The page never shows the test's upload link or a QR code.
- `test/`: test setup, the fake APIs (`fakeApi.ts`, `fakeUploadApi.ts`; `createFakeApi({ me, accounts })` sets the logged-in teacher, an administrator by default), `renderAdmin()`, `expectNoGradingWords()`.
```

Replace it with:

```markdown
- `upload/`: the student app. A kept result link (`ResultLinkBox`) shows its whole address as text that wraps, never in a field that cuts it off: students keep it as a screenshot. `api.ts` (the only code that calls `/api/u`, with XMLHttpRequest for upload progress), `session.ts` (the phone's secret in localStorage), `shrink.ts` (photos made smaller on the phone). `StudentResult.tsx` takes `fileUrl`, so a Quick Try's page shows the same student result. `StudentHeader.tsx` is the header of both student pages (the site's lockup linking to mqgrader.ro, "Despre", the theme button). `ResultActions.tsx`: "Trimite linkul" (share sheet, else copy, else the link as text) and "Descarcă PDF" (the teacher's student PDF, from `studentPdfInputFromResult`; pdfmake stays a lazy import).
- `try/`: a Quick Try's page (`/try/<token>`, spec `docs/superpowers/specs/2026-11-09-quick-try-design.md` §3.3). It reuses the teacher app through `createApiClient({ base: '/api/try/<token>' })`: the calls and the file links (`AdminApi.base`) go to the try's link, and only the calls of the server's allow-list are used (`TRY_ADMIN_CALLS` in `test/fakeTryApi.tsx`, whose `tryAdminApi()` makes a page test fail on any other call). `api.ts` is the try's own client (`info`, the student's pages, `start`, the student `result`). `phase.ts` says where the try stands from its test (`prepare`, `grading`, `problem`, `failed` as the server's give-back, `graded`), reads it again every 10 s while the robot works, and gives the graded paper's grade (`scoreOf`, also used by the landing card). `TryHead.tsx` is the head of every state: the name with its rename, the times, the subject ("Materia: …", read only: a try has no "Schimbă"), the test and barem to download, "Distribuie". `Prepare.tsx` holds the test, the barem (her own, or the robot's to download, then "Pornește corectarea" with its `filesVersion`), the student's pages and the file changes left; `Working.tsx` the grading, the barem's problem ("Folosește oricum" or another barem) and the failure (no retry); `Graded.tsx` the grade and the points to check, then the three views under tabs that stay at the top (`try-tabs`, the page's own; `try.css` keeps the scrollbar's room so views of any height start at the same place): "Verificare" (the points to check, each opening the teacher app's own paper page (`TryPaperPage`) at `/teste/<code>/verificare?lucrare=&punct=` inside the try's router, with only the points to check by default (`vedere=toate` shows all), and without the students, the path, the head's actions, the result link and "Reîncearcă", whose routes the try's allow-list does not have; its links to `/teste/<code>` come back to the try, `#rezultate` opens the teacher's result), "Rezultatul profesorului" (`GradedResult`, with `PageFiles` in `FilesBeside`) and "Rezultatul elevului" (`StudentResult`, checked with `expectNoGradingWords()`). `ui/FilesBeside.tsx` is the paper's files strip that opens them left of the result, on both try results and on the student's result; `try.css` gives the try's top bar the shell's `--bar` and `--top`, and `--top` on `.try-panel` sticks the shown files under the tabs. "Distribuie" (`Share.tsx`) shares or copies the try's link. The page never shows the test's upload link or a QR code.
- `test/`: test setup, the fake APIs (`fakeApi.ts`, `fakeUploadApi.ts`; `createFakeApi({ me, accounts })` sets the logged-in teacher, an administrator by default), `renderAdmin()`, `expectNoGradingWords()`.
```

- [ ] **Step 112: Edit `src/AGENTS.md`**

Find this block:

```markdown
- Page tests that check a navigation use `expectLocation()`: it waits, because the navigation follows the API answer. `LocationProbe` shows the path, the search and the hash.
- The review draws its right pane anew while another paper loads: after a move to another paper, its tests find the pane again through `screen`, not through an element found before the move. `reviewPointsOf()` in `test/fakeApi.ts` makes an upload row's `reviewPoints` from a fake evaluation, and the fake API keeps them in step after every correction.
- The test page draws only the panel of the chosen stage. Its page tests open a stage by its address (`/teste/6E2-26T1#corectare`) or by its link in the list of stages (`openStage()` in `TestPage.test.tsx`). Without an address the page opens on the current stage of `stagesOf()`: fake data with no test file opens on Pregătire, an open test with its files on În clasă, a done test with points to check on Verificare, a done test with none on Rezultate (which has the links table, not the papers table: a test of the papers table opens `#corectare`). Fișa testului is a region beside every panel: its students' link, its "Copiază linkul" and its buttons are found from any stage.
```

Replace it with:

```markdown
- Page tests that check a navigation use `expectLocation()`: it waits, because the navigation follows the API answer. `LocationProbe` shows the path, the search and the hash.
- The paper page is drawn anew for another student: after a move to another paper, its tests find the decision again through `screen`, not through an element found before the move. `PaperPage.test.tsx` covers the head, the states and the corrections; `PaperCheck.test.tsx` the points to check, the switch, the keys, the zoom and the borders. `reviewPointsOf()` in `test/fakeApi.ts` makes an upload row's `reviewPoints` from a fake evaluation, and the fake API keeps them in step after every correction.
- The test page draws only the panel of the chosen stage. Its page tests open a stage by its address (`/teste/6E2-26T1#corectare`) or by its link in the list of stages (`openStage()` in `TestPage.test.tsx`). Without an address the page opens on the current stage of `stagesOf()`: fake data with no test file opens on Pregătire, an open test with its files on În clasă, a done test with points to check on Verificare, a done test with none on Rezultate (which has the links table, not the papers table: a test of the papers table opens `#corectare`). Fișa testului is a region beside every panel: its students' link, its "Copiază linkul" and its buttons are found from any stage.
```

- [ ] **Step 113: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown

The page `/admin/teste/:code/verificare` (decision 28): three panes in one panel.
```

Replace it with:

```markdown

Replaced by `2026-11-12-one-page-paper-check-design.md` §4: the points to check are a view of the paper page, and this address opens it.

The page `/admin/teste/:code/verificare` (decision 28): three panes in one panel.
```

- [ ] **Step 114: Edit `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md`**

Find this block:

```markdown

Below 900 px: one column, as the review today: the open exercise (or the student's head) first, then the paper, then the exercises, then the students.

```

Replace it with:

```markdown

The exercises get three fifths of the width the students leave, the paper two fifths (it zooms), so the comments read on a 1366 px laptop. Below 1200 px the students go under the exercises. Below 900 px: one column: the exercises (with the open one's decision under its row), then the paper, then the students.

```

- [ ] **Step 115: Edit `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md`**

Find this block:

```markdown

Today's `ReviewPhoto`, unchanged in behaviour: one page at a time, the page switch, zoom and drag, "Arată chenarul", the border with its parts, a PDF in a frame.

```

Replace it with:

```markdown

Today's `ReviewPhoto`, unchanged in behaviour: one page at a time, the page switch, zoom and drag, "Arată chenarul", the border with its parts, a PDF in a frame. Under the caption, the page's file name and size ("IMG_0001.jpg · 820 KB"), as the paper's page listed them.

```

- [ ] **Step 116: Edit `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md`**

Find this block:

```markdown

- "Toate exercițiile" or "Doar de verificat (N)". The choice is kept in the browser and stays when she moves to another student or another test. *(Builder's call; the user did not confirm it.)*
- "Verifică" and "Începe verificarea" on the test page, the "Decide" links of the Verificare panel and the old `/verificare` address open the page in "Doar de verificat".
```

Replace it with:

```markdown

- "Toate exercițiile" or "Doar de verificat (N)". The choice is in the address (`vedere=verificare`; the place's own view is left out): it stays when she moves to another student and after a reload, and each link decides how the page opens ("Vezi lucrarea" with all the exercises, "Verifică" and the points' links with only the points to check). *(Builder's call, changed while building from "kept in the browser": a choice kept in the browser would make "Vezi lucrarea" open with only the points to check, against §5.3.)*
- "Verifică" and "Începe verificarea" on the test page, the "Decide" links of the Verificare panel and the old `/verificare` address open the page in "Doar de verificat".
```

- [ ] **Step 117: Run the typecheck and the whole suite**

Run: `npm run typecheck`
Expected: no output after the command line (exit code 0).

Run: `npm test`
Expected: `Test Files  178 passed | 1 skipped (179)`, `Tests  2682 passed | 3 skipped (2685)` (the same three times more, and once with `TZ=UTC`).

- [ ] **Step 118: Commit**

```bash
git add src/admin/pages/PaperPage.test.tsx src/admin/pages/PaperCheck.test.tsx src/admin/cesMarks.test.tsx src/try/Graded.test.tsx src/admin/paperPage/paths.ts src/admin/paperPage/PointDecision.tsx src/admin/paperPage/StudentList.tsx src/admin/paperPage/PaperHead.tsx src/admin/pages/PaperPage.tsx src/admin/submissionPage/GradedResult.tsx src/admin/reviewPage/ReviewPhoto.tsx src/admin/AppRoutes.tsx src/try/TryApp.tsx src/ui/brand.css src/AGENTS.md docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md
git commit -m "Check a paper on one page: the students, all the exercises and the paper side by side"
```

(`git mv` and `git rm` already staged the moved and deleted files.)

Run: `git diff --stat refs/protopc/p3 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

### After Task 3: Look at it

- [ ] **Step 1: The production build and the smoke test**

Run: `npm run db:local`, then `npm run preview` in one terminal and `npm run smoke` in another.
Expected: every check PASS except the four "content page /ghid/ … says who wrote it and when" checks (`/ghid/`, `/barem/`, `/despre/`, `/preturi/`), which fail on the base commit too; this plan does not touch those pages or `scripts/smoke.mjs`.

- [ ] **Step 2: The page in a browser, on a laptop width**

Open a graded test's papers at http://127.0.0.1:8788/teacher/ on a 1366 × 768 window: the test page's path and bar; "Verifică" opens the first point with only the points to check; "Toate exercițiile" shows every row; a click on a row moves the paper to its page with the border; "Accept" opens the next point. Stop the preview after (`AGENTS.md`, Gotchas: a `workerd.exe` left on port 8788).

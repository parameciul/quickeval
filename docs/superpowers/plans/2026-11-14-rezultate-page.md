# MQGrader: the Rezultate panel, design C3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The panel Rezultate of the test page says in its full width what each student gets, puts publishing at the top in one box that names the two ways students find their results, shows the students beside "Raportul clasei" (the main button; the CSV a quiet text button), and the papers tables of Rezultate and Corectare look like the points table of Verificare, with each grade in a chip of the class report's colours and no bold.

**Architecture:** Front end only: no API, database or robot change, no migration. Task 1 draws both papers tables (`UploadsTable.tsx` in Corectare, `ResultLinksTable.tsx` in Rezultate) like Verificare's points table, puts the grade right after the name as a `GradeChip` (`pointsLevel(grade, 10)` → `.points-N`) and the points to check in an orange label. Task 2 gives Rezultate its new sentence (the stage sentence takes the full width in every stage), drops the repeated paragraph and "Pentru tine", and puts the table beside the new `ReportCard.tsx` (the average in its colour, the grades by group from `gradeGroups` in `shared/stats.ts`, "Deschide raportul", "CSV pentru catalog"), side by side only when the panel is wide (a container query). Task 3 turns `ResultsAccess.tsx` into the box at the top: grey while nothing is published, green once students can read results, with the two ways numbered and the test's link for the students (QR, copy, PNG, full screen); `StudentAccessCard.tsx` and its teacher's multi-upload link leave Rezultate.

**Tech Stack:** Node 24, TypeScript, React 19, React Router, TanStack Query, `qrcode.react`, Vitest, Testing Library. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-14-rezultate-page-design.md` (approved by the user on 2026-11-14). The tasks change it where building it settled a builder's call (listed under "Rulings made while planning"). Root `AGENTS.md` and `src/AGENTS.md` hold the project rules. The mockup the user chose from (design "C3 · Cele două căi") is `docs/design-proposals/rezultate-designs.html`, git-ignored, on the user's PC only.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- The brand is flat: `src/ui/brand.css` has no `gradient(` (`src/ui/brand.test.ts` checks it). The dark colours are written twice; this plan adds no colour token. Orange (`--orange`, `.points-pill`) is only for what waits on the teacher: a grade's colour never replaces the "de verificat" label.
- These pages are the teacher's only. No student page, student PDF or CSV changes; no page reads more from D1 (the report card uses the uploads list the page has).
- Do not run Prettier or any formatter.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A`.
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root, on the branch that holds this plan. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy. If only tests of those three files time out, or of `server/routes/evaluation.test.ts`, `server/routes/runner.test.ts` and `runner/tasks.test.ts` (an `ECONNRESET` or an `internal` answer from the local worker on a busy PC), run the failed files alone with `npx vitest run <files>`; the full run then counts as passed when its failed and passed tests add up to the expected passed number.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; write exactly the content given in place of all of it.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- **Delete** `path`: run `git rm <path>`.
- The expected test totals are exact for the branch alone. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/protorz/r1` to `refs/protorz/r3`, one per task, on `refs/protorz/rzbase` (the files of `d75c398` and the spec: the same files as the commit that adds the spec and this plan, without the plan). After Task N, `git diff --stat refs/protorz/rN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`).

## Rulings made while planning

Settled while building and looking at the prototype on 2026-11-14 (1440 px, 1024 px and a 375 px phone, light and dark). The tasks write them into the spec; the user checks them when reading.

1. **The grade comes right after the name in both tables**, so its colour is read first: Rezultate "Elev, Nota, Punctaj, Linkul cu rezultatul, Stare"; Corectare "Elev, Nota, Stare, Fișiere, Ora, De verificat" (the mockup's order).
2. **The chip takes its colour from `.points-N`** (`pointsLevel(grade, 10)`, the class report's scale) and its tint from that colour (`color-mix(in srgb, currentColor 14%, transparent)`): no new colour token. The points to check are the existing orange `.points-pill`: "2 de verificat" beside the chip in Rezultate, the count alone in Corectare's "De verificat" column.
3. **A name that opens the paper reads as a name** (the text colour, weight 500), blue and underlined under the pointer.
4. **"Raportul clasei" counts like the class report:** the average is `test.averageGrade` (the same number as Fișa testului's "Media testului"); the bars count every paper graded now, a student who left the class too; "N din M elevi corectați" counts the active students, as the report's "Corectate" tile.
5. **The panel's width decides where the card goes,** not the screen's: a container query on `.results-layout` (56 rem) puts the card in an 18 rem column beside the table; in a narrower panel (a phone, a 1024 px laptop) the card goes above the table, full width. In the page's order the card comes first, so a keyboard and a screen reader reach it before the rows of the table (on a wide panel it is placed in the second column with `grid-column`, not `order`).
6. **The green box shows whenever students can read results** (`resultsOpen`, or `publishedCount > 0`, the old card's rule). With only some results published one by one its heading says "Unele rezultate sunt publicate. Elevii le văd în două feluri:" and its button is "Publică toate rezultatele" (with the warning about points to check). The two numbered ways are the message: no extra sentence repeats them. While all are published, the old hint about stopping stays under the heading.
7. **The test's link for the students sits in the second way** only when the test has it (`uploadToken`): the small QR (88 px), "Copiază linkul" (a refused copy shows the link in a field, selected), "Descarcă codul QR" and "Arată codul QR pe tot ecranul" (closing gives the focus back to the button).
8. **On a phone each row stays a card, as today**: the name, then each cell under its caption, the grade ("Nota") first. The spec first said the chip sits on the name's line; the cards already read well at 375 px, so the spec now says what is built.

## Review Focus

1. A test whose results are open while nothing is graded now (graded all again) keeps the green box with "Oprește accesul la rezultate" and a report card that waits for the first grading (Task 2, "puts "Raportul clasei" before the students in the page, and says when it comes before any grading"; the existing "keeps the stop button while the results are open and nothing is graded…").
2. Only some results published one by one: the box is green, says "Unele rezultate…", and offers "Publică toate rezultatele", never "Oprește accesul" (Task 3, "says when only some results are published, and offers to publish them all").
3. An older test with no students' link names the second way without any link button or QR code (Task 3, "names the second way without a link when the test has none").
4. A student who left the class with a graded paper counts in the grade groups but not in "N din M elevi corectați" (Task 2, "shows "Raportul clasei" once a paper is graded…").
5. A grade's colour never says "wait": a low grade (2,5–4,99, an orange-brown) and the orange "de verificat" label stay two things in the same cell (Task 1, "shows each grade in a chip of its grade colour, with the points to check apart, and nothing in bold").

---

### Before Task 1: The branch

- [ ] **Step 1: Check the branch and the prototype**

Run: `git status --short` and `git log --oneline -3`
Expected: nothing changed; HEAD is the commit that adds the spec and this plan, on top of `d75c398 Merge pull request #91 …`.

Run: `git rev-parse --verify refs/protorz/r3`
Expected: a commit id. If the ref does not exist, stop and ask: the prototype's refs come with this plan.

### Task 1: The papers tables look like Verificare's, with grade chips

Both papers tables get the light look of Verificare's points table and no bold; the grade comes right after the name, in a chip of the class report's colours; the points to check stay an orange label.

**Files:**
- Create: `src/admin/testPage/GradeChip.tsx`
- Modify: `src/admin/testPage/UploadsTable.tsx`, `src/admin/testPage/ResultLinksTable.tsx`, `src/ui/brand.css`, `src/AGENTS.md`, `docs/superpowers/specs/2026-11-14-rezultate-page-design.md`
- Test: `src/admin/testPage/ResultsPanel.test.tsx`, `src/admin/pages/TestPage.test.tsx`, `src/ui/brand.test.ts`

**Interfaces:**
- Consumes: `pointsLevel(points, maxPoints)` (`src/ui/format.ts`), `formatPoints` (`shared/scoring.ts`), the `.points-1` … `.points-5` and `.points-pill` classes of `brand.css`.
- Produces: `export function GradeChip({ grade }: { grade: number })` in `src/admin/testPage/GradeChip.tsx`, a `span.grade-chip.points-N` with the grade as `formatPoints` writes it.

- [ ] **Step 1: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx
    expect(within(row('Stan Eva')).getAllByText('—')).toHaveLength(2);
  });
```

Replace it with:

```tsx
    expect(within(row('Stan Eva')).getAllByText('—')).toHaveLength(2);
  });

  it('shows each grade in a chip of its grade colour, with the points to check apart, and nothing in bold', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9.5, total: 95, maxTotal: 100, flagCount: 2 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 4, total: 40, maxTotal: 100 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan', submissionId: 7, status: 'graded', fileCount: 1, grade: 2, total: 20, maxTotal: 100 }),
    ];
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    const table = await screen.findByRole('table', { name: 'Linkurile cu rezultatele elevilor' });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Elev', 'Nota', 'Punctaj', 'Linkul cu rezultatul', 'Stare']);
    expect(within(row('Pop Ion')).getByText('9,5')).toHaveClass('grade-chip', 'points-5');
    expect(within(row('Pop Ion')).getByText('2 de verificat')).toHaveClass('points-pill');
    expect(within(row('Stan Eva')).getByText('4')).toHaveClass('grade-chip', 'points-2');
    expect(within(row('Stan Eva')).queryByText(/de verificat/)).not.toBeInTheDocument();
    expect(within(row('Marin Dan')).getByText('2')).toHaveClass('grade-chip', 'points-1');
    expect(table.querySelector('strong, b')).toBeNull();
  });
```

- [ ] **Step 2: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
      .map((cell) => cell.getAttribute('data-label'));
    expect(labels).toEqual([null, 'Stare', 'Fișiere', 'Ora', 'Nota', 'De verificat', null]);
  });
```

Replace it with:

```tsx
      .map((cell) => cell.getAttribute('data-label'));
    expect(labels).toEqual([null, 'Nota', 'Stare', 'Fișiere', 'Ora', 'De verificat', null]);
  });

  it('shows the grades of Corectare in chips of their colour, the points to check in an orange label, and nothing in bold', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, flagCount: 2 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 6.5 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
    ];
    renderAdmin(`${PAGE}#corectare`, createFakeApi({ classes: [], students: {}, tests: [fakeTest({ status: 'done' }, rows)] }));
    const table = await screen.findByRole('table', { name: 'Încărcările elevilor' });
    const pop = within(table).getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    expect(within(pop).getByText('9')).toHaveClass('grade-chip', 'points-5');
    expect(pop.querySelector('[data-label="De verificat"] .points-pill')).toHaveTextContent('2');
    const stan = within(table).getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    expect(within(stan).getByText('6,5')).toHaveClass('grade-chip', 'points-3');
    expect(stan.querySelector('[data-label="De verificat"]')).toHaveTextContent('—');
    const marin = within(table).getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
    expect(marin.querySelector('[data-label="Nota"]')).toHaveTextContent('—');
    expect(table.querySelector('strong, b')).toBeNull();
  });
```

- [ ] **Step 3: Edit `src/ui/brand.test.ts`**

Find this block:

```ts

  it('is flat: no gradient, no notebook grid', () => {
```

Replace it with:

```ts

  it('draws the papers tables as the points table of Verificare, with no bold', () => {
    expect(value(declarations('table.uploads thead th'), 'font-weight')).toBe('500');
    expect(value(declarations('table.uploads thead th'), 'background')).toBe('var(--raised)');
    expect(value(declarations('table.uploads tbody th'), 'font-weight')).toBe('500');
    expect(value(declarations('.grade-chip'), 'font-weight')).toBe('500');
    expect(value(declarations('  table.uploads tbody td[data-label]::before'), 'font-weight')).toBe('500');
  });

  it('is flat: no gradient, no notebook grid', () => {
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx vitest run src/admin/testPage/ResultsPanel.test.tsx src/admin/pages/TestPage.test.tsx src/ui/brand.test.ts`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  4 failed | 176 passed (180)`: both tables keep the old column order and plain grades (`expected [ 'Elev', 'Punctaj', 'Nota', …(2) ] to deeply equal [ 'Elev', 'Nota', 'Punctaj', …(2) ]`, `expected [ null, 'Stare', 'Fișiere', …(4) ] to deeply equal [ null, 'Nota', 'Stare', …(4) ]`, `expect(element).toHaveClass("grade-chip points-5")`), and `brand.css` has no such rules yet (`expected undefined to be '500'`). The other tests of the three files pass.

- [ ] **Step 5: Create `src/admin/testPage/GradeChip.tsx`**

```tsx
import { formatPoints } from '../../../shared/scoring.ts';
import { pointsLevel } from '../../ui/format.ts';

// A grade in a soft chip of its colour, read at a glance: the scale of the
// class report's points (`.points-N`, 9-10 dark green down to red under 2,5).
// Never bold. Points still to check stay in their own orange label, next to
// the chip: a grade's colour never says that something waits.
export function GradeChip({ grade }: { grade: number }) {
  return <span className={`grade-chip points-${pointsLevel(grade, 10)}`}>{formatPoints(grade)}</span>;
}
```

- [ ] **Step 6: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
import type { RobotStart, UploadRow } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatDateTime, modelCell, uploadStatusLabel } from '../../ui/format.ts';
```

Replace it with:

```tsx
import type { RobotStart, UploadRow } from '../../../shared/api.ts';
import { formatDateTime, modelCell, uploadStatusLabel } from '../../ui/format.ts';
```

- [ ] **Step 7: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
import { useSmallMenu } from '../shell/useSmallMenu.ts';
import { heldBackHint, PAPER_PART_LABEL } from './paperCounts.ts';
```

Replace it with:

```tsx
import { useSmallMenu } from '../shell/useSmallMenu.ts';
import { GradeChip } from './GradeChip.tsx';
import { heldBackHint, PAPER_PART_LABEL } from './paperCounts.ts';
```

- [ ] **Step 8: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
// Who uploaded what: one row per student of the class, with the grade once
// the robot graded it. The table takes the full width of its card; the model
// of a grading, when the setting shows it, is one line of the row's ⋯ menu. While the uploads are open, the teacher selects the
```

Replace it with:

```tsx
// Who uploaded what: one row per student of the class, with the grade once
// the robot graded it, next to the name, in its colour, as in the table of
// Rezultate. The table takes the full width of its card; the model
// of a grading, when the setting shows it, is one line of the row's ⋯ menu. While the uploads are open, the teacher selects the
```

- [ ] **Step 9: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
            <th scope="col">Elev</th>
            <th scope="col">Stare</th>
```

Replace it with:

```tsx
            <th scope="col">Elev</th>
            <th scope="col">Nota</th>
            <th scope="col">Stare</th>
```

- [ ] **Step 10: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
            <th scope="col">Ora</th>
            <th scope="col">Nota</th>
            <th scope="col">De verificat</th>
```

Replace it with:

```tsx
            <th scope="col">Ora</th>
            <th scope="col">De verificat</th>
```

- [ ] **Step 11: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
      </th>
      <td data-label="Stare">
```

Replace it with:

```tsx
      </th>
      <td data-label="Nota">{row.grade === null ? '—' : <GradeChip grade={row.grade} />}</td>
      <td data-label="Stare">
```

- [ ] **Step 12: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
      <td data-label="Ora">{time ? formatDateTime(time) : '—'}</td>
      <td data-label="Nota">{row.grade === null ? '—' : formatPoints(row.grade)}</td>
      <td data-label="De verificat">{row.flagCount > 0 ? row.flagCount : '—'}</td>
      <td className="actions-cell">
```

Replace it with:

```tsx
      <td data-label="Ora">{time ? formatDateTime(time) : '—'}</td>
      <td data-label="De verificat">{row.flagCount > 0 ? <span className="points-pill">{row.flagCount}</span> : '—'}</td>
      <td className="actions-cell">
```

- [ ] **Step 13: Edit `src/admin/testPage/ResultLinksTable.tsx`**

Find this block:

```tsx
import { ErrorMessage } from '../ErrorMessage.tsx';

```

Replace it with:

```tsx
import { ErrorMessage } from '../ErrorMessage.tsx';
import { GradeChip } from './GradeChip.tsx';

```

- [ ] **Step 14: Edit `src/admin/testPage/ResultLinksTable.tsx`**

Find this block:

```tsx
// The students' result links in the panel Rezultate (redesign spec §8): a row
// for each student, with the points, the grade, the link to copy, and whether
// the result is published. Only a graded paper can be published alone; one
```

Replace it with:

```tsx
// The students' result links in the panel Rezultate (redesign spec §8): a row
// for each student, with the grade (in its colour, read first, with the points
// still to check apart), the points, the link to copy, and whether
// the result is published. Only a graded paper can be published alone; one
```

- [ ] **Step 15: Edit `src/admin/testPage/ResultLinksTable.tsx`**

Find this block:

```tsx
            <th scope="col">Elev</th>
            <th scope="col">Punctaj</th>
            <th scope="col">Nota</th>
            <th scope="col">Linkul cu rezultatul</th>
```

Replace it with:

```tsx
            <th scope="col">Elev</th>
            <th scope="col">Nota</th>
            <th scope="col">Punctaj</th>
            <th scope="col">Linkul cu rezultatul</th>
```

- [ ] **Step 16: Edit `src/admin/testPage/ResultLinksTable.tsx`**

Find this block:

```tsx
      </th>
      <td data-label="Punctaj">{points}</td>
      <td data-label="Nota">{graded && row.grade !== null ? <strong>{formatPoints(row.grade)}</strong> : '—'}</td>
      <td className="result-link-cell">
```

Replace it with:

```tsx
      </th>
      <td data-label="Nota">
        {graded && row.grade !== null ? (
          <>
            <GradeChip grade={row.grade} />
            {row.flagCount > 0 && <span className="points-pill">{row.flagCount} de verificat</span>}
          </>
        ) : (
          '—'
        )}
      </td>
      <td data-label="Punctaj">{points}</td>
      <td className="result-link-cell">
```

- [ ] **Step 17: Edit `src/ui/brand.css`**

Find this block:

```css

table.uploads {
```

Replace it with:

```css

/* The papers tables of Corectare and Rezultate look like the points table
   of Verificare: small grey column names on a light band, thin lines, a
   light row under the pointer, and no bold. */
.table-wrap.uploads-wrap {
  border: 1px solid var(--rule);
  border-radius: var(--radius-panel);
}

table.uploads {
```

- [ ] **Step 18: Edit `src/ui/brand.css`**

Find this block:

```css
table.uploads td {
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid var(--rule);
  text-align: left;
```

Replace it with:

```css
table.uploads td {
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--line);
  text-align: left;
```

- [ ] **Step 19: Edit `src/ui/brand.css`**

Find this block:

```css
table.uploads thead th {
  color: var(--muted);
  font-size: 0.9rem;
}
```

Replace it with:

```css
table.uploads thead th {
  border-bottom: 1px solid var(--rule);
  background: var(--raised);
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
}
```

- [ ] **Step 20: Edit `src/ui/brand.css`**

Find this block:

```css
table.uploads tbody th {
  font-weight: 700;
}
```

Replace it with:

```css
table.uploads tbody th {
  font-weight: 500;
}

table.uploads tbody tr:last-child > * {
  border-bottom: 0;
}

table.uploads tbody tr:hover > * {
  background: var(--raised);
}

/* A student's name that opens the paper reads as a name: the link shows
   under the pointer. */
table.uploads tbody th a {
  color: var(--text);
  text-decoration: none;
}

table.uploads tbody th a:hover {
  color: var(--ink);
  text-decoration: underline;
}

/* A grade, coloured by the class report's scale (.points-N gives the
   colour): the number on a soft tint of the same colour. */
.grade-chip {
  display: inline-block;
  min-width: 2.75rem;
  padding: 0 0.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 14%, transparent);
  font-weight: 500;
  text-align: center;
  white-space: nowrap;
}

/* The points to check next to a grade in Rezultate. */
table.uploads .grade-chip + .points-pill {
  margin-left: 0.4rem;
  font-size: 0.8125rem;
}
```

- [ ] **Step 21: Edit `src/ui/brand.css`**

Find this block:

```css
  .table-wrap.uploads-wrap {
    overflow-x: visible;
  }

```

Replace it with:

```css
  .table-wrap.uploads-wrap {
    overflow-x: visible;
    border: 0;
    border-radius: 0;
  }

```

- [ ] **Step 22: Edit `src/ui/brand.css`**

Find this block:

```css
    display: block;
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 700;
  }

  /* "Linkurile elevilor" in short cards: the points and the grade side by
```

Replace it with:

```css
    display: block;
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 500;
  }

  table.uploads tbody tr:hover > * {
    background: none;
  }

  /* "Linkurile elevilor" in short cards: the points and the grade side by
```

- [ ] **Step 23: Edit `src/ui/brand.css`**

Find this block:

```css
    font-size: 1rem;
    font-weight: 700;
  }
```

Replace it with:

```css
    font-size: 1rem;
    font-weight: 500;
  }
```

- [ ] **Step 24: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, filled orange (`.button button-wait`) for the one main action of a screen whose work waits on the teacher ("Începe verificarea" in Verificare), and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `Crumbs.tsx` is the path at the top of the test page and of the paper page ("Teste › Clasa 7E2 › <test>", a `nav` "Unde ești"; the last step is the page itself, not a link). `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă and Corectare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; once results are published (for all, or one alone), `StudentAccessCard.tsx`: where students find their results (the students' link with its QR code and "Descarcă codul QR", a PNG; the multi-upload link named "Doar pentru profesor", with no QR code; and the help text); the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the subject (`SubjectForm.tsx`: "Se stabilește la corectare" until the robot finds it, "Alege materia" or "Schimbă materia" opening the seven subjects in place (while the robot reads the test, only a line that says when the subject can change), with a line when the list is made again and the papers graded again), the files, the students' link while the test is a draft or open, rename, archive (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`), delete), the overview of Verificare (`ReviewOverview.tsx`: the graded papers that had points, counted with `flagCount` and `checkedCount`; "<checked> din <total> verificate", its bar, "Mai sunt …" and the orange "Începe verificarea" (nothing checked yet) or "Continuă verificarea" into the paper page at the first point left; "De verificat", a label per student with points left ("<checked>/<total>", opening that student's first point), and "Gata", a label per student done (opening the paper with all its exercises); once all is checked a green box with "Mergi la Rezultate" (the panel then leaves out "Următoarea etapă"), and "Nimic de verificat." when no graded paper had a point; CES as the other tables show it (`ces` or `variant === 'ces'`), in the label's accessible name too; no papers table and no list of the points: the paper page decides them), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page learns the answer from the version check of the shell), the uploads table (`UploadsTable.tsx`, the full width of its card: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off; a student who sent nothing is "Nu a trimis" while the uploads are open and "Nu a participat" after; after, an upload left open with files is "Așteaptă corectarea" and one with no file "Nu a participat"), "Recorectează tot"). `pages/PaperPage.tsx` and `paperPage/` are the paper page (spec `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md` §4, `/teste/:code/elevi/:submissionId`): the path (`Crumbs`), the head (`PaperHead.tsx`: `.submission-head`, the name, the test, the state and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right; then the result link row; `usePaperActions` holds Recorectează, Resetează and Reîncearcă and the news after them), the switch "Toate exercițiile" / "Doar de verificat (N)" (N the points of the whole test; the view is in the address, `vedere=verificare`, and stays when she moves), then the moves, small and on one row also on a phone: "‹ Punct 3/47 ›" (a group "Punctele de verificat", only the points to check: the arrows are "Punctul anterior" and "Următorul punct", the blue one, with the key in their tooltip, and between them the open point's place among the points J and K walk), "‹ Elev ›" (a group "Elevii", "Elevul anterior" and "Elevul următor"; an arrow with nowhere to go is off) and "Lucrarea" (a picture icon, pressed while the paper shows, which hides it or shows it again), then three columns: "Elevii" (`StudentList.tsx`: every upload with a paper, the grade, the points to check in orange or the state; only the points to check: the papers with points first; a name opens that paper at the top of the window; it folds to a strip, kept in this browser as `quickeval:paperStudentsFolded`), the exercises (`GradedResult` with `check`: a click on a row or its "Arată pe lucrare" opens it, `?punct=<item id>` or `pagini`, and a second click on the open row closes it, after `CLOSE_DELAY` (300 ms), so the first click of a double or triple click, which selects a word to copy, never closes it (a click that ends a selection of the row's text does nothing); a row to check stays open when a click opens another row (`keptKeys`, kept in `Paper` until the teacher closes or checks it, none for another paper; only a click on a row, its "Verifică" or its "Arată pe lucrare" keeps it, `paperKeep` in the navigation state, never J, K or the buttons), so the rows under it never move: its decision stays in place, dimmed, `inert` and `aria-hidden` (`DecisionSlot`), and a click on its row or its "Verifică" opens it again; the A key and the focus after a decision reach only the open row's slot (`.decision-slot.is-current`); "Doar de verificat" keeps only the rows to check and the open one, without the texts for the student; a row to check is calm: its points in a soft orange label (`.points-pill`) and one "Verifică" icon button that opens it (an orange magnifier with a check, like the pencil, its word in its name and tooltip), with no reason in the row; the open row to check shows `PointDecision.tsx` under it, region "Decizia", in a box with a light orange border: the robot's reason, "Accept <points>" (the robot's points), the stepper (− and + move by 0,5 on the 0,05 steps, between 0 and the maximum; any value in steps of 0,05 can be typed) and "Salvează", and what the grade becomes with another value; for the pages, the reason and "Am verificat paginile"; while a decision shows, the bar names the keys between the switch and the moves, only when the whole line fits there (`.review-keys`: a one-line wrapping box whose line wraps out of sight)), and the paper (`reviewPage/ReviewPhoto.tsx`, staying in view and level with the other two columns; its × button ("Ascunde lucrarea", top right) hides it, the exercises taking its room, and the focus goes to "Lucrarea" in the bar; the choice is kept in this browser as `quickeval:paperPhotoFolded`; a graded paper with nothing left to check opens with it hidden (chosen when the paper opens, from its upload row), and its toggles there are not saved; graded again, it shows as the saved choice says; while it is folded, 1–9 do nothing and the bar does not name them, and "Arată pe lucrare" shows it again (an open row stays open): each page with "2/3" beside the name and its file's name and size, as the student sent it; over the photo, a floating bar on the top left holds "Arată chenarul" (an orange dashed-frame toggle, while the open answer has an area) and "Toată pagina" (off while the page is whole), and the zoom's − and + float alone on the top right; a photo zooms inside the pane (a left click, a right click and the two buttons over the photo take one small step, out and in; two fingers pinch on a touch screen, and the wheel scrolls the page), a line over the page says what a click does until she zooms, in the words of the pointer at hand (a phone has no right button), and the open exercise draws an orange border around the robot's area of its answer, on the whole page, because the page never zooms by itself; the border's arrows step through the parts of an answer, each part opening on its page, whole). The exercises get three fifths of the room the students leave, the paper two; below 1200px the students go under the exercises, and below 900px one column: the exercises, the paper, the students. `paperPage/paths.ts` writes the addresses (replaced, never a new step in the history) and picks the students' order and the points J and K walk: every point of the test while only the points to check show, else the open student's. `reviewPage/points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first) and steps between them. The old address of the review, `/teste/:code/verificare?lucrare=&punct=`, opens the page with only the points to check (`ReviewRedirect`: the named paper and point, else `firstSpot()`, else the test's Verificare); every link to the points to check uses it (`reviewPath`). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point: with only the points to check, also on the next student; with all the exercises, the next point of the same student, and when none is left the row stays open and "Elevul următor" takes the focus. It moves only if the teacher is still at the decided point (a call-level `onSuccess` of `mutate`, which does not run once the page is gone). The shell draws the page anew for another address path (`ErrorBoundary key={location.pathname}`), so where the focus goes after a decision rides in the navigation state (`paperFocus`), given once per address. A new address path opens at the top of the window (`Layout.tsx`, a PUSH only): a replaced one (the paper page's moves) keeps its place, and Back or Forward leave it to the browser. A refused decision reads the paper and the test again. The papers the teacher can move to next (the next and the previous student, the next point's paper) are read ahead, so another student's page shows at once; while a paper loads, its place keeps a screen's height. A paper with no result now (uploading, sent, graded again) shows its pages and why (`submissionPage/waitingText.ts`), a failed one "Reîncearcă"; when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A (presses "Accept" of an open row to check), J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). "Alte acțiuni" (`useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. Points are never bold. Without the paper page (no page uses that plain list now), an exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds "Verifică" or "Arată pe lucrare" (paper page only) and the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

Replace it with:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, filled orange (`.button button-wait`) for the one main action of a screen whose work waits on the teacher ("Începe verificarea" in Verificare), and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `Crumbs.tsx` is the path at the top of the test page and of the paper page ("Teste › Clasa 7E2 › <test>", a `nav` "Unde ești"; the last step is the page itself, not a link). `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă and Corectare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; once results are published (for all, or one alone), `StudentAccessCard.tsx`: where students find their results (the students' link with its QR code and "Descarcă codul QR", a PNG; the multi-upload link named "Doar pentru profesor", with no QR code; and the help text); the students' result links in `ResultLinksTable.tsx`, with the grade right after the name (a `GradeChip`, with its points still to check beside it in an orange label), the points, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the subject (`SubjectForm.tsx`: "Se stabilește la corectare" until the robot finds it, "Alege materia" or "Schimbă materia" opening the seven subjects in place (while the robot reads the test, only a line that says when the subject can change), with a line when the list is made again and the papers graded again), the files, the students' link while the test is a draft or open, rename, archive (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`), delete), the overview of Verificare (`ReviewOverview.tsx`: the graded papers that had points, counted with `flagCount` and `checkedCount`; "<checked> din <total> verificate", its bar, "Mai sunt …" and the orange "Începe verificarea" (nothing checked yet) or "Continuă verificarea" into the paper page at the first point left; "De verificat", a label per student with points left ("<checked>/<total>", opening that student's first point), and "Gata", a label per student done (opening the paper with all its exercises); once all is checked a green box with "Mergi la Rezultate" (the panel then leaves out "Următoarea etapă"), and "Nimic de verificat." when no graded paper had a point; CES as the other tables show it (`ces` or `variant === 'ces'`), in the label's accessible name too; no papers table and no list of the points: the paper page decides them), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page learns the answer from the version check of the shell), the uploads table (`UploadsTable.tsx`, the full width of its card; the grade right after the name, a `GradeChip.tsx`: the grade in a soft chip of the class report's colours, `.points-N` of `pointsLevel(grade, 10)`; "De verificat" in an orange label; both papers tables are drawn like the points table of Verificare, with no bold: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off; a student who sent nothing is "Nu a trimis" while the uploads are open and "Nu a participat" after; after, an upload left open with files is "Așteaptă corectarea" and one with no file "Nu a participat"), "Recorectează tot"). `pages/PaperPage.tsx` and `paperPage/` are the paper page (spec `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md` §4, `/teste/:code/elevi/:submissionId`): the path (`Crumbs`), the head (`PaperHead.tsx`: `.submission-head`, the name, the test, the state and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right; then the result link row; `usePaperActions` holds Recorectează, Resetează and Reîncearcă and the news after them), the switch "Toate exercițiile" / "Doar de verificat (N)" (N the points of the whole test; the view is in the address, `vedere=verificare`, and stays when she moves), then the moves, small and on one row also on a phone: "‹ Punct 3/47 ›" (a group "Punctele de verificat", only the points to check: the arrows are "Punctul anterior" and "Următorul punct", the blue one, with the key in their tooltip, and between them the open point's place among the points J and K walk), "‹ Elev ›" (a group "Elevii", "Elevul anterior" and "Elevul următor"; an arrow with nowhere to go is off) and "Lucrarea" (a picture icon, pressed while the paper shows, which hides it or shows it again), then three columns: "Elevii" (`StudentList.tsx`: every upload with a paper, the grade, the points to check in orange or the state; only the points to check: the papers with points first; a name opens that paper at the top of the window; it folds to a strip, kept in this browser as `quickeval:paperStudentsFolded`), the exercises (`GradedResult` with `check`: a click on a row or its "Arată pe lucrare" opens it, `?punct=<item id>` or `pagini`, and a second click on the open row closes it, after `CLOSE_DELAY` (300 ms), so the first click of a double or triple click, which selects a word to copy, never closes it (a click that ends a selection of the row's text does nothing); a row to check stays open when a click opens another row (`keptKeys`, kept in `Paper` until the teacher closes or checks it, none for another paper; only a click on a row, its "Verifică" or its "Arată pe lucrare" keeps it, `paperKeep` in the navigation state, never J, K or the buttons), so the rows under it never move: its decision stays in place, dimmed, `inert` and `aria-hidden` (`DecisionSlot`), and a click on its row or its "Verifică" opens it again; the A key and the focus after a decision reach only the open row's slot (`.decision-slot.is-current`); "Doar de verificat" keeps only the rows to check and the open one, without the texts for the student; a row to check is calm: its points in a soft orange label (`.points-pill`) and one "Verifică" icon button that opens it (an orange magnifier with a check, like the pencil, its word in its name and tooltip), with no reason in the row; the open row to check shows `PointDecision.tsx` under it, region "Decizia", in a box with a light orange border: the robot's reason, "Accept <points>" (the robot's points), the stepper (− and + move by 0,5 on the 0,05 steps, between 0 and the maximum; any value in steps of 0,05 can be typed) and "Salvează", and what the grade becomes with another value; for the pages, the reason and "Am verificat paginile"; while a decision shows, the bar names the keys between the switch and the moves, only when the whole line fits there (`.review-keys`: a one-line wrapping box whose line wraps out of sight)), and the paper (`reviewPage/ReviewPhoto.tsx`, staying in view and level with the other two columns; its × button ("Ascunde lucrarea", top right) hides it, the exercises taking its room, and the focus goes to "Lucrarea" in the bar; the choice is kept in this browser as `quickeval:paperPhotoFolded`; a graded paper with nothing left to check opens with it hidden (chosen when the paper opens, from its upload row), and its toggles there are not saved; graded again, it shows as the saved choice says; while it is folded, 1–9 do nothing and the bar does not name them, and "Arată pe lucrare" shows it again (an open row stays open): each page with "2/3" beside the name and its file's name and size, as the student sent it; over the photo, a floating bar on the top left holds "Arată chenarul" (an orange dashed-frame toggle, while the open answer has an area) and "Toată pagina" (off while the page is whole), and the zoom's − and + float alone on the top right; a photo zooms inside the pane (a left click, a right click and the two buttons over the photo take one small step, out and in; two fingers pinch on a touch screen, and the wheel scrolls the page), a line over the page says what a click does until she zooms, in the words of the pointer at hand (a phone has no right button), and the open exercise draws an orange border around the robot's area of its answer, on the whole page, because the page never zooms by itself; the border's arrows step through the parts of an answer, each part opening on its page, whole). The exercises get three fifths of the room the students leave, the paper two; below 1200px the students go under the exercises, and below 900px one column: the exercises, the paper, the students. `paperPage/paths.ts` writes the addresses (replaced, never a new step in the history) and picks the students' order and the points J and K walk: every point of the test while only the points to check show, else the open student's. `reviewPage/points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first) and steps between them. The old address of the review, `/teste/:code/verificare?lucrare=&punct=`, opens the page with only the points to check (`ReviewRedirect`: the named paper and point, else `firstSpot()`, else the test's Verificare); every link to the points to check uses it (`reviewPath`). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point: with only the points to check, also on the next student; with all the exercises, the next point of the same student, and when none is left the row stays open and "Elevul următor" takes the focus. It moves only if the teacher is still at the decided point (a call-level `onSuccess` of `mutate`, which does not run once the page is gone). The shell draws the page anew for another address path (`ErrorBoundary key={location.pathname}`), so where the focus goes after a decision rides in the navigation state (`paperFocus`), given once per address. A new address path opens at the top of the window (`Layout.tsx`, a PUSH only): a replaced one (the paper page's moves) keeps its place, and Back or Forward leave it to the browser. A refused decision reads the paper and the test again. The papers the teacher can move to next (the next and the previous student, the next point's paper) are read ahead, so another student's page shows at once; while a paper loads, its place keeps a screen's height. A paper with no result now (uploading, sent, graded again) shows its pages and why (`submissionPage/waitingText.ts`), a failed one "Reîncearcă"; when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A (presses "Accept" of an open row to check), J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). "Alte acțiuni" (`useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. Points are never bold. Without the paper page (no page uses that plain list now), an exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds "Verifică" or "Arată pe lucrare" (paper page only) and the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

- [ ] **Step 25: Edit `docs/superpowers/specs/2026-11-14-rezultate-page-design.md`**

Find this block:

```markdown
  - The table sits in a box with a border and `--radius-panel`.
- **No bold** in either table. The student name has weight 500, in the text colour, and is underlined on hover. The headers have weight 500. The `<strong>` on the grade goes.
```

Replace it with:

```markdown
  - The table sits in a box with a border and `--radius-panel`.
- In both tables the grade comes right after the name, so its colour is read first. Rezultate: Elev, Nota, Punctaj, Linkul cu rezultatul, Stare. Corectare: Elev, Nota, Stare, Fișiere, Ora, De verificat, then the row's actions.
- **No bold** in either table. The student name has weight 500, in the text colour, and is underlined on hover. The headers have weight 500. The `<strong>` on the grade goes.
```

- [ ] **Step 26: Edit `docs/superpowers/specs/2026-11-14-rezultate-page-design.md`**

Find this block:

```markdown
- The rest of each row stays as today: "Nu a trimis lucrarea.", "Nu a participat", "Eșuat" with "Reîncearcă", the CES tag, "a plecat", "Publicat", "Publică" or "Oprește publicarea", "Vezi lucrarea" and ⋯, and the checkboxes of an open test.
- On a phone, each row becomes a card. The name and the grade chip are on the first line, and the rest is under them.

```

Replace it with:

```markdown
- The rest of each row stays as today: "Nu a trimis lucrarea.", "Nu a participat", "Eșuat" with "Reîncearcă", the CES tag, "a plecat", "Publicat", "Publică" or "Oprește publicarea", "Vezi lucrarea" and ⋯, and the checkboxes of an open test.
- On a phone each row stays a card, as today: the name, then each cell under its caption, the grade ("Nota") first.

```

- [ ] **Step 27: Run the typecheck and the whole suite**

Run: `npm run typecheck`
Expected: no output after the command line (exit code 0).

Run: `npm test`
Expected: `Test Files  182 passed | 1 skipped (183)`, `Tests  2777 passed | 3 skipped (2780)`.

- [ ] **Step 28: Commit**

```bash
git add src/admin/testPage/GradeChip.tsx src/admin/testPage/UploadsTable.tsx src/admin/testPage/ResultLinksTable.tsx src/admin/testPage/ResultsPanel.test.tsx src/admin/pages/TestPage.test.tsx src/ui/brand.css src/ui/brand.test.ts src/AGENTS.md docs/superpowers/specs/2026-11-14-rezultate-page-design.md
git commit -m "Draw the papers tables like the points table of Verificare, with grade chips"
```

Run: `git diff --stat refs/protorz/r1 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

### Task 2: The stage sentence, and "Raportul clasei" beside the students

Rezultate says what each student gets, in the panel's full width (every stage's sentence loses its 62-character limit); the repeated paragraph, "Pentru tine" and the PDF line go; the students' table stands beside the card "Raportul clasei", or under it in a narrow panel.

**Files:**
- Create: `src/admin/testPage/ReportCard.tsx`
- Delete: `src/admin/testPage/ResultFiles.tsx`
- Modify: `shared/stats.ts`, `src/admin/shell/icons.tsx`, `src/admin/testPage/StagePanel.tsx`, `src/ui/brand.css`, `src/AGENTS.md`, `docs/superpowers/specs/2026-11-14-rezultate-page-design.md`
- Test: `shared/stats.test.ts`, `src/admin/testPage/ResultsPanel.test.tsx`, `src/admin/pages/TestPage.test.tsx`, `src/ui/brand.test.ts`

**Interfaces:**
- Consumes: `GRADE_GROUPS` (`shared/stats.ts`), `TestInfo.averageGrade`, `TestInfo.gradedCount`, `UploadRow` (`shared/api.ts`), `classCsv` (`shared/csv.ts`), `saveFile` (`src/admin/pdf/share.ts`), `countLabel`, `pointsLevel`, `uploadStatusLabel` (`src/ui/format.ts`).
- Produces: `export function gradeGroups(grades: readonly number[]): { label: string; count: number }[]` in `shared/stats.ts` (used by `classStats` too); `export function IconDownload()` in `src/admin/shell/icons.tsx`; `export function ReportCard({ test, uploads }: { test: TestInfo; uploads: UploadRow[] })` in `src/admin/testPage/ReportCard.tsx`, a `section.report-card` named by its heading "Raportul clasei".

- [ ] **Step 1: Edit `shared/stats.test.ts`**

Find this block:

```ts
import type { ReportRow } from './api.ts';
import { averageGrade, classStats, GRADE_GROUPS, reportTables, sameExercises } from './stats.ts';

```

Replace it with:

```ts
import type { ReportRow } from './api.ts';
import { averageGrade, classStats, GRADE_GROUPS, gradeGroups, reportTables, sameExercises } from './stats.ts';

```

- [ ] **Step 2: Edit `shared/stats.test.ts`**

Find this block:

```ts
    expect(averageGrade([])).toBeNull();
  });
```

Replace it with:

```ts
    expect(averageGrade([])).toBeNull();
  });
});

describe('gradeGroups', () => {
  it('counts each grade in its group, in any order, a grade at a limit in the higher group', () => {
    expect(gradeGroups([10, 4.99, 5, 9, 6.99, 0, 7, 8.99, 2.5])).toEqual([
      { label: '1-4,99', count: 3 },
      { label: '5-6,99', count: 2 },
      { label: '7-8,99', count: 2 },
      { label: '9-10', count: 2 },
    ]);
  });

  it('has every group, empty, without grades', () => {
    expect(gradeGroups([]).map((group) => group.count)).toEqual([0, 0, 0, 0]);
  });
```

- [ ] **Step 3: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx

// The panel Rezultate of the test page (redesign spec §8).
const PAGE = '/teste/6E2-26T1#rezultate';

```

Replace it with:

```tsx

// The panel Rezultate of the test page (redesign spec §8, spec 2026-11-14).
const PAGE = '/teste/6E2-26T1#rezultate';

// What the panel says under its heading: what each student gets.
const SENTENCE =
  'După ce rezultatele sunt publicate, fiecare elev are acces la rezultatul lui: nota finală, punctele pe fiecare exercițiu, explicații detaliate pentru fiecare problemă rezolvată corect sau greșit și o sinteză finală cu ce merge bine și recomandări.';

```

- [ ] **Step 4: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx

  it('says what the link shows, and offers no publish button before anything is graded', async () => {
    const rows = [
```

Replace it with:

```tsx

  it('says what each student gets, once, and offers no publish button before anything is graded', async () => {
    const rows = [
```

- [ ] **Step 5: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx
    renderAdmin(PAGE, apiWith({ status: 'evaluating' }, rows));
    expect(
      await screen.findByText('Linkul arată nota, punctajul pe fiecare exercițiu, explicațiile detaliate pentru fiecare problemă rezolvată corect sau greșit și o sinteză finală cu ce merge bine și recomandări. Elevul îl vede după ce îl publici.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Rezultatele se publică după corectare' })).toBeInTheDocument();
```

Replace it with:

```tsx
    renderAdmin(PAGE, apiWith({ status: 'evaluating' }, rows));
    expect(await screen.findByText(SENTENCE)).toBeInTheDocument();
    expect(screen.queryByText(/^Linkul arată nota/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Rezultatele se publică după corectare' })).toBeInTheDocument();
```

- [ ] **Step 6: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx
    expect(screen.getByText('0 publicate · 1 nepublicat')).toBeInTheDocument();
    expect(screen.getByText('Raportul clasei și CSV-ul apar după prima corectare.')).toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(screen.getByText('0 publicate · 1 nepublicat')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Raportul clasei' })).getByText('Raportul clasei și CSV-ul apar după prima corectare.')).toBeInTheDocument();
  });
```

- [ ] **Step 7: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx

  it('offers the class report and the CSV once a paper is graded', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done' }, graded()));
    expect(await screen.findByRole('heading', { level: 3, name: 'Pentru tine' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Deschide raportul' })).toHaveAttribute('href', '/teste/6E2-26T1/raport');
    expect(screen.getByText('Media testului 8,5 · rezultatele pe exerciții · analiza clasei')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descarcă CSV' })).toBeInTheDocument();
    expect(screen.getByText('PDF-ul cu rezultatul unui elev este pe pagina lucrării lui: apasă pe numele lui în tabel.')).toBeInTheDocument();
  });
```

Replace it with:

```tsx

  it('shows "Raportul clasei" once a paper is graded: the average in its colour, the grades by group, the report, and the CSV', async () => {
    const rows = [...graded(), fakeUpload({ studentId: 13, studentName: 'Vlad Ana', active: false, submissionId: 7, status: 'graded', fileCount: 1, grade: 4 })];
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    const card = await screen.findByRole('region', { name: 'Raportul clasei' });
    expect(within(card).getByText('7')).toHaveClass('report-card-grade', 'points-4');
    expect(within(card).getByText('media testului · 2 din 3 elevi corectați')).toBeInTheDocument();
    // Every graded paper counts in its group, the one of a student who left too.
    const groups = within(card).getByRole('list', { name: 'Notele pe grupe' });
    expect(within(groups).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['1-4,991', '5-6,990', '7-8,991', '9-101']);
    expect(groups.querySelector('.bar-1')).toHaveStyle({ width: '100%' });
    expect(groups.querySelector('.bar-3')).toHaveStyle({ width: '0%' });
    const open = within(card).getByRole('link', { name: 'Deschide raportul' });
    expect(open).toHaveAttribute('href', '/teste/6E2-26T1/raport');
    expect(open).toHaveClass('button');
    expect(open).toHaveTextContent(/^Deschide raportul$/);
    expect(within(card).getByRole('button', { name: 'CSV pentru catalog' })).toHaveClass('text-button', 'is-quiet');
    expect(screen.queryByRole('heading', { name: 'Pentru tine' })).not.toBeInTheDocument();
    expect(screen.queryByText(/^PDF-ul cu rezultatul unui elev/)).not.toBeInTheDocument();
  });

  it('puts "Raportul clasei" before the students in the page, and says when it comes before any grading', async () => {
    const rows = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 2 })];
    renderAdmin(PAGE, apiWith({ status: 'evaluating', resultsOpen: true }, rows));
    const card = await screen.findByRole('region', { name: 'Raportul clasei' });
    expect(within(card).getByText('Raportul clasei și CSV-ul apar după prima corectare.')).toBeInTheDocument();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Linkurile cu rezultatele elevilor' });
    expect(table.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Elevii' })).toBeInTheDocument();
  });
```

- [ ] **Step 8: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx
    renderAdmin(PAGE, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Descarcă CSV' }));
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
```

Replace it with:

```tsx
    renderAdmin(PAGE, api);
    await userEvent.click(await screen.findByRole('button', { name: 'CSV pentru catalog' }));
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
```

- [ ] **Step 9: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx
    renderAdmin(PAGE, apiWith({ status: 'done' }, graded()));
    await userEvent.click(await screen.findByRole('button', { name: 'Descarcă CSV' }));
    expect(await screen.findByText('Nu am găsit ce cauți.')).toBeInTheDocument();
```

Replace it with:

```tsx
    renderAdmin(PAGE, apiWith({ status: 'done' }, graded()));
    await userEvent.click(await screen.findByRole('button', { name: 'CSV pentru catalog' }));
    expect(await screen.findByText('Nu am găsit ce cauți.')).toBeInTheDocument();
```

- [ ] **Step 10: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx

  it('puts the class report in Rezultate once a result is graded', async () => {
    renderAdmin(PAGE, evaluationApi({ status: 'done' }, graded));
```

Replace it with:

```tsx

  it('puts the class report in Rezultate once a result is graded, as its main button', async () => {
    renderAdmin(PAGE, evaluationApi({ status: 'done' }, graded));
```

- [ ] **Step 11: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(link).toHaveAttribute('href', '/teste/6E2-26T1/raport');
    expect(link).toHaveClass('button-quiet', 'button-small');
    expect(screen.getAllByRole('link', { name: 'Deschide raportul' })).toHaveLength(1);
```

Replace it with:

```tsx
    expect(link).toHaveAttribute('href', '/teste/6E2-26T1/raport');
    expect(link).toHaveClass('button');
    expect(link).not.toHaveClass('button-quiet');
    expect(screen.getAllByRole('link', { name: 'Deschide raportul' })).toHaveLength(1);
```

- [ ] **Step 12: Edit `src/ui/brand.test.ts`**

Find this block:

```ts

  it('is flat: no gradient, no notebook grid', () => {
```

Replace it with:

```ts

  it('gives the stage sentence the whole width of the panel, and puts "Raportul clasei" beside the students only in a wide panel', () => {
    expect(value(declarations('.stage-head p'), 'max-width')).toBeUndefined();
    expect(value(declarations('.results-layout'), 'container-type')).toBe('inline-size');
    expect(value(declarations('.results-grid'), 'grid-template-columns')).toBe('minmax(0, 1fr)');
    expect(css).toContain('@container (min-width: 56rem) {\n  .results-grid {\n    grid-template-columns: minmax(0, 1fr) 18rem;');
    expect(css).toContain('  .results-grid > .report-card {\n    grid-row: 1;\n    grid-column: 2;\n  }');
  });

  it('is flat: no gradient, no notebook grid', () => {
```

- [ ] **Step 13: Run the tests to see them fail**

Run: `npx vitest run shared/stats.test.ts src/admin/testPage/ResultsPanel.test.tsx src/admin/pages/TestPage.test.tsx src/ui/brand.test.ts`
Expected: FAIL. `Test Files  4 failed (4)`, `Tests  9 failed | 190 passed (199)`: `gradeGroups is not a function` (the 2 new tests of `shared/stats.test.ts`); the panel still has the old sentence, "Pentru tine" and "Descarcă CSV" (`Unable to find an element with the text: După ce rezultatele sunt publicate, …`, `Unable to find role="region" and name "Raportul clasei"`, `Unable to find role="button" and name "CSV pentru catalog"`; these wait their 3 s before they fail); "Deschide raportul" is still a quiet button (`expect(element).toHaveClass("button")`); and the stage sentence keeps its limit (`expected '62ch' to be undefined`).

- [ ] **Step 14: Edit `shared/stats.ts`**

Find this block:

```ts

// The grades are the whole class's, CES papers included; the exercises are
```

Replace it with:

```ts

// How many grades fall in each group of GRADE_GROUPS, in its order: the class
// report's "Notele pe grupe", and the bars of "Raportul clasei" in Rezultate.
export function gradeGroups(grades: readonly number[]): { label: string; count: number }[] {
  return GRADE_GROUPS.map((group, index) => {
    const until = GRADE_GROUPS[index + 1]?.from ?? Infinity;
    return { label: group.label, count: grades.filter((grade) => grade >= group.from && grade < until).length };
  });
}

// The grades are the whole class's, CES papers included; the exercises are
```

- [ ] **Step 15: Edit `shared/stats.ts`**

Find this block:

```ts
  const grades = report.rows.map((row) => row.grade).sort((a, b) => a - b);
  const groups = GRADE_GROUPS.map((group, index) => {
    const until = GRADE_GROUPS[index + 1]?.from ?? Infinity;
    return { label: group.label, count: grades.filter((grade) => grade >= group.from && grade < until).length };
  });
  const [classTable, cesTable] = reportTables(report);
```

Replace it with:

```ts
  const grades = report.rows.map((row) => row.grade).sort((a, b) => a - b);
  const groups = gradeGroups(grades);
  const [classTable, cesTable] = reportTables(report);
```

- [ ] **Step 16: Edit `src/admin/shell/icons.tsx`**

Find this block:

```tsx

export function IconSearch() {
```

Replace it with:

```tsx

export function IconDownload() {
  return (
    <svg {...LINE}>
      <path d="M10 3v9.5M6 8.5l4 4 4-4M4 16.5h12" />
    </svg>
  );
}

export function IconSearch() {
```

- [ ] **Step 17: Create `src/admin/testPage/ReportCard.tsx`**

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { classCsv } from '../../../shared/csv.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { gradeGroups } from '../../../shared/stats.ts';
import { countLabel, pointsLevel, uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { saveFile } from '../pdf/share.ts';
import { IconDownload } from '../shell/icons.tsx';

// The colour of each grade group's bar: the grade colour of its grades
// (`.points-N`), red under 5 up to dark green from 9.
const GROUP_LEVELS = [1, 3, 4, 5];

// "Raportul clasei" in the panel Rezultate (spec 2026-11-14): the class's
// average and its grades by group, from the rows the page already has (no
// report query), the way to the class report, and the CSV for the catalog
// as a small text button. The CSV is the class report's, read only when the
// button is pressed. Each student's PDF stays on the paper's page.
export function ReportCard({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }) {
  if (test.gradedCount === 0) {
    return (
      <section className="report-card" aria-labelledby="report-card-title">
        <h3 id="report-card-title">Raportul clasei</h3>
        <p className="hint">Raportul clasei și CSV-ul apar după prima corectare.</p>
      </section>
    );
  }
  // Every paper graded now counts, a student who left too, as in the report.
  const grades = uploads.flatMap((row) => (row.status === 'graded' && row.grade !== null ? [row.grade] : []));
  const groups = gradeGroups(grades);
  const most = Math.max(1, ...groups.map((group) => group.count));
  const active = uploads.filter((row) => row.active);
  const gradedActive = active.filter((row) => row.status === 'graded').length;
  return (
    <section className="report-card" aria-labelledby="report-card-title">
      <h3 id="report-card-title">Raportul clasei</h3>
      <p className="report-card-average">
        {test.averageGrade !== null && (
          <span className={`report-card-grade points-${pointsLevel(test.averageGrade, 10)}`}>{formatPoints(test.averageGrade)}</span>
        )}
        <span className="hint">
          {test.averageGrade !== null && 'media testului · '}
          {gradedActive} din {countLabel(active.length, 'elev corectat', 'elevi corectați')}
        </span>
      </p>
      <ul className="report-card-groups" aria-label="Notele pe grupe">
        {groups.map((group, index) => (
          <li key={group.label}>
            <span>{group.label}</span>
            <span className="report-card-bar" aria-hidden="true">
              <span className={`bar-${GROUP_LEVELS[index]}`} style={{ width: `${(group.count / most) * 100}%` }}></span>
            </span>
            <span className="report-card-count">{group.count}</span>
          </li>
        ))}
      </ul>
      <Link className="button" to={`/teste/${test.code}/raport`}>
        Deschide raportul
      </Link>
      <CsvButton code={test.code} />
    </section>
  );
}

function CsvButton({ code }: { code: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const csv = useMutation({
    mutationFn: async () => {
      const report = await queryClient.fetchQuery({ queryKey: ['report', code], queryFn: () => api.getReport(code) });
      saveFile(new Blob([classCsv(report, uploadStatusLabel)], { type: 'text/csv;charset=utf-8' }), `${report.test.code}-raport.csv`);
    },
  });
  return (
    <>
      <button type="button" className="text-button is-quiet csv-button" disabled={csv.isPending} onClick={() => csv.mutate()}>
        <IconDownload />
        CSV pentru catalog
      </button>
      {csv.error && <ErrorMessage error={csv.error} />}
    </>
  );
}
```

- [ ] **Step 18: Delete `src/admin/testPage/ResultFiles.tsx`**

Run: `git rm src/admin/testPage/ResultFiles.tsx`

- [ ] **Step 19: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
import { isMoveOn, MoveOnLink } from './MoveOnLink.tsx';
import { ResultFiles } from './ResultFiles.tsx';
import { linksCount, ResultLinksTable } from './ResultLinksTable.tsx';
```

Replace it with:

```tsx
import { isMoveOn, MoveOnLink } from './MoveOnLink.tsx';
import { ReportCard } from './ReportCard.tsx';
import { linksCount, ResultLinksTable } from './ResultLinksTable.tsx';
```

- [ ] **Step 20: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx

// The landing page's sentence for each stage (redesign spec §3).
const SENTENCES: Record<StageName, string> = {
```

Replace it with:

```tsx

// The landing page's sentence for each stage (redesign spec §3), but for
// Rezultate: there the teacher reads what each student gets once the results
// are published (spec 2026-11-14), not what the landing page promises.
const SENTENCES: Record<StageName, string> = {
```

- [ ] **Step 21: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
  Verificare: 'Punctele nesigure te așteaptă pe tine. Accepți sau schimbi punctajul.',
  Rezultate: 'Fiecare elev primește un link cu rezultatul lui: nota, punctele pe fiecare exercițiu, explicații detaliate pentru fiecare problemă rezolvată corect sau greșit și o sinteză finală cu ce merge bine și recomandări. Raportul clasei, un PDF pentru fiecare elev și CSV pentru catalog.',
};
```

Replace it with:

```tsx
  Verificare: 'Punctele nesigure te așteaptă pe tine. Accepți sau schimbi punctajul.',
  Rezultate:
    'După ce rezultatele sunt publicate, fiecare elev are acces la rezultatul lui: nota finală, punctele pe fiecare exercițiu, explicații detaliate pentru fiecare problemă rezolvată corect sau greșit și o sinteză finală cu ce merge bine și recomandări.',
};
```

- [ ] **Step 22: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx

// The results (redesign spec §8): publishing, the students' links, and
// "Pentru tine". The links table takes the place of the papers table here.
function ResultsPanel({ test, uploads, onChanged }: PanelProps) {
```

Replace it with:

```tsx

// The results (redesign spec §8, spec 2026-11-14): publishing at the top,
// then the students' links beside "Raportul clasei". The links table takes
// the place of the papers table here.
function ResultsPanel({ test, uploads, onChanged }: PanelProps) {
```

- [ ] **Step 23: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
    <>
      <p>Linkul arată nota, punctajul pe fiecare exercițiu, explicațiile detaliate pentru fiecare problemă rezolvată corect sau greșit și o sinteză finală cu ce merge bine și recomandări. Elevul îl vede după ce îl publici.</p>
      <ResultsAccess test={test} onChanged={onChanged} />
      <StudentAccessCard test={test} />
      <h3>Linkurile elevilor</h3>
      {count && <p className="hint">{count}</p>}
      <ResultLinksTable code={test.code} uploads={uploads} resultsOpen={test.resultsOpen} onChanged={onChanged} />
      <h3>Pentru tine</h3>
      <ResultFiles test={test} />
    </>
```

Replace it with:

```tsx
    <>
      <ResultsAccess test={test} onChanged={onChanged} />
      <StudentAccessCard test={test} />
      <div className="results-layout">
        <div className="results-grid">
          <ReportCard test={test} uploads={uploads} />
          <div className="results-students">
            <div className="results-students-head">
              <h3>Elevii</h3>
              {count && <p className="hint">{count}</p>}
            </div>
            <ResultLinksTable code={test.code} uploads={uploads} resultsOpen={test.resultsOpen} onChanged={onChanged} />
          </div>
        </div>
      </div>
    </>
```

- [ ] **Step 24: Edit `src/ui/brand.css`**

Find this block:

```css

.stage-head p {
  max-width: 62ch;
  margin: 0.25rem 0 0;
```

Replace it with:

```css

/* The stage's sentence takes the panel's whole width. */
.stage-head p {
  margin: 0.25rem 0 0;
```

- [ ] **Step 25: Edit `src/ui/brand.css`**

Find this block:

```css
  border-top: 1px solid var(--line);
  text-align: right;
}

```

Replace it with:

```css
  border-top: 1px solid var(--line);
  text-align: right;
}

/* The panel Rezultate (spec 2026-11-14): "Raportul clasei" first in the
   page, so the keyboard reaches it before the table's rows; beside the
   students' table on the right while the panel is wide, above it while the
   panel is narrow. The panel's own width decides, not the screen's. */
.results-layout {
  container-type: inline-size;
}

.results-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
}

@container (min-width: 56rem) {
  .results-grid {
    grid-template-columns: minmax(0, 1fr) 18rem;
  }

  .results-grid > .report-card {
    grid-row: 1;
    grid-column: 2;
  }

  .results-grid > .results-students {
    grid-row: 1;
    grid-column: 1;
  }
}

.results-students {
  display: grid;
  gap: 0.5rem;
  min-width: 0;
}

.results-students-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.5rem;
}

.results-students-head h3 {
  margin: 0;
  font-size: 1rem;
}

.results-students-head p {
  margin: 0;
}

/* "Raportul clasei": the average in its grade colour, the grades by group in
   the same colours, the one button to the report, and the CSV as a quiet
   text button. */
.report-card {
  display: grid;
  gap: 0.75rem;
  padding: 1rem 1.125rem;
  border: 1px solid color-mix(in srgb, var(--ink) 45%, var(--rule));
  border-radius: var(--radius-panel);
  background: var(--raised);
}

.report-card h3 {
  margin: 0;
  font-size: 1rem;
}

.report-card p {
  margin: 0;
}

.report-card-average {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.5rem;
}

.report-card-grade {
  font-size: 2.25rem;
  font-weight: 500;
  line-height: 1;
}

.report-card-groups {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.8125rem;
}

.report-card-groups li {
  display: grid;
  grid-template-columns: 3.75rem minmax(0, 1fr) 1.5rem;
  align-items: center;
  gap: 0.5rem;
}

.report-card-bar {
  display: block;
  height: 0.5rem;
  overflow: hidden;
  border-radius: 4px;
  background: var(--active);
}

.report-card-bar > span {
  display: block;
  height: 100%;
  border-radius: 4px;
}

.report-card-bar > .bar-1 {
  background: var(--conf-1);
}

.report-card-bar > .bar-3 {
  background: var(--conf-3);
}

.report-card-bar > .bar-4 {
  background: var(--conf-4);
}

.report-card-bar > .bar-5 {
  background: var(--conf-5);
}

.report-card-count {
  text-align: right;
}

.report-card .button {
  width: 100%;
}

.text-button.csv-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  justify-self: start;
  font-weight: 500;
}

.csv-button svg {
  width: 1rem;
  height: 1rem;
}

```

- [ ] **Step 26: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, filled orange (`.button button-wait`) for the one main action of a screen whose work waits on the teacher ("Începe verificarea" in Verificare), and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `Crumbs.tsx` is the path at the top of the test page and of the paper page ("Teste › Clasa 7E2 › <test>", a `nav` "Unde ești"; the last step is the page itself, not a link). `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă and Corectare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; once results are published (for all, or one alone), `StudentAccessCard.tsx`: where students find their results (the students' link with its QR code and "Descarcă codul QR", a PNG; the multi-upload link named "Doar pentru profesor", with no QR code; and the help text); the students' result links in `ResultLinksTable.tsx`, with the grade right after the name (a `GradeChip`, with its points still to check beside it in an orange label), the points, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the subject (`SubjectForm.tsx`: "Se stabilește la corectare" until the robot finds it, "Alege materia" or "Schimbă materia" opening the seven subjects in place (while the robot reads the test, only a line that says when the subject can change), with a line when the list is made again and the papers graded again), the files, the students' link while the test is a draft or open, rename, archive (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`), delete), the overview of Verificare (`ReviewOverview.tsx`: the graded papers that had points, counted with `flagCount` and `checkedCount`; "<checked> din <total> verificate", its bar, "Mai sunt …" and the orange "Începe verificarea" (nothing checked yet) or "Continuă verificarea" into the paper page at the first point left; "De verificat", a label per student with points left ("<checked>/<total>", opening that student's first point), and "Gata", a label per student done (opening the paper with all its exercises); once all is checked a green box with "Mergi la Rezultate" (the panel then leaves out "Următoarea etapă"), and "Nimic de verificat." when no graded paper had a point; CES as the other tables show it (`ces` or `variant === 'ces'`), in the label's accessible name too; no papers table and no list of the points: the paper page decides them), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page learns the answer from the version check of the shell), the uploads table (`UploadsTable.tsx`, the full width of its card; the grade right after the name, a `GradeChip.tsx`: the grade in a soft chip of the class report's colours, `.points-N` of `pointsLevel(grade, 10)`; "De verificat" in an orange label; both papers tables are drawn like the points table of Verificare, with no bold: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off; a student who sent nothing is "Nu a trimis" while the uploads are open and "Nu a participat" after; after, an upload left open with files is "Așteaptă corectarea" and one with no file "Nu a participat"), "Recorectează tot"). `pages/PaperPage.tsx` and `paperPage/` are the paper page (spec `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md` §4, `/teste/:code/elevi/:submissionId`): the path (`Crumbs`), the head (`PaperHead.tsx`: `.submission-head`, the name, the test, the state and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right; then the result link row; `usePaperActions` holds Recorectează, Resetează and Reîncearcă and the news after them), the switch "Toate exercițiile" / "Doar de verificat (N)" (N the points of the whole test; the view is in the address, `vedere=verificare`, and stays when she moves), then the moves, small and on one row also on a phone: "‹ Punct 3/47 ›" (a group "Punctele de verificat", only the points to check: the arrows are "Punctul anterior" and "Următorul punct", the blue one, with the key in their tooltip, and between them the open point's place among the points J and K walk), "‹ Elev ›" (a group "Elevii", "Elevul anterior" and "Elevul următor"; an arrow with nowhere to go is off) and "Lucrarea" (a picture icon, pressed while the paper shows, which hides it or shows it again), then three columns: "Elevii" (`StudentList.tsx`: every upload with a paper, the grade, the points to check in orange or the state; only the points to check: the papers with points first; a name opens that paper at the top of the window; it folds to a strip, kept in this browser as `quickeval:paperStudentsFolded`), the exercises (`GradedResult` with `check`: a click on a row or its "Arată pe lucrare" opens it, `?punct=<item id>` or `pagini`, and a second click on the open row closes it, after `CLOSE_DELAY` (300 ms), so the first click of a double or triple click, which selects a word to copy, never closes it (a click that ends a selection of the row's text does nothing); a row to check stays open when a click opens another row (`keptKeys`, kept in `Paper` until the teacher closes or checks it, none for another paper; only a click on a row, its "Verifică" or its "Arată pe lucrare" keeps it, `paperKeep` in the navigation state, never J, K or the buttons), so the rows under it never move: its decision stays in place, dimmed, `inert` and `aria-hidden` (`DecisionSlot`), and a click on its row or its "Verifică" opens it again; the A key and the focus after a decision reach only the open row's slot (`.decision-slot.is-current`); "Doar de verificat" keeps only the rows to check and the open one, without the texts for the student; a row to check is calm: its points in a soft orange label (`.points-pill`) and one "Verifică" icon button that opens it (an orange magnifier with a check, like the pencil, its word in its name and tooltip), with no reason in the row; the open row to check shows `PointDecision.tsx` under it, region "Decizia", in a box with a light orange border: the robot's reason, "Accept <points>" (the robot's points), the stepper (− and + move by 0,5 on the 0,05 steps, between 0 and the maximum; any value in steps of 0,05 can be typed) and "Salvează", and what the grade becomes with another value; for the pages, the reason and "Am verificat paginile"; while a decision shows, the bar names the keys between the switch and the moves, only when the whole line fits there (`.review-keys`: a one-line wrapping box whose line wraps out of sight)), and the paper (`reviewPage/ReviewPhoto.tsx`, staying in view and level with the other two columns; its × button ("Ascunde lucrarea", top right) hides it, the exercises taking its room, and the focus goes to "Lucrarea" in the bar; the choice is kept in this browser as `quickeval:paperPhotoFolded`; a graded paper with nothing left to check opens with it hidden (chosen when the paper opens, from its upload row), and its toggles there are not saved; graded again, it shows as the saved choice says; while it is folded, 1–9 do nothing and the bar does not name them, and "Arată pe lucrare" shows it again (an open row stays open): each page with "2/3" beside the name and its file's name and size, as the student sent it; over the photo, a floating bar on the top left holds "Arată chenarul" (an orange dashed-frame toggle, while the open answer has an area) and "Toată pagina" (off while the page is whole), and the zoom's − and + float alone on the top right; a photo zooms inside the pane (a left click, a right click and the two buttons over the photo take one small step, out and in; two fingers pinch on a touch screen, and the wheel scrolls the page), a line over the page says what a click does until she zooms, in the words of the pointer at hand (a phone has no right button), and the open exercise draws an orange border around the robot's area of its answer, on the whole page, because the page never zooms by itself; the border's arrows step through the parts of an answer, each part opening on its page, whole). The exercises get three fifths of the room the students leave, the paper two; below 1200px the students go under the exercises, and below 900px one column: the exercises, the paper, the students. `paperPage/paths.ts` writes the addresses (replaced, never a new step in the history) and picks the students' order and the points J and K walk: every point of the test while only the points to check show, else the open student's. `reviewPage/points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first) and steps between them. The old address of the review, `/teste/:code/verificare?lucrare=&punct=`, opens the page with only the points to check (`ReviewRedirect`: the named paper and point, else `firstSpot()`, else the test's Verificare); every link to the points to check uses it (`reviewPath`). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point: with only the points to check, also on the next student; with all the exercises, the next point of the same student, and when none is left the row stays open and "Elevul următor" takes the focus. It moves only if the teacher is still at the decided point (a call-level `onSuccess` of `mutate`, which does not run once the page is gone). The shell draws the page anew for another address path (`ErrorBoundary key={location.pathname}`), so where the focus goes after a decision rides in the navigation state (`paperFocus`), given once per address. A new address path opens at the top of the window (`Layout.tsx`, a PUSH only): a replaced one (the paper page's moves) keeps its place, and Back or Forward leave it to the browser. A refused decision reads the paper and the test again. The papers the teacher can move to next (the next and the previous student, the next point's paper) are read ahead, so another student's page shows at once; while a paper loads, its place keeps a screen's height. A paper with no result now (uploading, sent, graded again) shows its pages and why (`submissionPage/waitingText.ts`), a failed one "Reîncearcă"; when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A (presses "Accept" of an open row to check), J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). "Alte acțiuni" (`useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. Points are never bold. Without the paper page (no page uses that plain list now), an exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds "Verifică" or "Arată pe lucrare" (paper page only) and the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

Replace it with:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, filled orange (`.button button-wait`) for the one main action of a screen whose work waits on the teacher ("Începe verificarea" in Verificare), and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `Crumbs.tsx` is the path at the top of the test page and of the paper page ("Teste › Clasa 7E2 › <test>", a `nav` "Unde ești"; the last step is the page itself, not a link). `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă and Corectare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; once results are published (for all, or one alone), `StudentAccessCard.tsx`: where students find their results (the students' link with its QR code and "Descarcă codul QR", a PNG; the multi-upload link named "Doar pentru profesor", with no QR code; and the help text); the students' result links in `ResultLinksTable.tsx`, with the grade right after the name (a `GradeChip`, with its points still to check beside it in an orange label), the points, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Raportul clasei" in `ReportCard.tsx` (spec 2026-11-14), beside the table in a wide panel and above it in a narrow one (a container query on `.results-layout`): the average in its grade colour, the grades by group (`gradeGroups` of `shared/stats.ts`, counted from the uploads list: no report query), "Deschide raportul" (the panel's main button) and "CSV pentru catalog" (a quiet text button: the class report's CSV, read when pressed); the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the subject (`SubjectForm.tsx`: "Se stabilește la corectare" until the robot finds it, "Alege materia" or "Schimbă materia" opening the seven subjects in place (while the robot reads the test, only a line that says when the subject can change), with a line when the list is made again and the papers graded again), the files, the students' link while the test is a draft or open, rename, archive (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`), delete), the overview of Verificare (`ReviewOverview.tsx`: the graded papers that had points, counted with `flagCount` and `checkedCount`; "<checked> din <total> verificate", its bar, "Mai sunt …" and the orange "Începe verificarea" (nothing checked yet) or "Continuă verificarea" into the paper page at the first point left; "De verificat", a label per student with points left ("<checked>/<total>", opening that student's first point), and "Gata", a label per student done (opening the paper with all its exercises); once all is checked a green box with "Mergi la Rezultate" (the panel then leaves out "Următoarea etapă"), and "Nimic de verificat." when no graded paper had a point; CES as the other tables show it (`ces` or `variant === 'ces'`), in the label's accessible name too; no papers table and no list of the points: the paper page decides them), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page learns the answer from the version check of the shell), the uploads table (`UploadsTable.tsx`, the full width of its card; the grade right after the name, a `GradeChip.tsx`: the grade in a soft chip of the class report's colours, `.points-N` of `pointsLevel(grade, 10)`; "De verificat" in an orange label; both papers tables are drawn like the points table of Verificare, with no bold: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off; a student who sent nothing is "Nu a trimis" while the uploads are open and "Nu a participat" after; after, an upload left open with files is "Așteaptă corectarea" and one with no file "Nu a participat"), "Recorectează tot"). `pages/PaperPage.tsx` and `paperPage/` are the paper page (spec `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md` §4, `/teste/:code/elevi/:submissionId`): the path (`Crumbs`), the head (`PaperHead.tsx`: `.submission-head`, the name, the test, the state and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right; then the result link row; `usePaperActions` holds Recorectează, Resetează and Reîncearcă and the news after them), the switch "Toate exercițiile" / "Doar de verificat (N)" (N the points of the whole test; the view is in the address, `vedere=verificare`, and stays when she moves), then the moves, small and on one row also on a phone: "‹ Punct 3/47 ›" (a group "Punctele de verificat", only the points to check: the arrows are "Punctul anterior" and "Următorul punct", the blue one, with the key in their tooltip, and between them the open point's place among the points J and K walk), "‹ Elev ›" (a group "Elevii", "Elevul anterior" and "Elevul următor"; an arrow with nowhere to go is off) and "Lucrarea" (a picture icon, pressed while the paper shows, which hides it or shows it again), then three columns: "Elevii" (`StudentList.tsx`: every upload with a paper, the grade, the points to check in orange or the state; only the points to check: the papers with points first; a name opens that paper at the top of the window; it folds to a strip, kept in this browser as `quickeval:paperStudentsFolded`), the exercises (`GradedResult` with `check`: a click on a row or its "Arată pe lucrare" opens it, `?punct=<item id>` or `pagini`, and a second click on the open row closes it, after `CLOSE_DELAY` (300 ms), so the first click of a double or triple click, which selects a word to copy, never closes it (a click that ends a selection of the row's text does nothing); a row to check stays open when a click opens another row (`keptKeys`, kept in `Paper` until the teacher closes or checks it, none for another paper; only a click on a row, its "Verifică" or its "Arată pe lucrare" keeps it, `paperKeep` in the navigation state, never J, K or the buttons), so the rows under it never move: its decision stays in place, dimmed, `inert` and `aria-hidden` (`DecisionSlot`), and a click on its row or its "Verifică" opens it again; the A key and the focus after a decision reach only the open row's slot (`.decision-slot.is-current`); "Doar de verificat" keeps only the rows to check and the open one, without the texts for the student; a row to check is calm: its points in a soft orange label (`.points-pill`) and one "Verifică" icon button that opens it (an orange magnifier with a check, like the pencil, its word in its name and tooltip), with no reason in the row; the open row to check shows `PointDecision.tsx` under it, region "Decizia", in a box with a light orange border: the robot's reason, "Accept <points>" (the robot's points), the stepper (− and + move by 0,5 on the 0,05 steps, between 0 and the maximum; any value in steps of 0,05 can be typed) and "Salvează", and what the grade becomes with another value; for the pages, the reason and "Am verificat paginile"; while a decision shows, the bar names the keys between the switch and the moves, only when the whole line fits there (`.review-keys`: a one-line wrapping box whose line wraps out of sight)), and the paper (`reviewPage/ReviewPhoto.tsx`, staying in view and level with the other two columns; its × button ("Ascunde lucrarea", top right) hides it, the exercises taking its room, and the focus goes to "Lucrarea" in the bar; the choice is kept in this browser as `quickeval:paperPhotoFolded`; a graded paper with nothing left to check opens with it hidden (chosen when the paper opens, from its upload row), and its toggles there are not saved; graded again, it shows as the saved choice says; while it is folded, 1–9 do nothing and the bar does not name them, and "Arată pe lucrare" shows it again (an open row stays open): each page with "2/3" beside the name and its file's name and size, as the student sent it; over the photo, a floating bar on the top left holds "Arată chenarul" (an orange dashed-frame toggle, while the open answer has an area) and "Toată pagina" (off while the page is whole), and the zoom's − and + float alone on the top right; a photo zooms inside the pane (a left click, a right click and the two buttons over the photo take one small step, out and in; two fingers pinch on a touch screen, and the wheel scrolls the page), a line over the page says what a click does until she zooms, in the words of the pointer at hand (a phone has no right button), and the open exercise draws an orange border around the robot's area of its answer, on the whole page, because the page never zooms by itself; the border's arrows step through the parts of an answer, each part opening on its page, whole). The exercises get three fifths of the room the students leave, the paper two; below 1200px the students go under the exercises, and below 900px one column: the exercises, the paper, the students. `paperPage/paths.ts` writes the addresses (replaced, never a new step in the history) and picks the students' order and the points J and K walk: every point of the test while only the points to check show, else the open student's. `reviewPage/points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first) and steps between them. The old address of the review, `/teste/:code/verificare?lucrare=&punct=`, opens the page with only the points to check (`ReviewRedirect`: the named paper and point, else `firstSpot()`, else the test's Verificare); every link to the points to check uses it (`reviewPath`). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point: with only the points to check, also on the next student; with all the exercises, the next point of the same student, and when none is left the row stays open and "Elevul următor" takes the focus. It moves only if the teacher is still at the decided point (a call-level `onSuccess` of `mutate`, which does not run once the page is gone). The shell draws the page anew for another address path (`ErrorBoundary key={location.pathname}`), so where the focus goes after a decision rides in the navigation state (`paperFocus`), given once per address. A new address path opens at the top of the window (`Layout.tsx`, a PUSH only): a replaced one (the paper page's moves) keeps its place, and Back or Forward leave it to the browser. A refused decision reads the paper and the test again. The papers the teacher can move to next (the next and the previous student, the next point's paper) are read ahead, so another student's page shows at once; while a paper loads, its place keeps a screen's height. A paper with no result now (uploading, sent, graded again) shows its pages and why (`submissionPage/waitingText.ts`), a failed one "Reîncearcă"; when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A (presses "Accept" of an open row to check), J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). "Alte acțiuni" (`useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. Points are never bold. Without the paper page (no page uses that plain list now), an exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds "Verifică" or "Arată pe lucrare" (paper page only) and the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

- [ ] **Step 27: Edit `docs/superpowers/specs/2026-11-14-rezultate-page-design.md`**

Find this block:

```markdown

2. **A grid**: the students table on the left, the widest part; the column "Raportul clasei" on the right, 290 px wide. On a phone, the column goes above the table.
3. **The card "Raportul clasei"** (the right column; replaces "Pentru tine" / `ResultFiles`):
   - the average (`test.averageGrade`), large, in its grade colour, with "media testului · N din M corectate";
   - the grade groups (`GRADE_GROUPS`), one bar each, coloured red, yellow, green and dark green as the grade colours;
```

Replace it with:

```markdown

2. **A grid**: the students table on the left, the widest part; the column "Raportul clasei" on the right, 18 rem wide. The panel's own width decides (a container query on the panel, 56 rem): in a narrower panel (a phone, a small laptop) the card goes above the table, full width. In the page's order the card comes first, so a keyboard and a screen reader reach it before the rows of the table.
3. **The card "Raportul clasei"** (the right column; replaces "Pentru tine" / `ResultFiles`):
   - the average (`test.averageGrade`), large, in its grade colour, with "media testului · N din M elevi corectați" (the active students, as the report's "Corectate" tile);
   - the grade groups (`GRADE_GROUPS`), one bar each, coloured red, yellow, green and dark green as the grade colours;
```

- [ ] **Step 28: Run the typecheck and the whole suite**

Run: `npm run typecheck`
Expected: no output after the command line (exit code 0).

Run: `npm test`
Expected: `Test Files  182 passed | 1 skipped (183)`, `Tests  2781 passed | 3 skipped (2784)`.

- [ ] **Step 29: Commit**

```bash
git add shared/stats.ts shared/stats.test.ts src/admin/shell/icons.tsx src/admin/testPage/ReportCard.tsx src/admin/testPage/StagePanel.tsx src/admin/testPage/ResultsPanel.test.tsx src/admin/pages/TestPage.test.tsx src/ui/brand.css src/ui/brand.test.ts src/AGENTS.md docs/superpowers/specs/2026-11-14-rezultate-page-design.md
git commit -m "Say what each student gets, and put Raportul clasei beside the students"
```

(`git rm` already staged the deleted file.)

Run: `git diff --stat refs/protorz/r2 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

### Task 3: The box at the top: publishing, and the two ways students find their results

`ResultsAccess` becomes the box at the top of Rezultate: grey with "Publică toate rezultatele" while no result is published; green once students can read results, with "Oprește accesul la rezultate" and the two numbered ways, the second with the test's link for the students. `StudentAccessCard` and the teacher's multi-upload link leave Rezultate.

**Files:**
- Delete: `src/admin/testPage/StudentAccessCard.tsx`
- Replace: `src/admin/testPage/ResultsAccess.tsx`
- Modify: `src/admin/testPage/UploadLink.tsx`, `src/admin/testPage/StagePanel.tsx`, `src/ui/brand.css`, `src/AGENTS.md`, `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`, `docs/superpowers/specs/2026-11-14-rezultate-page-design.md`
- Test: `src/admin/testPage/ResultsPanel.test.tsx`

**Interfaces:**
- Consumes: `QrOverlay` and `uploadLink` (`src/admin/testPage/UploadLink.tsx`), `QRCodeSVG` (`qrcode.react`), `IconDone` and `IconClock` (`src/admin/shell/icons.tsx`), `EmptyState`, `MoveOnLink`.
- Produces: `export function QrDownload({ url, fileName }: { url: string; fileName: string })` (now exported from `UploadLink.tsx`); in `ResultsAccess.tsx`: `hasResultsToManage` and `NoResultsYet` (unchanged), `export function hasPublishedResults(test: Pick<TestInfo, 'resultsOpen' | 'publishedCount'>): boolean` (moved from `StudentAccessCard.tsx`), and `ResultsAccess({ test, onChanged })`, a `section.publish-box` (`.is-published` when green) named by its heading.

- [ ] **Step 1: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx
import * as share from '../pdf/share.ts';
import { STUDENT_ACCESS_HELP } from './StudentAccessCard.tsx';
import { MULTI_LABEL } from './UploadLink.tsx';
```

Replace it with:

```tsx
import * as share from '../pdf/share.ts';
import { MULTI_LABEL } from './UploadLink.tsx';
```

- [ ] **Step 2: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', true);
    expect(await screen.findByText('Rezultatele sunt publicate. Elevii le văd pe linkurile lor.')).toBeInTheDocument();
    expect(screen.getByText('toate publicate')).toBeInTheDocument();
```

Replace it with:

```tsx
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', true);
    expect(await screen.findByRole('heading', { level: 3, name: 'Rezultatele sunt publicate. Elevii le văd în două feluri:' })).toBeInTheDocument();
    expect(screen.getByText('toate publicate')).toBeInTheDocument();
```

- [ ] **Step 3: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx
describe('the panel Rezultate, where students find their results', () => {
  const card = () => screen.getByRole('region', { name: 'Rezultatele sunt gata pentru elevi' });

  it('shows no card before the results are published', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done' }, graded()));
    expect(await screen.findByRole('button', { name: 'Publică toate rezultatele' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Rezultatele sunt gata pentru elevi' })).not.toBeInTheDocument();
  });

  it("shows the students' link and the help once published, and no teacher link when there is none", async () => {
    renderAdmin(PAGE, apiWith({ status: 'done' }, graded()));
    await userEvent.click(await screen.findByRole('button', { name: 'Publică toate rezultatele' }));
    expect(await screen.findByRole('region', { name: 'Rezultatele sunt gata pentru elevi' })).toBeInTheDocument();
    expect(within(card()).getByLabelText('Linkul pentru elevi: trimite-l clasei')).toHaveValue(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(within(card()).getByTitle('Codul QR al linkului')).toBeInTheDocument();
    expect(within(card()).getByText(STUDENT_ACCESS_HELP)).toBeInTheDocument();
    expect(within(card()).queryByLabelText(MULTI_LABEL)).not.toBeInTheDocument();

    // Stopping the access takes the card away again.
    await userEvent.click(screen.getByRole('button', { name: 'Oprește accesul la rezultate' }));
    expect(await screen.findByRole('button', { name: 'Publică toate rezultatele' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Rezultatele sunt gata pentru elevi' })).not.toBeInTheDocument();
  });

  it('names the multi-upload link as the teacher’s, with no QR code', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true, multiUploadToken: FAKE_MULTI_TOKEN }, graded()));
    await screen.findByRole('region', { name: 'Rezultatele sunt gata pentru elevi' });
    expect(within(card()).getByLabelText(MULTI_LABEL)).toHaveValue(`${window.location.origin}/u/${FAKE_MULTI_TOKEN}`);
    expect(within(card()).getByText('Nu-l da elevilor: pe acest link ei nu își găsesc rezultatele.')).toBeInTheDocument();
    // One QR code only: the students'.
    expect(within(card()).getAllByTitle('Codul QR al linkului')).toHaveLength(1);
  });

  it('shows the card when one result is published alone', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done', publishedCount: 1 }, graded()));
    expect(await screen.findByRole('region', { name: 'Rezultatele sunt gata pentru elevi' })).toBeInTheDocument();
  });
```

Replace it with:

```tsx
describe('the panel Rezultate, where students find their results', () => {
  const PUBLISHED = 'Rezultatele sunt publicate. Elevii le văd în două feluri:';
  const box = () => screen.getByRole('region', { name: PUBLISHED });

  it('says in a grey box that the results wait, with the points still to check, and no way to see them yet', async () => {
    const rows = graded().map((upload) => (upload.studentId === 10 ? { ...upload, flagCount: 2 } : upload));
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    const waiting = await screen.findByRole('region', { name: 'Rezultatele nu sunt publicate' });
    expect(waiting).toHaveClass('publish-box');
    expect(waiting).not.toHaveClass('is-published');
    expect(within(waiting).getByText('Mai ai 2 puncte de verificat. Dacă publici acum, elevii văd punctajul de acum.')).toBeInTheDocument();
    expect(within(waiting).getByRole('button', { name: 'Publică toate rezultatele' })).toHaveClass('button');
    expect(screen.queryByText('Pe linkul lor')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Codul QR al linkului')).not.toBeInTheDocument();
  });

  it('says the students see nothing yet when no point waits', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done' }, graded()));
    const waiting = await screen.findByRole('region', { name: 'Rezultatele nu sunt publicate' });
    expect(within(waiting).getByText('Elevii nu văd încă rezultatele.')).toBeInTheDocument();
  });

  it("names the two ways once published, copies the test's link for the students, and goes back to grey when stopped", async () => {
    const user = userEvent.setup();
    renderAdmin(PAGE, apiWith({ status: 'done' }, graded()));
    await user.click(await screen.findByRole('button', { name: 'Publică toate rezultatele' }));
    const published = await screen.findByRole('region', { name: PUBLISHED });
    expect(published).toHaveClass('publish-box', 'is-published');
    const ways = within(published).getAllByRole('listitem');
    expect(ways.map((way) => way.querySelector('.publish-way-title')?.textContent)).toEqual([
      'Pe linkul lor',
      'Scanează din nou linkul testului pentru elevi',
    ]);
    expect(within(ways[0]!).getByText('Salvat pe telefon la încărcarea rezolvărilor. Nu trebuie să facă nimic.')).toBeInTheDocument();
    expect(within(ways[1]!).getByText('Codul QR de pe test, de pe telefonul cu care au trimis.')).toBeInTheDocument();
    expect(within(ways[1]!).getByTitle('Codul QR al linkului')).toBeInTheDocument();
    expect(within(published).getByText('Dacă oprești accesul, linkurile cu rezultate și pozele lor nu se mai deschid până publici din nou rezultatele.')).toBeInTheDocument();
    await user.click(within(ways[1]!).getByRole('button', { name: 'Copiază linkul' }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(within(ways[1]!).getByRole('button', { name: 'Copiat!' })).toBeInTheDocument();

    await user.click(within(published).getByRole('button', { name: 'Oprește accesul la rezultate' }));
    expect(await screen.findByRole('region', { name: 'Rezultatele nu sunt publicate' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: PUBLISHED })).not.toBeInTheDocument();
  });

  it('says when only some results are published, and offers to publish them all', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done', publishedCount: 1 }, graded()));
    const some = await screen.findByRole('region', { name: 'Unele rezultate sunt publicate. Elevii le văd în două feluri:' });
    expect(some).toHaveClass('is-published');
    expect(within(some).getByRole('button', { name: 'Publică toate rezultatele' })).toBeInTheDocument();
    expect(within(some).queryByRole('button', { name: 'Oprește accesul la rezultate' })).not.toBeInTheDocument();
    expect(within(some).getByText('Pe linkul lor')).toBeInTheDocument();
  });

  it("gives no teacher's multi-upload link in Rezultate", async () => {
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true, multiUploadToken: FAKE_MULTI_TOKEN }, graded()));
    await screen.findByRole('region', { name: PUBLISHED });
    expect(screen.queryByLabelText(MULTI_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nu-l da elevilor/)).not.toBeInTheDocument();
    expect(screen.getAllByTitle('Codul QR al linkului')).toHaveLength(1);
  });

  it('names the second way without a link when the test has none', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true, uploadToken: null }, graded()));
    await screen.findByRole('region', { name: PUBLISHED });
    expect(within(box()).getByText('Scanează din nou linkul testului pentru elevi')).toBeInTheDocument();
    expect(within(box()).queryByTitle('Codul QR al linkului')).not.toBeInTheDocument();
    expect(within(box()).queryByRole('button', { name: 'Copiază linkul' })).not.toBeInTheDocument();
    expect(within(box()).getByRole('button', { name: 'Oprește accesul la rezultate' })).toBeInTheDocument();
  });

  it('shows the QR code on the whole screen, and gives the focus back to its button when it closes', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true }, graded()));
    await screen.findByRole('region', { name: PUBLISHED });
    const show = within(box()).getByRole('button', { name: 'Arată codul QR pe tot ecranul' });
    await userEvent.click(show);
    const dialog = screen.getByRole('dialog', { name: 'Codul QR pentru elevi' });
    expect(within(dialog).getByText(`${window.location.origin}/u/${FAKE_TOKEN}`)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Închide' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(show).toHaveFocus();
  });

  it("shows the test's link in a field, selected, when the browser refuses to copy it", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('Refuzat', 'NotAllowedError'));
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true }, graded()));
    await screen.findByRole('region', { name: PUBLISHED });
    await user.click(within(box()).getByRole('button', { name: 'Copiază linkul' }));
    const field = await within(box()).findByLabelText('Linkul testului pentru elevi');
    expect(field).toHaveValue(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(field).toHaveFocus();
    expect(within(box()).getByText('Nu am putut copia linkul. Copiază-l de aici.')).toBeInTheDocument();
  });
```

- [ ] **Step 4: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true }, graded()));
    await screen.findByRole('region', { name: 'Rezultatele sunt gata pentru elevi' });
    await userEvent.click(within(card()).getByRole('button', { name: 'Descarcă codul QR' }));
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledWith(png, 'cod-qr-elevi-6E2-26T1.png'));
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(within(card()).getByRole('button', { name: 'Descarcă codul QR' })).toBeEnabled();
  });
```

Replace it with:

```tsx
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true }, graded()));
    await screen.findByRole('region', { name: PUBLISHED });
    await userEvent.click(within(box()).getByRole('button', { name: 'Descarcă codul QR' }));
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledWith(png, 'cod-qr-elevi-6E2-26T1.png'));
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(within(box()).getByRole('button', { name: 'Descarcă codul QR' })).toBeEnabled();
  });
```

- [ ] **Step 5: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true }, graded()));
    await screen.findByRole('region', { name: 'Rezultatele sunt gata pentru elevi' });
    await userEvent.click(within(card()).getByRole('button', { name: 'Descarcă codul QR' }));
    expect(await within(card()).findByText('Nu am putut descărca codul QR.')).toBeInTheDocument();
    expect(saveFile).not.toHaveBeenCalled();
```

Replace it with:

```tsx
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true }, graded()));
    await screen.findByRole('region', { name: PUBLISHED });
    await userEvent.click(within(box()).getByRole('button', { name: 'Descarcă codul QR' }));
    expect(await within(box()).findByText('Nu am putut descărca codul QR.')).toBeInTheDocument();
    expect(saveFile).not.toHaveBeenCalled();
```

- [ ] **Step 6: Run the tests to see them fail**

Run: `npx vitest run src/admin/testPage/ResultsPanel.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  11 failed | 21 passed (32)`: the panel still has the old publishing lines and the old card, so the boxes are not there (`Unable to find role="region" and name "Rezultatele nu sunt publicate"`, `Unable to find role="region" and name "Rezultatele sunt publicate. Elevii le văd în două feluri:"`, `… "Unele rezultate sunt publicate. Elevii le văd în două feluri:"`, and the heading in "publishes every result, and stops every link again"); each waits its 3 s before it fails. The other 21 tests of the file pass.

- [ ] **Step 7: Edit `src/admin/testPage/UploadLink.tsx`**

Find this block:

```tsx
// library draws it in its own effect, which runs before this one.
function QrDownload({ url, fileName }: { url: string; fileName: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
```

Replace it with:

```tsx
// library draws it in its own effect, which runs before this one.
export function QrDownload({ url, fileName }: { url: string; fileName: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
```

- [ ] **Step 8: Replace `src/admin/testPage/ResultsAccess.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useId, useRef, useState } from 'react';
import type { TestInfo } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { IconClock, IconDone } from '../shell/icons.tsx';
import { MoveOnLink } from './MoveOnLink.tsx';
import { QrDownload, QrOverlay, uploadLink } from './UploadLink.tsx';

// Whether a test has results to publish or to stop: something is graded, or
// results are already open (for all, or for single uploads). Before that the
// teacher has nothing to decide, so the panel shows no button.
export function hasResultsToManage(test: Pick<TestInfo, 'status' | 'gradedCount' | 'resultsOpen' | 'publishedCount'>): boolean {
  return test.status !== 'draft' && (test.gradedCount > 0 || test.resultsOpen || test.publishedCount > 0);
}

// Whether students can read results now: open for all, or some published alone.
export function hasPublishedResults(test: Pick<TestInfo, 'resultsOpen' | 'publishedCount'>): boolean {
  return test.resultsOpen || test.publishedCount > 0;
}

// Rezultate before there is anything to publish (redesign spec §11.9): its
// one next step is the stage Corectare.
export function NoResultsYet() {
  return (
    <EmptyState
      icon={<IconClock />}
      title="Rezultatele se publică după corectare"
      action={
        <MoveOnLink stage="Corectare" className="button-quiet button-small">
          Mergi la Corectare
        </MoveOnLink>
      }
    >
      Când lucrările sunt corectate, le publici de aici; fiecare elev primește linkul lui, cu explicații detaliate pentru fiecare problemă și o sinteză finală cu ce merge bine și recomandări.
    </EmptyState>
  );
}

// The box at the top of Rezultate (spec 2026-11-14, design C3): publishing
// and stopping the results of every student at once, and, once students can
// read results, the two ways they find them. Closing also takes back the
// results published alone (the API does it), so it closes every link.
export function ResultsAccess({ test, onChanged }: { test: TestInfo; onChanged: () => Promise<void> }) {
  const api = useApi();
  const headingId = useId();
  const toggle = useMutation({
    mutationFn: () => api.setResultsOpen(test.code, !test.resultsOpen),
    onSuccess: onChanged,
  });
  if (!hasResultsToManage(test)) return <NoResultsYet />;

  const button = test.resultsOpen ? (
    <button type="button" className="button-quiet button-small" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
      Oprește accesul la rezultate
    </button>
  ) : (
    <button type="button" className="button button-small" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
      Publică toate rezultatele
    </button>
  );
  // Points still to check, said before the teacher publishes them all.
  const waiting =
    !test.resultsOpen && test.flagCount > 0 ? (
      <p className="publish-wait">
        Mai ai {countLabel(test.flagCount, 'punct de verificat', 'puncte de verificat')}. Dacă publici acum, elevii văd punctajul de acum.
      </p>
    ) : null;

  if (!hasPublishedResults(test)) {
    return (
      <section className="publish-box" aria-labelledby={headingId}>
        <div className="publish-head">
          <h3 id={headingId}>Rezultatele nu sunt publicate</h3>
          {button}
        </div>
        {waiting ?? <p className="hint">Elevii nu văd încă rezultatele.</p>}
        {toggle.error && <ErrorMessage error={toggle.error} />}
      </section>
    );
  }
  return (
    <section className="publish-box is-published" aria-labelledby={headingId}>
      <div className="publish-head">
        <span className="publish-check" aria-hidden="true">
          <IconDone />
        </span>
        <h3 id={headingId}>
          {test.resultsOpen ? 'Rezultatele sunt publicate.' : 'Unele rezultate sunt publicate.'} Elevii le văd în două feluri:
        </h3>
        {button}
      </div>
      {waiting}
      {test.resultsOpen && (
        <p className="hint publish-stop-hint">Dacă oprești accesul, linkurile cu rezultate și pozele lor nu se mai deschid până publici din nou rezultatele.</p>
      )}
      <ol className="publish-ways">
        <li>
          <p className="publish-way-title">Pe linkul lor</p>
          <p className="hint">Salvat pe telefon la încărcarea rezolvărilor. Nu trebuie să facă nimic.</p>
        </li>
        <li>
          <p className="publish-way-title">Scanează din nou linkul testului pentru elevi</p>
          <p className="hint">Codul QR de pe test, de pe telefonul cu care au trimis.</p>
          {test.uploadToken !== null && <StudentLink code={test.code} token={test.uploadToken} />}
        </li>
      </ol>
      {toggle.error && <ErrorMessage error={toggle.error} />}
    </section>
  );
}

// The test's link for the students, in the box: copy it, save its QR code as
// a PNG file, or show it on the whole screen. When the browser refuses to
// copy, the link shows in a field, selected, to copy by hand.
function StudentLink({ code, token }: { code: string; token: string }) {
  const url = uploadLink(token);
  const [copied, setCopied] = useState(false);
  const [refused, setRefused] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const showButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!refused) return;
    field.current?.focus();
    field.current?.select();
  }, [refused]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setRefused(true);
    }
  };
  return (
    <div className="publish-link">
      <QRCodeSVG value={url} size={88} marginSize={2} title="Codul QR al linkului" className="publish-qr" />
      <div className="publish-link-actions">
        <button type="button" className="button-quiet button-small" onClick={copy}>
          {copied ? 'Copiat!' : 'Copiază linkul'}
        </button>
        <QrDownload url={url} fileName={`cod-qr-elevi-${code}.png`} />
        <button ref={showButton} type="button" className="button-quiet button-small" onClick={() => setFullScreen(true)}>
          Arată codul QR pe tot ecranul
        </button>
      </div>
      {refused && (
        <span className="result-share-box">
          <span className="hint">Nu am putut copia linkul. Copiază-l de aici.</span>
          <input ref={field} type="text" readOnly value={url} aria-label="Linkul testului pentru elevi" onFocus={(event) => event.target.select()} />
        </span>
      )}
      {fullScreen && (
        <QrOverlay
          url={url}
          onClose={() => {
            setFullScreen(false);
            showButton.current?.focus();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 9: Delete `src/admin/testPage/StudentAccessCard.tsx`**

Run: `git rm src/admin/testPage/StudentAccessCard.tsx`

- [ ] **Step 10: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
import { NoResultsYet, ResultsAccess } from './ResultsAccess.tsx';
import { StudentAccessCard } from './StudentAccessCard.tsx';
import { overviewLeadsOn, ReviewOverview, showsOverview } from './ReviewOverview.tsx';
```

Replace it with:

```tsx
import { NoResultsYet, ResultsAccess } from './ResultsAccess.tsx';
import { overviewLeadsOn, ReviewOverview, showsOverview } from './ReviewOverview.tsx';
```

- [ ] **Step 11: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
      <ResultsAccess test={test} onChanged={onChanged} />
      <StudentAccessCard test={test} />
      <div className="results-layout">
```

Replace it with:

```tsx
      <ResultsAccess test={test} onChanged={onChanged} />
      <div className="results-layout">
```

- [ ] **Step 12: Edit `src/ui/brand.css`**

Find this block:

```css

/* The panel Rezultate (spec 2026-11-14): "Raportul clasei" first in the
```

Replace it with:

```css

/* The box at the top of Rezultate (spec 2026-11-14): grey while the results
   wait to be published, green once students can read them, with the two ways
   they find them, numbered. */
.publish-box {
  display: grid;
  gap: 0.5rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-panel);
}

.publish-box.is-published {
  border-color: color-mix(in srgb, var(--ok-fg) 35%, transparent);
  background: var(--ok-bg);
}

.publish-box p {
  margin: 0;
}

.publish-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
}

.publish-head h3 {
  flex: 1 1 16rem;
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.publish-box.is-published .publish-head h3 {
  color: var(--ok-fg);
}

.publish-check {
  display: grid;
  flex: none;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--ok-fg);
  color: var(--sheet);
}

.publish-check svg {
  width: 1.125rem;
  height: 1.125rem;
}

.publish-wait {
  color: var(--orange);
}

.publish-ways {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 0.75rem 1.5rem;
  margin: 0.25rem 0 0;
  padding: 0;
  list-style: none;
  counter-reset: way;
}

.publish-ways > li {
  position: relative;
  display: grid;
  align-content: start;
  gap: 0.25rem;
  padding-left: 2rem;
  counter-increment: way;
}

.publish-ways > li::before {
  content: counter(way);
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border: 1px solid color-mix(in srgb, var(--ok-fg) 40%, transparent);
  border-radius: 50%;
  background: var(--sheet);
  color: var(--ok-fg);
  font-size: 0.8125rem;
  font-weight: 600;
}

.publish-way-title {
  font-weight: 500;
}

.publish-link {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin-top: 0.25rem;
}

.publish-qr {
  flex: none;
  width: 88px;
  height: 88px;
  border-radius: 6px;
  background: #ffffff;
}

.publish-link-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.publish-link .result-share-box {
  flex-basis: 100%;
}

/* The panel Rezultate (spec 2026-11-14): "Raportul clasei" first in the
```

- [ ] **Step 13: Edit `src/ui/brand.css`**

Find this block:

```css
  margin-left: 0;
}

/* Rezultate, once published: where students find their results. Green edge:
   a done step, not something that waits. */
.student-access {
  gap: 0.75rem;
  margin-block: 1rem;
  border-color: var(--ok-fg);
  border-left-width: 4px;
}

.student-access h3 {
  margin: 0;
  color: var(--ok-fg);
}

.student-access p {
  margin: 0;
}

.student-access-teacher {
  padding-top: 0.75rem;
  border-top: 1px solid var(--rule);
}
```

Replace it with:

```css
  margin-left: 0;
}
```

- [ ] **Step 14: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, filled orange (`.button button-wait`) for the one main action of a screen whose work waits on the teacher ("Începe verificarea" in Verificare), and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `Crumbs.tsx` is the path at the top of the test page and of the paper page ("Teste › Clasa 7E2 › <test>", a `nav` "Unde ești"; the last step is the page itself, not a link). `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă and Corectare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; once results are published (for all, or one alone), `StudentAccessCard.tsx`: where students find their results (the students' link with its QR code and "Descarcă codul QR", a PNG; the multi-upload link named "Doar pentru profesor", with no QR code; and the help text); the students' result links in `ResultLinksTable.tsx`, with the grade right after the name (a `GradeChip`, with its points still to check beside it in an orange label), the points, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Raportul clasei" in `ReportCard.tsx` (spec 2026-11-14), beside the table in a wide panel and above it in a narrow one (a container query on `.results-layout`): the average in its grade colour, the grades by group (`gradeGroups` of `shared/stats.ts`, counted from the uploads list: no report query), "Deschide raportul" (the panel's main button) and "CSV pentru catalog" (a quiet text button: the class report's CSV, read when pressed); the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the subject (`SubjectForm.tsx`: "Se stabilește la corectare" until the robot finds it, "Alege materia" or "Schimbă materia" opening the seven subjects in place (while the robot reads the test, only a line that says when the subject can change), with a line when the list is made again and the papers graded again), the files, the students' link while the test is a draft or open, rename, archive (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`), delete), the overview of Verificare (`ReviewOverview.tsx`: the graded papers that had points, counted with `flagCount` and `checkedCount`; "<checked> din <total> verificate", its bar, "Mai sunt …" and the orange "Începe verificarea" (nothing checked yet) or "Continuă verificarea" into the paper page at the first point left; "De verificat", a label per student with points left ("<checked>/<total>", opening that student's first point), and "Gata", a label per student done (opening the paper with all its exercises); once all is checked a green box with "Mergi la Rezultate" (the panel then leaves out "Următoarea etapă"), and "Nimic de verificat." when no graded paper had a point; CES as the other tables show it (`ces` or `variant === 'ces'`), in the label's accessible name too; no papers table and no list of the points: the paper page decides them), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page learns the answer from the version check of the shell), the uploads table (`UploadsTable.tsx`, the full width of its card; the grade right after the name, a `GradeChip.tsx`: the grade in a soft chip of the class report's colours, `.points-N` of `pointsLevel(grade, 10)`; "De verificat" in an orange label; both papers tables are drawn like the points table of Verificare, with no bold: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off; a student who sent nothing is "Nu a trimis" while the uploads are open and "Nu a participat" after; after, an upload left open with files is "Așteaptă corectarea" and one with no file "Nu a participat"), "Recorectează tot"). `pages/PaperPage.tsx` and `paperPage/` are the paper page (spec `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md` §4, `/teste/:code/elevi/:submissionId`): the path (`Crumbs`), the head (`PaperHead.tsx`: `.submission-head`, the name, the test, the state and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right; then the result link row; `usePaperActions` holds Recorectează, Resetează and Reîncearcă and the news after them), the switch "Toate exercițiile" / "Doar de verificat (N)" (N the points of the whole test; the view is in the address, `vedere=verificare`, and stays when she moves), then the moves, small and on one row also on a phone: "‹ Punct 3/47 ›" (a group "Punctele de verificat", only the points to check: the arrows are "Punctul anterior" and "Următorul punct", the blue one, with the key in their tooltip, and between them the open point's place among the points J and K walk), "‹ Elev ›" (a group "Elevii", "Elevul anterior" and "Elevul următor"; an arrow with nowhere to go is off) and "Lucrarea" (a picture icon, pressed while the paper shows, which hides it or shows it again), then three columns: "Elevii" (`StudentList.tsx`: every upload with a paper, the grade, the points to check in orange or the state; only the points to check: the papers with points first; a name opens that paper at the top of the window; it folds to a strip, kept in this browser as `quickeval:paperStudentsFolded`), the exercises (`GradedResult` with `check`: a click on a row or its "Arată pe lucrare" opens it, `?punct=<item id>` or `pagini`, and a second click on the open row closes it, after `CLOSE_DELAY` (300 ms), so the first click of a double or triple click, which selects a word to copy, never closes it (a click that ends a selection of the row's text does nothing); a row to check stays open when a click opens another row (`keptKeys`, kept in `Paper` until the teacher closes or checks it, none for another paper; only a click on a row, its "Verifică" or its "Arată pe lucrare" keeps it, `paperKeep` in the navigation state, never J, K or the buttons), so the rows under it never move: its decision stays in place, dimmed, `inert` and `aria-hidden` (`DecisionSlot`), and a click on its row or its "Verifică" opens it again; the A key and the focus after a decision reach only the open row's slot (`.decision-slot.is-current`); "Doar de verificat" keeps only the rows to check and the open one, without the texts for the student; a row to check is calm: its points in a soft orange label (`.points-pill`) and one "Verifică" icon button that opens it (an orange magnifier with a check, like the pencil, its word in its name and tooltip), with no reason in the row; the open row to check shows `PointDecision.tsx` under it, region "Decizia", in a box with a light orange border: the robot's reason, "Accept <points>" (the robot's points), the stepper (− and + move by 0,5 on the 0,05 steps, between 0 and the maximum; any value in steps of 0,05 can be typed) and "Salvează", and what the grade becomes with another value; for the pages, the reason and "Am verificat paginile"; while a decision shows, the bar names the keys between the switch and the moves, only when the whole line fits there (`.review-keys`: a one-line wrapping box whose line wraps out of sight)), and the paper (`reviewPage/ReviewPhoto.tsx`, staying in view and level with the other two columns; its × button ("Ascunde lucrarea", top right) hides it, the exercises taking its room, and the focus goes to "Lucrarea" in the bar; the choice is kept in this browser as `quickeval:paperPhotoFolded`; a graded paper with nothing left to check opens with it hidden (chosen when the paper opens, from its upload row), and its toggles there are not saved; graded again, it shows as the saved choice says; while it is folded, 1–9 do nothing and the bar does not name them, and "Arată pe lucrare" shows it again (an open row stays open): each page with "2/3" beside the name and its file's name and size, as the student sent it; over the photo, a floating bar on the top left holds "Arată chenarul" (an orange dashed-frame toggle, while the open answer has an area) and "Toată pagina" (off while the page is whole), and the zoom's − and + float alone on the top right; a photo zooms inside the pane (a left click, a right click and the two buttons over the photo take one small step, out and in; two fingers pinch on a touch screen, and the wheel scrolls the page), a line over the page says what a click does until she zooms, in the words of the pointer at hand (a phone has no right button), and the open exercise draws an orange border around the robot's area of its answer, on the whole page, because the page never zooms by itself; the border's arrows step through the parts of an answer, each part opening on its page, whole). The exercises get three fifths of the room the students leave, the paper two; below 1200px the students go under the exercises, and below 900px one column: the exercises, the paper, the students. `paperPage/paths.ts` writes the addresses (replaced, never a new step in the history) and picks the students' order and the points J and K walk: every point of the test while only the points to check show, else the open student's. `reviewPage/points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first) and steps between them. The old address of the review, `/teste/:code/verificare?lucrare=&punct=`, opens the page with only the points to check (`ReviewRedirect`: the named paper and point, else `firstSpot()`, else the test's Verificare); every link to the points to check uses it (`reviewPath`). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point: with only the points to check, also on the next student; with all the exercises, the next point of the same student, and when none is left the row stays open and "Elevul următor" takes the focus. It moves only if the teacher is still at the decided point (a call-level `onSuccess` of `mutate`, which does not run once the page is gone). The shell draws the page anew for another address path (`ErrorBoundary key={location.pathname}`), so where the focus goes after a decision rides in the navigation state (`paperFocus`), given once per address. A new address path opens at the top of the window (`Layout.tsx`, a PUSH only): a replaced one (the paper page's moves) keeps its place, and Back or Forward leave it to the browser. A refused decision reads the paper and the test again. The papers the teacher can move to next (the next and the previous student, the next point's paper) are read ahead, so another student's page shows at once; while a paper loads, its place keeps a screen's height. A paper with no result now (uploading, sent, graded again) shows its pages and why (`submissionPage/waitingText.ts`), a failed one "Reîncearcă"; when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A (presses "Accept" of an open row to check), J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). "Alte acțiuni" (`useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. Points are never bold. Without the paper page (no page uses that plain list now), an exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds "Verifică" or "Arată pe lucrare" (paper page only) and the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

Replace it with:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, filled orange (`.button button-wait`) for the one main action of a screen whose work waits on the teacher ("Începe verificarea" in Verificare), and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `Crumbs.tsx` is the path at the top of the test page and of the paper page ("Teste › Clasa 7E2 › <test>", a `nav` "Unde ești"; the last step is the page itself, not a link). `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă and Corectare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8, spec 2026-11-14: the box at its top in `ResultsAccess.tsx`, grey with "Publică toate rezultatele" while no result is published, green once students can read results (for all, or some alone), with "Oprește accesul la rezultate" (or "Publică toate rezultatele" while only some are) and the two ways students find them, numbered: their own link, kept on the phone, and the test's link for the students scanned again (its QR code, "Copiază linkul", "Descarcă codul QR", a PNG, and "Arată codul QR pe tot ecranul"); the teacher's multi-upload link is not in Rezultate; the students' result links in `ResultLinksTable.tsx`, with the grade right after the name (a `GradeChip`, with its points still to check beside it in an orange label), the points, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Raportul clasei" in `ReportCard.tsx` (spec 2026-11-14), beside the table in a wide panel and above it in a narrow one (a container query on `.results-layout`): the average in its grade colour, the grades by group (`gradeGroups` of `shared/stats.ts`, counted from the uploads list: no report query), "Deschide raportul" (the panel's main button) and "CSV pentru catalog" (a quiet text button: the class report's CSV, read when pressed); the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the subject (`SubjectForm.tsx`: "Se stabilește la corectare" until the robot finds it, "Alege materia" or "Schimbă materia" opening the seven subjects in place (while the robot reads the test, only a line that says when the subject can change), with a line when the list is made again and the papers graded again), the files, the students' link while the test is a draft or open, rename, archive (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`), delete), the overview of Verificare (`ReviewOverview.tsx`: the graded papers that had points, counted with `flagCount` and `checkedCount`; "<checked> din <total> verificate", its bar, "Mai sunt …" and the orange "Începe verificarea" (nothing checked yet) or "Continuă verificarea" into the paper page at the first point left; "De verificat", a label per student with points left ("<checked>/<total>", opening that student's first point), and "Gata", a label per student done (opening the paper with all its exercises); once all is checked a green box with "Mergi la Rezultate" (the panel then leaves out "Următoarea etapă"), and "Nimic de verificat." when no graded paper had a point; CES as the other tables show it (`ces` or `variant === 'ces'`), in the label's accessible name too; no papers table and no list of the points: the paper page decides them), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page learns the answer from the version check of the shell), the uploads table (`UploadsTable.tsx`, the full width of its card; the grade right after the name, a `GradeChip.tsx`: the grade in a soft chip of the class report's colours, `.points-N` of `pointsLevel(grade, 10)`; "De verificat" in an orange label; both papers tables are drawn like the points table of Verificare, with no bold: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off; a student who sent nothing is "Nu a trimis" while the uploads are open and "Nu a participat" after; after, an upload left open with files is "Așteaptă corectarea" and one with no file "Nu a participat"), "Recorectează tot"). `pages/PaperPage.tsx` and `paperPage/` are the paper page (spec `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md` §4, `/teste/:code/elevi/:submissionId`): the path (`Crumbs`), the head (`PaperHead.tsx`: `.submission-head`, the name, the test, the state and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right; then the result link row; `usePaperActions` holds Recorectează, Resetează and Reîncearcă and the news after them), the switch "Toate exercițiile" / "Doar de verificat (N)" (N the points of the whole test; the view is in the address, `vedere=verificare`, and stays when she moves), then the moves, small and on one row also on a phone: "‹ Punct 3/47 ›" (a group "Punctele de verificat", only the points to check: the arrows are "Punctul anterior" and "Următorul punct", the blue one, with the key in their tooltip, and between them the open point's place among the points J and K walk), "‹ Elev ›" (a group "Elevii", "Elevul anterior" and "Elevul următor"; an arrow with nowhere to go is off) and "Lucrarea" (a picture icon, pressed while the paper shows, which hides it or shows it again), then three columns: "Elevii" (`StudentList.tsx`: every upload with a paper, the grade, the points to check in orange or the state; only the points to check: the papers with points first; a name opens that paper at the top of the window; it folds to a strip, kept in this browser as `quickeval:paperStudentsFolded`), the exercises (`GradedResult` with `check`: a click on a row or its "Arată pe lucrare" opens it, `?punct=<item id>` or `pagini`, and a second click on the open row closes it, after `CLOSE_DELAY` (300 ms), so the first click of a double or triple click, which selects a word to copy, never closes it (a click that ends a selection of the row's text does nothing); a row to check stays open when a click opens another row (`keptKeys`, kept in `Paper` until the teacher closes or checks it, none for another paper; only a click on a row, its "Verifică" or its "Arată pe lucrare" keeps it, `paperKeep` in the navigation state, never J, K or the buttons), so the rows under it never move: its decision stays in place, dimmed, `inert` and `aria-hidden` (`DecisionSlot`), and a click on its row or its "Verifică" opens it again; the A key and the focus after a decision reach only the open row's slot (`.decision-slot.is-current`); "Doar de verificat" keeps only the rows to check and the open one, without the texts for the student; a row to check is calm: its points in a soft orange label (`.points-pill`) and one "Verifică" icon button that opens it (an orange magnifier with a check, like the pencil, its word in its name and tooltip), with no reason in the row; the open row to check shows `PointDecision.tsx` under it, region "Decizia", in a box with a light orange border: the robot's reason, "Accept <points>" (the robot's points), the stepper (− and + move by 0,5 on the 0,05 steps, between 0 and the maximum; any value in steps of 0,05 can be typed) and "Salvează", and what the grade becomes with another value; for the pages, the reason and "Am verificat paginile"; while a decision shows, the bar names the keys between the switch and the moves, only when the whole line fits there (`.review-keys`: a one-line wrapping box whose line wraps out of sight)), and the paper (`reviewPage/ReviewPhoto.tsx`, staying in view and level with the other two columns; its × button ("Ascunde lucrarea", top right) hides it, the exercises taking its room, and the focus goes to "Lucrarea" in the bar; the choice is kept in this browser as `quickeval:paperPhotoFolded`; a graded paper with nothing left to check opens with it hidden (chosen when the paper opens, from its upload row), and its toggles there are not saved; graded again, it shows as the saved choice says; while it is folded, 1–9 do nothing and the bar does not name them, and "Arată pe lucrare" shows it again (an open row stays open): each page with "2/3" beside the name and its file's name and size, as the student sent it; over the photo, a floating bar on the top left holds "Arată chenarul" (an orange dashed-frame toggle, while the open answer has an area) and "Toată pagina" (off while the page is whole), and the zoom's − and + float alone on the top right; a photo zooms inside the pane (a left click, a right click and the two buttons over the photo take one small step, out and in; two fingers pinch on a touch screen, and the wheel scrolls the page), a line over the page says what a click does until she zooms, in the words of the pointer at hand (a phone has no right button), and the open exercise draws an orange border around the robot's area of its answer, on the whole page, because the page never zooms by itself; the border's arrows step through the parts of an answer, each part opening on its page, whole). The exercises get three fifths of the room the students leave, the paper two; below 1200px the students go under the exercises, and below 900px one column: the exercises, the paper, the students. `paperPage/paths.ts` writes the addresses (replaced, never a new step in the history) and picks the students' order and the points J and K walk: every point of the test while only the points to check show, else the open student's. `reviewPage/points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first) and steps between them. The old address of the review, `/teste/:code/verificare?lucrare=&punct=`, opens the page with only the points to check (`ReviewRedirect`: the named paper and point, else `firstSpot()`, else the test's Verificare); every link to the points to check uses it (`reviewPath`). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point: with only the points to check, also on the next student; with all the exercises, the next point of the same student, and when none is left the row stays open and "Elevul următor" takes the focus. It moves only if the teacher is still at the decided point (a call-level `onSuccess` of `mutate`, which does not run once the page is gone). The shell draws the page anew for another address path (`ErrorBoundary key={location.pathname}`), so where the focus goes after a decision rides in the navigation state (`paperFocus`), given once per address. A new address path opens at the top of the window (`Layout.tsx`, a PUSH only): a replaced one (the paper page's moves) keeps its place, and Back or Forward leave it to the browser. A refused decision reads the paper and the test again. The papers the teacher can move to next (the next and the previous student, the next point's paper) are read ahead, so another student's page shows at once; while a paper loads, its place keeps a screen's height. A paper with no result now (uploading, sent, graded again) shows its pages and why (`submissionPage/waitingText.ts`), a failed one "Reîncearcă"; when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A (presses "Accept" of an open row to check), J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). "Alte acțiuni" (`useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. Points are never bold. Without the paper page (no page uses that plain list now), an exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds "Verifică" or "Arată pe lucrare" (paper page only) and the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

- [ ] **Step 15: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown

The panel of the stage Rezultate (§6). A draft has one line: "Rezultatele se publică după corectare." Every other test:
```

Replace it with:

```markdown

The panel's look changed later, in `docs/superpowers/specs/2026-11-14-rezultate-page-design.md`: the stage's sentence, the box at the top with the two ways students find their results, the table with the grade first, and "Raportul clasei" beside the table in place of "Pentru tine". Where the two disagree, the newer spec holds.

The panel of the stage Rezultate (§6). A draft has one line: "Rezultatele se publică după corectare." Every other test:
```

- [ ] **Step 16: Edit `docs/superpowers/specs/2026-11-14-rezultate-page-design.md`**

Find this block:

```markdown

   **Published** (`test.resultsOpen`, or every graded paper published one by one): a green box (`--ok-bg`, a green check).
   - Its heading: "Rezultatele sunt publicate. Elevii le văd în două feluri:"
   - On the right of the heading: "Oprește accesul la rezultate" (quiet button).
   - Way 1, "Pe linkul lor": "Salvat pe telefon la încărcarea rezolvărilor. Nu trebuie să facă nimic."
   - Way 2, "Scanează din nou linkul testului pentru elevi": "Codul QR de pe test, de pe telefonul cu care au trimis." Then the actions for the students' link (`uploadToken`): "Copiază linkul", and the small QR code. A click on the QR code opens it on the whole screen (`QrOverlay`). A small "Descarcă codul QR" stays.
   - The message as one sentence, for a screen reader and as the box's summary: "Elevii văd rezultatele pe linkurile lor, salvate la încărcarea rezolvărilor, sau scanează din nou linkul testului pentru elevi."

```

Replace it with:

```markdown

   **Published** (students can read results: `test.resultsOpen`, or some results published one by one, `publishedCount > 0`, as the old card): a green box (`--ok-bg`, a green check).
   - Its heading: "Rezultatele sunt publicate. Elevii le văd în două feluri:" When only some results are published one by one: "Unele rezultate sunt publicate. Elevii le văd în două feluri:"
   - On the right of the heading: "Oprește accesul la rezultate" (quiet button) while all are published; "Publică toate rezultatele" (primary) while only some are, with the warning about the points still to check.
   - Under the heading, while all are published, today's hint about stopping: "Dacă oprești accesul, linkurile cu rezultate și pozele lor nu se mai deschid până publici din nou rezultatele."
   - Way 1, "Pe linkul lor": "Salvat pe telefon la încărcarea rezolvărilor. Nu trebuie să facă nimic."
   - Way 2, "Scanează din nou linkul testului pentru elevi": "Codul QR de pe test, de pe telefonul cu care au trimis." Then, when the test has its students' link (`uploadToken`): the small QR code, "Copiază linkul" (a refused copy shows the link in a field, selected), "Descarcă codul QR" and "Arată codul QR pe tot ecranul" (`QrOverlay`; closing it gives the focus back to the button).
   - The two ways are the message itself, numbered: no extra sentence repeats them.

```

- [ ] **Step 17: Edit `docs/superpowers/specs/2026-11-14-rezultate-page-design.md`**

Find this block:

```markdown
   - Its heading: "Rezultatele nu sunt publicate".
   - It keeps today's warning: "Mai ai N puncte de verificat. Dacă publici acum, elevii văd punctajul de acum."
   - The button: "Publică toate rezultatele" (primary).
```

Replace it with:

```markdown
   - Its heading: "Rezultatele nu sunt publicate".
   - It keeps today's warning: "Mai ai N puncte de verificat. Dacă publici acum, elevii văd punctajul de acum." With no point to check: "Elevii nu văd încă rezultatele."
   - The button: "Publică toate rezultatele" (primary).
```

- [ ] **Step 18: Run the typecheck and the whole suite**

Run: `npm run typecheck`
Expected: no output after the command line (exit code 0).

Run: `npm test`
Expected: `Test Files  182 passed | 1 skipped (183)`, `Tests  2785 passed | 3 skipped (2788)` (the same twice more, once with `TZ=UTC`). One run on a busy PC failed 4 server and robot tests this plan does not touch (`server/routes/evaluation.test.ts`, `server/routes/runner.test.ts`, `runner/run.test.ts`, `runner/tasks.test.ts`, with `ECONNRESET` or an `internal` answer from the local worker): run those four files alone; they pass.

- [ ] **Step 19: Commit**

```bash
git add src/admin/testPage/UploadLink.tsx src/admin/testPage/ResultsAccess.tsx src/admin/testPage/StagePanel.tsx src/admin/testPage/ResultsPanel.test.tsx src/ui/brand.css src/AGENTS.md docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md docs/superpowers/specs/2026-11-14-rezultate-page-design.md
git commit -m "Publish from one box that names the two ways students find their results"
```

(`git rm` already staged the deleted file.)

Run: `git diff --stat refs/protorz/r3 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

### After Task 3: Look at the page

- [ ] **Step 1: Check the panel in the browser**

Run `npm run db:local` once, then `npm run dev:api` and `npm run dev:web` (two terminals), and open a done test's Rezultate at `http://localhost:5173/teacher/teste/<code>#rezultate` at 1440 px and at 1024 px, light and dark.
Expected: the sentence fills the panel; the green box (or the grey one) at the top; at 1440 px the table on the left and "Raportul clasei" on the right; at 1024 px the card above the table; the grade chips coloured, no bold in the tables; Corectare's table looks the same. No page scrolls sideways (the table may scroll inside its box).

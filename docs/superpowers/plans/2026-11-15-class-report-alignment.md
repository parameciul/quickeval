# MQGrader: the class report like the test page, and readable on a phone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The class report (`/teste/:code/raport`) reads like the test page (no bold, the grade in a `GradeChip` with its orange "de verificat" pill, the average in its grade colour, "Notele pe grupe" in the coloured bars of the test page's "Raportul clasei" card), and on a phone each student's name and grade stay in view while the points scroll (design C1).

**Architecture:** Front end only: no API, database or robot change, no migration; the PDF and the CSV do not change. Task 1 changes the look at every width: `ReportTables.tsx` draws the grade with `GradeChip`, the pill with `.points-pill`, the bars with the `bar-N` classes of `ReportCard` (their levels shared as `GRADE_GROUP_LEVELS` in `src/ui/format.ts`), and `brand.css` drops the bold. Task 2 is the phone: the page asks `useMediaQuery(PHONE)` (the query moves from `Layout.tsx` to `src/ui/useMediaQuery.ts`) and passes `phone` to `ResultsTable`, which then puts Nota right after Elev and Total last, marks the table `is-phone` (the name 8.25rem wide and the grade sticky beside it) and shows only the pill's count; `brand.css` puts the tiles first, then "Notele pe grupe", then the other parts.

**Tech Stack:** Node 24, TypeScript, React 19, React Router, TanStack Query, Vitest, Testing Library. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-15-class-report-alignment-design.md` (approved by the user on 2026-11-15). Root `AGENTS.md` and `src/AGENTS.md` hold the project rules. The mockups the user chose from are `.superpowers/mock/report.html` and `.superpowers/mock/compare.html`, git-ignored, on the user's PC only.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- The brand is flat: `src/ui/brand.css` has no `gradient(` (`src/ui/brand.test.ts` checks it). This plan adds no colour token. Orange (`.points-pill`) is only for what waits on the teacher: a grade's colour never replaces the "de verificat" pill.
- The report's PDF (`src/admin/pdf/classPdf.ts`) and CSV (`shared/csv.ts`) keep their columns and their order.
- Do not run Prettier or any formatter.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A`.
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root, on the branch that holds this plan. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy. If only tests of those three files time out, or of `server/routes/evaluation.test.ts`, `server/routes/runner.test.ts` and `runner/tasks.test.ts` (an `ECONNRESET` or an `internal` answer from the local worker on a busy PC), run the failed files alone with `npx vitest run <files>`; the full run then counts as passed when its failed and passed tests add up to the expected passed number.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; write exactly the content given in place of all of it.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact for the branch alone. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/protocr/cr1` and `refs/protocr/cr2`, one per task, on `refs/protocr/crbase` (the commit that adds the spec, `98c91fb`). After Task N, `git diff --stat refs/protocr/crN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`).

## Rulings made while planning

Settled while building the prototype and looking at it on 2026-11-15 with sample data (1900 px, a 375 px phone, light and dark). The spec left them to the builder; the user checks them when reading.

1. **The levels of the four grade groups are one constant**, `GRADE_GROUP_LEVELS = [1, 3, 4, 5]` in `src/ui/format.ts` next to `pointsLevel`; `ReportCard.tsx` loses its own `GROUP_LEVELS`, and the report's bars reuse the `bar-N` colour rules of the card (one selector list each, no copy).
2. **Only "Media testului" takes its grade colour** among the tiles, as on the test page's card; the median, the lowest and the highest grade stay in the text colour.
3. **The grade column reads from the left** (`.grade-col`, its head too), so every chip lines up with or without a pill.
4. **The phone query is one constant**, `PHONE = '(max-width: 56.25rem)'`, exported from `src/ui/useMediaQuery.ts`; `Layout.tsx` imports it instead of its own copy. The table is rendered in the phone's column order (CSS cannot move a column), and its class `is-phone` carries the sticky styles, so the order and the stickiness never disagree.
5. **On a phone the pill keeps its words for screen readers**: the count is shown (`aria-hidden`), "2 de verificat" is in an `sr-only` span.
6. **The swipe line ("Glisează tabelul spre stânga pentru punctaje.") is rendered only on a phone**, over the class table (not again over the CES table), at 0.8125rem.
7. **The sticky grade's edge shadow is made from `--text`** (`color-mix(in srgb, var(--text) 30%, transparent)`), so it shows in both themes without a new token.
8. **"Corectate" spans both tile columns only below 30rem**, where the tiles are two columns; between 30rem and 64rem they are three columns, as today.
9. **The phone's order of the parts is visual only** (CSS `order`, with `.report-main` as `display: contents`): in the page's code "Notele pe grupe" (in the `aside`) still comes before the tiles. Nothing focusable sits between them, so the keyboard's order does not change; only a screen reader reads the grade groups before the tiles. Rezultate (2026-11-14) kept the code's order equal to the screen's; here that would mean moving the grade groups out of the sticky `aside` of the desktop, so the plan accepts the small difference.

## Review Focus

1. A long name (three words and two initials) wraps inside the 8.25rem name column and the sticky grade stays right beside it, never over it (Task 2, brand test "keeps the name and the grade of the class report in view on a phone, the tiles first": the grade's `left` equals the name's `width` and `max-width`).
2. A student with no graded paper keeps one wide cell under the phone order (`colspan` = exercises + 2) (Task 2, "puts the grade right after the name and the total last, and says the table scrolls").
3. The CES table follows the phone order too, not only the class table (Task 2, "draws the CES table for the phone too").
4. A low grade (2,5–4,99, an orange-brown chip) and the orange "de verificat" pill stay two things in the same cell, with words in the pill on a desktop (Task 1, "draws the names, the points and the grades as the test page does: no bold, the grade in a chip").
5. The test page's "Raportul clasei" card keeps its bars after its levels move to `format.ts` (Task 1: the existing `ResultsPanel.test.tsx` checks of `.bar-1` and `.bar-3` run in the whole suite).

---

### Before Task 1: The branch

- [ ] **Step 1: Check the branch and the prototype**

Run: `git status --short` and `git log --oneline -3`
Expected: nothing changed; HEAD is the commit that adds this plan, on top of `98c91fb Design the class report's alignment with the test page and its phone table`.

Run: `git rev-parse --verify refs/protocr/cr2`
Expected: a commit id. If the ref does not exist, stop and ask: the prototype's refs come with this plan.

### Task 1: The class report drawn like the test page

No bold in the report; the grade a `GradeChip` with its orange pill; the average tile in its grade colour; "Notele pe grupe" in the coloured bars of the test page's card.

**Files:**
- Modify: `src/ui/format.ts`, `src/admin/testPage/ReportCard.tsx`, `src/admin/reportPage/ReportTables.tsx`, `src/ui/brand.css`, `src/AGENTS.md`
- Test: `src/admin/pages/ReportPage.test.tsx`, `src/ui/brand.test.ts`

**Interfaces:**
- Consumes: `GradeChip({ grade })` (`src/admin/testPage/GradeChip.tsx`), `pointsLevel(points, maxPoints)` (`src/ui/format.ts`), the classes `.points-N`, `.points-pill` and `.report-card-bar > .bar-N` of `brand.css`.
- Produces: `export const GRADE_GROUP_LEVELS = [1, 3, 4, 5] as const` in `src/ui/format.ts`; in the results table the grade's cells have the class `grade-col` (Task 2 makes them sticky); the grade groups' counts are `span.report-bars-count`.

- [ ] **Step 1: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
    expect(tiles.getByText('Media testului').nextSibling).toHaveTextContent('7,75');
    expect(tiles.getByText('Mediana').nextSibling).toHaveTextContent('7,75');
```

Replace it with:

```tsx
    expect(tiles.getByText('Media testului').nextSibling).toHaveTextContent('7,75');
    // The average in its grade colour, as on the test page; the other numbers plain.
    expect(tiles.getByText('Media testului').nextSibling).toHaveClass('points-4');
    expect(tiles.getByText('Mediana').nextSibling).not.toHaveAttribute('class');
    expect(tiles.getByText('Mediana').nextSibling).toHaveTextContent('7,75');
```

- [ ] **Step 2: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
    expect(cells[2]).toHaveTextContent('5,5 / 10');
    expect(cells[3]).toHaveTextContent('5,5');
    expect(cells[3]).toHaveTextContent('de verificat 2');
  });
```

Replace it with:

```tsx
    expect(cells[2]).toHaveTextContent('5,5 / 10');
    expect(within(cells[3]!).getByText('5,5')).toHaveClass('grade-chip');
    expect(within(cells[3]!).getByText('2 de verificat')).toHaveClass('points-pill');
  });

  it('draws the names, the points and the grades as the test page does: no bold, the grade in a chip', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    const table = await screen.findByRole('table', { name: 'Punctajele elevilor pe exerciții' });
    expect(table.querySelector('b, strong')).toBeNull();
    expect(screen.getByRole('table', { name: 'Statistici pe exerciții' }).querySelector('b, strong')).toBeNull();
    const [first, second] = within(table).getAllByRole('row').slice(1);
    expect(within(first!).getByText('10')).toHaveClass('grade-chip points-5');
    expect(within(second!).getByText('5,5', { selector: '.grade-chip' })).toHaveClass('points-3');
    expect(within(second!).getByText('2 de verificat')).toHaveClass('points-pill');
    expect(within(first!).queryByText(/de verificat/)).not.toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Nota' })).toHaveClass('grade-col');
  });
```

- [ ] **Step 3: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
    ]);
    const exercises = within(screen.getByRole('region', { name: 'Pe exerciții' }));
```

Replace it with:

```tsx
    ]);
    // Each bar in the colour of its grades, as on the test page.
    expect([...groups.querySelectorAll('.report-bar > span')].map((bar) => bar.className)).toEqual(['bar-1', 'bar-3', 'bar-4', 'bar-5']);
    expect(groups.querySelector('b')).toBeNull();
    const exercises = within(screen.getByRole('region', { name: 'Pe exerciții' }));
```

- [ ] **Step 4: Edit `src/ui/brand.test.ts`**

Find this block:

```ts

  it('gives the stage sentence the whole width of the panel, and puts "Raportul clasei" beside the students only in a wide panel', () => {
```

Replace it with:

```ts

  it('draws the class report as the test page: no bold, the grade groups in the grade colours', () => {
    expect(value(declarations('table.report-table thead th'), 'font-weight')).toBe('500');
    expect(value(declarations('table.report-table tbody th'), 'font-weight')).toBe('400');
    expect(value(declarations('table.report-table tbody th a'), 'text-decoration')).toBe('none');
    expect(value(declarations('.report-tiles dt'), 'font-weight')).toBe('500');
    expect(value(declarations('.report-tiles dd'), 'font-weight')).toBe('500');
    expect(value(declarations('.report-bars-count'), 'font-weight')).toBeUndefined();
    expect(value(declarations('table.report-table .grade-col'), 'text-align')).toBe('left');
    for (const level of [1, 3, 4, 5]) {
      expect(value(declarations(`.report-card-bar > .bar-${level},\n.report-bar > .bar-${level}`), 'background')).toBe(`var(--conf-${level})`);
    }
  });

  it('gives the stage sentence the whole width of the panel, and puts "Raportul clasei" beside the students only in a wide panel', () => {
```

- [ ] **Step 5: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/ReportPage.test.tsx src/ui/brand.test.ts`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  5 failed | 44 passed (49)`: `brand.css` still has the bold (`expected undefined to be '500'`); the average tile has no grade colour (`expect(element).toHaveClass("points-4")`); the grade is still a bold number with a `tag-wait` label (`expect(element).toHaveClass("grade-chip")`, `expected <strong></strong> to be null`); and the bars have no colour class (`expected [ '', '', '', '' ] to deeply equal [ 'bar-1', 'bar-3', 'bar-4', 'bar-5' ]`). The other tests of the two files pass.

- [ ] **Step 6: Edit `src/ui/format.ts`**

Find this block:

```ts

// The robot names the pages of an upload "student/page-02.jpg", in upload
```

Replace it with:

```ts

// The colour of each group of grades (1-4,99, 5-6,99, 7-8,99, 9-10), as a
// `pointsLevel` of its grades: red under 5 up to dark green from 9. The test
// page's "Raportul clasei" card and the class report draw the same bars.
export const GRADE_GROUP_LEVELS = [1, 3, 4, 5] as const;

// The robot names the pages of an upload "student/page-02.jpg", in upload
```

- [ ] **Step 7: Edit `src/admin/testPage/ReportCard.tsx`**

Find this block:

```tsx
import { gradeGroups } from '../../../shared/stats.ts';
import { countLabel, pointsLevel, uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
```

Replace it with:

```tsx
import { gradeGroups } from '../../../shared/stats.ts';
import { countLabel, GRADE_GROUP_LEVELS, pointsLevel, uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
```

- [ ] **Step 8: Edit `src/admin/testPage/ReportCard.tsx`**

Find this block:

```tsx
import { IconDownload } from '../shell/icons.tsx';

// The colour of each grade group's bar: the grade colour of its grades
// (`.points-N`), red under 5 up to dark green from 9.
const GROUP_LEVELS = [1, 3, 4, 5];

```

Replace it with:

```tsx
import { IconDownload } from '../shell/icons.tsx';

```

- [ ] **Step 9: Edit `src/admin/testPage/ReportCard.tsx`**

Find this block:

```tsx
            <span className="report-card-bar" aria-hidden="true">
              <span className={`bar-${GROUP_LEVELS[index]}`} style={{ width: `${(group.count / most) * 100}%` }}></span>
            </span>
```

Replace it with:

```tsx
            <span className="report-card-bar" aria-hidden="true">
              <span className={`bar-${GRADE_GROUP_LEVELS[index]}`} style={{ width: `${(group.count / most) * 100}%` }}></span>
            </span>
```

- [ ] **Step 10: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
import type { ExerciseStats, ClassStats, ReportTable } from '../../../shared/stats.ts';
import { pointsLevel, uploadStatusLabel } from '../../ui/format.ts';
import { CesTag } from '../CesTag.tsx';

```

Replace it with:

```tsx
import type { ExerciseStats, ClassStats, ReportTable } from '../../../shared/stats.ts';
import { GRADE_GROUP_LEVELS, pointsLevel, uploadStatusLabel } from '../../ui/format.ts';
import { CesTag } from '../CesTag.tsx';
import { GradeChip } from '../testPage/GradeChip.tsx';

```

- [ ] **Step 11: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
// "Pe scurt" (spec §11.3): the average, the median, the lowest and the highest
// grade, and how many active students were graded.
export function ReportTiles({ stats }: { stats: ClassStats }) {
  const tiles: [string, string][] = [
    ['Media testului', grade(stats.average)],
    ['Mediana', grade(stats.median)],
    ['Cea mai mică notă', grade(stats.min)],
    ['Cea mai mare notă', grade(stats.max)],
  ];
```

Replace it with:

```tsx
// "Pe scurt" (spec §11.3): the average, the median, the lowest and the highest
// grade, and how many active students were graded. The average is in its
// grade colour, as on the test page's "Raportul clasei" card.
export function ReportTiles({ stats }: { stats: ClassStats }) {
  const tiles: [string, string, string | undefined][] = [
    ['Media testului', grade(stats.average), stats.average === null ? undefined : `points-${pointsLevel(stats.average, 10)}`],
    ['Mediana', grade(stats.median), undefined],
    ['Cea mai mică notă', grade(stats.min), undefined],
    ['Cea mai mare notă', grade(stats.max), undefined],
  ];
```

- [ ] **Step 12: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
    <dl className="report-tiles">
      {tiles.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
```

Replace it with:

```tsx
    <dl className="report-tiles">
      {tiles.map(([label, value, colour]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className={colour}>{value}</dd>
        </div>
```

- [ ] **Step 13: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx

// "Notele pe grupe": a bar per group of grades, with its count.
export function GradeGroups({ stats }: { stats: ClassStats }) {
```

Replace it with:

```tsx

// "Notele pe grupe": a bar per group of grades, in the colour of its grades
// (as on the test page), with its count.
export function GradeGroups({ stats }: { stats: ClassStats }) {
```

- [ ] **Step 14: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
      <ul className="report-bars" aria-labelledby="report-groups-title">
        {stats.groups.map((group) => (
          <li key={group.label}>
```

Replace it with:

```tsx
      <ul className="report-bars" aria-labelledby="report-groups-title">
        {stats.groups.map((group, index) => (
          <li key={group.label}>
```

- [ ] **Step 15: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
            <span className="report-bar" aria-hidden="true">
              <span style={{ width: `${(group.count / most) * 100}%` }}></span>
            </span>
            <b>{group.count}</b>
          </li>
```

Replace it with:

```tsx
            <span className="report-bar" aria-hidden="true">
              <span className={`bar-${GRADE_GROUP_LEVELS[index]}`} style={{ width: `${(group.count / most) * 100}%` }}></span>
            </span>
            <span className="report-bars-count">{group.count}</span>
          </li>
```

- [ ] **Step 16: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
// (an item that waits for the teacher's check is marked), the total and the
// grade. An active student with no graded paper has a row that says why (in the
// class table: `missing` is empty for the CES table).
export function ResultsTable({
```

Replace it with:

```tsx
// (an item that waits for the teacher's check is marked), the total and the
// grade, drawn as on the test page: no bold, the grade a `GradeChip` and the
// points to check an orange pill beside it. An active student with no graded
// paper has a row that says why (in the class table: `missing` is empty for
// the CES table).
export function ResultsTable({
```

- [ ] **Step 17: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
            </th>
            <th scope="col" className="num">
              Nota
```

Replace it with:

```tsx
            </th>
            <th scope="col" className="grade-col">
              Nota
```

- [ ] **Step 18: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
              </td>
              <td className="num report-grade">
                <strong className={row.flagCount > 0 ? 'is-waiting' : undefined}>{formatPoints(row.grade)}</strong>
                {row.flagCount > 0 && <span className="tag tag-wait">de verificat {row.flagCount}</span>}
              </td>
```

Replace it with:

```tsx
              </td>
              <td className="grade-col">
                <GradeChip grade={row.grade} />
                {row.flagCount > 0 && <span className="points-pill">{row.flagCount} de verificat</span>}
              </td>
```

- [ ] **Step 19: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
                    </span>
                    <b>{exercise.averagePercent}%</b>
                  </span>
```

Replace it with:

```tsx
                    </span>
                    <span className="report-share-value">{exercise.averagePercent}%</span>
                  </span>
```

- [ ] **Step 20: Edit `src/ui/brand.css`**

Find this block:

```css

.report-card-bar > .bar-1 {
  background: var(--conf-1);
```

Replace it with:

```css

.report-card-bar > .bar-1,
.report-bar > .bar-1 {
  background: var(--conf-1);
```

- [ ] **Step 21: Edit `src/ui/brand.css`**

Find this block:

```css

.report-card-bar > .bar-3 {
  background: var(--conf-3);
```

Replace it with:

```css

.report-card-bar > .bar-3,
.report-bar > .bar-3 {
  background: var(--conf-3);
```

- [ ] **Step 22: Edit `src/ui/brand.css`**

Find this block:

```css

.report-card-bar > .bar-4 {
  background: var(--conf-4);
```

Replace it with:

```css

.report-card-bar > .bar-4,
.report-bar > .bar-4 {
  background: var(--conf-4);
```

- [ ] **Step 23: Edit `src/ui/brand.css`**

Find this block:

```css

.report-card-bar > .bar-5 {
  background: var(--conf-5);
```

Replace it with:

```css

.report-card-bar > .bar-5,
.report-bar > .bar-5 {
  background: var(--conf-5);
```

- [ ] **Step 24: Edit `src/ui/brand.css`**

Find this block:

```css

.report-bars {
```

Replace it with:

```css

/* "Notele pe grupe": the bars of the test page's "Raportul clasei" card, each
   group in the colour of its grades, the counts not bold. */
.report-bars {
```

- [ ] **Step 25: Edit `src/ui/brand.css`**

Find this block:

```css
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr) 2rem;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.875rem;
}

.report-bars b {
  text-align: right;
```

Replace it with:

```css
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr) 1.5rem;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.report-bars .report-bar {
  height: 0.5rem;
}

.report-bars-count {
  text-align: right;
```

- [ ] **Step 26: Edit `src/ui/brand.css`**

Find this block:

```css
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

```

Replace it with:

```css
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 500;
}

```

- [ ] **Step 27: Edit `src/ui/brand.css`**

Find this block:

```css
  font-size: 1.625rem;
  font-weight: 700;
  line-height: 1.2;
```

Replace it with:

```css
  font-size: 1.625rem;
  font-weight: 500;
  line-height: 1.2;
```

- [ ] **Step 28: Edit `src/ui/brand.css`**

Find this block:

```css
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 500;
}

td.report-grade .is-waiting {
  color: var(--orange);
}

td.report-grade .tag {
  margin-left: 0.4rem;
```

Replace it with:

```css
  color: var(--muted);
  font-size: 0.6875rem;
  font-weight: 400;
}

/* The grade: a chip, its points to check in an orange pill beside it, both
   from the left so every chip lines up. */
table.report-table .grade-col {
  text-align: left;
  white-space: nowrap;
}

table.report-table .grade-col .points-pill {
  margin-left: 0.4rem;
```

- [ ] **Step 29: Edit `src/ui/brand.css`**

Find this block:

```css

.report-share-line b {
  font-size: 0.8125rem;
```

Replace it with:

```css

.report-share-value {
  font-size: 0.8125rem;
```

- [ ] **Step 30: Edit `src/ui/brand.css`**

Find this block:

```css

table.report-table thead th {
  color: var(--muted);
  font-size: 0.9rem;
}

table.report-table tbody th,
table.report-table tfoot th,
table.report-table tfoot td {
  font-weight: 700;
}
```

Replace it with:

```css

/* No bold, as in the test page's tables: the heads in 500, the names regular
   and in the text colour, a link only under the pointer. */
table.report-table thead th {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 500;
}

table.report-table tbody th {
  font-weight: 400;
}

table.report-table tbody th a {
  color: var(--text);
  text-decoration: none;
}

table.report-table tbody th a:hover {
  color: var(--ink);
  text-decoration: underline;
}
```

- [ ] **Step 31: Edit `src/ui/brand.css`**

Find this block:

```css

table.results-table td:nth-last-child(-n + 2) {
  padding-left: 0.6rem;
```

Replace it with:

```css

table.results-table td:nth-last-child(-n + 2),
table.results-table th.grade-col {
  padding-left: 0.6rem;
```

- [ ] **Step 32: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1), (x + 1)/3, a negated letter p̄ (a combining bar, which the font draws beside the letter, so the page draws it) and a subscript A_p or A_(p∧q), and leaves intervals, words such as și/sau and names such as x_max as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen (Rezultate is the one screen with two, each the main action of its own box: "Publică toate rezultatele" and "Deschide raportul"), filled orange (`.button button-wait`) for the one main action of a screen whose work waits on the teacher ("Începe verificarea" in Verificare), and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `Crumbs.tsx` is the path at the top of the test page and of the paper page ("Teste › Clasa 7E2 › <test>", a `nav` "Unde ești"; the last step is the page itself, not a link). `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă and Corectare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8, spec 2026-11-14: the box at its top in `ResultsAccess.tsx`, grey with "Publică toate rezultatele" while no result is published, green once students can read results (for all, or some alone), with "Oprește accesul la rezultate" (or "Publică toate rezultatele" while only some are) and the two ways students find them, numbered: their own link, kept on the phone, and the test's link for the students scanned again (its QR code, "Copiază linkul", "Descarcă codul QR", a PNG, and "Arată codul QR pe tot ecranul"); the teacher's multi-upload link is not in Rezultate; a copy the browser refuses shows the link in a field, selected and described by the line above it (`admin/CopyLink.tsx`, for both copy buttons of the panel); the students' result links in `ResultLinksTable.tsx`, with the grade right after the name (a `GradeChip`, with its points still to check beside it in an orange label), the points, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Elevii" with its count as a label (green "toate publicate" once every result is published, grey while some wait); "Raportul clasei" in `ReportCard.tsx` (spec 2026-11-14), beside the table in a wide panel (its top level with the table's, a subgrid) and above it in a narrow one (a container query on `.results-layout`): the average in its grade colour, the grades by group (`gradeGroups` of `shared/stats.ts`, counted from the uploads list: no report query), "Deschide raportul" (the panel's main button) and "CSV pentru catalog" (a quiet text button: the class report's CSV, read when pressed); the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the subject (`SubjectForm.tsx`: "Se stabilește la corectare" until the robot finds it, "Alege materia" or "Schimbă materia" opening the seven subjects in place (while the robot reads the test, only a line that says when the subject can change), with a line when the list is made again and the papers graded again), the files, the students' link while the test is a draft or open, rename, archive (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`), delete), the overview of Verificare (`ReviewOverview.tsx`: the graded papers that had points, counted with `flagCount` and `checkedCount`; "<checked> din <total> verificate", its bar, "Mai sunt …" and the orange "Începe verificarea" (nothing checked yet) or "Continuă verificarea" into the paper page at the first point left; "De verificat", a label per student with points left ("<checked>/<total>", opening that student's first point), and "Gata", a label per student done (opening the paper with all its exercises); once all is checked a green box with "Mergi la Rezultate" (the panel then leaves out "Următoarea etapă"), and "Nimic de verificat." when no graded paper had a point; CES as the other tables show it (`ces` or `variant === 'ces'`), in the label's accessible name too; no papers table and no list of the points: the paper page decides them), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page learns the answer from the version check of the shell), the uploads table (`UploadsTable.tsx`, the full width of its card; the grade right after the name, a `GradeChip.tsx`: the grade in a soft chip of the class report's colours, `.points-N` of `pointsLevel(grade, 10)`; "De verificat" in an orange label; both papers tables are drawn like the points table of Verificare, with no bold: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off; a student who sent nothing is "Nu a trimis" while the uploads are open and "Nu a participat" after; after, an upload left open with files is "Așteaptă corectarea" and one with no file "Nu a participat"), "Recorectează tot"). `pages/PaperPage.tsx` and `paperPage/` are the paper page (spec `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md` §4, `/teste/:code/elevi/:submissionId`): the path (`Crumbs`), the head (`PaperHead.tsx`: `.submission-head`, the name, the test, the state and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right; then the result link row; `usePaperActions` holds Recorectează, Resetează and Reîncearcă and the news after them), the switch "Toate exercițiile" / "Doar de verificat (N)" (N the points of the whole test; the view is in the address, `vedere=verificare`, and stays when she moves), then the moves, small and on one row also on a phone: "‹ Punct 3/47 ›" (a group "Punctele de verificat", only with the points to check, never with all the exercises: the arrows are "Punctul anterior" and "Următorul punct", both alike, with the key in their tooltip, and between them the open point's place among the points J and K walk), "‹ Elev 2/7 ›" (a group "Elevii", "Elevul anterior" and "Elevul următor", and between them the student's place in the list; they go round, the last to the first, but after a decision on the last student the focus goes to the exercises, not to "Elevul următor") and "Lucrarea" (a picture icon, pressed while the paper shows, which hides it or shows it again), then three columns: "Elevii" (`StudentList.tsx`: every upload with a paper, the grade, the points to check in orange or the state; only the points to check: the papers with points first; a name opens that paper at the top of the window; it folds to a strip, kept in this browser as `quickeval:paperStudentsFolded`), the exercises (`GradedResult` with `check`: a click on a row or its "Arată pe lucrare" opens it, `?punct=<item id>` or `pagini`, and a second click on the open row closes it, after `CLOSE_DELAY` (300 ms), so the first click of a double or triple click, which selects a word to copy, never closes it (a click that ends a selection of the row's text does nothing); a row to check stays open when a click opens another row (`keptKeys`, kept in `Paper` until the teacher closes or checks it, none for another paper; only a click on a row, its "Verifică" or its "Arată pe lucrare" keeps it, `paperKeep` in the navigation state, never J, K or the buttons), so the rows under it never move: its decision stays in place, dimmed, `inert` and `aria-hidden` (`DecisionSlot`), and a click on its row or its "Verifică" opens it again; the A key and the focus after a decision reach only the open row's slot (`.decision-slot.is-current`); "Doar de verificat" keeps only the rows to check and the open one, without the texts for the student; a row to check is calm: its points in a soft orange label (`.points-pill`) and one "Verifică" icon button that opens it (an orange magnifier with a check, like the pencil, its word in its name and tooltip), with no reason in the row; the open row to check shows `PointDecision.tsx` under it, region "Decizia", in a box with a light orange border: the robot's reason, "Accept <points>" (the robot's points), the stepper (− and + move by 0,5 on the 0,05 steps, between 0 and the maximum; any value in steps of 0,05 can be typed) and "Salvează", and what the grade becomes with another value; for the pages, the reason and "Am verificat paginile"; while a decision shows, the bar names the keys between the switch and the moves, only when the whole line fits there (`.review-keys`: a one-line wrapping box whose line wraps out of sight)), and the paper (`reviewPage/ReviewPhoto.tsx`, staying in view and level with the other two columns; its × button ("Ascunde lucrarea", top right) hides it, the exercises taking its room, and the focus goes to "Lucrarea" in the bar; the choice is kept in this browser as `quickeval:paperPhotoFolded`; a graded paper with nothing left to check opens with it hidden (chosen when the paper opens, from its upload row), and its toggles there are not saved; graded again, it shows as the saved choice says; while it is folded, 1–9 do nothing and the bar does not name them, and "Arată pe lucrare" shows it again (an open row stays open): each page with "2/3" beside the name and its file's name and size, as the student sent it; over the photo, a floating bar on the top left holds "Arată chenarul" (an orange dashed-frame toggle, while the open answer has an area) and "Toată pagina" (off while the page is whole), and the zoom's − and + float alone on the top right; a photo zooms inside the pane (a left click, a right click and the two buttons over the photo take one small step, out and in; two fingers pinch on a touch screen, and the wheel scrolls the page), a line over the page says what a click does until she zooms, in the words of the pointer at hand (a phone has no right button), and the open exercise draws an orange border around the robot's area of its answer, on the whole page, because the page never zooms by itself; the border's arrows step through the parts of an answer, each part opening on its page, whole). The exercises get three fifths of the room the students leave, the paper two; below 1200px the students go under the exercises, and below 900px one column: the exercises, the paper, the students. `paperPage/paths.ts` writes the addresses (replaced, never a new step in the history) and picks the students' order and the points J and K walk: every point of the test while only the points to check show, else the open student's. `reviewPage/points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first) and steps between them. The old address of the review, `/teste/:code/verificare?lucrare=&punct=`, opens the page with only the points to check (`ReviewRedirect`: the named paper and point, else `firstSpot()`, else the test's Verificare); every link to the points to check uses it (`reviewPath`). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point: with only the points to check, also on the next student; with all the exercises, the next point of the same student, and when none is left the row stays open and "Elevul următor" takes the focus. It moves only if the teacher is still at the decided point (a call-level `onSuccess` of `mutate`, which does not run once the page is gone). The shell draws the page anew for another address path (`ErrorBoundary key={location.pathname}`), so where the focus goes after a decision rides in the navigation state (`paperFocus`), given once per address. A new address path opens at the top of the window (`Layout.tsx`, a PUSH only): a replaced one (the paper page's moves) keeps its place, and Back or Forward leave it to the browser. A refused decision reads the paper and the test again. The papers the teacher can move to next (the next and the previous student, the next point's paper) are read ahead, so another student's page shows at once; while a paper loads, its place keeps a screen's height. A paper with no result now (uploading, sent, graded again) shows its pages and why (`submissionPage/waitingText.ts`), a failed one "Reîncearcă"; when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A (presses "Accept" of an open row to check), J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). "Alte acțiuni" (`useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. Points are never bold. Without the paper page (no page uses that plain list now), an exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds "Verifică" or "Arată pe lucrare" (paper page only) and the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, its font (Roboto) drops without a sign every character it lacks, so `pdfSymbols.ts` writes those signs as words (∧ și, ∀ oricare ar fi, ⋮ divizibil cu) and `pdfMath.ts` draws a negated letter p̄ with a line over it, A_p with a subscript and σᵏ with a raised letter (pdfmake runs), `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

Replace it with:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1), (x + 1)/3, a negated letter p̄ (a combining bar, which the font draws beside the letter, so the page draws it) and a subscript A_p or A_(p∧q), and leaves intervals, words such as și/sau and names such as x_max as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen (Rezultate is the one screen with two, each the main action of its own box: "Publică toate rezultatele" and "Deschide raportul"), filled orange (`.button button-wait`) for the one main action of a screen whose work waits on the teacher ("Începe verificarea" in Verificare), and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `Crumbs.tsx` is the path at the top of the test page and of the paper page ("Teste › Clasa 7E2 › <test>", a `nav` "Unde ești"; the last step is the page itself, not a link). `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă and Corectare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8, spec 2026-11-14: the box at its top in `ResultsAccess.tsx`, grey with "Publică toate rezultatele" while no result is published, green once students can read results (for all, or some alone), with "Oprește accesul la rezultate" (or "Publică toate rezultatele" while only some are) and the two ways students find them, numbered: their own link, kept on the phone, and the test's link for the students scanned again (its QR code, "Copiază linkul", "Descarcă codul QR", a PNG, and "Arată codul QR pe tot ecranul"); the teacher's multi-upload link is not in Rezultate; a copy the browser refuses shows the link in a field, selected and described by the line above it (`admin/CopyLink.tsx`, for both copy buttons of the panel); the students' result links in `ResultLinksTable.tsx`, with the grade right after the name (a `GradeChip`, with its points still to check beside it in an orange label), the points, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Elevii" with its count as a label (green "toate publicate" once every result is published, grey while some wait); "Raportul clasei" in `ReportCard.tsx` (spec 2026-11-14), beside the table in a wide panel (its top level with the table's, a subgrid) and above it in a narrow one (a container query on `.results-layout`): the average in its grade colour, the grades by group (`gradeGroups` of `shared/stats.ts`, counted from the uploads list: no report query), "Deschide raportul" (the panel's main button) and "CSV pentru catalog" (a quiet text button: the class report's CSV, read when pressed); the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the subject (`SubjectForm.tsx`: "Se stabilește la corectare" until the robot finds it, "Alege materia" or "Schimbă materia" opening the seven subjects in place (while the robot reads the test, only a line that says when the subject can change), with a line when the list is made again and the papers graded again), the files, the students' link while the test is a draft or open, rename, archive (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`), delete), the overview of Verificare (`ReviewOverview.tsx`: the graded papers that had points, counted with `flagCount` and `checkedCount`; "<checked> din <total> verificate", its bar, "Mai sunt …" and the orange "Începe verificarea" (nothing checked yet) or "Continuă verificarea" into the paper page at the first point left; "De verificat", a label per student with points left ("<checked>/<total>", opening that student's first point), and "Gata", a label per student done (opening the paper with all its exercises); once all is checked a green box with "Mergi la Rezultate" (the panel then leaves out "Următoarea etapă"), and "Nimic de verificat." when no graded paper had a point; CES as the other tables show it (`ces` or `variant === 'ces'`), in the label's accessible name too; no papers table and no list of the points: the paper page decides them), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page learns the answer from the version check of the shell), the uploads table (`UploadsTable.tsx`, the full width of its card; the grade right after the name, a `GradeChip.tsx`: the grade in a soft chip of the class report's colours, `.points-N` of `pointsLevel(grade, 10)`; "De verificat" in an orange label; both papers tables are drawn like the points table of Verificare, with no bold: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off; a student who sent nothing is "Nu a trimis" while the uploads are open and "Nu a participat" after; after, an upload left open with files is "Așteaptă corectarea" and one with no file "Nu a participat"), "Recorectează tot"). `pages/PaperPage.tsx` and `paperPage/` are the paper page (spec `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md` §4, `/teste/:code/elevi/:submissionId`): the path (`Crumbs`), the head (`PaperHead.tsx`: `.submission-head`, the name, the test, the state and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right; then the result link row; `usePaperActions` holds Recorectează, Resetează and Reîncearcă and the news after them), the switch "Toate exercițiile" / "Doar de verificat (N)" (N the points of the whole test; the view is in the address, `vedere=verificare`, and stays when she moves), then the moves, small and on one row also on a phone: "‹ Punct 3/47 ›" (a group "Punctele de verificat", only with the points to check, never with all the exercises: the arrows are "Punctul anterior" and "Următorul punct", both alike, with the key in their tooltip, and between them the open point's place among the points J and K walk), "‹ Elev 2/7 ›" (a group "Elevii", "Elevul anterior" and "Elevul următor", and between them the student's place in the list; they go round, the last to the first, but after a decision on the last student the focus goes to the exercises, not to "Elevul următor") and "Lucrarea" (a picture icon, pressed while the paper shows, which hides it or shows it again), then three columns: "Elevii" (`StudentList.tsx`: every upload with a paper, the grade, the points to check in orange or the state; only the points to check: the papers with points first; a name opens that paper at the top of the window; it folds to a strip, kept in this browser as `quickeval:paperStudentsFolded`), the exercises (`GradedResult` with `check`: a click on a row or its "Arată pe lucrare" opens it, `?punct=<item id>` or `pagini`, and a second click on the open row closes it, after `CLOSE_DELAY` (300 ms), so the first click of a double or triple click, which selects a word to copy, never closes it (a click that ends a selection of the row's text does nothing); a row to check stays open when a click opens another row (`keptKeys`, kept in `Paper` until the teacher closes or checks it, none for another paper; only a click on a row, its "Verifică" or its "Arată pe lucrare" keeps it, `paperKeep` in the navigation state, never J, K or the buttons), so the rows under it never move: its decision stays in place, dimmed, `inert` and `aria-hidden` (`DecisionSlot`), and a click on its row or its "Verifică" opens it again; the A key and the focus after a decision reach only the open row's slot (`.decision-slot.is-current`); "Doar de verificat" keeps only the rows to check and the open one, without the texts for the student; a row to check is calm: its points in a soft orange label (`.points-pill`) and one "Verifică" icon button that opens it (an orange magnifier with a check, like the pencil, its word in its name and tooltip), with no reason in the row; the open row to check shows `PointDecision.tsx` under it, region "Decizia", in a box with a light orange border: the robot's reason, "Accept <points>" (the robot's points), the stepper (− and + move by 0,5 on the 0,05 steps, between 0 and the maximum; any value in steps of 0,05 can be typed) and "Salvează", and what the grade becomes with another value; for the pages, the reason and "Am verificat paginile"; while a decision shows, the bar names the keys between the switch and the moves, only when the whole line fits there (`.review-keys`: a one-line wrapping box whose line wraps out of sight)), and the paper (`reviewPage/ReviewPhoto.tsx`, staying in view and level with the other two columns; its × button ("Ascunde lucrarea", top right) hides it, the exercises taking its room, and the focus goes to "Lucrarea" in the bar; the choice is kept in this browser as `quickeval:paperPhotoFolded`; a graded paper with nothing left to check opens with it hidden (chosen when the paper opens, from its upload row), and its toggles there are not saved; graded again, it shows as the saved choice says; while it is folded, 1–9 do nothing and the bar does not name them, and "Arată pe lucrare" shows it again (an open row stays open): each page with "2/3" beside the name and its file's name and size, as the student sent it; over the photo, a floating bar on the top left holds "Arată chenarul" (an orange dashed-frame toggle, while the open answer has an area) and "Toată pagina" (off while the page is whole), and the zoom's − and + float alone on the top right; a photo zooms inside the pane (a left click, a right click and the two buttons over the photo take one small step, out and in; two fingers pinch on a touch screen, and the wheel scrolls the page), a line over the page says what a click does until she zooms, in the words of the pointer at hand (a phone has no right button), and the open exercise draws an orange border around the robot's area of its answer, on the whole page, because the page never zooms by itself; the border's arrows step through the parts of an answer, each part opening on its page, whole). The exercises get three fifths of the room the students leave, the paper two; below 1200px the students go under the exercises, and below 900px one column: the exercises, the paper, the students. `paperPage/paths.ts` writes the addresses (replaced, never a new step in the history) and picks the students' order and the points J and K walk: every point of the test while only the points to check show, else the open student's. `reviewPage/points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first) and steps between them. The old address of the review, `/teste/:code/verificare?lucrare=&punct=`, opens the page with only the points to check (`ReviewRedirect`: the named paper and point, else `firstSpot()`, else the test's Verificare); every link to the points to check uses it (`reviewPath`). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point: with only the points to check, also on the next student; with all the exercises, the next point of the same student, and when none is left the row stays open and "Elevul următor" takes the focus. It moves only if the teacher is still at the decided point (a call-level `onSuccess` of `mutate`, which does not run once the page is gone). The shell draws the page anew for another address path (`ErrorBoundary key={location.pathname}`), so where the focus goes after a decision rides in the navigation state (`paperFocus`), given once per address. A new address path opens at the top of the window (`Layout.tsx`, a PUSH only): a replaced one (the paper page's moves) keeps its place, and Back or Forward leave it to the browser. A refused decision reads the paper and the test again. The papers the teacher can move to next (the next and the previous student, the next point's paper) are read ahead, so another student's page shows at once; while a paper loads, its place keeps a screen's height. A paper with no result now (uploading, sent, graded again) shows its pages and why (`submissionPage/waitingText.ts`), a failed one "Reîncearcă"; when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A (presses "Accept" of an open row to check), J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). "Alte acțiuni" (`useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. Points are never bold. Without the paper page (no page uses that plain list now), an exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds "Verifică" or "Arată pe lucrare" (paper page only) and the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). It is drawn like the test page (spec 2026-11-15): no bold (names regular, in the text colour, a link only under the pointer), the grade a `GradeChip` with its points to check in an orange "N de verificat" pill beside it, the average tile in its grade colour, and "Notele pe grupe" in the bars of `ReportCard` (`GRADE_GROUP_LEVELS` of `ui/format.ts`, shared). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, its font (Roboto) drops without a sign every character it lacks, so `pdfSymbols.ts` writes those signs as words (∧ și, ∀ oricare ar fi, ⋮ divizibil cu) and `pdfMath.ts` draws a negated letter p̄ with a line over it, A_p with a subscript and σᵏ with a raised letter (pdfmake runs), `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

- [ ] **Step 33: Run the typecheck and the whole suite**

Run: `npm run typecheck`
Expected: no output after the command line (exit code 0).

Run: `npm test`
Expected: `Test Files  182 passed | 1 skipped (183)`, `Tests  2806 passed | 3 skipped (2809)`.

- [ ] **Step 34: Commit**

```bash
git add src/ui/format.ts src/admin/testPage/ReportCard.tsx src/admin/reportPage/ReportTables.tsx src/ui/brand.css src/AGENTS.md src/admin/pages/ReportPage.test.tsx src/ui/brand.test.ts
git commit -m "Draw the class report like the test page: no bold, grade chips, coloured grade groups"
```

Run: `git diff --stat refs/protocr/cr1 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

### Task 2: On a phone, the name and the grade stay while the points scroll

The tiles first, then "Notele pe grupe", then the other parts; the results tables in the order Elev, Nota, the exercises, Total, with the name and the grade sticky; the pill's count only; a line that says to swipe.

**Files:**
- Modify: `src/ui/useMediaQuery.ts`, `src/admin/Layout.tsx`, `src/admin/pages/ReportPage.tsx`, `src/admin/reportPage/ReportTables.tsx`, `src/ui/brand.css`, `src/AGENTS.md`
- Test: `src/admin/pages/ReportPage.test.tsx`, `src/ui/brand.test.ts`

**Interfaces:**
- Consumes: `.grade-col` (Task 1), `useMediaQuery(query)` (`src/ui/useMediaQuery.ts`).
- Produces: `export const PHONE = '(max-width: 56.25rem)'` in `src/ui/useMediaQuery.ts`; `ResultsTable` takes `phone?: boolean` (default `false`); on a phone its table has the class `is-phone`.

- [ ] **Step 1: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ClassReport } from '../../../shared/api.ts';
```

Replace it with:

```tsx
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassReport } from '../../../shared/api.ts';
```

- [ ] **Step 2: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx

describe('ReportPage', () => {
```

Replace it with:

```tsx

describe('ReportPage on a phone', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 56.25rem)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('puts the grade right after the name and the total last, and says the table scrolls', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    const results = within(await screen.findByRole('region', { name: 'Rezultatele elevilor' }));
    expect(results.getByText('Glisează tabelul spre stânga pentru punctaje.')).toBeInTheDocument();
    const table = results.getByRole('table', { name: 'Punctajele elevilor pe exerciții' });
    expect(table).toHaveClass('is-phone');
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Elev', 'Nota', 'I.14,5p', 'II.14,5p', 'Total']);
    const [, second, missing] = within(table).getAllByRole('row').slice(1);
    const cells = within(second!).getAllByRole('cell');
    expect(within(cells[0]!).getByText('5,5')).toHaveClass('grade-chip points-3');
    expect(cells[3]).toHaveTextContent('5,5 / 10');
    // The pill shows only the count; its words stay for screen readers.
    expect(within(cells[0]!).getByText('2')).toHaveAttribute('aria-hidden', 'true');
    expect(within(cells[0]!).getByText('2 de verificat')).toHaveClass('sr-only');
    expect(within(missing!).getByRole('cell')).toHaveAttribute('colspan', '4');
  });

  it('draws the CES table for the phone too', async () => {
    const cesRow = { ...report().rows[0]!, submissionId: 7, studentId: 13, studentName: 'Bursașiu Teodor', ces: true, variant: 'ces' as const, items: [{ exerciseId: 'C1', points: 8, maxPoints: 9, flagged: false }] };
    renderAdmin('/teste/6E2-26T1/raport', apiWith(report({ cesExercises: [{ id: 'C1', label: 'Exercițiul CES 1', maxPoints: 9 }], rows: [...report().rows, cesRow] })));
    const ces = await screen.findByRole('table', { name: 'Punctajele elevilor pe exerciții, varianta CES' });
    expect(ces).toHaveClass('is-phone');
    expect(within(ces).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Elev', 'Nota', 'C19p', 'Total']);
  });
});

describe('ReportPage', () => {
```

- [ ] **Step 3: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
    ]);
    const row = within(table).getAllByRole('row')[2]!;
```

Replace it with:

```tsx
    ]);
    expect(table).not.toHaveClass('is-phone');
    expect(screen.queryByText('Glisează tabelul spre stânga pentru punctaje.')).not.toBeInTheDocument();
    const row = within(table).getAllByRole('row')[2]!;
```

- [ ] **Step 4: Edit `src/ui/brand.test.ts`**

Find this block:

```ts

  it('gives the stage sentence the whole width of the panel, and puts "Raportul clasei" beside the students only in a wide panel', () => {
```

Replace it with:

```ts

  it('keeps the name and the grade of the class report in view on a phone, the tiles first', () => {
    const name = declarations('table.results-table.is-phone th:first-child');
    const grade = declarations('table.results-table.is-phone .grade-col');
    expect(value(grade, 'position')).toBe('sticky');
    expect(value(grade, 'left')).toBe(value(name, 'width'));
    expect(value(name, 'max-width')).toBe(value(name, 'width'));
    expect(value(name, 'white-space')).toBe('normal');
    expect(value(declarations('  .report-main'), 'display')).toBe('contents');
    expect(value(declarations('  .report-main > .report-part:first-child'), 'order')).toBe('1');
    expect(value(declarations('  .report-side'), 'order')).toBe('2');
  });

  it('gives the stage sentence the whole width of the panel, and puts "Raportul clasei" beside the students only in a wide panel', () => {
```

- [ ] **Step 5: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/ReportPage.test.tsx src/ui/brand.test.ts`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  3 failed | 49 passed (52)`: `brand.css` has no `is-phone` rules yet (`expected -1 to be greater than or equal to 0`); the page has no swipe line (`Unable to find an element with the text: Glisează tabelul spre stânga pentru punctaje.`); and the CES table is not drawn for the phone (`expect(element).toHaveClass("is-phone")`). The other tests of the two files pass, the desktop order too.

- [ ] **Step 6: Edit `src/ui/useMediaQuery.ts`**

Find this block:

```ts
import { useCallback, useSyncExternalStore } from 'react';

```

Replace it with:

```ts
import { useCallback, useSyncExternalStore } from 'react';

// The phone layout of brand.css: the bar at the bottom, a panel over the page,
// one column.
export const PHONE = '(max-width: 56.25rem)';

```

- [ ] **Step 7: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
import { ThemeButton } from '../ui/ThemeButton.tsx';
import { useMediaQuery } from '../ui/useMediaQuery.ts';
import { useApi } from './ApiContext.tsx';
```

Replace it with:

```tsx
import { ThemeButton } from '../ui/ThemeButton.tsx';
import { PHONE, useMediaQuery } from '../ui/useMediaQuery.ts';
import { useApi } from './ApiContext.tsx';
```

- [ ] **Step 8: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
const ACCOUNTS_REFRESH_MS = 5 * 60_000;

// The phone layout of brand.css: the bar at the bottom, a panel over the page.
const PHONE = '(max-width: 56.25rem)';

```

Replace it with:

```tsx
const ACCOUNTS_REFRESH_MS = 5 * 60_000;

```

- [ ] **Step 9: Edit `src/admin/pages/ReportPage.tsx`**

Find this block:

```tsx
import { countLabel, formatDate, uploadStatusLabel } from '../../ui/format.ts';
import { classPdf, classPdfFileName } from '../pdf/classPdf.ts';
```

Replace it with:

```tsx
import { countLabel, formatDate, uploadStatusLabel } from '../../ui/format.ts';
import { PHONE, useMediaQuery } from '../../ui/useMediaQuery.ts';
import { classPdf, classPdfFileName } from '../pdf/classPdf.ts';
```

- [ ] **Step 10: Edit `src/admin/pages/ReportPage.tsx`**

Find this block:

```tsx
  const current = useCurrentPart(graded);

```

Replace it with:

```tsx
  const current = useCurrentPart(graded);
  // On a phone the results tables put the grade right after the name.
  const phone = useMediaQuery(PHONE);

```

- [ ] **Step 11: Edit `src/admin/pages/ReportPage.tsx`**

Find this block:

```tsx
              </div>
              <ResultsTable code={code} table={classTable!} missing={report.missing} />
              {cesTable && (
```

Replace it with:

```tsx
              </div>
              {phone && <p className="hint report-scroll-hint">Glisează tabelul spre stânga pentru punctaje.</p>}
              <ResultsTable code={code} table={classTable!} missing={report.missing} phone={phone} />
              {cesTable && (
```

- [ ] **Step 12: Edit `src/admin/pages/ReportPage.tsx`**

Find this block:

```tsx
                  <p className="hint report-subhead-line">Lucrările variantei CES, cu exercițiile ei. Notele lor intră în media clasei.</p>
                  <ResultsTable code={code} table={cesTable} missing={[]} caption="Punctajele elevilor pe exerciții, varianta CES" />
                </>
```

Replace it with:

```tsx
                  <p className="hint report-subhead-line">Lucrările variantei CES, cu exercițiile ei. Notele lor intră în media clasei.</p>
                  <ResultsTable code={code} table={cesTable} missing={[]} caption="Punctajele elevilor pe exerciții, varianta CES" phone={phone} />
                </>
```

- [ ] **Step 13: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
// paper has a row that says why (in the class table: `missing` is empty for
// the CES table).
export function ResultsTable({
```

Replace it with:

```tsx
// paper has a row that says why (in the class table: `missing` is empty for
// the CES table). On a phone the grade comes right after the name and the
// total last; the name and the grade stay while the points scroll (`is-phone`
// in brand.css), and the pill shows only the count.
export function ResultsTable({
```

- [ ] **Step 14: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
  caption = 'Punctajele elevilor pe exerciții',
}: {
```

Replace it with:

```tsx
  caption = 'Punctajele elevilor pe exerciții',
  phone = false,
}: {
```

- [ ] **Step 15: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
  caption?: string;
}) {
  const { exercises, rows } = table;
  return (
    <div className="table-wrap">
      <table className="report-table results-table">
        <caption className="sr-only">{caption}</caption>
```

Replace it with:

```tsx
  caption?: string;
  phone?: boolean;
}) {
  const { exercises, rows } = table;
  const exerciseHeads = exercises.map((exercise) => (
    <th key={exercise.id} scope="col" className="num" title={exercise.label}>
      {exercise.id}
      <span className="report-max">{formatPoints(exercise.maxPoints)}p</span>
    </th>
  ));
  const totalHead = (
    <th key="total" scope="col" className="num">
      Total
    </th>
  );
  const gradeHead = (
    <th key="grade" scope="col" className="grade-col">
      Nota
    </th>
  );
  return (
    <div className="table-wrap">
      <table className={phone ? 'report-table results-table is-phone' : 'report-table results-table'}>
        <caption className="sr-only">{caption}</caption>
```

- [ ] **Step 16: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
            <th scope="col">Elev</th>
            {exercises.map((exercise) => (
              <th key={exercise.id} scope="col" className="num" title={exercise.label}>
                {exercise.id}
                <span className="report-max">{formatPoints(exercise.maxPoints)}p</span>
              </th>
            ))}
            <th scope="col" className="num">
              Total
            </th>
            <th scope="col" className="grade-col">
              Nota
            </th>
          </tr>
```

Replace it with:

```tsx
            <th scope="col">Elev</th>
            {phone ? [gradeHead, ...exerciseHeads, totalHead] : [...exerciseHeads, totalHead, gradeHead]}
          </tr>
```

- [ ] **Step 17: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
        <tbody>
          {rows.map((row) => (
            <tr key={row.submissionId}>
              <th scope="row">
                <Link to={`/teste/${code}/elevi/${row.submissionId}`}>{row.studentName}</Link>
                {(row.ces || row.variant === 'ces') && <CesTag />}
              </th>
              {exercises.map((exercise) => {
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
              <td className="grade-col">
                <GradeChip grade={row.grade} />
                {row.flagCount > 0 && <span className="points-pill">{row.flagCount} de verificat</span>}
              </td>
            </tr>
          ))}
          {missing.map((student) => (
```

Replace it with:

```tsx
        <tbody>
          {rows.map((row) => {
            const points = exercises.map((exercise) => {
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
            });
            const total = (
              <td key="total" className="num">
                {formatPoints(row.total)} / {formatPoints(row.maxTotal)}
              </td>
            );
            const grade = (
              <td key="grade" className="grade-col">
                <GradeChip grade={row.grade} />
                {row.flagCount > 0 &&
                  (phone ? (
                    <span className="points-pill">
                      <span aria-hidden="true">{row.flagCount}</span>
                      <span className="sr-only">{row.flagCount} de verificat</span>
                    </span>
                  ) : (
                    <span className="points-pill">{row.flagCount} de verificat</span>
                  ))}
              </td>
            );
            return (
              <tr key={row.submissionId}>
                <th scope="row">
                  <Link to={`/teste/${code}/elevi/${row.submissionId}`}>{row.studentName}</Link>
                  {(row.ces || row.variant === 'ces') && <CesTag />}
                </th>
                {phone ? [grade, ...points, total] : [...points, total, grade]}
              </tr>
            );
          })}
          {missing.map((student) => (
```

- [ ] **Step 18: Edit `src/ui/brand.css`**

Find this block:

```css

  .report-side {
    position: static;
  }
```

Replace it with:

```css

  /* The tiles first, then "Notele pe grupe", then the other parts. */
  .report-main {
    display: contents;
  }

  .report-side {
    position: static;
    order: 2;
  }

  .report-main > .report-part {
    order: 3;
  }

  .report-main > .report-part:first-child {
    order: 1;
  }

  .report-part + .report-part {
    margin-top: 0;
  }
```

- [ ] **Step 19: Edit `src/ui/brand.css`**

Find this block:

```css
  .report-toc {
    display: none;
  }
}
```

Replace it with:

```css
  .report-toc {
    display: none;
  }

  .report-scroll-hint {
    margin: -0.5rem 1.25rem 0.5rem;
    font-size: 0.8125rem;
  }
}
```

- [ ] **Step 20: Edit `src/ui/brand.css`**

Find this block:

```css
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
```

Replace it with:

```css
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .report-tiles > div:last-child {
    grid-column: 1 / -1;
  }
```

- [ ] **Step 21: Edit `src/ui/brand.css`**

Find this block:

```css
  padding-right: 0.6rem;
}
```

Replace it with:

```css
  padding-right: 0.6rem;
}

/* On a phone (`is-phone`, set by the page): the grade right after the name,
   and both stay while the points scroll under them. The name's column has a
   fixed width, which is where the grade's column sticks. */
table.results-table.is-phone th:first-child {
  width: 8.25rem;
  min-width: 8.25rem;
  max-width: 8.25rem;
  line-height: 1.25;
  white-space: normal;
  overflow-wrap: anywhere;
}

table.results-table.is-phone .grade-col {
  position: sticky;
  left: 8.25rem;
  z-index: 1;
  background: var(--sheet);
  box-shadow: 6px 0 6px -6px color-mix(in srgb, var(--text) 30%, transparent);
}

table.results-table.is-phone td.grade-col .points-pill {
  margin-left: 0.25rem;
}
```

- [ ] **Step 22: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1), (x + 1)/3, a negated letter p̄ (a combining bar, which the font draws beside the letter, so the page draws it) and a subscript A_p or A_(p∧q), and leaves intervals, words such as și/sau and names such as x_max as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen (Rezultate is the one screen with two, each the main action of its own box: "Publică toate rezultatele" and "Deschide raportul"), filled orange (`.button button-wait`) for the one main action of a screen whose work waits on the teacher ("Începe verificarea" in Verificare), and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `Crumbs.tsx` is the path at the top of the test page and of the paper page ("Teste › Clasa 7E2 › <test>", a `nav` "Unde ești"; the last step is the page itself, not a link). `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă and Corectare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8, spec 2026-11-14: the box at its top in `ResultsAccess.tsx`, grey with "Publică toate rezultatele" while no result is published, green once students can read results (for all, or some alone), with "Oprește accesul la rezultate" (or "Publică toate rezultatele" while only some are) and the two ways students find them, numbered: their own link, kept on the phone, and the test's link for the students scanned again (its QR code, "Copiază linkul", "Descarcă codul QR", a PNG, and "Arată codul QR pe tot ecranul"); the teacher's multi-upload link is not in Rezultate; a copy the browser refuses shows the link in a field, selected and described by the line above it (`admin/CopyLink.tsx`, for both copy buttons of the panel); the students' result links in `ResultLinksTable.tsx`, with the grade right after the name (a `GradeChip`, with its points still to check beside it in an orange label), the points, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Elevii" with its count as a label (green "toate publicate" once every result is published, grey while some wait); "Raportul clasei" in `ReportCard.tsx` (spec 2026-11-14), beside the table in a wide panel (its top level with the table's, a subgrid) and above it in a narrow one (a container query on `.results-layout`): the average in its grade colour, the grades by group (`gradeGroups` of `shared/stats.ts`, counted from the uploads list: no report query), "Deschide raportul" (the panel's main button) and "CSV pentru catalog" (a quiet text button: the class report's CSV, read when pressed); the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the subject (`SubjectForm.tsx`: "Se stabilește la corectare" until the robot finds it, "Alege materia" or "Schimbă materia" opening the seven subjects in place (while the robot reads the test, only a line that says when the subject can change), with a line when the list is made again and the papers graded again), the files, the students' link while the test is a draft or open, rename, archive (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`), delete), the overview of Verificare (`ReviewOverview.tsx`: the graded papers that had points, counted with `flagCount` and `checkedCount`; "<checked> din <total> verificate", its bar, "Mai sunt …" and the orange "Începe verificarea" (nothing checked yet) or "Continuă verificarea" into the paper page at the first point left; "De verificat", a label per student with points left ("<checked>/<total>", opening that student's first point), and "Gata", a label per student done (opening the paper with all its exercises); once all is checked a green box with "Mergi la Rezultate" (the panel then leaves out "Următoarea etapă"), and "Nimic de verificat." when no graded paper had a point; CES as the other tables show it (`ces` or `variant === 'ces'`), in the label's accessible name too; no papers table and no list of the points: the paper page decides them), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page learns the answer from the version check of the shell), the uploads table (`UploadsTable.tsx`, the full width of its card; the grade right after the name, a `GradeChip.tsx`: the grade in a soft chip of the class report's colours, `.points-N` of `pointsLevel(grade, 10)`; "De verificat" in an orange label; both papers tables are drawn like the points table of Verificare, with no bold: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off; a student who sent nothing is "Nu a trimis" while the uploads are open and "Nu a participat" after; after, an upload left open with files is "Așteaptă corectarea" and one with no file "Nu a participat"), "Recorectează tot"). `pages/PaperPage.tsx` and `paperPage/` are the paper page (spec `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md` §4, `/teste/:code/elevi/:submissionId`): the path (`Crumbs`), the head (`PaperHead.tsx`: `.submission-head`, the name, the test, the state and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right; then the result link row; `usePaperActions` holds Recorectează, Resetează and Reîncearcă and the news after them), the switch "Toate exercițiile" / "Doar de verificat (N)" (N the points of the whole test; the view is in the address, `vedere=verificare`, and stays when she moves), then the moves, small and on one row also on a phone: "‹ Punct 3/47 ›" (a group "Punctele de verificat", only with the points to check, never with all the exercises: the arrows are "Punctul anterior" and "Următorul punct", both alike, with the key in their tooltip, and between them the open point's place among the points J and K walk), "‹ Elev 2/7 ›" (a group "Elevii", "Elevul anterior" and "Elevul următor", and between them the student's place in the list; they go round, the last to the first, but after a decision on the last student the focus goes to the exercises, not to "Elevul următor") and "Lucrarea" (a picture icon, pressed while the paper shows, which hides it or shows it again), then three columns: "Elevii" (`StudentList.tsx`: every upload with a paper, the grade, the points to check in orange or the state; only the points to check: the papers with points first; a name opens that paper at the top of the window; it folds to a strip, kept in this browser as `quickeval:paperStudentsFolded`), the exercises (`GradedResult` with `check`: a click on a row or its "Arată pe lucrare" opens it, `?punct=<item id>` or `pagini`, and a second click on the open row closes it, after `CLOSE_DELAY` (300 ms), so the first click of a double or triple click, which selects a word to copy, never closes it (a click that ends a selection of the row's text does nothing); a row to check stays open when a click opens another row (`keptKeys`, kept in `Paper` until the teacher closes or checks it, none for another paper; only a click on a row, its "Verifică" or its "Arată pe lucrare" keeps it, `paperKeep` in the navigation state, never J, K or the buttons), so the rows under it never move: its decision stays in place, dimmed, `inert` and `aria-hidden` (`DecisionSlot`), and a click on its row or its "Verifică" opens it again; the A key and the focus after a decision reach only the open row's slot (`.decision-slot.is-current`); "Doar de verificat" keeps only the rows to check and the open one, without the texts for the student; a row to check is calm: its points in a soft orange label (`.points-pill`) and one "Verifică" icon button that opens it (an orange magnifier with a check, like the pencil, its word in its name and tooltip), with no reason in the row; the open row to check shows `PointDecision.tsx` under it, region "Decizia", in a box with a light orange border: the robot's reason, "Accept <points>" (the robot's points), the stepper (− and + move by 0,5 on the 0,05 steps, between 0 and the maximum; any value in steps of 0,05 can be typed) and "Salvează", and what the grade becomes with another value; for the pages, the reason and "Am verificat paginile"; while a decision shows, the bar names the keys between the switch and the moves, only when the whole line fits there (`.review-keys`: a one-line wrapping box whose line wraps out of sight)), and the paper (`reviewPage/ReviewPhoto.tsx`, staying in view and level with the other two columns; its × button ("Ascunde lucrarea", top right) hides it, the exercises taking its room, and the focus goes to "Lucrarea" in the bar; the choice is kept in this browser as `quickeval:paperPhotoFolded`; a graded paper with nothing left to check opens with it hidden (chosen when the paper opens, from its upload row), and its toggles there are not saved; graded again, it shows as the saved choice says; while it is folded, 1–9 do nothing and the bar does not name them, and "Arată pe lucrare" shows it again (an open row stays open): each page with "2/3" beside the name and its file's name and size, as the student sent it; over the photo, a floating bar on the top left holds "Arată chenarul" (an orange dashed-frame toggle, while the open answer has an area) and "Toată pagina" (off while the page is whole), and the zoom's − and + float alone on the top right; a photo zooms inside the pane (a left click, a right click and the two buttons over the photo take one small step, out and in; two fingers pinch on a touch screen, and the wheel scrolls the page), a line over the page says what a click does until she zooms, in the words of the pointer at hand (a phone has no right button), and the open exercise draws an orange border around the robot's area of its answer, on the whole page, because the page never zooms by itself; the border's arrows step through the parts of an answer, each part opening on its page, whole). The exercises get three fifths of the room the students leave, the paper two; below 1200px the students go under the exercises, and below 900px one column: the exercises, the paper, the students. `paperPage/paths.ts` writes the addresses (replaced, never a new step in the history) and picks the students' order and the points J and K walk: every point of the test while only the points to check show, else the open student's. `reviewPage/points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first) and steps between them. The old address of the review, `/teste/:code/verificare?lucrare=&punct=`, opens the page with only the points to check (`ReviewRedirect`: the named paper and point, else `firstSpot()`, else the test's Verificare); every link to the points to check uses it (`reviewPath`). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point: with only the points to check, also on the next student; with all the exercises, the next point of the same student, and when none is left the row stays open and "Elevul următor" takes the focus. It moves only if the teacher is still at the decided point (a call-level `onSuccess` of `mutate`, which does not run once the page is gone). The shell draws the page anew for another address path (`ErrorBoundary key={location.pathname}`), so where the focus goes after a decision rides in the navigation state (`paperFocus`), given once per address. A new address path opens at the top of the window (`Layout.tsx`, a PUSH only): a replaced one (the paper page's moves) keeps its place, and Back or Forward leave it to the browser. A refused decision reads the paper and the test again. The papers the teacher can move to next (the next and the previous student, the next point's paper) are read ahead, so another student's page shows at once; while a paper loads, its place keeps a screen's height. A paper with no result now (uploading, sent, graded again) shows its pages and why (`submissionPage/waitingText.ts`), a failed one "Reîncearcă"; when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A (presses "Accept" of an open row to check), J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). "Alte acțiuni" (`useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. Points are never bold. Without the paper page (no page uses that plain list now), an exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds "Verifică" or "Arată pe lucrare" (paper page only) and the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). It is drawn like the test page (spec 2026-11-15): no bold (names regular, in the text colour, a link only under the pointer), the grade a `GradeChip` with its points to check in an orange "N de verificat" pill beside it, the average tile in its grade colour, and "Notele pe grupe" in the bars of `ReportCard` (`GRADE_GROUP_LEVELS` of `ui/format.ts`, shared). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, its font (Roboto) drops without a sign every character it lacks, so `pdfSymbols.ts` writes those signs as words (∧ și, ∀ oricare ar fi, ⋮ divizibil cu) and `pdfMath.ts` draws a negated letter p̄ with a line over it, A_p with a subscript and σᵏ with a raised letter (pdfmake runs), `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

Replace it with:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1), (x + 1)/3, a negated letter p̄ (a combining bar, which the font draws beside the letter, so the page draws it) and a subscript A_p or A_(p∧q), and leaves intervals, words such as și/sau and names such as x_max as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen (Rezultate is the one screen with two, each the main action of its own box: "Publică toate rezultatele" and "Deschide raportul"), filled orange (`.button button-wait`) for the one main action of a screen whose work waits on the teacher ("Începe verificarea" in Verificare), and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `Crumbs.tsx` is the path at the top of the test page and of the paper page ("Teste › Clasa 7E2 › <test>", a `nav` "Unde ești"; the last step is the page itself, not a link). `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă and Corectare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8, spec 2026-11-14: the box at its top in `ResultsAccess.tsx`, grey with "Publică toate rezultatele" while no result is published, green once students can read results (for all, or some alone), with "Oprește accesul la rezultate" (or "Publică toate rezultatele" while only some are) and the two ways students find them, numbered: their own link, kept on the phone, and the test's link for the students scanned again (its QR code, "Copiază linkul", "Descarcă codul QR", a PNG, and "Arată codul QR pe tot ecranul"); the teacher's multi-upload link is not in Rezultate; a copy the browser refuses shows the link in a field, selected and described by the line above it (`admin/CopyLink.tsx`, for both copy buttons of the panel); the students' result links in `ResultLinksTable.tsx`, with the grade right after the name (a `GradeChip`, with its points still to check beside it in an orange label), the points, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Elevii" with its count as a label (green "toate publicate" once every result is published, grey while some wait); "Raportul clasei" in `ReportCard.tsx` (spec 2026-11-14), beside the table in a wide panel (its top level with the table's, a subgrid) and above it in a narrow one (a container query on `.results-layout`): the average in its grade colour, the grades by group (`gradeGroups` of `shared/stats.ts`, counted from the uploads list: no report query), "Deschide raportul" (the panel's main button) and "CSV pentru catalog" (a quiet text button: the class report's CSV, read when pressed); the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the subject (`SubjectForm.tsx`: "Se stabilește la corectare" until the robot finds it, "Alege materia" or "Schimbă materia" opening the seven subjects in place (while the robot reads the test, only a line that says when the subject can change), with a line when the list is made again and the papers graded again), the files, the students' link while the test is a draft or open, rename, archive (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`), delete), the overview of Verificare (`ReviewOverview.tsx`: the graded papers that had points, counted with `flagCount` and `checkedCount`; "<checked> din <total> verificate", its bar, "Mai sunt …" and the orange "Începe verificarea" (nothing checked yet) or "Continuă verificarea" into the paper page at the first point left; "De verificat", a label per student with points left ("<checked>/<total>", opening that student's first point), and "Gata", a label per student done (opening the paper with all its exercises); once all is checked a green box with "Mergi la Rezultate" (the panel then leaves out "Următoarea etapă"), and "Nimic de verificat." when no graded paper had a point; CES as the other tables show it (`ces` or `variant === 'ces'`), in the label's accessible name too; no papers table and no list of the points: the paper page decides them), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page learns the answer from the version check of the shell), the uploads table (`UploadsTable.tsx`, the full width of its card; the grade right after the name, a `GradeChip.tsx`: the grade in a soft chip of the class report's colours, `.points-N` of `pointsLevel(grade, 10)`; "De verificat" in an orange label; both papers tables are drawn like the points table of Verificare, with no bold: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off; a student who sent nothing is "Nu a trimis" while the uploads are open and "Nu a participat" after; after, an upload left open with files is "Așteaptă corectarea" and one with no file "Nu a participat"), "Recorectează tot"). `pages/PaperPage.tsx` and `paperPage/` are the paper page (spec `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md` §4, `/teste/:code/elevi/:submissionId`): the path (`Crumbs`), the head (`PaperHead.tsx`: `.submission-head`, the name, the test, the state and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right; then the result link row; `usePaperActions` holds Recorectează, Resetează and Reîncearcă and the news after them), the switch "Toate exercițiile" / "Doar de verificat (N)" (N the points of the whole test; the view is in the address, `vedere=verificare`, and stays when she moves), then the moves, small and on one row also on a phone: "‹ Punct 3/47 ›" (a group "Punctele de verificat", only with the points to check, never with all the exercises: the arrows are "Punctul anterior" and "Următorul punct", both alike, with the key in their tooltip, and between them the open point's place among the points J and K walk), "‹ Elev 2/7 ›" (a group "Elevii", "Elevul anterior" and "Elevul următor", and between them the student's place in the list; they go round, the last to the first, but after a decision on the last student the focus goes to the exercises, not to "Elevul următor") and "Lucrarea" (a picture icon, pressed while the paper shows, which hides it or shows it again), then three columns: "Elevii" (`StudentList.tsx`: every upload with a paper, the grade, the points to check in orange or the state; only the points to check: the papers with points first; a name opens that paper at the top of the window; it folds to a strip, kept in this browser as `quickeval:paperStudentsFolded`), the exercises (`GradedResult` with `check`: a click on a row or its "Arată pe lucrare" opens it, `?punct=<item id>` or `pagini`, and a second click on the open row closes it, after `CLOSE_DELAY` (300 ms), so the first click of a double or triple click, which selects a word to copy, never closes it (a click that ends a selection of the row's text does nothing); a row to check stays open when a click opens another row (`keptKeys`, kept in `Paper` until the teacher closes or checks it, none for another paper; only a click on a row, its "Verifică" or its "Arată pe lucrare" keeps it, `paperKeep` in the navigation state, never J, K or the buttons), so the rows under it never move: its decision stays in place, dimmed, `inert` and `aria-hidden` (`DecisionSlot`), and a click on its row or its "Verifică" opens it again; the A key and the focus after a decision reach only the open row's slot (`.decision-slot.is-current`); "Doar de verificat" keeps only the rows to check and the open one, without the texts for the student; a row to check is calm: its points in a soft orange label (`.points-pill`) and one "Verifică" icon button that opens it (an orange magnifier with a check, like the pencil, its word in its name and tooltip), with no reason in the row; the open row to check shows `PointDecision.tsx` under it, region "Decizia", in a box with a light orange border: the robot's reason, "Accept <points>" (the robot's points), the stepper (− and + move by 0,5 on the 0,05 steps, between 0 and the maximum; any value in steps of 0,05 can be typed) and "Salvează", and what the grade becomes with another value; for the pages, the reason and "Am verificat paginile"; while a decision shows, the bar names the keys between the switch and the moves, only when the whole line fits there (`.review-keys`: a one-line wrapping box whose line wraps out of sight)), and the paper (`reviewPage/ReviewPhoto.tsx`, staying in view and level with the other two columns; its × button ("Ascunde lucrarea", top right) hides it, the exercises taking its room, and the focus goes to "Lucrarea" in the bar; the choice is kept in this browser as `quickeval:paperPhotoFolded`; a graded paper with nothing left to check opens with it hidden (chosen when the paper opens, from its upload row), and its toggles there are not saved; graded again, it shows as the saved choice says; while it is folded, 1–9 do nothing and the bar does not name them, and "Arată pe lucrare" shows it again (an open row stays open): each page with "2/3" beside the name and its file's name and size, as the student sent it; over the photo, a floating bar on the top left holds "Arată chenarul" (an orange dashed-frame toggle, while the open answer has an area) and "Toată pagina" (off while the page is whole), and the zoom's − and + float alone on the top right; a photo zooms inside the pane (a left click, a right click and the two buttons over the photo take one small step, out and in; two fingers pinch on a touch screen, and the wheel scrolls the page), a line over the page says what a click does until she zooms, in the words of the pointer at hand (a phone has no right button), and the open exercise draws an orange border around the robot's area of its answer, on the whole page, because the page never zooms by itself; the border's arrows step through the parts of an answer, each part opening on its page, whole). The exercises get three fifths of the room the students leave, the paper two; below 1200px the students go under the exercises, and below 900px one column: the exercises, the paper, the students. `paperPage/paths.ts` writes the addresses (replaced, never a new step in the history) and picks the students' order and the points J and K walk: every point of the test while only the points to check show, else the open student's. `reviewPage/points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first) and steps between them. The old address of the review, `/teste/:code/verificare?lucrare=&punct=`, opens the page with only the points to check (`ReviewRedirect`: the named paper and point, else `firstSpot()`, else the test's Verificare); every link to the points to check uses it (`reviewPath`). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point: with only the points to check, also on the next student; with all the exercises, the next point of the same student, and when none is left the row stays open and "Elevul următor" takes the focus. It moves only if the teacher is still at the decided point (a call-level `onSuccess` of `mutate`, which does not run once the page is gone). The shell draws the page anew for another address path (`ErrorBoundary key={location.pathname}`), so where the focus goes after a decision rides in the navigation state (`paperFocus`), given once per address. A new address path opens at the top of the window (`Layout.tsx`, a PUSH only): a replaced one (the paper page's moves) keeps its place, and Back or Forward leave it to the browser. A refused decision reads the paper and the test again. The papers the teacher can move to next (the next and the previous student, the next point's paper) are read ahead, so another student's page shows at once; while a paper loads, its place keeps a screen's height. A paper with no result now (uploading, sent, graded again) shows its pages and why (`submissionPage/waitingText.ts`), a failed one "Reîncearcă"; when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A (presses "Accept" of an open row to check), J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). "Alte acțiuni" (`useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. Points are never bold. Without the paper page (no page uses that plain list now), an exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds "Verifică" or "Arată pe lucrare" (paper page only) and the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). It is drawn like the test page (spec 2026-11-15): no bold (names regular, in the text colour, a link only under the pointer), the grade a `GradeChip` with its points to check in an orange "N de verificat" pill beside it, the average tile in its grade colour, and "Notele pe grupe" in the bars of `ReportCard` (`GRADE_GROUP_LEVELS` of `ui/format.ts`, shared). Below 56.25rem (`PHONE` of `ui/useMediaQuery.ts`): one column, without the list of parts: the tiles, then "Notele pe grupe", then the other parts; the results tables are drawn for the phone (`is-phone`): Elev, Nota, the exercises, Total, the name (8.25rem, wrapping) and the grade staying while the points scroll, the pill showing only the count, and a line over the table that says to swipe. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, its font (Roboto) drops without a sign every character it lacks, so `pdfSymbols.ts` writes those signs as words (∧ și, ∀ oricare ar fi, ⋮ divizibil cu) and `pdfMath.ts` draws a negated letter p̄ with a line over it, A_p with a subscript and σᵏ with a raised letter (pdfmake runs), `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

- [ ] **Step 23: Edit `src/AGENTS.md`**

Find this block:

```markdown
- A PDF never carries what is for the teacher only: `studentPdfInput()` is the only way into the student's PDF, and its type has no confidence and no review reason. Keep it so, and keep no word about how the work was graded in it. CSV cells that hold text go through `csvText()` (`shared/csv.ts`), which guards against formulas.
- The class PDF and the report page have one column for each exercise (up to 60): the page table scrolls in its `.table-wrap` and uses `report-table`, not the `uploads` table that turns into cards on a phone. The grade table of the class page does the same. The page table puts the exercises first, then Total and Nota (each exercise's maximum under its short name); the class PDF and the CSV keep their order.
- Dark colours in `ui/brand.css` are written twice (the `[data-theme="dark"]` block and the `prefers-color-scheme` block): keep both copies equal, the class colours included (`ui/brand.test.ts` checks it). The styles are flat: no gradients, and a shadow (`--float`) only on what floats (panels, menus).
```

Replace it with:

```markdown
- A PDF never carries what is for the teacher only: `studentPdfInput()` is the only way into the student's PDF, and its type has no confidence and no review reason. Keep it so, and keep no word about how the work was graded in it. CSV cells that hold text go through `csvText()` (`shared/csv.ts`), which guards against formulas.
- The class PDF and the report page have one column for each exercise (up to 60): the page table scrolls in its `.table-wrap` and uses `report-table`, not the `uploads` table that turns into cards on a phone. The grade table of the class page does the same. The page table puts the exercises first, then Total and Nota (each exercise's maximum under its short name), and on a phone Nota right after Elev and Total last; the class PDF and the CSV keep their order.
- Dark colours in `ui/brand.css` are written twice (the `[data-theme="dark"]` block and the `prefers-color-scheme` block): keep both copies equal, the class colours included (`ui/brand.test.ts` checks it). The styles are flat: no gradients, and a shadow (`--float`) only on what floats (panels, menus).
```

- [ ] **Step 24: Run the typecheck and the whole suite**

Run: `npm run typecheck`
Expected: no output after the command line (exit code 0).

Run: `npm test`
Expected: `Test Files  182 passed | 1 skipped (183)`, `Tests  2809 passed | 3 skipped (2812)` (the same three times more, once with `TZ=UTC`).

- [ ] **Step 25: Commit**

```bash
git add src/ui/useMediaQuery.ts src/admin/Layout.tsx src/admin/pages/ReportPage.tsx src/admin/reportPage/ReportTables.tsx src/ui/brand.css src/AGENTS.md src/admin/pages/ReportPage.test.tsx src/ui/brand.test.ts
git commit -m "On a phone, keep each student's name and grade in view while the points scroll"
```

Run: `git diff --stat refs/protocr/cr2 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

### After Task 2: Look at the page

- [ ] **Step 1: Check the report in the browser**

A report needs a graded paper. Run `npm run db:local`, then `npm run preview`, then `npm run smoke` in a second terminal: the smoke test leaves one class with one paper graded by a pretend robot. Log in at `http://127.0.0.1:8788/teacher/` as the local teacher and open that test's report (Teste → the test → "Deschide raportul") at 1900 px and on a 375 px phone, light and dark. If the PC has a local database with more graded papers, use that test instead: more rows show the phone table better.
Expected: no bold names or numbers; each grade in a coloured chip, the points to check in an orange pill beside it; "Notele pe grupe" in red, yellow, green and dark green bars. On the phone: the tiles, then "Notele pe grupe", then the table with Elev, Nota, the exercises and Total; swiping the table moves only the points, the name and the grade stay. No page scrolls sideways (the table scrolls inside its box).

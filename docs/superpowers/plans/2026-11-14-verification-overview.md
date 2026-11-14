# Verificare overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new page opens at the top; a checked paper opens with its photo hidden; the Verificare panel becomes a short overview (progress, students as labels, one orange button).

**Architecture:** Front end changes in the teacher app (`Layout.tsx`, `PaperPage.tsx`, a new `testPage/ReviewOverview.tsx` in place of `ReviewList.tsx`), one new count per upload row from the server (`UploadRow.checkedCount`, counted in `listUploads` with a new partial index so it reads only checked items), and one new button style in `brand.css`.

**Tech Stack:** React 19 + React Router, TanStack Query, Vitest + Testing Library, Hono on Cloudflare Pages Functions, D1 (SQLite).

**Spec:** `docs/superpowers/specs/2026-11-14-verification-overview-design.md`

## Global Constraints

- All user-facing text is Romanian; code, comments and docs are English. No ticket numbers in comments.
- Relative imports name the `.ts`/`.tsx` file. No enums, namespaces or constructor parameter properties (`erasableSyntaxOnly`).
- Dark colours in `src/ui/brand.css` are written twice (the `:root[data-theme="dark"]` block and the `prefers-color-scheme` block); keep both equal (`src/ui/brand.test.ts` checks it).
- Flat look: no gradients, no shadows on in-page elements.
- A new migration runs on the live database before the code that needs it reaches `main` (`docs/deploy.md`). One statement per `;` at a line end.
- Commits: stage files by path (never `git add -A`), no AI attribution lines.
- Before the final push: `npm run typecheck` and `npm test` (the whole suite, alone, in the foreground).

## Review Focus

1. A paper whose last point the teacher decides on the paper page keeps its photo (the fold is chosen only when a paper opens) — test in Task 2.
2. Opening a checked paper and pressing "Lucrarea" must not change `quickeval:paperPhotoFolded` — test in Task 2.
3. A paper graded again starts its checked count at 0 (a new evaluation row) — test in Task 3.
4. A test whose graded papers never had a point to check shows "Nimic de verificat." and lists no student — test in Task 4.
5. The paper page's own moves (replace navigations) never scroll the window — test in Task 1.

---

### Task 1: Scroll to the top on a new page

**Files:**
- Modify: `src/admin/Layout.tsx` (the component that renders `<ErrorBoundary key={location.pathname}>`)
- Modify: `src/test/setup.ts`
- Test: `src/admin/Layout.test.tsx`

**Interfaces:**
- Produces: nothing other tasks use.

- [ ] **Step 1: Stub `window.scrollTo` for every web test**

jsdom has no `scrollTo` (it logs "Not implemented"). In `src/test/setup.ts`, when `typeof window !== 'undefined'`, set `window.scrollTo = () => {}` once at the top of the file (the setup file also runs for non-browser projects, hence the guard). Tests spy on it with `vi.spyOn(window, 'scrollTo')`.

- [ ] **Step 2: Write the failing tests** in `src/admin/Layout.test.tsx`, in `describe('the shell')`:

```tsx
it('opens a new page at the top', async () => {
  const scroll = vi.spyOn(window, 'scrollTo');
  renderAdmin('/', createFakeApi({ /* the file's usual minimal data */ }), <LocationProbe />);
  await userEvent.click(await screen.findByRole('link', { name: 'Clase' }));
  await expectLocation('/clase');
  expect(scroll).toHaveBeenCalledWith(0, 0);
});

it('keeps the scroll for a replaced address and for a new hash', async () => {
  // A probe button that calls navigate('/clase', { replace: true }), then one that navigates to '/#x'.
  const scroll = vi.spyOn(window, 'scrollTo');
  // ...render with the probe, clear the spy after the first render, click both probes
  expect(scroll).not.toHaveBeenCalled();
});
```

Use the file's existing helpers (`BackButton` shows how a probe component calls `useNavigate`). Reset the spy (`scroll.mockClear()`) after the first page renders, so only the moves count.

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/admin/Layout.test.tsx`
Expected: "opens a new page at the top" FAILS (`scrollTo` never called); the second passes (guard).

- [ ] **Step 4: Implement in `src/admin/Layout.tsx`**

`const navigationType = useNavigationType();` and a `useEffect` on `location.pathname` that calls `window.scrollTo(0, 0)` unless `navigationType === 'REPLACE'`. Skip the first render (a ref holding the last pathname, starting at the current one), so a reload keeps the browser's own position. One comment: why REPLACE is skipped (the paper page's moves are replaces and must not jump).

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/admin/Layout.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/admin/Layout.tsx src/admin/Layout.test.tsx src/test/setup.ts
git commit -m "Open a new teacher page at the top"
```

---

### Task 2: A checked paper opens with its photo hidden

**Files:**
- Modify: `src/admin/pages/PaperPage.tsx` (the `photoFolded` state and `onPhotoFold` in `Paper`)
- Test: `src/admin/pages/PaperCheck.test.tsx`
- Modify (only if they break): tests in `src/admin/pages/PaperPage.test.tsx` that look at the photo of a graded paper with no point to check

**Interfaces:**
- Produces: nothing other tasks use.

- [ ] **Step 1: Write the failing tests** in `src/admin/pages/PaperCheck.test.tsx`, next to 'hides the paper for more room…' (fixtures: Eva Stan, paper 13, has no point; Ana Pop, paper 11, has points):

```tsx
it('opens a paper with nothing left to check with its photo hidden, and keeps the saved choice', async () => {
  renderAdmin(paperAt(13, null, 'toate'), apiWith());
  const toggle = await screen.findByRole('button', { name: 'Lucrarea' });
  expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByRole('button', { name: 'Ascunde lucrarea' })).not.toBeInTheDocument();
  await userEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'Ascunde lucrarea' })).toBeInTheDocument();
  expect(localStorage.getItem('quickeval:paperPhotoFolded')).toBeNull();
});

it('opens a paper with points to check with its photo, as the saved choice says', async () => {
  renderAdmin(paperAt(11, null, 'toate'), apiWith());
  expect(await screen.findByRole('button', { name: 'Ascunde lucrarea' })).toBeInTheDocument();
});

it('keeps the photo when the last point of the paper is decided', async () => {
  renderAdmin(paperAt(14, '41', 'toate'), apiWith(), <LocationProbe />);
  await userEvent.click(await within(decision()).findByRole('button', { name: /^Accept/ }));
  await waitFor(() => expect(document.querySelector('.decision-slot.is-current')).toBeNull());
  expect(screen.getByRole('button', { name: 'Ascunde lucrarea' })).toBeInTheDocument();
});
```

Adjust the "Accept" button name to the one `PointDecision.tsx` renders (its `data-confirm` button).

- [ ] **Step 2: Run them to see the first fail**

Run: `npx vitest run src/admin/pages/PaperCheck.test.tsx`
Expected: the first test FAILS (the photo shows on paper 13); the other two pass.

- [ ] **Step 3: Implement in `Paper` (`src/admin/pages/PaperPage.tsx`)**

`const checkedPaper = place === 'app' && row?.status === 'graded' && row.flagCount === 0;` computed once into the initial state: `useState(() => checkedPaper || savedFold(PHOTO_FOLD_KEY))`, and the same value kept in a ref (`useRef(checkedPaper)`) so `onPhotoFold` skips `saveFold` for this paper. `Paper` is keyed by `submissionId`, so the value never changes while a paper is open. Update the comment above `photoFolded` to say a checked paper opens hidden and its toggles are not saved.

- [ ] **Step 4: Run the paper tests**

Run: `npx vitest run src/admin/pages/PaperCheck.test.tsx src/admin/pages/PaperPage.test.tsx`
Expected: PASS. A `PaperPage.test.tsx` test that now fails because it looks at the photo of a graded paper with `flagCount: 0` gets one line first: `await userEvent.click(await screen.findByRole('button', { name: 'Lucrarea' }))`, with a comment that a checked paper opens with its photo hidden.

- [ ] **Step 5: Commit**

```bash
git add src/admin/pages/PaperPage.tsx src/admin/pages/PaperCheck.test.tsx src/admin/pages/PaperPage.test.tsx
git commit -m "Open a checked paper with its photo hidden"
```

---

### Task 3: The server counts the checked points of each paper

**Files:**
- Create: `migrations/0033_checked_items_index.sql`
- Modify: `server/db/evaluations.ts` (next to `flagCountSql`)
- Modify: `server/db/tests.ts` (`listUploads`, its `UploadSqlRow`)
- Modify: `shared/api.ts` (`UploadRow`)
- Modify: `src/test/fakeApi.ts` (`fakeUpload`, `syncRow`, the row resets, a new `checkedCountOf`)
- Modify: `src/admin/reviewPage/points.ts` (`withoutPoint`)
- Test: `server/routes/tests.test.ts`, `src/admin/reviewPage/points.test.ts`

**Interfaces:**
- Produces: `UploadRow.checkedCount: number` — the points of the paper already checked (items with `needsReview` checked, plus one for checked unreadable pages); 0 with no evaluation. A paper's points to check in all: `flagCount + checkedCount`.
- Produces: `checkedCountSql(ev: string): string` in `server/db/evaluations.ts`.
- Produces: `checkedCountOf(evaluation: EvaluationInfo | null): number` exported from `src/test/fakeApi.ts`.

- [ ] **Step 1: Write the failing server test** in `server/routes/tests.test.ts`, after 'lists the points to check of each paper, as many as its count':

```ts
it('counts the points already checked of each paper, and starts again after a new grading', async () => {
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Stan Eva']);
  const [pop, stan] = cls.studentIds as [number, number];
  const code = await makeTest(api, cls.id);
  const paper = await addSubmission(api, code, pop, { status: 'graded', files: 2 });
  const evaluation = await addEvaluation(api, paper, {
    items: [{ needsReview: true, reviewed: true }, { needsReview: true }, {}, { needsReview: true, reviewed: true }],
    unreadable: ['student/page-02.jpg'],
  });
  await addSubmission(api, code, stan, { status: 'submitted', files: 1 });
  const rowOf = async (name: string) =>
    (await api.request('GET', `/api/admin/tests/${code}`)).body.uploads.find((row: { studentName: string }) => row.studentName === name);
  expect(await rowOf('Pop Ion')).toMatchObject({ flagCount: 2, checkedCount: 2 });
  expect(await rowOf('Stan Eva')).toMatchObject({ flagCount: 0, checkedCount: 0 });
  await api.db.prepare("UPDATE evaluations SET pages_reviewed_at = '2026-10-08T10:00:00.000Z' WHERE id = ?").bind(evaluation).run();
  expect(await rowOf('Pop Ion')).toMatchObject({ flagCount: 1, checkedCount: 3 });
  // A new grading is a new evaluation: nothing of it is checked yet.
  await api.db.prepare('DELETE FROM evaluations WHERE id = ?').bind(evaluation).run();
  await addEvaluation(api, paper, { items: [{ needsReview: true }] });
  expect(await rowOf('Pop Ion')).toMatchObject({ flagCount: 1, checkedCount: 0 });
});
```

If deleting the evaluation row is refused by a foreign key in the test database, delete its `evaluation_items` first in the same way.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run server/routes/tests.test.ts -t "counts the points already checked"`
Expected: FAIL (`checkedCount` is undefined).

- [ ] **Step 3: Add the migration** `migrations/0033_checked_items_index.sql`, one statement, with a comment in the style of 0031:

```sql
-- The items the teacher already checked, by grading. The test page counts them
-- for every graded paper (the progress of Verificare); D1 bills every row read,
-- and without it each count reads all items of a paper.
CREATE INDEX evaluation_items_checked ON evaluation_items (evaluation_id) WHERE needs_review = 1 AND reviewed_at IS NOT NULL;
```

- [ ] **Step 4: Implement**

- `checkedCountSql(ev)` in `server/db/evaluations.ts`, shaped like `flagCountSql`: the count of `evaluation_items` with `needs_review = 1 AND reviewed_at IS NOT NULL` for `${ev}.id`, plus `CASE WHEN json_array_length(${ev}.unreadable_json) > 0 AND ${ev}.pages_reviewed_at IS NOT NULL THEN 1 ELSE 0 END`. The `WHERE` must match the index's condition word for word, so SQLite uses it.
- `listUploads` (`server/db/tests.ts`): select `${checkedCountSql('ev')} AS checked_count`, add `checked_count: number` to `UploadSqlRow`, map it to `checkedCount`.
- `shared/api.ts`: `checkedCount: number` in `UploadRow`, after `flagCount`, with the comment "Points of this paper the teacher already checked (items, plus one for the pages); with flagCount, all its points to check."

- [ ] **Step 5: Run the server tests**

Run: `npx vitest run server/routes/tests.test.ts server/db/testsCost.test.ts`
Expected: PASS. Tests that compare a whole upload row with `toEqual` (around lines 222 and 246 of `server/routes/tests.test.ts`) get `checkedCount: 0`.

- [ ] **Step 6: Keep the fake API and the cached test in step** (typecheck finds every place)

- `src/test/fakeApi.ts`: `checkedCountOf(evaluation)` — the items with `needsReview && reviewed`, plus one when `unreadable.length > 0 && pagesReviewed`; 0 for null. `fakeUpload` defaults `checkedCount: 0`; `syncRow` sets `checkedCount: checkedCountOf(submission.evaluation)`; every reset that writes `flagCount: 0` also writes `checkedCount: 0`.
- `withoutPoint` (`src/admin/reviewPage/points.ts`): the saved paper's row gets `checkedCount: row.checkedCount + 1` when the point was still in `row.reviewPoints`, else unchanged.

- [ ] **Step 7: Write the failing `withoutPoint` test** in `src/admin/reviewPage/points.test.ts`: a row with `flagCount: 2, checkedCount: 1` and two points; after `withoutPoint` with one of them, `checkedCount` is 2 and `reviewPoints` has one point; a second call with the same point leaves `checkedCount` at 2. Run `npx vitest run src/admin/reviewPage/points.test.ts`, see it fail if Step 6 is not done yet, then pass.

- [ ] **Step 8: Typecheck and run the web and server suites**

Run: `npm run typecheck && npm run test:web && npm run test:server`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add migrations/0033_checked_items_index.sql server/db/evaluations.ts server/db/tests.ts shared/api.ts src/test/fakeApi.ts src/admin/reviewPage/points.ts src/admin/reviewPage/points.test.ts server/routes/tests.test.ts
git commit -m "Count the checked points of each paper"
```

---

### Task 4: The Verificare panel as an overview

**Files:**
- Create: `src/admin/testPage/ReviewOverview.tsx`
- Delete: `src/admin/testPage/ReviewList.tsx`
- Modify: `src/admin/testPage/StagePanel.tsx` (`ReviewPanel`)
- Modify: `src/ui/brand.css` (tokens in `:root` and both dark blocks, the button comment, `.button-wait`, the overview's styles; remove `.review-list` rules no other page uses)
- Modify: `src/AGENTS.md`
- Test: `src/admin/pages/TestPage.test.tsx` (the `describe` that holds 'lists each point with its reason…')

**Interfaces:**
- Consumes: `UploadRow.checkedCount` (Task 3); `reviewPath`, `pointKey` from `src/admin/reviewPage/points.ts`; `paperPath` from `src/admin/paperPage/paths.ts`; `stageHash` from `src/admin/stages.ts`.
- Produces: `export function ReviewOverview({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }): JSX.Element`.

The panel, from the spec §3 (copy is exact):

- Students counted: upload rows with `status === 'graded'`, a `submissionId`, and `flagCount + checkedCount > 0`, in the uploads' order (by name). `total` = sum of `flagCount + checkedCount`, `checked` = sum of `checkedCount`, `left` = total − checked, `waiting` = the students with `flagCount > 0`.
- `total === 0`: `<p>Nimic de verificat.</p>` and a `.button` link "Mergi la Rezultate" to `/teste/<code>#rezultate` (`stageHash('Rezultate')`). No groups.
- `left > 0`: a progress row `.review-progress`: "<checked> din <total> verificate" (the number in a larger figure), a bar (`role="progressbar"`, `aria-valuemin=0`, `aria-valuemax=<total>`, `aria-valuenow=<checked>`, `aria-label="Puncte verificate"`), the line "Mai sunt <countLabel(left, 'punct', 'puncte')>, la <countLabel(waiting.length, 'elev', 'elevi')>" (`countLabel` from `src/ui/format.ts`: "1 punct", "3 puncte", "20 de puncte"), and a `.button-wait` link: "Începe verificarea" when `checked === 0`, else "Continuă verificarea", no arrow, `href = reviewPath(code)`.
- `left === 0`: a green box `.review-done-box` with "Toate cele <countLabel(total, 'punct', 'puncte')> sunt verificate." ("Toate cele 3 puncte…", "Toate cele 59 de puncte…"; for `total === 1`: "Punctul de verificat este verificat.") and a `.button` link "Mergi la Rezultate".
- "De verificat" group (only when `waiting` is not empty): a heading `h3` "De verificat" with the hint "<countLabel(n, 'elev', 'elevi')> · clic pe un nume", then a list (`aria-labelledby` the heading) of labels `.review-chip.is-wait`: "<name> <checked>/<total of the paper>"; each is a link to `reviewPath(code, { submissionId, key: pointKey(row.reviewPoints[0]) })`, with `aria-label` "<name>: <checked> din <total> verificate".
- "Gata" group (only when some counted student has `flagCount === 0`): `h3` "Gata" with "<countLabel(n, 'elev', 'elevi')>", labels `.review-chip.is-done` "✓ <name>" linking to `paperPath(code, 'app', { submissionId, key: null }, 'toate')`. The ✓ is `aria-hidden`.
- The CES mark (`CesTag`) after the name, as in other student lists.

`ReviewPanel` keeps its draft and "nothing graded" hint (`Punctele nesigure apar după ce se corectează lucrările.`), shows `ReviewOverview` otherwise, and no longer renders `Papers`.

- [ ] **Step 1: Replace the panel's tests** in `src/admin/pages/TestPage.test.tsx`. Remove 'lists each point with its reason…' and 'says when every point is checked…'; keep 'waits for the grading before it lists anything' (its `Puncte de verificat` query becomes `De verificat`). Add, with `fakeUpload` rows (`flagCount`, `checkedCount`, `reviewPoints`):

```tsx
it('starts the check: the progress, the orange button, and a label per student left', async () => {
  // Pop Ion 0/1 (point 31), Marin Dan 0/2 (pages + 41), Stan Eva graded with no point.
  renderAdmin(`${PAGE}#verificare`, reviewApi(rows));
  const panel = await screen.findByRole('region', { name: 'Verificare' });
  expect(within(panel).getByText('din 3 verificate', { exact: false })).toBeInTheDocument();
  expect(within(panel).getByRole('progressbar', { name: 'Puncte verificate' })).toHaveAttribute('aria-valuenow', '0');
  const start = within(panel).getByRole('link', { name: 'Începe verificarea' });
  expect(start).toHaveAttribute('href', '/teste/6E2-26T1/verificare');
  expect(start).toHaveClass('button-wait');
  const left = within(within(panel).getByRole('list', { name: 'De verificat' })).getAllByRole('link');
  expect(left.map((link) => link.getAttribute('href'))).toEqual([
    '/teste/6E2-26T1/verificare?lucrare=7&punct=pagini',
    '/teste/6E2-26T1/verificare?lucrare=5&punct=31',
  ]);
  expect(within(panel).queryByText('Stan Eva')).not.toBeInTheDocument();
  expect(within(panel).queryByRole('rowheader', { name: 'Stan Eva' })).not.toBeInTheDocument();
  expect(within(panel).queryByRole('heading', { name: 'Gata' })).not.toBeInTheDocument();
});

it('continues the check, with the students done under Gata', async () => {
  // Pop Ion 1/1 (checkedCount 1, flagCount 0), Marin Dan 1/2.
  // Expect "Continuă verificarea", aria-valuenow 2 of 3, "Mai sunt 1 punct, la 1 elev",
  // the Gata link of Pop Ion to '/teste/6E2-26T1/elevi/5'.
});

it('says when every point is checked and leads to Rezultate', async () => {
  // Every counted row with flagCount 0: "Toate cele 3 puncte sunt verificate.", the link
  // "Mergi la Rezultate" to '/teste/6E2-26T1#rezultate', no orange button, both students under Gata.
});

it('says there is nothing to check when no paper had a point', async () => {
  // Graded rows with flagCount 0 and checkedCount 0: "Nimic de verificat.", "Mergi la Rezultate",
  // no list, no progress bar.
});
```

Fill the three short tests in the same style as the first; the count texts come from `countLabel` ("1 punct", "1 elev").

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/admin/pages/TestPage.test.tsx -t "check"`
Expected: the four new tests FAIL; 'waits for the grading…' passes.

- [ ] **Step 3: Add the orange button style** in `src/ui/brand.css`

New token `--orange-hover`: `#9c3c08` in `:root`; in both dark blocks `#ffb37f`. `.button-wait` next to `.button`: border and background `var(--orange)`, text `var(--on-ink)` (white in light, dark ink in dark), hover `var(--orange-hover)`. Extend the comment above the buttons: "orange (`.button-wait`) for the one main action of a screen whose work waits on the teacher".

- [ ] **Step 4: Implement `ReviewOverview.tsx` and wire it into `ReviewPanel`; delete `ReviewList.tsx`**

Styles in `brand.css` near the old `.review-list` rules (remove those if `grep -rn "review-list" src` shows no other user): `.review-progress` (one flex row that wraps: the figure, a growing column with the bar and the line, the button), the bar (8px, `--marker` track, `--ink` fill, radius 4px), `.review-done-box` (`--ok-bg`/`--ok-fg`, 10px radius, flex row with the button at the end), `.review-chips` (flex wrap, 8px gap), `.review-chip` (rounded pill, 1px border, 14px text, padding `4px 6px 4px 12px`; `.is-wait` with the orange tint border and the count in a `.tag tag-wait` pill; `.is-done` grey `--raised` with `--muted` text). Below 40rem the progress row stacks and the button is full width.

- [ ] **Step 5: Run the test page tests**

Run: `npx vitest run src/admin/pages/TestPage.test.tsx src/ui/brand.test.ts`
Expected: PASS.

- [ ] **Step 6: Update `src/AGENTS.md`**

- `testPage/` sentence: the papers table is in "În clasă and Corectare" (not Verificare); replace the `ReviewList.tsx` clause with `ReviewOverview.tsx`: the Verificare overview (the progress of `checkedCount`, "Începe/Continuă verificarea" as `.button-wait`, "De verificat" and "Gata" labels, "Nimic de verificat.", the green box with "Mergi la Rezultate").
- The `ui/` sentence about buttons: add the orange `.button-wait`.
- The shell sentence: a new page (not a replaced address) opens at the top.
- The paper page sentence about `quickeval:paperPhotoFolded`: a graded paper with nothing left to check opens with its photo hidden, and its toggles are not saved.

- [ ] **Step 7: Look at it in the browser**

Start `npm run db:local` then the `api` and `web` preview servers (`.claude/launch.json`), open a done test with points at `/teacher/teste/<code>#verificare` in both themes and at 375px width; check the progress row, the labels and the button. Note: preview servers start from the main checkout; for this worktree run `npm run dev:api` and `npm run dev:web` with `run_in_terminal` (cwd = worktree) instead.

- [ ] **Step 8: Commit**

```bash
git add src/admin/testPage/ReviewOverview.tsx src/admin/testPage/ReviewList.tsx src/admin/testPage/StagePanel.tsx src/ui/brand.css src/AGENTS.md src/admin/pages/TestPage.test.tsx
git commit -m "Show the Verificare stage as an overview of the check"
```

---

### Task 5: Whole suite

- [ ] **Step 1:** Run `npm run typecheck` then `npm test` (alone, in the foreground). Expected: all pass.
- [ ] **Step 2:** Tell the user that `migrations/0033_checked_items_index.sql` must run on the live D1 (`npx wrangler d1 migrations apply quickeval --remote`, from this worktree) before the branch reaches `main`.

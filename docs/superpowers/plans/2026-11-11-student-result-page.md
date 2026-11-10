# The Student's Result Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give both student pages the site's header (lockup, "Despre", theme button), and give the result page a 64rem two-column layout, a footer link, "Trimite linkul", "Descarcă PDF" and a clean print.

**Architecture:** One shared header component for `ResultApp` and `UploadApp`. `StudentResult` gets the new order (grade card, two columns, files last), so the Quick Try page gets it too. A small `ResultActions` component in the result page shares the link (Web Share, else clipboard) and makes the student PDF with the teacher's existing pdfmake code, fed by a new mapper from `StudentResultView`. The server adds the upload's date to `StudentResultView` from the row it already reads.

**Tech Stack:** React 19, TypeScript (strict, `erasableSyntaxOnly`), Vitest + Testing Library, plain CSS in `src/ui/brand.css`, pdfmake (lazy), Hono + D1 on the server.

**Spec:** `docs/superpowers/specs/2026-11-11-student-result-page-design.md`

## Global Constraints

- All user-facing text is Romanian. Exact labels: "Despre", "mqgrader.ro", "Trimite linkul", "Descarcă PDF", "Linkul a fost copiat.", "by Laura Miron".
- Links are absolute: `https://mqgrader.ro/` (mark and name, footer) and `https://mqgrader.ro/despre/` ("Despre"). Same tab (no `target`).
- `expectNoGradingWords()` passes on every student screen.
- The student PDF is made only from `StudentPdfInput` (no confidence, no review reason). pdfmake stays a lazy import (`renderPdf.ts`).
- A new dark colour goes in both dark blocks of `src/ui/brand.css` (`brand.test.ts`). Flat styles: no gradients, shadow only on what floats.
- Relative imports name the `.ts`/`.tsx` file. No enums, namespaces or parameter properties.
- Code comments carry no ticket or issue numbers. Commits carry no AI attribution.
- Run `npm run typecheck` and the task's tests after each task; run `npm test` once at the end.

## Review Focus

1. Web Share present but the user closes the sheet (`AbortError`): nothing else happens, no copy message, no error.
2. Neither Web Share nor `navigator.clipboard` works (old browser, insecure context): the page shows the link text so the student can copy it by hand, no crash.
3. "Descarcă PDF" tapped twice fast: one PDF; the button is disabled while it works, and a failure shows a Romanian message instead of an unhandled rejection.
4. A result that is open but not graded (`evaluation: null`): "Trimite linkul" shows, "Descarcă PDF" does not, and the layout has no empty right column.
5. The dark theme on the result page: the grade card, the cards and the footer use theme tokens, so nothing stays white in dark mode.

Each line has its test in the owning task (Tasks 4 and 2).

---

### Task 1: The student header on both student pages

**Files:**
- Create: `src/upload/StudentHeader.tsx`, `src/upload/StudentHeader.test.tsx`
- Modify: `src/upload/ResultApp.tsx` (header at lines 42-51), `src/upload/UploadApp.tsx` (header at lines 153-162), `src/ui/brand.css` (the `.site-header` block near line 220), `src/upload/ResultApp.test.tsx` (test "shows only the MQGrader brand…"), `src/upload/UploadApp.test.tsx` (lines 28-36), `AGENTS.md` (the "No page tells students…" rule), `src/AGENTS.md` (the `upload/` line)

**Interfaces:**
- Consumes: `BrandMark` (`src/ui/BrandMark.tsx`), `ThemeButton` (`src/ui/ThemeButton.tsx`).
- Produces: `export const SITE_URL = 'https://mqgrader.ro/'`, `export const ABOUT_URL = 'https://mqgrader.ro/despre/'`, `export function StudentHeader(): JSX.Element` in `src/upload/StudentHeader.tsx`.

- [ ] **Step 1: Write the failing tests** in `src/upload/StudentHeader.test.tsx`:

```tsx
it('links the mark and name to the site, with the lockup', () => {
  render(<StudentHeader />);
  const home = screen.getByRole('link', { name: 'MQGrader by Laura Miron' });
  expect(home).toHaveAttribute('href', 'https://mqgrader.ro/');
  expect(home).not.toHaveAttribute('target');
  expect(within(home).getByText('by Laura Miron')).toHaveClass('brand-by');
});

it('has the Despre link and the theme button, and no other link', () => {
  render(<StudentHeader />);
  expect(screen.getByRole('link', { name: 'Despre' })).toHaveAttribute('href', 'https://mqgrader.ro/despre/');
  expect(screen.getAllByRole('link')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Temă întunecată' })).toBeInTheDocument();
  expectNoGradingWords();
});

it('switches the theme', async () => {
  render(<StudentHeader />);
  await userEvent.click(screen.getByRole('button', { name: 'Temă întunecată' }));
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  expect(screen.getByRole('button', { name: 'Temă luminoasă' })).toBeInTheDocument();
});
```

Clear `localStorage` and remove `data-theme` from `document.documentElement` in `afterEach`. If `saveTheme` does not set `data-theme`, assert on what `src/ui/ThemeButton.test.tsx` (or `theme.test.ts`) already asserts for a toggle instead.

- [ ] **Step 2: Run them, expect FAIL** (module not found): `npx vitest run src/upload/StudentHeader.test.tsx`

- [ ] **Step 3: Implement `StudentHeader`.** Markup: `<header className="site-header"><div className="wrap header-bar student-bar">` holding `<a className="brand" href={SITE_URL} aria-label="MQGrader by Laura Miron">` with `<BrandMark />` and `<span className="brand-text"><span className="brand-name">MQGrader</span><span className="brand-by">by Laura Miron</span></span>`, then `<nav aria-label="Site" className="student-nav"><a href={ABOUT_URL}>Despre</a><ThemeButton /></nav>`.

- [ ] **Step 4: CSS in `src/ui/brand.css`**, after `.theme-icon`: `.student-bar { justify-content: space-between; gap: 1rem; }`, `.student-nav { display: flex; align-items: center; gap: 1.25rem; font-size: 0.9375rem; }`, `.student-nav a { color: var(--muted); font-weight: 500; text-decoration: none; }` with `:hover { color: var(--text); }`, and under `@media (max-width: 56.25rem)` hide `.student-bar .brand-by` (the site hides it at 900px; "Despre" stays visible on a phone, unlike the site). Update the comment "The student pages' header: the mark and the name, nothing else." to describe the new header.

- [ ] **Step 5: Use it** in `ResultApp.tsx` and `UploadApp.tsx` in place of their `<header>` blocks; drop their `BrandMark` imports.

- [ ] **Step 6: Update the old tests.** In `ResultApp.test.tsx` the first test and in `UploadApp.test.tsx` lines 28-36 assert the old rule (`/^MQGrader$/`, no "Laura Miron", no link). Replace those lines with: the banner contains "MQGrader" and "by Laura Miron"; the banner's links are exactly `https://mqgrader.ro/` and `https://mqgrader.ro/despre/`; no "Profesorul tău folosește|Încearcă gratuit|Ești profesor" text; `expectNoGradingWords()`. Keep the `contentinfo` check in `UploadApp.test.tsx` (the upload page has no footer); remove it from `ResultApp.test.tsx` (Task 2 adds the footer).

- [ ] **Step 7: Update the rule** in `AGENTS.md`: replace the sentence "Student pages show only the MQGrader mark and name in their header: no other brand text, no invitation to teachers, no link, and no word that says how the work is graded." with spec §4's text. In `src/AGENTS.md`, add to the `upload/` line: "`StudentHeader.tsx` is the header of both student pages (the site's lockup linking to mqgrader.ro, "Despre", the theme button)."

- [ ] **Step 8: Run** `npx vitest run src/upload` and `npm run typecheck`. Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/upload/StudentHeader.tsx src/upload/StudentHeader.test.tsx src/upload/ResultApp.tsx src/upload/UploadApp.tsx src/upload/ResultApp.test.tsx src/upload/UploadApp.test.tsx src/ui/brand.css AGENTS.md src/AGENTS.md
git commit -m "Give the student pages the site's header, with Despre and the theme button"
```

### Task 2: The result layout, the width and the footer

**Files:**
- Modify: `src/upload/StudentResult.tsx` (the return at lines 14-100), `src/upload/ResultApp.tsx`, `src/ui/brand.css` (`.upload-page.result-page` at line 4249, and new rules), `src/upload/StudentResult.test.tsx`, `src/upload/ResultApp.test.tsx`, `src/try/Graded.test.tsx` only if its order checks break

**Interfaces:**
- Consumes: `SITE_URL` from Task 1.
- Produces: class names `result-grade`, `result-columns`, `result-main`, `result-side`, `result-foot` (Task 5's print CSS uses them).

- [ ] **Step 1: Write the failing tests.** In `StudentResult.test.tsx`:

```tsx
it('puts the grade first, then the exercises, the final words, and the files last', () => {
  const { container } = render(<StudentResult result={graded} fileUrl={() => '#'} />);
  const order = [...container.querySelectorAll('.result-grade, table.items, [aria-label="Rezumat"], .files-head')].map((el) => el.className || el.getAttribute('aria-label'));
  expect(order).toEqual(['result-grade', 'items', 'Rezumat', 'files-head']);
  expect(container.querySelector('.result-side')).toContainElement(screen.getByRole('region', { name: 'Rezumat' }));
});

it('has no side column when the result is not graded', () => {
  const { container } = render(<StudentResult result={{ ...graded, status: 'sent', evaluation: null }} fileUrl={() => '#'} />);
  expect(container.querySelector('.result-side')).toBeNull();
  expect(container.querySelector('.result-grade')).toBeNull();
});
```

Use the file's own graded fixture (or the one in `ResultApp.test.tsx`) as `graded`. In `ResultApp.test.tsx`:

```tsx
it('has a footer with only the mqgrader.ro link', async () => {
  // render graded, wait for the heading 'Pop Ion'
  const foot = screen.getByRole('contentinfo');
  expect(within(foot).getAllByRole('link')).toHaveLength(1);
  expect(within(foot).getByRole('link', { name: 'mqgrader.ro' })).toHaveAttribute('href', 'https://mqgrader.ro/');
  expect(foot).toHaveTextContent(/^mqgrader\.ro$/);
});
```

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run src/upload/StudentResult.test.tsx src/upload/ResultApp.test.tsx`

- [ ] **Step 3: Reorder `StudentResult`.** Keep the `h1` and the hint line. When graded: a `<div className="result-grade">` holding the grade (large) and the "N puncte din M" + office line (same text as today's `grade-line`, so existing text assertions keep working; keep the `h2` "Rezultatul tău" as its heading, visually hidden if it looks heavy), then `<div className="result-columns">` with `<div className="result-main">` (the `.table-wrap` table) and `<div className="result-side">` (the three sections, each in a card). Then the files head and files, last. When not graded, the files and today's "not ready" text, with no columns.

- [ ] **Step 4: Footer.** In `ResultApp.tsx` after `</main>`: `<footer className="result-foot"><div className="wrap result-foot-bar"><a href={SITE_URL}>mqgrader.ro</a></div></footer>`.

- [ ] **Step 5: CSS.** `.upload-page.result-page { max-width: 64rem; }` (update the comment above it). `.result-grade`: a card (`var(--sheet)` ground, `1px solid var(--rule)`, `var(--radius)`), flex, the grade number about 2.5rem bold. `.result-columns { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 1rem; align-items: start; }`; `.result-side > section` a card like `.result-grade`. Under `@media (max-width: 48rem)` (the breakpoint where the table becomes cards) `.result-columns { grid-template-columns: minmax(0, 1fr); }`. `.result-foot { border-top: 1px solid var(--rule); }` with muted text, padding 1rem. Use only existing tokens, so no dark block changes are needed; if a new colour is needed, add it to both dark blocks.

- [ ] **Step 6: Run** `npx vitest run src/upload src/try` and `npm run typecheck`. Fix any `Graded.test.tsx` assertion that depended on the old order, keeping its meaning. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/upload/StudentResult.tsx src/upload/StudentResult.test.tsx src/upload/ResultApp.tsx src/upload/ResultApp.test.tsx src/ui/brand.css
git commit -m "Lay out the student's result in two columns, 64rem wide, with a footer link"
```

(Add `src/try/Graded.test.tsx` to the commit if Step 6 changed it.)

### Task 3: The upload's date on the student result

**Files:**
- Modify: `shared/api.ts` (`StudentResultView`, line 1050), `server/db/results.ts` (`ResultRow`, `RESULT_SELECT`, both result builders), the server test of `findResultByToken` (find it with `grep -rln findResultByToken server`), and every fixture that builds a `StudentResultView` (typecheck lists them: `src/test/fakeUploadApi.ts`, `src/test/fakeTryApi.tsx`, `src/upload/*.test.tsx`, `src/try/Graded.test.tsx`, `src/upload/api.test.ts`)

**Interfaces:**
- Produces: `StudentResultView.submittedAt: string | null` (ISO 8601 UTC, the upload's `submissions.submitted_at`; null when the paper was never sent).

- [ ] **Step 1: Write the failing server test:** an open, graded result returns `submittedAt` equal to the row's `submitted_at`; a closed result returns it too (it is not grading data). Use the existing test's setup in that file.

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run <that server test file>`

- [ ] **Step 3: Implement.** Add `submittedAt: string | null` (with a one-line comment) to `StudentResultView`; add `s.submitted_at` to `RESULT_SELECT` and `submitted_at: string | null` to `ResultRow`; set `submittedAt: row.submitted_at` in both builders. No new query.

- [ ] **Step 4: Fix fixtures** until `npm run typecheck` passes (`submittedAt: '2026-11-03T08:15:00.000Z'` in graded fixtures, `null` where the paper was not sent).

- [ ] **Step 5: Run** `npm run test:server` and `npx vitest run src/upload src/try`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/api.ts server/db/results.ts <server test file> <fixture files>
git commit -m "Send the upload's date with the student's result"
```

### Task 4: "Trimite linkul" and "Descarcă PDF"

**Files:**
- Create: `src/upload/ResultActions.tsx`, `src/upload/ResultActions.test.tsx`
- Modify: `src/admin/pdf/studentPdf.ts` (add a mapper), `src/admin/pdf/pdf.test.ts` (or the file that tests `studentPdfInput`), `src/upload/ResultApp.tsx`, `src/ui/brand.css`, `src/AGENTS.md` (the `upload/` line)

**Interfaces:**
- Consumes: `StudentResultView.submittedAt` (Task 3); `studentPdf`, `studentPdfFileName` (`studentPdf.ts`), `renderPdf` (`renderPdf.ts`), `saveFile` (`share.ts`).
- Produces: `export function studentPdfInputFromResult(view: StudentResultView): StudentPdfInput | null` in `studentPdf.ts`; `export function ResultActions({ result, url }: { result: StudentResultView; url: string }): JSX.Element` in `src/upload/ResultActions.tsx`.

- [ ] **Step 1: Write the failing mapper tests** next to the existing `studentPdfInput` tests:

```ts
it('maps a student result view to the PDF input, every item settled', () => {
  const input = studentPdfInputFromResult(gradedView);
  expect(input).toMatchObject({ testCode: '6E2-26T1', studentName: 'Pop Ion', date: '2026-11-03T08:15:00.000Z', grade: 6.5, total: 6.5, maxTotal: 10, officePoints: 1 });
  expect(input!.items.every((item) => item.pending === false)).toBe(true);
  expect(Object.keys(input!.items[0]).sort()).toEqual(['comment', 'exerciseId', 'label', 'maxPoints', 'pending', 'points', 'studentAnswer']);
});

it('gives no PDF input for a result that is not graded', () => {
  expect(studentPdfInputFromResult({ ...gradedView, evaluation: null })).toBeNull();
});
```

- [ ] **Step 2: Write the failing `ResultActions` tests** (mock `../admin/pdf/renderPdf.ts` with `vi.mock` returning a `Blob`, and `../admin/pdf/share.ts`'s `saveFile`):

```tsx
it('shares the link through the share sheet', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { share });
  render(<ResultActions result={graded} url="https://mqgrader.ro/u/rezultat/abc" />);
  await userEvent.click(screen.getByRole('button', { name: 'Trimite linkul' }));
  expect(share).toHaveBeenCalledWith({ url: 'https://mqgrader.ro/u/rezultat/abc', title: 'Pop Ion · Fracții' });
});

it('does nothing more when the share sheet is closed', async () => {
  Object.assign(navigator, { share: vi.fn().mockRejectedValue(new DOMException('x', 'AbortError')) });
  // click; expect no status text, no alert
});

it('copies the link when sharing is not possible', async () => {
  // navigator.share undefined, navigator.clipboard.writeText mocked resolved
  // click; expect writeText called with the url; expect screen.getByRole('status') to have text 'Linkul a fost copiat.'
});

it('shows the link to copy by hand when copying fails too', async () => {
  // no share, writeText rejects; click; expect the url shown as text on the page
});

it('downloads the student PDF once, with the button disabled meanwhile', async () => {
  // click 'Descarcă PDF' twice quickly; expect renderPdf called once; expect saveFile called with (blob, '6E2-26T1-Pop-Ion.pdf')
});

it('says so when the PDF cannot be made', async () => {
  // renderPdf rejects; expect role alert with 'Nu am putut face PDF-ul. Încearcă din nou.'
});

it('has no PDF button before the result is graded', () => {
  render(<ResultActions result={{ ...graded, evaluation: null }} url="https://x/" />);
  expect(screen.getByRole('button', { name: 'Trimite linkul' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Descarcă PDF' })).toBeNull();
  expectNoGradingWords();
});
```

Restore `navigator.share` / `navigator.clipboard` in `afterEach`.

- [ ] **Step 3: Run, expect FAIL:** `npx vitest run src/upload/ResultActions.test.tsx src/admin/pdf`

- [ ] **Step 4: Implement the mapper** in `studentPdf.ts`, beside `studentPdfInput`: null when `view.evaluation` is null; `date: view.submittedAt`; every item `pending: false`. Copy only the `StudentPdfInput` fields.

- [ ] **Step 5: Implement `ResultActions`.** "Trimite linkul": if `navigator.share` is a function, `await navigator.share({ url, title: \`${studentName} · ${testTitle}\` })`; on `AbortError` stop; on another error, or with no `share`, try `navigator.clipboard.writeText(url)` and show "Linkul a fost copiat." in a `role="status"` line; if that fails, show the URL as wrapping text (the `.result-link-url` style of `UploadApp`) with "Copiază linkul de aici:". "Descarcă PDF": only when `studentPdfInputFromResult(result)` is not null; disabled while working; `saveFile(await renderPdf(studentPdf(input)), studentPdfFileName(input))`; on error a `role="alert"` with "Nu am putut face PDF-ul. Încearcă din nou.". Both are `button-quiet button-small` in a `.result-actions` flex row (wrap, gap 0.5rem).

- [ ] **Step 6: Place it** in `ResultApp.tsx` in the ready phase, above `<StudentResult …>`, with `url={window.location.href}`. CSS: `.result-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-block: 0.75rem; }`.

- [ ] **Step 7: Add to `src/AGENTS.md`'s `upload/` line:** "`ResultActions.tsx`: "Trimite linkul" (share sheet, else copy, else the link as text) and "Descarcă PDF" (the teacher's student PDF, from `studentPdfInputFromResult`)."

- [ ] **Step 8: Run** `npx vitest run src/upload src/admin/pdf` and `npm run typecheck`. Expected: PASS. Run `npm run build` and check in its output that pdfmake is still in its own chunk, not in the `u/` entry chunk.

- [ ] **Step 9: Commit**

```bash
git add src/upload/ResultActions.tsx src/upload/ResultActions.test.tsx src/admin/pdf/studentPdf.ts <pdf test file> src/upload/ResultApp.tsx src/ui/brand.css src/AGENTS.md
git commit -m "Let students share their result link and download their result as a PDF"
```

### Task 5: Print, and the check in the browser

**Files:**
- Modify: `src/ui/brand.css`

- [ ] **Step 1: Add `@media print`** at the end of the student rules: hide `.site-header .student-nav`, `.result-actions`, `.files-head`, `.page-files`, `.result-foot`; `.site-header { position: static; }`; `.result-columns { grid-template-columns: minmax(0, 1fr); }`; force light colours for the result page by setting the light token values on `:root` inside the print block (copy them from the light `:root` block, only the tokens the page uses: `--paper`, `--sheet`, `--text`, `--muted`, `--rule`), so a dark theme prints light.

- [ ] **Step 2: Run** `npx vitest run src/ui/brand.test.ts`. Expected: PASS (the dark blocks are unchanged).

- [ ] **Step 3: Check in the browser.** `npm run db:local`, then the `api` and `web` preview servers. Make a graded, published result locally (the smoke test leaves one class; or use the teacher app at http://localhost:5173/teacher/ with the local teacher) and open its `/u/rezultat/<token>`. Check with `javascript_tool`: at 1280px width the `main` is 64rem wide or less and `.result-columns` has two tracks; at 375px it has one track, `document.documentElement.scrollWidth <= innerWidth`, "by Laura Miron" is hidden and "Despre" shows; after the theme button, `data-theme="dark"` and the cards' background is not white; "Descarcă PDF" downloads a PDF. Open `/u/<upload token>` and check the header there. Take a screenshot of each.

- [ ] **Step 4: Run the whole suite** `npm test` and `npm run build`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/brand.css
git commit -m "Print the student's result in one light column, without the buttons and files"
```

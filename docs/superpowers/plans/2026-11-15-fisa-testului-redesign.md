# MQGrader: Fișa testului, the test's "Acțiuni" and printing from Tipărire — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the test page, the actions that work in every stage (rename, subject, archive, delete) move into an "Acțiuni" menu at the top right, each with what it does; Fișa testului becomes a short card (the state, two numbers in grey boxes, the plain facts, no bold, no files, no link, no buttons); the students' link moves to În clasă; and Tipărire prints the test with the QR code straight from the page ("Tipărește"), with "Descarcă PDF" beside it.

**Architecture:** Front end only: no API, database or robot change, no migration; one line of the pages' security policy (`public/_headers`) changes in Task 3. Task 1 moves the paper page's "Alte acțiuni" menu into a shared `ActionsMenu.tsx` and builds `TestMenu.tsx` on it (the class page's `RenameDialog`, `SubjectForm` in a `Modal`, `ArchiveDialog`, `window.confirm` for a delete), placed in the head of `TestPage.tsx`; `TestSheet.tsx` loses its buttons. Task 2 rewrites `TestSheet.tsx` (a `Tile` per number, chosen by the test's state, from the test and its uploads) and puts the students' link at the top of the În clasă panel (`ClassPanel` in `StagePanel.tsx`). Task 3 rewrites `PrintTest.tsx` as a card per variant and adds `printPdf.ts`, which loads the PDF (served `inline`, same origin) in a hidden frame and calls its `print()`, or opens it in a new tab where a frame cannot print; the pages' security policy gets `frame-src 'self'`, which the frame needs.

**Tech Stack:** Node 24, TypeScript, React 19, React Router, TanStack Query, Vitest, Testing Library. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-15-fisa-testului-redesign-design.md` (approved by the user on 2026-11-15; Tasks 2 and 3 adjust its §4 and §3 to what was built, see the rulings). Root `AGENTS.md` and `src/AGENTS.md` hold the project rules. The mockups the user chose from are in `.superpowers/mock/fisa/`, git-ignored, on the user's PC only.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English. Teacher pages may say "CES"; no student page, student PDF or CSV does.
- The brand is flat: `src/ui/brand.css` has no `gradient(` (`src/ui/brand.test.ts` checks it); dark colours are written twice. This plan adds no colour token. Only one filled blue `.button` per panel: "Tipărește" of the class test in Tipărire.
- Do not run Prettier or any formatter.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A`.
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root, on the branch that holds this plan. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy. If only tests of those three files time out, or of `server/routes/evaluation.test.ts`, `server/routes/runner.test.ts` and `runner/tasks.test.ts` (an `ECONNRESET` or an `internal` answer from the local worker on a busy PC), run the failed files alone with `npx vitest run <files>`; the full run then counts as passed when its failed and passed tests add up to the expected passed number.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; write exactly the content given in place of all of it.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact for the branch alone. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/protofs/fs1`, `refs/protofs/fs2` and `refs/protofs/fs3`, one per task, on `refs/protofs/fsbase` (the files of `a30b664`, the commit that adds the spec). After Task N, `git diff --stat refs/protofs/fsN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`).

## Rulings made while planning

Settled while building the prototype and looking at it on 2026-11-15 with sample data (1366 px, a 390 px phone, light and dark, and Chromium for the print frame). The spec left them to the builder; the user checks them when reading.

1. **One menu component.** The paper page's `PaperActionsMenu` moves out of `PaperHead.tsx` into `src/admin/ActionsMenu.tsx` (`ActionsMenu({ label, menuId, actions })`, items of type `MenuAction`), used by "Alte acțiuni" and "Acțiuni"; an item's description has the id `${menuId}-hint-${index}`. The CSS classes stay `.paper-actions*`.
2. **The items of "Acțiuni", in order:** "Redenumește testul"; "Alege materia" (no subject yet) or "Schimbă materia"; "Arhivează testul" (a done test, not archived) or "Scoate din arhivă" (an archived test); "Șterge testul" (red). While the robot reads the test (`robotReads`), the subject item stays in the list, off, its description "Poți schimba materia după ce se termină corectarea.". A subject item's description is, in that order: that line; "Altfel, materia se stabilește la corectare, din test." (no subject); the line of `SubjectForm` when a new subject makes the list again (`remakes`); else "Robotul corectează testul după materia aleasă." (new text: the spec named only the first three).
3. **The rename dialog is the class page's `RenameDialog`** (title "Redenumește testul", label "Titlu nou", one "Salvează"; Esc, × and the backdrop close it). The subject dialog is a `Modal` titled with the item's name, holding `SubjectForm` (its own "Salvează" and "Renunță"). Both give the focus back to "Acțiuni".
4. **"Scoate din arhivă" says** "Testul apare din nou în lista clasei și în Teste." The errors of the archive and the delete show under "Acțiuni" (`.test-menu`, right aligned; on a phone the menu hangs from the whole head).
5. **The card's numbers are a `dl`**: each `Tile` is a `div` with its `dt` and `dd`, the bar inside the `dd` (`aria-hidden`), so page tests read every number and fact with one `fact(name)` helper. "Încarcă acum" counts the uploads with status `uploading` and at least one file (`uploadingNow`). After the uploads closed, with no average yet, the second number is "Corectate: G din X" (graded of sent). The "Început" row shows only once the test started (no more "neînceput").
6. **The students' link in În clasă has no small QR picture** (`UploadLink` with `qr={false}`), and one "Arată codul QR pe tot ecranul" button of the panel; the empty state "Nicio lucrare trimisă încă" loses its own button. The QR code on the whole screen stays open when the first paper arrives, and closing it gives the focus back to that button (it never goes away while the uploads are open). Task 2 writes this into spec §4.
7. **`printPdf(url)` decides by what the frame loaded:** `contentType` `application/pdf` prints (`'printed'`); another type (an error answer, an expired login) prints nothing (`'failed'`, the button then says so); no reachable document, a refused `print()`, or no load within `PRINT_LOAD_TIMEOUT` (20 s) opens the PDF in a new tab (`'tab'`). `printsInFrame` sends iPhone, iPad, Safari and a Mac with a touch screen (an iPad asking for the desktop site) straight to the tab. One frame at a time: a new print removes the last frame (removing it right after `print()` would close the print window in some browsers).
8. **The copies line:** "Tipărește 23 de copii, câte una pentru fiecare elev."; with a CES variant (a CES test file), "…, pentru elevii fără CES." on the class card and "…, pentru elevii cu CES." on the CES card (`copiesLine`, plural by `countLabel`); no line for a class with no student. The draft line "Poți tipări testul de acum…" shows on the class card only. Task 3 writes this into spec §3.
9. **The page drawing is spans and a 7×7 SVG QR**, white like paper in both themes, hidden below 30rem (the brand allows no gradient). It is a drawing, not the PDF.
10. **After the test was given,** Tipărire shows "Testul s-a dat în clasă." and the cards of the PDFs made before, with "Tipărește" and "Descarcă PDF"; a PDF never made shows nothing (the robot makes no print PDF after the uploads closed).
11. **Checked in Chromium:** a PDF in a same-origin frame reports `contentType` `application/pdf` and its `print()` runs; no tab opens. Firefox and Edge are checked on the user's PC after the merge (see "After Task 3").
12. **The pages' security policy allows frames of the site's own files.** The live pages send `frame-src https://challenges.cloudflare.com` (from `public/_headers`, since Quick Try part C), which blocks a frame of `/api/...`: every "Tipărește" would open a tab. Task 3 makes it `frame-src 'self' https://challenges.cloudflare.com`. The API's files already allow only our own pages (`X-Frame-Options: SAMEORIGIN`), and the pages keep `frame-ancestors 'none'` and `X-Frame-Options: DENY`, so no other site can frame them. The same rule today also blocks the PDF pages of a paper in Verificare and on the student's result page (they are frames); this line lets them show again. Task 3 writes this into spec §3.

## Review Focus

1. An answer that is not a PDF (an expired login, a server error) to "Tipărește" prints nothing, and the page says so under the button (Task 3: "prints nothing when the answer is not a PDF", "says when the PDF could not be opened for printing").
2. A PDF that never loads does not leave the button stuck at "Se pregătește…": after 20 s the PDF opens in a tab and the button is back (Task 3: "opens the PDF in a tab when the frame does not load in time", and the button check of "opens the print window on the PDF").
3. A class with no student: the bar of "Au trimis" is empty, not broken, and Tipărire says no number of copies (Task 2: "shows no part of a bar when no student is in the class"; Task 3: "says one copy for one student, and nothing for a class with no student").
4. An old draft with no upload link shows no students' link in În clasă (Task 2: "shows no students link in a draft made before tests got their link").
5. A refused change of subject keeps the dialog open with the reason, and "Renunță" closes it with nothing changed (Task 1: "keeps the form open with the reason when the subject cannot change now").
6. The live security policy must let a page frame the site's own files, or the print frame never loads (Task 3: "is allowed by the site's security policy: a page may frame the site's own files", and the landing test of the policy).

---

### Before Task 1: The branch

- [ ] **Step 1: Check the branch and the prototype**

Run: `git status --short` and `git log --oneline -3`
Expected: nothing changed; HEAD is the commit that adds this plan, on top of `a30b664 Design the new Fișa testului, the test's actions menu and printing from Tipărire`.

Run: `git rev-parse --verify refs/protofs/fs3`
Expected: a commit id. If the ref does not exist, stop and ask: the prototype's refs come with this plan.

### Task 1: "Acțiuni" at the top of the test page

The paper page's menu becomes a shared component; the test's rename, subject, archive and delete leave Fișa testului for an "Acțiuni" menu in the page's head, with a dialog for the rename and the subject.

**Files:**
- Create: `src/admin/ActionsMenu.tsx`, `src/admin/testPage/TestMenu.tsx`
- Modify: `src/admin/paperPage/PaperHead.tsx`, `src/admin/testPage/SubjectForm.tsx`, `src/admin/testPage/TestSheet.tsx`, `src/admin/pages/TestPage.tsx`, `src/ui/brand.css`, `src/AGENTS.md`
- Test: `src/admin/pages/TestPage.test.tsx`

**Interfaces:**
- Consumes: `useSmallMenu()` (`src/admin/shell/useSmallMenu.ts`), `RenameDialog` (`src/admin/classPage/ClassDialogs.tsx`), `Modal` (`src/admin/Modal.tsx`), `ArchiveDialog` and `hasOpenResults` (`src/admin/ArchiveDialog.tsx`), `SubjectForm` (`src/admin/testPage/SubjectForm.tsx`).
- Produces: `export type MenuAction = { label: string; hint: string; danger?: boolean; busy: boolean; onChoose: () => void }` and `export function ActionsMenu({ label, menuId, actions }: { label: string; menuId: string; actions: MenuAction[] })` in `src/admin/ActionsMenu.tsx`; `export function TestMenu({ test, onChanged, onRobot })` in `src/admin/testPage/TestMenu.tsx` (menu id `test-actions-menu`); `remakes(test)` and `robotReads(test)` exported from `SubjectForm.tsx`; `TestSheet({ test })` (Task 2 adds `uploads`). In `TestPage.test.tsx`: `openActions()`, `chooseAction(item)`, `actionNames()`.

- [ ] **Step 1: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
const sheet = () => screen.getByRole('region', { name: 'Fișa testului' });

```

Replace it with:

```tsx
const sheet = () => screen.getByRole('region', { name: 'Fișa testului' });

// Opens "Acțiuni" at the top of the page.
async function openActions() {
  await userEvent.click(await screen.findByRole('button', { name: 'Acțiuni' }));
  return screen.getByRole('menu', { name: 'Acțiuni' });
}

// Opens "Acțiuni" and picks one of its items.
async function chooseAction(item: string) {
  await userEvent.click(within(await openActions()).getByRole('menuitem', { name: item }));
}

// The names of the items of "Acțiuni", in order, then closes it.
async function actionNames() {
  const names = within(await openActions())
    .getAllByRole('menuitem')
    .map((item) => item.getAttribute('aria-label'));
  await userEvent.keyboard('{Escape}');
  return names;
}

```

- [ ] **Step 2: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx

  it('archives a finished test and offers to take it out of the archive', async () => {
```

Replace it with:

```tsx

  it('holds the actions of the test in "Acțiuni" at the top of the page, each with what it does', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done', files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null }, print: { status: 'ready', fromWord: false } }));
    const menu = await openActions();
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual(['Redenumește testul', 'Alege materia', 'Arhivează testul', 'Șterge testul']);
    expect(within(menu).getByRole('menuitem', { name: 'Redenumește testul' })).toHaveAccessibleDescription('Schimbi titlul testului.');
    expect(within(menu).getByRole('menuitem', { name: 'Alege materia' })).toHaveAccessibleDescription(
      'Altfel, materia se stabilește la corectare, din test.',
    );
    expect(within(menu).getByRole('menuitem', { name: 'Arhivează testul' })).toHaveAccessibleDescription(
      'Testul nu mai apare în lista clasei și în Teste. Îl găsești cu „Arată și testele arhivate”.',
    );
    expect(within(menu).getByRole('menuitem', { name: 'Șterge testul' })).toHaveAccessibleDescription(
      'Se șterg și toate lucrările încărcate de elevi. Codurile QR de pe testele tipărite nu mai funcționează.',
    );
    expect(within(sheet()).queryByRole('button')).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acțiuni' })).toHaveFocus();
  });

  it('archives a finished test and offers to take it out of the archive', async () => {
```

- [ ] **Step 3: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    renderAdmin(PAGE, api);
    expect(await screen.findByText('Testul nu mai apare în lista clasei și în Teste. Îl găsești cu „Arată și testele arhivate”.')).toBeInTheDocument();
    expect(screen.queryByText('Arhivat')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Arhivează testul' }));
    // Nothing published: no question.
```

Replace it with:

```tsx
    renderAdmin(PAGE, api);
    await screen.findByRole('region', { name: 'Fișa testului' });
    expect(screen.queryByText('Arhivat')).not.toBeInTheDocument();
    await chooseAction('Arhivează testul');
    // Nothing published: no question.
```

- [ ] **Step 4: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(await within(sheet()).findByText('Arhivat')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arhivează testul' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Scoate din arhivă' }));
    expect(api.setTestArchived).toHaveBeenLastCalledWith('6E2-26T1', false);
    expect(await screen.findByRole('button', { name: 'Arhivează testul' })).toBeInTheDocument();
    expect(screen.queryByText('Arhivat')).not.toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(await within(sheet()).findByText('Arhivat')).toBeInTheDocument();
    expect(await actionNames()).toEqual(['Redenumește testul', 'Alege materia', 'Scoate din arhivă', 'Șterge testul']);

    await chooseAction('Scoate din arhivă');
    expect(api.setTestArchived).toHaveBeenLastCalledWith('6E2-26T1', false);
    await waitFor(() => expect(screen.queryByText('Arhivat')).not.toBeInTheDocument());
    expect(await actionNames()).toContain('Arhivează testul');
  });
```

- [ ] **Step 5: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    renderAdmin(PAGE, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Arhivează testul' }));
    const dialog = screen.getByRole('dialog', { name: 'Arhivezi testul?' });
```

Replace it with:

```tsx
    renderAdmin(PAGE, api);
    await chooseAction('Arhivează testul');
    const dialog = screen.getByRole('dialog', { name: 'Arhivezi testul?' });
```

- [ ] **Step 6: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(api.setTestArchived).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Arhivează testul' })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Arhivează testul' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Arhivezi testul?' })).getByRole('button', { name: 'Arhivează' }));
```

Replace it with:

```tsx
    expect(api.setTestArchived).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Acțiuni' })).toHaveFocus();

    await chooseAction('Arhivează testul');
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Arhivezi testul?' })).getByRole('button', { name: 'Arhivează' }));
```

- [ ] **Step 7: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    renderAdmin(PAGE, apiWith({ status: 'done', publishedCount: 1 }));
    await userEvent.click(await screen.findByRole('button', { name: 'Arhivează testul' }));
    expect(screen.getByRole('dialog', { name: 'Arhivezi testul?' })).toBeInTheDocument();
```

Replace it with:

```tsx
    renderAdmin(PAGE, apiWith({ status: 'done', publishedCount: 1 }));
    await chooseAction('Arhivează testul');
    expect(screen.getByRole('dialog', { name: 'Arhivezi testul?' })).toBeInTheDocument();
```

- [ ] **Step 8: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
      const view = renderAdmin(PAGE, apiWith({ status }));
      expect(await screen.findByRole('button', { name: 'Șterge testul' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Arhivează testul' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Scoate din arhivă' })).not.toBeInTheDocument();
      view.unmount();
```

Replace it with:

```tsx
      const view = renderAdmin(PAGE, apiWith({ status }));
      expect(await actionNames()).toEqual(['Redenumește testul', 'Alege materia', 'Șterge testul']);
      view.unmount();
```

- [ ] **Step 9: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    renderAdmin(PAGE, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Arhivează testul' }));
    expect(await screen.findByText('Poți arhiva un test după ce s-a terminat corectarea.')).toBeInTheDocument();
```

Replace it with:

```tsx
    renderAdmin(PAGE, api);
    await chooseAction('Arhivează testul');
    expect(await screen.findByText('Poți arhiva un test după ce s-a terminat corectarea.')).toBeInTheDocument();
```

- [ ] **Step 10: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx

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
```

Replace it with:

```tsx

  it('renames the test in a dialog', async () => {
    const api = apiWith();
    renderAdmin(PAGE, api);
    await chooseAction('Redenumește testul');
    const dialog = screen.getByRole('dialog', { name: 'Redenumește testul' });
    const input = within(dialog).getByLabelText('Titlu nou');
    expect(input).toHaveValue('Fracții');
    expect(input).toHaveFocus();
    await userEvent.clear(input);
    await userEvent.type(input, 'Teză');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvează' }));
    expect(api.renameTest).toHaveBeenCalledWith('6E2-26T1', 'Teză');
    expect(await screen.findByRole('heading', { level: 1, name: 'Teză' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acțiuni' })).toHaveFocus();
  });

  it('keeps the title when the rename dialog is closed', async () => {
    const api = apiWith();
    renderAdmin(PAGE, api);
    await chooseAction('Redenumește testul');
    await userEvent.type(screen.getByLabelText('Titlu nou'), ' nou');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.renameTest).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Fracții' })).toBeInTheDocument();
  });
```

- [ ] **Step 11: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    renderAdmin(PAGE, api, <LocationProbe />);
    await userEvent.click(await screen.findByRole('button', { name: 'Șterge testul' }));
    expect(api.deleteTest).toHaveBeenCalledWith('6E2-26T1');
    await expectLocation(/^\/$/);
  });
```

Replace it with:

```tsx
    renderAdmin(PAGE, api, <LocationProbe />);
    await chooseAction('Șterge testul');
    expect(api.deleteTest).toHaveBeenCalledWith('6E2-26T1');
    await expectLocation(/^\/$/);
  });

  it('says why the delete was refused', async () => {
    const api = apiWith();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.deleteTest).mockRejectedValueOnce(new ApiError(503, 'unavailable', 'Serverul nu răspunde. Încearcă din nou.'));
    renderAdmin(PAGE, api);
    await chooseAction('Șterge testul');
    expect(await screen.findByText('Serverul nu răspunde. Încearcă din nou.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Fracții' })).toBeInTheDocument();
  });
```

- [ ] **Step 12: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    renderAdmin(PAGE, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Șterge testul' }));
    expect(confirm).toHaveBeenCalledWith(
```

Replace it with:

```tsx
    renderAdmin(PAGE, api);
    await chooseAction('Șterge testul');
    expect(confirm).toHaveBeenCalledWith(
```

- [ ] **Step 13: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
describe('TestPage subject', () => {
  const subjects = () => within(sheet()).getByRole('group', { name: 'Materia testului' });

  it('shows in Fișa testului that the robot finds the subject, and the teacher can choose it', async () => {
    const api = apiWith();
```

Replace it with:

```tsx
describe('TestPage subject', () => {
  const dialog = () => screen.getByRole('dialog');
  const subjects = () => within(dialog()).getByRole('group', { name: 'Materia testului' });

  it('shows in Fișa testului that the robot finds the subject, and the teacher can choose it in "Acțiuni"', async () => {
    const api = apiWith();
```

- [ ] **Step 14: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(await within(await screen.findByRole('region', { name: 'Fișa testului' })).findByText('Se stabilește la corectare')).toBeInTheDocument();
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Alege materia' }));
    expect(within(subjects()).getAllByRole('radio').map((radio) => radio.closest('label')!.textContent)).toEqual([
```

Replace it with:

```tsx
    expect(await within(await screen.findByRole('region', { name: 'Fișa testului' })).findByText('Se stabilește la corectare')).toBeInTheDocument();
    await chooseAction('Alege materia');
    expect(dialog()).toHaveAccessibleName('Alege materia');
    expect(within(subjects()).getAllByRole('radio').map((radio) => radio.closest('label')!.textContent)).toEqual([
```

- [ ] **Step 15: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    ]);
    expect(within(sheet()).getByRole('button', { name: 'Salvează' })).toBeDisabled();
    // A draft has no exercise list: nothing is graded again.
    await userEvent.click(within(subjects()).getByRole('radio', { name: 'Fizică' }));
    expect(within(sheet()).queryByText(/se corectează din nou/)).not.toBeInTheDocument();
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Salvează' }));
    expect(api.setSubject).toHaveBeenCalledWith('6E2-26T1', 'fizica');
    expect(await within(sheet()).findByText('Fizică')).toBeInTheDocument();
    expect(within(sheet()).getByRole('button', { name: 'Schimbă materia' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
```

Replace it with:

```tsx
    ]);
    expect(within(dialog()).getByRole('button', { name: 'Salvează' })).toBeDisabled();
    // A draft has no exercise list: nothing is graded again.
    await userEvent.click(within(subjects()).getByRole('radio', { name: 'Fizică' }));
    expect(within(dialog()).queryByText(/se corectează din nou/)).not.toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Salvează' }));
    expect(api.setSubject).toHaveBeenCalledWith('6E2-26T1', 'fizica');
    expect(await within(sheet()).findByText('Fizică')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await actionNames()).toContain('Schimbă materia');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
```

- [ ] **Step 16: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    renderAdmin(PAGE, api);
    await userEvent.click(await within(await screen.findByRole('region', { name: 'Fișa testului' })).findByRole('button', { name: 'Schimbă materia' }));
    expect(within(subjects()).getByRole('radio', { name: 'Matematică' })).toBeChecked();
    expect(within(sheet()).queryByText(/se corectează din nou/)).not.toBeInTheDocument();
    await userEvent.click(within(subjects()).getByRole('radio', { name: 'Fizică' }));
    expect(within(sheet()).getByText('Lista de exerciții se face din nou, iar lucrările corectate se corectează din nou.')).toBeInTheDocument();
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Salvează' }));
    expect(await screen.findByRole('status')).toHaveTextContent(robotStartMessage('next_check'));
```

Replace it with:

```tsx
    renderAdmin(PAGE, api);
    const menu = await openActions();
    expect(within(menu).getByRole('menuitem', { name: 'Schimbă materia' })).toHaveAccessibleDescription(
      'Lista de exerciții se face din nou, iar lucrările corectate se corectează din nou.',
    );
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Schimbă materia' }));
    expect(within(subjects()).getByRole('radio', { name: 'Matematică' })).toBeChecked();
    expect(within(dialog()).queryByText(/se corectează din nou/)).not.toBeInTheDocument();
    await userEvent.click(within(subjects()).getByRole('radio', { name: 'Fizică' }));
    expect(within(dialog()).getByText('Lista de exerciții se face din nou, iar lucrările corectate se corectează din nou.')).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Salvează' }));
    expect(await screen.findByRole('status')).toHaveTextContent(robotStartMessage('next_check'));
```

- [ ] **Step 17: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    renderAdmin(PAGE, api);
    await userEvent.click(await within(await screen.findByRole('region', { name: 'Fișa testului' })).findByRole('button', { name: 'Schimbă materia' }));
    await userEvent.click(within(subjects()).getByRole('radio', { name: 'Fizică' }));
    expect(within(sheet()).getByText('Lista de exerciții se face din nou, iar lucrările corectate se corectează din nou.')).toBeInTheDocument();
  });

  it('offers no change of subject while the robot grades the test', async () => {
    const api = apiWith({ status: 'evaluating', exerciseList: { status: 'ready', message: null }, subject: { value: 'matematica', name: '', by: 'robot' } });
```

Replace it with:

```tsx
    renderAdmin(PAGE, api);
    await chooseAction('Schimbă materia');
    await userEvent.click(within(subjects()).getByRole('radio', { name: 'Fizică' }));
    expect(within(dialog()).getByText('Lista de exerciții se face din nou, iar lucrările corectate se corectează din nou.')).toBeInTheDocument();
  });

  it('offers no change of subject while the robot grades the test, and says when it can change', async () => {
    const api = apiWith({ status: 'evaluating', exerciseList: { status: 'ready', message: null }, subject: { value: 'matematica', name: '', by: 'robot' } });
```

- [ ] **Step 18: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(await within(await screen.findByRole('region', { name: 'Fișa testului' })).findByText('Matematică')).toBeInTheDocument();
    expect(within(sheet()).queryByRole('button', { name: 'Schimbă materia' })).not.toBeInTheDocument();
    expect(within(sheet()).getByText('Poți schimba materia după ce se termină corectarea.')).toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(await within(await screen.findByRole('region', { name: 'Fișa testului' })).findByText('Matematică')).toBeInTheDocument();
    const item = within(await openActions()).getByRole('menuitem', { name: 'Schimbă materia' });
    expect(item).toBeDisabled();
    expect(item).toHaveAccessibleDescription('Poți schimba materia după ce se termină corectarea.');
  });

  it('says what a new subject does before the exercise list exists', async () => {
    renderAdmin(PAGE, apiWith({ subject: { value: 'matematica', name: '', by: 'teacher' } }));
    expect(within(await openActions()).getByRole('menuitem', { name: 'Schimbă materia' })).toHaveAccessibleDescription(
      'Robotul corectează testul după materia aleasă.',
    );
  });
```

- [ ] **Step 19: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    renderAdmin(PAGE, api);
    await userEvent.click(await within(await screen.findByRole('region', { name: 'Fișa testului' })).findByRole('button', { name: 'Schimbă materia' }));
    await userEvent.click(within(subjects()).getByRole('radio', { name: 'Chimie' }));
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Salvează' }));
    expect(await within(sheet()).findByText('Baremul se generează acum. Poți schimba materia după ce este gata.')).toBeInTheDocument();
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Renunță' }));
    expect(within(sheet()).getByText('Matematică')).toBeInTheDocument();
```

Replace it with:

```tsx
    renderAdmin(PAGE, api);
    await chooseAction('Schimbă materia');
    await userEvent.click(within(subjects()).getByRole('radio', { name: 'Chimie' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Salvează' }));
    expect(await within(dialog()).findByText('Baremul se generează acum. Poți schimba materia după ce este gata.')).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Renunță' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(sheet()).getByText('Matematică')).toBeInTheDocument();
```

- [ ] **Step 20: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/TestPage.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  17 failed | 120 passed (137)`: the 17 tests of the menu, the archive, the rename, the delete and the subject fail with `Unable to find role="button" and name "Acțiuni"`. The other tests of the file pass.

- [ ] **Step 21: Create `src/admin/ActionsMenu.tsx`**

```tsx
import { useSmallMenu } from './shell/useSmallMenu.ts';

// One item of an actions menu: its name, the words under it that say what it
// does (its accessible description), red when it deletes, and off while its
// work runs or while it cannot be chosen now.
export type MenuAction = { label: string; hint: string; danger?: boolean; busy: boolean; onChoose: () => void };

// A menu of actions at the top of a page ("Alte acțiuni" of the paper page,
// "Acțiuni" of the test page): each item shows what it does before it is
// chosen. Choosing one closes the menu and gives the focus back to its button
// before the action asks or opens a dialog.
export function ActionsMenu({ label, menuId, actions }: { label: string; menuId: string; actions: MenuAction[] }) {
  const { open, toggle, box, button } = useSmallMenu<HTMLDivElement>();
  const run = (action: MenuAction) => () => {
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
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
      >
        {label}
        <svg className="paper-actions-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="class-menu paper-actions-menu" id={menuId} role="menu" aria-label={label}>
          {actions.map((action, index) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={action.danger ? 'paper-action is-danger' : 'paper-action'}
              aria-label={action.label}
              aria-describedby={`${menuId}-hint-${index}`}
              disabled={action.busy}
              onClick={run(action)}
            >
              <span className="paper-action-label">{action.label}</span>
              <span className="paper-action-hint" id={`${menuId}-hint-${index}`}>
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

- [ ] **Step 22: Edit `src/admin/paperPage/PaperHead.tsx`**

Find this block:

```tsx
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
```

Replace it with:

```tsx
import { useApi } from '../ApiContext.tsx';
import { ActionsMenu, type MenuAction } from '../ActionsMenu.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
```

- [ ] **Step 23: Edit `src/admin/paperPage/PaperHead.tsx`**

Find this block:

```tsx
import { studentPdf, studentPdfFileName, studentPdfInput } from '../pdf/studentPdf.ts';
import { useSmallMenu } from '../shell/useSmallMenu.ts';
import { heldBack, PAPER_PART_LABEL } from '../testPage/paperCounts.ts';
```

Replace it with:

```tsx
import { studentPdf, studentPdfFileName, studentPdfInput } from '../pdf/studentPdf.ts';
import { heldBack, PAPER_PART_LABEL } from '../testPage/paperCounts.ts';
```

- [ ] **Step 24: Edit `src/admin/paperPage/PaperHead.tsx`**

Find this block:

```tsx

  const paperActions: PaperAction[] = [];
  if (gradedAt !== null) {
```

Replace it with:

```tsx

  const paperActions: MenuAction[] = [];
  if (gradedAt !== null) {
```

- [ ] **Step 25: Edit `src/admin/paperPage/PaperHead.tsx`**

Find this block:

```tsx
          )}
          <PaperActionsMenu actions={paperActions} />
        </div>
```

Replace it with:

```tsx
          )}
          <ActionsMenu label="Alte acțiuni" menuId="paper-actions-menu" actions={paperActions} />
        </div>
```

- [ ] **Step 26: Edit `src/admin/paperPage/PaperHead.tsx`**

Find this block:

```tsx
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

Replace it with:

```tsx
}
```

- [ ] **Step 27: Edit `src/admin/testPage/SubjectForm.tsx`**

Find this block:

```tsx
// reopened test grades them at its next start.
function remakes(test: TestInfo): boolean {
  const listMade = test.exerciseList.status !== 'none' || test.ces.exerciseList.status !== 'none';
```

Replace it with:

```tsx
// reopened test grades them at its next start.
export function remakes(test: TestInfo): boolean {
  const listMade = test.exerciseList.status !== 'none' || test.ces.exerciseList.status !== 'none';
```

- [ ] **Step 28: Edit `src/admin/testPage/SubjectForm.tsx`**

Find this block:

```tsx
// "Schimbă" (spec: any subject, "The teacher can fix it"): the teacher picks
// one of the subjects the robot grades. It opens in place of its button.
export function SubjectForm({
```

Replace it with:

```tsx
// "Schimbă" (spec: any subject, "The teacher can fix it"): the teacher picks
// one of the subjects the robot grades. It opens in place of its button, or in
// a dialog from the test's "Acțiuni".
export function SubjectForm({
```

- [ ] **Step 29: Edit `src/admin/testPage/SubjectForm.tsx`**

Find this block:

```tsx
// teacher): the API refuses a change of subject (spec: any subject).
function robotReads(test: TestInfo): boolean {
  return test.status === 'evaluating' && test.exerciseList.status !== 'problem' && test.exerciseList.status !== 'failed';
```

Replace it with:

```tsx
// teacher): the API refuses a change of subject (spec: any subject).
export function robotReads(test: TestInfo): boolean {
  return test.status === 'evaluating' && test.exerciseList.status !== 'problem' && test.exerciseList.status !== 'failed';
```

- [ ] **Step 30: Create `src/admin/testPage/TestMenu.tsx`**

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { MAX_TITLE_LENGTH } from '../../../shared/tests.ts';
import { ActionsMenu, type MenuAction } from '../ActionsMenu.tsx';
import { useApi } from '../ApiContext.tsx';
import { ArchiveDialog, hasOpenResults } from '../ArchiveDialog.tsx';
import { RenameDialog } from '../classPage/ClassDialogs.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { Modal } from '../Modal.tsx';
import { remakes, robotReads, SubjectForm } from './SubjectForm.tsx';

// What "Schimbă materia" does, in the words under it.
function subjectHint(test: TestInfo): string {
  if (robotReads(test)) return 'Poți schimba materia după ce se termină corectarea.';
  if (test.subject === null) return 'Altfel, materia se stabilește la corectare, din test.';
  if (remakes(test)) return 'Lista de exerciții se face din nou, iar lucrările corectate se corectează din nou.';
  return 'Robotul corectează testul după materia aleasă.';
}

// "Acțiuni" of the test page (spec 2026-11-15 §1): the actions that work in
// every stage, at the top right of the page, each with what it does. Renaming
// and the subject open a dialog; the archive asks first while results are
// open; a delete asks with `window.confirm`.
export function TestMenu({
  test,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<'rename' | 'subject' | 'archive' | null>(null);
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
  // A printed test keeps its QR code: after a delete, the code leads nowhere.
  const printed = test.print.status === 'ready';
  const subjectLabel = test.subject === null ? 'Alege materia' : 'Schimbă materia';

  const actions: MenuAction[] = [
    { label: 'Redenumește testul', hint: 'Schimbi titlul testului.', busy: false, onChoose: () => setDialog('rename') },
    { label: subjectLabel, hint: subjectHint(test), busy: robotReads(test), onChoose: () => setDialog('subject') },
  ];
  if (test.archived) {
    actions.push({
      label: 'Scoate din arhivă',
      hint: 'Testul apare din nou în lista clasei și în Teste.',
      busy: archive.isPending,
      onChoose: () => archive.mutate(false),
    });
  } else if (test.status === 'done') {
    actions.push({
      label: 'Arhivează testul',
      hint: 'Testul nu mai apare în lista clasei și în Teste. Îl găsești cu „Arată și testele arhivate”.',
      busy: archive.isPending,
      onChoose: () => (hasOpenResults(test) ? setDialog('archive') : archive.mutate(true)),
    });
  }
  actions.push({
    label: 'Șterge testul',
    hint: `Se șterg și toate lucrările încărcate de elevi.${printed ? ' Codurile QR de pe testele tipărite nu mai funcționează.' : ''}`,
    danger: true,
    busy: remove.isPending,
    onChoose: () => {
      const qr = printed ? ' Codurile QR de pe testele tipărite nu vor mai funcționa.' : '';
      if (window.confirm(`Ștergi testul ${test.code}? Se șterg și toate lucrările încărcate.${qr}`)) remove.mutate();
    },
  });

  const close = () => setDialog(null);
  return (
    <div className="test-menu">
      <ActionsMenu label="Acțiuni" menuId="test-actions-menu" actions={actions} />
      {archive.error && <ErrorMessage error={archive.error} />}
      {remove.error && <ErrorMessage error={remove.error} />}
      {dialog === 'rename' && (
        <RenameDialog
          title="Redenumește testul"
          label="Titlu nou"
          initial={test.title}
          maxLength={MAX_TITLE_LENGTH}
          save={(title) => api.renameTest(test.code, title)}
          onSaved={onChanged}
          onClose={close}
        />
      )}
      {dialog === 'subject' && (
        <Modal title={subjectLabel} onClose={close}>
          <div className="modal-body">
            <SubjectForm test={test} onDone={onChanged} onRobot={onRobot} onClose={close} />
          </div>
        </Modal>
      )}
      {dialog === 'archive' && (
        <ArchiveDialog
          title="Arhivezi testul?"
          text="Elevii nu își vor mai putea vedea rezultatele. Le poți publica din nou oricând."
          onConfirm={() => archive.mutate(true)}
          onClose={close}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 31: Edit `src/admin/testPage/TestSheet.tsx`**

Find this block:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { MAX_TITLE_LENGTH } from '../../../shared/tests.ts';
import { formatDateTime, studentCountLabel } from '../../ui/format.ts';
import { printFileUrl, testFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { ArchiveDialog, hasOpenResults } from '../ArchiveDialog.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { StatusChip } from '../StatusChip.tsx';
import { SubjectChange, subjectLine } from './SubjectForm.tsx';
import { UploadLink } from './UploadLink.tsx';
```

Replace it with:

```tsx
import { useId } from 'react';
import type { TestInfo } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatDateTime, studentCountLabel } from '../../ui/format.ts';
import { printFileUrl, testFileUrl } from '../api.ts';
import { StatusChip } from '../StatusChip.tsx';
import { subjectLine } from './SubjectForm.tsx';
import { UploadLink } from './UploadLink.tsx';
```

- [ ] **Step 32: Edit `src/admin/testPage/TestSheet.tsx`**

Find this block:

```tsx
// "Fișa testului" (redesign spec §6): the facts and files of the test, its
// subject (spec: any subject), the students' link while they may still need
// it, and renaming, archiving and deleting the test. It shows beside every stage.
export function TestSheet({
  test,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const id = useId();
  // The rename form opens in place of its button.
  const [renameOpen, setRenameOpen] = useState(false);
  // The archive closes the result pages: it asks first while some are open.
  const [askArchive, setAskArchive] = useState(false);
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
```

Replace it with:

```tsx
// "Fișa testului" (redesign spec §6): the facts and files of the test, its
// subject (spec: any subject) and the students' link while they may still need
// it. It shows beside every stage; the test's actions are in "Acțiuni"
// (`TestMenu.tsx`).
export function TestSheet({ test }: { test: TestInfo }) {
  const id = useId();
  // The printed QR code is the usual way in; the link here is for a student
```

- [ ] **Step 33: Edit `src/admin/testPage/TestSheet.tsx`**

Find this block:

```tsx
        <dt>Materia</dt>
        <dd className="sheet-subject">
          {subjectLine(test)}
          <SubjectChange test={test} onChanged={onChanged} onRobot={onRobot} />
        </dd>
        <dt>Starea</dt>
```

Replace it with:

```tsx
        <dt>Materia</dt>
        <dd>{subjectLine(test)}</dd>
        <dt>Starea</dt>
```

- [ ] **Step 34: Edit `src/admin/testPage/TestSheet.tsx`**

Find this block:

```tsx
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
              <button
                type="button"
                className="button-quiet button-small"
                disabled={archive.isPending}
                onClick={() => (hasOpenResults(test) ? setAskArchive(true) : archive.mutate(true))}
              >
                Arhivează testul
              </button>
              <p className="hint">Testul nu mai apare în lista clasei și în Teste. Îl găsești cu „Arată și testele arhivate”.</p>
            </>
          )
        )}
        {askArchive && (
          <ArchiveDialog
            title="Arhivezi testul?"
            text="Elevii nu își vor mai putea vedea rezultatele. Le poți publica din nou oricând."
            onConfirm={() => archive.mutate(true)}
            onClose={() => setAskArchive(false)}
          />
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
```

Replace it with:

```tsx
      )}
    </section>
```

- [ ] **Step 35: Edit `src/admin/testPage/TestSheet.tsx`**

Find this block:

```tsx
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

Replace it with:

```tsx
}
```

- [ ] **Step 36: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx
import { waitsForBarem, waitsForPrint } from '../testPage/StartRobotButton.tsx';
import { TestSheet } from '../testPage/TestSheet.tsx';
```

Replace it with:

```tsx
import { waitsForBarem, waitsForPrint } from '../testPage/StartRobotButton.tsx';
import { TestMenu } from '../testPage/TestMenu.tsx';
import { TestSheet } from '../testPage/TestSheet.tsx';
```

- [ ] **Step 37: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx

// The test page of the redesign (spec §6): the six stages and Fișa testului,
// and the panel of the chosen stage. `fresh`: the data was read for this
// visit, not kept from an earlier one.
```

Replace it with:

```tsx

// The test page of the redesign (spec §6): the head with "Acțiuni", the six
// stages and Fișa testului, and the panel of the chosen stage. `fresh`: the data was read for this
// visit, not kept from an earlier one.
```

- [ ] **Step 38: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx
      <div className="test-head">
        <h1>{test.title}</h1>
        <p className="test-sub">
          {studentCountLabel(test.studentCount)} · {test.startedAt ? `început ${formatDateTime(test.startedAt)}` : 'ciornă'}
        </p>
      </div>
```

Replace it with:

```tsx
      <div className="test-head">
        <div className="test-title">
          <h1>{test.title}</h1>
          <p className="test-sub">
            {studentCountLabel(test.studentCount)} · {test.startedAt ? `început ${formatDateTime(test.startedAt)}` : 'ciornă'}
          </p>
        </div>
        <TestMenu test={test} onChanged={refresh} onRobot={onRobot} />
      </div>
```

- [ ] **Step 39: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx
        />
        <TestSheet test={test} onChanged={refresh} onRobot={onRobot} />
      </div>
```

Replace it with:

```tsx
        />
        <TestSheet test={test} />
      </div>
```

- [ ] **Step 40: Edit `src/ui/brand.css`**

Find this block:

```css
   the panel, then Fișa testului. */
.test-head {
  margin-bottom: 1rem;
}
```

Replace it with:

```css
   the panel, then Fișa testului. */
/* The head: the title and its line on the left, "Acțiuni" on the right
   (spec 2026-11-15 §1). On a phone the menu hangs from the whole head. */
.test-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
  margin-bottom: 1rem;
}

.test-title {
  min-width: 0;
}
```

- [ ] **Step 41: Edit `src/ui/brand.css`**

Find this block:

```css
.test-head h1 {
  margin: 0;
  overflow-wrap: anywhere;
}

.test-sub {
```

Replace it with:

```css
.test-head h1 {
  margin: 0;
  overflow-wrap: anywhere;
}

.test-menu {
  display: grid;
  justify-items: end;
  gap: 0.5rem;
}

.test-menu .paper-actions-menu {
  width: 21rem;
}

@media (max-width: 40rem) {
  .test-head {
    position: relative;
  }

  .test-menu {
    justify-items: start;
  }

  .test-menu .paper-actions {
    position: static;
  }

  .test-menu .class-menu.paper-actions-menu {
    right: 0;
    left: 0;
    width: auto;
    max-width: none;
  }
}

.test-sub {
```

- [ ] **Step 42: Edit `src/ui/brand.css`**

Find this block:

```css

.sheet-actions {
  justify-items: start;
}

.rename-form {
```

Replace it with:

```css

.rename-form {
```

- [ ] **Step 43: Edit `src/ui/brand.css`**

Find this block:

```css
  width: 100%;
}

.sheet-subject {
  display: grid;
  gap: 0.375rem;
  justify-items: end;
}

/* In Fișa testului the facts are right-aligned and break anywhere: the open
   form takes the whole column instead, so no subject name breaks inside a word. */
.sheet-subject .subject-form {
  justify-self: stretch;
  text-align: left;
  overflow-wrap: normal;
}
```

Replace it with:

```css
  width: 100%;
}
```

- [ ] **Step 44: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1), (x + 1)/3, a negated letter p̄ (a combining bar, which the font draws beside the letter, so the page draws it) and a subscript A_p or A_(p∧q), and leaves intervals, words such as și/sau and names such as x_max as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen (Rezultate is the one screen with two, each the main action of its own box: "Publică toate rezultatele" and "Deschide raportul"), filled orange (`.button button-wait`) for the one main action of a screen whose work waits on the teacher ("Începe verificarea" in Verificare), and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `Crumbs.tsx` is the path at the top of the test page and of the paper page ("Teste › Clasa 7E2 › <test>", a `nav` "Unde ești"; the last step is the page itself, not a link). `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă and Corectare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8, spec 2026-11-14: the box at its top in `ResultsAccess.tsx`, grey with "Publică toate rezultatele" while no result is published, green once students can read results (for all, or some alone), with "Oprește accesul la rezultate" (or "Publică toate rezultatele" while only some are) and the two ways students find them, numbered: their own link, kept on the phone, and the test's link for the students scanned again (its QR code, "Copiază linkul", "Descarcă codul QR", a PNG, and "Arată codul QR pe tot ecranul"); the teacher's multi-upload link is not in Rezultate; a copy the browser refuses shows the link in a field, selected and described by the line above it (`admin/CopyLink.tsx`, for both copy buttons of the panel); the students' result links in `ResultLinksTable.tsx`, with the grade right after the name (a `GradeChip`, with its points still to check beside it in an orange label), the points, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Elevii" with its count as a label (green "toate publicate" once every result is published, grey while some wait); "Raportul clasei" in `ReportCard.tsx` (spec 2026-11-14), beside the table in a wide panel (its top level with the table's, a subgrid) and above it in a narrow one (a container query on `.results-layout`): the average in its grade colour, the grades by group (`gradeGroups` of `shared/stats.ts`, counted from the uploads list: no report query), "Deschide raportul" (the panel's main button) and "CSV pentru catalog" (a quiet text button: the class report's CSV, read when pressed); the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the subject (`SubjectForm.tsx`: "Se stabilește la corectare" until the robot finds it, "Alege materia" or "Schimbă materia" opening the seven subjects in place (while the robot reads the test, only a line that says when the subject can change), with a line when the list is made again and the papers graded again), the files, the students' link while the test is a draft or open, rename, archive (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`), delete), the overview of Verificare (`ReviewOverview.tsx`: the graded papers that had points, counted with `flagCount` and `checkedCount`; "<checked> din <total> verificate", its bar, "Mai sunt …" and the orange "Începe verificarea" (nothing checked yet) or "Continuă verificarea" into the paper page at the first point left; "De verificat", a label per student with points left ("<checked>/<total>", opening that student's first point), and "Gata", a label per student done (opening the paper with all its exercises); once all is checked a green box with "Mergi la Rezultate" (the panel then leaves out "Următoarea etapă"), and "Nimic de verificat." when no graded paper had a point; CES as the other tables show it (`ces` or `variant === 'ces'`), in the label's accessible name too; no papers table and no list of the points: the paper page decides them), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page learns the answer from the version check of the shell), the uploads table (`UploadsTable.tsx`, the full width of its card; the grade right after the name, a `GradeChip.tsx`: the grade in a soft chip of the class report's colours, `.points-N` of `pointsLevel(grade, 10)`; "De verificat" in an orange label; both papers tables are drawn like the points table of Verificare, with no bold: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off; a student who sent nothing is "Nu a trimis" while the uploads are open and "Nu a participat" after; after, an upload left open with files is "Așteaptă corectarea" and one with no file "Nu a participat"), "Recorectează tot"). `pages/PaperPage.tsx` and `paperPage/` are the paper page (spec `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md` §4, `/teste/:code/elevi/:submissionId`): the path (`Crumbs`), the head (`PaperHead.tsx`: `.submission-head`, the name, the test, the state and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right; then the result link row; `usePaperActions` holds Recorectează, Resetează and Reîncearcă and the news after them), the switch "Toate exercițiile" / "Doar de verificat (N)" (N the points of the whole test; the view is in the address, `vedere=verificare`, and stays when she moves), then the moves, small and on one row also on a phone: "‹ Punct 3/47 ›" (a group "Punctele de verificat", only with the points to check, never with all the exercises: the arrows are "Punctul anterior" and "Următorul punct", both alike, with the key in their tooltip, and between them the open point's place among the points J and K walk), "‹ Elev 2/7 ›" (a group "Elevii", "Elevul anterior" and "Elevul următor", and between them the student's place in the list; they go round, the last to the first, but after a decision on the last student the focus goes to the exercises, not to "Elevul următor") and "Lucrarea" (a picture icon, pressed while the paper shows, which hides it or shows it again), then three columns: "Elevii" (`StudentList.tsx`: every upload with a paper, the grade, the points to check in orange or the state; only the points to check: the papers with points first; a name opens that paper at the top of the window; it folds to a strip, kept in this browser as `quickeval:paperStudentsFolded`), the exercises (`GradedResult` with `check`: a click on a row or its "Arată pe lucrare" opens it, `?punct=<item id>` or `pagini`, and a second click on the open row closes it, after `CLOSE_DELAY` (300 ms), so the first click of a double or triple click, which selects a word to copy, never closes it (a click that ends a selection of the row's text does nothing); a row to check stays open when a click opens another row (`keptKeys`, kept in `Paper` until the teacher closes or checks it, none for another paper; only a click on a row, its "Verifică" or its "Arată pe lucrare" keeps it, `paperKeep` in the navigation state, never J, K or the buttons), so the rows under it never move: its decision stays in place, dimmed, `inert` and `aria-hidden` (`DecisionSlot`), and a click on its row or its "Verifică" opens it again; the A key and the focus after a decision reach only the open row's slot (`.decision-slot.is-current`); "Doar de verificat" keeps only the rows to check and the open one, without the texts for the student; a row to check is calm: its points in a soft orange label (`.points-pill`) and one "Verifică" icon button that opens it (an orange magnifier with a check, like the pencil, its word in its name and tooltip), with no reason in the row; the open row to check shows `PointDecision.tsx` under it, region "Decizia", in a box with a light orange border: the robot's reason, "Accept <points>" (the robot's points), the stepper (− and + move by 0,5 on the 0,05 steps, between 0 and the maximum; any value in steps of 0,05 can be typed) and "Salvează", and what the grade becomes with another value; for the pages, the reason and "Am verificat paginile"; while a decision shows, the bar names the keys between the switch and the moves, only when the whole line fits there (`.review-keys`: a one-line wrapping box whose line wraps out of sight)), and the paper (`reviewPage/ReviewPhoto.tsx`, staying in view and level with the other two columns; its × button ("Ascunde lucrarea", top right) hides it, the exercises taking its room, and the focus goes to "Lucrarea" in the bar; the choice is kept in this browser as `quickeval:paperPhotoFolded`; a graded paper with nothing left to check opens with it hidden (chosen when the paper opens, from its upload row), and its toggles there are not saved; graded again, it shows as the saved choice says; while it is folded, 1–9 do nothing and the bar does not name them, and "Arată pe lucrare" shows it again (an open row stays open): each page with "2/3" beside the name and its file's name and size, as the student sent it; over the photo, a floating bar on the top left holds "Arată chenarul" (an orange dashed-frame toggle, while the open answer has an area) and "Toată pagina" (off while the page is whole), and the zoom's − and + float alone on the top right; a photo zooms inside the pane (a left click, a right click and the two buttons over the photo take one small step, out and in; two fingers pinch on a touch screen, and the wheel scrolls the page), a line over the page says what a click does until she zooms, in the words of the pointer at hand (a phone has no right button), and the open exercise draws an orange border around the robot's area of its answer, on the whole page, because the page never zooms by itself; the border's arrows step through the parts of an answer, each part opening on its page, whole). The exercises get three fifths of the room the students leave, the paper two; below 1200px the students go under the exercises, and below 900px one column: the exercises, the paper, the students. `paperPage/paths.ts` writes the addresses (replaced, never a new step in the history) and picks the students' order and the points J and K walk: every point of the test while only the points to check show, else the open student's. `reviewPage/points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first) and steps between them. The old address of the review, `/teste/:code/verificare?lucrare=&punct=`, opens the page with only the points to check (`ReviewRedirect`: the named paper and point, else `firstSpot()`, else the test's Verificare); every link to the points to check uses it (`reviewPath`). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point: with only the points to check, also on the next student; with all the exercises, the next point of the same student, and when none is left the row stays open and "Elevul următor" takes the focus. It moves only if the teacher is still at the decided point (a call-level `onSuccess` of `mutate`, which does not run once the page is gone). The shell draws the page anew for another address path (`ErrorBoundary key={location.pathname}`), so where the focus goes after a decision rides in the navigation state (`paperFocus`), given once per address. A new address path opens at the top of the window (`Layout.tsx`, a PUSH only): a replaced one (the paper page's moves) keeps its place, and Back or Forward leave it to the browser. A refused decision reads the paper and the test again. The papers the teacher can move to next (the next and the previous student, the next point's paper) are read ahead, so another student's page shows at once; while a paper loads, its place keeps a screen's height. A paper with no result now (uploading, sent, graded again) shows its pages and why (`submissionPage/waitingText.ts`), a failed one "Reîncearcă"; when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A (presses "Accept" of an open row to check), J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). "Alte acțiuni" (`useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. Points are never bold. Without the paper page (no page uses that plain list now), an exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds "Verifică" or "Arată pe lucrare" (paper page only) and the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, its font (Roboto) drops without a sign every character it lacks, so `pdfSymbols.ts` writes those signs as words (∧ și, ∀ oricare ar fi, ⋮ divizibil cu) and `pdfMath.ts` draws a negated letter p̄ with a line over it, A_p with a subscript and σᵏ with a raised letter (pdfmake runs), `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

Replace it with:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1), (x + 1)/3, a negated letter p̄ (a combining bar, which the font draws beside the letter, so the page draws it) and a subscript A_p or A_(p∧q), and leaves intervals, words such as și/sau and names such as x_max as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen (Rezultate is the one screen with two, each the main action of its own box: "Publică toate rezultatele" and "Deschide raportul"), filled orange (`.button button-wait`) for the one main action of a screen whose work waits on the teacher ("Începe verificarea" in Verificare), and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `Crumbs.tsx` is the path at the top of the test page and of the paper page ("Teste › Clasa 7E2 › <test>", a `nav` "Unde ești"; the last step is the page itself, not a link). `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă and Corectare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8, spec 2026-11-14: the box at its top in `ResultsAccess.tsx`, grey with "Publică toate rezultatele" while no result is published, green once students can read results (for all, or some alone), with "Oprește accesul la rezultate" (or "Publică toate rezultatele" while only some are) and the two ways students find them, numbered: their own link, kept on the phone, and the test's link for the students scanned again (its QR code, "Copiază linkul", "Descarcă codul QR", a PNG, and "Arată codul QR pe tot ecranul"); the teacher's multi-upload link is not in Rezultate; a copy the browser refuses shows the link in a field, selected and described by the line above it (`admin/CopyLink.tsx`, for both copy buttons of the panel); the students' result links in `ResultLinksTable.tsx`, with the grade right after the name (a `GradeChip`, with its points still to check beside it in an orange label), the points, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Elevii" with its count as a label (green "toate publicate" once every result is published, grey while some wait); "Raportul clasei" in `ReportCard.tsx` (spec 2026-11-14), beside the table in a wide panel (its top level with the table's, a subgrid) and above it in a narrow one (a container query on `.results-layout`): the average in its grade colour, the grades by group (`gradeGroups` of `shared/stats.ts`, counted from the uploads list: no report query), "Deschide raportul" (the panel's main button) and "CSV pentru catalog" (a quiet text button: the class report's CSV, read when pressed); the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the subject's line ("Se stabilește la corectare" until the robot finds it), the files, the students' link while the test is a draft or open), "Acțiuni" at the top right of the page (`TestMenu.tsx`, spec 2026-11-15 §1, drawn by `ActionsMenu.tsx` like "Alte acțiuni" of the paper page: "Redenumește testul" (the class page's `RenameDialog`), "Alege materia" or "Schimbă materia" (the seven subjects of `SubjectForm.tsx` in a dialog, with a line when the list is made again and the papers graded again; off while the robot reads the test, its description saying when the subject can change), "Arhivează testul" for a done test (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`) or "Scoate din arhivă", and "Șterge testul" (red, asking with `window.confirm`); each item's description says what it does; on a phone the menu hangs from the whole head), the overview of Verificare (`ReviewOverview.tsx`: the graded papers that had points, counted with `flagCount` and `checkedCount`; "<checked> din <total> verificate", its bar, "Mai sunt …" and the orange "Începe verificarea" (nothing checked yet) or "Continuă verificarea" into the paper page at the first point left; "De verificat", a label per student with points left ("<checked>/<total>", opening that student's first point), and "Gata", a label per student done (opening the paper with all its exercises); once all is checked a green box with "Mergi la Rezultate" (the panel then leaves out "Următoarea etapă"), and "Nimic de verificat." when no graded paper had a point; CES as the other tables show it (`ces` or `variant === 'ces'`), in the label's accessible name too; no papers table and no list of the points: the paper page decides them), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page learns the answer from the version check of the shell), the uploads table (`UploadsTable.tsx`, the full width of its card; the grade right after the name, a `GradeChip.tsx`: the grade in a soft chip of the class report's colours, `.points-N` of `pointsLevel(grade, 10)`; "De verificat" in an orange label; both papers tables are drawn like the points table of Verificare, with no bold: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off; a student who sent nothing is "Nu a trimis" while the uploads are open and "Nu a participat" after; after, an upload left open with files is "Așteaptă corectarea" and one with no file "Nu a participat"), "Recorectează tot"). `pages/PaperPage.tsx` and `paperPage/` are the paper page (spec `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md` §4, `/teste/:code/elevi/:submissionId`): the path (`Crumbs`), the head (`PaperHead.tsx`: `.submission-head`, the name, the test, the state and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right; then the result link row; `usePaperActions` holds Recorectează, Resetează and Reîncearcă and the news after them), the switch "Toate exercițiile" / "Doar de verificat (N)" (N the points of the whole test; the view is in the address, `vedere=verificare`, and stays when she moves), then the moves, small and on one row also on a phone: "‹ Punct 3/47 ›" (a group "Punctele de verificat", only with the points to check, never with all the exercises: the arrows are "Punctul anterior" and "Următorul punct", both alike, with the key in their tooltip, and between them the open point's place among the points J and K walk), "‹ Elev 2/7 ›" (a group "Elevii", "Elevul anterior" and "Elevul următor", and between them the student's place in the list; they go round, the last to the first, but after a decision on the last student the focus goes to the exercises, not to "Elevul următor") and "Lucrarea" (a picture icon, pressed while the paper shows, which hides it or shows it again), then three columns: "Elevii" (`StudentList.tsx`: every upload with a paper, the grade, the points to check in orange or the state; only the points to check: the papers with points first; a name opens that paper at the top of the window; it folds to a strip, kept in this browser as `quickeval:paperStudentsFolded`), the exercises (`GradedResult` with `check`: a click on a row or its "Arată pe lucrare" opens it, `?punct=<item id>` or `pagini`, and a second click on the open row closes it, after `CLOSE_DELAY` (300 ms), so the first click of a double or triple click, which selects a word to copy, never closes it (a click that ends a selection of the row's text does nothing); a row to check stays open when a click opens another row (`keptKeys`, kept in `Paper` until the teacher closes or checks it, none for another paper; only a click on a row, its "Verifică" or its "Arată pe lucrare" keeps it, `paperKeep` in the navigation state, never J, K or the buttons), so the rows under it never move: its decision stays in place, dimmed, `inert` and `aria-hidden` (`DecisionSlot`), and a click on its row or its "Verifică" opens it again; the A key and the focus after a decision reach only the open row's slot (`.decision-slot.is-current`); "Doar de verificat" keeps only the rows to check and the open one, without the texts for the student; a row to check is calm: its points in a soft orange label (`.points-pill`) and one "Verifică" icon button that opens it (an orange magnifier with a check, like the pencil, its word in its name and tooltip), with no reason in the row; the open row to check shows `PointDecision.tsx` under it, region "Decizia", in a box with a light orange border: the robot's reason, "Accept <points>" (the robot's points), the stepper (− and + move by 0,5 on the 0,05 steps, between 0 and the maximum; any value in steps of 0,05 can be typed) and "Salvează", and what the grade becomes with another value; for the pages, the reason and "Am verificat paginile"; while a decision shows, the bar names the keys between the switch and the moves, only when the whole line fits there (`.review-keys`: a one-line wrapping box whose line wraps out of sight)), and the paper (`reviewPage/ReviewPhoto.tsx`, staying in view and level with the other two columns; its × button ("Ascunde lucrarea", top right) hides it, the exercises taking its room, and the focus goes to "Lucrarea" in the bar; the choice is kept in this browser as `quickeval:paperPhotoFolded`; a graded paper with nothing left to check opens with it hidden (chosen when the paper opens, from its upload row), and its toggles there are not saved; graded again, it shows as the saved choice says; while it is folded, 1–9 do nothing and the bar does not name them, and "Arată pe lucrare" shows it again (an open row stays open): each page with "2/3" beside the name and its file's name and size, as the student sent it; over the photo, a floating bar on the top left holds "Arată chenarul" (an orange dashed-frame toggle, while the open answer has an area) and "Toată pagina" (off while the page is whole), and the zoom's − and + float alone on the top right; a photo zooms inside the pane (a left click, a right click and the two buttons over the photo take one small step, out and in; two fingers pinch on a touch screen, and the wheel scrolls the page), a line over the page says what a click does until she zooms, in the words of the pointer at hand (a phone has no right button), and the open exercise draws an orange border around the robot's area of its answer, on the whole page, because the page never zooms by itself; the border's arrows step through the parts of an answer, each part opening on its page, whole). The exercises get three fifths of the room the students leave, the paper two; below 1200px the students go under the exercises, and below 900px one column: the exercises, the paper, the students. `paperPage/paths.ts` writes the addresses (replaced, never a new step in the history) and picks the students' order and the points J and K walk: every point of the test while only the points to check show, else the open student's. `reviewPage/points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first) and steps between them. The old address of the review, `/teste/:code/verificare?lucrare=&punct=`, opens the page with only the points to check (`ReviewRedirect`: the named paper and point, else `firstSpot()`, else the test's Verificare); every link to the points to check uses it (`reviewPath`). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point: with only the points to check, also on the next student; with all the exercises, the next point of the same student, and when none is left the row stays open and "Elevul următor" takes the focus. It moves only if the teacher is still at the decided point (a call-level `onSuccess` of `mutate`, which does not run once the page is gone). The shell draws the page anew for another address path (`ErrorBoundary key={location.pathname}`), so where the focus goes after a decision rides in the navigation state (`paperFocus`), given once per address. A new address path opens at the top of the window (`Layout.tsx`, a PUSH only): a replaced one (the paper page's moves) keeps its place, and Back or Forward leave it to the browser. A refused decision reads the paper and the test again. The papers the teacher can move to next (the next and the previous student, the next point's paper) are read ahead, so another student's page shows at once; while a paper loads, its place keeps a screen's height. A paper with no result now (uploading, sent, graded again) shows its pages and why (`submissionPage/waitingText.ts`), a failed one "Reîncearcă"; when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A (presses "Accept" of an open row to check), J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). "Alte acțiuni" (`ActionsMenu.tsx`, on `useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. Points are never bold. Without the paper page (no page uses that plain list now), an exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds "Verifică" or "Arată pe lucrare" (paper page only) and the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, its font (Roboto) drops without a sign every character it lacks, so `pdfSymbols.ts` writes those signs as words (∧ și, ∀ oricare ar fi, ⋮ divizibil cu) and `pdfMath.ts` draws a negated letter p̄ with a line over it, A_p with a subscript and σᵏ with a raised letter (pdfmake runs), `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

- [ ] **Step 45: Edit `src/AGENTS.md`**

Find this block:

```markdown
- The paper page is drawn anew for another student: after a move to another paper, its tests find the decision again through `screen`, not through an element found before the move. `PaperPage.test.tsx` covers the head, the states and the corrections; `PaperCheck.test.tsx` the points to check, the switch, the keys, the zoom and the borders. `reviewPointsOf()` in `test/fakeApi.ts` makes an upload row's `reviewPoints` from a fake evaluation, and the fake API keeps them in step after every correction.
- The test page draws only the panel of the chosen stage. Its page tests open a stage by its address (`/teste/6E2-26T1#corectare`) or by its link in the list of stages (`openStage()` in `TestPage.test.tsx`). Without an address the page opens on the current stage of `stagesOf()`: fake data with no test file opens on Pregătire, an open test with its files on În clasă, a done test with points to check on Verificare, a done test with none on Rezultate (which has the links table, not the papers table: a test of the papers table opens `#corectare`). Fișa testului is a region beside every panel: its students' link, its "Copiază linkul" and its buttons are found from any stage.
```

Replace it with:

```markdown
- The paper page is drawn anew for another student: after a move to another paper, its tests find the decision again through `screen`, not through an element found before the move. `PaperPage.test.tsx` covers the head, the states and the corrections; `PaperCheck.test.tsx` the points to check, the switch, the keys, the zoom and the borders. `reviewPointsOf()` in `test/fakeApi.ts` makes an upload row's `reviewPoints` from a fake evaluation, and the fake API keeps them in step after every correction.
- The test page draws only the panel of the chosen stage. Its page tests open a stage by its address (`/teste/6E2-26T1#corectare`) or by its link in the list of stages (`openStage()` in `TestPage.test.tsx`). Without an address the page opens on the current stage of `stagesOf()`: fake data with no test file opens on Pregătire, an open test with its files on În clasă, a done test with points to check on Verificare, a done test with none on Rezultate (which has the links table, not the papers table: a test of the papers table opens `#corectare`). Fișa testului is a region beside every panel: its students' link and its "Copiază linkul" are found from any stage; the test's actions are in "Acțiuni" (`chooseAction()` in `TestPage.test.tsx`).
```

- [ ] **Step 46: Run the typecheck and the whole suite**

Run: `npm run typecheck`
Expected: no output after the command line (exit code 0).

Run: `npm test`
Expected: `Test Files  182 passed | 1 skipped (183)`, `Tests  2808 passed | 3 skipped (2811)`.

- [ ] **Step 47: Commit**

```bash
git add src/admin/ActionsMenu.tsx src/admin/testPage/TestMenu.tsx src/admin/paperPage/PaperHead.tsx src/admin/testPage/SubjectForm.tsx src/admin/testPage/TestSheet.tsx src/admin/pages/TestPage.tsx src/ui/brand.css src/AGENTS.md src/admin/pages/TestPage.test.tsx
git commit -m "Move the test's actions into Acțiuni at the top of the test page"
```

Run: `git diff --stat refs/protofs/fs1 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

### Task 2: Fișa testului as a short card, and the students' link in În clasă

The card shows the state, two numbers that change with it, and the plain facts; the files and the link leave it; the link goes to the top of the În clasă panel.

**Files:**
- Modify: `src/admin/testPage/TestSheet.tsx` (replaced), `src/admin/pages/TestPage.tsx`, `src/admin/testPage/StagePanel.tsx`, `src/ui/brand.css`, `src/AGENTS.md`, `docs/superpowers/specs/2026-11-15-fisa-testului-redesign-design.md`
- Test: `src/admin/pages/TestPage.test.tsx`, `src/admin/cesMarks.test.tsx`, `src/admin/Layout.test.tsx`

**Interfaces:**
- Consumes: `TestSheet({ test })` and `chooseAction()` (Task 1), `pointsLevel(points, maxPoints)` (`src/ui/format.ts`), `UploadLink({ token, qr })` and `QrOverlay` (`src/admin/testPage/UploadLink.tsx`).
- Produces: `TestSheet({ test, uploads }: { test: TestInfo; uploads: UploadRow[] })`; `export function uploadingNow(uploads: UploadRow[]): number`; `baremState` stays exported from `TestSheet.tsx`. In `TestPage.test.tsx`: `fact(name)` (the `dd` after the `dt` of that name, in Fișa testului).

- [ ] **Step 1: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
const sheet = () => screen.getByRole('region', { name: 'Fișa testului' });

```

Replace it with:

```tsx
const sheet = () => screen.getByRole('region', { name: 'Fișa testului' });

// A fact of Fișa testului, a number of its boxes included: the text after its name.
const fact = (name: string) => within(sheet()).getByText(name, { selector: 'dt' }).nextElementSibling;

```

- [ ] **Step 2: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx

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
```

Replace it with:

```tsx

  it('starts a draft test, and its link stays in În clasă', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}#in-clasa`, api);
    const panel = await screen.findByRole('region', { name: 'În clasă' });
    expect(within(panel).getByLabelText('Linkul pentru elevi')).toHaveValue(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(within(panel).getByText('Codul e pe testul tipărit. Elevii trimit lucrările după ce începi testul.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Începe testul' }));
    expect(api.startTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await within(panel).findByText('Pentru un elev fără testul tipărit.')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Linkul pentru elevi')).toHaveValue(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(within(panel).getByRole('button', { name: 'Arată codul QR pe tot ecranul' })).toBeInTheDocument();
    expect(within(sheet()).queryByLabelText('Linkul pentru elevi')).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    for (const status of ['draft', 'open'] as const) {
      const view = renderAdmin(PAGE, apiWith({ status }));
      expect(await screen.findByLabelText('Linkul pentru elevi')).toBeInTheDocument();
```

Replace it with:

```tsx
    for (const status of ['draft', 'open'] as const) {
      const view = renderAdmin(`${PAGE}#in-clasa`, apiWith({ status }));
      expect(await screen.findByLabelText('Linkul pentru elevi')).toBeInTheDocument();
```

- [ ] **Step 4: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    for (const status of ['evaluating', 'done'] as const) {
      const view = renderAdmin(PAGE, apiWith({ status }));
      await screen.findByRole('region', { name: 'Fișa testului' });
      expect(screen.queryByLabelText('Linkul pentru elevi')).not.toBeInTheDocument();
      view.unmount();
    }
  });
```

Replace it with:

```tsx
    for (const status of ['evaluating', 'done'] as const) {
      const view = renderAdmin(`${PAGE}#in-clasa`, apiWith({ status }));
      await screen.findByRole('region', { name: 'În clasă' });
      expect(screen.queryByLabelText('Linkul pentru elevi')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Arată codul QR pe tot ecranul' })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('shows no students link in a draft made before tests got their link', async () => {
    renderAdmin(`${PAGE}#in-clasa`, apiWith({ uploadToken: null }));
    await screen.findByRole('region', { name: 'În clasă' });
    expect(screen.queryByLabelText('Linkul pentru elevi')).not.toBeInTheDocument();
  });
```

- [ ] **Step 5: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(screen.getByText('Poți tipări testul de acum. Elevii încarcă lucrările după ce începi testul.')).toBeInTheDocument();
    expect(within(sheet()).getByRole('link', { name: 'Testul cu cod QR' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/print');
    await openStage('În clasă');
```

Replace it with:

```tsx
    expect(screen.getByText('Poți tipări testul de acum. Elevii încarcă lucrările după ce începi testul.')).toBeInTheDocument();
    expect(within(sheet()).queryByRole('link')).not.toBeInTheDocument();
    await openStage('În clasă');
```

- [ ] **Step 6: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    const user = userEvent.setup();
    renderAdmin(PAGE, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    await user.click(await screen.findByRole('button', { name: 'Copiază linkul' }));
```

Replace it with:

```tsx
    const user = userEvent.setup();
    renderAdmin(`${PAGE}#in-clasa`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    await user.click(await screen.findByRole('button', { name: 'Copiază linkul' }));
```

- [ ] **Step 7: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
  it('shows the QR code on the whole screen and closes it with Escape', async () => {
    renderAdmin(PAGE, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    await userEvent.click(await screen.findByRole('button', { name: 'Arată codul QR pe tot ecranul' }));
```

Replace it with:

```tsx
  it('shows the QR code on the whole screen and closes it with Escape', async () => {
    renderAdmin(`${PAGE}#in-clasa`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    await userEvent.click(await screen.findByRole('button', { name: 'Arată codul QR pe tot ecranul' }));
```

- [ ] **Step 8: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(screen.getByLabelText('Înlocuiește testul')).toBeInTheDocument();
    expect(within(sheet()).getByRole('link', { name: 'Testul' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/files/test');
  });
```

Replace it with:

```tsx
    expect(screen.getByLabelText('Înlocuiește testul')).toBeInTheDocument();
    expect(within(sheet()).queryByRole('link')).not.toBeInTheDocument();
  });
```

- [ ] **Step 9: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(screen.getByRole('button', { name: 'Oprește testul' })).toBeInTheDocument();
    const empty = screen.getByRole('heading', { name: 'Nicio lucrare trimisă încă' }).parentElement!;
    const show = within(empty).getByRole('button', { name: 'Arată codul QR pe tot ecranul' });
    await userEvent.click(show);
```

Replace it with:

```tsx
    expect(screen.getByRole('button', { name: 'Oprește testul' })).toBeInTheDocument();
    const show = within(screen.getByRole('region', { name: 'În clasă' })).getByRole('button', { name: 'Arată codul QR pe tot ecranul' });
    await userEvent.click(show);
```

- [ ] **Step 10: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    renderAdmin(`${PAGE}#in-clasa`, api);
    const empty = (await screen.findByRole('heading', { name: 'Nicio lucrare trimisă încă' })).parentElement!;
    await userEvent.click(within(empty).getByRole('button', { name: 'Arată codul QR pe tot ecranul' }));
    expect(await screen.findByRole('dialog', { name: 'Codul QR pentru elevi' })).toBeInTheDocument();
```

Replace it with:

```tsx
    renderAdmin(`${PAGE}#in-clasa`, api);
    await screen.findByRole('heading', { name: 'Nicio lucrare trimisă încă' });
    const show = screen.getByRole('button', { name: 'Arată codul QR pe tot ecranul' });
    await userEvent.click(show);
    expect(await screen.findByRole('dialog', { name: 'Codul QR pentru elevi' })).toBeInTheDocument();
```

- [ ] **Step 11: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Închide' }));
    expect(screen.getByRole('heading', { level: 2, name: 'În clasă' })).toHaveFocus();
    vi.useRealTimers();
```

Replace it with:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Închide' }));
    expect(show).toHaveFocus();
    vi.useRealTimers();
```

- [ ] **Step 12: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(api.setTestArchived).toHaveBeenCalledWith('6E2-26T1', true);
    expect(await within(sheet()).findByText('Arhivat')).toBeInTheDocument();
    expect(await actionNames()).toEqual(['Redenumește testul', 'Alege materia', 'Scoate din arhivă', 'Șterge testul']);
```

Replace it with:

```tsx
    expect(api.setTestArchived).toHaveBeenCalledWith('6E2-26T1', true);
    expect(await within(sheet()).findByText('Arhivat')).toHaveClass('tag');
    expect(await actionNames()).toEqual(['Redenumește testul', 'Alege materia', 'Scoate din arhivă', 'Șterge testul']);
```

- [ ] **Step 13: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx

  it('shows the facts and files of the test in Fișa testului', async () => {
    const rows = [
```

Replace it with:

```tsx

  it('shows in Fișa testului the state, who sent a paper, the average in its grade colour, and the facts', async () => {
    const rows = [
```

- [ ] **Step 14: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
    ];
    const test = fakeTest(
```

Replace it with:

```tsx
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
      fakeUpload({ studentId: 13, studentName: 'Ene Ana' }),
    ];
    const test = fakeTest(
```

- [ ] **Step 15: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
        print: { status: 'ready', fromWord: false },
      },
```

Replace it with:

```tsx
        print: { status: 'ready', fromWord: false },
        subject: { value: 'fizica', name: '', by: 'robot' },
      },
```

- [ ] **Step 16: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
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
```

Replace it with:

```tsx
    const card = await screen.findByRole('region', { name: 'Fișa testului' });
    expect(within(card).getByText('Corectat')).toHaveClass('status', 'status-done');
    expect(fact('Au trimis')).toHaveTextContent('2 din 4');
    expect(fact('Au trimis')!.querySelector('.sheet-bar > span')).toHaveStyle({ width: '50%' });
    expect(fact('Media testului')).toHaveTextContent('8,5');
    expect(fact('Media testului')).toHaveClass('points-4');
    expect(fact('Clasa')).toHaveTextContent('Clasa 6E2 · 4 elevi');
    expect(fact('Codul')).toHaveTextContent('6E2-26T1');
    expect(fact('Materia')).toHaveTextContent('Fizică');
    expect(fact('Început')).toHaveTextContent('6 oct. 2026, 10:15');
    expect(within(card).getAllByText(/./, { selector: 'dt' }).map((term) => term.textContent)).toEqual([
      'Au trimis',
      'Media testului',
      'Clasa',
      'Codul',
      'Materia',
      'Început',
    ]);
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
    expect(within(card).queryByText('Arhivat')).not.toBeInTheDocument();
  });

  it('shows in Fișa testului the students and the barem of a draft, and no start yet', async () => {
    renderAdmin(PAGE, apiWith());
    const card = await screen.findByRole('region', { name: 'Fișa testului' });
    expect(within(card).getByText('Ciornă')).toBeInTheDocument();
    expect(fact('Elevi')).toHaveTextContent('3');
    expect(fact('Baremul')).toHaveTextContent('lipsește');
    expect(within(card).queryByText('Au trimis')).not.toBeInTheDocument();
    expect(within(card).queryByText('Început')).not.toBeInTheDocument();
    expect(fact('Materia')).toHaveTextContent('Se stabilește la corectare');
    expect(screen.getByText(/3 elevi · ciornă/)).toBeInTheDocument();
  });

  it('shows in Fișa testului who sent a paper and who is sending one now, while the test is open', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 3 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan', submissionId: 7, status: 'uploading', fileCount: 0 }),
      fakeUpload({ studentId: 13, studentName: 'Ene Ana' }),
    ];
    const test = fakeTest({ status: 'open', startedAt: '2026-10-06T07:15:00.000Z' }, rows);
    renderAdmin(PAGE, createFakeApi({ classes: [], students: {}, tests: [test] }));
    await screen.findByRole('region', { name: 'Fișa testului' });
    // Pop Ion sent, Stan Eva sends a file now; Marin Dan started with no file yet.
    expect(fact('Au trimis')).toHaveTextContent('1 din 4');
    expect(fact('Încarcă acum')).toHaveTextContent('1');
    expect(within(sheet()).queryByText('Media testului')).not.toBeInTheDocument();
  });

  it('counts the graded papers in Fișa testului until the test has an average', async () => {
    // The fake API makes the average from the graded papers: none is graded yet.
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'grading', fileCount: 2 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'submitted', fileCount: 1 }),
    ];
    const test = fakeTest({ status: 'evaluating', startedAt: '2026-10-06T07:15:00.000Z' }, rows);
    renderAdmin(PAGE, createFakeApi({ classes: [], students: {}, tests: [test] }));
    await screen.findByRole('region', { name: 'Fișa testului' });
    expect(fact('Corectate')).toHaveTextContent('0 din 2');
    expect(within(sheet()).queryByText('Media testului')).not.toBeInTheDocument();
  });

  it('shows no part of a bar when no student is in the class', async () => {
    const test = fakeTest({ status: 'open', startedAt: '2026-10-06T07:15:00.000Z' }, []);
    renderAdmin(PAGE, createFakeApi({ classes: [], students: {}, tests: [test] }));
    await screen.findByRole('region', { name: 'Fișa testului' });
    expect(fact('Au trimis')).toHaveTextContent('0 din 0');
    expect(fact('Au trimis')!.querySelector('.sheet-bar > span')).toHaveStyle({ width: '0%' });
  });
```

- [ ] **Step 17: Edit `src/admin/cesMarks.test.tsx`**

Find this block:

```tsx
// The CES mark in the teacher's other lists of students (spec: CES variant),
// and the CES files in Fișa testului.

```

Replace it with:

```tsx
// The CES mark in the teacher's other lists of students (spec: CES variant),
// and the CES files in Pregătire, not in Fișa testului.

```

- [ ] **Step 18: Edit `src/admin/cesMarks.test.tsx`**

Find this block:

```tsx

describe('Fișa testului', () => {
  it('lists the CES files and the CES print PDF', async () => {
    const file = { name: 'Test adaptat.pdf', type: PDF_TYPE };
```

Replace it with:

```tsx

describe('the CES files', () => {
  it('are in Pregătire, not in Fișa testului', async () => {
    const file = { name: 'Test adaptat.pdf', type: PDF_TYPE };
```

- [ ] **Step 19: Edit `src/admin/cesMarks.test.tsx`**

Find this block:

```tsx
    });
    renderAdmin('/teste/6E2-26T1', createFakeApi({ classes: [], students: {}, tests: [test] }));
    const sheet = within(await screen.findByRole('region', { name: 'Fișa testului' }));
    expect(sheet.getByRole('link', { name: 'Testul CES' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/ces/files/test');
    expect(sheet.getByRole('link', { name: 'Baremul CES' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/ces/files/barem');
    expect(sheet.getByRole('link', { name: 'Testul CES cu cod QR' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/ces/print');
  });

  it('lists no CES file without a CES variant', async () => {
    renderAdmin('/teste/6E2-26T1', createFakeApi({ classes: [], students: {}, tests: [fakeTest()] }));
    const sheet = within(await screen.findByRole('region', { name: 'Fișa testului' }));
    expect(sheet.queryByRole('link', { name: /CES/ })).not.toBeInTheDocument();
  });
```

Replace it with:

```tsx
    });
    renderAdmin('/teste/6E2-26T1#pregatire', createFakeApi({ classes: [], students: {}, tests: [test] }));
    const panel = within(await screen.findByRole('region', { name: 'Pregătire' }));
    expect(panel.getByRole('link', { name: 'Test adaptat.pdf' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/ces/files/test');
    expect(panel.getByRole('link', { name: 'Barem adaptat.pdf' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/ces/files/barem');
    expect(within(screen.getByRole('region', { name: 'Fișa testului' })).queryByRole('link')).not.toBeInTheDocument();
  });
```

- [ ] **Step 20: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
  it('closes only the QR view on Esc when a panel is open too', async () => {
    renderAdmin('/teste/6E2-26T2', withClasses());
    const bar = await menu();
```

Replace it with:

```tsx
  it('closes only the QR view on Esc when a panel is open too', async () => {
    renderAdmin('/teste/6E2-26T2#in-clasa', withClasses());
    const bar = await menu();
```

- [ ] **Step 21: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/TestPage.test.tsx src/admin/cesMarks.test.tsx src/admin/Layout.test.tsx`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  11 failed | 178 passed (189)`: the card has no grey numbers yet (`Unable to find an element with the text: Elevi, which matches selector 'dt'`, the same for `Încarcă acum` and `Corectate`, and `expect(received).toHaveStyle()` for the bars); the card still has its file links (`Found multiple elements with the role "link"`, `expect(element).not.toBeInTheDocument()`); the students' link is not in În clasă (`Unable to find a label with the text of: Linkul pentru elevi`); and the full-screen QR button shows twice (`Found multiple elements with the role "button" and name "Arată codul QR pe tot ecranul"`, also in `Layout.test.tsx`). The other tests of the three files pass.

- [ ] **Step 22: Replace `src/admin/testPage/TestSheet.tsx`**

```tsx
import { useId, type ReactNode } from 'react';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatDateTime, pointsLevel, studentCountLabel } from '../../ui/format.ts';
import { StatusChip } from '../StatusChip.tsx';
import { subjectLine } from './SubjectForm.tsx';

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

// The students sending their papers now: an upload with files, not sent yet.
export function uploadingNow(uploads: UploadRow[]): number {
  return uploads.filter((row) => row.status === 'uploading' && row.fileCount > 0).length;
}

// "Fișa testului" (spec 2026-11-15 §2): the state, two numbers that change with
// the state of the test, and the plain facts. It shows beside every stage; the
// files are in Pregătire and Tipărire, the students' link in În clasă, the
// test's actions in "Acțiuni" (`TestMenu.tsx`).
export function TestSheet({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }) {
  const id = useId();
  const sent = (
    <Tile label="Au trimis" of={test.studentCount} bar>
      {test.submittedCount}
    </Tile>
  );
  let tiles: ReactNode;
  if (test.status === 'draft') {
    tiles = (
      <>
        <Tile label="Elevi">{test.studentCount}</Tile>
        <Tile label="Baremul">{baremState(test)}</Tile>
      </>
    );
  } else if (test.status === 'open') {
    tiles = (
      <>
        {sent}
        <Tile label="Încarcă acum">{uploadingNow(uploads)}</Tile>
      </>
    );
  } else {
    tiles = (
      <>
        {sent}
        {test.averageGrade !== null ? (
          <Tile label="Media testului" level={pointsLevel(test.averageGrade, 10)}>
            {formatPoints(test.averageGrade)}
          </Tile>
        ) : (
          <Tile label="Corectate" of={test.submittedCount}>
            {test.gradedCount}
          </Tile>
        )}
      </>
    );
  }

  return (
    <section className="test-sheet" aria-labelledby={id}>
      <div className="sheet-head">
        <h2 id={id}>Fișa testului</h2>
        <span className="sheet-tags">
          <StatusChip status={test.status} />
          {test.archived && <span className="tag">Arhivat</span>}
        </span>
      </div>
      <dl className="sheet-tiles">{tiles}</dl>
      <dl className="sheet-facts">
        <dt>Clasa</dt>
        <dd>
          {displayClassName(test.className)} · {studentCountLabel(test.studentCount)}
        </dd>
        <dt>Codul</dt>
        <dd>{test.code}</dd>
        <dt>Materia</dt>
        <dd>{subjectLine(test)}</dd>
        {test.startedAt && (
          <>
            <dt>Început</dt>
            <dd>{formatDateTime(test.startedAt)}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

// One number of the card in its grey box: the label, the value, and with `of`
// the whole it is part of ("18 din 23"), with `bar` a bar of that part. With
// `level`, the value takes the colour of a grade (`.points-N`).
function Tile({ label, of, bar, level, children }: { label: string; of?: number; bar?: boolean; level?: number; children: ReactNode }) {
  const part = typeof children === 'number' ? children : 0;
  const share = of !== undefined && of > 0 ? Math.min(100, Math.round((part / of) * 100)) : 0;
  return (
    <div className="sheet-tile">
      <dt>{label}</dt>
      <dd className={level === undefined ? undefined : `points-${level}`}>
        {children}
        {of !== undefined && <span className="sheet-of"> din {of}</span>}
        {bar && (
          <span className="sheet-bar" aria-hidden="true">
            <span style={{ width: `${share}%` }} />
          </span>
        )}
      </dd>
    </div>
  );
}
```

- [ ] **Step 23: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx
        />
        <TestSheet test={test} />
      </div>
```

Replace it with:

```tsx
        />
        <TestSheet test={test} uploads={uploads} />
      </div>
```

- [ ] **Step 24: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
import { PapersProgress } from './PapersProgress.tsx';
import { MultiUploadLink, QrOverlay, uploadLink } from './UploadLink.tsx';
import { UploadsTable } from './UploadsTable.tsx';
```

Replace it with:

```tsx
import { PapersProgress } from './PapersProgress.tsx';
import { MultiUploadLink, QrOverlay, UploadLink, uploadLink } from './UploadLink.tsx';
import { UploadsTable } from './UploadsTable.tsx';
```

- [ ] **Step 25: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
  const nothingYet = test.status === 'open' && uploads.every((row) => row.submissionId === null);
  // The QR code on the whole screen belongs to the panel: it stays open when
  // the first paper turns the empty state into the table. Closing it gives the
  // focus back to its button, or to the panel's heading once the button is gone.
  const [fullScreen, setFullScreen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const token = test.uploadToken;
  return (
```

Replace it with:

```tsx
  const nothingYet = test.status === 'open' && uploads.every((row) => row.submissionId === null);
  // The students' link, while they may still need it (spec 2026-11-15 §4):
  // the printed QR code is the usual way in, the link is for a student without
  // the printed test. Its QR code on the whole screen belongs to the panel: it
  // stays open when the first paper turns the empty state into the table, and
  // closing it gives the focus back to its button.
  const [fullScreen, setFullScreen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const token = (test.status === 'draft' || test.status === 'open') && test.uploadToken !== null ? test.uploadToken : null;
  return (
```

- [ ] **Step 26: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
      <TestActions {...props} />
      {test.status === 'open' && <MultiUploadLink code={test.code} token={test.multiUploadToken} onChanged={onChanged} />}
      {nothingYet ? (
        <EmptyState
          icon={<IconQr />}
          title="Nicio lucrare trimisă încă"
          action={
            token ? (
              <button ref={button} type="button" className="button-quiet button-small" onClick={() => setFullScreen(true)}>
                Arată codul QR pe tot ecranul
              </button>
            ) : undefined
          }
        >
          Elevii scanează codul QR de pe test și trimit pozele. Lucrările apar aici pe măsură ce vin.
```

Replace it with:

```tsx
      <TestActions {...props} />
      {token !== null && (
        <div className="class-link">
          <UploadLink token={token} qr={false} />
          <p>
            <button ref={button} type="button" className="button-quiet button-small" onClick={() => setFullScreen(true)}>
              Arată codul QR pe tot ecranul
            </button>
          </p>
          <p className="hint">
            {test.status === 'draft'
              ? 'Codul e pe testul tipărit. Elevii trimit lucrările după ce începi testul.'
              : 'Pentru un elev fără testul tipărit.'}
          </p>
        </div>
      )}
      {test.status === 'open' && <MultiUploadLink code={test.code} token={test.multiUploadToken} onChanged={onChanged} />}
      {nothingYet ? (
        <EmptyState icon={<IconQr />} title="Nicio lucrare trimisă încă">
          Elevii scanează codul QR de pe test și trimit pozele. Lucrările apar aici pe măsură ce vin.
```

- [ ] **Step 27: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
      )}
      {fullScreen && token && (
        <QrOverlay
```

Replace it with:

```tsx
      )}
      {fullScreen && token !== null && (
        <QrOverlay
```

- [ ] **Step 28: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
            setFullScreen(false);
            (button.current ?? document.querySelector<HTMLElement>('.stage-head h2'))?.focus();
          }}
```

Replace it with:

```tsx
            setFullScreen(false);
            button.current?.focus();
          }}
```

- [ ] **Step 29: Edit `src/ui/brand.css`**

Find this block:

```css
  margin: 0;
  padding: 1rem 1.25rem 0.25rem;
  font-size: 1rem;
```

Replace it with:

```css
  margin: 0;
  font-size: 1rem;
```

- [ ] **Step 30: Edit `src/ui/brand.css`**

Find this block:

```css

.sheet-facts {
```

Replace it with:

```css

/* The head: the name, then the state chip (and "Arhivat") on the right. */
.sheet-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 1rem 1.25rem 0.5rem;
}

.sheet-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

/* Two numbers in grey boxes (spec 2026-11-15 §2): the label, the value in
   500 weight, its whole muted ("din 23"), and a bar under "Au trimis". */
.sheet-tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  margin: 0;
  padding: 0.25rem 1.25rem 0.75rem;
}

.sheet-tile {
  display: grid;
  align-content: start;
  gap: 0.15rem;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  background: var(--raised);
}

.sheet-tile dt {
  color: var(--muted);
  font-size: 0.8125rem;
}

.sheet-tile dd {
  margin: 0;
  font-size: 1.375rem;
  font-weight: 500;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.sheet-of {
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 400;
}

.sheet-bar {
  display: block;
  height: 4px;
  margin-top: 0.35rem;
  overflow: hidden;
  border-radius: 2px;
  background: var(--line);
}

.sheet-bar > span {
  display: block;
  height: 100%;
  background: var(--ink);
}

/* The plain facts, with no bold, under a line. */
.sheet-facts {
```

- [ ] **Step 31: Edit `src/ui/brand.css`**

Find this block:

```css
  margin: 0;
  padding: 0.5rem 1.25rem 1rem;
}
```

Replace it with:

```css
  margin: 0;
  padding: 0.75rem 1.25rem 1rem;
  border-top: 1px solid var(--line);
}
```

- [ ] **Step 32: Edit `src/ui/brand.css`**

Find this block:

```css
  margin: 0;
  font-weight: 600;
  text-align: right;
```

Replace it with:

```css
  margin: 0;
  text-align: right;
```

- [ ] **Step 33: Edit `src/ui/brand.css`**

Find this block:

```css

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
```

Replace it with:

```css

/* The students' link in În clasă (spec 2026-11-15 §4). */
.class-link {
  display: grid;
  gap: 0.5rem;
}

.class-link > p {
  margin: 0;
```

- [ ] **Step 34: Edit `src/ui/brand.css`**

Find this block:

```css

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
```

Replace it with:

```css

.class-link .upload-link label {
  font-weight: 600;
}
```

- [ ] **Step 35: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1), (x + 1)/3, a negated letter p̄ (a combining bar, which the font draws beside the letter, so the page draws it) and a subscript A_p or A_(p∧q), and leaves intervals, words such as și/sau and names such as x_max as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen (Rezultate is the one screen with two, each the main action of its own box: "Publică toate rezultatele" and "Deschide raportul"), filled orange (`.button button-wait`) for the one main action of a screen whose work waits on the teacher ("Începe verificarea" in Verificare), and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `Crumbs.tsx` is the path at the top of the test page and of the paper page ("Teste › Clasa 7E2 › <test>", a `nav` "Unde ești"; the last step is the page itself, not a link). `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă and Corectare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8, spec 2026-11-14: the box at its top in `ResultsAccess.tsx`, grey with "Publică toate rezultatele" while no result is published, green once students can read results (for all, or some alone), with "Oprește accesul la rezultate" (or "Publică toate rezultatele" while only some are) and the two ways students find them, numbered: their own link, kept on the phone, and the test's link for the students scanned again (its QR code, "Copiază linkul", "Descarcă codul QR", a PNG, and "Arată codul QR pe tot ecranul"); the teacher's multi-upload link is not in Rezultate; a copy the browser refuses shows the link in a field, selected and described by the line above it (`admin/CopyLink.tsx`, for both copy buttons of the panel); the students' result links in `ResultLinksTable.tsx`, with the grade right after the name (a `GradeChip`, with its points still to check beside it in an orange label), the points, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Elevii" with its count as a label (green "toate publicate" once every result is published, grey while some wait); "Raportul clasei" in `ReportCard.tsx` (spec 2026-11-14), beside the table in a wide panel (its top level with the table's, a subgrid) and above it in a narrow one (a container query on `.results-layout`): the average in its grade colour, the grades by group (`gradeGroups` of `shared/stats.ts`, counted from the uploads list: no report query), "Deschide raportul" (the panel's main button) and "CSV pentru catalog" (a quiet text button: the class report's CSV, read when pressed); the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the subject's line ("Se stabilește la corectare" until the robot finds it), the files, the students' link while the test is a draft or open), "Acțiuni" at the top right of the page (`TestMenu.tsx`, spec 2026-11-15 §1, drawn by `ActionsMenu.tsx` like "Alte acțiuni" of the paper page: "Redenumește testul" (the class page's `RenameDialog`), "Alege materia" or "Schimbă materia" (the seven subjects of `SubjectForm.tsx` in a dialog, with a line when the list is made again and the papers graded again; off while the robot reads the test, its description saying when the subject can change), "Arhivează testul" for a done test (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`) or "Scoate din arhivă", and "Șterge testul" (red, asking with `window.confirm`); each item's description says what it does; on a phone the menu hangs from the whole head), the overview of Verificare (`ReviewOverview.tsx`: the graded papers that had points, counted with `flagCount` and `checkedCount`; "<checked> din <total> verificate", its bar, "Mai sunt …" and the orange "Începe verificarea" (nothing checked yet) or "Continuă verificarea" into the paper page at the first point left; "De verificat", a label per student with points left ("<checked>/<total>", opening that student's first point), and "Gata", a label per student done (opening the paper with all its exercises); once all is checked a green box with "Mergi la Rezultate" (the panel then leaves out "Următoarea etapă"), and "Nimic de verificat." when no graded paper had a point; CES as the other tables show it (`ces` or `variant === 'ces'`), in the label's accessible name too; no papers table and no list of the points: the paper page decides them), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page learns the answer from the version check of the shell), the uploads table (`UploadsTable.tsx`, the full width of its card; the grade right after the name, a `GradeChip.tsx`: the grade in a soft chip of the class report's colours, `.points-N` of `pointsLevel(grade, 10)`; "De verificat" in an orange label; both papers tables are drawn like the points table of Verificare, with no bold: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off; a student who sent nothing is "Nu a trimis" while the uploads are open and "Nu a participat" after; after, an upload left open with files is "Așteaptă corectarea" and one with no file "Nu a participat"), "Recorectează tot"). `pages/PaperPage.tsx` and `paperPage/` are the paper page (spec `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md` §4, `/teste/:code/elevi/:submissionId`): the path (`Crumbs`), the head (`PaperHead.tsx`: `.submission-head`, the name, the test, the state and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right; then the result link row; `usePaperActions` holds Recorectează, Resetează and Reîncearcă and the news after them), the switch "Toate exercițiile" / "Doar de verificat (N)" (N the points of the whole test; the view is in the address, `vedere=verificare`, and stays when she moves), then the moves, small and on one row also on a phone: "‹ Punct 3/47 ›" (a group "Punctele de verificat", only with the points to check, never with all the exercises: the arrows are "Punctul anterior" and "Următorul punct", both alike, with the key in their tooltip, and between them the open point's place among the points J and K walk), "‹ Elev 2/7 ›" (a group "Elevii", "Elevul anterior" and "Elevul următor", and between them the student's place in the list; they go round, the last to the first, but after a decision on the last student the focus goes to the exercises, not to "Elevul următor") and "Lucrarea" (a picture icon, pressed while the paper shows, which hides it or shows it again), then three columns: "Elevii" (`StudentList.tsx`: every upload with a paper, the grade, the points to check in orange or the state; only the points to check: the papers with points first; a name opens that paper at the top of the window; it folds to a strip, kept in this browser as `quickeval:paperStudentsFolded`), the exercises (`GradedResult` with `check`: a click on a row or its "Arată pe lucrare" opens it, `?punct=<item id>` or `pagini`, and a second click on the open row closes it, after `CLOSE_DELAY` (300 ms), so the first click of a double or triple click, which selects a word to copy, never closes it (a click that ends a selection of the row's text does nothing); a row to check stays open when a click opens another row (`keptKeys`, kept in `Paper` until the teacher closes or checks it, none for another paper; only a click on a row, its "Verifică" or its "Arată pe lucrare" keeps it, `paperKeep` in the navigation state, never J, K or the buttons), so the rows under it never move: its decision stays in place, dimmed, `inert` and `aria-hidden` (`DecisionSlot`), and a click on its row or its "Verifică" opens it again; the A key and the focus after a decision reach only the open row's slot (`.decision-slot.is-current`); "Doar de verificat" keeps only the rows to check and the open one, without the texts for the student; a row to check is calm: its points in a soft orange label (`.points-pill`) and one "Verifică" icon button that opens it (an orange magnifier with a check, like the pencil, its word in its name and tooltip), with no reason in the row; the open row to check shows `PointDecision.tsx` under it, region "Decizia", in a box with a light orange border: the robot's reason, "Accept <points>" (the robot's points), the stepper (− and + move by 0,5 on the 0,05 steps, between 0 and the maximum; any value in steps of 0,05 can be typed) and "Salvează", and what the grade becomes with another value; for the pages, the reason and "Am verificat paginile"; while a decision shows, the bar names the keys between the switch and the moves, only when the whole line fits there (`.review-keys`: a one-line wrapping box whose line wraps out of sight)), and the paper (`reviewPage/ReviewPhoto.tsx`, staying in view and level with the other two columns; its × button ("Ascunde lucrarea", top right) hides it, the exercises taking its room, and the focus goes to "Lucrarea" in the bar; the choice is kept in this browser as `quickeval:paperPhotoFolded`; a graded paper with nothing left to check opens with it hidden (chosen when the paper opens, from its upload row), and its toggles there are not saved; graded again, it shows as the saved choice says; while it is folded, 1–9 do nothing and the bar does not name them, and "Arată pe lucrare" shows it again (an open row stays open): each page with "2/3" beside the name and its file's name and size, as the student sent it; over the photo, a floating bar on the top left holds "Arată chenarul" (an orange dashed-frame toggle, while the open answer has an area) and "Toată pagina" (off while the page is whole), and the zoom's − and + float alone on the top right; a photo zooms inside the pane (a left click, a right click and the two buttons over the photo take one small step, out and in; two fingers pinch on a touch screen, and the wheel scrolls the page), a line over the page says what a click does until she zooms, in the words of the pointer at hand (a phone has no right button), and the open exercise draws an orange border around the robot's area of its answer, on the whole page, because the page never zooms by itself; the border's arrows step through the parts of an answer, each part opening on its page, whole). The exercises get three fifths of the room the students leave, the paper two; below 1200px the students go under the exercises, and below 900px one column: the exercises, the paper, the students. `paperPage/paths.ts` writes the addresses (replaced, never a new step in the history) and picks the students' order and the points J and K walk: every point of the test while only the points to check show, else the open student's. `reviewPage/points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first) and steps between them. The old address of the review, `/teste/:code/verificare?lucrare=&punct=`, opens the page with only the points to check (`ReviewRedirect`: the named paper and point, else `firstSpot()`, else the test's Verificare); every link to the points to check uses it (`reviewPath`). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point: with only the points to check, also on the next student; with all the exercises, the next point of the same student, and when none is left the row stays open and "Elevul următor" takes the focus. It moves only if the teacher is still at the decided point (a call-level `onSuccess` of `mutate`, which does not run once the page is gone). The shell draws the page anew for another address path (`ErrorBoundary key={location.pathname}`), so where the focus goes after a decision rides in the navigation state (`paperFocus`), given once per address. A new address path opens at the top of the window (`Layout.tsx`, a PUSH only): a replaced one (the paper page's moves) keeps its place, and Back or Forward leave it to the browser. A refused decision reads the paper and the test again. The papers the teacher can move to next (the next and the previous student, the next point's paper) are read ahead, so another student's page shows at once; while a paper loads, its place keeps a screen's height. A paper with no result now (uploading, sent, graded again) shows its pages and why (`submissionPage/waitingText.ts`), a failed one "Reîncearcă"; when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A (presses "Accept" of an open row to check), J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). "Alte acțiuni" (`ActionsMenu.tsx`, on `useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. Points are never bold. Without the paper page (no page uses that plain list now), an exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds "Verifică" or "Arată pe lucrare" (paper page only) and the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, its font (Roboto) drops without a sign every character it lacks, so `pdfSymbols.ts` writes those signs as words (∧ și, ∀ oricare ar fi, ⋮ divizibil cu) and `pdfMath.ts` draws a negated letter p̄ with a line over it, A_p with a subscript and σᵏ with a raised letter (pdfmake runs), `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

Replace it with:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1), (x + 1)/3, a negated letter p̄ (a combining bar, which the font draws beside the letter, so the page draws it) and a subscript A_p or A_(p∧q), and leaves intervals, words such as și/sau and names such as x_max as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen (Rezultate is the one screen with two, each the main action of its own box: "Publică toate rezultatele" and "Deschide raportul"), filled orange (`.button button-wait`) for the one main action of a screen whose work waits on the teacher ("Începe verificarea" in Verificare), and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `Crumbs.tsx` is the path at the top of the test page and of the paper page ("Teste › Clasa 7E2 › <test>", a `nav` "Unde ești"; the last step is the page itself, not a link). `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă and Corectare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8, spec 2026-11-14: the box at its top in `ResultsAccess.tsx`, grey with "Publică toate rezultatele" while no result is published, green once students can read results (for all, or some alone), with "Oprește accesul la rezultate" (or "Publică toate rezultatele" while only some are) and the two ways students find them, numbered: their own link, kept on the phone, and the test's link for the students scanned again (its QR code, "Copiază linkul", "Descarcă codul QR", a PNG, and "Arată codul QR pe tot ecranul"); the teacher's multi-upload link is not in Rezultate; a copy the browser refuses shows the link in a field, selected and described by the line above it (`admin/CopyLink.tsx`, for both copy buttons of the panel); the students' result links in `ResultLinksTable.tsx`, with the grade right after the name (a `GradeChip`, with its points still to check beside it in an orange label), the points, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Elevii" with its count as a label (green "toate publicate" once every result is published, grey while some wait); "Raportul clasei" in `ReportCard.tsx` (spec 2026-11-14), beside the table in a wide panel (its top level with the table's, a subgrid) and above it in a narrow one (a container query on `.results-layout`): the average in its grade colour, the grades by group (`gradeGroups` of `shared/stats.ts`, counted from the uploads list: no report query), "Deschide raportul" (the panel's main button) and "CSV pentru catalog" (a quiet text button: the class report's CSV, read when pressed); the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`, spec 2026-11-15 §2: the state chip and "Arhivat" in its head, two numbers in grey boxes that change with the state (a draft: "Elevi" and "Baremul"; open: "Au trimis" with a bar and "Încarcă acum", the uploads with files not sent yet; after: "Au trimis" and "Media testului" in its grade colour, `.points-N`, or "Corectate" until there is an average), then the plain facts with no bold: Clasa, Codul, Materia ("Se stabilește la corectare" until the robot finds it), Început once started; no files, no link, no buttons: the files are in Pregătire and Tipărire), the students' link in În clasă while the test is a draft or open (address, "Copiază linkul", "Arată codul QR pe tot ecranul", and the line for a draft or an open test), "Acțiuni" at the top right of the page (`TestMenu.tsx`, spec 2026-11-15 §1, drawn by `ActionsMenu.tsx` like "Alte acțiuni" of the paper page: "Redenumește testul" (the class page's `RenameDialog`), "Alege materia" or "Schimbă materia" (the seven subjects of `SubjectForm.tsx` in a dialog, with a line when the list is made again and the papers graded again; off while the robot reads the test, its description saying when the subject can change), "Arhivează testul" for a done test (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`) or "Scoate din arhivă", and "Șterge testul" (red, asking with `window.confirm`); each item's description says what it does; on a phone the menu hangs from the whole head), the overview of Verificare (`ReviewOverview.tsx`: the graded papers that had points, counted with `flagCount` and `checkedCount`; "<checked> din <total> verificate", its bar, "Mai sunt …" and the orange "Începe verificarea" (nothing checked yet) or "Continuă verificarea" into the paper page at the first point left; "De verificat", a label per student with points left ("<checked>/<total>", opening that student's first point), and "Gata", a label per student done (opening the paper with all its exercises); once all is checked a green box with "Mergi la Rezultate" (the panel then leaves out "Următoarea etapă"), and "Nimic de verificat." when no graded paper had a point; CES as the other tables show it (`ces` or `variant === 'ces'`), in the label's accessible name too; no papers table and no list of the points: the paper page decides them), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page learns the answer from the version check of the shell), the uploads table (`UploadsTable.tsx`, the full width of its card; the grade right after the name, a `GradeChip.tsx`: the grade in a soft chip of the class report's colours, `.points-N` of `pointsLevel(grade, 10)`; "De verificat" in an orange label; both papers tables are drawn like the points table of Verificare, with no bold: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off; a student who sent nothing is "Nu a trimis" while the uploads are open and "Nu a participat" after; after, an upload left open with files is "Așteaptă corectarea" and one with no file "Nu a participat"), "Recorectează tot"). `pages/PaperPage.tsx` and `paperPage/` are the paper page (spec `docs/superpowers/specs/2026-11-12-one-page-paper-check-design.md` §4, `/teste/:code/elevi/:submissionId`): the path (`Crumbs`), the head (`PaperHead.tsx`: `.submission-head`, the name, the test, the state and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right; then the result link row; `usePaperActions` holds Recorectează, Resetează and Reîncearcă and the news after them), the switch "Toate exercițiile" / "Doar de verificat (N)" (N the points of the whole test; the view is in the address, `vedere=verificare`, and stays when she moves), then the moves, small and on one row also on a phone: "‹ Punct 3/47 ›" (a group "Punctele de verificat", only with the points to check, never with all the exercises: the arrows are "Punctul anterior" and "Următorul punct", both alike, with the key in their tooltip, and between them the open point's place among the points J and K walk), "‹ Elev 2/7 ›" (a group "Elevii", "Elevul anterior" and "Elevul următor", and between them the student's place in the list; they go round, the last to the first, but after a decision on the last student the focus goes to the exercises, not to "Elevul următor") and "Lucrarea" (a picture icon, pressed while the paper shows, which hides it or shows it again), then three columns: "Elevii" (`StudentList.tsx`: every upload with a paper, the grade, the points to check in orange or the state; only the points to check: the papers with points first; a name opens that paper at the top of the window; it folds to a strip, kept in this browser as `quickeval:paperStudentsFolded`), the exercises (`GradedResult` with `check`: a click on a row or its "Arată pe lucrare" opens it, `?punct=<item id>` or `pagini`, and a second click on the open row closes it, after `CLOSE_DELAY` (300 ms), so the first click of a double or triple click, which selects a word to copy, never closes it (a click that ends a selection of the row's text does nothing); a row to check stays open when a click opens another row (`keptKeys`, kept in `Paper` until the teacher closes or checks it, none for another paper; only a click on a row, its "Verifică" or its "Arată pe lucrare" keeps it, `paperKeep` in the navigation state, never J, K or the buttons), so the rows under it never move: its decision stays in place, dimmed, `inert` and `aria-hidden` (`DecisionSlot`), and a click on its row or its "Verifică" opens it again; the A key and the focus after a decision reach only the open row's slot (`.decision-slot.is-current`); "Doar de verificat" keeps only the rows to check and the open one, without the texts for the student; a row to check is calm: its points in a soft orange label (`.points-pill`) and one "Verifică" icon button that opens it (an orange magnifier with a check, like the pencil, its word in its name and tooltip), with no reason in the row; the open row to check shows `PointDecision.tsx` under it, region "Decizia", in a box with a light orange border: the robot's reason, "Accept <points>" (the robot's points), the stepper (− and + move by 0,5 on the 0,05 steps, between 0 and the maximum; any value in steps of 0,05 can be typed) and "Salvează", and what the grade becomes with another value; for the pages, the reason and "Am verificat paginile"; while a decision shows, the bar names the keys between the switch and the moves, only when the whole line fits there (`.review-keys`: a one-line wrapping box whose line wraps out of sight)), and the paper (`reviewPage/ReviewPhoto.tsx`, staying in view and level with the other two columns; its × button ("Ascunde lucrarea", top right) hides it, the exercises taking its room, and the focus goes to "Lucrarea" in the bar; the choice is kept in this browser as `quickeval:paperPhotoFolded`; a graded paper with nothing left to check opens with it hidden (chosen when the paper opens, from its upload row), and its toggles there are not saved; graded again, it shows as the saved choice says; while it is folded, 1–9 do nothing and the bar does not name them, and "Arată pe lucrare" shows it again (an open row stays open): each page with "2/3" beside the name and its file's name and size, as the student sent it; over the photo, a floating bar on the top left holds "Arată chenarul" (an orange dashed-frame toggle, while the open answer has an area) and "Toată pagina" (off while the page is whole), and the zoom's − and + float alone on the top right; a photo zooms inside the pane (a left click, a right click and the two buttons over the photo take one small step, out and in; two fingers pinch on a touch screen, and the wheel scrolls the page), a line over the page says what a click does until she zooms, in the words of the pointer at hand (a phone has no right button), and the open exercise draws an orange border around the robot's area of its answer, on the whole page, because the page never zooms by itself; the border's arrows step through the parts of an answer, each part opening on its page, whole). The exercises get three fifths of the room the students leave, the paper two; below 1200px the students go under the exercises, and below 900px one column: the exercises, the paper, the students. `paperPage/paths.ts` writes the addresses (replaced, never a new step in the history) and picks the students' order and the points J and K walk: every point of the test while only the points to check show, else the open student's. `reviewPage/points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first) and steps between them. The old address of the review, `/teste/:code/verificare?lucrare=&punct=`, opens the page with only the points to check (`ReviewRedirect`: the named paper and point, else `firstSpot()`, else the test's Verificare); every link to the points to check uses it (`reviewPath`). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point: with only the points to check, also on the next student; with all the exercises, the next point of the same student, and when none is left the row stays open and "Elevul următor" takes the focus. It moves only if the teacher is still at the decided point (a call-level `onSuccess` of `mutate`, which does not run once the page is gone). The shell draws the page anew for another address path (`ErrorBoundary key={location.pathname}`), so where the focus goes after a decision rides in the navigation state (`paperFocus`), given once per address. A new address path opens at the top of the window (`Layout.tsx`, a PUSH only): a replaced one (the paper page's moves) keeps its place, and Back or Forward leave it to the browser. A refused decision reads the paper and the test again. The papers the teacher can move to next (the next and the previous student, the next point's paper) are read ahead, so another student's page shows at once; while a paper loads, its place keeps a screen's height. A paper with no result now (uploading, sent, graded again) shows its pages and why (`submissionPage/waitingText.ts`), a failed one "Reîncearcă"; when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A (presses "Accept" of an open row to check), J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). "Alte acțiuni" (`ActionsMenu.tsx`, on `useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. Points are never bold. Without the paper page (no page uses that plain list now), an exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds "Verifică" or "Arată pe lucrare" (paper page only) and the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, its font (Roboto) drops without a sign every character it lacks, so `pdfSymbols.ts` writes those signs as words (∧ și, ∀ oricare ar fi, ⋮ divizibil cu) and `pdfMath.ts` draws a negated letter p̄ with a line over it, A_p with a subscript and σᵏ with a raised letter (pdfmake runs), `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

- [ ] **Step 36: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `classPage/GradesTable.tsx` is the class page's grade table, in a card (students by tests, the oldest test on the left, a 156px column per test headed by its name and "date · state", orange when the test waits; a cell shows the grade, orange with a dot when points wait, the upload's state, or "—" when no paper was sent; the last row is "Media testului", no per-student average; draft and open tests keep a column; archived tests show only when asked). `classPage/ClassTests.tsx` is "Testele clasei", beside the table (under it below 1180px): the newest test first, each with its date, the papers sent, its stage (orange when it waits) and its one next step (from `testsPage/nextStep.ts`, the button that publishes the results included; filled blue when it waits), and the toggle "Arată și testele arhivate (n)" that reveals the archived tests in the table too. `classPage/ClassStudents.tsx` is the "Elevi" tab, one card split in two (stacked below 760px): the students on the left (search that ignores case and diacritics, orange dot when points wait, "+ Adaugă elevi"), the chosen student on the right (the first one at first; "Redenumește", "A plecat din clasă", "Șterge"; a table of the class's tests with the date, the points, the grade and "N puncte de verificat", the result ("Publicat", "Nepublicat" with "Copiază linkul", "După verificare", "Nu a trimis lucrarea."), and "Lucrarea"; link "Toate notele elevului, din toate clasele"). An archived class is the same page, read only (`readOnly` on `GradesTable`, `ClassTests` and `ClassStudents`): a strip "Clasă arhivată." with "Scoate din arhivă" above the head (one write with ⋯'s item), the tag "Arhivată" first in the facts, no "Test nou pentru această clasă", no "+ Adaugă elevi", no "Redenumește", "A plecat din clasă" or "Șterge" for a student, nothing orange, and "Raportul clasei" as each test's one step once a paper is graded; the one exception is an archived test with open results, which waits there as in "De făcut" (orange, "Oprește accesul", and the class's dot in "Schimbă clasa"). `classPage/ClassDialogs.tsx` holds the class page's dialogs: "Clasă nouă" (the name and the students, one per line, in one step; a class made before its students failed is not made twice), "Adaugă elevi" (early warnings for names already in the class or pasted twice), and the rename of a class or a student. They use `Modal.tsx`, the app's dialog: a title, ×, a dimmed backdrop, the focus on the first field and kept inside, Esc (in the capture phase, before a panel), and the focus back to the opener (or to `returnFocus` when the opener closed with its menu). `pages/ClassPage.tsx` is the class page (`/clase/:id`): the top line (the name, "Schimbă clasa" with the classes of the year, the current one marked, a dot for one that waits, the archived classes last in their muted group "Arhivate" (the only list that leads to them; an archived class's ⋯ has "Scoate din arhivă"), and "+ Clasă nouă"; the facts; "Test nou pentru această clasă"; ⋯ with "Redenumește clasa"/"Arhivează clasa", which asks first through `ArchiveDialog` when a test of the class has open results) and the two tabs ("Elevi" with its count). `pages/LastClassPage.tsx` is `/clase`: it opens the last class the teacher saw (kept in `localStorage` as `quickeval:lastClass`, else the first active one of the year), or, with no active class, offers "+ Clasă nouă" and links the archived classes. A link's state (`ClassLinkState`) goes on to that class page: `{ newClass: true }` (the panel's "+ Clasă nouă") opens that dialog on arrival, `{ archived: true }` (the panel's "Arhivate (n)") opens "Schimbă clasa" at "Arhivate". The old "page with all classes" (`ClassesPage`) and `ClassStudentsPage` no longer exist.
- The CES variant: `CesTag.tsx` is the mark next to a CES student's name in every teacher table that lists students (the class page's two tabs, the papers table, the links table, the class report, the paper page's students, the search, the student page's heading); Fișa testului lists the CES files; "De făcut" (`shell/todo.ts`) also asks to check a generated CES barem, or to generate it again (`TestSummary.cesBarem`), after the class barem's case and until the test is done; `testPage/CesVariant.tsx` holds "Varianta CES" in Pregătire (shown while the class has a CES student or the variant has a file: the CES students and the switch "Test separat pentru elevii cu CES" (`CesSwitch.tsx`, also on Test nou; off asks first when there are CES files, then removes them through `setCesOff`), its own `TestFiles` with `variant="ces"` while the switch is on, the total warning, and "Șterge varianta CES" only once the class has no CES student left) and the notice of the CES papers that wait for their barem in Corectare (`CesWaiting`); `testPage/variant.ts` picks a variant's parts of a test. What a draft or open test misses (`missing.ts`) is said in the stages, in "De făcut", as orange "lipsește" (and green "gata") marks in `TestFiles`, and as `MissingList.tsx` under "Începe testul" (with why each part matters) and under "Creează testul". `TestFiles`, `useGeneratedBarem`, `PrintTest` and `ExerciseListBanner` take `variant`. The class report, its CSV and the class PDF draw the tables of `reportTables` (`shared/stats.ts`): one, or the class papers then the CES papers with their own exercises; the CSV never names CES.
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `testPage/StagePanel.tsx` (the panel În clasă) holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
```

Replace it with:

```markdown
- `classPage/GradesTable.tsx` is the class page's grade table, in a card (students by tests, the oldest test on the left, a 156px column per test headed by its name and "date · state", orange when the test waits; a cell shows the grade, orange with a dot when points wait, the upload's state, or "—" when no paper was sent; the last row is "Media testului", no per-student average; draft and open tests keep a column; archived tests show only when asked). `classPage/ClassTests.tsx` is "Testele clasei", beside the table (under it below 1180px): the newest test first, each with its date, the papers sent, its stage (orange when it waits) and its one next step (from `testsPage/nextStep.ts`, the button that publishes the results included; filled blue when it waits), and the toggle "Arată și testele arhivate (n)" that reveals the archived tests in the table too. `classPage/ClassStudents.tsx` is the "Elevi" tab, one card split in two (stacked below 760px): the students on the left (search that ignores case and diacritics, orange dot when points wait, "+ Adaugă elevi"), the chosen student on the right (the first one at first; "Redenumește", "A plecat din clasă", "Șterge"; a table of the class's tests with the date, the points, the grade and "N puncte de verificat", the result ("Publicat", "Nepublicat" with "Copiază linkul", "După verificare", "Nu a trimis lucrarea."), and "Lucrarea"; link "Toate notele elevului, din toate clasele"). An archived class is the same page, read only (`readOnly` on `GradesTable`, `ClassTests` and `ClassStudents`): a strip "Clasă arhivată." with "Scoate din arhivă" above the head (one write with ⋯'s item), the tag "Arhivată" first in the facts, no "Test nou pentru această clasă", no "+ Adaugă elevi", no "Redenumește", "A plecat din clasă" or "Șterge" for a student, nothing orange, and "Raportul clasei" as each test's one step once a paper is graded; the one exception is an archived test with open results, which waits there as in "De făcut" (orange, "Oprește accesul", and the class's dot in "Schimbă clasa"). `classPage/ClassDialogs.tsx` holds the class page's dialogs: "Clasă nouă" (the name and the students, one per line, in one step; a class made before its students failed is not made twice), "Adaugă elevi" (early warnings for names already in the class or pasted twice), and the rename of a class or a student. They use `Modal.tsx`, the app's dialog: a title, ×, a dimmed backdrop, the focus on the first field and kept inside, Esc (in the capture phase, before a panel), and the focus back to the opener (or to `returnFocus` when the opener closed with its menu). `pages/ClassPage.tsx` is the class page (`/clase/:id`): the top line (the name, "Schimbă clasa" with the classes of the year, the current one marked, a dot for one that waits, the archived classes last in their muted group "Arhivate" (the only list that leads to them; an archived class's ⋯ has "Scoate din arhivă"), and "+ Clasă nouă"; the facts; "Test nou pentru această clasă"; ⋯ with "Redenumește clasa"/"Arhivează clasa", which asks first through `ArchiveDialog` when a test of the class has open results) and the two tabs ("Elevi" with its count). `pages/LastClassPage.tsx` is `/clase`: it opens the last class the teacher saw (kept in `localStorage` as `quickeval:lastClass`, else the first active one of the year), or, with no active class, offers "+ Clasă nouă" and links the archived classes. A link's state (`ClassLinkState`) goes on to that class page: `{ newClass: true }` (the panel's "+ Clasă nouă") opens that dialog on arrival, `{ archived: true }` (the panel's "Arhivate (n)") opens "Schimbă clasa" at "Arhivate". The old "page with all classes" (`ClassesPage`) and `ClassStudentsPage` no longer exist.
- The CES variant: `CesTag.tsx` is the mark next to a CES student's name in every teacher table that lists students (the class page's two tabs, the papers table, the links table, the class report, the paper page's students, the search, the student page's heading); "De făcut" (`shell/todo.ts`) also asks to check a generated CES barem, or to generate it again (`TestSummary.cesBarem`), after the class barem's case and until the test is done; `testPage/CesVariant.tsx` holds "Varianta CES" in Pregătire (shown while the class has a CES student or the variant has a file: the CES students and the switch "Test separat pentru elevii cu CES" (`CesSwitch.tsx`, also on Test nou; off asks first when there are CES files, then removes them through `setCesOff`), its own `TestFiles` with `variant="ces"` while the switch is on, the total warning, and "Șterge varianta CES" only once the class has no CES student left) and the notice of the CES papers that wait for their barem in Corectare (`CesWaiting`); `testPage/variant.ts` picks a variant's parts of a test. What a draft or open test misses (`missing.ts`) is said in the stages, in "De făcut", as orange "lipsește" (and green "gata") marks in `TestFiles`, and as `MissingList.tsx` under "Începe testul" (with why each part matters) and under "Creează testul". `TestFiles`, `useGeneratedBarem`, `PrintTest` and `ExerciseListBanner` take `variant`. The class report, its CSV and the class PDF draw the tables of `reportTables` (`shared/stats.ts`): one, or the class papers then the CES papers with their own exercises; the CSV never names CES.
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `testPage/StagePanel.tsx` (the panel În clasă) holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
```

- [ ] **Step 37: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `admin/search/` is search (redesign spec §11.10). `SearchBox.tsx` is the box after the lockup in the top bar ("Caută elevi, clase și teste", an ARIA combobox): from two letters, the list under it shows at most five of each group, "Elevi" (the classes on the right), "Clase" (the students, "arhivată"), "Teste" (the class and the date), with the match in bold (`Highlight.tsx`, `matchRange` of `shared/search.ts`), and "Toate rezultatele pentru „stef”" last. The arrows move (`aria-activedescendant`), Enter opens the chosen line or, with none chosen, the results page; a chosen line empties the box. Esc closes the list first and marks it with `preventDefault()`, so a panel stays open. `useSearch.ts` asks `/api/admin/search` 200 ms after the typing stops, keyed by the year and the folded text, and keeps the last answer on screen meanwhile; the shell reads `['search']` again after every change. `pages/SearchPage.tsx` is the results page at `/cautare?q=stef&arata=elevi`: "Rezultate pentru „stef”", how many in the school year, the chips "Toate", "Elevi", "Clase", "Teste" with their counts (an empty group's chip is disabled; an old link to it shows all), and one card per group: a student with the classes and "ultima notă" or "nicio notă încă", a class with its students, a test with its class, date and stage (`stagesOf`). On a phone the box gives way to a magnifier beside ☰ (`Layout.tsx`, the panel `search`): `SearchLayer.tsx` is the search over the whole screen, a dialog with ← "Închide căutarea" and the list always open; ←, Esc, a new page and a screen grown past a phone close it, the page, the top bar and the bar under it are `inert`, and the focus goes back to the magnifier. The class page's student search uses the same fold.
- `EmptyState.tsx` is an empty place of the teacher app (redesign spec §11.9): an icon (`shell/icons.tsx`), a heading at the level of its place (`level`: an h3 under a panel's or a card's title, an h2 in a card with none, an h1 on a page with no other heading), one sentence, and at most one button, its one next step. It is used by "Clasele tale" with no class (its "+ Clasă nouă", and "Nu ai nicio clasă activă" when archived ones exist; the panel's own foot then shows only "Arhivate (n)"), "Ce ai de făcut" with nothing, `/clase` with no active class, a class with no students or no tests (`NoStudents` in `classPage/GradesTable.tsx`, on both tabs; an archived class gets the same headings and no button), În clasă while the test is open and no student has started an upload (`submissionId` null on every row; the QR code on the whole screen, `QrOverlay` of `UploadLink.tsx`, belongs to the panel, so it stays open when the first paper arrives; closing it gives the focus to its button, or to the panel's heading), and Rezultate with nothing to publish (`NoResultsYet` in `ResultsAccess.tsx`, "Mergi la Corectare"; the students' links stay under it). A new teacher (no test in the year, and `testsEvaluated` 0) sees on the Teste page (after "Se încarcă…" while the tests load, not the other greeting) "Bun venit, …" and `testsPage/FirstSteps.tsx` ("Primii pași": a class, a test, the print) in place of the filters and the lists; the card goes once a test exists.
- `admin/testPage/PapersProgress.tsx` is the papers bar above the test page's papers table only (the Teste page shows the stage bar instead): "Lucrări: 18 din 23 de elevi au trimis" while the uploads are open, "… au participat" after, one bar of the students in parts (`paperCounts.ts`: corectate, se corectează, așteaptă corectarea, eșuate, încarcă acum, încă nu au trimis, nu au participat hollow with a grey outline: the brand has no gradient), a legend naming each part that has a student, "✓ Corectat complet" when every paper that took part is graded, and apart the points to check with "Verifică". A held-back paper (not chosen, past the demo limit) is `uploading` with files: once the uploads close it waits, it did take part (`heldBack`, also used by the papers table and the paper page's head, "Elevii" and `waitingText`; `heldBackHint` says why, and tells a demo account with no paper left that reopening will not send it). "✓ Corectat complet" waits while a student of a reopened test is sending. A sent CES paper waits too while the CES barem is not active, though the test is in evaluation (`CesBar`). The bar is `aria-hidden`: the legend says it in words. `EvaluationControls` shows "Marchează ca terminat" in place of the start button when a paper is graded and none waits.
```

Replace it with:

```markdown
- `admin/search/` is search (redesign spec §11.10). `SearchBox.tsx` is the box after the lockup in the top bar ("Caută elevi, clase și teste", an ARIA combobox): from two letters, the list under it shows at most five of each group, "Elevi" (the classes on the right), "Clase" (the students, "arhivată"), "Teste" (the class and the date), with the match in bold (`Highlight.tsx`, `matchRange` of `shared/search.ts`), and "Toate rezultatele pentru „stef”" last. The arrows move (`aria-activedescendant`), Enter opens the chosen line or, with none chosen, the results page; a chosen line empties the box. Esc closes the list first and marks it with `preventDefault()`, so a panel stays open. `useSearch.ts` asks `/api/admin/search` 200 ms after the typing stops, keyed by the year and the folded text, and keeps the last answer on screen meanwhile; the shell reads `['search']` again after every change. `pages/SearchPage.tsx` is the results page at `/cautare?q=stef&arata=elevi`: "Rezultate pentru „stef”", how many in the school year, the chips "Toate", "Elevi", "Clase", "Teste" with their counts (an empty group's chip is disabled; an old link to it shows all), and one card per group: a student with the classes and "ultima notă" or "nicio notă încă", a class with its students, a test with its class, date and stage (`stagesOf`). On a phone the box gives way to a magnifier beside ☰ (`Layout.tsx`, the panel `search`): `SearchLayer.tsx` is the search over the whole screen, a dialog with ← "Închide căutarea" and the list always open; ←, Esc, a new page and a screen grown past a phone close it, the page, the top bar and the bar under it are `inert`, and the focus goes back to the magnifier. The class page's student search uses the same fold.
- `EmptyState.tsx` is an empty place of the teacher app (redesign spec §11.9): an icon (`shell/icons.tsx`), a heading at the level of its place (`level`: an h3 under a panel's or a card's title, an h2 in a card with none, an h1 on a page with no other heading), one sentence, and at most one button, its one next step. It is used by "Clasele tale" with no class (its "+ Clasă nouă", and "Nu ai nicio clasă activă" when archived ones exist; the panel's own foot then shows only "Arhivate (n)"), "Ce ai de făcut" with nothing, `/clase` with no active class, a class with no students or no tests (`NoStudents` in `classPage/GradesTable.tsx`, on both tabs; an archived class gets the same headings and no button), În clasă while the test is open and no student has started an upload (`submissionId` null on every row, with no button: the students' link above it has "Arată codul QR pe tot ecranul"; that QR code on the whole screen, `QrOverlay` of `UploadLink.tsx`, belongs to the panel, so it stays open when the first paper arrives; closing it gives the focus back to its button), and Rezultate with nothing to publish (`NoResultsYet` in `ResultsAccess.tsx`, "Mergi la Corectare"; the students' links stay under it). A new teacher (no test in the year, and `testsEvaluated` 0) sees on the Teste page (after "Se încarcă…" while the tests load, not the other greeting) "Bun venit, …" and `testsPage/FirstSteps.tsx` ("Primii pași": a class, a test, the print) in place of the filters and the lists; the card goes once a test exists.
- `admin/testPage/PapersProgress.tsx` is the papers bar above the test page's papers table only (the Teste page shows the stage bar instead): "Lucrări: 18 din 23 de elevi au trimis" while the uploads are open, "… au participat" after, one bar of the students in parts (`paperCounts.ts`: corectate, se corectează, așteaptă corectarea, eșuate, încarcă acum, încă nu au trimis, nu au participat hollow with a grey outline: the brand has no gradient), a legend naming each part that has a student, "✓ Corectat complet" when every paper that took part is graded, and apart the points to check with "Verifică". A held-back paper (not chosen, past the demo limit) is `uploading` with files: once the uploads close it waits, it did take part (`heldBack`, also used by the papers table and the paper page's head, "Elevii" and `waitingText`; `heldBackHint` says why, and tells a demo account with no paper left that reopening will not send it). "✓ Corectat complet" waits while a student of a reopened test is sending. A sent CES paper waits too while the CES barem is not active, though the test is in evaluation (`CesBar`). The bar is `aria-hidden`: the legend says it in words. `EvaluationControls` shows "Marchează ca terminat" in place of the start button when a paper is graded and none waits.
```

- [ ] **Step 38: Edit `src/AGENTS.md`**

Find this block:

```markdown
- The paper page is drawn anew for another student: after a move to another paper, its tests find the decision again through `screen`, not through an element found before the move. `PaperPage.test.tsx` covers the head, the states and the corrections; `PaperCheck.test.tsx` the points to check, the switch, the keys, the zoom and the borders. `reviewPointsOf()` in `test/fakeApi.ts` makes an upload row's `reviewPoints` from a fake evaluation, and the fake API keeps them in step after every correction.
- The test page draws only the panel of the chosen stage. Its page tests open a stage by its address (`/teste/6E2-26T1#corectare`) or by its link in the list of stages (`openStage()` in `TestPage.test.tsx`). Without an address the page opens on the current stage of `stagesOf()`: fake data with no test file opens on Pregătire, an open test with its files on În clasă, a done test with points to check on Verificare, a done test with none on Rezultate (which has the links table, not the papers table: a test of the papers table opens `#corectare`). Fișa testului is a region beside every panel: its students' link and its "Copiază linkul" are found from any stage; the test's actions are in "Acțiuni" (`chooseAction()` in `TestPage.test.tsx`).
```

Replace it with:

```markdown
- The paper page is drawn anew for another student: after a move to another paper, its tests find the decision again through `screen`, not through an element found before the move. `PaperPage.test.tsx` covers the head, the states and the corrections; `PaperCheck.test.tsx` the points to check, the switch, the keys, the zoom and the borders. `reviewPointsOf()` in `test/fakeApi.ts` makes an upload row's `reviewPoints` from a fake evaluation, and the fake API keeps them in step after every correction.
- The test page draws only the panel of the chosen stage. Its page tests open a stage by its address (`/teste/6E2-26T1#corectare`) or by its link in the list of stages (`openStage()` in `TestPage.test.tsx`). Without an address the page opens on the current stage of `stagesOf()`: fake data with no test file opens on Pregătire, an open test with its files on În clasă, a done test with points to check on Verificare, a done test with none on Rezultate (which has the links table, not the papers table: a test of the papers table opens `#corectare`). Fișa testului is a region beside every panel (its numbers and facts: `fact()` in `TestPage.test.tsx`); the students' link is in În clasă (`#in-clasa`); the test's actions are in "Acțiuni" (`chooseAction()`).
```

- [ ] **Step 39: Edit `docs/superpowers/specs/2026-11-15-fisa-testului-redesign-design.md`**

Find this block:

```markdown

- The upload link with its QR code (`UploadLink`, today in the card for a draft or open test) moves to
  the În clasă panel, for a draft and an open test, with today's hint under it.

```

Replace it with:

```markdown

- The upload link (`UploadLink`, today in the card for a draft or open test) moves to the top of the
  În clasă panel, for a draft and an open test: the address with "Copiază linkul", one
  "Arată codul QR pe tot ecranul" button (no small QR picture), and today's hint under it.
- The empty state of an open test with no paper ("Nicio lucrare trimisă încă") loses its own
  full-screen button: the link's button does it, and it stays when the first paper arrives.

```

- [ ] **Step 40: Run the typecheck and the whole suite**

Run: `npm run typecheck`
Expected: no output after the command line (exit code 0).

Run: `npm test`
Expected: `Test Files  182 passed | 1 skipped (183)`, `Tests  2811 passed | 3 skipped (2814)`.

- [ ] **Step 41: Commit**

```bash
git add src/admin/testPage/TestSheet.tsx src/admin/pages/TestPage.tsx src/admin/testPage/StagePanel.tsx src/ui/brand.css src/AGENTS.md docs/superpowers/specs/2026-11-15-fisa-testului-redesign-design.md src/admin/pages/TestPage.test.tsx src/admin/cesMarks.test.tsx src/admin/Layout.test.tsx
git commit -m "Make Fișa testului a short card of the state and the facts, and move the students' link to În clasă"
```

Run: `git diff --stat refs/protofs/fs2 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

### Task 3: Print the test with the QR code from Tipărire

A card per variant with a drawing of a page, how many copies, "Tipărește" and "Descarcă PDF"; the print in a hidden frame, or in a tab where a frame cannot print; the cards stay after the test was given.

**Files:**
- Create: `src/admin/testPage/printPdf.ts`, `src/admin/testPage/printPdf.test.ts`
- Modify: `src/admin/testPage/PrintTest.tsx` (replaced), `src/admin/testPage/StagePanel.tsx`, `src/ui/brand.css`, `public/_headers`, `src/AGENTS.md`, `docs/superpowers/specs/2026-11-15-fisa-testului-redesign-design.md`
- Test: `src/admin/testPage/PrintTest.test.tsx` (replaced), `src/admin/pages/TestPage.test.tsx`, `src/admin/pages/TestPagePrint.test.tsx`, `src/admin/pages/TestPageCes.test.tsx`, `src/landing/quickTry/ui.test.ts`

**Interfaces:**
- Consumes: `printFileUrl(code, variant)` (`src/admin/api.ts`), `partsOf(test, variant)` (`src/admin/testPage/variant.ts`), `countLabel(count, one, many)` (`src/ui/format.ts`).
- Produces: in `src/admin/testPage/printPdf.ts`, `export type PrintOutcome = 'printed' | 'tab' | 'failed'`, `export const PRINT_LOAD_TIMEOUT = 20_000`, `export function printsInFrame(userAgent: string, maxTouchPoints: number): boolean`, `export function printPdf(url: string): Promise<PrintOutcome>`; in `PrintTest.tsx`, `export function copiesLine(test: TestInfo, variant: TestVariant): string | null`; each card is a region named "Testul cu cod QR" or "Testul CES cu cod QR".

- [ ] **Step 1: Create `src/admin/testPage/printPdf.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import headers from '../../../public/_headers?raw';
import { PRINT_LOAD_TIMEOUT, printPdf, printsInFrame } from './printPdf.ts';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const EDGE = `${CHROME} Edg/131.0.0.0`;
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1';
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const URL = '/api/admin/tests/6E2-26T1/print';

describe('printsInFrame', () => {
  it('prints in a frame in Chrome, Edge and Firefox, also on a Mac', () => {
    expect(printsInFrame(CHROME, 0)).toBe(true);
    expect(printsInFrame(EDGE, 10)).toBe(true);
    expect(printsInFrame(FIREFOX, 0)).toBe(true);
    expect(printsInFrame(MAC_CHROME, 0)).toBe(true);
  });

  it('opens a tab on an iPhone, an iPad and in Safari', () => {
    expect(printsInFrame(IPHONE, 5)).toBe(false);
    expect(printsInFrame(SAFARI, 0)).toBe(false);
    // An iPad asks for the desktop site with a Mac's name, and has a touch screen.
    expect(printsInFrame(SAFARI.replace('Version/18.1 Safari', 'Version/18.1 Mobile Safari'), 5)).toBe(false);
    expect(printsInFrame(MAC_CHROME, 5)).toBe(false);
  });
});

describe('printPdf', () => {
  let open: ReturnType<typeof vi.fn>;

  it("is allowed by the site's security policy: a page may frame the site's own files", () => {
    const policy = headers.split('\n').find((line) => line.trim().startsWith('Content-Security-Policy:'))!;
    expect(policy).toMatch(/frame-src 'self'[ ;]/);
  });

  beforeEach(() => {
    open = vi.fn();
    vi.stubGlobal('open', open);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(CHROME);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  // The frame the last print made, with the page it loaded and its print().
  function loadFrame(page: { contentType?: string; throws?: boolean; printThrows?: boolean }) {
    const frame = document.querySelector<HTMLIFrameElement>('iframe.print-frame')!;
    const print = vi.fn(() => {
      if (page.printThrows) throw new Error('blocked');
    });
    Object.defineProperty(frame, 'contentDocument', {
      configurable: true,
      get: () => {
        if (page.throws) throw new DOMException('cross-origin', 'SecurityError');
        return page.contentType === undefined ? null : { contentType: page.contentType };
      },
    });
    Object.defineProperty(frame, 'contentWindow', { configurable: true, value: { focus: vi.fn(), print } });
    frame.dispatchEvent(new Event('load'));
    return { frame, print };
  }

  it('loads the PDF in a hidden frame and opens the print window on it', async () => {
    const done = printPdf(URL);
    const frame = document.querySelector<HTMLIFrameElement>('iframe.print-frame')!;
    expect(frame.getAttribute('src')).toBe(URL);
    expect(frame).toHaveAttribute('aria-hidden', 'true');
    const { print } = loadFrame({ contentType: 'application/pdf' });
    await expect(done).resolves.toBe('printed');
    expect(print).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
    // The frame stays: removing it now could close the print window.
    expect(frame.isConnected).toBe(true);
  });

  it('prints nothing when the answer is not a PDF', async () => {
    const done = printPdf(URL);
    const { frame, print } = loadFrame({ contentType: 'application/json' });
    await expect(done).resolves.toBe('failed');
    expect(print).not.toHaveBeenCalled();
    expect(frame.isConnected).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('opens the PDF in a tab when the page cannot reach the frame', async () => {
    const done = printPdf(URL);
    const { frame } = loadFrame({ throws: true });
    await expect(done).resolves.toBe('tab');
    expect(open).toHaveBeenCalledWith(URL, '_blank', 'noopener');
    expect(frame.isConnected).toBe(false);
  });

  it('opens the PDF in a tab when the frame has no page', async () => {
    const done = printPdf(URL);
    loadFrame({});
    await expect(done).resolves.toBe('tab');
    expect(open).toHaveBeenCalledWith(URL, '_blank', 'noopener');
  });

  it('opens the PDF in a tab when the browser refuses to print the frame', async () => {
    const done = printPdf(URL);
    loadFrame({ contentType: 'application/pdf', printThrows: true });
    await expect(done).resolves.toBe('tab');
    expect(open).toHaveBeenCalledWith(URL, '_blank', 'noopener');
  });

  it('opens the PDF in a tab when the frame does not load in time', async () => {
    vi.useFakeTimers();
    const done = printPdf(URL);
    vi.advanceTimersByTime(PRINT_LOAD_TIMEOUT);
    await expect(done).resolves.toBe('tab');
    expect(open).toHaveBeenCalledWith(URL, '_blank', 'noopener');
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('opens the PDF in a tab at once in Safari, with no frame', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(SAFARI);
    await expect(printPdf(URL)).resolves.toBe('tab');
    expect(open).toHaveBeenCalledWith(URL, '_blank', 'noopener');
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('keeps one frame: a new print takes the place of the last one', async () => {
    const first = printPdf(URL);
    loadFrame({ contentType: 'application/pdf' });
    await first;
    const second = printPdf('/api/admin/tests/6E2-26T1/ces/print');
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    expect(document.querySelector('iframe')!.getAttribute('src')).toBe('/api/admin/tests/6E2-26T1/ces/print');
    loadFrame({ contentType: 'application/pdf' });
    await expect(second).resolves.toBe('printed');
  });
});
```

- [ ] **Step 2: Replace `src/admin/testPage/PrintTest.test.tsx`**

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TestInfo } from '../../../shared/api.ts';
import { PDF_TYPE } from '../../../shared/files.ts';
import { createFakeApi, FAKE_TOKEN, fakeTest, fakeUpload, noCesVariant } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { printPdf, type PrintOutcome } from './printPdf.ts';

vi.mock('./printPdf.ts', () => ({ printPdf: vi.fn() }));

const TEST_FILE = { name: 'Test.pdf', type: PDF_TYPE };
const students = (count: number) => Array.from({ length: count }, (_, index) => fakeUpload({ studentId: index + 1, studentName: `Elev ${index + 1}` }));

function openApi(overrides: Partial<TestInfo> = {}, studentCount = 0) {
  return createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount }],
    students: {},
    tests: [fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, files: { test: TEST_FILE, barem: null }, ...overrides }, students(studentCount))],
  });
}

const card = (name = 'Testul cu cod QR') => screen.findByRole('region', { name });

afterEach(() => {
  vi.mocked(printPdf).mockReset();
});

describe('PrintTest', () => {
  it('asks for the test file first', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ files: { test: null, barem: null } }));
    expect(within(await card()).getByText('Încarcă testul ca să primești varianta cu cod QR.')).toBeInTheDocument();
  });

  it('says the PDF is being made', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', openApi());
    expect(within(await card()).getByText('Se pregătește testul cu cod QR…')).toHaveAttribute('role', 'status');
  });

  it('offers to print and to download when ready, with how many copies', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false } }, 23));
    const ready = within(await card());
    expect(ready.getByRole('button', { name: 'Tipărește' })).toHaveClass('button');
    const link = ready.getByRole('link', { name: 'Descarcă PDF' });
    expect(link).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/print');
    expect(link).toHaveAttribute('download');
    expect(ready.getByText('Codul QR apare în colțul fiecărei pagini.')).toBeInTheDocument();
    expect(ready.getByText('Tipărește 23 de copii, câte una pentru fiecare elev.')).toBeInTheDocument();
  });

  it('says one copy for one student, and nothing for a class with no student', async () => {
    const one = renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false } }, 1));
    expect(within(await card()).getByText('Tipărește 1 copie, câte una pentru fiecare elev.')).toBeInTheDocument();
    one.unmount();
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false } }, 0));
    expect(within(await card()).queryByText(/^Tipărește \d/)).not.toBeInTheDocument();
  });

  it('opens the print window on the PDF, and says it is getting ready meanwhile', async () => {
    let finish: (outcome: PrintOutcome) => void = () => undefined;
    vi.mocked(printPdf).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false } }));
    await userEvent.click(within(await card()).getByRole('button', { name: 'Tipărește' }));
    expect(printPdf).toHaveBeenCalledWith('/api/admin/tests/6E2-26T1/print');
    expect(screen.getByRole('button', { name: 'Se pregătește…' })).toBeDisabled();
    finish('printed');
    expect(await screen.findByRole('button', { name: 'Tipărește' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says when the PDF could not be opened for printing', async () => {
    vi.mocked(printPdf).mockResolvedValue('failed');
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false } }));
    await userEvent.click(within(await card()).getByRole('button', { name: 'Tipărește' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am putut deschide testul pentru tipărit. Încearcă din nou sau descarcă PDF-ul.');
    vi.mocked(printPdf).mockResolvedValue('tab');
    await userEvent.click(screen.getByRole('button', { name: 'Tipărește' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('warns about a PDF made from Word', async () => {
    const word = /PDF-ul a fost făcut din fișierul Word/;
    const { unmount } = renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: true } }));
    expect(await screen.findByText(word)).toHaveTextContent('Pentru o copie exactă, încarcă testul ca PDF.');
    unmount();
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false } }));
    await screen.findByRole('button', { name: 'Tipărește' });
    expect(screen.queryByText(word)).not.toBeInTheDocument();
  });

  it('retries a failed print', async () => {
    const api = openApi({ print: { status: 'failed', fromWord: false } });
    renderAdmin('/teste/6E2-26T1#tiparire', api);
    expect(await screen.findByText('Nu am putut pregăti testul cu cod QR.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(api.retryPrint).toHaveBeenCalledWith('6E2-26T1', 'class');
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Încearcă din nou' })).not.toBeInTheDocument());
  });

  it('shows the block in the panel Tipărire, and not with the files of Pregătire', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', openApi());
    const panel = await screen.findByRole('region', { name: 'Tipărire' });
    expect(within(panel).getByRole('region', { name: 'Testul cu cod QR' })).toBeInTheDocument();
    const stages = screen.getByRole('navigation', { name: 'Etapele testului' });
    await userEvent.click(within(stages).getByRole('link', { name: /^Pregătire / }));
    expect(await screen.findByRole('link', { name: 'Test.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Testul cu cod QR' })).not.toBeInTheDocument();
  });

  it('turns a spinner while the PDF is being made, and not after', async () => {
    const { unmount } = renderAdmin('/teste/6E2-26T1#tiparire', openApi());
    const status = await screen.findByRole('status');
    expect(status.querySelector('.spinner')).not.toBeNull();
    unmount();
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false } }));
    await screen.findByRole('button', { name: 'Tipărește' });
    expect(document.querySelector('.spinner')).toBeNull();
  });

  it('prints the CES test apart, for the CES students, with quiet buttons', async () => {
    const api = openApi(
      {
        status: 'draft',
        print: { status: 'ready', fromWord: false },
        ces: noCesVariant({ studentCount: 2, files: { test: TEST_FILE, barem: null }, print: { status: 'ready', fromWord: false } }),
      },
      23,
    );
    vi.mocked(printPdf).mockResolvedValue('printed');
    renderAdmin('/teste/6E2-26T1#tiparire', api);
    const ces = within(await card('Testul CES cu cod QR'));
    expect(within(await card()).getByText('Tipărește 21 de copii, pentru elevii fără CES.')).toBeInTheDocument();
    expect(ces.getByText('Tipărește 2 copii, pentru elevii cu CES.')).toBeInTheDocument();
    expect(ces.getByRole('link', { name: 'Descarcă PDF' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/ces/print');
    expect(ces.getByRole('button', { name: 'Tipărește' })).toHaveClass('button-quiet');
    // The line of a draft is said once, on the class test.
    expect(within(await card()).getByText(/Poți tipări testul de acum/)).toBeInTheDocument();
    expect(ces.queryByText(/Poți tipări testul de acum/)).not.toBeInTheDocument();
    await userEvent.click(ces.getByRole('button', { name: 'Tipărește' }));
    expect(printPdf).toHaveBeenCalledWith('/api/admin/tests/6E2-26T1/ces/print');
  });

  it('counts every student for the class test while the CES students have no CES test', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false }, ces: noCesVariant({ studentCount: 2 }) }, 23));
    expect(within(await card()).getByText('Tipărește 23 de copii, câte una pentru fiecare elev.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Testul CES cu cod QR' })).not.toBeInTheDocument();
  });

  it('keeps the PDFs to print again after the test was given', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ status: 'done', print: { status: 'ready', fromWord: false } }));
    expect(await screen.findByText('Testul s-a dat în clasă.')).toBeInTheDocument();
    const given = within(await card());
    expect(given.getByRole('button', { name: 'Tipărește' })).toBeInTheDocument();
    expect(given.getByRole('link', { name: 'Descarcă PDF' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/print');
    expect(given.queryByText(/Poți tipări testul de acum/)).not.toBeInTheDocument();
  });

  it('says only that the test was given when no PDF was made before', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ status: 'evaluating' }));
    expect(await screen.findByText('Testul s-a dat în clasă.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Testul cu cod QR' })).not.toBeInTheDocument();
    expect(screen.queryByText('Se pregătește testul cu cod QR…')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx

  it('shows the print block on a draft and an open test, and not once the uploads closed', async () => {
    const { unmount } = renderAdmin(`${PAGE}#tiparire`, apiWith());
    await screen.findByRole('heading', { level: 2, name: 'Tipărire' });
    expect(screen.getByText('Testul pentru tipărit:')).toBeInTheDocument();
    unmount();
```

Replace it with:

```tsx

  it('shows the print block on a draft and an open test, and once the uploads closed only a PDF made before', async () => {
    const { unmount } = renderAdmin(`${PAGE}#tiparire`, apiWith());
    await screen.findByRole('heading', { level: 2, name: 'Tipărire' });
    expect(screen.getByRole('region', { name: 'Testul cu cod QR' })).toBeInTheDocument();
    unmount();
```

- [ ] **Step 4: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    await screen.findByRole('heading', { level: 2, name: 'Tipărire' });
    expect(screen.getByText('Testul pentru tipărit:')).toBeInTheDocument();
    open.unmount();
```

Replace it with:

```tsx
    await screen.findByRole('heading', { level: 2, name: 'Tipărire' });
    expect(screen.getByRole('region', { name: 'Testul cu cod QR' })).toBeInTheDocument();
    open.unmount();
```

- [ ] **Step 5: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByText('Testul s-a dat în clasă.')).toBeInTheDocument();
    expect(screen.queryByText('Testul pentru tipărit:')).not.toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(await screen.findByText('Testul s-a dat în clasă.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Testul cu cod QR' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 6: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    );
    expect(await screen.findByRole('link', { name: 'Descarcă testul cu cod QR' })).toBeInTheDocument();
    expect(screen.getByText('Poți tipări testul de acum. Elevii încarcă lucrările după ce începi testul.')).toBeInTheDocument();
```

Replace it with:

```tsx
    );
    expect(await screen.findByRole('link', { name: 'Descarcă PDF' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/print');
    expect(screen.getByRole('button', { name: 'Tipărește' })).toBeInTheDocument();
    expect(screen.getByText('Poți tipări testul de acum. Elevii încarcă lucrările după ce începi testul.')).toBeInTheDocument();
```

- [ ] **Step 7: Edit `src/admin/pages/TestPagePrint.test.tsx`**

Find this block:

```tsx
    renderAdmin('/teste/6E2-26T1#tiparire', apiWith(overrides, true));
    expect(await screen.findByText('Testul pentru tipărit:')).toBeInTheDocument();
    expect(screen.queryByText(NEVER_CHECKED)).not.toBeInTheDocument();
```

Replace it with:

```tsx
    renderAdmin('/teste/6E2-26T1#tiparire', apiWith(overrides, true));
    expect(await screen.findByRole('region', { name: 'Testul cu cod QR' })).toBeInTheDocument();
    expect(screen.queryByText(NEVER_CHECKED)).not.toBeInTheDocument();
```

- [ ] **Step 8: Edit `src/admin/pages/TestPagePrint.test.tsx`**

Find this block:

```tsx
    await openStage('Tipărire');
    expect(await screen.findByRole('link', { name: 'Descarcă testul cu cod QR' })).toBeInTheDocument();
    expect(screen.queryByText(robotStartMessage('dispatched'))).not.toBeInTheDocument();
```

Replace it with:

```tsx
    await openStage('Tipărire');
    expect(await screen.findByRole('button', { name: 'Tipărește' })).toBeInTheDocument();
    expect(screen.queryByText(robotStartMessage('dispatched'))).not.toBeInTheDocument();
```

- [ ] **Step 9: Edit `src/admin/pages/TestPageCes.test.tsx`**

Find this block:

```tsx
    renderAdmin(`${PAGE}#tiparire`, apiWith({ print: { status: 'ready', fromWord: false }, ces: noCesVariant({ studentCount: 1, files: FILES, print: { status: 'ready', fromWord: false } }) }));
    expect(await screen.findByRole('link', { name: 'Descarcă testul CES cu cod QR' })).toHaveAttribute('href', '/api/admin/tests/9R2-26T1/ces/print');
    expect(screen.getByRole('link', { name: 'Descarcă testul cu cod QR' })).toHaveAttribute('href', '/api/admin/tests/9R2-26T1/print');
    expect(screen.getByText('Același cod QR ca pe testul clasei: elevii cu CES încarcă pe același link.')).toBeInTheDocument();
```

Replace it with:

```tsx
    renderAdmin(`${PAGE}#tiparire`, apiWith({ print: { status: 'ready', fromWord: false }, ces: noCesVariant({ studentCount: 1, files: FILES, print: { status: 'ready', fromWord: false } }) }));
    const ces = await screen.findByRole('region', { name: 'Testul CES cu cod QR' });
    expect(within(ces).getByRole('link', { name: 'Descarcă PDF' })).toHaveAttribute('href', '/api/admin/tests/9R2-26T1/ces/print');
    const test = screen.getByRole('region', { name: 'Testul cu cod QR' });
    expect(within(test).getByRole('link', { name: 'Descarcă PDF' })).toHaveAttribute('href', '/api/admin/tests/9R2-26T1/print');
    expect(screen.getByText('Același cod QR ca pe testul clasei: elevii cu CES încarcă pe același link.')).toBeInTheDocument();
```

- [ ] **Step 10: Edit `src/landing/quickTry/ui.test.ts`**

Find this block:

```ts
    expect(policy).toContain("script-src 'self' https://challenges.cloudflare.com https://stats.mqgrader.ro;");
    expect(policy).toContain('frame-src https://challenges.cloudflare.com;');
    expect(policy).toContain("connect-src 'self' https://stats.mqgrader.ro;");
```

Replace it with:

```ts
    expect(policy).toContain("script-src 'self' https://challenges.cloudflare.com https://stats.mqgrader.ro;");
    expect(policy).toContain("frame-src 'self' https://challenges.cloudflare.com;");
    expect(policy).toContain("connect-src 'self' https://stats.mqgrader.ro;");
```

- [ ] **Step 11: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/TestPage.test.tsx src/admin/pages/TestPageCes.test.tsx src/admin/pages/TestPagePrint.test.tsx src/admin/testPage/PrintTest.test.tsx src/admin/testPage/printPdf.test.ts src/landing/quickTry/ui.test.ts`
Expected: FAIL. `Test Files  6 failed (6)`, `Tests  8 failed | 194 passed (202)`: `printPdf.test.ts` and `PrintTest.test.tsx` do not load (`Failed to resolve import "./printPdf.ts"`); in the three page test files, 7 tests fail with `Unable to find role="region" and name "Testul cu cod QR"` (or `"Testul CES cu cod QR"`), `Unable to find role="button" and name "Tipărește"` and `Unable to find role="link" and name "Descarcă PDF"`; and the landing test of the security policy fails (`expected '  Content-Security-Policy: default-sr…' to contain 'frame-src 'self' https://challenges…'`). The other tests of those four files pass.

- [ ] **Step 12: Create `src/admin/testPage/printPdf.ts`**

```ts
// "Tipărește" (spec 2026-11-15 §3): the print PDF opens in the computer's
// print window, with no download. The API serves it `inline` and from the same
// origin, so a hidden frame can load it and print it.

export type PrintOutcome = 'printed' | 'tab' | 'failed';

// How long the frame may take to load the PDF before the PDF opens in a tab.
export const PRINT_LOAD_TIMEOUT = 20_000;

// iPhone, iPad and Safari do not print a PDF inside a frame: the PDF opens in a
// new tab there, where the browser's own viewer prints it. An iPad asks for
// the desktop site with a Mac's name, and has a touch screen.
export function printsInFrame(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return false;
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return false;
  const safari = /Safari\//.test(userAgent) && !/Chrome\/|Chromium\/|CriOS\/|Edg\/|OPR\/|Firefox\/|FxiOS\//.test(userAgent);
  return !safari;
}

// The frame of the last print. A new print takes its place: removing it right
// after `print()` would close the print window in some browsers.
let lastFrame: HTMLIFrameElement | null = null;

// Prints the PDF at `url`: in a hidden frame where the browser can, else in a
// new tab. A frame whose page is not a PDF (an error answer) prints nothing:
// 'failed'. A frame the page cannot reach (a browser that shows the PDF from
// another origin), or that does not load in time, opens the tab instead.
export function printPdf(url: string): Promise<PrintOutcome> {
  const openTab = (): PrintOutcome => {
    window.open(url, '_blank', 'noopener');
    return 'tab';
  };
  if (!printsInFrame(navigator.userAgent, navigator.maxTouchPoints ?? 0)) return Promise.resolve(openTab());

  lastFrame?.remove();
  const frame = document.createElement('iframe');
  frame.className = 'print-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  lastFrame = frame;

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      frame.remove();
      resolve(openTab());
    }, PRINT_LOAD_TIMEOUT);
    frame.addEventListener(
      'load',
      () => {
        window.clearTimeout(timer);
        let type: string | undefined;
        try {
          type = frame.contentDocument?.contentType;
        } catch {
          type = undefined;
        }
        if (type === undefined) {
          frame.remove();
          resolve(openTab());
          return;
        }
        if (type !== 'application/pdf') {
          frame.remove();
          resolve('failed');
          return;
        }
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          resolve('printed');
        } catch {
          frame.remove();
          resolve(openTab());
        }
      },
      { once: true },
    );
    frame.src = url;
    document.body.append(frame);
  });
}
```

- [ ] **Step 13: Replace `src/admin/testPage/PrintTest.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import type { TestVariant } from '../../../shared/files.ts';
import { countLabel } from '../../ui/format.ts';
import { printFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { printPdf } from './printPdf.ts';
import { partsOf } from './variant.ts';

// How many copies to print, in a line: the class without its CES students
// when the test has a CES variant, the CES students for the CES test.
export function copiesLine(test: TestInfo, variant: TestVariant): string | null {
  const ces = test.ces.files.test !== null ? test.ces.studentCount : 0;
  const count = variant === 'ces' ? ces : test.studentCount - ces;
  if (count <= 0) return null;
  const copies = countLabel(count, 'copie', 'copii');
  if (variant === 'ces') return `Tipărește ${copies}, pentru elevii cu CES.`;
  return ces > 0 ? `Tipărește ${copies}, pentru elevii fără CES.` : `Tipărește ${copies}, câte una pentru fiecare elev.`;
}

// The test with the QR code in the corner of every page, made by the robot
// from the test file, for the teacher to print (spec 2026-11-15 §3). It shows
// in Tipărire from the moment the test is made: the teacher prints it before
// the day of the test, and starts the test on that day. A draft made before
// tests got their link at once asks for the link with "Pregătește testul cu
// cod QR". With `variant` "ces": the CES test, with the same QR code as the
// class test.
export function PrintTest({
  test,
  variant = 'class',
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  variant?: TestVariant;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const id = useId();
  const retry = useMutation({
    mutationFn: () => api.retryPrint(test.code, variant),
    onSuccess: async (answer) => {
      onRobot(answer.robot);
      await onChanged();
    },
  });
  const parts = partsOf(test, variant);
  const ces = variant === 'ces';
  const { status, fromWord } = parts.print;
  const ready = parts.files.test !== null && test.uploadToken !== null && status === 'ready';
  const copies = copiesLine(test, variant);

  return (
    <section className={ready ? 'print-card is-ready' : 'print-card'} aria-labelledby={id}>
      {ready && <PageDrawing />}
      <div className="print-body">
        <h3 id={id}>{ces ? 'Testul CES cu cod QR' : 'Testul cu cod QR'}</h3>
        {parts.files.test === null ? (
          <p className="hint">{ces ? 'Încarcă testul CES ca să primești varianta cu cod QR.' : 'Încarcă testul ca să primești varianta cu cod QR.'}</p>
        ) : test.uploadToken === null ? (
          <>
            <p>
              <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate()}>
                Pregătește testul cu cod QR
              </button>
            </p>
            {retry.error && <ErrorMessage error={retry.error} />}
          </>
        ) : status === 'none' ? (
          <p role="status" className="busy-line">
            <span className="spinner" aria-hidden="true" />
            Se pregătește testul cu cod QR…
          </p>
        ) : status === 'ready' ? (
          <>
            <p className="hint">
              {ces ? 'Același cod QR ca pe testul clasei: elevii cu CES încarcă pe același link.' : 'Codul QR apare în colțul fiecărei pagini.'}
            </p>
            {copies && <p className="hint">{copies}</p>}
            <div className="card-actions">
              <PrintButton url={printFileUrl(test.code, variant)} main={!ces} />
              <a className="button-quiet" href={printFileUrl(test.code, variant)} download>
                <DownloadIcon />
                Descarcă PDF
              </a>
            </div>
            {test.status === 'draft' && !ces && (
              <p className="hint">Poți tipări testul de acum. Elevii încarcă lucrările după ce începi testul.</p>
            )}
            {fromWord && (
              <p className="hint">
                PDF-ul a fost făcut din fișierul Word. Verifică-l înainte să-l tipărești. Pentru o copie exactă, încarcă testul ca PDF.
              </p>
            )}
          </>
        ) : (
          <>
            <p>{ces ? 'Nu am putut pregăti testul CES cu cod QR.' : 'Nu am putut pregăti testul cu cod QR.'}</p>
            <p>
              <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate()}>
                Încearcă din nou
              </button>
            </p>
            {retry.error && <ErrorMessage error={retry.error} />}
          </>
        )}
      </div>
    </section>
  );
}

// "Tipărește": the computer's print window on the PDF (`printPdf`). While the
// PDF loads, the button says it is getting ready; an answer that is not a PDF
// says so under it.
function PrintButton({ url, main }: { url: string; main: boolean }) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  return (
    <>
      <button
        type="button"
        className={main ? 'button' : 'button-quiet'}
        disabled={state === 'busy'}
        onClick={async () => {
          setState('busy');
          setState((await printPdf(url)) === 'failed' ? 'failed' : 'idle');
        }}
      >
        <PrinterIcon />
        {state === 'busy' ? 'Se pregătește…' : 'Tipărește'}
      </button>
      {state === 'failed' && (
        <div className="alert print-error" role="alert">
          <p className="alert-text">Nu am putut deschide testul pentru tipărit. Încearcă din nou sau descarcă PDF-ul.</p>
        </div>
      )}
    </>
  );
}

// A page with lines of text and the QR code in its corner: not the PDF itself.
function PageDrawing() {
  return (
    <span className="print-page" aria-hidden="true">
      <svg className="print-page-qr" viewBox="0 0 7 7" focusable="false">
        <path d="M0 0h3v3H0zM4 0h3v3H4zM0 4h3v3H0zM4 4h1v1H4zM6 4h1v1H6zM5 5h1v1H5zM4 6h1v1H4zM6 6h1v1H6z" />
      </svg>
      <span className="print-page-title" />
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} className={index % 3 === 2 ? 'print-page-line is-short' : 'print-page-line'} />
      ))}
    </span>
  );
}

function PrinterIcon() {
  return (
    <svg className="button-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5.5 7.5V3h9v4.5" />
      <rect x="2.75" y="7.5" width="14.5" height="6.5" rx="1.5" />
      <path d="M5.5 12h9v5h-9z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="button-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M10 3v9.5M6 9l4 4 4-4M3.5 16.5h13" />
    </svg>
  );
}
```

- [ ] **Step 14: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
function PrintPanel({ test, robot, onChanged, onRobot }: PanelProps) {
  if (test.status !== 'draft' && test.status !== 'open') {
    const kept = test.print.status === 'ready' ? ' Testul cu cod QR rămâne în Fișa testului.' : '';
    return <p className="hint">Testul s-a dat în clasă.{kept}</p>;
  }
```

Replace it with:

```tsx
function PrintPanel({ test, robot, onChanged, onRobot }: PanelProps) {
  // After the test was given, the PDFs made before stay here to print again.
  if (test.status !== 'draft' && test.status !== 'open') {
    return (
      <>
        <p className="hint">Testul s-a dat în clasă.</p>
        {test.print.status === 'ready' && <PrintTest test={test} onChanged={onChanged} onRobot={onRobot} />}
        {test.ces.files.test !== null && test.ces.print.status === 'ready' && (
          <PrintTest test={test} variant="ces" onChanged={onChanged} onRobot={onRobot} />
        )}
      </>
    );
  }
```

- [ ] **Step 15: Edit `src/ui/brand.css`**

Find this block:

```css
/* The test with the QR code, in the panel Tipărire of the test page. */
.print-test {
  display: grid;
  gap: 0.4rem;
}

.print-test > * {
  margin: 0;
```

Replace it with:

```css
/* The test with the QR code, in the panel Tipărire of the test page. */
/* Tipărire (spec 2026-11-15 §3): a card per variant, a drawing of a page with
   its QR code on the left once the PDF is ready, then the words and the two
   buttons, "Tipărește" and "Descarcă PDF". */
.print-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
  padding: 1rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-panel);
  background: var(--sheet);
}

.print-card.is-ready {
  grid-template-columns: auto minmax(0, 1fr);
}

.print-body {
  display: grid;
  gap: 0.4rem;
  min-width: 0;
}

.print-body > * {
  margin: 0;
```

- [ ] **Step 16: Edit `src/ui/brand.css`**

Find this block:

```css

/* A button alone on its line keeps its own width. */
.print-test > button,
.file-list > li > button,
```

Replace it with:

```css

.print-body h3 {
  font-size: 1rem;
}

.print-body .card-actions {
  margin: 0.5rem 0 0.25rem;
}

.button-icon {
  width: 1.05em;
  height: 1.05em;
  margin-right: 0.4rem;
  vertical-align: -0.15em;
}

/* The page drawing: white like paper in both themes. */
.print-page {
  position: relative;
  display: grid;
  align-content: start;
  gap: 6px;
  width: 6.75rem;
  aspect-ratio: 210 / 297;
  box-sizing: border-box;
  padding: 0.75rem 0.6rem;
  border: 1px solid var(--rule);
  border-radius: 3px;
  background: #fff;
}

.print-page-title,
.print-page-line {
  display: block;
  height: 3px;
  border-radius: 2px;
  background: #d5dbe4;
}

.print-page-title {
  width: 60%;
  height: 5px;
  margin-bottom: 4px;
  background: #9aa6b8;
}

.print-page-line.is-short {
  width: 45%;
}

.print-page-qr {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 18px;
  height: 18px;
  fill: #222;
}

/* The hidden frame that prints the PDF (`printPdf.ts`). */
.print-frame {
  position: fixed;
  right: 0;
  bottom: 0;
  width: 0;
  height: 0;
  border: 0;
}

@media (max-width: 30rem) {
  .print-card.is-ready {
    grid-template-columns: minmax(0, 1fr);
  }

  .print-page {
    display: none;
  }
}

/* A button alone on its line keeps its own width. */
.file-list > li > button,
```

- [ ] **Step 17: Edit `public/_headers`**

Find this block:

```text
# sets its own X-Robots-Tag (server/app.ts), because _headers does not reach Functions.
/*
```

Replace it with:

```text
# sets its own X-Robots-Tag (server/app.ts), because _headers does not reach Functions.
# The pages may show the site's own files in a frame (frame-src 'self'): the PDF
# pages of a paper, and the hidden frame that prints the test with the QR code.
# The API's files allow only that (X-Frame-Options: SAMEORIGIN, server/uploads.ts).
/*
```

- [ ] **Step 18: Edit `public/_headers`**

Find this block:

```text
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://stats.mqgrader.ro; frame-src https://challenges.cloudflare.com; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://stats.mqgrader.ro; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'

```

Replace it with:

```text
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://stats.mqgrader.ro; frame-src 'self' https://challenges.cloudflare.com; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://stats.mqgrader.ro; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'

```

- [ ] **Step 19: Edit `src/AGENTS.md`**

Find this block:

```markdown
- The CES variant: `CesTag.tsx` is the mark next to a CES student's name in every teacher table that lists students (the class page's two tabs, the papers table, the links table, the class report, the paper page's students, the search, the student page's heading); "De făcut" (`shell/todo.ts`) also asks to check a generated CES barem, or to generate it again (`TestSummary.cesBarem`), after the class barem's case and until the test is done; `testPage/CesVariant.tsx` holds "Varianta CES" in Pregătire (shown while the class has a CES student or the variant has a file: the CES students and the switch "Test separat pentru elevii cu CES" (`CesSwitch.tsx`, also on Test nou; off asks first when there are CES files, then removes them through `setCesOff`), its own `TestFiles` with `variant="ces"` while the switch is on, the total warning, and "Șterge varianta CES" only once the class has no CES student left) and the notice of the CES papers that wait for their barem in Corectare (`CesWaiting`); `testPage/variant.ts` picks a variant's parts of a test. What a draft or open test misses (`missing.ts`) is said in the stages, in "De făcut", as orange "lipsește" (and green "gata") marks in `TestFiles`, and as `MissingList.tsx` under "Începe testul" (with why each part matters) and under "Creează testul". `TestFiles`, `useGeneratedBarem`, `PrintTest` and `ExerciseListBanner` take `variant`. The class report, its CSV and the class PDF draw the tables of `reportTables` (`shared/stats.ts`): one, or the class papers then the CES papers with their own exercises; the CSV never names CES.
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `testPage/StagePanel.tsx` (the panel În clasă) holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
- `pages/SettingsPage.tsx` is Setări (redesign spec §11.8, administrators only): three tabs, with the tab in the address (`?tab=corectarea`, `?tab=robotul`; none, or one it does not know, is "Conturi", and a click replaces the address). The three panels stay drawn, the others `hidden`, so a new key or password shown once survives a look at another tab. "Conturi" (`settingsPage/AccountsSection.tsx`) holds a red-edged card of the accounts that wait (gone when none waits; "Refuză toate" from two up) and "Toate conturile", with ⋯ (`shell/useSmallMenu.ts`) on a teacher's row only: "Fă cont complet" or "Fă cont demo", "Parolă nouă", "Închide contul", and for a closed account "Redeschide contul". An item closes the menu and gives the focus back to ⋯ before it asks or acts; the new password and an error show in a row under the account. Every row, an administrator's included, has "Detalii", which opens "Activitatea contului" (what the account used, the grading of the last 30 days, the room its papers take, the classes, students and tests it made, the last login), "Consumul robotului" (by kind: what worked, what it gave up on, the tokens, and the failure rate), "Fiecare test" (each test's robot work, graded papers, corrected points and tokens) and "Istoricul contului" (its changes with their times, "de <cine>" when an administrator made one), from `GET /api/admin/accounts/:id`, read only when opened. Once a request was refused, a card "Conturi refuzate" under the accounts lists who asked, when, and who said no. The red count of "Conturi" reads `['accounts']` on every tab. "Corectarea" saves each control as it changes: the new value shows at once, the control stays on while it saves, and a refusal puts back the saved value. "Robotul" holds "Starea robotului" (a tag: "lucrează acum" or "nu lucrează acum") and "Cheia robotului" with the day it was made (`robotKeyAt`; a key made before that was kept has none). Below 40rem each account row is a block (CSS).
```

Replace it with:

```markdown
- The CES variant: `CesTag.tsx` is the mark next to a CES student's name in every teacher table that lists students (the class page's two tabs, the papers table, the links table, the class report, the paper page's students, the search, the student page's heading); "De făcut" (`shell/todo.ts`) also asks to check a generated CES barem, or to generate it again (`TestSummary.cesBarem`), after the class barem's case and until the test is done; `testPage/CesVariant.tsx` holds "Varianta CES" in Pregătire (shown while the class has a CES student or the variant has a file: the CES students and the switch "Test separat pentru elevii cu CES" (`CesSwitch.tsx`, also on Test nou; off asks first when there are CES files, then removes them through `setCesOff`), its own `TestFiles` with `variant="ces"` while the switch is on, the total warning, and "Șterge varianta CES" only once the class has no CES student left) and the notice of the CES papers that wait for their barem in Corectare (`CesWaiting`); `testPage/variant.ts` picks a variant's parts of a test. What a draft or open test misses (`missing.ts`) is said in the stages, in "De făcut", as orange "lipsește" (and green "gata") marks in `TestFiles`, and as `MissingList.tsx` under "Începe testul" (with why each part matters) and under "Creează testul". `TestFiles`, `useGeneratedBarem`, `PrintTest` and `ExerciseListBanner` take `variant`. The class report, its CSV and the class PDF draw the tables of `reportTables` (`shared/stats.ts`): one, or the class papers then the CES papers with their own exercises; the CSV never names CES.
- `testPage/PrintTest.tsx` is a card per variant in Tipărire, a region named "Testul cu cod QR" or "Testul CES cu cod QR" (spec 2026-11-15 §3): on a draft and an open test, the test file it waits for, the PDF being made, its failure and retry, "Pregătește testul cu cod QR" for a draft made before tests got their link at once, and once ready a drawing of a page with its QR code (not the PDF), how many copies (`copiesLine`: the class without its CES students when the test has a CES variant), "Tipărește" (filled blue for the class test, quiet for the CES one) and "Descarcă PDF"; after the test was given, "Testul s-a dat în clasă." and the cards of the PDFs made before. "Tipărește" (`testPage/printPdf.ts`) loads the PDF in a hidden same-origin frame (`.print-frame`, one at a time) and calls its `print()`; an answer that is not a PDF prints nothing and says so; on an iPhone, an iPad and in Safari (`printsInFrame`), when the page cannot reach the frame, when the browser refuses to print it, or after `PRINT_LOAD_TIMEOUT`, the PDF opens in a new tab instead. The frame needs `frame-src 'self'` in the pages' security policy (`public/_headers`), the same rule that lets the review show a paper's PDF pages in a frame. `TestActions` in `testPage/StagePanel.tsx` (the panel În clasă) holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
- `pages/SettingsPage.tsx` is Setări (redesign spec §11.8, administrators only): three tabs, with the tab in the address (`?tab=corectarea`, `?tab=robotul`; none, or one it does not know, is "Conturi", and a click replaces the address). The three panels stay drawn, the others `hidden`, so a new key or password shown once survives a look at another tab. "Conturi" (`settingsPage/AccountsSection.tsx`) holds a red-edged card of the accounts that wait (gone when none waits; "Refuză toate" from two up) and "Toate conturile", with ⋯ (`shell/useSmallMenu.ts`) on a teacher's row only: "Fă cont complet" or "Fă cont demo", "Parolă nouă", "Închide contul", and for a closed account "Redeschide contul". An item closes the menu and gives the focus back to ⋯ before it asks or acts; the new password and an error show in a row under the account. Every row, an administrator's included, has "Detalii", which opens "Activitatea contului" (what the account used, the grading of the last 30 days, the room its papers take, the classes, students and tests it made, the last login), "Consumul robotului" (by kind: what worked, what it gave up on, the tokens, and the failure rate), "Fiecare test" (each test's robot work, graded papers, corrected points and tokens) and "Istoricul contului" (its changes with their times, "de <cine>" when an administrator made one), from `GET /api/admin/accounts/:id`, read only when opened. Once a request was refused, a card "Conturi refuzate" under the accounts lists who asked, when, and who said no. The red count of "Conturi" reads `['accounts']` on every tab. "Corectarea" saves each control as it changes: the new value shows at once, the control stays on while it saves, and a refusal puts back the saved value. "Robotul" holds "Starea robotului" (a tag: "lucrează acum" or "nu lucrează acum") and "Cheia robotului" with the day it was made (`robotKeyAt`; a key made before that was kept has none). Below 40rem each account row is a block (CSS).
```

- [ ] **Step 20: Edit `docs/superpowers/specs/2026-11-15-fisa-testului-redesign-design.md`**

Find this block:

```markdown
  the PDF), "Testul cu cod QR", "Codul QR apare în colțul fiecărei pagini.", and how many copies:
  "Ai N elevi: tipărește N copii." (with a CES variant: the class without its CES students).
- Buttons: "Tipărește" (filled blue, the panel's main action) and "Descarcă PDF" (quiet).
```

Replace it with:

```markdown
  the PDF), "Testul cu cod QR", "Codul QR apare în colțul fiecărei pagini.", and how many copies:
  "Tipărește 23 de copii, câte una pentru fiecare elev." (with a CES variant: "…, pentru elevii fără CES."
  on the class card and "…, pentru elevii cu CES." on the CES card; no line for a class with no student).
- Buttons: "Tipărește" (filled blue, the panel's main action) and "Descarcă PDF" (quiet).
```

- [ ] **Step 21: Edit `docs/superpowers/specs/2026-11-15-fisa-testului-redesign-design.md`**

Find this block:

```markdown
  where the browser's own viewer prints it. While the PDF loads, the button says it is getting ready.
- The hints of today stay as hints: "Poți tipări testul de acum…" for a draft, and the Word warning.
- The other states of `PrintTest` stay (no file, no link, being made, failed and retry).
```

Replace it with:

```markdown
  where the browser's own viewer prints it. While the PDF loads, the button says it is getting ready.
- The pages' security policy (`public/_headers`) must allow frames of the site's own files:
  `frame-src 'self' https://challenges.cloudflare.com` (it allowed only Turnstile). The API's files
  already allow only our own pages (`X-Frame-Options: SAMEORIGIN`). This also lets the review show
  a paper's PDF pages, which are in frames too.
- The hints of today stay as hints: "Poți tipări testul de acum…" for a draft (on the class card only),
  and the Word warning. An answer that is not a PDF prints nothing and says so under the button.
- The other states of `PrintTest` stay (no file, no link, being made, failed and retry).
```

- [ ] **Step 22: Run the typecheck and the whole suite**

Run: `npm run typecheck`
Expected: no output after the command line (exit code 0).

Run: `npm test`
Expected: `Test Files  183 passed | 1 skipped (184)`, `Tests  2829 passed | 3 skipped (2832)` (the same three times more, once with `TZ=UTC`).

- [ ] **Step 23: Commit**

```bash
git add src/admin/testPage/printPdf.ts src/admin/testPage/printPdf.test.ts src/admin/testPage/PrintTest.tsx src/admin/testPage/PrintTest.test.tsx src/admin/testPage/StagePanel.tsx src/ui/brand.css public/_headers src/AGENTS.md docs/superpowers/specs/2026-11-15-fisa-testului-redesign-design.md src/admin/pages/TestPage.test.tsx src/admin/pages/TestPagePrint.test.tsx src/admin/pages/TestPageCes.test.tsx src/landing/quickTry/ui.test.ts
git commit -m "Print the test with the QR code from Tipărire"
```

Run: `git diff --stat refs/protofs/fs3 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

### After Task 3: Look at the pages, and print once

- [ ] **Step 1: Check the test page in the browser**

Run `npm run db:local`, then `npm run preview`, then `npm run smoke` in a second terminal: the smoke test leaves one class with a test and a graded paper. Log in at `http://127.0.0.1:8788/teacher/` as the local teacher, open that test and make a new draft test in the same class, at 1366 px and on a 390 px phone, light and dark.
Expected: "Acțiuni" at the top right opens the four items with their descriptions; "Redenumește testul" and "Schimbă materia" open dialogs; Fișa testului shows the state chip, two grey numbers and the facts, with no bold, no files and no buttons; În clasă of the draft shows the students' link with "Copiază linkul" and "Arată codul QR pe tot ecranul". On the phone the menu is as wide as the head and no page scrolls sideways.

- [ ] **Step 2: Print from Tipărire after the merge**

The local database has no print PDF (the print container makes it). After the deploy, on https://mqgrader.ro/teacher/, open a draft whose test with the QR code is ready, go to Tipărire and press "Tipărește" in Chrome or Edge, then in Firefox.
Expected: the computer's print window opens on the test with its QR code (not a blank page, not a JSON text). If a browser opens the PDF in a new tab instead, its print button there prints it. Report what each browser did.

Then open, in Verificare, a paper a student sent as a PDF.
Expected: its pages show in the page (before this plan the security policy blocked those frames).

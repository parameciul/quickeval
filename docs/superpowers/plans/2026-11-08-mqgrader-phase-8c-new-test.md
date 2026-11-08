# MQGrader Phase 8c: The "Test nou" form — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 4 must run in the main session, not in a subagent:** it looks at the app in a browser, and every outward step (push, pull request) needs the user's explicit yes.

**Goal:** "Test nou" as the user picked it in round 7 (spec §11.7, page A): three numbered steps (the class and the title, the test, the barem), the barem uploaded now, generated from the test, or added later, and beside them the card "După ce creezi testul".

**Architecture:** No API change, no migration. A new `src/admin/newTest/FileDrop.tsx` is the drop area of a file (a click, or a file dragged onto it), with the check of `TestFileInput`. `NewTestPage.tsx` is rewritten: the steps, the barem's three choices, the side card; "Creează testul" makes the test, sends the test file, then the barem file or asks for the generated barem (`api.generateBarem`, the route the test page uses). `NewClassDialog` gets an optional `onCreated`, so "Clasă nouă" can make a class without leaving the form.

**Tech Stack:** Node 24, TypeScript, React 19, TanStack Query, React Router, Hono on Cloudflare Pages with D1, Vitest 5, Testing Library. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md` (§1 decision 36, §11.7). Root `AGENTS.md`, `src/AGENTS.md` and `server/AGENTS.md` hold the project rules. The approved prototype: round 7 https://claude.ai/artifact/NTc1cfWBhUF4EkkCZN2uNm, page "Test nou" A.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- No server file changes: making a test, its files and the generated barem keep their routes, rules and SQL.
- Flat colours only: no gradient anywhere in `brand.css`; a shadow only on what floats. Orange only for what waits on the teacher.
- No page tells students that AI grades their work; this plan changes no student page.
- Do not run Prettier or any formatter: the repo has no formatter configuration, and its defaults rewrite the quotes of whole files.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A` (the checkout holds local files that must not be committed: `.claude/launch.json` entries, untracked plan files).
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root `D:\Projects\QuickEval`, on the branch `feature/mqgrader-new-test`. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy, on `main` too. If only tests of those three files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts runner/api.test.ts` alone. Then the full run counts as passed when its failed and passed tests add up to the expected passed number; say so in the task report.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; overwrite all of it with exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/proto13/c1` … `refs/proto13/c3`, one per task, on `refs/proto13/cbase` (the same files as `main` at `60d5a33`). After Task N, `git diff --stat refs/proto13/cN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`). Four tests run the real pandoc (`runner/baremDocx.test.ts`, `runner/baremTask.test.ts`, `runner/workdir.test.ts`): without pandoc they skip too, so every total shows 4 fewer passed and 4 more skipped.

## Rulings made while planning

Settled while building the prototype on 2026-11-08.

1. "Creează testul" makes the test, then sends the test file, then either the barem file ("Încarc baremul acum") or asks the robot for the barem ("Generează baremul din test"). The barem is asked for only once the test file was sent: the robot writes it from that file. What fails after the test exists (a file, the generated barem) does not stop the rest: the test page opens with one notice, the first failure ("Testul a fost creat, dar fișierul Test.pdf nu s-a încărcat: …", "Testul a fost creat, dar baremul nu s-a putut genera: …"), as a failed file does today. A test file that fails while "Generează" is chosen gives only its own notice: the test page's Pregătire offers "Generează baremul" again.
2. "Generează baremul din test" is off until a test file is chosen, with the line "Alege întâi testul, la pasul 2." in its choice. A test file that is refused after it was chosen (another pick that is not PDF or Word) moves the choice to "Mai târziu".
3. "Încarc baremul acum" is chosen first, as on the round 7 page; with no file picked it is the same as "Mai târziu". Its drop area shows only under it, but stays in the page (`hidden`) while another choice is made: the picked file comes back with the choice, and it is sent only with this choice.
4. The answer of `generateBarem` names how the robot started; the page does not show it, as the old page did not show the answer of a file upload: the test page's Pregătire shows "Se generează baremul…" and its own robot line and "Pornește robotul".
5. "Nu e în listă? Clasă nouă" shows only when the address names no class (`?clasa`). It opens "Clasă nouă" (`NewClassDialog`) on the page: its new `onCreated` takes the new class, which the form then chooses, instead of opening the class page. The focus goes back to "Clasă nouă", as the dialog does for every opener.
6. A school year with no class keeps today's line "Nu ai nicio clasă în anul școlar … Adaugă întâi o clasă.": the empty states are Phase 8e.
7. The drop area (`FileDrop`) is a label for a hidden file input, so a click and the keyboard open the file picker (its focus ring is on the area); a file dragged onto it is taken too, and the area is tinted blue while one is over it. A file goes through the check of `TestFileInput`; a refused one shows its problem and drops the file picked before it. Its name for a screen reader starts with "Fișierul testului" or "Fișierul baremului". After a pick it shows "Alege alt fișier sau trage-l aici" and the file's name.
8. The layout is round 7's: the side card is sticky beside the form, and below 73.75rem (1180px) it goes under the form (at 1024px too, where the bar leaves too little room for both); on a phone the step's number stays beside it, as on the round 7 phone page. The side card is a `class-card`.
9. Every text is the spec's, word for word. "Fiecare pagină are codul" is true: `runner/print/stamp_qr.py` stamps the QR code on every page of the print PDF.

## Review Focus

1. The barem is asked for only after the test file was sent (tests in Task 2: "generates the barem from the test, after the test is sent", "does not ask for a generated barem when the test failed to upload").
2. A picked barem file is sent only with its own choice (test in Task 2: "does not send a picked barem when another choice is made, and keeps it for its own").
3. "Generează" cannot be chosen without a test file (tests in Task 2: "cannot generate the barem without the test, and says why", "moves to Mai târziu when the test file it would generate from is refused").
4. "Clasă nouă" keeps the teacher on the form (test in Task 2: "makes a new class in place and chooses it").
5. A dropped file is checked like a picked one (tests in Task 1: "refuses a dropped file that is not PDF or Word, and forgets the file before it", "ignores a drop while it is off").

---

### Before Task 1: The branch

- [ ] **Step 1: Check the branch**

No other Claude Code session may work in this checkout meanwhile (in the desktop app: `list_sessions {"linked": true}` shows none running). The branch `feature/mqgrader-new-test` was made while planning, from `main` at `60d5a33`. Run `git switch feature/mqgrader-new-test`, then `git log --oneline -1`.

Expected: `60d5a33 Merge pull request #49 from parameciul/feature/mqgrader-way-in`. The untracked plan files and the local changes of `.claude/launch.json` come along; they are never committed (this plan is committed in Task 4).

### Task 1: The drop area

A drop area for the test or the barem: a click picks a file, a dragged file is taken too.

**Files:**
- Create: `src/admin/newTest/FileDrop.tsx`
- Modify: `src/ui/brand.css`
- Test: `src/admin/newTest/FileDrop.test.tsx` (new)

**Interfaces:**
- Produces: `FileDrop({ id, name, onPick, disabled? })` from `newTest/FileDrop.tsx`; the CSS classes `file-drop-field`, `file-drop`, `is-over`, `file-drop-name` in `brand.css`.

- [ ] **Step 1: Create `src/admin/newTest/FileDrop.test.tsx`**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../../shared/files.ts';
import { FileDrop } from './FileDrop.tsx';

const pdf = (name: string) => new File(['%PDF-1.7'], name, { type: PDF_TYPE });
const text = () => new File(['x'], 'notes.txt', { type: 'text/plain' });

function setup(disabled = false) {
  const onPick = vi.fn();
  const { container } = render(<FileDrop id="drop" name="Fișierul testului" onPick={onPick} disabled={disabled} />);
  const area = container.querySelector('.file-drop')!;
  return { onPick, area };
}

describe('FileDrop', () => {
  it('names the file for a screen reader and takes a picked file', async () => {
    const { onPick, area } = setup();
    const input = screen.getByLabelText(/^Fișierul testului: Alege fișierul sau trage-l aici/);
    const file = pdf('Test.pdf');
    await userEvent.upload(input, file);
    expect(onPick).toHaveBeenLastCalledWith(file);
    expect(area).toHaveTextContent('Alege alt fișier sau trage-l aici');
    expect(area.querySelector('.file-drop-name')).toHaveTextContent('Test.pdf');
  });

  it('takes a file dragged onto it, and marks the area while it is over', () => {
    const { onPick, area } = setup();
    const file = pdf('Barem.pdf');
    fireEvent.dragOver(area, { dataTransfer: { files: [file] } });
    expect(area).toHaveClass('is-over');
    fireEvent.drop(area, { dataTransfer: { files: [file] } });
    expect(area).not.toHaveClass('is-over');
    expect(onPick).toHaveBeenLastCalledWith(file);
    expect(area.querySelector('.file-drop-name')).toHaveTextContent('Barem.pdf');
  });

  it('drops the mark when the file leaves the area', () => {
    const { area } = setup();
    fireEvent.dragOver(area, { dataTransfer: { files: [] } });
    fireEvent.dragLeave(area);
    expect(area).not.toHaveClass('is-over');
  });

  it('refuses a dropped file that is not PDF or Word, and forgets the file before it', () => {
    const { onPick, area } = setup();
    fireEvent.drop(area, { dataTransfer: { files: [pdf('Test.pdf')] } });
    fireEvent.drop(area, { dataTransfer: { files: [text()] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Încarcă un fișier PDF sau Word (.docx).');
    expect(onPick).toHaveBeenLastCalledWith(null);
    expect(area.querySelector('.file-drop-name')).toBeNull();
  });

  it('takes a good file after a refused one, and clears the problem', () => {
    const { onPick, area } = setup();
    fireEvent.drop(area, { dataTransfer: { files: [text()] } });
    const file = pdf('Test.pdf');
    fireEvent.drop(area, { dataTransfer: { files: [file] } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onPick).toHaveBeenLastCalledWith(file);
  });

  it('ignores a drop while it is off', () => {
    const { onPick, area } = setup(true);
    fireEvent.dragOver(area, { dataTransfer: { files: [] } });
    expect(area).not.toHaveClass('is-over');
    fireEvent.drop(area, { dataTransfer: { files: [pdf('Test.pdf')] } });
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Fișierul testului/)).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/admin/newTest/FileDrop.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  no tests`: `FileDrop.test.tsx` cannot load (`Failed to resolve import "./FileDrop.tsx"`).

- [ ] **Step 3: Create `src/admin/newTest/FileDrop.tsx`**

```tsx
import { useState, type DragEvent } from 'react';
import { DOCX_TYPE, fileProblem, PDF_TYPE, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE } from '../../../shared/files.ts';

const ACCEPT = ['.pdf', '.docx', PDF_TYPE, DOCX_TYPE].join(',');

// A drop area for the test or the barem of "Test nou" (redesign spec §11.7):
// a click opens the file picker, and a file dragged onto it is taken too. A
// file goes through the check of `TestFileInput` (PDF or Word, at most
// 25 MB): one that cannot be sent shows its problem and is not passed on, and
// the file picked before it is dropped too. `name` says to a screen reader
// which file this is ("Fișierul testului").
export function FileDrop({
  id,
  name,
  onPick,
  disabled = false,
}: {
  id: string;
  name: string;
  onPick: (file: File | null) => void;
  disabled?: boolean;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const take = (picked: File | null) => {
    const found = picked ? fileProblem(picked, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE) : null;
    const file = found ? null : picked;
    setProblem(found);
    setChosen(file ? file.name : null);
    onPick(file);
  };
  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (!disabled) setOver(true);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    if (!disabled) take(event.dataTransfer.files[0] ?? null);
  };

  return (
    <div className="file-drop-field">
      <input
        id={id}
        type="file"
        className="sr-only"
        accept={ACCEPT}
        disabled={disabled}
        onChange={(event) => take(event.target.files?.[0] ?? null)}
      />
      <label
        htmlFor={id}
        className={over ? 'file-drop is-over' : 'file-drop'}
        onDragOver={onDragOver}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M10 13V3.5M6.5 7 10 3.5 13.5 7" />
          <path d="M3.5 13v3.5h13V13" />
        </svg>
        <span>
          <span className="sr-only">{name}: </span>
          <b>{chosen ? 'Alege alt fișier' : 'Alege fișierul'}</b> sau trage-l aici
        </span>
        {chosen && <span className="file-drop-name">{chosen}</span>}
      </label>
      {problem && (
        <p className="alert" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Edit `src/ui/brand.css`**

Find this block:

```css
  max-width: 100%;
  font: inherit;
}

```

Replace it with:

```css
  max-width: 100%;
  font: inherit;
}

/* The drop area of "Test nou": a click picks a file, and a file can be dragged
   onto it. The input is hidden but stays focusable; the area shows its focus
   ring. Its children let the drag through, so leaving one of them is not
   leaving the area. */
.file-drop {
  display: grid;
  place-items: center;
  gap: 0.25rem;
  max-width: 34rem;
  padding: 1.25rem;
  border: 1px dashed var(--control);
  border-radius: var(--radius);
  background: var(--raised);
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 400;
  text-align: center;
  cursor: pointer;
}

.file-drop > * {
  pointer-events: none;
}

.file-drop b,
.file-drop-name {
  color: var(--text);
}

.file-drop-name {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.file-drop.is-over {
  border-color: var(--ink);
  background: var(--ink-tint);
}

.file-drop-field input:focus-visible + .file-drop {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

.file-drop-field input:disabled + .file-drop {
  opacity: 0.55;
  cursor: not-allowed;
}

.file-drop-field .alert {
  margin: 0.5rem 0 0;
}

```

- [ ] **Step 5: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  124 passed | 1 skipped (125)`, `Tests  1979 passed | 3 skipped (1982)`.

- [ ] **Step 6: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add src/admin/newTest/FileDrop.tsx src/admin/newTest/FileDrop.test.tsx src/ui/brand.css
git commit -m "Add the drop area of Test nou"
```

### Task 2: The page

"Test nou" as three numbered steps, the barem's three choices, "Clasă nouă" on the page, and the card "După ce creezi testul".

**Files:**
- Replace: `src/admin/pages/NewTestPage.tsx`
- Modify: `src/admin/classPage/ClassDialogs.tsx`, `src/ui/brand.css`
- Test: `src/admin/pages/NewTestPage.test.tsx`

**Interfaces:**
- Consumes: `FileDrop` (Task 1).
- Produces: `NewClassDialog({ onClose, onCreated? })` in `classPage/ClassDialogs.tsx`; the CSS classes `new-test`, `steps`, `step`, `choices`, `choice`, `choice-extra`, `choice-drop`, `new-test-foot`, `new-test-next` in `brand.css`.

- [ ] **Step 1: Replace `src/admin/pages/NewTestPage.test.tsx`**

```tsx
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DOCX_TYPE, PDF_TYPE } from '../../../shared/files.ts';
import { ApiError } from '../api.ts';
import { createFakeApi } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';

const classes = () =>
  createFakeApi({
    classes: [
      { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 2, name: '7E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 3, name: '9R2', schoolYear: 2026, archived: true, studentCount: 0 },
    ],
    students: { 1: [{ id: 10, fullName: 'Pop Ion', active: true, canDelete: true }] },
  });

const pdf = (name: string) => new File(['%PDF-1.7'], name, { type: PDF_TYPE });
const testField = () => screen.getByLabelText(/^Fișierul testului/);
const baremField = () => screen.getByLabelText(/^Fișierul baremului/);
const choice = (name: RegExp) => screen.getByRole('radio', { name });

// The class and the title, the first step.
async function fillClassAndTitle(classId = '1') {
  await userEvent.selectOptions(await screen.findByLabelText('Clasa'), classId);
  await userEvent.type(screen.getByLabelText('Titlul testului'), 'Fracții');
}

describe('NewTestPage', () => {
  it('shows the three steps and what comes after', async () => {
    renderAdmin('/teste/nou', classes());
    const steps = await screen.findAllByRole('listitem');
    expect(within(steps[0]!).getByRole('heading', { level: 2 })).toHaveTextContent('Clasa și titlul');
    expect(screen.getByRole('heading', { level: 2, name: 'Testul' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Baremul' })).toBeInTheDocument();
    const next = screen.getByRole('region', { name: 'După ce creezi testul' });
    expect(next).toHaveTextContent('Linkul elevilor e gata imediat');
    expect(next).toHaveTextContent('Tipărești testul cu cod QR');
    expect(next).toHaveTextContent('În ziua testului: Începe testul');
    expect(screen.getByText('Testul rămâne ciornă până apeși „Începe testul”.')).toBeInTheDocument();
  });

  it('offers the classes that are not archived', async () => {
    renderAdmin('/teste/nou', classes());
    const select = await screen.findByLabelText('Clasa');
    const options = [...(select as HTMLSelectElement).options].map((option) => option.textContent);
    expect(options).toEqual(['Alege clasa', 'Clasa 6E2', 'Clasa 7E2']);
  });

  it('creates the test, uploads both files, and opens the test', async () => {
    const api = classes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle();
    const test = pdf('Test.pdf');
    const barem = new File(['PK'], 'Barem.docx', { type: DOCX_TYPE });
    await userEvent.upload(testField(), test);
    expect(choice(/^Încarc baremul acum/)).toBeChecked();
    await userEvent.upload(baremField(), barem);
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));

    await expectLocation('/teste/6E2-26T1');
    expect(api.createTest).toHaveBeenCalledWith({ classId: 1, title: 'Fracții' });
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'test', test);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'barem', barem);
    expect(api.generateBarem).not.toHaveBeenCalled();
  });

  it('takes a test file dragged onto its area', async () => {
    const api = classes();
    const { container } = renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle();
    const test = pdf('Test.pdf');
    fireEvent.drop(container.querySelector('label[for="new-test-file"]')!, { dataTransfer: { files: [test] } });
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/6E2-26T1');
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'test', test);
  });

  it('generates the barem from the test, after the test is sent', async () => {
    const api = classes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle();
    await userEvent.upload(testField(), pdf('Test.pdf'));
    await userEvent.click(choice(/^Generează baremul din test/));
    expect(baremField().closest('.choice-drop')).not.toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));

    await expectLocation('/teste/6E2-26T1');
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1');
    expect(api.uploadTestFile.mock.invocationCallOrder[0]).toBeLessThan(api.generateBarem.mock.invocationCallOrder[0]!);
    expect(api.uploadTestFile).toHaveBeenCalledTimes(1);
  });

  it('cannot generate the barem without the test, and says why', async () => {
    renderAdmin('/teste/nou', classes());
    await screen.findByLabelText('Clasa');
    const generate = choice(/^Generează baremul din test/);
    expect(generate).toBeDisabled();
    expect(generate.closest('label')).toHaveTextContent('Alege întâi testul, la pasul 2.');
    await userEvent.upload(testField(), pdf('Test.pdf'));
    expect(generate).toBeEnabled();
    expect(generate.closest('label')).not.toHaveTextContent('Alege întâi testul');
  });

  it('moves to Mai târziu when the test file it would generate from is refused', async () => {
    const api = classes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    const user = userEvent.setup({ applyAccept: false });
    await user.selectOptions(await screen.findByLabelText('Clasa'), '1');
    await user.type(screen.getByLabelText('Titlul testului'), 'Fracții');
    await user.upload(testField(), pdf('Test.pdf'));
    await user.click(choice(/^Generează baremul din test/));
    await user.upload(testField(), new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(choice(/^Mai târziu/)).toBeChecked();
    expect(choice(/^Generează baremul din test/)).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/6E2-26T1');
    expect(api.uploadTestFile).not.toHaveBeenCalled();
    expect(api.generateBarem).not.toHaveBeenCalled();
  });

  it('does not send a picked barem when another choice is made, and keeps it for its own', async () => {
    const api = classes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle();
    await userEvent.upload(baremField(), pdf('Barem.pdf'));
    await userEvent.click(choice(/^Mai târziu/));
    await userEvent.click(choice(/^Încarc baremul acum/));
    expect(baremField().closest('.file-drop-field')).toHaveTextContent('Barem.pdf');
    await userEvent.click(choice(/^Mai târziu/));
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/6E2-26T1');
    expect(api.uploadTestFile).not.toHaveBeenCalled();
  });

  it('creates the test alone when no file is chosen', async () => {
    const api = classes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle();
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/6E2-26T1');
    expect(api.uploadTestFile).not.toHaveBeenCalled();
    expect(api.generateBarem).not.toHaveBeenCalled();
  });

  it('picks the class named in the link, without Clasă nouă', async () => {
    renderAdmin('/teste/nou?clasa=2', classes());
    expect(await screen.findByLabelText('Clasa')).toHaveValue('2');
    expect(screen.queryByRole('button', { name: 'Clasă nouă' })).not.toBeInTheDocument();
  });

  it('makes a new class in place and chooses it', async () => {
    const api = classes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await userEvent.click(await screen.findByRole('button', { name: 'Clasă nouă' }));
    const dialog = screen.getByRole('dialog', { name: 'Clasă nouă' });
    await userEvent.type(within(dialog).getByLabelText('Numele clasei'), '8A');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adaugă clasa' }));

    await expectLocation('/teste/nou');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const select = screen.getByLabelText('Clasa') as HTMLSelectElement;
    expect(select.selectedOptions[0]).toHaveTextContent('Clasa 8A');
    expect(screen.getByRole('button', { name: 'Clasă nouă' })).toHaveFocus();
    expect(api.createClass).toHaveBeenCalledWith({ name: '8A', schoolYear: 2026 });
  });

  it('refuses a file that is not PDF or Word before sending anything', async () => {
    const api = classes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    const user = userEvent.setup({ applyAccept: false });
    await user.selectOptions(await screen.findByLabelText('Clasa'), '1');
    await user.type(screen.getByLabelText('Titlul testului'), 'Fracții');
    await user.upload(testField(), new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Încarcă un fișier PDF sau Word (.docx).');
    await user.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/6E2-26T1');
    expect(api.uploadTestFile).not.toHaveBeenCalled();
  });

  it('opens the new test with a notice when a file fails to upload', async () => {
    const api = classes();
    api.uploadTestFile.mockRejectedValueOnce(new ApiError(413, 'file_too_big', 'Fișierul are peste 25 MB.'));
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle();
    await userEvent.upload(testField(), pdf('Test.pdf'));
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/6E2-26T1 | Testul a fost creat, dar fișierul Test.pdf nu s-a încărcat: Fișierul are peste 25 MB.');
  });

  it('does not ask for a generated barem when the test failed to upload', async () => {
    const api = classes();
    api.uploadTestFile.mockRejectedValueOnce(new ApiError(413, 'file_too_big', 'Fișierul are peste 25 MB.'));
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle();
    await userEvent.upload(testField(), pdf('Test.pdf'));
    await userEvent.click(choice(/^Generează baremul din test/));
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/6E2-26T1 | Testul a fost creat, dar fișierul Test.pdf nu s-a încărcat: Fișierul are peste 25 MB.');
    expect(api.generateBarem).not.toHaveBeenCalled();
  });

  it('opens the new test with a notice when the barem cannot be generated', async () => {
    const api = classes();
    api.generateBarem.mockRejectedValueOnce(new ApiError(409, 'not_editable', 'Baremul se poate genera doar înainte de evaluare.'));
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle();
    await userEvent.upload(testField(), pdf('Test.pdf'));
    await userEvent.click(choice(/^Generează baremul din test/));
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation(
      '/teste/6E2-26T1 | Testul a fost creat, dar baremul nu s-a putut genera: Baremul se poate genera doar înainte de evaluare.',
    );
  });

  it('shows the server message when the test cannot be made', async () => {
    const api = classes();
    api.createTest.mockRejectedValueOnce(new ApiError(409, 'class_archived', 'Clasa este arhivată.'));
    renderAdmin('/teste/nou', api);
    await fillClassAndTitle('2');
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Clasa este arhivată.');
  });

  it('asks for a class first when the year has none', async () => {
    renderAdmin('/teste/nou', createFakeApi());
    expect(await screen.findByRole('link', { name: 'Adaugă întâi o clasă.' })).toHaveAttribute('href', '/clase');
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/NewTestPage.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  12 failed | 5 passed (17)`: the old page has no steps (`Unable to find role="listitem"`), no drop areas (`Unable to find a label with the text of: /^Fișierul testului/`, `… /^Fișierul baremului/`; the dropped file is not sent: `expected "vi.fn()" to be called with arguments: [ '6E2-26T1', 'test', File{} ]`), no barem choices (`Unable to find an accessible element with the role "radio" and name `/^Generează baremul din test/``) and no "Clasă nouă" (`Unable to find role="button" and name "Clasă nouă"`). The five that pass hold for the old page too: the classes offered, the class of the link (and no "Clasă nouă"), a test with no file, the server's message, and a year with no class.

- [ ] **Step 3: Replace `src/admin/pages/NewTestPage.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { displayClassName } from '../../../shared/classes.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { MAX_TITLE_LENGTH } from '../../../shared/tests.ts';
import { useApi } from '../ApiContext.tsx';
import { NewClassDialog } from '../classPage/ClassDialogs.tsx';
import { ErrorMessage, errorText } from '../ErrorMessage.tsx';
import { FileDrop } from '../newTest/FileDrop.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';

// Where the barem comes from: a file now, the robot from the test, or later.
type BaremChoice = 'upload' | 'generate' | 'later';

// /teste/nou (redesign spec §11.7): three numbered steps, the class and the
// title, the test, and the barem, with what happens next on the side.
// ?clasa=<id> picks the class (the class page links here). The test and the
// barem can come now or later; the test page holds them too.
export function NewTestPage() {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { year } = useSchoolYear();
  const [params] = useSearchParams();
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });
  const [classId, setClassId] = useState(params.get('clasa') ?? '');
  const [title, setTitle] = useState('');
  const [testFile, setTestFile] = useState<File | null>(null);
  const [baremFile, setBaremFile] = useState<File | null>(null);
  const [barem, setBarem] = useState<BaremChoice>('upload');
  const [newClass, setNewClass] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      const code = await api.createTest({ classId: Number(classId), title });
      // The test exists now. What fails next can be done again from the test
      // page, so the teacher goes there with a notice.
      let notice: string | null = null;
      const send = async (file: File, kind: 'test' | 'barem') => {
        try {
          await api.uploadTestFile(code, kind, file);
          return true;
        } catch (err) {
          notice ??= `Testul a fost creat, dar fișierul ${file.name} nu s-a încărcat: ${errorText(err)}`;
          return false;
        }
      };
      const testSent = testFile !== null && (await send(testFile, 'test'));
      if (barem === 'upload' && baremFile) await send(baremFile, 'barem');
      // The robot writes the barem from the test file, so only once it is sent.
      if (barem === 'generate' && testSent) {
        try {
          await api.generateBarem(code);
        } catch (err) {
          notice ??= `Testul a fost creat, dar baremul nu s-a putut genera: ${errorText(err)}`;
        }
      }
      return { code, notice };
    },
    onSuccess: async ({ code, notice }) => {
      await queryClient.invalidateQueries({ queryKey: ['tests'] });
      navigate(`/teste/${code}`, { state: notice ? { notice } : null });
    },
  });

  const open = classes.data?.filter((item) => !item.archived) ?? [];
  const selected = open.some((item) => String(item.id) === classId) ? classId : '';

  // Without the test there is nothing to generate the barem from.
  const pickTest = (file: File | null) => {
    setTestFile(file);
    if (file === null && barem === 'generate') setBarem('later');
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  const choice = (value: BaremChoice, label: string, line: string, extra?: string) => (
    <label className="choice">
      <input
        type="radio"
        name="barem"
        value={value}
        checked={barem === value}
        disabled={value === 'generate' && testFile === null}
        onChange={() => setBarem(value)}
      />
      <span>
        <b>{label}</b>
        <span>{line}</span>
        {extra && <span className="choice-extra">{extra}</span>}
      </span>
    </label>
  );

  return (
    <section>
      <p className="back-link">
        <Link to="/">← Toate testele</Link>
      </p>
      <h1>Test nou</h1>

      {classes.isPending && <p>Se încarcă…</p>}
      {classes.error && <ErrorMessage error={classes.error} />}
      {classes.data && open.length === 0 && (
        <p className="hint">
          Nu ai nicio clasă în anul școlar {formatSchoolYear(year)}. <Link to="/clase">Adaugă întâi o clasă.</Link>
        </p>
      )}
      {open.length > 0 && (
        <div className="new-test">
          <form onSubmit={onSubmit}>
            <ol className="steps">
              <li className="step">
                <div>
                  <h2>Clasa și titlul</h2>
                  <p>Titlul îl văd și elevii, pe pagina lor.</p>
                  <div className="form-field">
                    <label htmlFor="test-class">Clasa</label>
                    <select id="test-class" value={selected} onChange={(event) => setClassId(event.target.value)} required>
                      <option value="">Alege clasa</option>
                      {open.map((item) => (
                        <option key={item.id} value={item.id}>
                          {displayClassName(item.name)}
                        </option>
                      ))}
                    </select>
                    {params.get('clasa') === null && (
                      <span className="form-hint">
                        Nu e în listă?{' '}
                        <button type="button" className="link-button" onClick={() => setNewClass(true)}>
                          Clasă nouă
                        </button>
                      </span>
                    )}
                  </div>
                  <div className="form-field">
                    <label htmlFor="test-title">Titlul testului</label>
                    <input
                      id="test-title"
                      type="text"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="de exemplu Test de evaluare inițială"
                      maxLength={MAX_TITLE_LENGTH}
                      required
                    />
                  </div>
                </div>
              </li>
              <li className="step">
                <div>
                  <h2>Testul</h2>
                  <p>Fișierul pe care îl tipărești. PDF sau Word. Poți să-l adaugi și mai târziu.</p>
                  <FileDrop id="new-test-file" name="Fișierul testului" onPick={pickTest} />
                </div>
              </li>
              <li className="step">
                <div>
                  <h2>Baremul</h2>
                  <p>După el se dă punctajul.</p>
                  <fieldset className="choices">
                    <legend className="sr-only">Baremul</legend>
                    {choice('upload', 'Încarc baremul acum', 'PDF sau Word.')}
                    {/* Kept while another choice is made, so the file comes back with it. */}
                    <div className="choice-drop" hidden={barem !== 'upload'}>
                      <FileDrop id="new-barem-file" name="Fișierul baremului" onPick={setBaremFile} />
                    </div>
                    {choice(
                      'generate',
                      'Generează baremul din test',
                      'Primești o propunere în câteva minute. O verifici și o confirmi înainte de corectare.',
                      testFile === null ? 'Alege întâi testul, la pasul 2.' : undefined,
                    )}
                    {choice('later', 'Mai târziu', 'Îl adaugi din pagina testului, la Pregătire. Corectarea nu începe fără barem.')}
                  </fieldset>
                </div>
              </li>
            </ol>
            <div className="new-test-foot">
              <button className="button button-big" type="submit" disabled={create.isPending || selected === ''}>
                {create.isPending ? 'Se creează…' : 'Creează testul'}
              </button>
              <span className="form-hint">Testul rămâne ciornă până apeși „Începe testul”.</span>
            </div>
            {create.error && <ErrorMessage error={create.error} />}
          </form>

          <section className="class-card new-test-next" aria-labelledby="new-test-next">
            <div className="class-card-head">
              <h2 id="new-test-next">După ce creezi testul</h2>
            </div>
            <ul>
              <li>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d="M8.5 11.5a3 3 0 0 0 4.24 0l2.5-2.5a3 3 0 0 0-4.24-4.24L10 5.76" />
                  <path d="M11.5 8.5a3 3 0 0 0-4.24 0l-2.5 2.5a3 3 0 0 0 4.24 4.24l1-1" />
                </svg>
                <div>
                  <b>Linkul elevilor e gata imediat</b>
                  <span>Testul primește linkul și codul QR din prima clipă, ca ciornă.</span>
                </div>
              </li>
              <li>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d="M5.5 7.5V3h9v4.5" />
                  <rect x="2.75" y="7.5" width="14.5" height="6.5" rx="1.5" />
                  <path d="M5.5 12h9v5h-9z" />
                </svg>
                <div>
                  <b>Tipărești testul cu cod QR</b>
                  <span>Din ciornă, cu zile înainte. Fiecare pagină are codul.</span>
                </div>
              </li>
              <li>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <circle cx="7.5" cy="7" r="2.75" />
                  <path d="M2.75 16c.6-2.6 2.5-4 4.75-4s4.15 1.4 4.75 4" />
                  <path d="M13 4.6a2.6 2.6 0 0 1 0 5M14.5 12.2c1.4.5 2.4 1.8 2.75 3.8" />
                </svg>
                <div>
                  <b>În ziua testului: Începe testul</b>
                  <span>Elevii scanează codul și trimit pozele. Fără cont și fără aplicație.</span>
                </div>
              </li>
            </ul>
          </section>
        </div>
      )}
      {newClass && <NewClassDialog onClose={() => setNewClass(false)} onCreated={(id) => setClassId(String(id))} />}
    </section>
  );
}
```

- [ ] **Step 4: Edit `src/admin/classPage/ClassDialogs.tsx`**

Find this block:

```tsx
// The students may come later. A class made before the students failed is not
// made twice: a second try only adds the students.
export function NewClassDialog({ onClose }: { onClose(): void }) {
  const api = useApi();
```

Replace it with:

```tsx
// The students may come later. A class made before the students failed is not
// made twice: a second try only adds the students. The new class's page opens,
// unless `onCreated` takes the class (on "Test nou", which chooses it).
export function NewClassDialog({ onClose, onCreated }: { onClose(): void; onCreated?(id: number): void }) {
  const api = useApi();
```

- [ ] **Step 5: Edit `src/admin/classPage/ClassDialogs.tsx`**

Find this block:

```tsx
      onClose();
      navigate(`/clase/${id}`);
    },
```

Replace it with:

```tsx
      onClose();
      if (onCreated) onCreated(id);
      else navigate(`/clase/${id}`);
    },
```

- [ ] **Step 6: Edit `src/ui/brand.css`**

Find this block:

```css
  margin: 0.5rem 0 0;
}
```

Replace it with:

```css
  margin: 0.5rem 0 0;
}

/* "Test nou": the form of three numbered steps, and the card of what comes
   next beside it, sticky under the top bar; one column below 73.75rem, where
   the card goes under the form. */
.new-test {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 22rem;
  gap: 1rem;
  align-items: start;
}

.steps {
  display: grid;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
}

.step {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr);
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-panel);
  background: var(--sheet);
  counter-increment: step;
}

.step::before {
  content: counter(step);
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  background: var(--ink-tint);
  color: var(--ink);
  font-weight: 700;
}

.step h2 {
  margin: 0.2rem 0 0.25rem;
  font-size: 1rem;
}

.step > div > p {
  margin: 0 0 0.75rem;
  color: var(--muted);
  font-size: 0.875rem;
}

.step .form-field {
  max-width: 34rem;
  margin-bottom: 0.875rem;
}

.step .form-field:last-child {
  margin-bottom: 0;
}

.step .form-field select {
  width: 100%;
}

/* The barem's three choices: the chosen one is tinted blue. */
.choices {
  display: grid;
  gap: 0.5rem;
  max-width: 34rem;
  margin: 0;
  padding: 0;
  border: 0;
}

.choice {
  display: grid;
  grid-template-columns: 1.25rem minmax(0, 1fr);
  gap: 0.625rem;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--sheet);
  font-weight: 400;
  cursor: pointer;
}

.choice:has(input:checked) {
  border-color: var(--ink);
  background: var(--ink-tint);
}

.choice:has(input:disabled) {
  cursor: not-allowed;
}

.choice:has(input:disabled) b {
  color: var(--muted);
}

.choice input {
  margin: 0.2rem 0 0;
  accent-color: var(--ink);
}

.choice b {
  display: block;
  font-weight: 600;
}

.choice span span {
  display: block;
  color: var(--muted);
  font-size: 0.8125rem;
}

.choice .choice-extra {
  color: var(--text);
}

.choice-drop {
  margin: -0.25rem 0 0.25rem 2rem;
}

.new-test-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
  margin-top: 1.25rem;
}

.new-test-next {
  position: sticky;
  top: calc(var(--top) + 1.5rem);
}

.new-test-next ul {
  display: grid;
  gap: 0.875rem;
  margin: 0;
  padding: 0.25rem 1.25rem 1.25rem;
  list-style: none;
}

.new-test-next li {
  display: grid;
  grid-template-columns: 1.5rem minmax(0, 1fr);
  gap: 0.625rem;
  font-size: 0.875rem;
}

.new-test-next svg {
  width: 1.25rem;
  height: 1.25rem;
  margin-top: 0.1rem;
  color: var(--ink);
}

.new-test-next b {
  display: block;
  font-size: 0.9375rem;
}

.new-test-next span {
  color: var(--muted);
}

@media (max-width: 73.75rem) {
  .new-test {
    grid-template-columns: minmax(0, 1fr);
  }

  .new-test-next {
    position: static;
  }
}
```

- [ ] **Step 7: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  124 passed | 1 skipped (125)`, `Tests  1988 passed | 3 skipped (1991)`.

- [ ] **Step 8: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 9: Commit**

```bash
git add src/admin/pages/NewTestPage.tsx src/admin/pages/NewTestPage.test.tsx src/admin/classPage/ClassDialogs.tsx src/ui/brand.css
git commit -m "Show Test nou as three numbered steps, with the barem's three choices"
```

### Task 3: The notes

`src/AGENTS.md` describes "Test nou".

**Files:**
- Modify: `src/AGENTS.md`

- [ ] **Step 1: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the files, the students' link while the test is a draft or open, rename, archive, delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table, "Recorectează tot"). `pages/ReviewPage.tsx` and `reviewPage/` are the review of the points to check (redesign spec §7, `/teste/:code/verificare`): the papers and their points (`ReviewQueue.tsx`), one page of the paper at a time (`ReviewPhoto.tsx`; no marks on the photo, because the robot does not say where an answer is), and the decision (`ReviewDecision.tsx`: "Accept", the stepper and "Salvează", "Am verificat paginile", the paper's exercises). `points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first), steps between them, and writes the address (`?lucrare=&punct=`, replaced, never a new step in the history). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point; a refused one reads the paper and the test again. An address that names no paper of the test is rewritten first (`ReviewLoader` draws `<Navigate replace>` to `firstSpot()`), before any paper is drawn: a refresh never moves the spot, and no decision is made on a spot the address does not hold. The next point opens only if the teacher is still at the decided one (a call-level `onSuccess` of `mutate`, which does not run once the page is gone), and its heading takes the focus (`focus({ preventScroll: true })`). An address of a paper with no result now (graded again) shows that paper with the reason (`submissionPage/waitingText.ts`, shared with the paper page); when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A, J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: exactly the three cases of spec §5; `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

Replace it with:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the files, the students' link while the test is a draft or open, rename, archive, delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table, "Recorectează tot"). `pages/ReviewPage.tsx` and `reviewPage/` are the review of the points to check (redesign spec §7, `/teste/:code/verificare`): the papers and their points (`ReviewQueue.tsx`), one page of the paper at a time (`ReviewPhoto.tsx`; no marks on the photo, because the robot does not say where an answer is), and the decision (`ReviewDecision.tsx`: "Accept", the stepper and "Salvează", "Am verificat paginile", the paper's exercises). `points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first), steps between them, and writes the address (`?lucrare=&punct=`, replaced, never a new step in the history). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point; a refused one reads the paper and the test again. An address that names no paper of the test is rewritten first (`ReviewLoader` draws `<Navigate replace>` to `firstSpot()`), before any paper is drawn: a refresh never moves the spot, and no decision is made on a spot the address does not hold. The next point opens only if the teacher is still at the decided one (a call-level `onSuccess` of `mutate`, which does not run once the page is gone), and its heading takes the focus (`focus({ preventScroll: true })`). An address of a paper with no result now (graded again) shows that paper with the reason (`submissionPage/waitingText.ts`, shared with the paper page); when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A, J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: exactly the three cases of spec §5; `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

- [ ] **Step 2: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  124 passed | 1 skipped (125)`, `Tests  1988 passed | 3 skipped (1991)`.

- [ ] **Step 3: Commit**

```bash
git add src/AGENTS.md
git commit -m "Describe Test nou in the notes"
```

### Task 4: Look at it, then the pull request (main session)

Not a subagent task. Nothing here changes code unless a check fails; a fix found here is prototyped, tested and committed like the tasks above, and named to the user.

- [ ] **Step 1: Check the exactness of the branch**

Run: `git diff --stat refs/proto13/c3 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

- [ ] **Step 2: Run the whole suite three times, and once in UTC**

Run `npm test` three times, then once with `TZ=UTC` (Git Bash: `TZ=UTC npm test`).
Expected: PASS every time. `Test Files  124 passed | 1 skipped (125)`, `Tests  1988 passed | 3 skipped (1991)`.

- [ ] **Step 3: Build and start the production build**

Check port 8788 first (`netstat -ano | findstr :8788`; end a leftover `workerd.exe` as `AGENTS.md` says). Run `npm run db:local`, then the Claude Code preview server `preview` (`npm run preview`, http://127.0.0.1:8788). The development login of `.dev.vars` logs in the local teacher.
Expected: `Ready on http://127.0.0.1:8788`.

- [ ] **Step 4: Look at the page at 1440px, 1024px and 390px, light and dark**

`/admin/teste/nou`: the three steps and the side card (beside the form at 1440px, under it at 1024px and 390px); "Generează baremul din test" off with its line; "Clasă nouă" makes a class and chooses it, on the page; a test file dropped on step 2 (in the browser pane: a `DataTransfer` with a small PDF, dispatched as `dragover` and `drop` on `label[for="new-test-file"]`) turns "Generează" on; "Creează testul" with "Generează" opens the test page at Pregătire with "Se generează baremul…". `/admin/teste/nou?clasa=<id>` from "Test nou pentru această clasă": the class chosen, no "Clasă nouă". Measure `document.documentElement.scrollWidth <= innerWidth` on each width.
Expected: the look of round 7, page "Test nou" A; no sideways scroll.

- [ ] **Step 5: Run the smoke test**

Run `npm run smoke` in a second terminal.
Expected: every check passes.

- [ ] **Step 6: Commit the plan**

```bash
git add docs/superpowers/plans/2026-11-08-mqgrader-phase-8c-new-test.md
git commit -m "Add the Phase 8c plan"
```

- [ ] **Step 7: Ask the user, then push and open the pull request**

Ask the user before pushing. On a yes: `git push -u origin feature/mqgrader-new-test`, then a ready pull request into `main` that lists what changed, the rulings above, and what was checked.

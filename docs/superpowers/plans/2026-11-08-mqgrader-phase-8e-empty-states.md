# MQGrader Phase 8e: The first visit and the empty states — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 7 must run in the main session, not in a subagent:** it looks at the app in a browser, and every outward step (push, pull request) needs the user's explicit yes.

**Goal:** The first visit and the empty states as the user picked them in round 7 (spec §11.9, page A): a new teacher sees "Bun venit" and "Primii pași" on the Teste page, and each empty place has an icon, a heading, one sentence and at most one button, its one next step.

**Architecture:** No API change, no migration. A new `src/admin/EmptyState.tsx` draws an empty place; three icons join `shell/icons.tsx`. Each empty place uses it: the panels "Clasele tale" and "Ce ai de făcut", `/clase` with no class, the class page with no students or no tests, the test page's În clasă with no paper and Rezultate with nothing to publish. A new `testsPage/FirstSteps.tsx` is the card "Primii pași" of the Teste page.

**Tech Stack:** Node 24, TypeScript, React 19, TanStack Query, React Router, Hono on Cloudflare Pages with D1, Vitest 5, Testing Library. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md` (§11.9). Root `AGENTS.md`, `src/AGENTS.md` and `server/AGENTS.md` hold the project rules. The approved prototype: round 7 https://claude.ai/artifact/NTc1cfWBhUF4EkkCZN2uNm, page "Prima vizită și stările goale" A.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- No server file changes.
- Flat colours only: no gradient anywhere in `brand.css`; a shadow only on what floats. Orange only for what waits on the teacher.
- No page tells students that AI grades their work; this plan changes no student page.
- Do not run Prettier or any formatter: the repo has no formatter configuration, and its defaults rewrite the quotes of whole files.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A` (the checkout holds local files that must not be committed: `.claude/launch.json` entries, untracked plan files).
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root `D:\Projects\QuickEval`, on the branch `feature/mqgrader-empty-states`. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy, on `main` too. If only tests of those three files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts runner/api.test.ts` alone. Then the full run counts as passed when its failed and passed tests add up to the expected passed number; say so in the task report.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; overwrite all of it with exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/proto15/e1` … `refs/proto15/e6`, one per task, on `refs/proto15/ebase` (the same files as `main` at `b36429b`). After Task N, `git diff --stat refs/proto15/eN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`). Four tests run the real pandoc (`runner/baremDocx.test.ts`, `runner/baremTask.test.ts`, `runner/workdir.test.ts`): without pandoc they skip too, so every total shows 4 fewer passed and 4 more skipped.

## Rulings made while planning

Settled while building the prototype on 2026-11-08. Every action that works today stays.

1. An empty state is an icon, a heading, one sentence and at most one button, left-aligned (round 7, page A). Its heading's level fits its place: an h3 under a panel's or a card's title and in a stage's panel, an h2 in a card with no title (the class page), an h1 on `/clase`, which has no other heading.
2. The headings are the spec's. The sentences are round 7's, kept because each is true in the app: the class dialogs ask for the students "câte unul pe rând" and say "Poți lipi lista din catalog"; "De făcut" holds exactly a barem, points to check, or results (`todo.ts`); students need no account and no app, and send photos (or PDFs); the test page reads an open test again every 10 s, so "Lucrările apar aici pe măsură ce vin". One sentence is new, see 7.
3. "Primii pași" shows while the school year has no test and the account never sent a test to grading (`me.testsEvaluated === 0`). A returning teacher who opens a new school year keeps today's page and its line "Nu ai niciun test în acest an școlar.". While the card shows, the page has no filters, no "Test nou" in its head (the bar's "Test nou" stays and leads to "Test nou"'s own line), and no line about the tests. The card goes once a test exists, so only its first step can show as done: a tick, "gata" for a screen reader, and "Test nou" (step 2) turns on. "Clasă nouă" (step 1) opens the dialog, which then opens the new class, as everywhere else. An archived class does not count as a class.
4. "Clasele tale" with no class (archived ones aside): the empty state holds the one "+ Clasă nouă"; the panel's foot then shows only "Arhivate (n)", so a teacher with only archived classes still reaches them. `/clase` with no active class: "Încă nu ai nicio clasă" (or "Nu ai nicio clasă activă" when archived ones exist), "+ Clasă nouă", and the archived classes in the card's foot.
5. A class with no students: "Clasa 7A nu are încă elevi" on both tabs. On "Note și teste" its "Adaugă elevi" opens the tab "Elevi", as today; on "Elevi" it opens the dialog, as today ("+ Adaugă elevi" becomes "Adaugă elevi"). A class with no tests: "Niciun test pentru Clasa 7A" with "Test nou pentru această clasă" (to `/teste/nou?clasa=…`). An archived class gets "Clasa 7A nu are elevi" ("Clasa e arhivată: nu i se mai adaugă elevi.") and "Niciun test pentru Clasa 7A" ("Clasa e arhivată: nu i se mai fac teste."), with no button. "Toate testele clasei sunt arhivate" and the search's "Nu s-a găsit niciun elev." are not empty states and stay.
6. În clasă: while the test is open and no student has uploaded a file (the rule of "Oprește testul": every row has `fileCount` 0), "Nicio lucrare trimisă încă" takes the place of the papers table, whose rows would all say "Nu a trimis". "Începe"/"Oprește testul" and the multi-upload link stay above it. Its button opens the QR code on the whole screen (`QrOverlay`, now exported); closing it gives the focus back to the button. A closed upload with no paper keeps the table.
7. Rezultate with nothing to publish (`hasResultsToManage` false: a draft, or nothing graded, no results open and none published): "Rezultatele se publică după corectare", with the new sentence "Când lucrările sunt corectate, le publici de aici; fiecare elev primește linkul lui." (round 7's sentence about the report repeats the line of "Pentru tine") and "Mergi la Corectare" (a `MoveOnLink`: the panel's heading takes the focus). It takes the place of today's line of that name; after the start, the students' links (made before the grading, as today) and "Pentru tine" stay under it. Results that are open while nothing is graded keep "Oprește accesul la rezultate".
8. The greeting of a new teacher is "Bun venit, Maria." (the first word of the name), and its line "Sâmbătă, 7 noiembrie · Trei pași până la primul test corectat.".

## Review Focus

1. No action of today is lost: "Oprește testul" with no paper, the links made before the grading, "Oprește accesul la rezultate" with nothing graded, "Arhivate (n)" with no active class (tests in Tasks 2 and 4).
2. "Primii pași" never shows to a returning teacher (test in Task 5: "says so when the year has no tests, for a teacher who has had tests graded").
3. The empty state of În clasă shows only while the test is open and no file was uploaded (test in Task 4: "lists the papers as soon as one student uploaded a file, and once the uploads are closed").
4. The focus: back to the QR button after the QR code closes; to the Corectare heading after "Mergi la Corectare" (tests in Task 4).
5. An archived class offers no button (tests in Task 3).

---

### Before Task 1: The branch

- [ ] **Step 1: Check the branch**

No other Claude Code session may work in this checkout meanwhile (in the desktop app: `list_sessions {"linked": true}` shows none running). Run `git switch -c feature/mqgrader-empty-states b36429b`, then `git log --oneline -1`.

Expected: `b36429b Merge pull request #51 from parameciul/feature/mqgrader-settings`. The untracked plan files and the local changes of `.claude/launch.json` come along; they are never committed (this plan is committed in Task 7).

### Task 1: The empty state

`EmptyState`: an icon, a heading, one sentence and at most one button.

**Files:**
- Create: `src/admin/EmptyState.tsx`
- Modify: `src/admin/shell/icons.tsx`, `src/ui/brand.css`
- Test: `src/admin/EmptyState.test.tsx` (new)

**Interfaces:**
- Produces: `EmptyState({ icon, title, level?, action?, children })` from `admin/EmptyState.tsx`; `IconDone`, `IconQr`, `IconClock` from `shell/icons.tsx`; the CSS classes `empty-state`, `empty-state-icon` in `brand.css`.

- [ ] **Step 1: Create `src/admin/EmptyState.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState.tsx';
import { IconClasses } from './shell/icons.tsx';

describe('EmptyState', () => {
  it('shows a heading, one sentence and its one next step, with an icon a screen reader skips', () => {
    const { container } = render(
      <EmptyState icon={<IconClasses />} title="Încă nu ai nicio clasă" action={<button type="button">+ Clasă nouă</button>}>
        Adaugă clasa cu numele elevilor, câte unul pe rând.
      </EmptyState>,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Încă nu ai nicio clasă' })).toBeInTheDocument();
    expect(screen.getByText('Adaugă clasa cu numele elevilor, câte unul pe rând.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Clasă nouă' })).toBeInTheDocument();
    expect(container.querySelector('.empty-state-icon svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('takes the heading level of its place, and may have no button', () => {
    render(
      <EmptyState icon={<IconClasses />} title="Nimic nu te așteaptă acum" level={1}>
        Totul e la zi.
      </EmptyState>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Nimic nu te așteaptă acum' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/admin/EmptyState.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  no tests`: `EmptyState.test.tsx` cannot load (`Failed to resolve import "./EmptyState.tsx"`).

- [ ] **Step 3: Create `src/admin/EmptyState.tsx`**

```tsx
import type { ReactNode } from 'react';

// An empty place of the teacher app (redesign spec §11.9): an icon, a heading,
// one sentence, and at most one button, its one next step. The heading's
// level fits the place: under a panel's or a card's title it is an h3, on a
// page with no other heading an h1.
export function EmptyState({
  icon,
  title,
  level = 3,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  level?: 1 | 2 | 3;
  action?: ReactNode;
  children: ReactNode;
}) {
  const Heading = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <Heading>{title}</Heading>
      <p>{children}</p>
      {action}
    </div>
  );
}
```

- [ ] **Step 4: Edit `src/admin/shell/icons.tsx`**

Find this block:

```tsx
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}
```

Replace it with:

```tsx
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

export function IconDone() {
  return (
    <svg {...LINE} strokeWidth={2}>
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}

export function IconQr() {
  return (
    <svg {...LINE}>
      <path d="M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3z" />
      <path d="M12 12h2v2h-2zM15 15h2v2h-2zM15 12h2M12 16v1" />
    </svg>
  );
}

export function IconClock() {
  return (
    <svg {...LINE}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 2" />
    </svg>
  );
}
```

- [ ] **Step 5: Edit `src/ui/brand.css`**

Find this block:

```css

/* "Note și teste": the grades table as wide as its columns, "Testele clasei"
```

Replace it with:

```css

/* An empty place (redesign spec §11.9): an icon, a heading, one sentence and
   at most one button, left-aligned, inside its card or panel. */
.empty-state {
  display: grid;
  justify-items: start;
  gap: 0.375rem;
  padding: 1.5rem 1.25rem;
}

.empty-state-icon {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  margin-bottom: 0.375rem;
  border-radius: 10px;
  background: var(--active);
  color: var(--muted);
}

.empty-state-icon svg {
  width: 1.25rem;
  height: 1.25rem;
}

.empty-state h1,
.empty-state h2,
.empty-state h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.empty-state h1 {
  font-size: 1.25rem;
}

.empty-state p {
  max-width: 34rem;
  margin: 0;
  color: var(--muted);
  font-size: 0.9375rem;
}

.empty-state > :last-child:not(p) {
  margin-top: 0.5rem;
}

/* "Note și teste": the grades table as wide as its columns, "Testele clasei"
```

- [ ] **Step 6: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  125 passed | 1 skipped (126)`, `Tests  2014 passed | 3 skipped (2017)`.

- [ ] **Step 7: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add src/admin/EmptyState.tsx src/admin/EmptyState.test.tsx src/admin/shell/icons.tsx src/ui/brand.css
git commit -m "Add the empty state of the teacher app"
```

### Task 2: The panels and /clase

"Clasele tale" with no class, "Ce ai de făcut" with nothing, and `/clase` with no active class.

**Files:**
- Modify: `src/admin/shell/ClassesPanel.tsx`, `src/admin/shell/TodoPanel.tsx`, `src/admin/pages/LastClassPage.tsx`
- Test: `src/admin/Layout.test.tsx`, `src/admin/pages/LastClassPage.test.tsx`, `src/admin/pages/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `EmptyState`, `IconClasses`, `IconDone` (Task 1).

- [ ] **Step 1: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
    const panel = screen.getByRole('complementary', { name: 'Ce ai de făcut' });
    expect(within(panel).getByText('Nimic nu te așteaptă acum.')).toBeInTheDocument();
    expect(await within(panel).findByText('Testul în lucru nu are nevoie de tine acum.')).toBeInTheDocument();
```

Replace it with:

```tsx
    const panel = screen.getByRole('complementary', { name: 'Ce ai de făcut' });
    expect(within(panel).getByRole('heading', { level: 3, name: 'Nimic nu te așteaptă acum' })).toBeInTheDocument();
    expect(panel).toHaveTextContent('Când un barem, un punct nesigur sau niște rezultate au nevoie de tine, apar aici.');
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument();
    expect(await within(panel).findByText('Testul în lucru nu are nevoie de tine acum.')).toBeInTheDocument();
```

- [ ] **Step 2: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx

  it('says so when the year has no class', async () => {
    renderAdmin('/', createFakeApi({ classes: [], students: {}, me: fakeTeacher() }));
    await userEvent.click(within(await menu()).getByRole('button', { name: 'Clase' }));
    expect(screen.getByText('Nu ai nicio clasă în acest an școlar.')).toBeInTheDocument();
  });
```

Replace it with:

```tsx

  it('says so when the year has no class, with one "Clasă nouă"', async () => {
    renderAdmin('/', createFakeApi({ classes: [], students: {}, me: fakeTeacher() }));
    await userEvent.click(within(await menu()).getByRole('button', { name: 'Clase' }));
    const panel = screen.getByRole('complementary', { name: 'Clasele tale' });
    expect(within(panel).getByRole('heading', { level: 3, name: 'Încă nu ai nicio clasă' })).toBeInTheDocument();
    expect(panel).toHaveTextContent('Adaugă clasa cu numele elevilor, câte unul pe rând.');
    expect(within(panel).getAllByRole('link', { name: '+ Clasă nouă' })).toHaveLength(1);
    await userEvent.click(within(panel).getByRole('link', { name: '+ Clasă nouă' }));
    expect(await screen.findByRole('dialog', { name: 'Clasă nouă' })).toBeInTheDocument();
  });

  it('keeps the way to the archived classes when the year has only those', async () => {
    const api = createFakeApi({ classes: [{ id: 2, name: '9R2', schoolYear: 2026, archived: true, studentCount: 0 }], students: {}, me: fakeTeacher() });
    renderAdmin('/', api);
    await userEvent.click(within(await menu()).getByRole('button', { name: 'Clase' }));
    const panel = screen.getByRole('complementary', { name: 'Clasele tale' });
    expect(await within(panel).findByRole('heading', { name: 'Încă nu ai nicio clasă' })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Arhivate (1)' })).toBeInTheDocument();
    expect(within(panel).getAllByRole('link', { name: '+ Clasă nouă' })).toHaveLength(1);
  });
```

- [ ] **Step 3: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
    expect(within(todo).getByText('Se încarcă…')).toBeInTheDocument();
    expect(within(todo).queryByText('Nimic nu te așteaptă acum.')).not.toBeInTheDocument();
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
```

Replace it with:

```tsx
    expect(within(todo).getByText('Se încarcă…')).toBeInTheDocument();
    expect(within(todo).queryByRole('heading', { name: 'Nimic nu te așteaptă acum' })).not.toBeInTheDocument();
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
```

- [ ] **Step 4: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
    expect(await within(todo).findByText('Serverul nu răspunde acum.')).toBeInTheDocument();
    expect(within(todo).queryByText('Nimic nu te așteaptă acum.')).not.toBeInTheDocument();
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
```

Replace it with:

```tsx
    expect(await within(todo).findByText('Serverul nu răspunde acum.')).toBeInTheDocument();
    expect(within(todo).queryByRole('heading', { name: 'Nimic nu te așteaptă acum' })).not.toBeInTheDocument();
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
```

- [ ] **Step 5: Edit `src/admin/pages/LastClassPage.test.tsx`**

Find this block:

```tsx
    renderAdmin('/clase', createFakeApi({ classes: [], students: {} }));
    expect(await screen.findByText('Nu ai nicio clasă în acest an școlar.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '+ Clasă nouă' }));
```

Replace it with:

```tsx
    renderAdmin('/clase', createFakeApi({ classes: [], students: {} }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Încă nu ai nicio clasă' })).toBeInTheDocument();
    expect(screen.getByText('Adaugă clasa cu numele elevilor, câte unul pe rând.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '+ Clasă nouă' }));
```

- [ ] **Step 6: Edit `src/admin/pages/LastClassPage.test.tsx`**

Find this block:

```tsx
    );
    expect(await screen.findByText('Nu ai nicio clasă activă în acest an școlar.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clasa 9R2' })).toHaveAttribute('href', '/clase/2');
```

Replace it with:

```tsx
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Nu ai nicio clasă activă' })).toBeInTheDocument();
    expect(screen.getByText(/^Arhivate:/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clasa 9R2' })).toHaveAttribute('href', '/clase/2');
```

- [ ] **Step 7: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx
    expect(api.login).toHaveBeenCalledWith('profesor@example.com', 'parola-buna');
    expect(await screen.findByText('Nu ai nicio clasă în acest an școlar.')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Meniu' })).toBeInTheDocument();
```

Replace it with:

```tsx
    expect(api.login).toHaveBeenCalledWith('profesor@example.com', 'parola-buna');
    expect(await screen.findByRole('heading', { name: 'Încă nu ai nicio clasă' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Meniu' })).toBeInTheDocument();
```

- [ ] **Step 8: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx
    renderAdmin('/clase', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher' }) }));
    await screen.findByText('Nu ai nicio clasă în acest an școlar.');
    expect(screen.queryByRole('button', { name: /^Demo/ })).not.toBeInTheDocument();
```

Replace it with:

```tsx
    renderAdmin('/clase', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher' }) }));
    await screen.findByRole('heading', { name: 'Încă nu ai nicio clasă' });
    expect(screen.queryByRole('button', { name: /^Demo/ })).not.toBeInTheDocument();
```

- [ ] **Step 9: Run the tests to see them fail**

Run: `npx vitest run src/admin/Layout.test.tsx src/admin/pages/LastClassPage.test.tsx src/admin/pages/LoginPage.test.tsx`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  7 failed | 58 passed (65)`: the panels and `/clase` have no empty-state headings (`Unable to find … role "heading" and name "Nimic nu te așteaptă acum"`, `… "Încă nu ai nicio clasă"`, `… "Nu ai nicio clasă activă"`).

- [ ] **Step 10: Edit `src/admin/shell/ClassesPanel.tsx`**

Find this block:

```tsx
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { Panel } from './Panel.tsx';
```

Replace it with:

```tsx
import { useApi } from '../ApiContext.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { IconClasses } from './icons.tsx';
import { Panel } from './Panel.tsx';
```

- [ ] **Step 11: Edit `src/admin/shell/ClassesPanel.tsx`**

Find this block:

```tsx
// arrive a class shows no line about them (or the panel says why they could
// not be read), never "Nimic în lucru".
export function ClassesPanel({
```

Replace it with:

```tsx
// arrive a class shows no line about them (or the panel says why they could
// not be read), never "Nimic în lucru". With no class, its empty state holds
// the one "+ Clasă nouă"; "Arhivate (n)" stays at the foot.
export function ClassesPanel({
```

- [ ] **Step 12: Edit `src/admin/shell/ClassesPanel.tsx`**

Find this block:

```tsx
      ) : active.length === 0 ? (
        <p className="panel-body hint">Nu ai nicio clasă în acest an școlar.</p>
      ) : (
```

Replace it with:

```tsx
      ) : active.length === 0 ? (
        <EmptyState
          icon={<IconClasses />}
          title="Încă nu ai nicio clasă"
          action={
            <Link className="button button-small" to="/clase" state={{ newClass: true }}>
              + Clasă nouă
            </Link>
          }
        >
          Adaugă clasa cu numele elevilor, câte unul pe rând.
        </EmptyState>
      ) : (
```

- [ ] **Step 13: Edit `src/admin/shell/ClassesPanel.tsx`**

Find this block:

```tsx
      <div className="panel-actions">
        <Link className="button-quiet button-small" to="/clase" state={{ newClass: true }}>
          + Clasă nouă
        </Link>
        {archived > 0 && (
```

Replace it with:

```tsx
      <div className="panel-actions">
        {(classes.data === undefined || active.length > 0) && (
          <Link className="button-quiet button-small" to="/clase" state={{ newClass: true }}>
            + Clasă nouă
          </Link>
        )}
        {archived > 0 && (
```

- [ ] **Step 14: Edit `src/admin/shell/TodoPanel.tsx`**

Find this block:

```tsx
import { countLabel } from '../../ui/format.ts';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { Panel } from './Panel.tsx';
```

Replace it with:

```tsx
import { countLabel } from '../../ui/format.ts';
import { EmptyState } from '../EmptyState.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { IconDone } from './icons.tsx';
import { Panel } from './Panel.tsx';
```

- [ ] **Step 15: Edit `src/admin/shell/TodoPanel.tsx`**

Find this block:

```tsx
      ) : items.length === 0 && approvals === 0 ? (
        <p className="panel-body hint">Nimic nu te așteaptă acum.</p>
      ) : (
```

Replace it with:

```tsx
      ) : items.length === 0 && approvals === 0 ? (
        <EmptyState icon={<IconDone />} title="Nimic nu te așteaptă acum">
          Când un barem, un punct nesigur sau niște rezultate au nevoie de tine, apar aici.
        </EmptyState>
      ) : (
```

- [ ] **Step 16: Edit `src/admin/pages/LastClassPage.tsx`**

Find this block:

```tsx
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';
```

Replace it with:

```tsx
import { useApi } from '../ApiContext.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { IconClasses } from '../shell/icons.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';
```

- [ ] **Step 17: Edit `src/admin/pages/LastClassPage.tsx`**

Find this block:

```tsx
// asks for (state `newClass` or `archived`) goes on to that class page. With no
// active class, the page offers "Clasă nouă" and lists the archived classes.
export function LastClassPage() {
```

Replace it with:

```tsx
// asks for (state `newClass` or `archived`) goes on to that class page. With no
// active class, the page is an empty state with "Clasă nouă", and lists the
// archived classes under it.
export function LastClassPage() {
```

- [ ] **Step 18: Edit `src/admin/pages/LastClassPage.tsx`**

Find this block:

```tsx
  return (
    <div className="class-card class-empty">
      <p>{archived.length === 0 ? 'Nu ai nicio clasă în acest an școlar.' : 'Nu ai nicio clasă activă în acest an școlar.'}</p>
      <button type="button" className="button button-small" onClick={() => setNewClassOpen(true)}>
        + Clasă nouă
      </button>
      {archived.length > 0 && (
        <p className="class-empty-archived">
          Arhivate:{' '}
```

Replace it with:

```tsx
  return (
    <div className="class-card">
      <EmptyState
        icon={<IconClasses />}
        title={archived.length === 0 ? 'Încă nu ai nicio clasă' : 'Nu ai nicio clasă activă'}
        level={1}
        action={
          <button type="button" className="button button-small" onClick={() => setNewClassOpen(true)}>
            + Clasă nouă
          </button>
        }
      >
        Adaugă clasa cu numele elevilor, câte unul pe rând.
      </EmptyState>
      {archived.length > 0 && (
        <p className="class-card-foot class-empty-archived">
          Arhivate:{' '}
```

- [ ] **Step 19: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  125 passed | 1 skipped (126)`, `Tests  2015 passed | 3 skipped (2018)`.

- [ ] **Step 20: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 21: Commit**

```bash
git add src/admin/shell/ClassesPanel.tsx src/admin/shell/TodoPanel.tsx src/admin/pages/LastClassPage.tsx src/admin/Layout.test.tsx src/admin/pages/LastClassPage.test.tsx src/admin/pages/LoginPage.test.tsx
git commit -m "Show the empty panels and /clase with no class as empty states"
```

### Task 3: The class page

A class with no students (both tabs) or no tests.

**Files:**
- Modify: `src/admin/classPage/GradesTable.tsx`, `src/admin/classPage/ClassStudents.tsx`, `src/admin/pages/ClassPage.tsx`
- Test: `src/admin/pages/ClassPage.test.tsx`

**Interfaces:**
- Consumes: `EmptyState`, `IconClasses`, `IconTests` (Task 1).
- Produces: `NoStudents({ name, readOnly, action })` and a new prop `name` of `GradesTable` in `classPage/GradesTable.tsx`.

- [ ] **Step 1: Edit `src/admin/pages/ClassPage.test.tsx`**

Find this block:

```tsx

  it('offers no "Adaugă elevi" when the archived class has no students', async () => {
    renderAdmin('/clase/1', await archivedClass({ ...classData(), students: { 1: [] } }));
    expect(await screen.findByText('Clasa nu are elevi.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adaugă elevi/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /^Elevi/ }));
    expect(await screen.findByText('Clasa nu are elevi.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adaugă elevi/ })).not.toBeInTheDocument();
```

Replace it with:

```tsx

  it('offers no new test for an archived class with no tests', async () => {
    renderAdmin('/clase/1', await archivedClass({ ...classData(), tests: [] }));
    const heading = await screen.findByRole('heading', { level: 2, name: 'Niciun test pentru Clasa 6E2' });
    const card = heading.closest('.class-card') as HTMLElement;
    expect(card).toHaveTextContent('Clasa e arhivată: nu i se mai fac teste.');
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
  });

  it('offers no "Adaugă elevi" when the archived class has no students', async () => {
    renderAdmin('/clase/1', await archivedClass({ ...classData(), students: { 1: [] } }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Clasa 6E2 nu are elevi' })).toBeInTheDocument();
    expect(screen.getByText('Clasa e arhivată: nu i se mai adaugă elevi.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adaugă elevi/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /^Elevi/ }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Clasa 6E2 nu are elevi' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adaugă elevi/ })).not.toBeInTheDocument();
```

- [ ] **Step 2: Edit `src/admin/pages/ClassPage.test.tsx`**

Find this block:

```tsx
    renderAdmin('/clase/1', createFakeApi({ ...classData(), students: { 1: [] } }));
    expect(await screen.findByText('Clasa nu are încă elevi.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Adaugă elevi' }));
```

Replace it with:

```tsx
    renderAdmin('/clase/1', createFakeApi({ ...classData(), students: { 1: [] } }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Clasa 6E2 nu are încă elevi' })).toBeInTheDocument();
    expect(screen.getByText('Lipește lista din catalog, câte un elev pe rând.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Adaugă elevi' }));
```

- [ ] **Step 3: Edit `src/admin/pages/ClassPage.test.tsx`**

Find this block:

```tsx

  it('says so when the class has no tests', async () => {
    renderAdmin('/clase/1', createFakeApi({ ...classData(), tests: [] }));
    expect(await screen.findByText(/Clasa nu are încă teste\. Notele apar aici/)).toBeInTheDocument();
  });
});
```

Replace it with:

```tsx

  it('says so when the class has no tests, with "Test nou pentru această clasă"', async () => {
    renderAdmin('/clase/1', createFakeApi({ ...classData(), tests: [] }));
    const heading = await screen.findByRole('heading', { level: 2, name: 'Niciun test pentru Clasa 6E2' });
    const card = heading.closest('.class-card') as HTMLElement;
    expect(card).toHaveTextContent('Testele clasei și notele lor apar aici.');
    expect(within(card).getByRole('link', { name: 'Test nou pentru această clasă' })).toHaveAttribute('href', '/teste/nou?clasa=1');
  });

});
```

- [ ] **Step 4: Edit `src/admin/pages/ClassPage.test.tsx`**

Find this block:

```tsx
    await userEvent.click(await screen.findByRole('tab', { name: 'Elevi 0' }));
    expect(screen.getByText(/Clasa nu are încă elevi/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '+ Adaugă elevi' }));
    expect(await screen.findByRole('dialog', { name: 'Adaugă elevi în Clasa 6E2' })).toBeInTheDocument();
```

Replace it with:

```tsx
    await userEvent.click(await screen.findByRole('tab', { name: 'Elevi 0' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Clasa 6E2 nu are încă elevi' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Adaugă elevi' }));
    expect(await screen.findByRole('dialog', { name: 'Adaugă elevi în Clasa 6E2' })).toBeInTheDocument();
```

- [ ] **Step 5: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/ClassPage.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  5 failed | 41 passed (46)`: the class page has no empty-state headings (`Unable to find role="heading" and name "Niciun test pentru Clasa 6E2"`, `… "Clasa 6E2 nu are elevi"`, `… "Clasa 6E2 nu are încă elevi"`).

- [ ] **Step 6: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
import type { ClassGrade, StudentRow, TestSummary } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
```

Replace it with:

```tsx
import type { ClassGrade, StudentRow, TestSummary } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatPoints } from '../../../shared/scoring.ts';
```

- [ ] **Step 7: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
import { countLabel, formatDayMonth, uploadStatusLabel } from '../../ui/format.ts';
import { stagesOf } from '../stages.ts';
```

Replace it with:

```tsx
import { countLabel, formatDayMonth, uploadStatusLabel } from '../../ui/format.ts';
import { EmptyState } from '../EmptyState.tsx';
import { IconClasses, IconTests } from '../shell/icons.tsx';
import { stagesOf } from '../stages.ts';
```

- [ ] **Step 8: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
  return `${studentId}|${testCode}`;
}
```

Replace it with:

```tsx
  return `${studentId}|${testCode}`;
}

// A class with no students (redesign spec §11.9), on both tabs: its one next
// step is "Adaugă elevi" (`action`). An archived class adds none.
export function NoStudents({ name, readOnly, action }: { name: string; readOnly: boolean; action: ReactNode }) {
  const display = displayClassName(name);
  return (
    <EmptyState
      icon={<IconClasses />}
      title={readOnly ? `${display} nu are elevi` : `${display} nu are încă elevi`}
      level={2}
      action={readOnly ? undefined : action}
    >
      {readOnly ? 'Clasa e arhivată: nu i se mai adaugă elevi.' : 'Lipește lista din catalog, câte un elev pe rând.'}
    </EmptyState>
  );
}
```

- [ ] **Step 9: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
// row "Media testului", and no average per student. Draft and open tests keep a
// column, so the page still leads to them. `readOnly` (an archived class)
// offers no "Adaugă elevi".
export function GradesTable({
  classId,
  students,
```

Replace it with:

```tsx
// row "Media testului", and no average per student. Draft and open tests keep a
// column, so the page still leads to them. With no students, or no tests, the
// card is an empty state with its one next step; `readOnly` (an archived
// class) offers none.
export function GradesTable({
  classId,
  name,
  students,
```

- [ ] **Step 10: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
  classId: number;
  students: StudentRow[];
```

Replace it with:

```tsx
  classId: number;
  name: string;
  students: StudentRow[];
```

- [ ] **Step 11: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
  const shown = tests.filter((test) => showArchived || !test.archived).reverse();
  let empty: ReactNode = null;
  if (students.length === 0 && readOnly) {
    empty = <p>Clasa nu are elevi.</p>;
  } else if (students.length === 0) {
    empty = (
      <>
        <p>Clasa nu are încă elevi.</p>
        <button type="button" className="button-quiet button-small" onClick={onShowStudents}>
          Adaugă elevi
        </button>
      </>
    );
  } else if (tests.length === 0) {
    empty = <p>Clasa nu are încă teste. Notele apar aici după primul test.</p>;
  } else if (shown.length === 0) {
    empty = <p>Toate testele clasei sunt arhivate. Apasă „Arată și testele arhivate”.</p>;
  }
  if (empty !== null) return <div className="class-card class-empty">{empty}</div>;

```

Replace it with:

```tsx
  const shown = tests.filter((test) => showArchived || !test.archived).reverse();
  if (students.length === 0) {
    const add = (
      <button type="button" className="button button-small" onClick={onShowStudents}>
        Adaugă elevi
      </button>
    );
    return (
      <div className="class-card">
        <NoStudents name={name} readOnly={readOnly} action={add} />
      </div>
    );
  }
  if (tests.length === 0) {
    const newTest = (
      <Link className="button button-small" to={`/teste/nou?clasa=${classId}`}>
        Test nou pentru această clasă
      </Link>
    );
    return (
      <div className="class-card">
        <EmptyState icon={<IconTests />} title={`Niciun test pentru ${displayClassName(name)}`} level={2} action={readOnly ? undefined : newTest}>
          {readOnly ? 'Clasa e arhivată: nu i se mai fac teste.' : 'Testele clasei și notele lor apar aici.'}
        </EmptyState>
      </div>
    );
  }
  if (shown.length === 0) {
    return (
      <div className="class-card class-empty">
        <p>Toate testele clasei sunt arhivate. Apasă „Arată și testele arhivate”.</p>
      </div>
    );
  }

```

- [ ] **Step 12: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
import { AddStudentsDialog, RenameDialog } from './ClassDialogs.tsx';
import { orderedStudents } from './GradesTable.tsx';
import type { StudentLinkState } from '../pages/StudentPage.tsx';
```

Replace it with:

```tsx
import { AddStudentsDialog, RenameDialog } from './ClassDialogs.tsx';
import { NoStudents, orderedStudents } from './GradesTable.tsx';
import type { StudentLinkState } from '../pages/StudentPage.tsx';
```

- [ ] **Step 13: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx

  if (students.length === 0 && readOnly) {
    return (
      <div className="class-card class-empty">
        <p>Clasa nu are elevi.</p>
      </div>
    );
  }
  if (students.length === 0) {
    return (
      <div className="class-card class-empty">
        <p>Clasa nu are încă elevi. Poți lipi lista din catalog.</p>
        <button type="button" className="button button-small" onClick={() => setAddOpen(true)}>
          + Adaugă elevi
        </button>
        {addDialog}
```

Replace it with:

```tsx

  if (students.length === 0) {
    const add = (
      <button type="button" className="button button-small" onClick={() => setAddOpen(true)}>
        Adaugă elevi
      </button>
    );
    return (
      <div className="class-card">
        <NoStudents name={className} readOnly={readOnly} action={add} />
        {addDialog}
```

- [ ] **Step 14: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
              classId={classId}
              students={students}
```

Replace it with:

```tsx
              classId={classId}
              name={info.name}
              students={students}
```

- [ ] **Step 15: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  125 passed | 1 skipped (126)`, `Tests  2016 passed | 3 skipped (2019)`.

- [ ] **Step 16: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 17: Commit**

```bash
git add src/admin/classPage/GradesTable.tsx src/admin/classPage/ClassStudents.tsx src/admin/pages/ClassPage.tsx src/admin/pages/ClassPage.test.tsx
git commit -m "Show a class with no students or no tests as empty states"
```

### Task 4: The test page

În clasă with no paper, and Rezultate with nothing to publish.

**Files:**
- Modify: `src/admin/testPage/StagePanel.tsx`, `src/admin/testPage/ResultsAccess.tsx`, `src/admin/testPage/UploadLink.tsx`
- Test: `src/admin/pages/TestPage.test.tsx`, `src/admin/testPage/ResultsPanel.test.tsx`

**Interfaces:**
- Consumes: `EmptyState`, `IconQr`, `IconClock` (Task 1); `MoveOnLink`.
- Produces: `NoResultsYet()` from `testPage/ResultsAccess.tsx`; `QrOverlay` exported from `testPage/UploadLink.tsx`.

- [ ] **Step 1: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
  fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
];

function apiWith(overrides: Parameters<typeof fakeTest>[0] = {}) {
```

Replace it with:

```tsx
  fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
];

// The same students, none of whom has uploaded a file.
const notSent = () => uploads.map((row) => fakeUpload({ studentId: row.studentId, studentName: row.studentName }));

function apiWith(overrides: Parameters<typeof fakeTest>[0] = {}) {
```

- [ ] **Step 2: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByLabelText('Încarcă baremul')).toBeDisabled();
  });
```

Replace it with:

```tsx
    expect(await screen.findByLabelText('Încarcă baremul')).toBeDisabled();
  });

  it('says no paper came yet while the test is open and nothing was uploaded, with the QR code on the whole screen', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, submittedCount: 0, studentCount: 3 }, notSent())],
    });
    renderAdmin(`${PAGE}#in-clasa`, api);
    expect(await screen.findByRole('heading', { level: 3, name: 'Nicio lucrare trimisă încă' })).toBeInTheDocument();
    expect(
      screen.getByText('Elevii scanează codul QR de pe test și trimit pozele. Lucrările apar aici pe măsură ce vin.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Încărcările elevilor' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Oprește testul' })).toBeInTheDocument();
    const empty = screen.getByRole('heading', { name: 'Nicio lucrare trimisă încă' }).parentElement!;
    const show = within(empty).getByRole('button', { name: 'Arată codul QR pe tot ecranul' });
    await userEvent.click(show);
    const dialog = await screen.findByRole('dialog', { name: 'Codul QR pentru elevi' });
    expect(within(dialog).getByText(`${window.location.origin}/u/${FAKE_TOKEN}`)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Închide' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(show).toHaveFocus();
  });

  it('lists the papers as soon as one student uploaded a file, and once the uploads are closed', async () => {
    const one = [notSent()[0]!, uploads[1]!, notSent()[2]!];
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, submittedCount: 0, studentCount: 3 }, one)],
    });
    const first = renderAdmin(`${PAGE}#in-clasa`, api);
    expect(await screen.findByRole('table', { name: 'Încărcările elevilor' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nicio lucrare trimisă încă' })).not.toBeInTheDocument();
    first.unmount();
    renderAdmin(
      `${PAGE}#in-clasa`,
      createFakeApi({
        classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
        students: {},
        tests: [fakeTest({ status: 'done', submittedCount: 0, studentCount: 3 }, notSent())],
      }),
    );
    expect(await screen.findByRole('table', { name: 'Încărcările elevilor' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nicio lucrare trimisă încă' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    await openStage('Rezultate');
    expect(screen.getByText('Rezultatele se publică după corectare.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
```

Replace it with:

```tsx
    await openStage('Rezultate');
    expect(screen.getByRole('heading', { level: 3, name: 'Rezultatele se publică după corectare' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
```

- [ ] **Step 4: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toBeInTheDocument();
    expect(screen.getByText('Rezultatele se publică după corectare.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Linkurile cu rezultatele elevilor' })).not.toBeInTheDocument();
```

Replace it with:

```tsx
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Rezultatele se publică după corectare' })).toBeInTheDocument();
    expect(screen.getByText('Când lucrările sunt corectate, le publici de aici; fiecare elev primește linkul lui.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Mergi la Corectare' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Corectare' })).toHaveFocus();
    expect(screen.queryByRole('table', { name: 'Linkurile cu rezultatele elevilor' })).not.toBeInTheDocument();
```

- [ ] **Step 5: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx
    ).toBeInTheDocument();
    expect(screen.getByText('Rezultatele se publică după corectare.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publică toate rezultatele' })).not.toBeInTheDocument();
```

Replace it with:

```tsx
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Rezultatele se publică după corectare' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mergi la Corectare' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publică toate rezultatele' })).not.toBeInTheDocument();
```

- [ ] **Step 6: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByRole('button', { name: 'Oprește accesul la rezultate' })).toBeInTheDocument();
    expect(screen.queryByText('Rezultatele se publică după corectare.')).not.toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(await screen.findByRole('button', { name: 'Oprește accesul la rezultate' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Rezultatele se publică după corectare' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 7: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/TestPage.test.tsx src/admin/testPage/ResultsPanel.test.tsx`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  4 failed | 122 passed (126)`: no empty state in În clasă (`Unable to find role="heading" and name "Nicio lucrare trimisă încă"`) or in Rezultate (`Unable to find … role "heading" and name "Rezultatele se publică după corectare"`). The new test of a paper uploaded or a closed upload passes: it holds for the old page too.

- [ ] **Step 8: Edit `src/admin/testPage/UploadLink.tsx`**

Find this block:

```tsx
// an open side panel stays open.
function QrOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
```

Replace it with:

```tsx
// an open side panel stays open.
export function QrOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
```

- [ ] **Step 9: Edit `src/admin/testPage/ResultsAccess.tsx`**

Find this block:

```tsx
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

```

Replace it with:

```tsx
import { useApi } from '../ApiContext.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { IconClock } from '../shell/icons.tsx';
import { MoveOnLink } from './MoveOnLink.tsx';

```

- [ ] **Step 10: Edit `src/admin/testPage/ResultsAccess.tsx`**

Find this block:

```tsx
  return test.status !== 'draft' && (test.gradedCount > 0 || test.resultsOpen || test.publishedCount > 0);
}
```

Replace it with:

```tsx
  return test.status !== 'draft' && (test.gradedCount > 0 || test.resultsOpen || test.publishedCount > 0);
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
      Când lucrările sunt corectate, le publici de aici; fiecare elev primește linkul lui.
    </EmptyState>
  );
}
```

- [ ] **Step 11: Edit `src/admin/testPage/ResultsAccess.tsx`**

Find this block:

```tsx
  });
  if (!hasResultsToManage(test)) return <p className="hint">Rezultatele se publică după corectare.</p>;
  return (
```

Replace it with:

```tsx
  });
  if (!hasResultsToManage(test)) return <NoResultsYet />;
  return (
```

- [ ] **Step 12: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useRef } from 'react';
import { useLocation } from 'react-router';
```

Replace it with:

```tsx
import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router';
```

- [ ] **Step 13: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import type { StageName } from '../stages.ts';
```

Replace it with:

```tsx
import { useApi } from '../ApiContext.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { IconQr } from '../shell/icons.tsx';
import type { StageName } from '../stages.ts';
```

- [ ] **Step 14: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
import { linksCount, ResultLinksTable } from './ResultLinksTable.tsx';
import { ResultsAccess } from './ResultsAccess.tsx';
import { ReviewList } from './ReviewList.tsx';
```

Replace it with:

```tsx
import { linksCount, ResultLinksTable } from './ResultLinksTable.tsx';
import { NoResultsYet, ResultsAccess } from './ResultsAccess.tsx';
import { ReviewList } from './ReviewList.tsx';
```

- [ ] **Step 15: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
import { TestFiles } from './TestFiles.tsx';
import { MultiUploadLink } from './UploadLink.tsx';
import { UploadsTable } from './UploadsTable.tsx';
```

Replace it with:

```tsx
import { TestFiles } from './TestFiles.tsx';
import { MultiUploadLink, QrOverlay, uploadLink } from './UploadLink.tsx';
import { UploadsTable } from './UploadsTable.tsx';
```

- [ ] **Step 16: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
function ClassPanel(props: PanelProps) {
  const { test, onChanged } = props;
  return (
```

Replace it with:

```tsx
function ClassPanel(props: PanelProps) {
  const { test, uploads, onChanged } = props;
  // While the test is open and no student has uploaded a file (as for
  // "Oprește testul"), the papers table would only say "Nu a trimis".
  const nothingYet = test.status === 'open' && uploads.every((row) => row.fileCount === 0);
  return (
```

- [ ] **Step 17: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
      {test.status === 'open' && <MultiUploadLink code={test.code} token={test.multiUploadToken} onChanged={onChanged} />}
      {test.status !== 'draft' && <Papers {...props} selectable={false} />}
    </>
```

Replace it with:

```tsx
      {test.status === 'open' && <MultiUploadLink code={test.code} token={test.multiUploadToken} onChanged={onChanged} />}
      {nothingYet ? <NoPapersYet token={test.uploadToken} /> : test.status !== 'draft' && <Papers {...props} selectable={false} />}
    </>
  );
}

// An open test with no paper yet (redesign spec §11.9): its one next step is
// the QR code on the whole screen, for the class projector. Closing it gives
// the focus back to the button.
function NoPapersYet({ token }: { token: string | null }) {
  const [fullScreen, setFullScreen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const show = token && (
    <button ref={button} type="button" className="button-quiet button-small" onClick={() => setFullScreen(true)}>
      Arată codul QR pe tot ecranul
    </button>
  );
  return (
    <>
      <EmptyState icon={<IconQr />} title="Nicio lucrare trimisă încă" action={show || undefined}>
        Elevii scanează codul QR de pe test și trimit pozele. Lucrările apar aici pe măsură ce vin.
      </EmptyState>
      {fullScreen && token && (
        <QrOverlay
          url={uploadLink(token)}
          onClose={() => {
            setFullScreen(false);
            button.current?.focus();
          }}
        />
      )}
    </>
```

- [ ] **Step 18: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
function ResultsPanel({ test, uploads, onChanged }: PanelProps) {
  if (test.status === 'draft') return <p className="hint">Rezultatele se publică după corectare.</p>;
  const count = linksCount(uploads, test.resultsOpen);
```

Replace it with:

```tsx
function ResultsPanel({ test, uploads, onChanged }: PanelProps) {
  if (test.status === 'draft') return <NoResultsYet />;
  const count = linksCount(uploads, test.resultsOpen);
```

- [ ] **Step 19: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  125 passed | 1 skipped (126)`, `Tests  2018 passed | 3 skipped (2021)`.

- [ ] **Step 20: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 21: Commit**

```bash
git add src/admin/testPage/StagePanel.tsx src/admin/testPage/ResultsAccess.tsx src/admin/testPage/UploadLink.tsx src/admin/pages/TestPage.test.tsx src/admin/testPage/ResultsPanel.test.tsx
git commit -m "Show a test with no paper and Rezultate with nothing graded as empty states"
```

### Task 5: The first steps

"Bun venit" and "Primii pași" on a new teacher's Teste page.

**Files:**
- Create: `src/admin/testsPage/FirstSteps.tsx`
- Modify: `src/admin/pages/TestsPage.tsx`, `src/admin/testsPage/greeting.ts`, `src/ui/brand.css`
- Test: `src/admin/pages/TestsPage.test.tsx`, `src/admin/Layout.test.tsx`

**Interfaces:**
- Consumes: `IconDone` (Task 1); `NewClassDialog`.
- Produces: `FirstSteps({ hasClass })` from `testsPage/FirstSteps.tsx`; `welcome(name)` from `testsPage/greeting.ts`; the CSS classes `first-steps`, `first-steps-list`, `first-step-mark` in `brand.css`.

- [ ] **Step 1: Edit `src/admin/pages/TestsPage.test.tsx`**

Find this block:

```tsx
import { ApiError } from '../api.ts';
import { createFakeApi, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
```

Replace it with:

```tsx
import { ApiError } from '../api.ts';
import { createFakeApi, fakeTeacher, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
```

- [ ] **Step 2: Edit `src/admin/pages/TestsPage.test.tsx`**

Find this block:

```tsx

  it('says so when the year has no tests', async () => {
    renderAdmin('/', createFakeApi());
    expect(await screen.findByText('Nu ai niciun test în acest an școlar.')).toBeInTheDocument();
    expect(screen.getByText(/Nimic nu te așteaptă acum\./)).toBeInTheDocument();
  });
```

Replace it with:

```tsx

  it('says so when the year has no tests, for a teacher who has had tests graded', async () => {
    renderAdmin('/', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ testsEvaluated: 3 }) }));
    expect(await screen.findByText('Nu ai niciun test în acest an școlar.')).toBeInTheDocument();
    expect(screen.getByText(/Nimic nu te așteaptă acum\./)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Primii pași' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent('Bun venit');
  });

  it('welcomes a new teacher with the first steps, none done yet', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-07T10:00:00.000Z'));
    renderAdmin('/', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ name: 'Maria Ionescu' }) }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Bun venit, Maria.' })).toBeInTheDocument();
    expect(screen.getByText('Sâmbătă, 7 noiembrie · Trei pași până la primul test corectat.')).toBeInTheDocument();
    const card = await screen.findByRole('region', { name: 'Primii pași' });
    expect(card).toHaveTextContent('0 din 3');
    const steps = within(card).getAllByRole('listitem');
    expect(steps.map((step) => within(step).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'Adaugă o clasă',
      'Fă un test',
      'Tipărește-l cu cod QR',
    ]);
    expect(steps[0]).toHaveTextContent('Numele clasei și elevii, câte unul pe rând. Poți lipi lista din catalog.');
    expect(steps[1]).toHaveTextContent('Încarci testul și baremul. Nu ai barem? Primești o propunere pe care o verifici tu.');
    expect(steps[2]).toHaveTextContent('Elevii scanează codul și trimit pozele lucrării. Fără cont și fără aplicație.');
    expect(within(steps[1]!).getByRole('button', { name: 'Test nou' })).toBeDisabled();
    expect(within(steps[2]!).queryByRole('button')).not.toBeInTheDocument();
    // The card is the page: no filters, no "Test nou" in the head, no line about no tests.
    const page = screen.getByRole('main');
    expect(within(page).queryByRole('group', { name: 'Clasa' })).not.toBeInTheDocument();
    expect(within(page).queryByRole('checkbox', { name: 'Arată și testele arhivate' })).not.toBeInTheDocument();
    expect(within(page).queryByText('Nu ai niciun test în acest an școlar.')).not.toBeInTheDocument();
    expect(within(page).queryAllByRole('link', { name: 'Test nou' })).toHaveLength(0);
    await userEvent.click(within(steps[0]!).getByRole('button', { name: 'Clasă nouă' }));
    expect(await screen.findByRole('dialog', { name: 'Clasă nouă' })).toBeInTheDocument();
  });

  it('ticks the class once there is one, and opens "Test nou" next', async () => {
    renderAdmin('/', createFakeApi({ classes: oneClass, students: {} }));
    const card = await screen.findByRole('region', { name: 'Primii pași' });
    expect(await within(card).findByText('1 din 3')).toBeInTheDocument();
    const [first, second] = within(card).getAllByRole('listitem');
    expect(first).toHaveClass('is-done');
    expect(within(first!).getByRole('heading', { level: 3 })).toHaveAccessibleName('Adaugă o clasă gata');
    expect(within(first!).queryByRole('button')).not.toBeInTheDocument();
    expect(within(second!).getByRole('link', { name: 'Test nou' })).toHaveAttribute('href', '/teste/nou');
  });

  it('counts an archived class as no class for the first step', async () => {
    renderAdmin('/', createFakeApi({ classes: [{ ...oneClass[0]!, archived: true }], students: {} }));
    const card = await screen.findByRole('region', { name: 'Primii pași' });
    expect(await within(card).findByRole('button', { name: 'Clasă nouă' })).toBeInTheDocument();
    expect(card).toHaveTextContent('0 din 3');
  });

  it('shows no first steps once a test exists', async () => {
    renderAdmin('/', createFakeApi({ classes: oneClass, students: {}, tests: [fakeTest({ code: '6E2-26T1', title: 'Fracții' })] }));
    expect(await screen.findByRole('link', { name: 'Fracții' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Primii pași' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
    // The Teste page shows the tests of the new year: none.
    expect(await within(screen.getByRole('main')).findByText('Nu ai niciun test în acest an școlar.')).toBeInTheDocument();
    expect(api.listTests).toHaveBeenCalledWith(2027);
```

Replace it with:

```tsx
    // The Teste page shows the tests of the new year: none.
    await vi.waitFor(() => expect(within(screen.getByRole('main')).queryByRole('link', { name: 'Ecuații' })).not.toBeInTheDocument());
    expect(api.listTests).toHaveBeenCalledWith(2027);
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/TestsPage.test.tsx src/admin/Layout.test.tsx`
Expected: FAIL. `Test Files  1 failed | 1 passed (2)`, `Tests  3 failed | 78 passed (81)`: no welcome (`Unable to find role="heading" and name "Bun venit, Maria."`) and no card (`Unable to find role="region" and name "Primii pași"`). The returning teacher's test and "shows no first steps once a test exists" pass: they hold for the old page too.

- [ ] **Step 5: Create `src/admin/testsPage/FirstSteps.tsx`**

```tsx
import { useState } from 'react';
import { Link } from 'react-router';
import { NewClassDialog } from '../classPage/ClassDialogs.tsx';
import { IconDone } from '../shell/icons.tsx';

// "Primii pași" of a new teacher's Teste page (redesign spec §11.9): add a
// class, make a test, print it with the QR code. The class is the only step
// that can be done while the card shows (it goes once a test exists): a tick,
// and "Test nou" turns on.
export function FirstSteps({ hasClass }: { hasClass: boolean }) {
  const [newClassOpen, setNewClassOpen] = useState(false);
  return (
    <section className="class-card first-steps" aria-labelledby="first-steps">
      <div className="class-card-head">
        <h2 id="first-steps">Primii pași</h2>
        <span>{hasClass ? 1 : 0} din 3</span>
      </div>
      <ol className="first-steps-list">
        <li className={hasClass ? 'is-done' : 'is-now'}>
          <span className="first-step-mark" aria-hidden="true">
            {hasClass ? <IconDone /> : 1}
          </span>
          <h3>
            Adaugă o clasă{hasClass && ' '}
            {hasClass && <span className="sr-only">gata</span>}
          </h3>
          <p>Numele clasei și elevii, câte unul pe rând. Poți lipi lista din catalog.</p>
          {!hasClass && (
            <button type="button" className="button button-small" onClick={() => setNewClassOpen(true)}>
              Clasă nouă
            </button>
          )}
        </li>
        <li className={hasClass ? 'is-now' : undefined}>
          <span className="first-step-mark" aria-hidden="true">
            2
          </span>
          <h3>Fă un test</h3>
          <p>Încarci testul și baremul. Nu ai barem? Primești o propunere pe care o verifici tu.</p>
          {hasClass ? (
            <Link className="button button-small" to="/teste/nou">
              Test nou
            </Link>
          ) : (
            <button type="button" className="button-quiet button-small" disabled>
              Test nou
            </button>
          )}
        </li>
        <li>
          <span className="first-step-mark" aria-hidden="true">
            3
          </span>
          <h3>Tipărește-l cu cod QR</h3>
          <p>Elevii scanează codul și trimit pozele lucrării. Fără cont și fără aplicație.</p>
        </li>
      </ol>
      {newClassOpen && <NewClassDialog onClose={() => setNewClassOpen(false)} />}
    </section>
  );
}
```

- [ ] **Step 6: Edit `src/admin/testsPage/greeting.ts`**

Find this block:

```ts

// "Miercuri, 4 noiembrie".
```

Replace it with:

```ts

// "Bun venit, Maria." for a new teacher: the first word of the name, or none.
export function welcome(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first ? `Bun venit, ${first}.` : 'Bun venit.';
}

// "Miercuri, 4 noiembrie".
```

- [ ] **Step 7: Edit `src/admin/pages/TestsPage.tsx`**

Find this block:

```tsx
import { inWork, todoList } from '../shell/todo.ts';
import { greeting, todayLine } from '../testsPage/greeting.ts';
import { TestGroup } from '../testsPage/TestGroup.tsx';
```

Replace it with:

```tsx
import { inWork, todoList } from '../shell/todo.ts';
import { FirstSteps } from '../testsPage/FirstSteps.tsx';
import { greeting, todayLine, welcome } from '../testsPage/greeting.ts';
import { TestGroup } from '../testsPage/TestGroup.tsx';
```

- [ ] **Step 8: Edit `src/admin/pages/TestsPage.tsx`**

Find this block:

```tsx
// groups, newest first. The class and the archived choice live in the
// address, so a link or a reload keeps them.
export function TestsPage() {
```

Replace it with:

```tsx
// groups, newest first. The class and the archived choice live in the
// address, so a link or a reload keeps them. A new teacher (no test in the
// year, and none ever sent to grading) sees "Bun venit" and "Primii pași"
// instead (redesign spec §11.9).
export function TestsPage() {
```

- [ ] **Step 9: Edit `src/admin/pages/TestsPage.tsx`**

Find this block:

```tsx
  const first = todo[0]?.code ?? null;

```

Replace it with:

```tsx
  const first = todo[0]?.code ?? null;
  const firstVisit = tests.data?.length === 0 && me.data?.testsEvaluated === 0;
  const hasClass = classes.data?.some((item) => !item.archived) ?? false;

  if (firstVisit) {
    return (
      <section className="tests-page">
        <div className="page-head">
          <div className="greet">
            <h1>{welcome(me.data?.name ?? '')}</h1>
            <p>{todayLine(now)} · Trei pași până la primul test corectat.</p>
          </div>
        </div>
        {classes.error && <ErrorMessage error={classes.error} />}
        {classes.data && <FirstSteps hasClass={hasClass} />}
      </section>
    );
  }

```

- [ ] **Step 10: Edit `src/ui/brand.css`**

Find this block:

```css

/* "Note și teste": the grades table as wide as its columns, "Testele clasei"
```

Replace it with:

```css

/* "Primii pași" of a new teacher's Teste page: three numbered steps, the
   current one marked blue, a done one ticked green. */
.first-steps {
  max-width: 48rem;
}

.first-steps-list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.first-steps-list li {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr);
  align-items: start;
  gap: 0.25rem 0.875rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--line);
}

.first-steps-list li > :not(.first-step-mark) {
  grid-column: 2;
}

.first-step-mark {
  grid-row: 1 / span 3;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  background: var(--active);
  color: var(--muted);
  font-weight: 700;
}

.first-step-mark svg {
  width: 1rem;
  height: 1rem;
}

.first-steps-list li.is-now .first-step-mark {
  background: var(--ink-tint);
  color: var(--ink);
}

.first-steps-list li.is-done .first-step-mark {
  background: var(--ok-bg);
  color: var(--ok-fg);
}

.first-steps-list h3 {
  margin: 0.25rem 0 0;
  font-size: 1rem;
}

.first-steps-list p {
  margin: 0;
  color: var(--muted);
  font-size: 0.9375rem;
}

.first-steps-list .button,
.first-steps-list .button-quiet {
  justify-self: start;
  margin-top: 0.5rem;
}

/* "Note și teste": the grades table as wide as its columns, "Testele clasei"
```

- [ ] **Step 11: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  125 passed | 1 skipped (126)`, `Tests  2022 passed | 3 skipped (2025)`.

- [ ] **Step 12: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 13: Commit**

```bash
git add src/admin/testsPage/FirstSteps.tsx src/admin/testsPage/greeting.ts src/admin/pages/TestsPage.tsx src/ui/brand.css src/admin/pages/TestsPage.test.tsx src/admin/Layout.test.tsx
git commit -m "Welcome a new teacher with the first steps on the Teste page"
```

### Task 6: The notes

`src/AGENTS.md` describes the empty states and the first steps.

**Files:**
- Modify: `src/AGENTS.md`

- [ ] **Step 1: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `pages/SettingsPage.tsx` is Setări (redesign spec §11.8, administrators only): three tabs, with the tab in the address (`?tab=corectarea`, `?tab=robotul`; none, or one it does not know, is "Conturi", and a click replaces the address). The three panels stay drawn, the others `hidden`, so a new key or password shown once survives a look at another tab. "Conturi" (`settingsPage/AccountsSection.tsx`) holds a red-edged card of the accounts that wait (gone when none waits; "Refuză toate" from two up) and "Toate conturile", with ⋯ (`shell/useSmallMenu.ts`) on a teacher's row only: "Fă cont complet" or "Fă cont demo", "Parolă nouă", "Închide contul", and for a closed account "Redeschide contul". An item closes the menu and gives the focus back to ⋯ before it asks or acts; the new password and an error show in a row under the account. The red count of "Conturi" reads `['accounts']` on every tab. "Corectarea" saves each control as it changes: the new value shows at once, the control stays on while it saves, and a refusal puts back the saved value. "Robotul" holds "Starea robotului" (a tag: "lucrează acum" or "nu lucrează acum") and "Cheia robotului" with the day it was made (`robotKeyAt`; a key made before that was kept has none). Below 40rem each account row is a block (CSS).
- `ui/GradingProgress.tsx` is the grading bar (blue graded, pale blue waiting, empty track not sent) under the test page's uploads heading only (the Teste page shows the stage bar instead); "✓ Corectat complet" shows when every sent paper is graded. The bar is `aria-hidden`: the counts stay in words. `EvaluationControls` shows "Marchează ca terminat" in place of the start button when a paper is graded and none waits.
```

Replace it with:

```markdown
- `pages/SettingsPage.tsx` is Setări (redesign spec §11.8, administrators only): three tabs, with the tab in the address (`?tab=corectarea`, `?tab=robotul`; none, or one it does not know, is "Conturi", and a click replaces the address). The three panels stay drawn, the others `hidden`, so a new key or password shown once survives a look at another tab. "Conturi" (`settingsPage/AccountsSection.tsx`) holds a red-edged card of the accounts that wait (gone when none waits; "Refuză toate" from two up) and "Toate conturile", with ⋯ (`shell/useSmallMenu.ts`) on a teacher's row only: "Fă cont complet" or "Fă cont demo", "Parolă nouă", "Închide contul", and for a closed account "Redeschide contul". An item closes the menu and gives the focus back to ⋯ before it asks or acts; the new password and an error show in a row under the account. The red count of "Conturi" reads `['accounts']` on every tab. "Corectarea" saves each control as it changes: the new value shows at once, the control stays on while it saves, and a refusal puts back the saved value. "Robotul" holds "Starea robotului" (a tag: "lucrează acum" or "nu lucrează acum") and "Cheia robotului" with the day it was made (`robotKeyAt`; a key made before that was kept has none). Below 40rem each account row is a block (CSS).
- `EmptyState.tsx` is an empty place of the teacher app (redesign spec §11.9): an icon (`shell/icons.tsx`), a heading at the level of its place (`level`: an h3 under a panel's or a card's title, an h2 in a card with none, an h1 on a page with no other heading), one sentence, and at most one button, its one next step. It is used by "Clasele tale" with no class (its "+ Clasă nouă"; the panel's own foot then shows only "Arhivate (n)"), "Ce ai de făcut" with nothing, `/clase` with no active class, a class with no students or no tests (`NoStudents` in `classPage/GradesTable.tsx`, on both tabs; an archived class gets the same headings and no button), În clasă while the test is open and no student has uploaded a file (the QR code on the whole screen, `QrOverlay` of `UploadLink.tsx`; the focus goes back to the button), and Rezultate with nothing to publish (`NoResultsYet` in `ResultsAccess.tsx`, "Mergi la Corectare"; the students' links stay under it). A new teacher (no test in the year, and `testsEvaluated` 0) sees on the Teste page "Bun venit, …" and `testsPage/FirstSteps.tsx` ("Primii pași": a class, a test, the print) in place of the filters and the lists; the card goes once a test exists.
- `ui/GradingProgress.tsx` is the grading bar (blue graded, pale blue waiting, empty track not sent) under the test page's uploads heading only (the Teste page shows the stage bar instead); "✓ Corectat complet" shows when every sent paper is graded. The bar is `aria-hidden`: the counts stay in words. `EvaluationControls` shows "Marchează ca terminat" in place of the start button when a paper is graded and none waits.
```

- [ ] **Step 2: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  125 passed | 1 skipped (126)`, `Tests  2022 passed | 3 skipped (2025)`.

- [ ] **Step 3: Commit**

```bash
git add src/AGENTS.md
git commit -m "Describe the empty states and the first steps in the notes"
```

### Task 7: Look at it, then the pull request (main session)

Not a subagent task. Nothing here changes code unless a check fails; a fix found here is prototyped, tested and committed like the tasks above, and named to the user.

- [ ] **Step 1: Check the exactness of the branch**

Run: `git diff --stat refs/proto15/e6 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

- [ ] **Step 2: Run the whole suite three times, and once in UTC**

Run `npm test` three times, then once with `TZ=UTC` (Git Bash: `TZ=UTC npm test`).
Expected: PASS every time. `Test Files  125 passed | 1 skipped (126)`, `Tests  2022 passed | 3 skipped (2025)`.

- [ ] **Step 3: Build and start the production build**

Check port 8788 first (`netstat -ano | findstr :8788`; end a leftover `workerd.exe` as `AGENTS.md` says). Run `npm run db:local`, then the Claude Code preview server `preview` (`npm run preview`, http://127.0.0.1:8788). The development login of `.dev.vars` logs in the local teacher. For the first visit, set the local teacher's `tests_evaluated` to 0 (`npx wrangler d1 execute quickeval --local --command "…"`) and choose a school year with no class; put the number back after.
Expected: `Ready on http://127.0.0.1:8788`.

- [ ] **Step 4: Look at the pages at 1440px, 1024px and 390px, light and dark**

The Teste page of a first visit ("Primii pași", 0 din 3; after a class, 1 din 3); "Clasele tale" and "Ce ai de făcut" with nothing; `/clase` with no class; a class with no students and one with no tests; an open test with no paper (În clasă, and the QR code on the whole screen); Rezultate of a draft. Measure `document.documentElement.scrollWidth <= innerWidth` on each.
Expected: the look of round 7, page "Prima vizită și stările goale" A; no sideways scroll.

- [ ] **Step 5: Run the smoke test**

Run `npm run smoke` in a second terminal.
Expected: every check passes.

- [ ] **Step 6: Commit the plan**

```bash
git add docs/superpowers/plans/2026-11-08-mqgrader-phase-8e-empty-states.md
git commit -m "Add the Phase 8e plan"
```

- [ ] **Step 7: Ask the user, then push and open the pull request**

Ask the user before pushing. On a yes: `git push -u origin feature/mqgrader-empty-states`, then a ready pull request into `main` that lists what changed, the rulings above, and what was checked.

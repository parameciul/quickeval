# MQGrader Phase 8b: The way in, Contul meu, the demo button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 5 must run in the main session, not in a subagent:** it looks at the app in a browser, and every outward step (push, pull request) needs the user's explicit yes.

**Goal:** The pages of the way in and of the account, as the user picked them in round 7 (spec §11.4–11.6): login and sign-up are a split screen (the form on the left, the landing page's statement and six stages on the right), and so are the email confirmation and the new password; Contul meu is one column of three cards; a demo account's papers are a button in the top bar, not a paragraph under it.

**Architecture:** No API change, no migration. A new `src/admin/wayIn/WayIn.tsx` draws the two halves, the state of the left half (`State`: icon, heading, line) and the link back (`BackHome`); `LoginPage`, `ConfirmEmailPage` and `NewPasswordPage` use it. The login's 403 `account_pending` (no session) becomes a state of its own. A new `src/admin/account/DemoMeters.tsx` says what a demo account has used (`demoUsage`, `demoLine`) and draws its two meters, for Contul meu, the new demo button of the top bar (`shell/DemoButton.tsx`) and the phone menu. The small menus of the top bar share `shell/useSmallMenu.ts` (`UserMenu` moves to it). `Layout.tsx` drops the school year while nobody is logged in and the demo paragraph.

**Tech Stack:** Node 24, TypeScript, React 19, TanStack Query, React Router, Hono on Cloudflare Pages with D1, Vitest 5, Testing Library. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md` (§1 decisions 33–35, §4, §11.4–11.6). Task 4 changes §4's demo line. Root `AGENTS.md`, `src/AGENTS.md` and `server/AGENTS.md` hold the project rules. The approved prototypes: round 7 https://claude.ai/artifact/NTc1cfWBhUF4EkkCZN2uNm, pages "Intrare" B, "Contul meu" A, "Linia contului demo" B. Where the round 7 page and the spec differ, the spec wins (ruling 1).

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- No server file changes: the login, the sign-up, the confirmation, the password reset and the demo limit keep their rules and their SQL.
- Flat colours only: no gradient anywhere in `brand.css`; a shadow only on what floats (the demo menu). Orange only for what waits on the teacher, and for the teacher's stages and the full demo limit as the spec says.
- No page tells students that AI grades their work; this plan changes no student page.
- Do not run Prettier or any formatter: the repo has no formatter configuration, and its defaults rewrite the quotes of whole files.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A` (the checkout holds local files that must not be committed: `.claude/launch.json` entries, untracked plan files).
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root `D:\Projects\QuickEval`, on the branch `feature/mqgrader-way-in`. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy, on `main` too. If only tests of those three files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts runner/api.test.ts` alone. Then the full run counts as passed when its failed and passed tests add up to the expected passed number; say so in the task report.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; overwrite all of it with exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/proto12/b1` … `refs/proto12/b4`, one per task, on `refs/proto12/bbase` (the same files as `main` at `b5b76d0`). After Task N, `git diff --stat refs/proto12/bN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`). Four tests run the real pandoc (`runner/baremDocx.test.ts`, `runner/baremTask.test.ts`, `runner/workdir.test.ts`): without pandoc they skip too, so every total shows 4 fewer passed and 4 more skipped.

## Rulings made while planning

Settled while building the prototype on 2026-11-08.

1. Where the round 7 page and the spec differ, the spec wins: the two halves are of equal width, both on the white surface (`--sheet`), with a 1 px line between them; the box of the six stages is on the raised tone (`--raised`). The round 7 page had a 5:7 split and the right half on the ground tone.
2. The heading of the left half's state is the page's `h1` (it is the task); the statement on the right is an `h2`. "Un test, în șase etape" is a line drawn in capitals (CSS), and each stage's name is an `h3`, as on the landing page.
3. Every state keeps today's text, as spec §11.4 says. New claims of the round 7 page are left out: "de obicei durează o zi", the email address in "Verifică-ți emailul" and in "Parolă nouă". The fields are named "Adresa de email" (round 7) instead of "Email". The sign-up note is the spec's: "**Contul demo:** poți corecta un test, cu cel mult 35 de lucrări. Întâi confirmi adresa de email, apoi un administrator aprobă contul."
4. A login refused with 403 `account_pending` shows "Contul tău așteaptă aprobarea" with the typed email and an orange clock. The server sets no cookie for it, so its "Ieși" only takes the left half back to "Intră în cont" (with an empty form). Every other refusal (a wrong password, 403 `email_unconfirmed`, a lock) shows under the form, as today: the spec lists no state for them.
5. After "Trimite linkul" the left half shows "Verifică-ți emailul" with the mail icon and today's text. The confirmed email shows "Adresa ta este confirmată" with the green tick; a saved new password keeps the heading "Parolă nouă", with the green tick and today's text.
6. When the left half changes state, the focus moves to the new heading (`tabIndex={-1}`); the first state after a page load takes no focus.
7. The switch "Am cont" / "Vreau cont nou" goes: "Nu ai cont? Cere un cont de profesor" and "Ai deja cont? Intră în cont" under the forms change the state, and "Am uitat parola" sits beside the label "Parola". `#cont-nou` from the landing page still opens the sign-up.
8. The top bar holds the school year only for a logged-in teacher (`me.data`), whatever the address: this ends the 14 px select of Phase 2 on the logged-out phone page. `/confirma-email` and `/parola-noua` show the two halves while nobody is logged in.
9. The heading, the line and the six stages are copied from `index.html` word for word, and `WayIn.test.tsx` reads `index.html` to check them, so a change to the landing page cannot leave the login page behind unseen. "Tu faci 4 din 6 etape" counts the stages of "Tu".
10. Contul meu: the tag is green ("Cont complet", "Administrator") or grey ("Cont demo"). A demo account (any role: the limit follows `demo`) sees the two meters; "Teste corectate" is "1 din 1" once `testsEvaluated` is 1 or more, because a regrade counts the same test again; "Lucrări corectate" counts the papers on their way to the robot, never over 35. "Schimbă parola" is a quiet button (round 7). The third card is named "Ieșire" for screen readers.
11. The demo button: "Demo · " and `countLabel` of the papers left ("15 lucrări rămase", "1 lucrare rămasă", "20 de lucrări rămase", "0 lucrări rămase"). Its menu "Cont demo" shows the meters and the line of Contul meu (`demoLine`), then "Contul meu". With none left the ring is orange and the line asks for a complete account. It closes like the initials' menu (Esc with the focus back on the button, a click outside, a new page): both use `useSmallMenu`.
12. On a phone the top bar's tools are hidden, so the demo button is too; ☰ shows "Cont demo", the meters and the line after the teacher's name and email.
13. The paragraph under the top bar (`demoText`) and `accountKindText` go.
14. `src/AGENTS.md` also corrects the 8a note on the report: the parts are marked by measuring them on scroll and resize (`currentPart`), not by an `IntersectionObserver`.

## Review Focus

1. A login of an account that waits shows its own state, and every other refusal stays under the form (tests in Task 1: "tells an account that waits for approval, and "Ieși" goes back to the login", "shows the reason a login is refused under the form").
2. The login page says what the landing page says, word for word (test in Task 1: "says what the landing page says, word for word").
3. The demo counts: one test whatever the regrades, the waiting papers counted, never over the limit (tests in Task 2: "counts the one test once, whatever the regrades", "counts the papers on their way to the robot as used, never over the limit", "turns the papers meter orange and asks for a complete account when none are left").
4. The demo button sits before the school year, opens and closes like the initials' menu, and is read again after a change (tests in Task 3: "tells a demo account how many papers it has left, in the top bar before the school year", "closes the demo menu on Esc, with the focus back on its button, and on a click outside it", "reads the demo button again after a change, so it shows the papers left").
5. Logged out, the top bar has no school year (test in Task 1: "takes the place of every page while nobody is logged in, and opens the page after the login").

---

### Before Task 1: The branch

- [ ] **Step 1: Check the branch**

No other Claude Code session may work in this checkout meanwhile (in the desktop app: `list_sessions {"linked": true}` shows none running). The branch `feature/mqgrader-way-in` was made while planning, from `main` at `b5b76d0`. Run `git switch feature/mqgrader-way-in`, then `git log --oneline -1`.

Expected: `b5b76d0 Merge pull request #48 from parameciul/feature/mqgrader-class-pages`. The untracked plan files and the local changes of `.claude/launch.json` come along; they are never committed (this plan is committed in Task 5).

### Task 1: The way in

The login, the sign-up, the forgotten password, the email confirmation and the new password on two halves; no school year while nobody is logged in.

**Files:**
- Create: `src/admin/wayIn/WayIn.tsx`
- Replace: `src/admin/pages/LoginPage.tsx`, `src/admin/pages/ConfirmEmailPage.tsx`, `src/admin/pages/NewPasswordPage.tsx`
- Modify: `src/admin/Layout.tsx`, `src/ui/brand.css`
- Test: `src/admin/wayIn/WayIn.test.tsx` (new), `src/admin/pages/LoginPage.test.tsx`, `src/admin/pages/ConfirmEmailPage.test.tsx`, `src/admin/pages/NewPasswordPage.test.tsx`

**Interfaces:**
- Produces: `WayIn({ children })`, `State({ heading?, icon?, title, lead?, children })` with `icon: 'mail' | 'done' | 'wait'`, `BackHome()`, `StateIcon({ kind })`, and `STAGES`, `PITCH_HEADING`, `PITCH_LINE`, `STAGES_TITLE` from `wayIn/WayIn.tsx`; the CSS classes `form-fields`, `form-field`, `form-hint` (a form of fields one under the other) in `brand.css`. `accountKindText` stays until Task 2.

- [ ] **Step 1: Create `src/admin/wayIn/WayIn.test.tsx`**

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import landing from '../../../index.html?raw';
import { PITCH_HEADING, PITCH_LINE, STAGES, STAGES_TITLE, WayIn } from './WayIn.tsx';

describe('the way in', () => {
  it('says what the landing page says, word for word', () => {
    expect(landing).toContain(`>${PITCH_HEADING}</h1>`);
    expect(landing).toContain(`<p class="l-lede">${PITCH_LINE}</p>`);
    expect(landing).toContain(`<h2>${STAGES_TITLE}</h2>`);
    const landingStages = [...landing.matchAll(/<h3>([^<]+) <span class="who-tag">([^<]+)<\/span><\/h3><p>(.+?)<\/p>/g)];
    expect(landingStages.map((match) => [match[1], match[2], match[3]])).toEqual(
      STAGES.map((stage) => [stage.name, stage.who, stage.lead === undefined ? stage.text : `<b>${stage.lead}</b> ${stage.text}`]),
    );
  });

  it('shows the form, the six stages and the legend, the teacher\'s stages marked', () => {
    render(
      <WayIn>
        <h1>Intră în cont</h1>
      </WayIn>,
    );
    const pitch = screen.getByRole('region', { name: PITCH_HEADING });
    const items = within(pitch).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByRole('heading').textContent)).toEqual([
      'Pregătire Tu',
      'Tipărire Tu',
      'În clasă Elevii',
      'Corectare MQGrader',
      'Verificare Tu',
      'Rezultate Tu',
    ]);
    expect(items.filter((item) => item.classList.contains('is-you'))).toHaveLength(4);
    expect(pitch).toHaveTextContent('Tu faci 4 din 6 etape, câteva minute fiecare. Restul se fac singure.');
    expect(within(screen.getByRole('region', { name: 'Contul tău' })).getByRole('heading', { level: 1 })).toHaveTextContent('Intră în cont');
  });
});
```

- [ ] **Step 2: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx
    expect(screen.queryByRole('navigation', { name: 'Meniu' })).not.toBeInTheDocument();
    expect(api.listClasses).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Email'), 'profesor@example.com');
    await userEvent.type(screen.getByLabelText('Parola'), 'parola-buna');
```

Replace it with:

```tsx
    expect(screen.queryByRole('navigation', { name: 'Meniu' })).not.toBeInTheDocument();
    // Logged out, the top bar has the lockup and the theme, no school year.
    expect(screen.queryByLabelText('Anul școlar')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Weekendul tău, fără teancul de lucrări.' })).toBeInTheDocument();
    expect(screen.getByText('Elevii nu au nevoie de cont: trimit lucrarea de pe linkul testului.')).toBeInTheDocument();
    expect(api.listClasses).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Adresa de email'), 'profesor@example.com');
    await userEvent.type(screen.getByLabelText('Parola'), 'parola-buna');
```

- [ ] **Step 3: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx

  it('shows the reason a login is refused', async () => {
    const api = createFakeApi();
```

Replace it with:

```tsx

  it('shows the reason a login is refused under the form', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValueOnce(loginRequired());
    api.login.mockRejectedValueOnce(new ApiError(403, 'email_unconfirmed', 'Confirmă mai întâi adresa de email, cu linkul primit pe email.'));
    renderAdmin('/', api);
    await userEvent.type(await screen.findByLabelText('Adresa de email'), 'nou@example.com');
    await userEvent.type(screen.getByLabelText('Parola'), 'parola-buna');
    await userEvent.click(screen.getByRole('button', { name: 'Intră' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confirmă mai întâi adresa de email');
    expect(screen.getByRole('heading', { name: 'Intră în cont' })).toBeInTheDocument();
  });

  it('tells an account that waits for approval, and "Ieși" goes back to the login', async () => {
    const api = createFakeApi();
```

- [ ] **Step 4: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx
    renderAdmin('/', api);
    await userEvent.type(await screen.findByLabelText('Email'), 'nou@example.com');
    await userEvent.type(screen.getByLabelText('Parola'), 'parola-buna');
    await userEvent.click(screen.getByRole('button', { name: 'Intră' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Contul tău așteaptă aprobarea unui administrator.');
  });
```

Replace it with:

```tsx
    renderAdmin('/', api);
    await userEvent.type(await screen.findByLabelText('Adresa de email'), ' nou@example.com ');
    await userEvent.type(screen.getByLabelText('Parola'), 'parola-buna');
    await userEvent.click(screen.getByRole('button', { name: 'Intră' }));
    const heading = await screen.findByRole('heading', { name: 'Contul tău așteaptă aprobarea' });
    expect(heading).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Adresa nou@example.com este confirmată.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ieși' }));
    expect(screen.getByRole('heading', { name: 'Intră în cont' })).toHaveFocus();
    expect(screen.getByLabelText('Adresa de email')).toHaveValue('');
  });
```

- [ ] **Step 5: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx
    renderAdmin('/', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Vreau cont nou' }));
    expect(screen.getByRole('heading', { name: 'Cont nou' })).toBeInTheDocument();
    expect(screen.getByText(/cont demo: poți corecta un singur test, cu cel mult 35 lucrări/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Numele tău'), 'Ana Pop');
    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText(/^Parola/), 'parola-lunga');
```

Replace it with:

```tsx
    renderAdmin('/', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Cere un cont de profesor' }));
    expect(screen.getByRole('heading', { name: 'Cont nou de profesor' })).toHaveFocus();
    expect(screen.getByText(/poți corecta un test, cu cel mult 35 de lucrări\. Întâi confirmi adresa de email/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Numele tău'), 'Ana Pop');
    await userEvent.type(screen.getByLabelText('Adresa de email'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText(/^Parola/), 'parola-lunga');
```

- [ ] **Step 6: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx
    expect(api.signup).toHaveBeenCalledWith({ name: 'Ana Pop', email: 'ana@example.com', password: 'parola-lunga' });
    expect(await screen.findByRole('status')).toHaveTextContent('Ți-am trimis un email cu un link.');
  });
```

Replace it with:

```tsx
    expect(api.signup).toHaveBeenCalledWith({ name: 'Ana Pop', email: 'ana@example.com', password: 'parola-lunga' });
    expect(await screen.findByRole('heading', { name: 'Verifică-ți emailul' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Ți-am trimis un email cu un link.');
    await userEvent.click(screen.getByRole('button', { name: 'Înapoi la pagina de intrare' }));
    expect(screen.getByRole('heading', { name: 'Intră în cont' })).toBeInTheDocument();
  });
```

- [ ] **Step 7: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx
    renderAdmin('/#cont-nou', api);
    expect(await screen.findByRole('heading', { name: 'Cont nou' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vreau cont nou' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Am cont' }));
    expect(screen.getByRole('heading', { name: 'Intră în cont' })).toBeInTheDocument();
```

Replace it with:

```tsx
    renderAdmin('/#cont-nou', api);
    const heading = await screen.findByRole('heading', { name: 'Cont nou de profesor' });
    // The first state takes no focus: the page has just opened.
    expect(heading).not.toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Intră în cont' }));
    expect(screen.getByRole('heading', { name: 'Intră în cont' })).toBeInTheDocument();
```

- [ ] **Step 8: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx
    renderAdmin('/', api);
    await userEvent.click(await screen.findByRole('button', { name: /link pentru o parolă nouă/ }));
    expect(screen.getByRole('heading', { name: 'Parolă nouă' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Email'), 'profesor@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Trimite linkul' }));
    expect(api.forgotPassword).toHaveBeenCalledWith('profesor@example.com');
    expect(await screen.findByRole('status')).toHaveTextContent('Dacă adresa are un cont');
  });
```

Replace it with:

```tsx
    renderAdmin('/', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Am uitat parola' }));
    expect(screen.getByRole('heading', { name: 'Am uitat parola' })).toHaveFocus();
    await userEvent.type(screen.getByLabelText('Adresa de email'), 'profesor@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Trimite linkul' }));
    expect(api.forgotPassword).toHaveBeenCalledWith('profesor@example.com');
    expect(await screen.findByRole('heading', { name: 'Verifică-ți emailul' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Dacă adresa are un cont');
  });
```

- [ ] **Step 9: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx
    renderAdmin('/', api);
    await userEvent.click(await screen.findByRole('button', { name: /link pentru o parolă nouă/ }));
    await userEvent.type(screen.getByLabelText('Email'), 'profesor@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Trimite linkul' }));
    expect(await screen.findByText(/Prea multe cereri de resetare/)).toBeInTheDocument();
  });
```

Replace it with:

```tsx
    renderAdmin('/', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Am uitat parola' }));
    await userEvent.type(screen.getByLabelText('Adresa de email'), 'profesor@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Trimite linkul' }));
    expect(await screen.findByText(/Prea multe cereri de resetare/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Am uitat parola' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Înapoi la pagina de intrare' }));
    expect(screen.getByRole('heading', { name: 'Intră în cont' })).toBeInTheDocument();
  });
```

- [ ] **Step 10: Edit `src/admin/pages/ConfirmEmailPage.test.tsx`**

Find this block:

```tsx
    const button = await screen.findByRole('button', { name: 'Confirmă adresa' });
    expect(screen.queryByRole('heading', { name: 'Intră în cont' })).not.toBeInTheDocument();
    expect(api.confirmEmail).not.toHaveBeenCalled();
```

Replace it with:

```tsx
    const button = await screen.findByRole('button', { name: 'Confirmă adresa' });
    expect(screen.getByRole('heading', { level: 1, name: 'Confirmă adresa de email' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Intră în cont' })).not.toBeInTheDocument();
    // The same two halves as the login.
    expect(screen.getByRole('heading', { name: 'Weekendul tău, fără teancul de lucrări.' })).toBeInTheDocument();
    expect(api.confirmEmail).not.toHaveBeenCalled();
```

- [ ] **Step 11: Edit `src/admin/pages/ConfirmEmailPage.test.tsx`**

Find this block:

```tsx
    expect(api.confirmEmail).toHaveBeenCalledWith('token-din-link', 'parola-lunga');
    expect(await screen.findByRole('status')).toHaveTextContent('adresa ta este confirmată');
  });
```

Replace it with:

```tsx
    expect(api.confirmEmail).toHaveBeenCalledWith('token-din-link', 'parola-lunga');
    expect(await screen.findByRole('heading', { name: 'Adresa ta este confirmată' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Acum un administrator trebuie să aprobe contul.');
    expect(screen.getByRole('link', { name: 'Înapoi la pagina de intrare' })).toHaveAttribute('href', '/');
  });
```

- [ ] **Step 12: Edit `src/admin/pages/NewPasswordPage.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByRole('status')).toHaveTextContent('parola a fost schimbată');
  });
```

Replace it with:

```tsx
    expect(await screen.findByRole('status')).toHaveTextContent('parola a fost schimbată');
    expect(screen.getByRole('heading', { level: 1, name: 'Parolă nouă' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Weekendul tău, fără teancul de lucrări.' })).toBeInTheDocument();
  });
```

- [ ] **Step 13: Run the tests to see them fail**

Run: `npx vitest run src/admin/wayIn/WayIn.test.tsx src/admin/pages/LoginPage.test.tsx src/admin/pages/ConfirmEmailPage.test.tsx src/admin/pages/NewPasswordPage.test.tsx`
Expected: FAIL. `Test Files  4 failed (4)`, `Tests  9 failed | 12 passed (21)`: `WayIn.test.tsx` cannot load (`Failed to resolve import "./WayIn.tsx"`); the old pages have no statement on the right (`Unable to find an accessible element with the role "heading" and name "Weekendul tău, fără teancul de lucrări."`, in the confirmation and the new password tests), the logged-out top bar still has the school year (`expect(element).not.toBeInTheDocument()`), and the old login form has none of the new names (`Unable to find a label with the text of: Adresa de email`, `Unable to find role="button" and name "Cere un cont de profesor"`, `Unable to find role="heading" and name "Cont nou de profesor"`, `Unable to find role="button" and name "Am uitat parola"`).

- [ ] **Step 14: Create `src/admin/wayIn/WayIn.tsx`**

```tsx
import type { ReactNode, RefObject } from 'react';
import { Link } from 'react-router';

// One stage of a test, as the landing page (index.html) writes it, word for
// word: a test checks that the two stay the same.
export type Stage = {
  name: string;
  who: 'Tu' | 'Elevii' | 'MQGrader';
  // The sentence's bold start, when it has one.
  lead?: string;
  text: string;
  icon: ReactNode;
};

export const PITCH_HEADING = 'Weekendul tău, fără teancul de lucrări.';
export const PITCH_LINE = 'Elevii trimit pozele lucrărilor de pe telefon. Fiecare lucrare primește punctaj conform baremului.';
export const STAGES_TITLE = 'Un test, în șase etape';

export const STAGES: Stage[] = [
  {
    name: 'Pregătire',
    who: 'Tu',
    text: 'Încarci testul și baremul. Nu ai barem? Primești o propunere pe care o verifici tu.',
    icon: (
      <>
        <path d="M5 2.75h7l3 3v11.5H5z" />
        <path d="M8 9h4.5M8 12h4.5" />
      </>
    ),
  },
  {
    name: 'Tipărire',
    who: 'Tu',
    text: 'Tipărești testul. Fiecare pagină are un cod QR.',
    icon: (
      <>
        <path d="M5.5 7V2.75h9V7M5.5 14H3.5V7h13v7h-2" />
        <path d="M5.5 11.5h9v5.75h-9z" />
      </>
    ),
  },
  {
    name: 'În clasă',
    who: 'Elevii',
    text: 'Elevii scanează codul și trimit pozele lucrării. Fără cont și fără aplicație.',
    icon: (
      <>
        <rect x="5.5" y="2.5" width="9" height="15" rx="2" />
        <path d="M9 14.5h2" />
      </>
    ),
  },
  {
    name: 'Corectare',
    who: 'MQGrader',
    text: 'Fiecare lucrare primește punctaj conform baremului, pas cu pas, cu 10 puncte din oficiu.',
    icon: <path d="M4 10.5l3.5 3.5L16 5.5" />,
  },
  {
    name: 'Verificare',
    who: 'Tu',
    text: 'Punctele nesigure te așteaptă pe tine. Accepți sau schimbi punctajul.',
    icon: (
      <>
        <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" />
        <circle cx="10" cy="10" r="2.5" />
      </>
    ),
  },
  {
    name: 'Rezultate',
    who: 'Tu',
    lead: 'Fiecare elev primește un link cu rezultatul lui.',
    text: 'Raportul clasei, un PDF pentru fiecare elev și CSV pentru catalog.',
    icon: (
      <>
        <path d="M8.5 11.5l3-3" />
        <path d="M9.5 6.5l1.25-1.25a3 3 0 0 1 4.25 4.25L13.75 10.75M10.5 13.5l-1.25 1.25a3 3 0 0 1-4.25-4.25L6.25 9.25" />
      </>
    ),
  },
];

// The way in (redesign spec §11.4): two halves under the top bar, the form
// on the left and, on the right, what MQGrader does, as the landing page says
// it. On a phone the form comes first. The login, the new account, the email
// confirmation and the new password all use it.
export function WayIn({ children }: { children: ReactNode }) {
  const mine = STAGES.filter((stage) => stage.who === 'Tu').length;
  return (
    <div className="way-in">
      <section className="way-in-form" aria-label="Contul tău">
        <div className="way-in-inner">{children}</div>
        <p className="way-in-foot">Elevii nu au nevoie de cont: trimit lucrarea de pe linkul testului.</p>
      </section>
      <section className="way-in-pitch" aria-labelledby="way-in-pitch">
        <div className="way-in-inner">
          <h2 id="way-in-pitch">{PITCH_HEADING}</h2>
          <p className="way-in-line">{PITCH_LINE}</p>
          <div className="way-in-flow">
            <p className="way-in-flow-title">{STAGES_TITLE}</p>
            <ol>
              {STAGES.map((stage) => (
                <li key={stage.name} className={stage.who === 'Tu' ? 'is-you' : undefined}>
                  <span className="way-in-node">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true" focusable="false">
                      {stage.icon}
                    </svg>
                  </span>
                  <div>
                    <h3>
                      {stage.name} <span className="way-in-who">{stage.who}</span>
                    </h3>
                    <p>
                      {stage.lead !== undefined && (
                        <>
                          <b>{stage.lead}</b>{' '}
                        </>
                      )}
                      {stage.text}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <p className="way-in-legend">
            <span className="way-in-dot is-you" aria-hidden="true"></span>
            Tu faci {mine} din {STAGES.length} etape, câteva minute fiecare.{' '}
            <span className="way-in-dot" aria-hidden="true"></span>
            Restul se fac singure.
          </p>
        </div>
      </section>
    </div>
  );
}

// The icon over a state with no form: an email sent (blue), a thing done
// (green), an account that waits (orange).
export function StateIcon({ kind }: { kind: 'mail' | 'done' | 'wait' }) {
  return (
    <span className={`way-in-icon is-${kind}`} aria-hidden="true">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" focusable="false">
        {kind === 'mail' ? (
          <>
            <rect x="2.75" y="4.5" width="14.5" height="11" rx="1.5" />
            <path d="m3.5 5.5 6.5 5.25 6.5-5.25" />
          </>
        ) : kind === 'done' ? (
          <path d="m4.5 10.5 3.5 3.5 7.5-8" strokeWidth={2} />
        ) : (
          <>
            <circle cx="10" cy="10" r="7" />
            <path d="M10 6v4l2.5 2" />
          </>
        )}
      </svg>
    </span>
  );
}

// One state of the left half: its icon, its heading and the line under it.
export function State({
  heading,
  icon,
  title,
  lead,
  children,
}: {
  heading?: RefObject<HTMLHeadingElement | null>;
  icon?: 'mail' | 'done' | 'wait';
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <>
      {icon && <StateIcon kind={icon} />}
      <h1 ref={heading} tabIndex={-1}>
        {title}
      </h1>
      {lead && <p className="way-in-lead">{lead}</p>}
      {children}
    </>
  );
}

// The pages a link from an email opens go back to the login with this.
export function BackHome() {
  return (
    <p className="way-in-alt">
      <Link to="/">Înapoi la pagina de intrare</Link>
    </p>
  );
}
```

- [ ] **Step 15: Replace `src/admin/pages/LoginPage.tsx`**

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import { DEMO_PAPER_LIMIT, MAX_PASSWORD_LENGTH, MAX_TEACHER_NAME_LENGTH, MIN_PASSWORD_LENGTH } from '../../../shared/accounts.ts';
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ApiError } from '../api.ts';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { State, WayIn } from '../wayIn/WayIn.tsx';

// What the left half shows: a form, or what happened after one. "pending" is
// an account that confirmed its email and waits for an administrator: its
// login is refused, so it has no session.
type Mode =
  | { name: 'login' }
  | { name: 'signup' }
  | { name: 'forgot' }
  | { name: 'signup-sent' }
  | { name: 'forgot-sent' }
  | { name: 'pending'; email: string };

// The link "Cere un cont de profesor" of the landing page opens /admin/#cont-nou.
export const SIGNUP_HASH = '#cont-nou';

// Shown instead of every page while nobody is logged in (redesign spec §11.4):
// "Intră în cont", "Cont nou de profesor", "Am uitat parola", and the state
// after each. A new state moves the focus to its heading.
export function LoginPage() {
  const { hash } = useLocation();
  const [mode, setMode] = useState<Mode>(hash === SIGNUP_HASH ? { name: 'signup' } : { name: 'login' });
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [mode]);

  return (
    <WayIn>
      {mode.name === 'login' ? (
        <State heading={heading} title="Intră în cont" lead="Bine ai revenit.">
          <LoginForm onForgot={() => setMode({ name: 'forgot' })} onPending={(email) => setMode({ name: 'pending', email })} />
          <p className="way-in-alt">
            Nu ai cont?{' '}
            <button type="button" className="link-button" onClick={() => setMode({ name: 'signup' })}>
              Cere un cont de profesor
            </button>
          </p>
        </State>
      ) : mode.name === 'signup' ? (
        <State heading={heading} title="Cont nou de profesor" lead="Primești un cont demo, ca să încerci MQGrader cu o clasă a ta.">
          <SignupForm onSent={() => setMode({ name: 'signup-sent' })} />
          <p className="way-in-alt">
            Ai deja cont?{' '}
            <button type="button" className="link-button" onClick={() => setMode({ name: 'login' })}>
              Intră în cont
            </button>
          </p>
        </State>
      ) : mode.name === 'forgot' ? (
        <State heading={heading} title="Am uitat parola" lead="Scrie adresa de email a contului. Îți trimitem un link ca să alegi o parolă nouă.">
          <ForgotForm onSent={() => setMode({ name: 'forgot-sent' })} />
          <BackToLogin onClick={() => setMode({ name: 'login' })} />
        </State>
      ) : mode.name === 'signup-sent' ? (
        <State heading={heading} icon="mail" title="Verifică-ți emailul">
          <div role="status">
            <p>Ți-am trimis un email cu un link. Deschide-l în 24 de ore ca să confirmi adresa; apoi un administrator aprobă contul.</p>
            <p className="way-in-muted">
              După aprobare, intră cu emailul și parola alese. Nu găsești emailul? Uită-te și în Spam. Dacă ai deja un cont cu acest email,
              intră în el cu parola ta.
            </p>
          </div>
          <BackToLogin onClick={() => setMode({ name: 'login' })} />
        </State>
      ) : mode.name === 'forgot-sent' ? (
        <State heading={heading} icon="mail" title="Verifică-ți emailul">
          <div role="status">
            <p>Dacă adresa are un cont, ți-am trimis un email cu un link pentru o parolă nouă. Linkul merge o oră.</p>
            <p className="way-in-muted">Nu găsești emailul? Uită-te și în Spam, sau cere altul peste câteva minute.</p>
          </div>
          <BackToLogin onClick={() => setMode({ name: 'login' })} />
        </State>
      ) : (
        <State heading={heading} icon="wait" title="Contul tău așteaptă aprobarea">
          <div role="status">
            <p>
              Adresa <b>{mode.email}</b> este confirmată. Un administrator aprobă contul; vei primi un email după aprobare.
            </p>
          </div>
          <button type="button" className="button-quiet way-in-wide" onClick={() => setMode({ name: 'login' })}>
            Ieși
          </button>
        </State>
      )}
    </WayIn>
  );
}

function BackToLogin({ onClick }: { onClick: () => void }) {
  return (
    <p className="way-in-alt">
      <button type="button" className="link-button" onClick={onClick}>
        Înapoi la pagina de intrare
      </button>
    </p>
  );
}

function LoginForm({ onForgot, onPending }: { onForgot: () => void; onPending: (email: string) => void }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => api.login(email, password),
    // Every page reads its data again, now with the login.
    onSuccess: async (teacher) => {
      queryClient.setQueryData(['me'], teacher);
      await queryClient.invalidateQueries();
    },
    // An account that waits for approval has its own state; any other refusal
    // (a wrong password, an email not yet confirmed) shows under the form.
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'account_pending') onPending(email.trim());
    },
  });
  const pending = login.error instanceof ApiError && login.error.code === 'account_pending';

  return (
    <form
      className="form-fields"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        login.mutate();
      }}
    >
      <div className="form-field">
        <label htmlFor="login-email">Adresa de email</label>
        <input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </div>
      <div className="form-field">
        <div className="way-in-label-row">
          <label htmlFor="login-password">Parola</label>
          <button type="button" className="link-button" onClick={onForgot}>
            Am uitat parola
          </button>
        </div>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          maxLength={MAX_PASSWORD_LENGTH}
          required
        />
      </div>
      <button className="button way-in-wide" type="submit" disabled={login.isPending}>
        {login.isPending ? 'Se verifică…' : 'Intră'}
      </button>
      {login.error && !pending && <ErrorMessage error={login.error} />}
    </form>
  );
}

function ForgotForm({ onSent }: { onSent: () => void }) {
  const api = useApi();
  const [email, setEmail] = useState('');
  const forgot = useMutation({ mutationFn: () => api.forgotPassword(email), onSuccess: onSent });

  return (
    <form
      className="form-fields"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        forgot.mutate();
      }}
    >
      <div className="form-field">
        <label htmlFor="forgot-email">Adresa de email</label>
        <input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </div>
      <button className="button way-in-wide" type="submit" disabled={forgot.isPending}>
        {forgot.isPending ? 'Se trimite…' : 'Trimite linkul'}
      </button>
      {forgot.error && <ErrorMessage error={forgot.error} />}
    </form>
  );
}

function SignupForm({ onSent }: { onSent: () => void }) {
  const api = useApi();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signup = useMutation({ mutationFn: () => api.signup({ name, email, password }), onSuccess: onSent });

  return (
    <>
      <form
        className="form-fields"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          signup.mutate();
        }}
      >
        <div className="form-field">
          <label htmlFor="signup-name">Numele tău</label>
          <input
            id="signup-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={MAX_TEACHER_NAME_LENGTH}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="signup-email">Adresa de email</label>
          <input id="signup-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div className="form-field">
          <label htmlFor="signup-password">
            Parola <span className="form-hint">(cel puțin {MIN_PASSWORD_LENGTH} caractere)</span>
          </label>
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            required
          />
        </div>
        <button className="button way-in-wide" type="submit" disabled={signup.isPending}>
          {signup.isPending ? 'Se trimite…' : 'Cere contul'}
        </button>
        {signup.error && <ErrorMessage error={signup.error} />}
      </form>
      <p className="way-in-note">
        <b>Contul demo:</b> poți corecta un test, cu cel mult {countLabel(DEMO_PAPER_LIMIT, 'lucrare', 'lucrări')}. Întâi confirmi adresa de email,
        apoi un administrator aprobă contul.
      </p>
    </>
  );
}
```

- [ ] **Step 16: Replace `src/admin/pages/ConfirmEmailPage.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import { MAX_PASSWORD_LENGTH } from '../../../shared/accounts.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { BackHome, State, WayIn } from '../wayIn/WayIn.tsx';

// /confirma-email#<token>: the link from the email of a new account. Shown
// without a login. It confirms only with the password chosen at the sign-up:
// mail programs open links to check them, and someone who asked for an
// account with another person's email cannot get that person to confirm it.
export function ConfirmEmailPage() {
  const api = useApi();
  const token = useLocation().hash.replace(/^#/, '');
  const [password, setPassword] = useState('');
  const confirm = useMutation({ mutationFn: () => api.confirmEmail(token, password) });

  return (
    <WayIn>
      {confirm.isSuccess ? (
        <State icon="done" title="Adresa ta este confirmată">
          <div role="status">
            <p>Acum un administrator trebuie să aprobe contul. Vei primi un email după aprobare.</p>
          </div>
          <BackHome />
        </State>
      ) : (
        <State title="Confirmă adresa de email">
          {token === '' ? (
            <p>Linkul nu este întreg. Deschide-l din nou din email.</p>
          ) : (
            <form
              className="form-fields"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                confirm.mutate();
              }}
            >
              <p>Ai cerut un cont în MQGrader. Scrie parola aleasă atunci, ca să confirmi că adresa de email este a ta.</p>
              <div className="form-field">
                <label htmlFor="confirm-password">Parola</label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  maxLength={MAX_PASSWORD_LENGTH}
                  required
                />
              </div>
              <button type="submit" className="button way-in-wide" disabled={confirm.isPending}>
                {confirm.isPending ? 'Se confirmă…' : 'Confirmă adresa'}
              </button>
              {confirm.error && <ErrorMessage error={confirm.error} />}
            </form>
          )}
          <BackHome />
        </State>
      )}
    </WayIn>
  );
}

```

- [ ] **Step 17: Replace `src/admin/pages/NewPasswordPage.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../../../shared/accounts.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { BackHome, State, WayIn } from '../wayIn/WayIn.tsx';

// /parola-noua#<token>: the link from the "Am uitat parola" email. Shown
// without a login. The token is after "#", so it never reaches a server log.
export function NewPasswordPage() {
  const api = useApi();
  const navigate = useNavigate();
  const location = useLocation();
  const token = location.hash.replace(/^#/, '');
  const [password, setPassword] = useState('');
  const reset = useMutation({
    mutationFn: () => api.setNewPassword(token, password),
    // The used link leaves the address bar and the history.
    onSuccess: () => navigate(location.pathname, { replace: true }),
  });

  return (
    <WayIn>
      {reset.isSuccess ? (
        <State icon="done" title="Parolă nouă">
          <div role="status">
            <p>Gata: parola a fost schimbată. Poți intra în cont cu ea.</p>
          </div>
          <BackHome />
        </State>
      ) : (
        <State title="Parolă nouă">
          {token === '' ? (
            <p>Linkul nu este întreg. Deschide-l din nou din email.</p>
          ) : (
            <form
              className="form-fields"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                reset.mutate();
              }}
            >
              <div className="form-field">
                <label htmlFor="new-password">
                  Parola nouă <span className="form-hint">(cel puțin {MIN_PASSWORD_LENGTH} caractere)</span>
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={MIN_PASSWORD_LENGTH}
                  maxLength={MAX_PASSWORD_LENGTH}
                  required
                />
              </div>
              <button type="submit" className="button way-in-wide" disabled={reset.isPending}>
                {reset.isPending ? 'Se salvează…' : 'Salvează parola'}
              </button>
              {reset.error && <ErrorMessage error={reset.error} />}
            </form>
          )}
          <BackHome />
        </State>
      )}
    </WayIn>
  );
}
```

- [ ] **Step 18: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
  const openPage = location.pathname === '/confirma-email' || location.pathname === '/parola-noua';

```

Replace it with:

```tsx
  const openPage = location.pathname === '/confirma-email' || location.pathname === '/parola-noua';
  // These fill the screen under the top bar with the two halves of the way in.
  const wayIn = !me.data && (openPage || loggedOut);

```

- [ ] **Step 19: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
        <div className="topbar-tools">
          <YearSelect id="school-year" labelClassName="sr-only" />
          <ThemeButton />
```

Replace it with:

```tsx
        <div className="topbar-tools">
          {/* Logged out, the top bar has only the lockup and the theme. */}
          {me.data && <YearSelect id="school-year" labelClassName="sr-only" />}
          <ThemeButton />
```

- [ ] **Step 20: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
      {/* On a phone a panel covers the page: the page under it is out of reach. */}
      <main className="page" inert={phone && (open === 'clase' || open === 'todo')}>
        {me.data?.demo && <p className="warning">{demoText(me.data)}</p>}
```

Replace it with:

```tsx
      {/* On a phone a panel covers the page: the page under it is out of reach. */}
      <main className={wayIn ? 'page page-way-in' : 'page'} inert={phone && (open === 'clase' || open === 'todo')}>
        {me.data?.demo && <p className="warning">{demoText(me.data)}</p>}
```

- [ ] **Step 21: Edit `src/ui/brand.css`**

Find this block:

```css
  gap: 0.5rem;
  margin-block: 0.75rem;
}

```

Replace it with:

```css
  gap: 0.5rem;
  margin-block: 0.75rem;
}

/* A form of fields one under the other, each label over its input, the
   inputs as wide as the form (the way in, Contul meu). */
.form-fields {
  display: grid;
  gap: 1rem;
}

.form-fields > p {
  margin: 0;
}

.form-field {
  display: grid;
  gap: 0.35rem;
}

.form-field label {
  font-size: 0.875rem;
}

.form-field input {
  width: 100%;
}

.form-hint {
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 400;
}

```

- [ ] **Step 22: Edit `src/ui/brand.css`**

Find this block:

```css

/* The login page: the form, and the switch between "Intră" and "Cont nou". */
.login-box {
  max-width: 26rem;
  margin: 2rem auto;
}

.login-switch {
  display: flex;
  gap: 0.5rem;
  margin-block: 1rem;
}

.login-switch [aria-pressed="true"] {
  border-color: var(--ink);
  font-weight: 700;
}
```

Replace it with:

```css

/* The way in (redesign spec §11.4): two halves of equal width on the white
   surface, as tall as the screen under the top bar, a line between them. The
   form on the left, 24rem wide with no card; what MQGrader does on the right.
   On a phone the form comes first. */
.shell-bare > .page-way-in {
  max-width: none;
  padding: 0;
}

.way-in {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  min-height: calc(100vh - var(--top));
  min-height: calc(100dvh - var(--top));
  background: var(--sheet);
}

.way-in-form {
  display: grid;
  grid-template-rows: 1fr auto;
  justify-items: center;
  padding: 3rem 2rem 1.5rem;
  border-right: 1px solid var(--rule);
}

.way-in-form .way-in-inner {
  align-self: center;
  width: min(24rem, 100%);
}

.way-in-form h1 {
  margin: 0 0 0.25rem;
  font-size: 1.5rem;
}

.way-in-form h1:focus {
  outline: none;
}

.way-in-lead {
  margin: 0 0 1.5rem;
  color: var(--muted);
}

.way-in-inner [role="status"] > p {
  margin: 0.5rem 0 0;
}

.way-in-muted {
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 400;
}

.way-in-label-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
}

.way-in-label-row .link-button {
  font-size: 0.8125rem;
}

.way-in-wide {
  width: 100%;
  min-height: 2.75rem;
}

/* "Ieși" of the account that waits, under its text. */
.way-in-inner > .way-in-wide {
  margin-top: 1.5rem;
}

.way-in-inner .alert {
  margin: 0;
}

.way-in-note {
  margin: 1rem 0 0;
  padding: 0.75rem 0.875rem;
  border-radius: var(--radius);
  background: var(--raised);
  color: var(--muted);
  font-size: 0.875rem;
}

.way-in-note b {
  color: var(--text);
}

.way-in-alt {
  margin: 1.5rem 0 0;
  padding-top: 1.25rem;
  border-top: 1px solid var(--rule);
  font-size: 0.875rem;
  text-align: center;
}

.way-in-foot {
  width: min(24rem, 100%);
  margin: 2rem 0 0;
  color: var(--muted);
  font-size: 0.8125rem;
  text-align: center;
}

/* The icon over a state with no form: mail blue, done green, waiting orange. */
.way-in-icon {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  margin-bottom: 1rem;
  border-radius: 999px;
}

.way-in-icon svg {
  width: 1.5rem;
  height: 1.5rem;
}

.way-in-icon.is-mail {
  background: var(--ink-tint);
  color: var(--ink);
}

.way-in-icon.is-done {
  background: var(--ok-bg);
  color: var(--ok-fg);
}

.way-in-icon.is-wait {
  background: var(--marker);
  color: var(--orange);
}

.way-in-pitch {
  display: grid;
  align-items: center;
  justify-items: center;
  padding: 3rem clamp(2rem, 5vw, 5rem);
}

.way-in-pitch .way-in-inner {
  width: min(38rem, 100%);
}

.way-in-pitch h2 {
  margin: 0;
  font-size: clamp(1.75rem, 3vw, 2.5rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.way-in-line {
  margin: 0.75rem 0 1.5rem;
  color: var(--muted);
  font-size: 1.0625rem;
}

/* The six stages of the landing page, small, in a box on the raised tone:
   orange for the teacher's, blue for the others. */
.way-in-flow {
  padding: 1.125rem 1.25rem 1.25rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-panel);
  background: var(--raised);
}

.way-in-flow-title {
  margin: 0 0 0.875rem;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.way-in-flow ol {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.way-in-flow li {
  position: relative;
  display: grid;
  grid-template-columns: 1.75rem minmax(0, 1fr);
  column-gap: 0.75rem;
  padding-bottom: 0.75rem;
}

.way-in-flow li:last-child {
  padding-bottom: 0;
}

.way-in-flow li:not(:last-child)::after {
  content: "";
  position: absolute;
  top: 1.75rem;
  bottom: 0;
  left: calc(0.875rem - 1px);
  width: 2px;
  border-radius: 2px;
  background: var(--active);
}

.way-in-node {
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  background: var(--ink-tint);
  color: var(--ink);
}

.way-in-node svg {
  width: 0.9375rem;
  height: 0.9375rem;
}

.way-in-flow h3 {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding-top: 0.2rem;
  font-size: 0.875rem;
}

.way-in-who {
  padding: 0 0.45rem;
  border-radius: 999px;
  background: var(--ink-tint);
  color: var(--ink);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1.5;
}

.way-in-flow li.is-you .way-in-node,
.way-in-flow li.is-you .way-in-who {
  background: var(--marker);
  color: var(--orange);
}

.way-in-flow p {
  margin: 0.1rem 0 0;
  color: var(--muted);
  font-size: 0.8125rem;
  line-height: 1.45;
}

.way-in-flow p b {
  color: var(--text);
  font-weight: 600;
}

.way-in-legend {
  margin: 0.875rem 0 0;
  color: var(--muted);
  font-size: 0.8125rem;
}

.way-in-dot {
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  margin-right: 0.375rem;
  border-radius: 50%;
  background: var(--ink);
}

.way-in-dot.is-you {
  background: var(--orange-mark);
}

.way-in-legend .way-in-dot:not(:first-child) {
  margin-left: 0.75rem;
}

@media (max-width: 56.25rem) {
  .way-in {
    grid-template-columns: minmax(0, 1fr);
  }

  .way-in-form {
    padding: 2rem max(1rem, env(safe-area-inset-right, 0px)) 1.5rem max(1rem, env(safe-area-inset-left, 0px));
    border-right: 0;
    border-bottom: 1px solid var(--rule);
  }

  .way-in-pitch {
    padding: 2rem max(1rem, env(safe-area-inset-right, 0px)) calc(2rem + env(safe-area-inset-bottom, 0px)) max(1rem, env(safe-area-inset-left, 0px));
  }
}
```

- [ ] **Step 23: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  122 passed | 1 skipped (123)`, `Tests  1966 passed | 3 skipped (1969)`.

- [ ] **Step 24: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 25: Commit**

```bash
git add src/admin/wayIn/WayIn.tsx src/admin/wayIn/WayIn.test.tsx src/admin/pages/LoginPage.tsx src/admin/pages/LoginPage.test.tsx src/admin/pages/ConfirmEmailPage.tsx src/admin/pages/ConfirmEmailPage.test.tsx src/admin/pages/NewPasswordPage.tsx src/admin/pages/NewPasswordPage.test.tsx src/admin/Layout.tsx src/ui/brand.css
git commit -m "Show the way in as two halves: the form, and what MQGrader does"
```

### Task 2: Contul meu

One column of three cards: "Contul tău" (the tag, the counts or a demo account's meters), "Parola", and "Ieși din cont".

**Files:**
- Create: `src/admin/account/DemoMeters.tsx`
- Replace: `src/admin/pages/AccountPage.tsx`
- Modify: `src/ui/brand.css`
- Test: `src/admin/account/DemoMeters.test.tsx` (new), `src/admin/pages/AccountPage.test.tsx`, `src/admin/Layout.test.tsx`

**Interfaces:**
- Consumes: `form-fields`, `form-field`, `form-hint` (Task 1).
- Produces: `type DemoUsage = { testUsed: boolean; papersUsed: number; papersLeft: number }`, `demoUsage(teacher)`, `demoLine(usage)`, `DemoMeters({ usage })` from `account/DemoMeters.tsx`; `accountTag(teacher)` from `pages/AccountPage.tsx`. `accountKindText` goes.

- [ ] **Step 1: Create `src/admin/account/DemoMeters.test.tsx`**

```tsx
import { describe, expect, it } from 'vitest';
import { fakeTeacher } from '../../test/fakeApi.ts';
import { demoLine, demoUsage } from './DemoMeters.tsx';

const demo = (testsEvaluated: number, papersGraded: number, papersWaiting = 0) =>
  demoUsage(fakeTeacher({ role: 'teacher', demo: true, testsEvaluated, papersGraded, papersWaiting }));

describe('demoUsage', () => {
  it('counts the one test once, whatever the regrades', () => {
    expect(demo(0, 0).testUsed).toBe(false);
    expect(demo(1, 3).testUsed).toBe(true);
    expect(demo(4, 30).testUsed).toBe(true);
  });

  it('counts the papers on their way to the robot as used, never over the limit', () => {
    expect(demo(1, 18, 2)).toEqual({ testUsed: true, papersUsed: 20, papersLeft: 15 });
    expect(demo(1, 34, 4)).toEqual({ testUsed: true, papersUsed: 35, papersLeft: 0 });
  });
});

describe('demoLine', () => {
  it.each([
    [demo(1, 34), 'Mai ai 1 lucrare, pentru testul tău. Fiecare lucrare corectată se numără, și o recorectare.'],
    [demo(1, 20), 'Mai ai 15 lucrări, pentru testul tău. Fiecare lucrare corectată se numără, și o recorectare.'],
    [demo(0, 0), 'Mai ai 35 de lucrări, pentru testul tău. Fiecare lucrare corectată se numără, și o recorectare.'],
    [demo(1, 35), 'Ai folosit toate cele 35 de lucrări ale contului demo. Cere unui administrator un cont complet.'],
  ])('says what is left: %j', (usage, line) => {
    expect(demoLine(usage)).toBe(line);
  });
});
```

- [ ] **Step 2: Edit `src/admin/pages/AccountPage.test.tsx`**

Find this block:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

Replace it with:

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

- [ ] **Step 3: Edit `src/admin/pages/AccountPage.test.tsx`**

Find this block:

```tsx
import { ApiError } from '../api.ts';
import { accountKindText } from './AccountPage.tsx';

```

Replace it with:

```tsx
import { ApiError } from '../api.ts';

```

- [ ] **Step 4: Edit `src/admin/pages/AccountPage.test.tsx`**

Find this block:

```tsx
describe('AccountPage', () => {
  it('shows who is logged in and the kind of account', async () => {
    renderAdmin('/cont', createFakeApi());
    expect(await screen.findByText('Laura Miron (profesor@example.com)')).toBeInTheDocument();
    expect(screen.getByText('Ești administrator. Până acum: 0 teste și 0 lucrări.')).toBeInTheDocument();
  });
```

Replace it with:

```tsx
describe('AccountPage', () => {
  it('shows an administrator who is logged in, the counts and where Setări is', async () => {
    renderAdmin('/cont', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ testsEvaluated: 21, papersGraded: 596 }) }));
    const card = await screen.findByRole('region', { name: 'Contul tău' });
    expect(within(card).getByText('Administrator')).toHaveClass('tag-ok');
    expect(within(card).getByText('Laura Miron')).toBeInTheDocument();
    expect(within(card).getByText('profesor@example.com')).toBeInTheDocument();
    expect(within(card).getByText('LM')).toBeInTheDocument();
    expect(within(card).getByText('Teste corectate').nextElementSibling).toHaveTextContent('21');
    expect(within(card).getByText('Lucrări corectate').nextElementSibling).toHaveTextContent('596');
    expect(within(card).getByRole('link', { name: 'Setări' })).toHaveAttribute('href', '/setari');
    // No pay button: nothing is on sale.
    expect(screen.queryByRole('button', { name: /plătește|cumpără/i })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Parola' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ieșire' })).toHaveTextContent('Ieși din cont pe acest dispozitiv.');
  });

  it('shows a complete account with its counts and no link to Setări', async () => {
    renderAdmin('/cont', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', testsEvaluated: 1, papersGraded: 28 }) }));
    const card = await screen.findByRole('region', { name: 'Contul tău' });
    expect(within(card).getByText('Cont complet')).toBeInTheDocument();
    expect(within(card).getByText('Lucrări corectate').nextElementSibling).toHaveTextContent('28');
    expect(within(card).queryByRole('link', { name: 'Setări' })).not.toBeInTheDocument();
  });

  it('shows a demo account its one test and its papers, and what is left', async () => {
    renderAdmin('/cont', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 1, papersGraded: 18, papersWaiting: 2 }) }));
    const card = await screen.findByRole('region', { name: 'Contul tău' });
    expect(within(card).getByText('Cont demo')).not.toHaveClass('tag-ok');
    expect(within(card).getByText('Teste corectate').nextElementSibling).toHaveTextContent('1 din 1');
    expect(within(card).getByText('Lucrări corectate').nextElementSibling).toHaveTextContent('20 din 35');
    expect(card).toHaveTextContent('Mai ai 15 lucrări, pentru testul tău. Fiecare lucrare corectată se numără, și o recorectare.');
    expect(card.querySelector('.demo-meter.is-full')).toBeNull();
  });

  it('turns the papers meter orange and asks for a complete account when none are left', async () => {
    renderAdmin('/cont', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 3, papersGraded: 34, papersWaiting: 4 }) }));
    const card = await screen.findByRole('region', { name: 'Contul tău' });
    // A regrade counts the test again, but the account has one test.
    expect(within(card).getByText('Teste corectate').nextElementSibling).toHaveTextContent('1 din 1');
    expect(within(card).getByText('Lucrări corectate').nextElementSibling).toHaveTextContent('35 din 35');
    expect(within(card).getByText('Lucrări corectate').closest('.demo-meter')).toHaveClass('is-full');
    expect(card).toHaveTextContent('Ai folosit toate cele 35 de lucrări ale contului demo. Cere unui administrator un cont complet.');
  });
```

- [ ] **Step 5: Edit `src/admin/pages/AccountPage.test.tsx`**

Find this block:

```tsx
});

describe('accountKindText', () => {
  it.each([
    [fakeTeacher({ testsEvaluated: 21, papersGraded: 300 }), 'Ești administrator. Până acum: 21 de teste și 300 de lucrări.'],
    [fakeTeacher({ role: 'teacher', testsEvaluated: 1, papersGraded: 1 }), 'Ai un cont complet. Până acum: 1 test și 1 lucrare.'],
    [fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 1, papersGraded: 1 }), 'Ai un cont demo: ai folosit 1 din 35 lucrări.'],
    [fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 9, papersGraded: 9 }), 'Ai un cont demo: ai folosit 9 din 35 lucrări.'],
    [fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 1, papersGraded: 1, papersWaiting: 2 }), 'Ai un cont demo: ai folosit 3 din 35 lucrări.'],
  ])('describes %j', (teacher, text) => {
    expect(accountKindText(teacher)).toBe(text);
  });
});
```

Replace it with:

```tsx
});
```

- [ ] **Step 6: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
    await expectLocation('/cont');
    expect(screen.queryByText('profesor@example.com')).not.toBeInTheDocument();
  });
```

Replace it with:

```tsx
    await expectLocation('/cont');
    // The new page closes the menu (Contul meu shows the email on its own).
    expect(screen.getByRole('button', { name: 'LM, contul tău: Laura Miron' })).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('user-menu')).toBeNull();
  });
```

- [ ] **Step 7: Run the tests to see them fail**

Run: `npx vitest run src/admin/account/DemoMeters.test.tsx src/admin/pages/AccountPage.test.tsx src/admin/Layout.test.tsx`
Expected: FAIL. `Test Files  2 failed | 1 passed (3)`, `Tests  4 failed | 41 passed (45)`: `DemoMeters.test.tsx` cannot load (`Failed to resolve import "./DemoMeters.tsx"`), and the four page tests find no card (`Unable to find role="region" and name "Contul tău"`). `Layout.test.tsx` passes: its changed test ("opens the account menu from the initials, with Contul meu") is a guard that stays true once Contul meu shows the email.

- [ ] **Step 8: Create `src/admin/account/DemoMeters.tsx`**

```tsx
import { demoPapersLeft, DEMO_PAPER_LIMIT } from '../../../shared/accounts.ts';
import type { Teacher } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';

// What a demo account has used: its one test, and its papers. A paper on its
// way to the robot counts as used. `testsEvaluated` counts every start, regrade
// and retry, so the one test is used once it is 1 or more.
export type DemoUsage = { testUsed: boolean; papersUsed: number; papersLeft: number };

export function demoUsage(teacher: Teacher): DemoUsage {
  const sent = teacher.papersGraded + teacher.papersWaiting;
  return { testUsed: teacher.testsEvaluated > 0, papersUsed: Math.min(sent, DEMO_PAPER_LIMIT), papersLeft: demoPapersLeft(sent) };
}

// The line under the meters (redesign spec §11.5).
export function demoLine(usage: DemoUsage): string {
  if (usage.papersLeft === 0) {
    return `Ai folosit toate cele ${countLabel(DEMO_PAPER_LIMIT, 'lucrare', 'lucrări')} ale contului demo. Cere unui administrator un cont complet.`;
  }
  return `Mai ai ${countLabel(usage.papersLeft, 'lucrare', 'lucrări')}, pentru testul tău. Fiecare lucrare corectată se numără, și o recorectare.`;
}

// "Teste corectate 1 din 1" and "Lucrări corectate 20 din 35", each with its
// bar; the papers' bar is orange when none are left. Contul meu and the demo
// button of the top bar show them.
export function DemoMeters({ usage }: { usage: DemoUsage }) {
  return (
    <div className="demo-meters">
      <Meter label="Teste corectate" used={usage.testUsed ? 1 : 0} of={1} />
      <Meter label="Lucrări corectate" used={usage.papersUsed} of={DEMO_PAPER_LIMIT} full={usage.papersLeft === 0} />
    </div>
  );
}

function Meter({ label, used, of, full = false }: { label: string; used: number; of: number; full?: boolean }) {
  return (
    <div className={full ? 'demo-meter is-full' : 'demo-meter'}>
      <div className="demo-meter-line">
        <span>{label}</span>
        <b>
          {used} din {of}
        </b>
      </div>
      <div className="demo-meter-bar" aria-hidden="true">
        <span style={{ width: `${(used / of) * 100}%` }}></span>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Replace `src/admin/pages/AccountPage.tsx`**

```tsx
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { Teacher } from '../../../shared/api.ts';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../../../shared/accounts.ts';
import { DemoMeters, demoLine, demoUsage } from '../account/DemoMeters.tsx';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { initials } from '../shell/initials.ts';
import { useLogout } from '../shell/useLogout.ts';

// The tag of the account: its kind, or the administrator.
export function accountTag(teacher: Teacher): string {
  if (teacher.role === 'admin') return 'Administrator';
  return teacher.demo ? 'Cont demo' : 'Cont complet';
}

// /cont (redesign spec §11.5): one column of three cards: who is logged in and
// what the account has used, the password, and "Ieși din cont". No pay button:
// nothing is on sale.
export function AccountPage() {
  const api = useApi();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
  const logout = useLogout();

  return (
    <section className="account-page">
      <h1>Contul meu</h1>
      {me.data && <AccountCard teacher={me.data} />}
      <PasswordCard />
      <section className="class-card account-out" aria-label="Ieșire">
        <span>Ieși din cont pe acest dispozitiv.</span>
        <button type="button" className="button-quiet" disabled={logout.isPending} onClick={() => logout.mutate()}>
          Ieși din cont
        </button>
        {logout.error && <ErrorMessage error={logout.error} />}
      </section>
    </section>
  );
}

function AccountCard({ teacher }: { teacher: Teacher }) {
  const demo = teacher.demo;
  const usage = demoUsage(teacher);
  return (
    <section className="class-card" aria-labelledby="account-card">
      <div className="class-card-head">
        <h2 id="account-card">Contul tău</h2>
        <span className={demo ? 'tag' : 'tag tag-ok'}>{accountTag(teacher)}</span>
      </div>
      <div className="account-body">
        <div className="account-who">
          <span className="account-avatar" aria-hidden="true">
            {initials(teacher.name)}
          </span>
          <div>
            <b>{teacher.name}</b>
            <span>{teacher.email}</span>
          </div>
        </div>
        {demo ? (
          <>
            <DemoMeters usage={usage} />
            <p className={usage.papersLeft === 0 ? 'account-line' : 'account-line is-muted'}>{demoLine(usage)}</p>
          </>
        ) : (
          <>
            <dl className="account-counts">
              <dt>Teste corectate</dt>
              <dd>{teacher.testsEvaluated}</dd>
              <dt>Lucrări corectate</dt>
              <dd>{teacher.papersGraded}</dd>
            </dl>
            {teacher.role === 'admin' && (
              <p className="account-line is-muted">
                Conturile și robotul sunt în <Link to="/setari">Setări</Link>.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function PasswordCard() {
  const api = useApi();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: () => {
      setCurrent('');
      setNext('');
    },
  });

  return (
    <section className="class-card" aria-labelledby="password-card">
      <div className="class-card-head">
        <h2 id="password-card">Parola</h2>
      </div>
      <form
        className="account-body form-fields"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          change.mutate();
        }}
      >
        <div className="form-field">
          <label htmlFor="current-password">Parola de acum</label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            maxLength={MAX_PASSWORD_LENGTH}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="new-password">
            Parola nouă <span className="form-hint">(cel puțin {MIN_PASSWORD_LENGTH} caractere)</span>
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            required
          />
        </div>
        <span>
          <button className="button-quiet" type="submit" disabled={change.isPending}>
            Schimbă parola
          </button>
        </span>
        {change.isSuccess && <p role="status">Parola a fost schimbată. Pe alte dispozitive intri din nou cu parola nouă.</p>}
        {change.error && <ErrorMessage error={change.error} />}
      </form>
    </section>
  );
}
```

- [ ] **Step 10: Edit `src/ui/brand.css`**

Find this block:

```css

/* A button that reads as a link inside a sentence ("Am uitat parola"). */
```

Replace it with:

```css

/* Contul meu (redesign spec §11.5): one column of white cards. */
.account-page {
  display: grid;
  gap: 1rem;
  max-width: 40rem;
}

.account-page h1 {
  margin-bottom: 0.25rem;
}

.account-body {
  padding: 0.25rem 1.25rem 1.25rem;
}

.account-who {
  display: grid;
  grid-template-columns: 3.5rem minmax(0, 1fr);
  gap: 1rem;
  align-items: center;
  margin-bottom: 1.25rem;
}

.account-who b {
  display: block;
  font-size: 1.125rem;
}

.account-who span {
  color: var(--muted);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

.account-avatar {
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  background: var(--ink-tint);
  color: var(--ink);
  font-size: 1.125rem;
  font-weight: 700;
}

.account-counts {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 0.5rem 1.5rem;
  margin: 0;
  font-size: 0.875rem;
}

.account-counts dt {
  color: var(--muted);
}

.account-counts dd {
  margin: 0;
  font-weight: 600;
}

.account-line {
  margin: 0.875rem 0 0;
  font-size: 0.875rem;
}

.account-line.is-muted {
  color: var(--muted);
}

.account-out {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  padding: 1rem 1.25rem;
}

.account-out .alert {
  flex-basis: 100%;
  margin: 0;
}

/* The two meters of a demo account: its one test and its papers; the papers'
   bar is orange when none are left. */
.demo-meters {
  display: grid;
  gap: 0.875rem;
}

.demo-meter {
  display: grid;
  gap: 0.35rem;
}

.demo-meter-line {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.875rem;
}

.demo-meter-bar {
  height: 0.5rem;
  overflow: hidden;
  border-radius: 999px;
  background: var(--active);
}

.demo-meter-bar > span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--ink);
}

.demo-meter.is-full .demo-meter-bar > span {
  background: var(--orange-mark);
}

/* A button that reads as a link inside a sentence ("Am uitat parola"). */
```

- [ ] **Step 11: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  123 passed | 1 skipped (124)`, `Tests  1970 passed | 3 skipped (1973)`.

- [ ] **Step 12: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 13: Commit**

```bash
git add src/admin/account/DemoMeters.tsx src/admin/account/DemoMeters.test.tsx src/admin/pages/AccountPage.tsx src/admin/pages/AccountPage.test.tsx src/admin/Layout.test.tsx src/ui/brand.css
git commit -m "Show Contul meu as three cards, with a demo account's meters"
```

### Task 3: The demo button

A demo account's papers move from the paragraph under the top bar to a button in it, before the school year, and into ☰ on a phone.

**Files:**
- Create: `src/admin/shell/useSmallMenu.ts`, `src/admin/shell/DemoButton.tsx`
- Replace: `src/admin/shell/UserMenu.tsx`
- Modify: `src/admin/Layout.tsx`, `src/admin/shell/PhoneMenu.tsx`, `src/ui/brand.css`
- Test: `src/admin/pages/LoginPage.test.tsx`, `src/admin/Layout.test.tsx`

**Interfaces:**
- Consumes: `demoUsage`, `demoLine`, `DemoMeters` (Task 2).
- Produces: `useSmallMenu<Box>()` returning `{ open, toggle, box, button }`; `DemoButton({ teacher })`, `DemoSummary({ usage })`, `demoButtonText(usage)` from `shell/DemoButton.tsx`. `demoText` goes from `Layout.tsx`.

- [ ] **Step 1: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx

  it('tells a demo account how many papers it has left', async () => {
    const api = createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, papersGraded: 2 }) });
    renderAdmin('/clase', api);
    expect(await screen.findByText(/^Cont demo: mai ai 33 din 35 lucrări\./)).toBeInTheDocument();
  });
```

Replace it with:

```tsx

  it('tells a demo account how many papers it has left, in the top bar before the school year', async () => {
    const api = createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 1, papersGraded: 2 }) });
    renderAdmin('/clase', api);
    const button = await screen.findByRole('button', { name: 'Demo · 33 de lucrări rămase' });
    expect(button.compareDocumentPosition(screen.getByLabelText('Anul școlar')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button).not.toHaveClass('is-full');
    expect(screen.queryByRole('region', { name: 'Cont demo' })).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('region', { name: 'Cont demo' });
    expect(within(menu).getByText('Teste corectate').nextElementSibling).toHaveTextContent('1 din 1');
    expect(within(menu).getByText('Lucrări corectate').nextElementSibling).toHaveTextContent('2 din 35');
    expect(menu).toHaveTextContent('Mai ai 33 de lucrări, pentru testul tău.');
    // The paragraph under the top bar is gone.
    expect(document.querySelector('.page > .warning')).toBeNull();
    await userEvent.click(within(menu).getByRole('link', { name: 'Contul meu' }));
    expect(await screen.findByRole('heading', { name: 'Contul meu' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cont demo' })).not.toBeInTheDocument();
  });

  it('closes the demo menu on Esc, with the focus back on its button, and on a click outside it', async () => {
    renderAdmin('/clase', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, papersGraded: 2 }) }));
    const button = await screen.findByRole('button', { name: /^Demo · / });
    await userEvent.click(button);
    await userEvent.tab();
    expect(within(screen.getByRole('region', { name: 'Cont demo' })).getByRole('link', { name: 'Contul meu' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Cont demo' })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    await userEvent.click(button);
    await userEvent.click(document.body);
    expect(screen.queryByRole('region', { name: 'Cont demo' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx
  it('counts the papers on their way to the robot as used', async () => {
    const api = createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, papersGraded: 2, papersWaiting: 1 }) });
    renderAdmin('/clase', api);
    expect(await screen.findByText(/^Cont demo: mai ai 32 din 35 lucrări\./)).toBeInTheDocument();
  });

  it('reads the demo line again after a change, so it shows the papers left', async () => {
    const teacher = fakeTeacher({ role: 'teacher', demo: true, papersGraded: 2 });
```

Replace it with:

```tsx
  it('counts the papers on their way to the robot as used', async () => {
    const api = createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, papersGraded: 33, papersWaiting: 1 }) });
    renderAdmin('/clase', api);
    expect(await screen.findByRole('button', { name: 'Demo · 1 lucrare rămasă' })).toBeInTheDocument();
  });

  it('reads the demo button again after a change, so it shows the papers left', async () => {
    const teacher = fakeTeacher({ role: 'teacher', demo: true, papersGraded: 2 });
```

- [ ] **Step 3: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx
    renderAdmin('/cont', api);
    expect(await screen.findByText(/^Cont demo: mai ai 33 din 35 lucrări\./)).toBeInTheDocument();
    teacher.papersGraded = 3;
    await userEvent.type(screen.getByLabelText('Parola de acum'), 'parola-veche');
```

Replace it with:

```tsx
    renderAdmin('/cont', api);
    expect(await screen.findByRole('button', { name: 'Demo · 33 de lucrări rămase' })).toBeInTheDocument();
    teacher.papersGraded = 20;
    await userEvent.type(screen.getByLabelText('Parola de acum'), 'parola-veche');
```

- [ ] **Step 4: Edit `src/admin/pages/LoginPage.test.tsx`**

Find this block:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Schimbă parola' }));
    expect(await screen.findByText(/^Cont demo: mai ai 32 din 35 lucrări\./)).toBeInTheDocument();
  });

  it('tells a demo account when its papers are used up', async () => {
    const api = createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, papersGraded: 35 }) });
    renderAdmin('/clase', api);
    expect(await screen.findByText(/ai folosit toate cele 35 lucrări ale contului/)).toBeInTheDocument();
  });

  it('shows no demo line to a complete account', async () => {
    renderAdmin('/clase', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher' }) }));
    await screen.findByText('Nu ai nicio clasă în acest an școlar.');
    expect(screen.queryByText(/Cont demo/)).not.toBeInTheDocument();
```

Replace it with:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Schimbă parola' }));
    expect(await screen.findByRole('button', { name: 'Demo · 15 lucrări rămase' })).toBeInTheDocument();
  });

  it('turns the ring orange and asks for a complete account when the papers are used up', async () => {
    const api = createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 2, papersGraded: 35 }) });
    renderAdmin('/clase', api);
    const button = await screen.findByRole('button', { name: 'Demo · 0 lucrări rămase' });
    expect(button).toHaveClass('is-full');
    await userEvent.click(button);
    expect(screen.getByRole('region', { name: 'Cont demo' })).toHaveTextContent(
      'Ai folosit toate cele 35 de lucrări ale contului demo. Cere unui administrator un cont complet.',
    );
  });

  it('shows no demo button to a complete account', async () => {
    renderAdmin('/clase', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher' }) }));
    await screen.findByText('Nu ai nicio clasă în acest an școlar.');
    expect(screen.queryByRole('button', { name: /^Demo/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Cont demo/)).not.toBeInTheDocument();
```

- [ ] **Step 5: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
    localStorage.clear();
  });
```

Replace it with:

```tsx
    localStorage.clear();
  });

  it('shows a demo account its papers in ☰, and only to a demo account', async () => {
    renderAdmin('/clase', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 1, papersGraded: 20 }) }));
    await menu();
    await userEvent.click(screen.getByRole('button', { name: 'Mai mult' }));
    const more = screen.getByRole('region', { name: 'Mai mult' });
    expect(within(more).getByText('Cont demo')).toBeInTheDocument();
    expect(within(more).getByText('Lucrări corectate').nextElementSibling).toHaveTextContent('20 din 35');
    expect(more).toHaveTextContent('Mai ai 15 lucrări, pentru testul tău.');
    cleanup();

    renderAdmin('/', withClasses());
    await menu();
    await userEvent.click(screen.getByRole('button', { name: 'Mai mult' }));
    expect(within(screen.getByRole('region', { name: 'Mai mult' })).queryByText('Cont demo')).not.toBeInTheDocument();
  });
```

- [ ] **Step 6: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/LoginPage.test.tsx src/admin/Layout.test.tsx`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  6 failed | 49 passed (55)`: no demo button yet (`Unable to find role="button" and name "Demo · 33 de lucrări rămase"`, `… /^Demo · /`, `… "Demo · 1 lucrare rămasă"`, `… "Demo · 0 lucrări rămase"`), and no demo part in ☰ (`Unable to find an element with the text: Cont demo.`).

- [ ] **Step 7: Create `src/admin/shell/useSmallMenu.ts`**

```ts
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

// A small menu of the top bar (the initials, the demo button): open on its
// button, closed on Esc (the focus goes back to the button), on a click
// outside it, and when a page opens. It stays closed when Back or Forward
// returns to the page it was opened on.
export function useSmallMenu<Box extends HTMLElement = HTMLDivElement>() {
  const location = useLocation();
  const [openOn, setOpenOn] = useState<string | null>(null);
  if (openOn !== null && openOn !== location.key) setOpenOn(null);
  const open = openOn === location.key;
  const box = useRef<Box>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpenOn(null);
    };
    // The menu is above the panels: it takes Esc first (capture), and marks it
    // taken so an open panel stays open.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (box.current?.contains(document.activeElement)) button.current?.focus();
      setOpenOn(null);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return { open, toggle: () => setOpenOn(open ? null : location.key), box, button };
}
```

- [ ] **Step 8: Replace `src/admin/shell/UserMenu.tsx`**

```tsx
import { Link } from 'react-router';
import type { Teacher } from '../../../shared/api.ts';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { initials } from './initials.ts';
import { useLogout } from './useLogout.ts';
import { useSmallMenu } from './useSmallMenu.ts';

// The teacher's initials in the top bar open a small menu: who is logged in,
// "Contul meu" and "Ieși din cont".
export function UserMenu({ teacher }: { teacher: Teacher }) {
  const { open, toggle, box, button } = useSmallMenu();
  const logout = useLogout();

  return (
    <div className="user" ref={box}>
      <button
        ref={button}
        type="button"
        className="user-button"
        aria-label={`${initials(teacher.name)}, contul tău: ${teacher.name}`}
        aria-expanded={open}
        aria-controls={open ? 'user-menu' : undefined}
        onClick={toggle}
      >
        {initials(teacher.name)}
      </button>
      {open && (
        <div className="user-menu" id="user-menu">
          <p className="user-who">
            <b>{teacher.name}</b>
            <span>{teacher.email}</span>
          </p>
          <Link to="/cont">Contul meu</Link>
          <button type="button" disabled={logout.isPending} onClick={() => logout.mutate()}>
            Ieși din cont
          </button>
          {logout.error && <ErrorMessage error={logout.error} />}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Create `src/admin/shell/DemoButton.tsx`**

```tsx
import { Link } from 'react-router';
import { DEMO_PAPER_LIMIT } from '../../../shared/accounts.ts';
import type { Teacher } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import { DemoMeters, demoLine, demoUsage, type DemoUsage } from '../account/DemoMeters.tsx';
import { useSmallMenu } from './useSmallMenu.ts';

// "Demo · 15 lucrări rămase".
export function demoButtonText(usage: DemoUsage): string {
  return `Demo · ${countLabel(usage.papersLeft, 'lucrare rămasă', 'lucrări rămase')}`;
}

// The demo account's button in the top bar (redesign spec §11.6): a small
// ring of the papers used and what is left. It opens "Cont demo": the two
// meters of Contul meu, one line, and "Contul meu". With no paper left the
// ring is orange and the line asks for a complete account.
export function DemoButton({ teacher }: { teacher: Teacher }) {
  const { open, toggle, box, button } = useSmallMenu();
  const usage = demoUsage(teacher);
  const full = usage.papersLeft === 0;

  return (
    <div className="demo" ref={box}>
      <button
        ref={button}
        type="button"
        className={full ? 'demo-button is-full' : 'demo-button'}
        aria-expanded={open}
        aria-controls={open ? 'demo-menu' : undefined}
        onClick={toggle}
      >
        <DemoRing used={usage.papersUsed} />
        {demoButtonText(usage)}
      </button>
      {open && (
        <section className="demo-menu" id="demo-menu" aria-label="Cont demo">
          <DemoSummary usage={usage} />
          <Link to="/cont">Contul meu</Link>
        </section>
      )}
    </div>
  );
}

// "Cont demo", the meters and the line: the demo button's menu, and ☰ on a
// phone.
export function DemoSummary({ usage }: { usage: DemoUsage }) {
  return (
    <>
      <p className="demo-title">Cont demo</p>
      <DemoMeters usage={usage} />
      <p className={usage.papersLeft === 0 ? 'demo-line' : 'demo-line is-muted'}>{demoLine(usage)}</p>
    </>
  );
}

// The circle of the papers used, out of the demo limit.
function DemoRing({ used }: { used: number }) {
  const round = 2 * Math.PI * 7.5;
  return (
    <svg className="demo-ring" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="7.5" fill="none" strokeWidth="3" />
      <circle
        cx="10"
        cy="10"
        r="7.5"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${((used / DEMO_PAPER_LIMIT) * round).toFixed(1)} ${round.toFixed(1)}`}
        transform="rotate(-90 10 10)"
      />
    </svg>
  );
}
```

- [ ] **Step 10: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
import { Link, matchPath, Outlet, useLocation } from 'react-router';
import { demoPapersLeft, DEMO_PAPER_LIMIT } from '../../shared/accounts.ts';
import type { Teacher } from '../../shared/api.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
```

Replace it with:

```tsx
import { Link, matchPath, Outlet, useLocation } from 'react-router';
import { BrandMark } from '../ui/BrandMark.tsx';
```

- [ ] **Step 11: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
import { ClassesPanel } from './shell/ClassesPanel.tsx';
import { IconClose, IconMenu } from './shell/icons.tsx';
```

Replace it with:

```tsx
import { ClassesPanel } from './shell/ClassesPanel.tsx';
import { DemoButton } from './shell/DemoButton.tsx';
import { IconClose, IconMenu } from './shell/icons.tsx';
```

- [ ] **Step 12: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
import { YearSelect } from './shell/YearSelect.tsx';

// The line a demo account sees on every page.
export function demoText(teacher: Teacher): string {
  const left = demoPapersLeft(teacher.papersGraded + teacher.papersWaiting);
  if (left === 0) {
    return `Cont demo: ai folosit toate cele ${DEMO_PAPER_LIMIT} lucrări ale contului. Cere unui administrator un cont complet.`;
  }
  return `Cont demo: mai ai ${left} din ${DEMO_PAPER_LIMIT} lucrări. Fiecare lucrare corectată se numără, și o recorectare. Poți corecta un singur test.`;
}

```

Replace it with:

```tsx
import { YearSelect } from './shell/YearSelect.tsx';

```

- [ ] **Step 13: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx

  // A start, a regrade or a retry changes the papers the demo line shows, and
  // a change can end or add a thing in "De făcut": every change a logged-in
```

Replace it with:

```tsx

  // A start, a regrade or a retry changes the papers the demo button shows, and
  // a change can end or add a thing in "De făcut": every change a logged-in
```

- [ ] **Step 14: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
        <div className="topbar-tools">
          {/* Logged out, the top bar has only the lockup and the theme. */}
          {me.data && <YearSelect id="school-year" labelClassName="sr-only" />}
```

Replace it with:

```tsx
        <div className="topbar-tools">
          {/* A demo account's papers come first; logged out, the top bar
              has only the lockup and the theme. */}
          {me.data?.demo && <DemoButton teacher={me.data} />}
          {me.data && <YearSelect id="school-year" labelClassName="sr-only" />}
```

- [ ] **Step 15: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
      <main className={wayIn ? 'page page-way-in' : 'page'} inert={phone && (open === 'clase' || open === 'todo')}>
        {me.data?.demo && <p className="warning">{demoText(me.data)}</p>}
        {openPage ? (
```

Replace it with:

```tsx
      <main className={wayIn ? 'page page-way-in' : 'page'} inert={phone && (open === 'clase' || open === 'todo')}>
        {openPage ? (
```

- [ ] **Step 16: Edit `src/admin/shell/PhoneMenu.tsx`**

Find this block:

```tsx
import { ThemeSwitch } from '../../ui/ThemeButton.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { IconSettings } from './icons.tsx';
```

Replace it with:

```tsx
import { ThemeSwitch } from '../../ui/ThemeButton.tsx';
import { demoUsage } from '../account/DemoMeters.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { DemoSummary } from './DemoButton.tsx';
import { IconSettings } from './icons.tsx';
```

- [ ] **Step 17: Edit `src/admin/shell/PhoneMenu.tsx`**

Find this block:

```tsx
// The menu under ☰ on a phone (redesign spec §4, round 6 design M2): what the
// bottom bar has no room for. It drops from the top bar and comes right after
// ☰ for the keyboard (the Layout draws it there); a tap outside it or on ☰
```

Replace it with:

```tsx
// The menu under ☰ on a phone (redesign spec §4, round 6 design M2): what the
// bottom bar and the top bar have no room for, a demo account's papers too. It drops from the top bar and comes right after
// ☰ for the keyboard (the Layout draws it there); a tap outside it or on ☰
```

- [ ] **Step 18: Edit `src/admin/shell/PhoneMenu.tsx`**

Find this block:

```tsx
      </p>
      <Link className="menu-row menu-link" to="/cont">
```

Replace it with:

```tsx
      </p>
      {/* A demo account's papers: the demo button of the top bar, on a phone. */}
      {teacher.demo && (
        <div className="phone-demo">
          <DemoSummary usage={demoUsage(teacher)} />
        </div>
      )}
      <Link className="menu-row menu-link" to="/cont">
```

- [ ] **Step 19: Edit `src/ui/brand.css`**

Find this block:

```css

/* The two meters of a demo account: its one test and its papers; the papers'
```

Replace it with:

```css

/* The demo account's button of the top bar (redesign spec §11.6): a ring of
   the papers used, orange when none are left, and a small menu under it. */
.demo {
  position: relative;
}

.demo-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.25rem;
  padding: 0 0.75rem;
  border: 1px solid var(--control);
  border-radius: 999px;
  background: var(--sheet);
  color: var(--text);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.demo-button:hover,
.demo-button[aria-expanded="true"] {
  border-color: var(--muted);
}

.demo-ring {
  width: 1rem;
  height: 1rem;
  stroke: var(--ink);
}

.demo-ring circle:first-child {
  stroke: var(--active);
}

.demo-button.is-full .demo-ring {
  stroke: var(--orange-mark);
}

.demo-menu {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 40;
  display: grid;
  gap: 0.75rem;
  width: 20rem;
  padding: 1rem 1.125rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-panel);
  background: var(--sheet);
  box-shadow: var(--float);
  font-size: 0.875rem;
}

.demo-title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 700;
}

.demo-line {
  margin: 0;
  font-size: 0.8125rem;
}

.demo-line.is-muted {
  color: var(--muted);
}

.phone-demo {
  display: grid;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--rule);
}

/* The two meters of a demo account: its one test and its papers; the papers'
```

- [ ] **Step 20: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  123 passed | 1 skipped (124)`, `Tests  1972 passed | 3 skipped (1975)`.

- [ ] **Step 21: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 22: Commit**

```bash
git add src/admin/shell/useSmallMenu.ts src/admin/shell/UserMenu.tsx src/admin/shell/DemoButton.tsx src/admin/Layout.tsx src/admin/shell/PhoneMenu.tsx src/ui/brand.css src/admin/pages/LoginPage.test.tsx src/admin/Layout.test.tsx
git commit -m "Show a demo account's papers as a button in the top bar"
```

### Task 4: The notes

`src/AGENTS.md` describes the way in, Contul meu and the demo button; spec §4 loses "until then".

**Files:**
- Modify: `src/AGENTS.md`, `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`

- [ ] **Step 1: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the files, the students' link while the test is a draft or open, rename, archive, delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table, "Recorectează tot"). `pages/ReviewPage.tsx` and `reviewPage/` are the review of the points to check (redesign spec §7, `/teste/:code/verificare`): the papers and their points (`ReviewQueue.tsx`), one page of the paper at a time (`ReviewPhoto.tsx`; no marks on the photo, because the robot does not say where an answer is), and the decision (`ReviewDecision.tsx`: "Accept", the stepper and "Salvează", "Am verificat paginile", the paper's exercises). `points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first), steps between them, and writes the address (`?lucrare=&punct=`, replaced, never a new step in the history). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point; a refused one reads the paper and the test again. An address that names no paper of the test is rewritten first (`ReviewLoader` draws `<Navigate replace>` to `firstSpot()`), before any paper is drawn: a refresh never moves the spot, and no decision is made on a spot the address does not hold. The next point opens only if the teacher is still at the decided one (a call-level `onSuccess` of `mutate`, which does not run once the page is gone), and its heading takes the focus (`focus({ preventScroll: true })`). An address of a paper with no result now (graded again) shows that paper with the reason (`submissionPage/waitingText.ts`, shared with the paper page); when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A, J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `pages/LoginPage.tsx` is the login and sign-up form: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. `LoginPage` also has "Am uitat parola" (asks for the link by email); `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/AccountPage.tsx` is Contul meu (password, "Ieși din cont"). `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). A demo account sees, at the top of every page, how many papers it may still have graded. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls, by an `IntersectionObserver`; "Pe scurt" stays marked without one) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`)); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (the account menu, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: exactly the three cases of spec §5; `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme and the account move under ☰ (CSS and `PhoneMenu.tsx`).
- `pages/TestsPage.tsx` is the start page, the Teste page of the redesign (spec §5): the greeting and today's date in Romania's time (`testsPage/greeting.ts`), "N lucruri te așteaptă ˅", which opens the list of what waits in place (`testsPage/TodoRows.tsx`: "De făcut" of every class of the year, as the bar counts it, whatever chip is chosen), the class chips and the box "Arată și testele arhivate", and the groups "În lucru" and "Terminate" (`testsPage/TestGroup.tsx`; `inWork()` in `shell/todo.ts` is the rule of the panel "Clasele tale" too). A row shows the test, the stage bar and the current stage, the papers, and one next step (`testsPage/nextStep.ts`): a link to the test (to the review for "Verifică 3 puncte"), or the button that publishes the results on the row; "Oprește accesul" stays on a row whose results are open. Below 768px each row is a block.
```

Replace it with:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the files, the students' link while the test is a draft or open, rename, archive, delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table, "Recorectează tot"). `pages/ReviewPage.tsx` and `reviewPage/` are the review of the points to check (redesign spec §7, `/teste/:code/verificare`): the papers and their points (`ReviewQueue.tsx`), one page of the paper at a time (`ReviewPhoto.tsx`; no marks on the photo, because the robot does not say where an answer is), and the decision (`ReviewDecision.tsx`: "Accept", the stepper and "Salvează", "Am verificat paginile", the paper's exercises). `points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first), steps between them, and writes the address (`?lucrare=&punct=`, replaced, never a new step in the history). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point; a refused one reads the paper and the test again. An address that names no paper of the test is rewritten first (`ReviewLoader` draws `<Navigate replace>` to `firstSpot()`), before any paper is drawn: a refresh never moves the spot, and no decision is made on a spot the address does not hold. The next point opens only if the teacher is still at the decided one (a call-level `onSuccess` of `mutate`, which does not run once the page is gone), and its heading takes the focus (`focus({ preventScroll: true })`). An address of a paper with no result now (graded again) shows that paper with the reason (`submissionPage/waitingText.ts`, shared with the paper page); when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A, J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (the account menu, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: exactly the three cases of spec §5; `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
- `pages/TestsPage.tsx` is the start page, the Teste page of the redesign (spec §5): the greeting and today's date in Romania's time (`testsPage/greeting.ts`), "N lucruri te așteaptă ˅", which opens the list of what waits in place (`testsPage/TodoRows.tsx`: "De făcut" of every class of the year, as the bar counts it, whatever chip is chosen), the class chips and the box "Arată și testele arhivate", and the groups "În lucru" and "Terminate" (`testsPage/TestGroup.tsx`; `inWork()` in `shell/todo.ts` is the rule of the panel "Clasele tale" too). A row shows the test, the stage bar and the current stage, the papers, and one next step (`testsPage/nextStep.ts`): a link to the test (to the review for "Verifică 3 puncte"), or the button that publishes the results on the row; "Oprește accesul" stays on a row whose results are open. Below 768px each row is a block.
```

- [ ] **Step 2: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/GradingProgress.tsx` is the grading bar (blue graded, pale blue waiting, empty track not sent) under the test page's uploads heading only (the Teste page shows the stage bar instead); "✓ Corectat complet" shows when every sent paper is graded. The bar is `aria-hidden`: the counts stay in words. `EvaluationControls` shows "Marchează ca terminat" in place of the start button when a paper is graded and none waits.
- `landing/`: the landing page (`index.html`) in the look of the redesign, with its own tokens (`landing.css`) and one script, the theme button (`landing.ts`). The page's security policy allows no inline script or style; `landing.test.ts` checks that, and Laura Miron's texts word for word. "Cere un cont de profesor" opens `/admin/#cont-nou`, which `LoginPage` shows as "Cont nou".
- Light is the default theme on every page: `public/theme.js` and `currentTheme()` follow only a saved choice, never the system setting.
```

Replace it with:

```markdown
- `ui/GradingProgress.tsx` is the grading bar (blue graded, pale blue waiting, empty track not sent) under the test page's uploads heading only (the Teste page shows the stage bar instead); "✓ Corectat complet" shows when every sent paper is graded. The bar is `aria-hidden`: the counts stay in words. `EvaluationControls` shows "Marchează ca terminat" in place of the start button when a paper is graded and none waits.
- `landing/`: the landing page (`index.html`) in the look of the redesign, with its own tokens (`landing.css`) and one script, the theme button (`landing.ts`). The page's security policy allows no inline script or style; `landing.test.ts` checks that, and Laura Miron's texts word for word. "Cere un cont de profesor" opens `/admin/#cont-nou`, which `LoginPage` shows as "Cont nou de profesor". The login page repeats the heading, the line and the six stages: a change to them in `index.html` goes into `admin/wayIn/WayIn.tsx` too.
- Light is the default theme on every page: `public/theme.js` and `currentTheme()` follow only a saved choice, never the system setting.
```

- [ ] **Step 3: Edit `src/AGENTS.md`**

Find this block:

```markdown
- Dark colours in `ui/brand.css` are written twice (the `[data-theme="dark"]` block and the `prefers-color-scheme` block): keep both copies equal, the class colours included (`ui/brand.test.ts` checks it). The styles are flat: no gradients, and a shadow (`--float`) only on what floats (panels, menus).
- The top bar's account button is named "<initials>, contul tău: <name>" ("LM, contul tău: Laura Miron": the name starts with what the button shows), ☰ is named "Mai mult" (the bar is "Meniu"), and the phone menu repeats Setări, the school year, "Contul meu" and "Ieși din cont" while it is open: a page test that looks for one of these, or for a button by the teacher's name, looks inside `screen.getByRole('main')`.
- Testing Library's waits (`findBy…`, `waitFor`) last 3 s (`src/test/setup.ts`): while the whole suite runs, the first render of a page in a file can take about a second.
```

Replace it with:

```markdown
- Dark colours in `ui/brand.css` are written twice (the `[data-theme="dark"]` block and the `prefers-color-scheme` block): keep both copies equal, the class colours included (`ui/brand.test.ts` checks it). The styles are flat: no gradients, and a shadow (`--float`) only on what floats (panels, menus).
- The top bar's account button is named "<initials>, contul tău: <name>" ("LM, contul tău: Laura Miron": the name starts with what the button shows), ☰ is named "Mai mult" (the bar is "Meniu"), and the phone menu repeats Setări, the school year, a demo account's meters, "Contul meu" and "Ieși din cont" while it is open: a page test that looks for one of these, or for a button by the teacher's name, looks inside `screen.getByRole('main')`.
- Testing Library's waits (`findBy…`, `waitFor`) last 3 s (`src/test/setup.ts`): while the whole suite runs, the first render of a page in a file can take about a second.
```

- [ ] **Step 4: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
- "Ce ai de făcut": one card per thing in "De făcut" (§5): the stage as a pill, the test and its class, what to do, one sentence, and one button to the test (to the review for Verificare, §7); the first card's button is the filled one. Under them, how many other tests of the year are in work. With nothing: "Nimic nu te așteaptă acum."
- The demo line is a button in the top bar (§11.6), from Phase 8b. Until then it stays at the top of the page, under the top bar.
- On a phone (below 900 px; round 6, design M2): the top bar holds the lockup and ☰. The 80 px bar becomes a bar at the bottom of the screen with the same four items in the same order (Test nou, Teste, Clase, De făcut with its number); Setări leaves it. ☰ drops a menu from the top bar: Setări (administrators), the school year, "Temă întunecată" (a switch), the user's name and email, "Contul meu" and "Ieși din cont". The panels cover the screen between the two bars.
```

Replace it with:

```markdown
- "Ce ai de făcut": one card per thing in "De făcut" (§5): the stage as a pill, the test and its class, what to do, one sentence, and one button to the test (to the review for Verificare, §7); the first card's button is the filled one. Under them, how many other tests of the year are in work. With nothing: "Nimic nu te așteaptă acum."
- A demo account has a button in the top bar, before the school year (§11.6).
- On a phone (below 900 px; round 6, design M2): the top bar holds the lockup and ☰. The 80 px bar becomes a bar at the bottom of the screen with the same four items in the same order (Test nou, Teste, Clase, De făcut with its number); Setări leaves it. ☰ drops a menu from the top bar: Setări (administrators), the school year, "Temă întunecată" (a switch), the user's name and email, "Contul meu" and "Ieși din cont". The panels cover the screen between the two bars.
```

- [ ] **Step 5: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  123 passed | 1 skipped (124)`, `Tests  1972 passed | 3 skipped (1975)` (also in UTC).

- [ ] **Step 6: Commit**

```bash
git add src/AGENTS.md docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md
git commit -m "Describe the way in, Contul meu and the demo button in the notes"
```

### Task 5: Look at it, then the pull request (main session)

Not a subagent task. Nothing here changes code unless a check fails; a fix found here is prototyped, tested and committed like the tasks above, and named to the user.

- [ ] **Step 1: Check the exactness of the branch**

Run: `git diff --stat refs/proto12/b4 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

- [ ] **Step 2: Run the whole suite three times, and once in UTC**

Run `npm test` three times, then once with `TZ=UTC` (Git Bash: `TZ=UTC npm test`).
Expected: PASS every time. `Test Files  123 passed | 1 skipped (124)`, `Tests  1972 passed | 3 skipped (1975)` (also in UTC).

- [ ] **Step 3: Build and start the production build with test accounts**

Check port 8788 first (`netstat -ano | findstr :8788`; end a leftover `workerd.exe` as `AGENTS.md` says). The login page shows only without the development login: put `#` before `DEV_TEACHER_EMAIL` in `.dev.vars` for this check, and take it out again after. Run `npm run db:local`, then `npx wrangler d1 execute quickeval --local --file .superpowers/tools/phase8b/sample12.sql` (git-ignored, on this PC: the password `parola-de-test-12` for `profesor@example.com`, and three more accounts with it: `demo@example.com` (demo, 20 of 35 papers), `plin@example.com` (demo, 35 of 35), `asteapta@example.com` (confirmed, waits for approval)). Then the Claude Code preview server `preview` (`npm run preview`, http://127.0.0.1:8788).
Expected: `Ready on http://127.0.0.1:8788`.

- [ ] **Step 4: Look at the pages at 1440px, 1024px and 390px, light and dark**

Logged out, `/admin/`: two halves of equal width, no school year in the top bar, the six stages on the right; "Cere un cont de profesor", "Am uitat parola" and back; `/admin/#cont-nou` opens the sign-up. Log in as `asteapta@example.com`: "Contul tău așteaptă aprobarea" with the email, "Ieși" back to the form. Log in as `demo@example.com`: "Demo · 15 lucrări rămase" before the school year; its menu with "1 din 1" and "20 din 35"; `/admin/cont` with the three cards; ☰ on a phone with "Cont demo". Log in as `plin@example.com`: the orange ring and the line for a complete account. Log in as `profesor@example.com`: "Administrator", the counts, the link to Setări, no demo button. Measure `document.documentElement.scrollWidth <= innerWidth` on each width.
Expected: the look of round 7, pages "Intrare" B (with the spec's equal halves), "Contul meu" A, "Linia contului demo" B; no sideways scroll; on a phone the form first, the stages under it.

- [ ] **Step 5: Run the smoke test**

Put `DEV_TEACHER_EMAIL` back in `.dev.vars` (the smoke test uses the development login), restart the preview, then run `npm run smoke` in a second terminal.
Expected: every check passes.

- [ ] **Step 6: Commit the plan**

```bash
git add docs/superpowers/plans/2026-11-08-mqgrader-phase-8b-way-in.md
git commit -m "Add the Phase 8b plan"
```

- [ ] **Step 7: Ask the user, then push and open the pull request**

Ask the user before pushing. On a yes: `git push -u origin feature/mqgrader-way-in`, then a ready pull request into `main` that lists what changed, the rulings above, and what was checked.

## After the build

Built Native on 2026-11-08: Tasks 1–4 match `refs/proto12/b1` … `b4` exactly. The Opus whole-branch review found 3 Important and 8 Minor problems; the fix commit "Fix the review findings of the way in" (1973 tests) covers:

- I1: the green tag of Contul meu ("Cont complet", "Administrator") was grey: `.class-card-head span` won over `.tag-ok`; `.class-card-head .tag-ok` gives it back its colour.
- I2 and M1: `useStateHeading` (in `wayIn/WayIn.tsx`) moves the focus to the new heading on every state change, also after the email confirmation and the new password, and never on page load (not even under StrictMode's double effect). Tests check the focus after each.
- I3: a small menu of the top bar also closes when the focus leaves it (`focusin`), so the keyboard cannot open the demo menu and the initials' menu at once; a test opens both from the keyboard.
- M3: a long email wraps in the waiting state. M4: the waiting state shows the email as stored (`normalizeEmail`). M5: the demo ring draws no dot with no paper used. M7: the notes say both small menus take Esc first. M8: a comment's lines.

Left as they are: M2 ("Am uitat parola" sits between the email and the password in the tab order: ruling 7's layout) and M6 (a logged-in teacher who opens `/confirma-email` or `/parola-noua` sees the two halves inside the page beside the bar; ruling 8 covers only the logged-out case).

Checked in the browser (production build, the test accounts of `sample12.sql`) at 1440, 1024 and 375 px, light and dark: no sideways scroll, the waiting state, the demo button and menu (15 left, and 0 left with the orange ring), Contul meu for a demo account and for the administrator, ☰ on a phone. `npm run smoke`: every check passed.

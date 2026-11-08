# MQGrader Phase 8d: Setări — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 5 must run in the main session, not in a subagent:** it looks at the app in a browser, and every outward step (push, pull request) needs the user's explicit yes.

**Goal:** Setări as the user picked it in round 7 (spec §11.8, page A): three tabs, "Conturi" first with a red count of the accounts that wait, "Corectarea", "Robotul"; the accounts as two cards (the accounts that wait, then every account with ⋯).

**Architecture:** One API field, no migration. `Settings` gets `robotKeyAt`: a new robot key keeps its time in a `runner_key_at` row of the `settings` table (key/value), written in the same batch as its hash. `SettingsPage.tsx` is rewritten as three tabs (the tab in the address); "Corectarea" and "Robotul" are white cards (`class-card`). `AccountsSection.tsx` is rewritten as two cards with tables; a teacher's row has ⋯ (the class page's menu, with the top bar's `useSmallMenu`).

**Tech Stack:** Node 24, TypeScript, React 19, TanStack Query, React Router, Hono on Cloudflare Pages with D1, Vitest 5, Testing Library. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md` (§1 decision 37, §11.8). Root `AGENTS.md`, `src/AGENTS.md` and `server/AGENTS.md` hold the project rules. The approved prototype: round 7 https://claude.ai/artifact/NTc1cfWBhUF4EkkCZN2uNm, page "Setări" A.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- No migration. The only server change is Task 1: the time of a new robot key. Accounts, settings and the robot key keep their routes, rules and SQL otherwise.
- Flat colours only: no gradient anywhere in `brand.css`; a shadow only on what floats. Red only for what is urgent or closes something.
- No page tells students that AI grades their work; this plan changes no student page.
- Do not run Prettier or any formatter: the repo has no formatter configuration, and its defaults rewrite the quotes of whole files.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A` (the checkout holds local files that must not be committed: `.claude/launch.json` entries, untracked plan files).
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root `D:\Projects\QuickEval`, on the branch `feature/mqgrader-settings`. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy, on `main` too. If only tests of those three files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts runner/api.test.ts` alone. Then the full run counts as passed when its failed and passed tests add up to the expected passed number; say so in the task report.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; overwrite all of it with exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/proto14/d1` … `refs/proto14/d4`, one per task, on `refs/proto14/dbase` (the same files as `main` at `60d5a33`). After Task N, `git diff --stat refs/proto14/dN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`). Four tests run the real pandoc (`runner/baremDocx.test.ts`, `runner/baremTask.test.ts`, `runner/workdir.test.ts`): without pandoc they skip too, so every total shows 4 fewer passed and 4 more skipped.

## Rulings made while planning

Settled while building the prototype on 2026-11-08. Where the round 7 page and the spec differ, the spec wins; every action Setări has today stays.

1. The tab is in the address: `/setari` is "Conturi", `/setari?tab=corectarea` and `/setari?tab=robotul` the others; a tab it does not know is "Conturi". A click on a tab replaces the address (no new step in the history), as the review page does.
2. "Conturi" shows the red count only when an account waits. The page reads the accounts (`['accounts']`, the list the shell's "De făcut" reads) on every tab, so the count shows on all three. A screen reader hears "Conturi 2 așteaptă aprobarea".
3. A teacher who is not an administrator keeps today's page: "Setări" and "Doar administratorii au acces la Setări.", with no tabs. An administrator reads "Doar administratorii văd această pagină." under the heading.
4. The card of the accounts that wait: "1 cont așteaptă aprobarea", "2 conturi așteaptă aprobarea"; the columns Cont (the name and the email), Cerut (the time of the request), Email (the tag "confirmat": only confirmed accounts are listed), and "Aprobă" and "Refuză". It goes when none waits (today's line "Niciun cont nu așteaptă aprobarea." goes with it). "Refuză toate" shows from two accounts up, as today: for one, "Refuză" on its row does the same.
5. "Toate conturile" counts the accounts and lists, for each, its kind as a tag ("administrator" and "complet" green, "demo", "închis" grey) and what it used: the tests and the papers, and for an active demo account the papers out of 35 ("1 test · 20 din 35 de lucrări").
6. ⋯ is only on a teacher's row: an administrator's account does not change here, as today. An active account: "Fă cont complet" or "Fă cont demo", "Parolă nouă", "Închide contul" (red). A closed account: "Redeschide contul" (today's action; the spec does not name it) and "Parolă nouă". Every question (`window.confirm`) keeps today's words. An item closes the menu and gives the focus back to ⋯ before it asks or acts; ⋯ stays on while an action runs (its items are off), so the focus is never lost.
7. The new password ("Parola nouă a lui …", shown once) and an error show in a row under the account, so they stay after the menu closes.
8. "Corectarea": two rows, each with its sentence and its control. "Lucrări corectate deodată" saves as soon as it is chosen (today it had "Salvează"), then says "Salvat.". "Coloana Model": the checkbox "Arată coloana Model", with round 7's sentence as its description. The sentences are the controls' descriptions for a screen reader.
9. "Robotul": "Starea robotului" with a tag in its head, "lucrează acum" (green) or "nu lucrează acum", which takes the place of the line "Robotul lucrează acum."; then today's lines and the token hint. Round 7's "Detaliile fiecărei rulări sunt pe GitHub." is left out: a run's stop reason already says it when it matters.
10. "Cheia robotului": "Făcută pe 12 octombrie 2026." under "Robotul are o cheie." when the key's time is known. A key made before this change has no time (the live key, until a new one is made): only "Robotul are o cheie.". Round 7's "O cheie nouă o oprește pe cea de acum." is left out: the question before a new key says it.
11. The layout: one column of at most 60rem, white cards (`class-card`), the class page's tabs (`class-tabs`) and ⋯ menu (`class-more-menu`). Below 40rem each account row is a block: the person, the kind and the use, with ⋯ beside them; the buttons of an account that waits go under it.
12. The CSS (after the "Contul meu" rules) and the notes (a line of its own in `src/AGENTS.md`) stay away from what Phase 8c changes (PR #50), so the two branches merge in either order (`git merge-tree` of both is clean).

## Review Focus

1. No action of today is lost: approve, refuse, refuse all, complete and demo, close and reopen, a new password, the robot key, both settings (tests in Task 2 and Task 3).
2. An administrator's row has no ⋯ (test in Task 3: "offers no ⋯ for an administrator, oneself included").
3. The key's time is written in the same batch as its hash, and a key made before has none (tests in Task 1: "keeps when the key was made, and the time of the newest key", "has no time for a key made before the time was kept").
4. The tab is in the address, and the count shows on every tab (tests in Task 2: "opens on Conturi, and keeps the chosen tab in the address", "counts the accounts that wait on Conturi, on every tab").
5. The focus after ⋯: back to ⋯ after an item and after Esc (tests in Task 3: "shows the kind of each account and what it used, and makes a demo account complete", "closes ⋯ on Esc and gives the focus back to it").

---

### Before Task 1: The branch

- [ ] **Step 1: Check the branch**

No other Claude Code session may work in this checkout meanwhile (in the desktop app: `list_sessions {"linked": true}` shows none running). Run `git switch -c feature/mqgrader-settings 60d5a33`, then `git log --oneline -1`.

Expected: `60d5a33 Merge pull request #49 from parameciul/feature/mqgrader-way-in`. The untracked plan files and the local changes of `.claude/launch.json` come along; they are never committed (this plan is committed in Task 5).

### Task 1: When the robot key was made

`Settings.robotKeyAt`: the time of the newest robot key, kept beside its hash.

**Files:**
- Modify: `shared/api.ts`, `server/db/settings.ts`, `server/routes/settings.ts`, `src/test/fakeApi.ts`
- Test: `server/routes/settings.test.ts`

**Interfaces:**
- Produces: `Settings.robotKeyAt: string | null` in `shared/api.ts`; `setRobotKeyHash(db, hash, now)` in `server/db/settings.ts`; `FAKE_ROBOT_KEY_AT` in `src/test/fakeApi.ts` (the fake's `newRobotKey` sets it).

- [ ] **Step 1: Edit `server/routes/settings.test.ts`**

Find this block:

```ts
        hasRobotKey: false,
        robot: { running: false, lastCheckAt: null, lastRunFinishedAt: null, lastRunSummary: null },
```

Replace it with:

```ts
        hasRobotKey: false,
        robotKeyAt: null,
        robot: { running: false, lastCheckAt: null, lastRunFinishedAt: null, lastRunSummary: null },
```

- [ ] **Step 2: Edit `server/routes/settings.test.ts`**

Find this block:

```ts

  it('replaces the old key', async () => {
```

Replace it with:

```ts

  it('keeps when the key was made, and the time of the newest key', async () => {
    const before = new Date().toISOString();
    await api.request('POST', '/api/admin/settings/robot-key');
    const first = (await api.request('GET', '/api/admin/settings')).body.settings.robotKeyAt as string;
    expect(first >= before).toBe(true);
    await api.db.prepare("UPDATE settings SET value = '2026-01-01T00:00:00.000Z' WHERE key = 'runner_key_at'").run();
    await api.request('POST', '/api/admin/settings/robot-key');
    const second = (await api.request('GET', '/api/admin/settings')).body.settings.robotKeyAt as string;
    expect(second >= first).toBe(true);
  });

  it('has no time for a key made before the time was kept', async () => {
    await api.db.prepare("INSERT INTO settings (key, value) VALUES ('runner_key_hash', 'x')").run();
    const settings = (await api.request('GET', '/api/admin/settings')).body.settings;
    expect(settings).toMatchObject({ hasRobotKey: true, robotKeyAt: null });
  });

  it('replaces the old key', async () => {
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run server/routes/settings.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  3 failed | 21 passed (24)`: the settings have no `robotKeyAt` ("starts with one upload at a time, no robot key, and a robot that never ran": `expected { settings: { …(9) } } to deeply equal { settings: { …(10) } }`; "keeps when the key was made, and the time of the newest key": `expected false to be true`; "has no time for a key made before the time was kept": `expected { maxParallelAgents: 1, …(8) } to match object { hasRobotKey: true, robotKeyAt: null }`).

- [ ] **Step 4: Edit `shared/api.ts`**

Find this block:

```ts
  hasRobotKey: boolean;
  robot: RobotStatus;
```

Replace it with:

```ts
  hasRobotKey: boolean;
  // When the robot's key was made; null for a key made before this was kept.
  robotKeyAt: string | null;
  robot: RobotStatus;
```

- [ ] **Step 5: Edit `server/db/settings.ts`**

Find this block:

```ts
const ROBOT_KEY_HASH = 'runner_key_hash';
const SHOW_MODEL = 'show_model_column';
```

Replace it with:

```ts
const ROBOT_KEY_HASH = 'runner_key_hash';
const ROBOT_KEY_AT = 'runner_key_at';
const SHOW_MODEL = 'show_model_column';
```

- [ ] **Step 6: Edit `server/db/settings.ts`**

Find this block:

```ts
         EXISTS (SELECT 1 FROM settings WHERE key = ?) AS has_key,
         r.run_id, r.heartbeat_at, r.last_check_at, r.last_run_finished_at, r.last_run_summary,
```

Replace it with:

```ts
         EXISTS (SELECT 1 FROM settings WHERE key = ?) AS has_key,
         (SELECT value FROM settings WHERE key = ?) AS key_at,
         r.run_id, r.heartbeat_at, r.last_check_at, r.last_run_finished_at, r.last_run_summary,
```

- [ ] **Step 7: Edit `server/db/settings.ts`**

Find this block:

```ts
    )
    .bind(PARALLEL, ROBOT_KEY_HASH, teacherId, SHOW_MODEL, teacherId, teacherId, teacherId, teacherId)
    .first<{
```

Replace it with:

```ts
    )
    .bind(PARALLEL, ROBOT_KEY_HASH, ROBOT_KEY_AT, teacherId, SHOW_MODEL, teacherId, teacherId, teacherId, teacherId)
    .first<{
```

- [ ] **Step 8: Edit `server/db/settings.ts`**

Find this block:

```ts
      has_key: number;
      run_id: string | null;
```

Replace it with:

```ts
      has_key: number;
      key_at: string | null;
      run_id: string | null;
```

- [ ] **Step 9: Edit `server/db/settings.ts`**

Find this block:

```ts
    hasRobotKey: row?.has_key === 1,
    robot: {
```

Replace it with:

```ts
    hasRobotKey: row?.has_key === 1,
    robotKeyAt: row?.has_key === 1 ? (row.key_at ?? null) : null,
    robot: {
```

- [ ] **Step 10: Edit `server/db/settings.ts`**

Find this block:

```ts

// A new key replaces the old one at once: the old key stops working.
export async function setRobotKeyHash(db: D1Database, hash: string): Promise<void> {
  await setValue(db, ROBOT_KEY_HASH, hash);
}
```

Replace it with:

```ts

// A new key replaces the old one at once: the old key stops working. Its
// time is kept with it, for "Făcută pe …" in Setări.
export async function setRobotKeyHash(db: D1Database, hash: string, now: string): Promise<void> {
  const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value');
  await db.batch([put.bind(ROBOT_KEY_HASH, hash), put.bind(ROBOT_KEY_AT, now)]);
}
```

- [ ] **Step 11: Edit `server/routes/settings.ts`**

Find this block:

```ts
    const key = newRobotKey();
    await setRobotKeyHash(c.env.DB, await sha256Hex(key));
    return c.json({ key }, 201);
```

Replace it with:

```ts
    const key = newRobotKey();
    await setRobotKeyHash(c.env.DB, await sha256Hex(key), nowIso());
    return c.json({ key }, 201);
```

- [ ] **Step 12: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    hasRobotKey: false,
    robot: { running: false, lastCheckAt: null, lastRunFinishedAt: null, lastRunSummary: null },
```

Replace it with:

```ts
    hasRobotKey: false,
    robotKeyAt: null,
    robot: { running: false, lastCheckAt: null, lastRunFinishedAt: null, lastRunSummary: null },
```

- [ ] **Step 13: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
export const FAKE_ROBOT_KEY = 'fake-robot-key-0123456789abcdefghijklmnopqr';

```

Replace it with:

```ts
export const FAKE_ROBOT_KEY = 'fake-robot-key-0123456789abcdefghijklmnopqr';
export const FAKE_ROBOT_KEY_AT = '2026-10-12T09:30:00.000Z';

```

- [ ] **Step 14: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
      settings.hasRobotKey = true;
      return FAKE_ROBOT_KEY;
```

Replace it with:

```ts
      settings.hasRobotKey = true;
      settings.robotKeyAt = FAKE_ROBOT_KEY_AT;
      return FAKE_ROBOT_KEY;
```

- [ ] **Step 15: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  123 passed | 1 skipped (124)`, `Tests  1975 passed | 3 skipped (1978)`.

- [ ] **Step 16: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 17: Commit**

```bash
git add shared/api.ts server/db/settings.ts server/routes/settings.ts server/routes/settings.test.ts src/test/fakeApi.ts
git commit -m "Keep when the robot key was made"
```

### Task 2: The tabs, Corectarea and Robotul

Setări as three tabs; "Corectarea" and "Robotul" as white cards.

**Files:**
- Replace: `src/admin/pages/SettingsPage.tsx`
- Modify: `src/ui/brand.css`
- Test: `src/admin/pages/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: `Settings.robotKeyAt`, `FAKE_ROBOT_KEY_AT` (Task 1).
- Produces: the CSS classes `settings-page`, `settings-sub`, `settings-count`, `settings-panel`, `settings-row`, `settings-control`, `settings-body`, `settings-key` in `brand.css`. `lastRunText` and `modelLines` stay exported.

- [ ] **Step 1: Edit `src/admin/pages/SettingsPage.test.tsx`**

Find this block:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, FAKE_ROBOT_KEY, fakeSettings } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { lastRunText } from './SettingsPage.tsx';
```

Replace it with:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, FAKE_ROBOT_KEY, fakeAccount, fakeSettings } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
import { lastRunText } from './SettingsPage.tsx';
```

- [ ] **Step 2: Edit `src/admin/pages/SettingsPage.test.tsx`**

Find this block:

```tsx
const withSettings = (settings = fakeSettings()) => createFakeApi({ classes: [], students: {}, settings });

```

Replace it with:

```tsx
const withSettings = (settings = fakeSettings()) => createFakeApi({ classes: [], students: {}, settings });
const ROBOT = '/setari?tab=robotul';
const GRADING = '/setari?tab=corectarea';

```

- [ ] **Step 3: Edit `src/admin/pages/SettingsPage.test.tsx`**

Find this block:

```tsx
    const api = withSettings();
    renderAdmin('/setari', api);
    expect(await screen.findByText('Robotul nu a terminat încă nicio rulare.')).toBeInTheDocument();
```

Replace it with:

```tsx
    const api = withSettings();
    renderAdmin(ROBOT, api);
    expect(await screen.findByText('Robotul nu a terminat încă nicio rulare.')).toBeInTheDocument();
```

- [ ] **Step 4: Edit `src/admin/pages/SettingsPage.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByRole('heading', { name: 'Setări' })).toBeInTheDocument();
  });

  it('changes how many uploads the robot grades at the same time', async () => {
    const api = withSettings();
    renderAdmin('/setari', api);
    const select = await screen.findByLabelText('Lucrări corectate deodată');
    expect(select).toHaveValue('1');
    await userEvent.selectOptions(select, '3');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.updateSettings).toHaveBeenCalledWith(3);
    expect(await screen.findByRole('status')).toHaveTextContent('Salvat.');
  });
```

Replace it with:

```tsx
    expect(await screen.findByRole('heading', { name: 'Setări' })).toBeInTheDocument();
    expect(screen.getByText('Doar administratorii văd această pagină.')).toBeInTheDocument();
  });

  it('opens on Conturi, and keeps the chosen tab in the address', async () => {
    renderAdmin('/setari', withSettings(), <LocationProbe />);
    const tabs = await screen.findByRole('tablist', { name: 'Setări' });
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Conturi', 'Corectarea', 'Robotul']);
    expect(within(tabs).getByRole('tab', { name: 'Conturi' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Robotul' }));
    await expectLocation('/setari?tab=robotul');
    expect(within(tabs).getByRole('tab', { name: 'Robotul' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Robotul' })).toHaveTextContent('Starea robotului');
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Conturi' }));
    await expectLocation(/^\/setari$/);
  });

  it('opens the tab the address names, and Conturi for one it does not know', async () => {
    const first = renderAdmin(GRADING, withSettings());
    expect(await screen.findByRole('tab', { name: 'Corectarea' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByLabelText('Lucrări corectate deodată')).toBeInTheDocument();
    first.unmount();
    renderAdmin('/setari?tab=altceva', withSettings());
    expect(await screen.findByRole('tab', { name: 'Conturi' })).toHaveAttribute('aria-selected', 'true');
  });

  it('counts the accounts that wait on Conturi, on every tab', async () => {
    const pending = (id: number, name: string) =>
      fakeAccount({ id, name, email: `${id}@example.com`, role: 'teacher', demo: true, status: 'pending' });
    const api = createFakeApi({ classes: [], students: {}, settings: fakeSettings(), accounts: [fakeAccount(), pending(2, 'Ana'), pending(3, 'Radu')] });
    renderAdmin(ROBOT, api);
    expect(await screen.findByRole('tab', { name: 'Conturi 2 așteaptă aprobarea' })).toBeInTheDocument();
  });

  it('shows no count on Conturi when no account waits', async () => {
    renderAdmin(ROBOT, withSettings());
    await screen.findByText('Robotul nu a terminat încă nicio rulare.');
    expect(screen.getByRole('tab', { name: 'Conturi' })).toBeInTheDocument();
  });

  it('changes how many uploads the robot grades at the same time, as soon as it is chosen', async () => {
    const api = withSettings();
    renderAdmin(GRADING, api);
    const select = await screen.findByLabelText('Lucrări corectate deodată');
    expect(select).toHaveValue('1');
    expect(select).toHaveAccessibleDescription('Mai multe lucrări deodată termină mai repede, dar ajung mai repede la limita planului Claude.');
    await userEvent.selectOptions(select, '3');
    expect(api.updateSettings).toHaveBeenCalledWith(3);
    expect(await screen.findByRole('status')).toHaveTextContent('Salvat.');
    expect(screen.getByLabelText('Lucrări corectate deodată')).toHaveValue('3');
  });
```

- [ ] **Step 5: Edit `src/admin/pages/SettingsPage.test.tsx`**

Find this block:

```tsx
    const none = withSettings();
    renderAdmin('/setari', none);
    await screen.findByText('Robotul nu a terminat încă nicio rulare.');
```

Replace it with:

```tsx
    const none = withSettings();
    renderAdmin(ROBOT, none);
    await screen.findByText('Robotul nu a terminat încă nicio rulare.');
```

- [ ] **Step 6: Edit `src/admin/pages/SettingsPage.test.tsx`**

Find this block:

```tsx
    const lastModels = { gradingModel: 'claude-opus-5-5', gradingEffort: 'high', analysisModel: 'claude-sonnet-5-5', analysisEffort: null };
    renderAdmin('/setari', withSettings(fakeSettings({ lastModels })));
    expect(await screen.findByText('Ultima corectare: claude-opus-5-5, efort high')).toBeInTheDocument();
```

Replace it with:

```tsx
    const lastModels = { gradingModel: 'claude-opus-5-5', gradingEffort: 'high', analysisModel: 'claude-sonnet-5-5', analysisEffort: null };
    renderAdmin(ROBOT, withSettings(fakeSettings({ lastModels })));
    expect(await screen.findByText('Ultima corectare: claude-opus-5-5, efort high')).toBeInTheDocument();
```

- [ ] **Step 7: Edit `src/admin/pages/SettingsPage.test.tsx`**

Find this block:

```tsx
    const configured = { configuredModel: 'opus', configuredEffort: 'high', configuredAt: '2026-10-10T12:00:00.000Z' };
    renderAdmin('/setari', withSettings(fakeSettings(configured)));
    expect(await screen.findByText('Setat pentru robot: opus, efort high (la ultima verificare, acum 32 min)')).toBeInTheDocument();
```

Replace it with:

```tsx
    const configured = { configuredModel: 'opus', configuredEffort: 'high', configuredAt: '2026-10-10T12:00:00.000Z' };
    renderAdmin(ROBOT, withSettings(fakeSettings(configured)));
    expect(await screen.findByText('Setat pentru robot: opus, efort high (la ultima verificare, acum 32 min)')).toBeInTheDocument();
```

- [ ] **Step 8: Edit `src/admin/pages/SettingsPage.test.tsx`**

Find this block:

```tsx
    const configured = { configuredModel: 'sonnet', configuredEffort: null, configuredAt: '2026-10-10T12:00:00.000Z' };
    const first = renderAdmin('/setari', withSettings(fakeSettings(configured)));
    expect(await screen.findByText('Setat pentru robot: sonnet (la ultima verificare, acum 5 min)')).toBeInTheDocument();
    first.unmount();
    renderAdmin('/setari', withSettings());
    await screen.findByText('Robotul nu a terminat încă nicio rulare.');
```

Replace it with:

```tsx
    const configured = { configuredModel: 'sonnet', configuredEffort: null, configuredAt: '2026-10-10T12:00:00.000Z' };
    const first = renderAdmin(ROBOT, withSettings(fakeSettings(configured)));
    expect(await screen.findByText('Setat pentru robot: sonnet (la ultima verificare, acum 5 min)')).toBeInTheDocument();
    first.unmount();
    renderAdmin(ROBOT, withSettings());
    await screen.findByText('Robotul nu a terminat încă nicio rulare.');
```

- [ ] **Step 9: Edit `src/admin/pages/SettingsPage.test.tsx`**

Find this block:

```tsx
    const api = withSettings();
    renderAdmin('/setari', api);
    const box = await screen.findByRole('checkbox', { name: 'Arată coloana Model în tabelul Încărcări' });
    expect(box).not.toBeChecked();
    await user.click(box);
    expect(api.setShowModelColumn).toHaveBeenCalledWith(true);
    expect(await screen.findByRole('checkbox', { name: 'Arată coloana Model în tabelul Încărcări' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Arată coloana Model în tabelul Încărcări' }));
    expect(api.setShowModelColumn).toHaveBeenLastCalledWith(false);
```

Replace it with:

```tsx
    const api = withSettings();
    renderAdmin(GRADING, api);
    const box = await screen.findByRole('checkbox', { name: 'Arată coloana Model' });
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription('Arată în tabelul lucrărilor cu ce model a fost corectată fiecare lucrare.');
    await user.click(box);
    expect(api.setShowModelColumn).toHaveBeenCalledWith(true);
    expect(await screen.findByRole('checkbox', { name: 'Arată coloana Model' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Arată coloana Model' }));
    expect(api.setShowModelColumn).toHaveBeenLastCalledWith(false);
```

- [ ] **Step 10: Edit `src/admin/pages/SettingsPage.test.tsx`**

Find this block:

```tsx
    const api = withSettings();
    renderAdmin('/setari', api);
    expect(await screen.findByText('Robotul nu are încă o cheie.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fă cheia robotului' }));
```

Replace it with:

```tsx
    const api = withSettings();
    renderAdmin(ROBOT, api);
    expect(await screen.findByText('Robotul nu are încă o cheie.')).toBeInTheDocument();
    expect(screen.queryByText(/^Făcută pe/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fă cheia robotului' }));
```

- [ ] **Step 11: Edit `src/admin/pages/SettingsPage.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByText('Robotul are o cheie.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copiază cheia' }));
```

Replace it with:

```tsx
    expect(await screen.findByText('Robotul are o cheie.')).toBeInTheDocument();
    expect(screen.getByText('Făcută pe 12 octombrie 2026.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copiază cheia' }));
```

- [ ] **Step 12: Edit `src/admin/pages/SettingsPage.test.tsx`**

Find this block:

```tsx
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin('/setari', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Fă o cheie nouă' }));
```

Replace it with:

```tsx
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin(ROBOT, api);
    expect(await screen.findByText('Robotul are o cheie.')).toBeInTheDocument();
    expect(screen.queryByText(/^Făcută pe/)).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Fă o cheie nouă' }));
```

- [ ] **Step 13: Edit `src/admin/pages/SettingsPage.test.tsx`**

Find this block:

```tsx
    });
    renderAdmin('/setari', withSettings(settings));
    expect(await screen.findByText('Robotul lucrează acum.')).toBeInTheDocument();
    expect(screen.getByText('Robotul a verificat acum 3 min.')).toBeInTheDocument();
```

Replace it with:

```tsx
    });
    renderAdmin(ROBOT, withSettings(settings));
    const state = await screen.findByRole('region', { name: 'Starea robotului' });
    expect(within(state).getByText('lucrează acum')).toHaveClass('tag-ok');
    expect(screen.getByText('Robotul a verificat acum 3 min.')).toBeInTheDocument();
```

- [ ] **Step 14: Edit `src/admin/pages/SettingsPage.test.tsx`**

Find this block:

```tsx
  it('says when the robot never ran', async () => {
    renderAdmin('/setari', withSettings());
    expect(await screen.findByText('Robotul nu a terminat încă nicio rulare.')).toBeInTheDocument();
    expect(screen.getByText('Nicio lucrare nu a fost corectată încă.')).toBeInTheDocument();
```

Replace it with:

```tsx
  it('says when the robot never ran', async () => {
    renderAdmin(ROBOT, withSettings());
    expect(await screen.findByText('Robotul nu a terminat încă nicio rulare.')).toBeInTheDocument();
    expect(screen.getByText('nu lucrează acum')).not.toHaveClass('tag-ok');
    expect(screen.getByText('Nicio lucrare nu a fost corectată încă.')).toBeInTheDocument();
```

- [ ] **Step 15: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/SettingsPage.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  10 failed | 10 passed (20)`: the old page has no subtitle (`Unable to find an element with the text: Doar administratorii văd această pagină.`), no tabs (`Unable to find role="tablist" and name "Setări"`, `Unable to find role="tab" and name "Corectarea"`, `… "Conturi 2 așteaptă aprobarea"`, `Unable to find an accessible element with the role "tab" and name "Conturi"`), no description on the select (`expect(element).toHaveAccessibleDescription()`), the old checkbox name (`Unable to find role="checkbox" and name "Arată coloana Model"`), no key date (`Unable to find an element with the text: Făcută pe 12 octombrie 2026.`) and no state tag (`Unable to find role="region" and name "Starea robotului"`, `Unable to find an element with the text: nu lucrează acum`). The ten that pass hold for the old page too: the refresh every minute, the replaced key's question, the model and robot lines, and `lastRunText`.

- [ ] **Step 16: Replace `src/admin/pages/SettingsPage.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { RobotSettings, RobotStatus, Settings } from '../../../shared/api.ts';
import { MAX_PARALLEL_AGENTS, type RunSummary } from '../../../shared/runner.ts';
import { countLabel, formatDate, formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { AccountsSection } from '../settingsPage/AccountsSection.tsx';
import { agoText, RobotLine } from '../testPage/RobotLine.tsx';

const PARALLEL_OPTIONS = Array.from({ length: MAX_PARALLEL_AGENTS }, (_, index) => index + 1);
// A page left open reads the robot's state again this often (the robot checks
// every 10 minutes, and the robot line moves on by itself).
const REFRESH_MS = 60_000;

type Tab = 'conturi' | 'corectarea' | 'robotul';
const TABS: { id: Tab; label: string }[] = [
  { id: 'conturi', label: 'Conturi' },
  { id: 'corectarea', label: 'Corectarea' },
  { id: 'robotul', label: 'Robotul' },
];

// The tab in the address: `?tab=corectarea` or `?tab=robotul`; none (or one it
// does not know) is "Conturi".
function tabOf(value: string | null): Tab {
  return value === 'corectarea' || value === 'robotul' ? value : 'conturi';
}

// Setări (redesign spec §11.8), for the administrators only: three tabs, the
// teachers' accounts first (with a red count of those that wait), how the
// robot grades, and the robot's state and key.
export function SettingsPage() {
  const api = useApi();
  const [params, setParams] = useSearchParams();
  const tab = tabOf(params.get('tab'));
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
  const isAdmin = me.data?.role === 'admin';
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
    refetchInterval: REFRESH_MS,
    enabled: isAdmin,
  });
  // On every tab: the count of "Conturi" comes from it.
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api.listAccounts(), enabled: isAdmin });
  const waiting = accounts.data?.filter((account) => account.status === 'pending').length ?? 0;

  if (me.data && !isAdmin) {
    return (
      <section>
        <h1>Setări</h1>
        <p>Doar administratorii au acces la Setări.</p>
      </section>
    );
  }

  const show = (next: Tab) => setParams(next === 'conturi' ? {} : { tab: next }, { replace: true });

  return (
    <section className="settings-page">
      <h1>Setări</h1>
      <p className="settings-sub">Doar administratorii văd această pagină.</p>
      <div className="class-tabs" role="tablist" aria-label="Setări">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`settings-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="settings-panel"
            className="class-tab"
            onClick={() => show(id)}
          >
            {label}
            {id === 'conturi' && waiting > 0 && (
              <>
                {' '}
                <span className="tag tag-urgent settings-count">
                  {waiting} <span className="sr-only">așteaptă aprobarea</span>
                </span>
              </>
            )}
          </button>
        ))}
      </div>
      <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab}`} className="settings-panel">
        {me.isPending && <p>Se încarcă…</p>}
        {isAdmin && tab === 'conturi' && <AccountsSection />}
        {isAdmin && tab !== 'conturi' && (
          <>
            {settings.isPending && <p>Se încarcă…</p>}
            {settings.error && <ErrorMessage error={settings.error} />}
            {settings.data && tab === 'corectarea' && <GradingCard settings={settings.data} />}
            {settings.data && tab === 'robotul' && (
              <>
                <RobotState settings={settings.data} />
                <RobotKey hasKey={settings.data.hasRobotKey} madeAt={settings.data.robotKeyAt} />
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// "Corectarea": one row per setting, with its sentence and its control. Each
// control saves as soon as it changes.
function GradingCard({ settings }: { settings: Settings }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const parallel = useMutation({
    mutationFn: (value: number) => api.updateSettings(value),
    onSuccess: (saved) => queryClient.setQueryData(['settings'], saved),
  });
  const model = useMutation({
    mutationFn: (show: boolean) => api.setShowModelColumn(show),
    onSuccess: (saved) => queryClient.setQueryData(['settings'], saved),
  });

  return (
    <section className="class-card" aria-label="Corectarea">
      <div className="settings-row">
        <div>
          <label htmlFor="parallel">Lucrări corectate deodată</label>
          <p id="parallel-hint">Mai multe lucrări deodată termină mai repede, dar ajung mai repede la limita planului Claude.</p>
        </div>
        <div className="settings-control">
          <select
            id="parallel"
            aria-describedby="parallel-hint"
            value={settings.maxParallelAgents}
            disabled={parallel.isPending}
            onChange={(event) => parallel.mutate(Number(event.target.value))}
          >
            {PARALLEL_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {parallel.isSuccess && <span role="status">Salvat.</span>}
        </div>
      </div>
      {parallel.error && <ErrorMessage error={parallel.error} />}
      <div className="settings-row">
        <div>
          <b id="model-title">Coloana Model</b>
          <p id="model-hint">Arată în tabelul lucrărilor cu ce model a fost corectată fiecare lucrare.</p>
        </div>
        <label className="check-label settings-control">
          <input
            type="checkbox"
            aria-describedby="model-hint"
            checked={settings.showModelColumn}
            disabled={model.isPending}
            onChange={(event) => model.mutate(event.target.checked)}
          />
          Arată coloana Model
        </label>
      </div>
      {model.error && <ErrorMessage error={model.error} />}
    </section>
  );
}

// The key is shown once, right after it is made: only its hash is stored.
function RobotKey({ hasKey, madeAt }: { hasKey: boolean; madeAt: string | null }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const create = useMutation({
    mutationFn: () => api.newRobotKey(),
    onSuccess: async () => {
      setCopied(null);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
  const key = create.data;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(key ?? '');
      setCopied('yes');
    } catch {
      setCopied('failed');
    }
  };

  return (
    <section className="class-card" aria-labelledby="robot-key-title">
      <div className="class-card-head">
        <h2 id="robot-key-title">Cheia robotului</h2>
      </div>
      <div className="settings-row">
        <div>
          <b>{hasKey ? 'Robotul are o cheie.' : 'Robotul nu are încă o cheie.'}</b>
          {hasKey && madeAt && <p>Făcută pe {formatDate(madeAt)}.</p>}
        </div>
        <button
          type="button"
          className="button-quiet settings-control"
          disabled={create.isPending}
          onClick={() => {
            if (!hasKey || window.confirm('Faci o cheie nouă? Cheia de acum nu va mai funcționa.')) create.mutate();
          }}
        >
          {hasKey ? 'Fă o cheie nouă' : 'Fă cheia robotului'}
        </button>
      </div>
      {create.error && <ErrorMessage error={create.error} />}
      {key && (
        <div className="warning settings-key">
          <p>
            Copiaz-o acum în GitHub, în secretul <code>QUICKEVAL_RUNNER_KEY</code>. După ce pleci de pe pagină, nu o mai vezi.
          </p>
          <div className="form-row">
            <label className="sr-only" htmlFor="robot-key">
              Cheia nouă a robotului
            </label>
            <input id="robot-key" type="text" value={key} readOnly onFocus={(event) => event.target.select()} />
            <button type="button" className="button button-small" onClick={copy}>
              Copiază cheia
            </button>
            {copied === 'yes' && <span role="status">Copiat!</span>}
            {copied === 'failed' && <span role="status">Nu am putut copia. Selectează cheia și copiaz-o de mână.</span>}
          </div>
        </div>
      )}
    </section>
  );
}

const STOP: Record<RunSummary['stop'], string> = {
  done: 'A terminat toată munca.',
  budget: 'S-a oprit după 2 ore. Restul lucrărilor așteaptă până pornește robotul din nou.',
  usage_limit: 'S-a oprit la limita planului Claude; continuă mai târziu.',
  lease_lost: 'S-a oprit pentru că a pornit altă rulare.',
  claude_login: 'S-a oprit pentru că tokenul Claude nu mai merge. Fă un token nou (vezi mai jos).',
  error: 'S-a oprit din cauza unei erori. Detaliile sunt în rularea de pe GitHub.',
};

// "Ultima rulare s-a încheiat la …: 1 listă de exerciții, 25 de lucrări corectate, 0 lucrări eșuate."
export function lastRunText(robot: RobotStatus): string | null {
  const summary = robot.lastRunSummary;
  if (!robot.lastRunFinishedAt || !summary) return null;
  const parts = [
    countLabel(summary.exerciseLists, 'listă de exerciții', 'liste de exerciții'),
    countLabel(summary.graded, 'lucrare corectată', 'lucrări corectate'),
    countLabel(summary.failed, 'lucrare eșuată', 'lucrări eșuate'),
  ];
  if (summary.analyses > 0) parts.push(countLabel(summary.analyses, 'analiză de clasă', 'analize de clasă'));
  return `Ultima rulare s-a încheiat la ${formatDateTime(robot.lastRunFinishedAt)}: ${parts.join(', ')}. ${STOP[summary.stop]}`;
}

function modelLine(label: string, model: string | null, effort: string | null): string | null {
  if (!model) return null;
  return effort ? `${label}: ${model}, efort ${effort}` : `${label}: ${model}`;
}

// The model and effort of the latest grading and class analysis.
export function modelLines(models: RobotSettings): string[] {
  return [
    modelLine('Ultima corectare', models.gradingModel, models.gradingEffort),
    modelLine('Ultima analiză a clasei', models.analysisModel, models.analysisEffort),
  ].filter((text): text is string => text !== null);
}

// "Starea robotului": a tag in the head says whether it works now; then
// today's lines.
function RobotState({ settings }: { settings: Settings }) {
  const lastRun = lastRunText(settings.robot);
  return (
    <section className="class-card" aria-labelledby="robot-state-title">
      <div className="class-card-head">
        <h2 id="robot-state-title">Starea robotului</h2>
        {settings.robot.running ? <span className="tag tag-ok">lucrează acum</span> : <span className="tag">nu lucrează acum</span>}
      </div>
      <div className="settings-body">
        <RobotLine lastCheckAt={settings.robot.lastCheckAt} />
        {settings.configuredModel !== null && (
          <p>
            Setat pentru robot: {settings.configuredModel}
            {settings.configuredEffort ? `, efort ${settings.configuredEffort}` : ''}
            {settings.configuredAt ? ` (la ultima verificare, ${agoText(settings.configuredAt, Date.now())})` : ''}
          </p>
        )}
        <p>{lastRun ?? 'Robotul nu a terminat încă nicio rulare.'}</p>
        <p>
          {settings.lastGradedAt
            ? `Ultima lucrare corectată: ${formatDateTime(settings.lastGradedAt)}.`
            : 'Nicio lucrare nu a fost corectată încă.'}
        </p>
        {modelLines(settings.lastModels).map((text) => (
          <p key={text}>{text}</p>
        ))}
        <p className="hint">
          Robotul corectează cu planul Claude prin tokenul din secretul GitHub <code>CLAUDE_CODE_OAUTH_TOKEN</code>. Tokenul ține un an: dacă
          lucrările nu se mai corectează, fă unul nou.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 17: Edit `src/ui/brand.css`**

Find this block:

```css

/* The demo account's button of the top bar (redesign spec §11.6): a ring of
```

Replace it with:

```css

/* Setări (redesign spec §11.8): three tabs ("Conturi" with a red count of the
   accounts that wait), then white cards. A card of settings has one row per
   setting: its name and sentence on the left, its control on the right. */
.settings-page {
  max-width: 60rem;
}

.settings-page h1 {
  margin-bottom: 0.25rem;
}

.settings-sub {
  margin: 0 0 1.25rem;
  color: var(--muted);
}

.settings-count {
  margin-left: 0.375rem;
  font-size: 0.75rem;
}

.settings-panel {
  display: grid;
  gap: 1rem;
}

.settings-panel .class-card > .alert {
  margin: 0 1.25rem 1rem;
}

.settings-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
  padding: 1rem 1.25rem;
}

.settings-row + .settings-row {
  border-top: 1px solid var(--line);
}

.class-card-head + .settings-row {
  padding-top: 0.25rem;
}

.settings-row > div:first-child {
  flex: 1 1 18rem;
  min-width: 0;
}

.settings-row label,
.settings-row b {
  font-weight: 600;
}

.settings-row p {
  margin: 0.25rem 0 0;
  color: var(--muted);
  font-size: 0.875rem;
}

.settings-control {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
}

.settings-body {
  padding: 0.25rem 1.25rem 1.25rem;
}

.settings-body > p,
.settings-body > .warning {
  margin: 0 0 0.5rem;
}

.settings-body > :last-child {
  margin-bottom: 0;
}

.settings-key {
  margin: 0 1.25rem 1.25rem;
}

.settings-key input {
  min-width: 0;
  flex: 1 1 14rem;
}

/* The demo account's button of the top bar (redesign spec §11.6): a ring of
```

- [ ] **Step 18: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  123 passed | 1 skipped (124)`, `Tests  1979 passed | 3 skipped (1982)`.

- [ ] **Step 19: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 20: Commit**

```bash
git add src/admin/pages/SettingsPage.tsx src/admin/pages/SettingsPage.test.tsx src/ui/brand.css
git commit -m "Show Setări as three tabs, with Corectarea and Robotul as cards"
```

### Task 3: The accounts

"Conturi" as two cards: the accounts that wait, then every account with ⋯ on a teacher's row.

**Files:**
- Replace: `src/admin/settingsPage/AccountsSection.tsx`, `src/admin/settingsPage/AccountsSection.test.tsx`
- Modify: `src/ui/brand.css`

**Interfaces:**
- Consumes: `useSmallMenu` from `shell/useSmallMenu.ts`; the class page's `class-more`, `class-more-button`, `class-menu`, `class-more-menu`, `class-menu-item`, `text-button` CSS.
- Produces: `accountKind(account)` and `accountUse(account)` from `settingsPage/AccountsSection.tsx` (they replace `accountTag`); the CSS classes `accounts-waiting`, `accounts-table`, `account-person`, `account-actions`, `account-more`, `accounts-follow`, and `class-menu-item.is-danger` in `brand.css`.

- [ ] **Step 1: Replace `src/admin/settingsPage/AccountsSection.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, FAKE_TEMPORARY_PASSWORD, fakeAccount } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { accountKind, accountUse } from './AccountsSection.tsx';

const laura = fakeAccount();
const ana = fakeAccount({ id: 2, name: 'Ana Pop', email: 'ana@example.com', role: 'teacher', demo: true, status: 'pending' });
const bogdan = fakeAccount({ id: 3, name: 'Bogdan', email: 'bogdan@example.com', role: 'teacher', demo: true, testsEvaluated: 1, papersGraded: 20 });

const mihai = fakeAccount({ id: 4, name: 'Mihai', email: 'mihai@example.com', role: 'admin' });

const withAccounts = () =>
  createFakeApi({ classes: [], students: {}, accounts: [structuredClone(ana), structuredClone(laura), structuredClone(bogdan), structuredClone(mihai)] });

afterEach(() => {
  vi.restoreAllMocks();
});

const card = (name: string | RegExp) => screen.findByRole('region', { name });
const row = (within_: HTMLElement, name: string) => within(within_).getByRole('rowheader', { name: new RegExp(`^${name}`) }).closest('tr')!;

// Opens ⋯ of a teacher's row and picks an item.
async function pick(name: string, item: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Mai multe pentru ${name}` }));
  await userEvent.click(screen.getByRole('menuitem', { name: item }));
}

describe('the accounts on Setări', () => {
  it('lists the accounts that wait in their own card, and approves one', async () => {
    const api = withAccounts();
    renderAdmin('/setari', api);
    const waiting = await card('1 cont așteaptă aprobarea');
    const line = row(waiting, 'Ana Pop');
    expect(line).toHaveTextContent('ana@example.com');
    expect(line).toHaveTextContent('6 oct. 2026, 11:00');
    expect(within(line).getByText('confirmat')).toHaveClass('tag-ok');
    expect(waiting).toHaveTextContent('Un cont aprobat este un cont demo: un test, cel mult 35 de lucrări. Îl faci complet din lista de mai jos.');
    await userEvent.click(within(waiting).getByRole('button', { name: 'Aprobă Ana Pop' }));
    expect(api.approveAccount).toHaveBeenCalledWith(2, ana.createdAt);
    expect(await within(await card('Toate conturile')).findByRole('rowheader', { name: /^Ana Pop/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /așteaptă aprobarea/ })).not.toBeInTheDocument();
  });

  it('refuses an account after a confirmation', async () => {
    const api = withAccounts();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/setari', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Refuză Ana Pop' }));
    expect(api.rejectAccount).toHaveBeenCalledWith(2, ana.createdAt);
    await screen.findByRole('region', { name: 'Toate conturile' });
    await vi.waitFor(() => expect(screen.queryByRole('region', { name: /așteaptă aprobarea/ })).not.toBeInTheDocument());
  });

  it('refuses every account that waits at once, after a confirmation', async () => {
    const carmen = fakeAccount({ id: 5, name: 'Carmen', email: 'carmen@example.com', role: 'teacher', demo: true, status: 'pending' });
    const api = createFakeApi({ classes: [], students: {}, accounts: [structuredClone(ana), structuredClone(carmen), structuredClone(laura)] });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/setari', api);
    const waiting = await card('2 conturi așteaptă aprobarea');
    await userEvent.click(within(waiting).getByRole('button', { name: 'Refuză toate' }));
    expect(confirm).toHaveBeenCalledWith('Refuzi toate cele 2 conturi care așteaptă? Cererile se șterg.');
    expect(api.rejectAllAccounts).toHaveBeenCalledWith([
      { id: 2, createdAt: ana.createdAt },
      { id: 5, createdAt: carmen.createdAt },
    ]);
    await vi.waitFor(() => expect(screen.queryByRole('region', { name: /așteaptă aprobarea/ })).not.toBeInTheDocument());
  });

  it('offers no "Refuză toate" for a single account that waits', async () => {
    renderAdmin('/setari', withAccounts());
    await screen.findByRole('button', { name: 'Aprobă Ana Pop' });
    expect(screen.queryByRole('button', { name: 'Refuză toate' })).not.toBeInTheDocument();
  });

  it('shows no card of waiting accounts when none waits', async () => {
    renderAdmin('/setari', createFakeApi({ classes: [], students: {}, accounts: [structuredClone(laura), structuredClone(bogdan)] }));
    expect(await card('Toate conturile')).toHaveTextContent('2 conturi');
    expect(screen.queryByRole('region', { name: /așteaptă aprobarea/ })).not.toBeInTheDocument();
  });

  it('shows the kind of each account and what it used, and makes a demo account complete', async () => {
    const api = withAccounts();
    renderAdmin('/setari', api);
    const all = await card('Toate conturile');
    expect(all).toHaveTextContent('3 conturi');
    expect(row(all, 'Laura Miron')).toHaveTextContent('administrator');
    expect(row(all, 'Laura Miron')).toHaveTextContent('0 teste · 0 lucrări');
    expect(within(row(all, 'Bogdan')).getByText('demo')).toHaveClass('tag');
    expect(row(all, 'Bogdan')).toHaveTextContent('1 test · 20 din 35 de lucrări');
    await pick('Bogdan', 'Fă cont complet');
    expect(api.updateAccount).toHaveBeenCalledWith(3, { demo: false });
    expect(await within(all).findByText('complet')).toHaveClass('tag-ok');
    expect(row(all, 'Bogdan')).toHaveTextContent('1 test · 20 de lucrări');
    expect(screen.getByRole('button', { name: 'Mai multe pentru Bogdan' })).toHaveFocus();
  });

  it('closes an account after a confirmation, and opens it again', async () => {
    const api = withAccounts();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/setari', api);
    await pick('Bogdan', 'Închide contul');
    expect(confirm).toHaveBeenCalledWith('Închizi contul lui Bogdan? Nu va mai putea intra, dar datele rămân.');
    expect(api.updateAccount).toHaveBeenCalledWith(3, { status: 'disabled' });
    const all = await card('Toate conturile');
    expect(await within(all).findByText('închis')).toBeInTheDocument();
    expect(row(all, 'Bogdan')).toHaveClass('is-muted');
    await userEvent.click(screen.getByRole('button', { name: 'Mai multe pentru Bogdan' }));
    expect(screen.queryByRole('menuitem', { name: 'Închide contul' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^Fă cont/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Redeschide contul' }));
    expect(api.updateAccount).toHaveBeenLastCalledWith(3, { status: 'active' });
  });

  it('keeps an account open when the closing is not confirmed', async () => {
    const api = withAccounts();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin('/setari', api);
    await pick('Bogdan', 'Închide contul');
    expect(api.updateAccount).not.toHaveBeenCalled();
  });

  it('makes a new password for a teacher and shows it once, under the row', async () => {
    const api = withAccounts();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/setari', api);
    await pick('Bogdan', 'Parolă nouă');
    expect(api.resetPassword).toHaveBeenCalledWith(3);
    const shown = await screen.findByRole('status');
    expect(shown).toHaveTextContent(`Parola nouă a lui Bogdan: ${FAKE_TEMPORARY_PASSWORD}`);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes ⋯ on Esc and gives the focus back to it', async () => {
    renderAdmin('/setari', withAccounts());
    const more = await screen.findByRole('button', { name: 'Mai multe pentru Bogdan' });
    await userEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it('offers no ⋯ for an administrator, oneself included', async () => {
    renderAdmin('/setari', withAccounts());
    const all = await card('Toate conturile');
    expect(row(all, 'Mihai')).toHaveTextContent('mihai@example.com');
    expect(within(all).queryByRole('button', { name: /Laura Miron/ })).not.toBeInTheDocument();
    expect(within(all).queryByRole('button', { name: /Mihai/ })).not.toBeInTheDocument();
  });
});

describe('accountKind and accountUse', () => {
  it.each([
    [fakeAccount({ role: 'teacher', testsEvaluated: 1, papersGraded: 1 }), 'complet', '1 test · 1 lucrare'],
    [fakeAccount({ role: 'teacher', testsEvaluated: 7, papersGraded: 19 }), 'complet', '7 teste · 19 lucrări'],
    [fakeAccount({ role: 'teacher', testsEvaluated: 51, papersGraded: 900 }), 'complet', '51 de teste · 900 de lucrări'],
    [fakeAccount({ role: 'teacher', demo: true, testsEvaluated: 0, papersGraded: 0 }), 'demo', '0 teste · 0 din 35 de lucrări'],
    [fakeAccount({ role: 'teacher', demo: true, testsEvaluated: 3, papersGraded: 40 }), 'demo', '3 teste · 35 din 35 de lucrări'],
    [fakeAccount({ role: 'teacher', demo: true, status: 'disabled', testsEvaluated: 1, papersGraded: 2 }), 'închis', '1 test · 2 lucrări'],
    [fakeAccount({ testsEvaluated: 4, papersGraded: 88 }), 'administrator', '4 teste · 88 de lucrări'],
  ])('describes %j', (account, kind, use) => {
    expect(accountKind(account).label).toBe(kind);
    expect(accountUse(account)).toBe(use);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/admin/settingsPage/AccountsSection.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  17 failed | 1 passed (18)`: the old section has no cards (`Unable to find role="region" and name "1 cont așteaptă aprobarea"`, `… "2 conturi așteaptă aprobarea"`, `… "Toate conturile"`), no ⋯ (`Unable to find role="button" and name "Mai multe pentru Bogdan"`), and no `accountKind` (`TypeError: accountKind is not a function`). The one that passes holds for the old section too: no "Refuză toate" for a single account that waits.

- [ ] **Step 3: Replace `src/admin/settingsPage/AccountsSection.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Account } from '../../../shared/api.ts';
import { DEMO_PAPER_LIMIT } from '../../../shared/accounts.ts';
import { countLabel, formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSmallMenu } from '../shell/useSmallMenu.ts';

// "Conturi" of Setări (redesign spec §11.8): the administrators approve or
// refuse new accounts (one by one, or all that wait at once), make a demo
// account complete, close an account, and give a teacher who forgot it a new
// password. Only accounts whose email is confirmed are listed.
export function AccountsSection() {
  const api = useApi();
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api.listAccounts() });
  const pending = accounts.data?.filter((account) => account.status === 'pending') ?? [];
  const others = accounts.data?.filter((account) => account.status !== 'pending') ?? [];

  return (
    <>
      {accounts.isPending && <p>Se încarcă…</p>}
      {accounts.error && <ErrorMessage error={accounts.error} />}
      {accounts.data && (
        <>
          {pending.length > 0 && <WaitingCard pending={pending} />}
          <section className="class-card" aria-labelledby="accounts-all">
            <div className="class-card-head">
              <h2 id="accounts-all">Toate conturile</h2>
              <span>{countLabel(others.length, 'cont', 'conturi')}</span>
            </div>
            <table className="accounts-table">
              <thead>
                <tr>
                  <th scope="col">Cont</th>
                  <th scope="col">Felul</th>
                  <th scope="col">Până acum</th>
                  <th scope="col">
                    <span className="sr-only">Acțiuni</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {others.map((account) => (
                  <AccountRow key={account.id} account={account} />
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}

function useReload() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['accounts'] });
}

function Person({ account }: { account: Account }) {
  return (
    <th scope="row">
      <span className="account-person">
        {account.name}
        <span>{account.email}</span>
      </span>
    </th>
  );
}

// The accounts that wait, in a red-edged card; it goes when none waits.
function WaitingCard({ pending }: { pending: Account[] }) {
  return (
    <section className="class-card accounts-waiting" aria-labelledby="accounts-waiting">
      <div className="class-card-head">
        <h2 id="accounts-waiting">{countLabel(pending.length, 'cont', 'conturi')} așteaptă aprobarea</h2>
        {pending.length > 1 && <RejectAll pending={pending} />}
      </div>
      <table className="accounts-table">
        <thead>
          <tr>
            <th scope="col">Cont</th>
            <th scope="col">Cerut</th>
            <th scope="col">Email</th>
            <th scope="col">
              <span className="sr-only">Acțiuni</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {pending.map((account) => (
            <PendingRow key={account.id} account={account} />
          ))}
        </tbody>
      </table>
      <p className="class-card-foot">
        Un cont aprobat este un cont demo: un test, cel mult {DEMO_PAPER_LIMIT} de lucrări. Îl faci complet din lista de mai jos.
      </p>
    </section>
  );
}

// For a wave of sign-ups nobody knows: every account the page shows as
// waiting goes at once.
function RejectAll({ pending }: { pending: Account[] }) {
  const api = useApi();
  const reload = useReload();
  const rejectAll = useMutation({
    mutationFn: () => api.rejectAllAccounts(pending.map((account) => ({ id: account.id, createdAt: account.createdAt }))),
    onSettled: reload,
  });
  return (
    <>
      <button
        type="button"
        className="text-button is-danger"
        disabled={rejectAll.isPending}
        onClick={() => {
          if (window.confirm(`Refuzi toate cele ${pending.length} conturi care așteaptă? Cererile se șterg.`)) rejectAll.mutate();
        }}
      >
        Refuză toate
      </button>
      {rejectAll.error && <ErrorMessage error={rejectAll.error} />}
    </>
  );
}

function PendingRow({ account }: { account: Account }) {
  const api = useApi();
  const reload = useReload();
  // A refusal means the page was out of date: read the accounts again.
  const approve = useMutation({ mutationFn: () => api.approveAccount(account.id, account.createdAt), onSettled: reload });
  const reject = useMutation({ mutationFn: () => api.rejectAccount(account.id, account.createdAt), onSettled: reload });
  const error = approve.error ?? reject.error;

  return (
    <>
      <tr>
        <Person account={account} />
        <td>{formatDateTime(account.createdAt)}</td>
        <td>
          <span className="tag tag-ok">confirmat</span>
        </td>
        <td>
          <span className="account-actions">
            <button
              type="button"
              className="button button-small"
              aria-label={`Aprobă ${account.name}`}
              disabled={approve.isPending}
              onClick={() => approve.mutate()}
            >
              Aprobă
            </button>
            <button
              type="button"
              className="button-quiet button-small"
              aria-label={`Refuză ${account.name}`}
              disabled={reject.isPending}
              onClick={() => {
                if (window.confirm(`Refuzi contul lui ${account.name}? Cererea se șterge.`)) reject.mutate();
              }}
            >
              Refuză
            </button>
          </span>
        </td>
      </tr>
      {error && (
        <tr className="accounts-follow">
          <td colSpan={4}>
            <ErrorMessage error={error} />
          </td>
        </tr>
      )}
    </>
  );
}

// The kind of an account, as its tag: "administrator", "complet", "demo" or
// "închis".
export function accountKind(account: Account): { label: string; className: string } {
  if (account.role === 'admin') return { label: 'administrator', className: 'tag tag-ok' };
  if (account.status === 'disabled') return { label: 'închis', className: 'tag tag-muted' };
  if (account.demo) return { label: 'demo', className: 'tag' };
  return { label: 'complet', className: 'tag tag-ok' };
}

// What an account used: how many times its tests went to the robot for
// grading, and how many papers the robot graded ("din 35" for a demo account).
export function accountUse(account: Account): string {
  const tests = countLabel(account.testsEvaluated, 'test', 'teste');
  if (account.demo && account.role === 'teacher' && account.status === 'active') {
    return `${tests} · ${Math.min(account.papersGraded, DEMO_PAPER_LIMIT)} din ${DEMO_PAPER_LIMIT} de lucrări`;
  }
  return `${tests} · ${countLabel(account.papersGraded, 'lucrare', 'lucrări')}`;
}

// Administrators' accounts do not change here: an administrator changes their
// own password on Contul meu, or with `npm run set-password`.
function AccountRow({ account }: { account: Account }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const reload = useReload();
  const [password, setPassword] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: (change: { demo?: boolean; status?: 'active' | 'disabled' }) => api.updateAccount(account.id, change),
    onSuccess: (accounts) => queryClient.setQueryData(['accounts'], accounts),
    onError: reload,
  });
  const reset = useMutation({ mutationFn: () => api.resetPassword(account.id), onSuccess: setPassword });
  const kind = accountKind(account);
  const error = update.error ?? reset.error;

  return (
    <>
      <tr className={account.status === 'disabled' ? 'is-muted' : undefined}>
        <Person account={account} />
        <td>
          <span className={kind.className}>{kind.label}</span>
        </td>
        <td>{accountUse(account)}</td>
        <td>
          {account.role === 'teacher' && (
            <AccountMenu
              account={account}
              busy={update.isPending || reset.isPending}
              onChange={(change) => update.mutate(change)}
              onNewPassword={() => reset.mutate()}
            />
          )}
        </td>
      </tr>
      {(password || error) && (
        <tr className="accounts-follow">
          <td colSpan={4}>
            {password && (
              <div className="warning" role="status">
                <p>
                  Parola nouă a lui {account.name}: <code>{password}</code>
                </p>
                <p>Trimite-o profesorului acum: după ce pleci de pe pagină, nu o mai vezi. Profesorul o schimbă din Contul meu.</p>
              </div>
            )}
            {error && <ErrorMessage error={error} />}
          </td>
        </tr>
      )}
    </>
  );
}

// ⋯ of a teacher's row. An item closes the menu and gives the focus back to
// ⋯ before it asks or acts.
function AccountMenu({
  account,
  busy,
  onChange,
  onNewPassword,
}: {
  account: Account;
  busy: boolean;
  onChange(change: { demo?: boolean; status?: 'active' | 'disabled' }): void;
  onNewPassword(): void;
}) {
  const { open, toggle, box, button } = useSmallMenu();
  const menuId = `account-menu-${account.id}`;
  const run = (action: () => void) => () => {
    toggle();
    button.current?.focus();
    action();
  };
  const active = account.status === 'active';

  return (
    <div className="class-more account-more" ref={box}>
      <button
        ref={button}
        type="button"
        className="class-more-button"
        aria-label={`Mai multe pentru ${account.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
      >
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="3.5" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="12.5" cy="8" r="1.4" />
        </svg>
      </button>
      {open && (
        <div className="class-menu class-more-menu" id={menuId} role="menu">
          {active ? (
            <button type="button" role="menuitem" className="class-menu-item" disabled={busy} onClick={run(() => onChange({ demo: !account.demo }))}>
              {account.demo ? 'Fă cont complet' : 'Fă cont demo'}
            </button>
          ) : (
            <button type="button" role="menuitem" className="class-menu-item" disabled={busy} onClick={run(() => onChange({ status: 'active' }))}>
              Redeschide contul
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="class-menu-item"
            disabled={busy}
            onClick={run(() => {
              if (window.confirm(`Faci o parolă nouă pentru ${account.name}? Parola de acum nu va mai funcționa.`)) onNewPassword();
            })}
          >
            Parolă nouă
          </button>
          {active && (
            <button
              type="button"
              role="menuitem"
              className="class-menu-item is-danger"
              disabled={busy}
              onClick={run(() => {
                if (window.confirm(`Închizi contul lui ${account.name}? Nu va mai putea intra, dar datele rămân.`)) onChange({ status: 'disabled' });
              })}
            >
              Închide contul
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Edit `src/ui/brand.css`**

Find this block:

```css

/* The demo account's button of the top bar (redesign spec §11.6): a ring of
```

Replace it with:

```css

/* "Conturi": the accounts that wait in a red-edged card, then every account.
   On a phone each row is a block: the person, then the kind and the use, with
   ⋯ (or the two buttons of an account that waits) beside them. */
.class-card.accounts-waiting {
  border-color: var(--red);
  box-shadow: inset 3px 0 0 var(--red);
}

.accounts-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.accounts-table th,
.accounts-table td {
  padding: 0.75rem;
  border-top: 1px solid var(--line);
  text-align: left;
  vertical-align: middle;
}

.accounts-table th:first-child,
.accounts-table td:first-child {
  padding-left: 1.25rem;
}

.accounts-table th:last-child,
.accounts-table td:last-child {
  padding-right: 1.25rem;
  text-align: right;
}

.accounts-table thead th {
  padding-block: 0.625rem;
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 500;
}

.accounts-table tbody th {
  font-weight: 400;
}

.account-person {
  display: flex;
  flex-direction: column;
  min-width: 0;
  color: var(--text);
  font-size: 0.9375rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.account-person span {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 400;
}

.accounts-table tr.is-muted .account-person {
  color: var(--muted);
}

.account-actions {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}

.account-more {
  display: inline-block;
}

.account-more .class-menu {
  text-align: left;
}

.class-menu-item.is-danger {
  color: var(--red);
}

.accounts-table .accounts-follow td {
  padding-top: 0;
  border-top: 0;
  text-align: left;
}

.accounts-follow .warning,
.accounts-follow .alert {
  margin: 0;
}

.accounts-follow .warning + .alert {
  margin-top: 0.5rem;
}

@media (max-width: 40rem) {
  .accounts-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .accounts-table tbody tr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.25rem 0.75rem;
    padding: 0.875rem 1rem;
    border-top: 1px solid var(--line);
  }

  .accounts-table tbody th,
  .accounts-table tbody td,
  .accounts-table tbody th:first-child,
  .accounts-table tbody td:first-child,
  .accounts-table tbody td:last-child {
    grid-column: 1;
    padding: 0;
    border: 0;
    text-align: left;
  }

  .accounts-table tbody td:last-child {
    grid-column: 2;
    grid-row: 1 / span 3;
  }

  .accounts-waiting .accounts-table tbody td:last-child {
    grid-column: 1 / -1;
    grid-row: auto;
    margin-top: 0.375rem;
  }

  .accounts-table tbody tr.accounts-follow {
    display: block;
    padding-top: 0;
    border-top: 0;
  }
}

/* The demo account's button of the top bar (redesign spec §11.6): a ring of
```

- [ ] **Step 5: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  123 passed | 1 skipped (124)`, `Tests  1985 passed | 3 skipped (1988)`.

- [ ] **Step 6: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add src/admin/settingsPage/AccountsSection.tsx src/admin/settingsPage/AccountsSection.test.tsx src/ui/brand.css
git commit -m "Show the accounts of Setări as two cards, with ⋯ for each teacher"
```

### Task 4: The notes

`src/AGENTS.md` and `server/AGENTS.md` describe Setări and the key's time.

**Files:**
- Modify: `src/AGENTS.md`, `server/AGENTS.md`

- [ ] **Step 1: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `testPage/StagePanel.tsx` (the panel În clasă) holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
- `ui/GradingProgress.tsx` is the grading bar (blue graded, pale blue waiting, empty track not sent) under the test page's uploads heading only (the Teste page shows the stage bar instead); "✓ Corectat complet" shows when every sent paper is graded. The bar is `aria-hidden`: the counts stay in words. `EvaluationControls` shows "Marchează ca terminat" in place of the start button when a paper is graded and none waits.
```

Replace it with:

```markdown
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `testPage/StagePanel.tsx` (the panel În clasă) holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
- `pages/SettingsPage.tsx` is Setări (redesign spec §11.8, administrators only): three tabs, with the tab in the address (`?tab=corectarea`, `?tab=robotul`; none, or one it does not know, is "Conturi", and a click replaces the address). "Conturi" (`settingsPage/AccountsSection.tsx`) holds a red-edged card of the accounts that wait (gone when none waits; "Refuză toate" from two up) and "Toate conturile", with ⋯ (`shell/useSmallMenu.ts`) on a teacher's row only: "Fă cont complet" or "Fă cont demo", "Parolă nouă", "Închide contul", and for a closed account "Redeschide contul". An item closes the menu and gives the focus back to ⋯ before it asks or acts; the new password and an error show in a row under the account. The red count of "Conturi" reads `['accounts']` on every tab. "Corectarea" saves each control as it changes. "Robotul" holds "Starea robotului" (a tag: "lucrează acum" or "nu lucrează acum") and "Cheia robotului" with the day it was made (`robotKeyAt`; a key made before that was kept has none). Below 40rem each account row is a block (CSS).
- `ui/GradingProgress.tsx` is the grading bar (blue graded, pale blue waiting, empty track not sent) under the test page's uploads heading only (the Teste page shows the stage bar instead); "✓ Corectat complet" shows when every sent paper is graded. The bar is `aria-hidden`: the counts stay in words. `EvaluationControls` shows "Marchează ca terminat" in place of the start button when a paper is graded and none waits.
```

- [ ] **Step 2: Edit `server/AGENTS.md`**

Find this block:

```markdown
- The robot names what it works on, because ids of deleted rows come back: a claim returns the upload's `startedAt`, and the result (`GRADED_BY_RUN`, `failGrading`) checks it in SQL; a test read and a print job return `createdAt`, and the exercise list and the print (`WAITS_FOR_LIST`, `WAITS_FOR_PRINT`) check it. An older robot sends none: the bodies take it as optional, and the route then uses the row as it is.
- The robot's key and the settings in `routes/settings.ts` are shared by every teacher, and the key opens the robot API for all of them: only administrators (`teachers.role = 'admin'`) see or change them.
- Accounts: a sign-up inserts a `pending`, demo teacher whose email is not confirmed (`confirm_token_hash`, `email_confirmed_at`). Every sign-up request counts in `signup_ips` (the IP's key from `clientIpKey` in `http.ts`: the /64 for IPv6), whatever its outcome, so the limits tell nothing about the email: at most `MAX_SIGNUPS_PER_IP` a day from one IP and `MAX_SIGNUPS_PER_DAY` from all (each IP adds at most its own limit to the total, so one IP cannot close sign-ups; spreading over many IPv6 /64s can, an accepted limit), and at most 50 confirmed accounts wait; the insert checks all of it in its SQL. Accounts that waited 30 days, or were not confirmed in a day, go in the same batch, and so does an unconfirmed account of the same email once `RESEND_MINUTES` passed from the IP that asked (`confirm_ip_hash`), or `REPLACE_MINUTES` from another (whoever owns the email can ask again, an email gets at most one link in that time, and nobody else can keep cancelling the link). The link (`POST /api/auth/confirm`) confirms only with the password chosen at the sign-up, so someone who asks with another person's email cannot get that person to confirm it; only then do the administrators get an email, see it on Setări, and may approve it (checked in the approve's SQL). Sign-up answers 503 `signup_off` without an email setting: nobody could confirm. A sign-up with a taken email answers 201 and changes nothing, and a locked account answers like a wrong password: the forms never tell which emails have an account. Emails go out after the answer (`inBackground` in `http.ts`), so the answer's time tells nothing either. A new password may not be one of `isCommonPassword` (`shared/accounts.ts`). An administrator sets only a teacher's password, never another administrator's (`teachersOnly`), and the teacher gets an email. Approving (`pending → active`), refusing (deletes pending rows only, one or all the page shows), and an administrator's changes (only `role = 'teacher'` rows that are not pending) check their state in their SQL. A refused account's id comes back for the next sign-up, so approving and refusing also name the account by `createdAt` (`ShownAccount` in `db/accounts.ts`), checked in their SQL. Closing an account or a new password deletes its sessions in the same batch. Only the SHA-256 of a session token is stored.
```

Replace it with:

```markdown
- The robot names what it works on, because ids of deleted rows come back: a claim returns the upload's `startedAt`, and the result (`GRADED_BY_RUN`, `failGrading`) checks it in SQL; a test read and a print job return `createdAt`, and the exercise list and the print (`WAITS_FOR_LIST`, `WAITS_FOR_PRINT`) check it. An older robot sends none: the bodies take it as optional, and the route then uses the row as it is.
- The robot's key and the settings in `routes/settings.ts` are shared by every teacher, and the key opens the robot API for all of them: only administrators (`teachers.role = 'admin'`) see or change them. A new key's time is kept beside its hash, in the same batch (`runner_key_at`, `Settings.robotKeyAt`).
- Accounts: a sign-up inserts a `pending`, demo teacher whose email is not confirmed (`confirm_token_hash`, `email_confirmed_at`). Every sign-up request counts in `signup_ips` (the IP's key from `clientIpKey` in `http.ts`: the /64 for IPv6), whatever its outcome, so the limits tell nothing about the email: at most `MAX_SIGNUPS_PER_IP` a day from one IP and `MAX_SIGNUPS_PER_DAY` from all (each IP adds at most its own limit to the total, so one IP cannot close sign-ups; spreading over many IPv6 /64s can, an accepted limit), and at most 50 confirmed accounts wait; the insert checks all of it in its SQL. Accounts that waited 30 days, or were not confirmed in a day, go in the same batch, and so does an unconfirmed account of the same email once `RESEND_MINUTES` passed from the IP that asked (`confirm_ip_hash`), or `REPLACE_MINUTES` from another (whoever owns the email can ask again, an email gets at most one link in that time, and nobody else can keep cancelling the link). The link (`POST /api/auth/confirm`) confirms only with the password chosen at the sign-up, so someone who asks with another person's email cannot get that person to confirm it; only then do the administrators get an email, see it on Setări, and may approve it (checked in the approve's SQL). Sign-up answers 503 `signup_off` without an email setting: nobody could confirm. A sign-up with a taken email answers 201 and changes nothing, and a locked account answers like a wrong password: the forms never tell which emails have an account. Emails go out after the answer (`inBackground` in `http.ts`), so the answer's time tells nothing either. A new password may not be one of `isCommonPassword` (`shared/accounts.ts`). An administrator sets only a teacher's password, never another administrator's (`teachersOnly`), and the teacher gets an email. Approving (`pending → active`), refusing (deletes pending rows only, one or all the page shows), and an administrator's changes (only `role = 'teacher'` rows that are not pending) check their state in their SQL. A refused account's id comes back for the next sign-up, so approving and refusing also name the account by `createdAt` (`ShownAccount` in `db/accounts.ts`), checked in their SQL. Closing an account or a new password deletes its sessions in the same batch. Only the SHA-256 of a session token is stored.
```

- [ ] **Step 3: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  123 passed | 1 skipped (124)`, `Tests  1985 passed | 3 skipped (1988)`.

- [ ] **Step 4: Commit**

```bash
git add src/AGENTS.md server/AGENTS.md
git commit -m "Describe Setări in the notes"
```

### Task 5: Look at it, then the pull request (main session)

Not a subagent task. Nothing here changes code unless a check fails; a fix found here is prototyped, tested and committed like the tasks above, and named to the user.

- [ ] **Step 1: Check the exactness of the branch**

Run: `git diff --stat refs/proto14/d4 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

- [ ] **Step 2: Run the whole suite three times, and once in UTC**

Run `npm test` three times, then once with `TZ=UTC` (Git Bash: `TZ=UTC npm test`).
Expected: PASS every time. `Test Files  123 passed | 1 skipped (124)`, `Tests  1985 passed | 3 skipped (1988)`.

- [ ] **Step 3: Build and start the production build, with sample accounts**

Check port 8788 first (`netstat -ano | findstr :8788`; end a leftover `workerd.exe` as `AGENTS.md` says). Run `npm run db:local`. Add sample accounts that are never committed (two that wait, a full one, a demo one at 20 of 35 papers, a closed one) and a finished robot run, with `npx wrangler d1 execute quickeval --local --file <a scratchpad .sql file>`. Then the Claude Code preview server `preview` (`npm run preview`, http://127.0.0.1:8788). The development login of `.dev.vars` logs in the local teacher.
Expected: `Ready on http://127.0.0.1:8788`.

- [ ] **Step 4: Look at the page at 1440px, 1024px and 390px, light and dark**

`/admin/setari`: the tabs with the red count; the red-edged card of the accounts that wait and "Refuză toate"; "Toate conturile" with the tags and ⋯ (open it on a teacher, not on an administrator); "Aprobă" moves an account to the list and the count goes down. `?tab=corectarea`: the two rows. `?tab=robotul`: the state's tag, and "Fă o cheie nouă" then shows "Făcută pe …". Measure `document.documentElement.scrollWidth <= innerWidth` on each width and tab.
Expected: the look of round 7, page "Setări" A; no sideways scroll; on a phone the account rows are blocks.

- [ ] **Step 5: Run the smoke test**

Run `npm run smoke` in a second terminal.
Expected: every check passes.

- [ ] **Step 6: Commit the plan**

```bash
git add docs/superpowers/plans/2026-11-08-mqgrader-phase-8d-settings.md
git commit -m "Add the Phase 8d plan"
```

- [ ] **Step 7: Ask the user, then push and open the pull request**

Ask the user before pushing. On a yes: `git push -u origin feature/mqgrader-settings`, then a ready pull request into `main` that lists what changed, the rulings above, and what was checked.

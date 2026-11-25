# Admin "View as teacher" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An administrator opens a teacher's account read only ("Vezi ca {name}") from Setări, sees the teacher app with that teacher's data under a fixed bar, and leaves with "Ieși".

**Architecture:** A new table `impersonations` and a second cookie `qe_view` (path `/api/admin`). `teacherAuth` resolves the cookie with one JOIN that also checks the administrator's live session, so `c.var.teacher` becomes the viewed teacher and `c.var.viewing` holds the view. A middleware refuses every write in `view` mode. The client reads the view from `GET /api/admin/me`, reloads when the view part of `GET /api/admin/version` changes, and goes back to Setări on `409 impersonation_ended`.

**Tech Stack:** Hono on Cloudflare Pages Functions, D1 (SQLite), zod, React 19 + TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-admin-view-as-teacher-design.md`

## Global Constraints

- `/api/auth/login`, `/api/auth/session`, `/api/auth/logout`, `server/auth/session.ts`'s session cookie functions and the `sessions` table do not change.
- The swap happens in `teacherAuth()` only, never in `loggedInTeacher()` (so `optionalTeacher`, Quick Try's admin check and `/api/auth/session` keep the real person).
- Cookie: `qe_view`, `Path=/api/admin`, `HttpOnly`, `Secure` on HTTPS, `SameSite=Strict`, `Max-Age=7200` (twice the view's hour, so the expired view still reaches the server). Token from `newSessionToken()`, stored as `sha256Hex`.
- A view lasts 1 hour (`VIEW_MS = 3_600_000`); rows are kept 365 days (`VIEW_KEEP_DAYS = 365`).
- Only `mode: 'view'` is accepted now; the table already allows `'act'`.
- Rules are checked inside the SQL write (the start's INSERT … SELECT), never only before it.
- Every visible text: Romanian through `t()` with its English in `src/i18n/en/admin.ts`; every API message: Romanian with its English in `shared/i18n/messages.ts`.
- English addresses; times as ISO UTC strings; relative imports name the `.ts`/`.tsx` file; no enums.
- At most 15 D1 queries per request; without the `qe_view` cookie a request makes no extra query.
- The migration runs on the live database before the code reaches `main` (`docs/deploy.md`).
- Commits: no AI attribution, no ticket numbers in code comments; stage files by path.

## Review Focus

1. **A tab opened before the view started.** It must not show the teacher's data under the admin's pages for longer than one version check: the view part of `/version` changes, and the tab reloads (Task 5 test `reloads when the view part of the version changes`).
2. **The admin's login ends in another tab while viewing.** The next request must answer 409, not 401 and not the admin's own data, once a new login exists (Task 2 test `ends with the admin's login`).
3. **A write route that is not POST** (PATCH, PUT, DELETE). The read-only middleware blocks by "not GET/HEAD", so every method is refused (Task 3 test `refuses every write method while viewing`).
4. **Contul meu's password form while viewing.** The refusal must come before `takePasswordCheck`, so the teacher's login counter does not move (Task 3 test `refuses the teacher's password change without counting a try`).
5. **The English page.** The bar, the dialog, the 409 notice and the read-only refusal must read in English with `X-MQ-Lang: en` / `quickeval.lang = en` (Task 3 test `answers the refusal in English`, Task 5 and 6 tests in English).

---

## File map

| File | Responsibility |
|---|---|
| `migrations/0038_impersonations.sql` (create) | The table and its index. |
| `server/db/impersonations.ts` (create) | `startView`, `findView`, `endView`, `closeDeadView`, `listAccountViews`. |
| `server/db/accounts.ts` (modify) | Export `TEACHER_COLUMNS`, `TeacherRow`, `toTeacher`. |
| `server/auth/session.ts` (modify) | `VIEW_COOKIE`, `viewToken`, `setViewCookie`, `clearViewCookie`; export `isHttps`. |
| `server/auth/teacherAuth.ts` (modify) | Resolve the view after the login; 409 on a dead view. |
| `server/env.ts` (modify) | `Variables.viewing: ViewContext | null`. |
| `server/routes/impersonation.ts` (create) | Start handler, `impersonationRoutes()` (DELETE), `viewReadOnly`, `viewOnly`, `readOnlyError`. |
| `server/routes/admin.ts`, `server/routes/accounts.ts`, `server/routes/submissions.ts`, `server/db/results.ts` (modify) | Mount, `/me`, `/version`, result-link guard, `views` in account detail. |
| `shared/api.ts` (modify) | `VIEW_MODES`, `startViewBody`, `Viewing`, `MeAnswer`, `AccountView`, `ViewEndReason`, `AccountDetail.views`. |
| `shared/i18n/messages.ts` (modify) | English of the new API messages. |
| `src/admin/api.ts`, `src/test/fakeApi.ts` (modify) | `me()` returns `Me`; `startView`, `endView`; `onViewEnded`. |
| `src/admin/shell/viewing.ts` (create) | `viewPartOf`, `forgetAccountState`, `rememberViewedName`, `takeEndedName`, `goToSettings`. |
| `src/admin/shell/ViewingBar.tsx` (create) | The fixed bar with "Ieși". |
| `src/admin/shell/refresh.ts`, `src/admin/Layout.tsx`, `src/admin/shell/UserMenu.tsx`, `src/admin/shell/PhoneMenu.tsx` (modify) | Reload on view change, the bar, logout hidden. |
| `src/admin/settingsPage/ViewAsDialog.tsx` (create) | The password dialog. |
| `src/admin/settingsPage/AccountsSection.tsx`, `src/admin/pages/SettingsPage.tsx` (modify) | "Vezi ca {name}", the views on "Detalii", the ended notice. |
| `src/i18n/en/admin.ts` (modify) | English of the new texts. |
| `server/AGENTS.md`, `src/AGENTS.md` (modify) | One short paragraph each. |

---

### Task 1: The table and its queries

**Files:**
- Create: `migrations/0038_impersonations.sql`, `server/db/impersonations.ts`
- Modify: `server/db/accounts.ts` (export `TEACHER_COLUMNS`, `TeacherRow`, `toTeacher`), `shared/api.ts`
- Test: `server/db/impersonations.test.ts`

**Interfaces:**
- Produces (shared/api.ts):
  ```ts
  export const VIEW_MODES = ['view'] as const;            // 'act' joins later
  export type ViewMode = 'view' | 'act';
  export type ViewEndReason = 'exit' | 'expired' | 'replaced' | 'session_gone';
  export const startViewBody = z.object({ mode: z.enum(VIEW_MODES), password: z.string().min(1).max(200) });
  export interface Viewing { id: number; teacher: { id: number; name: string }; mode: ViewMode; expiresAt: string }
  export interface MeAnswer { teacher: Teacher; viewing: Viewing | null }
  export interface AccountView { admin: { id: number; name: string } | null; startedAt: string; endedAt: string | null; endReason: ViewEndReason | null }
  ```
- Produces (server/db/impersonations.ts):
  ```ts
  export const VIEW_MS = 3_600_000;
  export const VIEW_KEEP_DAYS = 365;
  export interface NewView { adminId: number; teacherId: number; sessionHash: string; tokenHash: string; mode: ViewMode }
  export interface FoundView { viewing: Viewing; teacher: Teacher; adminId: number }
  export function startView(db: D1Database, view: NewView, now: string): Promise<Viewing | null>;
  export function findView(db: D1Database, tokenHash: string, sessionHash: string, now: string): Promise<FoundView | null>;
  export function endView(db: D1Database, tokenHash: string, now: string): Promise<void>;        // end_reason 'exit'
  export function closeDeadView(db: D1Database, tokenHash: string, now: string): Promise<void>;  // 'expired' or 'session_gone'
  export function listAccountViews(db: D1Database, teacherId: number): Promise<AccountView[]>;  // newest first, at most 50
  ```

- [ ] **Step 1: Write the migration**

```sql
-- An administrator's read-only view of a teacher's account (Setări, "Vezi ca").
-- The row is also the log: no cascade from sessions, and a deleted account
-- leaves the row with a null id.
CREATE TABLE impersonations (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  session_hash TEXT NOT NULL,
  admin_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK (mode IN ('view', 'act')),
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ended_at TEXT,
  end_reason TEXT CHECK (end_reason IN ('exit', 'expired', 'replaced', 'session_gone'))
);

CREATE INDEX impersonations_by_teacher ON impersonations (teacher_id, started_at);
```

- [ ] **Step 2: Write the failing tests** in `server/db/impersonations.test.ts` (use `startTestApi()`; insert a session row for the admin directly: `INSERT INTO sessions (token_hash, teacher_id, created_at, expires_at)`; target from `api.addTeacher('ana@example.com', 'Ana Pop')`):
  - `startView makes a live view of an active teacher` → returns `{ teacher: { id: anaId, name: 'Ana Pop' }, mode: 'view', expiresAt: now + 1 h }`.
  - `startView refuses an admin, a closed, a pending account and a Quick Try guest` → `null` each, and no row (`SELECT COUNT(*) FROM impersonations` = 0). (Pending: `status = 'pending'`; guest: `quick_try = 1`; closed: `status = 'disabled'`.)
  - `startView refuses a caller who is not an active admin` → `null`.
  - `startView ends the older live view of the same session` → first row `end_reason = 'replaced'`, `ended_at = now`.
  - `startView deletes rows started more than 365 days ago` → an old row inserted by hand is gone.
  - `startView starts the admin's count of wrong passwords again` → `failed_logins = 3` before, 0 after.
  - `findView returns the teacher only for the same session` → a different `sessionHash` gives `null`.
  - `findView returns null when expired, ended, the session gone or expired, the admin demoted or closed, the teacher closed or made admin` (one `it.each` row per case).
  - `closeDeadView writes expired after the time, session_gone otherwise, and keeps an ended row as it was`.
  - `listAccountViews lists the newest first with the admin's name` and gives `admin: null` after the admin row's `admin_id` is set to NULL.

- [ ] **Step 3: Run to see them fail**

Run: `npm run test:related -- server/db/impersonations.ts`
Expected: FAIL (module `../db/impersonations.ts` not found).

- [ ] **Step 4: Implement `server/db/impersonations.ts`**

`startView` is called only after the password was checked as right, so its batch also starts the admin's count of wrong passwords again (`takePasswordCheck` raised it): `startView`: one `db.batch()` of (0) `UPDATE teachers SET failed_logins = 0, locked_until = NULL WHERE id = ?` (the admin), (a) `DELETE … WHERE started_at < now − 365 d`, (b) `UPDATE … SET ended_at = ?, end_reason = 'replaced' WHERE session_hash = ? AND ended_at IS NULL`, (c) `INSERT INTO impersonations (…) SELECT … FROM teachers a, teachers t WHERE a.id = ? AND a.role = 'admin' AND a.status = 'active' AND t.id = ? AND t.role = 'teacher' AND t.status = 'active' AND t.quick_try = 0 RETURNING id`. Returns `null` when (c) inserted nothing. `findView`: one query joining `impersonations i`, `sessions s ON s.token_hash = i.session_hash AND s.teacher_id = i.admin_id`, `teachers a ON a.id = i.admin_id`, `teachers t ON t.id = i.teacher_id`, selecting `${TEACHER_COLUMNS}` (alias `t`) and the view's columns, with every condition of the test list and `s.expires_at > now`, `i.expires_at > now`, `i.ended_at IS NULL`. `closeDeadView`: `UPDATE … SET ended_at = ?, end_reason = CASE WHEN expires_at <= ? THEN 'expired' ELSE 'session_gone' END WHERE token_hash = ? AND ended_at IS NULL`.

- [ ] **Step 5: Run to see them pass**

Run: `npm run test:related -- server/db/impersonations.ts` then `npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add migrations/0038_impersonations.sql server/db/impersonations.ts server/db/impersonations.test.ts server/db/accounts.ts shared/api.ts
git commit -m "Add the impersonations table and its queries"
```

---

### Task 2: Start, resolve and end a view

**Files:**
- Create: `server/routes/impersonation.ts`
- Modify: `server/auth/session.ts`, `server/auth/teacherAuth.ts`, `server/env.ts`, `server/routes/admin.ts`, `server/routes/accounts.ts`, `shared/i18n/messages.ts`
- Test: `server/routes/impersonation.test.ts`

**Interfaces:**
- Consumes: Task 1's `startView`, `findView`, `endView`, `closeDeadView`, `VIEW_MS`, `startViewBody`, `Viewing`, `MeAnswer`.
- Produces:
  - `server/env.ts`: `export interface ViewContext { viewing: Viewing; adminId: number; tokenHash: string }`; `Variables` gains `viewing: ViewContext | null`.
  - `server/auth/session.ts`: `export const VIEW_COOKIE = 'qe_view'`, `viewToken(c)`, `setViewCookie(c, token)`, `clearViewCookie(c)`; `isHttps` exported.
  - `server/routes/impersonation.ts`: `startViewHandler: Handler<AppEnv>` (mounted as `POST /api/admin/accounts/:id/impersonation`), `impersonationRoutes(): Hono<AppEnv>` (mounted at `/api/admin/impersonation`, `DELETE /`).
  - `GET /api/admin/me` → `MeAnswer`. `GET /api/admin/version` → `{ version }` where a live view appends `|v<id>` as a 4th part.
  - Error codes: `409 impersonation_ended`, `409 cannot_view`, `400 view_needs_login`, `400 wrong_password`, `429 too_many_tries`.

- [ ] **Step 1: Write the failing tests** in `server/routes/impersonation.test.ts`, with `startTestApi({ env: { DEV_TEACHER_EMAIL: undefined } })`, a password for `profesor@example.com` (the admin, as `setPasswordOf` in `server/routes/auth.test.ts`), a real login for the session cookie, and the teacher from `otherTeacherTest(api, 'ana@example.com')` (her test `9Z-26T1`). Helper `cookies(res, ...names)` joins `name=value` parts for the `Cookie` header.
  - `starts a view and reads the teacher's data`: POST → 201 `{ viewing: { teacher: { id: anaId, name: 'Alt Profesor' }, mode: 'view' } }`; its `Set-Cookie` matches `/^qe_view=[A-Za-z0-9_-]{43};/` and contains `Max-Age=7200`, `Path=/api/admin`, `HttpOnly` and `SameSite=Strict` (the style of the login test in `server/routes/auth.test.ts`); `GET /api/admin/me` with both cookies → `teacher.id === anaId`, `viewing.teacher.id === anaId`; `GET /api/admin/tests/9Z-26T1` → 200 (404 without `qe_view`).
  - `without the view cookie nothing changes`: `/me` → `teacher.email === 'profesor@example.com'`, `viewing === null`.
  - `refuses a wrong password` → 400 `wrong_password`, no row.
  - `counts wrong passwords and stops at the limit` → after the limit, 429 `too_many_tries`.
  - `refuses a teacher who is not an admin` → Ana logs in, POST → 403 `admin_only`.
  - `refuses an account that cannot be viewed` (admin, closed, pending, own account) → 409 `cannot_view`.
  - `refuses the development login`: a second `startTestApi()` with the default `DEV_TEACHER_EMAIL` → 400 `view_needs_login`.
  - `refuses to start a view while viewing` → status 403 only (Task 2 refuses it with `admin_only`; after Task 3 `viewReadOnly` refuses it first with `impersonation_read_only`; assert the status, not the code).
  - `good starts do not lock the account` → ten successful starts in a row (each without the older `qe_view`), then an eleventh → 201; `teachers.failed_logins` of the admin is 0.
  - `ends the view on exit`: `DELETE /api/admin/impersonation` → 200 `{ ended: true }`, `Set-Cookie` clears `qe_view` with `Path=/api/admin`; row `end_reason = 'exit'`; the old cookie then → 409 `impersonation_ended`.
  - `ends after one hour`: set `expires_at` in the past → `/me` → 409 `impersonation_ended`, the answer clears `qe_view`, row `end_reason = 'expired'`.
  - `ends with the admin's login`: `POST /api/auth/logout`, log in again, old `qe_view` → 409, row `end_reason = 'session_gone'`.
  - `ends when the admin is no longer an admin` and `ends when the teacher's account closes` → 409.
  - `version carries the view`: without a view `version.split('|')` has 3 parts; with a view its 4th part is `v<id>`.
  - `answers the end of a view in English` → with `X-MQ-Lang: en`, the 409 message is `'The account view has ended.'`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run server/routes/impersonation.test.ts`
Expected: FAIL (404 on the new routes).

- [ ] **Step 3: Implement the cookie functions** in `server/auth/session.ts` (same shape as `setSessionCookie`, with the values of Global Constraints).

- [ ] **Step 4: Resolve the view in `teacherAuth()`**

After `const real = await loggedInTeacher(c)`: `c.set('viewing', null)`; no `qe_view` → `c.set('teacher', real)`. With it: no `sessionToken(c)` (development login) or `findView(…)` null → `closeDeadView`, `clearViewCookie`, throw `new ApiError(409, 'impersonation_ended', 'Vizualizarea contului s-a încheiat.')`. Found → `c.set('teacher', found.teacher)`, `c.set('viewing', { viewing: found.viewing, adminId: found.adminId, tokenHash })`.

- [ ] **Step 5: Implement the routes**

`startViewHandler`: no `sessionToken(c)` → 400 `view_needs_login` 'Vizualizarea are nevoie de intrarea cu parola.'; `readJson(c, startViewBody, 4096)`; `takePasswordCheck(db, c.var.teacher.id, now)` false → 429 with the existing Romanian message of `routes/accounts.ts`; `verifyPassword` false → 400 `wrong_password` 'Parola ta nu este corectă.'; `startView(…)` null → 409 `cannot_view` 'Poți vedea doar contul activ al unui profesor.'; else `setViewCookie`, `201 { viewing }`. Mount it in `accountRoutes()` after `adminOnly`: `routes.post('/:id/impersonation', startViewHandler)` (id through `parseId`). `impersonationRoutes()`: `DELETE /` → `endView` when `c.var.viewing`, always `clearViewCookie`, `{ ended: true }`; mount in `adminRoutes()` with `routes.route('/impersonation', impersonationRoutes())`. In `admin.ts`, `/me` answers `{ teacher, viewing: c.var.viewing?.viewing ?? null } satisfies MeAnswer`, and `/version` appends `|v${id}` when viewing.

- [ ] **Step 6: Add the English** of the four new messages to `shared/i18n/messages.ts`: 'The account view has ended.', 'Viewing needs a login with a password.', 'Your password is not correct.', 'You can only view an active teacher account.'

- [ ] **Step 7: Run to see them pass**

Run: `npx vitest run server/routes/impersonation.test.ts server/routes/auth.test.ts server/routes/accounts.test.ts scripts/i18n/messages.test.ts` then `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/auth/session.ts server/auth/teacherAuth.ts server/env.ts server/routes/impersonation.ts server/routes/impersonation.test.ts server/routes/admin.ts server/routes/accounts.ts shared/i18n/messages.ts
git commit -m "Let an administrator start, use and end a view of a teacher's account"
```

---

### Task 3: Read only

**Files:**
- Modify: `server/routes/impersonation.ts`, `server/routes/admin.ts`, `server/routes/submissions.ts`, `server/db/results.ts`, `shared/i18n/messages.ts`
- Test: `server/routes/impersonationReadOnly.test.ts`

**Interfaces:**
- Consumes: Task 2's `ViewContext`, the test helpers of Task 2 (copy the small helpers; do not import across test files).
- Produces: `viewReadOnly: MiddlewareHandler<AppEnv>`, `viewOnly(c): boolean` (true in `'view'` mode), `readOnlyError(): ApiError` (403 `impersonation_read_only`, 'Doar citire: nu poți schimba nimic în contul altui profesor.'); `teacherResultToken(db, shown, options?: { create?: boolean })` (default `create: true`).

- [ ] **Step 1: Write the failing tests**
  - `refuses every write method while viewing` (`it.each` of POST `/api/admin/classes`, PATCH `/api/admin/tests/9Z-26T1`, PUT `/api/admin/accounts/1/marking-scheme-notes` (the refusal comes before routing, so the path only has to exist under `/api/admin`), DELETE `/api/admin/tests/9Z-26T1`) → 403 `impersonation_read_only`; the tests and classes rows of the teacher are unchanged.
  - `lets reads through` → `GET /api/admin/tests?year=2026` 200 with the teacher's test.
  - `lets the exit through` → `DELETE /api/admin/impersonation` 200.
  - `refuses the teacher's password change without counting a try` → `POST /api/admin/account/password` 403; the teacher's `teachers.failed_logins` unchanged.
  - `answers the refusal in English` → `'Read only: you cannot change anything in another teacher\'s account.'`.
  - `result link: gives an existing link and refuses to make one` → with `result_token` NULL: 403 and the row stays NULL; with a token: 200 and the same token. Without a view the old behaviour stays (a link is made).

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run server/routes/impersonationReadOnly.test.ts`
Expected: FAIL (writes pass, link is made).

- [ ] **Step 3: Implement** `viewReadOnly` (refuse when `viewOnly(c)` and the method is not GET/HEAD, except `DELETE` on `/api/admin/impersonation`); put it in `adminRoutes()`'s chain right after `teacherAuth()`. In the result-link route pass `{ create: !viewOnly(c) }` and throw `readOnlyError()` on a null token while viewing.

- [ ] **Step 4: Check the other GET handlers for writes**

Run: `rg -n "routes\.get\(" server/routes` and read each handler that calls a `server/db` function whose SQL has INSERT, UPDATE or DELETE.
Expected: only `GET /submissions/:id/result-link` writes. If another one does, guard it the same way and add its test here; name it in the PR description.

- [ ] **Step 5: Run to see them pass**

Run: `npm run test:server` then `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/impersonation.ts server/routes/admin.ts server/routes/submissions.ts server/db/results.ts server/routes/impersonationReadOnly.test.ts shared/i18n/messages.ts
git commit -m "Keep a teacher's account read only while an administrator views it"
```

---

### Task 4: The views on "Detalii"

**Files:**
- Modify: `shared/api.ts` (`AccountDetail.views: AccountView[]`), `server/routes/accounts.ts` (`GET /:id` adds `listAccountViews`), `src/admin/settingsPage/AccountsSection.tsx` (`AccountDetailView`), `src/i18n/en/admin.ts`, `src/test/fakeApi.ts`
- Test: `server/routes/accounts.test.ts`, `src/admin/settingsPage/AccountsSection.test.tsx`

**Interfaces:**
- Consumes: Task 1's `listAccountViews`, `AccountView`.

- [ ] **Step 1: Write the failing tests**
  - server: `GET /api/admin/accounts/:id lists the administrators' views` → `views[0]` = `{ admin: { name: 'Laura Miron' }, startedAt, endedAt, endReason: 'exit' }` for a row inserted by hand.
  - web: `Detalii shows the administrators' views` → heading "Vizualizări de administrator", the admin's name, the start time, and "Ieșit"; a live view shows "în curs". In English: "Administrator views", "Exited", "in progress".
  - web: `Detalii shows no views part when there are none`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run server/routes/accounts.test.ts src/admin/settingsPage/AccountsSection.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement.** A small table after the history, columns "Administrator", "Început", "Sfârșit" (date and time through `locale()`, Europe/Bucharest), "Cum s-a încheiat" with: `exit` "Ieșit", `expired` "Timpul s-a terminat", `replaced` "Înlocuit de altă vizualizare", `session_gone` "Intrarea s-a încheiat", none "în curs". A null admin shows "—". English in `src/i18n/en/admin.ts`: 'Administrator views', 'Administrator', 'Started', 'Ended', 'How it ended', 'Exited', 'Time ran out', 'Replaced by another view', 'Login ended', 'in progress'.

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run server/routes/accounts.test.ts src/admin/settingsPage/AccountsSection.test.tsx scripts/i18n` then `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/api.ts server/routes/accounts.ts server/routes/accounts.test.ts src/admin/settingsPage/AccountsSection.tsx src/admin/settingsPage/AccountsSection.test.tsx src/i18n/en/admin.ts src/test/fakeApi.ts
git commit -m "Show the administrators' views of an account on Detalii"
```

---

### Task 5: The client while viewing

**Files:**
- Create: `src/admin/shell/viewing.ts`, `src/admin/shell/ViewingBar.tsx`
- Modify: `src/admin/api.ts`, `src/test/fakeApi.ts`, `src/admin/shell/refresh.ts`, `src/admin/Layout.tsx`, `src/admin/shell/UserMenu.tsx`, `src/admin/shell/PhoneMenu.tsx`, `src/ui/brand.css` (where `.topbar` is styled), `src/i18n/en/admin.ts`
- Test: `src/admin/shell/viewing.test.ts`, `src/admin/shell/ViewingBar.test.tsx`, `src/admin/api.test.ts`, `src/admin/Layout.test.tsx`

**Interfaces:**
- Consumes: Task 1's `Viewing`, `MeAnswer`; Task 2's routes and `409 impersonation_ended`.
- Produces:
  - `src/admin/api.ts`: `export interface Me extends Teacher { viewing: Viewing | null }`; `me(): Promise<Me>`; `startView(accountId: number, password: string): Promise<Viewing>`; `endView(): Promise<void>`; `ApiClientOptions.onViewEnded?: () => void` (default `goToSettings`), called by `request` when an answer is `409` with code `impersonation_ended`, before the error is thrown.
  - `src/admin/shell/viewing.ts`: `viewPartOf(version: string): string` (4th `|` part or `''`); `forgetAccountState(): void` (removes `quickeval:lastClass`); `rememberViewedName(name: string): void` and `takeEndedName(): string | null` (sessionStorage `quickeval.viewing` / `quickeval.viewEnded`); `goToSettings(ended: boolean): void` (on `ended`, moves the remembered name to `quickeval.viewEnded`; `forgetAccountState()`; `window.location.assign('/teacher/settings')`).
  - `useDataVersion(enabled: boolean, reload: () => void = () => window.location.reload())`.
  - `<ViewingBar viewing={Viewing} />`.

- [ ] **Step 1: Write the failing tests**
  - `viewPartOf` → `'3||'` gives `''`, `'3|||v12'` gives `'v12'`.
  - api: `calls onViewEnded on 409 impersonation_ended and still throws` (fake `fetchImpl`); `me returns the viewing`.
  - refresh: `reloads when the view part of the version changes` (version `'3||'` then `'3|||v7'` → `reload` called once, no invalidate); `reloads even right after a save` (a mutation succeeds, so `adopt` is set, and the next version brings a new view part → `reload` called); `refreshes as before when only the data part changes`.
  - ViewingBar: `remembers the viewed name when it shows` (sessionStorage `quickeval.viewing` = the name, so a tab that did not start the view still shows the ended notice with the name).
  - ViewingBar: `shows the teacher's name, read only and the end time` → "Vezi contul lui Ana Pop · doar citire · până la 14:32" for `expiresAt: '2026-11-25T12:32:00.000Z'`; `Ieși ends the view and goes to Setări` (fake `endView` called, `goToSettings(false)` called; also when `endView` fails); English: "Viewing Ana Pop's account · read only · until 14:32", "Exit".
  - Layout: `shows the bar and hides Ieși din cont while viewing` (UserMenu and PhoneMenu); `no bar without a view`; the Setări link stays hidden (the viewed teacher is not an admin).

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/admin/shell src/admin/api.test.ts src/admin/Layout.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement.** In `useDataVersion`, compare `viewPartOf(seen)` with `viewPartOf(current)` first, before the `adopt` branch, and call `reload()` when they differ (with `seen` already set). `ViewingBar` calls `rememberViewedName(viewing.teacher.name)` when it mounts. The bar is the shell's first child, above `.topbar`, in the accent field with the ink that passes contrast on it, on the desktop and the phone layout; it follows the teacher app's house rules (no shadow, no gradient, no pill). `UserMenu` and `PhoneMenu` take `viewing: boolean` and leave out "Ieși din cont" when true. Texts: 'Vezi contul lui {name} · doar citire · până la {time}', 'Ieși' with their English.

- [ ] **Step 4: Run to see them pass**

Run: `npm run test:web` then `npm run typecheck`
Expected: PASS (the i18n scan included).

- [ ] **Step 5: Commit**

```bash
git add src/admin/shell/viewing.ts src/admin/shell/viewing.test.ts src/admin/shell/ViewingBar.tsx src/admin/shell/ViewingBar.test.tsx src/admin/api.ts src/admin/api.test.ts src/test/fakeApi.ts src/admin/shell/refresh.ts src/admin/Layout.tsx src/admin/Layout.test.tsx src/admin/shell/UserMenu.tsx src/admin/shell/PhoneMenu.tsx src/i18n/en/admin.ts
git add src/ui/brand.css
git commit -m "Show the view's bar in the teacher app and leave it with Ieși"
```

---

### Task 6: "Vezi ca {name}" on Setări

**Files:**
- Create: `src/admin/settingsPage/ViewAsDialog.tsx`
- Modify: `src/admin/settingsPage/AccountsSection.tsx` (`AccountMenu`), `src/admin/pages/SettingsPage.tsx` (the ended notice), `src/i18n/en/admin.ts`
- Test: `src/admin/settingsPage/AccountsSection.test.tsx`, `src/admin/pages/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: Task 5's `api.startView`, `rememberViewedName`, `forgetAccountState`, `takeEndedName`; the existing `Modal`.
- Produces: `<ViewAsDialog account={Account} onClose={() => void} returnFocus={RefObject<HTMLElement | null>} />`.

- [ ] **Step 1: Write the failing tests**
  - `the menu of an active teacher has Vezi ca {name}`; `a closed account's menu has no Vezi ca`.
  - `Vezi ca asks the password and opens the account` → the dialog's title "Vezi contul lui Ana Pop", text "Ca să vezi contul lui Ana Pop, scrie parola ta.", a password field labelled "Parola ta"; submit calls `startView(anaId, 'parola')`, then `window.location.assign('/teacher/')` (stub it), with `quickeval.viewing = 'Ana Pop'` in sessionStorage and `quickeval:lastClass` removed.
  - `a wrong password shows the API's message and keeps the dialog open`.
  - `Setări shows that a view ended` → with `quickeval.viewEnded = 'Ana Pop'`: "Vizualizarea contului lui Ana Pop s-a încheiat." once; the key is removed.
  - English of each: "View as Ana Pop", "View Ana Pop's account", "To view Ana Pop's account, type your password.", "Your password", "View the account", "The view of Ana Pop's account has ended."

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/admin/settingsPage src/admin/pages/SettingsPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement.** The item is the last of `AccountMenu` (after "Închide contul"), shown when the account is active, with `<ActionIcon name="eye" />`. The dialog: one password field (`autoComplete="current-password"`), a submit "Vezi contul" and "Renunță" (reuse the existing key if `t()` has it). The notice is a `role="status"` paragraph at the top of Setări.

- [ ] **Step 4: Run to see them pass**

Run: `npm run test:web` then `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/admin/settingsPage/ViewAsDialog.tsx src/admin/settingsPage/AccountsSection.tsx src/admin/settingsPage/AccountsSection.test.tsx src/admin/pages/SettingsPage.tsx src/admin/pages/SettingsPage.test.tsx src/i18n/en/admin.ts
git commit -m "Add Vezi ca to a teacher's menu on Setări"
```

---

### Task 7: Docs, the whole suite, the browser

**Files:**
- Modify: `server/AGENTS.md` (a short "View as a teacher" paragraph: the table, the cookie, the swap only in `teacherAuth`, read only by method, a GET that writes needs its own guard, `act` mode needs an allow-list), `src/AGENTS.md` (one line: `Me.viewing`, the bar, the reload on the view part of the version).

- [ ] **Step 1: Write the two paragraphs.**

- [ ] **Step 2: Run the whole suite**

Run: `npm test` then `npm run build`
Expected: every project PASS; the build writes `dist/`.

- [ ] **Step 3: Check it in the browser** with the local database (`npm run db:local`, then the `api` and `web` preview servers, with `DEV_TEACHER_EMAIL` unset in `.dev.vars` for this check so the real login is used; give the local admin a password with `npm run set-password -- <local admin email> --local`). Add a second local teacher with a class. Check: the menu item, the dialog, the bar on desktop and at 375 px, a refused write shows the read-only message, "Ieși" returns to Setări, the Detalii list, the English page. Put `DEV_TEACHER_EMAIL` back afterwards.

Expected: all as described; screenshots of the bar (desktop and phone), the menu and the dialog, in Romanian and English, sent to the user.

- [ ] **Step 4: Commit**

```bash
git add server/AGENTS.md src/AGENTS.md
git commit -m "Document the administrator's view of a teacher's account"
```

- [ ] **Step 5: Before merging,** the user runs the migration on the live database: `npx wrangler d1 migrations apply quickeval --remote` (from this worktree's folder).

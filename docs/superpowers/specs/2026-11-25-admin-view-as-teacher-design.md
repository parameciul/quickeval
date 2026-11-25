# An administrator views the app as a teacher ("Vezi ca")

## Why

An administrator opens a teacher's account and sees the teacher app as that
teacher sees it, to:

- judge the teacher's experience,
- reproduce and fix bugs on the teacher's own data,
- check how accurate the gradings of the teacher's tests are.

## Goals

- An administrator starts a view of one teacher's account, sees every page of
  the teacher app with that teacher's data, and ends the view.
- Phase 1 is **read only** (mode `view`): the API refuses every change.
- The API and the table are ready for a later **full mode** (mode `act`)
  without a new table or new routes.
- The option is not very visible: it is a menu item on the admin-only Setări
  page.

## Non-goals

- Full mode (`act`). Only its place in the design is set here (see "Later:
  full mode").
- Telling the teacher. For now only the administrators' log records a view.
- Viewing an administrator's account, a closed account, a pending account or a
  Quick Try guest.
- Viewing the student pages (`/u/<token>`): they need no login.

## Anti-goals (a failure even if it works)

- A view that changes the teacher's data, starts robot work, uses the
  teacher's limits or counters, or sends an email as the teacher.
- A view that outlives the administrator's login, or reaches the teacher's
  data from a tab that does not show the banner.
- A page that shows one account's data under the other account's pages.
- Any change to the regular login API (`/api/auth/login`, `/session`,
  `/logout`) or to the `sessions` table.

## Constraints

- The owner's rule: the regular login API and `sessions` do not change. The
  view uses its own admin-only API, its own table and its own cookie.
- Project rules (`AGENTS.md`, `server/AGENTS.md`): rules checked inside the
  SQL write, ids through `parseId`, at most 15 D1 queries and 10 ms of CPU per
  request, English addresses, every visible text in Romanian and English,
  times as ISO UTC strings.
- The new migration runs on the live database before the code reaches `main`.

## Approaches considered

1. **A new column on `sessions`** (the admin's session points at the teacher).
   Smallest code, but it changes `sessions` and the login path. Refused by the
   owner's rule.
2. **A separate table and a separate cookie, resolved in `teacherAuth`**
   (picked). Login stays as it is; the view is an extra layer that applies only
   when an administrator's live session carries a live view.
3. **Log in as the teacher** (a real teacher session made for the
   administrator). It loses who is really acting, ends the administrator's own
   session, and cannot be limited to reads. Rejected.

## The design

### Where the administrator starts it

Setări → Conturi → "Toate conturile". Each teacher row already has the "⋯"
menu (`AccountMenu` in `src/admin/settingsPage/AccountsSection.tsx`). It gets a
last item, **"Vezi ca {name}"**, shown only for active teacher accounts.

Choosing it opens a small dialog that asks for the administrator's own
password again ("Ca să vezi contul lui {name}, scrie parola ta."). A stolen
admin session alone therefore cannot open students' papers. On success the
page does a full navigation to `/teacher/`.

### What the administrator sees

The normal teacher app with the teacher's data, and one bar fixed above the
app's own bar:

```
┌───────────────────────────────────────────────────────────────┐
│ Vezi contul lui Ana Pop · doar citire · până la 14:32 [Ieși din vizualizare] │
└───────────────────────────────────────────────────────────────┘
```

- The bar is in the accent colour so it is never mistaken for the normal app,
  and it stays on every page and on the phone layout.
- The pages and their buttons look as the teacher sees them. A button that
  changes something gets the API's refusal, shown like any other error:
  "Doar citire: nu poți schimba nimic în contul altui profesor."
- "Ieși din cont" in the user menu and the phone menu is hidden while viewing,
  so "Ieși din vizualizare" (English "Exit") on the bar is the one way out.

### How the administrator exits

1. **"Ieși din vizualizare" on the bar** (English "Exit"; the key "Ieși" already means "Sign out") (the normal way): `DELETE /api/admin/impersonation`,
   then a full navigation to `/teacher/settings`, as the administrator.
2. **The time runs out** (1 hour after the start): the next request answers
   409 `impersonation_ended` and clears the view cookie; the page does a full
   navigation to `/teacher/settings` and shows "Vizualizarea contului lui
   {name} s-a încheiat."
3. **The administrator's login ends** (logout from another tab, a password
   change, the account closed or no longer an administrator): the view is
   bound to that login, so it ends with it, with the same 409. When the
   login itself is gone (logout, a password change from another device), that
   tab first gets the usual 401 and the login form; the next login in that
   browser then gets the 409 and the notice.
4. **The teacher's account closes** (or stops being a plain teacher) during
   the view: the same 409.

Whatever way it ends, the page never falls back silently to the
administrator's own data under the teacher's pages.

### API

All under `/api/admin`, so `promoteDue`, `sameOriginWrites` and the teacher
auth run as for every admin route.

| Call | Who | What |
|---|---|---|
| `POST /api/admin/accounts/:id/impersonation`, body `{ mode: 'view', password }` | an administrator, not viewing | Checks the password (`takePasswordCheck`, as on Contul meu), ends any older view of this session, makes the row, sets the cookie. Body schema in `shared/api.ts`; zod accepts only `'view'` for now. |
| `DELETE /api/admin/impersonation` | the real administrator of the current view | Ends it (`ended_at`, `end_reason = 'exit'`), clears the cookie. |

There is no separate status route. The view's state (viewed teacher's id and
name, mode, `expiresAt`) comes back in the shell's existing data:

- `GET /api/admin/me` (the `['me']` query) carries `viewing: { teacher, mode,
  expiresAt } | null`. The bar reads it.
- `GET /api/admin/version` (polled every minute) includes the view's id in its
  version string. A tab whose version changes because a view started or ended
  in another tab does a full reload instead of a normal refresh (or goes to
  Setări when its view ended), so no tab mixes the two accounts' data.
- Each tab also sends the view it shows in an `X-MQ-View: <id>|none` header
  (none before its first `/me`). A request that names a view which is no
  longer this request's live view answers 409 `impersonation_ended` at once,
  so a tab never waits for the next version check to learn that its view
  ended in another tab. Plain links and images cannot send it: a missing
  header claims nothing.

Both exist today (`server/routes/admin.ts`, `server/db/version.ts`, which
already returns a string); only their answers grow. A full reload on a version
change applies only when the view part of the string changed; other changes
keep the normal refresh.

The start and end routes must not use `adminOnly`: while viewing,
`c.var.teacher` is the teacher. The end route checks `c.var.impersonator`. The
start route is refused while a view is live (no chained views).

### Table (new migration)

```sql
CREATE TABLE impersonations (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,      -- SHA-256 of the view cookie
  session_hash TEXT NOT NULL,           -- SHA-256 of the admin's qe_session
  admin_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK (mode IN ('view', 'act')),
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ended_at TEXT,
  end_reason TEXT CHECK (end_reason IN ('exit', 'expired', 'replaced', 'session_gone'))
);
```

- No `ON DELETE CASCADE` and no foreign key to `sessions`: the row is also the
  audit log and must survive a deleted session or account.
- The start's INSERT checks its own rules in its SQL: the target is
  `role = 'teacher' AND status = 'active'` and not a Quick Try guest; the
  caller is an active administrator. The UI's check is only a convenience.
- Rows are kept 12 months; each new start deletes the older rows in its own
  batch.

### Cookie and token

- Name `qe_view`, `Path=/api/admin`, `HttpOnly`, `Secure` on HTTPS (as the
  session cookie), `SameSite=Strict`, `Max-Age=7200`: twice the view's hour, so the browser still sends the cookie when the view expires and the server answers `impersonation_ended`.
- The token comes from `newSessionToken()` (256 bits) and only its SHA-256 is
  stored. The server enforces `expires_at`; the cookie's lifetime is only a
  courtesy.

### How a request finds its teacher

In `teacherAuth` only, never in `loggedInTeacher` (so `optionalTeacher`,
Quick Try's admin check and `/api/auth/session` keep seeing the real person):

1. Find the real account from `qe_session` as today.
2. No `qe_view` cookie: nothing changes, no extra query.
3. With `qe_view`: one query joins `impersonations`, `sessions` and both
   `teachers` rows and returns the viewed teacher only if the row is not
   ended, not expired, its `session_hash` is this request's session, the
   administrator is still an active administrator, and the viewed account is
   still an active plain teacher.
4. Found: `c.var.teacher` = the viewed teacher; `c.var.impersonator` = the
   administrator's id; `c.var.viewMode` = the row's mode.
5. Not found: 409 `impersonation_ended`, clear the cookie. (The row's
   `ended_at` and `end_reason` are written then, `'expired'` or
   `'session_gone'`, when they are still empty.)

### Read only in `view` mode

- A middleware right after the auth refuses every request whose method is not
  GET or HEAD, except `DELETE /api/admin/impersonation`, with 403
  `impersonation_read_only`.
- GETs that write are handled one by one. The one known today:
  `GET /api/admin/submissions/:id/result-link` makes a lasting student result
  link when none exists (`teacherResultToken`, `server/db/results.ts`). In
  `view` mode it returns an existing link only, otherwise 403
  `impersonation_read_only`. The builder greps every GET handler for writes
  and lists what it found in the PR.
- `promoteDue` writes for every request and is not the teacher's action; it
  stays.

### Log

The row records start, end, how it ended and the mode. File downloads during a
view are not logged one by one in phase 1 (one write per request is too
costly); the row says who could see what and when. The teacher is not told.

On "Detalii" of an account (Setări), a short list "Vizualizări de
administrator" shows who viewed the account, when, and for how long.

### Client

- Start and every exit are full navigations (as `useLogout` does with
  `window.location.assign`), which drops the whole query cache.
- `localStorage` keys that hold one account's ids (for example
  `quickeval:lastClass`) are cleared at start and at exit.
- New texts go through `t()` with English in `src/i18n/en/`; the API's new
  messages get their English in `shared/i18n/messages.ts`.

### Development

The `DEV_TEACHER_EMAIL` localhost path has no session, so it cannot bind a
view. The start route refuses there with a clear message; tests of the view use
a real login, as `server/routes/auth.test.ts` does.

## Later: full mode (`act`)

Set now so phase 1 does not block it; not built now.

- zod accepts `'act'`; the read-only middleware lets an `act` view through to
  an **allow-list** of routes (the pattern of `ALLOWED` in
  `server/routes/quickTry.ts`), never a deny-list.
- Never allowed in any mode: password and email changes, payments, account
  changes, Setări.
- Writes in `act` mode also need a per-tab header naming the view's id, so a
  tab opened before the view cannot write into the teacher's account.
- Every write records the administrator as its author (an `acted_by` value in
  place of the teacher's id where the code writes `changed_by` or
  `byTeacherId`), and robot work started in `act` mode does not use the
  teacher's demo limits.

## Left to the builder

- The exact migration number, file names and component names.
- Where the bar sits in the shell's markup and its exact styling (accent
  field, house rules of the teacher app).
- The dialog's layout.
- The list of other GETs that write, if any, and how each is kept read-only.
- Tests: start (admin, wrong password, non-admin, admin target, closed target,
  while viewing), requests while viewing (reads pass with the teacher's data,
  writes refused, the result link), every way of ending (exit, expiry, logout,
  password change, admin demoted, teacher closed), two tabs, the cookie's
  attributes, and both languages of every new text.

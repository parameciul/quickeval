# Usage statistics and more visit counts

Date: 2026-11-18. Two parts: A, a "Statistici" tab in Setări (robot work per day); B, more pages counted by Rybbit. Build A first, then B.

## Why

The administrator does not know today how much MQGrader is used day by day: how many papers the robot grades for Quick Try and for teachers, how many barems it generates, and what that costs in tokens. Setări shows only each account's totals (`teachers.papers_graded`, `barems_generated`, ..., and `robot_work` per account). The Quick Try rows vanish after 7 days with their guest teacher (`robot_work.teacher_id` cascades). The administrator also wants to see, in Rybbit, who reaches the login page, asks for an account, uses Quick Try, and opens a student test link or result link.

Goals:

- Count every robot job per teacher per Bucharest day, kept for ever, Quick Try included.
- An administrator picks a source and a period, presses a button and sees the numbers.
- Rybbit counts the login screen, `#new-account`, the Quick Try pages and the student pages, without ever sending a token.

Non-goals (for now):

- A per-teacher daily view. The data is stored per teacher so it can be added later with no migration.
- Counting the teacher app's pages after login.

Anti-goals (a failure even if it works):

- A token (upload, result, Quick Try) reaches Rybbit in a path, a query string or a referrer.
- The stats read data on a timer, or a year view reads thousands of rows.
- A student page says or shows anything about how the work is graded.

## Approaches considered

Storage (part A):

1. **Daily rows per teacher (picked by the user).** One row per teacher (or Quick Try) per day with the day's counts. Totals now; a per-teacher view later from the same rows.
2. Daily totals only. Slightly simpler, but a later per-teacher view has no history.
3. No new table, read `robot_work` each time. Quick Try rows are gone after 7 days, and a year view reads many rows from the D1 daily read budget.

Visits (part B):

1. **Rybbit page views with masked paths (picked by the user).** Full visitor picture (source, device, country, the path from the landing page to a try); tokens masked and no referrer sent.
2. Count link opens on the server, in the Statistici tab. Safer for tokens, but no visitor picture.

## Part A: the Statistici tab

### What is counted

Per day and per teacher (all accounts count, administrators included), from the robot's own log (`logRobotWork` in `server/db/runner.ts`, every kind in `robot_work.kind`):

| Kind | Column on screen | Tokens |
|---|---|---|
| `grading` (one paper) | Lucrări | yes |
| `barem` | Bareme | yes |
| `exercise_list` | Liste | yes |
| `analysis` | Analize | yes |
| `print` (print PDF with QR code) | Tipar | no (made without Claude) |

- A job counts in its column only when it worked (`ok = 1`). A regrade counts again, like `papers_graded`. The class and CES variants count once each.
- **Eșuate** (failed): every job with `ok = 0`, all kinds together. It costs robot time.
- **Tokeni**: the sum of the tokens Claude reported for the day's jobs.
- **Încercări** (Quick Try only): a try counts when it is created (the first INSERT of `createQuickTry`), whether or not it is ever graded. A failed try that is deleted at once still counts (it was a real attempt). An administrator's try counts too.
- A day is a Bucharest day (`Europe/Bucharest`, the same day as the Quick Try daily limit; there is a helper in `shared/quickTry.ts`).

### Storage

A new migration (the next number) adds one table, for example `usage_days`:

- `day` (TEXT, `YYYY-MM-DD`, Bucharest), `teacher_id` (INTEGER, **no foreign key**: the history stays when an account is refused or deleted), `quick_try` (0 or 1).
- One row per teacher per day; all Quick Try work of a day goes in one row with `quick_try = 1` and `teacher_id` NULL (the guest teachers are deleted after 7 days, so they are not kept apart). Unique on (`day`, `quick_try`, `teacher_id`); the builder handles the NULL in the key (for example `teacher_id` 0 for Quick Try).
- Counter columns: `papers`, `barems`, `exercise_lists`, `analyses`, `prints`, `failed`, `tokens`, `tries`, all INTEGER NOT NULL DEFAULT 0.
- An index that serves "rows from day X on" (the stats query).

Writing: every `logRobotWork` call also adds to that day's row (an upsert, `INSERT ... ON CONFLICT DO UPDATE`), in the same `db.batch()` as the `robot_work` INSERT. The day comes from JS (SQLite has no time zones). The teacher and the `quick_try` flag come from the test row in the SQL, as `logRobotWork` already does. `createQuickTry` adds 1 to `tries` in the batch of its first INSERT, only when that INSERT made the try.

The live D1 gets migration 0035 before the code, and the code follows at once: robot work done between the two (minutes) is in `robot_work` but not in `usage_days`, a gap that is accepted.

Past data, in the migration: teacher rows from `robot_work` (it starts at migration 0030), Quick Try rows from the `robot_work` of the guest teachers that still exist and their `teachers.created_at` (tries). Older Quick Try days stay empty. The migration turns UTC times into Bucharest days with a fixed `+2 hours`: every row is from after 25 October 2026, when Bucharest is UTC+2. The live D1 gets this migration before the code (`docs/deploy.md`).

### API

`GET /api/admin/stats?source=all|quick-try|teachers&period=7d|30d|12m`, administrators only (`adminOnly`), behind `promoteDue` like the rest of `/api/admin`.

- `7d`: the last 7 Bucharest days, today included; one entry per day, days with no work as zeros.
- `30d`: the last 30 days, one entry per day.
- `12m`: the last 12 calendar months, this month included; one entry per month.
- The answer has the totals of the period and the list of days or months, the newest first (`UsageStats` in `shared/usage.ts`). `tries` is always in it, 0 for `teachers`.
- One query, summing the rows in SQL (`GROUP BY day` or by month). At most a few thousand small rows a year.
- English names in the address and its values (the project rule).

### The screen

A new tab "Statistici" in Setări (administrators only, like the others; its `?tab=` value is English, for example `stats`).

```
Sursa: (•) Toate ( ) Teste rapide ( ) Profesori
Perioada: [Ultimele 7 zile ▾]   [Generează]

 Lucrări 142 · Bareme 9 · Liste 6 · Analize 4
 Tipar 5 · Eșuate 2 · Tokeni 3,1 mil. · Încercări 12

 Zi      Lucrări Bareme Liste Analize Tipar Eșuate Tokeni
 18 nov     31     2     1      1      1     0    640k
 ...
```

- Period choices: "Ultimele 7 zile", "Ultima lună" (30 days), "Ultimul an" (12 months).
- Nothing loads until the administrator presses "Generează"; no reading on a timer, and the shell's version refresh does not reload it.
- The year view's first column is the month ("nov. 2026").
- The "Încercări" column and total show only for "Toate" and "Teste rapide".
- A small bar next to each day's "Lucrări" shows the trend (plain CSS, no chart library). Builder's call how it looks, in the style of Setări.
- On a phone, the table scrolls sideways inside its own box; the page does not.
- Romanian text, the error shown from `message`.

## Part B: more pages in Rybbit

### Pages and what Rybbit shows

| Page | Path recorded in Rybbit |
|---|---|
| Student test link `/u/<token>` (and the code entry at `/u/`) | `/u/*` (and `/u/`) |
| Student result link `/u/result/<token>` and its old form `/u/rezultat/<token>` | `/u/result/*`, `/u/rezultat/*` |
| Quick Try page `/try/<token>` | `/try/*` |
| Quick Try phone page `/try/<token>/phone` (and `/telefon`) | `/try/*/phone`, `/try/*/telefon` |
| Teacher login screen | `/teacher/` |
| Teacher sign-up | `/teacher/#new-account` |

### Rules

- The student and Quick Try pages load the same Rybbit script and site id as the public pages, with `data-mask-patterns` covering every path above that holds a token. A path with a token is never sent as is. Session replay stays off (it records the full address).
- Those pages send **no referrer** (`<meta name="referrer" content="no-referrer">` in `u/index.html` and `try/index.html`, or a `Referrer-Policy` in `_headers` that wins over the `/*` one): a same-origin referrer would carry the token of the page before.
- The teacher app loads Rybbit only while the login screen shows (the login screen has no address of its own: it shows at any `/teacher/...` address when signed out), and only in the built site. It skips every teacher path but `/teacher/` and `/teacher/#new-account` (`data-skip-patterns`; the email links `confirm-email` and `new-password` hold a token after `#`). After a login, a tab that loaded it reloads, so no page view of a logged-in teacher's page reaches Rybbit (`/teacher/` is also the logged-in home).
- Two limits of that: a signed-out deep link (`/teacher/tests/...`) is not counted, and the in-page button "Cere un cont de profesor" does not change the hash, so `#new-account` counts only the visitors who came from the landing page's link. The "account request sent" event counts the real requests.
- Rybbit masks the path only: the query string, the page title and the referrer are sent as they are. The first mask that matches wins, so each list has its specific patterns first and a catch-all last (`/u/**`, `/try/**`). With "Track URL fragments" on, the path it matches includes the `#` part.
- Two events (Rybbit custom events, `window.rybbit.event(name)`): `account-request-sent` after a successful sign-up request, `quick-try-sent` after a successful Quick Try form send, before a phone leaves for the try's phone page. No names, emails or tokens in them.
- No change to what a student sees. The script shows nothing.
- `public/_headers` already allows `https://stats.mqgrader.ro` in `script-src` and `connect-src` for every page.
- Update the rules that say these pages never load Rybbit: `AGENTS.md` ("Visit counts" line), `docs/analytics.md`, and `src/landing/pages.test.ts` (it checks that the private pages do not load it; it must now check that they load it with the masks and no referrer).

### Steps for the administrator in the Rybbit dashboard (not code)

- Update Rybbit (`cd ~/rybbit && bash ./update.sh`). The released version (2026-11-18) still has no "Track URL fragments" setting and drops the `#` part, so `#new-account` counts as `/teacher/` until a release has it; then turn it on. Turn off "Button Clicks" (it sends the text of the button, and the student page has a button with each student's name) and "Error Tracking" (an error message may hold text of the page).
- Keep "Session Replay" off: it records the full address, token included, and what the page shows. "Track URL fragments" and "Session Replay" are settings of the whole site: fragments also split the public pages' anchors, and replay would also record the student pages. To record replays of the public pages one day, give the private pages a Rybbit site of their own first.
- Keep "URL Parameters" on (query strings, for campaign tags such as `utm_source`). The masks do not cover a query string, so no page may put a token, a code or a name in one: a test checks the query strings each student and Quick Try page sets.

## Left to the builder

- Table and column names, the exact upsert, the month grouping, the bar's look.
- How the teacher app limits Rybbit to the login screen.
- Tests: the counts of each kind, ok and failed, tokens, a Quick Try job, a try, Bucharest midnight, the empty days, the three periods and three sources, admin only; on the screen, the button, the tries column, the phone scroll; for Rybbit, the masks, the referrer rule and no teacher page view after login.

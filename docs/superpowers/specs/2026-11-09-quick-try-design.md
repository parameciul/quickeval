# Quick Try: one free grading without an account

Date: 2026-11-09. Source: the owner's feature note ("Quick Try.md"), refined in a brainstorming session. Decisions marked **(owner)** were made by the owner; decisions marked **(builder call, made in design)** were made while writing this design, for the owner to check; everything under "Left to the builder" is open.

## 1. Why

A teacher who finds mqgrader.ro asks one thing first: does the grading really work, and is an account worth my time? Today she must ask for an account, confirm her email, wait for approval, and set up a class before she sees one graded paper.

Quick Try is the taste. She uploads one test, its barem, and one student's photos, with no account, and gets the same graded paper, review and results a teacher gets in the app. The account is the next step: a new (demo) account grades one full class test for free (up to `DEMO_PAPER_LIMIT`, 35 papers). Quick Try must lead there.

A second use: the owner and teachers the owner knows use Quick Try to see how the grading behaves on new kinds of papers.

**Success:** a teacher goes from the landing page to a graded paper she can review in minutes, without an account, and the last thing she sees invites her to grade a full class with a free account.

## 2. Goals, non-goals, anti-goals

Goals:

- One free grading per device per day from the landing page, no account.
- The same grading pipeline as the app (exercise list, grading, barem generation), so what she sees is what an account gets.
- The same review experience as the app: unsure points to check, points she can change, the teacher's result for the paper, and the student's result page.
- One link per try, kept on her device for 7 days, that she can share.
- Hard limits that protect the owner's Claude usage.

Non-goals:

- Subjects other than math. The grading skill stays math-focused **(owner)**. Generic grading is later work.
- Rewriting the landing page's "math" text or adding the free-class-test message to the landing page body. Separate task **(builder call, made in design)**. Quick Try adds only its own button, status line and the invitation on its result page.
- Photos only, with no test file (the student wrote on the test sheet and the robot separates print from handwriting). Later work, after it is tried on real papers **(owner)**.
- Class analysis, CSV, class report, more than one student, scheduling, regrades.

Anti-goals (a failure even if it works):

- A wrong grade from a shortcut. A demo with a wrong grade loses the teacher.
- A Quick Try page that differs so much from the app that it promises something the app does not do, or hides what the app does.
- A promise that is false: "unlimited access" with an account. A new account is a demo with one class test.
- Any student-facing view that says how the paper is graded (the root `AGENTS.md` rule for student pages holds for the student view inside Quick Try).
- Unbounded robot work from anonymous visitors.

## 3. The flow

All visitor text is Romanian. Code and docs are English.

### 3.1 Landing page (`index.html`)

- A prominent button next to the existing calls to action, for example "Încearcă acum, fără cont" **(builder call: exact words)**. The landing page has no React today; keep it that way if practical (the form can be a small script or a separate page; see "Left to the builder").
- After she sends a try, the visitor stays on the landing page **(owner)**. Under the button: a live status ("Se corectează…", "Baremul este gata", "Lucrarea este corectată") and a link to the try's page. She may open the link at any time, or wait.
- The link and the time it was made are kept in `localStorage` on her device for 7 days **(owner)**. A new try on a later day replaces the stored link. After 7 days the landing page stops showing it.

### 3.2 The form

A window (modal) over the landing page **(builder call, made in design)** with three inputs:

1. The test file. **Required (owner).**
2. The barem file, or a choice "I have no barem: make one for me". One of the two is required.
3. The student's work: photos or a PDF, same file types, sizes and count as the app's student upload (`shared/files.ts`: 25 MB per file, at most 20 files) **(builder call, made in design)**.

The student may have written on the test sheet itself; that is fine, because the clean test file tells the robot what was printed.

The form also runs a Cloudflare Turnstile check (see 4).

### 3.3 The try's page (its own link)

The page has the states below. It refreshes itself while work runs.

1. **Robot barem in progress** (only when she asked for one).
2. **Robot barem ready.** She can download the barem (the Word file the robot makes today). Grading does **not** start by itself **(owner)**: she presses "Pornește corectarea". She may also replace the barem with her own file before starting **(builder call, made in design)**.
3. **Grading in progress.** Expect a few minutes: the robot starts in about a minute, then makes the exercise list and grades.
4. **Graded.** Three views **(owner)**:
   - **Verification:** the unsure points and unreadable pages to check, with the photos beside the points, and points she can change. It mirrors the app's review page.
   - **Teacher result:** the paper's full result as the teacher sees it in the app (points per exercise, explanations, notes).
   - **Student result:** the page the student would see, made from the same data as the app's student result page.
   At the end of the page, the invitation: "Îți place? Creează un cont: corectezi gratuit un test pentru toată clasa." **(builder call: exact words)**, linking to `/teacher/#cont-nou`.
5. **Failed.** The robot could not grade. A clear message; this try does not use up her try for the day **(builder call, made in design)**.
6. **Expired.** After 7 days the page says the try has expired, even if the data is not deleted yet **(builder call, made in design)**.

Middle checkpoints **(builder call, made in design)**: Quick Try behaves like the app wherever the app asks the teacher something, so she meets the same moments she would meet with an account.

- Exercise list in `problem` (the points do not add up): the page shows the same message as the app, with "Folosește oricum" and the choice to replace the barem.
- The barem may be replaced (her own file instead of the robot's, or a new file) only before grading starts. Nothing is regenerated for it beyond what the app does when a barem changes before a start. After grading starts, the barem is fixed.
- Robot barem generation failed, or grading failed after the robot's own retries: the try ends as Failed (state 5) and the device and the IP get their try back. No retry button.

Hidden or absent in Quick Try **(builder call, made in design)**: regrade, regrade all, retry, class analysis, CSV, class report, print PDF, publishing results to students, archive, scheduling.

### 3.4 Sharing

- The try's link is its only key. Anyone with the link sees and does everything she can: change points, start the grading, download the barem **(owner)**. It is a demo; she decides whom she trusts with it.
- "Distribuie" copies the same link (and uses the browser's share sheet where there is one) **(builder call, made in design)**. There is no second, read-only link.
- The link must be a long random token, like the upload token (`server/secrets.ts`), stored hashed if the existing tokens are stored hashed.

## 4. Limits

The robot uses the owner's Claude subscription, so limits are hard limits, checked on the server **(owner, option A)**:

- **Per device:** one try per calendar day, remembered in `localStorage`. Soft: it stops normal visitors, not a determined one.
- **Per IP address:** at most 10 tries per calendar day. Hard. Store the IP only as a hash (the same `sha256Hex(clientIpKey(c))` the sign-up limit uses), never in clear.
- **Global:** at most 30 tries per calendar day across the platform. Configurable (a setting or a constant; see "Left to the builder").
- **Bots:** a Cloudflare Turnstile check on the form, verified on the server before any file is accepted.
- **No device fingerprinting (owner).** It would need a consent banner under EU rules.
- **Administrator:** a visitor logged in as an administrator (the `qe_session` cookie, `adminOnly` rules) skips all limits, and those tries do not count in the global 30 **(owner; the global-count part is a builder call, made in design)**. The device limit in `localStorage` does not apply to an administrator either, so the form must know the visitor is an administrator (for example a small public endpoint that reads the session cookie). Administrator tries otherwise behave like any try: same page, same 7-day expiry, same deletion, and they are not listed in the app **(builder call, made in design)**.
- A "calendar day" is the Europe/Bucharest day.
- The limits are checked inside the SQL statement that creates the try, never in a check before the write (the project rule for anonymous writes; two requests at once must not pass).
- What counts as "one try": creating a try counts. A try whose grading failed gives the device and the IP their try back **(builder call, made in design)**; the global count may keep it (protects usage). A robot barem plus one grading is one try.

When a limit is reached, the form says so in Romanian, in the spirit of: "Limita de încercări gratuite pentru azi a fost atinsă. Încearcă din nou mâine sau creează un cont: corectezi gratuit un test pentru toată clasa." No "unlimited" promise **(builder call, made in design)**. When the global limit is reached, the button can say so before she fills the form.

## 5. Deleting old tries

- A try is deleted once its 7 days are over: its rows and its R2 files (test, barem, photos, generated files) **(owner, 2026-11-10; this replaces the monthly cleanup, option B)**.
- The trigger: Pages runs no timer and the GitHub schedule does not fire reliably, so each visit of the landing page (`GET /api/try/availability`) deletes, after its answer, up to `QUICK_TRY_CLEANUP_BATCH` (3) tries whose days are over, the oldest first: their R2 files, then their rows. When R2 fails, the rows stay and a later visit tries again **(builder call, made while planning part C)**.
- R2 keys come from rows, never from listing R2 (project rule).
- A deleted try's link answers like an unknown link; the try's page then says that a try is deleted after 7 days **(builder call, made while planning part C)**.

Privacy **(owner)**: the form has no consent checkbox and no "cover the name" warning. The owner accepts that photos, which may show a student's name, stay about 7 days, a little longer when nobody visits the landing page.

## 6. Constraints from the project

- Read the root `AGENTS.md`, `server/AGENTS.md`, `src/AGENTS.md`, `runner/AGENTS.md` before building.
- Functions: at most 10 ms CPU and 15 D1 queries per request; group writes with `db.batch()`.
- Every `/api/admin` and `/api/u` request runs `promoteDue`; a new public router for Quick Try must decide whether it needs it.
- R2 is private: files go through the API with a check that the try's token owns them.
- The robot's Claude reads only its work folder; robot answers and logs carry no names. A Quick Try paper has no student name anyway.
- Every path that makes robot work starts the robot (`startRobot`).
- Times stored as ISO 8601 UTC strings.
- A new migration runs on the live database before the code that needs it reaches `main` (`docs/deploy.md`).
- `public/_headers` and `robots.txt`: the try's pages must be `noindex` and closed to crawlers, like `/u/`.
- The student view inside Quick Try is checked with `expectNoGradingWords()`.
- Tests for every new feature, happy path and edge cases (owner's global rule).

## 7. Build phases and data model (decided while planning)

Three plans, each one shippable on its own:

- **QT-a, the server:** the try, its link, the limits, Turnstile, the robot's work, and the try's API. Proved with tests and the smoke script's pretend robot. No visible change on the site yet.
- **QT-b, the try's page:** the states, the review with point changes, the teacher result and the student result.
- **QT-c, the landing page and the cleanup:** the button, the form, the status line and `localStorage`; the monthly delete; `_headers`, `robots.txt`, `_redirects`; the Turnstile step in `docs/deploy.md`.

Data model: **each try is a hidden guest teacher** named "Încercare", with its own class (`PROBA`: a test code allows only A-Z and 0-9), one student ("Elev"), one test and one paper, in the app's own tables. Why: every teacher query is already scoped by the teacher's id, so the app's test, review and results code (server and React, `src/admin/api.ts` takes a `base`) runs for the try unchanged, under `/api/try/<token>/…` with a middleware that puts the guest teacher in `c.var.teacher`. That is the point of Quick Try: the same pipeline and the same review.

- `teachers.quick_try` (0 or 1): a guest teacher. Status `disabled` (no login, no session), `demo = 0` (the demo limits do not apply: Quick Try has its own), an email that cannot be real (`try-<random>@quick-try.invalid`). Kept out of the accounts list, the pending count, the admin emails and every other teacher-wide query.
- `tests.quick_try` (0 or 1): a flat flag on the test, so the robot's conditions (which must stay flat on the alias `t`) can exclude it: no print job (`NEEDS_PRINT`, even though `saveTestFile` gives the test an upload token), no class analysis (`askForAnalysis`, `askAnalysisAfterCheck`, `NEEDS_ANALYSIS`).
- `quick_tries`: one row per try: the guest teacher, the test, the link token's hash, the Bucharest day (`YYYY-MM-DD`), the IP key's hash (`sha256Hex(clientIpKey(c))`, the same hash the sign-up limit uses), whether an administrator made it, and the times. The limits are counts over this table inside the INSERT's SQL. A try "gives back" its device and IP place by its own state (its paper failed, or its barem generation failed), read in the count, so no robot path needs a refund write.
- The counters `tests_evaluated`, `papers_graded`, `graded_test_id` grow on the guest teacher: harmless, and deleted with it.
- One try makes bounded robot work (the anti-goal above): one barem generation, only when it has no barem, and at most 6 changes of its test and barem files, both checked in the writes' SQL.
- Routes under `/api/try/<token>` allow only what Quick Try shows (an allow-list of methods and paths); everything else answers 404.

## 8. Left to the builder

- **Robot work order.** Whether Quick Try jobs go before or after teachers' class work in a robot round.
- **Pages.** Whether the try's page is a new entry (for example `/try/<token>`) or a route in an existing app, and how much of the admin review and results components it reuses. The look follows the redesign spec (`docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`).
- **The cleanup trigger.** Settled while planning part C: each visit of the landing page (§5).
- **Where the global limit lives** (a constant like `DEMO_PAPER_LIMIT`, or a Setări value).
- **Turnstile keys** as secrets, with test keys for local development and tests. The owner creates the Turnstile widget in Cloudflare; its hostnames are mqgrader.ro and quickeval.pages.dev (Quick Try works on both hosts) **(builder call, made in design)**. Add the step and the secret to `docs/deploy.md`.
- Exact Romanian wording of all new text.

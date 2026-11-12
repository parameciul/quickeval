# MQGrader redesign: the remaining work (roadmap)

> This is a roadmap, not an implementation plan. Phase 8 has no design yet, so no prototype-based plan can be written for it. Each step below gets its own path later: design round, then spec, then tested prototype, then plan (`plan-writing-method`), then branch and pull request.

- Date: 2026-11-06.
- Spec: `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md` (§11 not designed yet, §12 open questions, §13 phases).
- Starts from: `main` after Phase 7 (Clase) is merged. Phase 7 is built by another agent on `feature/mqgrader-classes`.

## 1. Start state

Before step 1, check on `main` that Phase 7 delivered spec §9:

- No page with all classes. `/admin/clase` opens the last class seen, else the first.
- One class page. Its top line: the name, "Schimbă clasa ˅", the facts, "Test nou pentru această clasă", and ⋯ with "Redenumește clasa" and "Arhivează clasa".
- Tab "Note și teste": the grades table (one column per test, oldest on the left, an orange dot when points wait, "—" when no paper was sent, the row "Media testului", no average per student) and "Testele clasei".
- Tab "Elevi": the students with search and dots, and one student on the right, with "Toate notele elevului, din toate clasele".
- "Clasă nouă" and "Adaugă elevi" are dialogs.

Then read the Phase 7 pull request text: its rulings and its deferred minors. They can change steps 8a and 9 (for example, where "Arhivate (n)" leads now).

What spec §11 still lists as not designed, and the code of today for each:

| Item | Route | Code today |
|---|---|---|
| Search and its results | none | Nothing: no box in the top bar, no API. |
| The "Test nou" form | `/admin/teste/nou` | `src/admin/pages/NewTestPage.tsx`: one form. |
| Setări (administrators only) | `/admin/setari` | `SettingsPage.tsx` ("Corectarea", "Cheia robotului", "Starea robotului") and `settingsPage/AccountsSection.tsx`. |
| Login and sign-up | `/admin/` logged out, `#cont-nou` | `LoginPage.tsx`: the login form and "Vreau cont nou" with the demo note. |
| Email confirmation | `/admin/confirma-email` | `ConfirmEmailPage.tsx`. |
| Contul meu | `/admin/cont` | `AccountPage.tsx`: the demo or full account line, "Parola", "Ieșire". |
| Payment | none | `src/ui/PayButton.tsx` (Stripe Checkout, `docs/payments.md`) exists, but no page uses it yet. |
| The demo account line | every page | `demoText()` in `src/admin/Layout.tsx`, under the top bar (spec §4). |
| The student's history page | `/admin/elevi/:id` | `StudentPage.tsx`: "Note", every graded test in every class and year. |
| The class report page | `/admin/teste/:code/raport` | `ReportPage.tsx` and `reportPage/`: "Raportul clasei", "Rezultatele elevilor", "Pe exerciții", the class analysis. |
| An archived class | set by Phase 7 | Classes have `archived` (migration 0001). |
| The first visit and the empty states | every page | Each page has its own empty text. |

All these pages already have the Phase 2 look (tokens, bar, top bar). Only their layout is old.

## 2. Decisions for the user (before the design round)

Each has two options and a pick.

- **D1. The final mark (spec §12).**
  - (a) Keep "Trei subiecte" as the final mark.
  - (b) Show 2 or 3 mark options in design round 7 (the user liked "Score ring" and "Ring and tick" in the brand study).
  - Pick (b). The mark lives in one component (`BrandMark.tsx`), the favicon, the landing page and the PDFs. The login page (8b) shows it large, so decide before 8b.
- **D2. Search.**
  - (a) Build it, last (8f).
  - (b) Drop it for good. The panel "Clasele tale", "De făcut" and the student search of the "Elevi" tab may be enough.
  - Pick (a), but ask again before its design. If the teacher never misses it after Phase 7, take (b).
- **D3. How many design rounds.**
  - (a) One round 7 for every item of §11 (and the mark). The builds then run one after the other with no design stop, and the pages share their patterns (empty states, forms, dialogs).
  - (b) One round per build group. Each round is smaller, and later rounds learn from the built pages.
  - Pick (a). Leave search out of it when D2 is (b).

Settled, not a decision: the code, the URLs, the secrets, the database and the repository keep the name quickeval (`AGENTS.md`). The byline is "by Laura Miron".

## 3. Step 1: design round 7

- Static HTML pages in `docs/design-proposals/round-7` (git-ignored). The local-only `proposals` entry of `.claude/launch.json` serves them on port 8790. Publish them for the user as an artifact, as for rounds 1 to 6.
- Use the real tokens of `src/ui/brand.css` and the real shell (bar, top bar, phone bar). Show 1440 px and 390 px, light and dark.
- One page per item of §11, plus the mark (D1). At most 2 options per item, each with a pick. The questions per item are in section 4.
- Done when the user has picked every item. The choices become a spec change: new decisions in §1, a new section per page, §11 emptied, and §13 replaced by the groups below. That spec change is Task 1 of the 8a plan.

## 4. Phase 8: the build groups

One branch and one pull request per group, in this order. Each group follows the method of Phases 2 to 7:

1. A tested prototype in the scratchpad. Copy its tools from `.superpowers/tools/phase6`.
2. A plan built from the prototype.
3. The build, Native or subagent-driven (the user picks).
4. An Opus whole-branch review.
5. A browser check (1440, 1024 and 390 px, light and dark), and the smoke test.
6. The pull request, on the user's yes. The user merges it on GitHub.

### 8a. Next to the class page: archived class, student history, class report

Do these first: the Phase 7 class page links to all three, and after Phase 7 they are the oldest-looking pages.

- **An archived class.** Where "Arhivate (n)" leads, and what the page shows. Questions: can the teacher open its grades table, and can she take it out of the archive.
- **The student's history** (`StudentPage.tsx`). Every test in every class and year. Question: does it use the cells of the grades table (grade, orange dot, "—"), with a link to each paper and result.
- **The class report** (`ReportPage.tsx`). "Rezultatele elevilor", "Pe exerciții", the class analysis ("Regenerează" starts the robot). The PDF and the CSV stay in the browser (`src/admin/pdf/`, `shared/csv.ts`).
- **API.** Probably no change. Reuse the per-upload points and result state that Phase 7 adds to the class data. **Migration:** none expected.

### 8b. The way in: login, sign-up, email confirmation, Contul meu, the demo line

- **Pages:** `LoginPage.tsx` (login, and "Cont nou" through `#cont-nou` from the landing page), `ConfirmEmailPage.tsx`, `AccountPage.tsx`, the demo line (`Layout.tsx`).
- **Questions:**
  - Where does the demo line go?
  - Does Contul meu get the pay button (`PayButton`) to leave the demo?
  - What does a pending account see?
- **Also fix here:** the Phase 2 leftover on the logged-out phone page (the year select is 14 px, and the bar padding).
- **Rules:** a new account confirms its email, then is pending and demo. A demo account has `DEMO_PAPER_LIMIT` papers. The session cookie is `qe_session`.
- **Tests:** one login test in `server/routes/auth.test.ts` is slow on this PC. Run it alone when it times out.
- **API:** probably no change. Payment needs a server route only if Contul meu gets the pay button and the route is missing. Check `docs/payments.md`. **Migration:** none expected.

### 8c. The "Test nou" form

- **Page:** `NewTestPage.tsx`. "Test nou pentru această clasă" (Phase 7) opens it with the class already chosen.
- **What it holds:**
  - the test file;
  - the barem, uploaded or "Generează baremul" (a robot job, unchecked until the teacher confirms it);
  - the upload link, made at once, so the teacher can print with the QR code from the draft.
- **API:** probably no change. **Migration:** none expected.

### 8d. Setări (administrators only)

- **Pages:** `SettingsPage.tsx` and `settingsPage/AccountsSection.tsx`: "Corectarea", "Cheia robotului", "Starea robotului", and the accounts (pending, demo, full). They stay behind `adminOnly`.
- **Question:** a full design, or only a layout pass? One person uses it.
- **API:** none. **Migration:** none.

### 8e. The first visit and the empty states

Do this after 8a to 8d: it touches every page.

- **What it covers:** a new teacher with no class and no test:
  - Teste;
  - the panel "Clasele tale" and "De făcut";
  - a class with no students or no tests;
  - a test with no paper;
  - Rezultate with nothing graded.
- **The rule:** each empty state names its one next step ("Clasă nouă", "Test nou", "Adaugă elevi").
- **Tests:** each page with an empty fake API (`src/test/fakeApi.ts`).
- **API:** none. **Migration:** none.

### 8f. Search (only when D2 is "build")

- **Questions:**
  - Where the box goes: the left of the top bar (spec decision 6), and on a phone (the phone bar has 4 items and ☰).
  - What the results page shows.
- **New API:** `/api/admin/search`, for the teacher's students, classes and tests.
  - It is scoped by the teacher's id.
  - It stays within 15 D1 queries and 10 ms of CPU.
- **Diacritics:** SQLite `LIKE` folds only ASCII letters. A search for "stefan" must find "Ștefan", so it may need a folded-name column.
- **Migration:** possible (that column). If so, it runs on the live D1 before the merge.

## 5. A cleanup branch (any time, in its own worktree)

These are small items from earlier reviews. It does not depend on Phase 8, so it can start now, in its own worktree, not in the shared checkout. For each item, first check that it is still true: Phase 7 or 8 may have removed it.

- **Phase 2 (PR #31):**
  - `viewport-fit=cover`: the user checks it on a real iPhone;
  - a gap at 900 to 901 px;
  - no `overscroll-behavior` and no `scroll-padding`.
  - The logged-out phone page goes to 8b.
- **Phase 3 (PR #32):**
  - an archived, unpublished test has an empty note;
  - a failed first barem generation reads "lipsește baremul";
  - the greeting with no name;
  - the focus is lost after a row publishes;
  - spaces are missing between the pill and the task, and between the title and "Arhivat";
  - the greeting goes stale across 11:00, 18:00 and midnight;
  - "ciornă" is keyed on `startedAt`;
  - the CSS `.card-foot` and `.results-line` is not used;
  - tables have no accessible name of their own.
- **Phase 4 (PR #34):**
  - the generated-barem notice is drawn red;
  - the papers table actions crowd the panel (check whether Phase 5 or 6 fixed it).
- **Phase 5 (PR #35):**
  - no test checks that the papers table is absent in Rezultate;
  - the row buttons share their names (add an `aria-label` with the student's name);
  - a refused copy shows the field with no message and does not select it;
  - "toate publicate" shows next to "Publică toate rezultatele" when every paper was published one by one;
  - the CSV is built in two places;
  - the Punctaj and Nota cells use two different checks;
  - after "Fă linkul", the cached uploads keep no token (no harm).
- **Phase 6 (PR #37):** none.
- **Phase 7:** add its deferred minors here.

**Set aside in Phase 6, a project of its own:** the robot names the page of each exercise, so the review can open that page. It needs a field in `shared/schemas.ts`, a migration and a change to the grading skill. Ask the user before starting it.

## 6. Older open work, outside the redesign

- **Branches:** every feature branch is merged into `main`, except two from the SEO work:
  - `chore/claude-seo-skill` (one more commit, 0dfb9a1 "Update .gitignore");
  - `backup/main-before-sync` (0199d5f).
  - The user decides whether to merge or delete them.
- **Migration 0020:** the generated-barem migration is on `main` (bcebc00). The user checks that the live D1 has it: `npx wrangler d1 migrations list quickeval --remote`.
- **Older follow-up notes:** `docs/superpowers/plans/plan-1-followups.md` to `plan-5-followups.md`, and `qr-print-test-followups.md`. They are not sorted here. Read the notes for an area before planning a step that touches it.

## 7. Rules for every step

- All user-facing text is Romanian. Student pages:
  - no word on how the work is graded (`expectNoGradingWords()`);
  - only the mark and "MQGrader" in the header.
- A new migration runs on the live D1 before its code reaches `main` (`docs/deploy.md`).
- Commits and pull requests have no AI attribution lines. Code comments name no ticket or issue numbers.
- Stage files by explicit path. Never commit the local changes to `.claude/launch.json` and `.gitignore`, or the untracked skill folders.
- Ask the user before any push or pull request. The user merges on GitHub.
- Before a preview, check `netstat -ano | findstr :8788` for a leftover `workerd.exe`.
- Each step runs the full suite (also with `TZ=UTC`), the smoke test and the browser check. Never run two suites at once: the runner and auth tests then time out.

## 8. Order at a glance

0. Phase 7 is merged (another agent). The cleanup branch (section 5) can start at any time.
1. The user answers D1, D2 and D3.
2. Design round 7, then the spec update.
3. 8a, 8b, 8c, 8d, 8e, then 8f (if search stays).

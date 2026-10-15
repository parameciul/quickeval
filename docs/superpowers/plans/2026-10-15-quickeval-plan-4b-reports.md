# QuickEval Plan 4b: Class Analysis, Class Report, PDFs, CSV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 10 must run in the main session, not in a subagent:** every outward step needs the user's explicit yes, and some steps are done by the user alone.

**Goal:** The robot writes an analysis of each graded class, and the teacher reads the class report (table, statistics, analysis), downloads or shares a PDF of a student's result and of the class report, and downloads the report as a CSV file for Excel. A page opened before a reset can no longer change another student's upload. Version 1 of QuickEval is complete.

**Architecture:** The API gains the robot's third task: `GET /api/runner/tests/:id/results` (the graded class without names, with a `version` of the grades) and `POST /api/runner/tests/:id/analysis`, the first request of the analysis (every entry into evaluation asks for it), `POST /api/admin/tests/:code/analysis/regenerate`, and `GET /api/admin/tests/:code/report`. The robot gains the `class-report` mode of its skill and a third step in a run. `shared/stats.ts` makes the numbers of the report in the browser. The PDFs and the CSV are made in the browser: pdfmake loads only when a PDF is asked for, and its own Roboto font holds every Romanian letter. No migration.

**Tech Stack:** Node 24, TypeScript 7, React 19, TanStack Query, React Router, Vitest 5, Testing Library, Hono 4, zod 4, wrangler 4 (`getPlatformProxy`), Cloudflare D1 and R2. New dependencies: `pdfmake` 0.3.11 and `@types/pdfmake` 0.3.3.

**Spec:** `docs/superpowers/specs/2026-10-06-quickeval-design.md`. This plan implements §19 item 4b: the class analysis task of §12 and §8.5, the robot routes of §11.3, the class report of §14.2, the PDFs of §14.1 to §14.3, the CSV, Share, and the operations notes of §18. Task 1 brings the spec up to date with the changes that the teacher made after Plan 4a (the student result pages, the two upload links, the barem comments, the selection for Start evaluation, confidence in five steps). Read `plan-4a-followups.md` too: the code in the repo is the source of truth, not the older plans.

## Global Constraints

- Node 24 (`.node-version`), npm 11. Task 7 adds two dependencies and no others. Never run `npm install` in any other task.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx`/`.mjs` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments, and docs are English. **No page and no PDF tells students that AI grades their work.** The pages of this plan are teacher pages and may name the robot; the student's PDF is for the student and may not.
- API errors are `{ "error": "<code>", "message": "<Romanian text>" }`, made with `ApiError(status, code, message)`.
- Every teacher query is scoped by the teacher's id. Ids from URLs go through `parseId`, test codes through `parseTestCode`; the teacher app reads ids with `parsePositiveId`.
- Each write of this plan checks its own rules inside its SQL statement (or one `db.batch()`), never in a check before the write. Ids of deleted rows come back (no `AUTOINCREMENT`): a write from a page names what the page showed.
- The robot's Claude reads only its work folder and gets no names. Robot answers and logs carry ids, counts, and error categories, never names or Claude's text.
- Functions do no heavy CPU work and make at most 15 D1 queries per request.
- Every path that makes work for the robot starts it (`startRobot`): the GitHub schedule does not fire.
- Times are stored as ISO 8601 UTC strings written by `toISOString()` (`nowIso()`), and shown in Europe/Bucharest time.
- API tests use wrangler's `getPlatformProxy`. No direct `miniflare` dependency.
- A new migration runs on the live database before the code that needs it reaches `main`. This plan adds none.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers.
- Development happens on Windows (commands below work in Git Bash and in PowerShell unless a step says otherwise). CI runs on Linux, in UTC.
- Run every command from the repo root. Run `npm test` alone, in the foreground: `runner/run.test.ts` times out when two test runs share the machine.

## Review Focus

These inputs are not in the spec's text and are most likely to hurt a person who uses the software. Each one has a test in the task that owns the code.

1. **A test with no graded upload** (every upload failed, or nothing to grade) must end. It must not wait forever for an analysis that cannot be made. Task 3: "ends without waiting for an analysis", and `evaluation.test.ts`.
2. **The teacher corrects or regrades while the robot writes the analysis.** The analysis must not look fresh. Task 3: the `version` of the grades, "saves it as out of date", and "refuses it while an upload waits for grading".
3. **A page opened before a reset** must not reset, retry, publish, or link another student's upload that got the same id. Task 2: "a page opened before its upload was reset".
4. **A CSV cell that starts with `=`, `+`, `-`, `@`, a tab, or a carriage return,** and a name that holds `;` or `"`. Task 8: `shared/csv.test.ts`.
5. **The student's PDF** must never carry the reason to check an item or the robot's confidence, must say "în verificare" for an unchecked item, and must draw ș ț ş ţ. Task 7: `pdf.test.ts`. A class of 60 exercises must stay readable: Task 7 (blocks of columns) and Task 6 (the table scrolls inside its box on a phone).

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; overwrite all of it with exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/proto4b/b1` … `refs/proto4b/b9`, one per task, on `refs/proto4b/pbase` (the commit `a63ffab`). After Task N (1 to 9), `git diff --stat refs/proto4b/bN HEAD` lists only this plan file; after Task 7 it also lists `package-lock.json` until Step 3 of Task 7 is done as written. The repo's tags `base` and `t1` … `t9` belong to Plan 3a's prototype: leave them.
- Tests that start wrangler's local engine leave nothing running when they pass. If a run is stopped halfway on Windows, check for a leftover `workerd.exe` as `AGENTS.md` describes.
- One test runs the real pandoc, and only where pandoc is installed (`pandoc --version` works). The totals below are for a PC with pandoc; without it, that test shows as skipped.

## Rulings made while planning

These decisions were made while the plan was built and tested. They are binding for the implementers and reviewers. Tasks 1 to 9 write the ones that change the spec into the spec.

1. **The result pages stay as the teacher built them, and the PDF stays as the spec says** (the user's choice, 2026-10-15). The student's result page and its secret link are for the student. **Descarcă PDF** and **Trimite** are for the teacher, who sends the PDF through the share sheet of the phone. Task 1 writes the result pages into the spec.
2. **An action on one upload that names no grading names the upload by `startedAt`.** `submissions.started_at` is written once when the upload starts, so it never changes during one upload's life, and a new upload that took the id of a deleted one has a later time. Reset, Retry, publishing or taking back a result page, and the result link send it. Another upload is 409 `upload_changed`; an unknown one 404; a body without it 400. The table is not rebuilt with `AUTOINCREMENT`.
3. **The first analysis is asked for the same way as the next ones.** Entering `evaluating` turns `none`, `ready`, and `failed` into `requested`. A test with no graded upload has nothing to analyze: `finishTests` ends it and puts `requested` back to `none`. `NEEDS_ANALYSIS` also needs a graded upload.
4. **The analysis names the grades it was made from.** `GET /tests/:id/results` carries `version` (the number of graded results and the time of the last change). The robot sends it back; the save computes it again in its SQL, and a different version saves the analysis as `ready` with `analysis_stale = 1`. The analysis is saved only while no upload waits for grading (409 `not_needed`: it stays `requested` and is written after the new grades). No migration is needed.
5. **Regenerează works from any state**, also from `none` (a test graded before analyses existed). It needs a test in `evaluating` or `done` with a graded upload (409 `not_evaluated`, 409 `no_results`), takes a `done` test back to `evaluating`, and starts the robot.
6. **What the robot's Claude sees of the class:** the exercise list and, for each graded student ("Elev 1" … "Elev n", in grading order), the total, the grade, and for each exercise the final points, the student's answer, and the comment. The work folder holds the skill and `class-results.json` only: no test, no barem, no pages.
7. **A run writes the analysis in the same run,** after its gradings: it reads `GET /tasks` again and writes the analysis of each test that is ready, once per test and run. A failed analysis waits for the next run, and fails for good at the third attempt, when the test ends without one.
8. **The class report's rows come from `GET /tests/:code/report`,** and the statistics from `classStats` (`shared/stats.ts`) in the browser. Grade groups: below 5, 5 to 6,99, 7 to 8,99, 9 and over (a grade at a limit is in the higher group). An item to check is one that the robot flagged and the teacher did not check; a result with unreadable pages that were not checked counts one more.
9. **PDFs are made in the browser.** pdfmake and its font load only when a PDF is asked for (two chunks of about 1 MB each, 0,8 MB compressed together). The font is the Roboto that pdfmake carries: a test reads its character map and finds every letter of both PDFs, also the cedilla forms ş ţ. No font file is added.
10. **The student's PDF is made from a narrow input** (`StudentPdfInput`): no confidence and no review reason, so they cannot reach it. An item that waits for a check shows "în verificare" instead of points, and a note says that the grade can change. Its date is the day the student sent the upload.
11. **The class PDF is landscape,** and puts the exercises in blocks of 12 columns, each block repeating the student's name, because no page holds 60 columns.
12. **CSV:** UTF-8 with a byte order mark, `;`, a decimal comma, CR LF. Columns: Elev, each exercise, Total, Nota, Observații. Students without a result follow, with the reason in Observații. A text cell that starts with `=`, `+`, `-`, `@`, a tab, or a carriage return gets an apostrophe; numbers are never changed.
13. **Trimite** opens the share sheet with the PDF file. When the browser cannot share files, or refuses because the tap is too old (a slow PDF), the PDF is downloaded and the page says so.
14. **Not in this plan:** `npm run try:skill` does not get the `class-report` mode (the skill's test checks the mode); a block size that follows the page width; a PDF that is made before the teacher asks for it. `plan-4b-followups.md` (Task 9) lists them.

## Not in this plan

A new migration, a font file, and changes to the student app. The follow-ups of Plan 4a that this plan does not touch stay in `plan-4a-followups.md`.

---

### Task 1: The spec follows the teacher's own changes

Since Plan 4a the teacher added student result pages (a secret link for each upload, opened for the whole test or one student at a time), a second upload link for one phone that uploads for many students, comments for the barem, the selection of uploads for Start evaluation, and confidence in five steps. None of it is in the spec. This task writes it down, so that the rest of the plan argues from a spec that matches the code. It changes no code.

**Files:**
- Modify: `docs/superpowers/specs/2026-10-06-quickeval-design.md`

**Interfaces:**
- Consumes: the code at `a63ffab`: `server/routes/tests.ts`, `server/routes/upload.ts`, `server/routes/submissions.ts`, `server/db/results.ts`, `src/upload/`, `src/admin/testPage/`.
- Produces: spec text only: §7.1 (columns of migrations 0007 to 0011), §8.4 (the selection), §9 (the test page), §10 and §10.1 (the two links, the result page), §11.1 and §11.2 (the routes), §11.3 and §12.3 (the barem comments), §12.5 (confidence).

- [ ] **Step 1: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
  upload_token TEXT UNIQUE,                -- made by Start test
  started_at TEXT,
```

Replace it with:

```markdown
  upload_token TEXT UNIQUE,                -- made by Start test
  multi_upload_token TEXT UNIQUE,          -- the link for many students on one phone; made only when the teacher asks
  results_open INTEGER NOT NULL DEFAULT 0, -- 1: every student's result page is open (§10.1)
  started_at TEXT,
```

- [ ] **Step 2: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
  barem_file_key TEXT, barem_file_name TEXT, barem_file_type TEXT,
  files_version INTEGER NOT NULL DEFAULT 0,  -- +1 with each new test or barem file (§11.3)
  exercise_list_json TEXT,
```

Replace it with:

```markdown
  barem_file_key TEXT, barem_file_name TEXT, barem_file_type TEXT,
  barem_notes TEXT NOT NULL DEFAULT '',    -- the teacher's extra comments for the barem, max 2000 chars
  files_version INTEGER NOT NULL DEFAULT 0,  -- +1 with each new test or barem file or new notes (§11.3)
  exercise_list_json TEXT,
```

- [ ] **Step 3: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
  session_hash TEXT UNIQUE,                -- SHA-256 hex of the device secret
  auto_submitted INTEGER NOT NULL DEFAULT 0, -- 1: included at evaluation start without Confirm
```

Replace it with:

```markdown
  session_hash TEXT UNIQUE,                -- SHA-256 hex of the device secret
  result_token TEXT UNIQUE,                -- the secret of the student's result page: 24 chars from a-z2-7 (120 bits)
  results_open INTEGER NOT NULL DEFAULT 0, -- 1: the teacher published this result alone (§10.1)
  auto_submitted INTEGER NOT NULL DEFAULT 0, -- 1: included at evaluation start without Confirm
```

- [ ] **Step 4: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
  comment TEXT NOT NULL,
  confidence TEXT NOT NULL,                -- high | medium | low
  needs_review INTEGER NOT NULL,
```

Replace it with:

```markdown
  comment TEXT NOT NULL,
  confidence TEXT NOT NULL,                -- very_low | low | medium | high | very_high
  needs_review INTEGER NOT NULL,
```

- [ ] **Step 5: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown

Migrations add the tables in the plan that needs them: Plan 1 adds `teachers`, `classes`, `students`, and `enrollments`. Plan 2 adds `tests`, `submissions`, and `submission_files`. Plan 3a adds `evaluations`, `evaluation_items`, `settings`, and `runner_state`. Plan 3b adds `tests.files_version`. Plan 4a adds `evaluations.pages_reviewed_at`.

```

Replace it with:

```markdown

Migrations add the tables in the plan that needs them: Plan 1 adds `teachers`, `classes`, `students`, and `enrollments`. Plan 2 adds `tests`, `submissions`, and `submission_files`. Plan 3a adds `evaluations`, `evaluation_items`, `settings`, and `runner_state`. Plan 3b adds `tests.files_version`. Plan 4a adds `evaluations.pages_reviewed_at`. Five later migrations came with the teacher's own changes: 0007 (confidence in five steps), 0008 (`tests.barem_notes`), 0009 (`tests.results_open`, `submissions.result_token`), 0010 (`tests.multi_upload_token`), and 0011 (`submissions.results_open`).

```

- [ ] **Step 6: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
- "Now": sets `status = 'evaluating'`, `evaluation_started_at = now`, and clears `evaluation_at`. Submissions in `uploading` that have at least one file become `submitted` with `auto_submitted = 1`. Uploading submissions with no files are left as they are. Then the API sends `repository_dispatch` with `event_type: "evaluate-now"`, so the robot starts in about 1 minute. If the GitHub token is missing, the robot starts at the next 10-minute check, and the UI says so.
- "Schedule": the teacher picks a future time, at most 60 days ahead; the browser sends it as a UTC ISO time. It is saved in `evaluation_at`. The test stays `open` until then (§8.3).
```

Replace it with:

```markdown
- "Now": sets `status = 'evaluating'`, `evaluation_started_at = now`, and clears `evaluation_at`. Submissions in `uploading` that have at least one file become `submitted` with `auto_submitted = 1`. Uploading submissions with no files are left as they are. Then the API sends `repository_dispatch` with `event_type: "evaluate-now"`, so the robot starts in about 1 minute. If the GitHub token is missing, the robot starts at the next 10-minute check, and the UI says so.
- "Now" for a selection: the request names the uploads to grade (`submissionIds`, 1-500). Only those become `submitted`; an upload with files that was not selected goes back to `uploading` with its files, so the robot ignores it until the teacher reopens the uploads and evaluates it. A selection is refused with a schedule, and it needs at least one selected upload with files.
- "Schedule": the teacher picks a future time, at most 60 days ahead; the browser sends it as a UTC ISO time. It is saved in `evaluation_at`. The test stays `open` until then (§8.3).
```

- [ ] **Step 7: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
- Header: code, class, title, status chip, date and hour (`started_at`).
- Files: test and barem. For each: upload/replace (PDF or `.docx`, ≤ 25 MB) and view.
- Actions, shown by status:
  - draft: **Începe testul** (Start test).
  - open: link with Copy button, QR code (full-screen view), **Pornește evaluarea** (now), **Programează** (pick a time), cancel the schedule.
  - evaluating/done: **Redeschide încărcarea** (Reopen uploads).
```

Replace it with:

```markdown
- Header: code, class, title, status chip, date and hour (`started_at`).
- Files: test and barem. For each: upload/replace (PDF or `.docx`, ≤ 25 MB) and view. Under them, **Comentarii la barem**: the teacher's extra comments (max 2000 chars). The robot reads them as part of the barem. New comments act like a new barem file: the exercise list is made again.
- Actions, shown by status:
  - draft: **Începe testul** (Start test).
  - open: link with Copy button, QR code (full-screen view), **Pornește evaluarea acum** (the teacher selects uploads in the table first; the button needs at least one selected upload with files, and the unselected uploads wait for a later evaluation, §8.4), **Programează** (pick a time; it grades every upload), cancel the schedule. **Arată linkurile** and **Ascunde linkurile** show or hide the link section (the choice stays in the browser). **Creează linkul pentru mai multe încărcări** makes the second link of §10, for one phone that uploads for several students.
  - any status after Start test: **Publică rezultatele** opens the result pages of all students (**Oprește accesul la rezultate** closes them, and takes back the results published one by one). In the uploads table, **Publică** and **Oprește publicarea** open or close one student's page, and **Link rezultat** shows the link to share (copy, WhatsApp).
  - evaluating/done: **Redeschide încărcarea** (Reopen uploads).
```

- [ ] **Step 8: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
2. **Pick a name**: students in state `done` are shown with ✓ and cannot be picked. A tap on a name asks "Ești <name>?" first, because the upload then belongs to that name on this phone.
3. **Device lock**: `POST /api/u/<token>/sessions { studentId }`.
```

Replace it with:

```markdown
2. **Pick a name**: students in state `done` are shown with ✓ and cannot be picked. A tap on a name asks "Ești <name>?" first, because the upload then belongs to that name on this phone.
   - The default link sends one upload from a phone and then locks on that phone: it shows the result links kept on that phone and no name list, so a student cannot upload for a classmate; it tells the student to ask the teacher for the other link. The second link (`multi_upload_token`, `multi: true` in `GET /api/u/<token>`) never locks: it serves one phone that uploads for several students in turn. Both links open the same test and the same upload rows.
3. **Device lock**: `POST /api/u/<token>/sessions { studentId }`.
```

- [ ] **Step 9: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
5. **Preview**: photos show as thumbnails. A tap opens the photo full-screen. A PDF shows as a row with its name and size: the student picked the file, and a PDF made in the page cannot open reliably in a new tab (Android downloads it, and the page's security policy can block it). Each file has a delete button until Confirm. The teacher opens every file, PDFs too, from the teacher app.
6. **Confirm**: "Am trimis tot" asks "Ești sigur? După confirmare nu mai poți schimba nimic." Then `POST /api/u/<token>/confirm`, and the status becomes `submitted`. The success screen shows the file count.
7. **Photo tips** on the upload screen: good light, the whole page in the frame, one page per photo, pages in order.

```

Replace it with:

```markdown
5. **Preview**: photos show as thumbnails. A tap opens the photo full-screen. A PDF shows as a row with its name and size: the student picked the file, and a PDF made in the page cannot open reliably in a new tab (Android downloads it, and the page's security policy can block it). Each file has a delete button until Confirm. The teacher opens every file, PDFs too, from the teacher app.
6. **Confirm**: "Am trimis tot" asks "Ești sigur? După confirmare nu mai poți schimba nimic." Then `POST /api/u/<token>/confirm`, and the status becomes `submitted`. The success screen shows the file count and the student's result link (`/u/rezultat/<resultToken>`); the phone keeps the link.
7. **Photo tips** on the upload screen: good light, the whole page in the frame, one page per photo, pages in order.

### 10.1 Result page (`/u/rezultat/<resultToken>`)

- Each upload has its own secret link, made when the student sends it (older uploads get it when the teacher asks for the link).
- The page opens only while the test keeps its results open (`tests.results_open`) or the teacher published this upload alone (`submissions.results_open`). Before that, the API answers 403 `results_closed` and the page says the results are not available yet. An unknown link is 404 `unknown_link`. Closing the results of the test also takes back the single publishes, and the student's files stop opening.
- It shows the student's name, the test, the grade out of 10, the points per exercise with the student's answer and the comment, the summary, what went well, and the recommendations. Before grading it says the result is not ready. The student can also open the files of the upload. It never shows the robot's confidence, review reasons, or checks, and no text tells that AI graded the work.
- The page is read-only.

```

- [ ] **Step 10: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
| `PATCH /tests/:code` `{ title }` | Rename. |
| `DELETE /tests/:code` | Delete the test and its files. |
```

Replace it with:

```markdown
| `PATCH /tests/:code` `{ title }` | Rename. |
| `PUT /tests/:code/barem-notes` `{ notes }` | The teacher's comments for the barem (max 2000 chars). Like a new barem file: allowed in any status except `evaluating` (while evaluating, only when the exercise list is `problem` or `failed`); `files_version` goes up by 1 and the exercise list is made again. Answers `{ baremNotes, robot }`. |
| `POST /tests/:code/multi-link` | The second upload link, for many students on one phone. 409 `not_started` for a draft test; answers the kept link when there is one. |
| `POST /tests/:code/results/open`, `POST /tests/:code/results/close` | Opens or closes the result pages of the whole test. Closing also takes back the pages published one by one. Answers `{ resultsOpen }`. |
| `DELETE /tests/:code` | Delete the test and its files. |
```

- [ ] **Step 11: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
| `POST /tests/:code/start` | draft → open. |
| `POST /tests/:code/evaluate` `{ at?: string }` | No `at`, or `at` in the past: start now. Future `at`: schedule. |
| `DELETE /tests/:code/schedule` | Cancel the schedule. |
```

Replace it with:

```markdown
| `POST /tests/:code/start` | draft → open. |
| `POST /tests/:code/evaluate` `{ at?: string, submissionIds?: number[] }` | No `at`, or `at` in the past: start now (with `submissionIds`: only those uploads, §8.4). Future `at`: schedule (not with `submissionIds`). |
| `DELETE /tests/:code/schedule` | Cancel the schedule. |
```

- [ ] **Step 12: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
| `GET /submissions/:id` | Submission, test status, last error, files, evaluation (with `gradedAt`, the time the robot wrote it), and items. |
| `PATCH /submissions/:id/evaluation` `{ gradedAt, pagesReviewed }` | The teacher checked the pages that the robot could not read: they stop counting as an item to check. Only for the graded result of `gradedAt`: another result gets 409 `not_graded`, a body without `gradedAt` 400, an unknown submission or one of another teacher 404. |
| `GET /submissions/:id/files/:fileId` | Stream a student file. |
| `POST /submissions/:id/reset` | Delete the files, the evaluation, and the row, so the student can start again. |
```

Replace it with:

```markdown
| `GET /submissions/:id` | Submission, test status, last error, files, evaluation (with `gradedAt`, the time the robot wrote it), and items. |
| `PATCH /submissions/:id/evaluation` `{ gradedAt, pagesReviewed?, summary?, strengths?, recommendations? }` | The teacher checked the pages that the robot could not read: they stop counting as an item to check. The same call corrects the final sections: `summary` (1-1500 chars), `strengths` and `recommendations` (at most 5 entries of 1-300 chars). At least one field. Only for the graded result of `gradedAt`: another result gets 409 `not_graded`, a body without `gradedAt` 400, an unknown submission or one of another teacher 404. |
| `GET /submissions/:id/files/:fileId` | Stream a student file. |
| `GET /submissions/:id/result-link` | The secret of the student's result page; makes it for an older upload that has none. |
| `POST /submissions/:id/results/open`, `POST /submissions/:id/results/close` | Publishes or takes back one student's result page. Answers `{ resultsOpen }`: true also while the test keeps all results open. |
| `POST /submissions/:id/reset` | Delete the files, the evaluation, and the row, so the student can start again. |
```

- [ ] **Step 13: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
|---|---|
| `GET /api/u/:token` | Test info and the name list (§10). |
| `POST /api/u/:token/sessions` `{ studentId }` | Start or resume an upload (§10.3). |
```

Replace it with:

```markdown
|---|---|
| `GET /api/u/:token` | Test info, the name list (§10), and `multi`: true for the second link, which never locks. |
| `POST /api/u/:token/sessions` `{ studentId }` | Start or resume an upload (§10.3). |
```

- [ ] **Step 14: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
| `DELETE /api/u/:token/files/:fileId` | Delete one of this session's own files (status `uploading` only). |
| `POST /api/u/:token/confirm` | uploading → submitted. Needs at least 1 file. |

```

Replace it with:

```markdown
| `DELETE /api/u/:token/files/:fileId` | Delete one of this session's own files (status `uploading` only). |
| `POST /api/u/:token/confirm` | uploading → submitted. Needs at least 1 file. Answers `{ status, fileCount, resultToken }`. |
| `GET /api/u/rezultat/:resultToken` | The student's result page (§10.1). 404 `unknown_link`, 403 `results_closed`. |
| `GET /api/u/rezultat/:resultToken/files/:fileId` | Stream one of the student's files, only while the page is open. |

```

- [ ] **Step 15: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
| `GET /tasks` | `{ exerciseLists: number[], pendingGrading: number, analyses: number[] }` (test ids). |
| `GET /tests/:id` | Id, `filesVersion`, file types (test, barem), exercise list. Only while the test is `evaluating` (else 404, as for a test that does not exist). The robot reads it before the files. |
| `GET /tests/:id/files/:kind` | Stream the test or barem file. Only while the test is `evaluating` (else 404). |
```

Replace it with:

```markdown
| `GET /tasks` | `{ exerciseLists: number[], pendingGrading: number, analyses: number[] }` (test ids). |
| `GET /tests/:id` | Id, `filesVersion`, file types (test, barem), the exercise list, and `baremNotes` (the teacher's comments for the barem; "" when none). Only while the test is `evaluating` (else 404, as for a test that does not exist). The robot reads it before the files. |
| `GET /tests/:id/files/:kind` | Stream the test or barem file. Only while the test is `evaluating` (else 404). |
```

- [ ] **Step 16: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
barem/barem.pdf      or barem/barem.md + barem/media/...
exercises.json       (grade mode)    the exercise list
```

Replace it with:

```markdown
barem/barem.pdf      or barem/barem.md + barem/media/...
barem/notes.md       (when the teacher added comments to the barem)
exercises.json       (grade mode)    the exercise list
```

- [ ] **Step 17: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
    comment: string,              // Romanian, to the student: what is right, what is wrong, why
    confidence: "high" | "medium" | "low",
    needsReview: boolean,
```

Replace it with:

```markdown
    comment: string,              // Romanian, to the student: what is right, what is wrong, why
    confidence: "very_high" | "high" | "medium" | "low" | "very_low",   // 5 (very sure) to 1 (a guess)
    needsReview: boolean,
```

- [ ] **Step 18: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
  - Points are rounded to 2 decimals. Points outside `[0, maxPoints]` are clamped and flagged with the reason "Punctaj în afara intervalului", before the robot's own reason.
  - `confidence = "low"` always means `needsReview = true`.
  - A non-empty `unreadable` list sets `evaluations.needs_review = 1`.
```

Replace it with:

```markdown
  - Points are rounded to 2 decimals. Points outside `[0, maxPoints]` are clamped and flagged with the reason "Punctaj în afara intervalului", before the robot's own reason.
  - `confidence = "low"` or `"very_low"` always means `needsReview = true`.
  - A non-empty `unreadable` list sets `evaluations.needs_review = 1`.
```

- [ ] **Step 19: Run all tests**

Run: `npm test`
Expected: PASS. `Test Files  65 passed (65)`, `Tests  840 passed (840)`.

- [ ] **Step 20: Commit**

```bash
git add docs
git commit -m "Write the result pages, the two upload links, the barem comments, and the selection for Start evaluation into the spec"
```

---

### Task 2: An action on one upload names the upload the page shows

Reset, Reîncearcă, publishing or taking back a student's result page, and the student's result link act on an upload by its id. Ids of deleted rows come back: after a reset of the newest upload, the next upload (of any student) gets its id, and a page opened before could reset it, retry it, publish its result to the class, or make a link to it. Each of these requests now sends `startedAt`, the time the upload on the page started.

**Files:**
- Modify: `shared/api.ts`, `server/errors.ts`, `server/db/submissions.ts`, `server/db/lifecycle.ts`, `server/db/results.ts`, `server/routes/submissions.ts`, `src/admin/api.ts`, `src/admin/testPage/ResultLink.tsx`, `src/admin/testPage/UploadsTable.tsx`, `src/admin/pages/SubmissionPage.tsx`, `src/test/fakeApi.ts`, `server/test/fixtures.ts`, `server/AGENTS.md`, `docs/superpowers/plans/plan-4a-followups.md`, `docs/superpowers/specs/2026-10-06-quickeval-design.md`
- Test: `server/routes/submissions.test.ts`, `server/routes/corrections.test.ts`, `server/routes/regrade.test.ts`, `server/routes/results.test.ts`, `server/routes/robotProblems.test.ts`, `server/routes/runnerGrading.test.ts`, `src/admin/api.test.ts`, `src/admin/pages/SubmissionPage.test.tsx`, `src/admin/pages/TestPage.test.tsx` (all modified)

**Interfaces:**
- Consumes: `getTeacherSubmission`, `notFound`, `readJson`.
- Produces:
  - `shownUpload` (zod `{ startedAt: string }`) and `ShownUploadBody` in `shared/api.ts`.
  - `uploadChanged()` (409 `upload_changed`, "Încărcarea s-a schimbat. Reîncarcă pagina.") in `server/errors.ts`.
  - `ShownUpload { teacherId, submissionId, startedAt }`, `uploadStartedAt(db, teacherId, submissionId): Promise<string | null>`, and `deleteSubmissionRow(db, shown): Promise<boolean>` in `server/db/submissions.ts`.
  - `retrySubmission(db, shown, now)`, `setSubmissionResultsOpen(db, shown, open)`, `teacherResultToken(db, shown)` take a `ShownUpload`.
  - `startedAtOf(api, submissionId)` in `server/test/fixtures.ts`.
  - Client: `resetSubmission(id, startedAt)`, `retrySubmission(id, startedAt)`, `setSubmissionResultsOpen(id, startedAt, open)`, `getResultLink(id, startedAt)`; `ResultLink` takes `startedAt`.
  - The routes: `POST /submissions/:id/reset`, `/retry`, `/results/open`, `/results/close` with `{ startedAt }`, and `GET /submissions/:id/result-link?startedAt=…`.

- [ ] **Step 1: Add the helper to the test fixtures**

The tests of this task call `startedAtOf`. It reads the time an upload started.

- [ ] **Step 2: Edit `server/test/fixtures.ts`**

Find this block:

```ts
  return submissionId;
}
```

Replace it with:

```ts
  return submissionId;
}

// The time an upload started: what a teacher's page sends to name it.
export async function startedAtOf(api: TestApi, submissionId: number): Promise<string> {
  const row = await api.db.prepare('SELECT started_at FROM submissions WHERE id = ?').bind(submissionId).first<{ started_at: string }>();
  return row!.started_at;
}
```

- [ ] **Step 3: Edit `server/routes/submissions.test.ts`**

Find this block:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
```

Replace it with:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest, startedAtOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
```

- [ ] **Step 4: Edit `server/routes/submissions.test.ts`**

Find this block:

```ts
  it('deletes the upload and its files, so the student can start again', async () => {
    const res = await api.request('POST', `/api/admin/submissions/${submissionId}/reset`);
    expect(res.status).toBe(200);
```

Replace it with:

```ts
  it('deletes the upload and its files, so the student can start again', async () => {
    const res = await api.request('POST', `/api/admin/submissions/${submissionId}/reset`, { startedAt: await startedAtOf(api, submissionId) });
    expect(res.status).toBe(200);
```

- [ ] **Step 5: Edit `server/routes/submissions.test.ts`**

Find this block:

```ts
    const foreignId = await addSubmission(api, foreign.code, foreign.studentId, { files: 1 });
    expect((await api.request('POST', `/api/admin/submissions/${foreignId}/reset`)).status).toBe(404);
    const row = await api.db.prepare('SELECT COUNT(*) AS n FROM submission_files WHERE submission_id = ?').bind(foreignId).first<{ n: number }>();
```

Replace it with:

```ts
    const foreignId = await addSubmission(api, foreign.code, foreign.studentId, { files: 1 });
    expect((await api.request('POST', `/api/admin/submissions/${foreignId}/reset`, { startedAt: await startedAtOf(api, foreignId) })).status).toBe(404);
    const row = await api.db.prepare('SELECT COUNT(*) AS n FROM submission_files WHERE submission_id = ?').bind(foreignId).first<{ n: number }>();
```

- [ ] **Step 6: Edit `server/routes/submissions.test.ts`**

Find this block:

```ts
    expect(row?.n).toBe(1);
  });
});
```

Replace it with:

```ts
    expect(row?.n).toBe(1);
  });
});

describe('a page opened before its upload was reset', () => {
  // Ids of deleted rows come back: the next upload of another student gets the
  // id of the reset one, and the old page must change nothing of it.
  async function reusedId(): Promise<{ oldStartedAt: string; mate: number }> {
    const oldStartedAt = await startedAtOf(api, submissionId);
    const reset = await api.request('POST', `/api/admin/submissions/${submissionId}/reset`, { startedAt: oldStartedAt });
    expect(reset.status).toBe(200);
    const other = await makeClass(api, '7A', ['Dan Ana']);
    const otherCode = await makeTest(api, other.id, 'Alt test');
    const mate = await addSubmission(api, otherCode, other.studentIds[0]!, {
      status: 'failed',
      files: 1,
      startedAt: '2026-10-06T09:00:00.000Z',
    });
    expect(mate).toBe(submissionId);
    return { oldStartedAt, mate };
  }

  const uploadRow = (id: number) =>
    api.db.prepare('SELECT status, results_open, result_token FROM submissions WHERE id = ?').bind(id).first();

  it('does not reset the upload that took its id', async () => {
    const { oldStartedAt, mate } = await reusedId();
    const res = await api.request('POST', `/api/admin/submissions/${mate}/reset`, { startedAt: oldStartedAt });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('upload_changed');
    expect(await uploadRow(mate)).toMatchObject({ status: 'failed' });
    expect((await fileIds(mate)).length).toBe(1);
  });

  it('does not retry it', async () => {
    const { oldStartedAt, mate } = await reusedId();
    const res = await api.request('POST', `/api/admin/submissions/${mate}/retry`, { startedAt: oldStartedAt });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('upload_changed');
    expect(await uploadRow(mate)).toMatchObject({ status: 'failed' });
  });

  it('does not publish or take back its result page, and makes no link for it', async () => {
    const { oldStartedAt, mate } = await reusedId();
    const open = await api.request('POST', `/api/admin/submissions/${mate}/results/open`, { startedAt: oldStartedAt });
    expect(open.status).toBe(409);
    const close = await api.request('POST', `/api/admin/submissions/${mate}/results/close`, { startedAt: oldStartedAt });
    expect(close.status).toBe(409);
    const link = await api.request('GET', `/api/admin/submissions/${mate}/result-link?startedAt=${encodeURIComponent(oldStartedAt)}`);
    expect(link.status).toBe(409);
    expect(await uploadRow(mate)).toMatchObject({ results_open: 0, result_token: null });
  });

  it('answers 400 when the page names no upload start', async () => {
    expect((await api.request('POST', `/api/admin/submissions/${submissionId}/reset`, {})).status).toBe(400);
    expect((await api.request('POST', `/api/admin/submissions/${submissionId}/retry`, {})).status).toBe(400);
    expect((await api.request('POST', `/api/admin/submissions/${submissionId}/results/open`, {})).status).toBe(400);
    expect((await api.request('GET', `/api/admin/submissions/${submissionId}/result-link`)).status).toBe(400);
    expect(await uploadRow(submissionId)).toMatchObject({ status: 'submitted' });
  });
});
```

- [ ] **Step 7: Edit `server/routes/corrections.test.ts`**

Find this block:

```ts
import { correctItem, gradeSql } from '../db/evaluations.ts';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
```

Replace it with:

```ts
import { correctItem, gradeSql } from '../db/evaluations.ts';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest, startedAtOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
```

- [ ] **Step 8: Edit `server/routes/corrections.test.ts`**

Find this block:

```ts
    // gets the same upload id and, once graded, the same item ids.
    expect((await api.request('POST', `/api/admin/submissions/${submissionId}/reset`)).status).toBe(200);
    expect(await gradedUpload(studentIds[1]!, later)).toEqual({ submissionId, items });
```

Replace it with:

```ts
    // gets the same upload id and, once graded, the same item ids.
    expect((await api.request('POST', `/api/admin/submissions/${submissionId}/reset`, { startedAt: await startedAtOf(api, submissionId) })).status).toBe(200);
    expect(await gradedUpload(studentIds[1]!, later)).toEqual({ submissionId, items });
```

- [ ] **Step 9: Edit `server/routes/regrade.test.ts`**

Find this block:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest, robotRequest, setRobotKey } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
```

Replace it with:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest, robotRequest, setRobotKey, startedAtOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
```

- [ ] **Step 10: Edit `server/routes/regrade.test.ts`**

Find this block:

```ts
    // gets the same id, and a newer grading.
    expect((await api.request('POST', `/api/admin/submissions/${id}/reset`)).status).toBe(200);
    expect(await graded(1)).toBe(id);
```

Replace it with:

```ts
    // gets the same id, and a newer grading.
    expect((await api.request('POST', `/api/admin/submissions/${id}/reset`, { startedAt: await startedAtOf(api, id) })).status).toBe(200);
    expect(await graded(1)).toBe(id);
```

- [ ] **Step 11: Edit `server/routes/results.test.ts`**

Find this block:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest, startTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
```

Replace it with:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest, startTest, startedAtOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
```

- [ ] **Step 12: Edit `server/routes/results.test.ts`**

Find this block:

```ts
    const submissionId = await submissionIdOf(pop);
    const first = await api.request('GET', `/api/admin/submissions/${submissionId}/result-link`);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ resultToken });
    expect((await api.request('GET', `/api/admin/submissions/${submissionId}/result-link`)).body).toEqual({ resultToken });

```

Replace it with:

```ts
    const submissionId = await submissionIdOf(pop);
    const first = await api.request('GET', `/api/admin/submissions/${submissionId}/result-link?startedAt=${encodeURIComponent(await startedAtOf(api, submissionId))}`);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ resultToken });
    expect((await api.request('GET', `/api/admin/submissions/${submissionId}/result-link?startedAt=${encodeURIComponent(await startedAtOf(api, submissionId))}`)).body).toEqual({ resultToken });

```

- [ ] **Step 13: Edit `server/routes/results.test.ts`**

Find this block:

```ts
    await api.db.prepare('UPDATE submissions SET result_token = NULL WHERE id = ?').bind(submissionId).run();
    const made = await api.request('GET', `/api/admin/submissions/${submissionId}/result-link`);
    expect(made.body.resultToken).toMatch(RESULT_TOKEN);
    expect((await api.request('GET', `/api/admin/submissions/${submissionId}/result-link`)).body).toEqual(made.body);
  });
```

Replace it with:

```ts
    await api.db.prepare('UPDATE submissions SET result_token = NULL WHERE id = ?').bind(submissionId).run();
    const made = await api.request('GET', `/api/admin/submissions/${submissionId}/result-link?startedAt=${encodeURIComponent(await startedAtOf(api, submissionId))}`);
    expect(made.body.resultToken).toMatch(RESULT_TOKEN);
    expect((await api.request('GET', `/api/admin/submissions/${submissionId}/result-link?startedAt=${encodeURIComponent(await startedAtOf(api, submissionId))}`)).body).toEqual(made.body);
  });
```

- [ ] **Step 14: Edit `server/routes/results.test.ts`**

Find this block:

```ts
    const foreign = await otherTeacherTest(api);
    expect((await api.request('GET', `/api/admin/submissions/${submissionId}/result-link`)).status).toBe(200);
    // The foreign teacher's own upload is unknown to this teacher.
```

Replace it with:

```ts
    const foreign = await otherTeacherTest(api);
    expect((await api.request('GET', `/api/admin/submissions/${submissionId}/result-link?startedAt=${encodeURIComponent(await startedAtOf(api, submissionId))}`)).status).toBe(200);
    // The foreign teacher's own upload is unknown to this teacher.
```

- [ ] **Step 15: Edit `server/routes/results.test.ts`**

Find this block:

```ts

    const opened = await api.request('POST', `/api/admin/submissions/${popSubmission}/results/open`);
    expect(opened.status).toBe(200);
```

Replace it with:

```ts

    const opened = await api.request('POST', `/api/admin/submissions/${popSubmission}/results/open`, { startedAt: await startedAtOf(api, popSubmission) });
    expect(opened.status).toBe(200);
```

- [ ] **Step 16: Edit `server/routes/results.test.ts`**

Find this block:

```ts

    const closed = await api.request('POST', `/api/admin/submissions/${popSubmission}/results/close`);
    expect(closed.status).toBe(200);
```

Replace it with:

```ts

    const closed = await api.request('POST', `/api/admin/submissions/${popSubmission}/results/close`, { startedAt: await startedAtOf(api, popSubmission) });
    expect(closed.status).toBe(200);
```

- [ ] **Step 17: Edit `server/routes/results.test.ts`**

Find this block:

```ts

    await api.request('POST', `/api/admin/submissions/${popSubmission}/results/open`);
    await api.request('POST', `/api/admin/tests/${code}/results/open`);
```

Replace it with:

```ts

    await api.request('POST', `/api/admin/submissions/${popSubmission}/results/open`, { startedAt: await startedAtOf(api, popSubmission) });
    await api.request('POST', `/api/admin/tests/${code}/results/open`);
```

- [ ] **Step 18: Edit `server/routes/results.test.ts`**

Find this block:

```ts
    // Taking back one page changes nothing while the test publishes all.
    expect((await api.request('POST', `/api/admin/submissions/${popSubmission}/results/close`)).body).toEqual({ resultsOpen: true });
    expect((await api.request('GET', `/api/u/rezultat/${popLink.resultToken}`)).status).toBe(200);
```

Replace it with:

```ts
    // Taking back one page changes nothing while the test publishes all.
    expect((await api.request('POST', `/api/admin/submissions/${popSubmission}/results/close`, { startedAt: await startedAtOf(api, popSubmission) })).body).toEqual({ resultsOpen: true });
    expect((await api.request('GET', `/api/u/rezultat/${popLink.resultToken}`)).status).toBe(200);
```

- [ ] **Step 19: Edit `server/routes/results.test.ts`**

Find this block:

```ts
  it('answers 404 for unknown uploads and for uploads of another teacher', async () => {
    expect((await api.request('POST', '/api/admin/submissions/99999/results/open')).status).toBe(404);
    expect((await api.request('POST', '/api/admin/submissions/99999/results/close')).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    const foreignSubmission = await addSubmission(api, foreign.code, foreign.studentId, { status: 'submitted' });
    expect((await api.request('POST', `/api/admin/submissions/${foreignSubmission}/results/open`)).status).toBe(404);
    expect((await api.request('POST', `/api/admin/submissions/${foreignSubmission}/results/close`)).status).toBe(404);
  });
```

Replace it with:

```ts
  it('answers 404 for unknown uploads and for uploads of another teacher', async () => {
    expect((await api.request('POST', '/api/admin/submissions/99999/results/open', { startedAt: 'x' })).status).toBe(404);
    expect((await api.request('POST', '/api/admin/submissions/99999/results/close', { startedAt: 'x' })).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    const foreignSubmission = await addSubmission(api, foreign.code, foreign.studentId, { status: 'submitted' });
    expect((await api.request('POST', `/api/admin/submissions/${foreignSubmission}/results/open`, { startedAt: await startedAtOf(api, foreignSubmission) })).status).toBe(404);
    expect((await api.request('POST', `/api/admin/submissions/${foreignSubmission}/results/close`, { startedAt: await startedAtOf(api, foreignSubmission) })).status).toBe(404);
  });
```

- [ ] **Step 20: Edit `server/routes/robotProblems.test.ts`**

Find this block:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
```

Replace it with:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addSubmission, makeClass, makeTest, otherTeacherTest, startedAtOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
```

- [ ] **Step 21: Edit `server/routes/robotProblems.test.ts`**

Find this block:

```ts
    await addSubmission(api, code, classmateId, { status: 'submitted', files: 1 });
    const res = await api.request('POST', `/api/admin/submissions/${id}/retry`);
    expect(res.status).toBe(200);
```

Replace it with:

```ts
    await addSubmission(api, code, classmateId, { status: 'submitted', files: 1 });
    const res = await api.request('POST', `/api/admin/submissions/${id}/retry`, { startedAt: await startedAtOf(api, id) });
    expect(res.status).toBe(200);
```

- [ ] **Step 22: Edit `server/routes/robotProblems.test.ts`**

Find this block:

```ts
    const id = await failedUpload();
    const res = await api.request('POST', `/api/admin/submissions/${id}/retry`);
    expect(res.body.status).toBe('submitted');
```

Replace it with:

```ts
    const id = await failedUpload();
    const res = await api.request('POST', `/api/admin/submissions/${id}/retry`, { startedAt: await startedAtOf(api, id) });
    expect(res.body.status).toBe('submitted');
```

- [ ] **Step 23: Edit `server/routes/robotProblems.test.ts`**

Find this block:

```ts
    const id = await failedUpload();
    const res = await api.request('POST', `/api/admin/submissions/${id}/retry`);
    expect(res.body).toEqual({ status: 'submitted', robot: null });
```

Replace it with:

```ts
    const id = await failedUpload();
    const res = await api.request('POST', `/api/admin/submissions/${id}/retry`, { startedAt: await startedAtOf(api, id) });
    expect(res.body).toEqual({ status: 'submitted', robot: null });
```

- [ ] **Step 24: Edit `server/routes/robotProblems.test.ts`**

Find this block:

```ts
    const id = await addSubmission(api, code, studentId, { status: 'graded', files: 1 });
    const res = await api.request('POST', `/api/admin/submissions/${id}/retry`);
    expect(res.status).toBe(409);
```

Replace it with:

```ts
    const id = await addSubmission(api, code, studentId, { status: 'graded', files: 1 });
    const res = await api.request('POST', `/api/admin/submissions/${id}/retry`, { startedAt: await startedAtOf(api, id) });
    expect(res.status).toBe(409);
```

- [ ] **Step 25: Edit `server/routes/robotProblems.test.ts`**

Find this block:

```ts
    const id = await addSubmission(api, foreign.code, foreign.studentId, { status: 'failed', files: 1 });
    expect((await api.request('POST', `/api/admin/submissions/${id}/retry`)).status).toBe(404);
    expect(await uploadRow(id)).toMatchObject({ status: 'failed' });
```

Replace it with:

```ts
    const id = await addSubmission(api, foreign.code, foreign.studentId, { status: 'failed', files: 1 });
    expect((await api.request('POST', `/api/admin/submissions/${id}/retry`, { startedAt: await startedAtOf(api, id) })).status).toBe(404);
    expect(await uploadRow(id)).toMatchObject({ status: 'failed' });
```

- [ ] **Step 26: Edit `server/routes/runnerGrading.test.ts`**

Find this block:

```ts
import type { ExerciseList } from '../../shared/schemas.ts';
import { addSubmission, addTestFiles, makeClass, makeTest, ROBOT_KEY, robotRequest, setRobotKey, startTest, testIdOf } from '../test/fixtures.ts';
import { sha256Hex } from '../secrets.ts';
```

Replace it with:

```ts
import type { ExerciseList } from '../../shared/schemas.ts';
import { addSubmission, addTestFiles, makeClass, makeTest, ROBOT_KEY, robotRequest, setRobotKey, startTest, testIdOf, startedAtOf } from '../test/fixtures.ts';
import { sha256Hex } from '../secrets.ts';
```

- [ ] **Step 27: Edit `server/routes/runnerGrading.test.ts`**

Find this block:

```ts

    await api.request('POST', `/api/admin/submissions/${id}/reset`);
    expect((await sendResult(id, { ok: true, result: result([4, 4]), model: 'm' })).status).toBe(404);
```

Replace it with:

```ts

    await api.request('POST', `/api/admin/submissions/${id}/reset`, { startedAt: await startedAtOf(api, id) });
    expect((await sendResult(id, { ok: true, result: result([4, 4]), model: 'm' })).status).toBe(404);
```

- [ ] **Step 28: Edit `src/admin/api.test.ts`**

Find this block:

```ts
import { ApiError, createApiClient, LoginExpiredError, reloadForLogin, studentResultUrl, submissionFileUrl, testFileUrl } from './api.ts';

```

Replace it with:

```ts
import { ApiError, createApiClient, LoginExpiredError, reloadForLogin, studentResultUrl, submissionFileUrl, testFileUrl } from './api.ts';

// The time the upload on the page started.
const STARTED = '2026-10-06T07:15:00.000Z';

```

- [ ] **Step 29: Edit `src/admin/api.test.ts`**

Find this block:

```ts
    expect(await api.retryExerciseList('6E2-26T1')).toBe('dispatched');
    expect(await api.retrySubmission(5)).toBe('dispatched');
    expect(await api.startRobot('6E2-26T1')).toBe('dispatched');
```

Replace it with:

```ts
    expect(await api.retryExerciseList('6E2-26T1')).toBe('dispatched');
    expect(await api.retrySubmission(5, STARTED)).toBe('dispatched');
    expect(await api.startRobot('6E2-26T1')).toBe('dispatched');
```

- [ ] **Step 30: Edit `src/admin/api.test.ts`**

Find this block:

```ts
      ['POST', '/api/admin/tests/6E2-26T1/exercise-list/retry', undefined],
      ['POST', '/api/admin/submissions/5/retry', undefined],
      ['POST', '/api/admin/tests/6E2-26T1/robot', undefined],
```

Replace it with:

```ts
      ['POST', '/api/admin/tests/6E2-26T1/exercise-list/retry', undefined],
      ['POST', '/api/admin/submissions/5/retry', JSON.stringify({ startedAt: STARTED })],
      ['POST', '/api/admin/tests/6E2-26T1/robot', undefined],
```

- [ ] **Step 31: Edit `src/admin/api.test.ts`**

Find this block:

```ts
    await api.deleteTest('6E2-26T1');
    await api.resetSubmission(7);
    expect(fetchImpl.mock.calls.map(([url, init]) => `${init!.method} ${String(url)}`)).toEqual([
```

Replace it with:

```ts
    await api.deleteTest('6E2-26T1');
    await api.resetSubmission(7, STARTED);
    expect(fetchImpl.mock.calls.map(([url, init]) => `${init!.method} ${String(url)}`)).toEqual([
```

- [ ] **Step 32: Edit `src/admin/api.test.ts`**

Find this block:

```ts
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, String(url).endsWith('/result-link') ? { resultToken: 'abcdefghijkmnop2abcdefcd' } : { resultsOpen: true }),
    );
```

Replace it with:

```ts
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, String(url).includes('/result-link') ? { resultToken: 'abcdefghijkmnop2abcdefcd' } : { resultsOpen: true }),
    );
```

- [ ] **Step 33: Edit `src/admin/api.test.ts`**

Find this block:

```ts
    expect(await api.setResultsOpen('6E2-26T1', true)).toBe(true);
    expect(await api.setSubmissionResultsOpen(5, true)).toBe(true);
    expect(await api.getResultLink(5)).toBe('abcdefghijkmnop2abcdefcd');
    expect(fetchImpl.mock.calls.map(([url, init]) => `${init!.method} ${String(url)}`)).toEqual([
```

Replace it with:

```ts
    expect(await api.setResultsOpen('6E2-26T1', true)).toBe(true);
    expect(await api.setSubmissionResultsOpen(5, STARTED, true)).toBe(true);
    expect(await api.getResultLink(5, STARTED)).toBe('abcdefghijkmnop2abcdefcd');
    expect(fetchImpl.mock.calls.map(([url, init]) => `${init!.method} ${String(url)}`)).toEqual([
```

- [ ] **Step 34: Edit `src/admin/api.test.ts`**

Find this block:

```ts
      'POST /api/admin/submissions/5/results/open',
      'GET /api/admin/submissions/5/result-link',
    ]);
  });
```

Replace it with:

```ts
      'POST /api/admin/submissions/5/results/open',
      `GET /api/admin/submissions/5/result-link?startedAt=${encodeURIComponent(STARTED)}`,
    ]);
    // The actions on one upload name the upload the page shows.
    expect(fetchImpl.mock.calls[1]![1]!.body).toBe(JSON.stringify({ startedAt: STARTED }));
  });
```

- [ ] **Step 35: Edit `src/admin/pages/SubmissionPage.test.tsx`**

Find this block:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Reîncearcă' }));
    expect(api.retrySubmission).toHaveBeenCalledWith(5);
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul.');
```

Replace it with:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Reîncearcă' }));
    expect(api.retrySubmission).toHaveBeenCalledWith(5, '2026-10-06T07:20:00.000Z');
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul.');
```

- [ ] **Step 36: Edit `src/admin/pages/SubmissionPage.test.tsx`**

Find this block:

```tsx
    await userEvent.click(await screen.findByRole('button', { name: 'Resetează' }));
    expect(api.resetSubmission).toHaveBeenCalledWith(5);
    await expectLocation('/teste/6E2-26T1');
```

Replace it with:

```tsx
    await userEvent.click(await screen.findByRole('button', { name: 'Resetează' }));
    expect(api.resetSubmission).toHaveBeenCalledWith(5, '2026-10-06T07:20:00.000Z');
    await expectLocation('/teste/6E2-26T1');
```

- [ ] **Step 37: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
import { robotStartMessage } from '../../ui/format.ts';
import { createFakeApi, FAKE_MULTI_TOKEN, FAKE_TOKEN, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
```

Replace it with:

```tsx
import { robotStartMessage } from '../../ui/format.ts';
import { createFakeApi, FAKE_MULTI_TOKEN, FAKE_STARTED_AT, FAKE_TOKEN, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
```

- [ ] **Step 38: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(confirm).toHaveBeenLastCalledWith('Ștergi încărcarea elevului Stan Eva? Elevul o poate lua de la capăt.');
    expect(api.resetSubmission).toHaveBeenCalledWith(6);
    expect(await within(stan).findByText('Nu a trimis')).toBeInTheDocument();
```

Replace it with:

```tsx
    expect(confirm).toHaveBeenLastCalledWith('Ștergi încărcarea elevului Stan Eva? Elevul o poate lua de la capăt.');
    expect(api.resetSubmission).toHaveBeenCalledWith(6, '2026-10-06T07:25:00.000Z');
    expect(await within(stan).findByText('Nu a trimis')).toBeInTheDocument();
```

- [ ] **Step 39: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    await userEvent.click(within(stan).getByRole('button', { name: 'Reîncearcă' }));
    expect(api.retrySubmission).toHaveBeenCalledWith(6);
    expect(await within(stan).findByText('Trimis')).toBeInTheDocument();
```

Replace it with:

```tsx
    await userEvent.click(within(stan).getByRole('button', { name: 'Reîncearcă' }));
    expect(api.retrySubmission).toHaveBeenCalledWith(6, FAKE_STARTED_AT);
    expect(await within(stan).findByText('Trimis')).toBeInTheDocument();
```

- [ ] **Step 40: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    await userEvent.click(within(pop).getByRole('button', { name: 'Publică' }));
    expect(api.setSubmissionResultsOpen).toHaveBeenCalledWith(5, true);
    expect(await within(pop).findByRole('button', { name: 'Oprește publicarea' })).toBeInTheDocument();
```

Replace it with:

```tsx
    await userEvent.click(within(pop).getByRole('button', { name: 'Publică' }));
    expect(api.setSubmissionResultsOpen).toHaveBeenCalledWith(5, FAKE_STARTED_AT, true);
    expect(await within(pop).findByRole('button', { name: 'Oprește publicarea' })).toBeInTheDocument();
```

- [ ] **Step 41: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    await userEvent.click(within(pop).getByRole('button', { name: 'Oprește publicarea' }));
    expect(api.setSubmissionResultsOpen).toHaveBeenCalledWith(5, false);
    expect(await within(pop).findByRole('button', { name: 'Publică' })).toBeInTheDocument();
```

Replace it with:

```tsx
    await userEvent.click(within(pop).getByRole('button', { name: 'Oprește publicarea' }));
    expect(api.setSubmissionResultsOpen).toHaveBeenCalledWith(5, FAKE_STARTED_AT, false);
    expect(await within(pop).findByRole('button', { name: 'Publică' })).toBeInTheDocument();
```

- [ ] **Step 42: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    await userEvent.click(links[0]!);
    expect(api.getResultLink).toHaveBeenCalledWith(5);
    const url = `${window.location.origin}/u/rezultat/result-token-5`;
```

Replace it with:

```tsx
    await userEvent.click(links[0]!);
    expect(api.getResultLink).toHaveBeenCalledWith(5, FAKE_STARTED_AT);
    const url = `${window.location.origin}/u/rezultat/result-token-5`;
```

- [ ] **Step 43: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
const notFound = () => new ApiError(404, 'not_found', 'Nu am găsit ce cauți.');

```

Replace it with:

```ts
const notFound = () => new ApiError(404, 'not_found', 'Nu am găsit ce cauți.');
const uploadChanged = () => new ApiError(409, 'upload_changed', 'Încărcarea s-a schimbat. Reîncarcă pagina.');

```

- [ ] **Step 44: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    fileCount: 0,
    startedAt: null,
    submittedAt: null,
```

Replace it with:

```ts
    fileCount: 0,
    // An upload that exists started at some time; the row of a student who
    // has not started has none.
    startedAt: overrides.submissionId == null ? null : FAKE_STARTED_AT,
    submittedAt: null,
```

- [ ] **Step 45: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    if (!found) throw notFound();
    return found;
  };
  // The uploads table shows the grade and the items to check of the upload.
```

Replace it with:

```ts
    if (!found) throw notFound();
    return found;
  };
  // Like the server: an action names the upload the page shows by the time it
  // started, and an upload that started at another time is not that upload.
  const requireShown = (submissionId: number, startedAt: string) => {
    const detail = submissions.find((s) => s.id === submissionId);
    const row = tests.flatMap((t) => t.uploads).find((u) => u.submissionId === submissionId);
    const current = detail?.startedAt ?? row?.startedAt ?? null;
    if (current === null) throw notFound();
    if (current !== startedAt) throw uploadChanged();
  };
  // The uploads table shows the grade and the items to check of the upload.
```

- [ ] **Step 46: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    // own upload is published.
    setSubmissionResultsOpen: vi.fn(async (submissionId: number, open: boolean) => {
      for (const detail of tests) {
```

Replace it with:

```ts
    // own upload is published.
    setSubmissionResultsOpen: vi.fn(async (submissionId: number, startedAt: string, open: boolean) => {
      requireShown(submissionId, startedAt);
      for (const detail of tests) {
```

- [ ] **Step 47: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    getSubmission: vi.fn(async (submissionId: number) => structuredClone(findSubmission(submissionId))),
    getResultLink: vi.fn(async (submissionId: number) => {
      const found = submissions.find((s) => s.id === submissionId);
```

Replace it with:

```ts
    getSubmission: vi.fn(async (submissionId: number) => structuredClone(findSubmission(submissionId))),
    getResultLink: vi.fn(async (submissionId: number, startedAt: string) => {
      requireShown(submissionId, startedAt);
      const found = submissions.find((s) => s.id === submissionId);
```

- [ ] **Step 48: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    }),
    resetSubmission: vi.fn(async (submissionId: number) => {
      for (const detail of tests) {
```

Replace it with:

```ts
    }),
    resetSubmission: vi.fn(async (submissionId: number, startedAt: string) => {
      requireShown(submissionId, startedAt);
      for (const detail of tests) {
```

- [ ] **Step 49: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    }),
    retrySubmission: vi.fn(async (submissionId: number): Promise<RobotStart | null> => {
      for (const detail of tests) {
```

Replace it with:

```ts
    }),
    retrySubmission: vi.fn(async (submissionId: number, startedAt: string): Promise<RobotStart | null> => {
      requireShown(submissionId, startedAt);
      for (const detail of tests) {
```

- [ ] **Step 50: Run the tests to see them fail**

Run: `npx vitest run server/routes/submissions.test.ts server/routes/results.test.ts server/routes/robotProblems.test.ts src/admin/api.test.ts src/admin/pages/SubmissionPage.test.tsx src/admin/pages/TestPage.test.tsx`
Expected: FAIL. `Test Files  4 failed | 5 passed (9)`, `Tests  13 failed | 188 passed (201)`. Failing tests: "calls the evaluation routes"; "opens and closes the student results and reads one result link"; "shows why grading failed and retries it"; "resets the upload after the teacher confirms and goes back to the test"; "resets an upload only after the teacher confirms"; "keeps the page when a refresh fails, and says why"; "shows the grades, the items to check, and a failed grading to try again"; "publishes one result while the rest stays unpublished" and 5 more. Errors such as: `AssertionError: expected [ [ 'POST', …(2) ], …(7) ] to deeply equal [ [ 'POST', …(2) ], …(7) ]`; `AssertionError: expected [ …(3) ] to deeply equal [ …(3) ]`; `AssertionError: expected "vi.fn()" to be called with arguments: [ 5, '2026-10-06T07:20:00.000Z' ]`. Tests of this task that do not fail yet are guards: they pass before and after.

- [ ] **Step 51: Edit `shared/api.ts`**

Find this block:

```ts
export const regradeBody = z.object({ gradedAt: shownGrading });

```

Replace it with:

```ts
export const regradeBody = z.object({ gradedAt: shownGrading });

// An action on one upload that does not need its grading (Resetează,
// Reîncearcă, publish or take back its result page, its result link): the
// page names the upload it shows by the time the upload started. That time is
// written once, and a new upload that got the id of a deleted one has a
// later time, so an old page changes nothing of another student.
export const shownUpload = z.object({ startedAt: z.string({ message: 'Reîncarcă pagina.' }) });

export type ShownUploadBody = z.output<typeof shownUpload>;

```

- [ ] **Step 52: Edit `server/errors.ts`**

Find this block:

```ts

export function isUniqueViolation(err: unknown): boolean {
```

Replace it with:

```ts

// A page opened before its upload was reset names an upload that is gone;
// the id may belong to a new upload of another student by now.
export function uploadChanged(): ApiError {
  return new ApiError(409, 'upload_changed', 'Încărcarea s-a schimbat. Reîncarcă pagina.');
}

export function isUniqueViolation(err: unknown): boolean {
```

- [ ] **Step 53: Edit `server/db/submissions.ts`**

Find this block:

```ts

// Deletes an upload; its file rows go with it (ON DELETE CASCADE).
export async function deleteSubmissionRow(db: D1Database, submissionId: number): Promise<void> {
  await db.prepare('DELETE FROM submissions WHERE id = ?').bind(submissionId).run();
}
```

Replace it with:

```ts

// The upload a teacher's page shows: its id, and the time it started
// (`submissions.started_at`, written once). Ids of deleted rows come back, so a
// write from a page opened before a reset names both and changes nothing when
// the upload now at that id started at another time.
export interface ShownUpload {
  teacherId: number;
  submissionId: number;
  startedAt: string;
}

// When the upload started, or null when it is not an upload of one of the
// teacher's tests.
export async function uploadStartedAt(db: D1Database, teacherId: number, submissionId: number): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT s.started_at FROM submissions s JOIN tests t ON t.id = s.test_id
       WHERE s.id = ? AND t.teacher_id = ?`,
    )
    .bind(submissionId, teacherId)
    .first<{ started_at: string }>();
  return row?.started_at ?? null;
}

// Deletes the upload the page shows; its file rows go with it (ON DELETE
// CASCADE). False when that upload is gone, or is another one now.
export async function deleteSubmissionRow(db: D1Database, shown: ShownUpload): Promise<boolean> {
  const row = await db
    .prepare(
      `DELETE FROM submissions
       WHERE id = ? AND started_at = ?
         AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND t.teacher_id = ?)
       RETURNING id`,
    )
    .bind(shown.submissionId, shown.startedAt, shown.teacherId)
    .first<{ id: number }>();
  return row !== null;
}
```

- [ ] **Step 54: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
import type { ShownResult } from './evaluations.ts';

```

Replace it with:

```ts
import type { ShownResult } from './evaluations.ts';
import type { ShownUpload } from './submissions.ts';

```

- [ ] **Step 55: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
// finished test goes back to evaluation (spec §8.5). Returns the test's
// status, or null when the upload had not failed.
export async function retrySubmission(db: D1Database, teacherId: number, submissionId: number, now: string): Promise<TestStatus | null> {
  const [retried, , test] = await db.batch<{ test_id?: number; status?: TestStatus }>([
```

Replace it with:

```ts
// finished test goes back to evaluation (spec §8.5). Returns the test's
// status, or null when the upload the page shows had not failed (or is
// another upload now: ids of deleted rows come back).
export async function retrySubmission(db: D1Database, shown: ShownUpload, now: string): Promise<TestStatus | null> {
  const { teacherId, submissionId, startedAt } = shown;
  const [retried, , test] = await db.batch<{ test_id?: number; status?: TestStatus }>([
```

- [ ] **Step 56: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
        `UPDATE submissions SET status = 'submitted', attempts = 0, last_error = NULL, run_id = NULL
         WHERE id = ? AND status = 'failed'
           AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND t.teacher_id = ?)
```

Replace it with:

```ts
        `UPDATE submissions SET status = 'submitted', attempts = 0, last_error = NULL, run_id = NULL
         WHERE id = ? AND started_at = ? AND status = 'failed'
           AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND t.teacher_id = ?)
```

- [ ] **Step 57: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
         RETURNING test_id`,
      )
      .bind(submissionId, teacherId),
    ...backToEvaluation(db, teacherId, submissionId, now),
  ]);
```

Replace it with:

```ts
         RETURNING test_id`,
      )
      .bind(submissionId, startedAt, teacherId),
    ...backToEvaluation(db, teacherId, submissionId, now),
  ]);
```

- [ ] **Step 58: Edit `server/db/results.ts`**

Find this block:

```ts
import { getEvaluation } from './evaluations.ts';
import { listSubmissionFiles, publicFile } from './submissions.ts';
import type { StoredFile } from './tests.ts';
```

Replace it with:

```ts
import { getEvaluation } from './evaluations.ts';
import { listSubmissionFiles, publicFile, type ShownUpload } from './submissions.ts';
import type { StoredFile } from './tests.ts';
```

- [ ] **Step 59: Edit `server/db/results.ts`**

Find this block:

```ts
// teacher's tests. Returns whether that student can open the page now (the
// test may keep results open for all), or null when the upload is gone.
export async function setSubmissionResultsOpen(
  db: D1Database,
  teacherId: number,
  submissionId: number,
  open: boolean,
): Promise<boolean | null> {
  const updated = await db
```

Replace it with:

```ts
// teacher's tests. Returns whether that student can open the page now (the
// test may keep results open for all), or null when the upload the page shows
// is gone or is another upload now (ids of deleted rows come back, and a
// result page must never open for another student).
export async function setSubmissionResultsOpen(db: D1Database, shown: ShownUpload, open: boolean): Promise<boolean | null> {
  const { teacherId, submissionId, startedAt } = shown;
  const updated = await db
```

- [ ] **Step 60: Edit `server/db/results.ts`**

Find this block:

```ts
      `UPDATE submissions SET results_open = ?
        WHERE id = ? AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND t.teacher_id = ?)
        RETURNING test_id`,
    )
    .bind(open ? 1 : 0, submissionId, teacherId)
    .first<{ test_id: number }>();
```

Replace it with:

```ts
      `UPDATE submissions SET results_open = ?
        WHERE id = ? AND started_at = ?
          AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND t.teacher_id = ?)
        RETURNING test_id`,
    )
    .bind(open ? 1 : 0, submissionId, startedAt, teacherId)
    .first<{ test_id: number }>();
```

- [ ] **Step 61: Edit `server/db/results.ts`**

Find this block:

```ts
// The result link of an upload, making one for older uploads that have none
// yet. Null when the upload is not in one of the teacher's tests.
export async function teacherResultToken(db: D1Database, teacherId: number, submissionId: number): Promise<string | null> {
  const row = await db
```

Replace it with:

```ts
// The result link of an upload, making one for older uploads that have none
// yet. Null when the upload the page shows is not in one of the teacher's
// tests, or is another upload now.
export async function teacherResultToken(db: D1Database, shown: ShownUpload): Promise<string | null> {
  const { teacherId, submissionId, startedAt } = shown;
  const row = await db
```

- [ ] **Step 62: Edit `server/db/results.ts`**

Find this block:

```ts
      `SELECT s.result_token FROM submissions s JOIN tests t ON t.id = s.test_id
       WHERE s.id = ? AND t.teacher_id = ?`,
    )
    .bind(submissionId, teacherId)
    .first<{ result_token: string | null }>();
```

Replace it with:

```ts
      `SELECT s.result_token FROM submissions s JOIN tests t ON t.id = s.test_id
       WHERE s.id = ? AND s.started_at = ? AND t.teacher_id = ?`,
    )
    .bind(submissionId, startedAt, teacherId)
    .first<{ result_token: string | null }>();
```

- [ ] **Step 63: Edit `server/db/results.ts`**

Find this block:

```ts
          `UPDATE submissions SET result_token = ?
           WHERE id = ? AND result_token IS NULL
             AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND t.teacher_id = ?)
```

Replace it with:

```ts
          `UPDATE submissions SET result_token = ?
           WHERE id = ? AND started_at = ? AND result_token IS NULL
             AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND t.teacher_id = ?)
```

- [ ] **Step 64: Edit `server/db/results.ts`**

Find this block:

```ts
        )
        .bind(token, submissionId, teacherId)
        .first<{ result_token: string }>();
```

Replace it with:

```ts
        )
        .bind(token, submissionId, startedAt, teacherId)
        .first<{ result_token: string }>();
```

- [ ] **Step 65: Edit `server/db/results.ts`**

Find this block:

```ts
        `SELECT s.result_token FROM submissions s JOIN tests t ON t.id = s.test_id
         WHERE s.id = ? AND t.teacher_id = ?`,
      )
      .bind(submissionId, teacherId)
      .first<{ result_token: string | null }>();
```

Replace it with:

```ts
        `SELECT s.result_token FROM submissions s JOIN tests t ON t.id = s.test_id
         WHERE s.id = ? AND s.started_at = ? AND t.teacher_id = ?`,
      )
      .bind(submissionId, startedAt, teacherId)
      .first<{ result_token: string | null }>();
```

- [ ] **Step 66: Edit `server/routes/submissions.ts`**

Find this block:

```ts
import { Hono } from 'hono';
import { correctItemBody, regradeBody, reviewPagesBody, type RegradeAnswer, type ResultsOpenAnswer } from '../../shared/api.ts';
import { formatPoints, isValidCorrection } from '../../shared/scoring.ts';
```

Replace it with:

```ts
import type { D1Database } from '@cloudflare/workers-types';
import { Hono } from 'hono';
import { correctItemBody, regradeBody, reviewPagesBody, shownUpload, type RegradeAnswer, type ResultsOpenAnswer } from '../../shared/api.ts';
import { formatPoints, isValidCorrection } from '../../shared/scoring.ts';
```

- [ ] **Step 67: Edit `server/routes/submissions.ts`**

Find this block:

```ts
import { setSubmissionResultsOpen, teacherResultToken } from '../db/results.ts';
import { deleteSubmissionRow, findTeacherFile, getTeacherSubmission } from '../db/submissions.ts';
import { robotStarter } from '../dispatch.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { ApiError, notFound, notGraded } from '../errors.ts';
import { nowIso, parseId, readJson } from '../http.ts';
import { deleteFilesQuietly, fileResponse } from '../uploads.ts';

```

Replace it with:

```ts
import { setSubmissionResultsOpen, teacherResultToken } from '../db/results.ts';
import { deleteSubmissionRow, findTeacherFile, getTeacherSubmission, type ShownUpload, uploadStartedAt } from '../db/submissions.ts';
import { robotStarter } from '../dispatch.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { ApiError, notFound, notGraded, uploadChanged } from '../errors.ts';
import { nowIso, parseId, readJson } from '../http.ts';
import { deleteFilesQuietly, fileResponse } from '../uploads.ts';

// The upload a page names: an unknown upload is 404, and an upload that
// started at another time is 409. Ids of deleted rows come back, so the id
// alone may now name another student's upload. Each write also checks the
// time in its own SQL, for a reset that comes between this read and the write.
async function requireShown(db: D1Database, teacherId: number, submissionId: number, startedAt: string): Promise<ShownUpload> {
  const current = await uploadStartedAt(db, teacherId, submissionId);
  if (current === null) throw notFound();
  if (current !== startedAt) throw uploadChanged();
  return { teacherId, submissionId, startedAt };
}

```

- [ ] **Step 68: Edit `server/routes/submissions.ts`**

Find this block:

```ts
    const submissionId = parseId(c.req.param('id'));
    const resultToken = await teacherResultToken(c.env.DB, c.var.teacher.id, submissionId);
    if (!resultToken) throw notFound();
    return c.json({ resultToken });
```

Replace it with:

```ts
    const submissionId = parseId(c.req.param('id'));
    const query = shownUpload.safeParse({ startedAt: c.req.query('startedAt') });
    if (!query.success) throw new ApiError(400, 'invalid', 'Reîncarcă pagina.');
    const shown = await requireShown(c.env.DB, c.var.teacher.id, submissionId, query.data.startedAt);
    const resultToken = await teacherResultToken(c.env.DB, shown);
    if (!resultToken) throw uploadChanged();
    return c.json({ resultToken });
```

- [ ] **Step 69: Edit `server/routes/submissions.ts`**

Find this block:

```ts
  routes.post('/:id/results/open', async (c) => {
    const resultsOpen = await setSubmissionResultsOpen(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')), true);
    if (resultsOpen === null) throw notFound();
    return c.json({ resultsOpen } satisfies ResultsOpenAnswer);
```

Replace it with:

```ts
  routes.post('/:id/results/open', async (c) => {
    const { startedAt } = await readJson(c, shownUpload);
    const shown = await requireShown(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')), startedAt);
    const resultsOpen = await setSubmissionResultsOpen(c.env.DB, shown, true);
    if (resultsOpen === null) throw uploadChanged();
    return c.json({ resultsOpen } satisfies ResultsOpenAnswer);
```

- [ ] **Step 70: Edit `server/routes/submissions.ts`**

Find this block:

```ts
  routes.post('/:id/results/close', async (c) => {
    const resultsOpen = await setSubmissionResultsOpen(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')), false);
    if (resultsOpen === null) throw notFound();
    return c.json({ resultsOpen } satisfies ResultsOpenAnswer);
```

Replace it with:

```ts
  routes.post('/:id/results/close', async (c) => {
    const { startedAt } = await readJson(c, shownUpload);
    const shown = await requireShown(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')), startedAt);
    const resultsOpen = await setSubmissionResultsOpen(c.env.DB, shown, false);
    if (resultsOpen === null) throw uploadChanged();
    return c.json({ resultsOpen } satisfies ResultsOpenAnswer);
```

- [ ] **Step 71: Edit `server/routes/submissions.ts`**

Find this block:

```ts

  // Deletes the upload and its files, so the student can start again
  // (for example on another phone).
  routes.post('/:id/reset', async (c) => {
    const found = await getTeacherSubmission(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')));
    if (!found) throw notFound();
    await deleteSubmissionRow(c.env.DB, found.detail.id);
    await deleteFilesQuietly(c.env.FILES, found.files.map((file) => file.key));
```

Replace it with:

```ts

  // Deletes the upload the page shows and its files, so the student can
  // start again (for example on another phone).
  routes.post('/:id/reset', async (c) => {
    const { startedAt } = await readJson(c, shownUpload);
    const shown = await requireShown(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')), startedAt);
    const found = await getTeacherSubmission(c.env.DB, shown.teacherId, shown.submissionId);
    if (!found || found.detail.startedAt !== startedAt) throw uploadChanged();
    if (!(await deleteSubmissionRow(c.env.DB, shown))) throw uploadChanged();
    await deleteFilesQuietly(c.env.FILES, found.files.map((file) => file.key));
```

- [ ] **Step 72: Edit `server/routes/submissions.ts`**

Find this block:

```ts
  routes.post('/:id/retry', async (c) => {
    const found = await getTeacherSubmission(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')));
    if (!found) throw notFound();
    const testStatus = await retrySubmission(c.env.DB, c.var.teacher.id, found.detail.id, nowIso());
    if (testStatus === null) throw new ApiError(409, 'not_failed', 'Corectarea acestei lucrări nu a eșuat.');
```

Replace it with:

```ts
  routes.post('/:id/retry', async (c) => {
    const { startedAt } = await readJson(c, shownUpload);
    const shown = await requireShown(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')), startedAt);
    const testStatus = await retrySubmission(c.env.DB, shown, nowIso());
    if (testStatus === null) throw new ApiError(409, 'not_failed', 'Corectarea acestei lucrări nu a eșuat.');
```

- [ ] **Step 73: Edit `src/admin/api.ts`**

Find this block:

```ts
  // the class stays as it is.
  setSubmissionResultsOpen(submissionId: number, open: boolean): Promise<boolean>;
  // Now without `at`, or at that ISO time. With `submissionIds`, now only
```

Replace it with:

```ts
  // the class stays as it is.
  setSubmissionResultsOpen(submissionId: number, startedAt: string, open: boolean): Promise<boolean>;
  // Now without `at`, or at that ISO time. With `submissionIds`, now only
```

- [ ] **Step 74: Edit `src/admin/api.ts`**

Find this block:

```ts
  // The teacher's link to one student's result page, for sharing.
  getResultLink(submissionId: number): Promise<string>;
  resetSubmission(submissionId: number): Promise<void>;
  retrySubmission(submissionId: number): Promise<RobotStart | null>;
  regradeSubmission(submissionId: number, gradedAt: string): Promise<RegradeAnswer>;
```

Replace it with:

```ts
  // The teacher's link to one student's result page, for sharing.
  getResultLink(submissionId: number, startedAt: string): Promise<string>;
  // The actions on an upload name the upload the page shows by the time it
  // started (`startedAt`): an old page changes nothing of another student.
  resetSubmission(submissionId: number, startedAt: string): Promise<void>;
  retrySubmission(submissionId: number, startedAt: string): Promise<RobotStart | null>;
  regradeSubmission(submissionId: number, gradedAt: string): Promise<RegradeAnswer>;
```

- [ ] **Step 75: Edit `src/admin/api.ts`**

Find this block:

```ts
      (await request<ResultsOpenAnswer>('POST', `${test(code)}/results/${open ? 'open' : 'close'}`)).resultsOpen,
    setSubmissionResultsOpen: async (submissionId, open) =>
      (await request<ResultsOpenAnswer>('POST', `/submissions/${submissionId}/results/${open ? 'open' : 'close'}`)).resultsOpen,
    reopenTest: async (code) => {
```

Replace it with:

```ts
      (await request<ResultsOpenAnswer>('POST', `${test(code)}/results/${open ? 'open' : 'close'}`)).resultsOpen,
    setSubmissionResultsOpen: async (submissionId, startedAt, open) =>
      (await request<ResultsOpenAnswer>('POST', `/submissions/${submissionId}/results/${open ? 'open' : 'close'}`, { startedAt })).resultsOpen,
    reopenTest: async (code) => {
```

- [ ] **Step 76: Edit `src/admin/api.ts`**

Find this block:

```ts
      (await request<{ submission: SubmissionDetail }>('GET', `/submissions/${submissionId}`)).submission,
    getResultLink: async (submissionId) =>
      (await request<ResultLinkAnswer>('GET', `/submissions/${submissionId}/result-link`)).resultToken,
    resetSubmission: async (submissionId) => {
      await request('POST', `/submissions/${submissionId}/reset`);
    },
    retrySubmission: async (submissionId) =>
      (await request<{ robot: RobotStart | null }>('POST', `/submissions/${submissionId}/retry`)).robot,
    regradeSubmission: (submissionId, gradedAt) => request<RegradeAnswer>('POST', `/submissions/${submissionId}/regrade`, { gradedAt }),
```

Replace it with:

```ts
      (await request<{ submission: SubmissionDetail }>('GET', `/submissions/${submissionId}`)).submission,
    getResultLink: async (submissionId, startedAt) =>
      (await request<ResultLinkAnswer>('GET', `/submissions/${submissionId}/result-link?startedAt=${encodeURIComponent(startedAt)}`)).resultToken,
    resetSubmission: async (submissionId, startedAt) => {
      await request('POST', `/submissions/${submissionId}/reset`, { startedAt });
    },
    retrySubmission: async (submissionId, startedAt) =>
      (await request<{ robot: RobotStart | null }>('POST', `/submissions/${submissionId}/retry`, { startedAt })).robot,
    regradeSubmission: (submissionId, gradedAt) => request<RegradeAnswer>('POST', `/submissions/${submissionId}/regrade`, { gradedAt }),
```

- [ ] **Step 77: Edit `src/admin/testPage/ResultLink.tsx`**

Find this block:

```tsx
// has no link yet (an older upload), the first opening makes it.
export function ResultLink({ submissionId, resultToken, testCode, studentName }: { submissionId: number; resultToken: string | null; testCode: string; studentName: string }) {
  const api = useApi();
```

Replace it with:

```tsx
// has no link yet (an older upload), the first opening makes it.
export function ResultLink({
  submissionId,
  startedAt,
  resultToken,
  testCode,
  studentName,
}: {
  submissionId: number;
  // The upload the page shows: a link is never made for another upload.
  startedAt: string;
  resultToken: string | null;
  testCode: string;
  studentName: string;
}) {
  const api = useApi();
```

- [ ] **Step 78: Edit `src/admin/testPage/ResultLink.tsx`**

Find this block:

```tsx
    try {
      setToken(await api.getResultLink(submissionId));
    } catch (err) {
```

Replace it with:

```tsx
    try {
      setToken(await api.getResultLink(submissionId, startedAt));
    } catch (err) {
```

- [ ] **Step 79: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
  const api = useApi();
  const reset = useMutation({
    mutationFn: (submissionId: number) => api.resetSubmission(submissionId),
    onSuccess: onChanged,
```

Replace it with:

```tsx
  const api = useApi();
  // Each action on the upload names the upload the row shows (`startedAt`).
  const reset = useMutation({
    mutationFn: ({ submissionId, startedAt }: { submissionId: number; startedAt: string }) => api.resetSubmission(submissionId, startedAt),
    onSuccess: onChanged,
```

- [ ] **Step 80: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
  const retry = useMutation({
    mutationFn: (submissionId: number) => api.retrySubmission(submissionId),
    onSuccess: async (robot) => {
```

Replace it with:

```tsx
  const retry = useMutation({
    mutationFn: ({ submissionId, startedAt }: { submissionId: number; startedAt: string }) => api.retrySubmission(submissionId, startedAt),
    onSuccess: async (robot) => {
```

- [ ] **Step 81: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
  const publish = useMutation({
    mutationFn: ({ submissionId, open }: { submissionId: number; open: boolean }) => api.setSubmissionResultsOpen(submissionId, open),
    onSuccess: onChanged,
```

Replace it with:

```tsx
  const publish = useMutation({
    mutationFn: ({ submissionId, startedAt, open }: { submissionId: number; startedAt: string; open: boolean }) =>
      api.setSubmissionResultsOpen(submissionId, startedAt, open),
    onSuccess: onChanged,
```

- [ ] **Step 82: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
  const submissionId = row.submissionId;
  const gradedAt = row.status === 'graded' ? row.gradedAt : null;
```

Replace it with:

```tsx
  const submissionId = row.submissionId;
  const startedAt = row.startedAt;
  const gradedAt = row.status === 'graded' ? row.gradedAt : null;
```

- [ ] **Step 83: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
      <td className="actions-cell">
        {submissionId !== null && (
          <span className="row-actions">
```

Replace it with:

```tsx
      <td className="actions-cell">
        {submissionId !== null && startedAt !== null && (
          <span className="row-actions">
```

- [ ] **Step 84: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
            {row.status !== 'uploading' && (
              <ResultLink submissionId={submissionId} resultToken={row.resultToken} testCode={code} studentName={row.studentName} />
            )}
            {row.status === 'failed' && (
              <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate(submissionId)}>
                Reîncearcă
```

Replace it with:

```tsx
            {row.status !== 'uploading' && (
              <ResultLink
                submissionId={submissionId}
                startedAt={startedAt}
                resultToken={row.resultToken}
                testCode={code}
                studentName={row.studentName}
              />
            )}
            {row.status === 'failed' && (
              <button
                type="button"
                className="button-quiet button-small"
                disabled={retry.isPending}
                onClick={() => retry.mutate({ submissionId, startedAt })}
              >
                Reîncearcă
```

- [ ] **Step 85: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
            )}
            {submissionId !== null && !testResultsOpen && row.status !== 'uploading' && (
              <button
```

Replace it with:

```tsx
            )}
            {!testResultsOpen && row.status !== 'uploading' && (
              <button
```

- [ ] **Step 86: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
                disabled={publish.isPending}
                onClick={() => publish.mutate({ submissionId, open: !row.resultsOpen })}
              >
```

Replace it with:

```tsx
                disabled={publish.isPending}
                onClick={() => publish.mutate({ submissionId, startedAt, open: !row.resultsOpen })}
              >
```

- [ ] **Step 87: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
                if (window.confirm(`Ștergi încărcarea elevului ${row.studentName}? Elevul o poate lua de la capăt.`)) {
                  reset.mutate(submissionId);
                }
```

Replace it with:

```tsx
                if (window.confirm(`Ștergi încărcarea elevului ${row.studentName}? Elevul o poate lua de la capăt.`)) {
                  reset.mutate({ submissionId, startedAt });
                }
```

- [ ] **Step 88: Edit `src/admin/pages/SubmissionPage.tsx`**

Find this block:

```tsx
  };
  const reset = useMutation({
    mutationFn: () => api.resetSubmission(submissionId),
    onSuccess: async () => {
```

Replace it with:

```tsx
  };
  // Resetează and Reîncearcă name the upload the page shows (`startedAt`).
  const reset = useMutation({
    mutationFn: (startedAt: string) => api.resetSubmission(submissionId, startedAt),
    onSuccess: async () => {
```

- [ ] **Step 89: Edit `src/admin/pages/SubmissionPage.tsx`**

Find this block:

```tsx
  const retry = useMutation({
    mutationFn: () => api.retrySubmission(submissionId),
    onSuccess: (robot) => gradeAgain(robot ? robotStartMessage(robot) : null),
```

Replace it with:

```tsx
  const retry = useMutation({
    mutationFn: (startedAt: string) => api.retrySubmission(submissionId, startedAt),
    onSuccess: (robot) => gradeAgain(robot ? robotStartMessage(robot) : null),
```

- [ ] **Step 90: Edit `src/admin/pages/SubmissionPage.tsx`**

Find this block:

```tsx
            submissionId={submission.id}
            resultToken={submission.resultToken}
```

Replace it with:

```tsx
            submissionId={submission.id}
            startedAt={submission.startedAt}
            resultToken={submission.resultToken}
```

- [ ] **Step 91: Edit `src/admin/pages/SubmissionPage.tsx`**

Find this block:

```tsx
              <p>Corectarea a eșuat. {submission.lastError}</p>
              <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate()}>
                Reîncearcă
```

Replace it with:

```tsx
              <p>Corectarea a eșuat. {submission.lastError}</p>
              <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate(submission.startedAt)}>
                Reîncearcă
```

- [ ] **Step 92: Edit `src/admin/pages/SubmissionPage.tsx`**

Find this block:

```tsx
            onClick={() => {
              if (window.confirm(`Ștergi încărcarea elevului ${submission.studentName}? Elevul o poate lua de la capăt.`)) reset.mutate();
            }}
```

Replace it with:

```tsx
            onClick={() => {
              if (window.confirm(`Ștergi încărcarea elevului ${submission.studentName}? Elevul o poate lua de la capăt.`)) reset.mutate(submission.startedAt);
            }}
```

- [ ] **Step 93: Edit `server/AGENTS.md`**

Find this block:

```markdown
- The same holds for the robot (`db/runner.ts`): a claim, an exercise list, and a result check the lease or the run inside their SQL. `/check` and `/lease` send uploads left in grading by a dead run back to the queue. An exercise list is saved only while the test's `files_version` is the one the robot read before the files. A run never claims again an upload that a reopen took from it (`reopenTest` keeps that run's id): the next run grades it.
- The teacher's corrections and Regrade check in their SQL that the upload is graded and the test is the teacher's: a regrade can delete a result at any time. A correction and the check of unreadable pages name the result the page shows: the upload in the path, and the grading time `gradedAt` (`evaluations.created_at`) in the body. Their writes check both (`SHOWN` in `db/evaluations.ts`): ids of deleted rows come back (no `AUTOINCREMENT`), so an id from an old page can name another student's upload or item. Regrade of one upload names `gradedAt` too (`regradeSubmission` in `db/lifecycle.ts`). Reset and Retry still act by the upload id alone (`plan-4a-followups.md`). A correction sums the total again from all items, so two corrections at once leave the right total. The grade comes from `gradeSql`, which a test compares with `gradeOf` for every amount in cents.
- The database is the truth: R2 keys come from rows, never from listing R2.
```

Replace it with:

```markdown
- The same holds for the robot (`db/runner.ts`): a claim, an exercise list, and a result check the lease or the run inside their SQL. `/check` and `/lease` send uploads left in grading by a dead run back to the queue. An exercise list is saved only while the test's `files_version` is the one the robot read before the files. A run never claims again an upload that a reopen took from it (`reopenTest` keeps that run's id): the next run grades it.
- The teacher's corrections and Regrade check in their SQL that the upload is graded and the test is the teacher's: a regrade can delete a result at any time. A correction and the check of unreadable pages name the result the page shows: the upload in the path, and the grading time `gradedAt` (`evaluations.created_at`) in the body. Their writes check both (`SHOWN` in `db/evaluations.ts`): ids of deleted rows come back (no `AUTOINCREMENT`), so an id from an old page can name another student's upload or item. Regrade of one upload names `gradedAt` too (`regradeSubmission` in `db/lifecycle.ts`). Every action on one upload that does not name a grading names the upload by the time it started instead: Reset, Retry, publishing or taking back a result page, and the result link send `startedAt` (`submissions.started_at`, written once, so it never changes during one upload's life and differs between two uploads that reused an id). The write checks it in its SQL (`ShownUpload` in `db/submissions.ts`); a route first calls `requireShown`, which answers 404 for an unknown upload and 409 `upload_changed` for another one. A correction sums the total again from all items, so two corrections at once leave the right total. The grade comes from `gradeSql`, which a test compares with `gradeOf` for every amount in cents.
- The database is the truth: R2 keys come from rows, never from listing R2.
```

- [ ] **Step 94: Edit `docs/superpowers/plans/plan-4a-followups.md`**

Find this block:

```markdown
- On a phone, the test page is a little wider than the screen: the file field of the test files list does not shrink (from Plan 2).
- An old page's "Resetează" acts by the upload id alone. Ids of deleted rows come back (no `AUTOINCREMENT`): after a reset of the newest upload, the next upload (of any student) can get its id, and a Resetează from a page opened before deletes that upload and its files. Fix it first in Plan 4b: the page names what it showed, as Recorectează names `gradedAt`, or the tables get `AUTOINCREMENT` (a table rebuild). "Reîncearcă" acts by the id too; it only sends a failed upload to the robot again.
- The item form on the result page: the focus does not move to the form or to its error, the error is not tied to the field, and a save says nothing to a screen reader.
```

Replace it with:

```markdown
- On a phone, the test page is a little wider than the screen: the file field of the test files list does not shrink (from Plan 2).
- The item form on the result page: the focus does not move to the form or to its error, the error is not tied to the field, and a save says nothing to a screen reader.
```

- [ ] **Step 95: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
| `GET /submissions/:id/files/:fileId` | Stream a student file. |
| `GET /submissions/:id/result-link` | The secret of the student's result page; makes it for an older upload that has none. |
| `POST /submissions/:id/results/open`, `POST /submissions/:id/results/close` | Publishes or takes back one student's result page. Answers `{ resultsOpen }`: true also while the test keeps all results open. |
| `POST /submissions/:id/reset` | Delete the files, the evaluation, and the row, so the student can start again. |
| `POST /submissions/:id/retry` | failed → submitted, attempts = 0. A `done` test goes back to `evaluating` (§8.5). |
| `POST /submissions/:id/regrade` `{ gradedAt }` | Regrade one submission, only while it holds the graded result of `gradedAt`: a page opened before a regrade or a reset gets 409 `not_graded` instead of regrading another submission. A `done` test goes back to `evaluating` (§8.5). |
```

Replace it with:

```markdown
| `GET /submissions/:id/files/:fileId` | Stream a student file. |
| `GET /submissions/:id/result-link?startedAt=…` | The secret of the student's result page; makes it for an older upload that has none. `startedAt` as for Reset. |
| `POST /submissions/:id/results/open` `{ startedAt }`, `POST /submissions/:id/results/close` `{ startedAt }` | Publishes or takes back one student's result page. Answers `{ resultsOpen }`: true also while the test keeps all results open. `startedAt` as for Reset: a page opened before a reset gets 409 `upload_changed` instead of publishing another student's result. |
| `POST /submissions/:id/reset` `{ startedAt }` | Delete the files, the evaluation, and the row, so the student can start again. `startedAt` is the time the upload on the page started (`submissions.started_at`, written once). Ids of deleted rows come back, so the id alone may name another student's upload by now: the write checks the time in its own SQL, and a page opened before a reset gets 409 `upload_changed` (an unknown submission or one of another teacher 404, a body without `startedAt` 400). |
| `POST /submissions/:id/retry` `{ startedAt }` | failed → submitted, attempts = 0. A `done` test goes back to `evaluating` (§8.5). `startedAt` as for Reset. |
| `POST /submissions/:id/regrade` `{ gradedAt }` | Regrade one submission, only while it holds the graded result of `gradedAt`: a page opened before a regrade or a reset gets 409 `not_graded` instead of regrading another submission. A `done` test goes back to `evaluating` (§8.5). |
```

- [ ] **Step 96: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  65 passed (65)`, `Tests  844 passed (844)`.

- [ ] **Step 97: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 98: Commit**

```bash
git add server shared src docs
git commit -m "Name the upload a page shows when it resets, retries, publishes, or links an upload, so an old page cannot change another student's upload"
```

---

### Task 3: The class analysis in the API

The robot's third task gets its API. `GET /api/runner/tests/:id/results` gives the graded class without names, with the `version` of the grades. `POST /api/runner/tests/:id/analysis` saves the analysis, or counts a failed attempt. Entering evaluation asks for the first analysis too. `POST /api/admin/tests/:code/analysis/regenerate` asks for a new one and starts the robot. The test detail carries the analysis state.

**Files:**
- Modify: `shared/tests.ts`, `shared/schemas.ts`, `shared/runner.ts`, `shared/api.ts`, `server/db/lifecycle.ts`, `server/db/runner.ts`, `server/db/tests.ts`, `server/routes/runner.ts`, `server/routes/tests.ts`, `src/admin/api.ts`, `src/test/fakeApi.ts`, `docs/superpowers/specs/2026-10-06-quickeval-design.md`
- Test: `server/routes/analysis.test.ts` (new), `server/routes/evaluation.test.ts` (modified), `shared/schemas.test.ts` (modified)

**Interfaces:**
- Consumes: `finishTests`, `ASK_FOR_ANALYSIS`, `HOLDS_LEASE`, `MAX_ATTEMPTS`, `refusedWrite`, `robotStarter`; `addEvaluation`, `addSubmission`, `setRobotKey`, `robotRequest` (`server/test/fixtures.ts`).
- Produces:
  - `AnalysisStatus` (`'none' | 'requested' | 'ready' | 'failed'`) in `shared/tests.ts`.
  - `classAnalysisSchema`, `ClassAnalysis`, `checkClassAnalysis(raw): Checked<ClassAnalysis>` (overview needed; lists cut to 8 entries of 300 characters) in `shared/schemas.ts`; `TEXT_LIMITS.overview` = 2000.
  - `analysisBody` (zod: `{ runId, ok: true, version, analysis } | { runId, ok: false, error }`) and `ClassResults` in `shared/runner.ts`.
  - `AnalysisInfo { status, stale }`, `AnalysisAnswer { analysis, robot }`, and `TestInfo.analysis` in `shared/api.ts`.
  - `findClassResults(db, testId)`, `saveAnalysis(db, testId, runId, version, analysis, now)`, `failAnalysis(db, testId, runId, error, now): 'requested' | 'failed' | null` in `server/db/runner.ts`; `requestAnalysis(db, teacherId, testId, now)` in `server/db/lifecycle.ts`.
  - Robot routes `GET /tests/:id/results` and `POST /tests/:id/analysis` (answers `{ status }`); admin route `POST /tests/:code/analysis/regenerate`.
  - Client: `regenerateAnalysis(code): Promise<AnalysisAnswer>`.

- [ ] **Step 1: Create `server/routes/analysis.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExerciseList } from '../../shared/schemas.ts';
import {
  addEvaluation,
  addSubmission,
  addTestFiles,
  makeClass,
  makeTest,
  otherTeacherTest,
  robotRequest,
  setRobotKey,
  startTest,
  testIdOf,
} from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let robot: ReturnType<typeof robotRequest>;
let code: string;
let testId: number;
let studentIds: number[];

const RUN = 'run-0001';

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [
    { id: 'E1', label: 'Exercițiul 1', maxPoints: 4.5, answer: '3/4', scoringNotes: 'Pas 1: 1p', topic: 'Fracții' },
    { id: 'E2', label: 'Exercițiul 2', maxPoints: 4.5, answer: 'x = 2', scoringNotes: '', topic: 'Ecuații' },
  ],
  notes: '',
};

const ANALYSIS = {
  overview: 'Clasa a lucrat bine la fracții.',
  strengths: ['Fracții'],
  weaknesses: ['Ecuații'],
  commonMistakes: ['Semnul la mutarea termenilor.'],
  recommendations: ['Exersați ecuațiile.'],
};

const testRow = () =>
  api.db
    .prepare('SELECT status, analysis_status, analysis_stale, analysis_attempts, analysis_json FROM tests WHERE id = ?')
    .bind(testId)
    .first<{ status: string; analysis_status: string; analysis_stale: number; analysis_attempts: number; analysis_json: string | null }>();
const setTest = (sql: string) => api.db.prepare(`UPDATE tests SET ${sql} WHERE id = ?`).bind(testId).run();

async function graded(index: number, grade = 9): Promise<number> {
  const id = await addSubmission(api, code, studentIds[index]!, { status: 'graded', files: 1 });
  await api.db.prepare("UPDATE submissions SET graded_at = ? WHERE id = ?").bind(`2026-10-07T09:0${index}:00.000Z`, id).run();
  await addEvaluation(api, id, { grade, items: [{}, {}] });
  return id;
}

const saveAnalysis = (version: string, runId = RUN) =>
  robot('POST', `/tests/${testId}/analysis`, { runId, ok: true, version, analysis: ANALYSIS });
const resultsVersion = async () => (await robot('GET', `/tests/${testId}/results`)).body.results.version as string;

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => false);
  api = await startTestApi({ app: { dispatchRobot } });
  await setRobotKey(api);
  robot = robotRequest(api);
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva']);
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
  testId = await testIdOf(api, code);
  await startTest(api, code);
  await addTestFiles(api, code);
  await setTest(`status = 'evaluating', exercise_list_status = 'ready', analysis_status = 'requested', exercise_list_json = '${JSON.stringify(LIST)}'`);
  await robot('POST', '/lease', { runId: RUN });
});

afterEach(async () => {
  vi.useRealTimers();
  await api.dispose();
});

describe('GET /api/runner/tests/:id/results', () => {
  it('gives the graded class without names, in grading order, with the final points', async () => {
    const first = await graded(0, 8);
    await graded(1, 6);
    await addSubmission(api, code, studentIds[2]!, { status: 'failed', files: 1 });
    await api.db.prepare("UPDATE evaluation_items SET points = 0.5, comment = 'Corectat.' WHERE evaluation_id = (SELECT id FROM evaluations WHERE submission_id = ?) AND exercise_id = 'E2'").bind(first).run();
    const res = await robot('GET', `/tests/${testId}/results`);
    expect(res.status).toBe(200);
    const { results } = res.body;
    expect(results).toMatchObject({ testId, maxTotal: 10, officePoints: 1 });
    expect(results.exercises).toEqual([
      { id: 'E1', label: 'Exercițiul 1', maxPoints: 4.5, topic: 'Fracții', answer: '3/4', scoringNotes: 'Pas 1: 1p' },
      { id: 'E2', label: 'Exercițiul 2', maxPoints: 4.5, topic: 'Ecuații', answer: 'x = 2', scoringNotes: '' },
    ]);
    expect(results.students).toHaveLength(2);
    expect(results.students[0]).toMatchObject({ label: 'Elev 1', grade: 8 });
    expect(results.students[0].items).toEqual([
      { exerciseId: 'E1', points: 1, studentAnswer: 'r', comment: 'c' },
      { exerciseId: 'E2', points: 0.5, studentAnswer: 'r', comment: 'Corectat.' },
    ]);
    expect(results.students[1].label).toBe('Elev 2');
    expect(JSON.stringify(res.body)).not.toMatch(/Pop|Ionescu|Stan|poza/);
  });

  it('answers 404 for a test that is not in evaluation', async () => {
    await graded(0);
    await setTest("status = 'done'");
    expect((await robot('GET', `/tests/${testId}/results`)).status).toBe(404);
    expect((await robot('GET', '/tests/99999/results')).status).toBe(404);
  });

  it('answers 401 without the robot key', async () => {
    const res = await api.request('GET', `/api/runner/tests/${testId}/results`);
    expect(res.status).toBe(401);
  });

  it('changes its version when a grade is corrected', async () => {
    const id = await graded(0);
    const before = await resultsVersion();
    const evaluation = await api.db.prepare('SELECT id FROM evaluations WHERE submission_id = ?').bind(id).first<{ id: number }>();
    await api.db.prepare("UPDATE evaluations SET updated_at = '2026-10-08T10:00:00.000Z' WHERE id = ?").bind(evaluation!.id).run();
    expect(await resultsVersion()).not.toBe(before);
    await graded(1);
    expect(await resultsVersion()).toMatch(/^2:/);
  });
});

describe('the work the robot is told about', () => {
  it('counts an analysis only for a test with a graded upload and no upload left to grade', async () => {
    expect((await robot('GET', '/tasks')).body.analyses).toEqual([]);
    await graded(0);
    expect((await robot('GET', '/tasks')).body.analyses).toEqual([testId]);
    expect((await robot('POST', '/check')).body).toMatchObject({ hasWork: true, analyses: 1 });
    await addSubmission(api, code, studentIds[1]!, { status: 'submitted', files: 1 });
    expect((await robot('GET', '/tasks')).body.analyses).toEqual([]);
  });
});

describe('a check of a test that has nothing graded', () => {
  it('ends the test without an analysis', async () => {
    await addSubmission(api, code, studentIds[0]!, { status: 'failed', files: 1 });
    expect((await robot('POST', '/check')).body).toMatchObject({ hasWork: false, analyses: 0 });
    expect(await testRow()).toMatchObject({ status: 'done', analysis_status: 'none' });
  });
});

describe('POST /api/runner/tests/:id/analysis', () => {
  it('saves the analysis, ends the test, and keeps it fresh when the grades did not change', async () => {
    await graded(0);
    const res = await saveAnalysis(await resultsVersion());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
    const row = await testRow();
    expect(row).toMatchObject({ status: 'done', analysis_status: 'ready', analysis_stale: 0 });
    expect(JSON.parse(row!.analysis_json!)).toEqual(ANALYSIS);
  });

  it('saves it as out of date when a grade changed after the robot read the results', async () => {
    const id = await graded(0);
    const version = await resultsVersion();
    await api.db.prepare("UPDATE evaluations SET updated_at = '2026-10-08T10:00:00.000Z' WHERE submission_id = ?").bind(id).run();
    expect((await saveAnalysis(version)).status).toBe(200);
    expect(await testRow()).toMatchObject({ analysis_status: 'ready', analysis_stale: 1 });
  });

  it('refuses it while an upload waits for grading, and keeps the analysis requested', async () => {
    await graded(0);
    const version = await resultsVersion();
    await addSubmission(api, code, studentIds[1]!, { status: 'submitted', files: 1 });
    const res = await saveAnalysis(version);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('not_needed');
    expect(await testRow()).toMatchObject({ status: 'evaluating', analysis_status: 'requested' });
  });

  it('refuses a robot that does not hold the lease', async () => {
    await graded(0);
    const res = await saveAnalysis('1:x', 'run-0002');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('lease_lost');
    expect(await testRow()).toMatchObject({ analysis_status: 'requested', analysis_json: null });
  });

  it('refuses it when the analysis is no longer requested', async () => {
    await graded(0);
    await setTest("analysis_status = 'ready'");
    const res = await saveAnalysis('1:x');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('not_needed');
  });

  it('answers 404 for a deleted test', async () => {
    const res = await robot('POST', '/tests/99999/analysis', { runId: RUN, ok: true, version: 'x', analysis: ANALYSIS });
    expect(res.status).toBe(404);
  });

  it('refuses an analysis the checks cannot use', async () => {
    await graded(0);
    for (const analysis of [{ overview: '   ', strengths: [], weaknesses: [], commonMistakes: [], recommendations: [] }, { overview: 'x' }, 'text']) {
      const res = await robot('POST', `/tests/${testId}/analysis`, { runId: RUN, ok: true, version: '1:x', analysis });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('invalid_result');
    }
    expect(await testRow()).toMatchObject({ analysis_status: 'requested' });
  });

  it('cuts long lists and texts instead of refusing the analysis', async () => {
    await graded(0);
    const long = {
      overview: 'a'.repeat(5000),
      strengths: Array.from({ length: 20 }, (_, index) => `punct ${index}`),
      weaknesses: [],
      commonMistakes: ['b'.repeat(900)],
      recommendations: [],
    };
    const res = await robot('POST', `/tests/${testId}/analysis`, { runId: RUN, ok: true, version: await resultsVersion(), analysis: long });
    expect(res.status).toBe(200);
    const saved = JSON.parse((await testRow())!.analysis_json!);
    expect(saved.overview.length).toBeLessThanOrEqual(2000);
    expect(saved.strengths).toHaveLength(8);
    expect(saved.commonMistakes[0].length).toBeLessThanOrEqual(300);
  });

  it('counts a failed attempt, tries again, and fails the analysis at the third attempt while the test ends', async () => {
    await graded(0);
    const fail = (error = 'crash') => robot('POST', `/tests/${testId}/analysis`, { runId: RUN, ok: false, error });
    const first = await fail();
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ status: 'requested' });
    expect(await testRow()).toMatchObject({ status: 'evaluating', analysis_status: 'requested', analysis_attempts: 1 });
    await fail('usage_limit');
    expect(await testRow()).toMatchObject({ analysis_attempts: 1 });
    await fail('timeout');
    expect((await fail('invalid_output')).body).toEqual({ status: 'failed' });
    expect(await testRow()).toMatchObject({ status: 'done', analysis_status: 'failed', analysis_attempts: 3 });
  });
});

describe('POST /api/admin/tests/:code/analysis/regenerate', () => {
  const regenerate = (target = code) => api.request('POST', `/api/admin/tests/${target}/analysis/regenerate`);

  it('asks again for the analysis of a finished test, takes it back to evaluation, and starts the robot', async () => {
    await graded(0);
    await setTest("status = 'done', analysis_status = 'ready', analysis_stale = 1, analysis_attempts = 2");
    dispatchRobot.mockResolvedValueOnce(true);
    const res = await regenerate();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ analysis: { status: 'requested', stale: true }, robot: 'dispatched' });
    expect(await testRow()).toMatchObject({ status: 'evaluating', analysis_status: 'requested', analysis_attempts: 0 });
  });

  it('makes the first analysis of a test that was graded before analyses existed', async () => {
    await graded(0);
    await setTest("status = 'done', analysis_status = 'none'");
    const res = await regenerate();
    expect(res.status).toBe(200);
    expect(res.body.analysis.status).toBe('requested');
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('shows the analysis state in the test detail', async () => {
    await graded(0);
    await setTest("status = 'done', analysis_status = 'ready', analysis_stale = 1");
    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.test.analysis).toEqual({ status: 'ready', stale: true });
  });

  it('refuses a test that is open or has nothing graded', async () => {
    await setTest("status = 'open'");
    expect((await regenerate()).body.error).toBe('not_evaluated');
    await setTest("status = 'done'");
    const res = await regenerate();
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('no_results');
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('answers 404 for a test of another teacher and changes nothing', async () => {
    const foreign = await otherTeacherTest(api);
    expect((await regenerate(foreign.code)).status).toBe(404);
  });

  it('is counted as work for "Pornește robotul"', async () => {
    await graded(0);
    await api.db.prepare("UPDATE runner_state SET run_id = NULL").run();
    const res = await api.request('POST', `/api/admin/tests/${code}/robot`);
    expect(res.status).toBe(200);
  });
});

describe('a test with nothing to analyze', () => {
  it('ends without waiting for an analysis when its only upload fails for good', async () => {
    const id = await addSubmission(api, code, studentIds[0]!, { status: 'grading', files: 1 });
    await api.db.prepare("UPDATE submissions SET run_id = ?, attempts = 2 WHERE id = ?").bind(RUN, id).run();
    const res = await robot('POST', `/submissions/${id}/result`, { runId: RUN, ok: false, error: 'crash' });
    expect(res.status).toBe(200);
    expect(await testRow()).toMatchObject({ status: 'done', analysis_status: 'none' });
  });
});
```

- [ ] **Step 2: Edit `server/routes/evaluation.test.ts`**

Find this block:

```ts

  it('ends at once a test with nothing new to grade', async () => {
    await addTestFiles(api, code);
    await addSubmission(api, code, studentIds[0]!, { status: 'graded', files: 1 });
    const res = await evaluate();
```

Replace it with:

```ts

  it('keeps a test with only graded uploads in evaluation until its first class analysis is written', async () => {
    await addTestFiles(api, code);
    await addSubmission(api, code, studentIds[0]!, { status: 'graded', files: 1 });
    dispatchRobot.mockResolvedValueOnce(true);
    const res = await evaluate();
    expect(res.body).toEqual({ status: 'evaluating', evaluationAt: null, robot: 'dispatched' });
    expect(await testRow()).toMatchObject({ status: 'evaluating', analysis_status: 'requested', analysis_attempts: 0 });
  });

  it('ends at once a test with nothing to grade and nothing to analyze', async () => {
    await addTestFiles(api, code);
    await addSubmission(api, code, studentIds[0]!, { status: 'failed', files: 1 });
    const res = await evaluate();
```

- [ ] **Step 3: Edit `server/routes/evaluation.test.ts`**

Find this block:

```ts
    expect(dispatchRobot).not.toHaveBeenCalled();
    expect((await testRow())?.status).toBe('done');
  });
```

Replace it with:

```ts
    expect(dispatchRobot).not.toHaveBeenCalled();
    expect(await testRow()).toMatchObject({ status: 'done', analysis_status: 'none' });
  });
```

- [ ] **Step 4: Edit `shared/schemas.test.ts`**

Find this block:

```ts
  CHECK_THIS,
  checkExerciseList,
  checkGrading,
  claudeJsonSchema,
```

Replace it with:

```ts
  CHECK_THIS,
  checkClassAnalysis,
  checkExerciseList,
  checkGrading,
  classAnalysisSchema,
  claudeJsonSchema,
```

- [ ] **Step 5: Edit `shared/schemas.test.ts`**

Find this block:

```ts
  it('makes draft-07 schemas, the version that Claude Code accepts', () => {
    for (const schema of [exerciseListSchema, gradingResultSchema]) {
      const json = claudeJsonSchema(schema);
```

Replace it with:

```ts
  it('makes draft-07 schemas, the version that Claude Code accepts', () => {
    for (const schema of [classAnalysisSchema, exerciseListSchema, gradingResultSchema]) {
      const json = claudeJsonSchema(schema);
```

- [ ] **Step 6: Edit `shared/schemas.test.ts`**

Find this block:

```ts
    expect(json.required).toEqual(['items', 'unreadable', 'summary', 'strengths', 'recommendations']);
  });
});
```

Replace it with:

```ts
    expect(json.required).toEqual(['items', 'unreadable', 'summary', 'strengths', 'recommendations']);
  });
});

describe('checkClassAnalysis', () => {
  const analysis = {
    overview: ' Clasa a lucrat bine. ',
    strengths: ['Fracții', '  '],
    weaknesses: ['Ecuații'],
    commonMistakes: ['Semnul'],
    recommendations: ['Exersați'],
  };

  it('trims the texts and drops empty entries', () => {
    const checked = checkClassAnalysis(analysis);
    expect(checked).toEqual({
      ok: true,
      value: { ...analysis, overview: 'Clasa a lucrat bine.', strengths: ['Fracții'] },
    });
  });

  it('refuses an empty overview and a wrong shape', () => {
    expect(checkClassAnalysis({ ...analysis, overview: '  ' }).ok).toBe(false);
    expect(checkClassAnalysis({ overview: 'x' }).ok).toBe(false);
    expect(checkClassAnalysis(null).ok).toBe(false);
  });

  it('cuts the lists to 8 entries and the entries to 300 characters', () => {
    const checked = checkClassAnalysis({
      ...analysis,
      strengths: Array.from({ length: 12 }, (_, index) => `punct ${index}`),
      weaknesses: ['x'.repeat(400)],
    });
    expect(checked.ok && checked.value.strengths).toHaveLength(8);
    expect(checked.ok && Array.from(checked.value.weaknesses[0]!)).toHaveLength(300);
  });

  it('has a JSON Schema that asks for every field', () => {
    const json = claudeJsonSchema(classAnalysisSchema) as { required: string[] };
    expect(json.required).toEqual(['overview', 'strengths', 'weaknesses', 'commonMistakes', 'recommendations']);
  });
});
```

- [ ] **Step 7: Run the tests to see them fail**

Run: `npx vitest run server/routes/analysis.test.ts server/routes/evaluation.test.ts shared/schemas.test.ts`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  23 failed | 80 passed (103)`. Failing tests: "makes draft-07 schemas, the version that Claude Code accepts"; "trims the texts and drops empty entries"; "refuses an empty overview and a wrong shape"; "cuts the lists to 8 entries and the entries to 300 characters"; "has a JSON Schema that asks for every field"; "gives the graded class without names, in grading order, with the final points"; "changes its version when a grade is corrected"; "counts an analysis only for a test with a graded upload and no upload left to grade" and 15 more. Errors such as: `TypeError: Cannot use 'in' operator to search for '_idmap' in undefined`; `TypeError: checkClassAnalysis is not a function`; `AssertionError: expected 404 to be 200 // Object.is equality`. Tests of this task that do not fail yet are guards: they pass before and after.

- [ ] **Step 8: Edit `shared/tests.ts`**

Find this block:

```ts
export type ExerciseListStatus = 'none' | 'ready' | 'problem' | 'accepted' | 'failed';

```

Replace it with:

```ts
export type ExerciseListStatus = 'none' | 'ready' | 'problem' | 'accepted' | 'failed';

// The class analysis (spec §8.5): "none": not asked for yet, or the test has no
// graded upload; "requested": the robot writes it; "ready"; "failed": the robot
// could not write it after 3 tries.
export type AnalysisStatus = 'none' | 'requested' | 'ready' | 'failed';

```

- [ ] **Step 9: Edit `shared/schemas.ts`**

Find this block:

```ts

export const MAX_EXERCISES = 60;
```

Replace it with:

```ts

// Mode "class-report": the whole class, anonymized (spec §12.5).
export const classAnalysisSchema = z.object({
  overview: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  commonMistakes: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export type ClassAnalysis = z.infer<typeof classAnalysisSchema>;

export const MAX_EXERCISES = 60;
```

- [ ] **Step 10: Edit `shared/schemas.ts`**

Find this block:

```ts
const MAX_UNREADABLE = 20;

```

Replace it with:

```ts
const MAX_UNREADABLE = 20;
const MAX_ANALYSIS_ENTRIES = 8;

```

- [ ] **Step 11: Edit `shared/schemas.ts`**

Find this block:

```ts
  summary: 1500,
  listEntry: 300,
```

Replace it with:

```ts
  summary: 1500,
  overview: 2000,
  listEntry: 300,
```

- [ ] **Step 12: Edit `shared/schemas.ts`**

Find this block:

```ts

export interface GradedItem {
```

Replace it with:

```ts

// Checks the class analysis: it needs an overview, and the lists are cut to
// 8 entries of at most 300 characters, so one long answer is never thrown away.
export function checkClassAnalysis(raw: unknown): Checked<ClassAnalysis> {
  const parsed = classAnalysisSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'not a class analysis' };
  const overview = cutText(parsed.data.overview, TEXT_LIMITS.overview);
  if (overview === '') return { ok: false, reason: 'empty overview' };
  return {
    ok: true,
    value: {
      overview,
      strengths: cutList(parsed.data.strengths, MAX_ANALYSIS_ENTRIES, TEXT_LIMITS.listEntry),
      weaknesses: cutList(parsed.data.weaknesses, MAX_ANALYSIS_ENTRIES, TEXT_LIMITS.listEntry),
      commonMistakes: cutList(parsed.data.commonMistakes, MAX_ANALYSIS_ENTRIES, TEXT_LIMITS.listEntry),
      recommendations: cutList(parsed.data.recommendations, MAX_ANALYSIS_ENTRIES, TEXT_LIMITS.listEntry),
    },
  };
}

export interface GradedItem {
```

- [ ] **Step 13: Edit `shared/runner.ts`**

Find this block:

```ts

// POST /lease.
```

Replace it with:

```ts

// The class analysis, or why the robot could not make it. `version` is the
// state of the grades that the robot read with GET /tests/:id/results: when a
// grade changed meanwhile, the analysis is saved as out of date. The analysis
// is checked by checkClassAnalysis (shared/schemas.ts).
export const analysisBody = z.discriminatedUnion('ok', [
  z.object({ runId: runIdSchema, ok: z.literal(true), version: z.string().max(100), analysis: z.unknown() }),
  z.object({ runId: runIdSchema, ok: z.literal(false), error: robotErrorSchema }),
]);

// GET /tests/:id/results: the graded class, anonymized for the analysis
// (spec §11.3). Students are "Elev 1" … "Elev n" in grading order: no names, and
// the points are the final ones, with the teacher's corrections.
export interface ClassResults {
  testId: number;
  version: string;
  maxTotal: number;
  officePoints: number;
  exercises: { id: string; label: string; maxPoints: number; topic: string; answer: string; scoringNotes: string }[];
  students: {
    label: string;
    total: number;
    grade: number;
    items: { exerciseId: string; points: number; studentAnswer: string; comment: string }[];
  }[];
}

// POST /lease.
```

- [ ] **Step 14: Edit `shared/api.ts`**

Find this block:

```ts
import { cleanStudentName, MAX_NAME_LENGTH, MAX_NAMES_PER_REQUEST } from './students.ts';
import { cleanTitle, MAX_TITLE_LENGTH, type ExerciseListStatus, type TestStatus } from './tests.ts';

```

Replace it with:

```ts
import { cleanStudentName, MAX_NAME_LENGTH, MAX_NAMES_PER_REQUEST } from './students.ts';
import { type AnalysisStatus, cleanTitle, MAX_TITLE_LENGTH, type ExerciseListStatus, type TestStatus } from './tests.ts';

```

- [ ] **Step 15: Edit `shared/api.ts`**

Find this block:

```ts

export interface TestInfo extends TestSummary {
```

Replace it with:

```ts

// The class analysis as the test page sees it. `stale`: grades changed after
// the analysis was written.
export interface AnalysisInfo {
  status: AnalysisStatus;
  stale: boolean;
}

// "Regenerează": the analysis is asked for again. `robot` says whether the
// robot was started.
export interface AnalysisAnswer {
  analysis: AnalysisInfo;
  robot: RobotStart;
}

export interface TestInfo extends TestSummary {
```

- [ ] **Step 16: Edit `shared/api.ts`**

Find this block:

```ts
  baremNotes: string;
}
```

Replace it with:

```ts
  baremNotes: string;
  analysis: AnalysisInfo;
}
```

- [ ] **Step 17: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { TestStatus } from '../../shared/tests.ts';
import type { ShownResult } from './evaluations.ts';
```

Replace it with:

```ts
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { AnalysisInfo } from '../../shared/api.ts';
import type { AnalysisStatus, TestStatus } from '../../shared/tests.ts';
import type { ShownResult } from './evaluations.ts';
```

- [ ] **Step 18: Edit `server/db/lifecycle.ts`**

Find this block:

```ts

// Entering an evaluation asks for a new class analysis when the old one is
// ready or failed (spec §8.5).
const ASK_FOR_ANALYSIS = `
  analysis_status = CASE WHEN analysis_status IN ('ready', 'failed') THEN 'requested' ELSE analysis_status END,
  analysis_attempts = CASE WHEN analysis_status IN ('ready', 'failed') THEN 0 ELSE analysis_attempts END`;

```

Replace it with:

```ts

// Entering an evaluation asks for a class analysis, the first one too: the
// analysis is asked for when the status is none, ready, or failed (spec §8.5).
// One already requested stays as it is.
const ASK_FOR_ANALYSIS = `
  analysis_status = CASE WHEN analysis_status IN ('none', 'ready', 'failed') THEN 'requested' ELSE analysis_status END,
  analysis_attempts = CASE WHEN analysis_status IN ('none', 'ready', 'failed') THEN 0 ELSE analysis_attempts END`;

```

- [ ] **Step 19: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
// evaluating → done: no upload waits for grading or is being graded, and no
// class analysis is waiting (spec §8.5). Returns the ids of the finished tests.
export function finishTests(db: D1Database, now: string): D1PreparedStatement {
```

Replace it with:

```ts
// evaluating → done: no upload waits for grading or is being graded, and no
// class analysis is waiting (spec §8.5). A test with no graded upload has
// nothing to analyze: it ends, and its analysis is not asked for. Returns the
// ids of the finished tests.
export function finishTests(db: D1Database, now: string): D1PreparedStatement {
```

- [ ] **Step 20: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
    .prepare(
      `UPDATE tests SET status = 'done', updated_at = ?
       WHERE status = 'evaluating' AND analysis_status <> 'requested'
         AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = tests.id AND s.status IN ('submitted', 'grading'))
```

Replace it with:

```ts
    .prepare(
      `UPDATE tests SET status = 'done', updated_at = ?,
         analysis_status = CASE WHEN analysis_status = 'requested' THEN 'none' ELSE analysis_status END
       WHERE status = 'evaluating'
         AND (analysis_status <> 'requested'
              OR NOT EXISTS (SELECT 1 FROM submissions g WHERE g.test_id = tests.id AND g.status = 'graded'))
         AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = tests.id AND s.status IN ('submitted', 'grading'))
```

- [ ] **Step 21: Edit `server/db/lifecycle.ts`**

Find this block:

```ts

// failed → submitted with 0 attempts, so the robot grades the upload again. A
```

Replace it with:

```ts

// "Regenerează": the class analysis is asked for again, from any analysis
// state (also the first one of a test that was graded before analyses
// existed). A finished test goes back to evaluation, where the robot writes it.
// Null when the test is not the teacher's, is not in evaluation or done, or
// has no graded upload.
export async function requestAnalysis(db: D1Database, teacherId: number, testId: number, now: string): Promise<AnalysisInfo | null> {
  const row = await db
    .prepare(
      `UPDATE tests SET analysis_status = 'requested', analysis_attempts = 0, updated_at = ?,
         status = CASE WHEN status = 'done' THEN 'evaluating' ELSE status END
       WHERE id = ? AND teacher_id = ? AND status IN ('evaluating', 'done')
         AND EXISTS (SELECT 1 FROM submissions g WHERE g.test_id = tests.id AND g.status = 'graded')
       RETURNING analysis_status, analysis_stale`,
    )
    .bind(now, testId, teacherId)
    .first<{ analysis_status: AnalysisStatus; analysis_stale: number }>();
  return row ? { status: row.analysis_status, stale: row.analysis_stale === 1 } : null;
}

// failed → submitted with 0 attempts, so the robot grades the upload again. A
```

- [ ] **Step 22: Edit `server/db/runner.ts`**

Find this block:

```ts
  type ClaimResult,
  type RobotError,
```

Replace it with:

```ts
  type ClaimResult,
  type ClassResults,
  type RobotError,
```

- [ ] **Step 23: Edit `server/db/runner.ts`**

Find this block:

```ts
} from '../../shared/runner.ts';
import type { CheckedExerciseList, ExerciseList, Grading } from '../../shared/schemas.ts';
import type { ExerciseListStatus } from '../../shared/tests.ts';
```

Replace it with:

```ts
} from '../../shared/runner.ts';
import type { CheckedExerciseList, ClassAnalysis, ExerciseList, Grading } from '../../shared/schemas.ts';
import type { ExerciseListStatus } from '../../shared/tests.ts';
```

- [ ] **Step 24: Edit `server/db/runner.ts`**

Find this block:

```ts
export const GRADABLE = `s.status = 'submitted' AND t.status = 'evaluating' AND t.exercise_list_status IN ('ready', 'accepted')`;
// A test whose class analysis was asked for, with nothing left to grade.
export const NEEDS_ANALYSIS = `t.status = 'evaluating' AND t.analysis_status = 'requested'
  AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status IN ('submitted', 'grading'))`;

```

Replace it with:

```ts
export const GRADABLE = `s.status = 'submitted' AND t.status = 'evaluating' AND t.exercise_list_status IN ('ready', 'accepted')`;
// A test whose class analysis was asked for, with nothing left to grade and at
// least one graded upload to analyze.
export const NEEDS_ANALYSIS = `t.status = 'evaluating' AND t.analysis_status = 'requested'
  AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status IN ('submitted', 'grading'))
  AND EXISTS (SELECT 1 FROM submissions g WHERE g.test_id = t.id AND g.status = 'graded')`;

// The state of the grades of a test: how many graded results there are and
// when the last one changed (a correction writes `evaluations.updated_at`, a
// regrade makes a new result). The robot reads it with the results and sends
// it back with the analysis, so an analysis made from grades that changed
// meanwhile is saved as out of date.
function gradesVersionSql(test: string): string {
  return `(SELECT COUNT(*) || ':' || COALESCE(MAX(ev.updated_at), '')
     FROM evaluations ev JOIN submissions gs ON gs.id = ev.submission_id
     WHERE gs.test_id = ${test}.id AND gs.status = 'graded')`;
}

```

- [ ] **Step 25: Edit `server/db/runner.ts`**

Find this block:

```ts

// A page of an upload that is being graded: its key and type, never its name.
```

Replace it with:

```ts

// The graded class for the analysis (spec §11.3). Null unless the test is in
// evaluation, like the rest of what the robot reads.
export async function findClassResults(db: D1Database, testId: number): Promise<ClassResults | null> {
  const [test, rows] = await db.batch<{
    exercise_list_json?: string | null;
    version?: string;
    exercise_id?: string;
    submission_id?: number;
    total?: number;
    grade?: number;
    points?: number;
    student_answer?: string;
    comment?: string;
  }>([
    db
      .prepare(`SELECT t.exercise_list_json, ${gradesVersionSql('t')} AS version FROM tests t WHERE t.id = ? AND t.status = 'evaluating'`)
      .bind(testId),
    db
      .prepare(
        `SELECT s.id AS submission_id, ev.total, ev.grade, i.exercise_id, i.points, i.student_answer, i.comment
         FROM submissions s
         JOIN evaluations ev ON ev.submission_id = s.id
         JOIN evaluation_items i ON i.evaluation_id = ev.id
         WHERE s.test_id = ? AND s.status = 'graded'
         ORDER BY s.graded_at, s.id, i.position`,
      )
      .bind(testId),
  ]);
  const head = test?.results[0];
  if (!head) return null;
  const list = head.exercise_list_json ? (JSON.parse(head.exercise_list_json) as ExerciseList) : null;
  const students: ClassResults['students'] = [];
  let current = -1;
  for (const row of rows?.results ?? []) {
    if (row.submission_id !== current) {
      current = row.submission_id!;
      students.push({ label: `Elev ${students.length + 1}`, total: row.total!, grade: row.grade!, items: [] });
    }
    students.at(-1)!.items.push({
      exerciseId: row.exercise_id!,
      points: row.points!,
      studentAnswer: row.student_answer!,
      comment: row.comment!,
    });
  }
  return {
    testId,
    version: head.version!,
    maxTotal: list?.totalPoints ?? 0,
    officePoints: list?.officePoints ?? 0,
    exercises: (list?.exercises ?? []).map(({ id, label, maxPoints, topic, answer, scoringNotes }) => ({
      id,
      label,
      maxPoints,
      topic,
      answer,
      scoringNotes,
    })),
    students,
  };
}

// The analysis is saved only for a test in evaluation that waits for it, only
// from the run that holds the lease, and only when every upload is graded: a
// regrade that came meanwhile makes the robot write it again afterwards.
const WAITS_FOR_ANALYSIS = `id = ? AND status = 'evaluating' AND analysis_status = 'requested' AND ${HOLDS_LEASE}`;

// Saves the analysis and ends the test when nothing else waits, in one batch.
// An analysis made from grades that changed since the robot read them is saved
// as out of date. False when it was not saved.
export async function saveAnalysis(
  db: D1Database,
  testId: number,
  runId: string,
  version: string,
  analysis: ClassAnalysis,
  now: string,
): Promise<boolean> {
  const [saved] = await db.batch<{ id: number }>([
    db
      .prepare(
        `UPDATE tests SET analysis_json = ?, analysis_status = 'ready', updated_at = ?,
           analysis_stale = CASE WHEN ? = ${gradesVersionSql('tests')} THEN 0 ELSE 1 END
         WHERE ${WAITS_FOR_ANALYSIS}
           AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = tests.id AND s.status IN ('submitted', 'grading'))
           AND EXISTS (SELECT 1 FROM submissions g WHERE g.test_id = tests.id AND g.status = 'graded')
         RETURNING id`,
      )
      .bind(JSON.stringify(analysis), now, version, testId, runId),
    finishTests(db, now),
  ]);
  return Boolean(saved?.results.length);
}

// The robot could not write the analysis: one more attempt is counted (none
// for a usage limit), and at MAX_ATTEMPTS the analysis fails and the test
// ends without one. Null when nothing was saved.
export async function failAnalysis(
  db: D1Database,
  testId: number,
  runId: string,
  error: RobotError,
  now: string,
): Promise<'requested' | 'failed' | null> {
  const counted = error === 'usage_limit' ? 0 : 1;
  const [failed] = await db.batch<{ analysis_status: 'requested' | 'failed' }>([
    db
      .prepare(
        `UPDATE tests SET analysis_attempts = analysis_attempts + ?,
           analysis_status = CASE WHEN analysis_attempts + ? >= ? THEN 'failed' ELSE 'requested' END,
           updated_at = ?
         WHERE ${WAITS_FOR_ANALYSIS}
         RETURNING analysis_status`,
      )
      .bind(counted, counted, MAX_ATTEMPTS, now, testId, runId),
    finishTests(db, now),
  ]);
  return failed?.results[0]?.analysis_status ?? null;
}

// A page of an upload that is being graded: its key and type, never its name.
```

- [ ] **Step 26: Edit `server/db/tests.ts`**

Find this block:

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { ExerciseListInfo, TestInfo, TestSummary, UploadRow, UploadStatus } from '../../shared/api.ts';
import type { TestFileKind } from '../../shared/files.ts';
import { compareStudentNames } from '../../shared/students.ts';
import { buildTestCode, type ExerciseListStatus, type TestStatus } from '../../shared/tests.ts';
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';
```

Replace it with:

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { AnalysisInfo, ExerciseListInfo, TestInfo, TestSummary, UploadRow, UploadStatus } from '../../shared/api.ts';
import type { TestFileKind } from '../../shared/files.ts';
import { compareStudentNames } from '../../shared/students.ts';
import { type AnalysisStatus, buildTestCode, type ExerciseListStatus, type TestStatus } from '../../shared/tests.ts';
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';
```

- [ ] **Step 27: Edit `server/db/tests.ts`**

Find this block:

```ts
  baremNotes: string;
}
```

Replace it with:

```ts
  baremNotes: string;
  analysis: AnalysisInfo;
}
```

- [ ] **Step 28: Edit `server/db/tests.ts`**

Find this block:

```ts
  results_open: number;
  student_count: number;
```

Replace it with:

```ts
  results_open: number;
  analysis_status: AnalysisStatus;
  analysis_stale: number;
  student_count: number;
```

- [ ] **Step 29: Edit `server/db/tests.ts`**

Find this block:

```ts
    t.barem_file_key, t.barem_file_name, t.barem_file_type, t.barem_notes, t.exercise_list_status, t.exercise_list_message,
    t.results_open,
    (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = t.class_id AND e.active = 1) AS student_count,
```

Replace it with:

```ts
    t.barem_file_key, t.barem_file_name, t.barem_file_type, t.barem_notes, t.exercise_list_status, t.exercise_list_message,
    t.results_open, t.analysis_status, t.analysis_stale,
    (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = t.class_id AND e.active = 1) AS student_count,
```

- [ ] **Step 30: Edit `server/db/tests.ts`**

Find this block:

```ts
    baremNotes: row.barem_notes ?? '',
  };
```

Replace it with:

```ts
    baremNotes: row.barem_notes ?? '',
    analysis: { status: row.analysis_status, stale: row.analysis_stale === 1 },
  };
```

- [ ] **Step 31: Edit `server/db/tests.ts`**

Find this block:

```ts
    baremNotes: record.baremNotes,
  };
```

Replace it with:

```ts
    baremNotes: record.baremNotes,
    analysis: record.analysis,
  };
```

- [ ] **Step 32: Edit `server/routes/runner.ts`**

Find this block:

```ts
import { isTestFileKind } from '../../shared/files.ts';
import { exerciseListBody, type LeaseResult, MAX_ROBOT_BODY_BYTES, releaseBody, resultBody, runBody } from '../../shared/runner.ts';
import { checkExerciseList, checkGrading } from '../../shared/schemas.ts';
import { robotAuth } from '../auth/robotAuth.ts';
```

Replace it with:

```ts
import { isTestFileKind } from '../../shared/files.ts';
import { analysisBody, exerciseListBody, type LeaseResult, MAX_ROBOT_BODY_BYTES, releaseBody, resultBody, runBody } from '../../shared/runner.ts';
import { checkClassAnalysis, checkExerciseList, checkGrading } from '../../shared/schemas.ts';
import { robotAuth } from '../auth/robotAuth.ts';
```

- [ ] **Step 33: Edit `server/routes/runner.ts`**

Find this block:

```ts
  claimSubmission,
  failExerciseList,
  failGrading,
  findGrading,
```

Replace it with:

```ts
  claimSubmission,
  failAnalysis,
  failExerciseList,
  failGrading,
  findClassResults,
  findGrading,
```

- [ ] **Step 34: Edit `server/routes/runner.ts`**

Find this block:

```ts
  runCheck,
  saveExerciseList,
```

Replace it with:

```ts
  runCheck,
  saveAnalysis,
  saveExerciseList,
```

- [ ] **Step 35: Edit `server/routes/runner.ts`**

Find this block:

```ts

  // The oldest upload that can be graded, now this run's; 204 when none.
```

Replace it with:

```ts

  // The graded class, anonymized, for the analysis. Only while the test is
  // in evaluation.
  routes.get('/tests/:id/results', async (c) => {
    const results = await findClassResults(c.env.DB, parseId(c.req.param('id')));
    if (!results) throw notFound();
    return c.json({ results });
  });

  // The class analysis, or why the robot could not write it. Accepted only
  // from the run that holds the lease, for a test that waits for it.
  routes.post('/tests/:id/analysis', async (c) => {
    const testId = parseId(c.req.param('id'));
    const body = await readJson(c, analysisBody, MAX_ROBOT_BODY_BYTES);
    const now = nowIso();
    let status: 'ready' | 'requested' | 'failed' | null;
    if (body.ok) {
      const checked = checkClassAnalysis(body.analysis);
      if (!checked.ok) throw invalidResult();
      status = (await saveAnalysis(c.env.DB, testId, body.runId, body.version, checked.value, now)) ? 'ready' : null;
    } else {
      status = await failAnalysis(c.env.DB, testId, body.runId, body.error, now);
    }
    if (!status) {
      throw await refusedWrite(c, body.runId, await testExists(c.env.DB, testId), () => new ApiError(409, 'not_needed', 'Analiza clasei nu mai este cerută.'));
    }
    return c.json({ status });
  });

  // The oldest upload that can be graded, now this run's; 204 when none.
```

- [ ] **Step 36: Edit `server/routes/tests.ts`**

Find this block:

```ts
  renameTestBody,
  type BaremNotesAnswer,
```

Replace it with:

```ts
  renameTestBody,
  type AnalysisAnswer,
  type BaremNotesAnswer,
```

- [ ] **Step 37: Edit `server/routes/tests.ts`**

Find this block:

```ts
  regradeTest,
  retryExerciseList,
```

Replace it with:

```ts
  regradeTest,
  requestAnalysis,
  retryExerciseList,
```

- [ ] **Step 38: Edit `server/routes/tests.ts`**

Find this block:

```ts

  // Upload or replace the test or the barem: PDF or Word, at most 25 MB. A new
```

Replace it with:

```ts

  // "Regenerează": the robot writes the class analysis again (spec §8.5).
  routes.post('/:code/analysis/regenerate', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    if (test.summary.status !== 'evaluating' && test.summary.status !== 'done') {
      throw new ApiError(409, 'not_evaluated', 'Analiza se face după ce testul a fost corectat.');
    }
    if (test.summary.gradedCount === 0) throw new ApiError(409, 'no_results', 'Testul nu are lucrări corectate.');
    const analysis = await requestAnalysis(c.env.DB, c.var.teacher.id, test.id, nowIso());
    if (!analysis) throw new ApiError(409, 'busy', 'Testul s-a schimbat între timp. Încearcă din nou.');
    return c.json({ analysis, robot: await startRobot(c.env) } satisfies AnalysisAnswer);
  });

  // Upload or replace the test or the barem: PDF or Word, at most 25 MB. A new
```

- [ ] **Step 39: Edit `src/admin/api.ts`**

Find this block:

```ts
import type {
  BaremNotesAnswer,
```

Replace it with:

```ts
import type {
  AnalysisAnswer,
  BaremNotesAnswer,
```

- [ ] **Step 40: Edit `src/admin/api.ts`**

Find this block:

```ts
  startRobot(code: string): Promise<RobotStart>;
  // "Recorectează tot": graded and failed uploads wait for the robot again.
```

Replace it with:

```ts
  startRobot(code: string): Promise<RobotStart>;
  // "Regenerează": the class analysis is written again.
  regenerateAnalysis(code: string): Promise<AnalysisAnswer>;
  // "Recorectează tot": graded and failed uploads wait for the robot again.
```

- [ ] **Step 41: Edit `src/admin/api.ts`**

Find this block:

```ts
    startRobot: async (code) => (await request<RobotStartAnswer>('POST', `${test(code)}/robot`)).robot,
    regradeTest: (code) => request<RegradeAnswer>('POST', `${test(code)}/regrade`),
```

Replace it with:

```ts
    startRobot: async (code) => (await request<RobotStartAnswer>('POST', `${test(code)}/robot`)).robot,
    regenerateAnalysis: (code) => request<AnalysisAnswer>('POST', `${test(code)}/analysis/regenerate`),
    regradeTest: (code) => request<RegradeAnswer>('POST', `${test(code)}/regrade`),
```

- [ ] **Step 42: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
import type {
  BaremNotesAnswer,
```

Replace it with:

```ts
import type {
  AnalysisAnswer,
  BaremNotesAnswer,
```

- [ ] **Step 43: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
      baremNotes: '',
      ...overrides,
```

Replace it with:

```ts
      baremNotes: '',
      analysis: { status: 'none', stale: false },
      ...overrides,
```

- [ ] **Step 44: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    }),
    getSubmission: vi.fn(async (submissionId: number) => structuredClone(findSubmission(submissionId))),
```

Replace it with:

```ts
    }),
    // Like the server: only a test in evaluation or done with a graded upload;
    // a finished test goes back to evaluation.
    regenerateAnalysis: vi.fn(async (code: string): Promise<AnalysisAnswer> => {
      const found = findTest(code);
      if (found.test.status !== 'evaluating' && found.test.status !== 'done') {
        throw new ApiError(409, 'not_evaluated', 'Analiza se face după ce testul a fost corectat.');
      }
      if (found.test.gradedCount === 0) throw new ApiError(409, 'no_results', 'Testul nu are lucrări corectate.');
      found.test.analysis = { status: 'requested', stale: found.test.analysis.stale };
      if (found.test.status === 'done') found.test.status = 'evaluating';
      return { analysis: found.test.analysis, robot: 'next_check' };
    }),
    getSubmission: vi.fn(async (submissionId: number) => structuredClone(findSubmission(submissionId))),
```

- [ ] **Step 45: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
- The robot makes the exercise list, grades each submitted upload, then writes the class analysis (§12).
- `evaluating → done`: no submission is `submitted` or `grading`, and `analysis_status` is not `requested`. (Plan 4b decides when the first class analysis is asked for.)
- **Reopen uploads** (from evaluating or done): sets `status = 'open'` and clears `evaluation_at`. Graded results stay. New uploads get graded at the next **Start evaluation**. The analysis is then marked stale. An upload that the robot is grading goes back to `submitted`: the robot's result for it is refused, and a later robot run grades it after the next **Start evaluation**, with the files of that time.
```

Replace it with:

```markdown
- The robot makes the exercise list, grades each submitted upload, then writes the class analysis (§12).
- `evaluating → done`: no submission is `submitted` or `grading`, and `analysis_status` is not `requested`. A test with no graded submission has nothing to analyze: it ends, and `requested` goes back to `none`.
- **Reopen uploads** (from evaluating or done): sets `status = 'open'` and clears `evaluation_at`. Graded results stay. New uploads get graded at the next **Start evaluation**. The analysis is then marked stale. An upload that the robot is grading goes back to `submitted`: the robot's result for it is refused, and a later robot run grades it after the next **Start evaluation**, with the files of that time.
```

- [ ] **Step 46: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
- **Retry** (a `failed` submission): sets it to `submitted` with 0 attempts. If the test is `done`, it goes back to `evaluating`. Like Start evaluation, it asks GitHub to start the robot (§12.6); so does **Încearcă din nou** on a failed exercise list.
- **Analysis refresh rule**: each time a test enters `evaluating` (Start evaluation, Regrade, or Retry on a `done` test), an analysis that is `ready` or `failed` becomes `requested` with 0 attempts. So the robot writes a new analysis after the new grades. Teacher corrections only set `analysis_stale = 1`. The teacher then clicks **Regenerează** when she wants a new analysis.
- **Delete test**: needs a confirmation. It deletes the R2 files under the test prefix and all its rows. A robot result for a deleted test gets 404, and the robot drops it.
```

Replace it with:

```markdown
- **Retry** (a `failed` submission): sets it to `submitted` with 0 attempts. If the test is `done`, it goes back to `evaluating`. Like Start evaluation, it asks GitHub to start the robot (§12.6); so does **Încearcă din nou** on a failed exercise list.
- **Analysis refresh rule**: each time a test enters `evaluating` (Start evaluation, Regrade, or Retry on a `done` test), an analysis that is `none`, `ready`, or `failed` becomes `requested` with 0 attempts: the first analysis is asked for the same way. So the robot writes a new analysis after the new grades. Teacher corrections only set `analysis_stale = 1`. The teacher then clicks **Regenerează** when she wants a new analysis; it works from any state, also for a test graded before analyses existed (`none`).
- **An analysis made from grades that changed meanwhile**: the robot reads the grades with a `version` (the number of graded results and the time of the last change) and sends it back. When the grades changed in between (a correction, a regrade), the analysis is saved as `ready` with `analysis_stale = 1`. It is saved only when no upload waits for grading: after a regrade that came meanwhile it stays `requested`, and the robot writes it after the new grades.
- **Delete test**: needs a confirmation. It deletes the R2 files under the test prefix and all its rows. A robot result for a deleted test gets 404, and the robot drops it.
```

- [ ] **Step 47: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
| `POST /tests` `{ classId, title }` | Create a draft test; returns the code. |
| `GET /tests/:code` | Test detail, uploads table, exercise-list status, robot line. (The analysis status comes with Plan 4b.) |
| `PATCH /tests/:code` `{ title }` | Rename. |
```

Replace it with:

```markdown
| `POST /tests` `{ classId, title }` | Create a draft test; returns the code. |
| `GET /tests/:code` | Test detail, uploads table, exercise-list status, analysis status (`analysis: { status, stale }`), robot line. |
| `PATCH /tests/:code` `{ title }` | Rename. |
```

- [ ] **Step 48: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
| `POST /tests/:code/robot` | "Pornește robotul": starts the robot (§12.6) when the test is evaluating and the robot's check would find work in it. Otherwise 409. |
| `POST /tests/:code/analysis/regenerate` | analysis_status → requested. If the test is `done`, it goes back to `evaluating`. |
| `GET /tests/:code/report` | Rows for the class report: students, items, totals, analysis. Statistics are computed in the browser with `shared/stats.ts`. |
```

Replace it with:

```markdown
| `POST /tests/:code/robot` | "Pornește robotul": starts the robot (§12.6) when the test is evaluating and the robot's check would find work in it. Otherwise 409. |
| `POST /tests/:code/analysis/regenerate` | analysis_status → requested, with 0 attempts. If the test is `done`, it goes back to `evaluating`, and the API asks GitHub to start the robot (§12.6). 409 `not_evaluated` for a draft or open test, 409 `no_results` when no submission is graded. Answers `{ analysis, robot }`. |
| `GET /tests/:code/report` | Rows for the class report: students, items, totals, analysis. Statistics are computed in the browser with `shared/stats.ts`. |
```

- [ ] **Step 49: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
| `POST /submissions/:id/result` `{ runId, ok: true, result, model } \| { runId, ok: false, error }` | Accepted only when the submission is `grading` and its `run_id` equals `runId`. Otherwise 409 `taken_over` (404 for a deleted submission), and the robot drops the result (another run took the work over). Save a result (§12.5): the API validates it (a broken result: 422 `invalid_result`), computes totals, and stores the evaluation and its items in one batch. `error` is `timeout`, `invalid_output`, `crash`, or `usage_limit`. On `usage_limit` the submission goes back to `submitted` with no attempt counted; else attempts + 1, and `failed` at 3. |
| `GET /tests/:id/results` | (Plan 4b.) Anonymized class data for the analysis: "Elev 1..n", items, points, comments. No names. |
| `POST /tests/:id/analysis` `{ runId, ok: true, analysis } \| { runId, ok: false, error }` | (Plan 4b.) Save the analysis (`ready`, `analysis_stale = 0`). On an error, attempts + 1, and `failed` at 3. Then the API checks whether the test is `done`. |

```

Replace it with:

```markdown
| `POST /submissions/:id/result` `{ runId, ok: true, result, model } \| { runId, ok: false, error }` | Accepted only when the submission is `grading` and its `run_id` equals `runId`. Otherwise 409 `taken_over` (404 for a deleted submission), and the robot drops the result (another run took the work over). Save a result (§12.5): the API validates it (a broken result: 422 `invalid_result`), computes totals, and stores the evaluation and its items in one batch. `error` is `timeout`, `invalid_output`, `crash`, or `usage_limit`. On `usage_limit` the submission goes back to `submitted` with no attempt counted; else attempts + 1, and `failed` at 3. |
| `GET /tests/:id/results` | Anonymized class data for the analysis: the exercise list, then "Elev 1..n" in grading order with their items (final points, answer, comment), and `version`. No names. Only while the test is `evaluating` (else 404). |
| `POST /tests/:id/analysis` `{ runId, ok: true, version, analysis } \| { runId, ok: false, error }` | Save the analysis (`ready`; `analysis_stale = 0`, or 1 when `version` is no longer the grades' version). The analysis is checked (§12.5): an unusable one is 422 `invalid_result`. Only from the run that holds the lease (else 409 `lease_lost`), only while the test is `evaluating` with the analysis `requested` and no upload waiting (else 409 `not_needed`). On an error, attempts + 1 (none for `usage_limit`), and `failed` at 3. Then the test ends when nothing else waits. |

```

- [ ] **Step 50: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  66 passed (66)`, `Tests  871 passed (871)`.

- [ ] **Step 51: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 52: Commit**

```bash
git add server shared src docs
git commit -m "Add the class analysis to the API: the results and analysis routes for the robot, the first request, and Regenerează"
```

---

### Task 4: The robot writes the class analysis

The skill gets a third mode, `class-report`. The robot gets a third task (`analyzeClass`), a work folder with `class-results.json` only, a time limit of 15 minutes, and a third step in a run: after its gradings it reads `GET /tasks` again and writes the analyses that are ready, once per test and run. The smoke test makes the analysis too.

**Files:**
- Modify: `runner/api.ts`, `runner/claude.ts`, `runner/workdir.ts`, `runner/tasks.ts`, `runner/run.ts`, `.claude/skills/evaluate-test/SKILL.md`, `.claude/skills/evaluate-test/references/grading-rules.md`, `scripts/smoke.mjs`, `runner/AGENTS.md`, `docs/superpowers/specs/2026-10-06-quickeval-design.md`
- Test: `runner/workdir.test.ts`, `runner/claude.test.ts`, `runner/tasks.test.ts`, `runner/run.test.ts`, `runner/skill.test.ts` (all modified)

**Interfaces:**
- Consumes: `classAnalysisSchema`, `checkClassAnalysis`, `ClassResults`, `analysisBody` (Task 3); `inWorkFolder`, `sendOutcome`, `askClaude`.
- Produces:
  - `ClaudeMode` adds `'class-report'`; `TIME_LIMITS_MS['class-report']` = 15 minutes.
  - `WorkFolderInput.test` and `.barem` are optional; `WorkFolderInput.classResults?: ClassResults` writes `class-results.json`.
  - `RobotApi.classResults(testId)` and `RobotApi.sendAnalysis(testId, body): Promise<'ready' | 'requested' | 'failed'>`.
  - `analyzeClass(ctx, testId): Promise<TaskEnd>` in `runner/tasks.ts`.
  - The run's summary counts `analyses`.

- [ ] **Step 1: Edit `runner/workdir.test.ts`**

Find this block:

```ts
    expect(readFileSync(path.join(folder, 'barem', 'barem.pdf'), 'utf8')).toBe('%PDF-1.7 barem');
  });
```

Replace it with:

```ts
    expect(readFileSync(path.join(folder, 'barem', 'barem.pdf'), 'utf8')).toBe('%PDF-1.7 barem');
  });

  it('lays out a class analysis: the skill and the anonymized results, with no test and no barem', async () => {
    const classResults = {
      testId: 3,
      version: '2:2026-10-07T09:00:00.000Z',
      maxTotal: 10,
      officePoints: 1,
      exercises: [],
      students: [{ label: 'Elev 1', total: 8, grade: 8, items: [] }],
    };
    const folder = await makeWorkFolder(root, 'class-report-3', { classResults }, { skillDir });
    expect(filesIn(folder)).toEqual([
      '.claude/skills/evaluate-test/SKILL.md',
      '.claude/skills/evaluate-test/references/grading-rules.md',
      'class-results.json',
    ]);
    expect(JSON.parse(readFileSync(path.join(folder, 'class-results.json'), 'utf8'))).toEqual(classResults);
  });
```

- [ ] **Step 2: Edit `runner/claude.test.ts`**

Find this block:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { claudeArgs, claudeEnv, claudeRunner, claudeSettings, type ClaudeSettings, type ProcessControl, readOutcome } from './claude.ts';

```

Replace it with:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  claudeArgs,
  claudeEnv,
  claudeRunner,
  claudeSettings,
  type ClaudeSettings,
  type ProcessControl,
  readOutcome,
  TIME_LIMITS_MS,
} from './claude.ts';

```

- [ ] **Step 3: Edit `runner/claude.test.ts`**

Find this block:

```ts
    ]);
  });
```

Replace it with:

```ts
    ]);
  });
});

describe('the class analysis task', () => {
  it('runs the same skill in its own mode, with 15 minutes', () => {
    expect(claudeArgs('class-report', {}, SETTINGS)[1]).toBe('/evaluate-test class-report');
    expect(TIME_LIMITS_MS['class-report']).toBe(15 * 60_000);
  });
```

- [ ] **Step 4: Edit `runner/tasks.test.ts`**

Find this block:

```ts
import type { ClaimResult } from '../shared/runner.ts';
import type { ExerciseList, GradingResult } from '../shared/schemas.ts';
import { robotApi } from './api.ts';
import { gradeSubmission, makeExerciseList, type TaskContext } from './tasks.ts';
import { API_URL, evaluatingTest, fetchFrom, ROBOT_KEY, type RobotWorld } from './test/robotWorld.ts';
```

Replace it with:

```ts
import type { ClaimResult } from '../shared/runner.ts';
import type { ClassAnalysis, ExerciseList, GradingResult } from '../shared/schemas.ts';
import { robotApi } from './api.ts';
import { analyzeClass, gradeSubmission, makeExerciseList, type TaskContext } from './tasks.ts';
import { API_URL, evaluatingTest, fetchFrom, ROBOT_KEY, type RobotWorld } from './test/robotWorld.ts';
```

- [ ] **Step 5: Edit `runner/tasks.test.ts`**

Find this block:

```ts
    await expect(gradeSubmission(await claimed(claude), claim)).rejects.toMatchObject({ status: 401, code: 'robot_denied' });
    expect(readdirSync(root)).toEqual([]);
  });
});
```

Replace it with:

```ts
    await expect(gradeSubmission(await claimed(claude), claim)).rejects.toMatchObject({ status: 401, code: 'robot_denied' });
    expect(readdirSync(root)).toEqual([]);
  });
});

describe('analyzeClass', () => {
  const ANALYSIS: ClassAnalysis = {
    overview: 'Clasa a lucrat bine.',
    strengths: ['Fracții'],
    weaknesses: ['Ecuații'],
    commonMistakes: ['Semnul'],
    recommendations: ['Exersați ecuațiile.'],
  };

  const testRow = () =>
    world.api.db
      .prepare('SELECT status, analysis_status, analysis_stale, analysis_attempts, analysis_json FROM tests WHERE id = ?')
      .bind(world.testId)
      .first<{ status: string; analysis_status: string; analysis_stale: number; analysis_attempts: number; analysis_json: string | null }>();

  // The only upload is graded, as the robot would have done, and the analysis is asked for.
  async function graded(claude: ReturnType<typeof scriptedClaude>): Promise<TaskContext> {
    await world.api.db
      .prepare("UPDATE tests SET exercise_list_status = 'ready', exercise_list_json = ?, analysis_status = 'requested' WHERE id = ?")
      .bind(JSON.stringify(LIST), world.testId)
      .run();
    const ctx = await context(claude);
    const claim = (await ctx.api.claim(RUN))!;
    claude.add(answer(GRADING));
    expect(await gradeSubmission(ctx, claim)).toBe('saved');
    claude.calls.length = 0;
    return ctx;
  }

  it('saves the analysis that Claude wrote from the anonymized results, and removes the work folder', async () => {
    const claude = scriptedClaude();
    const ctx = await graded(claude);
    claude.add((task) => {
      const results = JSON.parse(readFileSync(path.join(task.cwd, 'class-results.json'), 'utf8'));
      expect(results.students).toHaveLength(1);
      expect(results.students[0].label).toBe('Elev 1');
      expect(JSON.stringify(results)).not.toMatch(/Pop|Ionescu|Stan|Dinu/);
      return answer(ANALYSIS);
    });
    expect(await analyzeClass(ctx, world.testId)).toBe('saved');
    expect(claude.calls[0]!.task.mode).toBe('class-report');
    expect(claude.calls[0]!.task.jsonSchema).toMatchObject({ $schema: 'http://json-schema.org/draft-07/schema#' });
    expect(claude.calls[0]!.files).toEqual([...SKILL_FILES, 'class-results.json']);
    const row = await testRow();
    expect(row).toMatchObject({ status: 'done', analysis_status: 'ready', analysis_stale: 0 });
    expect(JSON.parse(row!.analysis_json!)).toEqual(ANALYSIS);
    expect(readdirSync(root)).toEqual([]);
  });

  it('sends the version of the grades it read, so an analysis of changed grades is out of date', async () => {
    const claude = scriptedClaude();
    const ctx = await graded(claude);
    claude.add(async () => {
      await world.api.db.prepare("UPDATE evaluations SET updated_at = '2026-10-09T10:00:00.000Z'").run();
      return answer(ANALYSIS);
    });
    expect(await analyzeClass(ctx, world.testId)).toBe('saved');
    expect(await testRow()).toMatchObject({ analysis_status: 'ready', analysis_stale: 1 });
  });

  it('asks once more after an answer that the checks refuse, then counts an invalid output', async () => {
    const claude = scriptedClaude();
    const ctx = await graded(claude);
    claude.add(answer({ ...ANALYSIS, overview: '' }), answer({ nothing: true }));
    expect(await analyzeClass(ctx, world.testId)).toBe('retry');
    expect(claude.calls).toHaveLength(2);
    expect(await testRow()).toMatchObject({ status: 'evaluating', analysis_status: 'requested', analysis_attempts: 1 });
  });

  it('says when the analysis failed for good at the third attempt, and the test ends', async () => {
    const claude = scriptedClaude();
    const ctx = await graded(claude);
    await world.api.db.prepare('UPDATE tests SET analysis_attempts = 2 WHERE id = ?').bind(world.testId).run();
    claude.add(problem('timeout'));
    expect(await analyzeClass(ctx, world.testId)).toBe('failed');
    expect(await testRow()).toMatchObject({ status: 'done', analysis_status: 'failed', analysis_attempts: 3 });
  });

  it('sends a usage limit, which counts no attempt', async () => {
    const claude = scriptedClaude();
    const ctx = await graded(claude);
    claude.add(problem('usage_limit'));
    expect(await analyzeClass(ctx, world.testId)).toBe('usage_limit');
    expect(await testRow()).toMatchObject({ analysis_status: 'requested', analysis_attempts: 0 });
  });

  it('sends nothing when Claude refuses the token', async () => {
    const claude = scriptedClaude();
    const ctx = await graded(claude);
    claude.add(problem('not_logged_in'));
    expect(await analyzeClass(ctx, world.testId)).toBe('claude_login');
    expect(await testRow()).toMatchObject({ analysis_status: 'requested', analysis_attempts: 0 });
  });

  it('drops the work when the test left the evaluation before the robot read the results', async () => {
    const claude = scriptedClaude();
    const ctx = await graded(claude);
    await world.api.db.prepare("UPDATE tests SET status = 'open' WHERE id = ?").bind(world.testId).run();
    expect(await analyzeClass(ctx, world.testId)).toBe('dropped');
    expect(claude.calls).toHaveLength(0);
    expect(readdirSync(root)).toEqual([]);
  });
});
```

- [ ] **Step 6: Edit `runner/run.test.ts`**

Find this block:

```ts
const grades = (count: number): ScriptedAnswer[] => Array.from({ length: count }, () => answer(GRADING));

```

Replace it with:

```ts
const grades = (count: number): ScriptedAnswer[] => Array.from({ length: count }, () => answer(GRADING));
const ANALYSIS = {
  overview: 'Clasa a lucrat bine.',
  strengths: ['Fracții'],
  weaknesses: [],
  commonMistakes: [],
  recommendations: ['Exersați.'],
};
const askForAnalysis = () =>
  world!.api.db.prepare("UPDATE tests SET analysis_status = 'requested' WHERE id = ?").bind(world!.testId).run();
const testRow = () =>
  world!.api.db
    .prepare('SELECT status, analysis_status, analysis_attempts FROM tests WHERE id = ?')
    .bind(world!.testId)
    .first<{ status: string; analysis_status: string; analysis_attempts: number }>();

describe('runRobot and the class analysis', () => {
  it('writes the class analysis after the gradings, in the same run', async () => {
    await setUp(2, 1);
    await askForAnalysis();
    const claude = scriptedClaude(...grades(2), answer(ANALYSIS));
    const report = await runRobot(options(claude));
    expect(report).toEqual({ summary: { exerciseLists: 0, graded: 2, failed: 0, analyses: 1, stop: 'done' }, exitCode: 0 });
    expect(claude.calls.map((call) => call.task.mode)).toEqual(['grade', 'grade', 'class-report']);
    expect(await testRow()).toMatchObject({ status: 'done', analysis_status: 'ready' });
  });

  it('writes only the analysis when everything is graded already', async () => {
    await setUp(1, 1);
    await world!.api.db.prepare("UPDATE submissions SET status = 'graded' WHERE test_id = ?").bind(world!.testId).run();
    await world!.api.db
      .prepare(
        `INSERT INTO evaluations (submission_id, max_total, office_points, total, grade, needs_review, summary, strengths_json,
           recommendations_json, unreadable_json, raw_json, created_at, updated_at)
         SELECT id, 10, 1, 9, 9, 0, 's', '[]', '[]', '[]', '{}', '2026-10-07T09:00:00.000Z', '2026-10-07T09:00:00.000Z'
         FROM submissions WHERE test_id = ?`,
      )
      .bind(world!.testId)
      .run();
    await askForAnalysis();
    const claude = scriptedClaude(answer(ANALYSIS));
    const report = await runRobot(options(claude));
    expect(report.summary).toMatchObject({ graded: 0, analyses: 1, stop: 'done' });
    expect(await testRow()).toMatchObject({ status: 'done', analysis_status: 'ready' });
  });

  it('tries a failing analysis once per run, and the test stays in evaluation for the next run', async () => {
    await setUp(1, 1);
    await askForAnalysis();
    const claude = scriptedClaude(answer(GRADING), problem('crash'));
    const report = await runRobot(options(claude));
    expect(report.summary).toMatchObject({ graded: 1, analyses: 0, stop: 'done' });
    expect(claude.calls.map((call) => call.task.mode)).toEqual(['grade', 'class-report']);
    expect(await testRow()).toMatchObject({ status: 'evaluating', analysis_status: 'requested', analysis_attempts: 1 });
  });

  it('stops at a usage limit during the analysis', async () => {
    await setUp(1, 1);
    await askForAnalysis();
    const claude = scriptedClaude(answer(GRADING), problem('usage_limit'));
    const report = await runRobot(options(claude));
    expect(report.summary).toMatchObject({ graded: 1, stop: 'usage_limit' });
    expect(await testRow()).toMatchObject({ analysis_status: 'requested', analysis_attempts: 0 });
  });
});

```

- [ ] **Step 7: Edit `runner/skill.test.ts`**

Find this block:

```ts
import { describe, expect, it } from 'vitest';
import { exerciseListSchema, gradingResultSchema } from '../shared/schemas.ts';
import { SKILL_DIR } from './workdir.ts';
```

Replace it with:

```ts
import { describe, expect, it } from 'vitest';
import { classAnalysisSchema, exerciseListSchema, gradingResultSchema } from '../shared/schemas.ts';
import { SKILL_DIR } from './workdir.ts';
```

- [ ] **Step 8: Edit `runner/skill.test.ts`**

Find this block:

```ts
    expect(skill).toContain('## Mode `grade`');
    expect(skill).toContain('`references/grading-rules.md`');
```

Replace it with:

```ts
    expect(skill).toContain('## Mode `grade`');
    expect(skill).toContain('## Mode `class-report`');
    expect(skill).toContain('`references/grading-rules.md`');
```

- [ ] **Step 9: Edit `runner/skill.test.ts`**

Find this block:

```ts
  it('names every file of the work folder', () => {
    for (const file of ['test/test.pdf', 'test/test.md', 'test/media/', 'barem/barem.pdf', 'barem/barem.md', 'barem/media/', 'barem/notes.md', 'exercises.json', 'student/', 'page-01.jpg']) {
      expect(skill).toContain(`\`${file}\``);
```

Replace it with:

```ts
  it('names every file of the work folder', () => {
    for (const file of ['test/test.pdf', 'test/test.md', 'test/media/', 'barem/barem.pdf', 'barem/barem.md', 'barem/media/', 'barem/notes.md', 'exercises.json', 'student/', 'page-01.jpg', 'class-results.json']) {
      expect(skill).toContain(`\`${file}\``);
```

- [ ] **Step 10: Edit `runner/skill.test.ts`**

Find this block:

```ts
      ...Object.keys(gradingResultSchema.shape.items.element.shape),
    ];
```

Replace it with:

```ts
      ...Object.keys(gradingResultSchema.shape.items.element.shape),
      ...Object.keys(classAnalysisSchema.shape),
    ];
```

- [ ] **Step 11: Edit `runner/skill.test.ts`**

Find this block:

```ts

  it('asks for comments without LaTeX, and never for a student name', () => {
```

Replace it with:

```ts

  it('tells Claude to name no student in the class analysis', () => {
    expect(skill).toContain('Do not name or describe a single student');
    expect(rules).toContain('never names a student');
  });

  it('asks for comments without LaTeX, and never for a student name', () => {
```

- [ ] **Step 12: Run the tests to see them fail**

Run: `npx vitest run runner/workdir.test.ts runner/claude.test.ts runner/tasks.test.ts runner/run.test.ts runner/skill.test.ts`
Expected: FAIL. `Test Files  5 failed (5)`, `Tests  17 failed | 68 passed (85)`. Failing tests: "is the evaluate-test skill and reads its mode from the argument"; "names every file of the work folder"; "explains every field of both answers"; "tells Claude to name no student in the class analysis"; "runs the same skill in its own mode, with 15 minutes"; "lays out a class analysis: the skill and the anonymized results, with no test and no barem"; "writes the class analysis after the gradings, in the same run"; "writes only the analysis when everything is graded already" and 9 more. Errors such as: `AssertionError: expected undefined to be 900000 // Object.is equality`; `AssertionError: expected { summary: { …(5) }, exitCode: +0 } to deeply equal { summary: { …(5) }, exitCode: +0 }`; `AssertionError: expected { exerciseLists: +0, graded: +0, …(3) } to match object { graded: +0, analyses: 1, …(1) }`. Tests of this task that do not fail yet are guards: they pass before and after.

- [ ] **Step 13: Edit `runner/api.ts`**

Find this block:

```ts
import type {
  CheckResult,
  ClaimResult,
  exerciseListBody,
```

Replace it with:

```ts
import type {
  analysisBody,
  CheckResult,
  ClaimResult,
  ClassResults,
  exerciseListBody,
```

- [ ] **Step 14: Edit `runner/api.ts`**

Find this block:

```ts
export type ResultPost = z.input<typeof resultBody>;

```

Replace it with:

```ts
export type ResultPost = z.input<typeof resultBody>;
export type AnalysisPost = z.input<typeof analysisBody>;

```

- [ ] **Step 15: Edit `runner/api.ts`**

Find this block:

```ts
  sendResult(submissionId: number, body: ResultPost): Promise<'graded' | 'submitted' | 'failed'>;
}
```

Replace it with:

```ts
  sendResult(submissionId: number, body: ResultPost): Promise<'graded' | 'submitted' | 'failed'>;
  // The graded class, anonymized, for the class analysis.
  classResults(testId: number): Promise<ClassResults>;
  // "ready": saved. "requested": an error was counted and the analysis waits
  // for another try. "failed": the last attempt failed.
  sendAnalysis(testId: number, body: AnalysisPost): Promise<'ready' | 'requested' | 'failed'>;
}
```

- [ ] **Step 16: Edit `runner/api.ts`**

Find this block:

```ts
      (await json<{ status: 'graded' | 'submitted' | 'failed' }>('POST', `/submissions/${submissionId}/result`, body)).status,
  };
```

Replace it with:

```ts
      (await json<{ status: 'graded' | 'submitted' | 'failed' }>('POST', `/submissions/${submissionId}/result`, body)).status,
    classResults: async (testId) => (await json<{ results: ClassResults }>('GET', `/tests/${testId}/results`)).results,
    sendAnalysis: async (testId, body) =>
      (await json<{ status: 'ready' | 'requested' | 'failed' }>('POST', `/tests/${testId}/analysis`, body)).status,
  };
```

- [ ] **Step 17: Edit `runner/claude.ts`**

Find this block:

```ts

export type ClaudeMode = 'exercise-list' | 'grade';

```

Replace it with:

```ts

export type ClaudeMode = 'exercise-list' | 'grade' | 'class-report';

```

- [ ] **Step 18: Edit `runner/claude.ts`**

Find this block:

```ts
// plus two calls of the longest task stays under the GitHub job's 180 minutes.
export const TIME_LIMITS_MS: Record<ClaudeMode, number> = { 'exercise-list': 10 * 60_000, grade: 20 * 60_000 };
// At the time limit Claude gets SIGINT, then SIGTERM after this, then SIGKILL.
```

Replace it with:

```ts
// plus two calls of the longest task stays under the GitHub job's 180 minutes.
export const TIME_LIMITS_MS: Record<ClaudeMode, number> = {
  'exercise-list': 10 * 60_000,
  grade: 20 * 60_000,
  'class-report': 15 * 60_000,
};
// At the time limit Claude gets SIGINT, then SIGTERM after this, then SIGKILL.
```

- [ ] **Step 19: Edit `runner/workdir.ts`**

Find this block:

```ts
import type { TestFileKind } from '../shared/files.ts';
import type { ExerciseList } from '../shared/schemas.ts';
```

Replace it with:

```ts
import type { TestFileKind } from '../shared/files.ts';
import type { ClassResults } from '../shared/runner.ts';
import type { ExerciseList } from '../shared/schemas.ts';
```

- [ ] **Step 20: Edit `runner/workdir.ts`**

Find this block:

```ts
//   student/page-01.jpg, …          (grade) the pages, in upload order

```

Replace it with:

```ts
//   student/page-01.jpg, …          (grade) the pages, in upload order
//   class-results.json              (class-report) the graded class, anonymized; no test, no barem

```

- [ ] **Step 21: Edit `runner/workdir.ts`**

Find this block:

```ts
export interface WorkFolderInput {
  test: TaskFile;
  barem: TaskFile;
  // Extra teacher comments for the barem, as part of it.
```

Replace it with:

```ts
export interface WorkFolderInput {
  // Not for the class analysis: the exercise list in its results holds what it needs.
  test?: TaskFile;
  barem?: TaskFile;
  // Extra teacher comments for the barem, as part of it.
```

- [ ] **Step 22: Edit `runner/workdir.ts`**

Find this block:

```ts
  pages?: TaskFile[];
}
```

Replace it with:

```ts
  pages?: TaskFile[];
  // Class-report mode: the graded class, anonymized.
  classResults?: ClassResults;
}
```

- [ ] **Step 23: Edit `runner/workdir.ts`**

Find this block:

```ts
  const pandoc = options.pandoc ?? realPandoc;
  await writeTeacherFile(folder, 'test', input.test, pandoc);
  await writeTeacherFile(folder, 'barem', input.barem, pandoc);
  if (input.baremNotes) {
    await writeFile(path.join(folder, 'barem', 'notes.md'), `${input.baremNotes.trim()}\n`);
```

Replace it with:

```ts
  const pandoc = options.pandoc ?? realPandoc;
  if (input.test) await writeTeacherFile(folder, 'test', input.test, pandoc);
  if (input.barem) await writeTeacherFile(folder, 'barem', input.barem, pandoc);
  if (input.baremNotes && input.barem) {
    await writeFile(path.join(folder, 'barem', 'notes.md'), `${input.baremNotes.trim()}\n`);
```

- [ ] **Step 24: Edit `runner/workdir.ts`**

Find this block:

```ts
    await writeFile(path.join(folder, 'exercises.json'), `${JSON.stringify(input.exerciseList, null, 2)}\n`);
  }
```

Replace it with:

```ts
    await writeFile(path.join(folder, 'exercises.json'), `${JSON.stringify(input.exerciseList, null, 2)}\n`);
  }
  if (input.classResults) {
    await writeFile(path.join(folder, 'class-results.json'), `${JSON.stringify(input.classResults, null, 2)}\n`);
  }
```

- [ ] **Step 25: Edit `runner/tasks.ts`**

Find this block:

```ts
import type { ExerciseList } from '../shared/schemas.ts';
import { checkExerciseList, checkGrading, claudeJsonSchema, exerciseListSchema, gradingResultSchema } from '../shared/schemas.ts';
import type { RobotApi } from './api.ts';
```

Replace it with:

```ts
import type { ExerciseList } from '../shared/schemas.ts';
import {
  checkClassAnalysis,
  checkExerciseList,
  checkGrading,
  claudeJsonSchema,
  classAnalysisSchema,
  exerciseListSchema,
  gradingResultSchema,
} from '../shared/schemas.ts';
import type { RobotApi } from './api.ts';
```

- [ ] **Step 26: Edit `runner/tasks.ts`**

Find this block:

```ts

// The robot's two tasks (spec §12.2): make the exercise list of a test, and
// grade one upload. Each one builds its work folder, runs Claude, checks the
// answer with the API's own checks, and sends it.

```

Replace it with:

```ts

// The robot's three tasks (spec §12.2): make the exercise list of a test,
// grade one upload, and write the analysis of a graded class. Each one builds
// its work folder, runs Claude, checks the answer with the API's own checks,
// and sends it.

```

- [ ] **Step 27: Edit `runner/tasks.ts`**

Find this block:

```ts
  grade: claudeJsonSchema(gradingResultSchema),
};
```

Replace it with:

```ts
  grade: claudeJsonSchema(gradingResultSchema),
  'class-report': claudeJsonSchema(classAnalysisSchema),
};
```

- [ ] **Step 28: Edit `runner/tasks.ts`**

Find this block:

```ts

export async function gradeSubmission(ctx: TaskContext, claim: ClaimResult): Promise<TaskEnd> {
```

Replace it with:

```ts

// The class analysis of a test whose uploads are all graded. The results are
// read with a version that goes back with the analysis, so the API can tell
// an analysis made from grades that changed meanwhile.
export async function analyzeClass(ctx: TaskContext, testId: number): Promise<TaskEnd> {
  const end = await inWorkFolder(ctx, `class-report-${testId}`, async (makeFolder) => {
    const sendError = async (error: RobotError) =>
      (await ctx.api.sendAnalysis(testId, { runId: ctx.runId, ok: false, error })) === 'failed';
    const classResults = await ctx.api.classResults(testId);
    const cwd = await makeFolder({ classResults });
    if (!cwd) return sendOutcome({ ok: false, problem: 'crash', detail: 'work folder' }, async () => undefined, sendError);
    const outcome = await askClaude(ctx, 'class-report', cwd, (output) => checkClassAnalysis(output).ok);
    return sendOutcome(
      outcome,
      (analysis) => ctx.api.sendAnalysis(testId, { runId: ctx.runId, ok: true, version: classResults.version, analysis }),
      sendError,
    );
  });
  log('class report', { test: testId, end });
  return end;
}

export async function gradeSubmission(ctx: TaskContext, claim: ClaimResult): Promise<TaskEnd> {
```

- [ ] **Step 29: Edit `runner/run.ts`**

Find this block:

```ts
import type { TaskContext, TaskEnd } from './tasks.ts';
import { gradeSubmission, makeExerciseList } from './tasks.ts';
import type { WorkFolderOptions } from './workdir.ts';
```

Replace it with:

```ts
import type { TaskContext, TaskEnd } from './tasks.ts';
import { analyzeClass, gradeSubmission, makeExerciseList } from './tasks.ts';
import type { WorkFolderOptions } from './workdir.ts';
```

- [ ] **Step 30: Edit `runner/run.ts`**

Find this block:

```ts
// One robot run (spec §12.2): take the lease, make the exercise lists, grade
// the uploads with up to maxParallel Claude runs at once, and give the lease
// back with a summary of counts.

```

Replace it with:

```ts
// One robot run (spec §12.2): take the lease, make the exercise lists, grade
// the uploads with up to maxParallel Claude runs at once, write the class
// analyses, and give the lease back with a summary of counts.

```

- [ ] **Step 31: Edit `runner/run.ts`**

Find this block:

```ts
  const ctx: TaskContext = { api, claude: options.claude, runId, root: options.root, workdir: options.workdir };
  const counts = { exerciseLists: 0, graded: 0, failed: 0 };
  let stop: RunSummary['stop'] | null = null;
```

Replace it with:

```ts
  const ctx: TaskContext = { api, claude: options.claude, runId, root: options.root, workdir: options.workdir };
  const counts = { exerciseLists: 0, graded: 0, failed: 0, analyses: 0 };
  let stop: RunSummary['stop'] | null = null;
```

- [ ] **Step 32: Edit `runner/run.ts`**

Find this block:

```ts
  let failuresInARow = 0;
  const record = (end: TaskEnd, done: 'exerciseLists' | 'graded') => {
    if (end === 'saved') counts[done] += 1;
```

Replace it with:

```ts
  let failuresInARow = 0;
  const record = (end: TaskEnd, done: 'exerciseLists' | 'graded' | 'analyses') => {
    if (end === 'saved') counts[done] += 1;
```

- [ ] **Step 33: Edit `runner/run.ts`**

Find this block:

```ts
    const listsTried = new Set<number>();
    while (canTake()) {
```

Replace it with:

```ts
    const listsTried = new Set<number>();
    // The same for an analysis: one try per test and run.
    const analysesTried = new Set<number>();
    while (canTake()) {
```

- [ ] **Step 34: Edit `runner/run.ts`**

Find this block:

```ts
      if (canTake()) started += await gradeAll();
      // Nothing new to start: the work is done. (Class analyses come with Plan 4.)
      if (started === 0) break;
```

Replace it with:

```ts
      if (canTake()) started += await gradeAll();
      // A test whose uploads are all graded now waits for its analysis: the
      // list of tasks is read again, after the gradings.
      if (canTake()) {
        for (const testId of (await api.tasks()).analyses) {
          if (analysesTried.has(testId) || !canTake()) continue;
          analysesTried.add(testId);
          started += 1;
          record(await analyzeClass(ctx, testId), 'analyses');
        }
      }
      // Nothing new to start: the work is done.
      if (started === 0) break;
```

- [ ] **Step 35: Edit `runner/run.ts`**

Find this block:

```ts

  const summary: RunSummary = { ...counts, analyses: 0, stop: stop ?? 'done' };
  try {
```

Replace it with:

```ts

  const summary: RunSummary = { ...counts, stop: stop ?? 'done' };
  try {
```

- [ ] **Step 36: Edit `.claude/skills/evaluate-test/SKILL.md`**

Find this block:

```markdown
name: evaluate-test
description: Grades a Romanian math test for QuickEval. Modes "exercise-list" (read the test and the barem, list the exercises) and "grade" (grade one student's pages).
argument-hint: exercise-list | grade
---
```

Replace it with:

```markdown
name: evaluate-test
description: Grades a Romanian math test for QuickEval. Modes "exercise-list" (read the test and the barem, list the exercises), "grade" (grade one student's pages), and "class-report" (analyze the graded class).
argument-hint: exercise-list | grade | class-report
---
```

- [ ] **Step 37: Edit `.claude/skills/evaluate-test/SKILL.md`**

Find this block:

```markdown
Do not add up the points, and do not give a grade: the platform does that.
```

Replace it with:

```markdown
Do not add up the points, and do not give a grade: the platform does that.

## Mode `class-report`

Files:

- `class-results.json`: the graded class, without names. It holds:
  - `exercises`: the exercise list: `id`, `label`, `maxPoints`, `topic`, `answer`, and `scoringNotes` of each exercise;
  - `maxTotal` and `officePoints`;
  - `students`: one entry for each graded student, named "Elev 1", "Elev 2", …, with `total`, `grade`, and `items`. Each item has the `exerciseId`, the final `points`, the `studentAnswer`, and the `comment` that the student got.

There are no pages and no test files in this mode. Read `class-results.json` and write the analysis for the teacher. Base every statement on the data: do not invent a mistake that no student made. Name an exercise by its `label` or its `topic`, and say how many students (or about what share of them) it concerns. Do not name or describe a single student, and do not write "Elev 3": write "mai mulți elevi" or "doi elevi".

- `overview`: 2 to 5 sentences in Romanian about the class: how the test went, the spread of the grades, and the strongest and the weakest part.
- `strengths`: 0 to 8 short Romanian phrases: topics that most students did well.
- `weaknesses`: 0 to 8 short Romanian phrases: topics where many students lost points.
- `commonMistakes`: 0 to 8 short Romanian phrases: the same mistake made by several students, with the exercise.
- `recommendations`: 0 to 8 short Romanian phrases: what to practice next with the whole class.
```

- [ ] **Step 38: Edit `.claude/skills/evaluate-test/references/grading-rules.md`**

Find this block:

```markdown
- Every text you write is plain text with Unicode math, not only the comments: `answer`, `notes`, `studentAnswer`, `summary`, `strengths`, and `recommendations` too.
```

Replace it with:

```markdown
- Every text you write is plain text with Unicode math, not only the comments: `answer`, `notes`, `studentAnswer`, `summary`, `strengths`, and `recommendations` too.

## The class analysis

- It is written for the teacher, in Romanian, as short plain statements. The teacher may share it, so it never names a student.
- Use only what the data shows. A mistake that one student made is not "common".
- The texts of the analysis are plain text with Unicode math too: `overview`, `strengths`, `weaknesses`, `commonMistakes`, and `recommendations`.
```

- [ ] **Step 39: Edit `scripts/smoke.mjs`**

Find this block:

```js

const released = await robot('POST', '/release', { runId, summary: { exerciseLists: 1, graded: 1, failed: 0, analyses: 0, stop: 'done' } });
check('the robot frees the lease', released.status === 200, JSON.stringify(released.body));
```

Replace it with:

```js

// The test waits for its class analysis, which the robot writes from the anonymized results.
const analysisTasks = await robot('GET', '/tasks');
check('the test waits for its class analysis', analysisTasks.body?.analyses?.includes(testId), JSON.stringify(analysisTasks.body));
const classResults = await robot('GET', `/tests/${testId}/results`);
const results = classResults.body?.results;
check(
  'the robot reads the graded class without names',
  classResults.status === 200 && results?.students?.length === 1 && results.students[0].label === 'Elev 1' && results.students[0].items[0].points === 7.5,
  JSON.stringify(classResults.body),
);
const analysis = { overview: 'Clasa a lucrat bine.', strengths: ['Calcul'], weaknesses: [], commonMistakes: [], recommendations: ['Exersați.'] };
const savedAnalysis = await robot('POST', `/tests/${testId}/analysis`, { runId, ok: true, version: results?.version, analysis });
check('the robot saves the class analysis', savedAnalysis.status === 200 && savedAnalysis.body?.status === 'ready', JSON.stringify(savedAnalysis.body));

const released = await robot('POST', '/release', { runId, summary: { exerciseLists: 1, graded: 1, failed: 0, analyses: 1, stop: 'done' } });
check('the robot frees the lease', released.status === 200, JSON.stringify(released.body));
```

- [ ] **Step 40: Edit `scripts/smoke.mjs`**

Find this block:

```js
check(
  'the teacher sees the grade and a finished test',
  gradedDetail.body?.test?.status === 'done' && gradedRow?.status === 'graded' && gradedRow?.grade === 8.5,
  JSON.stringify({ status: gradedDetail.body?.test?.status, row: gradedRow }),
);
```

Replace it with:

```js
check(
  'the teacher sees the grade, the analysis, and a finished test',
  gradedDetail.body?.test?.status === 'done' &&
    gradedDetail.body?.test?.analysis?.status === 'ready' &&
    gradedRow?.status === 'graded' &&
    gradedRow?.grade === 8.5,
  JSON.stringify({ status: gradedDetail.body?.test?.status, analysis: gradedDetail.body?.test?.analysis, row: gradedRow }),
);
```

- [ ] **Step 41: Edit `runner/AGENTS.md`**

Find this block:

```markdown

- `check.ts` (is there work?), `run.ts` (one run: lease, heartbeat, exercise lists, parallel gradings), `tasks.ts` (make an exercise list, grade one upload), `claude.ts` (starts Claude Code and reads its answer), `workdir.ts` (a task's work folder; Word files through pandoc), `api.ts` (the only code that calls `/api/runner`), `log.ts`, `trySkill.ts` (`npm run try:skill`).
- `fixtures/`: real Claude outputs. `test/`: the API in-process, a scripted Claude.
```

Replace it with:

```markdown

- `check.ts` (is there work?), `run.ts` (one run: lease, heartbeat, exercise lists, parallel gradings), `tasks.ts` (make an exercise list, grade one upload, write the class analysis), `claude.ts` (starts Claude Code and reads its answer), `workdir.ts` (a task's work folder; Word files through pandoc), `api.ts` (the only code that calls `/api/runner`), `log.ts`, `trySkill.ts` (`npm run try:skill`).
- `fixtures/`: real Claude outputs. `test/`: the API in-process, a scripted Claude.
```

- [ ] **Step 42: Edit `runner/AGENTS.md`**

Find this block:

```markdown
- `check.ts` runs before `npm ci`, and `run.ts` after `npm ci --omit=dev`: check.ts loads no package, and run.ts loads only zod. Import types from `shared/` with `import type`: an import with only `{ type X }` still loads its module. `check.test.ts` and `run.test.ts` prove both.
- Robot answers carry ids, counts, and file types, never names: a student's page goes out as `file-<id>`. The robot's logs are public: it logs through `log.ts` only ids, counts, durations, and error categories, never Claude's text or messages.
```

Replace it with:

```markdown
- `check.ts` runs before `npm ci`, and `run.ts` after `npm ci --omit=dev`: check.ts loads no package, and run.ts loads only zod. Import types from `shared/` with `import type`: an import with only `{ type X }` still loads its module. `check.test.ts` and `run.test.ts` prove both.
- The class analysis (`analyzeClass`) reads `GET /tests/:id/results` (students are "Elev 1" … "Elev n") and sends back the `version` of the grades it read, so an analysis made from grades that changed meanwhile is saved as out of date. Its work folder holds the skill and `class-results.json` only. A run tries an analysis once per test.
- Robot answers carry ids, counts, and file types, never names: a student's page goes out as `file-<id>`. The robot's logs are public: it logs through `log.ts` only ids, counts, durations, and error categories, never Claude's text or messages.
```

- [ ] **Step 43: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
     When /claim returns 204 and no task is running, grading is done.
  3. analyses: for each test id in tasks.analyses, run the task "class-report"  (Plan 4b)
  until a round starts no new task, the budget is used, or the run stops taking work
```

Replace it with:

```markdown
     When /claim returns 204 and no task is running, grading is done.
  3. analyses: read GET /tasks again (the gradings of this round may have finished a test), and for each test id in tasks.analyses run the task "class-report" (one at a time, each test at most once per run)
  until a round starts no new task, the budget is used, or the run stops taking work
```

- [ ] **Step 44: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

````markdown
student/page-01.jpg, page-02.pdf ... (grade mode)    renamed by upload order; original names are never used
class-results.json   (class-report mode)   anonymized data from GET /tests/:id/results
```
````

Replace it with:

````markdown
student/page-01.jpg, page-02.pdf ... (grade mode)    renamed by upload order; original names are never used
class-results.json   (class-report mode)   anonymized data from GET /tests/:id/results; no test, no barem, no pages
```
````

- [ ] **Step 45: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  66 passed (66)`, `Tests  885 passed (885)`.

- [ ] **Step 46: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 47: Commit**

```bash
git add runner .claude scripts docs
git commit -m "Let the robot write the class analysis: the class-report mode, the third task, and the third step of a run"
```

---

### Task 5: The class report's rows and statistics

`GET /api/admin/tests/:code/report` gives the graded students with their items, the students that have no result, and the analysis. `shared/stats.ts` makes the numbers of the report: the average, the median, the lowest and the highest grade, the grade groups, and for each exercise the average and how many students got all, some, or none of the points.

**Files:**
- Create: `shared/stats.ts`, `server/db/report.ts`
- Modify: `shared/api.ts`, `server/routes/tests.ts`, `src/admin/api.ts`, `src/test/fakeApi.ts`
- Test: `shared/stats.test.ts` (new), `server/routes/report.test.ts` (new)

**Interfaces:**
- Consumes: `flagCountSql`, `compareStudentNames`, `AnalysisInfo`, `ClassAnalysis`, `addEvaluation`, `addSubmission`.
- Produces:
  - `ReportItem`, `ReportRow`, `ReportMissing`, `ClassReport { test, exercises, rows, missing, analysis: AnalysisInfo & { content: ClassAnalysis | null } }` in `shared/api.ts`.
  - `GRADE_GROUPS`, `ExerciseStats`, `ClassStats`, `classStats(report): ClassStats` in `shared/stats.ts`.
  - `getClassReport(db, teacherId, testId): Promise<ClassReport | null>` in `server/db/report.ts`.
  - Route `GET /api/admin/tests/:code/report` answering `{ report }`; client `getReport(code)`; `FakeData.reports` and `getReport` in the fake API.

- [ ] **Step 1: Create `shared/stats.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { ReportRow } from './api.ts';
import { classStats, GRADE_GROUPS } from './stats.ts';

const exercises = [
  { id: 'E1', label: 'Exercițiul 1', maxPoints: 4 },
  { id: 'E2', label: 'Exercițiul 2', maxPoints: 5 },
];

function row(id: number, grade: number, points: [number, number], flagCount = 0): ReportRow {
  return {
    submissionId: id,
    studentId: id,
    studentName: `Elev ${id}`,
    total: grade,
    maxTotal: 10,
    grade,
    flagCount,
    items: [
      { exerciseId: 'E1', points: points[0], maxPoints: 4, flagged: false },
      { exerciseId: 'E2', points: points[1], maxPoints: 5, flagged: false },
    ],
  };
}

describe('classStats', () => {
  it('has no numbers for a class without results', () => {
    const stats = classStats({ exercises, rows: [], missing: [{ studentId: 1, studentName: 'Pop Ion', status: 'none' }] });
    expect(stats).toMatchObject({ gradedCount: 0, activeCount: 1, average: null, median: null, min: null, max: null, flaggedCount: 0 });
    expect(stats.groups.map((group) => group.count)).toEqual([0, 0, 0, 0]);
    expect(stats.perExercise[0]).toMatchObject({ count: 0, averagePoints: null, averagePercent: null, full: 0, partial: 0, zero: 0 });
  });

  it('gives the average, the median, the lowest and the highest grade', () => {
    const rows = [row(1, 10, [4, 5]), row(2, 7.5, [3, 4]), row(3, 4.99, [1, 3]), row(4, 9, [4, 4])];
    const stats = classStats({ exercises, rows, missing: [] });
    expect(stats).toMatchObject({ gradedCount: 4, activeCount: 4, average: 7.87, median: 8.25, min: 4.99, max: 10 });
  });

  it('takes the middle grade of an odd class as the median', () => {
    const stats = classStats({ exercises, rows: [row(1, 3, [0, 0]), row(2, 9, [4, 5]), row(3, 6, [2, 2])], missing: [] });
    expect(stats.median).toBe(6);
  });

  it('puts a grade at a limit in the higher group', () => {
    const grades = [0, 4.99, 5, 6.99, 7, 8.99, 9, 10];
    const stats = classStats({ exercises, rows: grades.map((grade, index) => row(index + 1, grade, [0, 0])), missing: [] });
    expect(GRADE_GROUPS.map((group) => group.label)).toEqual(['1-4,99', '5-6,99', '7-8,99', '9-10']);
    expect(stats.groups).toEqual([
      { label: '1-4,99', count: 2 },
      { label: '5-6,99', count: 2 },
      { label: '7-8,99', count: 2 },
      { label: '9-10', count: 2 },
    ]);
  });

  it('counts the students with all, some, and none of the points of each exercise', () => {
    const rows = [row(1, 9, [4, 5]), row(2, 5, [2, 0]), row(3, 1, [0, 0.33]), row(4, 9, [4, 4.65])];
    const stats = classStats({ exercises, rows, missing: [] });
    expect(stats.perExercise[0]).toMatchObject({ exerciseId: 'E1', count: 4, averagePoints: 2.5, averagePercent: 63, full: 2, partial: 1, zero: 1 });
    expect(stats.perExercise[1]).toMatchObject({ exerciseId: 'E2', averagePoints: 2.5, averagePercent: 50, full: 1, partial: 2, zero: 1 });
  });

  it('counts a maximum that a barem sets to a fraction as full points', () => {
    const odd = [{ id: 'E1', label: 'E1', maxPoints: 0.33 }];
    const rows = [{ ...row(1, 10, [0, 0]), items: [{ exerciseId: 'E1', points: 0.33, maxPoints: 0.33, flagged: false }] }];
    expect(classStats({ exercises: odd, rows, missing: [] }).perExercise[0]).toMatchObject({ full: 1, partial: 0, zero: 0 });
  });

  it('skips a result that has no such exercise, and sums the items to check', () => {
    const rows = [row(1, 8, [3, 3], 2), { ...row(2, 6, [2, 2], 1), items: [{ exerciseId: 'E1', points: 2, maxPoints: 4, flagged: true }] }];
    const stats = classStats({ exercises, rows, missing: [] });
    expect(stats.perExercise[0]!.count).toBe(2);
    expect(stats.perExercise[1]!.count).toBe(1);
    expect(stats.flaggedCount).toBe(3);
  });

  it('counts the active students that have no result', () => {
    const stats = classStats({
      exercises,
      rows: [row(1, 8, [3, 3])],
      missing: [
        { studentId: 2, studentName: 'Ionescu Ana', status: 'none' },
        { studentId: 3, studentName: 'Stan Eva', status: 'failed' },
      ],
    });
    expect(stats).toMatchObject({ gradedCount: 1, activeCount: 3 });
  });
});
```

- [ ] **Step 2: Create `server/routes/report.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExerciseList } from '../../shared/schemas.ts';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let code: string;
let testId: number;
let studentIds: number[];

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [
    { id: 'E1', label: 'Exercițiul 1', maxPoints: 4.5, answer: '3/4', scoringNotes: '', topic: 'Fracții' },
    { id: 'E2', label: 'Exercițiul 2', maxPoints: 4.5, answer: 'x = 2', scoringNotes: '', topic: 'Ecuații' },
  ],
  notes: '',
};

const report = (target = code) => api.request('GET', `/api/admin/tests/${target}/report`);

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2', ['Stan Eva', 'Avram Dan', 'Pop Ion', 'Ionescu Ana']);
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id, 'Fracții');
  testId = await testIdOf(api, code);
  await api.db.prepare('UPDATE tests SET exercise_list_json = ?, exercise_list_status = ? WHERE id = ?').bind(JSON.stringify(LIST), 'ready', testId).run();
});

afterEach(async () => {
  await api.dispose();
});

describe('GET /api/admin/tests/:code/report', () => {
  it('lists the graded students by name with their items, and the others below', async () => {
    const pop = await addSubmission(api, code, studentIds[2]!, { status: 'graded', files: 1 });
    await addEvaluation(api, pop, { grade: 8, items: [{ needsReview: true }, { needsReview: true, reviewed: true }] });
    const avram = await addSubmission(api, code, studentIds[1]!, { status: 'graded', files: 1 });
    await addEvaluation(api, avram, { grade: 9.5, items: [{}, {}], unreadable: ['student/page-02.jpg'] });
    await addSubmission(api, code, studentIds[0]!, { status: 'failed', files: 1 });

    const res = await report();
    expect(res.status).toBe(200);
    const { report: body } = res.body;
    expect(body.test).toMatchObject({ code, title: 'Fracții', className: '6E2', status: 'draft' });
    expect(body.exercises).toEqual([
      { id: 'E1', label: 'Exercițiul 1', maxPoints: 4.5 },
      { id: 'E2', label: 'Exercițiul 2', maxPoints: 4.5 },
    ]);
    expect(body.rows.map((row: { studentName: string }) => row.studentName)).toEqual(['Avram Dan', 'Pop Ion']);
    expect(body.rows[1]).toMatchObject({ submissionId: pop, grade: 8, maxTotal: 10, flagCount: 1 });
    expect(body.rows[1].items).toEqual([
      { exerciseId: 'E1', points: 1, maxPoints: 1, flagged: true },
      { exerciseId: 'E2', points: 1, maxPoints: 1, flagged: false },
    ]);
    // Pages that were not checked count as one item to check.
    expect(body.rows[0]).toMatchObject({ grade: 9.5, flagCount: 1 });
    expect(body.missing).toEqual([
      { studentId: studentIds[3], studentName: 'Ionescu Ana', status: 'none' },
      { studentId: studentIds[0], studentName: 'Stan Eva', status: 'failed' },
    ]);
  });

  it('has no rows for a test without a graded upload', async () => {
    const res = await report();
    expect(res.status).toBe(200);
    expect(res.body.report.rows).toEqual([]);
    expect(res.body.report.missing).toHaveLength(4);
    expect(res.body.report.analysis).toEqual({ status: 'none', stale: false, content: null });
  });

  it('carries the analysis and whether it is out of date', async () => {
    const analysis = { overview: 'Bine.', strengths: [], weaknesses: [], commonMistakes: [], recommendations: [] };
    await api.db
      .prepare("UPDATE tests SET analysis_status = 'ready', analysis_stale = 1, analysis_json = ? WHERE id = ?")
      .bind(JSON.stringify(analysis), testId)
      .run();
    const res = await report();
    expect(res.body.report.analysis).toEqual({ status: 'ready', stale: true, content: analysis });
  });

  it('leaves out a student who left the class, unless a result exists', async () => {
    await api.db.prepare('UPDATE enrollments SET active = 0 WHERE student_id = ?').bind(studentIds[0]).run();
    const left = await addSubmission(api, code, studentIds[0]!, { status: 'graded', files: 1 });
    await addEvaluation(api, left, { grade: 7 });
    const res = await report();
    expect(res.body.report.rows.map((row: { studentName: string }) => row.studentName)).toEqual(['Stan Eva']);
    expect(res.body.report.missing.map((row: { studentName: string }) => row.studentName)).toEqual(['Avram Dan', 'Ionescu Ana', 'Pop Ion']);
  });

  it('answers 404 for a test of another teacher or an unknown code', async () => {
    const foreign = await otherTeacherTest(api);
    expect((await report(foreign.code)).status).toBe(404);
    expect((await report('9Z-26T99')).status).toBe(404);
    expect((await report('x')).status).toBe(404);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run shared/stats.test.ts server/routes/report.test.ts`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  4 failed | 1 passed (5)`. Failing tests: "lists the graded students by name with their items, and the others below"; "has no rows for a test without a graded upload"; "carries the analysis and whether it is out of date"; "leaves out a student who left the class, unless a result exists". Errors such as: `Error: Cannot find module './stats.ts' imported from C:/Users/gabi/AppData/Local/Temp/claude/D--Projects-QuickEval/3bb40`; `AssertionError: expected 404 to be 200 // Object.is equality`; `TypeError: Cannot read properties of undefined (reading 'analysis')`. Tests of this task that do not fail yet are guards: they pass before and after.

- [ ] **Step 4: Edit `shared/api.ts`**

Find this block:

```ts
import { MAX_PARALLEL_AGENTS, type RunSummary } from './runner.ts';
import { TEXT_LIMITS, type Confidence } from './schemas.ts';
import { isValidSchoolYear } from './schoolYear.ts';
```

Replace it with:

```ts
import { MAX_PARALLEL_AGENTS, type RunSummary } from './runner.ts';
import { type ClassAnalysis, TEXT_LIMITS, type Confidence } from './schemas.ts';
import { isValidSchoolYear } from './schoolYear.ts';
```

- [ ] **Step 5: Edit `shared/api.ts`**

Find this block:

```ts
  message: string | null;
}
```

Replace it with:

```ts
  message: string | null;
}

// One exercise of a graded student in the class report.
export interface ReportItem {
  exerciseId: string;
  points: number;
  maxPoints: number;
  // An item to check that the teacher has not checked yet.
  flagged: boolean;
}

// One graded student in the class report (spec §14.2).
export interface ReportRow {
  submissionId: number;
  studentId: number;
  studentName: string;
  total: number;
  maxTotal: number;
  // Out of 10.
  grade: number;
  // Items to check that the teacher has not checked yet, plus one for pages
  // that could not be read.
  flagCount: number;
  items: ReportItem[];
}

// An active student of the class with no graded result, and why.
export interface ReportMissing {
  studentId: number;
  studentName: string;
  status: UploadStatus;
}

// The class report of a test (spec §14.2). The statistics come from
// `classStats` (shared/stats.ts), in the browser.
export interface ClassReport {
  test: { code: string; title: string; className: string; status: TestStatus; startedAt: string | null };
  // The exercises of the test, in barem order.
  exercises: { id: string; label: string; maxPoints: number }[];
  rows: ReportRow[];
  missing: ReportMissing[];
  analysis: AnalysisInfo & { content: ClassAnalysis | null };
}
```

- [ ] **Step 6: Create `shared/stats.ts`**

```ts
import type { ClassReport } from './api.ts';
import { round2, toCents } from './scoring.ts';

// The statistics of the class report (spec §14.2): pure functions of the
// report's rows, computed in the browser and tested without it.

// A grade falls in one group; the first group holds everything below 5.
export const GRADE_GROUPS = [
  { label: '1-4,99', from: 0 },
  { label: '5-6,99', from: 5 },
  { label: '7-8,99', from: 7 },
  { label: '9-10', from: 9 },
] as const;

export interface ExerciseStats {
  exerciseId: string;
  label: string;
  maxPoints: number;
  // Students that have this exercise in their result.
  count: number;
  // Average points, in cents, and as a whole percent of the maximum.
  averagePoints: number | null;
  averagePercent: number | null;
  // Students with all the points, some, and none.
  full: number;
  partial: number;
  zero: number;
}

export interface ClassStats {
  gradedCount: number;
  // Graded students and the active students that have no result.
  activeCount: number;
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  groups: { label: string; count: number }[];
  perExercise: ExerciseStats[];
  // Items to check that the teacher has not checked yet, in all the results.
  flaggedCount: number;
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : round2((sorted[middle - 1]! + sorted[middle]!) / 2);
}

export function classStats(report: Pick<ClassReport, 'exercises' | 'rows' | 'missing'>): ClassStats {
  const grades = report.rows.map((row) => row.grade).sort((a, b) => a - b);
  const sum = grades.reduce((total, grade) => total + grade, 0);
  const groups = GRADE_GROUPS.map((group, index) => {
    const until = GRADE_GROUPS[index + 1]?.from ?? Infinity;
    return { label: group.label, count: grades.filter((grade) => grade >= group.from && grade < until).length };
  });
  const perExercise = report.exercises.map((exercise): ExerciseStats => {
    const points = report.rows.flatMap((row) => row.items.filter((item) => item.exerciseId === exercise.id).map((item) => item.points));
    const maxCents = Math.round(exercise.maxPoints * 100);
    const cents = points.map((value) => toCents(value) ?? Math.round(value * 100));
    const averagePoints = points.length === 0 ? null : round2(points.reduce((total, value) => total + value, 0) / points.length);
    return {
      exerciseId: exercise.id,
      label: exercise.label,
      maxPoints: exercise.maxPoints,
      count: points.length,
      averagePoints,
      averagePercent: averagePoints === null ? null : Math.round((averagePoints / exercise.maxPoints) * 100),
      full: cents.filter((value) => value >= maxCents).length,
      partial: cents.filter((value) => value > 0 && value < maxCents).length,
      zero: cents.filter((value) => value <= 0).length,
    };
  });
  return {
    gradedCount: report.rows.length,
    activeCount: report.rows.length + report.missing.length,
    average: grades.length === 0 ? null : round2(sum / grades.length),
    median: median(grades),
    min: grades[0] ?? null,
    max: grades.at(-1) ?? null,
    groups,
    perExercise,
    flaggedCount: report.rows.reduce((total, row) => total + row.flagCount, 0),
  };
}
```

- [ ] **Step 7: Create `server/db/report.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { ClassReport, ReportMissing, ReportRow, UploadStatus } from '../../shared/api.ts';
import type { ClassAnalysis, ExerciseList } from '../../shared/schemas.ts';
import { compareStudentNames } from '../../shared/students.ts';
import type { AnalysisStatus, TestStatus } from '../../shared/tests.ts';
import { flagCountSql } from './evaluations.ts';

// The rows of the class report (spec §14.2), in four queries whatever the size
// of the class: the test, the graded results, their items, and the active
// students that have no graded result.
export async function getClassReport(db: D1Database, teacherId: number, testId: number): Promise<ClassReport | null> {
  const [test, graded, items, missing] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT t.code, t.title, t.status, t.started_at, t.class_id, c.name AS class_name, t.exercise_list_json,
           t.analysis_status, t.analysis_stale, t.analysis_json
         FROM tests t JOIN classes c ON c.id = t.class_id WHERE t.id = ? AND t.teacher_id = ?`,
      )
      .bind(testId, teacherId),
    db
      .prepare(
        `SELECT s.id AS submission_id, st.id AS student_id, st.full_name, ev.total, ev.max_total, ev.grade,
           ${flagCountSql('ev')} AS flag_count
         FROM submissions s
         JOIN tests t ON t.id = s.test_id
         JOIN students st ON st.id = s.student_id
         JOIN evaluations ev ON ev.submission_id = s.id
         WHERE s.test_id = ? AND s.status = 'graded' AND t.teacher_id = ?`,
      )
      .bind(testId, teacherId),
    db
      .prepare(
        `SELECT s.id AS submission_id, i.exercise_id, i.points, i.max_points,
           CASE WHEN i.needs_review = 1 AND i.reviewed_at IS NULL THEN 1 ELSE 0 END AS flagged
         FROM submissions s
         JOIN tests t ON t.id = s.test_id
         JOIN evaluations ev ON ev.submission_id = s.id
         JOIN evaluation_items i ON i.evaluation_id = ev.id
         WHERE s.test_id = ? AND s.status = 'graded' AND t.teacher_id = ?
         ORDER BY s.id, i.position`,
      )
      .bind(testId, teacherId),
    db
      .prepare(
        `SELECT st.id AS student_id, st.full_name, s.status
         FROM tests t
         JOIN enrollments e ON e.class_id = t.class_id AND e.active = 1
         JOIN students st ON st.id = e.student_id
         LEFT JOIN submissions s ON s.test_id = t.id AND s.student_id = st.id
         WHERE t.id = ? AND t.teacher_id = ? AND (s.status IS NULL OR s.status <> 'graded')`,
      )
      .bind(testId, teacherId),
  ]);
  const head = test?.results[0] as
    | {
        code: string;
        title: string;
        status: TestStatus;
        started_at: string | null;
        class_name: string;
        exercise_list_json: string | null;
        analysis_status: AnalysisStatus;
        analysis_stale: number;
        analysis_json: string | null;
      }
    | undefined;
  if (!head) return null;
  const list = head.exercise_list_json ? (JSON.parse(head.exercise_list_json) as ExerciseList) : null;

  const itemsBySubmission = new Map<number, ReportRow['items']>();
  for (const row of (items?.results ?? []) as { submission_id: number; exercise_id: string; points: number; max_points: number; flagged: number }[]) {
    const own = itemsBySubmission.get(row.submission_id) ?? [];
    own.push({ exerciseId: row.exercise_id, points: row.points, maxPoints: row.max_points, flagged: row.flagged === 1 });
    itemsBySubmission.set(row.submission_id, own);
  }
  const rows = ((graded?.results ?? []) as {
    submission_id: number;
    student_id: number;
    full_name: string;
    total: number;
    max_total: number;
    grade: number;
    flag_count: number;
  }[])
    .map(
      (row): ReportRow => ({
        submissionId: row.submission_id,
        studentId: row.student_id,
        studentName: row.full_name,
        total: row.total,
        maxTotal: row.max_total,
        grade: row.grade,
        flagCount: row.flag_count,
        items: itemsBySubmission.get(row.submission_id) ?? [],
      }),
    )
    .sort((a, b) => compareStudentNames(a.studentName, b.studentName));
  const notGraded = ((missing?.results ?? []) as { student_id: number; full_name: string; status: UploadStatus | null }[])
    .map((row): ReportMissing => ({ studentId: row.student_id, studentName: row.full_name, status: row.status ?? 'none' }))
    .sort((a, b) => compareStudentNames(a.studentName, b.studentName));

  return {
    test: { code: head.code, title: head.title, className: head.class_name, status: head.status, startedAt: head.started_at },
    exercises: (list?.exercises ?? []).map(({ id, label, maxPoints }) => ({ id, label, maxPoints })),
    rows,
    missing: notGraded,
    analysis: {
      status: head.analysis_status,
      stale: head.analysis_stale === 1,
      content: head.analysis_json ? (JSON.parse(head.analysis_json) as ClassAnalysis) : null,
    },
  };
}
```

- [ ] **Step 8: Edit `server/routes/tests.ts`**

Find this block:

```ts
} from '../db/lifecycle.ts';
import { setResultsOpen } from '../db/results.ts';
```

Replace it with:

```ts
} from '../db/lifecycle.ts';
import { getClassReport } from '../db/report.ts';
import { setResultsOpen } from '../db/results.ts';
```

- [ ] **Step 9: Edit `server/routes/tests.ts`**

Find this block:

```ts

  // "Regenerează": the robot writes the class analysis again (spec §8.5).
```

Replace it with:

```ts

  // The rows of the class report (spec §14.2). The statistics are made in the
  // browser from these rows.
  routes.get('/:code/report', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const report = await getClassReport(c.env.DB, c.var.teacher.id, test.id);
    if (!report) throw notFound();
    return c.json({ report });
  });

  // "Regenerează": the robot writes the class analysis again (spec §8.5).
```

- [ ] **Step 10: Edit `src/admin/api.ts`**

Find this block:

```ts
  ClassDetail,
  ClassSummary,
```

Replace it with:

```ts
  ClassDetail,
  ClassReport,
  ClassSummary,
```

- [ ] **Step 11: Edit `src/admin/api.ts`**

Find this block:

```ts
  regenerateAnalysis(code: string): Promise<AnalysisAnswer>;
  // "Recorectează tot": graded and failed uploads wait for the robot again.
```

Replace it with:

```ts
  regenerateAnalysis(code: string): Promise<AnalysisAnswer>;
  // The rows of the class report.
  getReport(code: string): Promise<ClassReport>;
  // "Recorectează tot": graded and failed uploads wait for the robot again.
```

- [ ] **Step 12: Edit `src/admin/api.ts`**

Find this block:

```ts
    regenerateAnalysis: (code) => request<AnalysisAnswer>('POST', `${test(code)}/analysis/regenerate`),
    regradeTest: (code) => request<RegradeAnswer>('POST', `${test(code)}/regrade`),
```

Replace it with:

```ts
    regenerateAnalysis: (code) => request<AnalysisAnswer>('POST', `${test(code)}/analysis/regenerate`),
    getReport: async (code) => (await request<{ report: ClassReport }>('GET', `${test(code)}/report`)).report,
    regradeTest: (code) => request<RegradeAnswer>('POST', `${test(code)}/regrade`),
```

- [ ] **Step 13: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  BaremNotesAnswer,
  ClassSummary,
```

Replace it with:

```ts
  BaremNotesAnswer,
  ClassReport,
  ClassSummary,
```

- [ ] **Step 14: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  histories?: StudentHistory[];
}
```

Replace it with:

```ts
  histories?: StudentHistory[];
  // The class reports, by test code.
  reports?: Record<string, ClassReport>;
}
```

- [ ] **Step 15: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    }),
    getSubmission: vi.fn(async (submissionId: number) => structuredClone(findSubmission(submissionId))),
```

Replace it with:

```ts
    }),
    getReport: vi.fn(async (code: string) => {
      const report = data.reports?.[code];
      if (!report) throw notFound();
      return structuredClone(report);
    }),
    getSubmission: vi.fn(async (submissionId: number) => structuredClone(findSubmission(submissionId))),
```

- [ ] **Step 16: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  68 passed (68)`, `Tests  898 passed (898)`.

- [ ] **Step 17: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 18: Commit**

```bash
git add server shared src
git commit -m "Add the rows of the class report and its statistics"
```

---

### Task 6: The class report page, and the analysis on the test page

`/teste/:code/raport` shows the statistics, the table of results with the items to check marked, the statistics of each exercise, the students that have no result, and the analysis with its states and **Regenerează**. The test page links to it, says when the robot writes the analysis or failed, and "Pornește robotul" counts a waiting analysis as work.

**Files:**
- Create: `src/admin/pages/ReportPage.tsx`, `src/admin/reportPage/ReportTables.tsx`, `src/admin/reportPage/AnalysisSection.tsx`, `src/admin/testPage/AnalysisState.tsx`
- Modify: `src/admin/AppRoutes.tsx`, `src/admin/pages/TestPage.tsx`, `src/admin/testPage/StartRobotButton.tsx`, `src/ui/brand.css`, `server/AGENTS.md`, `docs/superpowers/specs/2026-10-06-quickeval-design.md`
- Test: `src/admin/pages/ReportPage.test.tsx` (new), `src/admin/pages/TestPage.test.tsx` (modified)

**Interfaces:**
- Consumes: `ClassReport`, `classStats`, `regenerateAnalysis`, `getReport` (Tasks 3 and 5); `uploadStatusLabel`, `pointsLevel`, `robotStartMessage`.
- Produces:
  - `ReportPage`, `reportRefreshInterval(report)` in `src/admin/pages/ReportPage.tsx` (10 s while the analysis is requested).
  - `StatsSummary`, `ResultsTable`, `ExerciseStatsTable`, `MissingList` in `ReportTables.tsx`; `AnalysisSection` in `AnalysisSection.tsx`; `AnalysisState` in `src/admin/testPage/AnalysisState.tsx`.
  - Route `teste/:code/raport`. The report tables use the class `report-table`, which keeps its columns on a phone: the table scrolls in its `.table-wrap`.
  - `waitsForRobot(test, uploads)` also true for a test in evaluation whose analysis is `requested` with a graded upload.

- [ ] **Step 1: Create `src/admin/pages/ReportPage.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ClassReport } from '../../../shared/api.ts';
import { createFakeApi, fakeTest } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

const ANALYSIS = {
  overview: 'Clasa a lucrat bine la fracții.',
  strengths: ['Fracții echivalente'],
  weaknesses: [],
  commonMistakes: ['Semnul la mutarea termenilor'],
  recommendations: ['Mai multe ecuații'],
};

function report(overrides: Partial<ClassReport> = {}): ClassReport {
  return {
    test: { code: '6E2-26T1', title: 'Fracții', className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
    exercises: [
      { id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 4.5 },
      { id: 'II.1', label: 'Subiectul II, exercițiul 1', maxPoints: 4.5 },
    ],
    rows: [
      {
        submissionId: 5,
        studentId: 10,
        studentName: 'Avram Dan',
        total: 10,
        maxTotal: 10,
        grade: 10,
        flagCount: 0,
        items: [
          { exerciseId: 'I.1', points: 4.5, maxPoints: 4.5, flagged: false },
          { exerciseId: 'II.1', points: 4.5, maxPoints: 4.5, flagged: false },
        ],
      },
      {
        submissionId: 6,
        studentId: 11,
        studentName: 'Pop Ion',
        total: 5.5,
        maxTotal: 10,
        grade: 5.5,
        flagCount: 2,
        items: [
          { exerciseId: 'I.1', points: 4.5, maxPoints: 4.5, flagged: false },
          { exerciseId: 'II.1', points: 0, maxPoints: 4.5, flagged: true },
        ],
      },
    ],
    missing: [{ studentId: 12, studentName: 'Stan Eva', status: 'none' }],
    analysis: { status: 'ready', stale: false, content: ANALYSIS },
    ...overrides,
  };
}

const apiWith = (value: ClassReport = report()) =>
  createFakeApi({
    classes: [],
    students: {},
    tests: [fakeTest({ status: 'done', gradedCount: 2 })],
    reports: { '6E2-26T1': value },
  });

describe('ReportPage', () => {
  it('shows the statistics, the table with the items to check marked, and who has no result', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    expect(await screen.findByRole('heading', { name: 'Raportul clasei' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← 6E2-26T1' })).toHaveAttribute('href', '/teste/6E2-26T1');
    expect(screen.getByText('Corectate 2 din 3 elevi · de verificat 2')).toBeInTheDocument();
    const stats = screen.getByRole('region', { name: 'Statistici' });
    expect(within(stats).getByText('Media').nextSibling).toHaveTextContent('7,75');
    expect(within(stats).getByText('Mediana').nextSibling).toHaveTextContent('7,75');
    expect(within(stats).getByText('Cea mai mică notă').nextSibling).toHaveTextContent('5,5');
    expect(within(stats).getByText('Cea mai mare notă').nextSibling).toHaveTextContent('10');

    const table = screen.getByRole('table', { name: 'Punctajele elevilor pe exerciții' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['Avram Dan', 'Pop Ion']);
    expect(within(rows[1]!).getByRole('link', { name: 'Pop Ion' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/6');
    const flagged = within(rows[1]!).getByText('(de verificat)').closest('td')!;
    expect(flagged).toHaveClass('flagged-cell');
    expect(within(rows[0]!).queryByText('(de verificat)')).not.toBeInTheDocument();
    expect(within(rows[1]!).getByText('5,5 / 10')).toBeInTheDocument();

    const missing = screen.getByRole('region', { name: 'Fără rezultat' });
    expect(within(missing).getByText('Stan Eva')).toBeInTheDocument();
    expect(within(missing).getByText('· Nu a trimis')).toBeInTheDocument();
  });

  it('shows the grade groups and the statistics of each exercise', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    const groups = await screen.findByRole('table', { name: 'Notele pe grupe' });
    const counts = within(groups)
      .getAllByRole('row')
      .slice(1)
      .map((row) => [within(row).getByRole('rowheader').textContent, within(row).getAllByRole('cell')[0]!.textContent]);
    expect(counts).toEqual([
      ['1-4,99', '0'],
      ['5-6,99', '1'],
      ['7-8,99', '0'],
      ['9-10', '1'],
    ]);
    const exercises = screen.getByRole('table', { name: 'Statistici pe exerciții' });
    const second = within(exercises).getAllByRole('row')[2]!;
    expect(within(second).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['2,25 din 4,5', '50%', '1', '0', '1']);
  });

  it('shows the analysis', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    expect(await screen.findByText('Clasa a lucrat bine la fracții.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ce a mers bine' })).toHaveTextContent('Fracții echivalente');
    expect(screen.getByRole('region', { name: 'Greșeli frecvente' })).toHaveTextContent('Semnul la mutarea termenilor');
    // An empty list has no heading.
    expect(screen.queryByRole('region', { name: 'Ce a mers mai greu' })).not.toBeInTheDocument();
    expect(screen.queryByText('Analiza poate fi depășită', { exact: false })).not.toBeInTheDocument();
  });

  it('says that an analysis may be out of date, and asks for a new one', async () => {
    const api = apiWith(report({ analysis: { status: 'ready', stale: true, content: ANALYSIS } }));
    renderAdmin('/teste/6E2-26T1/raport', api);
    expect(await screen.findByText('Analiza poate fi depășită', { exact: false })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Regenerează' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Regenerează' }));
    expect(api.regenerateAnalysis).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByText('Nu am putut porni robotul.', { exact: false })).toBeInTheDocument();
  });

  it('says when the robot writes the analysis, and when it could not', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith(report({ analysis: { status: 'requested', stale: false, content: null } })));
    expect(await screen.findByText('Robotul scrie analiza clasei.', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerează' })).not.toBeInTheDocument();
  });

  it('offers the first analysis of a test graded before analyses existed', async () => {
    const api = apiWith(report({ analysis: { status: 'none', stale: false, content: null } }));
    renderAdmin('/teste/6E2-26T1/raport', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Fă analiza clasei' }));
    expect(api.regenerateAnalysis).toHaveBeenCalledWith('6E2-26T1');
  });

  it('offers a new try after a failed analysis', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith(report({ analysis: { status: 'failed', stale: false, content: null } })));
    expect(await screen.findByText('Robotul nu a putut scrie analiza clasei.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerează' })).toBeInTheDocument();
  });

  it('keeps the table of a wide test in a scrolling box, one column for each exercise', async () => {
    const exercises = Array.from({ length: 40 }, (_, index) => ({ id: `E${index + 1}`, label: `Exercițiul ${index + 1}`, maxPoints: 1 }));
    const wide = report({
      exercises,
      rows: [
        {
          submissionId: 5,
          studentId: 10,
          studentName: 'Avram Dan',
          total: 40,
          maxTotal: 40,
          grade: 10,
          flagCount: 0,
          items: exercises.map((exercise) => ({ exerciseId: exercise.id, points: 1, maxPoints: 1, flagged: false })),
        },
      ],
      missing: [],
    });
    renderAdmin('/teste/6E2-26T1/raport', apiWith(wide));
    const table = await screen.findByRole('table', { name: 'Punctajele elevilor pe exerciții' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(43);
    expect(table.parentElement).toHaveClass('table-wrap');
  });

  it('says that nothing is graded yet, without tables', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith(report({ rows: [], analysis: { status: 'none', stale: false, content: null } })));
    expect(await screen.findByText('Nicio lucrare nu este corectată încă', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fă analiza clasei' })).not.toBeInTheDocument();
  });

  it('shows the not-found page for a bad code and an error for an unknown test', async () => {
    renderAdmin('/teste/nu-este-cod/raport', apiWith());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    ['a test with nothing left to grade', { status: 'evaluating' }, graded, null, false],
    ['a barem that waits for the teacher', { status: 'evaluating', exerciseList: problem }, uploads, null, false],
```

Replace it with:

```tsx
    ['a test with nothing left to grade', { status: 'evaluating' }, graded, null, false],
    ['a class analysis that waits', { status: 'evaluating', analysis: { status: 'requested', stale: false } }, graded, null, true],
    ['a barem that waits for the teacher', { status: 'evaluating', exerciseList: problem }, uploads, null, false],
```

- [ ] **Step 3: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(screen.queryByRole('button', { name: 'Pornește robotul' }) !== null).toBe(shown);
  });
```

Replace it with:

```tsx
    expect(screen.queryByRole('button', { name: 'Pornește robotul' }) !== null).toBe(shown);
  });

  it('says that the robot writes the class analysis, and links to the class report', async () => {
    renderAdmin('/teste/6E2-26T1', evaluationApi({ status: 'evaluating', analysis: { status: 'requested', stale: false } }, graded));
    expect(await screen.findByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Raportul clasei' })).toHaveAttribute('href', '/teste/6E2-26T1/raport');
  });

  it('shows the link to the class report only when something is graded', async () => {
    renderAdmin('/teste/6E2-26T1', evaluationApi({ status: 'evaluating' }, leftInGrading));
    expect(await screen.findByText(/^Robotul (nu )?a verificat/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Raportul clasei' })).not.toBeInTheDocument();
    expect(screen.queryByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).not.toBeInTheDocument();
  });

  it('says when the class analysis failed', async () => {
    renderAdmin('/teste/6E2-26T1', evaluationApi({ status: 'done', analysis: { status: 'failed', stale: false } }, graded));
    expect(await screen.findByText('Robotul nu a putut scrie analiza clasei.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Raportul clasei' })).toBeInTheDocument();
  });
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/ReportPage.test.tsx src/admin/pages/TestPage.test.tsx`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  12 failed | 59 passed (71)`. Failing tests: "offers to start the robot for a class analysis that waits"; "says that the robot writes the class analysis, and links to the class report"; "says when the class analysis failed"; "shows the statistics, the table with the items to check marked, and who has no result"; "shows the grade groups and the statistics of each exercise"; "shows the analysis"; "says that an analysis may be out of date, and asks for a new one"; "says when the robot writes the analysis, and when it could not" and 4 more. Errors such as: `AssertionError: expected false to be true // Object.is equality`. Tests of this task that do not fail yet are guards: they pass before and after.

- [ ] **Step 5: Create `src/admin/reportPage/ReportTables.tsx`**

```tsx
import { Link } from 'react-router';
import type { ClassReport } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import type { ClassStats } from '../../../shared/stats.ts';
import { pointsLevel, uploadStatusLabel } from '../../ui/format.ts';

const dash = '—';
const grade = (value: number | null) => (value === null ? dash : formatPoints(value));

// The numbers of the class (spec §14.2): who was graded, the average, the
// median, the lowest and the highest grade, and the groups of grades.
export function StatsSummary({ stats }: { stats: ClassStats }) {
  return (
    <section aria-label="Statistici">
      <h2>Statistici</h2>
      <p>
        Corectate {stats.gradedCount} din {stats.activeCount} elevi
        {stats.flaggedCount > 0 && ` · de verificat ${stats.flaggedCount}`}
      </p>
      <dl className="stats-grid">
        <div>
          <dt>Media</dt>
          <dd>{grade(stats.average)}</dd>
        </div>
        <div>
          <dt>Mediana</dt>
          <dd>{grade(stats.median)}</dd>
        </div>
        <div>
          <dt>Cea mai mică notă</dt>
          <dd>{grade(stats.min)}</dd>
        </div>
        <div>
          <dt>Cea mai mare notă</dt>
          <dd>{grade(stats.max)}</dd>
        </div>
      </dl>
      <div className="table-wrap">
        <table className="report-table">
          <caption className="sr-only">Notele pe grupe</caption>
          <thead>
            <tr>
              <th scope="col">Nota</th>
              <th scope="col">Elevi</th>
            </tr>
          </thead>
          <tbody>
            {stats.groups.map((group) => (
              <tr key={group.label}>
                <th scope="row">{group.label}</th>
                <td>{group.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// One row for each graded student, one column for each exercise, then the
// total and the grade. An item that waits for the teacher's check is marked.
export function ResultsTable({ code, report }: { code: string; report: ClassReport }) {
  return (
    <div className="table-wrap">
      <table className="report-table">
        <caption className="sr-only">Punctajele elevilor pe exerciții</caption>
        <thead>
          <tr>
            <th scope="col">Elev</th>
            {report.exercises.map((exercise) => (
              <th key={exercise.id} scope="col" title={`${exercise.label}, ${formatPoints(exercise.maxPoints)} puncte`}>
                {exercise.id}
              </th>
            ))}
            <th scope="col">Total</th>
            <th scope="col">Nota</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <tr key={row.submissionId}>
              <th scope="row">
                <Link to={`/teste/${code}/elevi/${row.submissionId}`}>{row.studentName}</Link>
              </th>
              {report.exercises.map((exercise) => {
                const item = row.items.find((candidate) => candidate.exerciseId === exercise.id);
                if (!item) return <td key={exercise.id}>{dash}</td>;
                return (
                  <td key={exercise.id} className={item.flagged ? 'flagged-cell' : undefined}>
                    <span className={`points points-${pointsLevel(item.points, item.maxPoints)}`}>{formatPoints(item.points)}</span>
                    {item.flagged && <span className="sr-only"> (de verificat)</span>}
                  </td>
                );
              })}
              <td>
                {formatPoints(row.total)} / {formatPoints(row.maxTotal)}
              </td>
              <td>
                <strong>{formatPoints(row.grade)}</strong>
                {row.flagCount > 0 && <span className="tag">de verificat {row.flagCount}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Average points and how many students got all, some, and none of the points.
export function ExerciseStatsTable({ stats }: { stats: ClassStats }) {
  return (
    <div className="table-wrap">
      <table className="report-table">
        <caption className="sr-only">Statistici pe exerciții</caption>
        <thead>
          <tr>
            <th scope="col">Exercițiul</th>
            <th scope="col">Media</th>
            <th scope="col">% din maxim</th>
            <th scope="col">Tot</th>
            <th scope="col">Parțial</th>
            <th scope="col">Nimic</th>
          </tr>
        </thead>
        <tbody>
          {stats.perExercise.map((exercise) => (
            <tr key={exercise.exerciseId}>
              <th scope="row" title={exercise.label}>
                {exercise.exerciseId}
                <span className="sr-only"> {exercise.label}</span>
              </th>
              <td>
                {exercise.averagePoints === null ? dash : `${formatPoints(exercise.averagePoints)} din ${formatPoints(exercise.maxPoints)}`}
              </td>
              <td>{exercise.averagePercent === null ? dash : `${exercise.averagePercent}%`}</td>
              <td>{exercise.full}</td>
              <td>{exercise.partial}</td>
              <td>{exercise.zero}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The active students that have no graded result, and why.
export function MissingList({ missing }: { missing: ClassReport['missing'] }) {
  if (missing.length === 0) return null;
  return (
    <section aria-label="Fără rezultat">
      <h2>Fără rezultat</h2>
      <ul>
        {missing.map((student) => (
          <li key={student.studentId}>
            {student.studentName} <span className="hint">· {uploadStatusLabel(student.status)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 6: Create `src/admin/reportPage/AnalysisSection.tsx`**

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ClassReport, RobotStart } from '../../../shared/api.ts';
import type { ClassAnalysis } from '../../../shared/schemas.ts';
import { robotStartMessage } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

const SECTIONS: { key: keyof Omit<ClassAnalysis, 'overview'>; title: string }[] = [
  { key: 'strengths', title: 'Ce a mers bine' },
  { key: 'weaknesses', title: 'Ce a mers mai greu' },
  { key: 'commonMistakes', title: 'Greșeli frecvente' },
  { key: 'recommendations', title: 'Ce exersați în continuare' },
];

// The analysis of the class (spec §14.2): written by the robot after the
// grading. Out of date after corrections; the teacher asks for a new one.
export function AnalysisSection({ code, report }: { code: string; report: ClassReport }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [robot, setRobot] = useState<RobotStart | null>(null);
  const regenerate = useMutation({
    mutationFn: () => api.regenerateAnalysis(code),
    onSuccess: async (answer) => {
      setRobot(answer.robot);
      await queryClient.invalidateQueries({ queryKey: ['report', code] });
      await queryClient.invalidateQueries({ queryKey: ['test', code] });
      await queryClient.invalidateQueries({ queryKey: ['tests'] });
    },
  });
  if (report.rows.length === 0) return null;
  const { status, stale, content } = report.analysis;

  const button = (label: string) => (
    <button type="button" className="button-quiet button-small" disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
      {label}
    </button>
  );

  return (
    <section aria-label="Analiza clasei">
      <h2>Analiza clasei</h2>
      {status === 'requested' && <p role="status">Robotul scrie analiza clasei. Pagina se reînnoiește singură.</p>}
      {status === 'none' && (
        <>
          <p className="hint">Analiza clasei nu a fost făcută încă.</p>
          {button('Fă analiza clasei')}
        </>
      )}
      {status === 'failed' && (
        <div className="warning">
          <p>
            <strong>Robotul nu a putut scrie analiza clasei.</strong>
          </p>
          {button('Regenerează')}
        </div>
      )}
      {status === 'ready' && content && (
        <>
          {stale && (
            <div className="warning" role="status">
              <p>Analiza poate fi depășită: notele s-au schimbat după ce a fost scrisă.</p>
              {button('Regenerează')}
            </div>
          )}
          <p>{content.overview}</p>
          {SECTIONS.map(({ key, title }) =>
            content[key].length > 0 ? (
              <section key={key} aria-label={title}>
                <h3>{title}</h3>
                <ul>
                  {content[key].map((text, index) => (
                    <li key={index}>{text}</li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
          {!stale && button('Regenerează')}
        </>
      )}
      {robot && <p role="status">{robotStartMessage(robot)}</p>}
      {regenerate.error && <ErrorMessage error={regenerate.error} />}
    </section>
  );
}
```

- [ ] **Step 7: Create `src/admin/pages/ReportPage.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import type { ClassReport } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { classStats } from '../../../shared/stats.ts';
import { normalizeTestCode } from '../../../shared/tests.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { AnalysisSection } from '../reportPage/AnalysisSection.tsx';
import { ExerciseStatsTable, MissingList, ResultsTable, StatsSummary } from '../reportPage/ReportTables.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

// While the robot writes the analysis, the page asks for news every 10 seconds.
export function reportRefreshInterval(report: ClassReport | undefined): number | false {
  return report?.analysis.status === 'requested' ? 10_000 : false;
}

// /teste/:code/raport: the class report (spec §14.2): the table of the graded
// students, the statistics, and the analysis of the class.
export function ReportPage() {
  const code = normalizeTestCode(useParams().code ?? '');
  if (code === null) return <NotFoundPage />;
  return <ReportView key={code} code={code} />;
}

function ReportView({ code }: { code: string }) {
  const api = useApi();
  const query = useQuery({
    queryKey: ['report', code],
    queryFn: () => api.getReport(code),
    refetchInterval: (state) => reportRefreshInterval(state.state.data),
  });

  if (query.isPending) return <p>Se încarcă…</p>;
  if (query.data === undefined) return <ErrorMessage error={query.error} />;
  const report = query.data;
  const stats = classStats(report);

  return (
    <section>
      <p className="back-link">
        <Link to={`/teste/${code}`}>← {code}</Link>
      </p>
      {query.isRefetchError && <ErrorMessage error={query.error} />}
      <h1>Raportul clasei</h1>
      <p className="lead-line">
        {report.test.code} · {report.test.title} · {displayClassName(report.test.className)}
      </p>

      {report.rows.length === 0 ? (
        <p className="hint">Nicio lucrare nu este corectată încă. Raportul apare după prima corectare.</p>
      ) : (
        <>
          <StatsSummary stats={stats} />
          <h2>Rezultatele elevilor</h2>
          <ResultsTable code={code} report={report} />
          <h2>Pe exerciții</h2>
          <ExerciseStatsTable stats={stats} />
        </>
      )}
      <MissingList missing={report.missing} />
      <AnalysisSection code={code} report={report} />
    </section>
  );
}
```

- [ ] **Step 8: Create `src/admin/testPage/AnalysisState.tsx`**

```tsx
import { Link } from 'react-router';
import type { TestInfo } from '../../../shared/api.ts';

// The class analysis on the test page (spec §9): the robot writes it after the
// grading, so a test can wait in "Se corectează" with every upload graded. The
// link to the class report shows as soon as one upload is graded.
export function AnalysisState({ test }: { test: TestInfo }) {
  const { status } = test.analysis;
  const waiting = test.status === 'evaluating' && status === 'requested';
  return (
    <>
      {waiting && test.gradedCount > 0 && (
        <p role="status">Lucrările sunt corectate. Robotul scrie acum analiza clasei.</p>
      )}
      {status === 'failed' && test.gradedCount > 0 && (
        <div className="warning">
          <p>
            <strong>Robotul nu a putut scrie analiza clasei.</strong> O poți cere din nou în raportul clasei.
          </p>
        </div>
      )}
      {test.gradedCount > 0 && (
        <p>
          <Link to={`/teste/${test.code}/raport`}>Raportul clasei</Link>
        </p>
      )}
    </>
  );
}
```

- [ ] **Step 9: Edit `src/admin/AppRoutes.tsx`**

Find this block:

```tsx
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
```

Replace it with:

```tsx
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { ReportPage } from './pages/ReportPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
```

- [ ] **Step 10: Edit `src/admin/AppRoutes.tsx`**

Find this block:

```tsx
        <Route path="teste/:code/elevi/:submissionId" element={<SubmissionPage />} />
        <Route path="clase" element={<ClassesPage />} />
```

Replace it with:

```tsx
        <Route path="teste/:code/elevi/:submissionId" element={<SubmissionPage />} />
        <Route path="teste/:code/raport" element={<ReportPage />} />
        <Route path="clase" element={<ClassesPage />} />
```

- [ ] **Step 11: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx
import { EvaluationControls } from '../testPage/EvaluationControls.tsx';
import { ExerciseListBanner } from '../testPage/ExerciseListBanner.tsx';
```

Replace it with:

```tsx
import { EvaluationControls } from '../testPage/EvaluationControls.tsx';
import { AnalysisState } from '../testPage/AnalysisState.tsx';
import { ExerciseListBanner } from '../testPage/ExerciseListBanner.tsx';
```

- [ ] **Step 12: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx
          <RegradeAllButton code={code} testStatus={test.status} uploads={uploads} onChanged={refresh} onRobot={onRobot} />
        </>
```

Replace it with:

```tsx
          <RegradeAllButton code={code} testStatus={test.status} uploads={uploads} onChanged={refresh} onRobot={onRobot} />
          <AnalysisState test={test} />
        </>
```

- [ ] **Step 13: Edit `src/admin/testPage/StartRobotButton.tsx`**

Find this block:

```tsx
// Work waits for the robot: the test is in evaluation, its exercise list does
// not wait for the teacher, and an upload waits or was left in grading.
export function waitsForRobot(test: TestInfo, uploads: UploadRow[]): boolean {
```

Replace it with:

```tsx
// Work waits for the robot: the test is in evaluation, its exercise list does
// not wait for the teacher, and an upload waits or was left in grading, or
// every upload is graded and the class analysis waits.
export function waitsForRobot(test: TestInfo, uploads: UploadRow[]): boolean {
```

- [ ] **Step 14: Edit `src/admin/testPage/StartRobotButton.tsx`**

Find this block:

```tsx
  if (test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed') return false;
  return uploads.some((row) => row.status === 'submitted' || row.status === 'grading');
}
```

Replace it with:

```tsx
  if (test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed') return false;
  if (uploads.some((row) => row.status === 'submitted' || row.status === 'grading')) return true;
  return test.analysis.status === 'requested' && test.gradedCount > 0;
}
```

- [ ] **Step 15: Edit `src/ui/brand.css`**

Find this block:

```css
  margin-bottom: 0;
}
```

Replace it with:

```css
  margin-bottom: 0;
}

/* The class report (spec §14.2) */

.stats-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  margin: 0.5rem 0 1rem;
}

.stats-grid > div {
  min-width: 7rem;
}

.stats-grid dt {
  color: var(--muted);
  font-size: 0.9rem;
}

.stats-grid dd {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

/* The report tables keep their columns on a phone: the table scrolls inside
   its box, and the student's name stays in view. */
table.report-table {
  min-width: 20rem;
  border-collapse: collapse;
  background: var(--sheet);
}

table.report-table th,
table.report-table td {
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid var(--rule);
  text-align: left;
  vertical-align: middle;
}

table.report-table thead th {
  color: var(--muted);
  font-size: 0.9rem;
}

table.report-table tbody th {
  font-weight: 700;
}

table.report-table th:first-child {
  position: sticky;
  left: 0;
  background: var(--sheet);
}

table.report-table td.flagged-cell {
  background: var(--marker);
}
```

- [ ] **Step 16: Edit `server/AGENTS.md`**

Find this block:

```markdown
- The teacher's corrections and Regrade check in their SQL that the upload is graded and the test is the teacher's: a regrade can delete a result at any time. A correction and the check of unreadable pages name the result the page shows: the upload in the path, and the grading time `gradedAt` (`evaluations.created_at`) in the body. Their writes check both (`SHOWN` in `db/evaluations.ts`): ids of deleted rows come back (no `AUTOINCREMENT`), so an id from an old page can name another student's upload or item. Regrade of one upload names `gradedAt` too (`regradeSubmission` in `db/lifecycle.ts`). Every action on one upload that does not name a grading names the upload by the time it started instead: Reset, Retry, publishing or taking back a result page, and the result link send `startedAt` (`submissions.started_at`, written once, so it never changes during one upload's life and differs between two uploads that reused an id). The write checks it in its SQL (`ShownUpload` in `db/submissions.ts`); a route first calls `requireShown`, which answers 404 for an unknown upload and 409 `upload_changed` for another one. A correction sums the total again from all items, so two corrections at once leave the right total. The grade comes from `gradeSql`, which a test compares with `gradeOf` for every amount in cents.
- The database is the truth: R2 keys come from rows, never from listing R2.
```

Replace it with:

```markdown
- The teacher's corrections and Regrade check in their SQL that the upload is graded and the test is the teacher's: a regrade can delete a result at any time. A correction and the check of unreadable pages name the result the page shows: the upload in the path, and the grading time `gradedAt` (`evaluations.created_at`) in the body. Their writes check both (`SHOWN` in `db/evaluations.ts`): ids of deleted rows come back (no `AUTOINCREMENT`), so an id from an old page can name another student's upload or item. Regrade of one upload names `gradedAt` too (`regradeSubmission` in `db/lifecycle.ts`). Every action on one upload that does not name a grading names the upload by the time it started instead: Reset, Retry, publishing or taking back a result page, and the result link send `startedAt` (`submissions.started_at`, written once, so it never changes during one upload's life and differs between two uploads that reused an id). The write checks it in its SQL (`ShownUpload` in `db/submissions.ts`); a route first calls `requireShown`, which answers 404 for an unknown upload and 409 `upload_changed` for another one. A correction sums the total again from all items, so two corrections at once leave the right total. The grade comes from `gradeSql`, which a test compares with `gradeOf` for every amount in cents.
- The class analysis follows the same rules (`db/runner.ts`: `saveAnalysis`, `failAnalysis`). The robot reads the grades with a `version` (`gradesVersionSql`: the number of graded results and the time of the last change) and sends it back; the save computes the version again in its SQL, so an analysis made from grades that a correction changed meanwhile is saved with `analysis_stale = 1`. It is saved only while no upload waits for grading. Every path that makes work for the robot must start it (the schedule does not fire): "Regenerează" does, and `finishTests` waits for a requested analysis only when a graded upload exists.
- The database is the truth: R2 keys come from rows, never from listing R2.
```

- [ ] **Step 17: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
- Robot line: "Robotul a verificat acum 3 min" from `runner_state.last_check_at`, while the test is evaluating or has a scheduled evaluation. It shows a warning after 30 min without a check. With the warning, a test in evaluation whose uploads wait for the robot shows "Pornește robotul": it starts the robot like "Evaluate now".
- Link to the class report when at least one submission is graded.
```

Replace it with:

```markdown
- Robot line: "Robotul a verificat acum 3 min" from `runner_state.last_check_at`, while the test is evaluating or has a scheduled evaluation. It shows a warning after 30 min without a check. With the warning, a test in evaluation whose uploads wait for the robot shows "Pornește robotul": it starts the robot like "Evaluate now".
- Class analysis, in the evaluation block: while the test is `evaluating` with the analysis `requested` and a graded upload, the page says that the robot writes it, and "Pornește robotul" counts it as work (the GitHub schedule does not fire, so a waiting analysis must be startable). A `failed` analysis shows a warning that points to the report.
- Link to the class report when at least one submission is graded.
```

- [ ] **Step 18: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
- AI analysis: overview, strengths, weaknesses, common mistakes, recommendations. When `analysis_stale = 1`, the page shows "Analiza poate fi depășită" and a **Regenerează** button.
- Buttons: **Descarcă PDF** (landscape: table, statistics, analysis), **Descarcă CSV**, **Trimite** (the PDF).
```

Replace it with:

```markdown
- AI analysis: overview, strengths, weaknesses, common mistakes, recommendations. When `analysis_stale = 1`, the page shows "Analiza poate fi depășită" and a **Regenerează** button.
- The table keeps one column for each exercise and scrolls inside its box, with the student's name in view. A flagged cell has the highlighter background and a screen-reader note. Each name links to the student's result page.
- The analysis block shows the four lists, or its state: not made yet (**Fă analiza clasei**), being written (the page refreshes every 10 s), failed, or out of date (**Regenerează**).
- Buttons: **Descarcă PDF** (landscape: table, statistics, analysis), **Descarcă CSV**, **Trimite** (the PDF).
```

- [ ] **Step 19: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  69 passed (69)`, `Tests  912 passed (912)`.

- [ ] **Step 20: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 21: Commit**

```bash
git add src server docs
git commit -m "Add the class report page, and show the class analysis on the test page"
```

---

### Task 7: The PDFs

Two PDF builders, as pure functions of narrow inputs: the student's result and the class report. pdfmake makes them in the browser, loaded only when a PDF is asked for. The first step adds the two dependencies; no other task does.

**Files:**
- Create: `src/admin/pdf/fileName.ts`, `src/admin/pdf/studentPdf.ts`, `src/admin/pdf/classPdf.ts`, `src/admin/pdf/renderPdf.ts`
- Modify: `package.json`, `package-lock.json`, `src/ui/format.ts`
- Test: `src/admin/pdf/pdf.test.ts` (new)

**Interfaces:**
- Consumes: `SubmissionDetail`, `ClassReport`, `classStats`, `formatPoints`, `uploadStatusLabel`, `fakeItem`, `expectNoGradingWords`.
- Produces:
  - `formatDate(iso)` in `src/ui/format.ts` ("6 octombrie 2026").
  - `pdfFileName(...parts)` in `fileName.ts` (diacritics dropped, `.pdf`).
  - `StudentPdfInput`, `studentPdfInput(submission): StudentPdfInput | null`, `studentPdf(input): TDocumentDefinitions`, `studentPdfFileName(input)` in `studentPdf.ts`.
  - `BLOCK` (12), `classPdf(report): TDocumentDefinitions`, `classPdfFileName(report)` in `classPdf.ts`.
  - `renderPdf(definition): Promise<Blob>` in `renderPdf.ts`.

- [ ] **Step 1: Add the dependencies**

Edit `package.json` as the next two steps show, then take the lock file of the prototype, and install from it. This is the only task that touches `package.json`.

- [ ] **Step 2: Edit `package.json`**

Find this block:

```json
    "hono": "^4.13.13",
    "qrcode.react": "^4.2.0",
```

Replace it with:

```json
    "hono": "^4.13.13",
    "pdfmake": "^0.3.11",
    "qrcode.react": "^4.2.0",
```

- [ ] **Step 3: Edit `package.json`**

Find this block:

```json
    "@types/node": "^24.19.1",
    "@types/react": "^19.3.0",
```

Replace it with:

```json
    "@types/node": "^24.19.1",
    "@types/pdfmake": "^0.3.3",
    "@types/react": "^19.3.0",
```

- [ ] **Step 4: Take the lock file and install**

Run: `git checkout refs/proto4b/b7 -- package-lock.json`, then `npm ci`, then `npm approve-scripts workerd esbuild` only if npm asks for it.
Expected: `npm ci` ends without errors, and `node -e "console.log(require('pdfmake/package.json').version)"` prints `0.3.11`.

- [ ] **Step 5: Create `src/admin/pdf/pdf.test.ts`**

```ts
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { ClassReport, SubmissionDetail } from '../../../shared/api.ts';
import { expectNoGradingWords } from '../../test/gradingWords.ts';
import { fakeItem } from '../../test/fakeApi.ts';
import { BLOCK, classPdf, classPdfFileName } from './classPdf.ts';
import { pdfFileName } from './fileName.ts';
import { renderPdf } from './renderPdf.ts';
import { studentPdf, studentPdfFileName, studentPdfInput } from './studentPdf.ts';

// The texts of a document definition, in order: the keys that hold text, not
// the names of fonts or layouts.
function textsOf(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(textsOf);
  if (node && typeof node === 'object') {
    const object = node as Record<string, unknown>;
    const body = (object.table as { body?: unknown } | undefined)?.body;
    return [...['text', 'ul', 'ol', 'columns', 'stack'].flatMap((key) => textsOf(object[key])), ...textsOf(body)];
  }
  return [];
}

// The code points that the font of pdfmake draws, from its cmap (formats 4 and 12).
function glyphChecker(): (codePoint: number) => boolean {
  const require = createRequire(import.meta.url);
  const vfs = require('pdfmake/build/vfs_fonts.js') as Record<string, string>;
  const view = new DataView(Uint8Array.from(Buffer.from(vfs['Roboto-Regular.ttf']!, 'base64')).buffer);
  const tables = view.getUint16(4);
  let cmapAt = -1;
  for (let index = 0; index < tables; index++) {
    const entry = 12 + index * 16;
    const tag = String.fromCharCode(...[0, 1, 2, 3].map((offset) => view.getUint8(entry + offset)));
    if (tag === 'cmap') cmapAt = view.getUint32(entry + 8);
  }
  const subtables = view.getUint16(cmapAt + 2);
  const covered: ((codePoint: number) => boolean)[] = [];
  for (let index = 0; index < subtables; index++) {
    const at = cmapAt + view.getUint32(cmapAt + 4 + index * 8 + 4);
    const format = view.getUint16(at);
    if (format === 4) {
      const segments = view.getUint16(at + 6) / 2;
      const ends = at + 14;
      const starts = ends + segments * 2 + 2;
      covered.push((codePoint) => {
        for (let segment = 0; segment < segments; segment++) {
          if (codePoint <= view.getUint16(ends + segment * 2)) return codePoint >= view.getUint16(starts + segment * 2);
        }
        return false;
      });
    } else if (format === 12) {
      const groups = view.getUint32(at + 12);
      covered.push((codePoint) => {
        for (let group = 0; group < groups; group++) {
          const entry = at + 16 + group * 12;
          if (codePoint >= view.getUint32(entry) && codePoint <= view.getUint32(entry + 4)) return true;
        }
        return false;
      });
    }
  }
  return (codePoint) => covered.some((has) => has(codePoint));
}

const ROMANIAN = 'ăâîșțĂÂÎȘȚşţŞŢ';

function submission(overrides: Partial<SubmissionDetail> = {}): SubmissionDetail {
  return {
    id: 5,
    testCode: '6E2-26T1',
    testTitle: 'Fracții și ecuații',
    testStatus: 'done',
    studentId: 10,
    studentName: 'Ștefănescu Țicu-Ioana',
    status: 'graded',
    autoSubmitted: false,
    startedAt: '2026-10-06T07:15:00.000Z',
    submittedAt: '2026-10-06T07:40:00.000Z',
    lastError: null,
    files: [],
    resultToken: null,
    resultsOpen: false,
    evaluation: {
      gradedAt: '2026-10-07T09:00:00.000Z',
      maxTotal: 10,
      officePoints: 1,
      total: 7.5,
      grade: 7.5,
      summary: `Ai lucrat bine. ${ROMANIAN}`,
      strengths: ['Fracții echivalente'],
      recommendations: ['Exersează ecuațiile: x² ≤ 4, √9 = 3, ½.'],
      unreadable: [],
      pagesReviewed: false,
      flagCount: 1,
      items: [
        fakeItem({ id: 1, exerciseId: 'I.1', points: 4.5, comment: 'Corect.' }),
        fakeItem({
          id: 2,
          exerciseId: 'II.1',
          points: 2,
          comment: 'Verifică semnul.',
          needsReview: true,
          reviewReason: 'Scrisul de mână nu se citește la pasul 2',
          confidence: 'very_low',
        }),
      ],
    },
    ...overrides,
  };
}

describe('studentPdf', () => {
  it('has no input for an upload that is not graded', () => {
    expect(studentPdfInput(submission({ status: 'submitted', evaluation: null }))).toBeNull();
  });

  it('shows the grade, the exercises, and "în verificare" for an item that waits for a check', () => {
    const input = studentPdfInput(submission())!;
    const texts = textsOf(studentPdf(input).content);
    expect(texts).toContain('Ștefănescu Țicu-Ioana');
    expect(texts).toContain('Nota 7,5');
    expect(texts).toContain('4,5 din 4,5');
    expect(texts).toContain('în verificare');
    expect(texts.join(' ')).toContain('încă în verificare, deci nota se poate schimba');
    expect(texts.join(' ')).toContain('6 octombrie 2026');
  });

  it('shows the points of an item that the teacher checked, and no note about checks', () => {
    const checked = submission();
    checked.evaluation!.items[1] = { ...checked.evaluation!.items[1]!, reviewed: true };
    const texts = textsOf(studentPdf(studentPdfInput(checked)!).content);
    expect(texts).toContain('2 din 4,5');
    expect(texts).not.toContain('în verificare');
    expect(texts.join(' ')).not.toContain('se poate schimba');
  });

  it('never carries the reasons to check an item, the confidence, or a word about how the work was graded', () => {
    const definition = studentPdf(studentPdfInput(submission())!);
    const everything = JSON.stringify(definition);
    expect(everything).not.toContain('Scrisul de mână');
    expect(everything).not.toMatch(/very_low|confidence|reviewReason|needsReview/);
    expectNoGradingWords(textsOf(definition).join('\n'));
  });

  it('draws every Romanian letter with the font it embeds', () => {
    const has = glyphChecker();
    const definition = studentPdf(studentPdfInput(submission())!);
    const missing = [...new Set(textsOf(definition).join('').replace(/\s/g, ''))].filter((char) => !has(char.codePointAt(0)!));
    expect(missing).toEqual([]);
    for (const char of ROMANIAN + '„”–—·≤√½²') expect(has(char.codePointAt(0)!)).toBe(true);
  });

  it('makes a PDF file from the definition, with the Romanian text in it', async () => {
    const blob = await renderPdf(studentPdf(studentPdfInput(submission())!));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(blob.type).toBe('application/pdf');
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5_000);
  });

  it('names the file after the test and the student, without diacritics', () => {
    expect(studentPdfFileName(studentPdfInput(submission())!)).toBe('6E2-26T1-Stefanescu-Ticu-Ioana.pdf');
    expect(pdfFileName('6E2-26T1', 'Șșțţ ăîâ')).toBe('6E2-26T1-Sstt-aia.pdf');
    expect(pdfFileName('   ', '???')).toBe('raport.pdf');
  });
});

function report(exerciseCount: number): ClassReport {
  const exercises = Array.from({ length: exerciseCount }, (_, index) => ({ id: `E${index + 1}`, label: `Exercițiul ${index + 1}`, maxPoints: 1 }));
  const items = (flaggedAt: number) =>
    exercises.map((exercise, index) => ({ exerciseId: exercise.id, points: index % 2 === 0 ? 1 : 0.5, maxPoints: 1, flagged: index === flaggedAt }));
  return {
    test: { code: '6E2-26T1', title: 'Fracții și ecuații', className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
    exercises,
    rows: [
      { submissionId: 5, studentId: 10, studentName: 'Ștefănescu Țicu', total: 12, maxTotal: exerciseCount, grade: 8, flagCount: 1, items: items(1) },
      { submissionId: 6, studentId: 11, studentName: 'Avram Dan', total: 10, maxTotal: exerciseCount, grade: 7, flagCount: 0, items: items(-1) },
    ],
    missing: [{ studentId: 12, studentName: 'Stan Eva', status: 'none' }],
    analysis: {
      status: 'ready',
      stale: true,
      content: { overview: `Clasa a lucrat bine. ${ROMANIAN}`, strengths: ['Fracții'], weaknesses: [], commonMistakes: ['Semnul'], recommendations: ['Exersați'] },
    },
  };
}

describe('classPdf', () => {
  it('is landscape, with the statistics, the table, the missing students, and the analysis', () => {
    const definition = classPdf(report(5));
    expect(definition.pageOrientation).toBe('landscape');
    const text = textsOf(definition.content).join('\n');
    expect(text).toContain('Raportul clasei · 6E2-26T1');
    expect(text).toContain('Corectate 2 din 3 elevi · de verificat 1');
    expect(text).toContain('Media 7,5');
    expect(text).toContain('Stan Eva · Nu a trimis');
    expect(text).toContain('Analiza poate fi depășită');
    expect(text).toContain('Clasa a lucrat bine.');
    expect(text).toContain('Fundalul galben');
    expect(classPdfFileName(report(5))).toBe('6E2-26T1-raport.pdf');
  });

  it('splits 60 exercises in blocks that repeat the student, with the total in the last one', () => {
    const definition = classPdf(report(60));
    const tables = (definition.content as { table?: { body: unknown[][]; widths: unknown[] } }[]).filter(
      (node) => node.table && node.table.body[0]![0] && (node.table.body[0]![0] as { text: string }).text === 'Elev',
    );
    expect(tables).toHaveLength(Math.ceil(60 / BLOCK));
    for (const table of tables) {
      // The student, the exercises of the block, and the last block's total and grade.
      expect(table.table!.body[0]!.length).toBeLessThanOrEqual(BLOCK + 3);
      expect(table.table!.body).toHaveLength(3);
    }
    const last = tables.at(-1)!.table!.body[0]!.map((cell) => (cell as { text: string }).text);
    expect(last.slice(-2)).toEqual(['Total', 'Nota']);
    const first = tables[0]!.table!.body[0]!.map((cell) => (cell as { text: string }).text);
    expect(first).not.toContain('Total');
  });

  it('marks the item to check with a background, and no other cell', () => {
    const definition = classPdf(report(3));
    const table = (definition.content as { table?: { body: { fillColor?: string; text?: string }[][] } }[]).find((node) => node.table?.body[0]?.[0]?.text === 'Elev')!;
    const [pop, avram] = [table.table!.body[1]!, table.table!.body[2]!];
    expect(pop.filter((cell) => cell.fillColor).length).toBe(1);
    expect(avram.filter((cell) => cell.fillColor).length).toBe(0);
  });

  it('draws every letter with the font it embeds, and renders as a PDF for a class of 60 exercises', async () => {
    const has = glyphChecker();
    const definition = classPdf(report(60));
    const missing = [...new Set(textsOf(definition.content).join('').replace(/\s/g, ''))].filter((char) => !has(char.codePointAt(0)!));
    expect(missing).toEqual([]);
    const blob = await renderPdf(definition);
    expect(new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5))).toBe('%PDF-');
  });

  it('is a document of its own when nothing is graded', () => {
    const empty = { ...report(2), rows: [], analysis: { status: 'none' as const, stale: false, content: null } };
    const text = textsOf(classPdf(empty).content).join('\n');
    expect(text).toContain('Corectate 0 din 1 elevi');
    expect(text).not.toContain('Analiza clasei');
  });
});
```

- [ ] **Step 6: Run the test to see it fail**

Run: `npx vitest run src/admin/pdf/pdf.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, no tests run: `src/admin/pdf/pdf.test.ts` cannot load, because `./fileName.ts`, `./studentPdf.ts`, `./classPdf.ts`, and `./renderPdf.ts` do not exist yet (`Failed to resolve import "./fileName.ts" from "src/admin/pdf/pdf.test.ts"`).

- [ ] **Step 7: Edit `src/ui/format.ts`**

Find this block:

```ts
  return DATE_TIME.format(new Date(iso));
}
```

Replace it with:

```ts
  return DATE_TIME.format(new Date(iso));
}

const DATE = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'long', year: 'numeric' });

// A day in Romania's local time: "6 octombrie 2026".
export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}
```

- [ ] **Step 8: Create `src/admin/pdf/fileName.ts`**

```ts
// The name of a downloaded file: letters and digits of the parts, joined by
// "-". Diacritics are dropped (ș becomes s), so the name opens anywhere.
export function pdfFileName(...parts: string[]): string {
  const clean = parts
    .map((part) =>
      part
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter((part) => part !== '');
  return `${clean.join('-') || 'raport'}.pdf`;
}
```

- [ ] **Step 9: Create `src/admin/pdf/studentPdf.ts`**

```ts
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatDate } from '../../ui/format.ts';
import { pdfFileName } from './fileName.ts';

// The student's PDF (spec §14.1): test code and title, the student's name,
// the date, the grade, the table of exercises, the summary, what went well,
// and the recommendations. It is made from this narrow input on purpose: the
// robot's confidence and the reasons to check an item never reach it, and no
// text of it tells how the work was graded.

export interface StudentPdfItem {
  exerciseId: string;
  label: string;
  maxPoints: number;
  points: number;
  studentAnswer: string;
  comment: string;
  // The item waits for the teacher's check: its points show as "în verificare".
  pending: boolean;
}

export interface StudentPdfInput {
  testCode: string;
  testTitle: string;
  studentName: string;
  // When the student sent the upload.
  date: string | null;
  grade: number;
  total: number;
  maxTotal: number;
  officePoints: number;
  summary: string;
  strengths: string[];
  recommendations: string[];
  items: StudentPdfItem[];
}

// Null while the upload has no graded result.
export function studentPdfInput(submission: SubmissionDetail): StudentPdfInput | null {
  const evaluation = submission.evaluation;
  if (!evaluation || submission.status !== 'graded') return null;
  return {
    testCode: submission.testCode,
    testTitle: submission.testTitle,
    studentName: submission.studentName,
    date: submission.submittedAt ?? submission.startedAt,
    grade: evaluation.grade,
    total: evaluation.total,
    maxTotal: evaluation.maxTotal,
    officePoints: evaluation.officePoints,
    summary: evaluation.summary,
    strengths: evaluation.strengths,
    recommendations: evaluation.recommendations,
    items: evaluation.items.map((item) => ({
      exerciseId: item.exerciseId,
      label: item.label,
      maxPoints: item.maxPoints,
      points: item.points,
      studentAnswer: item.studentAnswer,
      comment: item.comment,
      pending: item.needsReview && !item.reviewed,
    })),
  };
}

export function studentPdfFileName(input: StudentPdfInput): string {
  return pdfFileName(input.testCode, input.studentName);
}

const list = (title: string, entries: string[]): Content[] =>
  entries.length === 0 ? [] : [{ text: title, style: 'h2' }, { ul: entries, margin: [0, 0, 0, 4] }];

export function studentPdf(input: StudentPdfInput): TDocumentDefinitions {
  const pending = input.items.some((item) => item.pending);
  const header = ['Exercițiul', 'Puncte', 'Răspunsul tău', 'Comentariu'].map((text) => ({ text, style: 'th' }));
  const rows = input.items.map((item) => [
    { text: [{ text: item.exerciseId, bold: true }, `\n${item.label}`], fontSize: 9 },
    item.pending
      ? { text: 'în verificare', italics: true, noWrap: true }
      : { text: `${formatPoints(item.points)} din ${formatPoints(item.maxPoints)}`, noWrap: true },
    { text: item.studentAnswer, fontSize: 9 },
    { text: item.comment, fontSize: 9 },
  ]);
  const officeText = input.officePoints > 0 ? `, cu ${formatPoints(input.officePoints)} din oficiu` : '';
  return {
    info: { title: `${input.testCode} · ${input.studentName}` },
    pageSize: 'A4',
    pageMargins: [40, 48, 40, 48],
    defaultStyle: { font: 'Roboto', fontSize: 10.5 },
    styles: {
      h1: { fontSize: 18, bold: true, margin: [0, 0, 0, 2] },
      h2: { fontSize: 12, bold: true, margin: [0, 12, 0, 4] },
      th: { bold: true, fontSize: 9, color: '#586070' },
      muted: { color: '#586070' },
    },
    footer: (page, pages) => ({ text: `Pagina ${page} din ${pages}`, alignment: 'right', margin: [40, 0, 40, 0], style: 'muted', fontSize: 8 }),
    content: [
      { text: input.studentName, style: 'h1' },
      {
        text: [input.testTitle, ' · ', input.testCode, input.date ? ` · ${formatDate(input.date)}` : ''].join(''),
        style: 'muted',
      },
      { text: `Nota ${formatPoints(input.grade)}`, fontSize: 16, bold: true, margin: [0, 10, 0, 0] },
      { text: `${formatPoints(input.total)} puncte din ${formatPoints(input.maxTotal)}${officeText}`, margin: [0, 0, 0, 4] },
      ...(pending
        ? [{ text: 'Unele puncte sunt încă în verificare, deci nota se poate schimba.', italics: true, margin: [0, 0, 0, 4] } as Content]
        : []),
      { text: 'Pe exerciții', style: 'h2' },
      {
        table: { headerRows: 1, dontBreakRows: true, widths: ['auto', 'auto', '*', '*'], body: [header, ...rows] },
        layout: 'lightHorizontalLines',
      },
      ...(input.summary ? [{ text: 'Rezumat', style: 'h2' } as Content, { text: input.summary } as Content] : []),
      ...list('Ce ai lucrat bine', input.strengths),
      ...list('Recomandări', input.recommendations),
    ],
  };
}
```

- [ ] **Step 10: Create `src/admin/pdf/classPdf.ts`**

```ts
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { ClassReport } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { classStats } from '../../../shared/stats.ts';
import { formatDate, uploadStatusLabel } from '../../ui/format.ts';
import { pdfFileName } from './fileName.ts';

// The class PDF (spec §14.2): landscape, with the table of results, the
// statistics, and the analysis. A test can have 60 exercises, which no page
// holds in one table: the exercises go in blocks of at most `BLOCK` columns,
// and every block repeats the student's name.

export const BLOCK = 12;
const FLAGGED = '#fff0a0';
const MUTED = '#586070';

export function classPdfFileName(report: ClassReport): string {
  return pdfFileName(report.test.code, 'raport');
}

const dash = '—';
const grade = (value: number | null) => (value === null ? dash : formatPoints(value));

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

const headerCell = (text: string) => ({ text, bold: true, fontSize: 8, color: MUTED });

// One block of the results table: the students and a part of the exercises.
// The last block also holds the total and the grade.
function resultsTable(report: ClassReport, exerciseIds: string[], last: boolean): Content {
  const exercises = report.exercises.filter((exercise) => exerciseIds.includes(exercise.id));
  const header: TableCell[] = [headerCell('Elev'), ...exercises.map((exercise) => ({ ...headerCell(exercise.id), alignment: 'center' as const }))];
  if (last) header.push(headerCell('Total'), headerCell('Nota'));
  const body: TableCell[][] = report.rows.map((row) => {
    const cells: TableCell[] = [{ text: row.studentName, fontSize: 9 }];
    for (const exercise of exercises) {
      const item = row.items.find((candidate) => candidate.exerciseId === exercise.id);
      cells.push(
        item
          ? { text: formatPoints(item.points), alignment: 'center', fontSize: 9, fillColor: item.flagged ? FLAGGED : undefined }
          : { text: dash, alignment: 'center', fontSize: 9 },
      );
    }
    if (last) {
      cells.push({ text: `${formatPoints(row.total)} / ${formatPoints(row.maxTotal)}`, fontSize: 9 }, { text: formatPoints(row.grade), bold: true, fontSize: 9 });
    }
    return cells;
  });
  const widths: (string | number)[] = [130, ...exercises.map(() => 36)];
  if (last) widths.push(60, 36);
  return {
    table: { headerRows: 1, dontBreakRows: true, widths, body: [header, ...body] },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 10],
  };
}

const list = (title: string, entries: string[]): Content[] =>
  entries.length === 0 ? [] : [{ text: title, style: 'h3' }, { ul: entries, margin: [0, 0, 0, 4] }];

export function classPdf(report: ClassReport): TDocumentDefinitions {
  const stats = classStats(report);
  const blocks = chunks(
    report.exercises.map((exercise) => exercise.id),
    BLOCK,
  );
  const anyFlagged = report.rows.some((row) => row.items.some((item) => item.flagged));
  const { content: analysis, stale } = report.analysis;

  const content: Content[] = [
    { text: `Raportul clasei · ${report.test.code}`, style: 'h1' },
    {
      text: [report.test.title, displayClassName(report.test.className), report.test.startedAt ? formatDate(report.test.startedAt) : '']
        .filter((part) => part !== '')
        .join(' · '),
      color: MUTED,
    },
    { text: 'Statistici', style: 'h2' },
    { text: `Corectate ${stats.gradedCount} din ${stats.activeCount} elevi${stats.flaggedCount > 0 ? ` · de verificat ${stats.flaggedCount}` : ''}` },
    {
      columns: [
        { text: `Media ${grade(stats.average)}`, bold: true },
        { text: `Mediana ${grade(stats.median)}`, bold: true },
        { text: `Cea mai mică notă ${grade(stats.min)}`, bold: true },
        { text: `Cea mai mare notă ${grade(stats.max)}`, bold: true },
      ],
      margin: [0, 4, 0, 4],
    },
    { text: stats.groups.map((group) => `${group.label}: ${group.count}`).join('   ·   '), color: MUTED },
    { text: 'Rezultatele elevilor', style: 'h2' },
    ...blocks.map((ids, index) => resultsTable(report, ids, index === blocks.length - 1)),
    ...(blocks.length === 0 ? [resultsTable(report, [], true)] : []),
    ...(anyFlagged ? [{ text: 'Fundalul galben marchează punctajele încă în verificare.', color: MUTED, fontSize: 9 } as Content] : []),
    { text: 'Pe exerciții', style: 'h2' },
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
        body: [
          ['Exercițiul', 'Media', '% din maxim', 'Tot', 'Parțial', 'Nimic'].map(headerCell),
          ...stats.perExercise.map((exercise): TableCell[] => [
            { text: `${exercise.exerciseId} · ${exercise.label}`, fontSize: 9 },
            { text: exercise.averagePoints === null ? dash : `${formatPoints(exercise.averagePoints)} din ${formatPoints(exercise.maxPoints)}`, fontSize: 9 },
            { text: exercise.averagePercent === null ? dash : `${exercise.averagePercent}%`, fontSize: 9 },
            { text: String(exercise.full), fontSize: 9 },
            { text: String(exercise.partial), fontSize: 9 },
            { text: String(exercise.zero), fontSize: 9 },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    },
  ];
  if (report.missing.length > 0) {
    content.push(
      { text: 'Fără rezultat', style: 'h2' },
      { ul: report.missing.map((student) => `${student.studentName} · ${uploadStatusLabel(student.status)}`) },
    );
  }
  if (analysis) {
    content.push({ text: 'Analiza clasei', style: 'h2' });
    if (stale) content.push({ text: 'Analiza poate fi depășită: notele s-au schimbat după ce a fost scrisă.', italics: true, color: MUTED });
    content.push(
      { text: analysis.overview },
      ...list('Ce a mers bine', analysis.strengths),
      ...list('Ce a mers mai greu', analysis.weaknesses),
      ...list('Greșeli frecvente', analysis.commonMistakes),
      ...list('Ce exersați în continuare', analysis.recommendations),
    );
  }

  return {
    info: { title: `Raportul clasei · ${report.test.code}` },
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [36, 40, 36, 40],
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    styles: {
      h1: { fontSize: 18, bold: true, margin: [0, 0, 0, 2] },
      h2: { fontSize: 13, bold: true, margin: [0, 12, 0, 4] },
      h3: { fontSize: 11, bold: true, margin: [0, 6, 0, 2] },
    },
    footer: (page, pages) => ({ text: `Pagina ${page} din ${pages}`, alignment: 'right', margin: [36, 0, 36, 0], color: MUTED, fontSize: 8 }),
    content,
  };
}
```

- [ ] **Step 11: Create `src/admin/pdf/renderPdf.ts`**

```ts
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

// Makes the PDF in the browser. pdfmake and its font are about 2 MB, so they
// load only when the teacher asks for a PDF: the app itself stays small.
// Roboto, which pdfmake carries, holds every Romanian letter (ă â î ș ț, and
// the cedilla forms ş ţ that old texts use): `pdfText.test.ts` checks it.
export async function renderPdf(definition: TDocumentDefinitions): Promise<Blob> {
  const [{ default: pdfMake }, fonts] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  const vfs = (fonts as { default?: Record<string, string> }).default ?? (fonts as unknown as Record<string, string>);
  pdfMake.addVirtualFileSystem(vfs);
  pdfMake.addFonts({
    Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' },
  });
  return pdfMake.createPdf(definition).getBlob();
}
```

- [ ] **Step 12: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  70 passed (70)`, `Tests  924 passed (924)`.

- [ ] **Step 13: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 14: Commit**

```bash
git add package.json package-lock.json src
git commit -m "Make the student's PDF and the class PDF in the browser"
```

---

### Task 8: CSV, Descarcă PDF, and Trimite

`shared/csv.ts` writes the class report for Romanian Excel. `share.ts` shares a file through the share sheet, or saves it. `PdfActions` holds the buttons: on the class report **Descarcă PDF**, **Descarcă CSV**, and **Trimite**; on a graded student's page **Descarcă PDF** and **Trimite**.

**Files:**
- Create: `shared/csv.ts`, `src/admin/pdf/share.ts`, `src/admin/pdf/PdfActions.tsx`
- Modify: `src/admin/pages/ReportPage.tsx`, `src/admin/pages/SubmissionPage.tsx`, `vite.config.ts`, `src/AGENTS.md`, `docs/superpowers/specs/2026-10-06-quickeval-design.md`
- Test: `shared/csv.test.ts` (new), `src/admin/pdf/share.test.ts` (new), `src/admin/pdf/PdfActions.test.tsx` (new), `src/admin/pages/ReportPage.test.tsx` (modified), `src/admin/pages/SubmissionPage.test.tsx` (modified)

**Interfaces:**
- Consumes: `renderPdf`, `studentPdf`, `studentPdfInput`, `classPdf`, `ClassReport`.
- Produces:
  - `csvNumber(value)`, `csvText(text)`, `classCsv(report, statusLabel): string` in `shared/csv.ts`.
  - `ShareResult`, `saveFile(blob, fileName)`, `shareFile(blob, fileName, title)` in `share.ts`.
  - `PdfFile { build, fileName, title }`, `CsvFile { build, fileName }`, `PdfActions({ pdf, csv? })`.
  - `build.chunkSizeWarningLimit` = 1000 in `vite.config.ts`: the two pdfmake chunks load on demand.

- [ ] **Step 1: Create `shared/csv.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { ClassReport, UploadStatus } from './api.ts';
import { classCsv, csvNumber, csvText } from './csv.ts';

const label = (status: UploadStatus) => (status === 'none' ? 'Nu a trimis' : status);

function report(overrides: Partial<ClassReport> = {}): ClassReport {
  return {
    test: { code: '6E2-26T1', title: 'Fracții', className: '6E2', status: 'done', startedAt: null },
    exercises: [
      { id: 'I.1', label: 'Exercițiul 1', maxPoints: 4.5 },
      { id: 'II.1', label: 'Exercițiul 2', maxPoints: 4.5 },
    ],
    rows: [
      {
        submissionId: 5,
        studentId: 10,
        studentName: 'Ștefănescu Ana',
        total: 7.25,
        maxTotal: 10,
        grade: 7.25,
        flagCount: 0,
        items: [
          { exerciseId: 'I.1', points: 4.5, maxPoints: 4.5, flagged: false },
          { exerciseId: 'II.1', points: 1.75, maxPoints: 4.5, flagged: false },
        ],
      },
    ],
    missing: [{ studentId: 12, studentName: 'Stan Eva', status: 'none' }],
    analysis: { status: 'none', stale: false, content: null },
    ...overrides,
  };
}

describe('classCsv', () => {
  it('starts with the byte order mark and uses ";" and a decimal comma, with CR LF line ends', () => {
    const csv = classCsv(report(), label);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe(
      '﻿Elev;I.1;II.1;Total;Nota;Observații\r\n' + 'Ștefănescu Ana;4,5;1,75;7,25;7,25;\r\n' + 'Stan Eva;;;;;Nu a trimis\r\n',
    );
  });

  it('marks the students that have an item to check', () => {
    const base = report();
    const flagged = report({ rows: [{ ...base.rows[0]!, flagCount: 2 }], missing: [] });
    expect(classCsv(flagged, label).split('\r\n')[1]).toBe('Ștefănescu Ana;4,5;1,75;7,25;7,25;de verificat 2');
  });

  it('keeps a student with a missing item as an empty cell', () => {
    const base = report();
    const short = report({ rows: [{ ...base.rows[0]!, items: [base.rows[0]!.items[0]!] }], missing: [] });
    expect(classCsv(short, label).split('\r\n')[1]).toBe('Ștefănescu Ana;4,5;;7,25;7,25;');
  });

  it('puts an apostrophe before a text that would run as a formula in a spreadsheet', () => {
    const base = report();
    const names = ['=HYPERLINK("http://x.test")', '+1', '-2', '@SUM(A1)', '\tx', '\rx'];
    const rows = names.map((studentName, index) => ({ ...base.rows[0]!, submissionId: index + 1, studentName }));
    const lines = classCsv(report({ rows, missing: [] }), label).split('\r\n');
    expect(lines[1]).toBe(`"'=HYPERLINK(""http://x.test"")";4,5;1,75;7,25;7,25;`);
    expect(lines[2]!.startsWith("'+1;")).toBe(true);
    expect(lines[3]!.startsWith("'-2;")).toBe(true);
    expect(lines[4]!.startsWith("'@SUM(A1);")).toBe(true);
    expect(lines[5]!.startsWith("'\tx;")).toBe(true);
    // A carriage return is quoted, so the line stays one record.
    expect(classCsv(report({ rows: [rows[5]!], missing: [] }), label)).toContain("\"'\rx\";4,5");
  });

  it('puts the formula guard on the exercise ids and the status words too', () => {
    const base = report();
    const odd = report({
      exercises: [{ id: '=A1', label: 'x', maxPoints: 1 }],
      rows: [{ ...base.rows[0]!, items: [{ exerciseId: '=A1', points: 1, maxPoints: 1, flagged: false }] }],
      missing: [{ studentId: 1, studentName: 'Ion', status: 'failed' }],
    });
    const lines = classCsv(odd, () => '=cmd').split('\r\n');
    expect(lines[0]).toBe("﻿Elev;'=A1;Total;Nota;Observații");
    expect(lines[2]).toBe("Ion;;;;'=cmd");
  });

  it('quotes a name that holds the separator or a quote', () => {
    expect(csvText('Pop; Ion')).toBe('"Pop; Ion"');
    expect(csvText('Pop "Ionel"')).toBe('"Pop ""Ionel"""');
    expect(csvText('Pop Ion')).toBe('Pop Ion');
  });

  it('writes numbers, also negative ones, as numbers: no guard', () => {
    expect(csvNumber(7.5)).toBe('7,5');
    expect(csvNumber(10)).toBe('10');
    expect(csvNumber(2.675)).toBe('2,68');
    expect(csvNumber(-1)).toBe('-1');
    expect(csvNumber(0)).toBe('0');
  });
});
```

- [ ] **Step 2: Create `src/admin/pdf/share.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveFile, shareFile } from './share.ts';

const blob = () => new Blob(['%PDF-1.7 test'], { type: 'application/pdf' });

let clicked: { download: string; href: string }[];

beforeEach(() => {
  clicked = [];
  URL.createObjectURL = vi.fn(() => 'blob:test-1');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ download: this.download, href: this.href });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
});

function setShare(share: ((data: ShareData) => Promise<void>) | undefined, canShare: boolean | undefined = true) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: canShare === undefined ? undefined : () => canShare, configurable: true });
}

describe('saveFile', () => {
  it('saves the file through a link with its name, and frees the address later', () => {
    vi.useFakeTimers();
    saveFile(blob(), '6E2-26T1-raport.pdf');
    expect(clicked).toEqual([{ download: '6E2-26T1-raport.pdf', href: 'blob:test-1' }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-1');
  });
});

describe('shareFile', () => {
  it('shares the PDF file through the share sheet', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    setShare(share);
    expect(await shareFile(blob(), 'raport.pdf', 'Raportul clasei')).toBe('shared');
    const data = share.mock.calls[0]![0];
    expect(data.title).toBe('Raportul clasei');
    expect(data.files).toHaveLength(1);
    expect(data.files![0]).toMatchObject({ name: 'raport.pdf', type: 'application/pdf' });
    expect(clicked).toHaveLength(0);
  });

  it('does nothing more when the teacher closes the share sheet', async () => {
    setShare(async () => Promise.reject(new DOMException('closed', 'AbortError')));
    expect(await shareFile(blob(), 'raport.pdf', 'Raportul clasei')).toBe('cancelled');
    expect(clicked).toHaveLength(0);
  });

  it('downloads the PDF when the browser cannot share files', async () => {
    setShare(undefined, undefined);
    expect(await shareFile(blob(), 'raport.pdf', 'Raportul clasei')).toBe('downloaded');
    expect(clicked).toEqual([{ download: 'raport.pdf', href: 'blob:test-1' }]);
  });

  it('downloads the PDF when the browser can share, but not this file', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    setShare(share, false);
    expect(await shareFile(blob(), 'raport.pdf', 'Raportul clasei')).toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
  });

  it('downloads the PDF when the share sheet refuses because the tap is too old', async () => {
    setShare(async () => Promise.reject(new DOMException('no gesture', 'NotAllowedError')));
    expect(await shareFile(blob(), 'raport.pdf', 'Raportul clasei')).toBe('downloaded');
    expect(clicked).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Create `src/admin/pdf/PdfActions.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfActions } from './PdfActions.tsx';
import * as render_ from './renderPdf.ts';
import * as share from './share.ts';

vi.mock('./renderPdf.ts', () => ({ renderPdf: vi.fn() }));
vi.mock('./share.ts', () => ({ saveFile: vi.fn(), shareFile: vi.fn() }));

const renderPdf = vi.mocked(render_.renderPdf);
const saveFile = vi.mocked(share.saveFile);
const shareFile = vi.mocked(share.shareFile);
const blob = new Blob(['%PDF-'], { type: 'application/pdf' });

const pdf = { build: vi.fn(() => ({ content: ['ok'] })), fileName: 'raport.pdf', title: 'Raportul clasei' };

beforeEach(() => {
  vi.clearAllMocks();
  renderPdf.mockResolvedValue(blob);
});

describe('PdfActions', () => {
  it('makes the PDF only when a button is pressed, and saves it', async () => {
    render(<PdfActions pdf={pdf} />);
    expect(pdf.build).not.toHaveBeenCalled();
    expect(renderPdf).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Descarcă PDF' }));
    expect(pdf.build).toHaveBeenCalledTimes(1);
    expect(saveFile).toHaveBeenCalledWith(blob, 'raport.pdf');
    expect(shareFile).not.toHaveBeenCalled();
  });

  it('shares the PDF, and says nothing when it was shared', async () => {
    shareFile.mockResolvedValue('shared');
    render(<PdfActions pdf={pdf} />);
    await userEvent.click(screen.getByRole('button', { name: 'Trimite' }));
    expect(shareFile).toHaveBeenCalledWith(blob, 'raport.pdf', 'Raportul clasei');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says that the PDF was downloaded when sharing is not possible', async () => {
    shareFile.mockResolvedValue('downloaded');
    render(<PdfActions pdf={pdf} />);
    await userEvent.click(screen.getByRole('button', { name: 'Trimite' }));
    expect(await screen.findByText('Trimiterea nu merge pe acest dispozitiv. PDF-ul s-a descărcat.')).toBeInTheDocument();
  });

  it('says so when the PDF cannot be made, and lets the teacher try again', async () => {
    renderPdf.mockRejectedValueOnce(new Error('broken'));
    render(<PdfActions pdf={pdf} />);
    await userEvent.click(screen.getByRole('button', { name: 'Descarcă PDF' }));
    expect(await screen.findByText('PDF-ul nu a putut fi făcut. Încearcă din nou.')).toBeInTheDocument();
    expect(saveFile).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Descarcă PDF' }));
    expect(saveFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('PDF-ul nu a putut fi făcut. Încearcă din nou.')).not.toBeInTheDocument();
  });

  it('keeps the buttons off while the PDF is made', async () => {
    let finish: (value: Blob) => void = () => undefined;
    renderPdf.mockReturnValueOnce(new Promise<Blob>((resolve) => (finish = resolve)));
    render(<PdfActions pdf={pdf} />);
    await userEvent.click(screen.getByRole('button', { name: 'Descarcă PDF' }));
    expect(screen.getByText('Se face PDF-ul…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trimite' })).toBeDisabled();
    finish(blob);
    expect(await screen.findByRole('button', { name: 'Trimite' })).toBeEnabled();
  });

  it('saves the CSV without making a PDF, as UTF-8 text', async () => {
    render(<PdfActions pdf={pdf} csv={{ build: () => '﻿Elev;Nota\r\n', fileName: 'raport.csv' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Descarcă CSV' }));
    expect(renderPdf).not.toHaveBeenCalled();
    const [file, name] = saveFile.mock.calls[0]!;
    expect(name).toBe('raport.csv');
    expect((file as Blob).type).toBe('text/csv;charset=utf-8');
    expect(await (file as Blob).text()).toBe('Elev;Nota\r\n');
  });

  it('has no CSV button without a CSV', () => {
    render(<PdfActions pdf={pdf} />);
    expect(screen.queryByRole('button', { name: 'Descarcă CSV' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
    expect(within(missing).getByText('· Nu a trimis')).toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(within(missing).getByText('· Nu a trimis')).toBeInTheDocument();
  });

  it('has the buttons for the PDF, the CSV, and sharing, only when something is graded', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    expect(await screen.findByRole('button', { name: 'Descarcă PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descarcă CSV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trimite' })).toBeInTheDocument();
  });

  it('has no buttons for a class with nothing graded', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith(report({ rows: [] })));
    expect(await screen.findByText('Nicio lucrare nu este corectată încă', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descarcă PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descarcă CSV' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 5: Edit `src/admin/pages/SubmissionPage.test.tsx`**

Find this block:

```tsx
    expect(screen.getByText('Exersează ecuațiile.')).toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(screen.getByText('Exersează ecuațiile.')).toBeInTheDocument();
  });

  it('has the PDF buttons only for a graded result', async () => {
    const { unmount } = renderAdmin(page, apiWith(graded));
    expect(await screen.findByRole('button', { name: 'Descarcă PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trimite' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descarcă CSV' })).not.toBeInTheDocument();
    unmount();
    renderAdmin(page, apiWith());
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descarcă PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trimite' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 6: Run the tests to see them fail**

Run: `npx vitest run shared/csv.test.ts src/admin/pdf/share.test.ts src/admin/pdf/PdfActions.test.tsx src/admin/pages/ReportPage.test.tsx src/admin/pages/SubmissionPage.test.tsx`
Expected: FAIL. `Test Files  5 failed (5)`, `Tests  2 failed | 41 passed (43)`. Failing tests: "has the buttons for the PDF, the CSV, and sharing, only when something is graded"; "has the PDF buttons only for a graded result". Errors such as: `Error: Failed to resolve import "./PdfActions.tsx" from "src/admin/pdf/PdfActions.test.tsx". Does the file exist?`; `Error: Failed to resolve import "./share.ts" from "src/admin/pdf/share.test.ts". Does the file exist?`; `Error: Cannot find module './csv.ts' imported from C:/Users/gabi/AppData/Local/Temp/claude/D--Projects-QuickEval/3bb40b7`. Tests of this task that do not fail yet are guards: they pass before and after.

- [ ] **Step 7: Create `shared/csv.ts`**

```ts
import type { ClassReport, UploadStatus } from './api.ts';
import { round2 } from './scoring.ts';

// The class report as a CSV file for Romanian Excel (spec §14.2): UTF-8 with a
// byte order mark, ";" between cells, a decimal comma, and lines that end with
// CR LF. Numbers are written as numbers, so Excel can add them.
//
// Texts come from students' names and from Claude: a cell of text that starts
// with "=", "+", "-", "@", a tab, or a carriage return would run as a formula
// in a spreadsheet, so it gets an apostrophe in front. Numbers are never
// changed: a negative number is still a number.

const BOM = '﻿';
const SEPARATOR = ';';
const FORMULA_START = /^[=+\-@\t\r]/;

// A number as Romanian Excel reads it: "7,5".
export function csvNumber(value: number): string {
  return String(round2(value)).replace('.', ',');
}

// A cell of text: safe against formulas, and quoted when it holds the
// separator, a quote, or a line break.
export function csvText(text: string): string {
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// `statusLabel` names why a student has no result ("Nu a trimis"), in the words of the app.
export function classCsv(report: ClassReport, statusLabel: (status: UploadStatus) => string): string {
  const header = ['Elev', ...report.exercises.map((exercise) => exercise.id), 'Total', 'Nota', 'Observații'].map(csvText);
  const lines = [header.join(SEPARATOR)];
  for (const row of report.rows) {
    const cells = [
      csvText(row.studentName),
      ...report.exercises.map((exercise) => {
        const item = row.items.find((candidate) => candidate.exerciseId === exercise.id);
        return item ? csvNumber(item.points) : '';
      }),
      csvNumber(row.total),
      csvNumber(row.grade),
      row.flagCount > 0 ? csvText(`de verificat ${row.flagCount}`) : '',
    ];
    lines.push(cells.join(SEPARATOR));
  }
  for (const student of report.missing) {
    const cells = [csvText(student.studentName), ...report.exercises.map(() => ''), '', '', csvText(statusLabel(student.status))];
    lines.push(cells.join(SEPARATOR));
  }
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
```

- [ ] **Step 8: Create `src/admin/pdf/share.ts`**

```ts
// Gives a file to the teacher: "Descarcă" saves it; "Trimite" opens the share
// sheet of the phone (Web Share API) with the file, and saves it when sharing
// is not possible (spec §14.1). The share sheet needs a fresh tap of the
// user, which a slow PDF can use up: then the file is saved too, and the
// teacher can send it from the downloads.

export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

// Saves a file through a link that points to it.
export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // The download has started when click() returns; the address can go a moment later.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function shareFile(blob: Blob, fileName: string, title: string): Promise<ShareResult> {
  const file = new File([blob], fileName, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      // The teacher closed the share sheet: nothing more to do.
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }
  saveFile(blob, fileName);
  return 'downloaded';
}
```

- [ ] **Step 9: Create `src/admin/pdf/PdfActions.tsx`**

```tsx
import { useState } from 'react';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { renderPdf } from './renderPdf.ts';
import { saveFile, shareFile } from './share.ts';

export interface PdfFile {
  // Made when a button is pressed, not with every render of the page.
  build: () => TDocumentDefinitions;
  fileName: string;
  // The name that the share sheet shows.
  title: string;
}

export interface CsvFile {
  build: () => string;
  fileName: string;
}

// "Descarcă PDF" and "Trimite" for a PDF, and "Descarcă CSV" when the page has
// one (spec §14). The PDF is made when a button is pressed: its code loads
// then, not with the page.
export function PdfActions({ pdf, csv }: { pdf: PdfFile; csv?: CsvFile }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (action: 'download' | 'share') => {
    setBusy(true);
    setMessage(null);
    try {
      const blob = await renderPdf(pdf.build());
      if (action === 'download') {
        saveFile(blob, pdf.fileName);
      } else if ((await shareFile(blob, pdf.fileName, pdf.title)) === 'downloaded') {
        setMessage('Trimiterea nu merge pe acest dispozitiv. PDF-ul s-a descărcat.');
      }
    } catch {
      setMessage('PDF-ul nu a putut fi făcut. Încearcă din nou.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pdf-actions">
      <button type="button" className="button-quiet button-small" disabled={busy} onClick={() => run('download')}>
        Descarcă PDF
      </button>
      {csv && (
        <button
          type="button"
          className="button-quiet button-small"
          onClick={() => saveFile(new Blob([csv.build()], { type: 'text/csv;charset=utf-8' }), csv.fileName)}
        >
          Descarcă CSV
        </button>
      )}
      <button type="button" className="button-quiet button-small" disabled={busy} onClick={() => run('share')}>
        Trimite
      </button>
      {busy && <span role="status">Se face PDF-ul…</span>}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 10: Edit `src/admin/pages/ReportPage.tsx`**

Find this block:

```tsx
import { ErrorMessage } from '../ErrorMessage.tsx';
import { AnalysisSection } from '../reportPage/AnalysisSection.tsx';
```

Replace it with:

```tsx
import { ErrorMessage } from '../ErrorMessage.tsx';
import { classCsv } from '../../../shared/csv.ts';
import { uploadStatusLabel } from '../../ui/format.ts';
import { classPdf, classPdfFileName } from '../pdf/classPdf.ts';
import { PdfActions } from '../pdf/PdfActions.tsx';
import { AnalysisSection } from '../reportPage/AnalysisSection.tsx';
```

- [ ] **Step 11: Edit `src/admin/pages/ReportPage.tsx`**

Find this block:

```tsx
        <>
          <StatsSummary stats={stats} />
```

Replace it with:

```tsx
        <>
          <PdfActions
            pdf={{ build: () => classPdf(report), fileName: classPdfFileName(report), title: `Raportul clasei · ${report.test.code}` }}
            csv={{ build: () => classCsv(report, uploadStatusLabel), fileName: `${report.test.code}-raport.csv` }}
          />
          <StatsSummary stats={stats} />
```

- [ ] **Step 12: Edit `src/admin/pages/SubmissionPage.tsx`**

Find this block:

```tsx
import { PageFiles } from '../submissionPage/PageFiles.tsx';
import { ResultLink } from '../testPage/ResultLink.tsx';
```

Replace it with:

```tsx
import { PageFiles } from '../submissionPage/PageFiles.tsx';
import { PdfActions } from '../pdf/PdfActions.tsx';
import { studentPdf, studentPdfFileName, studentPdfInput } from '../pdf/studentPdf.ts';
import { ResultLink } from '../testPage/ResultLink.tsx';
```

- [ ] **Step 13: Edit `src/admin/pages/SubmissionPage.tsx`**

Find this block:

```tsx
  const showNotice = notice !== null && (submission.status === 'submitted' || submission.status === 'grading');
  // Recorectează names the grading the page shows.
```

Replace it with:

```tsx
  const showNotice = notice !== null && (submission.status === 'submitted' || submission.status === 'grading');
  // The student's PDF, only for a graded result.
  const pdfInput = studentPdfInput(submission);
  // Recorectează names the grading the page shows.
```

- [ ] **Step 14: Edit `src/admin/pages/SubmissionPage.tsx`**

Find this block:

```tsx
        </div>
      )}
```

Replace it with:

```tsx
        </div>
      )}
      {pdfInput && (
        <PdfActions
          pdf={{
            build: () => studentPdf(pdfInput),
            fileName: studentPdfFileName(pdfInput),
            title: `${pdfInput.testCode} · ${pdfInput.studentName}`,
          }}
        />
      )}
```

- [ ] **Step 15: Edit `vite.config.ts`**

Find this block:

```ts
    outDir: 'dist',
    rollupOptions: {
```

Replace it with:

```ts
    outDir: 'dist',
    // pdfmake and its font (each under 1 MB) load only when a PDF is asked for.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
```

- [ ] **Step 16: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (colours from the Laura Miron site), brand mark, theme switch, Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time).
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (files, link, evaluation controls, the barem warning (`ExerciseListBanner.tsx`), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`), the uploads table, "Recorectează tot"). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `pages/StudentPage.tsx` is a student's history. `pages/SettingsPage.tsx` is Setări.
- `upload/`: the student app. `api.ts` (the only code that calls `/api/u`, with XMLHttpRequest for upload progress), `session.ts` (the phone's secret in localStorage), `shrink.ts` (photos made smaller on the phone).
```

Replace it with:

```markdown
- `ui/`: brand CSS (colours from the Laura Miron site), brand mark, theme switch, Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time).
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (files, link, evaluation controls, the barem warning (`ExerciseListBanner.tsx`), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`), the uploads table, "Recorectează tot"). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `pages/StudentPage.tsx` is a student's history. `pages/SettingsPage.tsx` is Setări. `pages/ReportPage.tsx` and `reportPage/` are the class report (`shared/stats.ts` makes its numbers). `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `upload/`: the student app. `api.ts` (the only code that calls `/api/u`, with XMLHttpRequest for upload progress), `session.ts` (the phone's secret in localStorage), `shrink.ts` (photos made smaller on the phone).
```

- [ ] **Step 17: Edit `src/AGENTS.md`**

Find this block:

```markdown

- The schedule input takes Romania's time (`ui/bucharestTime.ts`).
```

Replace it with:

```markdown

- A PDF never carries what is for the teacher only: `studentPdfInput()` is the only way into the student's PDF, and its type has no confidence and no review reason. Keep it so, and keep no word about how the work was graded in it. CSV cells that hold text go through `csvText()` (`shared/csv.ts`), which guards against formulas.
- The class PDF and the report page have one column for each exercise (up to 60): the page table scrolls in its `.table-wrap` and uses `report-table`, not the `uploads` table that turns into cards on a phone.

- The schedule input takes Romania's time (`ui/bucharestTime.ts`).
```

- [ ] **Step 18: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
- Buttons: **Descarcă PDF** (landscape: table, statistics, analysis), **Descarcă CSV**, **Trimite** (the PDF).
- CSV for Romanian Excel: UTF-8 with BOM, `;` as the separator, and a decimal comma.

```

Replace it with:

```markdown
- Buttons: **Descarcă PDF** (landscape: table, statistics, analysis), **Descarcă CSV**, **Trimite** (the PDF).
- CSV for Romanian Excel: UTF-8 with BOM, `;` as the separator, a decimal comma, and CR LF line ends. Columns: Elev, one for each exercise, Total, Nota, Observații (items to check, or why a student has no result). Numbers are numbers. A text cell (names, exercise ids, the words of Observații) that starts with `=`, `+`, `-`, `@`, a tab, or a carriage return gets an apostrophe in front, so a spreadsheet never runs it as a formula: the texts come from students and from Claude.
- **Trimite** opens the share sheet with the PDF file (Web Share API). When the browser cannot share files, or refuses because the tap is too old (a slow PDF), the PDF is downloaded and the page says so. Closing the share sheet does nothing.

```

- [ ] **Step 19: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown

pdfmake gets a font with full Romanian letters (ă â î ș ț, comma-below forms U+0219 and U+021B). Plan 4b checks this with a test that builds a PDF with these letters.

```

Replace it with:

```markdown

pdfmake gets a font with full Romanian letters (ă â î ș ț, comma-below forms U+0219 and U+021B). The Roboto that pdfmake carries holds all of them, and the cedilla forms ş ţ (U+015F, U+0163) that old texts and barems use, so no font file is added. A test reads the font's character map and checks that every character of both PDFs has a glyph, and a test makes a real PDF with these letters.

The PDFs are made in the browser, in a chunk that loads only when a PDF is asked for (pdfmake and its font: about 1.8 MB, 0.8 MB compressed): the app itself does not grow. The student's PDF is made from a narrow input (`StudentPdfInput`) that has no confidence and no review reason, so they cannot reach it. The class PDF puts the exercises in blocks of 12 columns, each block repeating the student's name, because no page holds 60 columns.

```

- [ ] **Step 20: Run all tests, the typecheck, and the build**

Run: `npm test`, then `npm run typecheck`, then `npm run build`
Expected: `Test Files  73 passed (73)`, `Tests  947 passed (947)`. No typecheck output. The build ends with `✓ built in …` and lists two chunks `vfs_fonts-….js` and `pdfmake-….js` of under 1 MB each, with no chunk warning.

- [ ] **Step 21: Commit**

```bash
git add shared src vite.config.ts docs
git commit -m "Add Descarcă PDF, Descarcă CSV, and Trimite for a student's result and for the class report"
```

---

### Task 9: The operations notes, the rules, and the follow-ups

`docs/deploy.md` gets the operations notes of the spec's §18 (the Claude token, the class analysis, R2 and the school years, D1 history). `AGENTS.md` gets the rules for the PDFs, the CSV, and the robot start. `plan-4b-followups.md` says what this plan leaves open.

**Files:**
- Create: `docs/superpowers/plans/plan-4b-followups.md`
- Modify: `docs/deploy.md`, `AGENTS.md`, `docs/superpowers/plans/plan-4a-followups.md`, `docs/superpowers/specs/2026-10-06-quickeval-design.md`

**Interfaces:**
- Consumes: everything above.
- Produces: docs only.

- [ ] **Step 1: Edit `docs/deploy.md`**

Find this block:

```markdown
- Claude Code is pinned in `evaluate.yml`. To update it: install the new version on this PC, run `npm run try:skill` with it, then change the pin. A model that needs a newer Claude Code makes every task fail: the run stops after three failures in a row.
```

Replace it with:

```markdown
- Claude Code is pinned in `evaluate.yml`. To update it: install the new version on this PC, run `npm run try:skill` with it, then change the pin. A model that needs a newer Claude Code makes every task fail: the run stops after three failures in a row.

## Operations

- **The Claude token** (`CLAUDE_CODE_OAUTH_TOKEN`) lasts one year. Renew it before it ends: `claude setup-token` on this PC, then GitHub, Settings, Secrets and variables, Actions, and replace the secret. Setări shows the date of the last successful grading, and says "tokenul Claude nu mai merge" when Claude refuses it. Write the renewal date in your calendar when you set it.
- **The class analysis** is one more Claude call for each test, after its gradings, in the same run. A test stays in "Se corectează" until it is written (or has failed three times). If a usage limit stops a run, "Pornește robotul" on the test page continues it. A test graded before analyses existed shows "Fă analiza clasei" in its report.
- **R2 and the school years**: each September, look at the R2 usage in the Cloudflare dashboard (Storage, R2, `quickeval-files`). Files are kept under `t/<teacherId>/<schoolYear>/<testCode>/`. To free space for an old school year, open each of its tests in the app and use "Șterge testul": it deletes the files and the rows. Do not delete objects from the dashboard: the database would still list them.
- **D1 history**: Time Travel keeps 7 days on the free plan. To read the state of an earlier moment: `npx wrangler d1 time-travel info quickeval`; to go back to it: `npx wrangler d1 time-travel restore quickeval --timestamp <time>` (this replaces the live data: do it only to undo a mistake, and tell the teacher first).
- **A new migration** runs on the live database before the code that needs it reaches `main` (see above). Plan 4b adds none.
- **PDFs and the CSV** are made in the teacher's browser: nothing of them is stored on the server.
```

- [ ] **Step 2: Edit `AGENTS.md`**

Find this block:

```markdown
- The robot's Claude reads only its work folder and gets no robot key and no API key. Robot answers and logs carry no names.
- Times are stored as ISO 8601 UTC strings (`nowIso()` or `new Date(x).toISOString()`: SQL compares them as text) and shown in Europe/Bucharest time. School year Y runs from September of Y to August of Y+1.
```

Replace it with:

```markdown
- The robot's Claude reads only its work folder and gets no robot key and no API key. Robot answers and logs carry no names.
- The PDFs and the CSV are made in the browser (`src/admin/pdf/`, `shared/csv.ts`). The student's PDF is made from `StudentPdfInput`, which has no confidence and no review reason; the CSV guards every text cell against formulas.
- Every path that makes work for the robot starts it (`startRobot`): the GitHub schedule does not fire. This includes "Regenerează" (the class analysis).
- Times are stored as ISO 8601 UTC strings (`nowIso()` or `new Date(x).toISOString()`: SQL compares them as text) and shown in Europe/Bucharest time. School year Y runs from September of Y to August of Y+1.
```

- [ ] **Step 3: Edit `docs/superpowers/plans/plan-4a-followups.md`**

Find this block:

```markdown

Plan 4a built the review of the grades: the result page (corrections, Verificat, the check of unreadable pages, Recorectează), Recorectează tot, the student history page, and the items to check on Teste. Plan 4 is cut in two (spec §19). Older open points are in `plan-3b-followups.md`. Write Plan 4b from the repo and the spec.

## For Plan 4b

- The class analysis: the `ClassAnalysis` contract, the robot's third task (`runner/tasks.ts`), the `class-report` mode of the skill, `GET /api/runner/tests/:id/results`, `POST /api/runner/tests/:id/analysis`, Regenerează, and when the first analysis is asked for. Today only a `ready` or `failed` analysis is asked for again, and nothing makes one: `analysis_status` stays `none`.
- The GitHub schedule does not fire (`docs/deploy.md`): every new path that makes work for the robot must start it, and "Pornește robotul" (`testHasRobotWork`) must count a waiting analysis. The test page must show the analysis state, or a test waits in "Se corectează" with every upload graded and no reason shown.
- The class report (spec §14.2) with `shared/stats.ts`, and its link from the test page.
- PDFs (student and class), CSV, Share. The student PDF never names the robot or AI, and never shows review reasons. CSV cells that start with `=`, `+`, `-`, or `@` are escaped: the texts come from Claude.
- The operations notes in `docs/deploy.md`.

```

Replace it with:

```markdown

Plan 4a built the review of the grades: the result page (corrections, Verificat, the check of unreadable pages, Recorectează), Recorectează tot, the student history page, and the items to check on Teste. Plan 4 is cut in two (spec §19). Older open points are in `plan-3b-followups.md`. Plan 4b is built.

## Done in Plan 4b

The class analysis (the robot's third task, the `class-report` mode, its API, and Regenerează), the class report with `shared/stats.ts`, the PDFs, the CSV, Trimite, the operations notes in `docs/deploy.md`, and the Resetează fix (Reset, Retry, publishing a result page, and the result link name the upload by `startedAt`). What Plan 4b leaves open is in `plan-4b-followups.md`.

```

- [ ] **Step 4: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
   - **4a**: the student result page (flags, corrections, Verificat, the check of unreadable pages, Regrade one or all), the student history page, and the items to check on Teste. It changes no robot code. Result: the teacher checks and corrects the grades.
   - **4b**: the class analysis task in the robot (the `ClassAnalysis` contract, `GET /tests/:id/results`, `POST /tests/:id/analysis`, Regenerează); the class report (table, statistics, analysis); PDFs (Romanian font), CSV, Share; the operations notes in `docs/deploy.md`. Result: v1 is complete.

```

Replace it with:

```markdown
   - **4a**: the student result page (flags, corrections, Verificat, the check of unreadable pages, Regrade one or all), the student history page, and the items to check on Teste. It changes no robot code. Result: the teacher checks and corrects the grades.
   - **4b** (built): the class analysis task in the robot (the `ClassAnalysis` contract, `GET /tests/:id/results`, `POST /tests/:id/analysis`, Regenerează); the class report (table, statistics, analysis); PDFs (Romanian font), CSV, Share; the operations notes in `docs/deploy.md`. Result: v1 is complete.

```

- [ ] **Step 5: Create `docs/superpowers/plans/plan-4b-followups.md`**

```markdown
# Plan 4b follow-ups

Plan 4b built the class analysis (the robot's third task, its API, Regenerează), the class report with its statistics, the PDFs (student and class), the CSV, Trimite, the "Resetează" fix, and the operations notes. Older open points are in `plan-4a-followups.md` and `plan-3b-followups.md`.

## Still open

- The Trimite button makes the PDF first and then opens the share sheet. On some phones the sheet refuses a tap that is a few seconds old; the PDF is then downloaded and the page says so. Making the PDF when the page opens (and keeping it) would keep the tap fresh, at the cost of work the teacher may never use.
- The class PDF puts 12 exercises in a block. A very wide test makes many blocks, one below the other. A block size that follows the page width would use less paper.
- The analysis is asked for again each time a test enters evaluation. A test with no new upload that is evaluated again gets a new analysis that is probably the same.
- The student PDF names the date the student sent the upload, not the date of the test (the upload's page has no test date).
- An analysis is saved as out of date when a correction comes while the robot writes it. The teacher sees "Analiza poate fi depășită" and asks for a new one by hand.
- The class report shows the students that left the class only when they have a graded result.
```

- [ ] **Step 6: Run all tests, the typecheck, and the build**

Run: `npm test`, then `npm run typecheck`, then `npm run build`
Expected: `Test Files  73 passed (73)`, `Tests  947 passed (947)`. No typecheck output. The build ends with `✓ built in …`.

- [ ] **Step 7: Commit**

```bash
git add docs AGENTS.md
git commit -m "Write the operations notes, the rules for PDFs and CSV, and the follow-ups of Plan 4b"
```

---

### Task 10: Go live (main session)

No migration runs. Every push to `main` deploys. The new code reads the robot's results through two new routes that the old robot does not call, and the robot's own code changes (the third task and the skill's third mode): GitHub's robot job checks out `main`, so it uses the new code from the next run. The first analysis costs one Claude call for each test, and it sends the students' answers and the robot's comments (no names) to Claude, like the gradings do.

Ask the user before each step marked "ask first", and wait for a clear yes. Steps marked "(user)" are done by the user alone. The auto-mode classifier refuses `wrangler … --remote`, pushes to `main`, and `gh workflow run` from Claude: the user runs those in a separate terminal or on GitHub. curl and wait loops to the live site are denied: use the browser pane. Read GitHub checks once each time the user asks or after other work; do not poll in a loop.

**Files:**
- Modify: nothing, unless a check fails.

- [ ] **Step 1: Check the branch and run the smoke test**

Run: `git status --short`, `npm test`, `npm run build`
Expected: a clean tree on the Plan 4b branch, all tests pass, the build ends with `✓ built in …`.
Then run the smoke test **in the branch's checkout**:
1. If `.dev.vars` is missing in that checkout, copy it from `D:\Projects\QuickEval\.dev.vars` (git-ignored; it holds only `DEV_TEACHER_EMAIL`).
2. Run `npm run db:local` in that checkout (set `CI=true` so wrangler does not ask).
3. Check that nothing else listens on port 8788 (`netstat -ano | findstr :8788`). A leftover `workerd.exe` of an older preview answers with old code: end it as `AGENTS.md` describes. If the user's own preview runs there, start this one on another port with `npx wrangler pages dev dist --port 8789 --ip 127.0.0.1` and run `SMOKE_URL=http://127.0.0.1:8789 npm run smoke`.
4. Start the production build (`npm run preview`, in a Terminal tab with the branch's folder as its directory) and read `env.CF_PAGES_COMMIT_SHA` in its output: it must start with `git rev-parse HEAD`.
5. Run `npm run smoke` in that checkout.
Expected: 49 lines that start with `PASS`, then `All smoke checks passed.` Stop the preview and check that its port is free.

- [ ] **Step 2: Look at the new pages (browser pane)**

With the preview running and one test graded (the smoke test deletes its own; make a test with 5 students and 14 exercises through the robot API as the smoke test does), open `/admin/teste/<code>/raport` at the width of a phone (375 px). Check with `javascript_tool`: `document.documentElement.scrollWidth` equals `innerWidth`, and the wide table scrolls inside its box. Click **Descarcă PDF** with `URL.createObjectURL` wrapped: the blob starts with `%PDF` and the console shows no error. Then set the viewport back to desktop.

- [ ] **Step 3: Run the Linux CI (ask first)**

Push the Plan 4b branch and open a pull request into `main`, so `ci.yml` runs on Linux in UTC. Preview deployments are off, so nothing deploys. After `gh pr create`, use the ccd_pr tools (`get_status`, and `bind_pr` if needed). Wait until the check `test` passes. Without pandoc on the runner, the real-pandoc test is skipped: `Test Files  73 passed (73)`, `Tests  946 passed | 1 skipped (947)`.

- [ ] **Step 4: Merge and deploy (ask first)**

The classifier refuses the push of a merge to `main`: the user merges the pull request on GitHub. Wait for the GitHub check `test` of the merge commit and the Cloudflare check `Cloudflare Pages`; read them once the user asks, by `head_branch` of the check suites.

- [ ] **Step 5: Check the live site (user, with the browser pane)**

The user opens https://quickeval.pages.dev/admin/ (the Access login is the user's). Then, read-only, with `get_page_text` in the browser pane:
1. The test page of the real test `11R1-26T2`: the link "Raportul clasei".
2. The report: the table, the statistics, the students without a result, and "Fă analiza clasei" (the test was graded before analyses existed). Do not click it yet.
3. A graded student's page: **Descarcă PDF** and **Trimite**.
No console errors. Checks, corrections, regrades, and real PDFs are the teacher's work.

- [ ] **Step 6: Ask for the first analysis (ask first, user)**

This is the first real use of the robot's new task, on real student work, and it uses the Claude plan. Ask the user. After a yes, the user clicks **Fă analiza clasei** on the report of `11R1-26T2`. Expected: the page says that the robot writes the analysis and refreshes itself; within a few minutes it shows the analysis. Check the GitHub run's log with the parse-logs-with-haiku skill: it must hold only run ids, counts, durations, and error categories.

- [ ] **Step 7: Report**

Tell the user what is live and what the checks showed. Tell the user and Laura:
- **Raportul clasei** (on the test page) shows every student and exercise, the statistics, and the analysis. Yellow cells are points that wait for a check. **Regenerează** writes a new analysis after corrections.
- **Descarcă PDF** and **Trimite** are on each graded student's page and on the report. **Descarcă CSV** opens in Excel.
- A page left open before a reset can no longer change another student's upload.
- Version 1 is complete. `plan-4b-followups.md` lists what is left for later.

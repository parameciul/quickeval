# QuickEval: design spec

- Date: 2026-10-06
- Status: waiting for review
- Input: `Specifications.txt` (repo root) and the design talk of 2026-10-05/06
- Brand source: `D:\Projects\Website` ("Matematică cu Laura Miron", https://lauramiron.pages.dev/)

## 0. Plain summary

QuickEval grades students' math tests with Claude.

1. The teacher creates a test: she picks the class and types a title.
2. She uploads the test and the marking scheme (barem).
3. She clicks **Start test**. The platform shows a link and a QR code.
4. Students photograph or scan their work and upload it from a phone.
5. She clicks **Start evaluation**, now or at a time she picks.
6. A robot on GitHub grades each student with Claude Code. It follows a grading skill that lives in the repo.
7. The teacher checks the flagged items and corrects points if needed.
8. She downloads or shares a PDF report for each student and for the class.

Everything runs on free tiers: Cloudflare Pages, D1, R2, and GitHub Actions. Claude usage comes from the teacher's Claude plan.

Romanian words used in this document:

- **barem**: the marking scheme.
- **din oficiu**: points every student gets automatically, for example 1 point out of 10.
- **Subiectul I/II/III**: the sections of a Romanian test.

## 1. Scope

### In v1

- One teacher (Laura Miron). The data model and login are ready for more teachers.
- School years, classes, and students, with history for each student across years.
- Tests: create, upload files, start, link and QR, student upload, live upload status.
- Automatic evaluation: exercise list, one Claude agent per student, parallel agents set by a setting (default 1).
- Flags for unclear items, teacher corrections, regrading.
- Per-student report and class report: web page, PDF download, Share, CSV table.
- Class statistics and an AI analysis of strong and weak points.
- Romanian UI and reports. Code, comments, and docs are in English.

### Not in v1 (later)

- Copy a class to the next school year. The `enrollments` table already supports it.
- The teacher edits the exercise list by hand.
- Download all files of a test as one ZIP.
- Automatic cleanup of old files in R2.
- A screen to invite more teachers. For now, one SQL command adds a teacher.
- English UI. Student or parent accounts.

## 2. Requirements trace

| `Specifications.txt` item | Where in this spec |
|---|---|
| Features 1: one teacher now, more later | §7 (`teacher_id` everywhere), §15 (login by email) |
| Features 2: define classes each school year | §7 `classes.school_year`, §9 Classes |
| Features 3: students per class | §7 `students`, `enrollments`, §9 Class page |
| Features 4: test ID `6E2-26T1`, folder, all in DB | §8.1, §7 `tests`, R2 layout in §7.2 |
| Features 5: upload test (doc/pdf) and barem | §9 Test page, §11 `PUT /tests/:code/files/:kind` |
| Features 6: link for the test, persisted | §8 Start test, §10 |
| Features 7: name list, photos/PDF, preview, confirm | §10 |
| Features 8: documents in cloud storage | §7.2 (R2) |
| Features 9: teacher sees who uploaded | §9 Test page (live table) |
| Features 10: teacher sets when evaluation starts | §8 Start evaluation (now or scheduled) |
| Evaluation 1-4: Claude Code, 10-minute routine, agent per student, parallel setting, chaining, no new work while agents run | §12 |
| Evaluate a test 1-4: all files, test + barem + photos in context, per-exercise scoring with comments, flags | §12.5, §13, §14 |
| Final scoring 1-4: class table, statistics, strong/weak points, download, share, student files | §14, §9 Report pages |
| Tech stack 1-6: GitHub, Cloudflare Pages free, DB with history, cloud files on free tier, clean design with Laura Miron brand | §3, §4, §5, §16 |

## 3. Architecture

```
 Teacher browser ──(Cloudflare Access login)──► Pages: /admin/* (React app)
        │                                          │
        │  /api/admin/*  (Access JWT checked again)│
        ▼                                          ▼
 Student phone ──► Pages: /u/<token> (React app) ──► Pages Functions: /api/*  (Hono app)
                         /api/u/<token>/*                 │            │
                                                          ▼            ▼
                                                  D1 database "DB"   R2 bucket "FILES"
                                                          ▲
 GitHub Actions (every 10 min, or "evaluate-now")         │ /api/runner/*  (Bearer robot key)
   └─ node runner/run.ts ─────────────────────────────────┘
        └─ claude -p "/evaluate-test <mode>"  (one process per task, up to N in parallel)

 Pages Functions ──(repository_dispatch "evaluate-now")──► GitHub API
```

Parts:

- **Static apps**: two React apps built by Vite, as one multi-page build. The teacher app lives at `/admin/`. The student app lives at `/u/`. A small landing page lives at `/`.
- **API**: one Hono app, mounted by `functions/api/[[route]].ts`. `_routes.json` sends only `/api/*` to Functions, so static pages never run a Function.
- **D1** (`DB`): all data. **R2** (`FILES`): all files. Both are private. Files leave R2 only through the API.
- **Robot**: a Node 24 TypeScript script in `runner/`. GitHub Actions starts it. It talks to the API with a robot key and runs the Claude Code CLI.
- **Grading skill**: `.claude/skills/evaluate-test/`. It holds the grading rules. The teacher edits it without touching code.

## 4. Technology choices

| Area | Choice | Why |
|---|---|---|
| Hosting | Cloudflare Pages, free plan | Required by the spec. Same as the Website. Static requests are free and unlimited. |
| API | Pages Functions + Hono 4 (TypeScript) | Small, made for Workers. `app.request()` makes API tests simple. |
| Database | Cloudflare D1 | SQLite. Free: 5 GB per account, 500 MB per database, 5 M rows read/day, 100 k rows written/day. |
| Files | Cloudflare R2 | Free: 10 GB-month, 1 M Class A ops/month, 10 M Class B ops/month, no egress fees. Needs a one-time R2 subscription checkout (card or PayPal). |
| Teacher login | Cloudflare Access (Zero Trust free plan, up to 50 users) | Already used by the Website admin. No passwords in our code. |
| Frontend | React 19 + TypeScript + Vite (multi-page) | The teacher chose it. Many interactive screens. Shared types with the API and the robot. |
| Routing, data | React Router, TanStack Query | Standard. TanStack Query handles live polling and cache. |
| Validation, shared types | zod 4 | One schema gives TypeScript types, runtime checks, and the JSON Schema for Claude's output (`z.toJSONSchema`). |
| QR code | `qrcode.react` | Simple React component. |
| PDF | `pdfmake`, in the browser, loaded only on download | Reports always show the latest corrections. No server work. |
| Robot | Node 24 TypeScript (type stripping, no build) on GitHub Actions, public repo | The teacher chose GitHub cloud. Unlimited free minutes on a public repo. |
| AI | Claude Code CLI (`claude -p`), teacher's subscription via `CLAUDE_CODE_OAUTH_TOKEN` | Required by the spec. One-year token from `claude setup-token`. |
| Word files | `pandoc` in the robot (DOCX to Markdown with TeX math and images) | Claude reads Markdown math well. PDFs are read directly. |
| Tests | Vitest; jsdom + Testing Library for React; wrangler's `getPlatformProxy` (real local D1 and R2) for the API | The API tests run against the real local D1 and R2 engines. |

Versions are pinned in Plan 1. On 2026-10-06 the latest were: react 19.3, vite 8.3, vitest 5.0, typescript 7.0, hono 4.13, zod 4.6, wrangler 4.147, react-router 8.4, @tanstack/react-query 5.104, pdfmake 0.3, qrcode.react 4.2.

## 5. Free-tier budget

Assumptions: 5 classes, 30 students each, 1 test per class per month, 10 months per year.

| Resource | Use | Free limit | Margin |
|---|---|---|---|
| R2 storage | ~150 submissions/month × ~2.5 MB ≈ 0.4 GB/month ≈ 4 GB per school year | 10 GB | ~2 school years, then delete old years |
| R2 operations | < 10 k/month | 1 M Class A, 10 M Class B | > 99% free |
| Functions requests | < 2,000/day on busy days | 100,000/day | > 98% free |
| Functions CPU | light work only | 10 ms per request | see rule below |
| Request body | photos ≤ ~1 MB, files ≤ 25 MB | 100 MB | OK |
| D1 writes | < 2,000/day | 100,000/day | > 98% free |
| D1 size | < 50 MB/year | 500 MB per database | ~10 years |
| D1 queries per request | ≤ 15 per API call | 50 (free) | rule for the API |
| GitHub Actions | ~4,300 short checks/month + grading time | unlimited on public repos | OK |
| Claude | ~150 gradings + ~10 exercise lists + ~5 analyses per month | teacher's plan limits | robot pauses at the limit |

Rules that keep us inside the limits:

- Functions never do heavy CPU work. They do no image processing, no ZIP, and no PDF. The phone shrinks photos. The browser builds PDFs. The robot does the AI work.
- Photos are resized on the phone to at most 2000 px on the long side, JPEG quality 0.85.
- An API call makes at most 15 D1 queries. Use `db.batch()` for groups of writes.

## 6. Repository layout

```
quickeval/
  AGENTS.md                 project rules for agents (Claude Code reads it); src/, server/, runner/ have their own
  README.md
  Specifications.txt        the original request
  package.json  package-lock.json  .node-version (24)
  tsconfig.json             one strict config for app, API, shared, runner
  vite.config.ts            multi-page build: index.html, admin/index.html, u/index.html
  vitest.config.ts          projects: "web" (jsdom), "node" (shared, server, runner)
  wrangler.toml             Pages config: pages_build_output_dir = "dist", D1 + R2 bindings
  index.html                landing page entry
  admin/index.html          teacher app entry
  u/index.html              student app entry
  public/                   copied as-is: _routes.json, _redirects, _headers, favicon.svg
                            (_redirects uses the directory form "/admin/* /admin/ 200";
                            "/admin/* /admin/index.html 200" is refused as a redirect loop)
  src/
    ui/                     brand CSS, layout, shared components, Romanian strings
    admin/                  teacher app (routes, pages, API client)
    upload/                 student app
  functions/api/[[route]].ts   Pages entry: export const onRequest = handle(app)
  server/                   Hono app: routes, middleware, repositories, storage helpers
  shared/                   zod schemas, types, pure logic (codes, school year, scoring, stats)
  migrations/               D1 SQL migrations, numbered 0001_...
  runner/                   robot: check.ts, run.ts, api.ts, claude.ts, workdir.ts, ...
  .claude/skills/evaluate-test/   grading skill: SKILL.md + references/
  .github/workflows/        ci.yml (tests), evaluate.yml (robot)
  docs/deploy.md            deploy, secrets, the robot's GitHub settings
  docs/superpowers/         specs/ and plans/
```

Import rule: relative imports name the `.ts`/`.tsx` file (`import { x } from './y.ts'`). Node 24 needs this to run `runner/` and `shared/` without a build. Vite and wrangler accept it too. The tsconfig sets `allowImportingTsExtensions`, `noEmit`, `verbatimModuleSyntax`, and `erasableSyntaxOnly`.

## 7. Data model

### 7.1 D1 tables

All times are ISO 8601 UTC strings, for example `2026-10-06T08:15:00.000Z`. D1 enforces foreign keys.

```sql
CREATE TABLE teachers (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,              -- lowercase; equals the Access login email
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE classes (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  name TEXT NOT NULL,                      -- "6E2": A-Z and 0-9 only, 1-8 chars, uppercase
  school_year INTEGER NOT NULL,            -- 2026 means 2026-2027
  next_test_number INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (teacher_id, school_year, name)
);

CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  full_name TEXT NOT NULL,                 -- shown on the upload page as typed
  created_at TEXT NOT NULL
);

CREATE TABLE enrollments (                 -- a student in a class for one school year
  class_id INTEGER NOT NULL REFERENCES classes(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  active INTEGER NOT NULL DEFAULT 1,       -- 0: left the class; history stays
  PRIMARY KEY (class_id, student_id)
);

CREATE TABLE tests (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  class_id INTEGER NOT NULL REFERENCES classes(id),
  number INTEGER NOT NULL,                 -- the "1" in 6E2-26T1
  code TEXT NOT NULL,                      -- "6E2-26T1"
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',    -- draft | open | evaluating | done
  upload_token TEXT UNIQUE,                -- made by Start test
  started_at TEXT,
  evaluation_at TEXT,                      -- scheduled evaluation start, while open
  evaluation_started_at TEXT,
  test_file_key TEXT, test_file_name TEXT, test_file_type TEXT,
  barem_file_key TEXT, barem_file_name TEXT, barem_file_type TEXT,
  files_version INTEGER NOT NULL DEFAULT 0,  -- +1 with each new test or barem file (§11.3)
  exercise_list_json TEXT,
  exercise_list_status TEXT NOT NULL DEFAULT 'none',  -- none | ready | problem | accepted | failed
  exercise_list_message TEXT,
  exercise_list_attempts INTEGER NOT NULL DEFAULT 0,
  analysis_json TEXT,
  analysis_status TEXT NOT NULL DEFAULT 'none',       -- none | requested | ready | failed
  analysis_stale INTEGER NOT NULL DEFAULT 0,          -- 1: grades changed after the analysis
  analysis_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (teacher_id, code),
  UNIQUE (class_id, number)
);

CREATE TABLE submissions (                 -- one student's upload for one test
  id INTEGER PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id),
  status TEXT NOT NULL,                    -- uploading | submitted | grading | graded | failed
  session_hash TEXT UNIQUE,                -- SHA-256 hex of the device secret
  auto_submitted INTEGER NOT NULL DEFAULT 0, -- 1: included at evaluation start without Confirm
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  run_id TEXT,                             -- robot run that is grading it
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,                         -- short text for the teacher, max 500 chars
  graded_at TEXT,
  UNIQUE (test_id, student_id)
);

CREATE TABLE submission_files (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,              -- image/jpeg | image/png | image/webp | application/pdf
  size INTEGER NOT NULL,
  position INTEGER NOT NULL,               -- upload order, 1..20
  created_at TEXT NOT NULL
);

CREATE TABLE evaluations (                 -- one per graded submission
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  max_total REAL NOT NULL,                 -- from the exercise list
  office_points REAL NOT NULL,             -- "din oficiu"
  total REAL NOT NULL,                     -- sum of item points + office points (code)
  grade REAL NOT NULL,                     -- total * 10 / max_total, 2 decimals (code)
  needs_review INTEGER NOT NULL,           -- 1 if an item is flagged or a page is unreadable
  summary TEXT NOT NULL,
  strengths_json TEXT NOT NULL,            -- string[]
  recommendations_json TEXT NOT NULL,      -- string[]
  unreadable_json TEXT NOT NULL,           -- string[] of work-dir file names
  raw_json TEXT NOT NULL,                  -- the AI output as received
  model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE evaluation_items (            -- one per exercise per graded submission
  id INTEGER PRIMARY KEY,
  evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL,               -- from the exercise list, e.g. "I.1"
  position INTEGER NOT NULL,
  label TEXT NOT NULL,
  max_points REAL NOT NULL,
  ai_points REAL NOT NULL,
  points REAL NOT NULL,                    -- final points; equals ai_points until the teacher edits
  student_answer TEXT NOT NULL,
  comment TEXT NOT NULL,
  confidence TEXT NOT NULL,                -- high | medium | low
  needs_review INTEGER NOT NULL,
  review_reason TEXT NOT NULL,
  reviewed_at TEXT,                        -- set when the teacher marks it checked
  changed_by_teacher INTEGER NOT NULL DEFAULT 0,
  UNIQUE (evaluation_id, exercise_id)
);

CREATE TABLE settings (                    -- system-wide
  key TEXT PRIMARY KEY,                    -- max_parallel_agents | runner_key_hash
  value TEXT NOT NULL
);

CREATE TABLE runner_state (                -- exactly one row, id = 1
  id INTEGER PRIMARY KEY CHECK (id = 1),
  run_id TEXT,
  lease_acquired_at TEXT,
  heartbeat_at TEXT,
  last_check_at TEXT,
  last_run_finished_at TEXT,
  last_run_summary TEXT                    -- JSON: counts only
);
```

Migrations add the tables in the plan that needs them: Plan 1 adds `teachers`, `classes`, `students`, and `enrollments`. Plan 2 adds `tests`, `submissions`, and `submission_files`. Plan 3a adds `evaluations`, `evaluation_items`, `settings`, and `runner_state`. Plan 3b adds `tests.files_version`.

### 7.2 R2 layout (the "cloud folder" of a test)

```
t/<teacherId>/<schoolYear>/<testCode>/test/<safe-name>.<ext>
t/<teacherId>/<schoolYear>/<testCode>/barem/<safe-name>.<ext>
t/<teacherId>/<schoolYear>/<testCode>/students/<studentId>-<name-slug>/<nn>-<random8>.<ext>
```

Example: `t/1/2026/6E2-26T1/students/14-popescu-ana/01-k3f9q2xa.jpg`.

- `safe-name` and `name-slug` are lowercase ASCII. Diacritics are removed (ș→s, ț→t, ă→a, â→a, î→i). Characters other than a-z, 0-9, and dash become dashes.
- The database is the truth. The robot never lists R2 to find work. It asks the API.

### 7.3 Rules

- **Class name**: trim it, remove inner spaces, and make it uppercase. It must match `^[A-Z0-9]{1,8}$`. The UI shows it as "Clasa 6E2".
- **School year**: in Europe/Bucharest time, September to December of year Y belongs to school year Y. January to August belongs to Y-1. The UI shows "2026-2027".
- **Test code**: `<class name>-<YY>T<n>`, where YY is the last two digits of the class's school year and n is `classes.next_test_number`. The counter only goes up, so a deleted test never gives its number to a new test. Pattern: `^[A-Z0-9]{1,8}-\d{2}T\d{1,3}$`.
- **Grade**: `grade = round2(total * 10 / max_total)`, where `total = Σ points + office_points`. Code computes it, never Claude.
- **Times on screen**: the UI and the PDFs show every time in Europe/Bucharest time, in Romanian format (for example "6 oct. 2026, 10:15").

## 8. Test lifecycle

```
draft ──Start test──► open ──Start evaluation (now, or when evaluation_at comes)──► evaluating ──► done
  ▲                    ▲                                                              │          │
  │                    └──────────────────── Reopen uploads ◄────────────────────────┴──────────┘
  └ create (class + title)
```

### 8.1 Create

- Input: class (a list of the teacher's classes in the selected school year, not archived) and title (1-120 chars).
- The platform takes `classes.next_test_number` and builds the code, both in one batch. The new test has status `draft`.
- The test file and the barem can be uploaded on the create screen or later on the test page.

### 8.2 Start test (draft → open)

- Makes `upload_token`: 16 random chars from `a-z2-7` (80 bits).
- Sets `started_at` to now. This is the "date and hour" of the test.
- The test page then shows the link `https://<host>/u/<upload_token>`, a Copy button, and a QR code. A full-screen QR view works for the class projector.

### 8.3 Upload window

- Students can upload only while `status = 'open'`. At other times the student page shows a message.
- Every teacher and student API request, and the robot check, first runs `promoteDueTests(now)`. This starts the evaluation of open tests whose `evaluation_at` has passed: their uploads close at that time. So a scheduled test closes on time, even when the robot is late. It also ends the tests that have nothing left to grade (§8.5).

### 8.4 Start evaluation (open → evaluating)

- Needs: a test file, a barem file, and at least one submission with at least one file. Otherwise the button is off and shows the reason. A schedule needs only the two files, because the uploads may still come. At the scheduled time the uploads close even if nobody uploaded; a test with nothing to grade then ends at once.
- "Now": sets `status = 'evaluating'`, `evaluation_started_at = now`, and clears `evaluation_at`. Submissions in `uploading` that have at least one file become `submitted` with `auto_submitted = 1`. Uploading submissions with no files are left as they are. Then the API sends `repository_dispatch` with `event_type: "evaluate-now"`, so the robot starts in about 1 minute. If the GitHub token is missing, the robot starts at the next 10-minute check, and the UI says so.
- "Schedule": the teacher picks a future time, at most 60 days ahead; the browser sends it as a UTC ISO time. It is saved in `evaluation_at`. The test stays `open` until then (§8.3).

### 8.5 During and after evaluation

- The robot makes the exercise list, grades each submitted upload, then writes the class analysis (§12).
- `evaluating → done`: no submission is `submitted` or `grading`, and `analysis_status` is not `requested`. (Plan 4 decides when the first class analysis is asked for.)
- **Reopen uploads** (from evaluating or done): sets `status = 'open'` and clears `evaluation_at`. Graded results stay. New uploads get graded at the next **Start evaluation**. The analysis is then marked stale. An upload that the robot is grading goes back to `submitted`: the robot's result for it is refused, and a later robot run grades it after the next **Start evaluation**, with the files of that time.
- **Replace the test file or the barem**: allowed in any status except `evaluating`. While evaluating, it is allowed when the exercise list is `problem` or `failed`: the robot then reads neither file. A new barem clears the exercise list (`exercise_list_status = 'none'`). It does not regrade old results. Each new file adds 1 to `files_version`, so an exercise list that the robot made from the old files is refused (§11.3). The teacher uses Regrade for that.
- **Regrade** (one submission, or all graded submissions of the test): deletes their evaluations and sets them to `submitted`. If the test is `done`, it goes back to `evaluating`. If the test is `open`, the regrade waits for Start evaluation. The UI warns that teacher corrections will be lost.
- **Retry** (a `failed` submission): sets it to `submitted` with 0 attempts. If the test is `done`, it goes back to `evaluating`. Like Start evaluation, it asks GitHub to start the robot (§12.6); so does **Încearcă din nou** on a failed exercise list.
- **Analysis refresh rule**: each time a test enters `evaluating` (Start evaluation, Regrade, or Retry on a `done` test), an analysis that is `ready` or `failed` becomes `requested` with 0 attempts. So the robot writes a new analysis after the new grades. Teacher corrections only set `analysis_stale = 1`. The teacher then clicks **Regenerează** when she wants a new analysis.
- **Delete test**: needs a confirmation. It deletes the R2 files under the test prefix and all its rows. A robot result for a deleted test gets 404, and the robot drops it.

## 9. Teacher app (`/admin/`)

All screens are in Romanian. Routes use the teacher's base path `/admin`.

| Route | Screen | Main content |
|---|---|---|
| `/admin/` | Teste | Tests of the selected school year, newest first. Status chip, class, counts (uploaded/class size, graded, flags). Button "Test nou". |
| `/admin/teste/nou` | Test nou | Class list, title, optional test file and barem upload. |
| `/admin/teste/:code` | Test | See below. |
| `/admin/teste/:code/elevi/:submissionId` | Lucrarea elevului | Student files and the graded result (§14.1). |
| `/admin/teste/:code/raport` | Raport clasă | Class report (§14.2). |
| `/admin/clase` | Clase | Classes of the selected school year. Add a class (name, school year). Archive a class. |
| `/admin/clase/:id` | Clasa | Students: add one, paste many (one name per line), rename, mark as left. Tests of the class. |
| `/admin/elevi/:id` | Elev | History: every graded test of this student in every class and year, with grade and link. |
| `/admin/setari` | Setări | Parallel agents (1-4, default 1). Robot key: create or replace, shown once. Robot status. |

A school-year switch in the header (default: the current school year) filters Teste and Clase.

**Test page** (`/admin/teste/:code`):

- Header: code, class, title, status chip, date and hour (`started_at`).
- Files: test and barem. For each: upload/replace (PDF or `.docx`, ≤ 25 MB) and view.
- Actions, shown by status:
  - draft: **Începe testul** (Start test).
  - open: link with Copy button, QR code (full-screen view), **Pornește evaluarea** (now), **Programează** (pick a time), cancel the schedule.
  - evaluating/done: **Redeschide încărcarea** (Reopen uploads), **Recorectează tot** (Regrade all).
- Exercise-list banner, only when there is a problem:
  - `problem`: shows the message (for example "Punctajele din barem dau 9, nu 10"). Buttons: replace the barem, **Folosește oricum** (sets `accepted`).
  - `failed`: shows the message and a **Încearcă din nou** button (sets `none` and resets the attempts).
- Uploads table, refreshed every 10 s while the status is open or evaluating. One row per active student of the class: name, status (Nu a trimis / Încarcă… / Trimis / Se corectează / Corectat / Eroare), file count, time, grade, flag count. "Fără confirmare" marks `auto_submitted`. Row actions: view files and result, **Resetează** (delete the upload so the student can start again), **Reîncearcă** (failed → submitted), **Recorectează** (regrade).
- Robot line: "Robotul a verificat acum 3 min" from `runner_state.last_check_at`, while the test is evaluating or has a scheduled evaluation. It shows a warning after 30 min without a check.
- Link to the class report when at least one submission is graded.

## 10. Student app (`/u/<token>`)

Mobile first, large buttons, Romanian.

1. **Load**: `GET /api/u/<token>`. It returns the test (code, title, class name, status) and the active students of the class: `{ id, name, state }`, where state is `none`, `in_progress`, or `done`.
   - A token exists only after Start test, so a valid link never points to a draft test.
   - Unknown token: show "Link greșit. Cere profesorului linkul nou."
   - Status `evaluating` or `done`: show "Încărcarea s-a închis."
2. **Pick a name**: students in state `done` are shown with ✓ and cannot be picked. A tap on a name asks "Ești <name>?" first, because the upload then belongs to that name on this phone.
3. **Device lock**: `POST /api/u/<token>/sessions { studentId }`.
   - If the student has no upload yet: the API makes the submission (`uploading`) and a device secret (24 random bytes, base64url). It stores only the SHA-256 hash of the secret. The browser keeps the secret in `localStorage` under `qe.session.<token>.<studentId>`.
   - If this browser already has the secret for this student: the app goes on with it. When the link opens on a phone that holds an upload it has not sent yet, the app goes straight back to that upload; the upload screen then offers "Nu ești <name>? Alege alt nume", for a phone that students share.
   - If another device holds the upload: 409 with the message "Încărcarea a început pe alt telefon. Roagă profesorul să o reseteze."
   - Every later call sends the header `X-Upload-Session: <secret>`.
4. **Add files**: a "Fă o poză" button (camera) and an "Alege fișiere" button (photos and PDFs, many at once).
   - Accepted types: JPEG, PNG, WebP, PDF. Any other type (for example HEIC) gets the message "Trimite poze JPG sau PDF".
   - Photos are shrunk on the phone: at most 2000 px on the long side, JPEG quality 0.85. If the result is bigger than the original JPEG, the original is kept.
   - Limits: 20 files per student, 25 MB per file.
   - Each file is sent alone (`PUT /api/u/<token>/files`), with a progress bar and a retry button.
5. **Preview**: photos show as thumbnails. A tap opens the photo full-screen. A PDF shows as a row with its name and size: the student picked the file, and a PDF made in the page cannot open reliably in a new tab (Android downloads it, and the page's security policy can block it). Each file has a delete button until Confirm. The teacher opens every file, PDFs too, from the teacher app.
6. **Confirm**: "Am trimis tot" asks "Ești sigur? După confirmare nu mai poți schimba nimic." Then `POST /api/u/<token>/confirm`, and the status becomes `submitted`. The success screen shows the file count.
7. **Photo tips** on the upload screen: good light, the whole page in the frame, one page per photo, pages in order.

## 11. API

Base path `/api`. JSON in and out, except for file bodies. Errors have the shape `{ "error": "<code>", "message": "<Romanian text for the user>" }`.

### 11.1 Teacher: `/api/admin/*`

Auth: the Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`) is checked again in the API (RS256, issuer, audience, expiry). The email must match a row in `teachers`. Writes must send `Content-Type: application/json` (except file uploads), and are refused when they come from another site (`Sec-Fetch-Site`, `Origin`), as in the Website admin. Every query is scoped to the teacher's id.

| Method and path | Purpose |
|---|---|
| `GET /me` | The teacher (id, name, email). |
| `GET /classes?year=2026` | Classes of a school year, with active student counts. |
| `POST /classes` `{ name, schoolYear }` | Create a class. |
| `GET /classes/:id` | A class with its students (including inactive ones). |
| `PATCH /classes/:id` `{ name?, archived? }` | Rename or archive. |
| `POST /classes/:id/students` `{ names: string[] }` | Add students (1-60 names, each 1-80 chars after trimming; empty lines skipped). |
| `PATCH /classes/:id/students/:studentId` `{ active }` | Mark a student as left, or back. |
| `PATCH /students/:id` `{ fullName }` | Rename a student. |
| `GET /students/:id/history` | The student and all graded results (test code, title, class, date, grade). |
| `GET /tests?year=2026` | Tests list with counts. |
| `POST /tests` `{ classId, title }` | Create a draft test; returns the code. |
| `GET /tests/:code` | Test detail, uploads table, exercise-list status, robot line. (The analysis status comes with Plan 4.) |
| `PATCH /tests/:code` `{ title }` | Rename. |
| `DELETE /tests/:code` | Delete the test and its files. |
| `PUT /tests/:code/files/:kind` (`kind` = `test` or `barem`) | Raw body. Headers `Content-Type`, `Content-Length`, `X-File-Name` (URI-encoded). PDF or DOCX, ≤ 25 MB. |
| `GET /tests/:code/files/:kind` | Stream the file. |
| `POST /tests/:code/start` | draft → open. |
| `POST /tests/:code/evaluate` `{ at?: string }` | No `at`, or `at` in the past: start now. Future `at`: schedule. |
| `DELETE /tests/:code/schedule` | Cancel the schedule. |
| `POST /tests/:code/reopen` | Reopen uploads. |
| `POST /tests/:code/regrade` | Regrade all graded submissions. |
| `POST /tests/:code/exercise-list/accept` | problem → accepted. |
| `POST /tests/:code/exercise-list/retry` | failed → none, attempts = 0. |
| `POST /tests/:code/analysis/regenerate` | analysis_status → requested. If the test is `done`, it goes back to `evaluating`. |
| `GET /tests/:code/report` | Rows for the class report: students, items, totals, analysis. Statistics are computed in the browser with `shared/stats.ts`. |
| `GET /submissions/:id` | Submission, files, evaluation, and items. |
| `GET /submissions/:id/files/:fileId` | Stream a student file. |
| `POST /submissions/:id/reset` | Delete the files, the evaluation, and the row, so the student can start again. |
| `POST /submissions/:id/retry` | failed → submitted, attempts = 0. A `done` test goes back to `evaluating` (§8.5). |
| `POST /submissions/:id/regrade` | Regrade one submission. A `done` test goes back to `evaluating` (§8.5). |
| `PATCH /evaluation-items/:id` `{ points?, comment?, reviewed? }` | Teacher correction. `0 ≤ points ≤ max_points`, in steps of 0.05. Sets `changed_by_teacher`, recomputes the total and grade, and sets `analysis_stale = 1` when the analysis is ready. |
| `GET /settings` | Parallel agents, whether a robot key exists, `runner_state`, and the time of the last successful grading (`MAX(submissions.graded_at)`). |
| `PATCH /settings` `{ maxParallelAgents }` | An integer from 1 to 4. |
| `POST /settings/robot-key` | Makes a new robot key, shows it once, and stores its SHA-256 hash. |

### 11.2 Student: `/api/u/:token/*`

No login. The token must match a test. Calls that change data also need status `open` and a valid `X-Upload-Session`.

| Method and path | Purpose |
|---|---|
| `GET /api/u/:token` | Test info and the name list (§10). |
| `POST /api/u/:token/sessions` `{ studentId }` | Start or resume an upload (§10.3). |
| `GET /api/u/:token/files` | Files of this session's submission. |
| `PUT /api/u/:token/files` | Raw body. Headers `Content-Type`, `Content-Length`, `X-File-Name`. Checks type, size (≤ 25 MB), and count (≤ 20). |
| `GET /api/u/:token/files/:fileId` | Stream one of this session's own files (preview after a reload). |
| `DELETE /api/u/:token/files/:fileId` | Delete one of this session's own files (status `uploading` only). |
| `POST /api/u/:token/confirm` | uploading → submitted. Needs at least 1 file. |

### 11.3 Robot: `/api/runner/*`

Auth: `Authorization: Bearer <robot key>`. The API compares the SHA-256 of the key with `settings.runner_key_hash`, using a constant-time compare. Test and submission ids are numbers, never names.

| Method and path | Purpose |
|---|---|
| `POST /check` | Sends uploads left in `grading` by a run that is not alive back to `submitted`, runs `promoteDueTests`, sets `last_check_at`, returns `{ hasWork, exerciseLists, pendingGrading, analyses }` (counts). |
| `POST /lease` `{ runId }` | Takes the robot lease if it is free, stale (no heartbeat for 15 min), or already this run's. It then sets every `grading` submission of another run back to `submitted`, because a stale lease means the old run died. Returns `{ granted, maxParallel }`. |
| `POST /heartbeat` `{ runId }` | Keeps the lease. 409 if the lease belongs to another run. |
| `POST /release` `{ runId, summary }` | Frees the lease and saves the summary (counts only). 409 `lease_lost` if the lease belongs to another run. |
| `GET /tasks` | `{ exerciseLists: number[], pendingGrading: number, analyses: number[] }` (test ids). |
| `GET /tests/:id` | Id, `filesVersion`, file types (test, barem), exercise list. Only while the test is `evaluating` (else 404, as for a test that does not exist). The robot reads it before the files. |
| `GET /tests/:id/files/:kind` | Stream the test or barem file. Only while the test is `evaluating` (else 404). |
| `POST /tests/:id/exercise-list` `{ runId, filesVersion, ok: true, exerciseList } \| { runId, filesVersion, ok: false, error }` | Save the list, only from the run that holds the lease (else 409 `lease_lost`), only while the list is waited for, and only while `filesVersion` is still the test's (else 409 `not_needed`: the teacher replaced a file after the robot read the test). The API validates it (a broken list: 422 `invalid_result`) and sets `ready` or `problem`. On an error it adds 1 to the attempts (none for `usage_limit`) and sets `failed` at 3. |
| `POST /claim` `{ runId }` | Takes the `submitted` submission with the fewest attempts, the oldest first, of an `evaluating` test whose exercise list is `ready` or `accepted`, and sets it to `grading`, in one statement. Needs the lease (else 409 `lease_lost`). Never takes again a submission that a reopen took from this run (`reopenTest` keeps the run's id on it): the next run takes it. Returns `{ submissionId, testId, files: [{ id, contentType, position }] }`, or 204 when there is none. |
| `GET /submissions/:id/files/:fileId` | Stream a page of an upload in `grading` (else 404). |
| `POST /submissions/:id/result` `{ runId, ok: true, result, model } \| { runId, ok: false, error }` | Accepted only when the submission is `grading` and its `run_id` equals `runId`. Otherwise 409 `taken_over` (404 for a deleted submission), and the robot drops the result (another run took the work over). Save a result (§12.5): the API validates it (a broken result: 422 `invalid_result`), computes totals, and stores the evaluation and its items in one batch. `error` is `timeout`, `invalid_output`, `crash`, or `usage_limit`. On `usage_limit` the submission goes back to `submitted` with no attempt counted; else attempts + 1, and `failed` at 3. |
| `GET /tests/:id/results` | (Plan 4.) Anonymized class data for the analysis: "Elev 1..n", items, points, comments. No names. |
| `POST /tests/:id/analysis` `{ runId, ok: true, analysis } \| { runId, ok: false, error }` | (Plan 4.) Save the analysis (`ready`, `analysis_stale = 0`). On an error, attempts + 1, and `failed` at 3. Then the API checks whether the test is `done`. |

The body of an exercise list or a result is at most 1 MB (else 413 `too_large`), so the saved raw output stays far under D1's 2 MB row limit. The robot checks the size before it sends, and sends a bigger answer as `invalid_output`.

## 12. Evaluation robot

### 12.1 GitHub workflow `.github/workflows/evaluate.yml`

- Triggers:
  - `schedule: "*/10 * * * *"`: the 10-minute check.
  - `schedule: "23 4 * * 1"`: weekly, it turns the schedule back on, because GitHub turns it off after 60 days without repo changes. The Website uses the same fix.
  - `repository_dispatch` with type `evaluate-now`.
  - `workflow_dispatch`.
- Job `keep-on` (weekly trigger only): turns the schedule back on. Only this job has `actions: write`, and it checks out nothing.
- Job `robot`, with `contents: read` only:
  - `concurrency: { group: quickeval-robot, cancel-in-progress: false }`: only one robot runs at a time.
  - `timeout-minutes: 180`: the 120 minutes of taking new work, the last task (up to two Claude tries of 20 minutes), and the install.
- Steps of `robot`:
  1. Checkout with `persist-credentials: false`: Claude's tasks run in this job, so the checkout keeps no token. Set up Node 24.
  2. `node runner/check.ts`. It needs no npm install and writes `has_work=true|false` to `$GITHUB_OUTPUT`. While `QUICKEVAL_URL` or `QUICKEVAL_RUNNER_KEY` is missing, it finds no work and the run passes.
  3. Only if there is work: `npm ci --omit=dev` (the robot needs only zod), install a pinned Claude Code version (`npm install --global @anthropic-ai/claude-code@<version>`), install `pandoc` with apt, then `node runner/run.ts`.
- A run fails, and GitHub sends an email, when the API refuses the robot key or cannot be reached, when the Claude token is missing or Claude refuses it, when three tasks in a row fail (a wrong `QE_MODEL`, an outage), or when Claude Code or pandoc is missing. A usage limit is no failure: a later run goes on.
- Repo settings:
  - Variable `QUICKEVAL_URL` (for example `https://quickeval.pages.dev`).
  - Secrets `QUICKEVAL_RUNNER_KEY` and `CLAUDE_CODE_OAUTH_TOKEN`.
  - Optional variables `QE_MODEL` (default `opus`) and `QE_EFFORT` (default `high`).
- **Public logs**: the robot prints only run ids, numeric test and submission ids, counts, durations, and error categories. It never prints names, file names, grades, Claude output, or file content.

### 12.2 Run algorithm (`runner/run.ts`)

```
runId = random id
lease = POST /lease            → if not granted: exit 0 (another run is active)
heartbeat every 60 s           → if 409: stop taking new work, finish the current tasks, exit
budget = 120 min of taking new work
repeat:
  tasks = GET /tasks
  1. exercise lists: for each test id in tasks.exerciseLists, run the task "exercise-list" (one at a time, each test at most once per run)
  2. grading: keep up to maxParallel "grade" tasks running.
     Each free slot does POST /claim. When a task ends, its slot claims again at once.
     When /claim returns 204 and no task is running, grading is done.
  3. analyses: for each test id in tasks.analyses, run the task "class-report"  (Plan 4)
  until a round starts no new task, the budget is used, or the run stops taking work
release(summary)
```

- The run stops taking work at a usage limit, when it loses the lease, when Claude refuses the token, when the API fails, when Claude Code or pandoc is missing, or after three tasks in a row that fail (each counts an attempt), so a broken Claude cannot fail a whole class. The summary's `stop` says which: `done`, `budget`, `usage_limit`, `lease_lost`, `claude_login`, or `error`. The run fails (exit 1) when `stop` is `error` or `claude_login`. A refused token sends nothing for the task: the upload goes back to the queue at the next check, with no attempt counted.
- An exercise list that failed waits for the next run, so one broken barem cannot use up the budget. An upload whose grading failed is claimed after the uploads with fewer attempts.

- Exercise lists run before grading, because `/claim` only gives submissions of tests with a ready list.
- "No new work while agents run" (spec): the GitHub concurrency group allows one robot at a time. The D1 lease also blocks a second runner, for example a manual local run.

### 12.3 Work folder for a task

For each task, the robot makes `$RUNNER_TEMP/qe/<runId>/<task-id>/` (`exercise-list-<testId>` or `grade-<submissionId>`) and deletes it when the task ends. Claude's settings folder, `$RUNNER_TEMP/qe/<runId>/claude-config/`, sits next to the task folders, never inside one.

```
.claude/skills/evaluate-test/       copy of the repo skill
test/test.pdf        or test/test.md + test/media/...      (DOCX → pandoc)
barem/barem.pdf      or barem/barem.md + barem/media/...
exercises.json       (grade mode)    the exercise list
student/page-01.jpg, page-02.pdf ... (grade mode)    renamed by upload order; original names are never used
class-results.json   (class-report mode)   anonymized data from GET /tests/:id/results
```

DOCX conversion, run in the work folder with relative paths: `pandoc test/source.docx -t markdown --extract-media=test -o test/test.md` (the same for the barem), then the `.docx` file is removed. Pandoc's own Markdown keeps "a)" and "b)" items, which GitHub's Markdown renumbers as "1)" and "2)". Math becomes TeX between `$`. Pictures land in `test/media/`, and the Markdown links them from the work folder.

The robot gives Claude no names from the database. The folder uses numbers, and the original file names are replaced. Claude does see any name that a student wrote on the paper, because it reads the pages.

### 12.4 Claude invocation

```
claude -p "/evaluate-test <mode>" \
  --output-format json \
  --json-schema '<draft-07 JSON Schema of the mode: claudeJsonSchema() in shared/schemas.ts>' \
  --model "$QE_MODEL" --effort "$QE_EFFORT" \
  --tools "Read,Glob" --restricted \
  --permission-mode dontAsk --permission-prompts none \
  --no-session-persistence \
  --max-turns 40
```

- The working directory is the task folder, so Claude Code finds the skill and no repo `CLAUDE.md` or `AGENTS.md`.
- The environment holds `CLAUDE_CODE_OAUTH_TOKEN`. Never pass `--bare`: bare mode ignores that token. Never pass `--safe-mode`: it turns skills off.
- `--json-schema` takes a draft-07 schema: Claude Code refuses zod's default (draft 2020-12).
- `--restricted` keeps Claude's file tools inside the work folder. Without it, Read opens any file of the machine, and student pages are untrusted input.
- The robot passes Claude only the variables it needs to start (`PATH`, `HOME`, the temp folders, the token, `CLAUDE_CONFIG_DIR`), never the robot key or an API key.
- The robot reads the JSON on stdout. An error also prints JSON and exits with code 1; a refused login comes with `subtype: "success"` and `is_error: true`. On success, the robot takes `structured_output` and checks it with the same checks as the API (`checkExerciseList`, `checkGrading`) before it sends it.
- Every run starts Claude with `CLAUDE_CONFIG_DIR` set to an empty folder and `CLAUDE_CODE_OAUTH_TOKEN` set to the teacher's token, on GitHub and on her PC (`npm run try:skill`, a manual robot run). Then a personal setup (output style, global `CLAUDE.md`, plugins) cannot change the result.
- Time limits: exercise list 10 min, grading 20 min, class report 15 min. At the limit, the robot sends SIGINT to Claude's process group, then SIGTERM after 10 s, then SIGKILL after 10 s more.
- Error types:
  - `usage_limit`: the plan limit was reached. The task is retryable, no attempt is counted, and the run stops taking new work.
  - `timeout`.
  - `invalid_output`: no answer (also `--max-turns` reached), or an answer that the checks refuse. One more try with the same input, then an error.
  - `crash`.
  - A refused token is not an error of the task: the run stops (§12.2).
- Plan 3b's spike checked this command on the teacher's PC with Claude Code 2.1.294: the skill loads with `--tools "Read,Glob"` and `--restricted`, JPEG, PNG, and PDF pages and Word pictures are read, and `structured_output` comes back filled. Its outputs are in `runner/fixtures/`. A usage-limit output could not be made: the robot finds it by HTTP 429 or by the words of Claude Code's limit messages.

### 12.5 Contracts (zod, in `shared/schemas.ts`)

```ts
// Mode "exercise-list": made once per test from the test and the barem.
ExerciseList = {
  totalPoints: number,            // e.g. 10 or 100: the maximum including "din oficiu"
  officePoints: number,           // e.g. 1 or 10; 0 if none
  exercises: Array<{
    id: string,                   // as in the barem: "I.1", "II.2.a" — unique
    label: string,                // Romanian, e.g. "Subiectul I, exercițiul 1"
    maxPoints: number,            // > 0
    answer: string,               // expected final answer(s), plain text
    scoringNotes: string,         // partial-credit rules from the barem
    topic: string                 // short topic tag, e.g. "Fracții echivalente"
  }>,                             // 1..60 items, in barem order
  notes: string                   // anything unclear in the barem; "" if none
}

// Mode "grade": one student.
GradingResult = {
  items: Array<{
    exerciseId: string,           // must be an id from the exercise list
    points: number,
    studentAnswer: string,        // what the student wrote, short, plain text
    comment: string,              // Romanian, to the student: what is right, what is wrong, why
    confidence: "high" | "medium" | "low",
    needsReview: boolean,
    reviewReason: string          // Romanian, for the teacher; "" when needsReview is false
  }>,
  unreadable: string[],           // work-folder file names that could not be read
  summary: string,                // Romanian, 2-4 sentences, to the student
  strengths: string[],            // 0-5
  recommendations: string[]       // 1-5
}

// Mode "class-report": the whole class, anonymized.
ClassAnalysis = {
  overview: string,
  strengths: string[],            // topics most students did well
  weaknesses: string[],           // topics with many mistakes
  commonMistakes: string[],
  recommendations: string[]       // what to practice next with the class
}
```

Checks done by code, not by Claude:

- **Exercise list**: the points are rounded to cents first. The ids are unique and every `maxPoints` is > 0. When `Σ maxPoints + officePoints ≠ totalPoints`, the status becomes `problem`, with the message "Punctajele din barem dau X, dar totalul este Y."
- **Grading**:
  - Every exercise id appears exactly once, and there are no unknown ids. A broken result counts as `invalid_output`.
  - Points are rounded to 2 decimals. Points outside `[0, maxPoints]` are clamped and flagged with the reason "Punctaj în afara intervalului", before the robot's own reason.
  - `confidence = "low"` always means `needsReview = true`.
  - A non-empty `unreadable` list sets `evaluations.needs_review = 1`.
  - Code computes the total and the grade (§7.3).
- All text fields are limited in length: comment ≤ 1000 chars, summary ≤ 1500 chars, list entries ≤ 300 chars. Code cuts a longer text (it ends with "…") instead of refusing the result, so one long comment never wastes a grading.

### 12.6 Robot key and "Evaluate now"

- The teacher makes the robot key in Setări (`POST /settings/robot-key`). She copies it once into the GitHub secret `QUICKEVAL_RUNNER_KEY`.
- "Evaluate now" uses `GITHUB_REPO` (`owner/name`) and `GITHUB_DISPATCH_TOKEN`, from the Cloudflare Pages settings. The token is a fine-grained GitHub token for this one repo, with Contents: read and write. The call is `POST https://api.github.com/repos/<GITHUB_REPO>/dispatches` with `{ "event_type": "evaluate-now" }` and a `User-Agent` header. GitHub refuses calls without a User-Agent.

## 13. Grading skill (`.claude/skills/evaluate-test/`)

- `SKILL.md` describes three modes, chosen by the argument (`$ARGUMENTS`): `exercise-list`, `grade`, and `class-report`. For each mode it says which files to read (§12.3) and what to return. The JSON shape is forced by `--json-schema`. The skill explains the meaning of each field.
- `references/grading-rules.md` holds the teacher's rules:
  - Romanian test conventions: subjects, "din oficiu", partial points from the barem.
  - Give partial points only as the barem allows.
  - A correct final answer without the work the barem asks for gets only the points for the answer.
  - Flag the item (do not guess) when the handwriting cannot be read, the page is cut, or the method is not in the barem.
  - Comments are kind, short, specific, and in Romanian, written to the student as "tu".
  - Math in comments is plain Unicode (x², √, ≤, ½), never LaTeX, because the PDFs cannot draw LaTeX.
- The teacher can edit these files. A commit to `main` changes the robot's behavior from the next run.
- To try the skill on her PC the same way as the robot, she runs `npm run try:skill -- exercise-list <folder>`, then `npm run try:skill -- grade <folder>`, with `CLAUDE_CODE_OAUTH_TOKEN` set to her token. The folder holds `test.pdf` (or `.docx`), `barem.pdf` (or `.docx`), and the pages in `student/`, in number order (`1.jpg`, `2.jpg`, …). The script (`runner/trySkill.ts`) builds the work folder of §12.3 and runs the robot's command (§12.4) with an empty settings folder. The first mode writes `exercises.json` into the folder, the second `grading.json`, and both print the result. A normal interactive Claude Code session would load her personal settings, so its result can differ from the robot's.
- The repo is public, so the skill is public. It must never contain student data.
- Plan 3b ships a first version. The teacher can then replace or extend it. `runner/skill.test.ts` checks that the skill still names the files of the work folder and every field of the answers.

## 14. Reports, statistics, export

### 14.1 Student result (`/admin/teste/:code/elevi/:submissionId`)

- Left (on a phone: top): the student's files. Photos show inline with zoom. PDFs show in a frame, with a download link.
- Right: a table of the exercises (label, max, AI points, final points, student answer, comment, confidence). A flagged row has a yellow highlighter background, the review reason, an input to change the points, and a **Verificat** button. The total and the grade update after each change.
- Below: summary, strengths, recommendations.
- Buttons:
  - **Descarcă PDF** (pdfmake, in the browser).
  - **Trimite**: Web Share API with the PDF file. If sharing is not possible, the PDF is downloaded.
  - **Recorectează**.
- The student PDF contains: test code and title, student name, date, grade, exercise table, summary, strengths, and recommendations. An item that is flagged and not yet checked shows "în verificare". Review reasons are for the teacher only and never go into the PDF.

### 14.2 Class report (`/admin/teste/:code/raport`)

- Table: one row per graded student, one column per exercise, then total and grade. Flagged cells are marked. Students who did not upload are listed below the table.
- Statistics (`shared/stats.ts`, pure functions):
  - graded count / active students;
  - average, median, minimum, and maximum grade;
  - grade groups 1-4.99, 5-6.99, 7-8.99, 9-10;
  - per exercise: average points, average % of max, and how many students got full, partial, or zero points;
  - number of flagged items not yet checked.
- AI analysis: overview, strengths, weaknesses, common mistakes, recommendations. When `analysis_stale = 1`, the page shows "Analiza poate fi depășită" and a **Regenerează** button.
- Buttons: **Descarcă PDF** (landscape: table, statistics, analysis), **Descarcă CSV**, **Trimite** (the PDF).
- CSV for Romanian Excel: UTF-8 with BOM, `;` as the separator, and a decimal comma.

### 14.3 PDF fonts

pdfmake gets a font with full Romanian letters (ă â î ș ț, comma-below forms U+0219 and U+021B). Plan 4 checks this with a test that builds a PDF with these letters.

## 15. Security and privacy

- **Teacher login**: one Cloudflare Access application on the Pages host. It covers only the paths `/admin` and `/api/admin`. Paths `/u`, `/api/u`, and `/api/runner` must stay outside Access: otherwise students and the robot get a login page. The API checks the JWT again (a port of the Website's `_middleware.js` logic). The API settings are `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`.
- **Local development**: the API accepts `DEV_TEACHER_EMAIL` (from `.dev.vars`, git-ignored) only when the request host is `localhost` or `127.0.0.1`. Production never sets it.
- **Secrets**:
  - upload token: 80 bits;
  - device secret: 192 bits, stored as a SHA-256 hash;
  - robot key: 256 bits, stored as a SHA-256 hash and compared in constant time.
- **R2** has no public access. Every file read goes through the API with the right auth and an ownership check.
- **Minimal data**: student names only. No emails, no ID numbers, no birth dates.
- **Claude** sees the test files, the barem, and the student pages with the file names replaced. The robot sends no names from the database, and the class analysis uses "Elev 1..n". Names that students write on their papers are visible to Claude, because it reads the pages.
- **Expired teacher login**: when the Access session ends, a call to `/api/admin/*` gets a redirect to the Access login page instead of JSON. The teacher API client sends its requests with `redirect: 'manual'`. An `opaqueredirect` response, or a response that is not JSON, means "login expired": the app reloads the page, and Access shows its login.
- **Public repo**: code and skill only. Logs show ids and counts only (§12.1).
- **Consent**: students' handwritten work goes to Anthropic for grading and passes through GitHub's temporary machines. The school decides whether parents must agree. No page in the app tells students that AI grades the work. This is the teacher's decision.
- **Deletion**: deleting a test deletes its files and rows. A "left" student keeps their history.

## 16. UI and brand

- Copy the brand from `D:\Projects\Website`:
  - colour tokens from `assets/css/style.css` (light "notebook" and dark "chalkboard");
  - fonts "Atkinson Hyperlegible Next" and "Caveat";
  - the Laura Miron mark (`favicon.svg`, the `assets/img/brand/` variants);
  - the squared-paper background.
- The theme follows the system and has a switch. The choice is saved in `localStorage['quickeval.theme']`. A script in the page head applies it before the first paint, as in the Website.
- Accessible: real buttons and labels, focus rings, contrast ≥ 4.5:1, touch targets ≥ 44 px on the student app.
- Layout: a header with the brand and "QuickEval", the school-year switch, and the navigation (Teste, Clase, Setări). A footer with the name of the teacher.

## 17. Testing

- `shared/`: unit tests for every pure function: codes, school year, slugs, scoring, statistics, CSV, and the schema checks.
- `server/`: route tests through `app.request(path, init, env)`. `env` comes from wrangler's `getPlatformProxy({ persist: false })`, which reads the bindings from `wrangler.toml`, with the migrations applied. Each test file gets a fresh in-memory database. There is no direct `miniflare` dependency: its newest version changed its options format. The Access verifier has its own unit tests, with an RSA key made in the test.
- `src/`: component and flow tests with jsdom and Testing Library, for the forms, the upload flow, and the tables. The API client is replaced by a fake.
- `runner/`: tests with a fake API client and a fake Claude executor. They cover the pool limit N, chaining, lease loss, usage-limit stop, timeouts, and the work-folder layout.
- Manual checks at the end of each plan, on a local dev server and then on the live site.
- CI (`.github/workflows/ci.yml`) runs on every push and pull request: `npm ci`, `npm run typecheck`, `npm test`.
- The Cloudflare Pages build runs `npm run build`, and the build includes the typecheck.

## 18. Deployment and operations

Each step below that creates something outside this PC is done only after the teacher says yes.

1. **GitHub**: a public repo, for example `parameciul/quickeval`. The GitHub CLI on this PC is logged in as `parameciul`.
2. **Cloudflare** (the same account as the Website):
   - a Pages project `quickeval` connected to the repo; build `npm run build`, output `dist`, Node 24 from `.node-version`;
   - preview deployments turned off: only `main` deploys. Top-level bindings in `wrangler.toml` also apply to previews, so a preview would use the production D1 and R2 on a host that Access does not cover. If previews are needed later, they must first get their own D1 and R2 through `[env.preview]` in `wrangler.toml`;
   - D1 database `quickeval`, created with location hint `weur`;
   - R2 bucket `quickeval-files`, created with location hint `weur` (first: the one-time R2 subscription checkout);
   - bindings in `wrangler.toml`: `DB` and `FILES`;
   - Pages settings: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `GITHUB_REPO`, `GITHUB_DISPATCH_TOKEN`.
3. **Access**: in the Website's Zero Trust team, one self-hosted application "QuickEval admin", with the paths `/admin` and `/api/admin` and a policy that allows the teachers' emails.
4. **First teacher**: `npx wrangler d1 execute quickeval --remote --command "INSERT INTO teachers (email, name, created_at) VALUES (lower('<teacher email>'), 'Laura Miron', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"`. Replace `<teacher email>` with the email she uses for the Access login.
5. **Robot**: GitHub variable `QUICKEVAL_URL`, secrets `QUICKEVAL_RUNNER_KEY` (from Setări) and `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`).

Operations, written down in `docs/deploy.md`:

- Renew `CLAUDE_CODE_OAUTH_TOKEN` every year. The Setări page shows the date of the last successful grading.
- Each September: check R2 usage and delete old school years if needed.
- D1 Time Travel keeps 7 days of history on the free plan.

## 19. Delivery plans

Each plan ends with working, tested software. Each one gets its own file in `docs/superpowers/plans/`.

1. **Foundation, classes, students**:
   - repo scaffold (Vite multi-page React + TS, Hono on Pages Functions, D1 migrations, Vitest + `getPlatformProxy`, CI);
   - brand shell;
   - Access login, the `/me` endpoint, and the expired-login reload (§15);
   - classes and students (API and UI, school-year switch, paste many names);
   - deployment of the foundation.
   - Result: the teacher logs in at `/admin` and manages classes and students on the live site.
2. **Tests and student upload**:
   - create a test (class + title), codes, test and barem upload to R2;
   - test page, Start test, link and QR;
   - the student app (names, device lock, photo shrinking, upload, preview, confirm);
   - the live uploads table, file viewing, reset, reopen;
   - R2 setup.
   - Result: students upload from phones, and the teacher sees who did.
3. **Evaluation robot**, in two plans:
   - **3a**: zod contracts and their checks; the robot API with lease, claim, and results; Start evaluation (now or scheduled), Evaluate now, and Setări (parallel agents, robot key, robot status). Result: the teacher closes tests on time, and the API is ready for the robot.
   - **3b**: the spike (§12.4); the JSON Schemas; `runner/` with the pool, work folders, pandoc, Claude runs, and checks; the first grading skill and the `npm run try:skill` script (§13); `evaluate.yml`. It also does the 3a follow-ups that the robot needs: `files_version`, a reopen sends uploads in grading back to the queue, exercise-list points in cents, and a 1 MB limit on robot bodies. Result: tests are graded automatically.
4. **Review and reports**:
   - the student result page (flags, corrections, Verificat, Regrade);
   - the class analysis task in the robot (the `ClassAnalysis` contract, `GET /tests/:id/results`, `POST /tests/:id/analysis`, Regenerează);
   - the class report (table, statistics, analysis);
   - PDFs (Romanian font), CSV, Share;
   - the student history page;
   - the operations notes in `docs/deploy.md`.
   - Result: v1 is complete.

## 20. Risks

| Risk | Mitigation |
|---|---|
| Handwriting is misread | Confidence and flags, teacher review, photo tips, regrade. The robot never guesses an unreadable page. |
| Claude plan usage limit | Parallel agents default to 1. The robot pauses and continues later, and no work is lost. |
| GitHub schedule is late or turned off | "Evaluate now" dispatch, the weekly turn-on step, and the robot line on the test page. |
| Claude Code flags change | Pinned CLI version in the workflow, the spike of Plan 3b, and deliberate updates. |
| Free-tier limits change | Numbers checked on 2026-10-06. The budget keeps wide margins (§5). |
| Public repo | No data in the repo. Logs show ids only. Secrets live only in GitHub and Cloudflare settings. |
| Students upload for each other | Device lock, ✓ for finished names, and teacher reset. |

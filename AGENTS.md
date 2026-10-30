# AGENTS.md

QuickEval: a web app that helps Laura Miron (math teacher, Liceul William Shakespeare, Timișoara) collect and grade her students' math tests. The teacher pages and the student pages are in Romanian. Code, comments, and docs are in English.

- Design: `docs/superpowers/specs/2026-10-06-quickeval-design.md`. Plans: `docs/superpowers/plans/`.
- Live: https://quickeval.pages.dev/. Brand source: the "Matematică cu Laura Miron" site (`D:\Projects\Website`, https://lauramiron.pages.dev/).
- More instructions: `src/AGENTS.md`, `server/AGENTS.md`, `runner/AGENTS.md` (read the one for the area you change), and `docs/deploy.md` (deploy, secrets, the robot's GitHub settings).

## Structure

- `index.html` (landing page), `admin/index.html` (teacher app, `/admin/`), `u/index.html` (student app, `/u/<token>`).
- `src/`: the two React apps (`admin/`, `upload/`), shared UI (`ui/`), test helpers (`test/`).
- `functions/api/[[route]].ts`: the Cloudflare Pages entry for `/api/*`; it serves the Hono app from `server/app.ts`.
- `server/`: the API (routes, D1 queries, auth, R2 files, secrets, emails).
- `shared/`: code for the API, the browser, and the robot: zod request schemas and response types (`api.ts`), roles and the demo limit (`accounts.ts`), school year, class and student names, ids, test codes (`tests.ts`), file rules and R2 keys (`files.ts`), the robot's output contracts and their JSON Schemas (`schemas.ts`), points and grades (`scoring.ts`), robot API bodies (`runner.ts`).
- Payments with Stripe Checkout: `docs/payments.md`.
- `migrations/`: D1 SQL migrations, numbered. One statement per `;` at a line end (the test helper splits on that), and no `;` inside strings.
- `public/`: copied as-is into `dist/` (`_routes.json`: only `/api/*` runs Functions; `_redirects`, `_headers`, `theme.js`, `favicon.svg`, `robots.txt`). `_redirects` must use the directory form `/admin/* /admin/ 200` and `/u/* /u/ 200`: Wrangler refuses `/admin/* /admin/index.html 200` as a redirect loop.
- `scripts/`: `seed-local.sql` (the local teacher, an administrator), `setPassword.ts` (`npm run set-password -- <email> [--local]`: an account's password straight in D1), `smoke.mjs` (checks a running local server, with one full upload graded by a pretend robot).
- `runner/`: the grading robot (spec §12), run by `.github/workflows/evaluate.yml`. `.claude/skills/evaluate-test/`: its grading skill (spec §13).
- `runner/print/`: the print container (pinned LibreOffice and the QR stamp) that makes the test's print PDF.

## Commands

- `npm test`: all tests (Vitest projects "web" and "node"). `npm run typecheck`: one strict config for everything. `npm run build`: typecheck, then the Vite build into `dist/`.
- `npm run db:local`: apply the migrations to the local D1 and add the local teacher.
- `npm run dev:api` and `npm run dev:web` (two terminals): hot reload at http://localhost:5173/admin/. A started test's student page is at `http://localhost:5173/u/<token>`.
- `npm run db:local`, then `npm run preview`, then `npm run smoke` in a second terminal: the production build on http://127.0.0.1:8788 and its smoke test. Each smoke run leaves one class with one student in the local database, and makes a new local robot key.
- `npm run try:skill`: try the grading skill on this PC (see `runner/AGENTS.md`).
- Claude Code preview servers (`.claude/launch.json`): `api` (8788) and `web` (5173) for development, `preview` (8788) for the production build.

## Rules

Details and the remaining rules are in the nested `AGENTS.md` files.

- All user-facing text is Romanian. The API reports errors as `{ error, message }`; the UI shows `message`.
- No page tells students that AI grades their work. Student-app tests check every screen with `expectNoGradingWords()`.
- Teachers log in with email and password (`server/routes/auth.ts`, a `qe_session` cookie). Setări and `/api/admin/settings` and `/api/admin/accounts` are for administrators only (`adminOnly` in `server/auth/teacherAuth.ts`). A new account confirms its email, then is pending and demo. Every time a test goes to the robot for grading (a start, or a regrade or retry of a finished test) counts in `teachers.tests_evaluated`, for every teacher, by a trigger (migration 0018); a demo account may do it `DEMO_TEST_LIMIT` times, checked in the SQL of every such path (`WITHIN_DEMO_LIMIT` in `server/db/lifecycle.ts`).
- Every teacher query is scoped by the teacher's id. Ids from URLs go through `parseId`, test codes through `parseTestCode`.
- Student and robot writes, and the teacher's corrections, check their own rules inside their SQL statement (`server/db/links.ts`, `server/db/runner.ts`, `server/db/evaluations.ts`), never in a check before the write.
- Every `/api/admin` and `/api/u` request first runs the `promoteDue` middleware. A router added under them keeps it.
- R2 is private: every file goes through the API with an ownership check. R2 keys come from rows, never from listing R2.
- Functions: at most 10 ms of CPU and 15 D1 queries per request. Group writes with `db.batch()`.
- The robot's Claude reads only its work folder and gets no robot key and no API key. Robot answers and logs carry no names.
- The PDFs and the CSV are made in the browser (`src/admin/pdf/`, `shared/csv.ts`). The student's PDF is made from `StudentPdfInput`, which has no confidence and no review reason; the CSV guards every text cell against formulas.
- Every path that makes work for the robot starts it (`startRobot`): the GitHub schedule does not fire. This includes "Regenerează" (the class analysis).
- A print job is an open test with a test file and no print PDF; every path that makes one starts the robot.
- Times are stored as ISO 8601 UTC strings (`nowIso()` or `new Date(x).toISOString()`: SQL compares them as text) and shown in Europe/Bucharest time. School year Y runs from September of Y to August of Y+1.
- Relative imports name the `.ts` or `.tsx` file. TypeScript runs with `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties.
- A new migration runs on the live database before the code that needs it reaches `main` (`docs/deploy.md`).
- Commits have no AI attribution lines. Code comments name no ticket or issue numbers.

## Gotchas

- npm blocks install scripts. After a fresh install, run `npm approve-scripts workerd esbuild`.
- Development happens on Windows. CI runs on Linux.
- On Windows, stopping a background `npm run preview` or `npm run dev:api` job can leave `workerd.exe` listening on its port. A new server then seems to start but answers with old data, or requests hang. Check with `netstat -ano | findstr :8788` and end the leftovers in PowerShell:

  ```powershell
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*\Projects\QuickEval\node_modules*' -or $_.CommandLine -like '*npm-cli.js*run preview*' -or $_.CommandLine -like '*npm-cli.js*run dev:*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  ```

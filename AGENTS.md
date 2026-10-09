# AGENTS.md

QuickEval: a web app that helps Laura Miron (math teacher, Liceul William Shakespeare, Timișoara) collect and grade her students' math tests. The teacher pages and the student pages are in Romanian. Code, comments, and docs are in English.

- Design: `docs/superpowers/specs/2026-10-06-quickeval-design.md`
- Plans: `docs/superpowers/plans/`
- Live: https://quickeval.pages.dev/
- Brand source: the "Matematică cu Laura Miron" site (`D:\Projects\Website`, https://lauramiron.pages.dev/)

## Structure

- `index.html`: the landing page. `admin/index.html`: the teacher app entry (React, served under `/admin/`). `u/index.html`: the student app entry (served under `/u/<token>`).
- `src/ui/`: brand CSS (colours from the Laura Miron site), brand mark, theme switch, Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time).
- `src/admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (files, link, evaluation controls, the barem warning (`ExerciseListBanner.tsx`), the robot line, the uploads table). `pages/SettingsPage.tsx` is Setări.
- `src/upload/`: the student app. `api.ts` (the only code that calls `/api/u`, with XMLHttpRequest for upload progress), `session.ts` (the phone's secret in localStorage), `shrink.ts` (photos made smaller on the phone).
- `src/test/`: test setup, the fake APIs (`fakeApi.ts`, `fakeUploadApi.ts`), `renderAdmin()`, `expectNoGradingWords()`.
- `functions/api/[[route]].ts`: the Cloudflare Pages entry for `/api/*`. It serves the Hono app from `server/app.ts`.
- `server/`: the API. `routes/` (HTTP: `admin.ts` and its parts, `upload.ts` for students, `runner.ts` for the robot), `db/` (D1 queries; `lifecycle.ts` starts, schedules, promotes, and ends evaluations; `runner.ts` holds the robot's queries), `auth/` (Cloudflare Access login, and `robotAuth.ts` for the robot key), `http.ts` (JSON bodies, ids, codes, same-origin writes, the `promoteDue` middleware), `errors.ts` (`ApiError`), `uploads.ts` (file bodies in and out of R2), `secrets.ts` (tokens, keys, and hashes), `dispatch.ts` ("Evaluate now": GitHub's repository_dispatch), `test/` (API test helper and fixtures).
- `shared/`: code for the API, the browser, and the robot: zod request schemas and response types (`api.ts`), school year, class names, student names, ids, test codes (`tests.ts`), file rules and R2 keys (`files.ts`), the robot's output contracts, their checks, and their JSON Schemas for Claude (`schemas.ts`), points and grades (`scoring.ts`), the robot API bodies (`runner.ts`).
- `migrations/`: D1 SQL migrations, numbered. One statement per `;` at a line end (the test helper splits on that), and no `;` inside strings.
- `public/`: copied as-is into `dist/`: `_routes.json` (only `/api/*` runs Functions), `_redirects`, `_headers`, `theme.js`, `favicon.svg`, `robots.txt`.
- `scripts/`: `seed-local.sql` (the local teacher), `smoke.mjs` (checks a running local server, including one full upload and its grading by a pretend robot).
- `runner/`: the grading robot (spec §12), run by `.github/workflows/evaluate.yml`. `check.ts` (is there work?), `run.ts` (one run: lease, heartbeat, exercise lists, parallel gradings), `tasks.ts` (make an exercise list, grade one upload), `claude.ts` (starts Claude Code and reads its answer), `workdir.ts` (a task's work folder; Word files through pandoc), `api.ts` (the only code that calls `/api/runner`), `log.ts`, `trySkill.ts` (`npm run try:skill`), `fixtures/` (real Claude outputs), `test/` (the API in-process, a scripted Claude).
- `.claude/skills/evaluate-test/`: the grading skill (spec §13). The teacher may change its words; the robot copies it into every work folder. `runner/skill.test.ts` checks the file and field names that the code needs.

## Commands

- `npm test`: all tests (Vitest projects "web" and "node").
- `npm run typecheck`: TypeScript, one strict config for everything.
- `npm run build`: typecheck, then the Vite build into `dist/`.
- `npm run db:local`: apply the migrations to the local D1 and add the local teacher.
- `npm run dev:api` and `npm run dev:web` (two terminals): develop with hot reload at http://localhost:5173/admin/. A started test's student page is at `http://localhost:5173/u/<token>`.
- `npm run db:local`, then `npm run preview`, then `npm run smoke` in a second terminal: the production build on http://127.0.0.1:8788 and its smoke test, which also plays the robot. Each smoke run leaves one class with one student in the local database, and makes a new local robot key.
- `npm run try:skill -- exercise-list <folder>`, then `npm run try:skill -- grade <folder>`: try the grading skill on this PC exactly as the robot runs it (spec §13). It needs `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) in the environment and never uses this PC's Claude login. The folder holds `test.pdf` or `test.docx`, `barem.pdf` or `barem.docx`, and the pages in `student/` (`1.jpg`, `2.jpg`, …); it gets `exercises.json` and `grading.json`. Keep the folder outside the repo: it holds a student's pages.

## Rules

- All user-facing text is Romanian. The API reports errors as `{ error, message }`; the UI shows `message`.
- No page tells students that AI grades their work. Student-app tests check every screen with `expectNoGradingWords()`.
- Every teacher query is scoped by the teacher's id. Ids from URLs go through `parseId`, test codes through `parseTestCode`.
- Student calls are scoped by the test of the link's token, and an upload by the hash of the phone's secret (`X-Upload-Session`) within that test. Only hashes of secrets are stored.
- Each student write checks its own rules inside its SQL statement (`server/db/links.ts`: the test is open and its scheduled time has not come, the upload is not sent yet, at most 20 files; confirm is one `db.batch()`). Never turn these into a check before the write: two requests at once would get past it. Starting an upload still checks the open test in its route (`server/routes/upload.ts`), before `createSubmission` inserts (see `docs/superpowers/plans/plan-3a-followups.md`).
- The same holds for the robot (`server/db/runner.ts`): a claim, an exercise list, and a result check the lease or the run inside their SQL. `/check` and `/lease` send uploads left in grading by a dead run back to the queue. An exercise list is saved only while the test's `files_version` is the one the robot read before the files. A run never claims again an upload that a reopen took from it (`reopenTest` keeps that run's id): the next run grades it.
- The robot's Claude reads only its work folder (`--tools "Read,Glob" --restricted`) and gets only the variables it needs to start (`claudeEnv` in `runner/claude.ts`): never the robot key, never an API key. Student pages are untrusted input.
- `runner/check.ts` runs before `npm ci`, and `runner/run.ts` after `npm ci --omit=dev`: check.ts loads no package, and run.ts loads only zod. Import types from `shared/` with `import type`: an import with only `{ type X }` still loads its module. `runner/check.test.ts` and `runner/run.test.ts` prove both.
- Robot answers carry ids, counts, and file types, never names: a student's page goes out as `file-<id>`. The robot's logs are public: it logs through `runner/log.ts` only ids, counts, durations, and error categories, never Claude's text or messages.
- Every `/api/admin` and `/api/u` request first runs `promoteDueTests` (the `promoteDue` middleware), so a scheduled test closes on time. A router added under them keeps it.
- R2 is private: every file goes through the API with an ownership check. The database is the truth: R2 keys come from rows, never from listing R2.
- Times are stored as ISO 8601 UTC strings and shown in Europe/Bucharest time. Write them with `nowIso()` or `new Date(x).toISOString()`: SQL compares them as text. The schedule input takes Romania's time (`src/ui/bucharestTime.ts`). School year Y runs from September of Y to August of Y+1.
- Functions do no heavy CPU work (10 ms of CPU per request on the free plan) and make at most 15 D1 queries per request. Group writes with `db.batch()`. Adding students uses a fixed number of queries, whatever the number of names; the uploads table is one query.
- Relative imports name the `.ts` or `.tsx` file. TypeScript runs with `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties.
- Commits have no AI attribution lines. Code comments name no ticket or issue numbers.

## Gotchas

- npm blocks install scripts. After a fresh install, run `npm approve-scripts workerd esbuild`.
- `_redirects` must use the directory form `/admin/* /admin/ 200` and `/u/* /u/ 200`. Wrangler refuses `/admin/* /admin/index.html 200` as a redirect loop.
- The Vite dev proxy keeps the Host header (`changeOrigin: false`). Otherwise the API refuses every write as cross-site.
- API tests use wrangler's `getPlatformProxy` (`server/test/testApi.ts`). Do not add `miniflare` as a direct dependency: its newest version changed its options format.
- `getPlatformProxy`'s R2 refuses a request-body stream ("must have a known length"). The API reads an upload with `arrayBuffer()` (after checking `Content-Length` ≤ 25 MB) and stores the bytes; production works the same way.
- Local login: `.dev.vars` sets `DEV_TEACHER_EMAIL`. The API accepts it only for requests to localhost or 127.0.0.1.
- Page tests that check a navigation use `expectLocation()`: it waits, because the navigation follows the API answer.
- In an API test, a test set straight to `evaluating` with no upload `submitted` or `grading` turns `done` on the next request: every request ends the tests that have nothing left to grade. Add a waiting upload first.
- API tests may fake the clock with `vi.useFakeTimers({ toFake: ['Date'] })`: only Node's clock changes, and the local engine keeps working. `startTestApi({ app: { dispatchRobot } })` replaces the GitHub call; `setRobotKey()` and `robotRequest()` in `server/test/fixtures.ts` call the robot API.
- `claude --json-schema` refuses zod's default JSON Schema (draft 2020-12): give it `claudeJsonSchema()` from `shared/schemas.ts` (draft-07).
- Word files go through `pandoc -t markdown`, never `-t gfm`: GitHub's Markdown turns "a)" items into "1)", and the exercise names are lost.
- A Claude error prints JSON and exits with code 1; a refused login has `subtype: "success"` and `is_error: true`. `readOutcome` (`runner/claude.ts`) reads them in that order; `runner/fixtures/` holds real outputs. Claude Code writes files into `CLAUDE_CONFIG_DIR`: keep that folder next to the work folders, never inside one.
- Robot tests run the real API in-process (`runner/test/robotWorld.ts`) and replace Claude with `scriptedClaude()` (`runner/test/scriptedClaude.ts`). `runner/workdir.test.ts` also runs the real pandoc when it is installed.
- Development happens on Windows. CI runs on Linux.
- On Windows, stopping a background `npm run preview` or `npm run dev:api` job can leave `workerd.exe` listening on its port. A new server then seems to start but answers with old data, or requests hang. Check with `netstat -ano | findstr :8788` and end the leftovers in PowerShell:

  ```powershell
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*\Projects\QuickEval\node_modules*' -or $_.CommandLine -like '*npm-cli.js*run preview*' -or $_.CommandLine -like '*npm-cli.js*run dev:*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  ```

## Deploy

- Cloudflare Pages project `quickeval`, connected to the GitHub repo. Every push to `main` deploys. Build command `npm run build`, output `dist`, Node version from `.node-version`. Preview deployments are off: they would share the production database and bucket.
- `wrangler.toml` is the source of truth for bindings: D1 `DB` → database `quickeval`, R2 `FILES` → bucket `quickeval-files`.
- Settings `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are Pages secrets: `npx wrangler pages secret put <NAME> --project-name quickeval`. A new secret applies from the next deployment. `GITHUB_REPO` and the Pages secret `GITHUB_DISPATCH_TOKEN` (spec §12.6) let "Pornește evaluarea", "Reîncearcă" (one upload), and "Încearcă din nou" (the exercise list) start the robot at once; without them, the robot starts at its next check.
- A new migration runs on the live database before the code that needs it: `npx wrangler d1 migrations apply quickeval --remote`. A new binding's resource (a bucket, a database) exists before the code that binds it reaches `main`.
- Cloudflare Access ("QuickEval admin") protects only `/admin` and `/api/admin`. Student pages (`/u`, `/api/u`) and the robot (`/api/runner`) must stay outside it.
- CI (`.github/workflows/ci.yml`) runs the typecheck, the tests, and the build on every push and pull request.
- The robot (`.github/workflows/evaluate.yml`) runs every 10 minutes, on "evaluate-now", and by hand (GitHub, Actions, evaluate, Run workflow). Its GitHub settings (Settings, Secrets and variables, Actions): the variable `QUICKEVAL_URL` (`https://quickeval.pages.dev`), the secrets `QUICKEVAL_RUNNER_KEY` (Setări, "Fă o cheie nouă") and `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`; it lasts a year: renew it before), and optional variables `QE_MODEL` (default `opus`) and `QE_EFFORT` (default `high`). Without the variable or the key, every run finds no work and passes.
- A robot run fails, and GitHub sends an email, when the API refuses the key or cannot be reached, when `CLAUDE_CODE_OAUTH_TOKEN` is missing or Claude refuses it (Setări then says "tokenul Claude nu mai merge"), when three tasks in a row fail (a wrong `QE_MODEL`, an outage), or when Claude Code or pandoc is missing. A usage limit is no failure: a later run goes on.
- Claude Code is pinned in `evaluate.yml`. To update it: install the new version on this PC, run `npm run try:skill` with it, then change the pin. A model that needs a newer Claude Code makes every task fail: the run stops after three failures in a row.

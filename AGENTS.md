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
- `shared/`: code for the API, the browser, and the robot: zod request schemas and response types (`api.ts`), school year, class names, student names, ids, test codes (`tests.ts`), file rules and R2 keys (`files.ts`), the robot's output contracts and their checks (`schemas.ts`), points and grades (`scoring.ts`), the robot API bodies (`runner.ts`).
- `migrations/`: D1 SQL migrations, numbered. One statement per `;` at a line end (the test helper splits on that), and no `;` inside strings.
- `public/`: copied as-is into `dist/`: `_routes.json` (only `/api/*` runs Functions), `_redirects`, `_headers`, `theme.js`, `favicon.svg`, `robots.txt`.
- `scripts/`: `seed-local.sql` (the local teacher), `smoke.mjs` (checks a running local server, including one full upload and its grading by a pretend robot).

## Commands

- `npm test`: all tests (Vitest projects "web" and "node").
- `npm run typecheck`: TypeScript, one strict config for everything.
- `npm run build`: typecheck, then the Vite build into `dist/`.
- `npm run db:local`: apply the migrations to the local D1 and add the local teacher.
- `npm run dev:api` and `npm run dev:web` (two terminals): develop with hot reload at http://localhost:5173/admin/. A started test's student page is at `http://localhost:5173/u/<token>`.
- `npm run db:local`, then `npm run preview`, then `npm run smoke` in a second terminal: the production build on http://127.0.0.1:8788 and its smoke test, which also plays the robot. Each smoke run leaves one class with one student in the local database, and makes a new local robot key.

## Rules

- All user-facing text is Romanian. The API reports errors as `{ error, message }`; the UI shows `message`.
- No page tells students that AI grades their work. Student-app tests check every screen with `expectNoGradingWords()`.
- Every teacher query is scoped by the teacher's id. Ids from URLs go through `parseId`, test codes through `parseTestCode`.
- Student calls are scoped by the test of the link's token, and an upload by the hash of the phone's secret (`X-Upload-Session`) within that test. Only hashes of secrets are stored.
- Each student write checks its own rules inside its SQL statement (`server/db/links.ts`: the test is open and its scheduled time has not come, the upload is not sent yet, at most 20 files; confirm is one `db.batch()`). Never turn these into a check before the write: two requests at once would get past it. Starting an upload still checks the open test in its route (`server/routes/upload.ts`), before `createSubmission` inserts (see `docs/superpowers/plans/plan-3a-followups.md`).
- The same holds for the robot (`server/db/runner.ts`): a claim, an exercise list, and a result check the lease or the run inside their SQL. `/check` and `/lease` send uploads left in grading by a dead run back to the queue.
- Robot answers carry ids, counts, and file types, never names: a student's page goes out as `file-<id>`. The robot's logs are public.
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

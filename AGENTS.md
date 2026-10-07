# AGENTS.md

QuickEval: a web app that helps Laura Miron (math teacher, Liceul William Shakespeare, Timișoara) collect and grade her students' math tests. The teacher pages and the student pages are in Romanian. Code, comments, and docs are in English.

- Design: `docs/superpowers/specs/2026-10-06-quickeval-design.md`
- Plans: `docs/superpowers/plans/`
- Live: https://quickeval.pages.dev/
- Brand source: the "Matematică cu Laura Miron" site (`D:\Projects\Website`, https://lauramiron.pages.dev/)

## Structure

- `index.html`: the landing page. `admin/index.html`: the teacher app entry (React, served under `/admin/`).
- `src/ui/`: brand CSS (colours from the Laura Miron site), brand mark, theme switch, Romanian number words.
- `src/admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake.
- `src/test/`: test setup, the fake API (`fakeApi.ts`), `renderAdmin()`.
- `functions/api/[[route]].ts`: the Cloudflare Pages entry for `/api/*`. It serves the Hono app from `server/app.ts`.
- `server/`: the API. `routes/` (HTTP), `db/` (D1 queries), `auth/` (Cloudflare Access login), `http.ts` (JSON bodies, ids, same-origin writes), `errors.ts` (`ApiError`), `test/testApi.ts` (API test helper).
- `shared/`: code for both the API and the browser: zod request schemas and response types (`api.ts`), school year, class names, student names.
- `migrations/`: D1 SQL migrations, numbered. One statement per `;` at a line end (the test helper splits on that), and no `;` inside strings.
- `public/`: copied as-is into `dist/`: `_routes.json` (only `/api/*` runs Functions), `_redirects`, `_headers`, `theme.js`, `favicon.svg`, `robots.txt`.
- `scripts/`: `seed-local.sql` (the local teacher), `smoke.mjs` (checks a running local server).

## Commands

- `npm test`: all tests (Vitest projects "web" and "node").
- `npm run typecheck`: TypeScript, one strict config for everything.
- `npm run build`: typecheck, then the Vite build into `dist/`.
- `npm run db:local`: apply the migrations to the local D1 and add the local teacher.
- `npm run dev:api` and `npm run dev:web` (two terminals): develop with hot reload at http://localhost:5173/admin/.
- `npm run preview`, then `npm run smoke` in a second terminal: the production build on http://127.0.0.1:8788 and its smoke test.

## Rules

- All user-facing text is Romanian. The API reports errors as `{ error, message }`; the UI shows `message`.
- No page tells students that AI grades their work.
- Every teacher query is scoped by the teacher's id. Ids from URLs go through `parseId`.
- Times are stored as ISO 8601 UTC strings. School year Y runs from September of Y to August of Y+1, in Europe/Bucharest time.
- Functions do no heavy CPU work (10 ms of CPU per request on the free plan) and make at most 15 D1 queries per request. Group writes with `db.batch()`. Adding students uses a fixed number of queries, whatever the number of names.
- Relative imports name the `.ts` or `.tsx` file. TypeScript runs with `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties.
- Commits have no AI attribution lines. Code comments name no ticket or issue numbers.

## Gotchas

- npm blocks install scripts. After a fresh install, run `npm approve-scripts workerd esbuild`.
- `_redirects` must use `/admin/* /admin/ 200`. Wrangler refuses `/admin/* /admin/index.html 200` as a redirect loop.
- The Vite dev proxy keeps the Host header (`changeOrigin: false`). Otherwise the API refuses every write as cross-site.
- API tests use wrangler's `getPlatformProxy` (`server/test/testApi.ts`). Do not add `miniflare` as a direct dependency: its newest version changed its options format.
- Local login: `.dev.vars` sets `DEV_TEACHER_EMAIL`. The API accepts it only for requests to localhost or 127.0.0.1.
- Development happens on Windows. CI runs on Linux.
- On Windows, stopping a background `npm run preview` or `npm run dev:api` job can leave `workerd.exe` listening on its port. A new server then seems to start but answers with old data, or requests hang. Check with `netstat -ano | findstr :8788` and end the leftovers in PowerShell:

  ```powershell
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*\Projects\QuickEval\node_modules*' -or $_.CommandLine -like '*npm-cli.js*run preview*' -or $_.CommandLine -like '*npm-cli.js*run dev:*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  ```

## Deploy

- Cloudflare Pages project `quickeval`, connected to the GitHub repo. Every push to `main` deploys. Build command `npm run build`, output `dist`, Node version from `.node-version`. Preview deployments are off: they would share the production database.
- `wrangler.toml` is the source of truth for bindings: D1 `DB` → database `quickeval`.
- Settings `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are Pages secrets: `npx wrangler pages secret put <NAME> --project-name quickeval`. A new secret applies from the next deployment.
- A new migration runs on the live database before the code that needs it: `npx wrangler d1 migrations apply quickeval --remote`.
- Cloudflare Access ("QuickEval admin") protects only `/admin` and `/api/admin`. Student pages (`/u`, `/api/u`) and the robot (`/api/runner`) must stay outside it.
- CI (`.github/workflows/ci.yml`) runs the typecheck, the tests, and the build on every push and pull request.

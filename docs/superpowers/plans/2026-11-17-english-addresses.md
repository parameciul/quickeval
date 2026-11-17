# English addresses: plan, priorities and risks

Date: 2026-11-17. Status: decision 1 = A (owner, 2026-11-17). P0, P1a and P1b merged (PR #112). P2 and P3 merged (PR #114). P4 merged (PR #115); its cleanup, which removes the old API paths, built on branch `feature/remove-old-api-paths` (2026-11-18). Left: the indexing steps, after the cleanup's deploy.

## Goal

MQGrader starts with Romanian teachers and later goes international. Every address
part must be English now: page paths, API paths, query parameters and their values,
and `#` anchors. Only the text that people read stays Romanian (later: translated).
A rename gets more expensive every week, because copies of the old address spread
to places we do not control: printed paper, search indexes, sent emails, bookmarks.

The priorities below follow that rule: **first what spreads fastest, not what has the
most code.**

## What is Romanian today (inventory)

| Area | Romanian today | Who holds a copy of the old address |
|---|---|---|
| Public pages (indexed) | `/ghid/`, `/barem/`, `/despre/`, `/preturi/` (live since 2026-11-10) | Google, Bing/IndexNow, AI crawlers, `sitemap.xml`, `llms.txt`, Search Console, share cards, Rybbit stats |
| Anchors on public pages | landing `#cum`, `#intrebari`, `#ajutor`, `#contact`, `#mai-multe`, the `Cuprins` ids on `/ghid/` and `/barem/` | answer engines that quote a section |
| Student result page | `/u/rezultat/<token>` (`studentResultPath` in `shared/api.ts`, `routeOf` in `src/upload/main.tsx`) | **the result ticket's QR code and saved ticket image** (PR #111, live today), links that teachers copied and sent |
| Teacher app routes | `teste/nou`, `teste/:code`, `teste/:code/elevi/:id`, `teste/:code/raport`, `teste/:code/verificare`, `clase`, `clase/:id`, `elevi/:id`, `cautare`, `setari`, `cont`, `confirma-email`, `parola-noua` (`src/admin/AppRoutes.tsx`) | sent emails (`server/routes/auth.ts`: confirm, settings, new password), bookmarks, open tabs. Not indexed (noindex). |
| Query parameters | `lucrare`, `punct` (value `pagini`), `clasa`, `arhivate`, `vedere` (value `toate`), `arata`, `tab` (values `robotul`, `corectarea`, `altceva`), `plata` (values `reusita`, `anulata`; `PAYMENT_RETURN_PARAM` in `shared/payments.ts`) | bookmarks; **Stripe Checkout sessions that are open during a deploy** (`plata`) |
| Teacher hash anchors | `#pregatire`, `#tiparire`, `#in-clasa`, `#corectare`, `#verificare`, `#rezultate` (`src/admin/stages.ts`) | bookmarks, links inside the app |
| API paths | `POST /api/u/:token/cod`, `GET /api/u/rezultat/:resultToken[/files/:fileId]`, every path with `barem` (`/:code/barem/checked`, `/barem/generate`, `/barem-notes`, `/files/barem` as a `:kind` value) and `ces` (`/:code/ces/...`, `/:id/ces`, `/ces/off`) | only our own front end, but **open tabs keep the old JavaScript** after a deploy |
| Internal names | DB values and columns: `subject` codes (`matematica` … `romana`, `engleza`, `alta`), `barem_*` and `ces_*` columns, R2 key segment `barem/`, the robot's output contract (`shared/schemas.ts`) and the grading skill | the live D1, R2, the robot. No user sees them. |

Already English: `/teacher/`, `/u/<token>` (the QR code printed on every test), `/try/<token>`,
`/try/<token>/phone` (the old `/telefon` already redirects), the robot's `/api/runner`,
almost all of the API, the DB status values.

## Glossary (decide once, use everywhere)

Two Romanian domain words sit inside otherwise English names. Pick one English word
for each and use it in paths, API names, code and docs:

| Romanian | English (proposed) | Note |
|---|---|---|
| barem | `marking-scheme` in URLs, `markingScheme` in code | "rubric" is the US word; the Romanian exam world maps to the UK "marking scheme" |
| CES (cerințe educaționale speciale) | `sen` (special educational needs) | never shown to a student, so only a code name |
| lucrare | `paper` | already the word in code |
| punct (one exercise item) | `item` | already the word in the API (`/items/:itemId`) |

## Decisions for the owner

1. **Public pages: where Romanian lives.**
   - **A (chosen 2026-11-17):** English slugs at the root now (`/guide/`, `/marking-scheme/`, `/about/`, `/pricing/`). Later languages go under a prefix (`/en/guide/`) with `hreflang`. The same slug in every language makes `hreflang` easy. The landing page `/`, which has the most ranking, does not move.
   - B: move the Romanian pages under `/ro/` now. Cleaner for many languages, but it moves the landing page too, and it is a second change if a new domain comes later.
2. **Internal names (DB, R2, robot contract).**
   - **Leave them (recommended).** Map them at the API edge only if an outside client ever needs English values. See risk R6.
   - Rename them in a later phase.

## Phases

Each phase is one branch and one PR. Each redirect gets two tests: the old address
lands on the new one, and the new one works.

### P0: stop the bleeding (today, 10 minutes)

Add one rule to `AGENTS.md` (Rules): *paths, query parameters and their values, `#`
anchors, API paths and fields are English; only text that people read is Romanian.*
Today this rule lives only in memory, so new work keeps adding Romanian names
(`/cod` and `/rezultat` arrived this week).

### P1: what spreads outside our control (this week)

**P1a. The four public pages.** They are one week old, so they have almost no
ranking yet. This is the cheapest moment they will ever have.

- Move `ghid/`, `barem/`, `despre/`, `preturi/` to `guide/`, `marking-scheme/`,
  `about/`, `pricing/` (folders, `vite.config.ts` inputs, `src/landing/` styles).
- `public/_redirects`: 301 from each old path, with and without the slash
  (`/ghid` and `/ghid/` → `/guide/`). Put them above the SPA rules.
- In each page: `canonical`, `og:url`, JSON-LD `url` and `@id`, the footer
  cross-links, the links from the landing page.
- Every file that links to the four pages today (grep of 2026-11-17, docs left out):
  `index.html`, `ghid/index.html`, `barem/index.html`, `despre/index.html`,
  `preturi/index.html`, `vite.config.ts`, `src/landing/partials.ts`,
  `src/upload/StudentHeader.tsx` (the student pages' "Despre" link),
  `public/sitemap.xml`, `public/llms.txt`, `scripts/smoke.mjs`, `AGENTS.md` (the
  structure section **and** the student-pages rule that names `/despre/`),
  `src/AGENTS.md`, and the tests `src/landing/landing.test.ts`,
  `src/landing/pages.test.ts`, `src/landing/robots.test.ts`,
  `src/upload/ResultApp.test.tsx`, `src/upload/StudentHeader.test.tsx`,
  `src/upload/UploadApp.test.tsx`. Also `public/_headers` (comment) and
  `docs/seo-audit-mqgrader-ro.md`. Grep again before the work starts.
- Rename the `Cuprins` `id`s on `/guide/` and `/marking-scheme/` and the landing
  anchors (`#how`, `#faq`, `#benefits`, `#contact`, `#more`) in the same pass.
- The share cards move too (`og-guide.png` etc.), with a 301 from each old name.
- After deploy: `npm run indexnow` (it reads only `sitemap.xml`, so it announces the new URLs), submit the sitemap again in
  Google Search Console and Bing, "Request indexing" on the 4 new URLs, write the
  switch date in `docs/analytics.md` (the Rybbit page history splits there).
- Tests: a unit test reads `public/_redirects` and checks each old path; the existing
  page tests change their paths. Check in `npm run preview` with the browser pane.

**P1b. The student result page.** The QR code on the ticket holds the full
`/u/rezultat/<token>` URL, and students save the ticket as an image. Every day
adds tickets that must work for years.

- `studentResultPath` returns `/u/result/<token>`.
- Keep `/u/rezultat/<token>` working **for ever**. Two ways work (built: the first, in `src/upload/route.ts`):
  - `routeOf` in `src/upload/main.tsx` accepts `result` and `rezultat` (one line,
    tested with Vitest). This is the simple choice.
  - Or a `_redirects` rule `/u/rezultat/* /u/result/:splat 301`. It must go
    **above** `/u/* /u/ 200`, because the first matching rule wins.
- API: add `GET /api/u/result/:resultToken[/files/:fileId]` and `POST /api/u/:token/code`.
  Keep `rezultat` and `cod` as aliases for one release (open tabs), then remove.
- Tests: both paths open the result page; the ticket QR holds the new URL.

### P2: teacher app routes (next 1–2 weeks)

Not indexed, so no SEO risk. The risk is links in sent emails and bookmarks.

- Built without a module of path builders: once the paths are English they are final, so the paths were renamed where they are written.
- New routes: `tests/new`, `tests/:code`, `tests/:code/papers/:submissionId`,
  `tests/:code/report`, `tests/:code/review`, `classes`, `classes/:id`,
  `students/:id`, `search`, `settings`, `account`, `confirm-email`, `new-password`.
- Built: one module, `src/admin/legacyAddress.ts`, turns an old path, query and hash into the English ones (exact maps, so an email token in the hash never changes), and `AppRoutes` and the try's routes send an old address there before the login check. The report page's anchors (`#pe-scurt`, `#rezultate`, `#exercitii`, `#analiza`) became `#summary`, `#results`, `#exercises`, `#analysis` too.
- Keep every old path as a router redirect (`<Navigate replace>`, like
  `ReviewRedirect` today) that keeps the rest of the path, the query and the hash
  (the email tokens are in the hash). Keep them for ever: they cost nothing.
- The email links in `server/routes/auth.ts` and `server/routes/accounts.ts` use the
  new paths.
- Tests: one test per old path (lands on the new one, with query and hash kept).

### P3: query parameters and in-app anchors (with P2 or right after)

- `lucrare`→`paper`, `punct`→`item` (`pagini`→`pages`), `clasa`→`class`,
  `arhivate`→`archived`, `vedere`→`view` (`toate`→`all`), `arata`→`show`,
  `tab` values `robotul`→`robot`, `corectarea`→`grading` (`altceva` was only an unknown tab in a test, never an address).
- Stage anchors: `#pregatire`→`#prepare`, `#tiparire`→`#print`, `#in-clasa`→`#in-class`,
  `#corectare`→`#grading`, `#verificare`→`#review`, `#rezultate`→`#results`.
- Read old and new names; write only new ones. One small helper per page, so the
  old names are read in one place.
- **`plata`:** a Stripe Checkout session open at deploy time returns with
  `?plata=reusita|anulata`. Accept both names at least 24 hours (a Checkout session
  lives at most 24 h). Then the old name may go, or stay as a cheap fallback.
- Tests: old and new names give the same view.

### P4: API paths (after P2–P3)

- `barem` → `marking-scheme` in paths (`/:code/marking-scheme/checked`,
  `/marking-scheme/generate`, `/marking-scheme-notes`, `/files/marking-scheme`).
- `ces` → `sen` in paths (`/:code/sen/...`, `/:id/sen`, `/sen/off`).
- The browser is the only client, and Cloudflare Pages ships the front end and the
  Functions together. Keep the old paths as aliases (open tabs with old JavaScript),
  then remove them. Built: `server/routes/oldPaths.ts` (`withOldPath`,
  `fileKindOfPath`) and the Quick Try `ALLOWED` list take both names.
- When the old paths go: a few hours after the deploy (owner, 2026-11-17: three
  teachers use the app). A tab still on the old app then gets an error with the
  reload button; one reload fixes it. The cleanup PR also removes the `/rezultat`
  and `/cod` API aliases of P1b, never the `/u/rezultat/<token>` page path, and
  `parseFileKind` then reads `testFileKindOfPath` alone (until then a mixed path such
  as `/sen/files/barem` answers too, which is harmless).
- Done 2026-11-18 (branch `feature/remove-old-api-paths`): `server/routes/oldPaths.ts`
  is gone, the routes and the `ALLOWED` list take only the English names, and
  `parseFileKind` reads `testFileKindOfPath`. A test checks that the old paths
  answer 404.
- The robot's paths (`/api/runner/…`, `files/barem`, `?variant=ces`) stay: only
  the robot calls them, and its run may use the code of an older commit.
- Map the URL values to the internal values at the route: `/files/marking-scheme`
  reads as the internal kind `barem`. `TestFileKind`, `RobotWorkKind`, the R2 keys
  (`testFileKey`) and the robot bodies (`shared/runner.ts`) stay as they are.
  Renaming those is P5, not P4.
- Keep the `promoteDue` middleware on every new router (AGENTS.md rule).
- JSON field names in responses (`barem`, `ces*`): rename only with the API paths,
  in the same PR, or leave them (they are not addresses).
- Tests: the existing route tests move to the new paths; one test per alias.

### P5 (optional, only with decision 2 = rename): internal names

DB values and columns, R2 key segments, the robot's output contract and the
grading skill. Not recommended now: see R6.

## Risks for current users

| # | Risk | Who is hit | Likelihood | Mitigation |
|---|---|---|---|---|
| R1 | A saved or printed result ticket stops working | students | high if we drop `rezultat` | keep `rezultat` in `routeOf` for ever; test it |
| R2 | Ranking of the 4 pages drops for a few weeks | new teachers from search | low (pages are 1 week old) | 301 for every old form, canonical and sitemap at once, IndexNow, Search Console; do it now, not later |
| R2b | `/marking-scheme/` loses the word "barem" from the URL for Romanian searches | new teachers from search | low (a small signal) | the title, the H1 and the text still say "barem" |
| R3 | A `_redirects` rule loses to an older file or rule | everyone on old links | medium | Cloudflare uses the first matching rule: put specific rules above `/teacher/* /teacher/ 200`; delete the old folders so no file answers the old path; **check in `npm run preview` before the PR** (do not assume) |
| R4 | A link in a sent email (confirm, new password, settings) gives "not found" | teachers who sign up or reset now | medium | router redirects keep path, query and hash; keep them for ever |
| R5 | An open tab with old JavaScript calls an API path that is gone | students uploading, teachers working | medium during the deploy hour | aliases for one release; remove in a later PR |
| R6 | A DB rename breaks live code or loses triggers | everyone | high | SQLite must rebuild a table to change a `CHECK`; a rebuild drops that table's triggers without a warning (`teacher_versions`, the counters of 0018 and 0019, the 0032 version triggers). And the migration runs live before the code, so the old code meets the new values. Recommendation: do not rename DB or R2 values |
| R7 | A Stripe payment returns to a page that ignores the result | the payer | low | accept `plata` and the new name for at least 24 h |
| R8 | Bookmarks of in-app anchors and filters open the default view | teachers | low | read old names too |
| R9 | Rybbit shows two rows for one page | owner | certain, harmless | note the switch date in `docs/analytics.md` |
| R10 | Search Console shows "Page with redirect" for the old URLs | owner | certain, harmless | expected; it clears in a few weeks |

## A bigger risk than the slugs: the domain

`.ro` is a country domain. Google targets it to Romania, and no setting changes that.
For real reach outside Romania, a generic domain (for example `.com` or `.app`) matters
more than English slugs. Decide the domain before or with P1a, so there is one move,
not two. It does not block this plan: with English paths that stay the same, a later
domain move is one host-level redirect.

## Out of scope

- `lauramiron.mqgrader.ro` (the other repository, its own Romanian and `/en/` paths).
- Download file names (`raport.csv`, the PDF names): they are page text and get
  translated with the rest of the UI later.
- `quickeval:*` local storage keys and the `qe_session` cookie: already English; a
  rename only loses saved settings or logs people out.
- Romanian words in code identifiers (`pregatire()` in `stages.ts`): clean up when the
  file changes, no plan needed.
- Translating the UI (real i18n): a separate project. This plan only makes the
  addresses ready for it.

## Order and size

| Phase | When | Size | Can go wrong for users |
|---|---|---|---|
| P0 | today | 1 line | no |
| P1a + P1b | this week, one PR each | small–medium | only if a redirect is missing (tests cover it) |
| P2 + P3 | next 1–2 weeks, one PR | medium (many test paths) | old links, covered by redirects |
| P4 | after P3 | medium | no: the old paths answer for a few hours |
| P4 cleanup | a few hours after P4's deploy | small | a tab open from before P4: one reload |
| P5 | not recommended | large | yes (R6) |

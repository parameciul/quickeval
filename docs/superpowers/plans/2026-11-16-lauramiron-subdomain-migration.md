# Move lauramiron.pages.dev to lauramiron.mqgrader.ro: Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Steps marked **(you)** are done by a person in the Cloudflare, Google or Bing dashboards; an agent cannot do them.

**Goal:** Serve the materials site "Matematică cu Laura Miron" at `https://lauramiron.mqgrader.ro/`, and send every old `lauramiron.pages.dev` address to the same page on the new host with a 301.

**Architecture:** Nothing is merged. The Cloudflare Pages project `lauramiron` keeps its repo (`D:\Projects\Website`, GitHub `parameciul/matematica`), its build, its admin page and its Functions. It gets one more custom domain, `lauramiron.mqgrader.ro`, in the `mqgrader.ro` zone. The generator's `SITE_URL` changes to the new host, so every canonical, hreflang, sitemap and JSON-LD address changes with it. An account-level Bulk Redirect sends the old host to the new one. The MQGrader repo only updates its links to Laura's site.

**Tech Stack:** Cloudflare Pages (custom domain), Cloudflare Bulk Redirects, Cloudflare Access, the Website's plain HTML generator (`tools/build_pages.mjs`) and validator (`tests/validate.mjs`), Google Search Console, Bing Webmaster Tools.

**Spec:** No separate spec. The decisions come from the analysis session of 2026-11-15/16 and are listed under "Decisions" below.

## Decisions

- New host: `lauramiron.mqgrader.ro`. Reason: Laura's name reads the same in Romanian and English, and students recognize it from the old address. The language stays in the path: Romanian at `/`, English at `/en/`.
- A subdomain, not a subfolder of `mqgrader.ro`. Reason: a subfolder needs the two Pages projects joined in one build, or a Worker. A Worker shares the free plan's 100,000 requests a day with MQGrader's `/api/*`, so the students' daily visits could stop the grading app.
- The old host stays alive for ever. It only redirects. The `lauramiron` project is never deleted.
- The redirect is a Bulk Redirect, not a Pages Function. Requests to static files are free and unlimited; a Function request counts against the daily limit.
- Preview deployments (`<branch>.lauramiron.pages.dev`) are **not** redirected. They keep working for testing.

## Global Constraints

- New base URL, exact: `https://lauramiron.mqgrader.ro/` (with the final slash; the generator adds paths to it).
- Old host, exact: `lauramiron.pages.dev`. No published file names it after Task 3.
- Bulk Redirect options: status `301`, Preserve query string ON, Subpath matching ON, Preserve path suffix ON, **Include subdomains OFF**.
- Keep the `_headers` preview rule `https://:version.:project.pages.dev/*` (noindex). Never add `https://:project.pages.dev/*`. The validator checks both.
- All `href`/`src` in the Website stay relative. Only `SITE_URL` addresses are absolute (Website `AGENTS.md`).
- The Website's timer and admin page push to `main` by themselves. Run `git pull` before each local change and before each merge.
- Order matters: the new canonicals go live (Task 3) **before** the redirect (Task 4). Otherwise the new pages name the old host as canonical while the old host redirects to them.
- Commit messages have no AI attribution lines. Stage files by path in the MQGrader repo (never `git add -A` there). The Website's own `AGENTS.md` uses `git add -A`; that is fine in the Website repo after `git status` shows only your changes.

## Review Focus

Manual checks that no test covers. Each one has its step in Task 4 or Task 2.

1. An old address with `.html` or an old material name (the 301 lines in `_redirects`) lands on the right page on the new host, in at most two hops.
2. A search link keeps its query: `https://lauramiron.pages.dev/cautare?q=fractii` ends at `https://lauramiron.mqgrader.ro/cautare?q=fractii`.
3. A preview address (`https://<branch>.lauramiron.pages.dev/`) is **not** redirected.
4. The admin page works on the new host: the Access login, then one save that starts `.github/workflows/visibility.yml`.
5. A hidden material still answers `302` to its grade page on the new host (`/materiale/joc-stafeta-pe-echipe-1013`).

---

### Task 1: Before you start

**Files:** none.

- [ ] **Step 1: Decide on the open Website branch (you).**
  The branch `claude/mqgrader-backlinks-2477ae` (commit `b1eb7db`, pushed) adds a footer link to mqgrader.ro and a "For teachers" section on the About page. It changes 89 generated files, the same files Task 3 regenerates. Merge it to `main` or close it **before** Task 3. What it contains is your choice.

- [ ] **Step 2: Check the zone (you).**
  Cloudflare dashboard, Websites: `mqgrader.ro` is in the same account as the Pages project `lauramiron`.
  Expected: the zone is listed and Active.

- [ ] **Step 3: Check the Search Console owner (you).**
  Google Search Console: note if `mqgrader.ro` is verified as a **Domain** property (DNS). Task 5 uses this.

---

### Task 2: Serve the site on the new host

**Files:** none (Cloudflare dashboard only).

- [ ] **Step 1: Add the custom domain (you).**
  Cloudflare dashboard, Workers & Pages, `lauramiron`, Custom domains, Set up a custom domain: `lauramiron.mqgrader.ro`. Cloudflare adds the CNAME record in the `mqgrader.ro` zone by itself.
  Expected: the domain shows **Active** and the certificate is issued (a few minutes).

- [ ] **Step 2: Check the new host serves the site.**
  Open `https://lauramiron.mqgrader.ro/`, one grade page and one material PDF.
  Expected: the pages load. Their canonical tags still name `lauramiron.pages.dev`; Task 3 changes that.

- [ ] **Step 3: Add the new host to Cloudflare Access (you).**
  Zero Trust, Access, Applications, the application that protects `lauramiron.pages.dev/tm25mlg` (Review Focus 4). If there are two (production and preview), use the one whose AUD tag equals the production `ACCESS_AUD` secret of the `lauramiron` project. Add one more destination: `lauramiron.mqgrader.ro/tm25mlg`. Keep the two old destinations (`lauramiron.pages.dev/tm25mlg`, `*.lauramiron.pages.dev/tm25mlg`). It is the same application, so `ACCESS_AUD` does not change.
  Expected: `https://lauramiron.mqgrader.ro/tm25mlg/` asks for the one-time email code before it shows the page.

- [ ] **Step 4: Check the admin page saves (you).**
  On `https://lauramiron.mqgrader.ro/tm25mlg/`, log in, make one harmless change (hide and show again a material), save.
  Expected: the save succeeds, and GitHub, Actions shows a `visibility` run that pushes to `main`.

---

### Task 3: Switch the Website to the new host

Repo: `D:\Projects\Website`. Branch: `task/lauramiron-mqgrader-subdomain`.

**Files:**
- Modify: `tools/build_pages.mjs:35` (`SITE_URL`)
- Modify: `tests/validate.mjs` (new old-host check, next to the `_headers` checks near line 981)
- Test: `tests/validate.test.mjs`, `tests/build_pages.test.mjs`
- Delete: `sitemap-test.xml` (a leftover test file; nothing reads it, and it names the old host)
- Modify (docs): `AGENTS.md` (lines 6 and 84), `README.md` (line 6), `video/AGENTS.md` (line 14), `docs/agents/seo.md` (add one line)
- Regenerated by the generator: every page, `sitemap.xml`, `robots.txt`, `llms.txt`, `llms-full.txt`, `_headers`, `404.html` (about 217 files)

**Interfaces:**
- Produces: `SITE_URL === 'https://lauramiron.mqgrader.ro/'`, exported from `tools/build_pages.mjs`. Task 4 and Task 5 rely on the live pages naming this host.

- [ ] **Step 1: Branch from a fresh main.**

```bash
cd /d/Projects/Website
git checkout main
git pull
git checkout -b task/lauramiron-mqgrader-subdomain
```

- [ ] **Step 2: Write the failing tests.**

In `tests/build_pages.test.mjs`, add:

```js
test('the site lives on lauramiron.mqgrader.ro', () => {
  assert.equal(SITE_URL, 'https://lauramiron.mqgrader.ro/');
});
```

In `tests/validate.test.mjs`, add:

```js
test('a published file that names the old host fails', () => {
  expectFailure(
    withSite((dir) => writeFileSync(join(dir, 'old-link.txt'), 'https://lauramiron.pages.dev/clasa-9\n')),
    /old-link\.txt: names the old host lauramiron\.pages\.dev/,
  );
});
```

- [ ] **Step 3: Run the tests to see them fail.**

Run: `node --test tests/build_pages.test.mjs tests/validate.test.mjs`
Expected: FAIL on both new tests (`SITE_URL` is still the old host; the validator has no old-host check).

- [ ] **Step 4: Add the old-host check to `tests/validate.mjs`.**
  Reuse `files` (the output of `walk('')`, which already skips dot-folders, `docs`, `tests` and `tools`). For each file with extension `.html`, `.xml`, `.txt`, `.json`, `.webmanifest`, or the name `_headers` or `_redirects`, and not under `video/` (its YouTube description files keep the address that was uploaded): if the text contains `lauramiron.pages.dev`, call
  `fail(\`${f}: names the old host lauramiron.pages.dev. Use SITE_URL (https://lauramiron.mqgrader.ro/) and regenerate.\`)`.
  The `_headers` preview rule says `:project.pages.dev`, not the literal host, so it passes.

- [ ] **Step 5: Change `SITE_URL` in `tools/build_pages.mjs:35` to `'https://lauramiron.mqgrader.ro/'`.**
  Leave `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` as they are. The old property keeps them; Task 5 verifies the new host by DNS.

- [ ] **Step 6: Regenerate and delete the leftover file.**

```bash
node tools/build_pages.mjs
git rm sitemap-test.xml
node tools/build_pages.mjs --check
```

Expected: `--check` lists nothing.

- [ ] **Step 7: Fix hand-written absolute links.**
  The generator rewrites only what is outside `<article>` (and the quiz `<!-- seo -->` block). A link that a person wrote inside an article or a quiz keeps the old host.

Run: `git grep -n "lauramiron.pages.dev" -- materiale en tm25mlg data ':!*.pdf'`
Expected: no hits. On 2026-11-16 there were none outside the generated tags. For each hit: make the link relative (Website rule: no absolute `href`), then run `node tools/build_pages.mjs` again.

- [ ] **Step 7b: Update the docs.**
  `AGENTS.md` line 6: `Live: https://lauramiron.mqgrader.ro/ (the old https://lauramiron.pages.dev/ redirects there with 301; branch previews stay at https://<branch>.lauramiron.pages.dev/)`. Line 84: open `https://lauramiron.mqgrader.ro/`. Line 77 stays (previews keep the pages.dev host).
  `README.md` line 6 and `video/AGENTS.md` line 14: the new address.
  `docs/agents/seo.md`: one line: `The production host is lauramiron.mqgrader.ro (custom domain of the Pages project). A Bulk Redirect in the Cloudflare account sends lauramiron.pages.dev to it with 301, with "Include subdomains" off so previews still work. Never delete that rule.`

- [ ] **Step 8: Run all tests.**

```bash
npm test
python -m pytest tools -q
```

Expected: the validator prints `PASS`, all node tests pass, pytest passes.

- [ ] **Step 9: Check no published file names the old host.**

Run: `git grep -l "lauramiron.pages.dev" -- . ":!docs" ":!tests" ":!video" ":!.claude" ":!.superpowers"`
Expected: only `AGENTS.md` (line 6 names the old host as the one that redirects; line 77 is the preview address). Nothing else.

- [ ] **Step 10: Commit and push the branch.**

```bash
git add tools/build_pages.mjs tests/validate.mjs tests/validate.test.mjs tests/build_pages.test.mjs AGENTS.md README.md video/AGENTS.md docs/agents/seo.md
git add -u
git status
git commit -m "Move the site to lauramiron.mqgrader.ro"
git push -u origin task/lauramiron-mqgrader-subdomain
```

`git add -u` stages the regenerated files and the deleted `sitemap-test.xml`. Check `git status` shows nothing else before the commit.

- [ ] **Step 11: Check the preview (you).**
  About 1 minute after the push, copy the preview URL from Cloudflare, Workers & Pages, `lauramiron`, Deployments (Pages shortens long branch names, so do not type it by hand; for this branch it is `https://task-lauramiron-mqgrader-sub.lauramiron.pages.dev/`). Previews are behind Cloudflare Access, so log in first. Open it and view the source of one material page.
  Expected: the canonical is `https://lauramiron.mqgrader.ro/materiale/<name>`, and the response has `X-Robots-Tag: noindex` (preview).

- [ ] **Step 12: Merge to main (you approve).**

```bash
git checkout main
git pull
git merge --no-ff task/lauramiron-mqgrader-subdomain
npm test
git push
```

If `git pull` brought a timer or admin commit that touches generated files, run `node tools/build_pages.mjs` after the merge, then `npm test`, then commit.

- [ ] **Step 13: Check production.**
  Open `https://lauramiron.mqgrader.ro/` and view the source.
  Expected: the canonical is `https://lauramiron.mqgrader.ro/`. `https://lauramiron.mqgrader.ro/robots.txt` ends with `Sitemap: https://lauramiron.mqgrader.ro/sitemap.xml`.

---

### Task 4: Redirect the old host

**Files:** none (Cloudflare dashboard only). Do this only after Task 3 Step 13 passes.

- [ ] **Step 1: Make the redirect list (you).**
  Cloudflare dashboard (account level), Bulk Redirects, Create Bulk Redirect List. Name: `lauramiron_pages_dev`. One item:
  - Source URL: `lauramiron.pages.dev`
  - Target URL: `https://lauramiron.mqgrader.ro`
  - Status: `301`
  - Preserve query string: ON. Subpath matching: ON. Preserve path suffix: ON. **Include subdomains: OFF.**

  Cloudflare's own guide turns "Include subdomains" on. Leave it off here, so preview addresses keep working.

- [ ] **Step 2: Make the rule (you).**
  Bulk Redirects, Create Bulk Redirect Rule, name `lauramiron pages.dev to mqgrader.ro`, list `lauramiron_pages_dev`, Deploy.

- [ ] **Step 3: Check the redirect (you).** Run each command in your own terminal; read the `HTTP` and `location` lines. An agent cannot do this check: curl is blocked for it, and a browser fetch hides the 301 status.

```bash
curl -sI https://lauramiron.pages.dev/
```

Expected: `HTTP/2 301` and `location: https://lauramiron.mqgrader.ro/`.

```bash
curl -sI https://lauramiron.pages.dev/clasa-9.html
```

Expected: `301` to `https://lauramiron.mqgrader.ro/clasa-9.html`; that address then redirects to `/clasa-9` (Review Focus 1).

```bash
curl -sIL https://lauramiron.pages.dev/materiale/joc-mesajul-secret | grep -i "^HTTP\|^location"
```

Expected: it ends at `https://lauramiron.mqgrader.ro/materiale/joc-mesajul-secret-1006` with `200` (Review Focus 1).

```bash
curl -sI "https://lauramiron.pages.dev/cautare?q=fractii"
```

Expected: `location: https://lauramiron.mqgrader.ro/cautare?q=fractii` (Review Focus 2).

```bash
curl -sI https://lauramiron.mqgrader.ro/materiale/joc-stafeta-pe-echipe-1013
```

Expected: `302` to `/clasa-6` while that material is hidden (Review Focus 5).

Last, the preview URL from Task 3 Step 11 (copy it from Deployments):

```bash
curl -sI https://<preview-alias>.lauramiron.pages.dev/
```

Expected: no redirect to `lauramiron.mqgrader.ro` (Review Focus 3). Previews are behind Cloudflare Access, so the answer is a `302` to `lauramiron.cloudflareaccess.com`, the login page. That is correct. Delete that branch after this check if you do not need it.

- [ ] **Step 4: If the redirect does not work.**
  The Cloudflare docs show this redirect for `pages.dev`, but they also say Bulk Redirects need a proxied hostname. If Step 3 shows `200` instead of `301`: leave things as they are. The old host still serves the full site, and each page names the new host as canonical, so Google moves to the new host anyway, only slower. Then open a ticket with Cloudflare support, or ask the next session for another way.

---

### Task 5: Tell the search engines

**Files:** none (dashboards only).

- [ ] **Step 1: Add the new host in Google Search Console (you).**
  Add a property, **URL prefix**: `https://lauramiron.mqgrader.ro/`. Verify it with **DNS** (the TXT record of `mqgrader.ro`). If `mqgrader.ro` is already a verified Domain property (Task 1 Step 3), the URL-prefix property is verified at once.

- [ ] **Step 2: Submit the sitemap (you).**
  New property, Sitemaps: `https://lauramiron.mqgrader.ro/sitemap.xml`.
  Expected: status "Success" and about 76 addresses found.

- [ ] **Step 3: Use Change of Address (you).**
  Old property `https://lauramiron.pages.dev/`, Settings, Change of address, new site `https://lauramiron.mqgrader.ro/`. If Search Console refuses it for this host, skip it: the 301s do the same work, only slower.

- [ ] **Step 4: Request indexing (you).**
  New property, URL inspection: the home page, `/en/` and the two most visited grade pages. Click "Request indexing" for each.

- [ ] **Step 5: Add the new host in Bing Webmaster Tools (you).**
  Add site `https://lauramiron.mqgrader.ro/`, or import it from Google Search Console. The `msvalidate.01` tag already on the pages may verify it. Submit `https://lauramiron.mqgrader.ro/sitemap.xml`. Use Bing's Site Move tool from the old site if it offers one.

---

### Task 6: Update MQGrader's links to Laura's site

Repo: this one (`D:\Projects\QuickEval`). Do it after Task 4 Step 3 passes.

**Files:**
- Modify: `index.html:42` and `index.html:53` (`sameAs` of the Organization and the Person)
- Modify: `despre/index.html:106` and `despre/index.html:112` (two links)
- Modify: `AGENTS.md:6` (the "Brand source" line: the new live address)
- Test: `src/landing/pages.test.ts:258-267`

Leave the old address in the dated docs (`docs/seo-audit-mqgrader-ro.md`, `docs/superpowers/specs/2026-10-06-quickeval-design.md`): they record history.

- [ ] **Step 1: Change the test first.**
  In `src/landing/pages.test.ts`, change the three expected values from `'https://lauramiron.pages.dev/'` to `'https://lauramiron.mqgrader.ro/'` (lines 258, 259, 267).

- [ ] **Step 2: Run it to see it fail.**

Run: `npm run test:related -- src/landing/pages.test.ts`
Expected: FAIL on the `sameAs` and `despre` checks.

- [ ] **Step 3: Change the four addresses** in `index.html` and `despre/index.html` to `https://lauramiron.mqgrader.ro/`. Keep `rel="me"` on the two `despre` links. Change `AGENTS.md:6` to name `https://lauramiron.mqgrader.ro/`.

- [ ] **Step 4: Run the tests.**

```bash
npm run test:related -- src/landing/pages.test.ts
npm test
npm run typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit by path, push, open a PR.**

```bash
git add index.html despre/index.html AGENTS.md src/landing/pages.test.ts
git commit -m "Link to Laura's materials at lauramiron.mqgrader.ro"
git push -u origin HEAD
```

After the merge and deploy, run `npm run indexnow` (the landing page and `/despre/` changed).

---

### Task 7: Update the links outside the code, then watch

**Files:** none.

- [ ] **Step 1: Update the shared links (you and Laura).**
  The redirect keeps old links working, but new links should name the new host:
  - the YouTube channel description and the video descriptions (`video/AGENTS.md` asks for a link to the site in each one);
  - the class WhatsApp groups and Google Classroom pages;
  - the school's website, if it links to the materials;
  - any printed QR codes, when they are printed again.

- [ ] **Step 2: Watch for 4 weeks (you).**
  Once a week, in Google Search Console:
  - the new property: Pages, the number of indexed pages goes up toward about 76;
  - the old property: indexed pages go down; Performance clicks move to the new property.
  Expected: a small dip in clicks for 1 to 3 weeks, then the same level or higher.

- [ ] **Step 3: Never remove the redirect.**
  Keep the Bulk Redirect rule and the `lauramiron` project for ever. Old links in messages, videos and other sites depend on them.

---

## Rollback

Each step can be undone in minutes:

- **Redirect problems:** Cloudflare, Bulk Redirects, disable the rule `lauramiron pages.dev to mqgrader.ro`. The old host serves the site again at once.
- **Wrong canonicals:** in `D:\Projects\Website`, `git revert <merge commit>`, then `git push`. Cloudflare deploys the old `SITE_URL` in about 1 minute. Disable the redirect rule first, so the two hosts do not point at each other.
- **New host problems:** remove the custom domain `lauramiron.mqgrader.ro` from the `lauramiron` project. Do this only after the redirect is disabled and the revert is live.

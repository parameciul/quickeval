# SEO, GEO and AEO audit: mqgrader.ro

Date: 2026-11-07. Scope: https://mqgrader.ro/ only. quickeval.pages.dev is not optimized (it will be retired).

Method: read the live `robots.txt`, read the page and headers in the repo (`index.html`, `public/_headers`, `public/robots.txt`), and review the landing page for search engines (SEO), AI search (GEO) and answer engines (AEO).

## Verdict

Before: score about 5/100 for visibility. The site told every search engine and every AI crawler to stay away.

After the fixes in this branch: the landing page can be crawled, indexed and cited. Real ranking still needs the off-site steps at the end (Search Console, Bing, backlinks).

## Findings and fixes

| # | Severity | Finding | Fix (done in this branch) |
|---|----------|---------|---------------------------|
| 1 | Critical | Live `robots.txt` was `Disallow: /` for all bots. Nothing could be crawled. | New `robots.txt`: landing open; `/u/` and `/api/` closed; `/teacher/` left crawlable so its noindex is seen. |
| 2 | Critical | `X-Robots-Tag: noindex, nofollow` on every URL (`public/_headers`). | Header moved to `/teacher`, `/teacher/*`, `/u/*`, the old host quickeval.pages.dev (so it cannot compete as a copy), and the API's own headers (`server/app.ts`). |
| 3 | Critical | `<meta name="robots" content="noindex, nofollow">` on the landing page. | Now `index, follow` with `max-snippet:-1, max-image-preview:large`. |
| 4 | High | No canonical URL. | `<link rel="canonical" href="https://mqgrader.ro/">`. This also points the old pages.dev copy to mqgrader.ro. |
| 5 | High | No `sitemap.xml`. | Added, and listed in `robots.txt`. |
| 6 | High | No structured data. | JSON-LD graph: Organization, Person (Laura Miron), WebSite, WebPage, SoftwareApplication, FAQPage. No invented ratings or prices. |
| 7 | High | Weak description (no brand or topic words), no social cards. | New title/description (in the 160-char range), Open Graph, Twitter card, `og-image.png` (1200x630), `lang=ro`, `og:locale=ro_RO`. |
| 8 | High (AEO) | No question-and-answer content. Answer engines had nothing to quote. | New visible section "Întrebări frecvente" (8 Q&As). The JSON-LD FAQ matches it word for word; a test checks this. |
| 9 | Medium (GEO) | AI crawlers not addressed; no machine-readable summary. | `robots.txt` allows OAI-SearchBot, ChatGPT-User, GPTBot, PerplexityBot, ClaudeBot, Claude-SearchBot, Claude-User, Google-Extended, Applebot-Extended. Added `llms.txt` (Romanian and English summary). Note: `llms.txt` is optional and Google ignores it. |
| 10 | Low | No cache headers for the new public files. | 1 hour cache for `robots.txt`, `sitemap.xml`, `llms.txt`. |

Also check in the Cloudflare dashboard for mqgrader.ro: "Block AI bots" and "Managed robots.txt" (AI Crawl Control) must be off, or they override this `robots.txt`.

## What was already good

- Server-rendered static HTML: crawlers and AI bots see all the text without running JavaScript.
- One `h1`, clean `h2`/`h3` order, `lang="ro"`, viewport tag, favicon, light page, small page weight.
- Strong security headers and a strict CSP (JSON-LD is a data block, so the CSP allows it).
- Clear brand lockup and an author (Laura Miron) with a real school and city: good trust signals (E-E-A-T).

## Decisions I made (tell me if you disagree)

- "AI" appears only in visible places that are not Laura's texts: the meta description, a new FAQ question, the matching JSON-LD, and `llms.txt`. No hidden text (Google treats it as spam). Student pages never say it.
- The `/teacher/` login page stays crawlable with noindex. A page that robots.txt blocks can still show up as a bare URL.
- No `sameAs` links in the Person/Organization data. Add the Laura Miron site link there if you want to tie the brands together.
- `www.mqgrader.ro` is not handled in code.

## Steps only you can do (not code)

1. Deploy, then check `https://mqgrader.ro/robots.txt` shows the new text.
2. Add mqgrader.ro in Google Search Console (DNS verify), submit `sitemap.xml`, use "Request indexing" on `/`.
3. Add the site in Bing Webmaster Tools (it feeds ChatGPT search and Copilot). Submit the sitemap.
4. In Cloudflare: redirect `www.mqgrader.ro` to `mqgrader.ro` (301). Optional: redirect `quickeval.pages.dev` to `mqgrader.ro`.
5. Backlinks: link to mqgrader.ro from the Laura Miron site (lauramiron.pages.dev), the school page and teacher groups. This is the biggest ranking lever for a new domain.
6. Google Business Profile does not apply (no storefront).
7. Later content ideas (each one a page that can rank): "corectare teste matematică după barem", "barem pentru evaluarea națională", a short demo video and a real screenshot of a graded paper.
8. Recheck in 4 weeks: pages indexed, impressions in Search Console, and ask ChatGPT, Perplexity and Gemini "cum pot corecta mai repede testele de matematică?".

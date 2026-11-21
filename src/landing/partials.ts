// i18n-ignore-file: the footer has a copy per language, checked by src/landing/pages.test.ts.
// Parts of the public pages that are the same on every page. A page names one
// with a comment, `<!--#include site-foot -->`, and Vite puts the part in its
// place (the `publicPagePartials` plugin in vite.config.ts), in dev and in the
// build. Tests that read a page's raw HTML expand it first with expandPartials.

const MARK =
  '<svg class="mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g fill="none" stroke-width="7"><path d="M35.74 14.39A18 18 0 0 1 49.12 37.56" stroke="var(--mk-a)" /><path d="M45.38 44.04A18 18 0 0 1 18.62 44.04" stroke="var(--mk-a)" /><path d="M14.88 37.56A18 18 0 0 1 28.26 14.39" stroke="var(--mk-b)" /></g></svg>';

// The footer: the lockup, the four content pages, the contact address and the
// line under them. It sits on the colour of the page's end band, right above it.
const SITE_FOOT = `<footer class="site-foot">
        <div class="foot wrap">
          <a class="brand" href="/" aria-label="MQGrader by Laura Miron">
            ${MARK}
            <span class="words"><b>MQGrader</b><span>by Laura Miron</span></span>
          </a>
          <nav class="foot-nav" aria-label="Pagini">
            <a href="/guide/">Ghidul aplicației</a>
            <a href="/grading/">Corectarea</a>
            <a href="/about/">Despre</a>
            <a href="/pricing/">Cât costă</a>
          </nav>
          <a class="link" href="mailto:contact@mqgrader.ro">contact@mqgrader.ro</a>
          <span class="note">Corectarea testelor după barem · Timișoara · 2026</span>
        </div>
      </footer>`;

// The same footer on the English pages (/en/…).
const SITE_FOOT_EN = `<footer class="site-foot">
        <div class="foot wrap">
          <a class="brand" href="/en/" aria-label="MQGrader by Laura Miron">
            ${MARK}
            <span class="words"><b>MQGrader</b><span>by Laura Miron</span></span>
          </a>
          <nav class="foot-nav" aria-label="Pages">
            <a href="/en/guide/">App guide</a>
            <a href="/en/grading/">Grading</a>
            <a href="/en/about/">About</a>
            <a href="/en/pricing/">Pricing</a>
          </nav>
          <a class="link" href="mailto:contact@mqgrader.ro">contact@mqgrader.ro</a>
          <span class="note">Grading tests by the marking scheme · Timișoara · 2026</span>
        </div>
      </footer>`;

export const PARTIALS: Readonly<Record<string, string>> = { 'site-foot': SITE_FOOT, 'site-foot-en': SITE_FOOT_EN };

const INCLUDE = /<!--#include ([a-z-]+) -->/g;

// The page with every include replaced by its part. An unknown name fails the
// build instead of leaving a hole in the page.
export function expandPartials(html: string): string {
  return html.replace(INCLUDE, (_, name: string) => {
    const part = PARTIALS[name];
    if (part === undefined) throw new Error(`Unknown partial: ${name}`);
    return part;
  });
}

// Parts of the public pages that are the same on every page. A page names one
// with a comment, `<!--#include site-foot -->`, and Vite puts the part in its
// place (the `publicPagePartials` plugin in vite.config.ts), in dev and in the
// build. Tests that read a page's raw HTML expand it first with expandPartials.

const MARK =
  '<svg class="mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g fill="none" stroke-width="7"><path d="M35.74 14.39A18 18 0 0 1 49.12 37.56" stroke="var(--mk-a)" /><path d="M45.38 44.04A18 18 0 0 1 18.62 44.04" stroke="var(--mk-a)" /><path d="M14.88 37.56A18 18 0 0 1 28.26 14.39" stroke="var(--mk-b)" /></g></svg>';

// The footer: the lockup, the four content pages, and the line under them.
const SITE_FOOT = `<footer class="site-foot">
        <div class="wrap">
          <a class="brand" href="/" aria-label="MQGrader by Laura Miron">
            ${MARK}
            <span class="words"><b>MQGrader</b><span>by Laura Miron</span></span>
          </a>
          <nav class="foot-nav" aria-label="Pagini">
            <a href="/ghid/">Ghidul corectării</a>
            <a href="/barem/">Baremul</a>
            <a href="/despre/">Despre</a>
            <a href="/preturi/">Cât costă</a>
          </nav>
          <span class="note">Corectarea testelor de matematică · Timișoara · 2026</span>
        </div>
      </footer>`;

export const PARTIALS: Readonly<Record<string, string>> = { 'site-foot': SITE_FOOT };

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

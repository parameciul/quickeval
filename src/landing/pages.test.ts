import { describe, expect, it } from 'vitest';
import baremRaw from '../../barem/index.html?raw';
import despreRaw from '../../despre/index.html?raw';
import ghidRaw from '../../ghid/index.html?raw';
import landingRaw from '../../index.html?raw';
import preturiRaw from '../../preturi/index.html?raw';
import llms from '../../public/llms.txt?raw';
import headers from '../../public/_headers?raw';
import { expandPartials, PARTIALS } from './partials.ts';
import { PITCH_LINE } from '../admin/wayIn/WayIn.tsx';

// The pages that answer a search, beside the landing page. They are plain
// HTML, built by Vite (vite.config.ts lists them), and they share the landing
// page's look: src/landing/landing.css, then src/landing/pages.css. Their
// footer is a shared part that Vite puts in place, so the tests read each page
// as it is served.

const RAW = [ghidRaw, baremRaw, despreRaw, preturiRaw];
const [ghid, barem, despre, preturi, landing] = [...RAW, landingRaw].map(expandPartials) as [
  string,
  string,
  string,
  string,
  string,
];

type Page = { path: string; url: string; image: string; html: string; name: string };

const PAGES: Page[] = [
  { path: '/ghid/', url: 'https://mqgrader.ro/ghid/', image: 'https://mqgrader.ro/og-ghid.png', html: ghid, name: 'Ghidul corectării' },
  { path: '/barem/', url: 'https://mqgrader.ro/barem/', image: 'https://mqgrader.ro/og-barem.png', html: barem, name: 'Baremul' },
  { path: '/despre/', url: 'https://mqgrader.ro/despre/', image: 'https://mqgrader.ro/og-despre.png', html: despre, name: 'Despre' },
  { path: '/preturi/', url: 'https://mqgrader.ro/preturi/', image: 'https://mqgrader.ro/og-preturi.png', html: preturi, name: 'Cât costă' },
];

const LINKS = ['/ghid/', '/barem/', '/despre/', '/preturi/'];

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const all = (doc: Document, selector: string) => Array.from(doc.querySelectorAll(selector));
const landingDoc = parse(landing);

describe('the pages that answer a search', () => {
  it.each(PAGES)('$path has one heading, its own address and its own title', ({ url, image, html }) => {
    const doc = parse(html);
    expect(doc.documentElement.getAttribute('lang')).toBe('ro');
    expect(all(doc, 'h1').map(text)).toHaveLength(1);
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(url);
    const robots = doc.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '';
    expect(robots).toMatch(/^index\b/);
    expect(robots).not.toContain('noindex');
    expect(doc.title.length).toBeLessThanOrEqual(65);
    const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
    expect(description.length).toBeGreaterThanOrEqual(70);
    expect(description.length).toBeLessThanOrEqual(165);
    // The share card points at the page itself, not at the landing page.
    expect(doc.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(url);
    expect(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(image);
    expect(doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content')).toBe(image);
    expect(doc.querySelector('meta[property="og:image:width"]')?.getAttribute('content')).toBe('1200');
    expect(doc.querySelector('meta[property="og:image:height"]')?.getAttribute('content')).toBe('630');
    expect((doc.querySelector('meta[property="og:image:alt"]')?.getAttribute('content') ?? '').length).toBeGreaterThan(30);
    expect(doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary_large_image');
    // No page is a copy of another: the address is in the file it belongs to.
    expect(html).not.toContain('quickeval.pages.dev');
  });

  it('carries the same brand as the landing page, word for word', () => {
    const lockup = (html: string) => {
      const doc = parse(html);
      return all(doc, '.brand .words').map((w) => [text(w.querySelector('b')), text(w.querySelector('span'))]);
    };
    const expected = lockup(landing);
    expect(expected).toEqual([
      ['MQGrader', 'by Laura Miron'],
      ['MQGrader', 'by Laura Miron'],
    ]);
    for (const page of PAGES) expect(lockup(page.html)).toEqual(expected);
  });

  it('offers the same four links on every page, and from the landing page too', () => {
    for (const html of [landing, ...PAGES.map((p) => p.html)]) {
      const doc = parse(html);
      const nav = all(doc, '.foot-nav a').map((a) => a.getAttribute('href'));
      expect(nav).toEqual(LINKS);
    }
  });

  it('keeps the header menu one tap away on a phone, the page marked', () => {
    for (const page of PAGES) {
      const doc = parse(page.html);
      const links = all(doc, '.site-top .nav-links a');
      expect(links.map((a) => a.getAttribute('href'))).toEqual(LINKS);
      expect(links.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.getAttribute('href'))).toEqual([
        page.path,
      ]);
      // The ☰ button opens that very list, which waits out of sight.
      const button = doc.querySelector('.site-top [data-nav-toggle]');
      expect(button?.getAttribute('aria-controls')).toBe(doc.querySelector('.site-top .nav-links')?.id);
      expect(button?.getAttribute('aria-expanded')).toBe('false');
      expect(button?.getAttribute('aria-label')).toBe('Mai multe pagini');
    }
    // The landing page adds its two jumps down the page in front of them.
    expect(all(landingDoc, '.site-top .nav-links a').map((a) => a.getAttribute('href'))).toEqual(['#cum', '#ajutor', ...LINKS]);
  });

  it.each(PAGES)('$path leads only to pages and files that exist', ({ html }) => {
    const doc = parse(html);
    // Every internal address is one of the pages, the login, or a public file
    // on the site. An absolute one is somebody else's site.
    const internal = all(doc, 'a[href]')
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('/'))
      .map((href) => href.split('#')[0] ?? '');
    const known = new Set(['/', ...LINKS, '/teacher/']);
    for (const href of internal) expect(known.has(href) || href.startsWith('/teacher/')).toBe(true);
    // A link that stays on the page goes to a heading that is there.
    const anchors = all(doc, 'a[href^="#"]').map((a) => (a.getAttribute('href') ?? '').slice(1));
    for (const id of anchors) expect(doc.getElementById(id), id).not.toBeNull();
  });

  it.each(PAGES)('$path shows the trail its structured data claims', ({ html, name }) => {
    const doc = parse(html);
    const crumbs = all(doc, '.crumbs a, .crumbs span:not([aria-hidden])').map(text);
    expect(crumbs).toEqual(['MQGrader', name]);
    const ld = JSON.parse(text(doc.querySelector('script[type="application/ld+json"]')));
    const nodes: { '@type': string; itemListElement?: { position: number; name: string; item: string }[] }[] = ld['@graph'];
    const trail = nodes.find((n) => n['@type'] === 'BreadcrumbList')!.itemListElement!;
    expect(trail.map((e) => e.name)).toEqual(crumbs);
  });

  it.each(PAGES)('$path says who wrote it and when, and the date is the one in the data', ({ html, url }) => {
    const doc = parse(html);
    const byline = text(doc.querySelector('.byline'));
    expect(byline).toContain('Laura Miron');
    expect(byline).toContain('12 noiembrie 2026');
    const ld = JSON.parse(text(doc.querySelector('script[type="application/ld+json"]')));
    const nodes: {
      '@type': string;
      url?: string;
      datePublished?: string;
      dateModified?: string;
      publisher?: { '@id': string };
      author?: { '@id': string };
    }[] = ld['@graph'];
    const page = nodes.find((n) => n['@type'] === 'WebPage')!;
    expect(page.url).toBe(url);
    expect(page.datePublished).toBe('2026-11-10');
    expect(page.dateModified).toBe('2026-11-12');
    expect(page.publisher?.['@id']).toBe('https://mqgrader.ro/#organization');
    expect(page.author?.['@id']).toBe('https://mqgrader.ro/#laura-miron');
  });

  it.each(PAGES)('$path offers a table of contents that reaches its own sections', ({ html }) => {
    const doc = parse(html);
    const nav = doc.querySelector('nav.toc');
    // Only the two long pages carry one; both must resolve.
    if (!nav) return;
    const hrefs = Array.from(nav.querySelectorAll('a[href^="#"]'), (a) => (a.getAttribute('href') ?? '').slice(1));
    expect(hrefs.length).toBeGreaterThanOrEqual(4);
    for (const id of hrefs) {
      const heading = doc.getElementById(id);
      expect(heading, id).not.toBeNull();
      expect(heading?.tagName).toMatch(/^H[23]$/);
    }
    expect(text(nav.querySelector('h2'))).toBe('Cuprins');
  });

  it.each(PAGES)('$path ends by sending the reader to the other three pages', ({ path, html }) => {
    const doc = parse(html);
    const end = doc.querySelector('#citeste-si');
    expect(text(end)).toBe('Citește și');
    const list = doc.querySelector('.read-on');
    const targets = Array.from(list!.querySelectorAll('a'), (a) => a.getAttribute('href'));
    expect(new Set(targets)).toEqual(new Set(LINKS.filter((href) => href !== path)));
  });

  it('has no inline script or style, which the security policy blocks', () => {
    for (const html of PAGES.map((p) => p.html)) {
      const doc = parse(html);
      const code = all(doc, 'script').filter((s) => s.getAttribute('type') !== 'application/ld+json');
      expect(code.every((s) => s.getAttribute('src') && !text(s))).toBe(true);
      expect(all(doc, '[style]')).toEqual([]);
      expect(all(doc, 'style')).toEqual([]);
      expect(all(doc, '*').filter((el) => Array.from(el.attributes).some((a) => a.name.startsWith('on')))).toEqual([]);
    }
  });

  it('loads only the theme button script, not the Quick Try form', () => {
    for (const html of PAGES.map((p) => p.html)) {
      const scripts = all(parse(html), 'script[type="module"]').map((s) => s.getAttribute('src'));
      expect(scripts).toEqual(['/src/landing/pages.ts']);
    }
  });

  it('takes its footer from the shared part, once', () => {
    for (const raw of [...RAW, landingRaw]) {
      expect(raw.match(/<!--#include site-foot -->/g)).toHaveLength(1);
      expect(raw).not.toContain('<footer');
    }
  });

  // The sitemap's exact list is checked in robots.test.ts.
  it('is listed in llms.txt', () => {
    for (const page of PAGES) {
      expect(llms).toContain(page.url);
      expect(llms).toContain(page.name);
    }
  });

  it('lets a returning reader keep the pictures instead of fetching them again', () => {
    // A picture keeps its name, so it gets a day, not the year a hashed file gets.
    expect(headers).toMatch(/^\/\*\.png\n {2}Cache-Control: public, max-age=86400$/m);
    expect(headers).toMatch(/^\/favicon\.svg\n {2}Cache-Control: public, max-age=86400$/m);
    // The build's own files carry a content hash and are kept for a year.
    expect(headers).toMatch(/^\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable$/m);
  });

  it('writes the barem page questions twice, in the same words', () => {
    const doc = parse(barem);
    const ld = JSON.parse(text(doc.querySelector('script[type="application/ld+json"]')));
    const nodes: { '@type': string; mainEntity?: { name: string; acceptedAnswer: { text: string } }[] }[] = ld['@graph'];
    expect(nodes.map((n) => n['@type'])).toEqual(expect.arrayContaining(['WebPage', 'BreadcrumbList', 'FAQPage']));
    const faq = nodes.find((n) => n['@type'] === 'FAQPage')!.mainEntity!;
    const visible = all(doc, '.qa li').map((li) => [text(li.querySelector('h3')), text(li.querySelector('p'))]);
    expect(faq.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(visible);
  });

  it('ties the brand to Laura Miron in both directions', () => {
    const ld = JSON.parse(text(landingDoc.querySelector('script[type="application/ld+json"]')));
    const nodes: { '@type': string; sameAs?: string[]; url?: string; logo?: { url: string } }[] = ld['@graph'];
    const org = nodes.find((n) => n['@type'] === 'Organization')!;
    const person = nodes.find((n) => n['@type'] === 'Person')!;
    const app = nodes.find((n) => n['@type'] === 'SoftwareApplication')! as unknown as {
      featureList: string[];
      screenshot: string;
    };
    expect(org.sameAs).toEqual(['https://lauramiron.pages.dev/']);
    expect(person.sameAs).toEqual(['https://lauramiron.pages.dev/']);
    expect(person.url).toBe('https://mqgrader.ro/despre/');
    // A raster logo, as the structured data asks for: an SVG is refused.
    expect(org.logo?.url).toBe('https://mqgrader.ro/logo.png');
    expect(app.featureList.length).toBeGreaterThanOrEqual(5);
    expect(app.screenshot).toBe('https://mqgrader.ro/app-teste.png');
    // The page for Laura is the one the Person points at, and it links back.
    expect(landing).not.toMatch(/aggregateRating|"offers"/);
    expect(despre).toContain('https://lauramiron.pages.dev/');
  });

  it('gives the contact address on the page about the author', () => {
    const doc = parse(despre);
    const mail = Array.from(doc.querySelectorAll('a[href^="mailto:"]')).map((a) => a.getAttribute('href'));
    expect(mail).toEqual(['mailto:contact@mqgrader.ro', 'mailto:contact@mqgrader.ro']);
    expect(text(doc.getElementById('contact'))).toBe('Contact');
  });

  it("gives advice in the guide that fits MQGrader's way of grading", () => {
    const doc = parse(ghid);
    const habits = Array.from(doc.querySelectorAll('#obiceiuri + ol > li b')).map(text);
    expect(habits).toEqual([
      'Confirmă baremul înainte de prima lucrare.',
      'Cere pozele în clasă, la sfârșitul orei.',
      'Publică rezultatele înainte de următorul test.',
    ]);
    // Grading one exercise across the whole class is how a teacher grades by hand.
    expect(ghid).not.toContain('Corectează exercițiul, nu lucrarea');
  });

  it('shows the review screen in the guide, with the same picture in the data', () => {
    const doc = parse(ghid);
    const figure = doc.querySelector('.prose .shot');
    const img = figure?.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/app-verificare.png');
    expect(img?.getAttribute('width')).toBe('1600');
    expect(img?.getAttribute('height')).toBe('1000');
    expect((img?.getAttribute('alt') ?? '').length).toBeGreaterThan(60);
    expect(img?.getAttribute('alt')).toContain('Verificarea într-un test de matematică');
    expect(text(figure?.querySelector('figcaption') ?? null)).toContain('decizia profesorului');
    // The page's main image is the one the reader sees, at its real size.
    const ld = JSON.parse(text(doc.querySelector('script[type="application/ld+json"]')));
    const nodes: { '@type': string; primaryImageOfPage?: { url: string; width: number; height: number; caption?: string } }[] =
      ld['@graph'];
    const page = nodes.find((n) => n['@type'] === 'WebPage')!;
    expect(page.primaryImageOfPage).toMatchObject({
      url: 'https://mqgrader.ro/app-verificare.png',
      width: 1600,
      height: 1000,
    });
    expect(page.primaryImageOfPage?.caption?.length).toBeGreaterThan(40);
  });
});

// Spec "any subject": MQGrader grades seven subjects, so no product text says
// it is for math teachers or math tests only. Facts about Laura Miron (a math
// teacher) and the math examples stay.
describe('the product text names no single subject', () => {
  const ONLY_MATH = /profesori(i)? de matematic|testel(e|or) de matematic|test de matematic(ă|a) (cu|după)|la matematică: ce este/i;
  it.each([
    ['index.html', landing],
    ['/ghid/', ghid],
    ['/barem/', barem],
    ['/despre/', despre],
    ['/preturi/', preturi],
    ['llms.txt', llms],
    ['the footer', PARTIALS['site-foot']!],
    ['PITCH_LINE', PITCH_LINE],
  ])('%s', (_name, source) => {
    expect(source).not.toMatch(ONLY_MATH);
    expect(source).not.toMatch(/math teachers/i);
  });

  it('lists the seven subjects on the landing page and in llms.txt', () => {
    const seven = 'matematică, fizică, chimie, biologie, științe, limba română și limba engleză';
    expect(landing).toContain(seven);
    expect(llms).toContain(seven);
  });
});

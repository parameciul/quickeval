import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import baremRaw from '../../grading/index.html?raw';
import despreRaw from '../../about/index.html?raw';
import ghidRaw from '../../guide/index.html?raw';
import landingRaw from '../../index.html?raw';
import preturiRaw from '../../pricing/index.html?raw';
import enBaremRaw from '../../en/grading/index.html?raw';
import enDespreRaw from '../../en/about/index.html?raw';
import enGuideRaw from '../../en/guide/index.html?raw';
import enLandingRaw from '../../en/index.html?raw';
import enPreturiRaw from '../../en/pricing/index.html?raw';
import { expandPartials } from './partials.ts';

// The English copy of every public page (/en/…): the same page, in English.
// A change to a Romanian page is a change to its English copy too; this test
// fails when the two drift apart in what a reader or a search engine sees.

const ROOT = resolve(__dirname, '../..') + '/';
const parse = (html: string) => new DOMParser().parseFromString(expandPartials(html), 'text/html');
const all = (doc: Document, selector: string) => Array.from(doc.querySelectorAll(selector));
const visibleText = (doc: Document) => {
  const body = doc.body.cloneNode(true) as HTMLElement;
  for (const element of body.querySelectorAll('script, style, svg')) element.remove();
  return body.textContent ?? '';
};

type Twin = { ro: string; en: string; roUrl: string; enUrl: string };

const TWINS: Twin[] = [
  { ro: landingRaw, en: enLandingRaw, roUrl: '/', enUrl: '/en/' },
  { ro: ghidRaw, en: enGuideRaw, roUrl: '/guide/', enUrl: '/en/guide/' },
  { ro: baremRaw, en: enBaremRaw, roUrl: '/grading/', enUrl: '/en/grading/' },
  { ro: despreRaw, en: enDespreRaw, roUrl: '/about/', enUrl: '/en/about/' },
  { ro: preturiRaw, en: enPreturiRaw, roUrl: '/pricing/', enUrl: '/en/pricing/' },
];

const hreflangs = (doc: Document) => Object.fromEntries(all(doc, 'link[rel="alternate"][hreflang]').map((link) => [link.getAttribute('hreflang'), link.getAttribute('href')]));

describe('the English copies of the public pages', () => {
  it.each(TWINS)('$enUrl is the English twin of $roUrl', ({ ro, en, roUrl, enUrl }) => {
    const roDoc = parse(ro);
    const enDoc = parse(en);
    expect(roDoc.documentElement.lang).toBe('ro');
    expect(enDoc.documentElement.lang).toBe('en');
    // public/lang.js sends a reader to the copy in their language.
    expect(roDoc.documentElement.dataset.twin).toBe(enUrl);
    expect(enDoc.documentElement.dataset.twin).toBe(roUrl);
    expect(all(roDoc, 'script[src="/lang.js"]')).toHaveLength(1);
    expect(all(enDoc, 'script[src="/lang.js"]')).toHaveLength(1);
    // Each names its own address, and both name the two copies.
    expect(enDoc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`https://mqgrader.ro${enUrl}`);
    const expected = { ro: `https://mqgrader.ro${roUrl}`, en: `https://mqgrader.ro${enUrl}`, 'x-default': `https://mqgrader.ro${roUrl}` };
    expect(hreflangs(roDoc)).toEqual(expected);
    expect(hreflangs(enDoc)).toEqual(expected);
    // The language link leads to the other copy.
    expect(roDoc.querySelector('[data-lang-switch="en"]')?.getAttribute('href')).toBe(enUrl);
    expect(enDoc.querySelector('[data-lang-switch="ro"]')?.getAttribute('href')).toBe(roUrl);
  });

  it.each(TWINS)('$enUrl has the same parts, anchors and pictures as $roUrl', ({ ro, en }) => {
    const roDoc = parse(ro);
    const enDoc = parse(en);
    const ids = (doc: Document) => all(doc, '[id]').map((element) => element.id);
    expect(ids(enDoc)).toEqual(ids(roDoc));
    for (const selector of ['h1', 'h2', 'h3', 'section', 'figure', 'li', 'a', 'button', 'dialog', 'input']) {
      expect(all(enDoc, selector).length, selector).toBe(all(roDoc, selector).length);
    }
    const pictures = (doc: Document) => all(doc, 'img').map((img) => [img.getAttribute('width'), img.getAttribute('height')]);
    expect(pictures(enDoc)).toEqual(pictures(roDoc));
  });

  it.each(TWINS)('$enUrl shows English pictures that exist, and links to English pages', ({ en }) => {
    const doc = parse(en);
    for (const img of all(doc, 'img')) {
      const src = img.getAttribute('src') ?? '';
      expect(src, src).toMatch(/^\/(screens\/en|en)\//);
      expect(existsSync(`${ROOT}public${src}`), src).toBe(true);
      expect((img.getAttribute('alt') ?? '').length).toBeGreaterThan(10);
    }
    for (const meta of all(doc, 'meta[property="og:image"], meta[name="twitter:image"]')) {
      const url = meta.getAttribute('content') ?? '';
      expect(url).toMatch(/^https:\/\/mqgrader\.ro\/en\/og-[\w-]+\.png$/);
      expect(existsSync(`${ROOT}public${url.replace('https://mqgrader.ro', '')}`), url).toBe(true);
    }
    // Links to the public pages stay in English; the apps have one address for both.
    const internal = all(doc, 'a[href^="/"]').map((a) => a.getAttribute('href') ?? '');
    for (const href of internal) {
      if (a11yLangSwitch(doc, href) || href.startsWith('/teacher/') || href === '/') continue;
      expect(href, href).toMatch(/^\/en\//);
    }
  });

  it.each(TWINS)('$enUrl shows the trail its structured data claims', ({ en }) => {
    const doc = parse(en);
    const crumbs = all(doc, '.crumbs a, .crumbs span:not([aria-hidden])').map((el) => (el.textContent ?? '').trim());
    // The landing page has no trail.
    if (crumbs.length === 0) return;
    const ld = JSON.parse(doc.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}');
    const nodes: { '@type': string; itemListElement?: { name: string }[] }[] = ld['@graph'];
    const trail = nodes.find((n) => n['@type'] === 'BreadcrumbList')!.itemListElement!;
    expect(trail.map((e) => e.name)).toEqual(crumbs);
  });

  it.each(TWINS)('$enUrl has no Romanian text left', ({ en }) => {
    // Names stay: the school, the city, Laura Miron's site, the national exams.
    const text = visibleText(parse(en))
      .replace(/Timișoara|Matematică cu Laura Miron|Evaluarea Națională|Română/g, '')
      .replace(/\s+/g, ' ');
    expect(text).not.toMatch(/[ăâîșțĂÂÎȘȚ]/);
    expect(text).not.toMatch(/\b(și|pentru|lucrarea|elevii|baremul|corectare|testul)\b/i);
  });
});

// The "RO" link and a Quick Try link (the try's own page has one address)
// may lead outside /en/.
function a11yLangSwitch(doc: Document, href: string): boolean {
  return doc.querySelector(`[data-lang-switch][href="${href}"]`) !== null || all(doc, `[data-try-link][href="${href}"], [data-try-recover-link][href="${href}"], [data-try-phone-open][href="${href}"]`).length > 0;
}

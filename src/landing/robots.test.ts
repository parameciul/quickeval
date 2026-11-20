import { describe, expect, it } from 'vitest';
import baremRaw from '../../marking-scheme/index.html?raw';
import despreRaw from '../../about/index.html?raw';
import ghidRaw from '../../guide/index.html?raw';
import preturiRaw from '../../pricing/index.html?raw';
import enBaremRaw from '../../en/marking-scheme/index.html?raw';
import enDespreRaw from '../../en/about/index.html?raw';
import enGuideRaw from '../../en/guide/index.html?raw';
import enPreturiRaw from '../../en/pricing/index.html?raw';
import llms from '../../public/llms.txt?raw';
import robots from '../../public/robots.txt?raw';
import sitemap from '../../public/sitemap.xml?raw';
import { expandPartials } from './partials.ts';

const lines = robots
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));

// Each "User-agent" line starts a group; its rules are the lines up to the next group.
function groups() {
  const out: { agents: string[]; rules: string[] }[] = [];
  let last = '';
  for (const line of lines) {
    if (line.startsWith('Sitemap:')) continue;
    if (line.startsWith('User-agent:')) {
      const agent = line.slice('User-agent:'.length).trim();
      if (last === 'agent') out[out.length - 1]!.agents.push(agent);
      else out.push({ agents: [agent], rules: [] });
      last = 'agent';
    } else {
      out[out.length - 1]!.rules.push(line);
      last = 'rule';
    }
  }
  return out;
}

describe('robots.txt', () => {
  it('never closes the whole site', () => {
    expect(lines).not.toContain('Disallow: /');
  });

  it('keeps student links, Quick Try links and the API closed in every group', () => {
    const all = groups();
    expect(all.length).toBeGreaterThan(1);
    for (const group of all) {
      expect(group.rules, group.agents.join(',')).toContain('Allow: /');
      expect(group.rules, group.agents.join(',')).toContain('Disallow: /u/');
      expect(group.rules, group.agents.join(',')).toContain('Disallow: /try/');
      expect(group.rules, group.agents.join(',')).toContain('Disallow: /api/');
    }
  });

  it('lets the teacher login be crawled, so its noindex is seen', () => {
    expect(lines).not.toContain('Disallow: /teacher/');
  });

  it('names the sitemap on mqgrader.ro', () => {
    expect(lines).toContain('Sitemap: https://mqgrader.ro/sitemap.xml');
  });

  it('welcomes the AI search crawlers', () => {
    const agents = groups().flatMap((g) => g.agents);
    expect(agents).toEqual(expect.arrayContaining(['*', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot', 'Claude-SearchBot']));
  });
});

describe('sitemap.xml and llms.txt', () => {
  it('lists the public pages of mqgrader.ro and no other host', () => {
    const urls = Array.from(sitemap.matchAll(/<loc>(.*?)<\/loc>/g), (m) => m[1]);
    // The landing page first, then the four pages that answer a search.
    expect(urls).toEqual([
      'https://mqgrader.ro/',
      'https://mqgrader.ro/guide/',
      'https://mqgrader.ro/marking-scheme/',
      'https://mqgrader.ro/about/',
      'https://mqgrader.ro/pricing/',
      // Their English copies.
      'https://mqgrader.ro/en/',
      'https://mqgrader.ro/en/guide/',
      'https://mqgrader.ro/en/marking-scheme/',
      'https://mqgrader.ro/en/about/',
      'https://mqgrader.ro/en/pricing/',
    ]);
    // The private apps and a Quick Try's page are never in it.
    for (const url of urls) expect(url).not.toMatch(/\/(teacher|u|try)\//);
  });

  it('dates each page in the sitemap as the page dates itself', () => {
    const pages = [ghidRaw, baremRaw, despreRaw, preturiRaw, enGuideRaw, enBaremRaw, enDespreRaw, enPreturiRaw].map(expandPartials);
    const modDates = new Map<string, string>();
    for (const html of pages) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const ld = JSON.parse((doc.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}').replace(/\s+/g, ' '));
      const page = ld['@graph'].find((n: { '@type': string }) => n['@type'] === 'WebPage');
      modDates.set(page.url, page.dateModified);
    }
    const entries = Array.from(
      sitemap.matchAll(/<loc>(.*?)<\/loc>\s*<lastmod>(.*?)<\/lastmod>/g),
      (m): [string, string] => [m[1]!, m[2]!],
    );
    // The landing page has no date of its own; every other page does.
    for (const [url, lastmod] of entries) {
      if (url === 'https://mqgrader.ro/' || url === 'https://mqgrader.ro/en/') continue;
      expect(modDates.get(url), url).toBe(lastmod);
    }
    expect(modDates.size).toBe(8);
  });

  it('describe the product and link to mqgrader.ro only', () => {
    expect(llms).toMatch(/^# MQGrader/);
    const links = Array.from(llms.matchAll(/\]\((https?:[^)]+)\)/g), (m) => m[1]!);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.startsWith('https://mqgrader.ro/')).toBe(true);
    expect(llms).not.toContain('quickeval.pages.dev');
  });
});

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// IndexNow (Bing and the engines that share it) asks the site to prove it owns
// the addresses it announces: one file at the root, named with the key, whose
// text is the key. scripts/indexnow.mjs reads the same file.
const publicDir = new URL('../public/', import.meta.url);

describe('the IndexNow key', () => {
  it('is one file at the site root, named with the key and saying the key', () => {
    const keys = readdirSync(publicDir).filter((name) => /^[0-9a-f]{32,64}\.txt$/.test(name));
    expect(keys).toHaveLength(1);
    const key = keys[0]!.replace(/\.txt$/, '');
    expect(readFileSync(new URL(keys[0]!, publicDir), 'utf8').trim()).toBe(key);
  });

  it('announces the same pages the sitemap lists, on mqgrader.ro only', () => {
    // The script sends what the sitemap says; the sitemap is checked in
    // src/landing/robots.test.ts, so here it is only about the host.
    const sitemap = readFileSync(new URL('sitemap.xml', publicDir), 'utf8');
    const urls = Array.from(sitemap.matchAll(/<loc>(.*?)<\/loc>/g), (m) => m[1]!);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url.startsWith('https://mqgrader.ro/')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import redirects from '../../public/_redirects?raw';

const rules = redirects
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => line.split(/\s+/));

// The first rule whose source matches wins on Cloudflare Pages.
function firstRule(path: string): string[] | undefined {
  return rules.find(([from]) => {
    if (!from) return false;
    if (from.endsWith('/*')) return path.startsWith(from.slice(0, -1));
    return path === from;
  });
}

const MOVED = [
  ['ghid', 'guide'],
  ['barem', 'marking-scheme'],
  ['despre', 'about'],
  ['preturi', 'pricing'],
] as const;

describe('the old Romanian addresses of the public pages', () => {
  it.each(MOVED)('sends /%s and /%s/ to the English page with a 301', (old, now) => {
    expect(firstRule(`/${old}`)).toEqual([`/${old}`, `/${now}/`, '301']);
    expect(firstRule(`/${old}/`)).toEqual([`/${old}/*`, `/${now}/:splat`, '301']);
    expect(firstRule(`/${old}/index.html`)).toEqual([`/${old}/*`, `/${now}/:splat`, '301']);
  });

  it.each(MOVED)('sends the old share card og-%s.png to og-%s.png', (old, now) => {
    expect(firstRule(`/og-${old}.png`)).toEqual([`/og-${old}.png`, `/og-${now}.png`, '301']);
  });

  it("sends the guide's old picture name to the new picture", () => {
    expect(firstRule('/app-verificare.png')).toEqual(['/app-verificare.png', '/app-graded-paper.png', '301']);
    expect(firstRule('/app-graded-paper.png')).toBeUndefined();
  });

  it('leaves the new addresses and the apps alone', () => {
    for (const [, now] of MOVED) expect(firstRule(`/${now}/`)).toBeUndefined();
    expect(firstRule('/u/abcdefghijkmnop2')).toEqual(['/u/*', '/u/', '200']);
    expect(firstRule('/teacher/settings')).toEqual(['/teacher/*', '/teacher/', '200']);
  });
});

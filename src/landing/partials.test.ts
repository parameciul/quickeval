import { describe, expect, it } from 'vitest';
import { expandPartials, PARTIALS } from './partials.ts';

describe('expandPartials', () => {
  it('puts the named part in place of its include', () => {
    const html = '<body>\n      <!--#include site-foot -->\n</body>';
    const out = expandPartials(html);
    expect(out).toBe(`<body>\n      ${PARTIALS['site-foot']}\n</body>`);
    expect(out).toContain('<footer class="site-foot">');
    expect(out).not.toContain('#include');
  });

  it('replaces every include, not only the first', () => {
    const out = expandPartials('<!--#include site-foot --><!--#include site-foot -->');
    expect(out.match(/<footer class="site-foot">/g)).toHaveLength(2);
  });

  it('leaves a page with no include as it is', () => {
    const html = '<p>fără parte comună</p><!-- a plain comment -->';
    expect(expandPartials(html)).toBe(html);
  });

  it('fails on a part it does not know, instead of leaving a hole', () => {
    expect(() => expandPartials('<!--#include site-head -->')).toThrow('Unknown partial: site-head');
  });
});

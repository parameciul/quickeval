import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Read from the disk (Vitest runs in the project's root): Vitest hands a
// test an empty string for any CSS import.
const css = readFileSync('src/try/try.css', 'utf8');

function block(head: string): string {
  const start = css.indexOf(`${head} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

describe('try.css', () => {
  it('lets a Quick Try page take the full width of a desktop', () => {
    const page = block('.try-page');
    expect(page).toContain('width: 100%');
    expect(page).not.toContain('max-width');
  });

  it('gives the page the teacher pages\' side margins on a desktop only', () => {
    const start = css.indexOf('@media not (max-width: 56.25rem) {\n  .try-page {');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(css.slice(start, css.indexOf('}', start))).toContain('padding-inline: 2rem');
    expect(block('.try-page')).toContain('padding: 1.5rem 1rem 3rem');
  });

  it("gives the top bar the teacher app's sizes, on the bar alone", () => {
    const bar = block('.try-topbar');
    expect(bar).toContain('--bar: 80px');
    expect(bar).toContain('--top: 60px');
    const phone = css.indexOf('@media (max-width: 56.25rem) {\n  .try-topbar {');
    expect(phone).toBeGreaterThanOrEqual(0);
    expect(css.slice(phone, css.indexOf('}', phone))).toContain('--top: 56px');
    expect(block('.try-page')).not.toContain('--top');
  });

  it('sticks the shown files under the tabs', () => {
    expect(block('.try-panel')).toContain('--top: 2.75rem');
    expect(block('.try-tab')).toContain('height: 2.75rem');
  });

  it('keeps a notice narrow and in the middle', () => {
    expect(block('.try-notice')).toContain('max-width: 36rem');
  });
});

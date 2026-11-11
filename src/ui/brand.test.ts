import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import adminPage from '../../teacher/index.html?raw';
import uploadPage from '../../u/index.html?raw';

// Read from the disk (Vitest runs in the project's root): Vitest hands a
// test an empty string for any CSS import.
const css = readFileSync('src/ui/brand.css', 'utf8');

// The declarations of the first block that opens with `head {`, sorted.
function declarations(head: string): string[] {
  const start = css.indexOf(`${head} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const body = css.slice(start + head.length + 2, css.indexOf('}', start));
  return body
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .sort();
}

const value = (decls: string[], name: string) => decls.find((d) => d.startsWith(`${name}:`))?.slice(name.length + 1).trim();

describe('brand.css', () => {
  it('writes the dark colours twice, the same both times', () => {
    const chosen = declarations(':root[data-theme="dark"]');
    expect(chosen.length).toBeGreaterThan(20);
    expect(declarations('  :root:not([data-theme="light"])')).toEqual(chosen);
  });

  it('gives every colour of the dark theme a light value', () => {
    const light = declarations(':root').map((d) => d.slice(0, d.indexOf(':')));
    for (const decl of declarations(':root[data-theme="dark"]')) {
      const name = decl.slice(0, decl.indexOf(':'));
      if (name.startsWith('--')) expect(light).toContain(name);
    }
  });

  it('uses the colours of the redesign', () => {
    const light = declarations(':root');
    const dark = declarations(':root[data-theme="dark"]');
    expect([value(light, '--paper'), value(light, '--sheet'), value(light, '--text'), value(light, '--ink'), value(light, '--marker')]).toEqual([
      '#f3f5f8',
      '#ffffff',
      '#0c1524',
      '#1b5cc8',
      '#fdeee3',
    ]);
    expect([value(dark, '--paper'), value(dark, '--sheet'), value(dark, '--text'), value(dark, '--ink'), value(dark, '--marker')]).toEqual([
      '#0e1116',
      '#161a21',
      '#eef1f5',
      '#80b1ff',
      '#33200f',
    ]);
  });

  it('lines the result page header and footer up with its 64rem content', () => {
    expect(value(declarations('.upload-page.result-page'), 'max-width')).toBe('64rem');
    expect(value(declarations('.result-shell .wrap'), 'max-width')).toBe('64rem');
  });

  it('keeps the exercises and the final words in one column up to a small tablet', () => {
    const start = css.indexOf('@media (max-width: 56.25rem) {\n  .result-columns {');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(css.slice(start, css.indexOf('}', start))).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  it('prints the student result in one light column, without the buttons, files and footer', () => {
    const start = css.indexOf('@media print {');
    expect(start).toBeGreaterThanOrEqual(0);
    const print = css.slice(start);
    const hidden = print.slice(0, print.indexOf('display: none'));
    for (const selector of ['.student-nav', '.result-actions', '.result-page .files-head', '.result-page .page-files', '.result-foot']) {
      expect(hidden).toContain(selector);
    }
    expect(print).toMatch(/\.result-columns \{\s*grid-template-columns: minmax\(0, 1fr\);/);
    const light = declarations(':root');
    const printed = print.slice(print.indexOf(':root[data-theme="dark"]'));
    for (const decl of declarations(':root[data-theme="dark"]')) {
      const name = decl.slice(0, decl.indexOf(':'));
      expect(printed).toContain(`${name}: ${value(light, name)};`);
    }
  });

  it('gives the student header and footer links a finger-sized target', () => {
    expect(value(declarations('.student-nav a'), 'min-height')).toBe('2.75rem');
    expect(value(declarations('.result-foot a'), 'min-height')).toBe('2.75rem');
  });

  it('wraps a long word inside the cards of the panels', () => {
    expect(value(declarations('.class-item'), 'overflow-wrap')).toBe('anywhere');
    expect(value(declarations('.todo-card'), 'overflow-wrap')).toBe('anywhere');
  });

  it('wraps a long word in the title and the file names of the test page', () => {
    expect(value(declarations('.test-head h1'), 'overflow-wrap')).toBe('anywhere');
    expect(value(declarations('.file-title'), 'overflow-wrap')).toBe('anywhere');
  });

  it('keeps the fields of Fișa testului at 16px on a phone, so the phone does not zoom in', () => {
    const start = css.indexOf('@media (max-width: 56.25rem)', css.indexOf('.test-sheet {'));
    expect(start).toBeGreaterThanOrEqual(0);
    expect(css.slice(start, css.indexOf('\n}\n', start))).toContain('.test-sheet input {');
    expect(value(declarations('.test-sheet input'), 'font-size')).toBe('1rem');
  });

  it('keeps the phone menu inside the screen a phone shows now', () => {
    expect(declarations('.phone-menu')).toContain('max-height: calc(100dvh - var(--top) - var(--bottom))');
  });

  it('keeps the small buttons of the student pages big enough for a finger', () => {
    expect(value(declarations('.upload-page .button-small'), 'min-height')).toBe('2.75rem');
  });

  it('is flat: no gradient, no notebook grid', () => {
    expect(css).not.toMatch(/gradient\(/);
    expect(css).not.toContain('--grid');
  });

  it('sets the text in Schibsted Grotesk, loaded by the teacher and the student pages', () => {
    expect(value(declarations(':root'), '--font')).toMatch(/^"Schibsted Grotesk",/);
    for (const page of [adminPage, uploadPage]) {
      expect(page).toContain('https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800');
      expect(page).not.toContain('Atkinson');
    }
  });

  it('leaves no width between the phone layout and the desktop layout', () => {
    expect(css).not.toContain('min-width: 56.3125rem');
    expect(css).toContain('not (max-width: 56.25rem)');
  });

  it('keeps anchored targets under the bar and stops the page bouncing', () => {
    expect(value(declarations('html'), 'scroll-padding-top')).toBeDefined();
    expect(value(declarations('html'), 'overscroll-behavior-y')).toBe('none');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import adminPage from '../../admin/index.html?raw';
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

  it('wraps a long word inside the cards of the panels', () => {
    expect(value(declarations('.class-item'), 'overflow-wrap')).toBe('anywhere');
    expect(value(declarations('.todo-card'), 'overflow-wrap')).toBe('anywhere');
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
});

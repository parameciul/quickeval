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

  it('gives the result page, its header and its footer the full width of a desktop', () => {
    expect(value(declarations('.upload-page.result-page,\n.result-shell .wrap'), 'max-width')).toBe('none');
    const start = css.indexOf('@media not (max-width: 56.25rem) {\n  .result-shell .wrap {');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(css.slice(start, css.indexOf('}', start))).toContain('padding-inline: 2rem');
  });

  it('gives the exercises table all the room the final words leave', () => {
    expect(value(declarations('.result-columns'), 'grid-template-columns')).toBe('minmax(0, 1fr) minmax(23.4rem, 31.2rem)');
  });

  it('puts the final words under the exercises while the files are shown', () => {
    expect(value(declarations('.result-layout:not(.is-collapsed) .result-columns'), 'grid-template-columns')).toBe('minmax(0, 1fr)');
  });

  it('draws the hidden files as a strip on every page that has them', () => {
    expect(css).not.toContain('.submission-page .result-files');
    expect(css).not.toContain('.submission-page .files-head');
    const strip = declarations('.result-layout .result-files.is-collapsed .files-head');
    expect(value(strip, 'border')).toBe('1px solid var(--rule)');
    expect(value(strip, 'padding')).toBe('0.6rem 1rem');
    // Four classes: more than ".result-layout.is-collapsed .files-head", which
    // takes the bottom padding away.
    expect(value(declarations('.result-layout.is-collapsed .files-head'), 'padding-bottom')).toBe('0');
    expect(value(declarations('.result-files .files-head h2'), 'font-size')).toBe('1rem');
  });

  it("sticks the student's shown files under the student page's header", () => {
    expect(value(declarations('.result-page'), '--top')).toBe('calc(3.75rem + 1px)');
  });

  it('keeps the exercises and the final words in one column up to a small laptop', () => {
    const start = css.indexOf('@media (max-width: 70rem) {\n  .result-columns {');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(css.slice(start, css.indexOf('}', start))).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  it('prints the student result in one light column, without the buttons, files and footer', () => {
    const start = css.indexOf('@media print {');
    expect(start).toBeGreaterThanOrEqual(0);
    const print = css.slice(start);
    const hidden = print.slice(0, print.indexOf('display: none'));
    for (const selector of ['.student-nav', '.result-actions', '.result-page .result-files', '.result-foot']) {
      expect(hidden).toContain(selector);
    }
    expect(print).toMatch(/\.result-columns \{\s*grid-template-columns: minmax\(0, 1fr\);/);
    expect(print).toMatch(/\.result-page \.result-layout \{\s*grid-template-columns: minmax\(0, 1fr\);/);
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

  it('ticks a done step of Test nou with a CSS escape, so the file stays ASCII there', () => {
    expect(value(declarations('.step.is-done::before'), 'content')).toBe('"\\2713"');
  });

  it('keeps room under a focused control for the sticky bar at the foot of the test page, only on a page with it', () => {
    expect(value(declarations('html'), 'scroll-padding-bottom')).toBeUndefined();
    expect(value(declarations('html:has(.stage-bar)'), 'scroll-padding-bottom')).toBe('4.25rem');
    expect(css).toContain('  html:has(.stage-bar) {\n    scroll-padding-bottom: calc(4.25rem + 4rem + env(safe-area-inset-bottom, 0px));');
  });

  it('keeps the bar at the foot of the test page on one line, and its note off a narrow phone', () => {
    expect(value(declarations('.stage-bar'), 'flex-wrap')).toBe('nowrap');
    expect(css).toContain('.stage-bar-wait {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;');
    const start = css.lastIndexOf('@media (max-width: 56.25rem)', css.indexOf('  .stage-bar {\n    bottom: var(--bottom);'));
    expect(start).toBeGreaterThanOrEqual(0);
    const narrow = css.indexOf('@media (max-width: 30rem)', start);
    expect(narrow).toBeGreaterThan(start);
    expect(css.slice(narrow, css.indexOf('\n}\n', narrow))).toContain('.stage-bar-wait {\n    display: none;');
  });

  it('puts the bar on the left on a phone turned sideways, and keeps the bottom bar on a phone held upright', () => {
    const head = '@media (min-width: 33.75rem) and (max-width: 56.25rem) and (orientation: landscape) {';
    const start = css.indexOf(head);
    expect(start).toBeGreaterThan(css.indexOf('  .rail {\n    position: fixed;'));
    const block = css.slice(start, css.indexOf('\n}\n', start));
    // No bottom bar: the page, the panels and the test page's bar reach the screen's foot.
    expect(block).toContain('  .shell:not(.shell-bare) {\n    --bottom: 0px;');
    expect(block).toContain('grid-template-columns: var(--side) minmax(0, 1fr);');
    expect(block).toContain('--side: calc(var(--bar) + env(safe-area-inset-left, 0px));');
    expect(block).toContain('  html:has(.stage-bar) {\n    scroll-padding-bottom: 4.25rem;');
    // The bar is a column under the top bar, the camera's side included, and scrolls on a very short screen.
    const rail = block.slice(block.indexOf('  .shell:not(.shell-bare) .rail {'));
    expect(rail).toContain('top: var(--top);');
    expect(rail).toContain('bottom: 0;');
    expect(rail).toContain('flex-direction: column;');
    expect(rail).toContain('width: var(--side);');
    expect(rail).toContain('overflow-y: auto;');
    expect(rail).toContain('border-right: 1px solid var(--rule);');
    // The page sits beside it, and a panel opens beside it, as on a laptop.
    expect(block).toContain('  .shell:not(.shell-bare) > .page {\n    grid-column: 2;');
    expect(block).toContain('  .shell:not(.shell-bare) .panel {\n    left: var(--side);\n    width: 24rem;');
    // ☰ opens its menu beside the bar, never under it: its two groups side by
    // side, in a grid (columns would push what does not fit off the screen's
    // side), scrolling down when still too tall, with no second camera room.
    const menu = block.slice(block.indexOf('  .shell:not(.shell-bare) .phone-menu {'));
    expect(menu).toContain('left: var(--side);\n    display: grid;\n    grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(menu).toContain('align-items: start;');
    expect(menu).toContain('max-height: calc(100dvh - var(--top));');
    expect(menu).toContain('padding-left: 1rem;');
    expect(block).not.toMatch(/columns: 2/);
    // A mouse in a narrow window sees the item it points at.
    expect(block).toContain('  .shell:not(.shell-bare) .rail-item:hover {\n    background: var(--raised);');
    // Every rule is the teacher shell's, so the login screen (no bar) keeps its one column.
    const selectors = block.slice(block.indexOf('{') + 1).match(/^ {2}[^ \n/][^{]*\{/gm) ?? [];
    expect(selectors.length).toBeGreaterThan(5);
    for (const selector of selectors) if (!selector.startsWith('  html:')) expect(selector).toContain('.shell:not(.shell-bare)');
    // The test page's bar starts at the page's 1rem left room, beside the bar.
    const stage = css.indexOf(head, start + head.length);
    expect(stage).toBeGreaterThan(css.indexOf('  .stage-bar {\n    bottom: var(--bottom);'));
    expect(css.slice(stage, css.indexOf('\n}\n', stage))).toContain('  .shell:not(.shell-bare) .stage-bar {\n    margin-left: -1rem;\n    padding-left: 1rem;');
    // A phone held upright keeps the bar at the bottom.
    expect(css).toContain('  .rail {\n    position: fixed;\n    top: auto;\n    right: 0;\n    bottom: 0;\n    left: 0;');
  });

  it('puts the bar at the foot of a short page, and gives it the room of a button', () => {
    expect(value(declarations('.shell > .page:has(.stage-bar)'), 'display')).toBe('flex');
    expect(value(declarations('.test-page:has(.stage-bar)'), 'flex')).toBe('1');
    expect(value(declarations('.stage-bar'), 'margin')).toBe('auto -2rem -3rem');
    expect(value(declarations('.stage-bar'), 'min-height')).toBe('3.25rem');
  });

  it('draws what waits in a class of Clasele tale in orange, not bold, after a dot in the class colour', () => {
    expect(declarations('.class-item-test.is-waiting')).toContain('color: var(--orange)');
    expect(value(declarations('.class-item-test.is-waiting'), 'font-weight')).toBeUndefined();
    expect(value(declarations('.class-dot'), 'background')).toBe('hsl(var(--tone-hue) 60% 52%)');
  });

  it('draws the class page as the test page: no bold, test names cut after two lines', () => {
    expect(value(declarations('table.grades-table tbody th'), 'font-weight')).toBe('400');
    expect(value(declarations('table.grades-table th.grade-head a'), 'font-weight')).toBe('500');
    expect(value(declarations('table.grades-table th.grade-head a'), '-webkit-line-clamp')).toBe('2');
    expect(value(declarations('a.class-test-title'), 'font-weight')).toBe('500');
    expect(value(declarations('a.class-test-title'), '-webkit-line-clamp')).toBe('2');
    expect(value(declarations('.grade-head-note.is-waiting'), 'font-weight')).toBeUndefined();
    expect(value(declarations('.class-test-stage.is-waiting'), 'font-weight')).toBeUndefined();
    expect(value(declarations('.class-switch-button'), 'font-weight')).toBe('500');
    expect(value(declarations('.class-tab'), 'font-weight')).toBe('500');
    expect(value(declarations('.text-button'), 'font-weight')).toBe('500');
    expect(value(declarations('.student-pick[aria-current="true"]'), 'font-weight')).toBe('500');
    expect(value(declarations('table.student-results tbody th a'), 'font-weight')).toBe('500');
    expect(value(declarations('table.grades-table th.grade-head a'), 'overflow-wrap')).toBe('anywhere');
    expect(value(declarations('a.class-test-title'), 'overflow-wrap')).toBe('anywhere');
    // No rule paints a waiting grade orange or bold any more: the dot says it.
    expect(css).not.toMatch(/td\.grade-flag\s*\{/);
    expect(css).not.toMatch(/\.class-menu-item\.is-muted b\b/);
    expect(css).not.toMatch(/table\.student-results \.is-waiting\s*\{/);
    // A student who left: the chip is grey like the rest of the row.
    expect(declarations('table.grades-table tr.is-muted .grade-chip')).toContain('color: var(--muted)');
    // The link's underline does not reach the chip, an inline block: it has its own.
    expect(value(declarations('table.history-table td a:hover .grade-chip'), 'text-decoration')).toBe('underline');
    expect(css).toContain('table.grades-table td a:hover .grade-chip,\ntable.history-table td a:hover .grade-chip {');
  });

  it('keeps the phone menu inside the screen a phone shows now', () => {
    expect(declarations('.phone-menu')).toContain('max-height: calc(100dvh - var(--top) - var(--bottom))');
  });

  it('draws the phone menu in rows of 44px with plain words, an icon before each', () => {
    expect(value(declarations('.menu-row'), 'min-height')).toBe('2.75rem');
    for (const head of ['.menu-row', '.menu-row label', '.menu-link', '.menu-quiet']) expect(value(declarations(head), 'font-weight'), head).toBe('400');
    expect(declarations('.menu-label')).toEqual(['align-items: center', 'display: inline-flex', 'gap: 0.75rem']);
    expect(css).toContain('.menu-link svg,\n.menu-label svg {\n  width: 1.375rem;');
    // "Cont demo" of a demo account is plain in the menu too; only the name is bold.
    expect(value(declarations('.phone-demo .demo-title'), 'font-weight')).toBe('400');
  });

  it('keeps the small buttons of the student pages big enough for a finger', () => {
    expect(value(declarations('.upload-page .button-small'), 'min-height')).toBe('2.75rem');
  });

  it('lets the decision and the paper under an open row wrap, so the exercises table never scrolls sideways', () => {
    const start = css.indexOf('@media (min-width: 48.01rem) {\n  .graded-result table.items td[data-label="Puncte"]');
    expect(start).toBeGreaterThanOrEqual(0);
    const rule = css.slice(start, css.indexOf('}', start));
    expect(rule).toContain('white-space: nowrap');
    expect(rule).toContain('tr:not(.item-decision):not(.item-photo) > td:last-child');
    expect(rule).not.toMatch(/table\.items td:last-child/);
  });

  it('shows the keys of the paper page only when their whole line fits in the bar', () => {
    const keys = declarations('.review-keys');
    expect(value(keys, 'flex-wrap')).toBe('wrap');
    expect(value(keys, 'overflow')).toBe('hidden');
    expect(value(keys, 'height')).toBe(value(declarations('.review-keys::before'), 'height'));
    expect(value(declarations('.review-keys-line'), 'white-space')).toBe('nowrap');
  });

  it('draws the papers tables as the points table of Verificare, with no bold', () => {
    expect(value(declarations('table.uploads thead th'), 'font-weight')).toBe('500');
    expect(value(declarations('table.uploads thead th'), 'background')).toBe('var(--raised)');
    expect(value(declarations('table.uploads tbody th'), 'font-weight')).toBe('500');
    expect(value(declarations('.grade-chip'), 'font-weight')).toBe('500');
    expect(value(declarations('  table.uploads tbody td[data-label]::before'), 'font-weight')).toBe('500');
    // On a phone the select-all toolbar of Corectare stands alone, not on the header band.
    expect(value(declarations('  table.uploads.is-selectable thead th.select-col'), 'background')).toBe('none');
  });

  it('draws the class report as the test page: no bold, the grade groups in the grade colours', () => {
    expect(value(declarations('table.report-table thead th'), 'font-weight')).toBe('500');
    expect(value(declarations('table.report-table tbody th'), 'font-weight')).toBe('400');
    expect(value(declarations('table.report-table tbody th a'), 'text-decoration')).toBe('none');
    expect(value(declarations('.report-tiles dt'), 'font-weight')).toBe('500');
    expect(value(declarations('.report-tiles dd'), 'font-weight')).toBe('500');
    expect(value(declarations('.report-bars-count'), 'font-weight')).toBeUndefined();
    expect(value(declarations('table.report-table .grade-col'), 'text-align')).toBe('left');
    for (const level of [1, 3, 4, 5]) {
      expect(value(declarations(`.report-card-bar > .bar-${level},\n.report-bar > .bar-${level}`), 'background')).toBe(`var(--conf-${level})`);
    }
  });

  it('keeps the name and the grade of the class report in view on a phone, the tiles first', () => {
    const name = declarations('table.results-table.is-phone th:first-child');
    const grade = declarations('table.results-table.is-phone .grade-col');
    expect(value(grade, 'position')).toBe('sticky');
    expect(value(grade, 'left')).toBe(value(name, 'width'));
    expect(value(name, 'max-width')).toBe(value(name, 'width'));
    expect(value(name, 'white-space')).toBe('normal');
    // The grade keeps the room of the last columns wherever it sits.
    expect(value(declarations('table.results-table .grade-col'), 'padding-left')).toBe('0.6rem');
    // A row with no paper keeps its words beside the name.
    const note = declarations('table.results-table.is-phone tr.is-muted .missing-note');
    expect(value(note, 'position')).toBe('sticky');
    expect(value(note, 'left')).toBe(`calc(${value(name, 'width')} + ${value(declarations('table.results-table .grade-col'), 'padding-left')})`);
    expect(value(declarations('table.results-table.is-phone .points-pill svg'), 'width')).toBe('0.9em');
    expect(value(declarations('  .report-main'), 'display')).toBe('contents');
    expect(value(declarations('  .report-main > .report-part:first-child'), 'order')).toBe('1');
    expect(value(declarations('  .report-side'), 'order')).toBe('2');
  });

  it('gives the stage sentence the whole width of the panel, and puts "Raportul clasei" beside the students only in a wide panel', () => {
    expect(value(declarations('.stage-head p'), 'max-width')).toBeUndefined();
    expect(value(declarations('.results-layout'), 'container-type')).toBe('inline-size');
    expect(value(declarations('.results-grid'), 'grid-template-columns')).toBe('minmax(0, 1fr)');
    expect(css).toContain('@container (min-width: 56rem) {\n  .results-grid {\n    grid-template-columns: minmax(0, 1fr) 18rem;');
    // Beside the table, level with the table's top, not with "Elevii" above it.
    expect(css).toContain('  .results-grid > .report-card {\n    grid-row: 2;\n    grid-column: 2;\n  }');
    expect(css).toContain('  .results-grid > .results-students {\n    grid-row: 1 / span 2;\n    grid-column: 1;\n    grid-template-rows: subgrid;\n  }');
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

  it('lets the "Elevi" card fill the room under the top bar with no measuring, its list scrolling inside it', () => {
    // On a computer (the first indented rule, inside the media query): the
    // page, the class page and its tab panel are columns; the card takes
    // what is left, and counts as 28rem when the page is measured.
    expect(value(declarations('  .shell > .page:has(> .class-page .student-split),\n  .class-page:has(.student-split),\n  .class-page:has(.student-split) > #class-panel'), 'flex-direction')).toBe('column');
    const card = declarations('  .student-split');
    expect(value(card, 'flex')).toBe('1 1 0');
    expect(value(card, 'min-height')).toBe('28rem');
    expect(value(card, 'height')).toBeUndefined();
    expect(css).not.toContain('--split-top');
    // A short list keeps "Adaugă elevi" right under it; a long one scrolls.
    const list = declarations('  .student-list ul');
    expect(value(list, 'flex')).toBe('0 1 auto');
    expect(value(list, 'min-height')).toBe('0');
  });

  it('writes the gap of the account menu in its one rule', () => {
    expect(css.split('.user-menu a,\n.user-menu button {')).toHaveLength(2);
    expect(value(declarations('.user-menu a,\n.user-menu button'), 'gap')).toBe('0.625rem');
  });
});

// Turns the barem that Claude wrote (GeneratedBarem) into Markdown and then
// into a Word file with pandoc. The look comes from barem-reference.docx
// (A4, margins 1418, Times New Roman 12 pt). It was made with:
//   pandoc -o runner/barem-reference.docx --print-default-data-file reference.docx
//   unzip it, in word/document.xml set <w:pgSz w:w="11906" w:h="16838"/> and
//   <w:pgMar ... w:top/right/bottom/left="1418"/>, in word/styles.xml set the
//   default font (w:docDefaults rFonts and w:sz 24) to Times New Roman 12 pt,
//   then zip it again: tar -a -c -f ../barem-reference.docx [Content_Types].xml _rels docProps word
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GeneratedBarem } from '../shared/schemas.ts';
import { type Pandoc, realPandoc } from './workdir.ts';

const REFERENCE_DOC = path.resolve(import.meta.dirname, 'barem-reference.docx');

// The dash counts make pandoc give the two columns 90% and 10% of the page.
const SEPARATOR = `|${'-'.repeat(100)}|${'-'.repeat(9)}:|`;

const MARKDOWN_SPECIAL = /[\\*_#<>[\]`|]/g;

function escapeText(text: string): string {
  return text.replace(MARKDOWN_SPECIAL, (c) => `\\${c}`);
}

// The space after \vert keeps it from gluing to a letter. A closing "$" that
// follows a space is not math for pandoc, so a trailing space goes.
function escapeMath(math: string): string {
  return math.replace(/\\\|/g, '\\Vert ').replace(/\|/g, '\\vert ').trimEnd();
}

// One table cell: a single line, Markdown escaped outside math, pipes made safe
// inside math, display math turned into inline math.
export function escapeCell(text: string): string {
  const flat = text.replace(/\s*\n\s*/g, ' ').replace(/\$\$/g, '$');
  const escaped = flat
    .split('$')
    .map((part, i) => (i % 2 === 1 ? escapeMath(part) : escapeText(part)))
    .join('$');
  // "1." or "a)" at the start would become a list.
  return escaped.replace(/^(\d+)([.)])/, '$1\\$2').replace(/^([A-Za-z])\)/, '$1\\)');
}

function pointsText(points: number): string {
  if (points === 1) return '1 punct';
  return points >= 20 ? `${points} de puncte` : `${points} puncte`;
}

export function baremMarkdown(barem: GeneratedBarem): string {
  const blocks: string[] = [
    '**BAREM DE EVALUARE ȘI DE NOTARE**',
    `**${escapeCell(barem.title)}**`,
    escapeCell(barem.subtitle),
    '**Precizări privind evaluarea**',
    ...barem.notes.map((note) => `• ${escapeCell(note)}`),
  ];
  for (const part of barem.parts) {
    if (part.title.trim() !== '') blocks.push(`**${escapeCell(part.title)}**`);
    for (const section of part.sections) {
      const rows = [`| **${escapeCell(section.title)}** (${pointsText(section.points)}) | |`, SEPARATOR];
      for (const item of section.items) {
        item.steps.forEach((step, i) => {
          const text = i === 0 ? `${item.label} ${step.text}` : step.text;
          rows.push(`| ${escapeCell(text)} | **${step.points}p** |`);
        });
      }
      blocks.push(rows.join('\n'));
    }
  }
  return `${blocks.join('\n\n')}\n`;
}

// Writes barem.md in the folder, runs pandoc there, and returns the Word file.
export async function makeBaremDocx(barem: GeneratedBarem, folder: string, pandoc: Pandoc = realPandoc): Promise<Uint8Array> {
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'barem.md'), baremMarkdown(barem), 'utf8');
  await pandoc(['--sandbox', '-f', 'markdown', '-t', 'docx', '--reference-doc', REFERENCE_DOC, '-o', 'barem.docx', 'barem.md'], folder);
  return new Uint8Array(await readFile(path.join(folder, 'barem.docx')));
}

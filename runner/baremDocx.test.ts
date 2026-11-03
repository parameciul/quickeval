import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GeneratedBarem } from '../shared/schemas.ts';
import { baremMarkdown, escapeCell, makeBaremDocx } from './baremDocx.ts';

const hasPandoc = spawnSync('pandoc', ['--version']).status === 0;

const SEPARATOR = `|${'-'.repeat(100)}|${'-'.repeat(9)}:|`;

const sample: GeneratedBarem = {
  title: 'Test de evaluare – Permutări',
  subtitle: 'Matematică – clasa a XI-a R1 – Timp de lucru: 50 de minute',
  notes: ['Se acordă 10 puncte din oficiu.', 'Orice altă rezolvare corectă se punctează corespunzător.'],
  total: 100,
  officePoints: 10,
  parts: [
    {
      title: 'RÂNDUL I',
      sections: [
        {
          title: 'SUBIECTUL I',
          points: 30,
          items: [
            {
            label: '1.',
              steps: [
                { text: 'Calculează $5! = 120$.', points: 10 },
                { text: 'Obține $|x| = 2$ și $|y|$.', points: 5 },
              ],
            },
            { label: 'a)', steps: [{ text: 'Răspuns final.', points: 15 }] },
          ],
        },
        { title: 'SUBIECTUL II', points: 60, items: [{ label: '2.', steps: [{ text: 'Totul.', points: 60 }] }] },
      ],
    },
  ],
};

const sampleWithMatrix: GeneratedBarem = {
  ...sample,
  parts: [
    {
      title: '',
      sections: [
        {
          title: 'SUBIECTUL I',
          points: 90,
          items: [{ label: '1.', steps: [{ text: 'Matricea $\\begin{pmatrix}1 & 2\\\\ 4 & 5\\end{pmatrix}$.', points: 90 }] }],
        },
      ],
    },
  ],
};

describe('baremMarkdown', () => {
  it('writes one table per section with 90/10 columns', () => {
    const md = baremMarkdown(sample);
    expect(md).toContain('| **SUBIECTUL I** (30 de puncte) | |');
    expect(md).toContain('| **SUBIECTUL II** (60 de puncte) | |');
    expect(md.split(SEPARATOR).length - 1).toBe(2);
    expect(md).toContain('| Obține $\\vert x\\vert  = 2$ și $\\vert y\\vert$. | **5p** |');
    expect(md.startsWith('**BAREM DE EVALUARE ȘI DE NOTARE**\n\n**Test de evaluare – Permutări**\n\n')).toBe(true);
    expect(md).toContain('**Precizări privind evaluarea**\n\n• Se acordă 10 puncte din oficiu.\n\n• Orice altă');
    expect(md).toContain('**RÂNDUL I**\n\n| **SUBIECTUL I**');
  });

  it('puts the label before the first step only', () => {
    const md = baremMarkdown(sample);
    expect(md).toContain('| 1\\. Calculează $5! = 120$. | **10p** |');
    expect(md).toContain('| Obține');
    expect(md).not.toContain('| 1\\. Obține');
  });

  it('says "puncte" without "de" under 20 points and leaves out an empty part title', () => {
    const small: GeneratedBarem = { ...sample, parts: [{ title: '', sections: [{ ...sample.parts[0]!.sections[1]!, title: 'S', points: 10 }] }] };
    const md = baremMarkdown(small);
    expect(md).toContain('(10 puncte)');
    expect(md).not.toContain('**RÂNDUL');
  });

  it('says "punct" for one point', () => {
    const one: GeneratedBarem = { ...sample, parts: [{ title: '', sections: [{ ...sample.parts[0]!.sections[1]!, title: 'S', points: 1 }] }] };
    const md = baremMarkdown(one);
    expect(md).toContain('(1 punct)');
    expect(md).not.toContain('1 puncte');
  });
});

describe('escapeCell', () => {
  it('escapes pipes inside math', () => expect(escapeCell('$|x| = 2$')).toBe('$\\vert x\\vert  = 2$'));
  it('escapes double bars inside math', () => expect(escapeCell('$\\|v\\|$')).toBe('$\\Vert v\\Vert$'));
  it('keeps a pipe at the end of math from leaving a space before the closing dollar', () => expect(escapeCell('Din $|x|$')).toBe('Din $\\vert x\\vert$'));
  it('turns display math into inline math', () => expect(escapeCell('$$x^2$$')).toBe('$x^2$'));
  it('joins lines', () => expect(escapeCell('a\nb')).toBe('a b'));
  it('keeps a leading number from becoming a list', () => expect(escapeCell('1. x')).toBe('1\\. x'));
  it('escapes Markdown outside math only', () => expect(escapeCell('a*b $a*b$')).toBe('a\\*b $a*b$'));
  it('keeps a leading "a)" from becoming a list', () => expect(escapeCell('a) x')).toBe('a\\) x'));
});

async function documentXml(bytes: Uint8Array, dir: string): Promise<string> {
  const file = path.join(dir, 'out.docx');
  writeFileSync(file, bytes);
  const run = spawnSync('tar', ['-xOf', 'out.docx', 'word/document.xml'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.status === 0) return run.stdout;
  // GNU tar does not read zip files; unzip does.
  const unzip = spawnSync('unzip', ['-p', 'out.docx', 'word/document.xml'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (unzip.status !== 0) throw new Error('cannot read the docx');
  return unzip.stdout;
}

describe.skipIf(!hasPandoc)('makeBaremDocx with the real pandoc', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'barem-docx-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('makes a Word file with real equations and A4 pages', async () => {
    const bytes = await makeBaremDocx(sampleWithMatrix, tmp);
    const xml = await documentXml(bytes, tmp);
    expect(xml.match(/<m:mr>/g)?.length).toBe(2);
    expect(xml).toContain('w:w="11906"');
    expect(xml).not.toContain('w:numPr');
  });

  it('keeps labels like "1." and "a)" out of lists', async () => {
    const xml = await documentXml(await makeBaremDocx(sample, tmp), tmp);
    expect(xml).not.toContain('w:numPr');
    expect(xml.match(/<w:tbl>/g)?.length).toBe(2);
    expect(xml).not.toContain('$');
  });
});

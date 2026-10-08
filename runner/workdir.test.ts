import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DOCX_TYPE, PDF_TYPE } from '../shared/files.ts';
import type { ExerciseList } from '../shared/schemas.ts';
import { makeWorkFolder, type Pandoc, removeFolder, runFolder } from './workdir.ts';

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [{ id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 9, answer: '3/4', scoringNotes: '', topic: 'Fracții' }],
  notes: '',
};

const bytes = (text: string) => new TextEncoder().encode(text);
const pdf = (text: string) => ({ bytes: bytes(`%PDF-1.7 ${text}`), contentType: PDF_TYPE });
const docx = (text: string) => ({ bytes: bytes(`PK docx ${text}`), contentType: DOCX_TYPE });
// A 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');

let root: string;
let skillDir: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'qe-work-'));
  skillDir = path.join(root, 'skill');
  mkdirSync(path.join(skillDir, 'references'), { recursive: true });
  writeFileSync(path.join(skillDir, 'SKILL.md'), '# skill');
  writeFileSync(path.join(skillDir, 'references', 'grading-rules.md'), '# rules');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// Every file under the folder, with "/" between the parts.
function filesIn(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(folder, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();
}

describe('makeWorkFolder', () => {
  it("lays out a grading: the skill, the test, the barem, the list, and the pages by upload order", async () => {
    const pages = [
      { bytes: bytes('jpeg 1'), contentType: 'image/jpeg' },
      { bytes: bytes('png 2'), contentType: 'image/png' },
      { bytes: bytes('%PDF-1.7 3'), contentType: PDF_TYPE },
      { bytes: bytes('webp 4'), contentType: 'image/webp' },
    ];
    const folder = await makeWorkFolder(path.join(root, 'run'), 'grade-7', { test: pdf('test'), barem: pdf('barem'), exerciseList: LIST, pages }, { skillDir });
    expect(folder).toBe(path.join(root, 'run', 'grade-7'));
    expect(filesIn(folder)).toEqual([
      '.claude/skills/evaluate-test/SKILL.md',
      '.claude/skills/evaluate-test/references/grading-rules.md',
      'barem/barem.pdf',
      'exercises.json',
      'student/page-01.jpg',
      'student/page-02.png',
      'student/page-03.pdf',
      'student/page-04.webp',
      'test/test.pdf',
    ]);
    expect(JSON.parse(readFileSync(path.join(folder, 'exercises.json'), 'utf8'))).toEqual(LIST);
    expect(readFileSync(path.join(folder, 'student', 'page-02.png'), 'utf8')).toBe('png 2');
    expect(readFileSync(path.join(folder, 'barem', 'barem.pdf'), 'utf8')).toBe('%PDF-1.7 barem');
  });

  it('numbers pages with two digits', async () => {
    const pages = Array.from({ length: 11 }, (_, i) => ({ bytes: bytes(`page ${i + 1}`), contentType: 'image/jpeg' }));
    const folder = await makeWorkFolder(root, 'grade-8', { test: pdf('t'), barem: pdf('b'), exerciseList: LIST, pages }, { skillDir });
    expect(readdirSync(path.join(folder, 'student')).at(-1)).toBe('page-11.jpg');
    expect(readFileSync(path.join(folder, 'student', 'page-11.jpg'), 'utf8')).toBe('page 11');
  });

  it('lays out an exercise list without a list or pages', async () => {
    const folder = await makeWorkFolder(root, 'exercise-list-3', { test: pdf('test'), barem: pdf('barem') }, { skillDir });
    expect(filesIn(folder)).toEqual([
      '.claude/skills/evaluate-test/SKILL.md',
      '.claude/skills/evaluate-test/references/grading-rules.md',
      'barem/barem.pdf',
      'test/test.pdf',
    ]);
  });

  it('turns a Word file into Markdown with pandoc, in the work folder, and removes the Word file', async () => {
    const calls: { args: string[]; cwd: string }[] = [];
    const pandoc: Pandoc = async (args, cwd) => {
      calls.push({ args, cwd });
      expect(readFileSync(path.join(cwd, 'test', 'source.docx'), 'utf8')).toBe('PK docx test');
      writeFileSync(path.join(cwd, 'test', 'test.md'), '# Test');
    };
    const folder = await makeWorkFolder(root, 'exercise-list-4', { test: docx('test'), barem: pdf('barem') }, { skillDir, pandoc });
    expect(calls).toEqual([{ args: ['test/source.docx', '-t', 'markdown', '--extract-media=test', '-o', 'test/test.md'], cwd: folder }]);
    expect(filesIn(folder)).toContain('test/test.md');
    expect(existsSync(path.join(folder, 'test', 'source.docx'))).toBe(false);
  });

  it('refuses a teacher file that is neither PDF nor Word', async () => {
    const odt = { bytes: bytes('odt'), contentType: 'application/vnd.oasis.opendocument.text' };
    await expect(makeWorkFolder(root, 'exercise-list-5', { test: odt, barem: pdf('b') }, { skillDir })).rejects.toThrow('unknown test file type');
  });

  it('starts again from an empty folder', async () => {
    const first = await makeWorkFolder(root, 'grade-9', { test: pdf('t'), barem: pdf('b'), exerciseList: LIST, pages: [pdf('old')] }, { skillDir });
    writeFileSync(path.join(first, 'left-over.txt'), 'x');
    const second = await makeWorkFolder(root, 'grade-9', { test: pdf('t'), barem: pdf('b') }, { skillDir });
    expect(filesIn(second)).not.toContain('left-over.txt');
    expect(filesIn(second)).not.toContain('student/page-01.pdf');
  });
});

const hasPandoc = spawnSync('pandoc', ['--version']).status === 0;

describe.skipIf(!hasPandoc)('makeWorkFolder with the real pandoc', () => {
  it('keeps lettered items, TeX math, and pictures that Claude can open from the work folder', async () => {
    const source = path.join(root, 'source');
    mkdirSync(source);
    writeFileSync(path.join(source, 'figura.png'), PNG);
    writeFileSync(
      path.join(source, 'test.md'),
      '1. Calculați.\n\n2. Exercițiul doi:\n\n   a) Simplificați fracția $\\frac{18}{24}$.\n\n   b) Comparați fracțiile.\n\n![Figura 1](figura.png)\n',
    );
    expect(spawnSync('pandoc', ['test.md', '-o', 'test.docx'], { cwd: source }).status).toBe(0);
    const word = { bytes: readFileSync(path.join(source, 'test.docx')), contentType: DOCX_TYPE };

    const folder = await makeWorkFolder(root, 'exercise-list-6', { test: word, barem: pdf('barem') }, { skillDir });
    const markdown = readFileSync(path.join(folder, 'test', 'test.md'), 'utf8');
    expect(markdown).toMatch(/a\)\s+Simplificați/);
    expect(markdown).toMatch(/b\)\s+Comparați/);
    expect(markdown).toContain('$\\frac{18}{24}$');
    const picture = /\]\((test\/media\/[^)\s]+)\)/.exec(markdown)?.[1];
    expect(picture).toBeDefined();
    expect(existsSync(path.join(folder, picture!))).toBe(true);
  });
});

describe('runFolder and removeFolder', () => {
  it("puts a run's folders under RUNNER_TEMP, or the system's temp folder", () => {
    expect(runFolder({ RUNNER_TEMP: '/home/runner/work/_temp' }, 'run-1')).toBe(path.join('/home/runner/work/_temp', 'qe', 'run-1'));
    expect(runFolder({}, 'run-1')).toBe(path.join(tmpdir(), 'qe', 'run-1'));
  });

  it('removes a folder and everything in it', async () => {
    const folder = await makeWorkFolder(root, 'grade-10', { test: pdf('t'), barem: pdf('b') }, { skillDir });
    await removeFolder(folder);
    expect(existsSync(folder)).toBe(false);
    await removeFolder(folder);
  });
});

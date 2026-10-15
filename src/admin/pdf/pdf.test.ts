import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { ClassReport, SubmissionDetail } from '../../../shared/api.ts';
import { expectNoGradingWords } from '../../test/gradingWords.ts';
import { fakeItem } from '../../test/fakeApi.ts';
import { BLOCK, classPdf, classPdfFileName } from './classPdf.ts';
import { pdfFileName } from './fileName.ts';
import { PDF_SYMBOLS, pdfText } from './pdfSymbols.ts';
import { renderPdf } from './renderPdf.ts';
import { studentPdf, studentPdfFileName, studentPdfInput } from './studentPdf.ts';

// The texts of a document definition, in order: the keys that hold text, not
// the names of fonts or layouts.
function textsOf(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(textsOf);
  if (node && typeof node === 'object') {
    const object = node as Record<string, unknown>;
    const body = (object.table as { body?: unknown } | undefined)?.body;
    return [...['text', 'ul', 'ol', 'columns', 'stack'].flatMap((key) => textsOf(object[key])), ...textsOf(body)];
  }
  return [];
}

// The code points that the font of pdfmake draws, from its cmap (formats 4 and 12).
function glyphChecker(): (codePoint: number) => boolean {
  const require = createRequire(import.meta.url);
  const vfs = require('pdfmake/build/vfs_fonts.js') as Record<string, string>;
  const view = new DataView(Uint8Array.from(Buffer.from(vfs['Roboto-Regular.ttf']!, 'base64')).buffer);
  const tables = view.getUint16(4);
  let cmapAt = -1;
  for (let index = 0; index < tables; index++) {
    const entry = 12 + index * 16;
    const tag = String.fromCharCode(...[0, 1, 2, 3].map((offset) => view.getUint8(entry + offset)));
    if (tag === 'cmap') cmapAt = view.getUint32(entry + 8);
  }
  const subtables = view.getUint16(cmapAt + 2);
  const covered: ((codePoint: number) => boolean)[] = [];
  for (let index = 0; index < subtables; index++) {
    const at = cmapAt + view.getUint32(cmapAt + 4 + index * 8 + 4);
    const format = view.getUint16(at);
    if (format === 4) {
      const segments = view.getUint16(at + 6) / 2;
      const ends = at + 14;
      const starts = ends + segments * 2 + 2;
      covered.push((codePoint) => {
        for (let segment = 0; segment < segments; segment++) {
          if (codePoint <= view.getUint16(ends + segment * 2)) return codePoint >= view.getUint16(starts + segment * 2);
        }
        return false;
      });
    } else if (format === 12) {
      const groups = view.getUint32(at + 12);
      covered.push((codePoint) => {
        for (let group = 0; group < groups; group++) {
          const entry = at + 16 + group * 12;
          if (codePoint >= view.getUint32(entry) && codePoint <= view.getUint32(entry + 4)) return true;
        }
        return false;
      });
    }
  }
  return (codePoint) => covered.some((has) => has(codePoint));
}

const ROMANIAN = 'ăâîșțĂÂÎȘȚşţŞŢ';

function submission(overrides: Partial<SubmissionDetail> = {}): SubmissionDetail {
  return {
    id: 5,
    testCode: '6E2-26T1',
    testTitle: 'Fracții și ecuații',
    testStatus: 'done',
    studentId: 10,
    studentName: 'Ștefănescu Țicu-Ioana',
    status: 'graded',
    autoSubmitted: false,
    startedAt: '2026-10-06T07:15:00.000Z',
    submittedAt: '2026-10-06T07:40:00.000Z',
    lastError: null,
    files: [],
    resultToken: null,
    resultsOpen: false,
    evaluation: {
      gradedAt: '2026-10-07T09:00:00.000Z',
      maxTotal: 10,
      officePoints: 1,
      total: 7.5,
      grade: 7.5,
      summary: `Ai lucrat bine. ${ROMANIAN}`,
      strengths: ['Fracții echivalente'],
      recommendations: ['Exersează ecuațiile: x² ≤ 4, √9 = 3, ½.'],
      unreadable: [],
      pagesReviewed: false,
      flagCount: 1,
      items: [
        fakeItem({ id: 1, exerciseId: 'I.1', points: 4.5, comment: 'Corect.' }),
        fakeItem({
          id: 2,
          exerciseId: 'II.1',
          points: 2,
          comment: 'Verifică semnul.',
          needsReview: true,
          reviewReason: 'Scrisul de mână nu se citește la pasul 2',
          confidence: 'very_low',
        }),
      ],
    },
    ...overrides,
  };
}

describe('studentPdf', () => {
  it('has no input for an upload that is not graded', () => {
    expect(studentPdfInput(submission({ status: 'submitted', evaluation: null }))).toBeNull();
  });

  it('shows the grade, the exercises, and "în verificare" for an item that waits for a check', () => {
    const input = studentPdfInput(submission())!;
    const texts = textsOf(studentPdf(input).content);
    expect(texts).toContain('Ștefănescu Țicu-Ioana');
    expect(texts).toContain('Nota 7,5');
    expect(texts).toContain('4,5 din 4,5');
    expect(texts).toContain('în verificare');
    expect(texts.join(' ')).toContain('încă în verificare, deci nota se poate schimba');
    expect(texts.join(' ')).toContain('6 octombrie 2026');
  });

  it('shows the points of an item that the teacher checked, and no note about checks', () => {
    const checked = submission();
    checked.evaluation!.items[1] = { ...checked.evaluation!.items[1]!, reviewed: true };
    const texts = textsOf(studentPdf(studentPdfInput(checked)!).content);
    expect(texts).toContain('2 din 4,5');
    expect(texts).not.toContain('în verificare');
    expect(texts.join(' ')).not.toContain('se poate schimba');
  });

  it('never carries the reasons to check an item, the confidence, or a word about how the work was graded', () => {
    const definition = studentPdf(studentPdfInput(submission())!);
    const everything = JSON.stringify(definition);
    expect(everything).not.toContain('Scrisul de mână');
    expect(everything).not.toMatch(/very_low|confidence|reviewReason|needsReview/);
    expectNoGradingWords(textsOf(definition).join('\n'));
  });

  it('draws every Romanian letter with the font it embeds', () => {
    const has = glyphChecker();
    const definition = studentPdf(studentPdfInput(submission())!);
    const missing = [...new Set(textsOf(definition).join('').replace(/\s/g, ''))].filter((char) => !has(char.codePointAt(0)!));
    expect(missing).toEqual([]);
    for (const char of ROMANIAN + '„”–—·≤√½²') expect(has(char.codePointAt(0)!)).toBe(true);
  });

  it('makes a PDF file from the definition, with the Romanian text in it', async () => {
    const blob = await renderPdf(studentPdf(studentPdfInput(submission())!));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(blob.type).toBe('application/pdf');
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5_000);
  });

  it('names the file after the test and the student, without diacritics', () => {
    expect(studentPdfFileName(studentPdfInput(submission())!)).toBe('6E2-26T1-Stefanescu-Ticu-Ioana.pdf');
    expect(pdfFileName('6E2-26T1', 'Șșțţ ăîâ')).toBe('6E2-26T1-Sstt-aia.pdf');
    expect(pdfFileName('   ', '???')).toBe('raport.pdf');
  });
});

function report(exerciseCount: number): ClassReport {
  const exercises = Array.from({ length: exerciseCount }, (_, index) => ({ id: `E${index + 1}`, label: `Exercițiul ${index + 1}`, maxPoints: 1 }));
  const items = (flaggedAt: number) =>
    exercises.map((exercise, index) => ({ exerciseId: exercise.id, points: index % 2 === 0 ? 1 : 0.5, maxPoints: 1, flagged: index === flaggedAt }));
  return {
    test: { code: '6E2-26T1', title: 'Fracții și ecuații', className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
    exercises,
    showModel: true,
    rows: [
      { submissionId: 5, studentId: 10, studentName: 'Ștefănescu Țicu', active: true, total: 12, maxTotal: exerciseCount, grade: 8, flagCount: 1, model: 'claude-opus-5-5', effort: 'high', items: items(1) },
      { submissionId: 6, studentId: 11, studentName: 'Avram Dan', active: true, total: 10, maxTotal: exerciseCount, grade: 7, flagCount: 0, model: null, effort: null, items: items(-1) },
    ],
    missing: [{ studentId: 12, studentName: 'Stan Eva', status: 'none' }],
    analysis: {
      status: 'ready',
      stale: true,
      attempts: 0,
      content: { overview: `Clasa a lucrat bine. ${ROMANIAN}`, strengths: ['Fracții'], weaknesses: [], commonMistakes: ['Semnul'], recommendations: ['Exersați'] },
    },
  };
}

describe('classPdf', () => {
  it('is landscape, with the statistics, the table, the missing students, and the analysis', () => {
    const definition = classPdf(report(5));
    expect(definition.pageOrientation).toBe('landscape');
    const text = textsOf(definition.content).join('\n');
    expect(text).toContain('Raportul clasei · 6E2-26T1');
    expect(text).toContain('Corectate 2 din 3 elevi · de verificat 1');
    expect(text).toContain('Media 7,5');
    expect(text).toContain('Stan Eva · Nu a trimis');
    expect(text).toContain('Analiza poate fi depășită');
    expect(text).toContain('Clasa a lucrat bine.');
    expect(text).toContain('Fundalul galben');
    expect(classPdfFileName(report(5))).toBe('6E2-26T1-raport.pdf');
  });

  it('splits 60 exercises in blocks that repeat the student, with the total in the last one', () => {
    const definition = classPdf(report(60));
    const tables = (definition.content as { table?: { body: unknown[][]; widths: unknown[] } }[]).filter(
      (node) => node.table && node.table.body[0]![0] && (node.table.body[0]![0] as { text: string }).text === 'Elev',
    );
    expect(tables).toHaveLength(Math.ceil(60 / BLOCK));
    for (const table of tables) {
      // The student, the exercises of the block, and the last block's total and grade.
      expect(table.table!.body[0]!.length).toBeLessThanOrEqual(BLOCK + 3);
      expect(table.table!.body).toHaveLength(3);
    }
    const last = tables.at(-1)!.table!.body[0]!.map((cell) => (cell as { text: string }).text);
    expect(last.slice(-2)).toEqual(['Total', 'Nota']);
    const first = tables[0]!.table!.body[0]!.map((cell) => (cell as { text: string }).text);
    expect(first).not.toContain('Total');
  });

  it('marks the item to check with a background, and no other cell', () => {
    const definition = classPdf(report(3));
    const table = (definition.content as { table?: { body: { fillColor?: string; text?: string }[][] } }[]).find((node) => node.table?.body[0]?.[0]?.text === 'Elev')!;
    const [pop, avram] = [table.table!.body[1]!, table.table!.body[2]!];
    expect(pop.filter((cell) => cell.fillColor).length).toBe(1);
    expect(avram.filter((cell) => cell.fillColor).length).toBe(0);
  });

  it('draws every letter with the font it embeds, and renders as a PDF for a class of 60 exercises', async () => {
    const has = glyphChecker();
    const definition = classPdf(report(60));
    const missing = [...new Set(textsOf(definition.content).join('').replace(/\s/g, ''))].filter((char) => !has(char.codePointAt(0)!));
    expect(missing).toEqual([]);
    const blob = await renderPdf(definition);
    expect(new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5))).toBe('%PDF-');
  });

  it('prints no analysis section when the report carries no analysis content', () => {
    const noContent = { ...report(2), analysis: { status: 'requested' as const, stale: false, attempts: 0, content: null } };
    const text = textsOf(classPdf(noContent).content).join('\n');
    expect(text).toContain('Corectate');
    expect(text).not.toContain('Analiza clasei');
  });

  it('is a document of its own when nothing is graded', () => {
    const empty = { ...report(2), rows: [], analysis: { status: 'none' as const, stale: false, attempts: 0, content: null } };
    const text = textsOf(classPdf(empty).content).join('\n');
    expect(text).toContain('Corectate 0 din 1 elevi');
    expect(text).not.toContain('Analiza clasei');
  });
});

describe('pdfText', () => {
  const LACKING = '∈∉ℝℕℤℚ⇒⇔→∠⊥∪∩∥⊂∅∡';

  it('maps every symbol that the font lacks to text that the font draws', () => {
    const has = glyphChecker();
    for (const symbol of LACKING) {
      expect(has(symbol.codePointAt(0)!)).toBe(false);
      expect(PDF_SYMBOLS[symbol], symbol).toBeDefined();
      const out = pdfText(`a ${symbol} b`);
      expect(out).not.toContain(symbol);
      expect([...out].filter((char) => !has(char.codePointAt(0)!))).toEqual([]);
    }
    expect(Object.keys(PDF_SYMBOLS).sort().join('')).toBe([...LACKING].sort().join(''));
  });

  it('writes the symbols as words or letters, with spaces where they would stick', () => {
    expect(pdfText('x ∈ ℕ')).toBe('x aparține N');
    expect(pdfText('AB ⊥ CD')).toBe('AB perpendicular pe CD');
    expect(pdfText('∠ABC')).toBe('unghiul ABC');
    expect(pdfText('A⇒B, B⇔C, f: ℝ→ℝ')).toBe('A=>B, B<=>C, f: R->R');
  });

  it('returns a text without these symbols unchanged', () => {
    const text = `${ROMANIAN} x² ≤ 4, √9 = 3, ½ „da” – 5·2`;
    expect(pdfText(text)).toBe(text);
  });

  it('keeps the symbols out of the student PDF and the class PDF', () => {
    const has = glyphChecker();
    const detail = submission();
    detail.evaluation!.items[0] = { ...detail.evaluation!.items[0]!, studentAnswer: 'x ∈ ℕ', comment: 'AB ⊥ CD' };
    detail.evaluation!.summary = 'A ⇒ B';
    const studentText = textsOf(studentPdf(studentPdfInput(detail)!).content).join('');
    expect(studentText).toContain('x aparține N');
    expect(studentText).toContain('AB perpendicular pe CD');
    expect([...studentText].filter((char) => !has(char.codePointAt(0)!) && !/\s/.test(char))).toEqual([]);

    const base = report(2);
    const withSymbols = { ...base, analysis: { ...base.analysis, content: { ...base.analysis.content!, overview: 'x ∈ ℝ, A ∩ B = ∅' } } };
    const classText = textsOf(classPdf(withSymbols).content).join('');
    expect(classText).toContain('x aparține R, A intersectat cu B = mulțimea vidă');
    expect([...classText].filter((char) => !has(char.codePointAt(0)!) && !/\s/.test(char))).toEqual([]);
  });
});

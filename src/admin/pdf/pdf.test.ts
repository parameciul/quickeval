import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { ContentTable, CustomTableLayout, Node, NodeQueries, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { ClassReport, StudentResultView, SubmissionDetail } from '../../../shared/api.ts';
import { expectNoGradingWords } from '../../test/gradingWords.ts';
import { fakeItem } from '../../test/fakeApi.ts';
import { classPdf, classPdfFileName, COLUMN_PADDING, drawnWidth, headingBreak, PAGE_WIDTH, stretchedPadding, tableWidth } from './classPdf.ts';
import { pdfFileName } from './fileName.ts';
import { pdfRuns } from './pdfMath.ts';
import { PDF_SYMBOLS, pdfText } from './pdfSymbols.ts';
import { renderPdf } from './renderPdf.ts';
import { studentPdf, studentPdfFileName, studentPdfInput, studentPdfInputFromResult } from './studentPdf.ts';

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
    test: { code: '6E2-26T1', title: 'Fracții și ecuații', classId: 1, className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
    exercises,
    cesExercises: null,
    rows: [
      { submissionId: 5, studentId: 10, studentName: 'Ștefănescu Țicu', active: true, total: 12, maxTotal: exerciseCount, grade: 8, flagCount: 1, ces: false, variant: 'class', items: items(1) },
      { submissionId: 6, studentId: 11, studentName: 'Avram Dan', active: true, total: 10, maxTotal: exerciseCount, grade: 7, flagCount: 0, ces: false, variant: 'class', items: items(-1) },
    ],
    missing: [{ studentId: 12, studentName: 'Stan Eva', status: 'none', ces: false }],
    analysis: {
      status: 'ready',
      stale: true,
      attempts: 0,
      content: { overview: `Clasa a lucrat bine. ${ROMANIAN}`, strengths: ['Fracții'], weaknesses: [], commonMistakes: ['Semnul'], recommendations: ['Exersați'] },
    },
  };
}

// The results tables of a class PDF: the ones whose header starts with "Elev".
type ResultsTable = { table: { body: { text: string; colSpan?: number }[][]; widths: number[]; keepWithHeaderRows?: number; dontBreakRows?: boolean }; layout: unknown };
function resultsTables(definition: TDocumentDefinitions): ResultsTable[] {
  return (definition.content as Partial<ResultsTable>[]).filter((node): node is ResultsTable => node.table?.body[0]?.[0]?.text === 'Elev');
}
const headerTexts = (table: ResultsTable) => table.table.body[0]!.map((cell) => cell.text);
// The space on each side of an inner column of a results table, from its layout.
const paddingOf = (table: ResultsTable) => (table.layout as CustomTableLayout).paddingLeft!(1, { table: table.table } as unknown as ContentTable) as number;

// A class like a real one: long names with diacritics, points with a comma,
// totals out of 100.
function realClass(ids: string[], students: number): ClassReport {
  const names = ['Balia Davide', 'Bursașiu Teodor Andrei', 'Gheorghiță Rais-Bogdan-Jahjah', 'Vrînceanu-Tomici Tudor-Iosif', 'Ștefănescu Țicu-Ioana', 'Stojanović Teodor'];
  const exercises = ids.map((id) => ({ id, label: `Exercițiul ${id}`, maxPoints: 10 }));
  return {
    test: { code: '6E2-26T2', title: 'Unghiuri', classId: 1, className: '6E2', status: 'done', startedAt: '2026-11-06T07:15:00.000Z' },
    exercises,
    cesExercises: null,
    rows: Array.from({ length: students }, (_, index) => ({
      submissionId: 100 + index,
      studentId: 200 + index,
      studentName: `${names[index % names.length]!} ${index}`.toUpperCase(),
      active: true,
      total: 42.5,
      maxTotal: 100,
      grade: 4.25,
      flagCount: 0,
      ces: false,
      variant: 'class' as const,
      items: exercises.map((exercise, item) => ({ exerciseId: exercise.id, points: item % 3 === 0 ? 3.5 : 10, maxPoints: 10, flagged: false })),
    })),
    missing: [],
    analysis: { status: 'none', stale: false, attempts: 0, content: null },
  };
}

const gradedView: StudentResultView = {
  resultCode: 'K7M92P',
  testCode: '6E2-26T1',
  testTitle: 'Fracții',
  className: '6E2',
  studentName: 'Pop Ion',
  submittedAt: '2026-11-03T08:15:00.000Z',
  status: 'graded',
  files: [],
  evaluation: {
    maxTotal: 10,
    officePoints: 1,
    total: 6.5,
    grade: 6.5,
    summary: 'Ai lucrat bine la fracții.',
    strengths: ['Fracții echivalente'],
    recommendations: ['Exersează ecuațiile.'],
    items: [{ exerciseId: 'I.1', label: 'Subiectul I, ex. 1', maxPoints: 4.5, points: 4.5, studentAnswer: '3/4', comment: 'Corect.' }],
  },
};

describe('studentPdfInputFromResult', () => {
  it('maps a student result view to the PDF input, every item settled', () => {
    const input = studentPdfInputFromResult(gradedView);
    expect(input).toMatchObject({
      testCode: '6E2-26T1',
      testTitle: 'Fracții',
      studentName: 'Pop Ion',
      date: '2026-11-03T08:15:00.000Z',
      grade: 6.5,
      total: 6.5,
      maxTotal: 10,
      officePoints: 1,
      summary: 'Ai lucrat bine la fracții.',
      strengths: ['Fracții echivalente'],
      recommendations: ['Exersează ecuațiile.'],
    });
    expect(input!.items.every((item) => item.pending === false)).toBe(true);
    expect(Object.keys(input!.items[0]!).sort()).toEqual(['comment', 'exerciseId', 'label', 'maxPoints', 'pending', 'points', 'studentAnswer']);
    expect(Object.keys(input!).sort()).toEqual(Object.keys(studentPdfInput(submission())!).sort());
  });

  it('gives no PDF input for a result that is not graded', () => {
    expect(studentPdfInputFromResult({ ...gradedView, evaluation: null })).toBeNull();
  });
});

describe('classPdf with CES papers', () => {
  it('adds the CES table and its exercises under "Varianta CES"', () => {
    const base = report(2);
    const ces = { ...base.rows[1]!, submissionId: 7, studentName: 'Bursașiu Teodor', variant: 'ces' as const, ces: true, items: [{ exerciseId: 'C1', points: 8, maxPoints: 9, flagged: false }] };
    const text = textsOf(classPdf({ ...base, cesExercises: [{ id: 'C1', label: 'Exercițiul CES', maxPoints: 9 }], rows: [...base.rows, ces] }).content).join('\n');
    expect(text.match(/Varianta CES/g)).toHaveLength(2);
    expect(text).toContain('C1 · Exercițiul CES');
    expect(text).toContain('Bursașiu Teodor');
    expect(textsOf(classPdf(base).content).join('\n')).not.toContain('Varianta CES');
  });
});

describe('classPdf', () => {
  it('is landscape, with the statistics, the table and the analysis, and no list of the students with no result', () => {
    const definition = classPdf(report(5));
    expect(definition.pageOrientation).toBe('landscape');
    const text = textsOf(definition.content).join('\n');
    expect(text).toContain('Raportul clasei · 6E2-26T1');
    expect(text).toContain('Corectate 2 din 3 elevi · de verificat 1');
    expect(text).toContain('Media 7,5');
    expect(text).not.toContain('Fără rezultat');
    expect(text).toContain('Analiza poate fi depășită');
    expect(text).toContain('Clasa a lucrat bine.');
    expect(text).toContain('Fundalul galben');
    expect(classPdfFileName(report(5))).toBe('6E2-26T1-raport.pdf');
  });

  it('splits 60 exercises in as few blocks as fit, of equal size, each with the student, the total in the last one', () => {
    const tables = resultsTables(classPdf(report(60)));
    expect(tables.length).toBeGreaterThan(1);
    const sizes = tables.map((table, index) => table.table.body[0]!.length - 1 - (index === tables.length - 1 ? 2 : 0));
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(60);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    for (const table of tables) {
      expect(table.table.body).toHaveLength(4);
      expect(tableWidth(table.table.widths)).toBeLessThanOrEqual(PAGE_WIDTH);
      expect(drawnWidth(table.table.widths, paddingOf(table))).toBeCloseTo(PAGE_WIDTH, 6);
    }
    expect(headerTexts(tables.at(-1)!).slice(-2)).toEqual(['Total', 'Nota']);
    expect(headerTexts(tables[0]!)).not.toContain('Total');
  });

  it('keeps a class of 29 students and 13 exercises in one table that fits the page, with the total and the grade', () => {
    const ids = ['I.1.a', 'I.1.b', 'I.2.a', 'I.2.b', 'I.3.a', 'I.3.b', 'II.1.a', 'II.1.b', 'II.2.a', 'II.2.b', 'II.2.c', 'II.3.a', 'II.3.b'];
    const tables = resultsTables(classPdf(realClass(ids, 29)));
    expect(tables).toHaveLength(1);
    expect(headerTexts(tables[0]!)).toEqual(['Elev', ...ids, 'Total', 'Nota']);
    expect(tables[0]!.table.body).toHaveLength(30);
    expect(tableWidth(tables[0]!.table.widths)).toBeLessThanOrEqual(PAGE_WIDTH);
  });

  it('keeps 18 exercises in one table, with columns only as wide as their texts', () => {
    const ids = ['I.1', 'I.2', 'I.3', 'I.4', 'I.5', 'I.6', 'II.1', 'II.2', 'II.3', 'II.4', 'III.1.a', 'III.1.b', 'III.2.a', 'III.2.b', 'III.3.a', 'III.3.b', 'III.4.a', 'III.4.b'];
    const [table, ...rest] = resultsTables(classPdf(realClass(ids, 20)));
    expect(rest).toEqual([]);
    expect(tableWidth(table!.table.widths)).toBeLessThanOrEqual(PAGE_WIDTH);
    const widths = table!.table.widths;
    // "I.1" over "3,5" is about 15 pt, "III.4.b" about 25 pt: no column of points is 30 pt wide.
    expect(Math.max(...widths.slice(1, -2))).toBeLessThan(30);
    expect(widths[1]!).toBeLessThan(widths.at(-3)!);
  });

  it('fits the CES table across the page too, in its own blocks', () => {
    const base = realClass(['I.1', 'I.2'], 3);
    const cesExercises = Array.from({ length: 40 }, (_, index) => ({ id: `C${index + 1}`, label: `Exercițiul CES ${index + 1}`, maxPoints: 5 }));
    const ces = {
      ...base.rows[0]!,
      submissionId: 99,
      studentName: 'Vrînceanu-Tomici Tudor-Iosif',
      variant: 'ces' as const,
      ces: true,
      items: cesExercises.map((exercise) => ({ exerciseId: exercise.id, points: 2.5, maxPoints: 5, flagged: false })),
    };
    const tables = resultsTables(classPdf({ ...base, cesExercises, rows: [...base.rows, ces] }));
    expect(tables[0]!.table.body).toHaveLength(4);
    const cesTables = tables.slice(1);
    expect(cesTables.length).toBeGreaterThan(1);
    for (const table of cesTables) expect(tableWidth(table.table.widths)).toBeLessThanOrEqual(PAGE_WIDTH);
  });

  it('keeps the header with the first students on a page, and spreads the room left between the columns', () => {
    const [table] = resultsTables(classPdf(realClass(['I.1', 'I.2'], 29)));
    expect(table!.table.keepWithHeaderRows).toBe(5);
    expect(table!.table.dontBreakRows).toBe(true);
    const layout = table!.layout as CustomTableLayout;
    const node = { table: table!.table } as unknown as ContentTable;
    const padding = stretchedPadding(table!.table.widths);
    expect(padding).toBeGreaterThan(COLUMN_PADDING);
    expect(layout.paddingLeft!(0, node)).toBe(0);
    expect(layout.paddingLeft!(1, node)).toBe(padding);
    expect(layout.paddingRight!(0, node)).toBe(padding);
    expect(layout.paddingRight!(table!.table.widths.length - 1, node)).toBe(0);
    const [small] = resultsTables(classPdf(realClass(['I.1'], 2)));
    expect(small!.table.keepWithHeaderRows).toBe(2);
  });

  it('gives a long exercise id a column of at most 60 pt, where it wraps', () => {
    const [table] = resultsTables(classPdf(realClass(['Subiectul III, exercițiul 4, punctul b'], 2)));
    expect(table!.table.widths[1]).toBe(60);
  });

  it('makes one table of Elev, Total and Nota for a test with no exercises and no graded paper', () => {
    const empty = { ...realClass([], 0) };
    const tables = resultsTables(classPdf(empty));
    expect(tables).toHaveLength(1);
    expect(headerTexts(tables[0]!)).toEqual(['Elev', 'Total', 'Nota']);
    expect(tables[0]!.table.keepWithHeaderRows).toBe(0);
  });

  it('gives a long name a column of at most 180 pt, where it wraps', () => {
    const base = realClass(['I.1'], 1);
    const long = { ...base, rows: [{ ...base.rows[0]!, studentName: 'Gheorghiță Rais-Bogdan-Jahjah Alexandru-Constantin Popescu-Ionescu' }] };
    const [table] = resultsTables(classPdf(long));
    expect(table!.table.widths[0]).toBe(180);
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

  it('lists the students with no result as rows of the class table, after the graded ones, in every block', () => {
    const base = report(60);
    const missing = [
      { studentId: 12, studentName: 'Stan Eva', status: 'none' as const, ces: false },
      { studentId: 13, studentName: 'Vrînceanu-Tomici Tudor-Iosif Alexandru', status: 'failed' as const, ces: true },
    ];
    const tables = resultsTables(classPdf({ ...base, missing }));
    expect(tables.length).toBeGreaterThan(1);
    for (const table of tables) {
      const rows = table.table.body.slice(1);
      expect(rows.map((row) => row[0]!.text)).toEqual(['Ștefănescu Țicu', 'Avram Dan', 'Stan Eva', 'Vrînceanu-Tomici Tudor-Iosif Alexandru']);
      const columns = table.table.widths.length;
      for (const [row, note] of [[rows[2]!, 'Nu a trimis lucrarea.'], [rows[3]!, 'Eroare']] as const) {
        expect(row).toHaveLength(columns);
        expect(row[1]).toMatchObject({ text: note, colSpan: columns - 1 });
        expect(row.slice(2).every((cell) => Object.keys(cell).length === 0)).toBe(true);
      }
      expect(table.table.keepWithHeaderRows).toBe(4);
    }
    // The longest name is a missing student's: the name column fits it.
    expect(tables[0]!.table.widths[0]).toBeGreaterThan(resultsTables(classPdf({ ...base, missing: [] }))[0]!.table.widths[0]!);
    expect(textsOf(classPdf({ ...base, missing }).content).join('\n')).not.toContain('Stan Eva · ');
  });

  it('lists the students with no result in the class table only, not in the CES one', () => {
    const base = report(2);
    const ces = { ...base.rows[1]!, submissionId: 7, studentName: 'Bursașiu Teodor', variant: 'ces' as const, ces: true, items: [{ exerciseId: 'C1', points: 8, maxPoints: 9, flagged: false }] };
    const tables = resultsTables(classPdf({ ...base, cesExercises: [{ id: 'C1', label: 'Exercițiul CES', maxPoints: 9 }], rows: [...base.rows, ces] }));
    expect(tables).toHaveLength(2);
    expect(tables[0]!.table.body.map((row) => row[0]!.text)).toContain('Stan Eva');
    expect(tables[1]!.table.body.map((row) => row[0]!.text)).toEqual(['Elev', 'Bursașiu Teodor']);
  });

  it('fills the page width with every results table, wide or narrow, without changing its columns', () => {
    const eighteen = ['I.1', 'I.2', 'I.3', 'I.4', 'I.5', 'I.6', 'II.1', 'II.2', 'II.3', 'II.4', 'III.1.a', 'III.1.b', 'III.2.a', 'III.2.b', 'III.3.a', 'III.3.b', 'III.4.a', 'III.4.b'];
    for (const definition of [classPdf(realClass(eighteen, 18)), classPdf(realClass(['I.1', 'I.2'], 3)), classPdf(report(60)), classPdf(realClass([], 0))]) {
      for (const table of resultsTables(definition)) {
        expect(paddingOf(table)).toBeGreaterThanOrEqual(COLUMN_PADDING);
        expect(drawnWidth(table.table.widths, paddingOf(table))).toBeCloseTo(PAGE_WIDTH, 6);
      }
    }
    // The columns stay as wide as their texts: the room goes between them.
    const [table] = resultsTables(classPdf(realClass(eighteen, 18)));
    expect(Math.max(...table!.table.widths.slice(1, -2))).toBeLessThan(30);
  });

  it('keeps the space between the columns at its least when the columns already fill the page', () => {
    expect(stretchedPadding([PAGE_WIDTH - 2 * COLUMN_PADDING - 10, 10])).toBe(COLUMN_PADDING);
    expect(stretchedPadding([PAGE_WIDTH])).toBe(COLUMN_PADDING);
    expect(stretchedPadding([100, 100])).toBeCloseTo((PAGE_WIDTH - 200) / 2, 6);
  });

  it('keeps the header of the exercises table with its first rows', () => {
    type TableNode = { table?: { body: { text: string }[][]; keepWithHeaderRows?: number } };
    const exercisesTable = (exerciseCount: number) => (classPdf(report(exerciseCount)).content as TableNode[]).find((node) => node.table?.body[0]?.[0]?.text === 'Exercițiul')!;
    expect(exercisesTable(8).table!.keepWithHeaderRows).toBe(5);
    expect(exercisesTable(2).table!.keepWithHeaderRows).toBe(2);
  });

  describe('the headings', () => {
    const INNER = 515.28;
    // A node of pdfmake's `pageBreakBefore`, its top `below` pt over the bottom of the page.
    const node = (id: string | undefined, below: number) => {
      const verticalRatio = 1 - below / INNER;
      const startPosition = { pageNumber: 1, pageOrientation: 'landscape', pageInnerHeight: INNER, pageInnerWidth: PAGE_WIDTH, left: 36, top: 40 + INNER * verticalRatio, verticalRatio, horizontalRatio: 0 };
      return { text: 'x', id, startPosition, pageNumbers: [1], pages: 2, stack: false } as unknown as Node;
    };
    const queries = { getFollowingNodesOnPage: () => [], getNodesOnNextPage: () => [], getPreviousNodesOnPage: () => [] } as NodeQueries;
    const headingsOf = (definition: TDocumentDefinitions) =>
      (definition.content as { text?: unknown; style?: string; id?: string }[]).filter((part) => part.style === 'h2' || part.style === 'h3');
    // The least room under its top with which a heading stays on its page.
    function roomOf(definition: TDocumentDefinitions, id: string): number {
      let low = 0;
      let high = INNER;
      while (high - low > 0.01) {
        const middle = (low + high) / 2;
        if (definition.pageBreakBefore!(node(id, middle), queries)) low = middle;
        else high = middle;
      }
      return high;
    }

    it('gives every heading of a part an id of its own', () => {
      const base = report(2);
      const ces = { ...base.rows[1]!, submissionId: 7, variant: 'ces' as const, ces: true, items: [{ exerciseId: 'C1', points: 8, maxPoints: 9, flagged: false }] };
      const headings = headingsOf(classPdf({ ...base, cesExercises: [{ id: 'C1', label: 'Exercițiul CES', maxPoints: 9 }], rows: [...base.rows, ces] }));
      expect(headings.map((part) => part.text)).toEqual([
        'Statistici',
        'Rezultatele elevilor',
        'Varianta CES',
        'Pe exerciții',
        'Varianta CES',
        'Analiza clasei',
        'Ce a mers bine',
        'Greșeli frecvente',
        'Ce exersați în continuare',
      ]);
      expect(new Set(headings.map((part) => part.id)).size).toBe(headings.length);
    });

    it('moves a heading to the next page when its table header and first five rows do not fit under it', () => {
      const definition = classPdf(realClass(['I.1', 'I.2'], 29));
      const [, results, exercises] = headingsOf(definition);
      // An h2 (19.2 pt), 8 pt to spare, a header row (15.4 pt) and five rows of 15.5 pt.
      expect(roomOf(definition, results!.id!)).toBeCloseTo(19.23 + 8 + 15.38 + 5 * 15.55, 1);
      // The exercises table has only two rows.
      expect(roomOf(definition, exercises!.id!)).toBeCloseTo(19.23 + 8 + 15.38 + 2 * 15.55, 1);
    });

    it('counts a name that wraps as more lines', () => {
      const base = realClass(['I.1'], 6);
      const long = { ...base, rows: base.rows.map((row) => ({ ...row, studentName: 'Gheorghiță Rais-Bogdan-Jahjah Alexandru-Constantin Popescu-Ionescu' })) };
      const short = classPdf(base);
      const wrapped = classPdf(long);
      expect(roomOf(wrapped, headingsOf(wrapped)[1]!.id!)).toBeGreaterThan(roomOf(short, headingsOf(short)[1]!.id!) + 5 * 10);
    });

    it('keeps three lines of text with a heading, and the next heading too when the text is shorter', () => {
      const base = report(2);
      const shortOverview = classPdf({ ...base, analysis: { ...base.analysis, stale: false, content: { ...base.analysis.content!, overview: 'Bine.' } } });
      const headings = headingsOf(shortOverview);
      const analysis = headings.find((part) => part.text === 'Analiza clasei')!;
      const strengths = headings.find((part) => part.text === 'Ce a mers bine')!;
      // "Ce a mers bine" holds one line: it needs only that line, and 2 pt to spare.
      expect(roomOf(shortOverview, strengths.id!)).toBeCloseTo(11 * 1.171875 + 2 + 10 * 1.171875 + 2, 1);
      // One line of overview: the analysis's heading needs it, the 6 pt above "Ce a mers bine" and its room.
      expect(roomOf(shortOverview, analysis.id!)).toBeCloseTo(13 * 1.171875 + 4 + 2 + 10 * 1.171875 + 6 + roomOf(shortOverview, strengths.id!), 1);
      const longOverview = classPdf({ ...base, analysis: { ...base.analysis, stale: false, content: { ...base.analysis.content!, overview: 'Clasa a lucrat bine. '.repeat(60) } } });
      const longAnalysis = headingsOf(longOverview).find((part) => part.text === 'Analiza clasei')!;
      expect(roomOf(longOverview, longAnalysis.id!)).toBeCloseTo(13 * 1.171875 + 4 + 2 + 3 * 10 * 1.171875, 1);
    });

    it('keeps a heading at the top of its page, which would else leave a blank page', () => {
      const definition = classPdf(report(2));
      const [statistics] = headingsOf(definition);
      expect(definition.pageBreakBefore!(node(statistics!.id, INNER - 12), queries)).toBe(false);
      expect(definition.pageBreakBefore!(node(statistics!.id, 10), queries)).toBe(true);
    });

    it('never moves what is not a heading', () => {
      const definition = classPdf(report(2));
      expect(definition.pageBreakBefore!(node(undefined, 1), queries)).toBe(false);
      expect(headingBreak(node('other', 1), undefined)).toBe(false);
    });
  });

  it('leaves no space under the last list, which would start a blank page at the foot of a page', () => {
    const lists = (classPdf(report(2)).content as { ul?: unknown; margin?: number[] }[]).filter((part) => part.ul);
    expect(lists.map((part) => part.margin)).toEqual([
      [0, 0, 0, 4],
      [0, 0, 0, 4],
      [0, 0, 0, 0],
    ]);
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
  const LACKING = '∈∉ℝℕℤℚ⇒⇔→∠⊥∪∩∥⊂∅∡⇌↑↓∢≡∦⊆⊄∧∨∀∃⋮↔∖≱';

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
    expect(pdfText('N₂ + 3H₂ ⇌ 2NH₃, CO₂↑, AgCl↓')).toBe('N₂ + 3H₂ <=> 2NH₃, CO₂ (gaz), AgCl (precipitat)');
  });

  it('writes the signs of logic and sets as words, with no space inside brackets and quotes', () => {
    expect(pdfText('„(∃) x ∈ ℝ, x² < x”')).toBe('„(există) x aparține R, x² < x”');
    expect(pdfText('operatorul „și” (∧); p∧q, p ∨ q, p ↔ q')).toBe('operatorul „și” (și); p și q, p sau q, p <-> q');
    expect(pdfText('m(∠A) și [∀]')).toBe('m(unghiul A) și [oricare ar fi]');
    expect(pdfText('n ⋮ 4, ∢DAE ≡ ∢EAB, A ∖ B, {2, 4} ⊄ B')).toBe('n divizibil cu 4, unghiul DAE congruent cu unghiul EAB, A \\ B, {2, 4} nu este inclus în B');
  });

  it('writes an arrow after a chemical formula as a gas or a precipitate, and any other as a rise or a fall', () => {
    expect(pdfText('CaCO₃↓, H₂S↑, Cu(OH)₂↓, O₂ ↑')).toBe('CaCO₃ (precipitat), H₂S (gaz), Cu(OH)₂ (precipitat), O₂ (gaz)');
    expect(pdfText('glicemia ↑, tensiunea↓')).toBe('glicemia crește, tensiunea scade');
    expect(pdfText('f↑ pe (0, 1)')).toBe('f crește pe (0, 1)');
    expect(pdfText('↓ temperatura')).toBe('scade temperatura');
  });

  it('keeps the signs of physics and chemistry that the font draws', () => {
    const has = glyphChecker();
    for (const char of '₀₁₂₃₄₅₆₇₈₉⁺⁻°ΩμΔλρπ·×≈') expect(has(char.codePointAt(0)!), char).toBe(true);
    const text = 'v = Δx/Δt, ρ = 1000 kg/m³, 20 °C, R = 10 Ω, SO₄²⁻';
    expect(pdfText(text)).toBe(text);
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

describe('pdfRuns', () => {
  const NEGATION = 'Negația nu este p̄ → q̄ ∨ r̄, ci p ∧ q̄.';
  const SETS = 'A_p = [−1; 3], A_(p∧q) = A_p ∩ A_q';

  it('keeps a text without bars, subscripts and raised letters as one string', () => {
    expect(pdfRuns('x² ≤ 4, √9 = 3, (x + 1)/3, x_max')).toBe('x² ≤ 4, √9 = 3, (x + 1)/3, x_max');
  });

  it('draws a negated letter with a line over it', () => {
    expect(pdfRuns(pdfText(NEGATION))).toEqual([
      'Negația nu este ',
      { text: 'p', decoration: 'overline' },
      ' -> ',
      { text: 'q', decoration: 'overline' },
      ' sau ',
      { text: 'r', decoration: 'overline' },
      ', ci p și ',
      { text: 'q', decoration: 'overline' },
      '.',
    ]);
    expect(pdfRuns('p̄q̅')).toEqual([{ text: 'p', decoration: 'overline' }, { text: 'q', decoration: 'overline' }]);
  });

  it('draws what follows "_" as a subscript, without the "_" and the brackets', () => {
    expect(pdfRuns(pdfText(SETS))).toEqual([
      'A',
      { text: 'p', sub: true },
      ' = [−1; 3], A',
      { text: 'p și q', sub: true },
      ' = A',
      { text: 'p', sub: true },
      ' intersectat cu A',
      { text: 'q', sub: true },
    ]);
  });

  it('raises a small letter that the font lacks, and drops a bar with no letter', () => {
    expect(pdfRuns('σᵏ ≠ e, xⁿ')).toEqual(['σ', { text: 'k', sup: true }, ' ≠ e, xⁿ']);
    expect(pdfRuns('a ̄b')).toBe('a b');
  });

  it('puts the runs in the student PDF and the class PDF, with every letter in the font', async () => {
    const has = glyphChecker();
    const texts = [NEGATION, SETS, 'Negația este „(∀) x ∈ ℝ, x² ≤ x”; n ⋮ 4; ∢DAE ≡ ∢EAB; σᵏ ≠ e; (ℝ ∖ A_q)'];
    const detail = submission();
    detail.evaluation!.items[0] = { ...detail.evaluation!.items[0]!, studentAnswer: texts[1]!, comment: texts[0]! };
    detail.evaluation!.summary = texts[2]!;
    detail.evaluation!.recommendations = [texts[0]!];
    const student = studentPdf(studentPdfInput(detail)!);
    const base = report(2);
    const classDefinition = classPdf({ ...base, analysis: { ...base.analysis, content: { ...base.analysis.content!, overview: texts[0]!, strengths: [texts[1]!] } } });
    for (const definition of [student, classDefinition]) {
      const json = JSON.stringify(definition.content);
      expect(json).toContain('{"text":"p","decoration":"overline"}');
      expect(json).toContain('{"text":"p și q","sub":true}');
      const text = textsOf(definition.content).join('');
      expect([...new Set(text)].filter((char) => !has(char.codePointAt(0)!) && !/\s/.test(char))).toEqual([]);
      const blob = await renderPdf(definition);
      expect(new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5))).toBe('%PDF-');
    }
    expect(JSON.stringify(student.content)).toContain('{"text":"k","sup":true}');
  });
});

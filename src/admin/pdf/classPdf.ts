import type { Content, CustomTableLayout, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { ClassReport } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { classStats, type ExerciseStats, reportTables, type ReportTable } from '../../../shared/stats.ts';
import { formatDate, uploadStatusLabel } from '../../ui/format.ts';
import { pdfFileName } from './fileName.ts';
import { pdfRuns } from './pdfMath.ts';
import { pdfText } from './pdfSymbols.ts';
import { pdfTextWidth } from './pdfWidth.ts';
import { t } from '../../i18n/t.ts';

// The class PDF (spec §14.2): landscape, with the table of results, the
// statistics, and the analysis. Each column of the results is as wide as its
// widest text. When all the exercises, the total and the grade fit across the
// page, the results are one table. A test can have 60 exercises, which no
// page holds in one table: then the exercises go in as few blocks as fit, of
// equal size, every block repeats the student's name, and the last one holds
// the total and the grade.

const FLAGGED = '#fff0a0';
const MUTED = '#586070';

// A4 landscape (841.89 pt) without the page margins.
export const PAGE_WIDTH = 841.89 - 2 * 36;
// The space on each side of a column, except on the outer sides of the table.
export const COLUMN_PADDING = 4;
// A longer name or exercise id wraps on two lines.
const NAME_MAX = 180;
const EXERCISE_MAX = 60;
// The header and at least this many students start on the same page.
const KEEP_WITH_HEADER = 5;
const HEADER_SIZE = 8;
const CELL_SIZE = 9;

export function classPdfFileName(report: ClassReport): string {
  return pdfFileName(report.test.code, t('raport'));
}

const dash = '—';
const grade = (value: number | null) => (value === null ? dash : formatPoints(value));

const headerCell = (text: string) => ({ text, bold: true, fontSize: HEADER_SIZE, color: MUTED });

// The lines of pdfmake's "lightHorizontalLines", with less space between the
// columns: its 16 pt gap made the columns of points much wider than "3,5".
const resultsLayout: CustomTableLayout = {
  hLineWidth: (index, node) => (index === 0 || index === node.table.body.length ? 0 : index === node.table.headerRows ? 2 : 1),
  vLineWidth: () => 0,
  hLineColor: (index) => (index === 1 ? 'black' : '#aaa'),
  paddingLeft: (index) => (index === 0 ? 0 : COLUMN_PADDING),
  paddingRight: (index, node) => (index === (node.table.widths as unknown[]).length - 1 ? 0 : COLUMN_PADDING),
};

// The width of a column that holds these texts (the header in bold at its
// size, the cells at theirs), with one point to spare.
function columnWidth(header: string, cells: string[], max = Infinity): number {
  const widest = Math.max(pdfTextWidth(header, HEADER_SIZE), ...cells.map((cell) => pdfTextWidth(cell, CELL_SIZE)));
  return Math.min(max, Math.ceil(widest) + 1);
}

// The width a table takes on the page: its columns and the space between them.
export const tableWidth = (widths: number[]) => widths.reduce((sum, width) => sum + width, 0) + 2 * COLUMN_PADDING * Math.max(0, widths.length - 1);

const totalText = (row: ReportTable['rows'][number]) => `${formatPoints(row.total)} / ${formatPoints(row.maxTotal)}`;

// `items` in `count` blocks in order, the first ones one item longer when
// they do not divide evenly.
function evenBlocks<T>(items: T[], count: number): T[][] {
  const out: T[][] = [];
  let start = 0;
  for (let index = 0; index < count; index++) {
    const size = Math.floor(items.length / count) + (index < items.length % count ? 1 : 0);
    out.push(items.slice(start, start + size));
    start += size;
  }
  return out;
}

// One block of a results table: the students and a part of the exercises.
// The last block also holds the total and the grade.
function resultsTable(table: ReportTable, exercises: ReportTable['exercises'], nameWidth: number, widths: Map<string, number>, tail: number[] | null): Content {
  const header: TableCell[] = [headerCell(t('Elev')), ...exercises.map((exercise) => ({ ...headerCell(exercise.id), alignment: 'center' as const }))];
  if (tail) header.push(headerCell(t('Total')), headerCell(t('Nota')));
  const body: TableCell[][] = table.rows.map((row) => {
    const cells: TableCell[] = [{ text: row.studentName, fontSize: CELL_SIZE }];
    for (const exercise of exercises) {
      const item = row.items.find((candidate) => candidate.exerciseId === exercise.id);
      cells.push(
        item
          ? { text: formatPoints(item.points), alignment: 'center', fontSize: CELL_SIZE, fillColor: item.flagged ? FLAGGED : undefined }
          : { text: dash, alignment: 'center', fontSize: CELL_SIZE },
      );
    }
    if (tail) {
      cells.push({ text: totalText(row), fontSize: CELL_SIZE }, { text: formatPoints(row.grade), bold: true, fontSize: CELL_SIZE });
    }
    return cells;
  });
  return {
    table: {
      headerRows: 1,
      keepWithHeaderRows: Math.min(KEEP_WITH_HEADER, table.rows.length),
      dontBreakRows: true,
      widths: [nameWidth, ...exercises.map((exercise) => widths.get(exercise.id)!), ...(tail ?? [])],
      body: [header, ...body],
    },
    layout: resultsLayout,
    margin: [0, 0, 0, 10],
  };
}

// A results table in as few blocks as fit across the page.
function resultsBlocks(table: ReportTable): Content[] {
  const nameWidth = columnWidth(t('Elev'), table.rows.map((row) => row.studentName), NAME_MAX);
  const widths = new Map<string, number>();
  for (const exercise of table.exercises) {
    const cells = table.rows.map((row) => {
      const item = row.items.find((candidate) => candidate.exerciseId === exercise.id);
      return item ? formatPoints(item.points) : dash;
    });
    widths.set(exercise.id, columnWidth(exercise.id, cells, EXERCISE_MAX));
  }
  const tail = [columnWidth(t('Total'), table.rows.map(totalText)), columnWidth(t('Nota'), table.rows.map((row) => formatPoints(row.grade)))];
  const fits = (block: ReportTable['exercises'], last: boolean) =>
    tableWidth([nameWidth, ...block.map((exercise) => widths.get(exercise.id)!), ...(last ? tail : [])]) <= PAGE_WIDTH;

  // The fewest blocks that fit. One exercise per block always fits: the
  // name and an exercise column are at most 180 and 60 pt.
  let blocks: ReportTable['exercises'][] = [table.exercises];
  for (let count = 1; count <= table.exercises.length; count++) {
    blocks = evenBlocks(table.exercises, count);
    if (blocks.every((block, index) => fits(block, index === count - 1))) break;
  }
  return blocks.map((block, index) => resultsTable(table, block, nameWidth, widths, index === blocks.length - 1 ? tail : null));
}

// The statistics of each exercise of one table.
function exerciseTable(perExercise: ExerciseStats[]): Content {
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
      body: [
        [t('Exercițiul'), t('Media'), t('% din maxim'), t('Tot'), t('Parțial'), t('Nimic')].map(headerCell),
        ...perExercise.map((exercise): TableCell[] => [
          { text: `${exercise.exerciseId} · ${exercise.label}`, fontSize: 9 },
          { text: exercise.averagePoints === null ? dash : t('{formatPoints} din {formatPoints2}', { formatPoints: formatPoints(exercise.averagePoints), formatPoints2: formatPoints(exercise.maxPoints) }), fontSize: 9 },
          { text: exercise.averagePercent === null ? dash : `${exercise.averagePercent}%`, fontSize: 9 },
          { text: String(exercise.full), fontSize: 9 },
          { text: String(exercise.partial), fontSize: 9 },
          { text: String(exercise.zero), fontSize: 9 },
        ]),
      ],
    },
    layout: 'lightHorizontalLines',
  };
}

const list = (title: string, entries: string[]): Content[] =>
  entries.length === 0 ? [] : [{ text: title, style: 'h3' }, { ul: entries.map((entry) => ({ text: pdfRuns(entry) })), margin: [0, 0, 0, 4] }];

// The one place where the free texts of the report become PDF text: the
// symbols that the font lacks are written as words here (pdfSymbols.ts).
// Student names stay as they are. The analysis texts then become runs where
// they hold a negation bar, a subscript or a raised letter (`pdfRuns`).
function drawable(source: ClassReport): ClassReport {
  const { content } = source.analysis;
  return {
    ...source,
    test: { ...source.test, title: pdfText(source.test.title) },
    exercises: source.exercises.map((exercise) => ({ ...exercise, id: pdfText(exercise.id), label: pdfText(exercise.label) })),
    cesExercises: source.cesExercises && source.cesExercises.map((exercise) => ({ ...exercise, id: pdfText(exercise.id), label: pdfText(exercise.label) })),
    rows: source.rows.map((row) => ({ ...row, items: row.items.map((item) => ({ ...item, exerciseId: pdfText(item.exerciseId) })) })),
    analysis: {
      ...source.analysis,
      content: content && {
        overview: pdfText(content.overview),
        strengths: content.strengths.map(pdfText),
        weaknesses: content.weaknesses.map(pdfText),
        commonMistakes: content.commonMistakes.map(pdfText),
        recommendations: content.recommendations.map(pdfText),
      },
    },
  };
}

// With CES papers that have their own exercises, their table and statistics
// come after the class ones, under "Varianta CES": the class PDF is for the
// teacher only.
export function classPdf(source: ClassReport): TDocumentDefinitions {
  const report = drawable(source);
  const stats = classStats(report);
  const [classTable, cesTable] = reportTables(report);
  const anyFlagged = report.rows.some((row) => row.items.some((item) => item.flagged));
  const { content: analysis, stale } = report.analysis;

  const content: Content[] = [
    { text: t('Raportul clasei · {code}', { code: report.test.code }), style: 'h1' },
    {
      text: [report.test.title, displayClassName(report.test.className), report.test.startedAt ? formatDate(report.test.startedAt) : '']
        .filter((part) => part !== '')
        .join(' · '),
      color: MUTED,
    },
    { text: t('Statistici'), style: 'h2' },
    { text: t('Corectate {gradedCount} din {activeCount} elevi{v3}', { gradedCount: stats.gradedCount, activeCount: stats.activeCount, v3: stats.flaggedCount > 0 ? ` · ${t('de verificat {flaggedCount}', { flaggedCount: stats.flaggedCount })}` : '' }) },
    {
      columns: [
        { text: t('Media {grade}', { grade: grade(stats.average) }), bold: true },
        { text: t('Mediana {grade}', { grade: grade(stats.median) }), bold: true },
        { text: t('Cea mai mică notă {grade}', { grade: grade(stats.min) }), bold: true },
        { text: t('Cea mai mare notă {grade}', { grade: grade(stats.max) }), bold: true },
      ],
      margin: [0, 4, 0, 4],
    },
    { text: stats.groups.map((group) => `${group.label}: ${group.count}`).join('   ·   '), color: MUTED },
    { text: t('Rezultatele elevilor'), style: 'h2' },
    ...resultsBlocks(classTable!),
    ...(cesTable ? [{ text: t('Varianta CES'), style: 'h3' } as Content, ...resultsBlocks(cesTable)] : []),
    ...(anyFlagged ? [{ text: t('Fundalul galben marchează punctajele încă în verificare.'), color: MUTED, fontSize: 9 } as Content] : []),
    { text: t('Pe exerciții'), style: 'h2' },
    exerciseTable(stats.perExercise),
    ...(stats.cesPerExercise ? [{ text: t('Varianta CES'), style: 'h3' } as Content, exerciseTable(stats.cesPerExercise)] : []),
  ];
  if (report.missing.length > 0) {
    content.push(
      { text: t('Fără rezultat'), style: 'h2' },
      { ul: report.missing.map((student) => `${student.studentName} · ${uploadStatusLabel(student.status)}`) },
    );
  }
  if (analysis) {
    content.push({ text: t('Analiza clasei'), style: 'h2' });
    if (stale) content.push({ text: t('Analiza poate fi depășită: notele s-au schimbat după ce a fost scrisă.'), italics: true, color: MUTED });
    content.push(
      { text: pdfRuns(analysis.overview) },
      ...list(t('Ce a mers bine'), analysis.strengths),
      ...list(t('Ce a mers mai greu'), analysis.weaknesses),
      ...list(t('Greșeli frecvente'), analysis.commonMistakes),
      ...list(t('Ce exersați în continuare'), analysis.recommendations),
    );
  }

  return {
    info: { title: t('Raportul clasei · {code}', { code: report.test.code }) },
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [36, 40, 36, 40],
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    styles: {
      h1: { fontSize: 18, bold: true, margin: [0, 0, 0, 2] },
      h2: { fontSize: 13, bold: true, margin: [0, 12, 0, 4] },
      h3: { fontSize: 11, bold: true, margin: [0, 6, 0, 2] },
    },
    footer: (page, pages) => ({ text: t('Pagina {page} din {pages}', { page, pages }), alignment: 'right', margin: [36, 0, 36, 0], color: MUTED, fontSize: 8 }),
    content,
  };
}

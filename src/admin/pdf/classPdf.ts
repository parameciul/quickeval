import type { Content, CustomTableLayout, Node, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { ClassReport } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { classStats, type ExerciseStats, reportTables, type ReportTable } from '../../../shared/stats.ts';
import { formatDate, missingNote } from '../../ui/format.ts';
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
// the total and the grade. Every block fills the page's width: the room left
// goes, in equal parts, into the space between its columns. An active student
// with no result has a row in the class table that says why, as on the page.
// A heading never ends a page, nor starts a part with less than three lines
// under it, and a table starts on a page with its header and at least its
// first rows (`keepWithHeaderRows`).

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

// The lines of pdfmake's "lightHorizontalLines", with `padding` on each side
// of a column, except on the outer sides of the table. Its own 16 pt gap made
// the columns of points much wider than "3,5"; the table chooses its blocks
// with COLUMN_PADDING, then spreads the room left on the page.
function resultsLayout(padding: number): CustomTableLayout {
  return {
    hLineWidth: (index, node) => (index === 0 || index === node.table.body.length ? 0 : index === node.table.headerRows ? 2 : 1),
    vLineWidth: () => 0,
    hLineColor: (index) => (index === 1 ? 'black' : '#aaa'),
    paddingLeft: (index) => (index === 0 ? 0 : padding),
    paddingRight: (index, node) => (index === (node.table.widths as unknown[]).length - 1 ? 0 : padding),
  };
}

// The space on each side of a column that makes columns of these widths fill
// the page; COLUMN_PADDING when they already do, or with only one column.
export function stretchedPadding(widths: number[]): number {
  const gaps = 2 * (widths.length - 1);
  if (gaps === 0) return COLUMN_PADDING;
  return Math.max(COLUMN_PADDING, COLUMN_PADDING + (PAGE_WIDTH - tableWidth(widths)) / gaps);
}

// The width a table takes on the page with `padding` on each side of its
// inner columns.
export const drawnWidth = (widths: number[], padding: number) =>
  widths.reduce((sum, width) => sum + width, 0) + 2 * padding * Math.max(0, widths.length - 1);

// The width of a column that holds these texts (the header in bold at its
// size, the cells at theirs), with one point to spare.
function columnWidth(header: string, cells: string[], max = Infinity): number {
  const widest = Math.max(pdfTextWidth(header, HEADER_SIZE), ...cells.map((cell) => pdfTextWidth(cell, CELL_SIZE)));
  return Math.min(max, Math.ceil(widest) + 1);
}

// The width a table needs on the page: its columns and the least space
// between them.
export const tableWidth = (widths: number[]) => drawnWidth(widths, COLUMN_PADDING);

// Heights on the page, to keep a heading with what follows it. pdfmake gives
// a line of Roboto 1.171875 times its size ((1900 + 500) / 2048). A table row
// has 2 pt above and under its text and a line of 1 pt (2 pt under the
// header). A heading's height counts its line and its margin under it. These
// match the measures of a rendered PDF.
const LINE = 1.171875;
const lineHeight = (size: number) => size * LINE;
const H2_HEIGHT = lineHeight(13) + 4;
const H3_HEIGHT = lineHeight(11) + 2;
const TEXT_LINE = lineHeight(10);
const headerRowHeight = (lines: number) => lines * lineHeight(HEADER_SIZE) + 6;
const rowHeight = (lines: number) => lines * lineHeight(CELL_SIZE) + 5;
// The 2 pt above a table's first row, and a little to spare: an estimate too
// small leaves a heading alone again, one too large only some white space.
const TABLE_SLACK = 8;

// The lines `text` takes in `width`, on the safe side: a text that wraps
// breaks between words, so it can take a line more than its width says.
export function linesOf(text: string, fontSize: number, width: number): number {
  const textWidth = pdfTextWidth(text, fontSize);
  return textWidth <= width ? 1 : Math.ceil(textWidth / width) + 1;
}

// The fewest lines `text` can take in `width`. Its width is measured on the
// wide side (`pdfWidth.ts`), so a twentieth of it is taken off.
export function fewestLinesOf(text: string, fontSize: number, width: number): number {
  return Math.max(1, Math.ceil((pdfTextWidth(text, fontSize) * 0.95) / width));
}

// The height of a table's header and of its first `KEEP_WITH_HEADER` rows,
// which pdfmake keeps together.
const tableStart = (headerLines: number, rowLines: number[]) =>
  TABLE_SLACK + headerRowHeight(headerLines) + rowLines.slice(0, KEEP_WITH_HEADER).reduce((sum, lines) => sum + rowHeight(lines), 0);

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
// The last block also holds the total and the grade. The students with no
// result come last, each with why across the block's other columns.
function resultsTable(
  table: ReportTable,
  missing: ClassReport['missing'],
  exercises: ReportTable['exercises'],
  nameWidth: number,
  widths: Map<string, number>,
  tail: number[] | null,
): { block: Content; start: number } {
  const header: TableCell[] = [headerCell(t('Elev')), ...exercises.map((exercise) => ({ ...headerCell(exercise.id), alignment: 'center' as const }))];
  if (tail) header.push(headerCell(t('Total')), headerCell(t('Nota')));
  const span = header.length - 1;
  const missingRows: TableCell[][] = missing.map((student) => [
    { text: student.studentName, fontSize: CELL_SIZE, color: MUTED },
    { text: missingNote(student.status), fontSize: CELL_SIZE, color: MUTED, colSpan: span },
    ...Array.from({ length: span - 1 }, (): TableCell => ({})),
  ]);
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
  body.push(...missingRows);
  const columns = [nameWidth, ...exercises.map((exercise) => widths.get(exercise.id)!), ...(tail ?? [])];
  const padding = stretchedPadding(columns);
  const headerLines = Math.max(1, ...exercises.map((exercise) => linesOf(exercise.id, HEADER_SIZE, widths.get(exercise.id)!)));
  const spanWidth = drawnWidth(columns.slice(1), padding);
  const rowLines = [
    ...table.rows.map((row) => linesOf(row.studentName, CELL_SIZE, nameWidth)),
    ...missing.map((student) => Math.max(linesOf(student.studentName, CELL_SIZE, nameWidth), linesOf(missingNote(student.status), CELL_SIZE, spanWidth))),
  ];
  const block: Content = {
    table: {
      headerRows: 1,
      keepWithHeaderRows: Math.min(KEEP_WITH_HEADER, body.length),
      dontBreakRows: true,
      widths: columns,
      body: [header, ...body],
    },
    layout: resultsLayout(padding),
    margin: [0, 0, 0, 10],
  };
  return { block, start: tableStart(headerLines, rowLines) };
}

// A results table in as few blocks as fit across the page, `missing` the
// students with no result (none for the CES table), and the height of the
// first block's start.
function resultsBlocks(table: ReportTable, missing: ClassReport['missing'] = []): { blocks: Content[]; start: number } {
  const names = [...table.rows.map((row) => row.studentName), ...missing.map((student) => student.studentName)];
  const nameWidth = columnWidth(t('Elev'), names, NAME_MAX);
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
  const tables = blocks.map((block, index) => resultsTable(table, missing, block, nameWidth, widths, index === blocks.length - 1 ? tail : null));
  return { blocks: tables.map((part) => part.block), start: tables[0]!.start };
}

// The width of the exercise's column of the statistics, at least: the page
// without the five columns of numbers and the space between them.
const EXERCISE_LABEL_WIDTH = PAGE_WIDTH - 320;
const exerciseLabel = (exercise: ExerciseStats) => `${exercise.exerciseId} · ${exercise.label}`;

// The height of the exercises table's start.
const exerciseTableStart = (perExercise: ExerciseStats[]) =>
  tableStart(1, perExercise.map((exercise) => linesOf(exerciseLabel(exercise), CELL_SIZE, EXERCISE_LABEL_WIDTH)));

// The statistics of each exercise of one table.
function exerciseTable(perExercise: ExerciseStats[]): Content {
  return {
    table: {
      headerRows: 1,
      keepWithHeaderRows: Math.min(KEEP_WITH_HEADER, perExercise.length),
      dontBreakRows: true,
      widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
      body: [
        [t('Exercițiul'), t('Media'), t('% din maxim'), t('Tot'), t('Parțial'), t('Nimic')].map(headerCell),
        ...perExercise.map((exercise): TableCell[] => [
          { text: exerciseLabel(exercise), fontSize: 9 },
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

// A heading never ends a page, nor starts a part with too little under it:
// pdfmake's `pageBreakBefore` moves it to the next page when the room left
// under its top is less than `room`, its height and the start of what
// follows (`headingRooms`). pdfmake asks once per heading, in order, so the
// room of a heading followed by a short text counts the next heading's room
// too. A heading at the top of its page stays: moving it would leave a blank
// page. The heights of the content after a heading are no use here: pdfmake
// lays out a table's rows apart, and gives them the wrong page.
export function headingBreak(node: Node, room: number | undefined): boolean {
  if (room === undefined) return false;
  const { pageInnerHeight, verticalRatio } = node.startPosition;
  const above = pageInnerHeight * verticalRatio;
  if (above < AT_TOP) return false;
  return pageInnerHeight - above < room;
}

// A heading this close to the top of the page is at its top (an h2's margin
// above it is 12 pt).
const AT_TOP = 20;
// The lines of text that must follow a heading on its page.
const MIN_LINES = 3;

// The headings of one document and the room each needs, by its `id`.
function headingRooms() {
  const rooms = new Map<string, number>();
  const heading = (style: 'h2' | 'h3', text: string, after: number): Content => {
    const id = `heading-${rooms.size + 1}`;
    rooms.set(id, (style === 'h2' ? H2_HEIGHT : H3_HEIGHT) + after);
    return { text, style, id };
  };
  return { heading, roomOf: (id: string | undefined) => (id === undefined ? undefined : rooms.get(id)) };
}

// The lines of some paragraphs of text: the fewest they can take and the most.
type Lines = { least: number; most: number };
const linesOfAll = (texts: string[], width: number): Lines => ({
  least: texts.reduce((sum, text) => sum + fewestLinesOf(text, 10, width), 0),
  most: texts.reduce((sum, text) => sum + linesOf(text, 10, width), 0),
});

// The height of three lines of text, or, when the text can be shorter, of
// all of it and then `next`, the room of the heading after it.
const textStart = ({ least, most }: Lines, next = 0) => (least >= MIN_LINES ? MIN_LINES * TEXT_LINE : Math.min(most, MIN_LINES) * TEXT_LINE + next);

// A list's text width: the page without its bullet.
const LIST_WIDTH = PAGE_WIDTH - 20;
// The margin above an h3.
const H3_MARGIN = 6;

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

  const { heading, roomOf } = headingRooms();
  const results = resultsBlocks(classTable!, report.missing);
  const ces = cesTable && resultsBlocks(cesTable);

  const content: Content[] = [
    { text: t('Raportul clasei · {code}', { code: report.test.code }), style: 'h1' },
    {
      text: [report.test.title, displayClassName(report.test.className), report.test.startedAt ? formatDate(report.test.startedAt) : '']
        .filter((part) => part !== '')
        .join(' · '),
      color: MUTED,
    },
    heading('h2', t('Statistici'), MIN_LINES * TEXT_LINE),
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
    heading('h2', t('Rezultatele elevilor'), results.start),
    ...results.blocks,
    ...(ces ? [heading('h3', t('Varianta CES'), ces.start), ...ces.blocks] : []),
    ...(anyFlagged ? [{ text: t('Fundalul galben marchează punctajele încă în verificare.'), color: MUTED, fontSize: 9 } as Content] : []),
    heading('h2', t('Pe exerciții'), exerciseTableStart(stats.perExercise)),
    exerciseTable(stats.perExercise),
    ...(stats.cesPerExercise ? [heading('h3', t('Varianta CES'), exerciseTableStart(stats.cesPerExercise)), exerciseTable(stats.cesPerExercise)] : []),
  ];
  if (analysis) {
    const staleNote = t('Analiza poate fi depășită: notele s-au schimbat după ce a fost scrisă.');
    const lists = (
      [
        [t('Ce a mers bine'), analysis.strengths],
        [t('Ce a mers mai greu'), analysis.weaknesses],
        [t('Greșeli frecvente'), analysis.commonMistakes],
        [t('Ce exersați în continuare'), analysis.recommendations],
      ] as const
    ).filter(([, entries]) => entries.length > 0);
    // The analysis's heading stays with its first list's heading when the
    // overview is shorter than three lines.
    const intro = linesOfAll(stale ? [staleNote, analysis.overview] : [analysis.overview], PAGE_WIDTH);
    const firstList = lists[0] ? H3_MARGIN + H3_HEIGHT + textStart(linesOfAll([...lists[0][1]], LIST_WIDTH)) : 0;
    content.push(heading('h2', t('Analiza clasei'), textStart(intro, firstList)));
    if (stale) content.push({ text: staleNote, italics: true, color: MUTED });
    content.push({ text: pdfRuns(analysis.overview) });
    // No space under the last list: at the foot of a page, pdfmake would
    // start a blank page for it.
    lists.forEach(([title, entries], index) => {
      const margin: [number, number, number, number] = [0, 0, 0, index === lists.length - 1 ? 0 : 4];
      content.push(heading('h3', title, textStart(linesOfAll([...entries], LIST_WIDTH))), { ul: entries.map((entry) => ({ text: pdfRuns(entry) })), margin });
    });
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
    pageBreakBefore: (node) => headingBreak(node, roomOf(node.id)),
    footer: (page, pages) => ({ text: t('Pagina {page} din {pages}', { page, pages }), alignment: 'right', margin: [36, 0, 36, 0], color: MUTED, fontSize: 8 }),
    content,
  };
}

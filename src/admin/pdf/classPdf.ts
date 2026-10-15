import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { ClassReport } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { classStats } from '../../../shared/stats.ts';
import { formatDate, uploadStatusLabel } from '../../ui/format.ts';
import { pdfFileName } from './fileName.ts';

// The class PDF (spec §14.2): landscape, with the table of results, the
// statistics, and the analysis. A test can have 60 exercises, which no page
// holds in one table: the exercises go in blocks of at most `BLOCK` columns,
// and every block repeats the student's name.

export const BLOCK = 12;
const FLAGGED = '#fff0a0';
const MUTED = '#586070';

export function classPdfFileName(report: ClassReport): string {
  return pdfFileName(report.test.code, 'raport');
}

const dash = '—';
const grade = (value: number | null) => (value === null ? dash : formatPoints(value));

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

const headerCell = (text: string) => ({ text, bold: true, fontSize: 8, color: MUTED });

// One block of the results table: the students and a part of the exercises.
// The last block also holds the total and the grade.
function resultsTable(report: ClassReport, exerciseIds: string[], last: boolean): Content {
  const exercises = report.exercises.filter((exercise) => exerciseIds.includes(exercise.id));
  const header: TableCell[] = [headerCell('Elev'), ...exercises.map((exercise) => ({ ...headerCell(exercise.id), alignment: 'center' as const }))];
  if (last) header.push(headerCell('Total'), headerCell('Nota'));
  const body: TableCell[][] = report.rows.map((row) => {
    const cells: TableCell[] = [{ text: row.studentName, fontSize: 9 }];
    for (const exercise of exercises) {
      const item = row.items.find((candidate) => candidate.exerciseId === exercise.id);
      cells.push(
        item
          ? { text: formatPoints(item.points), alignment: 'center', fontSize: 9, fillColor: item.flagged ? FLAGGED : undefined }
          : { text: dash, alignment: 'center', fontSize: 9 },
      );
    }
    if (last) {
      cells.push({ text: `${formatPoints(row.total)} / ${formatPoints(row.maxTotal)}`, fontSize: 9 }, { text: formatPoints(row.grade), bold: true, fontSize: 9 });
    }
    return cells;
  });
  const widths: (string | number)[] = [130, ...exercises.map(() => 36)];
  if (last) widths.push(60, 36);
  return {
    table: { headerRows: 1, dontBreakRows: true, widths, body: [header, ...body] },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 10],
  };
}

const list = (title: string, entries: string[]): Content[] =>
  entries.length === 0 ? [] : [{ text: title, style: 'h3' }, { ul: entries, margin: [0, 0, 0, 4] }];

export function classPdf(report: ClassReport): TDocumentDefinitions {
  const stats = classStats(report);
  const blocks = chunks(
    report.exercises.map((exercise) => exercise.id),
    BLOCK,
  );
  const anyFlagged = report.rows.some((row) => row.items.some((item) => item.flagged));
  const { content: analysis, stale } = report.analysis;

  const content: Content[] = [
    { text: `Raportul clasei · ${report.test.code}`, style: 'h1' },
    {
      text: [report.test.title, displayClassName(report.test.className), report.test.startedAt ? formatDate(report.test.startedAt) : '']
        .filter((part) => part !== '')
        .join(' · '),
      color: MUTED,
    },
    { text: 'Statistici', style: 'h2' },
    { text: `Corectate ${stats.gradedCount} din ${stats.activeCount} elevi${stats.flaggedCount > 0 ? ` · de verificat ${stats.flaggedCount}` : ''}` },
    {
      columns: [
        { text: `Media ${grade(stats.average)}`, bold: true },
        { text: `Mediana ${grade(stats.median)}`, bold: true },
        { text: `Cea mai mică notă ${grade(stats.min)}`, bold: true },
        { text: `Cea mai mare notă ${grade(stats.max)}`, bold: true },
      ],
      margin: [0, 4, 0, 4],
    },
    { text: stats.groups.map((group) => `${group.label}: ${group.count}`).join('   ·   '), color: MUTED },
    { text: 'Rezultatele elevilor', style: 'h2' },
    ...blocks.map((ids, index) => resultsTable(report, ids, index === blocks.length - 1)),
    ...(blocks.length === 0 ? [resultsTable(report, [], true)] : []),
    ...(anyFlagged ? [{ text: 'Fundalul galben marchează punctajele încă în verificare.', color: MUTED, fontSize: 9 } as Content] : []),
    { text: 'Pe exerciții', style: 'h2' },
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
        body: [
          ['Exercițiul', 'Media', '% din maxim', 'Tot', 'Parțial', 'Nimic'].map(headerCell),
          ...stats.perExercise.map((exercise): TableCell[] => [
            { text: `${exercise.exerciseId} · ${exercise.label}`, fontSize: 9 },
            { text: exercise.averagePoints === null ? dash : `${formatPoints(exercise.averagePoints)} din ${formatPoints(exercise.maxPoints)}`, fontSize: 9 },
            { text: exercise.averagePercent === null ? dash : `${exercise.averagePercent}%`, fontSize: 9 },
            { text: String(exercise.full), fontSize: 9 },
            { text: String(exercise.partial), fontSize: 9 },
            { text: String(exercise.zero), fontSize: 9 },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    },
  ];
  if (report.missing.length > 0) {
    content.push(
      { text: 'Fără rezultat', style: 'h2' },
      { ul: report.missing.map((student) => `${student.studentName} · ${uploadStatusLabel(student.status)}`) },
    );
  }
  if (analysis) {
    content.push({ text: 'Analiza clasei', style: 'h2' });
    if (stale) content.push({ text: 'Analiza poate fi depășită: notele s-au schimbat după ce a fost scrisă.', italics: true, color: MUTED });
    content.push(
      { text: analysis.overview },
      ...list('Ce a mers bine', analysis.strengths),
      ...list('Ce a mers mai greu', analysis.weaknesses),
      ...list('Greșeli frecvente', analysis.commonMistakes),
      ...list('Ce exersați în continuare', analysis.recommendations),
    );
  }

  return {
    info: { title: `Raportul clasei · ${report.test.code}` },
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [36, 40, 36, 40],
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    styles: {
      h1: { fontSize: 18, bold: true, margin: [0, 0, 0, 2] },
      h2: { fontSize: 13, bold: true, margin: [0, 12, 0, 4] },
      h3: { fontSize: 11, bold: true, margin: [0, 6, 0, 2] },
    },
    footer: (page, pages) => ({ text: `Pagina ${page} din ${pages}`, alignment: 'right', margin: [36, 0, 36, 0], color: MUTED, fontSize: 8 }),
    content,
  };
}

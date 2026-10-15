import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatDate } from '../../ui/format.ts';
import { pdfFileName } from './fileName.ts';
import { pdfText } from './pdfSymbols.ts';

// The student's PDF (spec §14.1): test code and title, the student's name,
// the date, the grade, the table of exercises, the summary, what went well,
// and the recommendations. It is made from this narrow input on purpose: the
// robot's confidence and the reasons to check an item never reach it, and no
// text of it tells how the work was graded.

export interface StudentPdfItem {
  exerciseId: string;
  label: string;
  maxPoints: number;
  points: number;
  studentAnswer: string;
  comment: string;
  // The item waits for the teacher's check: its points show as "în verificare".
  pending: boolean;
}

export interface StudentPdfInput {
  testCode: string;
  testTitle: string;
  studentName: string;
  // When the student sent the upload.
  date: string | null;
  grade: number;
  total: number;
  maxTotal: number;
  officePoints: number;
  summary: string;
  strengths: string[];
  recommendations: string[];
  items: StudentPdfItem[];
}

// Null while the upload has no graded result.
export function studentPdfInput(submission: SubmissionDetail): StudentPdfInput | null {
  const evaluation = submission.evaluation;
  if (!evaluation || submission.status !== 'graded') return null;
  return {
    testCode: submission.testCode,
    testTitle: submission.testTitle,
    studentName: submission.studentName,
    date: submission.submittedAt ?? submission.startedAt,
    grade: evaluation.grade,
    total: evaluation.total,
    maxTotal: evaluation.maxTotal,
    officePoints: evaluation.officePoints,
    summary: evaluation.summary,
    strengths: evaluation.strengths,
    recommendations: evaluation.recommendations,
    items: evaluation.items.map((item) => ({
      exerciseId: item.exerciseId,
      label: item.label,
      maxPoints: item.maxPoints,
      points: item.points,
      studentAnswer: item.studentAnswer,
      comment: item.comment,
      pending: item.needsReview && !item.reviewed,
    })),
  };
}

export function studentPdfFileName(input: StudentPdfInput): string {
  return pdfFileName(input.testCode, input.studentName);
}

const list = (title: string, entries: string[]): Content[] =>
  entries.length === 0 ? [] : [{ text: title, style: 'h2' }, { ul: entries, margin: [0, 0, 0, 4] }];

// The one place where the free texts of the input become PDF text: the symbols
// that the font lacks are written as words here (pdfSymbols.ts). Names stay.
function drawable(input: StudentPdfInput): StudentPdfInput {
  return {
    ...input,
    testTitle: pdfText(input.testTitle),
    summary: pdfText(input.summary),
    strengths: input.strengths.map(pdfText),
    recommendations: input.recommendations.map(pdfText),
    items: input.items.map((item) => ({
      ...item,
      exerciseId: pdfText(item.exerciseId),
      label: pdfText(item.label),
      studentAnswer: pdfText(item.studentAnswer),
      comment: pdfText(item.comment),
    })),
  };
}

export function studentPdf(source: StudentPdfInput): TDocumentDefinitions {
  const input = drawable(source);
  const pending = input.items.some((item) => item.pending);
  const header = ['Exercițiul', 'Puncte', 'Răspunsul tău', 'Comentariu'].map((text) => ({ text, style: 'th' }));
  const rows = input.items.map((item) => [
    { text: [{ text: item.exerciseId, bold: true }, `\n${item.label}`], fontSize: 9 },
    item.pending
      ? { text: 'în verificare', italics: true, noWrap: true }
      : { text: `${formatPoints(item.points)} din ${formatPoints(item.maxPoints)}`, noWrap: true },
    { text: item.studentAnswer, fontSize: 9 },
    { text: item.comment, fontSize: 9 },
  ]);
  const officeText = input.officePoints > 0 ? `, cu ${formatPoints(input.officePoints)} din oficiu` : '';
  return {
    info: { title: `${input.testCode} · ${input.studentName}` },
    pageSize: 'A4',
    pageMargins: [40, 48, 40, 48],
    defaultStyle: { font: 'Roboto', fontSize: 10.5 },
    styles: {
      h1: { fontSize: 18, bold: true, margin: [0, 0, 0, 2] },
      h2: { fontSize: 12, bold: true, margin: [0, 12, 0, 4] },
      th: { bold: true, fontSize: 9, color: '#586070' },
      muted: { color: '#586070' },
    },
    footer: (page, pages) => ({ text: `Pagina ${page} din ${pages}`, alignment: 'right', margin: [40, 0, 40, 0], style: 'muted', fontSize: 8 }),
    content: [
      { text: input.studentName, style: 'h1' },
      {
        text: [input.testTitle, ' · ', input.testCode, input.date ? ` · ${formatDate(input.date)}` : ''].join(''),
        style: 'muted',
      },
      { text: `Nota ${formatPoints(input.grade)}`, fontSize: 16, bold: true, margin: [0, 10, 0, 0] },
      { text: `${formatPoints(input.total)} puncte din ${formatPoints(input.maxTotal)}${officeText}`, margin: [0, 0, 0, 4] },
      ...(pending
        ? [{ text: 'Unele puncte sunt încă în verificare, deci nota se poate schimba.', italics: true, margin: [0, 0, 0, 4] } as Content]
        : []),
      { text: 'Pe exerciții', style: 'h2' },
      {
        table: { headerRows: 1, dontBreakRows: true, widths: ['auto', 'auto', '*', '*'], body: [header, ...rows] },
        layout: 'lightHorizontalLines',
      },
      ...(input.summary ? [{ text: 'Rezumat', style: 'h2' } as Content, { text: input.summary } as Content] : []),
      ...list('Ce ai lucrat bine', input.strengths),
      ...list('Recomandări', input.recommendations),
    ],
  };
}

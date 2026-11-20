import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { StudentResultView, SubmissionDetail } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatDate } from '../../ui/format.ts';
import { pdfFileName } from './fileName.ts';
import { pdfRuns } from './pdfMath.ts';
import { pdfText } from './pdfSymbols.ts';
import { t } from '../../i18n/t.ts';
import { tryName } from '../../../shared/quickTry.ts';

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
    testTitle: tryName(submission.testTitle),
    studentName: tryName(submission.studentName),
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

// The same input from the student's own result page. A student sees only a
// published result, so no item waits for a check there. Null until graded.
export function studentPdfInputFromResult(view: StudentResultView): StudentPdfInput | null {
  const evaluation = view.evaluation;
  if (!evaluation) return null;
  return {
    testCode: view.testCode,
    testTitle: tryName(view.testTitle),
    studentName: tryName(view.studentName),
    date: view.submittedAt,
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
      pending: false,
    })),
  };
}

export function studentPdfFileName(input: StudentPdfInput): string {
  return pdfFileName(input.testCode, input.studentName);
}

const list = (title: string, entries: string[]): Content[] =>
  entries.length === 0 ? [] : [{ text: title, style: 'h2' }, { ul: entries.map((entry) => ({ text: pdfRuns(entry) })), margin: [0, 0, 0, 4] }];

// The one place where the free texts of the input become PDF text: the symbols
// that the font lacks are written as words here (pdfSymbols.ts). Names stay.
// The texts of the grading then become runs where they hold a negation bar,
// a subscript or a raised letter (`pdfRuns`).
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
  const header = [t('Exercițiul'), t('Puncte'), t('Răspunsul tău'), t('Comentariu')].map((text) => ({ text, style: 'th' }));
  const rows = input.items.map((item) => [
    { text: [{ text: item.exerciseId, bold: true }, `\n${item.label}`], fontSize: 9 },
    item.pending
      ? { text: t('în verificare'), italics: true, noWrap: true }
      : { text: t('{formatPoints} din {formatPoints2}', { formatPoints: formatPoints(item.points), formatPoints2: formatPoints(item.maxPoints) }), noWrap: true },
    { text: pdfRuns(item.studentAnswer), fontSize: 9 },
    { text: pdfRuns(item.comment), fontSize: 9 },
  ]);
  const officeText = input.officePoints > 0 ? t(', cu {formatPoints} din oficiu', { formatPoints: formatPoints(input.officePoints) }) : '';
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
    footer: (page, pages) => ({ text: t('Pagina {page} din {pages}', { page, pages }), alignment: 'right', margin: [40, 0, 40, 0], style: 'muted', fontSize: 8 }),
    content: [
      { text: input.studentName, style: 'h1' },
      {
        text: [input.testTitle, ' · ', input.testCode, input.date ? ` · ${formatDate(input.date)}` : ''].join(''),
        style: 'muted',
      },
      { text: t('Nota {grade}', { grade: formatPoints(input.grade) }), fontSize: 16, bold: true, margin: [0, 10, 0, 0] },
      { text: t('{formatPoints} puncte din {formatPoints2}{officeText}', { formatPoints: formatPoints(input.total), formatPoints2: formatPoints(input.maxTotal), officeText }), margin: [0, 0, 0, 4] },
      ...(pending
        ? [{ text: t('Unele puncte sunt încă în verificare, deci nota se poate schimba.'), italics: true, margin: [0, 0, 0, 4] } as Content]
        : []),
      { text: t('Pe exerciții'), style: 'h2' },
      {
        table: { headerRows: 1, dontBreakRows: true, widths: ['auto', 'auto', '*', '*'], body: [header, ...rows] },
        layout: 'lightHorizontalLines',
      },
      ...(input.summary ? [{ text: t('Rezumat'), style: 'h2' } as Content, { text: pdfRuns(input.summary) } as Content] : []),
      ...list(t('Ce ai lucrat bine'), input.strengths),
      ...list(t('Recomandări'), input.recommendations),
    ],
  };
}

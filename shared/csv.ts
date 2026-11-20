import type { ClassReport, ReportRow, UploadStatus } from './api.ts';
import { round2 } from './scoring.ts';
import { reportTables } from './stats.ts';
import { type MessageLang, pageLang, translateMessage } from './i18n/messages.ts';

// The class report as a CSV file for Romanian Excel (spec §14.2): UTF-8 with a
// byte order mark, ";" between cells, a decimal comma, and lines that end with
// CR LF. Numbers are written as numbers, so Excel can add them. Made on an
// English page, it is for English Excel: "," between cells, a decimal point.
//
// Texts come from students' names and from Claude: a cell of text that starts
// with "=", "+", "-", "@" (also the fullwidth forms, and after spaces or tabs),
// a tab, or a carriage return would run as a formula in a spreadsheet, so it
// gets an apostrophe in front. Numbers are never changed: a negative number is
// still a number.

const BOM = '\uFEFF';
const SEPARATOR: Record<MessageLang, string> = { ro: ';', en: ',' };
const FORMULA_START = /^[\t\r]|^[ \t]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/;

// A number as Romanian Excel reads it, "7,5", or English Excel, "7.5".
export function csvNumber(value: number, lang: MessageLang = pageLang()): string {
  return lang === 'en' ? String(round2(value)) : String(round2(value)).replace('.', ',');
}

// A cell of text: safe against formulas, and quoted when it holds the
// separator, a quote, or a line break.
export function csvText(text: string, lang: MessageLang = pageLang()): string {
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return /["\r\n]/.test(safe) || safe.includes(SEPARATOR[lang]) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// The header and the rows of one table of exercises.
function tableLines(exercises: ClassReport['exercises'], rows: ReportRow[], lang: MessageLang): string[] {
  const text = (value: string) => csvText(value, lang);
  const header = [translateMessage('Elev', lang), ...exercises.map((exercise) => exercise.id), translateMessage('Total', lang), translateMessage('Nota', lang), translateMessage('Observații', lang)].map(text);
  const lines = [header.join(SEPARATOR[lang])];
  for (const row of rows) {
    const cells = [
      text(row.studentName),
      ...exercises.map((exercise) => {
        const item = row.items.find((candidate) => candidate.exerciseId === exercise.id);
        return item ? csvNumber(item.points, lang) : '';
      }),
      csvNumber(row.total, lang),
      csvNumber(row.grade, lang),
      row.flagCount > 0 ? text(translateMessage(`de verificat ${row.flagCount}`, lang)) : '',
    ];
    lines.push(cells.join(SEPARATOR[lang]));
  }
  return lines;
}

// `statusLabel` names why a student has no result ("Nu a trimis"), in the words of the app.
// The CSV is often shared, so it says nothing of the CES mark: when the CES
// papers have their own exercises, they come in a block of their own, after an
// empty line, with their own exercise header.
export function classCsv(report: ClassReport, statusLabel: (status: UploadStatus) => string, lang: MessageLang = pageLang()): string {
  const [classTable, cesTable] = reportTables(report);
  const lines = tableLines(classTable!.exercises, classTable!.rows, lang);
  for (const student of report.missing) {
    const cells = [csvText(student.studentName, lang), ...classTable!.exercises.map(() => ''), '', '', csvText(statusLabel(student.status), lang)];
    lines.push(cells.join(SEPARATOR[lang]));
  }
  if (cesTable) lines.push('', ...tableLines(cesTable.exercises, cesTable.rows, lang));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

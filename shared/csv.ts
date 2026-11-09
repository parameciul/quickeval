import type { ClassReport, ReportRow, UploadStatus } from './api.ts';
import { round2 } from './scoring.ts';
import { reportTables } from './stats.ts';

// The class report as a CSV file for Romanian Excel (spec §14.2): UTF-8 with a
// byte order mark, ";" between cells, a decimal comma, and lines that end with
// CR LF. Numbers are written as numbers, so Excel can add them.
//
// Texts come from students' names and from Claude: a cell of text that starts
// with "=", "+", "-", "@" (also the fullwidth forms, and after spaces or tabs),
// a tab, or a carriage return would run as a formula in a spreadsheet, so it
// gets an apostrophe in front. Numbers are never changed: a negative number is
// still a number.

const BOM = '\uFEFF';
const SEPARATOR = ';';
const FORMULA_START = /^[\t\r]|^[ \t]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/;

// A number as Romanian Excel reads it: "7,5".
export function csvNumber(value: number): string {
  return String(round2(value)).replace('.', ',');
}

// A cell of text: safe against formulas, and quoted when it holds the
// separator, a quote, or a line break.
export function csvText(text: string): string {
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// The header and the rows of one table of exercises.
function tableLines(exercises: ClassReport['exercises'], rows: ReportRow[]): string[] {
  const header = ['Elev', ...exercises.map((exercise) => exercise.id), 'Total', 'Nota', 'Observații'].map(csvText);
  const lines = [header.join(SEPARATOR)];
  for (const row of rows) {
    const cells = [
      csvText(row.studentName),
      ...exercises.map((exercise) => {
        const item = row.items.find((candidate) => candidate.exerciseId === exercise.id);
        return item ? csvNumber(item.points) : '';
      }),
      csvNumber(row.total),
      csvNumber(row.grade),
      row.flagCount > 0 ? csvText(`de verificat ${row.flagCount}`) : '',
    ];
    lines.push(cells.join(SEPARATOR));
  }
  return lines;
}

// `statusLabel` names why a student has no result ("Nu a trimis"), in the words of the app.
// The CSV is often shared, so it says nothing of the CES mark: when the CES
// papers have their own exercises, they come in a block of their own, after an
// empty line, with their own exercise header.
export function classCsv(report: ClassReport, statusLabel: (status: UploadStatus) => string): string {
  const [classTable, cesTable] = reportTables(report);
  const lines = tableLines(classTable!.exercises, classTable!.rows);
  for (const student of report.missing) {
    const cells = [csvText(student.studentName), ...classTable!.exercises.map(() => ''), '', '', csvText(statusLabel(student.status))];
    lines.push(cells.join(SEPARATOR));
  }
  if (cesTable) lines.push('', ...tableLines(cesTable.exercises, cesTable.rows));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

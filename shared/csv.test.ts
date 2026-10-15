import { describe, expect, it } from 'vitest';
import type { ClassReport, UploadStatus } from './api.ts';
import { classCsv, csvNumber, csvText } from './csv.ts';

const label = (status: UploadStatus) => (status === 'none' ? 'Nu a trimis' : status);

function report(overrides: Partial<ClassReport> = {}): ClassReport {
  return {
    test: { code: '6E2-26T1', title: 'Fracții', className: '6E2', status: 'done', startedAt: null },
    exercises: [
      { id: 'I.1', label: 'Exercițiul 1', maxPoints: 4.5 },
      { id: 'II.1', label: 'Exercițiul 2', maxPoints: 4.5 },
    ],
    rows: [
      {
        submissionId: 5,
        studentId: 10,
        studentName: 'Ștefănescu Ana', active: true,
        total: 7.25,
        maxTotal: 10,
        grade: 7.25,
        flagCount: 0,
        items: [
          { exerciseId: 'I.1', points: 4.5, maxPoints: 4.5, flagged: false },
          { exerciseId: 'II.1', points: 1.75, maxPoints: 4.5, flagged: false },
        ],
      },
    ],
    missing: [{ studentId: 12, studentName: 'Stan Eva', status: 'none' }],
    analysis: { status: 'none', stale: false, attempts: 0, content: null },
    ...overrides,
  };
}

describe('classCsv', () => {
  it('has no model or effort column', () => {
    const base = report();
    const csv = classCsv(report({ rows: [{ ...base.rows[0]! }] }), label);
    expect(csv).not.toContain('Model');
  });

  it('starts with the byte order mark and uses ";" and a decimal comma, with CR LF line ends', () => {
    const csv = classCsv(report(), label);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe(
      '﻿Elev;I.1;II.1;Total;Nota;Observații\r\n' + 'Ștefănescu Ana;4,5;1,75;7,25;7,25;\r\n' + 'Stan Eva;;;;;Nu a trimis\r\n',
    );
  });

  it('marks the students that have an item to check', () => {
    const base = report();
    const flagged = report({ rows: [{ ...base.rows[0]!, flagCount: 2 }], missing: [] });
    expect(classCsv(flagged, label).split('\r\n')[1]).toBe('Ștefănescu Ana;4,5;1,75;7,25;7,25;de verificat 2');
  });

  it('keeps a student with a missing item as an empty cell', () => {
    const base = report();
    const short = report({ rows: [{ ...base.rows[0]!, items: [base.rows[0]!.items[0]!] }], missing: [] });
    expect(classCsv(short, label).split('\r\n')[1]).toBe('Ștefănescu Ana;4,5;;7,25;7,25;');
  });

  it('puts an apostrophe before a text that would run as a formula in a spreadsheet', () => {
    const base = report();
    const names = ['=HYPERLINK("http://x.test")', '+1', '-2', '@SUM(A1)', '\tx', '\rx'];
    const rows = names.map((studentName, index) => ({ ...base.rows[0]!, submissionId: index + 1, studentName }));
    const lines = classCsv(report({ rows, missing: [] }), label).split('\r\n');
    expect(lines[1]).toBe(`"'=HYPERLINK(""http://x.test"")";4,5;1,75;7,25;7,25;`);
    expect(lines[2]!.startsWith("'+1;")).toBe(true);
    expect(lines[3]!.startsWith("'-2;")).toBe(true);
    expect(lines[4]!.startsWith("'@SUM(A1);")).toBe(true);
    expect(lines[5]!.startsWith("'\tx;")).toBe(true);
    // A carriage return is quoted, so the line stays one record.
    expect(classCsv(report({ rows: [rows[5]!], missing: [] }), label)).toContain("\"'\rx\";4,5");
  });

  it('also guards a fullwidth sign and a sign after leading spaces or tabs, and leaves an inner hyphen alone', () => {
    for (const text of ['＝1', '＋1', '－1', '＠x', ' =1', '  +1', ' 	-1', '	 @x', ' ＝1']) {
      expect(csvText(text), JSON.stringify(text)).toBe(`'${text}`);
    }
    for (const text of ['Popescu-Ionescu Ana', ' Ana', 'a=b', 'Ion - Vasile']) {
      expect(csvText(text), JSON.stringify(text)).toBe(text);
    }
  });

  it('puts the formula guard on the exercise ids and the status words too', () => {
    const base = report();
    const odd = report({
      exercises: [{ id: '=A1', label: 'x', maxPoints: 1 }],
      rows: [{ ...base.rows[0]!, items: [{ exerciseId: '=A1', points: 1, maxPoints: 1, flagged: false }] }],
      missing: [{ studentId: 1, studentName: 'Ion', status: 'failed' }],
    });
    const lines = classCsv(odd, () => '=cmd').split('\r\n');
    expect(lines[0]).toBe("﻿Elev;'=A1;Total;Nota;Observații");
    expect(lines[2]).toBe("Ion;;;;'=cmd");
  });

  it('quotes a name that holds the separator or a quote', () => {
    expect(csvText('Pop; Ion')).toBe('"Pop; Ion"');
    expect(csvText('Pop "Ionel"')).toBe('"Pop ""Ionel"""');
    expect(csvText('Pop Ion')).toBe('Pop Ion');
  });

  it('writes numbers, also negative ones, as numbers: no guard', () => {
    expect(csvNumber(7.5)).toBe('7,5');
    expect(csvNumber(10)).toBe('10');
    expect(csvNumber(2.675)).toBe('2,68');
    expect(csvNumber(-1)).toBe('-1');
    expect(csvNumber(0)).toBe('0');
  });
});

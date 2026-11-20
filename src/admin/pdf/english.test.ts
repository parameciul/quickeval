import '../../test/english.ts';
import { describe, expect, it } from 'vitest';
import type { ClassReport } from '../../../shared/api.ts';
import { classPdf, classPdfFileName } from './classPdf.ts';
import { studentPdf, type StudentPdfInput } from './studentPdf.ts';

// The PDFs made on an English page, on English sample data: no Romanian word.

const ROMANIAN = /[ăâîșțĂÂÎȘȚ]|\b(și|sau|din|pentru|nota|media|mediana|raport\w*|puncte|lucrar\w*|elev\w*|clasa|pagina|statistici|corectate|de verificat)\b/i;

function textsOf(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [];
  if (Array.isArray(node)) return node.flatMap(textsOf);
  if (node && typeof node === 'object') {
    const object = node as Record<string, unknown>;
    const body = (object.table as { body?: unknown } | undefined)?.body;
    return [...['text', 'ul', 'ol', 'columns', 'stack', 'title'].flatMap((key) => textsOf(object[key])), ...textsOf(body)];
  }
  return [];
}

const input: StudentPdfInput = {
  testCode: '7E2-26T2',
  testTitle: 'Square roots',
  studentName: 'BAKER NOAH',
  date: '2026-11-09T08:54:00.000Z',
  grade: 7.5,
  total: 65,
  maxTotal: 90,
  officePoints: 10,
  summary: 'Good work.',
  strengths: ['Roots'],
  recommendations: ['Practise.'],
  items: [{ exerciseId: 'I.1', label: 'Part I, ex. 1', maxPoints: 5, points: 4.5, studentAnswer: 'x = 3', comment: 'Right.', pending: false }],
};

const report: ClassReport = {
  test: { code: '7E2-26T2', title: 'Square roots', classId: 1, className: '7E2', status: 'done', startedAt: '2026-11-09T08:53:00.000Z' },
  exercises: [{ id: 'I.1', label: 'Part I, ex. 1', maxPoints: 5 }],
  cesExercises: null,
  rows: [
    { submissionId: 5, studentId: 10, studentName: 'BAKER NOAH', active: true, total: 4.5, maxTotal: 5, grade: 9.5, flagCount: 1, ces: false, variant: 'class', items: [{ exerciseId: 'I.1', points: 4.5, maxPoints: 5, flagged: true }] },
  ],
  missing: [{ studentId: 12, studentName: 'EVANS JACK', status: 'none', ces: false }],
  analysis: { status: 'none', stale: false, attempts: 0, content: null },
};

describe('the PDFs in English', () => {
  it("say the student's grade in English, with a decimal point", () => {
    const definition = studentPdf(input);
    const text = textsOf(definition.content).join('\n');
    expect(text).toContain('Grade 7.5');
    expect(text.match(new RegExp(ROMANIAN.source, 'gi'))).toBeNull();
  });

  it('give the class report an English title, statistics and file name', () => {
    const definition = classPdf(report);
    const text = [...textsOf(definition.content), ...textsOf(definition.info)].join('\n');
    expect(text).toContain('Class report · 7E2-26T2');
    expect(text).toMatch(/Average 9\.5/);
    expect(text).toMatch(/Median 9\.5/);
    expect(text.match(new RegExp(ROMANIAN.source, 'gi'))).toBeNull();
    expect(classPdfFileName(report)).toContain('report');
  });
});

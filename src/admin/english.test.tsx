import '../test/english.ts';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StudentRow } from '../../shared/api.ts';
import { createFakeApi, fakeEvaluation, fakeItem, fakeSubmission, fakeTest, fakeUpload } from '../test/fakeApi.ts';
import { renderAdmin } from '../test/renderAdmin.tsx';

// The teacher app in English, on English sample data: no Romanian may show,
// in the text or in the labels screen readers read. The static guard
// (scripts/i18n/scan.test.ts) cannot see a stage name or a stored word that
// reaches the page through a variable; this test does.

const ROMANIAN = /[ăâîșțĂÂÎȘȚ]|\b(și|sau|din|pentru|lucrar\w*|lucrări\w*|elev\w*|testul|teste|barem\w*|Pregătire|Tipărire|Corectare|Verificare|Rezultate|publicat\w*|trimis\w*|gata|clasa|clase|nota|puncte|verific\w*|Acum|nimic|Pagina)\b/;

function pageText(): string {
  const labels = [...document.body.querySelectorAll('[aria-label], [title], [placeholder], [alt]')].flatMap((element) =>
    ['aria-label', 'title', 'placeholder', 'alt'].map((name) => element.getAttribute(name) ?? ''),
  );
  // The language button names Romanian in Romanian, on purpose.
  return [document.body.textContent ?? '', ...labels].join('\n').replaceAll('Română', '');
}

// Each Romanian word found, with the text around it.
function romanianIn(text: string): string[] {
  const global = new RegExp(ROMANIAN.source, 'g');
  return [...text.matchAll(global)].map((match) => text.slice(Math.max(0, match.index - 30), match.index + 30));
}

const NAMES = ['ADAMS OLIVIA', 'BAKER NOAH', 'BROWN LIAM', 'CLARK EMMA', 'EVANS JACK'];
const students: StudentRow[] = NAMES.map((fullName, i) => ({ id: 10 + i, fullName, active: true, canDelete: false, ces: false }));
const items = ['I.1', 'I.2', 'II.1'].map((exerciseId, i) =>
  fakeItem({ id: 500 + i, exerciseId, label: `Exercise ${exerciseId}`, points: i === 1 ? 2 : 5, maxPoints: 5, studentAnswer: 'x = 3', comment: 'Right.', confidence: i === 1 ? 'medium' : 'very_high', needsReview: i === 1, reviewReason: i === 1 ? 'Hard to read.' : '' }),
);
const graded = (i: number) =>
  fakeUpload({ studentId: 10 + i, studentName: NAMES[i]!, submissionId: 100 + i, status: 'graded', fileCount: 2, grade: 7 + i / 2, total: 60, maxTotal: 90, flagCount: i === 0 ? 1 : 0, resultsOpen: true, submittedAt: '2026-11-09T08:54:00.000Z' });
const tests = [
  fakeTest({ code: '7E2-26T1', title: 'Fractions', status: 'draft', classId: 1, className: '7E2' }, students.map((s) => fakeUpload({ studentId: s.id, studentName: s.fullName }))),
  fakeTest({ code: '7E2-26T2', title: 'Square roots', status: 'done', classId: 1, className: '7E2', startedAt: '2026-11-09T08:53:00.000Z', resultsOpen: true, files: { test: { name: 'roots.pdf', type: 'application/pdf' }, barem: { name: 'scheme.pdf', type: 'application/pdf' } }, print: { status: 'ready', fromWord: false } }, [0, 1, 2, 3].map(graded)),
];
const submissions = [0, 1, 2, 3].map((i) =>
  fakeSubmission({ id: 100 + i, testCode: '7E2-26T2', testTitle: 'Square roots', studentId: 10 + i, studentName: NAMES[i]!, startedAt: '2026-11-09T08:53:00.000Z', submittedAt: '2026-11-09T08:54:00.000Z', resultsOpen: true, evaluation: fakeEvaluation(items.map((item) => ({ ...item })), { maxTotal: 90, officePoints: 10, summary: 'Good work.' }) }),
);
const api = () =>
  createFakeApi({ classes: [{ id: 1, name: '7E2', schoolYear: 2026, archived: false, studentCount: students.length }], students: { 1: students }, tests: structuredClone(tests), submissions: structuredClone(submissions), histories: [] });

const PAGES: [string, string][] = [
  ['/', 'Good'],
  ['/tests/7E2-26T1#prepare', 'Fractions'],
  ['/tests/7E2-26T1#in-class', 'Fractions'],
  ['/tests/7E2-26T2#prepare', 'Square roots'],
  ['/tests/7E2-26T2#print', 'Square roots'],
  ['/tests/7E2-26T2#grading', 'Square roots'],
  ['/tests/7E2-26T2#review', 'Square roots'],
  ['/tests/7E2-26T2#results', 'Square roots'],
  ['/tests/7E2-26T2/papers/100', 'ADAMS OLIVIA'],
  ['/classes/1', 'Class 7E2'],
  ['/classes/1#students', 'Class 7E2'],
  ['/tests/new', 'New test'],
  ['/settings', 'Settings'],
  ['/account', 'My account'],
];

describe('the teacher app in English', () => {
  it.each(PAGES)('%s shows no Romanian', async (path, heading) => {
    renderAdmin(path, api());
    await screen.findByRole('heading', { level: 1, name: new RegExp(heading) });
    // Let the page's other reads arrive.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(romanianIn(pageText())).toEqual([]);
  });
});

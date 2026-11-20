import '../test/english.ts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudentResultView } from '../../shared/api.ts';
import { PDF_TYPE } from '../../shared/files.ts';
import { QUICK_TRY_CLASS, QUICK_TRY_STUDENT, QUICK_TRY_TITLE } from '../../shared/quickTry.ts';
import { createFakeApi, fakeEvaluation, fakeItem, fakeSubmission, reviewPointsOf } from '../test/fakeApi.ts';
import { createFakeTryApi, renderTry, TRY_CODE, TRY_SUBMISSION, tryTest } from '../test/fakeTryApi.tsx';
import { expectNoGradingWords } from '../test/gradingWords.ts';

// A Quick Try's pages in English, on English sample data. The server stores
// the try's student, class and default title in Romanian ("Elev", "PROBA",
// "Încercare rapidă"): the pages show them in English.

const ROMANIAN = /[ăâîșțĂÂÎȘȚ]|\b(și|sau|din|pentru|elev\w*|lucrar\w*|testul|nota|puncte|pagina|subiectul|încercare|verific\w*|rezultat\w*)\b/i;

function romanianIn(): string[] {
  const labels = [...document.body.querySelectorAll('[aria-label], [alt], [title], [placeholder]')].flatMap((element) =>
    ['aria-label', 'alt', 'title', 'placeholder'].map((name) => element.getAttribute(name) ?? ''),
  );
  const text = [document.body.textContent ?? '', ...labels].join('\n').replaceAll('Română', '');
  return [...text.matchAll(new RegExp(ROMANIAN.source, 'gi'))].map((match) => text.slice(Math.max(0, match.index - 30), match.index + 30));
}

const files = { test: { name: 'test.pdf', type: PDF_TYPE }, barem: { name: 'scheme.pdf', type: PDF_TYPE } };
const photo = { id: 61, name: 'p1.jpg', contentType: 'image/jpeg', size: 1000, position: 1 };

const result: StudentResultView = {
  resultCode: null,
  testCode: TRY_CODE,
  testTitle: QUICK_TRY_TITLE,
  className: QUICK_TRY_CLASS,
  studentName: QUICK_TRY_STUDENT,
  submittedAt: '2026-11-03T08:15:00.000Z',
  status: 'graded',
  files: [photo],
  evaluation: {
    maxTotal: 10,
    officePoints: 1,
    total: 7,
    grade: 7,
    summary: 'Good work.',
    strengths: ['Fractions'],
    recommendations: ['Practise.'],
    items: [{ exerciseId: 'I.1', label: 'Part I, ex. 1', maxPoints: 4.5, points: 4.5, studentAnswer: '3/4', comment: 'Right.' }],
  },
};

function setupGraded(path: string) {
  const evaluation = fakeEvaluation([fakeItem({ id: 71, exerciseId: 'I.1', label: 'Part I, ex. 1', points: 4.5, studentAnswer: '3/4', comment: 'Right.', needsReview: false, page: 1 })], {
    summary: 'Good work.',
  });
  const paper = fakeSubmission({ id: TRY_SUBMISSION, testCode: TRY_CODE, testTitle: QUICK_TRY_TITLE, studentName: QUICK_TRY_STUDENT, files: [photo], evaluation });
  const test = tryTest(
    { status: 'done', files },
    { status: 'graded', fileCount: 1, grade: evaluation.grade, total: evaluation.total, maxTotal: 10, flagCount: evaluation.flagCount, reviewPoints: reviewPointsOf(evaluation) },
  );
  renderTry(path, createFakeApi({ classes: [], students: {}, tests: [test], submissions: [paper] }), createFakeTryApi({ result: structuredClone(result) }));
}

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:preview'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
});

describe('a Quick Try in English', () => {
  it("names the try and its student in English on the student's result", async () => {
    setupGraded('/');
    expect(await screen.findByRole('heading', { name: 'Quick Try', level: 1 })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('tab', { name: "The student's result" }));
    expect(await screen.findByRole('heading', { name: 'Student' })).toBeInTheDocument();
    expect(romanianIn()).toEqual([]);
    expectNoGradingWords(screen.getByTestId('student-view').textContent ?? '');
  });

  it('shows the paper page with every exercise in English', async () => {
    setupGraded(`/tests/${TRY_CODE}/papers/${TRY_SUBMISSION}`);
    expect(await screen.findByRole('heading', { name: 'Review', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('Part I, ex. 1')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(romanianIn()).toEqual([]);
  });

  it("names the try in English on the phone page, with no Romanian", async () => {
    renderTry('/phone', createFakeApi({ classes: [], students: {}, tests: [tryTest()] }), createFakeTryApi());
    expect(await screen.findByRole('heading', { name: "The student's paper", level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Quick Try')).toBeInTheDocument();
    expect(romanianIn()).toEqual([]);
    expectNoGradingWords();
  });

  it('shows the files, the pages and the ready line in English, with no Romanian', async () => {
    renderTry('/', createFakeApi({ classes: [], students: {}, tests: [tryTest({ files })] }), createFakeTryApi({ pages: [structuredClone(photo)] }));
    expect(await screen.findByText('Ready to grade')).toBeInTheDocument();
    expect(screen.getByText('The test, the marking scheme and 1 page are in. The grading takes a few minutes.')).toBeInTheDocument();
    expect(screen.getAllByText('Replace')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Start grading' })).toBeEnabled();
    expect(romanianIn()).toEqual([]);
  });

  it("keeps a teacher's own name for the try as it is", async () => {
    renderTry('/phone', createFakeApi({ classes: [], students: {}, tests: [tryTest({ title: 'Fractions 6B' })] }), createFakeTryApi());
    expect(await screen.findByText('Fractions 6B')).toBeInTheDocument();
  });
});

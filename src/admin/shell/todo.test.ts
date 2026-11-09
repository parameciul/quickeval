import { describe, expect, it } from 'vitest';
import type { TestInfo, TestSummary } from '../../../shared/api.ts';
import { fakeTest, noCesVariant } from '../../test/fakeApi.ts';
import { stagesOf } from '../stages.ts';
import { inWork, todoList, todoOf, todoPath } from './todo.ts';

const summary = (overrides: Partial<TestSummary>): TestSummary => fakeTest({ title: 'Ecuații', ...overrides }).test;
const generated = { request: 'none', unchecked: true } as const;
const graded = { status: 'done', gradedCount: 24, submittedCount: 24 } as const;

describe('todoOf', () => {
  it('asks to check a generated barem of a draft or open test', () => {
    for (const status of ['draft', 'open'] as const) {
      expect(todoOf(summary({ status, barem: generated }))).toMatchObject({
        stage: 'Pregătire',
        task: 'Verifică baremul generat',
        text: 'Până îl confirmi, baremul nu se folosește la corectare.',
        action: 'Deschide',
        short: 'baremul de verificat',
        testTitle: 'Ecuații',
        className: '6E2',
        code: '6E2-26T1',
      });
    }
  });

  it('asks to generate the barem again when its new generation failed', () => {
    for (const status of ['draft', 'open'] as const) {
      expect(todoOf(summary({ status, barem: { request: 'failed', unchecked: true } }))).toMatchObject({
        stage: 'Pregătire',
        task: 'Generează din nou baremul',
        text: 'Baremul nu s-a putut genera din nou. Fără el, testul nu se poate corecta.',
        action: 'Deschide',
        short: 'baremul nu s-a generat',
      });
    }
    expect(todoOf(summary({ status: 'done', barem: { request: 'failed', unchecked: true } }))).toBeNull();
  });

  it('waits while a new barem is generated, and needs nothing for a checked barem', () => {
    expect(todoOf(summary({ status: 'draft', barem: { request: 'requested', unchecked: true } }))).toBeNull();
    expect(todoOf(summary({ status: 'draft', barem: { request: 'none', unchecked: false } }))).toBeNull();
  });

  it('asks to decide the points to check', () => {
    expect(todoOf(summary({ ...graded, flagCount: 3 }))).toMatchObject({
      stage: 'Verificare',
      task: 'Decide 3 puncte nesigure',
      text: '24 de lucrări corectate. Punctele nesigure te așteaptă pe tine.',
      action: 'Începe',
      short: '3 puncte nesigure',
    });
    expect(todoOf(summary({ status: 'evaluating', gradedCount: 1, flagCount: 1 }))).toMatchObject({
      task: 'Decide 1 punct nesigur',
      text: '1 lucrare corectată. Punctele nesigure te așteaptă pe tine.',
      short: '1 punct nesigur',
    });
  });

  it('opens the review for the points to check, and the test page for the rest', () => {
    expect(todoPath(todoOf(summary({ ...graded, flagCount: 3 }))!)).toBe('/teste/6E2-26T1/verificare');
    expect(todoPath(todoOf(summary({ ...graded }))!)).toBe('/teste/6E2-26T1');
    expect(todoPath(todoOf(summary({ status: 'draft', barem: generated }))!)).toBe('/teste/6E2-26T1');
  });

  it('asks to publish checked results that are not published', () => {
    expect(todoOf(summary({ ...graded }))).toMatchObject({
      stage: 'Rezultate',
      task: 'Publică rezultatele',
      text: '24 de lucrări verificate. Fiecare elev primește linkul lui după ce publici.',
      short: 'nepublicate',
    });
    expect(todoOf(summary({ ...graded, publishedCount: 10 }))).toMatchObject({ stage: 'Rezultate', short: 'publicate pentru 10 elevi' });
    expect(todoOf(summary({ ...graded, publishedCount: 1 }))?.short).toBe('publicate pentru 1 elev');
  });

  it('needs nothing once the results are open or every paper is published', () => {
    expect(todoOf(summary({ ...graded, resultsOpen: true }))).toBeNull();
    expect(todoOf(summary({ ...graded, publishedCount: 24 }))).toBeNull();
  });

  it('needs nothing for a test without graded papers, a test in work, or an archived test', () => {
    expect(todoOf(summary({ status: 'done', gradedCount: 0 }))).toBeNull();
    expect(todoOf(summary({ status: 'open' }))).toBeNull();
    expect(todoOf(summary({ status: 'evaluating', gradedCount: 3 }))).toBeNull();
    expect(todoOf(summary({ ...graded, flagCount: 2, archived: true }))).toBeNull();
  });
});

describe('todoList', () => {
  it('lists Pregătire, then Verificare, then Rezultate, newest first within each', () => {
    const items = todoList([
      summary({ code: 'A', ...graded }),
      summary({ code: 'B', ...graded, flagCount: 1 }),
      summary({ code: 'C', status: 'open' }),
      summary({ code: 'D', status: 'draft', barem: generated }),
      summary({ code: 'E', ...graded, flagCount: 2 }),
    ]);
    expect(items.map((item) => `${item.stage} ${item.code}`)).toEqual(['Pregătire D', 'Verificare B', 'Verificare E', 'Rezultate A']);
  });
});

describe('inWork', () => {
  it('keeps a test in work until it is done and needs nothing, or archived', () => {
    expect(inWork(summary({ status: 'draft' }))).toBe(true);
    expect(inWork(summary({ status: 'open' }))).toBe(true);
    expect(inWork(summary({ status: 'evaluating', gradedCount: 3 }))).toBe(true);
    expect(inWork(summary({ ...graded }))).toBe(true);
    expect(inWork(summary({ ...graded, flagCount: 2 }))).toBe(true);
    expect(inWork(summary({ ...graded, resultsOpen: true }))).toBe(false);
    expect(inWork(summary({ status: 'done', gradedCount: 0 }))).toBe(false);
    expect(inWork(summary({ ...graded, flagCount: 2, archived: true }))).toBe(false);
  });
});

describe('the CES barem in "De făcut"', () => {
  const withCes = (overrides: Partial<TestInfo>): TestSummary => fakeTest({ title: 'Ecuații', ...overrides }).test;
  const ces = (barem: { request: 'none' | 'requested' | 'failed'; unchecked: boolean }) =>
    noCesVariant({ studentCount: 1, files: { test: { name: 't.pdf', type: 'application/pdf' }, barem: null }, barem });

  it('asks to check a generated CES barem, also during the evaluation, and marks Pregătire', () => {
    for (const status of ['draft', 'open', 'evaluating'] as const) {
      const test = withCes({ status, ces: ces(generated) });
      expect(todoOf(test)).toMatchObject({
        stage: 'Pregătire',
        task: 'Verifică baremul CES generat',
        text: 'Până îl confirmi, lucrările CES nu se corectează.',
        short: 'baremul CES de verificat',
      });
      expect(stagesOf(test).stages[0]).toMatchObject({ name: 'Pregătire', state: 'wait', note: 'baremul CES de verificat' });
    }
  });

  it('asks to generate the CES barem again when its new generation failed', () => {
    expect(todoOf(withCes({ status: 'evaluating', ces: ces({ request: 'failed', unchecked: true }) }))).toMatchObject({
      task: 'Generează din nou baremul CES',
      short: 'baremul CES nu s-a generat',
    });
  });

  it('asks for the class barem first, and nothing once the test is done or while the CES barem is made', () => {
    expect(todoOf(withCes({ status: 'open', barem: generated, ces: ces(generated) }))?.task).toBe('Verifică baremul generat');
    expect(todoOf(withCes({ ...graded, resultsOpen: true, ces: ces(generated) }))).toBeNull();
    expect(todoOf(withCes({ status: 'open', ces: ces({ request: 'requested', unchecked: true }) }))).toBeNull();
    // No CES test file: no CES variant to ask about.
    expect(todoOf(withCes({ status: 'open', ces: noCesVariant({ barem: generated }) }))).toBeNull();
  });
});

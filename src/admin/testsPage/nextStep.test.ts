import { describe, expect, it } from 'vitest';
import type { TestSummary } from '../../../shared/api.ts';
import { fakeSummary } from '../../test/fakeApi.ts';
import { stagesOf } from '../stages.ts';
import { nextStep, type NextStep } from './nextStep.ts';

const started = { startedAt: '2026-10-06T07:15:00.000Z' };
const graded = { ...started, evaluationStartedAt: '2026-10-07T07:15:00.000Z', submittedCount: 22, gradedCount: 22 };
const page = (label: string): NextStep => ({ kind: 'link', label, to: '/teste/6E2-26T1' });

const CASES: [string, TestSummary, NextStep][] = [
  ['checks the generated barem', fakeSummary({ barem: { request: 'none', unchecked: true } }), page('Verifică baremul')],
  ['asks for the barem again after it failed', fakeSummary({ barem: { request: 'failed', unchecked: true } }), page('Generează din nou baremul')],
  ['uploads the missing test file', fakeSummary({ prepared: { testFile: false, baremFile: false, print: 'none' } }), page('Încarcă testul')],
  ['uploads the missing barem', fakeSummary({ prepared: { testFile: true, baremFile: false, print: 'ready' } }), page('Încarcă baremul')],
  [
    'waits while the barem is generated',
    fakeSummary({ barem: { request: 'requested', unchecked: false }, prepared: { testFile: true, baremFile: false, print: 'ready' } }),
    null,
  ],
  ['waits while the print PDF is made', fakeSummary({ prepared: { testFile: true, baremFile: true, print: 'none' } }), null],
  ['opens the test when the print PDF failed', fakeSummary({ prepared: { testFile: true, baremFile: true, print: 'failed' } }), page('Deschide')],
  ['starts a draft ready for the class', fakeSummary(), page('Începe testul')],
  ['starts the grading of an open test', fakeSummary({ status: 'open', ...started }), page('Pornește corectarea')],
  ['waits for the time set for the grading', fakeSummary({ status: 'open', ...started, evaluationAt: '2026-10-06T12:00:00.000Z' }), null],
  ['waits while the papers are graded', fakeSummary({ status: 'evaluating', ...started, submittedCount: 22, gradedCount: 15 }), null],
  ['checks the points that wait', fakeSummary({ status: 'done', ...graded, flagCount: 3 }), page('Verifică 3 puncte')],
  ['checks one point', fakeSummary({ status: 'evaluating', ...graded, flagCount: 1 }), page('Verifică 1 punct')],
  ['publishes the results on the row', fakeSummary({ status: 'done', ...graded }), { kind: 'publish', label: 'Publică rezultatele' }],
  ['publishes for everyone after some students', fakeSummary({ status: 'done', ...graded, publishedCount: 2 }), { kind: 'publish', label: 'Publică pentru toți' }],
  ['opens the class report of published results', fakeSummary({ status: 'done', ...graded, resultsOpen: true }), { kind: 'link', label: 'Raportul clasei', to: '/teste/6E2-26T1/raport' }],
  ['has nothing for a done test without a graded paper', fakeSummary({ status: 'done', ...started, submittedCount: 2 }), null],
];

describe('nextStep', () => {
  it.each(CASES)('%s', (_name, test, expected) => {
    expect(nextStep(test, stagesOf(test).current)).toEqual(expected);
  });
});

import { describe, expect, it } from 'vitest';
import type { TestSummary } from '../../shared/api.ts';
import { fakeSummary as summary } from '../test/fakeApi.ts';
import { todoOf } from './shell/todo.ts';
import { stagesOf } from './stages.ts';

const started = { startedAt: '2026-10-06T07:15:00.000Z' };
const graded = { ...started, evaluationStartedAt: '2026-10-07T07:15:00.000Z', submittedCount: 22, gradedCount: 22 };

// Each case: the test, its bar (d done, w waits on the teacher, n in
// progress, l later) and its current stage with its state.
const CASES: [string, TestSummary, string, string][] = [
  ['a draft without its test file', summary({ prepared: { testFile: false, baremFile: false, print: 'none' } }), 'nlllll', 'Pregătire · lipsește testul'],
  [
    'a draft whose barem is generated',
    summary({ barem: { request: 'requested', unchecked: false }, prepared: { testFile: true, baremFile: false, print: 'none' } }),
    'nnllll',
    'Pregătire · baremul se generează',
  ],
  ['a draft without a barem, printed', summary({ prepared: { testFile: true, baremFile: false, print: 'ready' } }), 'ndllll', 'Pregătire · lipsește baremul'],
  ['a draft whose generated barem waits', summary({ barem: { request: 'none', unchecked: true } }), 'wdllll', 'Pregătire · baremul de verificat'],
  ['a draft whose new barem failed', summary({ barem: { request: 'failed', unchecked: true } }), 'wdllll', 'Pregătire · baremul nu s-a generat'],
  ['a draft whose print PDF failed', summary({ prepared: { testFile: true, baremFile: true, print: 'failed' } }), 'dnllll', 'Tipărire · nu s-a putut pregăti'],
  ['a draft whose print PDF is made', summary({ prepared: { testFile: true, baremFile: true, print: 'none' } }), 'dnllll', 'Tipărire · se pregătește'],
  ['a draft ready for the class', summary(), 'ddllll', 'În clasă · testul nu a început'],
  ['an open test', summary({ status: 'open', ...started, submittedCount: 19 }), 'ddnlll', 'În clasă · elevii trimit lucrările'],
  ['an open test before its print PDF', summary({ status: 'open', ...started, prepared: { testFile: true, baremFile: true, print: 'none' } }), 'ddnlll', 'În clasă · elevii trimit lucrările'],
  [
    'a test opened again after its grading, with points to check',
    summary({ status: 'open', ...graded, flagCount: 1 }),
    'ddnlwl',
    'Verificare · 1 punct nesigur',
  ],
  ['a test in evaluation', summary({ status: 'evaluating', ...started, submittedCount: 22, gradedCount: 15 }), 'dddnll', 'Corectare · 15 din 22 corectate'],
  [
    'a test in evaluation with points to check',
    summary({ status: 'evaluating', ...started, submittedCount: 22, gradedCount: 15, flagCount: 3 }),
    'dddnwl',
    'Verificare · 3 puncte nesigure',
  ],
  ['a done test with points to check', summary({ status: 'done', ...graded, flagCount: 3 }), 'ddddwl', 'Verificare · 3 puncte nesigure'],
  ['a done test with its results to publish', summary({ status: 'done', ...graded }), 'dddddw', 'Rezultate · nepublicate'],
  ['a done test published for some students', summary({ status: 'done', ...graded, publishedCount: 3 }), 'dddddw', 'Rezultate · publicate pentru 3 elevi'],
  ['a done test published for one student', summary({ status: 'done', ...graded, publishedCount: 1 }), 'dddddw', 'Rezultate · publicate pentru 1 elev'],
  [
    'a done test with its results open',
    summary({ status: 'done', ...graded, resultsOpen: true, averageGrade: 7.72 }),
    'dddddd',
    'Rezultate · publicate · media testului 7,72',
  ],
  ['a done test whose papers were all published one by one', summary({ status: 'done', ...graded, publishedCount: 22 }), 'dddddd', 'Rezultate · publicate'],
  ['a done test without a graded paper', summary({ status: 'done', ...started, submittedCount: 2 }), 'dddddl', 'Rezultate · nicio lucrare corectată'],
  ['an archived test whose points still wait', summary({ status: 'done', ...graded, flagCount: 2, archived: true }), 'ddddnl', 'Verificare · 2 puncte nesigure'],
];

const bar = (test: TestSummary) =>
  stagesOf(test)
    .stages.map((stage) => stage.state[0])
    .join('');

const currentText = (test: TestSummary) => {
  const { current } = stagesOf(test);
  return current.note ? `${current.name} · ${current.note}` : current.name;
};

describe('stagesOf', () => {
  it.each(CASES)('draws %s', (_name, test, expectedBar, expectedCurrent) => {
    expect(bar(test)).toBe(expectedBar);
    expect(currentText(test)).toBe(expectedCurrent);
  });

  it('names the six stages in order', () => {
    expect(stagesOf(summary()).stages.map((stage) => stage.name)).toEqual(['Pregătire', 'Tipărire', 'În clasă', 'Corectare', 'Verificare', 'Rezultate']);
  });

  it('waits on the teacher exactly when "De făcut" has the test, at the same stage', () => {
    for (const [name, test] of CASES) {
      const waiting = stagesOf(test).stages.filter((stage) => stage.state === 'wait');
      const todo = todoOf(test);
      expect(waiting.map((stage) => stage.name), name).toEqual(todo ? [todo.stage] : []);
    }
  });
});

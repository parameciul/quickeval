import type { TestSummary } from '../../shared/api.ts';
import { formatPoints } from '../../shared/scoring.ts';
import { countLabel } from '../ui/format.ts';
import { todoOf } from './shell/todo.ts';

export type StageName = 'Pregătire' | 'Tipărire' | 'În clasă' | 'Corectare' | 'Verificare' | 'Rezultate';

// done: blue; wait: waits on the teacher (orange); now: in progress (pale
// blue); later: not yet (grey).
export type StageState = 'done' | 'wait' | 'now' | 'later';

export interface Stage {
  name: StageName;
  state: StageState;
  // The state in a few words ("3 puncte nesigure"); empty when the stage
  // has nothing to say.
  note: string;
}

export interface TestStages {
  // The six stages, in order.
  stages: Stage[];
  // The stage the test is at: the first that waits on the teacher, else the
  // first in progress, else the first not reached, else Rezultate.
  current: Stage;
}

// The six stages of a test (redesign spec §5). A stage waits on the teacher
// exactly when "De făcut" has the test, at that stage, so the bar and the
// count in the menu always agree.
export function stagesOf(test: TestSummary): TestStages {
  const todo = todoOf(test);
  const waits = (name: StageName) => (todo?.stage === name ? todo.short : null);
  const evaluated = test.status === 'evaluating' || test.status === 'done';
  const done = test.status === 'done';
  const { testFile, baremFile, print } = test.prepared;
  const baremActive = baremFile && !test.barem.unchecked && test.barem.request !== 'requested';

  const stage = (name: StageName, state: StageState, note = ''): Stage => ({ name, state, note });

  const pregatire = (): Stage => {
    const wait = waits('Pregătire');
    if (wait !== null) return stage('Pregătire', 'wait', wait);
    if (evaluated || (testFile && baremActive)) return stage('Pregătire', 'done');
    if (!testFile) return stage('Pregătire', 'now', 'lipsește testul');
    if (test.barem.request === 'requested') return stage('Pregătire', 'now', 'baremul se generează');
    return stage('Pregătire', 'now', 'lipsește baremul');
  };

  const tiparire = (): Stage => {
    if (test.status !== 'draft' || print === 'ready') return stage('Tipărire', 'done');
    if (!testFile) return stage('Tipărire', 'later');
    return print === 'failed' ? stage('Tipărire', 'now', 'nu s-a putut pregăti') : stage('Tipărire', 'now', 'se pregătește');
  };

  const clasa = (): Stage => {
    if (test.status === 'draft') return stage('În clasă', 'later', 'testul nu a început');
    if (test.status === 'open') return stage('În clasă', 'now', 'elevii trimit lucrările');
    return stage('În clasă', 'done');
  };

  const corectare = (): Stage => {
    if (test.status === 'evaluating') return stage('Corectare', 'now', `${test.gradedCount} din ${test.submittedCount} corectate`);
    return done ? stage('Corectare', 'done') : stage('Corectare', 'later');
  };

  const verificare = (): Stage => {
    const wait = waits('Verificare');
    if (wait !== null) return stage('Verificare', 'wait', wait);
    if (done && test.flagCount === 0) return stage('Verificare', 'done');
    // An archived test has no "De făcut", but its points still wait.
    if (test.flagCount > 0) return stage('Verificare', 'now', countLabel(test.flagCount, 'punct nesigur', 'puncte nesigure'));
    return stage('Verificare', 'later');
  };

  const rezultate = (): Stage => {
    const wait = waits('Rezultate');
    if (wait !== null) return stage('Rezultate', 'wait', wait);
    const published = test.resultsOpen || (test.gradedCount > 0 && test.publishedCount >= test.gradedCount);
    if (done && published) {
      const average = test.averageGrade === null ? '' : ` · media testului ${formatPoints(test.averageGrade)}`;
      return stage('Rezultate', 'done', `publicate${average}`);
    }
    if (done && test.gradedCount === 0) return stage('Rezultate', 'later', 'nicio lucrare corectată');
    return stage('Rezultate', 'later');
  };

  const stages = [pregatire(), tiparire(), clasa(), corectare(), verificare(), rezultate()];
  const current =
    stages.find((item) => item.state === 'wait') ??
    stages.find((item) => item.state === 'now') ??
    stages.find((item) => item.state === 'later') ??
    stages[5]!;
  return { stages, current };
}

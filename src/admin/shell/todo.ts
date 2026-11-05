import type { TestSummary } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';

export type TodoStage = 'Pregătire' | 'Verificare' | 'Rezultate';

// One thing that waits on the teacher, and the test it is in.
export interface TodoItem {
  code: string;
  testTitle: string;
  className: string;
  stage: TodoStage;
  task: string;
  text: string;
  action: string;
  // What waits, in a few words, after the stage ("Rezultate · nepublicate").
  short: string;
}

// What a test waits for from the teacher, if anything (redesign spec §5):
// exactly three cases, checked in this order. The first has two forms: the
// generated barem waits to be checked, or its new generation failed (it can
// be neither confirmed nor used until the teacher asks for it again).
export function todoOf(test: TestSummary): TodoItem | null {
  if (test.archived) return null;
  const item = { code: test.code, testTitle: test.title, className: test.className };
  const preparing = (test.status === 'draft' || test.status === 'open') && test.barem.unchecked;
  if (preparing && test.barem.request === 'none') {
    return {
      ...item,
      stage: 'Pregătire',
      task: 'Verifică baremul generat',
      text: 'Până îl confirmi, baremul nu se folosește la corectare.',
      action: 'Deschide',
      short: 'baremul de verificat',
    };
  }
  if (preparing && test.barem.request === 'failed') {
    return {
      ...item,
      stage: 'Pregătire',
      task: 'Generează din nou baremul',
      text: 'Baremul nu s-a putut genera din nou. Fără el, testul nu se poate corecta.',
      action: 'Deschide',
      short: 'baremul nu s-a generat',
    };
  }
  if (test.flagCount > 0) {
    return {
      ...item,
      stage: 'Verificare',
      task: `Decide ${countLabel(test.flagCount, 'punct nesigur', 'puncte nesigure')}`,
      text: `${countLabel(test.gradedCount, 'lucrare corectată', 'lucrări corectate')}. Punctele nesigure te așteaptă pe tine.`,
      action: 'Începe',
      short: countLabel(test.flagCount, 'punct nesigur', 'puncte nesigure'),
    };
  }
  if (test.status === 'done' && test.gradedCount > 0 && !test.resultsOpen && test.publishedCount < test.gradedCount) {
    return {
      ...item,
      stage: 'Rezultate',
      task: 'Publică rezultatele',
      text: `${countLabel(test.gradedCount, 'lucrare verificată', 'lucrări verificate')}. Fiecare elev primește linkul lui după ce publici.`,
      action: 'Deschide',
      short: 'nepublicate',
    };
  }
  return null;
}

const STAGE_ORDER: TodoStage[] = ['Pregătire', 'Verificare', 'Rezultate'];

// "De făcut" for a list of tests: by stage, in the order of the list
// (newest first) within a stage.
export function todoList(tests: TestSummary[]): TodoItem[] {
  const items = tests.map(todoOf).filter((item): item is TodoItem => item !== null);
  return items.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
}

import type { TestSummary } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import { missingNames, missingNote, missingOf } from '../missing.ts';
import { reviewPath } from '../reviewPage/points.ts';

// The task of a test that misses a part (missingOf).
export const MISSING_TASK = 'Adaugă ce lipsește';

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

// Where the button of a thing to do goes: the review for the points to check
// (redesign spec §7), the test page for the rest.
export function todoPath(item: TodoItem): string {
  return item.stage === 'Verificare' ? reviewPath(item.code) : `/teste/${item.code}`;
}

// What a test waits for from the teacher, if anything (redesign spec §5, and
// the CES switch spec): four cases, checked in this order. The first has two forms: the
// generated barem waits to be checked, or its new generation failed (it can
// be neither confirmed nor used until the teacher asks for it again). The
// generated CES barem of the CES variant counts the same way, after the
// class barem, also while the test is in evaluation (its CES papers wait); so
// does a missing CES barem that CES papers wait for. Then what a draft or open
// test still misses (missingOf): its files, and the CES ones.
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
  const ces = test.status !== 'done' && test.cesBarem !== null && test.cesBarem.unchecked ? test.cesBarem : null;
  if (ces && ces.request === 'none') {
    return {
      ...item,
      stage: 'Pregătire',
      task: 'Verifică baremul CES generat',
      text: 'Până îl confirmi, lucrările CES nu se corectează.',
      action: 'Deschide',
      short: 'baremul CES de verificat',
    };
  }
  if (ces && ces.request === 'failed') {
    return {
      ...item,
      stage: 'Pregătire',
      task: 'Generează din nou baremul CES',
      text: 'Baremul CES nu s-a putut genera din nou. Fără el, lucrările CES nu se corectează.',
      action: 'Deschide',
      short: 'baremul CES nu s-a generat',
    };
  }
  if (test.status === 'evaluating' && test.cesBarem?.missing) {
    return {
      ...item,
      stage: 'Pregătire',
      task: 'Încarcă baremul CES',
      text: 'Lucrările CES așteaptă baremul CES. Celelalte lucrări se corectează între timp.',
      action: 'Deschide',
      short: 'baremul CES lipsește',
    };
  }
  const missing = missingOf(test);
  if (missing.length > 0) {
    return {
      ...item,
      stage: 'Pregătire',
      task: MISSING_TASK,
      text: `${missing.length === 1 ? 'Lipsește' : 'Lipsesc'}: ${missingNames(missing)}.`,
      action: 'Deschide',
      short: missingNote(missing),
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
      // Published one by one for some students: say for how many.
      short: test.publishedCount > 0 ? `publicate pentru ${countLabel(test.publishedCount, 'elev', 'elevi')}` : 'nepublicate',
    };
  }
  return null;
}

// A test still in work (redesign spec §4, §5): not archived, and not done,
// or done with a thing in "De făcut". The panel "Clasele tale" and the Teste
// page count it the same way.
export function inWork(test: TestSummary): boolean {
  return !test.archived && (test.status !== 'done' || todoOf(test) !== null);
}

const STAGE_ORDER: TodoStage[] = ['Pregătire', 'Verificare', 'Rezultate'];

// "De făcut" for a list of tests: by stage, in the order of the list
// (newest first) within a stage.
export function todoList(tests: TestSummary[]): TodoItem[] {
  const items = tests.map(todoOf).filter((item): item is TodoItem => item !== null);
  return items.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
}

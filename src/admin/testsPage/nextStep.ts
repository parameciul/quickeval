import type { TestSummary } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import { missingName, missingOf } from '../missing.ts';
import { MISSING_TASK, todoOf } from '../shell/todo.ts';
import { reviewPath } from '../reviewPage/points.ts';
import { stageHash, type Stage } from '../stages.ts';
import { t } from '../../i18n/t.ts';

// The one thing to do next on a row of the Teste page (redesign spec §5): a
// link (to the review for the points to check), or the button that publishes
// the results on the row. Null: nothing
// to do now. The grading of an open test starts in the panel Corectare of the
// test page, while the page opens on În clasă (spec §6).
export type NextStep = { kind: 'link'; label: string; to: string } | { kind: 'publish'; label: string } | null;

export function nextStep(test: TestSummary, current: Stage): NextStep {
  const page = `/tests/${test.code}`;
  const link = (label: string, to = page): NextStep => ({ kind: 'link', label, to });
  switch (current.name) {
    case 'Pregătire': {
      // What "De făcut" asks: a part the test misses, the first one first.
      const missing = missingOf(test);
      if (current.state === 'wait' && todoOf(test)?.task === MISSING_TASK) return link(t('Încarcă {missingName}', { missingName: missingName(missing[0]!) }));
      if (current.state === 'wait') return link(test.barem.request === 'failed' ? t('Generează din nou baremul') : t('Verifică baremul'));
      if (!test.prepared.testFile) return link(t('Încarcă testul'));
      return test.barem.request === 'requested' ? null : link(t('Încarcă baremul'));
    }
    case 'Tipărire':
      return test.prepared.print === 'failed' || !test.prepared.uploadLink ? link(t('Deschide')) : null;
    case 'În clasă':
      if (test.status === 'draft') return link(t('Începe testul'));
      return test.evaluationAt === null ? link(t('Pornește corectarea'), `${page}${stageHash('Corectare')}`) : null;
    case 'Corectare':
      return null;
    case 'Verificare':
      return link(t('Verifică {countLabel}', { countLabel: countLabel(test.flagCount, 'punct', 'puncte') }), reviewPath(test.code));
    case 'Rezultate':
      // An archived test waits only for its open results to close.
      if (current.state === 'wait' && test.archived) return link(t('Oprește accesul'), `${page}${stageHash('Rezultate')}`);
      if (current.state === 'wait') return { kind: 'publish', label: test.publishedCount > 0 ? t('Publică pentru toți') : t('Publică rezultatele') };
      return current.state === 'done' && test.gradedCount > 0 ? link(t('Raportul clasei'), `${page}/report`) : null;
  }
}

import type { TestSummary } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import type { Stage } from '../stages.ts';

// The one thing to do next on a row of the Teste page (redesign spec §5): a
// link, or the button that publishes the results on the row. Null: nothing
// to do now.
export type NextStep = { kind: 'link'; label: string; to: string } | { kind: 'publish'; label: string } | null;

export function nextStep(test: TestSummary, current: Stage): NextStep {
  const page = `/teste/${test.code}`;
  const link = (label: string, to = page): NextStep => ({ kind: 'link', label, to });
  switch (current.name) {
    case 'Pregătire':
      if (current.state === 'wait') return link(test.barem.request === 'failed' ? 'Generează din nou baremul' : 'Verifică baremul');
      if (!test.prepared.testFile) return link('Încarcă testul');
      return test.barem.request === 'requested' ? null : link('Încarcă baremul');
    case 'Tipărire':
      return test.prepared.print === 'failed' || !test.prepared.uploadLink ? link('Deschide') : null;
    case 'În clasă':
      if (test.status === 'draft') return link('Începe testul');
      return test.evaluationAt === null ? link('Pornește corectarea') : null;
    case 'Corectare':
      return null;
    case 'Verificare':
      return link(`Verifică ${countLabel(test.flagCount, 'punct', 'puncte')}`);
    case 'Rezultate':
      if (current.state === 'wait') return { kind: 'publish', label: test.publishedCount > 0 ? 'Publică pentru toți' : 'Publică rezultatele' };
      return current.state === 'done' && test.gradedCount > 0 ? link('Raportul clasei', `${page}/raport`) : null;
  }
}

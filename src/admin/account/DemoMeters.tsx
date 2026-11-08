import { demoPapersLeft, DEMO_PAPER_LIMIT } from '../../../shared/accounts.ts';
import type { Teacher } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';

// What a demo account has used: its one test, and its papers. A paper on its
// way to the robot counts as used. `testsEvaluated` counts every start, regrade
// and retry, so the one test is used once it is 1 or more.
export type DemoUsage = { testUsed: boolean; papersUsed: number; papersLeft: number };

export function demoUsage(teacher: Teacher): DemoUsage {
  const sent = teacher.papersGraded + teacher.papersWaiting;
  return { testUsed: teacher.testsEvaluated > 0, papersUsed: Math.min(sent, DEMO_PAPER_LIMIT), papersLeft: demoPapersLeft(sent) };
}

// The line under the meters (redesign spec §11.5).
export function demoLine(usage: DemoUsage): string {
  if (usage.papersLeft === 0) {
    return `Ai folosit toate cele ${countLabel(DEMO_PAPER_LIMIT, 'lucrare', 'lucrări')} ale contului demo. Cere unui administrator un cont complet.`;
  }
  return `Mai ai ${countLabel(usage.papersLeft, 'lucrare', 'lucrări')}, pentru testul tău. Fiecare lucrare corectată se numără, și o recorectare.`;
}

// "Teste corectate 1 din 1" and "Lucrări corectate 20 din 35", each with its
// bar; the papers' bar is orange when none are left. Contul meu and the demo
// button of the top bar show them.
export function DemoMeters({ usage }: { usage: DemoUsage }) {
  return (
    <div className="demo-meters">
      <Meter label="Teste corectate" used={usage.testUsed ? 1 : 0} of={1} />
      <Meter label="Lucrări corectate" used={usage.papersUsed} of={DEMO_PAPER_LIMIT} full={usage.papersLeft === 0} />
    </div>
  );
}

function Meter({ label, used, of, full = false }: { label: string; used: number; of: number; full?: boolean }) {
  return (
    <div className={full ? 'demo-meter is-full' : 'demo-meter'}>
      <div className="demo-meter-line">
        <span>{label}</span>
        <b>
          {used} din {of}
        </b>
      </div>
      <div className="demo-meter-bar" aria-hidden="true">
        <span style={{ width: `${(used / of) * 100}%` }}></span>
      </div>
    </div>
  );
}

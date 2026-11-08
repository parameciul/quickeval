import { Link } from 'react-router';
import { DEMO_PAPER_LIMIT } from '../../../shared/accounts.ts';
import type { Teacher } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import { DemoMeters, demoLine, demoUsage, type DemoUsage } from '../account/DemoMeters.tsx';
import { useSmallMenu } from './useSmallMenu.ts';

// "Demo · 15 lucrări rămase".
export function demoButtonText(usage: DemoUsage): string {
  return `Demo · ${countLabel(usage.papersLeft, 'lucrare rămasă', 'lucrări rămase')}`;
}

// The demo account's button in the top bar (redesign spec §11.6): a small
// ring of the papers used and what is left. It opens "Cont demo": the two
// meters of Contul meu, one line, and "Contul meu". With no paper left the
// ring is orange and the line asks for a complete account.
export function DemoButton({ teacher }: { teacher: Teacher }) {
  const { open, toggle, box, button } = useSmallMenu();
  const usage = demoUsage(teacher);
  const full = usage.papersLeft === 0;

  return (
    <div className="demo" ref={box}>
      <button
        ref={button}
        type="button"
        className={full ? 'demo-button is-full' : 'demo-button'}
        aria-expanded={open}
        aria-controls={open ? 'demo-menu' : undefined}
        onClick={toggle}
      >
        <DemoRing used={usage.papersUsed} />
        {demoButtonText(usage)}
      </button>
      {open && (
        <section className="demo-menu" id="demo-menu" aria-label="Cont demo">
          <DemoSummary usage={usage} />
          <Link to="/cont">Contul meu</Link>
        </section>
      )}
    </div>
  );
}

// "Cont demo", the meters and the line: the demo button's menu, and ☰ on a
// phone.
export function DemoSummary({ usage }: { usage: DemoUsage }) {
  return (
    <>
      <p className="demo-title">Cont demo</p>
      <DemoMeters usage={usage} />
      <p className={usage.papersLeft === 0 ? 'demo-line' : 'demo-line is-muted'}>{demoLine(usage)}</p>
    </>
  );
}

// The circle of the papers used, out of the demo limit.
function DemoRing({ used }: { used: number }) {
  const round = 2 * Math.PI * 7.5;
  return (
    <svg className="demo-ring" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="7.5" fill="none" strokeWidth="3" />
      <circle
        cx="10"
        cy="10"
        r="7.5"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${((used / DEMO_PAPER_LIMIT) * round).toFixed(1)} ${round.toFixed(1)}`}
        transform="rotate(-90 10 10)"
      />
    </svg>
  );
}

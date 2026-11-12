import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router';

// One stage of a test, as the landing page (index.html) writes it, word for
// word: a test checks that the two stay the same.
export type Stage = {
  name: string;
  who: 'Tu' | 'Elevii' | 'MQGrader';
  // The sentence's bold start, when it has one.
  lead?: string;
  text: string;
  icon: ReactNode;
};

// The landing page's statement and the line under it, word for word: a test
// (WayIn.test.tsx) checks that the two stay the same. On the landing page the
// statement is the eyebrow above the heading; the heading itself names what
// the product is, for the people and the machines that arrive from a search.
export const PITCH_HEADING = 'Weekendul tău, fără teancul de lucrări.';
export const PITCH_LINE = 'MQGrader este o platformă web pentru profesorii din România. Elevii trimit pozele lucrărilor de pe telefon. Fiecare lucrare primește punctaj conform baremului.';
export const STAGES_TITLE = 'Un test, în șase etape';

export const STAGES: Stage[] = [
  {
    name: 'Pregătire',
    who: 'Tu',
    text: 'Încarci testul și baremul. Nu ai barem? Primești o propunere pe care o verifici tu.',
    icon: (
      <>
        <path d="M5 2.75h7l3 3v11.5H5z" />
        <path d="M8 9h4.5M8 12h4.5" />
      </>
    ),
  },
  {
    name: 'Tipărire',
    who: 'Tu',
    text: 'Tipărești testul. Fiecare pagină are un cod QR.',
    icon: (
      <>
        <path d="M5.5 7V2.75h9V7M5.5 14H3.5V7h13v7h-2" />
        <path d="M5.5 11.5h9v5.75h-9z" />
      </>
    ),
  },
  {
    name: 'În clasă',
    who: 'Elevii',
    text: 'Elevii scanează codul și trimit pozele lucrării. Fără cont și fără aplicație.',
    icon: (
      <>
        <rect x="5.5" y="2.5" width="9" height="15" rx="2" />
        <path d="M9 14.5h2" />
      </>
    ),
  },
  {
    name: 'Corectare',
    who: 'MQGrader',
    text: 'Fiecare lucrare primește punctaj conform baremului, pas cu pas, cu 10 puncte din oficiu.',
    icon: <path d="M4 10.5l3.5 3.5L16 5.5" />,
  },
  {
    name: 'Verificare',
    who: 'Tu',
    text: 'Punctele nesigure te așteaptă pe tine. Accepți sau schimbi punctajul.',
    icon: (
      <>
        <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" />
        <circle cx="10" cy="10" r="2.5" />
      </>
    ),
  },
  {
    name: 'Rezultate',
    who: 'Tu',
    text: 'Fiecare elev primește un link cu rezultatul lui: nota, punctele pe fiecare exercițiu, explicații detaliate pentru fiecare problemă rezolvată corect sau greșit și o sinteză finală cu ce merge bine și recomandări. Raportul clasei, un PDF pentru fiecare elev și CSV pentru catalog.',
    icon: (
      <>
        <path d="M8.5 11.5l3-3" />
        <path d="M9.5 6.5l1.25-1.25a3 3 0 0 1 4.25 4.25L13.75 10.75M10.5 13.5l-1.25 1.25a3 3 0 0 1-4.25-4.25L6.25 9.25" />
      </>
    ),
  },
];

// The way in (redesign spec §11.4): two halves under the top bar, the form
// on the left and, on the right, what MQGrader does, as the landing page says
// it. On a phone the form comes first. The login, the new account, the email
// confirmation and the new password all use it.
export function WayIn({ children }: { children: ReactNode }) {
  const mine = STAGES.filter((stage) => stage.who === 'Tu').length;
  return (
    <div className="way-in">
      <section className="way-in-form" aria-label="Contul tău">
        <div className="way-in-inner">{children}</div>
        <p className="way-in-foot">Elevii nu au nevoie de cont: trimit lucrarea de pe linkul testului.</p>
      </section>
      <section className="way-in-pitch" aria-labelledby="way-in-pitch">
        <div className="way-in-inner">
          <h2 id="way-in-pitch">{PITCH_HEADING}</h2>
          <p className="way-in-line">{PITCH_LINE}</p>
          <div className="way-in-flow">
            <p className="way-in-flow-title">{STAGES_TITLE}</p>
            <ol>
              {STAGES.map((stage) => (
                <li key={stage.name} className={stage.who === 'Tu' ? 'is-you' : undefined}>
                  <span className="way-in-node">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true" focusable="false">
                      {stage.icon}
                    </svg>
                  </span>
                  <div>
                    <h3>
                      {stage.name} <span className="way-in-who">{stage.who}</span>
                    </h3>
                    <p>
                      {stage.lead !== undefined && (
                        <>
                          <b>{stage.lead}</b>{' '}
                        </>
                      )}
                      {stage.text}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <p className="way-in-legend">
            <span className="way-in-dot is-you" aria-hidden="true"></span>
            Tu faci {mine} din {STAGES.length} etape, câteva minute fiecare.{' '}
            <span className="way-in-dot" aria-hidden="true"></span>
            Restul se fac singure.
          </p>
        </div>
      </section>
    </div>
  );
}

// The icon over a state with no form: an email sent (blue), a thing done
// (green), an account that waits (orange).
export function StateIcon({ kind }: { kind: 'mail' | 'done' | 'wait' }) {
  return (
    <span className={`way-in-icon is-${kind}`} aria-hidden="true">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" focusable="false">
        {kind === 'mail' ? (
          <>
            <rect x="2.75" y="4.5" width="14.5" height="11" rx="1.5" />
            <path d="m3.5 5.5 6.5 5.25 6.5-5.25" />
          </>
        ) : kind === 'done' ? (
          <path d="m4.5 10.5 3.5 3.5 7.5-8" strokeWidth={2} />
        ) : (
          <>
            <circle cx="10" cy="10" r="7" />
            <path d="M10 6v4l2.5 2" />
          </>
        )}
      </svg>
    </span>
  );
}

// The heading of the left half's state: it takes the focus when `state`
// changes (a form sent, a link followed), never when the page opens. The
// last state is kept, so a second run of the effect for the same state does
// nothing.
export function useStateHeading(state: string) {
  const heading = useRef<HTMLHeadingElement>(null);
  const last = useRef(state);
  useEffect(() => {
    if (last.current === state) return;
    last.current = state;
    heading.current?.focus();
  }, [state]);
  return heading;
}

// One state of the left half: its icon, its heading and the line under it.
export function State({
  heading,
  icon,
  title,
  lead,
  children,
}: {
  heading?: RefObject<HTMLHeadingElement | null>;
  icon?: 'mail' | 'done' | 'wait';
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <>
      {icon && <StateIcon kind={icon} />}
      <h1 ref={heading} tabIndex={-1}>
        {title}
      </h1>
      {lead && <p className="way-in-lead">{lead}</p>}
      {children}
    </>
  );
}

// The pages a link from an email opens go back to the login with this.
export function BackHome() {
  return (
    <p className="way-in-alt">
      <Link to="/">Înapoi la pagina de intrare</Link>
    </p>
  );
}

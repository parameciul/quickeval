import { useMutation } from '@tanstack/react-query';
import { useId, type ReactNode } from 'react';
import type { TestInfo } from '../../../shared/api.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { missingName, missingOf } from '../missing.ts';
import type { StageName } from '../stages.ts';
import { MoveOnLink } from './MoveOnLink.tsx';

// The "Acum" box at the top of every stage's panel: what is true now (the
// title, with a green tick when the stage is done), the actions of the stage
// (children), and what comes after it ("Urmează"). `band` is a switch across
// its top: the uploads of an open test, or the results.
export function NowBox({
  band,
  label = 'Acum',
  title,
  done = false,
  next,
  children,
}: {
  band?: ReactNode;
  label?: string;
  title: string;
  done?: boolean;
  next?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={band ? 'now-box has-band' : 'now-box'}>
      {band}
      <p className="now-label">{label}</p>
      <p className={done ? 'now-title is-done' : 'now-title'}>
        {done && (
          <span className="now-tick" aria-hidden="true">
            <ActionIcon name="check" />
          </span>
        )}
        {title}
      </p>
      {children}
      {next && (
        <p className="now-next">
          <strong>Urmează</strong> <span>{next}</span>
        </p>
      )}
    </div>
  );
}

// One thing a stage needs, in the list of a stage that has not started: the
// stage list's own dots (blue done, orange waits on the teacher, grey later),
// what it is, its state, and a link to the stage where it is done.
export interface ReadyRow {
  state: 'done' | 'wait' | 'later';
  what: string;
  value: string;
  stage?: StageName;
}

const READY_WORDS: Record<ReadyRow['state'], string> = { done: 'gata', wait: 'te așteaptă', later: 'urmează' };

export function ReadyList({ rows }: { rows: ReadyRow[] }) {
  return (
    <ul className="ready-list" aria-label="Ce așteaptă etapa">
      {rows.map((row) => (
        <li key={row.what} className={`is-${row.state}`}>
          <span className="ready-dot" aria-hidden="true">
            <ActionIcon name={row.state === 'done' ? 'check' : row.state === 'wait' ? 'dot' : 'clock'} />
          </span>
          <span className="ready-what">
            <strong>{row.what}</strong> <span className="sr-only">{READY_WORDS[row.state]}:</span> <span>{row.value}</span>
          </span>
          {row.stage && (
            <MoveOnLink stage={row.stage} className="ready-go">
              Mergi la {row.stage}
            </MoveOnLink>
          )}
        </li>
      ))}
    </ul>
  );
}

// The barem as a row of that list: gata, lipsește, de verificat, se generează.
export function baremRow(test: TestInfo): ReadyRow {
  if (test.files.barem !== null && !test.barem.unchecked) return { state: 'done', what: 'Baremul', value: 'gata' };
  if (test.barem.request === 'requested') return { state: 'later', what: 'Baremul', value: 'se generează', stage: 'Pregătire' };
  return { state: 'wait', what: 'Baremul', value: test.files.barem !== null ? 'de verificat' : 'lipsește', stage: 'Pregătire' };
}

// The test file as a row of that list.
export function testFileRow(test: TestInfo): ReadyRow {
  return test.files.test !== null
    ? { state: 'done', what: 'Testul', value: 'încărcat' }
    : { state: 'wait', what: 'Testul', value: 'lipsește', stage: 'Pregătire' };
}

// The CES test and barem that a draft or open test still misses (missingOf),
// as rows of that list: the class files have their own rows.
export function cesRows(test: TestInfo): ReadyRow[] {
  return missingOf(test)
    .filter((part) => part === 'cesTest' || part === 'cesBarem')
    .map((part) => {
      const name = missingName(part);
      return { state: 'wait', what: name.charAt(0).toUpperCase() + name.slice(1), value: 'lipsește', stage: 'Pregătire' };
    });
}

// A section of a panel under the "Acum" box: its title, a count or a hint
// after it, and its content. Every section of every stage looks the same.
export function StageSection({ title, meta, children }: { title: ReactNode; meta?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section className="stage-section" aria-labelledby={id}>
      <div className="stage-section-head">
        <h3 id={id}>{title}</h3>
        {meta && <span className="stage-section-meta">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

// A band across the top of the "Acum" box with a switch (design Y3): green
// while it is on (students can upload, or read their results), orange while it
// is off. aria-disabled, not disabled, while it saves: a disabled button would
// drop the keyboard's focus. The switch's name holds the word it shows.
export function SwitchBand({
  on,
  text,
  name,
  onWord,
  offWord,
  pending,
  onToggle,
}: {
  on: boolean;
  text: ReactNode;
  name: string;
  onWord: string;
  offWord: string;
  pending: boolean;
  onToggle: () => void;
}) {
  const textId = useId();
  return (
    <div className={on ? 'uploads-band is-open' : 'uploads-band is-shut'}>
      <span className="uploads-band-dot" aria-hidden="true" />
      <p id={textId}>{text}</p>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={textId}
        aria-disabled={pending}
        className="uploads-toggle"
        onClick={() => {
          if (!pending) onToggle();
        }}
      >
        <span className="uploads-toggle-track" aria-hidden="true">
          <span className="uploads-toggle-knob" />
        </span>
        <span className="sr-only">{name}: </span>
        {on ? onWord : offWord}
      </button>
    </div>
  );
}

// The uploads of an open test as a switch: open while the students may upload,
// closed once the teacher closed them without starting the grading ("Închide
// încărcarea", at the end of the hour). On Corectare the open band says that
// starting the grading closes them too.
export function UploadsBand({ test, onChanged, grading = false }: { test: TestInfo; onChanged: () => Promise<void>; grading?: boolean }) {
  const api = useApi();
  // While it saves, the switch already shows the state asked for: the answer
  // and the test read again after it take a moment.
  const toggle = useMutation({
    mutationFn: (close: boolean) => api.setUploadsClosed(test.code, close),
    onSuccess: onChanged,
  });
  const closed = toggle.isPending ? toggle.variables : test.uploadsClosedAt !== null;
  return (
    <>
      <SwitchBand
        on={!closed}
        name="Încărcarea lucrărilor"
        onWord="Deschisă"
        offWord="Închisă"
        pending={toggle.isPending}
        onToggle={() => toggle.mutate(!closed)}
        text={
          closed ? (
            <>
              <strong>Încărcarea e închisă.</strong> Elevii nu pot trimite. O redeschizi oricând.
            </>
          ) : (
            <>
              <strong>Încărcarea e deschisă.</strong> Elevii pot trimite lucrările.
              {grading && ' Când pornești corectarea, se închide singură.'}
            </>
          )
        }
      />
      {toggle.error && <ErrorMessage error={toggle.error} />}
    </>
  );
}

import { useIsMutating, useMutation, useMutationState } from '@tanstack/react-query';
import { useId, useMemo, type ReactNode } from 'react';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { missingName, missingOf } from '../missing.ts';
import { cesBaremActive } from './variant.ts';
import type { StageName } from '../stages.ts';
import { MoveOnLink } from './MoveOnLink.tsx';
import { t } from '../../i18n/t.ts';

// The "Acum" box at the top of every stage's panel: what is true now (the
// title, with a green tick when the stage is done), the actions of the stage
// (children), and what comes after it ("Urmează"). `band` is a switch across
// its top: the uploads of an open test, or the results.
export function NowBox({
  band,
  label = t('Acum'),
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
          <strong>{t('Urmează')}</strong> <span>{next}</span>
        </p>
      )}
    </div>
  );
}

// One thing a stage needs, in the list of a stage that has not started: the
// stage list's own dots (blue tick done, orange waits on the teacher, filled
// blue in progress, grey later), what it is, its state, and a link to the
// stage where it is done.
export interface ReadyRow {
  state: 'done' | 'wait' | 'now' | 'later';
  what: string;
  value: string;
  stage?: StageName;
}

const READY_WORDS: Record<ReadyRow['state'], string> = { done: t('gata'), wait: t('te așteaptă'), now: t('în lucru'), later: t('urmează') };
const READY_ICONS = { done: 'check', wait: 'dot', now: 'edit', later: 'clock' } as const;

export function ReadyList({ rows }: { rows: ReadyRow[] }) {
  return (
    <ul className="ready-list" aria-label={t('Ce așteaptă etapa')}>
      {rows.map((row) => (
        <li key={row.what} className={`is-${row.state}`}>
          <span className="ready-dot" aria-hidden="true">
            <ActionIcon name={READY_ICONS[row.state]} />
          </span>
          <span className="ready-what">
            <strong>{row.what}</strong> <span className="sr-only">{READY_WORDS[row.state]}:</span> <span>{row.value}</span>
          </span>
          {/* Its name names the row too: a list may have several. */}
          {row.stage && (
            <MoveOnLink stage={row.stage} className="ready-go" label={t('Mergi la {stage}: {what}', { stage: t(row.stage), what: row.what })}>{t('Mergi la {stage}', { stage: t(row.stage) })}
            </MoveOnLink>
          )}
        </li>
      ))}
    </ul>
  );
}

// The barem as a row of that list: gata, lipsește, de verificat, se generează.
export function baremRow(test: TestInfo): ReadyRow {
  if (test.files.barem !== null && !test.barem.unchecked) return { state: 'done', what: t('Baremul'), value: t('gata') };
  if (test.barem.request === 'requested') return { state: 'later', what: t('Baremul'), value: t('se generează'), stage: 'Pregătire' };
  return { state: 'wait', what: t('Baremul'), value: test.files.barem !== null ? t('de verificat') : t('lipsește'), stage: 'Pregătire' };
}

// The test file as a row of that list.
export function testFileRow(test: TestInfo): ReadyRow {
  return test.files.test !== null
    ? { state: 'done', what: t('Testul'), value: t('încărcat') }
    : { state: 'wait', what: t('Testul'), value: t('lipsește'), stage: 'Pregătire' };
}

// The CES test and barem that a draft or open test still misses (missingOf),
// and a generated CES barem that waits for its check, as rows of that list:
// the class files have their own rows.
export function cesRows(test: TestInfo): ReadyRow[] {
  const rows: ReadyRow[] = missingOf(test)
    .filter((part) => part === 'cesTest' || part === 'cesBarem')
    .map((part) => {
      const name = missingName(part);
      return { state: 'wait', what: name.charAt(0).toUpperCase() + name.slice(1), value: t('lipsește'), stage: 'Pregătire' };
    });
  if (cesWanted(test) && test.ces.files.barem !== null && test.ces.barem.unchecked) {
    rows.push({ state: 'wait', what: t('Baremul CES'), value: t('de verificat'), stage: 'Pregătire' });
  }
  return rows;
}

// The class has a CES student and the CES switch is on.
export function cesWanted(test: TestInfo): boolean {
  return test.ces.studentCount > 0 && !test.ces.off;
}

// Whether the test is still before its first grading: what it misses then is
// what missingOf names.
export function beforeGrading(test: TestInfo): boolean {
  return (test.status === 'draft' || test.status === 'open') && test.evaluationStartedAt === null;
}

// The CES files that are not ready. Before the first grading: the CES test, or
// a CES barem missing, unchecked or being made, while the CES switch is on.
// After it, only a CES barem that CES papers wait for: without a CES test, a
// CES student's paper is graded on the class's test, so nothing waits (the
// rule of "De făcut", `cesBarem.missing`).
export function cesNotReady(test: TestInfo): boolean {
  if (beforeGrading(test)) return cesWanted(test) && (test.ces.files.test === null || !cesBaremActive(test));
  return test.ces.files.test !== null && test.ces.waiting > 0 && !cesBaremActive(test);
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
  // and the test read again after it take a moment. The test page shows that
  // state everywhere meanwhile (`useShownDetail`).
  const toggle = useMutation({
    mutationKey: [UPLOADS_CLOSED, test.code],
    mutationFn: (close: boolean) => api.setUploadsClosed(test.code, close),
    onSuccess: onChanged,
  });
  const closed = toggle.isPending ? toggle.variables : test.uploadsClosedAt !== null;
  // A save started before the band was drawn again (the teacher left the
  // stage and came back) still counts: no second save starts meanwhile.
  const saving = useIsMutating({ mutationKey: [UPLOADS_CLOSED, test.code] }) > 0;
  return (
    <>
      <SwitchBand
        on={!closed}
        name={t('Încărcarea lucrărilor')}
        onWord={t('Deschisă')}
        offWord={t('Închisă')}
        pending={saving}
        onToggle={() => toggle.mutate(!closed)}
        text={
          closed ? (
            <>
              <strong>{t('Încărcarea e închisă.')}</strong>{' '}{t('Elevii nu pot trimite. O redeschizi oricând.')}
            </>
          ) : (
            <>
              <strong>{t('Încărcarea e deschisă.')}</strong>{' '}{t('Elevii pot trimite lucrările.')}
              {grading && ` ${t('Când pornești corectarea, se închide singură.')}`}
            </>
          )
        }
      />
      {toggle.error && <ErrorMessage error={toggle.error} />}
    </>
  );
}

// The keys of the two switches' saves. While one saves, the whole test page
// shows the state asked for, so the band, the tables and the stage list agree.
export const UPLOADS_CLOSED = 'uploads-closed';
export const RESULTS_OPEN = 'results-open';

// The test and its uploads as the page shows them: as read, or, while a
// switch saves, with the state it asked for. Publishing every result shows
// each sent paper as published; stopping them shows none.
export function useShownDetail(test: TestInfo, uploads: UploadRow[]): { test: TestInfo; uploads: UploadRow[] } {
  const closing = useMutationState({
    filters: { mutationKey: [UPLOADS_CLOSED, test.code], status: 'pending' },
    select: (mutation) => mutation.state.variables as boolean,
  }).at(-1);
  const opening = useMutationState({
    filters: { mutationKey: [RESULTS_OPEN, test.code], status: 'pending' },
    select: (mutation) => mutation.state.variables as boolean,
  }).at(-1);
  return useMemo(() => {
    if (closing === undefined && opening === undefined) return { test, uploads };
    const shown = { ...test };
    if (closing !== undefined) shown.uploadsClosedAt = closing ? (test.uploadsClosedAt ?? new Date().toISOString()) : null;
    if (opening === undefined) return { test: shown, uploads };
    shown.resultsOpen = opening;
    if (!opening) shown.publishedCount = 0;
    const rows = uploads.map((row) => {
      const published = opening ? row.resultsOpen || row.submissionId !== null : false;
      return published === row.resultsOpen ? row : { ...row, resultsOpen: published };
    });
    return { test: shown, uploads: rows };
  }, [test, uploads, closing, opening]);
}

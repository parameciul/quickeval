import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import type { TestSummary } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { classToneStyle } from '../../ui/classTone.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { stagesOf } from '../stages.ts';
import { GradeChip } from '../testPage/GradeChip.tsx';
import { startedLabel } from './greeting.ts';
import { nextStep } from './nextStep.ts';
import { ActionIcon, actionIconFor } from '../../ui/ActionIcon.tsx';
import { t } from '../../i18n/t.ts';

// "În lucru" or "Terminate" on the Teste page (redesign spec §5): the group's
// title and count over its card, then a table with the test, its stage, its
// papers and the next step. Only the first group shows the column names; the
// others keep them for screen readers, and every table shares the column
// widths, so the groups line up. `first` is the test of the first thing in
// "De făcut": its button is the filled one.
export function TestGroup({
  title,
  tests,
  first,
  focusCode,
  onPublished,
  columns = true,
  extra,
}: {
  title: string;
  tests: TestSummary[];
  first: string | null;
  // The test whose link takes the focus (after its row published and moved),
  // and how a row reports that it published.
  focusCode: string | null;
  onPublished: (code: string | null) => void;
  // Whether the column names show; what stands at the right of the title.
  columns?: boolean;
  extra?: ReactNode;
}) {
  const id = useId();
  const head = (text: string) => (columns ? text : <span className="sr-only">{text}</span>);
  return (
    <section className="test-group" aria-labelledby={id}>
      <div className="group-head">
        <div className="group-title">
          <h2 id={id}>{title}</h2>
          <span className="tag">{tests.length}</span>
        </div>
        {extra}
      </div>
      <div className="table-wrap test-group-card">
        <table className="tests" aria-labelledby={id}>
          <colgroup>
            <col className="col-test" />
            <col className="col-stage" />
            <col className="col-num" />
            <col />
          </colgroup>
          <thead className={columns ? undefined : 'quiet-head'}>
            <tr>
              <th scope="col">{head(t('Test'))}</th>
              <th scope="col">{head(t('Etapa'))}</th>
              <th scope="col" className="num">
                {head(t('Lucrări'))}
              </th>
              <th scope="col" className="next-col">
                {head(t('Următorul pas'))}
              </th>
            </tr>
          </thead>
          <tbody>
            {tests.map((test) => (
              <TestRow key={test.code} test={test} primary={test.code === first} focusCode={focusCode} onPublished={onPublished} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TestRow({
  test,
  primary,
  focusCode,
  onPublished,
}: {
  test: TestSummary;
  primary: boolean;
  focusCode: string | null;
  onPublished: (code: string | null) => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Publishing or stopping the results on the row (§1, decision 20). The row
  // waits for the list again: its buttons come from it.
  const results = useMutation({
    mutationFn: (open: boolean) => api.setResultsOpen(test.code, open),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tests'] }),
        queryClient.invalidateQueries({ queryKey: ['test', test.code] }),
      ]);
      onPublished(test.code);
    },
  });

  // The button that was pressed may be gone, or the row in another group:
  // the focus goes to the test's link, where the row now is.
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (focusCode !== test.code) return;
    link.current?.focus();
    onPublished(null);
  }, [focusCode, test.code, onPublished]);

  const { stages, current } = stagesOf(test);
  const step = nextStep(test, current);
  const className = displayClassName(test.className);
  const where = `${test.title}, ${className}`;
  const buttonClass = primary ? 'button button-small' : 'button-quiet button-small';
  // A click anywhere on the row opens the test, as its name does, but for a
  // click on a link or a button of the row, a click with a key held (the
  // browser's own ways to open a link elsewhere), and one that ends a selection
  // of the row's text. The name stays the link for the keyboard.
  const openRow = (event: MouseEvent<HTMLTableRowElement>) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if ((event.target as Element).closest('a, button, input, label')) return;
    if (window.getSelection()?.toString()) return;
    void navigate(`/tests/${test.code}`);
  };

  return (
    <tr className={test.archived ? 'is-muted' : undefined} onClick={openRow}>
      <th scope="row" className="test-name">
        <Link ref={link} to={`/tests/${test.code}`}>
          {test.title}
        </Link>
        {test.archived && ' '}
        {test.archived && <span className="tag">{t('Arhivat')}</span>}
        <span className="test-sub">
          <span className="class-dot" style={classToneStyle(test.classId)} aria-hidden="true" />
          {className} · {startedText(test)}
        </span>
      </th>
      <td>
        <div className="stage-mini">
          <span className="stage-bars" aria-hidden="true">
            {stages.map((stage) => (
              <i key={stage.name} className={`is-${stage.state}`} />
            ))}
          </span>
          <span className="stage-text">
            <b>{t(current.name)}</b>
            {current.average === undefined ? (
              current.note && ` · ${current.note}`
            ) : (
              <>
                {` · ${t('publicate')} · ${t('media testului')} `}
                <GradeChip grade={current.average} small />
              </>
            )}
          </span>
        </div>
      </td>
      <td className="num" data-label={t('Lucrări')}>
        {test.status === 'draft' ? '—' : t('{submittedCount} din {studentCount}', { submittedCount: test.submittedCount, studentCount: test.studentCount })}
      </td>
      <td className="next-col">
        <span className="row-actions">
          {step === null ? (
            <span className="waiting">{t('Nimic de făcut acum')}</span>
          ) : step.kind === 'link' ? (
            <Link className={buttonClass} to={step.to} aria-label={`${step.label}: ${where}`}>
              <ActionIcon name={actionIconFor(step.label)} />
              {step.label}
            </Link>
          ) : (
            <button
              type="button"
              className={buttonClass}
              disabled={results.isPending}
              aria-label={`${step.label}: ${where}`}
              onClick={() => results.mutate(true)}
            >
              <ActionIcon name={actionIconFor(step.label)} />
              {step.label}
            </button>
          )}
          {/* An archived test's next step is already the way to close them. */}
          {test.resultsOpen && !test.archived && (
            <button
              type="button"
              className="button-quiet button-small"
              disabled={results.isPending}
              aria-label={t('Oprește accesul: {where}', { where })}
              onClick={() => results.mutate(false)}
            >
              <ActionIcon name="eye-off" />
              {t('Oprește accesul')}
            </button>
          )}
        </span>
        {results.error && <ErrorMessage error={results.error} />}
      </td>
    </tr>
  );
}

// "ciornă" for a test not started; a stopped test keeps its start date but is
// a draft again.
export function startedText(test: TestSummary): string {
  if (test.status === 'draft') return t('ciornă');
  return test.startedAt ? t('început {startedLabel}', { startedLabel: startedLabel(test.startedAt, new Date()) }) : t('fără dată');
}

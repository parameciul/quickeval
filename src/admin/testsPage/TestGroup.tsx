import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { Link } from 'react-router';
import type { TestSummary } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { stagesOf } from '../stages.ts';
import { startedLabel } from './greeting.ts';
import { nextStep } from './nextStep.ts';

// "În lucru" or "Terminate" on the Teste page (redesign spec §5): a table
// with the test, its stage, its papers and the next step. `first` is the
// test of the first thing in "De făcut": its button is the filled one.
export function TestGroup({ title, tests, first }: { title: string; tests: TestSummary[]; first: string | null }) {
  const id = useId();
  return (
    <section className="test-group" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <div className="table-wrap">
        <table className="tests">
          <thead>
            <tr>
              <th scope="col">Test</th>
              <th scope="col">Etapa</th>
              <th scope="col" className="num">
                Lucrări
              </th>
              <th scope="col" className="next-col">
                Următorul pas
              </th>
            </tr>
          </thead>
          <tbody>
            {tests.map((test) => (
              <TestRow key={test.code} test={test} primary={test.code === first} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TestRow({ test, primary }: { test: TestSummary; primary: boolean }) {
  const api = useApi();
  const queryClient = useQueryClient();
  // Publishing or stopping the results on the row (§1, decision 20). The row
  // waits for the list again: its buttons come from it.
  const results = useMutation({
    mutationFn: (open: boolean) => api.setResultsOpen(test.code, open),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tests'] }),
        queryClient.invalidateQueries({ queryKey: ['test', test.code] }),
      ]);
    },
  });

  const { stages, current } = stagesOf(test);
  const step = nextStep(test, current);
  const className = displayClassName(test.className);
  const where = `${test.title}, ${className}`;
  const buttonClass = primary ? 'button button-small' : 'button-quiet button-small';

  return (
    <tr className={test.archived ? 'is-muted' : undefined}>
      <th scope="row" className="test-name">
        <Link to={`/teste/${test.code}`}>{test.title}</Link>
        {test.archived && <span className="tag">Arhivat</span>}
        <span className="test-sub">
          {className} · {test.startedAt ? `început ${startedLabel(test.startedAt, new Date())}` : 'ciornă'}
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
            <b>{current.name}</b>
            {current.note && ` · ${current.note}`}
          </span>
        </div>
      </td>
      <td className="num" data-label="Lucrări">
        {test.status === 'draft' ? '—' : `${test.submittedCount} din ${test.studentCount}`}
      </td>
      <td className="next-col">
        <span className="row-actions">
          {step === null ? (
            <span className="waiting">Nimic de făcut acum</span>
          ) : step.kind === 'link' ? (
            <Link className={buttonClass} to={step.to} aria-label={`${step.label}: ${where}`}>
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
              {step.label}
            </button>
          )}
          {test.resultsOpen && (
            <button
              type="button"
              className="button-quiet button-small"
              disabled={results.isPending}
              aria-label={`Oprește accesul: ${where}`}
              onClick={() => results.mutate(false)}
            >
              Oprește accesul
            </button>
          )}
        </span>
        {results.error && <ErrorMessage error={results.error} />}
      </td>
    </tr>
  );
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { TestSummary } from '../../../shared/api.ts';
import { formatDayMonth } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { stagesOf } from '../stages.ts';
import { nextStep } from '../testsPage/nextStep.ts';

// "Testele clasei", beside the grades table (redesign spec §9): the newest test
// first, each with its date, the papers sent, its stage and the one thing to do
// next. The archived tests show only when the teacher asks.
export function ClassTests({
  tests,
  showArchived,
  onShowArchived,
  onChanged,
}: {
  tests: TestSummary[];
  showArchived: boolean;
  onShowArchived: (show: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  // The next step of a finished test with results to publish is the button
  // here, as on the Teste page.
  const publish = useMutation({
    mutationFn: (code: string) => api.setResultsOpen(code, true),
    onSuccess: async () => {
      await Promise.all([onChanged(), queryClient.invalidateQueries({ queryKey: ['tests'] })]);
    },
  });

  const shown = tests.filter((test) => showArchived || !test.archived);
  const archivedCount = tests.filter((test) => test.archived).length;
  return (
    <aside className="class-tests" aria-labelledby="class-tests-title">
      <h2 id="class-tests-title">Testele clasei</h2>
      {shown.length === 0 ? (
        <p className="hint">Clasa nu are încă teste.</p>
      ) : (
        <ol className="class-test-list">
          {shown.map((test) => {
            const { current } = stagesOf(test);
            const step = nextStep(test, current);
            return (
              <li key={test.code} className={test.archived ? 'is-muted' : undefined}>
                <span className="class-test-head">
                  <Link to={`/teste/${test.code}`}>{test.title}</Link>
                  {test.archived && <span className="tag">Arhivat</span>}
                  <span className="class-test-date">{test.startedAt === null ? 'ciornă' : formatDayMonth(test.startedAt)}</span>
                </span>
                <span className="class-test-facts">
                  {test.status === 'draft' ? 'nepornit' : `${test.submittedCount} din ${test.studentCount} trimise`}
                  {' · '}
                  <b>{current.name}</b>
                  {current.note !== '' && ` · ${current.note}`}
                </span>
                {step !== null &&
                  (step.kind === 'link' ? (
                    <Link className="button-quiet button-small" to={step.to}>
                      {step.label}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="button-quiet button-small"
                      disabled={publish.isPending}
                      onClick={() => publish.mutate(test.code)}
                    >
                      {step.label}
                    </button>
                  ))}
              </li>
            );
          })}
        </ol>
      )}
      {archivedCount > 0 && (
        <button
          type="button"
          className="button-quiet button-small"
          aria-pressed={showArchived}
          onClick={() => onShowArchived(!showArchived)}
        >
          Arată și testele arhivate ({archivedCount})
        </button>
      )}
      {publish.error && <ErrorMessage error={publish.error} />}
    </aside>
  );
}

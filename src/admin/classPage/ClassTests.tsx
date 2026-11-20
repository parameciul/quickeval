import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { TestSummary } from '../../../shared/api.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { formatDayMonth } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { stagesOf } from '../stages.ts';
import { archivedPublished, todoOf } from '../shell/todo.ts';
import { nextStep, type NextStep } from '../testsPage/nextStep.ts';
import { ActionIcon, actionIconFor } from '../../ui/ActionIcon.tsx';
import { t } from '../../i18n/t.ts';

// "Testele clasei", beside the grades table (spec §9): the newest test first,
// each with its date, the papers sent, its stage (orange when it waits on the
// teacher) and the one thing to do next. The archived tests show only when the
// teacher asks, here and in the table. In an archived class (`readOnly`) the
// one step of a test is its report, once a paper is graded, and nothing waits;
// only an archived test with open results waits there too, as in "De făcut".
export function ClassTests({
  tests,
  schoolYear,
  readOnly = false,
  showArchived,
  onShowArchived,
  onChanged,
}: {
  tests: TestSummary[];
  schoolYear: number;
  readOnly?: boolean;
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
  const activeCount = tests.length - archivedCount;
  return (
    <aside className="class-card class-tests" aria-labelledby="class-tests-title">
      <div className="class-card-head">
        <h2 id="class-tests-title">{t('Testele clasei')}</h2>
        <span>
          {t('{activeCount} în {formatSchoolYear}', { activeCount, formatSchoolYear: formatSchoolYear(schoolYear) })}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="class-tests-empty hint">{t('Clasa nu are încă teste.')}</p>
      ) : (
        <ol className="class-test-list">
          {shown.map((test) => {
            const { current } = stagesOf(test);
            const live = !readOnly || archivedPublished(test);
            const step: NextStep = live
              ? nextStep(test, current)
              : test.gradedCount > 0
                ? { kind: 'link', label: t('Raportul clasei'), to: `/tests/${test.code}/report` }
                : null;
            const waits = live && todoOf(test) !== null;
            return (
              <li key={test.code} className={test.archived ? 'is-muted' : undefined}>
                <div className="class-test-text">
                  <Link className="class-test-title" to={`/tests/${test.code}`} title={test.title}>
                    {test.title}
                  </Link>
                  <span>
                    <span className="class-test-date">
                      {test.startedAt === null ? t('ciornă') : formatDayMonth(test.startedAt)}
                    </span>
                    {' · '}
                    {test.status === 'draft' ? t('nepornit') : t('{submittedCount} din {studentCount} trimise', { submittedCount: test.submittedCount, studentCount: test.studentCount })}
                    {test.archived && ` · ${t('arhivat')}`}
                  </span>
                  <span className={waits ? 'class-test-stage is-waiting' : 'class-test-stage'}>
                    {t(current.name)}
                    {current.note !== '' && ` · ${current.note}`}
                  </span>
                </div>
                {step !== null &&
                  (step.kind === 'link' ? (
                    <Link className={waits ? 'button button-small' : 'button-quiet button-small'} to={step.to}>
                      <ActionIcon name={actionIconFor(step.label)} />
                      {step.label}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={waits ? 'button button-small' : 'button-quiet button-small'}
                      disabled={publish.isPending}
                      onClick={() => publish.mutate(test.code)}
                    >
                      <ActionIcon name={actionIconFor(step.label)} />
                      {step.label}
                    </button>
                  ))}
              </li>
            );
          })}
        </ol>
      )}
      {publish.error && (
        <div className="class-tests-error">
          <ErrorMessage error={publish.error} />
        </div>
      )}
      {archivedCount > 0 && (
        <div className="class-card-foot class-card-foot-end">
          <button
            type="button"
            className="text-button"
            aria-pressed={showArchived}
            onClick={() => onShowArchived(!showArchived)}
          >{t('Arată și testele arhivate ({archivedCount})', { archivedCount })}</button>
        </div>
      )}
    </aside>
  );
}

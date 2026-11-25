import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { formatPoints } from '../../../shared/scoring.ts';
import { countLabel, studentCountLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { IconClasses } from './icons.tsx';
import { Panel } from './Panel.tsx';
import { classSummary } from './classSummary.ts';
import { classToneStyle } from '../../ui/classTone.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { t } from '../../i18n/t.ts';

// "Clasele tale" (redesign spec §4): the classes of the school year that are
// not archived, each as a few numbers, not a list of its tests: an orange tag
// with how many of its tests wait on the teacher ("2 lucruri te așteaptă"), or
// a grey "La zi", then one grey line: the students, the tests in work, the
// points to check (orange) and the average of its graded tests (`classSummary`).
// The class of the page is marked. Until the tests of the year arrive a class
// shows only its students (or the panel says why the tests could not be
// read), never "La zi". "Clasă nouă" is first, above the
// loading line, an error and the list, so it never moves when the classes
// arrive; with no class, its empty state holds the one "Clasă nouă".
// "Arhivate (n)" is at the foot, when there are any.
export function ClassesPanel({
  year,
  currentClassId,
  onClose,
}: {
  year: number;
  currentClassId: number | null;
  onClose(): void;
}) {
  const api = useApi();
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });
  const tests = useQuery({ queryKey: ['tests', year], queryFn: () => api.listTests(year) });
  const active = classes.data?.filter((item) => !item.archived) ?? [];
  const archived = classes.data?.filter((item) => item.archived).length ?? 0;

  const newClass = (
    <div className="panel-new">
      <Link className="button" to="/classes" state={{ newClass: true }}>
        <ActionIcon name="add" />
        {t('Clasă nouă')}
      </Link>
    </div>
  );

  const empty = !classes.error && classes.data !== undefined && active.length === 0;

  return (
    <Panel id="panel-clase" title={t('Clasele tale')} onClose={onClose}>
      {!empty && newClass}
      {classes.error ? (
        <div className="panel-body">
          <ErrorMessage error={classes.error} />
        </div>
      ) : !classes.data ? (
        <p className="panel-body hint">{t('Se încarcă…')}</p>
      ) : empty ? (
        <EmptyState
          icon={<IconClasses />}
          title={archived > 0 ? t('Nu ai nicio clasă activă') : t('Încă nu ai nicio clasă')}
          action={
            <Link className="button button-small" to="/classes" state={{ newClass: true }}>
              <ActionIcon name="add" />
              {t('Clasă nouă')}
            </Link>
          }
        >
          {t('Adaugă clasa cu numele elevilor, câte unul pe rând.')}
        </EmptyState>
      ) : (
        <>
          {!tests.data && tests.error ? (
            <div className="panel-body">
              <ErrorMessage error={tests.error} />
            </div>
          ) : null}
          <nav className="class-list">
            {active.map((item) => {
              const sums = tests.data ? classSummary(tests.data, item.id) : null;
              return (
                <Link
                  key={item.id}
                  className="class-item"
                  to={`/classes/${item.id}`}
                  aria-current={item.id === currentClassId ? 'page' : undefined}
                >
                  <span className="class-item-head">
                    <span className="class-item-name">
                      <span className="class-dot" style={classToneStyle(item.id)} aria-hidden="true" />
                      {item.name}
                    </span>
                    {sums &&
                      (sums.waits > 0 ? (
                        <span className="tag tag-wait">
                          {countLabel(sums.waits, 'lucru', 'lucruri')}{' '}{t('te așteaptă')}
                        </span>
                      ) : (
                        <span className="tag">{t('La zi')}</span>
                      ))}
                  </span>
                  {/* Each part stays whole with its "·", so the line breaks only
                      before a "·", never after one. A count of 0 is left out:
                      the tag already says whether something waits. */}
                  <span className="class-item-line">
                    <span>{studentCountLabel(item.studentCount)}</span>
                    {sums && sums.inWork > 0 && (
                      <>
                        {' '}
                        <span>· {t('{countLabel} în lucru', { countLabel: countLabel(sums.inWork, 'test', 'teste') })}</span>
                      </>
                    )}
                    {sums && sums.points > 0 && (
                      <>
                        {' '}
                        <span>
                          · <span className="is-waiting">{countLabel(sums.points, 'punct de verificat', 'puncte de verificat')}</span>
                        </span>
                      </>
                    )}
                    {sums && sums.average !== null && (
                      <>
                        {' '}
                        <span>· {t('media la teste {grade}', { grade: formatPoints(sums.average) })}</span>
                      </>
                    )}
                  </span>
                </Link>
              );
            })}
          </nav>
        </>
      )}
      {archived > 0 && (
        <div className="panel-actions">
          <Link to="/classes" state={{ archived: true }}>{t('Arhivate ({archived})', { archived })}</Link>
        </div>
      )}
    </Panel>
  );
}

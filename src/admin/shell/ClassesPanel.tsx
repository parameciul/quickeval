import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { TestSummary } from '../../../shared/api.ts';
import { studentCountLabel, testStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { IconClasses } from './icons.tsx';
import { Panel } from './Panel.tsx';
import { inWork, type TodoItem } from './todo.ts';

// "Clasele tale" (redesign spec §4): the classes of the school year that are
// not archived, each with its students and its tests in work; a test that
// waits on the teacher is orange and says what waits ("Logaritmi · Rezultate ·
// nepublicate"). The class of the page is marked. Until the tests of the year
// arrive a class shows no line about them (or the panel says why they could
// not be read), never "Nimic în lucru". With no class, its empty state holds
// the one "+ Clasă nouă"; "Arhivate (n)" stays at the foot.
export function ClassesPanel({
  year,
  todo,
  currentClassId,
  onClose,
}: {
  year: number;
  todo: TodoItem[];
  currentClassId: number | null;
  onClose(): void;
}) {
  const api = useApi();
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });
  const tests = useQuery({ queryKey: ['tests', year], queryFn: () => api.listTests(year) });
  const active = classes.data?.filter((item) => !item.archived) ?? [];
  const archived = classes.data?.filter((item) => item.archived).length ?? 0;
  const todoOf = (test: TestSummary) => todo.find((item) => item.code === test.code);

  return (
    <Panel id="panel-clase" title="Clasele tale" onClose={onClose}>
      {classes.error ? (
        <div className="panel-body">
          <ErrorMessage error={classes.error} />
        </div>
      ) : !classes.data ? (
        <p className="panel-body hint">Se încarcă…</p>
      ) : active.length === 0 ? (
        <EmptyState
          icon={<IconClasses />}
          title={archived > 0 ? 'Nu ai nicio clasă activă' : 'Încă nu ai nicio clasă'}
          action={
            <Link className="button button-small" to="/clase" state={{ newClass: true }}>
              + Clasă nouă
            </Link>
          }
        >
          Adaugă clasa cu numele elevilor, câte unul pe rând.
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
              const work = (tests.data ?? []).filter((test) => test.classId === item.id && inWork(test));
              return (
                <Link
                  key={item.id}
                  className="class-item"
                  to={`/clase/${item.id}`}
                  aria-current={item.id === currentClassId ? 'page' : undefined}
                >
                  <span className="class-item-head">
                    <b>{item.name}</b>
                    <span>{studentCountLabel(item.studentCount)}</span>
                  </span>
                  {!tests.data ? null : work.length === 0 ? (
                    <span className="class-item-test">Nimic în lucru</span>
                  ) : (
                    work.map((test) => {
                      const waiting = todoOf(test);
                      return (
                        <span key={test.code} className={waiting ? 'class-item-test is-waiting' : 'class-item-test'}>
                          {test.title} · {waiting ? `${waiting.stage} · ${waiting.short}` : testStatusLabel(test.status)}
                        </span>
                      );
                    })
                  )}
                </Link>
              );
            })}
          </nav>
        </>
      )}
      <div className="panel-actions">
        {(classes.data === undefined || active.length > 0) && (
          <Link className="button-quiet button-small" to="/clase" state={{ newClass: true }}>
            + Clasă nouă
          </Link>
        )}
        {archived > 0 && (
          <Link to="/clase" state={{ archived: true }}>
            Arhivate ({archived})
          </Link>
        )}
      </div>
    </Panel>
  );
}

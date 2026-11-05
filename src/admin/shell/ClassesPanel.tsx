import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { TestSummary } from '../../../shared/api.ts';
import { studentCountLabel, testStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { Panel } from './Panel.tsx';
import type { TodoItem } from './todo.ts';

// A test still in work: not finished yet, or finished with a thing to do.
function inWork(test: TestSummary, waits: boolean): boolean {
  return !test.archived && (test.status !== 'done' || waits);
}

// "Clasele tale" (redesign spec §4): the classes of the school year that are
// not archived, each with its students and its tests in work; a test that
// waits on the teacher is orange and says what waits ("Logaritmi · Rezultate ·
// nepublicate"). The class of the page is marked. Until the tests of the year
// arrive a class shows no line about them (or the panel says why they could
// not be read), never "Nimic în lucru".
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
        <p className="panel-body hint">Nu ai nicio clasă în acest an școlar.</p>
      ) : (
        <>
          {!tests.data && tests.error ? (
            <div className="panel-body">
              <ErrorMessage error={tests.error} />
            </div>
          ) : null}
          <nav className="class-list">
            {active.map((item) => {
              const work = (tests.data ?? []).filter((test) => test.classId === item.id && inWork(test, todoOf(test) !== undefined));
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
        <Link className="button-quiet button-small" to="/clase">
          + Clasă nouă
        </Link>
        {archived > 0 && <Link to="/clase">Arhivate ({archived})</Link>}
      </div>
    </Panel>
  );
}

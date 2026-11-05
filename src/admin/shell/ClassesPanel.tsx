import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { TestSummary } from '../../../shared/api.ts';
import { studentCountLabel, testStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { Panel } from './Panel.tsx';

// A test still in work: not finished yet.
function inWork(test: TestSummary): boolean {
  return !test.archived && test.status !== 'done';
}

// "Clasele tale" (redesign spec §4): the classes of the school year that are
// not archived, each with its students and its tests in work; the class of
// the page is marked.
export function ClassesPanel({ year, currentClassId, onClose }: { year: number; currentClassId: number | null; onClose(): void }) {
  const api = useApi();
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });
  const tests = useQuery({ queryKey: ['tests', year], queryFn: () => api.listTests(year) });
  const active = classes.data?.filter((item) => !item.archived) ?? [];
  const archived = classes.data?.filter((item) => item.archived).length ?? 0;

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
        <nav className="class-list" aria-label="Clasele tale">
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
                {work.length === 0 ? (
                  <span className="class-item-test">Nimic în lucru</span>
                ) : (
                  work.map((test) => (
                    <span key={test.code} className="class-item-test">
                      {test.title} · {testStatusLabel(test.status)}
                    </span>
                  ))
                )}
              </Link>
            );
          })}
        </nav>
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

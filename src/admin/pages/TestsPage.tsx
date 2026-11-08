import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { displayClassName } from '../../../shared/classes.ts';
import { countLabel } from '../../ui/format.ts';
import { useNow } from '../../ui/useNow.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';
import { inWork, todoList } from '../shell/todo.ts';
import { FirstSteps } from '../testsPage/FirstSteps.tsx';
import { greeting, todayLine, welcome } from '../testsPage/greeting.ts';
import { TestGroup } from '../testsPage/TestGroup.tsx';
import { TodoRows } from '../testsPage/TodoRows.tsx';

// The start page (redesign spec §5): a greeting with what waits on the
// teacher, the class chips, and the tests of the selected school year in two
// groups, newest first. The class and the archived choice live in the
// address, so a link or a reload keeps them. A new teacher (no test in the
// year, and none ever sent to grading) sees "Bun venit" and "Primii pași"
// instead (redesign spec §11.9).
export function TestsPage() {
  const api = useApi();
  const { year } = useSchoolYear();
  const [params, setParams] = useSearchParams();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
  const tests = useQuery({ queryKey: ['tests', year], queryFn: () => api.listTests(year) });
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });
  const [todoOpen, setTodoOpen] = useState(false);
  const now = useNow();
  // The test whose row takes the focus once a publish has moved it.
  const [focusCode, setFocusCode] = useState<string | null>(null);

  const requested = Number(params.get('clasa'));
  const chosenClass = classes.data?.find((item) => item.id === requested)?.id ?? null;
  const showArchived = params.get('arhivate') === '1';

  // A class that is not one of the year's (an old link, or another school year)
  // leaves the address, so the chips and the address agree.
  const staleClass = classes.data !== undefined && params.has('clasa') && chosenClass === null;
  useEffect(() => {
    if (!staleClass) return;
    const next = new URLSearchParams(params);
    next.delete('clasa');
    setParams(next, { replace: true });
  }, [staleClass, params, setParams]);

  const change = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  // What waits covers every class of the year, as "De făcut" in the bar.
  const todo = todoList(tests.data ?? []);
  const visible = tests.data?.filter((test) => (chosenClass === null || test.classId === chosenClass) && (showArchived || !test.archived));
  const working = visible?.filter(inWork) ?? [];
  const finished = visible?.filter((test) => !inWork(test)) ?? [];
  const first = todo[0]?.code ?? null;
  const firstVisit = tests.data?.length === 0 && me.data?.testsEvaluated === 0;
  const hasClass = classes.data?.some((item) => !item.archived) ?? false;

  if (tests.isPending && me.data?.testsEvaluated === 0) return <p>Se încarcă…</p>;
  if (firstVisit) {
    return (
      <section className="tests-page">
        <div className="page-head">
          <div className="greet">
            <h1>{welcome(me.data?.name ?? '')}</h1>
            <p>{todayLine(now)} · Trei pași până la primul test corectat.</p>
          </div>
        </div>
        {classes.error && <ErrorMessage error={classes.error} />}
        {classes.data && <FirstSteps hasClass={hasClass} />}
      </section>
    );
  }

  return (
    <section className="tests-page">
      <div className="page-head">
        <div className="greet">
          <h1>{greeting(now, me.data?.name ?? '')}</h1>
          <p>
            {todayLine(now)}
            {tests.data && todo.length === 0 && ' · Nimic nu te așteaptă acum.'}
            {todo.length > 0 && (
              <>
                {' · '}
                <button
                  type="button"
                  className="todo-link"
                  aria-expanded={todoOpen}
                  aria-controls="todo-inline"
                  onClick={() => setTodoOpen(!todoOpen)}
                >
                  {countLabel(todo.length, 'lucru', 'lucruri')} te așteaptă
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </button>{' '}
                în {countLabel(todo.length, 'test', 'teste')}.
              </>
            )}
          </p>
        </div>
        <Link className="button" to="/teste/nou">
          Test nou
        </Link>
      </div>
      {todo.length > 0 && <TodoRows id="todo-inline" items={todo} hidden={!todoOpen} />}

      <div className="filters">
        <div className="chips" role="group" aria-label="Clasa">
          <button type="button" className="chip" aria-pressed={chosenClass === null} onClick={() => change('clasa', null)}>
            Toate clasele
          </button>
          {classes.data?.map((item) => (
            <button key={item.id} type="button" className="chip" aria-pressed={item.id === chosenClass} onClick={() => change('clasa', String(item.id))}>
              {displayClassName(item.name)}
            </button>
          ))}
        </div>
        <label className="check-label">
          <input type="checkbox" checked={showArchived} onChange={(event) => change('arhivate', event.target.checked ? '1' : null)} />
          Arată și testele arhivate
        </label>
      </div>
      {classes.error && <ErrorMessage error={classes.error} />}

      {tests.isPending && <p>Se încarcă…</p>}
      {tests.error && <ErrorMessage error={tests.error} />}
      {tests.data && tests.data.length === 0 && <p className="hint">Nu ai niciun test în acest an școlar.</p>}
      {tests.data && tests.data.length > 0 && visible?.length === 0 && !classes.isPending && (
        <p className="hint">Nu ai teste pentru această alegere.</p>
      )}
      {!classes.isPending && working.length > 0 && <TestGroup title="În lucru" tests={working} first={first} focusCode={focusCode} onPublished={setFocusCode} />}
      {!classes.isPending && finished.length > 0 && <TestGroup title="Terminate" tests={finished} first={first} focusCode={focusCode} onPublished={setFocusCode} />}
    </section>
  );
}

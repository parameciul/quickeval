import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { countLabel } from '../../ui/format.ts';
import { useNow } from '../../ui/useNow.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';
import { inWork, todoList } from '../shell/todo.ts';
import { ClassFilter } from '../testsPage/ClassFilter.tsx';
import { FirstSteps } from '../testsPage/FirstSteps.tsx';
import { greeting, todayLine, welcome } from '../testsPage/greeting.ts';
import { TestGroup } from '../testsPage/TestGroup.tsx';
import { TodoRows } from '../testsPage/TodoRows.tsx';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { t } from '../../i18n/t.ts';

// The start page (redesign spec §5): a greeting with what waits on the
// teacher, and the tests of the selected school year in two groups, newest
// first, with the class filter beside the first group's title. The class and
// the archived choice live in the address, so a link or a reload keeps them.
// A new teacher (no test in the year, and none ever sent to grading) sees
// "Bun venit" and "Primii pași" instead (redesign spec §11.9).
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
  // A filter choice can move the filter beside another group's title, a new
  // button: the filter that appears after the address changed takes the
  // focus. The mark is cleared once that address is drawn (a parent's effect
  // runs after its children's).
  const filterFocus = useRef(false);

  const requested = Number(params.get('class'));
  const chosenClass = classes.data?.find((item) => item.id === requested)?.id ?? null;
  const showArchived = params.get('archived') === '1';

  // A class that is not one of the year's (an old link, or another school year)
  // leaves the address, so the filter and the address agree.
  const staleClass = classes.data !== undefined && params.has('class') && chosenClass === null;
  useEffect(() => {
    if (!staleClass) return;
    const next = new URLSearchParams(params);
    next.delete('class');
    setParams(next, { replace: true });
  }, [staleClass, params, setParams]);

  const change = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    if (next.toString() === params.toString()) return;
    filterFocus.current = true;
    setParams(next, { replace: true });
  };
  useEffect(() => {
    filterFocus.current = false;
  }, [params]);

  // What waits covers every class of the year, as "De făcut" in the bar.
  const todo = todoList(tests.data ?? []);
  const visible = tests.data?.filter((test) => (chosenClass === null || test.classId === chosenClass) && (showArchived || !test.archived));
  const working = visible?.filter(inWork) ?? [];
  const finished = visible?.filter((test) => !inWork(test)) ?? [];
  const first = todo[0]?.code ?? null;
  const firstVisit = tests.data?.length === 0 && me.data?.testsEvaluated === 0;
  const hasClass = classes.data?.some((item) => !item.archived) ?? false;
  const groupShown = !classes.isPending && (working.length > 0 || finished.length > 0);
  const filter = tests.data && !classes.isPending && (
    <ClassFilter
      classes={classes.data ?? []}
      tests={tests.data}
      chosenClass={chosenClass}
      showArchived={showArchived}
      onClass={(classId) => change('class', classId === null ? null : String(classId))}
      onArchived={(show) => change('archived', show ? '1' : null)}
      takesFocus={() => filterFocus.current}
    />
  );

  if (tests.isPending && me.data?.testsEvaluated === 0) return <p>{t('Se încarcă…')}</p>;
  if (firstVisit) {
    return (
      <section className="tests-page">
        <div className="page-head">
          <div className="greet">
            <h1>{welcome(me.data?.name ?? '')}</h1>
            <p>{t('{todayLine} · Trei pași până la primul test corectat.', { todayLine: todayLine(now) })}</p>
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
            {tests.data && todo.length === 0 && ` ${t('· Nimic nu te așteaptă acum.')}`}
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
                  {countLabel(todo.length, 'lucru', 'lucruri')}{' '}{t('te așteaptă')}
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </button>{' '}
                {t('în')}{' '}{countLabel(todo.length, 'test', 'teste')}.
              </>
            )}
          </p>
        </div>
        <Link className="button" to="/tests/new">
          <ActionIcon name="add" />
          {t('Test nou')}
        </Link>
      </div>
      {todo.length > 0 && <TodoRows id="todo-inline" items={todo} hidden={!todoOpen} />}

      {classes.error && <ErrorMessage error={classes.error} />}

      {tests.isPending && <p>{t('Se încarcă…')}</p>}
      {tests.error && <ErrorMessage error={tests.error} />}
      {/* The class filter stands at the right of the first group's title, or
          on a line of its own when no group shows. */}
      {!groupShown && filter && <div className="group-head is-filter-only">{filter}</div>}
      {tests.data && tests.data.length === 0 && <p className="hint">{t('Nu ai niciun test în acest an școlar.')}</p>}
      {tests.data && tests.data.length > 0 && visible?.length === 0 && !classes.isPending && (
        <p className="hint">{t('Nu ai teste pentru această alegere.')}</p>
      )}
      {groupShown && working.length > 0 && (
        <TestGroup title={t('În lucru')} tests={working} first={first} focusCode={focusCode} onPublished={setFocusCode} extra={filter} />
      )}
      {groupShown && finished.length > 0 && (
        <TestGroup
          title={t('Terminate')}
          tests={finished}
          first={first}
          focusCode={focusCode}
          onPublished={setFocusCode}
          columns={working.length === 0}
          extra={working.length === 0 ? filter : undefined}
        />
      )}
    </section>
  );
}

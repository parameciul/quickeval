import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { TestSummary } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { classToneClass, classToneStyle } from '../../ui/classTone.ts';
import { countLabel, formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';
import { StatusChip } from '../StatusChip.tsx';
import { hasResultsToManage } from '../testPage/ResultsAccess.tsx';

// The start page: the tests of the selected school year, newest first. The
// class and the archived choice live in the address, so a link or a reload
// keeps them.
export function TestsPage() {
  const api = useApi();
  const { year } = useSchoolYear();
  const [params, setParams] = useSearchParams();
  const tests = useQuery({ queryKey: ['tests', year], queryFn: () => api.listTests(year) });
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });

  const requested = Number(params.get('clasa'));
  const chosenClass = classes.data?.find((item) => item.id === requested)?.id ?? null;
  const showArchived = params.get('arhivate') === '1';

  // A class that is not one of the year's (an old link, or another school year)
  // leaves the address, so the select and the address agree.
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

  const visible = tests.data?.filter((test) => (chosenClass === null || test.classId === chosenClass) && (showArchived || !test.archived));

  return (
    <section>
      <div className="page-head">
        <h1>Teste {formatSchoolYear(year)}</h1>
        <Link className="button" to="/teste/nou">
          Test nou
        </Link>
      </div>

      <div className="form-row">
        <label htmlFor="test-class">Clasa</label>
        <select id="test-class" value={chosenClass === null ? '' : String(chosenClass)} onChange={(event) => change('clasa', event.target.value || null)}>
          <option value="">Toate clasele</option>
          {classes.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {displayClassName(item.name)}
            </option>
          ))}
        </select>
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
      {visible && visible.length > 0 && !classes.isPending && (
        <ul className="card-list">
          {visible.map((test) => (
            <TestCard key={test.code} test={test} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TestCard({ test }: { test: TestSummary }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const publish = useMutation({
    mutationFn: () => api.setResultsOpen(test.code, !test.resultsOpen),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tests'] }),
        queryClient.invalidateQueries({ queryKey: ['test', test.code] }),
      ]);
    },
  });

  const className = ['card', 'has-tone', classToneClass(), test.archived ? 'is-muted' : ''].filter(Boolean).join(' ');
  const hasResults = hasResultsToManage(test);
  const publishLabel = test.resultsOpen ? 'Oprește accesul' : test.publishedCount > 0 ? 'Publică pentru toți' : 'Publică rezultatele';
  return (
    <li className={className} style={classToneStyle(test.classId)}>
      <Link className="card-title" to={`/teste/${test.code}`}>
        {test.code}
      </Link>
      <span>{test.title}</span>
      <span className="card-meta">
        <span className="class-badge">{displayClassName(test.className)}</span>
        {test.startedAt && <span className="card-count">{formatDateTime(test.startedAt)}</span>}
      </span>
      <span className="card-meta">
        <StatusChip status={test.status} />
        {test.flagCount > 0 && <span className="tag">de verificat</span>}
        {test.archived && <span className="tag">Arhivat</span>}
      </span>
      {test.status !== 'draft' && (
        <span className="card-count">
          Trimise: {test.submittedCount} din {test.studentCount}
          {test.gradedCount > 0 && ` · corectate: ${test.gradedCount}`}
          {test.flagCount > 0 && ` · de verificat: ${test.flagCount}`}
        </span>
      )}
      {(hasResults || test.gradedCount > 0) && (
        <span className="card-foot">
          {hasResults && (
            <span className="results-line">
              {test.resultsOpen ? (
                <span className="tag tag-ok">Rezultate publicate</span>
              ) : test.publishedCount > 0 ? (
                <span className="tag tag-muted">Publicate pentru {countLabel(test.publishedCount, 'elev', 'elevi')}</span>
              ) : (
                <span className="tag tag-muted">Rezultate nepublicate</span>
              )}
            </span>
          )}
          <span className="card-actions">
            {hasResults && (
              <button
                type="button"
                className="button-quiet button-small"
                disabled={publish.isPending}
                aria-label={`${publishLabel} · ${test.code}`}
                onClick={() => publish.mutate()}
              >
                {publishLabel}
              </button>
            )}
            {test.gradedCount > 0 && (
              <Link className="button-quiet button-small" to={`/teste/${test.code}/raport`}>
                Raportul clasei
              </Link>
            )}
          </span>
        </span>
      )}
      {publish.error && <ErrorMessage error={publish.error} />}
    </li>
  );
}

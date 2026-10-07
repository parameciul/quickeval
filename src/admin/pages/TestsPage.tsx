import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { displayClassName } from '../../../shared/classes.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';
import { StatusChip } from '../StatusChip.tsx';

// The start page: the tests of the selected school year, newest first.
export function TestsPage() {
  const api = useApi();
  const { year } = useSchoolYear();
  const tests = useQuery({ queryKey: ['tests', year], queryFn: () => api.listTests(year) });

  return (
    <section>
      <div className="page-head">
        <h1>Teste {formatSchoolYear(year)}</h1>
        <Link className="button" to="/teste/nou">
          Test nou
        </Link>
      </div>

      {tests.isPending && <p>Se încarcă…</p>}
      {tests.error && <ErrorMessage error={tests.error} />}
      {tests.data && tests.data.length === 0 && <p className="hint">Nu ai niciun test în acest an școlar.</p>}
      {tests.data && tests.data.length > 0 && (
        <ul className="card-list">
          {tests.data.map((test) => (
            <li key={test.code} className="card">
              <Link className="card-title" to={`/teste/${test.code}`}>
                {test.code}
              </Link>
              <span>{test.title}</span>
              <span className="card-count">
                {displayClassName(test.className)}
                {test.startedAt && ` · ${formatDateTime(test.startedAt)}`}
              </span>
              <span>
                <StatusChip status={test.status} />
              </span>
              {test.status !== 'draft' && (
                <span className="card-count">
                  Trimise: {test.submittedCount} din {test.studentCount}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

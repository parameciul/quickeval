import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { displayClassName } from '../../../shared/classes.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

// /elevi/:id: a student's history (spec §9): every graded test in every class
// and school year, newest first, each with a link to its result.
export function StudentPage() {
  const studentId = parsePositiveId(useParams().id);
  if (studentId === null) return <NotFoundPage />;
  return <StudentHistoryView key={studentId} studentId={studentId} />;
}

function StudentHistoryView({ studentId }: { studentId: number }) {
  const api = useApi();
  const history = useQuery({ queryKey: ['student', studentId], queryFn: () => api.getStudentHistory(studentId) });

  if (history.isPending) return <p>Se încarcă…</p>;
  if (history.error) return <ErrorMessage error={history.error} />;
  const { student, classes, results } = history.data;

  return (
    <section>
      <h1>{student.fullName}</h1>
      {classes.length > 0 && (
        <p className="lead-line">
          {classes.map((cls, index) => (
            <span key={cls.id}>
              {index > 0 && ' · '}
              <Link to={`/clase/${cls.id}`}>
                {displayClassName(cls.name)}, {formatSchoolYear(cls.schoolYear)}
              </Link>
              {!cls.active && <span className="tag">a plecat</span>}
            </span>
          ))}
        </p>
      )}

      <h2>Note</h2>
      {results.length === 0 ? (
        <p className="hint">Elevul nu are încă nicio lucrare corectată.</p>
      ) : (
        <div className="table-wrap">
          <table className="uploads">
            <caption className="sr-only">Notele elevului</caption>
            <thead>
              <tr>
                <th scope="col">Testul</th>
                <th scope="col">Clasa</th>
                <th scope="col">Data</th>
                <th scope="col">Nota</th>
                <th scope="col">De verificat</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.submissionId}>
                  <th scope="row">
                    <Link to={`/teste/${result.testCode}/elevi/${result.submissionId}`}>
                      {result.testCode} · {result.testTitle}
                    </Link>
                  </th>
                  <td>
                    {displayClassName(result.className)}, {formatSchoolYear(result.schoolYear)}
                  </td>
                  <td>{formatDateTime(result.date)}</td>
                  <td>{formatPoints(result.grade)}</td>
                  <td>{result.flagCount > 0 ? result.flagCount : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

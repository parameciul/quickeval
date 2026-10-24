import { Link } from 'react-router';
import type { ClassGrade, StudentRow, TestSummary } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { compareStudentNames } from '../../../shared/students.ts';
import { formatDayMonth, pointsLevel, uploadStatusLabel } from '../../ui/format.ts';
import { StatusChip } from '../StatusChip.tsx';

// "6E2-26T3" -> "T3".
function shortTestName(code: string): string {
  return code.slice(code.lastIndexOf('T'));
}

function gradeKey(studentId: number, testCode: string): string {
  return `${studentId}|${testCode}`;
}

// Active students first, then the ones who left; each group by name.
function orderedStudents(students: StudentRow[]): StudentRow[] {
  return [...students].sort((a, b) => Number(!a.active) - Number(!b.active) || compareStudentNames(a.fullName, b.fullName));
}

function TestHeader({ test }: { test: TestSummary }) {
  const finished = test.status === 'done' && test.startedAt !== null;
  return (
    <th scope="col" className={test.archived ? 'is-muted' : undefined}>
      <Link to={`/teste/${test.code}`} title={`${test.code} · ${test.title}`}>
        <span aria-hidden="true">{shortTestName(test.code)}</span>
        <span className="sr-only">
          {test.code} · {test.title}
        </span>
      </Link>
      <span className="grade-head-line">{finished ? formatDayMonth(test.startedAt!) : <StatusChip status={test.status} />}</span>
      {test.archived && <span className="sr-only">Arhivat</span>}
      {test.gradedCount > 0 && (
        <Link className="grade-head-line" to={`/teste/${test.code}/raport`}>
          raport
        </Link>
      )}
    </th>
  );
}

function GradeCell({ grade }: { grade: ClassGrade | undefined }) {
  if (!grade) return <td>—</td>;
  if (grade.status !== 'graded' || grade.grade === null) {
    return (
      <td>
        <span className="hint">{uploadStatusLabel(grade.status)}</span>
      </td>
    );
  }
  return (
    <td className={grade.flagCount > 0 ? 'flagged-cell' : undefined}>
      <Link to={`/teste/${grade.testCode}/elevi/${grade.submissionId}`}>
        <span className={`points points-${pointsLevel(grade.grade, 10)}`}>{formatPoints(grade.grade)}</span>
        {grade.flagCount > 0 && (
          <>
            {' '}
            <span className="sr-only">(de verificat)</span>
          </>
        )}
      </Link>
    </td>
  );
}

// The class page's grade table: a row for each student, a column for each test,
// the newest test on the left (`tests` arrive newest first). Draft and open
// tests keep a column, with their status, so the page still leads to them.
export function GradesTable({
  classId,
  students,
  tests,
  grades,
  showArchived,
}: {
  classId: number;
  students: StudentRow[];
  tests: TestSummary[];
  grades: ClassGrade[];
  showArchived: boolean;
}) {
  if (tests.length === 0) return <p className="hint">Clasa nu are încă teste.</p>;
  if (students.length === 0) {
    return (
      <p className="hint">
        Clasa nu are încă elevi. <Link to={`/clase/${classId}/elevi`}>Adaugă elevi</Link>
      </p>
    );
  }

  const shown = tests.filter((test) => showArchived || !test.archived);
  if (shown.length === 0) {
    return <p className="hint">Toate testele clasei sunt arhivate. Apasă „Arată și testele arhivate”.</p>;
  }
  const byCell = new Map(grades.map((grade) => [gradeKey(grade.studentId, grade.testCode), grade]));
  return (
    <div className="table-wrap">
      <table className="report-table grades-table">
        <caption className="sr-only">Notele elevilor la teste</caption>
        <thead>
          <tr>
            <th scope="col">Elev</th>
            {shown.map((test) => (
              <TestHeader key={test.code} test={test} />
            ))}
          </tr>
        </thead>
        <tbody>
          {orderedStudents(students).map((student) => (
            <tr key={student.id} className={student.active ? undefined : 'is-muted'}>
              <th scope="row">
                <Link to={`/elevi/${student.id}`}>{student.fullName}</Link>
                {!student.active && (
                  <>
                    {' '}
                    <span className="tag">a plecat</span>
                  </>
                )}
              </th>
              {shown.map((test) => (
                <GradeCell key={test.code} grade={byCell.get(gradeKey(student.id, test.code))} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

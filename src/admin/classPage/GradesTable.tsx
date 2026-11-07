import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { ClassGrade, StudentRow, TestSummary } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { compareStudentNames } from '../../../shared/students.ts';
import { countLabel, formatDayMonth, uploadStatusLabel } from '../../ui/format.ts';
import { stagesOf } from '../stages.ts';
import { todoOf } from '../shell/todo.ts';

function gradeKey(studentId: number, testCode: string): string {
  return `${studentId}|${testCode}`;
}

// Active students first, then the ones who left; each group by name.
export function orderedStudents(students: StudentRow[]): StudentRow[] {
  return [...students].sort((a, b) => Number(!a.active) - Number(!b.active) || compareStudentNames(a.fullName, b.fullName));
}

// The line under a test's name: its date (or "ciornă") and where it stands,
// in orange when it waits on the teacher.
function headNote(test: TestSummary): { text: string; waits: boolean } {
  const date = test.startedAt === null ? 'ciornă' : formatDayMonth(test.startedAt);
  const waits = todoOf(test) !== null;
  if (test.flagCount > 0) return { text: `${date} · de verificat`, waits };
  if (test.status === 'done' && test.gradedCount > 0) {
    return { text: `${date} · ${test.resultsOpen ? 'publicat' : 'nepublicat'}`, waits };
  }
  return { text: `${date} · ${stagesOf(test).current.name.toLowerCase()}`, waits };
}

function TestHeader({ test }: { test: TestSummary }) {
  const note = headNote(test);
  return (
    <th scope="col" className={test.archived ? 'grade-head is-muted' : 'grade-head'}>
      <Link to={`/teste/${test.code}`}>{test.title}</Link>
      <span className={note.waits ? 'grade-head-note is-waiting' : 'grade-head-note'}>{note.text}</span>
      {test.archived && <span className="grade-head-note">arhivat</span>}
    </th>
  );
}

function GradeCell({ grade }: { grade: ClassGrade | undefined }) {
  if (!grade) {
    return (
      <td className="grade-none" title="Nu a trimis lucrarea">
        —
      </td>
    );
  }
  if (grade.status !== 'graded' || grade.grade === null) {
    return (
      <td className="grade-state">
        <Link to={`/teste/${grade.testCode}/elevi/${grade.submissionId}`}>{uploadStatusLabel(grade.status)}</Link>
      </td>
    );
  }
  const flagged = grade.flagCount > 0;
  const waiting = countLabel(grade.flagCount, 'punct de verificat', 'puncte de verificat');
  return (
    <td className={flagged ? 'grade-flag' : undefined} title={flagged ? waiting : undefined}>
      <Link to={`/teste/${grade.testCode}/elevi/${grade.submissionId}`}>
        {flagged && <span className="flag-dot" role="img" aria-label={waiting}></span>}
        {formatPoints(grade.grade)}
      </Link>
    </td>
  );
}

// The mean of the graded results of one test, students who left included; null
// when nothing is graded yet.
function testAverage(grades: ClassGrade[], testCode: string): number | null {
  const graded = grades.filter((grade) => grade.testCode === testCode && grade.status === 'graded' && grade.grade !== null);
  if (graded.length === 0) return null;
  return graded.reduce((total, grade) => total + grade.grade!, 0) / graded.length;
}

// The class page's grade table (spec §9): a row per student, a narrow column
// per test, the oldest test on the left (`tests` arrive newest first), the last
// row "Media testului", and no average per student. Draft and open tests keep a
// column, so the page still leads to them.
export function GradesTable({
  students,
  tests,
  grades,
  showArchived,
  onShowStudents,
}: {
  students: StudentRow[];
  tests: TestSummary[];
  grades: ClassGrade[];
  showArchived: boolean;
  onShowStudents(): void;
}) {
  const shown = tests.filter((test) => showArchived || !test.archived).reverse();
  let empty: ReactNode = null;
  if (students.length === 0) {
    empty = (
      <>
        <p>Clasa nu are încă elevi.</p>
        <button type="button" className="button-quiet button-small" onClick={onShowStudents}>
          Adaugă elevi
        </button>
      </>
    );
  } else if (tests.length === 0) {
    empty = <p>Clasa nu are încă teste. Notele apar aici după primul test.</p>;
  } else if (shown.length === 0) {
    empty = <p>Toate testele clasei sunt arhivate. Apasă „Arată și testele arhivate”.</p>;
  }
  if (empty !== null) return <div className="class-card class-empty">{empty}</div>;

  const byCell = new Map(grades.map((grade) => [gradeKey(grade.studentId, grade.testCode), grade]));
  return (
    <div className="class-card class-grades">
      <div className="table-wrap">
        <table className="grades-table">
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
          <tfoot>
            <tr>
              <th scope="row">Media testului</th>
              {shown.map((test) => {
                const average = testAverage(grades, test.code);
                return <td key={test.code}>{average === null ? '—' : formatPoints(average)}</td>;
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="class-card-foot">
        <span className="flag-dot" aria-hidden="true"></span>
        Nota se poate schimba după verificare. „—”: elevul nu a trimis lucrarea.
      </p>
    </div>
  );
}

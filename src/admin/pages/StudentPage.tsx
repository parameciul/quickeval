import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import type { ClassGrade, StudentClass, StudentHistory, StudentHistoryTest } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatDate } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { CesTag } from '../CesTag.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { RenameDialog } from '../classPage/ClassDialogs.tsx';
import { ResultCell } from '../classPage/ClassStudents.tsx';
import { GradeCell } from '../classPage/GradesTable.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

// The state a link to the student page passes: the class the teacher came
// from, for "←".
export type StudentLinkState = { fromClass?: number } | null;

// /elevi/:id: a student's history (spec §11.2): one card per class and school
// year, newest first, with a row per started test of that class.
export function StudentPage() {
  const studentId = parsePositiveId(useParams().id);
  if (studentId === null) return <NotFoundPage />;
  return <StudentHistoryView key={studentId} studentId={studentId} />;
}

// "←" leads to the class the teacher came from, else to the class the student
// is in now (the newest one), else to the newest class.
function backClass(classes: StudentClass[], fromClass: number | undefined): StudentClass | undefined {
  return classes.find((cls) => cls.id === fromClass) ?? classes.find((cls) => cls.active) ?? classes[0];
}

function StudentHistoryView({ studentId }: { studentId: number }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [fromClass] = useState(() => (location.state as StudentLinkState)?.fromClass);
  const [renameOpen, setRenameOpen] = useState(false);
  const renameButton = useRef<HTMLButtonElement>(null);
  const history = useQuery({ queryKey: ['student', studentId], queryFn: () => api.getStudentHistory(studentId) });

  if (history.isPending) return <p>Se încarcă…</p>;
  if (history.error) return <ErrorMessage error={history.error} />;
  const { student, classes } = history.data;
  const back = backClass(classes, fromClass);
  const [now, ...before] = classes;
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['student', studentId] });
    await queryClient.invalidateQueries({ queryKey: ['class'] });
  };

  return (
    <section className="history-page">
      {back && (
        <p className="back-link">
          <Link to={`/clase/${back.id}`}>← {displayClassName(back.name)}</Link>
        </p>
      )}
      <div className="history-head">
        <div>
          <h1>
            {student.fullName}
            {student.ces && <CesTag />}
          </h1>
          {now && (
            <p className="lead-line">
              <ClassLink cls={now} /> în {formatSchoolYear(now.schoolYear)}
              {before.length > 0 && ' · înainte în '}
              {before.map((cls, index) => (
                <span key={cls.id}>
                  {index > 0 && ', '}
                  <ClassLink cls={cls} /> ({formatSchoolYear(cls.schoolYear)})
                </span>
              ))}
            </p>
          )}
        </div>
        <button ref={renameButton} type="button" className="button-quiet" onClick={() => setRenameOpen(true)}>
          Redenumește
        </button>
      </div>

      {classes.length === 0 ? (
        <p className="hint">Elevul nu este în nicio clasă.</p>
      ) : (
        classes.map((cls) => <YearCard key={cls.id} cls={cls} history={history.data} />)
      )}

      {renameOpen && (
        <RenameDialog
          title={`Redenumește ${student.fullName}`}
          label="Numele elevului"
          initial={student.fullName}
          maxLength={80}
          save={(next) => api.renameStudent(student.id, next)}
          onSaved={refresh}
          onClose={() => setRenameOpen(false)}
          returnFocus={renameButton}
        />
      )}
    </section>
  );
}

function ClassLink({ cls }: { cls: StudentClass }) {
  return (
    <>
      <Link to={`/clase/${cls.id}`}>{displayClassName(cls.name)}</Link>
      {!cls.active && (
        <>
          {' '}
          <span className="tag">a plecat</span>
        </>
      )}
    </>
  );
}

// One school year and class: a row per test, newest first, with the points,
// the grade as the grades table draws it, the result and the paper.
function YearCard({ cls, history }: { cls: StudentClass; history: StudentHistory }) {
  const tests = history.tests.filter((test) => test.classId === cls.id);
  const gradeOf = (test: StudentHistoryTest): ClassGrade | undefined =>
    history.grades.find((grade) => grade.testCode === test.code);
  const titleId = `history-${cls.id}`;
  const title = `${formatSchoolYear(cls.schoolYear)} · ${displayClassName(cls.name)}`;
  return (
    <section className="class-card history-card" aria-labelledby={titleId}>
      <div className="class-card-head">
        <h2 id={titleId}>{title}</h2>
      </div>
      {tests.length === 0 ? (
        <p className="hint history-empty">Niciun test început în această clasă.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="student-results history-table">
              <caption className="sr-only">Testele din {title}</caption>
              <thead>
                <tr>
                  <th scope="col">Test</th>
                  <th scope="col" className="num">
                    Punctaj
                  </th>
                  <th scope="col" className="num">
                    Nota
                  </th>
                  <th scope="col">Rezultatul</th>
                  <th scope="col">
                    <span className="sr-only">Lucrarea</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tests.map((test) => {
                  const grade = gradeOf(test);
                  const graded = grade?.status === 'graded';
                  return (
                    <tr key={test.code}>
                      <th scope="row">
                        <Link to={`/teste/${test.code}`}>{test.title}</Link>
                        <span>{formatDate(test.startedAt)}</span>
                      </th>
                      <td className="num">
                        {graded && grade.total !== null && grade.maxTotal !== null
                          ? `${formatPoints(grade.total)} / ${formatPoints(grade.maxTotal)}`
                          : '—'}
                      </td>
                      <GradeCell grade={grade} />
                      <td className="student-result">
                        <ResultCell grade={grade} studentName={history.student.fullName} />
                      </td>
                      <td className="student-paper">
                        {grade !== undefined && (
                          <Link to={`/teste/${test.code}/elevi/${grade.submissionId}`}>Lucrarea</Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="class-card-foot">
            <span>
              <span className="flag-dot" aria-hidden="true"></span> Nota se poate schimba după verificare. „—”: elevul nu
              a trimis lucrarea.
            </span>
          </p>
        </>
      )}
    </section>
  );
}

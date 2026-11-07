import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { AdminApi } from '../api.ts';
import type { ClassGrade, StudentRow, TestSummary } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { countLabel, formatDayMonth, uploadStatusLabel } from '../../ui/format.ts';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { CopyResultLink } from '../testPage/ResultLinksTable.tsx';
import { AddStudentsDialog, RenameDialog } from './ClassDialogs.tsx';
import { orderedStudents } from './GradesTable.tsx';

// A name as the search compares it: no case, no diacritics ("stef" finds
// "Ștefan").
function searchKey(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

// "Elevi" tab of the class page (spec §9): the students on the left (search,
// an orange dot for points to check, "+ Adaugă elevi"), one student on the
// right with each test of the class. The first student is chosen at first.
export function ClassStudents({
  api,
  classId,
  className,
  schoolYear,
  students,
  tests,
  grades,
  onChanged,
}: {
  api: AdminApi;
  classId: number;
  className: string;
  schoolYear: number;
  students: StudentRow[];
  tests: TestSummary[];
  grades: ClassGrade[];
  onChanged: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [chosenId, setChosenId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const ordered = orderedStudents(students);
  const needle = searchKey(search);
  const visible = needle === '' ? ordered : ordered.filter((student) => searchKey(student.fullName).includes(needle));
  const chosen = ordered.find((student) => student.id === chosenId) ?? ordered[0] ?? null;
  const waits = (studentId: number) => grades.some((grade) => grade.studentId === studentId && grade.flagCount > 0);

  const addDialog = addOpen && (
    <AddStudentsDialog
      classId={classId}
      className={className}
      students={students}
      onAdded={onChanged}
      onClose={() => setAddOpen(false)}
    />
  );

  if (students.length === 0) {
    return (
      <div className="class-card class-empty">
        <p>Clasa nu are încă elevi. Poți lipi lista din catalog.</p>
        <button type="button" className="button button-small" onClick={() => setAddOpen(true)}>
          + Adaugă elevi
        </button>
        {addDialog}
      </div>
    );
  }

  return (
    <div className="class-card student-split">
      <div className="student-list">
        <label htmlFor="student-search" className="sr-only">
          Caută un elev
        </label>
        <input
          id="student-search"
          type="search"
          className="student-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Caută un elev"
        />
        {visible.length === 0 ? (
          <p className="hint student-list-empty">Nu s-a găsit niciun elev.</p>
        ) : (
          <ul aria-label="Elevii clasei">
            {visible.map((student) => (
              <li key={student.id}>
                <button
                  type="button"
                  className={student.active ? 'student-pick' : 'student-pick is-muted'}
                  aria-current={student.id === chosen?.id ? 'true' : undefined}
                  onClick={() => setChosenId(student.id)}
                >
                  <span>{student.fullName}</span>
                  {waits(student.id) && <span className="flag-dot" role="img" aria-label="puncte de verificat"></span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="text-button student-add" onClick={() => setAddOpen(true)}>
          + Adaugă elevi
        </button>
        {addDialog}
      </div>
      {chosen && (
        <StudentDetail
          key={chosen.id}
          api={api}
          classId={classId}
          className={className}
          schoolYear={schoolYear}
          student={chosen}
          tests={tests}
          grades={grades}
          onChanged={onChanged}
          onDeleted={() => setChosenId(null)}
        />
      )}
    </div>
  );
}

// The result of one paper for the student: published, not yet (with the link
// to copy), after the check, or no paper.
function ResultCell({ grade, studentName }: { grade: ClassGrade | undefined; studentName: string }) {
  if (grade === undefined) return <span className="hint">Nu a trimis lucrarea.</span>;
  if (grade.status !== 'graded') return <span className="hint">{uploadStatusLabel(grade.status)}</span>;
  if (!grade.resultsOpen && grade.flagCount > 0) return <span className="hint">După verificare</span>;
  return (
    <>
      {grade.resultsOpen ? <span className="tag tag-ok">Publicat</span> : <span className="hint">Nepublicat</span>}
      {grade.startedAt !== null && (
        <CopyResultLink
          key={grade.submissionId}
          submissionId={grade.submissionId}
          startedAt={grade.startedAt}
          resultToken={grade.resultToken}
          studentName={studentName}
        />
      )}
    </>
  );
}

function StudentDetail({
  api,
  classId,
  className,
  schoolYear,
  student,
  tests,
  grades,
  onChanged,
  onDeleted,
}: {
  api: AdminApi;
  classId: number;
  className: string;
  schoolYear: number;
  student: StudentRow;
  tests: TestSummary[];
  grades: ClassGrade[];
  onChanged: () => Promise<void>;
  onDeleted(): void;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const gradeOf = (testCode: string) =>
    grades.find((grade) => grade.studentId === student.id && grade.testCode === testCode);
  // The papers the student sent: an upload still under way or failed is not one.
  const papers = tests.filter((test) => {
    const status = gradeOf(test.code)?.status;
    return status !== undefined && status !== 'uploading' && status !== 'failed';
  }).length;
  const toggle = useMutation({
    mutationFn: () => api.setStudentActive(classId, student.id, !student.active),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteStudent(classId, student.id),
    onSuccess: async () => {
      onDeleted();
      await onChanged();
    },
  });
  const askRemove = () => {
    if (window.confirm(`Ștergi elevul ${student.fullName} din clasă? Lucrările neterminate sau eșuate ale elevului se șterg și ele.`)) {
      remove.mutate();
    }
  };

  return (
    <section className="student-detail" aria-labelledby="student-detail-name">
      <div className="student-detail-head">
        <div>
          <h2 id="student-detail-name">
            {student.fullName}
            {!student.active && (
              <>
                {' '}
                <span className="tag">a plecat din clasă</span>
              </>
            )}
          </h2>
          <p>
            {displayClassName(className)} · {countLabel(papers, 'lucrare', 'lucrări')} în {formatSchoolYear(schoolYear)}
          </p>
        </div>
        <div className="student-detail-actions">
          <button type="button" className="text-button is-quiet" onClick={() => setRenameOpen(true)}>
            Redenumește
          </button>
          <button
            type="button"
            className="text-button is-quiet"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate()}
          >
            {student.active ? 'A plecat din clasă' : 'Revine în clasă'}
          </button>
          {student.canDelete && (
            <button type="button" className="text-button is-danger" disabled={remove.isPending} onClick={askRemove}>
              Șterge
            </button>
          )}
        </div>
      </div>
      {toggle.error && <ErrorMessage error={toggle.error} />}
      {remove.error && <ErrorMessage error={remove.error} />}
      {tests.length === 0 ? (
        <p className="hint student-detail-empty">Clasa nu are încă teste.</p>
      ) : (
        <div className="table-wrap">
          <table className="student-results">
            <caption className="sr-only">Testele lui {student.fullName}</caption>
            <thead>
              <tr>
                <th scope="col">Test</th>
                <th scope="col" className="num hide-phone">
                  Punctaj
                </th>
                <th scope="col" className="num">
                  Nota
                </th>
                <th scope="col">Rezultatul elevului</th>
                <th scope="col">
                  <span className="sr-only">Lucrarea</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tests.map((test) => {
                const grade = gradeOf(test.code);
                const graded = grade?.status === 'graded';
                return (
                  <tr key={test.code}>
                    <th scope="row">
                      <Link to={`/teste/${test.code}`}>{test.title}</Link>
                      <span>{test.startedAt === null ? 'ciornă' : formatDayMonth(test.startedAt)}</span>
                    </th>
                    <td className="num hide-phone">
                      {graded && grade.total !== null && grade.maxTotal !== null
                        ? `${formatPoints(grade.total)} / ${formatPoints(grade.maxTotal)}`
                        : '—'}
                    </td>
                    <td className="num">
                      {graded && grade.grade !== null ? (
                        <>
                          <b className={grade.flagCount > 0 ? 'is-waiting' : undefined}>{formatPoints(grade.grade)}</b>
                          {grade.flagCount > 0 && (
                            <span className="tag tag-wait">
                              {countLabel(grade.flagCount, 'punct de verificat', 'puncte de verificat')}
                            </span>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="student-result">
                      <ResultCell grade={grade} studentName={student.fullName} />
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
      )}
      <p className="class-card-foot">
        <span>Elevul vede rezultatul pe linkul lui, după ce îl publici.</span>
        <Link to={`/elevi/${student.id}`}>Toate notele elevului, din toate clasele</Link>
      </p>
      {renameOpen && (
        <RenameDialog
          title={`Redenumește ${student.fullName}`}
          label="Numele elevului"
          initial={student.fullName}
          maxLength={80}
          save={(next) => api.renameStudent(student.id, next)}
          onSaved={onChanged}
          onClose={() => setRenameOpen(false)}
        />
      )}
    </section>
  );
}

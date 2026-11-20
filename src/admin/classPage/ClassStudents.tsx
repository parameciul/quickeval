import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { AdminApi } from '../api.ts';
import type { ClassGrade, StudentRow, TestSummary } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { foldForSearch, searchMatcher } from '../../../shared/search.ts';
import { countLabel, formatDayMonth, uploadStatusLabel } from '../../ui/format.ts';
import { CesTag } from '../CesTag.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { CopyResultLink } from '../testPage/ResultLinksTable.tsx';
import { AddStudentsDialog, RenameDialog } from './ClassDialogs.tsx';
import { NoStudents, orderedStudents } from './GradesTable.tsx';
import type { StudentLinkState } from '../pages/StudentPage.tsx';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { GradeChip } from '../testPage/GradeChip.tsx';
import { t } from '../../i18n/t.ts';

// "Elevi" tab of the class page (spec §9): the students on the left (search,
// an orange dot for points to check, "Adaugă elevi"), one student on the
// right with each test of the class. The first student is chosen at first.
// `readOnly` (an archived class): no adding, renaming, leaving or deleting.
export function ClassStudents({
  api,
  classId,
  className,
  schoolYear,
  students,
  tests,
  grades,
  readOnly = false,
  onChanged,
}: {
  api: AdminApi;
  classId: number;
  className: string;
  schoolYear: number;
  students: StudentRow[];
  tests: TestSummary[];
  grades: ClassGrade[];
  readOnly?: boolean;
  onChanged: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [chosenId, setChosenId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const ordered = orderedStudents(students);
  // No case, no diacritics: "stef" finds "Ștefan".
  const matches = searchMatcher(search);
  const visible = foldForSearch(search) === '' ? ordered : ordered.filter((student) => matches(student.fullName));
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
    const add = (
      <button type="button" className="button button-small" onClick={() => setAddOpen(true)}>
        <ActionIcon name="add-person" />
        {t('Adaugă elevi')}
      </button>
    );
    return (
      <div className="class-card">
        <NoStudents name={className} readOnly={readOnly} action={add} />
        {addDialog}
      </div>
    );
  }

  return (
    <div className="class-card student-split">
      <div className="student-list">
        <label htmlFor="student-search" className="sr-only">
          {t('Caută un elev')}
        </label>
        <input
          id="student-search"
          type="search"
          className="student-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('Caută un elev')}
        />
        {visible.length === 0 ? (
          <p className="hint student-list-empty">{t('Nu s-a găsit niciun elev.')}</p>
        ) : (
          <ul aria-label={t('Elevii clasei')}>
            {visible.map((student) => (
              <li key={student.id}>
                <button
                  type="button"
                  className={student.active ? 'student-pick' : 'student-pick is-muted'}
                  aria-current={student.id === chosen?.id ? 'true' : undefined}
                  onClick={() => setChosenId(student.id)}
                >
                  <span>{student.fullName}</span>
                  {student.ces && <CesTag />}
                  {waits(student.id) && <span className="flag-dot" role="img" aria-label={t('puncte de verificat')}></span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!readOnly && (
          <button type="button" className="text-button student-add" onClick={() => setAddOpen(true)}>
            <ActionIcon name="add-person" />
            {t('Adaugă elevi')}
          </button>
        )}
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
          readOnly={readOnly}
          onChanged={onChanged}
          onDeleted={() => setChosenId(null)}
        />
      )}
    </div>
  );
}

// The result of one paper for the student: published, not yet (with the link
// to copy), after the check, or no paper. The student page shows it too.
export function ResultCell({ grade, studentName }: { grade: ClassGrade | undefined; studentName: string }) {
  if (grade === undefined) return <span className="hint">{t('Nu a trimis lucrarea.')}</span>;
  if (grade.status !== 'graded') return <span className="hint">{uploadStatusLabel(grade.status)}</span>;
  if (!grade.resultsOpen && grade.flagCount > 0) return <span className="hint">{t('După verificare')}</span>;
  return (
    <>
      {grade.resultsOpen ? <span className="tag tag-ok">{t('Publicat')}</span> : <span className="hint">{t('Nepublicat')}</span>}
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
  readOnly,
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
  readOnly: boolean;
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
  const ces = useMutation({
    mutationFn: () => api.setStudentCes(student.id, !student.ces),
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
    if (window.confirm(t('Ștergi elevul {fullName} din clasă? Lucrările neterminate sau eșuate ale elevului se șterg și ele.', { fullName: student.fullName }))) {
      remove.mutate();
    }
  };

  return (
    <section className="student-detail" aria-labelledby="student-detail-name">
      <div className="student-detail-head">
        <div>
          <h2 id="student-detail-name">
            {student.fullName}
            {student.ces && (
              <>
                {' '}
                <CesTag />
              </>
            )}
            {!student.active && (
              <>
                {' '}
                <span className="tag">{t('a plecat din clasă')}</span>
              </>
            )}
          </h2>
          <p>
            {t('{displayClassName} · {countLabel} în {formatSchoolYear}', { displayClassName: displayClassName(className), countLabel: countLabel(papers, 'lucrare', 'lucrări'), formatSchoolYear: formatSchoolYear(schoolYear) })}
          </p>
          {student.ces && <p className="hint">{t('Primește varianta CES a testelor care au una.')}</p>}
        </div>
        {!readOnly && (
          <div className="student-detail-actions">
            <button type="button" className="text-button is-quiet" onClick={() => setRenameOpen(true)}>
              <ActionIcon name="edit" />
              {t('Redenumește')}
            </button>
            <button type="button" className="text-button is-quiet" disabled={ces.isPending} onClick={() => ces.mutate()}>
              <ActionIcon name={student.ces ? 'ces-off' : 'ces'} />
              {student.ces ? t('Scoate marcajul CES') : t('Marchează CES')}
            </button>
            <button
              type="button"
              className="text-button is-quiet"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate()}
            >
              <ActionIcon name={student.active ? 'leave' : 'back-in'} />
              {student.active ? t('A plecat din clasă') : t('Revine în clasă')}
            </button>
            {student.canDelete && (
              <button type="button" className="text-button is-danger" disabled={remove.isPending} onClick={askRemove}>
                <ActionIcon name="trash" />
                {t('Șterge')}
              </button>
            )}
          </div>
        )}
      </div>
      {toggle.error && <ErrorMessage error={toggle.error} />}
      {ces.error && <ErrorMessage error={ces.error} />}
      {remove.error && <ErrorMessage error={remove.error} />}
      {tests.length === 0 ? (
        <p className="hint student-detail-empty">{t('Clasa nu are încă teste.')}</p>
      ) : (
        <div className="table-wrap">
          <table className="student-results">
            <caption className="sr-only">{t('Testele lui {fullName}', { fullName: student.fullName })}</caption>
            <thead>
              <tr>
                <th scope="col">{t('Test')}</th>
                <th scope="col" className="num hide-phone">
                  {t('Punctaj')}
                </th>
                <th scope="col" className="num">
                  {t('Nota')}
                </th>
                <th scope="col">{t('Rezultatul elevului')}</th>
                <th scope="col">
                  <span className="sr-only">{t('Lucrarea')}</span>
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
                      <Link to={`/tests/${test.code}`}>{test.title}</Link>
                      <span>{test.startedAt === null ? t('ciornă') : formatDayMonth(test.startedAt)}</span>
                    </th>
                    <td className="num hide-phone">
                      {graded && grade.total !== null && grade.maxTotal !== null
                        ? `${formatPoints(grade.total)} / ${formatPoints(grade.maxTotal)}`
                        : '—'}
                    </td>
                    <td className="num">
                      {graded && grade.grade !== null ? (
                        <>
                          <GradeChip grade={grade.grade} />
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
                        <Link to={`/tests/${test.code}/papers/${grade.submissionId}`}>{t('Lucrarea')}</Link>
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
        <span>{t('Elevul vede rezultatul pe linkul lui, după ce îl publici.')}</span>
        <Link to={`/students/${student.id}`} state={{ fromClass: classId } satisfies StudentLinkState}>
          {t('Toate notele elevului, din toate clasele')}
        </Link>
      </p>
      {renameOpen && (
        <RenameDialog
          title={t('Redenumește {fullName}', { fullName: student.fullName })}
          label={t('Numele elevului')}
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

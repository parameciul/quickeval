import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { AdminApi } from '../api.ts';
import type { ClassGrade, StudentRow, TestSummary } from '../../../shared/api.ts';
import { MAX_NAMES_PER_REQUEST, parseStudentNames, studentNameKey } from '../../../shared/students.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { countLabel, formatDateTime, studentCountLabel, uploadStatusLabel } from '../../ui/format.ts';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { CopyResultLink } from '../testPage/ResultLinksTable.tsx';

type TabState = { kind: 'list' } | { kind: 'student'; studentId: number } | { kind: 'add' };

// "Elevi" tab of the class page: the students on the left, one student on the
// right (spec §9). "+ Adaugă elevi" and "Redenumește" are dialogs.
export function ClassStudents({
  api,
  classId,
  students,
  tests,
  grades,
  onChanged,
}: {
  api: AdminApi;
  classId: number;
  students: StudentRow[];
  tests: TestSummary[];
  grades: ClassGrade[];
  onChanged: () => Promise<void>;
}) {
  const [tab, setTab] = useState<TabState>({ kind: 'list' });
  const [search, setSearch] = useState('');
  const [editingStudent, setEditingStudent] = useState<StudentRow | null>(null);

  const visible = students.filter((student) =>
    student.fullName.toLowerCase().includes(search.toLowerCase()),
  );

  const gradeOf = (studentId: number, testCode: string) =>
    grades.find((grade) => grade.studentId === studentId && grade.testCode === testCode);

  const pointsWaiting = (studentId: number) =>
    grades.some((grade) => grade.studentId === studentId && grade.flagCount > 0);

  const toggleActive = (student: StudentRow) => {
    void api.setStudentActive(classId, student.id, !student.active).then(onChanged);
  };
  const removeStudent = (student: StudentRow) => {
    if (
      window.confirm(`Ștergi elevul ${student.fullName} din clasă? Lucrările neterminate sau eșuate ale elevului se șterg și ele.`)
    ) {
      void api.deleteStudent(classId, student.id).then(onChanged);
    }
  };
  if (tab.kind === 'student') {
    const student = students.find((s) => s.id === tab.studentId);
    if (!student) return <p>Se încarcă…</p>;
    return (
      <section className="student-card">
        <p className="back-link">
          <button type="button" className="button-quiet button-small" onClick={() => setTab({ kind: 'list' })}>
            ← Elevi
          </button>
        </p>
        <h1>{student.fullName}</h1>
        {!student.active && <span className="tag">a plecat din clasă</span>}
        <ul className="row-list">
          {tests.map((test) => {
            const grade = gradeOf(student.id, test.code);
            // The points as the paper earned them, once it is graded.
            const points =
              grade?.status === 'graded' && grade.total !== null && grade.maxTotal !== null
                ? `${formatPoints(grade.total)} / ${formatPoints(grade.maxTotal)}`
                : null;
            return (
              <li key={test.code} className="student-test">
                <span className="student-test-head">
                  <Link to={`/teste/${test.code}`}>{test.title}</Link>
                  {test.startedAt && <span>{formatDateTime(test.startedAt)}</span>}
                </span>
                {grade?.status === 'graded' && (
                  <span className="student-test-grade">
                    <b>{points ?? '—'}</b>
                    {grade.grade !== null && (
                      <>
                        {'· nota '}
                        <b>{formatPoints(grade.grade)}</b>
                      </>
                    )}
                    {grade.flagCount > 0 && (
                      <span className="student-test-flags">
                        <span className="flag-dot" aria-hidden="true" />{' '}
                        {countLabel(grade.flagCount, 'punct de verificat', 'puncte de verificat')}
                      </span>
                    )}
                  </span>
                )}
                <span className="student-test-result">
                  {grade === undefined || grade.status === 'uploading' || grade.status === 'failed' ? (
                    <span className="hint">
                      {grade === undefined ? 'Nu a trimis lucrarea' : uploadStatusLabel(grade.status)}
                    </span>
                  ) : grade.status !== 'graded' ? (
                    <span className="hint">După verificare</span>
                  ) : grade.resultsOpen ? (
                    <span className="tag tag-ok">Publicat</span>
                  ) : (
                    <>
                      <span className="hint">Nepublicat</span>
                      {grade.startedAt !== null && (
                        <CopyResultLink
                          key={grade.submissionId}
                          submissionId={grade.submissionId}
                          startedAt={grade.startedAt}
                          resultToken={grade.resultToken}
                          studentName={student.fullName}
                        />
                      )}
                    </>
                  )}
                </span>
                {grade !== undefined && (
                  <Link className="button-quiet button-small" to={`/teste/${test.code}/elevi/${grade.submissionId}`}>
                    Vezi lucrarea
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
        <p className="hint">
          <Link to={`/elevi/${student.id}`}>Toate notele elevului, din toate clasele</Link>
        </p>
        <div className="card-actions">
          {editingStudent?.id === student.id ? (
            <RenameStudentForm
              api={api}
              student={student}
              onDone={() => {
                setEditingStudent(null);
                void onChanged();
              }}
            />
          ) : (
            <button type="button" className="button-quiet button-small" onClick={() => setEditingStudent(student)}>
              Redenumește
            </button>
          )}
          <button type="button" className="button-quiet button-small" onClick={() => toggleActive(student)}>
            {student.active ? 'A plecat din clasă' : 'Revine în clasă'}
          </button>
          {student.canDelete && (
            <button type="button" className="button-quiet button-small" onClick={() => removeStudent(student)}>
              Șterge
            </button>
          )}
        </div>
      </section>
    );
  }

  if (tab.kind === 'add') {
    return (
      <section>
        <AddStudentsDialog
          api={api}
          classId={classId}
          students={students}
          onDone={onChanged}
          onClose={() => setTab({ kind: 'list' })}
        />
      </section>
    );
  }

  // List of students.
  return (
    <section>
      <h1>Elevi ({studentCountLabel(students.length)})</h1>
      <div className="students-search">
        <label htmlFor="elev-search" className="sr-only">Caută elev</label>
        <input
          id="elev-search"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Caută elev"
        />
        <button className="button" type="button" onClick={() => setTab({ kind: 'add' })}>
          + Adaugă elevi
        </button>
      </div>
      {visible.length === 0 ? (
        <p className="hint">Nu s-a găsit niciun elev.</p>
      ) : (
        <ol className="row-list">
          {visible.map((student) => (
            <li key={student.id} className={student.active ? undefined : 'is-muted'}>
              <button
                type="button"
                className="student-name"
                aria-label={student.fullName}
                onClick={() => setTab({ kind: 'student', studentId: student.id })}
              >
                {student.fullName}
                {!student.active && <span className="tag">a plecat</span>}
                {pointsWaiting(student.id) && <span className="flag-dot" aria-label="puncte de verificat"></span>}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// The names of the paste that the class already has (a student who left counts)
// or that the paste holds twice, each named once as typed. The server stays the
// truth: this only warns early.
function duplicateNames(names: string[], students: StudentRow[]): { inClass: string[]; twice: string[] } {
  const inClassKeys = new Set(students.map((student) => studentNameKey(student.fullName)));
  const seen = new Set<string>();
  const twiceKeys = new Set<string>();
  const inClass: string[] = [];
  const twice: string[] = [];
  for (const name of names) {
    const key = studentNameKey(name);
    if (inClassKeys.has(key)) {
      if (!seen.has(key)) inClass.push(name);
    } else if (seen.has(key)) {
      if (!twiceKeys.has(key)) twice.push(name);
      twiceKeys.add(key);
    }
    seen.add(key);
  }
  return { inClass, twice };
}

// "Redenumește elevul" dialog of one student.
function RenameStudentForm({
  api,
  student,
  onDone,
}: {
  api: AdminApi;
  student: StudentRow;
  onDone: () => void;
}) {
  const [fullName, setFullName] = useState(student.fullName);
  const [saving, setSaving] = useState(false);
  const mutation = useMutation({
    mutationFn: (next: string) => api.renameStudent(student.id, next),
    onSuccess: () => {
      setSaving(false);
      onDone();
    },
  });

  return (
    <div className="dialog">
      <p>Redenumește {student.fullName}</p>
      <form
        className="form-row"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setSaving(true);
          mutation.mutate(fullName);
        }}
      >
        <label htmlFor={`rename-student-${student.id}`} className="sr-only">
          Nume nou
        </label>
        <input
          id={`rename-student-${student.id}`}
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          maxLength={80}
          required
          autoFocus
        />
        <button type="submit" className="button" disabled={saving}>
          Salvează
        </button>
        <button type="button" className="button-quiet button-small" onClick={onDone}>
          Renunță
        </button>
        {mutation.error && <ErrorMessage error={mutation.error} />}
      </form>
    </div>
  );
}

// "Adaugă elevi" dialog: the names, one per line, added in a single step.
function AddStudentsDialog({
  api,
  classId,
  students,
  onDone,
  onClose,
}: {
  api: AdminApi;
  classId: number;
  students: StudentRow[];
  onDone: () => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const names = parseStudentNames(text);
  const tooMany = names.length > MAX_NAMES_PER_REQUEST;
  const { inClass, twice } = duplicateNames(names, students);
  const hasDuplicates = inClass.length > 0 || twice.length > 0;
  const [saving, setSaving] = useState(false);
  const mutation = useMutation({
    mutationFn: () => api.addStudents(classId, names),
    onSuccess: () => {
      setSaving(false);
      setText('');
      void onDone();
    },
  });

  return (
    <div className="dialog">
      <p>Adaugă elevi</p>
      <label htmlFor="add-students-names" className="sr-only">Numele elevilor, câte unul pe rând</label>
      <textarea
        id="add-students-names"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Pop Ion\nIonescu Ana"
      />
      {tooMany && <p className="alert" role="alert">Adaugă cel mult {MAX_NAMES_PER_REQUEST} de nume odată.</p>}
      {inClass.length > 0 && <p className="alert" role="alert">Sunt deja în clasă: {inClass.join(', ')}.</p>}
      {twice.length > 0 && <p className="alert" role="alert">Apar de două ori: {twice.join(', ')}.</p>}
      <form
        className="form-stack"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setSaving(true);
          mutation.mutate();
        }}
      >
        <button type="submit" className="button" disabled={names.length === 0 || tooMany || hasDuplicates || saving}>
          {names.length > 0 ? `Adaugă ${studentCountLabel(names.length)}` : 'Adaugă elevii'}
        </button>
      </form>
      <button type="button" className="button-quiet button-small" onClick={onClose}>Renunță</button>
      {mutation.error && <ErrorMessage error={mutation.error} />}
    </div>
  );
}

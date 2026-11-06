import { useState } from 'react';
import { Link } from 'react-router';
import type { AdminApi } from '../api.ts';
import type { ClassGrade, StudentRow, TestSummary } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatDateTime, studentCountLabel, uploadStatusLabel } from '../../ui/format.ts';

type TabState = { kind: 'list' } | { kind: 'student'; studentId: number } | { kind: 'add' };

// "Elevi" tab of the class page: the students on the left, one student on the
// right (spec §9). "+ Adaugă elevi" is a dialog.
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
            return (
              <li key={test.code} className="student-test">
                <span className="student-test-head">
                  <Link to={`/teste/${test.code}`}>{test.title}</Link>
                  {test.startedAt && <span>{formatDateTime(test.startedAt)}</span>}
                </span>
                {grade ? (
                  <span className="student-test-grade">
                    {grade.status === 'graded'
                      ? `${formatPoints(grade.grade ?? 0)} / ${formatPoints(grade.maxTotal ?? 10)}${
                          grade.flagCount > 0 ? ' · 1 punct de verificat' : ''
                        }`
                      : uploadStatusLabel(grade.status)}
                    {grade.resultsOpen ? ' · Publicat' : grade.resultToken ? ' · Nepublicat' : ''}
                  </span>
                ) : (
                  <span className="student-test-grade">Nu a trimis lucrarea</span>
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
            <RenameStudentForm student={student} onDone={onChanged} />
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
        <h1>Adaugă elevi</h1>
        <AddStudentsDialog classId={classId} students={students} onDone={onChanged} onClose={() => setTab({ kind: 'list' })} />
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

function RenameStudentForm({ student, onDone }: { student: StudentRow; onDone: () => Promise<void> }) {
  return (
    <div className="dialog">
      <p>Redenumește {student.fullName}</p>
      <button type="button" onClick={() => void onDone()}>Salvează</button>
    </div>
  );
}

function AddStudentsDialog({
  classId,
  students,
  onDone,
  onClose,
}: {
  classId: number;
  students: StudentRow[];
  onDone: () => Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="dialog">
      <p>Adaugă elevi în clasa {classId} ({students.length} în clasă)</p>
      <button type="button" onClick={() => void onDone()}>Salvează</button>
      <button type="button" onClick={onClose}>Renunță</button>
    </div>
  );
}

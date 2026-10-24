import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import type { StudentRow } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { MAX_NAMES_PER_REQUEST, parseStudentNames, studentNameKey } from '../../../shared/students.ts';
import { studentCountLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

export function ClassStudentsPage() {
  const classId = parsePositiveId(useParams().id);
  if (classId === null) return <NotFoundPage />;
  // A new key for each class: a draft or an open form never carries over to another class.
  return <ClassStudents key={classId} classId={classId} />;
}

function ClassStudents({ classId }: { classId: number }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['class', classId], queryFn: () => api.getClass(classId) });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['class', classId] });
    await queryClient.invalidateQueries({ queryKey: ['classes'] });
  };

  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.error) return <ErrorMessage error={detail.error} />;

  const { class: info, students } = detail.data;
  return (
    <section>
      <p className="back-link">
        <Link to={`/clase/${classId}`}>← {displayClassName(info.name)}</Link>
      </p>
      <h1>
        Elevii clasei {info.name} · {formatSchoolYear(info.schoolYear)}
      </h1>

      <h2>Adaugă elevi</h2>
      <AddStudentsForm classId={classId} students={students} onDone={refresh} />

      <h2>Elevi ({studentCountLabel(info.studentCount)})</h2>
      {students.length === 0 ? (
        <p className="hint">Clasa nu are încă elevi. Adaugă-i mai sus.</p>
      ) : (
        <ol className="row-list">
          {students.map((student) => (
            <StudentItem key={student.id} classId={classId} student={student} onChanged={refresh} />
          ))}
        </ol>
      )}
    </section>
  );
}

function StudentItem({ classId, student, onChanged }: { classId: number; student: StudentRow; onChanged: () => Promise<void> }) {
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(student.fullName);

  const toggle = useMutation({
    mutationFn: () => api.setStudentActive(classId, student.id, !student.active),
    onSuccess: onChanged,
  });
  const rename = useMutation({
    mutationFn: () => api.renameStudent(student.id, fullName),
    onSuccess: async () => {
      setEditing(false);
      await onChanged();
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteStudent(classId, student.id),
    onSuccess: onChanged,
  });

  if (editing) {
    return (
      <li>
        <form
          className="form-row"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            rename.mutate();
          }}
        >
          <label className="sr-only" htmlFor={`student-${student.id}`}>
            Numele elevului
          </label>
          <input id={`student-${student.id}`} type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={80} required />
          <button className="button button-small" type="submit" disabled={rename.isPending}>
            Salvează
          </button>
          <button type="button" className="button-quiet button-small" onClick={() => setEditing(false)}>
            Renunță
          </button>
        </form>
        {rename.error && <ErrorMessage error={rename.error} />}
      </li>
    );
  }

  return (
    <li className={student.active ? undefined : 'is-muted'}>
      <Link className="row-name" to={`/elevi/${student.id}`}>
        {student.fullName}
      </Link>
      {!student.active && <span className="tag">a plecat</span>}
      <button type="button" className="button-quiet button-small" onClick={() => setEditing(true)}>
        Redenumește
      </button>
      <button type="button" className="button-quiet button-small" onClick={() => toggle.mutate()} disabled={toggle.isPending}>
        {student.active ? 'A plecat' : 'Revine în clasă'}
      </button>
      {student.canDelete && (
        <button
          type="button"
          className="button-quiet button-small"
          onClick={() => {
            if (window.confirm(`Ștergi elevul ${student.fullName} din clasă?`)) remove.mutate();
          }}
          disabled={remove.isPending}
        >
          Șterge
        </button>
      )}
      {toggle.error && <ErrorMessage error={toggle.error} />}
      {remove.error && <ErrorMessage error={remove.error} />}
    </li>
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
      inClass.push(name);
    } else if (seen.has(key)) {
      if (!twiceKeys.has(key)) twice.push(name);
      twiceKeys.add(key);
    }
    seen.add(key);
  }
  return { inClass, twice };
}

function AddStudentsForm({ classId, students, onDone }: { classId: number; students: StudentRow[]; onDone: () => Promise<void> }) {
  const api = useApi();
  const [text, setText] = useState('');
  const names = parseStudentNames(text);
  const tooMany = names.length > MAX_NAMES_PER_REQUEST;
  const { inClass, twice } = duplicateNames(names, students);
  const hasDuplicates = inClass.length > 0 || twice.length > 0;
  const add = useMutation({
    mutationFn: () => api.addStudents(classId, names),
    onSuccess: async () => {
      setText('');
      await onDone();
    },
  });

  return (
    <form
      className="form-stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        add.mutate();
      }}
    >
      <label htmlFor="student-names">Numele elevilor, câte unul pe rând</label>
      <p className="hint" id="student-names-hint">
        Poți lipi lista din catalog. Numerele de la începutul rândurilor se șterg singure.
      </p>
      <textarea
        id="student-names"
        aria-describedby="student-names-hint"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {tooMany && (
        <p className="alert" role="alert">
          Adaugă cel mult {MAX_NAMES_PER_REQUEST} de nume odată.
        </p>
      )}
      {inClass.length > 0 && (
        <p className="alert" role="alert">
          Sunt deja în clasă: {inClass.join(', ')}.
        </p>
      )}
      {twice.length > 0 && (
        <p className="alert" role="alert">
          Apar de două ori: {twice.join(', ')}.
        </p>
      )}
      <span>
        <button className="button" type="submit" disabled={names.length === 0 || tooMany || hasDuplicates || add.isPending}>
          {names.length > 0 ? `Adaugă ${studentCountLabel(names.length)}` : 'Adaugă elevii'}
        </button>
      </span>
      {add.error && <ErrorMessage error={add.error} />}
    </form>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import type { StudentRow } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { MAX_NAMES_PER_REQUEST, parseStudentNames } from '../../../shared/students.ts';
import { studentCountLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

export function ClassPage() {
  const classId = Number(useParams().id);
  if (!Number.isSafeInteger(classId) || classId <= 0) return <NotFoundPage />;
  return <ClassDetails classId={classId} />;
}

function ClassDetails({ classId }: { classId: number }) {
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
      <p>
        <Link to="/clase">← Toate clasele</Link>
      </p>
      <h1>
        {displayClassName(info.name)} · {formatSchoolYear(info.schoolYear)}
      </h1>
      <RenameClassForm classId={classId} currentName={info.name} onDone={refresh} />

      <h2>Elevi ({studentCountLabel(info.studentCount)})</h2>
      {students.length === 0 ? (
        <p className="hint">Clasa nu are încă elevi. Adaugă-i mai jos.</p>
      ) : (
        <ol className="row-list">
          {students.map((student) => (
            <StudentItem key={student.id} classId={classId} student={student} onChanged={refresh} />
          ))}
        </ol>
      )}

      <h2>Adaugă elevi</h2>
      <AddStudentsForm classId={classId} onDone={refresh} />
    </section>
  );
}

function RenameClassForm({ classId, currentName, onDone }: { classId: number; currentName: string; onDone: () => Promise<void> }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const rename = useMutation({
    mutationFn: () => api.updateClass(classId, { name }),
    onSuccess: async () => {
      setOpen(false);
      await onDone();
    },
  });

  if (!open) {
    return (
      <button type="button" className="button-quiet button-small" onClick={() => setOpen(true)}>
        Redenumește clasa
      </button>
    );
  }
  return (
    <form
      className="form-row"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        rename.mutate();
      }}
    >
      <label htmlFor="rename-class">Nume nou</label>
      <input id="rename-class" type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={20} required />
      <button className="button button-small" type="submit" disabled={rename.isPending}>
        Salvează
      </button>
      <button type="button" className="button-quiet button-small" onClick={() => setOpen(false)}>
        Renunță
      </button>
      {rename.error && <ErrorMessage error={rename.error} />}
    </form>
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
      <span className="row-name">{student.fullName}</span>
      {!student.active && <span className="tag">a plecat</span>}
      <button type="button" className="button-quiet button-small" onClick={() => setEditing(true)}>
        Redenumește
      </button>
      <button type="button" className="button-quiet button-small" onClick={() => toggle.mutate()} disabled={toggle.isPending}>
        {student.active ? 'A plecat' : 'Revine în clasă'}
      </button>
      {toggle.error && <ErrorMessage error={toggle.error} />}
    </li>
  );
}

function AddStudentsForm({ classId, onDone }: { classId: number; onDone: () => Promise<void> }) {
  const api = useApi();
  const [text, setText] = useState('');
  const names = parseStudentNames(text);
  const tooMany = names.length > MAX_NAMES_PER_REQUEST;
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
      <span>
        <button className="button" type="submit" disabled={names.length === 0 || tooMany || add.isPending}>
          {names.length > 0 ? `Adaugă ${studentCountLabel(names.length)}` : 'Adaugă elevii'}
        </button>
      </span>
      {add.error && <ErrorMessage error={add.error} />}
    </form>
  );
}

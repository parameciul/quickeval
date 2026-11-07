import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import type { StudentRow } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { MAX_NAMES_PER_REQUEST, parseStudentNames, studentNameKey } from '../../../shared/students.ts';
import { studentCountLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { Modal } from '../Modal.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';

// The names of the paste that the class already has (a student who left counts)
// or that the paste holds twice, each named once as typed. The server stays the
// truth: this only warns early.
export function duplicateNames(names: string[], students: StudentRow[]): { inClass: string[]; twice: string[] } {
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

// The field for the names, one per line, with its early warnings. It returns
// the parsed names and whether they can be sent.
function useNamesField(students: StudentRow[]) {
  const [text, setText] = useState('');
  const names = parseStudentNames(text);
  const tooMany = names.length > MAX_NAMES_PER_REQUEST;
  const { inClass, twice } = duplicateNames(names, students);
  const warnings = (
    <>
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
    </>
  );
  const blocked = tooMany || inClass.length > 0 || twice.length > 0;
  return { text, setText, names, blocked, warnings };
}

// "Clasă nouă": the name and the students, one per line, in one step (spec §9).
// The students may come later. A class made before the students failed is not
// made twice: a second try only adds the students.
export function NewClassDialog({ onClose }: { onClose(): void }) {
  const api = useApi();
  const { year } = useSchoolYear();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [createdId, setCreatedId] = useState<number | null>(null);
  const field = useNamesField([]);
  const create = useMutation({
    mutationFn: async () => {
      let id = createdId;
      if (id === null) {
        id = (await api.createClass({ name, schoolYear: year })).id;
        setCreatedId(id);
      }
      if (field.names.length > 0) await api.addStudents(id, field.names);
      return id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['classes'] });
      onClose();
      navigate(`/clase/${id}`);
    },
  });
  return (
    <Modal title="Clasă nouă" onClose={onClose}>
      <form
        className="modal-body"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div className="modal-field">
          <label htmlFor="new-class-name">Numele clasei</label>
          <input
            id="new-class-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={8}
            placeholder="de exemplu 6E2"
            required
            disabled={createdId !== null}
          />
        </div>
        <div className="modal-field">
          <label htmlFor="new-class-students">Elevii, câte unul pe rând</label>
          <textarea
            id="new-class-students"
            rows={7}
            value={field.text}
            onChange={(event) => field.setText(event.target.value)}
            placeholder={'Popescu Ana\nIonescu Mihai'}
          />
          <span className="hint">Poți lipi lista din catalog. Poți adăuga elevi și mai târziu.</span>
        </div>
        {field.warnings}
        {create.error && <ErrorMessage error={create.error} />}
        <button type="submit" className="button modal-submit" disabled={field.blocked || create.isPending}>
          Adaugă clasa
        </button>
      </form>
    </Modal>
  );
}

// "Adaugă elevi": the names, one per line, added in one step.
export function AddStudentsDialog({
  classId,
  className,
  students,
  onAdded,
  onClose,
}: {
  classId: number;
  className: string;
  students: StudentRow[];
  onAdded: () => Promise<void>;
  onClose(): void;
}) {
  const api = useApi();
  const field = useNamesField(students);
  const add = useMutation({
    mutationFn: () => api.addStudents(classId, field.names),
    onSuccess: async () => {
      await onAdded();
      onClose();
    },
  });
  return (
    <Modal title={`Adaugă elevi în ${displayClassName(className)}`} onClose={onClose}>
      <form
        className="modal-body"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          add.mutate();
        }}
      >
        <div className="modal-field">
          <label htmlFor="add-students-names">Numele elevilor, câte unul pe rând</label>
          <textarea
            id="add-students-names"
            rows={7}
            value={field.text}
            onChange={(event) => field.setText(event.target.value)}
            placeholder={'Popescu Ana\nIonescu Mihai'}
          />
          <span className="hint">Poți lipi lista din catalog.</span>
        </div>
        {field.warnings}
        {add.error && <ErrorMessage error={add.error} />}
        <button
          type="submit"
          className="button modal-submit"
          disabled={field.names.length === 0 || field.blocked || add.isPending}
        >
          {field.names.length > 0 ? `Adaugă ${studentCountLabel(field.names.length)}` : 'Adaugă elevii'}
        </button>
      </form>
    </Modal>
  );
}

// A dialog with one name to change: the class or a student.
export function RenameDialog({
  title,
  label,
  initial,
  maxLength,
  save,
  onSaved,
  onClose,
  returnFocus,
}: {
  title: string;
  label: string;
  initial: string;
  maxLength: number;
  save: (name: string) => Promise<unknown>;
  onSaved: () => Promise<void>;
  onClose(): void;
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const [name, setName] = useState(initial);
  const rename = useMutation({
    mutationFn: () => save(name),
    onSuccess: async () => {
      await onSaved();
      onClose();
    },
  });
  return (
    <Modal title={title} onClose={onClose} returnFocus={returnFocus}>
      <form
        className="modal-body"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          rename.mutate();
        }}
      >
        <div className="modal-field">
          <label htmlFor="rename-field">{label}</label>
          <input
            id="rename-field"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={maxLength}
            required
          />
        </div>
        {rename.error && <ErrorMessage error={rename.error} />}
        <button type="submit" className="button modal-submit" disabled={rename.isPending}>
          Salvează
        </button>
      </form>
    </Modal>
  );
}

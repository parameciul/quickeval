import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { displayClassName } from '../../../shared/classes.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { studentCountLabel } from '../../ui/format.ts';
import { GradesTable } from '../classPage/GradesTable.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

export function ClassPage() {
  const classId = parsePositiveId(useParams().id);
  if (classId === null) return <NotFoundPage />;
  // A new key for each class: a draft or an open form never carries over to another class.
  return <ClassDetails key={classId} classId={classId} />;
}

function ClassDetails({ classId }: { classId: number }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const detail = useQuery({ queryKey: ['class', classId], queryFn: () => api.getClass(classId) });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['class', classId] });
    await queryClient.invalidateQueries({ queryKey: ['classes'] });
  };

  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.error) return <ErrorMessage error={detail.error} />;

  const { class: info, students, tests, grades } = detail.data;
  const archivedCount = tests.filter((test) => test.archived).length;
  return (
    <section>
      <p className="back-link">
        <Link to="/clase">← Toate clasele</Link>
      </p>
      <h1>
        {displayClassName(info.name)} · {formatSchoolYear(info.schoolYear)}
      </h1>
      <div className="head-actions">
        <RenameClassForm classId={classId} currentName={info.name} onDone={refresh} />
        <Link className="button-quiet button-small" to={`/clase/${classId}/elevi`}>
          Elevii clasei
        </Link>
        {!info.archived && (
          <Link className="button button-small" to={`/teste/nou?clasa=${classId}`}>
            Test nou pentru această clasă
          </Link>
        )}
      </div>

      <h2>Note ({studentCountLabel(info.studentCount)})</h2>
      <GradesTable classId={classId} students={students} tests={tests} grades={grades} showArchived={showArchived} />
      {archivedCount > 0 && (
        <p>
          <button type="button" className="button-quiet button-small" aria-pressed={showArchived} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Ascunde testele arhivate' : `Arată și testele arhivate (${archivedCount})`}
          </button>
        </p>
      )}
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

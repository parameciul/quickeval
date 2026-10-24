import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { displayClassName } from '../../../shared/classes.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { StatusChip } from '../StatusChip.tsx';
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
  const detail = useQuery({ queryKey: ['class', classId], queryFn: () => api.getClass(classId) });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['class', classId] });
    await queryClient.invalidateQueries({ queryKey: ['classes'] });
  };

  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.error) return <ErrorMessage error={detail.error} />;

  const { class: info, tests } = detail.data;
  return (
    <section>
      <p className="back-link">
        <Link to="/clase">← Toate clasele</Link>
      </p>
      <h1>
        {displayClassName(info.name)} · {formatSchoolYear(info.schoolYear)}
      </h1>
      <div className="form-row">
        <RenameClassForm classId={classId} currentName={info.name} onDone={refresh} />
        <Link className="button-quiet button-small" to={`/clase/${classId}/elevi`}>
          Elevii clasei
        </Link>
      </div>

      <h2>Teste</h2>
      {tests.length === 0 ? (
        <p className="hint">Clasa nu are încă teste.</p>
      ) : (
        <ol className="row-list">
          {tests.map((test) => (
            <li key={test.code}>
              <Link className="row-name" to={`/teste/${test.code}`}>
                {test.code} · {test.title}
              </Link>
              <StatusChip status={test.status} />
            </li>
          ))}
        </ol>
      )}
      {!info.archived && (
        <p>
          <Link to={`/teste/nou?clasa=${classId}`}>Test nou pentru această clasă</Link>
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

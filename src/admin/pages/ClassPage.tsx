import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { displayClassName } from '../../../shared/classes.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { studentCountLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';
import { GradesTable } from '../classPage/GradesTable.tsx';
import { ClassStudents } from '../classPage/ClassStudents.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';
import type { AdminApi } from '../api.ts';

export function ClassPage() {
  const classId = parsePositiveId(useParams().id);
  if (classId === null) return <NotFoundPage />;
  // A new key for each class: a draft or an open form never carries over to another class.
  return <ClassDetails key={classId} classId={classId} />;
}

function ClassDetails({ classId }: { classId: number }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'note' | 'elevi'>('note');
  const detail = useQuery({ queryKey: ['class', classId], queryFn: () => api.getClass(classId) });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['class', classId] });
    await queryClient.invalidateQueries({ queryKey: ['classes'] });
  };

  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.error) return <ErrorMessage error={detail.error} />;

  const { class: info, students, tests, grades } = detail.data;
  const archivedCount = tests.filter((test) => test.archived).length;
  const waiting = new Set(tests.filter((test) => test.flagCount > 0).map((test) => test.classId));
  return (
    <section>
      <p className="head-line">
        <span className="head-name">{displayClassName(info.name)}</span>
        <ClassSwitcher api={api} classId={classId} waiting={waiting} onDone={refresh} />
        <span className="head-facts">
          {studentCountLabel(students.length)} · {tests.length} teste · anul școlar {formatSchoolYear(info.schoolYear)}
        </span>
        {!info.archived && (
          <Link className="button button-small" to={`/teste/nou?clasa=${classId}`}>
            Test nou pentru această clasă
          </Link>
        )}
        <ClassMenu api={api} classId={classId} archived={info.archived} onDone={refresh} />
      </p>

      <nav className="class-tabs">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'note'}
          className={tab === 'note' ? 'tab tab-active' : 'tab'}
          onClick={() => setTab('note')}
        >
          Note și teste
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'elevi'}
          className={tab === 'elevi' ? 'tab tab-active' : 'tab'}
          onClick={() => setTab('elevi')}
        >
          Elevi
        </button>
      </nav>

      {tab === 'note' ? (
        <GradesTable classId={classId} students={students} tests={tests} grades={grades} showArchived={false} />
      ) : (
        <ClassStudents api={api} classId={classId} students={students} tests={tests} grades={grades} onChanged={refresh} />
      )}

      {archivedCount > 0 && (
        <button type="button" className="button-quiet button-small" aria-pressed={false} onClick={() => {}}>
          Arată și testele arhivate ({archivedCount})
        </button>
      )}
    </section>
  );
}

// The menu beside the name: switch to another class of the year (a dot marks a
// class whose test waits on the teacher), or start a new one.
function ClassSwitcher({
  api,
  classId,
  waiting,
  onDone,
}: {
  api: AdminApi;
  classId: number;
  waiting: Set<number>;
  onDone: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const { year } = useSchoolYear();
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });
  if (classes.isPending) return null;
  const other = (classes.data ?? []).filter((item) => item.id !== classId && !item.archived);
  return (
    <span className="head-switch">
      <button
        type="button"
        className="button-quiet button-small"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(!open)}
      >
        Schimbă clasa ˅
      </button>
      {open && (
        <div className="head-switch-list">
          {other.map((item) => (
            <Link
              key={item.id}
              className="head-switch-item"
              to={`/clase/${item.id}`}
              onClick={onDone}
              aria-current="false"
            >
              {displayClassName(item.name)}
              {waiting.has(item.id) && <span className="flag-dot" aria-label="puncte de verificat"></span>}
            </Link>
          ))}
          <Link className="head-switch-item head-switch-new" to="/clase" onClick={onDone}>
            + Clasă nouă
          </Link>
        </div>
      )}
    </span>
  );
}

// "Redenumește clasa" and "Arhivează clasa".
function ClassMenu({
  api,
  classId,
  archived,
  onDone,
}: {
  api: AdminApi;
  classId: number;
  archived: boolean;
  onDone: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const archive = useMutation({
    mutationFn: () => api.updateClass(classId, { archived: !archived }),
    onSuccess: async () => {
      await onDone();
    },
  });
  return (
    <span className="head-menu">
      {!open && (
        <button type="button" className="button-quiet button-small" aria-haspopup="menu" onClick={() => setOpen(true)}>
          ⋯
        </button>
      )}
      {open && (
        <div className="head-menu-list">
          <button type="button" className="menu-item" onClick={() => setOpen(true)}>
            Redenumește clasa
          </button>
          <button type="button" className="menu-item" onClick={() => archive.mutate()}>
            {archived ? 'Scoate din arhivă' : 'Arhivează clasa'}
          </button>
        </div>
      )}
    </span>
  );
}

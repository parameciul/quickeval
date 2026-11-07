import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { displayClassName } from '../../../shared/classes.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { countLabel, studentCountLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';
import { todoOf } from '../shell/todo.ts';
import { GradesTable } from '../classPage/GradesTable.tsx';
import { ClassStudents } from '../classPage/ClassStudents.tsx';
import { ClassTests } from '../classPage/ClassTests.tsx';
import { NewClassDialog, RenameDialog } from '../classPage/ClassDialogs.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';
import type { AdminApi } from '../api.ts';

// The state a link passes to open "Clasă nouă" on arrival (the panel "Clasele
// tale" and the empty /clase page).
export type NewClassState = { newClass?: boolean } | null;

export function ClassPage() {
  const classId = parsePositiveId(useParams().id);
  if (classId === null) return <NotFoundPage />;
  // A new key for each class: a draft or an open form never carries over to another class.
  return <ClassDetails key={classId} classId={classId} />;
}

function testCountLabel(count: number): string {
  return count === 0 ? 'niciun test' : countLabel(count, 'test', 'teste');
}

function ClassDetails({ classId }: { classId: number }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'note' | 'elevi'>('note');
  const [showArchived, setShowArchived] = useState(false);
  const [newClassOpen, setNewClassOpen] = useState(() => (location.state as NewClassState)?.newClass === true);
  const detail = useQuery({ queryKey: ['class', classId], queryFn: () => api.getClass(classId) });
  // Remember which class the teacher opened last, so /clase reopens it.
  useEffect(() => {
    localStorage.setItem('quickeval:lastClass', String(classId));
  }, [classId]);
  // "Clasă nouă" from a link opens once: Back or a reload does not open it again.
  useEffect(() => {
    if ((location.state as NewClassState)?.newClass) navigate('.', { replace: true, state: null });
  }, [location.state, navigate]);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['class', classId] });
    await queryClient.invalidateQueries({ queryKey: ['classes'] });
  };

  const newClass = newClassOpen && <NewClassDialog onClose={() => setNewClassOpen(false)} />;
  if (detail.isPending) return <p>Se încarcă…{newClass}</p>;
  if (detail.error) return <ErrorMessage error={detail.error} />;

  const { class: info, students, tests, grades } = detail.data;
  const activeTests = tests.filter((test) => !test.archived).length;
  return (
    <section className="class-page">
      <div className="class-head">
        <div className="class-head-main">
          <h1>{displayClassName(info.name)}</h1>
          {info.archived && <span className="tag">Arhivată</span>}
          <ClassSwitcher api={api} classId={classId} onNewClass={() => setNewClassOpen(true)} />
          <p className="class-head-facts">
            {studentCountLabel(students.length)} · {testCountLabel(activeTests)} · anul școlar{' '}
            {formatSchoolYear(info.schoolYear)}
          </p>
        </div>
        <div className="class-head-actions">
          {!info.archived && (
            <Link className="button" to={`/teste/nou?clasa=${classId}`}>
              Test nou pentru această clasă
            </Link>
          )}
          <ClassMenu api={api} classId={classId} name={info.name} archived={info.archived} onDone={refresh} />
        </div>
      </div>

      <div className="class-tabs" role="tablist" aria-label="Ce vezi">
        <button
          type="button"
          role="tab"
          id="class-tab-note"
          aria-selected={tab === 'note'}
          aria-controls="class-panel"
          className="class-tab"
          onClick={() => setTab('note')}
        >
          Note și teste
        </button>
        <button
          type="button"
          role="tab"
          id="class-tab-elevi"
          aria-selected={tab === 'elevi'}
          aria-controls="class-panel"
          className="class-tab"
          onClick={() => setTab('elevi')}
        >
          Elevi <span className="class-tab-count">{students.length}</span>
        </button>
      </div>

      <div id="class-panel" role="tabpanel" aria-labelledby={tab === 'note' ? 'class-tab-note' : 'class-tab-elevi'}>
        {tab === 'note' ? (
          <div className="class-notes">
            <GradesTable
              students={students}
              tests={tests}
              grades={grades}
              showArchived={showArchived}
              onShowStudents={() => setTab('elevi')}
            />
            <ClassTests
              tests={tests}
              schoolYear={info.schoolYear}
              showArchived={showArchived}
              onShowArchived={setShowArchived}
              onChanged={refresh}
            />
          </div>
        ) : (
          <ClassStudents
            api={api}
            classId={classId}
            className={info.name}
            schoolYear={info.schoolYear}
            students={students}
            tests={tests}
            grades={grades}
            onChanged={refresh}
          />
        )}
      </div>
      {newClass}
    </section>
  );
}

// A small menu of the top line (the classes, or "⋯") closes on Esc, on a click
// outside it, and when it runs its action; Esc gives the focus back to its
// button. It takes Esc before an open panel (capture), as the account menu does.
function useSmallMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (box.current?.contains(document.activeElement)) button.current?.focus();
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return { open, setOpen, box, button };
}

function IconChevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDots() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3.5" cy="8" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="12.5" cy="8" r="1.4" />
    </svg>
  );
}

// The menu beside the name: switch to another class of the year (a dot marks a
// class whose test waits on the teacher), or start a new one.
function ClassSwitcher({ api, classId, onNewClass }: { api: AdminApi; classId: number; onNewClass(): void }) {
  const { open, setOpen, box, button } = useSmallMenu();
  const { year } = useSchoolYear();
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });
  // The tests of the year, as the shell reads them, so the dots speak of every
  // class: one whose test waits on the teacher ("De făcut") is marked.
  const tests = useQuery({ queryKey: ['tests', year], queryFn: () => api.listTests(year) });
  const waiting = new Set((tests.data ?? []).filter((test) => todoOf(test) !== null).map((test) => test.classId));
  const list = (classes.data ?? []).filter((item) => !item.archived);
  return (
    <div className="class-switch" ref={box}>
      <button
        ref={button}
        type="button"
        className="class-switch-button"
        aria-expanded={open}
        aria-controls={open ? 'class-switch-menu' : undefined}
        onClick={() => setOpen(!open)}
      >
        Schimbă clasa
        <IconChevron />
      </button>
      {open && (
        <div className="class-menu class-switch-menu" id="class-switch-menu">
          {list.map((item) => (
            <Link
              key={item.id}
              className="class-menu-item"
              to={`/clase/${item.id}`}
              aria-current={item.id === classId ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              <b>{displayClassName(item.name)}</b>
              <span className="class-menu-note">
                {waiting.has(item.id) && <span className="flag-dot" role="img" aria-label="te așteaptă"></span>}
                {studentCountLabel(item.studentCount)}
              </span>
            </Link>
          ))}
          <div className="class-menu-foot">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setOpen(false);
                onNewClass();
              }}
            >
              + Clasă nouă
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// "⋯": "Redenumește clasa" (a dialog) and "Arhivează clasa".
function ClassMenu({
  api,
  classId,
  name,
  archived,
  onDone,
}: {
  api: AdminApi;
  classId: number;
  name: string;
  archived: boolean;
  onDone: () => Promise<void>;
}) {
  const { open, setOpen, box, button } = useSmallMenu();
  const [renameOpen, setRenameOpen] = useState(false);
  const archive = useMutation({
    mutationFn: () => api.updateClass(classId, { archived: !archived }),
    onSuccess: async () => {
      setOpen(false);
      await onDone();
    },
  });
  return (
    <div className="class-more" ref={box}>
      <button
        ref={button}
        type="button"
        className="class-more-button"
        aria-label={`Mai multe pentru ${displayClassName(name)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'class-more-menu' : undefined}
        onClick={() => setOpen(!open)}
      >
        <IconDots />
      </button>
      {open && (
        <div className="class-menu class-more-menu" id="class-more-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="class-menu-item"
            onClick={() => {
              setOpen(false);
              setRenameOpen(true);
            }}
          >
            Redenumește clasa
          </button>
          <button
            type="button"
            role="menuitem"
            className="class-menu-item"
            disabled={archive.isPending}
            onClick={() => archive.mutate()}
          >
            {archived ? 'Scoate din arhivă' : 'Arhivează clasa'}
          </button>
          {archive.error && <ErrorMessage error={archive.error} />}
        </div>
      )}
      {renameOpen && (
        <RenameDialog
          title="Redenumește clasa"
          label="Numele clasei"
          initial={name}
          maxLength={8}
          save={(next) => api.updateClass(classId, { name: next })}
          onSaved={onDone}
          onClose={() => setRenameOpen(false)}
          returnFocus={button}
        />
      )}
    </div>
  );
}

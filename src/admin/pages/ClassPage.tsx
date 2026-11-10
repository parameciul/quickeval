import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { displayClassName } from '../../../shared/classes.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { countLabel, studentCountLabel } from '../../ui/format.ts';
import { onTabKeyDown } from '../../ui/tabKeys.ts';
import { useApi } from '../ApiContext.tsx';
import { ArchiveDialog, hasOpenResults } from '../ArchiveDialog.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';
import { todoOf } from '../shell/todo.ts';
import { GradesTable } from '../classPage/GradesTable.tsx';
import { ClassStudents } from '../classPage/ClassStudents.tsx';
import { ClassTests } from '../classPage/ClassTests.tsx';
import { NewClassDialog, RenameDialog } from '../classPage/ClassDialogs.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';
import type { AdminApi } from '../api.ts';

// The state a link passes to the class page (the panel "Clasele tale"):
// `newClass` opens "Clasă nouă" on arrival, `archived` opens "Schimbă clasa"
// at its group "Arhivate".
export type ClassLinkState = { newClass?: boolean; archived?: boolean } | null;

export function ClassPage() {
  const classId = parsePositiveId(useParams().id);
  if (classId === null) return <NotFoundPage />;
  // A new key for each class: a draft or an open form never carries over to another class.
  return <ClassDetails key={classId} classId={classId} />;
}

const CLASS_TABS = ['note', 'elevi'] as const;

function testCountLabel(count: number): string {
  return count === 0 ? 'niciun test' : countLabel(count, 'test', 'teste');
}

function ClassDetails({ classId }: { classId: number }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof CLASS_TABS)[number]>('note');
  const [showArchived, setShowArchived] = useState(false);
  const [linkState] = useState(() => location.state as ClassLinkState);
  const [newClassOpen, setNewClassOpen] = useState(linkState?.newClass === true);
  const heading = useRef<HTMLHeadingElement>(null);
  const detail = useQuery({ queryKey: ['class', classId], queryFn: () => api.getClass(classId) });
  // Remember which class the teacher opened last, so /clase reopens it.
  useEffect(() => {
    localStorage.setItem('quickeval:lastClass', String(classId));
  }, [classId]);
  // What a link asked for opens once: Back or a reload does not open it again.
  useEffect(() => {
    const state = location.state as ClassLinkState;
    if (state?.newClass || state?.archived) navigate('.', { replace: true, state: null });
  }, [location.state, navigate]);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['class', classId] });
    await queryClient.invalidateQueries({ queryKey: ['classes'] });
  };
  // "Arhivează clasa" and "Scoate din arhivă", from ⋯ and from the strip of an
  // archived class.
  const archive = useMutation({
    mutationFn: (archived: boolean) => api.updateClass(classId, { archived }),
    onSuccess: refresh,
  });
  // Archiving the class closes the result pages of its tests: it asks first
  // while some are open.
  const [askArchive, setAskArchive] = useState(false);

  const newClass = newClassOpen && <NewClassDialog onClose={() => setNewClassOpen(false)} />;
  if (detail.isPending) return <p>Se încarcă…{newClass}</p>;
  if (detail.error) return <ErrorMessage error={detail.error} />;

  const { class: info, students, tests, grades } = detail.data;
  const activeTests = tests.filter((test) => !test.archived).length;
  // An archived class is read only: its grades and tests stay, and nothing new
  // is added to it until it is out of the archive.
  const readOnly = info.archived;
  return (
    <section className="class-page">
      {readOnly && (
        <div className="class-archived">
          <p>
            <b>Clasă arhivată.</b> Notele și testele rămân aici. Nu poți face un test nou și nu poți adăuga elevi.
          </p>
          <button
            type="button"
            className="button-quiet"
            disabled={archive.isPending}
            // The strip goes with the write: the focus moves to the class name.
            onClick={() => archive.mutate(false, { onSuccess: () => heading.current?.focus() })}
          >
            Scoate din arhivă
          </button>
        </div>
      )}
      <div className="class-head">
        <div className="class-head-main">
          <h1 ref={heading} tabIndex={-1}>
            {displayClassName(info.name)}
          </h1>
          <ClassSwitcher
            api={api}
            classId={classId}
            showArchived={linkState?.archived === true}
            onNewClass={() => setNewClassOpen(true)}
          />
          <p className="class-head-facts">
            {readOnly && (
              <>
                <span className="tag">Arhivată</span>{' '}
              </>
            )}
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
          <ClassMenu
            api={api}
            classId={classId}
            name={info.name}
            archived={info.archived}
            archiving={archive.isPending}
            onArchive={() => (!info.archived && tests.some(hasOpenResults) ? setAskArchive(true) : archive.mutate(!info.archived))}
            onDone={refresh}
          />
        </div>
      </div>
      {askArchive && (
        <ArchiveDialog
          title="Arhivezi clasa?"
          text="Elevii nu își vor mai putea vedea rezultatele testelor acestei clase. Le poți publica din nou oricând."
          onConfirm={() => archive.mutate(true)}
          onClose={() => setAskArchive(false)}
        />
      )}
      {archive.error && <ErrorMessage error={archive.error} />}

      <div
        className="class-tabs"
        role="tablist"
        aria-label="Ce vezi"
        onKeyDown={(event) => onTabKeyDown(event, CLASS_TABS, tab, setTab, (id) => `class-tab-${id}`)}
      >
        <button
          type="button"
          role="tab"
          id="class-tab-note"
          aria-selected={tab === 'note'}
          tabIndex={tab === 'note' ? 0 : -1}
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
          tabIndex={tab === 'elevi' ? 0 : -1}
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
              classId={classId}
              name={info.name}
              students={students}
              tests={tests}
              grades={grades}
              showArchived={showArchived}
              readOnly={readOnly}
              onShowStudents={() => setTab('elevi')}
            />
            <ClassTests
              tests={tests}
              schoolYear={info.schoolYear}
              readOnly={readOnly}
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
            readOnly={readOnly}
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
function useSmallMenu(startOpen = false) {
  const [open, setOpen] = useState(startOpen);
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
// class whose test waits on the teacher), open an archived one (its own group,
// at the end, so the teacher can take it out of the archive), or start a new
// one. `showArchived` opens it at that group, for the panel's "Arhivate (n)".
function ClassSwitcher({
  api,
  classId,
  showArchived,
  onNewClass,
}: {
  api: AdminApi;
  classId: number;
  showArchived: boolean;
  onNewClass(): void;
}) {
  const { open, setOpen, box, button } = useSmallMenu(showArchived);
  const archivedGroup = useRef<HTMLParagraphElement>(null);
  const { year } = useSchoolYear();
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });
  // The tests of the year, as the shell reads them, so the dots speak of every
  // class: one whose test waits on the teacher ("De făcut") is marked.
  const tests = useQuery({ queryKey: ['tests', year], queryFn: () => api.listTests(year) });
  const waiting = new Set((tests.data ?? []).filter((test) => todoOf(test) !== null).map((test) => test.classId));
  const list = (classes.data ?? []).filter((item) => !item.archived);
  const archived = (classes.data ?? []).filter((item) => item.archived);
  // Opened for the archived classes: once listed, the menu scrolls its group to
  // its top (the menu is the group's offset parent; the page does not move).
  const hasArchived = archived.length > 0;
  useEffect(() => {
    const title = archivedGroup.current;
    const menu = title?.closest<HTMLElement>('.class-switch-menu');
    if (showArchived && title && menu) menu.scrollTop = title.offsetTop - 6;
  }, [showArchived, hasArchived]);
  const item = (entry: (typeof list)[number]) => (
    <Link
      key={entry.id}
      className={entry.archived ? 'class-menu-item is-muted' : 'class-menu-item'}
      to={`/clase/${entry.id}`}
      aria-current={entry.id === classId ? 'page' : undefined}
      onClick={() => setOpen(false)}
    >
      <b>{displayClassName(entry.name)}</b>
      <span className="class-menu-note">
        {waiting.has(entry.id) && <span className="flag-dot" role="img" aria-label="te așteaptă"></span>}
        {studentCountLabel(entry.studentCount)}
      </span>
    </Link>
  );
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
          {list.map(item)}
          {hasArchived && (
            <div className="class-menu-group" role="group" aria-labelledby="class-switch-archived">
              <p ref={archivedGroup} id="class-switch-archived" className="class-menu-group-title">
                Arhivate
              </p>
              {archived.map(item)}
            </div>
          )}
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

// "⋯": "Redenumește clasa" (a dialog) and "Arhivează clasa"; for an archived
// class, "Scoate din arhivă" first.
function ClassMenu({
  api,
  classId,
  name,
  archived,
  archiving,
  onArchive,
  onDone,
}: {
  api: AdminApi;
  classId: number;
  name: string;
  archived: boolean;
  archiving: boolean;
  onArchive(): void;
  onDone: () => Promise<void>;
}) {
  const { open, setOpen, box, button } = useSmallMenu();
  const [renameOpen, setRenameOpen] = useState(false);
  const archiveItem = (
    <button
      type="button"
      role="menuitem"
      className="class-menu-item"
      disabled={archiving}
      onClick={() => {
        // The menu closes with its item: the focus goes back to ⋯.
        setOpen(false);
        button.current?.focus();
        onArchive();
      }}
    >
      {archived ? 'Scoate din arhivă' : 'Arhivează clasa'}
    </button>
  );
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
          {archived && archiveItem}
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
          {!archived && archiveItem}
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

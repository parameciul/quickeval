import type { ReactNode, Ref } from 'react';
import { useId } from 'react';
import { Link } from 'react-router';
import type { UploadRow } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import type { TestStatus } from '../../../shared/tests.ts';
import { countLabel } from '../../ui/format.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { CesTag } from '../CesTag.tsx';
import { useSmallMenu } from '../shell/useSmallMenu.ts';
import { heldBack, PAPER_PART_LABEL } from '../testPage/paperCounts.ts';
import { papersMissing, type PaperMode } from './paths.ts';
import { t } from '../../i18n/t.ts';

type ListedRow = UploadRow & { submissionId: number };

// What the students' list needs, in the column and in the menu of
// "‹ Elev 2/7 ›": the students listed (`listedPapers`), the open one, and
// where each opens.
export interface StudentsView {
  uploads: UploadRow[];
  students: ListedRow[];
  testStatus: TestStatus;
  mode: PaperMode;
  current: number;
  pathOf: (row: ListedRow) => string;
  // The open paper with all the exercises, for the line that says where the
  // other papers are while only the points to check show.
  allPath: string;
}

// "Elevii" beside the paper (redesign of the student navigation): one row per
// student, the name, and under it where the paper is, in words. The students
// who sent nothing close the list in one line. Its panel button hides it:
// the column goes, and the list opens from "‹ Elev 2/7 ›" instead.
export function StudentList({ view, onHide, hideButton }: { view: StudentsView; onHide: () => void; hideButton: Ref<HTMLButtonElement> }) {
  return (
    <nav className="paper-students" aria-label={t('Elevii')}>
      <div className="paper-students-head">
        <h2>{t('Elevii')}</h2>
        <button
          ref={hideButton}
          type="button"
          className="button-quiet icon-button paper-students-hide"
          aria-label={t('Ascunde lista')}
          title={t('Ascunde lista')}
          onClick={onHide}
        >
          <ActionIcon name="panel" />
        </button>
      </div>
      <StudentRows view={view} />
    </nav>
  );
}

// The rows, then one line: the students who sent nothing, or, while only the
// points to check show, how many papers are in "Toate exercițiile". The links
// replace the address, so Back leaves the page. A name opens another
// student's paper at the top of the page.
function StudentRows({ view }: { view: StudentsView }) {
  const { uploads, students, testStatus, mode, current, pathOf, allPath } = view;
  const papers = uploads.filter((row) => row.submissionId !== null).length;
  const others = papers - students.length;
  const missing = papersMissing(uploads);
  const open = testStatus !== 'evaluating' && testStatus !== 'done';
  return (
    <>
      {students.length > 0 ? (
        <ul className="paper-student-list">
          {students.map((row) => (
            <li key={row.submissionId}>
              <Link replace to={pathOf(row)} aria-current={row.submissionId === current ? 'true' : undefined} onClick={() => window.scrollTo(0, 0)}>
                <span className="paper-student-name">
                  {row.studentName}
                  {(row.ces || row.variant === 'ces') && <CesTag />}
                </span>{' '}
                <StudentState row={row} testStatus={testStatus} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint paper-students-note">{t('Niciun elev cu puncte de verificat.')}</p>
      )}
      {mode === 'review' && others > 0 && (
        <p className="hint paper-students-note">
          {others === 1 ? t('Încă o lucrare e în') : t('Celelalte {papers} sunt în', { papers: countLabel(others, 'lucrare', 'lucrări') })}{' '}
          <Link replace to={allPath}>
            {t('Toate exercițiile')}
          </Link>
          .
        </p>
      )}
      {mode === 'all' && missing.length > 0 && (
        <p className="hint paper-students-note">
          {open ? PAPER_PART_LABEL.notYet : PAPER_PART_LABEL.absent}: {missing.map((row) => row.studentName).join(', ')}.
        </p>
      )}
    </>
  );
}

// Where the paper is, in words, under the name: its points to check (orange),
// its grade, its pages while it waits for the grading, or its state.
function StudentState({ row, testStatus }: { row: UploadRow; testStatus: TestStatus }) {
  if (row.status === 'graded') {
    if (row.flagCount > 0) return <span className="paper-student-state is-flags">{countLabel(row.flagCount, 'punct de verificat', 'puncte de verificat')}</span>;
    return <span className="paper-student-state">{row.grade === null ? t('Corectat') : t('Nota {grade}', { grade: formatPoints(row.grade) })}</span>;
  }
  const pages = countLabel(row.fileCount, 'pagină', 'pagini');
  if (heldBack(row.status, row.fileCount, testStatus)) return <span className="paper-student-state">{`${PAPER_PART_LABEL.waiting} · ${pages}`}</span>;
  if (row.status === 'submitted') return <span className="paper-student-state is-sent">{`${t('Trimisă, necorectată')} · ${pages}`}</span>;
  if (row.status === 'grading') return <span className="paper-student-state">{t('Se corectează')}</span>;
  if (row.status === 'failed') return <span className="paper-student-state">{t('Corectarea a eșuat')}</span>;
  return <span className="paper-student-state">{t('Încă trimite…')}</span>;
}

// "‹ Elev 2/7 ›" in the bar: the arrows go to the student before or after;
// while the list is not beside the paper (hidden, or on a phone) the middle
// opens it, and at its foot "Arată lista lângă lucrare" puts the column back
// (not on a phone, which has no room for it).
export function StudentMove({
  view,
  previous,
  next,
  onGo,
  menu,
  onShowList,
  nextButton,
  menuButton,
}: {
  view: StudentsView;
  previous: ListedRow | undefined;
  next: ListedRow | undefined;
  onGo: (row: ListedRow) => void;
  menu: boolean;
  onShowList: (() => void) | null;
  nextButton: Ref<HTMLButtonElement>;
  menuButton: Ref<HTMLButtonElement>;
}) {
  const { students, current } = view;
  const at = students.findIndex((row) => row.submissionId === current);
  const place = (
    <>
      <span className="move-word">{at >= 0 ? t('Elev') : t('Elevi:')}</span>{' '}
      {at >= 0 ? `${at + 1}/${students.length}` : students.length}
    </>
  );
  return (
    <span className="move-group student-move" role="group" aria-label={t('Elevii')}>
      <button
        type="button"
        className="move-arrow"
        aria-label={t('Elevul anterior')}
        title={t('Elevul anterior')}
        disabled={!previous}
        onClick={() => previous && onGo(previous)}
      >
        <MoveChevron back />
      </button>
      {menu ? (
        <StudentMenu view={view} onShowList={onShowList} button={menuButton}>
          {place}
        </StudentMenu>
      ) : (
        <span className="move-label">{place}</span>
      )}
      <button ref={nextButton} type="button" className="move-arrow" aria-label={t('Elevul următor')} title={t('Elevul următor')} disabled={!next} onClick={() => next && onGo(next)}>
        <MoveChevron />
      </button>
    </span>
  );
}

function StudentMenu({ view, onShowList, button, children }: { view: StudentsView; onShowList: (() => void) | null; button: Ref<HTMLButtonElement>; children: ReactNode }) {
  const listId = useId();
  const { open, toggle, box, button: ownButton } = useSmallMenu<HTMLSpanElement>();
  const setButton = (node: HTMLButtonElement | null) => {
    ownButton.current = node;
    if (typeof button === 'function') button(node);
    else if (button) (button as { current: HTMLButtonElement | null }).current = node;
  };
  return (
    <span className="student-menu" ref={box}>
      <button
        ref={setButton}
        type="button"
        className="move-label student-menu-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        title={t('Elevii')}
        onClick={toggle}
      >
        {children}
        <SmallChevron />
      </button>
      {open && (
        <nav className="class-menu student-menu-list" id={listId} aria-label={t('Elevii')}>
          <StudentRows view={view} />
          {onShowList && (
            <button type="button" className="paper-action student-menu-pin" onClick={onShowList}>
              <ActionIcon name="panel" />
              <span className="paper-action-label">{t('Arată lista lângă lucrare')}</span>
            </button>
          )}
        </nav>
      )}
    </span>
  );
}

function MoveChevron({ back = false }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={back ? 'M14.5 6l-6 6 6 6' : 'M9.5 6l6 6-6 6'} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SmallChevron() {
  return (
    <svg className="student-menu-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

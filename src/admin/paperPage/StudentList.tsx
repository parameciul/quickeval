import { Link } from 'react-router';
import type { UploadRow } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import type { TestStatus } from '../../../shared/tests.ts';
import { countLabel, uploadStatusLabel } from '../../ui/format.ts';
import { CesTag } from '../CesTag.tsx';
import { heldBack, PAPER_PART_LABEL } from '../testPage/paperCounts.ts';
import { listedPapers, type PaperMode } from './paths.ts';
import { t } from '../../i18n/t.ts';

// "Elevii" (spec 2026-11-12 §4.3): every student with a paper, the open one
// marked, each with the grade, or the points to check in orange, or the
// pages of a sent paper not graded yet, or the state.
// While only the points to check show: the papers with points first, then the
// others. It folds to a thin strip with one button. The links replace the
// address, so Back leaves the page. A name opens another student's paper at
// the top of the page: on a phone the list is under the paper, and a replace
// keeps the place (the shell scrolls only for a new page).
export function StudentList({
  uploads,
  testStatus,
  mode,
  current,
  folded,
  onFold,
  pathOf,
}: {
  uploads: UploadRow[];
  testStatus: TestStatus;
  mode: PaperMode;
  current: number;
  folded: boolean;
  onFold: (folded: boolean) => void;
  pathOf: (row: UploadRow & { submissionId: number }) => string;
}) {
  const papers = listedPapers(uploads, mode);
  const withPoints = papers.filter((row) => row.status === 'graded' && row.reviewPoints.length > 0);
  const groups =
    mode === 'review'
      ? [
          { title: t('Cu puncte de verificat'), rows: withPoints },
          { title: t('Celelalte lucrări'), rows: papers.slice(withPoints.length) },
        ]
      : [{ title: null, rows: papers }];
  return (
    <nav className={folded ? 'paper-students is-folded' : 'paper-students'} aria-label={t('Elevii')}>
      <div className="paper-students-head">
        {!folded && <h2>{t('Elevii')}</h2>}
        <button type="button" className="button-quiet button-small" aria-expanded={!folded} onClick={() => onFold(!folded)}>
          {folded ? <span aria-hidden="true">»</span> : t('Ascunde')}
          {folded && <span className="sr-only">{t('Arată elevii')}</span>}
        </button>
      </div>
      {!folded &&
        groups.map(
          (group) =>
            (group.title === null || group.rows.length > 0) && (
              <div key={group.title ?? 'all'}>
                {group.title !== null && (
                  <h3 className="review-queue-head">
                    {group.title} <span className="review-count">{group.rows.length}</span>
                  </h3>
                )}
                <ul className="paper-student-list">
                  {group.rows.map((row) => (
                    <li key={row.submissionId}>
                      <Link
                        replace
                        to={pathOf(row)}
                        aria-current={row.submissionId === current ? 'true' : undefined}
                        onClick={() => window.scrollTo(0, 0)}
                      >
                        <span className="paper-student-name">
                          {row.studentName}
                          {(row.ces || row.variant === 'ces') && <CesTag />}
                        </span>{' '}
                        <StudentState row={row} testStatus={testStatus} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ),
        )}
    </nav>
  );
}

function StudentState({ row, testStatus }: { row: UploadRow; testStatus: TestStatus }) {
  if (row.status === 'graded' && row.flagCount > 0) {
    return (
      <span className="paper-student-flags">
        <span aria-hidden="true">{row.flagCount}</span>
        <span className="sr-only">{countLabel(row.flagCount, 'punct de verificat', 'puncte de verificat')}</span>
      </span>
    );
  }
  if (row.status === 'graded' && row.grade !== null) {
    return (
      <span className="paper-student-grade">
        <span className="sr-only">{t('nota')}</span> {formatPoints(row.grade)}
      </span>
    );
  }
  const held = heldBack(row.status, row.fileCount, testStatus);
  // A sent paper not graded yet: how many pages it has, which the teacher
  // looks over before the grading.
  if (row.status === 'submitted' && !held) return <span className="hint">{countLabel(row.fileCount, 'pagină', 'pagini')}</span>;
  const state = held ? PAPER_PART_LABEL.waiting : row.status === 'failed' ? t('Eșuat') : uploadStatusLabel(row.status);
  return <span className="hint">{state.toLowerCase()}</span>;
}

import { Link } from 'react-router';
import type { UploadRow } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import type { TestStatus } from '../../../shared/tests.ts';
import { countLabel, uploadStatusLabel } from '../../ui/format.ts';
import { CesTag } from '../CesTag.tsx';
import { heldBack, PAPER_PART_LABEL } from '../testPage/paperCounts.ts';
import { listedPapers, type PaperMode } from './paths.ts';

// "Elevii" (spec 2026-11-12 §4.3): every student with a paper, the open one
// marked, each with the grade, or the points to check in orange, or the state.
// While only the points to check show: the papers with points first, then the
// others. It folds to a thin strip with one button. The links replace the
// address, so Back leaves the page.
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
    mode === 'verificare'
      ? [
          { title: 'Cu puncte de verificat', rows: withPoints },
          { title: 'Celelalte lucrări', rows: papers.slice(withPoints.length) },
        ]
      : [{ title: null, rows: papers }];
  return (
    <nav className={folded ? 'paper-students is-folded' : 'paper-students'} aria-label="Elevii">
      <div className="paper-students-head">
        {!folded && <h2>Elevii</h2>}
        <button type="button" className="button-quiet button-small" aria-expanded={!folded} onClick={() => onFold(!folded)}>
          {folded ? <span aria-hidden="true">»</span> : 'Ascunde'}
          {folded && <span className="sr-only">Arată elevii</span>}
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
                      <Link replace to={pathOf(row)} aria-current={row.submissionId === current ? 'true' : undefined}>
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
        <span className="sr-only">nota</span> {formatPoints(row.grade)}
      </span>
    );
  }
  const state = heldBack(row.status, row.fileCount, testStatus) ? PAPER_PART_LABEL.waiting : row.status === 'failed' ? 'Eșuat' : uploadStatusLabel(row.status);
  return <span className="hint">{state.toLowerCase()}</span>;
}

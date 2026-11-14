import { useId } from 'react';
import { Link } from 'react-router';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import { CesTag } from '../CesTag.tsx';
import { paperPath } from '../paperPage/paths.ts';
import { pointKey, reviewPath } from '../reviewPage/points.ts';
import { MoveOnLink } from './MoveOnLink.tsx';

// The panel Verificare as an overview of the check: how far it is, one orange
// button into the paper page at the first point left, and a label per student
// with points (those left first, then those done). The points themselves are
// decided on the paper page; the papers table is in În clasă and Corectare.
export function ReviewOverview({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }) {
  const waitId = useId();
  const doneId = useId();
  // The graded papers that had points to check, in the class order (by name).
  const counted = uploads.filter(
    (row): row is UploadRow & { submissionId: number } =>
      row.status === 'graded' && row.submissionId !== null && row.flagCount + row.checkedCount > 0,
  );
  const total = counted.reduce((sum, row) => sum + row.flagCount + row.checkedCount, 0);
  const checked = counted.reduce((sum, row) => sum + row.checkedCount, 0);
  const left = total - checked;
  const waiting = counted.filter((row) => row.flagCount > 0 && row.reviewPoints.length > 0);
  const done = counted.filter((row) => row.flagCount === 0);
  const toResults = (
    <MoveOnLink stage="Rezultate" className="button">
      Mergi la Rezultate
    </MoveOnLink>
  );

  if (total === 0) {
    return (
      <div className="review-done-box">
        <p>Nimic de verificat.</p>
        {toResults}
      </div>
    );
  }
  return (
    <>
      {left > 0 ? (
        <div className="review-progress">
          <p className="review-figure">
            <strong>{checked}</strong> din {total} verificate
          </p>
          <div className="review-bar-column">
            <div
              className="review-bar"
              role="progressbar"
              aria-label="Puncte verificate"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={checked}
            >
              <span style={{ width: `${Math.round((checked / total) * 100)}%` }} />
            </div>
            <p className="review-left">
              {left === 1 ? 'Mai este' : 'Mai sunt'} {countLabel(left, 'punct', 'puncte')}, la {countLabel(waiting.length, 'elev', 'elevi')}
            </p>
          </div>
          <Link className="button button-wait" to={reviewPath(test.code)}>
            {checked === 0 ? 'Începe verificarea' : 'Continuă verificarea'}
          </Link>
        </div>
      ) : (
        <div className="review-done-box">
          <p>{total === 1 ? 'Punctul de verificat este verificat.' : `Toate cele ${countLabel(total, 'punct', 'puncte')} sunt verificate.`}</p>
          {toResults}
        </div>
      )}
      {waiting.length > 0 && (
        <div className="review-group">
          <h3>
            <span id={waitId}>De verificat</span> <span className="review-hint">{countLabel(waiting.length, 'elev', 'elevi')} · clic pe un nume</span>
          </h3>
          <ul className="review-chips" aria-labelledby={waitId}>
            {waiting.map((row) => {
              const all = row.flagCount + row.checkedCount;
              return (
                <li key={row.submissionId}>
                  <Link
                    className="review-chip is-wait"
                    to={reviewPath(test.code, { submissionId: row.submissionId, key: pointKey(row.reviewPoints[0]!) })}
                    aria-label={`${row.studentName}: ${row.checkedCount} din ${all} verificate`}
                  >
                    {row.studentName}
                    {row.ces && <CesTag />}{' '}
                    <span className="tag tag-wait">
                      {row.checkedCount}/{all}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {done.length > 0 && (
        <div className="review-group">
          <h3>
            <span id={doneId}>Gata</span> <span className="review-hint">{countLabel(done.length, 'elev', 'elevi')}</span>
          </h3>
          <ul className="review-chips" aria-labelledby={doneId}>
            {done.map((row) => (
              <li key={row.submissionId}>
                <Link className="review-chip is-done" to={paperPath(test.code, 'app', { submissionId: row.submissionId, key: null }, 'toate')}>
                  <span aria-hidden="true">✓</span> {row.studentName}
                  {row.ces && <CesTag />}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

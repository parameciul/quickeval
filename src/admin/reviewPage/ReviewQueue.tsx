import { Link } from 'react-router';
import { formatPoints } from '../../../shared/scoring.ts';
import { countLabel } from '../../ui/format.ts';
import { CesTag } from '../CesTag.tsx';
import { pointKey, pointName, reviewPath, type GradedRow, type ReviewSpot } from './points.ts';

// The left pane of the review (redesign spec §7): the papers with points to
// check, each with its points, then the other graded papers. The links
// replace the address, so Back leaves the review.
export function ReviewQueue({ code, papers, others, spot }: { code: string; papers: GradedRow[]; others: GradedRow[]; spot: ReviewSpot }) {
  return (
    <nav className="review-queue" aria-label="Lucrările">
      <h2 className="review-queue-head">
        Cu puncte de verificat <span className="review-count">{papers.length}</span>
      </h2>
      {papers.length === 0 ? (
        <p className="hint">Niciuna.</p>
      ) : (
        <ul className="review-papers">
          {papers.map((row) => (
            <li key={row.submissionId}>
              <Link replace to={reviewPath(code, { submissionId: row.submissionId, key: pointKey(row.reviewPoints[0]!) })} className="review-paper">
                <span className="review-paper-name">
                  {row.studentName}
                  {(row.ces || row.variant === 'ces') && <CesTag />} {row.grade !== null && (
                    <span className="review-grade">
                      <span className="sr-only">nota</span> {formatPoints(row.grade)}
                    </span>
                  )}
                </span>{' '}
                <span className="hint">{countLabel(row.reviewPoints.length, 'punct de verificat', 'puncte de verificat')}</span>
              </Link>
              <ul className="review-points">
                {row.reviewPoints.map((point) => {
                  const key = pointKey(point);
                  const current = spot.submissionId === row.submissionId && spot.key === key;
                  return (
                    <li key={key}>
                      <Link replace to={reviewPath(code, { submissionId: row.submissionId, key })} aria-current={current ? 'true' : undefined}>
                        {pointName(point)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <>
          <h2 className="review-queue-head">
            Celelalte lucrări <span className="review-count">{others.length}</span>
          </h2>
          <ul className="review-others">
            {others.map((row) => (
              <li key={row.submissionId}>
                <Link
                  replace
                  to={reviewPath(code, { submissionId: row.submissionId })}
                  className="review-paper"
                  aria-current={spot.submissionId === row.submissionId ? 'true' : undefined}
                >
                  <span className="review-paper-name">
                    {row.studentName}
                    {(row.ces || row.variant === 'ces') && <CesTag />} {row.grade !== null && (
                    <span className="review-grade">
                      <span className="sr-only">nota</span> {formatPoints(row.grade)}
                    </span>
                  )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  );
}

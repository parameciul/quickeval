import { useId } from 'react';
import { Link } from 'react-router';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { pageLabel } from '../../ui/format.ts';
import { MathText } from '../../ui/MathText.tsx';
import { pointKey, pointQueue, pointsText, reviewPath } from '../reviewPage/points.ts';

// The points to check, in the panel Verificare (redesign spec §6): a row per
// point with its reason, each opening the review (§7) at that point.
export function ReviewList({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }) {
  const id = useId();
  const queue = pointQueue(uploads);
  if (queue.length === 0) {
    return (
      <p>
        Toate punctele sunt verificate. <Link to={reviewPath(test.code)}>Vezi lucrările</Link>
      </p>
    );
  }
  return (
    <>
      <p>
        <Link className="button" to={reviewPath(test.code)}>
          Începe verificarea
        </Link>
      </p>
      <h3 id={id}>Puncte de verificat</h3>
      <ul className="review-list" aria-labelledby={id}>
        {queue.map(({ submissionId, studentName, point }) => {
          const key = pointKey(point);
          const what = point.kind === 'pages' ? 'Paginile necitite' : point.label;
          return (
            <li key={`${submissionId}:${key}`}>
              <span className="review-name">
                {studentName} · {what}
                <span className="review-list-reason">
                  {point.kind === 'pages' ? `Robotul nu a putut citi: ${point.pages.map(pageLabel).join(', ')}.` : <MathText text={point.reason} />}
                </span>
              </span>
              {point.kind === 'item' && (
                <span className="tag tag-wait">
                  propus {pointsText(point.points)} din {pointsText(point.maxPoints)}
                </span>
              )}
              <Link className="button-quiet button-small" to={reviewPath(test.code, { submissionId, key })} aria-label={`Decide: ${studentName}, ${what}`}>
                Decide
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

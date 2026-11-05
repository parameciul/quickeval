import { useId } from 'react';
import { Link } from 'react-router';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { countLabel } from '../../ui/format.ts';

// The papers with points to check, in the panel Verificare (redesign spec §6):
// each opens the paper's page, where the teacher decides. The API counts the
// points of each paper but does not list them: the list of each point with
// its reason comes with the review of Phase 6.
export function ReviewList({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }) {
  const id = useId();
  const papers = uploads.filter((row) => row.status === 'graded' && row.flagCount > 0 && row.submissionId !== null);
  const first = papers[0];
  if (first === undefined) return <p>Toate punctele sunt verificate.</p>;
  const paperPage = (row: UploadRow) => `/teste/${test.code}/elevi/${row.submissionId}`;
  return (
    <>
      <p>
        <Link className="button" to={paperPage(first)}>
          Începe verificarea
        </Link>
      </p>
      <h3 id={id}>Lucrări cu puncte de verificat</h3>
      <ul className="review-list" aria-labelledby={id}>
        {papers.map((row) => (
          <li key={row.studentId}>
            <span className="review-name">{row.studentName}</span>
            {row.grade !== null && <span>nota {formatPoints(row.grade)}</span>}
            <span className="tag tag-wait">{countLabel(row.flagCount, 'punct de verificat', 'puncte de verificat')}</span>
            <Link className="button-quiet button-small" to={paperPage(row)} aria-label={`Decide: ${row.studentName}`}>
              Decide
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

import { Link } from 'react-router';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import { reviewPath } from '../reviewPage/points.ts';
import { PAPER_PART_LABEL, paperCounts } from './paperCounts.ts';

// The progress of the papers above the papers table (spec 2026-11-12 §5.2):
// one bar of the students, each part named in the legend under it, and apart
// the points that wait to be checked. The bar is hidden from screen readers:
// the legend says the same in words.
export function PapersProgress({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }) {
  const counts = paperCounts(test.status, test.studentCount, uploads);
  const papers = uploads.filter((row) => row.flagCount > 0).length;
  const points = uploads.reduce((sum, row) => sum + row.flagCount, 0);
  return (
    <div className="papers-progress">
      <h3>
        Lucrări: {counts.took} din {countLabel(counts.total, 'elev', 'elevi')} {counts.open ? 'au trimis' : 'au participat'}
      </h3>
      {counts.total > 0 && (
        <>
          <span className="papers-bar" aria-hidden="true">
            {counts.parts.map(({ part, count }) => (
              <span key={part} className={`papers-bar-part is-${part}`} style={{ width: `${(count / counts.total) * 100}%` }} />
            ))}
          </span>
          <ul className="papers-legend">
            {counts.parts.map(({ part, count }) => (
              <li key={part}>
                <span className={`papers-key is-${part}`} aria-hidden="true" />
                {PAPER_PART_LABEL[part]} <strong>{count}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
      {counts.complete && <p className="papers-complete">✓ Corectat complet</p>}
      {points > 0 && (
        <p className="papers-points">
          <span className="papers-points-count">{countLabel(points, 'punct de verificat', 'puncte de verificat')}</span>{' '}
          <span className="hint">în {countLabel(papers, 'lucrare', 'lucrări')}</span>{' '}
          <Link className="button button-small" to={reviewPath(test.code)}>
            Verifică
          </Link>
        </p>
      )}
    </div>
  );
}

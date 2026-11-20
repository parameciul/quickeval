import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import { PAPER_PART_LABEL, paperCounts } from './paperCounts.ts';
import { cesBaremActive } from './variant.ts';
import { t } from '../../i18n/t.ts';

// The progress of the papers above the papers table (spec 2026-11-12 §5.2):
// one bar of the students, each part named in the legend under it. The points
// to check are named in the stage list, the "Urmează" line and the bar at the
// foot of the page, so not here. The bar is hidden from screen readers: the
// legend says the same in words.
export function PapersProgress({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }) {
  const counts = paperCounts(test.status, test.studentCount, uploads, { hasTest: test.ces.files.test !== null, baremActive: cesBaremActive(test) });
  return (
    <div className="papers-progress">
      <h3>
        {t('Lucrări:')}{' '}{counts.took}{' '}{t('din')}{' '}{countLabel(counts.total, 'elev', 'elevi')} {counts.open ? t('au trimis') : t('au participat')}
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
      {counts.complete && <p className="papers-complete">{t('✓ Corectat complet')}</p>}
    </div>
  );
}

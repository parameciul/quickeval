import { useId } from 'react';
import { Link } from 'react-router';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { gradeGroups } from '../../../shared/stats.ts';
import { countLabel, GRADE_GROUP_LEVELS, pointsLevel } from '../../ui/format.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { t } from '../../i18n/t.ts';

// "Raportul clasei" in the panel Rezultate (spec 2026-11-14): the class's
// average and its grades by group, from the rows the page already has (no
// report query), and the way to the class report. Each student's PDF stays on
// the paper's page.
export function ReportCard({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }) {
  const titleId = useId();
  if (test.gradedCount === 0) {
    return (
      <section className="report-card" aria-labelledby={titleId}>
        <h3 id={titleId}>{t('Raportul clasei')}</h3>
        <p className="hint">{t('Raportul clasei apare după prima corectare.')}</p>
      </section>
    );
  }
  // Every paper graded now counts, a student who left too, as in the report.
  const grades = uploads.flatMap((row) => (row.status === 'graded' && row.grade !== null ? [row.grade] : []));
  const groups = gradeGroups(grades);
  const most = Math.max(1, ...groups.map((group) => group.count));
  const active = uploads.filter((row) => row.active);
  const gradedActive = active.filter((row) => row.status === 'graded').length;
  return (
    <section className="report-card" aria-labelledby={titleId}>
      <h3 id={titleId}>{t('Raportul clasei')}</h3>
      <p className="report-card-average">
        {test.averageGrade !== null && (
          <span className={`report-card-grade points-${pointsLevel(test.averageGrade, 10)}`}>{formatPoints(test.averageGrade)}</span>
        )}
        <span className="hint">
          {test.averageGrade !== null && `${t('media testului')} · `}
          {gradedActive}{' '}{t('din')}{' '}{countLabel(active.length, 'elev corectat', 'elevi corectați')}
        </span>
      </p>
      <ul className="report-card-groups" aria-label={t('Notele pe grupe')}>
        {groups.map((group, index) => (
          <li key={group.label}>
            <span>{group.label}</span>
            <span className="report-card-bar" aria-hidden="true">
              <span className={`bar-${GRADE_GROUP_LEVELS[index]}`} style={{ width: `${(group.count / most) * 100}%` }}></span>
            </span>
            <span className="report-card-count">{group.count}</span>
          </li>
        ))}
      </ul>
      <Link className="button" to={`/tests/${test.code}/report`}>
        <ActionIcon name="report" />
        {t('Deschide raportul')}
      </Link>
    </section>
  );
}

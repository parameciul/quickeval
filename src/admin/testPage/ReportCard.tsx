import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { Link } from 'react-router';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { classCsv } from '../../../shared/csv.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { gradeGroups } from '../../../shared/stats.ts';
import { countLabel, pointsLevel, uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { saveFile } from '../pdf/share.ts';
import { IconDownload } from '../shell/icons.tsx';

// The colour of each grade group's bar: the grade colour of its grades
// (`.points-N`), red under 5 up to dark green from 9.
const GROUP_LEVELS = [1, 3, 4, 5];

// "Raportul clasei" in the panel Rezultate (spec 2026-11-14): the class's
// average and its grades by group, from the rows the page already has (no
// report query), the way to the class report, and the CSV for the catalog
// as a small text button. The CSV is the class report's, read only when the
// button is pressed. Each student's PDF stays on the paper's page.
export function ReportCard({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }) {
  const titleId = useId();
  if (test.gradedCount === 0) {
    return (
      <section className="report-card" aria-labelledby={titleId}>
        <h3 id={titleId}>Raportul clasei</h3>
        <p className="hint">Raportul clasei și CSV-ul apar după prima corectare.</p>
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
      <h3 id={titleId}>Raportul clasei</h3>
      <p className="report-card-average">
        {test.averageGrade !== null && (
          <span className={`report-card-grade points-${pointsLevel(test.averageGrade, 10)}`}>{formatPoints(test.averageGrade)}</span>
        )}
        <span className="hint">
          {test.averageGrade !== null && 'media testului · '}
          {gradedActive} din {countLabel(active.length, 'elev corectat', 'elevi corectați')}
        </span>
      </p>
      <ul className="report-card-groups" aria-label="Notele pe grupe">
        {groups.map((group, index) => (
          <li key={group.label}>
            <span>{group.label}</span>
            <span className="report-card-bar" aria-hidden="true">
              <span className={`bar-${GROUP_LEVELS[index]}`} style={{ width: `${(group.count / most) * 100}%` }}></span>
            </span>
            <span className="report-card-count">{group.count}</span>
          </li>
        ))}
      </ul>
      <Link className="button" to={`/teste/${test.code}/raport`}>
        Deschide raportul
      </Link>
      <CsvButton code={test.code} />
    </section>
  );
}

function CsvButton({ code }: { code: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const csv = useMutation({
    mutationFn: async () => {
      const report = await queryClient.fetchQuery({ queryKey: ['report', code], queryFn: () => api.getReport(code) });
      saveFile(new Blob([classCsv(report, uploadStatusLabel)], { type: 'text/csv;charset=utf-8' }), `${report.test.code}-raport.csv`);
    },
  });
  return (
    <>
      <button type="button" className="text-button is-quiet csv-button" disabled={csv.isPending} onClick={() => csv.mutate()}>
        <IconDownload />
        CSV pentru catalog
      </button>
      {csv.error && <ErrorMessage error={csv.error} />}
    </>
  );
}

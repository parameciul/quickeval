import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import type { ClassReport } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { classStats } from '../../../shared/stats.ts';
import { normalizeTestCode } from '../../../shared/tests.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { AnalysisSection } from '../reportPage/AnalysisSection.tsx';
import { ExerciseStatsTable, MissingList, ResultsTable, StatsSummary } from '../reportPage/ReportTables.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

// While the robot writes the analysis, the page asks for news every 10 seconds.
export function reportRefreshInterval(report: ClassReport | undefined): number | false {
  return report?.analysis.status === 'requested' ? 10_000 : false;
}

// /teste/:code/raport: the class report (spec §14.2): the table of the graded
// students, the statistics, and the analysis of the class.
export function ReportPage() {
  const code = normalizeTestCode(useParams().code ?? '');
  if (code === null) return <NotFoundPage />;
  return <ReportView key={code} code={code} />;
}

function ReportView({ code }: { code: string }) {
  const api = useApi();
  const query = useQuery({
    queryKey: ['report', code],
    queryFn: () => api.getReport(code),
    refetchInterval: (state) => reportRefreshInterval(state.state.data),
  });

  if (query.isPending) return <p>Se încarcă…</p>;
  if (query.data === undefined) return <ErrorMessage error={query.error} />;
  const report = query.data;
  const stats = classStats(report);

  return (
    <section>
      <p className="back-link">
        <Link to={`/teste/${code}`}>← {code}</Link>
      </p>
      {query.isRefetchError && <ErrorMessage error={query.error} />}
      <h1>Raportul clasei</h1>
      <p className="lead-line">
        {report.test.code} · {report.test.title} · {displayClassName(report.test.className)}
      </p>

      {report.rows.length === 0 ? (
        <p className="hint">Nicio lucrare nu este corectată încă. Raportul apare după prima corectare.</p>
      ) : (
        <>
          <StatsSummary stats={stats} />
          <h2>Rezultatele elevilor</h2>
          <ResultsTable code={code} report={report} />
          <h2>Pe exerciții</h2>
          <ExerciseStatsTable stats={stats} />
        </>
      )}
      <MissingList missing={report.missing} />
      <AnalysisSection code={code} report={report} />
    </section>
  );
}

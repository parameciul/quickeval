import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { ClassReport } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { classStats } from '../../../shared/stats.ts';
import { normalizeTestCode } from '../../../shared/tests.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { classCsv } from '../../../shared/csv.ts';
import { countLabel, formatDate, uploadStatusLabel } from '../../ui/format.ts';
import { classPdf, classPdfFileName } from '../pdf/classPdf.ts';
import { PdfActions } from '../pdf/PdfActions.tsx';
import { AnalysisSection } from '../reportPage/AnalysisSection.tsx';
import { ExerciseStatsTable, GradeGroups, ReportTiles, ResultsTable } from '../reportPage/ReportTables.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

// While the robot writes the analysis, the page asks for news every 10 seconds.
export function reportRefreshInterval(report: ClassReport | undefined): number | false {
  if (report === undefined) return false;
  const robotCanWrite = report.test.status === 'evaluating' || report.test.status === 'done';
  return report.analysis.status === 'requested' && robotCanWrite ? 10_000 : false;
}

// /teste/:code/raport: the class report (spec §11.3): one page, with the list
// of its parts on the left.
export function ReportPage() {
  const code = normalizeTestCode(useParams().code ?? '');
  if (code === null) return <NotFoundPage />;
  return <ReportView key={code} code={code} />;
}

const PARTS = [
  { id: 'pe-scurt', name: 'Pe scurt' },
  { id: 'rezultate', name: 'Rezultatele elevilor' },
  { id: 'exercitii', name: 'Pe exerciții' },
  { id: 'analiza', name: 'Analiza clasei' },
] as const;
type PartId = (typeof PARTS)[number]['id'];

// The part the teacher reads: the last one whose top has passed the upper third
// of the screen, or the last part once the page is scrolled to its end (a short
// last part never reaches that third). Measured on every scroll and resize
// (four boxes: cheap; no animation frame, which a hidden tab never runs). A part that is not laid out (no height, as in the tests) never counts,
// so "Pe scurt" stays marked.
export function currentPart(tops: (DOMRect | undefined)[], viewport: number, atEnd: boolean): PartId {
  let current: PartId = PARTS[0].id;
  tops.forEach((rect, index) => {
    if (rect && rect.height > 0 && rect.top <= viewport / 3) current = PARTS[index]!.id;
  });
  const last = tops[tops.length - 1];
  if (atEnd && last && last.height > 0 && last.top < viewport) current = 'analiza';
  return current;
}

function useCurrentPart(ready: boolean): PartId {
  const [current, setCurrent] = useState<PartId>('pe-scurt');
  useEffect(() => {
    if (!ready) return;
    const measure = () => {
      const rects = PARTS.map((part) => document.getElementById(part.id)?.getBoundingClientRect());
      const root = document.documentElement;
      const atEnd = window.innerHeight + window.scrollY >= root.scrollHeight - 2;
      setCurrent(currentPart(rects, window.innerHeight, atEnd));
    };
    measure();
    document.addEventListener('scroll', measure, { passive: true, capture: true });
    window.addEventListener('resize', measure);
    return () => {
      document.removeEventListener('scroll', measure, { capture: true });
      window.removeEventListener('resize', measure);
    };
  }, [ready]);
  return current;
}

function ReportView({ code }: { code: string }) {
  const api = useApi();
  const query = useQuery({
    queryKey: ['report', code],
    queryFn: () => api.getReport(code),
    refetchInterval: (state) => reportRefreshInterval(state.state.data),
  });
  const graded = (query.data?.rows.length ?? 0) > 0;
  const current = useCurrentPart(graded);

  if (query.isPending) return <p>Se încarcă…</p>;
  if (query.data === undefined) return <ErrorMessage error={query.error} />;
  const report = query.data;
  const stats = classStats(report);
  const counts: Partial<Record<PartId, string>> = {
    rezultate: String(report.rows.length + report.missing.length),
    exercitii: String(report.exercises.length),
  };

  return (
    <section className="report-page">
      <p className="back-link">
        <Link to={`/teste/${code}`}>← {report.test.title}</Link>
      </p>
      {query.isRefetchError && <ErrorMessage error={query.error} />}
      <div className="report-head">
        <div>
          <h1>Raportul clasei</h1>
          <p className="lead-line">
            {report.test.title} · <Link to={`/clase/${report.test.classId}`}>{displayClassName(report.test.className)}</Link>
            {report.test.startedAt !== null && ` · ${formatDate(report.test.startedAt)}`}
          </p>
        </div>
        {graded && (
          <PdfActions
            pdf={{ build: () => classPdf(report), fileName: classPdfFileName(report), title: `Raportul clasei · ${report.test.code}` }}
            csv={{ build: () => classCsv(report, uploadStatusLabel), fileName: `${report.test.code}-raport.csv` }}
          />
        )}
      </div>

      {!graded ? (
        <p className="hint">Nicio lucrare nu este corectată încă. Raportul apare după prima corectare.</p>
      ) : (
        <div className="report-layout">
          <aside className="report-side">
            <nav className="report-toc" aria-label="Părțile raportului">
              <ul>
                {PARTS.map((part) => (
                  <li key={part.id}>
                    <a href={`#${part.id}`} aria-current={part.id === current ? 'true' : undefined}>
                      {part.name}
                      {counts[part.id] !== undefined && <span>{counts[part.id]}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <GradeGroups stats={stats} />
          </aside>
          <div className="report-main">
            <section id="pe-scurt" className="report-part" aria-label="Pe scurt">
              <ReportTiles stats={stats} />
            </section>
            <section id="rezultate" className="report-part class-card" aria-labelledby="rezultate-title">
              <div className="class-card-head">
                <h2 id="rezultate-title">Rezultatele elevilor</h2>
                <span>
                  {stats.gradedCount} din {stats.activeCount} elevi
                </span>
              </div>
              <ResultsTable code={code} report={report} />
            </section>
            <section id="exercitii" className="report-part class-card" aria-labelledby="exercitii-title">
              <div className="class-card-head">
                <h2 id="exercitii-title">Pe exerciții</h2>
                <span>{countLabel(report.exercises.length, 'exercițiu', 'exerciții')}</span>
              </div>
              <ExerciseStatsTable stats={stats} />
            </section>
            <AnalysisSection code={code} report={report} />
          </div>
        </div>
      )}
    </section>
  );
}

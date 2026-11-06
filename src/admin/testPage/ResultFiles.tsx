import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { TestInfo } from '../../../shared/api.ts';
import { classCsv } from '../../../shared/csv.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { saveFile } from '../pdf/share.ts';

// "Pentru tine" in the panel Rezultate (redesign spec §8): the class report
// and the CSV for the catalog, once a paper is graded. The CSV is the one of
// the class report page, made from the report read when the button is
// pressed. Each student's PDF stays on the paper's page.
export function ResultFiles({ test }: { test: TestInfo }) {
  if (test.gradedCount === 0) return <p className="hint">Raportul clasei și CSV-ul apar după prima corectare.</p>;
  const average = test.averageGrade === null ? '' : `Media testului ${formatPoints(test.averageGrade)} · `;
  return (
    <>
      <ul className="file-list">
        <li>
          <p className="file-title">
            <strong>Raportul clasei</strong>
          </p>
          <p className="hint">{average}rezultatele pe exerciții · analiza clasei</p>
          <Link className="button-quiet button-small" to={`/teste/${test.code}/raport`}>
            Deschide raportul
          </Link>
        </li>
        <CsvRow code={test.code} />
      </ul>
      <p className="hint">PDF-ul cu rezultatul unui elev este pe pagina lucrării lui: apasă pe numele lui în tabel.</p>
    </>
  );
}

function CsvRow({ code }: { code: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const csv = useMutation({
    mutationFn: async () => {
      const report = await queryClient.fetchQuery({ queryKey: ['report', code], queryFn: () => api.getReport(code) });
      saveFile(new Blob([classCsv(report, uploadStatusLabel)], { type: 'text/csv;charset=utf-8' }), `${report.test.code}-raport.csv`);
    },
  });
  return (
    <li>
      <p className="file-title">
        <strong>CSV pentru catalog</strong>
      </p>
      <p className="hint">Fiecare elev cu punctele pe exerciții, totalul și nota.</p>
      <button type="button" className="button-quiet button-small" disabled={csv.isPending} onClick={() => csv.mutate()}>
        Descarcă CSV
      </button>
      {csv.error && <ErrorMessage error={csv.error} />}
    </li>
  );
}

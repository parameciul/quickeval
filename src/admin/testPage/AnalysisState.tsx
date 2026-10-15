import { Link } from 'react-router';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';

// The class analysis on the test page (spec §9): the robot writes it after the
// grading, so a test can wait in "Se corectează" with every upload graded. The
// link to the class report shows as soon as one upload is graded.
export function AnalysisState({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }) {
  const { status } = test.analysis;
  const uploadWaits = uploads.some((row) => row.status === 'submitted' || row.status === 'grading');
  const waiting = test.status === 'evaluating' && status === 'requested' && !uploadWaits;
  return (
    <>
      {waiting && test.gradedCount > 0 && (
        <p role="status">Lucrările sunt corectate. Robotul scrie acum analiza clasei.</p>
      )}
      {status === 'failed' && test.gradedCount > 0 && (
        <div className="warning">
          <p>
            <strong>Robotul nu a putut scrie analiza clasei.</strong> O poți cere din nou în raportul clasei.
          </p>
        </div>
      )}
      {test.gradedCount > 0 && (
        <p>
          <Link to={`/teste/${test.code}/raport`}>Raportul clasei</Link>
        </p>
      )}
    </>
  );
}

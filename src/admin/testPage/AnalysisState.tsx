import type { TestInfo, UploadRow } from '../../../shared/api.ts';

// The class analysis on the test page (spec §9): the robot writes it after the
// grading, so a test can wait in "Se corectează" with every upload graded. The
// link to the class report is in the head of the test page.
export function AnalysisState({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }) {
  const { status, attempts } = test.analysis;
  const retrying = test.status === 'evaluating' && status === 'requested' && attempts > 0;
  const uploadWaits = uploads.some((row) => row.status === 'submitted' || row.status === 'grading');
  const waiting = test.status === 'evaluating' && status === 'requested' && !uploadWaits && !retrying;
  return (
    <>
      {waiting && test.gradedCount > 0 && (
        <p role="status">Lucrările sunt corectate. Robotul scrie acum analiza clasei.</p>
      )}
      {retrying && test.gradedCount > 0 && (
        <p role="status">Ultima încercare a eșuat. Robotul va încerca din nou la următoarea rulare.</p>
      )}
      {status === 'failed' && test.gradedCount > 0 && (
        <div className="warning">
          <p>
            <strong>Robotul nu a putut scrie analiza clasei.</strong> O poți cere din nou în raportul clasei.
          </p>
        </div>
      )}
    </>
  );
}

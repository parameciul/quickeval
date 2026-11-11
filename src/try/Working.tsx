import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TestDetail } from '../../shared/api.ts';
import { useApi } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { MathText } from '../ui/MathText.tsx';
import { fileChangesLeft } from './phase.ts';
import { TestFile } from './Prepare.tsx';

// The paper went to grading (spec §3.3, state 3).
export function Grading() {
  return (
    <div className="try-state" role="status">
      <h2>Lucrarea se corectează</h2>
      <p>Robotul pornește în cam un minut, apoi face lista exercițiilor și corectează lucrarea. Durează câteva minute; pagina se actualizează singură.</p>
    </div>
  );
}

// The barem's points do not add up (the exercise list's "problem"): the same
// choice as in the app, "Folosește oricum" or another barem.
export function BaremProblem({ detail }: { detail: TestDetail }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { test } = detail;
  const accept = useMutation({
    mutationFn: () => api.acceptExerciseList(test.code),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['test', test.code] }),
  });
  return (
    <div className="warning">
      <p>
        <strong>Baremul are o problemă.</strong> {test.exerciseList.message && <MathText text={test.exerciseList.message} />}
      </p>
      <p>Corectează cu baremul așa cum este, sau încarcă alt barem.</p>
      <div className="card-actions">
        <button type="button" className="button" disabled={accept.isPending} onClick={() => accept.mutate()}>
          Folosește oricum
        </button>
      </div>
      {accept.error && <ErrorMessage error={accept.error} />}
      <TestFile code={test.code} kind="barem" name={null} disabled={fileChangesLeft(detail) === 0} />
    </div>
  );
}

// The robot could not do the try's work, after its own retries (state 5). The
// try gives its place of the day back; there is no retry.
export function Failed({ detail }: { detail: TestDetail }) {
  const { test } = detail;
  // A subject the robot does not grade ends the try with the list's message.
  const what =
    test.subject?.value === 'alta'
      ? 'Nu corectăm încă materia acestui test.'
      : test.barem.request === 'failed'
        ? 'Robotul nu a putut face baremul din test.'
        : test.exerciseList.status === 'failed'
          ? 'Robotul nu a putut citi testul și baremul.'
          : 'Robotul nu a putut corecta lucrarea.';
  const detailText = test.exerciseList.status === 'failed' ? test.exerciseList.message : null;
  return (
    <div className="try-state">
      <h2>Încercarea nu a reușit</h2>
      <p>
        <strong>{what}</strong> {detailText && <MathText text={detailText} />}
      </p>
      <p>Încercarea aceasta nu se numără în limita ta de azi. Poți face o încercare nouă de pe pagina principală.</p>
      <a className="button" href="/">
        Fă o încercare nouă
      </a>
    </div>
  );
}

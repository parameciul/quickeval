import { useMutation } from '@tanstack/react-query';
import type { TestInfo } from '../../../shared/api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// Opening and closing the students' result pages of a test, for all
// students at once. While open, each student reads their own page from the
// link kept after sending (or shared by the teacher); while closed, those
// pages and their files do not open.
export function ResultsAccess({ test, onChanged }: { test: TestInfo; onChanged: () => Promise<void> }) {
  const api = useApi();
  const toggle = useMutation({
    mutationFn: () => api.setResultsOpen(test.code, !test.resultsOpen),
    onSuccess: onChanged,
  });
  return (
    <section aria-label="Rezultatele elevilor">
      <h2>Rezultatele elevilor</h2>
      {test.resultsOpen ? (
        <>
          <p>Elevii își pot vedea rezultatele pe linkurile lor.</p>
          <button type="button" className="button-quiet" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
            Oprește accesul la rezultate
          </button>
          <p className="hint">Linkurile cu rezultate și pozele lor nu se mai deschid până publici din nou rezultatele.</p>
        </>
      ) : (
        <>
          <p className="hint">Elevii își văd rezultatele pe linkurile lor numai după ce publici rezultatele.</p>
          <button type="button" className="button" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
            Publică rezultatele
          </button>
        </>
      )}
      {toggle.error && <ErrorMessage error={toggle.error} />}
    </section>
  );
}

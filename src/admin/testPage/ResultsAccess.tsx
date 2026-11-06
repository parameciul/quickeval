import { useMutation } from '@tanstack/react-query';
import type { TestInfo } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// Whether a test has results to publish or to stop: something is graded, or
// results are already open (for all, or for single uploads). Before that the
// teacher has nothing to decide, so the panel shows no button.
export function hasResultsToManage(test: Pick<TestInfo, 'status' | 'gradedCount' | 'resultsOpen' | 'publishedCount'>): boolean {
  return test.status !== 'draft' && (test.gradedCount > 0 || test.resultsOpen || test.publishedCount > 0);
}

// Opening and closing the students' result pages of a test for all students
// at once (redesign spec §8). While open, each student reads their own page
// from the link kept after sending (or shared by the teacher); while closed,
// those pages and their files do not open. Closing also takes back the
// results published alone (the API does it), so it closes every link.
export function ResultsAccess({ test, onChanged }: { test: TestInfo; onChanged: () => Promise<void> }) {
  const api = useApi();
  const toggle = useMutation({
    mutationFn: () => api.setResultsOpen(test.code, !test.resultsOpen),
    onSuccess: onChanged,
  });
  if (!hasResultsToManage(test)) return <p className="hint">Rezultatele se publică după corectare.</p>;
  return (
    <div className="results-access">
      {test.resultsOpen ? (
        <>
          <p>Rezultatele sunt publicate. Elevii le văd pe linkurile lor.</p>
          <p>
            <button type="button" className="button-quiet" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
              Oprește accesul la rezultate
            </button>
          </p>
          <p className="hint">Linkurile cu rezultate și pozele lor nu se mai deschid până publici din nou rezultatele.</p>
        </>
      ) : (
        <>
          {test.flagCount > 0 && (
            <p className="hint">
              Mai ai {countLabel(test.flagCount, 'punct de verificat', 'puncte de verificat')}. Dacă publici acum, elevii văd punctajul de
              acum.
            </p>
          )}
          <p>
            <button type="button" className="button" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
              Publică toate rezultatele
            </button>
          </p>
        </>
      )}
      {toggle.error && <ErrorMessage error={toggle.error} />}
    </div>
  );
}

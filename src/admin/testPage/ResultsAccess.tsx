import { useMutation } from '@tanstack/react-query';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// Whether a test has results to publish or to stop: something is graded, or
// results are already open (for all, or for single uploads). Before that the
// teacher has nothing to decide, so the page and the test card show no button.
export function hasResultsToManage(test: Pick<TestInfo, 'status' | 'gradedCount' | 'resultsOpen' | 'publishedCount'>): boolean {
  return test.status !== 'draft' && (test.gradedCount > 0 || test.resultsOpen || test.publishedCount > 0);
}

// Opening and closing the students' result pages of a test, for all
// students at once, or one upload at a time from the uploads table. While
// open, each student reads their own page from the link kept after sending
// (or shared by the teacher); while closed, those pages and their files do
// not open.
export function ResultsAccess({ test, uploads, onChanged }: { test: TestInfo; uploads: UploadRow[]; onChanged: () => Promise<void> }) {
  const api = useApi();
  const toggle = useMutation({
    mutationFn: () => api.setResultsOpen(test.code, !test.resultsOpen),
    onSuccess: onChanged,
  });
  // Uploads published alone while the class stays unpublished.
  const publishedAlone = test.resultsOpen ? 0 : uploads.filter((row) => row.submissionId !== null && row.resultsOpen).length;
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
          {publishedAlone > 0 && <p>{countLabel(publishedAlone, 'rezultat publicat individual', 'rezultate publicate individual')}.</p>}
          <button type="button" className="button" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
            Publică rezultatele
          </button>
          <p className="hint">Sau publică din tabel rezultatul unui singur elev, fără să le publici pe celelalte.</p>
        </>
      )}
      {toggle.error && <ErrorMessage error={toggle.error} />}
    </section>
  );
}

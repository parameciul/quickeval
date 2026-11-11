import type { TestInfo } from '../../../shared/api.ts';
import { MULTI_LABEL, UploadLink } from './UploadLink.tsx';

// Whether students can read results now: open for all, or some published alone.
export function hasPublishedResults(test: Pick<TestInfo, 'resultsOpen' | 'publishedCount'>): boolean {
  return test.resultsOpen || test.publishedCount > 0;
}

export const STUDENT_ACCESS_HELP =
  'Elevii care au trimis pozele de pe telefon își văd nota și explicațiile dacă deschid linkul lor cu rezultatul, păstrat pe același telefon. Rezultatul apare și când scanează din nou codul QR de pe test ori deschid linkul pentru elevi, de pe telefonul cu care au trimis pozele.';

// Shown once results are published: where students find their results. The
// students' link (with its QR code to download) is the one they scanned to
// upload, and on the same phone it gives back their kept result link. The
// multi-upload link is the teacher's: a student who opens it finds nothing.
export function StudentAccessCard({ test }: { test: Pick<TestInfo, 'code' | 'resultsOpen' | 'publishedCount' | 'uploadToken' | 'multiUploadToken'> }) {
  if (!hasPublishedResults(test)) return null;
  return (
    <section className="card student-access" aria-labelledby="student-access-title">
      <h3 id="student-access-title">Rezultatele sunt gata pentru elevi</h3>
      <p>{STUDENT_ACCESS_HELP}</p>
      {test.uploadToken !== null && (
        <div className="student-access-part">
          <UploadLink
            token={test.uploadToken}
            label="Linkul pentru elevi: trimite-l clasei"
            inputId="results-student-url"
            downloadName={`cod-qr-elevi-${test.code}.png`}
          />
        </div>
      )}
      {test.multiUploadToken !== null && (
        <div className="student-access-part student-access-teacher">
          <UploadLink token={test.multiUploadToken} label={MULTI_LABEL} inputId="results-multi-url" qr={false} />
          <p className="hint">Nu-l da elevilor: pe acest link ei nu își găsesc rezultatele.</p>
        </div>
      )}
    </section>
  );
}

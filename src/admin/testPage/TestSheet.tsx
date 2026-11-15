import { useId } from 'react';
import type { TestInfo } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatDateTime, studentCountLabel } from '../../ui/format.ts';
import { printFileUrl, testFileUrl } from '../api.ts';
import { StatusChip } from '../StatusChip.tsx';
import { subjectLine } from './SubjectForm.tsx';
import { UploadLink } from './UploadLink.tsx';

// The barem in a few words. Not its points: the API knows them only after the
// grading starts.
export function baremState(test: Pick<TestInfo, 'files' | 'barem'>): string {
  const { request, unchecked } = test.barem;
  if (request === 'requested') return 'se generează';
  if (test.files.barem === null || unchecked) {
    if (request === 'failed') return 'nu s-a putut genera';
    return test.files.barem === null ? 'lipsește' : 'de verificat';
  }
  return 'activ';
}

// "Fișa testului" (redesign spec §6): the facts and files of the test, its
// subject (spec: any subject) and the students' link while they may still need
// it. It shows beside every stage; the test's actions are in "Acțiuni"
// (`TestMenu.tsx`).
export function TestSheet({ test }: { test: TestInfo }) {
  const id = useId();
  // The printed QR code is the usual way in; the link here is for a student
  // without the printed test. It goes once the uploads have closed.
  const link = (test.status === 'draft' || test.status === 'open') && test.uploadToken !== null ? test.uploadToken : null;

  return (
    <section className="test-sheet" aria-labelledby={id}>
      <h2 id={id}>Fișa testului</h2>
      <dl className="sheet-facts">
        <dt>Clasa</dt>
        <dd>
          {displayClassName(test.className)} · {studentCountLabel(test.studentCount)}
        </dd>
        <dt>Codul</dt>
        <dd>{test.code}</dd>
        <dt>Materia</dt>
        <dd>{subjectLine(test)}</dd>
        <dt>Starea</dt>
        <dd>
          <StatusChip status={test.status} />
          {test.archived && <span className="tag">Arhivat</span>}
        </dd>
        <dt>Început</dt>
        <dd>{test.startedAt ? formatDateTime(test.startedAt) : 'neînceput'}</dd>
        {test.status !== 'draft' && (
          <>
            <dt>Au trimis</dt>
            <dd>
              {test.submittedCount} din {test.studentCount}
            </dd>
          </>
        )}
        <dt>Baremul</dt>
        <dd>{baremState(test)}</dd>
        {test.averageGrade !== null && (
          <>
            <dt>Media testului</dt>
            <dd>{formatPoints(test.averageGrade)}</dd>
          </>
        )}
      </dl>

      <div className="sheet-part">
        <h3>Fișiere</h3>
        <ul className="sheet-files">
          <SheetFile title="Testul" name={test.files.test?.name ?? null} href={testFileUrl(test.code, 'test')} />
          <SheetFile title="Baremul" name={test.files.barem?.name ?? null} href={testFileUrl(test.code, 'barem')} />
          {test.print.status === 'ready' && (
            <li>
              <a href={printFileUrl(test.code)} download>
                Testul cu cod QR
              </a>
              <span className="hint">PDF de tipărit</span>
            </li>
          )}
          {test.ces.files.test !== null && (
            <SheetFile title="Testul CES" name={test.ces.files.test.name} href={testFileUrl(test.code, 'test', 'ces')} />
          )}
          {test.ces.files.barem !== null && (
            <SheetFile title="Baremul CES" name={test.ces.files.barem.name} href={testFileUrl(test.code, 'barem', 'ces')} />
          )}
          {test.ces.print.status === 'ready' && (
            <li>
              <a href={printFileUrl(test.code, 'ces')} download>
                Testul CES cu cod QR
              </a>
              <span className="hint">PDF de tipărit</span>
            </li>
          )}
        </ul>
      </div>

      {link !== null && (
        <div className="sheet-part">
          <UploadLink token={link} />
          <p className="hint">
            {test.status === 'draft'
              ? 'Codul e pe testul tipărit. Elevii trimit lucrările după ce începi testul.'
              : 'Pentru un elev fără testul tipărit.'}
          </p>
        </div>
      )}
    </section>
  );
}

function SheetFile({ title, name, href }: { title: string; name: string | null; href: string }) {
  return (
    <li>
      {name === null ? (
        <>
          <span>{title}</span>
          <span className="hint">lipsește</span>
        </>
      ) : (
        <>
          <a href={href} target="_blank" rel="noopener">
            {title}
          </a>
          <span className="hint">{name}</span>
        </>
      )}
    </li>
  );
}

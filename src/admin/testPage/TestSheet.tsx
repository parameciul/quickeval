import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { MAX_TITLE_LENGTH } from '../../../shared/tests.ts';
import { formatDateTime, studentCountLabel } from '../../ui/format.ts';
import { printFileUrl, testFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { ArchiveDialog, hasOpenResults } from '../ArchiveDialog.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { StatusChip } from '../StatusChip.tsx';
import { SubjectChange, subjectLine } from './SubjectForm.tsx';
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
// subject (spec: any subject), the students' link while they may still need
// it, and renaming, archiving and deleting the test. It shows beside every stage.
export function TestSheet({
  test,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const id = useId();
  // The rename form opens in place of its button.
  const [renameOpen, setRenameOpen] = useState(false);
  // The archive closes the result pages: it asks first while some are open.
  const [askArchive, setAskArchive] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deleteTest(test.code),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tests'] });
      navigate('/');
    },
  });
  const archive = useMutation({
    mutationFn: (archived: boolean) => api.setTestArchived(test.code, archived),
    onSuccess: onChanged,
  });
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
        <dd className="sheet-subject">
          {subjectLine(test)}
          <SubjectChange test={test} onChanged={onChanged} onRobot={onRobot} />
        </dd>
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

      <div className="sheet-part sheet-actions">
        {renameOpen ? (
          <RenameTestForm code={test.code} currentTitle={test.title} onDone={onChanged} onClose={() => setRenameOpen(false)} />
        ) : (
          <button type="button" className="button-quiet button-small" onClick={() => setRenameOpen(true)}>
            Redenumește testul
          </button>
        )}
        {test.archived ? (
          <button type="button" className="button-quiet button-small" disabled={archive.isPending} onClick={() => archive.mutate(false)}>
            Scoate din arhivă
          </button>
        ) : (
          test.status === 'done' && (
            <>
              <button
                type="button"
                className="button-quiet button-small"
                disabled={archive.isPending}
                onClick={() => (hasOpenResults(test) ? setAskArchive(true) : archive.mutate(true))}
              >
                Arhivează testul
              </button>
              <p className="hint">Testul nu mai apare în lista clasei și în Teste. Îl găsești cu „Arată și testele arhivate”.</p>
            </>
          )
        )}
        {askArchive && (
          <ArchiveDialog
            title="Arhivezi testul?"
            text="Elevii nu își vor mai putea vedea rezultatele. Le poți publica din nou oricând."
            onConfirm={() => archive.mutate(true)}
            onClose={() => setAskArchive(false)}
          />
        )}
        {archive.error && <ErrorMessage error={archive.error} />}
        <button
          type="button"
          className="button-quiet button-small button-danger"
          disabled={remove.isPending}
          onClick={() => {
            // A printed test keeps its QR code: after a delete, the code leads nowhere.
            const printed = test.print.status === 'ready' ? ' Codurile QR de pe testele tipărite nu vor mai funcționa.' : '';
            if (window.confirm(`Ștergi testul ${test.code}? Se șterg și toate lucrările încărcate.${printed}`)) remove.mutate();
          }}
        >
          Șterge testul
        </button>
        <p className="hint">Se șterg și toate lucrările încărcate de elevi.</p>
        {remove.error && <ErrorMessage error={remove.error} />}
      </div>
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

function RenameTestForm({
  code,
  currentTitle,
  onDone,
  onClose,
}: {
  code: string;
  currentTitle: string;
  onDone: () => Promise<void>;
  onClose: () => void;
}) {
  const api = useApi();
  const [title, setTitle] = useState(currentTitle);
  const rename = useMutation({
    mutationFn: () => api.renameTest(code, title),
    onSuccess: async () => {
      onClose();
      await onDone();
    },
  });

  return (
    <form
      className="rename-form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        rename.mutate();
      }}
    >
      <label htmlFor="rename-test">Titlu nou</label>
      <input id="rename-test" type="text" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={MAX_TITLE_LENGTH} required />
      <span className="row-actions">
        <button className="button button-small" type="submit" disabled={rename.isPending}>
          Salvează
        </button>
        <button type="button" className="button-quiet button-small" onClick={onClose}>
          Renunță
        </button>
      </span>
      {rename.error && <ErrorMessage error={rename.error} />}
    </form>
  );
}

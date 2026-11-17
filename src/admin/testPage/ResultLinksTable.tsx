import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { UploadRow } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatResultCode } from '../../../shared/tests.ts';
import { countLabel } from '../../ui/format.ts';
import { studentResultUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { CesTag } from '../CesTag.tsx';
import { CopyRefused, useCopyLink } from '../CopyLink.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { GradeChip } from './GradeChip.tsx';
import { ActionIcon } from '../../ui/ActionIcon.tsx';

// A paper the student sent has a result link; a student who did not send one
// (no upload, or one still on the phone) has none.
function hasLink(row: UploadRow): row is UploadRow & { submissionId: number; startedAt: string } {
  return row.submissionId !== null && row.startedAt !== null && row.status !== 'none' && row.status !== 'uploading';
}

// "1 publicat · 26 nepublicate", or "toate publicate"; nothing while no
// student has a link. When the test does not keep every result open, but each
// paper was published alone, it says "toate publicate pe rând". `all` says
// whether every result is published (the label is green then).
export function linksCount(uploads: UploadRow[], testResultsOpen: boolean): { text: string; all: boolean } | null {
  const links = uploads.filter(hasLink);
  if (links.length === 0) return null;
  const published = links.filter((row) => row.resultsOpen).length;
  if (published === links.length) return { text: testResultsOpen ? 'toate publicate' : 'toate publicate pe rând', all: true };
  return { text: `${countLabel(published, 'publicat', 'publicate')} · ${countLabel(links.length - published, 'nepublicat', 'nepublicate')}`, all: false };
}

// The students' result links in the panel Rezultate (redesign spec §8): a row
// for each student, with the grade (in its colour, read first, with the points
// still to check apart), the points, the link to copy, and whether
// the result is published. Only a graded paper can be published alone; one
// already published can be stopped, also while it is graded again. While the
// test publishes every result, a row cannot be stopped alone: "Oprește
// accesul la rezultate" stops them all.
export function ResultLinksTable({
  code,
  uploads,
  resultsOpen,
  onChanged,
}: {
  code: string;
  uploads: UploadRow[];
  // Whether the test keeps results open for all students.
  resultsOpen: boolean;
  onChanged: () => Promise<void>;
}) {
  if (uploads.length === 0) return <p className="hint">Clasa nu are elevi. Adaugă-i din pagina clasei.</p>;
  return (
    <div className="table-wrap uploads-wrap">
      <table className="uploads result-links">
        <caption className="sr-only">Linkurile cu rezultatele elevilor</caption>
        <thead>
          <tr>
            <th scope="col">Elev</th>
            <th scope="col">Nota</th>
            <th scope="col">Punctaj</th>
            <th scope="col">Linkul cu rezultatul</th>
            <th scope="col">Stare</th>
          </tr>
        </thead>
        <tbody>
          {uploads.map((row) => (
            <ResultLinkRow key={row.studentId} code={code} row={row} testResultsOpen={resultsOpen} onChanged={onChanged} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultLinkRow({
  code,
  row,
  testResultsOpen,
  onChanged,
}: {
  code: string;
  row: UploadRow;
  testResultsOpen: boolean;
  onChanged: () => Promise<void>;
}) {
  const api = useApi();
  // Each action names the upload the row shows (`startedAt`).
  const publish = useMutation({
    mutationFn: ({ submissionId, startedAt, open }: { submissionId: number; startedAt: string; open: boolean }) =>
      api.setSubmissionResultsOpen(submissionId, startedAt, open),
    onSuccess: onChanged,
  });
  // The points and the grade show together, only for a paper graded now.
  const graded = row.status === 'graded';
  const points = graded && row.total !== null && row.maxTotal !== null ? `${formatPoints(row.total)} / ${formatPoints(row.maxTotal)}` : '—';
  return (
    <tr className={hasLink(row) ? undefined : 'is-muted'}>
      <th scope="row">
        {row.submissionId === null ? row.studentName : <Link to={`/tests/${code}/papers/${row.submissionId}`}>{row.studentName}</Link>}
        {(row.ces || row.variant === 'ces') && <CesTag />}
        {!row.active && <span className="tag">a plecat</span>}
      </th>
      <td data-label="Nota">
        {graded && row.grade !== null ? (
          <>
            <GradeChip grade={row.grade} />
            {row.flagCount > 0 && <span className="points-pill">{row.flagCount} de verificat</span>}
          </>
        ) : (
          '—'
        )}
      </td>
      <td data-label="Punctaj">{points}</td>
      <td className="result-link-cell">
        {hasLink(row) ? (
          <span className="result-link-with-code">
            {/* The short code the student types on the test's page; the
                teacher can read it out to a student who lost the link. */}
            {row.resultCode !== null && (
              <span className="result-code">
                <span className="sr-only">Codul </span>
                {formatResultCode(row.resultCode)}
              </span>
            )}
            <CopyResultLink
              key={row.submissionId}
              submissionId={row.submissionId}
              startedAt={row.startedAt}
              resultToken={row.resultToken}
              studentName={row.studentName}
              named
            />
          </span>
        ) : (
          'Nu a trimis lucrarea.'
        )}
      </td>
      <td className="result-state-cell">
        {hasLink(row) && (
          <span className="row-actions">
            {row.resultsOpen ? <span className="tag tag-ok">Publicat</span> : <span className="hint">Nepublicat</span>}
            {!testResultsOpen && (row.status === 'graded' || row.resultsOpen) && (
              <button
                type="button"
                className="button-quiet button-small"
                disabled={publish.isPending}
                aria-label={`${row.resultsOpen ? 'Oprește publicarea' : 'Publică'}: ${row.studentName}`}
                onClick={() => publish.mutate({ submissionId: row.submissionId, startedAt: row.startedAt, open: !row.resultsOpen })}
              >
                <ActionIcon name={row.resultsOpen ? 'eye-off' : 'eye'} />
                {row.resultsOpen ? 'Oprește publicarea' : 'Publică'}
              </button>
            )}
          </span>
        )}
        {publish.error && <ErrorMessage error={publish.error} />}
      </td>
    </tr>
  );
}

// "Copiază linkul" and "Deschide", which opens the student's result page in
// a new tab, as the student sees it. A paper sent before the links were made with the upload
// has none yet: "Fă linkul" makes it first, so the copy runs in its own tap
// (a browser may refuse a copy that comes after waiting for the API). When the
// browser refuses to copy, the link shows in a field, to copy by hand.
export function CopyResultLink({
  submissionId,
  startedAt,
  resultToken,
  studentName,
  named = false,
}: {
  submissionId: number;
  startedAt: string;
  resultToken: string | null;
  studentName: string;
  // Whether the buttons carry the student's name (a table of many students).
  named?: boolean;
}) {
  const api = useApi();
  const [made, setMade] = useState<string | null>(null);
  const { copied, refused, copy, field } = useCopyLink();
  const make = useMutation({
    mutationFn: () => api.getResultLink(submissionId, startedAt),
    onSuccess: setMade,
  });
  const token = resultToken ?? made;

  if (token === null) {
    return (
      <span className="result-share">
        <button
          type="button"
          className="button-quiet button-small"
          disabled={make.isPending}
          aria-label={named ? `Fă linkul: ${studentName}` : undefined}
          onClick={() => make.mutate()}
        >
          <ActionIcon name="link" />
          Fă linkul
        </button>
        {make.error && <ErrorMessage error={make.error} />}
      </span>
    );
  }
  const url = studentResultUrl(token);
  return (
    <span className="result-share">
      <button
        type="button"
        className="button-quiet button-small"
        aria-label={named && !copied ? `Copiază linkul: ${studentName}` : undefined}
        onClick={() => copy(url)}
      >
        <ActionIcon name={copied ? 'check' : 'copy'} />
        {copied ? 'Copiat!' : 'Copiază linkul'}
      </button>
      <a
        className="button-quiet button-small"
        href={url}
        target="_blank"
        rel="noopener"
        aria-label={named ? `Deschide rezultatul: ${studentName}` : undefined}
      >
        <ActionIcon name="open" />
        Deschide
      </a>
      {refused && <CopyRefused field={field} url={url} label={`Linkul cu rezultatul elevului ${studentName}`} />}
    </span>
  );
}

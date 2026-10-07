import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { UploadRow } from '../../../shared/api.ts';
import { formatDateTime, uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// Who uploaded what: one row per student of the class.
export function UploadsTable({ code, uploads, onChanged }: { code: string; uploads: UploadRow[]; onChanged: () => Promise<void> }) {
  if (uploads.length === 0) return <p className="hint">Clasa nu are elevi. Adaugă-i din pagina clasei.</p>;
  return (
    <div className="table-wrap">
      <table className="uploads">
        <caption className="sr-only">Încărcările elevilor</caption>
        <thead>
          <tr>
            <th scope="col">Elev</th>
            <th scope="col">Stare</th>
            <th scope="col">Fișiere</th>
            <th scope="col">Ora</th>
            <th scope="col">
              <span className="sr-only">Acțiuni</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {uploads.map((row) => (
            <UploadTableRow key={row.studentId} code={code} row={row} onChanged={onChanged} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UploadTableRow({ code, row, onChanged }: { code: string; row: UploadRow; onChanged: () => Promise<void> }) {
  const api = useApi();
  const reset = useMutation({
    mutationFn: (submissionId: number) => api.resetSubmission(submissionId),
    onSuccess: onChanged,
  });
  const time = row.submittedAt ?? row.startedAt;
  const submissionId = row.submissionId;

  return (
    <tr className={row.status === 'none' ? 'is-muted' : undefined}>
      <th scope="row">
        {row.studentName}
        {!row.active && <span className="tag">a plecat</span>}
      </th>
      <td>
        {uploadStatusLabel(row.status)}
        {row.autoSubmitted && <span className="tag">Fără confirmare</span>}
      </td>
      <td>{row.fileCount}</td>
      <td>{time ? formatDateTime(time) : '—'}</td>
      <td>
        {submissionId !== null && (
          <span className="row-actions">
            <Link to={`/teste/${code}/elevi/${submissionId}`}>Vezi fișierele</Link>
            <button
              type="button"
              className="button-quiet button-small"
              disabled={reset.isPending}
              onClick={() => {
                if (window.confirm(`Ștergi încărcarea elevului ${row.studentName}? Elevul o poate lua de la capăt.`)) {
                  reset.mutate(submissionId);
                }
              }}
            >
              Resetează
            </button>
          </span>
        )}
        {reset.error && <ErrorMessage error={reset.error} />}
      </td>
    </tr>
  );
}

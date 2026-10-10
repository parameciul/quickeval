import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { RobotStart, UploadRow } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatDateTime, uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// Who uploaded what: one row per student of the class, with the grade once
// the robot graded it.
export function UploadsTable({
  code,
  uploads,
  onChanged,
  onRobot,
}: {
  code: string;
  uploads: UploadRow[];
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
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
            <th scope="col">Nota</th>
            <th scope="col">De verificat</th>
            <th scope="col">
              <span className="sr-only">Acțiuni</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {uploads.map((row) => (
            <UploadTableRow key={row.studentId} code={code} row={row} onChanged={onChanged} onRobot={onRobot} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UploadTableRow({
  code,
  row,
  onChanged,
  onRobot,
}: {
  code: string;
  row: UploadRow;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const reset = useMutation({
    mutationFn: (submissionId: number) => api.resetSubmission(submissionId),
    onSuccess: onChanged,
  });
  const retry = useMutation({
    mutationFn: (submissionId: number) => api.retrySubmission(submissionId),
    onSuccess: async (robot) => {
      onRobot(robot);
      await onChanged();
    },
  });
  const regrade = useMutation({
    mutationFn: (submissionId: number) => api.regradeSubmission(submissionId),
    onSuccess: async (answer) => {
      onRobot(answer.robot);
      await onChanged();
    },
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
        {row.status === 'failed' && row.lastError && <p className="hint">{row.lastError}</p>}
      </td>
      <td>{row.fileCount}</td>
      <td>{time ? formatDateTime(time) : '—'}</td>
      <td>{row.grade === null ? '—' : formatPoints(row.grade)}</td>
      <td>{row.flagCount > 0 ? row.flagCount : '—'}</td>
      <td>
        {submissionId !== null && (
          <span className="row-actions">
            <Link to={`/teste/${code}/elevi/${submissionId}`}>Vezi lucrarea</Link>
            {row.status === 'failed' && (
              <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate(submissionId)}>
                Reîncearcă
              </button>
            )}
            {row.status === 'graded' && (
              <button
                type="button"
                className="button-quiet button-small"
                disabled={regrade.isPending}
                onClick={() => {
                  if (window.confirm(`Recorectezi lucrarea elevului ${row.studentName}? Corecturile tale se pierd.`)) {
                    regrade.mutate(submissionId);
                  }
                }}
              >
                Recorectează
              </button>
            )}
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
        {retry.error && <ErrorMessage error={retry.error} />}
        {regrade.error && <ErrorMessage error={regrade.error} />}
      </td>
    </tr>
  );
}

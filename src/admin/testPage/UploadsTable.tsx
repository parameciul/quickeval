import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { RobotStart, UploadRow } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatDateTime, uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { ResultLink } from './ResultLink.tsx';

// Who uploaded what: one row per student of the class, with the grade once
// the robot graded it. While the uploads are open, the teacher selects the
// uploads to grade now: one checkbox per row with files, and one in the header
// for all of them. While the results stay unpublished for the class, the
// teacher publishes them one upload at a time.
export function UploadsTable({
  code,
  uploads,
  selectable,
  selected,
  onSelect,
  onChanged,
  onRobot,
  resultsOpen,
}: {
  code: string;
  uploads: UploadRow[];
  // True while the test is open: the checkboxes choose the next evaluation.
  selectable: boolean;
  // The selected uploads (submission ids).
  selected: number[];
  onSelect: (ids: number[]) => void;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
  // Whether the test keeps results open for all students.
  resultsOpen: boolean;
}) {
  if (uploads.length === 0) return <p className="hint">Clasa nu are elevi. Adaugă-i din pagina clasei.</p>;
  const eligible = selectable ? uploads.filter((row) => canSelect(row)) : [];
  const eligibleIds = eligible.map((row) => row.submissionId!);
  const allChecked = eligibleIds.length > 0 && eligibleIds.every((id) => selected.includes(id));
  const someChecked = eligibleIds.some((id) => selected.includes(id));
  return (
    <div className="table-wrap">
      <table className="uploads">
        <caption className="sr-only">Încărcările elevilor</caption>
        <thead>
          <tr>
            {selectable && (
              <th scope="col">
                <input
                  type="checkbox"
                  aria-label="Selectează toate lucrările cu fișiere"
                  checked={allChecked}
                  ref={(input) => {
                    if (input) input.indeterminate = !allChecked && someChecked;
                  }}
                  disabled={eligibleIds.length === 0}
                  onChange={(event) => onSelect(event.target.checked ? eligibleIds : [])}
                />
              </th>
            )}
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
            <UploadTableRow
              key={row.studentId}
              code={code}
              row={row}
              selectable={selectable}
              checked={row.submissionId !== null && selected.includes(row.submissionId)}
              onToggle={(id, checked) => onSelect(checked ? [...selected, id] : selected.filter((kept) => kept !== id))}
              onChanged={onChanged}
              onRobot={onRobot}
              testResultsOpen={resultsOpen}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Only an upload with files that still waits for grading can be selected:
// graded uploads are done, failed ones need Reîncearcă.
function canSelect(row: UploadRow): boolean {
  return row.submissionId !== null && row.fileCount > 0 && (row.status === 'uploading' || row.status === 'submitted');
}

function UploadTableRow({
  code,
  row,
  selectable,
  checked,
  onToggle,
  onChanged,
  onRobot,
  testResultsOpen,
}: {
  code: string;
  row: UploadRow;
  selectable: boolean;
  checked: boolean;
  onToggle: (submissionId: number, checked: boolean) => void;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
  testResultsOpen: boolean;
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
    mutationFn: ({ submissionId, gradedAt }: { submissionId: number; gradedAt: string }) => api.regradeSubmission(submissionId, gradedAt),
    onSuccess: async (answer) => {
      onRobot(answer.robot);
      await onChanged();
    },
  });
  // One student's result page, while the class stays unpublished. Hidden once
  // the test publishes every result: then every page is open anyway.
  const publish = useMutation({
    mutationFn: ({ submissionId, open }: { submissionId: number; open: boolean }) => api.setSubmissionResultsOpen(submissionId, open),
    onSuccess: onChanged,
  });
  const time = row.submittedAt ?? row.startedAt;
  const submissionId = row.submissionId;
  const gradedAt = row.status === 'graded' ? row.gradedAt : null;

  return (
    <tr className={row.status === 'none' ? 'is-muted' : undefined}>
      {selectable && (
        <td>
          {row.submissionId !== null && canSelect(row) ? (
            <input
              type="checkbox"
              aria-label={`Selectează lucrarea elevului ${row.studentName}`}
              checked={checked}
              onChange={(event) => onToggle(row.submissionId!, event.target.checked)}
            />
          ) : null}
        </td>
      )}
      <th scope="row">
        {row.studentName}
        {!row.active && <span className="tag">a plecat</span>}
      </th>
      <td>
        {uploadStatusLabel(row.status)}
        {row.autoSubmitted && <span className="tag">Fără confirmare</span>}
        {row.resultsOpen && <span className="tag">Publicat</span>}
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
            {row.status !== 'uploading' && (
              <ResultLink submissionId={submissionId} resultToken={row.resultToken} testCode={code} studentName={row.studentName} />
            )}
            {row.status === 'failed' && (
              <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate(submissionId)}>
                Reîncearcă
              </button>
            )}
            {gradedAt !== null && (
              <button
                type="button"
                className="button-quiet button-small"
                disabled={regrade.isPending}
                onClick={() => {
                  if (window.confirm(`Recorectezi lucrarea elevului ${row.studentName}? Corecturile tale se pierd.`)) {
                    regrade.mutate({ submissionId, gradedAt });
                  }
                }}
              >
                Recorectează
              </button>
            )}
            {submissionId !== null && !testResultsOpen && row.status !== 'uploading' && (
              <button
                type="button"
                className="button-quiet button-small"
                disabled={publish.isPending}
                onClick={() => publish.mutate({ submissionId, open: !row.resultsOpen })}
              >
                {row.resultsOpen ? 'Oprește publicarea' : 'Publică'}
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
        {publish.error && <ErrorMessage error={publish.error} />}
      </td>
    </tr>
  );
}

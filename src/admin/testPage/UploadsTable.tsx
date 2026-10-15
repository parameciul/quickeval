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
    <div className="table-wrap uploads-wrap">
      <table className={`uploads${selectable ? ' is-selectable' : ''}`}>
        <caption className="sr-only">Încărcările elevilor</caption>
        <thead>
          <tr>
            {selectable && (
              <th scope="col" className="select-col">
                <label className="select-all">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(input) => {
                      if (input) input.indeterminate = !allChecked && someChecked;
                    }}
                    disabled={eligibleIds.length === 0}
                    onChange={(event) => onSelect(event.target.checked ? eligibleIds : [])}
                  />
                  <span className="sr-only select-all-text">Selectează toate lucrările cu fișiere</span>
                </label>
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

// Row classes for the narrow-screen cards, read from the markup instead of
// CSS :has(): has-select puts the checkbox next to the name. Older phone
// browsers that miss :has() would stack the box over the name instead.
function rowClassName(row: UploadRow, selectable: boolean): string | undefined {
  const classes = [];
  if (row.status === 'none') classes.push('is-muted');
  if (selectable && canSelect(row)) classes.push('has-select');
  return classes.length > 0 ? classes.join(' ') : undefined;
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
  // Each action on the upload names the upload the row shows (`startedAt`).
  const reset = useMutation({
    mutationFn: ({ submissionId, startedAt }: { submissionId: number; startedAt: string }) => api.resetSubmission(submissionId, startedAt),
    onSuccess: onChanged,
  });
  const retry = useMutation({
    mutationFn: ({ submissionId, startedAt }: { submissionId: number; startedAt: string }) => api.retrySubmission(submissionId, startedAt),
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
    mutationFn: ({ submissionId, startedAt, open }: { submissionId: number; startedAt: string; open: boolean }) =>
      api.setSubmissionResultsOpen(submissionId, startedAt, open),
    onSuccess: onChanged,
  });
  const time = row.submittedAt ?? row.startedAt;
  const submissionId = row.submissionId;
  const startedAt = row.startedAt;
  const gradedAt = row.status === 'graded' ? row.gradedAt : null;

  return (
    <tr className={rowClassName(row, selectable)}>
      {selectable && (
        <td className="select-cell">
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
      <td data-label="Stare">
        {uploadStatusLabel(row.status)}
        {row.autoSubmitted && <span className="tag">Fără confirmare</span>}
        {row.resultsOpen && <span className="tag">Publicat</span>}
        {row.status === 'failed' && row.lastError && <p className="hint">{row.lastError}</p>}
      </td>
      <td data-label="Fișiere">{row.fileCount}</td>
      <td data-label="Ora">{time ? formatDateTime(time) : '—'}</td>
      <td data-label="Nota">{row.grade === null ? '—' : formatPoints(row.grade)}</td>
      <td data-label="De verificat">{row.flagCount > 0 ? row.flagCount : '—'}</td>
      <td className="actions-cell">
        {submissionId !== null && startedAt !== null && (
          <span className="row-actions">
            <Link to={`/teste/${code}/elevi/${submissionId}`}>Vezi lucrarea</Link>
            {row.status !== 'uploading' && (
              <ResultLink
                submissionId={submissionId}
                startedAt={startedAt}
                resultToken={row.resultToken}
                testCode={code}
                studentName={row.studentName}
              />
            )}
            {row.status === 'failed' && (
              <button
                type="button"
                className="button-quiet button-small"
                disabled={retry.isPending}
                onClick={() => retry.mutate({ submissionId, startedAt })}
              >
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
            {!testResultsOpen && row.status !== 'uploading' && (
              <button
                type="button"
                className="button-quiet button-small"
                disabled={publish.isPending}
                onClick={() => publish.mutate({ submissionId, startedAt, open: !row.resultsOpen })}
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
                  reset.mutate({ submissionId, startedAt });
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

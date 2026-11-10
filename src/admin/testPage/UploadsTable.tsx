import { useMutation } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import type { RobotStart, UploadRow } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatDateTime, modelCell, uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { CesTag } from '../CesTag.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSmallMenu } from '../shell/useSmallMenu.ts';

// Who uploaded what: one row per student of the class, with the grade once
// the robot graded it. While the uploads are open, the teacher selects the
// uploads to grade now: one checkbox per row with files, and one in the header
// for all of them. The result links and their publishing are in the panel
// Rezultate (ResultLinksTable), not here.
export function UploadsTable({
  code,
  uploads,
  showModel,
  selectable,
  selected,
  onSelect,
  onChanged,
  onRobot,
}: {
  code: string;
  uploads: UploadRow[];
  // The Setări checkbox: show the model and effort of each grading.
  showModel: boolean;
  // True while the test is open: the checkboxes choose the next evaluation.
  selectable: boolean;
  // The selected uploads (submission ids).
  selected: number[];
  onSelect: (ids: number[]) => void;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
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
            {showModel && <th scope="col">Model</th>}
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
              showModel={showModel}
              selectable={selectable}
              checked={row.submissionId !== null && selected.includes(row.submissionId)}
              onToggle={(id, checked) => onSelect(checked ? [...selected, id] : selected.filter((kept) => kept !== id))}
              onChanged={onChanged}
              onRobot={onRobot}
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
  showModel,
  selectable,
  checked,
  onToggle,
  onChanged,
  onRobot,
}: {
  code: string;
  row: UploadRow;
  showModel: boolean;
  selectable: boolean;
  checked: boolean;
  onToggle: (submissionId: number, checked: boolean) => void;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
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
        {(row.ces || row.variant === 'ces') && <CesTag />}
        {!row.active && <span className="tag">a plecat</span>}
      </th>
      <td data-label="Stare">
        {row.status === 'uploading' ? (row.fileCount > 0 ? 'Deschis, cu fișiere' : 'Deschis, fără fișiere') : uploadStatusLabel(row.status)}
        {row.status === 'uploading' && (
          <p className="hint">
            {row.fileCount > 0
              ? 'Elevul a adăugat poze, dar nu a apăsat „Am trimis tot”. Numele rămâne blocat până termină sau până îl deblochezi.'
              : 'Elevul a ales numele, dar nu a adăugat nimic. Dacă a ales numele greșit, deblochează-l.'}
          </p>
        )}
        {row.autoSubmitted && row.status !== 'graded' && <span className="tag">Fără confirmare</span>}
        {row.resultsOpen && <span className="tag">Publicat</span>}
        {row.status === 'failed' && row.lastError && <p className="hint">{row.lastError}</p>}
      </td>
      <td data-label="Fișiere">{row.fileCount}</td>
      <td data-label="Ora">{time ? formatDateTime(time) : '—'}</td>
      <td data-label="Nota">{row.grade === null ? '—' : formatPoints(row.grade)}</td>
      {showModel && <td data-label="Model">{modelCell(row.model, row.effort)}</td>}
      <td data-label="De verificat">{row.flagCount > 0 ? row.flagCount : '—'}</td>
      <td className="actions-cell">
        {submissionId !== null && startedAt !== null && (
          <span className="row-actions">
            <Link to={`/teste/${code}/elevi/${submissionId}`}>Vezi lucrarea</Link>
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
            {row.status === 'uploading' && (
              <button
                type="button"
                className="button-quiet button-small"
                disabled={reset.isPending}
                onClick={() => {
                  const message =
                    row.fileCount > 0
                      ? `Ștergi cele ${row.fileCount} fișiere ale elevului ${row.studentName} și deblochezi numele? Elevul poate începe de la capăt.`
                      : `Deblochezi numele ${row.studentName}? Elevul poate alege din nou numele. Nu se pierde nimic.`;
                  if (window.confirm(message)) reset.mutate({ submissionId, startedAt });
                }}
              >
                {row.fileCount > 0 ? 'Șterge și deblochează' : 'Deblochează'}
              </button>
            )}
            {row.status !== 'uploading' && (
              <RowMenu
                studentName={row.studentName}
                menuId={`upload-menu-${submissionId}`}
                items={[
                  ...(gradedAt !== null
                    ? [
                        {
                          label: 'Recorectează',
                          busy: regrade.isPending,
                          onChoose: () => {
                            if (window.confirm(`Recorectezi lucrarea elevului ${row.studentName}? Corecturile tale se pierd.`)) {
                              regrade.mutate({ submissionId, gradedAt });
                            }
                          },
                        },
                      ]
                    : []),
                  {
                    label: 'Resetează',
                    danger: true,
                    busy: reset.isPending,
                    onChoose: () => {
                      if (window.confirm(`Ștergi încărcarea elevului ${row.studentName}? Elevul o poate lua de la capăt.`)) {
                        reset.mutate({ submissionId, startedAt });
                      }
                    },
                  },
                ]}
              />
            )}
          </span>
        )}
        {reset.error && <ErrorMessage error={reset.error} />}
        {retry.error && <ErrorMessage error={retry.error} />}
        {regrade.error && <ErrorMessage error={regrade.error} />}
      </td>
    </tr>
  );
}

type RowMenuItem = { label: string; danger?: boolean; busy: boolean; onChoose(): void };

// A row's rarer actions under ⋯ (the link to the paper and "Reîncearcă" stay
// on the row, so a row fits on one line). The table scrolls sideways in its
// box, which would cut off a menu inside it: the menu is fixed to the screen,
// under ⋯ (or over it when the screen ends below), and closes when anything
// scrolls or the screen changes size. An item closes the menu and gives the
// focus back to ⋯ before it asks or acts.
function RowMenu({ studentName, menuId, items }: { studentName: string; menuId: string; items: RowMenuItem[] }) {
  const { open, toggle, box, button } = useSmallMenu<HTMLSpanElement>();
  const menu = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const at = button.current.getBoundingClientRect();
    const height = menu.current?.offsetHeight ?? 0;
    // The screen without its scrollbars: what `right` and `bottom` count from.
    const { clientWidth, clientHeight } = document.documentElement;
    const right = clientWidth - at.right;
    const below = at.bottom + GAP + height <= clientHeight;
    setPlace(below ? { top: at.bottom + GAP, right } : { bottom: clientHeight - at.top + GAP, right });
  }, [open, button]);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.type === 'scroll' && menu.current?.contains(event.target as Node)) return;
      toggle();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, toggle]);

  const run = (action: () => void) => () => {
    toggle();
    button.current?.focus();
    action();
  };

  return (
    <span className="class-more row-more" ref={box}>
      <button
        ref={button}
        type="button"
        className="class-more-button row-more-button"
        aria-label={`Mai multe pentru ${studentName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
      >
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="3.5" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="12.5" cy="8" r="1.4" />
        </svg>
      </button>
      {open && (
        <div ref={menu} className="class-menu row-menu" id={menuId} role="menu" style={place}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.danger ? 'class-menu-item is-danger' : 'class-menu-item'}
              disabled={item.busy}
              onClick={run(item.onChoose)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// The space between ⋯ and its menu, in pixels.
const GAP = 8;

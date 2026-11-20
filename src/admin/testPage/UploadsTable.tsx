import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import type { RobotStart, UploadRow } from '../../../shared/api.ts';
import { formatDateTime, modelCell, uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { CesTag } from '../CesTag.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSmallMenu } from '../shell/useSmallMenu.ts';
import { GradeChip } from './GradeChip.tsx';
import { heldBackHint, PAPER_PART_LABEL } from './paperCounts.ts';
import { canSelect, selectableIds } from './selection.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { t } from '../../i18n/t.ts';
import { translateMessage } from '../../../shared/i18n/messages.ts';

// Who uploaded what: one row per student of the class, with the grade once
// the robot graded it, next to the name, in its colour, as in the table of
// Rezultate. The table takes the full width of its card; the model
// of a grading, when the setting shows it, is one line of the row's ⋯ menu. While the uploads are open, the teacher chooses the
// uploads to grade now: one checkbox per row with files, and one in the header
// for all of them. Every such upload starts checked; the teacher unchecks the
// ones to grade later. The result links and their publishing are in the panel
// Rezultate (ResultLinksTable), not here.
export function UploadsTable({
  code,
  uploads,
  showModel,
  uploadsClosed,
  uploadsPaused = false,
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
  // The uploads are closed (the test is in evaluation or done): a student who
  // sent nothing did not take part.
  uploadsClosed: boolean;
  // An open test whose uploads the teacher closed: a student still sending
  // cannot finish until they open again.
  uploadsPaused?: boolean;
  // True while the test is open: the checkboxes choose the next evaluation.
  selectable: boolean;
  // The selected uploads (submission ids).
  selected: number[];
  onSelect: (ids: number[]) => void;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  if (uploads.length === 0) return <p className="hint">{t('Clasa nu are elevi. Adaugă-i din pagina clasei.')}</p>;
  const eligibleIds = selectable ? selectableIds(uploads) : [];
  const allChecked = eligibleIds.length > 0 && eligibleIds.every((id) => selected.includes(id));
  const someChecked = eligibleIds.some((id) => selected.includes(id));
  return (
    <div className="table-wrap uploads-wrap">
      <table className={`uploads${selectable ? ' is-selectable' : ''}`}>
        <caption className="sr-only">{t('Încărcările elevilor')}</caption>
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
                  <span className="sr-only select-all-text">{t('Selectează toate lucrările cu fișiere')}</span>
                </label>
              </th>
            )}
            <th scope="col">{t('Elev')}</th>
            <th scope="col">{t('Nota')}</th>
            <th scope="col">{t('Stare')}</th>
            <th scope="col">{t('Fișiere')}</th>
            <th scope="col">{t('Ora')}</th>
            <th scope="col">{t('De verificat')}</th>
            <th scope="col">
              <span className="sr-only">{t('Acțiuni')}</span>
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
              uploadsClosed={uploadsClosed}
              uploadsPaused={uploadsPaused}
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

// Row classes for the narrow-screen cards, read from the markup instead of
// CSS :has(): has-select puts the checkbox next to the name. Older phone
// browsers that miss :has() would stack the box over the name instead.
function rowClassName(row: UploadRow, selectable: boolean): string | undefined {
  const classes = [];
  if (row.status === 'none') classes.push('is-muted');
  if (selectable && canSelect(row)) classes.push('has-select');
  return classes.length > 0 ? classes.join(' ') : undefined;
}

// The State cell, once the uploads are closed: a paper held back from
// grading (`uploading`, with its files) waits for the teacher, and a
// student with no file did not take part.
function stateOf(row: UploadRow, uploadsClosed: boolean, uploadsPaused: boolean, heldBackText: string): { label: string; hint: string | null } {
  if (row.status === 'uploading') {
    if (uploadsClosed) {
      return row.fileCount > 0
        ? { label: PAPER_PART_LABEL.waiting, hint: heldBackText }
        : { label: t('Nu a participat'), hint: null };
    }
    return row.fileCount > 0
      ? {
          label: t('Deschis, cu fișiere'),
          hint: uploadsPaused
            ? t('Elevul a adăugat poze, dar nu a apăsat „Am trimis tot”, iar încărcarea e închisă. Lucrarea se corectează cât e bifată; elevul o poate termina după ce redeschizi încărcarea.')
            : t('Elevul a adăugat poze, dar nu a apăsat „Am trimis tot”. Numele rămâne blocat până termină sau până îl deblochezi.'),
        }
      : { label: t('Deschis, fără fișiere'), hint: t('Elevul a ales numele, dar nu a adăugat nimic. Dacă a ales numele greșit, deblochează-l.') };
  }
  if (row.status === 'none' && uploadsClosed) return { label: t('Nu a participat'), hint: null };
  return { label: uploadStatusLabel(row.status), hint: null };
}

function UploadTableRow({
  code,
  row,
  showModel,
  uploadsClosed,
  uploadsPaused,
  selectable,
  checked,
  onToggle,
  onChanged,
  onRobot,
}: {
  code: string;
  row: UploadRow;
  showModel: boolean;
  uploadsClosed: boolean;
  uploadsPaused: boolean;
  selectable: boolean;
  checked: boolean;
  onToggle: (submissionId: number, checked: boolean) => void;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
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
  const state = stateOf(row, uploadsClosed, uploadsPaused, heldBackHint(me.data));
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
              aria-label={t('Selectează lucrarea elevului {studentName}', { studentName: row.studentName })}
              checked={checked}
              onChange={(event) => onToggle(row.submissionId!, event.target.checked)}
            />
          ) : null}
        </td>
      )}
      <th scope="row">
        {row.studentName}
        {(row.ces || row.variant === 'ces') && <CesTag />}
        {!row.active && <span className="tag">{t('a plecat')}</span>}
      </th>
      <td data-label={t('Nota')}>{row.grade === null ? '—' : <GradeChip grade={row.grade} />}</td>
      <td data-label={t('Stare')}>
        {state.label}
        {state.hint !== null && <p className="hint">{state.hint}</p>}
        {row.autoSubmitted && row.status !== 'graded' && <span className="tag">{t('Fără confirmare')}</span>}
        {row.resultsOpen && <span className="tag">{t('Publicat')}</span>}
        {row.status === 'failed' && row.lastError && <p className="hint">{translateMessage(row.lastError)}</p>}
      </td>
      <td data-label={t('Fișiere')}>{row.fileCount}</td>
      <td data-label={t('Ora')}>{time ? formatDateTime(time) : '—'}</td>
      <td data-label={t('De verificat')}>{row.flagCount > 0 ? <span className="points-pill">{t('{flagCount} de verificat', { flagCount: row.flagCount })}</span> : '—'}</td>
      <td className="actions-cell">
        {submissionId !== null && startedAt !== null && (
          <span className="row-actions">
            <Link to={`/tests/${code}/papers/${submissionId}`}>{t('Vezi lucrarea')}</Link>
            {row.status === 'failed' && (
              <button
                type="button"
                className="button-quiet button-small"
                disabled={retry.isPending}
                onClick={() => retry.mutate({ submissionId, startedAt })}
              >
                <ActionIcon name="retry" />
                {t('Reîncearcă')}
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
                      ? t('Ștergi cele {fileCount} fișiere ale elevului {studentName} și deblochezi numele? Elevul poate începe de la capăt.', { fileCount: row.fileCount, studentName: row.studentName })
                      : t('Deblochezi numele {studentName}? Elevul poate alege din nou numele. Nu se pierde nimic.', { studentName: row.studentName });
                  if (window.confirm(message)) reset.mutate({ submissionId, startedAt });
                }}
              >
                <ActionIcon name="unlock" />
                {row.fileCount > 0 ? t('Șterge și deblochează') : t('Deblochează')}
              </button>
            )}
            {row.status !== 'uploading' && (
              <RowMenu
                studentName={row.studentName}
                menuId={`upload-menu-${submissionId}`}
                note={showModel && row.model ? `Model: ${modelCell(row.model, row.effort)}` : undefined} // i18n-ignore: "Model" in both languages
                items={[
                  ...(gradedAt !== null
                    ? [
                        {
                          label: t('Recorectează'),
                          busy: regrade.isPending,
                          onChoose: () => {
                            if (window.confirm(t('Recorectezi lucrarea elevului {studentName}? Corecturile tale se pierd.', { studentName: row.studentName }))) {
                              regrade.mutate({ submissionId, gradedAt });
                            }
                          },
                        },
                      ]
                    : []),
                  {
                    label: t('Resetează'),
                    danger: true,
                    busy: reset.isPending,
                    onChoose: () => {
                      if (window.confirm(t('Ștergi încărcarea elevului {studentName}? Elevul o poate lua de la capăt.', { studentName: row.studentName }))) {
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
// on the row, so a row fits on one line), with `note` (the model) above them. The table scrolls sideways in its
// box, which would cut off a menu inside it: the menu is fixed to the screen,
// under ⋯ (or over it when the screen ends below), and closes when anything
// scrolls or the screen changes size. An item closes the menu and gives the
// focus back to ⋯ before it asks or acts.
function RowMenu({ studentName, menuId, note, items }: { studentName: string; menuId: string; note?: string; items: RowMenuItem[] }) {
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
        aria-label={t('Mai multe pentru {studentName}', { studentName })}
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
        <div
          ref={menu}
          className="class-menu row-menu"
          id={menuId}
          role="menu"
          aria-describedby={note !== undefined ? `${menuId}-note` : undefined}
          style={place}
        >
          {note !== undefined && (
            <p className="row-menu-note" id={`${menuId}-note`} role="none">
              {note}
            </p>
          )}
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

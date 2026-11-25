import { useEffect, useId } from 'react';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { PHONE, useMediaQuery } from '../../ui/useMediaQuery.ts';
import type { ActionIconName } from '../../ui/ActionIcon.tsx';
import { canShareFiles } from '../pdf/share.ts';
import { useSmallMenu } from '../shell/useSmallMenu.ts';
import { canCopyImages, isPhoto, usePaperFiles, type FilesNote } from './paperFiles.ts';
import { t } from '../../i18n/t.ts';

// One item of the paper's menu: the word shown, and the name a reader hears.
type PageAction = { shown: string; label: string; icon: ActionIconName; busy: boolean; onChoose: () => void };

// The paper's download button, in the head of the paper (beside the
// exercises, in the open row on a phone, and over the whole screen). Its menu
// holds the page on show, to copy (for an image editor) and to save, then
// every page in one ZIP. On a phone it opens from the bottom of the screen,
// and saving a page opens the phone's share sheet (the photos, a chat).
export function PageDownload({ submission, page }: { submission: SubmissionDetail; page: number }) {
  const { open, toggle, box, button } = useSmallMenu<HTMLDivElement>();
  const files = usePaperFiles(submission);
  const phone = useMediaQuery(PHONE);
  // The share sheet only on a touch screen: a narrow window on a computer
  // downloads, as a wide one does.
  const touch = useMediaQuery('(pointer: coarse)');
  const menuId = useId();
  const { forget } = files;
  // Only a new page clears the line, not a new render.
  useEffect(() => forget(), [page]);
  const file = submission.files[page];
  if (!file) return null;
  const n = page + 1;
  const count = submission.files.length;
  const share = phone && touch && canShareFiles();

  // One short line each: the page buttons beside already say which page.
  // The name a reader hears still starts with the word shown and adds it.
  const actions: PageAction[] = [];
  if (isPhoto(file) && canCopyImages()) {
    actions.push({ shown: t('Copiază'), label: t('Copiază pagina {n}', { n }), icon: 'copy', busy: false, onChoose: () => void files.copyPage(page) });
  }
  actions.push(
    share
      ? { shown: t('Salvează sau trimite'), label: t('Salvează sau trimite pagina {n}', { n }), icon: 'share', busy: false, onChoose: () => void files.savePage(page, true) }
      : { shown: t('Descarcă'), label: t('Descarcă pagina {n}', { n }), icon: 'download', busy: false, onChoose: () => void files.savePage(page, false) },
  );
  if (count > 1) {
    actions.push({
      shown: t('Descarcă toate'),
      label: t('Descarcă toate paginile ({count})', { count }),
      icon: 'download',
      busy: files.note?.kind === 'busy',
      onChoose: () => void files.saveAll(),
    });
  }

  // The choice runs inside the click: the clipboard and the share sheet
  // take it only there.
  const run = (action: PageAction) => () => {
    toggle();
    button.current?.focus();
    action.onChoose();
  };
  return (
    <div className="page-download" ref={box}>
      <button
        ref={button}
        type="button"
        className="button-quiet button-small icon-button page-download-button"
        aria-label={t('Descarcă sau copiază')}
        title={t('Descarcă sau copiază')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (!open) files.prefetch(page);
          toggle();
        }}
      >
        <ActionIcon name="download" />
      </button>
      {/* On a phone the sheet dims the page: a tap there closes it, and
          only it, never a button of the page under it. */}
      {open && <div className="page-download-backdrop" aria-hidden="true" onClick={toggle} />}
      {open && (
        <div className="class-menu paper-actions-menu page-download-menu" id={menuId} role="menu" aria-label={t('Pagina {n} din {count}', { n, count })}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className="paper-action is-short"
              aria-label={action.label}
              disabled={action.busy}
              onClick={run(action)}
            >
              <ActionIcon name={action.icon} />
              <span className="paper-action-label">{action.shown}</span>
            </button>
          ))}
        </div>
      )}
      <FilesNoteLine note={files.note} className="page-download-note" />
    </div>
  );
}

// The line of what a choice did: drawn while there is something to say, and
// read out through a live region that is always in the page (a screen reader
// says only a change of one it already knows). A failure is an alert.
export function FilesNoteLine({ note, className }: { note: FilesNote | null; className: string }) {
  return (
    <>
      <span className="sr-only" aria-live="polite">
        {note && note.kind !== 'failed' ? note.text : ''}
      </span>
      {note && (
        <span className={`${className} is-${note.kind}`} role={note.kind === 'failed' ? 'alert' : undefined} aria-hidden={note.kind === 'failed' ? undefined : true}>
          {note.text}
        </span>
      )}
    </>
  );
}

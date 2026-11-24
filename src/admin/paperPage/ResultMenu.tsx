import { useMutation } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { studentResultUrl } from '../api.ts';
import { Chevron } from '../ActionsMenu.tsx';
import { useApi } from '../ApiContext.tsx';
import { CopyRefused, useCopyLink } from '../CopyLink.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { usePdfFile, type PdfFile } from '../pdf/PdfActions.tsx';
import { canShareFiles } from '../pdf/share.ts';
import { useSmallMenu } from '../shell/useSmallMenu.ts';
import { ActionIcon, type ActionIconName } from '../../ui/ActionIcon.tsx';
import { shareLink } from '../../ui/shareLink.ts';
import { t } from '../../i18n/t.ts';

// "Rezultatul elevului" in the head of a graded paper: one button that shows
// whether the result is published, and opens a small panel with what the
// teacher gives the student: the result link (copy it, send it, open it) and
// the student's PDF (download it, send it). The sends show only where the
// device has a share sheet; elsewhere they would only copy or save.
export function ResultMenu({ submission, pdf }: { submission: SubmissionDetail; pdf: PdfFile }) {
  const api = useApi();
  const panelId = useId();
  const { open, toggle, box, button } = useSmallMenu<HTMLDivElement>();
  const [made, setMade] = useState<string | null>(null);
  const token = submission.resultToken ?? made;
  const url = token === null ? null : studentResultUrl(token);
  const { copied, refused, copy, field } = useCopyLink();
  const [linkShares] = useState(() => typeof navigator.share === 'function');
  const [pdfShares] = useState(canShareFiles);
  const file = usePdfFile(pdf);
  // A paper sent before the links were made with the upload has none yet.
  const make = useMutation({
    mutationFn: () => api.getResultLink(submission.id, submission.startedAt),
    onSuccess: setMade,
  });
  const published = submission.resultsOpen;

  const sendLink = async (link: string) => {
    const sent = await shareLink({ url: link, title: `${submission.testCode} · ${submission.studentName}` });
    // No share sheet and no clipboard: the field shows the link to copy by hand.
    if (sent === 'manual') await copy(link);
  };

  return (
    <div className="paper-actions result-menu" ref={box}>
      <button
        ref={button}
        type="button"
        className="button-quiet button-small result-menu-button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        <ActionIcon name="link" />
        <span className="result-menu-label">{t('Rezultatul elevului')}</span>
        <span className={published ? 'tag tag-ok' : 'tag'}>{published ? t('Publicat') : t('Nepublicat')}</span>
        <Chevron />
      </button>
      {open && (
        <div className="class-menu paper-actions-menu result-panel" id={panelId} role="group" aria-label={t('Rezultatul elevului')}>
          <p className="result-panel-state">
            {published ? t('Elevul își poate vedea rezultatul.') : t('Elevul nu vede rezultatul încă. Linkul merge după ce publici rezultatul.')}
          </p>
          {!published && (
            <PanelItem
              icon="arrow"
              label={t('Mergi la Rezultate')}
              hint={t('Acolo publici rezultatele clasei sau doar pe al acestui elev.')}
              to={`/tests/${submission.testCode}#results`}
            />
          )}
          <p className="result-panel-group">{t('Linkul cu rezultatul')}</p>
          {url === null ? (
            <PanelItem
              icon="link"
              label={t('Fă linkul')}
              hint={t('Lucrarea nu are încă niciun link.')}
              busy={make.isPending}
              onClick={() => make.mutate()}
            />
          ) : (
            <>
              <PanelItem
                icon={copied ? 'check' : 'copy'}
                label={copied ? t('Copiat!') : t('Copiază linkul')}
                hint={t('Îl lipești într-un email sau într-un mesaj.')}
                onClick={() => copy(url)}
              />
              {linkShares && <PanelItem icon="send" label={t('Trimite linkul')} hint={t('WhatsApp, email și altele.')} onClick={() => sendLink(url)} />}
              <PanelItem icon="open" label={t('Deschide rezultatul')} hint={t('Vezi ce vede elevul.')} href={url} />
              {refused && <CopyRefused field={field} url={url} label={t('Linkul cu rezultatul elevului {studentName}', { studentName: submission.studentName })} />}
            </>
          )}
          {make.error && <ErrorMessage error={make.error} />}
          <p className="result-panel-group">{t('PDF-ul elevului')}</p>
          <PanelItem
            icon="file"
            label={t('Descarcă PDF')}
            hint={t('Nota și comentariile, de tipărit sau de păstrat.')}
            busy={file.busy}
            onClick={() => file.run('download')}
          />
          {pdfShares && (
            <PanelItem icon="send" label={t('Trimite PDF-ul')} hint={t('WhatsApp, email și altele.')} busy={file.busy} onClick={() => file.run('share')} />
          )}
          {file.busy && (
            <p className="result-panel-note" role="status">
              {t('Se face PDF-ul…')}
            </p>
          )}
          {file.message && (
            <p className="result-panel-note" role="status">
              {file.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// One line of the panel: the icon of its verb, its name, and under it what it
// does (its accessible description; the name is the label alone). A button, a link inside the app (`to`) or
// a link that opens in a new tab (`href`).
function PanelItem({
  icon,
  label,
  hint,
  busy = false,
  onClick,
  to,
  href,
}: {
  icon: ActionIconName;
  label: string;
  hint: string;
  busy?: boolean;
  onClick?: () => void;
  to?: string;
  href?: string;
}) {
  const hintId = useId();
  const inside: ReactNode = (
    <>
      <ActionIcon name={icon} />
      <span className="paper-action-label">{label}</span>
      <span className="paper-action-hint" id={hintId}>
        {hint}
      </span>
    </>
  );
  if (to !== undefined) {
    return (
      <Link className="paper-action" to={to} aria-label={label} aria-describedby={hintId}>
        {inside}
      </Link>
    );
  }
  if (href !== undefined) {
    return (
      <a className="paper-action" href={href} target="_blank" rel="noopener noreferrer" aria-label={label} aria-describedby={hintId}>
        {inside}
      </a>
    );
  }
  return (
    <button type="button" className="paper-action" disabled={busy} aria-label={label} aria-describedby={hintId} onClick={onClick}>
      {inside}
    </button>
  );
}

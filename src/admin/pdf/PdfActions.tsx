import { useState } from 'react';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { renderPdf } from './renderPdf.ts';
import { saveFile, shareFile } from './share.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { t } from '../../i18n/t.ts';

export interface PdfFile {
  // Made when a button is pressed, not with every render of the page.
  build: () => TDocumentDefinitions;
  fileName: string;
  // The name that the share sheet shows.
  title: string;
}

// Makes a PDF when it is asked for, and saves it or hands it to the share
// sheet. `busy` while it is made; `message` says what went wrong, or that the
// PDF was saved because this device cannot send it.
export function usePdfFile(pdf: PdfFile) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (action: 'download' | 'share') => {
    setBusy(true);
    setMessage(null);
    try {
      const blob = await renderPdf(pdf.build());
      if (action === 'download') {
        saveFile(blob, pdf.fileName);
      } else if ((await shareFile(blob, pdf.fileName, pdf.title)) === 'downloaded') {
        setMessage(t('Trimiterea nu merge pe acest dispozitiv. PDF-ul s-a descărcat.'));
      }
    } catch {
      setMessage(t('PDF-ul nu a putut fi făcut. Încearcă din nou.'));
    } finally {
      setBusy(false);
    }
  };
  return { busy, message, run };
}

// "Descarcă PDF" and "Trimite PDF-ul" for a PDF (spec §14). The PDF is made
// when a button is pressed: its code loads then, not with the page.
export function PdfActions({ pdf }: { pdf: PdfFile }) {
  const { busy, message, run } = usePdfFile(pdf);

  return (
    <div className="pdf-actions">
      <button type="button" className="button-quiet button-small" disabled={busy} onClick={() => run('download')}>
        <ActionIcon name="file" />
        {t('Descarcă PDF')}
      </button>
      <button type="button" className="button-quiet button-small" disabled={busy} onClick={() => run('share')}>
        <ActionIcon name="share" />
        {t('Trimite PDF-ul')}
      </button>
      {busy && <span role="status">{t('Se face PDF-ul…')}</span>}
      {message && <p role="status">{message}</p>}
    </div>
  );
}

import { useState } from 'react';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { renderPdf } from './renderPdf.ts';
import { saveFile, shareFile } from './share.ts';

export interface PdfFile {
  // Made when a button is pressed, not with every render of the page.
  build: () => TDocumentDefinitions;
  fileName: string;
  // The name that the share sheet shows.
  title: string;
}

export interface CsvFile {
  build: () => string;
  fileName: string;
}

// "Descarcă PDF" and "Trimite" for a PDF, and "Descarcă CSV" when the page has
// one (spec §14). The PDF is made when a button is pressed: its code loads
// then, not with the page.
export function PdfActions({ pdf, csv }: { pdf: PdfFile; csv?: CsvFile }) {
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
        setMessage('Trimiterea nu merge pe acest dispozitiv. PDF-ul s-a descărcat.');
      }
    } catch {
      setMessage('PDF-ul nu a putut fi făcut. Încearcă din nou.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pdf-actions">
      <button type="button" className="button-quiet button-small" disabled={busy} onClick={() => run('download')}>
        Descarcă PDF
      </button>
      {csv && (
        <button
          type="button"
          className="button-quiet button-small"
          onClick={() => saveFile(new Blob([csv.build()], { type: 'text/csv;charset=utf-8' }), csv.fileName)}
        >
          Descarcă CSV
        </button>
      )}
      <button type="button" className="button-quiet button-small" disabled={busy} onClick={() => run('share')}>
        Trimite
      </button>
      {busy && <span role="status">Se face PDF-ul…</span>}
      {message && <p role="status">{message}</p>}
    </div>
  );
}

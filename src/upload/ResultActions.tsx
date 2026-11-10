import { useRef, useState } from 'react';
import type { StudentResultView } from '../../shared/api.ts';
import { renderPdf } from '../admin/pdf/renderPdf.ts';
import { saveFile } from '../admin/pdf/share.ts';
import { studentPdf, studentPdfFileName, studentPdfInputFromResult } from '../admin/pdf/studentPdf.ts';

type ShareState = 'idle' | 'copied' | 'manual';

// The result page's two actions, so a student can pass the result on to a
// parent: "Trimite linkul" opens the phone's share sheet, else copies the
// link, else shows it to copy by hand; "Descarcă PDF" saves the same student
// PDF the teacher gives, once the result is graded.
export function ResultActions({ result, url }: { result: StudentResultView; url: string }) {
  const [share, setShare] = useState<ShareState>('idle');
  const [busy, setBusy] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  // A second tap can come before the disabled button is drawn.
  const working = useRef(false);
  const pdfInput = studentPdfInputFromResult(result);

  async function sendLink() {
    setShare('idle');
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ url, title: `${result.studentName} · ${result.testTitle}` });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShare('copied');
    } catch {
      // No clipboard (an old browser, or a page not on https): the student
      // copies the link by hand.
      setShare('manual');
    }
  }

  async function downloadPdf() {
    if (!pdfInput || working.current) return;
    working.current = true;
    setBusy(true);
    setPdfFailed(false);
    try {
      saveFile(await renderPdf(studentPdf(pdfInput)), studentPdfFileName(pdfInput));
    } catch {
      setPdfFailed(true);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="result-actions">
      <div className="result-actions-row">
        <button type="button" className="button-quiet button-small" onClick={() => void sendLink()}>
          Trimite linkul
        </button>
        {pdfInput && (
          <button type="button" className="button-quiet button-small" disabled={busy} onClick={() => void downloadPdf()}>
            Descarcă PDF
          </button>
        )}
      </div>
      {share === 'copied' && (
        <p role="status" className="hint">
          Linkul a fost copiat.
        </p>
      )}
      {share === 'manual' && (
        <>
          <p className="hint">Copiază linkul de aici:</p>
          <p className="result-link-url">{url}</p>
        </>
      )}
      {pdfFailed && (
        <p role="alert" className="alert">
          Nu am putut face PDF-ul. Încearcă din nou.
        </p>
      )}
    </div>
  );
}

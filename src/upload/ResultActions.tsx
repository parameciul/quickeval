import { useEffect, useRef, useState } from 'react';
import type { StudentResultView } from '../../shared/api.ts';
import { displayClassName } from '../../shared/classes.ts';
import { formatResultCode } from '../../shared/tests.ts';
import { renderPdf } from '../admin/pdf/renderPdf.ts';
import { saveFile } from '../admin/pdf/share.ts';
import { studentPdf, studentPdfFileName, studentPdfInputFromResult } from '../admin/pdf/studentPdf.ts';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { TICKET_HOW, TICKET_HOW_NO_CODE, TICKET_TITLE } from './ResultTicket.tsx';
import { useSaveTicket } from './SaveTicket.tsx';
import { shareLink } from './shareLink.ts';

type ShareState = 'idle' | 'copied' | 'manual';

// How long "Linkul a fost copiat." stays on screen.
const COPIED_MS = 4000;

// The result page's actions, so a student can pass the result on to a parent
// and find it again: "Trimite linkul" opens the phone's share sheet, else
// copies the link, else shows it to copy by hand; "Salvează biletul" saves
// the result ticket as a picture (the QR code of this page and its short
// code); "Descarcă PDF" saves the same student PDF the teacher gives, once
// the result is graded.
export function ResultActions({ result, url }: { result: StudentResultView; url: string }) {
  const [share, setShare] = useState<ShareState>('idle');
  const [busy, setBusy] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  // A second tap can come before the disabled button is drawn.
  const working = useRef(false);
  const pdfInput = studentPdfInputFromResult(result);
  const code = result.resultCode ? formatResultCode(result.resultCode) : null;
  const save = useSaveTicket({
    url,
    testCode: result.testCode,
    picture: {
      label: TICKET_TITLE,
      testTitle: result.testTitle,
      studentName: result.studentName,
      classLine: `${displayClassName(result.className)} · ${result.testCode}`,
      code,
      how: code ? TICKET_HOW : TICKET_HOW_NO_CODE,
    },
    className: 'button-quiet button-small',
  });

  useEffect(() => {
    if (share !== 'copied') return;
    const timer = setTimeout(() => setShare('idle'), COPIED_MS);
    return () => clearTimeout(timer);
  }, [share]);

  async function sendLink() {
    setShare('idle');
    const sent = await shareLink({ url, title: `${result.studentName} · ${result.testTitle}` });
    if (sent === 'copied' || sent === 'manual') setShare(sent);
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
          <ActionIcon name="share" />
          Trimite linkul
        </button>
        {save.button}
        {pdfInput && (
          <button type="button" className="button-quiet button-small" disabled={busy} onClick={() => void downloadPdf()}>
            <ActionIcon name="file" />
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
        <div role="status">
          <p className="hint">Copiază linkul de aici:</p>
          <p className="result-link-url">{url}</p>
        </div>
      )}
      {save.note}
      {busy && (
        <p role="status" className="hint">
          Se face PDF-ul…
        </p>
      )}
      {pdfFailed && (
        <p role="alert" className="alert">
          Nu am putut face PDF-ul. Încearcă din nou.
        </p>
      )}
    </div>
  );
}

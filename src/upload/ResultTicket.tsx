import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { displayClassName } from '../../shared/classes.ts';
import { formatResultCode } from '../../shared/tests.ts';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { resultPageUrl } from './resultLinks.ts';
import { useSaveTicket } from './SaveTicket.tsx';
import { shareLink } from './shareLink.ts';

// The test a ticket is for, as the student knows it.
export interface TicketTest {
  title: string;
  className: string;
  code: string;
}

export const TICKET_TITLE = 'Biletul tău pentru rezultat';
export const TICKET_HOW = 'Scanează codul QR cu camera. Sau deschide linkul testului și scrie codul.';
export const TICKET_HOW_NO_CODE = 'Scanează codul QR cu camera.';

// How long "Linkul a fost copiat." stays on screen.
const COPIED_MS = 4000;

type ShareState = 'idle' | 'copied' | 'manual';

// A student's way back to the result page, drawn as a ticket: the test, the
// name, the QR code of the result link and its short code. Students keep the
// link as a screenshot, so the screen itself is what must work later: a phone
// reads the QR code out of the picture, and the code can be typed on the
// test's page. The long address stays behind "Arată linkul întreg".
export function ResultTicket({
  resultToken,
  resultCode,
  studentName,
  test,
  fresh = false,
}: {
  resultToken: string;
  // Null for a link this phone kept before links had codes.
  resultCode: string | null;
  studentName: string;
  test: TicketTest;
  // Right after sending: also says when the result appears.
  fresh?: boolean;
}) {
  const [share, setShare] = useState<ShareState>('idle');
  const [linkShown, setLinkShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = resultPageUrl(resultToken);
  const code = resultCode ? formatResultCode(resultCode) : null;
  const classLine = `${displayClassName(test.className)} · ${test.code}`;
  const save = useSaveTicket({
    url,
    testCode: test.code,
    picture: { testTitle: test.title, studentName, classLine, code, how: code ? TICKET_HOW : TICKET_HOW_NO_CODE },
    className: 'button button-big',
  });

  useEffect(() => {
    if (share !== 'copied') return;
    const timer = setTimeout(() => setShare('idle'), COPIED_MS);
    return () => clearTimeout(timer);
  }, [share]);

  async function send() {
    setShare('idle');
    const sent = await shareLink({
      url,
      title: `${studentName} · ${test.title}`,
      ...(code ? { text: `Codul meu: ${code}` } : {}),
    });
    if (sent === 'copied') setShare('copied');
    if (sent === 'manual') {
      setShare('manual');
      setLinkShown(true);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="ticket-box" aria-label={studentName ? `Biletul pentru rezultat: ${studentName}` : 'Biletul pentru rezultat'}>
      <div className="ticket">
        <p className="ticket-top">
          <span>{TICKET_TITLE}</span>
          <strong>{test.title}</strong>
        </p>
        <div className="ticket-mid">
          <p className="ticket-who">
            <strong>{studentName}</strong>
            <span>{classLine}</span>
          </p>
          {/* Dark on white in both themes, with a white edge: phones read it from a screenshot. */}
          <div className="ticket-qr">
            <QRCodeSVG value={url} size={176} marginSize={0} level="M" title="Codul QR al rezultatului" />
          </div>
          {code && (
            <p className="ticket-code">
              <span>Codul tău</span>
              <strong>{code}</strong>
            </p>
          )}
        </div>
        <p className="ticket-foot">{code ? TICKET_HOW : TICKET_HOW_NO_CODE}</p>
      </div>
      <div className="ticket-actions">
        {save.button}
        <button type="button" className="button-quiet button-big" onClick={() => void send()}>
          <ActionIcon name="send" />
          Trimite-mi linkul
        </button>
      </div>
      {save.note}
      {share === 'copied' && (
        <p role="status" className="hint">
          Linkul a fost copiat.
        </p>
      )}
      {share === 'manual' && (
        <p role="status" className="hint">
          Copiază linkul de aici:
        </p>
      )}
      {fresh && (
        <p className="hint">
          Rezultatul apare aici după ce profesorul publică rezultatele: nota, punctajul pe fiecare exercițiu, explicații detaliate pentru fiecare problemă rezolvată corect sau greșit și o sinteză finală cu ce merge bine și recomandări.
        </p>
      )}
      <p className="ticket-links">
        <a href={url}>Vezi rezultatul</a>
        <button type="button" className="link-button" aria-expanded={linkShown} onClick={() => setLinkShown((shown) => !shown)}>
          {linkShown ? 'Ascunde linkul' : 'Arată linkul întreg'}
        </button>
      </p>
      {linkShown && (
        <>
          {/* The whole address as text, never cut off: a cut address in a
              picture is a broken link. */}
          <p className="result-link-url">{url}</p>
          <p>
            <button type="button" className="button-quiet button-small" onClick={() => void copy()}>
              <ActionIcon name={copied ? 'check' : 'copy'} />
              {copied ? 'Copiat!' : 'Copiază linkul'}
            </button>
          </p>
        </>
      )}
    </section>
  );
}

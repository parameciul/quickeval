import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { displayClassName } from '../../shared/classes.ts';
import { formatResultCode } from '../../shared/tests.ts';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { resultPageUrl } from './resultLinks.ts';
import type { TicketHow } from './ticketImage.ts';
import { useSaveTicket } from './SaveTicket.tsx';
import { shareLink } from './shareLink.ts';

// The test a ticket is for, as the student knows it.
export interface TicketTest {
  title: string;
  className: string;
  code: string;
}

// What the ticket is: the student's own link to the result.
export const TICKET_TITLE = 'Biletul tău cu linkul spre rezultat';
// How the student finds the result later, on their own phone. A phone opens
// the link of a QR code in a picture of its gallery on a long press; the
// test's link opens the result by itself on the phone that sent the work, and
// asks for the code on any other. No word on scanning with a camera: that is
// another phone, where someone else would see the result.
export const TICKET_HOW: TicketHow = {
  intro: 'Ca să vezi rezultatul, alege una dintre variante:',
  steps: [
    'Ține apăsat pe codul QR.',
    'Deschide linkul de trimitere a lucrării și introdu codul, dacă nu ești redirecționat direct la rezultat.',
  ],
};
export const TICKET_HOW_NO_CODE: TicketHow = { intro: 'Ca să vezi rezultatul, ține apăsat pe codul QR.', steps: [] };

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
  const how = code ? TICKET_HOW : TICKET_HOW_NO_CODE;
  const save = useSaveTicket({
    url,
    testCode: test.code,
    picture: { label: TICKET_TITLE, testTitle: test.title, studentName, classLine, code, how },
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
          {/* Dark on white in both themes, with a white edge: phones read it
              from a screenshot. A link too, so a tap or a long press on the
              page opens the result, as the ticket says. */}
          <a className="ticket-qr" href={url}>
            <QRCodeSVG value={url} size={176} marginSize={0} level="M" title="Codul QR al rezultatului" />
          </a>
          {code && (
            <p className="ticket-code">
              <span>Codul tău</span>
              <strong>{code}</strong>
            </p>
          )}
        </div>
        <div className="ticket-foot">
          <p>{how.intro}</p>
          {how.steps.length > 0 && (
            <ol>
              {how.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}
        </div>
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

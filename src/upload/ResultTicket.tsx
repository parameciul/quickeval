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
export const TICKET_TITLE = 'Biletul tău pentru rezultat';
// How the student finds the result later, on their own phone: written on the
// saved picture only, never on the page. A phone opens
// the link of a QR code in a picture of its gallery on a long press; the
// test's link opens the result by itself on the phone that sent the work, and
// asks for the code on any other. No word on scanning with a camera: that is
// another phone, where someone else would see the result.
// The picture first says what it is for, since it is found later in the
// gallery, long after the test.
const TICKET_LEAD = 'Cu acest bilet îți vezi rezultatul la acest test.';
const TICKET_NOTE = 'Rezultatul apare doar după ce profesorul corectează lucrările.';
export const TICKET_HOW: TicketHow = {
  lead: TICKET_LEAD,
  note: TICKET_NOTE,
  intro: 'Ca să vezi rezultatul, alege una dintre variante:',
  steps: [
    'Pe telefon, ține apăsat pe codul QR și deschide linkul.',
    'Deschide linkul de trimitere a lucrării (codul QR de pe test) și introdu codul tău.',
  ],
};
export const TICKET_HOW_NO_CODE: TicketHow = {
  lead: TICKET_LEAD,
  note: TICKET_NOTE,
  intro: 'Ca să vezi rezultatul, pe telefon ține apăsat pe codul QR și deschide linkul.',
  steps: [],
};

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
}: {
  resultToken: string;
  // Null for a link this phone kept before links had codes.
  resultCode: string | null;
  studentName: string;
  test: TicketTest;
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
        {/* No "how to see the result" here: those steps are for later, so
            they are only on the saved picture. On the page they read like
            something to do now. */}
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

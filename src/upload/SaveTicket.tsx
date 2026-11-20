import { QRCodeCanvas } from 'qrcode.react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { QR_SIZE, renderTicket, saveTicket, savesThroughShare, ticketFileName, type TicketPicture } from './ticketImage.ts';
import { t } from '../i18n/t.ts';

// How long "Biletul a fost salvat." stays on screen.
const SAVED_MS = 4000;

type SaveState = 'idle' | 'busy' | 'saved' | 'failed';

// One picture at a time on the page: each holds two canvases while it is
// drawn, and a phone limits canvas memory (a shared phone may show many
// tickets). A turn ends when its picture is made or failed.
let line: Promise<void> = Promise.resolve();

function takeTurn(): Promise<() => void> {
  let release: () => void = () => {};
  const done = new Promise<void>((resolve) => (release = resolve));
  const turn = line.then(() => release);
  line = line.then(() => done);
  return turn;
}

// "Salvează biletul": saves the result ticket as a picture, one tap, so it
// lands beside the student's photos. Gives the button and, apart, the note of
// what happened, so each page puts them where its layout wants them.
//
// On an iPhone or iPad the picture is made as soon as the ticket shows (one
// ticket at a time), so a tap saves it with no wait: the share sheet opens
// only right inside the tap, and is refused after the waits of drawing the
// picture. Elsewhere the file downloads, which may wait, so the picture is
// made on the tap. A picture that failed is made again on the next tap. The
// QR code is drawn on a hidden canvas only while a picture is made.
export function useSaveTicket({
  url,
  testCode,
  picture,
  className,
}: {
  // The result link the QR code holds.
  url: string;
  testCode: string;
  picture: Omit<TicketPicture, 'qr'>;
  className: string;
}): { button: ReactNode; note: ReactNode } {
  const qr = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<SaveState>('idle');
  // A picture is being drawn while `round` is ahead of `doneRound`.
  const [round, setRound] = useState(0);
  const [doneRound, setDoneRound] = useState(0);
  const ready = useRef<Blob | null>(null);
  const pending = useRef<Promise<Blob> | null>(null);
  const settle = useRef<{ resolve: (png: Blob) => void; reject: (err: unknown) => void } | null>(null);
  const release = useRef<(() => void) | null>(null);
  const working = useRef(false);
  const mounted = useRef(false);
  const latest = useRef(picture);
  latest.current = picture;

  // Starts drawing the picture; the effect below makes it.
  const startDraw = (): Promise<Blob> => {
    const made = new Promise<Blob>((resolve, reject) => (settle.current = { resolve, reject }));
    made.catch(() => {});
    pending.current = made;
    setRound((value) => value + 1);
    return made;
  };

  // Whatever turn this ticket holds when it goes away is given on.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      release.current?.();
      release.current = null;
    };
  }, []);

  useEffect(() => {
    if (!savesThroughShare()) return;
    let current = true;
    void takeTurn().then((done) => {
      if (!current || ready.current || pending.current) {
        done();
        return;
      }
      release.current = done;
      startDraw();
    });
    return () => {
      current = false;
      release.current?.();
      release.current = null;
    };
  }, []);

  // A tap that has to draw takes a turn too, so a ticket whose turn has not
  // come yet never draws beside another one. When its turn comes, the
  // picture may already be made or on its way.
  const drawInTurn = async (): Promise<Blob> => {
    const done = await takeTurn();
    // The ticket went away while it waited: a draw would never end, and
    // would hold the line for every ticket after it.
    if (!mounted.current) {
      done();
      throw new Error('The ticket is gone.');
    }
    if (ready.current) {
      done();
      return ready.current;
    }
    if (pending.current) {
      done();
      return pending.current;
    }
    release.current = done;
    return startDraw();
  };

  useEffect(() => {
    if (round === 0) return;
    const drawn = qr.current;
    const waiting = settle.current;
    if (!waiting) return;
    const end = () => {
      if (settle.current === waiting) settle.current = null;
      release.current?.();
      release.current = null;
      setDoneRound(round);
    };
    if (!drawn) {
      // No QR canvas to draw from: fail this picture and give the turn on,
      // so the tickets after it are not kept waiting.
      pending.current = null;
      end();
      waiting.reject(new Error('The QR code was not drawn.'));
      return;
    }
    renderTicket({ ...latest.current, qr: drawn }).then(
      (png) => {
        ready.current = png;
        end();
        waiting.resolve(png);
      },
      (err: unknown) => {
        pending.current = null;
        end();
        waiting.reject(err);
      },
    );
  }, [round]);

  useEffect(() => {
    if (state !== 'saved') return;
    const timer = setTimeout(() => setState('idle'), SAVED_MS);
    return () => clearTimeout(timer);
  }, [state]);

  async function save() {
    if (working.current) return;
    working.current = true;
    setState('busy');
    const wanted = latest.current;
    try {
      // With the picture ready, saveTicket runs inside the tap: no wait before it.
      const png = ready.current ?? (await (pending.current ?? drawInTurn()).catch(() => drawInTurn()));
      const result = await saveTicket(png, ticketFileName(testCode, wanted.studentName), `${wanted.studentName} · ${wanted.testTitle}`);
      // The student closed the share sheet: nothing was saved, nothing failed.
      setState(result === 'cancelled' ? 'idle' : 'saved');
    } catch {
      setState('failed');
    } finally {
      working.current = false;
    }
  }

  // The QR library draws at the screen's pixel ratio: this size gives a
  // canvas of about QR_SIZE pixels on every screen.
  const qrSize = Math.ceil(QR_SIZE / (window.devicePixelRatio || 1));
  const button = (
    <>
      {round !== doneRound && <QRCodeCanvas ref={qr} value={url} size={qrSize} marginSize={0} level="M" hidden aria-hidden="true" />}
      <button type="button" className={className} disabled={state === 'busy'} onClick={() => void save()}>
        <ActionIcon name={state === 'saved' ? 'check' : 'download'} />
        {t('Salvează biletul')}
      </button>
    </>
  );
  const note =
    state === 'saved' ? (
      <p role="status" className="hint">
        {t('Biletul a fost salvat. Îl găsești lângă pozele tale sau în descărcări.')}
      </p>
    ) : state === 'failed' ? (
      <p role="alert" className="alert">
        {t('Nu am putut salva biletul. Fă o poză ecranului.')}
      </p>
    ) : null;
  return { button, note };
}

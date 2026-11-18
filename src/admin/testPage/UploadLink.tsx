import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { saveFile } from '../pdf/share.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';

// The address students open: https://<host>/u/<token>.
export function uploadLink(token: string): string {
  return `${window.location.origin}/u/${token}`;
}

// Saves the QR code as a PNG file, big enough to print or to send to the
// class in a chat. The canvas is drawn hidden, only on a click: the QR
// library draws it in its own effect, which runs before this one.
export function QrDownload({ url, fileName }: { url: string; fileName: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!drawing) return;
    const drawn = canvas.current;
    if (!drawn || typeof drawn.toBlob !== 'function') {
      setFailed(true);
      setDrawing(false);
      return;
    }
    drawn.toBlob((blob) => {
      if (blob) saveFile(blob, fileName);
      else setFailed(true);
      setDrawing(false);
    }, 'image/png');
  }, [drawing, fileName]);
  return (
    <>
      {drawing && <QRCodeCanvas ref={canvas} value={url} size={1024} marginSize={4} hidden aria-hidden="true" />}
      <button
        type="button"
        className="button-quiet button-small"
        disabled={drawing}
        onClick={() => {
          setFailed(false);
          setDrawing(true);
        }}
      >
        <ActionIcon name="download" />
        Descarcă codul QR
      </button>
      {failed && <span role="status">Nu am putut descărca codul QR.</span>}
    </>
  );
}

// The QR code as big as the screen allows. Escape or the button closes it.
// It is above everything: it takes Esc first (capture), and marks it taken so
// an open side panel stays open.
export function QrOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="qr-overlay" role="dialog" aria-modal="true" aria-label="Codul QR pentru elevi">
      <QRCodeSVG value={url} size={1024} marginSize={4} title="Codul QR al linkului" className="qr-big" />
      <p className="qr-url">{url}</p>
      <button ref={close} type="button" className="button" onClick={onClose}>
        <ActionIcon name="close" />
        Închide
      </button>
    </div>
  );
}

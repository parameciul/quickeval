import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';

// The address students open: https://<host>/u/<token>.
export function uploadLink(token: string): string {
  return `${window.location.origin}/u/${token}`;
}

// The link for the students: the address with a Copy button, a QR code, and a
// full-screen QR code for the class projector.
export function UploadLink({ token }: { token: string }) {
  const url = uploadLink(token);
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const [fullScreen, setFullScreen] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('yes');
    } catch {
      setCopied('failed');
    }
  };

  return (
    <div className="upload-link">
      <label htmlFor="upload-url">Linkul pentru elevi</label>
      <div className="form-row">
        <input id="upload-url" type="text" value={url} readOnly onFocus={(event) => event.target.select()} />
        <button type="button" className="button button-small" onClick={copy}>
          Copiază linkul
        </button>
        {copied === 'yes' && <span role="status">Copiat!</span>}
        {copied === 'failed' && <span role="status">Nu am putut copia. Selectează linkul și copiază-l de mână.</span>}
      </div>
      <QRCodeSVG value={url} size={200} marginSize={4} title="Codul QR al linkului" className="qr" />
      <p>
        <button type="button" className="button-quiet button-small" onClick={() => setFullScreen(true)}>
          Arată codul QR pe tot ecranul
        </button>
      </p>
      {fullScreen && <QrOverlay url={url} onClose={() => setFullScreen(false)} />}
    </div>
  );
}

// The QR code as big as the screen allows. Escape or the button closes it.
function QrOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="qr-overlay" role="dialog" aria-modal="true" aria-label="Codul QR pentru elevi">
      <QRCodeSVG value={url} size={1024} marginSize={4} title="Codul QR al linkului" className="qr-big" />
      <p className="qr-url">{url}</p>
      <button ref={close} type="button" className="button" onClick={onClose}>
        Închide
      </button>
    </div>
  );
}

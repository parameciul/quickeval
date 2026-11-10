import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { saveFile } from '../pdf/share.ts';

// The address students open: https://<host>/u/<token>.
export function uploadLink(token: string): string {
  return `${window.location.origin}/u/${token}`;
}

// The link for the students: the address with a Copy button, a QR code, and a
// full-screen QR code for the class projector. `qr` false shows the address
// alone; `downloadName` adds a button that saves the QR code as a PNG file.
export function UploadLink({
  token,
  label = 'Linkul pentru elevi',
  inputId = 'upload-url',
  qr = true,
  downloadName,
}: {
  token: string;
  label?: string;
  inputId?: string;
  qr?: boolean;
  downloadName?: string;
}) {
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
      <label htmlFor={inputId}>{label}</label>
      <div className="form-row">
        <input id={inputId} type="text" value={url} readOnly onFocus={(event) => event.target.select()} />
        <button type="button" className="button-quiet button-small" onClick={copy}>
          Copiază linkul
        </button>
        {copied === 'yes' && <span role="status">Copiat!</span>}
        {copied === 'failed' && <span role="status">Nu am putut copia. Selectează linkul și copiază-l de mână.</span>}
      </div>
      {qr && (
        <div className="qr-row">
          <QRCodeSVG value={url} size={200} marginSize={4} title="Codul QR al linkului" className="qr" />
          <div className="qr-actions">
            {downloadName && <QrDownload url={url} fileName={downloadName} />}
            <button type="button" className="button-quiet button-small qr-full" onClick={() => setFullScreen(true)}>
              Arată codul QR pe tot ecranul
            </button>
          </div>
        </div>
      )}
      {fullScreen && <QrOverlay url={url} onClose={() => setFullScreen(false)} />}
    </div>
  );
}

// Saves the QR code as a PNG file, big enough to print or to send to the
// class in a chat. The canvas is drawn hidden, only on a click: the QR
// library draws it in its own effect, which runs before this one.
function QrDownload({ url, fileName }: { url: string; fileName: string }) {
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
        Descarcă codul QR
      </button>
      {failed && <span role="status">Nu am putut descărca codul QR.</span>}
    </>
  );
}

// The multi-upload link is the teacher's: students who open it do not find
// the result links their own phone kept, so it is named as the teacher's.
export const MULTI_LABEL = 'Doar pentru profesor: linkul pentru mai multe încărcări';
const MULTI_HINT =
  'Cu acest link încarci tu, pe rând, lucrările mai multor elevi de pe un singur telefon (de exemplu, pentru elevii fără telefon). Nu-l da elevilor: ei folosesc linkul pentru elevi.';

// The link that uploads for many students on one phone: for students without
// a device, or for the teacher. Made only when the teacher asks for it, so
// the default link stays single-upload per phone.
export function MultiUploadLink({
  code,
  token,
  onChanged,
}: {
  code: string;
  token: string | null;
  onChanged: () => Promise<void>;
}) {
  const api = useApi();
  const [busy, setBusy] = useState(false);

  if (token) {
    return (
      <div className="upload-link">
        <p className="hint">{MULTI_HINT}</p>
        <UploadLink token={token} label={MULTI_LABEL} inputId="multi-upload-url" />
      </div>
    );
  }

  return (
    <MultiUploadCreator code={code} busy={busy} setBusy={setBusy} onChanged={onChanged} create={(c) => api.createMultiUploadLink(c)} />
  );
}

function MultiUploadCreator({
  code,
  busy,
  setBusy,
  onChanged,
  create,
}: {
  code: string;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onChanged: () => Promise<void>;
  create: (code: string) => Promise<string>;
}) {
  const [error, setError] = useState<unknown>(null);
  const createLink = async () => {
    setBusy(true);
    setError(null);
    try {
      await create(code);
      await onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="upload-link">
      <h3>{MULTI_LABEL}</h3>
      <p className="hint">{MULTI_HINT}</p>
      <button type="button" className="button-quiet" disabled={busy} onClick={createLink}>
        Creează linkul pentru mai multe încărcări
      </button>
      {error !== null && error !== undefined ? <ErrorMessage error={error} /> : null}
    </div>
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
        Închide
      </button>
    </div>
  );
}

import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// The address students open: https://<host>/u/<token>.
export function uploadLink(token: string): string {
  return `${window.location.origin}/u/${token}`;
}

// The link for the students: the address with a Copy button, a QR code, and a
// full-screen QR code for the class projector.
export function UploadLink({ token, label = 'Linkul pentru elevi', inputId = 'upload-url' }: { token: string; label?: string; inputId?: string }) {
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
        <button type="button" className="button button-small" onClick={copy}>
          Copiază linkul
        </button>
        {copied === 'yes' && <span role="status">Copiat!</span>}
        {copied === 'failed' && <span role="status">Nu am putut copia. Selectează linkul și copiază-l de mână.</span>}
      </div>
      <div className="qr-row">
        <QRCodeSVG value={url} size={200} marginSize={4} title="Codul QR al linkului" className="qr" />
        <button type="button" className="button-quiet button-small qr-full" onClick={() => setFullScreen(true)}>
          Arată codul QR pe tot ecranul
        </button>
      </div>
      {fullScreen && <QrOverlay url={url} onClose={() => setFullScreen(false)} />}
    </div>
  );
}

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
        <p className="hint">Pentru elevii fără telefon sau pentru profesor: cu acest link se trimit lucrări pentru mai mulți elevi, pe rând.</p>
        <UploadLink token={token} label="Linkul pentru mai multe încărcări" inputId="multi-upload-url" />
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
      <h3>Linkul pentru mai multe încărcări</h3>
      <p className="hint">Pentru elevii fără telefon sau pentru profesor: cu acest link se trimit lucrări pentru mai mulți elevi, pe rând.</p>
      <button type="button" className="button-quiet" disabled={busy} onClick={createLink}>
        Creează linkul pentru mai multe încărcări
      </button>
      {error !== null && error !== undefined ? <ErrorMessage error={error} /> : null}
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

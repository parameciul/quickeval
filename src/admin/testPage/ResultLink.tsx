import { useEffect, useState } from 'react';
import { studentResultUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { ActionIcon } from '../../ui/ActionIcon.tsx';

// One student's result link, with copy and WhatsApp share. When the upload
// has no link yet (an older upload), the first opening makes it.
export function ResultLink({
  submissionId,
  startedAt,
  resultToken,
  testCode,
  studentName,
}: {
  submissionId: number;
  // The upload the page shows: a link is never made for another upload.
  startedAt: string;
  resultToken: string | null;
  testCode: string;
  studentName: string;
}) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(resultToken);
  useEffect(() => setToken(resultToken), [resultToken]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);

  const show = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (token) return;
    setBusy(true);
    setError(null);
    try {
      setToken(await api.getResultLink(submissionId, startedAt));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const url = token ? studentResultUrl(token) : null;
  const whatsapp = url ? `https://wa.me/?text=${encodeURIComponent(`Rezultatul la testul ${testCode}: ${url}`)}` : null;
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <span className="result-share">
      <button type="button" className="button-quiet button-small" aria-expanded={open} disabled={busy} onClick={show}>
        <ActionIcon name="link" />
        Link rezultat
      </button>
      {open && (
        <span className="result-share-box">
          {url ? (
            <>
              <input type="text" readOnly value={url} aria-label={`Linkul cu rezultatul elevului ${studentName}`} />
              <a className="button-quiet button-small" href={url} target="_blank" rel="noopener noreferrer">
                <ActionIcon name="open" />
                Deschide
              </a>
              <button type="button" className="button-quiet button-small" onClick={copy}>
                <ActionIcon name={copied ? 'check' : 'copy'} />
                {copied ? 'Copiat!' : 'Copiază'}
              </button>
              {whatsapp && (
                <a className="button-quiet button-small" href={whatsapp} target="_blank" rel="noopener">
                  <ActionIcon name="share" />
                  WhatsApp
                </a>
              )}
            </>
          ) : (
            <span className="hint">{busy ? 'Se pregătește…' : 'Linkul nu este gata.'}</span>
          )}
          {error !== null && error !== undefined && <ErrorMessage error={error} />}
        </span>
      )}
    </span>
  );
}

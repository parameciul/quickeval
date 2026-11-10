import { useState } from 'react';

// "Distribuie" (spec §3.4): the try's own link, the only key, through the
// browser's share sheet where there is one, else copied.
export function ShareButton({ token }: { token: string }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const url = `${window.location.origin}/try/${token}`;
  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'MQGrader · Încercare rapidă', url });
        return;
      } catch (err) {
        // She closed the share sheet: nothing to do.
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="try-share">
      <button type="button" className="button-quiet" onClick={() => void share()}>
        Distribuie
      </button>
      {copied === true && <span role="status">Linkul a fost copiat.</span>}
      {copied === false && (
        <span role="status">
          Copiază linkul: <span className="try-share-url">{url}</span>
        </span>
      )}
      <p className="hint">Oricine are linkul vede încercarea și poate face tot ce faci tu.</p>
    </div>
  );
}

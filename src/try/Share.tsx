import { useState } from 'react';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { t } from '../i18n/t.ts';

// "Distribuie" (spec §3.4): the try's own link, the only key, through the
// browser's share sheet where there is one, else copied.
export function ShareButton({ token }: { token: string }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const url = `${window.location.origin}/try/${token}`;
  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: t('MQGrader · Încercare rapidă'), url });
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
        <ActionIcon name="share" />
        {t('Distribuie')}
      </button>
      {copied === true && <span role="status">{t('Linkul a fost copiat.')}</span>}
      {copied === false && (
        <span role="status">
          {t('Copiază linkul:')}{' '}<span className="try-share-url">{url}</span>
        </span>
      )}
      <p className="hint">{t('Oricine are linkul vede încercarea și poate face tot ce faci tu.')}</p>
    </div>
  );
}

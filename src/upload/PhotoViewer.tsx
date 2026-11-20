import { useEffect, useRef } from 'react';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { t } from '../i18n/t.ts';

// One photo on the whole screen. Escape or the button closes it, and the focus
// goes back to what opened it.
export function PhotoViewer({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => {
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={label}>
      <img src={src} alt={label} />
      <button ref={close} type="button" className="button button-big" onClick={onClose}>
        <ActionIcon name="close" />
        {t('Închide')}
      </button>
    </div>
  );
}

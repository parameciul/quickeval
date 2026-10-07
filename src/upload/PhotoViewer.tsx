import { useEffect, useRef } from 'react';

// One photo on the whole screen. Escape or the button closes it.
export function PhotoViewer({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
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
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={label}>
      <img src={src} alt={label} />
      <button ref={close} type="button" className="button button-big" onClick={onClose}>
        Închide
      </button>
    </div>
  );
}

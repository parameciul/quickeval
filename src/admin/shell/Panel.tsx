import { useEffect, useRef, type ReactNode } from 'react';
import { IconClose } from './icons.tsx';

// A side panel beside the 80px bar (redesign spec §4): a title, × and its
// content. It takes the focus when it opens and gives it back when it closes.
// The Layout keeps one panel open at a time and closes it on Esc.
export function Panel({ id, title, onClose, children }: { id: string; title: string; onClose(): void; children: ReactNode }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <aside className="panel" id={id} aria-labelledby={`${id}-title`}>
      <div className="panel-head">
        <h2 id={`${id}-title`}>{title}</h2>
        <button ref={close} type="button" className="panel-close" aria-label="Închide" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      {children}
    </aside>
  );
}

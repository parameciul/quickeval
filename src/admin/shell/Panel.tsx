import { useEffect, useRef, type ReactNode } from 'react';
import { IconClose } from './icons.tsx';
import { useFocusBack } from './useFocusBack.ts';

// A side panel beside the 80px bar (redesign spec §4): a title, × and its
// content. It takes the focus when it opens and gives it back when it closes
// (useFocusBack). The Layout keeps one panel open at a time and closes it on Esc.
export function Panel({ id, title, onClose, children }: { id: string; title: string; onClose(): void; children: ReactNode }) {
  const box = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  // First: the opener is read before × takes the focus.
  useFocusBack(box);
  useEffect(() => {
    close.current?.focus();
  }, []);
  return (
    <aside ref={box} className="panel" id={id} aria-labelledby={`${id}-title`}>
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

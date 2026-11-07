import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './shell/icons.tsx';

// A dialog over the page: a title, × and its content, on a dimmed backdrop.
// It takes the focus (its first field, else itself), keeps Tab inside it, and
// closes on Esc, on ×, and on a click on the backdrop. When it closes the focus
// goes back to what opened it, or to `returnFocus` when that is gone (a menu
// item that closed with its menu). It takes Esc before an open panel (capture).
export function Modal({
  title,
  onClose,
  returnFocus,
  children,
}: {
  title: string;
  onClose(): void;
  returnFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const back = useRef(returnFocus);
  back.current = returnFocus;

  useEffect(() => {
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    const node = box.current;
    const first = node?.querySelector<HTMLElement>('input, textarea, select');
    (first ?? node)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href]')].filter(
        (item) => !item.hasAttribute('disabled'),
      );
      if (items.length === 0) return;
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      if (event.shiftKey && (document.activeElement === firstItem || document.activeElement === node)) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const target = opener?.isConnected ? opener : back.current?.current;
      target?.focus();
    };
  }, []);

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={box} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="panel-close" aria-label="Închide" onClick={onClose}>
            <IconClose />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

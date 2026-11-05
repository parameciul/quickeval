import { useEffect, type RefObject } from 'react';

// When a box that opened over the page (a panel, the phone menu) closes, the
// focus goes back to what had it when the box opened, but only when the focus
// left with the box (Esc, ×, a link inside it): a click on another panel's
// button keeps the focus on that button.
export function useFocusBack(box: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = box.current;
    return () => {
      const active = document.activeElement;
      const lost = !active || active === document.body || (node?.contains(active) ?? false);
      if (lost && opener?.isConnected) opener.focus();
    };
  }, [box]);
}

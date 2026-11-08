import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

// A small menu of the top bar (the initials, the demo button): open on its
// button, closed on Esc (the focus goes back to the button), on a click
// outside it, when the focus leaves it, and when a page opens. It stays closed when Back or Forward
// returns to the page it was opened on.
export function useSmallMenu<Box extends HTMLElement = HTMLDivElement>() {
  const location = useLocation();
  const [openOn, setOpenOn] = useState<string | null>(null);
  if (openOn !== null && openOn !== location.key) setOpenOn(null);
  const open = openOn === location.key;
  const box = useRef<Box>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpenOn(null);
    };
    // The menu is above the panels: it takes Esc first (capture), and marks it
    // taken so an open panel stays open.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (box.current?.contains(document.activeElement)) button.current?.focus();
      setOpenOn(null);
    };
    // Tab or a click moves the focus elsewhere: the menu closes, so two small
    // menus are never open at once.
    const onFocus = (event: FocusEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpenOn(null);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocus);
    };
  }, [open]);

  return { open, toggle: () => setOpenOn(open ? null : location.key), box, button };
}

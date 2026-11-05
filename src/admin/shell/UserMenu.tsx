import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import type { Teacher } from '../../../shared/api.ts';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { initials } from './initials.ts';
import { useLogout } from './useLogout.ts';

// The teacher's initials in the top bar open a small menu: who is logged in,
// "Contul meu" and "Ieși din cont". It closes on Esc (the focus goes back to
// the initials), on a click outside it, and when a page opens.
export function UserMenu({ teacher }: { teacher: Teacher }) {
  const location = useLocation();
  // The page the menu was opened on: another page closes it, and it stays
  // closed when Back or Forward returns to that page.
  const [openOn, setOpenOn] = useState<string | null>(null);
  if (openOn !== null && openOn !== location.key) setOpenOn(null);
  const open = openOn === location.key;
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const logout = useLogout();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpenOn(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (box.current?.contains(document.activeElement)) button.current?.focus();
      setOpenOn(null);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="user" ref={box}>
      <button
        ref={button}
        type="button"
        className="user-button"
        aria-label={`Contul tău: ${teacher.name}`}
        aria-expanded={open}
        aria-controls={open ? 'user-menu' : undefined}
        onClick={() => setOpenOn(open ? null : location.key)}
      >
        {initials(teacher.name)}
      </button>
      {open && (
        <div className="user-menu" id="user-menu">
          <p className="user-who">
            <b>{teacher.name}</b>
            <span>{teacher.email}</span>
          </p>
          <Link to="/cont">Contul meu</Link>
          <button type="button" disabled={logout.isPending} onClick={() => logout.mutate()}>
            Ieși din cont
          </button>
          {logout.error && <ErrorMessage error={logout.error} />}
        </div>
      )}
    </div>
  );
}

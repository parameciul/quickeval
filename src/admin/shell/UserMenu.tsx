import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import type { Teacher } from '../../../shared/api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { initials } from './initials.ts';

// The teacher's initials in the top bar open a small menu: who is logged in,
// "Contul meu" and "Ieși din cont". It closes on Esc, on a click outside it,
// and when a page opens.
export function UserMenu({ teacher }: { teacher: Teacher }) {
  const api = useApi();
  const location = useLocation();
  // The page the menu was opened on: another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === location.key;
  const box = useRef<HTMLDivElement>(null);
  const logout = useMutation({
    mutationFn: () => api.logout(),
    // A new page load shows the login form.
    onSuccess: () => window.location.assign('/admin/'),
  });

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpenOn(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenOn(null);
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

import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import type { Teacher } from '../../../shared/api.ts';
import { ThemeSwitch } from '../../ui/ThemeButton.tsx';
import { demoUsage } from '../account/DemoMeters.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { DemoSummary } from './DemoButton.tsx';
import { IconSettings } from './icons.tsx';
import { useFocusBack } from './useFocusBack.ts';
import { useLogout } from './useLogout.ts';
import { YearSelect } from './YearSelect.tsx';

// The menu under ☰ on a phone (redesign spec §4, round 6 design M2): what the
// bottom bar and the top bar have no room for, a demo account's papers too. It drops from the top bar and comes right after
// ☰ for the keyboard (the Layout draws it there); a tap outside it or on ☰
// again closes it, and so do Esc and a new page (the Layout).
export function PhoneMenu({ teacher, onClose }: { teacher: Teacher; onClose(): void }) {
  const box = useRef<HTMLElement>(null);
  const logout = useLogout();
  useFocusBack(box);
  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!box.current?.contains(target) && !target.closest?.('.menu-button')) onClose();
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [onClose]);
  return (
    <section ref={box} className="phone-menu" id="phone-menu" aria-label="Mai mult">
      {teacher.role === 'admin' && (
        <Link className="menu-row menu-link" to="/setari">
          <IconSettings />
          <span>Setări</span>
        </Link>
      )}
      <div className="menu-row">
        <YearSelect id="school-year-phone" />
      </div>
      <ThemeSwitch />
      <p className="user-who">
        <b>{teacher.name}</b>
        <span>{teacher.email}</span>
      </p>
      {/* A demo account's papers: the demo button of the top bar, on a phone. */}
      {teacher.demo && (
        <div className="phone-demo">
          <DemoSummary usage={demoUsage(teacher)} />
        </div>
      )}
      <Link className="menu-row menu-link" to="/cont">
        Contul meu
      </Link>
      <button type="button" className="menu-row menu-link menu-quiet" disabled={logout.isPending} onClick={() => logout.mutate()}>
        Ieși din cont
      </button>
      {logout.error && <ErrorMessage error={logout.error} />}
    </section>
  );
}

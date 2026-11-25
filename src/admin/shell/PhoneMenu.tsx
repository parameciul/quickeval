import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import type { Teacher } from '../../../shared/api.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { LangSwitch } from '../../ui/LangButton.tsx';
import { ThemeSwitch } from '../../ui/ThemeButton.tsx';
import { demoUsage } from '../account/DemoMeters.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { DemoSummary } from './DemoButton.tsx';
import { IconSettings } from './icons.tsx';
import { useFocusBack } from './useFocusBack.ts';
import { useLogout } from './useLogout.ts';
import { YearSelect } from './YearSelect.tsx';
import { t } from '../../i18n/t.ts';

// The menu under ☰ on a phone (redesign spec §4, round 6 design M2): what the
// bottom bar and the top bar have no room for, a demo account's papers too.
// It drops from the top bar and comes right after ☰ for the keyboard (the
// Layout draws it there); a tap outside it or on ☰ again closes it, and so do
// Esc and a new page (the Layout).
export function PhoneMenu({ teacher, viewing, onClose }: { teacher: Teacher; viewing: boolean; onClose(): void }) {
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
  // Two groups, the settings and the account: on a phone turned sideways they
  // stand side by side.
  return (
    <section ref={box} className="phone-menu" id="phone-menu" aria-label={t('Mai mult')}>
      <div className="phone-menu-group">
        {teacher.role === 'admin' && (
          <Link className="menu-row menu-link" to="/settings">
            <IconSettings />
            <span>{t('Setări')}</span>
          </Link>
        )}
        <div className="menu-row">
          <YearSelect id="school-year-phone" labelClassName="menu-label" icon={<ActionIcon name="calendar" />} />
        </div>
        <ThemeSwitch />
        <LangSwitch />
      </div>
      <div className="phone-menu-group">
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
        <Link className="menu-row menu-link" to="/account">
          <ActionIcon name="person" />
          {t('Contul meu')}
        </Link>
        {!viewing && (
          <button type="button" className="menu-row menu-link menu-quiet" disabled={logout.isPending} onClick={() => logout.mutate()}>
            <ActionIcon name="logout" />
            {t('Ieși din cont')}
          </button>
        )}
        {logout.error && <ErrorMessage error={logout.error} />}
      </div>
    </section>
  );
}

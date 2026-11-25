import { Link } from 'react-router';
import type { Teacher } from '../../../shared/api.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { initials } from './initials.ts';
import { useLogout } from './useLogout.ts';
import { useSmallMenu } from './useSmallMenu.ts';
import { t } from '../../i18n/t.ts';

// The teacher's initials in the top bar open a small menu: who is logged in,
// "Contul meu" and "Ieși din cont".
export function UserMenu({ teacher, viewing }: { teacher: Teacher; viewing: boolean }) {
  const { open, toggle, box, button } = useSmallMenu();
  const logout = useLogout();

  return (
    <div className="user" ref={box}>
      <button
        ref={button}
        type="button"
        className="user-button"
        aria-label={t('{initials}, contul tău: {name}', { initials: initials(teacher.name), name: teacher.name })}
        aria-expanded={open}
        aria-controls={open ? 'user-menu' : undefined}
        onClick={toggle}
      >
        {initials(teacher.name)}
      </button>
      {open && (
        <div className="user-menu" id="user-menu">
          <p className="user-who">
            <b>{teacher.name}</b>
            <span>{teacher.email}</span>
          </p>
          <Link to="/account">
            <ActionIcon name="person" />
            {t('Contul meu')}
          </Link>
          {/* While an administrator views the account, the bar above holds the way out. */}
          {!viewing && (
            <button type="button" disabled={logout.isPending} onClick={() => logout.mutate()}>
              <ActionIcon name="logout" />
              {t('Ieși din cont')}
            </button>
          )}
          {logout.error && <ErrorMessage error={logout.error} />}
        </div>
      )}
    </div>
  );
}

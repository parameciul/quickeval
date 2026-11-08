import { Link } from 'react-router';
import type { Teacher } from '../../../shared/api.ts';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { initials } from './initials.ts';
import { useLogout } from './useLogout.ts';
import { useSmallMenu } from './useSmallMenu.ts';

// The teacher's initials in the top bar open a small menu: who is logged in,
// "Contul meu" and "Ieși din cont".
export function UserMenu({ teacher }: { teacher: Teacher }) {
  const { open, toggle, box, button } = useSmallMenu();
  const logout = useLogout();

  return (
    <div className="user" ref={box}>
      <button
        ref={button}
        type="button"
        className="user-button"
        aria-label={`${initials(teacher.name)}, contul tău: ${teacher.name}`}
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

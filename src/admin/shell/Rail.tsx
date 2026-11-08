import { Link, NavLink } from 'react-router';
import { countLabel } from '../../ui/format.ts';
import { IconClasses, IconPlus, IconSettings, IconTests, IconTodo } from './icons.tsx';

// The side panels, the phone menu under ☰ and the phone's search over the
// whole screen: one open at a time.
export type PanelName = 'clase' | 'todo' | 'menu' | 'search';

// The 80px bar on the left (redesign spec §4): Test nou, Teste, Clase and De
// făcut (each opens its panel; De făcut shows how many things wait) and, at
// the bottom, Setări for an administrator. Each item has its icon and a short
// word under it.
export function Rail({
  admin,
  onTests,
  onClasses,
  todoCount,
  urgent,
  panel,
  onToggle,
  inert = false,
}: {
  admin: boolean;
  onTests: boolean;
  onClasses: boolean;
  todoCount: number;
  // An administrator has an account to approve: the number is red.
  urgent: boolean;
  panel: PanelName | null;
  onToggle(name: PanelName): void;
  // Under the phone's search over the whole screen.
  inert?: boolean;
}) {
  return (
    <nav className="rail" aria-label="Meniu" inert={inert}>
      <Link className="rail-new" to="/teste/nou">
        <span className="rail-square">
          <IconPlus />
        </span>
        <span className="rail-word">Test nou</span>
      </Link>
      <Link className="rail-item" to="/" aria-current={onTests ? 'page' : undefined}>
        <IconTests />
        <span className="rail-word">Teste</span>
      </Link>
      <button
        type="button"
        className="rail-item"
        aria-current={onClasses ? 'page' : undefined}
        aria-expanded={panel === 'clase'}
        aria-controls={panel === 'clase' ? 'panel-clase' : undefined}
        onClick={() => onToggle('clase')}
      >
        <IconClasses />
        <span className="rail-word">Clase</span>
      </button>
      <button
        type="button"
        className="rail-item"
        aria-label={
          todoCount > 0 ? `De făcut: ${countLabel(todoCount, 'lucru', 'lucruri')}${urgent ? ', unul urgent' : ''}` : 'De făcut'
        }
        aria-expanded={panel === 'todo'}
        aria-controls={panel === 'todo' ? 'panel-todo' : undefined}
        onClick={() => onToggle('todo')}
      >
        <IconTodo />
        <span className="rail-word">De făcut</span>
        {todoCount > 0 && (
          <span className={urgent ? 'rail-badge rail-badge-urgent' : 'rail-badge'} aria-hidden="true">
            {todoCount}
          </span>
        )}
      </button>
      {admin && (
        <NavLink className="rail-item rail-foot" to="/setari">
          <IconSettings />
          <span className="rail-word">Setări</span>
        </NavLink>
      )}
    </nav>
  );
}

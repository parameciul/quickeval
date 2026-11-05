import { Link, NavLink } from 'react-router';
import { IconClasses, IconPlus, IconSettings, IconTests } from './icons.tsx';

export type PanelName = 'clase';

// The 80px bar on the left (redesign spec §4): Test nou, Teste, Clase (opens
// its panel) and, at the bottom, Setări for an administrator. Each item has
// its icon and a short word under it.
export function Rail({
  admin,
  onTests,
  onClasses,
  panel,
  onToggle,
}: {
  admin: boolean;
  onTests: boolean;
  onClasses: boolean;
  panel: PanelName | null;
  onToggle(name: PanelName): void;
}) {
  return (
    <nav className="rail" aria-label="Meniu">
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
      {admin && (
        <NavLink className="rail-item rail-foot" to="/setari">
          <IconSettings />
          <span className="rail-word">Setări</span>
        </NavLink>
      )}
    </nav>
  );
}

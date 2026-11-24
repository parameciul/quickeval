import { ActionIcon, type ActionIconName } from '../ui/ActionIcon.tsx';
import { useSmallMenu } from './shell/useSmallMenu.ts';

// One item of an actions menu: its name, the icon of its verb, the words under
// it that say what it does (its accessible description), red when it deletes,
// and off while its work runs or while it cannot be chosen now.
export type MenuAction = { label: string; hint: string; icon: ActionIconName; danger?: boolean; busy: boolean; onChoose: () => void };

// A menu of actions at the top of a page ("Alte acțiuni" of the paper page,
// "Acțiuni" of the test page): each item shows what it does before it is
// chosen. Choosing one closes the menu and gives the focus back to its button
// before the action asks or opens a dialog. `compact`: on a phone the button
// shows only ⋯, its words staying its name.
export function ActionsMenu({ label, menuId, actions, compact = false }: { label: string; menuId: string; actions: MenuAction[]; compact?: boolean }) {
  const { open, toggle, box, button } = useSmallMenu<HTMLDivElement>();
  const run = (action: MenuAction) => () => {
    toggle();
    button.current?.focus();
    action.onChoose();
  };
  return (
    <div className="paper-actions" ref={box}>
      <button
        ref={button}
        type="button"
        className={compact ? 'button-quiet button-small paper-actions-compact' : 'button-quiet button-small'}
        aria-label={compact ? label : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
      >
        {compact ? (
          <>
            <span className="paper-actions-wide">
              <ActionIcon name="sliders" />
              {label}
              <Chevron />
            </span>
            <span className="paper-actions-dots">
              <ActionIcon name="more" />
            </span>
          </>
        ) : (
          <>
            <ActionIcon name="sliders" />
            {label}
            <Chevron />
          </>
        )}
      </button>
      {open && (
        <div className="class-menu paper-actions-menu" id={menuId} role="menu" aria-label={label}>
          {actions.map((action, index) => (
            <ActionMenuItem key={action.label} action={action} hintId={`${menuId}-hint-${index}`} onClick={run(action)} />
          ))}
        </div>
      )}
    </div>
  );
}

// The ˅ of a button that opens a menu or a panel; it turns while it is open.
export function Chevron() {
  return (
    <svg className="paper-actions-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// One item of such a menu: the icon, the name, and under it what it does (its
// accessible description). The class page's ⋯ draws its items with it too.
export function ActionMenuItem({
  action,
  hintId,
  onClick,
}: {
  action: Omit<MenuAction, 'onChoose'>;
  hintId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={action.danger ? 'paper-action is-danger' : 'paper-action'}
      aria-label={action.label}
      aria-describedby={hintId}
      disabled={action.busy}
      onClick={onClick}
    >
      <ActionIcon name={action.icon} />
      <span className="paper-action-label">{action.label}</span>
      <span className="paper-action-hint" id={hintId}>
        {action.hint}
      </span>
    </button>
  );
}

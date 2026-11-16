import { ActionIcon, type ActionIconName } from '../ui/ActionIcon.tsx';
import { useSmallMenu } from './shell/useSmallMenu.ts';

// One item of an actions menu: its name, the icon of its verb, the words under
// it that say what it does (its accessible description), red when it deletes,
// and off while its work runs or while it cannot be chosen now.
export type MenuAction = { label: string; hint: string; icon: ActionIconName; danger?: boolean; busy: boolean; onChoose: () => void };

// A menu of actions at the top of a page ("Alte acțiuni" of the paper page,
// "Acțiuni" of the test page): each item shows what it does before it is
// chosen. Choosing one closes the menu and gives the focus back to its button
// before the action asks or opens a dialog.
export function ActionsMenu({ label, menuId, actions }: { label: string; menuId: string; actions: MenuAction[] }) {
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
        className="button-quiet button-small"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
      >
        <ActionIcon name="sliders" />
        {label}
        <svg className="paper-actions-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="class-menu paper-actions-menu" id={menuId} role="menu" aria-label={label}>
          {actions.map((action, index) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={action.danger ? 'paper-action is-danger' : 'paper-action'}
              aria-label={action.label}
              aria-describedby={`${menuId}-hint-${index}`}
              disabled={action.busy}
              onClick={run(action)}
            >
              <ActionIcon name={action.icon} />
              <span className="paper-action-label">{action.label}</span>
              <span className="paper-action-hint" id={`${menuId}-hint-${index}`}>
                {action.hint}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

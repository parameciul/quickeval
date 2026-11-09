import type { KeyboardEvent } from 'react';

// The keys of a tab list (WAI-ARIA tabs, the choice follows the focus): the
// arrows move to the next or the previous tab and wrap round, Home and End go
// to the first and the last. The new tab is chosen and takes the focus. Each
// tab has `tabIndex` 0 when chosen and -1 otherwise, so Tab reaches only the
// chosen one. Put it on the element with `role="tablist"`.
export function onTabKeyDown<T extends string>(
  event: KeyboardEvent<HTMLElement>,
  tabs: readonly T[],
  current: T,
  choose: (tab: T) => void,
  tabId: (tab: T) => string,
): void {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const at = tabs.indexOf(current);
  const next =
    event.key === 'ArrowRight'
      ? tabs[(at + 1) % tabs.length]
      : event.key === 'ArrowLeft'
        ? tabs[(at - 1 + tabs.length) % tabs.length]
        : event.key === 'Home'
          ? tabs[0]
          : event.key === 'End'
            ? tabs[tabs.length - 1]
            : undefined;
  if (next === undefined) return;
  event.preventDefault();
  choose(next);
  document.getElementById(tabId(next))?.focus();
}

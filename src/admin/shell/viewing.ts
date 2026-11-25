// What the teacher app keeps and does around an administrator's view of a
// teacher's account.

const VIEWING_KEY = 'quickeval.viewing';
const ENDED_KEY = 'quickeval.viewEnded';
const LAST_CLASS_KEY = 'quickeval:lastClass';

// The page load that leaves the view. An object, so a test can spy on it: jsdom
// does not let a test replace window.location.
export const viewTab = { leave: (path: string) => window.location.assign(path) };

// The view part of a data version ("3|||v12"): the fourth part between the
// bars, empty when no view is on.
export function viewPartOf(version: string): string {
  return version.split('|')[3] ?? '';
}

function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

// What the teacher app remembers of an account on this device (the class the
// teacher opened last) belongs to that account, not to the one that views it.
export function forgetAccountState(): void {
  try {
    window.localStorage.removeItem(LAST_CLASS_KEY);
  } catch {
    // Storage may be closed: nothing to forget then.
  }
}

// The name of the teacher whose account is viewed, kept for the tab so that a
// tab that did not start the view still names it once the view ended.
export function rememberViewedName(name: string): void {
  try {
    store()?.setItem(VIEWING_KEY, name);
  } catch {
    // The notice then shows without the name.
  }
}

// The name of the account whose view just ended, once; null when none did.
export function takeEndedName(): string | null {
  try {
    const name = store()?.getItem(ENDED_KEY) ?? null;
    store()?.removeItem(ENDED_KEY);
    return name;
  } catch {
    return null;
  }
}

// Leaves the teacher's pages for Setări, where the administrator's own account
// shows again. `ended`: the view ended on its own, so Setări says so.
export function goToSettings(ended: boolean = true): void {
  try {
    const name = store()?.getItem(VIEWING_KEY) ?? null;
    store()?.removeItem(VIEWING_KEY);
    if (ended && name !== null) store()?.setItem(ENDED_KEY, name);
  } catch {
    // The notice then shows without the name.
  }
  forgetAccountState();
  viewTab.leave('/teacher/settings');
}

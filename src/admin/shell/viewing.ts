// What the teacher app keeps and does around an administrator's view of a
// teacher's account.

const VIEWING_KEY = 'quickeval.viewing';
const ENDED_KEY = 'quickeval.viewEnded';
const LAST_CLASS_KEY = 'quickeval:lastClass';

// Once the tab starts leaving (a page load is on its way), nothing else may
// start another one: the version check must not reload under it, and a second
// goToSettings must not replace it. `exiting`: the administrator chose to exit,
// so an end that lands meanwhile is no news for them.
let leaving = false;
let exiting = false;

export function isLeaving(): boolean {
  return leaving;
}

// The administrator pressed "Ieși din vizualizare".
export function beginExit(): void {
  exiting = true;
}

// The view this tab believes it shows (its id, or 'none'), told by the shell
// when /me loads. The client sends it as X-MQ-View, so the server can refuse a
// tab whose view ended in another tab. Undefined before the first answer.
let believedView: number | 'none' | undefined;

export function setBelievedView(view: number | 'none' | undefined): void {
  believedView = view;
}

export function believedViewHeader(): string | undefined {
  return believedView === undefined ? undefined : String(believedView);
}

export function resetLeavingForTests(): void {
  leaving = false;
  exiting = false;
  believedView = undefined;
}

// The page load that leaves the view. An object, so a test can spy on it: jsdom
// does not let a test replace window.location.
export const viewTab = {
  assign: (path: string) => window.location.assign(path),
  reload: () => window.location.reload(),
  leave: (path: string) => {
    leaving = true;
    viewTab.assign(path);
  },
};

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
  if (leaving) return;
  leaving = true;
  if (exiting) ended = false;
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

// A page the browser restores from its back/forward cache keeps this module's
// state (a tab that was leaving still thinks so) and its stale data, so it
// loads again. Returns the way to stop.
export function reloadOnRestore(): () => void {
  const onShow = (event: PageTransitionEvent) => {
    if (event.persisted) viewTab.reload();
  };
  window.addEventListener('pageshow', onShow);
  return () => window.removeEventListener('pageshow', onShow);
}

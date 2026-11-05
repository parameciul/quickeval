import { useSyncExternalStore } from 'react';
import { currentTheme, otherTheme, saveTheme, storedTheme, type Theme } from './theme.ts';

const listeners = new Set<() => void>();

// The theme on screen: the page's data-theme (public/theme.js sets it before
// the page paints), else the saved choice.
function shownTheme(): Theme {
  const shown = document.documentElement.getAttribute('data-theme');
  return shown === 'dark' || shown === 'light' ? shown : currentTheme(storedTheme());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// The theme for every theme control of the page (the top bar's button, the
// phone menu's switch): a change in one shows in the others.
export function useTheme(): { theme: Theme; toggle(): void } {
  const theme = useSyncExternalStore(subscribe, shownTheme);
  const toggle = () => {
    saveTheme(otherTheme(shownTheme()));
    for (const listener of listeners) listener();
  };
  return { theme, toggle };
}

export type Theme = 'light' | 'dark';

// Keep equal to the key in public/theme.js.
export const THEME_KEY = 'quickeval.theme';

export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

// The theme on screen: the reader's choice, else light. The system setting
// does not count (public/theme.js paints the same before the page loads).
export function currentTheme(stored: Theme | null): Theme {
  return stored ?? 'light';
}

export function otherTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

export function saveTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be blocked; the choice then lasts until the page reloads.
  }
}

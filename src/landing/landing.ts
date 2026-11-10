// The landing page's script: the theme button and the Quick Try form.
// public/theme.js has already painted the theme; the button keeps its name in
// step and saves the reader's choice, the same way the app's ThemeButton does.
import { currentTheme, otherTheme, saveTheme, storedTheme, type Theme } from '../ui/theme.ts';
import { createLandingApi } from './quickTry/api.ts';
import { loadTurnstile } from './quickTry/turnstile.ts';
import { initQuickTry } from './quickTry/ui.ts';

// The button names the theme it switches to.
export function themeLabel(theme: Theme): string {
  return otherTheme(theme) === 'dark' ? 'Temă întunecată' : 'Temă luminoasă';
}

export function initThemeButton(root: ParentNode = document): void {
  const button = root.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  if (!button) return;
  let theme = currentTheme(storedTheme());
  button.setAttribute('aria-label', themeLabel(theme));
  button.addEventListener('click', () => {
    theme = otherTheme(theme);
    saveTheme(theme);
    button.setAttribute('aria-label', themeLabel(theme));
  });
}

// The device's storage, or one that keeps nothing where the browser refuses it.
function deviceStorage(): Storage {
  try {
    return window.localStorage;
  } catch {
    return { length: 0, clear: () => {}, getItem: () => null, key: () => null, removeItem: () => {}, setItem: () => {} };
  }
}

initThemeButton();
void initQuickTry(document, { api: createLandingApi(), storage: deviceStorage(), now: () => new Date(), loadTurnstile });

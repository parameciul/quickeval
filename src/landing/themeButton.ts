// The theme button of the landing page and the content pages.
// public/theme.js has already painted the theme; the button keeps its name in
// step and saves the reader's choice, the same way the app's ThemeButton does.
import { currentTheme, otherTheme, saveTheme, storedTheme, type Theme } from '../ui/theme.ts';

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

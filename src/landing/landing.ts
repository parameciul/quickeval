// The landing page's script: the theme button and the Quick Try form.
import { createLandingApi } from './quickTry/api.ts';
import { loadTurnstile } from './quickTry/turnstile.ts';
import { initQuickTry } from './quickTry/ui.ts';
import { initThemeButton } from './themeButton.ts';

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

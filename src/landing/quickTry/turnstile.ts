import type { TurnstileWidget } from './ui.ts';

// Cloudflare Turnstile's script, drawn where the page asks (render=explicit).
// The page's security policy allows this one script and its frame.
export const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(container: HTMLElement, options: { sitekey: string; language: string }): string;
  getResponse(widgetId: string): string | undefined;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function script(root: Document): Promise<TurnstileApi> {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const tag = root.createElement('script');
    tag.src = TURNSTILE_SCRIPT;
    tag.async = true;
    tag.addEventListener('load', () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile'))));
    tag.addEventListener('error', () => {
      loading = null;
      tag.remove();
      reject(new Error('turnstile'));
    });
    root.head.append(tag);
  });
  return loading;
}

// Loads the script once, then draws the check in `container`, in Romanian.
export async function loadTurnstile(container: HTMLElement, siteKey: string): Promise<TurnstileWidget> {
  const api = await script(container.ownerDocument);
  const id = api.render(container, { sitekey: siteKey, language: 'ro' });
  return { token: () => api.getResponse(id) || undefined, reset: () => api.reset(id) };
}

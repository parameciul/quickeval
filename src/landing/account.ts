import type { AuthSession } from '../../shared/api.ts';

// A logged-in teacher sees the link to the account where a visitor sees the
// login and the new-account link. The page is served signed out, so a crawler
// and a browser without the API's answer keep the login.
// The answer is also kept for the next page, so public/theme.js paints the
// right link first (keep the key equal to the one there).
export const SIGNED_IN_KEY = 'quickeval.signedIn';

export function showAccount(root: ParentNode, signedIn: boolean): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-guest]')) el.hidden = signedIn;
  for (const el of root.querySelectorAll<HTMLElement>('[data-member]')) el.hidden = !signedIn;
  document.documentElement.toggleAttribute('data-signed-in', signedIn);
  rememberSignedIn(signedIn);
}

export function rememberSignedIn(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(SIGNED_IN_KEY, '1');
    else localStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    // Storage can be blocked: the next page shows the login first.
  }
}

// The content pages ask the API whether a teacher is logged in (the landing
// page learns it from the Quick Try's availability). Any failure keeps the
// login, as the page was served.
export async function initAccountLinks(
  root: ParentNode = document,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<void> {
  try {
    const res = await fetchImpl('/api/auth/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const answer = (await res.json()) as AuthSession;
    showAccount(root, answer.signedIn === true);
  } catch {
    // Offline or a broken answer: the login stays.
  }
}

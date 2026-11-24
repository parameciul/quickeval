import { useCallback, useSyncExternalStore } from 'react';

// The phone layout of brand.css: the bar at the bottom, a panel over the page,
// one column.
export const PHONE = '(max-width: 56.25rem)';

// Below this width brand.css has no room for the list of students beside the
// exercises and the paper (the paper page).
export const NARROW = '(max-width: 75rem)';

// Below this width brand.css draws the exercises table as one card per
// exercise.
export const CARDS = '(max-width: 48rem)';

// Whether the screen matches a media query, kept up to date when it changes.
// Where the browser has no matchMedia (the tests' jsdom), nothing matches.
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

import { useCallback, useEffect, useState } from 'react';
import { PHONE_IDLE_MS, PHONE_REFRESH_MS } from '../../shared/quickTry.ts';

// While the phone's code shows, the pages are read again every 3 s, and no
// more after 15 minutes with no new page (the D1 read limit): `idle` then
// shows "Verifică din nou", and `again()` starts the 15 minutes anew.
// `interval` goes to the query's refetchInterval, which React Query already
// pauses in a hidden tab.
export function usePagesWatch(open: boolean, pageCount: number): { interval: number | false; idle: boolean; again(): void } {
  const [idle, setIdle] = useState(false);
  const [round, setRound] = useState(0);

  // Only visible time counts toward the 15 minutes: the clock stops while
  // the tab is hidden and goes on with what was left.
  useEffect(() => {
    setIdle(false);
    if (!open) return;
    let left = PHONE_IDLE_MS;
    let startedAt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      startedAt = Date.now();
      timer = setTimeout(() => setIdle(true), left);
    };
    const pause = () => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
      left = Math.max(0, left - (Date.now() - startedAt));
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause();
      else if (timer === null) run();
    };
    if (document.visibilityState !== 'hidden') run();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      pause();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [open, pageCount, round]);

  const again = useCallback(() => setRound((value) => value + 1), []);
  return { interval: open && !idle ? PHONE_REFRESH_MS : false, idle: open && idle, again };
}

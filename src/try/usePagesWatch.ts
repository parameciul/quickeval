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

  useEffect(() => {
    setIdle(false);
    if (!open) return;
    const timer = setTimeout(() => setIdle(true), PHONE_IDLE_MS);
    return () => clearTimeout(timer);
  }, [open, pageCount, round]);

  const again = useCallback(() => setRound((value) => value + 1), []);
  return { interval: open && !idle ? PHONE_REFRESH_MS : false, idle: open && idle, again };
}

import { useEffect, useState } from 'react';

// The current time, read again every minute, so a page left open keeps
// what depends on the hour (a greeting) up to date.
export function useNow(everyMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

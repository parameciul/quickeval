// The top of the Teste page (redesign spec §5), in Romania's time.

const HOUR = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: 'numeric', hourCycle: 'h23' });
const TODAY = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', weekday: 'long', day: 'numeric', month: 'long' });
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' });
const SHORT_DAY = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'short' });
const TIME = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' });

// "Bună dimineața, Laura." from 5:00, "Bună ziua" from 11:00, "Bună seara"
// from 18:00; the first word of the teacher's name, or none.
export function greeting(now: Date, name: string): string {
  const hour = Number(HOUR.format(now));
  const words = hour >= 5 && hour < 11 ? 'Bună dimineața' : hour >= 11 && hour < 18 ? 'Bună ziua' : 'Bună seara';
  const first = name.trim().split(/\s+/)[0];
  return first ? `${words}, ${first}.` : `${words}.`;
}

// "Miercuri, 4 noiembrie".
export function todayLine(now: Date): string {
  const text = TODAY.format(now);
  return text.charAt(0).toLocaleUpperCase('ro-RO') + text.slice(1);
}

// When a test started, short: "azi, 09:10" or "28 oct.".
export function startedLabel(iso: string, now: Date): string {
  const started = new Date(iso);
  return DAY_KEY.format(started) === DAY_KEY.format(now) ? `azi, ${TIME.format(started)}` : SHORT_DAY.format(started);
}

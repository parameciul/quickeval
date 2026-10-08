// A date-and-time input ("2026-10-20T10:15") in Romania's local time, whatever
// the time zone of the computer, and the UTC instant it means.

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Bucharest',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

// The Bucharest clock at an instant, written as if it were UTC.
function bucharestClock(ms: number): number {
  const part = Object.fromEntries(PARTS.formatToParts(new Date(ms)).map((p) => [p.type, Number(p.value)]));
  return Date.UTC(part.year!, part.month! - 1, part.day!, part.hour!, part.minute!, part.second!);
}

// The input value for an instant.
export function bucharestInputValue(iso: string): string {
  return new Date(bucharestClock(Date.parse(iso))).toISOString().slice(0, 16);
}

const INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// The instant an input value means, as an ISO string; null for a value that
// is not a date and time. In the hour that repeats when the clocks go back,
// the later of the two instants. A time skipped when the clocks go forward
// moves forward by the skipped hour.
export function bucharestInputToIso(value: string): string | null {
  const match = INPUT.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const clock = Date.UTC(year, month - 1, day, hour, minute);
  // Date.UTC rolls over impossible dates (31 Feb): those are not valid.
  if (new Date(clock).toISOString().slice(0, 16) !== value) return null;
  // Guess with the offset at the clock time, then correct with the offset at the guess.
  let instant = clock - (bucharestClock(clock) - clock);
  instant = clock - (bucharestClock(instant) - instant);
  return new Date(instant).toISOString();
}

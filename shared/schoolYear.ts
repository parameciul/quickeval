const TIME_ZONE = 'Europe/Bucharest';

// September-December of year Y and January-August of year Y+1 form school year Y.
// The month is read in Romania's time zone, so the switch happens at local midnight.
export function schoolYearOf(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return month >= 9 ? year : year - 1;
}

export function formatSchoolYear(year: number): string {
  return `${year}-${year + 1}`;
}

export function isValidSchoolYear(year: number): boolean {
  return Number.isInteger(year) && year >= 2020 && year <= 2100;
}

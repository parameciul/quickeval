// Points and grades are computed by code, never by Claude (spec §7.3).

// Rounds to 2 decimals; 1.005 becomes 1.01.
export function round2(value: number): number {
  return Math.round(Number((value * 100).toPrecision(12))) / 100;
}

// The grade out of 10: total * 10 / max_total, 2 decimals.
export function gradeOf(total: number, maxTotal: number): number {
  return round2((total * 10) / maxTotal);
}

const POINTS = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 });

// Romanian numbers in messages: "9,5", "10".
export function formatPoints(value: number): string {
  return POINTS.format(value);
}

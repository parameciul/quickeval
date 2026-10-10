// Points and grades are computed by code, never by Claude (spec §7.3).

// Rounds to 2 decimals; 1.005 becomes 1.01.
export function round2(value: number): number {
  return Math.round(Number((value * 100).toPrecision(12))) / 100;
}

// The grade out of 10: total * 10 / max_total, 2 decimals.
export function gradeOf(total: number, maxTotal: number): number {
  return round2((total * 10) / maxTotal);
}

// The teacher corrects points in steps of 0.05 (spec §11.1).
export const POINTS_STEP_CENTS = 5;

// The points in whole cents, or null when they have more than 2 decimals.
export function toCents(points: number): number | null {
  const cents = Math.round(points * 100);
  return Math.abs(points * 100 - cents) < 1e-6 ? cents : null;
}

// Points the teacher may give for an item worth `maxPoints`: from 0 to the
// maximum in steps of 0.05, and the maximum itself, which a barem can set to
// a value like 0.33.
export function isValidCorrection(points: number, maxPoints: number): boolean {
  const cents = toCents(points);
  const max = Math.round(maxPoints * 100);
  return cents !== null && cents >= 0 && cents <= max && (cents % POINTS_STEP_CENTS === 0 || cents === max);
}

const POINTS = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 });

// Romanian numbers in messages: "9,5", "10".
export function formatPoints(value: number): string {
  return POINTS.format(value);
}

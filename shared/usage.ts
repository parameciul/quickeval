// The usage statistics on Setări (spec
// docs/superpowers/specs/2026-11-18-usage-stats-and-visits-design.md): the
// robot's work per Bucharest day, for Quick Try, for the teachers, or both.

export const USAGE_SOURCES = ['all', 'quick-try', 'teachers'] as const;
export type UsageSource = (typeof USAGE_SOURCES)[number];

// The last 7 days, the last 30 days (one entry per day), or the last 12
// calendar months (one entry per month), today and this month included.
export const USAGE_PERIODS = ['7d', '30d', '12m'] as const;
export type UsagePeriod = (typeof USAGE_PERIODS)[number];

export interface UsageCounts {
  papers: number;
  barems: number;
  exerciseLists: number;
  analyses: number;
  prints: number;
  failed: number;
  tokens: number;
  tries: number;
}

// One day ("YYYY-MM-DD") or one month ("YYYY-MM") of a period.
export interface UsageRow extends UsageCounts {
  key: string;
}

// The newest day or month first. `tries` is always 0 for the teachers.
export interface UsageStats {
  source: UsageSource;
  period: UsagePeriod;
  totals: UsageCounts;
  rows: UsageRow[];
}

export const EMPTY_USAGE: UsageCounts = { papers: 0, barems: 0, exerciseLists: 0, analyses: 0, prints: 0, failed: 0, tokens: 0, tries: 0 };

export function isUsageSource(raw: string | undefined): raw is UsageSource {
  return (USAGE_SOURCES as readonly string[]).includes(raw ?? '');
}

export function isUsagePeriod(raw: string | undefined): raw is UsagePeriod {
  return (USAGE_PERIODS as readonly string[]).includes(raw ?? '');
}

// The days or months of a period that ends on `today` (a Bucharest day,
// "YYYY-MM-DD"), the newest first.
export function usageKeys(period: UsagePeriod, today: string): string[] {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  if (period === '12m') {
    return Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(year, month - 1 - i, 1)).toISOString().slice(0, 7));
  }
  const count = period === '7d' ? 7 : 30;
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(year, month - 1, day - i)).toISOString().slice(0, 10));
}

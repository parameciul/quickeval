import { bucharestDay, isQuickTryToken, QUICK_TRY_DAYS } from '../../../shared/quickTry.ts';

// The visitor's last try, kept on her device for 7 days (spec §3.1): its link,
// its test's code and the time it was made. A new try replaces it.
export interface StoredTry {
  token: string;
  code: string;
  madeAt: string;
}

export const STORED_TRY_KEY = 'quickeval.quickTry';

const DAY_MS = 24 * 60 * 60 * 1000;

// The stored try, or null when there is none, it is not a try, or its 7 days
// are over. A storage that refuses (a private window) keeps nothing.
export function readStoredTry(storage: Storage, now: Date): StoredTry | null {
  let raw: string | null;
  try {
    raw = storage.getItem(STORED_TRY_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let value: Partial<StoredTry> | null;
  try {
    value = JSON.parse(raw) as Partial<StoredTry> | null;
  } catch {
    return null;
  }
  const { token, code, madeAt } = value ?? {};
  if (typeof token !== 'string' || !isQuickTryToken(token) || typeof code !== 'string' || typeof madeAt !== 'string') return null;
  const made = Date.parse(madeAt);
  if (Number.isNaN(made) || now.getTime() >= made + QUICK_TRY_DAYS * DAY_MS) return null;
  return { token, code, madeAt };
}

export function saveStoredTry(storage: Storage, stored: StoredTry): void {
  try {
    storage.setItem(STORED_TRY_KEY, JSON.stringify(stored));
  } catch {
    // A storage that refuses: the link still shows until the page closes.
  }
}

// Forgets the stored try: its link no longer works (deleted or expired).
export function forgetStoredTry(storage: Storage): void {
  try {
    storage.removeItem(STORED_TRY_KEY);
  } catch {
    // A storage that refuses keeps nothing anyway.
  }
}

// Whether the stored try was made on today's Bucharest day: one try per device per day.
export function usedToday(stored: StoredTry | null, now: Date): boolean {
  return stored !== null && bucharestDay(new Date(stored.madeAt)) === bucharestDay(now);
}

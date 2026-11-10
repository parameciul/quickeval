import { describe, expect, it } from 'vitest';
import { readStoredTry, saveStoredTry, STORED_TRY_KEY, usedToday, type StoredTry } from './storage.ts';

const TOKEN = 'abcdefghijkmnopqrstuvwxyz2345672';

function memory(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const stored: StoredTry = { token: TOKEN, code: 'PROBA-26T1', madeAt: '2026-11-10T08:00:00.000Z' };

describe("the try kept on the visitor's device", () => {
  it('keeps the link and the time it was made', () => {
    const storage = memory();
    saveStoredTry(storage, stored);
    expect(JSON.parse(storage.getItem(STORED_TRY_KEY)!)).toEqual(stored);
    expect(readStoredTry(storage, new Date('2026-11-12T08:00:00.000Z'))).toEqual(stored);
  });

  it('forgets it after 7 days', () => {
    const storage = memory({ [STORED_TRY_KEY]: JSON.stringify(stored) });
    expect(readStoredTry(storage, new Date('2026-11-17T07:59:59.000Z'))).toEqual(stored);
    expect(readStoredTry(storage, new Date('2026-11-17T08:00:00.000Z'))).toBeNull();
  });

  it('a new try replaces the stored one', () => {
    const storage = memory({ [STORED_TRY_KEY]: JSON.stringify(stored) });
    const next = { ...stored, token: 'b'.repeat(32), madeAt: '2026-11-11T09:00:00.000Z' };
    saveStoredTry(storage, next);
    expect(readStoredTry(storage, new Date('2026-11-11T10:00:00.000Z'))).toEqual(next);
  });

  it('ignores what is not a try', () => {
    for (const raw of ['nu e JSON', '{}', JSON.stringify({ ...stored, token: 'scurt' }), JSON.stringify({ ...stored, madeAt: 'ieri' })]) {
      expect(readStoredTry(memory({ [STORED_TRY_KEY]: raw }), new Date('2026-11-10T09:00:00.000Z'))).toBeNull();
    }
  });

  it('works without storage, as in a private window that refuses it', () => {
    const refusing = memory();
    refusing.getItem = () => {
      throw new Error('denied');
    };
    refusing.setItem = () => {
      throw new Error('denied');
    };
    expect(readStoredTry(refusing, new Date())).toBeNull();
    expect(() => saveStoredTry(refusing, stored)).not.toThrow();
  });

  it("says whether it was made today, Bucharest's day", () => {
    // 23:30 in Bucharest on 10 November is 21:30 UTC.
    const late = { ...stored, madeAt: '2026-11-10T21:30:00.000Z' };
    expect(usedToday(late, new Date('2026-11-10T21:45:00.000Z'))).toBe(true);
    expect(usedToday(late, new Date('2026-11-10T22:05:00.000Z'))).toBe(false);
    expect(usedToday(null, new Date())).toBe(false);
  });
});

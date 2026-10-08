import { describe, expect, it } from 'vitest';
import { bucharestInputToIso, bucharestInputValue } from './bucharestTime.ts';

describe('bucharestInputToIso', () => {
  it('reads summer and winter times', () => {
    expect(bucharestInputToIso('2026-10-20T10:15')).toBe('2026-10-20T07:15:00.000Z');
    expect(bucharestInputToIso('2026-12-01T08:00')).toBe('2026-12-01T06:00:00.000Z');
  });

  it('takes the later instant in the hour that repeats on 25 Oct 2026', () => {
    expect(bucharestInputToIso('2026-10-25T02:59')).toBe('2026-10-24T23:59:00.000Z');
    expect(bucharestInputToIso('2026-10-25T03:30')).toBe('2026-10-25T01:30:00.000Z');
    expect(bucharestInputToIso('2026-10-25T04:00')).toBe('2026-10-25T02:00:00.000Z');
  });

  it('moves a time skipped on 29 Mar 2026 forward by an hour', () => {
    expect(bucharestInputToIso('2026-03-29T02:30')).toBe('2026-03-29T00:30:00.000Z');
    expect(bucharestInputToIso('2026-03-29T03:30')).toBe('2026-03-29T01:30:00.000Z');
    expect(bucharestInputToIso('2026-03-29T04:30')).toBe('2026-03-29T01:30:00.000Z');
  });

  it.each(['', 'mâine', '2026-02-31T10:00', '2026-10-20T25:00', '2026-10-20 10:15'])('refuses %j', (value) => {
    expect(bucharestInputToIso(value)).toBeNull();
  });
});

describe('bucharestInputValue', () => {
  it('shows an instant on the Bucharest clock', () => {
    expect(bucharestInputValue('2026-10-20T07:15:00.000Z')).toBe('2026-10-20T10:15');
    expect(bucharestInputValue('2026-12-01T06:00:00.000Z')).toBe('2026-12-01T08:00');
  });

  it('shows both instants of the repeated hour as the same clock time', () => {
    expect(bucharestInputValue('2026-10-25T00:30:00.000Z')).toBe('2026-10-25T03:30');
    expect(bucharestInputValue('2026-10-25T01:30:00.000Z')).toBe('2026-10-25T03:30');
  });
});

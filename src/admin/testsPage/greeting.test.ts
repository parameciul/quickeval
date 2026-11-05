import { describe, expect, it } from 'vitest';
import { greeting, startedLabel, todayLine } from './greeting.ts';

describe('greeting', () => {
  // November: Romania is 2 hours ahead of UTC.
  it.each([
    ['2026-11-04T02:59:00.000Z', 'Bună seara, Laura.'],
    ['2026-11-04T03:00:00.000Z', 'Bună dimineața, Laura.'],
    ['2026-11-04T08:59:00.000Z', 'Bună dimineața, Laura.'],
    ['2026-11-04T09:00:00.000Z', 'Bună ziua, Laura.'],
    ['2026-11-04T15:59:00.000Z', 'Bună ziua, Laura.'],
    ['2026-11-04T16:00:00.000Z', 'Bună seara, Laura.'],
    ['2026-11-04T21:30:00.000Z', 'Bună seara, Laura.'],
  ])('at %s says "%s"', (iso, expected) => {
    expect(greeting(new Date(iso), 'Laura Miron')).toBe(expected);
  });

  it("follows Romania's summer time", () => {
    expect(greeting(new Date('2026-06-10T07:59:00.000Z'), 'Laura Miron')).toBe('Bună dimineața, Laura.');
    expect(greeting(new Date('2026-06-10T08:00:00.000Z'), 'Laura Miron')).toBe('Bună ziua, Laura.');
  });

  it('takes the first word of the name, and none without a name', () => {
    expect(greeting(new Date('2026-11-04T10:00:00.000Z'), '  Ana  Maria Pop ')).toBe('Bună ziua, Ana.');
    expect(greeting(new Date('2026-11-04T10:00:00.000Z'), ' ')).toBe('Bună ziua.');
  });
});

describe('todayLine', () => {
  it("writes today in Romania's time, the weekday first, with a capital letter", () => {
    expect(todayLine(new Date('2026-11-04T07:30:00.000Z'))).toBe('Miercuri, 4 noiembrie');
    expect(todayLine(new Date('2026-11-04T22:30:00.000Z'))).toBe('Joi, 5 noiembrie');
  });
});

describe('startedLabel', () => {
  const now = new Date('2026-11-04T10:00:00.000Z');

  it('gives the time of a test that started today', () => {
    expect(startedLabel('2026-11-04T07:10:00.000Z', now)).toBe('azi, 09:10');
  });

  it('gives the day of an older test', () => {
    expect(startedLabel('2026-10-28T07:10:00.000Z', now)).toBe('28 oct.');
  });

  it("counts the day in Romania's time", () => {
    expect(startedLabel('2026-11-03T22:30:00.000Z', now)).toBe('azi, 00:30');
  });
});

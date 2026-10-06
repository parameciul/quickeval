import { describe, expect, it } from 'vitest';
import { cleanStudentName, compareStudentNames, parseStudentNames } from './students.ts';

describe('cleanStudentName', () => {
  it('trims and joins inner spaces', () => {
    expect(cleanStudentName('  Popescu   Ana  ')).toBe('Popescu Ana');
  });

  it('drops a leading list number', () => {
    expect(cleanStudentName('1. Popescu Ana')).toBe('Popescu Ana');
    expect(cleanStudentName('12) Ionescu Dan')).toBe('Ionescu Dan');
    expect(cleanStudentName('3\tMarin Ioana')).toBe('Marin Ioana');
  });
});

describe('parseStudentNames', () => {
  it('reads one name per line and skips empty lines', () => {
    expect(parseStudentNames('Popescu Ana\r\n\n  2. Ionescu Dan \n')).toEqual(['Popescu Ana', 'Ionescu Dan']);
  });

  it('keeps two students with the same name', () => {
    expect(parseStudentNames('Pop Ion\nPop Ion')).toEqual(['Pop Ion', 'Pop Ion']);
  });
});

describe('compareStudentNames', () => {
  it('uses Romanian alphabetical order', () => {
    expect(['Ștefan Ana', 'Sandu Ion', 'Tudor Ema'].sort(compareStudentNames)).toEqual([
      'Sandu Ion',
      'Ștefan Ana',
      'Tudor Ema',
    ]);
  });
});

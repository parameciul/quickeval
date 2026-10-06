import { describe, expect, it } from 'vitest';
import { addStudentsBody, createClassBody, renameStudentBody, updateClassBody } from './api.ts';

describe('createClassBody', () => {
  it('normalizes the class name', () => {
    expect(createClassBody.parse({ name: ' 6e2', schoolYear: 2026 })).toEqual({ name: '6E2', schoolYear: 2026 });
  });

  it('explains a bad class name in Romanian', () => {
    const result = createClassBody.safeParse({ name: '6-E2', schoolYear: 2026 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Numele clasei are 1-8 litere și cifre, de exemplu 6E2.');
  });

  it('refuses a school year outside 2020-2100', () => {
    expect(createClassBody.safeParse({ name: '6E2', schoolYear: 1999 }).success).toBe(false);
  });
});

describe('updateClassBody', () => {
  it('needs at least one field', () => {
    expect(updateClassBody.safeParse({}).success).toBe(false);
    expect(updateClassBody.parse({ archived: true })).toEqual({ archived: true });
  });
});

describe('addStudentsBody', () => {
  it('cleans every name', () => {
    expect(addStudentsBody.parse({ names: ['1. Pop  Ana'] })).toEqual({ names: ['Pop Ana'] });
  });

  it('refuses an empty list, an empty name, and more than 60 names', () => {
    expect(addStudentsBody.safeParse({ names: [] }).success).toBe(false);
    expect(addStudentsBody.safeParse({ names: ['  '] }).success).toBe(false);
    expect(addStudentsBody.safeParse({ names: Array.from({ length: 61 }, (_, i) => `Elev ${i}`) }).success).toBe(false);
  });
});

describe('renameStudentBody', () => {
  it('refuses a name longer than 80 characters', () => {
    expect(renameStudentBody.safeParse({ fullName: 'a'.repeat(81) }).success).toBe(false);
  });
});

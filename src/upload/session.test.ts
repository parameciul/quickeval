import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetSecret, loadSecret, saveSecret, savedStudent } from './session.ts';

const TOKEN = 'abcdefghijkmnop2';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('session secrets', () => {
  it('keeps one secret per link and student', () => {
    saveSecret(TOKEN, 10, 'secret-10');
    expect(loadSecret(TOKEN, 10)).toBe('secret-10');
    expect(localStorage.getItem(`qe.session.${TOKEN}.10`)).toBe('secret-10');
    expect(loadSecret(TOKEN, 11)).toBeNull();
    expect(loadSecret('otherlinktoken22', 10)).toBeNull();
    forgetSecret(TOKEN, 10);
    expect(loadSecret(TOKEN, 10)).toBeNull();
  });

  it('works without errors when the storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveSecret(TOKEN, 10, 's')).not.toThrow();
    expect(loadSecret(TOKEN, 10)).toBeNull();
  });

  it('finds the student whose upload this phone started', () => {
    saveSecret(TOKEN, 11, 's');
    saveSecret(TOKEN, 12, 's');
    const students = [
      { id: 10, name: 'Ionescu Ana', state: 'in_progress' as const },
      { id: 11, name: 'Pop Ion', state: 'in_progress' as const },
      { id: 12, name: 'Stan Eva', state: 'done' as const },
    ];
    expect(savedStudent(TOKEN, students)?.id).toBe(11);
    expect(savedStudent(TOKEN, students.slice(2))).toBeNull();
  });
});

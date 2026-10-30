import { describe, expect, it, vi } from 'vitest';
import { hashPassword, PASSWORD_ITERATIONS, verifyPassword } from './passwords.ts';

describe('password hashes', () => {
  it('accepts the right password and refuses another', async () => {
    const stored = await hashPassword('parola-buna');
    expect(stored.startsWith(`pbkdf2-sha256$${PASSWORD_ITERATIONS}$`)).toBe(true);
    expect(await verifyPassword('parola-buna', stored)).toBe(true);
    expect(await verifyPassword('parola-rea', stored)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('aceeași parolă')).not.toBe(await hashPassword('aceeași parolă'));
  });

  it('reads the iterations from the stored value', async () => {
    const stored = await hashPassword('parola', 1000);
    expect(await verifyPassword('parola', stored)).toBe(true);
  });

  it.each([null, '', 'plain', 'pbkdf2-sha256$abc$AA$AA', 'pbkdf2-sha256$1000000$AA$AA', 'pbkdf2-sha256$1000$%%%$AA', 'md5$1$AA$AA'])(
    'refuses the stored value %j',
    async (stored) => {
      expect(await verifyPassword('parola', stored)).toBe(false);
    },
  );

  it('runs the full hash also for a missing or broken stored value, so it takes as long as a wrong password', async () => {
    const derive = vi.spyOn(crypto.subtle, 'deriveBits');
    try {
      expect(await verifyPassword('parola', null)).toBe(false);
      expect(await verifyPassword('parola', 'plain')).toBe(false);
      expect(derive).toHaveBeenCalledTimes(2);
      expect(derive.mock.calls[0]![0]).toMatchObject({ iterations: PASSWORD_ITERATIONS });
    } finally {
      derive.mockRestore();
    }
  });
});

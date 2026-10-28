import { describe, expect, it } from 'vitest';
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
});

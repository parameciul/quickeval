import { describe, expect, it } from 'vitest';
import { passwordSql, passwordWasSet, storedHashSql } from './setPassword.ts';

describe('passwordSql', () => {
  it('sets the hash and ends the logins of the account', () => {
    const sql = passwordSql('plesalaura@yahoo.com', 'pbkdf2-sha256$30000$c2FsdA==$aGFzaA==');
    expect(sql).toContain("SET password_hash = 'pbkdf2-sha256$30000$c2FsdA==$aGFzaA=='");
    expect(sql).toContain("WHERE email = 'plesalaura@yahoo.com'");
    expect(sql).toContain('DELETE FROM sessions');
    expect(sql.endsWith(';\n')).toBe(true);
  });

  it.each([
    ["a'b@example.com", 'pbkdf2-sha256$1$AA$AA'],
    ['a@example.com', "x' OR 1=1"],
  ])('refuses input that could leave the quotes: %s %s', (email, hash) => {
    expect(() => passwordSql(email, hash)).toThrow();
  });
});

describe('storedHashSql', () => {
  it('reads the hash of the account, with nothing a shell would change', () => {
    expect(storedHashSql('plesalaura@yahoo.com')).toBe("SELECT password_hash FROM teachers WHERE email = 'plesalaura@yahoo.com'");
  });

  it.each(["a'b@example.com", 'a%path%@example.com', 'a"b@example.com'])('refuses %s', (email) => {
    expect(() => storedHashSql(email)).toThrow();
  });
});

describe('passwordWasSet', () => {
  const hash = 'pbkdf2-sha256$20000$c2FsdA==$aGFzaA==';
  const answer = (stored: string | null) => JSON.stringify([{ results: stored === null ? [] : [{ password_hash: stored }], success: true }]);

  it('is true only when the account holds the new hash', () => {
    expect(passwordWasSet(answer(hash), hash)).toBe(true);
    expect(passwordWasSet(answer('pbkdf2-sha256$20000$alt$alt'), hash)).toBe(false);
    expect(passwordWasSet(answer(null), hash)).toBe(false);
    expect(passwordWasSet('not json', hash)).toBe(false);
  });

  it('skips a notice of wrangler before the JSON', () => {
    expect(passwordWasSet(`Update available!\n${answer(hash)}`, hash)).toBe(true);
  });
});

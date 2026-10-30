import { describe, expect, it } from 'vitest';
import { passwordSql, passwordWasSet } from './setPassword.ts';

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

describe('passwordWasSet', () => {
  it('reads the count of the last statement', () => {
    const answer = (changed: number) => JSON.stringify([{ results: [] }, { results: [] }, { results: [{ changed }] }]);
    expect(passwordWasSet(answer(1))).toBe(true);
    expect(passwordWasSet(answer(0))).toBe(false);
    expect(passwordWasSet('not json')).toBe(false);
  });
});

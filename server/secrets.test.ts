import { describe, expect, it } from 'vitest';
import { isUploadToken } from '../shared/tests.ts';
import { constantTimeEqual, newDeviceSecret, newRobotKey, newUploadToken, randomBase32, sha256Hex } from './secrets.ts';

describe('secrets', () => {
  it('makes upload tokens that the student routes accept, different every time', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newUploadToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(isUploadToken(token)).toBe(true);
  });

  it('makes base32 strings of the asked length', () => {
    expect(randomBase32(8)).toMatch(/^[a-z2-7]{8}$/);
  });

  it('makes 192-bit device secrets in base64url', () => {
    const secret = newDeviceSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newDeviceSecret()).not.toBe(secret);
  });

  it('makes 256-bit robot keys in base64url', () => {
    const key = newRobotKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newRobotKey()).not.toBe(key);
  });

  it('compares strings without stopping at the first difference', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });

  it('hashes text with SHA-256 as lowercase hex', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

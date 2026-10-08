// Random secrets and their hashes (spec §15). Only hashes of device secrets
// are stored; the secrets themselves stay in the students' browsers.

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

// Each character carries 5 random bits (a byte's low 5 bits: no bias).
export function randomBase32(length: number): string {
  let out = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(length))) out += BASE32.charAt(byte & 31);
  return out;
}

// The secret part of a student upload link: 16 characters, 80 bits.
export function newUploadToken(): string {
  return randomBase32(16);
}

function randomBase64Url(bytes: number): string {
  let binary = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(bytes))) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// The secret that ties an upload to one phone: 24 bytes (192 bits), base64url.
export function newDeviceSecret(): string {
  return randomBase64Url(24);
}

// The robot's key: 32 bytes (256 bits), base64url. Only its hash is stored.
export function newRobotKey(): string {
  return randomBase64Url(32);
}

// Compares two strings in a time that does not depend on where they differ.
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

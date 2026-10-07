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

// The secret that ties an upload to one phone: 24 bytes (192 bits), base64url.
export function newDeviceSecret(): string {
  let binary = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(24))) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

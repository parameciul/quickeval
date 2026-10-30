// Password hashes: PBKDF2-SHA-256 with a random 16-byte salt, stored as
// pbkdf2-sha256$<iterations>$<salt>$<hash> (base64). The iterations are low
// for PBKDF2 because a Function has 10 ms of CPU per request on the free plan
// (20 000 take about 4 ms, and changing a password runs two); the login locks
// in db/accounts.ts slow down guessing instead. The stored count is read back,
// so it can change later and old hashes keep working.

export const PASSWORD_ITERATIONS = 20_000;
const PREFIX = 'pbkdf2-sha256';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${PREFIX}$${iterations}$${toBase64(salt)}$${toBase64(await derive(password, salt, iterations))}`;
}

interface StoredHash {
  iterations: number;
  salt: Uint8Array<ArrayBuffer>;
  expected: Uint8Array;
}

// The parts of a stored value, or null for a value in another format.
function parse(stored: string | null): StoredHash | null {
  const parts = (stored ?? '').split('$');
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100_000) return null;
  try {
    return { iterations, salt: fromBase64(parts[2]!), expected: fromBase64(parts[3]!) };
  } catch {
    return null;
  }
}

// False for a wrong password and for a stored value in another format (an
// account without a password yet). Both take as long as a wrong password, so
// the time of the answer tells nothing about the account.
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) {
    await derive(password, new Uint8Array(16), PASSWORD_ITERATIONS);
    return false;
  }
  const { iterations, salt, expected } = parsed;
  const actual = await derive(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}

// Checks the Cloudflare Access login token (Cf-Access-Jwt-Assertion header):
// RS256 signature against the team's published keys, issuer, audience, expiry
// and not-before. Ported from the Website's functions/tm25mlg/api/_middleware.js.

export interface AccessConfig {
  teamDomain: string;
  aud: string;
}

// unavailable: the token could not be checked because the team's keys could
// not be downloaded. The caller answers 503 (try again later), not 403.
export type AccessResult = { ok: true; email: string } | { ok: false; message: string; unavailable?: true };

export type FetchLike = (url: string) => Promise<Response>;

interface Jwk extends JsonWebKey {
  kid?: string;
}

interface ParsedJwt {
  header: { alg?: string; kid?: string };
  payload: { email?: unknown; aud?: unknown; iss?: unknown; exp?: unknown; nbf?: unknown };
  signingInput: string;
  signature: Uint8Array<ArrayBuffer>;
}

const CACHE_FOR_MS = 5 * 60 * 1000;
// At most one forced download per this time, so tokens with made-up key ids
// cannot turn into a stream of downloads.
const REFETCH_EVERY_MS = 30 * 1000;

let certCache: { at: number; forcedAt: number; keys: Jwk[] | null } = { at: 0, forcedAt: 0, keys: null };

// Test hook: forget the cached signing keys.
export function clearCertCache(): void {
  certCache = { at: 0, forcedAt: 0, keys: null };
}

function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> {
  let b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function parseJwt(token: string): ParsedJwt | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts as [string, string, string];
  try {
    const decode = (part: string) => JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
    const header = decode(head);
    const payload = decode(body);
    // Validate that header and payload are non-null objects (not arrays)
    if (!header || typeof header !== 'object' || Array.isArray(header)) return null;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    return { header, payload, signingInput: `${head}.${body}`, signature: base64UrlToBytes(sig) };
  } catch {
    return null;
  }
}

// fresh: skip the cache once, because Access rotates its signing keys.
// When the download fails, keys downloaded earlier are still used: Access
// keeps old keys valid for a while after a rotation.
async function accessKeys(teamDomain: string, fetchImpl: FetchLike, fresh: boolean): Promise<Jwk[]> {
  const now = Date.now();
  if (certCache.keys) {
    if (!fresh && now - certCache.at < CACHE_FOR_MS) return certCache.keys;
    if (fresh && now - certCache.forcedAt < REFETCH_EVERY_MS) return certCache.keys;
  }
  if (fresh) certCache.forcedAt = now;
  try {
    const res = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error(`certs HTTP ${res.status}`);
    const json = (await res.json()) as { keys?: Jwk[] };
    certCache.keys = json.keys ?? [];
    certCache.at = now;
    return certCache.keys;
  } catch (err) {
    if (certCache.keys) return certCache.keys;
    throw err;
  }
}

export async function verifyAccessJwt(
  token: string | undefined,
  config: AccessConfig,
  fetchImpl: FetchLike = (url) => fetch(url),
): Promise<AccessResult> {
  if (!token) return { ok: false, message: 'Lipsește autentificarea.' };
  const jwt = parseJwt(token);
  if (!jwt || jwt.header.alg !== 'RS256') return { ok: false, message: 'Token de autentificare greșit.' };

  const findKey = async (fresh: boolean) =>
    (await accessKeys(config.teamDomain, fetchImpl, fresh)).find((key) => key.kid === jwt.header.kid) ?? null;
  let jwk: Jwk | null;
  try {
    jwk = (await findKey(false)) ?? (await findKey(true));
  } catch {
    return { ok: false, message: 'Nu pot verifica autentificarea acum.', unavailable: true };
  }
  if (!jwk) return { ok: false, message: 'Cheie de autentificare necunoscută.' };

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  } catch {
    return { ok: false, message: 'Cheie de autentificare greșită.' };
  }
  const valid = await crypto.subtle
    .verify('RSASSA-PKCS1-v1_5', key, jwt.signature, new TextEncoder().encode(jwt.signingInput))
    .catch(() => false);
  if (!valid) return { ok: false, message: 'Semnătura autentificării nu este validă.' };

  const { email, aud, iss, exp, nbf } = jwt.payload;
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof exp !== 'number' || exp <= nowSec) return { ok: false, message: 'Autentificarea a expirat.' };
  // One minute of leeway for clock drift between Access and this Function.
  if (typeof nbf === 'number' && nbf > nowSec + 60) return { ok: false, message: 'Autentificarea nu este încă validă.' };
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes(config.aud)) return { ok: false, message: 'Autentificare pentru altă aplicație.' };
  if (String(iss ?? '').replace(/\/+$/, '') !== `https://${config.teamDomain}`) {
    return { ok: false, message: 'Autentificare de la alt emitent.' };
  }
  if (typeof email !== 'string' || email === '') return { ok: false, message: 'Autentificarea nu are email.' };
  return { ok: true, email: email.toLowerCase() };
}

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearCertCache, verifyAccessJwt, type FetchLike } from './access.ts';

const TEAM = 'school.cloudflareaccess.com';
const AUD = 'aud-123';
const config = { teamDomain: TEAM, aud: AUD };

let privateKey: CryptoKey;
let publicJwk: JsonWebKey & { kid: string };

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const encodeJson = (value: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(value)));

async function sign(payload: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'key-1' }) {
  const input = `${encodeJson(header)}.${encodeJson(payload)}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(input));
  return `${input}.${base64Url(new Uint8Array(signature))}`;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const goodPayload = () => ({ email: 'Profesor@Example.com', aud: [AUD], iss: `https://${TEAM}`, exp: nowSec() + 600 });
const certsFetch: FetchLike = async () => Response.json({ keys: [publicJwk] });

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  privateKey = pair.privateKey;
  publicJwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'key-1' };
});

beforeEach(() => clearCertCache());

describe('verifyAccessJwt', () => {
  it('accepts a good token and returns the email in lowercase', async () => {
    expect(await verifyAccessJwt(await sign(goodPayload()), config, certsFetch)).toEqual({
      ok: true,
      email: 'profesor@example.com',
    });
  });

  it('refuses a missing token', async () => {
    expect((await verifyAccessJwt(undefined, config, certsFetch)).ok).toBe(false);
  });

  it('refuses a token that is not RS256', async () => {
    const token = await sign(goodPayload(), { alg: 'HS256', kid: 'key-1' });
    expect((await verifyAccessJwt(token, config, certsFetch)).ok).toBe(false);
  });

  it('refuses a malformed token with null header', async () => {
    expect(await verifyAccessJwt('bnVsbA.e30.AA', config, certsFetch)).toEqual({
      ok: false,
      message: 'Token de autentificare greșit.',
    });
  });

  it('refuses a token signed with an unknown key id', async () => {
    const token = await sign(goodPayload(), { alg: 'RS256', kid: 'other' });
    expect(await verifyAccessJwt(token, config, certsFetch)).toEqual({
      ok: false,
      message: 'Cheie de autentificare necunoscută.',
    });
  });

  it('refuses a changed payload', async () => {
    const [head, , sig] = (await sign(goodPayload())).split('.');
    const forged = `${head}.${encodeJson({ ...goodPayload(), email: 'intruder@example.com' })}.${sig}`;
    expect((await verifyAccessJwt(forged, config, certsFetch)).ok).toBe(false);
  });

  it('refuses an expired token', async () => {
    const token = await sign({ ...goodPayload(), exp: nowSec() - 1 });
    expect(await verifyAccessJwt(token, config, certsFetch)).toEqual({ ok: false, message: 'Autentificarea a expirat.' });
  });

  it('refuses a token for another audience or issuer', async () => {
    const otherAudience = await sign({ ...goodPayload(), aud: ['other'] });
    const otherIssuer = await sign({ ...goodPayload(), iss: 'https://evil.example' });
    expect((await verifyAccessJwt(otherAudience, config, certsFetch)).ok).toBe(false);
    expect((await verifyAccessJwt(otherIssuer, config, certsFetch)).ok).toBe(false);
  });

  it('refuses a token without an email', async () => {
    const { email: _ignored, ...payload } = goodPayload();
    expect((await verifyAccessJwt(await sign(payload), config, certsFetch)).ok).toBe(false);
  });

  it('downloads the keys again once when it meets an unknown key id', async () => {
    let calls = 0;
    const rotatingFetch: FetchLike = async () => {
      calls += 1;
      return Response.json({ keys: calls === 1 ? [] : [publicJwk] });
    };
    expect((await verifyAccessJwt(await sign(goodPayload()), config, rotatingFetch)).ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('reports a failed key download without throwing', async () => {
    const failingFetch: FetchLike = async () => new Response('down', { status: 503 });
    expect(await verifyAccessJwt(await sign(goodPayload()), config, failingFetch)).toEqual({
      ok: false,
      message: 'Nu pot verifica autentificarea acum.',
    });
  });
});

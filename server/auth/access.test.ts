import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeJson, makeAccessSigner, type AccessSigner } from '../test/accessSigner.ts';
import { clearCertCache, verifyAccessJwt, type FetchLike } from './access.ts';

const TEAM = 'school.cloudflareaccess.com';
const AUD = 'aud-123';
const config = { teamDomain: TEAM, aud: AUD };

let signer: AccessSigner;

const nowSec = () => Math.floor(Date.now() / 1000);
const goodPayload = () => ({ email: 'Profesor@Example.com', aud: [AUD], iss: `https://${TEAM}`, exp: nowSec() + 600 });
const certsFetch: FetchLike = async () => Response.json({ keys: [signer.publicJwk] });

beforeAll(async () => {
  signer = await makeAccessSigner();
});

beforeEach(() => clearCertCache());

afterEach(() => {
  vi.useRealTimers();
});

describe('verifyAccessJwt', () => {
  it('accepts a good token and returns the email in lowercase', async () => {
    expect(await verifyAccessJwt(await signer.sign(goodPayload()), config, certsFetch)).toEqual({
      ok: true,
      email: 'profesor@example.com',
    });
  });

  it('accepts an audience written as one string', async () => {
    const token = await signer.sign({ ...goodPayload(), aud: AUD });
    expect((await verifyAccessJwt(token, config, certsFetch)).ok).toBe(true);
  });

  it('refuses a missing token', async () => {
    expect((await verifyAccessJwt(undefined, config, certsFetch)).ok).toBe(false);
  });

  it('refuses a token that is not RS256', async () => {
    const token = await signer.sign(goodPayload(), { alg: 'HS256', kid: 'key-1' });
    expect((await verifyAccessJwt(token, config, certsFetch)).ok).toBe(false);
  });

  it('refuses a malformed token with null header', async () => {
    expect(await verifyAccessJwt('bnVsbA.e30.AA', config, certsFetch)).toEqual({
      ok: false,
      message: 'Token de autentificare greșit.',
    });
  });

  it.each(['abc', 'a.b', 'a.b.c.d', '%%%.e30.AA', `${encodeJson({ alg: 'RS256' })}.not-json.AA`])(
    'refuses %j as a malformed token',
    async (token) => {
      expect(await verifyAccessJwt(token, config, certsFetch)).toEqual({ ok: false, message: 'Token de autentificare greșit.' });
    },
  );

  it('refuses a token signed with an unknown key id', async () => {
    const token = await signer.sign(goodPayload(), { alg: 'RS256', kid: 'other' });
    expect(await verifyAccessJwt(token, config, certsFetch)).toEqual({
      ok: false,
      message: 'Cheie de autentificare necunoscută.',
    });
  });

  it('refuses a changed payload', async () => {
    const [head, , sig] = (await signer.sign(goodPayload())).split('.');
    const forged = `${head}.${encodeJson({ ...goodPayload(), email: 'intruder@example.com' })}.${sig}`;
    expect((await verifyAccessJwt(forged, config, certsFetch)).ok).toBe(false);
  });

  it('refuses an expired token', async () => {
    const token = await signer.sign({ ...goodPayload(), exp: nowSec() - 1 });
    expect(await verifyAccessJwt(token, config, certsFetch)).toEqual({ ok: false, message: 'Autentificarea a expirat.' });
  });

  it('refuses a token that is valid only later, with one minute of leeway', async () => {
    const later = await signer.sign({ ...goodPayload(), nbf: nowSec() + 120 });
    const almostNow = await signer.sign({ ...goodPayload(), nbf: nowSec() + 30 });
    expect(await verifyAccessJwt(later, config, certsFetch)).toEqual({
      ok: false,
      message: 'Autentificarea nu este încă validă.',
    });
    expect((await verifyAccessJwt(almostNow, config, certsFetch)).ok).toBe(true);
  });

  it('refuses a token for another audience or issuer', async () => {
    const otherAudience = await signer.sign({ ...goodPayload(), aud: ['other'] });
    const otherIssuer = await signer.sign({ ...goodPayload(), iss: 'https://evil.example' });
    expect((await verifyAccessJwt(otherAudience, config, certsFetch)).ok).toBe(false);
    expect((await verifyAccessJwt(otherIssuer, config, certsFetch)).ok).toBe(false);
  });

  it('refuses a token without an email', async () => {
    const { email: _ignored, ...payload } = goodPayload();
    expect((await verifyAccessJwt(await signer.sign(payload), config, certsFetch)).ok).toBe(false);
  });
});

describe('verifyAccessJwt key downloads', () => {
  it('downloads the keys again once when it meets an unknown key id', async () => {
    let calls = 0;
    const rotatingFetch: FetchLike = async () => {
      calls += 1;
      return Response.json({ keys: calls === 1 ? [] : [signer.publicJwk] });
    };
    expect((await verifyAccessJwt(await signer.sign(goodPayload()), config, rotatingFetch)).ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('forces at most one download per 30 seconds for unknown key ids', async () => {
    let calls = 0;
    const countingFetch: FetchLike = async () => {
      calls += 1;
      return Response.json({ keys: [signer.publicJwk] });
    };
    const unknownA = await signer.sign(goodPayload(), { alg: 'RS256', kid: 'made-up-a' });
    const unknownB = await signer.sign(goodPayload(), { alg: 'RS256', kid: 'made-up-b' });
    await verifyAccessJwt(unknownA, config, countingFetch);
    await verifyAccessJwt(unknownB, config, countingFetch);
    expect(calls).toBe(2);
  });

  it('reports a failed key download as unavailable, without throwing', async () => {
    const failingFetch: FetchLike = async () => new Response('down', { status: 503 });
    expect(await verifyAccessJwt(await signer.sign(goodPayload()), config, failingFetch)).toEqual({
      ok: false,
      message: 'Nu pot verifica autentificarea acum.',
      unavailable: true,
    });
  });

  it('keeps using the downloaded keys when a later download fails', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    let up = true;
    const flakyFetch: FetchLike = async () => (up ? Response.json({ keys: [signer.publicJwk] }) : new Response('down', { status: 503 }));
    expect((await verifyAccessJwt(await signer.sign(goodPayload()), config, flakyFetch)).ok).toBe(true);
    up = false;
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    expect((await verifyAccessJwt(await signer.sign(goodPayload()), config, flakyFetch)).ok).toBe(true);
  });
});

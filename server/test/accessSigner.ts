// Makes Cloudflare Access style login tokens for tests: an RSA key pair made
// in the test, its public key as the team's published key (kid "key-1"), and
// a sign() that builds RS256 tokens.

export interface AccessSigner {
  publicJwk: JsonWebKey & { kid: string };
  sign(payload: Record<string, unknown>, header?: Record<string, unknown>): Promise<string>;
}

export function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const encodeJson = (value: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(value)));

export async function makeAccessSigner(): Promise<AccessSigner> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const publicJwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'key-1' };
  return {
    publicJwk,
    async sign(payload, header = { alg: 'RS256', kid: 'key-1' }) {
      const input = `${encodeJson(header)}.${encodeJson(payload)}`;
      const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(input));
      return `${input}.${base64Url(new Uint8Array(signature))}`;
    },
  };
}

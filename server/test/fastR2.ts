import type { R2Bucket } from '@cloudflare/workers-types';

// An R2 bucket for tests, in this process, on a Map. It keeps a copy of the
// bytes and what the server code reads of an object: its body, size and
// metadata. list() is sorted by key and never truncated.

interface Stored {
  bytes: Uint8Array;
  httpMetadata: Record<string, string>;
  customMetadata: Record<string, string>;
  uploaded: Date;
}

interface PutOptions {
  httpMetadata?: Record<string, string>;
  customMetadata?: Record<string, string>;
}

async function bytesOf(value: unknown): Promise<Uint8Array> {
  if (value === null || value === undefined) return new Uint8Array();
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
  // R2 refuses a stream whose length it does not know; the API stores bytes.
  if (value instanceof ReadableStream) throw new TypeError('Provided readable stream must have a known length (request/response body or readable half of FixedLengthStream)');
  throw new Error('fastR2: this kind of value is not supported');
}

function objectOf(key: string, stored: Stored) {
  return {
    key,
    version: '1',
    size: stored.bytes.byteLength,
    etag: 'etag',
    httpEtag: '"etag"',
    uploaded: stored.uploaded,
    httpMetadata: { ...stored.httpMetadata },
    customMetadata: { ...stored.customMetadata },
    checksums: {},
    storageClass: 'Standard',
    writeHttpMetadata(headers: Headers) {
      if (stored.httpMetadata.contentType) headers.set('Content-Type', stored.httpMetadata.contentType);
    },
  };
}

function bodyOf(key: string, stored: Stored) {
  const copy = () => stored.bytes.slice();
  return {
    ...objectOf(key, stored),
    get body() {
      return new Response(copy()).body;
    },
    bodyUsed: false,
    arrayBuffer: async () => copy().buffer,
    bytes: async () => copy(),
    text: async () => new TextDecoder().decode(stored.bytes),
    json: async () => JSON.parse(new TextDecoder().decode(stored.bytes)),
    blob: async () => new Blob([copy()]),
  };
}

export function fastR2(): R2Bucket {
  const objects = new Map<string, Stored>();
  const bucket = {
    async put(key: string, value: unknown, options: PutOptions = {}) {
      const stored: Stored = {
        bytes: await bytesOf(value),
        httpMetadata: { ...options.httpMetadata },
        customMetadata: { ...options.customMetadata },
        uploaded: new Date(),
      };
      objects.set(key, stored);
      return objectOf(key, stored);
    },
    async get(key: string) {
      const stored = objects.get(key);
      return stored ? bodyOf(key, stored) : null;
    },
    async head(key: string) {
      const stored = objects.get(key);
      return stored ? objectOf(key, stored) : null;
    },
    async delete(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys];
      // R2 takes at most 1000 keys per call (deleteFiles in server/uploads.ts cuts them).
      if (list.length > 1000) throw new Error('delete: You can only delete up to 1000 keys at once.');
      for (const key of list) objects.delete(key);
    },
    async list(options: { prefix?: string } = {}) {
      const listed = [...objects.entries()]
        .filter(([key]) => !options.prefix || key.startsWith(options.prefix))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, stored]) => objectOf(key, stored));
      return { objects: listed, truncated: false, delimitedPrefixes: [] };
    },
  };
  return bucket as unknown as R2Bucket;
}

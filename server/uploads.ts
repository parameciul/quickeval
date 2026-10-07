import type { R2Bucket, R2ObjectBody } from '@cloudflare/workers-types';
import type { Context } from 'hono';
import { EMPTY_FILE, FILE_TOO_BIG, looksLike, MAX_FILE_BYTES } from '../shared/files.ts';
import { ApiError } from './errors.ts';

export interface UploadedFile {
  bytes: ArrayBuffer;
  contentType: string;
  name: string;
}

function tooBig(): ApiError {
  return new ApiError(413, 'file_too_big', FILE_TOO_BIG);
}

// The original file name from the X-File-Name header, which the apps send
// URI-encoded (names have diacritics). Without folders, control characters,
// or extra spaces; at most 200 characters; "fisier" when nothing is left.
export function fileNameHeader(raw: string | undefined): string {
  let name: string;
  try {
    name = decodeURIComponent(raw ?? '');
  } catch {
    name = '';
  }
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
  return clean || 'fisier';
}

// Reads a raw file upload. The Content-Type must be one of `allowedTypes` and
// match the file's first bytes; the size must be 1 byte to 25 MB. The body is
// read whole: wrangler's local engine (used by the tests) refuses to store a
// stream of unknown length, and buffering 25 MB is still light work.
export async function readUpload(c: Context, allowedTypes: readonly string[], wrongTypeMessage: string): Promise<UploadedFile> {
  const contentType = (c.req.header('Content-Type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!allowedTypes.includes(contentType)) throw new ApiError(415, 'bad_file_type', wrongTypeMessage);
  const declared = Number(c.req.header('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) throw tooBig();

  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) throw new ApiError(400, 'empty_file', EMPTY_FILE);
  if (bytes.byteLength > MAX_FILE_BYTES) throw tooBig();
  if (!looksLike(contentType, new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)))) {
    throw new ApiError(415, 'bad_file_type', wrongTypeMessage);
  }
  return { bytes, contentType, name: fileNameHeader(c.req.header('X-File-Name')) };
}

// RFC 5987 encoding for filename*: encodeURIComponent leaves ' ( ) * as they are.
function encodeHeaderValue(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

// Streams a stored file to the browser under its original name. Only our own
// pages may show it in a frame, and it is never cached.
export function fileResponse(object: R2ObjectBody, name: string, contentType: string): Response {
  return new Response(object.body as unknown as ReadableStream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(object.size),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeHeaderValue(name)}`,
      'Cache-Control': 'private, no-store',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  });
}

// Deletes stored files; R2 takes at most 1000 keys per call.
export async function deleteFiles(bucket: R2Bucket, keys: string[]): Promise<void> {
  for (let start = 0; start < keys.length; start += 1000) {
    await bucket.delete(keys.slice(start, start + 1000));
  }
}

// Deletes files whose rows are already gone. A failure only leaves orphan
// files in R2, so it is logged and the request still succeeds.
export async function deleteFilesQuietly(bucket: R2Bucket, keys: string[]): Promise<void> {
  try {
    await deleteFiles(bucket, keys);
  } catch (err) {
    console.error('File delete failed:', err instanceof Error ? err.message : String(err));
  }
}

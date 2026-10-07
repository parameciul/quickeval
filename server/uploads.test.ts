import type { R2Bucket, R2ObjectBody } from '@cloudflare/workers-types';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { MAX_FILE_BYTES, PDF_TYPE, TEACHER_FILE_TYPES } from '../shared/files.ts';
import { ApiError } from './errors.ts';
import { deleteFiles, deleteFilesQuietly, fileNameHeader, fileResponse, readUpload } from './uploads.ts';

const WRONG_TYPE = 'Încarcă un fișier PDF sau Word (.docx).';
const pdfBytes = new TextEncoder().encode('%PDF-1.7 test');

function uploadApp() {
  const app = new Hono();
  app.onError((err, c) =>
    err instanceof ApiError ? c.json({ error: err.code, message: err.message }, err.status) : c.json({ error: 'internal' }, 500),
  );
  app.put('/file', async (c) => {
    const file = await readUpload(c, TEACHER_FILE_TYPES, WRONG_TYPE);
    return c.json({ name: file.name, type: file.contentType, size: file.bytes.byteLength });
  });
  return app;
}

const put = (body: BodyInit, headers: Record<string, string>) =>
  uploadApp().request('http://localhost/file', { method: 'PUT', body, headers });

describe('readUpload', () => {
  it('returns the bytes, the type, and the decoded original name', async () => {
    const res = await put(pdfBytes, { 'Content-Type': PDF_TYPE, 'X-File-Name': encodeURIComponent('Barem ședința 1.pdf') });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Barem ședința 1.pdf', type: PDF_TYPE, size: pdfBytes.length });
  });

  it('refuses a type that is not allowed', async () => {
    const res = await put(new TextEncoder().encode('<html>'), { 'Content-Type': 'text/html' });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'bad_file_type', message: WRONG_TYPE });
  });

  it('refuses a file whose bytes do not match its type', async () => {
    const res = await put(new TextEncoder().encode('not a pdf'), { 'Content-Type': PDF_TYPE });
    expect(res.status).toBe(415);
  });

  it('refuses an empty file', async () => {
    const res = await put(new Uint8Array(0), { 'Content-Type': PDF_TYPE });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Fișierul este gol.');
  });

  it('refuses a declared size over 25 MB before reading the body', async () => {
    const res = await put(pdfBytes, { 'Content-Type': PDF_TYPE, 'Content-Length': String(MAX_FILE_BYTES + 1) });
    expect(res.status).toBe(413);
    expect((await res.json()).message).toBe('Fișierul are peste 25 MB.');
  });

  it('refuses a body over 25 MB even without a declared size', async () => {
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big.set(pdfBytes);
    const res = await put(big, { 'Content-Type': PDF_TYPE });
    expect(res.status).toBe(413);
  });
});

describe('fileNameHeader', () => {
  it('decodes the name and drops folders, control characters, and extra spaces', () => {
    expect(fileNameHeader(encodeURIComponent('C:\\fakepath\\Poză  1.jpg'))).toBe('Poză 1.jpg');
    expect(fileNameHeader(encodeURIComponent('a\u0007b.pdf'))).toBe('ab.pdf');
  });

  it('falls back to "fisier" for a missing or broken name', () => {
    expect(fileNameHeader(undefined)).toBe('fisier');
    expect(fileNameHeader('%E0%A4%A')).toBe('fisier');
    expect(fileNameHeader(encodeURIComponent('   '))).toBe('fisier');
  });

  it('keeps at most 200 characters', () => {
    expect(fileNameHeader('a'.repeat(300))).toHaveLength(200);
  });
});

describe('fileResponse', () => {
  it('streams the file inline under its original name, never cached, framed only by our pages', async () => {
    const object = { body: new Blob(['%PDF-1.7']).stream(), size: 8 } as unknown as R2ObjectBody;
    const res = fileResponse(object, "Lucrare (finală)'s.pdf", PDF_TYPE);
    expect(res.headers.get('Content-Type')).toBe(PDF_TYPE);
    expect(res.headers.get('Content-Length')).toBe('8');
    expect(res.headers.get('Content-Disposition')).toBe("inline; filename*=UTF-8''Lucrare%20%28final%C4%83%29%27s.pdf");
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(await res.text()).toBe('%PDF-1.7');
  });
});

describe('deleteFilesQuietly', () => {
  it('logs a failed delete instead of throwing', async () => {
    const bucket = {
      delete: async () => {
        throw new Error('R2 down');
      },
    } as unknown as R2Bucket;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(deleteFilesQuietly(bucket, ['a'])).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalledWith('File delete failed:', 'R2 down');
    errors.mockRestore();
  });
});

describe('deleteFiles', () => {
  it('deletes in groups of at most 1000 keys and skips an empty list', async () => {
    const calls: string[][] = [];
    const bucket = { delete: async (keys: string[]) => void calls.push(keys) } as unknown as R2Bucket;
    await deleteFiles(bucket, Array.from({ length: 2500 }, (_, i) => `k${i}`));
    expect(calls.map((keys) => keys.length)).toEqual([1000, 1000, 500]);
    calls.length = 0;
    await deleteFiles(bucket, []);
    expect(calls).toEqual([]);
  });
});

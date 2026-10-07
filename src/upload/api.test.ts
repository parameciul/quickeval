import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../ui/ApiError.ts';
import { createUploadClient, type UploadRequest } from './api.ts';

const TOKEN = 'abcdefghijkmnop2';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// A stand-in for XMLHttpRequest that records what it was given and answers
// when the test calls finish() or fail().
class FakeRequest implements UploadRequest {
  upload: UploadRequest['upload'] = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  status = 0;
  responseText = '';
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: Blob | null = null;
  private answerType = '';

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getResponseHeader(name: string) {
    return name.toLowerCase() === 'content-type' ? this.answerType : null;
  }
  send(body: Blob) {
    this.body = body;
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ loaded, total, lengthComputable: true });
  }
  finish(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.answerType = 'application/json';
    this.onload?.();
  }
  fail() {
    this.onerror?.();
  }
}

describe('createUploadClient', () => {
  it('asks for the link page without a session', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, { test: {}, students: [] }));
    await createUploadClient({ fetchImpl }).getLink(TOKEN);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`/api/u/${TOKEN}`);
    expect(init!.method).toBe('GET');
    expect(init!.headers).not.toHaveProperty('X-Upload-Session');
  });

  it('sends the saved secret when it starts a session', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, { session: { files: [] } }));
    await createUploadClient({ fetchImpl }).startSession(TOKEN, 10, 'saved-secret');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`/api/u/${TOKEN}/sessions`);
    expect(init!.body).toBe(JSON.stringify({ studentId: 10 }));
    expect(init!.headers).toMatchObject({ 'X-Upload-Session': 'saved-secret', 'Content-Type': 'application/json' });
  });

  it('turns an error answer into an ApiError with the server message', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(409, { error: 'other_device', message: 'Încărcarea a început pe alt telefon. Roagă profesorul să o reseteze.' }),
    );
    const error = await createUploadClient({ fetchImpl })
      .startSession(TOKEN, 10, null)
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'other_device' });
  });

  it('reports a dropped connection in Romanian', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(createUploadClient({ fetchImpl }).getLink(TOKEN)).rejects.toMatchObject({
      code: 'network',
      message: 'Nu mă pot conecta la server. Verifică internetul și încearcă din nou.',
    });
  });

  it('uploads a file raw, with progress, and returns the stored file', async () => {
    const request = new FakeRequest();
    const client = createUploadClient({ newRequest: () => request });
    const photo = new Blob(['jpeg'], { type: 'image/jpeg' });
    const progress: number[] = [];
    const done = client.uploadFile(TOKEN, 'secret', photo, 'Poză 1.jpg', (sent) => progress.push(sent));

    expect(request.method).toBe('PUT');
    expect(request.url).toBe(`/api/u/${TOKEN}/files`);
    expect(request.headers).toEqual({ 'Content-Type': 'image/jpeg', 'X-File-Name': 'Poz%C4%83%201.jpg', 'X-Upload-Session': 'secret' });
    expect(request.body).toBe(photo);
    request.progress(50, 100);
    request.progress(100, 100);
    const file = { id: 3, name: 'Poză 1.jpg', contentType: 'image/jpeg', size: 4, position: 1 };
    request.finish(201, { file });
    expect(await done).toEqual(file);
    expect(progress).toEqual([0.5, 1]);
  });

  it('reports a refused upload with the server message, and a dropped one as a network error', async () => {
    const refused = new FakeRequest();
    const first = createUploadClient({ newRequest: () => refused }).uploadFile(TOKEN, 's', new Blob(['x']), 'a.heic', () => {});
    refused.finish(415, { error: 'bad_file_type', message: 'Trimite poze JPG sau PDF.' });
    await expect(first).rejects.toMatchObject({ status: 415, message: 'Trimite poze JPG sau PDF.' });

    const dropped = new FakeRequest();
    const second = createUploadClient({ newRequest: () => dropped }).uploadFile(TOKEN, 's', new Blob(['x']), 'a.jpg', () => {});
    dropped.fail();
    await expect(second).rejects.toMatchObject({ code: 'network' });
  });

  it('reports a stopped upload and an answer it cannot read as a network error', async () => {
    const stopped = new FakeRequest();
    const first = createUploadClient({ newRequest: () => stopped }).uploadFile(TOKEN, 's', new Blob(['x']), 'a.jpg', () => {});
    stopped.onabort?.();
    await expect(first).rejects.toMatchObject({ code: 'network' });

    const odd = new FakeRequest();
    const second = createUploadClient({ newRequest: () => odd }).uploadFile(TOKEN, 's', new Blob(['x']), 'a.jpg', () => {});
    odd.status = 0;
    odd.onload?.();
    await expect(second).rejects.toMatchObject({ code: 'network' });
  });

  it('names the routes for files and for the confirmation', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, { fileCount: 2, session: {} }));
    const client = createUploadClient({ fetchImpl });
    await client.getSession(TOKEN, 's');
    await client.deleteFile(TOKEN, 's', 7);
    await client.confirm(TOKEN, 's');
    expect(fetchImpl.mock.calls.map(([url, init]) => `${init!.method} ${String(url)}`)).toEqual([
      `GET /api/u/${TOKEN}/files`,
      `DELETE /api/u/${TOKEN}/files/7`,
      `POST /api/u/${TOKEN}/confirm`,
    ]);
  });

  it('downloads a sent file with the session secret', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response('jpeg bytes', { status: 200 }));
    const blob = await createUploadClient({ fetchImpl }).fileBlob(TOKEN, 's', 7);
    expect(await blob.text()).toBe('jpeg bytes');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`/api/u/${TOKEN}/files/7`);
    expect(init!.headers).toEqual({ 'X-Upload-Session': 's' });
  });
});

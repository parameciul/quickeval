import { describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { ApiError } from '../ui/ApiError.ts';
import { createTryClient, pageFileUrl, tryBase } from './api.ts';

const TOKEN = 'abcdefghijkmnopqrstuvwxyz2345672';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('createTryClient', () => {
  it("calls the try's own routes under its link", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, { code: 'PROBA-26T1', files: [], status: 'evaluating', deleted: true, result: { testCode: 'PROBA-26T1' } }),
    );
    const api = createTryClient(TOKEN, { fetchImpl });
    await api.info();
    await api.listPages();
    await api.deletePage(4);
    await api.start(3);
    await api.start();
    await api.result();
    expect(await api.deleteTry()).toEqual({ counted: true });
    expect(fetchImpl.mock.calls.map(([url, init]) => `${init!.method} ${String(url)}`)).toEqual([
      `GET /api/try/${TOKEN}`,
      `GET /api/try/${TOKEN}/paper`,
      `DELETE /api/try/${TOKEN}/paper/4`,
      `POST /api/try/${TOKEN}/start`,
      `POST /api/try/${TOKEN}/start`,
      `GET /api/try/${TOKEN}/result`,
      `DELETE /api/try/${TOKEN}`,
    ]);
    expect(fetchImpl.mock.calls[3]![1]!.body).toBe(JSON.stringify({ filesVersion: 3 }));
    expect(fetchImpl.mock.calls[4]![1]!.body).toBe(JSON.stringify({}));
  });

  it('sends a page raw, with its type and its encoded name', async () => {
    const stored = { id: 9, name: 'Pagina ș.pdf', contentType: PDF_TYPE, size: 3, position: 1 };
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse(201, { file: stored }));
    const file = new File(['%PDF'], 'Pagina ș.pdf', { type: PDF_TYPE });
    expect(await createTryClient(TOKEN, { fetchImpl }).addPage(file)).toEqual(stored);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`/api/try/${TOKEN}/paper`);
    expect(init!.method).toBe('PUT');
    expect(init!.body).toBe(file);
    expect(init!.headers).toMatchObject({ 'Content-Type': PDF_TYPE, 'X-File-Name': 'Pagina%20%C8%99.pdf' });
  });

  it('turns a refusal into an ApiError with its code, and a dropped connection into a network error', async () => {
    const refused = createTryClient(TOKEN, { fetchImpl: async () => jsonResponse(410, { error: 'expired', message: 'Încercarea a expirat.' }) });
    await expect(refused.info()).rejects.toMatchObject({ status: 410, code: 'expired', message: 'Încercarea a expirat.' });
    const dropped = createTryClient(TOKEN, {
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const error = await dropped.listPages().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('network');
  });

  it("uploadPage puts the file to the try's paper with its name and reports progress", async () => {
    const stored = { id: 9, name: 'pagina ș.jpg', contentType: 'image/jpeg', size: 3, position: 1 };
    const headers: Record<string, string> = {};
    let opened = '';
    let body: Blob | null = null;
    const request = {
      upload: { onprogress: null as ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null },
      onload: null as (() => void) | null,
      onerror: null,
      onabort: null,
      ontimeout: null,
      status: 201,
      responseText: JSON.stringify({ file: stored }),
      open: (method: string, url: string) => {
        opened = `${method} ${url}`;
      },
      setRequestHeader: (name: string, value: string) => {
        headers[name] = value;
      },
      getResponseHeader: () => 'application/json',
      send(file: Blob) {
        body = file;
        this.upload.onprogress?.({ loaded: 1, total: 2, lengthComputable: true });
        this.onload?.();
      },
    };
    const api = createTryClient(TOKEN, { newRequest: () => request });
    const blob = new Blob(['jpg'], { type: 'image/jpeg' });
    const progress: number[] = [];
    expect(await api.uploadPage(blob, 'pagina ș.jpg', (sent) => progress.push(sent))).toEqual(stored);
    expect(opened).toBe(`PUT /api/try/${TOKEN}/paper`);
    expect(body).toBe(blob);
    expect(headers).toMatchObject({ 'Content-Type': 'image/jpeg', 'X-File-Name': 'pagina%20%C8%99.jpg' });
    expect(progress).toEqual([0.5]);
  });

  it('pageBlob throws the API error for a missing page', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse(404, { error: 'not_found', message: 'Nu am găsit fișierul.' }));
    await expect(createTryClient(TOKEN, { fetchImpl }).pageBlob(5)).rejects.toMatchObject({ status: 404, message: 'Nu am găsit fișierul.' });
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(`/api/try/${TOKEN}/paper/5`);

    const ok = createTryClient(TOKEN, { fetchImpl: async () => new Response('jpg', { status: 200, headers: { 'Content-Type': 'image/jpeg' } }) });
    expect(await (await ok.pageBlob(5)).text()).toBe('jpg');
  });

  it("builds the try's base and its page links", () => {
    expect(tryBase(TOKEN)).toBe(`/api/try/${TOKEN}`);
    expect(pageFileUrl(TOKEN, 12)).toBe(`/api/try/${TOKEN}/paper/12`);
  });
});

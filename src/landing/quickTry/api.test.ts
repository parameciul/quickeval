import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../ui/ApiError.ts';
import { createLandingApi } from './api.ts';

const TOKEN = 'abcdefghijkmnopqrstuvwxyz2345672';

function fakeFetch(answer: unknown = {}, status = 200) {
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json(answer, { status }));
}

describe("the landing page's client", () => {
  it('reads the availability and makes a try with the Turnstile answer', async () => {
    const fetchImpl = fakeFetch({ token: TOKEN, code: 'PROBA-26T1' });
    const api = createLandingApi(fetchImpl);
    await api.availability();
    expect(await api.create('raspuns')).toEqual({ token: TOKEN, code: 'PROBA-26T1' });
    expect(fetchImpl.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ['/api/try/availability', 'GET'],
      ['/api/try', 'POST'],
    ]);
    expect(JSON.parse(fetchImpl.mock.calls[1]![1]!.body as string)).toEqual({ turnstileToken: 'raspuns' });
  });

  it("sends the files and the start to the try's own link", async () => {
    const fetchImpl = fakeFetch({});
    const api = createLandingApi(fetchImpl);
    const pdf = new File(['%PDF'], 'test.pdf', { type: 'application/pdf' });
    const photo = new File(['jpg'], 'pagina 1.jpg', { type: 'image/jpeg' });
    await api.uploadTestFile(TOKEN, 'PROBA-26T1', 'test', pdf);
    await api.generateBarem(TOKEN, 'PROBA-26T1');
    await api.addPage(TOKEN, photo);
    await api.start(TOKEN);
    await api.getTest(TOKEN, 'PROBA-26T1');
    expect(fetchImpl.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [`/api/try/${TOKEN}/tests/PROBA-26T1/files/test`, 'PUT'],
      [`/api/try/${TOKEN}/tests/PROBA-26T1/barem/generate`, 'POST'],
      [`/api/try/${TOKEN}/paper`, 'PUT'],
      [`/api/try/${TOKEN}/start`, 'POST'],
      [`/api/try/${TOKEN}/tests/PROBA-26T1`, 'GET'],
    ]);
    const page = fetchImpl.mock.calls[2]![1]!;
    expect(page.body).toBe(photo);
    expect(new Headers(page.headers).get('X-File-Name')).toBe('pagina%201.jpg');
    expect(new Headers(page.headers).get('Content-Type')).toBe('image/jpeg');
  });

  it("gives the server's refusal as an ApiError with its message", async () => {
    const api = createLandingApi(fakeFetch({ error: 'quick_try_daily_limit', message: 'Limita de încercări gratuite pentru azi a fost atinsă.' }, 429));
    await expect(api.create('x')).rejects.toEqual(new ApiError(429, 'quick_try_daily_limit', 'Limita de încercări gratuite pentru azi a fost atinsă.'));
  });

  it('says so when there is no network', async () => {
    const api = createLandingApi(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(api.availability()).rejects.toMatchObject({ code: 'network' });
  });
});

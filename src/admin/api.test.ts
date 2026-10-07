import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCX_TYPE } from '../../shared/files.ts';
import { ApiError, createApiClient, LoginExpiredError, reloadForLogin, submissionFileUrl, testFileUrl } from './api.ts';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('createApiClient', () => {
  it('asks for the classes of a school year and returns them', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { classes: [{ id: 1, name: '6E2' }] }));
    const api = createApiClient({ fetchImpl });
    expect(await api.listClasses(2026)).toEqual([{ id: 1, name: '6E2' }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/admin/classes?year=2026',
      expect.objectContaining({ method: 'GET', redirect: 'manual', credentials: 'same-origin' }),
    );
  });

  it('sends JSON bodies', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(201, { class: { id: 2, name: '7E2' } }),
    );
    const api = createApiClient({ fetchImpl });
    await api.createClass({ name: '7e2', schoolYear: 2026 });
    const init = fetchImpl.mock.calls[0]![1]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: '7e2', schoolYear: 2026 }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('turns an error answer into an ApiError with the server message', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(409, { error: 'class_exists', message: 'Clasa 6E2 există deja în anul școlar 2026-2027.' }),
    );
    const api = createApiClient({ fetchImpl });
    const error = await api.createClass({ name: '6E2', schoolYear: 2026 }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'class_exists', message: 'Clasa 6E2 există deja în anul școlar 2026-2027.' });
  });

  it('reloads for a new login when Access redirects', async () => {
    const redirect = { type: 'opaqueredirect', status: 0, ok: false, headers: new Headers() } as Response;
    const onLoginExpired = vi.fn();
    const api = createApiClient({ fetchImpl: vi.fn(async () => redirect), onLoginExpired });
    await expect(api.me()).rejects.toBeInstanceOf(LoginExpiredError);
    expect(onLoginExpired).toHaveBeenCalledTimes(1);
  });

  it('reports a non-JSON server error without reloading', async () => {
    const onLoginExpired = vi.fn();
    const fetchImpl = vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    const api = createApiClient({ fetchImpl, onLoginExpired });
    await expect(api.me()).rejects.toMatchObject({ code: 'bad_response' });
    expect(onLoginExpired).not.toHaveBeenCalled();
  });
});

describe('createApiClient tests and uploads', () => {
  it('sends a test file raw, with its type and its encoded name', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, { file: { name: 'Barem ș.docx', type: DOCX_TYPE } }),
    );
    const api = createApiClient({ fetchImpl });
    // A .docx on a PC without Word: the browser gives no type.
    const file = new File(['PK'], 'Barem ș.docx', { type: '' });
    expect(await api.uploadTestFile('6E2-26T1', 'barem', file)).toEqual({ name: 'Barem ș.docx', type: DOCX_TYPE });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('/api/admin/tests/6E2-26T1/files/barem');
    expect(init!.method).toBe('PUT');
    expect(init!.body).toBe(file);
    expect(init!.headers).toMatchObject({ 'Content-Type': DOCX_TYPE, 'X-File-Name': 'Barem%20%C8%99.docx' });
  });

  it('calls the test and upload routes', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, { tests: [], code: 'X' }));
    const api = createApiClient({ fetchImpl });
    await api.listTests(2026);
    await api.createTest({ classId: 1, title: 'Test' });
    await api.startTest('6E2-26T1');
    await api.reopenTest('6E2-26T1');
    await api.deleteTest('6E2-26T1');
    await api.resetSubmission(7);
    expect(fetchImpl.mock.calls.map(([url, init]) => `${init!.method} ${String(url)}`)).toEqual([
      'GET /api/admin/tests?year=2026',
      'POST /api/admin/tests',
      'POST /api/admin/tests/6E2-26T1/start',
      'POST /api/admin/tests/6E2-26T1/reopen',
      'DELETE /api/admin/tests/6E2-26T1',
      'POST /api/admin/submissions/7/reset',
    ]);
  });

  it('builds the links that open stored files', () => {
    expect(testFileUrl('6E2-26T1', 'test')).toBe('/api/admin/tests/6E2-26T1/files/test');
    expect(submissionFileUrl(7, 12)).toBe('/api/admin/submissions/7/files/12');
  });
});

describe('createApiClient failures', () => {
  it('reports a dropped connection in Romanian', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const api = createApiClient({ fetchImpl });
    const error = await api.me().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 0,
      code: 'network',
      message: 'Nu mă pot conecta la server. Verifică internetul și încearcă din nou.',
    });
  });

  it('reports a JSON answer with a broken body in Romanian', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{"classes": [', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const api = createApiClient({ fetchImpl });
    const error = await api.listClasses(2026).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 200,
      code: 'bad_response',
      message: 'Serverul nu a răspuns corect. Încearcă din nou.',
    });
  });

  it.each([401, 403])('reloads for a new login on a %i answer with an HTML body', async (status) => {
    const onLoginExpired = vi.fn();
    const fetchImpl = vi.fn(
      async () => new Response('<html>Sign in</html>', { status, headers: { 'Content-Type': 'text/html' } }),
    );
    const api = createApiClient({ fetchImpl, onLoginExpired });
    await expect(api.me()).rejects.toBeInstanceOf(LoginExpiredError);
    expect(onLoginExpired).toHaveBeenCalledTimes(1);
  });

  it('keeps a 401 answer with a JSON body as an ApiError', async () => {
    const onLoginExpired = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: 'unauthorized', message: 'Nu ești autentificat.' }));
    const api = createApiClient({ fetchImpl, onLoginExpired });
    await expect(api.me()).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
    expect(onLoginExpired).not.toHaveBeenCalled();
  });
});

describe('reloadForLogin', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reloads on the first call', () => {
    const reload = vi.fn();
    reloadForLogin(reload, () => 100_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload again within 10 seconds', () => {
    const reload = vi.fn();
    reloadForLogin(reload, () => 100_000);
    reloadForLogin(reload, () => 109_999);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again after 10 seconds', () => {
    const reload = vi.fn();
    reloadForLogin(reload, () => 100_000);
    reloadForLogin(reload, () => 110_000);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload when the storage is blocked', () => {
    const reload = vi.fn();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    reloadForLogin(reload, () => 100_000);
    expect(reload).not.toHaveBeenCalled();
  });
});

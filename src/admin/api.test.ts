import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, LoginExpiredError } from './api.ts';

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

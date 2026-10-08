import { describe, expect, it, vi } from 'vitest';
import { dispatchRobot } from './dispatch.ts';
import type { Env } from './env.ts';

const ENV = { GITHUB_REPO: 'parameciul/quickeval', GITHUB_DISPATCH_TOKEN: 'secret-token' } as Env;

describe('dispatchRobot', () => {
  it('sends the evaluate-now event to the repository', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await dispatchRobot(ENV, fetchImpl)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/parameciul/quickeval/dispatches');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"event_type":"evaluate-now"}');
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer secret-token');
    expect(headers.get('User-Agent')).toBe('QuickEval');
  });

  it('does nothing without the settings or with a wrong repository name', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await dispatchRobot({} as Env, fetchImpl)).toBe(false);
    expect(await dispatchRobot({ ...ENV, GITHUB_DISPATCH_TOKEN: ' ' }, fetchImpl)).toBe(false);
    expect(await dispatchRobot({ ...ENV, GITHUB_REPO: 'https://github.com/x/y' }, fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('answers false when GitHub refuses or does not answer', async () => {
    expect(await dispatchRobot(ENV, async () => new Response('{}', { status: 401 }))).toBe(false);
    expect(
      await dispatchRobot(ENV, async () => {
        throw new TypeError('network down');
      }),
    ).toBe(false);
  });
});

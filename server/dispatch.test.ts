import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { dispatchRobot } from './dispatch.ts';
import type { Env } from './env.ts';

const ENV = { GITHUB_REPO: 'parameciul/quickeval', GITHUB_DISPATCH_TOKEN: 'secret-token' } as Env;

describe('dispatchRobot', () => {
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  // The log line must never carry the token or the repository.
  const expectSafeLog = () => {
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('secret-token');
    expect(logged).not.toContain('parameciul');
  };

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
    expect(warn).not.toHaveBeenCalled();
  });

  it('does nothing without the settings or with a wrong repository name', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await dispatchRobot({} as Env, fetchImpl)).toBe(false);
    expect(await dispatchRobot({ ...ENV, GITHUB_DISPATCH_TOKEN: ' ' }, fetchImpl)).toBe(false);
    expect(await dispatchRobot({ ...ENV, GITHUB_REPO: 'https://github.com/x/y' }, fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('answers false and logs the status when GitHub refuses', async () => {
    const fetchImpl = async () => new Response('{"message":"Resource not accessible by personal access token"}', { status: 403 });
    expect(await dispatchRobot(ENV, fetchImpl)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('GitHub refused the robot dispatch: HTTP 403');
    expectSafeLog();
  });

  it('logs any answer other than 204, also a success code GitHub does not use here', async () => {
    expect(await dispatchRobot(ENV, async () => new Response('{}', { status: 200 }))).toBe(false);
    expect(warn).toHaveBeenCalledWith('GitHub refused the robot dispatch: HTTP 200');
  });

  it('answers false and logs only the error name when the request fails', async () => {
    const fetchImpl = async () => {
      throw new TypeError('fetch failed for https://api.github.com/repos/parameciul/quickeval/dispatches');
    };
    expect(await dispatchRobot(ENV, fetchImpl)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('GitHub robot dispatch failed: TypeError');
    expectSafeLog();
  });

  it('logs a time-out by its name', async () => {
    const fetchImpl = async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    };
    expect(await dispatchRobot(ENV, fetchImpl)).toBe(false);
    expect(warn).toHaveBeenCalledWith('GitHub robot dispatch failed: TimeoutError');
  });

  it('logs a thrown value that is not an error without its content', async () => {
    const fetchImpl = async () => {
      throw 'secret-token';
    };
    expect(await dispatchRobot(ENV, fetchImpl)).toBe(false);
    expect(warn).toHaveBeenCalledWith('GitHub robot dispatch failed: unknown error');
    expectSafeLog();
  });
});

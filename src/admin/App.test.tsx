import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api.ts';
import { shouldRetry } from './App.tsx';
import { goToSettings, viewTab } from './shell/viewing.ts';

describe('shouldRetry', () => {
  it('tries a failed read once more', () => {
    const error = new ApiError(500, 'server', 'x');
    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(false);
  });

  it('does not retry a view that ended', () => {
    expect(shouldRetry(0, new ApiError(409, 'impersonation_ended', 'x'))).toBe(false);
  });

  it('does not retry while the tab is leaving', () => {
    vi.spyOn(viewTab, 'leave').mockImplementation(() => {});
    goToSettings(false);
    expect(shouldRetry(0, new ApiError(500, 'server', 'x'))).toBe(false);
    vi.restoreAllMocks();
  });
});

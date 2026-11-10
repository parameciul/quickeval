import { describe, expect, it } from 'vitest';
import { ApiError } from '../ui/ApiError.ts';
import { tryQueryClient } from './queryClient.ts';

type Retry = (failureCount: number, error: unknown) => boolean;

describe("the try page's queries", () => {
  const retry = tryQueryClient().getDefaultOptions().queries?.retry as Retry;

  it('never asks again after a refusal, so a bad or expired link shows at once', () => {
    expect(retry(0, new ApiError(404, 'unknown_try', 'Linkul nu este bun.'))).toBe(false);
    expect(retry(0, new ApiError(410, 'expired', 'Încercarea a expirat.'))).toBe(false);
  });

  it('asks once more after a network or server error', () => {
    expect(retry(0, new Error('network'))).toBe(true);
    expect(retry(0, new ApiError(500, 'server_error', 'A apărut o eroare.'))).toBe(true);
    expect(retry(1, new Error('network'))).toBe(false);
  });
});

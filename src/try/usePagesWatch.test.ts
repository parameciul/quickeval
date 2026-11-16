import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PHONE_IDLE_MS, PHONE_REFRESH_MS } from '../../shared/quickTry.ts';
import { usePagesWatch } from './usePagesWatch.ts';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const watch = (open: boolean, pageCount: number) =>
  renderHook(({ open: isOpen, pageCount: count }) => usePagesWatch(isOpen, count), { initialProps: { open, pageCount } });

describe('usePagesWatch', () => {
  it('reads every 3 s while open', () => {
    const { result } = watch(true, 0);
    expect(result.current.interval).toBe(PHONE_REFRESH_MS);
    expect(result.current.idle).toBe(false);
  });

  it('is off while closed', () => {
    const { result } = watch(false, 0);
    expect(result.current.interval).toBe(false);
    act(() => vi.advanceTimersByTime(PHONE_IDLE_MS + 1));
    expect(result.current.idle).toBe(false);
  });

  it('goes idle 15 minutes after the last new page', () => {
    const { result } = watch(true, 0);
    act(() => vi.advanceTimersByTime(PHONE_IDLE_MS - 1));
    expect(result.current.idle).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.idle).toBe(true);
    expect(result.current.interval).toBe(false);
  });

  it('a new page count pushes the idle time back', () => {
    const { result, rerender } = watch(true, 0);
    act(() => vi.advanceTimersByTime(PHONE_IDLE_MS - 1000));
    rerender({ open: true, pageCount: 1 });
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.idle).toBe(false);
    act(() => vi.advanceTimersByTime(PHONE_IDLE_MS));
    expect(result.current.idle).toBe(true);
  });

  it('again() starts it anew', () => {
    const { result } = watch(true, 0);
    act(() => vi.advanceTimersByTime(PHONE_IDLE_MS));
    expect(result.current.idle).toBe(true);
    act(() => result.current.again());
    expect(result.current.idle).toBe(false);
    expect(result.current.interval).toBe(PHONE_REFRESH_MS);
    act(() => vi.advanceTimersByTime(PHONE_IDLE_MS));
    expect(result.current.idle).toBe(true);
  });

  it('starts anew when it opens again', () => {
    const { result, rerender } = watch(true, 0);
    act(() => vi.advanceTimersByTime(PHONE_IDLE_MS));
    rerender({ open: false, pageCount: 0 });
    rerender({ open: true, pageCount: 0 });
    expect(result.current.idle).toBe(false);
  });
});

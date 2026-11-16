import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionFile } from '../../../shared/api.ts';
import { watchPages } from './watch.ts';

const page = (id: number): SubmissionFile => ({ id, name: `p${id}.jpg`, contentType: 'image/jpeg', size: 10, position: id });
const REFRESH = 3000;
const IDLE = 15 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function start(read = vi.fn(async (): Promise<SubmissionFile[]> => []), visible = () => true) {
  const onPages = vi.fn();
  const onIdle = vi.fn();
  const watch = watchPages({ read, onPages, onIdle, isVisible: visible, refreshMs: REFRESH, idleMs: IDLE });
  return { read, onPages, onIdle, watch };
}

describe('watchPages', () => {
  it('reads at once and then every 3 s', async () => {
    const { read, onPages, watch } = start();
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    expect(onPages).toHaveBeenCalledWith([]);
    await vi.advanceTimersByTimeAsync(REFRESH);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(REFRESH);
    expect(read).toHaveBeenCalledTimes(3);
    watch.stop();
  });

  it('skips a tick while the tab is hidden', async () => {
    let visible = true;
    const { read, watch } = start(undefined, () => visible);
    await vi.advanceTimersByTimeAsync(0);
    visible = false;
    await vi.advanceTimersByTimeAsync(REFRESH * 2);
    expect(read).toHaveBeenCalledTimes(1);
    visible = true;
    await vi.advanceTimersByTimeAsync(REFRESH);
    expect(read).toHaveBeenCalledTimes(2);
    watch.stop();
  });

  it('keeps the last pages when a read fails and reads again at the next tick', async () => {
    const read = vi.fn(async (): Promise<SubmissionFile[]> => [page(1)]);
    const { onPages, watch } = start(read);
    await vi.advanceTimersByTimeAsync(0);
    read.mockRejectedValueOnce(new Error('offline'));
    await vi.advanceTimersByTimeAsync(REFRESH);
    expect(onPages).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(REFRESH);
    expect(read).toHaveBeenCalledTimes(3);
    expect(onPages).toHaveBeenCalledTimes(2);
    watch.stop();
  });

  it('calls onIdle after 15 minutes with no new page and stops', async () => {
    const { read, onIdle } = start();
    await vi.advanceTimersByTimeAsync(IDLE - 1);
    expect(onIdle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(REFRESH);
    expect(onIdle).toHaveBeenCalledTimes(1);
    const reads = read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(REFRESH * 5);
    expect(read).toHaveBeenCalledTimes(reads);
  });

  it('a new page pushes the idle time back', async () => {
    const read = vi.fn(async (): Promise<SubmissionFile[]> => []);
    const { onIdle, watch } = start(read);
    await vi.advanceTimersByTimeAsync(IDLE - REFRESH * 2);
    read.mockResolvedValue([page(1)]);
    await vi.advanceTimersByTimeAsync(REFRESH * 4);
    expect(onIdle).not.toHaveBeenCalled();
    watch.stop();
  });

  it('again() starts it anew', async () => {
    const { read, onIdle, watch } = start();
    await vi.advanceTimersByTimeAsync(IDLE + REFRESH);
    expect(onIdle).toHaveBeenCalledTimes(1);
    const reads = read.mock.calls.length;
    watch.again();
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(reads + 1);
    await vi.advanceTimersByTimeAsync(REFRESH);
    expect(read).toHaveBeenCalledTimes(reads + 2);
    watch.stop();
  });

  it('reads nothing after stop()', async () => {
    const { read, watch } = start();
    await vi.advanceTimersByTimeAsync(0);
    watch.stop();
    await vi.advanceTimersByTimeAsync(REFRESH * 5);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('ignores a read that answers after stop()', async () => {
    let answer: (pages: SubmissionFile[]) => void = () => {};
    const read = vi.fn(() => new Promise<SubmissionFile[]>((resolve) => (answer = resolve)));
    const { onPages, watch } = start(read);
    await vi.advanceTimersByTimeAsync(0);
    watch.stop();
    answer([page(1)]);
    await vi.advanceTimersByTimeAsync(0);
    expect(onPages).not.toHaveBeenCalled();
  });
});

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Viewing } from '../../../shared/api.ts';
import { createFakeApi } from '../../test/fakeApi.ts';
import { ApiProvider } from '../ApiContext.tsx';
import { ViewingBar } from './ViewingBar.tsx';
import * as viewing from './viewing.ts';

const VIEW: Viewing = { id: 1, teacher: { id: 3, name: 'Ana Pop' }, mode: 'view', expiresAt: '2099-11-25T12:32:00.000Z' };

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

function VersionProbe({ api }: { api: ReturnType<typeof createFakeApi> }) {
  useQuery({ queryKey: ['version'], queryFn: () => api.dataVersion(), refetchInterval: false });
  return null;
}

const bar = (api = createFakeApi({ classes: [], students: {} }), shown: Viewing = VIEW, inert = false) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ApiProvider api={api}>
      <QueryClientProvider client={queryClient}>
        <VersionProbe api={api} />
        <ViewingBar viewing={shown} inert={inert} />
      </QueryClientProvider>
    </ApiProvider>,
  );
  return api;
};

describe('ViewingBar', () => {
  it("shows the teacher's name, read only and the end time", () => {
    bar();
    expect(screen.getByText('Vezi contul lui Ana Pop · doar citire · până la 14:32')).toBeInTheDocument();
  });

  it('remembers the viewed name when it shows', () => {
    bar();
    expect(sessionStorage.getItem('quickeval.viewing')).toBe('Ana Pop');
  });

  it('ends the view and goes to Setări', async () => {
    const go = vi.spyOn(viewing, 'goToSettings').mockImplementation(() => {});
    const api = bar();
    await userEvent.click(screen.getByRole('button', { name: 'Ieși din vizualizare' }));
    expect(api.endView).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(false);
  });

  it('is unreachable while the search covers the page', () => {
    bar(undefined, VIEW, true);
    expect(screen.getByRole('region', { name: 'Vezi contul unui profesor' })).toHaveAttribute('inert');
  });

  it('asks the server again at its time and does not leave by itself', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-25T11:00:00.000Z'));
      const go = vi.spyOn(viewing, 'goToSettings').mockImplementation(() => {});
      const leave = vi.spyOn(viewing.viewTab, 'leave').mockImplementation(() => {});
      const api = bar(undefined, { ...VIEW, expiresAt: '2026-11-25T12:00:00.000Z' });
      await act(async () => {});
      const asked = api.dataVersion.mock.calls.length;
      await act(async () => {
        vi.advanceTimersByTime(59 * 60_000);
      });
      expect(api.dataVersion).toHaveBeenCalledTimes(asked);
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(api.dataVersion).toHaveBeenCalledTimes(asked + 1);
      expect(go).not.toHaveBeenCalled();
      expect(leave).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not ask after it was removed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-25T11:00:00.000Z'));
      const api = bar(undefined, { ...VIEW, expiresAt: '2026-11-25T12:00:00.000Z' });
      await act(async () => {});
      const asked = api.dataVersion.mock.calls.length;
      cleanup();
      vi.advanceTimersByTime(2 * 3_600_000);
      expect(api.dataVersion).toHaveBeenCalledTimes(asked);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows no ended notice when the minute check finds the view ended during the exit', async () => {
    const leave = vi.spyOn(viewing.viewTab, 'leave').mockImplementation(() => {});
    const api = createFakeApi({ classes: [], students: {} });
    api.endView.mockImplementation(async () => {
      viewing.goToSettings(true);
    });
    bar(api);
    await userEvent.click(screen.getByRole('button', { name: 'Ieși din vizualizare' }));
    expect(leave).toHaveBeenCalledTimes(1);
    expect(viewing.takeEndedName()).toBeNull();
  });

  it('goes to Setări also when ending the view fails', async () => {
    const go = vi.spyOn(viewing, 'goToSettings').mockImplementation(() => {});
    const api = createFakeApi({ classes: [], students: {} });
    api.endView.mockRejectedValue(new Error('network'));
    bar(api);
    await userEvent.click(screen.getByRole('button', { name: 'Ieși din vizualizare' }));
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(false);
  });
});

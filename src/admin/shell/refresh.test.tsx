import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, fakeTest } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { ApiProvider } from '../ApiContext.tsx';
import { useDataVersion, VERSION_CHECK_MS } from './refresh.ts';
import * as viewing from './viewing.ts';

const apiWithOneTest = () =>
  createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
    students: {},
    tests: [fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'evaluating' })],
  });

const minutePasses = () =>
  act(async () => {
    vi.advanceTimersByTime(VERSION_CHECK_MS);
  });

afterEach(() => {
  vi.useRealTimers();
});

describe('useDataVersion', () => {
  it('asks only the version every minute while nothing changed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const api = apiWithOneTest();
    renderAdmin('/', api);
    expect(await screen.findByRole('link', { name: 'Fracții' })).toBeInTheDocument();
    await waitFor(() => expect(api.dataVersion).toHaveBeenCalledTimes(1));
    const lists = api.listTests.mock.calls.length;
    await minutePasses();
    await waitFor(() => expect(api.dataVersion).toHaveBeenCalledTimes(2));
    await minutePasses();
    await waitFor(() => expect(api.dataVersion).toHaveBeenCalledTimes(3));
    expect(api.listTests).toHaveBeenCalledTimes(lists);
  });

  it('reads the page again once the version changed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const api = apiWithOneTest();
    renderAdmin('/', api);
    expect(await screen.findByRole('link', { name: 'Fracții' })).toBeInTheDocument();
    await waitFor(() => expect(api.dataVersion).toHaveBeenCalledTimes(1));
    const lists = api.listTests.mock.calls.length;
    const me = api.me.mock.calls.length;
    // The robot ends the grading and the server's number grows.
    api.dataVersion.mockResolvedValue('changed');
    await minutePasses();
    await waitFor(() => expect(api.listTests.mock.calls.length).toBeGreaterThan(lists));
    expect(api.me.mock.calls.length).toBeGreaterThan(me);
    // The next minute brings the same number: nothing is read again.
    const after = api.listTests.mock.calls.length;
    await minutePasses();
    await waitFor(() => expect(api.dataVersion).toHaveBeenCalledTimes(3));
    expect(api.listTests).toHaveBeenCalledTimes(after);
  });

  it('does not read the page a second time after the teacher\'s own save', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const api = apiWithOneTest();
    renderAdmin('/account', api);
    await userEvent.type(await screen.findByLabelText('Parola de acum'), 'parola-veche');
    await userEvent.type(screen.getByLabelText(/^Parola nouă/), 'parola-noua');
    await waitFor(() => expect(api.dataVersion).toHaveBeenCalledTimes(1));
    // The save changes the server's number.
    api.dataVersion.mockResolvedValue('after-save');
    await userEvent.click(screen.getByRole('button', { name: 'Schimbă parola' }));
    // The page reads its data again once, and asks the version at once.
    await waitFor(() => expect(api.listTests).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.dataVersion).toHaveBeenCalledTimes(2));
    await minutePasses();
    await waitFor(() => expect(api.dataVersion).toHaveBeenCalledTimes(3));
    expect(api.listTests).toHaveBeenCalledTimes(2);
    // A change after it, by the robot, is read as before.
    api.dataVersion.mockResolvedValue('robot');
    await minutePasses();
    await waitFor(() => expect(api.listTests).toHaveBeenCalledTimes(3));
  });

  it('compares the next answer after a failed question', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const api = apiWithOneTest();
    renderAdmin('/account', api);
    await userEvent.type(await screen.findByLabelText('Parola de acum'), 'parola-veche');
    await userEvent.type(screen.getByLabelText(/^Parola nouă/), 'parola-noua');
    await waitFor(() => expect(api.dataVersion).toHaveBeenCalledTimes(1));
    api.dataVersion.mockRejectedValueOnce(new Error('offline'));
    await userEvent.click(screen.getByRole('button', { name: 'Schimbă parola' }));
    await waitFor(() => expect(api.dataVersion).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.listTests).toHaveBeenCalledTimes(2));
    api.dataVersion.mockResolvedValue('robot');
    await minutePasses();
    await waitFor(() => expect(api.listTests).toHaveBeenCalledTimes(3));
  });

  it('asks nothing before the teacher is logged in', async () => {
    const api = apiWithOneTest();
    api.me.mockRejectedValue(new Error('down'));
    renderAdmin('/', api);
    await waitFor(() => expect(api.me).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(api.dataVersion).not.toHaveBeenCalled();
  });
});

// The view part of the version: a view began or ended, so the page loads anew.
function Probe({ reload, leave }: { reload: () => void; leave?: () => void }) {
  useDataVersion(true, reload, leave);
  const save = useMutation({ mutationFn: async () => 1 });
  return (
    <button type="button" onClick={() => save.mutate()}>
      Salvează
    </button>
  );
}

describe('useDataVersion and the view part', () => {
  const setup = (api: ReturnType<typeof apiWithOneTest>) => {
    const reload = vi.fn();
    const leave = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <ApiProvider api={api}>
        <QueryClientProvider client={queryClient}>
          <Probe reload={reload} leave={leave} />
        </QueryClientProvider>
      </ApiProvider>,
    );
    return { reload, leave, queryClient };
  };

  it('reloads when the view part of the version changes', async () => {
    const api = apiWithOneTest();
    api.dataVersion.mockResolvedValue('3||');
    const { reload, queryClient } = setup(api);
    await waitFor(() => expect(queryClient.getQueryData(['version'])).toBeDefined());
    await act(async () => {});
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    api.dataVersion.mockResolvedValue('3|||v7');
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['version'] });
    });
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('leaves for Setări instead of reloading when the view ended', async () => {
    const api = apiWithOneTest();
    api.dataVersion.mockResolvedValue('3|||v7');
    const { reload, leave, queryClient } = setup(api);
    await waitFor(() => expect(queryClient.getQueryData(['version'])).toBeDefined());
    await act(async () => {});
    api.dataVersion.mockResolvedValue('3||');
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['version'] });
    });
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
    expect(reload).not.toHaveBeenCalled();
  });

  it('does neither while the tab is already leaving', async () => {
    const api = apiWithOneTest();
    api.dataVersion.mockResolvedValue('3||');
    const { reload, leave, queryClient } = setup(api);
    await waitFor(() => expect(queryClient.getQueryData(['version'])).toBeDefined());
    await act(async () => {});
    vi.spyOn(viewing.viewTab, 'leave').mockImplementation(() => {});
    viewing.goToSettings(false);
    api.dataVersion.mockResolvedValue('3|||v7');
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['version'] });
    });
    await act(async () => {});
    expect(reload).not.toHaveBeenCalled();
    expect(leave).not.toHaveBeenCalled();
  });

  it('reloads when a view changes to another view', async () => {
    const api = apiWithOneTest();
    api.dataVersion.mockResolvedValue('3|||v7');
    const { reload, leave, queryClient } = setup(api);
    await waitFor(() => expect(queryClient.getQueryData(['version'])).toBeDefined());
    await act(async () => {});
    api.dataVersion.mockResolvedValue('3|||v8');
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['version'] });
    });
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(leave).not.toHaveBeenCalled();
  });

  it('reloads even right after a save', async () => {
    const api = apiWithOneTest();
    api.dataVersion.mockResolvedValue('3||');
    const { reload, queryClient } = setup(api);
    await waitFor(() => expect(queryClient.getQueryData(['version'])).toBeDefined());
    await act(async () => {});
    // The save succeeds, and the version it asks at once carries a new view part.
    api.dataVersion.mockResolvedValue('4|||v7');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('refreshes as before when only the data part changes', async () => {
    const api = apiWithOneTest();
    api.dataVersion.mockResolvedValue('3|||v7');
    const { reload, queryClient } = setup(api);
    await waitFor(() => expect(queryClient.getQueryData(['version'])).toBeDefined());
    await act(async () => {});
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    api.dataVersion.mockResolvedValue('4|||v7');
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['version'] });
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    expect(reload).not.toHaveBeenCalled();
  });
});

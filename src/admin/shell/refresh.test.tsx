import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, fakeTest } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { VERSION_CHECK_MS } from './refresh.ts';

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
    renderAdmin('/cont', api);
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
    renderAdmin('/cont', api);
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

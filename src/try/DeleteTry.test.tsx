import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETED_TRY_KEY, STORED_TRY_KEY } from '../landing/quickTry/storage.ts';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeTryApi, TRY_TOKEN } from '../test/fakeTryApi.tsx';
import { DeleteTry } from './DeleteTry.tsx';

const MADE_AT = '2026-11-10T07:20:00.000Z';

function setup(tryApi = createFakeTryApi()) {
  const goTo = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <DeleteTry tryApi={tryApi} token={TRY_TOKEN} madeAt={MADE_AT} goTo={goTo} />
    </QueryClientProvider>,
  );
  return { tryApi, goTo };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORED_TRY_KEY, JSON.stringify({ token: TRY_TOKEN, code: 'PROBA-26T1', madeAt: new Date().toISOString() }));
});

describe('"Șterge încercarea" on the try page', () => {
  it('asks once more before it deletes anything', async () => {
    const { tryApi } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Șterge' }));
    expect(screen.getByText('Sigur? Încercarea, lucrarea și linkul se șterg definitiv.')).toBeInTheDocument();
    expect(tryApi.deleteTry).not.toHaveBeenCalled();
  });

  it('goes back to the button with "Renunță"', async () => {
    const { tryApi } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Șterge' }));
    await userEvent.click(screen.getByRole('button', { name: 'Renunță' }));
    expect(screen.getByRole('button', { name: 'Șterge' })).toBeInTheDocument();
    expect(tryApi.deleteTry).not.toHaveBeenCalled();
  });

  it('deletes the try, keeps the day mark, forgets the link and goes to the landing page', async () => {
    const { tryApi, goTo } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Șterge' }));
    await userEvent.click(screen.getByRole('button', { name: 'Șterge definitiv' }));
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/'));
    expect(tryApi.deleteTry).toHaveBeenCalledOnce();
    expect(localStorage.getItem(DELETED_TRY_KEY)).toBe(MADE_AT);
    expect(localStorage.getItem(STORED_TRY_KEY)).toBeNull();
  });

  it('keeps no mark when the try had failed and so does not count', async () => {
    const tryApi = createFakeTryApi();
    tryApi.deleteTry.mockResolvedValue({ counted: false });
    const { goTo } = setup(tryApi);
    await userEvent.click(screen.getByRole('button', { name: 'Șterge' }));
    await userEvent.click(screen.getByRole('button', { name: 'Șterge definitiv' }));
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/'));
    expect(localStorage.getItem(DELETED_TRY_KEY)).toBeNull();
    expect(localStorage.getItem(STORED_TRY_KEY)).toBeNull();
  });

  it('keeps the try and says so when the delete fails', async () => {
    const tryApi = createFakeTryApi();
    tryApi.deleteTry.mockRejectedValue(new ApiError(500, 'internal', 'A apărut o eroare.'));
    const { goTo } = setup(tryApi);
    await userEvent.click(screen.getByRole('button', { name: 'Șterge' }));
    await userEvent.click(screen.getByRole('button', { name: 'Șterge definitiv' }));
    expect(await screen.findByText('A apărut o eroare.')).toBeInTheDocument();
    expect(goTo).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORED_TRY_KEY)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Șterge definitiv' })).toBeEnabled();
  });

  it('counts a link that is already gone as deleted', async () => {
    const tryApi = createFakeTryApi();
    tryApi.deleteTry.mockRejectedValue(new ApiError(404, 'unknown_try', 'Linkul nu este bun.'));
    const { goTo } = setup(tryApi);
    await userEvent.click(screen.getByRole('button', { name: 'Șterge' }));
    await userEvent.click(screen.getByRole('button', { name: 'Șterge definitiv' }));
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/'));
    expect(localStorage.getItem(STORED_TRY_KEY)).toBeNull();
  });

  it('leaves the stored try and the day mark alone when the deleted try is not the stored one', async () => {
    const other = 'zyxwvutsrqpnmkjihgfedcba2345672a';
    const stored = JSON.stringify({ token: other, code: 'PROBA-26T2', madeAt: new Date().toISOString() });
    localStorage.setItem(STORED_TRY_KEY, stored);
    const { goTo } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Șterge' }));
    await userEvent.click(screen.getByRole('button', { name: 'Șterge definitiv' }));
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/'));
    expect(localStorage.getItem(STORED_TRY_KEY)).toBe(stored);
    expect(localStorage.getItem(DELETED_TRY_KEY)).toBeNull();
  });

  it('marks nothing on a device that keeps no try (a shared link)', async () => {
    localStorage.clear();
    const { goTo } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Șterge' }));
    await userEvent.click(screen.getByRole('button', { name: 'Șterge definitiv' }));
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/'));
    expect(localStorage.getItem(DELETED_TRY_KEY)).toBeNull();
  });

  it('never replaces a later day mark with an earlier one', async () => {
    const later = '2026-11-12T07:20:00.000Z';
    localStorage.setItem(DELETED_TRY_KEY, later);
    const { goTo } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Șterge' }));
    await userEvent.click(screen.getByRole('button', { name: 'Șterge definitiv' }));
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/'));
    expect(localStorage.getItem(DELETED_TRY_KEY)).toBe(later);
  });

  it('moves the focus to "Șterge definitiv" when the question opens, and back to "Șterge" after "Renunță"', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Șterge' }));
    expect(screen.getByRole('button', { name: 'Șterge definitiv' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Șterge definitiv' })).toHaveAccessibleDescription('Sigur? Încercarea, lucrarea și linkul se șterg definitiv.');
    await userEvent.click(screen.getByRole('button', { name: 'Renunță' }));
    expect(screen.getByRole('button', { name: 'Șterge' })).toHaveFocus();
  });
});

import { focusManager } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeApi } from '../test/fakeApi.ts';
import { createFakeTryApi, renderTry, tryTest } from '../test/fakeTryApi.tsx';

const fakes = (data: Parameters<typeof createFakeTryApi>[0] = {}) => {
  const api = createFakeApi({ classes: [], students: {}, tests: [tryTest()] });
  return { api, tryApi: createFakeTryApi(data) };
};

describe("a Quick Try's page", () => {
  it("opens on the try's page, under the teacher pages' lockup", async () => {
    const { api, tryApi } = fakes();
    renderTry('/', api, tryApi);
    expect(await screen.findByRole('heading', { name: 'Încercare rapidă', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MQGrader by Laura Miron' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Corectezi o lucrare, fără cont. Linkul acestei pagini merge 7 zile.')).toBeInTheDocument();
  });

  it('says an expired try expired, and leads to a new one', async () => {
    const { api, tryApi } = fakes({ info: { expired: true } });
    renderTry('/', api, tryApi);
    expect(await screen.findByRole('heading', { name: 'Încercarea a expirat' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fă o încercare nouă' })).toHaveAttribute('href', '/');
  });

  it('says so when the link is not a try', async () => {
    const { api, tryApi } = fakes();
    tryApi.info.mockRejectedValue(new ApiError(404, 'unknown_try', 'Linkul nu este bun.'));
    renderTry('/', api, tryApi);
    expect(await screen.findByRole('heading', { name: 'Linkul nu este bun' })).toBeInTheDocument();
  });

  it('says an expired try expired when the test answers so', async () => {
    const { api, tryApi } = fakes();
    api.getTest.mockRejectedValue(new ApiError(410, 'expired', 'Încercarea a expirat.'));
    renderTry('/', api, tryApi);
    expect(await screen.findByRole('heading', { name: 'Încercarea a expirat' })).toBeInTheDocument();
  });

  it('comes back to the try from an address of the teacher app that it does not have', async () => {
    const { api, tryApi } = fakes();
    renderTry('/teste/PROBA-26T1/raport', api, tryApi);
    expect(await screen.findByRole('heading', { name: 'Încercare rapidă', level: 1 })).toBeInTheDocument();
  });
  it('says the try expired when its test answers so while the page is open', async () => {
    const api = createFakeApi({ classes: [], students: {}, tests: [tryTest({ status: 'evaluating' }, { status: 'submitted' })] });
    renderTry('/', api, createFakeTryApi());
    expect(await screen.findByRole('heading', { name: 'Lucrarea se corectează' })).toBeInTheDocument();
    api.getTest.mockRejectedValue(new ApiError(410, 'expired', 'Încercarea a expirat.'));
    refocus();
    expect(await screen.findByRole('heading', { name: 'Încercarea a expirat' })).toBeInTheDocument();
  });

  it('says the try expired when its info answers so while the page is open', async () => {
    const { api, tryApi } = fakes();
    renderTry('/', api, tryApi);
    expect(await screen.findByRole('heading', { name: 'Încercare rapidă', level: 1 })).toBeInTheDocument();
    tryApi.info.mockRejectedValue(new ApiError(410, 'expired', 'Încercarea a expirat.'));
    refocus();
    expect(await screen.findByRole('heading', { name: 'Încercarea a expirat' })).toBeInTheDocument();
  });
});

// The browser tab comes back into view: the page reads the try again.
function refocus() {
  act(() => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  focusManager.setFocused(undefined);
}

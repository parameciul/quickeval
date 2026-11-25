import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Viewing } from '../../../shared/api.ts';
import { createFakeApi } from '../../test/fakeApi.ts';
import { ApiProvider } from '../ApiContext.tsx';
import { ViewingBar } from './ViewingBar.tsx';
import * as viewing from './viewing.ts';

const VIEW: Viewing = { id: 1, teacher: { id: 3, name: 'Ana Pop' }, mode: 'view', expiresAt: '2026-11-25T12:32:00.000Z' };

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

const bar = (api = createFakeApi({ classes: [], students: {} })) => {
  render(
    <ApiProvider api={api}>
      <ViewingBar viewing={VIEW} />
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
    expect(go).toHaveBeenCalledWith(false);
  });

  it('goes to Setări also when ending the view fails', async () => {
    const go = vi.spyOn(viewing, 'goToSettings').mockImplementation(() => {});
    const api = createFakeApi({ classes: [], students: {} });
    api.endView.mockRejectedValue(new Error('network'));
    bar(api);
    await userEvent.click(screen.getByRole('button', { name: 'Ieși din vizualizare' }));
    expect(go).toHaveBeenCalledWith(false);
  });
});

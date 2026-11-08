import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';

function searchApi() {
  return createFakeApi({
    classes: [{ id: 1, name: '10B', schoolYear: 2026, archived: false, studentCount: 1 }],
    students: { 1: [{ id: 10, fullName: 'Ștefan Radu', active: true, canDelete: true }] },
  });
}

async function openPhone() {
  renderAdmin('/', searchApi(), <LocationProbe />);
  await screen.findByRole('navigation', { name: 'Meniu' });
  return screen.getByRole('button', { name: 'Caută' });
}

describe('the search on a phone', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 56.25rem)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has a magnifier beside ☰ in place of the box', async () => {
    const magnifier = await openPhone();
    expect(screen.queryByRole('combobox', { name: 'Caută elevi, clase și teste' })).not.toBeInTheDocument();
    expect(magnifier).toHaveAttribute('aria-expanded', 'false');
    expect(magnifier.nextElementSibling).toBe(screen.getByRole('button', { name: 'Mai mult' }));
  });

  it('opens the search over the whole screen, with the box ready, and ← closes it', async () => {
    const magnifier = await openPhone();
    await userEvent.click(magnifier);
    const layer = screen.getByRole('dialog', { name: 'Caută' });
    expect(magnifier).toHaveAttribute('aria-expanded', 'true');
    expect(magnifier).toHaveAttribute('aria-controls', layer.id);
    const box = within(layer).getByRole('combobox', { name: 'Caută elevi, clase și teste' });
    expect(box).toHaveFocus();
    expect(screen.getByRole('main', { hidden: true })).toHaveAttribute('inert');
    await userEvent.type(box, 'stef');
    expect(await within(layer).findByRole('option', { name: 'Ștefan Radu, Clasa 10B' })).toBeInTheDocument();
    // The list stays open while the focus moves inside the layer.
    await userEvent.click(within(layer).getByRole('button', { name: 'Închide căutarea' }));
    expect(screen.queryByRole('dialog', { name: 'Caută' })).not.toBeInTheDocument();
    expect(magnifier).toHaveFocus();
    expect(screen.getByRole('main')).not.toHaveAttribute('inert');
  });

  it('closes with Esc, even with the list open', async () => {
    const magnifier = await openPhone();
    await userEvent.click(magnifier);
    await userEvent.type(screen.getByRole('combobox', { name: 'Caută elevi, clase și teste' }), 'stef');
    await screen.findByRole('option', { name: 'Ștefan Radu, Clasa 10B' });
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Caută' })).not.toBeInTheDocument();
    expect(magnifier).toHaveFocus();
  });

  it('closes when a line opens its page', async () => {
    const magnifier = await openPhone();
    await userEvent.click(magnifier);
    await userEvent.type(screen.getByRole('combobox', { name: 'Caută elevi, clase și teste' }), 'stef');
    await userEvent.click(await screen.findByRole('option', { name: 'Ștefan Radu, Clasa 10B' }));
    await expectLocation('/elevi/10');
    expect(screen.queryByRole('dialog', { name: 'Caută' })).not.toBeInTheDocument();
  });

  it('closes the menu under ☰ when it opens', async () => {
    const magnifier = await openPhone();
    await userEvent.click(screen.getByRole('button', { name: 'Mai mult' }));
    expect(screen.getByRole('region', { name: 'Mai mult' })).toBeInTheDocument();
    await userEvent.click(magnifier);
    expect(screen.queryByRole('region', { name: 'Mai mult' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Caută' })).toBeInTheDocument();
  });
});

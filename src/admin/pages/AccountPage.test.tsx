import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, fakeTeacher } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { ApiError } from '../api.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AccountPage', () => {
  it('shows an administrator who is logged in, the counts and where Setări is', async () => {
    renderAdmin('/cont', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ testsEvaluated: 21, papersGraded: 596 }) }));
    const card = await screen.findByRole('region', { name: 'Contul tău' });
    expect(within(card).getByText('Administrator')).toHaveClass('tag-ok');
    expect(within(card).getByText('Laura Miron')).toBeInTheDocument();
    expect(within(card).getByText('profesor@example.com')).toBeInTheDocument();
    expect(within(card).getByText('LM')).toBeInTheDocument();
    expect(within(card).getByText('Teste corectate').nextElementSibling).toHaveTextContent('21');
    expect(within(card).getByText('Lucrări corectate').nextElementSibling).toHaveTextContent('596');
    expect(within(card).getByRole('link', { name: 'Setări' })).toHaveAttribute('href', '/setari');
    // No pay button: nothing is on sale.
    expect(screen.queryByRole('button', { name: /plătește|cumpără/i })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Parola' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ieșire' })).toHaveTextContent('Ieși din cont pe acest dispozitiv.');
  });

  it('shows a complete account with its counts and no link to Setări', async () => {
    renderAdmin('/cont', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', testsEvaluated: 1, papersGraded: 28 }) }));
    const card = await screen.findByRole('region', { name: 'Contul tău' });
    expect(within(card).getByText('Cont complet')).toBeInTheDocument();
    expect(within(card).getByText('Lucrări corectate').nextElementSibling).toHaveTextContent('28');
    expect(within(card).queryByRole('link', { name: 'Setări' })).not.toBeInTheDocument();
  });

  it('shows a demo account its one test and its papers, and what is left', async () => {
    renderAdmin('/cont', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 1, papersGraded: 18, papersWaiting: 2 }) }));
    const card = await screen.findByRole('region', { name: 'Contul tău' });
    expect(within(card).getByText('Cont demo')).not.toHaveClass('tag-ok');
    expect(within(card).getByText('Teste corectate').nextElementSibling).toHaveTextContent('1 din 1');
    expect(within(card).getByText('Lucrări corectate').nextElementSibling).toHaveTextContent('20 din 35');
    expect(card).toHaveTextContent('Mai ai 15 lucrări, pentru testul tău. Fiecare lucrare corectată se numără, și o recorectare.');
    expect(card.querySelector('.demo-meter.is-full')).toBeNull();
  });

  it('turns the papers meter orange and asks for a complete account when none are left', async () => {
    renderAdmin('/cont', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 3, papersGraded: 34, papersWaiting: 4 }) }));
    const card = await screen.findByRole('region', { name: 'Contul tău' });
    // A regrade counts the test again, but the account has one test.
    expect(within(card).getByText('Teste corectate').nextElementSibling).toHaveTextContent('1 din 1');
    expect(within(card).getByText('Lucrări corectate').nextElementSibling).toHaveTextContent('35 din 35');
    expect(within(card).getByText('Lucrări corectate').closest('.demo-meter')).toHaveClass('is-full');
    expect(card).toHaveTextContent('Ai folosit toate cele 35 de lucrări ale contului demo. Cere unui administrator un cont complet.');
  });

  it('changes the password', async () => {
    const api = createFakeApi();
    renderAdmin('/cont', api);
    await userEvent.type(await screen.findByLabelText('Parola de acum'), 'parola-veche');
    await userEvent.type(screen.getByLabelText(/^Parola nouă/), 'parola-noua');
    await userEvent.click(screen.getByRole('button', { name: 'Schimbă parola' }));
    expect(api.changePassword).toHaveBeenCalledWith('parola-veche', 'parola-noua');
    expect(await screen.findByRole('status')).toHaveTextContent('Parola a fost schimbată.');
    expect(screen.getByLabelText('Parola de acum')).toHaveValue('');
  });

  it('shows a refused password change', async () => {
    const api = createFakeApi();
    api.changePassword.mockRejectedValueOnce(new ApiError(400, 'wrong_password', 'Parola de acum nu este corectă.'));
    renderAdmin('/cont', api);
    await userEvent.type(await screen.findByLabelText('Parola de acum'), 'gresita');
    await userEvent.type(screen.getByLabelText(/^Parola nouă/), 'parola-noua');
    await userEvent.click(screen.getByRole('button', { name: 'Schimbă parola' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Parola de acum nu este corectă.');
  });

  it('logs out', async () => {
    const api = createFakeApi();
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign });
    renderAdmin('/cont', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Ieși din cont' }));
    expect(api.logout).toHaveBeenCalled();
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/teacher/'));
  });
});

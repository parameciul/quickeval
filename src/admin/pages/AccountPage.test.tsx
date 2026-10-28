import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, fakeTeacher } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { ApiError } from '../api.ts';
import { accountKindText } from './AccountPage.tsx';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AccountPage', () => {
  it('shows who is logged in and the kind of account', async () => {
    renderAdmin('/cont', createFakeApi());
    expect(await screen.findByText('Laura Miron (profesor@example.com)')).toBeInTheDocument();
    expect(screen.getByText('Ești administrator.')).toBeInTheDocument();
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
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/admin/'));
  });
});

describe('accountKindText', () => {
  it.each([
    [fakeTeacher(), 'Ești administrator.'],
    [fakeTeacher({ role: 'teacher' }), 'Ai un cont complet.'],
    [fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 1 }), 'Ai un cont demo: ai evaluat 1 din 5 teste.'],
    [fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 9 }), 'Ai un cont demo: ai evaluat 5 din 5 teste.'],
  ])('describes %j', (teacher, text) => {
    expect(accountKindText(teacher)).toBe(text);
  });
});
